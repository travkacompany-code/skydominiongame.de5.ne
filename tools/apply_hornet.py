# Вшивает ІІ «Хорнет» (етап 7.52) і в src, і в готовий dist/game_ultra.html — ОДНАКОВИМИ правками.
# dist містить ручні пост-правки, яких нема в src, тому його не перезбираємо, а патчимо.
# Ідемпотентний: повторний запуск нічого не міняє. Кожен якір має зустрічатися рівно 1 раз, інакше — помилка.
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
rd = lambda p: open(p, encoding='utf-8').read()
wr = lambda p, s: open(p, 'w', encoding='utf-8').write(s)

GLUE = rd('tools/hornet_glue.js').rstrip('\n') + '\n'
MODULE = rd('src/js/02b_hornet_ai.js')

def once(s, a, b, what):
    n = s.count(a)
    if n != 1:
        sys.exit(f'ПОМИЛКА: якір «{what}» знайдено {n} разів (очікувався 1) — файл не змінено')
    return s.replace(a, b)

def patch_game(s):
    if 'function hornetBegin(' in s:
        return s, False
    # 1) характеристика зброї: Хорнет — з ІІ
    s = once(s, 'edge: true, dmg: 1.5, spd: "Низька", rng: "Низька", man: "Висока", img: ["hornet"]',
                'edge: true, ai: true, dmg: 1.5, spd: "Низька", rng: "Низька", man: "Висока", img: ["hornet"]', 'WEAPONS.hornet')
    # 2) після прольоту маршруту дрон не б'є «у точку», а переходить до автономного пошуку
    a = '''r.meta = Object.assign({}, r.meta, { lo: 1, target: "Розвідка над ціллю: " + (r.meta.target || "") }); };
  }
  return u;'''
    s = once(s, a, a.replace('  return u;', '  if (W.ai) u.onEnd = r => hornetBegin(r, W);        // етап 7.52: ІІ-дрон шукає ціль у районі сам\n  return u;'), 'spawnWeapon: onEnd')
    # 3) крок симуляції
    s = once(s, 'if (u.loiter){ loiterStep(u, sd); return; }',
                'if (u.loiter){ loiterStep(u, sd); return; }\n  if (u.ai){ hornetStep(u, sd); return; }', 'stepUnit')
    # 4) висота моделі: ІІ-дрон кружляє на висоті пошуку, при атаці знижується
    s = once(s, '        else if (u.loiter || (u.meta && u.meta.lo)) h = 0.75;',
                '        else if (u.ai) h = u.ai.h;                                                                                    // етап 7.52: ІІ-дрон — висота за станом (пошук / пікірування)\n        else if (u.loiter || (u.meta && u.meta.lo)) h = 0.75;', 'renderUnits: висота')
    # 5) сам блок (перед розвідником)
    marker = '/* ---------- етап 7.14: розвідувальний БпЛА кружляє над ціллю (r ≈ 4 км), доки є запас ходу; далі — падає ---------- */'
    s = once(s, marker, GLUE + marker, 'блок ІІ')
    return s, True

changed = []
# --- src ---
g = rd('src/js/03_game.js'); g2, ch = patch_game(g)
if ch: wr('src/js/03_game.js', g2); changed.append('src/js/03_game.js')
wr('src/js/02b_hornet_ai.js', MODULE)
h = rd('src/index.html')
tag = '<script>@@F:js/02b_hornet_ai.js@@</script>\n'
if '02b_hornet_ai.js' not in h:
    h = once(h, '<script id="bvBoot">', tag + '<script id="bvBoot">', 'index.html: bvBoot'); wr('src/index.html', h); changed.append('src/index.html')
# --- dist ---
if os.path.exists('dist/game_ultra.html'):
    d = rd('dist/game_ultra.html'); d, ch = patch_game(d)
    blk = '<script id="bvHornetAI">' + MODULE + '</script>\n'
    if 'id="bvHornetAI"' not in d:
        d = once(d, '<script id="bvBoot">', blk + '<script id="bvBoot">', 'dist: bvBoot'); ch = True
    else:                                   # модуль уже є — оновлюємо до поточної версії
        i = d.index('<script id="bvHornetAI">'); j = d.index('</script>\n', i) + len('</script>\n')
        if d[i:j] != blk: d = d[:i] + blk + d[j:]; ch = True
    if ch: wr('dist/game_ultra.html', d); changed.append('dist/game_ultra.html')
print('змінено:', ', '.join(changed) if changed else 'нічого (вже застосовано)')
