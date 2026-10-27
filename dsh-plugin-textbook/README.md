# dsh-plugin-textbook

教材读端：7 本必修的 PDF 在开发机抽成 JSON 入库，运行时零依赖，给模型三只只读的手（`textbook_books` / `textbook_find` / `textbook_read`），另有一个纯逻辑入口 `dsh-plugin-textbook/data` 给兄弟包用。

为什么要它：guide 的提示词 `complete: true`，规矩只能写在工具描述里；而一个查不到原文的模型会把「正弦定理」说得像它读过——所以把「查」做成工具。

## 什么时候用

`cordis.patch.yml` 往 profile 根插一行，所以任何会话都能用。三只工具都是只读的，**全都不写盘**。

| 工具 | 用途 | 关键参数 |
|---|---|---|
| `textbook_books` | 列 7 本：id、书名、科目、页数、有没有文字层、节数 | 无参数 |
| `textbook_find` | 在目录里找节，给 bookId + PDF 页码范围 + 课本页码 | `query`（必填：节号/节名片段/关键词；多词按空格、逗号、顿号、分号切开后**每个词都要命中**）、`book`（限定一册，可省略）、`limit`（默认 20） |
| `textbook_read` | 读正文，带 `[p12]` 页码标记；一次约 6000 字，末尾给下一页 | `book`（必填）、`from`（必填，1 基 PDF 页）、`to`（含，可省略）、`section`（给节名；唯一命中才读） |

错误一律吞成一句给模型看的话（`textbook error: …`），不抛栈。

语料目录的解析顺序（`src/index.ts` 的 `resolveDataDirectory`）：

1. `Config.dataDirectory`（`cordis.patch.yml` 里那一行可配）；
2. 环境变量 `DSH_TEXTBOOK_DATA`；
3. 包内 `data/`——`fileURLToPath(new URL('../data/', import.meta.url))`，从 `lib/data.js` 往上推。

**不用 `process.cwd()`**：桌面壳从快捷方式所在目录启动，拿 cwd 当基准等于让语料随时消失。

## 数据落在哪

包内 `data/`，共 1.8MB，入库：

```jsonc
// data/index.json
{ "generatedAt": "2026-10-28T00:10:03+08:00", "source": "…", "books": [
  { "id", "title", "subject", "publisher", "pages", "textbookOffset", "textAvailable", "sectionCount" } ] }

// data/books/<id>.json
{ id, title, subject, publisher, pages, textbookOffset, textAvailable,
  sections: [{ level: 1|2, title, pdfPage, endPage }],
  pagesText: (string|null)[] }
```

7 本（`data/books/`）：`renjiaoA-math-1`（270 页 / 39 节 / **无文字层**）、`renjiaoA-math-2`（282 / 34）、`renjiao-chem-1`（139 / 23）、`renjiao-chem-2`（139 / 20）、`jiaoke-phys-1`（143 / 27）、`jiaoke-phys-2`（126 / 28）、`jiaoke-phys-3`（168 / 30）。

- `sections[].pdfPage` 是 **1 基 PDF 页**；`endPage` 是开区间上界（下一节起始页，最后一节是 `pages + 1`）。
- `pagesText` 是 **0 基**：`pagesText[i]` 是 PDF 第 `i+1` 页；`null` = 该页没有文字层。
- `textbookOffset`：课本页 = PDF 页 − offset（人教A数学两册 7，化学两册 5，物理 9 / 4 / 4）。
- 正文软上限 `DEFAULT_MAX_CHARS = 6000`；`textbook_find` 默认 `DEFAULT_FIND_LIMIT = 20`。
- 语料由 `scripts/extract.py`（PyMuPDF，开发机跑）生成：`python scripts/extract.py [--source <教材目录>] [--out data]`，环境变量 `ENSURE_ILE_TEXTBOOK_DIR` 可代替 `--source`。运行时**不需要** Python。

`dsh-plugin-textbook/data`（tsdown 的第二个 entry，纯逻辑、不碰 cordis）：

```ts
import { createBookStore } from 'dsh-plugin-textbook/data'
const store = createBookStore({ dataDirectory: '/path/to/data' })
store.listBooks(); store.readBook('renjiaoA-math-2')
store.findSections('6.1', { book: 'renjiaoA-math-2', limit: 5 })
store.nextSection('renjiaoA-math-2', '6.1 平面向量的概念')
store.readPages('renjiaoA-math-2', 8, 9)   // { text, firstPage, lastPage, nextPage?, hasText }
```

按册缓存：读一本书 parse 一次。

## 和邻居的关系

- `dsh-plugin-schedule`：`import { createBookStore } from 'dsh-plugin-textbook/data'`（子路径，不深引 `src/` / `lib/` 文件），只用 `book` / `startSection` / `nextSection` 三个薄方法，惰性构造、异常退 `undefined`。
- `dsh-plugin-teaching-commons` 的 `prompts/common.md` 里定规矩：出现页码、章节、「课本上说」先 `textbook_find` 再 `textbook_read`，不许凭记忆复述。
- **不依赖任何兄弟包**；`scripts/extract.py` 只在开发期用，不进运行时。

## 测试与构建

```bash
corepack yarn workspace dsh-plugin-textbook typecheck    # 含 tests
corepack yarn workspace dsh-plugin-textbook test         # 37 个用例：data 23 / tools 11 / real-corpus 3
corepack yarn workspace dsh-plugin-textbook build        # tsc -p tsconfig.build.json（只出 lib/types）+ tsdown
```

- `tsconfig.build.json` 是**只为出 d.ts** 的额外配置（`lib/types` 给兄弟包按包名 import 用，别删）；`tsconfig.json` 仍是默认的那份。
- `tests/fixtures/` 是自造的两本书：一本 12 页 5 节（含一页 `null`），一本 6 页 2 节的扫描件。真实语料那条用 `describe.skipIf`，语料不在就静默跳过。
- `lib/` 与 `data/` 都入库，改完源码要把重建结果一起提交。

## 已知限制

- **人教A数学必修一是纯扫描件**（`textAvailable: false`，270 页只有 2 页有字）：`textbook_read` 回一句「这一册只有目录和页码…把页码告诉学生，让他翻书」，不报错、不编正文。
- **只查目录，不全文检索**：`textbook_find` 匹配节标题，不扫正文。「正弦定理」找不到节，得先想它属于哪一节（6.4 平面向量的应用）。
- `section` 必须**唯一命中**才读；命中多节会把候选列出来让你写全一点。
- `from` 在参数表里是必填（宿主先校验）：只给 `section` 时 `from` 被忽略，但仍得传一个值。
- 一页独占超过 6000 字时整页照给（宁可超一点也不返回空），此时 `nextPage` 指向下一页而不是页中间；页码越界一律夹到 `[1, pages]`，`to < from` 时只读 `to` 那一页。
- **封面页 / 图表页的文本是噪声**（化学必修一第 1 页是元素周期表的字符流）：插件不做质量判断，原样给。
- **人教A数学的斜体字母被抽成生僻字**（`犃`=A、`犪`=a、`狓`=x，落在 U+7280–U+72FF，同区间还混着「状」「独」「猜」这样的真汉字，映射不规整）：`italicLetterNote()` 一页命中 ≥3 次才附一句读法提示，**不改写正文**。

## 不做什么

- 不写盘：教材是只读的事实来源。
- 不做 OCR：扫描件就让模型把页码给学生，翻书这件事本来就该学生做。
- 不做语义检索 / 向量库：节号加节名够定位，多一层召回就多一层编。
- 不在运行时读 PDF、不依赖 Python。
