# MVP Issue Triage and Launch Plan

## Purpose

`#1-#20` と追加草案を突き合わせ、MVP で「今すぐ起票すべきもの」だけを残す。

## Alignment Check for Existing `#1-#20`

- `#1`-`#20` は大枠整合している
- ただし `#13` は旧タイトル/旧スコープのままで、MVP統合親Issueとして再定義が必要
- Butler / Alias / No Default Repo / Credential Boundary / Memory Safety は docs 側で明確化済みだが、Issue 側は不足がある

### Per-Issue Compatibility Notes

- `#1`: Vision 原点として有効。`docs/vision` と整合。
- `#2`-`#5`: Day系の実装順メモ。MVPメモリ基盤要素として有効だが、`#13`配下で再束ねが必要。
- `#6`: Deprecated 宣言済み。現行正本として扱わない方針は docs と整合。
- `#7`: Constitution schema の親仕様として有効。`docs/constitution` と整合。
- `#8`: Policy Engine 実装Issueとして有効。`#7/#9/#10/#14` 依存の切り分けも妥当。
- `#9`: Consent/Approval 基本モデルとして有効。ただし credential segmentation 粒度は追加Issueが必要。
- `#10`: Runtime truth/reconcile 方針として有効。`docs/architecture` と整合。
- `#11`: Gemini初期 reviewer + pluggable 方針は有効。role separation 参照を補強すると安定。
- `#12`: 状態遷移定義Issueとして有効。境界整理済み。
- `#13`: 現行本文は古い。`docs/mvp/issue-13-rewrite-draft.md` で置換必須。
- `#14`: Issue-as-spec 憲法として有効。`docs/architecture` と整合。
- `#15`: Issue template は有効。
- `#16`: PR template は有効。
- `#17`: Decision Log は有効。`docs/memory` と整合。
- `#18`: Butler constitution-first protocol は有効。`docs/butler/role` と整合。
- `#19`: Retrieval contract は有効。`docs/memory` と整合。
- `#20`: Proposal/Exploration log は有効。`#14` の実行境界と共存可能。

## Additional Drafts Triage

### A. Duplicate with Existing Issues (No New Issue)

- Draft 10 `Reviewer Contract` -> `#11` に包含（reviewer I/O と pluggable 方針あり）
- Draft 7 `GO + Passkey` -> `#9` と security docs に包含。新規起票せず、統合Issueへ吸収

### B. Merge into One Issue

- Draft 2 `Project Alias / Repository Resolution`
- Draft 3 `No Default Repo`
- Draft 4 `Context-first Resolution`
  - 上記3件は1本化して repo 誤認防止の仕様を統合する

- Draft 5 `GitHub Credential Boundary / Token Segmentation`
- Draft 6 `Destructive Action Path`
- Draft 7 `GO + Passkey Approval`
  - 上記は1本化して高リスク実行境界の仕様として統合する

### C. New Issues to Create

1. spec: Repository Resolution Safety (Alias + Context-first + No Default Repo)
2. spec: Credential Boundary and High-risk Path (GitHub App + GO/Passkey + Destructive Path)
3. spec: Butler Surface Independence (role/contract/runtime/surface split)
4. spec: Memory Safety Policy (store/do-not-store boundary for RAG memory)
5. spec: Role Separation Model (Butler / Executor / Reviewer responsibilities)

## Recommended Filing Order

1. Update `#13` using `docs/mvp/issue-13-rewrite-draft.md`
2. Create `Repository Resolution Safety` issue
3. Create `Credential Boundary and High-risk Path` issue
4. Create `Memory Safety Policy` issue
5. Create `Butler Surface Independence` issue
6. Create `Role Separation Model` issue
7. Update `#11` to explicitly reference the new role separation / reviewer contract issue

## Ready-to-Post Issue Bodies

### 1) spec: Repository Resolution Safety (Alias + Context-first + No Default Repo)

```md
## Intent
repo 誤認による誤実行を防ぐため、Alias解決・文脈優先解決・No Default Repo を一つの安全仕様として定義する。

## Background
プロダクト通称（例: LEDGER_APP）と canonical repo 名が一致しない運用では、誤ターゲット実行が最も高リスクな失敗になる。

## Scope
- alias registry schema
- context-first resolution order
- no default repository rule
- execution confirmation rule (resolved target + action + confirm)

## Success Criteria
- read/summarize は alias から best-effort 解決できる
- unresolved repo は execution を停止する
- destructive/execute では resolved target 明示確認が必須
- 「default repo」に頼る実行経路が存在しない

## Non-goal
- 曖昧語の完全自動解決
- default repo 復活
```

### 2) spec: Credential Boundary and High-risk Path (GitHub App + GO/Passkey + Destructive Path)

```md
## Intent
GitHub App 前提の credential 境界と高リスク操作フローを定義し、侵害時の blast radius を最小化する。

## Background
`#9` は承認モデルを定義しているが、GitHub credential segmentation と destructive path を MVP運用粒度で固定する必要がある。

## Scope
- GitHub App credential model
- role/risk segmentation (read/execute/destructive/deploy)
- GO + passkey requirement for high-risk actions
- short-lived privileged credential minting
- destructive action separated path + audit log

## Success Criteria
- 常設の高権限 credential を持たない
- merge/deploy/destructive/external publish が GO+passkey 経路に限定される
- approval -> short-lived credential -> single action -> audit の流れが定義される
- reviewer は実行権限を持たない

## Non-goal
- 他SCMの実装固定
- 全操作への passkey 強制
```

### 3) spec: Butler Surface Independence

```md
## Intent
Butler を特定AI製品やUIに固定せず、role/contract/runtime/surface を分離した設計として定義する。

## Background
初期は ChatGPT Custom GPT を利用してよいが、VTDD 本体が単一 surface に依存すると将来移行時に判断モデルが崩れる。

## Scope
- Butler layers: role, contract, runtime, surface
- initial surface policy (Custom GPT allowed, but non-canonical)
- replacement invariants (surface replacement must not change judgment model)

## Success Criteria
- Butler が「どの UI か」ではなく「何を守る役割か」で説明できる
- surface を差し替えても Constitution-first / Issue-as-spec / approval boundary が維持される

## Non-goal
- 追加 surface の即時実装
```

### 4) spec: Memory Safety Policy

```md
## Intent
RAG memory の保存境界を定義し、再利用価値と安全性を両立する。

## Background
MVP段階から memory が正本運用に入るため、何を保存し何を保存しないかの基準を先に固定する必要がある。

## Scope
- store/do-not-store policy
- canonical spec vs background context separation
- user-specific memory in DB as source of truth
- secret exclusion rule

## Success Criteria
- decision/proposal/alias/approval/execution trace の保存基準が明文化される
- tokens/private keys/raw secrets/不要な雑談全文を保存しない
- Git正本（共通仕様）とDB正本（ユーザー記憶）が混線しない

## Non-goal
- retention automation の実装
```

### 5) spec: Role Separation Model (Butler / Executor / Reviewer)

```md
## Intent
Butler / Executor / Reviewer の責務境界を定義し、判断と実行の混線を防ぐ。

## Background
同一AIで運用する期間があっても、構造上の分離がないと review が execution を追認するだけになりやすい。

## Scope
- each role responsibility
- handoff contracts between roles
- reviewer isolation from execution credentials
- relation to `#11` reviewer pluggability

## Success Criteria
- role ごとの入出力責務が明文化される
- reviewer は批判的評価に専念し、実行権限を持たない
- 同一AI運用でも構造分離が保持される

## Non-goal
- 複数AIの同時実装必須化
```
