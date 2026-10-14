import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { walk } from '../../src/zip/walk.js'
import { buildZip } from '../../src/zip/build.js'
import { precheck } from '../../src/zip/precheck.js'
let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hanamii-zip-test-'))
  await cp(resolve('test/fixtures/sample-node-app'), dir, { recursive: true })
})
afterEach(() => rm(dir, { recursive: true, force: true }))
const put = async (path: string, text = 'x') => {
  await mkdir(join(dir, path, '..'), { recursive: true })
  await writeFile(join(dir, path), text)
}
it('fixture を列挙・検証し ZIP の実内容を復元でき、cleanup で消える', async () => {
  expect((await walk(dir)).files).toEqual(['package.json', 'server.js'])
  expect(await precheck(dir)).toBe('nodejs')
  const zip = await buildZip(dir)
  try {
    const data = await readFile(zip.zipPath)
    expect(zip.bytes).toBe(data.length)
    expect(zip.fileCount).toBe(2)
    // central directory のサイズ/offset を使い、ZIP の実データを検査する。
    let offset = data.readUInt32LE(data.length - 6)
    const entries: Record<string, string> = {}
    for (let i = 0; i < zip.fileCount; i++) {
      expect(data.readUInt32LE(offset)).toBe(0x02014b50)
      const size = data.readUInt32LE(offset + 20)
      const nameLength = data.readUInt16LE(offset + 28)
      const local = data.readUInt32LE(offset + 42)
      const name = data.subarray(offset + 46, offset + 46 + nameLength).toString()
      const start = local + 30 + data.readUInt16LE(local + 26) + data.readUInt16LE(local + 28)
      entries[name] = inflateRawSync(data.subarray(start, start + size)).toString()
      offset += 46 + nameLength + data.readUInt16LE(offset + 30) + data.readUInt16LE(offset + 32)
    }
    expect(entries['server.js']).toBe(await readFile(join(dir, 'server.js'), 'utf8'))
  } finally {
    await zip.cleanup()
  }
  await expect(readFile(zip.zipPath)).rejects.toMatchObject({ code: 'ENOENT' })
})
it('既定除外、階層別 ignore、否定、symlink を扱い no-gitignore でも秘密を除外する', async () => {
  for (const name of [
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
    '.hanamii',
  ])
    await put(`${name}/file`)
  for (const name of [
    '.DS_Store',
    '.env',
    '.env.local',
    'old.zip',
    'nested/.env.secret',
    'nested/a.zip',
  ])
    await put(name)
  await put('.gitignore', '*.log\n!keep.log\nignored/\n')
  await put('.hanamiiignore', '*.tmp\n!.env\n')
  await put('nested/.gitignore', 'local.txt\n')
  for (const path of ['drop.log', 'keep.log', 'drop.tmp', 'ignored/file', 'nested/local.txt'])
    await put(path)
  await symlink(join(dir, 'server.js'), join(dir, 'link'))
  await symlink(dir, join(dir, 'loop'), 'dir')
  await symlink(join(dir, 'absent'), join(dir, 'broken'))
  const result = await walk(dir)
  expect(result.skipped.symlinks).toBe(3)
  expect(result.files).toEqual([
    '.gitignore',
    '.hanamiiignore',
    'keep.log',
    'nested/.gitignore',
    'package.json',
    'server.js',
  ])
  const unignored = (await walk(dir, { gitignore: false })).files
  expect(unignored).toContain('drop.log')
  expect(unignored).toContain('nested/local.txt')
  expect(unignored).not.toContain('.env')
  expect(unignored).not.toContain('drop.tmp')
})
it.each([
  '{}',
  '{',
  '{"scripts":{"start":"next dev"}}',
  '{"scripts":{"start":"node x"},"devDependencies":{"typescript":"*"}}',
])('Node の不正設定を拒否する: %s', async (text) => {
  await put('package.json', text)
  await expect(precheck(dir)).rejects.toMatchObject({ exitCode: 5 })
})
it('PHP を優先し Dockerfile / EXPOSE / FPM / Laravel を検証する', async () => {
  await put('composer.json', '{}')
  await expect(precheck(dir)).rejects.toThrow('Dockerfile')
  await put('Dockerfile', 'FROM php:8-apache')
  await expect(precheck(dir)).rejects.toThrow('EXPOSE')
  await put('Dockerfile', 'FROM php:8-fpm\nEXPOSE 8080')
  await expect(precheck(dir)).rejects.toThrow('PHP-FPM')
  await put('Dockerfile', 'FROM php:8-apache\nEXPOSE 8080')
  expect(await precheck(dir)).toBe('php')
  await put('composer.json', '{"require":{"laravel/framework":"*"}}')
  await expect(precheck(dir)).rejects.toThrow('public/index.php')
})
it('Python と空/言語不明、ignore 済み manifest を扱う', async () => {
  await rm(join(dir, 'package.json'))
  await expect(precheck(dir)).rejects.toThrow('言語')
  await put('requirements.txt', '')
  expect(await precheck(dir)).toBe('python')
  await put('Pipfile')
  await expect(precheck(dir)).rejects.toThrow('Pipfile')
  await put('.hanamiiignore', '*')
  await expect(precheck(dir)).rejects.toThrow('空')
  await expect(buildZip(dir)).rejects.toThrow('空')
})
