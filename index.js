require ("dotenv").config();
const { App } = require("@slack/bolt");
const Databse = requite("better-sqlite3");

const WORDS = ["Jay don't"];
const TRACK_ALL_CHANGES = true;

const db = new Database("counts.db");
db.exec(`
CREATE TABLE IF NOT EXISTS counts (
    channel TEXT,
    word TEXT,
    count INTEGER DEFAULT 0,
    PRIMARY KEY (channel, word)
);
`);

function increment(channel, word) {
    const stmt = db.prepare(`
        INSERT INTO counts (channel, word, count)
        VALUES (?, ?, 1)
        ON CONFLICT(channel, word)
        DO UPDATE SET count = count + 1
        RETURNING count;
    `);
    return stmt.get(channel, word).count;
}

const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    appToken: process.env.SLACK_APP_TOKEN,
    socketmode: true,
});

app.event("message", async ({ event }) => {
    if (event.subtype || event.bot_id) return;

    const text = (event.text || "").toLowerCase();

    for(const word of WORDS) {
        if (text.includes(word.toLowerCase())) {
            const c = increment(event.channel, word);
            console.log(`"${word}" => ${c}`);
        }
    }
});

app.command("/count", async ({ command, ack, respond }) => {
    await ack();

    const rows = db
        .prepare("SELECT word, count FROM counts WHERE channel = ? ORDER BY count DESC")
        .all(command.channel_id);
    
    if (!rows.length) return respond("No counts yet :( ");

    const msg = rows.map(r => `• ${r.word}: ${r.count}`).join("\n");
    respond(`Counts: \n${msg}`);
});

(async () => {
    await app.start();
    console.log("Bot running");
})();

