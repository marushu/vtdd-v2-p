# Issue #858 — Mac PRIMARY / VPS STANDBY E2E

## Review #4 最終証跡（2026-09-24、final-e2e-evidence-006）

状態: **ローカル検証成功 / live未接続**。PR #859 head 0e844d4からの修正。
今回commit/push/merge/deploy/install、実credentials・サービス・live monitor変更なし。

### WebKit synthetic browser E2E: 25/25成功

Operatorが `node scripts/e2e-issue858-executor-home.mjs --browser webkit` を実行し、
11 home状態×light/dark＋3 operator＝**25ケースすべて成功、画像25枚**。
成功実行の出力元は `/tmp/issue858-browser-9Da294`。resultsと画像を下記へコピーして確認した。

- [results.json](assets/issue-858/review4-webkit/results.json): 25件すべてbrowser=webkit、passed=true。
- [emergency画面](assets/issue-858/review4-webkit/emergency-light.png): 古いcheckpointでも正しい切替リンクを表示。
- [公開鍵登録成功](assets/issue-858/review4-webkit/executor-enroll-operator.png): 日本語の成功メッセージを表示。
- [planned承認](assets/issue-858/review4-webkit/planned-operator.png)、[emergency承認](assets/issue-858/review4-webkit/emergency-operator.png)。
- 全画像: `docs/mvp/e2e/assets/issue-858/review4-webkit/`（25 PNG）。

home状態: healthy、ready、hiccup、emergency、version、dirty、unsynced、planned-stale、
emergency-unsynced、pending、uninitialized。operatorはplanned/emergency/executor-enroll。
全requestをsynthetic fixtureへ閉じ、実passkeyや本番APIは使用していない。

原因と修正: emergencyを一律checkpointFreshで隠すclient gatingをmode別に修正。
server readyとsnapshot/standby鮮度は維持し、plannedには引き続きcheckpoint鮮度を要求する。
その後、公開鍵登録のchallenge→verify→enrollは成功するが日本語が文字化けする問題をoperatorが
特定。document.characterSetがShift_JISとなる原因はHTMLのcharset宣言欠落だった。
両operator/enrollment文書のhead冒頭に `<meta charset="utf-8">` を追加して25/25成功。
今回その修正をレビューして維持し、UTF-8宣言が先頭1024byte内に存在するfocusedテストを追加。
成功後の画面コード・synthetic harnessは変更しておらず、このoperator実行の証跡を採用した。

ChromiumにはmacOS/RDCのMachPort sandbox起動制限が残る。これはChromiumの環境固有制限で、
WebKitの25/25成功を無効にしない。ブラウザE2Eを一律未検証とは扱わない。

### 最終ローカル検証

- `node --test test/executor-*.test.js test/dashboard-monitor-*.test.js test/codex-version-sync.test.js`:
  **116成功、0失敗、0skip**。
- `npm run build:worker`: 成功。`worker.js`とclient生成物を更新・確認。
- `npm run check:self-parity`: 成功（35 routes / 35 operationIds）。
- `npm run check:generated-worker`: 成功。
- clean copy内をcwdとして実行した全 `npm test`: **1415件中1414成功、1skip、0失敗**。
- `git diff --check`: 成功。

clean検証は管理対象＋今回の新規ファイルを新規一時ディレクトリへコピーし、`.local`を含めず、
既存node_modulesをローカルコピーした（installなし）。実際にclean copyをcwdに指定して
`env -i PATH=… TMPDIR=/private/tmp CI=true VTDD_VPS_LOCAL_HELPER_QUEUE_LOG=<clean-copy>/test-helper.log npm test`
を実行した。事前・事後とも.localなし。全npm test内のself-parity/generated-workerも成功。
既存worktreeの.localは変更していない。

## 安全性の対応表

| 対象 | 正常系 | 拒否・障害系 | 結果 |
| --- | --- | --- | --- |
| planned | freshな停止報告＋clean/pushed/fresh checkpoint | running/unknown/欠落・dirty・unpushed・古さ・activation pending | 成功 |
| emergency | 最終報告から10分以上＋owner隔離確認 | 599999ms、未確認、planned grant流用 | 成功 |
| standby checkpoint | plannedはPRIMARY/control一致＋fresh、emergencyは最後のcontrol一致 | HEAD/repo/branch/base/issue/pull/世代の不一致・欠落 | ready/standbyReady拒否を確認 |
| Ed25519 | 登録鍵・現世代の署名report/authorize | wrong key/node、replay、時刻超過、本文/route改竄、旧世代 | memory/SQLite成功 |
| enrollment/rekey | scoped passkeyで公開鍵登録・更新 | 別scope、旧鍵不一致、rekey/認可競合 | primary/generation不変を確認 |
| bridge/runner | private test configから署名、現PRIMARYのみ進行 | standby/旧世代/pending/設定不足/通信失敗 | 成功 |
| version planner/checker | VPS向けexact packageSpec/rollbackSpecだけを返す | latest/Mac/不正package、--apply、承認前のcommand出力 | 拒否・非実行を確認 |
| browser | emergencyリンクと登録成功の日本語表示 | stale planned、unsynced emergency、隔離未確認 | WebKit 25/25成功 |

## 残る境界

本番E2E、実Mac/VPSの鍵生成・登録・サービス配備、実passkey、自然文quiesce/登録導線、
receipt期限切れ回復、provider-bound approval installerは未検証または未接続。
planner/checkerは宣言的specだけを返し、実install/rollbackは実行しない。

共有bearerはtransport認証のみ。署名はnodeを識別するが、侵害済みノードや既に発行した
外部副作用を暗号学的・原子的に取り消せない。plannedはgeneration変更前のquiesce、
emergencyはownerの電源・ネットワーク・アクセス隔離確認を必須とする。
10分待機により緊急時は古いcheckpointを許容するが、最後のdurable controlとの同期一致を要求。
自動failover/failbackなし。merge/deploy/credential/root authorityはButlerに残る。
