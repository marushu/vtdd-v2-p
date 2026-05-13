#!/usr/bin/env node

import fs from "node:fs";

import { renderIssueBody } from "../src/core/issue-body.js";

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      continue;
    }
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = "true";
      continue;
    }
    result[key] = next;
    index += 1;
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const body = renderIssueBody(args);
  if (args.output) {
    fs.writeFileSync(args.output, body, "utf8");
  } else {
    process.stdout.write(body);
  }
}

export { renderIssueBody };
