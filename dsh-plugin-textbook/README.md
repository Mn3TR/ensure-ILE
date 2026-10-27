# dsh-plugin-textbook

ensure-ILE 的**教材锚定**插件：给模型三只只读的手，让它去读高一教材的原文，而不是编。

为什么需要它：guide 的提示词是 `complete: true`，会吞掉任何其他提示段，规矩只能写在工具描述里（bank 已经这么干了）。而一个查不到原文的模型，会把「正弦定理」说得像它读过——所以这里把「查」做成工具。

## 三只工具

| 工具 | 干什么 | 什么时候用 |
|---|---|---|
| `textbook_books` | 列出 7 本书：id、书名、科目、页数、有没有文字层、节数 | 读教材之前先看一眼有哪些书，别猜 id |
| `textbook_find` | 在目录里找节，给 bookId + PDF 页码范围 + 课本页码 | 学生说「老师讲到哪」、你要定位某一节 |
| `textbook_read` | 读正文，带 `[p12]` 页码标记；一次约 6000 字，末尾告诉你下一页从哪接着读 | 引原文、对齐进度、回答「书上怎么写的」 |

三只都是只读的，全都不写盘。错误一律吞成一句给模型看的话（`textbook error: …`），不抛栈。

## 语料从哪来

教材 PDF 在数据根（`<数据根>/deepseek-harness/default-workspace/教材/`），**运行时不可用、也不该可用**：打包已经删掉 Python 载荷，而且 7 本书里有一本是纯扫描件。所以「读 PDF」固定在开发机上做一次，产物（`data/index.json` + `data/books/<id>.json`，共 1.8MB）入库，运行时零依赖。

重生成（只在开发机、需要 PyMuPDF）：

```bash
python scripts/extract.py                # 默认读数据根里的 教材/
python scripts/extract.py --source <教材目录> --out data
```

环境变量 `ENSURE_ILE_TEXTBOOK_DIR` 可以代替 `--source`。生成完把整个 `data/` 一起提交。

## 运行时怎么找语料

顺序（`src/index.ts` 的 `resolveDataDirectory`）：

1. `cordis.patch.yml` 里那一行的 `dataDirectory` 配置（可用 `Config` 覆盖）；
2. 环境变量 `DSH_TEXTBOOK_DATA`；
3. 包内 `data/`——由 `fileURLToPath(new URL('../data/', import.meta.url))` 从 `lib/data.js` 往上推。

**不用 `process.cwd()`**：桌面壳从快捷方式所在目录启动，拿 cwd 当基准的语料等于会消失的语料。

## 语料格式

```jsonc
// data/index.json
{ "generatedAt": "…", "source": "…", "books": [
  { "id", "title", "subject", "publisher", "pages", "textbookOffset", "textAvailable", "sectionCount" } ] }

// data/books/<id>.json
{ id, title, subject, publisher, pages, textbookOffset, textAvailable,
  sections: [{ level: 1|2, title, pdfPage, endPage }],
  pagesText: (string|null)[] }
```

- `sections[].pdfPage` 是 **1 基 PDF 页**；`endPage` 是开区间上界（下一节起始页，最后一节是 pages+1）。
- `pagesText` 是 **0 基**：`pagesText[i]` 是 PDF 第 `i+1` 页；`null` = 该页没有文字层。
- `textbookOffset`：课本页 = PDF 页 - offset（人教A数学必修一/二为 7，化学 5，物理 9/4/4）。

## `dsh-plugin-textbook/data`

第二个入口（tsdown 的 `data` entry），纯逻辑、不碰 cordis，给 schedule 这类只需要读语料的地方用：

```ts
import { createBookStore } from 'dsh-plugin-textbook/data'
const store = createBookStore({ dataDirectory: '/path/to/data' })
store.listBooks()
store.readBook('renjiaoA-math-2')
store.findSections('6.1', { book: 'math-2', limit: 5 })
store.nextSection('renjiaoA-math-2', '6.1 平面向量的概念')
store.readPages('renjiaoA-math-2', 8, 9)   // { text, firstPage, lastPage, nextPage?, hasText }
```

caching 是按册的：读一本书 parse 一次，判卷时反复读同一册不会反复解析。

## 已知限制

- **人教A数学必修一是纯扫描件**（`textAvailable: false`，270 页里只有 2 页有字）。`textbook_read` 对它返回一句「这一册只有目录和页码…把页码告诉学生，让他翻书」，不报错、不编正文。
- **封面页 / 图表页的文本是噪声**（化学必修一第 1 页是元素周期表的字符流）。插件不做质量判断，原样给——它是把手，不是编辑。
- **只查目录，不全文检索**：`textbook_find` 匹配的是节标题（节号、节名片段、关键词），不扫正文。所以「正弦定理」找不到节，得先想它属于哪一节（6.4 平面向量的应用）。
- 一页独占就超过 6000 字时整页照给（宁可超一点，也不返回空），此时`nextPage` 指向下一页而不是页中间。
- 页码越界一律夹到 `[1, pages]`；给 `to < from` 时只读 `to` 这一页。
- **人教A数学的斜体字母被抽成生僻字**（`犃`=A、`犪`=a、`狓`=x，落在 U+7280–U+72FF，同一区间还混着「状」「独」「猜」这样的真汉字，映射不规整）。`italicLetterNote()` 在一页命中 ≥3 次时附一句读法提示，**不改写正文**——改错一次比提示一句代价大。

## 测试与构建

```bash
corepack yarn workspace dsh-plugin-textbook typecheck   # tsc --noEmit，含 tests
corepack yarn workspace dsh-plugin-textbook test        # 37 个用例
corepack yarn workspace dsh-plugin-textbook build       # tsc 出 lib/types + tsdown 出 lib/*.js
```

根 `node_modules` 没有 `.bin`（Yarn 4 + `nmHoistingLimits: workspaces`），不要用 `../node_modules/.bin/vitest`。`lib/types` 是给兄弟包（`dsh-plugin-schedule`）按包名 import 用的声明，别删。

`tests/fixtures/` 是自造的两本书：一本 12 页 5 节（含一页 `null`），一本 6 页 2 节的扫描件。真实语料那条用 `describe.skipIf`，语料不在就静默跳过。

## 不做什么

- 不写盘：教材是只读的事实来源，改它就是改历史。
- 不做 OCR：扫描件就让模型把页码给学生，翻书这件事本来就该学生做。
- 不做语义检索 / 向量库：节号加节名已经够定位，多一层召回就多一层编。
