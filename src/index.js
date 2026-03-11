#!/usr/bin/env node
// Load .env first so DATA_DIR and other vars are set before any module reads them
import "dotenv/config";

import {DATA_DIR} from "./config/index.js";
import {runTikTokBot} from "./jobs/tiktok-bot.js";
import {runWebhookServer} from "./server/webhook.js";

const RUN_ONCE = process.argv.includes("--once");

const main = async () => {
  console.log("Teletok TikTok reupload bot starting.");
  console.log("Data dir (cache + dedup):", DATA_DIR);
  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
  if (webhookUrl) {
    await runWebhookServer();
  } else {
    await runTikTokBot({runOnce: RUN_ONCE});
  }
};

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
