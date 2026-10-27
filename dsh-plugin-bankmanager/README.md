# dsh-plugin-bankmanager

题库：一道题一个 JSON 文件，六个工具，guide / work / HRL / schedule 共用同一本账——它不引导、不判卷、不评价，只记录和调度。

## 什么时候用

不是 agent preset：`cordis.patch.yml` 往 profile 根插一行 `dsh-plugin-bankmanager`，所以**所有会话**都能看到这六个工具。它是「题」的唯一事实来源。

| 工具 | 用途 | 关键参数 |
|---|---|---|
| `bank_add` | 新建一道题，返回 id | `statement`（必填，题干原文）、`subject`（必填，自由字符串）、`tags`（可省略） |
| `bank_list` | 按条件列题 | `status`、`subject`、`due`（`true` 只看今天到期）、`limit`（默认 20，夹到 1–100，取**最后** N 条） |
| `bank_show` | 看一道题的全部记录 | `id`（必填） |
| `bank_update` | 增量改，只合并传了的字段 | `id` + 任意：`status`、`guideOutcome`、`whereStuck`、`guideResult`、`insight`、`reviewNextAt`、`reviewInterval`、`reviewPassed`、`affect`、`effectiveHint`、`workAttempt{answer,verdict}`、`hrl{input,teacher,step,result}`、`handoff{from,to,why,state,detail}`、`handoffConsume`、`patch`（自由字段浅合并） |
| `bank_resume` | 不带 `id` 列待接交接；带 `id` 返回题干 + 交接包 + `insight` + 最后一次作答 | `id`（可省略） |
| `bank_stats` | 各状态计数，另有「待接交接：N」 | 无参数 |

一道题的一生：

```
new ──> guide ──> review ──> mastered
         │           ▲
         └──> hrl ───┘
              │
              └──> parked
```

- `new` 刚进来 / `guide` 待引导或引导中 / `hrl` 待优化 / `review` 等复习 / `mastered` 复习爬满 / `parked` 暂时放下。
- `bank_update(status: 'review', reviewPassed: true)` 按 `REVIEW_LADDER = [1, 3, 7, 14, 30, 60, 120]`（天）升一档；`false` 回到第一档；爬到最后一档自动转 `mastered`。
- 「状态谁说了算」：模型自己判断，但收尾必须问学生一句「这题你自己做出来了吗」再写回（规矩在 commons 的 `prompts/bank.md` 与 `guide.md` 里，代码不校验）。

## 数据落在哪

```
<DSH_HOME>/bank/problems/<id>.json
```

- `<DSH_HOME>` 没设时退 `USERPROFILE` / `HOME` 下的 `.dsh`；桌面壳里是数据根的 `home`。`Config.directory` 可覆盖。
- id = `YYYYMMDD-<subject 归一化>-<6 位 hex>`（`randomBytes(3)`），例如 `20261023-math-a3f91c`。日期段让文件名排序等于录入顺序。
- `schema: 2`，按模式分块 + 跨模式的 `handoff`：

```jsonc
{
  "schema": 2, "id": "…", "subject": "math", "tags": [], "statement": "题干", "attachments": [],
  "status": "new|guide|hrl|review|mastered|parked", "createdAt": "…", "updatedAt": "…",
  "guide":     { "sessions": [{ "sessionId", "startedAt", "endedAt", "outcome", "whereStuck", "result", "affect", "effectiveHint" }], "insight": "…" },
  "work":      { "attempts": [{ "at", "answer", "verdict": "ok|partial|wrong", "source" }] },
  "hrl":       { "input": {…}, "teacher": { "answer", "note", "steps": [{ "index", "body", "reason" }] }, "pairings": [{ "steps": [...], "result" }] },
  "handoff":   { "id": "hlt-…", "at", "from", "to", "why", "state", "detail": { "lastWords", "blocker", "nextStep" }, "consumedAt", "consumerSessionId" },
  "review":    { "nextAt", "interval", "count", "history": [] },
  "history":   [{ "at", "event", "detail" }]
}
```

固定枚举（`src/store.ts:51` 起）：`PROBLEM_STATUSES` 六个状态、`GUIDE_OUTCOMES`（`solved`/`stuck`/`abandoned`）、`AFFECTS`（`frustrated`/`neutral`/`excited`）、`HINT_LEVELS`（`confirm`/`position`/`feature`/`structure`/`result`）、`PAIRING_MATCHES`（`same`/`partial`/`missing`）、`PAIRING_CHOICES`（`student`/`teacher`/`merged`）。

写法上的三条规矩：

- **原子写 + 跨进程锁**（`@deepseek-ai/dsh-atomic-write` 的 `writeFileAtomic` / `withFileLock`）：中途断掉不会留半个文件。
- **写前先读、只合并自己认识的字段**：手改过的文件不会被整份冲掉。
- **单文件坏了只跳过那一个**并记日志，不让 `bank_list` 全挂。`schema: 1` 的老文件解析失败会被跳过，**不迁移**。

## 和邻居的关系

| 邻居 | 怎么用这本库 |
|---|---|
| `dsh-plugin-guide` / `-work` / `-hrl` | 经 `bank_*` 工具读写；写操作只由「正在处理那道题的模式」做 |
| `dsh-plugin-schedule` | 只读：`import { defaultBankDirectory, listProblems } from 'dsh-plugin-bankmanager/store'`（子路径，不深引 `src/` / `lib/` 文件） |
| `dsh-plugin-memory` | 不互相引用：记忆存「这个学生的稳定事实」，题库存「这道题的过程」 |

浏览器半边（`src/client/`，产物 `lib/client.js`，按上游客户端插件协议包成 `window.__ModuleLoader__.load({ id, factory })`）：

- `tool.call.toolview` 的 `bank_resume` → **交接卡片**（题干宋体、学生原话楷体、卡点、下一步、一个按钮）。字段缺一块就静默不渲染，退回通用工具行。
- `conversation.hero.options` 的 `ile-resume` → 空白会话首页列出待接交接，点一下只把「接着上次那道题：<id>（<状态>）」填进输入框，不替学生发。
- 「接着做」= `sessions.create({ agentPreset })`（按交接的 `to`，也认中文显示名）+ `uiWorkspace.openSession` + `conversation.input.requestDraftInitialization`。幂等靠会话列表 + `localStorage` 里「这道交接开过的会话 id」。
- 宿主侧路由 `/bank/api`（`src/api.ts`）：`handoff.pending` / `handoff.consume`；信任围栏同 `/api`（loopback / `trustedHosts`、拒 cross-site）。通道走嵌套 `ctx.inject(['webServer', 'webStartup'])`，路由缺席时工具一个不少。

## 测试与构建

```bash
corepack yarn workspace dsh-plugin-bankmanager typecheck
corepack yarn workspace dsh-plugin-bankmanager test        # 45 个用例 / 6 个文件
corepack yarn workspace dsh-plugin-bankmanager build
corepack yarn workspace dsh-plugin-bankmanager build:client
corepack yarn workspace dsh-plugin-bankmanager verify       # node scripts/verify-bank.mjs：挂载冒烟，断言六个工具 + bank_add 真写了一道题
```

- `build` = `tsc -p tsconfig.json` + `tsdown`；`build:client` = `vite build --config vite.client.config.ts`。两者产物（`lib/`）都入库。
- `bank_resume` 是第六个工具，2026-10-25 之后才加；`scripts/verify-bank.mjs` 的期望列表跟着它。

## 已知限制

- `bank_list(limit)` 取的是**最后** `limit` 条（按文件名排序后的尾部），不是最早或最紧急的；到期筛选走 `due: true`。
- 到期口径是「本地当天 24:00」为界（`endOfToday()` = 次日 0 点），不是 UTC。
- 状态是模型判断的，没有独立审计；「每轮问学生一句」也只是提示词里的规矩。
- 卡片里的楷体在客户端构建面看不到原生字体文件，本机会回退成宋体；首页的待接列表是挂载时取一次，不随别的会话实时刷新。
- 同一道题最多一个未接收的 `handoff`；`consumedAt` 写失败时卡片会提示「还会出现在待接里」，不假装成功。
- `schema: 1` 的存量文件不迁移（目前没有存量数据）。

## 不做什么

- 不引导、不判卷、不评价——那些是各模式的事；本包只记录、调度、把交接递给下一个模式。
- 不采集偏好信号、不做打分界面。
- 不做图片链路：`attachments` 字段留着，拍照/粘贴入口未做。
- 不做多用户 / 多库 / 按学期分库。
