# Reviewer Policy

This document is the canonical reviewer operations policy for Issue #11.

## Reviewer Role

The reviewer is a critical evaluation role.

- The reviewer analyzes PR diff and context.
- The reviewer does not execute code changes.
- The reviewer does not hold merge authority.
- The reviewer does not hold deployment authority.
- The reviewer output is structured input for Butler and human judgment.

## Initial Reviewer Choice

- Gemini is the initial reviewer for VTDD V2.
- Reviewer integration must remain pluggable and vendor-independent.
- The initial choice must not hard-code the long-term reviewer architecture.
- Any reviewer path that requires a provider API key must be treated as an
  explicit opt-in cost/account choice, not a silent default.

## Fallback Position

- Codex GitHub review may be requested as an emergency fallback when Gemini is
  temporarily unavailable because of quota, rate-limit exhaustion, or transient
  provider high demand / temporary unavailability.
- This fallback remains critique-only and depends on the operator's Codex
  GitHub integration, not on repository-owned execution credentials.
- Antigravity is not the normal reviewer path.
- Antigravity may be used only as an emergency fallback.
- Emergency fallback use assumes learning-use is disabled in its service settings.
- Emergency fallback use must be treated as an exceptional operational choice, not the default review loop.

## Selection Criteria

Reviewer candidates must be evaluated on all of the following axes:

- review quality
- operating cost
- whether the operator already has access through an existing subscription
- fit with revision loop
- learning-use risk
- data handling conditions
- non-lock-in portability

No reviewer choice should be justified by cost alone.
No reviewer choice should silently add a new paid API dependency when a
subscription-backed or already-owned reviewer surface is the intended operator
path.

## Pluggable Contract

Reviewer integration must preserve a vendor-neutral contract.

Input:

- PR diff
- context

Output:

- `critical_findings[]`
- `risks[]`
- `recommended_action`

The reviewer contract must stay compatible with registry-based adapter replacement.

## Butler Integration

- Butler treats reviewer output as a blocking risk signal when critical findings or serious risks are present.
- Butler may summarize or structure reviewer output, but must not erase meaningful reviewer objections.
- Human remains the final authority for revision GO and for GO/GO+passkey authority delegation.

## Security Boundary

- The reviewer must not receive execution credentials.
- The reviewer must not receive persistent high-risk authority.
- Sensitive review use must consider learning-use risk before sending content to any external reviewer service.

## Non-goals

- free-tier review quota validation
- AI Extended Access benefit validation
- fully automated merge decisions by reviewer
- vendor-locked reviewer architecture
