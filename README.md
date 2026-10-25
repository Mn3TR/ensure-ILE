# ensure-ILE — DeepSeek Harness Desktop in Learning

> 带着一个学生，把他手里那道题**自己解出来**。
> 不是把答案讲给他听。

从 [DSH Desktop](https://github.com/anywhere-labs/dsh-desktop) fork 出来的学习版本。底座不动：`deepseek-harness/` 是固定的上游子模块，**不修改**；窗口、插件机制、打包链路沿用上游。我们加的东西全在仓库自己的 `dsh-plugin-*` 包里，壳不知道它们存在。

**EnSure Lab / 因需**——因=原因，需=需要。每一步都要说得清为什么。

---

## 它是什么

一个模式，就是一个 agent 预设。学生发一道题进来，模型不批改、不打分、不给答案，只给**注意力**：

- 「这个式子里有个东西在重复自己」
- 「你注意到这几项长得像吗」
- 「作者为什么把这段放在这儿」

学生决定做什么。可能做的和模型想的不一样，但那是他自己的。

四个模式，各自一个包 + 一个预设：

| 预设 | 包 | 干什么 |
| --- | --- | --- |
| **引导模式** `guide`（默认） | [dsh-plugin-guide](dsh-plugin-guide/) | 学生还没做出来，引他自己做出来；不批改、不打分 |
| **开学** `setup` | [dsh-plugin-setup](dsh-plugin-setup/) | 第一次见面：问年级、课表、作息、解题偏好，能说出下一步就算完 |
| **独立做题** `work` | [dsh-plugin-work](dsh-plugin-work/) | 学生自己做、交上来判；重交只给一次，判不过转引导 |
| **答案优化** `hrl` | [dsh-plugin-hrl](dsh-plugin-hrl/) | 他已有答案，教师轨迹 + 逐小步 A/B，自己决定留哪边 |

共用文字（安全边界、说话方式、题库规则、学科备注）只有一份，在 [dsh-plugin-teaching-commons](dsh-plugin-teaching-commons/)。

## 数据都在一个根里

开发时是仓库下的 `.ensure-ile/`，安装版是 `<安装目录>\.ensure-ile\`：

- `home/bank/problems/<id>.json` —— 题库，一道题一个文件，schema v2.1 按 `guide / work / hrl` 分块，带交接包与复习阶梯
- `home/storages/` —— 记忆与学生档案
- `deepseek-harness/default-workspace/` —— 会话工作区（教材、教辅也在这）
- `home/profiles/desktop/` —— profile 定义与离线装好的插件

覆盖安装保留数据；手动卸载删数据。

## 自己跑起来

需要 Node `^22.19.0` 或 `>=24`，Yarn 4.18 通过 Corepack。

```bash
corepack yarn install --immutable
corepack yarn build                 # 构建桌面壳，并把 profile 模板镜像进包
corepack yarn workspace dsh-plugin-desktop start   # 开发运行
corepack yarn dist:win              # 打 Windows 安装包
```

单测与类型检查：

```bash
corepack yarn test
corepack yarn typecheck
```

CI 只跑 Windows 平台：`changes`（文档闸门 + 改动分类）、`check`（全量单测）、`desktop-windows`（打包检查 + 安装包 + portable）、`upstream-command-windows`。bilingual 文档哈希过期不用手改，`yarn docs:record` 会重算。

## 到哪一步了（2026-10-25）

- ✅ 引导模式真机跑过一道题：提示词拼接、题库落盘、回复长度与禁词都对
- ✅ 四个预设、题库 schema v2.1、记忆 `profile_*`、复习阶梯、画像字段都已实现
- ✅ Windows 安装包可打、可装；首启离线装出七个插件包；覆盖安装保数据
- 🔄 独立做题 / 答案优化 / 开学三个模式还没真机跑过
- ⬜ 交接卡片、接续 UI、独立 Evaluator、图片链路

细节与「为什么这么做」全部写在 [AGENTS.md](AGENTS.md)——**以代码为第一信源**，文档只是索引。

## 明确不做

账号与多租户、4–24 周学习路径、能力课程工作台、A/B 投票打分界面、模型自己切模式、一次会话内换提示词。理由都在 [AGENTS.md](AGENTS.md#明确不做2026-10-25-定)。

## 文档

- [AGENTS.md](AGENTS.md) —— 工程约定、状态、坑（第一信源）
- [docs/README.md](docs/README.md) —— 产品与开发文档索引
- 各插件的 `README.md` —— 那个模式自己的说明

## 边界与许可

独立社区项目，与深度求索、DSH Desktop 上游不存在隶属、合作、授权或背书关系。上游贡献者显示来自 fork 继承的历史提交。MIT，见 [LICENSE](LICENSE)。
