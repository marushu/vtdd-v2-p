import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { resolveGatewayAliasRegistryFromGitHubApp } from "../src/core/index.js";

test("github app index merges live repositories and filters out non-visible provided mappings", async () => {
  const calls = [];
  const githubApiFetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(
      JSON.stringify({
        total_count: 2,
        repositories: [
          {
            full_name: "sample-org/vtdd-v2",
            name: "vtdd-v2",
            private: true
          },
          {
            full_name: "sample-org/accounting-app",
            name: "accounting-app",
            private: false
          }
        ]
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      }
    );
  };

  const result = await resolveGatewayAliasRegistryFromGitHubApp({
    policyInput: {
      aliasRegistry: [
        {
          canonicalRepo: "sample-org/vtdd-v2",
          productName: "VTDD V2",
          aliases: ["vtdd"]
        },
        {
          canonicalRepo: "sample-org/private-hidden-repo",
          productName: "Hidden Repo",
          aliases: ["hidden"]
        }
      ]
    },
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_live_index_token",
      GITHUB_API_FETCH: githubApiFetch
    }
  });

  assert.equal(result.source, "github_app_live");
  assert.equal(result.warnings.length, 0);
  assert.equal(result.aliasRegistry.length, 2);
  assert.equal(
    result.aliasRegistry.some((item) => item.canonicalRepo === "sample-org/private-hidden-repo"),
    false
  );

  const vtdd = result.aliasRegistry.find((item) => item.canonicalRepo === "sample-org/vtdd-v2");
  assert.equal(Boolean(vtdd), true);
  assert.equal(vtdd.visibility, "private");
  assert.equal(vtdd.productName, "VTDD V2");
  assert.equal(vtdd.aliases.includes("vtdd"), true);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.includes("/installation/repositories"), true);
  assert.equal(calls[0].init.headers.authorization, "Bearer ghs_live_index_token");
});

test("github app index falls back to provided aliases when permission is denied", async () => {
  const githubApiFetch = async () =>
    new Response(
      JSON.stringify({
        message: "Resource not accessible by integration"
      }),
      {
        status: 403,
        headers: {
          "content-type": "application/json"
        }
      }
    );

  const fallbackRegistry = [
    {
      canonicalRepo: "sample-org/vtdd-v2",
      aliases: ["vtdd"]
    }
  ];

  const result = await resolveGatewayAliasRegistryFromGitHubApp({
    policyInput: {
      aliasRegistry: fallbackRegistry
    },
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_token",
      GITHUB_API_FETCH: githubApiFetch
    }
  });

  assert.equal(result.source, "provided");
  assert.equal(result.aliasRegistry.length, 1);
  assert.equal(result.aliasRegistry[0].canonicalRepo, "sample-org/vtdd-v2");
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].includes("Resource not accessible by integration"), true);
});

test("github app index reports rate limit boundary and keeps fallback aliases", async () => {
  const githubApiFetch = async () =>
    new Response(
      JSON.stringify({
        message: "API rate limit exceeded"
      }),
      {
        status: 403,
        headers: {
          "content-type": "application/json",
          "x-ratelimit-remaining": "0",
          "retry-after": "60"
        }
      }
    );

  const result = await resolveGatewayAliasRegistryFromGitHubApp({
    policyInput: {
      aliasRegistry: [
        {
          canonicalRepo: "sample-org/vtdd-v2",
          aliases: ["vtdd"]
        }
      ]
    },
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_token",
      GITHUB_API_FETCH: githubApiFetch
    }
  });

  assert.equal(result.source, "provided");
  assert.equal(result.aliasRegistry.length, 1);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].includes("rate limited"), true);
});

test("github app index can mint installation token from github app credentials", async () => {
  const calls = [];
  const githubApiFetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (String(url).includes("/app/installations/98765/access_tokens")) {
      return new Response(
        JSON.stringify({
          token: "ghs_minted_installation_token",
          expires_at: "2030-01-01T00:00:00Z"
        }),
        {
          status: 201,
          headers: { "content-type": "application/json" }
        }
      );
    }
    return new Response(
      JSON.stringify({
        total_count: 1,
        repositories: [
          {
            full_name: "sample-org/vtdd-v2",
            name: "vtdd-v2",
            private: true
          }
        ]
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    );
  };

  const result = await resolveGatewayAliasRegistryFromGitHubApp({
    policyInput: {
      aliasRegistry: []
    },
    env: {
      GITHUB_APP_ID: "12345",
      GITHUB_APP_INSTALLATION_ID: "98765",
      GITHUB_APP_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nplaceholder\n-----END PRIVATE KEY-----",
      GITHUB_APP_JWT_PROVIDER: async () => "app_jwt_token_for_tests",
      GITHUB_API_FETCH: githubApiFetch
    }
  });

  assert.equal(result.source, "github_app_live");
  assert.equal(result.warnings.length, 0);
  assert.equal(result.aliasRegistry.length, 1);
  assert.equal(result.aliasRegistry[0].canonicalRepo, "sample-org/vtdd-v2");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url.includes("/app/installations/98765/access_tokens"), true);
  assert.equal(calls[0].init.headers.authorization, "Bearer app_jwt_token_for_tests");
  assert.equal(calls[1].url.includes("/installation/repositories"), true);
  assert.equal(calls[1].init.headers.authorization, "Bearer ghs_minted_installation_token");
});

test("github app index reuses cached minted token until refresh margin", async () => {
  const calls = [];
  const githubApiFetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (String(url).includes("/app/installations/112233/access_tokens")) {
      return new Response(
        JSON.stringify({
          token: "ghs_cached_installation_token",
          expires_at: "2099-01-01T00:00:00Z"
        }),
        {
          status: 201,
          headers: { "content-type": "application/json" }
        }
      );
    }
    return new Response(
      JSON.stringify({
        total_count: 1,
        repositories: [
          {
            full_name: "sample-org/vtdd-v2",
            name: "vtdd-v2",
            private: true
          }
        ]
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    );
  };

  const env = {
    GITHUB_APP_ID: "22222",
    GITHUB_APP_INSTALLATION_ID: "112233",
    GITHUB_APP_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nplaceholder\n-----END PRIVATE KEY-----",
    GITHUB_APP_JWT_PROVIDER: async () => "cached_app_jwt_token",
    GITHUB_APP_NOW_PROVIDER: () => 2000000000,
    GITHUB_API_FETCH: githubApiFetch
  };

  const first = await resolveGatewayAliasRegistryFromGitHubApp({
    policyInput: { aliasRegistry: [] },
    env
  });
  const second = await resolveGatewayAliasRegistryFromGitHubApp({
    policyInput: { aliasRegistry: [] },
    env
  });

  assert.equal(first.source, "github_app_live");
  assert.equal(second.source, "github_app_live");
  assert.equal(calls.filter((item) => item.url.includes("/access_tokens")).length, 1);
  assert.equal(calls.filter((item) => item.url.includes("/installation/repositories")).length, 2);
});

test("github app index warns when app credentials are incomplete", async () => {
  const result = await resolveGatewayAliasRegistryFromGitHubApp({
    policyInput: {
      aliasRegistry: [
        {
          canonicalRepo: "sample-org/vtdd-v2",
          aliases: ["vtdd"]
        }
      ]
    },
    env: {
      GITHUB_APP_ID: "12345"
    }
  });

  assert.equal(result.source, "provided");
  assert.equal(result.aliasRegistry.length, 1);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].includes("must all be configured"), true);
});

test("github app index normalizes escaped private key newlines before jwt provider usage", async () => {
  const githubApiFetch = async (url, init = {}) => {
    if (String(url).includes("/app/installations/98765/access_tokens")) {
      return new Response(
        JSON.stringify({
          token: "ghs_minted_installation_token",
          expires_at: "2030-01-01T00:00:00Z"
        }),
        {
          status: 201,
          headers: { "content-type": "application/json" }
        }
      );
    }
    return new Response(
      JSON.stringify({
        total_count: 1,
        repositories: [
          {
            full_name: "sample-org/vtdd-v2",
            name: "vtdd-v2",
            private: true
          }
        ]
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    );
  };

  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" });
  let seenKey = null;
  const result = await resolveGatewayAliasRegistryFromGitHubApp({
    policyInput: { aliasRegistry: [] },
    env: {
      GITHUB_APP_ID: "12345",
      GITHUB_APP_INSTALLATION_ID: "98765",
      GITHUB_APP_PRIVATE_KEY: JSON.stringify(pem).slice(1, -1),
      GITHUB_API_FETCH: async (url, init = {}) => {
        if (String(url).includes("/app/installations/98765/access_tokens")) {
          const authHeader = String(init?.headers?.authorization ?? "");
          assert.equal(authHeader.startsWith("Bearer "), true);
          seenKey = "normalized";
          return new Response(
            JSON.stringify({
              token: "ghs_minted_installation_token",
              expires_at: "2030-01-01T00:00:00Z"
            }),
            {
              status: 201,
              headers: { "content-type": "application/json" }
            }
          );
        }
        return githubApiFetch(url, init);
      },
    }
  });

  assert.equal(result.source, "github_app_live");
  assert.equal(result.warnings.length, 0);
  assert.equal(seenKey, "normalized");
});

test("github app index can enforce minted-token mode and block static token fallback", async () => {
  const result = await resolveGatewayAliasRegistryFromGitHubApp({
    policyInput: {
      aliasRegistry: [
        {
          canonicalRepo: "sample-org/vtdd-v2",
          aliases: ["vtdd"]
        }
      ]
    },
    env: {
      GITHUB_APP_ENFORCE_MINTED_INSTALLATION_TOKEN: "true",
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_static_token"
    }
  });

  assert.equal(result.source, "provided");
  assert.equal(result.aliasRegistry.length, 1);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].includes("disabled by GITHUB_APP_ENFORCE_MINTED_INSTALLATION_TOKEN"), true);
});
