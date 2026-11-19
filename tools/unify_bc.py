# Генератор: перефарбовує старе чорно-червоне сімейство «Арсенал / Торговельний майданчик / SKYCOIN» (.bc-*, .bx-*, .tp-*) у палітру BV2 (темно-синій + синій/золотий).
# python3 tools/unify_bc.py  → src/css/141_unify_shop.css (із 00_style.css). Правила з .ru (сторона РФ) і rgba(var(--sc)) (рідкість) не чіпаємо.
import re, os, sys
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
src = open('src/css/00_style.css', encoding='utf8').read()
src = re.sub(r'/\*[\s\S]*?\*/', '', src)
SEL = re.compile(r'\.bc-|#bc[A-Z]|\.bx-|\.tp-')
MAP = [  # (regex, заміна) — порядок важливий
    (r'rgba\(\s*255\s*,\s*59\s*,\s*48\s*,', 'rgba(47,140,255,'),
    (r'rgba\(\s*255\s*,\s*(?:90|40)\s*,\s*(?:80|30)\s*,', 'rgba(255,197,61,'),
    (r'rgba\(\s*120\s*,\s*14\s*,\s*8\s*,', 'rgba(24,70,160,'),
    (r'rgba\(\s*60\s*,\s*12\s*,\s*8\s*,', 'rgba(14,40,90,'),
    (r'rgba\(\s*(?:13|8|10)\s*,\s*(?:14|9|11)\s*,\s*(?:17|11|14)\s*,', 'rgba(8,20,42,'),
    (r'rgba\(\s*5\s*,\s*6\s*,\s*8\s*,', 'rgba(3,8,19,'),
    (r'#ff5a4[de]\b', '#4d9bff'), (r'#c81e14\b', '#1c55c2'), (r'#ff6a5c\b', '#4cc3ff'),
    (r'#ff3b30\b', '#ffc53d'), (r'var\(--red\)', '#ffc53d'),
    (r'#c8261c\b', '#ffc53d'), (r'#8f130b\b', '#b87400'),
    (r'#ff(?:8f87|9a92)\b', '#8fc4ff'), (r'#f1d4d1\b', '#d6e6ff'),
    (r'#(?:0d0e11|0b0c0e)\b', '#0a1426'),
    (r'#(?:3a2a2a|2a2d32)\b', '#1c3a6a'),
    (r'#(?:9aa1a8|8e959c|8a9199|7d848b)\b', '#93a8c8'), (r'#(?:c9ced4|c8cdd3|d4d8dd)\b', '#c2d2ea'),
]
def conv(v):
    for a, b in MAP: v = re.sub(a, b, v)
    return v
def rules(text):
    """повертає список (at-обгортка|None, селектор, тіло) з урахуванням одного рівня @media"""
    out, i, n = [], 0, len(text)
    while i < n:
        j = text.find('{', i)
        if j < 0: break
        head = text[i:j].strip()
        depth, k = 1, j + 1
        while k < n and depth:
            depth += (text[k] == '{') - (text[k] == '}'); k += 1
        body = text[j + 1:k - 1]
        if head.startswith('@media') or head.startswith('@supports'):
            for s, b in re.findall(r'([^{}]+)\{([^{}]*)\}', body): out.append((head, s.strip(), b))
        elif head.startswith('@'): pass
        else: out.append((None, head, body))
        i = k
    return out
res, seen = [], 0
for wrap, sel, body in rules(src):
    if not SEL.search(sel): continue
    if re.search(r'\.ru\b', sel) or 'var(--sc)' in body: continue
    nb = conv(body)
    if nb == body: continue
    # зберігаємо лише декларації, що змінились
    od = [d.strip() for d in re.split(r';(?![^(]*\))', body) if d.strip()]; nd = [d.strip() for d in re.split(r';(?![^(]*\))', nb) if d.strip()]
    ch = [b for a, b in zip(od, nd) if a != b]
    if '#b87400' in nb and not re.search(r'(^|;)\s*color:', nb) is None: pass
    if '#b87400' in nb: ch.append('color:#1b1300')      # золота кнопка — темний текст, як у BV2
    if not ch: continue
    sels = ','.join('html body ' + s.strip() for s in sel.split(','))
    res.append((wrap, sels + '{' + ';'.join(ch) + '}')); seen += 1
css = ['/* SKYDOMINION — єдиний стиль: сімейство магазину/арсеналу/SKYCOIN у палітрі BV2 (згенеровано tools/unify_bc.py з 00_style.css) */']
cur = None
for wrap, r in res:
    if wrap != cur:
        if cur: css.append('}')
        if wrap: css.append(wrap + '{')
        cur = wrap
    css.append(r)
if cur: css.append('}')
open('src/css/141_unify_shop.css', 'w', encoding='utf8').write('\n'.join(css) + '\n')
print('правил:', seen, 'байт:', len('\n'.join(css)))
