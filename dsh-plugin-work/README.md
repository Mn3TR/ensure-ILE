# dsh-plugin-work

独立做题的人格包（mode id `work`，显示「独立做题」）：学生自己做、交上来，判「结果对不对」和「说清没有」两件事；判不过先给一次机会，再不行转引导。

## 什么时候用

学生拿到题、自己先做，做完了或者做到一半来交卷。「做题」预设（id `work`）同时挂着 guide / work / hrl 三个人格，本包是其中一段文本。

| 项 | 值 |
|---|---|
| mode id | `work`（`src/index.ts` 的 `WORK_MODE`） |
| 显示名 | 独立做题 |
| 可切换 | 是 |
| 人格正文 | commons 的 `common` + `bank` + 本包 `prompts/work.md` |

**本包只注册人格文本**（`ctx.ileModes.registerMode`）。提示段、`read_note`、cwd 遮蔽、历史折叠都在 `dsh-plugin-coreset`。

判卷与处理规矩（都写在 `prompts/work.md` 与 commons 的 `prompts/bank.md` 里）：

- **判两件事**：结果对不对（代回原题 / 回原文找依据）、说清没有（每一步为什么这么做）。两件都过才算过。
- 结果对但说不清 → `work.attempts` 记 `partial`、`status` 回 `guide`，写 `handoff` 让他去补「为什么」——他不一定没做出来，只是不知道自己怎么出来的。
- **重交只给一次**：第一次不对只指出错在哪一步（不给方法），第二次还不对就转引导。work 的价值在「自己先撞一次」。
- **边界**：不给提示、不给答案、不替他总结；查资料允许；笨办法、写得丑、跳步都不是判错理由。

## 数据落在哪

本包**不写自己的文件**。

- 判卷结果进题库：`bank_update(id, workAttempt: { answer, verdict })`（`verdict` = `ok` / `partial` / `wrong`），状态 `new` → `review`（过）或 `guide`（不过 / 讲不清）。
- 讲不清要交给引导：`bank_update(id, handoff: { from: 'work', to: 'guide', why, state, detail })`，写完聊天里出交接卡片。
- 人格在 `prompts/work.md`，挂载时读盘，`Config.promptFile` 可换路径。

## 和邻居的关系

- `dsh-plugin-coreset` 提供 `ileModes` 服务并拥有提示段与 `read_note`；本包只贡献文本。
- 读写题库走 `bank_*` 工具，不 import `dsh-plugin-bankmanager` 源码。
- 交界给 guide 时，新会话里由 guide 用 `bank_resume` 接上，学生不必重讲题干；也可以不换预设，直接 `context_switch({ to: 'guide' })`。

| | `guide` | `work` | `hrl` |
|---|---|---|---|
| 起点 | 还没做出来 | 自己做完来交 | 已有答案 |
| 我们做什么 | 给注意力，不给动作 | 不插手，判结果和说理 | 评价、对比、改 |
| 结束 | 他自己走完 | 判过，或转 guide | 改到站得住 |

三个都在同一个预设里，所以「转 guide」现在可以就地切模式，不再必须开新会话。

## 测试与构建

```bash
corepack yarn workspace dsh-plugin-work typecheck
corepack yarn workspace dsh-plugin-work build
```

没有单测（本包与 guide 同形：读文件、拼字符串、登记一段文本）。`build` = `tsc -p tsconfig.json` + `tsdown`；`lib/` 是入库的构建产物，改完源码要一起提交。

## 已知限制

- 「重交只给一次」是提示词里的规矩，代码不计数、不拦第二次。
- `read_note` 的内容是给模型判卷用的，但没有机制阻止它被念出来——只靠工具描述与提示词约束。
- 判卷口径完全在 `skills/*.md` 的文本里，没有测试覆盖。

## 不做什么

- 不给提示、不给答案、不替他总结；不替他改答案（改答案属于 `hrl`）。
- 不注册任何工具——判卷用的是题库和教材那些现成工具。
- 不写自己的数据文件：一道题的一切都在题库那一个 JSON 里。
