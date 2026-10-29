# en∫ure 品牌稿

李定的方向：**ensure 的 s 换成 LaTeX 积分号 ∫**（`en∫ure`），即 `\\int`。这份目录放稿与生成器。**2026-10-30 李定了 geometric**，Windows 侧（托盘 + ico + png 目录）已经落地，生成器是 `build-icon.mjs`；macOS 三件仍是上游原件。

## 一句话结论

**李 2026-10-30 选了 geometric、不带 ILE、只落地 Windows** —— 下面这段是三版对比时写的，保留作依据。

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

## 落地（2026-10-30：Windows 已换，macOS 待重导）

| 步骤 | 状态 | 说明 |
| --- | --- | --- |
| 换 `build/tray-icon.svg` → `corepack yarn icons:tray` | ✅ 已做 | `tray/geometric.svg` → `build/tray-icon.svg`；6 个托盘 PNG 重生成 |
| 渲染 `build/app-icon.png` + `build/icons/{16..1024}.png` + `build/app-icon.ico` | ✅ 已做 | `build-icon.mjs` 用 sharp；ico 走 `scripts/generate-windows-app-icon.mjs`（它硬断言源 1024 RGBA16 + 有 ICC） |
| 改 `build/app-icon.resources.json` 里被重生成的 hash | ✅ 已做 | `outputs.app-icon.png` = `1e746d96c690d4b478bfd5c5cc8fc702450fd8b7e2eed646f7669d5382b51036`、`outputs.app-icon.ico` = `3a78c7d3188ff291e3708f479cb2b78c7ffb8015622b9d1014bcd3caf1ad25f0`；`sourceSha256` 没动（它只 digest `build/app-icon.icon/`） |
| `build/app-icon.icon/Assets/*.svg` → `app-icon.icns`、`app-icon-mac.png` | ⛔ 待 macOS | `corepack yarn icons:export` 要 Xcode 的 `ictool`/`actool`；在 Windows 上改那个目录会让 `icons:check` 直接红 |

**应用图标的设计**（`mark/geometric-app.svg`，仿 JetBrains 桌标结构）：`rx=230` 圆角方块 + 斜向渐变 `#5B79FF→#2A2F8F` + 左上 radial gloss（白 16%→0）+ 白 ∫（字形缩放 0.875、视觉中心 y=472）+ 底部白条 `x=348 y=812 w=328 h=52 rx=26`。

**托盘**是 50×50 纯 ∫（40/640 缩放居中）。注意 `generate-tray-icons.mjs` 的两条硬要求：文件里必须有字面 `fill="#4D6BFE"`、不许 `<style>`——所以 `build-icon.mjs` 把描边 ∫（两段三次贝塞尔 `M678 242 C595 242 512 337.85 512 512 C512 686.15 429 782 346 782`）**采样后转成填充轮廓**（法线偏移 half=50、96 步/段、首尾平切），而不是直接搬 SVG 描边。

```bash
cd docs/design/brand
node build-icon.mjs     # 写 build/ 下的 png/ico/svg 与 6 个托盘 PNG
corepack yarn icons:check
```

macOS 那三件仍是**上游 Icon Composer 原件（DeepSeek 鲸鱼）**，要在 macOS 上按 `build/app-icon.icon/` 重导；在那之前 mac 打包与 Windows 图标不一致——学生只装 Windows，这是已知取舍，写在 `build/app-icon.resources.json` 的 `windows` 块里。
