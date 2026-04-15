# spec: Machine Auth Path for GPT Actions under Access

## Intent

Cloudflare Access で `/mvp/*` を保護した状態を維持しつつ、ChatGPT Custom GPT Actions から `/mvp/gateway` を安定して呼び出せる機械認証経路を定義する。

## Background

- 現在の MVP は iPhone-first setup と Access 保護を満たしている。
- ただし Access の対話ログイン前提だけでは、GPT Actions（サーバー側呼び出し）との整合が不安定になりやすい。
- 「URLは固定でも許可ユーザーのみ」を維持しながら、機械的な API 呼び出し経路を正本化する必要がある。

## Scope

- `/mvp/gateway` 向け machine auth contract を定義
- Access 保護との両立方針を定義（browser auth と machine auth を分離）
- 失効・ローテーション・最小権限の運用ルールを定義
- GPT Action schema 側に必要な auth 記述（例: bearer/service token）を反映
- 認証失敗時のエラー契約（401/403/422）を明確化

## Success Criteria

- `/setup/*` は人間ログイン（Access）で保護される
- `/mvp/gateway` は機械認証付きで GPT Actions から安定して呼び出せる
- 認証情報は GitHub/Cloudflare の secret 管理に限定され、平文共有されない
- 既存の GO / GO+passkey 境界を壊さない

## Non-goal

- エンプラ向けSSO完全統合
- 複数IdPの同時実装
- アプリ内ユーザー管理ダッシュボード実装

## Open Questions

- Access service token を使うか、Worker独自 bearer を使うか（MVP推奨はどちらか）
- GPT Actions の secret 入力制約に合わせた運用テンプレートをどう固定するか
