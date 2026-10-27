# dsh-plugin-schedule

课表、进度与「今天做什么」：一个文件（`<DSH_HOME>/schedule/schedule.json`）+ 三个工具，负责把课表、题库和教材语料拼成一张今天能直接用的清单——**不判题、不引导、不评价**。

## 什么时候用

`cordis.patch.yml` 往 profile 根插一行（不是 agent preset：它跨模式），guide / work / HRL 共用同一份记录。

| 工具 | 用途 | 关键参数 |
|---|---|---|
| `schedule_read` | 看现状：第一次见面、刚改完课表想确认 | `part`：`all`（默认）/ `timetable` / `progress` / `subjects` / `pace` / `exceptions`；缺什么直说「还没录课表」 |
| `schedule_update` | 学生报课表、报进度、老师说调课或放假 | 字段级 patch：`subjects`（`id`/`name`/`bookId`/`note`）、`removeSubjects`（连课表、节奏、进度一起删）、`weekly`（整份替换）、`addLessons`（单加几节，同天同节以新的为准）、`pace`（`perLesson` 1–`MAX_PACE`=10）、`progress`（`subject`/`section`/`at`，`at` 省略=今天）、`addExceptions`（`kind`：`holiday`/`swap`/`exam`）、`removeExceptions`（`date` 必给）。`bookId` / `note` 空串=解绑。**全空**回「没有要更新的字段：至少给一个（…）」，不默默写盘 |
| `schedule_plan` | 学生问「今天学什么 / 先做哪个 / 明天讲什么」 | `date`（省略=今天）、`minutes`（今天的题量预算，默认 25，限 1–600）。只读 |

`schedule_plan` 输出四块：下一次课讲什么、今天预习哪几页、今天复习哪些题、历史遗留。科目 `id` 一旦用过就别改——课表、节奏、进度都挂在它上面。

## 数据落在哪

```jsonc
// <DSH_HOME>/schedule/schedule.json   schema 1
{
  "schema": 1,
  "subjects": [{ "id": "math", "name": "数学", "bookId": "renjiaoA-math-1", "note": "成都七中直播班" }],
  "timetable": { "weekly": [{ "weekday": 1, "slot": 2, "subject": "math", "note": "连堂" }] },
  "pace": { "math": { "perLesson": 2 } },
  "progress": { "math": { "section": "1.1 集合的概念", "at": "2026-10-27" } },
  "exceptions": [{ "date": "2026-10-30", "kind": "holiday", "note": "月考后放假" }],
  "updatedAt": "2026-10-28T00:45:00.000Z"
}
```

- `<DSH_HOME>` 没设时退 `process.cwd()`；`Config` 可覆盖 `file`（另有 `bankDirectory` / `textbookData` 两个透传）。
- `weekday` 1–7（周一=1），`slot` 从 1 开始；`EXCEPTION_KINDS = ['holiday','swap','exam']`。
- `progress.section` 要**和教材目录里的写法一致**——它是拿去向 `dsh-plugin-textbook` 要「下一节」的键。
- 写入是原子的（先写 `schedule.json.tmp` 再 `rename`）；文件坏了 `loadSchedule` 退回空记录并标 `corrupted`，工具不抛栈，但会明说「课表和进度需要重新录一次」。

## 和邻居的关系

- `dsh-plugin-bankmanager`：只**读**（`import { defaultBankDirectory, listProblems } from 'dsh-plugin-bankmanager/store'`），不替它改状态——状态由正在处理那道题的模式写回。
- `dsh-plugin-textbook`：只读语料（`import { createBookStore } from 'dsh-plugin-textbook/data'`），惰性构造，任何异常都退成 `undefined`。
- 两个 import 只在 `src/index.ts`（第 20、21 行）；`plan.ts` 与 `store.ts` 保持纯函数，测试不装宿主也能跑。兄弟包都走包名子路径（`/store`、`/data`），所以要先 `build` 出对方的 `lib/types`。
- `dsh-plugin-teaching-commons` 的 `prompts/common.md` 里定规矩：「今天学什么」先调 `schedule_plan` 再答。
- **不注册提示段**：三个模式都 `complete: true`，写进提示段会被吞，使用规矩只能写在工具描述里。

## 测试与构建

```bash
corepack yarn workspace dsh-plugin-schedule typecheck
corepack yarn workspace dsh-plugin-schedule test     # 40 个用例：plan 19 / store 21
corepack yarn workspace dsh-plugin-schedule build    # tsc -p tsconfig.json（出 lib/types）+ tsdown
```

- `plan.spec.ts` 覆盖下一次课 / 进度推算 / 到期筛选 / 顺序 / 预算 / 遗留 / 渲染；`store.spec.ts` 覆盖字段级合并、整份替换、解绑、删除级联、坏文件与原子写。
- `lib/`（含 `lib/types`）是入库的构建产物，改完源码要把重建结果一起提交。

## 已知限制

- `plan` 的四个常量都写死在 `src/plan.ts`：`MINUTES_PER_PROBLEM = 8`（预算 = `max(1, floor(minutes / 8))`，默认 25 分钟 → 3 道）、`PLAN_WINDOW_DAYS = 14`（找下一次课的范围）、`STALE_DAYS = 14`（历史遗留的闲置线）、`WRONG_THRESHOLD = 2`（错几次算遗留）。
- 排不下的题算 `reviewOverflow`，只明说「还有 N 道排不进今天」，不自动挪到明天。
- 复习顺序固定：到期（`review.nextAt` ≤ 今天）→ 上次做错 → 停在 `guide`/`hrl` 没走完；`mastered`/`parked` 不进队。
- 每一块单独退化（缺题库 / 题库有坏文件 / 教材目录没找到 / 科目没绑 `bookId` / `progress` 里的节在教材里找不到 / 课表空着），都不会让整个工具不出声，也不会抛栈。
- `<DSH_HOME>` 缺失时 `schedule.json` 落在 `process.cwd()`——真机上由桌面壳保证 `DSH_HOME`，裸跑要自己给 `Config.file`。
- v1 没有浏览器半边，只有这三个工具。

## 不做什么

- 不判题、不评价学生：题和页只是锚点，判断归 guide / work / HRL。
- 不替学生改题库状态（只读 bank）、不推断「讲完了」（由 `progress` 说了算，不从目录反推）。
- 不做周计划表 / 日历 UI / 提醒推送。
