# Final Rewrite for Issue #13

## Title

P0: VTDD V2 MVP Bootstrap (Canonical Parent for Initial Build)

## Intent

VTDD V2 の MVP 実装を開始するための統合親 Issue を確定する。  
この Issue は個別仕様を置換しない。既存仕様を「実装順で束ねる正本入口」として機能する。

## Position

- `#13` は実装アンカー（execution anchor）
- 個別仕様の正本は `#1-#20` と Git 上の仕様文書
- 実装は常に子仕様へトレース可能でなければならない

## Canonical Inputs

### Vision / Constitution / Spec Discipline

- `#1` VTDD V2 draft
- `#7` Constitution schema
- `#14` Issue as canonical spec
- `#15` Issue template
- `#16` PR template
- `#18` Butler review protocol

### Governance / Runtime / Execution

- `#8` Policy Engine
- `#9` Consent / Approval
- `#10` Runtime Truth / Reconcile
- `#11` reviewer pluggability (Gemini initial)
- `#12` State Machine

### Memory / Retrieval

- `#2` memory schema
- `#3` memory provider interface
- `#4` Cloudflare provider minimum
- `#5` retrieve minimum
- `#17` Decision Log
- `#19` Retrieval Contract
- `#20` Proposal / Exploration Log

### Git Documents (MVP Baseline)

- `docs/vision/vtdd-v2-overview.md`
- `docs/architecture/basic-architecture.md`
- `docs/butler/role.md`
- `docs/butler/surface-independence.md`
- `docs/butler/context-resolution.md`
- `docs/memory/rag-memory-philosophy.md`
- `docs/security/threat-model.md`
- `docs/security/go-passkey-approval-model.md`
- `docs/mvp/bootstrap-plan.md`
- `docs/mvp/issue-triage-plan.md`

## MVP Scope (Must Hold Together)

### 1. Judgment and Spec Boundary

- Constitution-first judgment
- Issue-as-spec during execution
- No spec inference in execution
- Proposal and execution separation

### 2. Butler and Repository Safety

- Butler is context-first
- Alias-based repository resolution exists
- No default repository
- Unresolved target blocks execution

### 3. Credential and Approval Safety

- GitHub App is the credential model
- Credential boundary is segmented by role/risk
- High-risk actions require `GO + passkey`
- Destructive path is separated and audited

### 4. Memory Backbone and Safety

- RAG/memory is operational from MVP phase
- Decision / proposal / alias / approval traces begin accumulating
- Secrets are excluded from memory
- DB is source of truth for user-specific memory/logs

### 5. Review and Deploy

- Reviewer initial candidate is Gemini
- Reviewer contract remains pluggable
- Production deploy is included in MVP
- Deploy path is GitHub Actions -> Cloudflare

## Explicit Non-goals

- Multi-SCM full support
- Full multi-provider runtime implementation
- Billing / tenant management UI
- Native mobile app implementation
- Unscoped optimization outside referenced Issues

## Success Criteria

- MVP can run on GitHub + Cloudflare baseline without hard-coding VTDD meaning to either platform
- Butler can resolve context safely and refuse unsafe execution
- Repository mis-targeting risk is reduced by alias + no-default + confirmation path
- High-risk operations are gated by `GO + passkey` and short-lived credentials
- Production deploy can be executed under governed approval

## Execution Notes

- Any missing detail must be resolved by updating the relevant child Issue, not by ad hoc implementation
- Out-of-scope ideas are proposed separately and not implemented in the same PR
