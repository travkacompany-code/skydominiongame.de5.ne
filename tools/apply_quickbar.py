# Етап 2 — панель швидкого доступу до техніки.
#   python3 tools/apply_quickbar.py   (ідемпотентно; кожен якір має зустрічатися рівно 1 раз)
import os, sys
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
rd = lambda p: open(p, encoding='utf8').read()
MARK = 'bv-quick-glue'
ANCHOR = '  HOOKS.selClear = selClear;\n'
GLUE = rd('tools/quick_glue.js').rstrip() + '\n'
CSS = '<style id="bv-quickbar">\n' + rd('src/css/180_quickbar.css').rstrip() + '\n</style>\n'
JS = '<script id="bv-quickbar-js">\n' + rd('src/js/180_quickbar.js').rstrip() + '\n</script>\n'

def patch(path, pairs, marks):
    s = rd(path)
    if all(m in s for m in marks): return 'уже підключено'
    for old, new in pairs:
        n = s.count(old)
        if n != 1: sys.exit(f'{path}: якір {old[:40]!r} — {n} збігів; жоден файл не змінено')
        s = s.replace(old, new, 1)
    open(path, 'w', encoding='utf8').write(s)
    return 'ок'

print({
  'src/js/03_game.js': patch('src/js/03_game.js', [(ANCHOR, ANCHOR + GLUE)], [MARK]),
  'dist/skydominion.html': patch('dist/skydominion.html', [(ANCHOR, ANCHOR + GLUE), ('</head>', CSS + '</head>'), ('</body>', JS + '</body>')], [MARK, 'bv-quickbar-js']),
  'src/index.html': patch('src/index.html', [('</head>', '<style>@@F:css/180_quickbar.css@@</style>\n</head>'), ('</body>', '<script>@@F:js/180_quickbar.js@@</script>\n</body>')], ['180_quickbar.js']),
})
