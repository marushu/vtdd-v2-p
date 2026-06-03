# Issue #637 Butler-first recovery intent detection strategy

## 完了体験

Dashboard Butler の main chat で owner が「app-server bridge が落ちてないか確認して」「runner のログを見て」「bridge を安全に再起動して」のように普通の日本語で相談した時、Butler は `VPS` / `root` / `sudo` / `helper` という内部語がなくても Issue #637 の VPS recovery plane として認識する。

この slice の完了体験は、自然文が Worker の Dashboard chat path で VPS privileged maintenance proposal に入り、passkey approval が必要な authority boundary と `rootExecutionStarted=false` を日本語で返すこと。実 root execution は行わない。

## VTDD 全体で進める部分

Issue #637 は iPhone/PWA から VPS 側の runner / app-server bridge / host capability を復旧する backbone である。これまで helper、manifest、sudoers、queue handoff の足場はできたが、入口の自然文検出が内部語に寄ると owner はまた「何を言えば動くか」を覚える必要がある。

今回は Issue #637 の入口だけを狭く改善し、root helper 実行や service restart の実行権限は既存 passkey/helper queue 境界に残す。

## 設計

`detectDashboardVpsPrivilegedMaintenanceIntent` を、`VPS` / `root` / `sudo` / `helper` だけでなく、runner / app-server bridge と復旧系 intent の組み合わせで検出できるようにする。

検出対象:

- app-server bridge / bridge / ブリッジ
- runner / ランナー / 実行器
- 状態確認 / 生存確認 / 落ちている / 止まっている / ログ / 再起動 / 復旧

検出後の capability 選択は既存 `resolveDashboardVpsMaintenanceNaturalLanguagePreset` に任せる。これにより、status/logs は low risk、restart は medium risk の既存 registry boundary を再利用する。

## 仮説

現在の実装は、自然文検出で `lower.includes("vps")` または root/sudo/helper 系を要求している。したがって「bridge が落ちてないか確認して」「runner のログを見て」は、preset resolver 自体は対応していても、その前段で VPS maintenance flow に入らない。

この仮説が正しければ、検出関数だけを改善すれば既存 proposal / approval URL / helper queue path は流用できる。

狭く直さず proposal builder や helper registry まで触ると、authority boundary を変えたり Issue #637 の root execution 側まで広げたりするリスクがある。

## 検証計画

- `test/worker.test.js` に、`VPS` / `root` / `sudo` / `helper` を含まない app-server bridge status 自然文が proposal に入ることを追加する。
- 既存の runner status test が壊れないことを確認する。
- `node --test test/worker.test.js` で Worker runtime の Dashboard chat path を検証する。
- `npm run build:worker` と `npm run check:generated-worker` で generated Worker の同期を確認する。
- `git diff --check` で whitespace を確認する。

## 改修見積もり

- `src/worker/runtime.js`: `detectDashboardVpsPrivilegedMaintenanceIntent` の条件を拡張する。リスクは通常チャットの誤検出。runner/bridge と復旧語の組み合わせに限定して抑える。
- `test/worker.test.js`: app-server bridge status の自然文テストを追加する。リスクは既存 fixture の肥大化。
- `worker.js`: `npm run build:worker` による生成物更新。手編集しない。
- `docs/development-strategy/issue-637-recovery-intent-detection.md`: この作戦図。

## 既に通っている経路

- Issue #637 の Dashboard chat -> proposal -> passkey approval URL -> helper queue path は `test/worker.test.js` に既存テストがある。
- runner status の low-risk preset mapping は既存テストで確認されている。
- helper queue handoff は production evidence と GitHub-visible runtime truth が Issue #637 に残っている。

## 未確認の境界

- production PWA で owner が内部語なしの日本語を投げた時の実機表示。
- app-server bridge restart の実 execution は今回行わない。
- helper queue pickup 後の live service restart / logs evidence は今回の PR では増やさない。

## 穴が出そうな箇所

- `bridge` という単語が通常会話にも出るため、復旧語なしでは検出しない。
- `確認` は広い語なので、runner/bridge と組み合わせた時だけ検出する。
- repository / relatedIssue がない場合は既存 preflight が blocked にする。今回の slice は repo-less main chat の最終仕様ではなく、自然文入口の改善に限定する。

## PR 前に確認すること

- branch が `origin/main` から切られていること。
- open PR がないこと。
- untracked `.tmp/` / `test-results/` を commit に混ぜないこと。
- PR body に Execution Queue Delta を日本語で入れること。

## 実装候補と捨てた案

採用: detection 条件を拡張し、既存 preset resolver と proposal path を再利用する。

捨てた案: app-server bridge 専用 route を新設する。理由は Issue #637 の helper lifecycle と重複し、authority boundary が分裂するため。

捨てた案: repo-less main chat の default repository を入れる。理由は Safety Invariant の「No default repository」に反するため。

## merge 後に通す E2E

production deploy 後、Dashboard Butler main chat で「app-server bridge が落ちてないか確認して。Issue #637」と送る。期待値は approval_required または必要 context/config の owner-facing 日本語表示で、英語 raw error や無言待機にならないこと。

## 次の PR を増やさない理由

この PR は入口検出だけの狭い土台で、helper execution や restart 実行を含まない。root/helper 実行 evidence は別 PR に分ける方が authority boundary と検証が明確になる。

## 停止条件

検出改善だけでは proposal path に入らない、または proposal path が repository / issue / approval boundary を弱める必要があると判明した場合は停止する。deploy、root execution、credential/permission mutation が必要になった場合も停止する。
