# dsh-plugin-schedule

课表、进度与「今天做什么」。三工具挂在 profile 根，guide / work / HRL 共用同一份记录。

这份记录只有一个文件：`<DSH_HOME>/schedule/schedule.json`（`DSH_HOME` 默认是数据根里的 `home`）。它**不判题、不引导、不评价**——只负责把课表、进度、题库和教材语料拼成一张今天能直接用的清单。

## 三个工具

| 工具 | 用在哪 | 关键点 |
| --- | --- | --- |
| `schedule_read` | 第一次见面、刚改完课表想确认 | `part` 可选 `all`（默认）/ `timetable` / `progress` / `subjects` / `pace` / `exceptions`；缺什么直接说「还没录课表」 |
| `schedule_update` | 学生报课表、报进度、老师说调课或放假 | 字段级 patch：只改传了的字段；`weekly` 是整份替换，`addLessons` 是单加几节（同天同节以新的为准）；`bookId` 空串解绑 |
| `schedule_plan` | 学生问「今天学什么」 | 只读。四块输出：下一次课讲什么、今天预习哪几页、今天复习哪些题、历史遗留 |

`schedule_update` 的字段：`subjects`（`id` / `name` / `bookId` / `note`）、`removeSubjects`（连同课表里的课、节奏、进度一起删）、`weekly`、`addLessons`、`pace`（`perLesson` 1–10）、`progress`（`subject` / `section` / `at`，`at` 省略=今天）、`addExceptions`（`kind` = `holiday` / `swap` / `exam`）、`removeExceptions`（`date` 必给，`kind` / `subject` 收窄）。全部留空会回「没有要更新的字段」而不是默默写一次盘。

科目 `id` 一旦用过就别改：课表、节奏、进度都挂在它上面。

## 文件长这样（schema 1）

```jsonc
{
  "schema": 1,
  "subjects": [
    { "id": "math", "name": "数学", "bookId": "renjiaoA-math-1", "note": "成都七中直播班" }
  ],
  "timetable": {
    "weekly": [
      { "weekday": 1, "slot": 2, "subject": "math", "note": "连堂" }
    ]
  },
  "pace": { "math": { "perLesson": 2 } },
  "progress": { "math": { "section": "1.1 集合的概念", "at": "2026-10-27" } },
  "exceptions": [
    { "date": "2026-10-30", "kind": "holiday", "note": "月考后放假" }
  ],
  "updatedAt": "2026-10-28T00:45:00.000Z"
}
```

`weekday` 1–7（周一=1），`slot` 从 1 开始。`progress.section` 要**和教材目录里的写法一致**——它是拿去向 `dsh-plugin-textbook` 要「下一节」的键。

写入是原子的：先写 `schedule.json.tmp` 再 `rename`，中途断掉不会留下半个文件。文件坏了（不是合法 JSON）`loadSchedule` 退回空记录并标 `corrupted`，工具不会抛栈——但会明说「课表和进度需要重新录一次」。

## plan 的算法（`src/plan.ts`，纯函数）

- **下一次课**：从今天往后找 14 天（`PLAN_WINDOW_DAYS`）里第一个有课、且没被 `holiday` / `exam` 清空的日子（例外可以整天，也可以只针对某一科）。这一课覆盖的节 = 从 `progress` 那一节之后数 `pace.perLesson` 节。
- **预习锚点**：只给这一课的第一节，附 PDF 页码和课本页码（`pdfPage - textbookOffset`），再加一句「自己提两个问题」——页和题都只是锚点，问题归学生提。
- **复习队列**：到期（`review.nextAt` ≤ 今天）→ 上次做错（`work.attempts` 里有 `wrong`）→ 停在 `guide` / `hrl` 没走完。`mastered` / `parked` 不进队。
- **题量预算**：`MINUTES_PER_PROBLEM = 8`，`budget = max(1, floor(minutes / 8))`，默认 25 分钟 → 3 道；排不下的算 `reviewOverflow`，明说「还有 N 道排不进今天」。
- **历史遗留**：同一道错了 ≥2 次（`WRONG_THRESHOLD`），或者超过 14 天没动（`STALE_DAYS`，看 `updatedAt`，没有就看 `createdAt`）。单独一块，不硬塞进今天。

## 缺数据时的退路

排课最怕「一个数据源没配好，整个工具不出声」，所以每一块都单独退化：

| 缺什么 | 结果 |
| --- | --- |
| 题库读不出来 | 追加「题库读不出来（…），这一轮只给课表那两块。」，课表照常排 |
| 题库里有坏文件 | 明说「题库里有 N 个坏文件被跳过。」 |
| 教材语料目录没找到 | 追加「教材语料不可用（数据目录没找到），页数给不出来。」，章节标题照给 |
| 科目没绑 `bookId` | 预习块给章节标题 + `（教材未绑定）`，不给页码 |
| `progress` 里的节在教材里找不到 | 明说「进度里的「X」在教材里没找到，或者已经是最后一节。」 |
| 课表空着 | 照样给复习和历史遗留，并提示先录课表 |

## 和邻居的关系

- `dsh-plugin-bankmanager`：只**读**（`defaultBankDirectory` + `listProblems`），不替它改状态。状态由正在处理那道题的模式写回。
- `dsh-plugin-textbook`：只读语料（`createBookStore` → `book` / `startSection` / `nextSection` 三个薄方法），惰性构造，任何异常都退成 `undefined`。
- 两个 import 只出现在 `src/index.ts`；`plan.ts` 与 `store.ts` 保持纯函数，测试可以不装任何宿主直接跑。兄弟包按包名走子路径（`dsh-plugin-bankmanager/store`、`dsh-plugin-textbook/data`），依赖写成 `link:../dsh-plugin-*`，所以要它们先 `build` 出 `lib/types`。
- **不注册提示段**：guide / work / HRL 都用 `complete: true` 整份替换系统提示，写进提示段的东西会被吞掉，所以使用规矩只能写在工具描述里。

## 测试与构建

```bash
corepack yarn workspace dsh-plugin-schedule typecheck
corepack yarn workspace dsh-plugin-schedule test
corepack yarn workspace dsh-plugin-schedule build
```

根 `node_modules` 没有 `.bin`（Yarn 4 + `nmHoistingLimits: workspaces`），所以不要用 `../node_modules/.bin/vitest`。40 个单测：`plan.spec.ts` 覆盖下一次课 / 进度推算 / 到期筛选 / 顺序 / 预算 / 遗留 / 渲染，`store.spec.ts` 覆盖字段级合并、整份替换、解绑、删除级联、坏文件与原子写。

## 不做什么

- **不判题、不评价学生**：题和页只是锚点，判断归 work / HRL / guide。
- **不替学生改题库状态**：读，然后由正在处理那道题的模式写回。
- **不推断教材内容**：什么算「讲完了」由 `progress` 说了算，不从目录反推。
- **界面**：v1 没有浏览器半边，只有这三个工具。

## 组织

EnSure Lab / 因需。包名 `dsh-plugin-schedule`，Cordis 插件名 `plugin-schedule`，`inject` 只有 `['tools']`。它跨模式，所以挂在 profile 根，不做成 agent preset。
