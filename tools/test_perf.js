// node tools/test_perf.js — етап 7.61: новий adPick ≡ старий (випадкові дані), фізика ракети, бенчмарк.
const fs = require("fs"), vm = require("vm"), path = require("path");
const newSrc = fs.readFileSync(path.join(__dirname, "../src/js/03_game.js"), "utf8");
const oldSrc = process.argv[2] ? fs.readFileSync(process.argv[2], "utf8") : null;
const cut = s => { const a = s.indexOf("function adPick("), b = s.indexOf("/* ======", a); return s.slice(a, b); };
let ok = 0, bad = 0; const t = (n, c, x) => { if (c) ok++; else { bad++; console.log("✗", n, x === undefined ? "" : x); } };
const D2R = Math.PI / 180;
function mk(code){
  let seed = 7; const R = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const sb = { D2R, units: new Map(), HOOKS: {}, AD_CI: { drone: 0, cruise: 1, ballistic: 2, jet: 3 }, WEAPONS: { shahed: { ad: "drone" }, kalibr: { ad: "cruise" }, iskander: { ad: "ballistic" } },
    hav(a, b){ const dLat = (b[1] - a[1]) * D2R, dLon = (b[0] - a[0]) * D2R, h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * D2R) * Math.cos(b[1] * D2R) * Math.sin(dLon / 2) ** 2; return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h))); },
    adFoe: (u, t) => t.kind === "w" && !t.fall && t.sd !== (u.side || "ua"), adCls: t => sb.WEAPONS[t.key].ad, adSkipT: (u, t) => t.id % 11 === 0 };
  vm.createContext(sb); vm.runInContext(code + "\nthis.adPick = adPick;", sb); sb.R = R; return sb;
}
const N = mk(cut(newSrc)), O = oldSrc ? mk(cut(oldSrc)) : null;
let seed = 99; const R = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
let eq = 0, tot = 0, hits = 0;
for (let round = 0; round < 300; round++){
  const lat0 = 44 + R() * 22, lon0 = 24 + R() * 30;
  const us = new Map(); for (let i = 0; i < 400; i++){ const key = ["shahed", "kalibr", "iskander"][i % 3]; us.set(i, { id: i, kind: i % 17 ? "w" : "c", key, sd: i % 5 ? "ru" : "ua", fall: i % 23 === 0, pos: [lon0 + (R() - .5) * 14, lat0 + (R() - .5) * 8] }); }
  N.units = us; if (O) O.units = us;
  const shots = new Map(); for (let i = 0; i < 60; i++) shots.set((R() * 400) | 0, [1, 2, (R() * 3) | 0]);
  const T = { r: [5, 20, 60, 140, 400][round % 5], p: [50, 50, 50, 50], gun: round % 7 === 0 };
  for (const mode of ["auto", "priority", "manual"]){
    const u = { id: 1, side: "ua", pos: [lon0 + (R() - .5) * 4, lat0 + (R() - .5) * 2], mode, prio: "cruise", manual: (R() * 400) | 0 };
    const a = N.adPick(Object.assign({}, u), T, shots), b = O ? O.adPick(Object.assign({}, u), T, shots) : a;
    tot++; if ((a && a.id) === (b && b.id)) eq++; if (a) hits++;
  }
}
t("adPick: новий ≡ старий на " + tot + " випадках", eq === tot, eq + "/" + tot);
t("тест не порожній (є вибрані цілі)", hits > 50, hits);
// бенчмарк
for (const [nm, S] of [["новий", N], ["старий", O]]){
  if (!S) continue; const us = new Map(); for (let i = 0; i < 600; i++) us.set(i, { id: i, kind: "w", key: "shahed", sd: "ru", pos: [24 + R() * 14, 44 + R() * 8] }); S.units = us;
  const T = { r: 60, p: [50, 50, 50, 50] }, sh = new Map(), u = { id: 1, side: "ua", pos: [30, 48], mode: "auto" };
  const t0 = process.hrtime.bigint(); for (let i = 0; i < 4000; i++) S.adPick(u, T, sh); console.log(nm + " adPick ×4000 (600 цілей):", (Number(process.hrtime.bigint() - t0) / 1e6).toFixed(1), "мс");
}
// PHYS
const m = /const PHYS = (\{[^}]*\})/.exec(newSrc); const P = eval("(" + m[1] + ")");
t("PHYS: параметри адекватні", P.burn > 0.2 && P.burn < 0.9 && P.vmin > 0.2 && P.vmin < 1 && P.pkEdge >= 0 && P.pkEdge < 0.8 && P.pkFrom < 1);
const pkAt = fr => 1 - P.pkEdge * Math.max(0, Math.min(1, (fr - P.pkFrom) / (1 - P.pkFrom)));
t("Pk: близький пуск без штрафу", pkAt(0.3) === 1); t("Pk: на краю дальності знижено", Math.abs(pkAt(1) - (1 - P.pkEdge)) < 1e-9); t("Pk: монотонно спадає", pkAt(0.6) > pkAt(0.9));
console.log(bad ? "FAIL " + bad : "OK: " + ok + " перевірок"); process.exit(bad ? 1 : 0);
