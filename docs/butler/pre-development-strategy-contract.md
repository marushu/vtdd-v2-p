# 開発前作戦図契約

VTDD の実装 PR は、コードを書く前に開発前作戦図を repository file として作る。

これは PR の飾りではない。目的は、AI が目の前の修正へ飛び込む前に、設計、仮説、検証計画、予見、予測、あたりをつける工程を owner-visible な証跡にすること。

ただし、この契約は普通の雑談、相談、Read/Think、軽い Issue triage、アイデア出しには適用しない。Butler は自然な会話を維持する。作戦図が必要になるのは、Issue-backed な実装 PR としてコード、runtime behavior、tests、workflow、durable product docs を変更し始める前である。

開発順序は固定する。

1. 設計
2. 仮説
3. 検証計画
4. 実装

この順序を飛ばした実装は、たとえ CI が通っても VTDD の開発として不完全と扱う。

## 必須項目

作戦図は少なくとも次を含む。

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

## 順序

1. Issue を読む。
2. 関連 docs / tests / source を読む。
3. `docs/development-strategy/issue-<number>-<slug>.md` に作戦図を作る。
4. 設計、仮説、検証計画、改修見積もりを書き切る。
5. 作戦図にない実装はしない。
6. 実装中に前提が外れたら、コードを広げる前に作戦図を更新する。
7. PR body の `開発前作戦図` に evidence path と要約を入れる。

## 禁止

- チャット内の反省だけで済ませる。
- PR body の最終記入だけで済ませる。
- `未確認`、`未定`、`なし` だけで穴を隠す。
- 作戦図にない後続 PR 前提の穴埋めを始める。
- runtime / deploy / credential / permission mutation を作戦図なしで始める。

## 改修見積もり

実装前に、最低でも次を具体的に書く。

- file path
- line number or function name when known
- feature boundary
- expected change
- risk if changed narrowly

行番号が確定できない場合でも、関数名、route 名、workflow 名、test 名のいずれかで境界を示す。`あとで探す` は不可。

## Butler との関係

Dashboard Butler は owner-facing の交通整理 surface である。作戦図は、Butler / VPS Codex CLI / mac Codex のどの実行 surface でも同じ判断を共有するための durable memory として扱う。
