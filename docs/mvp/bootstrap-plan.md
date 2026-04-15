# MVP Bootstrap Plan

## Purpose

This document bundles the current VTDD V2 issue set into an MVP-oriented build plan.

## Existing Core Issues

### Vision and Foundation

- `#1` VTDD V2 draft
- `#7` Constitution schema
- `#14` Issue as canonical spec
- `#18` Butler review protocol

### Memory and Retrieval

- `#2` memory schema
- `#3` memory provider interface
- `#4` Cloudflare provider minimum
- `#5` retrieve minimum
- `#17` Decision Log
- `#19` Retrieval Contract
- `#20` Proposal / Exploration Log

### Governance and Execution

- `#8` Policy Engine
- `#9` Consent / Approval
- `#10` Runtime Truth / Reconcile
- `#12` State Machine
- `#13` Bootstrap build issue
- `#15` Issue Template
- `#16` PR Template
- `#11` reviewer pluggability

## Additional MVP Topics To Capture

These are not fully represented in the current issue list and should be formalized before or alongside implementation:

- Butler surface independence
- project alias / repository resolution
- no default repository
- context-first resolution
- GitHub credential boundary / token segmentation
- destructive action path
- GO + passkey approval
- memory safety policy
- role separation model
- reviewer contract

## Recommended MVP Technical Baseline

- SCM: GitHub
- Runtime provider: Cloudflare Workers
- Structured DB: Cloudflare D1
- Object storage: Cloudflare R2
- Semantic retrieval: Cloudflare Vectorize
- Deploy path: GitHub Actions -> Cloudflare
- Approval: `GO` / `GO + passkey`

## MVP Completion Criteria

- Butler consults Constitution-first.
- Issue is the execution spec.
- Memory records begin from development stage.
- Alias-based repository resolution works.
- No default repository exists.
- High-risk actions use `GO + passkey`.
- Production deploy is part of MVP.
- GitHub credentials are segmented by role and risk.

## Companion Drafts

- `issue-13-rewrite-draft.md`
- `additional-issue-drafts.md`
- `next-step-handoff.md`
- `issue-triage-plan.md`
