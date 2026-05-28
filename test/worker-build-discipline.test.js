import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("worker runtime edits have a build-first verification command", () => {
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

  assert.equal(packageJson.scripts["verify:worker"], "npm run build:worker && npm test");
  assert.match(packageJson.scripts["build:worker"], /scripts\/build-worker\.mjs/);
  assert.match(packageJson.scripts["check:generated-worker"], /scripts\/check-generated-worker\.mjs/);
});

test("generated worker check compares build output against the pre-build working tree", () => {
  const script = fs.readFileSync("scripts/check-generated-worker.mjs", "utf8");

  assert.match(script, /const before = .*readFileSync\("worker\.js"/s);
  assert.match(script, /const after = .*readFileSync\("worker\.js"/s);
  assert.match(script, /before !== after/);
  assert.match(script, /Run `npm run build:worker` before validation/);
  assert.equal(script.includes("git\", [\"diff\", \"--exit-code\""), false);
});

test("AGENTS requires worker.js generation before worker validation", () => {
  const agents = fs.readFileSync("AGENTS.md", "utf8");

  assert.match(agents, /touches `src\/worker\/\*\*\/\*\.js`/);
  assert.match(agents, /run `npm run build:worker` before\s+validation/);
  assert.match(agents, /use `npm run verify:worker`/);
});
