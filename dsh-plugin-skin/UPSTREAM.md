# UPSTREAM — dsh-plugin-skin 的上游关系

本包是 [Nwflower/dsh-claude-style](https://github.com/Nwflower/dsh-claude-style) 的 fork。
2026-11-05 搬入 workspace；2026-11-14 从 `0.19.2` 同步至 `0.21.0`。

- 上游版本：`0.21.0`；本地版本：`0.21.0-ensure-ile.1`。
- Harness 与 UI primitives 最低版本均为 `0.2.2-rc.1`；本仓库使用 `0.2.2-rc.3`。
- MIT 许可证；Sodium 渲染引擎另按 PolyForm Shield 1.0.0，见 `docs/NOTICE.md`。
- 本包提交上游编译产物；不参与 `verify-lib-sync` 的源码重建检查。

## 为什么保留 fork

皮肤先画内置品牌图，再异步读取 `GET /dsh-claude-style/brand`。只替换运行时图片，
冷启动仍会短暂显示上游图案；所以内置默认图也必须使用我们的 mark 与 wordmark。

## 相对上游的定制

- `package.json`：包名为 `dsh-plugin-skin`，版本追加 `-ensure-ile.N`，说明标明 fork；
  删除嵌套 `workspaces`，避免上游源码目录被当作本仓库工作区。
- `cordis.patch.yml`：插入行的 `name` 使用 `dsh-plugin-skin`。
- `lib/client.js`：客户端 loader 的 `id` 使用 `dsh-plugin-skin`。
- 内置 `--dsh-claude-image-claude-mark`、`-mark-clay` 使用 `profiles/ensure-ile/brand/mark.svg`；
  `-word` 使用同目录 `wordmark.svg`，保留三个完整 data URI。
- 内置 mark 的描边使用 `#4E9C90`，保证浅色背景上的 hero 可见；学生自定义图片仍走原有遮罩逻辑。
- 两处字标宽高比为 `calc(18px * 494 / 160)`，上游 `512.22 / 121.54` 应为零处。
- classic 与 studio 两个欢迎语函数均返回 `Shapen the world`。`0.21.0` 产物中的函数名为
  `i8(e,t)` 与 `c8(e)`；后续构建会改名，应按调用关系定位。

## 刻意保持的身份

| 字符串 | 原因 |
| --- | --- |
| `data-dsh-claude-style` | 桌面样式与 UI 测试按此属性定位 |
| `/dsh-claude-style` | 宿主路由与客户端请求必须一致 |
| 宿主 `PACKAGE_NAME = "dsh-claude-style"` | 保留学生的品牌图、字体与缓存数据目录 |
| 行 id `ui-skin-claude-style` | profile 按此 id 覆写配置 |
| `skin.json` 的 `id`、`package`、`bodyAttr` | 上游皮肤的内部标识 |

## 本次同步

同步上游会话详情栏、会话统计、长对话性能与滚动修复，以及配套宿主代码和资源。
详情栏采用现有默认配置；不另改我们的主题、首页布局或侧栏定制。
替换了已失效的旧哈希资源，移除上游已撤下的两份 JetBrains Mono 字体文件；保留新版本附带的许可证。

## 后续同步流程

1. 固定发布 tag，比较旧版、当前 fork、新版三个目录。
2. 按文件合并，保留 `UPSTREAM.md` 与上面的包身份和品牌定制。
3. 删除新版本已撤下的旧资源，避免继续打包无效哈希文件。
4. 校验三个默认 SVG、两处字标比例和两处 slogan；用出现次数统计，勿用行数统计。
5. 运行桌面单测与 `test:ui`，确认 hero、侧栏、浅深主题及长对话显示。

## 未合清单

无；保留项均为上述明确的 fork 定制。
