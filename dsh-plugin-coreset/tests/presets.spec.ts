import { describe, expect, it } from 'vitest'
import { CHAT_PRESET, WORK_PRESET } from '../src/presets.ts'

describe('presets', () => {
  it('starts 做题 in 引导模式 and mounts all three study personas', () => {
    expect(WORK_PRESET.id).toBe('work')
    expect(WORK_PRESET.name).toBe('做题')
    expect(WORK_PRESET.plugins).toEqual([
      { name: 'dsh-plugin-coreset', config: { mode: 'guide' } },
      { name: 'dsh-plugin-guide' },
      { name: 'dsh-plugin-work' },
      { name: 'dsh-plugin-hrl' },
    ])
  })

  it('starts 聊天 with the core alone', () => {
    expect(CHAT_PRESET.id).toBe('chat')
    expect(CHAT_PRESET.name).toBe('聊天')
    expect(CHAT_PRESET.plugins).toEqual([
      { name: 'dsh-plugin-coreset', config: { mode: 'chat' } },
    ])
  })

  it('needs exactly one core per preset: a second complete section throws', () => {
    const cores = (preset: typeof WORK_PRESET) =>
      (preset.plugins ?? []).filter((plugin) => plugin.name === 'dsh-plugin-coreset').length
    expect(cores(WORK_PRESET)).toBe(1)
    expect(cores(CHAT_PRESET)).toBe(1)
  })
})
