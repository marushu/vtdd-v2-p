# VTDD v2 PR Template Model

This document defines the canonical PR template used to show how a PR maps to
its governing spec and where it intentionally does not.

## Canonical Sections

Every PR should contain these sections in this order:

1. `This PR satisfies Intent`
2. `Satisfied Success Criteria`
3. `Unsatisfied Success Criteria`
4. `Non-goal violations`
5. `Dry-run Impact Report`
6. `Execution Queue Delta`
7. `File / Line Hypotheses`
8. `Hypothesis Retrospective`
9. `Verification Evidence`
10. `Butler Completion Contract`
11. `Surface Update Checklist`
12. `Related Constitution Rules`
13. `Out-of-scope but NOT implemented`
14. `Extra changes (if any)`

## Section Purpose

### `This PR satisfies Intent`

State how the PR maps back to the Issue intent.

### `Satisfied Success Criteria`

List the success criteria already satisfied by this PR.

### `Unsatisfied Success Criteria`

Call out remaining criteria explicitly. Use `None.` only when the PR is truly
complete. Partial or unconnected PRs should keep at least one explicit
remaining item instead of leaving this section empty.

### `Non-goal violations`

Call out any violation of declared non-goals, or state `None.` when there are none.

### `Dry-run Impact Report`

Record the pre-implementation impact scan before the PR becomes an isolated
patch. This section must name the target Issue, scoped success criteria,
explicit non-goals, expected files/routes/workflows, affected Issues, affected
PRs, affected workflows, affected runtime/operator surfaces, narrow patch risk,
unknowns to investigate, validation needed, and stop condition.

This section exists because VTDD changes often cross Butler, Worker, VPS Codex
CLI, Custom GPT, GitHub Actions, RAG, and approval boundaries. A PR should make
those links visible before claiming progress.

### `File / Line Hypotheses`

Record the implementation hypothesis before editing: likely files, suspicious
functions or line ranges when known, why the area is suspect, what breaks if it
is patched narrowly, and how the hypothesis will be verified.

### `Hypothesis Retrospective`

Record what changed after implementation. If the original hypothesis was wrong,
state the mismatch and whether the lesson should become a RAG candidate. This
section may remain `未実施` in an in-progress PR, but it must not disappear.

### `Verification Evidence`

Record executed verification (unit/integration/E2E/manual), results, and where
the evidence is visible.

### `Butler Completion Contract`

Record whether the change is actually reachable and governable from Butler as
the owner-facing control plane. Dashboard Butler is the primary owner surface.
Custom GPT may be recorded only as a fallback surface unless the owner
explicitly scopes a Custom GPT fallback PR. This section must identify the
primary owner surface, fallback surface, owner goal, Butler entrypoint,
Dashboard Butler natural-language path, Action Schema exposure, runtime path,
runner/runtime truth, authority boundary, Butler-facing E2E evidence, and
completion status.

Use `complete` only when Butler can complete the owner-facing workflow and the
PR provides Butler-facing E2E evidence. Use `incomplete` or `unconnected` when
any required connection is missing. PRs that use `Closes #...` must be
`complete`.

`Action Schema exposure` records Custom GPT fallback compatibility or a
non-primary setup requirement. It must not be written as the primary owner path
for Dashboard Butler work. A PR that cannot explain the Dashboard Butler
natural-language path must report the work as `unconnected` or `incomplete`.

Canonical renderer defaults should already emit passable non-placeholder text
for this section. Authors should edit those lines to become more specific, not
erase them back to empty placeholders.

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

Owner-facing prose in generated PR bodies should be Japanese-first by default.
The canonical section headings remain stable English guarded-policy markers,
but the default explanatory text, Butler Completion Contract guidance, and
remaining-work examples should be immediately readable by the owner in
Japanese. Machine-readable values such as `complete`, `incomplete`,
`unconnected`, route names, operationIds, and evidence commands must remain
stable.

## Guardrail Usage

Use `scripts/render-pr-body.mjs` to generate a valid starting body instead of
hand-writing the headings. The renderer must emit a validator-passable
partial/unconnected template by default so that AI-authored PRs do not fail on
empty dry-run or Butler contract placeholders. Validate the result locally with
`node scripts/validate-pr-body.mjs <path>` before `gh pr create` or
`gh pr edit --body-file`.

When the renderer fills default text, it should prefer Japanese owner-facing
guidance. Authors may keep technical identifiers in English where they are
literal route names, operationIds, commands, or enum values.

Do not use `gh pr create --body ...` or `gh pr edit --body ...` with freehand
text. Canonical flow is `render -> validate -> --body-file`.

## Non-goals

This model does not define:

- code review automation
- implementation method
- reviewer quality heuristics
