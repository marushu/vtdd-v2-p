# VTDD v2 Proposal Log Model

This document defines the canonical proposal/exploration log model for VTDD v2.

## Intent

Proposal log records preserve pre-Issue exploration context so Butler can later
explain how a specification was shaped.

## Canonical Fields

- `hypothesis`
- `options`
- `rejectedReasons`
- `concerns`
- `unresolvedQuestions`
- `relatedIssue`
- `proposedBy`
- `timestamp`

## Field Meaning

### `hypothesis`

The current working hypothesis.

### `options`

Alternatives that were considered.

### `rejectedReasons`

Reason map for rejected options.

### `concerns`

Risks or worries discovered during exploration.

### `unresolvedQuestions`

Open questions that still need explicit decisions.

### `relatedIssue`

Optional Issue number when exploration is already tied to an Issue.

### `proposedBy`

Actor who recorded or confirmed the proposal context.

### `timestamp`

The ISO-8601 timestamp for when the proposal context was recorded.

## Role In VTDD

Proposal log is:

- pre-spec context for why an Issue was shaped the way it was
- a memory source Butler may reference in execution, without treating it as
  canonical spec
- a way to reduce repeated discussions by preserving prior options and concerns

## Non-goals

This model does not require:

- storing all conversation history
- fully automatic proposal generation
- treating proposal logs as canonical spec
