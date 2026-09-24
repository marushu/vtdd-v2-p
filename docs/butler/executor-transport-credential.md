# Issue #860 — executor transport の本番activation

## 契約

Mac/VPSそれぞれの端末で32 random bytes（256-bit）を生成し、64文字のlowercase hexを
0600 private fileにだけ保存する。WorkerへはTLSの `Authorization: Executor <token>`
で送る。raw tokenをrepo、D1、ログ、chat、RAG、URL query、HTMLへ出さない。
helper出力は絶対pathと `sha256:<64 lowercase hex>` だけ。SHA-256はtokenのASCII文字列に
対して計算する。digestをtokenの代用として送っても認証できない。

Workerの既存D1 executor envelopeにnodeごとのdigest / issueNumber / enrolledAtを保存する。
登録・更新はDashboard認証＋same-origin＋real passkeyを必要とし、executorId、previousDigest
（初回は空）、newDigest、Issueに束縛する。CAS不一致は409。transport登録はPRIMARY、
generation、node key、approved version、failover、candidate、merge/deploy権限を変更しない。

`report` / `authorize` だけがExecutor schemeを受け付ける。payloadのexecutorIdと同じnodeの
digest検証、および既存Ed25519署名・nonce/replay・時刻・body digest・generation検証を行う。
署名検証とreplay更新を含むCAS retryでdigestも再検証する。rekey後の旧tokenは拒否する。
既存 `Bearer <VTDD_GATEWAY_BEARER_TOKEN>` ＋Ed25519経路は維持する。
他routeの認証は変えない。transport token単独は実行権でもnode本人性でもない。

## 本番での明示手順

これはdeploy/credential mutationの実行承認ではない。配置には別のscoped approvalが必要。
以下は新しいexecutor専用configのみを対象とする。**misumi watcher/reporter、dashboard reporter
runtime files、稼働中プロセス、共有gateway credentialは変更・再起動・停止・回転しない。**

1. 承認済みコードを配置後、対象端末のrepo外private directory（0700、端末ユーザー所有）に
   tokenを生成する。実pathはその端末で選び、コマンド出力のdigestだけを承認に使う。

   ```sh
   node scripts/executor-transport-token.mjs --generate /absolute/private/executor-transport.token
   ```

   既存fileは上書きしない。rekey時は別pathへ生成する。現在のdigest確認には
   `node scripts/executor-transport-token.mjs --digest /absolute/private/executor-transport.token`
   を使う。raw fileのcat、clipboardへのコピー、browser入力は不要。

2. Dashboard passkey sessionでsign-inし、同じruntime originの専用承認画面を開く。
   operator linkを案内するButlerは設定済みruntime originから完全URLを構築する。
   pathは `/v2/approval/passkey/operator?mode=executor-transport&executorId=mac&issueNumber=860`
   （VPSの場合 `executorId=vps`）。通常会話でAPIやJSONを入力させる想定ではない。
   このsliceには自然言語からoperator linkを生成する新しいtoolは追加していない。

3. helperが表示したnew digestを入力。初回previous digestは空。更新時は現在のprivate fileの
   digestを入力し、対象node / Issue / old→newの入力表示を確認してreal passkey承認する。
   overviewには登録booleanだけを出す。現在fileを紛失してprevious digest不明の場合の
   recoveryはこのsliceでは未接続。推測したdigestやglobal secret回収で回避しない。

4. executor専用private config（0600）に `transportTokenPath` の絶対pathを追加する。
   既存 `identityKeyPath` は保持する。tokenの値はconfigに埋め込まない。公開鍵が未登録の
   nodeだけ既存 `executor-enroll` operatorで登録する。登録済みMac keyは再登録不要。
   reporter/fenceはnode fileを最優先し、未指定時だけ既存env/vaultのglobal bearerを使う。
   指定fileの欠落、symlink、0600以外、別owner、不正なtokenはfail closed。globalへ戻らない。

5. 新しい専用configでsmoke evidenceを確認し、reporterを `--once` で実行する。
   `node scripts/report-executor-node.mjs --config /absolute/private/executor.json --once`
   未初期化なら202、overviewのfresh Mac bootstrap candidateを確認してここで停止する。
   **PRIMARY bootstrapは別scopeのreal passkey**。transport登録から自動実行しない。
   raw token/Authorization headerをログに入れず、HTTP statusと候補時刻だけを証拠に残す。

rekeyは新file生成→old/new digest承認→専用configのpath切替の順。間の短い停止はfail closed。
旧fileを先に上書きしない。shared bearerの回転・取得API・generic secret retrievalは存在しない。
lease receipt検証など他routeは引き続き既存認証を必要とする。このsliceはreport/authorizeの分離。

## 検証と残る境界

`test/executor-transport-*.test.js`：memory/SQLite、CAS競合、保存内容、scope、node違い、
署名/replay/時刻/世代、global互換、private file、reporter/fence、Dashboard session経路。
`node scripts/e2e-issue860-executor-transport.mjs --browser chromium`（またはwebkit）：
ブラウザ操作をsynthetic Workerとpasskey adapterへ接続し、登録→key→report→候補、rekey、未認証を確認。
fixtureのWebAuthnはsyntheticであり本番端末認証の証拠ではない。

本番real passkey、D1反映、新Mac report、既存misumi健全性のbefore/after確認はlive-only。
未commit/push、未deployの状態からIssue完了・Butler運用完了は主張しない。
