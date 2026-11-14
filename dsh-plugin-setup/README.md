# dsh-plugin-setup

开学对话（mode id `setup`，预设 id `setup`「开学」）：第一次见面把年级、课表、作息、解题偏好问清楚，然后给出一个下一步——这个会话不做题。

## 什么时候用

第一次启动之后。**入学办完就把自己从预设选单里摘掉**：预设由本包的 `./presets` 条件注册，`<DSH_HOME>/setup.json` 的 `onboarding: done` 之后启动，登记的那一步就不执行（registry 没有 hidden 字段，「不注册」就是消失）。

| 项 | 值 |
|---|---|
| 预设 id | `setup`（`src/presets.ts` 的 `SETUP_PRESET`，`order: 30`） |
| 显示名 | Setup |
| 默认预设 | 否，默认 Work（`work`），会话内从引导模式开始 |
| 可切换 | **否**（`switchable: false`）：`setup_read` / `setup_update` 只挂在开学预设里，别处切进来会让模型调用不存在的工具 |

人格 = commons 的 `common` **一段** + `prompts/setup.md`——开学会话不进题，所以不拼 `bank`。提示段本身由 `dsh-plugin-coreset` 渲染，本包注册的是这段文本加两个工具。

| 工具 | 用途 | 关键参数 |
|---|---|---|
| `setup_read` | 读进度（换会话/中断后接着问） | 无参数 |
| `setup_update` | 字段级写进度并同步学生档案 | `onboarding`（`pending`/`done`）、`grade`、`schedule`、`rhythm`、`preference`、`next`（下一步做什么） |

**完成判据是「能说出下一步」**（`next` 有内容），不是四样问齐。问完就撒手等于没收尾。

## 数据落在哪

进度保存在 `<DSH_HOME>/setup.json`（`DSH_HOME` 没设时退 `process.cwd()`；桌面壳里就是数据根的 `home`）。`Config` 可覆盖 `promptFile` 与 `stateFile`；`./presets` 那一行同样收 `stateFile`。

四项情况同时通过 `dsh-plugin-memory/profile` 写入 `<DSH_HOME>/profile/{grade,schedule,rhythm,preference}.md`，与后续 `profile_read` 读的是同一份档案。档案目录沿用 memory 的解析规则（未设置 `DSH_HOME` 时为 `~/.dsh/profile`），不随自定义 `stateFile` 搬动。

```json
{
  "schema": 1,
  "onboarding": "pending",
  "got": { "grade": "高一", "schedule": "周一到周五…", "rhythm": "…", "preference": "…" },
  "next": "明天先做一道函数题",
  "updatedAt": "2026-10-25T00:00:00.000Z"
}
```

- 各文件通过临时文件再 `rename` 原子写入；先保存档案，再提交开学进度，档案写入失败不会标记完成。多文件之间没有事务。
- 显式提交的字段更新对应档案；以前收集的字段仅补齐尚不存在的栏目，保留后续完善过的内容。尚未得到的信息不传，旧占位「未填」跳过。
- 预设初始化时也补齐旧记录的缺失档案，包括已经完成的开学记录；保持完成状态和后续编辑的档案内容。
- 文件坏了（不是合法 JSON）退回 `pending` 空记录，工具与注册判断都不抛栈。

## 和邻居的关系

- `dsh-plugin-coreset` 提供 `ileModes` 服务、提示段与 `read_note`；开学预设的 plugins 是 `[coreset{mode:'setup'}, dsh-plugin-setup]`。
- `dsh-plugin-memory/profile` 是纯文件读写子路径，供 Setup 与后续模式复用同一份学生档案；开学预设仍然只注册两个开学工具。
- 不碰题库和结构化课表；学生口述课表先保存到档案的 `schedule.md`，需要计划时再通过 `schedule_*` 建立课表。
- 与 chat / work 的区别：那两个处理具体的一道题，这个只处理「学生是谁」。

## 测试与构建

```bash
corepack yarn workspace dsh-plugin-setup typecheck
corepack yarn workspace dsh-plugin-setup test
corepack yarn workspace dsh-plugin-setup build
```

`build` = `tsc -p tsconfig.json` + `tsdown`（两个入口：`index` 与 `presets`）；`lib/` 是入库的构建产物，改完源码要一起提交。

## 已知限制

- 进度是「字段级」但**不校验内容**：`grade` 写「不知道」也能存。
- 摘掉预设只在启动时判断一次：本次启动里刚写 `done`，选单里仍然在，重启后才消失。
- 档案已与开学信息同步；结构化课表尚不自动生成。
- 旧会话的 `meta.agentPreset: setup` 在预设被摘掉后无法恢复。

## 不做什么

- 不出题、不引导、不判卷——开学只问人，不做题。
- 不问分数、不问排名、不问家里的事（写在 `prompts/setup.md` 里）。
- 不接管配置：改年级/课表是重新开一次开学会话，不是改系统设置。
