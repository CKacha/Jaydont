require("dotenv").config();
const path = require("path");
const { App } = require("@slack/bolt");
const { WebClient } = require("@slack/web-api");

const registerMessageCounter = require("./functions/messageCounter");
const registerCommands = require("./functions/commands");
const backfillHistory = require("./functions/backfill");
const startDailyReport = require("./functions/dailyReport");

// maybe i should just make this a seperate txt file that it takes from...
const ALLOWED_CHANNEL_IDS = [
  "C09KRBRRPEX", // campfire-bulletin
  "C09PXLPEL2Y", // campfire
  "C0A1X4BUD9N", // campfire-usa
  // "C0188CY57PZ" //meta 
  // "C0266FRGT" //annoucements
  // "C09UT00LP9T" //alive people
];

const WATCH_ALL_INVITED_CHANNELS = false;

const REPORT_CHANNEL_ID = "C0AGGGEBZFA"; // jaydontreports
const REPORT_EVERY_MS = 24 * 60 * 60 * 1000;

const BACKFILL_DAYS = 60;
const JAY_DONT_RE_GLOBAL = /\bjay\s+don'?t\b/gi;

const STATE_FILE = path.join(__dirname, "../jaydont_state.csv");
const BANLIST_FILE = path.join(__dirname, "../banlist.txt");
const SPAM_FILE = path.join(__dirname, "../spam_state.json");

const OWNER_USER_ID = "U0828FYS2UC";

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});
const searchClient = new WebClient(process.env.SLACK_USER_TOKEN);

(async () => {
  if (!process.env.SLACK_BOT_TOKEN || !process.env.SLACK_APP_TOKEN || !process.env.SLACK_USER_TOKEN) {
    console.error("Missing SLACK_BOT_TOKEN/SLACK_APP_TOKEN/SLACK_USER_TOKEN env sob");
    process.exit(1);
  }

  await app.start();
  console.log("Jaydont running");

  const config = {
    ALLOWED_CHANNEL_IDS,
    WATCH_ALL_INVITED_CHANNELS,
    REPORT_CHANNEL_ID,
    REPORT_EVERY_MS,
    BACKFILL_DAYS,
    JAY_DONT_RE_GLOBAL,
    STATE_FILE,
    BANLIST_FILE,
    SPAM_FILE,
    OWNER_USER_ID,
  };
  
  registerMessageCounter(app, config);
  registerCommands(app, config, backfillHistory, searchClient);

  try {
    const result = await backfillHistory(app, config, { force: false });
    if (result?.skipped) console.log("Backfill skipped (already done)");
    else console.log(`Backfill done. Total=${result?.total ?? "?"}`);
  } catch (e) {
    console.error("Backfill failed:", e?.data || e?.message || e);
  }

  startDailyReport(app, config);
})();