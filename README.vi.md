## Node Bot Template (Tiếng Việt)

Template bot Node.js tối giản dùng ES modules, `dotenv` và một vòng lặp theo chu kỳ đơn giản.  
Dùng repo này như điểm xuất phát cho các bot nhỏ (Telegram, HTTP polling, TikTok downloader, v.v.).

### Cách hoạt động

- **Entry point**: `src/index.js`
  - Load biến môi trường từ `.env` thông qua `dotenv/config`.
  - Định nghĩa hàm `runJobOnce()`, nơi bạn implement logic chính của bot.
  - Nếu chạy với `--once` thì chỉ gọi `runJobOnce()` một lần rồi thoát.
  - Nếu không, bot sẽ gọi `runJobOnce()` theo chu kỳ (mặc định 60 giây, có thể cấu hình bằng `BOT_INTERVAL_MS`).

- **Config**: `src/config/index.js`
  - Cung cấp hằng số `DATA_DIR` (thư mục `dist/` dưới thư mục làm việc hiện tại) để bạn lưu state hoặc file output nếu cần.

- **Helpers**: `src/lib/retry.js`
  - Hàm generic `withRetry(fn, options)` để chạy lại các thao tác async khi gặp lỗi tạm thời (ví dụ: lỗi mạng).
  - Template không dùng trực tiếp, nhưng bạn có thể dùng cho HTTP client hoặc I/O khác.

### Cài đặt

1. **Cài dependency**

   ```bash
   npm install
   # hoặc
   pnpm install
   ```

2. **Cấu hình environment**

   Copy `.env.example` sang `.env` rồi chỉnh lại giá trị nếu cần:

   ```bash
   cp .env.example .env
   ```

   Các biến hiện có:

   - `NODE_ENV` – tùy chọn, mặc định `development`.
   - `BOT_INTERVAL_MS` – tùy chọn, interval (ms) giữa các lần chạy job (mặc định `60000`).

3. **Chạy bot**

   ```bash
   # Chạy liên tục (interval loop)
   npm start

   # Chạy một lần rồi thoát (hữu ích để test job)
   npm run check
   ```

   Bạn có thể dùng `pnpm` thay cho `npm` nếu quen.

### PM2 (tùy chọn)

Template này có sẵn cấu hình PM2 cơ bản trong `ecosystem.config.cjs`:

- Tên app: `node_bot_template`
- Script: `./src/index.js`

Chạy bằng:

```bash
npm run pm2
```

Trên Windows, có thể xuất hiện lỗi lặp lại như `Error: spawn wmic ENOENT`. Thường đây là lỗi vô hại (PM2 cố đọc CPU/memory qua `wmic`). Nếu thấy phiền, bạn chỉ cần dùng `npm start` thay vì PM2.

### Mở rộng template

- Đặt toàn bộ logic chính vào `runJobOnce()` trong `src/index.js` (gọi API, gửi message, xử lý queue, v.v.).
- Khi logic lớn dần, bạn có thể:
  - Tách thành module riêng, ví dụ `src/jobs/my-job.js`, rồi import và gọi từ `src/index.js`.
  - Thêm các client trong `src/clients/` (ví dụ `telegram`, `http`, `tiktok`) và dùng `withRetry` để tăng độ ổn định.
  - Dùng `DATA_DIR` trong `src/config/index.js` cho các file state bạn cần lưu.

Repo này được giữ cố ý nhỏ gọn để bạn tùy biến theo đúng use case bot của mình.

