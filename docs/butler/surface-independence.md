# Butler Surface Independence

## Principle

Butler must not be defined by any single AI product or UI surface.

## Initial Baseline

VTDD V2 may initially use ChatGPT Custom GPT as the Butler surface.

This is an implementation convenience, not a core identity.

## Separation Model

Butler should be understood as four separable layers:

- role
- contract
- runtime
- surface

### Role

Conversation, specification support, execution judgment, context recovery.

### Contract

Inputs, outputs, judgment order, approval expectations, and resolution rules.

### Runtime

Memory retrieval, runtime truth retrieval, proposal handling, approval orchestration.

### Surface

- ChatGPT Custom GPT
- web UI
- mobile app
- CLI
- future provider-specific surfaces

## Custom GPT And Dashboard Butler

Custom GPT Butler remains a supported Butler surface and fallback. Dashboard
Butler does not replace it as a fallback, and Dashboard work must not let Custom
GPT Instructions, Action Schema, setup artifacts, or operationId coverage drift.

Dashboard Butler should eventually exceed Custom GPT for the VTDD owner
workflow. The target is not a weaker homegrown chat UI. The target is a
Dashboard surface whose normal conversation is good enough to use every day and
whose VTDD-only capabilities make it more useful than Custom GPT for operating
VTDD from iPhone or iPad.

The two surfaces may share VTDD core actions when the operation is the same:

- GitHub read and write actions
- runtime truth retrieval
- operational RAG retrieval and write candidates
- repository nickname resolution
- self-parity and setup diagnostics
- setup artifact retrieval
- approval grant retrieval
- governed operator URL generation

Sharing an action does not make the surface the same. The surface contract must
still record which owner-facing path is expected to call the action and what
evidence proves that path.

Custom GPT path:

```text
Custom GPT Butler
  -> Action Schema operationId
  -> Worker /v2 route
  -> VTDD core runtime
```

Dashboard Butler path:

```text
Dashboard Butler PWA
  -> Worker / Durable Object dashboard chat room
  -> VPS Dashboard Bridge
  -> codex app-server
  -> VTDD core runtime and dashboard thread
```

Dashboard-only capabilities are the reason Dashboard Butler exists. They must
not be hidden as generic debug tools:

- iOS/PWA notifications, badges, and notification recovery
- live VPS/Codex/app-server progress visible from iPhone or iPad
- Action Schema and Instructions update guidance with owner-facing next steps
- Dashboard thread recovery after PWA background/foreground transitions
- owner-facing setup recovery for Custom GPT Action Schema and Instructions
- runtime/self-parity drift detection with next owner action
- passkey step-up only when a high-risk action scope requires it

Custom GPT-only or Custom GPT-primary capabilities must also remain explicit:

- ChatGPT-native conversation quality, thread handling, and memory affordances
- Action Schema operationId exposure
- canonical Custom GPT Instructions and short paste targets
- Custom GPT Action Authentication guidance
- Custom GPT as the fallback owner surface when Dashboard live chat is
  unavailable

## Requirement

Replacing the surface must not redefine Butler's judgment model or memory model.

Adding Dashboard Butler must not remove or stale the Custom GPT fallback. When a
PR changes a Butler-facing capability, its PR body must say whether the change
requires:

- Custom GPT Action Schema update
- Custom GPT Instructions update
- Cloudflare deploy update
- Dashboard Butler UI/runtime update
- iPhone/PWA live E2E evidence

Self-parity and setup diagnostics must report Custom GPT and Dashboard surface
needs separately. `runtimeParity=in_sync` is not proof that the current Custom
GPT editor has the latest Action Schema or Instructions, because the runtime
cannot read the editor's pasted state.

## Goal

VTDD V2 should support a future where each user has a dedicated Butler while the shared VTDD core remains common.
