// node tools/test_flight.js — етап 7.62: вітер, радіогоризонт, інерція швидкості, пальне/бінго (функції з src/js/03_game.js на заглушках)
const fs = require("fs"), vm = require("vm"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "../src/js/03_game.js"), "utf8");
let ok = 0, bad = 0; const t = (n, c, x) => { if (c) ok++; else { bad++; console.log("✗", n, x === undefined ? "" : x); } };
const slice = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error("немає блоку " + a + " .. " + b); return src.slice(i, j); };
const D2R = Math.PI / 180;
const sb = { D2R, SIM: { t: 0 }, window: {}, DSPEC: { shahed: { v: 185 }, iskander: { v: 7000 } }, WEAPONS: { shahed: {}, iskander: {}, rv: { child: true } },
  AIR: { cruise: 7, chase: 11, turn: 55 }, airK: T => T.k || 1, airM: () => 1, AD_TYPES: { su27: { k: 1, heli: false, n: "Су-27" }, ka52: { k: 0.5, heli: true, n: "Ка-52" } },
  hav: (a, b) => Math.hypot((b[0] - a[0]) * 71, (b[1] - a[1]) * 111), nearestAirfield: () => ({ c: [30, 50] }) };
vm.createContext(sb);
vm.runInContext(slice("const WINDX = {", "/* perf:v1 — повторно"), sb);
vm.runInContext(slice("const RAD_HT", "function radSim"), sb);
vm.runInContext(slice("const AIRX =", "function airFollow"), sb);
vm.runInContext("this.W = WINDX; this.windK = windK; this.radLos = radLos; this.AIRX = AIRX; this.airSpeed = airSpeed; this.airFuelStep = airFuelStep; this.airTurnK = airTurnK; this.turnTo = turnTo;", sb);
const { W } = sb;
/* вітер */
W.base = 9; W.dir = 270; W.on = true; sb.SIM.t = 0; W.t = -1;         // дме із заходу → на схід
const east = { key: "shahed", hdg: 90 }, west = { key: "shahed", hdg: 270 }, north = { key: "shahed", hdg: 0 };
const ke = sb.windK(east), kw = sb.windK(west), kn = sb.windK(north);
t("вітер: попутний — швидше", ke > 1.05, ke); t("вітер: зустрічний — повільніше", kw < 0.95, kw); t("вітер: боковий ≈ нейтральний", Math.abs(kn - 1) < 0.03, kn);
t("вітер: Шахед ±15–20 % при 9 м/с", ke > 1.12 && ke < 1.25 && kw > 0.75 && kw < 0.88, [ke, kw]);
t("вітер: балістика не відчуває", sb.windK({ key: "iskander", hdg: 90 }) < 1.01 && sb.windK({ key: "iskander", hdg: 90 }) > 0.99 || sb.windK({ key: "iskander", hdg: 90 }) === 1, sb.windK({ key: "iskander", hdg: 90 }));
t("вітер: бойовий блок (child) без впливу", sb.windK({ key: "rv", hdg: 90 }) === 1);
W.on = false; t("вітер вимкнено → 1", sb.windK(east) === 1); W.on = true;
let lo = 9, hi = 0; for (let tt = 0; tt < 2000; tt += 7){ sb.SIM.t = tt; const m = (W.t = -1, sb.windK(east)); lo = Math.min(lo, m); hi = Math.max(hi, m); }
t("вітер: межі [0,7; 1,3] і пориви змінюють значення", lo >= 0.7 && hi <= 1.3 && hi - lo > 0.05, [lo, hi]);
/* радіогоризонт */
t("LOS: ціль зблизька видна", sb.radLos(0, 0, 30, 0, "low") === 1);
t("LOS: Шахед (120 м) за 90 км — поза горизонтом", sb.radLos(0, 0, 90, 0, "low") === 0, sb.radLos(0, 0, 90, 0, "low"));
t("LOS: плавний спад біля горизонту", (() => { const a = sb.radLos(0, 0, 73, 0, "low"), b = sb.radLos(0, 0, 80, 0, "low"); return a > b && a < 1 && b > 0; })());
t("LOS: висотна ціль видна за 300 км", sb.radLos(0, 0, 300, 0, "high") === 1 && sb.radLos(0, 0, 500, 0, "high") === 1);
t("LOS: FPV (30 м) за 40 км не видно", sb.radLos(0, 0, 60, 0, "ground") === 0);
t("LOS: монотонно спадає з відстанню", [20, 60, 75, 85, 100].map(d => sb.radLos(0, 0, d, 0, "low")).every((v, i, a) => i === 0 || v <= a[i - 1]));
/* інерція швидкості */
const T = sb.AD_TYPES.su27, u = { key: "su27", hdg: 0, sp: 0 };
let v = 0; for (let i = 0; i < 10; i++) v = sb.airSpeed(u, T, 11, 0.1);
t("швидкість: розгін поступовий, не миттєвий", v > 7 && v < 11, v);
for (let i = 0; i < 100; i++) v = sb.airSpeed(u, T, 11, 0.1);
t("швидкість: виходить на форсаж 11", Math.abs(v - 11) < 1e-9, v);
for (let i = 0; i < 100; i++) v = sb.airSpeed(u, T, 7, 0.1);
t("швидкість: гальмування до крейсерської", Math.abs(v - 7) < 1e-9, v);
t("розворот: на форсажі повільніший", (() => { u.sp = 11; const a = sb.airTurnK(u, T); u.sp = 7; const b = sb.airTurnK(u, T); return a < b && b === 1; })());
/* пальне / бінго */
const f = { key: "su27", side: "ua", pos: [30, 51], home: [30, 50], sp: 7, fuel: 1 };
let sec = 0, bingo = false; while (!bingo && sec < 2000){ bingo = sb.airFuelStep(f, T, 1); sec++; }
t("пальне: бінго настає раніше повного вигорання", bingo && f.fuel > 0, [sec, f.fuel]);
t("пальне: на крейсері час до бінго близький до 0,75·ресурс", sec > 0.6 * 360 && sec < 0.85 * 360, sec);
const g = { key: "su27", side: "ua", pos: [30, 51], home: [30, 50], sp: 11, fuel: 1 }; let s2 = 0, b2 = false; while (!b2 && s2 < 2000){ b2 = sb.airFuelStep(g, T, 1); s2++; }
t("пальне: форсаж спалює у ~3 рази швидше", s2 < sec / 2.5, [s2, sec]);
const far = { key: "su27", side: "ua", pos: [34, 52], home: [30, 50], sp: 7, fuel: 0.33 };
t("бінго: далеко від бази — раніше", sb.airFuelStep(far, T, 0.01) === true);
const near = { key: "su27", side: "ua", pos: [30, 50.1], home: [30, 50], sp: 7, fuel: 0.45 };
t("бінго: біля бази — ще рано", sb.airFuelStep(near, T, 0.01) === false);
const fresh = { key: "su27", side: "ua", pos: [30, 50], home: [30, 50] }; sb.airFuelStep(fresh, T, 0); t("пальне: ініціалізується повним", fresh.fuel === 1);
const h = { key: "ka52", side: "ru", pos: [30, 51], home: [30, 50], sp: 3.5, fuel: 1 }; sb.airFuelStep(h, sb.AD_TYPES.ka52, 10); t("вертоліт: пальне теж спалюється", h.fuel < 1 && h.fuel > 0.9, h.fuel);
console.log(bad ? "FAIL " + bad : "OK: " + ok + " перевірок"); process.exit(bad ? 1 : 0);
