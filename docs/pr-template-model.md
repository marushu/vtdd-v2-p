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
6. `Related Constitution Rules`
7. `Out-of-scope but NOT implemented`
8. `Extra changes (if any)`

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

### `Related Constitution Rules`

List material Constitution rules that constrained the implementation.

### `Out-of-scope but NOT implemented`

List ideas or changes noticed during implementation but intentionally not implemented.

### `Extra changes (if any)`

Call out any extra changes that were necessary, or state `None.` when there are none.

## Authoring Principle

The PR template should make spec alignment and drift visible. It should not
attempt to automate code quality judgment or prescribe implementation style.

## Guardrail Usage

Use `scripts/render-pr-body.mjs` to generate a valid starting body instead of
hand-writing the headings. Validate the result locally with
`node scripts/validate-pr-body.mjs <path>` before `gh pr create` or
`gh pr edit --body-file`.

## Non-goals

This model does not define:

- code review automation
- implementation method
- reviewer quality heuristics
