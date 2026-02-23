require("dotenv").config();
const { App } = require("@slack/bolt");

const registerMessageCounter = require("./functions/messageCounter");
const registerCommands = require("./functions/commands");
const backfillHistory = require("./functions/backfill");
const startDailyReport = require("./functions/dailyReport");

const ALLOWED_CHANNEL_IDS = [
  "C09KRBRRPEX",
  "C09PXLPEL2Y",
  "C0A1X4BUD9N",
];

const WATCH_ALL_INVITED_CHANNELS = false;
const REPORT_CHANNEL_ID = "C0AGGGEBZFA";
const REPORT_EVERY_MS = 24 * 60 * 60 * 1000;
const BACKFILL_DAYS = 60;
const STATE_FILE = "jaydont_state.csv";
const JAY_DONT_RE_GLOBAL = /\bjay\s+don'?t\b/gi;

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

(async () => {
  await app.start();
  console.log("Jaydont running");

  registerMessageCounter(app, {
    ALLOWED_CHANNEL_IDS,
    WATCH_ALL_INVITED_CHANNELS,
    STATE_FILE,
    JAY_DONT_RE_GLOBAL,
  });

  registerCommands(app, { STATE_FILE });

  await backfillHistory(app, {
    ALLOWED_CHANNEL_IDS,
    BACKFILL_DAYS,
    STATE_FILE,
    JAY_DONT_RE_GLOBAL,
  });

  startDailyReport(app, {
    REPORT_CHANNEL_ID,
    REPORT_EVERY_MS,
    STATE_FILE,
  });
})();