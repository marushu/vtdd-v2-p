import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import { setGitHubActionsSecret } from "../scripts/sync-github-app-actions-secrets.mjs";

test("setGitHubActionsSecret writes secret value to gh stdin and closes stdin", async () => {
  const writes = [];
  const argsSeen = [];
  const child = createFakeChild({
    stdin: {
      write(value) {
        writes.push(value);
      },
      end() {
        writes.push("[end]");
      }
    }
  });
  const resultPromise = setGitHubActionsSecret({
    repo: "marushu/vtdd-v2-p",
    secret: {
      name: "VTDD_CODEX_FALLBACK_REVIEWER_APP_ID",
      value: "3706921"
    },
    spawnImpl(command, args) {
      argsSeen.push(command, ...args);
      queueMicrotask(() => child.emit("close", 0, null));
      return child;
    }
  });

  await assert.doesNotReject(resultPromise);
  assert.deepEqual(argsSeen, [
    "gh",
    "secret",
    "set",
    "VTDD_CODEX_FALLBACK_REVIEWER_APP_ID",
    "--repo",
    "marushu/vtdd-v2-p",
    "--app",
    "actions"
  ]);
  assert.deepEqual(writes, ["3706921", "[end]"]);
});

test("setGitHubActionsSecret times out a stuck gh secret set without leaking secret value", async () => {
  const child = createFakeChild();
  const killedSignals = [];
  child.kill = (signal) => {
    killedSignals.push(signal);
  };

  await assert.rejects(
    setGitHubActionsSecret({
      repo: "marushu/vtdd-v2-p",
      secret: {
        name: "VTDD_CODEX_FALLBACK_REVIEWER_APP_PRIVATE_KEY",
        value: "super-secret-private-key"
      },
      timeoutMs: 1,
      killGraceMs: 1,
      spawnImpl() {
        return child;
      }
    }),
    (error) => {
      assert.match(error.message, /VTDD_CODEX_FALLBACK_REVIEWER_APP_PRIVATE_KEY/);
      assert.match(error.message, /timeout after 1ms/);
      assert.equal(error.message.includes("super-secret-private-key"), false);
      return true;
    }
  );
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(killedSignals, ["SIGTERM", "SIGKILL"]);
});

test("setGitHubActionsSecret reports failing secret name without echoing process output", async () => {
  const child = createFakeChild();
  const promise = setGitHubActionsSecret({
    repo: "marushu/vtdd-v2-p",
    secret: {
      name: "VTDD_GEMINI_REVIEWER_APP_PRIVATE_KEY",
      value: "secret-value-that-must-not-appear"
    },
    spawnImpl() {
      queueMicrotask(() => {
        child.stderr.emit("data", "stderr contains secret-value-that-must-not-appear");
        child.stdout.emit("data", "stdout contains secret-value-that-must-not-appear");
        child.emit("close", 1, null);
      });
      return child;
    }
  });

  await assert.rejects(promise, (error) => {
    assert.match(error.message, /VTDD_GEMINI_REVIEWER_APP_PRIVATE_KEY/);
    assert.match(error.message, /exit code 1/);
    assert.equal(error.message.includes("secret-value-that-must-not-appear"), false);
    assert.match(error.message, /stdout=\d+ bytes/);
    assert.match(error.message, /stderr=\d+ bytes/);
    return true;
  });
});

function createFakeChild(overrides = {}) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = new EventEmitter();
  child.stdin.write = () => {};
  child.stdin.end = () => {};
  child.kill = () => {};

  return Object.assign(child, overrides);
}
