# ensure-ILE — DeepSeek Harness Desktop in Learning

最高原则：**以代码为第一信源而非文档**。`src/`、`package.json`、`cordis.patch.yml` 写的东西才算数；本文只记**为什么这么定**和**踩过的坑**，能被代码回答的事实不要在这里重复。改代码顺手改这里，改不动就是设计有问题。

> 这个仓库是 **ensure-ILE**，从 [DSH Desktop](https://github.com/anywhere-labs/dsh-desktop) fork 而来，用来做一件事：
> 把桌面 agent 变成**引导学生自己把题解出来**的工具（Human RL 的 guide 阶段）。
>
> 底座不动：`deepseek-harness/` 是固定的上游子模块，**禁止修改**；桌面外壳、插件机制、打包流程都沿用上游。
> 我们自己的东西全在插件包里，以 bundle 形式挂在 profile 根——壳不知道它们存在。

组织：EnSure Lab / 因需（因=原因、需=需要，即「每一步都要说得清为什么」）。包名统一 `dsh-plugin-` 前缀，不用 npm scope。

## 仓库地图

| 路径 | 是什么 | 什么时候读它 |
| --- | --- | --- |
| `dsh-plugin-desktop/` | 上游桌面壳 2.0.18 + 我们的改动（数据根、OOBE 裁剪、预设、视觉层、打包） | 改外壳 / 窗口 / 设置 / 打包 |
| `dsh-plugin-teaching-commons/` | 四个模式共用的教学文字：安全边界、说话方式、题库规则 + 学科备注 `skills/` + `readNote` | 改「怎么说话」的规矩 |
| `dsh-plugin-setup/` | 开学对话，预设 `setup`「开学」，状态落 `setup.json` | 改开学问话 |
| `dsh-plugin-guide/` | 引导模式，预设 `guide`「引导模式」，**Profile 默认** | 改引导流程 |
| `dsh-plugin-work/` | 独立做题，预设 `work`「独立做题」 | 改判卷 / 重交规则 |
| `dsh-plugin-hrl/` | 答案优化，预设 `hrl`「答案优化」 | 改 A/B 配对 |
| `dsh-plugin-bankmanager/` | 题库：6 工具 + `/bank/api` + 浏览器卡片与首页接续入口 | 改题目账本 |
| `dsh-plugin-textbook/` | 教材语料（7 本入库）+ 3 个读端工具 | 改教材检索 |
| `dsh-plugin-schedule/` | 课表与进度 + 3 个工具（含 `schedule_plan`） | 改「今天讲什么」 |
| `dsh-plugin-memory/` | `@max-null/dsh-memory` v0.18.0 的 fork（14 工具），同步规则见其 `UPSTREAM.md` | 改记忆 / 提示词模板 |
| `dsh-community-fabric/` | 社区互操作 RFC，**纯文档**，不声明可加载入口 | 社区协作 |
| `profiles/ensure-ile/` | 唯一的 profile 模板：`package.json` / `cordis.patch.yml` / `pnpm-workspace.yaml` | 加 bundle、改预设 |
| `scripts/` | 根级校验脚本（bilingual、layout、icons、vendored runtime、run-parallel） | 改门禁 |
| `docs/` | 产品文档；`research/` 研究、`design/` 设计稿与 `screenshots/`、`evidence/` 证据 | 写面向人的文档 |
| `assets/` | 产品截图、社区二维码、图标源 | 发版素材 |
| `.agents/notes/` | 日期化的维护者决策记录（`implemented/` / `proposed/`） | 追溯某个取舍的来龙去脉 |
| `deepseek-harness/` | 固定上游子模块（`dsh-v0.2.1-rc.2`），**禁止修改** | 只读，查上游行为 |

**每个插件包自己的 `README.md` 是该包的信源**（工具表、数据落点、算法、已知限制）。本文不重复包内细节，只写跨包的关系和决定。

## 跑起来

- 开发启动：`Start-Process dsh-plugin-desktop\node_modules\electron\dist\electron.exe dsh-plugin-desktop\lib\main.js`；`ENSURE_ILE_SETUP=full` 看完整 7 屏向导。
- 全量门：`corepack yarn check`（**不跑插件包自己的单测**）。插件包整批：`corepack yarn check:plugins`（见坑·工具链 4）。桌面壳：`corepack yarn workspace dsh-plugin-desktop typecheck|test`。单个插件：`corepack yarn workspace <pkg> typecheck|test|build`。
- 数据隔离：`run()` 把 `DSH_HOME` / `ENSURE_ILE_HOME` / `DSH_AGENTS_HOME` / `userData` 全放 `.ensure-ile/`。
- **`seedProfile()` 只在文件不存在时复制，存在就不覆盖**：改完 `profiles/ensure-ile/` 要删掉 `.ensure-ile/home/profiles/desktop` 再启动，然后手动跑一次 `pnpm install --offline`（校验用 `COREPACK_ENABLE_PROJECT_SPEC=0 corepack pnpm install --offline --no-frozen-lockfile`；直接 `corepack pnpm` 会被根的 `packageManager` 挡住）。
- 会话工作区也在数据根里：`workspace-controller` 的 `documentsDirectory` 被 patch 成 `!!js dshHomePath('..')`，默认工作区落在 `.ensure-ile/deepseek-harness/default-workspace`（上游把叶子目录名写死，拿不到更短的名字）。
- 打包：`corepack yarn dist:win` → `dsh-plugin-desktop/dist/`；**打包后的数据根 = `dirname(ensure-ILE.exe)\.ensure-ile`**，就在安装目录里。

## 数据落在哪

`<DSH_HOME>` = 数据根的 `home`（打包后是 `<安装目录>\.ensure-ile\home`）。

| 数据 | 路径 | 谁写 | 谁读 |
| --- | --- | --- | --- |
| 题目 | `<DSH_HOME>/bank/problems/<id>.json` | `bank_*` | guide / work / hrl / schedule |
| 课表与进度 | `<DSH_HOME>/schedule/schedule.json` | `schedule_update` | `schedule_plan` |
| 开学问话 | `<DSH_HOME>/setup.json` | `setup_update` | `setup_read` |
| 学生固定档案 | `<DSH_HOME>/profile/{grade,schedule,rhythm,preference}.md` | `profile_write` | `profile_read`（不进检索、不占注入预算） |
| 记忆 | global 层 + 会话工作区的 `.dsh/storages/` | `memory_*` | 全体会话 |
| 教材 | `<数据根>/deepseek-harness/default-workspace/教材/`（7 本 PDF + 索引 + 教辅资料） | 人 | `textbook_*`（读的是入库语料，不是 PDF） |

**已知不一致**：老会话的 `identity.cwd` 记过 `C:\Users\libai\Documents\deepseek-harness\default-workspace`，而 `workspace.json` 登记的是数据根那份；教材两边各有一份（Documents 那份 183MB 留作备份）。真机前先确认会话落在哪边。

## 八个插件包怎么接在一起

- **能力面**：web-app 关掉了 base 的工具行，工具只由 preset 挂载，`preset-standard` 禁用后学生只能开这四个预设（setup / guide / work / hrl）。
- **guide 会话实际 28 个工具**：`read_note` + 残留的 `working_directory` + `bank_*`×6 + `textbook_*`×3 + `schedule_*`×3 + memory 注册的 14 个（`memory_*`×8 + `prompt_*`×4 + `profile_*`×2）。`ask_user_question` 只在 standard/ptc/cordis 预设里挂，guide 没有。
- **提示词拼法**：四个模式都 `complete: true` 整份替换，所以共用段（安全边界 / 说话方式 / 题库规则）只在 `teaching-commons` 存一份，各预设 mount 时拼自己的 md。
- **cwd 快照**：上游那条 `required` 的 cwd 快照压不掉，两个预设都用**同名空 context** 盖住它。
- **跨包依赖**：全部本地 `file:` / `link:` 链接、零注册表依赖；兄弟包之间只走 `exports` 子路径（`dsh-plugin-bankmanager/store`、`dsh-plugin-textbook/data`），对方必须出 `lib/types` 声明（tsconfig `paths` 指源码会撞 TS6059）。

## 模式与交接（2026-10-25 定稿，关键事实都有代码出处）

- **模式 = 预设，切换 = 新会话**。`agentPresets.select` 只认空会话（`boundary.lastTurn > 0` 即锁，`deepseek-harness/packages/preset/agent-preset-registry/src/index.ts:351`）；UI 只给空会话挂选择器（`client/ui-agent-preset/src/client/seat-store.ts:214`）；resume 按 `meta.agentPreset` 还原，缺预设直接拒绝恢复。
- **模型切不了自己的模式**。`recompose()` 内部能动但不写 `agent-preset/selected`、不更新投影，重启回到旧预设——所以不做。
- **不做「一个预设内换提示词」**：技术上可行（DeepSeek flash 声明 `systemPromptUpdate: 'in-history'`，新 system 作为历史追加、不重写第 0 条，缓存前缀不破），但 flash 的 `toolUpdate` 是 `addition-only`——只能加工具不能删，按模式换工具集做不到；静态全集又等于隐式预设。所以一个模式一个预设。
- **跨会话只靠 bank + memory，零注入**。新会话靠提示词让模型开场先 `bank_list` 找 pending `handoff`，不用 `agent.inject()`（要额外 host 插件、注入时机含糊、永久占 user 位）。代价是模型可能忘记读。
- **交接卡片**：模型写 `handoff` → 壳渲染卡片 → 学生点 → 客户端 `session.create` + `uiWorkspace.openSession` + `conversation.input.requestDraftInitialization` 把「接着上次那道题：<id>（<状态>）」填进输入框（学生自己按回车，零注入不变）+ `/bank/api` 的 `handoff.consume`。幂等靠列表 + 浏览器 `localStorage`（Host 的 `sessionId` 不能自己命名）。`create` 拿一个已开始过的 sessionId 会静默新开（`api/session-controller/src/agent.ts:488`），所以点之前先查列表。
- **OOBE = 独立 `setup` 预设**，状态 `<DSH_HOME>/setup.json`，**字段级** `{ onboarding, got: { grade, schedule, rhythm, preference } }`，可中断续问；完成判据是「能给出下一步」，不是「问够四样」。
- **A/B（HRL）**：教师轨迹一次写全（按 memory 里的偏好）；学生轨迹是原文；逐小步 `student / teacher / merged`，`merged` 必须存学生自己重写的 `mergedText`；每 3 步 flush，pairing 结束必 flush。
- **收尾规矩**：每轮引导收尾必须问学生一句「这题你自己做出来了吗」；做出来 → `status: review` + `guideOutcome: solved`，没做出来 → 保持 `guide` + `stuck`（写在 `guide.md`）。
- **固定档复习**：`REVIEW_LADDER = [1,3,7,14,30,60,120]`；进 `review` 自动排第一次，`reviewPassed: true` 升一档、`false` 回第一档，爬到最后一档自动 `mastered`。读端是 `bank_list` 的 due 过滤 + `bank_stats` 的到期数。
- **画像字段**：`guide.sessions[]` 带 `affect`（frustrated/neutral/excited）与 `effectiveHint`（confirm/position/feature/structure/result），`bank_update` 可直接写。**进题不进 memory**。

### bank schema v2.1（2026-10-25 实现，源码 `dsh-plugin-bankmanager/src/store.ts`）

```jsonc
{
  "schema": 2,
  "id": "...", "subject": "...", "tags": [], "statement": "...", "attachments": [],
  "status": "new|guide|hrl|review|mastered|parked",
  "createdAt": "...", "updatedAt": "...",
  "guide": {
    "sessions": [{ "sessionId": "...", "startedAt": "...", "endedAt": "...",
                   "outcome": "solved|stuck|abandoned", "whereStuck": "...",
                   "result": "他最后写的原稿", "affect": "...", "effectiveHint": "..." }],
    "insight": "卡在哪、怎么走通的（写给下一次的你）"
  },
  "work": { "attempts": [{ "at": "...", "answer": "学生原文", "verdict": "ok|partial|wrong", "source": "text" }] },
  "hrl": {
    "input": { "at": "...", "from": "work|pasted", "attemptAt": "...", "answer": "拿来打磨的原文" },
    "teacher": { "writtenAt": "...", "answer": "教师版最终答案", "note": "按什么写的（可空）",
                 "steps": [{ "index": 1, "body": "...", "reason": "..." }] },
    "pairings": [{ "at": "...",
      "steps": [{ "index": 1, "studentQuote": "学生原句（逐字）", "teacherStep": 1,
                  "match": "same|partial|missing", "chosen": "student|teacher|merged",
                  "mergedText": "选 merged 时学生自己重写的", "chosenAt": "...", "note": "..." }],
      "result": "逐条选完之后的那份解" }]
  },
  "handoff": {
    "id": "hlt-...", "at": "...", "from": "work", "to": "guide",
    "why": "一句", "state": "这题到哪了",
    "detail": { "lastWords": "学生最后说了什么", "blocker": "卡点", "nextStep": "下一步从哪接" },
    "consumedAt": null, "consumerSessionId": null
  },
  "review": { "nextAt": null, "interval": null, "count": 0, "history": [] },
  "history": [{ "at": "...", "event": "...", "detail": "..." }]
}
```

## 视觉层＝演算纸（2026-10-25 23:30）

- **字体即语义**：宋体＝印刷体（题干 / 教材原文 / 教师版）、楷体＝手写（学生原话）、黑体＝界面。
- **颜色只编码状态**：墨蓝 `primary`、朱批 `destructive`、印章青 `seal`。不做装饰性用色。
- 霞鹜文楷 v1.530 与思源宋体 2.003R 子集到 GB2312 + 数理符号；因 OFL 保留字体名条款改名 `ILE Kai` / `ILE Song`，许可证在 `dsh-plugin-desktop/src/native-ui/assets/fonts/`。
- 画廊入口 `dsh-plugin-desktop/src/native-ui/gallery.html`（进 `vite.native-ui.config.ts` 的 input）；设计稿与截图在 `docs/design/`。

## 验证现状（2026-10-28 重整后复跑，全绿）

- 全量 `corepack yarn check` `EXIT=0`：139 个测试文件 / 1794 用例，1766 通过 / 28 跳过（21 个原有 skip + 7 个 Linux 打包门在 Windows 上整组 skip），104 s。它 = `check:layout` + community-fabric + 桌面包，**不含插件包单测**。
- `corepack yarn check:plugins` `EXIT=0`：setup 7 / bankmanager 45 / memory 189 / textbook 37 / schedule 40 全过，guide / work / hrl / teaching-commons 只 typecheck + build。
- `check:layout` 四组全绿：icons 源与全平台资源一致 / vendored runtime 343 packages @687f282e86 / verify-layout 与上游 687f282e86 一致 / bilingual 43 记录 86 文档；`verify:licenses` 584 production packages；删掉 155 个死补丁与 8 个死 vendor 版本树之后 `corepack yarn install --immutable` 仍 `exit 0`。
- 打包链路只做过离线 install 模拟（profile 模板拷进四级子目录能装出 9 个包、`require.resolve('dsh-plugin-textbook/data')` 在 schedule 的视角下指到 `lib/data.js`）；没重打 `dist:win`。

## 还没做

- **教材锚定最后一步**：真机让模型实读一次教材。要先删 `.ensure-ile/home/profiles/desktop` 再启动（`seedProfile()` 不覆盖）并手动 `pnpm install --offline`。
- **重打 `dist:win`**：`dsh-plugin-textbook` 与 `dsh-plugin-schedule` 进包的 vendor 链路只做了模拟，没跑真实打包。
- **图片链路**（拍照发题 → 模型看得见 → 存进 `attachments`）：李 2026-10-23 说之后搞。
- **独立 Evaluator**（廉价模型按五条硬规则校验上一轮回复：给动作了吗、含答案了吗、一次两个视角了吗、超两句话了吗、空表扬了吗）：等第一条效果数据。

## 明确不做

不是没来得及，是**决定不做**。每条都写了理由，免得下次有人重新提。

| 不做 | 理由 |
| --- | --- |
| 账号 / 多租户 / 权限 / 计费 | 只有一个已知学生。做成多租户反而要求隐私声明、配额、计费，全是成本 |
| 4–24 周学习路径 | 别人的单位是「课程/周」，我们的单位是「一道题」。时间尺度不同，硬套会把题目账本稀释掉 |
| 十种能力的课程工作台 | 越多的能力越容易诱导「直接给答案」——和「逼他自己想出来」相冲 |
| A/B 投票打分界面 | 先存证（`hrl.pairings`），不采集信号。没有并排阅读的界面之前，打分只会变成噪声 |
| 模型自己切模式 | 预设锁定，模型也不能替学生重启会话；切换只能由学生点 |
| 一次会话内换提示词 | flash 的 `toolUpdate` 是 `addition-only`，换工具集做不到；静态全集等于隐式预设 |

## 坑

### profile 与打包

1. `profile-setup/<hash>/state.json.pending` 必须精确 `pending\n`（8 字节）；空文件会让主进程进恢复页。冷启动首屏「正在加载设置…」约 30 秒，不是卡死。
2. 模板路径是**仓库根**的 `profiles/ensure-ile/`，不是 `dsh-plugin-desktop/profiles/`（后者是 `scripts/prepare-profile.mjs` 在 `build` 开头镜像出来的，gitignore）。
3. **不能用 `build.extraResources`**（上游 `tests/package.spec.ts` 明确禁止顶层 extraResources）；用 `build.files` 加 `profiles/**`，`seedProfile()` 打包时读 `app.getAppPath()/profiles/ensure-ile`、开发时读仓库根。
4. 九个本地包（含 teaching-commons——它在 profile 的 `dependencies` 里但不在 `bundles` 里）必须 **vendor 进 `profiles/ensure-ile/vendor/`**，并把包内 `package.json` 的依赖改写成 `file:./vendor/*`——原来的 `file:../../../../` 指到安装目录外，首启 install 必失败。仓库模板不动，开发仍链源码。
5. **覆盖安装会删数据根**：`build/installer.nsh` 用 `$TEMP\ensure-ILE-upgrade.flag` 标记安装，旧卸载器把 `.ensure-ile` 挪到 `$TEMP\ensure-ILE-data`，`customInstall` 再挪回。手动卸载仍然全删。
6. 补丁与 vendor 的运行时间也是死的：`patches/` 只留被根 `package.json` 的 `resolutions` 用 `patch:` 引用到的那些（2026-10-28 删了 155 个旧版本补丁、414 KB），`vendor/dsh-runtime/` 只留 `upstream.json` 指的那一个版本树（同日删了 8 个旧树、160 MB）。**`scripts/sync-vendored-runtime.mjs` 的 `--write` / `--check` 都只看当前版本目录**，旧版本堆积它结构上看不见——清完必须跑 `corepack yarn install --immutable` 证明没断。
7. `materializeSeededProfile()` 在 `node_modules` 缺失时用内置 pnpm 跑 `install --offline --no-frozen-lockfile`——清掉 `.ensure-ile` 后首启会自己装，也可以在 `.ensure-ile/home/profiles/desktop` 手动跑一次。

### 工具链

1. C: 盘满过一次（Yarn 缓存 1.3G）——缓存已用 junction 指到 `D:\yarn-berry-cache`；pnpm store 也吃 C: 盘。
2. `dsh-plugin-desktop/dist/` 会堆到 1.5G（Setup 262MB + `win-unpacked` 1.2G）；要腾地方先删 `win-unpacked`（可重建）。
3. **根 `node_modules` 没有 `.bin`**：包内不能写 `../node_modules/.bin/vitest`，一律 `corepack yarn workspace <pkg> typecheck|test|build`。`build:client` 需要包内有 `vite`（bankmanager devDependencies 8.2.1，跟桌面包同版本）。
4. **根 `corepack yarn check` 不跑插件包自己的单测**（根 `test` 只有 `yarn workspace dsh-plugin-desktop test`，`check` 只串 `check:layout` + community-fabric + 桌面包）——改插件必须自己跑，别拿全绿当验过了。`corepack yarn check:plugins` 是补的这一道（9 包 typecheck + setup/bankmanager/memory/textbook/schedule 的单测，串行约 100 s），但**故意不接进 `check`**：接进去意味着全量门从 346 s 涨到约 445 s，而且 memory 的 189 个用例在并行负载下会撞 5 s 超时（独占跑 23.5 s 全过）——那种红是调度抖动，不是缺陷。
5. bilingual 哈希过期不用手改：`yarn docs:record` 会重算全部记录、只改过期行；`verify-bilingual-docs` 失败时也会提示这条命令。
6. 26 个 Windows 基线单测的教训（已修，别改回去）：POSIX 字面量 `file:///tmp/...` 在 Windows 上 `fileURLToPath` 直接抛 `File URL path must be absolute`，而 `filePath()` 吞异常返回 `undefined` → Profile 边界识别全失效，fixture 要用 `pathToFileURL(join(tmpdir(), ...))`；PATH 用例不能拿 `D:` 喂按 `:` 切分的 PATH；`windowsNodeShim` 要用 `for %%I in ("%~dp0..") do set "X=%%~fI"` 规范化，否则留下未规范化的 `bin\..`。
7. `scripts/verify-cli-runtime.mjs` 期望 `runAsNode: []` 是**断言写错了**：Windows 的私有 node shim 是批处理，子进程丢掉 `ELECTRON_RUN_AS_NODE` 就会起 GUI 而不是 Node，保留它是有意设计。
8. CI 2026-10-25 剪到 Windows 平台：只留 `changes`、`check`、`desktop-windows`、`upstream-command-windows`；macOS/Linux 打包整段删掉（学生只装 Windows）。
9. `.codegraph/` 是本机索引（索引整个仓库含上游子模块，740MB），进 `.gitignore`、不提交；它自带 `.gitignore` 只放行自己。
10. Windows 上 `dsh-plugin-desktop/vitest.config.ts` 把 `testTimeout` 放到 60 s（其它平台仍 5 s）：三条起 `electron.exe` 的用例冷启动实测 22.4 s（Defender 冷扫 244 MB），5 s 默认会把机器成本当成缺陷。历史上 `tests/desktop-runtime-environment.spec.ts:247` 偶发红就是这个原因，不是回归。

### 插件机制

1. **插件最不能丢的是工具**：可选通道（`webServer` / `webStartup`）一律走嵌套 `ctx.inject([...], …)`，写进顶层 `inject` 会让没有 web-app 的 profile 整行 pending、工具全不见。`/bank/api` 就是这么从顶层改嵌套的。
2. 各预设 `complete: true` → **共享段只能有一份**（在 `teaching-commons`），否则四份各自漂移。
3. 上游那条 `required` 的 cwd 快照压不掉，用**同名空 context** 遮蔽。
4. 兄弟包互相 import 只走 `exports` 子路径 + 对方出 `lib/types` 声明；`tsconfig paths` 指源码会撞 TS6059。
5. 宿主侧「路由晚到、工具先有」：路由挂载要能缺席，工具注册不能受它牵连。

### 上游与文档

1. `deepseek-harness/` 禁止修改；子模块 pin 更新单独提交，别和桌面行为改动混在一起。
2. 命名规矩：`README.md` 中文 / `README.en.md` 英文 / `README.zh.md` 只是兼容跳转；`PRIVACY.md`（中文）/ `PRIVACY.en.md`（英文）同规矩，哈希记在 `*.i18n.yaml`。
3. `.dsh/storages/memory_project_*.json`（项目记忆）**进 git**，随仓库分享；代价是每个会话都会把它改脏，工作树几乎永远不干净。这是取舍不是 bug，别顺手 ignore 掉。
4. **`resolutions` 的 patch 选择器是 `标识@描述符` 精确匹配**：写下 `@earendil-works/pi-ai@npm:^1.0.2`，而依赖方声明的是 `npm:^1.1.0`，Yarn 就**静默忽略**这条补丁（lock 里连 `patch:` 标记都没有，安装零告警）——pi-ai 的流式工具参数补丁因此从锁到 1.2.0 起一直没生效，2026-10-28 才被 grep 到。改依赖版本时要 grep 一遍 `patches/` 的选择器是否还匹配实际描述符；现在的对应关系是 `@earendil-works/pi-ai@npm:^1.1.0` → `patches/pi-ai@1.2.0.patch`（删掉每次 delta 的 `block.arguments = parseStreamingJson(...)`，terminating 的 `toolcall_end`/`content_block_stop` 解析保留；副作用是流式过程中的 `partial` 快照拿不到半成品 arguments）。
5. 「以代码为第一信源」的反面教材：文档里写过「插件市场由内置 dshmarket bundle 提供」「Channels 是独立 roadmap」，两者代码里都已不存在，2026-10-28 全文清掉了——别再写回去。**但别把官方的 custom-market 一起删**：`src/desktop-market.ts`、`src/desktop-settings-route.ts`、`src/desktop-settings-contract.ts`、`src/safe-mode.ts`、`src/profile-preferences.ts`、`src/factory-reset.ts` 互相引用，HTTP 路由在 `src/index.ts:233/237` 注册，客户端链路 `src/client/api.ts:368` → `DesktopSettingsSection.tsx:473/684` 都通；`src/client/market-toggle.ts` 只被 `plugin-controls.tsx` 引用、由 `src/client/index.ts:141` 静态注册进 vite 单入口（`vite.client.config.ts:37`），产物里真实可达。死的只是**第三方 dshmarket 的残渣**，2026-10-28 已清（`vitest.config.ts` 的 inline、桌面 `package.json` 的 `dsh.optionalBundles`、`release-mac.ts:104` 那行调用已删脚本 `prepare-dsh-market.mjs` 的死调用）。

---

# DSH Desktop repository rules

This repository owns the desktop product around an unmodified DeepSeek Harness checkout.

## Prerequisites and setup

- Use Node.js `^22.19.0` or `>=24.0.0` and the root Yarn `4.18.0` release through Corepack.
- Initialize the pinned upstream checkout with `git submodule update --init --recursive`.
- Install root dependencies with `corepack yarn install --immutable`.

## Build, run, and verify

- Start the desktop development workflow with `corepack yarn dev`.
- Build the desktop package with `corepack yarn build`.
- ensure-ILE ships **no plugin market**. The upstream rule below applied while `dshmarket` was bundled; this fork removed the dependency, its compatibility patch, and the `market:prepare` / `market:check` / `test:market-release` scripts, so build, dev/start, and packaging commands run the desktop workspace directly. Installed apps do not hot-update executable plugins on launch.
- Run unit tests with `corepack yarn test`.
- Run type checking with `corepack yarn typecheck`.
- Run the complete headless gate with `corepack yarn check`.
- Desktop feature changes apply to `dsh-plugin-desktop/` only. The Beta and Next variant packages were removed, so there is no variant mirror to synchronize and no `check:desktop-variants` gate.
- Run upstream operations through the root scripts, such as `corepack yarn upstream:build`.
- `deepseek-harness/` is a pinned upstream Git submodule. Never edit files inside it from a desktop feature branch.
- `dsh-plugin-desktop/` owns the Cordis Host and Client faces, Electron bootstrap, packaging, and release tests.
- The separate experimental Desktop shell (`dsh-desktop-next/`) was removed; this repository now ships the Stable shell only.
- `dsh-community-fabric/` owns the community interoperability RFC. Until schemas and a reviewed reference adapter exist, it remains a private documentation scaffold and must not declare loadable DSH or package entry points.
- The outer repository and all owned packages use the root Yarn release with `nodeLinker: node-modules`.
- The upstream submodule keeps its own pnpm workspace. Run upstream commands through the root `upstream:*` scripts, whose Yarn portable-shell commands enter the submodule before invoking Corepack.
- Compatibility mode must run the upstream default client without overrides. Advanced presentation belongs to desktop-owned client plugins and may replace documented slots or services through profile composition.
- Keep graphical application launch explicit. Builds, typechecks, unit tests, and Loader smokes must remain headless-safe.
- Commit before major changes of direction and keep the submodule pin update separate from desktop behavior changes.
- Keep the repository topology and package-manager split consistent with the [owning Agent Note](.agents/notes/implemented/process/2026-08-15-pinned-upstream-and-isolated-yarn-workspace.md).
