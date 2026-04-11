# Workers V2 最小構成

## 目的

Cloudflare Workers を V2 として再構築し、VTDD の統治・記憶・実行境界を整理する。

Workers は「何でもやる箱」ではなく、VTDD Core の判断を実世界の操作に変換する境界層として扱う。

---

## 役割

Workers V2 の責務は以下の 4 つに限定する。

1. Runtime truth の取得
2. Policy / Guardrail の執行
3. Memory の入出力
4. Adapter の呼び出し

---

## 設計原則

### 1. Core は薄く保つ
- オーケストレーション中心
- 個別サービス依存を持ち込まない

### 2. Adapter に差分を閉じ込める
- GitHub
- OpenAI
- Gemini
- 将来の他サービス

### 3. Policy を独立させる
- GO なし build 禁止
- repo 未確定時の操作禁止
- reconcile_required 時の再読込
- PR 未特定時の PR 操作禁止

### 4. Memory schema を先に固定する
- constitution
- decision_log
- working_memory
- temperature_notes
- repair_cases

---

## 最小レイヤー構成

```text
Butler / Operator
  -> Worker Core
    -> Policy Layer
    -> Runtime Readers
    -> Memory Layer
    -> Adapter Layer
```

---

## コンポーネント案

### 1. Worker Core
責務:
- リクエスト受付
- 文脈解決
- Policy 評価の起点
- 各レイヤー呼び出し
- レスポンス整形

想定 entrypoints:
- /butler/live-surface
- /butler/progress
- /memory/retrieve
- /memory/store
- /runtime/read
- /action/execute

### 2. Policy Layer
責務:
- 実行可否判定
- approval boundary 強制
- 危険操作の境界管理

最小ルール:
- build_requires_human_go
- issue_creation_requires_confirmation
- merge_requires_human_approval
- dangerous_write_requires_dangerous_approval
- unresolved_target_blocks_execution

### 3. Runtime Readers
責務:
- 現在状態の取得
- durable truth の読み出し

最小 reader:
- github_repo_reader
- github_issue_reader
- github_pr_reader
- workflow_reader

### 4. Memory Layer
責務:
- 記憶の保存・取得
- RAG 用チャンクの整形
- 優先順位付き検索

最小 API:
- retrieve_constitution
- retrieve_decisions
- retrieve_working_memory
- retrieve_temperature_notes
- append_decision
- append_temperature_note
- append_repair_case

### 5. Adapter Layer
責務:
- 外部サービス差分の吸収

最小 adapter:
- github_adapter
- openai_adapter
- gemini_adapter

将来候補:
- stitch_adapter
- web_prototype_adapter
- linear_adapter
- notion_adapter

---

## 標準フロー

### 観測フロー
1. Runtime truth を読む
2. 必要な memory を読む
3. Policy に照らして次の安全な行動を返す

### 実行フロー
1. 対象解決
2. approval 確認
3. Policy 判定
4. Adapter 実行
5. 結果記録
6. decision_log / repair_cases へ反映

---

## 公開分離方針

### vtdd-v2
- コア設計
- 内部運用知識
- private memory
- 温度メモリ

### 将来の公開 repo（例: vtdd-runtime）
- 公開可能な Worker 実装
- socket / adapter contract
- example 実装
- 導入手順

公開 repo は V2 で十分に育てた後に抽出する。

---

## 最初に作るべきもの

1. constitution/core.md
2. memory schema draft
3. policy rule list
4. runtime reader interface
5. github adapter interface
6. openai / gemini executor interface

---

## 一言

Workers V2 は VTDD の本体ではない。

Workers V2 は、VTDD の判断・記憶・承認境界を、現実の操作へ安全に変換するための境界層である。