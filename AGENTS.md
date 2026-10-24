# ensure-ILE — DeepSeek Harness Desktop in Learning

> 这个仓库是 **ensure-ILE**，从 [DSH Desktop](https://github.com/anywhere-labs/dsh-desktop) fork 而来，用来做一件事：
> 把桌面 agent 变成**引导学生自己把题解出来**的工具（Human RL 的 guide 阶段）。
>
> 底座不动：`deepseek-harness/` 是固定的上游子模块，**禁止修改**；桌面外壳、插件机制、打包流程都沿用上游。
> 我们的东西集中在 `dsh-plugin-guide/`（引导模式）、`dsh-plugin-bankmanager/`（题库）与 `dsh-plugin-memory/`（学生记忆），三者都以 bundle 的形式挂在 profile 根，壳不再知道它们的存在。
>
> 下面「DSH Desktop repository rules」是上游规则，对本仓库仍然全部有效。

## 当前状态（2026-10-24 23:00）

**组织**：EnSure Lab / 因需（因=原因、需=需要，即「每一步都要说得清为什么」）。包名统一 `dsh-plugin-` 前缀，不用 npm scope。

**仓库形态**（4 个 workspace + 3 个占位目录）：
- `dsh-plugin-desktop/`：上游桌面壳（2.0.18）+ ensure-ILE 改动（数据根、OOBE 裁剪、引导模式预设）。
- `dsh-plugin-guide/`：guide 模式——整份替换系统提示（`prompts/guide.md`）+ `read_note` 工具读 `skills/{math,arts}.md`；预设 id `guide`、显示「引导模式」，是 Profile 默认预设。
- `dsh-community-fabric/`：社区互操作 RFC，纯文档，不声明可加载入口。
- `dsh-plugin-bankmanager/`：题库插件。五个工具（add / list / show / update / stats），一道题一个 JSON，存 `<DSH_HOME>/bank/problems/`；以 bundle 挂在 profile 根，guide / work / HRL / schedule 共用。
- `dsh-plugin-memory/`：`@max-null/dsh-memory` v0.18.0 的 fork（包名 `dsh-plugin-memory`，已注册 workspace、已接 profile，zod 打包内联）；同步规则见 `dsh-plugin-memory/UPSTREAM.md`。
- 占位（只有 README，无 `package.json`、未进 workspaces）：`dsh-plugin-hrl/`（HRL 模式：学生已有答案→优化）、`dsh-plugin-schedule/`（课表+进度→明天讲什么/今日预习复习）、`dsh-plugin-work/`（work 模式：学生独立做→交答案→判卷，判不过转 guide）。
- 已删：Beta/Next 变体、`dsh-community-market/`、`vendor/agents-anywhere/`（含全部 AA 接线）；2026-10-22 又删了 `_deprecated/`（上游 0.1.x 归档）、Next 交接提示（`next-transition-notice` 与 `docs/stable-next-transition`）、`upstream.json` 的 beta channel，以及旧 profile 的 retired bundle 兼容层（`RETIRED_BUNDLES`/`RETIRED_ROW_IDS`——ensure-ILE 的 profile 都在 `.ensure-ile` 里新种，永远不读旧 profile，2026-10-22 李确认后删）；插件市场整个从构建里拿掉（`dshmarket` 依赖、`.yarn/patches/dshmarket-*.patch`、`scripts/prepare-dsh-market.mjs`、三个 market 脚本与 `market:prepare` 的全部调用点、`dshmarket-compat.spec.ts`），学生装不了插件也不需要装。
- 能力面与载荷（2026-10-22 精简）：web-app 关掉了 base 的工具行、工具只由 preset 挂载，所以 `preset-standard` 禁掉后学生只能开 guide，手上就 `read_note` 一个工具（PTC/minimal/creator 本来也禁）；打包只带 Node+pnpm 载荷，实测 109MB（原 265MB），Python 解释器、Office 技能和 `load_workspace_dependencies` 一起删了，`desktop-office.ts` 已不存在。

**能跑**：`Start-Process dsh-plugin-desktop\node_modules\electron\dist\electron.exe dsh-plugin-desktop\lib\main.js`，composer 预设默认「引导模式」；`ENSURE_ILE_SETUP=full` 可看完整 7 屏向导。
**数据隔离**：`run()` 把 `DSH_HOME`/`ENSURE_ILE_HOME`/`DSH_AGENTS_HOME`/`userData` 全放 `.ensure-ile/`；`seedProfile()` 复制 `profiles/ensure-ile/` 的 `package.json`、`cordis.patch.yml` 与 `pnpm-workspace.yaml`，**不装依赖**——清掉 `.ensure-ile` 后要手动在 `.ensure-ile/home/profiles/desktop` 跑一次 `pnpm install --offline`（三个插件都是本地 `file:` 链接、零注册表依赖，离线可装）。

**共享数据层（guide / work / hrl / schedule 都指着它）**：三个 bundle 都已接进 profile，全部本地 `file:` 链接、零注册表依赖。
- **记忆**：本地 fork `dsh-plugin-memory` 0.18.0-ensure-ile.1（上游 v0.18.0 的 fork，zod 已打包内联，client id 由包名生成）。工具是 profile 根注册的，所以**所有会话都能看到** `memory_*`；它的提示段会被 guide 的 `complete: true` 吞掉，模型只能靠工具描述理解它。存量按「global / 当前工作区」两层，工作区层落在会话工作区的 `.dsh/storages/`。**真机上还没跑过一次**。
- **题库**：`dsh-plugin-bankmanager` 已实现——五个工具（`bank_add` / `bank_list` / `bank_show` / `bank_update` / `bank_stats`），一道题一个 JSON 文件（`<DSH_HOME>/bank/problems/<id>.json`，id = `YYYYMMDD-<slug>-<6 位 hex>`，subject 自由写、只归一化进 id），原子写 + 跨进程锁 + 坏文件只跳过。挂在 profile 根，后续 work / HRL / schedule 共用同一份。
- **收尾（2026-10-23 李定）**：模型自己判断状态，但每轮引导收尾必须问学生一句「这题你自己做出来了吗」；做出来 → `status: review` + `guideOutcome: solved`，没做出来 → 保持 `guide` + `stuck`。这句写在 `guide.md` 里。

**验证现状**（2026-10-24 复验）：`check:layout`、`typecheck`、桌面包 `build`、`verify:loader` 通过；`dsh-plugin-bankmanager` 15 个单测 + 挂载 smoke、`dsh-plugin-memory` 185 个单测全过；profile 用 `pnpm install --offline` 能离线装好 guide / bank / memory 三个本地包。桌面包单测仍是 Windows 平台基线 26 个失败（module-resolution 15、linux-artifacts 5、compatibility-shell 2、desktop-runtime-environment 2、electron-runtime 1、recovery-plugin-uninstall 1）；改名后 `update-download` 多出过 3 个，已修；2026-10-24 全量复跑确认就是这 26 个、同六个文件。`corepack yarn check` 与 `dist:win` 仍未跑过。

**提交**：`272a34c` 删 Beta/Next → `d9dfdba` 删社区市场+AA 并把 hrll 改名 guide → `bc5a422` 三个占位骨架 → `a24d2c9` 记忆 → `c784397` 状态 → `4c56d90` 记忆快照 → `6b6760d` 删 Next 交接与 `_deprecated` → `380caf4` 删 retired bundle 兼容层 → `abf2025` 砍 preset + 删 Python 载荷 → `4e9546a` dshmarket 补丁挪 1.67.0 → `170edcc` 把插件市场从构建里删掉 → `3198d10` 全仓改名 ensure-ILE（产品名、appId、数据根、环境变量、根包名）→ `32a5bc7` guide 出壳（自带 bundle patch）→ `46db1cd` 题库插件 → `b196533` memory fork 接进 profile。

**待办（按优先级）**：
1. **真机跑一道题**：验提示词替换、`read_note`、`bank_add`/`bank_update` 落盘、`memory_*` 工具可见。不跑这一步，前三个 bundle 都只是「装上了」。
2. **接续 UI**（TODO，语义已定）：不点接续时 prompt 原样；点接续就把上次那道题（带状态）当成学生这次发的消息。work 模式每次重开，不需要它。
3. **打包链路**：`seedProfile()` 还没做 `app.isPackaged` 分支（开发指仓库目录、打包指 app 资源）+ 随包复制 + 种完自动 `pnpm install --offline`。现在只验证过开发态。
4. **SRS / schedule**：`review.nextAt` 现在只存不算，间隔规则、课表来源、到期口径都没定。
5. HRL 模式定稿：优化到什么程度算完、要不要 A/B 保留原答案并采偏好信号、学科备注怎么分、发现学生没做出来是否退回 guide、入口在哪。
6. `dsh-plugin-work` 实现（骨架已建，设计意图与待定问题见 `dsh-plugin-work/README.md`）。
7. 修 Windows 单测、跑全量 `yarn check`、试 `dist:win`。
8. README/docs 补 EnSure Lab / 因需 署名。
9. 图片链路（拍照发题 → 模型看得见 → 存进题库的 `attachments`）：李 2026-10-23 明确「之后搞」，暂缓。
10. 独立审计：题目状态先由模型判断 + 问学生一句，复核机制暂不做（李 2026-10-23 记下）。

**坑**：`profile-setup/<hash>/state.json.pending` 必须精确 `pending\n`（8 字节），空文件会让主进程进恢复页；冷启动首屏「正在加载设置…」约 30 秒；billion-context 0.1.202 有 0.1.203 关键更新（升级后需重启 dsh）；市场已经整个删掉，不再有追 latest 和 port 补丁的事；设置里的插件市场开关现在没有可挂载的 provider；`seedProfile()` **只在首次种、存在就不覆盖**——改完 `profiles/ensure-ile/` 要删掉 `.ensure-ile/home/profiles/desktop` 下那三个文件（或整个目录）再启动，然后手动跑一次 `pnpm install --offline`；模板路径是仓库根的 `profiles/ensure-ile/`，不是 `dsh-plugin-desktop/profiles/`。C: 盘满过一次（Yarn 缓存 1.3G），缓存已用 junction 指到 `D:\yarn-berry-cache`，pnpm store 也吃 C: 盘。


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
