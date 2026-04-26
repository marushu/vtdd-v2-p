# MVP Issue Triage and Launch Plan

## Purpose

This document is a historical triage companion for the MVP bootstrap sequence.
It must not be treated as a higher-priority source than active Issue text, canonical docs, or current repository evidence.

## Current Reading

As of 2026-04-17:

- the major triage/creation wave has already been executed
- `#13` has already been rewritten as the MVP execution anchor
- `#4` is the current parent contract for the Butler-Codex-Gemini loop
- `#6` remains a historical execution-slice and must not compete with `#4` as a parent authority
- the repository now has broad runtime + contract coverage, but overall status is still `partial / in-progress`
- the remaining work is mainly close-readiness review, parent/spec drift prevention, and human closure judgment

## Compatibility Notes for Historical `#1-#20`

- `#1`: remains a valid top-level draft, but child Issue text and canonical docs outrank it for execution decisions
- `#2`-`#5`: remain valid early memory/runtime issues, now folded into the current MVP execution anchor via `#13`
- `#4`: current loop parent for Butler-Codex-Gemini runtime authority
- `#6`: historical execution-slice; keep as context, but route new parent-level loop decisions through `#4`
- `#7`: valid constitution schema parent
- `#8`: valid policy engine issue
- `#9`: valid consent/approval issue
- `#10`: valid runtime truth issue
- `#11`: valid reviewer/pluggability issue
- `#12`: valid state machine issue
- `#13`: canonical MVP execution anchor
- `#14`-`#20`: valid spec/template/log/retrieval issues when read through current canonical docs and merged runtime evidence

## What This File Is Still Good For

- explaining why the original issue set needed bundling under `#13`
- preserving the reasoning for deprecated / merged / additional issue directions
- helping a fresh reader understand why certain safety topics were spun out into separate issues

## What This File Must Not Be Used For

- re-opening already triaged scope by assuming the listed filing order is still pending
- treating historical `#6` as a competing parent source of truth over `#4`
- bypassing `docs/mvp/issue-to-e2e-matrix.md` when reasoning about completion
- inferring new implementation requirements without checking current open Issues first

## Historical Triage Outcome

The following historical directions were already resolved into the current repo state:

- repository resolution safety was split out and implemented
- credential boundary and high-risk path were split out and implemented
- memory safety policy was split out and implemented
- Butler surface independence was split out and implemented
- role separation was split out and implemented
- setup / deploy / guarded absence / reviewer / bootstrap follow-up issues were created as needed

## Completion Reminder

For current completion reading, use:

- `#13` for parent anchor
- `#4` for current Butler-Codex-Gemini loop parent authority
- `docs/mvp/issue-to-e2e-matrix.md` for repository-wide evidence status
- active open Issues only for remaining bounded work
