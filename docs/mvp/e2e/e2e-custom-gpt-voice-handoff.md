# Issue #835 Custom GPT voice handoff E2E evidence

## Scope

This evidence covers the local / worker-testable part of Issue #835:

- Custom GPT setup artifacts expose voice handoff guidance.
- `/dashboard/handoff` renders a mobile-oriented handoff receiver.
- The receiver has readback and speech-recognition controls.
- Save handoff persists to Dashboard chat store without starting Codex app-server bridge or VPS Codex CLI.
- Development GO handoff is saved as waiting for explicit execution approval.

## Commands

To refresh this evidence:

```bash
node --test test/custom-gpt-setup-docs.test.js test/custom-gpt-setup-artifacts.test.js --test-name-pattern "voice handoff|buildCustomGptRecoveryBundle|custom gpt instructions|short custom|short-min custom"
node --test test/worker.test.js --test-name-pattern "voice handoff|setup latest page"
npm run build:worker
npm run check:self-parity
npm run check:generated-worker
```

## Local result

2026-08-06 JST, branch `issue-835-custom-gpt-voice-handoff`:

- `node --test test/worker.test.js --test-name-pattern "voice handoff|setup latest page"`: pass, 297 tests passed.
- `node --test test/custom-gpt-setup-docs.test.js test/custom-gpt-setup-artifacts.test.js --test-name-pattern "buildCustomGptRecoveryBundle|custom gpt instructions|short custom|short-min custom"`: pass, 21 tests passed.
- `node --test test/thread-independent-startup-contract.test.js test/custom-gpt-setup-docs.test.js --test-name-pattern "thread-independent|short custom|short-min"`: pass, 13 tests passed.
- `npm run build:worker`: pass.
- `npm run check:self-parity`: pass, 35 routes / 35 operationIds checked.
- `npm run check:generated-worker`: pass.
- `npm test`: pass, 1256 tests passed, 1 skipped, then self-parity and generated-worker checks passed.

## Evidence mapping

- `worker renders Custom GPT voice handoff page with mobile voice controls`
  verifies the owner-facing receiver contains speech synthesis, SpeechRecognition / webkitSpeechRecognition, voice command buttons, `/v2/dashboard/handoff`, and the bridge-not-started boundary.
- `worker saves Custom GPT voice handoff without starting Codex bridge or leaking secrets`
  verifies save creates two Dashboard chat messages, redacts token-like values, and returns `codexBridgeStarted=false` / `vpsCodexStarted=false`.
- `worker keeps Custom GPT voice development GO waiting for explicit execution approval`
  verifies `開発 GO` maps to `development_go`, remains waiting, and does not start VPS Codex CLI.
- `worker setup latest page renders copy-ready schema and short-min bundle for VTDD repo`
  verifies setup wizard output includes handoff URL base and voice handoff guidance.
- `buildCustomGptRecoveryBundle expands Worker URL and reports short-min length`
  verifies recovery bundle includes `voiceHandoff`.

## Remaining live E2E gap

This is not full production completion evidence. Remaining checks:

- iPhone / mobile viewport handoff URL tap.
- Actual iOS readback to Bluetooth speaker.
- Authenticated production Dashboard POST from the handoff page.
- Custom GPT editor manually configured with generated instructions and guidance.

These gaps must stay visible in PR / Issue status and must not be treated as merged production completion.
