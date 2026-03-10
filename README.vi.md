## Teletok – TikTok Telegram Reupload Bot (Tiếng Việt)

Teletok là bot Node.js nghe trong nhóm Telegram, tự phát hiện link TikTok, tải video về bằng CLI ngoài (ví dụ `yt-dlp`), reup lại video vào chính nhóm và xoá file tạm trên máy.

> Lưu ý: Khi dùng bất kỳ tool tải TikTok nào, bạn tự chịu trách nhiệm tuân thủ điều khoản của TikTok và luật tại nơi bạn sống.

### Cách hoạt động

- **Entry point**: `src/index.js`
  - Load biến môi trường từ `.env` thông qua `dotenv/config`.
  - Gọi `runTikTokBot()` từ `src/jobs/tiktok-bot.js` để khởi động vòng lặp bot.
  - Hỗ trợ tham số `--once` để chạy một vòng poll rồi thoát (hữu ích khi debug).

- **Job**: `src/jobs/tiktok-bot.js`
  - Long-poll API `getUpdates` của Telegram.
  - Với mỗi message (hoặc edited message), trích link TikTok đầu tiên trong nội dung.
  - Tải video TikTok, reup lại dưới dạng video reply vào message gốc và dọn file tạm; nếu lỗi thì gửi tin nhắn lỗi ngắn.

- **Clients**:
  - `src/clients/telegram.js` – wrapper mỏng cho Telegram Bot API:
    - `getUpdates`, `sendTextMessage`, `sendVideo`.
  - `src/clients/tiktok.js` – helper tải TikTok:
    - Gọi CLI ngoài (mặc định `yt-dlp`), lưu video vào thư mục tạm, trả về `{filePath, cleanup}`.

- **Config & helpers**:
  - `src/config/index.js` – hằng `DATA_DIR` (hiện chưa dùng, để dành cho state về sau).
  - `src/lib/retry.js` – helper `withRetry(fn, options)` để retry các thao tác async khi lỗi tạm thời.

### Cấu trúc project

| Đường dẫn | Mục đích |
|-----------|----------|
| `src/index.js` | Entry point; gọi `runTikTokBot()`. |
| `src/jobs/tiktok-bot.js` | Vòng long-poll, trích URL, tải + reup. |
| `src/clients/telegram.js` | Telegram Bot API: `getUpdates`, `sendTextMessage`, `sendVideo`. |
| `src/clients/tiktok.js` | Chạy downloader ngoài (yt-dlp), thư mục tạm + cleanup. |
| `src/config/index.js` | `DATA_DIR`. |
| `src/lib/retry.js` | `withRetry()`. |
| `ecosystem.config.cjs` | Cấu hình PM2 (`teletok_bot`). |
| `Dockerfile` / `docker-compose.yml` | Build và chạy container. |
| `scripts/pm2-resurrect.sh` | PM2 resurrect + start + save (ví dụ lúc login). |

### Scripts

| Script | Mô tả |
|--------|--------|
| `npm start` | Chạy bot (vòng long-poll). |
| `npm run check` | Chạy một vòng poll rồi thoát. |
| `npm run lint` | Biome check và fix. |
| `npm run pm2` | Chạy bằng PM2. |

### Cài đặt

1. **Cài dependency**

   ```bash
   npm install
   # hoặc
   pnpm install
   ```

2. **Cài CLI tải TikTok**

   Cài [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) (khuyến nghị) hoặc CLI khác có thể tải video TikTok, và đảm bảo nó nằm trong `PATH`.

3. **Cấu hình environment**

   Copy `.env.example` sang `.env` rồi chỉnh lại:

   ```bash
   cp .env.example .env
   ```

   Các biến:

   - `NODE_ENV` – tùy chọn, mặc định `development`.
   - `TELEGRAM_BOT_TOKEN` – token bot lấy từ `@BotFather`.
   - `TIKTOK_DOWNLOADER_BIN` – tùy chọn, path tới binary downloader (mặc định `yt-dlp`).
   - `TIKTOK_DOWNLOADER_ARGS` – tùy chọn, thêm tham số CLI (tách bằng space), mặc định `-o %(id)s.%(ext)s`.

4. **Thêm bot vào nhóm Telegram**

   - Tạo bot qua `@BotFather` và lấy token.
   - Add bot vào nhóm, cấp quyền đọc message và gửi message.

5. **Chạy bot bằng Node**

   ```bash
   # Chạy liên tục (long-polling loop)
   npm start

   # Chạy một vòng poll rồi thoát (debug)
   npm run check
   ```

   Bạn có thể dùng `pnpm` thay cho `npm` nếu quen.

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

Bạn cũng có thể chạy Teletok trong container. `Dockerfile` đi kèm sẽ:

- Dùng base image `node:20-slim`.
- Cài `yt-dlp` (binary từ GitHub), `ffmpeg` và `python3`.
- Cài dependency production và chạy `src/index.js`.

Build và chạy trực tiếp với Docker:

```bash
docker build -t teletok-bot .
docker run --rm -d --name teletok \
  --env-file .env \
  teletok-bot
```

Hoặc dùng Docker Compose (khuyến nghị cho server):

```bash
docker compose up -d --build
```

File compose sẽ đọc biến môi trường từ `.env`, nên nhớ cấu hình `.env` trước khi chạy.

