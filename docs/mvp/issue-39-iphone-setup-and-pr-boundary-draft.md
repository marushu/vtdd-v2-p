# spec: iPhone-first Setup Wizard + PR Interaction Approval Split

## Intent

MVP の初回導線を iPhone で開始可能にし、PR関連操作の承認境界を実運用しやすい形に分離する。

## Background

- 既存の setup wizard は安全方針は満たすが、モバイルでそのまま使えるコピペ導線が弱い。
- PR コメント投稿まで GO 必須だと、チーム運用の摩擦が大きい。

## Scope

- `runInitialSetupWizard` に iPhone-first onboarding pack を追加
- Custom GPT Construction / Action Schema のコピペ可能出力
- setup answers への secret 入力禁止
- PR action を `pr_comment` と `pr_review_submit` に分離
- `pr_comment` は GO 不要、`pr_review_submit` は GO 必須

## Success Criteria

- setup wizard が iPhone導線の手順とコピペ値を返せる
- wizard 経由で token/private key を受け付けない
- policy が PRコメントとレビュー確定を別境界で判定する
- merge / deploy / destructive の `GO + passkey` は維持される

## Non-goal

- passkey attestation サービス実装
- ChatGPT Custom GPT 以外の新surface追加実装
- production deploy フローの再設計
