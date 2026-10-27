# dsh-plugin-teaching-commons

四个模式共用的教学文字（说话方式、安全边界、题库规则）与学科备注，外加一个 `readNote` 实现——它是**库，不是 bundle**。

## 什么时候用

| 项 | 值 |
|---|---|
| 预设 / bundle 行 | 都没有 |
| `cordis.patch.yml` | 故意没有：它不在 `profiles/ensure-ile/package.json` 的 `bundles` 列表里，只作为 `dependencies` 被 guide / work / hrl / setup 引用 |
| 谁在用它 | `dsh-plugin-guide` / `-work` / `-hrl` 拼 `['common', 'bank']`；`dsh-plugin-setup` 只拼 `['common']` |

| 文件 | 内容 | 谁拼 |
|---|---|---|
| `prompts/common.md` | 说话的样子、不许出现的词、安全边界、课本与今天安排的三条硬规矩 | 四个模式 |
| `prompts/bank.md` | 题库怎么用（`bank_add` / `bank_list` / `bank_show` / `bank_update` / `handoff` / `bank_resume`） | guide / work / hrl |
| `skills/math.md` | 理科备注：怎么验、什么算解完 | 由 `read_note` 按需读 |
| `skills/arts.md` | 文科备注：怎么算站得住 | 由 `read_note` 按需读 |

导出（`src/index.ts`）：

| 符号 | 签名 | 用途 |
|---|---|---|
| `SHARED_PARTS` | `['common', 'bank'] as const` | 共享段的名字 |
| `sharedPrompt(part)` | `(part: SharedPart) => string` | 读 `prompts/<part>.md`（trim 后返回） |
| `composePrompt(parts, own)` | `(parts: readonly SharedPart[], own: string) => string` | 按顺序拼接，用 `'\n\n'` 连接，末尾补一个换行 |
| `availableNotes()` | `() => string[]` | 只认 `math` / `arts` |
| `readNote(note)` | `(note: string) => string` | 给四个包的 `read_note` 工具用；只接受 `/^[a-z]+$/` |

**为什么单独一个包**：每个模式都声明 `systemPrompt.section({ complete: true })` 整份替换系统提示，别的 section 全被吞。安全边界、说话方式、题库规则如果各写一份，改一句要改四处，必漏。

## 数据落在哪

**没有运行期数据，不写盘。** 全是包内 md 文件，路径从 `lib/index.js` 往上推：

- `PROMPTS_DIR = ../prompts/`
- `NOTES_DIR = ../skills/`

两个目录都跟着包走（不读 cwd、不读 `DSH_HOME`），所以 `files` 里必须带上它们，打包时也要一起 vendor。

`readNote` 找不到时回一句给人（模型）看的话，不抛栈：

- 名字不合法 → 「备注名只能是小写字母…」
- 没这个科目 → 「没有 X 这个科目的备注。可用的有：…」

## 和邻居的关系

- **被依赖**：guide / work / hrl / setup 都按包名 import（`composePrompt` / `readNote`），是它们的唯一本地依赖。
- **不依赖任何兄弟包**：本包不 import 别人，也不注册工具、不挂路由、不声明段落——调用方决定段落 id 与顺序。
- 它是「文字的唯一来源」，不是「行为的来源」：`read_note` 工具本身由四个模式各自注册，行为（只收小写字母、找不到怎么回）在这里。

## 测试与构建

```bash
corepack yarn workspace dsh-plugin-teaching-commons typecheck
corepack yarn workspace dsh-plugin-teaching-commons build
```

没有单测（纯读文件 + 字符串拼接）。`build` = `tsc -p tsconfig.json` + `tsdown`；`lib/` 是入库的构建产物，改完源码要一起提交。

## 已知限制

- 改 md **不用重建**，但读盘发生在挂载时（`readFileSync`），所以重启会话才生效。
- `availableNotes()` 认的是写死的 `math` / `arts`：`skills/` 里放第三份 md 也不会被 `read_note` 找到，要改代码。
- `package.json` 里的 `vitest` devDependency 已经用不上了（测试删掉后没清），删它会动 `yarn.lock`，所以留着。

## 不做什么

- 不注册工具、不挂 `/api` 路由、不声明 agent preset——那样会变成第五份重复。
- 不写任何运行期数据文件。
- 不替各模式决定提示段落顺序与 id（那是各包自己的常量）。
