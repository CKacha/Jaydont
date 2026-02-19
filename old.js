// come functions & other stuff I'm not using but might repurpose idkkk
// might use these idk
const { count } = require("console");
const { ALL } = require("dns");
const Database = require("better-sqlite3");
const { get } = require("node:http");

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

async function sendDailyReport() {
    const total = getCount();
    await app.client.chat.postMessage({
        channel: REPORT_CHANNEL_ID,
        text: `Current number of jays: *${total}*`,
    });
}