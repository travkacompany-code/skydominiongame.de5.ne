/* ======================================================================
   BV_AEW — Saab 340 AEW&C (ASC 890), літак дальнього радіолокаційного дозору (етап 8, «BANGVECTOR 2»)
   Чистий модуль (як 02c_radar.js): не знає про мапу й 03_game.js.
   Клей із грою — tools/aew_glue.js (вшивається в src/js/03_game.js; тут — лише баланс і геометрія).

   Що тут є:
   • CFG — баланс: робоча висота, дальність огляду на ній, радіус кола патрулювання, перезарядка між вильотами,
     дальність наведення винищувачів, мінімальна впевненість треку для наведення;
   • RADAR — запис у каталог РЛС (радіолокатор Erieye-подібного класу «оглядова», 3D). Не входить до
     CATALOG (тобто не пропонується для розміщення на землі), лише додається в BYID, щоб станція могла
     бути створена в радіолокаційній симуляції;
   • rangeKm(h) — дальність огляду залежно від висоти антени (корінь із відношення висот, але не більше повної);
   • height(state) — висота станції: на землі (base, reload) — 0, у повітрі — робоча висота;
   • cueOK(track, now) — чи годиться трек РЛС для наведення винищувачів (супровід або ідентифікація, достатня впевненість і свіжість).
   ====================================================================== */
(function (root) {
  "use strict";

  /* ---------- баланс ---------- */
  const CFG = {
    alt: 7600,                 // м, робоча висота ДРЛО (крейсерський ешелон)
    rangeKm: 400,              // км, дальність огляду повітряних цілей на робочій висоті (баланс)
    minRangeFrac: 0.25,        // найменша частка дальності (на дуже малій висоті)
    orbitKm: 45,               // км, радіус кола патрулювання
    turnaround: 60,            // с ігрового часу: перезарядка й заправка на аеродромі між вильотами
    cueKm: 260,                // км від точки патрулювання, у межах якого ДРЛО наводить винищувачі
    cueConf: 0.5,              // мін. впевненість треку для наведення
    cueFreshSec: 8,            // с: трек старіший за це не використовується для наведення
    maxSorties: 5             // вильотів за один запуск з аеродрому (ліміт вводу в панелі ППО)
  };

  /* ---------- запис РЛС для радіолокаційної симуляції (поля — як у CATALOG 02c_radar.js) ---------- */
  const RADAR = {
    id: "ua_saab340aew", side: "ua", name: "Saab 340 AEW&C (ASC 890)",
    radarClass: "surveillance", detectionRangeKm: CFG.rangeKm, dimension: "3D", band: null,
    firstRelease: false, bal: {},
    maxTrackedTargets: null, scanIntervalSec: null, deploymentTimeSec: null, relocationTimeSec: null,
    trackQuality: null, mobility: null, jamResistance: null, cost: null, maintenanceCost: null,
    airborne: true
  };

  /* ---------- геометрія й дальність ---------- */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* дальність огляду на висоті h, км: на робочій висоті — повна, нижче — спадає як корінь із висоти */
  function rangeKm(h) {
    if (!(h > 0)) return 0;
    return CFG.rangeKm * clamp(Math.sqrt(h / CFG.alt), CFG.minRangeFrac, 1);
  }

  /* висота станції ДРЛО за станом літака: на землі — 0, у польоті — робоча висота */
  const AIRBORNE = { transit: 1, patrol: 1, rtb: 1 };
  function height(state) { return AIRBORNE[state] ? CFG.alt : 0; }
  const airborne = state => !!AIRBORNE[state];

  /* трек придатний для наведення: супровід або ідентифікація, достатня впевненість і свіжість даних */
  function cueOK(c, now) {
    if (!c || c.state === "lost" || c.state === "preliminary" || c.state === "detected") return false;
    if (!(c.conf >= CFG.cueConf)) return false;
    const age = Math.max(0, now - (c.lastUpdatedAt || 0));
    return age <= CFG.cueFreshSec;
  }

  /* після посадки на аеродромі: скільки вильотів залишилось */
  const sortiesAfterTakeoff = total => (total === Infinity ? Infinity : Math.max(0, (total | 0) - 1));

  const api = { CFG, RADAR, rangeKm, height, airborne, cueOK, sortiesAfterTakeoff };
  root.BV_AEW = api;
  /* запис станції — у каталог радіолокатора (без розміщення на землі) */
  if (root.BV_RADAR && root.BV_RADAR.BYID) root.BV_RADAR.BYID[RADAR.id] = RADAR;
})(typeof window !== "undefined" ? window : globalThis);
