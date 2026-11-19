# Авіація, етап 4 («BANGVECTOR 2 · етап 4»): вшиває src/js/02i_avia.js + tools/avia_glue.js і точкові правки
# в src/js/03_game.js, src/index.html та dist/skydominion.html (ідемпотентно).
#   python3 tools/apply_avia.py
# Кожен якір має зустрічатися рівно 1 раз, інакше — помилка й жоден файл не змінюється.
import re, os, sys
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
rd = lambda p: open(p, encoding='utf8').read()
wr = lambda p, s: open(p, 'w', encoding='utf8').write(s)

GLUE = rd('tools/avia_glue.js').rstrip() + '\n'
MARK = '/* avia:v1 */'
GLUE_END = 'window.BV_AVIA_API = HOOKS.avia;'
INSERT_AT = '  HOOKS.launchCfg = ser => doLaunch(launchDeser(ser));\n'

P = []
def p(old, new): P.append((old, new))

# --- такт симуляції: після РЛС / туману / ПУ
p('radarTick(sd); fogTick(sd); telTick(sd);',
  'radarTick(sd); fogTick(sd); telTick(sd); HOOKS.avTick && HOOKS.avTick(sd);      // BANGVECTOR 2 · етап 4: авіація')
# --- початок бою: аеродроми й стоянки
p('  ecoInit(); GAME.carCool = [];',
  '  ecoInit(); GAME.carCool = []; HOOKS.avInit && HOOKS.avInit();      // етап 4: аеродроми, стоянки')
# --- доступність носіїв: для авіації — стоянки обраного базування
p('  let air = 0; for (const u of units.values()) if (u.kind === "c" && u.key === cKey && u.sd === sd) air++;',
  '  if (HOOKS.avAvail && CARRIERS[cKey] && CARRIERS[cKey].kind === "air" && !CARRIERS[cKey].self && window.BV_AVIA && window.BV_AVIA.CFG.on) return HOOKS.avAvail(sd, cKey);      // етап 4\n'
  '  let air = 0; for (const u of units.values()) if (u.kind === "c" && u.key === cKey && u.sd === sd) air++;')
# --- втрата носія від ППО: група не чекає його
p('function atkCarLost(t, u){',
  'function atkCarLost(t, u){\n  if (t.avia){ t.avLost = true; HOOKS.avShot && HOOKS.avShot(t); }      // етап 4: авіагрупа + парк')
# --- план пуску: аеродром вильоту, обраний гравцем
p('      res.bases = bases; res.allZones = zones;',
  '      res.bases = bases; res.allZones = zones; avDepPick(res, s, C);      // етап 4: вибір аеродрому вильоту')
# --- пуск: авіація — через авіагрупи
p('    } else {\n      const C = plan.C, cap = carCap(C, key), nc = Math.ceil(n / cap);',
  '    } else if (plan.C.kind === "air" && !plan.C.self && avOn()){\n      if (!avLaunch(plan, key, cfg, n, ui)) return true;      // етап 4: авіагрупа з черги вильоту\n    } else {\n      const C = plan.C, cap = carCap(C, key), nc = Math.ceil(n / cap);')
# --- панель пуску: блок «Аеродроми» і вибір кнопками
p('    // 3. launch point',
  '    if (C && C.kind === "air" && !C.self && avOn()) h += AVX_block(side, cKey, s);      // етап 4\n    // 3. launch point')
p('    if (a === "close") return closeLaunch();',
  '    if (a === "close") return closeLaunch();\n    if (a === "avdep" || a === "avbase"){ avPick(a, b.dataset.v); return lpRender(); }      // етап 4')
# --- мережа: стоянки авіації в знімку для гостя
p('m.Td = rs && TEL.sim ? TEL.sim.depot[rs] : 0;      // етап 7.66: ПУ — лише те, що бачить сторона',
  'm.Td = rs && TEL.sim ? TEL.sim.depot[rs] : 0;      // етап 7.66: ПУ — лише те, що бачить сторона\n  if (window.BV_AVIA && window.BV_AVIA.CFG.on) m.AV = window.BV_AVIA.wire();      // етап 4: стоянки авіації')
p('TEL.guest = Array.isArray(m.T) ? m.T.map(telUnwire) : []; TEL.depotG = m.Td || null; TEL.dirty = true;      // етап 7.66',
  'TEL.guest = Array.isArray(m.T) ? m.T.map(telUnwire) : []; TEL.depotG = m.Td || null; TEL.dirty = true;      // етап 7.66\n  if (window.BV_AVIA) window.BV_AVIA.setGuest(Array.isArray(m.AV) ? m.AV : null);      // етап 4')

# --- переклад нових фраз інтерфейсу (uk → [ru, en]); додаються лише відсутні
I18N_NEW = [
 ("Аеродроми", "Аэродромы", "Airfields"),
 ("Вильоти з", "Вылеты с", "Departures from"),
 ("Базування (стоянка)", "Базирование (стоянка)", "Base (parking)"),
 ("Аеродроми (авіація)", "Аэродромы (авиация)", "Airfields (aviation)"),
 ("Злітних смуг працює", "Взлётных полос работает", "Runways operational"),
 ("Стоянки:", "Стоянки:", "Parking:"),
 ("у черзі на зліт:", "в очереди на взлёт:", "queued for takeoff:"),
 ("на підготовці:", "на подготовке:", "in preparation:"),
 ("у польоті:", "в полёте:", "airborne:"),
 ("очікують вильоту:", "ожидают вылета:", "waiting to take off:"),
 ("Аеродром вильоту знищено — авіація не злітає", "Аэродром вылета уничтожен — авиация не взлетает", "Departure airfield destroyed — aircraft cannot take off"),
 ("Немає вільних носіїв", "Нет свободных носителей", "No free carriers"),
 ("на обраних аеродромах", "на выбранных аэродромах", "at the chosen airfields"),
 ("не вистачає", "не хватает", "short"),
 ("Розгін на смузі", "Разбег на полосе", "Takeoff roll"),
 ("Черга пуску", "Очередь пуска", "Launch queue"),
 ("Пуск ракети", "Пуск ракеты", "Missile launch"),
 ("Повернення на", "Возвращение на", "Returning to"),
 ("Очікує аеродрому", "Ожидает аэродрома", "Waiting for an airfield"),
 ("Очікує смуги", "Ожидает полосы", "Waiting for runway"),
 ("Посадка на", "Посадка на", "Landing at"),
 ("Аеродром «", "Аэродром «", "Airfield «"),
 ("втрачено", "потеряно", "lost"),
 ("паливо вичерпано — немає аеродрому", "топливо исчерпано — нет аэродрома", "fuel exhausted — no airfield"),
 ("знищено — втрачено літаків", "уничтожен — потеряно самолётов", "destroyed — aircraft lost"),
 ("вильоти з", "вылеты с", "departures from"),
 ("авто", "авто", "auto"),
 ("Авіагрупа", "Авиагруппа", "Air group"),
]

def patch(text, label):
    if MARK in text:                                   # вже вшито — лише оновлюємо клей
        a = text.index(MARK); b = text.index(GLUE_END, a) + len(GLUE_END)
        if b < len(text) and text[b] == '\n': b += 1
        new = text[:a] + GLUE.rstrip('\n') + '\n' + text[b:]
        print(label, 'клей оновлено' if new != text else 'вже застосовано'); return new
    miss = []
    for i, (o, n) in enumerate(P):
        c = text.count(o)
        if c != 1: miss.append((i, c, o[:80].replace('\n', '⏎')))
    if text.count(INSERT_AT) != 1: miss.append(('insert', text.count(INSERT_AT), INSERT_AT[:60]))
    if 'const I18N_DICT = {' not in text: miss.append(('i18n', 0, 'const I18N_DICT'))
    if miss: print(label, 'MISS', miss); sys.exit(1)
    for o, n in P: text = text.replace(o, n)
    text = text.replace(INSERT_AT, GLUE + INSERT_AT)
    keys_present = [k for k, _, _ in I18N_NEW if ('"' + k + '":') in text]
    add = ''.join('"%s":["%s","%s"],' % (k, ru, en) for k, ru, en in I18N_NEW if ('"' + k + '":') not in text)
    text = text.replace('const I18N_DICT = {', 'const I18N_DICT = {' + add, 1)
    print(label, 'ok (словник: додано %d, вже були %d)' % (len(I18N_NEW) - len(keys_present), len(keys_present))); return text

def patch_module(d, label):
    """Вшиває 02i_avia.js окремим <script id="bvAvia"> після bvTel (або bvFog)."""
    if 'id="bvAvia"' in d:
        a = re.search(r'<script id="bvAvia">', d); b = d.index('</script>', a.end())
        return d[:a.end()] + rd('src/js/02i_avia.js') + d[b:]
    m = re.search(r'<script id="bvTel">.*?</script>', d, re.S) or re.search(r'<script id="bvFog">.*?</script>', d, re.S)
    if not m: print(label, 'MISS bvTel/bvFog'); sys.exit(1)
    return d[:m.end()] + '\n<script id="bvAvia">' + rd('src/js/02i_avia.js') + '</script>' + d[m.end():]

pat = re.compile(r'(<script[^>]*>)(.*?)(</script>)', re.S)
g = rd('src/js/03_game.js'); g2 = patch(g, 'src/js/03_game.js')
dist = 'dist/skydominion.html'; d = rd(dist)
ms = list(pat.finditer(d)); main = max(ms, key=lambda m: len(m.group(2)))
dm2 = patch(main.group(2), 'dist main')
d2 = d[:main.start(2)] + dm2 + d[main.end(2):]
d2 = patch_module(d2, 'dist')
h = rd('src/index.html'); h2 = h
if '02i_avia.js' not in h2 and '02g_tel.js' in h2:
    h2 = h2.replace('<script>@@F:js/02g_tel.js@@</script>\n', '<script>@@F:js/02g_tel.js@@</script>\n<script>@@F:js/02i_avia.js@@</script>\n')
for f, a, b in [('src/js/03_game.js', g, g2), (dist, d, d2), ('src/index.html', h, h2)]:
    if a != b: wr(f, b); print('записано', f)
print('done')
