/* SKYDOMINION · 73 · МІЖНАРОДНІ ПОСТАВКИ ОЗБРОЄННЯ + ЦЕНТРАЛЬНИЙ СКЛАД (Львів)
   Партнери (США, Британія, Німеччина, Франція, Польща, Румунія) формують ПАРТІЇ за переліками озброєння. Партія проходить статуси
   «Формується → Очікує транспорт → Завантаження → У дорозі → Розвантаження → Прийнято на склад» (або «Прийнято частково» / «Втрачено» / «Скасовано»).
   Легкі позиції (ракети, бомби, ПЗРК) везе Ан-26 — ігровий об'єкт на мапі (рейс вузол партнера → Львів, борт можна втратити від влучання поблизу);
   важка техніка ППО йде наземним коридором. Вантаж надходить на ЦЕНТРАЛЬНИЙ СКЛАД у Львові, звідки гравець передає його у війська (арсенал/ППО гри).
   ОБЛІК: кожна зміна кількості — проводка в журналі операцій (LEDGER) з унікальним ключем ідемпотентності: повторно та сама проводка не виконується
   (немає дублювання), а кожна одиниця завжди в одному стані: ЧЕРГА → У ДОРОЗІ → СКЛАД → ВІЙСЬКА, або ВТРАЧЕНО/ПОВЕРНЕНО.
   BV_ARMS.audit() перевіряє баланси (партія ↔ рейси ↔ склад ↔ журнал). Конфіг: window.BV_ARMS_CFG. Лише для гравця за Україну, не в мережевому бою. */
(function boot() {
  "use strict";
  if (window.BV_ARMS) return;
  const H = window.BV_DND_HOST, G = window.BV_GAME;
  const S7 = H && H.S7, map = S7 && S7.map;
  if (!H || !G || !S7 || !map || !document.getElementById("controls")) return setTimeout(boot, 400);

  const CFG = Object.assign({
    FLEET: 3, PAYLOAD_KG: 5500, AIR_MAX_UNIT_KG: 2000, CRUISE_KMM: 7.33, LOAD_MIN: 25, UNLOAD_MIN: 18, WH_MOVE_MIN: 8,
    FORM_BASE: 40, FORM_PER_LINE: 6, GROUND_WAIT: 90, GROUND_KMM: 1.0, ROAD_K: 1.3, WH_CAP_KG: 160000,
    HIT_AIR_KM: 3, HIT_GROUND_KM: 1.5, WH_HIT_KM: 2.5, WH_HIT_LOSS: 0.15, REPLACE_MIN: 36 * 60,
    MIN_REL: 15, MAX_ACTIVE: 12, AUTO: true, AUTO_H: 24, LOG_MAX: 1500
  }, window.BV_ARMS_CFG || {});

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const toast = m => { try { H.toast(m); } catch (e) { /* */ } };
  const dkm = (a, b) => { const kx = 111.32 * Math.cos((a[1] + b[1]) / 2 * Math.PI / 180); return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 110.574); };
  const brg = (a, b) => { const kx = Math.cos((a[1] + b[1]) / 2 * Math.PI / 180); return (Math.atan2((b[0] - a[0]) * kx, b[1] - a[1]) * 180 / Math.PI + 360) % 360; };
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const now = () => +G.clock || 0;
  const DX = () => (window.BV_DIP && window.BV_DIP.ext) || null;
  const fmtT = t => { const m = Math.floor(t) % 1440, d = Math.floor(t / 1440); return `${d ? "д" + (d + 1) + " " : ""}${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
  const fmtKg = kg => kg >= 1000 ? (kg / 1000).toFixed(kg >= 10000 ? 0 : 1).replace(".0", "") + " т" : Math.round(kg) + " кг";

  /* ---------- вузли ---------- */
  const NODES = {
    RZE: { id: "RZE", n: "Жешув-Ясьонка (PL)", c: [22.019, 50.110] },
    SUJ: { id: "SUJ", n: "Сучава (RO)", c: [26.354, 47.688] },
    LWO: { id: "LWO", n: "Львів · Данило Галицький", c: [23.956, 49.8125] }
  };
  const WH_C = [23.979, 49.796];

  /* ---------- довідник озброєння: kind w — арсенал (GAME.stock), ad — склад ППО (GAME.ads); kg — маса одиниці ---------- */
  const ITEMS = {
    atacms: { n: "ATACMS", cat: "Ракети", kind: "w", kg: 1670 }, jassm: { n: "JASSM", cat: "Ракети", kind: "w", kg: 1020 },
    tomahawk: { n: "Tomahawk", cat: "Ракети", kind: "w", kg: 1450 }, harpoon: { n: "Harpoon", cat: "Ракети", kind: "w", kg: 690 },
    stormshadow: { n: "Storm Shadow / SCALP", cat: "Ракети", kind: "w", kg: 1300 }, taurus: { n: "Taurus KEPD 350", cat: "Ракети", kind: "w", kg: 1400 },
    jdamer: { n: "JDAM-ER", cat: "Авіабомби", kind: "w", kg: 280 }, gbu39: { n: "GBU-39 SDB", cat: "Авіабомби", kind: "w", kg: 130 }, aasm: { n: "AASM Hammer", cat: "Авіабомби", kind: "w", kg: 340 },
    stinger: { n: "Stinger (ПЗРК)", cat: "ППО ближня", kind: "ad", kg: 40 }, igla: { n: "Ігла (ПЗРК)", cat: "ППО ближня", kind: "ad", kg: 30 }, zu23: { n: "ЗУ-23-2", cat: "ППО ближня", kind: "ad", kg: 950 },
    gepard: { n: "Gepard", cat: "ППО", kind: "ad", kg: 47000 }, skynex: { n: "Skynex", cat: "ППО", kind: "ad", kg: 20000 }, iris: { n: "IRIS-T SLM", cat: "ППО", kind: "ad", kg: 15000 },
    nasams: { n: "NASAMS", cat: "ППО", kind: "ad", kg: 12000 }, patriot: { n: "Patriot", cat: "ППО", kind: "ad", kg: 30000 }, sampt: { n: "SAMP/T", cat: "ППО", kind: "ad", kg: 25000 },
    osa: { n: "Оса", cat: "ППО", kind: "ad", kg: 18000 }, s125: { n: "С-125 «Печора»", cat: "ППО", kind: "ad", kg: 12000 }, stormer: { n: "Stormer HVM", cat: "ППО", kind: "ad", kg: 12700 },
    vampire: { n: "VAMPIRE", cat: "ППО", kind: "ad", kg: 9000 }
  };
  const KEYS = Object.keys(ITEMS);
  const isAir = k => ITEMS[k].kg <= CFG.AIR_MAX_UNIT_KG;
  const L = (k, max, avail, regen) => ({ k, max, avail, regen });
  const PARTNERS = {
    us: { hub: "RZE", lines: [L("atacms", 4, 12, 1), L("jassm", 4, 10, 1), L("tomahawk", 2, 4, .5), L("harpoon", 4, 8, 1), L("jdamer", 12, 40, 4), L("gbu39", 16, 60, 6), L("stinger", 8, 30, 3), L("patriot", 1, 3, .25), L("nasams", 1, 4, .5)],
      presets: [["Високоточні боєприпаси", { atacms: 2, jdamer: 8, gbu39: 8 }], ["Пакет ППО", { patriot: 1, stinger: 6 }]] },
    gb: { hub: "RZE", lines: [L("stormshadow", 4, 12, 1), L("stormer", 1, 3, .5), L("vampire", 1, 3, .5)], presets: [["Крилаті ракети", { stormshadow: 3 }], ["Мобільна ППО", { stormer: 1, vampire: 1 }]] },
    de: { hub: "RZE", lines: [L("iris", 1, 6, .5), L("gepard", 2, 10, 1), L("skynex", 1, 4, .5), L("taurus", 3, 8, .5), L("patriot", 1, 2, .25)], presets: [["Пакет IRIS-T", { iris: 1, gepard: 2 }], ["Taurus", { taurus: 3 }]] },
    fr: { hub: "RZE", lines: [L("sampt", 1, 2, .2), L("aasm", 8, 24, 2), L("stormshadow", 3, 6, .5)], presets: [["AASM Hammer", { aasm: 8 }], ["SAMP/T", { sampt: 1 }]] },
    pl: { hub: "RZE", lines: [L("zu23", 4, 20, 2), L("igla", 8, 40, 4), L("osa", 1, 4, .5), L("s125", 1, 2, .25)], presets: [["Ближня ППО", { zu23: 4, igla: 8 }]] },
    ro: { hub: "SUJ", lines: [L("zu23", 4, 16, 2), L("igla", 6, 24, 2), L("patriot", 1, 1, .1)], presets: [["Ближня ППО", { zu23: 4, igla: 6 }]] }
  };
  const PIDS = Object.keys(PARTNERS);
  const PN = { us: ["США", "🇺🇸"], gb: ["Велика Британія", "🇬🇧"], de: ["Німеччина", "🇩🇪"], fr: ["Франція", "🇫🇷"], pl: ["Польща", "🇵🇱"], ro: ["Румунія", "🇷🇴"] };

  const STAT = { forming: ["Формується", "mu"], ready: ["Очікує транспорт", "mu"], loading: ["Завантаження", "wn"], enroute: ["У дорозі", "bl"], arrived: ["Розвантаження у Львові", "bl"],
    received: ["Прийнято на склад", "ok"], partial: ["Прийнято частково", "wn"], lost: ["Втрачено", "bd"], cancelled: ["Скасовано", "mu"] };
  const KIND = { receipt: ["Надходження", "ok"], release: ["Списання · передано у війська", "wn"], strike: ["Списання · знищено ударом", "bd"], loss: ["Втрата в дорозі", "bd"], refund: ["Повернення партнеру", "mu"], reserve: ["Резерв партнера", "mu"] };

  /* ---------- стан ---------- */
  let ST;
  function fresh() {
    ST = { gid: (ST ? ST.gid : 0) + 1, ships: [], legs: [], ac: [], inv: {}, led: [], posted: new Set(), tot: { rcv: {}, rel: {}, str: {}, loss: {}, ref: {} },
      avail: {}, nextAuto: {}, seq: 1, lseq: 1, oseq: 1, auto: CFG.AUTO, tab: "wh", partner: "us", draft: {}, openShip: null, lastT: now(), flt: "all", audit: null, unread: 0 };
    for (const p of PIDS) { ST.avail[p] = {}; for (const l of PARTNERS[p].lines) ST.avail[p][l.k] = l.avail; ST.nextAuto[p] = now() + 480 + Math.random() * 720; }
    for (let i = 0; i < CFG.FLEET; i++) ST.ac.push({ id: i + 1, name: "Ан-26 №" + (i + 1), at: "LWO", ph: null, plan: [], st: "parked", leg: null, pos: null, hdg: 90, load: 0, respawn: 0 });
  }
  fresh();
  const active = () => !!(G.on && !G.puppet && G.ctx !== "online" && G.ctrl && G.ctrl.ua === "me");
  const infinite = () => !!(G.unlimited || !G.stock || !G.stock.ua);
  const sum = (o, k) => (o[k] | 0);
  const add = (o, k, n) => { o[k] = (o[k] | 0) + n; };

  /* ---------- ЖУРНАЛ ОПЕРАЦІЙ (єдина точка зміни залишків складу) ---------- */
  function post(opKey, kind, key, qty, ref, note) {
    if (!(qty > 0)) return false;
    if (ST.posted.has(opKey)) return false;                       // ідемпотентність: та сама проводка двічі не виконується
    const inv = ST.inv, cur = inv[key] | 0;
    const dec = kind === "release" || kind === "strike";
    if (dec && qty > cur) return false;                           // списати більше, ніж є, неможливо — залишок не йде в мінус
    if (kind === "receipt") { inv[key] = cur + qty; add(ST.tot.rcv, key, qty); }
    else if (kind === "release") { inv[key] = cur - qty; add(ST.tot.rel, key, qty); }
    else if (kind === "strike") { inv[key] = cur - qty; add(ST.tot.str, key, qty); }
    else if (kind === "loss") add(ST.tot.loss, key, qty);         // втрата в дорозі: склад не змінюється, лише облік
    else if (kind === "refund") add(ST.tot.ref, key, qty);
    ST.posted.add(opKey);
    ST.led.push({ id: ST.oseq++, t: now(), kind, key, qty, bal: inv[key] | 0, ref: ref || "", note: note || "" });
    if (ST.led.length > CFG.LOG_MAX) ST.led.splice(0, ST.led.length - CFG.LOG_MAX);
    ST.dirty = true;
    return true;
  }
  const whUsed = () => KEYS.reduce((s, k) => s + (ST.inv[k] | 0) * ITEMS[k].kg, 0);
  const whFree = () => Math.max(0, CFG.WH_CAP_KG - whUsed());
  const linesKg = lines => lines.reduce((s, l) => s + l.n * ITEMS[l.k].kg, 0);

  /* ---------- партії ---------- */
  const pad = n => String(n).padStart(4, "0");
  const shipLine = (s, k) => s.lines.find(l => l.k === k);
  const legsOf = s => s.legs.map(id => ST.legs.find(l => l.id === id)).filter(Boolean);
  const NOT_DEPARTED = new Set(["queued", "loading"]);
  const IN_TRANSIT = new Set(["flying", "unloading", "transfer", "wait", "moving"]);

  function packLegs(lines) {
    const air = [], ground = [];
    let cur = { lines: [], kg: 0 };
    const sorted = lines.filter(l => l.q > 0).sort((a, b) => ITEMS[b.k].kg - ITEMS[a.k].kg);
    for (const l of sorted) {
      const u = ITEMS[l.k].kg;
      if (!isAir(l.k)) { ground.push({ k: l.k, n: l.q }); continue; }
      let left = l.q;
      while (left > 0) {
        const fit = Math.floor((CFG.PAYLOAD_KG - cur.kg) / u);
        if (fit <= 0) { air.push(cur); cur = { lines: [], kg: 0 }; continue; }
        const n = Math.min(left, fit), ex = cur.lines.find(x => x.k === l.k);
        if (ex) ex.n += n; else cur.lines.push({ k: l.k, n });
        cur.kg += n * u; left -= n;
      }
    }
    if (cur.kg > 0) air.push(cur);
    return { air, ground };
  }

  function createShip(p, want, auto) {
    const P = PARTNERS[p], lines = [];
    for (const k in want) { const q = want[k] | 0; if (q > 0) lines.push({ k, q, tr: 0, recv: 0, lost: 0, ref: 0 }); }
    if (!lines.length) return null;
    for (const l of lines) ST.avail[p][l.k] -= l.q;                // резерв у партнера — рівно одна проводка на партію
    const t = now(), pk = packLegs(lines), hub = NODES[P.hub];
    const s = { id: ST.seq++, p, hub: P.hub, lines, t0: t, tForm: t + CFG.FORM_BASE + CFG.FORM_PER_LINE * lines.length, legs: [], status: "forming", auto: !!auto, cancelled: false, rewarded: false };
    s.code = "ПП-" + pad(s.id);
    const mk = (mode, ls, extra) => { const l = Object.assign({ id: ST.lseq++, ship: s.id, mode, hub: P.hub, lines: ls, kg: linesKg(ls), state: "queued", ac: null, readyAt: s.tForm, t0: 0, t1: 0 }, extra || {}); ST.legs.push(l); s.legs.push(l.id); return l; };
    for (const x of pk.air) mk("air", x.lines);
    if (pk.ground.length) mk("ground", pk.ground, { dist: dkm(hub.c, NODES.LWO.c) * CFG.ROAD_K });
    ST.ships.push(s);
    for (const l of lines) post("rsv:" + s.id + ":" + l.k, "reserve", l.k, l.q, s.code, PN[p][0]);
    ST.dirty = true;
    return s;
  }

  function validate(p, want) {
    if (!active()) return "Поставки доступні лише в бою за Україну (не в мережевому бою)";
    if (!PARTNERS[p]) return "Невідомий партнер";
    const dx = DX(); const rel = dx && dx.ok() ? dx.rel(p, "ua") : 50;
    if (rel < CFG.MIN_REL) return `${PN[p][0]} відмовляє: відносини ${Math.round(rel)} (потрібно ≥ ${CFG.MIN_REL})`;
    if (ST.ships.filter(s => !isFinal(s)).length >= CFG.MAX_ACTIVE) return "Забагато активних партій";
    let n = 0;
    for (const k in want) {
      const q = want[k] | 0; if (q <= 0) continue;
      const ln = PARTNERS[p].lines.find(l => l.k === k); if (!ln) return "Партнер не постачає " + k;
      if (q > ln.max) return `${ITEMS[k].n}: не більше ${ln.max} за партію`;
      if (q > Math.floor(ST.avail[p][k] + 1e-9)) return `${ITEMS[k].n}: у партнера доступно лише ${Math.floor(ST.avail[p][k])}`;
      n += q;
    }
    return n ? "" : "Партія порожня — оберіть позиції";
  }
  function request(p, want) {
    const err = validate(p, want); if (err) { toast(err); return { ok: false, msg: err }; }
    const s = createShip(p, want, false);
    toast(`Партія ${s.code} від ${PN[p][0]} формується · ${s.lines.length} поз.`);
    log2("📦", `Партія ${s.code} (${PN[p][0]}) сформована: ` + s.lines.map(l => `${ITEMS[l.k].n} ×${l.q}`).join(", "));
    return { ok: true, id: s.id };
  }
  function cancel(id) {
    const s = ST.ships.find(x => x.id === id); if (!s || s.cancelled) return false;
    const ls = legsOf(s);
    if (!ls.every(l => l.state === "queued" && !l.ac)) { toast("Партію вже відправлено — скасувати не можна"); return false; }
    for (const l of ls) l.state = "cancelled";
    for (const x of s.lines) { const n = x.q - x.tr - x.recv - x.lost - x.ref; if (n > 0) { ST.avail[s.p][x.k] += n; x.ref += n; post("ref:" + s.id + ":" + x.k, "refund", x.k, n, s.code, "скасовано"); } }
    s.cancelled = true; ST.dirty = true; return true;
  }
  const isFinal = s => s.cancelled || ["received", "partial", "lost"].includes(s.status);

  function statusOf(s) {
    if (s.cancelled) return "cancelled";
    const ls = legsOf(s);
    if (ls.length && ls.every(l => l.state === "done" || l.state === "lost")) {
      const rec = s.lines.reduce((a, l) => a + l.recv, 0), lost = s.lines.reduce((a, l) => a + l.lost, 0);
      return rec === 0 ? "lost" : lost > 0 ? "partial" : "received";
    }
    if (now() < s.tForm) return "forming";
    if (ls.some(l => l.state === "flying" || l.state === "moving")) return "enroute";
    if (ls.some(l => l.state === "unloading" || l.state === "transfer" || l.state === "wait")) return "arrived";
    if (ls.some(l => l.state === "loading")) return "loading";
    return "ready";
  }

  /* ---------- Ан-26 ---------- */
  const acPos = (a, t) => {
    const ph = a.ph;
    if (ph && (ph.k === "fly" || ph.k === "ferry")) { const f = clamp((t - ph.t0) / Math.max(1e-6, ph.t1 - ph.t0), 0, 1); return lerp(ph.from, ph.to, f); }
    const c = NODES[a.at].c, i = a.id - 1; return [c[0] + 0.004 * (i % 3) - 0.004, c[1] - 0.003 * (i % 3)];
  };
  function assign(a, leg, t) {
    const hub = NODES[leg.hub], lwo = NODES.LWO, plan = [];
    let tt = t;
    if (a.at !== leg.hub) { const d = dkm(NODES[a.at].c, hub.c) / CFG.CRUISE_KMM; plan.push({ k: "ferry", from: NODES[a.at].c, to: hub.c, t0: tt, t1: tt + d }); tt += d; }
    plan.push({ k: "load", from: hub.c, to: hub.c, t0: tt, t1: tt + CFG.LOAD_MIN, leg: leg.id }); tt += CFG.LOAD_MIN;
    const fd = dkm(hub.c, lwo.c) / CFG.CRUISE_KMM;
    plan.push({ k: "fly", from: hub.c, to: lwo.c, t0: tt, t1: tt + fd, leg: leg.id }); tt += fd;
    plan.push({ k: "unload", from: lwo.c, to: lwo.c, t0: tt, t1: tt + CFG.UNLOAD_MIN, leg: leg.id });
    a.plan = plan; a.leg = leg.id; leg.ac = a.id; leg.state = "queued"; a.st = "busy"; a.ph = a.plan.shift();
    if (a.ph.k === "load") beginPhase(a);
  }
  function beginPhase(a) {
    const ph = a.ph, leg = ph.leg && ST.legs.find(l => l.id === ph.leg);
    if (ph.k === "load" && leg) { leg.state = "loading"; a.st = "loading"; }
    if (ph.k === "ferry") a.st = "ferry";
  }
  function finishPhase(a) {
    const ph = a.ph, leg = ph.leg && ST.legs.find(l => l.id === ph.leg), s = leg && ST.ships.find(x => x.id === leg.ship);
    if (ph.k === "ferry") a.at = ph.to === NODES.LWO.c ? "LWO" : a.at;
    if (ph.k === "ferry") a.at = Object.keys(NODES).find(k => NODES[k].c === ph.to) || a.at;
    if (ph.k === "load" && leg && s) {                                  // вантаж на борту: ЧЕРГА → У ДОРОЗІ (рівно один раз)
      if (leg.state === "loading") { leg.state = "flying"; a.load = leg.kg; for (const l of leg.lines) shipLine(s, l.k).tr += l.n; a.st = "flying"; }
    }
    if (ph.k === "fly") { a.at = "LWO"; if (leg) leg.state = "unloading"; a.st = "unloading"; }
    if (ph.k === "unload" && leg) { leg.state = "transfer"; leg.t1 = ph.t1 + CFG.WH_MOVE_MIN; a.load = 0; a.st = "parked"; a.leg = null; }
    a.ph = a.plan.shift() || null;
    if (a.ph) { if (a.ph.k === "fly") a.st = "flying"; beginPhase(a); }
    else { a.ph = null; if (a.st !== "lost") a.st = "parked"; a.leg = null; }
  }
  function loseLeg(leg, why) {
    if (leg.state === "done" || leg.state === "lost") return;
    const s = ST.ships.find(x => x.id === leg.ship);
    for (const l of leg.lines) {
      const sl = shipLine(s, l.k), inTr = IN_TRANSIT.has(leg.state) || leg.state === "flying";
      if (inTr) sl.tr -= l.n; else { /* ще не вилетіло — частина вантажу в черзі */ }
      sl.lost += l.n; post("loss:" + leg.id + ":" + l.k, "loss", l.k, l.n, s.code, why);
    }
    leg.state = "lost"; ST.dirty = true;
  }
  function destroyAc(a, why) {
    if (a.st === "lost") return;
    const leg = a.leg && ST.legs.find(l => l.id === a.leg);
    if (leg) {
      if (leg.state === "flying") loseLeg(leg, why);
      else { leg.state = "queued"; leg.ac = null; }                 // вантаж не вантажили/ще на землі у партнера — рейс повертається в чергу
    }
    a.st = "lost"; a.ph = null; a.plan = []; a.leg = null; a.load = 0; a.respawn = now() + CFG.REPLACE_MIN;
    toast(`${a.name} втрачено: ${why}` + (leg && leg.lines.length ? ` · вантаж ${fmtKg(leg.kg)}` : ""));
    log2("✈", `${a.name} втрачено (${why})`);
  }

  /* ---------- склад: прийом, передача у війська, удар ---------- */
  function receiveLeg(leg) {
    if (leg.state === "done" || leg.state === "lost") return;
    if (leg.kg > whFree()) { leg.state = "wait"; return; }          // немає місця — вантаж чекає, нічого не списано й не зараховано
    const s = ST.ships.find(x => x.id === leg.ship);
    for (const l of leg.lines) {
      const sl = shipLine(s, l.k);
      if (post("rcv:" + leg.id + ":" + l.k, "receipt", l.k, l.n, s.code, PN[s.p][0])) { sl.tr -= l.n; sl.recv += l.n; }
    }
    leg.state = "done";
  }
  function release(key, n) {
    if (!active()) return { ok: false, msg: "Недоступно" };
    if (infinite()) return { ok: false, msg: "Режим без обмежень: арсенал нескінченний — передача не потрібна" };
    const have = ST.inv[key] | 0; n = Math.min(n | 0, have);
    if (n <= 0) return { ok: false, msg: "На складі немає цієї позиції" };
    const box = ITEMS[key].kind === "w" ? G.stock.ua : G.ads && G.ads.ua;
    if (!box) return { ok: false, msg: "Арсенал недоступний" };
    const opKey = "rel:" + ST.oseq + ":" + key;
    if (!post(opKey, "release", key, n, "війська", ITEMS[key].kind === "w" ? "арсенал" : "склад ППО")) return { ok: false, msg: "Операція відхилена" };
    box[key] = (box[key] | 0) + n;                                  // склад → війська: списання та зарахування — одна пара дій
    try { S7.stockChanged && S7.stockChanged(); H.HOOKS.lpRefresh && H.HOOKS.lpRefresh(); H.HOOKS.apRefresh && H.HOOKS.apRefresh(); } catch (e) { /* */ }
    toast(`Передано у війська: ${ITEMS[key].n} ×${n}`);
    return { ok: true, n };
  }
  function releaseAll() { let c = 0; for (const k of KEYS) if ((ST.inv[k] | 0) > 0) { const r = release(k, ST.inv[k]); if (r.ok) c += r.n; else if (r.msg.startsWith("Режим")) { toast(r.msg); return 0; } } return c; }
  function strikeWh() {
    let any = 0;
    for (const k of KEYS) { const have = ST.inv[k] | 0; if (!have) continue; const n = Math.min(have, Math.floor(have * CFG.WH_HIT_LOSS + Math.random())); if (n > 0 && post("str:" + ST.oseq + ":" + k, "strike", k, n, "склад", "влучання")) any += n; }
    if (any) { toast(`Удар по центральному складу у Львові: знищено ${any} од.`); log2("💥", `Склад у Львові уражено: втрачено ${any} од.`); }
  }
  function onHit(p, k) {
    if (!active() || !Array.isArray(p) || p.length < 2 || (k !== "ground" && k !== "crash" && k !== "kill")) return;
    const t = now();
    let near = null, nd = 1e9;                                    // у повітрі збивається лише ближчий борт; на землі — усі в радіусі
    for (const a of ST.ac) {
      if (a.st === "lost") continue;
      const flying = !!(a.ph && (a.ph.k === "fly" || a.ph.k === "ferry")), d = dkm(acPos(a, t), p);
      if (flying) { if (d <= CFG.HIT_AIR_KM && d < nd) { near = a; nd = d; } }
      else if (d <= CFG.HIT_GROUND_KM) destroyAc(a, "знищено на аеродромі");
    }
    if (near) destroyAc(near, "збито в польоті");
    if (k !== "kill" && dkm(WH_C, p) <= CFG.WH_HIT_KM) strikeWh();
  }

  /* ---------- журнал подій (короткий) ---------- */
  const EVLOG = [];
  function log2(ic, tx) { EVLOG.push({ t: now(), ic, tx }); if (EVLOG.length > 200) EVLOG.shift(); ST.dirty = true; }

  /* ---------- перевірка обліку ---------- */
  function audit() {
    const bad = [];
    for (const k of KEYS) {
      const exp = sum(ST.tot.rcv, k) - sum(ST.tot.rel, k) - sum(ST.tot.str, k);
      if ((ST.inv[k] | 0) !== exp) bad.push(`${ITEMS[k].n}: склад ${(ST.inv[k] | 0)} ≠ приходи−витрати ${exp}`);
      if ((ST.inv[k] | 0) < 0) bad.push(`${ITEMS[k].n}: від'ємний залишок`);
    }
    let ledSum = {}; // журнал обмежений довжиною, тому звіряємо лише якщо він не обрізаний
    const trunc = ST.oseq - 1 > ST.led.length;
    if (!trunc) for (const o of ST.led) { const d = o.kind === "receipt" ? o.qty : (o.kind === "release" || o.kind === "strike") ? -o.qty : 0; ledSum[o.key] = (ledSum[o.key] | 0) + d; }
    if (!trunc) for (const k of KEYS) if ((ledSum[k] | 0) !== (ST.inv[k] | 0)) bad.push(`${ITEMS[k].n}: журнал ${(ledSum[k] | 0)} ≠ склад ${(ST.inv[k] | 0)}`);
    for (const s of ST.ships) {
      const ls = legsOf(s);
      for (const l of s.lines) {
        const queued = l.q - l.tr - l.recv - l.lost - l.ref;
        const inL = (states) => ls.filter(x => states.has(x.state)).reduce((a, x) => a + (x.lines.find(y => y.k === l.k) || { n: 0 }).n, 0);
        if (queued < 0 || l.tr < 0 || l.recv < 0 || l.lost < 0) bad.push(`${s.code} ${ITEMS[l.k].n}: від'ємна кількість`);
        if (queued !== inL(NOT_DEPARTED)) bad.push(`${s.code} ${ITEMS[l.k].n}: в черзі ${queued} ≠ у рейсах ${inL(NOT_DEPARTED)}`);
        if (l.tr !== inL(IN_TRANSIT)) bad.push(`${s.code} ${ITEMS[l.k].n}: у дорозі ${l.tr} ≠ у рейсах ${inL(IN_TRANSIT)}`);
      }
    }
    const rcvShips = ST.ships.reduce((a, s) => { for (const l of s.lines) add(a, l.k, l.recv); return a; }, {});
    for (const k of KEYS) if (sum(rcvShips, k) !== sum(ST.tot.rcv, k)) bad.push(`${ITEMS[k].n}: отримано в партіях ${sum(rcvShips, k)} ≠ проводки ${sum(ST.tot.rcv, k)}`);
    ST.audit = { t: now(), bad };
    return bad;
  }

  /* ---------- крок ---------- */
  function autoAid(t) {
    if (!ST.auto || !active()) return;
    const dx = DX();
    for (const p of PIDS) {
      if (t < ST.nextAuto[p]) continue;
      const rel = dx && dx.ok() ? dx.rel(p, "ua") : 50;
      ST.nextAuto[p] = t + CFG.AUTO_H * 60 * (1.6 - clamp(rel, 0, 100) / 100) * (0.8 + Math.random() * 0.8);
      if (rel < 25 || Math.random() > 0.3 + rel / 200 || ST.ships.filter(s => !isFinal(s)).length >= CFG.MAX_ACTIVE) continue;
      const pool = PARTNERS[p].lines.filter(l => Math.floor(ST.avail[p][l.k]) >= 1), want = {};
      for (let i = 0, n = 1 + Math.floor(Math.random() * 2); i < n && pool.length; i++) { const l = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]; want[l.k] = Math.max(1, Math.min(Math.floor(ST.avail[p][l.k]), Math.round(l.max * (0.3 + Math.random() * 0.7)))); }
      if (!Object.keys(want).length) continue;
      const s = createShip(p, want, true);
      if (s) { toast(`${PN[p][1]} ${PN[p][0]} оголосила пакет допомоги ${s.code}`); log2("🎁", `${PN[p][0]} відправляє партію ${s.code}: ` + s.lines.map(l => `${ITEMS[l.k].n} ×${l.q}`).join(", ")); }
    }
  }
  function step() {
    if (!G.on) { feat(true); return; }
    if (ST.gstart !== G.start || ST.gon !== true) { /* початок нового бою обробляє onGameStart */ }
    const t = now(), dt = clamp(t - ST.lastT, 0, 1440); ST.lastT = t;
    if (dt > 0) for (const p of PIDS) for (const l of PARTNERS[p].lines) ST.avail[p][l.k] = Math.min(l.avail, ST.avail[p][l.k] + l.regen * dt / 1440);
    if (active()) autoAid(t);
    /* наземні рейси */
    for (const leg of ST.legs) {
      const s = ST.ships.find(x => x.id === leg.ship);
      if (leg.mode === "ground") {
        if (leg.state === "queued" && t >= leg.readyAt) { leg.state = "loading"; leg.t0 = leg.readyAt + CFG.GROUND_WAIT; }
        if (leg.state === "loading" && t >= leg.t0) { leg.state = "moving"; leg.t1 = leg.t0 + leg.dist / CFG.GROUND_KMM; for (const l of leg.lines) shipLine(s, l.k).tr += l.n; }
        if (leg.state === "moving" && t >= leg.t1) { leg.state = "transfer"; leg.t1 += CFG.WH_MOVE_MIN; }
      }
      if ((leg.state === "transfer" && t >= leg.t1) || leg.state === "wait") receiveLeg(leg);
    }
    /* повітряні рейси: диспетчер */
    for (const a of ST.ac) {
      if (a.st === "lost" && a.respawn && t >= a.respawn) { a.st = "parked"; a.at = "LWO"; a.respawn = 0; toast(a.name + ": замінний борт прибув від партнерів"); }
      let guard = 8; while (a.ph && t >= a.ph.t1 && guard--) finishPhase(a);
    }
    for (const leg of ST.legs) {
      if (leg.mode !== "air" || leg.state !== "queued" || leg.ac || t < leg.readyAt) continue;
      const free = ST.ac.filter(a => a.st === "parked" && !a.ph);
      if (!free.length) break;
      free.sort((x, y) => dkm(NODES[x.at].c, NODES[leg.hub].c) - dkm(NODES[y.at].c, NODES[leg.hub].c));
      assign(free[0], leg, t);
    }
    for (const a of ST.ac) { a.pos = acPos(a, t); if (a.ph && (a.ph.k === "fly" || a.ph.k === "ferry")) a.hdg = brg(a.ph.from, a.ph.to); else if (a.st === "parked") a.hdg = 90; }
    /* статуси партій і події */
    for (const s of ST.ships) {
      const ns = statusOf(s);
      if (ns !== s.status) {
        const old = s.status; s.status = ns; ST.dirty = true;
        if (ns === "enroute" && old !== "enroute") toast(`Партія ${s.code} (${PN[s.p][0]}) у дорозі до Львова`);
        if (ns === "received" || ns === "partial" || ns === "lost") {
          const rc = s.lines.reduce((a, l) => a + l.recv, 0), ls = s.lines.reduce((a, l) => a + l.lost, 0);
          toast(ns === "lost" ? `Партія ${s.code} втрачена повністю` : `Партія ${s.code} прийнята на склад у Львові: ${rc} од.` + (ls ? `, втрачено ${ls}` : ""));
          log2(ns === "lost" ? "✖" : "✔", `${s.code}: ${STAT[ns][0].toLowerCase()} — прийнято ${rc}, втрачено ${ls}`);
          if (rc > 0 && !s.rewarded) { s.rewarded = true; const dx = DX(); try { if (dx && dx.ok()) dx.addR(s.p, "ua", 1); } catch (e) { /* */ } }
        }
      }
    }
    feat(); renderPanel();
  }

  /* ---------- карта ---------- */
  const SRC = "arms-src";
  const zi = (...a) => ["interpolate", ["linear"], ["zoom"], ...a];
  function sprite(draw, w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); return c.getContext("2d").getImageData(0, 0, w, h); }
  function drawAn26(g, w, h, col, op) {
    g.translate(w / 2, h / 2); g.globalAlpha = op || 1; g.fillStyle = col; g.strokeStyle = "rgba(4,10,24,.95)"; g.lineWidth = 2.2; g.lineJoin = "round";
    const P = (pts) => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fill(); g.stroke(); };
    P([[0, -34], [4, -26], [5, -6], [5, 18], [3.5, 33], [0, 36], [-3.5, 33], [-5, 18], [-5, -6], [-4, -26]]);                 // фюзеляж (ніс вгору)
    P([[-5, -4], [-40, 0], [-40, 7], [-5, 11]]); P([[5, -4], [40, 0], [40, 7], [5, 11]]);                                       // прямі верхні крила
    P([[-4, 27], [-17, 31], [-17, 35], [-3, 34]]); P([[4, 27], [17, 31], [17, 35], [3, 34]]);                                   // стабілізатор
    P([[-3, 28], [-1, 24], [1, 24], [3, 28], [1, 38], [-1, 38]]);                                                               // кіль/рампа
    for (const x of [-16, 16]) { g.beginPath(); g.ellipse(x, 2, 3.6, 8, 0, 0, 7); g.fill(); g.stroke(); g.beginPath(); g.moveTo(x - 8, -8); g.lineTo(x + 8, -8); g.lineWidth = 2; g.stroke(); g.lineWidth = 2.2; } // гондоли + гвинти
  }
  function drawWh(g, w, h) {
    g.translate(w / 2, h / 2); g.fillStyle = "rgba(255,197,61,.18)"; g.strokeStyle = "#ffc53d"; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 28, 0, 7); g.fill(); g.stroke();
    g.fillStyle = "#ffc53d"; g.beginPath(); g.moveTo(-17, -4); g.lineTo(0, -17); g.lineTo(17, -4); g.lineTo(17, 15); g.lineTo(-17, 15); g.closePath(); g.fill();
    g.fillStyle = "#0a1226"; g.fillRect(-9, 2, 18, 13); g.fillStyle = "#ffc53d"; for (const y of [5, 9, 13]) g.fillRect(-9, y, 18, 1.5);
  }
  function drawNode(g, w, h) { g.translate(w / 2, h / 2); g.strokeStyle = "#7fb4ff"; g.fillStyle = "rgba(47,140,255,.25)"; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 14, 0, 7); g.fill(); g.stroke(); g.beginPath(); g.moveTo(0, -9); g.lineTo(0, 9); g.moveTo(-9, 0); g.lineTo(9, 0); g.stroke(); }
  let mapOK = false;
  function ensureMap() {
    if (mapOK) return true;
    try {
      if (!map.isStyleLoaded || !map.isStyleLoaded()) return false;
      if (!map.hasImage("arms-an26")) { map.addImage("arms-an26", sprite((g, w, h) => drawAn26(g, w, h, "#4cc3ff"), 96, 96), { pixelRatio: 2 }); map.addImage("arms-an26-p", sprite((g, w, h) => drawAn26(g, w, h, "#4cc3ff", .55), 96, 96), { pixelRatio: 2 }); map.addImage("arms-an26-x", sprite((g, w, h) => drawAn26(g, w, h, "#ff7a6b", .8), 96, 96), { pixelRatio: 2 }); }
      if (!map.hasImage("arms-wh")) map.addImage("arms-wh", sprite(drawWh, 72, 72), { pixelRatio: 2 });
      if (!map.hasImage("arms-node")) map.addImage("arms-node", sprite(drawNode, 48, 48), { pixelRatio: 2 });
      if (!map.getSource(SRC)) map.addSource(SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      if (!map.getLayer("arms-rt")) map.addLayer({ id: "arms-rt", type: "line", source: SRC, filter: ["==", ["get", "k"], "rt"], paint: { "line-color": "#4cc3ff", "line-width": 1.6, "line-opacity": 0.6, "line-dasharray": [2, 2] } });
      if (!map.getLayer("arms-node")) map.addLayer({ id: "arms-node", type: "symbol", source: SRC, filter: ["==", ["get", "k"], "node"], layout: { "icon-image": "arms-node", "icon-size": zi(4, 0.4, 8, 0.6, 12, 0.9), "icon-allow-overlap": true, "text-field": ["step", ["zoom"], "", 6, ["get", "lb"]], "text-font": ["Noto Sans Bold"], "text-size": 10, "text-anchor": "top", "text-offset": [0, 1.2], "text-optional": true }, paint: { "text-color": "#9ec8ff", "text-halo-color": "rgba(0,0,0,.9)", "text-halo-width": 1.3 } });
      if (!map.getLayer("arms-wh")) map.addLayer({ id: "arms-wh", type: "symbol", source: SRC, filter: ["==", ["get", "k"], "wh"], layout: { "icon-image": "arms-wh", "icon-size": zi(4, 0.5, 8, 0.75, 12, 1.1), "icon-allow-overlap": true, "text-field": ["step", ["zoom"], "", 6.5, ["get", "lb"]], "text-font": ["Noto Sans Bold"], "text-size": 10, "text-anchor": "top", "text-offset": [0, 1.6], "text-optional": true }, paint: { "text-color": "#ffc53d", "text-halo-color": "rgba(0,0,0,.9)", "text-halo-width": 1.4 } });
      if (!map.getLayer("arms-ac")) map.addLayer({ id: "arms-ac", type: "symbol", source: SRC, filter: ["==", ["get", "k"], "ac"], layout: { "icon-image": ["get", "img"], "icon-size": zi(4, 0.45, 8, 0.7, 12, 1.0), "icon-rotate": ["get", "rot"], "icon-rotation-alignment": "map", "icon-allow-overlap": true, "icon-ignore-placement": true, "text-field": ["step", ["zoom"], "", 6, ["get", "lb"]], "text-font": ["Noto Sans Bold"], "text-size": 10, "text-anchor": "top", "text-offset": [0, 1.6], "text-optional": true }, paint: { "text-color": "#8fe0ff", "text-halo-color": "rgba(0,0,0,.9)", "text-halo-width": 1.3 } });
      for (const id of ["arms-ac", "arms-wh"]) { map.on("click", id, () => { openPanel(id === "arms-wh" ? "wh" : "ac"); }); map.on("mouseenter", id, () => { map.getCanvas().style.cursor = "pointer"; }); map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; }); }
      mapOK = true;
    } catch (e) { return false; }
    return true;
  }
  let lastSig = "";
  function feat(clear) {
    if (!ensureMap()) return;
    const F = [];
    if (!clear && active()) {
      for (const n of Object.values(NODES)) F.push({ type: "Feature", properties: { k: "node", lb: n.n }, geometry: { type: "Point", coordinates: n.c } });
      F.push({ type: "Feature", properties: { k: "wh", lb: `Центральний склад · Львів · ${fmtKg(whUsed())}` }, geometry: { type: "Point", coordinates: WH_C } });
      const rts = new Set(); for (const l of ST.legs) if (l.mode === "air" && !["done", "lost", "cancelled"].includes(l.state)) rts.add(l.hub);
      for (const h of rts) F.push({ type: "Feature", properties: { k: "rt" }, geometry: { type: "LineString", coordinates: [NODES[h].c, NODES.LWO.c] } });
      for (const a of ST.ac) if (a.st !== "lost" && a.pos) F.push({ type: "Feature", properties: { k: "ac", img: a.ph && (a.ph.k === "fly" || a.ph.k === "ferry") ? "arms-an26" : "arms-an26-p", rot: a.hdg, lb: a.name + (a.load ? " · " + fmtKg(a.load) : "") }, geometry: { type: "Point", coordinates: a.pos } });
    }
    const sig = JSON.stringify(F);
    if (sig === lastSig) return; lastSig = sig;
    try { map.getSource(SRC).setData({ type: "FeatureCollection", features: F }); } catch (e) { /* */ }
  }

  /* ---------- інтерфейс ---------- */
  let panel = null, btn = null;
  function mount() {
    if (btn) return;
    const c = $("controls"); if (!c) return;
    btn = document.createElement("button"); btn.id = "armsZb"; btn.type = "button"; btn.className = "btn"; btn.title = "Міжнародні поставки озброєння · склад у Львові"; btn.setAttribute("aria-label", "Поставки озброєння");
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-5 9 5v11H3z"/><path d="M8 20v-6h8v6M8 14h8M12 9v.01"/></svg>';
    btn.addEventListener("click", e => { e.stopPropagation(); panel.hidden ? openPanel() : (panel.hidden = true); });
    c.appendChild(btn);
    panel = document.createElement("div"); panel.id = "armsPanel"; panel.hidden = true; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Поставки озброєння"); document.body.appendChild(panel);
    panel.addEventListener("click", onClick); panel.addEventListener("change", onChange);
  }
  function openPanel(tab) { if (tab) ST.tab = tab; panel.hidden = false; ST.sig = ""; renderPanel(true); }
  const chip = (txt, c) => `<span class="ar-chip ${c || ""}">${esc(txt)}</span>`;
  const bar = (v, mx, c) => `<i class="ar-bar ${c || ""}"><b style="width:${Math.round(clamp(mx ? v / mx : 0, 0, 1) * 100)}%"></b></i>`;
  function tabsHtml() {
    const T = [["wh", "Склад"], ["ships", "Партії"], ["new", "Сформувати"], ["ac", "Ан-26"], ["ops", "Операції"]];
    const act = ST.ships.filter(s => !isFinal(s)).length;
    return `<div class="ar-tabs">` + T.map(([k, n]) => `<button data-a="tab" data-v="${k}" class="${ST.tab === k ? "on" : ""}">${n}${k === "ships" && act ? `<em>${act}</em>` : ""}</button>`).join("") + `</div>`;
  }
  function tabWh() {
    const used = whUsed(), inf = infinite();
    let h = `<div class="ar-sum"><div><span>Склад заповнено</span><b>${fmtKg(used)} / ${fmtKg(CFG.WH_CAP_KG)}</b>${bar(used, CFG.WH_CAP_KG, used > CFG.WH_CAP_KG * .9 ? "bd" : "")}</div></div>`;
    h += `<div class="ar-act"><button data-a="relall" ${used ? "" : "disabled"}>Передати все у війська</button><button data-a="audit">Перевірка обліку</button></div>`;
    if (inf) h += `<div class="ar-note">Режим без обмежень: арсенал нескінченний, передача у війська вимкнена.</div>`;
    if (ST.audit) h += `<div class="ar-note ${ST.audit.bad.length ? "bd" : "ok"}">${ST.audit.bad.length ? "Знайдено розбіжності: " + esc(ST.audit.bad.join(" · ")) : "Облік сходиться: склад ↔ партії ↔ журнал ✔ (" + fmtT(ST.audit.t) + ")"}</div>`;
    h += `<table class="ar-tb"><thead><tr><th>Позиція</th><th title="Фізично на складі = доступно до видачі">На складі</th><th title="Партії ще не вилетіли">Очікується</th><th title="Вантаж у польоті / на колоні">У дорозі</th><th>Передано</th><th>Втрачено</th><th></th></tr></thead><tbody>`;
    let rows = 0;
    for (const k of KEYS) {
      const onh = ST.inv[k] | 0, rel = sum(ST.tot.rel, k), lostT = sum(ST.tot.loss, k) + sum(ST.tot.str, k);
      let q = 0, tr = 0; for (const s of ST.ships) { const l = shipLine(s, k); if (l && !s.cancelled) { q += l.q - l.tr - l.recv - l.lost - l.ref; tr += l.tr; } }
      if (!(onh || rel || lostT || q || tr)) continue; rows++;
      h += `<tr><td><b>${esc(ITEMS[k].n)}</b><small>${ITEMS[k].cat} · ${fmtKg(ITEMS[k].kg)}/од.</small></td><td class="n">${onh}</td><td class="n">${q || "·"}</td><td class="n">${tr || "·"}</td><td class="n">${rel || "·"}</td><td class="n ${lostT ? "bd" : ""}">${lostT || "·"}</td><td><button class="ar-sm" data-a="rel" data-v="${k}" ${onh && !inf ? "" : "disabled"}>У війська</button></td></tr>`;
    }
    if (!rows) h += `<tr><td colspan="7" class="ar-empty">Склад порожній. Сформуйте партію у вкладці «Сформувати» — або дочекайтеся пакета допомоги від партнерів.</td></tr>`;
    h += `</tbody></table>`;
    h += `<label class="ar-chk"><input type="checkbox" data-a="auto" ${ST.auto ? "checked" : ""}> Партнери надсилають пакети допомоги самі</label>`;
    return h;
  }
  function shipHtml(s) {
    const [tx, c] = STAT[s.status] || STAT.ready, ls = legsOf(s), done = ls.filter(l => l.state === "done" || l.state === "lost").length;
    const open = ST.openShip === s.id, kg = linesKg(s.lines.map(l => ({ k: l.k, n: l.q })));
    let h = `<div class="ar-ship"><div class="ar-sh" data-a="open" data-v="${s.id}"><b>${s.code}</b><span>${PN[s.p][1]} ${esc(PN[s.p][0])}${s.auto ? " · допомога" : ""}</span>${chip(tx, c)}</div>`;
    h += `<div class="ar-sm2">${s.lines.map(l => `${esc(ITEMS[l.k].n)} ×${l.q}`).join(" · ")} · ${fmtKg(kg)} · рейсів ${done}/${ls.length}</div>`;
    if (s.status === "forming") h += bar(now() - s.t0, s.tForm - s.t0);
    if (open) {
      h += `<table class="ar-tb sm"><thead><tr><th>Позиція</th><th>Замовл.</th><th>Черга</th><th>В дорозі</th><th>Прийнято</th><th>Втрачено</th></tr></thead><tbody>` +
        s.lines.map(l => { const q = l.q - l.tr - l.recv - l.lost - l.ref; return `<tr><td>${esc(ITEMS[l.k].n)}</td><td class="n">${l.q}</td><td class="n">${q}</td><td class="n">${l.tr}</td><td class="n ok">${l.recv}</td><td class="n ${l.lost ? "bd" : ""}">${l.lost}</td></tr>`; }).join("") + `</tbody></table>`;
      h += `<div class="ar-sm2">Транспорт: ${ls.map(l => l.mode === "air" ? "Ан-26" : "наземний коридор").filter((x, i, a) => a.indexOf(x) === i).join(" + ")} · створено ${fmtT(s.t0)}</div>`;
    }
    if (!isFinal(s) && legsOf(s).every(l => l.state === "queued" && !l.ac)) h += `<button class="ar-sm bd" data-a="cancel" data-v="${s.id}">Скасувати партію</button>`;
    return h + `</div>`;
  }
  function tabShips() { return ST.ships.length ? ST.ships.slice().reverse().map(shipHtml).join("") : `<div class="ar-empty">Партій ще немає.</div>`; }
  function tabNew() {
    const p = ST.partner, P = PARTNERS[p], dx = DX(), rel = dx && dx.ok() ? Math.round(dx.rel(p, "ua")) : null;
    let h = `<div class="ar-flt">` + PIDS.map(x => `<button data-a="partner" data-v="${x}" class="${x === p ? "on" : ""}">${PN[x][1]} ${esc(PN[x][0])}</button>`).join("") + `</div>`;
    h += `<div class="ar-sm2">Відносини з Україною: <b>${rel == null ? "—" : rel}</b> · вузол вильоту: ${esc(NODES[P.hub].n)} · мін. відносини ${CFG.MIN_REL}</div>`;
    if (P.presets && P.presets.length) h += `<div class="ar-flt">` + P.presets.map((pr, i) => `<button data-a="preset" data-v="${i}">${esc(pr[0])}</button>`).join("") + `</div>`;
    h += `<table class="ar-tb"><thead><tr><th>Перелік</th><th>Доступно</th><th>Макс.</th><th>Кількість</th></tr></thead><tbody>`;
    let kg = 0, n = 0;
    for (const l of P.lines) {
      const av = Math.floor(ST.avail[p][l.k] + 1e-9), q = Math.min(ST.draft[l.k] | 0, av, l.max);
      kg += q * ITEMS[l.k].kg; n += q;
      h += `<tr><td><b>${esc(ITEMS[l.k].n)}</b><small>${ITEMS[l.k].cat} · ${fmtKg(ITEMS[l.k].kg)}/од. · ${isAir(l.k) ? "Ан-26" : "наземний коридор"}</small></td><td class="n">${av}</td><td class="n">${l.max}</td><td class="n"><button class="ar-sm" data-a="dec" data-v="${l.k}">−</button><input type="number" min="0" max="${Math.min(av, l.max)}" value="${q}" data-k="${l.k}" class="ar-in"><button class="ar-sm" data-a="inc" data-v="${l.k}">+</button></td></tr>`;
    }
    h += `</tbody></table>`;
    const want = {}; for (const l of P.lines) { const q = Math.min(ST.draft[l.k] | 0, Math.floor(ST.avail[p][l.k] + 1e-9), l.max); if (q > 0) want[l.k] = q; }
    const pk = packLegs(Object.keys(want).map(k => ({ k, q: want[k] })));
    const err = n ? validate(p, want) : "";
    h += `<div class="ar-sum2">Разом: <b>${n}</b> од. · ${fmtKg(kg)} · рейсів Ан-26: <b>${pk.air.length}</b>${pk.ground.length ? " + наземний коридор" : ""} · формування ≈ ${CFG.FORM_BASE + CFG.FORM_PER_LINE * Object.keys(want).length} хв</div>`;
    if (err) h += `<div class="ar-note bd">${esc(err)}</div>`;
    h += `<div class="ar-act"><button class="go" data-a="send" ${n && !err ? "" : "disabled"}>Запросити партію</button><button data-a="clear">Очистити</button></div>`;
    return h;
  }
  function tabAc() {
    let h = `<div class="ar-sm2">Транспортні літаки Ан-26: корисне навантаження ${fmtKg(CFG.PAYLOAD_KG)}, крейсерська ≈ ${Math.round(CFG.CRUISE_KMM * 60)} км/год. Борт, що втрачено, замінюється через ${Math.round(CFG.REPLACE_MIN / 60)} год.</div>`;
    const t = now();
    for (const a of ST.ac) {
      const leg = a.leg && ST.legs.find(l => l.id === a.leg), s = leg && ST.ships.find(x => x.id === leg.ship);
      const stt = { parked: "На стоянці", busy: "Призначено", ferry: "Перегін до вузла", loading: "Завантаження", flying: "У польоті", unloading: "Розвантаження", lost: "Втрачено" }[a.st] || a.st;
      const eta = a.ph && a.ph.t1 > t ? Math.ceil(a.ph.t1 - t) : 0;
      h += `<div class="ar-ac ${a.st === "lost" ? "lost" : ""}"><b>✈ ${esc(a.name)}</b>${chip(stt, a.st === "lost" ? "bd" : a.st === "flying" ? "bl" : "mu")}<div class="ar-sm2">${a.st === "lost" ? `заміна через ${Math.max(0, Math.ceil(a.respawn - t))} хв` : `${esc(NODES[a.at].n)}${s ? ` · партія ${s.code} · вантаж ${fmtKg(leg.kg)}` : ""}${eta ? ` · фаза ≈ ${eta} хв` : ""}`}</div>` +
        (a.pos && a.st !== "lost" ? `<button class="ar-sm" data-a="focus" data-v="${a.id}">Показати на мапі</button>` : "") + `</div>`;
    }
    return h;
  }
  function tabOps() {
    const F = ST.flt, f = [["all", "Усі"], ["receipt", "Надходження"], ["out", "Списання"], ["loss", "Втрати"]];
    let h = `<div class="ar-flt">` + f.map(([k, n]) => `<button data-a="flt" data-v="${k}" class="${F === k ? "on" : ""}">${n}</button>`).join("") + `</div>`;
    const tot = k => KEYS.reduce((a, x) => a + sum(ST.tot[k], x), 0);
    h += `<div class="ar-sm2">Усього: надійшло <b class="ok">${tot("rcv")}</b> · передано у війська <b>${tot("rel")}</b> · знищено на складі <b class="bd">${tot("str")}</b> · втрачено в дорозі <b class="bd">${tot("loss")}</b> · повернено партнерам ${tot("ref")}</div>`;
    const rows = ST.led.filter(o => o.kind !== "reserve").filter(o => F === "all" || (F === "receipt" && o.kind === "receipt") || (F === "out" && (o.kind === "release" || o.kind === "strike")) || (F === "loss" && (o.kind === "loss" || o.kind === "strike"))).slice(-120).reverse();
    if (!rows.length) return h + `<div class="ar-empty">Операцій немає.</div>`;
    h += `<table class="ar-tb sm"><thead><tr><th>№</th><th>Час</th><th>Операція</th><th>Позиція</th><th>К-сть</th><th>Залишок</th><th>Документ</th></tr></thead><tbody>` +
      rows.map(o => { const [tx, c] = KIND[o.kind]; const sign = o.kind === "receipt" ? "+" : o.kind === "release" || o.kind === "strike" ? "−" : ""; return `<tr><td>${o.id}</td><td>${fmtT(o.t)}</td><td class="${c}">${tx}</td><td>${esc(ITEMS[o.key].n)}</td><td class="n ${c}">${sign}${o.qty}</td><td class="n">${o.kind === "loss" || o.kind === "refund" ? "—" : o.bal}</td><td>${esc(o.ref)}${o.note ? " · " + esc(o.note) : ""}</td></tr>`; }).join("") + `</tbody></table>`;
    if (EVLOG.length) h += `<div class="ar-ev">` + EVLOG.slice(-8).reverse().map(e => `<div>${fmtT(e.t)} ${e.ic} ${esc(e.tx)}</div>`).join("") + `</div>`;
    return h;
  }
  function renderPanel(force) {
    if (!panel || panel.hidden) return;
    const ae = document.activeElement; if (!force && ae && panel.contains(ae) && ae.tagName === "INPUT" && ae.type === "number") return;
    const sig = [ST.tab, ST.gid, ST.led.length, ST.ships.length, ST.partner, ST.flt, ST.openShip, JSON.stringify(ST.draft), ST.ships.map(s => s.status).join(), ST.ac.map(a => a.st + (a.ph ? a.ph.k : "")).join(), Math.floor(now() / 5), ST.audit && ST.audit.t, ST.auto, G.on, active()].join("|");
    if (!force && sig === ST.sig) return; ST.sig = sig;
    let body;
    if (!G.on) body = `<div class="ar-empty">Поставки доступні під час бою. Почніть гру за Україну.</div>`;
    else if (!active()) body = `<div class="ar-empty">Міжнародні поставки доступні лише гравцю за Україну (не в мережевому бою).</div>`;
    else body = ({ wh: tabWh, ships: tabShips, new: tabNew, ac: tabAc, ops: tabOps }[ST.tab] || tabWh)();
    const st = panel.querySelector(".ar-body"), sc = st ? st.scrollTop : 0;
    panel.innerHTML = `<div class="ar-hd"><b>📦 Поставки · склад Львів</b><button data-a="close" class="ar-x" aria-label="Закрити">×</button></div>${G.on && active() ? tabsHtml() : ""}<div class="ar-body">${body}</div>`;
    const nb = panel.querySelector(".ar-body"); if (nb) nb.scrollTop = sc;
  }
  function onClick(e) {
    const b = e.target.closest("[data-a]"); if (!b || b.tagName === "INPUT") return; e.stopPropagation();
    const a = b.dataset.a, v = b.dataset.v, P = PARTNERS[ST.partner];
    if (a === "close") panel.hidden = true;
    else if (a === "tab") ST.tab = v;
    else if (a === "open") ST.openShip = ST.openShip == (+v) ? null : +v;
    else if (a === "partner") { ST.partner = v; ST.draft = {}; }
    else if (a === "preset") { ST.draft = {}; for (const k in P.presets[+v][1]) { const l = P.lines.find(x => x.k === k); if (l) ST.draft[k] = Math.min(P.presets[+v][1][k], l.max, Math.floor(ST.avail[ST.partner][k])); } }
    else if (a === "inc" || a === "dec") { const l = P.lines.find(x => x.k === v); ST.draft[v] = clamp((ST.draft[v] | 0) + (a === "inc" ? 1 : -1), 0, Math.min(l.max, Math.floor(ST.avail[ST.partner][v]))); }
    else if (a === "clear") ST.draft = {};
    else if (a === "send") { const want = {}; for (const l of P.lines) { const q = Math.min(ST.draft[l.k] | 0, Math.floor(ST.avail[ST.partner][l.k] + 1e-9), l.max); if (q > 0) want[l.k] = q; } if (request(ST.partner, want).ok) { ST.draft = {}; ST.tab = "ships"; } }
    else if (a === "cancel") cancel(+v);
    else if (a === "rel") release(v, ST.inv[v] | 0);
    else if (a === "relall") { const n = releaseAll(); if (n) toast(`Передано у війська: ${n} од.`); }
    else if (a === "audit") audit();
    else if (a === "flt") ST.flt = v;
    else if (a === "focus") { const ac = ST.ac.find(x => x.id === +v); if (ac && ac.pos) map.easeTo({ center: ac.pos, zoom: Math.max(map.getZoom(), 8) }); }
    renderPanel(true);
  }
  function onChange(e) {
    const t = e.target;
    if (t.dataset && t.dataset.a === "auto") { ST.auto = t.checked; return; }
    if (t.classList.contains("ar-in")) { const k = t.dataset.k, l = PARTNERS[ST.partner].lines.find(x => x.k === k); ST.draft[k] = clamp(parseInt(t.value, 10) || 0, 0, Math.min(l.max, Math.floor(ST.avail[ST.partner][k]))); renderPanel(true); }
  }

  /* ---------- підключення до гри ---------- */
  const prevStart = S7.onGameStart;
  S7.onGameStart = function () { fresh(); lastSig = ""; ST.sig = ""; return prevStart ? prevStart.apply(this, arguments) : undefined; };
  const prevFx = H.HOOKS.fx;
  H.HOOKS.fx = function (p, k) { try { onHit(p, k); } catch (e) { /* */ } return prevFx ? prevFx.apply(this, arguments) : undefined; };

  mount();
  setInterval(() => { try { mount(); step(); } catch (e) { if (window.console) console.error("[arms]", e); } }, 150);

  window.BV_ARMS = {
    request, cancel, release, releaseAll, audit, cfg: CFG, items: ITEMS, partners: PARTNERS, nodes: NODES,
    state: () => ST, stock: () => Object.assign({}, ST.inv), ledger: () => ST.led.slice(), ships: () => ST.ships.map(s => Object.assign({}, s, { lines: s.lines.map(l => Object.assign({}, l)) })),
    aircraft: () => ST.ac.map(a => ({ id: a.id, name: a.name, st: a.st, at: a.at, pos: a.pos, load: a.load })),
    open: openPanel, whUsed, whFree, _post: post, _hit: onHit, _step: step, _fresh: fresh
  };
})();
