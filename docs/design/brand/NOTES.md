# en∫ure 品牌稿

李定的方向：**ensure 的 s 换成 LaTeX 积分号 ∫**（`en∫ure`），即 `\\int`。这份目录只放**稿**，`build/` 下已提交的图标产物一个字节都没动。

## 一句话结论

三版都成立，但**只有 serif 与 geometric 适合当主字标**，mono 留给小尺寸（favicon / 托盘 / 代码块旁）。推荐 **serif** 主选：它和「视觉层＝演算纸」那条规矩（宋体＝印刷体、楷体＝手写、黑体＝界面）是同一套语言，而且 16px 下钩子最清楚；geometric 更现代、更「界面」，如果要的是产品名而不是书名号，选它。

## 三版是什么

| 版 | 构造 | 笔画 / x-height | 适合 |
| --- | --- | --- | --- |
| `serif` | 直接从仓库自带 **ILE Song**（思源宋体子集）取轮廓（fontTools），只把 s 换成手绘 ∫ | 字形自带 | 主字标、README、关于窗口 |
| `geometric` | 手绘：正圆 e、圆形肩 n/u、butt cap 平切；∫ 唯一有升部+降部 | 16 / 100 = 16% | 现代产品名、应用图标里的字形 |
| `mono` | 手绘：92 字格、方肩、斜杆带脚 | 17 / 92 = 18.5% | 16px 托盘、favicon、终端感场合 |

∫ 的处理（三版同一套逻辑）：**上钩长、下钩短**（design 里 26 : 16）——下钩短才不会钻到前一个 n 的右杆脚下；墨迹高约 1.34~1.48 倍 x-height，上下各溢出一点，正是 `\\int` 的样子。∫ 之外**没有任何字形越过 x-height 或基线**。

## 实测度量（1024 px 宽渲染，像素）

用逐列墨迹探针量的（`node /tmp/glyphprobe.mjs <png>` 那种做法，脚本没入库）：

| 版 | e | n | u | r | ∫ | ∫ / x-height |
| --- | --- | --- | --- | --- | --- | --- |
| geometric | 62..269 (208) | 62..269 (208) | 62..269 (208) | 62..269 (208) | 12..319 (308) | 1.48 |
| mono | 40..211 (172) | 40..211 (172) | 40..211 (172) | 40..211 (172) | 11..240 (230) | 1.34 |
| serif | 53..226 (174) | 53..222 (170) | 56..226 (171) | 53..222 (170) | 9..258 (250) | 1.47 |

serif 那几像素的差是衬线字体自身的圆形 overshoot（e/u 的弧比 n/r 高出 1~2%），属于正确行为，不是没对齐。

**修过的一个真问题**：第一版 geometric 与 mono 里 n 的顶端比 e 高 16px、u 的底端比基线低 16px——无衬线小写 u 不该有降部。原因是手绘时把拱顶/碗底的中线当成了墨迹边。现在 `generate.py` 里 `ga_n()` 的拱顶中线写 `-92`（+ 半笔 = -100 落在 x-height 上）、`ga_u()` 的碗底中线写 `-8`（+ 半笔 = 0 落在基线上），重新生成后四个字母顶底完全一致。

## -ILE 怎么挂（三版各三种）

| 处理 | 观感 | 16px 存活率 |
| --- | --- | --- |
| `-ile-smallcaps` | `en∫ure` 后接小写尺寸的大写字距 ILE | 中：16px 下 ILE 会糊成一条 |
| `-ile-rule` | 一条细竖线分隔，ILE 与主字标同高 | 低：竖线在 16px 变成一竖噪点 |
| `-ile-toned` | ILE 用品牌蓝、主字标用墨色 | 中：颜色区分在小尺寸先失效 |

建议：**主字标不带 ILE**（`en∫ure` 就是品牌），ILE 只出现在产品名文字里（`ensure-ILE`）与关于窗口。要带就选 `toned`——颜色能区分两层，不靠塞字母。

## 方形 mark（应用图标）与托盘

- `mark/geometric` / `mark/serif` / `mark/mono`：∫ 单独成形、白描边、品牌蓝底（`tile()`）。
- `mark/geometric-cjk`：∫ 下面配「因需」二字的方案。**16px 下那两字必然是糊的**（ASCII 预览里就是两排 `::` 方块），建议只在大尺寸用（关于窗口 / 启动页），不要进托盘与应用图标。
- 托盘 16px ASCII 预览：geometric 与 mono 的 ∫ 是一条带轻微上钩的斜线，能认；serif 最粗（3px 宽 + 上钩明显），16px 反而最稳。**结论：托盘用 serif 或 mono，别用 geometric**（它 16px 时上钩只剩 2 个像素）。

## 重新生成

```bash
cd docs/design/brand
python generate.py      # 需要 fontTools；只写 .raw/ 中间产物
node render.mjs         # 需要 sharp（从 dsh-plugin-desktop 的 node_modules 解析）；写 .svg 与 render/*.png
node preview.mjs        # 生成 preview.html（离线可看，SVG 内联）
```

`.raw/` 是中间产物（76 KB，含 raw/*.svg 与 manifest.json），**入库**——`render.mjs` 读它，删了就得先跑 `generate.py`。

## 落地（还没做，等李定稿）

现在的应用图标是 **DeepSeek 鲸鱼**：托盘 `build/tray-icon.svg`、Windows `build/app-icon.ico` + `build/icons/*.png`、macOS `build/app-icon.icon/` + `build/app-icon.icns`。

| 步骤 | 谁跑得动 | 说明 |
| --- | --- | --- |
| 换 `build/tray-icon.svg` → `corepack yarn icons:tray` | **Windows 可以** | 脚本要求整文件固定 `#4D6BFE`、不许 `<style>`；托盘 6 个 PNG 会重生成 |
| 用母版渲染 `build/icons/{16..1024}.png` + `build/app-icon.ico` | **Windows 可以** | `scripts/generate-windows-app-icon.mjs`（sharp） |
| 改 `build/app-icon.resources.json` 的 `outputs` 里被重生成的那几个 hash | **Windows 可以** | `sourceSha256` 不用动——它只 digest `build/app-icon.icon/` 目录，我们不碰它 |
| `build/app-icon.icon/Assets/*.svg`（Icon Composer 图层）→ `app-icon.icns` | **必须 macOS** | `corepack yarn icons:export` 要 Xcode 的 `ictool`/`actool`；在 Windows 上改了这个目录会让 `icons:check` 直接红（目录 digest 变了却导不出来） |

所以两条路：
1. **只落地 Windows**（托盘 + ico + png 目录），`icons:check` 仍然绿；代价是 `app-icon.icns` 与 `app-icon-mac.png` 留在旧鲸鱼，mac 打包与 Windows 不一致。学生只装 Windows，这条是可接受的取舍，但必须写进 `assets/app-icons.source.json` 的来源说明，别让下一个人以为三平台是同一版。
2. **等有 macOS 时一次性导出全平台**，现在只交稿。
