# Этап 225 — tactical HUD для горизонтального экрана.
#   python3 tools/apply_hud.py   (идемпотентно; якорь </body> должен встречаться ровно 1 раз)
# Стиль и скрипт вставляются в самый конец body, чтобы идти после sx-adaptive и прочих слоёв.
import os, sys
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
rd = lambda p: open(p, encoding='utf8').read()
CSS = '<style id="bv-hud">\n' + rd('src/css/225_hud.css').rstrip() + '\n</style>\n'
JS = '<script id="bv-hud-js">\n' + rd('src/js/225_hud.js').rstrip() + '\n</script>\n'

def patch(path, new_block_pairs, marks):
    s = rd(path)
    if all(m in s for m in marks): return 'вже підключено'
    for old, new in new_block_pairs:
        n = s.count(old)
        if n != 1: sys.exit(f'{path}: якір {old[:40]!r} — {n} збігів; жоден файл не змінено')
        s = s.replace(old, new, 1)
    open(path, 'w', encoding='utf8').write(s)
    return 'ок'

print({
  'dist/skydominion.html': patch('dist/skydominion.html', [('</body>', CSS + JS + '</body>')], ['bv-hud-js']),
  'src/index.html': patch('src/index.html', [('</body>', '<style>@@F:css/225_hud.css@@</style>\n<script>@@F:js/225_hud.js@@</script>\n</body>')], ['225_hud.js']),
})
