# ensure-ILE

基于[Deepseek Harness Desktop](https://github.com/anywhere-labs/dsh-desktop)的学习辅助软件  
  
![软件图标](./assets/LOGO.png)

学生发题，模型只引导：

- 「这个式子里有东西在重复自己」
- 「这几项长得像，看见没」
- 「作者为什么把这段放这儿」

学生决定下一步

## 下载与安装

请前往[Releases](https://github.com/Mn3TR/ensure-ILE/releases) 下载

## 软件介绍

本软件是基于[Deepseek Harness Desktop](https://github.com/anywhere-labs/dsh-desktop)的学习辅助软件，并结合提示词工程与附加插件，提高学生效率，卸去学生对自身进行规划的心智负担

- **独创模式**：独创的[guide](dsh-plugin-guide)与[HRL](dsh-plugin-hrl)模式使学生能够逐步构建思维，优化思维，同时避免过拟合AI
- **自动规划**：[schedule](dsh-plugin-schedule)插件可以根据学生的课表，上课节奏，当前进度自动规划当天的预习复习内容 


## 构建

Node `^22.19.0` 或 `>=24`，Yarn 4.18 走 Corepack。

```bash
corepack yarn install --immutable
corepack yarn build                               
corepack yarn workspace dsh-plugin-desktop start  
corepack yarn dist:win                             
```

测试：

```bash
corepack yarn test                                   # 单测
corepack yarn typecheck                              # 类型
corepack yarn check                                  # 全量（不含插件包单测）
corepack yarn check:plugins                          # 九个插件包
corepack yarn workspace dsh-plugin-desktop test:ui   # 端到端 UI
```

bilingual 哈希过期用`yarn docs:record`重算

## Plan

当前版本：0.1.0-alpha1

- [ ] 开始人工介入本项目，缩减vibe比例
- [ ] 压缩引擎（长会话撞窗口会硬失败）、权限审批交互、native 四窗换 token 后没逐屏核、交接卡片、图片链路、独立 Evaluator


## 暂时不做

- 账号 / 多租户
- 4–24 周学习路径
- 能力课程工作台

## 声明

本项目使用[MIT](LICENSE)协议
