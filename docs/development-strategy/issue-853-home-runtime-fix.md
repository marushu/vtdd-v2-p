# Issue #853 — 本番ホームの起動不良修正

Planning tier: small. PR #854の本番反映後、ホームのDOMが生成されず `__name is not defined` を実ブラウザで確認した。snapshot API、read-only reporter、既存予約監視は稼働しており、今回そこには変更しない。

## 原因と変更
Worker側で関数をtoStringしHTMLへ埋め込む実装が、配備時の名前保持変換でWorker専用helperを含んでしまった。keepNames=trueのbundleを独立VMで実行する回帰テストで同じエラーを再現済み。
ブラウザ用ソース文字列を正規ビルド段階の未変換ソースから生成し、静的なgenerated moduleとしてHTMLへ埋め込む。Workerの配備変換後に関数をシリアライズしない。clientの状態判定・認証・API・UI・Push handlersは変更しない。ブラウザへ不足helperをグローバル注入して隠す方式は採用しない。

## 対象と検証
build-worker、client文字列生成helper/generated module、homeのscript差込箇所、名前保持bundle回帰test、生成workerだけを対象とする。対象テスト・全体テスト・生成物整合・実際のWorker bundle由来のHTMLをブラウザで検証する。本番反映は既存パスキー経路を維持。稼働中監視・reporterを停止せず、秘密情報や私有パスを公開しない。
