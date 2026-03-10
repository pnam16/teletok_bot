import {readFile} from "fs/promises";
import {basename} from "path";

import {withRetry} from "../lib/retry.js";

const TELEGRAM_API_BASE = "https://api.telegram.org";
const TELEGRAM_TIMEOUT_MS = 30_000;

const getTelegramToken = () => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set");
  }
  return token;
};

const withTimeout = (ms) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, ms);

  return {controller, timeoutId};
};

const requestJson = async (method, body) => {
  const token = getTelegramToken();

  return await withRetry(async () => {
    const {controller, timeoutId} = withTimeout(TELEGRAM_TIMEOUT_MS);
    try {
      const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/${method}`, {
        body: JSON.stringify(body),
        headers: {"Content-Type": "application/json"},
        method: "POST",
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Telegram API ${res.status}: ${text}`);
      }
      const data = await res.json();
      if (!data.ok) {
        throw new Error(
          `Telegram API error for ${method}: ${data.description ?? "unknown error"}`,
        );
      }
      return data.result;
    } finally {
      clearTimeout(timeoutId);
    }
  });
};

export const getUpdates = async ({offset, timeoutSeconds = 25} = {}) => {
  const body = {
    allowed_updates: ["message", "edited_message"],
    offset,
    timeout: timeoutSeconds,
  };
  const result = await requestJson("getUpdates", body);
  if (Array.isArray(result)) {
    return result;
  }
  return [];
};

export const deleteMessage = async ({chatId, messageId}) => {
  if (!chatId) {
    throw new Error("chatId is required");
  }
  if (messageId == null) {
    throw new Error("messageId is required");
  }
  await requestJson("deleteMessage", {
    chat_id: chatId,
    message_id: messageId,
  });
};

export const sendTextMessage = async ({chatId, text, replyToMessageId}) => {
  if (!chatId) {
    throw new Error("chatId is required");
  }
  const body = {
    chat_id: chatId,
    text,
  };
  if (replyToMessageId) {
    body.reply_to_message_id = replyToMessageId;
  }
  await requestJson("sendMessage", body);
};

export const sendVideo = async ({
  chatId,
  filePath,
  caption,
  replyToMessageId,
}) => {
  if (!chatId) {
    throw new Error("chatId is required");
  }
  if (!filePath) {
    throw new Error("filePath is required");
  }

  const token = getTelegramToken();
  const buffer = await readFile(filePath);
  const blob = new Blob([buffer], {type: "video/mp4"});
  const form = new FormData();

  form.append("chat_id", String(chatId));
  form.append("video", blob, basename(filePath));
  if (caption) {
    form.append("caption", caption);
  }
  if (replyToMessageId) {
    form.append("reply_to_message_id", String(replyToMessageId));
  }

  await withRetry(async () => {
    const {controller, timeoutId} = withTimeout(TELEGRAM_TIMEOUT_MS);
    try {
      const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendVideo`, {
        body: form,
        method: "POST",
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Telegram API ${res.status}: ${text}`);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  });
};
