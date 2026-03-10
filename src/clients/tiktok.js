import {spawn} from "child_process";
import {mkdtemp, readdir, rm} from "fs/promises";
import {tmpdir} from "os";
import {join} from "path";

const VIDEO_EXT_PATTERN = /\.(mp4|mkv|webm|mov|avi|flv)$/i;

const createTempDir = async () => {
  const base = tmpdir();
  const prefix = join(base, "teletok-");
  return await mkdtemp(prefix);
};

const waitForProcess = (child, cwd) =>
  new Promise((resolve, reject) => {
    child.on("error", (err) => {
      reject(new Error(`Failed to start downloader in ${cwd}: ${err.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Downloader exited with code ${code} (cwd=${cwd})`));
      }
    });
  });

export const downloadTikTokVideo = async (url) => {
  if (!url) {
    throw new Error("TikTok URL is required");
  }

  const bin = process.env.TIKTOK_DOWNLOADER_BIN || "yt-dlp";
  const rawArgs = process.env.TIKTOK_DOWNLOADER_ARGS || "-o %(id)s.%(ext)s";
  const args = rawArgs
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  args.push(url);

  const dir = await createTempDir();
  const child = spawn(bin, args, {
    cwd: dir,
    stdio: ["ignore", "inherit", "inherit"],
  });

  await waitForProcess(child, dir);

  const entries = await readdir(dir);
  const videoFile = entries.find((name) => VIDEO_EXT_PATTERN.test(name));
  if (!videoFile) {
    throw new Error("No video file found after download");
  }

  const filePath = join(dir, videoFile);
  const cleanup = async () => {
    await rm(dir, {force: true, recursive: true});
  };

  return {cleanup, filePath};
};
