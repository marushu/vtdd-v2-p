import test from "node:test";
import assert from "node:assert/strict";
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
            full_name: "marushu/vtdd-v2",
            name: "vtdd-v2",
            private: true
          },
          {
            full_name: "marushu/hibou-piccola-bookkeeping",
            name: "hibou-piccola-bookkeeping",
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
          canonicalRepo: "marushu/vtdd-v2",
          productName: "VTDD V2",
          aliases: ["vtdd"]
        },
        {
          canonicalRepo: "marushu/private-hidden-repo",
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
    result.aliasRegistry.some((item) => item.canonicalRepo === "marushu/private-hidden-repo"),
    false
  );

  const vtdd = result.aliasRegistry.find((item) => item.canonicalRepo === "marushu/vtdd-v2");
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
      canonicalRepo: "marushu/vtdd-v2",
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
  assert.equal(result.aliasRegistry[0].canonicalRepo, "marushu/vtdd-v2");
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
          canonicalRepo: "marushu/vtdd-v2",
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
