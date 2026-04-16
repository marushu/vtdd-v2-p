# Memory Safety Policy

This document is the canonical memory safety policy for Issue #23.

## Goal

VTDD V2 must preserve reusable judgment context without turning memory into an unsafe dump of secrets, canonical specs, or unnecessary raw chat history.

## Store / Do-Not-Store Boundary

Store:

- decision log
- proposal log
- alias registry
- approval log
- execution log
- compact working memory summaries

Do not store:

- tokens
- private keys
- raw secrets
- unnecessary full casual chat transcripts
- canonical shared specification in DB memory

## Canonical Separation

- shared canonical specification belongs in Git
- user-specific memory and operational traces belong in DB-backed memory
- runtime truth must not be replaced by memory recall

Git and DB must not be treated as interchangeable sources of truth.

## Secret Exclusion Rule

Memory writes must be rejected when content or metadata contains secret-like material.

At minimum, the policy excludes:

- API tokens
- private key blocks
- password / secret / api_key style assignments

## Working Memory Rule

- short structured summaries are allowed
- full casual chat history is not allowed by default
- transcript-heavy storage requires explicit narrow approval outside normal operation

## Safety Processing

- selection happens before write
- sensitive values are redacted when sanitized output is needed
- storage should remain compact, referenceable, and recovery-oriented

## Non-goals

- retention automation
- storing all conversation then trimming later
- using DB memory as a replacement for canonical Git-managed spec
