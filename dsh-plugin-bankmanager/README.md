# dsh-plugin-bankmanager

> **占位包。** 还没实现——先放设计意图。等内容定下来再补 `package.json`、`src/`，并登记进根 workspaces。

## 这个插件做什么

管一道题从进来到掌握的整个过程——错题、待引导题、待优化题、待复习题，都在这一本账里。它是几个模式之间共享的那份数据：不引导、不改答案，只负责记录和调度。

## 一道题的一生（状态机草案）

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

每条记录至少要有：`id`、`subject`、`statement`（原题）、`attachments`（照片 / 文件）、`myAnswer`、`status`、`tags`（知识点）、`attempts`、`lastMode`、`lastSeenAt`、`nextReviewAt`、`reviewCount`、`history`（关联的会话引用）、`notes`。

## 工具（计划）

- `bank_add` / `bank_list(status)` / `bank_show(id)` / `bank_update(id, status, nextReview)` / `bank_due(date)` / `bank_stats`

## 和别的插件怎么配合

| 插件 | 怎么用这本库 |
|---|---|
| `dsh-plugin-guide` | 引导结束时写回：这题走到哪一步、下一步是什么 |
| `dsh-plugin-hrl` | 从 `hrl` 队列取题；优化完写回 `review` |
| `dsh-plugin-work` | 学生交出答案后判卷：过了进 `review`，没过进 `guide` |
| `dsh-plugin-schedule` | 只读：按 `nextReviewAt` 和遗留状态排每日清单 |

写操作只由「正在处理那道题的模式」做，别的插件不替它改状态——免得两边打架。

## 还没定的问题

- **题怎么进来**：拍照、粘贴文本，还是从会话里「这道题」直接收？图片存哪、要不要压缩。
- **`bankmanager` 这个名字**：偏长，`dsh-plugin-bank` 更短；但 bank 也容易被读成银行。
- **间隔重复表**：固定 1 / 3 / 7 / 15 / 30 天，还是按对错自适应。
- **一个库还是多个**：目前单用户单库；将来能不能按科目、学期分。
- **数据格式**：一个 JSON 还是 SQLite；放 `<dataRoot>/bank/` 还是走 profile 的 storage 服务。
- **隐私**：题面和答案都在本地，不上传；以后要跨设备同步再说。

## 组织

EnSure Lab / 因需。包名 `dsh-plugin-bankmanager`。它多半也不是 agent preset，而是 Host 侧服务 + 界面入口，这条待定。
