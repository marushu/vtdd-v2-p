# Issue #860 — executor transport credential 分離

Planning tier: root。base: 70a92a6。ローカル実装のみ、commit/push/deployなし。

## 完了体験・設計

端末内で256-bit tokenを0600 private fileへ生成し、digestだけをDashboard認証後の
same-origin operatorに入力する。executorId / previous digest / new digest / Issueに
束縛したreal passkeyで登録・更新する。D1既存executor envelopeのCASで保存する。
report/authorizeは `Executor <64 lowercase hex>` または従来global `Bearer` を受け、
どちらも既存Ed25519署名・nonce・時刻・body digest・generation検証を必須とする。
node digest確認を署名/replay CASと同じreducer内で再検証し、並行rekeyに追従する。
transport登録はcontrol、identity、candidate、generation、version、failoverを変更しない。
overviewは登録booleanだけ。更新用previous digestは専用operatorにownerが入力する。

## 仮説

global vault driftをノード専用transportで隔離すれば、misumiの正常な監視経路を
変更せずfresh Mac reporterを接続できる。tokenは本人性や実行権の代替ではない。

## 検証計画

memory/SQLite CAS、再起動、並行rekey/report、scope差替え、他node、wrong token、
replay、時刻、payload、generation、global互換、private file/優先順、認証済みoperator、
synthetic browser登録→identity登録→report→bootstrap候補を検証する。
#858 focused回帰、build、npm test、generated/self parity、diff checkを実施する。

## 変更見積・既知経路

executor state/identity隣接module、runtime route、passkey scope normalization、
operator、reporter/fence、private helper、tests、生成worker。既存passkey provider、
Dashboard session認証、D1 envelope CAS、Ed25519 verifierを再利用する。

## 未確認境界・予測される穴

実端末passkeyと本番D1/配置はlive-only。tokenファイル異常時はglobalへ黙ってfallback
せず拒否。rekeyのCAS retryでもtransportを再検証する。raw tokenはheader/private fileのみ。
既存shared gateway読出しAPI、secret回収、misumi操作、auto failover/latestは追加しない。

## PR前確認・不採用案

focused→build→full suiteの順で確認。global rotation、署名省略、digestをbearerとして
受ける方式、overviewへの全digest公開は不採用。現在の依頼ではPRを作らない。

## merge後E2E・追加PRを前提にしない理由

別途scoped deploy承認後、Mac専用private fileを生成、digestのみをowner passkey登録。
既存node keyのままfresh reportを送りbootstrap候補まで確認する。PRIMARY bootstrapは
別承認。misumi watcher/reporterと共有gateway credentialは変更・再起動・回転しない。
コード経路は一sliceで接続し、live evidenceだけを残す。

## Execution Queue Delta・停止条件

#858 ROOT/Nowのactivation blockerである#860をowner明示依頼により実装する。
他active Issueを縮小/完了扱いにしない。外部credential mutation、deploy、プロセス操作、
merge/closeで停止。threadLocalAssumptionsPromoted=false（未commit/pushのローカル草案）。
