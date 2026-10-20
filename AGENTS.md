# DHDL — DeepSeek Harness Desktop in Learning

> 这个仓库是 **DHDL**，从 [DSH Desktop](https://github.com/anywhere-labs/dsh-desktop) fork 而来，用来做一件事：
> 把桌面 agent 变成**引导学生自己把题解出来**的工具（Human RL 的 guide 阶段）。
>
> 底座不动：`deepseek-harness/` 是固定的上游子模块，**禁止修改**；桌面外壳、插件机制、打包流程都沿用上游。
> 我们的东西集中在 `dsh-plugin-guide/`，以 agent preset 的形式接进 `dsh-plugin-desktop/cordis.patch.yml`。
>
> 下面「DSH Desktop repository rules」是上游规则，对本仓库仍然全部有效。

## 当前状态（2026-10-21 00:50）

- **能跑**：`Start-Process dsh-plugin-desktop\node_modules\electron\dist\electron.exe dsh-plugin-desktop\lib\main.js` 能起窗口，`引导模式`（`dsh-plugin-guide`）是默认预设，首次引导只有一屏欢迎页。
- **数据隔离已通**：`run()` 里先 `resolveDataRoot()` → `seedProfile()` → `DSH_HOME`/`DHDL_HOME`/`DSH_AGENTS_HOME`/`userData` 全部落在 `.dhdl/` 下；`start()` 见到 `DHDL_HOME` 就绕过 C 盘 `~/.dsh`。日志确认 `[dhdl] home resolution: ... resolved=E:\Projects\DHDL\.dhdl\home`。`seedProfile()` 只复制 `profiles/dhdl/` 的 `package.json` 与 `cordis.patch.yml`，**不装依赖**；删掉 `.dhdl/` 后要手动在 `.dhdl/home/profiles/desktop` 跑一次 `pnpm install`，否则起不来（`PackageOverlayNotFoundError: @max-null/dsh-memory`）。
- **OOBE 已裁剪**（DHDL 自有）：默认只渲染 `['welcome']`，`DHDL_SETUP=full` 恢复上游 8 屏。固定默认值写在 `main.ts` 的 `dhdlSetupInput()`：增强模式（linux→兼容）、材质不透明、市场关闭、浏览器访问关 + loopback、通知 7 项全关；账号登录步被 `dismissDesktopSetupAccount()` 摘掉。步骤计划经 `setupOnboarding.read().steps` 传到 renderer，`App.tsx` 用注册表按计划渲染，进度条只在 `steps.length > 1` 时出现。
- **坑**：`profile-setup/<hash>/state.json(.pending)` 是严格格式——`*.pending` 必须正好是 `pending\n`，手写空文件会让主进程进恢复页并报 `invalid pending marker`。想重看引导：删 `state.json`、`state.json.account`，写 `state.json.pending` 为 `pending\n`。
- **只留必要能力**（2026-10-21）：社区市场（`dsh-community-market/`）与 Agents-Anywhere 远程控制已移除——插件市场只剩 `dshmarket` 与官方内置来源，OOBE 的市场步也只剩这两项。
- **变体已移除**：`dsh-plugin-desktop-beta/` 与 `dsh-desktop-next/` 已从仓库删除，`verify-desktop-variants` 检查器一并移除；桌面代码只剩 `dsh-plugin-desktop/`。`dshmarket` 1.66.39 的连带升级与 DHDL 无关。

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
- Root build, dev/start, and packaging commands refresh `dshmarket` from npm `latest` via `corepack yarn market:prepare`. Commit its exact dependency versions, Desktop compatibility patch, and lockfile together. `corepack yarn market:check` verifies freshness without writes; offline lookups or incompatible patches fail rather than silently retaining an old market. Installed apps do not hot-update executable plugins on launch.
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
