# Issue #858 — Mac PRIMARY / VPS STANDBY E2E

## Review #3 ローカル証跡（2026-09-24）

状態: **incomplete / live未接続**。現PRブランチ内のコード・テスト・生成worker・docsだけを変更。
本番、サービス、package install、実鍵・credentials、live monitor、push/merge/deployは未実施。

| 対象 | 正常系 | 拒否・障害系 | 結果 |
| --- | --- | --- | --- |
| planned | freshな停止報告とそのノードのclean/pushed/fresh checkpoint | running/unknown/欠落・dirty・unpushed・古いcheckpoint、activation pending | 成功 |
| emergency | 最終heartbeat/観測/受信から10分以上＋owner隔離確認 | 599999ms、未確認、planned grant流用、逆モード | 成功 |
| standby checkpoint同期 | plannedはPRIMARY/controlと一致しfresh、emergencyは最後のcontrolと一致（古さは許容） | 欠落、dirty/unpushed、HEAD/repo/branch/base/issue/pull/世代の不一致、plannedで古いcheckpoint | 成功、ready/standbyReadyとも拒否 |
| Ed25519 identity | 登録鍵・現世代の署名report/authorize | wrong key/node、nonce replay、±120秒超過、本文・route改竄、旧世代 | memory/SQLite成功 |
| enrollment/rekey | scoped passkeyで公開鍵のみ登録・更新 | 別ノードscope、旧鍵不一致、rekey中の認可競合 | 成功、primary/generationは不変 |
| bridge/runner fence | private test key/configから署名、正しいPRIMARYのみ進行 | standby/旧世代/pending/設定不足/通信失敗 | 成功 |
| operator script | planned/emergency/enrollment/versionの承認payload | 隔離checkboxなしではWebAuthn前に停止 | Node VM成功 |
| 実ブラウザ描画 | light/dark、9状態、3種operatorのsynthetic harness | 全requestをfixtureへ閉じる | **未検証: sandboxでChromium起動拒否** |

- `node --test test/executor-*.test.js`: **80成功、0失敗**。
- `npm run build:worker`: 成功、`worker.js`を更新。
- `.local`のない一時作業コピーで全 `npm test`: **1410件中1409成功、1skip、0失敗**。
  self-parity（35 routes / 35 operationIds）とgenerated-worker整合も成功。
- `git diff --check`: 成功。
- `node scripts/e2e-issue858-executor-home.mjs`: Chromium起動時に
  `MachPortRendezvous ... Permission denied (1100)`。制限迂回・installは行っていない。
  VMで操作スクリプトを検証したが、描画・ブラウザE2Eの代替完了とは扱わない。

clean検証はgit管理対象と今回の新規ファイルのみを一時ディレクトリへコピーし、`.local`は
含めず、既存node_modulesをローカルコピーした（installなし）。環境変数はPATH、TMPDIR、
CI、テスト専用 `VTDD_VPS_LOCAL_HELPER_QUEUE_LOG` だけを指定した。
最初の全体試行は既存queueテストのホーム配下ログへのwriteがsandboxで拒否され2件失敗。
テスト専用ログ先を指定して解消した。依存をsymlinkした初回コピーではesbuildの生成コメントに
異なる相対パスが入りgenerated比較が失敗したため、依存を実コピーした最終実行で確認した。
リポジトリの既存 `.local` は変更・commit対象にしていない。

主な証跡: `test/executor-failover-state.test.js`、`test/executor-failover-routes.test.js`、
`test/executor-node-identity.test.js`、`test/executor-runtime-fence.test.js`、
`test/executor-lease-smoke.test.js`、`scripts/e2e-issue858-executor-home.mjs`。

## 残る境界

共有gateway bearerはtransport認証のみ。ノード本人性は登録済みEd25519鍵による署名で
検証するが、侵害済みノードや既に発行した外部副作用を暗号学的・原子的に取り消せない。
したがってplannedはgeneration変更前にquiesce、emergencyはownerの電源・ネットワーク・
アクセス隔離確認を必須にする。heartbeatから隔離を推測しない。
緊急時は最後のclean/pushed checkpointを使う。10分待機との両立のため鮮度10分要件は
plannedだけに適用し、emergency operatorには古いcheckpointと作業回復の限界を表示する。
自動failover/failbackなし。merge/deploy/credential/root authorityはButler側に残る。

実Mac/VPSへの鍵生成・登録・配備、planned quiesceの自然文dispatch、live PWA、
本番署名通信、実passkey、receipt期限切れ回復は未検証または未接続。
ブラウザが起動可能な許可済み環境でsynthetic E2Eを再実行するまでreview完了とはしない。

## 過去のDEMO画像（Review #2、今回のUI証跡ではない）

以下は旧契約の合成画像で、本番状態やReview #3の描画検証を示さない。

![過去DEMO healthy](assets/issue-858/demo/healthy-light.png)
![過去DEMO ready](assets/issue-858/demo/ready-light.png)
![過去DEMO version mismatch](assets/issue-858/demo/version-light.png)


## checkpoint-sync-004 追検証

2026-09-24。planned/emergencyそれぞれ10種類の欠落・不一致条件、planned鮮度境界、
PRIMARY報告とcontrol双方への一致、emergencyの古い同期済みcheckpoint、nullable ID比較を
追加し、focusedを56件から80件へ拡充した。世代を進める正常系fixtureも、待機ノード自身の
同期済み現世代checkpointを明示している。

同期不成立は「待機側checkpointの同期不一致・欠落（計画切替では鮮度も必要）」を表示し、
ready/standbyReady/actionURLを拒否側へ倒す。10分待機・owner隔離・署名・passkey scopeは維持。
新しいcleanコピーには事前/事後とも.localなし。全npm testとself-parity/generated-worker成功。
synthetic browserは今回もsandboxのMachPortRendezvous Permission denied (1100)で起動拒否。
unsynced状態の画面確認をharnessへ追加したが、実ブラウザ描画は未検証のまま。
commit/pushを含む外部操作は未実施。
