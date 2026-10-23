# dsh-plugin-bankmanager

> **还没实现——但设计已经定案。** 这次不是占位了：字段、存储、状态判定都拍过板（2026-10-23 李），
> 接下来只差 `package.json` / `src/`，并登记进根 workspaces。

## 这个插件做什么

管一道题从进来到掌握的整个过程——错题、待引导题、待优化题、待复习题，都在这一本账里。它是几个模式之间共享的那份数据：不引导、不改答案，只负责记录和调度。

## 一道题的一生（状态机）

```
new ──> guide ──> review ──> mastered
         │           ▲
         └──> hrl ───┘
              │
              └──> parked（历史遗留 / 暂不处理）
```

- `new`：刚进来，还没处理
- `guide`：待引导 / 引导中（对应 guide 模式）
- `hrl`：已经解出，但答得不漂亮，待优化（对应 HRL 模式）
- `review`：解出来了，等着按间隔复习
- `mastered`：连续几次复习都过了
- `parked`：暂时放下，但留在「历史遗留」里提醒

## 存储：一道题一个 JSON 文件

```
<DSH_HOME>/bank/problems/<id>.json
```

`DSH_HOME` 是 `.dhdl/home`（`run()` 设的），数据跟着数据根走，清空 `.dhdl` 就整份消失。

**id 格式**：`YYYYMMDD-<subject>-<6 位 hex>`，例如 `20261023-math-a3f91c`。
日期段让文件按名排序就等于按录入时间排序，6 位 hex 是人看不出来但不会撞的那部分。

**一道题一个文件**，把这道题身上发生过的全部事情装进去（李 2026-10-23 定）：

```json
{
  "schema": 1,
  "id": "20261023-math-a3f91c",
  "subject": "math",
  "tags": ["函数单调性"],
  "statement": "题干文本",
  "attachments": [],
  "status": "guide",
  "createdAt": "2026-10-23T15:20:00+08:00",
  "updatedAt": "2026-10-23T15:20:00+08:00",
  "guide": {
    "sessions": [
      { "sessionId": "…", "startedAt": "…", "endedAt": "…", "outcome": "solved|stuck|abandoned", "whereStuck": "第二问的换元" }
    ],
    "insight": "这题的关键转折：……"
  },
  "attempts": [
    { "at": "…", "mode": "work|hrl", "answer": "…", "verdict": "ok|partial|wrong" }
  ],
  "review": { "nextAt": "…", "interval": 3, "count": 1, "history": [] },
  "history": [ { "at": "…", "event": "created" } ]
}
```

写文件用原子写（`@deepseek-ai/dsh-atomic-write`）；写之前先读、只合并自己认识的字段，
不整份覆盖——手改过的文件不能被冲掉。单文件解析失败只跳过那个文件并记日志，不能让 `bank_list` 全挂。

## 工具

- `bank_add`：新建一道题（题干、科目、标签），返回 id
- `bank_list(status?)`：按状态列题
- `bank_show(id)`：看一道题的全部记录
- `bank_update(id, …)`：改状态、追加 guide 会话、追加 attempt、写 review 时间
- `bank_due(date?)`：到期该复习的题（schedule 模式用）
- `bank_stats`：各状态计数

第一版先做前四个。

## 状态谁说了算（2026-10-23 定）

**模型判断 + 每轮问一句**，融合两版方案：

- guide 收尾时模型自己判断这题走没走通，写回 `status` 和 `guide.sessions[].outcome`
- 但判断之前要**问学生一句**「这题你自己做出来了吗」——guide 的价值就在「他自己做出来」，
  模型没资格替他回答
- 独立审计（再用一个模型/规则复核状态）先不做，记在待办里
- 每轮静默记 `updatedAt` 兜底，模型忘了写回也能从时间上看出来

## 和别的插件怎么配合

| 插件 | 怎么用这本库 |
|---|---|
| `dsh-plugin-guide` | 开始引导前 `bank_list`/`bank_show` 看这题以前走到哪；收尾写回 |
| `dsh-plugin-hrl` | 从 `hrl` 队列取题；优化完写回 `review` |
| `dsh-plugin-work` | 学生交出答案后判卷：过了进 `review`，没过进 `guide` |
| `dsh-plugin-schedule` | 只读：按 `nextReviewAt` 和遗留状态排每日清单 |
| `dsh-plugin-memory` | 不互相引用：记忆存「这个学生的稳定事实」，题库存「这道题的过程」 |

写操作只由「正在处理那道题的模式」做，别的插件不替它改状态——免得两边打架。

## 还没定的问题

- **题怎么进来**：现在走「会话里模型收题 + `bank_add`」；拍照/粘贴的入口按钮后续再做，
  图片的存储与压缩整条链路李 2026-10-23 明确「记下来之后搞」
- **`bankmanager` 这个名字**：偏长，`dsh-plugin-bank` 更短；但 bank 也容易被读成银行
- **间隔重复表**：固定 1 / 3 / 7 / 15 / 30 天，还是按对错自适应
- **一个库还是多个**：目前单用户单库；将来能不能按科目、学期分
- **独立审计**：状态由模型判断之后，要不要再上一道复核（先不做）

## 组织

EnSure Lab / 因需。包名 `dsh-plugin-bankmanager`。它多半也不是 agent preset，而是 Host 侧服务 + 界面入口，这条待定。
