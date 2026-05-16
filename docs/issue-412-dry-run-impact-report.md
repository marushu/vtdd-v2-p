# Issue #412 dry-run impact report

## Target Issue

Issue #412: bug: GitHub App secret sync 用 operator routing を deploy operator から分離する。

## Implementing Success Criteria

- selfParity または setup/runtime guidance から GitHub App secret sync 用 operator URL を取得できる。
- GitHub App secret sync 用 operator URL は `actionType=destructive` / `highRiskKind=github_app_secret_sync` を使う。
- deploy operator URL と secret sync operator URL が混同されない。
- Butler instructions に「GitHub App secret sync は deploy operator ではない」と明記される。
- operator page は `github_app_secret_sync` mode で secret sync section を表示し、deploy section を表示しない。
- 回帰テストがある。

## Explicit Non-goals

- deploy operator の挙動は変更しない。
- issue close operator の挙動は変更しない。
- GitHub App secret 実値の登録は行わない。
- passkey / WebAuthn origin redesign は行わない。
- Cloudflare deploy は行わない。
- public Issue / docs に owner-specific Worker URL を貼らない。

## Expected Files / Routes / Workflows

- `src/core/custom-gpt-setup-artifacts.js`: selfParity payload に GitHub App secret sync operator URL と Markdown link を追加する想定。
- `src/core/passkey-operator-page.js`: `github_app_secret_sync` mode の section visibility / defaults を検証し、必要なら明示化する想定。
- `src/worker/runtime.js`: `/v2/approval/passkey/operator` query params が `actionType=destructive` / `highRiskKind=github_app_secret_sync` を render に渡すことを確認・回帰テストする想定。
- `docs/setup/custom-gpt-instructions.md` / `docs/setup/custom-gpt-instructions-short.md`: Butler が GitHub App secret sync を deploy operator と扱わない guidance を追記する想定。
- `test/custom-gpt-setup-artifacts.test.js`, `test/passkey-operator-page.test.js`, `test/worker.test.js`: selfParity URL、operator page mode、Worker route の回帰テストを追加・更新する想定。

## Affected Issues / PRs / Workflows / Runtime Surfaces

- Affected Issues: #412, parent #355。
- Affected PRs: related PR #365 の運用で見つかった誤案内の修正。PR #365 自体は変更しない。
- Affected workflows: Butler selfParity / setup guidance、helper sync E2E guidance、passkey operator page rendering。
- Affected runtime/operator surfaces: `/v2/retrieve/self-parity`, `/setup/latest` runtime payload, `/v2/approval/passkey/operator` HTML rendering。
- Archived wizard artifacts: 変更しない想定。
- Owner-specific runtime URL / account identifier / bootstrap value: 追加しない想定。
- Shared/public safety: sample URLs は `example.com` / sample repo のみを使い、owner-specific runtime destination は含めない。

## Narrow Patch Risk

- selfParity に secret sync URL を追加する際、既存の deployRecovery / deployOperatorUrl の意味を変えると deploy operator 既存挙動を壊す。
- operator page の mode 推論を狭く変えると `github_actions_secret_sync`, `gateway_bearer_vault_bootstrap`, `vps_runner_admin` の表示を誤って隠す可能性がある。
- docs guidance だけで runtime payload を増やさない場合、Butler が引き続き deploy URL を流用する余地が残る。

## Unknowns To Investigate Before Coding

- selfParity の既存 response shape に secret sync operator 用 field がないため、後方互換を保って新 field を追加できるか。
- setup recovery page が selfParity payload をそのまま埋め込むため、追加 field が setup/runtime guidance として十分か。
- Worker route が `actionType` 未指定で `highRiskKind=github_app_secret_sync` の場合に `actionType=destructive` default を page に表示できるか。

## Validation Needed

- Unit: `evaluateButlerSelfParity` が `githubAppSecretSyncOperatorUrl` / Markdown link / object を返す。
- Unit: secret sync URL が `actionType=destructive` / `highRiskKind=github_app_secret_sync` を含む。
- Unit: deploy URL と secret sync URL が別 URL で、deploy URL は既存 semantics のまま。
- Unit: `renderPasskeyOperatorPage` が `github_app_secret_sync` mode で secret sync section を表示し deploy section を hidden にする。
- Integration: Worker passkey operator route が secret sync query params を render へ渡し、HTML に destructive / github_app_secret_sync と secret sync section を出す。
- E2E: merge 後、Butler が #355 helper sync E2E で deploy operator ではなく secret sync operator を案内できることを別途確認する。

## Stop Condition

- Issue #412 の Success Criteria にない deploy / issue close semantics 変更が必要になった場合は停止する。
- GitHub App secret 実値、secret mutation、Cloudflare deploy、permission mutation が必要になった場合は停止する。
- operator URL の authority boundary が `GO + passkey` なのか、helper sync 実行部分が approval grant なのか不明になった場合は停止して owner decision を求める。

## File / Line Hypotheses

- `src/core/custom-gpt-setup-artifacts.js` lines 284-320: deploy / issue close operator URL だけを作っているため、secret sync 用 URL が selfParity に存在しない可能性が高い。狭く追加する場合、deployRecovery の意味を変えずに別 field として追加する。
- `src/core/passkey-operator-page.js` lines 956-1070: `highRiskKind=github_app_secret_sync` の mode 推論と default action type は既に近いが、回帰テストで deploy section 非表示を固定する必要がある。
- `src/worker/runtime.js` lines 2912-2937: Worker route は query params を render に渡しているが、`actionType` 未指定時の default destructive が HTML に出ることを integration test で固定する必要がある。
- `docs/setup/custom-gpt-instructions.md` lines 361-365 and `docs/setup/custom-gpt-instructions-short.md` lines 61-63: deploy guidance だけが強いため、GitHub App secret sync では deploy operator を使わない明示が必要。

## Hypothesis Retrospective

- `src/core/custom-gpt-setup-artifacts.js` の仮説は正しかった。deploy / issue close URL 生成の隣に、deploy とは別の `githubAppSecretSyncOperatorUrl` / Markdown link / metadata object を追加した。
- `src/core/passkey-operator-page.js` の仮説は概ね正しかった。既存 mode 推論は `github_app_secret_sync` を正しく扱っていたため、実装変更ではなく explicit mode の回帰テストで固定した。
- `src/worker/runtime.js` の仮説は概ね正しかった。route 実装は query params を既に渡していたため、実装変更ではなく Worker integration test で `actionType=destructive` default と deploy section hidden を固定した。
- docs 仮説は正しかった。deploy guidance が強く、GitHub App secret sync を deploy operator と混同しない明示文が不足していたため、full / short instructions に追記した。
- Hypothesis mismatch: runtime route のコード変更は不要だった。既存 route が正しく接続済みで、欠けていたのは selfParity の secret sync URL surface と回帰テストだった。
- RAG checkpoint candidate: yes. Lesson: operator URL が存在するだけでは不十分で、authority semantic ごとの selfParity field / Butler guidance / operator mode regression test を分けて持つ必要がある。
