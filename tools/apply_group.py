# Етапи 1–4 разом: оновлює всі вставлені блоки (клей у грі, 180/190/200 у dist і src) до поточних файлів.
#   python3 tools/apply_group.py   (ідемпотентно)
import os, re, sys
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
rd = lambda p: open(p, encoding='utf8').read()
wr = lambda p, s: open(p, 'w', encoding='utf8').write(s)

GAME_ANCHOR = '  HOOKS.selClear = selClear;\n'
GLUE_START = '  /* bv-quick-glue'
GLUE_END_MARK = '  /* bv-quick-glue-end */'

def refresh_game(s):
    """Оновлює клей між маркерами bv-quick-glue і bv-quick-glue-end; якщо його немає — вставляє після якоря."""
    glue = rd('tools/quick_glue.js').rstrip() + '\n'
    a = s.find(GLUE_START)
    if a < 0:
        assert s.count(GAME_ANCHOR) == 1, 'якір HOOKS.selClear не єдиний'
        return s.replace(GAME_ANCHOR, GAME_ANCHOR + glue, 1)
    end = s.find(GLUE_END_MARK, a)
    assert end > 0, 'немає маркера кінця клею'
    e = s.find('\n', end) + 1
    return s[:a] + glue + s[e:]


DND_START = '  /* bv-dnd-glue */'
def refresh_dnd(s):
    """Оновлює клей Drag & Drop у замиканні гри (між маркером і кінцем IIFE клею)."""
    glue = rd('tools/dnd_glue.js').rstrip() + '\n'
    a = s.find(DND_START)
    if a < 0: return s
    st = s.find('\n', a) + 1
    e = s.find('})();\n', st) + len('})();\n')
    return s[:st] + glue + s[e:]

def block(s, tag, body, closer):
    """Оновлює блок <tag id=…>…</closer>; якщо немає — повертає None."""
    a = s.find(tag)
    if a < 0: return None
    a2 = s.find('\n', a) + 1
    e = s.find(closer, a2)
    return s[:a2] + body.rstrip() + '\n' + s[e:]

def upsert_dist(s, tid, body, closer, insert_before):
    t = '<script id="%s">' % tid if closer == '</script>' else '<style id="%s">' % tid
    r = block(s, t, body, closer)
    if r is not None: return r
    return s.replace(insert_before, ('<style id="%s">\n%s\n</style>\n' if closer == '</style>' else '<script id="%s">\n%s\n</script>\n') % (tid, body.rstrip()) + insert_before, 1)

def upsert_src_index(s, file, tag):
    if file in s: return s
    if tag == 'css': return s.replace('</head>', '<style>@@F:css/%s@@</style>\n</head>' % file, 1)
    return s.replace('</body>', '<script>@@F:js/%s@@</script>\n</body>' % file, 1)

files = {
  'src/js/03_game.js': lambda s: refresh_dnd(refresh_game(s)),
  'dist/skydominion.html': lambda s: upsert_dist(upsert_dist(upsert_dist(upsert_dist(upsert_dist(upsert_dist(
      refresh_dnd(refresh_game(s)),
      'bv-quickbar', rd('src/css/180_quickbar.css'), '</style>', '</head>'),
      'bv-quickbar-js', rd('src/js/180_quickbar.js'), '</script>', '</body>'),
      'bv-ordermenu', rd('src/css/190_ordermenu.css'), '</style>', '</head>'),
      'bv-ordermenu-js', rd('src/js/190_ordermenu.js'), '</script>', '</body>'),
      'bv-group', rd('src/css/200_group.css'), '</style>', '</head>'),
      'bv-group-js', rd('src/js/200_group.js'), '</script>', '</body>'),
  'src/index.html': lambda s: upsert_src_index(upsert_src_index(upsert_src_index(upsert_src_index(upsert_src_index(upsert_src_index(s,
      '180_quickbar.css','css'), '180_quickbar.js','js'), '190_ordermenu.css','css'), '190_ordermenu.js','js'),
      '200_group.css','css'), '200_group.js','js'),
}

# етап 6: маршрути (210) — додаються до вже наявних пунктів
files['dist/skydominion.html'] = (lambda prev: lambda s: upsert_dist(upsert_dist(prev(s),
    'bv-routes', rd('src/css/210_routes.css'), '</style>', '</head>'),
    'bv-routes-js', rd('src/js/210_routes.js'), '</script>', '</body>'))(files['dist/skydominion.html'])
files['src/index.html'] = (lambda prev: lambda s: upsert_src_index(upsert_src_index(prev(s),
    '210_routes.css', 'css'), '210_routes.js', 'js'))(files['src/index.html'])

# вбудований рядок інструментів авіації ПВО (215): кнопки «Рамка» і «Маршрути» — у панелі #adp
files['dist/skydominion.html'] = (lambda prev: lambda s: upsert_dist(upsert_dist(prev(s),
    'bv-avtb', rd('src/css/215_avtoolbar.css'), '</style>', '</head>'),
    'bv-avtb-js', rd('src/js/215_avtoolbar.js'), '</script>', '</body>'))(files['dist/skydominion.html'])
files['src/index.html'] = (lambda prev: lambda s: upsert_src_index(upsert_src_index(prev(s),
    '215_avtoolbar.css', 'css'), '215_avtoolbar.js', 'js'))(files['src/index.html'])

# командний пункт: зведення підпорядкованих систем (216)
files['dist/skydominion.html'] = (lambda prev: lambda s: upsert_dist(prev(s),
    'bv-cp-js', rd('src/js/216_postsummary.js'), '</script>', '</body>'))(files['dist/skydominion.html'])
files['src/index.html'] = (lambda prev: lambda s: upsert_src_index(prev(s), '216_postsummary.js', 'js'))(files['src/index.html'])

# зв'язок з КП (217): втрата після двох влучань поблизу КП або його установок
files['dist/skydominion.html'] = (lambda prev: lambda s: upsert_dist(prev(s),
    'bv-link-js', rd('src/js/217_link.js'), '</script>', '</body>'))(files['dist/skydominion.html'])
files['src/index.html'] = (lambda prev: lambda s: upsert_src_index(prev(s), '217_link.js', 'js'))(files['src/index.html'])

# пошкодження й ремонт (218): після зв'язку КП (217), бо обгортає його хуки
files['dist/skydominion.html'] = (lambda prev: lambda s: upsert_dist(prev(s),
    'bv-dmg-js', rd('src/js/218_damage.js'), '</script>', '</body>'))(files['dist/skydominion.html'])
files['src/index.html'] = (lambda prev: lambda s: upsert_src_index(prev(s), '218_damage.js', 'js'))(files['src/index.html'])

# виробництво боєкомплекту (219): після пошкоджень (218), блок у панелі ППО
files['dist/skydominion.html'] = (lambda prev: lambda s: upsert_dist(prev(s),
    'bv-prod-js', rd('src/js/219_production.js'), '</script>', '</body>'))(files['dist/skydominion.html'])
files['src/index.html'] = (lambda prev: lambda s: upsert_src_index(prev(s), '219_production.js', 'js'))(files['src/index.html'])

# логістика (220): після виробництва (219) і пошкоджень/зв'язку (217–218)
files['dist/skydominion.html'] = (lambda prev: lambda s: upsert_dist(prev(s),
    'bv-log-js', rd('src/js/220_logistics.js'), '</script>', '</body>'))(files['dist/skydominion.html'])
files['src/index.html'] = (lambda prev: lambda s: upsert_src_index(prev(s), '220_logistics.js', 'js'))(files['src/index.html'])

# доступність кнопок дії в панелі ППО (222): прокрутка до «обрати точку» / «зліт» після вибору техніки
files['dist/skydominion.html'] = (lambda prev: lambda s: upsert_dist(prev(s),
    'bv-reach-js', rd('src/js/222_reach.js'), '</script>', '</body>'))(files['dist/skydominion.html'])
files['src/index.html'] = (lambda prev: lambda s: upsert_src_index(prev(s), '222_reach.js', 'js'))(files['src/index.html'])

# переробка панелі ППО для телефону (223): лише вузькі екрани, css
files['dist/skydominion.html'] = (lambda prev: lambda s: upsert_dist(prev(s),
    'bv-mobadp', rd('src/css/223_mobile_adp.css'), '</style>', '</head>'))(files['dist/skydominion.html'])
files['src/index.html'] = (lambda prev: lambda s: upsert_src_index(prev(s), '223_mobile_adp.css', 'css'))(files['src/index.html'])

# горизонтальний вид на телефоні (224): стилі альбому й підказка «поверніть телефон»
files['dist/skydominion.html'] = (lambda prev: lambda s: upsert_dist(upsert_dist(prev(s),
    'bv-land', rd('src/css/224_landscape.css'), '</style>', '</head>'),
    'bv-land-js', rd('src/js/224_landscape.js'), '</script>', '</body>'))(files['dist/skydominion.html'])
files['src/index.html'] = (lambda prev: lambda s: upsert_src_index(upsert_src_index(prev(s), '224_landscape.css', 'css'), '224_landscape.js', 'js'))(files['src/index.html'])
for p, fn in files.items():
    wr(p, fn(rd(p)))
print('ok')
