const fs = require("fs");

module.exports = function startDailyReport(app, config) {
    const { REPORT_CHANNEL_ID, REPORT_EVERY_MS, STATE_FILE } = config;

    function loadState() {
        if (!fs.existsSync(STATE_FILE)) return { count: 0 };
        const lines = fs.readFileSync(STATE_FILE, "utf-8").split("\n");
        const [count] = (lines[1] || "0").split(",");
        return { count: parseInt(count) || 0};
    }

    async function sendReport() {
        const state = loadState();
        await app.client.chat.postMessage({
            channel: REPORT_CHANNEL_ID,
            text: `Current total: *${state.count}*`,
        });
    }

        sendReport();
        setInterval(sendReport, REPORT_EVERY_MS);
};