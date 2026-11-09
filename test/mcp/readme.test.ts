import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'
import { connect } from './helpers.js'
import { INSTRUCTIONS } from '../../src/mcp/server.js'

it('日英READMEとinstructionsに全MCPツールが記載され、削除のopt-inが一致する', async () => {
  const session = await connect({ allowDelete: true })
  const normal = await connect()
  try {
    const names = (await session.client.listTools()).tools.map((t) => t.name).sort()
    const normalNames = (await normal.client.listTools()).tools.map((t) => t.name)
    expect(names.filter((name) => !normalNames.includes(name))).toEqual([
      'db_delete',
      'delete_project',
      'storage_delete_bucket',
      'storage_delete_file',
    ])
    for (const file of ['README.md', 'README.en.md']) {
      const readme = await readFile(new URL(`../../${file}`, import.meta.url), 'utf8')
      const documented = [...readme.matchAll(/^\| `([a-z]+_[a-z_]+)`\s*\|/gm)]
        .map((match) => match[1]!)
        .sort()
      expect(documented, file).toEqual(names)
      expect(readme).toContain('--allow-delete')
      expect(readme).toContain('confirmName')
      expect(readme).toContain('SHA-256')
    }
    for (const name of names) expect(INSTRUCTIONS, name).toContain(name)
    expect(INSTRUCTIONS).toContain('only when the user explicitly requests a new API token')
    expect(INSTRUCTIONS).toContain('metadata stays redacted')
    expect(INSTRUCTIONS).toContain('cannot switch branches')
  } finally {
    await session.close()
    await normal.close()
  }
})
