import {join, normalize} from "path";

/**
 * Root directory for any state or output files your bot needs.
 * Defaults to ./data; set DATA_DIR in .env to override (e.g. /var/lib/teletok).
 * Strips surrounding quotes and normalizes path (handles Windows backslashes).
 */
const raw =
  typeof process.env.DATA_DIR === "string"
    ? process.env.DATA_DIR.replace(/^["']|["']$/g, "").trim()
    : "";
export const DATA_DIR =
  raw.length > 0 ? normalize(raw) : join(process.cwd(), "data");
