# E2E-14 GitHub Normal Write Plane Evidence

This document records concrete run evidence for the E2E-14 track.

## Scope

Issues:
- `#52`
- parent anchor: `#13`

Goal:
- confirm the normal write plane executes scoped `GO`-tier GitHub workflow mutations
- confirm the path stays GitHub App-backed and short-lived
- confirm high-risk actions remain blocked outside this plane

## Happy-path Run

Command:

```sh
node --test test/github-write-plane.test.js test/worker.test.js test/custom-gpt-setup-docs.test.js
```

Observed result on 2026-04-26:
- passed
- confirms `issue_comment_create` executes through `/v2/action/github`
- confirms `branch_create` resolves the base ref SHA and creates the scoped branch
- confirms `pull_create`, `pull_update`, and `pull_comment_create` execute through the GitHub normal write plane
- confirms Butler-facing Custom GPT artifacts expose `vtddWriteGitHub`

## Boundary-path Run

Command:

```sh
node --test test/github-write-plane.test.js test/worker.test.js test/custom-gpt-setup-docs.test.js
```

Observed result on 2026-04-26:
- passed
- confirms missing `GO` / missing scope match is rejected by the normal write plane
- confirms unsupported high-risk operations such as `merge` are rejected with `github_write_request_invalid`
- confirms the normal write plane does not silently cross into merge / issue close / deploy / destructive territory

## Evidence Files

- `src/core/github-write-plane.js`
- `src/worker.js`
- `docs/setup/custom-gpt-actions-openapi.yaml`
- `docs/setup/custom-gpt-actions-openapi.json`
- `docs/setup/custom-gpt-instructions.md`
- `test/github-write-plane.test.js`
- `test/worker.test.js`
- `test/custom-gpt-setup-docs.test.js`

## Current Reading

E2E-14 now has recorded happy-path and boundary-path run evidence in-repo.

This still does not imply repository completion or high-risk GitHub authority completion.
Merge, issue close, and `GO + real passkey` paths remain separate work.
