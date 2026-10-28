import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = fileURLToPath(new URL('.', import.meta.url))   // 本文件所在目录
const INK = '#17191B', INK_DARK = '#EDEFF2'
function load(rel) {
  const src = readFileSync(join(ROOT, rel), 'utf8').trim()
  const vb = /viewBox="([-0-9.]+) ([-0-9.]+) ([-0-9.]+) ([-0-9.]+)"/.exec(src)
  if (!vb) throw new Error('no viewBox: ' + rel)
  const body = src.slice(src.indexOf('>', src.indexOf('<svg')) + 1, src.lastIndexOf('</svg>'))
  return { w: +vb[3], h: +vb[4], vb: vb[1] + ' ' + vb[2] + ' ' + vb[3] + ' ' + vb[4], body }
}
function svg(rel, height, dark) {
  const s = load(rel)
  const w = Math.round((s.w * height / s.h) * 100) / 100
  const body = dark ? s.body.split(INK).join(INK_DARK) : s.body
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + s.vb + '" width="' + w + '" height="' + height + '" role="img">' + body + '</svg>'
}
function cell(rel, height, dark, cap, sub) {
  return '<figure class="cell"><div class="art">' + svg(rel, height, dark) + '</div><figcaption>' + cap + (sub ? '<em>' + sub + '</em>' : '') + '</figcaption></figure>'
}
const S = ['geometric', 'serif', 'mono']
const CN = { geometric: '①几何无衬线', serif: '②衬线（宋体气质）', mono: '③单线等宽' }
const out = []
out.push('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">')
out.push('<title>en∫ure 品牌稿 · 三版对比</title>')
out.push('<style>')
out.push(':root{--ink:#17191B;--paper:#F7F8FA;--dark:#15171A;--blue:#4D6BFE;--line:rgba(23,25,27,.14)}')
out.push('*{box-sizing:border-box}')
out.push('body{margin:0;background:#fff;color:var(--ink);font:14px/1.6 -apple-system,"Segoe UI","Microsoft YaHei","PingFang SC",sans-serif}')
out.push('.wrap{max-width:1180px;margin:0 auto;padding:40px 28px 80px}')
out.push('h1{font-size:22px;margin:0 0 6px;letter-spacing:.2px}')
out.push('h2{font-size:15px;margin:44px 0 4px;padding-top:16px;border-top:1px solid var(--line)}')
out.push('p.lead{margin:0 0 4px;color:rgba(23,25,27,.62);max-width:74ch}')
out.push('p.note{margin:6px 0 0;color:rgba(23,25,27,.5);font-size:12.5px;max-width:78ch}')
out.push('.row{display:flex;gap:20px;flex-wrap:wrap;margin:14px 0 0}')
out.push('.cell{margin:0;flex:0 0 auto}')
out.push('.art{display:flex;align-items:center;justify-content:center;min-height:0;padding:14px 18px;border:1px solid var(--line);border-radius:10px;background:var(--paper)}')
out.push('.dark .art{background:var(--dark);border-color:rgba(255,255,255,.14)}')
out.push('figure.dark figcaption{color:rgba(23,25,27,.62)}')
out.push('figcaption{margin-top:6px;font-size:12px;color:rgba(23,25,27,.55);text-align:center}')
out.push('figcaption em{display:block;font-style:normal;font-size:11px;color:rgba(23,25,27,.4)}')
out.push('.stack{display:flex;flex-direction:column;gap:10px}')
out.push('.tag{display:inline-block;padding:1px 7px;border-radius:999px;background:rgba(77,107,254,.12);color:#3A55D9;font-size:11px;margin-left:6px;vertical-align:2px}')
out.push('table{border-collapse:collapse;margin-top:12px;font-size:12.5px}')
out.push('th,td{border-bottom:1px solid var(--line);padding:6px 14px 6px 0;text-align:left;vertical-align:middle}')
out.push('th{font-weight:600;color:rgba(23,25,27,.55)}')
out.push('code{font-family:ui-monospace,Consolas,monospace;font-size:12px;background:rgba(23,25,27,.06);padding:1px 4px;border-radius:3px}')
out.push('.grid2{display:grid;grid-template-columns:1fr 1fr;gap:22px}')
out.push('@media (max-width:820px){.grid2{grid-template-columns:1fr}}')
out.push('</style></head><body><div class="wrap">')
out.push('<h1>en∫ure — 品牌字标三版</h1>')
out.push('<p class="lead">把 ensure 的 s 换成 LaTeX 积分号 ∫（U+222B，字标里是重画的路径，不是字体字符）。∫ 同时有升部和降部，三版都各自处理了「撑高整行、重心上移」，处理方式不同，见每节说明。</p>')
out.push('<p class="note">所有图形都是内联 SVG 路径（不依赖本机字体），16px 档按真实像素显示，可以把页面缩放到 100% 直接看它在小尺寸下的样子。</p>')
out.push('<h2>一 · 三版字标 × 三档尺寸</h2>')
out.push('<p class="lead">大字（96px 高）看造型与 ∫ 的钩；中档（40px）看文件标题栏/安装器里的实际观感；16px 是极限档。</p>')
for (const s of S) {
  out.push('<div class="row"><div class="stack">')
  for (const [h, cap] of [[96, '96px 高'], [40, '40px 高'], [16, '16px 高 · 真实像素']]) {
    out.push(cell('wordmark/' + s + '.svg', h, false, CN[s] + ' ' + cap))
  }
  out.push('</div><div class="stack dark">')
  for (const [h, cap] of [[96, '深底 96px'], [40, '深底 40px'], [16, '深底 16px']]) {
    out.push('<figure class="cell dark"><div class="art dark">' + svg('wordmark/' + s + '.svg', h, true) + '</div><figcaption>' + cap + '</figcaption></figure>')
  }
  out.push('</div></div>')
}
out.push('<p class="note">深底用的是同一份路径、只换墨色（#17191B → #EDEFF2），位置不动。</p>')
out.push('<h2>二 · -ILE 的四种处理</h2>')
out.push('<p class="lead">ILE = In Learning Environment。李只定了 en∫ure，后缀按四种方式处理，越往下越弱：小体大写并入字标 → 竖线分隔 → 只用颜色/字重区分 → 完全不带。</p>')
for (const s of S) {
  out.push('<div class="row">')
  out.push(cell('wordmark/' + s + '.svg', 40, false, '不带 ILE', CN[s]))
  out.push(cell('wordmark/' + s + '-ile-smallcaps.svg', 40, false, '小体大写并入', '同一行、0.72× x-height'))
  out.push(cell('wordmark/' + s + '-ile-rule.svg', 40, false, '竖线分隔', '两个词，产品名才这么写'))
  out.push(cell('wordmark/' + s + '-ile-toned.svg', 40, false, 'ILE 用品牌蓝', '同一行、只换色（小体大写版）'))
  out.push('</div>')
}
out.push('<p class="note">16px 档：小体大写的 ILE 已经在 x-height 的 72%，三根竖笔画在 16px 高时并成一条深色带——所以小尺寸下只出 en∫ure，ILE 交给产品名文字。</p>')
out.push('<h2>三 · 方形 mark（应用图标）</h2>')
out.push('<p class="lead">∫ 单独成形、不做字标缩放（小尺寸下缩字标必糊）。1024 圆角底 rx230 + 品牌蓝 #4D6BFE + 白 ∫。</p>')
out.push('<div class="row">')
for (const s of ['geometric', 'serif', 'mono', 'geometric-cjk']) {
  out.push('<div class="stack">')
  out.push(cell('mark/' + s + '.svg', 256, false, 'mark/' + s, '256px'))
  out.push('<div class="row" style="gap:14px;margin:0">')
  out.push(cell('mark/' + s + '.svg', 64, false, '64px'))
  out.push(cell('mark/' + s + '.svg', 16, false, '16px'))
  out.push('</div></div>')
}
out.push('</div>')
out.push('<p class="note">geometric-cjk 是「∫ + 因需」的对照版：16px 时两个字已经糊成两条横带（下面那两行 ::），只适合 ≥64px 的场合（关于页、启动画面），不能当应用图标主版。</p>')
out.push('<h2>四 · 托盘图标（16 / 32 单色）</h2>')
out.push('<p class="lead">托盘是单色剪影：Template 版走系统黑（macOS 会自动反色），blue 版固定 #4D6BFE（generate-tray-icons.mjs 的要求）。下面只展示 32 与 16 两档真实像素。</p>')
out.push('<div class="grid2">')
out.push('<div><div class="row">')
for (const s of ['geometric', 'serif', 'mono']) out.push(cell('tray/' + s + '.svg', 32, false, 'tray/' + s, '32px'))
out.push('</div><div class="row">')
for (const s of ['geometric', 'serif', 'mono']) out.push(cell('tray/' + s + '.svg', 16, false, 'tray/' + s, '16px'))
out.push('</div></div>')
out.push('<div class="dark"><div class="row">')
for (const s of ['geometric-template', 'serif', 'mono']) out.push('<figure class="cell dark"><div class="art dark">' + svg('tray/' + s + '.svg', 32, s === 'geometric-template') + '</div><figcaption>深底 32px · ' + s + '</figcaption></figure>')
out.push('</div><div class="row">')
for (const s of ['geometric-template', 'serif', 'mono']) out.push('<figure class="cell dark"><div class="art dark">' + svg('tray/' + s + '.svg', 16, s === 'geometric-template') + '</div><figcaption>深底 16px</figcaption></figure>')
out.push('</div></div>')
out.push('</div>')
out.push('<p class="note">16px 档三版都还在：∫ 不是一根竖线，而是一条带钩的斜杆（钩各占 1px）。serif 版在 16px 下钩太粗（笔画 4px），会和 ∫ 的竖杆并成一坨，所以托盘主版选 geometric。</p>')
out.push('<h2>五、产品名的写法</h2>')
out.push('<table><tr><th>场合</th><th>写法</th><th>理由</th></tr>')
out.push('<tr><td>字标 / 图标 / 启动画面</td><td><code>en∫ure</code>（可选 <code>en∫ure ILE</code>）</td><td>小体大写 ILE 不抢 ∫ 的注意力</td></tr>')
out.push('<tr><td>窗口标题 / 安装器 / 通知</td><td><code>ensure-ILE</code></td><td>字标不是字体，文本里必须可搜索、可朗读——U+222B 在屏幕阅读器里读作「integral」</td></tr>')
out.push('<tr><td>README 首行 / 包名</td><td><code>ensure-ILE</code></td><td>同上；仓库名不能含数学符号</td></tr></table>')
out.push('</div></body></html>')
writeFileSync(join(ROOT, 'preview.html'), out.join('\n'))
console.log('preview.html', out.join('\n').length, 'bytes')
