import {createHash} from "crypto";

/**
 * Normalize URL for cache key: lowercase, strip fragment, strip common tracking params.
 * Keeps path and essential query (e.g. v= for YouTube) so same video = same key.
 */
export const normalizeUrl = (url) => {
  if (!url || typeof url !== "string") return "";
  let u;
  try {
    u = new URL(url.trim());
  } catch {
    return url.trim().toLowerCase();
  }
  u.hash = "";
  const drop = new Set([
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "fbclid",
    "ref",
    "_r",
  ]);
  for (const key of drop) {
    u.searchParams.delete(key);
  }
  u.searchParams.sort();
  return u.toString().toLowerCase();
};

/**
 * Stable short hash of a string (for cache key).
 */
export const hashUrl = (normalized) => {
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
};
