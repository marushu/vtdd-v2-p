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
  const diff = spawnSync("git", ["diff", "--no-ext-diff", "--", "worker.js"], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  });
  if (diff.stdout) {
    console.error("BEGIN_GENERATED_WORKER_DIFF");
    console.error(diff.stdout);
    console.error("END_GENERATED_WORKER_DIFF");
  }
  process.exit(1);
}
