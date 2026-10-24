# UPSTREAM — dsh-plugin-memory 的上游关系

这个包是 [Max-Null/dsh-memory](https://github.com/Max-Null/dsh-memory) 的 **fork**（李 2026-10-23 定：
「更新到最新版本之后 fork 成我们自己的 memory 系统，从此只选择性同步上游」）。

- 上游 tag：`v0.18.0`
- 拷贝日期：2026-10-23
- 我们的版本号：`0.18.0-ensure-ile.N`（`N` 是我们自己的改动轮次，不是上游补丁号）

## 为什么 fork

上游是「模型自己的跨会话记忆」。ensure-ILE 要的是「**这个学生**的记忆」：工具描述、提示段、
命名空间语义、注入策略都得换成学生口径（见 `AGENTS.md` 的「共享数据层」）。上游没有扩展点，
所以拿源码自己改，不再跟着它的 release 走。

## 今天改了什么（相对 v0.18.0）

- `package.json`：`name` → `dsh-plugin-memory`，`private: true`，`version` → `0.18.0-ensure-ile.1`，去掉 `publishConfig`
- `cordis.patch.yml`：插入行的 `name` → `dsh-plugin-memory`
- **zod 内联**：`build-bundle.mjs` 用 esbuild 把 `zod` 打进 `dist/index.js`，`@deepseek-ai/*` 全部 external；`zod` 从 `dependencies` 挪到 `devDependencies`，profile 安装不碰注册表
- **client id 跟包名走**：`build-client.mjs` 从 `package.json` 读 `name`，`src/client/index.tsx` 里两处硬编码一起改
- `src/index.ts` 加一行 type-only 的 `@deepseek-ai/dsh-system-prompt` 导入——原来缺它，`ctx.systemPrompt` 的类型补不出来
- devDeps 对齐 host 的 `0.2.1-rc.2`（原来锁 `0.2.0-rc.1`，类型对不上）

**还没改的**（下一轮要做的）：

1. 工具描述 / 系统提示段改成「学生」口径（现在还是「你的记忆」）
2. `global` 层当学生档案用，`project` 层留给 agent 的工程笔记

## 接入 profile（已完成，2026-10-24）

`profiles/ensure-ile/package.json` 的 `bundles` 与 `dependencies` 已换成 `dsh-plugin-memory` + `file:../../../../dsh-plugin-memory`；
根 `workspaces`、`scripts/verify-layout.mjs` 都已加。离线装：在 `.ensure-ile/home/profiles/desktop` 跑
`node ../../../../dsh-plugin-desktop/node_modules/pnpm/bin/pnpm.cjs install --offline`（profile 里带 `pnpm-workspace.yaml`，关掉了 peer 自动安装）。

## 怎么同步上游

不合并上游的提交历史，只搬我们需要的改动：

1. `git clone --depth 1 --branch vX.Y.Z https://github.com/Max-Null/dsh-memory /tmp/dsh-memory-upstream`
2. `diff -r src/ /tmp/dsh-memory-upstream/src/` 看上游改了什么
3. 挑需要的搬过来（一个文件一个文件搬，别整包覆盖——我们改过的提示段会被冲掉）
4. 搬完跑 `pnpm install && pnpm build && pnpm test`，再决定要不要进 profile
5. 没搬的记到下面的「未合清单」

## 未合清单

- （空）
