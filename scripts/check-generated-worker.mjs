#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const build = spawnSync(process.execPath, ["scripts/build-worker.mjs"], {
  stdio: "inherit"
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const diff = spawnSync("git", ["diff", "--exit-code", "--", "worker.js"], {
  stdio: "inherit"
});

if (diff.status !== 0) {
  console.error(
    "Generated worker.js is out of date. Run `npm run build:worker` and commit the result."
  );
  process.exit(diff.status ?? 1);
}
