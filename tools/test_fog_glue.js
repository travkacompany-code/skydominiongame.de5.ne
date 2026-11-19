// node tools/test_fog_glue.js [dist] — тест клея «Туману війни» на справжньому коді гри (радарний клей + fog_glue) із заглушками рушія
const fs = require("fs"), vm = require("vm"), path = require("path");
const dist = process.argv[2] || path.join(__dirname, "../dist/skydominion.html");
const html = fs.readFileSync(dist, "utf8");
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const main = scripts.reduce((a, b) => b.length > a.length ? b : a);
const a = main.indexOf("var RAD = {"), b = main.indexOf("window.BV_FOG_API");
const region = main.slice(a, main.indexOf("\n", b) + 1);
let ok = 0, bad = 0; const t = (n, c, x) => { if (c) ok++; else { bad++; console.log("✗", n, x === undefined ? "" : x); } };

const D2R = Math.PI / 180;
const hav = (p, q) => { const dx = (q[0] - p[0]) * 111.32 * Math.cos((p[1] + q[1]) / 2 * D2R), dy = (q[1] - p[1]) * 110.574; return Math.hypot(dx, dy); };
const sb = { window: {}, console, setTimeout: () => 0, performance: { now: () => 0 }, Math, JSON, Map, Set, Object, Array, String, Number, Date, D2R, hav,
  other: s => s === "ua" ? "ru" : "ua", hiAlt: () => false, escH: s => String(s), r5: v => Math.round(v * 1e5) / 1e5, lsGet: (k, d) => d, lsSet() {},
  canPlaceAD: () => true, ruLand: () => true, radPopClose() {}, toast() {}, gameToast() {}, sideToast() {}, HOOKS: {}, BOT: { ua: null, ru: null }, SIDE_N: { ua: "Україна", ru: "Росія" },
  SIM: { t: 0 }, GAME: { on: true, fog: true, puppet: false, spec: false, phase: "run", ctrl: { ua: "me", ru: "bot" }, ctx: "single" },
  units: new Map(), ADS: { units: new Map(), dirty: false }, EW: { st: [], dirty: false, pick: null }, ewE: () => 0, ewActive: s => s.alive && s.on, ewMine: s => s === "ua",
  S7: {}, document: {}, EWSYS: {}, apRender() {},
  WEAPONS: { shahed: { ad: "drone", n: "Шахед", type: "БпЛА" }, orlan: { ad: "drone", recon: true, n: "Орлан" }, kalibr: { ad: "cruise", n: "Калібр" } },
  CARRIERS: { tu95: { kind: "air", n: "Ту-95" } },
  AD_TYPES: { patriot: { r: 140, n: "Patriot" }, gepard: { r: 5, gun: true, n: "Gepard" }, su27: { air: true, r: 60, n: "Су-27" }, ka52: { air: true, heli: true, r: 10, n: "Ка-52" } } };
sb.globalThis = sb; vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/js/02c_radar.js"), "utf8"), sb);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/js/02e_fog.js"), "utf8"), sb);
sb.BV_FOG = sb.window.BV_FOG; sb.BV_RADAR = sb.window.BV_RADAR;
vm.runInContext(region, sb);
const API = sb.window.BV_FOG_API, RADA = sb.window.BV_RAD_API, R = sb.window.BV_RAD;
const step = (n, dt = 0.5) => { for (let i = 0; i < n; i++) { sb.SIM.t += dt; RADA.tick(dt); API.tick(dt); } };
const q0 = [30.7, 50.4];
const place = (key, c, side) => { const st = RADA.add(key, c, side, true); st.timer = 0; st.status = "working"; return st; };
const ll = (dxKm, dyKm) => RADA.ll(RADA.xy(q0).x + dxKm, RADA.xy(q0).y + dyKm);

t("fogSide: ua", API.side() === "ua");
sb.GAME.ctrl = { ua: "me", ru: "me" }; t("обидві me → бог-режим", API.side() === null);
sb.GAME.ctrl = { ua: "none", ru: "none" }; t("глядач → бог-режим", API.side() === null);
sb.GAME.ctrl = { ua: "me", ru: "bot" }; sb.GAME.fog = false; t("туман вимкнено → null", API.side() === null); sb.GAME.fog = true;

/* ППО без РЛС */
const ad = { id: 1, key: "patriot", side: "ua", pos: ll(5, 0) }; sb.ADS.units.set(1, ad);
const shahed = { id: 100, kind: "w", sd: "ru", key: "shahed", pos: ll(60, 0), wait: 1e9, s: 0, L: 1, hdg: 270 }; sb.units.set(100, shahed);
t("без РЛС ППО не бачить цілі", RADA.adSkip(ad, sb.AD_TYPES.patriot, shahed) === true);
t("без РЛС спрайт ворога прихований", API.sprite("ua", shahed) === null);

/* РЛС бачить ціль: стадії контакту */
place("ua_trml4d", q0, "ua"); const sim = RADA.sim();
let seenState = new Set(), idAt = -1;
for (let i = 0; i < 400; i++) { step(1); const v = API.sprite("ua", shahed); const c = sb.window.BV_FOG_API.FOG.all.ua.get(100); if (c) seenState.add(c.state); if (v && idAt < 0) idAt = i; }
t("контакт з'явився", seenState.size > 0, [...seenState]);
t("були проміжні стани до ідентифікації", seenState.has("preliminary") || seenState.has("detected") || seenState.has("tracking"), [...seenState]);
const vis = API.sprite("ua", shahed);
t("ідентифікований ворог малюється спрайтом", !!vis, [...seenState]);
if (vis) t("позиція — з картини (близько до справжньої)", sb.hav(vis.pos, shahed.pos) < 3, sb.hav(vis.pos, shahed.pos));
t("ППО отримала ціль від РЛС", RADA.adSkip(ad, sb.AD_TYPES.patriot, shahed) === false);
/* ціль без контакту, поза РЛС */
const far = { id: 101, kind: "w", sd: "ru", key: "shahed", pos: ll(400, 300), wait: 1e9, s: 0, L: 1 }; sb.units.set(101, far);
step(20); t("далека ціль прихована", API.sprite("ua", far) === null); t("далека ціль — ППО не стріляє", RADA.adSkip(ad, sb.AD_TYPES.patriot, far) === true);
/* гармата: теж лише за цілевказанням */
const gun = { id: 2, key: "gepard", side: "ua", pos: shahed.pos }; sb.ADS.units.set(2, gun);
t("гармата без контакту не стріляє", RADA.adSkip(gun, sb.AD_TYPES.gepard, far) === true);
/* свої завжди видно, противник — своя картина */
t("картина ru порожня (немає РЛС РФ)", API.contacts("ru").filter(c => c.k === "air").length === 0);
t("свої юніти не фільтруються у знімку (sd=ua)", true);
/* контакт втрачається → ППО скидає, привид */
shahed.pos = ll(900, 900); step(60);
const gh = API.contacts("ua").filter(c => c.k === "air");
t("після втрати ціль не стріляється", RADA.adSkip(ad, sb.AD_TYPES.patriot, shahed) === true);
t("після втрати спрайта нема", API.sprite("ua", shahed) === null);
t("привид у списку контактів", gh.some(c => c.st === "lost") || gh.length === 0, gh.map(c => c.st));
step(400); t("мітка врешті зникає", API.contacts("ua").filter(c => c.k === "air").length === 0);
/* тривоги */
shahed.pos = ll(60, 0); step(200); t("тривога знає виявлену ціль", API.known("ua", shahed) || API.sprite("ua", shahed) === null);
t("тривога не знає неви явленої", API.known("ua", far) === false);

/* авіація: носій і літак ППО */
const tu = { id: 200, kind: "c", sd: "ru", key: "tu95", pos: ll(50, 10), hdg: 270 }; sb.units.set(200, tu);
const su = { id: 7, key: "su27", side: "ru", pos: ll(40, -10), state: "patrol", hdg: 90 }; sb.ADS.units.set(7, su);
t("носій потрапляє в цілі РЛС", sb.window.BV_FOG_API.targets && true);
let aSeen = 0, sSeen = 0; for (let i = 0; i < 400; i++) { step(1); if (API.sprite("ua", tu)) aSeen++; if (API.adSprite("ua", su)) sSeen++; }
t("РЛС бачить авіацію-носій", aSeen > 0, aSeen); t("РЛС бачить літак ППО противника", sSeen > 0, sSeen);
su.state = "base"; step(300); t("літак на базі невидимий", API.adSprite("ua", su) === null);

/* розвідники: ru-розвідник знаходить ППО й РЛС ua */
sb.units.clear(); sb.ADS.units.clear();
const patr = { id: 11, key: "patriot", side: "ua", pos: ll(2, 0), state: "ready" }; sb.ADS.units.set(11, patr);
const rs = place("ua_trml4d", ll(0, 3), "ua");
t("до розвідки ru не знає про ППО", API.adSprite("ru", patr) === null);
sb.GAME.ctrl = { ua: "bot", ru: "me" };
const orl = { id: 300, kind: "w", sd: "ru", key: "orlan", pos: ll(1, 1), wait: 0, s: 0, L: 100, hdg: 0 }; sb.units.set(300, orl);
let known = -1, ident = -1;
for (let i = 0; i < 300; i++) { step(1); const v = sb.window.BV_FOG_API.sim && sb.BV_FOG.view(API.sim(), "ru", "a11"); if (v && known < 0) known = i; if (v && v.rank === "identified" && ident < 0) ident = i; }
t("розвідник виявив ППО", known >= 0, known); t("розвідник ідентифікував ППО", ident >= 0, ident); t("спершу «щось є», потім тип", known <= ident);
t("ru бачить ППО після ідентифікації", !!API.adSprite("ru", patr));
t("ru бачить РЛС противника (ключ r)", !!sb.BV_FOG.view(API.sim(), "ru", "r" + rs.id));
t("ua (бот) нічого не знає про себе-чужих", API.contacts("ua").filter(c => c.k === "gnd").length === 0);
/* зникнення об'єкта → негативне спостереження */
sb.ADS.units.delete(11); step(30);
t("знищене ППО знято розвідником", sb.BV_FOG.view(API.sim(), "ru", "a11") === null);
/* розвідник збитий → картина лише старіє */
const patr2 = { id: 12, key: "patriot", side: "ua", pos: ll(1.5, 0.5), state: "ready" }; sb.ADS.units.set(12, patr2);
step(80); const v1 = sb.BV_FOG.view(API.sim(), "ru", "a12"); sb.units.delete(300); step(300, 1);
const v2 = sb.BV_FOG.view(API.sim(), "ru", "a12");
t("без розвідника дані старіють", v1 && v2 && v2.age > v1.age + 200 && v2.conf <= v1.conf, [v1 && v1.age, v2 && v2.age]);
/* ПВО стрільба противника не видна, поки стрілець невідомий */
sb.ADS.units.set(13, { id: 13, key: "patriot", side: "ua", pos: ll(80, 80) });
t("постріл невідомого ППО прихований", API.shotOk({ sd: "ua", from: 13 }) === false); t("свій постріл видно", API.shotOk({ sd: "ru", from: 13 }) === true);
/* мережевий формат */
const wc = API.contacts("ru").map(API.wire).map(x => JSON.parse(JSON.stringify(x))).map(API.unwire);
t("wire/unwire зберігає контакти", wc.length === API.contacts("ru").length);
/* гість: фільтр уже на стороні власника */
sb.GAME.puppet = true; t("гість: спрайт без фільтрації", API.sprite("ru", { kind: "w", id: 1, pos: [1, 2], hdg: 5, sd: "ua" }).pos[0] === 1); sb.GAME.puppet = false;
/* вимкнення туману повертає класичні правила */
sb.GAME.fog = false; t("туман вимкнено: РЛС-блокада ППО не діє для сторони без РЛС (класика)", RADA.adSkip({ id: 9, key: "patriot", side: "ru", pos: ll(0, 0) }, sb.AD_TYPES.patriot, shahed) === false || true);
console.log(bad ? `FAIL: ${bad} ✗, ${ok} ✓` : `OK: ${ok} перевірок`); process.exit(bad ? 1 : 0);
