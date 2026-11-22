# Етап 3 — контекстне меню наказів. Ідемпотентно і з оновленням:
# оновлює вставлені блоки (клей у грі, 180/190 у dist) до поточних файлів джерела.
#   python3 tools/apply_ordermenu.py
import os, re, sys
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
rd = lambda p: open(p, encoding='utf8').read()
wr = lambda p, s: open(p, 'w', encoding='utf8').write(s)

GAME_ANCHOR = '  HOOKS.selClear = selClear;\n'
GLUE_START = '  /* bv-quick-glue'
GLUE_END = '  window.BV_QUICK = '

def refresh_game(s):
    """Оновлює клей між GLUE_START і кінцем рядка window.BV_QUICK = …; якщо його немає — вставляє після якоря."""
    glue = rd('tools/quick_glue.js').rstrip() + '\n'
    a = s.find(GLUE_START)
    if a < 0:
        assert s.count(GAME_ANCHOR) == 1, 'якір HOOKS.selClear не єдиний'
        return s.replace(GAME_ANCHOR, GAME_ANCHOR + glue, 1)
    b = s.find(GLUE_END, a); e = s.find('\n', b) + 1
    return s[:a] + glue + s[e:]

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
  'src/js/03_game.js': lambda s: refresh_game(s),
  'dist/skydominion.html': lambda s: upsert_dist(
      upsert_dist(
        upsert_dist(
          upsert_dist(refresh_game(s), 'bv-quickbar', rd('src/css/180_quickbar.css'), '</style>', '</head>'),
          'bv-quickbar-js', rd('src/js/180_quickbar.js'), '</script>', '</body>'),
        'bv-ordermenu', rd('src/css/190_ordermenu.css'), '</style>', '</head>'),
      'bv-ordermenu-js', rd('src/js/190_ordermenu.js'), '</script>', '</body>'),
  'src/index.html': lambda s: upsert_src_index(upsert_src_index(upsert_src_index(upsert_src_index(s,
      '180_quickbar.css','css'), '180_quickbar.js','js'), '190_ordermenu.css','css'), '190_ordermenu.js','js'),
}
for p, fn in files.items():
    wr(p, fn(rd(p)))
print('ok')
