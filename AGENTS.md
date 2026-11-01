# ensure-ILE — DeepSeek Harness Desktop in Learning

最高原则：**代码是第一信源，不是文档**。`src/`、`package.json`、`cordis.patch.yml` 写了的才算数；本文只记**为什么这么定**和**踩过的坑**。代码能回答的事实不重复。改代码顺手改这里；改不动 = 设计有问题。

> **ensure-ILE**，fork 自 [DSH Desktop](https://github.com/anywhere-labs/dsh-desktop)。只做一件事：把桌面 agent 变成**引导学生自己把题解出来**的工具（Human RL 的 guide 阶段）。
>
> 底座不动：`deepseek-harness/` 固定上游子模块，**禁止修改**；桌面外壳、插件机制、打包流程沿用上游。我们的东西全在插件包，以 bundle 挂在 profile 根——壳不知道它们存在。

组织：EnSure Lab / 因需（因=原因、需=需要，每步说得清为什么）。包名统一 `dsh-plugin-` 前缀，不用 npm scope。

## 仓库地图

| 路径 | 是什么 | 何时读 |
| --- | --- | --- |
| `dsh-plugin-desktop/` | 上游桌面壳 fork（现 `0.1.0-alpha1`）+ 我们的改动（数据根、OOBE 裁剪、预设、皮肤、打包） | 改外壳 / 窗口 / 设置 / 打包 |
| `dsh-plugin-teaching-commons/` | 各模式共用教学文字：安全边界、说话方式、题库规则 + `skills/` 学科备注 + `readNote` | 改「怎么说话」 |
| `dsh-plugin-coreset/` | **会话的核**：唯一 `complete` 提示段、`ctx.ileModes`、`read_note`、`context_switch` + 历史折叠；预设 `work` / `chat` 也在这 | 改共享行为 / 加模式 / 改预设 |
| `dsh-plugin-setup/` | 开学**人格** + `setup_read` / `setup_update` + 条件注册 `setup` 预设 | 改开学问话 |
| `dsh-plugin-guide/` | 引导人格（mode `guide`），只登记文本 | 改引导流程 |
| `dsh-plugin-work/` | 独立做题人格（mode `work`） | 改判卷 / 重交 |
| `dsh-plugin-hrl/` | 答案优化人格（mode `hrl`） | 改 A/B 配对 |
| `dsh-plugin-bankmanager/` | 题库：6 工具 + `/bank/api` + 浏览器卡片与接续入口 | 改题目账本 |
| `dsh-plugin-textbook/` | 教材语料（7 本入库）+ 3 个读端工具 | 改教材检索 |
| `dsh-plugin-schedule/` | 课表与进度 + 3 工具（含 `schedule_plan`） | 改「今天讲什么」 |
| `dsh-plugin-memory/` | `@max-null/dsh-memory` v0.18.0 fork（14 工具），同步规则见其 `UPSTREAM.md` | 改记忆 / 模板 |
| `dsh-community-fabric/` | 社区互操作 RFC，纯文档，不声明可加载入口 | 社区协作 |
| `profiles/ensure-ile/` | 唯一 profile 模板：`package.json` / `cordis.patch.yml` / `pnpm-workspace.yaml` / `brand/` | 加 bundle、改预设 |
| `patches/` | 上游 npm 包补丁 29 份，被根 `resolutions` 引用（1 份暂无施主） | 改上游行为 / 升 pin 重打 |
| `vendor/` | `dsh-runtime/<version>/` 上游运行时 tarball 树（只留 `upstream.json` 那版）+ `dsh-claude-style/` 皮肤源码 | 换 pin / 改皮肤 |
| `upstream.json` | 上游 pin 唯一记录：`commit` / `sourceVersion` / `runtimePackageVersion` / `runtimeSource` | 换 pin |
| `scripts/` | 根级门禁（bilingual、layout、icons、vendored runtime、run-parallel） | 改门禁 |
| `docs/` | 产品文档；`research/` `design/` `screenshots/` `evidence/` | 写面向人的文档 |
| `docs/upstream-sync.md` | 四层身份、29 补丁清单、四类同步流程、失败信号表——同步前必读 | 换 pin |
| `.agents/notes/` | 日期化决策记录（`implemented/` `proposed/`） | 追溯取舍 |
| `deepseek-harness/` | 固定上游子模块（`dsh-v0.2.1-rc.2`），**禁止修改** | 只读查上游行为 |

**每包的 `README.md` 是该包的信源**（工具表、数据落点、算法、限制）。本文只写跨包关系与决定。

## 跑起来

- 开发：`Start-Process dsh-plugin-desktop\node_modules\electron\dist\electron.exe dsh-plugin-desktop\lib\main.js`；`ENSURE_ILE_SETUP=full` 看完整 7 屏向导。
- 全量门 `corepack yarn check`（**不含插件包单测**）。端到端 UI `corepack yarn workspace dsh-plugin-desktop test:ui`（Playwright 驱动真 Electron，约 2 min）。插件包整批 `corepack yarn check:plugins`（坑·工具链 4）。桌面壳 `corepack yarn workspace dsh-plugin-desktop typecheck|test`。单包 `corepack yarn workspace <pkg> typecheck|test|build`。
- 数据隔离：`run()` 把 `DSH_HOME` / `ENSURE_ILE_HOME` / `DSH_AGENTS_HOME` / `userData` 全放 `.ensure-ile/`。
- **`seedProfile()` 只在文件不存在时复制**：改完 `profiles/ensure-ile/` 要删 `.ensure-ile/home/profiles/desktop` 再启动，然后手跑 `pnpm install --offline`（校验用 `COREPACK_ENABLE_PROJECT_SPEC=0 corepack pnpm install --offline --no-frozen-lockfile`；直接 `corepack pnpm` 会被根 `packageManager` 挡）。
- 会话工作区也在数据根：`workspace-controller` 的 `documentsDirectory` patch 成 `!!js dshHomePath('..')`，落 `.ensure-ile/deepseek-harness/default-workspace`（上游叶子目录名写死，短不了）。
- 打包：`corepack yarn dist:win` → `dsh-plugin-desktop/dist/`；**打包后数据根 = `dirname(ensure-ILE.exe)\.ensure-ile`**。
- 版本：`dsh-plugin-desktop/package.json` 的 `version` 是唯一来源，当前 `0.1.0-alpha1`（首版 α，与上游 2.0.18 脱钩）。改它要同步 `dsh-plugin-desktop/tests/package.spec.ts:812` 的断言。

## 上游是谁、我们在哪一层改它（2026-10-29）

四层，同步节奏各不同——换 pin ≠ 重打补丁，改壳 ≠ 改插件。全流程与 29 补丁逐条清单在 `docs/upstream-sync.md`。

- **① 源码底座**：`deepseek-harness/` 子模块，pin `687f282e86` = `dsh-v0.2.1-rc.2`，**工作树零改动**（`git -C deepseek-harness status --short` 必空，`verify-layout` 查）。自带 pnpm 工作区，根经 `corepack yarn upstream:*` 进。
- **② 运行时包**：`@deepseek-ai/*` 从 registry 装，行为改动只落 `resolutions` + `patches/`（52 条 `patch:` → 29 文件）与 `vendor/dsh-runtime/` tarball。**不碰子模块**是硬约定：改它下次换 pin 就冲掉。
- **③ 桌面壳是 fork 不是子模块**：`upstream` remote = `anywhere-labs/dsh-desktop`，共享历史（分叉 `6a63b9730b`，2026-10-18）。上游发版 = `git fetch upstream` + rebase / cherry-pick；2026-10-29 快照相对 `upstream/master`（`092e2ecef7`）落后 33 / 领先 60，冲突热点 `src/index.ts`、`cordis.patch.yml`、`build/installer.nsh`、`scripts/prepare-profile.mjs`。
- **④ 运行时组合**：`profiles/ensure-ile/cordis.patch.yml` 是**运行时 patch**，4 行**全覆写、0 insert**（插行在包层 `dsh-plugin-desktop/cordis.patch.yml`）。`name` 是**守卫不是身份**：对不上打 `patch: name mismatch … skipping` 跳过，`id` 没命中打 `patch: entry … not found`——上游改 row id 或 specifier 时这里**静默不生效**，症状见 `docs/upstream-sync.md` 失败信号表。
- 11 个 workspace 里**只有 `dsh-plugin-desktop`（fork）与 `dsh-plugin-memory`（`@max-null/dsh-memory` fork）有上游**，其余九个上游就是我们自己。

## 数据落在哪

`<DSH_HOME>` = 数据根的 `home`（打包后 `<安装目录>\.ensure-ile\home`）。

| 数据 | 路径 | 写 | 读 |
| --- | --- | --- | --- |
| 题目 | `<DSH_HOME>/bank/problems/<id>.json` | `bank_*` | guide / work / hrl / schedule |
| 课表与进度 | `<DSH_HOME>/schedule/schedule.json` | `schedule_update` | `schedule_plan` |
| 开学问话 | `<DSH_HOME>/setup.json` | `setup_update` | `setup_read` |
| 学生档案 | `<DSH_HOME>/profile/{grade,schedule,rhythm,preference}.md` | `profile_write` | `profile_read`（不进检索、不占注入预算） |
| 记忆 | global 层 + 会话工作区 `.dsh/storages/` | `memory_*` | 全体会话 |
| 教材 | `<数据根>/deepseek-harness/default-workspace/教材/`（7 PDF + 索引 + 教辅） | 人 | `textbook_*`（读入库语料，不是 PDF） |

**已知不一致**：老会话 `identity.cwd` 记过 `C:\Users\libai\Documents\deepseek-harness\default-workspace`，`workspace.json` 登记的是数据根那份；教材两边各一份（Documents 那份 183MB 备份）。真机前先确认会话落哪边。

## 九个插件包怎么接在一起

- **三层**：**核**（`coreset`，一会话一个）+ **人格**（guide / work / hrl / setup / chat，各自只登记一段文本）+ **工具包**（bank / textbook / schedule / memory）。预设把核、人格、工具包装进同一会话。
- **能力面**：web-app 关了 base 的工具行，工具只由 preset 挂。`preset-standard` 禁用后学生只能开 `work` / `chat` / `setup`（仅入学期间）。
- **做题会话 29 个工具**：`read_note` + `context_switch` + 残留 `working_directory` + `bank_*`×6 + `textbook_*`×3 + `schedule_*`×3 + memory 14 个（`memory_*`×8 + `prompt_*`×4 + `profile_*`×2）。`ask_user_question` 只在 standard/ptc/cordis 预设，我们没挂。
- **提示词拼法**：核用一条 `complete: true` 段整份替换（`name: ile`、`order: 0`），渲染**当前模式**人格 + 末尾「## 切换模式」脚注；共用段只在 `teaching-commons` 存一份，人格 mount 时拼自己的 md。**一个 scope 只能一条 `complete` 段**，所以段落、`read_note`、cwd 遮蔽必须集中核里。
- **cwd 快照**：上游那条 `required` 快照压不掉，核用**同名空 context** 盖住。
- **跨包依赖**：全本地 `file:` / `link:`，零注册表依赖；兄弟包只走 `exports` 子路径（`dsh-plugin-bankmanager/store`、`dsh-plugin-textbook/data`、`dsh-plugin-coreset/presets`、`dsh-plugin-setup/presets`），对方须出 `lib/types` 声明（tsconfig `paths` 指源码会撞 TS6059）。

## 模式与交接（2026-10-25 定稿，事实都有代码出处）

- **预设管组队，模式管姿态（2026-10-30 落成）**。预设两个加一个：`work`（起步 `guide`）、`chat`（起步 `chat`）、`setup`（办完条件不注册）。前两个**都挂** coreset + guide + work + hrl + `ile-time-context`，**只差起步模式**——模式清单是「这个预设里挂了哪些人格」的产物（`ileModes` 在 isolate 域里，一预设一份），少挂一个包就等于少一个可切模式；2026-11-01 真机踩过：chat 预设只挂核时 `context_switch({to:'work'})` 必报「没有「work」这个模式」，而 `prompts/chat.md` 恰恰让它一切到做题就切。换**预设** = 开新会话：`agentPresets.select` 只认空会话（`boundary.lastTurn > 0` 即锁，`deepseek-harness/packages/preset/agent-preset-registry/src/index.ts:351`），UI 只给空会话挂选择器（`client/ui-agent-preset/src/client/seat-store.ts:214`），resume 按 `meta.agentPreset` 还原，缺预设直接拒。
- **会话内换人格，不换工具集**：`context_switch({ to, summary })` 只置待办意图（不改历史、不动工具表），**学生下次开口第一个 pre-step** 才落——把 `nodes[1] … nodes.at(-1)` 折成一条交接 `user/message`（`surfaceOp: replace`，node 0 不碰，runtime 随后原地归一 system），同时 append log-only `ile/mode` 事件（重启靠它恢复）。`step !== 1` 一律放过，否则折掉进行中的 tool call、留下无 result 孤儿。
- **工具集只能加不能减**（flash `toolUpdate: 'addition-only'`），同预设里任何模式看到的工具都是并集；换模式只换 `complete` 段文本。**模型不自己切模式**：提示词与工具描述写死「学生没提不要切」，`setup` 更是 `switchable: false`。
- **跨会话只靠 bank + memory，零注入**。新会话靠提示词让模型开场 `bank_list` 找 pending `handoff`，不用 `agent.inject()`（要额外 host 插件、时机含糊、永久占 user 位）。代价：模型可能忘记读。
- **交接卡片**：模型写 `handoff` → 壳渲染卡片 → 学生点 → 客户端 `session.create` + `uiWorkspace.openSession` + `conversation.input.requestDraftInitialization` 把「接着上次那道题：<id>（<状态>）」填进输入框（学生自己回车，零注入不变）+ `/bank/api` 的 `handoff.consume`。幂等靠列表 + `localStorage`（Host `sessionId` 不能自命名）。`create` 拿已开始过的 sessionId 会静默新开（`api/session-controller/src/agent.ts:488`），点前先查列表。
- **OOBE = 条件注册的 `setup` 预设**（`dsh-plugin-setup/presets`，`shouldRegisterSetup(stateFile)` 假就不注册——registry 没有 hidden 字段，「不注册」就是消失，重启生效），状态 `<DSH_HOME>/setup.json`，**字段级** `{ onboarding, got: { grade, schedule, rhythm, preference } }`，可中断续问；完成判据是「能给出下一步」不是「问够四样」。
- **A/B（HRL）**：教师轨迹一次写全（按 memory 偏好）；学生轨迹是原文；逐小步 `student / teacher / merged`，`merged` 必须存学生自己重写的 `mergedText`；每 3 步 flush，pairing 结束必 flush。
- **收尾规矩**：每轮引导收尾必问一句「这题你自己做出来了吗」；做出来 → `status: review` + `guideOutcome: solved`，没做出来 → 保持 `guide` + `stuck`（写在 `guide.md`）。
- **固定档复习**：`REVIEW_LADDER = [1,3,7,14,30,60,120]`；进 `review` 自动排第一次，`reviewPassed: true` 升一档、`false` 回第一档，爬到最后一档自动 `mastered`。读端 `bank_list` 的 due 过滤 + `bank_stats` 到期数。
- **画像字段**：`guide.sessions[]` 带 `affect`（frustrated/neutral/excited）与 `effectiveHint`（confirm/position/feature/structure/result），`bank_update` 可直接写。**进题不进 memory**。

### bank schema v2.1（`dsh-plugin-bankmanager/src/store.ts`）

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

## 视觉层＝皮肤 + 自有品牌（2026-10-31 起，演算纸弃用）

- **演算纸弃用**（李 2026-10-31 定：全盘换 claude-style）。`src/native-ui/shared/theme.css` token 换中性画布 + 蓝绿：浅 `--background:#FFFFFF` / `--primary:#2F7F76` / `--accent:#E8F1EF` / `--border:#E3E5E2`，深 `#191919` / `#4E9C90` / `#1E2B29` / `#2C2C2C`。宋/楷 `@font-face` 与 `font-song` / `font-kai` **只留画廊页**（`src/native-ui/gallery.html`，进 `vite.native-ui.config.ts` input），别处别用回来。
- **语义色照旧**：`--destructive` 朱红（判错）、`--seal` 印章青（通过）是状态编码不是装饰。
- **皮肤 = `vendor/dsh-claude-style`**（0.19.2，MIT，Nwflower），bundle 挂进 `profiles/ensure-ile/package.json`（排 `@deepseek-ai/dsh-web-app` 之后），行配置 `- id: ui-skin-claude-style`：`sodium: on` / `brandName: en∫ure` / `brandInk: accent` / `customAccent: '#4E9C90'` / `homeLayout: classic` / `mascot: off` / `permissionsControl: false`。
- **关掉上游多出来的面**：同一 patch 里 `ui-plugin-manager`、`ui-schedule`、`ui-permission` 三条 `disabled: true`（插件 / 自动化任务两个侧栏 nav 与权限芯片行）。config 深合并，只写 `disabled` 就够。
- **品牌图随包发、启动种进数据根**：宿主读 `<DSH_HOME>/dsh-claude-style/brand/{mark,wordmark}.{png,svg,webp}`；`brandInk: accent` 走 CSS 遮罩（只吃 alpha），wordmark 自带色也没关系。源在 `docs/design/brand/mark/geometric-glyph.svg`（432×640 的 ∫）与 `docs/design/brand/wordmark/geometric.svg`（494×160 的 `en∫ure`），**发版副本在 `profiles/ensure-ile/brand/`**，`src/main.ts` 的 `seedBrandAssets()` 每次启动补缺（已有文件不动，学生换的图不会被覆盖）。**种子目标必须是本实例 `<dataRoot>/home`，不能读 `process.env.DSH_HOME`**——开发机那个变量常指向别人安装（2026-10-31 真踩过）。**只传 wordmark 会让 hero 变回 Claude 橙色放射星**，mark 必须留。
- **侧栏只留字标**：`src/client/brand-styles.ts` 一条全局规则藏 `[data-slot="sidebar"] [data-dsh-claude-part~="brand-mark"]`（字标自带 ∫）；折叠态 `rail-mark` 不藏。hero 的 `∫ + Shapen the world` 保留。
- **字标 `en∫ure`（2026-10-29 李定）**：ensure 的 s 换 LaTeX 积分号 ∫（`\int`）。稿在 `docs/design/brand/`——`NOTES.md` 三版对比与实测度量，`preview.html` 离线可看。
- **应用图标与托盘 geometric**（2026-10-30 李定：geometric、不带 ILE、只落 Windows），仿 JetBrains：圆角方块 + 斜向品牌渐变 + 白 ∫ + 底部白条，托盘 50×50 纯 ∫。生成器 `docs/design/brand/build-icon.mjs`（硬要求：`tray-icon.svg` 里必须有字面 `fill="#4D6BFE"`、禁 `<style>`，所以描边 ∫ 采样转成**填充轮廓**）。产物 `build/app-icon.png`、`build/icons/*.png`、`build/app-icon.ico`、`build/tray-icon.svg` + 6 托盘 PNG。
- **换图标动作**：跑 `build-icon.mjs` → `build/app-icon.resources.json` 更新 `outputs.app-icon.png` 与 `outputs.app-icon.ico` 两个 sha256（`assetIcons.pretty.app-icon.png` 同理）→ `corepack yarn icons:check`。`sourceSha256` 只 digest `app-icon.icon/`，别动。
- **macOS 只剩两件原件**：`app-icon.icon/` 与 `app-icon.icns` 还是上游鲸鱼，须在 macOS 用 `ictool` 重导；**Windows 上改 `app-icon.icon/` 会让 `icons:check` 直接红**。
- `app-icon-mac.png` **不是原件**：`scripts/generate-mac-app-icon.mjs` 从 `app-icon.png` 派生（824 居中 + 每边 100 透明内边距、RGBA16、**ICC 与源逐字节相同**，脚本自校验）。换源图后重跑并更新 `outputs.app-icon-mac.png` 的 sha256——漏掉就红（2026-10-30 踩过）。

## 验证现状（2026-10-31，alpha 首版）

- 全量 `corepack yarn check` `EXIT=0`（2026-10-29 复跑）：138 测试文件 / 1781 用例，1753 通过 / 28 跳过（21 原有 skip + 7 Linux 打包门在 Windows 整组 skip），149 s。= `check:layout` + community-fabric + 桌面包，**不含插件包单测**。
- `corepack yarn check:plugins` `EXIT=0`（2026-10-30）：coreset 11 / setup 11 / bankmanager 45 / memory 189 / textbook 37 / schedule 40 = 333 全过；teaching-commons 与 guide / work / hrl 只 typecheck（无单测，`lib/` 要手跑 `yarn workspace <包> build`）。
- `test:ui` 4 spec / 18 用例全绿，约 2 min。
- `check:layout`：icons 源与全平台资源一致 / vendored runtime 343 packages @687f282e86 / verify-layout 与上游 687f282e86 一致 / bilingual 44 记录 88 文档；`verify:licenses` 584 production packages；`install --immutable` exit 0。
- `node scripts/verify-patch-references.mjs`：29 补丁、28 有效、1 无施主（`dsh-experimental-computer-use-cua-driver-native`，坑·profile 与打包 6）。pi-ai 那份 2026-10-28 已对准 1.2.0 并在 lock 里生效。
- `dist:win` 2026-11-01 重打 `0.1.0-alpha1`（裁包之后，`compression: normal`）：构建 **550 s（9.2 min）**，产物 `dsh-plugin-desktop/dist/ensure-ILE-0.1.0-alpha1-x64-Setup.exe` **172 132 861 B ≈ 164 MiB**，`win-unpacked` 682 M，`resources/app` 208 M（其中 `node_modules` 188 M）；包内 `profiles/ensure-ile/vendor` 10 个本地包齐全，离线 `pnpm install` 能装出 10 个包，coreset 解析到 `lib/index.js`，产物无裸 `zod` import。**同日真机装通**（`D:\Apps\ensure-ILE`，716 M，品牌图与数据根就位，日志 `startup.run.completed` / `rendererStatus: healthy`）。开发迭代用 `dist:win:store`（215 s / 655 MiB），发布只用 `dist:win`。

## 自动化 UI 测试（2026-10-31 落地，李要求）

- 入口 `corepack yarn workspace dsh-plugin-desktop test:ui`（先 `build` 再 `vitest --config vitest.ui.config.ts`），4 spec / 18 用例 / 约 2 min（shell 10、surface 4、flows 3、onboarding 1）。单测门 `yarn test` 用 `vitest.config.ts` 的 `exclude` 排掉 `tests/ui/**`——它要 `lib/` 且慢一个数量级，别接进 `check`。
- 选型 `playwright-core`（1.64.1，devDependency）+ vitest 做 runner，**不引 `@playwright/test`**：不下载 Chromium，驱动 Electron 自带内核，不多一个 runner。代价是没有自动重试 `expect`，用 `tests/ui/fixture.ts` 的 `expectVisible` / `expectHidden` 与 `expect.poll`。
- `tests/ui/fixture.ts` 提供 `createRoot()` / `launchShell()` / `clientPage()` / `skipDesktopSetup()`：临时数据根在 `tmpdir()`，profile 目录照 `profiles/ensure-ile` 写 `package.json` / `cordis.patch.yml` / `pnpm-workspace.yaml`，再给每个 dependency 建 junction；`launchShell(dataRoot, { setup: 'full' })` 逐个覆盖 `ENSURE_ILE_DATA_ROOT` / `DSH_HOME` / `ENSURE_ILE_HOME` / `DSH_AGENTS_HOME` / `DSH_DESKTOP_USER_DATA`（继承的 `DSH_HOME` 会指向真实安装）。
- **三个非显然前置**：① `createRoot()` 必须写 `node_modules/.modules.yaml`（`nodeLinker: hoisted` / `packageManager: pnpm@…` / `virtualStoreDirMaxLength: 60`）与 `pnpm-lock.yaml`（`settings: autoInstallPeers: false`），否则 `src/profile.ts` 的 `profileDependencyMigrationRequired()` 判成 legacy 布局，而开发启动没有打包 pnpm 可迁移 → 停在恢复页；② 跳过开学两步：点「跳过」后再点确认框「跳过设置」（`skipDesktopSetup()` 已封装）；③ `[data-desktop-onboarding-surface]` 遮罩在 Host 回执前**一直挂着吞点击**，等它 `detached`，别等 composer 可见。
- 主题与外壳：`page.emulateMedia({ colorScheme: 'dark' })`（`nativeTheme.themeSource` 打不动渲染进程），浅色断言 `document.documentElement` 背景 `rgb(255, 255, 255)`、深色最亮通道 < 80；折叠侧栏后 `rail-mark` 可见、`brand-name` 隐藏、`aria-label` 从「收起侧边栏」变「打开侧边栏」（不是「展开」）；`账号菜单 → 设置` 的对话框含「桌面设置」、无「插件市场」；composer 占位「描述任务或提出问题」，附件可移除（`aria-label*="移除"`）。
- 七屏向导（`{ setup: 'full' }`）：六标题「选择窗口模式 / 选择窗口材质 / 选择插件市场 / 设置桌面通知 / 设置浏览器访问 / 设置完成」，每屏 `h1` 单行且 ≤40px；点「开始使用」后落回 composer，`appdata/profile-setup/<hash>/state.json` 的 `outcome` → `completed`、同名 `.pending` 消失（**写完对话框几秒后才落盘，要 `expect.poll`**）；同数据根重启后「开始设置」为 0。
  - 顺带发现（未处理）：上游这条七屏仍有「选择插件市场」（`关闭插件市场` / `dsh-market` / `自定义插件市场`），可我们不发市场、也关了 `ui-plugin-manager`。学生走不到（只有 `ENSURE_ILE_SETUP=full` 才出现），哪天放开 `full` 就得先删这屏。
- 断言面（都实测过）：窗口标题、`data-dsh-claude-style`、两张 `dsh-desktop-{brand,workspace}-styles` 样式表、侧栏只剩字标（`brand-mark` hidden / `brand-name` visible）、侧栏无「插件」「自动化任务」、工作区芯片与「添加工作区」/ `row-actions` 隐藏而分组头仍在、`.dsh-claude-perm-btn` 为 0、hero 的 `Shapen the world` + `hero-mark`、贴图后 `[data-has-attachments="true"]` 与缩略图、新会话预设芯片 `Work`、预设选单 `Work`/`Chat`/`Setup` 三条描述、选 `Chat` 后芯片变 `Chat`、品牌图种进 `<root>/home/dsh-claude-style/brand/`。
- **窗口标题别用 `page.title()`**：那是 `document.title`（仍是上游 `DeepSeek Harness`）；Electron 标题要 `app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle())`。

## 还没做

- **教材锚定最后一步**：真机让模型实读一次教材。先删 `.ensure-ile/home/profiles/desktop` 再启动（`seedProfile()` 不覆盖）并手跑 `pnpm install --offline`。
- **新包真机装一遍（发布门槛）**：打包版与开发版路径不同——`app.getAppPath()` 取 profile 模板、首启内置 pnpm 离线装依赖、`seedBrandAssets()` 种品牌图，这三条只在开发数据根验过。装前记得本机残留 `.ensure-ile/home/profiles/desktop` 会盖住新模板。
- **权限没有审批交互**：`workspace-write` 下模型改工作区不会问「同意/拒绝」——`ask_user_question` 与审批 UI 都没挂进我们的预设行。二选一：收紧到 `read-only`，或补审批。只有一个学生会用，按「无伤大雅」放着。
- **native 四个窗口换 token 后没人看过**：恢复页 / 选配置 / 桌面对话框 / 画廊走 `src/native-ui/shared/theme.css` 那套 token，不经 web 客户端，claude-style 管不到；2026-10-31 换蓝绿后没逐屏核过。
- **macOS 图标重导**：`docs/design/brand/mark/geometric-app.svg` 已定稿，但 `app-icon.icon/` 与 `app-icon.icns` 还是鲸鱼（`app-icon-mac.png` 已跟随新源）；要 macOS + Icon Composer 按 `NOTES.md` 落地表重导。
- **图标真机验收**：`icons:check` 与 `check:layout` 绿了，但没人看过任务栏 / 托盘 / 开始菜单的小尺寸（16px 的 ∫ 只有 2px 笔画）。
- **真机验收会话内切换**：折叠靠 `agent/pre-step` 在 turn 边界动手，折叠后那一步会**连着进两条 user 消息**（交接通知 + 学生这句）——上游 plan-mode 的 narration 是这个形状，我们的 provider 组合没实测。不接受就把通知并进学生那条（pre-step 里学生消息已在手上）。
- **两个预设都没有压缩引擎**：host 平面 `compaction-basic` / `command-compact` 被 web-app 设 `disabled: true`（`deepseek-harness/packages/bundle/web-app/cordis.patch.yml:539-543`），跑实例的是预设内部隔离组（`presets/standard.patch.yml:66-82`），而 `work` / `chat` 里只有一个核 → **没有 `/compact`、没有自动压缩，长会话撞窗口硬失败**。补法二选一：预设里加 `cordis:group isolate compaction`，或把 billion-context 接进 profile。
- **billion-context 没接**：0.1.208 装在 `~/.dsh/profiles/desktop`，**改请求不改历史**（全 dist 里 `CompactionEngine` / `compactRegion` / `surfaceOp` 各 0 次），bundle patch 只给 `preset-standard/ptc/minimal/cordis` 加 `inject`，我们两个预设不在名单（host 平面 hook 理论生效，需真机验）。接进来要连 `mysql2` + `zod` 一起 vendor 才能离线装。
- **旧会话不可恢复**：四个静态预设 `guide` / `work` / `hrl` / `setup` 的声明都撤了（现在 `work` 是新做题预设，`guide`/`work`/`hrl` 只是会话内人格）。`meta.agentPreset` 指旧 id 的会话 resume 会被直接拒；要兼容得写一次旧 meta 迁移，暂不做。
- **`scripts/verify-patch-references.mjs` 要不要接进 `check:layout`**：现在孤儿。接进去补丁失配当天就红；代价是它把「vendor 里留着一个没人装的包」这种合法状态也判失败（当前会红一次）。
- **图片链路**（拍照发题 → 模型看得见 → 存进 `attachments`）：李 2026-10-23 说之后搞。
- **独立 Evaluator**（廉价模型按五条硬规则校验上一轮回复：给动作了吗、含答案了吗、一次两个视角了吗、超两句话了吗、空表扬了吗）：等第一条效果数据。

## 明确不做

不是没来得及，是**决定不做**。每条都写了理由，免得下次有人重新提。

| 不做 | 理由 |
| --- | --- |
| 账号 / 多租户 / 权限 / 计费 | 只有一个已知学生。做成多租户反而要隐私声明、配额、计费，全是成本 |
| 4–24 周学习路径 | 别人的单位是「课程/周」，我们的单位是「一道题」。时间尺度不同，硬套会稀释题目账本 |
| 十种能力的课程工作台 | 能力越多越容易诱导「直接给答案」——和「逼他自己想出来」相冲 |
| A/B 投票打分界面 | 先存证（`hrl.pairings`），不采集信号。没有并排阅读界面之前，打分只会变噪声 |
| 模型自己决定换模式 | `context_switch` 只由「学生明确要换」触发（提示词与工具描述写死），`setup` 更是 `switchable: false`；姿态是学生的选择 |
| 按模式裁剪工具集 | 一个会话里工具只能加不能减（flash `toolUpdate` 是 `addition-only`），每次切换重写工具声明还会破缓存前缀；静态全集 + 只换人格文本更省事 |
| 提示词里写「忽略以上内容」当清空上下文 | token 一分不省；学生屏幕与模型看到的东西不一致；审计与回放断裂 |
| 模型自己触发「清空上下文」 | 与「模型自己切模式」同类越权；清空会把卡点线索一起扔，触发只能由学生 |

## 坑

### profile 与打包

1. `profile-setup/<hash>/state.json.pending` 必须精确 `pending\n`（8 字节）；空文件让主进程进恢复页。冷启动首屏「正在加载设置…」约 30 秒，不是卡死。
2. 模板路径是**仓库根**的 `profiles/ensure-ile/`，不是 `dsh-plugin-desktop/profiles/`（后者是 `scripts/prepare-profile.mjs` 在 `build` 开头镜像出来的，gitignore）。
3. **不能用 `build.extraResources`**（上游 `tests/package.spec.ts` 禁止顶层 extraResources）；用 `build.files` 加 `profiles/**`，`seedProfile()` 打包时读 `app.getAppPath()/profiles/ensure-ile`、开发时读仓库根。
4. 九个本地包（含 teaching-commons——它在 `dependencies` 但不在 `bundles`）必须 **vendor 进 `profiles/ensure-ile/vendor/`**，并把包内 `package.json` 依赖改写成 `file:./vendor/*`——原 `file:../../../../` 指到安装目录外，首启 install 必失败。仓库模板不动，开发仍链源码。
5. **覆盖安装会删数据根**：`build/installer.nsh` 用 `$TEMP\ensure-ILE-upgrade.flag` 标记安装，旧卸载器把整个 `.ensure-ile` 停到 `$INSTDIR\..\ensure-ILE-data`，`customInstall` 再搬回（旧版本停在 `$TEMP`，安装端仍认那个位置）。**停车点必须与 `$INSTDIR` 同卷**：NSIS `Rename` 只能同盘搬目录，跨盘失败只置错误标志，卸载器随后递归删 `$INSTDIR`——`$TEMP` 在 C:、应用装 D: 的机器上就是静默丢数据。`Rename` 失败用 `robocopy /E /MOVE` 兜底（`CopyFiles` 不递归）。手动卸载仍全删。回归在 `dsh-plugin-desktop/tests/installer-nsh.spec.ts`。
6. 补丁与 vendor 运行时是死的：`patches/` 只留被 `resolutions` 用 `patch:` 引到的（2026-10-28 删 155 个旧补丁 / 414 KB），`vendor/dsh-runtime/` 只留 `upstream.json` 那版（同日删 8 个旧树 / 160 MB）。**`scripts/sync-vendored-runtime.mjs` 的 `--write` / `--check` 只看当前版本目录**，旧版本堆积结构上看不见——清完必须跑 `corepack yarn install --immutable` 证明没断。**被 resolutions 引用 ≠ 生效**：判据是 `yarn.lock` 里有没有 `@patch:` 条目（坑·上游与文档 4）；`node scripts/verify-patch-references.mjs` 打印 29 份各自有效性；`dsh-experimental-computer-use-cua-driver-native` 「无施主」是**合法状态**（整个 computer-use 分支不在依赖图里，补丁等它回来），别当垃圾删。
7. `materializeSeededProfile()` 在 `node_modules` 缺失时用内置 pnpm 跑 `install --offline --no-frozen-lockfile`——清掉 `.ensure-ile` 后首启自己装，也可在 `.ensure-ile/home/profiles/desktop` 手跑。
8. **别把用不到的运行时装进 Windows 包**（2026-11-01 李定）：体积全压在 `resources/app/node_modules`（697 M → 426 M 靠这一串负向规则，判据是「有没有行挂它」而不是「看着没用」）：
   - **非本架构**：`libreoffice-kit-win32-arm64`(174 M) / `sharp-win32-arm64`(17 M) / `ripgrep-win32-arm64` / `koffi-win32-arm64` / `node-addon-require-builtin-win32-arm64-msvc` / `node-pty/prebuilds/win32-arm64`；
   - **一个行都挂不到**：`@deepseek-ai/dsh-experimental-inspector`(22 M)、`sherpa-onnx-{node,win-x64}`(23 M，语音链没行)、`@modelcontextprotocol/{client,core}`(22 M，只有未挂的 `dsh-acp` import 它们)、`@agentclientprotocol/sdk` + `dsh-acp`、`@mixmark-io/domino` + `turndown`（只有被关掉的 `tool-web` 用）；
   - **`@deepseek-ai/libreoffice-kit-win32-x64`(182 M)**：只服务右栏 Office 预览（`.docx/.xlsx/.pptx` 经 `office-to-pdf` 转 PDF）。李 2026-11-01 决定删，学生做题用不到；代价是打开 Office 文档报 `Required LibreOfficeKit native package is missing`，PDF / 文本 / 代码 / 图片照旧，启动不变（本来就按需 require）。
   - 删法只用 `build.win.files` 负向规则，**不动 dependencies**：inspector / voice / mcp-client 是壳的直接依赖，但同时被 `@deepseek-ai/dsh` 聚合包依赖，光改依赖图一个包都省不掉；而 afterPack 门禁 `verify-packaged-runtime.ts` 钉死的 pnpm / ripgrep 的 rg.exe / node-pty conpty 四件 / web-frontend / `dsh/lib/*.js` 一个都不能排。
9. **`nsis.useZip` 不能用（2026-11-01 真机装不上，当天撤掉）**：它把内层负载从 `app-64.7z`（`Nsis7z::Extract`）换成 `app-64.zip`（`nsisunz::Unzip`，判据在 `app-builder-lib/out/targets/nsis/NsisTarget.js:78` 与 `templates/nsis/include/extractAppPackage.nsh:82`）。真机报 `Failed to decompress files`；包本身无罪（抠出 `app-64.zip` 跑 `7z t` 13823 文件 / 684 MB 全 OK），坏的是那个插件——用最小 NSIS 脚本直连 `nsisunz::Unzip`，喂只有两个文件、路径短到 `D:\z.zip` 的 zip 也返回 `Error opening ZIP file`，解出 0 文件；换 zip 来源、路径长短、参数顺序、ANSI/Unicode 编译全一样。要救得自带可用 DLL 或 fork 模板，只为省 5 min 构建不值。
   **压缩档位是另一回事**（`build.win.compression`，2026-11-01 实测同样内容）：`normal` = 550 s / 164 MiB；`store` = 215 s / 655 MiB（内层 7z 走 Copy，仍是 `Nsis7z`，安全）。约定：**开发用 `corepack yarn dist:win:store`，发布用 `corepack yarn dist:win`**；CI smoke 走 `DSH_WINDOWS_PACKAGE_COMPRESSION`（`scripts/package-win.ts:30-41`），别把 store 的包发出去。
10. **bundle 的 row id 不能和上游撞**（2026-10-30 首启硬失败）：web-app 已有 `id: schedule`，`dsh-plugin-schedule/cordis.patch.yml` 当年也 insert 同名行 → `prepareDesktopProfile` 的 `assertUniqueEntryIds`（`src/profile.ts:1194-1207`，在 `profile.ts:1488` 调用）抛 `duplicate loader entry id "schedule" in the composed profile`，应用进恢复页、任何插件没跑起来。现在叫 `ile-schedule`；**新 insert 行一律加 `ile-` 前缀**，别复用上游短名（`schedule` / `memory` / `textbook`）。回归是 `tests/ensure-ile-profile.spec.ts`：种模板进临时 home、依赖 junction 到仓库包、真跑 `prepareDesktopProfile` 断言 id 无重复。恢复页取消勾选只写 `desktopDeselectedBundles` 这个 UI 账本，合成 profile 只看 `dsh.profile.bundles`——那是绕过不是修好。

### 工具链

1. C: 盘满过一次（Yarn 缓存 1.3G）——缓存已 junction 到 `D:\yarn-berry-cache`；pnpm store 也吃 C:。
2. `dsh-plugin-desktop/dist/` 会堆到 1.5G（Setup 262MB + `win-unpacked` 1.2G）；腾地方先删 `win-unpacked`（可重建）。
3. **根 `node_modules` 没有 `.bin`**：包内别写 `../node_modules/.bin/vitest`，一律 `corepack yarn workspace <pkg> typecheck|test|build`。`build:client` 需要包里有 `vite`（bankmanager devDependencies 8.2.1，同桌面包版本）。
4. **根 `corepack yarn check` 不跑插件包单测**（根 `test` 只有 `yarn workspace dsh-plugin-desktop test`）——改插件必须自己跑。`corepack yarn check:plugins` 是补的那道（9 包 typecheck + setup/bankmanager/memory/textbook/schedule 单测，串行约 100 s），**故意不接进 `check`**：接进去全量门从 346 s 涨到约 445 s，且 memory 189 用例在并行负载下会撞 5 s 超时（独占跑 23.5 s 全过）——那种红是调度抖动不是缺陷。
5. bilingual 哈希过期不用手改：`yarn docs:record` 重算全部记录、只改过期行；`verify-bilingual-docs` 失败时也会提示。
6. 26 个 Windows 基线单测的教训（已修，别改回去）：POSIX 字面量 `file:///tmp/...` 在 Windows 上 `fileURLToPath` 直接抛 `File URL path must be absolute`，而 `filePath()` 吞异常返回 `undefined` → Profile 边界识别全失效，fixture 要用 `pathToFileURL(join(tmpdir(), ...))`；PATH 用例不能拿 `D:` 喂按 `:` 切分的 PATH；`windowsNodeShim` 要用 `for %%I in ("%~dp0..") do set "X=%%~fI"` 规范化，否则留下未规范化的 `bin\..`。
7. `scripts/verify-cli-runtime.mjs` 期望 `runAsNode: []` 是**断言写错了**：Windows 私有 node shim 是批处理，子进程丢掉 `ELECTRON_RUN_AS_NODE` 就会起 GUI 而不是 Node，保留是有意设计。
8. CI 2026-10-25 剪到 Windows：只留 `changes`、`check`、`desktop-windows`、`upstream-command-windows`；macOS/Linux 打包整段删（学生只装 Windows）。2026-10-31 加 `release-windows.yml`：推 `v*` tag 才出 Release，tag 与 `package.json` 版本不一致直接失败。
9. `.codegraph/` 是本机索引（索引整个仓库含上游子模块，740MB），进 `.gitignore`、不提交；它自带 `.gitignore` 只放行自己。
10. Windows 上 `dsh-plugin-desktop/vitest.config.ts` 把 `testTimeout` 放到 60 s（其它平台 5 s）：三条起 `electron.exe` 的冷启动实测 22.4 s（Defender 冷扫 244 MB），5 s 默认会把机器成本当缺陷。历史上 `tests/desktop-runtime-environment.spec.ts:247` 偶发红就是这个原因。

### 插件机制

1. **插件最不能丢的是工具**：可选通道（`webServer` / `webStartup`）一律走嵌套 `ctx.inject([...], …)`，写进顶层 `inject` 会让没有 web-app 的 profile 整行 pending、工具全不见。`/bank/api` 就是这么从顶层改嵌套的。
2. **一个 scope 只能一条 `complete` 提示段**：第二条生效时 `systemPrompt.section()` 抛 `multiple complete prompt sections are active`（`deepseek-harness/packages/core/system-prompt/src/index.ts:653-656`）。所以段、`read_note`、cwd 遮蔽全集中 `coreset`——人格包只登记文本，谁也别再自己 `section({ complete: true })`。
3. **同名工具在一个 scope 只能注册一次**：再注册抛 `tool "x" is already registered in this scope`（`packages/core/tools/src/index.ts:747-749`）。guide / work / hrl 各注册一份 `read_note` 是这次重构的直接起因。
4. **工具集只能加不能减**（flash `toolUpdate: 'addition-only'`，`packages/llm/llm/src/types.ts:416-425`）；`tools.restrict()` 还要求传 `agent.ctx`，只遮全局名。所以「按模式换工具」在模型层就是断的。
5. **zod 不在宿主模块表里**：全仓只有 memory（esbuild 打包）与 coreset 运行时 import 它。tsdown 默认外置 → 产物 `import { z } from "zod"` 在 profile 里解析不到；要么 `noExternal: ['zod']` 内联（coreset 做法，`lib/index.js` 125.6 kB / gzip 27.4 kB），要么自己 esbuild 打进，别写成 peerDep 就以为没事。
6. `agentPresets.register()` 返回 disposer 且**必须 await**（generator 里 `yield await …`）；registry **没有 hidden 字段**，`list()` 每次现读 definitions——「不注册」就是消失，条件注册（setup）只能在 apply 时决定，重启才生效。
7. 预设里的插件名按包名从 profile 解析：包必须在 profile `dependencies` 里，**哪怕不在 `bundles` 里**（guide / work / hrl 就只靠 dependencies 被点名）。
8. 上游那条 `required` 的 cwd 快照压不掉，用**同名空 context** 遮蔽（只在 coreset 一处）。
9. 兄弟包互相 import 只走 `exports` 子路径 + 对方出 `lib/types` 声明；`tsconfig paths` 指源码会撞 TS6059。
10. 宿主侧「路由晚到、工具先有」：路由挂载要能缺席，工具注册不能受它牵连。
11. **一个服务在一个 realm 只能有一份**（2026-10-30 首启踩的）：三个预设各 mount 一份核，核各 provide 一个 `ileModes` → 第二个核构造即抛 `service "ileModes" has been registered`，registry 又把「发布到 root realm 的服务」判成泄漏、整条预设被拒（`Preset services require isolate realms: ileModes`；判据 `agent-preset-registry/src/mount.ts` 的 `leakedServices`——impl 的 store symbol 等于 `rootIsolate[name]` 就算泄漏）。修法照 `bundle/web-app/presets/standard.patch.yml`：把 provider 与消费者包进**同一个** `{ name: 'cordis:group', group: true, isolate: { ileModes: true }, config: [...] }`——`isolate` 落 group 那行、子行继承同一 realm（符号按 entry 身份生成，每个预设各得一份），`systemPrompt` / `tools` / `sessionProjections` 仍解析到 Host 唯一实例。判据在 `dsh-plugin-coreset/src/presets.ts` 的 `ileRealm()` 与 `dsh-plugin-setup/src/presets.ts`，测试断言「顶层只有一行，且 `isolate.ileModes === true`」——别往顶层加裸行。

### 客户端与界面

1. **客户端 bundle 的所有 CSS 都被 `@scope (:root:has(.dshDesktopOnboardingContent))` 包住**：`vite.client.config.ts` 的 `onboardingStyles` 插件在 `generateBundle` 把整份 CSS 一裹、内联进 `client.js`（意图「向导关掉后别污染会话界面」）。所以**改侧栏 / 会话 / 皮肤的选择器不能写成 `.css` 再 import**——只在向导打开时生效，症状是「CSS 确实进了 `lib/client.js`、构建成功、截图一个像素没变」（2026-10-31 为此白跑两轮）。全局规则一律写成 `install*Styles()` 模块（`src/client/sidebar-footer-styles.ts`、`brand-styles.ts`），在 `apply()` 里 `ctx.effect(() => install…())` 建 `<style>`。
2. **「不知道是哪个元素画的」就别猜选择器**：`electron.exe --remote-debugging-port=9333 lib/main.js` 起 dev，`http://127.0.0.1:9333/json/list` 取 `webSocketDebuggerUrl`，Node 24 内置 `WebSocket` 发 `Runtime.evaluate`（`returnByValue: true`）——能查 `getComputedStyle`、逐个试 `element.matches(sel)`、列 `document.styleSheets` 里真命中的规则（含 `!important`）。比「改-打包-截图」快一个数量级。
3. **`vendor/dsh-claude-style` 是 vendored 源码不是 registry 包**：`lib/client.js` 有两处手改 slogan（`function E3(e){return "Shapen the world"}` studio 首屏，`function x3(e,t){…}` classic 首屏），升级会冲掉，改完 grep `Shapen the world` 确认两处都在。它不在根 workspace 里，所以 `prepare-profile.mjs` 对 `LOCAL_PACKAGES` 里的包先找 `<repo>/<name>`、找不到再找 `<repo>/vendor/<name>`——别把它从 `LOCAL_PACKAGES` 删掉，否则 profile 里 `file:../../../../vendor/dsh-claude-style` 在安装目录解析不到。

### 上游与文档

1. `deepseek-harness/` 禁止修改；子模块 pin 更新单独提交，别和桌面行为改动混一起。
2. 命名规矩：`README.md` 中文 / `README.en.md` 英文（根目录的 `README.zh.md` 兼容页 2026-11-01 已删，别再加回来）；`PRIVACY.md`（中文）/ `PRIVACY.en.md`（英文）同规矩，哈希记在 `*.i18n.yaml`。
3. **项目记忆 `.dsh/storages/memory_project_*.json` 不进 git**（2026-10-31 李定，反转 10-28 的旧决定）：它是本机会话运行时写脏的账本，提交进来工作树永远不干净，还会把本机路径 / 会话细节一起分享出去。`.gitignore` 的 `.dsh/` 别删；要分享的项目知识写进 `AGENTS.md` / 包 `README.md` / `.agents/notes/`。
4. **`resolutions` 的 patch 选择器是 `标识@描述符` 精确匹配**：写 `@earendil-works/pi-ai@npm:^1.0.2` 而依赖方声明 `npm:^1.1.0`，Yarn 就**静默忽略**（lock 里连 `patch:` 标记都没有，安装零告警）——pi-ai 的流式工具参数补丁因此从锁到 1.2.0 起一直没生效，2026-10-28 才被 grep 到。改依赖版本时 grep 一遍 `patches/` 选择器；`node scripts/verify-patch-references.mjs` 干这个（打印每份补丁有没有施主，非 0 表示有失效）。现对应 `@earendil-works/pi-ai@npm:^1.1.0` → `patches/pi-ai@1.2.0.patch`（删掉每次 delta 的 `block.arguments = parseStreamingJson(...)`，terminating 的 `toolcall_end` / `content_block_stop` 解析保留；副作用是流式过程中 `partial` 快照拿不到半成品 arguments）。
5. **桌面壳同步不是 checkout 而是 rebase**：`upstream` remote = `anywhere-labs/dsh-desktop`，共享历史（分叉 `6a63b9730b`）。换新版 `git fetch upstream` 再 rebase / cherry-pick，冲突热点 `src/index.ts`、`cordis.patch.yml`、`build/installer.nsh`、`scripts/prepare-profile.mjs`；四层流程与失败信号表在 `docs/upstream-sync.md`。
6. `scripts/bilingual-docs.mjs:87` 用 `git ls-files '*.i18n.yaml'` 枚举——**没 `git add` 的 i18n 文件对双语门完全不可见**，`docs:record` 与 `check:bilingual-docs` 会绿着放行。新增成对文档先 `git add` 再跑门。
7. 「以代码为第一信源」的反面教材：文档写过「插件市场由内置 dshmarket bundle 提供」「Channels 是独立 roadmap」，代码里都不存在，2026-10-28 全文清掉——别再写回去。**但别把官方 custom-market 一起删**：`src/desktop-market.ts`、`src/desktop-settings-route.ts`、`src/desktop-settings-contract.ts`、`src/safe-mode.ts`、`src/profile-preferences.ts`、`src/factory-reset.ts` 互相引用，HTTP 路由在 `src/index.ts:233/237` 注册，客户端 `src/client/api.ts:368` → `DesktopSettingsSection.tsx:473/684` 都通；`src/client/market-toggle.ts` 只被 `plugin-controls.tsx` 引用、由 `src/client/index.ts:141` 静态注册进 vite 单入口（`vite.client.config.ts:37`），产物里真实可达。死的只是**第三方 dshmarket 残渣**，已清（`vitest.config.ts` 的 inline、桌面 `package.json` 的 `dsh.optionalBundles`、`release-mac.ts:104` 对已删脚本 `prepare-dsh-market.mjs` 的死调用）。
