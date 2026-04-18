# Cloudflare Inventory and Cleanup Audit

## Purpose

This document records the current Cloudflare-side inventory needed before live/manual iPhone testing.

It is a read-only audit.
It does not delete or recreate Cloudflare resources automatically.

## Scope

- Worker script
- workers.dev exposure
- custom domains
- Access applications
- D1
- R2
- Vectorize

## Current Findings

### Worker Script

- account id: `bd82bbc79ce38442976432eaa409e48c`
- worker name: `vtdd-v2-mvp`
- workers.dev account subdomain: `polished-tree-da7c`
- script subdomain status: `enabled=true`, `previews_enabled=true`

Current public worker URL:

- `https://vtdd-v2-mvp.polished-tree-da7c.workers.dev`

Current setup wizard URL:

- `https://vtdd-v2-mvp.polished-tree-da7c.workers.dev/setup/wizard?repo=sample-org/vtdd-v2`

Current health URL:

- `https://vtdd-v2-mvp.polished-tree-da7c.workers.dev/health`

### Exposure Reading

- `workers.dev` exposure is currently active
- custom worker domains are not attached
- the public URL should be treated as live exposure until worker teardown or access hardening is completed

### Custom Domains

- current inventory reading: none
- Cloudflare Workers Domains API returned zero attached domains for `vtdd-v2-mvp`

### D1

- current inventory reading: none
- Cloudflare D1 API returned zero databases in the current account

### Vectorize

- current inventory reading: none
- Cloudflare Vectorize API returned zero indexes in the current account

### Access Applications

- current inventory reading: unknown
- current token could not read Access applications (`403 Forbidden`)
- manual creations cannot yet be ruled in or ruled out from API evidence

### R2

- current inventory reading: unknown
- current token could not read R2 buckets (`403 Forbidden`)
- manual buckets cannot yet be ruled in or ruled out from API evidence

## Cleanup Candidate Reading

### Safe-to-assume current live asset

- `vtdd-v2-mvp` worker script exists and is publicly reachable on `workers.dev`

### Likely absent from current account evidence

- custom domains
- D1 databases
- Vectorize indexes

### Still requires owner review or broader token scope

- Access applications
- R2 buckets

These remain unresolved inventory areas until read-only evidence is collected.

## Non-claim

This audit does not say the environment is clean.
It only says what can and cannot currently be proven from read-only Cloudflare evidence.

It must not be used as justification to delete resources automatically without owner review.
