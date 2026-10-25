import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  PROFILE_FILES,
  isProfileFileName,
  profileDirectory,
  readProfile,
  readProfileFile,
  writeProfileFile,
} from '../src/profile-files.ts'

const roots: string[] = []
function home(): string {
  const root = mkdtempSync(join(tmpdir(), 'ensure-ile-profile-'))
  roots.push(root)
  return root
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('profile files', () => {
  it('writes one column and reads it back', () => {
    const root = home()
    writeProfileFile('schedule', '周一到周五上课，晚自习到九点半', root)
    expect(readProfileFile('schedule', root)).toBe('周一到周五上课，晚自习到九点半')
    expect(readFileSync(join(profileDirectory(root), 'schedule.md'), 'utf8').trim()).toBe('周一到周五上课，晚自习到九点半')
  })

  it('treats empty content as deleting the column', () => {
    const root = home()
    writeProfileFile('grade', '高一', root)
    writeProfileFile('grade', '   ', root)
    expect(readProfileFile('grade', root)).toBeUndefined()
    expect(existsSync(join(profileDirectory(root), 'grade.md'))).toBe(false)
  })

  it('reads every column at once with missing ones undefined', () => {
    const root = home()
    writeProfileFile('preference', '喜欢先画图', root)
    const all = readProfile(root)
    expect(all.preference).toBe('喜欢先画图')
    expect(all.grade).toBeUndefined()
    expect(Object.keys(all).sort()).toEqual([...PROFILE_FILES].sort())
  })

  it('only accepts the fixed column names', () => {
    expect(isProfileFileName('schedule')).toBe(true)
    expect(isProfileFileName('favourite-color')).toBe(false)
  })
})
