
// 品牌稿 framing + 渲染 + 定量检测（sharp 从 dsh-plugin-desktop 解析）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { createRequire } from 'node:module'

const root = resolve(import.meta.dirname, '..', '..', '..')
// sharp 只有桌面工作区装了，从那里解析；本脚本不进 build/、不参与打包
const sharp = createRequire(join(root, 'dsh-plugin-desktop/package.json'))('sharp')

const RAW = join(root, 'docs/design/brand/.raw/raw')
const manifest = JSON.parse(readFileSync(join(root, 'docs/design/brand/.raw/manifest.json'), 'utf8'))
const OUT = join(root, 'docs/design/brand')
const RENDER = join(OUT, 'render')
mkdirSync(RENDER, { recursive: true })

const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 }

function declared(svg) {
  const w = /width="([\d.]+)"/.exec(svg)
  const h = /height="([\d.]+)"/.exec(svg)
  return { w: Number(w[1]), h: Number(h[1]) }
}
const r2 = v => Math.round(v * 100) / 100

async function raster(svg, scale) {
  const d = declared(svg)
  const img = await sharp(Buffer.from(svg), { density: 72 * scale })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = img.info
  return { data: img.data, width, height, channels, sx: width / d.w, sy: height / d.h }
}

async function inkBox(svg) {
  const m = await raster(svg, 4)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  const a = m.channels - 1
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      if (m.data[(y * m.width + x) * m.channels + a] > 16) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  return { x0: x0 / m.sx, y0: y0 / m.sy, x1: (x1 + 1) / m.sx, y1: (y1 + 1) / m.sy }
}

// ---- 1. framing
const finals = {}
for (const [name, meta] of Object.entries(manifest)) {
  const svg = readFileSync(join(RAW, name + '.svg'), 'utf8')
  const d = declared(svg)
  let vb
  if (meta.pad === 'square') {
    vb = [0, 0, d.w, d.h]               // 托盘保持 50×50 画布
  } else {
    const b = await inkBox(svg)
    const pad = meta.pad || 0
    vb = [r2(b.x0 - pad), r2(b.y0 - pad), r2(b.x1 - b.x0 + pad * 2), r2(b.y1 - b.y0 + pad * 2)]
  }
  const body = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
  const out = '<svg xmlns="http://www.w3.org/2000/svg" width="' + vb[2] + '" height="' + vb[3]
    + '" viewBox="' + vb.join(' ') + '">' + body + '</svg>\n'
  const path = join(OUT, name + '.svg')
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, out)
  finals[name] = { svg: out, vb }
}

// ---- 2. PNG
const rendered = []
async function png(svg, w, file) {
  const d = declared(svg)
  const scale = Math.max(1, w / d.w) * 2
  const buf = await sharp(Buffer.from(svg), { density: 72 * scale })
    .resize({ width: Math.max(1, Math.round(w)), fit: 'contain', background: CLEAR })
    .png().toBuffer()
  writeFileSync(join(RENDER, file), buf)
  const m = await sharp(buf).metadata()
  rendered.push(file + ' ' + m.width + 'x' + m.height)
}

for (const style of ['geometric', 'serif', 'mono']) {
  for (const suffix of ['', '-ile-smallcaps', '-ile-rule', '-ile-toned']) {
    const svg = finals['wordmark/' + style + suffix].svg
    const d = declared(svg)
    for (const w of [1024, 320, 256, 160, 96, 64, 32]) await png(svg, w, 'wordmark-' + style + suffix + '-' + w + '.png')
    await png(svg, d.w * (16 / d.h), 'wordmark-' + style + suffix + '-h16.png')
  }
  for (const size of [1024, 256, 64, 32, 16]) await png(finals['mark/' + style].svg, size, 'mark-' + style + '-' + size + '.png')
  for (const size of [16, 32]) await png(finals['tray/' + style].svg, size, 'tray-' + style + '-' + size + '.png')
}
for (const size of [16, 32]) await png(finals['tray/geometric-template'].svg, size, 'tray-geometric-template-' + size + '.png')
for (const size of [1024, 256, 64, 32, 16]) await png(finals['mark/geometric-cjk'].svg, size, 'mark-geometric-cjk-' + size + '.png')

// ---- 3. 定量检测
function runsOf(prof, thr) {
  const out = []
  let start = -1
  for (let i = 0; i < prof.length; i++) {
    const on = prof[i] > thr
    if (on && start < 0) start = i
    if (!on && start >= 0) { out.push([start, i]); start = -1 }
  }
  if (start >= 0) out.push([start, prof.length])
  return out
}

// 字标：在三条水平带里量「墨迹段 / 留白」，坐标换回字形单位（减掉 viewBox 偏移）
const proto = {}
for (const style of ['geometric', 'serif', 'mono']) {
  const svg = finals['wordmark/' + style].svg
  const m = await raster(svg, 6)
  const a = m.channels - 1
  const [, , vbW, vbH] = finals['wordmark/' + style].vb
  const bands = [[0.28, 0.38], [0.45, 0.55], [0.60, 0.70]]
  const detail = []
  for (const [t0, t1] of bands) {
    const prof = new Array(m.width).fill(0)
    const y0 = Math.floor(t0 * m.height), y1 = Math.floor(t1 * m.height)
    for (let x = 0; x < m.width; x++) {
      let mx = 0
      for (let y = y0; y < y1; y++) {
        const v = m.data[(y * m.width + x) * m.channels + a]
        if (v > mx) mx = v
      }
      prof[x] = mx
    }
    const rr = runsOf(prof, 24).map(([s, e]) => [r2(s / m.sx), r2(e / m.sx)])
    detail.push({ band: t0 + '-' + t1, runs: rr })
  }
  // 宽度方向的留白 = 相邻墨迹段之间的空档（按字形单位）
  const mid = detail[1].runs
  const gaps = []
  for (let i = 0; i + 1 < mid.length; i++) gaps.push(r2(mid[i + 1][0] - mid[i][1]))
  proto[style] = { viewBox: finals['wordmark/' + style].vb, aspect: r2(vbW / vbH), bands: detail, midGaps: gaps }
}

function ascii(m, mode, cols, rows) {
  const lines = []
  const ch = m.channels
  for (let r = 0; r < rows; r++) {
    let line = ''
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor(c * m.width / cols), x1 = Math.max(x0 + 1, Math.floor((c + 1) * m.width / cols))
      const y0 = Math.floor(r * m.height / rows), y1 = Math.max(y0 + 1, Math.floor((r + 1) * m.height / rows))
      let sum = 0, n = 0
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * m.width + x) * ch
        let v
        if (mode === 'red') v = (m.data[i] - 77) / (255 - 77)
        else v = m.data[i + 3] / 255
        sum += v; n++
      }
      const v = sum / n
      line += v > 0.72 ? '#' : v > 0.42 ? '+' : v > 0.16 ? ':' : v > 0.06 ? '.' : ' '
    }
    lines.push(line)
  }
  return lines.join('\n')
}

async function smallDump(name, size, mode) {
  const svg = finals[name].svg
  const d = declared(svg)
  let img = sharp(Buffer.from(svg), { density: 72 * Math.max(1, size / Math.min(d.w, d.h)) * 3 })
    .resize({ width: size, height: size, fit: 'contain', background: mode === 'red' ? { r: 77, g: 107, b: 254, alpha: 1 } : CLEAR })
  if (mode === 'red') img = img.flatten({ background: { r: 77, g: 107, b: 254, alpha: 1 } })
  const buf = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return ascii({ data: buf.data, width: buf.info.width, height: buf.info.height, channels: buf.info.channels }, mode, 16, 16)
}

const dumps = {}
for (const [label, name, mode] of [
  ['tray/geometric 16', 'tray/geometric', 'alpha'],
  ['tray/mono 16', 'tray/mono', 'alpha'],
  ['tray/serif 16', 'tray/serif', 'alpha'],
  ['mark/geometric 16', 'mark/geometric', 'red'],
  ['mark/mono 16', 'mark/mono', 'red'],
  ['mark/serif 16', 'mark/serif', 'red'],
  ['mark/geometric-cjk 16', 'mark/geometric-cjk', 'red'],
]) dumps[label] = await smallDump(name, 16, mode)

writeFileSync(join(root, 'docs/design/brand/.raw/proto.json'), JSON.stringify(proto, null, 1))
console.log('svg:', Object.keys(finals).length, '| png:', rendered.length)
for (const style of Object.keys(proto)) {
  const p = proto[style]
  console.log('\n### ' + style + '  viewBox=' + p.viewBox.join(',') + '  aspect=' + p.aspect)
  for (const b of p.bands) console.log('  band ' + b.band + ' runs=' + JSON.stringify(b.runs))
  console.log('  midGaps=' + JSON.stringify(p.midGaps))
}
for (const [k, v] of Object.entries(dumps)) console.log('\n=== ' + k + '\n' + v)
