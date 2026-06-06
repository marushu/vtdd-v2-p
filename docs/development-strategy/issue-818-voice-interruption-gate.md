# Issue #818 voice reply readback / interruption gate 作戦図

## 完了体験

owner が Dashboard Butler のボイスモードで発話して VPS Codex CLI / codex app-server bridge に送った turn は、iPhone / PWA の sleep、reload、WebSocket reconnect で一時的に `voiceModeActive` が false になっても、戻ってきた Butler final reply を一度だけ読み上げる。読み上げ中に owner が話しかけた場合は読み上げを止め、聞き取り候補へ切り替える。ただし周囲の人の短い声や断片は差し込み queue に送らず、gate を通った owner 発話だけを follow-up queue に入れる。

## VTDD 全体で進める部分

Issue #818 は Issue #814 voice readback の実験的 follow-up であり、Issue #811 の voice-ready main chat と Issue #816 の差し込み queue に接続する。#816 は未 merge のため、この PR は #816 branch 上に stacked される。#818 だけで #811 / #814 / #816 completion とは扱わない。

## 設計

Dashboard client script に `pendingVoiceReplyClientMessageIds` と `voiceExplicitlyStopped` を追加する。voice transcript から送信した owner message の clientMessageId を pending reply として記録し、Butler final reply が返った時に pending voice reply がある場合は `voiceModeActive=false` でも読み上げる。読み上げ済み key は既存 `spokenButlerReplyKeys` で重複抑止する。

読み上げ中は `voiceSpeaking=true` にし、SpeechRecognition の final transcript が来た時は `handleVoiceTranscript()` で判定する。読み上げ中の transcript はまず interrupt candidate とし、短すぎるものは破棄、gate を通ったものは speechSynthesis を cancel して follow-up queue に入れる。通常 listen 中の voice transcript は従来通り送信するが、voice input 由来として pending reply を記録する。

## 仮説

現状の読み上げ漏れは `speakFinalButlerReply()` が `voiceModeActive` を hard required condition にしていることが原因。iOS PWA の sleep / reconnect / reload で UI active state が落ちると、音声入力由来の返事でも読み上げられない。逆に、返事受信で `voiceModeActive=true` に戻すと、明示終了後や通常テキスト turn の privacy regression が起きる。したがって input origin と pending reply を分離する必要がある。

## 検証計画

- Unit: `test/worker.test.js` で `pendingVoiceReplyClientMessageIds`、`voiceExplicitlyStopped`、`voiceSpeaking`、`shouldSpeakFinalButlerReply`、`handleVoiceInterruptCandidate` が generated Dashboard HTML に含まれることを確認する。
- E2E: `scripts/e2e-issue811-dashboard-butler-v3-main-chat.spec.mjs` で voice input 送信後に UI を voice inactive 相当にしても final reply を読むこと、duplicate reply は読まないこと、読み上げ中の短い周囲音は送信されず、十分な interrupt は cancel + follow-up queue に入ることを確認する。
- Generated worker: `npm run build:worker` と `npm run check:generated-worker`。
- Regression: transient status / progress は読み上げない既存 assertion を維持する。

## 改修見積もり

- `src/worker/runtime.js`: Dashboard client script の voice state、voice transcript handler、speak condition、interrupt gate を変更する。リスクは inline script の巨大さと、通常 text submit / #816 follow-up queue の挙動を壊すこと。
- `worker.js`: `npm run build:worker` による生成同期。リスクは未生成差分。
- `test/worker.test.js`: source assertion を追加する。リスクは文字列テストが brittle なこと。
- `scripts/e2e-issue811-dashboard-butler-v3-main-chat.spec.mjs`: fake SpeechRecognition と fake speechSynthesis を使う #811 E2E に #818 scenario を足す。リスクは既存 #814 assertions と state が干渉すること。
- `docs/mvp/e2e/assets/issue-811/local/`: E2E state / screenshot 更新。リスクは evidence churn。

## 既に通っている経路

Issue #814 で SpeechRecognition transcript、final Butler reply 読み上げ、Wake Lock、終了合言葉、speechSynthesis cancel / release は入っている。Issue #816 branch で follow-up queue item は mediaReferences を保持できるようになっている。

## 未確認の境界

Web Speech API の confidence / duration は iOS Safari / PWA で揺れる。local E2E では confidence を fake できるが、production iPhone では文字数と session state を主 gate として観測する必要がある。ChatGPT iOS の内部 audio session は公開されていないため、観察可能な体験だけを比較する。

## 穴が出そうな箇所

Butler final reply に owner clientMessageId が含まれない場合、pending queue と final reply の厳密対応はできない。今回の実験では pending voice reply が残っている間の次の Butler final reply を対象にするが、明示終了後は suppress する。複数 voice turn の並列は通常 UI で避け、重複読み上げは message key で止める。

## PR 前に確認すること

`voiceModeActive=false` でも音声入力由来 reply だけが読まれること。`ボイスモード終了` 後は読まれないこと。読み上げ中 interrupt candidate が短い周囲音なら送られず、長い発話なら cancel + queue されること。通常テキスト turn や transient status が読まれないこと。

## 実装候補と捨てた案

採用: voice input 由来の pending reply tracking を持ち、final reply 受信時に `voiceModeActive || pendingVoiceReply` で読む。

捨てた案: final reply 受信時に `voiceModeActive=true` に戻す。明示終了後や通常 text turn の privacy regression があるため捨てる。

捨てた案: 読み上げ中 transcript を即 VPS Codex CLI に送る。周囲音混入を再発させるため捨てる。

## merge 後に通す E2E

production iPhone PWA で、voice input 由来の turn を送り、返信待ち中に sleep / reconnect があっても Butler final reply が一度だけ読み上げられること、読み上げ中に owner が話すと読み上げが止まり、短い周囲音は差し込み送信されないことを確認する。

## 次の PR を増やさない理由

読み上げ復帰と interrupt gate は同じ voice workflow の両端であり、片方だけを入れると「返事は読むが止められない」または「止められるが返事が読まれない」状態になる。#818 ではこの実験範囲を一つの PR にまとめる。

## 停止条件

final reply と voice owner turn の対応が runtime payload から全く判断できず、通常 text reply を読む危険が高い場合。#816 の follow-up queue と競合して添付保持を壊す場合。読み上げ中 recognition が iOS PWA で実行不能と判明し、UI 上の安全 gate だけでは周囲音混入を止められない場合。

## 2026-06-07 reviewer blocker response: reply target

Gemini reviewer が `reply_target_id` 不在を merge blocker として指摘したため、pending voice reply set と Butler final reply の対応を client-side timing だけで判断しない。`scripts/run-dashboard-app-server-bridge.mjs` は turn completion event に owner message id を `originalMessageId` として載せ、Worker の `normalizeDashboardAppServerBridgeEvent()` はこれを `replyToClientMessageId` として Dashboard thread message に保存する。Dashboard client は `pendingVoiceReplyClientMessageIds` と final Butler message の `replyToClientMessageId` が一致した場合だけ、voice inactive 復帰読み上げを許可する。

この対応で閉じる blocker:

- 別 turn の Butler final reply が先に届いた場合に、pending voice reply があるという理由だけで読み上げてしまう問題。
- app-server bridge から Dashboard thread へ戻る final reply に owner message id が残らず、E2E が target 対応を検証できない問題。
- duplicate reply は既存 `spokenButlerReplyKeys` で止め、pending voice reply は target 消費で一件ずつ減らす。

残る evidence gap:

- production iPhone / iPad PWA で実際に `replyToClientMessageId` が付いた final reply が戻ること。
- Web Speech API の confidence / 周囲音 gate は local fake だけでは十分でなく、実機 evidence が必要。
- PR #817 が未 merge のため、#819 は依然 stacked PR として merge order blocker を持つ。
