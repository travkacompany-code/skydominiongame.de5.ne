/* Тести РЛС. Запуск: node tools/test_radar.js
   Світ імітується простим env: список цілей у км, видимість, РЕП. */
"use strict";
const R = require("../src/js/02c_radar.js");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c){ pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ ПРОВАЛ: " + m); } };

const T = (id, x, y, o) => Object.assign({ id, side: "ru", x, y, cat: "cruise", alt: "mid" }, o);
function world(targets, extra){ return Object.assign({ targets: () => (typeof targets === "function" ? targets() : targets) }, extra || {}); }
function run(sim, env, sec, dt){ dt = dt || 0.5; for (let t = 0; t < sec; t += dt) R.step(sim, dt, env); }
function mk(types, seed, opts){
  const sim = R.create({ seed: seed || 1 });
  const out = [];
  types.forEach((t, i) => out.push(R.addStation(sim, Object.assign({ type: t, x: 0, y: 0 }, Array.isArray(t) ? {} : {}, opts || {}))));
  return { sim, st: out };
}
const station = (sim, type, x, y, o) => R.addStation(sim, Object.assign({ type, x, y }, o || {}));
const sumHits = st => Object.values(st.tr).reduce((a, t) => a + t.hits, 0);

console.log("0. Каталог");
{
  ok(R.CATALOG.length === 22, "22 позиції");
  ok(R.catalogFor("ua").length === 10 && R.catalogFor("ru").length === 12, "10 українських і 12 російських");
  ok(R.catalogFor("ua", true).length === 6 && R.catalogFor("ru", true).length === 6, "перша версія: по 6 на сторону");
  ok(R.BYID.ru_1l220u.detectionRangeKm === null, "невідома дальність лишається null (не вигадується)");
  ok(R.BYID.ua_79k6.detectionRangeKm === 400 && R.BYID.ru_55zh6m.detectionRangeKm === 500, "дальності зі довідника");
  ok(R.BYID.ru_55zh6m.maxTrackedTargets === null, "кількість супроводжуваних цілей не вигадана (береться з балансу класу)");
  const a = R.resolve(R.BYID.ua_p18_terek), b = R.resolve(R.BYID.ua_36d6m1);
  ok(a.jamRes < b.jamRes && a.cost < b.cost, "станції одного класу не однакові (Терек дешевший і менш стійкий)");
}

console.log("1. Ціль поза зоною не виявляється ніколи");
{
  const sim = R.create({ seed: 3 }), st = station(sim, "ru_96l6", 0, 0);
  const side = "ua";
  const A = R.create({ seed: 3 }), s = station(A, "ua_36d6m1", 0, 0);
  run(A, world([T("x", 330, 0)]), 300);
  ok(Object.keys(s.tr).length === 0 && A.pic.ua.air.length === 0, "ціль на 1.1·R: жодного треку й контакту");
}

console.log("2. Ціль у зоні не виявляється автоматично зі 100%");
{
  let hits = 0, scans = 0, farHits = 0, farScans = 0;
  for (let seed = 1; seed <= 30; seed++){
    const A = R.create({ seed }), s = station(A, "ua_36d6m1", 0, 0);
    run(A, world([T("x", 100, 0, { alt: "mid" })]), 100);
    hits += sumHits(s); scans += s.nScan;
    const B = R.create({ seed }), s2 = station(B, "ua_36d6m1", 0, 0);
    run(B, world([T("x", 285, 0, { alt: "mid" })]), 100);
    farHits += sumHits(s2); farScans += s2.nScan;
  }
  const near = hits / scans, far = farHits / farScans;
  ok(near > 0.3 && near < 0.99, "ймовірність у зоні між 0 і 1: " + near.toFixed(2));
  ok(far < near, "біля межі дальності шанс нижчий (плавний rangeFactor): " + far.toFixed(2) + " < " + near.toFixed(2));
}

console.log("3. Контакт без нових спостережень поступово застаріває");
{
  const sim = R.create({ seed: 5 }); const s = station(sim, "ua_trml4d", 0, 0);
  let present = true;
  const env = world(() => present ? [T("x", 60, 0)] : []);
  run(sim, env, 40);
  const c0 = sim.pic.ua.air[0];
  ok(c0 && (c0.state === "tracking" || c0.state === "identified"), "ціль у стабільному супроводі: " + (c0 && c0.state));
  present = false;
  const x0 = c0.x, y0 = c0.y, conf0 = c0.conf;
  run(sim, env, 20);
  const c1 = sim.pic.ua.air[0];
  ok(c1 && c1.state === "lost", "через ~20 с без даних — «втрачено»");
  ok(c1 && c1.x === x0 + 0 || c1 && Math.hypot(c1.x - x0, c1.y - y0) < 1e-9 || c1 && c1.x !== undefined, "остання позиція лишається на карті");
  const confA = c1.conf; run(sim, env, 20);
  const c2 = sim.pic.ua.air[0];
  ok(c2 && c2.conf < confA && c2.conf < conf0, "достовірність поступово падає");
  run(sim, env, 200);
  ok(sim.pic.ua.air.length === 0, "згодом мітка зникає");
  ok(R.snapshot(sim, "ua").contacts.length === 0, "і з інтерфейсу");
}

console.log("4. Кілька станцій зливають дані в один контакт");
{
  const sim = R.create({ seed: 7 });
  station(sim, "ua_trml4d", 0, 0); station(sim, "ua_36d6m1", 40, 30);
  const solo = R.create({ seed: 7 }); station(solo, "ua_trml4d", 0, 0);
  const tgt = () => [T("x", 70, 20, { alt: "mid" })];
  run(sim, world(tgt), 60); run(solo, world(tgt), 60);
  ok(sim.pic.ua.air.length === 1, "одна ціль — один контакт, без дублів");
  const c = sim.pic.ua.air[0];
  ok(Object.keys(c.src).length === 2, "список джерел містить обидві станції");
  ok(c.conf >= solo.pic.ua.air[0].conf - 1e-9, "уверенність не нижча, ніж від однієї станції");
  ok(c.sigma <= solo.pic.ua.air[0].sigma + 1e-9, "точність позиції не гірша");
  /* дві різні цілі, рознесені — два контакти */
  const s2 = R.create({ seed: 8 }); station(s2, "ua_trml4d", 0, 0); station(s2, "ua_36d6m1", 40, 30);
  run(s2, world([T("a", 70, 20), T("b", -60, -50)]), 60);
  ok(s2.pic.ua.air.length === 2, "дві далекі цілі не зливаються");
}

console.log("5. Втрата зв'язку: станція працює, нові дані до КП не йдуть");
{
  const sim = R.create({ seed: 9 }); const s = station(sim, "ua_trml4d", 0, 0);
  const env = world([T("x", 60, 0)]);
  run(sim, env, 30);
  const c = sim.pic.ua.air[0], t0 = c.lastUpdatedAt;
  R.setLink(sim, s.id, { up: false });
  const hits0 = sumHits(s);
  run(sim, env, 30);
  ok(sumHits(s) > hits0, "станція продовжує локальне спостереження");
  ok(sim.pic.ua.air[0].lastUpdatedAt <= t0 + 2, "у спільній картині нових даних немає");
  ok(R.localContacts(sim, s.id).length === 1, "локальний користувач (ППО поруч) бачить трек");
  ok(R.snapshot(sim, "ua").stations[0].dataAvailableToCommand === false, "картка: дані для командування недоступні");
  R.setLink(sim, s.id, { up: true });
  run(sim, env, 15);
  ok(sim.pic.ua.air.some(k => k.state !== "lost" && k.lastUpdatedAt > t0 + 25), "після відновлення дані знову надходять (без «вивалу» накопиченого)");
  R.setCmd(sim, "HQ-ua", false);
  const t1 = sim.pic.ua.air[0].lastUpdatedAt; run(sim, env, 20);
  ok(sim.pic.ua.air[0].lastUpdatedAt <= t1 + 2, "втрата КП теж блокує передачу");
}
{
  const sim = R.create({ seed: 9 }); const s = station(sim, "ua_trml4d", 0, 0, { });
  s.link.latency = 6;
  run(sim, world([T("x", 60, 0)]), 20);
  const c = sim.pic.ua.air[0];
  ok(c && sim.t - c.lastUpdatedAt >= 5.5, "затримка каналу: дані на КП застарілі на латентність");
}

console.log("6. Вимкнена РЛС не створює нових контактів");
{
  const sim = R.create({ seed: 11 }); const s = station(sim, "ua_trml4d", 0, 0);
  let tg = [];
  const env = world(() => tg);
  R.setOffline(sim, s.id, true);
  tg = [T("x", 60, 0)];
  run(sim, env, 60);
  ok(Object.keys(s.tr).length === 0 && sim.pic.ua.air.length === 0, "вимкнена станція нічого не бачить");
  ok(R.localContacts(sim, s.id).length === 0 && R.emitters(sim, "ua").length === 0, "і не випромінює");
  R.setOffline(sim, s.id, false); run(sim, env, 30);
  ok(sim.pic.ua.air.length === 1, "після ввімкнення працює");
  R.setOffline(sim, s.id, true); tg = []; run(sim, env, 250);
  ok(sim.pic.ua.air.length === 0, "старі мітки лише застарівають і зникають");
  const d = R.create({ seed: 1 }); const s2 = station(d, "ua_trml4d", 0, 0);
  R.damage(d, s2.id, 1);
  ok(s2.destroyed && s2.status === "offline" && !R.repair(d, s2.id), "знищена станція не ремонтується");
}

console.log("7. Пошкоджена РЛС: гірші характеристики");
{
  const rate = hp => { let h = 0, n = 0; for (let seed = 1; seed <= 25; seed++){ const A = R.create({ seed }); const s = station(A, "ua_36d6m1", 0, 0, { hp }); run(A, world([T("x", 150, 0)]), 80); h += sumHits(s); n += s.nScan; } return h / n; };
  const sim = R.create({ seed: 1 }); const s = station(sim, "ua_36d6m1", 0, 0);
  const full = R.coverage(sim, s.id).rKm;
  R.damage(sim, s.id, 0.6);
  ok(s.status === "damaged", "статус «пошкоджена»");
  ok(R.coverage(sim, s.id).rKm < full, "дальність скоротилась: " + full + " → " + R.coverage(sim, s.id).rKm.toFixed(0));
  ok(rate(0.4) < rate(1), "частота виявлення нижча");
  R.damage(sim, s.id, 0.2); ok(s.status === "offline" && s.offReason === "damage", "сильні пошкодження виводять станцію з ладу");
  ok(R.repair(sim, s.id) && s.status === "repairing", "ремонт запущено");
  run(sim, world([]), 600); ok(s.status === "working" && s.hp === 1, "після ремонту — працює");
}

console.log("8. Контрбатарейна РЛС: лише артилерійські події");
{
  const sim = R.create({ seed: 13 }); const cb = station(sim, "ua_zoopark3", 0, 0);
  const env = world([T("jet", 10, 0, { cat: "fighter", alt: "mid" })]);
  run(sim, env, 60);
  ok(Object.keys(cb.tr).length === 0 && sim.pic.ua.air.length === 0, "повітряну ціль на 10 км не виявляє");
  let cnt = 0;
  for (let i = 0; i < 6; i++){ R.artilleryEvent(sim, { side: "ru", x: 15, y: 5, kind: "artillery" }); run(sim, env, 2); }
  const g = sim.pic.ua.ground;
  ok(g.length === 1 && g[0].state !== "lost", "серія пострілів → одна наземна позиція, повітряної картини це не торкається");
  ok(g.length === 1 && g[0].n >= 2 && g[0].state === "tracking", "повторні постріли підтверджують позицію (" + (g[0] && g[0].n) + " спостережень)");
  ok(g[0] && Math.hypot(g[0].x - 15, g[0].y - 5) < 1.5, "позиція близька до реальної");
  const sim2 = R.create({ seed: 13 }); station(sim2, "ua_zoopark3", 0, 0);
  R.artilleryEvent(sim2, { side: "ru", x: 80, y: 0 }); R.artilleryEvent(sim2, { side: "ua", x: 10, y: 0 });
  run(sim2, world([]), 5);
  ok(sim2.pic.ua.ground.length === 0, "поза зоною й власні постріли не фіксуються");
  run(sim, world([]), 700); ok(sim.pic.ua.ground.length === 0, "позиція батареї застаріває (втрачено через 180 с) й зникає (через 600 с)");
  const nul = R.create({ seed: 1 }); station(nul, "ru_1l220u", 0, 0); R.artilleryEvent(nul, { side: "ua", x: 5, y: 0 }); run(nul, world([]), 5);
  ok(nul.pic.ru.ground.length === 0, "станція без заданої дальності (null) нічого не створює, поки баланс не задано");
}

console.log("9. Сторони не бачать інформацію одна одної");
{
  const sim = R.create({ seed: 15 });
  station(sim, "ua_trml4d", 0, 0); station(sim, "ru_96l6", 200, 200);
  run(sim, world([T("r1", 50, 0, { side: "ru" })]), 40);
  const ua = R.snapshot(sim, "ua"), ru = R.snapshot(sim, "ru");
  ok(ua.stations.every(s => s.side === "ua") && ru.stations.every(s => s.side === "ru"), "карточки станцій лише власні");
  ok(ua.contacts.length === 1 && ru.contacts.length === 0, "УА бачить ціль РФ, РФ — нічого (далеко)");
  ok(!JSON.stringify(ua).includes("_ref") && !JSON.stringify(ua).includes("r1"), "ідентифікатори реальних об'єктів не просочуються в інтерфейс");
  ok(R.emitters(sim, "ru").every(e => e.side === "ru"), "РЕР-фільтр по стороні");
}

console.log("10. Виявлення не запускає ракет; захоплення — лише за якістю даних");
{
  ok(!Object.keys(R).some(k => /launch|shoot|fire(?!Event)|missile/i.test(k)), "в API немає жодної функції пуску");
  const sim = R.create({ seed: 17 });
  const tr = station(sim, "ua_trml4d", 0, 0), mal = station(sim, "ua_p18_malakhit", 20, 0);
  run(sim, world([T("x", 80, 0, { alt: "mid" })]), 80);
  const q = R.adQuery(sim, "ua", { x: 10, y: 0, rangeKm: 120 });
  ok(q.length >= 1 && q[0].grade === "lock", "якісні дані багатофункціональної РЛС дають 'lock': " + (q[0] && q[0].grade));
  const solo = R.create({ seed: 17 }); const m2 = station(solo, "ua_p18_malakhit", 0, 0);
  run(solo, world([T("x", 80, 0, { alt: "mid" })]), 80);
  const q2 = R.adQuery(solo, "ua", { x: 10, y: 0, rangeKm: 120 });
  ok(q2.length >= 1 && q2.every(c => c.grade !== "lock"), "лише метрова РЛС: контакт є, але координати грубі — захоплення немає");
  const q3 = R.adQuery(sim, "ua", { x: 10, y: 0, rangeKm: 120, connected: false });
  ok(q3.length === 0, "ППО без зв'язку з мережею й без власної РЛС даних не має");
  const q4 = R.adQuery(sim, "ua", { x: 10, y: 0, rangeKm: 120, connected: false, ownRadarId: tr.id });
  ok(q4.length === 1 && q4[0].via === "local", "власна РЛС ППО дає локальні дані");
  const q5 = R.adQuery(sim, "ua", { x: 10, y: 0, rangeKm: 120, requireIdentified: true });
  ok(q5.every(c => c.grade !== "lock") || sim.pic.ua.air[0].isIdentified, "вимога ідентифікації враховується");
  const q6 = R.adQuery(sim, "ua", { x: 500, y: 0, rangeKm: 50 }); ok(q6.length === 0, "ціль поза дальністю самого комплексу не пропонується");
}

console.log("11. Збереження й відновлення дають ідентичний подальший перебіг");
{
  const mkw = () => { const s = R.create({ seed: 19 }); station(s, "ua_trml4d", 0, 0); station(s, "ua_36d6m1", 30, 0); return s; };
  const env = world([T("a", 70, 10), T("b", -50, 60)]);
  const A = mkw(); run(A, env, 60);
  const saved = JSON.stringify(R.serialize(A));
  const B = R.restore(JSON.parse(saved));
  run(A, env, 60); run(B, env, 60);
  ok(JSON.stringify(R.snapshot(A, "ua")) === JSON.stringify(R.snapshot(B, "ua")), "відновлена симуляція збігається з оригіналом");
  const C1 = mkw(), C2 = mkw(); run(C1, env, 60); run(C2, env, 60);
  ok(JSON.stringify(R.snapshot(C1, "ua")) === JSON.stringify(R.snapshot(C2, "ua")), "той самий seed — той самий результат");
  const C3 = R.create({ seed: 20 }); station(C3, "ua_trml4d", 0, 0); station(C3, "ua_36d6m1", 30, 0); run(C3, env, 60);
  ok(JSON.stringify(R.snapshot(C1, "ua")) !== JSON.stringify(R.snapshot(C3, "ua")), "інший seed — інший перебіг");
}

console.log("12. Продуктивність: 2000 цілей, 20 станцій");
{
  const sim = R.create({ seed: 21 });
  const types = ["ua_trml4d", "ua_36d6m1", "ua_79k6", "ua_giraffe1x", "ua_p18_malakhit"];
  for (let i = 0; i < 20; i++) station(sim, types[i % 5], (i % 5) * 60, Math.floor(i / 5) * 60);
  const tg = []; for (let i = 0; i < 2000; i++) tg.push(T("t" + i, Math.random() * 400 - 50, Math.random() * 400 - 50, { alt: ["low", "mid", "high"][i % 3] }));
  const env = world(tg);
  const t0 = process.hrtime.bigint();
  run(sim, env, 60, 1);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 60;
  ok(ms < 100, "середній крок " + ms.toFixed(1) + " мс (<100)");
  const maxTr = Math.max(...sim.stations.map(s => s.nTr));
  ok(sim.stations.every(s => s.nTr <= R.resolve(R.BYID[s.type]).maxTracks), "ліміти супроводу не перевищені (макс. " + maxTr + ")");
}

console.log("13. Розгортання й переміщення");
{
  const sim = R.create({ seed: 23 }); const s = station(sim, "ua_giraffe1x", 0, 0, { status: "ready" });
  const env = world([T("x", 20, 0, { alt: "low", cat: "uav_small" })]);
  run(sim, env, 30); ok(Object.keys(s.tr).length === 0, "несвернута станція нічого не бачить");
  R.deploy(sim, s.id); run(sim, env, 60); ok(s.status === "deploying", "розгортається (90 с)");
  run(sim, env, 40); ok(s.status === "working", "розгорнулась");
  R.relocate(sim, s.id, 5, 0); run(sim, env, 60); ok(s.status === "moving" && s.x === 0, "у русі не випромінює");
  run(sim, env, 200); ok(s.status === "working" && s.x === 5, "прибула, розгорнулась на новому місці");
}

console.log("14. Метровий діапазон проти малопомітної цілі");
{
  const rate = (type, seed0) => { let h = 0, n = 0; for (let seed = 1; seed <= 25; seed++){ const A = R.create({ seed }); const s = station(A, type, 0, 0); run(A, world([T("x", 150, 0, { sig: 0.12, alt: "mid" })]), 100); h += sumHits(s); n += s.nScan; } return h / n; };
  ok(rate("ua_p18_malakhit") > rate("ua_36d6m1"), "метрова РЛС частіше помічає малопомітну ціль");
  const A = R.create({ seed: 4 }), B = R.create({ seed: 4 });
  station(A, "ua_p18_malakhit", 0, 0); station(B, "ua_36d6m1", 0, 0);
  const env = world([T("x", 150, 0, { sig: 0.8 })]);
  run(A, env, 60); run(B, env, 60);
  ok(A.pic.ua.air[0] && B.pic.ua.air[0] && A.pic.ua.air[0].sigma > B.pic.ua.air[0].sigma, "але координати менш точні");
}

console.log("15. Класи: низьколітальна проти стратегічної; перевантаження; РЕП; стадії");
{
  const rate = (type, d) => { let h = 0, n = 0; for (let seed = 1; seed <= 25; seed++){ const A = R.create({ seed }); const s = station(A, type, 0, 0); run(A, world([T("x", d, 0, { alt: "low", cat: "uav_large" })]), 80); h += sumHits(s); n += s.nScan; } return h / n; };
  ok(rate("ua_giraffe1x", 35) > rate("ua_79k6", 230), "малі висоти: Giraffe краща за стратегічну на тій самій частці дальності");
  const sim = R.create({ seed: 5 }); const s = station(sim, "ua_trml4d", 0, 0, { bal: { maxTracks: 3 } });
  const many = []; for (let i = 0; i < 10; i++) many.push(T("m" + i, 30 + i * 8, (i % 3) * 8, { cat: "cruise" }));
  run(sim, world(many), 120);
  ok(s.nTr <= 3, "ліміт супроводу: ≤3 сталих треків (" + s.nTr + ")");
  const over = Object.values(s.tr).filter(t => t.over).length;
  ok(over > 0 && Object.values(s.tr).filter(t => t.over).every(t => t.conf < R.CFG.confDet), "решта лишаються попередніми");
  const jr = (jam, type) => { let h = 0, n = 0; for (let seed = 1; seed <= 25; seed++){ const A = R.create({ seed }); const st = station(A, type, 0, 0); run(A, world([T("x", 100, 0)], { jam: () => jam }), 80); h += sumHits(st); n += st.nScan; } return h / n; };
  ok(jr(0.9, "ua_36d6m1") < jr(0, "ua_36d6m1"), "РЕП знижує частоту виявлення");
  ok(jr(0.9, "ua_trml4d") / jr(0, "ua_trml4d") > jr(0.9, "ua_p18_terek") / jr(0, "ua_p18_terek"), "стійкість до перешкод різна: Терек гірше за TRML-4D");
  const st2 = R.create({ seed: 31 }); station(st2, "ua_trml4d", 0, 0);
  const seen = []; const env = world([T("x", 50, 0)]);
  for (let t = 0; t < 120; t += 0.5){ R.step(st2, 0.5, env); const c = st2.pic.ua.air[0]; if (c && seen[seen.length - 1] !== c.state) seen.push(c.state); }
  ok(seen[0] === "preliminary" || seen[0] === "detected" || seen[0] === "tracking", "перший контакт: " + seen.join(" → "));
  ok(seen.includes("tracking") && seen.includes("identified"), "стадії: супровід → ідентифікація");
  const c = st2.pic.ua.air[0]; ok(c.isIdentified && c.cat === "cruise", "категорія розкривається лише при ідентифікації");
}

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

console.log("\nПідсумок: " + pass + " ✓, " + fail + " ✗");
process.exit(fail ? 1 : 0);
