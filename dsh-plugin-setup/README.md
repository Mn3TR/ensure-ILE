# dsh-plugin-setup

开学对话（mode id `setup`，预设 id `setup`「开学」）：第一次见面把年级、课表、作息、解题偏好问清楚，然后给出一个下一步——这个会话不做题。

## 什么时候用

第一次启动之后。**入学办完就把自己从预设选单里摘掉**：预设由本包的 `./presets` 条件注册，`<DSH_HOME>/setup.json` 的 `onboarding: done` 之后启动，登记的那一步就不执行（registry 没有 hidden 字段，「不注册」就是消失）。

| 项 | 值 |
|---|---|
| 预设 id | `setup`（`src/presets.ts` 的 `SETUP_PRESET`，`order: 30`） |
| 显示名 | 开学 |
| 默认预设 | 不是——默认是「做题」（`work`） |
| 可切换 | **否**（`switchable: false`）：`setup_read` / `setup_update` 只挂在开学预设里，别处切进来会让模型调用不存在的工具 |

人格 = commons 的 `common` **一段** + `prompts/setup.md`——开学会话不进题，所以不拼 `bank`。提示段本身由 `dsh-plugin-coreset` 渲染，本包注册的是这段文本加两个工具。

| 工具 | 用途 | 关键参数 |
|---|---|---|
| `setup_read` | 读进度（换会话/中断后接着问） | 无参数 |
| `setup_update` | 字段级写进度 | `onboarding`（`pending`/`done`）、`grade`、`schedule`、`rhythm`、`preference`、`next`（下一步做什么） |

**完成判据是「能说出下一步」**（`next` 有内容），不是四样问齐。问完就撒手等于没收尾。

## 数据落在哪

一个文件：`<DSH_HOME>/setup.json`（`DSH_HOME` 没设时退 `process.cwd()`；桌面壳里就是数据根的 `home`）。`Config` 可覆盖 `promptFile` 与 `stateFile`；`./presets` 那一行同样收 `stateFile`。

```json
{
  "schema": 1,
  "onboarding": "pending",
  "got": { "grade": "高一", "schedule": "周一到周五…", "rhythm": "…", "preference": "…" },
  "next": "明天先做一道函数题",
  "updatedAt": "2026-10-25T00:00:00.000Z"
}
```

- 写入是原子的：先写 `setup.json.tmp` 再 `rename`。
- 文件坏了（不是合法 JSON）退回 `pending` 空记录，工具与注册判断都不抛栈。

## 和邻居的关系

- `dsh-plugin-coreset` 提供 `ileModes` 服务、提示段与 `read_note`；开学预设的 plugins 是 `[coreset{mode:'setup'}, dsh-plugin-setup]`。
- 不碰题库、不碰课表：开学的答案只落在 `setup.json`，**目前没有插件读它**——想让它生效得由人（或后续版本）搬进 `schedule_*`。
- 与 chat / work 的区别：那两个处理具体的一道题，这个只处理「学生是谁」。

## 测试与构建

```bash
corepack yarn workspace dsh-plugin-setup typecheck
corepack yarn workspace dsh-plugin-setup test     # 11 个用例（state 7 + presets 4）
corepack yarn workspace dsh-plugin-setup build
```

`build` = `tsc -p tsconfig.json` + `tsdown`（两个入口：`index` 与 `presets`）；`lib/` 是入库的构建产物，改完源码要一起提交。

## 已知限制

- 进度是「字段级」但**不校验内容**：`grade` 写「不知道」也能存。
- 摘掉预设只在启动时判断一次：本次启动里刚写 `done`，选单里仍然在，重启后才消失。
- `setup.json` 与课表/记忆各存一份，三处没有同步机制。
- 旧会话的 `meta.agentPreset: setup` 在预设被摘掉后无法恢复。

## 不做什么

- 不出题、不引导、不判卷——开学只问人，不做题。
- 不问分数、不问排名、不问家里的事（写在 `prompts/setup.md` 里）。
- 不接管配置：改年级/课表是重新开一次开学会话，不是改系统设置。
