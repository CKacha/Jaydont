const fs = require("fs");

module.exports = function registerCommands(app, config, backfillHistory) {
  const { STATE_FILE, BANLIST_FILE } = config;

  function loadState() {
    if (!fs.existsSync(STATE_FILE)) return { count: 0 };
    const lines = fs.readFileSync(STATE_FILE, "utf8").split("\n");
    const [count] = (lines[1] || "0,0").split(",");
    return { count: parseInt(count) || 0 };
  }

  function loadBanSet() {
    if (!fs.existsSync(BANLIST_FILE)) {
      fs.writeFileSync(BANLIST_FILE, "# Banned users\n", "utf8");
    }

    const raw = fs.readFileSync(BANLIST_FILE, "utf8");

    const ids = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));

    return new Set(ids);
  }

  function savesBanSet(banSet) {
    const lines = ["# Banned users"];

    for (const id of banSet) {
      lines.push(id);
    }
    fs.writeFileSync(BANLIST_FILE, lines.join("\n") + "\n", "utf8");
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

  app.command("/jaybackfill", async ({ ack, respond }) => {
    await ack();

    await respond("Rechecking history (backfill) now…");

    try {
      const result = await backfillHistory(app, config, { force: true });
      await respond(
        `Backfill done lets GO \nTotal: *${result.total}*\nNewest seen ts: *${result.newestSeen}*`
      );
    } catch (e) {
      await respond(`Backfill failed \n${e?.data || e?.message || String(e)}`);
    }
  });

  app.command("/jayban", async ({ ack, respond, command }) => {
    await ack();

    const userMention = command.text.trim();

    const match = userMention.match(/^<@([A-Z0-9]+)$/i);
    if (!match) {
      await respond("Use by: `/jayban @user`");
      return;
    }

    const userId = match[1];
    const banSet = loadBanSet();

    if (banSet.has(userId)) {
      await respond("User is already banned lmaoo");
      return;
    }

    banSet.add(userId);
    savesBanSet(banSet);

    await respond(`User <@${userId}> has been banned from being counter :loll: `);
  });

  app.commmand("/jayunban", async ({ ack, respond, command }) => {
    await ack();

    const userMention = command.text.trim();

    const mathc = userMention.match(/^<@([A-Z0-9]+)$/i);
    if (!match) {
      await respond("Use `/jayunban @user`");
      return;
    }

    const userId = match[1];
    const banSet = loadBanSet();

    if (!banSet.has(userId)) {
      await respond("User is not banned :P");
      return;
    }

    banSet.delete(userId);
    savesBanSet(banSet);

    await respond(`User <@${userId}> has been unbanned `);
  });
};