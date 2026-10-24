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
- 其余原样：`src/`、`test/`、`scripts/`、`build-client.mjs`、`tsconfig.json` 一字未动

**还没改的**（下一版要做的）：

1. 工具描述 / 系统提示段改成「学生」口径（现在还是「你的记忆」）
2. `global` 层当学生档案用，`project` 层留给 agent 的工程笔记
3. `client.js` 里还写死着 `@max-null/dsh-memory` 的 client id——等 `build-client.mjs` 重跑时会生成新的，
   在那之前**不要**把这个包接进 profile（client id 和包名对不上）

## 接入 profile（还没做）

现在 `profiles/ensure-ile/package.json` 里依赖的仍是 npm 上的 `@max-null/dsh-memory@0.15.1`。换成本包要动三处：

1. 根 `package.json` 的 `workspaces` 加上 `dsh-plugin-memory`
2. `scripts/verify-layout.mjs` 里写死的 workspace 列表同步加上（不然 `check:layout` 会红）
3. `profiles/ensure-ile/package.json`：`bundles` 与 `dependencies` 换成 `file:../../../../dsh-plugin-memory`，
   然后在 `.ensure-ile/home/profiles/desktop` 里 `pnpm install`

## 怎么同步上游

不合并上游的提交历史，只搬我们需要的改动：

1. `git clone --depth 1 --branch vX.Y.Z https://github.com/Max-Null/dsh-memory /tmp/dsh-memory-upstream`
2. `diff -r src/ /tmp/dsh-memory-upstream/src/` 看上游改了什么
3. 挑需要的搬过来（一个文件一个文件搬，别整包覆盖——我们改过的提示段会被冲掉）
4. 搬完跑 `pnpm install && pnpm build && pnpm test`，再决定要不要进 profile
5. 没搬的记到下面的「未合清单」

## 未合清单

- （空）
