# MVP Bootstrap Plan

## Purpose

This document keeps the historical MVP core map plus the current bootstrap-related parent map.
It is a planning companion, not a replacement for child Issue acceptance criteria.

## Execution Anchor Reading

- `#13` remains the historical MVP core execution anchor
- current main-line implementation work is now driven by `#182` for bootstrap automation and service connection boundaries
- active implementation must still trace to child Issue Intent / Success Criteria / Non-goal
- repository completion remains `partial` until the bootstrap/setup path also reaches intended live usability
- repository completion also remains `partial` while setup wizard is still more accurately described as a bounded bootstrap helper than as a meaning-first wizard

## Canonical Parent / Spec Inputs

### Parent / draft issues

- `#1` VTDD V2 draft
- `#13` historical MVP core parent
- `#182` bootstrap automation and service connection parent

### Canonical governance / runtime children

- `#8` Policy Engine
- `#9` Consent / Approval
- `#10` Runtime Truth / Reconcile
- `#11` reviewer pluggability
- `#12` State Machine
- `#18` Butler review protocol
- `#19` Retrieval Contract
- `#21` Repository resolution safety
- `#23` Memory safety
- `#24` Surface independence
- `#25` Role separation
- `#37` Production deploy boundary
- `#41` iPhone-first setup wizard
- `#75` Guarded semi-automation mode
- `#90` Deploy authority branching
- `#105` Secure Worker Secret Bootstrap

## Canonical Git Documents

- `docs/vision/vtdd-v2-overview.md`
- `docs/architecture/basic-architecture.md`
- `docs/butler/role.md`
- `docs/butler/surface-independence.md`
- `docs/butler/context-resolution.md`
- `docs/memory/rag-memory-philosophy.md`
- `docs/security/threat-model.md`
- `docs/security/go-passkey-approval-model.md`
- `docs/security/memory-safety-policy.md`
- `docs/security/reviewer-policy.md`
- `docs/security/guarded-semi-automation-mode.md`
- `docs/security/setup-wizard-meaning-first-contract.md`
- `docs/security/worker-secret-bootstrap-options.md`
- `docs/mvp/issue-to-e2e-matrix.md`

## Current MVP Technical Baseline

- SCM / PR surface: GitHub
- Runtime: Cloudflare Workers
- Structured storage: D1
- Object storage: R2
- Semantic retrieval initial runtime: Vectorize
- Credential model: GitHub App
- Deploy baseline: GitHub Actions -> Cloudflare
- Approval baseline: `GO` and `GO + passkey`
- Setup baseline: iPhone-first setup wizard

## Current MVP Reading

The MVP baseline now includes these user-visible/worker-connected areas:

- Constitution-first Butler judgment
- alias/context-first repository resolution
- no default repository
- unresolved target blocks execution
- high-risk approval boundary
- GitHub App live repository index
- machine auth boundary
- setup wizard HTML / JSON / OpenAPI import path
- reviewer / role / retrieval / policy / deploy contracts visible in setup output
- guarded absence boundaries and execution logging
- production deploy contract and authority branching guidance

## Current Main-line Reminder

Do not interpret the MVP core evidence set as proof that VTDD entry/setup is already complete.
Use `docs/mvp/issue-to-e2e-matrix.md` as the repository-wide tracker for the MVP core issue set, and use `#182` plus canonical bootstrap/security docs for the current setup/bootstrap line of work.
