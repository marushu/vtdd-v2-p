# Issue #566 Dashboard Auth Entry Local E2E

## Scope

Dashboard auth required 画面で、iPhone/PWA owner が失敗しやすい Cloudflare Access 主導線を押して白画面に進まないよう、Passkey fallback を first-choice action として表示することを確認した。

## Environment

- Date: 2026-05-26 JST
- Runtime: Wrangler local Worker at `http://127.0.0.1:8799/dashboard`
- Browser: Firefox headless
- Viewport: 390 x 844

## Scenario

1. 未認証状態で `/dashboard?repository=marushu%2Fvtdd-v2-p` を開く。
2. `Passkey で開く` が primary button として最初に表示されることを確認する。
3. `Cloudflare Access で開く` が first viewport の主導線から外れ、`Cloudflare Access / fallback` details 内の secondary action になっていることを確認する。
4. 未認証画面に dashboard chat 履歴、通知詳細、repository sensitive query が表示されないことを確認する。

## Commands

```bash
npx --no-install wrangler dev --local --port 8799
/opt/homebrew/bin/firefox --headless --profile "$(mktemp -d)" --window-size=390,844 \
  --screenshot="/Users/shuhei/hibou_works/vtdd-v2-p/docs/mvp/e2e/assets/issue-566/local/auth-required-passkey-primary-mobile.png" \
  "http://127.0.0.1:8799/dashboard?repository=marushu%2Fvtdd-v2-p"
curl -sS "http://127.0.0.1:8799/dashboard/notifications?runId=private-run&title=private&sha=privateabcdef"
```

## Result

- `Passkey で開く` is rendered as `class="button primary"` and appears before `Cloudflare Access で開く`.
- `Status` remains available as a secondary button.
- `Cloudflare Access で開く` remains available only inside `Cloudflare Access / fallback`.
- `/dashboard/notifications?...private...` returns auth required HTML without private notification title, run id, or sha.

## Evidence

- `docs/mvp/e2e/assets/issue-566/local/auth-required-passkey-primary-mobile.png`
