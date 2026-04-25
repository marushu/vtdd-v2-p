import test from "node:test";
import assert from "node:assert/strict";
import {
  createPasskeyApprovalOptions,
  createPasskeyRegistrationOptions,
  dedupePasskeys,
  evaluateApprovalGrant,
  isExpiredPasskeyEphemeralRecord,
  verifyPasskeyApproval,
  verifyPasskeyRegistration
} from "../src/core/index.js";

const mockAdapter = {
  async generateRegistrationOptions(input) {
    return {
      challenge: input.challenge,
      rp: {
        id: input.rpID,
        name: input.rpName
      }
    };
  },
  async verifyRegistrationResponse() {
    return {
      verified: true,
      registrationInfo: {
        credential: {
          id: new Uint8Array([1, 2, 3, 4]),
          publicKey: new Uint8Array([5, 6, 7, 8]),
          counter: 1
        },
        credentialDeviceType: "singleDevice",
        credentialBackedUp: true,
        aaguid: "test-aaguid"
      }
    };
  },
  async generateAuthenticationOptions(input) {
    return {
      challenge: input.challenge,
      allowCredentials: input.allowCredentials
    };
  },
  async verifyAuthenticationResponse() {
    return {
      verified: true,
      authenticationInfo: {
        newCounter: 2
      }
    };
  }
};

test("passkey registration options create pending session record", async () => {
  const result = await createPasskeyRegistrationOptions({
    adapter: mockAdapter,
    rpID: "example.com",
    rpName: "VTDD",
    origin: "https://example.com"
  });

  assert.equal(result.ok, true);
  assert.equal(result.sessionRecord.type, "approval_log");
  assert.equal(result.sessionRecord.content.kind, "passkey_registration");
  assert.match(result.optionsJSON.challenge, /^challenge:/);
});

test("passkey registration verify creates passkey registry record", async () => {
  const session = await createPasskeyRegistrationOptions({
    adapter: mockAdapter,
    rpID: "example.com",
    rpName: "VTDD",
    origin: "https://example.com"
  });

  const result = await verifyPasskeyRegistration({
    adapter: mockAdapter,
    sessionRecord: session.sessionRecord,
    response: {
      id: "ignored",
      response: {
        transports: ["internal"]
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.passkeyRecord.type, "working_memory");
  assert.equal(result.passkeyRecord.tags.includes("passkey_registry"), true);
});

test("passkey approval verify creates approval grant bound to scope", async () => {
  const options = await createPasskeyApprovalOptions({
    adapter: mockAdapter,
    rpID: "example.com",
    origin: "https://example.com",
    passkeys: [
      {
        credentialId: "AQIDBA",
        publicKey: "BQYHCA",
        counter: 1,
        transports: ["internal"]
      }
    ],
    scope: {
      actionType: "deploy_production",
      repositoryInput: "sample-org/vtdd-v2",
      issueNumber: 14,
      relatedIssue: 14,
      phase: "execution"
    }
  });

  const verified = await verifyPasskeyApproval({
    adapter: mockAdapter,
    sessionRecord: options.sessionRecord,
    response: {
      id: "AQIDBA",
      response: {}
    },
    passkeys: [
      {
        credentialId: "AQIDBA",
        publicKey: "BQYHCA",
        counter: 1,
        transports: ["internal"]
      }
    ]
  });

  assert.equal(verified.ok, true);
  assert.equal(verified.grantRecord.content.kind, "passkey_grant");
  assert.equal(verified.approvalGrant.scope.actionType, "deploy_production");
});

test("approval grant rejects mismatched scope", () => {
  const result = evaluateApprovalGrant({
    approvalGrant: {
      verified: true,
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        actionType: "deploy_production",
        repositoryInput: "sample-org/vtdd-v2",
        issueNumber: "14",
        relatedIssue: "14",
        phase: "execution"
      }
    },
    scope: {
      actionType: "destructive",
      repositoryInput: "sample-org/vtdd-v2",
      issueNumber: "14",
      relatedIssue: "14",
      phase: "execution"
    }
  });

  assert.equal(result.ok, false);
});

test("dedupePasskeys keeps latest credential record", () => {
  const records = dedupePasskeys([
    {
      createdAt: "2026-04-24T00:00:00.000Z",
      content: {
        credentialId: "abc",
        publicKey: "old",
        counter: 1
      }
    },
    {
      createdAt: "2026-04-25T00:00:00.000Z",
      content: {
        credentialId: "abc",
        publicKey: "new",
        counter: 2
      }
    }
  ]);

  assert.equal(records.length, 1);
  assert.equal(records[0].publicKey, "new");
});

test("completed registration session expires and becomes cleanup target", async () => {
  const session = await createPasskeyRegistrationOptions({
    adapter: mockAdapter,
    rpID: "example.com",
    rpName: "VTDD",
    origin: "https://example.com",
    sessionTtlMs: 1
  });

  const result = await verifyPasskeyRegistration({
    adapter: mockAdapter,
    sessionRecord: session.sessionRecord,
    response: {
      id: "ignored",
      response: {
        transports: ["internal"]
      }
    },
    sessionTtlMs: 1
  });

  assert.equal(
    isExpiredPasskeyEphemeralRecord(result.completedSessionRecord, new Date(Date.now() + 10)),
    true
  );
});
