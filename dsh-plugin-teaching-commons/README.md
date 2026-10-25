# dsh-plugin-teaching-commons

ensure-ILE 的教学共用素材：所有模式（setup / guide / work / HRL）共用的提示词片段与学科备注。

**为什么要单独一个包。** 每个模式都用 `systemPrompt.section({ complete: true })` 整份替换系统提示，别的 section 全被吞掉。安全边界、说话方式、题库规则如果各写一份，改一句要改四处，必漏。这里放一次，各模式挂载时拼进去。

| 文件 | 内容 |
|---|---|
| `prompts/common.md` | 说话的样子、不许出现的词、安全边界 |
| `prompts/bank.md` | 题库怎么用（add / list / show / update / handoff） |
| `skills/math.md` | 理科备注：怎么验、什么算解完 |
| `skills/arts.md` | 文科备注：怎么算站得住 |

```ts
import { composePrompt, readNote } from 'dsh-plugin-teaching-commons'

const text = composePrompt(['common', 'bank'], readFileSync('guide.md', 'utf8'))
```

`readNote(note)` 是给 `read_note` 工具用的，行为与原来 guide 内联的那份一致：只收小写字母，找不到就告诉模型有哪些可用。
