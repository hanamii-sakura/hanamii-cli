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

- Node.js 20 以上
- 公開 API の正本: https://hanamii.jp/docs/public-api.md

ライセンスは MIT です。
