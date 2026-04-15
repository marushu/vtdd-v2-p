# spec: Production Deploy Path (GitHub Actions -> Cloudflare)

## Intent

MVP の production deploy 経路を `GitHub Actions -> Cloudflare` に固定し、`deploy_production` を高リスク操作として承認境界付きで実行できるようにする。

## Background

`#13` の MVP 条件には production deploy が含まれている。  
現状は core policy / approval / credential boundary が揃っている一方、実際の deploy 実行経路（workflow + runtime entry）が未整備である。

## Scope

- Cloudflare Workers 向けの最小 runtime entry を追加する
- `wrangler.toml` と deploy 手順を追加する
- GitHub Actions に production deploy workflow を追加する
- deploy workflow を高リスク経路として扱う
- deploy に必要な secret/variable contract を明文化する

## Success Criteria

- production deploy workflow が repo に存在する
- deploy は `main` かつ明示トリガー経路に限定される
- deploy は GitHub Environment `production` を経由して実行される
- `GO + passkey` 方針に沿う運用境界（明示承認 + protected environment）が定義される
- Cloudflare 側への deploy コマンドが再現可能な形で固定される

## Non-goal

- 複数環境（staging/canary）運用の導入
- passkey 検証サービスの新規実装
- deploy 後の監視・自動rollback実装

## Open Questions

- Cloudflare credential は API Token + Account ID で統一するか
- deploy workflow のトリガーを `workflow_dispatch` のみで開始するか
