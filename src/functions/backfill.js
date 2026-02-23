const { ALL } = require("dns");
const fs = require("fs");

module.exports = async function backfillHistory(app, config) {
    const {
        ALLOWED_CHANNEL_IDS,
        BACKFILL_DAYS,
        STATE_FILE,
        JAY_DONT_RE_GLOBAL,
    } = config;

    if (fs.existsSync(STATE_FILE)) {
        const lines = fs.readFileSync(STATE_FILE, "utf-8").split("\n");
        const [, lastTs] = (lines[1] || "0,0")/split(",");
        if (parseFloat(lastTs) > 0) {
            console.log("Backfill skipped");
            return;
        }
    }

    const oldest = Math.floor(Date.now() / 1000) - BACKFILL_DAYS * 24 * 60 * 60;

    let total = 0;
    let newestSeen = 0;

    for (const channel of ALLOWED_CHANNEL_IDS) {
        const res = await app.client.conversations.history({
            channel,
            oldest: String(oldest),
            limit: 200,
        });

        for (const msg of res.messages || []) {
            const msgTs = parseFloat(msg.ts || "0");
            newestSeen = Math.max(newestSeen, msgTs);

            JAY_DONT_RE_GLOBAL.lastIndex = 0;
            const matches = msg.text?.match(JAY_DONT_RE_GLOBAL);
            if (matches) total += matches.length;
        } 
    }

    fs.writeFileSync(
        STATE_FILE,
        `count,last_ts\n${total},${newestSeen}\n`
    );

    console.log("Backfill complete");
};





