import { evaluateMemorySafety, sanitizeMemoryPayload } from "./memory-safety.js";

export const SetupOutputTarget = Object.freeze({
  GIT: "git",
  DB: "db"
});

/**
 * Initial setup wizard contract.
 * This function does not write to providers yet.
 * It only validates and returns where outputs must be written.
 */
export function runInitialSetupWizard(input) {
  const answers = input?.answers ?? {};
  const checks = validateSetupAnswers(answers);
  if (!checks.ok) {
    return {
      ok: false,
      blockingIssues: checks.issues,
      outputs: { git: [], db: [] }
    };
  }

  const outputs = buildSetupOutputs(answers);
  return {
    ok: true,
    blockingIssues: [],
    outputs
  };
}

function validateSetupAnswers(answers) {
  const issues = [];

  if (!Array.isArray(answers.repositories) || answers.repositories.length === 0) {
    issues.push("at least one repository mapping is required");
  }

  if (answers.allowDefaultRepository === true) {
    issues.push("default repository is forbidden");
  }

  if (normalize(answers.credentialModel) !== "github_app") {
    issues.push("credential model must be github_app");
  }

  if (normalize(answers.highRiskApproval) !== "go_passkey") {
    issues.push("high-risk approval must be go_passkey");
  }

  if (!Array.isArray(answers.initialSurfaces) || answers.initialSurfaces.length === 0) {
    issues.push("at least one surface is required");
  }

  if (normalize(answers.reviewerInitial) !== "gemini") {
    issues.push("initial reviewer must be gemini");
  }

  return {
    ok: issues.length === 0,
    issues
  };
}

function buildSetupOutputs(answers) {
  const git = [
    {
      target: SetupOutputTarget.GIT,
      kind: "shared_spec_reference",
      path: "docs/mvp/bootstrap-plan.md",
      reason: "shared MVP baseline must remain in Git"
    }
  ];

  const db = [];

  const aliasRecord = {
    recordType: "alias_registry",
    content: {
      repositories: answers.repositories
    },
    metadata: {
      source: "initial_setup_wizard"
    }
  };
  pushSafeMemoryRecord(db, aliasRecord, "alias_registry");

  const approvalRecord = {
    recordType: "approval_log",
    content: {
      highRiskApproval: "go_passkey",
      credentialModel: "github_app",
      reviewerInitial: "gemini"
    },
    metadata: {
      source: "initial_setup_wizard"
    }
  };
  pushSafeMemoryRecord(db, approvalRecord, "approval_policy");

  const executionRecord = {
    recordType: "execution_log",
    content: {
      initialSurfaces: answers.initialSurfaces,
      noDefaultRepository: true
    },
    metadata: {
      source: "initial_setup_wizard"
    }
  };
  pushSafeMemoryRecord(db, executionRecord, "setup_execution_profile");

  return { git, db };
}

function pushSafeMemoryRecord(dbOutputs, record, logicalTable) {
  const safety = evaluateMemorySafety(record);
  if (!safety.ok) {
    dbOutputs.push({
      target: SetupOutputTarget.DB,
      kind: "blocked",
      logicalTable,
      reason: safety.reason,
      rule: safety.rule
    });
    return;
  }

  const sanitized = sanitizeMemoryPayload(record);
  dbOutputs.push({
    target: SetupOutputTarget.DB,
    kind: "memory_record",
    logicalTable,
    recordType: safety.normalizedRecordType,
    payload: {
      content: sanitized.content,
      metadata: sanitized.metadata
    }
  });
}

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}
