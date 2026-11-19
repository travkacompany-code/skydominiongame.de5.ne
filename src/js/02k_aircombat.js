/* ======================================================================
   BV_AC — повітряний бій («BANGVECTOR 2», етап 9)
   Чистий модуль (як 02c_radar.js / 02j_aew.js): не знає про карту й 03_game.js.
   Клей із грою — tools/aircombat_glue.js (вшивається в src/js/03_game.js).

   Що тут є
   • PERF — ТТХ літаків і вертольотів: ЕПР за ракурсом, ІЧ-сигнатура, РЛС (дальність, сектор), ІЧ-пошук (IRST),
     попередження (RWR/MAWS), живучість, ешелон, запас пасток (теплових і дипольних відбивачів);
   • WPN — ракети «повітря–повітря» (за id підвіски з AIR_WPN у грі): ГСН (напіактивна / активна / ІЧ), дальність,
     швидкість, маневровість, бойова частина, стійкість ІЧ-ГСН до пасток;
   • SAM — зенітні комплекси проти літаків: наведення (команднe/ТВМ/напіактивне/активне/ІЧ/лазерне), ешелон ураження,
     канали, радіус бойової частини, власна РЛС;
   • сенсори: радіогоризонт, ЕПР за ракурсом, «виріз» доплерівського фільтра (маневр на 90° до РЛС), розвідка в секторі,
     власна РЛС / IRST / РЛС ЗРК / дані ДРЛО й наземних РЛС (через env.cue) з обміном по каналу зв’язку;
   • ракети: розгін → маршовий політ → падіння швидкості; пропорційне наведення; захоплення, втрата захоплення, повторне
     захоплення; супровід підсвічуванням (напіактивна ГСН), підтримка в польоті (активна ГСН), ІЧ-захоплення в секторі;
   • пастки: теплові (ІЧ-ГСН «перехоплюється» за співвідношенням сигнатур і стійкістю ГСН), дипольні (зрив супроводу,
     хибна ціль для активної ГСН);
   • уникання: розворот на 90° до ракети (виріз), пікірування, форсаж, відстріл пасток за дальністю/типом ракети;
   • бій: вибір цілі, вікно пуску (Rmin…Rmax за ракурсом і висотою), підсвічування, залп, повторне наведення;
   • ЗРК: автоматична реакція на літаки, виявлені власною РЛС / наземною РЛС / бортовою РЛС / ДРЛО.

   Одиниці: км, ігрові секунди (1 ігрова с ≈ 28 реальних), метри для висот, градуси. Координати — [lon, lat].
   Модуль працює через «акторів» (літаки) і «ЗРК», які будує клей, і через env (колбеки гри).
   ====================================================================== */
(function (root) {
  "use strict";

  const D2R = Math.PI / 180;

  /* ---------- геометрія ---------- */
  const KY = 110.574, KX = lat => 111.32 * Math.cos(lat * D2R);
  const rel = (a, b) => [(b[0] - a[0]) * KX((a[1] + b[1]) / 2), (b[1] - a[1]) * KY];
  const dist = (a, b) => { const r = rel(a, b); return Math.hypot(r[0], r[1]); };
  const brg = (a, b) => { const r = rel(a, b); return (Math.atan2(r[0], r[1]) / D2R + 360) % 360; };
  const off = (p, dx, dy) => [p[0] + dx / KX(p[1]), p[1] + dy / KY];
  const mv = (p, h, km) => off(p, Math.sin(h * D2R) * km, Math.cos(h * D2R) * km);
  const angd = (a, b) => ((b - a + 540) % 360) - 180;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const vel = a => [Math.sin(a.hdg * D2R) * a.spd, Math.cos(a.hdg * D2R) * a.spd];
  /* радіогоризонт, км: d ≈ 4,12·(√h1 + √h2), h — метри */
  const horizon = (h1, h2) => 4.12 * (Math.sqrt(Math.max(0, h1)) + Math.sqrt(Math.max(0, h2)));

  /* ---------- баланс ---------- */
  const CFG = {
    on: true,
    tick: 0.2,              // с: крок рішень (виявлення, вибір цілі, пуск, пастки)
    sub: 0.01,              // с: підкрок ракет (точність наближення до цілі)
    rof: 0.5,               // с між пусками одного літака
    lockT: 0.45,            // с: час захоплення ціли власною РЛС перед пуском
    salvoMax: 2,            // найбільше ракет на одну ціль одночасно
    reactT: 0.12,           // с: реакція екіпажу на сигнал попередження
    notchDeg: 14,           // ° від траверзу — «виріз» доплерівського фільтра
    notchK: 0.22,           // множник дальності РЛС у вирізі
    lookDown: 0.85,         // множник дальності РЛС по цілях значно нижче носія
    flareLife: 0.9, flareIR: 6, flareStep: 0.12,
    chaffLife: 1.8, chaffRCS: 5, chaffRad: 0.9, chaffStep: 0.2,
    dmgDive: 1500,          // м: висота пікірування від радіолокаційної ракети
    reguide: 1.4,           // с: скільки ракета без захоплення чекає на повторне наведення, перш ніж самознищитись
    gunRange: 9, gunBurst: 14,
    kmDeadband: 0.05,
    heliRange: 7            // км: оптичне виявлення вертольотів / ближній бій
  };

  /* ---------- ТТХ літаків і вертольотів ----------
     cls: fighter | heli | strike | aew
     rcs/ir: [ніс, борт, хвіст] (ЕПР, м²; ІЧ — відносна), abIr — множник ІЧ на форсажі
     radar: км по цілі 5 м² (0 — немає); gim — півкут сектора; irst — км по хвостовому ракурсу на форсажі; eo — км оптики
     illum: скільки ціль одночасно підсвічує для напіактивних ракет; maws — км виявлення пуску ІЧ-ракет
     hp — живучість; alt = [крейсер, мін, макс] м; fl/ch — залпів тепловими пастками / дипольними відбивачами */
  const PERF = {
    su27:   { cls: "fighter", rcs: [8, 16, 10],  ir: [0.8, 1, 1.3], abIr: 1.9, radar: 90,  gim: 60, irst: 45, eo: 10, illum: 1,  maws: 0, rwr: true, hp: 1.0,  alt: [9000, 100, 18000], fl: 20, ch: 10 },
    mig29:  { cls: "fighter", rcs: [4, 9, 6],    ir: [0.7, 1, 1.2], abIr: 1.8, radar: 70,  gim: 60, irst: 35, eo: 10, illum: 1,  maws: 0, rwr: true, hp: 0.95, alt: [8000, 100, 17000], fl: 15, ch: 8 },
    su30:   { cls: "fighter", rcs: [10, 18, 12], ir: [0.8, 1, 1.3], abIr: 1.9, radar: 110, gim: 70, irst: 60, eo: 10, illum: 2,  maws: 0, rwr: true, hp: 1.05, alt: [9000, 100, 17500], fl: 24, ch: 12 },
    su35:   { cls: "fighter", rcs: [2.5, 12, 8], ir: [0.7, 1, 1.2], abIr: 1.9, radar: 200, gim: 90, irst: 90, eo: 12, illum: 2,  maws: 8, rwr: true, hp: 1.1,  alt: [10000, 100, 18000], fl: 26, ch: 14 },
    f16:    { cls: "fighter", rcs: [1.2, 5, 3],  ir: [0.6, 1, 1.1], abIr: 1.7, radar: 110, gim: 60, irst: 0,  eo: 8,  illum: 99, maws: 8, rwr: true, hp: 1.0,  alt: [9000, 100, 15000], fl: 20, ch: 14 },
    mirage: { cls: "fighter", rcs: [2, 6, 4],    ir: [0.7, 1, 1.2], abIr: 1.8, radar: 100, gim: 60, irst: 0,  eo: 8,  illum: 99, maws: 4, rwr: true, hp: 0.95, alt: [9000, 100, 17000], fl: 16, ch: 12 },
    mi24:   { cls: "heli",    rcs: [6, 14, 10],  ir: [0.5, 1, 1.1], abIr: 1,   radar: 0,   gim: 0,  irst: 0,  eo: 8,  illum: 0,  maws: 0, rwr: false, hp: 0.85, alt: [120, 15, 3000],   fl: 16, ch: 0 },
    mi8:    { cls: "heli",    rcs: [10, 20, 15], ir: [0.5, 1, 1.1], abIr: 1,   radar: 0,   gim: 0,  irst: 0,  eo: 6,  illum: 0,  maws: 0, rwr: false, hp: 0.8,  alt: [120, 15, 3000],   fl: 20, ch: 0 },
    mi28:   { cls: "heli",    rcs: [3, 8, 5],    ir: [0.5, 1, 1.1], abIr: 1,   radar: 18,  gim: 60, irst: 0,  eo: 10, illum: 0,  maws: 0, rwr: true, hp: 0.95, alt: [100, 15, 3000],   fl: 16, ch: 0 },
    ka52:   { cls: "heli",    rcs: [2.5, 7, 4],  ir: [0.5, 1, 1.1], abIr: 1,   radar: 18,  gim: 60, irst: 0,  eo: 10, illum: 0,  maws: 0, rwr: true, hp: 0.9,  alt: [100, 15, 3000],   fl: 18, ch: 0 },
    aew_saab340: { cls: "aew", rcs: [6, 22, 18], ir: [0.5, 1, 1.0], abIr: 1,   radar: 400, gim: 180, irst: 0, eo: 8,  illum: 0,  maws: 0, rwr: true, hp: 1.5,  alt: [7600, 500, 9000], fl: 12, ch: 8 },
    tu95:   { cls: "strike",  rcs: [25, 50, 40], ir: [1, 1.4, 1.6], abIr: 1,   radar: 0,   gim: 0,  irst: 0,  eo: 8,  illum: 0,  maws: 0, rwr: true, hp: 2.4,  alt: [10000, 300, 12000], fl: 40, ch: 14 },
    tu22:   { cls: "strike",  rcs: [10, 22, 15], ir: [0.9, 1.1, 1.4], abIr: 1.6, radar: 0, gim: 0, irst: 0,  eo: 8,  illum: 0,  maws: 0, rwr: true, hp: 1.8,  alt: [11000, 200, 14000], fl: 24, ch: 12 },
    mig31:  { cls: "strike",  rcs: [6, 15, 10],  ir: [0.8, 1, 1.4], abIr: 1.8, radar: 0,   gim: 0,  irst: 0,  eo: 8,  illum: 0,  maws: 0, rwr: true, hp: 1.3,  alt: [15000, 200, 20000], fl: 24, ch: 12 },
    su34:   { cls: "strike",  rcs: [8, 16, 10],  ir: [0.8, 1, 1.3], abIr: 1.8, radar: 80,  gim: 60, irst: 0,  eo: 10, illum: 0,  maws: 4, rwr: true, hp: 1.3,  alt: [9000, 100, 14000], fl: 28, ch: 14, self: { r73e: 2 } },
    su24:   { cls: "strike",  rcs: [8, 15, 10],  ir: [0.8, 1, 1.3], abIr: 1.7, radar: 0,   gim: 0,  irst: 0,  eo: 8,  illum: 0,  maws: 0, rwr: true, hp: 1.2,  alt: [3000, 100, 11000], fl: 18, ch: 10, self: { r73e: 2 } }
  };
  const PERF_DEF = { cls: "fighter", rcs: [5, 10, 7], ir: [0.8, 1, 1.2], abIr: 1.8, radar: 70, gim: 60, irst: 0, eo: 8, illum: 1, maws: 0, rwr: true, hp: 1, alt: [8000, 100, 15000], fl: 16, ch: 8 };
  const perf = key => PERF[key] || PERF_DEF;

  /* ---------- ракети «повітря–повітря» (id — як AIR_WPN у грі) ----------
     gd: sarh (напіактивна: потрібне підсвічування) | arh (активна: пуск «забув–і–кинув» після активації) | ir
     R — дальність головою в голову на великій висоті; rmin; v — швидкість, км/с; turn — °/с;
     act — дальність активації ГСН (arh); lock — дальність ІЧ-захоплення по хвостовому ракурсу (ir); bore — кут ГСН, °;
     ccm — стійкість ГСН до пасток (0…1); wh — шкода БЧ (частка живучості); lr — радіус ураження, км */
  const WPN = {
    r27r1: { n: "Р-27Р1",  gd: "sarh", R: 70,  rmin: 3,   v: 38, turn: 200, bore: 60, ccm: 0.45, wh: 1.0,  lr: 0.40 },
    r27er: { n: "Р-27ЕР",  gd: "sarh", R: 110, rmin: 3,   v: 40, turn: 200, bore: 60, ccm: 0.45, wh: 1.1,  lr: 0.42 },
    r27t:  { n: "Р-27Т",   gd: "ir",   R: 60,  rmin: 2,   v: 36, turn: 200, bore: 25, lock: 25, ccm: 0.35, wh: 1.0, lr: 0.40 },
    r27et: { n: "Р-27ЕТ",  gd: "ir",   R: 100, rmin: 2,   v: 38, turn: 200, bore: 25, lock: 30, ccm: 0.35, wh: 1.1, lr: 0.42 },
    r73e:  { n: "Р-73Е",   gd: "ir",   R: 30,  rmin: 0.8, v: 28, turn: 240, bore: 45, lock: 14, ccm: 0.55, wh: 0.85, lr: 0.30 },
    aam_a: { n: "AIM-120C", gd: "arh", R: 100, rmin: 2,   v: 40, turn: 210, bore: 60, act: 18, ccm: 0.6,  wh: 1.0,  lr: 0.32 },
    aam_b: { n: "MICA-EM", gd: "arh",  R: 70,  rmin: 1.5, v: 38, turn: 230, bore: 60, act: 16, ccm: 0.6,  wh: 0.95, lr: 0.32 },
    aam_c: { n: "AIM-9M",  gd: "ir",   R: 18,  rmin: 0.8, v: 28, turn: 230, bore: 25, lock: 12, ccm: 0.5,  wh: 0.8,  lr: 0.28 },
    aam_d: { n: "MICA-IR", gd: "ir",   R: 50,  rmin: 1,   v: 34, turn: 240, bore: 40, lock: 22, ccm: 0.8,  wh: 0.9,  lr: 0.30 }
  };
  /* ракети ЗРК: клас наведення визначає, чим їх зривають (cmd — команда по РЛС/ТВМ; sarh; arh; ir; laser — не залежить від пасток) */
  const IRDEF = { n: "ЗУР", gd: "cmd", ccm: 0.4, wh: 0.9, lr: 0.35 };

  /* ---------- ЗРК проти літаків (ключ — AD_TYPES) ----------
     gd — наведення; amin/amax — ешелон ураження, м; radar — км по цілі 5 м² (0 — лише оптика eo);
     ch — одночасних цілей; wh/lr — БЧ; ecm — стійкість до РЕБ; ccm — стійкість ІЧ-ГСН до пасток; gun — зенітна артилерія */
  const SAM = {
    patriot:  { gd: "tvm",  amin: 60,  amax: 24000, radar: 160, ch: 6,  wh: 1.3, lr: 0.50, ecm: 0.5,  rmin: 3 },
    sampt:    { gd: "arh",  amin: 30,  amax: 25000, radar: 120, ch: 8,  wh: 1.3, lr: 0.45, ecm: 0.6,  rmin: 3, act: 14, ccm: 0.65 },
    iris:     { gd: "ir",   amin: 20,  amax: 20000, radar: 100, ch: 4,  wh: 0.9, lr: 0.30, ecm: 0.6,  rmin: 2, ccm: 0.85 },
    nasams:   { gd: "arh",  amin: 30,  amax: 16000, radar: 75,  ch: 4,  wh: 1.0, lr: 0.32, ecm: 0.55, rmin: 2, act: 16, ccm: 0.6 },
    koral:    { gd: "arh",  amin: 30,  amax: 12000, radar: 45,  ch: 2,  wh: 0.9, lr: 0.32, ecm: 0.4,  rmin: 2, act: 12, ccm: 0.5 },
    s125:     { gd: "cmd",  amin: 200, amax: 18000, radar: 80,  ch: 2,  wh: 0.9, lr: 0.40, ecm: 0.25, rmin: 3 },
    hawk:     { gd: "sarh", amin: 60,  amax: 18000, radar: 100, ch: 3,  wh: 1.0, lr: 0.36, ecm: 0.35, rmin: 3 },
    shershen: { gd: "cmd",  amin: 50,  amax: 10000, radar: 40,  ch: 2,  wh: 0.8, lr: 0.32, ecm: 0.3,  rmin: 2 },
    osa:      { gd: "cmd",  amin: 25,  amax: 5000,  radar: 30,  ch: 1,  wh: 0.7, lr: 0.30, ecm: 0.15, rmin: 1.5 },
    osa_r:    { gd: "cmd",  amin: 25,  amax: 5000,  radar: 30,  ch: 1,  wh: 0.7, lr: 0.30, ecm: 0.15, rmin: 1.5 },
    vampire:  { gd: "laser", amin: 10, amax: 3500,  radar: 0, eo: 9,  ch: 1, wh: 0.7, lr: 0.28, ecm: 1, rmin: 0.8 },
    stormer:  { gd: "laser", amin: 10, amax: 5000,  radar: 0, eo: 8,  ch: 1, wh: 0.8, lr: 0.28, ecm: 1, rmin: 0.8 },
    igla:     { gd: "ir",   amin: 10,  amax: 3500,  radar: 0, eo: 7,  ch: 1, wh: 0.7, lr: 0.26, ecm: 1, rmin: 0.8, ccm: 0.45 },
    igla_r:   { gd: "ir",   amin: 10,  amax: 3500,  radar: 0, eo: 7,  ch: 1, wh: 0.7, lr: 0.26, ecm: 1, rmin: 0.8, ccm: 0.45 },
    stinger:  { gd: "ir",   amin: 10,  amax: 3800,  radar: 0, eo: 7,  ch: 1, wh: 0.7, lr: 0.26, ecm: 1, rmin: 0.8, ccm: 0.6 },
    verba:    { gd: "ir",   amin: 10,  amax: 6000,  radar: 0, eo: 8,  ch: 1, wh: 0.8, lr: 0.28, ecm: 1, rmin: 0.8, ccm: 0.78 },
    strela2:  { gd: "ir",   amin: 10,  amax: 2300,  radar: 0, eo: 6,  ch: 1, wh: 0.6, lr: 0.24, ecm: 1, rmin: 0.8, ccm: 0.15 },
    strela:   { gd: "ir",   amin: 10,  amax: 3500,  radar: 0, eo: 8,  ch: 1, wh: 0.7, lr: 0.28, ecm: 1, rmin: 0.8, ccm: 0.4 },
    tor:      { gd: "cmd",  amin: 10,  amax: 10000, radar: 40,  ch: 2,  wh: 0.8, lr: 0.32, ecm: 0.4,  rmin: 1.5 },
    sosna:    { gd: "laser", amin: 10, amax: 5000,  radar: 25, eo: 10, ch: 1, wh: 0.8, lr: 0.30, ecm: 0.8, rmin: 1 },
    kub:      { gd: "sarh", amin: 50,  amax: 14000, radar: 60,  ch: 1,  wh: 0.9, lr: 0.36, ecm: 0.2,  rmin: 3 },
    buk:      { gd: "sarh", amin: 15,  amax: 25000, radar: 100, ch: 4,  wh: 1.0, lr: 0.38, ecm: 0.4,  rmin: 3 },
    buk3:     { gd: "arh",  amin: 15,  amax: 35000, radar: 150, ch: 6,  wh: 1.1, lr: 0.40, ecm: 0.55, rmin: 3, act: 15, ccm: 0.65 },
    s300:     { gd: "tvm",  amin: 25,  amax: 27000, radar: 180, ch: 6,  wh: 1.3, lr: 0.50, ecm: 0.45, rmin: 5 },
    s300v:    { gd: "tvm",  amin: 25,  amax: 30000, radar: 200, ch: 4,  wh: 1.3, lr: 0.50, ecm: 0.5,  rmin: 5 },
    s350:     { gd: "arh",  amin: 10,  amax: 30000, radar: 200, ch: 8,  wh: 1.2, lr: 0.42, ecm: 0.55, rmin: 3, act: 15, ccm: 0.65 },
    s400:     { gd: "tvm",  amin: 10,  amax: 30000, radar: 220, ch: 6,  wh: 1.4, lr: 0.50, ecm: 0.6,  rmin: 5 },
    s500:     { gd: "tvm",  amin: 10,  amax: 35000, radar: 250, ch: 10, wh: 1.5, lr: 0.55, ecm: 0.7,  rmin: 5 },
    /* зенітна артилерія: черга, шкода залежить від числа влучань; лише низька висота */
    gepard:   { gun: true, amax: 3500, radar: 15, eo: 6, ch: 1, hit: 0.020, wh: 0.16, ecm: 0.2 },
    skynex:   { gun: true, amax: 3000, radar: 15, eo: 6, ch: 1, hit: 0.018, wh: 0.15, ecm: 0.2 },
    tunguska: { gun: true, amax: 3500, radar: 18, eo: 7, ch: 1, hit: 0.020, wh: 0.16, ecm: 0.25 },
    shilka:   { gun: true, amax: 2500, radar: 18, eo: 5, ch: 1, hit: 0.016, wh: 0.13, ecm: 0.1 },
    shilka_r: { gun: true, amax: 2500, radar: 18, eo: 5, ch: 1, hit: 0.016, wh: 0.13, ecm: 0.1 },
    zu23:     { gun: true, amax: 2500, radar: 0,  eo: 4, ch: 1, hit: 0.014, wh: 0.12, ecm: 1 },
    zu23m:    { gun: true, amax: 2500, radar: 0,  eo: 4, ch: 1, hit: 0.014, wh: 0.12, ecm: 1 },
    mvg:      { gun: true, amax: 1500, radar: 0,  eo: 3, ch: 1, hit: 0.010, wh: 0.10, ecm: 1 },
    mvg_r:    { gun: true, amax: 1500, radar: 0,  eo: 3, ch: 1, hit: 0.010, wh: 0.10, ecm: 1 },
    pantsir:  { gun: true, amax: 3500, radar: 36, eo: 7, ch: 2, hit: 0.030, wh: 0.20, ecm: 0.45 }
  };
  const samOf = key => SAM[key] || null;

  /* ---------- ракурс, ЕПР, ІЧ ---------- */
  /* кут між курсом цілі та напрямком «від цілі до точки from»: 0 — ціль летить на from (ніс), 180 — хвіст */
  const aspectOf = (t, from) => Math.abs(angd(t.hdg, brg(t.pos, from)));
  function lerp3(v, asp) { return asp <= 90 ? v[0] + (v[1] - v[0]) * (asp / 90) : v[1] + (v[2] - v[1]) * ((asp - 90) / 90); }
  const rcsAt = (t, from) => lerp3(perf(t.key).rcs, aspectOf(t, from));
  const irAt = (t, from) => { const P = perf(t.key); return lerp3(P.ir, aspectOf(t, from)) * (t.ab ? P.abIr : 1); };
  /* «виріз»: ціль на траверзі до джерела — доплерівський фільтр РЛС відсікає її; діє, коли ціль нижче РЛС (злиття із землею) */
  function notched(t, from, srcAlt) {
    const asp = aspectOf(t, from);
    if (Math.abs(asp - 90) > CFG.notchDeg) return false;
    return (srcAlt == null) || (t.alt <= srcAlt - 400) || t.st && t.st.notch;
  }
  /* підсумкова дальність РЛС по цілі */
  function radarRange(R5, t, from, srcAlt, ecm) {
    const rcs = rcsAt(t, from);
    let R = R5 * Math.pow(Math.max(0.05, rcs) / 5, 0.25);
    if (srcAlt != null && t.alt < srcAlt - 1500) R *= CFG.lookDown;
    if (notched(t, from, srcAlt)) R *= CFG.notchK;
    R *= (1 - 0.5 * clamp(ecm || 0, 0, 1)) * chaffMask(t);
    return R;
  }
  /* хмара відбивачів біля цілі зменшує якість радіолокаційного супроводу */
  function chaffMask(t) { const c = t._chaff || 0; return c > 0 ? clamp(1 - 0.38 * Math.min(2, c), 0.25, 1) : 1; }

  /* ================================================================
     рушій
     ================================================================ */
  function create(env) {
    env = env || {};
    const rand = env.rand || Math.random;
    const E = { mis: [], dec: [], stats: { launched: 0, hits: 0, kills: 0, lost: 0, decoyed: 0, reguided: 0, flares: 0, chaff: 0, samLaunched: 0 },
                acc: 0, uid: 1, t: 0, net: { ua: new Map(), ru: new Map() }, acts: new Map(), actors: [], sams: [] };
    const say = (side, msg, k) => { if (env.say) env.say(side, msg, k); };

    /* ---------- допоміжні ---------- */
    const byId = id => E.acts.get(id) || null;
    const isAir = a => a && !a.dead;
    const hostile = (a, b) => a.side !== b.side;
    /* стан живучості */
    function ensure(a) {
      const P = perf(a.key), s = a.st;
      if (s.hp == null) { s.hp = P.hp; s.flares = P.fl; s.chaff = P.ch; s.lastFl = -9; s.lastCh = -9; s.evT = 0; s.cmd = null; s.threat = 0; s.cool = 0; s.stt = null; s.lockT = 0; s.vol = {}; }
      if (s.alt == null) s.alt = P.alt[0];
      if (a.alt == null) a.alt = s.alt;
      return s;
    }
    function restock(a) { const P = perf(a.key), s = a.st; s.flares = P.fl; s.chaff = P.ch; s.hp = Math.max(s.hp || 0, P.hp); }

    /* ---------- виявлення ---------- */
    /* власні датчики актора по цілі: повертає { q, via } або null */
    function senseOwn(a, t) {
      const P = perf(a.key), d = dist(a.pos, t.pos);
      if (d > 450) return null;
      const jam = env.ecm ? env.ecm(t.side, a.pos) : 0;
      let best = null;
      const hz = horizon(a.alt, t.alt);
      if (P.radar > 0 && d <= hz * 1.05 && !a.st.radarOff) {
        const off1 = Math.abs(angd(a.hdg, brg(a.pos, t.pos)));
        if (off1 <= P.gim) {
          const R = radarRange(P.radar, t, a.pos, a.alt, jam);
          if (d <= R * 0.85 || (d <= R && rand() < (R - d) / (0.15 * R))) best = { q: clamp(1.1 - d / R, 0.3, 1), via: "radar", R };
        }
      }
      if (!best && P.irst > 0 && d <= P.irst * irAt(t, a.pos) * 0.75) {
        const off1 = Math.abs(angd(a.hdg, brg(a.pos, t.pos)));
        if (off1 <= 90) best = { q: 0.5, via: "irst" };
      }
      if (!best && d <= (P.eo || 6) && (a.cls === "heli" || t.cls === "heli" || d <= 4)) best = { q: 0.4, via: "eo" };
      return best;
    }

    /* зведена картина сторони: що вона знає про літаки противника (власні датчики + мережа) */
    function buildPic(side) {
      const pic = new Map(), foes = E.actors.filter(x => x.side !== side && !x.dead && x.airborne);
      const link = env.link ? env.link(side) : true;
      /* бортові РЛС / ІЧ-пошук / оптика кожного літака */
      for (const a of E.actors) {
        if (a.side !== side || a.dead || !a.airborne) continue;
        for (const t of foes) {
          const s = senseOwn(a, t); if (!s) continue;
          a.st.own = a.st.own || {}; a.st.own[t.id] = E.t;
          const k = pic.get(t.id);
          if (!k || s.q > k.q) pic.set(t.id, { q: s.q, via: s.via, by: a.id, t: E.t, net: link });
        }
      }
      /* РЛС ЗРК */
      for (const m of E.sams) {
        if (m.side !== side || m.dead) continue;
        const S = samOf(m.key); if (!S) continue;
        for (const t of foes) {
          const d = dist(m.pos, t.pos);
          if (S.radar > 0 && !env.fogOnly) {
            const hz = horizon(12, t.alt);
            if (d > hz) continue;
            const R = radarRange(S.radar, t, m.pos, 12, env.ecm ? env.ecm(t.side, m.pos) : 0);
            if (d <= R * 0.85 || (d <= R && rand() < (R - d) / (0.15 * R))) {
              const k = pic.get(t.id), q = clamp(1.1 - d / R, 0.3, 1);
              if (!k || q > k.q) pic.set(t.id, { q, via: "sam", by: m.id, t: E.t, net: link });
            }
          } else if (S.eo && d <= S.eo && t.alt <= (S.amax || 5000)) {
            const k = pic.get(t.id); if (!k) pic.set(t.id, { q: 0.45, via: "eo", by: m.id, t: E.t, net: false });
          }
        }
      }
      /* наземні РЛС, ДРЛО: дані з картини РЛС гри */
      if (env.cue) for (const t of foes) {
        const c = env.cue(side, t); if (!c) continue;
        const k = pic.get(t.id), q = clamp(c.conf == null ? 0.7 : c.conf, 0, 1);
        if (!k || q > k.q) pic.set(t.id, { q, via: c.via || "radar-net", by: null, t: E.t, net: link });
      }
      return pic;
    }

    /* актор знає ціль: власні датчики або мережа (за наявності каналу зв’язку) */
    function knows(a, t) {
      const pic = E.net[a.side].get(t.id);
      if (!pic) return null;
      if (pic.by === a.id) return pic;
      if (pic.net) return pic;
      return null;
    }

    /* ---------- пастки ---------- */
    function dropFlare(a) {
      const s = a.st; if (s.flares <= 0 || E.t - s.lastFl < CFG.flareStep) return false;
      s.flares--; s.lastFl = E.t; E.stats.flares++;
      const v = vel(a);
      E.dec.push({ id: E.uid++, kind: "flare", side: a.side, owner: a.id, pos: a.pos.slice(), born: E.t, life: CFG.flareLife * (0.8 + 0.4 * rand()), ir: CFG.flareIR, vx: v[0] * 0.2, vy: v[1] * 0.2 });
      if (env.fx) env.fx("flare", a.pos);
      return true;
    }
    function dropChaff(a) {
      const s = a.st; if (s.chaff <= 0 || E.t - s.lastCh < CFG.chaffStep) return false;
      s.chaff--; s.lastCh = E.t; E.stats.chaff++;
      const v = vel(a);
      E.dec.push({ id: E.uid++, kind: "chaff", side: a.side, owner: a.id, pos: a.pos.slice(), born: E.t, life: CFG.chaffLife * (0.8 + 0.4 * rand()), rcs: CFG.chaffRCS, rad: CFG.chaffRad, vx: v[0] * 0.15, vy: v[1] * 0.15 });
      if (env.fx) env.fx("chaff", a.pos);
      return true;
    }
    function stepDecoys(dt) {
      for (let i = E.dec.length - 1; i >= 0; i--) {
        const d = E.dec[i], age = E.t - d.born;
        if (age >= d.life) { E.dec.splice(i, 1); continue; }
        d.pos = off(d.pos, d.vx * dt, d.vy * dt);
        d.vx *= 0.96; d.vy *= 0.96;
        if (d.kind === "chaff") d.rcsNow = d.rcs * Math.min(1, age / 0.25) * (1 - age / d.life * 0.7);
        else d.irNow = d.ir * (1 - age / d.life * 0.8);
      }
    }
    /* скільки відбивачів накриває ціль (для маски РЛС) */
    function chaffAround(t) {
      let n = 0;
      for (const d of E.dec) if (d.kind === "chaff" && d.side === t.side && dist(d.pos, t.pos) <= d.rad * 1.6) n += (d.rcsNow || 0) / CFG.chaffRCS;
      return n;
    }

    /* ---------- ракети ---------- */
    function launch(shooter, t, wid, opts) {
      opts = opts || {};
      const W = opts.W || WPN[wid]; if (!W) return null;
      const alt = shooter.alt != null ? shooter.alt : 8000;
      const m = { id: E.uid++, wid, W, gd: W.gd, side: shooter.side, from: shooter.id, fromSam: !!opts.sam, tgt: t.id,
        pos: shooter.pos.slice(), hdg: opts.hdg != null ? opts.hdg : brg(shooter.pos, t.pos), v: W.v * 0.55, vmax: W.v, fl: 0,
        max: W.R * opts.kAlt * 1.15 + 6, alt, born: E.t, st: "boost", lock: true, lost: 0, last: t.pos.slice(), lastV: vel(t), seen: E.t,
        decoy: null, trail: [[shooter.pos[0], shooter.pos[1], opts.now || 0]], tl: 0, seed: rand(), act: false, upd: E.t,
        lr: W.lr, wh: W.wh, acc: opts.acc == null ? 0.18 : opts.acc, sam: opts.sam || null, bornD: dist(shooter.pos, t.pos) };
      E.mis.push(m); E.stats.launched++; if (opts.sam) E.stats.samLaunched++;
      t.st.inb = (t.st.inb | 0) + 1; t.st.lastInb = E.t;
      if (env.fx) env.fx("launch", shooter.pos, m.hdg, shooter);
      return m;
    }
    const alive = id => { const a = byId(id); return a && !a.dead ? a : null; };

    /* чи підсвічує пускач ціль (напіактивна ГСН) */
    function illuminated(m, t) {
      if (m.fromSam) {
        const s = E.samById.get(m.from); if (!s || s.dead) return false;
        const q = fcQuality(s, t); m.q = q; return q >= 0.3;
      }
      const f = byId(m.from); if (!f || f.dead) return false;
      if (f.st.stt !== t.id) return false;
      const P = perf(f.key), d = dist(f.pos, t.pos);
      if (Math.abs(angd(f.hdg, brg(f.pos, t.pos))) > P.gim) return false;
      const jam = env.ecm ? env.ecm(t.side, f.pos) : 0;
      const R = radarRange(P.radar || 100, t, f.pos, f.alt, jam);
      m.q = clamp(1.1 - d / Math.max(10, R), 0, 1);
      return d <= R * 1.05 && !notched(t, f.pos, f.alt);
    }
    /* якість супроводу вогневим каналом ЗРК */
    function fcQuality(s, t) {
      const S = samOf(s.key); if (!S) return 0;
      const d = dist(s.pos, t.pos);
      if (S.eo && !S.radar) return d <= S.eo && t.alt <= (S.amax || 5000) ? 0.85 : 0;
      const hz = horizon(12, t.alt); if (d > hz * 1.03) return 0;
      const jam = env.ecm ? env.ecm(t.side, s.pos) : 0;
      let q = 1 - 0.35 * (d / Math.max(10, s.rmax || 60));
      if (notched(t, s.pos, 12)) q *= 0.18;
      q *= chaffMask(t);
      q *= 1 - clamp(jam, 0, 1) * (1 - (S.ecm || 0.3)) * 0.9;
      if (t.alt < 300 && d > hz * 0.7) q *= 0.5;
      return clamp(q, 0, 1);
    }

    /* ІЧ-контраст: ціль проти пасток у полі зору ГСН. Повертає об’єкт, що ГСН «бачить» */
    function irSeduce(m, t, ccm) {
      let best = null, bs = 0;
      const ang0 = brg(m.pos, t.pos), tIR = Math.max(0.05, irAt(t, m.pos)) * 1.0;
      for (const d of E.dec) {
        if (d.kind !== "flare" || d.side !== t.side) continue;
        const a = Math.abs(angd(ang0, brg(m.pos, d.pos)));
        if (a > 12) continue;
        const sc = (d.irNow || d.ir) * (1 - ccm);
        if (sc > bs) { bs = sc; best = d; }
      }
      if (best && bs > tIR * (0.8 + 0.5 * rand())) return best;
      return null;
    }

    /* ---------- крок ракети ---------- */
    function stepMissile(m, dt) {
      const t = alive(m.tgt) || (m.sam && m.sam.fixed ? null : null);
      const W = m.W;
      /* ціль зникла (збита / вийшла) */
      if (!t) { m.st = "spent"; return true; }
      const tg = ghost(t);
      const d = dist(m.pos, tg);
      /* --- захоплення / втрата --- */
      let guided = true, why = "";
      const tIdx = t;
      if (m.decoy) {                                 // ГСН веде хибна ціль
        const dc = m.decoy;
        if (E.dec.indexOf(dc) < 0 || (E.t - dc.born) >= dc.life) { m.decoy = null; m.reacq = E.t; guided = false; why = "decoy-gone"; }
        else { m.last = dc.pos.slice(); m.lastV = [dc.vx, dc.vy]; }
      }
      if (!m.decoy) {
        if (m.gd === "sarh") guided = illuminated(m, t);
        else if (m.gd === "cmd" || m.gd === "tvm") guided = m.fromSam ? illuminated(m, t) : false;
        else if (m.gd === "laser") guided = m.fromSam ? illuminated(m, t) && d <= (samOf(m.sam && m.sam.key) || {}).eo * 1.3 : true;
        else if (m.gd === "arh") {
          const act = (m.W.act || 16);
          if (!m.act && d <= act) {
            const R = radarRange(60, t, m.pos, m.alt || 6000, env.ecm ? env.ecm(t.side, m.pos) : 0);
            const bore = Math.abs(angd(m.hdg, brg(m.pos, tg)));
            if (bore <= 40 && d <= R * 0.8 + 6 && !notched(t, m.pos, m.alt || 6000)) { m.act = true; m.seen = E.t; }
            else if (bore > 40 || notched(t, m.pos, m.alt || 6000)) { /* ще не знайшла — іде далі за останніми даними */ guided = false; }
          }
          if (m.act) {
            const ch = chaffAround(t);
            if (ch > 0.2 && !m.decoy) {            // активна ГСН може сісти на відбивачі
              const c = E.dec.find(x => x.kind === "chaff" && x.side === t.side && dist(x.pos, m.pos) < dist(tg, m.pos) + 2.5 && dist(x.pos, tg) <= x.rad * 1.8);
              const p = (c ? (c.rcsNow || 0) / ((c.rcsNow || 0) + rcsAt(t, m.pos)) : 0) * (1 - (m.W.ccm || 0.5));
              if (c && rand() < p * 0.22) { m.decoy = c; E.stats.decoyed++; say(t.side, `Ракета ${m.W.n} захопила дипольні відбивачі`, "ev"); }
            }
            if (!m.decoy && notched(t, m.pos, m.alt || 6000) && rand() < 0.06 * dt / CFG.sub) { guided = false; why = "notch"; m.act = false; }
          } else if (!m.mid) {
            /* середня ділянка: коригування з борта, доки пускач відстежує ціль */
            const f = byId(m.from);
            const upd = f && !f.dead ? (E.net[f.side].get(t.id) ? true : false) : false;
            const bore = f ? Math.abs(angd(f.hdg, brg(f.pos, tg))) : 180;
            if (upd && bore <= (perf(f.key).gim + 20)) m.upd = E.t;
            guided = (E.t - m.upd) < 4 || m.fromSam;
          }
        }
        else if (m.gd === "ir") {
          const S = m.fromSam ? samOf(m.sam && m.sam.key) : null;
          const lockR = (W.lock || (S ? ((S.eo || 7) * 1.0) : 14)) * clamp(irAt(t, m.pos) / 1.0, 0.4, 2.2);
          const bore = Math.abs(angd(m.hdg, brg(m.pos, tg)));
          if (!m.act) {
            if (bore <= (W.bore || 30) && d <= lockR) m.act = true;
            else if (m.fromSam && d <= lockR * 2) m.act = true;     // ЗУР з ІЧ-ГСН пускається після радіоцілевказання
            guided = m.act || (E.t - m.born) < 0.8 || m.fromSam;
          }
          if (m.act) {
            const sd2 = irSeduce(m, t, (S ? S.ccm : W.ccm) || 0.5);
            if (sd2) { m.decoy = sd2; E.stats.decoyed++; say(t.side, `Ракета ${W.n} відвернута тепловою пасткою`, "ev"); }
            else if (bore > (W.bore || 30) * 1.8 && d > 3) { guided = false; m.act = false; why = "fov"; }
          }
        }
      }
      /* --- логіка втрати / повторного захоплення --- */
      if (guided) { if (m.st === "inertial") { m.st = "guided"; E.stats.reguided++; } else if (m.st === "boost" && m.fl > W.R * 0.04) m.st = "guided"; m.lost = 0; m.seen = E.t; m.last = (m.decoy ? m.decoy.pos : tg).slice(); m.lastV = m.decoy ? [m.decoy.vx, m.decoy.vy] : vel(t); }
      else { m.lost += dt; if (m.st !== "inertial") { m.st = "inertial"; say(t.side, `Захоплення ${m.W.n} втрачено`, "ev"); } if (m.lost > CFG.reguide) { m.st = "spent"; E.stats.lost++; return true; } }

      /* --- кінематика --- */
      const fr = m.fl / m.max;
      if (fr > 0.55) m.v = Math.max(m.vmax * 0.42, m.v - m.vmax * 0.32 * dt); else m.v = Math.min(m.vmax, m.v + m.vmax * 1.8 * dt);
      const aimP = m.decoy ? m.decoy.pos : (guided || m.st === "guided" ? tg : predict(m.last, m.lastV, E.t - m.seen));
      const dAim = dist(m.pos, aimP);
      /* пропорційне наведення: упередження за швидкістю цілі */
      const tv = m.decoy ? [m.decoy.vx, m.decoy.vy] : vel(t), ttg = dAim / Math.max(1, m.v);
      const lead = off(aimP, tv[0] * Math.min(ttg, 2.5), tv[1] * Math.min(ttg, 2.5));
      const want = brg(m.pos, dAim < 2 ? aimP : lead);
      const energy = 0.35 + 0.65 * Math.min(1, m.v / m.vmax);
      const cap = (m.W.turn || 200) * dt * energy;
      m.hdg = (m.hdg + clamp(angd(m.hdg, want), -cap, cap) + 360) % 360;
      const step = m.v * dt, p0 = m.pos;
      m.pos = mv(m.pos, m.hdg, step); m.fl += step;
      m.tl += dt; if (m.tl >= 0.045) { m.tl = 0; m.trail.push([m.pos[0], m.pos[1], env.nowMs ? env.nowMs() : 0]); if (m.trail.length > 70) m.trail.shift(); }
      /* --- наближення: найменша відстань на відрізку руху --- */
      if (!m.decoy && m.st !== "spent") {
        const cpa = closest(p0, m.pos, tg, t.v ? t.v : vel(t), dt);
        if (cpa <= Math.max(m.lr * 1.8, 0.6) && (guided || m.st === "inertial" && cpa <= m.lr * 1.1)) { detonate(m, t, cpa); return true; }
      } else if (m.decoy) {
        if (dist(m.pos, m.decoy.pos) <= 0.5) { m.st = "spent"; E.stats.decoyed++; return true; }
      }
      if (m.fl > m.max || (m.v < m.vmax * 0.43 && fr > 0.75)) { m.st = "spent"; E.stats.lost++; return true; }
      return false;
    }
    const predict = (p, v, dt) => off(p, v[0] * dt, v[1] * dt);
    /* положення цілі всередині кроку симуляції (актор уже зсунутий на кінець кроку) */
    function ghost(t) { const v = vel(t), k = E.dtAhead || 0; return off(t.pos, -v[0] * k, -v[1] * k); }
    /* мінімальна відстань між відрізком ракети й рухомою ціллю за крок */
    function closest(p0, p1, tp, tv, dt) {
      const a = rel(tp, p0), b = rel(tp, p1);                // ракета відносно цілі на початку/кінці підкроку (ціль — у спокої)
      const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
      const u = l2 > 1e-9 ? clamp(-(a[0] * dx + a[1] * dy) / l2, 0, 1) : 0;
      return Math.hypot(a[0] + dx * u, a[1] + dy * u);
    }

    /* ---------- влучання ---------- */
    function detonate(m, t, miss) {
      m.st = "spent";
      const W = m.W, S = m.fromSam ? samOf(m.sam && m.sam.key) : null;
      const sig = (0.2 + 0.5 * (1 - clamp(m.q == null ? 0.7 : m.q, 0, 1))) * (0.8 + 0.4 * (1 - m.v / m.vmax));
      const manv = t.st.brkT > E.t ? 1.35 : 1;
      const miss2 = Math.abs(miss + (rand() - 0.35) * sig * manv * 0.6);
      E.stats.hits++;
      if (miss2 > m.lr * 1.15) { if (env.fx) env.fx("miss", m.pos); say(t.side, `${W.n} пройшла повз ${t.label || t.key}`, "ev"); t.st.miss = (t.st.miss | 0) + 1; return; }
      const dmg = m.wh * clamp(1.3 - miss2 / m.lr, 0.25, 1.3) * (0.85 + 0.3 * rand());
      damage(t, dmg, m);
    }
    function damage(t, dmg, m) {
      t.st.hp -= dmg;
      const by = m && m.fromSam ? E.samById.get(m.from) : m ? byId(m.from) : null;
      if (t.st.hp <= 0.05) {
        t.dead = true; E.stats.kills++;
        if (env.kill) env.kill(t, by || null, m || null);
        if (env.fx) env.fx("kill", t.pos);
      } else {
        t.st.dmg = (t.st.dmg || 0) + dmg;
        if (env.damaged) env.damaged(t, by || null, dmg);
        if (env.fx) env.fx("hit", t.pos);
      }
    }

    /* ---------- уникання ---------- */
    function defend(a, dt) {
      const s = a.st, P = perf(a.key);
      const inb = [];
      for (const m of E.mis) {
        if (m.tgt !== a.id || m.st === "spent") continue;
        const d = dist(m.pos, a.pos);
        const radarK = m.gd !== "ir" && m.gd !== "laser";
        let seen = false;
        if (m.gd === "ir") seen = (P.maws > 0 && d <= P.maws * 1.4) || d <= 3.5;
        else if (m.gd === "laser") seen = d <= 2;
        else seen = P.rwr && (m.act || m.fromSam || m.st === "guided") && d <= 40 || d <= 4;
        if (!m.warned && seen) { m.warned = E.t; if (a.pilot !== false) say(a.side, `${a.label || a.key}: попередження — ракета ${m.W.n}`, "warn"); }
        if (m.warned && E.t - m.warned >= CFG.reactT) inb.push({ m, d, radarK });
      }
      if (!inb.length) {
        if (s.brkT > E.t) {} else { s.notch = false; if (s.cmd && s.cmd.kind === "evade") s.cmd = null; }
        return false;
      }
      inb.sort((x, y) => x.d - y.d);
      const n = inb[0], m = n.m, d = n.d, toMis = brg(a.pos, m.pos);
      /* розворот на 90° до ракети (виріз для радіолокаційних, борт для ІЧ), у бік, який не виводить за межі */
      const side = s.evDir || (s.evDir = rand() < 0.5 ? 1 : -1);
      let hdg = (toMis + 90 * side + 360) % 360;
      if (env.airOK && !env.airOK(a, mv(a.pos, hdg, 12))) { s.evDir = -side; hdg = (toMis - 90 * side + 360) % 360; }
      s.brkT = E.t + 0.5; s.notch = n.radarK;
      const low = P.alt[1];
      let altCmd = a.alt;
      if (n.radarK && a.cls !== "heli") altCmd = Math.max(low, Math.min(a.alt, CFG.dmgDive));
      else if (a.cls !== "heli") altCmd = Math.max(low, a.alt * 0.7);
      s.cmd = { kind: "evade", hdg, alt: altCmd, spd: 1.0, k: a.free ? 2 : 1, t: E.t + 0.6, ab: true };
      /* пастки: ІЧ — за дальності ≤ 10 км, радіолокаційні — ≤ 22 км */
      const lim = n.radarK ? 22 : 10;
      if (d <= lim) {
        if (n.radarK && a.cls !== "heli") dropChaff(a);
        if (!n.radarK || d <= 8) dropFlare(a);
        if (n.radarK && P.ch === 0) dropFlare(a);
      }
      return true;
    }

    /* ---------- ураження літаків ЗРК ---------- */
    function samPlan(s) {
      const S = samOf(s.key); if (!S) return;
      s.dead = false;
      if (!s.ready) return;
      const myM = E.mis.filter(x => x.from === s.id && x.fromSam && x.st !== "spent").length;
      if (myM >= (S.ch || 1)) return;
      const foes = E.actors.filter(x => x.side !== s.side && !x.dead && x.airborne);
      let best = null, bs = Infinity;
      for (const t of foes) {
        if (t.alt > S.amax || t.alt < (S.amin || 0)) continue;
        const d = dist(s.pos, t.pos);
        if (d > s.rmax || d < (S.rmin || 1)) continue;
        if (!E.samSeen(s, t)) continue;
        const inFlight = E.mis.filter(x => x.tgt === t.id && x.st !== "spent").length;
        const need = (t.st.hp > 1.2 ? 2 : 1) + (S.gd === "ir" || S.gun ? 0 : 0);
        if (inFlight >= need + (S.ch > 3 ? 1 : 0)) continue;
        const val = (t.cls === "strike" ? -30 : t.cls === "aew" ? -45 : t.cls === "fighter" ? -10 : 0);
        const sc = d + val + inFlight * 25;
        if (sc < bs) { bs = sc; best = t; }
      }
      if (best) E.samFire(s, S, best);
    }
    /* SAM бачить ціль: власна РЛС (якщо не «туман війни») або картина сторони */
    E.samSeen = (s, t) => {
      const S = samOf(s.key); if (!S) return false;
      const pic = E.net[s.side].get(t.id);
      if (pic && (pic.net || pic.by === s.id) && pic.q >= (S.gun ? 0.3 : 0.45)) return true;
      if (env.fogOnly) return false;
      const d = dist(s.pos, t.pos);
      if (S.radar > 0) { const R = radarRange(S.radar, t, s.pos, 12, env.ecm ? env.ecm(t.side, s.pos) : 0); return d <= R && d <= horizon(12, t.alt); }
      return d <= (S.eo || 5) && t.alt <= (S.amax || 5000);
    };
    E.samFire = (s, S, t) => {
      const d = dist(s.pos, t.pos);
      if (S.gun) { gunBurst(s, S, t, d); return; }
      /* ІЧ-ЗУР потребує ІЧ-контрасту в секторі; лазерна — оптичного супроводу; решта — якості треку вогневого каналу */
      if (S.gd === "laser" || S.gd === "ir" && !S.radar) { if (d > (S.eo || 6) * 1.1) return; }
      const q = fcQuality(s, t);
      if (q < 0.3 && (S.gd === "cmd" || S.gd === "tvm" || S.gd === "sarh")) return;
      if (!s.take || !s.take()) return;
      const vmax = s.vmax || 30;
      const W = { n: s.name || "ЗУР", gd: S.gd === "tvm" ? "tvm" : S.gd, R: s.rmax, rmin: S.rmin, v: vmax, turn: 190, bore: 40, act: S.act || 14, ccm: S.ccm || 0.4, wh: S.wh, lr: S.lr, lock: (S.eo || 12) };
      const m = launch({ id: s.id, side: s.side, pos: s.pos, alt: 10 }, t, "sam:" + s.key, { W, kAlt: 1, sam: s, hdg: brg(s.pos, t.pos) + (rand() - 0.5) * 6 });
      if (m) { m.fromSam = true; m.max = s.rmax * 1.2 + 8; m.q = q; m.gd = W.gd; say(t.side, `${t.label || t.key}: по вас пущено ЗУР (${s.name || s.key})`, "warn"); say(s.side, `${s.name || s.key}: пуск по ${t.label || t.key}`, "own"); }
    };
    /* зенітна черга: шкода — кількістю влучань */
    function gunBurst(s, S, t, d) {
      if (!s.take || !s.take()) return;
      const q = fcQuality(s, t); if (q < 0.25) return;
      const rcs = rcsAt(t, s.pos);
      const n = CFG.gunBurst;
      const pHit = S.hit * Math.min(2.5, 0.5 + rcs / 8) * q * (1 - 0.55 * d / Math.max(2, s.rmax)) * (t.st.brkT > E.t ? 0.6 : 1);
      let hits = 0; for (let i = 0; i < n; i++) if (rand() < pHit) hits++;
      if (env.fx) env.fx("gun", s.pos, brg(s.pos, t.pos), s);
      if (hits > 0) damage(t, hits * S.wh * 0.35, { fromSam: true, from: s.id, W: { n: s.name || "ЗАК" } });
    }

    /* ---------- бій літаків ---------- */
    /* дальність ракети з урахуванням висоти й ракурсу цілі */
    function rangeEff(W, a, t) {
      const kAlt = clamp(0.5 + 0.5 * Math.min(1, ((a.alt || 0) + (t.alt || 0)) / 2 / 9000), 0.5, 1.05);
      const asp = aspectOf(t, a.pos);                  // 0 — голова в голову, 180 — доганяє хвіст
      const kAsp = 1 - 0.58 * (asp / 180);
      const closure = 0.8 + 0.4 * clamp((a.spd + t.spd * (1 - asp / 90)) / (a.spd + 1), 0, 1.5);
      return W.R * kAlt * kAsp * clamp(closure, 0.7, 1.15);
    }
    function pickWeapon(a, t, d) {
      const ammo = a.ammo ? a.ammo() : null; if (!ammo) return null;
      let best = null, bs = -1;
      const bore = Math.abs(angd(a.hdg, brg(a.pos, t.pos)));
      for (const wid in ammo) {
        if (!(ammo[wid] > 0)) continue;
        const W = WPN[wid]; if (!W) continue;
        const R = rangeEff(W, a, t);
        if (d < W.rmin || d > R * 0.93) continue;
        if (W.gd === "ir") {
          const lockR = W.lock * clamp(irAt(t, a.pos), 0.4, 2.2);
          if (d > lockR * 1.05 || bore > W.bore) continue;
        } else if (bore > perf(a.key).gim) continue;
        const f = d / R;
        const sc = (W.gd === "ir" ? 0.9 : 1.0) * (1 - f * 0.55) + (W.gd === "arh" ? 0.12 : 0) + rand() * 0.08;
        if (sc > bs) { bs = sc; best = wid; }
      }
      return best;
    }
    function illumCount(a) { let n = 0; for (const m of E.mis) if (m.from === a.id && !m.fromSam && m.gd === "sarh" && m.st !== "spent") n++; return n; }
    function plan(a, dt) {
      const P = perf(a.key), s = a.st;
      if (a.cls === "aew") return aewPlan(a);
      s.cool = Math.max(0, s.cool - dt);
      const under = defend(a, dt);
      s.under = under;
      if (under) { s.stt = null; s.lockT = 0; return; }       // обороняється — підсвічування й радар на ціль зривається
      const ammo = a.ammo ? a.ammo() : null;
      const hasAAM = ammo && Object.keys(ammo).some(k => ammo[k] > 0 && WPN[k]);
      /* ціль: серед відомих ворожих літаків */
      let best = null, bs = Infinity;
      for (const t of E.actors) {
        if (t.dead || !t.airborne || t.side === a.side) continue;
        const k = knows(a, t); if (!k) continue;
        const d = dist(a.pos, t.pos);
        if (d > (a.engageR || 160)) continue;
        if (env.airOK && a.free && d > 90 && !env.airOK(a, t.pos) && !hasAAM) continue;
        let sc = d;
        if (t.cls === "strike") sc -= 40; else if (t.cls === "aew") sc -= 70; else if (t.cls === "heli") sc += 25;
        const thr = E.mis.filter(x => x.from === t.id && x.tgt === a.id && x.st !== "spent").length; sc -= thr * 60;
        if (t.st.stt === a.id) sc -= 80;
        if (a.cls === "heli" && t.cls !== "heli" && d > CFG.heliRange * 2) continue;
        if (sc < bs) { bs = sc; best = t; }
      }
      s.tgt = best ? best.id : null;
      if (!best) { s.stt = null; s.lockT = 0; if (s.cmd && s.cmd.kind === "pursue") s.cmd = null; return; }
      const d = dist(a.pos, best.pos), own = senseOwn(a, best);
      /* маневр: наближення до цілі (лише свобідні літаки) */
      if (a.free && a.canPursue && (hasAAM || a.cls === "heli")) {
        const lead = off(best.pos, vel(best)[0] * Math.min(d / Math.max(8, a.spd), 3), vel(best)[1] * Math.min(d / Math.max(8, a.spd), 3));
        const keep = a.cls === "fighter" && hasAAM && d < 22 && P.radar > 0 ? 0 : 0;
        s.cmd = { kind: "pursue", hdg: brg(a.pos, lead), alt: best.alt > 6000 ? Math.min(P.alt[0], best.alt) : Math.max(P.alt[1] + 200, best.alt), spd: 1.0, k: 3, t: E.t + 0.5, ab: d > 25 };
      }
      if (!hasAAM && a.cls !== "heli") { if (s.cmd && s.cmd.kind === "pursue") s.cmd = null; return; }
      if (a.cls === "heli") { heliFight(a, best, d); return; }
      /* підсвічування / захоплення */
      const wid = pickWeapon(a, best, d), W = wid && WPN[wid];
      if (!W) { s.stt = null; s.lockT = 0; return; }
      if (W.gd === "sarh") {
        if (!own || own.via !== "radar") { s.stt = null; s.lockT = 0; return; }
        if (illumCount(a) >= P.illum && s.stt !== best.id) return;
        if (s.stt !== best.id) { s.stt = best.id; s.lockT = 0; say(a.side, `${a.label || a.key}: захоплення ${best.label || best.key}`, "own"); if (env.warnLock) env.warnLock(best, a); }
        s.lockT += CFG.tick;
        if (s.lockT < CFG.lockT) return;
      } else if (W.gd === "arh") {
        if (!own && !(knows(a, best) && knows(a, best).q >= 0.45)) return;
        s.stt = (own && own.via === "radar") ? best.id : s.stt;
        s.lockT += CFG.tick;
        if (s.lockT < CFG.lockT * 0.7) { s.lockT += 0; if (s.lockT < CFG.lockT * 0.7) return; }
      } else { if (!own || (own.via !== "radar" && own.via !== "irst" && own.via !== "eo")) return; }
      if (s.cool > 0 || E.t - (s.lastShot || -9) < CFG.rof) return;
      /* залп: не більше salvoMax ракет по одній цілі одночасно */
      const inflight = E.mis.filter(x => x.from === a.id && x.tgt === best.id && x.st !== "spent").length;
      if (inflight >= CFG.salvoMax) return;
      if (inflight >= 1 && d > rangeEff(W, a, best) * 0.5 && best.cls !== "strike" && best.cls !== "aew") return;
      if (!a.take || !a.take(wid)) return;
      const kAlt = clamp(0.5 + 0.5 * Math.min(1, ((a.alt || 0) + (best.alt || 0)) / 2 / 9000), 0.5, 1.05);
      const m = launch(a, best, wid, { kAlt, now: env.nowMs ? env.nowMs() : 0 });
      if (m) {
        s.lastShot = E.t; s.cool = CFG.rof;
        m.max = rangeEff(W, a, best) * 1.15 + 6;
        say(a.side, `${a.label || a.key}: пуск ${W.n} по ${best.label || best.key} (${d.toFixed(0)} км)`, "own");
        say(best.side, `${best.label || best.key}: ВАС АТАКУЄ ${a.label || a.key} — ${W.n}`, "warn");
      }
    }
    /* вертольоти: коротка черга по цілі в секторі */
    function heliFight(a, t, d) {
      const s = a.st; if (d > CFG.gunRange || !a.gunTake) return;
      if (Math.abs(angd(a.hdg, brg(a.pos, t.pos))) > 40) return;
      if (E.t - (s.lastGun || -9) < 0.5) return;
      if (!a.gunTake(CFG.gunBurst)) return;
      s.lastGun = E.t;
      const hits = Math.max(0, Math.round((CFG.gunBurst * 0.05) * (1 - d / CFG.gunRange) * (0.5 + rand())));
      if (env.fx) env.fx("gun", a.pos, brg(a.pos, t.pos), a);
      if (hits > 0) damage(t, hits * 0.18, { from: a.id, W: { n: "гармата" } });
    }
    /* ДРЛО: летить від загрози, відстрілює пастки (зброї немає) */
    function aewPlan(a) {
      const under = defend(a, CFG.tick); a.st.under = under;
      if (!under) {
        /* ворожий винищувач поблизу — рівномірно відходить */
        let near = null, bd = 1e9;
        for (const t of E.actors) if (t.side !== a.side && !t.dead && t.airborne && t.cls === "fighter") { const d = dist(a.pos, t.pos); if (d < bd) { bd = d; near = t; } }
        if (near && bd < 120) { a.st.cmd = { kind: "evade", hdg: (brg(a.pos, near.pos) + 180) % 360, alt: a.alt, spd: 1, k: 1.2, t: E.t + 0.6 }; a.st.flee = true; }
        else if (a.st.flee) { a.st.flee = false; if (a.st.cmd && a.st.cmd.kind === "evade") a.st.cmd = null; }
      }
    }

    /* ---------- висота ---------- */
    function stepAlt(a, dt) {
      const s = a.st, P = perf(a.key), c = s.cmd;
      let tgt = s.alt0 == null ? P.alt[0] : s.alt0;
      if (c && c.alt != null && c.t > E.t) tgt = clamp(c.alt, P.alt[1], P.alt[2]);
      const rate = (a.cls === "heli" ? 1.2 : 4.5) * 1000 * dt;      // м за крок: ~4,5 км на ігрову секунду
      s.alt += clamp(tgt - s.alt, -rate, rate); a.alt = s.alt;
    }

    /* ================================================================
       головний крок
       ================================================================ */
    function step(sd, actors, sams) {
      if (!CFG.on) return;
      E.t += sd; E.dtAhead = sd;
      E.actors = actors; E.sams = sams || [];
      E.acts.clear(); for (const a of actors) { a.dead = false; ensure(a); E.acts.set(a.id, a); a._chaff = 0; }
      E.samById = new Map(); for (const s of E.sams) { s.dead = false; E.samById.set(s.id, s); }
      for (const a of actors) a._chaff = chaffAround(a);
      /* ракети й пастки — дрібними підкроками */
      const n = Math.min(60, Math.max(1, Math.ceil(sd / CFG.sub))), dt = sd / n;
      for (let i = 0; i < n; i++) {
        E.dtAhead = sd - (i + 1) * dt;           // скільки лишилось до кінця кроку: ціль «позаду» на цей інтервал
        stepDecoys(dt);
        for (let j = E.mis.length - 1; j >= 0; j--) {
          const m = E.mis[j];
          if (m.st === "spent") { E.mis.splice(j, 1); continue; }
          if (stepMissile(m, dt)) {
            if (m.tgt != null) { const t = byId(m.tgt); if (t && t.st.inb > 0) t.st.inb--; }
            E.mis.splice(j, 1);
          }
        }
      }
      E.dtAhead = 0;
      /* рішення — з періодом tick */
      E.acc += sd;
      if (E.acc < CFG.tick) return;
      const dt2 = E.acc; E.acc = 0;
      for (const a of actors) if (!a.dead && a.airborne) stepAlt(a, dt2);
      E.net.ua = buildPic("ua"); E.net.ru = buildPic("ru");
      for (const a of actors) if (!a.dead && a.airborne) plan(a, dt2);
      for (const s of E.sams) if (!s.dead) samPlan(s);
    }

    return { E, step, launch, dropFlare, dropChaff, restock, ensure, stats: E.stats, mis: E.mis, dec: E.dec, cfg: CFG, knows, buildPic,
             detonate, damage, byId, defend, plan, fcQuality, senseOwn, rangeEff, pickWeapon };
  }

  const api = { CFG, PERF, WPN, SAM, perf, samOf, create, geo: { dist, brg, off, mv, rel, angd, horizon, aspectOf, rcsAt, irAt, notched, radarRange }, restockFor: (key) => ({ fl: perf(key).fl, ch: perf(key).ch }) };
  root.BV_AC = api;
})(typeof window !== "undefined" ? window : globalThis);
