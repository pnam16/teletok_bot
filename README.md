# Node Bot Template

Minimal Node.js bot template using ES modules, dotenv, and a simple interval loop.  
Use this as a starting point for small bots (Telegram, HTTP polling, TikTok downloader, etc.).

## How it works

- **Entry point**: `src/index.js`
  - Loads environment variables from `.env` via `dotenv/config`.
  - Defines `runJobOnce()`, where you implement your bot logic.
  - If started with `--once`, it runs `runJobOnce()` a single time and exits.
  - Otherwise, it runs `runJobOnce()` on an interval (default 60s, configurable via `BOT_INTERVAL_MS`).

- **Config**: `src/config/index.js`
  - Exposes a `DATA_DIR` constant (`dist/` under the current working directory) for any state/output files you want to write.

- **Helpers**: `src/lib/retry.js`
  - Generic `withRetry(fn, options)` helper to rerun async operations on transient errors (e.g. network hiccups).
  - Not used by the template itself, but available for HTTP clients or other I/O.

## Setup

1. **Install dependencies**

   ```bash
   npm install
   # or
   pnpm install
   ```

2. **Configure environment**

   Copy `.env.example` to `.env` and adjust as needed:

   ```bash
   cp .env.example .env
   ```

   Available variables:

   - `NODE_ENV` – optional; defaults to `development`.
   - `BOT_INTERVAL_MS` – optional; interval in milliseconds between job runs (default `60000`).

3. **Run**

   ```bash
   # Run continuously (interval loop)
   npm start

   # Run once and exit (useful for testing your job)
   npm run check
   ```

   You can also use `pnpm` instead of `npm` if you prefer.

## PM2 (optional)

This template includes a basic PM2 configuration in `ecosystem.config.cjs`:

- App name: `node_bot_template`
- Script: `./src/index.js`

Start it with:

```bash
npm run pm2
```

On Windows, you may see repeated PM2 errors like `Error: spawn wmic ENOENT`. These are usually harmless (PM2 trying to read CPU/memory via `wmic`). If they are noisy, you can simply run the bot with `npm start` instead of PM2.

## Extending the template

- Put your main job logic inside `runJobOnce()` in `src/index.js` (call APIs, send messages, process queues, etc.).
- If your logic grows, you can:
  - Move it into a separate module, e.g. `src/jobs/my-job.js`, and import it from `src/index.js`.
  - Add clients in `src/clients/` (e.g. `telegram`, `http`, `tiktok`) using `withRetry` for robustness.
  - Use `DATA_DIR` from `src/config/index.js` for any state files you need.

This repository is intentionally small so you can shape it around your specific bot use case.
