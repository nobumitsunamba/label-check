# label-check

iPhoneで撮影した「低排出ガス認定ラベル」をClaude Vision APIで判定するWebアプリ。

- フロントエンド: `index.html`（HTML/CSS/Vanilla JS）
- API: `api/judge`（Azure Functions、Claude APIを呼び出し）
- デプロイ: Azure Static Web Apps

APIキーは Azure ポータルの「環境変数」に `CLAUDE_API_KEY` として設定する。
