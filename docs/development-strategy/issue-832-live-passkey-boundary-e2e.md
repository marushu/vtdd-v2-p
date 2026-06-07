# Issue #832 live passkey boundary E2E runner 作戦図

## 完了体験

Owner が「live E2E は君がやって」と言ったとき、mac Codex / VPS Codex CLI は production runtime に対して安全な範囲の live E2E を実行し、passkey 実機認証の手前までの truth を Markdown で読みやすく返せる。結果は「完走できなかった」ではなく、どこまで通り、どこから owner device の WebAuthn assertion が必要かを明確に示す。

## VTDD 全体で進める部分

Issue #741 の Butler Completion Gate で不足している live E2E evidence を、passkey を迂回せずに標準化する。Dashboard Butler / VPS Codex CLI が将来同じ runner を使えるよう、secret を出さない CLI と Markdown evidence を repo に置く。

## 設計

`scripts/e2e-issue741-live-passkey-boundary.mjs` を追加する。runner は production runtime URL と repository / issue number を受け取り、`VTDD_GATEWAY_BEARER_TOKEN` で machine-auth 可能な範囲だけを実行する。

runner は health、VPS maintenance proposal 作成、passkey challenge 生成、actual operator HTML 取得、PR #831 の guard marker 確認を行う。WebAuthn assertion は実行せず、`blocked_on_owner_passkey_assertion` を expected boundary として Markdown に出す。

## 仮説

現在の問題は live E2E そのものの未接続ではなく、owner 実機 passkey が必要な境界と、それ以前に自動確認できる runtime truth が混ざっていること。自動確認できる範囲を runner 化すれば、PR #831 の production 反映確認と Issue #741 の未完了境界を毎回同じ形式で報告できる。

狭く operator HTML の grep だけで済ませると、proposal / challenge / dashboard auth boundary が確認されない。逆に passkey を迂回すると authority model を壊す。

## 検証計画

- Unit: runner の report builder / marker validation / secret redaction を fixture fetch で検証する。
- Integration: `node --test test/e2e-issue741-live-passkey-boundary.test.js` を通す。
- Static: `git diff --check` を通す。
- Live: merge/deploy 後、`VTDD_GATEWAY_BEARER_TOKEN` ありで runner を production に対して実行し、Markdown evidence が `blocked_on_owner_passkey_assertion` で終わることを確認する。

## 改修見積もり

- `scripts/e2e-issue741-live-passkey-boundary.mjs`: live boundary runner。risk は bearer token / challenge body / approval secret の漏えい。
- `test/e2e-issue741-live-passkey-boundary.test.js`: fixture fetch で network なしに validation と report を固定する。risk は production-only failure を見逃すこと。
- `docs/mvp/e2e/issue-741-live-passkey-boundary-e2e.md`: owner-facing evidence contract。risk は completion を過大表現すること。
- `docs/development-strategy/issue-832-live-passkey-boundary-e2e.md`: この作戦図。

## 既に通っている経路

PR #831 は merged/deployed 済み。manual live probe では production health、operator HTML、real proposal 作成、passkey challenge 生成まで通った。WebAuthn assertion は owner device required で停止した。

## 未確認の境界

runner を VPS Codex CLI から直接呼べるか、Dashboard Butler が runner output をどの lane に表示するか、owner-action 通知が多すぎないかは未確認。これらはこの PR の completion ではなく follow-up 境界。

## 穴が出そうな箇所

proposal 作成は production memory に approval_required record を残す。runner は `review` operation / no-op capability / short expiry / `rootExecutionStarted=false` を evidence に出し、helper queue や root execution には進まない。

challenge response は秘密そのものではないが、challenge 本体や session id は owner-facing output に出さない。report は boolean / count / rpId だけにする。

## PR 前に確認すること

Issue #832、AGENTS.md、Issue #741 scope、passkey approval boundary、existing proposal/helper routes、test fixtures、generated worker の変更有無。

## 実装候補と捨てた案

採用案は live boundary runner。捨てた案は production passkey bypass、fake approvalGrantId、test-only production approval endpoint、operator HTML grep だけの簡易確認。いずれも authority boundary か evidence completeness を壊す。

## merge 後に通す E2E

production deploy 後、runner を production URL に対して実行し、health / proposal / challenge / operator markers が PASS、terminal boundary が `blocked_on_owner_passkey_assertion` になることを確認する。

## 次の PR を増やさない理由

Issue #832 の範囲は runner + test + evidence doc に限定できる。passkey 後の terminal helper pickup 自動化や test tenant 設計は別問題であり、この PR に混ぜると authority boundary が曖昧になる。

## 停止条件

runner が approvalGrantId を生成・保存・偽造する必要が出た場合、helper queue / root execution / credential mutation / deploy が必要になった場合、または production に owner-specific secret を出す必要が出た場合は停止する。
