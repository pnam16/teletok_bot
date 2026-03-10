#!/usr/bin/env node
import "dotenv/config";

import {runTikTokBot} from "./jobs/tiktok-bot.js";

const RUN_ONCE = process.argv.includes("--once");

const main = async () => {
  console.log("Teletok TikTok reupload bot starting.");
  await runTikTokBot({runOnce: RUN_ONCE});
};

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
