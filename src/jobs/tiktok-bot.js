import {getUpdates, sendTextMessage, sendVideo} from "../clients/telegram.js";
import {downloadTikTokVideo} from "../clients/tiktok.js";

const TIKTOK_URL_REGEX = /https?:\/\/(?:www\.)?(?:vm\.|vt\.)?tiktok\.com\/\S+/i;

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });

const extractTikTokUrl = (text) => {
  if (!text) {
    return null;
  }
  const match = text.match(TIKTOK_URL_REGEX);
  if (!match) {
    return null;
  }
  return match[0];
};

const handleTikTokMessage = async (message, url) => {
  const chat = message.chat;
  if (!chat || !chat.id) {
    return;
  }

  const chatId = chat.id;
  const messageId = message.message_id;

  try {
    const {filePath, cleanup} = await downloadTikTokVideo(url);

    try {
      await sendVideo({
        caption: "Reup từ TikTok",
        chatId,
        filePath,
        replyToMessageId: messageId,
      });
    } finally {
      if (typeof cleanup === "function") {
        await cleanup();
      }
    }
  } catch (err) {
    console.error(
      new Date().toISOString(),
      "Failed to process TikTok message:",
      err,
    );
    try {
      await sendTextMessage({
        chatId,
        replyToMessageId: messageId,
        text: "Tải video TikTok thất bại, thử lại sau nha.",
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

  // Main long-poll loop
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const updates = await getUpdates({offset, timeoutSeconds: 25});
      if (Array.isArray(updates) && updates.length > 0) {
        for (const update of updates) {
          offset = update.update_id + 1;

          const message = update.message ?? update.edited_message;
          if (!message) {
            continue;
          }

          const text = message.text ?? message.caption ?? "";
          const url = extractTikTokUrl(text);
          if (!url) {
            continue;
          }

          await handleTikTokMessage(message, url);
        }
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
