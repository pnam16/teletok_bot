## Teletok – TikTok Telegram Reupload Bot

Teletok is a Node.js bot that listens in Telegram chats, detects short‑video links (TikTok, YouTube Shorts, Instagram Reels), downloads the video via an external downloader (e.g. `yt-dlp`), reuploads the video into the same chat, and then cleans up temporary files. It supports both long‑poll and webhook modes.

> Note: You are responsible for complying with each platform’s terms of service and local laws when using any downloader.

### How it works

- **Entry point**: `src/index.js`
  - Loads `.env` first via `dotenv/config` so `DATA_DIR` and other vars are set before any module reads them; logs data dir as `Data dir (cache + dedup):` plus `DATA_DIR` at startup.
  - If `TELEGRAM_WEBHOOK_URL` is set, runs in **webhook mode**: registers the webhook with Telegram via `setWebhook` and starts an HTTP server that receives POSTs.
  - Otherwise runs in **long‑poll mode**: calls `runTikTokBot()` from `src/jobs/tiktok-bot.js` and polls `getUpdates`.
  - Supports `--once` in long‑poll mode (process one batch of updates then exit) for debugging or health checks.

- **Job**: `src/jobs/tiktok-bot.js`
  - **Long‑poll mode**: repeatedly calls Telegram’s `getUpdates` API (timeout 25s) and processes each batch with concurrency 2.
  - **Webhook mode**: each incoming POST body is one update; `src/server/webhook.js` passes it to the same `processUpdate` function.
  - For each incoming message (or edited message), extracts the first short‑video URL from supported platforms (TikTok, YouTube Shorts, Instagram Reels).
  - Normalizes the URL and hashes it for the cache key. Looks up `DATA_DIR/cache` by hash; if found, reups from cache; otherwise downloads via the external CLI, stores in cache, then reuploads. Same URL in any chat reups from cache (one download per URL).
  - Sends an “uploading video” chat action, then the video (reply to the original) with caption `Reup từ {source}`, or a short error message on failure (Vietnamese text).
  - **Delete uploaded message:** Reply to the bot’s reupload message with `/panic` or `/remove` to delete that message (only works for messages sent by the bot).

- **Clients**:
  - `src/clients/telegram.js` – thin wrapper around Telegram Bot API:
    - `getUpdates`, `setWebhook`, `deleteWebhook`, `sendChatAction`, `sendTextMessage`, `sendVideo`, `deleteMessage`.
    - Uses `axios` with timeouts and a `withRetry` helper to retry transient errors.
  - `src/clients/tiktok.js` – short‑video download helper:
    - Spawns an external CLI (default `yt-dlp`) in a dedicated temp directory, waits for it to finish, finds the output video file, and returns `{filePath, cleanup}`.
    - Supports custom CLI binary and arguments via environment variables.

- **Config & helpers**:
  - `src/config/index.js` – `DATA_DIR`, root for video cache (default `./data`). Strips surrounding quotes and normalizes path (Windows-friendly). Logged at startup.
  - `src/lib/dedup.js` – URL helpers for cache key only: `normalizeUrl()` (lowercase, strip fragment/tracking params) and `hashUrl()` (stable short hash).
  - `src/lib/cache.js` – video cache under `DATA_DIR/cache` (files keyed by URL hash). Enforces `CACHE_MAX_MB` by evicting oldest files. On Windows, if `rename()` fails (e.g. temp vs OneDrive), falls back to copy then delete temp.
  - `src/lib/retry.js` – `withRetry(fn, options)` helper to rerun transiently failing async operations (used by the Telegram client).
  - `src/server/webhook.js` – webhook server:
    - Creates a minimal HTTP server that validates path and optional secret token header, parses the JSON body (max ~512 KB), responds quickly with `{}`, and then processes the update asynchronously.

### Project structure

| Path | Purpose |
|------|---------|
| `src/index.js` | Entry point; selects webhook vs long‑poll mode and loads env when needed. |
| `src/jobs/tiktok-bot.js` | Core bot logic: update processing, URL extraction, cache lookup, download + reupload. |
| `src/server/webhook.js` | HTTP server for webhook mode: `createWebhookServer`, `runWebhookServer`; `POST /webhook`, optional secret token. |
| `src/clients/telegram.js` | Telegram Bot API client: `getUpdates`, `setWebhook`, `deleteWebhook`, `sendChatAction`, `sendTextMessage`, `sendVideo`, `deleteMessage`. |
| `src/clients/tiktok.js` | Runs external downloader (yt‑dlp or custom), handles temp directory and cleanup. |
| `src/config/index.js` | Exposes `DATA_DIR` for video cache, defaulting to `./data`. |
| `src/lib/dedup.js` | URL helpers: `normalizeUrl`, `hashUrl` (for cache key). |
| `src/lib/cache.js` | File‑based video cache with size limit and eviction. |
| `src/lib/retry.js` | `withRetry()` helper for retrying transient async operations. |
| `build.mjs` | esbuild bundle script; outputs `dist/index.js` (run via `npm run build`). |
| `pnpm-lock.yaml` | Lockfile; Docker build uses `pnpm install --frozen-lockfile`. |
| `biome.json` | Biome lint/format config (used by `npm run lint`). |
| `ecosystem.config.cjs` | PM2 app config (`teletok_bot`). |
| `Dockerfile` / `docker-compose.yml` | Container build and run (Node 20, yt‑dlp, ffmpeg, python3, esbuild bundle). |
| `scripts/pm2-resurrect.sh` | PM2 resurrect + start + save (e.g. at login). |

### Scripts

Scripts are defined in `package.json` and can be run with `npm` or `pnpm`:

| Script | Description |
|--------|-------------|
| `npm run build` | Bundle the app with esbuild to `dist/index.js` (Node 18 ESM, externalizes core deps). |
| `npm run dev` | Run the bot from source (`src/index.js`) in development. |
| `npm run check` | Run a single `runTikTokBot` cycle from source and exit (debugging/health checks). |
| `npm run docker` | Build and run the Docker Compose stack (`docker compose up -d --build`). |
| `npm run lint` | Run Biome (`pnpm exec biome check --write`) to lint and autofix. |
| `npm run pm2` | Start the app via PM2 using `ecosystem.config.cjs`. |
| `npm start` | Run the built bundle (`dist/index.js`). Run `npm run build` first or use Docker. |
| `npm run start:envfile` | Run built bundle with `node --env-file=.env dist/index.js`. |

### Setup

1. **Install dependencies**

   ```bash
   npm install
   # or
   pnpm install
   ```

2. **Install short‑video downloader CLI**

   Install [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) (recommended) or another CLI that can download TikTok/short‑video links, and make sure it is on your `PATH`.

   **YouTube / JS runtime:** For YouTube (and Shorts), yt‑dlp may warn *“No supported JavaScript runtime could be found”* and some formats can be missing. To fix this, set `TIKTOK_DOWNLOADER_JS_RUNTIMES=node` in `.env`. The bot will then call yt‑dlp with `--js-runtimes node:<path-to-node>`, using the same Node that runs the bot. No extra install is needed when the app already runs on Node (e.g. in Docker the image has both Node and yt‑dlp).

3. **Configure environment**

   Copy `.env.example` to `.env` and adjust values:

   ```bash
   cp .env.example .env
   ```

   Key variables (see `.env.example` for full list and comments):

  - `NODE_ENV` – optional; defaults to `development`. Set to `production` for production builds (enables esbuild minification).
  - `TELEGRAM_BOT_TOKEN` – bot token from `@BotFather`.
  - **Telegram Bot API endpoint & limits:**
    - `TELEGRAM_API_BASE` – optional; base URL for Telegram Bot API. Default (unset) is `https://api.telegram.org` with a 50 MB per‑file upload limit.
    - `TELEGRAM_MAX_VIDEO_MB` – optional; maximum video size (in MB) that this bot will attempt to upload. Default is `50`, matching the official Bot API limit. When using a self‑hosted Bot API server you can raise this (e.g. `2000`).
    - `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` – **required only** when you run a self‑hosted Telegram Bot API server (see Docker section). Obtain them from [`https://my.telegram.org/apps`](https://my.telegram.org/apps).
   - **Webhook (optional):** to run in webhook mode behind a reverse proxy:
     - `TELEGRAM_WEBHOOK_URL` – base URL Telegram will POST to (e.g. `https://your-domain.com`). The bot registers `{TELEGRAM_WEBHOOK_URL}/webhook`. Must be HTTPS in production.
     - `WEBHOOK_PORT` – port the HTTP server listens on (default `3000`). Use with a reverse proxy (e.g. nginx, Caddy) that forwards to this port.
     - `WEBHOOK_SECRET` – optional; if set, Telegram must send the same value in the `X-Telegram-Bot-Api-Secret-Token` header.
   - **Downloader:**
     - `TIKTOK_DOWNLOADER_BIN` – optional; path to downloader binary (default: `yt-dlp`).
     - `TIKTOK_DOWNLOADER_ARGS` – optional; extra CLI args (split on spaces). Default is `-o %(id)s.%(ext)s --merge-output-format mp4` so yt‑dlp merges into MP4 when possible (better for Telegram). You can append flags such as `--no-playlist` or `--restrict-filenames`.
     - `TIKTOK_DOWNLOADER_JS_RUNTIMES` – optional; set to `node` to use Node as yt‑dlp’s JS runtime. Reduces the *“No supported JavaScript runtime”* warning and can improve YouTube format availability. The bot passes the same Node executable it runs with. See the yt‑dlp EJS wiki for details.
   - **Cache (optional):**
     - `DATA_DIR` – directory for video cache (default `./data`); cache lives in `DATA_DIR/cache`. Use a persistent path (e.g. `/var/lib/teletok`). On Docker, this value in `.env` is used as the **host path** for the volume; the container always uses `/app/data`.
     - `CACHE_MAX_MB` – max cache size in MB (default `1024`). Oldest files are evicted when over the limit.

4. **Add bot to Telegram chat**

   - Create a bot via `@BotFather` and grab its token.
   - Add the bot to your group/channel and grant it permission to read messages and send messages.

5. **Run with Node**

   ```bash
   # Run continuously (long‑polling loop using the built bundle)
   npm run build
   npm start

   # Run from source in development (auto‑rebuild not included)
   npm run dev

   # Process a single polling cycle from source then exit (debugging/health check)
   npm run check
   ```

   You can use `pnpm` instead of `npm` if you prefer (e.g. `pnpm run build`, `pnpm start`).

**Webhook mode:** Set `TELEGRAM_WEBHOOK_URL` (e.g. `https://your-domain.com`) and optionally `WEBHOOK_PORT` (default `3000`), then start the bot (for example with `npm run build && npm start` or via Docker). On startup it will register `{TELEGRAM_WEBHOOK_URL}/webhook` with Telegram and listen for POSTs. Put a reverse proxy (nginx, Caddy, etc.) in front with HTTPS and proxy `/webhook` to `http://localhost:WEBHOOK_PORT`. Telegram requires HTTPS for webhooks.

### PM2 (optional, bare‑metal)

This project includes a PM2 configuration in `ecosystem.config.cjs`:

- App name: `teletok_bot`
- Script: `./src/index.js`

Start with:

```bash
npm run pm2
```

On Windows, you may see repeated PM2 errors like `Error: spawn wmic ENOENT`. These are usually harmless (PM2 trying to read CPU/memory via `wmic`). If they are noisy, you can simply run the bot with `npm start` instead of PM2.

### Docker / Docker Compose

You can run Teletok inside a container. The `Dockerfile` is multi-stage: builder runs `pnpm run build` (esbuild → `dist/index.js`); runtime image uses `node:20-slim`, installs `yt-dlp`, `ffmpeg`, and `python3` via apt/curl, installs production deps with pnpm, copies `dist/`, and runs `node dist/index.js`.

**Compose:** `docker-compose.yml` uses `env_file: .env`, sets `DATA_DIR=/app/data` in the container environment so writes go under the mounted volume, and mounts the host path to `/app/data`. The host path comes from `DATA_DIR` in your `.env` (default `./data`). Set `DATA_DIR` in `.env` to where you want the video cache on the host (e.g. `./data` or an absolute path); cache files live under `DATA_DIR/cache` on the host. Volume: `"${DATA_DIR:-./data}:/app/data"`.

The compose file also includes an optional self‑hosted Telegram Bot API server:

- Service `telegram-api` uses the `aiogram/telegram-bot-api` image, listens on port `8090`, persists its data under `./dist/telegram-bot-api-data`, and requires `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` in `.env`.
- Service `teletok` is configured with:
  - `TELEGRAM_API_BASE=http://telegram-bot-api:8090` so the bot talks to the local server instead of `https://api.telegram.org`.
  - `TELEGRAM_MAX_VIDEO_MB=2000` so the bot will attempt to upload videos up to ~2 GB when using the self‑hosted API (subject to Telegram’s server limits).

If you **don’t** want a local Telegram Bot API server, you can remove the `telegram-api` service and the extra environment variables in the `teletok` service; the bot will fall back to the official Bot API (`https://api.telegram.org`) with a 50 MB upload limit.

Build and run:

```bash
docker compose up -d --build
```

Or with plain Docker:

```bash
docker build -t teletok-bot .
docker run --rm -d --name teletok \
  --env-file .env \
  -v ./data:/app/data \
  teletok-bot
```

Ensure `.env` is configured before running.
