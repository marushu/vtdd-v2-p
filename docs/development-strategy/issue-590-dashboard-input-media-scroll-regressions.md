# Issue #590 Dashboard input/media/scroll regressions

## 完了体験

Dashboard Butler PWA の通常 chat で、owner が iPad から repo/Issue 付きの自然文、URL encoded text、添付メディア、長いコードブロックを含む依頼を送っても、chat が壊れず同じ thread で続けられる。

owner-facing の期待は次の三点。

- `repository:%20marushu/vtdd-v2-p%0ArelatedIssue:%20590` のような URL encoded 入力を貼っても、`20marushu/vtdd-v2-p` や `decode/trim` を repo と誤認しない。
- repo-less main chat から添付を選び、本文で `marushu/vtdd-v2-p #590` を指定しても、upload 済み private media が送信時 validation で repository mismatch にならない。
- iPad/PWA で長い code block が表示されても、composer 付近で縦 scroll が止まらず、chat log と code block の scroll 境界が owner の指操作を奪わない。

## VTDD 全体で進める部分

Issue #590 は現在の Now/root blocker で、Dashboard Butler の長い turn / recovery UX が壊れると owner が mac Codex に戻る。今回の slice は timeout 本体ではなく、同じ通常 chat 経路の追加回帰をまとめて修正する。#498 の media analysis 完成や #637 の helper 実行には広げない。

## 設計

入力正規化は client と Worker の両方で行う。client 側は textarea の normalize と送信 payload の text を decode-safe にし、Worker 側は `sanitizeDashboardChatText()` / repository token extraction 前に同じ方針で正規化する。HTTP URL や approval token を壊さず、全文が URL encoded multi-line command らしい場合と、`repository:%20...` / `relatedIssue:%20590` のような labeled line だけを復元する。

media upload は保存時の repository scope と送信時の自然文 repo extraction がずれるのが危険。repo-less private media は送信本文で repository が解決されても使用可能にする。一方、別 repository に紐付いた media を別 repo へ流用する拒否は維持する。

scroll は chat 全体を `grid-template-rows: auto minmax(0, 1fr) auto` の中で動かしているため、iPad の nested scroll と fixed-like composer 周辺で touch chain が切れやすい。`chat-scroll` に `-webkit-overflow-scrolling: touch`、composer/pre/code 周辺に縦 pan を許可する touch-action、code block の最大高さと内部 scroll 境界を入れ、横 overflow を防ぎつつ縦 scroll を親へ渡せる形へ寄せる。

## 仮説

- `decodeSafeDashboardChatCommandText()` は `go:%..` だけを decode しているため、`repository:%20...%0A...` がそのまま送られる。Dashboard bridge / traffic control は `repository:` label の後ろから canonical token を拾えず、`%` が落ちた `20marushu/vtdd-v2-p` や本文中の `decode/trim` を repo と見なす。
- `uploadSelectedMedia()` は form dataset の `repositoryInput` だけを送る。repo-less main chat では media record が `repository: null` になり、その後 `buildDashboardChatTurn()` が本文から repo を解決すると `resolveDashboardChatMediaReferences()` の repository mismatch で送信が落ちる。
- `.bubble .message-body pre` は縦方向の最大高さを持たず、composer / `chat-scroll` は overscroll containment を持つ。iPad Safari/PWA で長い code block と composer reserve が重なると、touch move が内部要素で消費されて親 scroll が止まる。

## 検証計画

- `node --test test/worker.test.js --test-name-pattern "Dashboard"` で Dashboard 入力正規化、media validation、HTML/CSS regression を確認する。
- `npx playwright test scripts/e2e-issue590-dashboard-timeout-recovery.spec.mjs` に iPad viewport の URL encoded input / media upload / long code block scroll evidence を追加する。
- `npm run build:worker` と `npm run verify:worker` を通し、generated `worker.js` を同じ PR に含める。
- `git diff --check` を通す。

## 改修見積もり

- `src/worker/runtime.js`: Dashboard text normalization helper、repository / issue extraction、media reference validation、Dashboard CSS と client script。risk は URL / approval link の破壊、repo mismatch guard の緩和しすぎ、mobile layout regression。
- `test/worker.test.js`: URL encoded command と repo-less private media の unit coverage。risk は Durable Object / in-memory store fixture の前提差。
- `scripts/e2e-issue590-dashboard-timeout-recovery.spec.mjs`: mobile/iPad scroll と upload regression evidence。risk は Playwright browser timing と file chooser support。
- `docs/mvp/e2e/assets/issue-590/local/*`: E2E state/screenshot evidence 更新。risk は evidence churn。
- `worker.js`: generated worker bundle。risk は build output 差分が大きいこと。

## 既に通っている経路

PR #731 以降、低情報 progress は durable chat history に残りにくくなっている。PR #808 で gentle auto-scroll は撤回済み。PR #809 で handoff / pending bridge / `続き生成中` bubble は抑制された。Dashboard media storage には private unscoped media の概念があり、repo-less main chat 方針も #613 で入っている。

## 未確認の境界

production の media upload 失敗が upload route の 413/422/Cloudflare limit か、送信時 validation mismatch かはまだ runtime store で未確認。今回の実装は owner が報告した症状と現コードから再現できる mismatch を潰すが、Cloudflare 側の file size / R2 / D1 incident は別 evidence が必要。

## 穴が出そうな箇所

- URL encoded text を広く decode しすぎると、普通の URL query や `%2F` を含む link 表示を壊す。
- private unscoped media を許可しすぎると、repo-scoped media の隔離が弱くなる。
- code block に内部 scroll を入れると、親 chat scroll と競合する。最大高さを設けつつ `touch-action: pan-y` と `overscroll-behavior` を調整する。

## PR 前に確認すること

- PR #809 が merge 済みで、新しい branch が latest main から始まっていること。
- open PR が無いか、今回の PR が #590 Now slice として単独で説明できること。
- PR body に Execution Queue Delta と E2E evidence path を入れること。

## 実装候補と捨てた案

採用案: Dashboard command text と labeled repo/Issue lines だけを safe decode し、server/client 両方で同じ正規化を使う。private unscoped media は repo 指定本文に添付できるよう validation を限定緩和する。scroll は CSS と E2E で iPad long code block の親 scroll を確認する。

捨てた案: owner に URL decode 済み文面だけを貼らせる。実際に Butler が壊れているため product 修正にならない。捨てた案: media upload 時点で本文 repo を推定する。upload は送信前に行われるため textarea 編集中の repo を固定すると別の mismatch を生む。捨てた案: code block を全部折りたたむ。情報確認の UX を下げ、Issue #590 の readable progress と衝突する。

## merge 後に通す E2E

deploy 後、production Dashboard Butler PWA で次を確認する。

- URL encoded multi-line command を貼っても repo が `marushu/vtdd-v2-p` / Issue #590 になる。
- media 添付付きで同じ thread に送信でき、attachment metadata が materialized される。
- iPad/PWA で長い code block の表示中に composer 付近から上下 scroll できる。

## 次の PR を増やさない理由

三点は別々の見た目だが、通常 chat 入力の「送る前/送る時/送った後」の同じ owner-facing breakage であり、Issue #590 の same-thread recovery を一つの E2E で証明できる。#498 media analysis や #637 helper 実行まで広げなければ、1 PR の検証境界を保てる。

## 停止条件

- URL decode が secrets / approval grants / arbitrary URL を変形する可能性が見えたら停止する。
- media validation 緩和が repo-scoped media の cross-repo 流用を許す場合は停止する。
- iPad scroll lock が CSS ではなく service worker / browser viewport / PWA manifest 側の問題だと判明したら、今回の runtime patch を広げず別 Issue 候補にする。
