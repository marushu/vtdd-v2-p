# Custom GPT setup import URLs E2E

Issue: #839

## Purpose

iPhone の Custom GPT Editor で Action Schema 本文貼り付けが URL エンコードされる場合に、本文を貼らず `URL からインポートする` で Custom GPT Actions schema を設定できるようにする。

## Implemented runtime URLs

- `/setup/openapi.yaml`
- `/setup/openapi.json`
- `/setup/instructions.txt`

## Expected production checks after deploy

```sh
curl -sS https://vtdd-v2-mvp.polished-tree-da7c.workers.dev/setup/openapi.yaml | head
curl -sS https://vtdd-v2-mvp.polished-tree-da7c.workers.dev/setup/openapi.json | head
curl -sS https://vtdd-v2-mvp.polished-tree-da7c.workers.dev/setup/instructions.txt | head
```

Expected:

- YAML is raw OpenAPI, not HTML and not URL encoded.
- YAML `servers.url` is `https://vtdd-v2-mvp.polished-tree-da7c.workers.dev`.
- JSON `servers[0].url` is `https://vtdd-v2-mvp.polished-tree-da7c.workers.dev`.
- Instructions are raw text; no secret values are displayed.
- `/setup/latest` displays the import URLs for Custom GPT Editor.

## Current local evidence

- `node --test test/worker.test.js --test-name-pattern "setup latest|setup import URLs"`
- `node --test test/custom-gpt-setup-artifacts.test.js test/runtime-setup-manifest-parity.test.js`
- `npm run build:worker`
- `npm run check:self-parity`
- `npm run check:generated-worker`

## Remaining production / device E2E

- Deploy to production.
- Open `/setup/latest` from iPhone.
- Use Custom GPT Editor `URL からインポートする` with `/setup/openapi.yaml`.
- Confirm Actions detects VTDD operations.
- Confirm Action Authentication remains API key / Bearer and does not display tokens in Wizard.
