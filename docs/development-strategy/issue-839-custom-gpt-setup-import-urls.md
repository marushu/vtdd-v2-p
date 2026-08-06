# Issue #839 Custom GPT setup import URLs strategy

## Completion experience

owner が iPhone の Custom GPT Editor で長い OpenAPI schema 本文を貼らず、Wizard に表示された `/setup/openapi.yaml` を `URL からインポートする` に入れて Actions schema を設定できる。

## Scope

- Worker に raw setup import endpoints を追加する。
- Wizard に import URL を表示する。
- OpenAPI server URL を現在の Worker origin に展開する。
- secret / token / passkey は表示しない。

## Hypothesis

iPhone の textarea から OpenAPI 本文を手貼りすると URL エンコードや HTML entity の混入で schema が壊れる。GPT Editor の URL import に raw YAML endpoint を渡せば、本文貼り付けの失敗経路を避けられる。

## Validation

- raw YAML / JSON / text endpoint の worker tests
- setup latest page assertions
- runtime setup manifest parity
- worker build
- generated worker check
- full `npm test`
- production deploy 後の curl と iPhone GPT Editor import

## Non-goals

- Custom GPT editor の外部 API 自動作成
- Gateway bearer token の表示
- Voice mode 中の Actions 実行
- Dashboard Butler 通常会話 UI の改修
