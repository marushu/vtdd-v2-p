# VTDD v2 Decision Log Model

This document defines the canonical decision log model for VTDD v2.

## Intent

Decision log records preserve why a decision was made so Butler can later
answer "why is it like this?" without replaying full chat history.

## Canonical Fields

- `decision`
- `rationale`
- `relatedIssue`
- `decidedBy`
- `timestamp`
- `supersededBy`

## Field Meaning

### `decision`

The decision that was taken.

### `rationale`

The reason the decision was taken.

### `relatedIssue`

The Issue number that governed or motivated the decision.

### `decidedBy`

The actor who made or confirmed the decision.

### `timestamp`

The ISO-8601 timestamp for when the decision was recorded.

### `supersededBy`

Optional pointer to the later decision that supersedes this one.

## Role In VTDD

Decision log is:

- a structured memory source for RAG-style retrieval
- a reason trace source for Butler explanations
- the place to record major operating decisions, not every chat turn

## Supersede Rule

When a later decision replaces an earlier one:

- the earlier entry remains preserved
- `supersededBy` points to the newer decision

## Non-goals

This model does not require:

- storing all conversation history
- fully automatic decision generation
