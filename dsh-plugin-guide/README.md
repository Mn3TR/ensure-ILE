# dsh-plugin-guide

引导模式的人格包（mode id `guide`，显示「引导模式」）：系统提示里的那一段「你是学生做题时的引导者」。

## 什么时候用

学生还没做出来、需要有人把他的注意力按住时。它不是预设——预设由 `dsh-plugin-coreset` 声明，「做题」预设（id `work`）同时挂着 guide / work / hrl 三个人格，`context_switch` 换的只是这一段文本。

| 项 | 值 |
|---|---|
| mode id | `guide`（`src/index.ts` 的 `GUIDE_MODE`） |
| 显示名 | 引导模式 |
| 可切换 | 是——「做题」预设里三个模式互相切 |
| 人格正文 | commons 的 `common` + `bank` 两段 + 本包 `prompts/guide.md` |

**本包只注册人格文本**（`ctx.ileModes.registerMode`，`src/index.ts` 的 `apply`）。提示段、`read_note`、`working-directory:current` 的空遮蔽、历史折叠、`context_switch` 全在 `dsh-plugin-coreset` —— 一个 scope 只能有一条 `complete` 段，三个人格挂进同一个预设时，共享的东西必须只有一份。

## 数据落在哪

本包**不写盘**。

- 人格在 `prompts/guide.md`，用 `fileURLToPath(new URL('../prompts/guide.md', import.meta.url))` 定位，**挂载时同步读盘**——改文件不用重建，重启会话即生效；`Config.promptFile` 可换路径。
- 科目备注在 `dsh-plugin-teaching-commons/skills/`，不在本包。
- 题、课表、教材分别由 `bank_*` / `schedule_*` / `textbook_*` 读写，本包不碰。

## 和邻居的关系

- `dsh-plugin-coreset` 提供 `config.ileModes` 服务（本包 `inject = ['ileModes']`），并负责把这段文本渲染进唯一的提示段。
- 依赖 `dsh-plugin-teaching-commons`（`composePrompt`）拼共用段；不 import 任何兄弟插件的源码。
- 交接靠题库里的 `handoff` 段 + 交接卡片，不靠提示注入。
- 和 work / hrl 的关系见 `dsh-plugin-work/README.md` 的对照表：三者是同一预设里的三种姿态，不是三个产品。

## 测试与构建

```bash
corepack yarn workspace dsh-plugin-guide typecheck
corepack yarn workspace dsh-plugin-guide build
```

没有单测：唯一行为是「读一个文件、拼字符串、登记一段文本」。`build` = `tsc -p tsconfig.json`（出 `lib/types`）+ `tsdown`（出 `lib/index.js`）；**`lib/` 是入库的构建产物**（profile 用 `file:` 链源码后靠它跑），改完源码要把重建结果一起提交。

## 已知限制

- 提示词是全仓唯一「改文本即改产品」的地方，没有测试兜着，改坏了只有真机才发现。
- 本包不再有自己的预设行：旧会话的 `meta.agentPreset: guide` 已无法恢复（预设合并成 `work` / `chat` 两个）。
- 模式文本在**下一轮开始前**才翻：学生在会话里点名换模式，那一轮还在旧人格下回答（`agent.ts` 先 `assemble()` 再走 pre-step waterfall）。

## 不做什么

- 不给答案、不给动作，只给注意力——只写在 `prompts/guide.md` 里，代码不强制。
- 不批改、不评价学生（那是 `dsh-plugin-hrl`）。
- 只给一个下一步：一次有两个视角就退化成「讲题」。
