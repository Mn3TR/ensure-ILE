/** Mount smoke: the built bank registers its seven tools. */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const directory = mkdtempSync(join(tmpdir(), 'ensure-ile-bank-smoke-'))
try {
  const { apply, name } = await import('../lib/index.js')
  const tools = []
  apply({ tools: { register: (tool) => tools.push(tool) } }, { directory })
  const expected = ['bank_add', 'bank_image', 'bank_list', 'bank_show', 'bank_update', 'bank_resume', 'bank_stats']
  const names = tools.map((tool) => tool.name)
  for (const tool of expected) {
    if (!names.includes(tool)) throw new Error('missing tool ' + tool)
  }
  if (name !== 'plugin-bankmanager') throw new Error('unexpected plugin name ' + name)
  const added = await tools.find((tool) => tool.name === 'bank_add').execute({ statement: 'smoke', subject: 'math' })
  if (!/已建题：/u.test(added)) throw new Error('bank_add did not create a problem: ' + added)
  console.log('verify-bank: ' + String(expected.length) + ' tools registered, bank_add wrote a problem')
} finally {
  rmSync(directory, { recursive: true, force: true })
}
