# Issue #590 E2E progress containment evidence 作戦図

## 完了体験

iPhone サイズの Dashboard Butler PWA で、長い transient progress が出ても入力欄下の `進行中` が 2 行程度に収まり、通常チャット履歴を汚さず、owner が入力欄を失わないことを E2E evidence として残す。

## VTDD 全体で進める部分

Issue #590 の deploy 後 evidence gap のうち、PR #796 で直した composer progress containment を Playwright evidence に反映する。runtime 本体、deploy、Issue close、stop/interrupt、owner input queue は扱わない。

## 設計

既存の `scripts/e2e-issue590-dashboard-timeout-recovery.spec.mjs` を現在の single main Dashboard chat thread に合わせる。さらに 390x844 mobile viewport で `.progress-text` の 2 行 clamp と実測高さを検証し、スクリーンショットと state JSON に残す。

## 仮説

PR #792 で repository-derived thread が `dashboard-main-unresolved` に正規化され、E2E fixture の `dashboard-main-marushu-vtdd-v2-p` が runtime 表示 thread とズレた。そのため timeout recovery spec は fixture を読めず、default chat のみ表示されて失敗した。今回の iPhone 占有問題は runtime 本体では修正済みなので、E2E は高さ上限を観測できれば evidence として使える。

## 検証計画

- Local E2E: `npx playwright test scripts/e2e-issue590-dashboard-timeout-recovery.spec.mjs --browser=chromium --reporter=line`
- Evidence: `docs/mvp/e2e/assets/issue-590/local/issue590-dashboard-inline-transient-progress-chromium-state.json`
- Evidence: `docs/mvp/e2e/assets/issue-590/local/issue590-dashboard-inline-transient-progress-chromium-390x844.png`
- Hygiene: `git diff --check`

## 改修見積もり

- `scripts/e2e-issue590-dashboard-timeout-recovery.spec.mjs`: thread fixture を `dashboard-main-unresolved` に合わせ、高さ・line clamp assertion を追加する。risk は CSS 実測値が Chromium と iOS Safari で完全一致しないことだが、local E2E evidence としては mobile viewport の回帰検知に使える。

## 既に通っている経路

PR #795 は low-information status が readable checkpoint を消さないことを unit で保証した。PR #796 は composer 表示だけを compact 化し、CSS 2 行 clamp と generated worker 同期を通した。deploy と bridge restart は owner reported complete。

## 未確認の境界

production PWA の iOS Safari 実機スクリーンショットは owner/browser-authenticated evidence が必要。local Chromium E2E は production PWA 完了証拠ではなく、#590 completion gate の一部 evidence として扱う。

## 穴が出そうな箇所

timeout recovery spec と single main thread 化のズレは他の古い Dashboard E2E にも残っている可能性がある。この PR では #590 対象 spec だけを直し、横展開は別判断にする。

## PR 前に確認すること

main が `origin/main` と一致していること、PR #796 が merged/deployed 済みであること、untracked `.tmp/` と `test-results/` を含めないこと、E2E evidence が更新されること。

## 実装候補と捨てた案

採用: 既存 #590 E2E を現行 thread truth に合わせ、progress containment assertion を追加する。捨てた案: runtime を再変更する。今回の失敗は E2E fixture drift であり、runtime 変更は不要。捨てた案: timeout recovery test を削る。Issue #590 の復旧 evidence を弱めるため不採用。

## merge 後に通す E2E

必要なら production PWA で owner が長い `進行中` 表示を再現し、入力欄下が 2 行程度に収まるスクリーンショットを追加する。local evidence だけでは Dashboard Butler 完了とは言わない。

## 次の PR を増やさない理由

この PR は evidence spec の陳腐化修正と #796 の回帰検知追加だけで閉じる。Issue #590 の残 scope は current Now のまま維持し、別機能を混ぜない。

## 停止条件

E2E が runtime regression を示す、height assertion が実測に対して不安定、production-only auth が必要、または deploy/permission/destructive work が必要になった場合は停止する。
