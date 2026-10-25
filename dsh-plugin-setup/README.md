# dsh-plugin-setup

ensure-ILE 的**开学对话**：第一次见面时把学生的基本情况问清楚，并给出下一步。

它是独立预设（id `setup`、显示「开学」），不是欢迎向导弹窗。理由和 OpenClaw 的 onboarding chat 一样：把「第一次启动的自我介绍」和日常做题分开，主会话上下文不被配置说明打乱。

## 它做什么

1. 把系统提示换成「开学文档」（共用片段 + `prompts/setup.md`）
2. 注册两个工具：`setup_read` 读进度、`setup_update` 写进度
3. 进度落在 `<DSH_HOME>/setup.json`，**字段级**，可中断：

```json
{
  "schema": 1,
  "onboarding": "pending",
  "got": { "grade": "高一", "schedule": "周一到周五…", "rhythm": "…", "preference": "…" },
  "next": "明天先做一道函数题",
  "updatedAt": "2026-10-25T00:00:00.000Z"
}
```

## 完成判据

不是「四样都问了」，是**能给出下一步**（`next` 有内容）。问完就撒手等于没收尾。

## 为什么默认预设还是 guide

学生开新会话默认就能做题；想重新过一遍开学问话时才在空会话里选「开学」。等 `seedProfile()` 有了打包分支，再考虑让首次启动自动进 setup。

## 调试

- 改 `prompts/setup.md` 不用重新构建，重启会话即生效（挂载时读盘）
- 想看进度：`cat .ensure-ile/home/setup.json`
