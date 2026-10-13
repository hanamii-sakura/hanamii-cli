# hanamii-cli の作業ルール（エージェント向け）

このリポジトリは npm パッケージ `hanamii`（CLI + ローカル stdio MCP サーバー）です。
hanamii の公開 REST API v1 だけを使い、サーバー側（hanamii-frontend）は変更しません。

## 最初に読むもの

1. `REQUIREMENTS.md` — 確定事項と API の前提（ストリーム応答の扱い、エラーコード、終了コードなど）
2. `TASKS.md` — フェーズ別タスク。未完了（`[ ]`）の一番上から着手する
3. `docs/PLAN.md` — ディレクトリ構成・モジュール責務・CLI コマンド・MCP ツールの設計。迷ったらここに従う
4. 参照実装（読み取りのみ）:
   - `../hanamii-skills/skills/hanamii-deploy/scripts/hanamii-deploy.sh` — 置き換え対象の bash 実装。デプロイ手順と終了コードの正本
   - `../hanamii-frontend/docs/public-api/公開API仕様.md` — API の設計書（DB エンドポイントを含む）
   - `../hanamii-frontend/src/server/public-api/http/publicApi.ts` — keep-alive ストリーム応答の実装
   - `../hanamii-frontend/src/app/api/v1/**` — 各エンドポイントの実装（request/response の正確な形）

## 進め方（厳守）

- 一度に進めるタスクは **1 つだけ**。`TASKS.md` の未完了の先頭から順に。
- タスクごとに **テストを書き**、`npm test` / `npm run typecheck` / `npm run lint` を全部通す。通るまで完了にしない。
- 通ったら `TASKS.md` の該当行を `[x]` にし、**タスク 1 つにつき 1 コミット**（日本語の Conventional Commits、例 `feat(config): トークンの保存と優先順位を実装`）。
- `git push` はしない（人がレビューしてから push する）。
- 不明点や要件の矛盾があれば推測せず、その時点で停止して最終メッセージに質問を書く。

## コードの約束

- TypeScript strict、ESM、Node 20 以上で動くこと（`node:` 組み込みと global `fetch` を使う。Node 22 以降専用の API は使わない）
- `src/core/` は CLI と MCP の共通層。**stdout に書かない**（進捗は `onEvent` コールバック）。MCP では stdout はプロトコル専用、ログは `console.error`
- トークン（`hnm_…`）をログ・エラー・`--json` 出力・テストのスナップショットに含めない
- API 応答は必ず「本文を全部読む → 先頭の `{` から `JSON.parse` → `error` キーがあれば HTTP ステータスに関わらずエラー」で扱う（`REQUIREMENTS.md` 参照）
- 依存は `package.json` にあるものを使う。新しい依存を足すときはコミットメッセージに理由を書く
- テストは `test/**/*.test.ts`（vitest）。HTTP は `msw/node` でモック。実 API を叩くテストは `HANAMII_TOKEN` が無ければ skip
- 整形は `npm run format`（prettier）。lint は eslint 9 flat config

## 公開 API の正本

https://hanamii.jp/docs/public-api.md（DB エンドポイントはここに未掲載。設計書 `公開API仕様.md` を見る）
