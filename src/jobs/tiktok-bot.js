import {
  deleteMessage,
  getUpdates,
  sendChatAction,
  sendTextMessage,
  sendVideo,
  TelegramFileTooLargeError,
} from "../clients/telegram.js";
import {
  downloadShortVideo,
  VIDEO_UNAVAILABLE_AUDIENCES_CODE,
} from "../clients/tiktok.js";
import {
  getCachedFileId,
  getCachedVideoPath,
  removeCachedFileId,
  storeCachedFileId,
  storeCachedVideo,
} from "../lib/cache.js";
import {hashUrl, normalizeUrl} from "../lib/dedup.js";

const SHORT_VIDEO_PATTERNS = [
  {
    pattern: /https?:\/\/(?:www\.)?(?:vm\.|vt\.)?tiktok\.com\/[^\s]+/i,
    source: "TikTok",
  },
  {
    pattern:
      /https?:\/\/(?:www\.)?youtube\.com\/shorts\/[^\s]+|https?:\/\/youtu\.be\/[^\s]+/i,
    source: "YouTube",
  },
  {
    pattern: /https?:\/\/(?:www\.)?instagram\.com\/(?:reels|reel)\/[^\s]+/i,
    source: "Instagram",
  },
  {
    pattern:
      /https?:\/\/(?:www\.|m\.)?(?:facebook\.com|fb\.com|fb\.watch)\/(?:share\/[a-z]\/[^\s]+|reel\/[^\s]+|watch\/[^\s]+|[^\s]*\?v=\d+)/i,
    source: "Facebook",
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

/** Telegram Bot API caption limit for sendVideo. */
const MAX_VIDEO_CAPTION_CHARS = 1024;

const indefiniteArticle = (word) =>
  /^[aeiou]/i.test(String(word).trim().charAt(0)) ? "an" : "a";

const buildCaption = ({message, source}) => {
  const article = indefiniteArticle(source);
  const sourceOnly = `${article} ${source} video`;

  const from = message?.from;
  let requester = null;
  if (from) {
    const name = [from.first_name, from.last_name]
      .filter((part) => typeof part === "string" && part.trim().length > 0)
      .join(" ")
      .trim();
    const username =
      typeof from.username === "string" && from.username.trim().length > 0
        ? from.username.trim()
        : "";
    requester =
      name && username
        ? `${name} (@${username})`
        : name || (username ? `@${username}` : null);
  }

  if (!requester) {
    return sourceOnly;
  }

  const tail = ` sent ${article} ${source} video`;
  let caption = `${requester}${tail}`;
  if (caption.length <= MAX_VIDEO_CAPTION_CHARS) {
    return caption;
  }

  const ellipsis = "…";
  const maxRequester = MAX_VIDEO_CAPTION_CHARS - tail.length - ellipsis.length;
  if (maxRequester < 1) {
    return sourceOnly;
  }

  const trimmed = requester.slice(0, maxRequester).trimEnd();
  caption = `${trimmed}${ellipsis}${tail}`;
  return caption.length <= MAX_VIDEO_CAPTION_CHARS
    ? caption
    : caption.slice(0, MAX_VIDEO_CAPTION_CHARS);
};

const handleShortVideoMessage = async (message, url, source, urlHash) => {
  const chat = message.chat;
  if (!chat?.id) return;

  const chatId = chat.id;
  const messageId = message.message_id;
  const caption = buildCaption({message, source});

  try {
    await sendChatAction({action: "upload_video", chatId});

    // Fast path: re-send by cached Telegram file_id — zero byte transfer, no disk read.
    const cachedFileId = await getCachedFileId(urlHash);
    if (cachedFileId) {
      try {
        await sendVideo({
          caption,
          chatId,
          fileId: cachedFileId,
          replyToMessageId: messageId,
          // A stale id is rejected with an HTTP status (400/5xx) and won't fix
          // itself on retry — fall back to upload at once. Only genuine
          // connection errors (no response) are worth retrying here.
          retry: {retryable: (err) => !err?.response},
        });
        return;
      } catch (err) {
        // file_id is bound to the Bot API server + its data volume; if that was
        // wiped/migrated the id is stale. Drop it and fall back to a real upload.
        console.error(
          new Date().toISOString(),
          "sendVideo by file_id failed; falling back to upload:",
          err?.message ?? err,
        );
        await removeCachedFileId(urlHash).catch(() => {
          // best-effort cleanup; ignore errors
        });
      }
    }

    // Slow path: serve from disk cache, or download then cache.
    let cleanup = null;
    let filePath = await getCachedVideoPath(urlHash);
    if (!filePath) {
      const downloaded = await downloadShortVideo(url);
      filePath = await storeCachedVideo(downloaded.filePath, urlHash);
      cleanup = downloaded.cleanup;
    }
    try {
      const result = await sendVideo({
        caption,
        chatId,
        filePath,
        replyToMessageId: messageId,
      });
      // Remember the file_id so future requests for this url skip the upload.
      const fileId = result?.video?.file_id;
      if (fileId) {
        await storeCachedFileId(urlHash, fileId).catch(() => {
          // non-fatal: a missed file_id just means the next request re-uploads
        });
      }
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
    const isUnavailableForAudience =
      err?.code === VIDEO_UNAVAILABLE_AUDIENCES_CODE;
    const userMessage = isTooLarge
      ? "Video quá lớn (Telegram giới hạn 50MB), không thể gửi."
      : isUnavailableForAudience
        ? "Nội dung này hiện không khả dụng cho một số đối tượng nên bot không thể tải được."
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
