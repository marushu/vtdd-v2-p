# E2E-09 Memory Safety Exclusions Evidence

This document records concrete run evidence for the E2E-09 track.

## Scope

Issues:
- `#23`
- parent anchor: `#13`

Goal:
- confirm structured operational memory entries are allowed
- confirm secret-like material and transcript-heavy content are blocked
- confirm Git/DB separation remains part of the memory safety reading

## Happy-path Run

Command:

```sh
node --test test/memory-safety.test.js test/memory-safety-policy.test.js
```

Observed result on 2026-04-17:
- passed
- confirms decision/proposal/alias/approval/execution style records are allowed when they do not contain sensitive material
- confirms canonical memory safety policy documents the allowed store / do-not-store boundary
- confirms Git vs DB source-of-truth separation remains explicit

## Boundary-path Run

Command:

```sh
node --test test/memory-safety.test.js test/memory-safety-policy.test.js
```

Observed result on 2026-04-17:
- passed
- confirms private key material is blocked
- confirms raw secrets and token-like assignments are blocked
- confirms full casual transcript storage is not allowed by default
- confirms memory writes with secret-like material are rejected rather than silently persisted

## Evidence Files

- `test/memory-safety.test.js`
- `test/memory-safety-policy.test.js`
- `docs/security/memory-safety-policy.md`
- `docs/memory/rag-memory-philosophy.md`

## Current Reading

E2E-09 now has recorded happy-path and boundary-path run evidence in-repo.

This still does not imply full repository completion.
Human closure judgment and the remaining matrix tracks are still required.
