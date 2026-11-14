import { describe, expect, it } from 'vitest'
import { appendPluginRecord, Session, SessionId } from '@deepseek-ai/dsh-session'
import { ileProjectionDefinition as projection } from '../src/mode-state.ts'
import type { IleModeEvent } from '../src/types.ts'

function apply(state: ReturnType<typeof projection.init>, type: 'plugin:ile/mode' | 'plugin:ile/switch-requested', data: IleModeEvent) {
  const session = Session.create(SessionId('mode-test'))
  const seq = appendPluginRecord(session, type, data)
  const event = session.eventAt(seq)
  if (event === undefined) throw new Error('Missing committed plugin record')
  return projection.apply(state, event)
}

describe('durable mode switch', () => {
  it('replays an acknowledged request after restart without changing the current mode', () => {
    const requested = { mode: 'hrl', summary: '从第二步接着优化' }
    let replayed = apply(projection.init(), 'plugin:ile/mode', { mode: 'guide', summary: null })
    replayed = apply(replayed, 'plugin:ile/switch-requested', requested)
    expect(replayed.mode).toBe('guide')
    expect(replayed.pending).toEqual(requested)
    expect(projection.stateSchema.parse(JSON.parse(JSON.stringify(replayed)))).toEqual(replayed)
    expect(projection.wire.view(replayed)).toEqual({ mode: 'guide', summary: null })
  })

  it('clears an intent only when the new mode is committed, including on replay', () => {
    const requested = { mode: 'work', summary: '交给学生自己做' }
    const pending = apply(projection.init(), 'plugin:ile/switch-requested', requested)
    const committed = apply(pending, 'plugin:ile/mode', requested)
    expect(committed).toEqual({ ...requested, pending: null })
  })

  it('keeps the most recent requested switch and still folds legacy in-memory events', () => {
    let replayed = projection.apply(projection.init(), { type: 'ile/mode', data: { mode: 'guide', summary: null } } as never)
    expect(replayed.pending).toBeNull()
    replayed = apply(replayed, 'plugin:ile/switch-requested', { mode: 'work', summary: '第一次' })
    replayed = apply(replayed, 'plugin:ile/switch-requested', { mode: 'hrl', summary: '最后一次' })
    expect(replayed.pending).toEqual({ mode: 'hrl', summary: '最后一次' })
  })

  it('uses ignorable plugin records that survive actual Session serialization and restoration', () => {
    const session = Session.create(SessionId('restore-test'))
    appendPluginRecord(session, 'plugin:ile/mode', { mode: 'guide', summary: null })
    appendPluginRecord(session, 'plugin:ile/switch-requested', { mode: 'work', summary: '重启后继续' })
    const seed = JSON.parse(JSON.stringify(session.snapshotEvents()))
    expect(seed.every((event: { ignorable?: boolean }) => event.ignorable === true)).toBe(true)
    const restored = Session.create(session.id, seed)
    const replayed = restored.snapshotEvents().reduce((state, event) => projection.apply(state, event), projection.init())
    expect(replayed).toEqual({ mode: 'guide', summary: null, pending: { mode: 'work', summary: '重启后继续' } })
  })
})
