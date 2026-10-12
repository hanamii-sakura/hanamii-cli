import { createRequire } from 'node:module'

import { describe, expect, it } from 'vitest'

import { PACKAGE_NAME, VERSION } from '../../src/version.js'

const require = createRequire(import.meta.url)

describe('version', () => {
  it('package.json の name と version を返す', () => {
    const pkg = require('../../package.json') as { name: string; version: string }
    expect(PACKAGE_NAME).toBe(pkg.name)
    expect(VERSION).toBe(pkg.version)
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/)
  })
})
