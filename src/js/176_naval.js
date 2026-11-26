/* SKYDOMINION · 176 · МОРСЬКІ АТАКИ Й ІНЦИДЕНТИ (етап 7.75) — Чорне та Балтійське моря
   • Судноплавство: цивільні (танкери, «тіньовий флот», зерновози, контейнеровози, пороми, рибалки), військові кораблі й катери, науково-кабельні судна
     рухаються лініями між портами. Реальні кораблі/танкери бойового модуля (BV_DIPX.seaShips) дзеркаляться в журнал.
   • Розвідка: виявлення (AIS · берегові РЛС · партнери · супутник · розвідувальний БпЛА) → ідентифікація (AIS-запит, профіль РЛС, візуально, OSINT, радіозапит,
     досмотр) → оцінка статусу. Те, що «знає» гравець (belief), відокремлене від правди (truth): AIS можна підмінити, профіль РЛС хибить, візуальна
     ідентифікація помиляється — помилки розкриваються після удару й підсилюють наслідки.
   • Удар (морський дрон / ракета) із затримкою польоту → результат (промах · перехоплено · пошкоджено · критично · потоплено), жертви, розлив нафти.
   • Наслідки: відносини з державою прапора/власника/берега (BV_DIP.ext.addR), репутація (D.rep, її читає ІІ санкцій), міжнародне розслідування
     (вердикт → репутація, санкції, компенсація), економіка (гроші, страхування воєнних ризиків → BV_SEA.incK у доході, закриття портів, потік суден).
   • Журнал, картки суден, ефекти на мапі, сповіщення, бейдж на кнопці ⚓. Стан журналу — localStorage bv-sea1:<профіль>; судна — на час бою.
   Дипломатія й гра не змінюються: модуль лише читає/пише через BV_DIP.ext і BV_DND_HOST. Без дипломатії/мапи не робить нічого. */
(function boot() {
  "use strict";
  if (window.BV_SEA) return;
  const DX = () => (window.BV_DIP && window.BV_DIP.ext) || null;
  const HOST = () => window.BV_DND_HOST || null;
  const mp = () => (HOST() && HOST().S7 ? HOST().S7.map : null);
  const GL = () => (HOST() && HOST().S7 ? HOST().S7.gl : null) || window.maplibregl || null;
  if (!DX() || !HOST() || !mp() || !GL()) return setTimeout(boot, 400);

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const rnd = Math.random, pick = a => a[Math.floor(rnd() * a.length)], rr = (a, b) => a + rnd() * (b - a), ri = (a, b) => Math.round(rr(a, b));
  const toast = (m, k) => { try { HOST().toast(m, k || "info"); } catch (e) { /* */ } };
  const el = (tag, id, cls) => { const e = document.createElement(tag); if (id) e.id = id; if (cls) e.className = cls; return e; };
  const hav = (a, b) => { const kx = 111.32 * Math.cos((a[1] + b[1]) / 2 * Math.PI / 180); return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 110.574); };
  const brg = (a, b) => { const kx = Math.cos((a[1] + b[1]) / 2 * Math.PI / 180); return (Math.atan2((b[0] - a[0]) * kx, b[1] - a[1]) * 180 / Math.PI + 360) % 360; };
  const fm = v => (Math.round(v * 10) / 10).toString().replace(".", ",");
  const now = () => DX().now();
  const fmtT = t => { const d = Math.floor(t / 1440) + 1, m = Math.floor(t % 1440); return `Д${d} ${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
  const other = sd => sd === "ua" ? "ru" : "ua";
  const SK = 8;                    // масштаб часу: 1 хв гри = 8 хв реального ходу судна (щоб рух був помітним)

  /* ======================================================================================================
     Дані: прапори, порти, лінії руху, класи суден
     ====================================================================================================== */
  // st — держава дипломатії (якщо є), px — «покровитель» для реакції, коли самої держави в моделі немає
  const FL = {
    ua: { n: "Україна", f: "🇺🇦", st: "ua" }, ru: { n: "Росія", f: "🇷🇺", st: "ru" }, tr: { n: "Туреччина", f: "🇹🇷", st: "tr" }, ro: { n: "Румунія", f: "🇷🇴", st: "ro" },
    pl: { n: "Польща", f: "🇵🇱", st: "pl" }, de: { n: "Німеччина", f: "🇩🇪", st: "de" }, gb: { n: "Велика Британія", f: "🇬🇧", st: "gb" }, fr: { n: "Франція", f: "🇫🇷", st: "fr" },
    cn: { n: "Китай", f: "🇨🇳", st: "cn" }, in: { n: "Індія", f: "🇮🇳", st: "in" }, by: { n: "Білорусь", f: "🇧🇾", st: "by" }, us: { n: "США", f: "🇺🇸", st: "us" },
    gr: { n: "Греція", f: "🇬🇷", st: null, px: "tr", w: 0.6 }, bg: { n: "Болгарія", f: "🇧🇬", st: null, px: "ro", w: 0.6 }, ge: { n: "Грузія", f: "🇬🇪", st: null, px: "tr", w: 0.5 },
    ee: { n: "Естонія", f: "🇪🇪", st: null, px: "pl", w: 0.7 }, fi: { n: "Фінляндія", f: "🇫🇮", st: null, px: "de", w: 0.7 }, lt: { n: "Литва", f: "🇱🇹", st: null, px: "pl", w: 0.7 },
    se: { n: "Швеція", f: "🇸🇪", st: null, px: "de", w: 0.7 }, dk: { n: "Данія", f: "🇩🇰", st: null, px: "de", w: 0.7 },
    pa: { n: "Панама", f: "🇵🇦", st: null, px: "us", w: 0.35, conv: 1 }, lr: { n: "Ліберія", f: "🇱🇷", st: null, px: "us", w: 0.35, conv: 1 }, mt: { n: "Мальта", f: "🇲🇹", st: null, px: "fr", w: 0.4, conv: 1 },
    ga: { n: "Габон", f: "🇬🇦", st: null, px: "fr", w: 0.3, conv: 1 }, cm: { n: "Камерун", f: "🇨🇲", st: null, px: "fr", w: 0.3, conv: 1 }
  };
  const flN = c => FL[c] ? FL[c].n : "?", flF = c => FL[c] ? FL[c].f : "🏳";
  const SEAS = { black: "Чорне море", baltic: "Балтійське море" };
  // st — сторона порту (ua/ru/null), mil — військово-морська база; ports 'own' дають берегову РЛС і точки пуску
  const PORTS = {
    odesa: { n: "Одеса", p: [30.78, 46.46], sea: "black", st: "ua", fl: "ua" }, chorn: { n: "Чорноморськ", p: [30.72, 46.31], sea: "black", st: "ua", fl: "ua" },
    sevas: { n: "Севастополь", p: [33.53, 44.62], sea: "black", st: "ru", fl: "ru", mil: 1 }, novor: { n: "Новоросійськ", p: [37.78, 44.69], sea: "black", st: "ru", fl: "ru", mil: 1 },
    const_: { n: "Констанца", p: [28.68, 44.15], sea: "black", st: null, fl: "ro" }, bosp: { n: "Босфор", p: [29.12, 41.22], sea: "black", st: null, fl: "tr" },
    poti: { n: "Поті", p: [41.65, 42.15], sea: "black", st: null, fl: "ge" },
    primo: { n: "Приморськ", p: [28.6, 60.36], sea: "baltic", st: "ru", fl: "ru" }, ustl: { n: "Усть-Луга", p: [28.3, 59.68], sea: "baltic", st: "ru", fl: "ru" },
    baltiysk: { n: "Балтійськ", p: [19.9, 54.65], sea: "baltic", st: "ru", fl: "ru", mil: 1 }, gdansk: { n: "Гданськ", p: [18.7, 54.4], sea: "baltic", st: null, fl: "pl" },
    klaip: { n: "Клайпеда", p: [21.1, 55.72], sea: "baltic", st: null, fl: "lt" }, tallinn: { n: "Таллінн", p: [24.77, 59.45], sea: "baltic", st: null, fl: "ee" },
    helsinki: { n: "Гельсінкі", p: [24.95, 60.15], sea: "baltic", st: null, fl: "fi" }, belts: { n: "Датські протоки", p: [11.3, 54.85], sea: "baltic", st: null, fl: "dk" }
  };
  const mixOf = o => Object.keys(o).map(k => [k, o[k]]);
  // лінії руху (довгота, широта) по воді; n — бажана кількість суден; mix — склад потоку; fl — розподіл прапорів; loop — патруль «туди-назад»
  const LANES = [
    { id: "grain", sea: "black", n: 7, a: "odesa", b: "bosp", pts: [[30.5, 46.08], [30.2, 45.4], [29.9, 44.5], [29.6, 43.3], [29.6, 42.2], [29.15, 41.3]], mix: { bulk: 52, cargo: 28, tank: 12, cont: 8 }, fl: { pa: 22, lr: 14, mt: 12, tr: 18, gr: 14, ua: 12, bg: 8 }, cargo: ["зерно", "кукурудза", "соняшникова олія", "ячмінь"], aff: "ua" },
    { id: "oil", sea: "black", n: 7, a: "novor", b: "bosp", pts: [[37.6, 44.52], [36.4, 44.0], [34.0, 43.2], [31.5, 42.2], [29.5, 41.6], [29.15, 41.3]], mix: { tank: 38, shadow: 30, bulk: 17, cargo: 15 }, fl: { ru: 22, pa: 15, lr: 12, ga: 12, cm: 10, tr: 12, gr: 7, cn: 10 }, cargo: ["нафта", "нафтопродукти", "пшениця (РФ)", "мазут"], aff: "ru" },
    { id: "ro", sea: "black", n: 4, a: "const_", b: "bosp", pts: [[28.95, 44.05], [29.45, 43.4], [29.8, 42.5], [29.4, 41.6], [29.15, 41.3]], mix: { cargo: 35, cont: 30, bulk: 20, tank: 15 }, fl: { ro: 30, tr: 25, mt: 15, pa: 15, bg: 15 }, cargo: ["контейнери", "зерно", "паливо", "сталь"], aff: "n" },
    { id: "poti", sea: "black", n: 3, a: "bosp", b: "poti", pts: [[29.4, 41.5], [32.0, 42.4], [35.0, 42.8], [38.0, 42.4], [41.2, 42.1]], mix: { cargo: 40, tank: 25, bulk: 20, fish: 15 }, fl: { tr: 35, ge: 20, pa: 20, gr: 15, mt: 10 }, cargo: ["генвантаж", "паливо", "зерно"], aff: "n" },
    { id: "fish", sea: "black", n: 3, a: "bosp", b: "bosp", pts: [[31.6, 41.9], [33.0, 42.0], [34.4, 42.2], [35.2, 42.35]], mix: { fish: 100 }, fl: { tr: 80, bg: 10, ro: 10 }, cargo: ["риба"], aff: "n", loop: 1 },
    { id: "bsf", sea: "black", n: 6, a: "sevas", b: "novor", pts: [[33.1, 44.35], [33.9, 43.9], [35.3, 43.9], [36.6, 44.2], [37.4, 44.45]], mix: { war: 50, patrol: 35, res: 15 }, fl: { ru: 100 }, cargo: ["бойовий комплект"], aff: "ru", loop: 1, mil: 1 },
    { id: "bsw", sea: "black", n: 2, a: "const_", b: "const_", pts: [[28.9, 43.8], [29.5, 44.1], [29.8, 43.3]], mix: { patrol: 100 }, fl: { ro: 50, tr: 50 }, cargo: ["патрулювання"], aff: "n", loop: 1, mil: 1 },
    { id: "bo", sea: "baltic", n: 8, a: "primo", b: "belts", pts: [[28.2, 60.15], [26.0, 59.95], [24.0, 59.8], [22.6, 59.55], [21.2, 59.3], [20.0, 58.5], [19.3, 57.2], [18.5, 56.0], [16.6, 55.0], [14.8, 54.65], [12.9, 54.8], [11.5, 54.9]], mix: { tank: 40, shadow: 38, bulk: 12, cargo: 10 }, fl: { ru: 20, pa: 14, lr: 12, ga: 14, cm: 12, mt: 10, cn: 6, in: 6, gr: 6 }, cargo: ["нафта", "дизель", "мазут", "вугілля"], aff: "ru" },
    { id: "ul", sea: "baltic", n: 5, a: "ustl", b: "belts", pts: [[27.9, 59.85], [26.0, 59.95], [24.0, 59.8], [22.6, 59.55], [21.2, 59.3], [20.0, 58.5], [19.3, 57.2], [18.5, 56.0], [16.6, 55.0], [14.8, 54.65], [12.9, 54.8], [11.5, 54.9]], mix: { tank: 30, shadow: 22, bulk: 28, cargo: 20 }, fl: { ru: 22, pa: 14, lr: 14, mt: 14, cm: 8, gr: 8, cn: 10, in: 10 }, cargo: ["нафтопродукти", "добрива", "вугілля", "метал"], aff: "ru" },
    { id: "kgd", sea: "baltic", n: 4, a: "baltiysk", b: "ustl", pts: [[19.3, 55.0], [19.0, 56.2], [19.6, 57.6], [20.8, 58.9], [22.5, 59.6], [24.5, 59.85], [27.0, 59.95]], mix: { war: 35, patrol: 25, cargo: 25, ferry: 15 }, fl: { ru: 100 }, cargo: ["військові вантажі", "генвантаж"], aff: "ru", loop: 1 },
    { id: "nato", sea: "baltic", n: 4, a: "gdansk", b: "belts", pts: [[18.9, 55.0], [17.4, 55.3], [15.6, 55.1], [14.4, 54.7], [12.8, 54.75]], mix: { patrol: 55, war: 25, res: 20 }, fl: { pl: 30, de: 25, se: 15, dk: 15, fi: 15 }, cargo: ["патруль НАТО", "захист інфраструктури"], aff: "n", loop: 1, mil: 1 },
    { id: "ferry", sea: "baltic", n: 4, a: "helsinki", b: "tallinn", pts: [[24.95, 59.95], [24.85, 59.7]], mix: { ferry: 70, cargo: 30 }, fl: { fi: 35, ee: 35, se: 15, lt: 15 }, cargo: ["пасажири й авто", "генвантаж"], aff: "n", loop: 1 },
    { id: "cont", sea: "baltic", n: 5, a: "gdansk", b: "belts", pts: [[18.9, 55.1], [18.0, 55.6], [16.4, 55.2], [14.5, 54.7], [12.8, 54.8]], mix: { cont: 50, cargo: 25, bulk: 15, ferry: 10 }, fl: { pl: 20, de: 20, lt: 15, dk: 15, mt: 15, lr: 15 }, cargo: ["контейнери", "авто", "генвантаж"], aff: "n" }
  ];
  LANES.forEach(L => { L.pp = L.pts.slice(); L.cum = [0]; for (let i = 1; i < L.pp.length; i++) L.cum.push(L.cum[i - 1] + hav(L.pp[i - 1], L.pp[i])); L.len = L.cum[L.cum.length - 1] || 1; });

  // Класи: mil — військовий за природою; spd — км/год; crew; haz — ризик розливу/вибуху; val — вартість судна+вантажу, млн $; civ — цивільний ризик (0…1)
  const CLS = {
    war: { n: "Військовий корабель", i: "⚔", spd: [28, 36], crew: [70, 220], haz: 0.35, val: [90, 420], mil: 1, civ: 0, def: 0.35, dd: 0.2 },
    patrol: { n: "Патрульний катер", i: "◈", spd: [30, 44], crew: [8, 30], haz: 0.1, val: [8, 60], mil: 1, civ: 0.02, def: 0.1, dd: 0.1 },
    tank: { n: "Танкер", i: "▰", spd: [20, 26], crew: [18, 30], haz: 0.9, val: [30, 140], civ: 0.7 },
    shadow: { n: "Танкер «тіньового флоту»", i: "▰", spd: [16, 22], crew: [16, 26], haz: 0.95, val: [20, 80], civ: 0.6 },
    bulk: { n: "Балкер / зерновоз", i: "▭", spd: [18, 24], crew: [16, 26], haz: 0.35, val: [15, 60], civ: 0.8 },
    cargo: { n: "Суховантаж", i: "▭", spd: [18, 24], crew: [12, 24], haz: 0.3, val: [10, 45], civ: 0.8 },
    cont: { n: "Контейнеровоз", i: "▤", spd: [26, 34], crew: [18, 28], haz: 0.3, val: [40, 220], civ: 0.85 },
    ferry: { n: "Пором / пасажирське", i: "◭", spd: [32, 42], crew: [40, 120], haz: 0.2, val: [40, 200], civ: 1, pax: [150, 1400] },
    fish: { n: "Рибальське судно", i: "◇", spd: [8, 14], crew: [4, 14], haz: 0.05, val: [0.5, 4], civ: 0.95 },
    res: { n: "Науково-кабельне судно", i: "◎", spd: [12, 16], crew: [14, 50], haz: 0.1, val: [20, 90], civ: 0.8 }
  };
  // плутанина класів при помилці ідентифікації (що з чим схоже за силуетом / профілем РЛС)
  const CONF = { war: ["patrol", "res"], patrol: ["war", "fish"], tank: ["shadow", "bulk"], shadow: ["tank", "bulk", "cargo"], bulk: ["cargo", "tank"], cargo: ["bulk", "cont"], cont: ["cargo", "ferry"], ferry: ["cont", "war"], fish: ["patrol", "cargo"], res: ["war", "cargo"] };
  const CIVCLS = ["tank", "shadow", "bulk", "cargo", "cont", "ferry", "fish", "res"];
  const NAMES = {
    ru: ["Волгонефть", "Сириус", "Академик Губкін", "Нева", "Балтика-7", "Кавказ", "Урал-Трейд", "Ладога", "Новатор", "Сибирь", "Зарница", "Пионер"],
    ua: ["Одеса-Експрес", "Дніпро Гранд", "Скіфія", "Лиман", "Чорне Золото", "Таврія", "Херсон-1", "Пересип"],
    gen: ["Aegean Star", "Pacific Venture", "Sea Orchid", "Nordic Pearl", "Golden Horn", "Atlas", "Lady Marina", "Ocean Gale", "Blue Meridian", "Alpha Trader", "Cape Aurora", "Delta Spirit", "Eastern Wind", "Orion Bay", "Star Harmony", "Ever Dawn", "Merchant Hope", "Silk Route", "Sun Rider"],
    tr: ["Karadeniz", "Bosphorus Pride", "Anadolu", "Yildiz", "Marmara Star", "Kaptan Ali"], pl: ["Gdynia", "Baltyk", "Mazury"], de: ["Nordsee", "Holstein", "Hansa Lübeck"], fi: ["Finlandia", "Aura", "Nordlys"], ee: ["Tallink Star", "Estonia Link", "Saaremaa"],
    war: ["«Адмірал Ессен»", "«Мойсеєв»", "«Ямал»", "«Ладний»", "«Сметливий»", "«Неустрашимий»", "«Стійкий»", "«Грозний»"],
    ward: { pl: ["ORP Kaszub", "ORP Gen. Pulaski"], de: ["FGS Bonn", "FGS Hessen"], se: ["HSwMS Visby"], dk: ["HDMS Esbern"], fi: ["FNS Hamina"], ro: ["NRS Regele Ferdinand"], tr: ["TCG Gediz"], ru: ["«Ямал»", "«Ладний»", "«Сметливий»", "«Неустрашимий»", "«Адмірал Ессен»"] }
  };

  /* ======================================================================================================
     Стан
     ====================================================================================================== */
  const freshStat = () => ({ strikes: 0, sunk: 0, lawful: 0, civil: 0, neutral: 0, err: 0, cas: 0, spill: 0, inv: 0, guilty: 0, cleared: 0, paid: 0, sanc: 0 });
  const S = { v: new Map(), inc: [], inv: [], jobs: [], rec: [], mods: [], ins: { black: 0, baltic: 0 }, closed: {}, stat: { ua: freshStat(), ru: freshStat() }, nid: 1, vid: 1, last: 0, live: false, lastClock: 0,
    ai: { ua: 0, ru: 0 }, ev: { mine: 0, cable: 0 }, sat: { until: 0, next: 0, p: null, r: 0 }, queue: [], ui: { panel: false, tab: "v", sea: "all", sel: 0, card: 0, inc: 0, armed: null, only: 0, zones: true, vessels: true }, ver: 1, unread: 0, mk: new Map(), fxm: [], dirty: false, boot: Date.now() };
  const PK = () => { try { const k = DX().key(); return (typeof k === "string" ? k : "bv-dip1:x").replace("bv-dip1:", "bv-sea1:"); } catch (e) { return "bv-sea1:x"; } };
  function save(force) {
    if (!force && !S.dirty) return; S.dirty = false;
    try { localStorage.setItem(PK(), JSON.stringify({ v: 1, inc: S.inc.slice(-60), inv: S.inv.slice(-30), stat: S.stat, nid: S.nid, ins: S.ins, mods: S.mods, closed: S.closed })); } catch (e) { /* сховище недоступне */ }
  }
  function load() {
    let o = null; try { const s = localStorage.getItem(PK()); if (s) o = JSON.parse(s); } catch (e) { o = null; }
    if (!o || o.v !== 1) return;
    S.inc = Array.isArray(o.inc) ? o.inc : []; S.inv = Array.isArray(o.inv) ? o.inv : []; S.nid = o.nid || 1;
    ["ua", "ru"].forEach(s => { S.stat[s] = Object.assign(freshStat(), (o.stat || {})[s]); });
    S.ins = Object.assign({ black: 0, baltic: 0 }, o.ins); S.mods = Array.isArray(o.mods) ? o.mods : []; S.closed = o.closed || {};
    S.unread = S.inc.filter(i => !i.read && i.inv_for).length;
  }
  const bump = () => { S.ver++; S.dirty = true; };
  const side = () => DX().side();
  const active = () => { try { return !!(DX().ok() && window.BV_GAME && window.BV_GAME.on); } catch (e) { return false; } };
  const human = () => { try { const g = window.BV_GAME; return g && g.on ? ["ua", "ru"].filter(s => g.ctrl && g.ctrl[s] === "me") : []; } catch (e) { return []; } };
  const isHuman = s => human().includes(s);
  const eco = sd => { try { const E = HOST() && window.BV_DIPX ? window.BV_DIPX.ecoE(sd) : null; return E && E.on ? E : null; } catch (e) { return null; } };
  const money = sd => { const E = eco(sd); return E ? E.money : Infinity; };
  const pay = (sd, m) => { const E = eco(sd); if (E) { E.money = Math.max(0, E.money - m); E.spent = (E.spent || 0) + m; } };
  const earn = (sd, m) => { const E = eco(sd); if (E) E.money += m; };

  /* ======================================================================================================
     Судна: створення, рух, дзеркало реальних кораблів гри
     ====================================================================================================== */
  const wpick = (o) => { const e = mixOf(o), tot = e.reduce((s, x) => s + x[1], 0); let r = rnd() * tot; for (const [k, w] of e) { r -= w; if (r <= 0) return k; } return e[0][0]; };
  const posAt = (L, d) => {
    d = clamp(d, 0, L.len); let i = 1; while (i < L.cum.length - 1 && L.cum[i] < d) i++;
    const a = L.pp[i - 1], b = L.pp[i], seg = Math.max(1e-6, L.cum[i] - L.cum[i - 1]), f = (d - L.cum[i - 1]) / seg;
    return { p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], h: brg(a, b) };
  };
  function vname(cls, flag, aff) {
    if (CLS[cls].mil) { const w = NAMES.ward[flag]; return w ? pick(w) + " №" + ri(11, 99) : pick(NAMES.war); }
    if (aff === "ru" && flag === "ru") return pick(NAMES.ru);
    if (flag === "ua") return pick(NAMES.ua); if (NAMES[flag]) return pick(NAMES[flag]);
    return pick(NAMES.gen) + (rnd() < 0.3 ? " " + pick(["I", "II", "III", "V"]) : "");
  }
  function mkVessel(L, startD) {
    const cls = wpick(L.mix), C = CLS[cls], flag = wpick(L.fl), dir = rnd() < 0.5 ? 1 : -1;
    const owner = L.aff === "ru" && flag !== "ru" ? (rnd() < 0.7 ? "ru" : pick(["cn", "in", "gr", "tr"])) : L.aff === "ua" && flag !== "ua" ? (rnd() < 0.2 ? "ua" : pick(["tr", "gr", "pa", "mt"])) : flag;
    let aff = L.aff === "n" ? "n" : (L.aff === "ru" ? (owner === "ru" || flag === "ru" ? "ru" : "n") : (owner === "ua" || flag === "ua" ? "ua" : "n"));
    if (CLS[cls].mil && (flag === "ru")) aff = "ru"; if (CLS[cls].mil && flag !== "ru" && flag !== "ua") aff = "n";
    const v = { id: "v" + S.vid++, mirror: 0, name: "", cls, flag, owner, aff, lane: L.id, sea: L.sea, d: startD != null ? startD : rnd() * L.len, dir, loop: !!L.loop,
      spd: rr(C.spd[0], C.spd[1]), crew: ri(C.crew[0], C.crew[1]), haz: C.haz * rr(0.7, 1.15), val: +rr(C.val[0], C.val[1]).toFixed(1), pax: C.pax ? ri(C.pax[0], C.pax[1]) : 0, cargo: pick(L.cargo),
      mil: !!C.mil, carry: false, sanc: 0, ais: "on", spoof: null, decoy: false, suspect: false, dmg: 0, st: "sail", warned: 0, pos: [0, 0], hdg: 0, fled: 0, life: 0 };
    v.name = vname(cls, flag, aff);
    if (cls === "shadow") { v.owner = "ru"; v.aff = "ru"; v.sanc = rnd() < 0.8 ? ri(2, 3) : 1; v.ais = rnd() < 0.55 ? "off" : "spoof"; if (v.flag === "ru") v.flag = pick(["pa", "ga", "cm", "lr"]); if (v.ais === "spoof") { v.spoof = { cls: "tank", flag: pick(["gr", "mt", "tr"]), name: pick(NAMES.gen) }; v.decoy = true; } }
    else if (aff === "ru" && (cls === "tank" || cls === "bulk") && flag !== "ru") { v.sanc = rnd() < 0.4 ? 1 : 0; if (v.sanc && rnd() < 0.4) v.ais = "off"; }
    if (cls === "cargo" && aff === "ru" && L.id !== "oil" && rnd() < 0.3) { v.carry = true; v.cargo = "військові вантажі (боєприпаси)"; v.sanc = Math.max(v.sanc, 1); if (rnd() < 0.6) { v.ais = "spoof"; v.spoof = { cls: "cargo", flag: pick(["tr", "gr", "pa"]), name: pick(NAMES.gen) }; v.decoy = true; } }
    if (CLS[cls].mil && L.aff === "n") { v.aff = "n"; } if (CLS[cls].mil) { v.carry = false; v.sanc = 0; v.ais = rnd() < 0.5 ? "off" : "on"; }
    if (cls === "res" && L.id === "nato") v.mil = false; if (cls === "res" && flag === "ru") { v.mil = true; v.suspect = false; v.ais = rnd() < 0.5 ? "off" : "on"; }
    const P = posAt(L, v.d); v.pos = P.p; v.hdg = (P.h + (dir < 0 ? 180 : 0)) % 360;
    return v;
  }
  function seed() {
    S.v.clear(); S.jobs = []; S.rec = []; S.queue = []; clearMarkers();
    const k = clamp(1 - Math.max(S.ins.black, S.ins.baltic) * 0.4, 0.6, 1);
    for (const L of LANES) { const n = Math.max(1, Math.round(L.n * k)); for (let i = 0; i < n; i++) { const v = mkVessel(L); S.v.set(v.id, v); } }
    S.sat.next = now() + 25; S.ai.ua = now() + ri(90, 200); S.ai.ru = now() + ri(90, 200); S.ev.mine = now() + ri(260, 480); S.ev.cable = now() + ri(420, 760);
    S.live = true; bump();
  }
  const laneOf = id => LANES.find(l => l.id === id);
  function moveVessel(v, dt) {
    if (v.st === "sunk" || v.st === "detained") return true;
    const L = laneOf(v.lane); if (!L) return true;
    let sp = v.spd * (v.st === "burn" ? 0.3 : 1) * (1 - v.dmg * 0.4) * (v.fled ? 1.35 : 1) * (S.closed[L.a] > now() || S.closed[L.b] > now() ? 0.5 : 1);
    v.d += v.dir * sp * dt / 60 * SK;
    if (v.d >= L.len || v.d <= 0) {
      if (v.loop) { v.dir = -v.dir; v.d = clamp(v.d, 0, L.len); } else { return false; }      // дійшло до порту — зникає (і з'явиться нове)
    }
    const P = posAt(L, v.d); v.pos = P.p; v.hdg = (P.h + (v.dir < 0 ? 180 : 0)) % 360; return true;
  }
  /* дзеркало реальних кораблів і танкерів бойового модуля: лише спостереження й журнал, керує ними сама гра */
  function mirrorFrom(u) {
    const id = "g" + u.id, tk = u.kind === "t", sub = u.key === "sub", cls = tk ? "tank" : "war";
    const v = { id, mirror: 1, gid: u.id, name: (sub ? "Підводний човен" : tk ? "Танкер" : "Корабель") + " (" + (u.base || "?") + ")", cls, flag: "ru", owner: "ru", aff: "ru", lane: "", sea: u.pos[1] > 50 ? "baltic" : "black", d: 0, dir: 1, loop: 0,
      spd: 20, crew: tk ? 22 : sub ? 60 : 140, haz: tk ? 0.9 : 0.35, val: tk ? 60 : 200, pax: 0, cargo: tk ? "нафтопродукти" : "ракети на борту (" + (u.load || 0) + ")", mil: !tk, carry: !tk, sanc: 0, ais: tk ? "on" : "off", spoof: null, decoy: false, suspect: false, dmg: 0, st: "sail", warned: 0, pos: u.pos.slice(), hdg: 0, fled: 0, life: 0 };
    S.v.set(id, v); return v;
  }
  function syncMirror() {
    let list = []; try { list = window.BV_DIPX && window.BV_DIPX.seaShips ? window.BV_DIPX.seaShips() : []; } catch (e) { list = []; }
    const seen = new Set();
    for (const u of list) { const id = "g" + u.id; seen.add(id); const v = S.v.get(id) || mirrorFrom(u); v.pos = u.pos.slice(); }
    for (const [id, v] of S.v) if (v.mirror && !seen.has(id) && v.st === "sail") S.v.delete(id);
  }

  /* ======================================================================================================
     Розвідка: виявлення → ідентифікація → оцінка. truth (v) ≠ belief (v.b[side])
     ====================================================================================================== */
  const belOf = (v, sd) => { v.b = v.b || {}; return v.b[sd] || (v.b[sd] = { vis: 0, id: 0, cls: null, flag: null, name: null, owner: null, sanc: null, carry: null, mil: 0.3, conf: 0, src: [], seen: -1, lp: null, trk: 0, err: false, refused: false, ais: null }); };
  function radars(sd) {
    const out = [], t = now();
    for (const k in PORTS) { const P = PORTS[k]; if (P.st === sd) out.push({ p: P.p, r: P.mil ? 230 : 170, l: 2, n: "Берегова РЛС «" + P.n + "»" }); }
    if (sd === "ua") { for (const k of ["const_", "gdansk", "klaip", "tallinn", "helsinki"]) { const P = PORTS[k], st = (FL[P.fl] || {}).st || (FL[P.fl] || {}).px; if (st && DX().rel("ua", st) >= 35) out.push({ p: P.p, r: 150, l: 2, n: "Партнери: " + P.n }); } }
    if (S.sat.until > t && S.sat.p) out.push({ p: S.sat.p, r: S.sat.r, l: 2, n: "Супутникова смуга" });
    return out;
  }
  function detect(v, sd) {
    const t = now(); let l = 0, src = [];
    if (v.ais !== "off") { l = 1; src.push("AIS"); }
    for (const r of radars(sd)) if (hav(r.p, v.pos) <= r.r) { l = Math.max(l, r.l); src.push(r.n); }
    for (const c of S.rec) if (c.side === sd && c.until > t && hav(c.p, v.pos) <= c.r) { l = Math.max(l, c.l); src.push("Розвідувальний БпЛА"); }
    const b = v.b && v.b[sd]; if (b && b.trk > t) { l = Math.max(l, 2); src.push("Супровід"); }
    if (v.mirror) { l = Math.max(l, 2); }
    return { l, src: src.filter((x, i, a) => a.indexOf(x) === i) };
  }
  const milBase = { war: 0.9, patrol: 0.6, res: 0.3, shadow: 0.5, tank: 0.12, bulk: 0.07, cargo: 0.1, cont: 0.04, ferry: 0.02, fish: 0.06 };
  function milProb(v, sd, b) {
    let p = milBase[b.cls || (v.ais !== "off" ? (v.ais === "spoof" ? v.spoof.cls : v.cls) : "cargo")] || 0.2;
    if (v.ais === "off") p += 0.14; if (b.flag === other(sd) || b.owner === other(sd)) p += 0.22; if (b.sanc) p += 0.1 * b.sanc; if (b.carry) p += 0.35; if (b.refused) p += 0.2;
    if (b.id >= 4) p = v.mil || v.carry ? 0.97 : 0.03;
    return clamp(p, 0.01, 0.99);
  }
  /* ідентифікація: acc — шанс правильного результату; помилка підмінює клас/прапор «схожим» і лишається прихованою до розкриття */
  const METH = {
    ais: { n: "AIS-запит", d: "Читає заявлені дані. Судна без AIS не відповідають, а підмінені дані — брехня.", cost: 0, time: 0, lvl: 1 },
    radar: { n: "Профіль РЛС / РТР", d: "Клас за розміром і радіосигналом. Швидко, але плутає схожі класи.", cost: 0, time: 3, lvl: 2, acc: 0.66, conf: 0.5 },
    eo: { n: "Візуально (розвідувальний БпЛА)", d: "Клас, прапор, назва. Відкриває коло огляду. Потрібен порт у межах 400 км.", cost: 0.6, time: 20, lvl: 3, acc: 0.9, conf: 0.82, reach: 400 },
    osint: { n: "OSINT / агентура", d: "Власник, санкції, підозри щодо вантажу. Повільно, не завжди точно.", cost: 0.3, time: 45, lvl: 2, acc: 0.8, conf: 0.7 },
    hail: { n: "Радіозапит і попередження", d: "Чесне судно відповідає. Мовчання й ухиляння — ознака загрози. Фіксує попередження.", cost: 0, time: 6, lvl: 2, reach: 300 },
    inspect: { n: "Досмотр", d: "Повна ідентифікація, але лише біля вашого порту (≤ 90 км) і не для суден вашої сторони.", cost: 0.8, time: 50, lvl: 4, reach: 90 },
    track: { n: "Супровід", d: "Тримає ціль у видимості 3 години, навіть із вимкненим AIS.", cost: 0.2, time: 0, lvl: 2 }
  };
  const confuse = c => { const a = CONF[c]; return a ? pick(a) : c; };
  function identify(v, sd, m) {
    const b = belOf(v, sd), M = METH[m]; b.seen = now(); b.lp = v.pos.slice();
    const add = s => { if (!b.src.includes(s)) b.src.push(s); };
    if (m === "ais") {
      if (v.ais === "off") { return { ok: false, txt: "AIS мовчить — ціль не відповідає" }; }
      const cl = v.ais === "spoof" ? v.spoof : v; b.cls = cl.cls; b.flag = cl.flag; b.name = cl.name; b.id = Math.max(b.id, 1); b.conf = Math.max(b.conf, 0.6); b.ais = { cls: cl.cls, flag: cl.flag, name: cl.name }; add("AIS");
      b.err = b.cls !== v.cls || b.flag !== v.flag; return { ok: true, txt: "AIS: " + CLS[cl.cls].n + " · " + flN(cl.flag) };
    }
    if (m === "hail") {
      b.warned = now(); v.warned = now();
      if (v.mil || v.carry || v.ais !== "on" && v.sanc) { b.refused = rnd() < 0.8; if (b.refused) { v.fled = v.cls === "shadow" || v.carry ? 1 : 0; add("Радіозапит"); return { ok: true, txt: "Судно ігнорує запит" + (v.fled ? " і збільшує хід" : ""), refused: true }; } }
      b.id = Math.max(b.id, 2); b.cls = rnd() < 0.85 ? v.cls : confuse(v.cls); b.flag = v.flag; b.name = v.name; b.conf = Math.max(b.conf, 0.7); b.err = b.cls !== v.cls; add("Радіозапит"); b.refused = false;
      return { ok: true, txt: "Судно відповіло: " + v.name + " · " + flN(v.flag) };
    }
    if (m === "track") { b.trk = now() + 180; add("Супровід"); return { ok: true, txt: "Ціль у супроводі до " + fmtT(b.trk) }; }
    const acc = M.acc * (v.decoy ? 0.78 : 1) * (v.ais === "spoof" ? 0.92 : 1);
    if (m === "osint") {
      const good = rnd() < acc; b.owner = good ? v.owner : (rnd() < 0.5 ? v.flag : "ru"); b.sanc = good ? v.sanc : clamp(v.sanc + (rnd() < 0.5 ? -1 : 1), 0, 3); b.carry = good ? v.carry : !v.carry && rnd() < 0.3;
      b.id = Math.max(b.id, 2); b.conf = Math.max(b.conf, M.conf); if (!b.cls) { b.cls = good ? v.cls : confuse(v.cls); } add("OSINT");
      b.err = b.cls !== v.cls || b.flag && b.flag !== v.flag || b.owner !== v.owner || b.carry !== v.carry && b.carry != null; return { ok: true, txt: "Власник: " + flN(b.owner) + " · санкції: " + b.sanc + (b.carry ? " · підозра на військовий вантаж" : "") };
    }
    if (m === "inspect") {
      b.id = 4; b.cls = v.cls; b.flag = v.flag; b.name = v.name; b.owner = v.owner; b.sanc = v.sanc; b.carry = v.carry; b.conf = 1; b.err = false; b.refused = false; add("Досмотр"); return { ok: true, txt: "Особистість підтверджена" };
    }
    // radar / eo
    const good = rnd() < acc; b.cls = good ? v.cls : confuse(v.cls); if (m === "eo") { b.flag = rnd() < acc + 0.05 ? v.flag : pick(Object.keys(FL).filter(x => x !== v.flag)); b.name = v.name; }
    b.id = Math.max(b.id, M.lvl === 3 ? 3 : 2); b.conf = Math.max(b.conf, M.conf); add(m === "eo" ? "Візуально (БпЛА)" : "Профіль РЛС");
    b.err = b.cls !== v.cls || (b.flag != null && b.flag !== v.flag);
    return { ok: true, txt: CLS[b.cls].n + (b.flag ? " · " + flN(b.flag) : "") };
  }
  /* пасивне оновлення: перша класифікація при виявленні радаром/БпЛА */
  function senseTick() {
    for (const sd of human()) for (const v of S.v.values()) {
      if (v.st === "sunk") continue;
      const d = detect(v, sd), b = belOf(v, sd); b.vis = d.l;
      if (d.l > 0) { b.seen = now(); b.lp = v.pos.slice(); d.src.forEach(s => { if (!b.src.includes(s)) b.src.push(s); }); if (b.src.length > 5) b.src.splice(0, b.src.length - 5); }
      if (d.l >= 3 && b.id < 3) identify(v, sd, "eo");
      else if (d.l >= 2 && b.id < 2) identify(v, sd, "radar");
      else if (d.l === 1 && b.id < 1 && v.ais !== "off") identify(v, sd, "ais");
      if (v.mirror && b.id < 3) { b.id = 3; b.cls = v.cls; b.flag = v.flag; b.name = v.name; b.owner = v.owner; b.conf = 0.9; b.err = false; b.carry = v.carry; b.sanc = 0; }
      b.mil = milProb(v, sd, b);
    }
  }
  const visible = (v, sd) => { const b = v.b && v.b[sd]; return !!b && (b.vis > 0 || (b.id > 0 && now() - b.seen < 90)); };
  const ghost = (v, sd) => { const b = v.b && v.b[sd]; return !!b && b.vis === 0 && b.id > 0 && now() - b.seen < 90; };

  /* ======================================================================================================
     Правовий статус, цивільні ризики, оцінка до удару (за belief) і підсумок після удару (за truth)
     ====================================================================================================== */
  function legal(sd, v) {
    const en = other(sd);
    if (v.aff === sd) return v.mil ? "own" : "ownciv";
    if (v.mil && v.aff === en) return "mil";
    if (v.aff === en && v.carry) return "carry";
    if (v.aff === en && v.flag === en) return "enemyciv";
    if (v.aff === en) return "grey";
    return v.mil ? "natomil" : "neutral";
  }
  const LEG = {
    mil: { n: "Законна військова ціль", base: 0, c: "ok" }, carry: { n: "Судно ворога з військовим вантажем", base: 14, c: "warn" }, enemyciv: { n: "Цивільне судно сторони противника", base: 28, c: "bad" },
    grey: { n: "Судно під третім прапором, власник — противник", base: 22, c: "warn" }, neutral: { n: "Нейтральне цивільне судно", base: 55, c: "bad" }, natomil: { n: "Військове судно третьої держави", base: 70, c: "bad" },
    own: { n: "Власний військовий корабель", base: 18, c: "bad" }, ownciv: { n: "Власне цивільне судно", base: 30, c: "bad" }
  };
  /* оцінка до удару — лише з того, що відомо гравцеві (з розбросом залежно від довіри) */
  function assess(sd, v) {
    const b = belOf(v, sd), conf = b.conf || 0, cls = b.cls || (v.ais === "on" ? v.cls : v.ais === "spoof" && v.spoof ? v.spoof.cls : null), C = cls ? CLS[cls] : null;
    const civ = C ? C.civ : 0.5, mil = b.mil, errRisk = clamp(1 - conf * 0.85 - (b.id >= 4 ? 1 : 0) + (v.decoy && b.id < 4 ? 0.12 : 0) + (v.ais === "off" && b.id < 3 ? 0.08 : 0), 0, 0.95);
    const crewEst = C ? Math.round((C.crew[0] + C.crew[1]) / 2) : "?";
    const reacts = [];
    const fl = b.flag || (v.ais === "on" ? v.flag : null);
    if (fl && FL[fl]) { const x = FL[fl].st || FL[fl].px; if (x && x !== sd && x !== other(sd)) reacts.push(x); }
    return { mil, civ, errRisk, crewEst, spillRisk: C ? C.haz : 0.3, reacts, unknownFlag: !fl, lawfulP: mil * (1 - errRisk * 0.5) };
  }
  const rangeTo = (sd, p) => { let best = null; for (const k in PORTS) { const P = PORTS[k]; if (P.st !== sd) continue; const d = hav(P.p, p); if (!best || d < best.d) best = { d, port: k }; } return best || { d: Infinity, port: null }; };
  const WPN = {
    drone: { n: { ua: "Морський дрон", ru: "Ударний БпЛА" }, cost: 0.25, reach: 360, spd: 22, hit: 0.62, sink: 0.32, i: "◉" },
    missile: { n: { ua: "Ракета «Нептун» / Flamingo", ru: "Ракета «Калібр» / «Оніх»" }, cost: 1.4, reach: 780, spd: 85, hit: 0.8, sink: 0.5, i: "➤" }
  };
  /* БЕК (морський дрон УА) ходить ЛИШЕ по воді: маршрут будується по водній сітці гри (BV3.seaRoute), а не по прямій */
  const pathLen = r => { let s = 0; for (let i = 1; i < r.length; i++) s += hav(r[i - 1], r[i]); return s; };
  const RC = new Map();
  function waterRoute(a, b) {
    const B = window.BV3, G = window.BV_GEO; if (!B || !B.seaRoute || !G || !G.sea) return null;
    const key = [a[0], a[1], b[0], b[1]].map(x => Math.round(x * 25)).join(",") + "|" + Math.floor(now() / 4); if (RC.has(key)) return RC.get(key);
    let out = null;
    try { if (G.sea(b)) { const r = B.seaRoute(a, b); if (r && r.length >= 2 && hav(r[r.length - 1], b) < 30 && r.every(q => G.sea(q))) out = r.map(q => q.slice()); } } catch (e) { out = null; }
    if (RC.size > 300) RC.clear(); RC.set(key, out); return out;
  }
  function bekPlan(sd, pos) {      // від найближчого свого порту до цілі — водою
    const r = rangeTo(sd, pos); if (!r.port) return null; const P = PORTS[r.port]; const q = waterRoute(P.p, pos); if (!q || hav(q[0], P.p) > 40) return null;
    q[0] = q[0].slice(); return { route: q, len: pathLen(q), port: r.port };
  }
  function canStrike(sd, v, w) {
    const W = WPN[w]; if (!isHuman(sd)) return { ok: false, why: "не ваша сторона" };
    if (v.mirror) return { ok: false, why: "Цей корабель веде бойовий модуль — використайте морський дрон на мапі бою" };
    if (!["sail", "burn"].includes(v.st)) return { ok: false, why: "судно вже виведено з ладу" };
    if (DX().truce()) return { ok: false, why: "перемир'я — удари заборонені" };
    const r = rangeTo(sd, v.pos); if (r.d > W.reach) return { ok: false, why: `поза радіусом (${Math.round(r.d === Infinity ? 9999 : r.d)} км > ${W.reach})` };
    let plan = null;
    if (w === "drone" && sd === "ua") {      // БЕК: лише вода
      if (v.sea !== "black") return { ok: false, why: "БЕК діє лише на воді Чорного моря" };
      plan = bekPlan(sd, v.pos); if (!plan) return { ok: false, why: "немає водного маршруту до цілі" };
      if (plan.len > W.reach) return { ok: false, why: `водний шлях ${Math.round(plan.len)} км > ${W.reach}` };
    }
    const b = belOf(v, sd); if (b.vis < 2) return { ok: false, why: "ціль не виявлена радіолокаційно — потрібне наведення" };
    if (money(sd) < W.cost) return { ok: false, why: "немає коштів (" + fm(W.cost) + " млн $)" };
    if (S.jobs.some(j => j.k === "strike" && j.vid === v.id && j.sd === sd)) return { ok: false, why: "удар уже в польоті" };
    return { ok: true, d: plan ? plan.len : r.d, port: r.port, plan };
  }
  function canMethod(sd, v, m) {
    const M = METH[m], b = belOf(v, sd);
    if (v.mirror && m !== "track") return { ok: false, why: "ціль під контролем бойового модуля" };
    if (m === "ais" || m === "track") return { ok: true };
    if (m === "radar") return b.vis >= 2 ? { ok: true } : { ok: false, why: "поза зоною РЛС" };
    if (m === "osint") return b.vis >= 1 ? { ok: true } : { ok: false, why: "ціль не виявлена" };
    if (money(sd) < M.cost) return { ok: false, why: "немає коштів" };
    if (S.jobs.some(j => j.vid === v.id && j.sd === sd && j.k === m)) return { ok: false, why: "виконується" };
    const r = rangeTo(sd, v.pos);
    if (M.reach && r.d > M.reach) return { ok: false, why: `порт далі ${M.reach} км` };
    if (m === "inspect" && v.aff === sd) return { ok: false, why: "судно вашої сторони" };
    if (b.vis < 1) return { ok: false, why: "ціль не виявлена" };
    return { ok: true };
  }
  function order(sd, vid, m) {
    const v = S.v.get(vid); if (!v) return null; const c = canMethod(sd, v, m); if (!c.ok) { toast("Недоступно: " + c.why, "warn"); return null; }
    const M = METH[m]; if (M.cost) pay(sd, M.cost);
    if (!M.time) { const r = identify(v, sd, m); bump(); toast(M.n + ": " + r.txt, r.ok ? "info" : "warn"); return r; }
    S.jobs.push({ id: S.nid++, k: m, sd, vid, due: now() + M.time, t0: now() });
    if (m === "eo") S.rec.push({ side: sd, p: v.pos.slice(), r: 55, l: 3, until: now() + M.time + 25 });
    toast(M.n + ": виконується (" + M.time + " хв гри)", "info"); bump(); return { ok: true, pending: true };
  }

  /* ======================================================================================================
     Удар → результат → інцидент → наслідки
     ====================================================================================================== */
  function strikeOrder(sd, vid, w) {
    const v = S.v.get(vid); if (!v) return null; const c = canStrike(sd, v, w); if (!c.ok) { toast("Удар неможливий: " + c.why, "warn"); return null; }
    const W = WPN[w]; pay(sd, W.cost);
    const eta = clamp(c.d / W.spd, w === "drone" ? 8 : 3, w === "drone" ? 40 : 14);
    const b = belOf(v, sd);
    const j = { id: S.nid++, k: "strike", sd, vid, w, from: c.plan ? c.plan.route[0].slice() : c.port && PORTS[c.port] ? PORTS[c.port].p.slice() : v.pos.slice(), path: c.plan ? c.plan.route : null, pos: c.plan ? c.plan.route[0].slice() : null, i: 1, rp: now(), spd: c.plan ? c.d / eta : 0, due: now() + eta, t0: now(), snap: { cls: b.cls, flag: b.flag, mil: b.mil, conf: b.conf, id: b.id, warned: b.warned || 0, refused: !!b.refused, src: b.src.slice(), name: b.name } };
    S.jobs.push(j); S.stat[sd].strikes++; toast(`${W.n[sd]} → «${b.name || "ціль"}»: попадання через ~${Math.round(eta)} хв`, "info"); bump(); fxLaunch(sd, v, w); return j;
  }
  function resolveStrike(sd, v, w, snap, ai) {
    const W = WPN[w], C = CLS[v.cls], t = now(); const st = legal(sd, v);
    let res = "miss";
    const dfn = C.def ? (w === "missile" ? C.def : C.dd) : 0;
    if (v.st === "sunk") return null;
    if (rnd() < dfn) res = "intercepted";
    else if (rnd() < W.hit * (v.fled ? 0.85 : 1) * (v.cls === "fish" ? 0.9 : 1)) {
      const sk = W.sink * (C.mil ? 0.8 : 1) * (v.cls === "ferry" ? 1.1 : 1) * (v.cls === "fish" ? 1.4 : 1) * (v.dmg > 0.4 ? 1.5 : 1), r = rnd();
      res = r < sk ? "sunk" : r < sk + (1 - sk) * 0.55 ? "crippled" : "damaged";
    }
    const k = res === "sunk" ? 0.38 : res === "crippled" ? 0.14 : res === "damaged" ? 0.03 : 0;
    const warned = snap && snap.warned && !snap.refused;
    let killed = Math.round((v.crew + (v.pax || 0) * 0.5) * k * rr(0.6, 1.25) * (warned && !v.mil ? 0.6 : 1)), wounded = Math.round(killed * rr(0.6, 1.6)); if (res === "miss" || res === "intercepted") { killed = 0; wounded = 0; }
    const spill = (res === "sunk" || res === "crippled") && (v.cls === "tank" || v.cls === "shadow") ? +(v.haz * (res === "sunk" ? 1 : 0.4)).toFixed(2) : 0;
    if (res === "sunk") { v.st = "sunk"; v.dmg = 1; v.dead = t; } else if (res === "crippled") { v.st = "burn"; v.dmg = Math.max(v.dmg, 0.7); } else if (res === "damaged") v.dmg = Math.max(v.dmg, 0.35);
    // помилка розвідки: що гравець вважав vs правда
    const err = { kind: "none", txt: "" };
    if (snap) {
      const believedMil = snap.mil >= 0.5, truthMil = v.mil || v.carry;
      if (snap.cls && snap.cls !== v.cls) { err.kind = "wrong_cls"; err.txt = `Розпізнано як «${CLS[snap.cls].n}», насправді — «${CLS[v.cls].n}»`; }
      if (v.ais === "spoof" && snap.src && snap.src.includes("AIS") && snap.id < 3 && snap.cls !== v.cls) { err.kind = "spoof"; err.txt = "Підмінені дані AIS (чужий прапор/клас) ввели в оману"; }
      if (believedMil && !truthMil) { err.kind = "false_mil"; err.txt = "Ціль оцінено як військову (" + Math.round(snap.mil * 100) + "%), але вона цивільна"; }
      else if (!believedMil && truthMil && err.kind === "none" && snap.id < 3) { err.kind = "missed_mil"; err.txt = "Військову ціль сприйнято як цивільну"; }
      if (snap.flag && snap.flag !== v.flag && err.kind === "none") { err.kind = "wrong_flag"; err.txt = `Прапор визначено як ${flN(snap.flag)}, насправді — ${flN(v.flag)}`; }
    }
    const inc = mkInc({ kind: "strike", by: sd, v, w, res, st, killed, wounded, spill, snap: snap || null, err, ai: !!ai, pos: v.pos.slice(), warned: !!warned });
    return inc;
  }
  /* розрахунок наслідків — одна точка для всіх видів інцидентів */
  function mkInc(o) {
    const t = now(), v = o.v, C = CLS[v.cls]; const sd = o.by;
    const inc = { id: S.nid++, t, kind: o.kind, by: sd, sea: v.sea, pos: o.pos, w: o.w || null, res: o.res, st: o.st, killed: o.killed || 0, wounded: o.wounded || 0, spill: o.spill || 0, ai: !!o.ai, warned: !!o.warned,
      err: o.err || { kind: "none", txt: "" }, snap: o.snap, read: false, fx: [], inv: 0, why: o.why || "", sev: 0,
      v: { vid: v.id, name: v.name, cls: v.cls, flag: v.flag, owner: v.owner, aff: v.aff, crew: v.crew, pax: v.pax, haz: +v.haz.toFixed(2), val: v.val, cargo: v.cargo, sanc: v.sanc, mil: v.mil, carry: v.carry, ais: v.ais, spoof: v.spoof, mirror: !!v.mirror } };
    const hit = !["miss", "intercepted"].includes(inc.res);
    let sev0 = o.kind === "strike" ? (LEG[o.st] ? LEG[o.st].base : 20) : (o.kind === "mine" ? 8 : o.kind === "cable" ? 14 : 6);
    if (o.kind === "strike" && (v.cls === "ferry" || v.cls === "fish") && !v.mil && !v.carry) sev0 = Math.max(sev0, 62);      /* 7.76 */
    let sev = 0;
    if (hit || o.kind !== "strike") {
      sev = sev0 + Math.min(32, inc.killed * 2.6 * (o.st === "mil" ? 0 : v.mil ? 0.1 : 1)) + inc.spill * 20 + (inc.res === "sunk" && o.st !== "mil" ? 8 : 0);
      if (inc.err.kind === "false_mil" || inc.err.kind === "spoof" || inc.err.kind === "wrong_cls") sev += 10;
      if (inc.warned) sev -= 5; if (o.st === "grey" && v.sanc >= 2) sev -= 6; if (o.st === "mil") sev = Math.max(0, sev - 2);
    } else { sev = Math.round(sev0 * 0.25); }           // промах/перехоплення: сам факт нападу
    inc.sev = Math.round(clamp(sev, 0, 100));
    inc.fx = effects(inc, o, hit);
    if (inc.sev >= 22 || (inc.killed >= 3 && !v.mil && o.st !== "mil") || (["neutral", "natomil"].includes(o.st) && hit) || o.kind === "cable") openInv(inc, o);
    S.inc.push(inc); if (S.inc.length > 90) S.inc.shift();
    const hs = human(); if (hs.includes(sd) || hs.includes(v.aff) || inc.inv || hs.length === 0) { S.unread++; inc.inv_for = true; }
    stats(inc, o, hit); notify(inc, o); fxIncident(inc); bump(); return inc;
  }
  function effects(inc, o, hit) {
    const X = DX(), fx = [], sd = o.by, v = o.v, st = o.st, sev = inc.sev;
    const add = (k, txt, d, id) => fx.push({ k, txt, d: d == null ? null : d, id: id || null });
    const rel = (a, b, d, label) => { if (!a || !b || a === b || !d) return; const r0 = X.rel(a, b); X.addR(a, b, d); add("rel", label || ((X.nm(a)) + " ↔ " + X.nm(b)), Math.round((X.rel(a, b) - r0) * 10) / 10, a === sd ? b : a); };
    const attacker = sd === "ua" || sd === "ru" ? sd : null;
    if (o.kind === "strike" && attacker && hit && sev > 3) {
      // держави, яких це зачіпає: прапор, власник, берег (розлив)
      const targets = new Map(), done = new Set();
      const addT = (code, w) => { const f = FL[code]; if (!f) return; const x = f.st || f.px; if (!x || x === attacker) return; const ww = (f.st ? 1 : (f.w || 0.5)) * w; targets.set(x, Math.max(targets.get(x) || 0, ww)); };
      if (st !== "mil" && st !== "own" && st !== "ownciv") { addT(v.flag, 1); if (v.owner !== v.flag) addT(v.owner, 0.55); }
      if (v.aff === other(attacker) && st !== "mil") { /* противник — війна вже є, змін майже нема */ }
      if (inc.spill > 0.3) { const near = nearestCoast(o.pos); near.forEach(c => addT(c, 0.45)); }
      for (const [x, w] of targets) {
        if (x === other(attacker) && (st === "enemyciv" || st === "grey" || st === "carry")) continue;
        const prox = X.allies(x).includes(attacker) || X.rel(x, attacker) > 60 ? 0.55 : 1;
        const d = -Math.round(clamp(sev * 0.3 * w * prox, 1, 26)); rel(attacker, x, d, `${X.flag(x)} ${X.nm(x)}: відносини з вами`);
        done.add(x); if (sev >= 35) for (const y of X.allies(x).slice(0, 3)) if (y !== attacker && y !== other(attacker) && !targets.has(y) && !done.has(y)) { done.add(y); rel(attacker, y, -Math.round(clamp(sev * 0.06, 1, 5)), `${X.flag(y)} ${X.nm(y)} (союзник): відносини з вами`); }
      }
      // санкціонована ціль: партнери санкційного режиму ставляться прихильніше
      if (st === "grey" && v.sanc >= 1) for (const x of ["us", "gb", "de", "fr", "pl"]) if (X.sanc(x, other(attacker)) > 0 && attacker === "ua") rel(attacker, x, +1, `${X.flag(x)} ${X.nm(x)}: санкційна ціль`);
      if (st === "neutral" || st === "natomil") for (const x of ["ua", "ru"]) { /* вторинний ефект: противник користується */ if (x !== attacker) { const k = X.ids().filter(z => z !== attacker && z !== x && FL[v.flag] && (FL[v.flag].st === z || FL[v.flag].px === z)); k.forEach(z => rel(x, z, +Math.round(sev * 0.05), `${X.flag(z)} ${X.nm(z)}: симпатії до противника`)); } }
      // репутація
      const dr = st === "mil" ? (inc.err.kind === "none" ? 0 : -1) : -Math.round(clamp(sev * 0.14, 1, 14));
      if (dr) { X.addRep(attacker, dr); add("rep", "Репутація " + X.nm(attacker), dr); }
      else if (st === "mil") { /* законний удар: нейтральна реакція */ }
    }
    // власні втрати й економіка
    const econ = [], sdE = o.kind === "strike" ? attacker : null;
    if (hit && v.val) {
      const loss = +(v.val * (inc.res === "sunk" ? 1 : inc.res === "crippled" ? 0.5 : 0.2)).toFixed(1);
      inc.loss = loss;
      if (o.kind === "strike" && v.aff && v.aff !== "n") { mod(v.aff, v.cls === "war" || v.cls === "patrol" ? 0.995 : v.cls === "tank" || v.cls === "shadow" ? 0.975 : 0.985, 360, "Втрата судна: " + v.name); add("eco", `Економіка ${X.nm(v.aff)}: втрата ${fm(loss)} млн $ і перебої морської торгівлі`, null, v.aff); }
      if (st === "own" || st === "ownciv") { pay(attacker, loss * 0.2); add("eco", `Збитки власні: −${fm(loss * 0.2)} млн $`, -loss * 0.2, attacker); }
      // компенсація
      if (o.kind === "strike" && ["neutral", "natomil", "enemyciv"].includes(st) && attacker && st !== "enemyciv") { inc.comp = +(loss * 0.6 + inc.killed * 0.2).toFixed(1); add("eco", `Потенційна компенсація власнику: ${fm(inc.comp)} млн $ (за вердиктом розслідування)`, null); }
    }
    // страхування воєнних ризиків і порт
    const ik = clamp(sev / 380 + (inc.spill ? 0.04 : 0), 0, 0.22); if (ik > 0.004) { S.ins[v.sea] = clamp(S.ins[v.sea] + ik, 0, 1); add("eco", `Страхування воєнних ризиків (${SEAS[v.sea]}): +${Math.round(ik * 100)} п. п.`, null); }
    if ((inc.res === "sunk" || inc.spill > 0.3) && o.kind !== "cable") { const pn = nearestPort(o.pos, v.sea); if (pn) { S.closed[pn] = now() + (inc.spill > 0.5 ? 240 : 120); add("eco", `Порт «${PORTS[pn].n}» закрито на ${inc.spill > 0.5 ? 4 : 2} год (рятувальна операція${inc.spill ? ", розлив" : ""})`, null); } }
    if (inc.spill > 0.05) add("env", `Розлив нафтопродуктів: ${Math.round(inc.spill * 100)} % від максимуму`, null);
    if (inc.killed) add("cas", `Загиблі: ${inc.killed}, поранені: ${inc.wounded}`, null);
    if (o.kind === "strike" && hit && (v.cls === "ferry" || v.cls === "fish") && !v.mil && !v.carry) add("info", "Судно під захистом права збройних конфліктів на морі (пасажирське без військового вантажу / прибережне рибальство): удар — тяжке порушення", null);      /* 7.76 */
    if (inc.err.kind !== "none" && o.kind === "strike") add("err", "Помилка розвідки: " + inc.err.txt, null);
    // події без нападу
    if (o.kind === "mine") { if (v.flag) { const f = FL[v.flag], x = f && (f.st || f.px); if (x) { /* без звинувачень */ } } add("info", "Дрейфуюча міна: винуватця не встановлено — обидві сторони звинувачують одна одну", null); X.addRep("ua", 0); }
    if (o.kind === "cable") { const f = FL[v.flag], x = f && f.st; add("info", "Підозрюваний: " + v.name + " (" + flN(v.flag) + ", власник " + flN(v.owner) + ")", null); if (v.aff === "ru" && isHuman("ru")) { rel("ru", "pl", -2, "🇵🇱 Польща: відносини з вами"); rel("ru", "de", -2, "🇩🇪 Німеччина: відносини з вами"); X.addRep("ru", -2); add("rep", "Репутація Росія", -2); } }
    return fx;
  }
  function nearestPort(p, sea) { let b = null, bd = 1e9; for (const k in PORTS) { if (PORTS[k].sea !== sea) continue; const d = hav(PORTS[k].p, p); if (d < bd) { bd = d; b = k; } } return bd < 260 ? b : null; }
  function nearestCoast(p) { const arr = []; for (const k in PORTS) { const d = hav(PORTS[k].p, p); if (d < 180 && PORTS[k].fl) arr.push([d, PORTS[k].fl]); } arr.sort((a, b) => a[0] - b[0]); return arr.slice(0, 2).map(x => x[1]); }
  function mod(sd, k, mins, why) { S.mods.push({ sd, k, until: now() + mins, why }); }
  function incK(sd) {
    const t = now(); let k = 1; S.mods = S.mods.filter(m => m.until > t);
    const mk = {}; for (const m of S.mods) mk[m.sd] = (mk[m.sd] || 1) * m.k;
    k *= clamp(mk[sd] || 1, 0.85, 1.02);
    const sh = sd === "ru" ? { black: 0.07, baltic: 0.11 } : sd === "ua" ? { black: 0.12, baltic: 0 } : { black: 0, baltic: 0 };
    k *= 1 - S.ins.black * sh.black - S.ins.baltic * sh.baltic;
    return clamp(k, 0.8, 1.02);
  }
  function stats(inc, o, hit) {
    const s = S.stat[inc.by]; if (!s || o.kind !== "strike") return;
    if (hit) { if (inc.res === "sunk") s.sunk++; if (inc.st === "mil") s.lawful++; else if (["neutral", "natomil"].includes(inc.st)) s.neutral++; else s.civil++; }
    if (inc.err.kind !== "none") s.err++; s.cas += inc.killed; s.spill += inc.spill ? 1 : 0;
  }
  /* ----- міжнародні розслідування ----- */
  function openInv(inc, o) {
    const X = DX(), attacker = inc.by === "ua" || inc.by === "ru" ? inc.by : null;
    let r = inc.sev + (inc.kind === "cable" ? 28 + (inc.v.ais === "off" ? 10 : 0) : 0) + (inc.err.kind !== "none" && inc.err.kind !== "missed_mil" ? 8 : 0) + (inc.killed ? Math.min(14, inc.killed) : 0);
    if (inc.st === "mil") r -= 20; if (inc.warned) r -= 10; if (inc.snap && inc.snap.id >= 3) r -= 4; if (inc.v.ais === "off") r -= 4;
    const ev = { r: Math.round(r), hid: false };
    const body = inc.sev >= 55 ? "Комісія ООН / ІМО" : inc.sev >= 35 ? "Міжнародна комісія з морських інцидентів" : "Група ІМО з розслідування";
    const iv = { id: S.nid++, inc: inc.id, t0: now(), due: now() + Math.round(rr(300, 840) * (inc.sev >= 55 ? 1.3 : 1)), by: attacker, body, r: ev.r, coop: "none", paid: 0, state: "open", verdict: null, v: null, log: [{ t: now(), x: "Розслідування відкрито: " + body }], hid: 0 };
    if (!attacker) { iv.by = null; iv.r = Math.round(r * 0.6); }
    S.inv.push(iv); inc.inv = iv.id; S.stat[inc.by] && S.stat[inc.by].inv++;
    inc.fx.push({ k: "inv", txt: `${body}: розслідування триватиме до ${fmtT(iv.due)}`, d: null });
  }
  function coop(ivId, how) {
    const iv = S.inv.find(x => x.id === ivId); if (!iv || iv.state !== "open") return; const inc = S.inc.find(x => x.id === iv.inc); if (!inc) return;
    if (how === "open" && iv.coop === "none") {
      iv.coop = "open"; const lawful = inc.st === "mil" || inc.warned; iv.r += lawful ? -12 : +5; iv.due -= 120; iv.log.push({ t: now(), x: lawful ? "Передано журнали й записи — підтверджено законність дій (−12 до оцінки провини)" : "Передано журнали — відкрито й помилки розвідки (+5 до оцінки провини), але розслідування прискорене" });
    } else if (how === "deny" && iv.coop === "none") {
      iv.coop = "deny"; iv.r -= 8; iv.due += 240; iv.hid = 1; iv.log.push({ t: now(), x: "Дані засекречено: оцінка провини −8, але розслідування триватиме довше; ризик викриття" });
    } else if (how === "pay" && !iv.paid) {
      const inc2 = inc, sum = +(((inc2.comp || 0.5) + inc2.killed * 0.15)).toFixed(1); const att = iv.by; if (!att) return;
      if (money(att) < sum) return toast("Не вистачає коштів на компенсацію: " + fm(sum) + " млн $", "warn");
      pay(att, sum); iv.paid = sum; iv.r -= 10; S.stat[att].paid += sum; const f = FL[inc2.v.flag], x = f && (f.st || f.px); if (x) DX().addR(att, x, 3); iv.log.push({ t: now(), x: `Виплачено компенсацію ${fm(sum)} млн $ (−10 до оцінки провини${x ? ", відносини з " + DX().nm(x) + " +3" : ""})` });
    }
    bump();
  }
  function closeInv(iv) {
    const X = DX(), inc = S.inc.find(x => x.id === iv.inc); iv.state = "closed"; if (!inc) return;
    let r = iv.r; if (iv.hid && inc.st !== "mil" && rnd() < 0.35) { r += 20; iv.log.push({ t: now(), x: "Розкрито спробу приховати дані: +20 до оцінки провини" }); }
    const att = iv.by, eff = [];
    if (!att) {
      iv.verdict = "unknown"; iv.v = "Винуватця не встановлено"; iv.log.push({ t: now(), x: "Вердикт: винуватця не встановлено" }); eff.push("Страхові премії залишаються підвищеними");
    } else if (r >= 55) {
      iv.verdict = "guilty"; iv.v = "Відповідальність підтверджено"; const dr = -Math.round(clamp(r / 9, 2, 10)); X.addRep(att, dr); eff.push(`Репутація ${X.nm(att)} ${dr}`);
      const f = FL[inc.v.flag], x = f && (f.st || f.px); if (x && x !== att) { X.addR(att, x, -Math.round(clamp(r / 10, 2, 8))); eff.push(`Відносини з ${X.nm(x)} ${-Math.round(clamp(r / 10, 2, 8))}`); }
      let n = 0; for (const c of X.ids()) { if (c === att || c === other(att) || n >= 2) continue; const cs = X.info(c); if (!cs || cs.eco < 3) continue; if (X.rel(c, att) < 25 && X.sanc(c, att) < 3 && rnd() < clamp((r - 40) / 90, 0.05, 0.45)) { X.sanction(c, att, X.sanc(c, att) + 1); eff.push(`${X.flag(c)} ${X.nm(c)} вводить/посилює санкції`); S.stat[att].sanc++; n++; } }
      const comp = iv.paid ? 0 : +((inc.comp || 0.5) * 1.5).toFixed(1); if (comp > 0) { const E = eco(att); if (E) { pay(att, comp); S.stat[att].paid += comp; } eff.push(`Компенсація власнику: ${fm(comp)} млн $`); }
      S.stat[att].guilty++; iv.log.push({ t: now(), x: "Вердикт: відповідальність підтверджено" });
    } else if (r >= 30) {
      iv.verdict = "disputed"; iv.v = "Недостатньо доказів / спір"; X.addRep(att, -2); eff.push(`Репутація ${X.nm(att)} −2`); const f = FL[inc.v.flag], x = f && (f.st || f.px); if (x && x !== att) { X.addR(att, x, -2); eff.push(`Відносини з ${X.nm(x)} −2`); } iv.log.push({ t: now(), x: "Вердикт: недостатньо доказів, питання лишається відкритим" });
    } else {
      iv.verdict = "cleared"; iv.v = "Дії визнано правомірними"; X.addRep(att, 1); eff.push(`Репутація ${X.nm(att)} +1`); S.stat[att].cleared++; iv.log.push({ t: now(), x: "Вердикт: дії визнано правомірними" });
    }
    iv.eff = eff; inc.fx.push({ k: "inv", txt: `Вердикт розслідування: ${iv.v}`, d: null }); eff.forEach(e => inc.fx.push({ k: "verd", txt: e, d: null }));
    X.log(`⚓ Розслідування інциденту «${inc.v.name}»: ${iv.v}` + (eff.length ? " · " + eff.join(" · ") : ""), iv.verdict === "guilty" ? "bad" : "info", att ? [att] : [], true);
    S.unread++; inc.inv_for = true; inc.read = false; bump();
    if (isHuman(att) || (inc.v.aff && isHuman(inc.v.aff))) { toast(`⚓ Розслідування «${inc.v.name}»: ${iv.v}`, iv.verdict === "guilty" ? "warn" : "info"); }
  }
  function notify(inc, o) {
    const X = DX(), vs = inc.v, nm = `«${vs.name}»`, ws = o.w ? WPN[o.w].n[inc.by] : "";
    const RES = { miss: "промах", intercepted: "перехоплено", damaged: "пошкоджено", crippled: "важке ураження", sunk: "потоплено" };
    let msg;
    if (o.kind === "mine") msg = `⚓ Міна: ${nm} (${flN(vs.flag)}) — ${RES[inc.res] || "підрив"}`;
    else if (o.kind === "cable") msg = `⚓ Пошкоджено підводний кабель у районі ${SEAS[inc.sea]}: підозрюване судно ${nm} (${flN(vs.flag)})`;
    else msg = `⚓ ${X.nm(inc.by)}: ${ws || "атака"} → ${CLS[vs.cls].n.toLowerCase()} ${nm} ${FL[vs.flag] ? FL[vs.flag].f : ""} — ${RES[inc.res]}` + (inc.killed ? `, загиблих: ${inc.killed}` : "");
    const hs = human(), involved = hs.includes(inc.by) || hs.includes(vs.aff);
    X.log(msg, inc.sev >= 22 ? "bad" : "info", ["ua", "ru"].includes(inc.by) ? [inc.by] : [], false);
    if (involved || inc.sev >= 25) toast(msg, inc.sev >= 22 ? "warn" : "info");
    if (involved && inc.sev >= 12 && inc.kind === "strike") { try { setTimeout(() => openInc(inc.id), 600); } catch (e) { /* */ } }
    if (involved && (inc.res === "sunk" || inc.killed >= 3)) { try { const b = $("seaZb"); if (b) { b.classList.add("alert"); setTimeout(() => b.classList.remove("alert"), 4000); } } catch (e) { /* */ } }
  }

  /* ----- ІІ і випадкові події ----- */
  function aiTick() {
    const t = now(), X = DX();
    if (!X.ai() || X.truce()) return;
    for (const sd of ["ua", "ru"]) {
      if (isHuman(sd) || S.ai[sd] > t) continue; S.ai[sd] = t + ri(160, 330);
      const cand = [...S.v.values()].filter(v => !v.mirror && v.st === "sail" && v.aff !== sd && rangeTo(sd, v.pos).d <= 520);
      if (!cand.length) continue;
      // ІІ «бачить» крізь власні помилки: плутає за прапором/класом
      const sdPerceive = v => { let p = CLS[v.cls].mil ? 0.9 : 0.1; if (v.aff === other(sd)) p += 0.35; if (v.ais === "off") p += 0.1; if (rnd() < 0.2) p = 1 - p; return p; };
      cand.sort((a, b) => sdPerceive(b) - sdPerceive(a)); const v = cand[0], pm = sdPerceive(v);
      if (pm < 0.55) continue; const w = rnd() < 0.55 && (sd !== "ua" || (v.sea === "black" && bekPlan("ua", v.pos))) ? "drone" : "missile";
      const snap = { cls: rnd() < 0.8 ? v.cls : confuse(v.cls), flag: v.flag, mil: pm, conf: 0.5, id: 2, warned: 0, refused: false, src: ["Профіль РЛС"], name: v.name };
      resolveStrike(sd, v, w, snap, true);
    }
    if (t >= S.ev.mine) {
      S.ev.mine = t + ri(300, 620); const c = [...S.v.values()].filter(v => !v.mirror && v.sea === "black" && v.st === "sail" && !CLS[v.cls].mil);
      if (c.length) { const v = pick(c), dm = rnd() < 0.5 ? 0.35 : 0.8; v.dmg = Math.max(v.dmg, dm); if (dm > 0.7) { v.st = "burn"; } const killed = dm > 0.7 ? Math.round(v.crew * rr(0.1, 0.35)) : 0; mkInc({ kind: "mine", by: "?", v, res: dm > 0.7 ? "crippled" : "damaged", st: "neutral", killed, wounded: killed, spill: v.haz > 0.6 && dm > 0.7 ? 0.3 : 0, pos: v.pos.slice(), why: "Дрейфуюча міна" }); }
    }
    if (t >= S.ev.cable) {
      S.ev.cable = t + ri(600, 1100); const c = [...S.v.values()].filter(v => !v.mirror && v.sea === "baltic" && v.st === "sail" && ["shadow", "res", "cargo", "bulk"].includes(v.cls) && (v.aff === "ru" || v.cls === "res"));
      if (c.length) { const v = pick(c); v.suspect = true; v.ais = v.ais === "on" && rnd() < 0.5 ? "off" : v.ais; const iv = mkInc({ kind: "cable", by: v.aff === "ru" ? "ru" : "?", v, res: "damaged", st: "neutral", pos: v.pos.slice(), why: "Пошкодження кабеля якорем" }); }
    }
  }
  /* ----- передача даних партнерам (затримання судна санкційного режиму) ----- */
  function canReport(sd, v) {
    if (v.mirror) return { ok: false, why: "ціль під контролем бойового модуля" };
    const b = belOf(v, sd); if (sd !== "ua") return { ok: false, why: "санкційної підстави немає" };
    if (v.sea !== "baltic") return { ok: false, why: "лише в районах партнерів (Балтика)" };
    if (b.id < 2) return { ok: false, why: "ціль не ідентифікована" };
    if (v.st !== "sail") return { ok: false, why: "ціль вже не рухається" };
    if (S.jobs.some(j => j.k === "report" && j.vid === v.id)) return { ok: false, why: "запит розглядається" };
    return { ok: true };
  }
  function report(sd, vid) {
    const v = S.v.get(vid); if (!v) return; const c = canReport(sd, v); if (!c.ok) return toast("Недоступно: " + c.why, "warn");
    S.jobs.push({ id: S.nid++, k: "report", sd, vid, due: now() + 35, t0: now() }); toast("Дані передано партнерам: рішення про затримання очікується (~35 хв)", "info"); bump();
  }
  function reportDone(j) {
    const X = DX(), v = S.v.get(j.vid); if (!v || v.st !== "sail") return;
    const b = belOf(v, j.sd), cand = ["pl", "de", "fr", "gb"].filter(x => X.rel("ua", x) >= 30), basis = (v.sanc >= 1 || v.suspect || v.carry) && (b.owner != null || b.sanc != null || v.suspect);
    let p = basis ? 0.35 + (b.conf || 0) * 0.35 + (v.sanc || 0) * 0.07 + (v.suspect ? 0.15 : 0) : 0.06; p *= cand.length ? 1 : 0.2;
    if (rnd() < p) {
      v.st = "detained"; v.dead = now(); const who = pick(cand.length ? cand : ["pl"]); X.addR("ua", who, +2); X.addRep("ua", +1); mod("ru", 0.99, 240, "Затримання судна");
      const iv = null; const inc = { id: S.nid++, t: now(), kind: "detain", by: who, sea: v.sea, pos: v.pos.slice(), res: "detained", st: "grey", killed: 0, wounded: 0, spill: 0, err: { kind: "none", txt: "" }, snap: null, read: false, fx: [{ k: "rel", txt: `${X.flag(who)} ${X.nm(who)}: відносини з вами`, d: 2 }, { k: "rep", txt: "Репутація Україна", d: 1 }, { k: "eco", txt: "Російський експорт: тимчасові перебої", d: null }], inv: 0, ai: false, sev: 0, v: { vid: v.id, name: v.name, cls: v.cls, flag: v.flag, owner: v.owner, aff: v.aff, crew: v.crew, pax: 0, haz: v.haz, val: v.val, cargo: v.cargo, sanc: v.sanc, mil: v.mil, carry: v.carry, ais: v.ais, spoof: v.spoof }, inv_for: true };
      S.inc.push(inc); S.unread++; toast(`⚓ ${X.nm(who)} затримала ${CLS[v.cls].n.toLowerCase()} «${v.name}» за даними розвідки`, "info"); X.log(`⚓ ${X.nm(who)} затримала «${v.name}» (${flN(v.flag)}) за даними України`, "good", ["ua"], false); S.stat.ua.lawful++;
    } else { toast(`Партнери не затримали «${v.name}»: недостатньо підстав`, "warn"); }
    bump();
  }
  /* ----- затримання вашим досмотром ----- */
  function inspectDone(j) {
    const X = DX(), v = S.v.get(j.vid); if (!v || !["sail", "burn"].includes(v.st)) return; const r = identify(v, j.sd, "inspect");
    const b = belOf(v, j.sd);
    if (v.carry || v.sanc >= 1) { v.st = "detained"; v.dead = now(); X.addRep(j.sd, +1); const st = (FL[v.flag] || {}).st; toast(`Досмотр «${v.name}»: ${v.carry ? "знайдено військовий вантаж, судно затримано" : "підтверджено санкції, судно затримано"}`, "info"); X.log(`⚓ ${X.nm(j.sd)}: досмотр «${v.name}» — судно затримано`, "good", [j.sd], false); S.stat[j.sd].lawful++; }
    else if (v.aff !== j.sd) { const f = FL[v.flag], x = f && (f.st || f.px); if (x && x !== j.sd && x !== other(j.sd)) { X.addR(j.sd, x, -2); X.addRep(j.sd, -1); toast(`Досмотр «${v.name}» нічого не виявив: ${X.nm(x)} скаржиться на безпідставну затримку (−2)`, "warn"); } else toast(`Досмотр «${v.name}»: порушень немає`, "info"); }
  }
  /* політ БЕК: рух по водному маршруту, перепланування курсу за рухомою ціллю, влучання — наприкінці шляху */
  function flyDrones(dt) {
    const t = now();
    for (const j of S.jobs) {
      if (j.k !== "strike" || !j.path || !j.pos) continue; const tv = S.v.get(j.vid);
      if (!tv || !["sail", "burn"].includes(tv.st)) { j.due = t; j.path = null; continue; }
      if (t - j.rp >= 4) { j.rp = t; const r = waterRoute(j.pos, tv.pos); if (r) { j.path = r; j.i = 1; } }
      let step = j.spd * dt;
      while (step > 0 && j.i < j.path.length) {
        const nx = j.path[j.i], d = hav(j.pos, nx);
        if (d <= step) { j.pos = nx.slice(); step -= d; j.i++; }
        else { const f = step / d; j.pos = [j.pos[0] + (nx[0] - j.pos[0]) * f, j.pos[1] + (nx[1] - j.pos[1]) * f]; step = 0; }
      }
      if (j.i < j.path.length) { j.hdg = brg(j.pos, j.path[j.i]); let rem = hav(j.pos, j.path[j.i]); for (let k = j.i + 1; k < j.path.length; k++) rem += hav(j.path[k - 1], j.path[k]); j.due = rem < 0.8 ? t : t + rem / Math.max(0.1, j.spd); }
      else j.due = t;
    }
  }
  function tickJobs() {
    const t = now(); const due = S.jobs.filter(j => j.due <= t); if (!due.length) return;
    S.jobs = S.jobs.filter(j => j.due > t);
    for (const j of due) {
      try {
        const v = S.v.get(j.vid);
        if (j.k === "strike") { if (v && ["sail", "burn"].includes(v.st)) resolveStrike(j.sd, v, j.w, j.snap, false); else if (isHuman(j.sd)) toast("Удар по втраченій цілі: боєприпас витрачено даремно", "warn"); }
        else if (j.k === "report") reportDone(j);
        else if (j.k === "inspect") inspectDone(j);
        else if (v && METH[j.k]) { const r = identify(v, j.sd, j.k); toast(METH[j.k].n + ": " + r.txt, r.ok ? "info" : "warn"); }
      } catch (e) { if (window.console) console.warn("[sea job]", e); }
    }
    bump();
  }
  function tickInv() { const t = now(); for (const iv of S.inv) if (iv.state === "open" && iv.due <= t) closeInv(iv); }

  /* ======================================================================================================
     Кроковий цикл
     ====================================================================================================== */
  function tick() {
    if (!active()) { if (S.live) S.live = false; return; }
    const g = window.BV_GAME, t = now();
    if (!S.live || (S.lastClock && g.clock < S.lastClock - 1)) { seed(); S.last = t; }
    S.lastClock = g.clock; if (S.last === 0 || t < S.last) S.last = t;
    const dt = Math.min(60, t - S.last); S.last = t;
    if (dt > 0) {
      for (const [id, v] of S.v) {
        if (v.mirror) continue; v.life += dt;
        if (!moveVessel(v, dt)) { S.v.delete(id); S.queue.push({ due: t + ri(20, 120), lane: v.lane }); }
        else if (v.st === "sunk" || v.st === "detained") { if (t - (v.dead || t) > 240) S.v.delete(id); }
      }
      const ready = S.queue.filter(q => q.due <= t); S.queue = S.queue.filter(q => q.due > t);
      for (const q of ready) { const L = laneOf(q.lane), k = clamp(1 - Math.max(S.ins[L.sea], 0) * 0.5, 0.5, 1); if (rnd() < k) { const v = mkVessel(L, 0); v.d = 0; v.dir = 1; const P = posAt(L, 0); v.pos = P.p; S.v.set(v.id, v); } else S.queue.push({ due: t + 60, lane: q.lane }); }
      // спливання страхових надбавок і закритих портів
      S.ins.black = Math.max(0, S.ins.black - 0.0006 * dt); S.ins.baltic = Math.max(0, S.ins.baltic - 0.0006 * dt);
      for (const k in S.closed) if (S.closed[k] <= t) delete S.closed[k];
      S.rec = S.rec.filter(r => r.until > t);
      if (t >= S.sat.next) { const sea = rnd() < 0.5 ? [34, 44.6] : [21, 57.5]; S.sat.p = [sea[0] + rr(-3, 3), sea[1] + rr(-1, 1)]; S.sat.r = 280; S.sat.until = t + 25; S.sat.next = t + ri(110, 150); }
    }
    syncMirror(); if (dt > 0) flyDrones(dt); tickJobs(); tickInv(); aiTick(); senseTick();
    S.vers = (S.vers || 0) + 1;
  }
  /* підхоплення знищення реальних кораблів гри (морський дрон з основного модуля) */
  (function hookKills() {
    try {
      const H = window.BV_DIPX && window.BV_DIPX.HOOKS && window.BV_DIPX.HOOKS(); if (!H) return setTimeout(hookKills, 600);
      if (H.__sea) return; H.__sea = 1; const prev = H.onShipKill;
      H.onShipKill = function (ship, drone) {
        try { if (prev) prev.apply(this, arguments); } finally {
          try {
            if (!active() || !ship || !ship.pos) return; const v = S.v.get("g" + ship.id) || mirrorFrom({ id: ship.id, kind: ship.kind, key: ship.key, pos: ship.pos, base: ship.meta && ship.meta.base, load: ship.meta && ship.meta.load }); const by = "ua", snap = { cls: v.cls, flag: v.flag, mil: v.mil ? 0.9 : 0.15, conf: 0.9, id: 3, warned: 0, refused: false, src: ["Розвідка бою"], name: v.name };
            v.st = "sunk"; v.dead = now(); const inc = mkInc({ kind: "strike", by, v, w: "drone", res: "sunk", st: legal(by, v), killed: Math.round(v.crew * rr(0.25, 0.5)), wounded: Math.round(v.crew * 0.2), spill: v.cls === "tank" ? v.haz : 0.08, snap, err: { kind: "none", txt: "" }, ai: !isHuman(by), pos: v.pos.slice(), warned: false });
            S.v.delete(v.id);
          } catch (e) { if (window.console) console.warn("[sea kill]", e); }
        }
      };
    } catch (e) { /* */ }
  })();

  /* ======================================================================================================
     Мапа: маркери суден, шар кіл РЛС/супутника, ефекти (спалах, кільце, пляма нафти, вогонь)
     ====================================================================================================== */
  const SIL = {
    war: '<path d="M2 14h28l-3 5H6zM9 14V9h7V6h5v8M14 6V2" />', patrol: '<path d="M4 15h22l-3 4H8zM12 15v-4h6v4" />', tank: '<path d="M2 14h28l-3 5H6zM6 14v-3h20v3M25 11V7h3v4" />', shadow: '<path d="M2 14h28l-3 5H6zM6 14v-3h20v3M25 11V7h3v4" />',
    bulk: '<path d="M2 13h28l-3 6H6zM7 13V9h4v4M14 13V9h4v4M21 13V9h4v4" />', cargo: '<path d="M2 14h28l-3 5H6zM8 14v-4h6v4M20 14v-6h5v6" />', cont: '<path d="M2 15h28l-3 4H6zM7 15v-3h6v3M13 15v-5h6v5M19 15v-3h6v3" />',
    ferry: '<path d="M3 15h26l-3 4H6zM7 15v-4h18v4M10 11V8h11v3" />', fish: '<path d="M5 15h20l-3 4H8zM13 15V9M13 9l7 5" />', res: '<path d="M3 15h25l-3 4H6zM8 15v-5h7v5M19 15V7l5 8" />'
  };
  /* спрайти (176_naval_sprites.js): цивільні — за класом (у картці — за ОЦІНКОЮ, тож хибний клас видно й на малюнку), БЕК — для дрона УА */
  const SPR = window.BV_SEA_SPR || {};
  const SPRMAP = { tank: ["ship_tanker_01", "ship_tanker_02", "ship_lpg_01", "ship_lng_01"], shadow: ["ship_tanker_02", "ship_tanker_01"], bulk: ["ship_bulk_01"], cargo: ["ship_cargo_01", "ship_cargo_02"], cont: ["ship_container_01"] };
  const hsh = s => { let h = 0; s = String(s); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
  const sprOf = (c, seed) => { const a = SPRMAP[c]; const k = a && a[hsh(seed) % a.length]; return k && SPR[k] ? SPR[k] : null; };
  const bekOf = seed => { const k = "bek_0" + (1 + hsh(seed) % 4); return SPR[k] || null; };
  const shipImg = (c, seed, big) => { const s = sprOf(c, seed); return s ? `<img class="sx-spr${big ? " big" : ""}" src="${s}" alt="" draggable="false">` : silSvg(c, big); };
  const silSvg = (c, big) => `<svg viewBox="0 0 32 24" class="sx-sil${big ? " big" : ""}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">${SIL[c] || SIL.cargo}<path d="M1 21q4-2 8 0t8 0 8 0 6 0" opacity=".5"/></svg>`;
  /* клас маркера за оцінкою (belief), а не за правдою */
  function mkClass(v, sd) {
    const b = belOf(v, sd), a = b.id >= 2 || (b.cls != null) ? 1 : 0;
    if (b.id < 2 && !b.cls) return "unk";
    if (b.id >= 4 || b.conf >= 0.6) { if (b.mil >= 0.7) return "hos"; if (b.mil >= 0.4) return "sus"; if (v.aff === sd) return "own"; return "civ"; }
    return b.mil >= 0.5 ? "sus" : "unk";
  }
  /* ---- судна на мапі: нативні шари MapLibre (спрайти прив'язані до координат, масштабуються з зумом, малюються над водою й зонами) ---- */
  const SXV = { src: "sxv", ring: "sxv-ring", spr: "sxv-spr", bek: "sxv-bek", lb: "sxv-lb" };
  const zi = (...st) => ["interpolate", ["linear"], ["zoom"], ...st];
  const IMGW = 192, BEKW = 112, sprIds = { ready: false, busy: false };
  const loadImg = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  function drawTo(im, w, flip) {
    const h = Math.max(1, Math.round(im.naturalHeight * w / im.naturalWidth)), c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"); if (flip) { g.translate(w, 0); g.scale(-1, 1); } g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high"; g.drawImage(im, 0, 0, w, h);
    return g.getImageData(0, 0, w, h);
  }
  const silSrc = c => "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 24" width="192" height="144" fill="rgba(8,16,30,.75)" stroke="#e8f0fb" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round">' + (SIL[c] || SIL.cargo) + '<path d="M1 21q4-2 8 0t8 0 8 0 6 0" stroke="#7fb4ff" opacity=".7" fill="none"/></svg>');
  /* вантажимо наявні спрайти (data-URI з BV_SEA_SPR) у реєстр зображень мапи: у вигляді «ліворуч» (ніс спрайта ліворуч) і дзеркально «праворуч» */
  async function ensureImages() {
    const m = mp(); if (!m || sprIds.busy || !m.addImage) return; sprIds.busy = true;
    const jobs = [];
    const put = async (nm, src, w, both) => {
      if (m.hasImage(nm) && (!both || m.hasImage(nm + "-r"))) return;
      const im = await loadImg(src); if (!im || !im.naturalWidth) return;
      try { if (!m.hasImage(nm)) m.addImage(nm, drawTo(im, w, false), { pixelRatio: 1 }); if (both && !m.hasImage(nm + "-r")) m.addImage(nm + "-r", drawTo(im, w, true), { pixelRatio: 1 }); } catch (e) { if (window.console) console.warn("[sea img]", nm, e); }
    };
    for (const k in SPR) { const isBek = /^bek_/.test(k); if (isBek || /^ship_/.test(k)) jobs.push(put("sx-" + k, SPR[k], isBek ? BEKW : IMGW, !isBek)); }
    for (const c in SIL) jobs.push(put("sx-sil-" + c, silSrc(c), 128, true));
    try { await Promise.all(jobs); sprIds.ready = true; } catch (e) { if (window.console) console.warn("[sea img]", e); }
    sprIds.busy = false;
  }
  function ensureLayers() {
    const m = mp(); if (!m) return;
    try {
      if (!m.getSource("sxz")) {
        m.addSource("sxz", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({ id: "sxz-f", type: "fill", source: "sxz", paint: { "fill-color": ["get", "c"], "fill-opacity": ["get", "fo"] } });
        m.addLayer({ id: "sxz-l", type: "line", source: "sxz", paint: { "line-color": ["get", "c"], "line-width": 1.2, "line-opacity": 0.8, "line-dasharray": [3, 3] } });
      }
    } catch (e) { /* стиль ще вантажиться */ }
    try {
      if (!m.getSource(SXV.src)) { m.addSource(SXV.src, { type: "geojson", data: { type: "FeatureCollection", features: [] } }); S.sxvSig = ""; }
      /* порядок шарів: підсвітка → спрайт → підпис; усе над зонами (sxz) і над базовою мапою; піднімається нагору, якщо гра додала шари пізніше */
      if (!m.getLayer(SXV.ring)) m.addLayer({ id: SXV.ring, type: "circle", source: SXV.src, filter: ["==", ["get", "k"], "s"],
        paint: { "circle-radius": zi(3, 7, 5, 13, 7, 19, 9, 28, 11, 40), "circle-color": ["get", "c"], "circle-opacity": ["*", 0.16, ["get", "o"]],
          "circle-stroke-color": ["case", ["==", ["get", "sel"], 1], "#ffc53d", ["get", "c"]], "circle-stroke-width": ["case", ["==", ["get", "sel"], 1], 3, 1.5], "circle-stroke-opacity": ["*", 0.95, ["get", "o"]],
          "circle-pitch-alignment": "map" } });
      if (!m.getLayer(SXV.spr)) m.addLayer({ id: SXV.spr, type: "symbol", source: SXV.src, filter: ["==", ["get", "k"], "s"],
        layout: { "icon-image": ["get", "img"], "icon-size": zi(3, 0.2, 5, 0.3, 7, 0.42, 9, 0.62, 11, 0.9, 13, 1.25), "icon-allow-overlap": true, "icon-ignore-placement": true, "icon-anchor": "center", "symbol-sort-key": ["get", "z"] },
        paint: { "icon-opacity": ["get", "o"] } });
      if (!m.getLayer(SXV.bek)) m.addLayer({ id: SXV.bek, type: "symbol", source: SXV.src, filter: ["==", ["get", "k"], "b"],
        layout: { "icon-image": ["get", "img"], "icon-size": zi(3, 0.3, 6, 0.42, 9, 0.7, 12, 1.1), "icon-rotate": ["get", "rot"], "icon-rotation-alignment": "map", "icon-allow-overlap": true, "icon-ignore-placement": true } });
      if (!m.getLayer(SXV.lb)) m.addLayer({ id: SXV.lb, type: "symbol", source: SXV.src, filter: ["==", ["get", "k"], "s"],
        layout: { "text-field": ["step", ["zoom"], "", 5.6, ["get", "lb"]], "text-font": ["Noto Sans Bold"], "text-size": 10, "text-anchor": "top", "text-offset": ["step", ["zoom"], ["literal", [0, 1.1]], 7, ["literal", [0, 1.6]], 9, ["literal", [0, 2.3]]], "text-optional": true, "text-max-width": 9 },
        paint: { "text-color": ["get", "c"], "text-halo-color": "rgba(0,0,0,0.9)", "text-halo-width": 1.4, "text-opacity": ["get", "o"] } });
    } catch (e) { /* стиль ще вантажиться */ }
  }
  let upT = 0;
  function raiseLayers() { const m = mp(), n = Date.now(); if (!m || n - upT < 2500) return; upT = n; try { for (const id of ["sxz-f", "sxz-l", SXV.ring, SXV.spr, SXV.bek, SXV.lb]) if (m.getLayer(id)) m.moveLayer(id); } catch (e) { /* */ } }
  const circ = (c, r, n) => { const out = [], kx = 111.32 * Math.cos(c[1] * Math.PI / 180); for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; out.push([c[0] + Math.cos(a) * r / kx, c[1] + Math.sin(a) * r / 110.574]); } return out; };
  let zSig = "";
  function updateZones() {
    const m = mp(); if (!m) return;
    if (S.ui.zones === false) { if (zSig !== "off") { zSig = "off"; try { const s = m.getSource("sxz"); if (s && s.setData) s.setData({ type: "FeatureCollection", features: [] }); } catch (e) { /* */ } } return; }
    const sd = side(); if (!sd) return; const fs = [];
    for (const r of radars(sd)) { const sat = /Супутник/.test(r.n), prt = /Партнер/.test(r.n); fs.push({ type: "Feature", properties: { c: sat ? "#c18bff" : prt ? "#3ddc84" : "#4cc3ff", fo: sat ? 0.04 : 0.025 }, geometry: { type: "Polygon", coordinates: [circ(r.p, r.r, 48)] } }); }
    for (const c of S.rec) if (c.side === sd) fs.push({ type: "Feature", properties: { c: "#ffc53d", fo: 0.07 }, geometry: { type: "Polygon", coordinates: [circ(c.p, c.r, 36)] } });
    for (const j of S.jobs) if (j.k === "strike" && j.path && j.pos && j.sd === sd) fs.push({ type: "Feature", properties: { c: "#ffc53d", fo: 0 }, geometry: { type: "LineString", coordinates: [j.pos].concat(j.path.slice(j.i)) } });
    for (const k in S.closed) { const P = PORTS[k]; fs.push({ type: "Feature", properties: { c: "#ff7a6b", fo: 0.12 }, geometry: { type: "Polygon", coordinates: [circ(P.p, 40, 28)] } }); }
    const sig = fs.length + "|" + Math.floor(now() / (S.jobs.length ? 1 : 5)); if (sig === zSig) return; zSig = sig;
    try { const s = m.getSource("sxz"); if (s && s.setData) s.setData({ type: "FeatureCollection", features: fs }); } catch (e) { /* */ }
  }
  function clearMarkers() {
    const s = mp() && mp().getSource && mp().getSource(SXV.src); try { if (s && s.setData) s.setData({ type: "FeatureCollection", features: [] }); } catch (e) { /* */ } S.mk.clear(); S.sxvSig = "";
    for (const f of S.fxm) { try { f.m.remove(); } catch (e) { /* */ } } S.fxm = [];
  }
  /* зображення для судна: за ОЦІНКОЮ розвідки (як і в картці); ніс спрайта ліворуч, тож для курсу на схід беремо дзеркальний варіант */
  function shipImgName(v, b) {
    const east = (v.hdg % 360 + 360) % 360 < 180; let k = null;
    if (b.cls) { const a = SPRMAP[b.cls]; k = a && a[hsh(v.id) % a.length]; if (k && !SPR[k]) k = null; }
    return k ? "sx-" + k + (east ? "-r" : "") : "sx-sil-" + (b.cls || "cargo") + (east ? "-r" : "");
  }
  const MKCOL = { civ: "#4cc3ff", sus: "#ff9f4a", hos: "#ff5a4d", own: "#3ddc84", unk: "#ffb347" };
  function renderMarkers() {
    const m = mp(); if (!m || !m.getSource) return; ensureLayers(); ensureImages();
    const src = m.getSource(SXV.src); if (!src || !src.setData) return;
    const sd = side(), show = active() && sd && S.ui.vessels !== false; const fs = [], keep = new Set();
    if (show) for (const v of S.v.values()) {
      if (v.mirror || v.st === "sunk" && now() - (v.dead || 0) > 8 || v.st === "detained") continue; if (!visible(v, sd)) continue; keep.add(v.id);
      const b = belOf(v, sd), gh = ghost(v, sd), pos = gh && b.lp ? b.lp : v.pos, cls = mkClass(v, sd), q = b.id < 3 ? "?" : "";
      const lab = (b.id >= 3 && b.name ? b.name : b.cls ? CLS[b.cls].n : "Контакт") + q;
      fs.push({ type: "Feature", geometry: { type: "Point", coordinates: [+pos[0], +pos[1]] },
        properties: { k: "s", id: v.id, img: shipImgName(v, b), c: v.st === "burn" ? "#ff4a1a" : MKCOL[cls] || MKCOL.unk, o: gh ? 0.5 : (v.st === "sunk" ? 0.55 : 1), sel: S.ui.sel === v.id ? 1 : 0, lb: lab, z: Math.round(pos[1] * 100) } });
    }
    if (show && SPR.bek_01) for (const j of S.jobs) {      // БЕК у польоті: рух від порту до цілі
      if (j.k !== "strike" || j.w !== "drone" || j.sd !== "ua" || !j.pos || !j.path) continue; keep.add("j" + j.id);
      fs.push({ type: "Feature", geometry: { type: "Point", coordinates: [+j.pos[0], +j.pos[1]] }, properties: { k: "b", id: "j" + j.id, img: "sx-bek_0" + (1 + hsh(j.vid) % 4), rot: Math.round((j.hdg || 0) - 225) } });   // ніс спрайта — вниз-ліворуч (225°)
    }
    for (let i = fs.length - 1; i >= 0; i--) if (!m.hasImage(fs[i].properties.img)) fs.splice(i, 1);      // без заглушок: судно з'являється, щойно його спрайт у реєстрі мапи
    const sig = fs.map(f => { const p = f.properties, c = f.geometry.coordinates; return [p.id, c[0].toFixed(4), c[1].toFixed(4), p.img, p.c, p.o, p.sel, p.lb, p.rot].join(","); }).join("|") + "#" + (sprIds.ready ? 1 : 0);
    S.mk = new Map([...keep].map(k => [k, 1]));
    if (sig !== S.sxvSig) { S.sxvSig = sig; try { src.setData({ type: "FeatureCollection", features: fs }); } catch (e) { /* */ } }
    raiseLayers();
  }
  /* клацання по судну: перехоплюємо до обробників гри (як раніше stopPropagation на DOM-маркері), щоб клік не ставив цілі/точки під судном */
  function bindShipClick() {
    const m = mp(); if (!m || S.clickBound || !m.getContainer) return; const c = m.getContainer(); if (!c || !c.addEventListener) return; S.clickBound = true;
    const hit = ev => {
      if (!m.getLayer(SXV.spr) || ev.target !== m.getCanvas()) return null; const r = c.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
      try { const f = m.queryRenderedFeatures([[x - 14, y - 14], [x + 14, y + 14]], { layers: [SXV.spr, SXV.ring] }); return f && f[0] && f[0].properties ? f[0].properties.id : null; } catch (e) { return null; }
    };
    c.addEventListener("click", ev => { const id = hit(ev); if (!id || !S.v.has(id)) return; ev.stopPropagation(); ev.preventDefault(); openCard(id); }, true);
    c.addEventListener("mousemove", ev => { if (ev.target !== m.getCanvas()) return; const on = !!hit(ev); if (on !== !!S.hov) { S.hov = on; m.getCanvas().style.cursor = on ? "pointer" : ""; } });
  }
  function fxAt(pos, cls, ms, html) {
    const G = GL(); if (!G || !G.Marker) return; const e = document.createElement("div"); e.className = "sx-fx " + cls; e.innerHTML = html || "";
    let mk; try { mk = new G.Marker({ element: e, anchor: "center" }).setLngLat(pos).addTo(mp()); } catch (er) { return; }
    const f = { m: mk, e }; S.fxm.push(f); setTimeout(() => { try { mk.remove(); } catch (er) { /* */ } S.fxm = S.fxm.filter(x => x !== f); }, ms);
  }
  function fxLaunch(sd, v, w) { const a = (rangeTo(sd, v.pos).port && PORTS[rangeTo(sd, v.pos).port]) ? PORTS[rangeTo(sd, v.pos).port].p : v.pos; fxAt(a, "launch", 1400, '<i></i>'); }
  function fxIncident(inc) {
    const p = inc.pos; if (inc.res === "intercepted") return fxAt(p, "ring warn", 1800, "<i></i><b>перехоплено</b>");
    if (inc.res === "miss") return fxAt(p, "ring", 1600, "<i></i><b>промах</b>");
    fxAt(p, "boom " + (inc.res === "sunk" ? "big" : ""), 2200, "<i></i><i></i><i></i>");
    if (inc.res === "sunk" || inc.res === "crippled") fxAt(p, "fire", inc.res === "sunk" ? 9000 : 14000, "<i></i><i></i>");
    if (inc.spill > 0.05) fxAt(p, "slick", 70000, '<i style="--s:' + (36 + inc.spill * 90).toFixed(0) + 'px"></i>');
    if (inc.res === "sunk") fxAt(p, "wreck", 60000, "<i></i><i></i>");
    if (inc.kind === "strike" && inc.sev >= 25) fxAt(p, "alarm", 3500, "<i></i><b>" + (inc.sev >= 55 ? "кризовий інцидент" : "міжнародний інцидент") + "</b>");
  }

  /* ======================================================================================================
     Інтерфейс: кнопка ⚓, панель (судна · журнал · розслідування · наслідки), картка судна, картка інциденту
     ====================================================================================================== */
  const RES_T = { miss: "Промах", intercepted: "Перехоплено", damaged: "Пошкоджено", crippled: "Важке ураження", sunk: "Потоплено", detained: "Затримано" };
  const RES_C = { miss: "mute", intercepted: "mute", damaged: "warn", crippled: "bad", sunk: "bad", detained: "ok" };
  const KIND_T = { strike: "Удар", mine: "Міна", cable: "Кабель", detain: "Затримання" };
  const ERR_T = { none: "", wrong_cls: "Помилка класу", spoof: "Підмінений AIS", false_mil: "Хибна «військова» ціль", missed_mil: "Пропущена ціль", wrong_flag: "Помилка прапора" };
  const pct = x => Math.round(x * 100) + "%";
  const gauge = (lab, v, cls, tip) => `<div class="sx-g ${cls || ""}" title="${esc(tip || "")}"><span>${lab}</span><i><b style="width:${Math.round(clamp(v, 0, 1) * 100)}%"></b></i><em>${pct(v)}</em></div>`;
  const known = (lab, val, conf, err) => `<div class="sx-k ${val == null ? "unk" : ""}"><span>${lab}</span><b>${val == null ? "невідомо" : val}</b>${val != null && conf != null ? `<small class="${conf >= 0.7 ? "hi" : conf >= 0.5 ? "md" : "lo"}">${Math.round(conf * 100)}%</small>` : ""}</div>`;
  const nbadge = () => { const sd = side(); return S.unread || 0; };

  function mountButton() {
    if ($("seaZb")) return true; const c = $("controls"); if (!c) return false;
    const b = el("button", "seaZb", "btn"); b.type = "button"; b.setAttribute("aria-label", "Морські інциденти"); b.title = "Морські інциденти й судна (Чорне та Балтійське моря)";
    b.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2"/><path d="M12 7v13M8 11h8M5 14c0 3.3 3 6 7 6s7-2.7 7-6M3 14h4M17 14h4"/></svg><i class="sx-dot"></i>';
    b.addEventListener("click", e => { e.stopPropagation(); togglePanel(); });
    c.appendChild(b); return true;
  }
  function mountPanel() {
    let w = $("seaPanel"); if (w) return w;
    w = el("div", "seaPanel", "sx-panel"); w.hidden = true; w.setAttribute("role", "dialog"); w.setAttribute("aria-label", "Морські інциденти"); document.body.appendChild(w);
    w.addEventListener("click", e => { const b = e.target.closest("[data-sx]"); if (!b) return; e.stopPropagation(); act(b.dataset.sx, b.dataset.v, b.dataset.w); });
    return w;
  }
  function mountCard() {
    let w = $("seaCard"); if (w) return w;
    w = el("div", "seaCard", "sx-card"); w.hidden = true; w.setAttribute("role", "dialog"); document.body.appendChild(w);
    w.addEventListener("click", e => { const b = e.target.closest("[data-sx]"); if (!b) return; e.stopPropagation(); act(b.dataset.sx, b.dataset.v, b.dataset.w); });
    return w;
  }
  function mountInc() {
    let w = $("seaInc"); if (w) return w;
    w = el("div", "seaInc", "sx-inc"); w.hidden = true; w.setAttribute("role", "dialog"); document.body.appendChild(w);
    w.addEventListener("click", e => { const b = e.target.closest("[data-sx]"); if (!b) return; e.stopPropagation(); act(b.dataset.sx, b.dataset.v, b.dataset.w); });
    return w;
  }
  function togglePanel(on) {
    S.ui.panel = on == null ? !S.ui.panel : !!on; const w = mountPanel(); w.hidden = !S.ui.panel; const b = $("seaZb"); if (b) b.classList.toggle("on", S.ui.panel);
    if (S.ui.panel) { if (S.unread && S.ui.tab === "j") { /* прочитання при відкритті журналу */ } renderPanel(true); }
  }
  function act(k, v, w) {
    const sd = side();
    if (k === "close") return togglePanel(false);
    if (k === "tab") { S.ui.tab = v; return renderPanel(true); }
    if (k === "sea") { S.ui.sea = v; return renderPanel(true); }
    if (k === "only") { S.ui.only = S.ui.only ? 0 : 1; return renderPanel(true); }
    if (k === "zones") { S.ui.zones = S.ui.zones === false; zSig = ""; updateZones(); return renderPanel(true); }
    if (k === "vis") { S.ui.vessels = S.ui.vessels === false; renderMarkers(); return renderPanel(true); }
    if (k === "card") return openCard(v);
    if (k === "closecard") { closeCard(); return; }
    if (k === "focus") { const x = S.v.get(v); if (x) { try { mp().easeTo({ center: x.pos, zoom: Math.max(mp().getZoom(), 6), duration: 600 }); } catch (e) { /* */ } } return; }
    if (k === "m") { order(sd, S.ui.card, v); return renderCard(true); }
    if (k === "report") { report(sd, S.ui.card); return renderCard(true); }
    if (k === "s") {
      const key = S.ui.card + ":" + v; if (S.ui.armed !== key) { S.ui.armed = key; setTimeout(() => { if (S.ui.armed === key) { S.ui.armed = null; renderCard(true); } }, 7000); return renderCard(true); }
      S.ui.armed = null; strikeOrder(sd, S.ui.card, v); return renderCard(true);
    }
    if (k === "inc") return openInc(+v);
    if (k === "closeinc") return closeInc();
    if (k === "coop") { coop(+v, w); renderPanel(true); return openInc(S.ui.inc, true); }
    if (k === "readall") { S.inc.forEach(i => { i.read = true; }); S.unread = 0; bump(); return renderPanel(true); }
  }
  /* --- панель --- */
  function listRows(sd) {
    const arr = [...S.v.values()].filter(v => v.st !== "sunk" && v.st !== "detained" && visible(v, sd) && (S.ui.sea === "all" || v.sea === S.ui.sea));
    arr.forEach(v => { const b = belOf(v, sd); v._k = (mkClass(v, sd) === "hos" ? 3 : mkClass(v, sd) === "sus" ? 2 : mkClass(v, sd) === "unk" ? 1.5 : 0) + b.mil; });
    let out = arr.sort((a, b) => b._k - a._k); if (S.ui.only) out = out.filter(v => { const b = belOf(v, sd); return b.id < 3; }); return out;
  }
  function vRow(v, sd) {
    const b = belOf(v, sd), c = mkClass(v, sd), nm = b.id >= 3 && b.name ? b.name : b.cls ? CLS[b.cls].n : "Невідомий контакт", tags = [];
    if (v.ais === "off" && b.vis >= 2) tags.push('<u class="t-dark">AIS вимк.</u>'); if (b.sanc) tags.push(`<u class="t-sanc">санкції ${b.sanc}</u>`); if (b.carry) tags.push('<u class="t-mil">військ. вантаж?</u>'); if (v.mirror) tags.push('<u class="t-mir">бойовий модуль</u>'); if (v.st === "burn") tags.push('<u class="t-mil">горить</u>'); if (b.warned) tags.push('<u class="t-ok">попереджено</u>'); if (v.suspect && b.id >= 2) tags.push('<u class="t-mil">підозра: кабель</u>');
    return `<button class="sx-row ${c}${S.ui.sel === v.id ? " on" : ""}" data-sx="card" data-v="${v.id}"><span class="sx-rf">${b.flag ? flF(b.flag) : "❔"}</span><span class="sx-rb"><b>${esc(nm)}${b.id < 3 ? "?" : ""}</b><small>${esc(b.cls ? CLS[b.cls].n : "клас не визначено")} · ${SEAS[v.sea].replace(" море", "")} ${ghost(v, sd) ? "· <i>остання позиція</i>" : ""}</small><span class="sx-tags">${tags.join("")}</span></span><span class="sx-rc"><i style="--w:${Math.round((b.conf || 0) * 100)}%"></i><em>${b.id >= 4 ? "✓" : Math.round((b.conf || 0) * 100) + "%"}</em></span></button>`;
  }
  function incRow(i) {
    const X = DX(), vs = i.v, e = ERR_T[i.err.kind];
    return `<button class="sx-ir ${RES_C[i.res] || ""}${i.read ? "" : " new"}" data-sx="inc" data-v="${i.id}"><time>${fmtT(i.t)}</time><span class="sx-ik">${KIND_T[i.kind] || ""}</span><span class="sx-it"><b>${esc(vs.name)}</b> <small>${flF(vs.flag)} ${esc(CLS[vs.cls].n)} · ${SEAS[i.sea].replace(" море", "")}</small><small>${i.by === "?" ? "невідомо" : X.has(i.by) ? X.nm(i.by) : esc(String(i.by))} · ${RES_T[i.res] || i.res}${i.killed ? " · ✝ " + i.killed : ""}${i.spill > 0.05 ? " · 🛢" : ""}${e ? ' · <u class="t-mil">' + e + "</u>" : ""}</small></span><span class="sx-sv" title="Тяжкість"><i style="--w:${i.sev}%"></i><em>${i.sev}</em></span></button>`;
  }
  function invRow(iv) {
    const inc = S.inc.find(x => x.id === iv.inc), X = DX(); if (!inc) return "";
    const left = Math.max(0, iv.due - now()), head = `<b>${esc(inc.v.name)}</b> <small>${iv.body}</small>`;
    const st = iv.state === "open" ? `<span class="sx-iv open">триває · ще ${Math.ceil(left / 60)} год</span>` : `<span class="sx-iv ${iv.verdict}">${esc(iv.v)}</span>`;
    return `<button class="sx-ir ${iv.state === "open" ? "warn" : iv.verdict === "guilty" ? "bad" : iv.verdict === "cleared" ? "ok" : "mute"}" data-sx="inc" data-v="${inc.id}"><time>${fmtT(iv.t0)}</time><span class="sx-ik">${iv.by ? X.flag(iv.by) : "?"}</span><span class="sx-it">${head}<small>${st}${iv.paid ? " · компенсація " + fm(iv.paid) + " млн $" : ""}${iv.coop !== "none" ? " · " + (iv.coop === "open" ? "співпраця" : "засекречено") : ""}</small></span></button>`;
  }
  function renderPanel(force) {
    const w = $("seaPanel"); if (!w || w.hidden) return; const sd = side(); if (!sd) { w.innerHTML = `<div class="sx-hd"><b>⚓ Морські інциденти</b><button data-sx="close" class="sx-x">×</button></div><div class="sx-empty">Недоступно в цьому режимі.</div>`; return; }
    const sig = [S.ver, S.ui.tab, S.ui.sea, S.ui.only, S.ui.sel, sd, Math.floor(now() / 3), S.ui.zones, S.ui.vessels].join("|"); if (!force && sig === w._sig) return; w._sig = sig;
    const body = w.querySelector(".sx-body"), sc = body ? body.scrollTop : 0, X = DX(), me = S.stat[sd];
    const unread = S.inc.filter(i => !i.read && i.inv_for).length;
    const tabs = [["v", "Судна", listRows(sd).length], ["j", "Журнал", unread], ["i", "Розслідування", S.inv.filter(x => x.state === "open").length], ["e", "Наслідки", 0]];
    let h = `<div class="sx-hd"><b>⚓ Морські інциденти · ${X.flag(sd)} ${esc(X.nm(sd))}</b><button data-sx="close" class="sx-x" aria-label="Закрити">×</button></div>`;
    h += `<div class="sx-tabs">${tabs.map(([k, n, c]) => `<button class="${S.ui.tab === k ? "on" : ""}" data-sx="tab" data-v="${k}">${n}${c ? `<span class="bd">${c}</span>` : ""}</button>`).join("")}</div><div class="sx-body">`;
    if (S.ui.tab === "v") {
      h += `<div class="sx-flt"><button class="${S.ui.sea === "all" ? "on" : ""}" data-sx="sea" data-v="all">Усі</button><button class="${S.ui.sea === "black" ? "on" : ""}" data-sx="sea" data-v="black">Чорне</button><button class="${S.ui.sea === "baltic" ? "on" : ""}" data-sx="sea" data-v="baltic">Балтійське</button><button class="${S.ui.only ? "on" : ""}" data-sx="only">Невизначені</button></div>`;
      const rows = listRows(sd); h += rows.length ? rows.map(v => vRow(v, sd)).join("") : `<div class="sx-empty">Жодного судна не виявлено. Берегова РЛС, AIS, партнери, супутник і розвідувальний БпЛА відкривають цілі.</div>`;
      h += `<div class="sx-ft"><button class="sx-b ghost sm" data-sx="zones">Зони розвідки: ${S.ui.zones === false ? "вимк." : "увімк."}</button><button class="sx-b ghost sm" data-sx="vis">Позначки на мапі: ${S.ui.vessels === false ? "вимк." : "увімк."}</button></div>`;
      h += `<div class="sx-note">Колір: <u class="t-unk">невизначено</u> · <u class="t-civ">цивільне</u> · <u class="t-sus">підозріле</u> · <u class="t-hos">ворожа ціль</u>. Це <b>ваша оцінка</b>; розвідка може помилятися.</div>`;
    } else if (S.ui.tab === "j") {
      h += S.inc.length ? `<div class="sx-ft top"><button class="sx-b ghost sm" data-sx="readall">Позначити прочитаним</button></div>` + S.inc.slice().reverse().map(incRow).join("") : `<div class="sx-empty">Інцидентів ще не було.</div>`;
    } else if (S.ui.tab === "i") {
      h += S.inv.length ? S.inv.slice().reverse().map(invRow).join("") : `<div class="sx-empty">Розслідувань немає. Вони відкриваються після тяжких інцидентів: нейтральні прапори, жертви, розлив, помилки розвідки.</div>`;
    } else {
      const rows = [["Ударів", me.strikes], ["Потоплено", me.sunk], ["Законні цілі", me.lawful], ["Цивільні цілі", me.civil], ["Нейтральні цілі", me.neutral], ["Помилки розвідки", me.err], ["Загиблі", me.cas], ["Розливів", me.spill], ["Розслідувань", me.inv], ["Визнано винною", me.guilty], ["Виправдано", me.cleared], ["Компенсації, млн $", fm(me.paid)], ["Нові санкції проти вас", me.sanc]];
      h += `<div class="sx-sec">Ваша статистика</div><div class="sx-st">${rows.map(r => `<div><span>${r[0]}</span><b>${r[1]}</b></div>`).join("")}</div>`;
      h += `<div class="sx-sec">Економічний вплив</div><div class="sx-st"><div><span>Страхування воєн. ризиків: Чорне</span><b>+${Math.round(S.ins.black * 100)} п. п.</b></div><div><span>Страхування: Балтійське</span><b>+${Math.round(S.ins.baltic * 100)} п. п.</b></div><div><span>Множник доходу від флоту</span><b>×${incK(sd).toFixed(2).replace(".", ",")}</b></div><div><span>Закриті порти</span><b>${Object.keys(S.closed).map(k => PORTS[k].n).join(", ") || "—"}</b></div></div>`;
      h += `<div class="sx-sec">Репутація й відносини</div><div class="sx-st"><div><span>Репутація ${esc(X.nm(sd))}</span><b>${Math.round(X.rep(sd))}</b></div>${["pl", "ro", "tr", "de", "us"].map(x => `<div><span>${X.flag(x)} ${esc(X.nm(x))}</span><b>${Math.round(X.rel(sd, x))}</b></div>`).join("")}</div>`;
    }
    h += `</div>`; w.innerHTML = h; const nb = w.querySelector(".sx-body"); if (nb) nb.scrollTop = sc;
  }
  /* --- картка судна --- */
  function openCard(id) {
    const v = S.v.get(id); if (!v) return; S.ui.card = id; S.ui.sel = id; S.ui.armed = null; const w = mountCard(); w.hidden = false; document.body.classList.add("sx-open"); renderCard(true); S.ver++; renderMarkersSoon();
    try { if (!v.mirror) mp().easeTo({ center: v.pos, duration: 500 }); } catch (e) { /* */ }
  }
  function closeCard() { const w = $("seaCard"); if (w) w.hidden = true; S.ui.card = 0; S.ui.sel = 0; S.ui.armed = null; document.body.classList.remove("sx-open"); renderMarkersSoon(); }
  let rmT = 0; function renderMarkersSoon() { if (rmT) return; rmT = setTimeout(() => { rmT = 0; renderMarkers(); }, 30); }
  function renderCard(force) {
    const w = $("seaCard"), v = S.v.get(S.ui.card); if (!w || w.hidden) return; const sd = side(), X = DX();
    if (!v || !sd) return closeCard();
    const b = belOf(v, sd), a = assess(sd, v), c = mkClass(v, sd), jobs = S.jobs.filter(j => j.vid === v.id && j.sd === sd);
    const sig = [S.ver, v.id, v.st, S.ui.armed, Math.floor(now() / 2), b.id, jobs.length].join("|"); if (!force && sig === w._sig) return; w._sig = sig;
    const nmv = b.id >= 3 && b.name ? b.name : b.cls ? CLS[b.cls].n : "Невідомий контакт";
    let h = `<div class="sx-chd ${c}"><span class="sx-sw">${b.cls ? shipImg(b.cls, v.id, 1) : '<span class="sx-q">?</span>'}</span><div class="sx-ct"><b>${esc(nmv)}${b.id < 3 ? " ?" : ""}</b><small>${b.flag ? flF(b.flag) + " " + esc(flN(b.flag)) : "прапор невідомий"} · ${SEAS[v.sea]}</small><div class="sx-status ${c}">${{ unk: "Невизначений контакт", civ: "Ймовірно цивільне", sus: "Підозріле", hos: "Ймовірно воєнна ціль", own: "Ваша сторона" }[c]}</div></div><button class="sx-x" data-sx="closecard" aria-label="Закрити">×</button></div><div class="sx-cb">`;
    if (v.st !== "sail") h += `<div class="sx-warn">${v.st === "burn" ? "Судно горить і втрачає хід" : v.st === "sunk" ? "Судно потоплено" : "Судно затримано"}</div>`;
    h += `<div class="sx-kg">${known("Клас", b.cls ? CLS[b.cls].n : null, b.conf)}${known("Прапор", b.flag ? flF(b.flag) + " " + flN(b.flag) : null, b.conf)}${known("Власник", b.owner ? flN(b.owner) : null, b.id >= 2 ? Math.min(.8, b.conf) : null)}${known("Санкції", b.sanc != null ? (b.sanc ? "рівень " + b.sanc : "немає") : null, b.conf)}${known("Вантаж", b.id >= 4 ? v.cargo : b.carry ? "підозра: військовий" : b.id >= 3 ? "не з'ясовано" : null, null)}${known("Екіпаж", b.cls ? "≈ " + a.crewEst : null, null)}</div>`;
    h += `<div class="sx-srcs">${b.src.map(s => `<span>${esc(s)}</span>`).join("") || "<span>джерел немає</span>"}${v.ais === "off" && b.vis >= 2 ? '<span class="dark">AIS вимкнено</span>' : ""}${b.ais ? `<span class="ais">AIS: ${esc(CLS[b.ais.cls].n)} · ${flF(b.ais.flag)}</span>` : ""}${b.refused ? '<span class="dark">не відповідає на виклики</span>' : ""}${b.warned ? '<span class="ok">попереджено</span>' : ""}</div>`;
    h += `<div class="sx-gs">${gauge("Воєнна ціль (оцінка)", a.mil, a.mil >= 0.6 ? "bad" : a.mil >= 0.35 ? "warn" : "ok", "Ймовірність, що судно використовується у воєнних цілях")}${gauge("Цивільний ризик", a.civ, a.civ >= 0.6 ? "bad" : "warn", "Ймовірність цивільних жертв і розливів")}${gauge("Ризик помилки розвідки", a.errRisk, a.errRisk >= 0.45 ? "bad" : a.errRisk >= 0.25 ? "warn" : "ok", "Шанс, що клас/прапор/статус визначено хибно")}</div>`;
    if (jobs.length) h += `<div class="sx-jobs">${jobs.map(j => `<div><i></i>${esc(j.k === "strike" ? WPN[j.w].n[sd] + " у польоті" : METH[j.k] ? METH[j.k].n : j.k)} · до ${fmtT(j.due)}</div>`).join("")}</div>`;
    h += `<div class="sx-sec">Розвідка й ідентифікація</div><div class="sx-acts">`;
    for (const m of ["ais", "radar", "eo", "osint", "track"]) { const ck = canMethod(sd, v, m), M = METH[m]; h += `<button class="sx-b" data-sx="m" data-v="${m}" ${ck.ok ? "" : "disabled"} title="${esc(ck.ok ? M.d : ck.why)}"><b>${M.n}</b><small>${ck.ok ? (M.cost ? fm(M.cost) + " млн $" : "безкоштовно") + (M.time ? " · " + M.time + " хв" : "") : esc(ck.why)}</small></button>`; }
    h += `</div><div class="sx-sec">Контакт і дії</div><div class="sx-acts">`;
    for (const m of ["hail", "inspect"]) { const ck = canMethod(sd, v, m), M = METH[m]; h += `<button class="sx-b" data-sx="m" data-v="${m}" ${ck.ok ? "" : "disabled"} title="${esc(ck.ok ? M.d : ck.why)}"><b>${M.n}</b><small>${ck.ok ? (M.cost ? fm(M.cost) + " млн $" : "безкоштовно") + " · " + M.time + " хв" : esc(ck.why)}</small></button>`; }
    const rp = canReport(sd, v); h += `<button class="sx-b" data-sx="report" ${rp.ok ? "" : "disabled"} title="Передати дані партнерам для затримання судна"><b>Передати партнерам</b><small>${rp.ok ? "затримання · ≈ 35 хв" : esc(rp.why)}</small></button></div>`;
    h += `<div class="sx-sec danger">Удар</div>`;
    const lg = legal(sd, v); const believed = a.mil >= 0.5 ? "воєнна ціль" : "ймовірно цивільне";
    h += `<div class="sx-pre"><b>Оцінка наслідків (за вашою розвідкою):</b> ${a.mil >= 0.5 ? "ціль ймовірно воєнна" : "ціль ймовірно цивільна"} · ризик помилки <b>${pct(a.errRisk)}</b> · цивільних жертв <b>${pct(a.civ * (1 - a.mil * 0.6))}</b> · розлив <b>${pct(a.spillRisk)}</b>.${a.reacts.length ? " Реакція: " + a.reacts.map(x => X.flag(x) + " " + esc(X.nm(x))).join(", ") + "." : a.unknownFlag ? " Прапор невідомий — реакцію держав оцінити неможливо." : ""}${b.id < 3 ? " <u class='t-mil'>Ціль не підтверджена візуально — висока ймовірність помилки.</u>" : ""}${b.warned ? " <u class='t-ok'>Попередження було подано.</u>" : " Попередження не подавалось — суспільний резонанс буде більшим."}</div><div class="sx-acts">`;
    for (const k of ["drone", "missile"]) { const W = WPN[k], ck = canStrike(sd, v, k), armed = S.ui.armed === v.id + ":" + k; h += `<button class="sx-b strike${armed ? " armed" : ""}" data-sx="s" data-v="${k}" ${ck.ok ? "" : "disabled"} title="${esc(ck.ok ? W.n[sd] : ck.why)}">${k === "drone" && sd === "ua" && bekOf(v.id) ? `<img class="sx-bek" src="${bekOf(v.id)}" alt="" draggable="false">` : ""}<b>${W.i} ${armed ? "Підтвердити удар?" : W.n[sd]}</b><small>${ck.ok ? fm(W.cost) + " млн $ · " + Math.round(ck.d) + " км · ≈ " + Math.round(clamp(ck.d / W.spd, k === "drone" ? 8 : 3, k === "drone" ? 40 : 14)) + " хв" : esc(ck.why)}</small></button>`; }
    h += `</div></div><div class="sx-cft"><button class="sx-b ghost sm" data-sx="focus" data-v="${v.id}">До цілі</button></div>`;
    w.innerHTML = h;
  }
  /* --- картка інциденту --- */
  function openInc(id, keep) {
    const i = S.inc.find(x => x.id === id); if (!i) return; S.ui.inc = id; if (!i.read) { i.read = true; S.unread = Math.max(0, S.unread - 1); bump(); }
    const w = mountInc(); w.hidden = false; renderInc(); if (!keep) { /* */ }
  }
  function closeInc() { const w = $("seaInc"); if (w) w.hidden = true; S.ui.inc = 0; }
  function renderInc() {
    const w = $("seaInc"), i = S.inc.find(x => x.id === S.ui.inc); if (!w || !i) return; const X = DX(), vs = i.v, iv = S.inv.find(x => x.id === i.inv), sd = side();
    const tone = i.sev >= 40 ? "bad" : i.sev >= 15 ? "ask" : "good";
    const sections = [["rel", "Дипломатичні відносини"], ["rep", "Репутація"], ["eco", "Економічні наслідки"], ["env", "Довкілля"], ["cas", "Людські втрати"], ["err", "Помилки розвідки"], ["inv", "Міжнародне розслідування"], ["verd", "Вердикт"], ["info", "Примітки"]];
    let h = `<div class="sx-ihd"><b>⚓ ${KIND_T[i.kind] || "Інцидент"} · ${esc(vs.name)}</b><time>${fmtT(i.t)}</time><button class="sx-x" data-sx="closeinc" aria-label="Закрити">×</button></div><div class="sx-ib">`;
    h += `<div class="sx-hero ${RES_C[i.res] || ""}"><span>${shipImg(vs.cls, vs.vid || i.id, 1)}</span><div><b>${RES_T[i.res] || i.res}${i.w ? " · " + esc(WPN[i.w].n[i.by]) : ""}</b><small>${flF(vs.flag)} ${esc(flN(vs.flag))} · ${esc(CLS[vs.cls].n)} · ${SEAS[i.sea]}</small><small>${i.by === "?" ? "Винуватця не встановлено" : "Виконавець: " + X.flag(i.by) + " " + esc(X.nm(i.by)) + (i.ai ? " (ІІ)" : "")}</small></div><div class="sx-sevb ${tone}" style="--p:${i.sev}" title="Тяжкість інциденту"><em>${i.sev}</em></div></div>`;
    h += `<div class="sx-sec">Що було насправді</div><div class="sx-kg">${known("Статус цілі", LEG[i.st] ? LEG[i.st].n : "—", null)}${known("Власник", flN(vs.owner), null)}${known("Вантаж", vs.cargo, null)}${known("Екіпаж / пасажири", vs.crew + (vs.pax ? " / " + vs.pax : ""), null)}${known("Санкції", vs.sanc ? "рівень " + vs.sanc : "немає", null)}${known("AIS", vs.ais === "on" ? "відкритий" : vs.ais === "off" ? "вимкнений" : "підмінений", null)}</div>`;
    if (i.snap) h += `<div class="sx-cmp"><div><small>Ваша оцінка</small><b>${i.snap.cls ? esc(CLS[i.snap.cls].n) : "?"}</b><em>${i.snap.flag ? flF(i.snap.flag) : "❔"} · воєнна ціль ${pct(i.snap.mil)} · довіра ${pct(i.snap.conf)}</em></div><i>→</i><div class="${i.err.kind === "none" ? "" : "err"}"><small>Правда</small><b>${esc(CLS[vs.cls].n)}</b><em>${flF(vs.flag)} · ${vs.mil || vs.carry ? "воєнна" : "цивільна"} ціль</em></div></div>`;
    if (i.err.kind !== "none") h += `<div class="sx-errc"><b>${ERR_T[i.err.kind]}</b> ${esc(i.err.txt)}</div>`;
    for (const [k, lab] of sections) { const L = i.fx.filter(f => f.k === k); if (!L.length) continue; h += `<div class="sx-sec">${lab}</div>` + L.map(f => `<div class="sx-fx-r ${k}"><span>${esc(f.txt)}</span>${f.d != null ? `<b class="${f.d >= 0 ? "pos" : "neg"}">${f.d > 0 ? "+" : ""}${f.d}</b>` : ""}</div>`).join(""); }
    if (iv) {
      h += `<div class="sx-sec">Розслідування · ${esc(iv.body)}</div><div class="sx-inv ${iv.state}"><div>${iv.state === "open" ? `Триває до ${fmtT(iv.due)} · оцінка провини <b>${iv.r}</b>/100` : `Закрито: <b>${esc(iv.v)}</b>`}</div>${iv.log.map(l => `<small><time>${fmtT(l.t)}</time> ${esc(l.x)}</small>`).join("")}</div>`;
      if (iv.state === "open" && iv.by && isHuman(iv.by)) h += `<div class="sx-acts"><button class="sx-b" data-sx="coop" data-v="${iv.id}" data-w="open" ${iv.coop !== "none" ? "disabled" : ""}><b>Співпрацювати</b><small>${i.st === "mil" || i.warned ? "підтвердить законність" : "відкриє й помилки"} · швидше</small></button><button class="sx-b" data-sx="coop" data-v="${iv.id}" data-w="deny" ${iv.coop !== "none" ? "disabled" : ""}><b>Засекретити дані</b><small>довше · ризик викриття</small></button><button class="sx-b" data-sx="coop" data-v="${iv.id}" data-w="pay" ${iv.paid ? "disabled" : ""}><b>Виплатити компенсацію</b><small>≈ ${fm((i.comp || 0.5) + i.killed * 0.15)} млн $ · −10 до провини</small></button></div>`;
    }
    h += `</div>`; w.className = "sx-inc " + tone; w.innerHTML = h;
  }
  function openIncAuto() { }
  /* --- цикл відмальовування --- */
  function ui() {
    try {
      mountButton(); const b = $("seaZb"), ok = active() && !!side();
      if (b) { b.style.display = ok ? "" : "none"; const n = S.inc.filter(i => !i.read && i.inv_for).length; b.classList.toggle("has", n > 0); b.dataset.n = n > 9 ? "9+" : String(n || ""); }
      if (!ok) { if (S.ui.panel) togglePanel(false); closeCard(); closeInc(); if (S.mk.size) clearMarkers(); return; }
      ensureLayers(); updateZones(); renderMarkers(); renderPanel(); renderCard();
    } catch (e) { if (window.console) console.warn("[sea ui]", e); }
  }
  load();
  setInterval(() => { try { tick(); } catch (e) { if (window.console) console.warn("[sea]", e); } }, 500);
  (window.BV_PERF ? BV_PERF.ui(ui, 700) : setInterval(ui, 700));
  setInterval(() => save(), 3000);
  window.addEventListener("beforeunload", () => save(true));
  try { mp().on("styledata", () => { zSig = ""; S.sxvSig = ""; ensureLayers(); ensureImages(); }); } catch (e) { /* */ }
  ensureImages(); bindShipClick();
  document.addEventListener("keydown", e => { if (e.key === "Escape") { const c = $("seaCard"); if (c && !c.hidden) closeCard(); else { const i = $("seaInc"); if (i && !i.hidden) closeInc(); } } }, true);

  window.BV_SEA = {
    incK, mirrorFrom, bekPlan, waterRoute, flyDrones, state: S, tick, seed, openCard, openInc, togglePanel, order, strikeOrder, resolveStrike, identify, assess, legal, detect, report, coop, closeInv, mkInc, belOf, canStrike, canMethod, mkVessel, LANES, PORTS, CLS, FL, WPN, METH, LEG, aiTick, syncMirror,
    vessels: () => [...S.v.values()], inc: () => S.inc, inv: () => S.inv, ver: () => S.ver, unread: () => S.unread, save, load
  };
})();
