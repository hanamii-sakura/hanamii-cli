import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { walk, type WalkResult } from './walk.js'

export class PrecheckError extends Error {
  readonly exitCode = 5
}
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

export async function precheck(
  dir: string,
  listing?: WalkResult,
): Promise<'php' | 'nodejs' | 'python'> {
  const { files } = listing ?? (await walk(dir))
  const has = (file: string) => files.includes(file)
  const fail = (message: string): never => {
    throw new PrecheckError(message)
  }
  async function json(file: string) {
    try {
      return object(JSON.parse(await readFile(join(dir, file), 'utf8')))
    } catch {
      return fail(`${file} が正しいJSON形式ではありません`)
    }
  }
  if (!files.length) fail('ZIPファイルが空です')
  if (has('composer.json')) {
    const composer = await json('composer.json')
    if (!has('Dockerfile')) fail('PHPプロジェクトには Dockerfile が必要です')
    const docker = await readFile(join(dir, 'Dockerfile'), 'utf8')
    if (/FROM\s+php:\S*-fpm/i.test(docker) && !/nginx|apache|supervisor|caddy/i.test(docker))
      fail('PHP-FPM単体ではデプロイできません。HTTPサーバーが必要です')
    if (!/^EXPOSE\s+(\d+)/m.test(docker)) fail('Dockerfile に EXPOSE が必要です')
    if (object(composer.require)['laravel/framework'] && !has('public/index.php'))
      fail('Laravel プロジェクトに public/index.php がありません')
    return 'php'
  }
  if (has('package.json')) {
    const pkg = await json('package.json')
    const start = object(pkg.scripts).start
    if (typeof start !== 'string' || !start.trim())
      fail('package.json に scripts.start がありません')
    if ((start as string).includes('dev'))
      fail('scripts.start が開発用コマンドです。本番用にしてください')
    const deps = { ...object(pkg.dependencies), ...object(pkg.devDependencies) }
    if (deps.typescript && !deps['@types/node'])
      fail('TypeScriptプロジェクトに @types/node がありません')
    return 'nodejs'
  }
  if (has('requirements.txt') || has('pyproject.toml')) {
    if (has('Pipfile') || has('Pipfile.lock'))
      fail('Pipfile/Pipfile.lock は未対応です。requirements.txt を使用してください')
    return 'python'
  }
  return fail(
    '言語を判定するファイルがありません（composer.json / package.json / requirements.txt / pyproject.toml）',
  )
}
