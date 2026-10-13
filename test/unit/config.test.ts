import { mkdtemp, readFile, rm, stat, writeFile, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { configPath, normalizeBaseUrl } from '../../src/config/paths.js'
import { resolveConfig } from '../../src/config/resolve.js'
import { readConfig, removeToken, saveToken } from '../../src/config/store.js'

let home: string
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'hanamii-config-'))
})
afterEach(async () => {
  await rm(home, { recursive: true, force: true })
})
const base = 'https://hanamii.jp'
const options = () => ({ home, env: {}, platform: 'linux' as const })

describe('設定', () => {
  it('既定・XDG・Windows の保存先を選ぶ', () => {
    expect(configPath(options())).toBe(join(home, '.config/hanamii/config.json'))
    expect(configPath({ ...options(), env: { XDG_CONFIG_HOME: home } })).toBe(
      join(home, 'hanamii/config.json'),
    )
    expect(
      configPath({
        ...options(),
        platform: 'win32',
        env: { APPDATA: home, XDG_CONFIG_HOME: '/ignored' },
      }),
    ).toBe(join(home, 'hanamii/config.json'))
    expect(configPath({ ...options(), platform: 'win32' })).toBe(
      join(home, 'AppData/Roaming/hanamii/config.json'),
    )
  })
  it('未保存は空、flag > env > 接続先ごとの config', async () => {
    expect(await resolveConfig(options())).toEqual({ baseUrl: base })
    await saveToken(`${base}/`, 'saved', options())
    await saveToken('http://localhost:3000', 'local', options())
    expect(await resolveConfig(options())).toEqual({
      baseUrl: base,
      token: 'saved',
      source: 'config',
    })
    const env = { HANAMII_TOKEN: 'environment' }
    expect(await resolveConfig({ ...options(), env })).toMatchObject({
      token: 'environment',
      source: 'env',
    })
    expect(await resolveConfig({ ...options(), env, token: 'flag' })).toMatchObject({
      token: 'flag',
      source: 'flag',
    })
    expect(
      await resolveConfig({ ...options(), env: { HANAMII_BASE_URL: 'http://localhost:3000/' } }),
    ).toMatchObject({ token: 'local' })
    expect(
      await resolveConfig({ ...options(), env: { HANAMII_BASE_URL: 'https://other.example' } }),
    ).toEqual({ baseUrl: 'https://other.example' })
    await removeToken(base, options())
    expect((await readConfig(options())).tokens).toEqual({ 'http://localhost:3000': 'local' })
    await removeToken(base, options())
  })
  it.skipIf(process.platform === 'win32')('新規保存と更新で 0700 / 0600 を保証する', async () => {
    await saveToken(base, 'first', options())
    const path = configPath(options())
    expect((await stat(path)).mode & 0o777).toBe(0o600)
    expect((await stat(dirname(path))).mode & 0o777).toBe(0o700)
    await chmod(path, 0o644)
    await chmod(dirname(path), 0o755)
    await saveToken(base, 'second', options())
    expect((await stat(path)).mode & 0o777).toBe(0o600)
    expect((await stat(dirname(path))).mode & 0o777).toBe(0o700)
    expect(JSON.parse(await readFile(path, 'utf8')).tokens[base]).toBe('second')
  })
  it('壊れた設定は秘密を含まないエラーになり、上書きしない', async () => {
    await saveToken(base, 'first', options())
    await writeFile(configPath(options()), '{invalid-secret')
    await expect(readConfig(options())).rejects.toThrow('設定ファイルの形式が不正です')
    await expect(saveToken(base, 'replacement', options())).rejects.toThrow(
      '設定ファイルの形式が不正です',
    )
    expect(await readFile(configPath(options()), 'utf8')).toBe('{invalid-secret')
    expect(await resolveConfig({ ...options(), token: 'flag' })).toMatchObject({ source: 'flag' })
  })
  it('不正な接続先を秘密を出力せず拒否する', () => {
    for (const value of [
      'secret',
      'ftp://example.com',
      'https://user:secret@example.com',
      'https://example.com?token=secret',
    ]) {
      expect(() => normalizeBaseUrl(value)).toThrow()
    }
  })
})
