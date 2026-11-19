"""Етап 7.58 · променевий скан РЛС (02c_radar.js): антена обертається в симуляції, ціль перевіряється,
   коли промінь проходить по її азимуту. Вмикається CFG.sweep (гра вмикає; за замовчуванням — класичний скан, 77 тестів як були).
   Патчить src/js/02c_radar.js, блок bvRadar у dist/skydominion.html і дописує тести в tools/test_radar.js. Ідемпотентно."""
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); os.chdir(ROOT)
MARK = "/* sweep:v1 */"

SWEEP = MARK + r'''
  /* ---------- етап 7.58: променевий скан (CFG.sweep) — антена обертається, ціль перевіряється лише коли промінь проходить по її азимуту ---------- */
  const TAU = Math.PI * 2;
  const normA = a => { a %= TAU; return a < 0 ? a + TAU : a; };
  /* початковий азимут антени — з номера станції (без генератора випадкових чисел: класичні сценарії відтворюються як раніше) */
  function azSeed(id) { let h = 2166136261; const s = String(id); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 3600) / 3600 * TAU; }
  /* азимут — компас: 0 = північ (+y), за годинниковою; період обороту = scanEff (перевантаження станції сповільнює обертання) */
  function sweepStation(sim, st, p, env, tg, now, dt) {
    const C = sim.cfg, per = scanEff(sim, st, p), w = TAU / per, da = w * dt, a0 = st.az || 0, t0 = now - dt;
    if (!st.hits) st.hits = [];
    const Re = rangeEff(sim, st, p), found = [];
    const jam = env.jam ? clamp(env.jam([st.x, st.y], st.side) || 0, 0, 1) : 0;
    if (Re > 0) {
      const R2 = Re * Re, jamF = 1 - jam * (1 - p.jamRes) * 0.9, cond = condK(st);
      const wth = clamp(envWeather(env, st.x, st.y), 0, 1), weatherF = 1 - (1 - wth) * (p.band === "meter" ? C.weatherSensMeter : C.weatherSens);
      for (let i = 0; i < tg.length; i++) {
        const t = tg[i];
        if (t.side === st.side) continue;
        const dx = t.x - st.x, dy = t.y - st.y, d2 = dx * dx + dy * dy;
        if (d2 > R2) continue;
        const off = normA(Math.atan2(dx, dy) - a0);               // кут від поточного азимуту до цілі за ходом обертання
        for (let o = off, k = 0; o < da && k < 3; o += TAU, k++) {
          const d = Math.sqrt(d2), alt = t.alt || "mid";
          const sig = t.sig != null ? t.sig : (CAT[t.cat] ? CAT[t.cat].sig : 0.5);
          const sigEff = p.stealthK ? sig + (1 - sig) * p.stealthK : sig;
          const sigF = clamp(Math.pow(sigEff, 0.6), 0.05, 1);
          const rf = 1 - Math.pow(d / Re, C.rangeExp);
          const los = env.los ? clamp(env.los(st.x, st.y, t.x, t.y, alt), 0, 1) : 1;
          const losF = 1 - (1 - los) * (C.altLosSens[alt] == null ? 0.5 : C.altLosSens[alt]);
          const chance = clamp(p.base * rf * sigF * (p.altK[alt] == null ? 0.5 : p.altK[alt]) * weatherF * losF * cond * jamF, 0, 1);
          if (rnd(sim) >= chance) continue;
          found.push({ o, t, d, alt, tc: t0 + o / w, rev: st.nScan + (a0 + o >= TAU ? 1 : 0), brg: normA(a0 + o) });
        }
      }
    }
    st.az = normA(a0 + da); st.nScan += Math.floor((a0 + da) / TAU);
    /* канал зв'язку: пропускна здатність — звітів за оберт, тут пропорційно куту, який пройшов промінь */
    const bwMax = st.link.bandwidth; st.bw = Math.min(bwMax, (st.bw == null ? bwMax : st.bw) + bwMax * da / TAU);
    found.sort((a, b) => a.o - b.o);
    for (const f of found) {
      const rep = observe(sim, st, p, f.t, f.d, Re, jam, f.alt, f.tc, f.rev);
      st.hits.push({ t: f.tc, x: rep.x, y: rep.y, no: rep.no, s: rep.state, c: Math.round(rep.conf * 100) / 100, az: f.brg });
      if (st.bw >= 1 && send(sim, st, rep)) st.bw -= 1;
    }
    const keep = 3 * per; while (st.hits.length && (now - st.hits[0].t > keep || st.hits.length > C.hitsKeep)) st.hits.shift();
  }
  /* контрбатарейна РЛС (ФАР): антена не обертається, а довертається на найсвіжішу позицію пуску противника */
  function slewCb(sim, st, dt) {
    let g = null;
    for (const k in st.gr) { const c = st.gr[k]; if (!c.lost && (!g || c.lastHit > g.lastHit)) g = c; }
    if (!g) return;
    let d = normA(Math.atan2(g.x - st.x, g.y - st.y) - (st.az || 0)); if (d > Math.PI) d -= TAU;
    const m = sim.cfg.cbSlewDegSec * Math.PI / 180 * dt;
    st.az = normA((st.az || 0) + clamp(d, -m, m));
  }
  /* стан променя для візуалізації й ППО: az — азимут, w — рад/с (0, якщо станція не випромінює), hits — недавні влучання променя */
  function beam(sim, id) {
    const st = stById(sim, id); if (!st) return null;
    const p = par(sim, st), act = active(st), air = p.mode === "air", per = scanEff(sim, st, p);
    return { id: st.id, az: st.az || 0, w: air && act ? TAU / per : 0, periodSec: air ? per : 0, mode: air ? "sweep" : "slew", active: act, rKm: act ? rangeEff(sim, st, p) : 0, hits: st.hits || [] };
  }

'''
EDITS = [
  ('    logMax: 200\n  };',
   '    logMax: 200,\n    sweep: false,         // променевий скан: ціль перевіряється, коли промінь проходить по її азимуту (гра вмикає; інакше — «усі цілі за період»)\n    hitsKeep: 200,        // скільки останніх влучань променя зберігати на станцію (для відміток на екрані)\n    cbSlewDegSec: 60      // °/с — довертання антени контрбатарейної РЛС на пуск\n  };'),
  ('nextScan: 0, nScan: 0, nTr: 0, trSeq: 0, tr: {}, gr: {}\n    };', 'nextScan: 0, nScan: 0, nTr: 0, trSeq: 0, tr: {}, gr: {}, az: 0, hits: []\n    };'),
  ('    st.nextScan = sim.t + rnd(sim) * p.scanSec;\n    if (st.status === "deploying"', '    st.nextScan = sim.t + rnd(sim) * p.scanSec;\n    st.az = azSeed(st.id);\n    if (st.status === "deploying"'),
  ('  /* ---------- контрбатарейні події ---------- */', SWEEP + '  /* ---------- контрбатарейні події ---------- */'),
  ('      if (p.mode !== "air") continue;\n      let n = 0;',
   '      if (p.mode !== "air") { if (C.sweep) slewCb(sim, st, dt); continue; }\n      if (C.sweep) { sweepStation(sim, st, p, env, tg, now, dt); continue; }\n      let n = 0;'),
  ('emitting: p.mode === "air" && active(st)\n    };',
   'emitting: p.mode === "air" && active(st),\n      azDeg: Math.round(normA(st.az || 0) * 180 / Math.PI), rotationSec: p.mode === "air" ? Math.round(scanEff(sim, st, p) * 10) / 10 : 0\n    };'),
  ('    step, localContacts, adQuery, snapshot, coverage, emitters, serialize, restore,', '    step, localContacts, adQuery, snapshot, coverage, emitters, beam, serialize, restore,'),
]
def patch(t, name):
    if MARK in t: print(name, ": вже застосовано"); return t
    for old, new in EDITS:
        n = t.count(old)
        if n != 1: sys.exit(f"{name}: очікувався 1 збіг, знайдено {n}: {old[:70]!r}")
        t = t.replace(old, new)
    print(name, ": OK"); return t
def rw(path, fn):
    t = open(path, encoding="utf8").read(); n = fn(t)
    if n != t: open(path, "w", encoding="utf8").write(n)
rw("src/js/02c_radar.js", lambda t: patch(t, "src/js/02c_radar.js"))
def dist(t):
    a = '<script id="bvRadar">'; i = t.find(a); j = t.find("</script>", i)
    if i < 0 or j < 0: sys.exit("dist: немає bvRadar")
    blk = t[i + len(a):j]; nb = patch(blk, "dist (bvRadar)")
    return t[:i + len(a)] + nb + t[j:]
rw("dist/skydominion.html", dist)

TESTS = r'''
console.log("\n13. Променевий скан (CFG.sweep): обертання антени = логіка виявлення");
{
  const mkS = (seed, over) => R.create({ seed: seed || 5, cfg: Object.assign({ sweep: true }, over || {}) });
  const TAU = Math.PI * 2, brgOf = (x, y) => { let b = Math.atan2(x, y); return b < 0 ? b + TAU : b; };
  const adiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
  /* 1. кутова швидкість = 2π / період скану; повний оберт за scanSec */
  { const sim = mkS(), st = station(sim, "ua_trml4d", 0, 0), per = R.beam(sim, st.id).periodSec, a0 = st.az, env = world([]);
    for (let i = 0; i < Math.round(per / 0.2); i++) R.step(sim, 0.2, env);
    ok(Math.abs(adiff(st.az, a0)) < 0.2 + 1e-6 && st.nScan >= 1 && per === 2, "оберт за період скану (" + per + " с): азимут повернувся, nScan=" + st.nScan);
    const b = R.beam(sim, st.id); ok(Math.abs(b.w - TAU / per) < 1e-9 && b.mode === "sweep", "кутова швидкість 2π/період"); }
  /* 2. влучання лише коли промінь на азимуті цілі */
  { const sim = mkS(11), st = station(sim, "ua_trml4d", 0, 0, { status: "working" }), tgt = T("a", 30, 40, { cat: "bomber", alt: "high" }), bt = brgOf(30, 40), env = world([tgt]);
    let bad = 0, n = 0, prev = 0;
    for (let t = 0; t < 200; t += 0.2) {
      const a0 = st.az, h0 = sumHits(st); R.step(sim, 0.2, env);
      if (sumHits(st) > h0) { n++; const off = ((bt - a0) % TAU + TAU) % TAU; if (!(off <= 0.2 * (TAU / 2) + 1e-9)) bad++; }
    }
    ok(n >= 60 && n <= 100, "ціль виявляється майже при кожному проході променя (як у класичному скані): " + n + " влучань за 100 обертів");
    ok(bad === 0, "жодного влучання поза сектором, який промінь пройшов за крок");
    const hh = st.hits[st.hits.length - 1]; ok(Math.abs(adiff(hh.az, bt)) < 1e-6, "азимут влучання = азимут цілі"); }
  /* 3. станція не випромінює → антена стоїть, влучань немає */
  { const sim = mkS(), st = station(sim, "ua_trml4d", 0, 0, { status: "offline" }), a0 = st.az; st.offReason = "manual";
    for (let t = 0; t < 30; t += 0.2) R.step(sim, 0.2, world([T("a", 20, 20)]));
    ok(st.az === a0 && st.hits.length === 0 && R.beam(sim, st.id).w === 0, "вимкнена: антена нерухома, влучань нема"); }
  { const sim = mkS(), st = station(sim, "ua_trml4d", 0, 0, { status: "deploying", timer: 30 }), a0 = st.az;
    for (let t = 0; t < 10; t += 0.2) R.step(sim, 0.2, world([T("a", 20, 20)]));
    ok(st.az === a0, "розгортається: антена не обертається"); }
  /* 4. перевантаження сповільнює обертання */
  { const sim = mkS(), st = station(sim, "ua_p18_terek", 0, 0, { bal: { maxTracks: 4 } }), p0 = R.beam(sim, st.id).periodSec;
    const ts = []; for (let i = 0; i < 12; i++) ts.push(T("t" + i, 20 + i, 30 - i, { cat: "bomber", alt: "high" }));
    for (let t = 0; t < 120; t += 0.5) R.step(sim, 0.5, world(ts));
    ok(R.beam(sim, st.id).periodSec > p0 * 1.2, "забагато цілей → період обороту зріс: " + p0 + " → " + R.beam(sim, st.id).periodSec + " с"); }
  /* 5. дальність: поза колом скан нічого не дає, навіть коли промінь на азимуті */
  { const sim = mkS(), st = station(sim, "ua_giraffe1x", 0, 0, { bal: { rangeKm: 60 } });
    for (let t = 0; t < 60; t += 0.2) R.step(sim, 0.2, world([T("far", 0, 150, { cat: "bomber", alt: "high" })]));
    ok(st.hits.length === 0, "ціль за межею дальності не дає влучань"); }
  /* 6. детермінізм і серіалізація */
  { const A = mkS(3), B = mkS(3), sa = station(A, "ua_trml4d", 0, 0), sb = station(B, "ua_trml4d", 0, 0), tg = [T("a", 30, 10, { cat: "bomber" })];
    for (let t = 0; t < 60; t += 0.2) { R.step(A, 0.2, world(tg)); R.step(B, 0.2, world(tg)); }
    ok(JSON.stringify(sa.hits) === JSON.stringify(sb.hits) && sa.az === sb.az, "однаковий seed → однакові влучання й азимут");
    const C = R.restore(R.serialize(A)); ok(C.stations[0].az === sa.az && C.stations[0].hits.length === sa.hits.length, "азимут і влучання переживають збереження"); }
  /* 7. звіти йдуть у картину сторони лише через промінь: контакт з'являється після першого проходу */
  { const sim = mkS(9), st = station(sim, "ua_trml4d", 0, 0), tg = [T("a", 20, 5, { cat: "bomber", alt: "high" })], bt = brgOf(20, 5);
    let first = null, azAtFirst = null;
    for (let t = 0; t < 30 && first === null; t += 0.1) { R.step(sim, 0.1, world(tg)); if (st.hits.length) { first = t; azAtFirst = st.az; } }
    ok(first !== null && Math.abs(adiff(azAtFirst, bt)) < 0.1 * TAU / 2 + 0.01, "перше влучання — коли промінь щойно пройшов азимут цілі");
    for (let t = 0; t < 40; t += 0.5) R.step(sim, 0.5, world(tg));
    ok(sim.pic.ua.air.length === 1, "контакт у спільній картині з'являється через влучання променя"); }
  /* 8. контрбатарейна ФАР довертається на пуск */
  { const sim = mkS(), st = station(sim, "ua_tpq37", 0, 0, { status: "working" }), env = world([]);
    for (let i = 0; i < 4; i++) { R.artilleryEvent(sim, { side: "ru", x: 15, y: 15, kind: "artillery" }); for (let t = 0; t < 2; t += 0.2) R.step(sim, 0.2, env); }
    ok(R.beam(sim, st.id).mode === "slew" && Math.abs(adiff(st.az, Math.PI / 4)) < 0.2, "контрбатарейна антена довернулась на азимут пуску (45°): " + Math.round(st.az * 180 / Math.PI) + "°"); }
  /* 9. класичний режим не змінився */
  { const sim = R.create({ seed: 1 }), st = station(sim, "ua_trml4d", 0, 0); for (let t = 0; t < 20; t += 0.5) R.step(sim, 0.5, world([T("a", 20, 5)]));
    ok(sim.cfg.sweep === false && st.hits.length === 0, "без CFG.sweep: класичний скан, променя нема"); }
}

console.log("\nПідсумок: "'''
def tests(t):
    if "Променевий скан (CFG.sweep)" in t: print("tests : вже додано"); return t
    old = '\nconsole.log("\\nПідсумок: "'
    if t.count(old) != 1: sys.exit("tests: не знайдено рядок підсумку")
    print("tests : OK"); return t.replace(old, TESTS, 1)
rw("tools/test_radar.js", tests)
