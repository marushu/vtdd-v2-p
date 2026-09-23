#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";

const before = fs.existsSync("worker.js") ? fs.readFileSync("worker.js", "utf8") : "";

const build = spawnSync(process.execPath, ["scripts/build-worker.mjs"], {
  stdio: "inherit"
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const after = fs.existsSync("worker.js") ? fs.readFileSync("worker.js", "utf8") : "";

if (before !== after) {
  console.error(
    "Generated worker.js was changed by `npm run build:worker`. Run `npm run build:worker` before validation and include worker.js in the same commit."
  );
  const diff = spawnSync("git", ["diff", "--no-ext-diff", "--unified=3", "--", "worker.js"], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  });
  const encoded = Buffer.from(diff.stdout || "", "utf8").toString("base64");
  const chunkSize = 6000;
  console.error(`VTDD_GENERATED_WORKER_DIFF_B64_BEGIN:${encoded.length}`);
  for (let offset = 0, index = 0; offset < encoded.length; offset += chunkSize, index += 1) {
    console.error(`VTDD_GENERATED_WORKER_DIFF_B64:${index}:${encoded.slice(offset, offset + chunkSize)}`);
  }
  console.error("VTDD_GENERATED_WORKER_DIFF_B64_END");
  process.exit(1);
}
