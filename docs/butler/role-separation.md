# Role Separation Model

This document is the canonical role separation model for Issue #25.

For the Butler/Codex/Human authority boundary used by the current GitHub-first
execution loop, also read [authority-model.md](./authority-model.md).

## Goal

Butler, Executor, and Reviewer must remain structurally separated even when the same underlying AI product is used during a transition period.

The purpose of this separation is to prevent judgment, implementation, and critique from collapsing into a single unchallenged loop.

## Roles

### Butler

Input:

- human conversation
- constitution
- runtime truth
- issue / proposal / decision context
- reviewer output

Output:

- structured next-step guidance
- issue shaping support
- execution judgment
- reviewer summary for human decision

Butler does not grant itself authority silently. Merge, issue close, deploy,
credential mutation, and other authority actions remain approval-bound as
described in [authority-model.md](./authority-model.md).

### Executor

Input:

- approved implementation scope
- resolved repository target
- execution credentials appropriate to the action tier
- traceable issue context

Output:

- code changes
- tests
- PR artifacts
- execution logs

Executor is the only role that may perform implementation-side execution within
the approved boundary, but it does not become the authority role for merge or
close.

### Reviewer

Input:

- PR diff
- review context

Output:

- `critical_findings[]`
- `risks[]`
- `recommended_action`

Reviewer is restricted to critical evaluation and does not execute changes.

## Handoff Contracts

### Butler -> Executor

- Butler must pass only scoped, issue-traceable work.
- Butler must preserve approval boundary requirements.
- Butler must not smuggle speculative scope into execution.

### Executor -> Reviewer

- Executor hands off PR diff and context for critique.
- Executor does not decide review outcome on behalf of Reviewer.

### Reviewer -> Butler

- Reviewer returns structured critique.
- Butler may summarize and organize reviewer output for the human.
- Butler must not erase meaningful reviewer objections.

### Human -> Final Authority

- Human remains the final authority for revision GO and merge GO + real passkey.
- No role may silently replace human approval on high-risk or closure decisions.

## Security Boundary

- Reviewer must not receive execution credentials.
- Reviewer must not receive merge authority.
- Reviewer must not receive deployment authority.
- Executor must not redefine Butler judgment protocol.
- Butler must not bypass reviewer risk signals by optimistic paraphrase.

## Same-AI Transitional Operation

Even if the same vendor or model family is used across multiple roles temporarily:

- role responsibilities stay distinct
- credentials stay segmented
- review output stays structurally separate from execution output

Using the same AI provider does not collapse the role model.
