# Інтеграційний тест у справжній грі: python3 tools/test_radar_browser.py <абсолютний шлях до dist/game_ultra.html>
# Потрібні playwright + chromium. Перевіряє РЛС ↔ РЕБ (RADAR/COM/РЕР) ↔ ППО (захоплення) ↔ удар по станції.
import sys, json, pathlib
from playwright.sync_api import sync_playwright
f = sys.argv[1]; tools = pathlib.Path(__file__).resolve().parent; errs=[]
JS = r"""
() => {
  const A = window.BV_RAD_API, BV = window.BV_RADAR, out = {};
  const units = A.units(), ads = A.ads();
  const st = A.add("ua_trml4d", [30.7, 50.4], "ua", true);
  const sim = A.sim(); sim.stations[0].timer = 0; sim.stations[0].status = "working";
  out.placed = !!st;
  // ціль РФ (шахед) за 60 км (радіогоризонт ≈ 71 км) на схід від станції
  const q = A.xy([30.7, 50.4]); const tp = A.ll(q.x + 60, q.y);
  units.set(9001, { id: 9001, kind: "w", sd: "ru", key: "shahed", pos: tp, wait: 1e9, s: 0, L: 1 });
  for (let i = 0; i < 80; i++) A.tick(0.5);
  const c = sim.pic.ua.air[0];
  out.contact = c ? { state: c.state, conf: +c.conf.toFixed(2), sigma: +c.sigma.toFixed(2), src: Object.keys(c.src) } : null;
  out.lock = window.BV_RAD.lock.has("ua:9001");
  // ППО: Patriot далеко (з лок), потім без контакту
  const Tp = { r: 140, gun: false, air: false };
  const ad = { id: 777, key: "patriot", side: "ua", pos: A.ll(q.x + 20, q.y) };
  ads.units.set(777, ad);
  out.adSkip_with_lock = A.adSkip(ad, Tp, units.get(9001));
  units.set(9002, { id: 9002, kind: "w", sd: "ru", key: "shahed", pos: A.ll(q.x + 150, q.y + 40), wait: 1e9, s: 0, L: 1 });
  out.adSkip_no_contact = A.adSkip(ad, Tp, units.get(9002));
  out.adSkip_gun_legacy = A.adSkip(ad, { r: 12, gun: true }, units.get(9002));
  const adNear = { id: 778, key: "patriot", side: "ua", pos: A.ll(q.x + 150 - 5, q.y + 40) }; ads.units.set(778, adNear);
  out.adSkip_close_optical = A.adSkip(adNear, Tp, units.get(9002));
  // РЕБ: Красуха-4 РФ біля станції → менше виявлень
  const EW = window.BV_EW;
  EW.st.push({ id: 91, key: "krasukha", side: "ru", c: [30.9, 50.4], on: true, alive: true, hp: 3, rdy: 0, se: 0.6, seen: { ua: 0, ru: 0 }, ex: { ua: 0, ru: 0 }, eng: new Set(), kills: 0 });
  const h0 = Object.values(sim.stations[0].tr).reduce((a, t) => a + t.hits, 0), s0 = sim.stations[0].nScan;
  for (let i = 0; i < 200; i++) A.tick(0.5);
  const h1 = Object.values(sim.stations[0].tr).reduce((a, t) => a + t.hits, 0), s1 = sim.stations[0].nScan;
  out.hitRate_with_jam = +((h1 - h0) / Math.max(1, s1 - s0)).toFixed(2);
  EW.st.length = 0;
  const h2 = Object.values(sim.stations[0].tr).reduce((a, t) => a + t.hits, 0), s2 = sim.stations[0].nScan;
  for (let i = 0; i < 200; i++) A.tick(0.5);
  const h3 = Object.values(sim.stations[0].tr).reduce((a, t) => a + t.hits, 0), s3 = sim.stations[0].nScan;
  out.hitRate_no_jam = +((h3 - h2) / Math.max(1, s3 - s2)).toFixed(2);
  // РЕР: «Леєр-2» РФ (el 40) поруч → станцію видно
  EW.st.push({ id: 92, key: "leer2", side: "ru", c: [30.8, 50.4], on: true, alive: true, hp: 2, rdy: 0, se: 0.5, seen: { ua: 0, ru: 0 }, ex: { ua: 0, ru: 0 }, eng: new Set(), kills: 0 });
  for (let i = 0; i < 40; i++) A.tick(0.5);
  const m = window.BV_RAD.meta.get(sim.stations[0].id);
  out.seen_by_REP = m.seen.ru > 0;
  // удар по виявленій станції
  const ustrike = { key: "shahed", pos: [30.7, 50.4] };
  const hp0 = sim.stations[0].hp; A.strike(ustrike, "ru");
  out.hp_after_strike = +sim.stations[0].hp.toFixed(2); out.hp_before = hp0;
  // зв'язок: COM-РЕБ рве канал (Мурманськ-БН над станцією)
  EW.st.push({ id: 93, key: "murmansk", side: "ru", c: [30.7, 50.4], on: true, alive: true, hp: 5, rdy: 0, se: 0.95, seen: { ua: 0, ru: 0 }, ex: { ua: 0, ru: 0 }, eng: new Set(), kills: 0 });
  for (let i = 0; i < 4; i++) A.tick(0.5);
  out.link_up_under_COM_jam = sim.stations[0].link.up;
  EW.st.length = 0; units.delete(9001); units.delete(9002); ads.units.delete(777); ads.units.delete(778);
  return out;
}
"""
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width':1400,'height':900})
    pg.on('pageerror', lambda e: errs.append('PAGEERR '+str(e)[:400]))
    def ml(route):
        u = route.request.url
        route.fulfill(path=str(tools/('maplibre-gl.css' if u.endswith('.css') else 'maplibre-gl.js')), content_type='text/css' if u.endswith('.css') else 'application/javascript')
    pg.route('**/maplibre-gl.*', ml)
    pg.route('**/*', lambda r: r.abort() if any(x in r.request.url for x in ['tiles.openfreemap','fonts.g','workers.dev','peerjs']) else r.fallback())
    pg.goto('file://'+f); pg.wait_for_timeout(5000)
    try:
        print(json.dumps(pg.evaluate(JS), ensure_ascii=False, indent=1))
    except Exception as e: print("EVAL ERR", str(e)[:600])
    # UI: відкрити панель, зробити скріншот
    pass
    pass
    pg.screenshot(path='/tmp/radar_ui.png')
    for e in errs[:10]: print(e)
    print('pageerrors:', len(errs)); b.close()
