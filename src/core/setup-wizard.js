import { evaluateDeployAuthorityStrategy } from "./deploy-authority.js";
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
      operatorManagedSecrets: true,
      autonomyModes: ["normal", "guarded_absence"],
      deployAuthority: buildDeployAuthorityRecommendation(answers)
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
  const deployAuthority = buildDeployAuthorityRecommendation(answers);

  return {
    setupMode: SetupMode.IPHONE_FIRST,
    steps: [
      "Open ChatGPT on iPhone and create or edit the Butler Custom GPT.",
      "Replace the full Instructions field with the construction text from this onboarding pack, then set action schema from the same pack.",
      "Use pr_comment for low-friction PR comments without GO, but require GO before pr_review_submit.",
      "Confirm GitHub production environment has required reviewers and Cloudflare secrets.",
      "Run GitHub Actions deploy-production with approval_phrase=GO and passkey_verified=true."
    ],
    deployAuthority,
    productionDeploy: {
      workflow: "deploy-production",
      environment: "production",
      requiredSecrets: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
      requiredInputs: ["approval_phrase=GO", "passkey_verified=true"],
      reminder: "Production deploy stays human-gated through GitHub Environment approval."
    },
    machineAuth: {
      recommendedMode: "worker_bearer",
      bearerSecretName: "VTDD_GATEWAY_BEARER_TOKEN",
      actionAuthType: "Bearer",
      fallbackMode: "cloudflare_access_service_token",
      fallbackHeaderNames: ["cf-access-client-id", "cf-access-client-secret"],
      fallbackSecretNames: ["CF_ACCESS_CLIENT_ID", "CF_ACCESS_CLIENT_SECRET"],
      reminder:
        "Show only setting names here. Do not paste bearer or service token values into setup wizard, chat, or issue text."
    },
    guardedAbsence: {
      modeName: "guarded_absence",
      allowedActions: ["read", "summarize", "issue_create", "build", "pr_comment", "pr_operation"],
      forbiddenActions: [
        "pr_review_submit",
        "merge",
        "deploy_production",
        "destructive",
        "external_publish"
      ],
      mandatoryStops: [
        "ambiguous request",
        "spec conflict",
        "unconfirmed target",
        "one issue / one PR violation"
      ],
      reminder: "Every guarded_absence execution must leave an execution_log trail for post-absence review."
    },
    reviewer: {
      initialReviewer: "gemini",
      fallbackReviewer: "antigravity",
      fallbackCondition: "emergency_only_with_learning_use_disabled",
      inputContract: ["PR diff", "context"],
      outputContract: ["critical_findings[]", "risks[]", "recommended_action"],
      authorityLimits: ["no execution authority", "no merge authority", "no deployment authority"],
      reminder: "Reviewer output is a blocking risk signal for Butler and human judgment, not an execution authority."
    },
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
    "Never ask the user to type API paths such as /v2/... (legacy /mvp/...) or raw JSON payloads.",
    "Convert natural Japanese requests into internal action calls yourself.",
    "Infer intent from natural conversation instead of fixed command phrases.",
    "When repository intent is ambiguous, ask a short confirmation question before switching context.",
    "When asked about repositories, show known repositories and aliases first.",
    "Follow Constitution-first and Issue-as-spec judgment order.",
    "Treat pr_comment and pr_review_submit as different approval boundaries: pr_comment does not require GO, but pr_review_submit requires GO.",
    "Normal mode uses autonomyMode=normal. Absence mode uses autonomyMode=guarded_absence with strict stop boundaries.",
    "In guarded_absence mode, do not execute merge/deploy/destructive/external_publish and stop on ambiguity/spec conflict/unconfirmed target.",
    "For high-risk actions (merge/deploy/destructive/external publish), require GO + passkey.",
    "Treat production deploy as VTDD-governed high-risk authority and avoid permanent production deploy secrets in GitHub.",
    "Use Gemini as reviewer and treat reviewer output as structured input for human final decision.",
    `Primary repositories: ${repoText}.`
  ].join("\n");
}

function buildDeployAuthorityRecommendation(answers) {
  return evaluateDeployAuthorityStrategy({
    repositoryVisibility: answers.repositoryVisibility,
    branchProtectionApiStatus: answers.branchProtectionApiStatus,
    rulesetsApiStatus: answers.rulesetsApiStatus,
    operatorPreference: answers.deployAuthorityPreference
  });
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
            "Recommended for Custom GPT Actions. Set this to VTDD_GATEWAY_BEARER_TOKEN configured on Cloudflare Worker environment (legacy MVP_GATEWAY_BEARER_TOKEN is also accepted)."
        },
        GatewayAccessClientIdHeader: {
          type: "apiKey",
          in: "header",
          name: "cf-access-client-id",
          description:
            "Alternative machine auth path. Set to CF_ACCESS_CLIENT_ID when Cloudflare Access service token mode is used."
        },
        GatewayAccessClientSecretHeader: {
          type: "apiKey",
          in: "header",
          name: "cf-access-client-secret",
          description:
            "Alternative machine auth path. Set to CF_ACCESS_CLIENT_SECRET when Cloudflare Access service token mode is used."
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
      "/v2/gateway": {
        post: {
          operationId: "postMvpGateway",
          security: buildMachineAuthSecurityOptions(),
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
                        autonomyMode: {
                          type: "string",
                          enum: ["normal", "guarded_absence"],
                          description:
                            "Execution autonomy mode. Use guarded_absence when operator is away and strict guardrails should stop ambiguous/high-risk actions."
                        },
                        ambiguity: {
                          type: "object",
                          additionalProperties: true,
                          properties: {
                            ambiguousRequest: { type: "boolean" },
                            specConflict: { type: "boolean" },
                            targetUnconfirmed: { type: "boolean" },
                            issuePrCount: { type: "integer", minimum: 0 }
                          }
                        },
                        targetConfirmed: {
                          type: "boolean"
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
            "401": {
              description: "Machine auth credential is missing"
            },
            "403": {
              description: "Machine auth credential is present but invalid"
            },
            "422": {
              description: "Execution blocked by policy"
            }
          }
        }
      },
      "/v2/retrieve/constitution": {
        get: {
          operationId: "getConstitutionRecords",
          security: buildMachineAuthSecurityOptions(),
          parameters: [
            {
              name: "limit",
              in: "query",
              required: false,
              schema: {
                type: "integer",
                minimum: 1,
                maximum: 200,
                default: 5
              },
              description: "Maximum number of constitution records to return."
            }
          ],
          responses: {
            "200": {
              description: "Constitution records retrieved"
            },
            "401": {
              description: "Machine auth credential is missing"
            },
            "403": {
              description: "Machine auth credential is present but invalid"
            },
            "503": {
              description: "Memory provider is not configured"
            }
          }
        }
      },
      "/v2/retrieve/decisions": {
        get: {
          operationId: "getDecisionLogReferences",
          security: buildMachineAuthSecurityOptions(),
          parameters: [
            {
              name: "limit",
              in: "query",
              required: false,
              schema: {
                type: "integer",
                minimum: 1,
                maximum: 200,
                default: 5
              },
              description: "Maximum number of decision logs to return."
            },
            {
              name: "relatedIssue",
              in: "query",
              required: false,
              schema: {
                type: "integer",
                minimum: 1
              },
              description: "Filter decision logs by related issue number."
            }
          ],
          responses: {
            "200": {
              description: "Decision log references retrieved"
            },
            "401": {
              description: "Machine auth credential is missing"
            },
            "403": {
              description: "Machine auth credential is present but invalid"
            },
            "503": {
              description: "Memory provider is not configured"
            }
          }
        }
      },
      "/v2/retrieve/proposals": {
        get: {
          operationId: "getProposalLogReferences",
          security: buildMachineAuthSecurityOptions(),
          parameters: [
            {
              name: "limit",
              in: "query",
              required: false,
              schema: {
                type: "integer",
                minimum: 1,
                maximum: 200,
                default: 5
              },
              description: "Maximum number of proposal logs to return."
            },
            {
              name: "relatedIssue",
              in: "query",
              required: false,
              schema: {
                type: "integer",
                minimum: 1
              },
              description: "Filter proposal logs by related issue number."
            }
          ],
          responses: {
            "200": {
              description: "Proposal log references retrieved"
            },
            "401": {
              description: "Machine auth credential is missing"
            },
            "403": {
              description: "Machine auth credential is present but invalid"
            },
            "503": {
              description: "Memory provider is not configured"
            }
          }
        }
      },
      "/v2/retrieve/cross": {
        get: {
          operationId: "getCrossIssueMemoryIndex",
          security: buildMachineAuthSecurityOptions(),
          parameters: [
            {
              name: "phase",
              in: "query",
              required: false,
              schema: {
                type: "string",
                enum: ["execution", "exploration"],
                default: "execution"
              },
              description: "Retrieval phase that determines source priority."
            },
            {
              name: "limit",
              in: "query",
              required: false,
              schema: {
                type: "integer",
                minimum: 1,
                maximum: 200,
                default: 5
              },
              description: "Maximum number of ordered references to return."
            },
            {
              name: "relatedIssue",
              in: "query",
              required: false,
              schema: {
                type: "integer",
                minimum: 1
              },
              description: "Filter decision/proposal/PR context by related issue number."
            },
            {
              name: "issueNumber",
              in: "query",
              required: false,
              schema: {
                type: "integer",
                minimum: 1
              },
              description: "Current issue number to include as issue reference candidate."
            },
            {
              name: "issueTitle",
              in: "query",
              required: false,
              schema: {
                type: "string"
              },
              description: "Current issue title for issue reference candidate."
            },
            {
              name: "issueUrl",
              in: "query",
              required: false,
              schema: {
                type: "string"
              },
              description: "Current issue URL for issue reference candidate."
            },
            {
              name: "q",
              in: "query",
              required: false,
              schema: {
                type: "string"
              },
              description: "Optional free-text query for PR context narrowing."
            }
          ],
          responses: {
            "200": {
              description: "Cross-issue memory index retrieved"
            },
            "401": {
              description: "Machine auth credential is missing"
            },
            "403": {
              description: "Machine auth credential is present but invalid"
            },
            "503": {
              description: "Memory provider is not configured"
            }
          }
        }
      }
    }
  };
}

function buildMachineAuthSecurityOptions() {
  return [
    { GatewayBearerAuth: [] },
    {
      GatewayAccessClientIdHeader: [],
      GatewayAccessClientSecretHeader: []
    }
  ];
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
