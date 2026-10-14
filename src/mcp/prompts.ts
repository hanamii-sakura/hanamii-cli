import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
export function registerPrompts(server: McpServer) {
  server.registerPrompt(
    'deploy_app',
    { description: '事前確認からデプロイと失敗調査までの手順' },
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              '1. 事前確認: 対象ディレクトリ、起動コマンド、必要な環境変数を確認する。list_workspaces / list_projects / get_project で対象を確認し、新規作成の name または既存の project を選ぶ。対象が曖昧ならユーザーに確認する。トークンや秘密値を表示しない。',
              '2. deploy_project に dir と対象・必要な envs を指定する。通常は wait=true。wait=false なら返却された projectId で wait_deployment を呼ぶ。',
              '3. 失敗時は返却された check.errors / errorCode を確認し、projectId がある場合は get_logs を呼んで調査する。作成前に失敗して projectId がない場合は事前検証・check のエラーを修正する。',
            ].join('\n'),
          },
        },
      ],
    }),
  )
}
