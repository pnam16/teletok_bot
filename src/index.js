#!/usr/bin/env node
import "dotenv/config";

const RUN_ONCE = process.argv.includes("--once");

/**
 * Run your bot logic once.
 * Replace the body of this function with your own job implementation.
 */
const runJobOnce = async () => {
  const now = new Date().toISOString();
  await Promise.resolve();
  console.log(
    now,
    "Bot template tick (no-op). Implement your logic in runJobOnce().",
  );
};

const main = async () => {
  console.log("Node bot template started.");

  if (RUN_ONCE) {
    await runJobOnce();
    process.exit(0);
  }

  // Simple interval loop. Adjust interval or replace with cron if needed.
  const intervalMs = Number(process.env.BOT_INTERVAL_MS ?? 60_000);
  console.log("Running job every", intervalMs, "ms.");

  let jobInProgress = false;

  const guardedRun = async () => {
    if (jobInProgress) {
      console.log(
        new Date().toISOString(),
        "Previous job still running, skipping tick.",
      );
      return;
    }
    jobInProgress = true;
    try {
      await runJobOnce();
    } catch (err) {
      console.error(new Date().toISOString(), "Job error:", err);
    } finally {
      jobInProgress = false;
    }
  };

  // Run once immediately, then on interval.
  await guardedRun();
  setInterval(guardedRun, intervalMs);
};

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
