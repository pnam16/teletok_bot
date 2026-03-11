import {createServer} from "http";

import {setWebhook} from "../clients/telegram.js";
import {processUpdate} from "../jobs/tiktok-bot.js";

const BODY_LIMIT = 512 * 1024; // 512 KB

const readJsonBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let len = 0;
    req.on("data", (chunk) => {
      len += chunk.length;
      if (len > BODY_LIMIT) {
        req.destroy();
        reject(new Error("Body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : null);
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });

const send = (res, statusCode, body = "") => {
  res.statusCode = statusCode;
  if (body) {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Length", Buffer.byteLength(body));
  }
  res.end(body);
};

/**
 * Create HTTP server for Telegram webhook.
 * @param {{ path?: string, secretToken?: string }} options
 * @returns {import("http").Server}
 */
export const createWebhookServer = (options = {}) => {
  const path = options.path ?? "/webhook";
  const secretToken = options.secretToken ?? process.env.WEBHOOK_SECRET;

  return createServer(async (req, res) => {
    if (req.method !== "POST") {
      send(res, 405, '{"ok":false,"error":"Method Not Allowed"}');
      return;
    }

    const url = new URL(
      req.url ?? "",
      `http://${req.headers.host ?? "localhost"}`,
    );
    if (url.pathname !== path) {
      send(res, 404, '{"ok":false,"error":"Not Found"}');
      return;
    }

    if (secretToken) {
      const header = req.headers["x-telegram-bot-api-secret-token"];
      if (header !== secretToken) {
        send(res, 403, '{"ok":false,"error":"Forbidden"}');
        return;
      }
    }

    let update;
    try {
      update = await readJsonBody(req);
    } catch (err) {
      console.error(new Date().toISOString(), "Webhook body error:", err);
      send(res, 400, '{"ok":false,"error":"Bad Request"}');
      return;
    }

    if (!update || typeof update !== "object") {
      send(res, 400, '{"ok":false,"error":"Bad Request"}');
      return;
    }

    send(res, 200, "{}");

    processUpdate(update).catch((err) => {
      console.error(new Date().toISOString(), "Webhook process error:", err);
    });
  });
};

/**
 * Start webhook server and register URL with Telegram.
 * @param {{ port?: number, webhookUrl: string, secretToken?: string }} options
 */
export const runWebhookServer = async (options) => {
  const port = options.port ?? (Number(process.env.WEBHOOK_PORT, 10) || 3000);
  const webhookUrl = options.webhookUrl ?? process.env.TELEGRAM_WEBHOOK_URL;
  const secretToken = options.secretToken ?? process.env.WEBHOOK_SECRET;

  if (!webhookUrl) {
    throw new Error("TELEGRAM_WEBHOOK_URL is required for webhook mode");
  }

  const path = "/webhook";
  const fullUrl = webhookUrl.replace(/\/$/, "") + path;

  await setWebhook({
    secretToken: secretToken || undefined,
    url: fullUrl,
  });
  console.log("Webhook registered:", fullUrl);

  const server = createWebhookServer({path, secretToken});
  server.listen(port, "0.0.0.0", () => {
    console.log(`Webhook server listening on port ${port}`);
  });
};
