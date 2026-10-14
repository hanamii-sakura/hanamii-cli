import { registerTokens } from './cli/commands/tokens.js'
import { registerHealthCheck } from './cli/commands/health-check.js'
import { registerRestart } from './cli/commands/restart.js'
import { registerLogs } from './cli/commands/logs.js'
import { registerEnv } from './cli/commands/env.js'
import { registerProjects } from './cli/commands/projects.js'
import { registerLink } from './cli/commands/link.js'
import { registerDeploy } from './cli/commands/deploy.js'
import { OperationError } from './core/errors.js'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Command, CommanderError } from 'commander'

import { VERSION } from './version.js'
import {
  createContext,
  type CliContext,
  type CliDependencies,
  type GlobalOptions,
} from './cli/context.js'
import { registerLogin } from './cli/commands/login.js'
import { registerLogout } from './cli/commands/logout.js'
import { registerWhoami } from './cli/commands/whoami.js'
import { registerWorkspaces } from './cli/commands/workspaces.js'
import { exitCode } from './cli/output.js'

function createProgram(context: CliContext, quietErrors = false): Command {
  const program = new Command().exitOverride()
  program
    .name('hanamii')
    .description('hanamii CLI: 国産 PaaS hanamii にデプロイ・ログ取得・環境変数の設定を行う')
    .version(VERSION, '-v, --version', 'バージョンを表示する')
    .helpOption('-h, --help', 'ヘルプを表示する')
    .showHelpAfterError('(--help で使い方を表示)')
    .configureHelp({ showGlobalOptions: true })
    .option('--json', 'JSON 形式で出力する')
    .option('--token <token>', 'API トークン（環境変数・設定ファイルより優先）')
    .option('--workspace <id>', 'ワークスペース ID')
    .configureOutput({
      writeOut: context.output.write,
      writeErr: quietErrors ? () => undefined : context.output.error,
    })
  registerEnv(program, context)
  registerLogs(program, context)
  registerRestart(program, context)
  registerHealthCheck(program, context)
  registerTokens(program, context)
  registerProjects(program, context)
  registerLink(program, context)
  registerDeploy(program, context)
  registerLogin(program, context)
  registerLogout(program, context)
  registerWhoami(program, context)
  registerWorkspaces(program, context)
  return program
}

export function buildProgram(deps: CliDependencies = {}): Command {
  return createProgram(createContext(deps))
}

export async function main(
  argv: string[] = process.argv,
  deps: CliDependencies = {},
): Promise<number> {
  const context = createContext(deps)
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--token') context.output.remember(argv[i + 1])
    if (argv[i]?.startsWith('--token=')) context.output.remember(argv[i]?.slice('--token='.length))
  }
  const program = createProgram(context, true)
  // Commander のエラーも他の失敗と同じ出力・終了コードにまとめる。
  try {
    await program.parseAsync(argv)
    return 0
  } catch (error) {
    if (error instanceof CommanderError && error.exitCode === 0) return 0
    const code = error instanceof CommanderError ? 2 : exitCode(error)
    const message = error instanceof Error ? error.message : '処理に失敗しました'
    const json = program.opts<GlobalOptions>().json || argv.includes('--json')
    const body = {
      error: {
        message,
        exitCode: code,
        ...(error instanceof OperationError && error.details ? { details: error.details } : {}),
      },
    }
    context.output.error(`${json ? JSON.stringify(body) : message}\n`)
    return code
  }
}

const invokedDirectly = (() => {
  try {
    return (
      Boolean(process.argv[1]) &&
      realpathSync(process.argv[1]!) === realpathSync(fileURLToPath(import.meta.url))
    )
  } catch {
    return false
  }
})()
if (invokedDirectly) {
  void main().then((code) => {
    process.exitCode = code
  })
}
