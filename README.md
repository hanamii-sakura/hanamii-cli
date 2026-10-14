# hanamii CLI / MCP サーバー

[hanamii](https://hanamii.jp)（HANAMII株式会社が運営する国産 PaaS）に、ターミナルと AI エージェントからデプロイするためのコマンドラインツールです。1 つの npm パッケージ `hanamii` に、CLI と [MCP](https://modelcontextprotocol.io) サーバー（`hanamii mcp`）が入っています。

> 開発中です。コマンドの一覧と使い方は実装が進み次第ここに追記します。

## 使い方（予定）

```bash
npx hanamii login            # トークンを保存
npx hanamii deploy --name my-app
npx hanamii logs --since -15m
npx hanamii mcp              # MCP サーバーを stdio で起動
```

## 開発

```bash
npm ci
npm run build && node dist/cli.js --version
npm test
npm run lint && npm run typecheck
```

- Node.js 20.3 以上
- 公開 API の正本: https://hanamii.jp/docs/public-api.md

ライセンスは MIT です。

統合テストは `HANAMII_TOKEN` 設定時だけ実 API に接続します。未設定ならスキップします。

```bash
HANAMII_TOKEN=... npm run test:integration
```

`...` はプレースホルダーです。`HANAMII_BASE_URL` で接続先を変更できます。
読取テストに加え、`HANAMII_E2E_DEPLOY=1` と `HANAMII_E2E_WORKSPACE`（workspace ID）を設定すると、
fixture の新規デプロイ・ログ・env・再起動・削除を実行します。作成したプロジェクトとリンクは終了時に削除します。
CI では実行しません。
