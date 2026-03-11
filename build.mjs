#!/usr/bin/env node
import esbuild from "esbuild";
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "fs";
import {dirname} from "path";

const outFile = "dist/index.js";
const outDir = dirname(outFile);
if (!existsSync(outDir)) {
  mkdirSync(outDir, {recursive: true});
}

const isProduction = process.env.NODE_ENV === "production";

await esbuild.build({
  bundle: true,
  entryPoints: ["src/index.js"],
  external: ["axios", "dotenv", "dotenv/config", "form-data"],
  format: "esm",
  minify: isProduction,
  outfile: outFile,
  platform: "node",
  sourcemap: !isProduction,
  target: "node18",
});

// Ensure exactly one shebang on line 1
let code = readFileSync(outFile, "utf8");
if (code.startsWith("#!")) {
  code = code.replace(/^#!.*\n?/, "");
}
code = `#!/usr/bin/env node\n${code}`;
writeFileSync(outFile, code);

console.log("Built dist/index.js");
