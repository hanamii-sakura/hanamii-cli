import { expect, it } from 'vitest'
import { main } from '../../src/cli.js'

it('--help は利用の流れに沿った順でコマンドを表示する', async () => {
  let stdout = ''
  const code = await main(['node', 'hanamii', '--help'], {
    env: {},
    stdout: (text) => {
      stdout += text
    },
  })
  expect(code).toBe(0)
  const commands = [...stdout.matchAll(/^ {2}([a-z][a-z-]*)(?:\s|\[|<)/gm)].map((match) => match[1])
  expect(commands).toEqual([
    'login',
    'logout',
    'whoami',
    'workspaces',
    'deploy',
    'link',
    'unlink',
    'projects',
    'env',
    'logs',
    'restart',
    'health-check',
    'tokens',
    'db',
    'mcp',
    'help',
  ])
})
