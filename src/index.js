#!/usr/bin/env node
import {runTikTokBot} from "./jobs/tiktok-bot.js";
import {runWebhookServer} from "./server/webhook.js";

const RUN_ONCE = process.argv.includes("--once");

const main = async () => {
  // Load .env only when env is not already set (e.g. --env-file or Docker)
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    await import("dotenv/config");
  }
  console.log("Teletok TikTok reupload bot starting.");
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
