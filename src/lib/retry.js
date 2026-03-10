const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 500;

const isRetryable = (err) => {
  const msg = err?.message ?? "";
  if (
    msg.includes("fetch failed") ||
    msg.includes("ECONNRESET") ||
    msg.includes("ETIMEDOUT")
  ) {
    return true;
  }
  const status = Number.parseInt(msg.replace(/\D/g, ""), 10);
  return status >= 500 && status < 600;
};

/**
 * Run an async function with retries on retryable errors.
 * @param {() => Promise<T>} fn - Async function (no args).
 * @param {{ maxAttempts?: number, baseDelayMs?: number, retryable?: (err: Error) => boolean }} [options]
 * @returns {Promise<T>}
 */
export const withRetry = async (fn, options = {}) => {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const retryable = options.retryable ?? isRetryable;

  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts || !retryable(err)) {
        throw err;
      }
      const delay = baseDelayMs * 2 ** (attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
};
