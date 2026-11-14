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

- **教师轨迹**一次写全：按学生的偏好写（调用 `profile_read({ name: "preference" })`；未填就沿用学生原解。`hrl.preference` 是这一轮结束后的整体标签）。每一步同时写 `improvement`——一句话，说这一步**相对他原来那步**改了什么，以他的原句为参照（「你这里用求导，教师版配方」）；是差异陈述，不是「更好 / 更清楚」这类判决。
- **比较**围绕一个关键决策，三选一：`student`（留他的）/ `teacher`（用教师版）/ `merged`（他自己重写）。相邻机械步骤可一起确认后逐条保存；有实质差异处另问一个方法适用条件问题，以 `decision`、`understanding{question,answer,verdict}` 保存理解证据，与版本选择和整体偏好分开。拒答可省略，不打分、不伪造。
- **收尾**：每步按 `chosen` 取学生原句、教师步骤 `body` 或 `mergedText`，核对整条轨迹的完整性与衔接；冲突由学生重新选择或补写，确认成立后写 `hrl.result` 并转 `review`。再问一次整体更喜欢哪版，写进 `hrl.preference`。

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
                "mergedText": "选 merged 时他重写的", "chosenAt": "…", "note": "…",
                "decision": "求导还是配方", "understanding": { "question": "…", "answer": "学生原话", "verdict": "supported|partial|unclear" } }],
    "result": "逐条选完之后拼出的解",
    "preference": "student|teacher|merged"
  }]
}
```

- 学生每确认一步立即落一次 `bank_update(id, hrl: { step })`；选择未齐或推理未成立时保持 `hrl`，完整轨迹验收后才写 `hrl.result` 并转 `review`。
- 普通回应通常两句；关键决策比较通常三句，一轮一个回应任务，必要的依据与示意可以讲清。
- `hrl.preference` 是**整轮标签**，写一次即落在最近那条 pairing 上（已经写过 `result` 也不影响）；和逐步的 `chosen` 是两层，别混。取值 `student` / `teacher` / `merged`。
- 人格在 `prompts/hrl.md`，挂载时读盘，`Config.promptFile` 可换路径。

## 和邻居的关系

- `dsh-plugin-coreset` 提供 `ileModes` 服务并拥有提示段与 `read_note`；本包只贡献文本。
- 题目与 `hrl` 段都在题库里，走 `bank_*` 工具读写，不 import `dsh-plugin-bankmanager` 源码。
- Guide 侧重在尝试中提供并撤除支持；HRL 侧重比较已有解答的关键决策。两者均把当场完成与之后独立重建分开。

| | `guide` | `hrl` |
|---|---|---|
| 起点 | 还没做出来 | 已有答案 |
| 我们做什么 | 按缺口提供支持，再逐渐撤掉 | 比较关键决策，记录选择与理解证据 |
| 结束 | 他自己走完 | 改得更站得住，并且知道为什么 |

## 测试与构建

```bash
corepack yarn workspace dsh-plugin-hrl typecheck
corepack yarn workspace dsh-plugin-hrl build
```

没有单测。`build` = `tsc -p tsconfig.json` + `tsdown`；`lib/` 是入库的构建产物，改完源码要一起提交。

## 已知限制

- 比较过程不打分，也没有并排阅读界面。整体偏好 `hrl.preference` 仍只问一次；理解证据可选记录实际问答，不能从偏好推断。
- 教师轨迹的质量完全取决于 `skills/*.md` 与提示词，没有测试兜着。
- memory 的提示段被 coreset 的 `complete` 段吞掉，模型只能靠工具描述理解 `profile_read` 这类工具。

## 不做什么

- 不从零带一道题（那是 `dsh-plugin-guide`），不判「谁对」（那是 `dsh-plugin-work`）。
- 不做打分界面、不逐步追问偏好分数；理解问答与收尾一次整体偏好分别保存。
- 不写自己的数据文件；不注册任何工具。
