# ensure-ILE 文档

这里是 ensure-ILE 的产品与开发文档入口。根目录的 [`README.md`](../README.md) 适合第一次了解项目；本目录解释项目为什么存在、如何使用、如何为 Desktop 编写插件，以及这个 fork 自己加了什么。

## 按目标阅读

普通用户从[用户指南](user-guide.md)开始即可，不需要阅读开发者文档。

### 用户文档

| 文档 | 你会得到什么 |
| --- | --- |
| [用户指南](user-guide.md) | 安装、profile、模式、终端、插件命令和更新 |
| [常见问题](faq.md) | 支持平台、内置环境、官方边界、数据、插件和更新的直接回答 |
| [为什么做 Desktop](why-desktop.md) | Desktop 与官方 Harness 的边界，以及为什么坚持插件化 |

### ensure-ILE 自己的部分

上游 DSH Desktop 的文档里没有这几块：四个模式、共享数据根，以及桌面壳之外的九个本地 `dsh-plugin-*` 包。每个包自己的 `README.md` 才是那个组件的说明书——这里只做索引，不复制内容。

**预设管组队，模式管姿态。** profile 由 [`profiles/ensure-ile/package.json`](../profiles/ensure-ile/package.json) 决定挂哪些 bundle，[`profiles/ensure-ile/cordis.patch.yml`](../profiles/ensure-ile/cordis.patch.yml) 把默认预设定成 `work`：

| 预设 id | 显示名 | 起步模式 | 何时能选 |
| --- | --- | --- | --- |
| `work`（默认） | 做题 | 引导模式 | 总是 |
| `chat` | 聊天 | 聊天 | 总是 |
| `setup` | 开学 | 开学 | 只在开学没问完时注册 |

两个学习预设挂的是同一组行：核 [dsh-plugin-coreset](../dsh-plugin-coreset/README.md) + guide / work / hrl 三个人格包 + `ile-time-context`，区别只在起步模式；会话里用 `context_switch` 在 `guide` / `work` / `hrl` / `chat` 之间换。人格包只登记一段文本，整个会话只有核的一条 `complete: true` 段，共用段（安全边界、说话方式、题库规则）只在 [dsh-plugin-teaching-commons](../dsh-plugin-teaching-commons/README.md) 里存一份。

**共享数据。** 开发时数据根是仓库根的 `.ensure-ile/`，安装版是 `%LOCALAPPDATA%\ensure-ILE-data\`（alpha3 起数据根搬出安装目录，安装 / 卸载碰不到它）；`DSH_HOME` 就是数据根里的 `home/`。

| 数据 | 位置 | 谁在读写 |
| --- | --- | --- |
| 题库 | `<DSH_HOME>/bank/problems/<id>.json` | [dsh-plugin-bankmanager](../dsh-plugin-bankmanager/README.md)：一道题一个文件，schema v2.1 按 `guide` / `work` / `hrl` 分块，带交接包与复习阶梯 |
| 学情 | `<DSH_HOME>/profile/*.md` | [dsh-plugin-memory](../dsh-plugin-memory/README.md)：`profile_read` / `profile_write`，固定文件名、不进检索 |
| 开学进度 | `<DSH_HOME>/setup.json` | [dsh-plugin-setup](../dsh-plugin-setup/README.md)：字段级、可中断续问 |
| 课表与进度 | `<DSH_HOME>/schedule/schedule.json` | [dsh-plugin-schedule](../dsh-plugin-schedule/README.md)：课表、进度、复习队列与预习锚点 |
| 教材语料 | `dsh-plugin-textbook/data/` | [dsh-plugin-textbook](../dsh-plugin-textbook/README.md)：必修 PDF 的抽取结果，运行时零依赖；PDF 本体留在工作区的 `教材/` |

### 研究

| 文档 | 你会得到什么 |
| --- | --- |
| [2026-10-25 开源 AI 学习伴侣调研](research/2026-10-25-开源AI学习伴侣调研.md) | 13 个开源项目的对照调研，带核实记录与自我修正；`⚠️ 仅描述` 标的是还没落地的部分 |
| [2026-10-29 单会话内修改 / 清空上下文](research/2026-10-29-单会话上下文重写.md) | 四条路径的可行性、代价与推荐，附机制笔记：历史怎么组装、谁能改、system prompt 为什么清不掉 |
| [2026-10-30 会话内上下文切换](research/2026-10-30-会话内上下文切换.md) | 一个对话内换掉模型看的历史与提示词：四个机制事实（system prompt 原地归一 / pre-step 安全窗口 / replace 四条校验 / 界面必须自建卡）、分级方案与代价 |

### 开发者与维护者文档

| 文档 | 你会得到什么 |
| --- | --- |
| [插件生态倡议书](plugin-ecosystem.md) | 开放、可组合、可持续的插件生态愿景与三条原则 |
| [插件开发](plugin-development.md) | 普通 DSH 插件、Desktop 服务、兼容模式和生命周期 |
| [Community Fabric Draft](../dsh-community-fabric/README.zh.md) | 从 Manifest/Capability 基础，到 Runtime/Presentation、service composition 和溯源诊断的社区互操作提案 |
| [Fabric 社区意见处置记录](../dsh-community-fabric/docs/research/community-issue-23-review.zh.md) | Issue #23 中哪些建议已采纳、拆成独立 RFC、延期或不进入可移植核心 |
| [Fabric 框架与插件需求调研](../dsh-community-fabric/docs/research/mature-plugin-frameworks.zh.md) | Koishi、Chrome、VS Code 的成熟模式，以及真实 DSH 插件的功能需求 |
| [VS Code 扩展模型调研](../dsh-community-fabric/docs/research/vscode-extension-model.zh.md) | VS Code 已实现的声明、Provider、UI、运行位置和生命周期模式，以及它们对 Fabric RFC 的具体约束 |
| [架构说明](architecture.md) | Electron、Host、Web carrier、profile 和打包之间的关系 |
| [上游同步指南](upstream-sync.md) | 四层身份（子模块 / npm 包 / 桌面壳 fork / profile）、29 个补丁清单、四类同步流程与失败信号表 |
| [Desktop service 参考](../dsh-plugin-desktop/docs/plugin-services.md) | `desktopProfiles`、`desktopPnpm` 的稳定 contract 和 TypeScript 示例 |
| [包级参考](../dsh-plugin-desktop/README.md) | 完整的构建、运行、发布和已知限制 |

## README 文件怎么分工

文档单语中文：产品入口只有根目录的 [`README.md`](../README.md)，本目录的每一篇都没有英文对照页。2026-11-01 起双语门禁与 `*.i18n.yaml` 记录一并撤掉（没有第二种读者，维护成本全落在「改了中文忘了重算哈希」上），别再新增 `*.en.md`——没有门禁会提醒它们和中文版对不上。

`dsh-plugin-desktop/README.md` 和 `dsh-plugin-desktop/README.zh.md` 是 npm 包随包发布的包级参考；它们比根 README 更技术化。`dsh-plugin-desktop/docs/` 是稳定 API 合同，不是营销页。`docs/design/` 是演算纸视觉层的设计稿、截图（`screenshots/`）与字体子集，`docs/evidence/` 是装机与升级的实测证据。`.agents/notes/implemented/` 是日期化的维护者决策记录，适合追溯取舍，不替代用户文档。

`deepseek-harness/` 是固定版本的官方上游子模块。它自己的 README 和 `docs/` 属于上游项目，不能当作 Desktop 文档，也不在本仓库的产品文档统计中。

## 状态约定

文档会明确区分已实现能力、平台限制和 roadmap。

壳里仍有三种呈现模式：兼容模式在独立 Desktop frame 下保留上游默认 Web 客户端；扩展窗口安装自己独立注册的 Desktop layout/sidebar surface，并在倒 L 中承载官方 occupant；增强模式保留独立 root registration 与紧凑内部 caption。Desktop frame 会按系统能力提供原生材质。ensure-ILE 自己的 profile 选的是**增强模式**（[`cordis.patch.yml`](../profiles/ensure-ile/cordis.patch.yml) 里 `desktop-shell` 的 `mode: advanced`）。

**不带插件市场。** `dshmarket` 既不在依赖里也不在 `yarn.lock` 里，`.yarn/patches/` 没有它的补丁，也没有任何 `market:*` 脚本；设置里的市场开关没有可挂载的 provider。装插件只走 `dsh plugin` 这类显式命令（它把参数转发给 profile 里的 pnpm）。

上游的 Beta / Next 变体包、社区市场（`dsh-community-market/`）与 `vendor/agents-anywhere/` 都已删除；打包只带 Node + pnpm 载荷，不含 Python 解释器和 Office 技能。还在 roadmap 上的是两件事：图片链路（拍照发题）与独立 Evaluator——它们没做，文档也不会把它们写成已交付。

`docs/research/` 放调研文档，文件名带日期；那类文档里的「⚠️ 仅描述」只表示设计方案，不代表当前版本已经提供。
