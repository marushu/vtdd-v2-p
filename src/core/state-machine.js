export const WorkflowStage = Object.freeze({
  IDEA: "idea",
  PROPOSAL: "proposal",
  ISSUE: "issue",
  GO: "go",
  BUILD: "build",
  PR: "pr",
  REVIEW: "review",
  MERGE: "merge",
  RECONCILE_REQUIRED: "reconcile_required"
});

export const WorkflowEvent = Object.freeze({
  DRAFT_PROPOSAL: "draft_proposal",
  CANONICALIZE_ISSUE: "canonicalize_issue",
  GRANT_GO: "grant_go",
  START_BUILD: "start_build",
  OPEN_PR: "open_pr",
  START_REVIEW: "start_review",
  REQUEST_CHANGES: "request_changes",
  APPROVE_MERGE: "approve_merge",
  RESET_TO_PROPOSAL: "reset_to_proposal",
  RUNTIME_CONFLICT_DETECTED: "runtime_conflict_detected",
  RECONCILE_COMPLETED: "reconcile_completed"
});

const TRANSITIONS = Object.freeze({
  [WorkflowStage.IDEA]: Object.freeze({
    [WorkflowEvent.DRAFT_PROPOSAL]: WorkflowStage.PROPOSAL
  }),
  [WorkflowStage.PROPOSAL]: Object.freeze({
    [WorkflowEvent.CANONICALIZE_ISSUE]: WorkflowStage.ISSUE
  }),
  [WorkflowStage.ISSUE]: Object.freeze({
    [WorkflowEvent.GRANT_GO]: WorkflowStage.GO,
    [WorkflowEvent.RESET_TO_PROPOSAL]: WorkflowStage.PROPOSAL
  }),
  [WorkflowStage.GO]: Object.freeze({
    [WorkflowEvent.START_BUILD]: WorkflowStage.BUILD,
    [WorkflowEvent.RESET_TO_PROPOSAL]: WorkflowStage.PROPOSAL
  }),
  [WorkflowStage.BUILD]: Object.freeze({
    [WorkflowEvent.OPEN_PR]: WorkflowStage.PR,
    [WorkflowEvent.RESET_TO_PROPOSAL]: WorkflowStage.PROPOSAL
  }),
  [WorkflowStage.PR]: Object.freeze({
    [WorkflowEvent.START_REVIEW]: WorkflowStage.REVIEW,
    [WorkflowEvent.RESET_TO_PROPOSAL]: WorkflowStage.PROPOSAL
  }),
  [WorkflowStage.REVIEW]: Object.freeze({
    [WorkflowEvent.REQUEST_CHANGES]: WorkflowStage.BUILD,
    [WorkflowEvent.APPROVE_MERGE]: WorkflowStage.MERGE,
    [WorkflowEvent.RESET_TO_PROPOSAL]: WorkflowStage.PROPOSAL
  }),
  [WorkflowStage.MERGE]: Object.freeze({}),
  [WorkflowStage.RECONCILE_REQUIRED]: Object.freeze({})
});

export function createInitialWorkflowState() {
  return {
    stage: WorkflowStage.IDEA,
    reconcileRequired: false,
    reconcileReturnStage: null
  };
}

export function transitionWorkflow(state, event) {
  const current = normalizeState(state);
  const eventType = normalizeEvent(event);

  if (current.stage === WorkflowStage.RECONCILE_REQUIRED) {
    return transitionFromReconcile(current, event);
  }

  if (eventType === WorkflowEvent.RUNTIME_CONFLICT_DETECTED) {
    return ok({
      stage: WorkflowStage.RECONCILE_REQUIRED,
      reconcileRequired: true,
      reconcileReturnStage: current.stage
    });
  }

  const next = TRANSITIONS[current.stage][eventType];
  if (!next) {
    return blocked(current, eventType, "invalid_transition");
  }

  return ok({
    stage: next,
    reconcileRequired: false,
    reconcileReturnStage: null
  });
}

export function listAllowedEvents(state) {
  const current = normalizeState(state);
  if (current.stage === WorkflowStage.RECONCILE_REQUIRED) {
    return [WorkflowEvent.RECONCILE_COMPLETED];
  }
  return [
    ...Object.keys(TRANSITIONS[current.stage]),
    WorkflowEvent.RUNTIME_CONFLICT_DETECTED
  ];
}

function transitionFromReconcile(current, event) {
  const eventType = normalizeEvent(event);
  if (eventType !== WorkflowEvent.RECONCILE_COMPLETED) {
    return blocked(current, eventType, "reconcile_required");
  }

  const requestedReturn = normalizeStage(event?.returnStage);
  const fallbackReturn = normalizeStage(current.reconcileReturnStage);
  const restoreStage = requestedReturn || fallbackReturn;
  if (!restoreStage || restoreStage === WorkflowStage.RECONCILE_REQUIRED) {
    return blocked(current, eventType, "invalid_reconcile_target");
  }

  return ok({
    stage: restoreStage,
    reconcileRequired: false,
    reconcileReturnStage: null
  });
}

function ok(state) {
  return { ok: true, state };
}

function blocked(current, eventType, reason) {
  return {
    ok: false,
    reason,
    event: eventType,
    state: current,
    allowedEvents: listAllowedEvents(current)
  };
}

function normalizeState(input) {
  const stage = normalizeStage(input?.stage);
  if (!stage || !Object.prototype.hasOwnProperty.call(TRANSITIONS, stage)) {
    throw new Error("invalid workflow state");
  }
  return {
    stage,
    reconcileRequired: Boolean(input?.reconcileRequired),
    reconcileReturnStage: normalizeStage(input?.reconcileReturnStage)
  };
}

function normalizeEvent(input) {
  const type = typeof input === "string" ? input : input?.type;
  if (!type) {
    throw new Error("event type is required");
  }
  return type;
}

function normalizeStage(value) {
  return value ? String(value).trim().toLowerCase() : null;
}
