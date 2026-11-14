import { z } from 'zod'
import { pluginRecordOf } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { IleUnitState } from './types.ts'

const modeSchema = z.object({ mode: z.string(), summary: z.string().nullable() }).strict()

/** Both completed switches and acknowledged pending intents replay from the log. */
export const ileProjectionDefinition = {
  key: 'ile',
  stateVersion: 2,
  stateSchema: modeSchema.extend({ pending: modeSchema.nullable() }).strict(),
  init: (): IleUnitState => ({ mode: '', summary: null, pending: null }),
  apply: (state, event) => {
    if (event.type === 'ile/mode') return { ...event.data, pending: null }
    const record = pluginRecordOf(event)
    if (record?.type !== 'plugin:ile/switch-requested' && record?.type !== 'plugin:ile/mode') return state
    // Plugin records are opaque to the host; validate owned payloads on replay.
    const parsed = modeSchema.safeParse(record.data)
    if (!parsed.success) return state
    return record.type === 'plugin:ile/switch-requested'
      ? { ...state, pending: parsed.data }
      : { ...parsed.data, pending: null }
  },
  wire: {
    viewSchema: modeSchema,
    view: (state) => ({ mode: state.mode, summary: state.summary }),
  },
} satisfies ProjectionDefinition<'ile', IleUnitState>
