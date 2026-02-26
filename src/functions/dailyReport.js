const fs = require("fs");

module.exports = function startDailyReport(app, config) {
  const { REPORT_CHANNEL_ID, REPORT_EVERY_MS, STATE_FILE } = config;

  function loadState() {
    if (!fs.existsSync(STATE_FILE)) return { count: 0 };
    const lines = fs.readFileSync(STATE_FILE, "utf8").split(/\r?\n/);
    const [count] = (lines[1] || "0,0").split(",");
    return { count: parseInt(count, 10) || 0 };
  }

  async function sendReport() {
    const state = loadState();
    await app.client.chat.postMessage({
      channel: REPORT_CHANNEL_ID,
      text: `Current total: *${state.count}*`,
    });
  }

  sendReport().catch((e) =>
    console.error("Daily report failed (startup):", e?.data || e?.message || e)
  );

  setInterval(() => {
    sendReport().catch((e) =>
      console.error("Daily report failed:", e?.data || e?.message || e)
    );
  }, REPORT_EVERY_MS);
};