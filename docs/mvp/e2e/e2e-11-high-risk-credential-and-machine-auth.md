# E2E-11 High-risk Credential and Machine Auth Evidence

This document records concrete run evidence for the E2E-11 track.

## Scope

Issues:
- `#22`
- `#47`
- parent anchor: `#13`

Goal:
- confirm GitHub App aligned credential flow is the expected high-risk credential model
- confirm machine auth path accepts valid callers and blocks invalid ones
- confirm the path stays compatible with iPhone-first / Custom GPT setup without exposing secret values

## Happy-path Run

Command:

```sh
node --test test/github-app-repository-index.test.js test/worker.test.js
```

Observed result on 2026-04-17:
- passed
- confirms GitHub App repository index can use minted installation token flow when configured
- confirms worker accepts valid bearer-token machine auth callers
- confirms worker accepts valid Cloudflare Access service token header callers
- confirms setup output surfaces machine auth setting names without exposing secret values

## Boundary-path Run

Command:

```sh
node --test test/github-app-repository-index.test.js test/worker.test.js
```

Observed result on 2026-04-17:
- passed
- confirms missing GitHub App configuration degrades safely instead of silently pretending live repo access exists
- confirms invalid/static/missing auth headers are blocked
- confirms gateway access is denied when required bearer token is missing or invalid
- confirms machine auth boundary remains explicit in worker behavior

## Evidence Files

- `test/github-app-repository-index.test.js`
- `test/worker.test.js`
- `docs/mvp/machine-auth-path.md`
- `src/core/github-app-repository-index.js`
- `src/worker.js`

## Current Reading

E2E-11 now has recorded happy-path and boundary-path run evidence in-repo.

This still does not imply full repository completion.
Human closure judgment and the remaining matrix tracks are still required.
