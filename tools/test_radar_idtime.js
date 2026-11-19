/* Тест швидкості ідентифікації: від першої появи контакту на КП до «ідентифіковано» ≤ ~3 с для всіх класів РЛС. Запуск: node tools/test_radar_idtime.js */
"use strict";
const R = require("../src/js/02c_radar.js");
let fail = 0;
const types = R.CATALOG.filter(u => u.side === "ua" && R.BYID[u.id].radarClass !== "counter_battery" && u.detectionRangeKm).map(u => u.id).concat(R.CATALOG.filter(u => u.side === "ru" && u.radarClass !== "counter_battery" && u.detectionRangeKm).map(u => u.id));
for (const type of types) {
  const side = R.BYID[type].side, foe = side === "ua" ? "ru" : "ua", res = [];
  for (let seed = 1; seed <= 12; seed++) {
    const sim = R.create({ seed }); R.addStation(sim, { type, x: 0, y: 0 });
    const env = { targets: () => [{ id: "x", side: foe, x: 15, y: 10, cat: "cruise", alt: "mid" }] };
    let t0 = null, t1 = null;
    for (let t = 0; t < 120; t += 0.2) {
      R.step(sim, 0.2, env);
      const c = sim.pic[side].air[0];
      if (c && t0 == null) t0 = t;
      if (c && c.state === "identified" && t1 == null) { t1 = t; break; }
    }
    if (t0 != null && t1 != null) res.push(t1 - t0);
  }
  const mx = Math.max(...res), ok = res.length >= 6 && mx <= 3.2;
  if (!ok) fail++;
  console.log((ok ? "  ✓ " : "  ✗ ") + type.padEnd(16) + " ідентифікація після появи на КП: " + (res.length ? res.reduce((a, b) => a + b) / res.length : NaN).toFixed(2) + " с (макс " + (res.length ? mx.toFixed(1) : "—") + ", вибірок " + res.length + ")");
}
console.log(fail ? "ПРОВАЛ: " + fail : "OK");
process.exit(fail ? 1 : 0);
