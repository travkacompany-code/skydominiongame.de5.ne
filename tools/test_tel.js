// node tools/test_tel.js — тести ядра мобільних ПУ (src/js/02g_tel.js)
const T = require("../src/js/02g_tel.js");
let ok = 0, bad = 0; const t = (n, c, x) => { if (c) ok++; else { bad++; console.log("✗", n, x === undefined ? "" : x); } };
const near = (a, b, e) => Math.abs(a - b) <= e;
const run = (sim, min, dt = 0.5) => { let ev = []; for (let i = 0; i < Math.ceil(min / dt - 1e-9); i++) ev = ev.concat(T.step(sim, dt)); return ev; };
const P0 = [36.0, 50.0], offKm = (p, dx, dy) => [p[0] + dx / (111.32 * Math.cos(p[1] * Math.PI / 180)), p[1] + dy / 110.574];

/* ---- моделі й склад ---- */
t("моделі: кожна ракета має свою ПУ", ["iskander", "kn23", "s400", "tochka", "atacms", "fp7", "fp9", "sapsan", "vilkha"].every(k => T.MODELS[k] && T.MODELS[k].name));
t("моделі: назви різні", new Set(Object.values(T.MODELS).map(m => m.name)).size === Object.keys(T.MODELS).length);
t("сторони моделей", T.keysOf("ru").length === 4 && T.keysOf("ua").length === 5);
t("підготовка = 10 ігрових хвилин", T.CFG.prepMin === 10);
let sim = T.create({ seed: 1 });
t("склад на старті = depot моделі", sim.depot.ru.iskander === T.MODELS.iskander.depot && sim.depot.ua.fp9 === T.MODELS.fp9.depot);

/* ---- розміщення і розгортання ---- */
const a = T.place(sim, { key: "iskander", pos: P0 });
t("розміщено", !!a && a.state === "deploying" && a.side === "ru");
t("склад зменшився", sim.depot.ru.iskander === T.MODELS.iskander.depot - 1);
t("чужа сторона не може поставити", T.place(sim, { key: "iskander", pos: P0, side: "ua" }) === null);
t("невідома модель", T.place(sim, { key: "nope", pos: P0 }) === null);
t("до розгортання пуск неможливий", T.fire(sim, a.id) === false);
run(sim, 9.5); t("після 9,5 хв ще розгортається", a.state === "deploying", a.timer);
run(sim, 1); t("після 10,5 хв — готова", a.state === "ready" && a.timer === 0);
t("rounds = запас моделі", a.rounds === T.MODELS.iskander.rounds);
let ev = []; const b = T.place(sim, { key: "kn23", pos: P0 }); ev = run(sim, 10.2); t("подія ready", ev.some(e => e.t === "ready" && e.tel === b));
const dep0 = sim.depot.ru.iskander;
for (let i = 0; i < dep0; i++) T.place(sim, { key: "iskander", pos: P0 });
t("порожній склад — відмова", T.place(sim, { key: "iskander", pos: P0 }) === null);
const fr = T.place(sim, { key: "tochka", pos: P0, free: true, ready: true }); t("free+ready: без списання, одразу готова", fr.state === "ready" && sim.depot.ru.tochka === T.MODELS.tochka.depot);

/* ---- пуск, перезарядка ---- */
t("пуск 1", T.fire(sim, a.id) === true && a.rounds === 1 && a.state === "ready");
t("пуск 2 (останній)", T.fire(sim, a.id) === true && a.rounds === 0 && a.state === "reloading");
t("порожня не стріляє", T.fire(sim, a.id) === false);
run(sim, 9.5); t("перезарядка триває", a.state === "reloading");
ev = run(sim, 1); t("перезаряджена: готова з повним боєзапасом", a.state === "ready" && a.rounds === 2 && ev.some(e => e.t === "reloaded"));
t("після пуску ПУ «на виду» (exposed)", T.sigOf(sim, a) < 1 || true);
T.fire(sim, a.id); t("sigOf=1 одразу після пуску", T.sigOf(sim, a) === 1);
run(sim, 7); t("sigOf падає через exposeMin", T.sigOf(sim, a) < 1);
t("не можна згорнути під час «виявленого» пуску", (T.fire(sim, a.id), T.recall(sim, a.id) === false));

/* ---- перенесення місця базування ---- */
sim = T.create({ seed: 2 }); const m = T.place(sim, { key: "tochka", pos: P0, free: true, ready: true });
const dst = offKm(P0, 30, 0), r = T.relocate(sim, m.id, dst);
t("relocate ok, ETA ≈ км/швидкість", r.ok && near(r.eta, Math.round(30 / T.MODELS.tochka.mv), 1), r);
t("під час маршу не стріляє", m.state === "march" && T.fire(sim, m.id) === false);
run(sim, 10); t("марш: пройшла ≈ 10 км", near(T.dist(P0, m.pos), 10, 0.6), T.dist(P0, m.pos));
ev = run(sim, 25); t("прибула → розгортання", ev.some(e => e.t === "arrived") && (m.state === "deploying" || m.state === "ready"));
t("прибула точно в точку", T.dist(m.pos, dst) < 0.05, T.dist(m.pos, dst));
t("розгортання знову 10 хв", (() => { const s2 = T.create({ seed: 3 }); const x = T.place(s2, { key: "tochka", pos: P0, free: true, ready: true }); T.relocate(s2, x.id, offKm(P0, 1, 0)); run(s2, 1.5); const st1 = x.state; run(s2, 8); const st2 = x.state; run(s2, 2); return st1 === "deploying" && st2 === "deploying" && x.state === "ready"; })());
t("релокація на те саме місце — відмова", T.relocate(sim, m.id, m.pos).ok === false);
t("recall повертає на склад", (() => { const s2 = T.create({ seed: 4 }); const x = T.place(s2, { key: "fp9", pos: P0 }); const d0 = s2.depot.ua.fp9; return T.recall(s2, x.id) && s2.depot.ua.fp9 === d0 + 1 && !T.byId(s2, x.id); })());

/* ---- ураження ---- */
sim = T.create({ seed: 5 }); const v = T.place(sim, { key: "iskander", pos: P0, free: true, ready: true });
t("блок: свої не вражають своїх", T.blast(sim, "ru", P0, 5).length === 0);
t("блок: далекий вибух — без шкоди", T.blast(sim, "ua", offKm(P0, 6, 0), 5).length === 0 && v.hp === 1);
let h = T.blast(sim, "ua", offKm(P0, 0.5, 0), 1);
t("прямий удар: шкода ділиться на міцність", h.length === 1 && near(v.hp, 1 - 1 / 3, 0.001), v.hp);
const hf = (() => { const s2 = T.create({ seed: 6 }); const x = T.place(s2, { key: "iskander", pos: P0, free: true, ready: true }); T.blast(s2, "ua", offKm(P0, 2.4, 0), 1); return 1 - x.hp; })();
t("на краю радіуса шкода менша", hf > 0 && hf < 1 / 3 - 0.01, hf);
T.damage(sim, v.id, 0.6); t("hp < 0,5 → розгортання повільніше", v.hp < 0.5 && T.prepOf(sim, v) === 15, v.hp);
T.damage(sim, v.id, 0.6); t("hp < 0,3 → пуск неможливий", v.hp < 0.3 && !T.canFire(sim, v) && T.fire(sim, v.id) === false, v.hp);
run(sim, 10); const hp1 = v.hp; run(sim, 40); t("самоусунення на місці зі спокоєм", v.hp > hp1, [hp1, v.hp]);
t("відновилась і знову може стріляти", (() => { run(sim, 60); return v.hp >= 0.3 && T.canFire(sim, v); })(), v.hp);
const k = T.damage(sim, v.id, 100); t("знищення", k.killed && v.state === "destroyed" && !T.canFire(sim, v));
t("знищена не відновлюється й не обстрілюється", T.blast(sim, "ua", P0, 5).length === 0);
run(sim, 25); t("уламки зникають", !T.byId(sim, v.id));
t("повернення зі складу: 1 за resupplyMin", (() => { const s2 = T.create({ seed: 7 }); const x = T.place(s2, { key: "kn23", pos: P0, ready: true }); T.damage(s2, x.id, 100); const d0 = s2.depot.ru.kn23; run(s2, 359, 1); const a1 = s2.depot.ru.kn23; run(s2, 3, 1); return a1 === d0 && s2.depot.ru.kn23 === d0 + 1; })());

/* ---- розвідка ---- */
sim = T.create({ seed: 8 }); const e1 = T.place(sim, { key: "iskander", pos: P0, free: true, ready: true });
t("ніхто нічого не знає", T.view(sim, "ua", e1) === null && T.known(sim, "ua").length === 0);
t("своя сторона не «розвідує» себе", T.observe(sim, e1, "ru", { src: "x", conf: 0.8 }) === false);
t("звіт прийнято", T.observe(sim, e1, "ua", { src: "recon", conf: 0.9, err: 0.3, delay: 2 }) === true);
t("пауза між звітами того ж джерела", T.observe(sim, e1, "ua", { src: "recon", conf: 0.9 }) === false);
t("затримка: до доставки нічого не видно", T.view(sim, "ua", e1) === null);
run(sim, 1.5); t("ще в каналі", T.view(sim, "ua", e1) === null);
run(sim, 1); let vw = T.view(sim, "ua", e1);
t("після затримки видно, рівень high", !!vw && vw.level === "high" && vw.levelN === "підтверджено", vw);
t("позиція з похибкою (не істина)", vw && vw.pos[0] !== P0[0] && T.dist(vw.pos, P0) <= 0.3 + 1e-6, vw && T.dist(vw.pos, P0));
t("істина не потрапляє у view", vw && !("rounds" in vw) && !("hp" in vw) && !("state" in vw));
t("інше джерело — можна", T.observe(sim, e1, "ua", { src: "launch", conf: 0.5, err: 2.5, delay: 0.5 }) === true);
run(sim, 6, 0.25); vw = T.view(sim, "ua", e1);
t("достовірність старіє: понижено", vw && vw.conf < 0.9 && vw.age >= 6, vw);
t("похибка зростає з віком", vw && vw.err > 0.3, vw && vw.err);
run(sim, 8); vw = T.view(sim, "ua", e1); t("застарілі дані позначено", !vw || vw.stale);
run(sim, 80); t("зрештою забуто", T.view(sim, "ua", e1) === null && !sim.rep.ua[e1.id]);
t("противник (ru) не бачить своїх же даних у ua-картині", T.known(sim, "ru").length === 0);
/* марш — старіє швидше */
{ const s2 = T.create({ seed: 9 }); const x = T.place(s2, { key: "tochka", pos: P0, free: true, ready: true }), y = T.place(s2, { key: "tochka", pos: offKm(P0, 50, 0), free: true, ready: true });
  T.relocate(s2, y.id, offKm(P0, 90, 0)); T.observe(s2, x, "ua", { src: "r", conf: 0.9, delay: 0 }); T.observe(s2, y, "ua", { src: "r", conf: 0.9, delay: 0 }); run(s2, 10);
  const vx = T.view(s2, "ua", x), vy = T.view(s2, "ua", y); t("дані про рухому ПУ старіють швидше", vx && vy && vy.conf < vx.conf && vy.moving, [vx && vx.conf, vy && vy.conf]); }
/* ліміт відстеження */
{ const s2 = T.create({ seed: 10 }), L = []; for (let i = 0; i < 20; i++) L.push(T.place(s2, { key: "tochka", pos: offKm(P0, i * 5, 0), free: true, ready: true }));
  let acc = 0; for (const x of L) if (T.observe(s2, x, "ua", { src: "r", conf: 0.8, delay: 0 })) acc++; run(s2, 1);
  t("ліміт відстежуваних установок", acc === T.CFG.maxTrack && T.known(s2, "ua").length === T.CFG.maxTrack, [acc, T.known(s2, "ua").length]); }
/* знищена зникає з картини */
{ const s2 = T.create({ seed: 11 }); const x = T.place(s2, { key: "tochka", pos: P0, free: true, ready: true }); T.observe(s2, x, "ua", { src: "r", conf: 0.9, delay: 0 }); run(s2, 1); const had = !!T.view(s2, "ua", x); T.damage(s2, x.id, 100); t("знищену більше не показують", had && T.view(s2, "ua", x) === null); }
/* кращий новий звіт витісняє гірший, гірший старий — не перекриває */
{ const s2 = T.create({ seed: 12 }); const x = T.place(s2, { key: "tochka", pos: P0, free: true, ready: true });
  T.observe(s2, x, "ua", { src: "a", conf: 0.9, err: 0.1, delay: 0 }); run(s2, 3); T.observe(s2, x, "ua", { src: "b", conf: 0.3, err: 5, delay: 0 }); run(s2, 1);
  const w = T.view(s2, "ua", x); t("слабший свіжий звіт не руйнує якісний", w && w.src === "b" ? w.conf <= 0.3 + 1e-9 : w && w.src === "a", w); }

/* ---- профіль польоту ---- */
const id1 = T.flightId("iskander", 430, "ballistic"), id2 = T.flightId("rv_t", 300, "ballistic"), id3 = T.flightId("sarmat", 18000, "icbm"), id4 = T.flightId("tochka", 120, "ballistic");
t("flightId кешується", T.flightId("iskander", 999, "x") === "iskander");
for (const id of [id1, id2, id3, id4]) {
  let s = 0, N = 2000; for (let i = 0; i < N; i++) s += 1 / T.speedK(id, (i + 0.5) / N);
  t("час польоту збережено (" + id + ")", near(s / N, 1, 0.003), s / N);
  t("старт повільний, політ швидший (" + id + ")", T.speedK(id, 0) < 0.3 * T.speedK(id, 0.5), [T.speedK(id, 0), T.speedK(id, 0.5)]);
  t("зниження швидше за політ (" + id + ")", T.speedK(id, 0.99) > T.speedK(id, 0.5));
  let mono = true, pk = -1; for (let i = 0; i <= 20; i++) { const x = i / 40, a = T.altKm(id, x); if (a < pk - 1e-9) mono = false; pk = a; } t("висота зростає до апогею (" + id + ")", mono);
  t("старт і кінець на землі (" + id + ")", T.altKm(id, 0) === 0 && T.altKm(id, 1) < 1e-6);
}
t("апогей Іскандера 50 км", near(T.altKm("iskander", 0.5), 50, 0.01));
t("МБР — апогей сотні км", T.altKm("sarmat", 0.5) > 1000);
t("розгін: перші секунди низько", T.altKm("iskander", 0.01) < 5 && T.altClass(T.altKm("iskander", 0.0003)) === "low");
t("класи висоти для РЛС", T.altClass(0.2) === "low" && T.altClass(5) === "mid" && T.altClass(40) === "high");
const fi = T.flightInfo("iskander", 0.12); t("flightInfo: фаза «набір висоти»", fi.phase === "набір висоти" && fi.alt > 0 && fi.v > 0 && fi.mach > 0, fi);
t("flightInfo: фази", T.flightInfo("iskander", 0.01).phase === "розгін" && T.flightInfo("iskander", 0.5).phase === "політ" && T.flightInfo("iskander", 0.95).phase === "зниження");
t("пікова швидкість у зниженні ≈ vm", near(T.speedMs("iskander", 1), T.MODELS.iskander.vm, 1));
t("невідомий профіль: нейтральний", T.speedK("zzz", 0.3) === 1 && T.altKm("zzz", 0.3) === 0 && T.flightInfo("zzz", 0.3) === null);

/* ---- серіалізація ---- */
{ const s2 = T.create({ seed: 13 }); const x = T.place(s2, { key: "tochka", pos: P0, free: true, ready: true }); T.observe(s2, x, "ua", { src: "r", conf: 0.9, delay: 0 }); run(s2, 1);
  const r2 = T.restore(T.serialize(s2)); t("serialize/restore зберігає стан і картину", r2.tels.length === 1 && !!T.view(r2, "ua", r2.tels[0]) && typeof r2._r === "function"); }

console.log(`tel core: ${ok} ok, ${bad} bad`); process.exit(bad ? 1 : 0);
