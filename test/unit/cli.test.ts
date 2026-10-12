import { describe, expect, it } from 'vitest'

import { buildProgram } from '../../src/cli.js'
import { VERSION } from '../../src/version.js'

describe('hanamii --version', () => {
  it('バージョンを出力して終了する', async () => {
    const program = buildProgram().exitOverride()
    let out = ''
    program.configureOutput({ writeOut: (s) => (out += s) })
    await expect(program.parseAsync(['node', 'hanamii', '--version'])).rejects.toMatchObject({
      code: 'commander.version',
    })
    expect(out.trim()).toBe(VERSION)
  })
})
