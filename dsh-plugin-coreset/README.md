# dsh-plugin-coreset

一个会话的「核」：唯一的 `complete` 提示段、模式注册表、会话内换模式（`context_switch`），以及切换时那次历史折叠。guide / work / hrl / setup 四个人格包只登记自己的文本，共享的东西都在这儿。

## 为什么需要它

三个硬约束把共享件逼到了同一个包里：

- **一个 scope 只能有一条 `complete` 提示段**（`system-prompt` 装配两条同时生效直接抛 `multiple complete prompt sections are active`）。四个人格挂进同一个预设，段落就只能有一份。
- **一个 scope 里同名工具只能注册一次**（`tool "read_note" is already registered in this scope`）。原来 guide / work / hrl 各自注册 `read_note`，合并预设时立刻抛。
- **工具集只能加不能减**（DeepSeek flash 的 `toolUpdate: 'addition-only'`）。所以换模式不换工具——工具永远是预设里的并集，换的只有提示段文本。

于是：**预设负责组队，模式负责姿态**。一个预设挂一个核心，核心拿着「当前模式」这个会话状态。

## 它注册了什么

| 东西 | 名字 | 说明 |
|---|---|---|
| 提示段 | `ile`（`order: 0`、`complete`） | 当前模式的人格 + 末尾「## 切换模式」脚注；`text: (context) => renderSection(context.agent.session)` |
| 运行时上下文 | 关掉 | `suppressRuntimeContext()`；上游 `working-directory:current` 是 `required` 删不掉，用同名空 context（`interpolate: false`、`text: ''`）遮蔽 |
| 服务 | `ctx.ileModes` | `registerMode()` / `switchableModes()` / `startMode` / `loggedMode()` / `effectiveMode()` |
| 工具 | `read_note` | 委托 `dsh-plugin-teaching-commons.readNote`（`math` / `arts`） |
| 工具 | `context_switch` | `to` + `summary`，只记意图 |
| 事件 | `ile/mode` | log-only，`{ mode, summary }`；重启后靠它恢复模式 |
| 投影 | `ile`（`stateVersion: 1`） | 把 `ile/mode` 投成 `{ mode, summary }` |
| 监听 | `agent/pre-step` | 在 turn 边界执行折叠 |

## `context_switch` 的语义

- `to` 必须是 `switchable` 的模式（开学不是：它的两个工具只挂在开学预设里）；`summary` 不能空——它同时是给下一个模式的交接词。
- 工具**只置一个待办意图**（每会话一份），不改历史、不动工具表。返回「已安排切到「X」：学生下一次开口时…这一轮还没说完的话，现在说完」。
- 落到历史发生在**学生下一次开口的第一个 pre-step**（`step === 1`；`step !== 1` 一律放过，否则会把进行中的 tool call 折掉、留下没有 result 的孤儿）。
- 落的方式：先 `append('ile/mode')`，再追加一条 `user/message`——正文是交接通知（`【交接】从「引导模式」换到「独立做题」。…`），`source.kind = 'ile-handoff'`，`surfaceOp` 是 `replace(nodes[1] … nodes.at(-1))`，`sourceEventSeqs` 列出被折掉的每个节点。**node 0 不碰**：runtime 在 surface generation 变化时用新模式的文本原地替换它（不是追加第二条 system）。
- 能拒的东西在第一次 append 之前就算完（notice、range）；任何一步抛错就整段不落，意图留在 `pendingIntents` 里等下一个 turn 边界重试。

## 文本什么时候翻

`agent-loop` 的 `preStep()` 先 `systemPrompt.assemble()`、再走 pre-step waterfall，所以在 pre-step 里翻模式，**本步**装配的还是旧人格。`effectiveMode()` 因此在「这一轮还没长出新历史」时直接返回待生效的模式——**下一轮**的 assemble 就用上了新的。

## 模式与预设

- `dsh-plugin-coreset/presets` 注册两个预设：

| 预设 id | 显示名 | 起步模式 | 挂的插件 |
|---|---|---|---|
| `work` | 做题（`order: 45`） | `guide` | coreset + guide + work + hrl |
| `chat` | 聊天（`order: 60`） | `chat` | coreset |

- `setup` 预设不在这里：它由 `dsh-plugin-setup/presets` **条件注册**（入学办完就消失）。
- 起步模式来自本行的 `Config.mode`（默认 `chat`）。构造里先登记 chat，所以任何预设都有一个兜底人格。

## 数据落在哪

本包**不写盘**。一个会话的模式就是它日志里的 `ile/mode` 事件，加上切换时那条交接 `user/message`；投影 `ile` 是读它们的结果。人格正文在各自的 `prompts/`，学科备注在 `dsh-plugin-teaching-commons/skills/`。

## 和邻居的关系

- 依赖 `dsh-plugin-teaching-commons`（`composePrompt` / `readNote`），这是唯一的编译期依赖。
- 四个人格包的 `inject = ['ileModes']`，只调 `registerMode()`。
- 预设归本包的 `./presets`，所以 profile 的 `bundles` 里要有本包（`cordis.patch.yml` 插一行 `coreset-presets`）；人格包不再有自己的 patch 文件。
- 题库 / 课表 / 教材的工具由它们自己的插件挂进预设，本包不碰。

## 测试与构建

```bash
corepack yarn workspace dsh-plugin-coreset typecheck
corepack yarn workspace dsh-plugin-coreset test    # 11 个用例（handoff 8 + presets 3）
corepack yarn workspace dsh-plugin-coreset build
```

`build` = `tsc -p tsconfig.json`（出 `lib/types`）+ `tsdown`（出 `lib/index.js`、`lib/presets.js`）；`lib/` 是入库的构建产物。

**zod 是内联的**（`tsdown.config.ts` 的 `noExternal: ['zod']`）：宿主的模块表里没有 zod，profile 也不会去注册表装它——`dsh-plugin-memory` 的 fork 为同一个原因把 zod 打进了自己的 bundle。

## 已知限制

- 折叠**不可逆**：原文还在会话日志里，但模型与界面都看不到它了；要做「展开」得另做一套读日志的界面。
- 摘要上限 120 字（`HANDOFF_SUMMARY_MAX_CHARS`），超出截断加省略号——长交接会丢细节。
- 一次切换只在下一个 turn 边界落一次；落失败就留到再下一个边界（日志里有 `failed to fold history at the switch` 警告）。
- 换模式不换工具集：同一预设里工具永远是并集，模型要靠提示词约束「哪些工具此刻合适」。
- 本包没有客户端：界面上的聊天记录靠 `replace` 后的表面自然变短（只剩 head + 那条交接通知），不做额外遮蔽。

## 不做什么

- 不做通用压缩引擎（省 token 是 `billion-context` 那半边）；这里只折叠「换模式」这一刀。
- 不注册任何具体科目的人格，也不认识题库 / 课表 / 教材的数据结构。
- 不替学生切模式：工具调不调由学生那句话决定，提示词里写死「学生没提，不要主动切」。
