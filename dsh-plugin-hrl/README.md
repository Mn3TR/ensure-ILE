# dsh-plugin-hrl

答案优化的人格包（mode id `hrl`，显示「答案优化」）：学生已经有答案，帮他把答案改到站得住——教师轨迹一次写全，再一小步一小步 A/B，收尾记一条他自己报的整体偏好。

## 什么时候用

学生已经做出来了（自己做的，或 work 判过的），但答得不漂亮、经不起追问。「做题」预设（id `work`）同时挂着 guide / work / hrl 三个人格，本包是其中一段文本。

| 项 | 值 |
|---|---|
| mode id | `hrl`（`src/index.ts` 的 `HRL_MODE`） |
| 显示名 | 答案优化 |
| 可切换 | 是 |
| 人格正文 | commons 的 `common` + `bank` + 本包 `prompts/hrl.md` |

**本包只注册人格文本**（`ctx.ileModes.registerMode`）。提示段、`read_note`、cwd 遮蔽、历史折叠都在 `dsh-plugin-coreset`。

三步：

- **教师轨迹**一次写全：按学生的偏好写（偏好从 memory 的档案读；memory 里**不存**偏好字段，`hrl.preference` 是这一轮结束后才有的标签，不是写教师轨迹时的输入）。每一步同时写 `improvement`——一句话，说这一步**相对他原来那步**改了什么，以他的原句为参照（「你这里用求导，教师版配方」）；是差异陈述，不是「更好 / 更清楚」这类判决。
- **A/B** 一次只摆一步，三选一：`student`（留他的）/ `teacher`（用教师版）/ `merged`（他自己重写，正文必须由他写）。摆的时候把这一步的 `improvement` 说出来，再让他选。
- **收尾**：全选完、写完 `hrl.result` 后问他一次整体更喜欢哪版（他原来的 / 教师版 / 混出来的），答案写进 `hrl.preference`。只问一次，不解释、不劝。

## 数据落在哪

本包**不写自己的文件**，全部落在题库那道题的 `hrl` 段（schema 2，由 `bank_update` 增量写）：

```jsonc
"hrl": {
  "input":   { "at": "…", "from": "work|pasted", "attemptAt": "…", "answer": "拿来打磨的原文" },
  "teacher": { "writtenAt": "…", "answer": "教师版最终答案", "note": "按什么写的（可空）",
               "steps": [{ "index": 1, "body": "…", "reason": "…",
                           "improvement": "这一步相对他原来的写法改了什么" }] },
  "pairings": [{
    "at": "…",
    "steps": [{ "index": 1, "studentQuote": "学生原句（逐字）", "teacherStep": 1,
                "match": "same|partial|missing", "chosen": "student|teacher|merged",
                "mergedText": "选 merged 时他重写的", "chosenAt": "…", "note": "…" }],
    "result": "逐条选完之后拼出的解",
    "preference": "student|teacher|merged"
  }]
}
```

- 每步落一次 `bank_update(id, hrl: { step })`；配对结束写 `hrl.result`，题目转 `review`。
- `hrl.preference` 是**整轮标签**，写一次即落在最近那条 pairing 上（已经写过 `result` 也不影响）；和逐步的 `chosen` 是两层，别混。取值 `student` / `teacher` / `merged`。
- 人格在 `prompts/hrl.md`，挂载时读盘，`Config.promptFile` 可换路径。

## 和邻居的关系

- `dsh-plugin-coreset` 提供 `ileModes` 服务并拥有提示段与 `read_note`；本包只贡献文本。
- 题目与 `hrl` 段都在题库里，走 `bank_*` 工具读写，不 import `dsh-plugin-bankmanager` 源码。
- 和 guide 的边界：guide 只给注意力、明确不评价；HRL 的核心动作就是评价和改——所以是两段人格，不是一段提示词里的两个分支。

| | `guide` | `hrl` |
|---|---|---|
| 起点 | 还没做出来 | 已有答案 |
| 我们做什么 | 只给注意力，不评价 | 评价、指出可改处、对比 |
| 结束 | 他自己走完 | 改得更站得住，并且知道为什么 |

## 测试与构建

```bash
corepack yarn workspace dsh-plugin-hrl typecheck
corepack yarn workspace dsh-plugin-hrl build
```

没有单测。`build` = `tsc -p tsconfig.json` + `tsdown`；`lib/` 是入库的构建产物，改完源码要一起提交。

## 已知限制

- A/B 的每一步选择**不打分**：没有逐步打分的界面，也没有并排阅读界面。收尾会记一条整体偏好标签（`hrl.preference`：他更喜欢哪一版），但只有这一个信号，仍然不做打分界面。
- 教师轨迹的质量完全取决于 `skills/*.md` 与提示词，没有测试兜着。
- memory 的提示段被 coreset 的 `complete` 段吞掉，模型只能靠工具描述理解 `profile_read` 这类工具。

## 不做什么

- 不从零带一道题（那是 `dsh-plugin-guide`），不判「谁对」（那是 `dsh-plugin-work`）。
- 不做打分界面、不逐步采集信号——收尾只记一条 `hrl.preference`。
- 不写自己的数据文件；不注册任何工具。
