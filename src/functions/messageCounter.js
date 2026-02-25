const fs = require("fs");

module.exports = function registerMessageCounter(app, config) {
  const {
    ALLOWED_CHANNEL_IDS,
    WATCH_ALL_INVITED_CHANNELS,
    STATE_FILE,
    BANLIST_FILE,
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

  function loadBanSet() {
    if (!BANLIST_FILE) return new Set();
    if (!fs.existsSync(BANLIST_FILE)) return new Set();

    const raw = fs.readFileSync(BANLIST_FILE, "utf8");
    const ids = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));

    return new Set(ids);
  }

  function countMatches(text) {
    if (!text) return 0;
    JAY_DONT_RE_GLOBAL.lastIndex = 0;
    const matches = text.match(JAY_DONT_RE_GLOBAL);
    return matches ? matches.length : 0;
  }

  app.event("message", async ({ event }) => {
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

    if (hits > 3) {
      if (newLastTs !== state.lastTs) saveState(state.count, newLastTs);
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