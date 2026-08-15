# VPS Emergency Access Boundary

Issue: #843

## Intent

VTDD must keep working when the owner's Mac is unavailable.

The normal product direction is still:

`Owner on iPhone/iPad -> Dashboard Butler -> VTDD runtime -> VPS Codex CLI`

Mac Codex can remain useful as a bootstrap and debugging surface, but it must
not be the only recovery path. If the home Mac is down while the owner is away,
VPS Codex CLI needs enough authority to inspect current VTDD state, continue
safe work, and request a short-lived emergency unlock for higher-risk recovery.

This design deliberately rejects an AWS-dependent implementation. VTDD should
borrow the operational pattern of short-lived authority, scoped execution, and
audited cleanup, but the first target is the existing fixed-cost VPS.

## Security Position

There is no honest design that is both fully safe and able to do anything.

The workable target is:

- normally safe and narrow,
- powerful only after explicit owner approval,
- powerful only for a short TTL,
- observable before execution,
- audited after execution,
- revocable when a host or key is suspected compromised.

The important boundary is not whether a secret exists on the VPS at all. The
important boundary is whether the VPS can use that secret at any time without
fresh owner intent.

VTDD must avoid a standing, always-usable copy of the owner's Mac SSH config or
all private keys on the VPS. Emergency authority can exist only as an approval
grant, short-lived key, short-lived decrypt grant, or temporary agent state.

## Authority Tiers

### Tier 1: Normal Runner

Purpose:

- read GitHub Issues, PRs, Actions, runtime truth, queue state, and RAG;
- run bounded Codex implementation work for allowlisted repositories;
- open or update branches and PRs inside Issue scope.

Approval:

- ordinary work requires Issue scope and GO where required by the authority
  model;
- no passkey is required for read-only inspection.

Secret posture:

- GitHub token and Codex runner credentials are configured for the VPS runner;
- no broad Mac-equivalent SSH config is exposed;
- no root shell or arbitrary host maintenance is available.

Failure mode:

- if an operation needs host privilege, external SSH, credential mutation,
  deploy, or destructive action, Tier 1 must stop and propose Tier 2 or Tier 3.

### Tier 2: Privileged Maintenance Capability

Purpose:

- execute known high-risk VPS maintenance through Issue #637's root-owned
  helper lifecycle;
- restart runner services, repair sandbox prerequisites, install known
  dependencies, inspect bounded logs, or run a predefined recovery capability.

Approval:

- scoped passkey approval showing host, repository, capability, impact scope,
  and expiry.

Secret posture:

- `vtdd-runner` does not receive `NOPASSWD:ALL`;
- it can only invoke the root-owned helper with a bounded execution envelope;
- helper input is written to a restricted temporary file and removed after use;
- logs are redacted and summarized.

Failure mode:

- if no existing capability covers the emergency, Butler creates a capability
  proposal rather than silently widening sudo.

### Tier 3: Break-glass Emergency Session

Purpose:

- recover when Tier 1 and Tier 2 cannot continue and waiting for Mac Codex would
  break the iPhone-first VTDD experience;
- allow stronger SSH or secret use for a short, owner-approved window.

Approval:

- scoped owner passkey approval plus an explicit GO phrase for the specific
  emergency session;
- the approval screen must show target host, repository, branch, command class,
  reason, forbidden targets, TTL, and expected cleanup.

Secret posture:

- emergency material is decrypted or minted only after approval;
- it is held in `tmpfs`, a short-lived `ssh-agent`, or an equivalent volatile
  store;
- the grant expires automatically;
- cleanup destroys agent keys, temp files, and grant records that contain usable
  secret material.

Default TTL:

- initial design target: 60 minutes maximum;
- shorter TTL should be used when the recovery is predictable;
- longer TTL requires a new approval, not silent extension.

Failure mode:

- if the requested action would mutate credentials, permissions, deployment,
  production data, or repository administration, the emergency session still
  must surface a separate scoped approval before that mutation.

## SSH Rules

VTDD emergency SSH must use purpose-specific identities:

- one key per target class where possible;
- target allowlist in config;
- no agent forwarding by default;
- no X11 forwarding;
- no local or remote port forwarding unless the execution envelope explicitly
  allows it;
- no broad root login as the default path;
- forced command or helper entrypoint for normal and Tier 2 paths.

The execution envelope must include:

- repository;
- related Issue;
- target host;
- target user;
- allowed command class;
- forbidden hostnames or path prefixes;
- branch/base ref where applicable;
- dry-run or preview output;
- TTL;
- redaction rules;
- cleanup plan;
- runtime truth destination.

## Secret Placement

Allowed on VPS:

- runner-scoped GitHub token or app credential;
- Codex runner authentication required for the selected runner model;
- encrypted emergency vault material that is unusable without a fresh grant;
- public SSH keys;
- audit logs with redacted summaries.

Allowed only during an approved emergency window:

- decrypted private keys;
- decrypted host config;
- short-lived SSH certificates or temporary public-key authorization;
- short-lived deploy or maintenance credentials.

Forbidden as standing VPS state:

- a plain copy of the owner's full Mac `~/.ssh/config`;
- a plain copy of broad SSH private keys;
- unrestricted root shell credentials;
- unredacted secrets in RAG, GitHub Issues, PRs, logs, Dashboard messages, or
  Codex transcripts;
- approval tokens or WebAuthn raw material that can be replayed.

Encryption reduces accidental exposure but does not make a hostile VPS safe.
If the VPS is fully compromised while a secret can be decrypted locally, the
attacker may be able to use it. The design must therefore combine encryption
with short TTL, explicit approval, redaction, audit, and rotation.

## Recovery Routing

When the owner asks for recovery from iPhone:

1. Butler classifies the request.
2. Butler reads Issue, PR, queue, runtime truth, and RAG before executing.
3. If Tier 1 can continue, VPS Codex CLI runs without passkey.
4. If a known host capability is required, Butler requests Tier 2 passkey
   approval and sends the helper envelope.
5. If the capability is missing and the situation is urgent, Butler proposes
   Tier 3 break-glass with visible scope and TTL.
6. If owner approval is missing, Butler reports `waiting_for_owner_approval`
   rather than `blocked` as a dead end.
7. After execution, Butler returns before/after state, audit summary, cleanup
   status, and the next safe action.

## AI Drift Guard

The model can misclassify a target or invent intent. Emergency authority must
therefore be constrained by data that is harder for the model to improvise:

- target host allowlist;
- repository allowlist;
- branch prefix policy;
- forbidden target list;
- explicit issue traceability;
- execution preview;
- owner-visible approval scope;
- one-time grant ID;
- post-action audit.

The owner should be able to reject the approval screen without losing the
conversation. Rejection is not an error; it is runtime truth.

## Relation To Existing Issues

- Issue #637 defines known privileged VPS maintenance capabilities.
- Issue #741 defines the VPS local helper queue and runner pickup path.
- Issue #843 defines the emergency authority boundary above those systems.

Issue #843 must not widen Issue #637 by adding broad sudo. It should define how
Butler decides when a known capability is enough, when a new capability proposal
is required, and when a short-lived break-glass session is justified.

## Non-goals

- Do not introduce AWS, SSM, or EC2 Instance Connect as the initial
  implementation path.
- Do not put a plain full Mac SSH config on the VPS.
- Do not make arbitrary root shell the normal operating model.
- Do not claim Butler completion until Dashboard intent, Custom GPT schema,
  runtime route, runner path, authority boundary, runtime truth, E2E evidence,
  and PR mapping are connected.
