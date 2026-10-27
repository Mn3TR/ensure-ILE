# dsh-plugin-hrl

HRL 模式的预设包（`hrl`「答案优化」）：学生已经有答案，帮他把答案改到站得住——教师轨迹一次写全，再一小步一小步 A/B。

## 什么时候用

| 项 | 值 |
|---|---|
| 预设 id | `hrl` |
| 显示名 | 答案优化（`cordis.patch.yml` 的 `hrl-preset`，`order: 55`） |
| 学生状态 | 已经做出来了（自己做的，或 work 判过的），但答得不漂亮、经不起追问 |

系统提示 = commons 的 `common` + `bank` + 本包 `prompts/hrl.md`（`src/index.ts:50`）。

| 工具 | 用途 | 关键参数 |
|---|---|---|
| `read_note` | 读科目的评价标准（什么算站得住），写教师轨迹、判断他的答案之前调一次 | `note`（必填）：`math` / `arts` |

两个动作：

- **教师轨迹**一次写全：按学生的偏好写（偏好从 memory 的档案读，**不存固定的 preference 字段**）。
- **A/B** 一次只摆一步，三选一：`student`（留他的）/ `teacher`（用教师版）/ `merged`（他自己重写，正文必须由他写）。

## 数据落在哪

本包**不写自己的文件**，全部落在题库那道题的 `hrl` 段（schema 2，由 `bank_update` 增量写）：

```jsonc
"hrl": {
  "input":   { "at": "…", "from": "work|pasted", "attemptAt": "…", "answer": "拿来打磨的原文" },
  "teacher": { "writtenAt": "…", "answer": "教师版最终答案", "note": "按什么写的（可空）",
               "steps": [{ "index": 1, "body": "…", "reason": "…" }] },
  "pairings": [{
    "at": "…",
    "steps": [{ "index": 1, "studentQuote": "学生原句（逐字）", "teacherStep": 1,
                "match": "same|partial|missing", "chosen": "student|teacher|merged",
                "mergedText": "选 merged 时他重写的", "chosenAt": "…", "note": "…" }],
    "result": "逐条选完之后拼出的解"
  }]
}
```

- 每步落一次 `bank_update(id, hrl: { step })`；配对结束写 `hrl.result`，题目转 `review`。
- 提示词在 `prompts/hrl.md`，挂载时读盘（默认路径 `src/index.ts:39`，读盘在 `:50`），`Config.promptFile` 可换路径。

## 和邻居的关系

- **依赖** `dsh-plugin-teaching-commons`（`composePrompt` / `readNote`）。
- 题目与 `hrl` 段都在题库里，走 `bank_*` 工具读写，不 import `dsh-plugin-bankmanager` 源码。
- 和 guide 的边界：guide 只给注意力、明确不评价；HRL 的核心动作就是评价和改——所以是两个包，不是两段提示词。

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

- A/B 的每一次选择目前**只存证、不采集、不打分**——并排阅读的界面还没做，现在打分只会变成噪声。
- 教师轨迹的质量完全取决于 `skills/*.md` 与提示词，没有测试兜着。
- memory 的提示段被 `complete: true` 吞掉，模型只能靠工具描述理解 `profile_read` 这类工具，偏好读不读得准取决于模型自己会不会调。

## 不做什么

- 不从零带一道题（那是 `dsh-plugin-guide`），不判「谁对」（那是 `dsh-plugin-work`）。
- 不采集偏好信号、不做打分界面（先存证；这是「明确了不做」的一条）。
- 不写自己的数据文件；除 `read_note` 外不注册工具。
