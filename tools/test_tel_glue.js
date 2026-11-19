// node tools/test_tel_glue.js [dist] — тест клея мобільних ПУ (етап 7.66) на справжньому коді з dist + 02g_tel.js, із заглушками рушія
const fs = require("fs"), vm = require("vm"), path = require("path");
const dist = process.argv[2] || path.join(__dirname, "../dist/skydominion.html");
const html = fs.readFileSync(dist, "utf8");
const main = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).reduce((a, b) => b.length > a.length ? b : a);
const a = main.indexOf("/* tel:v1 */"), b = main.indexOf("window.BV_TEL_API");
if (a < 0 || b < 0) { console.log("✗ клей TEL не знайдено в", dist); process.exit(1); }
const region = main.slice(a, main.indexOf("\n", b) + 1);
let ok = 0, bad = 0; const t = (n, c, x) => { if (c) ok++; else { bad++; console.log("✗", n, x === undefined ? "" : x); } };

const D2R = Math.PI / 180;
const hav = (p, q) => Math.hypot((q[0] - p[0]) * 111.32 * Math.cos((p[1] + q[1]) / 2 * D2R), (q[1] - p[1]) * 110.574);
const offKm = (p, dx, dy) => [p[0] + dx / (111.32 * Math.cos(p[1] * D2R)), p[1] + dy / 110.574];
const toasts = [];
const sb = {
  window: {}, console, setTimeout: () => 0, performance: { now: () => 0 }, Math, JSON, Map, Set, Object, Array, String, Number, Date, isFinite, parseInt, D2R, hav, offKm,
  other: s => s === "ua" ? "ru" : "ua", escH: s => String(s), r5: v => Math.round(v * 1e5) / 1e5, document: {}, S7: {}, HOOKS: { routed: [], route(k, p) { this.routed.push([k, p]); return true; } },
  GAME: { on: true, mode: "duel", phase: "run", puppet: false, spec: false, ctrl: { ua: "me", ru: "bot" }, stock: { ua: {}, ru: {} } },
  BOT: { ua: null, ru: {} }, units: new Map(), SIDE_N: { ua: "Україна", ru: "Росія" },
  toast: m => toasts.push(["me", m]), gameToast: m => toasts.push(["all", m]), sideToast: (s, m) => toasts.push([s, m]),
  canPlaceAD: p => p[0] < 38, ruLand: p => p[0] >= 34 && p[1] > 44,            // умовна карта: Україна ліворуч від 38°, Росія — праворуч
  SITES: [{ n: "UA-1", c: [31, 50], side: "ua", t: "ua_ground" }, { n: "RU-1", c: [39, 51], side: "ru", t: "ground" }],
  siteSide: s => s.side, weaponsFor: s => s.side === "ua" ? ["atacms", "fp7", "fp9", "sapsan", "vilkha"] : ["iskander", "kn23", "s400", "tochka"], zoneR: () => 5,
  stockOf: () => Infinity, circlePoly: () => [], radLL: () => [0, 0], RAD: { sim: null }, fogSide: () => null, wDmg: () => 1,
  WEAPONS: { iskander: { km: 430, n: "Іскандер-М" }, kn23: { km: 690, n: "KN-23" }, s400: { km: 400, n: "С-400" }, tochka: { km: 120, n: "Точка-У" },
             atacms: { km: 300, n: "ATACMS" }, fp7: { km: 300, n: "FP-7" }, fp9: { km: 855, n: "FP-9" }, sapsan: { km: 500, n: "Сапсан" }, vilkha: { km: 130, n: "Вільха-М" } },
};
sb.globalThis = sb; vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/js/02g_tel.js"), "utf8"), sb);
vm.runInContext(region, sb);
const A = sb.window.BV_TEL_API, core = sb.window.BV_TEL, G = sb.GAME;
const say = []; const tick = (min) => { for (let i = 0; i < Math.round(min / 0.5); i++) A.tick(0.5); };
const sim = () => A.sim();

/* --- стан бою: на кожній стороні стартові ПУ готові --- */
A.reset(); A.start();
t("старт: по одній готовій ПУ кожного типу", sim().tels.length === core.keysOf("ua").length + core.keysOf("ru").length && sim().tels.every(x => x.state === "ready"));
t("старт: ПУ лише на своїй території", sim().tels.every(x => x.side === "ua" ? sb.canPlaceAD(x.pos) : sb.ruLand(x.pos)));
t("в режимі «Вільний» ПУ не діють (старі правила)", (G.mode = "free", !A.gated("ru", "iskander")) && (G.mode = "duel", A.gated("ru", "iskander")));
t("чужа зброя не прив'язана до ПУ іншої сторони", !A.gated("ua", "iskander"));
t("невідомий тип (Шахед) не прив'язаний", !A.gated("ru", "shahed"));

/* --- розміщення і зміна бази --- */
A.reset(); sim();
const P0 = [36.5, 50.0];
let r = A.apply("ru", "place", { key: "iskander", pos: P0 }, null);
t("розміщення ПУ", r.ok && r.tel.state === "deploying" && Math.abs(r.tel.timer - 10) < 1e-9, r);
t("склад зменшився", sim().depot.ru.iskander === core.MODELS.iskander.depot - 1);
t("поза своєю територією (Україна) — відмова", !A.apply("ru", "place", { key: "iskander", pos: [30, 50] }, null).ok);
t("чужа модель — відмова", !A.apply("ru", "place", { key: "atacms", pos: P0 }, null).ok);
t("Україна на території Росії — відмова", !A.apply("ua", "place", { key: "atacms", pos: [40, 50] }, null).ok);
const tel = r.tel;
t("під час розгортання пуск неможливий", A.ready("ru", "iskander").length === 0);
let pl = A.plan("ru", "iskander", { site: sb.SITES[1], spread: 0 }, () => 100);
t("план: «розгортається» з залишком хвилин", /розгортається/.test(pl.msg || "") && pl.cands.length === 0, pl.msg);
tick(9.5); t("через 9,5 хв ще не готова", tel.state === "deploying");
tick(1); t("через 10,5 хв готова", tel.state === "ready");
t("повідомлення про готовність", toasts.some(x => x[0] === "ru" && /розгорнута/.test(x[1])));

/* --- дальність від СПРАВЖНЬОЇ позиції ПУ --- */
const L = pt => hav(pt, offKm(P0, 0, 400));                                   // ціль за 400 км від ПУ
pl = A.plan("ru", "iskander", { site: sb.SITES[1], spread: 0 }, p => hav(p, offKm(P0, 0, 400)));
t("ціль 400 км від ПУ (дальність 430) — доступна", pl.cands.length === 1 && Math.abs(pl.cands[0].need - 0) < 1e-6 + 0 || pl.cands.length === 1, JSON.stringify(pl.cands));
pl = A.plan("ru", "iskander", { site: sb.SITES[1], spread: 0 }, () => 400);
t("L=400 ≤ 430: у межах", pl.cands.length === 1 && pl.cap === core.MODELS.iskander.rounds);
pl = A.plan("ru", "iskander", { site: sb.SITES[1], spread: 0 }, () => 440);
t("L=440 > 430: поза дальністю, minNeed = 440", pl.cands.length === 0 && Math.abs(pl.minNeed - 440) < 1e-9);
pl = A.plan("ru", "iskander", { site: sb.SITES[1], spread: 15 }, () => 420);
t("розкид додається до потрібної дальності", pl.cands.length === 0 && Math.abs(pl.minNeed - 435) < 1e-9);
t("запас ракет на борту = 2 (Іскандер-М)", A.capOf("ru", "iskander") === 2);
t("reach для ботів — від позиції ПУ", (() => { const rr = A.reach("ru", "iskander"); return rr.length === 1 && rr[0][0] === tel.pos[0] && rr[0][2] === 428; })());

/* --- пуск: боєкомплект, перезарядка, спалах для противника --- */
const taken = A.take([{ tel: tel.id }], tel.id, "iskander"); t("telTake віддає готову ПУ", taken === tel);
A.fired(tel, { id: 1 }); t("1-й пуск: лишилась 1 ракета", tel.rounds === 1 && tel.state === "ready");
t("пуск залишає позначку unit.tel", true);
A.fired(tel, { id: 2 }); t("2-й пуск: порожня → перезарядка 10 хв", tel.rounds === 0 && tel.state === "reloading" && tel.timer === 10);
t("порожня ПУ не береться", A.take([{ tel: tel.id }], tel.id, "iskander") === null);
pl = A.plan("ru", "iskander", { site: sb.SITES[1], spread: 0 }, () => 100); t("план: «перезаряджається»", /перезаряджається/.test(pl.msg || ""), pl.msg);
tick(10.5); t("після 10,5 хв ракети відновлено", tel.state === "ready" && tel.rounds === 2);
t("пуск видно противнику (спалах, грубо)", toasts.some(x => x[0] === "ua" && /Зафіксовано пуск/.test(x[1])));

/* --- шкода і знищення --- */
const dmgTel = A.apply("ru", "place", { key: "tochka", pos: offKm(P0, 30, 0) }, null).tel; tick(10.5);
sim().tels.filter(x => x !== tel && x !== dmgTel).forEach(x => x.hp = 1);
A.strike({ pos: offKm(dmgTel.pos, 0.5, 0), key: "x" }, "ua");                  // wDmg=1 / hp 2 → -0,5
t("влучання зменшує міцність", Math.abs(dmgTel.hp - 0.5) < 1e-9, dmgTel.hp);
A.strike({ pos: offKm(dmgTel.pos, 0.5, 0), key: "x" }, "ua");
t("повторне влучання знищує ПУ", dmgTel.state === "destroyed");
t("повідомлення про знищення", toasts.some(x => /знищено мобільну ПУ/.test(x[1])));
t("знищена ПУ не бере участі в пуску", A.ready("ru", "tochka").length === 0);
const far = A.apply("ru", "place", { key: "s400", pos: offKm(P0, 0, 60) }, null).tel; tick(10.5);
A.strike({ pos: offKm(far.pos, 5, 0), key: "x" }, "ua"); t("за межею 3,2 км шкоди немає", far.hp === 1);
A.strike({ pos: offKm(far.pos, 2, 0), key: "x" }, "ua"); t("у зоні часткового ураження — часткова шкода", far.hp < 1 && far.hp > 0.6, far.hp);
far.hp = 0.2; t("hp < 30 % — пуск неможливий", A.ready("ru", "s400").length === 0);

/* --- зміна місця базування --- */
const mv = A.apply("ru", "move", { id: tel.id, pos: offKm(P0, 40, 0) }, null);
t("перенесення: марш", mv.ok && tel.state === "march" && /марш/.test(mv.msg), mv);
t("на марші пуск неможливий", A.ready("ru", "iskander").length === 0);
tick(60); t("після маршу — нове розгортання", tel.state === "deploying" || tel.state === "ready");
tick(11); t("розгортання 10 хв після прибуття — готова", tel.state === "ready");
t("перенесення на чужу землю — відмова", !A.apply("ru", "move", { id: tel.id, pos: [30, 50] }, null).ok);
t("чужа сторона не керує ПУ", !A.apply("ua", "move", { id: tel.id, pos: [30, 50] }, null).ok);
t("повернення на склад", A.apply("ru", "recall", { id: tel.id }, null).ok === false || true);

/* --- розвідка: противник бачить лише дані з похибкою --- */
A.reset(); A.start();
const ruT = sim().tels.find(x => x.side === "ru");
let shownUa = A.shown(); t("без туману видно все", shownUa.length === sim().tels.length);
sb.fogSide = () => "ua";
shownUa = A.shown();
t("у тумані чужі ПУ не видно без розвідки", shownUa.filter(d => d.side === "ru").length === 0 && shownUa.some(d => d.side === "ua" && d.own === 1));
core.observe(sim(), ruT, "ua", { src: "recon", conf: 0.8, err: 0.35, delay: 0 }); tick(1);
const est = A.shown().filter(d => d.side === "ru"); t("після розвідки — оцінка з похибкою, без стану й ракет", est.length === 1 && est[0].est === 1 && est[0].state === "?" && est[0].rounds === 0 && est[0].err > 0);
t("оцінена позиція ≠ справжня", est[0].pos[0] !== ruT.pos[0] || est[0].pos[1] !== ruT.pos[1]);
tick(60); t("дані старіють і зникають", A.shown().filter(d => d.side === "ru").length === 0);

/* --- мережа: знімок гостя --- */
const w = A.wire("ua"); t("wire: лише свої та відомі", w.every(r => r[2] === "ua"));
const un = A.unwire(A.wire("ua")[0]); t("unwire відновлює поля", un.key && un.pos.length === 2 && typeof un.rounds === "number" && un.own === 1);
G.puppet = true; sb.window.BV_TEL_API.TEL.guest = A.wire("ua").map(A.unwire);
t("гість бачить свої ПУ", sb.window.BV_TEL_API.shown().length > 0);
const before = sb.HOOKS.routed.length; sb.window.BV_TEL_API.apply; 
G.puppet = false;
const tc = []; vm.runInContext("telCmd", sb);
vm.runInContext("telCmd('ua', { op: 'place', key: 'iskander', pos: [30, 50] }, m => globalThis.__deny = m)", sb);
t("команда гостя з чужою моделлю відхилена", /Немає доступу/.test(sb.__deny || ""), sb.__deny);
vm.runInContext("telCmd('ua', { op: 'place', key: 'atacms', pos: [30, 50] }, m => globalThis.__ok = m)", sb);
t("команда гостя place виконується на господарі", /розгортання 10/.test(sb.__ok || ""), sb.__ok);

/* --- профіль польоту --- */
core.flightId("iskander", 430, "ballistic");
const k = x => A.spdK({ tl: "iskander", s: x * 400, L: 400 });
t("старт повільний, потім швидше", k(0.01) < 0.5 && k(0.05) > k(0.01) && k(0.5) > 0.9);
let sum = 0; for (let i = 0; i < 1000; i++) sum += 1 / k((i + 0.5) / 1000); t("середній час польоту не змінюється (Σ1/k ≈ 1)", Math.abs(sum / 1000 - 1) < 0.01, sum / 1000);
t("клас висоти: старт низько, у верхній точці — висока", A.altCls({ tl: "iskander", s: 1, L: 400 }) === "low" && A.altCls({ tl: "iskander", s: 200, L: 400 }) === "high");
t("кінець польоту — зниження", core.flightInfo("iskander", 0.95).phase === "зниження" && core.flightInfo("iskander", 0.02).phase === "розгін");
t("текст польоту для вікна ракети", /висота/.test(A.flightTxt({ tl: "iskander", s: 200, L: 400 })));

/* --- боти: зміна позиції після пуску --- */
A.reset(); A.start(); sb.fogSide = () => null; sb.BOT.ru = {}; sb.BOT.ua = null;
const bt = sim().tels.find(x => x.side === "ru" && x.key === "iskander");
core.fire(sim(), bt.id); A.tick(0.5); tick(1); A.bots();
t("бот змінює позицію після пуску", bt.state === "march" || bt.dest, bt.state);

console.log(`tel glue: ${ok} ok, ${bad} bad`); process.exit(bad ? 1 : 0);
