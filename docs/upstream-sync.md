# 上游同步指南

ensure-ILE 由固定的 Harness 源码、离线运行时、桌面壳 fork 和 profile 组合构成。
升级时分别核对这四层，保留教学插件、学生数据目录与自有品牌。
当前 pin 的唯一记录是 `upstream.json`；包版本、依赖及补丁引用以各 `package.json` 为准。

## 1. 上游身份与本次基线

2026-11-14 同步：

| 层 | 当前基线 | 同步方式 |
| --- | --- | --- |
| Harness 源码 | `dsh-v0.2.2-rc.3`，commit `38a6a5c965aa99ab525161efb7cc5cf1fe62fced` | 只切换子模块 pin，保持源码工作树干净 |
| 离线运行时 | `vendor/dsh-runtime/0.2.2-rc.3/`，375 个包及 `manifest.json` | 对照官方 manifest 校验 tarball 大小与 SHA-256 |
| 桌面壳 | 本地 `0.1.0-alpha11` | 以 `v2.0.23-next` 发布快照中的 `dsh-plugin-desktop/` 子树做三方合并 |
| memory | 上游 `Max-Null/dsh-memory` `0.23.0` | 逐文件合并，保留本地档案工具；见 `dsh-plugin-memory/UPSTREAM.md` |
| skin | 上游 `Nwflower/dsh-claude-style` `0.21.0` | 同步源码和发行产物，重新应用品牌定制；见 `dsh-plugin-skin/UPSTREAM.md` |

桌面仍使用现有 `dsh-plugin-desktop` 架构与数据布局。上游发布同时包含 Stable、Beta、Next
几套桌面包；本次保留原有壳的身份，移植共享运行时与适用修复。额外的 AA bridge、企业入口和
已关闭的 `dshmarket` / `dsh-community-market` 沿用原有禁用决定，不加入本地依赖。
其余教学插件、题库、教材、课表与 community-fabric 均由我们维护。

### 源码与离线包

`deepseek-harness/` 的 origin 为 `https://github.com/deepseek-ai/deepseek-harness.git`。
子模块不得承载本地行为修改：升级会覆盖它，且 `verify-layout` 要求其 index、HEAD 和
`upstream.json` 中的 commit 一致，工作树没有本地修改。

子模块使用自己的 pnpm 工作区；根 Yarn 的桥接入口为：

| 脚本 | 用途 |
| --- | --- |
| `upstream:version` | 确认子模块 pnpm 版本 |
| `upstream:install` | 按子模块锁文件安装 |
| `upstream:build` | 构建上游 |
| `upstream:build:official` | 以 official 客户端剖面构建 |
| `upstream:pack:dsh` | 生成 DSH 运行时 tarball |
| `upstream:prepare-runtime` | 串行完成安装、official 构建与打包 |

也可使用上游发布附带的 official tarball，但必须逐包与发布 manifest 的大小、SHA-256 核对，
并验证来源 commit。导入脚本从 `deepseek-harness/dist/npm/publish-order.txt` 读取包清单。

`node scripts/sync-vendored-runtime.mjs --write` 写入当前 vendor、manifest、DSH resolutions
及依赖版本；`--check` 校验当前版本目录。旧版本目录需另行删除，再用
`corepack yarn install --immutable` 确认依赖没有断开。

### profile 与数据边界

`profiles/ensure-ile/cordis.patch.yml` 覆写壳、通知、默认预设、工作区、皮肤和四个隐藏入口，
本身没有 `insert`；壳的插入行在 `dsh-plugin-desktop/cordis.patch.yml`。

- `name` 是匹配守卫；包名不符会记录 `patch: name mismatch … skipping`。
- `id` 必须命中原行；缺失会记录 `patch: entry … not found`。
- 两者失配均可能只写日志。因此同步后必须启动真实 profile，检查预设、工具面和数据根。
- 默认预设为 `work`，起始人格为 `guide`；`chat` 也保留全部教学人格。
- 打包数据根继续是 `%LOCALAPPDATA%/ensure-ILE-data`；升级不得把数据移回安装目录。
- `seedProfile()` 仅补缺失文件。验证新模板应使用临时数据根，避免删除学生的已安装 profile。

## 2. 补丁清单

本次有 34 个补丁文件、63 条 `patch:` 选择器；33 份实际生效，1 份为明确保留的 known-inert。
即时结果以 `node scripts/verify-patch-references.mjs` 为准。
表中的 DSH 补丁均针对 `0.2.2-rc.3`。

| 补丁文件前缀 | 保留原因 |
| --- | --- |
| `app-builder-lib@26.15.7` | NSIS、签名与 Windows 更新暂存/目录交换适配 |
| `dsh-api-session-controller` | 已丢失工作目录的会话仍可读取用户及内置技能 |
| `dsh-app-boot` | 向内嵌启动器传递桌面解析器及待写入 patch 文档 |
| `dsh-client-modules` | sourcemap 换行统计使用 `indexOf`，减少逐字符开销 |
| `dsh-client-ui-directory-picker-browse` | 原生目录选择与目录有效性校验 |
| `dsh-client-ui-plugin-manager` | 桌面插件偏好及扩展 slot |
| `dsh-client-ui-primitives` | 宽表格保留可拖动的横向滚动条 |
| `dsh-client-ui-settings-account` | 桌面向导的导航组件和遮罩标记 |
| `dsh-client-ui-settings-shell` | 使用桌面 Windows PowerShell 沙箱配置 |
| `dsh-client-ui-sidebar` | 侧栏头部控件的稳定挂载标记 |
| `dsh-experimental-computer-use-cua-driver-native` | 权限查询接到桌面服务；当前不在依赖图中 |
| `dsh-experimental-inspector` | DevTools reload 的 embedder 回调需要真正执行 |
| `dsh-fs-local` | 将 Windows file URL 留下的 `/C:/` 规范化为原生盘符路径 |
| `dsh-hmr` | 支持没有暴露 Node internals 的内嵌公共 loader |
| `dsh-host-directory-picker-browse` | 容忍 Windows 系统目录与 reparse point 的 stat 限制 |
| `dsh-host-open-in-app` | 启动外部应用前清理 `ELECTRON_RUN_AS_NODE` |
| `dsh-http-proxy` | 使用包含修复的 undici dispatcher，避免 Node 24 内置 HTTP 客户端断言导致 Host 退出 |
| `dsh-plugin-manager` | 从安装锚点读取桌面可选及互斥 bundle |
| `dsh-plugin-package-inventory-deepseek` | 包清单解析支持桌面 asar resolver |
| `dsh-ptc-runtime-node` | Electron 宿主的 Node 子进程使用正确环境 |
| `dsh-pwsh-local` | Python 管道输出固定 UTF-8，避免中文 Windows 的 GBK 错码 |
| `dsh-sandbox-local` | 重建被清除的 Windows 私有临时目录；保留 Linux AppImage 执行器挂载 |
| `dsh-sandbox-windows-acl` | 非系统盘工作区设置标签时处理 `WRITE_OWNER` 限制 |
| `dsh-session-reference` | 普通文本中的非法裸会话 URI 原样保留，显式引用仍严格校验 |
| `dsh-storage-json` | 兼容带 UTF-8 BOM 的 JSON 与旧存储记录 |
| `dsh-subprocess-local` | 私有执行器正确启用 Node 模式并隔离目标进程环境 |
| `dsh-web-app` | 浏览器启动器与父进程环境适配 |
| `dsh` | 桌面 profile 管理与 `readPatches` 透传 |
| `fs-ext@2.1.1` | 按 Electron ABI 加载原生模块并保留本地构建路径 |
| `node-pty@1.2.0-beta.15` | spawn-helper 支持私有执行器与 asar.unpacked |
| `open@11.0.1`、`open@11.0.4` | Windows 启动外部程序时隐藏控制台，两份补丁 |
| `pnpm@11.28.5` | 沿用该版本的桌面包管理器修复 |
| `vscode-ripgrep@1.18.0` | `rgPath` 指向真实的 asar.unpacked 可执行文件 |

### 本次退休的补丁

- `dsh-client-ui-settings-general`：新版本已有 `settings.section.icon`。桌面通过
  `src/client/desktop-settings-icon.tsx` 注册自己的图标，删除旧的硬编码 bundle 补丁。
- `pi-ai@1.2.0`：当前依赖已升级；旧补丁无法约束新版本。实查新版本的 Anthropic、DeepSeek、
  Google、OpenAI 和 Responses 实现，流式参数 delta 均为追加写入，终止时仍完整解析，原修复已具备。

computer-use 驱动仍保留在 `KNOWN_INERT`：它暂时没有依赖方，一旦启用相应 bundle，原生权限适配
仍需生效。不得借此把其他失效补丁加入白名单。

## 3. 同步流程

### 开始前

1. 保存当前改动并建立同步分支，记录原 HEAD、目标 tag 和发布 manifest。
2. 分别确认 Harness、桌面、memory、skin 的目标；预发布版需明确记录。
3. 以旧上游、当前 fork、新上游做三方比较，保留自有数据布局、预设及品牌。

### 升级 pin

1. 确认子模块工作树干净，再切换固定 tag/commit。
2. 更新 `upstream.json` 中 commit、sourceVersion、runtimePackageVersion、runtimeSource。
3. 构建或校验 official tarball，准备 `publish-order.txt`，执行 `sync-vendored-runtime --write`。
4. 逐份检查补丁；只改文件名无法保证 hunk 或行为适配。
5. 更新工具链共享类型，例如本次 Cordis `4.1.0`、Schemastery `3.19.0` 和 Zod `4.6.6`。
6. 删除旧 vendor 树，重新安装，再用 `install --immutable` 验证锁文件。
7. 暂存新的子模块 gitlink 后运行布局门禁；子模块 pin 作为独立的 chore 提交。

每个使用 Cordis 的开发工作区还需提供 `cordis-plugin-include` / `cordis-plugin-loader` peer，
使依赖图中的 `Context` 模块扩展属于同一实例；否则人格包会报 `ctx.ileModes` 不存在。

本次 session projection 已要求持有 await 注册返回的 handle。`coreset` 在 `[Service.init]`
完成注册后读取该 handle；turn boundary 由 `ctx.agents.turnBoundaryOf(session)` 提供，
避免使用返回 `unknown` 的旧 `sessionProjections.stateOf(session, key)`。
Cordis `4.1` 的公共 loader 改从 profile 内的 `.cordis/resolve.mjs` 发起导入；桌面解析器必须
识别这个精确边界，才能在无 Node internal loader 的 Electron 中找到壳和链接插件的依赖。
运行时闭包门禁仍要求根包显式提供全部必要 first-party peer；新增包只补依赖，不自动启用其插件。
`WebServer.register` 与 `registerFallback` 现在同时接收函数路由和 `{ resource }`；桌面包装层
需分别转发，HTTP 资源仍过 renderer capability 检查，已准入的进程内 Peer 保留原生读取语义。
账号 `watch` 现在发布 `{ type, state }`，登录交接从 `state.attempt` 读取；直接沿用旧字段会使自动开页停止。

`lru-cache 11.5.3` 使用 `BlueOak-1.0.0`。本次核对上游许可证正文和包内 `LICENSE.md` 后，
将其加入需要保留声明的许可清单；打包继续生成第三方声明并随包附带许可证。

### 桌面与插件

桌面壳可 rebase/cherry-pick；本地已有大量定制时，也可固定发布快照，按源码子树三方移植。
需覆盖相关构建脚本与测试。冲突集中在 `src/index.ts`、`src/profile.ts`、
`cordis.patch.yml`、`build/installer.nsh` 和 `scripts/prepare-profile.mjs`。

memory 与 skin 的本地改动分别见包内 `UPSTREAM.md`。修改可重建插件源码后，必须提交同步的
`lib/`；skin 的 vendored 产物单独恢复品牌，按其说明校验。

### 验证顺序

| 命令 | 验证范围 |
| --- | --- |
| `corepack yarn install --immutable` | 安装结果与锁文件一致 |
| `corepack yarn check:repo` | 子模块、vendor、图标及补丁引用 |
| `corepack yarn check:desktop` | 桌面构建、类型、单测与运行时门禁 |
| `corepack yarn check:plugins` | 提交产物可复现、插件类型与单测 |
| `corepack yarn check` | 上述范围及 community-fabric |
| `corepack yarn check:full` | 全量范围及真实 Electron UI |
| `corepack yarn workspace dsh-plugin-desktop dist:win` | 发布用 Windows 安装包及打包后门禁 |

本机资源紧张时可串行执行相同的组成门禁，避免编译与测试争用内存。
完成后记录版本、命令、退出码和未覆盖的真机步骤；不得用旧版本验证结果替代本次结果。

## 4. 失败信号

| 症状 | 核查点 |
| --- | --- |
| 首屏停留或进入恢复页 | `profile-setup/<hash>/state.json.pending` 应为 `pending\n`；查看 Host 启动日志 |
| 插件整行 pending、工具缺失 | 可选 `webServer` / `webStartup` 应放入嵌套 `ctx.inject` |
| 默认预设、皮肤或工作区路径改变 | profile 的 id/name 守卫及 boot 日志 |
| 旧安装继续使用旧模板 | `seedProfile()` 只补缺；使用临时数据根验证新模板 |
| 子模块 index 与 pin 不符 | 暂存新的 gitlink；HEAD、index、`upstream.json` 应一致 |
| 子模块有修改 | 保留现场核对来源，再恢复到记录的上游 commit；不要在其中修本地行为 |
| 安装成功但补丁无效 | 运行 `verify-patch-references`，核对选择器与锁文件中的实际请求描述符 |
| install 报 patch hunk 错误 | 对新版本重新定位目标并重打，保留行为验证 |
| `ZodType` 缺少 `validate` / `validateAsync` | 共享 schema 与运行时依赖版本不一致 |
| 内存耗尽而没有类型错误 | 串行重跑对应编译/门禁，保留首次失败记录 |
| vendor 残留旧版本树 | 只保留当前 pin 的目录，再验证 immutable install |
