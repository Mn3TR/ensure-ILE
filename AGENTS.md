# DHDL — DeepSeek Harness Desktop in Learning

> 这个仓库是 **DHDL**，从 [DSH Desktop](https://github.com/anywhere-labs/dsh-desktop) fork 而来，用来做一件事：
> 把桌面 agent 变成**引导学生自己把题解出来**的工具（Human RL 的 guide 阶段）。
>
> 底座不动：`deepseek-harness/` 是固定的上游子模块，**禁止修改**；桌面外壳、插件机制、打包流程都沿用上游。
> 我们的东西集中在 `dsh-plugin-guide/`，以 agent preset 的形式接进 `dsh-plugin-desktop/cordis.patch.yml`。
>
> 下面「DSH Desktop repository rules」是上游规则，对本仓库仍然全部有效。

## 当前状态（2026-10-22 00:04）

**组织**：EnSure Lab / 因需（因=原因、需=需要，即「每一步都要说得清为什么」）。包名统一 `dsh-plugin-` 前缀，不用 npm scope。

**仓库形态**（3 个 workspace + 4 个占位目录）：
- `dsh-plugin-desktop/`：上游桌面壳（2.0.18）+ DHDL 改动（数据根、OOBE 裁剪、引导模式预设）。
- `dsh-plugin-guide/`：guide 模式——整份替换系统提示（`prompts/guide.md`）+ `read_note` 工具读 `skills/{math,arts}.md`；预设 id `guide`、显示「引导模式」，是 Profile 默认预设。
- `dsh-community-fabric/`：社区互操作 RFC，纯文档，不声明可加载入口。
- 占位（只有 README，无 `package.json`、未进 workspaces）：`dsh-plugin-hrl/`（HRL 模式：学生已有答案→优化）、`dsh-plugin-schedule/`（课表+进度→明天讲什么/今日预习复习）、`dsh-plugin-bankmanager/`（题库状态机 new/guide/hrl/review/mastered/parked）、`dsh-plugin-work/`（work 模式：学生独立做→交答案→判卷，判不过转 guide）。
- 已删：Beta/Next 变体、`dsh-community-market/`、`vendor/agents-anywhere/`（含全部 AA 接线）；插件市场只剩 `dshmarket` 与官方内置来源。2026-10-22 又删了 `_deprecated/`（上游 0.1.x 归档）、Next 交接提示（`next-transition-notice` 与 `docs/stable-next-transition`）、`upstream.json` 的 beta channel。

**能跑**：`Start-Process dsh-plugin-desktop\node_modules\electron\dist\electron.exe dsh-plugin-desktop\lib\main.js`，composer 预设默认「引导模式」；`DHDL_SETUP=full` 可看完整 7 屏向导。
**数据隔离**：`run()` 把 `DSH_HOME`/`DHDL_HOME`/`DSH_AGENTS_HOME`/`userData` 全放 `.dhdl/`；`seedProfile()` 只复制 `profiles/dhdl/` 的 `package.json` 与 `cordis.patch.yml`，**不装依赖**——清掉 `.dhdl` 后要手动在 `.dhdl/home/profiles/desktop` 跑一次 `pnpm install`。
**验证现状**：`check:layout`、`typecheck`、桌面包 `build` 通过（2026-10-22 清理后复验过；`yarn build` 目前会先卡在 `market:prepare`，见坑）；桌面包单测 26 个失败，全是 Windows 平台基线（module-resolution 15、linux-artifacts 5、compatibility-shell 2、desktop-runtime-environment 2、electron-runtime 1、recovery-plugin-uninstall 1；2026-10-22 复跑确认，另一次跑出 27，有 1 个偶发）。`corepack yarn check` 全量门禁和 `dist:win` 打包尚未跑过。

**提交**：`272a34c` 删 Beta/Next → `d9dfdba` 删社区市场+AA 并把 hrll 改名 guide → `bc5a422` 三个占位骨架 → `a24d2c9` 记忆 → `c784397` 状态 → `4c56d90` 记忆快照。未 push。

**待办（按优先级）**：
1. 真机跑一道题，验证 guide 模式（系统提示替换 + `read_note` 调用）。
2. `seedProfile()` 后自动装依赖，免手动 pnpm。
3. HRL 模式定稿：优化到什么程度算完、要不要 A/B 保留原答案并采偏好信号、学科备注怎么分、发现学生没做出来是否退回 guide、入口在哪。
4. `dsh-plugin-work` 实现（骨架已建，设计意图与待定问题见 `dsh-plugin-work/README.md`）。
5. schedule / bankmanager 落地（进度口径、课表来源、入库方式、SRS、存储）。
6. 修 Windows 单测、跑全量 `yarn check`、试 `dist:win`。
7. 升级 `dshmarket` 到 1.66.45 并修 `.yarn/patches/dshmarket-desktop.patch`：npm latest 已到 1.66.45，补丁打不上（hunk #2），`build`/`dev`/`package:*` 全卡在 `market:prepare`。
8. README/docs 补 EnSure Lab / 因需 署名。

**坑**：`profile-setup/<hash>/state.json.pending` 必须精确 `pending\n`（8 字节），空文件会让主进程进恢复页；冷启动首屏「正在加载设置…」约 30 秒；billion-context 0.1.202 有 0.1.203 关键更新（升级后需重启 dsh）；`dshmarket` 钉 1.66.44 而 npm latest 是 1.66.45，补丁不兼容，`market:prepare` 失败会还原清单和锁文件——要验证构建就先跑 `workspace dsh-plugin-desktop build` 绕过。


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
