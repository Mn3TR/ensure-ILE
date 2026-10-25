# ensure-ILE — DeepSeek Harness Desktop in Learning

最高原则：**以代码为第一信源而非文档**

> 这个仓库是 **ensure-ILE**，从 [DSH Desktop](https://github.com/anywhere-labs/dsh-desktop) fork 而来，用来做一件事：
> 把桌面 agent 变成**引导学生自己把题解出来**的工具（Human RL 的 guide 阶段）。
>
> 底座不动：`deepseek-harness/` 是固定的上游子模块，**禁止修改**；桌面外壳、插件机制、打包流程都沿用上游。
> 我们的东西集中在 `dsh-plugin-guide/`（引导模式）、`dsh-plugin-bankmanager/`（题库）与 `dsh-plugin-memory/`（学生记忆），三者都以 bundle 的形式挂在 profile 根，壳不再知道它们的存在。
>
> 下面「DSH Desktop repository rules」是上游规则，对本仓库仍然全部有效。

## 当前状态（2026-10-25 23:58）

**组织**：EnSure Lab / 因需（因=原因、需=需要，即「每一步都要说得清为什么」）。包名统一 `dsh-plugin-` 前缀，不用 npm scope。

**仓库形态**（9 个 workspace + 1 个占位目录）：
- `dsh-plugin-desktop/`：上游桌面壳（2.0.18）+ ensure-ILE 改动（数据根、OOBE 裁剪、引导模式预设、视觉层）。**视觉层＝演算纸**（2026-10-25 23:30）：宋体＝印刷体（题干/教材原文/教师版）、楷体＝手写（学生原话）、黑体＝界面；颜色只编码状态（墨蓝 `primary`、朱批 `destructive`、印章青 `seal`）。霞鹜文楷 v1.530 与思源宋体 2.003R 子集到 GB2312 + 数理符号，因 OFL 保留字体名条款改名 `ILE Kai` / `ILE Song`，许可证在 `src/native-ui/assets/fonts/`；`src/native-ui/gallery.html` 是画廊入口（进 `vite.native-ui.config.ts` 的 input），设计稿与截图在 `docs/design/`。
- `dsh-plugin-teaching-commons/`：**四个模式共用的教学文字**——安全边界、说话方式、题库规则（`prompts/common.md`、`prompts/bank.md`）+ 学科备注（`skills/{math,arts}.md`）+ `readNote` 实现。各预设 `complete: true` 整份替换，所以共用段必须只有一份（2026-10-25 抽出）。
- `dsh-plugin-setup/`：**开学对话**（预设 id `setup`、显示「开学」）——问年级/课表/作息/解题偏好，进度字段级落在 `<DSH_HOME>/setup.json`；两个工具 `setup_read` / `setup_update`；完成判据是「能说出下一步」（`next` 有内容），不是问齐四样。默认预设仍是 guide（2026-10-25 加）。
- `dsh-plugin-guide/`：guide 模式——系统提示 = commons 的 common + bank 片段 + `prompts/guide.md`；`read_note` 委托给 commons；预设 id `guide`、显示「引导模式」，是 Profile 默认预设。两个预设都用同名空 context 遮蔽上游那条 `required` 的 cwd 快照。
- `dsh-community-fabric/`：社区互操作 RFC，纯文档，不声明可加载入口。
- `dsh-plugin-bankmanager/`：题库插件。六个工具（add / list / show / update / stats / resume），一道题一个 JSON，存 `<DSH_HOME>/bank/problems/`；以 bundle 挂在 profile 根，guide / work / HRL / schedule 共用。宿主侧 `src/`（工具 + `/bank/api` 路由），浏览器半边 `src/client/`（交接卡片 + 空白会话首页的接续入口，见下）。它 `inject` 了 `webServer` / `webStartup`，所以只在带 web-app bundle 的 profile（桌面壳）里激活——纯 headless profile 里这行会一直 pending，别把题库挂进去。
- `dsh-plugin-memory/`：`@max-null/dsh-memory` v0.18.0 的 fork（包名 `dsh-plugin-memory`，已注册 workspace、已接 profile，zod 打包内联）；同步规则见 `dsh-plugin-memory/UPSTREAM.md`。
- `dsh-plugin-work/`：**独立做题**（预设 id `work`、显示「独立做题」）——学生自己做、交上来，判结果和过程两件事；重交只给一次，讲不清就写 `handoff` 让他转 guide（2026-10-25 实现）。
- `dsh-plugin-hrl/`：**答案优化**（预设 id `hrl`、显示「答案优化」）——学生已有答案，教师轨迹一次写全，再逐小步 A/B（`student / teacher / merged`，`merged` 必须学生自己写）（2026-10-25 实现）。
- 占位（只有 README，无 `package.json`、未进 workspaces）：`dsh-plugin-schedule/`（课表+进度→明天讲什么/今日预习复习）。
- 已删：Beta/Next 变体、`dsh-community-market/`、`vendor/agents-anywhere/`（含全部 AA 接线）；2026-10-22 又删了 `_deprecated/`（上游 0.1.x 归档）、Next 交接提示（`next-transition-notice` 与 `docs/stable-next-transition`）、`upstream.json` 的 beta channel，以及旧 profile 的 retired bundle 兼容层（`RETIRED_BUNDLES`/`RETIRED_ROW_IDS`——ensure-ILE 的 profile 都在 `.ensure-ile` 里新种，永远不读旧 profile，2026-10-22 李确认后删）；插件市场整个从构建里拿掉（`dshmarket` 依赖、`.yarn/patches/dshmarket-*.patch`、`scripts/prepare-dsh-market.mjs`、三个 market 脚本与 `market:prepare` 的全部调用点、`dshmarket-compat.spec.ts`），学生装不了插件也不需要装。
- 能力面与载荷（2026-10-22 精简）：web-app 关掉了 base 的工具行、工具只由 preset 挂载，所以 `preset-standard` 禁掉后学生只能开这四个 ensure-ILE 预设（setup / guide / work / hrl）；guide 会话实际有 22 个工具：`read_note` + base 残留的 `working_directory` + `bank_*`×6 + memory 插件注册的 14 个（`memory_*`×8 + `prompt_*`×4 + `profile_*`×2）（`ask_user_question` 只在 standard/ptc/cordis 预设里挂，guide 没有）；打包只带 Node+pnpm 载荷，实测 109MB（原 265MB），Python 解释器、Office 技能和 `load_workspace_dependencies` 一起删了，`desktop-office.ts` 已不存在。

**能跑**：`Start-Process dsh-plugin-desktop\node_modules\electron\dist\electron.exe dsh-plugin-desktop\lib\main.js`，composer 预设默认「引导模式」；`ENSURE_ILE_SETUP=full` 可看完整 7 屏向导。
**数据隔离**：`run()` 把 `DSH_HOME`/`ENSURE_ILE_HOME`/`DSH_AGENTS_HOME`/`userData` 全放 `.ensure-ile/`；`seedProfile()` 复制 `profiles/ensure-ile/` 的 `package.json`、`cordis.patch.yml` 与 `pnpm-workspace.yaml`，**不装依赖**——清掉 `.ensure-ile` 后要手动在 `.ensure-ile/home/profiles/desktop` 跑一次 `pnpm install --offline`（七个本地包都是 `file:` 链接、零注册表依赖，离线可装；加包后要在 profile 里 `CI=true pnpm install --offline --no-frozen-lockfile`）。**会话工作区也在数据根里**：`workspace-controller` 的 `documentsDirectory` 被 patch 成 `!!js dshHomePath('..')`，默认工作区因此落在 `.ensure-ile/deepseek-harness/default-workspace`（上游把叶子目录名写死成 `deepseek-harness/default-workspace`，所以拿不到更短的 `.ensure-ile/workspace`）。**已知不一致（2026-10-25 09:36 查）**：08:19 那次真机会话的 `identity.cwd` 记的是 `C:\Users\libai\Documents\deepseek-harness\default-workspace`，而 `workspace.json` 登记的是 `.ensure-ile\deepseek-harness\default-workspace`；教材两边各有一份 183MB。下次真机前先确认会话落在哪边。

**共享数据层（guide / setup / work / hrl / schedule 都指着它）**：六个 bundle（setup / guide / work / hrl / bank / memory）都已接进 profile，全部本地 `file:` 链接、零注册表依赖。
- **记忆**：本地 fork `dsh-plugin-memory` 0.18.0-ensure-ile.1（上游 v0.18.0 的 fork，zod 已打包内联，client id 由包名生成）。工具是 profile 根注册的，所以**所有会话都能看到** `memory_*`；它的提示段会被 guide 的 `complete: true` 吞掉，模型只能靠工具描述理解它。存量按「global / 当前工作区」两层，工作区层落在会话工作区的 `.dsh/storages/`。**2026-10-25 08:19 真机跑过一道题**（待办 1），但那次会话里 `memory_*` 有没有真的被调用还没查。
- **题库**：`dsh-plugin-bankmanager` 已实现——六个工具（`bank_add` / `bank_list` / `bank_show` / `bank_update` / `bank_stats` / `bank_resume`），一道题一个 JSON 文件（`<DSH_HOME>/bank/problems/<id>.json`，id = `YYYYMMDD-<slug>-<6 位 hex>`，subject 自由写、只归一化进 id），原子写 + 跨进程锁 + 坏文件只跳过。挂在 profile 根，后续 work / HRL / schedule 共用同一份。**浏览器半边（2026-10-25 23:30）**：`src/client/` 认领 `tool.call.toolview` 的 `bank_resume` 键，把工具结果 JSON 画成一张卡片——题干、学生上次原话、卡点、下一步、一个按钮；字段缺一块就静默不渲染、退回通用工具行，不炸会话。vite 打 CJS，外面包 `window.__ModuleLoader__.load({ id, factory })`，React 与 `@deepseek-ai/*` 全交宿主模块表，产物 `lib/client.js`（17.0 kB）入库；构建 `yarn workspace dsh-plugin-bankmanager build:client`。`package.json` 多了 `exports["./client"]` 与 `dsh.client`。**另一个注册点（23:50）**：`conversation.hero.options` 的 `ile-resume`——空白会话首页列出待接的交接，点一下只把「接着上次那道题：<id>（<状态>）」填进输入框（`inputActions.setDraft`），不替学生发；「不点接续时 prompt 原样」。两条入口共用宿主路由 `/bank/api`（`src/api.ts`）：`handoff.pending` 列待接、`handoff.consume` 标成已被某个会话接走；信任围栏同 `/api`（loopback / `trustedHosts`、拒绝 cross-site），路由缺席时插件照常工作。
- **收尾（2026-10-23 李定）**：模型自己判断状态，但每轮引导收尾必须问学生一句「这题你自己做出来了吗」；做出来 → `status: review` + `guideOutcome: solved`，没做出来 → 保持 `guide` + `stuck`。这句写在 `guide.md` 里。

**模式与交接（2026-10-25 定稿；schema v2.1 与共享包已实现，其余未实现）**：一轮 grilling（Q1–Q35）后定下的架构，关键事实全部落到代码，出处按「文件:行」记。

- **模式 = 预设，切换 = 新会话**。`agentPresets.select` 只认空会话（`agent-preset/locked`，`boundary.lastTurn > 0` 即锁，`deepseek-harness/packages/preset/agent-preset-registry/src/index.ts:351`）；UI 只给空会话挂选择器（`client/ui-agent-preset/src/client/seat-store.ts:214`）；resume 按 `meta.agentPreset` 还原，缺预设直接拒绝恢复。
- **模型切不了自己的模式**。`recompose()` 内部能动但不写 `agent-preset/selected`、不更新投影，重启回到旧预设——**不用**。
- **不做「一个预设内换提示词」**。技术上可行：DeepSeek flash 声明 `systemPromptUpdate: 'in-history'`（`llm-deepseek/src/models.ts:12`），新 system 作为历史里的一条追加、不重写第 0 条（`llm-deepseek/src/serialize.ts:64`），缓存前缀不破。**否决理由**：flash 的 `toolUpdate` 是 `addition-only`（只能加工具、不能删），按模式换工具集做不到；静态工具全集又等于「隐预设」。所以一个模式一个预设。
- **跨会话只靠 bank + memory，零注入**。新会话靠提示词让模型开场先 `bank_list` 找 pending `handoff`，不用 `agent.inject()`（要额外 host 插件、注入时机含糊、永久占 user 位）。代价是模型可能忘记读，真机第一件事就要验它。
- **交接卡片**：模型写 `handoff` → 壳渲染卡片 → 学生点 → 客户端 `session.create({ sessionId 由 handoff.id 派生, agentPreset })`。幂等要点：`create` 拿一个**已经开始过**的 sessionId 会静默新开一个会话（`api/session-controller/src/agent.ts:488`），所以点之前先查列表，存在就跳转、不 create；`consumedAt` 失败要清回。**当前实现（2026-10-25 23:50）**：卡片「接着做」=`sessions.create({ agentPreset })`（按 handoff 的 `to` 选预设，`presetForMode` 也认中文显示名）+ `uiWorkspace.openSession` + `conversation.input.requestDraftInitialization(binding, { prompt })` 把「接着上次那道题：<id>（<状态>）」填进输入框（学生自己按回车，模型收到的就是他的消息，零注入不变）+ `/bank/api` 的 `handoff.consume`。幂等靠 `localStorage` 记「这道交接开过的会话 id」+ 列表里还在就只跳转（Host 的 `sessionId` 只能用来复用空白会话、不能自己命名，所以这条记忆必须落在客户端）；`consumedAt` 写失败时卡片提示「还会出现在待接里」，不假装成功。
- **OOBE = 独立 `setup` 预设**，状态记 `<DSH_HOME>/setup.json`，**字段级**：`{ onboarding: "pending"|"done", got: { grade, schedule, rhythm, preference } }`，可中断续问；完成判据是「能给出下一步」，不是「问够四样」。参考 OpenClaw 的专用 onboarding chat：与日常会话分开、可 Configure later、结束后衔接到下一步。
- **显示名**：`guide` 引导模式 / `work` 独立做题 / `hrl` 答案优化。
- **A/B（HRL）**：教师轨迹一次写全（按 memory 里的偏好，不再存固定的 preference 字段）；学生轨迹是原文；逐小步 `student / teacher / merged`，`merged` 必须存学生自己重写的 `mergedText`；每 3 步 flush，pairing 结束必 flush。
- **memory 改造**：课表、上课节奏、年级等分不同**固定文件**，走 `prompt_*` 那套文件机制新增 `profile_*` 家族（固定文件名、不进检索、不占注入预算）。
- **共享提示词片段**（2026-10-25 由调研逼出）：四个预设都用 `complete: true`，安全边界/说话方式/题库规则会重复四份 → 抽共享包（与科目备注同一个包），各预设 mount 时拼接。模板路径是仓库根的 `profiles/ensure-ile/`。

bank schema v2.1（2026-10-25 已实现，按模式分块）：

```jsonc
{
  "schema": 2,
  "id": "...", "subject": "...", "tags": [], "statement": "...", "attachments": [],
  "status": "new|guide|hrl|review|mastered|parked",
  "createdAt": "...", "updatedAt": "...",

  "guide": {
    "sessions": [{ "sessionId": "...", "startedAt": "...", "endedAt": "...",
                   "outcome": "solved|stuck|abandoned", "whereStuck": "...", "result": "他最后写的原稿" }],
    "insight": "卡在哪、怎么走通的（写给下一次的你）"
  },

  "work": {
    "attempts": [{ "at": "...", "answer": "学生原文", "verdict": "ok|partial|wrong", "source": "text" }]
  },

  "hrl": {
    "input": { "at": "...", "from": "work|pasted", "attemptAt": "...", "answer": "拿来打磨的原文" },
    "teacher": { "writtenAt": "...", "answer": "教师版最终答案", "note": "按什么写的（可空）",
                 "steps": [{ "index": 1, "body": "...", "reason": "..." }] },
    "pairings": [{
      "at": "...",
      "steps": [{ "index": 1, "studentQuote": "学生原句（逐字）", "teacherStep": 1,
                  "match": "same|partial|missing", "chosen": "student|teacher|merged",
                  "mergedText": "选 merged 时学生自己重写的", "chosenAt": "...", "note": "..." }],
      "result": "逐条选完之后的那份解"
    }]
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

规划待办（`handoff` 字段、`guide.sessions[].result`、`mergedText`、`teacher.note` 都是这一轮新增的）。

**验证现状**（2026-10-25 复验）：`check:layout`、`typecheck`、桌面包 `build`、`verify:loader` 通过；`dsh-plugin-bankmanager` 43 个单测（schema v2.1、卡片模型 7、路由 3、接续流程 4、客户端烟测 1）、typecheck、`build:client` 都过、`dsh-plugin-memory` 185 个单测、`dsh-plugin-teaching-commons` 构建与类型检查全过；profile 用 `pnpm install --offline` 能离线装好 guide / work / hrl / bank / memory / teaching-commons / setup 七个本地包；`dsh-plugin-setup` 7 个单测全过。桌面包单测仍是 Windows 平台基线 26 个失败（module-resolution 15、linux-artifacts 5、compatibility-shell 2、desktop-runtime-environment 2、electron-runtime 1、recovery-plugin-uninstall 1）；改名后 `update-download` 多出过 3 个，已修；2026-10-24 全量复跑确认就是这 26 个、同六个文件。`dist:win` 2026-10-25 09:17 跑通（`dist/ensure-ILE-2.0.18-x64-Setup.exe`，262MB）；全量 `corepack yarn check` 跑到 pnpm 生命周期断言卡住（`scripts/verify-cli-runtime.mjs`，见待办 16），未全绿。**10:15 重打并实测**：262→274MB，静默装到临时目录，首启在 `<安装目录>\.ensure-ile\home\profiles\desktop\node_modules` 装出 7 个本地包、启动无报错；覆盖安装后数据根里的 marker 仍在；手动卸载清空。

**提交**：`272a34c` 删 Beta/Next → `d9dfdba` 删社区市场+AA 并把 hrll 改名 guide → `bc5a422` 三个占位骨架 → `a24d2c9` 记忆 → `c784397` 状态 → `4c56d90` 记忆快照 → `6b6760d` 删 Next 交接与 `_deprecated` → `380caf4` 删 retired bundle 兼容层 → `abf2025` 砍 preset + 删 Python 载荷 → `4e9546a` dshmarket 补丁挪 1.67.0 → `170edcc` 把插件市场从构建里删掉 → `3198d10` 全仓改名 ensure-ILE（产品名、appId、数据根、环境变量、根包名）→ `32a5bc7` guide 出壳（自带 bundle patch）→ `46db1cd` 题库插件 → `b196533` memory fork 接进 profile → `3076215` 加 setup 预设、会话工作区收进数据根 → `17a0789` 修正 AGENTS 重复句号 → `87d4544` work / HRL 两模式 + 复习阶梯 + 画像字段 + 打包链路 + 署名 → `cd2b3ff` memory 的 `profile_read` / `profile_write` → `0780e39` `bank_resume` + 打包改 `build.files` → `82a3210` 打包实测 → `1aa1b69` 修 `verify-profile-boot` → `905bd03` 记录 `yarn check` 卡点 → `5e3f114` 交接给出一句可直接照做的话 → `76d9577` 打包修正：vendor 七个本地包、覆盖安装保留数据根 → `109c6ad` 修 bilingual 记录 → `8603deb` 更新 yarn.lock → `0a92ca2` 工作区依赖改 `link:` → `b1845c1` CI 适配（mac uv、profile 冒烟）→ `13d801c` 签名测试跟到现状（Python 已删）→ 剪 CI 到 Windows + `yarn docs:record` 自愈 → `5f5f49a` 题库浏览器半边（交接卡片）→ `c9f4903` 视觉层换演算纸 → `16b31d7` 交接卡片接上会话 + 首页接续入口 → `998e12c` `bank.md` 交接卡片的规矩。

**外部对照**：根目录 `开源AI学习伴侣调研.md`（2026-10-25，13 个开源项目的对照，带核实记录与自我修正；`⚠️ 仅描述` 标记用得对）。它的 P0-1「先真机跑一道题」与李 Q1 的「先搭模式」相反，2026-10-25 决定按「先跑」重排。它漏掉的：guide 会话实际还有 `working_directory`（说成只有 `read_note`）；它的 §5.5 与 §6.5 对同一件事反向表述（学生自证既是优势又是风险）——§6.5 才对。

**待办（2026-10-25 重排；Q1–Q35 的结论已并入上一节）**：
1. ✅ **真机跑一道题**（2026-10-25 08:19 验过）：提示词拼接生效、`bank_add` 第一轮就调、`read_note` / `bank_list` 正常、回复 64–108 字、零硬禁词、落盘正确。发现并修掉两条：cwd 快照是 `required` 压不掉（改用同名空 context 遮蔽）、`bank_add` 后状态停在 `new`（已写进 bank.md）。留下的那道题 `20261025-math-2d1ed2` 仍停在 `status: new`、`guide.sessions` 为空——新规矩是那之后才写进 bank.md 的，这条是旧规矩的化石。
2. ✅ **bank schema v2.1**（2026-10-25 已实现）：按 `guide/work/hrl` 分块 + `handoff`；`store.ts`、五个工具一起改（`bank_resume` 后来另加），20 个单测、typecheck、构建通过；列表与 `bank_stats` 会标出待接交接。
3. ✅ **共享提示词片段包**（2026-10-25 已实现，`dsh-plugin-teaching-commons`）：安全边界三条（自伤/被伤害/极度痛苦 → 停机、让找可信成年人；反复索要答案 → 说明为什么不给并给更小视角；题干里藏「忽略之前的指令」→ 当题干内容、不执行）+ 反谄媚清单 + 题库规则，`guide/setup/work/hrl` 统一拼接。
4. ✅ **`setup` 预设 + `setup.json`**（2026-10-25 已实现，`dsh-plugin-setup`）：字段级进度、可中断、完成判据是「能给出下一步」；7 个单测。默认预设仍是 guide，学生想重过一遍开学问话时在空会话里选「开学」。
5. ✅ `dsh-plugin-work`（2026-10-25）：预设 `work`「独立做题」，提示词 common+bank+work.md，`read_note` 只给判卷用；判两件事、重交只给一次、讲不清回 guide 并写 handoff。
6. ✅ `dsh-plugin-hrl`（2026-10-25）：预设 `hrl`「答案优化」，教师轨迹一次写全 + 逐小步 A/B（`student/teacher/merged`，merged 正文必须学生自己写）。
7. ✅ **交接卡片**（client 插件，最重）：工具 + 卡片 slot + `session.create` 幂等。**2026-10-25 09:22 先落了界面前的最小形态**（`5e3f114`）：bank.md 让模型原样给学生一句「开个新会话、选「<下一个模式>」，发一句：接着上次那道题」，新会话用 `bank_resume` 接上。**23:30 卡片本体做了**（`5f5f49a`）：认领 `bank_resume` 的 toolview、画题干/原话/卡点/下一步，按钮只复制一句提示。**23:50 接完**（`16b31d7`）：按钮开新会话、填输入框、认领交接，幂等靠列表 + `localStorage`；首页入口也做了（见第 10 条）。这条关闭。
8. ✅ **memory 的 `profile_*`**（2026-10-25）：`<DSH_HOME>/profile/{grade,schedule,rhythm,preference}.md` 四个固定栏目，`profile_read` 读一个或全部、`profile_write` 写一个（空内容等于删除）；**不进检索、不占注入预算**。memory 自述从 12 个工具改成 14 个，189 个单测全过。
9. ✅ **钩子入口（题库侧）**：`bank_list` 行尾标 `-> guide 待接`，`bank_stats` 有「待接交接：N」，另有 `bank_resume`（2026-10-25 加）：不带 id 列出待接交接，带 id 直接返回题干 + 交接包 + insight + 最后一次作答。聊天首页那个入口归第 10 条。
10. ✅ **接续 UI**（2026-10-25 23:50，`16b31d7`）：不点接续时 prompt 原样；点一下（首页 `ile-resume` 或聊天里的交接卡片）就把上次那道题（带状态）填成学生这次要发的那句——首页入口只填输入框，卡片开新会话并填输入框；两者都不替学生按回车。模型侧规矩同步改了（`998e12c`，`bank.md`：写完 handoff 就出卡片，别再叫学生自己开新会话）。
11. ✅ **固定档复习**（2026-10-25）：`REVIEW_LADDER = [1,3,7,14,30,60,120]`；进 `review` 自动排第一次，`reviewPassed: true` 升一档、`false` 回第一档，爬到最后一档自动 `mastered`。
12. ✅ **画像字段**（2026-10-25）：`guide.sessions[]` 加 `affect`（frustrated/neutral/excited）与 `effectiveHint`（confirm/position/feature/structure/result），`bank_update` 可直接写，没开会话就自动开一个。**进题不进 memory**。
13. ✅ **打包链路**（2026-10-25）：`seedProfile()` 打包时读 `app.getAppPath()/profiles/ensure-ile`、开发时读仓库根；`scripts/prepare-profile.mjs` 在 `build` 开头把仓库模板镜像进 `dsh-plugin-desktop/profiles/`（gitignore），`build.files` 加 `profiles/**`——**不能用 `build.extraResources`**，上游 `tests/package.spec.ts` 明确禁止顶层 extraResources；`materializeSeededProfile()` 在 node_modules 缺失时用内置 pnpm 跑 `install --offline --no-frozen-lockfile`。**2026-10-25 打包实测通过**：`dist:win` 产出 `dist/ensure-ILE-2.0.18-x64-Setup.exe`（262MB），`afterPack` 的 installer 校验过，`win-unpacked/resources/app/profiles/ensure-ile/` 里三个文件都在。**10:15 复验修掉两个坑**：① 七个本地包原先没进包（`file:../../../../` 指到安装目录外，首启 install 必失败）——`prepare-profile.mjs` 现在把它们 vendor 进 `profiles/ensure-ile/vendor/`，并把包内 `package.json` 的依赖改写为 `file:./vendor/*`（仓库模板不动，开发仍链源码），`seedProfile()` 把 `vendor/` 一起种进数据根；② 覆盖安装会把数据根删掉——`build/installer.nsh` 用 `$TEMP\ensure-ILE-upgrade.flag` 标记安装，旧卸载器把 `.ensure-ile` 挪到 `$TEMP\ensure-ILE-data`，`customInstall` 再挪回。实测四条：7 个包、首启、覆盖、卸载，都对。
14. **独立 Evaluator**（廉价模型按五条硬规则校验上一轮回复：给动作了吗、含答案了吗、一次两个视角了吗、超两句话了吗、空表扬了吗）：等第一条效果数据，别现在做。
15. **教材锚定**（有进展）：2026-10-25 09:23 教材到位——`<数据根>/deepseek-harness/default-workspace/教材/` 有 7 本必修 PDF（人教A数学必修一/二、人教版化学必修一/二、教科版物理必修一/二/三）、`教材索引.md`（含 PDF 页与课本页换算）和三个 Python 小工具；`教辅资料/` 11MB（数学必修一答案、化学预习提纲等）。**09:45 定：数据根为准**。索引里的路径已改成数据根；教辅资料比 Documents 少 8 个文件（化学必修一两本答案、化学/物理预习提纲、README 等），已补齐，两边各 89+15 个文件。Documents 那份留作备份（183MB，未删；老会话 cwd 还指着它）。下一步：让模型真读一次教材。
16. 修 Windows 单测（26 个基线）、跑全量 `yarn check`、试 `dist:win`。**2026-10-25 复跑：139 个测试文件 / 1794 个用例，27 失败**——其中 `tests/package.spec.ts` 那 1 个是这次打包改动引入的，已修（改成 `build.files` 镜像方案），现在回到 **26 个基线**（module-resolution 15、verify-linux-artifacts 5、compatibility-shell 2、desktop-runtime-environment 2、electron-runtime 1、recovery-plugin-uninstall 1）。这 26 个是 Windows 平台既有失败，未动。**`dist:win` 2026-10-25 跑通**（见第 13 条）。
    **全量 `yarn check` 2026-10-25 首次跑，两个卡点**：① `scripts/verify-profile-boot.mjs` 引用了从未赋值的 `prepared`——已修（`prepareDesktopProfile` 的返回值接住）；② 修完后继续往下，卡在 `scripts/verify-cli-runtime.mjs` 的 pnpm 生命周期环境断言：期望 `runAsNode: []`，实际拿到 `["ELECTRON_RUN_AS_NODE"]`（进程环境里没有这个变量，是 pnpm shim 自己设的）。第二个没修——要先弄清 pnpm shim 在 Windows 上给它设值的条件。
17. ✅ README 署名（2026-10-25）：中英两份都加了 EnSure Lab / 因需 与「每一步都要说得清为什么」，`README.i18n.yaml` 的哈希同步更新，bilingual gate 通过。
18. 图片链路（拍照发题 → 模型看得见 → 存进题库的 `attachments`）：李 2026-10-23 明确「之后搞」，暂缓。
19. ✅ 「明确不做」已经写成独立一节（见下）。

## 明确不做（2026-10-25 定）

不是没来得及，是**决定不做**。每条都写了理由，免得下次有人重新提。

| 不做 | 理由 |
|---|---|
| 账号 / 多租户 / 权限 / 计费 | 只有一个已知学生。做成多租户反而要求隐私声明、配额、计费，全是成本 |
| 4–24 周学习路径 | 别人的单位是「课程/周」，我们的单位是「一道题」。时间尺度不同，硬套会把题目账本稀释掉 |
| 十种能力的课程工作台 | 越多的能力越容易诱导「直接给答案」——和「逼他自己想出来」相冲 |
| A/B 投票打分界面 | 先存证（`hrl.pairings`），不采集信号。没有并排阅读的界面之前，打分只会变成噪声 |
| 模型自己切模式 | 预设锁定，模型也不能替学生重启会话；切换只能由学生点 |
| 一次会话内换提示词 | flash 的 `toolUpdate` 是 `addition-only`，换工具集做不到；静态全集等于隐式预设 |

**坑**：`profile-setup/<hash>/state.json.pending` 必须精确 `pending\n`（8 字节），空文件会让主进程进恢复页；冷启动首屏「正在加载设置…」约 30 秒；billion-context 0.1.202 有 0.1.203 关键更新（升级后需重启 dsh）；市场已经整个删掉，不再有追 latest 和 port 补丁的事；设置里的插件市场开关现在没有可挂载的 provider；`seedProfile()` **只在首次种、存在就不覆盖**——改完 `profiles/ensure-ile/` 要删掉 `.ensure-ile/home/profiles/desktop` 下那三个文件（或整个目录）再启动，然后手动跑一次 `pnpm install --offline`；模板路径是仓库根的 `profiles/ensure-ile/`，不是 `dsh-plugin-desktop/profiles/`。C: 盘满过一次（Yarn 缓存 1.3G），缓存已用 junction 指到 `D:\yarn-berry-cache`，pnpm store 也吃 C: 盘。2026-10-25 09:39 清了改名前的旧数据根 `.dhdl/`（100MB，10-21 后没再写）与 7 个空的 `.dsh-ops-update-*.lock`；`dsh-plugin-desktop/dist/` 会堆到 1.5G（Setup 262MB + `win-unpacked` 1.2G），要腾地方先删 `win-unpacked`（可重建）。**CI 2026-10-25 剪到 Windows 平台**：只留 `changes`（文档+分类）、`check`（139 文件单测，ubuntu）、`desktop-windows`（check:win-package + dist:win + portable）、`upstream-command-windows`；macOS/Linux 打包整段删掉（学生只装 Windows，上游那两个作业每轮白跑 20 分钟）。bilingual 哈希过期不用手改：`yarn docs:record` 会重算全部记录、只改过期行，`verify-bilingual-docs` 失败时也会提示这条命令。**打包后的数据根 = `dirname(ensure-ILE.exe)\.ensure-ile`（就在安装目录里）**：覆盖安装靠上面的 NSIS 挪移保住数据，手动卸载仍然全删。`seedProfile()` 只在目标文件不存在时复制，所以以后改 profile 模板，老安装不会自动更新——要么删数据根里的 profile 再启动，要么给它加刷新逻辑。**2026-10-25 23:30 加坑**：`build:client` 要本地有 `vite`，bankmanager 的 devDependencies 补了 8.2.1（跟桌面包同版本，`yarn.lock` 已更）——之前 `yarn workspace dsh-plugin-bankmanager build:client` 直接 `command not found: vite`。`.codegraph/` 是本机索引（CodeGraph 1.6.0，索引整个仓库含上游子模块），进 `.gitignore`、不提交；它自带 `.gitignore` 只放行自己，别把里面的库提交进去。**23:50 加坑**：题库插件的 `inject` 多了 `webServer` / `webStartup`（`/bank/api` 要用），这两个服务由 web-app bundle 提供——把 `dsh-plugin-bankmanager` 挂进没有 web-app 的 profile 会让整行 pending、工具全不见；`mountBankApi()` 自己对缺服务是安静的，但 cordis 的 `inject` 不是。接续的幂等记忆在浏览器 `localStorage`（键 `dsh-plugin-bankmanager:resume:<题 id>`），换机/清缓存就退回「再开一个」，不会错跳到别人的会话。首页入口的待接列表是挂载时取一次，不实时刷新。


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
