/* ======================================================================
   BV_AEW — літаки дальнього радіолокаційного дозору: Saab 340 AEW&C (ASC 890, Україна) і А-50У (Росія) (етап 8, «BANGVECTOR 2»)
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
  const LIT = {
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
  /* CFG: геттери — спершу параметри механіки "aew_cfg" з ядра, інакше літерал з LIT */
  const CFG = {};
  Object.keys(LIT).forEach(function (k) {
    Object.defineProperty(CFG, k, {
      enumerable: true,
      get: function () {
        const c = coreNow();
        const m = c && c.get("mechanic", "aew_cfg");
        return m && m.params && m.params[k] !== undefined ? m.params[k] : LIT[k];
      },
      set: function (v) { LIT[k] = v; }
    });
  });

  /* ---------- типи ДРЛО: власні дальність, ешелон, коло й радіус наведення (відсутнє поле — з CFG) ---------- */
  const TYPES = {
    aew_saab340: { side: "ua", radar: "ua_saab340aew", name: "Saab 340 AEW&C (ASC 890)" },
    aew_a50: { side: "ru", radar: "ru_a50aew", name: "А-50У (Шмель-М)", alt: 10000, rangeKm: 500, orbitKm: 60, cueKm: 320, turnaround: 90 }
  };
  /* етап 9.1b: значення читаються з реєстру ядра, якщо він є (мод може їх змінити); інакше — літерали */
  const coreNow = () => (root.BV_CORE && root.BV_CORE.has && root.BV_CORE.has("aew", "aew_saab340") ? root.BV_CORE : null);
  const tp = (key, f) => {
    const c = coreNow();
    if (c && TYPES[key]) { const d = c.get("aew", key); if (d && d[f] != null) return d[f]; }
    const t = TYPES[key];
    return t && t[f] != null ? t[f] : CFG[f];
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

  const RADAR_A50 = Object.assign({}, RADAR, { id: "ru_a50aew", side: "ru", name: "А-50У (Шмель-М)", detectionRangeKm: TYPES.aew_a50.rangeKm });
  const RADARS = { aew_saab340: RADAR, aew_a50: RADAR_A50 };
  const radarFor = key => RADARS[key] || RADAR;

  /* ---------- геометрія й дальність ---------- */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* дальність огляду на висоті h, км: на робочій висоті — повна, нижче — спадає як корінь із висоти */
  function rangeKm(h, key) {
    if (!(h > 0)) return 0;
    return tp(key, "rangeKm") * clamp(Math.sqrt(h / tp(key, "alt")), CFG.minRangeFrac, 1);
  }

  /* висота станції ДРЛО за станом літака: на землі — 0, у польоті — робоча висота */
  const AIRBORNE = { transit: 1, patrol: 1, rtb: 1 };
  function height(state, key) { return AIRBORNE[state] ? tp(key, "alt") : 0; }
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

  /* ---------- етап 9.1: дзеркало в реєстр ядра (BV_CORE) ----------
     Вид "aew" — ТТХ ДРЛО (по одному запису на тип), механіка "aew_cfg" — загальний баланс.
     Гра й досі читає значення з цього файлу (поведінка без змін). Моди можуть змінити баланс
     через overrides (наприклад "aew:aew_a50"); fromCore() повертає ефективні значення з реєстру. */
  const CORE_FIELDS = ["alt", "rangeKm", "orbitKm", "cueKm", "turnaround"];
  function mirrorToCore(core) {
    if (!core || core.has("aew", "aew_saab340")) return false;   // уже дзеркальовано
    core.defineKind("aew", {
      name: { type: "string", req: true },
      side: { type: "string", req: true, enum: ["ua", "ru"] },
      alt: { type: "number", min: 0 },
      rangeKm: { type: "number", min: 0 },
      orbitKm: { type: "number", min: 0 },
      cueKm: { type: "number", min: 0 },
      turnaround: { type: "number", min: 0 },
      radarId: { type: "string" }
    });
    Object.keys(TYPES).forEach(function (key) {
      const t = TYPES[key];
      const def = { name: t.name, side: t.side, radarId: radarFor(key).id };
      CORE_FIELDS.forEach(function (f) { def[f] = tp(key, f); });
      core.define("aew", key, def);
    });
    core.define("mechanic", "aew_cfg", { name: "ДРЛО: загальний баланс", enabled: true, params: Object.assign({}, CFG) });
    return true;
  }

  /* ефективні значення з реєстру ядра: { types: {key: {…}}, cfg: {…} } або null, якщо ядра немає */
  function fromCore(core) {
    if (!core || !core.has("aew", "aew_saab340")) return null;
    const types = {};
    Object.keys(TYPES).forEach(function (key) {
      const d = core.get("aew", key);
      types[key] = { name: d.name, side: d.side, radarId: d.radarId, alt: d.alt, rangeKm: d.rangeKm,
        orbitKm: d.orbitKm, cueKm: d.cueKm, turnaround: d.turnaround };
    });
    const m = core.get("mechanic", "aew_cfg");
    return { types: types, cfg: m ? Object.assign({}, m.params) : Object.assign({}, CFG) };
  }

  const api = { CFG, RADAR, RADAR_A50, TYPES, tp, radarFor, rangeKm, height, airborne, cueOK, sortiesAfterTakeoff,
    mirrorToCore, fromCore };
  root.BV_AEW = api;
  /* запис станції — у каталог радіолокатора (без розміщення на землі) */
  if (root.BV_RADAR && root.BV_RADAR.BYID){ root.BV_RADAR.BYID[RADAR.id] = RADAR; root.BV_RADAR.BYID[RADAR_A50.id] = RADAR_A50; }
  /* зеркало — необов'язкове: збій ядра не повинен зупиняти ДРЛО і гру */
  if (root.BV_CORE) { try { mirrorToCore(root.BV_CORE); } catch (e) { if (root.console) root.console.warn("[BV_AEW] дзеркало ядра:", e && e.message); } }
})(typeof window !== "undefined" ? window : globalThis);
