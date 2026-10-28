
# -*- coding: utf-8 -*-
"""ensure-ILE 品牌字标生成器：en∫ure + -ILE 锁定件 + 方形 mark + 托盘图标。

三种风格：
  geometric  几何无衬线（等粗、正圆、平切端点）—— 界面/产品名主选
  serif      衬线（轮廓取自仓库自带 ILE Song / Source Han Serif）
  mono       等宽技术体（固定字宽、方肩、斜杆带脚）—— 小尺寸 cut

产出纯矢量稿（只有 path，无 <style>、无字体依赖）。
本脚本只写 docs/design/brand/.raw/ 下的中间产物（raw/*.svg 与 manifest.json）；
最终 viewBox 由 render.mjs 按实测墨迹包围盒收紧。
"""
import json, math, os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.misc.transform import Transform
from fontTools.pens.boundsPen import BoundsPen

os.chdir(os.path.dirname(os.path.abspath(__file__)))   # 相对路径从本文件所在目录算

INK = '#17191B'
BLUE = '#4D6BFE'
RAW = '.raw/raw'

def n2(v):
    v = round(v, 2)
    if v == int(v):
        return str(int(v))
    return format(v, '.2f').rstrip('0').rstrip('.')

def xy(x, y):
    return n2(x) + ' ' + n2(y)

def arc(cx, cy, rx, ry, a0, a1):
    """按 a0 → a1 的有向扫掠（可以为负）拆成 <=90 度的三次贝塞尔。"""
    span = math.radians(a1 - a0)
    n = max(1, int(math.ceil(abs(span) / (math.pi / 2) - 1e-9)))
    step = span / n
    k = 4.0 / 3.0 * math.tan(step / 4.0)
    a = math.radians(a0)
    x0 = cx + rx * math.cos(a)
    y0 = cy + ry * math.sin(a)
    out = ''
    for _ in range(n):
        b = a + step
        x1 = cx + rx * math.cos(b)
        y1 = cy + ry * math.sin(b)
        c1x, c1y = x0 + k * (-rx * math.sin(a)), y0 + k * (ry * math.cos(a))
        c2x, c2y = x1 - k * (-rx * math.sin(b)), y1 - k * (ry * math.cos(b))
        out += ' C' + xy(c1x, c1y) + ' ' + xy(c2x, c2y) + ' ' + xy(x1, y1)
        x0, y0, a = x1, y1, b
    return out

def bez(p0, c1, c2, p1):
    return ' C' + xy(c1[0], c1[1]) + ' ' + xy(c2[0], c2[1]) + ' ' + xy(p1[0], p1[1])

def stroke_part(d, w, cap='butt'):
    return {'d': d, 'w': w, 'cap': cap, 'mode': 'stroke'}

def integral_s(d, w, cx, cy, h, reach, reach_bot=None, hook_cap='butt'):
    """∫ 中线：上端起于右上、下端止于左下，端点水平相切（butt cap 是竖直的细边）。
    h = 墨迹高；reach = 上钩水平伸出；reach_bot = 下钩水平伸出（默认同上）。
    两个钩子刻意不对称：上钩长、下钩短 —— 下钩短才不钻到前一个字母的竖杆脚下。"""
    rb = reach if reach_bot is None else reach_bot
    t = h / 2.0 - w / 2.0
    top_y, bot_y = cy - t, cy + t
    x0 = cx + reach
    x1 = cx - rb
    d += 'M' + xy(x0, top_y)
    d += bez((x0, top_y), (x0 - reach * 0.5, top_y), (cx, cy - t * 0.645), (cx, cy))
    d += bez((cx, cy), (cx, cy + t * 0.645), (x1 + rb * 0.5, bot_y), (x1, bot_y))
    return d

# ---------------------------------------------------------------- 几何无衬线
XA, WA = 100.0, 16.0

def ga_e():
    cx, cy, r = 50.0, -50.0, 42.0
    gap0, gap1 = 26.0, 76.0
    d = 'M' + xy(cx + r * math.cos(math.radians(gap1)), cy + r * math.sin(math.radians(gap1)))
    d += arc(cx, cy, r, r, gap1, gap0 + 360.0)
    d += 'M8.05 -48 L91.95 -48'
    return {'adv': 112.0, 'parts': [stroke_part(d, WA)]}

def ga_n():
    # 拱顶中线 -67-25 = -92，加半笔才落在 x-height -100 上（不是把中线放在 -100）
    return {'adv': 76.0, 'parts': [stroke_part('M8 0 L8 -67' + arc(33, -67, 25, 25, 180, 360) + ' L58 0', WA)]}

def ga_u():
    # 碗底中线 -33+25 = -8，加半笔落在基线 0（无降部）
    return {'adv': 78.0, 'parts': [stroke_part('M8 -100 L8 -33' + arc(33, -33, 25, 25, 180, 0) + ' L58 -100', WA)]}

def ga_r():
    """r 的臂伸到 50，advance 只给 46（负侧距）：u/e 的竖杆要掖到臂下面，才是几何无衬线的读法。
    臂顶中线 -59-33 = -92，墨迹顶与 n/u/e 同一条线。"""
    return {'adv': 46.0, 'parts': [
        stroke_part('M8 0 L8 -100', WA),
        stroke_part('M8 -59' + arc(41, -59, 33, 33, 180, 270) + ' L50 -92', WA)]}

def ga_int():
    """∫ 是唯一同时有升部和降部的字形：墨迹高 148 = 1.48× x-height，上下各溢出 24，
    钩尖的 butt cap 高 16，离相邻字母的 x-height 线还留 16 净空。
    钩子不对称（上 26 / 下 16）：下钩短才不钻到 n 右杆的脚下（水平净空 11、垂直 16）。
    shift -11 把竖杆摆到 n 右杆与 u 左杆之间。"""
    return {'adv': 32.0, 'shift': -11.0,
            'parts': [stroke_part(integral_s('', WA, 28.0, -50.0, 148.0, 26.0, 16.0), WA)]}

# ---------------------------------------------------------------- 等宽技术体
XC, WC, ADV, CR = 92.0, 17.0, 92.0, 16.0

SL, SR = 8.0 + WC / 2.0, ADV - 8.0 - WC / 2.0   # 左右竖杆中线（字格内留 8 侧距）

HTOP = -(XC - WC / 2.0)          # 横画中线：+ 半笔 = x-height
HBOT = -WC / 2.0                  # 横画中线：+ 半笔 = 基线
CTOP = HTOP + CR                 # 上肩圆角起点
CBOT = HBOT - CR                 # 下肩圆角起点

def gc_n():
    d = 'M' + n2(SL) + ' 0 L' + n2(SL) + ' ' + n2(CTOP)
    d += arc(SL + CR, CTOP, CR, CR, 180, 270)
    d += ' L' + xy(SR - CR, HTOP)
    d += arc(SR - CR, CTOP, CR, CR, 270, 360)
    d += ' L' + xy(SR, 0)
    return {'adv': ADV, 'parts': [stroke_part(d, WC)]}

def gc_u():
    d = 'M' + n2(SL) + ' ' + n2(-XC) + ' L' + n2(SL) + ' ' + n2(CBOT)
    d += arc(SL + CR, CBOT, CR, CR, 180, 90)
    d += ' L' + xy(SR - CR, HBOT)
    d += arc(SR - CR, CBOT, CR, CR, 90, 0)
    d += ' L' + xy(SR, -XC)
    return {'adv': ADV, 'parts': [stroke_part(d, WC)]}

def gc_e():
    cx, cy = ADV / 2.0, -XC / 2.0
    rx, ry = (SR - SL) / 2.0, XC / 2.0 - WC / 2.0
    gap0, gap1 = 22.0, 74.0
    d = 'M' + xy(cx + rx * math.cos(math.radians(gap1)), cy + ry * math.sin(math.radians(gap1)))
    d += arc(cx, cy, rx, ry, gap1, gap0 + 360.0)
    d += 'M' + xy(SL, cy) + ' L' + xy(SR, cy)
    return {'adv': ADV, 'parts': [stroke_part(d, WC)]}

def gc_r():
    rr = 46.0 - SL
    arm_y = HTOP + rr            # 臂顶中线 = HTOP，墨迹顶与 e/n/u 同线
    return {'adv': ADV, 'parts': [
        stroke_part('M' + n2(SL) + ' 0 L' + n2(SL) + ' ' + n2(-XC), WC),
        stroke_part('M' + n2(SL) + ' ' + n2(arm_y) + arc(46.0, arm_y, rr, rr, 180, 270) + ' L76 ' + n2(HTOP), WC)]}

def gc_int():
    cx = ADV / 2.0
    h = XC * 1.15
    top, bot = -(XC / 2.0) - h / 2.0, -(XC / 2.0) + h / 2.0
    # 斜杆拉大（36）让 x-height 处也有可见倾角，平脚 18 把墨迹撑到 72 宽，字格里不孤立
    slant, flag = 36.0, 18.0
    d = 'M' + xy(cx + flag + slant / 2.0, top) + ' L' + xy(cx + slant / 2.0, top)
    d += ' L' + xy(cx - slant / 2.0, bot) + ' L' + xy(cx - flag - slant / 2.0, bot)
    return {'adv': ADV, 'parts': [stroke_part(d, WC)]}

# ---------------------------------------------------------------- 衬线（字体轮廓）
FONT = '../../../dsh-plugin-desktop/src/native-ui/assets/fonts/source-han-serif-subset.woff2'
_f = TTFont(FONT)
_gs = _f.getGlyphSet()
_cmap = _f.getBestCmap()
S0 = 100.0 / _f['OS/2'].sxHeight

def font_bounds(ch):
    bp = BoundsPen(_gs)
    _gs[_cmap[ord(ch)]].draw(bp)
    return bp.bounds

def f4(v):
    return format(round(v, 5), '.5f').rstrip('0').rstrip('.')

def font_path(ch):
    """字形轮廓，font units 原样（y 向上）。y 翻转交给外层 <g scale(s -s)>，避免翻两次。"""
    pen = SVGPathPen(_gs, ntos=n2)
    _gs[_cmap[ord(ch)]].draw(pen)
    return pen.getCommands()

# ---------------------------------------------------------------- 排字
def emit(parts, color):
    out = ''
    for p in parts:
        if p['mode'] == 'fill':
            b = p.get('bump') or 0.0
            extra = (' stroke="' + color + '" stroke-width="' + n2(b) + '" stroke-linejoin="round"') if b else ''
            out += '<path fill="' + color + '"' + extra + ' d="' + p['d'] + '"/>'
        else:
            out += ('<path fill="none" stroke="' + color + '" stroke-width="' + n2(p['w'])
                    + '" stroke-linecap="' + p['cap'] + '" stroke-linejoin="round" d="' + p['d'] + '"/>')
    return out

def place(glyphs, x0, color):
    """glyphs: [(glyph, adv)]，用 <g translate> 摆放（glyph 可选 shift 微调）。"""
    out = ''
    x = x0
    for g, adv in glyphs:
        out += '<g transform="translate(' + n2(x + g.get('shift', 0.0)) + ' 0)">' + emit(g['parts'], color) + '</g>'
        x += adv
    return out, x

# --- A 组
def wordmark_a(color, ile=None, ile_color=None):
    seq = [ga_e(), ga_n(), ga_int(), ga_u(), ga_r(), ga_e()]
    advs = [112.0, 76.0, 56.0, 78.0, 60.0, 0.0]
    body, x = place(list(zip(seq, advs)), 0.0, color)
    ink_w = x + 100.0  # 最后一个 e 的墨迹宽 100（adv 记 0，末尾补）
    if ile == 'smallcaps':
        body += ile_block_a(ink_w + 44.0, color if ile_color is None else ile_color)
    elif ile == 'rule':
        body += rule(ink_w + 30.0, 78.0, 7.0, color if ile_color is None else ile_color)
        body += ile_block_a(ink_w + 30.0 + 7.0 + 30.0, color if ile_color is None else ile_color)
    return body, ink_w

def gl(parts, adv):
    return ({'parts': parts}, adv)

def ile_block_a(x0, color):
    """小体大写 ILE：高 72（0.72 x-height 强）、笔画 14、字距 12。"""
    W, H, T = 14.0, 72.0, 12.0
    h = W / 2.0
    i_stem = 'M' + n2(h) + ' 0 L' + n2(h) + ' ' + n2(-H)
    l_stem = 'M' + n2(h) + ' ' + n2(-H) + ' L' + n2(h) + ' ' + n2(-h) + ' L42 ' + n2(-h)
    e_stem = 'M' + n2(h) + ' ' + n2(-H) + ' L' + n2(h) + ' ' + n2(-h)
    arms = ['M0 ' + n2(-(H - h)) + ' L40 ' + n2(-(H - h)),
            'M0 ' + n2(-H / 2.0) + ' L34 ' + n2(-H / 2.0),
            'M0 ' + n2(-h) + ' L42 ' + n2(-h)]
    glyphs = [
        gl([stroke_part(i_stem, W)], W + T),
        gl([stroke_part(l_stem, W)], 42.0 + T),
        gl([stroke_part(e_stem, W)] + [stroke_part(a, W) for a in arms], 42.0),
    ]
    body, _ = place(glyphs, x0, color)
    return body

def rule(x, h, w, color):
    return ('<g transform="translate(' + n2(x) + ' 0)"><path fill="none" stroke="' + color
            + '" stroke-width="' + n2(w) + '" stroke-linecap="butt" d="M' + n2(w / 2) + ' '
            + n2(-h) + ' L' + n2(w / 2) + ' 0"/></g>')

# --- C 组
def wordmark_c(color, ile=None, ile_color=None):
    seq = [gc_e(), gc_n(), gc_int(), gc_u(), gc_r(), gc_e()]
    advs = [ADV, ADV, ADV, ADV, ADV, 0.0]
    body, x = place(list(zip(seq, advs)), 0.0, color)
    ink_w = x + 84.0   # 末字 e 的墨迹右边 = 字格起点 + 84
    if ile == 'smallcaps':
        body += ile_block_c(ink_w + 30.0, color if ile_color is None else ile_color)
    elif ile == 'rule':
        body += rule(ink_w + 22.0, 74.0, 8.0, color if ile_color is None else ile_color)
        body += ile_block_c(ink_w + 22.0 + 8.0 + 22.0, color if ile_color is None else ile_color)
    return body, ink_w

def ile_block_c(x0, color):
    """等宽小体大写 ILE：高 66、笔画 15、沿用 92 字格（monospace 感来自固定字宽）。"""
    W, H = 15.0, 66.0
    stem = 30.0
    xl = stem - W / 2.0
    glyphs = [
        gl([stroke_part('M46 0 L46 ' + n2(-H), W)], ADV),
        gl([stroke_part('M' + n2(stem) + ' ' + n2(-H) + ' L' + n2(stem) + ' ' + n2(-W / 2)
                        + ' L62 ' + n2(-W / 2), W)], ADV),
        gl([stroke_part('M' + n2(stem) + ' ' + n2(-(H - W / 2)) + ' L' + n2(stem) + ' ' + n2(-W / 2), W),
            stroke_part('M' + n2(xl) + ' ' + n2(-(H - W / 2)) + ' L60 ' + n2(-(H - W / 2)), W),
            stroke_part('M' + n2(xl) + ' ' + n2(-H / 2) + ' L54 ' + n2(-H / 2), W),
            stroke_part('M' + n2(xl) + ' ' + n2(-W / 2) + ' L62 ' + n2(-W / 2), W)], ADV),
    ]
    body, _ = place(glyphs, x0, color)
    return body

# --- B 组（衬线）
def wordmark_b(color, ile=None, ile_color=None):
    s = S0
    order = ['e', 'n', None, 'u', 'r', 'e']
    int_ink = 152.0
    k_int = int_ink / (font_bounds('\u222b')[3] - font_bounds('\u222b')[1])
    # 字体里 ∫ 的墨迹只有 59.6 宽，但它是全字标唯一的双极字形：给 ±7 的额外侧距，
    # 否则钩子在投影上贴住 n / u（1024 渲染下只剩 2px 空档）。
    int_adv = 74.0
    body = ''
    x = 0.0
    for ch in order:
        if ch is None:
            bb = font_bounds('\u222b')
            w_ink = (bb[2] - bb[0]) * k_int
            tx = x + (int_adv - w_ink) / 2.0 - bb[0] * k_int
            ty = 22.0 + bb[1] * k_int
            body += '<g transform="translate(' + n2(tx) + ' ' + n2(ty) + ') scale(' + f4(k_int) + ' ' + f4(-k_int) + ')">'
            body += '<path fill="' + color + '" d="' + font_path('\u222b') + '"/></g>'
            x += int_adv
        else:
            body += '<g transform="translate(' + n2(x) + ' 0) scale(' + f4(s) + ' ' + f4(-s) + ')">'
            body += '<path fill="' + color + '" d="' + font_path(ch) + '"/></g>'
            x += _f['hmtx'][_cmap[ord(ch)]][0] * s
    ink_w = x
    if ile == 'smallcaps':
        body += ile_block_b(ink_w + 44.0, color if ile_color is None else ile_color)
    elif ile == 'rule':
        body += rule(ink_w + 30.0, 80.0, 7.0, color if ile_color is None else ile_color)
        body += ile_block_b(ink_w + 30.0 + 7.0 + 30.0, color if ile_color is None else ile_color)
    return body, ink_w

def ile_block_b(x0, color):
    s = S0 * 0.72
    bump = 1.3
    body = ''
    x = x0
    for ch in ['I', 'L', 'E']:
        body += '<g transform="translate(' + n2(x) + ' 0) scale(' + f4(s) + ' ' + f4(-s) + ')">'
        body += ('<path fill="' + color + '" stroke="' + color + '" stroke-width="' + n2(bump / s)
                 + '" stroke-linejoin="round" d="' + font_path(ch) + '"/></g>')
        x += _f['hmtx'][_cmap[ord(ch)]][0] * s + 8.0
    return body

# ---------------------------------------------------------------- 方形 mark
TILE = 1024.0
RADIUS = 230.0

def tile(inner, bg=BLUE):
    return ('<rect width="' + n2(TILE) + '" height="' + n2(TILE) + '" rx="' + n2(RADIUS)
            + '" fill="' + bg + '"/>' + inner)

def mark_a(color='#FFFFFF'):
    h, w, reach = 640.0, 100.0, 166.0
    d = integral_s('', w, TILE / 2.0, TILE / 2.0, h, reach)
    return tile(emit([stroke_part(d, w)], color))

def mark_c(color='#FFFFFF'):
    h, w, slant, flag = 620.0, 104.0, 120.0, 78.0
    cx, cy = TILE / 2.0, TILE / 2.0
    top, bot = cy - h / 2.0, cy + h / 2.0
    d = 'M' + xy(cx + flag + slant / 2.0, top) + ' L' + xy(cx + slant / 2.0, top)
    d += ' L' + xy(cx - slant / 2.0, bot) + ' L' + xy(cx - flag - slant / 2.0, bot)
    return tile(emit([stroke_part(d, w)], color))

def mark_b(color='#FFFFFF'):
    bb = font_bounds('\u222b')
    h_ink = 660.0
    k = h_ink / (bb[3] - bb[1])
    tx = TILE / 2.0 - (bb[0] + bb[2]) / 2.0 * k
    ty = TILE / 2.0 + (bb[1] + bb[3]) / 2.0 * k
    d = font_path('\u222b')
    return tile('<g transform="translate(' + n2(tx) + ' ' + n2(ty) + ') scale(' + f4(k) + ' ' + f4(-k) + ')">'
                + '<path fill="' + color + '" stroke="' + color + '" stroke-width="' + n2(62.0 / k)
                + '" stroke-linejoin="round" d="' + d + '"/></g>')

def mark_cjk(color='#FFFFFF'):
    """∫ + 因需 竖排下置：验证 16px 下 CJK 是否会糊成灰块。"""
    h, w, reach = 470.0, 84.0, 122.0
    cx = TILE / 2.0
    d = integral_s('', w, cx, 420.0, h, reach)
    inner = emit([stroke_part(d, w)], color)
    s = S0 * 1.0
    x = 240.0
    for ch in ['\u56e0', '\u9700']:
        inner += ('<g transform="translate(' + n2(x) + ' 860) scale(' + f4(s) + ' ' + f4(-s) + ')">'
                  + '<path fill="' + color + '" d="' + font_path(ch) + '"/></g>')
        x += 300.0
    return tile(inner)

# ---------------------------------------------------------------- 托盘（50×50）
def tray_a():
    w, h, reach = 5.0, 34.0, 7.0
    d = integral_s('', w, 25.0, 25.0, h, reach)
    return emit([stroke_part(d, w)], BLUE)

def tray_c():
    w, h, slant, flag = 5.0, 34.0, 7.0, 5.0
    top, bot = 25.0 - h / 2.0, 25.0 + h / 2.0
    d = 'M' + xy(25 + flag + slant / 2.0, top) + ' L' + xy(25 + slant / 2.0, top)
    d += ' L' + xy(25 - slant / 2.0, bot) + ' L' + xy(25 - flag - slant / 2.0, bot)
    return emit([stroke_part(d, w)], BLUE)

def tray_b(bump=0.0):
    bb = font_bounds('\u222b')
    h_ink = 36.0
    k = h_ink / (bb[3] - bb[1])
    tx = 25.0 - (bb[0] + bb[2]) / 2.0 * k
    ty = 25.0 + (bb[1] + bb[3]) / 2.0 * k
    return ('<g transform="translate(' + n2(tx) + ' ' + n2(ty) + ') scale(' + f4(k) + ' ' + f4(-k) + ')">'
            + '<path fill="' + BLUE + '" stroke="' + BLUE + '" stroke-width="' + n2(4.0 / k)
            + '" stroke-linejoin="round" d="' + font_path('\u222b') + '"/></g>')

# ---------------------------------------------------------------- 输出
def svg(width, height, body, fill_style=None):
    head = ('<svg xmlns="http://www.w3.org/2000/svg" width="' + n2(width) + '" height="' + n2(height)
            + '" viewBox="0 0 ' + n2(width) + ' ' + n2(height) + '">')
    return head + body + '</svg>'

def wrap(fill, stroke, inner):
    return ('<g fill="' + fill + '" stroke="' + stroke + '" stroke-linecap="butt" stroke-linejoin="round">'
            + inner + '</g>')

os.makedirs(RAW, exist_ok=True)
manifest = {}

def add(name, svg_text, pad, note):
    manifest[name] = {'pad': pad, 'note': note}
    path = os.path.join(RAW, name + '.svg')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'w', encoding='utf8').write(svg_text)

# 字标
for style, fn in (('geometric', wordmark_a), ('serif', wordmark_b), ('mono', wordmark_c)):
    for suffix, ile, ilec in (('', None, None), ('-ile-smallcaps', 'smallcaps', None), ('-ile-rule', 'rule', None)):
        body, w = fn(INK, ile, ilec)
        add('wordmark/' + style + suffix, svg(w + 8, 200, '<g transform="translate(4 170)">' + body + '</g>'), 6,
            'en∫ure' + (' + ILE (' + ile + ')' if ile else ''))
    body, w = fn(INK, 'smallcaps', BLUE)
    add('wordmark/' + style + '-ile-toned', svg(w + 8, 200, '<g transform="translate(4 170)">' + body + '</g>'), 6,
        'en∫ure + ILE，ILE 用品牌蓝区分')

# mark
add('mark/geometric', svg(TILE, TILE, mark_a()), 0, '∫ 白字 + 品牌蓝圆角底')
add('mark/serif', svg(TILE, TILE, mark_b()), 0, '∫ 衬线（Source Serif 轮廓加粗）')
add('mark/mono', svg(TILE, TILE, mark_c()), 0, '∫ 斜杆带脚（等宽技术体）')
add('mark/geometric-cjk', svg(TILE, TILE, mark_cjk()), 0, '∫ + 因需（对照：小尺寸会糊）')

# 托盘：50×50，固定品牌蓝
for name, inner in (('geometric', tray_a()), ('mono', tray_c()), ('serif', tray_b())):
    add('tray/' + name, svg(50, 50, wrap(BLUE, BLUE, inner)), 'square', '托盘 16/32 单色 ∫（保持 50×50 画布）')
add('tray/geometric-template', svg(50, 50, wrap('#000000', '#000000', tray_a())), 'square',
    'Template 版（黑），仅供预览；正式产物由 generate-tray-icons.mjs 换色')

json.dump(manifest, open('.raw/manifest.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)

# 度量报告
rep = {
    # A：∫ 墨迹 148（1.48×x-height），上钩 26 / 下钩 16 不对称，墨迹宽 42
    'A': {'xheight': XA, 'stroke': WA, 'int_ink_h': 148.0, 'int_ink_w': 42.0,
          'int_ratio_to_x': 1.48, 'int_reach': [26.0, 16.0], 'stroke_pct_of_x': WA / XA},
    # B：字体原轮廓缩到墨迹 152（1.52×x-height），笔画由字体决定（与相邻字母同源）
    'B': {'xheight': 100.0, 'stroke_source': 'Source Han Serif (ILE Song)',
          'int_ink_h': 152.0, 'int_ratio_to_x': 1.52},
    # C：中心线高 105.8 + 笔画 17 = 墨迹 122.8（1.335×x-height），斜杆 slant 36 / 平脚 18
    'C': {'xheight': XC, 'stroke': WC, 'advance': ADV, 'int_ink_h': XC * 1.15 + WC,
          'int_ratio_to_x': round((XC * 1.15 + WC) / XC, 3), 'stroke_pct_of_x': WC / XC},
}
json.dump(rep, open('.raw/metrics.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print('raw svg:', len(manifest))
print(json.dumps(rep, ensure_ascii=False, indent=1))
