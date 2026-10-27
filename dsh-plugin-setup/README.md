# dsh-plugin-setup

开学对话的预设包（`setup`「开学」）：第一次见面把年级、课表、作息、解题偏好问清楚，然后给出一个下一步——这个会话不做题。

## 什么时候用

| 项 | 值 |
|---|---|
| 预设 id | `setup` |
| 显示名 | 开学（`cordis.patch.yml` 的 `setup-preset`，`order: 30`） |
| 默认预设 | 不是——默认始终是 `guide`；想重过一遍开学问话时在空会话里选「开学」 |

系统提示 = commons 的 `common` **一段** + 本包 `prompts/setup.md`（`src/index.ts:66`，`composePrompt(['common'], …)`）——开学会话不进题，所以不拼 `bank`。

| 工具 | 用途 | 关键参数 |
|---|---|---|
| `setup_read` | 读进度（换会话/中断后接着问） | 无参数 |
| `setup_update` | 字段级写进度 | `onboarding`（`pending`/`done`）、`grade`、`schedule`、`rhythm`、`preference`、`next`（下一步做什么） |

**完成判据是「能说出下一步」**（`next` 有内容），不是四样问齐。问完就撒手等于没收尾。

## 数据落在哪

一个文件：`<DSH_HOME>/setup.json`（`DSH_HOME` 没设时退 `process.cwd()`；桌面壳里就是数据根的 `home`）。`Config` 可覆盖 `promptFile` 与 `stateFile`。

```json
{
  "schema": 1,
  "onboarding": "pending",
  "got": { "grade": "高一", "schedule": "周一到周五…", "rhythm": "…", "preference": "…" },
  "next": "明天先做一道函数题",
  "updatedAt": "2026-10-25T00:00:00.000Z"
}
```

- `schema`: 1；`onboarding` 只有 `pending` / `done`；`got` 就是那四样，缺就是空串。
- 写入是原子的：先写 `setup.json.tmp` 再 `rename`。
- 文件坏了（不是合法 JSON）退回 `pending` 空记录，工具不抛栈。

## 和邻居的关系

- **依赖** `dsh-plugin-teaching-commons`（只要 `common`）。
- 不碰题库、不碰课表插件：开学的答案只落在 `setup.json`，**目前没有任何插件读它**——想让它生效得由人（或在后续版本里）搬进 `schedule_*`。
- 与 guide / work / hrl 的区别：那三个处理具体的一道题，这个只处理「学生是谁」。

## 测试与构建

```bash
corepack yarn workspace dsh-plugin-setup typecheck
corepack yarn workspace dsh-plugin-setup test     # 7 个用例（tests/state.spec.ts）
corepack yarn workspace dsh-plugin-setup build
```

`build` = `tsc -p tsconfig.json` + `tsdown`；`lib/` 是入库的构建产物，改完源码要一起提交。

## 已知限制

- 进度是「字段级」但**不校验内容**：`grade` 写「不知道」也能存，`rhythm` 长什么样由模型决定。
- `setup.json` 与课表/记忆各存一份，三处没有同步机制（见上一节的「没人读它」）。
- 完成判据靠模型自己判断 `next` 该不该写，代码只提供字段。
- 没有「首次启动自动进 setup」：数据根的 profile 种下来时默认预设仍是 `guide`。

## 不做什么

- 不出题、不引导、不判卷——开学只问人，不做题。
- 不问分数、不问排名、不问家里的事（写在 `prompts/setup.md` 里）。
- 不接管配置：改年级/课表是重新开一次开学会话，不是改系统设置。
