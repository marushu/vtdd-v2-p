# Butler Capability Matrix

Parent: #4

Issue: #153

## Purpose

This matrix is the working truth for whether the Custom GPT Butler can actually
drive VTDD from an iPhone/mobile conversation.

It is not enough for a route, schema, test, or source file to exist. A capability
is only complete when Butler can use it from the Custom GPT surface and the
result is observable from GitHub/runtime truth.

## Status Vocabulary

- `verified-live`: Confirmed through Butler/Action/GitHub runtime truth from the
  user-facing surface.
- `source-only`: Implemented or tested in repository source, but not yet proven
  through live Butler conversation.
- `partial-live`: Some live Butler path works, but important cases or repos are
  unverified.
- `broken-live`: A live Butler attempt failed or contradicted GitHub UI/runtime.
- `unverified`: No reliable live evidence yet.

Do not report `source-only` as done. Do not report `requested` handoff as Codex
execution.

## Current Capability Reading

| Capability | Current status | Evidence / notes | Next validation |
|---|---:|---|---|
| nickname `ぶい` resolution | `partial-live` | Live Butler resolved `ぶい -> marushu/vtdd-v2-p`; broader aliases/private repos remain less proven. | Ask Butler to list nicknames and resolve at least one public and one private alias. |
| open issues read | `partial-live` | Butler has read open issues. State filters/pagination are not fully proven. | Read open issues with a limit and compare to GitHub UI. |
| closed issue list read | `broken-live` | Butler reported zero closed issues while GitHub UI had closed issues. | Read closed issues and exact known closed issues such as #135. |
| exact Issue body read | `partial-live` | Some Issue bodies have been read; failures occurred when body was omitted. | Read #151/#153 and summarize Intent/SC/Non-goals from body. |
| issue comments read | `unverified` | Needed for reviewer and handoff evidence. | Read comments from an Issue with known comments and compare count/content. |
| issue comment create | `unverified` | Source write plane supports it; live Butler path not proven. | Present exact comment payload, say GO, verify GitHub URL. |
| issue comment update | `unverified` | Source write plane supports it; live Butler path not proven. | Create then update a bounded test comment. |
| natural GO -> issue_create | `source-only` | #152 added runtime/schema/instructions and tests. #151 remains open because iPhone Butler live evidence is missing. | In Butler, after exact title/body payload, say `この title/body で Issue を作成して。GO`; verify created Issue URL. |
| open PR read | `partial-live` | Butler has read open PRs. | Read open PR list and exact PR details. |
| closed/merged PR read | `partial-live` | Butler has read merged PRs and merge fields. | Read a known merged PR and verify merged/mergedAt/mergeCommitSha. |
| PR diff / changed files read | `unverified` | Required for PR summary; current matrix lacks live evidence. | Ask Butler to summarize changed files for a known PR. |
| PR issue comments read | `unverified` | Required for reviewer markers and Codex handoff evidence. | Read PR comments for #154 and find Gemini/Codex markers. |
| PR review objects read | `unverified` | GitHub Review API objects must not be confused with marker comments. | Read reviews for a PR with known review/comment state. |
| PR review comments read | `unverified` | Needed for inline objections. | Read review comments on a PR with known inline comments. |
| reviewer marker parsing | `source-only` | Tests cover Gemini and Codex fallback marker parsing. | Butler summarizes PR #154 and distinguishes Gemini approve from requested/blocked Codex fallback. |
| checks read | `partial-live` | Checks have been read as success. PR association precision is not fully proven. | Read checks for exact head SHA of a PR. |
| workflow runs read | `partial-live` | Workflow runs have been read. PR/branch association precision is not fully proven. | Read runs for a known branch/head and report URL/status/conclusion. |
| branch read | `partial-live` | Branch reads were used in runner/progress flows, but live Butler coverage is incomplete. | Read an existing branch and a missing branch; distinguish found from not_found. |
| branch create | `unverified` | Source write plane supports it; live Butler path not proven. | Create a bounded test branch and verify branch exists. |
| PR create | `unverified` | Source write plane supports it; live Butler path not proven from Butler. | Create PR from a bounded branch if needed by a live slice. |
| PR update | `unverified` | Source write plane supports it; live Butler path not proven. | Update a bounded PR title/body and verify. |
| PR comment create | `unverified` | Source write plane supports it; live Butler path not proven. | Post a bounded PR comment and verify URL. |
| `@codex` handoff comment | `unverified` | #154 restores no-API-key comment request transport; live pickup still not proven. | Butler posts bounded `@codex` handoff/comment and records URL. |
| Butler -> Codex Cloud pickup | `unverified` | A posted request is not execution evidence. | Confirm Codex Cloud creates a task/branch/PR or returns a clear no-op/failure. |
| execution progress tracking | `unverified` | Source supports progress routes; live Butler progress loop is not proven. | Track queued -> running/failed/PR-created states after handoff. |
| issue close | `unverified` | High-risk authority plane supports bounded close after merge proof; live Butler/operator path not proven. | Use only after a bounded merged PR and explicit GO/passkey path. |
| merge operator | `unverified` | Operator route exists; live Butler merge URL/dispatch path needs proof. | Ask Butler for merge operator link for a safe PR and verify fields. |
| deploy operator | `partial-live` | Deploy operator and dispatch have worked in conversation; repeatability and post-dispatch tracking need proof. | Ask Butler for deploy URL, dispatch, and verify run/self-parity/health. |
| self-parity check | `verified-live` | Butler has returned `runtimeParity: in_sync`. | Continue using before/after surface updates. |
| setup artifact retrieve | `source-only` | Source/tests cover canonical setup artifacts. | Butler retrieves Instructions/OpenAPI links or content on demand. |
| surface update guidance | `source-only` | #153 now requires clickable URLs for Instructions/Action Schema/operator. | After a PR changes surfaces, Butler reports required/not-required surfaces and links. |
| auth/transport failure surfacing | `partial-live` | Some `ClientResponseError` raw surfacing improved; still inconsistent. | Force/read a known failure and verify action/status/body/error/reason/issues are not hidden. |

## Priority Order

1. `natural GO -> issue_create` (#151 live proof)
2. Issue read completeness: open/closed/exact body/comments/pagination
3. PR runtime truth completeness: PR state/diff/comments/reviews/checks/runs/branches
4. Butler -> Codex handoff progress: requested/queued/picked up/branch/PR/failed
5. Codex Cloud pickup from `@codex` request
6. Reviewer evidence aggregation: Gemini/Codex, requested/completed/blocked
7. Surface update guidance: Instructions/Action Schema/Cloudflare deploy links
8. High-risk operator flows: merge/deploy/issue close under GO + passkey

## Completion Rule

Each row needs:

- a live Butler/iPhone validation phrase,
- the exact Action/runtime call that should happen,
- expected GitHub/runtime evidence,
- and a boundary/failure case.

Until those exist, the row stays `source-only`, `partial-live`, `broken-live`,
or `unverified`; it must not be reported as complete.
