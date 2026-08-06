# Issue #835 Custom GPT voice handoff strategy

## 目的

Custom GPT の音声会話を会話入口として使い、Dashboard は URL handoff 後の読み上げ、音声指示待ち、保存、開発 GO 待ちに集中させる。

この slice は ChatGPT 相当の会話 UI を Dashboard で再発明しない。普通の会話は Custom GPT 側に残し、保存または開発候補だけを Dashboard に渡す。

## 実装方針

- Custom GPT Instructions に、音声会話では Actions を前提にしない handoff 運用を明記する。
- setup latest / recovery bundle に handoff URL base、例 URL、貼り付け用 guidance を出す。
- Worker に `/dashboard/handoff` を追加し、query / fragment / base64url JSON から短い handoff payload を復元する。
- Dashboard handoff ページは `speechSynthesis` で内容を読み上げ、`SpeechRecognition` / `webkitSpeechRecognition` で「保存」「開発 GO」「キャンセル」を待つ。
- POST `/v2/dashboard/handoff` は Dashboard chat store に保存するが、Codex app-server bridge / VPS Codex CLI を起動しない。
- 「開発 GO」は development waiting record として保存し、deploy / merge / credential mutation / root-sudo は明示 GO / passkey 境界に残す。

## 境界

- URL payload に秘密情報、API key、DB credential、全文 transcript を載せない。
- 保存は低リスクな Dashboard thread record まで。Memory Core の本番 RAG quality 改善は別 Issue。
- 開発 GO は実行ではなく待ち状態。VPS Codex CLI / bridge wake はこの PR では起動しない。
- 車載 Bluetooth の実機保証は local/mock E2E だけでは完了扱いにしない。
- deploy / merge / Issue close はこの PR では行わない。

## 仮説

Custom GPT 音声会話を主会話に残し、Dashboard を handoff receiver に限定すれば、会話本体の OpenAI API コストと Dashboard 側の車輪の再発明を避けつつ、外部記憶への保存導線を作れる。

## 検証計画

- `test/custom-gpt-setup-docs.test.js`: full / short / short-min instructions に voice handoff 境界が残る。
- `test/custom-gpt-setup-artifacts.test.js`: recovery bundle に handoff URL base / example / guidance が出る。
- `test/worker.test.js`: handoff page、保存、開発 GO 待ち、bridge 非起動、secret redaction を確認する。
- `npm run build:worker`: generated worker に runtime 変更が反映される。
- `npm run check:self-parity` / `npm run check:generated-worker`: setup/runtime parity を確認する。

## 未確認

- iPhone Safari / PWA 実機で URL tap 後の `speechSynthesis` が Bluetooth に乗るか。
- Custom GPT mobile voice mode が URL を常に安全にタップ可能な形で表示するか。
- 本番 Dashboard auth 状態で `/v2/dashboard/handoff` POST が owner 操作として通るか。

## Execution Queue Delta

- Queue position before: durable queue は Issue #741 を Now としているが、owner の明示指示で Issue #835 を今回の Now slice として実装する。
- Preemption decision: NEXT
- Queue delta: Issue #835 を Custom GPT voice handoff の独立 slice として進める。Issue #741 / #816 / #814 / #811 は downscope しない。
- Why this PR is next: owner が「今回の目玉」として、会話入口を Custom GPT に戻し Dashboard を handoff receiver にする方向を指定したため。
- Active Issues not downscoped: active Issues were not shrunk, deferred out of scope, or treated as complete by omission.
