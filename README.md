## Teletok – TikTok Telegram Reupload Bot

Teletok is a Node.js bot that listens in a Telegram chat, detects TikTok links, downloads the video via an external downloader (e.g. `yt-dlp`), reuploads the video into the same chat, and then deletes the temporary file.

> Note: You are responsible for complying with TikTok's terms of service and local laws when using any downloader.

### How it works

- **Entry point**: `src/index.js`
  - Loads environment variables from `.env` via `dotenv/config`.
  - If `TELEGRAM_WEBHOOK_URL` is set, runs in **webhook mode**: registers the webhook with Telegram and starts an HTTP server that receives POSTs. Otherwise runs in **long-poll mode**: calls `runTikTokBot()` and polls `getUpdates`.
  - Supports `--once` in long-poll mode (one cycle then exit).

- **Job**: `src/jobs/tiktok-bot.js`
  - Long-poll: repeatedly calls Telegram's `getUpdates` API. Webhook: each incoming POST body is one update, processed the same way.
  - For each incoming message (or edited message), extracts the first short-video URL (TikTok, YouTube Shorts, Instagram Reels).
  - Downloads the TikTok video, reuploads it as a video message (reply to the original), cleans up temp files; on failure, sends a short error message.

- **Clients**:
  - `src/clients/telegram.js` – thin wrapper around Telegram Bot API:
    - `getUpdates`, `sendTextMessage`, `sendVideo`.
  - `src/clients/tiktok.js` – TikTok download helper:
    - Calls an external CLI (default `yt-dlp`), writes video to a temp directory, and returns `{filePath, cleanup}`.

- **Config & helpers**:
  - `src/config/index.js` – `DATA_DIR` constant (currently unused, available for future state).
  - `src/lib/retry.js` – `withRetry(fn, options)` helper to rerun transiently failing async operations.

### Project structure

| Path | Purpose |
|------|---------|
| `src/index.js` | Entry point; webhook or long-poll. |
| `src/jobs/tiktok-bot.js` | Update processing, URL extraction, download + reupload. |
| `src/server/webhook.js` | HTTP server for webhook mode (POST `/webhook`). |
| `src/clients/telegram.js` | Telegram Bot API: `getUpdates`, `setWebhook`, `sendMessage`, `sendVideo`. |
| `src/clients/tiktok.js` | Runs external downloader (yt-dlp), temp dir + cleanup. |
| `src/config/index.js` | `DATA_DIR`. |
| `src/lib/retry.js` | `withRetry()`. |
| `ecosystem.config.cjs` | PM2 app config (`teletok_bot`). |
| `Dockerfile` / `docker-compose.yml` | Container build and run. |
| `scripts/pm2-resurrect.sh` | PM2 resurrect + start + save (e.g. at login). |

### Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Bundle app with esbuild to `dist/index.js`. |
| `npm run dev` | Run bot from source (development). |
| `npm start` | Run built bundle (long-poll loop). Run `npm run build` first. |
| `npm run check` | Run one poll cycle from source and exit. |
| `npm run lint` | Biome check and fix. |
| `npm run pm2` | Start with PM2. |

### Setup

1. **Install dependencies**

   ```bash
   npm install
   # or
   pnpm install
   ```

2. **Install TikTok downloader CLI**

   Install [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) (recommended) or another CLI that can download TikTok videos, and make sure it is on your `PATH`.

   **YouTube / JS runtime:** For YouTube (and Shorts), yt-dlp may warn *“No supported JavaScript runtime could be found”* and some formats can be missing. To fix this, set `TIKTOK_DOWNLOADER_JS_RUNTIMES=node` in `.env`. The bot will then call yt-dlp with `--js-runtimes node:<path-to-node>`, using the same Node that runs the bot. No extra install is needed when the app already runs on Node (e.g. in Docker the image has both Node and yt-dlp).

3. **Configure environment**

   Copy `.env.example` to `.env` and adjust values:

   ```bash
   cp .env.example .env
   ```

   Variables:

   - `NODE_ENV` – optional; defaults to `development`.
   - `TELEGRAM_BOT_TOKEN` – bot token from `@BotFather`.
  - **Webhook (optional):** If you run behind a reverse proxy or want webhook instead of long-poll:
    - `TELEGRAM_WEBHOOK_URL` – base URL Telegram will POST to (e.g. `https://your-domain.com`). The bot registers `{TELEGRAM_WEBHOOK_URL}/webhook`. Must be HTTPS in production.
    - `WEBHOOK_PORT` – port the HTTP server listens on (default `3000`). Use with a reverse proxy (e.g. nginx, Caddy) that forwards to this port.
    - `WEBHOOK_SECRET` – optional; if set, Telegram must send the same value in `X-Telegram-Bot-Api-Secret-Token` header.
  - `TIKTOK_DOWNLOADER_BIN` – optional; path to downloader binary (default: `yt-dlp`).
  - `TIKTOK_DOWNLOADER_ARGS` – optional; extra CLI args (split on spaces), defaults to `-o %(id)s.%(ext)s --merge-output-format mp4` so yt-dlp merges into MP4 when possible (better for Telegram). The bot still prefers `.mp4` when choosing the file to send.
  - `TIKTOK_DOWNLOADER_JS_RUNTIMES` – optional; set to `node` to use Node as yt-dlp’s JS runtime. Reduces the *“No supported JavaScript runtime”* warning and can improve YouTube format availability. The bot passes the same Node executable it runs with. See [yt-dlp EJS wiki](https://github.com/yt-dlp/yt-dlp/wiki/EJS).

4. **Add bot to Telegram chat**

   - Create a bot via `@BotFather` and grab its token.
   - Add the bot to your group/channel and grant it permission to read messages and send messages.

5. **Run with Node**

   ```bash
   # Run continuously (long-polling loop)
   npm start

   # Process a single polling cycle then exit (debugging)
   npm run check
   ```

   You can also use `pnpm` instead of `npm` if you prefer.

**Webhook mode:** Set `TELEGRAM_WEBHOOK_URL` (e.g. `https://your-domain.com`) and optionally `WEBHOOK_PORT` (default `3000`), then start the bot. It will register `{TELEGRAM_WEBHOOK_URL}/webhook` with Telegram and listen for POSTs. Put a reverse proxy (nginx, Caddy, etc.) in front with HTTPS and proxy `/webhook` to `http://localhost:WEBHOOK_PORT`. Telegram requires HTTPS for webhooks.

### PM2 (optional, bare-metal)

This project includes a PM2 configuration in `ecosystem.config.cjs`:

- App name: `teletok_bot`
- Script: `./src/index.js`

Start with:

```bash
npm run pm2
```

On Windows, you may see repeated PM2 errors like `Error: spawn wmic ENOENT`. These are usually harmless (PM2 trying to read CPU/memory via `wmic`). If they are noisy, you can simply run the bot with `npm start` instead of PM2.

### Docker / Docker Compose

You can also run Teletok inside a container. The provided `Dockerfile`:

- Uses `node:20-slim`.
- Installs `yt-dlp` (standalone binary from GitHub), `ffmpeg`, and `python3`.
- Builds the app with esbuild, installs production dependencies, and runs `dist/index.js`.

Build and run directly with Docker:

```bash
docker build -t teletok-bot .
docker run --rm -d --name teletok \
  --env-file .env \
  teletok-bot
```

Or use Docker Compose (recommended for servers):

```bash
docker compose up -d --build
```

The compose file reads environment variables from `.env`, so make sure it is configured before running.
