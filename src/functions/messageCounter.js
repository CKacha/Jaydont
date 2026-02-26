const fs = require("fs");

module.exports = function registerMessageCounter(app, config) {
  const {
    ALLOWED_CHANNEL_IDS,
    WATCH_ALL_INVITED_CHANNELS,
    STATE_FILE,
    BANLIST_FILE,
    SPAM_FILE,
    JAY_DONT_RE_GLOBAL,
  } = config;

  function ensureStateFile() {
    if (!fs.existsSync(STATE_FILE)) {
      fs.writeFileSync(STATE_FILE, "count,last_ts\n0,0\n", "utf8");
    }
  }

  function loadState() {
    ensureStateFile();
    const lines = fs.readFileSync(STATE_FILE, "utf8").trim().split(/\r?\n/);
    const row = (lines[1] || "0,0").split(",");
    return {
      count: parseInt(row[0] || "0", 10) || 0,
      lastTs: parseFloat(row[1] || "0") || 0,
    };
  }

  function saveState(count, lastTs) {
    fs.writeFileSync(STATE_FILE, `count,last_ts\n${count},${lastTs}\n`, "utf8");
  }

  function ensureBanFile() {
    if (!fs.existsSync(BANLIST_FILE)) {
      fs.writeFileSync(BANLIST_FILE, "# Banned users\n", "utf8");
    }
  }

  function loadBanSet() {
    ensureBanFile();
    const raw = fs.readFileSync(BANLIST_FILE, "utf8");
    const ids = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));
    return new Set(ids);
  }

  function saveBanSet(set) {
    const lines = ["# Banned users", ...Array.from(set)];
    fs.writeFileSync(BANLIST_FILE, lines.join("\n") + "\n", "utf8");
  }

  function banUser(userId) {
    const set = loadBanSet();
    if (!set.has(userId)) {
      set.add(userId);
      saveBanSet(set);
    }
  }

  function loadSpam() {
    if (!fs.existsSync(SPAM_FILE)) return {};
    try {
      return JSON.parse(fs.readFileSync(SPAM_FILE, "utf8"));
    } catch {
      return {};
    }
  }

  function saveSpam(obj) {
    fs.writeFileSync(SPAM_FILE, JSON.stringify(obj, null, 2), "utf8");
  }

  async function dmUser(client, userId, text) {
    const opened = await client.conversations.open({ users: userId });
    const channelId = opened.channel?.id;
    if (!channelId) return;
    await client.chat.postMessage({ channel: channelId, text });
  }

  function countMatches(text) {
    if (!text) return 0;
    JAY_DONT_RE_GLOBAL.lastIndex = 0;
    const matches = text.match(JAY_DONT_RE_GLOBAL);
    return matches ? matches.length : 0;
  }

  app.event("message", async ({ event, client }) => {
    if (event.subtype) return;
    if (event.bot_id) return;

    if (!WATCH_ALL_INVITED_CHANNELS) {
      if (!ALLOWED_CHANNEL_IDS.includes(event.channel)) return;
    }

    const state = loadState();
    const msgTs = parseFloat(event.ts) || 0;

    if (msgTs && msgTs <= state.lastTs) return;

    const newLastTs = Math.max(state.lastTs, msgTs);

    const banSet = loadBanSet();
    if (event.user && banSet.has(event.user)) {
      if (newLastTs !== state.lastTs) saveState(state.count, newLastTs);
      return;
    }

    const hits = countMatches(event.text || "");

    if (hits >= 4 && event.user) {
      if (newLastTs !== state.lastTs) saveState(state.count, newLastTs);

      const spam = loadSpam();
      const entry = spam[event.user] || { strikes: 0, warned: false };
      entry.strikes += 1;

      if (entry.warned) {
        banUser(event.user);
        spam[event.user] = entry;
        saveSpam(spam);

        try {
          await dmUser(
            client,
            event.user,
            `You’ve been automatically added to the ban list for repeated spam (sending 4+ "jay dont" in one message).`
          );
        } catch (e) {
          console.error("DM ban notice failed:", e?.data || e?.message || e);
        }
        return;
      }

      if (entry.strikes >= 3 && !entry.warned) {
        entry.warned = true;
        spam[event.user] = entry;
        saveSpam(spam);

        try {
          await dmUser(
            client,
            event.user,
            `Heads up: Please don’t spam "jay dont" 4+ times in one message. If it happens again, you’ll be automatically banned from counting.`
          );
        } catch (e) {
          console.error("DM warning failed:", e?.data || e?.message || e);
        }
        return;
      }

      spam[event.user] = entry;
      saveSpam(spam);
      return;
    }

    if (hits > 0) {
      saveState(state.count + hits, newLastTs);
      console.log(`Counted ${hits} => total ${state.count + hits}`);
    } else {
      if (newLastTs !== state.lastTs) saveState(state.count, newLastTs);
    }
  });
};