# Звуки гри: вшиває файли з assets/sounds і підключає звуковий рушій 07_audio.js до гри.
#   python3 tools/apply_sounds.py
# Створює src/js/07c_sounds.js (дані звуків + клей tools/sounds_glue.js), додає в src/index.html
# і в dist/skydominion.html два <script>: bvAudio (рушій) та bvSounds (звуки). Ідемпотентно.
import base64, json, os, re, sys, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
SND_DIR = 'assets/sounds'

# підпис файлу (за змістом назви) → ключ у клеї (MAP у sounds_glue.js)
FILES = [
    (('взлет', 'фпв'), 'fpv_takeoff'),        # взлет фпв — зліт FPV/дрона
    (('полет', 'фпв'), 'fpv_flight'),         # полет фпв — політ дрона (петля)
    (('ракет',), 'missile_launch'),           # звук ракеты — пуск ракети
    (('самолет',), 'jet_flight'),             # звук самолет — політ літака (петля)
    (('вертолет',), 'heli_flight'),           # звук вертолет — гелікоптер (петля)
    (('мобильных', 'огнев'), 'pvo_mobile'),   # звук для мобильных огневых групп — ПВО
    (('меню',), 'menu'),                      # звук меню — фонова музика меню
]

def norm(name):
    # ім'я з архіву може прийти з «#U0432»-екрануванням — відновлюємо символи
    n = re.sub(r'#U([0-9a-fA-F]{4})', lambda m: chr(int(m.group(1), 16)), name)
    return unicodedata.normalize('NFC', n).lower()

def find_sounds():
    out = {}
    for fn in sorted(os.listdir(SND_DIR)):
        n = norm(fn)
        for keys, tag in FILES:
            if all(k in n for k in keys) and tag not in out:
                out[tag] = os.path.join(SND_DIR, fn)
    missing = [t for _, t in FILES if t not in out]
    if missing:
        sys.exit('ПОМИЛКА: не знайдено файли для: ' + ', '.join(missing))
    return out

def mime(path):
    return 'audio/mpeg' if path.endswith('.mp3') else 'audio/ogg'

def build_data(files):
    data = {}
    for tag, path in files.items():
        b = base64.b64encode(open(path, 'rb').read()).decode()
        data[tag] = 'data:%s;base64,%s' % (mime(path), b)
    return data

def build_module(data):
    glue = open('tools/sounds_glue.js', encoding='utf-8').read().rstrip() + '\n'
    head = '/* sounds:v1 · звукові файли (base64) — згенеровано tools/apply_sounds.py */\n'
    return head + 'window.BV_SND_DATA = ' + json.dumps(data, ensure_ascii=False) + ';\n' + glue

def script_block(id_, body):
    return '<script id="%s">\n%s\n</script>\n' % (id_, body)

def strip(html):
    html = re.sub(r'<script id="bvAudio">.*?</script>\n?', '', html, flags=re.S)
    html = re.sub(r'<script id="bvSounds">.*?</script>\n?', '', html, flags=re.S)
    return html

def insert_before_body(html, block):
    if html.count('</body>') != 1:
        sys.exit('ПОМИЛКА: очікувався один </body>, знайдено %d' % html.count('</body>'))
    return html.replace('</body>', block + '</body>', 1)


GAME_HOOK = """window.BV_SND_HOOK = {  // місток для звукового клею (tools/sounds_glue.js): доступ до внутрішніх змінних гри
  get spawnWeapon(){ return spawnWeapon; }, set spawnWeapon(v){ spawnWeapon = v; },
  get onStrike(){ return onStrike; }, set onStrike(v){ onStrike = v; },
  get fireRound(){ return fireRound; }, set fireRound(v){ fireRound = v; },
  get startGame(){ return startGame; }, set startGame(v){ startGame = v; },
  get units(){ return units; }, get map(){ return (typeof S7 !== "undefined" && S7.map) || map; }, get GAME(){ return GAME; }, get SIM(){ return SIM; },
  get ADS(){ return ADS; }, get AD_TYPES(){ return AD_TYPES; }, get WEAPONS(){ return WEAPONS; },
  unitPos: u => (typeof unitPos === "function" ? unitPos(u) : u.pos) };
"""

def patch_game(path):
    t = open(path, encoding='utf-8').read()
    if 'window.BV_SND_HOOK' in t:
        return
    if t.count('\nloadLib(0);\n') != 1:
        sys.exit('ПОМИЛКА: якір loadLib(0) у %s знайдено %d разів' % (path, t.count('\nloadLib(0);\n')))
    t = t.replace('\nloadLib(0);\n', '\n' + GAME_HOOK + 'loadLib(0);\n', 1)
    open(path, 'w', encoding='utf-8').write(t)

def main():
    patch_game('src/js/03_game.js')
    patch_game('dist/skydominion.html')
    files = find_sounds()
    data = build_data(files)
    module = build_module(data)
    open('src/js/07c_sounds.js', 'w', encoding='utf-8').write(module)
    audio = open('src/js/07_audio.js', encoding='utf-8').read()

    # src: плейсхолдери збирача (build.py підставляє вміст файлів)
    src = open('src/index.html', encoding='utf-8').read()
    src = strip(src)
    src = insert_before_body(src, script_block('bvAudio', '@@F:js/07_audio.js@@') +
                                   script_block('bvSounds', '@@F:js/07c_sounds.js@@'))
    open('src/index.html', 'w', encoding='utf-8').write(src)

    # dist: готовий файл гри
    dist = open('dist/skydominion.html', encoding='utf-8').read()
    dist = strip(dist)
    dist = insert_before_body(dist, script_block('bvAudio', audio) + script_block('bvSounds', module))
    open('dist/skydominion.html', 'w', encoding='utf-8').write(dist)

    print('ok: звуки', ', '.join('%s=%s' % (t, os.path.basename(p)) for t, p in files.items()))
    print('dist', len(dist), 'bytes')

if __name__ == '__main__':
    main()
