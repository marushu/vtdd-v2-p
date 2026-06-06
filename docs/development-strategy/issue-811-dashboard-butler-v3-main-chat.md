# Issue #811 Dashboard Butler V3 メインチャット体験 作戦図

## 完了体験

owner が iPhone / iPad / voice から Dashboard Butler のメインチャットを開き、Mac を開かずに相談、仕様整理、実装依頼、進捗確認、差し込み、停止、編集再投稿、画像添付、通知確認、パスキー承認、復旧、次アクション確認まで進められる。

完成判定は PR merge ではない。iPhone / iPad の light / dark で、owner-facing main chat experience が通り、通知タップ、ドロワー、入力欄、差し込み queue、パスキー modal、break-glass recovery、進捗表示が一体で使えることを E2E evidence として残す。

この Issue は、Dashboard Butler の根本問題を「小さな UI 不具合の連続」ではなく「メインチャット体験が一体として完成していないこと」として扱う。実装 PR は原則 1 本にする。

## VTDD 全体で進める部分

Issue #811 は Issue #528 / #590 / #613 を横断する owner-facing root Issue として扱う。

- Issue #528: ChatGPT iOS 相当の通常チャット面と、debug / ops の隔離。
- Issue #590: silent wait / live progress / stalled recovery / final reply 完全性の owner-facing observability。
- Issue #613: repo-less main chat / voice-ready / single main chat の product direction。
- Issue #637: recovery / privileged maintenance 導線を通常チャットから自然に扱う前提。
- Issue #498 / #587: screenshot / media feedback loop。

この Issue は既存 active Issues を閉じる shortcut ではない。PR body では、Issue #811 がどの owner-facing completion を満たし、既存 Issue にどの evidence を返すかを明記する。

## 設計

設計正本は `docs/product-design/dashboard-butler-v3-current-aligned/index.html` とする。独自にゴテゴテした新デザインを発明しない。

主役はメインチャット。通常画面は ChatGPT / Codex に近い静かな会話面にし、VTDD 固有の承認、進捗、復旧、通知、truth は必要時だけ自然に乗せる。

主要 UI は以下を一体で扱う。

- Floating header: iPhone / iPadOS PWA のキーボード補助 UI に隠れない半透明 blur header。
- Composer: 1 行 Enter 投稿、複数行 command + Enter 投稿、投稿後 stop button、編集再投稿、画像添付、長文入力。
- Interruption / queue: 実行中の差し込み、送信前キャンセル、未取り込み取消、取り込み済み補足、複数 queue、反映先表示。
- Progress: 生思考ではなく、作業実況、判断要約、evidence、next action、詰まり理由、owner 判断事項。
- Drawer: iPhone は floating overlay。チャット幅を狭めない。開いていても VPS Codex CLI / bridge / WebSocket / reply stream は止めない。
- iPad / desktop nav: 常時サイド表示可。ただし chat reading width を実用範囲に保つ。
- PWA notification: 通知タップは通知センター直行。PR / Actions / VPS / passkey / deploy details は通知センター card 内リンク。
- Passkey approval: chat 上 modal。別ページ遷移を owner-facing primary path にしない。
- Break-glass recovery: bridge / VPS runner / queue / stale client の固定復旧導線。任意コマンド UI にはしない。
- Voice-ready state: 発話 transcript、返答 transcript、読み上げ状態、Bluetooth / AirPods / iPhone mic 前提の状態表示。

## 仮説

現在の不満の root cause は、Dashboard Butler が複数の狭い PR で「局所的には通る」状態を積み重ねた結果、owner-facing main chat experience が一貫した product surface として設計されていないこと。

修正対象はおそらく以下に集中する。

- `src/worker/runtime.js`: Dashboard HTML / CSS / client JS / service worker / notification payload / passkey return / recovery UI。
- `scripts/run-dashboard-app-server-bridge.mjs`: progress / bridge lifecycle / owner-facing event semantics の表示契約確認。
- `test/worker.test.js`: Worker-rendered Dashboard shell、notification payload、service worker、passkey modal、recovery state。
- `scripts/e2e-issue744-dashboard-chat-layout.spec.mjs` と新規 E2E: iPhone / iPad layout、drawer overlay、composer、queue、notification center direct open。
- `docs/product-design/dashboard-butler-v3-current-aligned/index.html`: 実装の視覚基準。必要ならモックを追従させる。
- `docs/mvp/e2e/assets/issue-811/local/`: local evidence。

狭く修正すると壊れる理由:

- composer だけ直すと、進捗 / queue / stop / passkey modal と衝突する。
- drawer だけ直すと、iPhone keyboard / notification center / stream継続の体験が残る。
- progress だけ直すと、最終返信や途中切れ、silent wait と同じ #590 沼に戻る。
- passkey だけ modal 化すると、復旧・通知・return path との接続が不足する。
- notification tap だけ直すと、通知センター card の action 導線が不十分なままになる。

## 検証計画

Unit:

- Dashboard shell の header / drawer / composer / passkey / recovery state rendering。
- Web Push payload が Dashboard 通知を notification center へ向けること。
- Service Worker notificationclick が same-origin notification center へ navigate / open すること。
- Composer state が queued / inserted / cancelable / stop / edit-resubmit を区別すること。
- 技術ログ、service 名、raw ID が通常チャット本文へ漏れないこと。

Integration:

- `npm run build:worker` が generated `worker.js` を更新すること。
- `npm run verify:worker` または scoped worker tests が通ること。
- app-server bridge progress event が owner-facing state へ変換され、durable chat spam にならないこと。
- passkey approval modal と return path が Dashboard chat / notification center に戻ること。
- media attachment path が repo-less main chat で壊れないこと。

E2E:

- iPhone light: 通常送信、画像添付、実行中 stop、差し込み queue、drawer overlay、最新へ飛ぶボタン。
- iPhone dark: keyboard 表示時の floating header、composer、queue menu、passkey modal、recovery mode。
- iPad light / dark: side nav、wide chat、notification center、progress card、passkey modal。
- PWA notification tap: existing client focus / navigate と cold open の両方で notification center 直行。
- sleep / resume: PWA を戻した時、返信 stream / persisted progress の続きがどこからか分かる。

## 改修見積もり

- `src/worker/runtime.js`: 高リスク。Dashboard UI、service worker、notification、passkey、recovery が同居している。変更は一体 PR 内で行い、都度 generated worker と tests を同期する。
- `worker.js`: generated file。runtime source 変更後に必ず `npm run build:worker` で更新する。
- `test/worker.test.js`: 中リスク。既存 assertions が PR URL 直行など旧 UX を期待している可能性がある。仕様に合わせて更新する。
- `scripts/e2e-issue811-dashboard-butler-v3-main-chat.spec.mjs`: 新規または既存 #744 E2E 拡張。iPhone / iPad / light / dark を owner-facing completion evidence として固定する。
- `docs/product-design/dashboard-butler-v3-current-aligned/index.html`: 低リスク。実装とズレた場合のみ追従。モックを実装の都合で劣化させない。
- `docs/mvp/e2e/assets/issue-811/local/`: evidence 保存先。スクリーンショットや操作ログを残す。

## 既に通っている経路

- Dashboard chat shell は存在する。
- mobile drawer / utility nav は存在する。
- notification center route は存在する。
- Service Worker push / notificationclick は存在する。
- PWA notification payload builder は存在する。
- passkey operator page と notification center return path は存在する。
- Dashboard media attachment の基礎は存在する。
- app-server bridge / WebSocket live path は存在する。
- Product Design mock は `docs/product-design/dashboard-butler-v3-current-aligned/index.html` にある。

## 未確認の境界

- iOS PWA の notificationclick が既存 client を navigate した時、実機で確実に notification center へ行くか。
- voice mode の初期範囲は browser SpeechRecognition / webkitSpeechRecognition を使った発話 transcript capture とし、読み上げ制御や車載 Bluetooth 実機制御は production voice E2E の後続確認に残す。
- break-glass recovery の初期固定手順を bridge restart までにするか、main checkout / queue health check まで含めるか。
- passkey modal を同一 DOM route 内で完結できるか、WebAuthn 制約上 page-level fallback を残す必要があるか。
- iPad PWA keyboard accessory と floating header の実機重なり。

## 穴が出そうな箇所

- 長文 reply と progress card が同時に出ると scroll が奪われる。
- drawer overlay 中に reply が到着した時、未読 / continuation indication がないと owner が迷う。
- notification center 直行に寄せると、PR 直行テストや GitHub link expectation が壊れる。
- passkey modal が失敗した時、owner が戻れない / 二重承認になる。
- recovery UI が便利すぎて危険操作や任意コマンドに広がる。
- voice transcript capture を完全な音声運用 completion と誤認して scope が膨らむ。
- 小さな見た目修正を PR 外 follow-up に逃がす誘惑が出る。

## PR 前に確認すること

- Issue #811 が open であること。
- open PR がないこと、または競合 PR がないこと。
- latest `origin/main` から新規 topic branch を作ること。
- Issue #811 の Success Criteria と Product Design mock を再読すること。
- `docs/mvp/active-issue-execution-queue.md` に #811 の queue delta を反映するか、PR body で反映理由を明記すること。
- `.vtdd/` や unrelated e2e assets を巻き込まないこと。
- implementation PR を draft にしないこと。

## 実装候補と捨てた案

採用:

- Issue #811 の実装 PR は 1 本にする。
- PR 内では内部 commit / checklist / staged validation を分ける。
- owner への前進報告は、体験全体の completion gate が進んだ時だけにする。
- Product Design mock を正本として、既存 Dashboard の見た目に沿って実装する。

捨てた案:

- composer / drawer / notification / passkey / recovery を別々の小 PR に分ける。これまでの failure mode を再生するため不採用。
- 新規の派手な dashboard design を作る。owner が現在のシンプルな見た目を希望しているため不採用。
- 通知タップを GitHub PR へ直行させる。owner が PWA notification center 直行を求めているため不採用。
- recovery を任意コマンド executor にする。authority boundary と安全性に反するため不採用。
- voice mode を後回しの飾りにする。VTDD / Butler の目的と矛盾するため不採用。今回 PR では、まず発話がチャット入力欄に残る transcript 入口を実装し、読み上げ・車載 Bluetooth の実機保証は production voice E2E の確認事項に残す。

## merge 後に通す E2E

- Production PWA iPhone light / dark: メインチャット通常操作、差し込み、drawer overlay、notification center direct open、passkey modal、recovery entry。
- Production PWA iPad light / dark: side nav、wide chat、notification center、progress visibility、composer focus。
- Production PWA voice smoke: iPhone / iPad で発話 transcript がチャット入力に残り、実行中は差し込み draft へ回ること。
- VPS Codex CLI / app-server bridge: 長い turn の progress、silent wait がないこと、final reply が読めること。
- PWA notification: deploy / PR / owner-action / VPS runner notification から notification center へ直行し、該当 card の detail link が使えること。

## 次の PR を増やさない理由

この Issue の root cause は、Dashboard Butler を小さな局所修正に刻みすぎたことで、owner-facing experience がいつまでも完成しなかったこと。したがって、PR を増やすこと自体が drift risk になる。

実装 PR は 1 本にする。PR 内で分割するのは commit、validation checkpoint、evidence section だけ。follow-up PR を作れる例外は以下に限定する。

- 本番停止またはセキュリティ事故。
- 外部プラットフォーム制約により同一 PR では検証不能なもの。
- owner が明示的に scope 分離を承認したもの。
- Issue #811 の completion gate と無関係な既存 regression が発見され、切り離さないと本体 PR が危険になるもの。

例外に該当しない不満や改善案は、PR を増やさず Issue #811 PR 内の completion checklist に戻す。

## 停止条件

- Issue #811 の Success Criteria から外れた UI / runtime scope を追加しようとしている。
- Product Design mock と owner 仕様に反する独自解釈が必要になった。
- notification / passkey / recovery が credential mutation、deploy、destructive host maintenance を必要とする。
- iPhone / iPad E2E を用意できない。
- PR を分割しないと進められないように見えるが、その理由が例外条件に該当しない。
- service 名、raw ID、capability 名を通常チャット本文へ出さないと説明できない。
- voice transcript capture と読み上げ / 車載 Bluetooth 実機保証を混同し始めた。
- open PR / merged PR / latest main の truth が不明なまま作業を進めようとしている。

## 2026-06-06 production live gap: mobile composer / voice transcript

PR #812 merge / deploy / app-server bridge restart 後の owner 実機確認で、以下の completion gap が見つかった。

- iPhone 幅で composer の CSS が 3 列指定になっており、実 DOM の `+ / textarea / voice / send` の 4 要素が折り返して stop / send button が左下へ落ちた。
- 右端の voice button が丸表示で、ChatGPT iOS の voice mode 入口と意味が合っていなかった。
- text send / stop button は ChatGPT iOS app に倣い、入力欄の右側に置く必要がある。
- voice button は「声を文字にする」だけでなく、文字化した内容を Butler チャットへ送る必要がある。
- 発話停止から約 1 秒の無音を会話区切りとして扱い、final transcript をチャットへ送る必要がある。
- 無音区切りは voice mode 終了ではない。各発話を送信し、VPS Codex CLI の返事後も voice mode 会話を続ける。voice mode 自体の終了は合言葉 `ボイスモード終了` のみで扱う。
- PWA では voice mode 開始前から常時マイク待機できないため、開始は voice button で行う。テキストコマンド `ボイスモード開始` は採用しない。voice mode 自体の終了だけを合言葉 `ボイスモード終了` で扱う。

修正方針:

- composer は grid ではなく flex で折り返しを禁止する。
- ChatGPT iOS に寄せ、左側に attachment、入力欄の右側に voice waveform / text send / stop button を置く。空欄時は voice、文字入力時は send、実行中は stop を表示する。
- voice は Web search ではなく voice transcript input として扱う。
- Web Speech API の final transcript を受けたら 1 秒待ち、入力欄へ残したうえで submit する。実行中の場合は既存 submit path により差し込み queue として扱う。
- Web Speech API が無音区切りで recognition end した場合でも、voice mode が active なら recognizer を再開し、次の発話を待つ。
- `ボイスモード終了` を認識した場合だけ voice mode を終了し、その合言葉自体は VPS Codex CLI へ送らない。
- voice mode 開始は button の user activation に寄せる。`ボイスモード開始` テキストコマンドは会話入力との混線を避けるため採用しない。
- Web Speech API 未対応、権限拒否、開始失敗でも Butler PWA を固めず、テキスト入力へ戻す。

追加検証:

- `node --test test/worker.test.js`
- `npx playwright test scripts/e2e-issue811-dashboard-butler-v3-main-chat.spec.mjs --browser=chromium --reporter=line`
- merge / deploy 後に production iPhone PWA で voice button から声→文字→チャット送信を実機確認する。

## 2026-06-07 production live gap: voice button beside stop/send

Owner production evidence showed that, while a turn is running, the composer
shows only the stop button on the right edge and hides the voice mode button.
This is wrong for the target voice-ready main chat: owner should be able to keep
voice mode available beside the send/stop control, especially while the current
turn is running and follow-up input may be spoken.

修正方針:

- Composer right-side controls should be a stable inline group.
- Voice mode button stays visible next to the send/stop button while a turn is
  running.
- Voice mode button may still hide when normal text is ready to send, because
  that state needs a clear send affordance and prevents accidental voice start.
- Stop button remains the rightmost primary control during an active turn.
- This slice must not change SpeechRecognition, readback, passkey, deploy, or
  follow-up queue semantics.

追加検証:

- `node --test test/worker.test.js`
- `npx playwright test scripts/e2e-issue811-dashboard-butler-v3-main-chat.spec.mjs`
- `npm run check:generated-worker`
