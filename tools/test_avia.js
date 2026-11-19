// node tools/test_avia.js — етап 7.68 («BANGVECTOR 2 · етап 4»): чисте ядро авіації (src/js/02i_avia.js)
const fs = require("fs"), vm = require("vm"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "../src/js/02i_avia.js"), "utf8");
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(src, ctx);
const A = ctx.BV_AVIA;
let ok = 0, bad = 0;
const t = (name, cond, extra) => { if (cond) ok++; else { bad++; console.log("✗", name, extra === undefined ? "" : JSON.stringify(extra)); } };

// базовий набір: два аеродроми України (Полтава, 2 смуги) і Росії (Енгельс, 3 смуги), плюс ще один український
const D = [
  { id: "poltava", n: "Полтава", side: "ua", home: "ua_air", c: [34.4, 49.6], rw: 2 },
  { id: "kharkiv", n: "Харків", side: "ua", home: "ua_air", c: [36.2, 49.9], rw: 2 },
  { id: "engels", n: "Енгельс-2", side: "ru", home: "strat", c: [46.2, 51.5], rw: 3 },
  { id: "morozovsk", n: "Морозовськ", side: "ru", home: "fighter", c: [41.8, 48.3], rw: 2 }
];
A.reset(D);
const L = A.list();
const [PO, KH, EN, MO] = L;

/* ---------- аеродроми: пошкодження ---------- */
A.setHealth(EN, 1);
t("повне здоров'я → усі смуги робочі", EN.k === 3 && EN.alive, EN);
A.setHealth(EN, 0.5);
t("half health: 3 смуги → 2 робочі", EN.k === 2 && EN.alive, EN.k);
A.setHealth(EN, 0.1);
t("дуже пошкоджений: лишається хоча б 1 смуга", EN.k === 1 && EN.alive, EN.k);
A.setHealth(EN, 0.34);
t("ceil: 0.34·3 = 1.02 → 2 смуги", EN.k === 2, EN.k);
A.setHealth(EN, 1);
t("відновлення здоров'я (не знищено) повертає смуги", EN.k === 3, EN.k);
A.setHealth(EN, 0);
t("знищено: закрито", !EN.alive && EN.dead && EN.k === 0, EN);
A.setHealth(EN, 1);
t("знищений аеродром не оживає", !A.alive(EN) && EN.dead, EN);

/* ---------- смуги: черга зльоту/посадки ---------- */
A.reset(D);
const P = A.list()[0];
t("свіжий аеродром має 2 вільні смуги", A.freeRunway(P, 0) === true);
const s1 = A.takeRunway(P, 0, 6), s2 = A.takeRunway(P, 0, 6);
t("дві смуги — два одночасних розбіги", s1 === 0 && s2 === 0, [s1, s2]);
t("обидві зайняті → вільної немає", A.freeRunway(P, 3) === false);
const s3 = A.takeRunway(P, 1, 6);
t("третій літак чекає, поки звільниться смуга (6 с)", s3 === 6, s3);
t("після звільнення смуга знову вільна", A.freeRunway(P, 6) === true);
const K2 = A.list()[1];
const r0 = A.takeRunway(K2, 10, 0);
t("нульова тривалість не блокує смугу надовго", A.freeRunway(K2, 10) === true);
A.setHealth(K2, 0);
t("закритий аеродром: смуги не видає", A.takeRunway(K2, 11, 5) === null && !A.freeRunway(K2, 11));

/* ---------- стоянки й розподіл авіагрупи ---------- */
A.reset(D);
const [p0, k0, e0, m0] = A.list();
A.addParked(e0, "tu95", 8); A.addParked(m0, "tu95", 3); A.addParked(p0, "su24", 4);
t("parkedSide сумує лише живі аеродроми сторони", A.parkedSide("ru", "tu95") === 11 && A.parkedSide("ua", "su24") === 4);
t("addParked не дає відʼємних стоянок", (A.addParked(p0, "su24", -99), p0.parked.su24 === 0));
A.addParked(p0, "su24", 4);
const al1 = A.allocate("ru", "tu95", 6, e0.i, m0.i, false);
t("розподіл: спершу з базування (6 з 8)", al1 && al1[0].af === e0 && al1[0].n === 6, al1);
const al2 = A.allocate("ru", "tu95", 10, e0.i, m0.i, false);
t("розподіл: не вистачає на базуванні — добирає з інших аеродромів", al2 && al2.reduce((s, x) => s + x.n, 0) === 10 && al2.length === 2, al2);
t("strict: лише з обраного базування", A.allocate("ru", "tu95", 9, e0.i, m0.i, true) === null);
t("недостатньо літаків сторони → null", A.allocate("ru", "tu95", 12, e0.i, m0.i, false) === null);
t("чужої сторони не беремо", A.allocate("ua", "tu95", 1, null, null, false) === null);
A.reserve(al1, "tu95");
t("reserve знімає зі стоянки", e0.parked.tu95 === 2, e0.parked);
t("availFor strict: 2 на базуванні", A.availFor("ru", "tu95", e0.i, true) === 2);
t("availFor на мертвому базуванні → 0", (A.kill(m0), A.availFor("ru", "tu95", m0.i, true) === 0));

/* ---------- перегін ---------- */
A.reset(D);
const [pp, kk, ee, mm] = A.list();
t("перегін на той самий аеродром — 0", A.ferry(pp, pp, 10) === 0);
const fer = A.ferry(ee, pp, 12);
t("перегін з Енгельса до Полтави — кілька десятків сим-секунд", fer > 30 && fer < 200, fer);
t("перегін обернено симетричний", Math.abs(A.ferry(pp, ee, 12) - fer) < 1e-9);

/* ---------- черга й готовність ---------- */
A.reset(D);
const Q = A.list()[0];
A.enqueue(Q, { grp: 1, key: "su24", readyAt: 5 });
A.enqueue(Q, { grp: 1, key: "su24", readyAt: 2 });
t("черга: до readyAt літак не береться", A.dequeueReady(Q, 1) === null);
const r2 = A.dequeueReady(Q, 3);
t("черга: беремо готовий (readyAt ≤ now)", r2 && r2.readyAt === 2, r2);
t("черга: інший готовий пізніше", A.dequeueReady(Q, 4) === null && A.dequeueReady(Q, 5).readyAt === 5);

/* ---------- підготовка після посадки ---------- */
A.reset(D);
const R = A.list()[0];
A.prepAdd(R, "su24", 100, 7);
t("підготовка не готова до свого терміну", A.prepDone(99).length === 0);
const pd = A.prepDone(100);
t("підготовка готова → знову на стоянці (через клей)", pd.length === 1 && pd[0].af === R && pd[0].key === "su24" && pd[0].grp === 7, pd);
t("після видачі підготовка порожня", A.prepDone(500).length === 0);

/* ---------- знищення аеродрому ---------- */
A.reset(D);
const [a1, a2, a3] = A.list();
A.addParked(a2, "su24", 3); A.prepAdd(a2, "su24", 1e9, 1); A.enqueue(a2, { grp: 1, key: "su24", readyAt: 0, base: a2.i });
const K = A.kill(a2);
t("знищено: стоянка віддана клею (3 шт.)", K.parked.su24 === 3 && !a2.parked.su24, K.parked);
t("знищено: підготовка й черга віддані клею", K.prep.length === 1 && K.queue.length === 1);
t("знищено: аеродром закрито назавжди", !A.alive(a2) && a2.dead);
const nb = A.nearest("ua", a1.c, null);
t("найближчий живий аеродром — не знищений", nb && nb !== a2 && nb.side === "ua", nb && nb.n);
const rtb = A.pickRtb("ua", [36.0, 49.8], a2.i);
t("посадка: бажаний (знищений) не підходить — беремо живий", rtb && rtb !== a2 && A.alive(rtb), rtb && rtb.n);
A.kill(a1);
t("усі аеродроми сторони знищено → посадки немає", A.pickRtb("ua", [36, 49], null) === null && A.nearest("ua", [36, 49], null) === null);

/* ---------- звірка з парком ---------- */
A.reset(D);
const [x1, x2] = A.list();
A.addParked(x1, "mig31", 2);
// парк 5: 2 на стоянці, 1 у черзі, 1 у підготовці, 1 у повітрі
A.enqueue(x2, { grp: 1, key: "mig31", readyAt: 0 });
A.prepAdd(x2, "mig31", 9, 1);
const cnt = A.count("ua", "mig31");
t("count: стоянка/черга/підготовка", cnt.parked === 2 && cnt.queue === 1 && cnt.prep === 1, cnt);
t("reconcile: збіг із парком 5 при 1 у повітрі → 0", A.reconcileDelta(5, cnt, 1) === 0);
t("reconcile: новий літак з виробництва → +1", A.reconcileDelta(6, cnt, 1) === 1);
t("reconcile: зайвий (втрата поза обліком) → −1", A.reconcileDelta(4, cnt, 1) === -1);

/* ---------- мережа: дзеркало для гостя ---------- */
A.reset(D);
const [g1, g2] = A.list();
A.addParked(g1, "su24", 5);
const W = A.wire();
t("wire: стоянки й живість", W.length === 4 && W[0].p.su24 === 5 && W[0].al === 1);
A.setGuest([{ i: 0, p: { su24: 5 }, al: 1 }, { i: 1, p: {}, al: 0 }]);
t("гість бачить стоянки з дзеркала", A.parkedOf(g1, "su24") === 5 && A.availFor("ua", "su24", null, false) === 5);
t("гість: закритий (al=0) — 0", A.parkedOf(g2, "su24") === 0);
A.setGuest(null);
t("скидання дзеркала повертає локальний облік", A.guestMode() === false);

/* ---------- скидання ---------- */
A.reset(D);
t("reset: нові аеродроми, чисті стоянки", A.list().length === 4 && A.parkedTot(A.list()[0]) === 0);

console.log(bad === 0 ? `OK: ${ok} перевірок` : `Провалено: ${bad} (пройдено ${ok})`);
if (bad) process.exitCode = 1;
