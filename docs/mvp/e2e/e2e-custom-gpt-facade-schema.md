# E2E: Custom GPT facade schema operation limit

Issue: #841

## Purpose

Custom GPT Editor の OpenAPI operation 上限 30 件に対し、VTDD の内部 runtime capability を削らず、GPT-facing schema だけをカテゴリ facade に圧縮できていることを確認する。

## Local evidence

実行済み:

```text
npm run check:self-parity
node --test test/runtime-setup-manifest-parity.test.js test/custom-gpt-setup-artifacts.test.js test/custom-gpt-setup-docs.test.js
node --test test/worker.test.js --test-name-pattern "Custom GPT"
npm run build:worker
npm run check:generated-worker
```

確認内容:

- `docs/setup/custom-gpt-actions-openapi.yaml` は 7 operationId。
- `docs/setup/custom-gpt-actions-openapi.json` も同じ 7 path / operation。
- `check:self-parity` は `Checked 7/30 Custom GPT operationIds.` を返す。
- Worker は `/v2/custom-gpt/*` facade route を machine auth で保護する。
- `vtddCustomGptOps` は deploy 等の高リスク操作を直実行せず、same-origin passkey operator guidance を返す。

## Production E2E after deploy

PR merge と production deploy 後に実行する:

```sh
curl -fsS https://<runtime-host>/setup/openapi.yaml | grep -c 'operationId:'
curl -fsS https://<runtime-host>/setup/openapi.json | jq '.paths | keys'
```

期待:

- YAML operationId count: `7`
- JSON paths: `/health` と `/v2/custom-gpt/{gateway,memory,github,setup,execution,ops}`
- Custom GPT Editor の「URL からインポート」で 30件上限エラーが出ない。

## Boundary

この E2E は schema/facade 接続の確認であり、Custom GPT voice mode 中に Actions が実行できることは主張しない。deploy / secret / VPS maintenance / merge / issue close は引き続き scoped passkey approval が必要。
