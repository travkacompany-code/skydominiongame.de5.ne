// node tools/test_fog.js — тести ядра «Туману війни» (src/js/02e_fog.js)
const F = require("../src/js/02e_fog.js");
let ok = 0, bad = 0;
const t = (name, cond, extra) => { if (cond) ok++; else { bad++; console.log("✗", name, extra === undefined ? "" : extra); } };
const run = (fog, sec, dt = 0.5) => { for (let i = 0; i < Math.round(sec / dt); i++) F.step(fog, dt); };
const rep = (key, o) => Object.assign({ key, x: 10, y: 10, obsT: 0, state: "detected", conf: 0.7, sigma: 0.2, src: "recon_uav" }, o || {});

/* 1. затримка передачі */
{
  const f = F.create({ seed: 1 });
  t("report queued", F.report(f, "ua", rep("a1", { obsT: f.t }), { up: true, latency: 5 }));
  run(f, 4.5); t("до приходу звіту контакту нема", F.view(f, "ua", "a1") === null);
  run(f, 1); const v = F.view(f, "ua", "a1");
  t("після затримки контакт є", !!v && v.state === "detected");
  t("затримка записана", v && Math.abs(v.delay - 5) < 0.6, v && v.delay);
  t("середня затримка у статистиці", Math.abs(F.stats(f, "ua").delay - 5) < 0.6, F.stats(f, "ua").delay);
}
/* 2. обрив каналу */
{
  const f = F.create({ seed: 2 });
  t("link down → звіт не прийнято", F.report(f, "ua", rep("a2"), { up: false, latency: 1 }) === false);
  run(f, 10); t("link down → контакту нема", F.view(f, "ua", "a2") === null);
  t("link без аргументу = без затримки", F.report(f, "ua", rep("a3", { obsT: f.t }))); run(f, 0.5); t("доставлено миттєво", !!F.view(f, "ua", "a3"));
}
/* 3. незалежність сторін */
{
  const f = F.create({ seed: 3 });
  F.report(f, "ua", rep("r1", { obsT: 0 }), { up: true, latency: 0 }); run(f, 1);
  t("ua бачить", !!F.view(f, "ua", "r1")); t("ru не бачить", F.view(f, "ru", "r1") === null);
  t("список ru порожній", F.list(f, "ru").length === 0); t("статистика ru нульова", F.stats(f, "ru").total === 0);
}
/* 4. типи: detected → identified, тип «липкий» */
{
  const f = F.create({ seed: 4 });
  F.report(f, "ua", rep("a5", { obsT: 0 }), { up: true, latency: 0 }); run(f, 1);
  let v = F.view(f, "ua", "a5"); t("спершу невідомий тип", v.rank === "detected" && v.tag === null);
  F.report(f, "ua", rep("a5", { obsT: f.t, state: "identified", tag: "patriot" }), { up: true, latency: 0 }); run(f, 1);
  v = F.view(f, "ua", "a5"); t("ідентифіковано", v.rank === "identified" && v.tag === "patriot");
  F.report(f, "ua", rep("a5", { obsT: f.t, state: "detected" }), { up: true, latency: 0 }); run(f, 1);
  v = F.view(f, "ua", "a5"); t("тип не губиться при слабшому звіті", v.rank === "identified" && v.tag === "patriot");
  t("knows(identified)", F.knows(f, "ua", "a5", "identified")); t("knows(detected)", F.knows(f, "ua", "a5"));
}
/* 5. старіння: свіжий → застарілий → втрачений → зник */
{
  const f = F.create({ seed: 5 }), K = F.KIND.r;
  F.report(f, "ua", rep("r7", { obsT: 0, state: "identified", tag: "ru_96l6", conf: 0.9 }), { up: true, latency: 0 }); run(f, 1);
  const c0 = F.view(f, "ua", "r7").conf;
  run(f, K.ttl - 5); let v = F.view(f, "ua", "r7"); t("у межах ttl — свіжий", !v.stale && Math.abs(v.conf - c0) < 1e-9);
  run(f, 30); v = F.view(f, "ua", "r7"); t("після ttl — застарілий", v.stale && v.conf < c0 && !v.lost, [v.conf, c0]);
  t("вік росте", v.age > K.ttl);
  run(f, K.lost - K.ttl); v = F.view(f, "ua", "r7"); t("після lost — привид", v && v.lost && v.state === "lost", v && v.state);
  t("тип привида збережено", v.tag === "ru_96l6");
  t("knows(привид) = false", !F.knows(f, "ua", "r7"));
  run(f, K.drop + 20); t("після drop мітка зникла", F.view(f, "ua", "r7") === null);
  t("зникла і зі списку", F.list(f, "ua").length === 0);
}
/* 6. нове спостереження оновлює вік і повертає з «втрачено» */
{
  const f = F.create({ seed: 6 }), K = F.KIND.a;
  F.report(f, "ua", rep("a8", { obsT: 0 }), { up: true, latency: 0 }); run(f, K.lost + 10);
  t("втрачено", F.view(f, "ua", "a8").lost);
  F.report(f, "ua", rep("a8", { obsT: f.t, x: 12, y: 10 }), { up: true, latency: 0 }); run(f, 0.5);
  const v = F.view(f, "ua", "a8"); t("відновлено", !v.lost && v.age < 1, v.age);
}
/* 7. екстраполяція рухомих (кораблі) і нерухомих (РЛС) */
{
  const f = F.create({ seed: 7 });
  for (let i = 0; i < 6; i++) { F.report(f, "ua", rep("s1", { obsT: f.t, x: 10 + 0.3 * i * 2, y: 20, sigma: 0.05 }), { up: true, latency: 0 }); run(f, 2); }
  const v0 = F.view(f, "ua", "s1"); run(f, 20); const v1 = F.view(f, "ua", "s1");
  t("швидкість оцінена", v0.hasV && v0.vx > 0.05, v0.vx); t("екстраполяція рухається за швидкістю", v1.x > v0.x + 1, [v0.x, v1.x]);
  run(f, 200); const v2 = F.view(f, "ua", "s1"); t("екстраполяція обмежена в часі", v2 === null || v2.x - v1.x < v0.vx * F.CFG.extrapMax * 1.5);
  F.report(f, "ua", rep("r2", { obsT: f.t, x: 50, y: 50 }), { up: true, latency: 0 }); run(f, 40);
  const r = F.view(f, "ua", "r2"); t("РЛС не «їде»", Math.abs(r.x - 50) < 0.5 && Math.abs(r.y - 50) < 0.5);
  t("невизначеність росте зі старінням", r.sigma >= 0.2 - 1e-9);
}
/* 8. злиття: повторні звіти зменшують σ і усереднюють позицію; застарілий звіт позицію не відкочує */
{
  const f = F.create({ seed: 8 });
  F.report(f, "ua", rep("r3", { obsT: 0, x: 10, y: 10, sigma: 0.8 }), { up: true, latency: 0 }); run(f, 0.5);
  const s0 = F.view(f, "ua", "r3").sigma;
  for (let i = 0; i < 5; i++) { F.report(f, "ua", rep("r3", { obsT: f.t, x: 10.4, y: 10, sigma: 0.2 }), { up: true, latency: 0 }); run(f, 1); }
  const v = F.view(f, "ua", "r3"); t("σ зменшилась", v.sigma < s0, [s0, v.sigma]); t("позиція зсунулась до точніших вимірів", v.x > 10.25, v.x);
  F.report(f, "ua", rep("r3", { obsT: 1, x: 0, y: 0, sigma: 0.05 }), { up: true, latency: 0 }); run(f, 1);
  t("старий звіт не відкочує позицію", F.view(f, "ua", "r3").x > 10, F.view(f, "ua", "r3").x);
}
/* 9. негативне спостереження */
{
  const f = F.create({ seed: 9 });
  F.report(f, "ua", rep("a9", { obsT: 0 }), { up: true, latency: 0 }); run(f, 1);
  F.report(f, "ua", rep("a9", { obsT: f.t }), { up: true, latency: 30 });                                  // звіт ще в дорозі
  t("clear повертає true", F.clear(f, "ua", "a9") === true);
  t("контакт знято", F.view(f, "ua", "a9") === null); run(f, 40);
  t("звіт, що летів, не воскрешає знятий контакт", F.view(f, "ua", "a9") === null);
  F.report(f, "ua", rep("a9", { obsT: f.t }), { up: true, latency: 0 }); run(f, 1);
  t("нове спостереження після clear — приймається", !!F.view(f, "ua", "a9"));
  t("clear неіснуючого → false", F.clear(f, "ua", "zzz") === false);
  t("covers: в межах R/2", F.covers({ cls: "recon_uav", x: 0, y: 0 }, 5, 0) && !F.covers({ cls: "recon_uav", x: 0, y: 0 }, 20, 0));
}
/* 10. датчики: дальність, імовірність, ідентифікація, маскування */
{
  const mk = seed => F.create({ seed });
  const pl = { id: "u1", cls: "recon_uav", x: 0, y: 0 };
  let f = mk(10);
  F.sense(f, "ru", pl, [{ key: "a1", kind: "a", x: 40, y: 0, side: "ua", vis: 1, tag: "patriot" }], {}, 1);
  run(f, 20); t("за межею R не бачить", F.view(f, "ru", "a1") === null);
  f = mk(11);
  for (let i = 0; i < 40; i++) { F.sense(f, "ru", pl, [{ key: "a1", kind: "a", x: 3, y: 0, side: "ua", vis: 1, tag: "patriot" }], {}, 0.5); F.step(f, 0.5); }
  run(f, 5); let v = F.view(f, "ru", "a1");
  t("поруч — виявлено й ідентифіковано", v && v.rank === "identified" && v.tag === "patriot", v && v.rank);
  t("позиція близька до справжньої", v && Math.hypot(v.x - 3, v.y) < 2.5);
  t("затримка звіту враховано", v && v.delay >= F.SENS.recon_uav.lat - 0.6, v && v.delay);
  /* своїх не бачить */
  f = mk(12); const n = F.sense(f, "ua", pl, [{ key: "a2", kind: "a", x: 2, y: 0, side: "ua", vis: 1 }], {}, 5); t("своїх не спостерігає", n === 0);
  /* залежність від дальності й маскування (статистично, 200 прогонів) */
  const hits = (d, vis) => { let h = 0; for (let s = 0; s < 200; s++) { const g = mk(100 + s); F.sense(g, "ru", pl, [{ key: "a1", kind: "a", x: d, y: 0, side: "ua", vis }], {}, 1); if (g.q.length) h++; } return h; };
  const near = hits(3, 1), far = hits(19, 1), hid = hits(3, 0.2);
  t("ближче → частіше", near > far * 2, [near, far]); t("замасковане → рідше", hid < near * 0.6, [hid, near]);
  /* ідентифікація замаскованого довша */
  const idTime = vis => { const g = mk(13); let tt = 0; for (; tt < 200; tt++) { F.sense(g, "ru", pl, [{ key: "a1", kind: "a", x: 2, y: 0, side: "ua", vis, tag: "k" }], {}, 1); F.step(g, 1); const v = F.view(g, "ru", "a1"); if (v && v.rank === "identified") return tt; } return 999; };
  t("замасковане ідентифікується довше", idTime(0.3) > idTime(1), [idTime(0.3), idTime(1)]);
  /* канал: обрив глушить звіти */
  f = mk(14); let sent = 0; for (let i = 0; i < 30; i++) sent += F.sense(f, "ru", pl, [{ key: "a1", kind: "a", x: 2, y: 0, side: "ua", vis: 1 }], { link: () => ({ up: false, latency: 1 }) }, 1);
  t("за обриву каналу звіти не йдуть", sent === 0 && F.list(f, "ru").length === 0);
  /* затримка каналу збільшується (РЕБ) */
  f = mk(15); F.sense(f, "ru", pl, Array.from({ length: 6 }, (_, i) => ({ key: "a" + i, kind: "a", x: 2, y: 0.1 * i, side: "ua", vis: 1 })), { link: () => ({ up: true, latency: 12 }) }, 5);
  run(f, 6); t("затримка 12 с: ще не дійшло", F.list(f, "ru").length === 0); run(f, 8); t("затримка 12 с: дійшло", F.list(f, "ru").length >= 1);
  /* LOS */
  f = mk(16); let r2 = 0; for (let i = 0; i < 40; i++) r2 += F.sense(f, "ru", pl, [{ key: "a1", kind: "a", x: 2, y: 0, side: "ua", vis: 1 }], { los: () => 0 }, 1);
  t("рельєф (LOS=0) блокує спостереження", r2 === 0);
  t("невідомий клас платформи — 0", F.sense(f, "ru", { id: "z", cls: "nope", x: 0, y: 0 }, [], {}, 1) === 0);
}
/* 11. накопичення ідентифікації загасає без спостережень */
{
  const pl = { id: "u9", cls: "tac_drone", x: 0, y: 0 }, f = F.create({ seed: 17 });
  F.sense(f, "ru", pl, [{ key: "a1", kind: "a", x: 1, y: 0, side: "ua", vis: 1, tag: "k" }], {}, 20);
  t("dwell створено", Object.keys(f.dwell.ru).length <= 1); run(f, F.CFG.dwellKeep + 5); t("dwell прибрано", Object.keys(f.dwell.ru).length === 0);
}
/* 12. серіалізація і детермінізм */
{
  const a = F.create({ seed: 20 }), b = F.create({ seed: 20 }), pl = { id: "u1", cls: "jet", x: 0, y: 0 };
  const tg = [{ key: "a1", kind: "a", x: 5, y: 3, side: "ua", vis: 0.8, tag: "s300" }, { key: "r1", kind: "r", x: 9, y: 1, side: "ua", vis: 0.6, tag: "x" }];
  for (let i = 0; i < 60; i++) { F.sense(a, "ru", pl, tg, {}, 0.5); F.step(a, 0.5); F.sense(b, "ru", pl, tg, {}, 0.5); F.step(b, 0.5); }
  t("детермінізм за seed", JSON.stringify(F.list(a, "ru")) === JSON.stringify(F.list(b, "ru")));
  const s = F.serialize(a), r = F.restore(s);
  t("серіалізація зберігає контакти", JSON.stringify(F.list(r, "ru")) === JSON.stringify(F.list(a, "ru")));
  t("JSON-сумісно", JSON.stringify(s).length > 10 && !("_r" in s));
  F.step(r, 1); t("відновлена картина продовжує жити", r.t === a.t + 1);
}
/* 13. таблиці балансу */
{
  t("SENS: всі числа додатні", Object.values(F.SENS).every(s => s.R > 0 && s.idR > 0 && s.rate > 0 && s.idSec > 0 && s.lat >= 0 && s.sigma > 0));
  t("KIND: ttl < lost < drop", Object.values(F.KIND).every(k => k.ttl < k.lost && k.lost < k.drop));
  t("невідома літера → клас «об'єкт»", F.kindOf("q9").name === "об'єкт");
  t("report без ключа ігнорується", F.report(F.create(), "ua", { x: 1 }) === false);
  t("невідома сторона ігнорується", F.report(F.create(), "xx", rep("a1")) === false);
}
console.log(bad ? `FAIL: ${bad} не пройшло, ${ok} пройшло` : `OK: ${ok} перевірок`);
process.exit(bad ? 1 : 0);
