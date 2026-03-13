const fs = require("fs");

module.exports = function registerCommands(app, config, backfillHistory, searchClient) {
  const { STATE_FILE, BANLIST_FILE, OWNER_USER_ID, ALLOWED_CHANNEL_IDS } = config;

  function isOwner(userId) {
    return userId === OWNER_USER_ID;
  }

  async function denyIfNotOwner(respond, userId) {
    if (isOwner(userId)) return false;
    await respond("You’re not allowed to use this command.");
    return true;
  }

  function loadState() {
    if (!fs.existsSync(STATE_FILE)) return { count: 0 };
    const lines = fs.readFileSync(STATE_FILE, "utf8").split(/\r?\n/);
    const [count] = (lines[1] || "0,0").split(",");
    return { count: parseInt(count, 10) || 0 };
  }

  function ensureBanFile() {
    if (!fs.existsSync(BANLIST_FILE)) {
      fs.writeFileSync(BANLIST_FILE, "# Banned users\n", "utf8");
    }
  }

  function loadBanSet() {
    ensureBanFile();
    const raw = fs.readFileSync(BANLIST_FILE, "utf8");
    return new Set(
      raw
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
    );
  }

  function saveBanSet(set) {
    const lines = ["# Banned users", ...Array.from(set)];
    fs.writeFileSync(BANLIST_FILE, lines.join("\n") + "\n", "utf8");
  }

  function parseMention(text) {
    const m = text.trim().match(/^<@([A-Z0-9]+)>$/i);
    return m ? m[1] : null;
  }

  function parseSearchArgs(text) {
    const trimmed = (text || "").trim();
    if (!trimmed) return null;

    const quoted = trimmed.match(/^"(.*)"\s+(\d+)$/);
    if (quoted) {
      return {
        term: quoted[1].trim(),
        days: parseInt(quoted[2], 10),
      };
    }

    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) return null;

    const days = parseInt(parts[parts.length - 1], 10);
    if (Number.isNaN(days)) return null;

    const term = parts.slice(0, -1).join(" ").trim();
    if (!term) return null;

    return { term, days };
  }

  function escapeForSlackSearch(text) {
    return text.replace(/"/g, '\\"');
  }

  function buildSlackSearchQuery(term, days, allowedChannelNames = []) {
    const after = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const quotedTerm = `"${escapeForSlackSearch(term)}"`;

    if (!allowedChannelNames.length) {
      return `${quotedTerm} after:${after}`;
    }

    const inParts = allowedChannelNames.map((name) => `in:${name}`);
    return `${quotedTerm} after:${after} (${inParts.join(" OR ")})`;
  }

  async function getAllowedChannelNames(client, allowedIds) {
    const names = [];

    for (const channelId of allowedIds) {
      try {
        const info = await client.conversations.info({ channel: channelId });
        const name = info.channel?.name;
        if (name) names.push(name);
      } catch {
        // ignoring channels that aren't resolved(bc perm issues or whatnot)
      }
    }

    return names;
  }

  async function countAllSearchResults(query) {
    let page = 1;
    let totalMatches = 0;
    const perChannel = new Map();

    while (true) {
      const res = await searchClient.search.messages({
        query,
        count: 100,
        page,
        sort: "timestamp",
        sort_dir: "desc",
      });

      const matches = res.messages?.matches || [];
      if (!matches.length) break;

      totalMatches += matches.length;

      for (const msg of matches) {
        const channelName = msg.channel?.name || "unknown";
        perChannel.set(channelName, (perChannel.get(channelName) || 0) + 1);
      }

      const paging = res.messages?.paging;
      if (!paging || page >= paging.pages) break;
      page += 1;
    }

    return {
      totalMatches,
      perChannel: Array.from(perChannel.entries())
        .map(([channelName, count]) => ({ channelName, count }))
        .sort((a, b) => b.count - a.count),
    };
  }

  app.command("/jaycount", async ({ ack, respond }) => {
    await ack();
    const state = loadState();
    await respond(`Total "jay dont": *${state.count}*`);
  });

  app.command("/jaycheck", async ({ ack, respond }) => {
    await ack();
    const state = loadState();
    await respond(`Total "jaydont": *${state.count}*`);
  });

  app.command("/jaybackfill", async ({ ack, respond, command }) => {
    await ack();
    if (await denyIfNotOwner(respond, command.user_id)) return;

    await respond("Rechecking history (backfill) now…");

    try {
      const result = await backfillHistory(app, config, { force: true });
      await respond(`Backfill done Total: *${result.total}*`);
    } catch (e) {
      await respond(`Backfill failed\n${e?.data || e?.message || e}`);
    }
  });

  app.command("/jayban", async ({ ack, respond, command }) => {
    await ack();
    if (await denyIfNotOwner(respond, command.user_id)) return;

    const userId = parseMention(command.text);
    if (!userId) return respond("Usage: `/jayban @user`");

    const set = loadBanSet();
    if (set.has(userId)) return respond("That user is already banned.");

    set.add(userId);
    saveBanSet(set);

    await respond(`Banned <@${userId}> from counting.`);
  });

  app.command("/jayunban", async ({ ack, respond, command }) => {
    await ack();
    if (await denyIfNotOwner(respond, command.user_id)) return;

    const userId = parseMention(command.text);
    if (!userId) return respond("Usage: `/jayunban @user`");

    const set = loadBanSet();
    if (!set.has(userId)) return respond("That user is not banned.");

    set.delete(userId);
    saveBanSet(set);

    await respond(`Unbanned <@${userId}>.`);
  });

  app.command("/searchword", async ({ ack, respond, command, client }) => {
    await ack();

    const parsed = parseSearchArgs(command.text);
    if (!parsed) {
      await respond('Usage:\n`/searchword hello 30`\n`/searchword "jay dont" 14`');
      return;
    }

    const { term, days } = parsed;

    if (days < 1 || days > 365) {
      await respond("Please choose a day between 1 and 365.");
      return;
    }

    await respond(`Searching Slack for *${term}* in the last *${days}* days...`);

    try {
      const allowedNames = await getAllowedChannelNames(client, ALLOWED_CHANNEL_IDS);
      const query = buildSlackSearchQuery(term, days, allowedNames);

      const result = await countAllSearchResults(query);

      const top = result.perChannel.slice(0, 10);
      const lines = [
        `Search term: *${term}*`,
        `Days searched: *${days}*`,
        `Total matching messages: *${result.totalMatches}*`,
      ];

      if (top.length) {
        lines.push("", "*Top channels:*");
        for (const ch of top) {
          lines.push(`• #${ch.channelName}: *${ch.count}*`);
        }
      }

      lines.push("", `Query used: \`${query}\``);

      await respond(lines.join("\n"));
    } catch (e) {
      await respond(`Search failed:\n${e?.data?.error || e?.message || e}`);
    }
  });
};