# 開発前作戦図契約

Issue: #703 / #849

VTDD の planning depth は変更リスクに比例させる。目的は、コードを書く前に必要な予見・仮説・検証を残すことであり、軽微な修正まで同じ重い儀式を強制することではない。

## Planning tier

### small

対象:

- isolated bug fix
- generated artifact sync
- isolated test / copy / UI correction
- authority / persistence / public protocol を変えない small refactor

必須:

- target Issue / Mission
- intended change
- validation

独立した `docs/development-strategy/...` は不要。

### normal

対象:

- one coherent owner-facing feature
- one subsystem 内の複数 file change
-通常の runtime behavior change

必須:

- 完了体験
- 設計
- 仮説
- 検証計画
- 改修見積もり
- 停止条件

既存 strategy が同じ Issue / scope を十分に覆うなら再利用する。新規 strategy file は任意。

### root

次を含む場合は root:

- authority model
- persistence / data model
- public API / protocol
- cross-service execution
- Mission orchestration
- security boundary
- recovery architecture

root は実装前に `docs/development-strategy/issue-<number>-<slug>.md` を作成または更新する。

root strategy は少なくとも以下を含む:

- 完了体験
- VTDD 全体で進める部分
- 設計
- 仮説
- 検証計画
- 改修見積もり
- 既に通っている経路
- 未確認の境界
- 穴が出そうな箇所
- PR 前に確認すること
- 実装候補と捨てた案
- merge 後に通す E2E
- 次の PR を増やさない理由
- 停止条件

固定順序は `設計 -> 仮説 -> 検証計画 -> 実装`。

## Legacy compatibility

Planning tier が存在しない既存 PR body は `legacy_full` として扱い、従来の full strategy contract で検証する。

既存 open PR を新形式へ書き換えること自体を completion requirement にしない。

## Cost rule

- same SHA/state は再読しない。
- generated output は test/CI より先に生成する。
- scoped tests を先に green にする。
- full suite は coherent state で原則1回。
- CI は edit-test debugger として使わない。

## Safety boundary

small / normal tier は high-risk boundary を省略する権限ではない。

merge / deploy / spend / contract / credential / permission / destructive / external publish の runtime authority は従来通り維持する。

## Butler との関係

Butler は owner に Agent / Issue / file / test の交通整理を戻さない。planning tier は Butler が内部で判断し、owner に必要なのは product judgment または実際の authority boundary だけとする。
