## This PR satisfies Intent

- Issue #426 の Intent に対し、Butler が Issue / PR / close readiness / status / 残タスク確認 intent を受けた時の初回応答を短くし、重い startupPreflight / Gemini / deploy / milestone judgment を初回応答前に抱え込まない方針を Custom GPT Instructions に固定します。
- runtime endpoint は追加せず、docs と docs tests で staged lightweight read ladder を固定する PR です。

## Satisfied Success Criteria

- Custom GPT Instructions に、status 系 intent ではまず短い受付返答を返し、初回応答前に全確認を抱え込まない方針を明記しました。
- repo 解決済みの status 系 intent では初手 `vtddStartupPreflight` を避け、`vtddRetrieveGitHub` の Issue / PR / comments / reviews / checks / workflow runs / jobs / branches / deploy truth の軽量 read ladder を優先する方針を明記しました。
- `vtddStartupPreflight` は target unresolved、startup / handoff / RAG / surface consistency が本当に必要な時に使う方針へ限定しました。
- Gemini review、残タスク候補、milestone judgment は明示要求または後段に回し、初回応答前に抱え込まない方針を明記しました。
- short / short-min Instructions にも同じ first-response latency 方針を editor limit 内で保持しました。
- docs tests に staged response / startupPreflight avoidance / lightweight read ladder の invariant を追加しました。

## Unsatisfied Success Criteria

- code/docs merged は未完了です。この PR が merge されるまで Completion Gate は満たしません。
- live Butler 実機 E2E は未実施です。Custom GPT editor 貼り直し後に iPhone/iPad Butler で確認が必要です。
- human approval は未完了です。

## Non-goal violations

None.

## Dry-run Impact Report

- Target Issue: Issue #426
- Implementing Success Criteria: status intent の短い初回応答、startupPreflight avoidance、lightweight read ladder、Gemini / 残タスク候補 / milestone judgment の後段化、short / short-min invariant、docs tests 固定。
- Explicit Non-goals: runtime API endpoint 追加なし。Issue close / merge / deploy authority model 変更なし。approvalGrantId TTL 変更なし。Gemini reviewer logic 変更なし。実測 latency 完全保証の主張なし。
- Expected touched files/routes/workflows: `docs/setup/custom-gpt-instructions.md`, `docs/setup/custom-gpt-instructions-short.md`, `docs/setup/custom-gpt-instructions-short-min.md`, `test/custom-gpt-setup-docs.test.js`。runtime route / OpenAPI schema / workflow は未変更。
- Affected Issues: Issue #426。関連文脈として Issue #421 nickname read fast path、Issue #424 close readiness 実例、Issue #417 post-action orchestration を参照。
- Affected PRs: 新規 PR のみ。既存 PR は変更しません。
- Affected workflows: docs unit、self-parity check、generated-worker check。GitHub Actions workflow 定義は未変更。
- Affected runtime/operator surfaces: Custom GPT Instructions surface と `/setup/latest` の short-min copy target。Worker runtime、deploy operator、GitHub authority plane は未変更。
- What may break if we patch narrowly: startup 文言を弱めすぎると、本当に startup / handoff / RAG consistency が必要な実装 handoff 前 preflight まで省略されるリスクがあります。このため status intent 例外として限定しました。
- Unknowns to investigate before coding: short / short-min の文字数制限内に first-response latency 方針を保持できるか。既存 docs test の startup preflight 固定 assertion を Issue #426 に合わせて更新できるか。
- Validation needed: `node --test test/custom-gpt-setup-docs.test.js`、`npm run check:self-parity`、`npm run check:generated-worker`、short-min Instructions の manual static check、live Butler E2E は Custom GPT editor 貼り直し後。
- Stop condition: runtime route 追加、Action Schema 変更、authority model 変更、または Issue #426 Non-goal を越える修正が必要になった場合は停止。

## File / Line Hypotheses

- file: `docs/setup/custom-gpt-instructions.md`
  - hypothesis: 旧 startup 文言が status intent でも `vtddStartupPreflight` 優先へ倒すため、true startup と status intent を分離する必要がある。
  - risk if changed narrowly: Codex handoff / proposal / write 前の必要 preflight まで省略される。
  - validation: docs test で status intent 例外と startupPreflight 限定を assert する。
  - related Issue: Issue #426
- file: `docs/setup/custom-gpt-instructions-short.md`
  - hypothesis: short paste target にも startup 優先文言があり、editor limit 内で status 例外を保持する必要がある。
  - risk if changed narrowly: full instructions だけ直って実際の paste target に遅延方針が残る。
  - validation: short docs test と character limit assertion。
  - related Issue: Issue #426
- file: `docs/setup/custom-gpt-instructions-short-min.md`
  - hypothesis: `/setup/latest` の実貼り付け候補である short-min に同方針が残らないと実機 Butler UX が改善しない。
  - risk if changed narrowly: canonical full docs は正しくても owner が貼る short-min に反映されない。
  - validation: short-min docs test と manual static check。
  - related Issue: Issue #426
- file: `test/custom-gpt-setup-docs.test.js`
  - hypothesis: nickname fast path と同じ粒度で status staged response / preflight avoidance / read ladder を固定する assertion が必要。
  - risk if changed narrowly: 将来の docs edit で first-response latency 方針が消える。
  - validation: `node --test test/custom-gpt-setup-docs.test.js`
  - related Issue: Issue #426

## Hypothesis Retrospective

- expected: Issue の File / Line Hypotheses どおり、full / short / short-min Instructions と docs tests が主な変更点になる。
- actual: 予想どおり runtime は変更せず、3つの Instructions と docs test だけを変更しました。short / short-min は既存上限に近かったため、既存文言を圧縮しつつ status 方針を追加しました。
- mismatch: `src/worker/runtime.js` は確認対象でしたが、この Issue の Non-goal どおり変更不要でした。
- lesson: paste target が editor limit 近くにあるため、今後の guardrail 追加は short / short-min の文字数余地を先に確認する必要があります。
- should become RAG candidate: はい。`Issue #426 では status intent の first-response latency 方針を docs/tests 固定で解決し、runtime route は触らなかった` という working_memory 候補にできます。

## Verification Evidence

- Unit: `node --test test/custom-gpt-setup-docs.test.js` passed. 11 tests passed.
- Integration: `npm run check:self-parity` passed. Runtime setup manifest parity check passed; 26 routes and 26 operationIds checked.
- Integration: `npm run check:generated-worker` passed after local `npm ci` restored missing `esbuild`.
- E2E: not-live. Custom GPT editor 貼り直し後の iPhone/iPad Butler 実機 E2E は未実施です。
- Manual: `docs/setup/custom-gpt-instructions-short-min.md` static check passed: length 7716 chars and includes first reply short / avoid first-step `vtddStartupPreflight` / lightweight ladder tokens.
- Evidence path/link: this PR diff and command outputs in Codex run.

## Butler Completion Contract

- Owner goal: Butler が status intent で長時間黙らず、短い受付返答後に段階的な lightweight reads を進めること。
- Butler entrypoint: Custom GPT Instructions の natural-language behavior guidance。新規 Action は追加しません。
- Action Schema exposure: 変更なし。既存 `vtddRetrieveGitHub` と `vtddStartupPreflight` の使い分け方針のみ更新します。
- Runtime path: 変更なし。runtime route は追加・変更していません。
- Runner/runtime truth: docs tests、self-parity、generated-worker check は pass。live Butler runtime truth は未実施です。
- Authority boundary: 変更なし。Issue close / merge / deploy は引き続き GO + passkey / explicit authority 境界に従います。
- E2E evidence: not-live。Custom GPT editor 貼り直し後、`ぶい の Issue #424 をクローズして、残り何を進めたら良いかをチェック` 相当で初回応答が長時間沈黙しないことを実機確認する必要があります。
- Completion status: incomplete

## Surface Update Checklist

- Cloudflare deploy: not required for this PR itself; merge後に runtime `/setup/latest` 反映が必要かは self-parity で確認します。
- Custom GPT Action Schema update: not required.
- Custom GPT Instructions update: required after merge. `/setup/latest` の short-min Instructions を Custom GPT editor に貼り直す必要があります。
- iPhone Butler live E2E: required after Custom GPT editor update; not-live in this PR.

## Related Constitution Rules

- Butler-First Operating Principle: iPhone/iPad-first の Butler UX を優先し、Mac Codex only の完了主張をしない。
- Evidence Discipline: completion claim には file / tests / E2E evidence を分けて示す。
- Issue Lifecycle Gate: merge / close / deploy authority はこの PR では変更しない。
- Change Size and PR Discipline: Issue #426 の docs/tests slice に限定し、runtime や authority model に触れない。

## Out-of-scope but NOT implemented

- `vtddIssueCloseReadiness` のような専用 lightweight Action 追加。
- runtime API / Worker handler の変更。
- Gemini reviewer logic の変更。
- deploy / merge / issue close authority model の変更。
- live Butler 実機 E2E の完了主張。

## Extra changes (if any)

None.

<!-- VTDD metadata -->
- Issue: Issue #426
- Execution ID: remote-codex-issue426-1f5bdj
- Goal: open_pr
