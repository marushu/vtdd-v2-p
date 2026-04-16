# Additional Issue Drafts

These drafts capture MVP-critical topics that are only partially represented in the current issue set.

## 1. spec: Butler Surface Independence

### Intent

Butler を特定 AI プロダクトや特定 UI に固定せず、role / contract / runtime / surface を分離した形で定義する。

### Background

初期運用では ChatGPT Custom GPT を Butler surface として使ってよいが、VTDD V2 の本質はそこに依存してはならない。

将来的に Web UI、モバイルアプリ、CLI、Gemini / Claude 系 surface へ差し替え可能である必要がある。

### Success Criteria

- Butler を surface ではなく role と contract で説明できる
- 初期 surface が Custom GPT でも、本体設計が OpenAI 固有にならない
- 将来の独自 UI / app 実装に耐える

### Non-goal

- 新しい surface を今すぐ実装すること
- 特定 provider の完全抽象化を初回で完遂すること

## 2. spec: Project Alias / Repository Resolution

### Intent

`LEDGER_APP` や `帳簿アプリ` のような通称を canonical repository に解決できるようにし、執事的な文脈理解と repo 誤認防止を両立する。

### Background

実際の repo 名とプロダクト名が一致しないケースでは、会話上の固有名詞解決が Butler 品質に直結する。

### Success Criteria

- alias registry の構造が定義される
- Butler が read / summarize タスクでは alias から repo 解決を試みられる
- execution 時は resolved target を確認できる

### Non-goal

- default repo を復活させること
- あいまいな別名から危険操作を自動実行すること

## 3. spec: No Default Repo

### Intent

デフォルト対象 repo を持たず、repo 未確定時の誤実行を制度的に防ぐ。

### Success Criteria

- default repo を前提にしない
- repo 未確定時は execution に進まない
- Butler が `今はこのリポジトリの話で合っていますか？` と確認できる

### Non-goal

- よく使う repo の候補保持を禁止すること

## 4. spec: Context-first Resolution

### Intent

固有名詞の解決では、外部一般知識より内部文脈・既知 repo・既知 docs を優先する。

### Success Criteria

- `SunabaEye` や `LEDGER_APP` を generic web search より前に内部文脈から解決する
- 既知 docs の要約依頼で、内部 docs 読解が優先される

### Non-goal

- すべての曖昧語を自動で正解にできること

## 5. spec: GitHub Credential Boundary / Token Segmentation

### Intent

GitHub App を前提に、read / execute / destructive の権限を分離し、侵害時の blast radius を小さくする。

### Success Criteria

- GitHub App が初期 credential model として定義される
- role / risk ごとの権限分離が明文化される
- destructive 権限が常設されない

### Non-goal

- 他 SCM の実装詳細まで確定すること

## 6. spec: Destructive Action Path

### Intent

destructive 操作を通常経路から切り分け、モバイル中心でも安全に高リスク操作を扱えるようにする。

### Success Criteria

- destructive action の定義がある
- repo 確認、scope 確認、audit log、短命高権限 credential の流れが定義される
- iPhone / iPad / Android を前提にした UX を壊さない

### Non-goal

- destructive 操作を PC 専用にすること

## 7. spec: GO + Passkey Approval Model

### Intent

高リスク操作に対して、`GO` と passkey の両方を必要とする承認モデルを定義する。

### Success Criteria

- merge / deploy / destructive / external publish に `GO + passkey` が適用される
- passkey は device-agnostic に扱われる
- approval 後に短命 credential を発行する前提がある

### Non-goal

- 全操作に passkey を要求すること

## 8. spec: Memory Safety Policy

### Intent

memory に残すべき情報と残してはいけない情報を分離し、RAG を便利かつ安全に運用できるようにする。

### Success Criteria

- decision / proposal / alias / approval / execution を残す基準がある
- secrets / tokens / private keys /不要な雑談全文を残さない
- canonical spec と background context の区別が保たれる

### Non-goal

- retention 実装の自動化

## 9. spec: Role Separation Model

### Intent

Butler / Executor / Reviewer の責務混線を防ぎ、同一 AI 依存による盲点を避けられる構造を作る。

### Success Criteria

- Butler / Executor / Reviewer の責務が定義される
- 同一 AI 運用は可能でも、構造上は分離可能である

### Non-goal

- 複数 AI の同時実装を必須にすること

## 10. spec: Reviewer Contract

### Intent

Gemini を初期 reviewer としつつ、reviewer を批判的補完役のプラガブル契約として定義する。

### Success Criteria

- reviewer 入出力が定義される
- 初期 reviewer が Gemini であることが明示される
- Gemini 固定ではない

### Non-goal

- reviewer の完全自動 merge 判定
