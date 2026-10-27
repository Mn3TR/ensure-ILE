# dsh-plugin-guide

引导模式的预设包（`guide`「引导模式」，Profile 默认预设）：把系统提示整份换成「你是学生做题时的引导者」，并给模型一只读科目备注的手。

## 什么时候用

| 项 | 值 |
|---|---|
| 预设 id | `guide` |
| 显示名 | 引导模式（`cordis.patch.yml` 的 `guide-preset`，`order: 40`） |
| 默认预设 | 是——`profiles/ensure-ile` 的 profile patch 把默认预设设成 `guide` |
| 学生状态 | 还没做出来，需要有人把他的注意力按住 |

系统提示 = `dsh-plugin-teaching-commons` 的 `common` + `bank` 两段 + 本包 `prompts/guide.md`（`src/index.ts:52`，`composePrompt(['common', 'bank'], …)`）。

| 工具 | 用途 | 关键参数 |
|---|---|---|
| `read_note` | 读一个科目的引导备注，开始引导前按科目调一次 | `note`（必填）：`math`（理科）或 `arts`（文科） |

实现委托给 `dsh-plugin-teaching-commons.readNote`：只收小写字母，找不到就回「没有 X 这个科目的备注。可用的有：…」，不抛栈。

## 数据落在哪

本包**不写盘**。

- 提示词在 `prompts/guide.md`，用 `fileURLToPath(new URL('../prompts/guide.md', import.meta.url))` 定位（默认路径 `src/index.ts:40`），**挂载时同步读盘**（`:52`）——改文件不用重建，重启会话即生效；`Config.promptFile` 可换路径。
- 备注在 `dsh-plugin-teaching-commons/skills/`，不在本包。
- 题、课表、教材分别由 `bank_*` / `schedule_*` / `textbook_*` 工具读写，本包不碰这些文件。

## 和邻居的关系

- **依赖** `dsh-plugin-teaching-commons`（按包名 import `composePrompt` / `readNote`），是唯一的编译期依赖。
- 进题与写状态走题库的工具（`bank_add` / `bank_update`），不 import `dsh-plugin-bankmanager` 的源码。
- 和 work / HRL 交接靠题库里的 `handoff` 段 + 交接卡片，不靠提示注入。
- 段落声明 `complete: true`（`order: 0`）：装配时只留这一段，其它 bundle 的提示段全让位——包括 memory 的提示段，所以模型只能靠工具描述理解 `memory_*`。

## 测试与构建

```bash
corepack yarn workspace dsh-plugin-guide typecheck
corepack yarn workspace dsh-plugin-guide build
```

没有单测：唯一行为是「读两个文件、拼字符串、注册一个工具」。`build` = `tsc -p tsconfig.json`（出 `lib/types`）+ `tsdown`（出 `lib/index.js`）；**`lib/` 是入库的构建产物**（profile 用 `file:` 链源码后靠它跑），改完源码要把重建结果一起提交。

## 已知限制

- 整份替换的代价：DSH 默认的工具使用提示段没了（工具定义走 API 的 `tools` 参数，仍可见）；运行上下文（日期、cwd）一并关掉——带一道题时它们是噪声。
- 上游的 `working-directory:current` 段落是 `required`，删不掉，只能用同名空 context（`interpolate: false`、`text: ''`）遮蔽。
- 加科目要动两处：`dsh-plugin-teaching-commons/skills/` 放 `<name>.md`，并在 `prompts/guide.md` 里加一行告诉模型有这个科目。
- 提示词是全仓唯一「改文本即改产品」的地方，没有测试兜着，改坏了只有真机才发现。

## 不做什么

- 不给答案、不给动作，只给注意力——这条只写在 `prompts/guide.md` 里，代码不强制。
- 不批改、不评价学生（那是 `dsh-plugin-hrl`）。
- 不做会话归档与压缩、变式聚类、第二种解法的对照（记在 AGENTS 待办里，不在这包）。
