# UPSTREAM — dsh-plugin-skin 的上游关系

这个包是 [Nwflower/dsh-claude-style](https://github.com/Nwflower/dsh-claude-style) 的 **fork**
（2026-11-05 定：从 `vendor/dsh-claude-style` 搬到仓库根、成为我们的 workspace 包，并把**默认品牌图**
换成本仓库的 mark / wordmark，从根上消掉「首屏闪一下 Claude 原样」）。

- 上游仓库：<https://github.com/Nwflower/dsh-claude-style>
- 同步的版本：`0.19.2`（MIT，作者 Nwflower；Sodium 渲染引擎另按 PolyForm Shield 1.0.0，见 `docs/NOTICE.md`）
- 我们的版本号：`0.19.2-ensure-ile.N`（`N` 是我们自己的改动轮次，不是上游补丁号）
- 拷贝日期：2026-10-31；搬进 workspace：2026-11-05

## 为什么 fork

皮肤自己的样式表（`lib/client.js` 顶部的 `var t1=`）里内联了**默认品牌图**的 data URI：
`--dsh-claude-image-claude-mark` / `-claude-mark-clay` / `-claude-word`。运行时那套
`GET /dsh-claude-style/brand` 是**异步**取图（`r3()` 先按空缓存画一次，`i0()` 才去取），首绘到取图之间
显示的就是 Claude 的放射星——冷启动 / Defender 慢扫 / 每次重载都可能撞上。只有把**默认图本身**换成我们的，
这个窗口才不存在。上游没有「换默认图」的扩展点，所以拿源码自己改。

## 今天改了什么（相对 v0.19.2）

- `package.json`：`name` → `dsh-plugin-skin`，`version` → `0.19.2-ensure-ile.1`，`description` 标明是 fork；
  **删掉 `workspaces` 字段**（包内 `packages/*` 只是上游的源码目录，不参与根 workspace）
- `cordis.patch.yml`：插入行的 `name` → `dsh-plugin-skin`（这一行是**包名解析**，不是身份；行 id 仍是 `ui-skin-claude-style`）
- `lib/client.js`：`window.__ModuleLoader__.load({ id })` 的 id → `dsh-plugin-skin`（跟包名走，和 `dsh-plugin-memory` 一致）
- **默认品牌图换成本仓库的图**（本轮核心）：
  - `--dsh-claude-image-claude-mark` 与 `--dsh-claude-image-claude-mark-clay` ← `profiles/ensure-ile/brand/mark.svg`
    （432×640 的 ∫）；`--dsh-claude-image-claude-word` ← `profiles/ensure-ile/brand/wordmark.svg`（494×160 的 `en∫ure`）
  - 编码方式照原样：`%` `#` `<` `>` `=` `/` `:` 空格等一律 `%XX`（大写十六进制），单引号留在 URL 外层
  - **只有 mark 改了颜色**：源 SVG 是 `stroke='#FFFFFF'`（给遮罩用的）。侧栏 `brand-mark` / `rail-mark` 走
    CSS mask（只吃 alpha）无所谓，但 hero 的 `:before` 是拿 `-mark-clay` 当 **background-image** 画的——
    白字数放在浅色画布上等于没有。所以内联时 `stroke` 换成我们的强调色 `#4E9C90`，深浅两套主题都看得见。
    （异步自定义图到达后皮肤按 `brandInk: accent` 用遮罩重上色成 `--dsh-claude-logo-ink`，那是原有行为。）
  - **字标宽高比跟着换**：`width:calc(18px * 512.22 / 121.54)` 是上游 wordmark 的 viewBox 比例，换图后必须改成
    `calc(18px * 494 / 160)`，否则字标被拉扁。共两处（侧栏 `brand-name:before` 与设置页 `.dsh-claude-brand-card-word`）；
    `lib/client.js` 里 `512.22 / 121.54` 现在 0 处。
- **两处 slogan 手改**（2026-10-31 起，升级会冲掉）：
  `function x3(e,t){…}`（classic 首屏）与 `function E3(e){…}`（studio 首屏）都返回 `"Shapen the world"`。
  改完 `grep -c "Shapen the world" dsh-plugin-skin/lib/client.js` 必须是 **2**。

## 刻意保持不变的字符串（改了会破坏学生数据或我们的 CSS / 测试）

| 保持原样 | 为什么 |
| --- | --- |
| body 属性 `data-dsh-claude-style` | `dsh-plugin-desktop/src/client/brand-styles.ts` / `workspace-styles.ts` / UI 测试都按它选元素 |
| 路由前缀 `/dsh-claude-style`（`lib/host/routes.js` 与 `lib/client.js` 的 `ROUTE_PREFIX`） | 客户端与宿主两边必须对上；改它要两边同时改，没有收益 |
| `lib/host/*.js` 的 `PACKAGE_NAME = "dsh-claude-style"` | 它定的是**数据目录** `<DSH_HOME>/dsh-claude-style/`（brand / cache / fonts）。`seedBrandAssets()` 种的图就在 `<DSH_HOME>/dsh-claude-style/brand/`，搬走等于把学生换过的图弄丢 |
| 行 id `ui-skin-claude-style` | `profiles/ensure-ile/cordis.patch.yml` 按 id 覆写这一行 |
| `GET/PUT /dsh-claude-style/brand` 与 `i0()`/`c0()` 订阅机制 | 学生以后换自己的图仍然生效；默认图换我们的只是把「首帧」也变成我们 |
| `skin.json` 的 `id` / `package` / `bodyAttr` | 皮肤自述的标识，不是 npm 包名 |

## 怎么同步上游

不合并上游的提交历史，只搬我们需要的改动：

1. `git clone --depth 1 --branch vX.Y.Z https://github.com/Nwflower/dsh-claude-style /tmp/dsh-claude-style-upstream`
2. `diff -r lib/ /tmp/dsh-claude-style-upstream/lib/` 看上游改了什么
3. 挑需要的搬（一个文件一个文件搬，别整包覆盖——默认品牌图与两处 slogan 会被冲掉）
4. 搬完重新跑一遍本文件「默认品牌图换成我们的图」那一段：
   - 三个 data URI 换回我们的 SVG（编码规则同上）
   - `512.22 / 121.54` → `494 / 160`
   - `grep -c "Shapen the world" lib/client.js` = 2
5. 门：`corepack yarn workspace dsh-plugin-desktop test` + `test:ui`（`tests/ui/shell.spec.ts` 断言 hero-mark 可见、侧栏只剩字标）

## 未合清单

- （空）
