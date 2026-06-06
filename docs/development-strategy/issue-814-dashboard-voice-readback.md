# Issue #814 Dashboard Butler voice mode readback

## 完了体験

owner が Dashboard Butler PWA の voice mode を開始し、声で依頼する。発話は既存の SpeechRecognition / webkitSpeechRecognition 経路で文字になり、Butler chat の owner message として同じ Dashboard thread から VPS Codex CLI / codex app-server turn に送られる。VPS 側の最終 Butler reply が thread に戻った時だけ、Dashboard client が Web Speech API で返信を読み上げる。voice mode 中は screen Wake Lock が使える環境では保持し、使えない環境でも voice workflow と通常テキスト表示は壊さない。

## VTDD 全体で進める部分

Issue #811 の voice-ready main chat を、transcript 入口から「会話として使える」状態へ進める。これは Issue #613 の voice-ready single main chat、Issue #590 の final reply / progress 境界、Issue #528 の ChatGPT iOS 相当通常チャット面に関係する。小 PR に分けると workflow が再び分断されるため、Issue #814 は読み上げ / Wake Lock / final reply trigger / cleanup / E2E を 1 PR に入れる。

## 設計

- voice mode の状態は既存 `voiceModeActive` を中心にし、読み上げと Wake Lock も voice mode に束ねる。
- SpeechRecognition の結果は既存通り owner message に送る。
- speechSynthesis は `voiceModeActive === true` の時だけ使う。
- 読み上げ対象は final Butler reply に限定する。`transient_status`、progress checkpoint、bridge lifecycle、reply delta、thinking、command status は読まない。
- final reply の描画処理に hook を置き、role/status/type を確認して owner-facing reply だけ読み上げる。
- 新しい final reply が来たら `speechSynthesis.cancel()` で前回読み上げを止めて最新を読む。
- voice mode 終了時は SpeechRecognition、voice timers、speechSynthesis、Wake Lock を止める。
- Wake Lock は `navigator.wakeLock.request("screen")` が存在する場合のみ取得する。解除イベントで voice mode が続いていれば再取得を試す。
- Wake Lock 未対応や失敗は短い status に留め、通常チャットを壊さない。

## 仮説

既存実装は voice transcript capture と auto submit まで入っているが、VPS reply が返った後の読み上げと sleep 抑止がない。Dashboard client script は同じ HTML 内で WebSocket message を処理し、message render と voice state を同じ closure に持っているため、`src/worker/runtime.js` の client script に最小追加すれば workflow を一体化できる。E2E には fake SpeechRecognition が既にあるので、fake speechSynthesis / fake wakeLock を足すと regression を固定できる。

狭く patch するだけで壊れる箇所は、final reply と progress の分類である。reply delta や progress checkpoint を読み上げると、途中文・技術ログ・低情報 status が音声化され、Issue #590 の問題を再発させる。

## 検証計画

- E2E: fake SpeechRecognition で発話を送信し、fake WebSocket の final Butler reply event を流し、fake speechSynthesis が final text だけを受け取ることを確認する。
- E2E: transient status / progress event では speechSynthesis が発火しないことを確認する。
- E2E: voice mode start で fake wakeLock request が呼ばれ、voice mode 終了で wake lock release と speech cancel が呼ばれることを確認する。
- Unit / integration: worker generated runtime checks and Dashboard HTML string assertions.
- Worker bundle: `npm run verify:worker`。
- Static: `git diff --check`。

## 改修見積もり

- `docs/development-strategy/issue-814-dashboard-voice-readback.md`: Issue #814 の作戦図。risk は scope drift。Issue本文と一致させる。
- `src/worker/runtime.js`: Dashboard client script に speech synthesis / wake lock / final reply hook を追加。risk は progress event 誤読上げ、iOS 未対応時の例外、voice mode cleanup 漏れ。
- `scripts/e2e-issue811-dashboard-butler-v3-main-chat.spec.mjs` または新規 `scripts/e2e-issue814-dashboard-voice-readback.spec.mjs`: fake APIs と mapped E2E。risk は既存 #811 E2E の過密化。
- `test/worker.test.js`: HTML source assertion。risk は brittle string assertion。
- `worker.js`: worker bundled source。risk は generated mismatch。

## 既に通っている経路

- `#butler-voice-button` は存在する。
- SpeechRecognition / webkitSpeechRecognition fake を使う #811 E2E が存在する。
- voice transcript は owner message として fake WebSocket に送られる。
- `ボイスモード終了` は VPS 側へ送らず voice mode 終了として扱われる。

## 未確認の境界

- iOS PWA の Wake Lock 対応は環境差がある。未対応でも workflow は継続し、production evidence で差分を残す。
- ChatGPT iOS の native background audio / audio session は公開されていない。VTDD は PWA の Web Speech API / Wake Lock の範囲で実装する。
- production Bluetooth / AirPods / 車載 audio は local E2E では保証できない。

## 穴が出そうな箇所

- `app_server_reply_delta` を読んでしまう。
- lifecycle status を読んでしまう。
- voice mode 終了時に speechSynthesis が残る。
- wake lock release 後に再取得ループが暴れる。
- speechSynthesis が未対応の browser で例外が出る。
- long reply の読み上げが長すぎる。今回は final reply 全文を基本にし、将来 spoken summary が必要なら Issue 化する。

## PR 前に確認すること

- Issue #814 が作成済みであること。
- Issue #811 の voice transcript 実装を壊していないこと。
- E2E が final reply だけを読み上げ、progress を読まないこと。
- Wake Lock 未対応時の message が owner-facing で短いこと。
- PR body に Execution Queue Delta と Issue #814 criteria mapping が入ること。

## 実装候補と捨てた案

- 採用: Dashboard client script 内で voice mode state に speechSynthesis / Wake Lock を束ねる。
- 採用: final Butler reply render 時だけ読み上げ hook を呼ぶ。
- 不採用: app-server delta を逐次読み上げる。途中切れと低情報音声を生む。
- 不採用: voice mode と Wake Lock を別 PR に分ける。owner-facing workflow が分断される。
- 不採用: native ChatGPT iOS 相当 background conversation 完了を主張する。PWA の範囲を超える。

## merge 後に通す E2E

- production iPhone PWA: voice mode 開始、発話、VPS返信、読み上げ、終了、sleep抑止表示を確認。
- production iPad PWA: 同じ workflow がサイドメニュー表示中も壊れないことを確認。
- production evidence では Wake Lock 対応 / 非対応を明記する。

## 次の PR を増やさない理由

今回の owner instruction は「小スライス不要。読み上げ機能として一つのPRでやるべき」。voice mode は transcript、VPS handoff、reply event、TTS、sleep抑止が一体で成立して初めて使える。分けると Issue #590 と同じように局所修正の連鎖になる。

## 停止条件

- final reply と progress / lifecycle の分類が判定できない。
- Wake Lock / speechSynthesis の feature detection で通常チャットが壊れる。
- Issue #811 の既存 E2E が voice transcript 送信で壊れる。
- deploy、credential、permission、destructive VPS maintenance が必要になる。
