import { describe, expect, it } from 'vitest'
import { CHAT_PRESET, WORK_PRESET } from '../src/presets.ts'

/** The row shape these tests read; `config` holds the nested rows of a group. */
interface Row {
  id?: string
  name: string
  group?: boolean
  isolate?: Record<string, boolean>
  config?: unknown
}

const top = (preset: { plugins: readonly unknown[] }): Row[] => preset.plugins as Row[]

/** Every row of a preset with groups flattened to their children, in order. */
const rows = (list: readonly Row[]): Row[] =>
  list.flatMap((row) => (row.group === true ? rows(row.config as Row[]) : [row]))

const names = (preset: { plugins: readonly unknown[] }) => rows(top(preset)).map((row) => row.name)

describe('presets', () => {
  it('starts 做题 in 引导模式 and mounts all three study personas', () => {
    expect(WORK_PRESET.id).toBe('work')
    expect(WORK_PRESET.name).toBe('Work')
    expect(names(WORK_PRESET)).toEqual([
      'dsh-plugin-coreset',
      'dsh-plugin-guide',
      'dsh-plugin-work',
      'dsh-plugin-hrl',
    ])
    expect(rows(top(WORK_PRESET))[0].config).toEqual({ mode: 'guide' })
  })

  it('starts 聊天 with the core alone', () => {
    expect(CHAT_PRESET.id).toBe('chat')
    expect(CHAT_PRESET.name).toBe('Chat')
    expect(names(CHAT_PRESET)).toEqual(['dsh-plugin-coreset'])
    expect(rows(top(CHAT_PRESET))[0].config).toEqual({ mode: 'chat' })
  })

  /* Without the realm the core publishes `ileModes` into the root realm, the
     second preset's core collides with the first at construction, and the
     registry rejects every preset with "Preset services require isolate realms"
     (agent-preset-registry/src/mount.ts, `leakedServices`). */
  it('keeps the core and its personas in one ileModes realm', () => {
    for (const preset of [WORK_PRESET, CHAT_PRESET]) {
      expect(top(preset)).toHaveLength(1)
      const [group] = top(preset)
      expect(group.group).toBe(true)
      expect(group.isolate).toEqual({ ileModes: true })
    }
  })

  it('needs exactly one core per preset: a second complete section throws', () => {
    const cores = (preset: { plugins: readonly unknown[] }) =>
      rows(top(preset)).filter((row) => row.name === 'dsh-plugin-coreset').length
    expect(cores(WORK_PRESET)).toBe(1)
    expect(cores(CHAT_PRESET)).toBe(1)
  })
})
