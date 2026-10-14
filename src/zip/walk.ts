import { lstat, readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import ignore, { type Ignore } from 'ignore'

export interface WalkOptions {
  gitignore?: boolean
}
export interface WalkResult {
  dir: string
  files: string[]
  skipped: { symlinks: number }
}
const defaults = ignore().add([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'vendor',
  '__pycache__',
  '.venv',
  'venv',
  '__MACOSX',
  '.DS_Store',
  '.env*',
  '.hanamii/',
  '*.zip',
])
type Rules = { base: string; matcher: Ignore }

/** 各階層の ignore を適用する。既定除外は否定パターンでも解除しない。 */
export async function walk(dir: string, options: WalkOptions = {}): Promise<WalkResult> {
  const root = resolve(dir)
  if (!(await lstat(root)).isDirectory())
    throw new Error('デプロイ対象はディレクトリを指定してください')
  const result: WalkResult = { dir: root, files: [], skipped: { symlinks: 0 } }
  async function rules(base: string, name: string): Promise<Rules[]> {
    const path = join(root, base, name)
    try {
      if (!(await lstat(path)).isFile()) return []
      return [{ base, matcher: ignore().add(await readFile(path, 'utf8')) }]
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }
  function ignored(path: string, chain: Rules[]) {
    let excluded = false
    for (const rule of chain) {
      const local = rule.base ? path.slice(rule.base.length + 1) : path
      const match = rule.matcher.test(local)
      if (match.ignored) excluded = true
      if (match.unignored) excluded = false
    }
    return excluded
  }
  async function visit(base: string, git: Rules[], hanamii: Rules[]) {
    const gitRules = [
      ...git,
      ...(options.gitignore === false ? [] : await rules(base, '.gitignore')),
    ]
    const hanamiiRules = [...hanamii, ...(await rules(base, '.hanamiiignore'))]
    for (const name of (await readdir(join(root, base))).sort()) {
      const path = base ? `${base}/${name}` : name
      const info = await lstat(join(root, path))
      if (info.isSymbolicLink()) {
        result.skipped.symlinks++
        continue
      }
      const candidate = info.isDirectory() ? `${path}/` : path
      if (
        defaults.ignores(candidate) ||
        ignored(candidate, gitRules) ||
        ignored(candidate, hanamiiRules)
      )
        continue
      if (info.isDirectory()) await visit(path, gitRules, hanamiiRules)
      else if (info.isFile()) result.files.push(path)
    }
  }
  await visit('', [], [])
  return result
}
