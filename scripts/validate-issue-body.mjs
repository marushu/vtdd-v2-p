#!/usr/bin/env node

import fs from "node:fs";

import { validateIssueBody } from "../src/core/issue-body.js";

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const templateMode = args.includes("--template");
  const strictReferences = args.includes("--strict-references");
  const inputPath = args.find((arg) => !arg.startsWith("--"));
  if (!inputPath) {
    console.error("Usage: node scripts/validate-issue-body.mjs [--template] [--strict-references] <path>");
    process.exit(1);
  }

  const body = fs.readFileSync(inputPath, "utf8");
  const result = validateIssueBody(body, {
    template: templateMode,
    errorOnBareIssuePrReference: strictReferences
  });
  if (!result.ok) {
    for (const error of result.errors) {
      console.error(error);
    }
    for (const warning of result.warnings) {
      console.error(`warning: ${warning}`);
    }
    process.exit(1);
  }

  for (const warning of result.warnings) {
    console.error(`warning: ${warning}`);
  }
  console.log("Issue body validation passed.");
}

export { validateIssueBody };
