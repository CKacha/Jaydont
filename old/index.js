// IGNORE THIS FOR NOW ITLL BE FOR THE FULL FULL RELEASE VERSION

require ("dotenv").config();
const { App } = require("@slack/bolt");
const Databse = requite("better-sqlite3");

const WORDS = ["Jay don't"];
const ADMIN_USER_IDS = [];
const TRACK_ALL_CHANNELS = false;

const db = new Database("counts.db");
db.exec(`
    CREATE TABLE IS NOT EXISTS trakced_channels (
    channel_id TEXT PRIMARY KEY
    );

    CREATE TABLE IF NOT EXISTS counts (
        channel TEXT,
        word TEXT,
        count INTEGER DEFAULT 0,
        PRIMARY KEY (channel, word)
    );
`);

function isTracked(channelId) {
    const row = db
        .prepare("SELECT 1 FROM tracked_channels WHERE channel_id = ?")
        .get(channelId);
    return !!row;
}

function trackChannel(channelId) {
    db.prepare("DELETE FROM tracked_channels WHERE channel_id = ?").run(channelId);
}

function listTrackedChannels() {
    return db.prepare("SELECT channel_id FROM tracked_channels").all();
}

function incrementCount(channelId, word) {
    const stmt = db.prepare(`
        INSERT INTO counts (channel_id, word, count)
        VALUES (?, ?, 1)
        ON CONFLICT(channel_id, word)
        DO UPDATE SET count = count + 1
        RETURNING count;
    `);
    return stmt.get(channelId, word).count;
}

function getCountsForChannel(channelId) {
    return db
        .prepare(
            "SELECT word, count FROM counts WHERE channel_id = ? ORDER BY count DESC"
        )
        .all(channelId);
}

function getAllCounts() {
    return db
        .prepare(
            "SELECT channel_id, word, count FROM  counts ORDER BY channel_id, count DESC"
        )
        .all();
}

async function getAllCounts() {
    return db.prepare(
        "SELECT channel_id, work, count FROM counts ORDER BY channel_id, count DESC"
    )
    .all();
}

async function getChannelIdByName(client, name) {
    let cursor;
    do {
        const res = await client.conversations.list({
            limit: 200,
            cursor,
            types: "public_channel, private_channel",
        });
        const found = res.channels.find((c) => c.name === name);
        if (found) return found.id;
        cursor = res.response_metadata?._next_cursor;
    } while (cursor);
    return null;
}

async function getChannelName(client, channelId) {
    try {
        const res = await client.conversations.info({ channel: channelId });

    } catch {
        return channelId;
    }
}

function isAdmin (userId) {
    if (!ADMIN_USER_IDS.length) return true;
    return ADMIN_USER_IDS.includes(userId);
}

function hitsTarget(text, target) {
    if (!text) return false;
    const t = target.toLowerCase();
    const lower = text.toLowerCase();

    if (t.includes(" ")) return lower.includes(t);
    
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "i");
    return re.test(text);
}

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

    if (!TRACK_ALL_CHANNELS) {
        if (!isTracked(event.channel)) return;
    }

    const text = event.text || "";

    for (const target of TARGETS) {
        if (hitsTarget(text, target)) {
            const newCount = incrementCount(event.channel, target);
            console.log(`[${event.channel}] counted "${target}" => ${newCount}`);
        }
    }
});

app.command("/track", async ({ command, ack, respond, client }) => {
    await ack();

    if(!isAdmin(command.user_id)) {
        return respond("Sorry, you're not allowed to change tracking settings.");
    }

    const arg = (command.text || "").trim().replace(/^#/, "");

    let channelId = command.channel_id;

    if(arg) {
        const found = await getChannelIdByName(client, arg);

        if(!found) return respond(`Couldn't find a channel anmed *#{arg}* :pf:`);
        channelId = found;
    }

    trackChannel(channelId);
    const name = await getChannelName(client, channelId);
    return respond(` Now tracking *#${name}*`);
});

app.command("/untrack", async ({ command, ack, respond, client }) => {
    await ack();

    if (!isAdmin(command.user_id)) {
        return respond("Sorry, you don't have perms to change tracking settings :loll:");
    }

    const arg = (command.text || "").trim().replace(/^#/, "");

    let channelId = command.channel_id;

    if(arg) {
        const found = await getChannelIdByName(client, arg);
        if (!found) return respond(`I couldn't find a channel named *#${arg}* :sob:`);
        channelId = found;
    }

    untrackChannel(channelId);
    const name = await getChannelName(client, channelId);
    return respond(`Stopped tracking *#{name}*`);
});

app.command("/tracked", async ({ ack, respond, client }) => {
    await ack();

    if (TRACK_ALL_CHANNELS) {
        return respond("track all channels is ON don't regret it buddy");
    }

    const rows = listTrackedChannels();
    if (!rows.length) return respond("No tracked channel use da command idiot(/track)");

    const names = [];
    for (const r of rows) {
        const name = await getChannelName(client, r.channel_id);
        names.push(`#${name}`);
    }

    return respond(`Tracking: \n${names.map((n) => `• ${n}`).join("\n")}`);
});

app.command("/count", async ({ command, ack, respond }) => {
    await ack();

    const arg = (command.text || "").trim().toLowerCase();

    if (arg === "all") {
        const rows = getAllCounts();
        if (!rows.length) return respond("No counts yet. :(");

        const byChannel = new Map;
        for (const r of rows) {
            if (!byChannel.has(r.channel_id)) byChannel.set(r.channel_id, []);
            byChannel.get(r.channel_id).push(r);
        }

        let out = "*All counts: *\n";
        for (const [channelId, items] of byChannel.entries()) {
            const name = await getChannelIdByName(client, channelId);
            out +=  `\n*#${name}*\n`;
            out +=items.map((i) => `• ${i.target}: ${i.count}`).join("\n");
            out += "\n";
        }

        return respond(out);
    }

    const rows = getCountsForChannel(command.channel_id);
    if (!rows.length) return respond("No counts yet for this channel. :/ (is that what you were expecting?)");

    const name = await getChannelName(client, command.channel_id);
    const out = 
        `*Counts for #${name}:*\n` +
        rows.map((r) => `• ${r.target}: ${r.count}`).join("\n");

    return respond(out);
});

(async () => {
    if (!process.env.SLACK_BOT_TOKEN || !process.env.SLACK_APP_TOKEN) {
        console.error("Missing SLACK_BOT_TOKEN or SLACK_APP_TOKEN in env IDIOT");
        process.exit(1);
    }
    await app.start();
    console.log("Jay don't is da runnin")
})();

