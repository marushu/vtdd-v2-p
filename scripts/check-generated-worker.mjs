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
  process.exit(1);
}
