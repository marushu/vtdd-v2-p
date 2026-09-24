# Issue #858 — Mac PRIMARY / VPS STANDBY executor failover

Planning tier: root.

## 完了体験

Butlerホームを見れば、MacがPRIMARY、VPSがSTANDBYであること、両方のheartbeat、Codex版、checkpoint鮮度、failover readinessが一目で分かる。通常時はMacだけが実行権を持つ。Macが落ちてもVPSが勝手に書き始めず、ownerがiPhoneのscoped passkeyで明示昇格させた時だけgenerationを上げてVPSへ実行権を移す。Mac復帰時も自動failbackしない。

## 設計

Butler/Workerのdurable stateをauthority sourceとする。stateはprimaryExecutor、standbyExecutor、generation、approvedCodexVersion、各nodeのheartbeat/version/ready、handoff checkpointを保持する。executorのwrite可能性は「executor idとgenerationがcurrent stateと一致する」ことを最低条件にする。merge/deploy/credential authorityは既存Butler+human boundaryのまま。

Mac reporterはread-onlyでMac heartbeat、Codex exact version、app-server smoke結果、repo checkpoint要約を送る。VPS standby reporterはread-onlyでheartbeat、installed version、service inactive/standby truthを送る。Macで検証済みexact versionのみapprovedCodexVersionにでき、VPS version sync plannerは差を表示する。実installは既存privileged maintenance/passkey経路へ委譲する。

## 仮説

現在の破綻リスクは二つ。第一にMac/VPSが独立にCodexを動かすとsplit-brainになる。第二にVPS Codexが古いままだと非常時に初めて互換性問題が出る。単一generationとapproved exact versionをButler durable stateに置けば、普段は単純なMac一本化を維持しながら、非常時だけ安全にVPSへhandoffできる。

## 検証計画

Unit: schema、generation単調性、single-writer guard、checkpoint redaction、freshness、version planner、failover blocker。
Integration: injected D1/in-memory store、Mac/VPS reporters、overview card、promotion proposal/approval scope。
E2E: synthetic Mac正常、Mac heartbeat stale、VPS version mismatch、dirty checkpoint、promotion、旧Mac復帰のstale generation拒否、manual failback。
Production: 最初にread-only readiness cardとreportersだけをlive確認。VPS package更新とexecutor promotionは別のscoped passkey evidenceを取るまで実行しない。

## 改修見積もり

- src/core/executor-failover-state.js: state/schema/reducer/readiness
- src/worker/runtime.js: authenticated report/read/action proposal routes
- src/worker/dashboard-monitor-home.js: executor readiness card
- scripts/report-executor-node.mjs: Mac/VPS read-only reporter
- scripts/plan-codex-version-sync.mjs: exact-version diff planner
- docs/butler authority/intent/queue: 新primary/standby contractへ更新
- focused tests + generated worker

## 既に通っている経路

Dashboard monitor D1、machine bearer auth、passkey approval、VPS privileged maintenance、GitHub runtime truth、read-only reporter、Butlerホームは既に存在する。Issue #843はemergency break-glass、Issue #637はprivileged helper、Issue #806はVPS control/dev checkout分離を定義している。

## 未確認の境界

VPSのCodex install methodとpackage manager truth、Mac app-serverを常駐させる最適なlaunch mechanism、既存Mission stateとexecutor stateの統合可否は実装前に確認する。実VPS package mutationはpasskey前提で未実施。

## 穴が出そうな箇所

Macがdirty/unpushedのまま突然停止した場合、その変更内容はVPSから復元できない。checkpointは「dirtyあり」を確実に表示し、失われた可能性を隠さない。heartbeatだけでprocess identityを断定しない。version一致だけでstandby readyとしない。古いgenerationのMac復帰をwrite-readyにしない。

## PR前確認

Issue #858、#843、#637、#741、#806、authority model、thread-independent startup、execution queue、current GitHub/runtime truthを照合。秘密値やowner-specific URLを公開コードへ入れない。稼働中misumi watcher/reporterには触れない。

## 実装候補と捨てた案

採用: Mac PRIMARY / VPS STANDBY、manual failover、exact-version pin、single generation。
捨てる: active-active、heartbeatだけでauto failover、VPS auto-latest、dirty workの自動reset、promotionにmerge/deploy authorityを含める。

## merge後E2E

本番ButlerでMac PRIMARY/VPS STANDBYカード、heartbeat/version/checkpoint freshnessを確認。Mac reporter停止fixtureでowner actionを確認。実VPS昇格はownerのscoped passkey後にgeneration増加と旧Mac write拒否を確認する。VPS version更新はMac approved versionと同一pinで別passkey実行する。

## 次のPRを増やさない理由

state/readiness/reporting/version plannerは同じauthority contractを共有するため、一つのroot sliceで揃える。実package mutationとlive promotionは外部効果が強いため、このPRでは経路を実装しても実行は別passkey evidenceに分離する。

## 停止条件

新しい権限追加、secret移行、root helper拡張、VPS package更新、production deploy、executor promotionはscoped passkeyなしでは停止する。既存Mission/Issueを完了扱いにしない。Issue #741の既存recovery workは新authorityへ再分類するだけで削除しない。

## 独立レビュー反映（issue858-independent-review-001）

設計: この slice は完全な二段階 promotion の代わりに control-state transition /
activation pending を明示する。transition は対象・旧新 generation・期限・relatedIssue
に束縛した receipt を保存する。対象側 helper は owner が渡した receipt を machine-auth
endpoint で照合してから private reporter config を原子的に更新する。reporter 自体は
server generation を取得しない。新 generation と receipt ID の fresh report まで pending。
共有 bearer は暗号学的ノード本人性を証明しない。既存 runner fencing 接続は別ギャップ。

仮説: Mac auto-update を health と version approval に分離し、bootstrap candidate を
machine report で保存すれば、iPhone で JSON を扱わせず、正常系を止めずに承認できる。

検証: SQLite CAS report/transition race、receipt 改竄/期限/対象/旧世代、pending 表示、
shared auth threat boundary、clock skew、atomic output/checkpoint/vault fallback、fake child
initialize-only smoke、既存 passkey encoder 互換を scoped test と synthetic browser で検証。

停止条件: 実サービス・launchd・credentials・live bridge・install は操作しない。
Mac bridge の activation と runner fencing、expired receipt recovery は運用上未接続として残す。

## Review #2 — 実行 admission fence と exact version 承認

設計: machine-auth authorize は executorId/generation/purpose だけを受け、最小 allow/deny
を返す。未初期化も明示的 bootstrap_required で拒否し、例外・未設定・通信失敗は閉じる。
bridge は turn/selector の前、runner は queue pickup と各 subprocess/write の前に照会する。
共通 private reporter config を読むが server generation を採用しない。実行中 Codex 自体を
強制停止する機構ではなく、認可後〜実副作用の間の競合を原子的に解決するものでもない。
共有 bearer は transport 認証だけであり、暗号学的 node identity を提供しない。

activation 完了には running + receipt + fresh heartbeat/smoke/exact version を要求する。
version承認は独立passkey scope (Issue/current generation/from-to Mac/exact candidate/既存版)
とCASでapprovedCodexVersionだけを変更。Mac報告をcommit時に再評価する。
計画handoffはPRIMARY quiesceが先で、alive/runningをreadyとは表示しない。

検証: Worker/bridge/runnerの実経路でstale/standby/pending/missingを拒否しCodex非呼出、
正しいPRIMARYを許可。実SQLiteでversion/report競合、passkey scope mismatch、home link。
全検証はfake fetch/child/private test files。live bridge/runner/credentialsは触らない。
