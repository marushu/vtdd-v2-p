# Issue #744 chat layout / VRT 作戦図

## 完了体験

Dashboard Butler の通常チャットで、owner 発言は右寄せ、Butler 返信は左寄せのまま、iPad / iPhone / desktop 幅でも本文が見切れない。
長文、reply preview、timestamp、copy button が同時に出ても、読み幅カラムの中で自然に配置される。

## VTDD 全体で進める部分

Issue #744 のうち、会話として読めない root blocker である message alignment / clipping を先に直す。
Issue #528 の返信元 preview と #737 の timestamp/copy 外出しを前提に、両方が同居しても崩れない土台にする。

## 設計

`chat-scroll` の子要素を message entry として扱い、entry 自体は中央の読み幅カラムへ揃える。
entry 内で owner は右、Butler / system は左へ寄せる。
bubble 側の desktop margin 補正はやめ、親 entry の幅と `justify-items` に責務を集約する。

## 仮説

現在の表示崩れは、`.chat-scroll` の desktop 中央寄せ、`.message-entry` の可変幅、`.bubble.owner` の個別 margin が混ざり、iPad landscape などで owner bubble の基準が不安定になることが原因。
また `.message-body` の `overflow: hidden` は長文末尾の clipping 誤認を生みやすいので、横方向の containment は保ちつつ本文自体は隠さない方が安全。

## 検証計画

- Unit: `test/worker.test.js` で message entry の幅責務、owner/right、Butler/left、desktop margin 削除を HTML/CSS smoke として確認する。
- VRT: Playwright で iPhone portrait、iPad portrait、iPad landscape 相当を開き、owner bubble が右、Butler bubble が左、各 bubble が viewport からはみ出さないことを bounding box で確認する。
- Evidence: VRT screenshot と state JSON を `docs/mvp/e2e/assets/issue-744/local/` に保存する。
- Generated: `npm run build:worker`、`npm run check:generated-worker`、`git diff --check`。

## 改修見積もり

- `src/worker/runtime.js`: Dashboard ChatRoom CSS の `.chat-scroll` / `.message-entry` / `.message-body` / desktop media query を修正する。risk は既存 #739 reply preview と #737 metadata のレイアウト退行。
- `worker.js`: generated worker を再生成する。
- `test/worker.test.js`: CSS smoke test を更新する。
- `scripts/e2e-issue744-dashboard-chat-layout.spec.mjs`: VRT と bounding box assertion を追加する。
- `docs/mvp/e2e/assets/issue-744/local/*`: VRT 証跡を追加する。

## 既に通っている経路

Dashboard route は `renderV2DashboardPage()` で HTML/CSS/inline JS を生成している。
Playwright screenshot 型の E2E は既に `scripts/e2e-dashboard-chat-contrast.spec.mjs` などで存在する。

## 未確認の境界

実機 iPad の Safari/PWA visual viewport で完全に同じになるかは、local Playwright だけでは証明しきれない。
この PR は local VRT と production 後 owner 観測を分けて報告する。

## 穴が出そうな箇所

desktop で中央の読み幅カラムに寄せると、owner bubble は画面右端ではなくカラム右端へ寄る。
これは ChatGPT/Codex 型の読み幅として妥当だが、owner が「画面右端」を期待する場合は別判断が必要。

## PR 前に確認すること

- Issue #744 の Success Criteria
- #739 merge 後の `src/worker/runtime.js`
- open PR がないこと
- VRT screenshot / state JSON の before/after で message がはみ出していないこと

## 実装候補と捨てた案

採用: message entry を固定読み幅カラム化し、entry 内で左右寄せする。
捨てた案: `.bubble.owner` に desktop margin を足し続ける。reply preview / timestamp / copy と責務が分散し、再発しやすい。

## merge 後に通す E2E

production Dashboard Butler PWA を iPad / iPhone で強制リロードし、owner 発言が見切れないこと、Butler 返信が読み幅カラム左に揃うこと、reply preview が本文を押し潰さないことを確認する。

## 次の PR を増やさない理由

この PR は layout foundation と VRT だけに閉じる。
進行ログ折りたたみ、sleep/resume 復帰、native wrapper、deploy watcher は別 Issue の土台作業であり、この PR に混ぜると検証が曖昧になる。

## 停止条件

VRT で bubble が viewport からはみ出す、owner/right と Butler/left が判定できない、または generated worker が source と一致しない場合は PR 作成前に停止する。
