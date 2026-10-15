import { expect, it } from 'vitest'
import { connect } from './helpers.js'
import { INSTRUCTIONS } from '../../src/mcp/server.js'

const words = (text: string | undefined) => (text ?? '').match(/[a-zA-Z][a-zA-Z0-9_-]*/g) ?? []

/**
 * モデル向け文書の品質を保つ（forecall lint の規則に合わせた最低条件）。
 * 説明文は英語の語数で測られるため、日本語だけにしない。
 */
it('全ツールに十分な説明・引数説明・outputSchema があり、instructions が付く', async () => {
  expect(words(INSTRUCTIONS).length).toBeGreaterThan(100)
  expect(INSTRUCTIONS).toContain('deploy_project')
  const s = await connect({ allowDelete: true })
  try {
    const { tools } = await s.client.listTools()
    expect(tools).toHaveLength(14)
    for (const tool of tools) {
      const desc = tool.description ?? ''
      expect(words(desc).length, tool.name).toBeGreaterThanOrEqual(40)
      expect(desc, tool.name).toMatch(/\bUse (it|this|name)\b|\bDo not\b/)
      expect(desc, tool.name).toMatch(/\bReturns?\b/)
      expect(desc, tool.name).toMatch(/\bExample:/)
      expect(tool.outputSchema, tool.name).toBeDefined()
      expect(tool.annotations, tool.name).toBeDefined()
      const props = (tool.inputSchema.properties ?? {}) as Record<string, { description?: string }>
      for (const [name, prop] of Object.entries(props))
        expect(words(prop.description).length, `${tool.name}.${name}`).toBeGreaterThanOrEqual(4)
    }
  } finally {
    await s.close()
  }
})
