# 上游同步指南

> 上游动了，我们怎么跟。ensure-ILE 不是上游的一份副本，而是**四层叠出来的**：pinned 子模块、打补丁的 npm 包、fork 出来的桌面壳、profile 运行时组合。四层的同步节奏完全不同——换 pin 不等于重打补丁，改壳不等于改插件，混着谈就会把「升级」和「修复」当成同一件事。

## 1. 四层身份

| 层 | 载体 | 上游坐标 | 我们怎么改它 | 同步动作 |
| --- | --- | --- | --- | --- |
| ① 源码底座 | `deepseek-harness/` 子模块 | `dsh-v0.2.1-rc.2` = `687f282e86` | **不改** | 换 pin |
| ② 运行时包 | 注册表 `@deepseek-ai/*` + `patches/*.patch` + `vendor/dsh-runtime/` | 同上版本的 tarball | 29 个补丁 | 换 pin 后重打补丁 |
| ③ 桌面壳 | `dsh-plugin-desktop/`（仓库内 workspace） | `anywhere-labs/dsh-desktop` | 直接改源码 | `git fetch upstream` + 合并 |
| ④ 运行时组合 | `profiles/ensure-ile/cordis.patch.yml` | 无（我们独有） | 行覆写 | 跟随上游 row id / schema |

### ① 子模块：pin 住的上游源码

`.gitmodules:1-3` 把 `deepseek-harness` 指向 `https://github.com/deepseek-ai/deepseek-harness.git`；当前 pin 是 `687f282e8625c6b8d11ff58211a90524be2e4317`，正好是 tag `dsh-v0.2.1-rc.2`（`git submodule status` 的第一列就写着）。工作树**一行未改**：`git -C deepseek-harness status --short` 输出为空，`scripts/verify-layout.mjs` 里也有同一条断言（`deepseek-harness contains local changes`）。

它自带 pnpm 工作区（`deepseek-harness/package.json` 的 `packageManager` 是 `pnpm@…`），**不要**用根 Yarn 进去装东西。根 `package.json:770-775` 提供六个桥接脚本：

| 脚本 | 实际做什么 |
| --- | --- |
| `upstream:version` | `cd deepseek-harness && corepack pnpm --version`——只确认子模块里用的是 pnpm |
| `upstream:install` | `CI=true corepack pnpm install --frozen-lockfile` |
| `upstream:build` | `corepack pnpm run build` |
| `upstream:build:official` | 同上，但加 `DSH_BUILD_CLIENT_PROFILE=official`（官方客户端剖面） |
| `upstream:pack:dsh` | `corepack pnpm run release:pack --family dsh`，产出 `@deepseek-ai/*` 的 tarball |
| `upstream:prepare-runtime` | 上三条串起来：install → build:official → pack:dsh。**这就是 vendor 目录的上游** |

### ② npm 包层：补丁落在安装后的包上

根 `package.json:23-720` 的 `resolutions` 一共 **697 条**：其中 **52 条是 `patch:` 引用、指向 29 个 `patches/*.patch`**（改上游包的行为），其余把每个 `@deepseek-ai/dsh*` 钉到 `file:vendor/dsh-runtime/0.2.1-rc.2/*.tgz`（`package.json:35` 起），另有 `koffi` 一类的版本收敛。

`vendor/dsh-runtime/0.2.1-rc.2/` 是 tarball 树（344 个条目：343 个包 + `manifest.json`），由 `scripts/sync-vendored-runtime.mjs` 维护：`--write` 按 `upstream.json` 的 `channels.<channel>` 重写 tarball、`manifest.json` 和根 `resolutions`；`--check` 只校验。**它的视野只有当前版本目录**（`readdirSync(vendorDirectory)`，脚本 114 / 197 行），所以旧版本树堆在那里它结构上看不见——清理旧树是人的动作，清完必须跑 `corepack yarn install --immutable` 证明没断。

**为什么用补丁，而不是改子模块？** 子模块是 pinned 契约：它必须和 `upstream.json` 的 commit 完全一致，否则 `verify-layout` 直接失败，而且下一次换 pin 会把改动冲掉。补丁落在**安装后的 npm 包**上，于是：升级可控（换 pin 时补丁失配会显式失败而不是悄悄带走改动）、可单独回退（删一条 `resolutions` 就退回上游行为）、不污染上游源码树。

### ③ 桌面壳：是 fork，不是子模块

`git remote -v` 里 `origin` 是 `https://github.com/Mn3TR/ensure-ILE.git`，`upstream` 是 `https://github.com/anywhere-labs/dsh-desktop.git`——所以「上游桌面发新版」**不是 checkout，是移植**。事实：

- `dsh-plugin-desktop/package.json` 的 `name` 是 `dsh-plugin-desktop`、版本 `0.1.0-alpha4`（2026-10-31 起转 α 线，与上游 2.0.18 的版本号脱钩）；本地 tag 有 `v2.0.18` / `v2.0.18-beta.1` / `v2.0.19-next` / `v0.1.0-alpha1`。
- 我们和上游**共享历史**（fork 根 `b67e81ac97` 是 `upstream/master` 的祖先），不是压成一份拷贝。分叉点是 `6a63b9730b`（2026-10-18，`fix(desktop): support AA Schemastery 3.18.5 builds (#1417)`）。
- 当前相对 `upstream/master`（`092e2ecef7`，2026-10-24）：**落后 33 个提交、领先 60 个提交**。`dsh-plugin-desktop/` 这棵树有 732 个提交的历史。
- `THIRD_PARTY_NOTICES.md` 是按安装产物生成的第三方清单（`@deepseek-ai/*` 全是 `0.2.1-rc.2`），跟上游 repo 的 license 无关，不构成同步依据。

两种做法，代价不同：

| 做法 | 怎么做 | 代价 |
| --- | --- | --- |
| **rebase 上游 tag 到保命分支** | `git fetch upstream --tags` → 在 `sync/v2.0.19` 上 `git rebase upstream/v2.0.19` | 60 个本地提交逐条重放，冲突集中在 `dsh-plugin-desktop/src/`、`build/`、`cordis.patch.yml`；rebase 期间不能边改边验，一崩就得重来。产出的是线性历史，最干净 |
| **只 cherry-pick 需要的修复** | `git log upstream/master --oneline` 挑 → `git cherry-pick -x <sha>` | 每次都要判断「这个修复依赖上游的哪次重构」，依赖链一长就会挑到半截；好处是随时停，风险只在单个提交 |


### ④ profile 组合层：运行时 patch，不是源码

`profiles/ensure-ile/cordis.patch.yml` 只有 4 行条目，**没有一条是 `insert:`**——它全部是「按 `id` 覆写已有行的字段」：

| 行 | 目标 | 覆写了什么 | 行长 |
| --- | --- | --- | --- |
| `desktop-shell` | `dsh-plugin-desktop`（带 `name` 守卫） | `mode: advanced`、`windowsMaterial: off`、`openBrowser: false`、`networkExposure: loopback` | `:7-13` |
| `desktop-notifications` | `dsh-plugin-desktop/notifications`（带 `name` 守卫） | `enabled` + 六个 `notifyOn*` 全 `false` | `:16-25` |
| `agent-preset-registry` | 同名行 | `default: guide`——新会话直接用引导模式 | `:29-31` |
| `workspace-controller` | 同名行 | `documentsDirectory: !!js dshHomePath('..')`，把默认工作区拽进数据根 | `:37-39` |

插行是**包层**干的，不是 profile 干的：`dsh-plugin-desktop/cordis.patch.yml` 里才有 `- insert:` 块（`desktop-shell` / `desktop-terminal` / `desktop-diagnostics` / `desktop-notifications` / `desktop-pnpm` / `desktop-profiles` / `desktop-updates`），并且在同一个文件里把 `preset-standard` / `preset-ptc` / `preset-minimal` / `preset-cordis` 四个预设 `disabled: true`。

语义来自 include 插件的 `applyEntryPatches`（`dsh-plugin-desktop/node_modules/@deepseek-ai/cordis-plugin-include/lib/index.js:56-105`）：只有带 `insert` 的行会追加（`:69-84`），其余行必须带 `id`，按 `id` 命中后逐字段覆写（`:86-102`）。

- `name` 是**守卫不是身份**：不一致时打印 `patch: name mismatch for … skipping` 并跳过（`:95-98`）；`id` 没命中则打印 `patch: entry … not found`（`:91-93`）。

于是上游一旦改 row id 或改插件 specifier，这里**不会报错，只会静默不生效**：`agent-preset-registry` 改名 → 新会话回到 `standard` 预设；`workspace-controller` 改名 → 默认工作区跑回系统 Documents；`desktop-shell` 改包名 → 三个 config 字段全丢，壳回到兼容模式。症状在「失败信号表」里。

### ⑤ 我们自己的包

根 `package.json:10-22` 有 11 个 workspace；**需要跟上游同步的只有前两个包**，其余九个的上游就是我们自己：

| workspace | 出身 |
| --- | --- |
| `dsh-plugin-desktop` | **fork**：上游 `anywhere-labs/dsh-desktop`（见 ③） |
| `dsh-plugin-memory` | **fork**：`@max-null/dsh-memory` `v0.18.0`，我们的版本号 `0.18.0-ensure-ile.1`；同步规则写在 `dsh-plugin-memory/UPSTREAM.md`（不合并历史，逐文件搬；未合清单在同一份文件里） |
| `dsh-plugin-teaching-commons` / `setup` / `guide` / `work` / `hrl` / `bankmanager` / `textbook` / `schedule` | **原创**，没有上游，也就没有同步动作 |
| `dsh-community-fabric` | **原创纯文档**，不声明可加载入口 |


## 2. 补丁清单（29 个）

每个补丁都是从 `.patch` 的 hunk 读出来的，不是从 README 抄的。类别只有四种：**功能**（我们要的行为）、**平台适配**（Electron/Windows 下上游包跑不起来）、**打包**（安装器/asar 路径）、**上游 bug fix**（上游自身的缺陷，谁用谁中）。

| 补丁 | 目标包 | 干什么 | 类别 |
| --- | --- | --- | --- |
| `app-builder-lib@26.15.7.patch` | `app-builder-lib` | mac 侧支持一串证书逐个导入（`importCerts` + `set-key-partition-list`）；NSIS 加 `ManifestLongPathAware`、用 PowerShell CIM 判断「同一目录已有实例在跑」、改成 `Nsis7z::Extract` 就地覆盖（不再先解到 `$PLUGINSDIR` 再拷一遍）、旧卸载器返回 2 时继续非原子替换 | 打包 |
| `dsh-app-boot@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-app-boot` | 把 `readPatches` 与 `resolvePackageManifest` 透给内嵌 launcher：桌面壳自己算 bundle 图，但「待写入的 patch 文档」必须能被配置编辑器看到 | 平台适配 |
| `dsh-client-modules@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-client-modules` | 换行计数从 `for (const char of value)` 改成 `indexOf('\\n')` 循环——sourcemap 修正时的性能 | 上游 bug fix |
| `dsh-client-ui-directory-picker-browse@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-client-ui-directory-picker-browse` | 目录浏览器加「原生选择」和「先校验再进入」两条状态（`nativePicking` / `validatingDirectory`），上行按钮在忙时 inert | 功能 |
| `dsh-client-ui-plugin-manager@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-client-ui-plugin-manager` | 加 `plugins.bundle.hidden` / `plugins.item.hidden` 两个偏好；把包卡片、条目详情、页头开放成 slot（`plugins.bundle.actions` 等），让桌面壳能插自己的控件 | 功能 |
| `dsh-client-ui-primitives@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-client-ui-primitives` | 宽表格横向滚动：`overflow-x` + 细滚动条样式（`MarkdownText.module.css`） | 功能 |
| `dsh-client-ui-settings-account@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-client-ui-settings-account` | 把引导向导弹窗底部的返回/跳过拆成 `DesktopOnboardingNavigation` 组件，并加 `data-desktop-onboarding-surface` 标记 | 功能 |
| `dsh-client-ui-settings-general@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-client-ui-settings-general` | 自带一个 16×16 的「桌面设置」图标——上游 slot 还不收图标 | 功能 |
| `dsh-client-ui-settings-shell@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-client-ui-settings-shell` | 认 `desktop-windows-pwsh-sandbox` 这一 config 命名空间：存在时用它取代上游 `pwsh` 卡片（Electron 下 ACL 启动要换执行器） | 平台适配 |
| `dsh-client-ui-sidebar@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-client-ui-sidebar` | 侧栏头部加 `data-sidebar-header-controls` 挂载点 | 功能 |
| `dsh-experimental-computer-use-cua-driver-native@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-experimental-computer-use-cua-driver-native` | `check_permissions` 改走 `inner.get('desktopPermissions')`：屏幕/辅助功能权限由桌面壳查和请求，驱动只报实际状态 | 平台适配 |
| `dsh-experimental-inspector@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-experimental-inspector` | devtools chunk 里 `reattach(e) {}` 空实现改成真的 `e()` | 上游 bug fix |
| `dsh-hmr@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-hmr` | 允许「公共 loader 内嵌」：没有 module internals 时不再抛 `--expose-internals is required`，改为跳过 module 比较式重载 | 平台适配 |
| `dsh-host-directory-picker-browse@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-host-directory-picker-browse` | Windows 的 reparse / 系统目录 `stat` 会失败，也当「可进入」处理，别让上级列表整个坏掉 | 平台适配 |
| `dsh-host-open-in-app@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-host-open-in-app` | 拉起外部应用前把 `ELECTRON_RUN_AS_NODE` 从子进程环境里洗掉（两份解析器都改） | 平台适配 |
| `dsh-plugin-manager@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-plugin-manager` | 从 `installation` 锚点 JSON 读 `dsh.optionalBundles` / `dsh.exclusiveBundles`：互斥 bundle 启用时把对方挤掉，被保护的 manager 受保护 | 功能 |
| `dsh-plugin-package-inventory-deepseek@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-plugin-package-inventory-deepseek` | 包清单解析走桌面壳的 asar resolver（壳自己住在 `app.asar` 里，不在 `node_modules`），`MODULE_NOT_FOUND` 时回退上游查找 | 平台适配 |
| `dsh-ptc-runtime-node@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-ptc-runtime-node` | Electron 宿主里给子进程单独设 `ELECTRON_RUN_AS_NODE=1`（宿主自己是 utility process，带不了这个开关） | 平台适配 |
| `dsh-sandbox-windows-acl@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-sandbox-windows-acl` | `D:` 这类非系统盘的工作区只有 `Modify`、连属主都没有 `WRITE_OWNER`，标签写入报 `ERROR_ACCESS_DENIED(5)` 时先给自己授 `WRITE_OWNER` 再重试一次 | 平台适配 |
| `dsh-subprocess-local@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-subprocess-local` | 私有 runner 在 Electron 宿主下必须 Node 模式启动；继承来的 `ELECTRON_RUN_AS_NODE` 先删再加，绝不写进 IPC 传过去的目标 env | 平台适配 |
| `dsh-web-app@0.2.1-rc.2.patch` | `@deepseek-ai/dsh-web-app` | 洗父进程 env + 给浏览器启动器补 `ELECTRON_RUN_AS_NODE: '1'` 和 `windowsHide: true` | 平台适配 |
| `dsh@0.2.1-rc.2.patch` | `@deepseek-ai/dsh` | 桌面 profile 下 `rejectElectronProfile` 只在 `manageDesktopProfile` 为假时生效；`readPatches` 一路传进 `profile-boot` | 平台适配 |
| `fs-ext@2.1.1.patch` | `fs-ext` | Electron 下按 ABI 找 `prebuilds/<platform>-<arch>/electron.abi<N>.node`；`install.js` 换成本地编译路径 | 平台适配 |
| `node-pty@1.2.0-beta.15.patch` | `node-pty` | `spawn-helper` 路径三级回退：`DSH_NODE_PTY_SPAWN_HELPER` → `execPath + '-spawn-helper'` → `app.asar.unpacked` 里的原生目录 | 打包 |
| `open@11.0.1.patch` / `open@11.0.4.patch` | `open` | `windowsHide: true`，别弹黑框（两个版本各一份） | 平台适配 |
| `pi-ai@1.2.0.patch` | `@earendil-works/pi-ai` | 六个 provider 都删掉流式 delta 里的 `block.arguments = parseStreamingJson(...)`；终止性的 `toolcall_end` / `content_block_stop` 解析保留。副作用：流式过程中 `partial` 快照拿不到半成品 arguments | 上游 bug fix |
| `pnpm@11.8.0.patch` | `pnpm` | `minimumReleaseAge` 判定修好：按 `publishedBy` 算 cutoff、非有限值不当成违规 | 上游 bug fix |
| `vscode-ripgrep@1.18.0.patch` | `@vscode/ripgrep` | `rgPath` 把 `app.asar` 改写成 `app.asar.unpacked`——spawn 需要真实路径，Electron 改不了 spawn 命令 | 打包 |

统计：平台适配 15、功能 6、打包 3、上游 bug fix 5。29 个文件里 28 个真在生效；`dsh-experimental-computer-use-cua-driver-native@0.2.1-rc.2.patch` 目前**没有施主**（见 3.4）。

## 3. 同步流程

### 3.1 只升 npm 包小版本（pin 不动）

典型来源：某个第三方依赖从 `open@11.0.4` 升到 `11.0.5`，或者 `@earendil-works/pi-ai` 从 1.2.0 升到 1.3.0。

```bash
# 1. 改之前先查选择器还匹配不匹配（这一步最容易被跳过）
grep -n 'patches/' package.json | grep -o '"[^"]*@npm:[^"]*"' | sort -u
node scripts/verify-patch-references.mjs      # 退出码非 0 就有补丁没施主

# 2. 装，然后**看 lock 里到底有没有生效**
corepack yarn install
grep -c './patches/' yarn.lock                # 生效数量应与 resolutions 的 patch: 条数对得上

# 3. 收紧
corepack yarn install --immutable
```

两种失败方式必须分清：

| 现象 | 原因 | 后果 |
| --- | --- | --- |
| `install` 成功、零告警、lock 里没有 `patch:` 条目 | 选择器匹配不到任何依赖方声明的描述符 | **静默失效**——补丁文件在、什么都不做 |
| `install` 直接失败，报补丁无法应用 | 选择器匹配了，但 hunk 与新版本文件内容对不上 | 显式失败，比上面安全 |

### 3.2 升子模块 pin（换 tag）

```bash
# 1. 换 pin
git -C deepseek-harness fetch --tags origin
git -C deepseek-harness checkout dsh-v0.2.2          # 目标 tag
node -p "require('./deepseek-harness/package.json').version"   # 记下新 sourceVersion

# 2. 同步 upstream.json 的四个字段（upstream.json:5-11）
#    commit = git -C deepseek-harness rev-parse HEAD（40 位）；sourceVersion = 上一步打印的版本
#    runtimePackageVersion = tarball 版本族（通常同 sourceVersion）；runtimeSource = vendor/dsh-runtime/<sourceVersion>/manifest.json

# 3. 从子模块产出官方运行时 tarball（install → build:official → pack:dsh）
corepack yarn upstream:prepare-runtime
ls deepseek-harness/dist/npm/publish-order.txt       # 打包清单，--write 认这个文件

# 4. 落 vendor：拷 tarball、删多余文件、重写 manifest.json / upstream.json / resolutions DSH 段 / 依赖版本
node scripts/sync-vendored-runtime.mjs --write --channel stable

# 5. 补丁改名 + 重打：文件名带版本号（脚本只在 patches/<包名去 scope>@<version>.patch 存在时才写 patch: 形式）
```

`check:layout` 里的 `verify-layout` 与 `sync-vendored-runtime --check` 会比对什么：

- 子模块在 index 里必须是 `160000` 且 object == `upstream.json` 的 `commit`；
- 子模块 `HEAD` == 该 commit、**工作树必须干净**、`origin` == `upstream.json.repository`；
- 子模块 `package.json` 的 version == `sourceVersion`；
- `.gitmodules` 的 path / url 必须与 `upstream.json` 一致，且 `activeChannel` 必须在 `channels` 里声明；
- 桌面壳依赖的每个 `@deepseek-ai/dsh*` 版本 == `runtimePackageVersion`；
- vendored runtime：`manifest.json` 的 `repository`/`commit`/`version`/`buildProfile: official` 与 `upstream.json` 一致，每个 tarball 的 size 与 sha256 与 manifest 一致，`resolutions` 两条选择器（精确版本 + `^version`）都指向 `expectedResolution`，目录里没有多余条目，且没有残留的「同 channel 但不是这批包」的 DSH resolution。

最后：`corepack yarn install --immutable` 必须 `exit 0`——这是「换 pin 没把锁文件扯坏」的唯一证据。

### 3.3 上游桌面壳发新版

```bash
git fetch upstream --tags
git log --oneline HEAD..upstream/master          # 现在会看到 33 个（2026-10-24 基线）
git diff --stat HEAD...upstream/master -- dsh-plugin-desktop
```

然后二选一（代价见 ③ 的表）：

```bash
# A. rebase 上游 tag 到保命分支
git switch -c sync/upstream-$(date +%Y%m%d) master
git rebase upstream/master        # 60 个本地提交逐条重放
# B. 只挑需要的修复
git cherry-pick -x <sha>
```

冲突热点：`dsh-plugin-desktop/src/index.ts`（我们注册的桌面 HTTP 路由）、`dsh-plugin-desktop/cordis.patch.yml`（`insert` 与 `disabled` 列表）、`dsh-plugin-desktop/build/installer.nsh`（数据根迁移）、`scripts/prepare-profile.mjs` 镜像的 `profiles/`。合完先跑 `corepack yarn workspace dsh-plugin-desktop typecheck`，再跑 3.5 的清单。

### 3.4 某个补丁静默失效——真发生过

pi-ai 的流式工具参数补丁从锁到 1.2.0 起就没生效过，2026-10-28 才被 grep 到。链条是：

1. `resolutions` 里写的是 `@earendil-works/pi-ai@npm:^0.87.1` 与 `@npm:^1.0.2`，而依赖方实际声明的是 `npm:^1.1.0`；
2. Yarn 只在「选择器 == 某个被请求的描述符」时才套补丁，于是两条都**静默忽略**：安装零告警、lock 里没有 `patch:` 标记、补丁文件安然躺在 `patches/`。
3. 现在的对应关系是 `package.json:32` 的 `@earendil-works/pi-ai@npm:^1.1.0` → `patches/pi-ai@1.2.0.patch`。

第二个真实条目（当前仍未生效）：`patches/dsh-experimental-computer-use-cua-driver-native@0.2.1-rc.2.patch`。`package.json:665-666` 的两条 resolution 把它指向 vendor 里的 tarball，tarball 也确实在 `vendor/dsh-runtime/0.2.1-rc.2/`（`deepseek-ai-dsh-experimental-computer-use-cua-driver-native-0.2.1-rc.2.tgz` 等四个 computer-use 包都在），但 `grep 'cua-driver-native' yarn.lock` 是 **0 条**、`grep 'dsh-computer-use' yarn.lock` 也是 0 条——整个 computer-use 分支不在本仓库的 Yarn 依赖图里，没有任何包请求这些描述符。**补丁在、resolution 在、tarball 在，但 lock 里没有实体 ⇒ 无施主 ⇒ 静默失效。**

核查命令：

```bash
node scripts/verify-patch-references.mjs        # 直接标 INERT + 原因
grep -c 'cua-driver-native' yarn.lock           # 手验法：0 就是没施主
```

**建议：保留，不删。** 补丁内容本身是活的（给 `check_permissions` 接桌面权限：`inner.get('desktopPermissions')` 查屏幕/辅助功能并请求），而 computer-use 一旦回到依赖图（profile 里挂上对应 bundle），这两条 resolution 就会立刻生效。代价只是 1.7 KB 文件与一条 INERT 噪声；删掉反而会让人以为「我们没打算支持」。

`scripts/verify-patch-references.mjs` 现在是**孤儿脚本**：它自己注释里写了 `Orphan status: not part of yarn check yet. See docs/upstream-sync.md`。要不要接进 `check:layout` 由李定——接进去的好处是失配当天就红，坏处是它把「vendor 里留着一个没人装的包」这种合法状态也判成失败（当前会红一次）。

### 3.5 同步后的固定事项清单

按顺序跑，每条都在根 `package.json` 里有对应脚本：

| # | 命令 | 断言 |
| --- | --- | --- |
| 1 | `corepack yarn install --immutable` | `exit 0`——锁文件与 `resolutions` 一致 |
| 2 | `corepack yarn typecheck` | 桌面壳类型全绿 |
| 3 | `corepack yarn check` | = `check:layout` + community-fabric + 桌面包；**不跑插件包单测** |
| 4 | `corepack yarn check:plugins` | 9 包 typecheck + setup/bankmanager/memory/textbook/schedule 单测 |
| 5 | `corepack yarn icons:check` | 图标源与全平台资源一致 |
| 6 | `corepack yarn dist:win` | 真实打包；产物在 `dsh-plugin-desktop/dist/`，装完数据根 = `%LOCALAPPDATA%\ensure-ILE-data` |
| 7 | AGENTS.md 记账 | 版本号、验证现状、新踩的坑 |

## 4. 失败信号表

| 症状 | 先看哪里 |
| --- | --- |
| 启动卡在「正在加载设置…」或恢复页 | `profile-setup/<hash>/state.json.pending` 必须精确 `pending\n`（8 字节），空文件会进恢复页；冷启动首屏约 30 秒不是卡死（`dsh-plugin-desktop` 的 `seedProfile()` / profile 引导） |
| 某个插件整行不加载、工具全不见 | 该行 `inject` 里写了可选通道（`webServer` / `webStartup`）——必须改成嵌套 `ctx.inject([...], …)`；顶层 `inject` 会让没有 web-app 的 profile 整行 pending |
| profile 改了不生效、新会话还是 standard 预设 | `cordis.patch.yml` 的行 `id` 与上游对不上：boot 日志会有 `patch: entry … not found`；包名变了则是 `patch: name mismatch for … skipping`（`cordis-plugin-include/lib/index.js:91-98`） |
| 补丁疑似没生效 | `grep -c './patches/' yarn.lock`；`node scripts/verify-patch-references.mjs`；再看选择器是否等于依赖方声明的描述符（3.4） |
| `vendor/dsh-runtime/` 下多出旧版本目录 | `ls vendor/dsh-runtime/`——只能有 `upstream.json` 指向的那一个；`--check` 只看当前目录，看不见旧树。清完必须 `install --immutable` |
| 改了 `profiles/ensure-ile/` 但老安装还用旧模板 | `seedProfile()` **只在文件不存在时复制**：删 `.ensure-ile/home/profiles/desktop` 再启动，然后手动跑一次 `pnpm install --offline` |
| 子模块被改脏 | `git -C deepseek-harness status --short` 非空 → `verify-layout` 报 `deepseek-harness contains local changes`，先还原 |
| 换 pin 后桌面壳依赖版本漂移 | `verify-layout`：`<pkg> @deepseek-ai/dsh-* must use the recorded stable DSH runtime package family` |
| 补丁文件在但 install 失败 | 选择器命中了，hunk 对不上新版本文件内容——按新版本重打，别改选择器 |
