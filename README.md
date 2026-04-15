# vtdd-v2
VTDD V2: memory-first architecture with pluggable sockets and GitHub-first but non-lock-in design

## MVP Core (initial implementation)

Current code starts with deterministic governance gates:

- approval boundary (`GO` / `GO + passkey`)
- alias-based repository resolution with no default repository
- execution policy gate (traceability + target resolution + approval)

Code lives in `src/core/`, with tests in `test/core-policy.test.js`.

## Run tests

```bash
npm test
```
