# ensure-ILE — DeepSeek Harness Desktop in Learning

> 一个学生，一道题。让他自己解出来。
> 不给答案。

fork 自 [DSH Desktop](https://github.com/anywhere-labs/dsh-desktop)。底座不动：`deepseek-harness/` 是固定子模块，不改；窗口、插件机制、打包链路沿用上游。我们加的东西全在 `dsh-plugin-*` 包，挂在 profile 根，壳不知道它们存在。

**EnSure Lab / 因需** —— 因=原因，需=需要。每步说得清为什么。

---

## 干什么

学生发题。模型不批改、不打分、不给答案。只给注意力：

- 「这个式子里有东西在重复自己」
- 「这几项长得像，看见没」
- 「作者为什么把这段放这儿」

学生决定下一步。可能和模型想的不同——那是他自己的。

## 三个预设，五个模式

预设管组队，模式管姿态。换预设 = 开新会话；换模式 = 会话内换人格，工具集不变。

| 预设 | 挂什么 | 干什么 |
| --- | --- | --- |
| **做题** `work` | 核 + guide/work/hrl 人格 + 题库 / 教材 / 课表 / 记忆 | 起步引导模式。他做得动就切 `work`，有答案要打磨就切 `hrl` |
| **聊天** `chat` | 核 + chat 人格 | 随口问，不碰题 |
| **开学** `setup` | 核 + setup 人格 + `setup_*` 工具 | 第一次见面：年级、课表、作息、偏好。办完就不再注册 |

模式：`guide` 引他自己做出来、`work` 独立做+判卷、`hrl` 教师轨迹逐小步 A/B、`chat` 聊天、`setup` 开学（不可切）。

共用文字（安全边界 / 说话方式 / 题库规则 / 学科备注）只一份：[dsh-plugin-teaching-commons](dsh-plugin-teaching-commons/)。会话的核：[dsh-plugin-coreset](dsh-plugin-coreset/)。

## 数据一个根

开发时 `.ensure-ile/`，安装版 `<安装目录>\.ensure-ile\`：

- `home/bank/problems/<id>.json` —— 题库，一题一文件，schema v2.1 按 `guide / work / hrl` 分块，带交接包与复习阶梯
- `home/storages/` —— 记忆与学生档案
- `deepseek-harness/default-workspace/` —— 会话工作区，教材也在这
- `home/profiles/desktop/` —— profile 定义 + 离线装好的插件

覆盖安装保数据；手动卸载全删。

## 自己跑

Node `^22.19.0` 或 `>=24`，Yarn 4.18 走 Corepack。

```bash
corepack yarn install --immutable
corepack yarn build                                # 建壳 + 把 profile 模板镜像进包
corepack yarn workspace dsh-plugin-desktop start   # 开发运行
corepack yarn dist:win                             # 打 Windows 安装包
```

门：

```bash
corepack yarn test                                  # 单测
corepack yarn typecheck                             # 类型
corepack yarn check                                 # 全量门（不含插件包单测）
corepack yarn check:plugins                         # 九个插件包
corepack yarn workspace dsh-plugin-desktop test:ui   # 端到端 UI，18 例，约 2 min
```

bilingual 哈希过期不用手改：`yarn docs:record` 重算。

## CI

只 Windows，其他平台不考虑。

- `.github/workflows/ci.yml` —— `changes`（文档闸门 + 改动分类）、`check`（全量门）、`desktop-windows`（打包检查 + 安装包 + portable）、`upstream-command-windows`
- `.github/workflows/release-windows.yml` —— 推 `v*` tag：先校验 tag 与 `package.json` 版本一致，跑打包检查，出 `Setup.exe` + `.sha256`，建 Release（版本带 `-` 自动标 prerelease）；手动触发只出 artifact

## 到哪一步（2026-10-31，`0.1.0-alpha1`）

- ✅ 引导模式真机跑过一道题：提示词拼接、题库落盘、回复长度与禁词都对
- ✅ 三预设 + 会话内换人格、题库 schema v2.1、记忆 `profile_*`、复习阶梯、画像字段
- ✅ Windows 安装包可打可装；18 例端到端 UI 测试全绿；皮肤换成 claude-style + en∫ure 品牌
- 🔄 `work` / `hrl` / `setup` 没真机跑过
- ⬜ 压缩引擎（长会话撞窗口会硬失败）、权限审批交互、native 四窗换 token 后没逐屏核、交接卡片、图片链路、独立 Evaluator

细节与「为什么」在 [AGENTS.md](AGENTS.md)——**代码是第一信源**，文档只是索引。

## 不做

账号 / 多租户、4–24 周学习路径、能力课程工作台、A/B 投票打分界面、模型自己切模式、会话内换提示词、按模式裁工具集。理由在 [AGENTS.md](AGENTS.md#明确不做)。

## 文档

- [AGENTS.md](AGENTS.md) —— 工程约定、状态、坑（第一信源）
- [docs/README.md](docs/README.md) —— 产品与开发文档索引
- 各插件包的 `README.md` —— 那个包自己的说明

## 边界与许可

独立社区项目，与深度求索、DSH Desktop 上游无隶属、合作、授权或背书关系。上游贡献者显示来自 fork 继承的历史提交。MIT，见 [LICENSE](LICENSE)。
