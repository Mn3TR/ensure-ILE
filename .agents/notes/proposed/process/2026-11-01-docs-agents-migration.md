# docs/ → .agents/ 迁移方案（清点 207 个文件）

日期 2026-11-01 · 只清点，**未移动/删除/修改任何现存文件** · 信源：全仓 grep + git ls-files + 逐个读门禁脚本

一句话结论：**没有一篇能零改动搬走（可迁 0）**；4 篇属「日期化记录形状」值得搬但要配套改造（需改造 4）；其余 18 篇文档 + 181 个资产文件不动（不可迁 18 篇 / 资产 181 个）。真正挡路的只有一条门禁：fabric 的文档门禁读 ../docs/ 下的两对文件。

## 判定标准（放之可用，别每次重推）

| 读者 | 去向 |
| --- | --- |
| 外部使用者 / 第一次贡献的人 | 留 docs/ |
| 未来改这块代码的 agent / 我 | 迁 .agents/notes/ |
| 两者都要，且内容必须跟代码同步（活流程、清单、API 合同） | 留 docs/（跟着代码走才不会过期） |
| 两者都要，但是「当时为什么这么定」且结论可能被推翻 | 迁 .agents/notes/implemented/，在 docs/ 留一句指针 |

补一条本仓库特有的判据：**日期化 + 结论会被后来者推翻 = .agents；活流程/清单/api = docs**。docs/research/2026-10-29-单会话上下文重写.md:3 那篇的结论被 2026-10-30-会话内上下文切换.md:4 直接推翻——这种「记录当时的错判」正是 .agents/notes 存在的理由，留在产品文档索引里反而会误导外部读者。

---

## 一、逐文件建议

### A. 不可迁（18 篇文档 + 2 份 i18n 记录）

| 文件 | 去向 | 理由 | 阻碍（谁引用它） | 代价 |
| --- | --- | --- | --- | --- |
| docs/README.md / docs/README.en.md | 留 | 产品文档入口 | README.en.md:94 链 docs/README.en.md；docs/README.md:5 反链根 README | 无 i18n 记录（不受双语门禁管） |
| docs/user-guide.md / .en.md | 留 | 装机/使用说明，外部读者 | 无代码引用；docs/README.md:9,15、why-desktop.md:47、plugin-ecosystem.md:45、faq.md:5,62 内链 | 无 |
| docs/faq.md / .en.md | 留 | 外部读者 | docs/README.md:16 | 无 i18n 记录 |
| docs/why-desktop.md / .en.md | 留 | 定位说明（为什么 fork），外部读者 | docs/README.md:18 | 无 i18n 记录 |
| docs/architecture.md / .en.md | 留 | 贡献者架构入口；随代码演进 | why-desktop.md:49、plugin-development.md:200、docs/README.md:63；dsh-plugin-desktop/tests/package.spec.ts:1037 把字符串 docs/architecture.md 当 CI 分类器 fixture（只做正则匹配，不要求文件存在，所以这条不是阻碍，但会让人误判） | 无 i18n 记录 |
| docs/plugin-development.md / .en.md / .i18n.yaml | **留（禁迁）** | 插件作者手册，外部贡献者第一站 | ① CONTRIBUTING.md:17、CONTRIBUTING.en.md:17；② dsh-community-fabric/README.zh.md:54、README.md:54 链 ../docs/plugin-development*.md，而 dsh-community-fabric/scripts/verify-docs.mjs:143-155 对每条本地链接做存在性检查，该检查由 dsh-community-fabric/package.json:32 的 check 触发，而 check 在根 yarn check 里（根 package.json:761） | 硬不可迁：动了 fabric 门禁红 |
| docs/plugin-ecosystem.md / .en.md | **留（禁迁）** | 生态愿景，外部贡献者 | 同上：CONTRIBUTING.md:18、CONTRIBUTING.en.md:18、dsh-community-fabric/README.zh.md:55、README.md:55（同一门禁） | 硬不可迁 |
| docs/upstream-sync.md / .en.md / .i18n.yaml | 留 | **活流程**（换 pin 的操作手册 + 29 补丁清单 + 失败信号表），不是日期化决策；内容必须跟 patches/、vendor/ 同步 | AGENTS.md:33,51,56,256 四处；scripts/verify-patch-references.mjs:9 注释写死 See docs/upstream-sync.md | 若强迁：改 5 处引用（其中 1 处在脚本注释里，容易被忘） |
| docs/design/brand/NOTES.md | 留 | docs/design/brand/ 里唯一的文档，描述就在旁边的稿与生成器 | 自身写死 cd docs/design/brand（NOTES.md:54,76）；AGENTS.md:140,173 引用 | 搬走会让两条动手指令变成假的 |
| docs/design/ensure-ile-specimen.html | 留/建议删 | 演算纸主题的视觉稿（title 写着 ensure-ILE · 演算纸 视觉稿），主题已于 2026-10-31 弃用（AGENTS.md:134） | 0 入链；自己引 ./fonts/LXGWWenKai-subset.woff2（:10） | 搬没意义，删是另一个决定 |

### B. 需改造（4 篇）：迁 .agents/notes/implemented/

三篇 research 都满足「日期化 + 结论会被推翻 + 读者是未来改这块代码的人」，且**没有 .en.md、没有 .i18n.yaml**——所以双语门禁现在根本没管它们，搬的时候不用配第 3 个文件。

| 文件 | 建议去向 | 为什么搬 | 阻碍 / 要改的地方 | 迁移代价 |
| --- | --- | --- | --- | --- |
| docs/research/2026-10-25-开源AI学习伴侣调研.md（542 行） | .agents/notes/implemented/research/2026-10-25-open-source-ai-study-companion-survey.md | 13 个项目的对照调研，读者是「下一个要判断该抄谁/该不该抄的 agent」；star 数、仓库状态必然过期 | 索引 docs/README.md:49、docs/README.en.md:49（两处都链同一个中文文件——docs/ 已经在容忍单语） | 1) 中文 slug → ASCII slug（现有 .agents 全是 ASCII slug）；2) 改 2 行索引；3) **不需要** yarn docs:record（无记录）；4) 内容不动则 git hash-object 不变 |
| docs/research/2026-10-29-单会话上下文重写.md（397 行） | .agents/notes/implemented/research/2026-10-29-single-session-context-rewrite.md | 结论被 10-30 那篇推翻（「不建议改历史」→「能做」），正是「记录当时错判」的样板 | 索引 docs/README.md:50、docs/README.en.md:50；**还有 docs/research/2026-10-30-会话内上下文切换.md:3 按路径引用它**——两篇一起搬，否则交叉引用断 | 1) 改 slug；2) 改 3 处引用；3) 无需 docs:record |
| docs/research/2026-10-30-会话内上下文切换.md（192 行） | .agents/notes/implemented/research/2026-10-30-in-session-context-switching.md | 四个机制事实（system prompt 原地归一 / pre-step 安全窗口 / surfaceOp replace 四条校验 / 界面必须自建卡）已经落进代码（dsh-plugin-coreset 与 AGENTS.md 的模式与交接一节），文档只剩证据价值；按「代码是第一信源」，它不该再当产品文档 | 索引 docs/README.md:51、docs/README.en.md:51；自身 :3 引上一版 | 1) 改 slug；2) 改 2 处索引 + 改 :3 的路径；3) 无需 docs:record |
| docs/evidence/windows-installer-upgrade-2026-08-25.md + docs/evidence/assets/*.png（2 张） | .agents/notes/implemented/process/2026-08-25-windows-installer-upgrade-evidence.md，assets/ 同目录一起走 | 验收存证：2.0.2 -> 2.0.3 运行中升级实测（:7），是历史，不是产品文档 | **0 入链**（docs/README.md:77、.en:77 只是文字提到 docs/evidence/ 这个目录名，不是链接）；文档内部 ./assets/…png（:14,18）随 assets 一起搬即可 | 1) 日期要挪到前面（现在 slug-2026-08-25.md，约定是 2026-08-25-slug.md）；2) git mv 3 个文件；3) 改 docs/README.md:77 + .en:77 那句目录名；4) 无需 docs:record |

**搬完 docs/ 只剩 16 篇产品文档 + design 资产。此时要顺手改三处索引**：docs/README.md:45-51 的「研究」整节、docs/README.md:91 那句「docs/research/ 放调研文档」、docs/README.en.md 同两处，改成一句指向 .agents/notes/ 的指针；另外 AGENTS.md:32 那张仓库地图里 docs/ 行的「research/ design/ screenshots/ evidence/」要跟着删/改。

### C. 资产（181 个文件，不迁）

docs/design/brand/ 175 个文件、docs/design/screenshots/ 6 张 png、docs/design/fonts/ 1 个 woff2。

**判据不是「有没有 .mjs」，而是「谁读它、读哪个字段」。** 实测三条：

1. **路径写死的脚本，移走即断**：build-icon.mjs:9-10 用 resolve(here,'..','..','..') 反推仓库根再从 dsh-plugin-desktop/package.json 解 sharp；render.mjs:7-13,187 把 docs/design/brand/.raw/raw、.raw/manifest.json、输出目录写成字面量四处；generate.py:11 同理写 .raw/。
2. **被记录但不被校验的引用**：dsh-plugin-desktop/build/app-icon.resources.json:12 记 "source": "docs/design/brand/mark/geometric-app.svg"、:22 记 build-icon.mjs 为 generatedBy——但 icons:check 走 checkIconResources（scripts/export-app-icons.mjs:32-39）**只校验 source / sourceSha256 / outputs 三个字段**，png.source 与 windows.generatedBy 它一眼不看（scripts/export-app-icons.test.mjs 也只用 source + outputs 构造 fixture）。所以搬走 mark/geometric-app.svg **不会红门，只会让记录变成假的**——这比红门更坏。
3. 发版副本已经在仓库里另一处：profiles/ensure-ile/brand/{mark,wordmark}.svg，由 seedBrandAssets() 每次启动种进数据根（AGENTS.md:138）。docs/design/brand/ 是源稿不是运行时资产。

另：docs/design/screenshots/*.png（shot-light / shot-dark / gallery-light / gallery-dark / wizard-light / font-fallback，3.5 M）**0 入链**，且是 2026-10-31 弃用的演算纸主题截图；docs/design/fonts/LXGWWenKai-subset.woff2（1.6 M）只服务 ensure-ile-specimen.html:10，live 副本在 dsh-plugin-desktop/src/native-ui/assets/fonts/（theme.css:26,31）。这三个是**删除候选**，不是迁移候选——但删是另一个决定，本方案不动。

---

## 二、必须核实的四件事：核实结果

### 1) 引用图（全仓 grep，剔除 deepseek-harness/ 与 vendor/）

| 引用者 | 指向 | 性质 |
| --- | --- | --- |
| dsh-community-fabric/scripts/verify-docs.mjs:143-155 | ../docs/plugin-development{,.en}.md、../docs/plugin-ecosystem{,.en}.md | **门禁**（链接存在性）→ 在根 yarn check 里 |
| CONTRIBUTING.md:17,18 / CONTRIBUTING.en.md:17,18 | 同上四篇 | 文档链接（无自动检查） |
| README.en.md:94 | docs/README.en.md | 文档链接 |
| AGENTS.md:33,51,56,256 | docs/upstream-sync.md | 文档链接 |
| scripts/verify-patch-references.mjs:9 | docs/upstream-sync.md | **脚本注释** |
| AGENTS.md:138,140,141,173 | docs/design/brand/** | 文档链接 |
| dsh-plugin-desktop/build/app-icon.resources.json:12,22 | docs/design/brand/mark/geometric-app.svg、build-icon.mjs | 记录字段，**门禁不校验** |
| docs/README.md(.en):49-51 | research/* 三篇 | 文档索引 |
| docs/README.md:60-62 / .en:60-62 | dsh-community-fabric/docs/research/*（另一棵树） | 文档链接，与本仓 docs/research/ **无关**（同名不同目录，容易看错） |
| docs/README.md(.en):77 | docs/design/、docs/evidence/ | 文字提及目录名，非链接 |
| scripts/classify-ci-changes.mjs:9 | docs/ 与 .agents/notes/ **同属 documentationPath** | dsh-plugin-desktop/tests/package.spec.ts:1036-1042 用 docs/architecture.md + .agents/notes/implemented/.../decision.md 两个字面量断言「两者都算纯文档」→ **跨树搬迁不改变 CI 的 product/documents 分流** |

没有任何一条 package.json / tests/ / .github/workflows/ 引用指向 docs/ 下除上述之外的文件。CI 里跟文档有关的只有 ci.yml:51-52（bilingual 门），它按 *.i18n.yaml 枚举，不看路径。

### 2) 双语门禁怎么跑、搬的时候怎么配合

- 枚举：scripts/bilingual-docs.mjs:87 是 git ls-files -z -- *.i18n.yaml；scripts/record-bilingual-docs.mjs:19 同一句没带 --（等价）。
- 记录形状（bilingual-docs.mjs:20-46）：**必须恰好 2 条**，且每条的 key **只能是同目录下的纯文件名**（:31-33 拒绝对路径/绝对路径/非 .md）；文件按 resolve(recordDirectory, filename) 解析（:62）。→ 一条记录绑死「记录文件所在目录」+「两个 md 文件名」，所以 X.md / X.en.md / X.i18n.yaml **必须整组同目录搬**，拆开就红。
- git hash-object 是**内容哈希**（bilingual-docs.mjs:95-100；record-bilingual-docs.mjs:17）：纯 git mv 不改内容 → 记录里的 hash 依然匹配，**不需要重记**；一旦改内容或对调文件名，就必须 yarn docs:record。
- 现有记录 45 条（git ls-files '*.i18n.yaml' 实测），docs/ 下只有 plugin-development.i18n.yaml 与 upstream-sync.i18n.yaml 两条。**其余 14 篇 docs/*.md 都没有 i18n 记录**——即 docs/ 的双语是「命名约定」不是「门禁」。
- 搬完的验证顺序：corepack yarn check:bilingual-docs（= test:bilingual-docs + node scripts/verify-bilingual-docs.mjs，见 package.json:756-757）→ 若提示 stale 再 corepack yarn docs:record（package.json:758）→ 再跑一次门。
- **坑**（AGENTS.md 上游与文档 6）：ls-files 只列已跟踪文件，新目录里的 i18n 若没 git add 就对门禁不可见、绿着放行。所以迁移必须 git mv（自带 stage）或 mv + git add，不能只动工作树。

### 3) docs/design/brand 的可执行资产

- scripts/export-app-icons.mjs **不读** docs/design/brand/ 任何文件：它只读 dsh-plugin-desktop/build/app-icon.resources.json（:33）与 build/app-icon.icon/、四个输出文件；ICON_PACKAGES 只含 dsh-plugin-desktop（:10-12）。所以 icons:check / yarn check:layout 不因搬 brand 而红。
- docs/design/brand/build-icon.mjs 自身被 app-icon.resources.json:22 记录、被 AGENTS.md:141-142 写进「换图标动作」；它按自身位置反推仓库根（:9-10），**移出 docs/design/brand/ 就解析不到 sharp**。
- 结论：docs/design/brand/ = **品牌资产 + 生成器**，不是文档。唯一文档是 NOTES.md，而它描述的就是这个目录。

### 4) .agents/notes 现有命名与结构（实测，不是推测）

- 共 34 个 stem / 64 个 .md，分布在 implemented/{architecture,process}/ 与 proposed/architecture/（**没有文件直接躺在 proposed/ 或 implemented/ 根下，一律按主题分子目录**）。
- 命名 <YYYY-MM-DD>-<ascii-kebab-slug>.md；日期在最前。
- 语言方向 **与 docs/ 相反**：.md = **英文正文**，.zh.md = 中文正文。证据：proposed/architecture/2026-08-19-desktop-system-architecture-atlas.md:5 是 English | [中文](….zh.md)，正文全英文。docs/ 则是 X.md 中文 + X.en.md 英文。
- 配对严格度有三档（都合法）：
  - 30 个 stem：.md + .zh.md + .i18n.yaml（受门禁）
  - 2 个 stem：.md + .zh.md，无记录（2026-09-10-beta-isolated-host、2026-09-20-system-proxy-inheritance）
  - 4 个 stem：**只有 .md（单语）**，无 .zh.md 无记录（2026-09-07-runtime-renderer-recovery、2026-09-08-runtime-renderer-surface-watchdog、2026-09-17-forced-renderer-replacement-reload、2026-09-17-windows-content-repaint-without-disabled-throttling）→ **单语笔记有先例**，方案 B 的 4 篇可以原样搬（只是内容为中文，与「md=英文」的读法相反，需在笔记里点明）。
- 正文有固定件（见 atlas）：Status: 行（:3）、语言切换行（:5）、**给 AI 读者的警示块**（:7-13，写明「这是某一版本某一时刻的快照，不要当现状，以代码为准」）。迁进来的三篇 research 建议补这个警示块——它们的机制笔记部分最容易过期。

---

## 三、执行清单（按顺序，本方案不执行）

1. git mv 三篇 research 到 .agents/notes/implemented/research/ 并改 ASCII slug；同步改 docs/README.md:49-51、docs/README.en.md:49-51，以及 2026-10-30-… 里指向 2026-10-29-… 的路径（原 :3）。
2. git mv docs/evidence/windows-installer-upgrade-2026-08-25.md → .agents/notes/implemented/process/2026-08-25-windows-installer-upgrade-evidence.md，docs/evidence/assets/ 一并搬到同级 assets/（保持 ./assets/ 相对链接成立）。
3. 给三篇 research 补 Status: / 语言行 / AI 警示块（照 atlas 的格式），并在笔记里注明「中文单语，未配 .zh.md」。
4. 改索引：docs/README.md:45-51「研究」节改成一句指向 .agents/notes/implemented/research/ 的指针；:91 那句 docs/research/… 说明删除或改写；docs/README.en.md 同位置同理；AGENTS.md:32 仓库地图 docs/ 行的子目录列表去掉 research/ 与 evidence/。
5. 跑门：corepack yarn check:bilingual-docs（这次搬的 4 篇都没有 i18n 记录，预期直接绿；docs/plugin-development.i18n.yaml、docs/upstream-sync.i18n.yaml 没动，hash 不受影响）→ 用搬迁路径喂 scripts/classify-ci-changes.mjs 确认仍判 false（纯文档）→ corepack yarn check:layout。
6. 不跑 docs:record：本次没有 i18n 记录的内容或文件名发生变化。如果第 3 步顺手改了被记录的文档（不该发生），才需要它。

## 四、两个需要李拍板的取舍

1. **单语中文笔记进 .agents 行不行？** 现状是 .md=英文（单语笔记也是英文）。迁进来的三篇是中文单语。三个选项：(a) 中文单语 + 在笔记里注明（便宜，推荐）；(b) 译成英文再配 .zh.md + .i18n.yaml（贵约 1100 行翻译，还要跑 docs:record）；(c) 不搬。
2. **docs/design/screenshots/ + fonts/ + ensure-ile-specimen.html 删不删？** 6 张 3.5 M 的截图 + 1.6 M 字体 + 303 行视觉稿，全部属于 2026-10-31 弃用的演算纸主题，0 入链。不删就是继续躺在 docs/ 里让人以为还是当前视觉层；删要单独确认（本方案不动）。

## 附：14 个 .tmp-* 残留与 docs 无关

根目录 .tmp-check.log / .tmp-cli.log / .tmp-closure{,-sizes}.json / .tmp-dead.json / .tmp-impedges.json / .tmp-mounted.json / .tmp-msg-mem.txt / .tmp-notreach.json / .tmp-packaged-sizes.json / .tmp-plugins.log / .tmp-rev.json / .tmp-ws{,2}.mjs + 目录 .tmp-diag/（2026-10-30～11-01 的打包体积、依赖闭包、日志分析残留），已被 .gitignore:27 的 .tmp-* 忽略。**没有任何一个引用 docs/ 下的路径**，与本次迁移无关。
