import { evaluateMemorySafety, sanitizeMemoryPayload } from "./memory-safety.js";

export const SetupOutputTarget = Object.freeze({
  GIT: "git",
  DB: "db"
});

export const SetupMode = Object.freeze({
  IPHONE_FIRST: "iphone_first"
});

const SENSITIVE_SETUP_FIELDS = Object.freeze([
  "cloudflareApiToken",
  "cloudflareAccountId",
  "githubAppPrivateKey",
  "githubToken",
  "openaiApiKey",
  "geminiApiKey"
]);

/**
 * Initial setup wizard contract.
 * This function does not write to providers yet.
 * It validates answers and returns:
 * - output targets (Git / DB)
 * - iPhone-first onboarding pack for copy/paste setup
 */
export function runInitialSetupWizard(input) {
  const answers = input?.answers ?? {};
  const checks = validateSetupAnswers(answers);
  if (!checks.ok) {
    return {
      ok: false,
      blockingIssues: checks.issues,
      outputs: { git: [], db: [] },
      onboarding: null
    };
  }

  const outputs = buildSetupOutputs(answers);
  return {
    ok: true,
    blockingIssues: [],
    outputs,
    onboarding: buildIphoneOnboardingPack(answers)
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

  if (normalize(answers.setupMode || SetupMode.IPHONE_FIRST) !== SetupMode.IPHONE_FIRST) {
    issues.push("setup mode must be iphone_first");
  }

  const surfaces = normalizedStringArray(answers.initialSurfaces);
  if (surfaces.includes("custom_gpt") && !normalizeUrl(answers.actionEndpointBaseUrl)) {
    issues.push("actionEndpointBaseUrl is required for custom_gpt surface");
  }

  const sensitiveInputs = findSensitiveSetupInputs(answers);
  if (sensitiveInputs.length > 0) {
    issues.push(
      `sensitive credentials must not be entered in setup wizard answers (${sensitiveInputs.join(", ")})`
    );
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
    },
    {
      target: SetupOutputTarget.GIT,
      kind: "onboarding_reference",
      path: "docs/mvp/iphone-first-setup.md",
      reason: "mobile-first setup instructions are shared team knowledge"
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
      consentCategories: ["read", "propose", "execute", "destructive", "external_publish"],
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
      noDefaultRepository: true,
      setupMode: SetupMode.IPHONE_FIRST,
      operatorManagedSecrets: true
    },
    metadata: {
      source: "initial_setup_wizard"
    }
  };
  pushSafeMemoryRecord(db, executionRecord, "setup_execution_profile");

  return { git, db };
}

function buildIphoneOnboardingPack(answers) {
  const actionEndpointBaseUrl = normalizeUrl(answers.actionEndpointBaseUrl);
  const customGptActionSchema = actionEndpointBaseUrl
    ? buildCustomGptActionSchema(actionEndpointBaseUrl)
    : null;

  return {
    setupMode: SetupMode.IPHONE_FIRST,
    steps: [
      "Open ChatGPT on iPhone and create or edit the Butler Custom GPT.",
      "Paste construction instructions and action schema from this onboarding pack.",
      "Confirm GitHub production environment has required reviewers and Cloudflare secrets.",
      "Run GitHub Actions deploy-production with approval_phrase=GO and passkey_verified=true."
    ],
    secretHandlingPolicy: {
      model: "operator_managed_environment_secrets",
      statement:
        "Do not paste Cloudflare or API credentials into wizard answers, chats, or GPT instructions."
    },
    customGpt: {
      constructionText: buildCustomGptConstructionText(answers),
      actionSchemaJson: customGptActionSchema ? JSON.stringify(customGptActionSchema, null, 2) : null,
      endpointBaseUrl: actionEndpointBaseUrl
    }
  };
}

function buildCustomGptConstructionText(answers) {
  const repositories = (answers.repositories ?? [])
    .map((item) => item?.canonicalRepo)
    .filter(Boolean);
  const repoText = repositories.length > 0 ? repositories.join(", ") : "configured repositories";

  return [
    "You are VTDD Butler.",
    "Always answer in Japanese unless the user explicitly requests another language.",
    "Always resolve repository target from alias/context before execution.",
    "Do not assume a default repository.",
    "Never ask the user to type API paths such as /mvp/... or raw JSON payloads.",
    "Convert natural Japanese requests into internal action calls yourself.",
    "Infer intent from natural conversation instead of fixed command phrases.",
    "When repository intent is ambiguous, ask a short confirmation question before switching context.",
    "When asked about repositories, show known repositories and aliases first.",
    "Follow Constitution-first and Issue-as-spec judgment order.",
    "For high-risk actions (merge/deploy/destructive/external publish), require GO + passkey.",
    "Use Gemini as reviewer and treat reviewer output as structured input for human final decision.",
    `Primary repositories: ${repoText}.`
  ].join("\n");
}

function buildCustomGptActionSchema(baseUrl) {
  return {
    openapi: "3.1.0",
    info: {
      title: "VTDD Butler Action API",
      version: "0.1.0"
    },
    servers: [
      {
        url: baseUrl
      }
    ],
    components: {
      schemas: {},
      securitySchemes: {
        GatewayBearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "API token",
          description:
            "Set this to MVP_GATEWAY_BEARER_TOKEN configured on Cloudflare Worker environment."
        }
      }
    },
    paths: {
      "/health": {
        get: {
          operationId: "getHealth",
          responses: {
            "200": {
              description: "Worker is healthy"
            }
          }
        }
      },
      "/mvp/gateway": {
        post: {
          operationId: "postMvpGateway",
          security: [{ GatewayBearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    phase: {
                      type: "string",
                      enum: ["execution", "exploration"]
                    },
                    actorRole: {
                      type: "string",
                      enum: ["butler", "executor", "reviewer"]
                    },
                    policyInput: {
                      type: "object",
                      additionalProperties: true,
                      properties: {
                        actionType: {
                          type: "string",
                          enum: [
                            "read",
                            "summarize",
                            "issue_create",
                            "build",
                            "pr_comment",
                            "pr_review_submit",
                            "pr_operation",
                            "merge",
                            "deploy_production",
                            "destructive",
                            "external_publish"
                          ]
                        },
                        mode: {
                          type: "string",
                          enum: ["read_only", "execution"]
                        },
                        repositoryInput: {
                          type: "string"
                        },
                        constitutionConsulted: {
                          type: "boolean"
                        },
                        runtimeTruth: {
                          type: "object",
                          additionalProperties: true,
                          properties: {
                            runtimeAvailable: {
                              type: "boolean"
                            }
                          }
                        },
                        credential: {
                          type: "object",
                          additionalProperties: true,
                          properties: {
                            model: { type: "string" },
                            tier: { type: "string" },
                            shortLived: { type: "boolean" },
                            boundApprovalId: { type: "string" }
                          }
                        },
                        consent: {
                          type: "object",
                          additionalProperties: true,
                          properties: {
                            grantedCategories: {
                              type: "array",
                              items: { type: "string" }
                            }
                          }
                        },
                        approvalPhrase: { type: "string" },
                        approvalScopeMatched: { type: "boolean" },
                        issueTraceable: { type: "boolean" },
                        go: { type: "boolean" },
                        passkey: { type: "boolean" }
                      },
                      required: ["actionType", "mode", "repositoryInput"]
                    }
                  },
                  required: ["policyInput"]
                }
              }
            }
          },
          responses: {
            "200": {
              description: "Execution allowed"
            },
            "422": {
              description: "Execution blocked by policy"
            }
          }
        }
      }
    }
  };
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

function findSensitiveSetupInputs(answers) {
  const hits = [];
  for (const field of SENSITIVE_SETUP_FIELDS) {
    if (normalizeText(answers[field])) {
      hits.push(field);
    }
  }
  return hits;
}

function normalizedStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(normalize).filter(Boolean);
}

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeUrl(value) {
  const text = normalizeText(value);
  if (!text) {
    return "";
  }

  try {
    const url = new URL(text);
    return url.origin;
  } catch {
    return "";
  }
}
