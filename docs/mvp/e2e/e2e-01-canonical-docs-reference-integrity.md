# E2E-01 Canonical Docs + Reference Integrity Evidence

This document records concrete run evidence for Issue #51 and the related E2E-01 track.

## Scope

Issues:
- `#1`
- `#7`
- `#13`
- `#51`

Goal:
- confirm canonical docs exist
- confirm parent issue draft references resolve
- confirm missing canonical schema/rule paths are treated as blocking by tests

## Happy-path Run

Command:

```sh
node --test test/canonical-docs-restoration.test.js
```

Observed result on 2026-04-17:
- passed
- verifies all eight canonical docs exist in repo
- verifies `docs/mvp/issue-13-rewrite-draft.md` references those paths and they resolve

## Boundary-path Run

Command:

```sh
node --test test/constitution-schema.test.js
```

Observed result on 2026-04-17:
- passed
- includes boundary checks where required canonical rule ids are missing and validation fails
- confirms canonical schema/rule drift is treated as blocking rather than silently accepted

## Evidence Files

- `test/canonical-docs-restoration.test.js`
- `test/constitution-schema.test.js`
- `docs/mvp/issue-13-rewrite-draft.md`

## Current Reading

E2E-01 now has recorded happy-path and boundary-path run evidence in-repo.

This does not by itself close the related issues.
Human closure judgment still depends on the repository-wide completion gate.
