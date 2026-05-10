# Butler Batch Planning

Issue: #274

## Purpose

Butler can read open Issues as GitHub runtime truth and propose a safe
parallel development batch instead of choosing only the next single Issue.

The planner is read-only. It does not merge, deploy, close Issues, mutate
credentials, change permissions, or administer external infrastructure.

## Planning Contract

The batch planner:

- accepts open Issues read from GitHub runtime truth
- estimates priority from labels and title signals
- estimates likely touched areas from explicit paths and Issue wording
- detects dependency wording such as `depends on #123` and `after #123`
- classifies conflict risk as `low`, `medium`, or `high`
- proposes a current `proposedBatch`
- moves dependency, high-conflict, or capacity-limited Issues to `waitingQueue`
- explains `mergeOrder` without treating it as merge authorization

High-conflict Issues wait when their estimated touched areas overlap another
selected or in-flight Issue. This is intentionally conservative because Issue
#274 requires Butler to avoid running risky conflicting work in parallel.

## Handoff Boundary

Butler may prepare batch handoff requests only for Issues in the proposed
batch. The queue remains request-only until human `GO` is present for the
bounded batch.

The handoff payload preserves existing VTDD invariants:

- related Issue numbers match
- issue traceability contains Intent, Success Criteria, and Non-goal references
- the Codex goal is bounded to `open_pr`
- merge/deploy/Issue-close automation remains out of scope

## Monitoring Contract

Batch monitoring maps runtime truth into these stages:

- `queued`
- `in_progress`
- `blocked`
- `pr_created`
- `review`
- `merge_ready`

`merge_ready` is only a read-side status for Butler to explain. It is not merge
authorization and does not bypass the explicit human merge judgment boundary.
