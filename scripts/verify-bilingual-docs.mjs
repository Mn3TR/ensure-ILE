import { resolve } from 'node:path'
import { verifyTrackedBilingualRecords } from './bilingual-docs.mjs'

const root = resolve(import.meta.dirname, '..')

try {
  const result = verifyTrackedBilingualRecords(root)
  process.stdout.write(
    `verify-bilingual-docs: ${String(result.recordCount)} records and ${String(result.documentCount)} documents are consistent\n`,
  )
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.stderr.write('Run `yarn docs:record` to re-record the stale hashes.\n')
  process.exitCode = 1
}
