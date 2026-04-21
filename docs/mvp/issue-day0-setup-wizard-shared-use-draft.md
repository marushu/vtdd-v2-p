# Issue Draft: Day0 Setup Wizard For Shared Use

## Intent

Replace the historical owner-seeded setup flow with a Day0 setup wizard that
lets invited users complete VTDD setup on their own GitHub, Cloudflare,
Gemini, and ChatGPT accounts, then continue through shared VTDD entry surfaces
without owner-specific shortcuts.

## Success Criteria

1. public setup flow no longer depends on the owner's personal Cloudflare
   runtime URL
2. the wizard models GitHub, Cloudflare, Gemini, and ChatGPT as required setup
   legs for each invited user
3. the wizard creates or reuses a user-owned GitHub fork for the invited user
   before shared-use GitHub readiness can complete
4. Cloudflare runtime creation or resolution is treated as a required wizard
   behavior
5. the first Cloudflare connection path is API Token based, with runtime
   identity retained in setup state but raw runtime URL hidden from normal
   wizard output
6. wizard readiness is blocked until a user-owned fork, a user-owned runtime,
   and required settings
   exist
7. the repo and public setup surfaces no longer present owner-only assumptions
   as shared-use defaults
8. shared VTDD GPT entry and Codex handoff appear only after the same Day0
   readiness gate

## Non-Goals

- automatic GPT creation
- Gemini API key issuance
- payments
- Cloudflare OAuth implementation
- auto-upgrade propagation
- teardown of user-created infrastructure

## Evidence Expectations

- canonical spec: `docs/mvp/day0-setup-wizard-shared-use-spec.md`
- scrub checklist: `docs/mvp/day0-setup-wizard-scrub-checklist.md`
- implementation evidence in wizard/public-surface files
- tests proving shared-use assumptions are represented and owner-only redirects
  are absent

## Decision Notes

- first Cloudflare implementation path is API Token, not OAuth
- wizard-path GitHub destination is a user-owned fork created or reused
  in-flow
- user-owned Worker runtime is created or resolved inside the wizard flow
- raw Worker URL remains internal setup state and is not shown on normal public
  wizard surfaces
- setup service may retain GitHub App manifest bundle and Cloudflare API token
  in D1-backed temporary state only until Day0 core readiness is proven
- temporary D1 secret state is purged once Day0 core reaches `ready`
- shared VTDD GPT reveal is a post-ready surface and must not be required for
  Codex handoff readiness
