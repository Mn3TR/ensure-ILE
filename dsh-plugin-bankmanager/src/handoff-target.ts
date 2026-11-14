/** A handoff selects a mode inside a preset; study modes all belong to Work. */
export function handoffMode(mode: string | undefined): string | undefined {
  const key = mode?.trim().toLowerCase()
  if (key === 'guide' || key === '引导模式') return 'guide'
  if (key === 'work' || key === '独立做题') return 'work'
  if (key === 'hrl' || key === '答案优化') return 'hrl'
  if (key === 'chat' || key === '聊天') return 'chat'
  if (key === 'setup' || key === '开学') return 'setup'
  return undefined
}

export function presetForMode(mode: string | undefined): string | undefined {
  const target = handoffMode(mode)
  if (target === 'guide' || target === 'work' || target === 'hrl') return 'work'
  return target
}
