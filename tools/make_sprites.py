"""Збирає src/js/02d_sprites.js (глобал BV_SPR) зі спрайтів ракет «повітря-повітря» та РЛС.
Запуск: python3 tools/make_sprites.py   (потім python3 tools/apply_sprites.py)
РЛС-спрайти вирізані з двох листів tools/cut_radar_sheets.py -> assets/sprites/radar/sN_NN.png
Прив'язку «станція -> спрайт» і «літак -> ракети» редагуйте тут (RADAR_MAP, AAM_SETS)."""
import base64, io, json, os
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
SRC_MSL = "../missiles"          # папка з оригінальними PNG ракет (поруч з проєктом); якщо немає — береться assets/sprites/missiles/_src
if not os.path.isdir(SRC_MSL): SRC_MSL = "assets/sprites/missiles/_src"

# id, файл, довжина на екрані в px при масштабі 1 (носом угору після повороту)
MISSILES = [
  ("r27r1",  "01_R-27R1.png",  18), ("r27er", "02_R-27ER.png", 22), ("r27t", "03_R-27T.png", 18),
  ("r27et",  "04_R-27ET.png",  17), ("r73e",  "05_R-73E.png",  13),
  ("aam_a",  "Code_Generated_Image.png", 19),      # довга, радіолокаційна ГСН (білий обтічник)
  ("aam_b",  "Code_Generated_Image (1).png", 21),  # довга, радіолокаційна ГСН
  ("aam_c",  "Code_Generated_Image (2).png", 13),  # коротка, ІЧ-головка (клас AIM-9)
  ("aam_d",  "Code_Generated_Image (3).png", 15),  # середня, ІЧ-головка (клас MICA-IR)
]
# літак (ключ AD_TYPES) -> [ракета, від, до] — частка від дальності літака T.r, у межах якої ракета обирається
AAM_SETS = {
  "su27":   [["r27r1", .35, 1], ["r27t", .25, .8], ["r73e", 0, .5]],
  "su35":   [["r27er", .45, 1], ["r27et", .35, .9], ["r73e", 0, .5]],
  "su30":   [["r27er", .45, 1], ["r27et", .35, .9], ["r73e", 0, .5]],
  "mig29":  [["r27r1", .35, 1], ["r27t", .25, .8], ["r73e", 0, .55]],
  "f16":    [["aam_a", .4, 1],  ["aam_c", 0, .55]],
  "mirage": [["aam_b", .4, 1],  ["aam_d", 0, .6]],
}
# станція каталогу РЛС (02c_radar.js) -> спрайти (якщо кілька — варіант за номером станції)
RADAR_MAP = {
  "ua_79k6": ["s1_05"], "ua_80k6ks1": ["s1_03"], "ua_36d6m1": ["s1_02"], "ua_p18_malakhit": ["s1_08"],
  "ua_p18_terek": ["s1_06"], "ua_zoopark3": ["s2_01"], "ua_trml4d": ["s2_02", "s2_07"],
  "ua_giraffe1x": ["s2_06", "s2_03"], "ua_tpq36": ["s2_05", "s1_17"], "ua_tpq37": ["s2_04"],
  "ru_55zh6m": ["s1_01"], "ru_55zh6u": ["s1_10"], "ru_rezonans_n": ["s1_07"], "ru_1l119": ["s1_15"],
  "ru_96l6": ["s1_19"], "ru_48ya6k1": ["s1_04"], "ru_39n6": ["s1_18", "s1_20"], "ru_64l6": ["s1_14", "s1_12"],
  "ru_59n6e": ["s1_13"], "ru_sopka2": ["s1_09"], "ru_1l219m": ["s1_16"], "ru_1l220u": ["s1_11"],
}
def webp(im, q=86):
    b = io.BytesIO(); im.save(b, "WEBP", quality=q, method=6); return "data:image/webp;base64," + base64.b64encode(b.getvalue()).decode()
out = {"missiles": {}, "radars": {}, "parts": {}, "radarMap": RADAR_MAP, "aamSets": AAM_SETS}
os.makedirs("assets/sprites/missiles", exist_ok=True)
for mid, fn, L in MISSILES:
    p = os.path.join(SRC_MSL, fn)
    im = Image.open(p).convert("RGBA").rotate(90, expand=True)      # ніс праворуч -> ніс угору
    im = im.crop(im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox())
    im.save(f"assets/sprites/missiles/{mid}.png")
    sc = 160 / im.size[1]; sm = im.resize((max(1, round(im.size[0] * sc)), 160), Image.LANCZOS) if im.size[1] > 160 else im
    out["missiles"][mid] = {"src": webp(sm), "w": sm.size[0], "h": sm.size[1], "L": L}
used = sorted({s for v in RADAR_MAP.values() for s in v})
for rid in used:
    im = Image.open(f"assets/sprites/radar/{rid}.png").convert("RGBA")
    if im.size[0] > 192: im = im.resize((192, round(im.size[1] * 192 / im.size[0])), Image.LANCZOS)
    out["radars"][rid] = {"src": webp(im), "w": im.size[0], "h": im.size[1]}
# шари РЛС: нерухомий корпус + антена, що обертається (tools/split_radar_parts.py); усе в масштабі спрайта f
PM = json.load(open("assets/sprites/radar_parts/parts.json"))
for rid in used:
    m = PM[rid]; f = min(1.0, 192 / m["W"])
    def sc(path):
        im = Image.open(path).convert("RGBA")
        return im.resize((max(1, round(im.size[0] * f)), max(1, round(im.size[1] * f))), Image.LANCZOS) if f < 1 else im
    b = sc(f"assets/sprites/radar_parts/{rid}_body.png"); a = sc(f"assets/sprites/radar_parts/{rid}_ant.png")
    out["parts"][rid] = {"W": round(m["W"] * f, 2), "H": round(m["H"] * f, 2), "body": webp(b), "ant": webp(a), "aw": a.size[0], "ah": a.size[1],
                         "ax": round(m["ax"] * f, 2), "ay": round(m["ay"] * f, 2), "px": round(m["px"] * f, 2), "py": round(m["py"] * f, 2)}
js = "/* SKYDOMINION · спрайти ракет «повітря-повітря» й РЛС (генерується tools/make_sprites.py — не редагувати вручну) */\nwindow.BV_SPR = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n"
open("src/js/02d_sprites.js", "w", encoding="utf8").write(js)
print("02d_sprites.js", len(js), "bytes;", len(out["missiles"]), "missiles,", len(out["radars"]), "radars")
