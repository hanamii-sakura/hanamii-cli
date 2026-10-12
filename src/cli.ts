import { Command } from 'commander'

import { VERSION } from './version.js'

export function buildProgram(): Command {
  const program = new Command()
  program
    .name('hanamii')
    .description('hanamii CLI: 国産 PaaS hanamii にデプロイ・ログ取得・環境変数の設定を行う')
    .version(VERSION, '-v, --version', 'バージョンを表示する')
    .helpOption('-h, --help', 'ヘルプを表示する')
    .showHelpAfterError('(--help で使い方を表示)')
  return program
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const program = buildProgram()
  await program.parseAsync(argv)
}

// bin として直接実行されたときだけ main を走らせる（テストからの import では走らせない）
const invokedDirectly = (() => {
  const entry = process.argv[1]
  if (!entry) return false
  return import.meta.url.endsWith(entry.replace(/\\/g, '/').split('/').slice(-2).join('/'))
})()

if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
