//simple workflow bc I wanna get the bot up asap
//IT WORKS

const JAY_DONT_RE = /\bjay\s*don'?t\b/i;

function containsJayDont(text) {
  if (!text) return false;
  return JAY_DONT_RE.test(text);
}

require("dotenv").config();
const { App } = require("@slack/bolt");
// const Database = require("better-sqlite3");
// const { get } = require("node:http");
const fs = require("fs");


const FILE = "jaydont.csv";

if (!fs.existsSync(FILE)) {
    fs.writeFileSync(FILE, "count\n0", "utf8");
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

// put CHANNELS HERE WHEN YOU WAKE UP nvm i stayed up
const ALLOWED_CHANNEL_IDS = [
    "C09KRBRRPEX", //campfire-bulletin
    "C09PXLPEL2Y", //campfire,
    "C0A1X4BUD9N", //campfire-usa
];

const REPORT_CHANNEL_ID = "C0AGGGEBZFA"; //Jaydontreports join if ya want lmao

const REPORT_EVERY_MS = 24 *60 * 60 * 1000;

const WATCH_ALL_INVITED_CHANNELS = false;

// const PHRASE = "jay dont";

// const db = new Database("jaydont.csv");
// db.pragma("journal_mode = WAL");

// db.exec(`
//     CREATE TABLE IF NOT EXISTS counter (
//         id INTEGER PRIMARY KEY CHECK (id = 1),
//         count INTEGER NOT NULL DEFAULT 0)
//     );
//     INSERT OR IGNORE INTO counter(id, count) VALUES (1, 0);
// `);

// function incrementAndGet() {
//     db.prepare("UPDATE counter SET count = couunt + 1 WHERE id = 1").run();
//     return db.prepare("SELECT count FROM counter WHERE id = 1").get().count;
// }

// function getCount() {
//     return db.prepare("SELECT count FROM counter WHERE id = 1").get().count;
// }

const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    appToken: process.env.SLACK_APP_TOKEN,
    socketMode: true
});

// function containsJayDont(text) {
//     if (!text) return false;
//     return text.toLowerCase().includes(PHRASE);
// }

app.event("message", async ({ event }) => {
    console.log("EVENT:", event.channel, JSON.stringify(event.text));
    if (event.subtype) return;
    if (event.bot_id) return;

    if (!WATCH_ALL_INVITED_CHANNELS) {
        if (!ALLOWED_CHANNEL_IDS.includes(event.channel)) return;
    }

    const text = event.text || "";
    if (containsJayDont(text)) {
        const total = incrementAndGet();
        // console.log(`Counted "${PHRASE}" => total ${total}`);
        console.log(`Counted jay don't => total ${total}`);
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

// app.event("message", async ({ event }) => {
//     console.log("got message:", {
//         channel: event.channel,
//         text: event.text,
//         thread_ts: event.thread_ts,
//         subtype: event.subtype
//     });

//     if (event.subtype) return;
//     if(event.bot_id) return;

//     if (!WATCH_ALL_INVITED_CHANNELS) {
//         if (!ALLOWED_CHANNEL_IDS.includes(event.channel)) return;
//     }

//     if (containsJayDont(event.text)) {
//         const total = incrementAndGet();
//         console.log(`Counted => total ${total}`);
//     }
// });

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
})();