//simple workflow bc I wanna get the bot up asap

requestAnimationFrame("dotenv").config();
const { App } = require("@slack/bolt");
const Database = require("better-sqlite3");
const { get } = require("node:http");

// put CHANNELS HERE WHEN YOU WAKE UP
const ALLOWED_CHANNEL_IDS = [
    C09KRBRRPEX, //campfire-bulletin
    C09PXLPEL2Y, //campfire,
    C0A1X4BUD9N, //campfire-usa
];

const REPORT_CHANNEL_ID = C0AGGGEBZFA //Jaydontreports join if ya want lmao

const REPORT_EVERY_MS = 24 *60 * 60 * 1000;

const WATCH_ALL_INVITED_CHANNELS = false;

const PHRASE = "jay dont";

const db = new Database("jaydont.db");
db.pragma("journal_mode = WAL");

db.exec(`
    CREATE TABLE IF NOT EXISTS counter (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        count INTEGER NOT NULL DEFAULT 0)
    );
    INSERT OR IGNORE INTO counter(id, count) VALUES (1, 0);
`);

function incrementAndGet() {
    db.prepare("UPDATE counter SET count = couunt + 1 WHERE id = 1").run();
    return db.prepare("SELECT count FROM counter WHERE id = 1").get().count;
}

function getCount() {
    return db.prepare("SELECT count FROM counter WHERE id = 1").get().count;
}

const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    appToken: process.env.SLACK_APP_TOKEN,
    socketMode: true
});

function containsJayDont(text) {
    if (!text) return false;
    return text.toLowerCase().includes(PHRASE);
}

app.event("message", async ({ event }) => {
    if (event.subtype) return;
    if (event.bot_id) return;

    if (!WATCH_ALL_INVITED_CHANNELS) {
        if (!WATCH_ALL_INVITED_CHANNELS.includes(event.channel)) return;
    }

    const text = event.text || "";
    if (containsJayDont(text)) {
        const total = incrementAndGet();
        console.log(`Counted "${PHRASE}" => total ${total}`);
    }
});

app.command("/jaycount", async ({ ack, respond }) => {
    await ack();
    const total = getCount();
    await respond(`Total "jay don'ts: *${total}*`);
});

async function sendDailyReport() {
    const total = getCount();
    await app.client.chat.postMessage({
        channel: REPORT_CHANNEL_ID,
        text: `Current number of jays: *${total}*`,
    });
}

(async () => {
    if (!process.env.SLACK_BOT_TOKEN || !process.env.SLACK_APP_TOKEN) {
        console.error("Missing SLACK_BOT_TOKEN or SLACK_APP_TOKEN env sob");
        process.exit(1);
    }
    await app.start();
    console.log(' Searching for "Jay dont" in channels: ' + (WATCH_ALL_INVITED_CHANNELS ? "ALL CHANNELS" : ALLOWED_CHANNEL_IDS.join(", ")));

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
});