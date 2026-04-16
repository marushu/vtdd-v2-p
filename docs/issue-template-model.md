# VTDD v2 Issue Template Model

This document defines the canonical Issue template used for VTDD spec input.

## Canonical Sections

Every new spec Issue should contain these sections in this order:

1. `Intent`
2. `Success Criteria`
3. `Completion Gate`
4. `Validation Plan`
5. `Non-goal`
6. `Open Questions`
7. `Related Issues / Rules`

## Section Purpose

### `Intent`

Describe what the spec is trying to achieve in one to three clear sentences.

### `Success Criteria`

List the observable conditions that must be true for the Issue to be treated
as satisfied.

### `Completion Gate`

State the exact closure gate in checkable form (for example: merged code,
required tests pass, mapped E2E passes, human approval).

### `Validation Plan`

List the concrete verification plan for this Issue (unit/integration/E2E,
manual test steps, and expected evidence).

### `Non-goal`

List what is explicitly not included so execution does not drift.

### `Open Questions`

List unresolved questions that still need clarification.

### `Related Issues / Rules`

Link related Issues and relevant Constitution rules when they materially
constrain interpretation or execution.

## Authoring Principle

The template should guide better spec input quality, but should not force
implementation method or excessive narrative detail.

## Non-goals

This model does not define:

- PR template wording
- implementation method
- code review quality heuristics
