# dsh-plugin-hrl

ensure-ILE 的 **HRL 模式（显示「答案优化」）**：学生已经有答案，帮他把答案改得站得住。

不是从零做出来（那是 `dsh-plugin-guide`），也不是先独立做、判不过再转引导（那是 `dsh-plugin-work`）。

## 它做什么

1. 系统提示换成「答案优化」（commons 的 common + bank + `prompts/hrl.md`）
2. 注册 `read_note`，按科目判断「站不站得住」

## 和 guide 的边界

| | guide | HRL |
|---|---|---|
| 起点 | 还没做出来 | 已有答案 |
| 我们做什么 | 只给注意力，不评价 | 评价、指出可改的地方、对比 |
| 结束 | 他自己走完 | 改得更站得住，且知道为什么 |

两个模式**分开两个插件**，因为对「评价」的态度相反：guide 明确不批改，HRL 的核心动作就是评价和改。

## 教师轨迹 + 逐步 A/B

- **教师轨迹**：一次写全，按学生的偏好写（偏好从 memory 的档案里读，**不存固定的 preference 字段**）
- **A/B**：一次只摆一步，三选一 —— `student`（留他的）/ `teacher`（用教师版）/ `merged`（他自己重写，正文必须由他写）
- 每步落一次 `bank_update`，结束写 `hrl.result`，题目转 `review`

## 数据

全部落在题库的 `hrl` 段（schema v2.1）：

```jsonc
"hrl": {
  "input":   { "from": "work|pasted", "answer": "…" },
  "teacher": { "steps": [ { "index": 1, "body": "…", "reason": "…" } ] },
  "pairings": [ { "steps": [ { "chosen": "student|teacher|merged", "mergedText": "…" } ], "result": "…" } ]
}
```

## 为什么叫 Human RL

A/B 的每一次选择都是一条偏好信号：他倾向留自己的、还是吃教师的、还是自己再写一版。
这一版只**存证**，不采集、不打分——采集要等界面能并排看之后再做。
