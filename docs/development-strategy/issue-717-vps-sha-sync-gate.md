# Issue #717 VPS SHA sync gate 作戦図

## 完了体験

オーナーが Butler から開発を投げても、VPS Codex CLI は GitHub `main` と違う
VTDD ソースコードで queue を拾わない。VPS の runner repo が `origin/main` と同じ
SHA なら通常どおり実行し、clean かつ behind-only なら `git pull --ff-only` で同期して
から実行する。dirty、ahead、diverged、別ブランチ、未知の未追跡ファイルがある場合は
queue 選択前に停止し、開発作業を開始しない。

## VTDD 全体で進める部分

Issue #717 の runner wakeup / timer fallback 構成の前提として、wakeup でも timer でも
同じ preflight を通す。今回の PR は VPS runner のローカル canonical repo drift を防ぐ
最小実装であり、Butler UI の recovery button、passkey action、bridge restart UI は別 Issue
に残す。

## 設計

VPS runner は GitHub queue や reviewer fallback を読む前に `scripts/run-vps-runner.mjs`
内で canonical repo preflight を実行する。preflight は `git fetch origin <baseRef>`、
現在 branch、`HEAD`、`origin/<baseRef>`、ahead/behind、tracked dirty、unknown untracked
を取得する。安全に同期できるのは current branch が baseRef、tracked dirty なし、ahead
なし、diverged なし、behind のみのときだけで、その場合だけ `git pull --ff-only origin
<baseRef>` を実行して再確認する。

## 仮説

今回の根本原因は、VPS 上の runner repo が GitHub `main` とズレても runner が queue を
拾えてしまうことにある。runner 起動 wrapper が `git pull --ff-only || true` のように失敗を
握り潰すと、古い `scripts/run-vps-runner.mjs` がそのまま reviewer fallback や execution
queue を処理し、Codex usage guard や新しい安全境界が効かない。queue 選択前の repo 内
preflight であれば、wrapper の失敗を握り潰しても runner 自身が停止できる。

## 検証計画

`test/vps-runner-script.test.js` に preflight 単体テストを追加し、次を検証する。

- clean かつ in-sync は pull せず allow
- clean かつ behind-only は `git pull --ff-only` 後に allow
- tracked dirty は block
- ahead または diverged は block
- `.tmp/` と `test-results/` のみの untracked artifact は block しない
- unknown untracked は block
- `runVpsRunnerOnce` は preflight block 時に GitHub queue 読み取りへ進まない

## 改修見積もり

- `scripts/run-vps-runner.mjs`: `runVpsRunnerOnce` の先頭に canonical repo sync gate を追加する。risk は runner が誤って止まることなので、既知 artifact を明示分類し、dry-run も同じ truth を返す。
- `test/vps-runner-script.test.js`: preflight helper と `runVpsRunnerOnce` の回帰テストを追加する。risk は mock git 応答が実 git と乖離することなので、`git status --porcelain=v1` と `git rev-list --left-right --count` の標準出力に寄せる。
- `docs/development-strategy/issue-717-vps-sha-sync-gate.md`: 作戦図 evidence。risk は仕様だけ先行することなので、PR body で実装とテストを対応させる。

## 既に通っている経路

VPS runner は GitHub Issue comment queue、privileged maintenance queue、PR reviewer
fallback を読む前に `runVpsRunnerOnce` を通る。post-merge verification には
`collectVpsMainSyncStatus` があり、merge 後の `origin/main` 同期確認は既に存在する。
今回の不足は「通常実行を拾う前」の stop gate。

## 未確認の境界

VPS の systemd wrapper 側がどのコマンドで runner を起動しているかは環境依存だが、
runner script 内 gate にすることで wrapper 差分に依存しない。Butler から safe sync を押す
inline action は Issue #528 / #637 に残り、今回の PR では UI を変更しない。

## 穴が出そうな箇所

unknown untracked をすべて許すと main 直接修正の兆候を見落とす。逆に `.tmp/` や
`test-results/` を block すると現 VPS の検証成果物だけで runner が止まり続ける。今回の
分類は known artifact を owner-facing truth として返し、未知だけを block する。

## PR 前に確認すること

`node --test test/vps-runner-script.test.js` を実行し、既存 runner queue / reviewer fallback
テストを壊していないことを確認する。`git diff --check` で whitespace を確認する。

## 実装候補と捨てた案

採用案は runner script 内 preflight + safe behind-only `--ff-only` sync。捨てた案は
systemd wrapper の `git pull` だけに依存する案、GitHub main を毎回直接読む案、dirty
状態でも checkout/reset で強制復旧する案。強制復旧は owner の未承認変更を破壊しうるため
今回の通常経路では扱わない。

## merge 後に通す E2E

VPS で `main` が merge commit と `origin/main` に同期していること、runner timer が active
であること、pending queue がないことを post-merge verification で確認する。VPS に unknown
untracked や ahead commit がある場合は Butler/recovery plane で safe sync または emergency
recovery へ誘導する。

## 次の PR を増やさない理由

drift を止める gate と、その gate のテストは同じ安全境界であり、分けるとテストなしの
停止条件または停止条件なしのテストが生まれる。UI recovery action や wakeup primary 化は
別 Issue criteria なのでこの PR には混ぜない。

## 停止条件

preflight が dirty/ahead/diverged/unknown untracked を検出しても runner が queue を拾える
場合は停止する。clean behind-only 以外で自動同期する必要が出た場合も、権限境界が変わる
ため実装を止めて owner decision を求める。
