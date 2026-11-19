# Етап 7.64: єдиний стиль. python3 tools/apply_unify.py — вбудовує 141_unify_shop.css + 140_unify.css у dist як <style id="bv-unify"> одразу після bv2-aaa (ідемпотентно).
import os, re
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
p = 'dist/skydominion.html'; h = open(p, encoding='utf8').read()
css = ''.join(open(f'src/css/{f}', encoding='utf8').read() for f in ('141_unify_shop.css', '140_unify.css'))
h = re.sub(r'<style id="bv-unify">[\s\S]*?</style>\n?', '', h)
i = h.index('<style id="bv2-aaa">'); j = h.index('</style>', i) + len('</style>')
open(p, 'w', encoding='utf8').write(h[:j] + '\n<style id="bv-unify">\n' + css + '</style>' + h[j:]); print('OK', len(css))
