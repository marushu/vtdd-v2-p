# Basic Architecture

## Immutable Flow

The base VTDD V2 flow is:

`Idea -> Proposal -> Issue -> GO -> Build -> PR -> Review -> Merge`

This flow is the skeleton.
Internal implementation may change, but the flow itself should not drift casually.

## Stage Responsibilities

### Idea

- Conversation with a human or AI.
- Intention, discomfort, and direction are still unstructured.

### Proposal

- Clarifies scope, purpose, and completion conditions.
- May include extra ideas, but does not execute them.

### Issue

- Canonical execution spec.
- Defines intent, success criteria, and non-goals.

### GO

- Explicit human approval boundary.
- Required before execution.

### Build

- Implements only what the Issue authorizes.
- Must not infer missing spec.

### PR

- Shows output as a reviewable diff.
- Must remain traceable to the Issue.

### Review

- Critical evaluation by human or AI reviewer.
- Detects risks, regressions, and out-of-scope changes.

### Merge

- Final human judgment and integration boundary.

## Fixed Entry and Exit

- Entry: Issue
- Exit: PR

Proposal exists before entry.
Review and merge happen after exit is produced.

## Execution Preconditions

Execution must not proceed unless:

- Constitution is consulted.
- Runtime truth is available or safe fallback is chosen.
- Target repository is resolved.
- Approval level is satisfied.

## Extension Points

The following must remain replaceable:

- Butler surface
- Executor engine
- Reviewer engine
- Memory provider
- Runtime provider
- Trigger adapter
- Deploy adapter
- Notification channel

## Configuration Principle

Behavior should be controlled by policy and configuration wherever possible.
Constitution-level rules remain higher than mutable configuration.

## Non-goals

- Hard-coding provider behavior into core judgment.
- Treating conversation as canonical spec.
- Letting local editor workflows define the system.
