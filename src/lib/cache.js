import {copyFile, mkdir, readdir, rename, rm, stat} from "fs/promises";
import {extname, join} from "path";

import {DATA_DIR} from "../config/index.js";

const CACHE_DIR_NAME = "cache";
const DEFAULT_MAX_MB = 1024; // 1 GB

const getCacheDir = () => join(DATA_DIR, CACHE_DIR_NAME);

const getMaxBytes = () => {
  const n = Number(process.env.CACHE_MAX_MB, 10);
  const mb = Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_MB;
  return mb * 1024 * 1024;
};

const ensureDir = async () => {
  const dir = getCacheDir();
  await mkdir(dir, {recursive: true});
  return dir;
};

/**
 * Return path of cached video for given hash if it exists, otherwise null.
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
  return join(dir, match.name);
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
  const {files, total} = await computeTotalSize();
  if (total <= maxBytes) return;
  const sorted = [...files].sort((a, b) => a.mtimeMs - b.mtimeMs);
  let current = total;
  for (const f of sorted) {
    if (current <= maxBytes) break;
    try {
      await rm(f.path, {force: true});
      current -= f.size;
    } catch {
      // ignore delete failures
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
