/**
 * profile-files.ts — 学生档案的固定栏目文件（纯 Node，零依赖可测）。
 *
 * 与 `memory_*` 分开：记忆是可检索、会占注入预算的条目；这里是**固定栏目**的档案
 * （年级 / 课表 / 作息 / 偏好），只按名字读写，不进检索、不进注入。
 * 每个栏目一个 md 文件，落在 `<DSH_HOME>/profile/<名字>.md`。
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** 允许的固定栏目名；不在表里的名字一律拒绝，避免长出一堆没人用的文件。 */
export const PROFILE_FILES = ['grade', 'schedule', 'rhythm', 'preference'] as const
export type ProfileFileName = (typeof PROFILE_FILES)[number]

/**
 * 解析档案目录。
 * @param home - `DSH_HOME`；缺省时退回 `~/.dsh`。
 * @returns 绝对目录路径。
 */
export function profileDirectory(home: string | undefined = process.env.DSH_HOME): string {
  const root = home !== undefined && home.trim().length > 0 ? home : join(homedir(), '.dsh')
  return join(root, 'profile')
}

/**
 * 判断一个名字是否是固定栏目。
 * @param value - 调用方给的名字。
 * @returns 是则收窄类型。
 */
export function isProfileFileName(value: string): value is ProfileFileName {
  return (PROFILE_FILES as readonly string[]).includes(value)
}

/**
 * 读一个栏目。
 * @param name - 栏目名。
 * @param home - 见 {@link profileDirectory}。
 * @returns 内容；文件不存在时 `undefined`。
 */
export function readProfileFile(name: ProfileFileName, home?: string): string | undefined {
  const file = join(profileDirectory(home), name + '.md')
  if (!existsSync(file)) return undefined
  return readFileSync(file, 'utf8').trim()
}

/**
 * 写一个栏目；空内容等于删掉这一栏。
 * @param name - 栏目名。
 * @param content - 正文；只保留首尾空白之外的内容。
 * @param home - 见 {@link profileDirectory}。
 */
export function writeProfileFile(name: ProfileFileName, content: string, home?: string): void {
  const directory = profileDirectory(home)
  const file = join(directory, name + '.md')
  const text = content.trim()
  if (text.length === 0) {
    if (existsSync(file)) rmSync(file)
    return
  }
  mkdirSync(directory, { recursive: true })
  const temporary = file + '.tmp'
  writeFileSync(temporary, text + '\n')
  renameSync(temporary, file)
}

/**
 * 一次读出全部栏目。
 * @param home - 见 {@link profileDirectory}。
 * @returns 每个栏目名到内容的映射；没填的栏目值为 `undefined`。
 */
export function readProfile(home?: string): Record<ProfileFileName, string | undefined> {
  const result = {} as Record<ProfileFileName, string | undefined>
  for (const name of PROFILE_FILES) result[name] = readProfileFile(name, home)
  return result
}
