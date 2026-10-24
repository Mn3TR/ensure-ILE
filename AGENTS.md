# ensure-ILE — DeepSeek Harness Desktop in Learning

> 这个仓库是 **ensure-ILE**，从 [DSH Desktop](https://github.com/anywhere-labs/dsh-desktop) fork 而来，用来做一件事：
> 把桌面 agent 变成**引导学生自己把题解出来**的工具（Human RL 的 guide 阶段）。
>
> 底座不动：`deepseek-harness/` 是固定的上游子模块，**禁止修改**；桌面外壳、插件机制、打包流程都沿用上游。
> 我们的东西集中在 `dsh-plugin-guide/`，以 agent preset 的形式接进 `dsh-plugin-desktop/cordis.patch.yml`。
>
> 下面「DSH Desktop repository rules」是上游规则，对本仓库仍然全部有效。

## 当前状态（2026-10-23 23:25）

**组织**：EnSure Lab / 因需（因=原因、需=需要，即「每一步都要说得清为什么」）。包名统一 `dsh-plugin-` 前缀，不用 npm scope。

**仓库形态**（3 个 workspace + 4 个占位目录）：
- `dsh-plugin-desktop/`：上游桌面壳（2.0.18）+ ensure-ILE 改动（数据根、OOBE 裁剪、引导模式预设）。
- `dsh-plugin-guide/`：guide 模式——整份替换系统提示（`prompts/guide.md`）+ `read_note` 工具读 `skills/{math,arts}.md`；预设 id `guide`、显示「引导模式」，是 Profile 默认预设。
- `dsh-community-fabric/`：社区互操作 RFC，纯文档，不声明可加载入口。
- `dsh-plugin-memory/`：`@max-null/dsh-memory` v0.18.0 的 fork（源码在仓、包名 `dsh-plugin-memory`，**未注册 workspace、未接 profile**）；同步规则见 `dsh-plugin-memory/UPSTREAM.md`。
- 占位（只有 README，无 `package.json`、未进 workspaces）：`dsh-plugin-hrl/`（HRL 模式：学生已有答案→优化）、`dsh-plugin-schedule/`（课表+进度→明天讲什么/今日预习复习）、`dsh-plugin-bankmanager/`（题库状态机 new/guide/hrl/review/mastered/parked）、`dsh-plugin-work/`（work 模式：学生独立做→交答案→判卷，判不过转 guide）。
- 已删：Beta/Next 变体、`dsh-community-market/`、`vendor/agents-anywhere/`（含全部 AA 接线）；2026-10-22 又删了 `_deprecated/`（上游 0.1.x 归档）、Next 交接提示（`next-transition-notice` 与 `docs/stable-next-transition`）、`upstream.json` 的 beta channel，以及旧 profile 的 retired bundle 兼容层（`RETIRED_BUNDLES`/`RETIRED_ROW_IDS`——ensure-ILE 的 profile 都在 `.ensure-ile` 里新种，永远不读旧 profile，2026-10-22 李确认后删）；插件市场整个从构建里拿掉（`dshmarket` 依赖、`.yarn/patches/dshmarket-*.patch`、`scripts/prepare-dsh-market.mjs`、三个 market 脚本与 `market:prepare` 的全部调用点、`dshmarket-compat.spec.ts`），学生装不了插件也不需要装。
- 能力面与载荷（2026-10-22 精简）：web-app 关掉了 base 的工具行、工具只由 preset 挂载，所以 `preset-standard` 禁掉后学生只能开 guide，手上就 `read_note` 一个工具（PTC/minimal/creator 本来也禁）；打包只带 Node+pnpm 载荷，实测 109MB（原 265MB），Python 解释器、Office 技能和 `load_workspace_dependencies` 一起删了，`desktop-office.ts` 已不存在。

**能跑**：`Start-Process dsh-plugin-desktop\node_modules\electron\dist\electron.exe dsh-plugin-desktop\lib\main.js`，composer 预设默认「引导模式」；`ENSURE_ILE_SETUP=full` 可看完整 7 屏向导。
**数据隔离**：`run()` 把 `DSH_HOME`/`ENSURE_ILE_HOME`/`DSH_AGENTS_HOME`/`userData` 全放 `.ensure-ile/`；`seedProfile()` 只复制 `profiles/ensure-ile/` 的 `package.json` 与 `cordis.patch.yml`，**不装依赖**——清掉 `.ensure-ile` 后要手动在 `.ensure-ile/home/profiles/desktop` 跑一次 `pnpm install`。

**共享数据层（guide / work / hrl / schedule 都指着它）**：这一层现在只有一半。
- **记忆**：`@max-null/dsh-memory` 0.15.1，以 bundle 形式挂在 profile 根（`profiles/ensure-ile/package.json` 的 `bundles` + 依赖），**不在 preset 里**——所以它的工具面不受 preset 裁剪控制，真机上 guide 会话到底看不看得到 `memory_*` 还没验证。存量按「global / 当前工作区」两层，工作区层落在会话工作区的 `.dsh/storages/`；`.ensure-ile/home/storages` 下目前一条记忆都没有，等于**插件挂着、一次都没真用过**。上游已到 0.18.0。
- **题库**：**零代码**。只有 `dsh-plugin-bankmanager/README.md` 一份草案（状态机、字段、计划工具、待定问题），没有 `package.json`、没进 workspaces、没有任何工具。
- **定案（2026-10-23 李）**：记忆当「学生记忆」用——把 `@max-null/dsh-memory` 升到 0.18.0 后 **fork 成 `dsh-plugin-memory/`**（源码已拷贝入仓，**还没接入 profile**，profile 仍依赖 npm 上的 0.15.1），此后只选择性同步上游；题库 `dsh-plugin-bankmanager` **一道题一个 JSON 文件**（`<DSH_HOME>/bank/problems/<id>.json`，id = `YYYYMMDD-<subject>-<6 位 hex>`，guide / RL / attempts 全塞进这一个文件）；guide 也挂题库工具，**模型自己判断状态、但收尾要问学生一句「这题你自己做出来了吗」**；独立审计与图片链路先记待办。字段与工具见 `dsh-plugin-bankmanager/README.md`，fork 规则见 `dsh-plugin-memory/UPSTREAM.md`。

**验证现状**：`check:layout`、`typecheck`、桌面包 `build` 通过（2026-10-22 清理后复验过；`yarn build` 不再需要 `market:prepare`，直接构建桌面包；桌面包单测 26 个失败（Python 载荷删完仍是一模一样的 26 个、同六个文件），全是 Windows 平台基线（module-resolution 15、linux-artifacts 5、compatibility-shell 2、desktop-runtime-environment 2、electron-runtime 1、recovery-plugin-uninstall 1；2026-10-22 复跑确认，另一次跑出 27，有 1 个偶发）。`corepack yarn check` 全量门禁和 `dist:win` 打包尚未跑过。

**提交**：`272a34c` 删 Beta/Next → `d9dfdba` 删社区市场+AA 并把 hrll 改名 guide → `bc5a422` 三个占位骨架 → `a24d2c9` 记忆 → `c784397` 状态 → `4c56d90` 记忆快照 → `6b6760d` 删 Next 交接与 `_deprecated` → `380caf4` 删 retired bundle 兼容层 → `abf2025` 砍 preset + 删 Python 载荷 → `4e9546a` dshmarket 补丁挪 1.67.0 → `170edcc` 把插件市场从构建里删掉。**11 个提交未 push**。

**待办（按优先级）**：
1. **题库 / 记忆这一层落地**——定案已下（见「共享数据层」），接下来是：`dsh-plugin-memory` 注册 workspace + 构建 + 接进 profile，`dsh-plugin-bankmanager` 写 `src/`（先 `bank_add`/`bank_list`/`bank_show`/`bank_update`）并挂进 guide preset。
2. 真机跑一道题，验证 guide 模式（系统提示替换 + `read_note` 调用 + 拍照的题能不能进模型；进不去就在 preset 里补 `tool-fs` 只开 `readImage`）。
3. `seedProfile()` 后自动装依赖，免手动 pnpm。
4. HRL 模式定稿：优化到什么程度算完、要不要 A/B 保留原答案并采偏好信号、学科备注怎么分、发现学生没做出来是否退回 guide、入口在哪。
5. `dsh-plugin-work` 实现（骨架已建，设计意图与待定问题见 `dsh-plugin-work/README.md`）。
6. 题库实现 + schedule 落地（进度口径、课表来源、SRS、存储）。
7. 修 Windows 单测、跑全量 `yarn check`、试 `dist:win`。
8. README/docs 补 EnSure Lab / 因需 署名。
9. 图片链路（拍照发题 → 模型看得见 → 存进题库的 `attachments`）：李 2026-10-23 明确「之后搞」，暂缓。
10. 独立审计：题目状态先由模型判断 + 问学生一句，复核机制暂不做（李 2026-10-23 记下）。

**坑**：`profile-setup/<hash>/state.json.pending` 必须精确 `pending\n`（8 字节），空文件会让主进程进恢复页；冷启动首屏「正在加载设置…」约 30 秒；billion-context 0.1.202 有 0.1.203 关键更新（升级后需重启 dsh）；市场已经整个删掉，不再有追 latest 和 port 补丁的事；设置里的插件市场开关现在没有可挂载的 provider；`seedProfile()` **只在首次种、存在就不覆盖**——改完 `profiles/ensure-ile/` 要删掉 `.ensure-ile/home/profiles/desktop` 下那两个文件（或整个目录，记得重装依赖）再启动，本机这份还是 10-21 种的；模板路径是仓库根的 `profiles/ensure-ile/`，不是 `dsh-plugin-desktop/profiles/`。


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
