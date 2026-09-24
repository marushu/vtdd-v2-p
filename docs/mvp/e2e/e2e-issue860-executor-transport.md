# Issue #860 — node-scoped transport 検証記録

2026-09-24、base `70a92a6a52a70d5afef61a5af0c1fa82312391f6`、topic branch
`issue-860-executor-transport-credential` の未commit worktreeで実行。
本番アクセス・credential mutation・deploy・commit/pushは実施していない。

| 検証 | 結果 |
| --- | --- |
| `node --test test/executor-*.test.js` | 91 pass / 0 fail / 0 skip |
| `npm run build:worker` | pass、worker.js再生成 |
| `VTDD_VPS_LOCAL_HELPER_QUEUE_LOG=/private/tmp/issue860-test-helper-queue.log npm test` | 1426 tests: 1425 pass / 0 fail / 1 skip |
| `check:self-parity`（npm test内） | pass、35 routes / 35 operationIds |
| `check:generated-worker`（npm test内） | pass |
| #860 synthetic browser Chromium | 8 pass / 0 fail |
| #860 synthetic browser WebKit | 8 pass / 0 fail |
| #858 synthetic browser Chromium | 25 pass / 0 fail |
| #858 synthetic browser WebKit | 25 pass / 0 fail |
| `git diff --check` | pass |

full suiteのskipは既存E2E-31 live conflicting-PR preflight（live env/credential未指定）。
初回npm testは1423 pass / 2 fail / 1 skip。既存VPS queueテスト2件のdefault home logへの
書込みをsandboxが拒否したため、上記一時log環境変数を設定して再実行した。実運用logへの
権限昇格は行っていない。browser起動のみOS sandbox外で、隔離profile・全request interception。

## 成功条件の対応

- random private token、0600、exclusive create、symlink/owner/shape拒否、digest/pathだけの出力：
  `test/executor-transport-local.test.js`。
- memory/SQLite保存、control/key/candidate不変、CAS rekey競合、並行登録、再起動、
  wrong node/digest、署名/replay/時刻/payload/generation拒否：
  `test/executor-transport-credential.test.js`、既存node identity/stateテスト。
- Dashboard session→専用scoped passkey、scope差替え拒否、same-origin、global互換、
  report/authorize以外のnode token拒否、古いgeneration拒否：
  `test/executor-transport-routes.test.js`。
- drifted global bearerでもreporter/fenceのnode token経路、private file異常時fail closed：
  `test/executor-transport-local.test.js`、既存reporter/fenceテスト。
- digest登録→node key登録→signed report→bootstrap candidate表示、rekey後旧token拒否、
  未認証401：`scripts/e2e-issue860-executor-transport.mjs`。light/dark各4 scenario。
  実Worker routeとsynthetic WebAuthn adapterを使用。WebKitのinterceptionでCookieが
  未付与の場合は、その隔離browser contextのcookie jarだけをWorkerへ引き継ぐ。
  real authenticator、network上のcookie送信、本番D1の証拠ではない。

## ローカル証拠

- focused log: `/private/tmp/issue860-focused.log`
- full suite log: `/private/tmp/issue860-npm-test.log`
- build log: `/private/tmp/issue860-build.log`
- #860 Chromium screenshot/results: `/tmp/issue860-browser-YnXU6i/`
- #860 WebKit screenshot/results: `/tmp/issue860-browser-QZe5nl/`
- #858 Chromium screenshot/results: `/tmp/issue858-browser-S44qia/`
- #858 WebKit screenshot/results: `/tmp/issue858-browser-MUg5WD/`

これらはこの端末の一時証拠であり、共有済み証拠ではない。

## Live-only boundary / incomplete

[本番activation手順](../../butler/executor-transport-credential.md) に従い、承認済み配置後に
ownerのreal scoped passkeyでdigest登録、新Mac signed reportとfresh bootstrap candidateを
確認する必要がある。PRIMARY bootstrapは別承認。既存misumi watcher/reporter、dashboard
reporter runtime files、稼働プロセス、共有gateway tokenは変更・再起動・回転していない。

自然言語からoperator linkを案内する新tool、端末file紛失時のprevious digest recovery、
report/authorize以外のtransport独立化は未接続。本Issueのproduction success criterionと
Butler全体の完了を、local synthetic成功だけで満たしたとは主張しない。
