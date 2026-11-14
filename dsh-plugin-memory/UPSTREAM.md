# UPSTREAM — dsh-plugin-memory 的上游关系

此包 fork 自 [Max-Null/dsh-memory](https://github.com/Max-Null/dsh-memory)，按版本逐文件同步，不合并上游提交历史。

- 当前上游基线：`v0.23.0`，同步日期：2026-11-14。
- 本包版本：`0.23.0-ensure-ile.1`。
- 上一基线：`v0.18.0`。本次合入其后全部宿主源码、客户端源码与测试变更。

## 保留的本地定制

- 包名、bundle 行的包名、客户端 loader id 和设置页 tab id 使用 `dsh-plugin-memory`。
- `profile_read` / `profile_write` 继续读写 `<DSH_HOME>/profile/{grade,schedule,rhythm,preference}.md`。
  档案不参与记忆检索，也不占常驻注入预算；默认工具共 16 个，显式启用云同步后为 18 个。
- `build-bundle.mjs` 内联 zod、isomorphic-git 及代理实现，保持 profile 离线安装。
  `@deepseek-ai/*` 保持 external，由 Host 提供同一份实例；CommonJS 依赖通过 ESM 的 `createRequire` 加载。
- 所有构建依赖放在 devDependencies，profile 不需要从注册表下载运行时依赖。
- `src/index.ts` 保留 system-prompt 服务的 type-only 导入。
- 开发依赖与 Harness `0.2.2-rc.3` 对齐：Cordis `4.1.0`、Schemastery `3.19.0`、Zod `4.6.6`，
  避免存储 descriptor 与本地 schema 使用不同的 Zod 类型。
- 组装提示词的测试显式挂载官方 native executor，复现新版部署默认组合；保留真实工具 schema 与注入断言。

## 本次同步的关键行为

- 备份使用引擎实际打开过的工作区集合，并随 `DSH_HOME` 隔离备份目录。
- storage backend 的注册 disposer 随插件卸载执行，支持重复挂载。
- 新增主题和日记；日记使用独立 md 文件，归档只增不删。
- 云同步默认关闭；显式开启后才注册 `memory_sync` / `memory_conflicts`。
  同步沿用上游 0.23.0 的按端分片状态、显式删除清单和墓碑冲突处理。
- 设置导航图标改用 Harness 0.2.2 的原生图标插槽，移除旧 MutationObserver 兼容实现。

## 下次同步

1. 下载固定 tag，与本文件记录的基线做三方比对。
2. 合并 `src/`、`test/` 及相关构建变更，保留学生档案工具和离线打包约束。
3. 更新包版本、自述工具清单和 README；工具数量应与实际注册表一致。
4. 在仓库根运行 `corepack yarn workspace dsh-plugin-memory typecheck`、`test`、`build`。
5. 运行桌面完整门禁与离线 profile 验证后，更新此处的基线记录。

## 未合清单

- 上游独立仓库的 npm/pnpm 锁文件、发布工作流和包发布配置；本仓库使用根 Yarn 锁文件与 Windows 发布流程。
