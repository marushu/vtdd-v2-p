import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  WORKFLOW_EVENTS,
  WORKFLOW_STAGES,
  WorkflowEvent,
  WorkflowStage,
  createInitialWorkflowState,
  listAllowedEvents,
  transitionWorkflow
} from "../src/core/index.js";

const DOC_PATH = path.join(process.cwd(), "docs", "state-machine-model.md");

test("state machine docs list canonical stages and events", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");

  for (const stage of WORKFLOW_STAGES) {
    assert.match(doc, new RegExp(`- \`${stage}\``));
  }

  for (const event of WORKFLOW_EVENTS) {
    assert.match(doc, new RegExp(`- \`${event}\``));
  }
});

test("state machine immutable forward path reaches merge without skips", () => {
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

test("state machine blocks skipping from issue to build", () => {
  const result = transitionWorkflow(
    { stage: WorkflowStage.ISSUE, reconcileRequired: false, reconcileReturnStage: null },
    WorkflowEvent.START_BUILD
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid_transition");
});

test("state machine restricts reconcile state to reconcile_completed", () => {
  const toReconcile = transitionWorkflow(
    { stage: WorkflowStage.PR, reconcileRequired: false, reconcileReturnStage: null },
    WorkflowEvent.RUNTIME_CONFLICT_DETECTED
  );

  assert.equal(toReconcile.ok, true);
  assert.equal(toReconcile.state.stage, WorkflowStage.RECONCILE_REQUIRED);
  assert.equal(toReconcile.state.reconcileReturnStage, WorkflowStage.PR);

  assert.deepEqual(listAllowedEvents(toReconcile.state), [WorkflowEvent.RECONCILE_COMPLETED]);

  const restored = transitionWorkflow(toReconcile.state, WorkflowEvent.RECONCILE_COMPLETED);
  assert.equal(restored.ok, true);
  assert.equal(restored.state.stage, WorkflowStage.PR);
});
