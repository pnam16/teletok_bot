import {
  deleteMessage,
  getUpdates,
  sendChatAction,
  sendTextMessage,
  sendVideo,
  TelegramFileTooLargeError,
} from "../clients/telegram.js";
import {downloadShortVideo} from "../clients/tiktok.js";
import {getCachedVideoPath, storeCachedVideo} from "../lib/cache.js";
import {hashUrl, normalizeUrl} from "../lib/dedup.js";

const SHORT_VIDEO_PATTERNS = [
  {
    pattern: /https?:\/\/(?:www\.)?(?:vm\.|vt\.)?tiktok\.com\/[^\s]+/i,
    source: "TikTok",
  },
  {
    pattern:
      /https?:\/\/(?:www\.)?youtube\.com\/shorts\/[^\s]+|https?:\/\/youtu\.be\/[^\s]+/i,
    source: "YouTube Shorts",
  },
  {
    pattern: /https?:\/\/(?:www\.)?instagram\.com\/reel\/[^\s]+/i,
    source: "Instagram Reels",
  },
];

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });

const PANIC_COMMAND = "/panic";
const REMOVE_COMMAND = "/remove";

const extractShortVideoLink = (text) => {
  if (!text) return null;
  for (const {pattern, source} of SHORT_VIDEO_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return {source, url: match[0]};
    }
  }
  return null;
};

const handleShortVideoMessage = async (message, url, source, urlHash) => {
  const chat = message.chat;
  if (!chat || !chat.id) return;

  const chatId = chat.id;
  const messageId = message.message_id;

  try {
    await sendChatAction({action: "upload_video", chatId});
    let cleanup = null;
    let filePath = await getCachedVideoPath(urlHash);
    if (!filePath) {
      const downloaded = await downloadShortVideo(url);
      filePath = await storeCachedVideo(downloaded.filePath, urlHash);
      cleanup = downloaded.cleanup;
    }
    try {
      await sendVideo({
        caption: `Reup từ ${source}`,
        chatId,
        filePath,
        replyToMessageId: messageId,
      });
    } finally {
      if (typeof cleanup === "function") await cleanup();
    }
  } catch (err) {
    console.error(
      new Date().toISOString(),
      "Failed to process short video message:",
      err,
    );
    const isTooLarge =
      err instanceof TelegramFileTooLargeError || err.response?.status === 413;
    const userMessage = isTooLarge
      ? "Video quá lớn (Telegram giới hạn 50MB), không thể gửi."
      : "Tải video thất bại, thử lại sau nha.";
    try {
      await sendTextMessage({
        chatId,
        replyToMessageId: messageId,
        text: userMessage,
      });
    } catch (notifyErr) {
      console.error(
        new Date().toISOString(),
        "Also failed to send error message:",
        notifyErr,
      );
    }
  }
};

/** Process a single Telegram update. Used by both long-poll and webhook. */
export const processUpdate = async (update) => {
  const message = update.message ?? update.edited_message;
  if (!message) return;

  const text = (message.text ?? message.caption ?? "").trim();
  const chat = message.chat;
  const chatId = chat?.id;

  if (
    chatId &&
    [PANIC_COMMAND, REMOVE_COMMAND].includes(text) &&
    message.reply_to_message
  ) {
    const replied = message.reply_to_message;
    const targetId = replied.message_id;
    const isBotMessage = replied.from?.is_bot === true;

    if (!isBotMessage) {
      try {
        await sendTextMessage({
          chatId,
          replyToMessageId: message.message_id,
          text: "Chỉ có thể xoá tin do bot gửi. Reply vào tin video reup của bot rồi gửi lại /panic.",
        });
      } catch (e) {
        console.error(
          new Date().toISOString(),
          "Failed to send 'bot-only' hint:",
          e,
        );
      }
      return;
    }

    try {
      await deleteMessage({chatId, messageId: targetId});
    } catch (err) {
      console.error(new Date().toISOString(), "Failed to delete message:", err);
      try {
        await sendTextMessage({
          chatId,
          replyToMessageId: message.message_id,
          text: "Lỗi xoá tin nhắn.",
        });
      } catch (notifyErr) {
        console.error(
          new Date().toISOString(),
          "Failed to send error message:",
          notifyErr,
        );
      }
    }
    return;
  }

  const link = extractShortVideoLink(text);
  if (!link) return;

  const normalized = normalizeUrl(link.url);
  const urlHash = hashUrl(normalized);

  // Global dedup: always process so we can reup from cache (DATA_DIR/cache) when available.
  // First time: cache miss → download, store, reup. Later (same URL, any chat): cache hit → reup from cache only.
  await handleShortVideoMessage(message, link.url, link.source, urlHash);
};

export const runTikTokBot = async ({runOnce = false} = {}) => {
  let offset;

  // Basic safety check so we fail fast if token is missing.
  try {
    await getUpdates({offset: 0, timeoutSeconds: 0});
  } catch (err) {
    console.error(
      new Date().toISOString(),
      "Telegram getUpdates failed at startup:",
      err,
    );
    throw err;
  }

  const CONCURRENCY = 2;

  const processWithConcurrency = async (updates) => {
    const run = async (idx) => {
      if (idx >= updates.length) return;
      await processUpdate(updates[idx]);
      await run(idx + CONCURRENCY);
    };
    await Promise.all(
      Array.from({length: Math.min(CONCURRENCY, updates.length)}, (_, i) =>
        run(i),
      ),
    );
  };

  // Main long-poll loop
  while (true) {
    try {
      const updates = await getUpdates({offset, timeoutSeconds: 25});
      if (Array.isArray(updates) && updates.length > 0) {
        offset = updates[updates.length - 1].update_id + 1;
        await processWithConcurrency(updates);
      }
    } catch (err) {
      console.error(new Date().toISOString(), "Polling error:", err);
      await sleep(5000);
    }

    if (runOnce) {
      break;
    }
  }
};
