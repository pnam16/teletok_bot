## Teletok – TikTok Telegram Reupload Bot (Tiếng Việt)

Teletok là bot Node.js nghe trong nhóm/kênh Telegram, tự phát hiện link video ngắn (TikTok, YouTube Shorts, Instagram Reels), tải video bằng CLI ngoài (ví dụ `yt-dlp`), reup vào chính chat và xoá file tạm. Hỗ trợ long‑poll và webhook.

> Lưu ý: Bạn tự chịu trách nhiệm tuân thủ điều khoản từng nền tảng và luật địa phương khi dùng tool tải.

### Cách hoạt động

- **Entry point**: `src/index.js`
  - Load `.env` ngay từ đầu (`dotenv/config`); log dòng `Data dir (cache + dedup):` cùng `DATA_DIR` khi khởi động.
  - Nếu có `TELEGRAM_WEBHOOK_URL` → chế độ **webhook**: đăng ký webhook và chạy HTTP server nhận POST.
  - Nếu không → chế độ **long‑poll**: gọi `runTikTokBot()` từ `src/jobs/tiktok-bot.js`, poll `getUpdates`.
  - Hỗ trợ `--once` (một vòng poll rồi thoát) để debug/health check.

- **Job**: `src/jobs/tiktok-bot.js`
  - Long‑poll: gọi `getUpdates` (timeout 25s), xử lý mỗi lô với đồng thời tối đa 2 update. Webhook: mỗi POST body là một update, cùng hàm `processUpdate`.
  - Với mỗi message (hoặc edited), trích URL video ngắn đầu tiên (TikTok, YouTube Shorts, Instagram Reels).
  - Chuẩn hoá URL, hash làm key cache; tìm trong `DATA_DIR/cache` theo hash, có thì reup từ cache, không thì tải rồi lưu cache rồi reup. Cùng URL mọi chat đều reup từ cache (một lần tải mỗi URL).
  - Gửi trạng thái “uploading video”, rồi gửi video (reply) kèm caption `Reup từ {source}`, hoặc tin nhắn lỗi ngắn (tiếng Việt).
  - **Xoá tin reup:** Reply vào tin video do bot gửi với `/panic` hoặc `/remove` để xoá tin đó (chỉ áp dụng tin do bot gửi).

- **Clients**: `src/clients/telegram.js` (getUpdates, setWebhook, deleteWebhook, sendChatAction, sendTextMessage, sendVideo, deleteMessage; axios + withRetry), `src/clients/tiktok.js` (spawn yt-dlp hoặc CLI khác, thư mục tạm, trả về `{filePath, cleanup}`).

- **Config & helpers**:
  - `src/config/index.js` – `DATA_DIR` (mặc định `./data`), bỏ dấu ngoặc và chuẩn hoá đường dẫn (Windows).
  - `src/lib/dedup.js` – chỉ dùng cho key cache: `normalizeUrl()`, `hashUrl()`.
  - `src/lib/cache.js` – cache video trong `DATA_DIR/cache` (key theo hash), giới hạn `CACHE_MAX_MB`, xóa file cũ nhất khi vượt. Trên Windows nếu `rename()` lỗi thì copy rồi xóa file tạm.
  - `src/lib/retry.js` – `withRetry()`. `src/server/webhook.js` – server webhook (POST `/webhook`, secret token, parse JSON tối đa ~512 KB, trả `{}` nhanh rồi xử lý update bất đồng bộ).

### Cấu trúc project

| Đường dẫn | Mục đích |
|-----------|----------|
| `src/index.js` | Entry point; chọn webhook hoặc long‑poll, log DATA_DIR. |
| `src/jobs/tiktok-bot.js` | Xử lý update, trích URL, tra cache, tải + reup. |
| `src/server/webhook.js` | HTTP server webhook: `createWebhookServer`, `runWebhookServer`; POST `/webhook`, secret token tùy chọn. |
| `src/clients/telegram.js` | Telegram Bot API client (getUpdates, webhook, gửi/xoá tin nhắn, upload video). |
| `src/clients/tiktok.js` | Chạy downloader ngoài, temp + cleanup. |
| `src/config/index.js` | DATA_DIR. |
| `src/lib/dedup.js` | URL helpers: normalizeUrl, hashUrl (key cache). |
| `src/lib/cache.js` | Cache video, giới hạn dung lượng. |
| `src/lib/retry.js` | withRetry(). |
| `build.mjs` | Script esbuild; output `dist/index.js` (chạy qua `npm run build`). |
| `pnpm-lock.yaml` | Lockfile; Docker build dùng `pnpm install --frozen-lockfile`. |
| `biome.json` | Cấu hình Biome lint/format (`npm run lint`). |
| `ecosystem.config.cjs` | PM2 (`teletok_bot`). |
| `Dockerfile` / `docker-compose.yml` | Build và chạy container; volume DATA_DIR. |
| `scripts/pm2-resurrect.sh` | PM2 resurrect + start + save. |

### Scripts

Các script trong `package.json`, chạy bằng `npm` hoặc `pnpm`:

| Script | Mô tả |
|--------|-------|
| `npm run build` | Bundle esbuild ra `dist/index.js`. |
| `npm run dev` | Chạy từ source (`src/index.js`). |
| `npm run check` | Một vòng poll rồi thoát. |
| `npm run docker` | `docker compose up -d --build`. |
| `npm run lint` | Biome check --write. |
| `npm run pm2` | Chạy bằng PM2. |
| `npm start` | Chạy bundle `dist/index.js` (cần build trước hoặc Docker). |
| `npm run start:envfile` | Chạy bundle với `node --env-file=.env dist/index.js`. |

### Cài đặt

1. **Cài dependency**

   ```bash
   npm install
   # hoặc
   pnpm install
   ```

2. **Cài CLI tải video ngắn**

   Cài [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) (khuyến nghị) hoặc CLI khác tải được TikTok/Shorts/Reels, và đảm bảo nó nằm trong `PATH`.

   **YouTube / JS runtime:** Với YouTube (và Shorts), yt‑dlp có thể báo *“No supported JavaScript runtime could be found”* và thiếu format. Đặt `TIKTOK_DOWNLOADER_JS_RUNTIMES=node` trong `.env` để bot gọi yt‑dlp kèm `--js-runtimes node:<đường-dẫn-node>`, dùng chính Node đang chạy bot. Trong Docker image đã có sẵn Node và yt‑dlp.

3. **Cấu hình environment**

   Copy `.env.example` sang `.env` rồi chỉnh lại:

   ```bash
   cp .env.example .env
   ```

   Các biến chính (xem `.env.example`):

   - `NODE_ENV`, `TELEGRAM_BOT_TOKEN`.
   - **Endpoint & giới hạn Telegram Bot API:**
     - `TELEGRAM_API_BASE` – tuỳ chọn; base URL cho Telegram Bot API. Mặc định (không đặt) là `https://api.telegram.org` với giới hạn upload 50 MB mỗi file.
     - `TELEGRAM_MAX_VIDEO_MB` – tuỳ chọn; dung lượng tối đa (MB) mà bot sẽ cố upload. Mặc định `50`, trùng với giới hạn API chính thức. Khi dùng server Bot API tự host có thể tăng (ví dụ `2000`).
     - `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` – **chỉ bắt buộc** khi chạy server Telegram Bot API tự host (xem phần Docker). Lấy tại [`https://my.telegram.org/apps`](https://my.telegram.org/apps).
   - Webhook (tuỳ chọn): `TELEGRAM_WEBHOOK_URL`, `WEBHOOK_PORT`, `WEBHOOK_SECRET`.
   - Downloader: `TIKTOK_DOWNLOADER_BIN`, `TIKTOK_DOWNLOADER_ARGS`, `TIKTOK_DOWNLOADER_JS_RUNTIMES`.
   - Cache: `DATA_DIR` (mặc định `./data`; cache trong `DATA_DIR/cache`; trên Docker thì `DATA_DIR` trong `.env` là **đường dẫn host** cho volume, container dùng `/app/data`), `CACHE_MAX_MB`.

4. **Thêm bot vào nhóm Telegram**

   - Tạo bot qua `@BotFather` và lấy token.
   - Add bot vào nhóm, cấp quyền đọc message và gửi message.

5. **Chạy bot bằng Node**

   ```bash
   npm run build
   npm start
   # hoặc từ source: npm run dev
   # một vòng rồi thoát: npm run check
   ```

   Có thể dùng `pnpm` thay `npm`. Webhook: set `TELEGRAM_WEBHOOK_URL`, chạy bot, cấu hình reverse proxy HTTPS trỏ `/webhook` về port (mặc định 3000).

### PM2 (tùy chọn, chạy trực tiếp trên máy)

Repo có sẵn cấu hình PM2 trong `ecosystem.config.cjs`:

- Tên app: `teletok_bot`
- Script: `./src/index.js`

Chạy bằng:

```bash
npm run pm2
```

Trên Windows có thể xuất hiện lỗi lặp `Error: spawn wmic ENOENT`. Thường đây là lỗi vô hại (PM2 cố đọc CPU/memory qua `wmic`). Nếu thấy phiền, chỉ cần dùng `npm start` thay cho PM2.

### Docker / Docker Compose

Chạy Teletok trong container: `Dockerfile` hai stage—builder chạy `pnpm run build` (esbuild → `dist/index.js`); image chạy dùng `node:20-slim`, cài `yt-dlp`, `ffmpeg`, `python3`, cài dependency prod bằng pnpm, copy `dist/`, chạy `node dist/index.js`.

**Compose:** `docker-compose.yml` dùng `env_file: .env`, ghi đè `DATA_DIR=/app/data` trong container để ghi cache vào volume đã mount, và mount thư mục host vào `/app/data`. Đường dẫn host lấy từ `DATA_DIR` trong `.env` (mặc định `./data`). Cache trên host nằm trong `DATA_DIR/cache`.

File compose cũng có sẵn một service Telegram Bot API tự host (tuỳ chọn):

- Service `telegram-api` dùng image `aiogram/telegram-bot-api`, lắng trên port `8090`, lưu data dưới `./dist/telegram-bot-api-data`, và cần `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` trong `.env`.
- Service `teletok` được cấu hình:
  - `TELEGRAM_API_BASE=http://telegram-bot-api:8090` để bot gọi server local thay vì `https://api.telegram.org`.
  - `TELEGRAM_MAX_VIDEO_MB=2000` để bot cố gắng upload video tới ~2 GB khi dùng API tự host (còn tuỳ giới hạn phía Telegram).

Nếu **không** muốn chạy Telegram Bot API tự host, bạn có thể xoá service `telegram-api` và hai biến môi trường thêm vào trong service `teletok`; khi đó bot dùng lại API chính thức với giới hạn 50 MB.

```bash
docker compose up -d --build
```

Hoặc Docker thuần:

```bash
docker build -t teletok-bot .
docker run --rm -d --name teletok --env-file .env -v ./data:/app/data teletok-bot
```

Cấu hình `.env` trước khi chạy.

