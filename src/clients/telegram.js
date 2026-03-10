import axios from "axios";
import FormData from "form-data";
import {createReadStream} from "fs";
import {basename} from "path";

import {withRetry} from "../lib/retry.js";

const TELEGRAM_API_BASE = "https://api.telegram.org";
const TELEGRAM_TIMEOUT_MS = 30_000;
const TELEGRAM_VIDEO_UPLOAD_TIMEOUT_MS = 90_000;

let _cachedToken = null;

const getTelegramToken = () => {
  if (_cachedToken !== null) {
    return _cachedToken;
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set");
  }
  _cachedToken = token;
  return token;
};

const requestJson = async (method, body) => {
  const token = getTelegramToken();
  const url = `${TELEGRAM_API_BASE}/bot${token}/${method}`;

  return await withRetry(async () => {
    const res = await axios.post(url, body, {
      headers: {"Content-Type": "application/json"},
      timeout: TELEGRAM_TIMEOUT_MS,
    });
    const data = res.data;
    if (!data.ok) {
      throw new Error(
        `Telegram API error for ${method}: ${data.description ?? "unknown error"}`,
      );
    }
    return data.result;
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
  const url = `${TELEGRAM_API_BASE}/bot${token}/sendVideo`;
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("video", createReadStream(filePath), {
    filename: basename(filePath),
  });
  if (caption) {
    form.append("caption", caption);
  }
  if (replyToMessageId) {
    form.append("reply_to_message_id", String(replyToMessageId));
  }

  await withRetry(async () => {
    await axios.post(url, form, {
      headers: form.getHeaders(),
      maxBodyLength: Number.POSITIVE_INFINITY,
      maxContentLength: Number.POSITIVE_INFINITY,
      timeout: TELEGRAM_VIDEO_UPLOAD_TIMEOUT_MS,
    });
  });
};
