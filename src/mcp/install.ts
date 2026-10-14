import { spawn } from 'node:child_process'
export type InstallClient = 'claude-code' | 'cursor' | 'codex' | 'claude-desktop'
export const installClients: InstallClient[] = ['claude-code', 'cursor', 'codex', 'claude-desktop']
export function installSnippet(client: InstallClient): string {
  if (client === 'codex')
    return [
      '# ~/.codex/config.toml',
      '# Codex 起動前に HANAMII_TOKEN を環境変数に設定してください。',
      '[mcp_servers.hanamii]',
      'command = "npx"',
      'args = ["-y", "hanamii", "mcp"]',
      'env_vars = ["HANAMII_TOKEN"]',
    ].join('\n')
  const config = JSON.stringify(
    {
      mcpServers: {
        hanamii: {
          command: 'npx',
          args: ['-y', 'hanamii', 'mcp'],
          env: { HANAMII_TOKEN: '<YOUR_HANAMII_TOKEN>' },
        },
      },
    },
    null,
    2,
  )
  const location = {
    'claude-code': '.mcp.json',
    cursor: '.cursor/mcp.json',
    'claude-desktop': 'claude_desktop_config.json',
  }[client]
  return (
    `${location} に以下を追加し、<YOUR_HANAMII_TOKEN> を手元で置き換えてください。\n${config}` +
    (client === 'claude-code'
      ? '\n登録コマンド: claude mcp add hanamii -- npx -y hanamii mcp\n--run はこのコマンドを実行します。利用時は Claude Code に HANAMII_TOKEN を渡すか、hanamii login を実行してください。'
      : '')
  )
}
export type InstallRunner = (
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
) => Promise<void>
export const runInstall: InstallRunner = (command, args, env) =>
  new Promise((resolve, reject) => {
    // 子プロセスが認証情報を出力しても端末へ流さない。shell は使わない。
    const child = spawn(command, args, { env, stdio: 'ignore' })
    child.once('error', () =>
      reject(new Error('claude を起動できません。Claude Code のインストールを確認してください')),
    )
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error('Claude Code への MCP 登録に失敗しました')),
    )
  })
