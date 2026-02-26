const fs = require("fs");

module.exports = async function backfillHistory(app, config, options = {}) {
    const { force = false } = options;

    const {
        ALLOWED_CHANNEL_IDS,
        BACKFILL_DAYS,
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

    function countMatches(text) {
        if (!text) return 0;
        JAY_DONT_RE_GLOBAL.lastIndex = 0;
        const matches = text.match(JAY_DONT_RE_GLOBAL);
        return matches ? matches.length : 0;
    }

    const state = loadState();
    if (!force && state.lastTs > 0) {
        return { skipped: true, total: state.count, newestSeen: state.lastTs };
    }

    const banSet = loadBanSet();
    const oldest = Math.floor(Date.now() / 1000) - BACKFILL_DAYS * 24 * 60 * 60;

    let total = 0;
    let newestSeen = 0;

    for (const channel of ALLOWED_CHANNEL_IDS) {
        let cursor;
        do {
        const res = await app.client.conversations.history({
            channel,
            oldest: String(oldest),
            limit: 200,
            cursor,
        });

        for (const msg of res.messages || []) {
            const msgTs = parseFloat(msg.ts || "0");
            newestSeen = Math.max(newestSeen, msgTs);

            if (msg.user && banSet.has(msg.user)) continue;

            const hits = countMatches(msg.text || "");

            if (hits >= 4) continue;

            total += hits;
        }

        cursor = res.response_metadata?.next_cursor || undefined;
        } while (cursor);
    }

    saveState(total, newestSeen || 0);
    return { skipped: false, total, newestSeen: newestSeen || 0 };
};