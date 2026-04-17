# E2E-12 Deploy Boundary and Governed Production Flow Evidence

This document records concrete run evidence for the E2E-12 track.

## Scope

Issues:
- `#37`
- `#75`
- `#90`
- parent anchor: `#13`

Goal:
- confirm production deploy is governed rather than implied by `main`
- confirm setup output exposes deploy authority / deploy contract / guarded absence contract
- confirm degraded or blocked high-risk paths are treated explicitly

## Happy-path Run

Command:

```sh
node --test test/production-deploy-path.test.js test/deploy-authority.test.js test/worker.test.js
```

Observed result on 2026-04-17:
- passed
- confirms production deploy path is fixed to the governed workflow/environment contract
- confirms setup wizard surfaces deploy authority recommendation, detection inputs, and deploy contract details
- confirms setup wizard surfaces guarded absence contract details
- confirms allowed guarded absence execution remains traceable in worker execution logs

## Boundary-path Run

Command:

```sh
node --test test/guarded-semi-automation-mode.test.js test/deploy-authority-branching-doc.test.js test/worker.test.js
```

Observed result on 2026-04-17:
- passed
- confirms guarded absence blocks high-risk deploy/merge paths
- confirms GitHub protection unavailability degrades recommendation to direct provider path
- confirms required checks / approval boundary documentation remain aligned with blocking behavior
- confirms blocked guarded absence execution remains traceable in worker execution logs

## Evidence Files

- `test/production-deploy-path.test.js`
- `test/deploy-authority.test.js`
- `test/deploy-authority-branching-doc.test.js`
- `test/guarded-semi-automation-mode.test.js`
- `test/worker.test.js`
- `docs/mvp/production-deploy-path.md`
- `docs/mvp/deploy-authority-branching.md`
- `docs/security/guarded-semi-automation-mode.md`

## Current Reading

E2E-12 now has recorded happy-path and boundary-path run evidence in-repo.

This still does not imply overall repository completion.
Human closure judgment and the remaining matrix tracks are still required.
