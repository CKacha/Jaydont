const fs = require("fs");

module.exports = function registerCommands(app, config, backfillHistory) {
  const { STATE_FILE, BANLIST_FILE, OWNER_USER_ID } = config;

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
      await respond(`Backfill failed \n${e?.data || e?.message || e}`);
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
};