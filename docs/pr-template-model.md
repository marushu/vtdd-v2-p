# VTDD v2 PR Template Model

This document defines the canonical PR template used to show how a PR maps to
its governing spec and where it intentionally does not.

## Canonical Sections

Every PR should contain these sections in this order:

1. `This PR satisfies Intent`
2. `Satisfied Success Criteria`
3. `Unsatisfied Success Criteria`
4. `Non-goal violations`
5. `Verification Evidence`
6. `Butler Completion Contract`
7. `Surface Update Checklist`
8. `Related Constitution Rules`
9. `Out-of-scope but NOT implemented`
10. `Extra changes (if any)`

## Section Purpose

### `This PR satisfies Intent`

State how the PR maps back to the Issue intent.

### `Satisfied Success Criteria`

List the success criteria already satisfied by this PR.

### `Unsatisfied Success Criteria`

Call out remaining criteria explicitly, or state `None.` when there are none.

### `Non-goal violations`

Call out any violation of declared non-goals, or state `None.` when there are none.

### `Verification Evidence`

Record executed verification (unit/integration/E2E/manual), results, and where
the evidence is visible.

### `Butler Completion Contract`

Record whether the change is actually reachable and governable from Butler as
the owner-facing control plane. This section must identify the owner goal,
Butler entrypoint, Action Schema exposure, runtime path, runner/runtime truth,
authority boundary, Butler-facing E2E evidence, and completion status.

Use `complete` only when Butler can complete the owner-facing workflow and the
PR provides Butler-facing E2E evidence. Use `incomplete` or `unconnected` when
any required connection is missing. PRs that use `Closes #...` must be
`complete`.

### `Surface Update Checklist`

Record whether the PR requires Cloudflare deploy, Custom GPT Action Schema
update, Custom GPT Instructions update, and iPhone Butler live E2E. Use
`required`, `not required`, or `done` plus evidence where useful.

### `Related Constitution Rules`

List material Constitution rules that constrained the implementation.

### `Out-of-scope but NOT implemented`

List ideas or changes noticed during implementation but intentionally not implemented.

### `Extra changes (if any)`

Call out any extra changes that were necessary, or state `None.` when there are none.

## Authoring Principle

The PR template should make spec alignment and drift visible. It should not
attempt to automate code quality judgment or prescribe implementation style.

It must not let authors claim completion from isolated code, docs, routes,
schemas, or tests. Completion is judged from the Butler owner-facing workflow.

## Guardrail Usage

Use `scripts/render-pr-body.mjs` to generate a valid starting body instead of
hand-writing the headings. Validate the result locally with
`node scripts/validate-pr-body.mjs <path>` before `gh pr create` or
`gh pr edit --body-file`.

Do not use `gh pr create --body ...` or `gh pr edit --body ...` with freehand
text. Canonical flow is `render -> validate -> --body-file`.

## Non-goals

This model does not define:

- code review automation
- implementation method
- reviewer quality heuristics
