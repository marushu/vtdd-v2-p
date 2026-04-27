# E2E-28 Repository Nickname Context Resolution

This document records concrete run evidence for the E2E-28 track.

## Scope

Issues:
- `#89`
- parent anchor: `#4`

Goal:
- confirm Butler can persist explicit user-defined repository nicknames at runtime
- confirm stored nicknames are merged with the GitHub App live repository index
- confirm Butler can resolve those nicknames without weakening `no default repository`
- confirm ambiguous nickname matches remain blocking instead of silently executing against the wrong repository

## Happy-path Run

Command:

```sh
node --test test/repository-nickname-registry.test.js test/worker.test.js test/core-policy.test.js test/custom-gpt-setup-docs.test.js
```

Observed result on 2026-04-27:
- passed
- confirms Butler can store explicit repository nicknames such as `公開VTDD`
- confirms stored nickname records are returned through `/v2/retrieve/repository-nicknames`
- confirms gateway resolution can merge stored nicknames with the live GitHub App repository index and resolve `公開VTDD` back to `marushu/vtdd-v2-p`
- confirms Custom GPT docs now expose the canonical nickname save/read operations

## Boundary-path Run

Command:

```sh
node --test test/repository-nickname-registry.test.js test/core-policy.test.js test/worker.test.js
```

Observed result on 2026-04-27:
- passed
- confirms nickname writes are rejected when the target repository cannot be resolved against the full live alias registry
- confirms ambiguous nickname matches remain blocking and surface `target repository nickname is ambiguous`
- confirms execution mode still blocks unresolved/ambiguous nickname targets rather than reintroducing a default repository

## Evidence Files

- `src/core/repository-nickname-registry.js`
- `src/core/repository-resolution.js`
- `src/core/github-app-repository-index.js`
- `src/worker.js`
- `docs/butler/context-resolution.md`
- `docs/setup/custom-gpt-actions-openapi.yaml`
- `docs/setup/custom-gpt-instructions.md`
- `test/repository-nickname-registry.test.js`
- `test/core-policy.test.js`
- `test/worker.test.js`
- `test/custom-gpt-setup-docs.test.js`

## Current Reading

E2E-28 now has recorded happy-path and boundary-path run evidence in-repo.

This confirms Issue `#89` is connected to a runtime nickname path that makes
Butler more operator-friendly without weakening the `no default repository`
invariant. It does not claim free-form natural language will always resolve
without ambiguity, nor that nickname memory overrides canonical repository
confirmation for risky execution.
