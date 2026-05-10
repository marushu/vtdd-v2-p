#!/usr/bin/env node

import { build } from "esbuild";

await build({
  entryPoints: ["src/worker.js"],
  outfile: "worker.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  sourcemap: false,
  legalComments: "none",
  banner: {
    js: [
      "// @generated",
      "// Generated from src/worker.js by `npm run build:worker`.",
      "// Do not edit worker.js directly; edit src/**/*.js and rebuild."
    ].join("\n")
  }
});
