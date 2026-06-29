import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "fs/promises";
import {extname, join} from "path";

import {DATA_DIR} from "../config/index.js";

const CACHE_DIR_NAME = "cache";
const DEFAULT_MAX_MB = 1024; // 1 GB
const DEFAULT_TTL_DAYS = 5;

const getCacheDir = () => join(DATA_DIR, CACHE_DIR_NAME);

const getTtlMs = () => {
  const n = Number(process.env.CACHE_TTL_DAYS);
  const days = Number.isFinite(n) && n > 0 ? n : DEFAULT_TTL_DAYS;
  return days * 24 * 60 * 60 * 1000;
};

const getMaxBytes = () => {
  const n = Number(process.env.CACHE_MAX_MB);
  const mb = Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_MB;
  return mb * 1024 * 1024;
};

const ensureDir = async () => {
  // Ensure DATA_DIR itself exists and is a directory before creating cache/.
  try {
    const info = await stat(DATA_DIR);
    if (!info.isDirectory()) {
      throw new Error(
        `DATA_DIR path exists but is not a directory: ${DATA_DIR}`,
      );
    }
  } catch (err) {
    // If DATA_DIR does not exist, create it; otherwise rethrow.
    if (err && err.code === "ENOENT") {
      await mkdir(DATA_DIR, {recursive: true});
    } else if (err) {
      throw err;
    }
  }

  const dir = getCacheDir();
  await mkdir(dir, {recursive: true});
  return dir;
};

/**
 * Return path of cached video for given hash if it exists and is not expired, otherwise null.
 */
export const getCachedVideoPath = async (urlHash) => {
  if (!urlHash) return null;
  const dir = getCacheDir();
  let entries;
  try {
    entries = await readdir(dir, {withFileTypes: true});
  } catch {
    return null;
  }
  const prefix = `${urlHash}.`;
  const match = entries.find(
    (e) => e.isFile() && (e.name === urlHash || e.name.startsWith(prefix)),
  );
  if (!match) return null;
  const filePath = join(dir, match.name);
  try {
    const s = await stat(filePath);
    if (Date.now() - s.mtimeMs > getTtlMs()) {
      await rm(filePath, {force: true});
      return null;
    }
  } catch {
    return null;
  }
  return filePath;
};

const computeTotalSize = async () => {
  const dir = getCacheDir();
  let entries;
  try {
    entries = await readdir(dir, {withFileTypes: true});
  } catch {
    return {files: [], total: 0};
  }

  const files = [];
  let total = 0;
  for (const e of entries) {
    if (!e.isFile()) continue;
    const full = join(dir, e.name);
    try {
      const s = await stat(full);
      total += s.size;
      files.push({mtimeMs: s.mtimeMs, path: full, size: s.size});
    } catch {
      // ignore files that disappeared
    }
  }
  return {files, total};
};

const enforceLimit = async () => {
  const maxBytes = getMaxBytes();
  const ttlMs = getTtlMs();
  const now = Date.now();
  const {files} = await computeTotalSize();

  // Evict expired files first
  const fresh = [];
  let current = 0;
  for (const f of files) {
    if (now - f.mtimeMs > ttlMs) {
      try {
        await rm(f.path, {force: true});
      } catch {
        // ignore
      }
    } else {
      fresh.push(f);
      current += f.size;
    }
  }

  if (current <= maxBytes) return;
  const sorted = [...fresh].sort((a, b) => a.mtimeMs - b.mtimeMs);
  for (const f of sorted) {
    if (current <= maxBytes) break;
    try {
      await rm(f.path, {force: true});
      current -= f.size;
    } catch {
      // ignore
    }
  }
};

/**
 * Move downloaded file into cache directory under a stable name `<hash><ext>`,
 * then enforce cache size limit. Returns the cached path.
 *
 * On Windows, rename() fails with EXDEV when source and target are on different
 * volumes (e.g. temp on C: vs DATA_DIR on OneDrive). We then copy the file to
 * cache and remove the temp file so the video is still stored.
 */
export const storeCachedVideo = async (tempFilePath, urlHash) => {
  if (!tempFilePath || !urlHash) return tempFilePath;
  const dir = await ensureDir();
  const ext = extname(tempFilePath) || ".mp4";
  const target = join(dir, `${urlHash}${ext}`);
  try {
    await rename(tempFilePath, target);
  } catch {
    // Cross-volume: copy then delete temp (Windows rename fails across drives/OneDrive)
    try {
      await copyFile(tempFilePath, target);
      await rm(tempFilePath, {force: true});
    } catch {
      return tempFilePath;
    }
  }
  await enforceLimit();
  return target;
};

/*
 * Telegram file_id cache.
 *
 * The bot's core operation is re-uploading the SAME urls. Telegram lets us
 * re-send an already-uploaded video by its file_id with zero byte transfer, so
 * we persist hash -> file_id and prefer it over re-streaming the cached file.
 *
 * Caveat: a file_id is bound to the Bot API server instance that produced it
 * (self-hosted local Bot API + its data volume). If that volume is wiped or we
 * migrate servers, ids go stale — the caller treats a failed file_id send as a
 * cache miss, drops the id, and falls back to a normal upload (self-healing).
 */
const FILE_ID_STORE_NAME = "file-ids.json";

const getFileIdStorePath = () => join(DATA_DIR, FILE_ID_STORE_NAME);

// Serialize sidecar writes in-process so concurrent updates (CONCURRENCY=2)
// don't clobber each other via read-modify-write.
let _fileIdWriteChain = Promise.resolve();

const readFileIdStore = async () => {
  try {
    const raw = await readFile(getFileIdStorePath(), "utf8");
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : {};
  } catch {
    // Missing or corrupt store → start fresh.
    return {};
  }
};

const mutateFileIdStore = (mutator) => {
  _fileIdWriteChain = _fileIdWriteChain.then(async () => {
    await ensureDir(); // make sure DATA_DIR exists
    const store = await readFileIdStore();
    mutator(store);
    // Atomic write: temp file + rename so the JSON is never half-written.
    const path = getFileIdStorePath();
    const tmp = `${path}.tmp`;
    await writeFile(tmp, JSON.stringify(store));
    await rename(tmp, path);
  });
  return _fileIdWriteChain;
};

/** Return the cached Telegram file_id for a url hash, or null. */
export const getCachedFileId = async (urlHash) => {
  if (!urlHash) return null;
  const store = await readFileIdStore();
  const value = store[urlHash];
  if (!value) return null;
  // Legacy format: plain string (no TTL)
  if (typeof value === "string") return value.length > 0 ? value : null;
  // Current format: { id, ts }
  if (typeof value === "object" && typeof value.id === "string") {
    if (Date.now() - value.ts > getTtlMs()) {
      await removeCachedFileId(urlHash);
      return null;
    }
    return value.id.length > 0 ? value.id : null;
  }
  return null;
};

/** Persist hash -> Telegram file_id with timestamp for TTL. */
export const storeCachedFileId = async (urlHash, fileId) => {
  if (!urlHash || !fileId) return;
  const now = Date.now();
  const ttlMs = getTtlMs();
  await mutateFileIdStore((store) => {
    store[urlHash] = {id: fileId, ts: now};
    // Sweep expired entries on each write
    for (const [k, v] of Object.entries(store)) {
      if (typeof v === "object" && v.ts && now - v.ts > ttlMs) {
        delete store[k];
      }
    }
  });
};

/** Drop a stale hash -> file_id mapping. */
export const removeCachedFileId = async (urlHash) => {
  if (!urlHash) return;
  await mutateFileIdStore((store) => {
    delete store[urlHash];
  });
};
