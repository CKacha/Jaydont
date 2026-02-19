require("dotenv").config();
const { App } = require("@slack/bolt");
const { count } = require("console");
const { ALL } = require("dns");
const fs = require("fs");
// might use these idk
// const Database = require("better-sqlite3");
// const { get } = require("node:http");

const ALLOWED_CHANNEL_IDS = [
    "C09KRBRRPEX", //campfire-bulletin
    "C09PXLPEL2Y", //campfire
    "C0A1X4BUD9N", //campfire-usa
    //any more i should add hmm 
    // add jayreports when i get desperate
    //"C0AGGGEBZFA", //jaydontreports
];

const WATCH_ALL_INVITED_CHANNELS = false;

const REPORT_CHANNEL_ID = "C0AGGGEBZFA"; //Jaydontreports
const REPORT_EVERY_MS = 24 *60 * 60 * 1000;

const BACKFILL_DAYS = 60;

const JAY_DONT_RE_GLOBAL = /\bjay\s+don'?t\b/ig;

const STATE_FILE = "jaydont_state.csv";

function ensureStateFile() {
    if (!fs.existsSync(STATE_FILE)) {
        fs.writeFileSync(STATE_FILE, "count,last_ts\n0,0\n", "utf8");
    }
}

function loadState() {
    ensureStateFile();
    const lines = fs.readFileSync(STATE_FILE, "utf8").trim().split("\n");
    const row = (lines[1] || "0,0")/split(",");
    const count = parseInt(row[0] || "0", 10);
    const lastTs = parseFloat(row[1] || "0");
    return {
        count: Number.isFinite(count) ? count : 0,
        lastTs: Number.isFinite(lastTs) ? lastTs : 0,
    };
}

function saveState(count, lastTs) {
    fs.writeFileSync(STATE_FILE, `count,last_ts\n${count},${lastTs}\n`, "utf8");
}


function countMatches(text) {
    if (!text) return 0;
    JAY_DONT_RE_GLOBAL.lastIndex = 0;
    const matches = text.match(JAY_DONT_RE_GLOBAL);
    return matches ? matches.length : 0;
}


function getCount() {
    const lines = fs.readFileSync(FILE, "utf8").trim().split("\n");
    const n = parseInt(lines[1] || "0", 10);    
    return Number.isFinite(n) ? n : 0;
}

function setCount(n) {
    fs.writeFileSync(FILE, `count\n${n}`, "utf8");
}

function incrementAndGet() {
    const n = getCount() + 1;
    setCount(n);
    return n;
}

const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    appToken: process.env.SLACK_APP_TOKEN,
    socketMode: true
});

app.event("message", async ({ event }) => {
    console.log("EVENT:", event.channel, JSON.stringify(event.text));
    if (event.subtype) return;
    if (event.bot_id) return;

    if (!WATCH_ALL_INVITED_CHANNELS) {
        if (!ALLOWED_CHANNEL_IDS.includes(event.channel)) return;
    }

    const state = loadState();

    const msgTs = parseFloat(event.ts) || 0;
    if (msgTs && msgTs <= state.lastTs) return;

    const hits = countMatches(event.text || "");
    if (hits > 0) {
        const newCount = state.count + hits;
        const newLastTs = Math.max(state.lastTs, msgTs);
        saveState(newCount, newLastTs);
        console.log(`Counted ${hits} => total ${newCount}`);
    } else {
        const newLastTs = Math.max(state.lastTs, msgTs);
        if (newLastTs !== state.lastTs) saveState(state.count, newLasTs);
    }
});

app.command("/jaycheck", async ({ command, ack, respond, client }) => {
    await ack();

    const state = loadState();
    const text = `Total "jaydont" count: *${state.count}*`;

    const threadTs = command.thread_ts || command.message.ts;

    if (threadTs) {
        await client.chat.postMessage({
            channel: command.channel_id,
            thread_ts: threadTs,
            text
        });
    } else {
        await respond(text);
    }
});

app.command("/jaycount", async ({ ack, respond }) => {
    await ack();
    const total = getCount();
    await respond(`Total "jay dont": *${total}*`);
});

async function sendDailyReport() {
    const total = getCount();
    await app.client.chat.postMessage({
        channel: REPORT_CHANNEL_ID,
        text: `Current number of jays: *${total}*`,
    });
}

async function sendDailyReport() {
    const state = loadState();
    await app.client.chat.postMessage({
        channel: REPORT_CHANNEL_ID,
        text: `Current total: *${state.count}*`,
    });
}

async function backfillHistory() {
    const state = loadState();
    if (state.lastTs > 0) {
        console.log("Backfill skipped (already done)");
        return;
    }

    const oldest = Math.floor(Date.now() / 1000) - BACKFILL_DAYS * 24 * 60 * 60;
    //one day backfill should be good?

    let total = 0;
    let newestSeen = 0;

    for (const channel of ALLOWED_CHANNEL_IDS) {
        console.log(`Backfill channel is ${channel} (last ${BACKFILL_DAYS} days)...`);

        let cursor;
        do {
            const res = await app.client.conversations.history ({
                channel, 
                oldest:String(oldest),
                limit: 200,
                cursor,
            }); 

            for (const msg of res.messages || [] ) {
                const msgTs = parseFloat(msg.ts || "0");
                newestSeen = Math.max(newestSeen, msgTs);
                
                total += countMatches(msg.text || "");

                if (msg.thread_ts &&  msg.reply_count > 0) {
                    let rCursor;
                    do {
                        const repliesRes = await app.client.conversations.replies({
                            channel,
                            ts: msg.thread_ts,
                            limit: 200,
                            crusor: rCursor,
                        });

                        const replies = repliesRes.messages || [];
                        for (let i = 1; i < replies.length; i++) {
                            const r = replies[i];
                            const rTs = parseFloat(r.ts || "0");
                            newestSeen = Math.max(newestSeen, rTs);
                            total += countMatches(r.text || ""); 
                        }

                        rCursor = repliesRes.response_metadata?.next_cursor || undefined;
                    } while (rCursor);
                }
            }

            cursor = res.response_metadata?.next_cursor || undefined;
        } while (cursor);
    }

    saveState(total, newestSeen || 0);
    console.log(`Backfill DONE total=${total}, lastTs=${newestSeen}`);
}

(async () => {
    if (!process.env.SLACK_BOT_TOKEN || !process.env.SLACK_APP_TOKEN) {
        console.error("Missing SLACK_BOT_TOKEN or SLACK_APP_TOKEN env sob");
        process.exit(1);
    }

    await app.start();
    console.log("Jaydont is running");

    console.log(
        `Current watching ${WATCH_ALL_INVITED_CHANNELS ? "All Invited Channels" : ALLOWED_CHANNEL_IDS.join(", ")}`
    );

    try {
        await backfillHistory();
    } catch (e) {
        console.error("tf backfill failed", e?.data || e?.message || e);
    }

    try {
        await sendDailyReport();
    } catch (e) {
        console.error("Daily report failed (startup) SOB", e?.data || e?.message || e);
    }

    setInterval(async () => { 
        try {
            await sendDailyReport();
        } catch (e) {
            console.error("Daily report failed:", e?.data || e?.message || e);
        }
    }, REPORT_EVERY_MS);
})();