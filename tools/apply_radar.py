# Вшивает РЛС (етап 7.55) і в src, і в готовий dist/game_ultra.html — ОДНАКОВИМИ правками (як apply_hornet.py).
# dist містить ручні пост-правки, яких нема в src, тому його не перезбираємо, а патчимо.
# Ідемпотентний: клей вже вшитий → лише оновлюємо модуль. Кожен якір має зустрічатися рівно 1 раз, інакше — помилка.
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
rd = lambda p: open(p, encoding='utf-8').read()
wr = lambda p, s: open(p, 'w', encoding='utf-8').write(s)
GLUE = rd('tools/radar_glue.js').rstrip('\n') + '\n'
MODULE = rd('src/js/02c_radar.js')

def once(s, a, b, what):
    n = s.count(a)
    if n != 1:
        sys.exit(f'ПОМИЛКА: якір «{what}» знайдено {n} разів (очікувався 1) — файл не змінено')
    return s.replace(a, b)

def patch_game(s):
    if 'var RAD = {' in s:
        # клей вже є — оновлюємо його вміст між маркерами
        i = s.index('/* ---------- етап 7.55: РЛС'); j = s.index('setTimeout(radarPanel, 1600);\n', i) + len('setTimeout(radarPanel, 1600);\n')
        return (s[:i] + GLUE + s[j:], s[i:j] != GLUE)
    s = once(s, 'function ewReset(){ EW.st.length = 0;', 'function ewReset(){ radarReset(); EW.st.length = 0;', 'ewReset')
    s = once(s, 'function ewTick(sd){\n  if (!EW.st.length) return;', 'function ewTick(sd){\n  radarTick(sd);                                    // етап 7.55: РЛС\n  if (!EW.st.length) return;', 'ewTick')
    s = once(s, 'function ewRender(now){\n', 'function ewRender(now){\n  radarRender(now);                                 // етап 7.55: РЛС\n', 'ewRender')
    s = once(s, 'function ewStart(){\n  ewReset();', 'function ewStart(){\n  ewReset(); radarStart();', 'ewStart')
    s = once(s, 'if (EW.st.length) ewStrike(u, sd);', 'if (EW.st.length) ewStrike(u, sd);\n  if (RAD && RAD.sim && RAD.sim.stations.length) radarStrike(u, sd);', 'ewStrike')
    s = once(s, 'HOOKS.adSkip = adSkip;', 'HOOKS.adSkip = (u, T, t) => radarAdSkip(u, T, t) || adSkip(u, T, t);      // етап 7.55: ЗРК б\'ють лише за захопленням РЛС', 'HOOKS.adSkip')
    s = once(s, 'setTimeout(ewPanel, 1500);\n', 'setTimeout(ewPanel, 1500);\n' + GLUE, 'вставка блоку РЛС')
    return s, True

changed = []
g = rd('src/js/03_game.js'); g2, ch = patch_game(g)
if ch: wr('src/js/03_game.js', g2); changed.append('src/js/03_game.js')
h = rd('src/index.html'); tag = '<script>@@F:js/02c_radar.js@@</script>\n'
if '02c_radar.js' not in h:
    h = once(h, '<script id="bvBoot">', tag + '<script id="bvBoot">', 'index.html: bvBoot'); wr('src/index.html', h); changed.append('src/index.html')
if os.path.exists('dist/game_ultra.html'):
    d = rd('dist/game_ultra.html'); d, ch = patch_game(d)
    blk = '<script id="bvRadar">' + MODULE + '</script>\n'
    if 'id="bvRadar"' not in d:
        d = once(d, '<script id="bvBoot">', blk + '<script id="bvBoot">', 'dist: bvBoot'); ch = True
    else:
        i = d.index('<script id="bvRadar">'); j = d.index('</script>\n', i) + len('</script>\n')
        if d[i:j] != blk: d = d[:i] + blk + d[j:]; ch = True
    if ch: wr('dist/game_ultra.html', d); changed.append('dist/game_ultra.html')
print('змінено:', ', '.join(changed) if changed else 'нічого (вже застосовано)')
