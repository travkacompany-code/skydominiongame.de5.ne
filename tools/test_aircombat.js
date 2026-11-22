/* тести BV_AIRC: фізика ракет, ГСН та її обман, нотч, повторне захоплення, висотні вікна, радіогоризонт, шкода */
require("../src/js/02l_aircombat.js");
const A = globalThis.BV_AIRC, U = A.util;
let seed = 777; A.CFG.rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const ok = (c, m) => { if (!c) { console.error("FAIL:", m); process.exitCode = 1; } else console.log("ok  ", m); };
const mk = (key, x, h, hdg, v) => ({ ref: key + x, key, x, y: 0, h, hdg, v, perf: A.perfOf(key), st: A.newState(key), alive: true, side: "ru" });
const shooter = (o) => Object.assign({ alive: true, x: 0, y: 0, h: 9000, R: 100, pd: true, jam: 0, hdg: 90, beam: 60 }, o || {});

function fly(aam, tk, dist, o){
  o = o || {};
  const T = mk(tk, dist, o.h || 9000, o.hdg != null ? o.hdg : 270, o.v || 8), sh = shooter(o.sh);
  const S = A.AAM[aam];
  const m = A.makeMissile(S, { id: 1, from: "s", side: "ua", tgt: T.ref, x: 0, y: 0, h: 9000, hdg: 90, max: dist * 1.6 + 15, tx: T.x, ty: 0, th: T.h, src: () => sh });
  const W = { t: 0, ent: () => T, flares: [], chaff: [] };
  let t = 0, ev = null; const dt = 0.05, seen = { decoy: false, mem: false };
  while (t < 20 && !ev){
    t += dt; W.t = t; const hv = U.hv(T.hdg); T.x += hv[0] * T.v * dt; T.y += hv[1] * T.v * dt;
    if (o.evade){
      const r = A.defend(T, [{ m, d: A.slant(m, m.h, T, T.h) }], W);
      if (r){ const dd = U.dA(T.hdg, r.hdg), mt = 55 * A.CFG.evK * r.turn * dt * Math.min(1, T.perf.g / 9); T.hdg = U.nrm(T.hdg + Math.max(-mt, Math.min(mt, dd)));
        T.h += Math.max(-T.perf.cl * 33.6 * dt, Math.min(T.perf.cl * 28 * dt, r.h - T.h)); for (const c of r.cm) A.dispense(W, T, c); }
    }
    if (o.flareAt != null && t >= o.flareAt && t < o.flareAt + 0.8) A.dispense(W, T, "flare");     // пастки пачкою вслід за пуском
    A.stepDecoys(W, dt); ev = A.stepMissile(m, dt, W);
    if (m.lock.mode === "decoy") seen.decoy = true; if (m.lock.mode === "mem") seen.mem = true;
  }
  return { ev, m, T, t, seen };
}
const rate = (f, n) => { let h = 0; for (let i = 0; i < n; i++) if (f()) h++; return h / n; };

/* 1. без ухилення всі типи влучають (по ударній авіації й винищувачам) */
for (const [a, tk, d] of [["r27er", "su34", 40], ["r73e", "mig29", 8], ["aam_a", "f16", 35], ["aam_c", "su27", 8], ["r27t", "tu22", 25], ["aam_b", "su35", 30]]){
  const p = rate(() => fly(a, tk, d).ev.k === "burst", 40);
  ok(p >= 0.9, `${A.AAM[a].n} по ${tk} без ухилення: ${(p * 100) | 0}%`);
}
/* 2. ухилення обізнаного винищувача суттєво знижує влучання; ближній бій ІЧ — гірше захищений за далекий */
{
  const evasive = a => rate(() => fly(a[0], "su27", a[1], { evade: true }).ev.k === "burst", 80);
  const far = evasive(["r27er", 30]), near = evasive(["r73e", 8]);
  ok(far < 0.4, `Р-27ЕР по уникаючому Су-27: ${(far * 100) | 0}% (<40%)`);
  ok(near > far, `Р-73Е (ближній бій) влучає частіше, ніж далека напівактивна: ${(near * 100) | 0}% > ${(far * 100) | 0}%`);
  const bomb = rate(() => fly("r27er", "tu95", 30, { evade: true }).ev.k === "burst", 60);
  ok(bomb > 0.7, `Ту-95 майже не вміє уникати: ${(bomb * 100) | 0}%`);
}
/* 3. теплова пастка обманює ІЧ-ракету (сильніше — стару Р-60, слабше — Р-73Е) */
{
  const r60 = rate(() => fly("r60", "su24", 10, { flareAt: 0.0 }).seen.decoy, 120), r73 = rate(() => fly("r73e", "su24", 10, { flareAt: 0.0 }).seen.decoy, 120), none = rate(() => fly("r60", "su24", 10).seen.decoy, 40);
  ok(none === 0 && r60 > 0.2, `ІЧ-ракета Р-60 піддається пастці: ${(r60 * 100) | 0}%, без пасток 0%`);
  ok(r60 >= r73, `Р-73Е стійкіша до пасток, ніж Р-60: ${(r73 * 100) | 0}% ≤ ${(r60 * 100) | 0}%`);
}
/* 4. нотч: ціль на траверзі РЛС → ракета переходить у «пам'ять»; прямо на РЛС — стабільне наведення */
{
  const beam = fly("r27er", "su34", 40, { hdg: 0, sh: { x: 0 } }), head = fly("r27er", "su34", 40, { hdg: 270 });
  ok(beam.seen.mem, "ціль на траверзі: захоплення SARH зривається в пам'ять (нотч допплера)");
  ok(!head.seen.mem && head.ev.k === "burst", "ціль лоб у лоб: наведення стабільне, влучання");
}
/* 5. втрата захоплення і повторне наведення: напівактивна ракета втрачає ціль в нотчі й знову бере її, коли ціль виходить із нього */
{
  let relock = 0, lost = 0, N = 150;
  for (let i = 0; i < N; i++){ const r = fly("r27er", "su34", 40, { evade: true }); relock += r.m.lock.relocks > 0 ? 1 : 0; lost += r.seen.mem ? 1 : 0; }
  ok(lost > 0 && relock > 0, `втрата захоплення (${lost}/${N}) і повторне наведення (${relock}/${N})`);
}
/* 6. висотні вікна ЗРК, мінімальна дальність, радіус, залежність від малої висоти */
{
  const u = { x: 0, y: 0, h: 0, R: 30 };
  const E = (h, d) => A.samEnv("osa", u, { x: d, y: 0, h });      // slant = √(d² + h²)
  ok(E(3000, 10).ok, "Оса: 3 км, 10 км — можна");
  ok(!E(8000, 10).ok && E(8000, 10).why === "too-high", "Оса: 8 км — вище стелі");
  ok(!E(10, 10).ok && E(10, 10).why === "too-low", "Оса: 10 м — нижче нижньої межі");
  ok(!E(100, 0.5).ok && E(100, 0.5).why === "min-range", "Оса: ближче мінімальної дальності (0,5 км)");
  ok(!A.samEnv("s300", { x: 0, y: 0, h: 0, R: 100 }, { x: 95, y: 0, h: 60 }).ok, "С-300: на 60 м радіус урізано горизонтом (95 км не дістає)");
  ok(A.samEnv("s400", { x: 0, y: 0, h: 0, R: 100 }, { x: 95, y: 0, h: 9000 }).ok, "С-400: 95 км на 9 км висоти — дістає");
}
/* 7. радіогоризонт і РЛС: низька ціль зникає за горизонтом, висока видна; немає допплера — гірше на тлі землі */
{
  const obs = { x: 0, y: 0, h: 40 };
  const hi = A.trackQ(150, obs, mk("su34", 100, 8000, 90, 8)), lo = A.trackQ(150, obs, mk("su34", 100, 100, 90, 8));
  ok(hi > 0.35 && lo === 0, `Су-34 на 8 км видно за 100 км (${hi.toFixed(2)}), на 100 м — за горизонтом (${lo.toFixed(2)})`);
  const pd = A.trackQ(60, { x: 0, y: 0, h: 9000 }, mk("su27", 40, 200, 90, 8), { pd: true }), np = A.trackQ(60, { x: 0, y: 0, h: 9000 }, mk("su27", 40, 200, 90, 8), { pd: false });
  ok(pd > np, "імпульсно-допплерівська РЛС краще бачить ціль над землею");
  ok(A.trackQ(100, obs, mk("s70", 60, 8000, 90, 8)) < A.trackQ(100, obs, mk("tu95", 60, 8000, 90, 8)), "малопомітний С-70 видно гірше за Ту-95");
}
/* 8. шкода: Ту-95 міцніший за винищувач; промах зменшує шкоду; hp ≤ 0 — знищено */
{
  const S = A.AAM.r27er, mm = { spec: S, pk: 1 };
  const T = mk("su27", 0, 9000, 90, 8), B = mk("tu95", 0, 9000, 90, 8);
  const rf = A.warhead(mm, T, 0.05), rb = A.warhead(mm, B, 0.05);
  ok(rf.killed, "Р-27ЕР з близького підриву вбиває Су-27");
  ok(!rb.killed && B.st.hp < 1 && B.st.hp > 0, `Ту-95 після одного влучання живий (hp ${B.st.hp.toFixed(2)})`);
  const T2 = mk("su27", 0, 9000, 90, 8), r2 = A.warhead(mm, T2, S.fz * 1.25);
  ok(!r2.killed, "підрив на краю радіуса не вбиває");
}
/* 9. енергія: на кінці польоту швидкість нижча за максимум */
{
  const r = fly("r27er", "su34", 60, { hdg: 90, v: 12 });
  ok(r.m.v < A.AAM.r27er.v * 0.95 || r.m.fl > 40, "після вигорання швидкість падає / дальність велика");
}
/* 10. пастки: запас, інтервал, лічильники */
{
  const T = mk("su27", 0, 9000, 90, 8), W = { t: 0, flares: [], chaff: [] };
  ok(A.dispense(W, T, "flare") === "flare" && A.dispense(W, T, "flare") === null, "інтервал між викидами пасток");
  W.t = 1; T.st.fl = 1; A.dispense(W, T, "flare"); W.t = 2; ok(A.dispense(W, T, "flare") === null && T.st.fl === 0, "запас пасток вичерпується");
  A.stepDecoys(W, 10); W.t = 12; A.stepDecoys(W, 0.1); ok(W.flares.length === 0, "пастки догорають");
}
