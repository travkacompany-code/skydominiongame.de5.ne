/* ======================================================================
   BV_AIRC — повітряний бій (етап 7.70, «BANGVECTOR 2 · етап 5»)
   Чистий модуль (як 02i_avia.js, 02c_radar.js): не знає ні про мапу, ні про 03_game.js. Працює з плоскою площиною в км
   (x — схід, y — північ) і висотою в метрах. Клей із грою — tools/aircombat_glue.js.

   Що тут є:
   • ТТХ літаків (PERF): стеля, крейсерська й мінімальна висота, перевантаження, ЕПР, ІЧ-помітність, РЛС (дальність, імпульсно-допплерівська
     чи ні, сектор), ІЧ-пошук, станція попередження про ракети (MAWS) і про опромінення (RWR), запас тепловых пасток і диполів, РЕБ, міцність;
   • ТТХ ракет «повітря–повітря» (AAM) і зенітних (SAM): тип наведення (ІЧ / напівактивна РЛ / активна РЛ / TVM / командна / лазерна),
     швидкість, маневровість, кут огляду ГСН, дальність захоплення, перешкодостійкість, висотне вікно, мінімальна дальність, бойова частина;
   • ВИЯВЛЕННЯ: якість треку РЛС (дальність × ЕПР × ракурс × радіогоризонт × «погляд вниз» × РЕБ), ІЧ-пошук, ідентифікація;
   • РАКЕТА (stepMissile): розгін → маршова ділянка → інерційний політ після вигорання (втрата швидкості й маневровості, у розрідженому повітрі —
     менша маневровість), пропорційне наведення (N = 3,5) у площині й по висоті, зближення з обчисленням точки найменшого промаху
     всередині кроку (нема «тунелювання» при швидких цілях);
   • ГСН ТА ЇЇ ОБМАН: ІЧ — теплова пастка в полі зору «краде» захоплення пропорційно яскравості; РЛ — диполі в стробі + нотч допплера
     (ціль на траверзі променя) + РЕБ зривають супровід; після зриву — «пам'ять» (екстраполяція), потім або повторне захоплення
     (якщо ціль у полі зору, а диполі/пастка вигоріли), або самоліквідація;
   • СУПРОВІД: SARH/TVM/командне наведення вимагає, щоб РЛС пускової установки/літака вела ціль до влучання; втратив супровід — ракета
     в пам'яті, не повернувся за memT — втрачена. Активна ГСН вмикається на своїй дальності й далі веде себе сама;
   • УХИЛЕННЯ (defend): попередження (MAWS, RWR, зір), вибір маневру за типом загрози — на траверз (нотч) і зниження проти РЛ-ракет,
     поворот хвостом/траверз + пастки проти ІЧ, «бочка» на останніх кілометрах, викид диполів/пасток пачками з інтервалом, РЕБ;
   • ПОРАЖЕННЯ: шкода = бойова частина × (1 − 0,5·(промах/радіус)²) ÷ міцність цілі, з розкидом; hp ≤ 0 — знищено, hp < 0,4 — пошкоджено
     (швидкість і форсаж обмежені, повернення на базу); гарматний вогонь (вертольоти, зенітні гармати) — flakP;
   • ЗЕНІТНІ КОМПЛЕКСИ: висотне вікно, мінімальна дальність, канали, час захоплення, шанс пуску залпу (samWant).
   Час — секунди ігрового часу (як SIM.t). Швидкості — ігрові км/с (як AIR.cruise, AD_SPD). Реальні м/с ↔ ігрові: KS ≈ 28.
   Баланс — CFG, PERF, AAM, SAM. Вимкнути: BV_AIRC.CFG.on = false.
   ====================================================================== */
(function (root) {
  "use strict";

  const D2R = Math.PI / 180;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const nrm = a => ((a % 360) + 360) % 360;
  const dA = (a, b) => ((b - a + 540) % 360) - 180;                 // кут a → b зі знаком
  const hv = h => [Math.sin(h * D2R), Math.cos(h * D2R)];
  const brg = (a, b) => nrm(Math.atan2(b.x - a.x, b.y - a.y) / D2R);
  const dxy = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

  /* ---------- баланс ---------- */
  const CFG = {
    on: true,
    rng: Math.random,          // можна підмінити детермінованим генератором (тести)
    KS: 28,                    // реальні м/с → ігрові м/с (стиснення часу): швидкість ігрових км/с = реальні км/с · KS
    N: 3.5,                    // коефіцієнт пропорційного наведення
    omK: 1.6,                  // множник маневровості ракет (ігровий час стиснений — кутові швидкості вище реальних)
    omTerm: 1.3,               // додаткова маневровість на останніх 8 км (у стиснутому часі кінцевий ділянка занадто коротка)
    diveK: 1.2,                // швидкість зниження = швидкопідйомність · KS · diveK
    evK: 1.7,                  // у скільки разів літак розвертається швидше за звичайний крейсерський при ухиленні від ракети
    sub: 0.05,                 // с — максимальний крок ракети
    lockT: { ir: 1.2, sarh: 2.0, arh: 1.2, tvm: 2.2, cmd: 1.8, sal: 1.5 },   // с стабільного захоплення до пуску
    memT: { ir: 1.1, sarh: 1.4, arh: 1.2, tvm: 1.6, cmd: 1.0, sal: 0.9 },    // с «пам'яті» ГСН після втрати супроводу
    trackMin: 0.35,            // мінімальна якість треку для наведення
    notchVr: 0.11,             // нотч допплера: |радіальна швидкість| < notchVr · v цілі → ціль у «сліпій зоні» (кут ≈ ±6° від траверзу)
    notchVrOld: 0.06,          // те саме для РЛС без імпульсно-допплерівського режиму
    flareLife: 3.0, flareI: 3.2, flareGap: 0.22, flareBurst: 3,
    chaffLife: 4.5, chaffI: 2.4, chaffGap: 0.25, chaffBurst: 3, chaffR: 1.6,
    seduceDt: 0.1,             // с — період перевірки обману
    dmgBelow: 0.4,             // hp нижче — літак пошкоджений
    lethal: 1.3,               // множник шкоди бойових частин
    reactMin: 0.4,             // с мінімальна затримка екіпажу між попередженням і реакцією
    jam: 0.55,                 // вага РЕБ літака в якості супроводу РЛ-ракет
    lowDetK: 0.4               // зниження дальності РЛС без імпульсно-допплера по цілі на тлі землі
  };

  /* ---------- ТТХ літаків ----------
     h — крейсерська висота, м; ceil — стеля; low — мінімально безпечна (рельєф); cl — швидкопідйомність (реальні м/с); g — перевантаження;
     rcs — ЕПР, м²; ir — ІЧ-помітність (форсаж ×1,7); rad — дальність РЛС по цілі 5 м², км (0 — немає); pd — імпульсно-допплерівська (бачить на тлі землі);
     fov — півсектор РЛС, °; irst — дальність ІЧ-пошуку, км; maws — шанс виявити ракету; rwr — станція попередження про опромінення;
     fl / ch — теплові пастки / диполі; ecm — потужність власної РЕБ (0…0,6); hp — «міцність» (шкода ракети ділиться на неї);
     skill — вміння уникати (0…1); gun — є гармата; def — [ракета, к-сть] самооборона носія */
  const PERF = {
    su27:   { h: 9000, ceil: 18000, low: 250, cl: 300, g: 9, rcs: 10, ir: 1.2, rad: 100, pd: true, fov: 60, irst: 50, maws: 0.35, rwr: true, fl: 48, ch: 48, ecm: 0.10, hp: 1.0, skill: 0.75, gun: true },
    su30:   { h: 9000, ceil: 17500, low: 250, cl: 280, g: 9, rcs: 8, ir: 1.2, rad: 120, pd: true, fov: 60, irst: 50, maws: 0.5, rwr: true, fl: 64, ch: 64, ecm: 0.20, hp: 1.05, skill: 0.8, gun: true },
    su35:   { h: 10000, ceil: 18000, low: 250, cl: 340, g: 9, rcs: 3, ir: 1.1, rad: 160, pd: true, fov: 60, irst: 90, maws: 0.7, rwr: true, fl: 80, ch: 80, ecm: 0.35, hp: 1.05, skill: 0.9, gun: true },
    mig29:  { h: 8500, ceil: 17000, low: 250, cl: 330, g: 9, rcs: 5, ir: 1.1, rad: 70, pd: true, fov: 60, irst: 30, maws: 0.2, rwr: true, fl: 30, ch: 30, ecm: 0.0, hp: 0.95, skill: 0.7, gun: true },
    f16:    { h: 9000, ceil: 15000, low: 250, cl: 300, g: 9, rcs: 1.5, ir: 1.0, rad: 90, pd: true, fov: 60, irst: 0, maws: 0.6, rwr: true, fl: 60, ch: 60, ecm: 0.25, hp: 0.95, skill: 0.85, gun: true },
    mirage: { h: 9000, ceil: 16500, low: 250, cl: 285, g: 9, rcs: 2, ir: 1.0, rad: 70, pd: true, fov: 60, irst: 0, maws: 0.5, rwr: true, fl: 112, ch: 112, ecm: 0.30, hp: 0.9, skill: 0.8, gun: true },
    mi24:   { h: 120, ceil: 4500, low: 15, cl: 12, g: 3, rcs: 15, ir: 0.9, rad: 0, pd: false, fov: 0, irst: 0, maws: 0.1, rwr: false, fl: 128, ch: 0, ecm: 0.0, hp: 1.1, skill: 0.4, gun: true },
    mi8:    { h: 100, ceil: 4500, low: 15, cl: 8, g: 2.5, rcs: 18, ir: 0.8, rad: 0, pd: false, fov: 0, irst: 0, maws: 0.05, rwr: false, fl: 128, ch: 0, ecm: 0.0, hp: 1.0, skill: 0.3, gun: true },
    mi28:   { h: 100, ceil: 5800, low: 15, cl: 13, g: 3.5, rcs: 8, ir: 0.8, rad: 0, pd: false, fov: 0, irst: 0, maws: 0.4, rwr: true, fl: 64, ch: 0, ecm: 0.30, hp: 1.2, skill: 0.55, gun: true },
    ka52:   { h: 100, ceil: 5500, low: 15, cl: 14, g: 3.5, rcs: 6, ir: 0.8, rad: 0, pd: false, fov: 0, irst: 0, maws: 0.4, rwr: true, fl: 64, ch: 0, ecm: 0.30, hp: 1.15, skill: 0.6, gun: true },
    /* ударна авіація-носії (ключі CARRIERS) */
    tu95:   { h: 10000, ceil: 12000, low: 300, cl: 10, g: 2.5, rcs: 30, ir: 1.8, rad: 0, pd: false, fov: 0, irst: 0, maws: 0.3, rwr: true, fl: 100, ch: 100, ecm: 0.25, hp: 2.4, skill: 0.25 },
    tu22:   { h: 9000, ceil: 13000, low: 150, cl: 80, g: 3.5, rcs: 12, ir: 1.5, rad: 0, pd: false, fov: 0, irst: 0, maws: 0.3, rwr: true, fl: 80, ch: 80, ecm: 0.30, hp: 1.8, skill: 0.4 },
    mig31:  { h: 14000, ceil: 20000, low: 200, cl: 200, g: 5, rcs: 5, ir: 1.5, rad: 120, pd: true, fov: 70, irst: 0, maws: 0.2, rwr: true, fl: 56, ch: 56, ecm: 0.20, hp: 1.5, skill: 0.55, def: ["r33", 2] },
    su34:   { h: 8000, ceil: 14000, low: 100, cl: 230, g: 8.5, rcs: 8, ir: 1.2, rad: 120, pd: true, fov: 60, irst: 0, maws: 0.5, rwr: true, fl: 80, ch: 80, ecm: 0.40, hp: 1.3, skill: 0.7, gun: true, def: ["r73e", 2] },
    su24:   { h: 6000, ceil: 11000, low: 100, cl: 150, g: 6, rcs: 10, ir: 1.3, rad: 0, pd: false, fov: 0, irst: 0, maws: 0.1, rwr: true, fl: 60, ch: 60, ecm: 0.10, hp: 1.2, skill: 0.5, def: ["r60", 2] },
    /* літаки ДРЛО (етап 8): летять власним автоматом без маневру — «low» = крейсерська висота, тож зниження не вмикається */
    aew_saab340: { h: 7600, ceil: 7600, low: 7600, cl: 5, g: 2.5, rcs: 12, ir: 0.9, rad: 0, pd: false, fov: 0, irst: 0, maws: 0.1, rwr: true, fl: 0, ch: 0, ecm: 0.0, hp: 1.0, skill: 0.2 },
    aew_a50:     { h: 10000, ceil: 12000, low: 10000, cl: 5, g: 2.5, rcs: 35, ir: 1.8, rad: 0, pd: false, fov: 0, irst: 0, maws: 0.3, rwr: true, fl: 96, ch: 96, ecm: 0.30, hp: 2.2, skill: 0.25 },
    s70:    { h: 8000, ceil: 15000, low: 100, cl: 250, g: 8, rcs: 0.5, ir: 0.7, rad: 0, pd: false, fov: 0, irst: 0, maws: 0.3, rwr: true, fl: 0, ch: 0, ecm: 0.30, hp: 1.2, skill: 0.7 }
  };
  const perfOf = key => PERF[key] || { h: 8000, ceil: 12000, low: 200, cl: 150, g: 5, rcs: 8, ir: 1.2, rad: 0, pd: false, fov: 0, irst: 0, maws: 0.2, rwr: true, fl: 40, ch: 40, ecm: 0.1, hp: 1, skill: 0.5 };

  /* ---------- ракети «повітря–повітря» ----------
     g — наведення; v — макс. швидкість, ігрові км/с; om — макс. кутова швидкість, °/с; burn — частка шляху з тягою; fz — радіус підриву, км;
     w — бойова частина (шкода при прямому влученні, ділиться на міцність цілі); fov — півкут огляду ГСН, °; acq — дальність захоплення ІЧ ГСН
     по цілі з ІЧ = 1, км / дальність увімкнення активної ГСН (arh), км; ccm — перешкодостійкість (0…1); hmin/hmax — висотне вікно, м;
     rmin — мінімальна дальність, км; tl — ресурс польоту, с; off — допустимий кут пуску від носа, ° */
  const AAM = {
    r27r1: { n: "Р-27Р1",  g: "sarh", rng: 70, v: 38, om: 190, burn: 0.55, fz: 0.32, w: 0.95, fov: 0, acq: 0, ccm: 0.30, hmin: 30, hmax: 26000, rmin: 1.5, tl: 14, off: 60 },
    r27er: { n: "Р-27ЕР",  g: "sarh", rng: 100, v: 41, om: 190, burn: 0.62, fz: 0.34, w: 1.00, fov: 0, acq: 0, ccm: 0.32, hmin: 30, hmax: 30000, rmin: 2.0, tl: 18, off: 60 },
    r27t:  { n: "Р-27Т",   g: "ir", rng: 60,   v: 37, om: 200, burn: 0.55, fz: 0.30, w: 0.90, fov: 12, acq: 18, ccm: 0.30, hmin: 30, hmax: 24000, rmin: 1.2, tl: 14, off: 50 },
    r27et: { n: "Р-27ЕТ",  g: "ir", rng: 90,   v: 40, om: 200, burn: 0.62, fz: 0.30, w: 0.92, fov: 12, acq: 20, ccm: 0.30, hmin: 30, hmax: 28000, rmin: 1.5, tl: 17, off: 50 },
    r73e:  { n: "Р-73Е",   g: "ir", rng: 30,   v: 33, om: 420, burn: 0.45, fz: 0.22, w: 0.75, fov: 40, acq: 12, ccm: 0.65, hmin: 20, hmax: 20000, rmin: 0.3, tl: 9, off: 90 },
    aam_a: { n: "AIM-120C", g: "arh", rng: 80, v: 40, om: 230, burn: 0.60, fz: 0.30, w: 0.90, fov: 55, acq: 16, ccm: 0.55, hmin: 30, hmax: 24000, rmin: 1.5, tl: 16, off: 70 },
    aam_b: { n: "MICA-EM", g: "arh", rng: 60, v: 38, om: 260, burn: 0.55, fz: 0.28, w: 0.85, fov: 55, acq: 14, ccm: 0.55, hmin: 20, hmax: 22000, rmin: 0.8, tl: 13, off: 80 },
    aam_c: { n: "AIM-9M",  g: "ir", rng: 18,   v: 31, om: 360, burn: 0.45, fz: 0.20, w: 0.70, fov: 30, acq: 10, ccm: 0.45, hmin: 20, hmax: 18000, rmin: 0.4, tl: 8, off: 70 },
    aam_d: { n: "MICA-IR", g: "ir", rng: 45,   v: 34, om: 380, burn: 0.50, fz: 0.22, w: 0.78, fov: 45, acq: 13, ccm: 0.60, hmin: 20, hmax: 20000, rmin: 0.4, tl: 10, off: 85 },
    r33:   { n: "Р-33",    g: "sarh", rng: 100, v: 46, om: 120, burn: 0.65, fz: 0.40, w: 1.25, fov: 0, acq: 0, ccm: 0.30, hmin: 60, hmax: 28000, rmin: 3.0, tl: 20, off: 45 },
    r60:   { n: "Р-60",    g: "ir", rng: 10,   v: 28, om: 300, burn: 0.40, fz: 0.15, w: 0.40, fov: 25, acq: 7, ccm: 0.15, hmin: 20, hmax: 12000, rmin: 0.3, tl: 6, off: 60 }
  };

  /* ---------- зенітні комплекси проти літаків ----------
     ключі — AD_TYPES. g — наведення; om — °/с; hmin/hmax — м; rmin — км; w — бойова частина; fz — км; ccm; ch — одночасні ракети;
     pd — РЛС з допплером (нотч вужчий); radar — наведення РЛС (залежить від нотчу/диполів/РЕБ); rk — частка радіуса на малій висоті */
  const SAM = {
    patriot: { g: "tvm", om: 210, hmin: 60, hmax: 24000, rmin: 3, w: 1.30, fz: 0.45, ccm: 0.55, ch: 6, pd: true },
    sampt:   { g: "arh", om: 230, hmin: 30, hmax: 25000, rmin: 3, w: 1.20, fz: 0.40, ccm: 0.60, ch: 6, pd: true },
    s500:    { g: "arh", om: 230, hmin: 5, hmax: 40000, rmin: 3, w: 1.30, fz: 0.45, ccm: 0.65, ch: 6, pd: true },
    s400:    { g: "sarh", om: 220, hmin: 5, hmax: 30000, rmin: 3, w: 1.30, fz: 0.45, ccm: 0.55, ch: 6, pd: true },
    s350:    { g: "arh", om: 240, hmin: 10, hmax: 30000, rmin: 2, w: 1.10, fz: 0.40, ccm: 0.55, ch: 6, pd: true },
    s300v:   { g: "sarh", om: 200, hmin: 25, hmax: 30000, rmin: 3, w: 1.30, fz: 0.45, ccm: 0.45, ch: 6, pd: true },
    s300:    { g: "sarh", om: 200, hmin: 25, hmax: 27000, rmin: 3, w: 1.30, fz: 0.45, ccm: 0.40, ch: 6, pd: true },
    buk3:    { g: "arh", om: 230, hmin: 15, hmax: 35000, rmin: 2, w: 1.00, fz: 0.38, ccm: 0.50, ch: 4, pd: true },
    buk:     { g: "sarh", om: 210, hmin: 15, hmax: 22000, rmin: 2, w: 1.00, fz: 0.38, ccm: 0.40, ch: 4, pd: true },
    hawk:    { g: "sarh", om: 190, hmin: 60, hmax: 18000, rmin: 2.5, w: 0.90, fz: 0.35, ccm: 0.30, ch: 3, pd: false },
    s125:    { g: "cmd",  om: 170, hmin: 20, hmax: 18000, rmin: 3, w: 0.95, fz: 0.40, ccm: 0.20, ch: 2, pd: false },
    shershen:{ g: "cmd",  om: 175, hmin: 20, hmax: 18000, rmin: 3, w: 0.95, fz: 0.40, ccm: 0.25, ch: 2, pd: false },
    kub:     { g: "sarh", om: 180, hmin: 30, hmax: 12000, rmin: 3, w: 0.85, fz: 0.35, ccm: 0.25, ch: 2, pd: false },
    osa:     { g: "cmd",  om: 200, hmin: 25, hmax: 5000, rmin: 1.5, w: 0.65, fz: 0.30, ccm: 0.25, ch: 2, pd: false },
    osa_r:   { g: "cmd",  om: 200, hmin: 25, hmax: 5000, rmin: 1.5, w: 0.65, fz: 0.30, ccm: 0.25, ch: 2, pd: false },
    tor:     { g: "cmd",  om: 240, hmin: 10, hmax: 6000, rmin: 1.0, w: 0.70, fz: 0.28, ccm: 0.40, ch: 2, pd: true },
    sosna:   { g: "sal",  om: 220, hmin: 10, hmax: 3500, rmin: 1.0, w: 0.50, fz: 0.20, ccm: 0.50, ch: 2, pd: false },
    pantsir: { g: "cmd",  om: 240, hmin: 10, hmax: 15000, rmin: 1.2, w: 0.75, fz: 0.30, ccm: 0.45, ch: 2, pd: true },
    iris:    { g: "ir",   om: 300, hmin: 20, hmax: 20000, rmin: 1.5, w: 0.85, fz: 0.30, ccm: 0.65, ch: 4, pd: false, fov: 40, acq: 14 },
    nasams:  { g: "arh",  om: 230, hmin: 30, hmax: 16000, rmin: 2, w: 0.90, fz: 0.30, ccm: 0.55, ch: 3, pd: true, acq: 14 },
    koral:   { g: "cmd",  om: 190, hmin: 30, hmax: 12000, rmin: 2, w: 0.80, fz: 0.32, ccm: 0.30, ch: 2, pd: false },
    vampire: { g: "sal",  om: 200, hmin: 10, hmax: 2500, rmin: 0.8, w: 0.40, fz: 0.20, ccm: 0.40, ch: 1, pd: false },
    stormer: { g: "sal",  om: 260, hmin: 10, hmax: 7000, rmin: 0.8, w: 0.45, fz: 0.20, ccm: 0.60, ch: 1, pd: false },
    strela:  { g: "ir",   om: 260, hmin: 25, hmax: 5000, rmin: 0.8, w: 0.50, fz: 0.22, ccm: 0.30, ch: 1, pd: false, fov: 22, acq: 9 },
    strela2: { g: "ir",   om: 240, hmin: 20, hmax: 2500, rmin: 0.6, w: 0.35, fz: 0.18, ccm: 0.10, ch: 1, pd: false, fov: 20, acq: 6 },
    igla:    { g: "ir",   om: 280, hmin: 10, hmax: 3500, rmin: 0.6, w: 0.40, fz: 0.20, ccm: 0.35, ch: 1, pd: false, fov: 25, acq: 8 },
    igla_r:  { g: "ir",   om: 280, hmin: 10, hmax: 3500, rmin: 0.6, w: 0.40, fz: 0.20, ccm: 0.35, ch: 1, pd: false, fov: 25, acq: 8 },
    stinger: { g: "ir",   om: 290, hmin: 10, hmax: 3800, rmin: 0.6, w: 0.42, fz: 0.20, ccm: 0.45, ch: 1, pd: false, fov: 25, acq: 9 },
    verba:   { g: "ir",   om: 300, hmin: 10, hmax: 4500, rmin: 0.6, w: 0.42, fz: 0.20, ccm: 0.65, ch: 1, pd: false, fov: 30, acq: 10 }
  };
  /* зенітні гармати: r — ефективна дальність, км; hmax — м; k — шанс влучання очереді по нерухомій цілі за с; spdK — спад по швидкості цілі */
  const FLAK = {
    gepard:  { r: 4.0, hmax: 3000, k: 0.16 }, tunguska: { r: 4.0, hmax: 3500, k: 0.16 }, skynex: { r: 4.0, hmax: 3000, k: 0.17 },
    shilka:  { r: 2.5, hmax: 2500, k: 0.12 }, shilka_r: { r: 2.5, hmax: 2500, k: 0.12 }, zu23: { r: 2.0, hmax: 2000, k: 0.08 }, zu23m: { r: 2.0, hmax: 2000, k: 0.08 },
    mvg:     { r: 1.2, hmax: 1500, k: 0.03 }, mvg_r: { r: 1.2, hmax: 1500, k: 0.03 }, grachonok: { r: 2.0, hmax: 2000, k: 0.06 }, groza: { r: 2.5, hmax: 2500, k: 0.08 },
    mi24: { r: 1.5, hmax: 4500, k: 0.05 }, mi8: { r: 1.2, hmax: 4500, k: 0.03 }, mi28: { r: 2.0, hmax: 5000, k: 0.08 }, ka52: { r: 2.0, hmax: 5000, k: 0.08 },
    jet: { r: 1.6, hmax: 9000, k: 0.10 }
  };

  /* ---------- стан літака ---------- */
  function newState(key, perf) {
    perf = perf || perfOf(key);
    return { key, hp: 1, h: perf.h, hT: perf.h, fl: perf.fl | 0, ch: perf.ch | 0, ab: false, warn: null, ev: null, cmT: 0, bursts: [], ecm: false,
             dmgK: 1, lastThreat: -1e9, react: 0, kills: 0, lost: 0 };
  }

  /* ---------- геометрія й ракурс ---------- */
  /* ракурс: кут між вектором швидкості цілі й напрямом із цілі на спостерігача (0 — спостерігач позаду, 180 — лоб у лоб) */
  function aspect(e, obs) { return Math.abs(dA(e.hdg, brg(e, obs))); }
  const irAspectK = a => 0.28 + 0.72 * Math.pow(Math.cos(a * D2R / 2), 2);          // хвіст 1,0 · траверз ≈ 0,64 · лоб 0,28
  const rcsAspectK = a => 0.4 + 0.6 * Math.pow(Math.sin(a * D2R), 2);               // лоб/хвіст 0,4 · траверз 1,0
  /* радіогоризонт: d ≈ 4,12·(√h1 + √h2), км (h — м); повертає 0..1 з плавним спадом у 15 % за горизонтом */
  function losK(d, h1, h2) {
    const dh = 4.12 * (Math.sqrt(Math.max(0, h1)) + Math.sqrt(Math.max(0, h2)));
    return d <= dh ? 1 : d >= dh * 1.15 ? 0 : 1 - (d - dh) / (dh * 0.15);
  }
  const slant = (a, ha, b, hb) => Math.hypot(dxy(a, b), (hb - ha) / 1000);

  /* радіальна швидкість цілі відносно спостерігача, ігрові км/с (>0 — віддаляється) */
  function radialV(e, obs) {
    const b = brg(obs, e), u = hv(b), v = hv(e.hdg);
    return (v[0] * u[0] + v[1] * u[1]) * (e.v || 0);
  }
  /* нотч допплера: ціль на траверзі променя → «швидкість» нижча за поріг селекції */
  function inNotch(e, obs, pd) {
    const k = pd ? CFG.notchVr : CFG.notchVrOld;
    return Math.abs(radialV(e, obs)) < k * Math.max(1, e.v || 1);
  }

  /* ---------- РЛС: якість треку 0..1 ----------
     R — дальність по цілі 5 м² на висоті; obs {x,y,h}; e — ціль {x,y,h,hdg,v,perf,st}; o: { pd, jam (0..1), hObs } */
  function trackQ(R, obs, e, o) {
    o = o || {};
    if (!(R > 0) || !e) return 0;
    const d = slant(obs, obs.h || 0, e, e.h || 0), pf = e.perf || perfOf(e.key);
    const asp = aspect(e, obs), rcs = Math.max(0.05, pf.rcs * rcsAspectK(asp));
    let Re = R * Math.pow(rcs / 5, 0.25);
    const dh = (e.h || 0) < (obs.h || 0) - 1500 || (e.h || 0) < 300;
    if (dh && !o.pd) Re *= CFG.lowDetK;                                   // без допплера ціль на тлі землі гірше видна
    if (dh && o.pd && (e.h || 0) < 300) Re *= 0.8;
    const jam = clamp((o.jam || 0) + (pf.ecm || 0) * CFG.jam * (e.st && e.st.ecm ? 1 : 0.5), 0, 0.95);
    Re *= 1 - 0.5 * jam;
    if (d >= Re) return 0;
    const los = losK(dxy(obs, e), obs.h || 40, e.h || 0);
    return clamp((1 - Math.pow(d / Re, 3)) * los * (1 - 0.6 * jam), 0, 1);
  }
  /* ІЧ-пошук: «яскравість» цілі (1 — хвіст, 0,28 — лоб) × форсаж → дальність */
  function irIntensity(e, obs) {
    const pf = e.perf || perfOf(e.key);
    return pf.ir * irAspectK(aspect(e, obs)) * (e.st && e.st.ab ? 1.7 : 1) * (e.st && e.st.hp < CFG.dmgBelow ? 1.15 : 1);
  }
  function irstQ(range, obs, e) {
    if (!(range > 0)) return 0;
    const d = slant(obs, obs.h || 0, e, e.h || 0), Re = range * Math.sqrt(irIntensity(e, obs));
    return d >= Re ? 0 : clamp(1 - Math.pow(d / Re, 2), 0, 1);
  }

  /* ---------- пастки ---------- */
  function addFlare(W, e, vx, vy) {
    const f = { x: e.x, y: e.y, h: e.h, vx, vy, t0: W.t, life: CFG.flareLife, I: CFG.flareI, from: e.ref, side: e.side };
    W.flares.push(f); return f;
  }
  function addChaff(W, e, vx, vy) {
    const c = { x: e.x, y: e.y, h: e.h, vx, vy, t0: W.t, life: CFG.chaffLife, I: CFG.chaffI, r: CFG.chaffR, from: e.ref, side: e.side };
    W.chaff.push(c); return c;
  }
  const flareI = (f, t) => { const a = (t - f.t0) / f.life; return a < 0 || a >= 1 ? 0 : f.I * (a < 0.08 ? a / 0.08 : Math.pow(1 - a, 0.6)); };
  const chaffI = (c, t) => { const a = (t - c.t0) / c.life; return a < 0 || a >= 1 ? 0 : c.I * (a < 0.12 ? a / 0.12 : Math.pow(1 - a, 0.8)); };
  function stepDecoys(W, dt) {
    for (let i = W.flares.length - 1; i >= 0; i--) {
      const f = W.flares[i]; if (W.t - f.t0 >= f.life) { W.flares.splice(i, 1); continue; }
      f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= Math.exp(-1.4 * dt); f.vy *= Math.exp(-1.4 * dt); f.h = Math.max(0, f.h - 900 * dt);
    }
    for (let i = W.chaff.length - 1; i >= 0; i--) {
      const c = W.chaff[i]; if (W.t - c.t0 >= c.life) { W.chaff.splice(i, 1); continue; }
      c.x += c.vx * dt; c.y += c.vy * dt; c.vx *= Math.exp(-1.0 * dt); c.vy *= Math.exp(-1.0 * dt); c.r += 0.35 * dt; c.h = Math.max(0, c.h - 300 * dt);
    }
  }
  /* викид пастки літаком e: повертає 'flare' | 'chaff' | null (поновлює запас і інтервал) */
  function dispense(W, e, kind) {
    const st = e.st; if (!st) return null;
    const gap = kind === "flare" ? CFG.flareGap : CFG.chaffGap;
    if (W.t < st.cmT) return null;
    if (kind === "flare") { if (st.fl <= 0) return null; st.fl--; }
    else { if (st.ch <= 0) return null; st.ch--; }
    st.cmT = W.t + gap;
    const a = e.hdg * D2R + (CFG.rng() < 0.5 ? 1 : -1) * (1.2 + CFG.rng() * 0.5), sp = (e.v || 5) * 0.28;
    const vx = Math.sin(e.hdg * D2R) * (e.v || 5) * 0.55 + Math.sin(a) * sp, vy = Math.cos(e.hdg * D2R) * (e.v || 5) * 0.55 + Math.cos(a) * sp;
    if (kind === "flare") addFlare(W, e, vx, vy); else addChaff(W, e, vx, vy);
    return kind;
  }

  /* ---------- ракета ---------- */
  /* spec: AAM[id] або SAM[key] + { v } (швидкість із AD_SPD); o: { from, side, tgt, x, y, h, hdg, v0, max, src }
     src — джерело супроводу для SARH/TVM/CMD: функція () => { alive, x, y, h, R, pd, jam } або null (ГСН власна) */
  function makeMissile(spec, o) {
    const S = spec, m = {
      ac: 1, spec: S, id: o.id, from: o.from, side: o.side, tgt: o.tgt, x: o.x, y: o.y, h: o.h, hdg: o.hdg, v: o.v0 != null ? o.v0 : S.v * 0.35,
      fl: 0, max: o.max, age: 0, dead: false, how: null, lastB: null, lock: { mode: "guided", memLeft: 0, decoy: null, relocks: 0, seduced: 0, since: 0 },
      active: S.g === "ir" || S.g === "sal", last: { x: o.tx, y: o.ty, h: o.th, vx: o.tvx || 0, vy: o.tvy || 0 }, src: o.src || null, t0: o.t0 || 0,
      seedT: 0, miss: Infinity, prevD: Infinity, pk: o.pk != null ? o.pk : 1, gamma: 0, rf: S.g === "sarh" || S.g === "tvm" || S.g === "cmd" || S.g === "arh"
    };
    return m;
  }

  /* оновлення захоплення (раз на seduceDt і при зміні) */
  function updateLock(m, T, W, dt) {
    const S = m.spec, L = m.lock;
    if (!T || !T.alive) { L.mode = "lost"; return; }
    const tp = { x: T.x, y: T.y, h: T.h };
    const dT = slant(m, m.h, tp, T.h);
    const memT = (CFG.memT[S.g] || 1) * (S.g === "arh" && !m.active ? 2.5 : 1);
    let seen = false, q = 0, notch = false, srcOk = true, srcPos = null;

    /* 1. чи бачить ГСН / РЛС супроводу ціль */
    if (S.g === "ir" || S.g === "sal") {
      const offs = Math.abs(dA(m.hdg, brg(m, tp)));
      const I = irIntensity(T, m);
      const reach = (S.acq || 8) * Math.sqrt(I) * (S.g === "sal" ? 1.2 : 1);
      seen = dT <= reach && offs <= (S.fov || 25) * (L.mode === "guided" ? 1.6 : 1);
      q = seen ? clamp(1 - dT / reach, 0.3, 1) : 0;
    } else {
      const src = m.src ? m.src() : null;
      const needSrc = S.g === "sarh" || S.g === "tvm" || S.g === "cmd" || (S.g === "arh" && !m.active);
      if (needSrc && src) {
        srcOk = !!src.alive; srcPos = src;
        if (srcOk && src.link) {
          /* цілевказання по лінії обміну від РЛС/ДРЛО (не бортовий радар пускача): якість = впевненість мережевого треку,
             нотч допплера мережу не зриває (картина зведена з кількох станцій) */
          q = clamp(src.q != null ? src.q : 0, 0, 1); notch = false;
        } else if (srcOk) {
          q = trackQ(src.R, src, T, { pd: src.pd, jam: src.jam });
          notch = inNotch(T, src, src.pd);
          if (S.g === "sarh" && src.beam != null) { const off = Math.abs(dA(src.hdg != null ? src.hdg : 0, brg(src, tp))); if (off > src.beam) q = 0; }   // літак-пускач втратив ціль із сектора РЛС
        }
      } else if (needSrc) { srcOk = false; }
      if (S.g === "arh") {
        /* активна ГСН вмикається на своїй дальності; до цього — інерційний політ із корекцією від літака-пускача */
        const act = (S.acq || 14) * (1 - 0.5 * clamp(T.perf ? (T.perf.ecm || 0) * (T.st && T.st.ecm ? 1 : 0.6) : 0, 0, 0.6));
        if (!m.active && dT <= act) { m.active = true; L.since = W.t; }
        if (m.active) {
          const offs = Math.abs(dA(m.hdg, brg(m, tp)));
          q = trackQ(18, m, T, { pd: true, jam: 0 }) * (offs <= (S.fov || 50) ? 1 : 0);
          notch = inNotch(T, m, true);
          srcOk = true;
        }
      }
      seen = q >= CFG.trackMin && srcOk && !notch;
    }

    /* 2. обман: пастка / диполі в полі зору */
    let decoy = null;
    if (S.g === "ir" || S.g === "sal") {
      if (S.g === "ir") {
        const I = irIntensity(T, m), bT = brg(m, tp);
        for (const f of W.flares) {
          if (f.side === m.side) continue;
          const fi = flareI(f, W.t); if (fi <= 0.05) continue;
          const bf = brg(m, f), off = Math.abs(dA(bT, bf));
          if (off > (S.fov || 25)) continue;
          if (dxy(m, f) > dT * 2 + 1.5) continue;
          const p = clamp(fi / (fi + I) * (1 - 0.85 * S.ccm), 0, 0.95) * (L.decoy === f ? 1 : 0.55);
          if (L.decoy === f || CFG.rng() < p * dt / CFG.seduceDt * 0.5) { if (!decoy || fi > flareI(decoy, W.t)) decoy = f; }
        }
      }
    } else if (m.rf && (S.g !== "arh" || m.active)) {
      /* диполі: сумарна яскравість хмар у стробі поруч із ціллю; обманює частіше, коли ціль у нотчі */
      let Ic = 0, best = null, bi = 0;
      for (const c of W.chaff) {
        if (c.side === m.side) continue;
        const ci = chaffI(c, W.t); if (ci <= 0.05) continue;
        if (Math.hypot(c.x - T.x, c.y - T.y) > c.r + 0.6) continue;
        Ic += ci; if (ci > bi) { bi = ci; best = c; }
      }
      if (best) {
        const k = (notch ? 1 : 0.3) * (S.g === "arh" ? 1 : 0.9);
        const p = clamp(Ic / (Ic + 1.3) * (1 - 0.8 * S.ccm) * k, 0, 0.95);
        if (L.decoy && L.decoy.life && W.t - L.decoy.t0 < L.decoy.life) decoy = L.decoy;
        else if (CFG.rng() < p * dt / CFG.seduceDt * 0.22) decoy = best;
      }
    }
    if (decoy && decoy !== L.decoy) { L.seduced++; }
    L.decoy = decoy && (decoy.life ? (W.t - decoy.t0 < decoy.life) : false) ? decoy : null;

    /* 3. автомат стану: guided → mem → (relock | lost) */
    if (L.decoy) { L.mode = "decoy"; L.memLeft = memT; return; }
    if (seen) {
      if (L.mode === "mem" || L.mode === "decoy") L.relocks++;
      L.mode = "guided"; L.memLeft = memT; m.last = { x: T.x, y: T.y, h: T.h, vx: Math.sin(T.hdg * D2R) * (T.v || 0), vy: Math.cos(T.hdg * D2R) * (T.v || 0) };
      return;
    }
    if (L.mode === "guided" || L.mode === "decoy") { L.mode = "mem"; L.memLeft = memT; }
    else if (L.mode === "mem") { L.memLeft -= dt; if (L.memLeft <= 0) L.mode = "lost"; }
  }

  /* один крок ракети. W: { t, ent(ref), flares[], chaff[] }; повертає null або подію { k: "hit"|"miss"|"lost"|"fuel"|"decoy", ent, miss, dm } */
  function stepMissile(m, dt, W) {
    const S = m.spec;
    let ev = null, left = dt;
    while (left > 1e-9 && !m.dead) {
      const T = W.ent(m.tgt);
      const dT = T ? slant(m, m.h, T, T.h) : 1e9;
      const step = clamp(Math.min(CFG.sub, dT / Math.max(1, m.v) * 0.3), 0.004, CFG.sub), q = Math.min(step, left);
      left -= q; m.age += q; m.seedT += q;
      if (m.seedT >= CFG.seduceDt) { m.seedT = 0; updateLock(m, T, W, CFG.seduceDt); }

      /* ціль наведення: пастка, або ціль, або екстраполяція */
      const L = m.lock;
      let aim;
      if (L.mode === "decoy" && L.decoy) aim = { x: L.decoy.x, y: L.decoy.y, h: L.decoy.h };
      else if (L.mode === "guided" && T) aim = { x: T.x + Math.sin(T.hdg * D2R) * (T.v || 0) * Math.min(0.6, dT / Math.max(1, m.v)) * 0.5, y: T.y + Math.cos(T.hdg * D2R) * (T.v || 0) * Math.min(0.6, dT / Math.max(1, m.v)) * 0.5, h: T.h };
      else if (L.mode === "mem") { aim = { x: m.last.x + m.last.vx * (W.t - (m.lastT || W.t)), y: m.last.y + m.last.vy * (W.t - (m.lastT || W.t)), h: m.last.h }; }
      else aim = null;
      if (L.mode === "guided" && T) { m.lastT = W.t; m.last = { x: T.x, y: T.y, h: T.h, vx: Math.sin(T.hdg * D2R) * (T.v || 0), vy: Math.cos(T.hdg * D2R) * (T.v || 0) }; }
      if (L.mode === "lost" && !m.how) m.how = "lost";

      /* кінематика: тяга → інерція; маневровість залежить від швидкості та висоти */
      const fr = m.fl / m.max;
      if (fr < S.burn && L.mode !== "lost") m.v = Math.min(S.v, m.v + S.v * 1.8 * q);
      else m.v = Math.max(S.v * 0.28, m.v - S.v * 0.22 * q);
      const dens = 0.55 + 0.45 * Math.exp(-Math.max(0, m.h) / 9000);
      const om = S.om * CFG.omK * clamp(m.v / S.v, 0.2, 1) * dens * (1 + CFG.omTerm * clamp((8 - dT) / 8, 0, 1));
      let b = m.hdg;
      if (aim) {
        b = brg(m, aim);
        const lam = m.lastB == null ? 0 : dA(m.lastB, b) / Math.max(q, 1e-3);
        let w = CFG.N * lam + 0.9 * dA(m.hdg, b) / 0.5;
        if (m.lastB == null) w = dA(m.hdg, b) / q;
        w = clamp(w, -om, om);
        m.hdg = nrm(m.hdg + w * q);
        m.v = Math.max(S.v * 0.25, m.v - S.v * 0.0007 * Math.abs(w) * q);                 // маневр «з’їдає» швидкість
        m.lastB = b;
        const dh = Math.hypot(aim.x - m.x, aim.y - m.y);
        let gT = Math.atan2((aim.h - m.h) / 1000, Math.max(0.5, dh)) / D2R;
        if (fr < 0.35 && dh > 25 && L.mode === "guided") gT += 10;                           // «гірка» на далекій дистанції
        gT = clamp(gT, -55, 55);
        m.gamma += clamp(gT - m.gamma, -120 * q, 120 * q);
      }
      const sp = m.v * q, hs = hv(m.hdg);
      const px = m.x, py = m.y, ph = m.h;
      m.x += hs[0] * sp * Math.cos(m.gamma * D2R); m.y += hs[1] * sp * Math.cos(m.gamma * D2R);
      m.h = clamp(m.h + Math.tan(m.gamma * D2R) * sp * Math.cos(m.gamma * D2R) * 1000, 0, 60000); m.fl += sp;

      /* найближче зближення всередині кроку: цілі, пастки, ціль наведення */
      if (T && T.alive && (L.mode === "guided" || L.mode === "mem" || L.mode === "decoy" || L.mode === "lost")) {
        const tpx = T.x - Math.sin(T.hdg * D2R) * (T.v || 0) * q, tpy = T.y - Math.cos(T.hdg * D2R) * (T.v || 0) * q;
        const r0x = tpx - px, r0y = tpy - py, r0h = (T.h - ph) / 1000;
        const r1x = T.x - m.x, r1y = T.y - m.y, r1h = (T.h - m.h) / 1000;
        const vx = r1x - r0x, vy = r1y - r0y, vh = r1h - r0h, vv = vx * vx + vy * vy + vh * vh;
        const ts = vv > 1e-12 ? clamp(-(r0x * vx + r0y * vy + r0h * vh) / vv, 0, 1) : 0;
        const miss = Math.hypot(r0x + vx * ts, r0y + vy * ts, r0h + vh * ts);
        if (miss < m.miss) m.miss = miss;
        const decoyLock = L.mode === "decoy" && L.decoy;
        if (miss <= S.fz * 1.3 && !decoyLock && (L.mode !== "lost" || miss < S.fz * 0.6)) {
          m.dead = true; m.how = "burst";
          ev = { k: "burst", ent: T, miss, m };
          break;
        }
      }
      if (L.mode === "decoy" && L.decoy) {
        const dd = Math.hypot(L.decoy.x - m.x, L.decoy.y - m.y, (L.decoy.h - m.h) / 1000);
        if (dd <= S.fz * 1.2) { m.dead = true; m.how = "decoy"; ev = { k: "decoy", ent: T, miss: dd, m }; break; }
      }
      /* ресурс */
      if (m.fl > m.max || m.age > S.tl * 1.0 || m.v <= S.v * 0.26 && fr > S.burn + 0.05 || (!T || !T.alive) && L.mode !== "decoy") {
        m.dead = true; m.how = m.how || (!T || !T.alive ? "nolive" : m.fl > m.max ? "fuel" : "spent");
        ev = { k: m.how === "lost" ? "lost" : "miss", ent: T, miss: m.miss, m };
        break;
      }
      if (L.mode === "lost" && !(L.decoy) && m.age - (m.lostAt || (m.lostAt = m.age)) > 0.8) { m.dead = true; m.how = "lost"; ev = { k: "lost", ent: T, miss: m.miss, m }; break; }
      if (L.mode !== "lost") m.lostAt = null;
    }
    return ev;
  }

  /* шкода по підриву: повертає { dm, killed, damaged } і зменшує hp (зміни стану застосовує клей) */
  function warhead(m, T, miss) {
    const S = m.spec, pf = T.perf || perfOf(T.key), st = T.st;
    const k = 1 - 0.5 * Math.pow(clamp(miss / Math.max(0.01, S.fz), 0, 1.6), 2);
    if (k <= 0) return { dm: 0, killed: false, damaged: false };
    const dm = S.w * CFG.lethal * k * (0.85 + 0.4 * CFG.rng()) * (m.pk != null ? m.pk : 1) / (pf.hp || 1);
    st.hp = Math.max(0, st.hp - dm);
    return { dm, killed: st.hp <= 0, damaged: st.hp < CFG.dmgBelow && st.hp > 0 };
  }

  /* ---------- уникнення ----------
     e — літак {x,y,h,hdg,v,perf,st,ref}; thr — загрози [{ m, d, tti, g, rf, src }]; W — { t }
     повертає { warned, hdg, h, v, turn, cm: [] } або null (без загрози) */
  function warnOf(e, m, d, W) {
    const pf = e.perf || perfOf(e.key);
    if (e.st.warn && e.st.warn.m === m) return true;
    let p = 0;
    if (m.rf) p = pf.rwr ? (m.spec.g === "arh" && !m.active ? 0.4 : 0.9) : 0.05;                  // RWR бачить опромінення; ARH — лише після ввімкнення
    else p = pf.maws * (d < 14 ? 1 : 0.4);
    if (pf.irst > 0 && !m.rf) p = Math.max(p, 0.5);
    if (d < 3) p = Math.max(p, 0.5);                                                                 // зір
    if (CFG.rng() < clamp(p, 0, 1) * 0.5) { e.st.warn = { m, t: W.t, err: CFG.rng() < (1 - pf.skill) * 0.85 }; return true; }
    return false;
  }
  function defend(e, thr, W, o) {
    o = o || {};
    const st = e.st, pf = e.perf || perfOf(e.key);
    if (!thr.length) { if (st.ev && W.t - st.ev.t0 > 1.5) st.ev = null; st.ecm = false; st.react = 0; st.warn = null; return null; }
    let near = null;
    for (const t of thr) if (!near || t.d < near.d) near = t;
    if (!warnOf(e, near.m, near.d, W)) return null;
    if (st.react === 0) st.react = W.t + CFG.reactMin * (1.3 - pf.skill);
    if (W.t < st.react) return { warned: true, wait: true, hdg: e.hdg, h: st.hT, v: 1, turn: 0.2, cm: [] };
    st.lastThreat = W.t;
    const m = near.m, d = near.d, rf = m.rf;
    const bMsl = brg(e, m), bSrc = m.src && m.src() ? brg(e, m.src()) : bMsl;
    const toward = a => nrm(a);
    let hdg = e.hdg, hT = st.hT, v = 1.0, turn = 1.0;
    const cm = [];
    st.ecm = pf.ecm > 0;
    if (rf) {
      /* РЛ-ракета: на траверз радара (нотч) + зниження; диполі в момент, коли ракета близько */
      const bm = (m.spec.g === "arh" && m.active) || d <= 3.2 ? bMsl : bSrc;
      const s1 = nrm(bm + 90), s2 = nrm(bm - 90), pick = Math.abs(dA(e.hdg, s1)) < Math.abs(dA(e.hdg, s2)) ? s1 : s2;
      hdg = toward(pick);
      hT = Math.max(pf.low, Math.min(st.hT, 1200));
      if (d < 14 && (st.ch > 0)) cm.push("chaff");
      if (d < 7 && st.fl > 0 && m.spec.g === "arh") cm.push("flare");
    } else {
      /* ІЧ-ракета: поперек лінії візування, знизити форсаж, пастки; при малій дальності — ухилення вгору/вниз */
      const s1 = nrm(bMsl + 90), s2 = nrm(bMsl - 90), pick = Math.abs(dA(e.hdg, s1)) < Math.abs(dA(e.hdg, s2)) ? s1 : s2;
      hdg = toward(pick);
      hT = d < 6 ? Math.max(pf.low, st.hT - 2500) : st.hT;
      if (d < 12 && st.fl > 0) cm.push("flare");
      v = 1.1;
    }
    if (st.warn && st.warn.err && d > 3.0) { hdg = nrm(bMsl + 180); hT = st.hT; v = 1.1; }       // помилка льотчика: тікає від ракети замість нотчу
    if (d < 3.0) {                                                           // «бочка»: максимальний розворот у площину ракети
      hdg = nrm(bMsl + (dA(e.hdg, bMsl) >= 0 ? 80 : -80)); turn = 1.35;
    }
    hdg = nrm(hdg + (CFG.rng() - 0.5) * 2 * (6 + (1 - pf.skill) * 40));                       // неточне виведення на траверз
    st.ev = st.ev || { t0: W.t, kind: rf ? "rf" : "ir" };
    st.ev.kind = rf ? "rf" : "ir";
    return { warned: true, hdg, h: hT, v, turn: turn * (0.6 + 0.5 * pf.skill), cm, near };
  }

  /* ---------- зенітні гармати ---------- */
  function flakP(key, T, d, dt) {
    const F = FLAK[key]; if (!F) return 0;
    const pf = T.perf || perfOf(T.key);
    if (d > F.r || T.h > F.hmax) return 0;
    const spdK = clamp(1 - 0.7 * (T.v || 0) / 18, 0.2, 1);
    return clamp(F.k * (1 - d / F.r * 0.7) * spdK * dt / (pf.hp || 1) * 0.6, 0, 0.9);
  }

  /* ---------- ЗРК: чи можна стріляти по літаку ---------- */
  /* u — { x, y, R (км, радіус комплексу), key }, e — ціль; повертає { ok, why, d, rk } */
  function samEnv(key, u, e) {
    const S = SAM[key]; if (!S) return { ok: false, why: "no-spec" };
    const hm = e.h || 0;
    if (hm < S.hmin) return { ok: false, why: "too-low" };
    if (hm > S.hmax) return { ok: false, why: "too-high" };
    const d = dxy(u, e), rk = hm >= 4000 ? 1 : 0.55 + 0.45 * clamp((hm - S.hmin) / (4000 - S.hmin), 0, 1), sl = Math.hypot(d, (hm - (u.h || 0)) / 1000);
    if (sl > u.R * rk) return { ok: false, why: "range", d: sl, rk };
    if (sl < S.rmin) return { ok: false, why: "min-range", d: sl, rk };
    return { ok: true, d: sl, rk };
  }
  /* скільки ракет у залпі: за оцінкою ймовірності успіху (stand-off, РЕБ, швидкість, малі висоти) */
  function samSalvo(key, u, e, left) {
    const S = SAM[key], pf = e.perf || perfOf(e.key); if (!S) return 0;
    let pk = 0.7 * (1 - 0.5 * (pf.ecm || 0)) * (1 - 0.25 * (pf.skill || 0.5)) * (S.ccm > 0.5 ? 1.05 : 1);
    const hard = pf.hp >= 1.5;
    if (hard) pk *= 0.9;
    const n = pk < 0.45 ? 2 : pk < 0.6 && !hard ? 2 : hard ? 2 : 1;
    return Math.min(n, left);
  }

  root.BV_AIRC = {
    CFG, PERF, AAM, SAM, FLAK, perfOf, newState,
    aspect, irAspectK, rcsAspectK, losK, radialV, inNotch, trackQ, irIntensity, irstQ, slant,
    addFlare, addChaff, flareI, chaffI, stepDecoys, dispense,
    makeMissile, updateLock, stepMissile, warhead, defend, warnOf, flakP, samEnv, samSalvo,
    util: { clamp, nrm, dA, brg, dxy, hv }
  };
})(typeof window !== "undefined" ? window : globalThis);
