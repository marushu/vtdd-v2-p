# E2E-30 Execution Lead-time Telemetry

This document records concrete run evidence for Issue `#260`.

## Scope

Issue:
- `#260`

Goal:
- confirm execution lifecycle timestamps are computed as GitHub-visible runtime truth
- confirm concise durations are exposed through `vtddExecutionProgress`
- confirm concise durations are exposed through `vtddVpsRunnerStatus`
- confirm VPS runner state/event comments show the same concise lead-time summary before the JSON payload
- keep live GitHub and iPhone Butler evidence explicit when it has not been run

## Happy-path Run

Command:

```sh
node --test test/execution-lead-time.test.js test/vps-runner-script.test.js test/remote-codex-executor.test.js test/custom-gpt-setup-docs.test.js
```

Observed result on 2026-05-10:
- passed locally
- confirms `queued_at`, `picked_up_at`, `codex_started_at`, `branch_pushed_at`, `pr_created_at`, `completed_at`, and `failed_at` are represented in the lead-time contract
- confirms derived labels for queue wait, Codex execution, PR creation, and total lead time remain concise
- confirms VPS runner state comments render `Lead time:` lines before the JSON runtime truth
- confirms `vtddExecutionProgress` can reconstruct lead time from GitHub runner event comments
- confirms Custom GPT instructions tell Butler to report `progress.leadTime` durations and use `vtddVpsRunnerStatus` for runner health

## Boundary-path Run

Command:

```sh
node --test test/execution-lead-time.test.js test/vps-runner-script.test.js test/remote-codex-executor.test.js
```

Observed result on 2026-05-10:
- passed locally
- confirms missing or reversed timestamps produce `null` durations instead of misleading latency
- confirms `pr_created_at` can remain distinct from `completed_at` for non-terminal PR-created events
- confirms successful terminal VPS runner events can populate both `pr_created_at` and `completed_at`
- confirms explicit `completed_at` is the total lead-time terminal timestamp when it is later than `pr_created_at`
- confirms `vtddExecutionProgress` reconstructs lead time from GitHub-visible runner comment JSON and ignores malformed non-JSON event comments
- confirms stale or missing runner pickup evidence remains a blocked/unverified runtime state instead of a success claim

## Reproducible GitHub Comment Verification Path

This revision does not claim live production E2E. The executable local
verification path for the reviewer-raised GitHub-visible runtime truth risk is:

```sh
node --test test/remote-codex-executor.test.js --test-name-pattern "GitHub comment runtime truth"
```

That test feeds `vtddExecutionProgress` the same issue-comment shapes used by
the VPS runner:
- a `vtdd:vps-runner-execution` queue comment with `created_at`
- a malformed matching runner event comment that must be ignored
- a `vtdd:vps-runner-event` comment containing concise `Lead time:` lines and
  JSON `leadTime` runtime truth

The expected observable result is:
- `progress.status` is `completed`
- `progress.leadTime.pr_created_at` remains the PR creation timestamp
- `progress.leadTime.completed_at` remains the completion timestamp
- `progress.leadTime.durations.total_lead_time.label` is reconstructed from the
  GitHub comment runtime truth

This is contract evidence for the parser and Butler-facing progress path, not a
substitute for live runner evidence.

## Live Evidence Status

Live GitHub runner E2E:
- not run in this revision
- blocked here by the instruction not to deploy or mutate external infrastructure beyond the bounded PR revision work
- remains required before claiming Issue `#260` fully complete from production-like runtime truth
- reviewer objection is preserved until a real runner execution comment and
  `vtddExecutionProgress` readback from that same execution are attached as
  evidence

iPhone Butler live E2E:
- not run in this revision
- blocked here because no live iPhone Butler session or deployed runtime update was authorized
- remains required before claiming the end-user Butler surface is fully verified
- reviewer objection is preserved until a live Butler session reads and reports
  `progress.leadTime` or `health.leadTime`

## Evidence Files

- `src/core/execution-lead-time.js`
- `src/core/remote-codex-executor.js`
- `scripts/run-vps-runner.mjs`
- `docs/butler/remote-codex-cli-executor.md`
- `docs/setup/custom-gpt-instructions.md`
- `docs/setup/custom-gpt-instructions-short.md`
- `docs/setup/custom-gpt-instructions-short-min.md`
- `test/execution-lead-time.test.js`
- `test/vps-runner-script.test.js`
- `test/remote-codex-executor.test.js`
- `test/custom-gpt-setup-docs.test.js`

## Current Reading

Issue `#260` has local implementation and contract evidence for lead-time
telemetry. Live GitHub runner E2E and iPhone Butler live E2E remain explicitly
unverified and must not be described as complete until run evidence is added.
