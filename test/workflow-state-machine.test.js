import test from "node:test";
import assert from "node:assert/strict";
import {
  WorkflowEvent,
  WorkflowStage,
  createInitialWorkflowState,
  listAllowedEvents,
  transitionWorkflow
} from "../src/core/index.js";

test("workflow follows immutable forward path until merge", () => {
  let state = createInitialWorkflowState();

  state = transitionWorkflow(state, WorkflowEvent.DRAFT_PROPOSAL).state;
  state = transitionWorkflow(state, WorkflowEvent.CANONICALIZE_ISSUE).state;
  state = transitionWorkflow(state, WorkflowEvent.GRANT_GO).state;
  state = transitionWorkflow(state, WorkflowEvent.START_BUILD).state;
  state = transitionWorkflow(state, WorkflowEvent.OPEN_PR).state;
  state = transitionWorkflow(state, WorkflowEvent.START_REVIEW).state;
  state = transitionWorkflow(state, WorkflowEvent.APPROVE_MERGE).state;

  assert.equal(state.stage, WorkflowStage.MERGE);
});

test("cannot skip GO and jump from issue to build", () => {
  const result = transitionWorkflow(
    { stage: WorkflowStage.ISSUE, reconcileRequired: false, reconcileReturnStage: null },
    WorkflowEvent.START_BUILD
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid_transition");
  assert.deepEqual(result.allowedEvents.sort(), [WorkflowEvent.GRANT_GO, WorkflowEvent.RESET_TO_PROPOSAL, WorkflowEvent.RUNTIME_CONFLICT_DETECTED].sort());
});

test("review can loop back to build when changes are requested", () => {
  const result = transitionWorkflow(
    { stage: WorkflowStage.REVIEW, reconcileRequired: false, reconcileReturnStage: null },
    WorkflowEvent.REQUEST_CHANGES
  );
  assert.equal(result.ok, true);
  assert.equal(result.state.stage, WorkflowStage.BUILD);
});

test("runtime conflict moves to reconcile_required and blocks other events", () => {
  const toReconcile = transitionWorkflow(
    { stage: WorkflowStage.PR, reconcileRequired: false, reconcileReturnStage: null },
    WorkflowEvent.RUNTIME_CONFLICT_DETECTED
  );
  assert.equal(toReconcile.ok, true);
  assert.equal(toReconcile.state.stage, WorkflowStage.RECONCILE_REQUIRED);
  assert.equal(toReconcile.state.reconcileReturnStage, WorkflowStage.PR);

  const blocked = transitionWorkflow(toReconcile.state, WorkflowEvent.START_REVIEW);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, "reconcile_required");

  const restored = transitionWorkflow(toReconcile.state, WorkflowEvent.RECONCILE_COMPLETED);
  assert.equal(restored.ok, true);
  assert.equal(restored.state.stage, WorkflowStage.PR);
});

test("allowed events in reconcile state is only reconcile_completed", () => {
  const events = listAllowedEvents({
    stage: WorkflowStage.RECONCILE_REQUIRED,
    reconcileRequired: true,
    reconcileReturnStage: WorkflowStage.BUILD
  });
  assert.deepEqual(events, [WorkflowEvent.RECONCILE_COMPLETED]);
});
