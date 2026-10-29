// 生成 Windows 侧的图标产物：JetBrains 风格的应用图标 + 纯色托盘 ∫
// 源几何来自 geometric 版的 ∫ 曲线（stroke-width 100 / 1024 画布），这里把它转成填充轮廓，
// 因为托盘生成器要求 tray-icon.svg 里有 fill="#4D6BFE"。
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'

const here = import.meta.dirname
const root = resolve(here, '..', '..', '..')
const sharp = createRequire(join(root, 'dsh-plugin-desktop/package.json'))('sharp')

const BLUE = '#4D6BFE'
const DEEP = '#2A2F8F'
const LIGHT = '#5B79FF'

// ∫ 的两段三次贝塞尔（与 mark/geometric.svg 同一条曲线）
const CURVES = [
  [[678, 242], [595, 242], [512, 337.85], [512, 512]],
  [[512, 512], [512, 686.15], [429, 782], [346, 782]],
]

function cubic(p0, p1, p2, p3, t) {
  const u = 1 - t
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]
}

// 把描边转成填充：沿曲线逐点取法线，两侧各偏 half，首尾平切
function outline(half, steps) {
  steps = steps || 96
  const pts = []
  CURVES.forEach(function (c, i) {
    for (let k = i === 0 ? 0 : 1; k <= steps; k++) pts.push(cubic(c[0], c[1], c[2], c[3], k / steps))
  })
  const left = [], right = []
  for (let i = 0; i < pts.length; i++) {
    const pt = pts[i]
    const prev = pts[Math.max(0, i - 1)]
    const next = pts[Math.min(pts.length - 1, i + 1)]
    let dx = next[0] - prev[0], dy = next[1] - prev[1]
    const len = Math.hypot(dx, dy) || 1
    dx /= len; dy /= len
    left.push([pt[0] - dy * half, pt[1] + dx * half])
    right.push([pt[0] + dy * half, pt[1] - dx * half])
  }
  const ring = left.concat(right.reverse())
  return ring.map(function (q) { return [Math.round(q[0] * 100) / 100, Math.round(q[1] * 100) / 100] })
}

const f = function (n) { return Math.round(n * 100) / 100 }
const toPath = function (ring) { return "M" + ring.map(function (q) { return f(q[0]) + " " + f(q[1]) }).join(" L") + " Z" }

// ---- 应用图标：圆角方块 + 斜向渐变 + 白色 ∫ + 底部白条（JetBrains 产品图标那套结构）
const HALF = 50
const GLYPH_SCALE = 0.875
const GLYPH_CY = 472

function appIconSvg() {
  const ring = outline(HALF).map(function (q) {
    return [512 + (q[0] - 512) * GLYPH_SCALE, GLYPH_CY + (q[1] - 512) * GLYPH_SCALE]
  })
  const glyph = toPath(ring)
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">',
    '<defs>',
    '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">',
    '<stop offset="0" stop-color="' + LIGHT + '"/><stop offset="1" stop-color="' + DEEP + '"/>',
    '</linearGradient>',
    '<radialGradient id="gloss" cx="0.18" cy="0.12" r="0.85">',
    '<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.16"/><stop offset="0.55" stop-color="#FFFFFF" stop-opacity="0.03"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>',
    '</radialGradient>',
    '</defs>',
    '<rect width="1024" height="1024" rx="230" fill="url(#bg)"/>',
    '<rect width="1024" height="1024" rx="230" fill="url(#gloss)"/>',
    '<path d="' + glyph + '" fill="#FFFFFF"/>',
    '<rect x="348" y="812" width="328" height="52" rx="26" fill="#FFFFFF"/>',
    '</svg>',
  ].join('\n')
}

// ---- 托盘：纯 ∫，50×50
function traySvg() {
  const ring = outline(HALF * 40 / 640).map(function (q) {
    return [25 + (q[0] - 512) * (40 / 640), 25 + (q[1] - 512) * (40 / 640)]
  })
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 50 50">',
    '<path d="' + toPath(ring) + '" fill="' + BLUE + '"/>',
    '</svg>',
  ].join('\n')
}

const appSvg = appIconSvg()
const traySvgText = traySvg()
writeFileSync(join(here, 'mark', 'geometric-app.svg'), appSvg)
writeFileSync(join(here, 'tray', 'geometric.svg'), traySvgText)

const build = join(root, 'dsh-plugin-desktop', 'build')
mkdirSync(join(build, 'icons'), { recursive: true })

// app-icon.png：1024 RGBA16 + ICC，ico 生成器要求这个形状
await sharp(Buffer.from(appSvg))
  .toColourspace('rgb16')
  .withMetadata({ icc: 'srgb' })
  .png({ compressionLevel: 9 })
  .toFile(join(build, 'app-icon.png'))

const sizes = [16, 32, 48, 64, 128, 256, 512, 1024]
sizes.reduce(async function (prev, size) {
  await prev
  await sharp(Buffer.from(appSvg))
    .resize({ width: size, height: size, fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9 })
    .toFile(join(build, 'icons', size + 'x' + size + '.png'))
}, Promise.resolve())

writeFileSync(join(build, 'tray-icon.svg'), traySvgText)

// 自检：打印 32 / 16 的灰度轮廓，判断小尺寸还看不看得出 ∫
for (const size of [32, 16]) {
  const png = await sharp(Buffer.from(appSvg)).resize(size, size, { fit: 'fill' }).greyscale().raw().toBuffer()
  const rows = []
  for (let y = 0; y < size; y++) {
    let line = ''
    for (let x = 0; x < size; x++) {
      const v = png[y * size + x]
      line += v > 200 ? '#' : v > 120 ? '+' : v > 60 ? '.' : ' '
    }
    rows.push(line)
  }
  console.log('--- ' + size + 'px\n' + rows.join('\n'))
}
const meta = await sharp(join(build, 'app-icon.png')).metadata()
console.log('app-icon.png', meta.width + 'x' + meta.height, meta.space, meta.depth, meta.channels, 'icc=' + (meta.icc ? meta.icc.length : 'none'))
