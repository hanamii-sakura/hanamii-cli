import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { buildProgram, main } from '../../src/cli.js'

describe.each(['README.md', 'README.en.md'])('%s', (filename) => {
  it('コマンド表の全コマンドが help に存在し、全トップレベルコマンドを網羅する', async () => {
    const readme = await readFile(new URL(`../../${filename}`, import.meta.url), 'utf8')
    const entries = [...readme.matchAll(/^\| `hanamii ([^`]+)`/gm)].map((match) => match[1]!)
    expect(entries.length).toBeGreaterThan(0)
    let stdout = ''
    expect(
      await main(['node', 'hanamii', '--help'], {
        env: {},
        stdout: (text) => {
          stdout += text
        },
      }),
    ).toBe(0)
    const helpCommands = [...stdout.matchAll(/^ {2}([a-z][a-z-]*)(?:\s|\[|<)/gm)]
      .map((match) => match[1]!)
      .filter((name) => name !== 'help')
    const documented = [...new Set(entries.map((entry) => entry.split(' ')[0]!))]
    expect(documented).toEqual(helpCommands)
    // サブコマンドの誤記も検出する。引数プレースホルダーは除く。
    const program = buildProgram({ env: {} })
    for (const entry of entries) {
      let command = program
      for (const name of entry.split(' ').filter((part) => !part.startsWith('<'))) {
        const child = command.commands.find((candidate) => candidate.name() === name)
        expect(child, `${filename}: ${entry}`).toBeDefined()
        command = child!
      }
    }
  })
})
