# Issue #843 Emergency SSH / Break-glass Boundary Strategy

## 完了体験

owner が iPhone から「Mac が落ちた。VTDD を続けて」と頼んだ時、Butler は
Mac Codex に戻らず、VPS Codex CLI 側で現在地を復元する。

通常作業で足りるならそのまま進める。VPS の host privilege が必要なら
Issue #637 の capability helper approval に進む。それでも足りず、緊急復旧が
必要な時だけ、target / reason / TTL / forbidden scope を見せたうえで
break-glass emergency session を owner passkey / GO で開く。

## 採用方針

- AWS / SSM / EC2 Instance Connect は採用しない。
- 固定費 VPS を emergency runner / recovery runner の実行面にする。
- 岡本さんの記事から借りるのは、長期鍵を置かず、短命権限、監査、TTL 破棄で
  強い権限を扱う考え方だけにする。
- 「安全だから何もできない」設計にも、「VPS に Mac と同じ平文秘密情報を
  置く」設計にも寄せない。

## 三層モデル

1. Normal runner
   - GitHub / runtime truth / RAG / queue を読み、Issue scoped な Codex work を行う。
   - 高リスク操作、host privilege、外部 SSH、credential mutation は実行しない。

2. Privileged maintenance capability
   - Issue #637 の root-owned helper を使う。
   - 既知 capability だけを passkey approval 付きで実行する。
   - 足りない capability は proposal 化する。

3. Break-glass emergency session
   - Tier 1 / Tier 2 で復旧不能な時だけ使う。
   - short-lived key / decrypt grant / ssh-agent / tmpfs を使い、TTL 後に破棄する。
   - 実行前に target host、repo、branch、command class、forbidden targets、
     dry-run、cleanup plan を owner に見せる。

## 初期実装スライス

この PR では runtime 実装や credential mutation をしない。先に repo-backed
設計を固定する。

- `docs/security/vps-emergency-access-boundary.md`
  - canonical security boundary。
- `docs/development-strategy/issue-843-emergency-ssh-boundary.md`
  - Issue #843 の実装順序と停止条件。
- `docs/mvp/active-issue-execution-queue.md`
  - Issue #843 を ROOT / recovery blocker として記録する。

## 次の実装候補

1. authority classifier
   - owner intent を Tier 1 / Tier 2 / Tier 3 に分類する。
   - `waiting_for_owner_approval` と `blocked` を分ける。

2. execution envelope schema
   - target allowlist、forbidden targets、TTL、redaction、cleanup plan を
     machine-readable にする。

3. dry-run E2E
   - 実秘密なしで approval request、grant mint、envelope generation、
     TTL cleanup、redacted audit を通す。

4. emergency vault adapter
   - age/sops、gpg、1Password CLI、systemd-creds、独自 envelope encryption を比較し、
     固定費 VPS 前提で最小構成を決める。

## 停止条件

- 平文 SSH private key や Mac の full SSH config を VPS に常置したくなった時。
- 「安全のため blocked」とだけ返し、復旧 routing を出せない設計になった時。
- Issue #637 の helper を迂回して broad sudo を通常経路に入れたくなった時。
- live secret 登録、credential mutation、production SSH 実行、deploy が必要になった時。

## RAG に残す判断

この方針は thread-local で流すと危険なので、RAG には
`working_memory` として残す。

残す要点:

- AWS は使わない。
- 固定費 VPS 前提で進める。
- 通常 runner、privileged helper、break-glass emergency session の三層に分ける。
- emergency session は owner passkey / GO、TTL、tmpfs / ssh-agent、audit、
  cleanup、rotation を前提にする。
- 「安全で何でも」は存在しないため、通常時は狭く、緊急時だけ短命に強い権限を
  開く。
