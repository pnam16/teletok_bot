import {spawn} from "child_process";
import {mkdtemp, readdir, rm} from "fs/promises";
import {tmpdir} from "os";
import {join} from "path";

const VIDEO_EXT_PATTERN = /\.(mp4|mkv|webm|mov|avi|flv)$/i;
const MAX_DOWNLOADER_LOG_CHARS = 8000;
export const VIDEO_UNAVAILABLE_AUDIENCES_CODE = "VIDEO_UNAVAILABLE_AUDIENCES";

const appendTail = (current, next, maxChars = MAX_DOWNLOADER_LOG_CHARS) => {
  const combined = `${current ?? ""}${next ?? ""}`;
  return combined.length > maxChars
    ? combined.slice(combined.length - maxChars)
    : combined;
};

const createTempDir = async () => {
  const base = tmpdir();
  const prefix = join(base, "teletok-");
  return await mkdtemp(prefix);
};

const waitForProcess = (child, cwd) =>
  new Promise((resolve, reject) => {
    let stdoutTail = "";
    let stderrTail = "";

    const onData = (stream, which) => {
      if (!stream) return;
      stream.setEncoding?.("utf8");
      stream.on("data", (chunk) => {
        const text = String(chunk);
        if (which === "stdout") {
          stdoutTail = appendTail(stdoutTail, text);
          // Keep original behavior: show downloader output in logs.
          process.stdout.write(text);
        } else {
          stderrTail = appendTail(stderrTail, text);
          process.stderr.write(text);
        }
      });
    };

    onData(child.stdout, "stdout");
    onData(child.stderr, "stderr");

    child.on("error", (err) => {
      reject(
        new Error(
          `Failed to start downloader in ${cwd}: ${err?.message || err}`,
        ),
      );
    });

    child.on("close", (code) => {
      if (code === 0) return resolve();

      const lc = (stderrTail || "").toLowerCase();
      const isUnavailableForAudiences =
        lc.includes("unavailable for certain audiences") ||
        lc.includes("content may be inappropriate");

      const error = new Error(
        isUnavailableForAudiences
          ? "Video unavailable for certain audiences"
          : `Downloader exited with code ${code} (cwd=${cwd})`,
      );
      error.code = isUnavailableForAudiences
        ? VIDEO_UNAVAILABLE_AUDIENCES_CODE
        : "DOWNLOADER_FAILED";
      error.exitCode = code;
      error.cwd = cwd;
      error.stdoutTail = stdoutTail;
      error.stderrTail = stderrTail;
      reject(error);
    });
  });

export const downloadShortVideo = async (url) => {
  if (!url) {
    throw new Error("Video URL is required");
  }

  const bin = process.env.TIKTOK_DOWNLOADER_BIN || "yt-dlp";
  const rawArgs =
    process.env.TIKTOK_DOWNLOADER_ARGS ||
    "-o %(id)s.%(ext)s --merge-output-format mp4";
  const args = rawArgs
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const jsRuntime = process.env.TIKTOK_DOWNLOADER_JS_RUNTIMES;
  if (jsRuntime) {
    const nodePath = process.execPath;
    args.unshift("--js-runtimes", `${jsRuntime}:${nodePath}`);
  }

  args.push(url);

  const dir = await createTempDir();
  try {
    const child = spawn(bin, args, {
      cwd: dir,
      // Capture logs so we can classify known-youtube/instagram restrictions.
      stdio: ["ignore", "pipe", "pipe"],
    });

    await waitForProcess(child, dir);

    const entries = await readdir(dir);
    const mp4File = entries.find((name) => name.toLowerCase().endsWith(".mp4"));
    const videoFile =
      mp4File ?? entries.find((name) => VIDEO_EXT_PATTERN.test(name));
    if (!videoFile) {
      throw new Error("No video file found after download");
    }

    const filePath = join(dir, videoFile);
    const cleanup = async () => {
      await rm(dir, {force: true, recursive: true});
    };

    return {cleanup, filePath};
  } catch (err) {
    // Avoid leaking /tmp directories on failures.
    await rm(dir, {force: true, recursive: true});
    throw err;
  }
};
