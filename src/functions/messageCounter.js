const fs = require("fs");

module.exports = function registerMessageCounter(app, config) {
  const {
    ALLOWED_CHANNEL_IDS,
    WATCH_ALL_INVITED_CHANNELS,
    STATE_FILE,
    JAY_DONT_RE_GLOBAL,
  } = config;

  function loadState() {
    if (!fs.existsSync(STATE_FILE)) {
      fs.writeFileSync(STATE_FILE, "count,last_ts\n0,0\n");
    }
    const lines = fs.readFileSync(STATE_FILE, "utf8").split("\n");
    const [count, lastTs] = (lines[1] || "0,0").split(",");
    return {
      count: parseInt(count) || 0,
      lastTs: parseFloat(lastTs) || 0,
    };
  }

  function saveState(count, lastTs) {
    fs.writeFileSync(STATE_FILE, `count,last_ts\n${count},${lastTs}\n`);
  }

  app.event("message", async ({ event }) => {
    if (event.subtype) return;
    if (event.bot_id) return;

    if (!WATCH_ALL_INVITED_CHANNELS) {
      if (!ALLOWED_CHANNEL_IDS.includes(event.channel)) return;
    }

    const state = loadState();
    const msgTs = parseFloat(event.ts) || 0;
    if (msgTs <= state.lastTs) return;

    JAY_DONT_RE_GLOBAL.lastIndex = 0;
    const matches = event.text?.match(JAY_DONT_RE_GLOBAL);
    const hits = matches ? matches.length : 0;

    const newCount = state.count + hits;
    const newLastTs = Math.max(state.lastTs, msgTs);

    saveState(newCount, newLastTs);
  });
};