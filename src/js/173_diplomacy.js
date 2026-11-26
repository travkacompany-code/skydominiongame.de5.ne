/* SKYDOMINION · 173 · ДИПЛОМАТІЯ
   Відносини держав (-100…+100), союзи, військові договори, торгівля, санкції, війна / перемир'я / мир,
   самостійний дипломатичний ІІ, дипломатичні події, вкладка «Дипломатія».
   Підключається мостом BV_DIPX (tools/apply_diplomacy.py) і викликами BV_DIP.step/start/over/incK/truceOn у 03_game.js.
   Світ зберігається в localStorage (ключ bv-dip1:<профіль>). У мережевих боях (online) дипломатія вимкнена.
   Етап 7.73: запит повітряного простору (розділ «повітряний простір» нижче, вкладка «Небо», мости BV_DIP.airGrid / airUse). */
(function (){
  "use strict";
  const XX = () => window.BV_DIPX, GM = () => window.BV_GAME;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const rnd = Math.random, pick = a => a[Math.floor(rnd() * a.length)];

  /* ---------- держави ---------- */
  // pow — військова міць, eco — економіка (1…10), ide — ідеологія (-1 Захід … +1 Схід), aggr — агресивність, tr — схильність до торгівлі, loy — вірність союзникам
  const ST = [
    { id: "ua", n: "Україна", f: "🇺🇦", pow: 5, eco: 3, ide: -0.9, aggr: 0.25, tr: 0.6, loy: 0.9, nb: ["ru", "by", "pl", "ro", "hu"] },
    { id: "ru", n: "Росія", f: "🇷🇺", pow: 8, eco: 6, ide: 0.9, aggr: 0.6, tr: 0.5, loy: 0.8, nb: ["ua", "by", "pl", "cn", "kp"] },
    { id: "us", n: "США", f: "🇺🇸", pow: 10, eco: 10, ide: -0.8, aggr: 0.2, tr: 0.7, loy: 0.85, nb: [] },
    { id: "gb", n: "Велика Британія", f: "🇬🇧", pow: 6, eco: 6, ide: -0.85, aggr: 0.15, tr: 0.7, loy: 0.9, nb: ["fr"] },
    { id: "de", n: "Німеччина", f: "🇩🇪", pow: 5, eco: 8, ide: -0.75, aggr: 0.05, tr: 0.85, loy: 0.7, nb: ["pl", "fr"] },
    { id: "fr", n: "Франція", f: "🇫🇷", pow: 6, eco: 6, ide: -0.7, aggr: 0.15, tr: 0.7, loy: 0.75, nb: ["de", "gb"] },
    { id: "pl", n: "Польща", f: "🇵🇱", pow: 4, eco: 4, ide: -0.85, aggr: 0.15, tr: 0.6, loy: 0.9, nb: ["ua", "by", "de", "ru"] },
    { id: "ro", n: "Румунія", f: "🇷🇴", pow: 3, eco: 3, ide: -0.75, aggr: 0.1, tr: 0.6, loy: 0.8, nb: ["ua", "hu"] },
    { id: "hu", n: "Угорщина", f: "🇭🇺", pow: 2, eco: 3, ide: 0.2, aggr: 0.1, tr: 0.7, loy: 0.4, nb: ["ua", "ro"] },
    { id: "tr", n: "Туреччина", f: "🇹🇷", pow: 5, eco: 5, ide: 0.1, aggr: 0.3, tr: 0.85, loy: 0.5, nb: ["ir"] },
    { id: "by", n: "Білорусь", f: "🇧🇾", pow: 2, eco: 2, ide: 0.9, aggr: 0.2, tr: 0.5, loy: 0.85, nb: ["ua", "ru", "pl"] },
    { id: "cn", n: "Китай", f: "🇨🇳", pow: 9, eco: 10, ide: 0.7, aggr: 0.3, tr: 0.95, loy: 0.5, nb: ["ru", "kp", "in"] },
    { id: "ir", n: "Іран", f: "🇮🇷", pow: 4, eco: 3, ide: 0.85, aggr: 0.5, tr: 0.6, loy: 0.7, nb: ["tr"] },
    { id: "kp", n: "КНДР", f: "🇰🇵", pow: 3, eco: 1, ide: 0.95, aggr: 0.6, tr: 0.3, loy: 0.8, nb: ["cn", "ru"] },
    { id: "in", n: "Індія", f: "🇮🇳", pow: 6, eco: 7, ide: 0.3, aggr: 0.15, tr: 0.9, loy: 0.3, nb: ["cn"] }
  ];
  const BY = {}; ST.forEach(s => BY[s.id] = s);
  const IDS = ST.map(s => s.id), MAIN = ["ua", "ru"], other = sd => sd === "ua" ? "ru" : "ua";
  const OVR = { "ua|ru": -100, "ua|by": -55, "ua|ir": -40, "ua|kp": -70, "ua|cn": -5, "ua|in": 15, "tr|ua": 35, "hu|ua": -10, "pl|ua": 70, "gb|ua": 75, "ua|us": 55, "de|ua": 60, "fr|ua": 55, "ro|ua": 60,
    "by|ru": 75, "kp|ru": 70, "ir|ru": 55, "cn|ru": 55, "in|ru": 40, "ru|tr": 5, "hu|ru": 20, "ru|us": -60, "gb|ru": -75, "pl|ru": -80, "ro|ru": -55, "de|ru": -55, "fr|ru": -45,
    "cn|us": -35, "ir|us": -70, "kp|us": -80, "cn|in": -10, "by|pl": -60, "by|gb": -50, "by|us": -55, "cn|kp": 50, "ir|kp": 40, "cn|ir": 35, "gb|us": 80, "fr|gb": 65, "de|fr": 70, "de|us": 65, "pl|us": 65, "pl|de": 40 };
  const key = (a, b) => a < b ? a + "|" + b : b + "|" + a;
  const baseRel = (a, b) => { const k = key(a, b); if (k in OVR) return OVR[k]; if (OVR[b + "|" + a] != null) return OVR[b + "|" + a]; return clamp(Math.round(40 - 70 * Math.abs(BY[a].ide - BY[b].ide)), -60, 60); };
  const SIDE_COL = { ua: "#3d8bff", ru: "#ff5a4d" };
  const TT = { alliance: "Союз", military: "Військовий договір", trade: "Торгівля" };
  const CDMIN = 30;                       // перерва між однаковими пропозиціями, хв гри
  const TICK = 10;                        // крок дипломатії, хв гри
  /* 7.76 · НАТО (колективна оборона лише для членів), ядерне стримування */
  const NATO_SET = new Set(["us", "gb", "de", "fr", "pl", "ro", "tr", "hu"]);
  const NUKE_SET = new Set(["ru", "us", "gb", "fr", "cn", "in", "kp"]);
  const mayJoin = (c, foe, victim) => !NUKE_SET.has(foe) || (NATO_SET.has(c) && NATO_SET.has(victim));
  const NOAID = /oreshnik|bulava|voevoda|kedr|sarmat|rubezh|topolm|yars|avangard|burevestnik/;

  /* ---------- стан світу ---------- */
  let D = null, dirty = false, saveT = 0;
  const UI = { open: false, tab: "c", sel: null, sig: "", filter: "", pov: null };
  const SK = () => { try { const p = XX() && XX().PKEY(); return "bv-dip1:" + (p || "bv2-profile"); } catch (e) { return "bv-dip1:x"; } };
  function fresh(){
    D = { v: 1, t: 0, acc: 0, tn: 0, rel: {}, base: {}, st: {}, tr: [], sc: [], log: [], pend: [], cards: [], cd: {}, rep: {}, ide: {}, ai: true, nid: 1, aidT: {}, evT: 0, med: 0, hits: { ua: 0, ru: 0 }, ver: 1, born: Date.now(), air: freshAir() };
    for (let i = 0; i < IDS.length; i++) for (let j = i + 1; j < IDS.length; j++){ const k = key(IDS[i], IDS[j]); D.base[k] = D.rel[k] = baseRel(IDS[i], IDS[j]); }
    IDS.forEach(id => { D.rep[id] = 0; D.ide[id] = BY[id].ide; });
    D.st[key("ua", "ru")] = { s: "war", since: 0 };
    const T = (type, a, b) => D.tr.push({ id: D.nid++, type, a, b, t0: 0 });
    const NATO = ["us", "gb", "de", "fr", "pl", "ro", "tr", "hu"];
    for (let i = 0; i < NATO.length; i++) for (let j = i + 1; j < NATO.length; j++) T("alliance", NATO[i], NATO[j]);
    ["us", "gb", "pl", "de", "fr", "ro"].forEach(x => T("military", "ua", x)); ["pl", "ro", "de", "fr", "gb", "us", "tr"].forEach(x => T("trade", "ua", x));
    T("alliance", "ru", "by"); T("military", "ru", "kp"); T("military", "ru", "ir"); ["cn", "in", "tr", "ir", "by", "hu"].forEach(x => T("trade", "ru", x)); T("military", "cn", "kp"); T("trade", "cn", "in");
    ["us", "gb", "de", "fr", "pl", "ro"].forEach(x => D.sc.push({ id: D.nid++, from: x, to: "ru", lvl: x === "us" || x === "gb" ? 3 : 2, t0: 0 }));
    D.sc.push({ id: D.nid++, from: "us", to: "ir", lvl: 2, t0: 0 }); D.sc.push({ id: D.nid++, from: "us", to: "kp", lvl: 3, t0: 0 });
    ["us", "gb", "de", "fr", "pl", "ro"].forEach(x => D.sc.push({ id: D.nid++, from: x, to: "by", lvl: 2, t0: 0 }));      /* 7.76 */
    D.tr = D.tr.filter(t => !D.sc.some(s => (s.from === t.a && s.to === t.b) || (s.from === t.b && s.to === t.a)));
    log("Дипломатичний світ створено: " + IDS.length + " держав", "sys");
  }
  function save(now){ if (!D) return; if (!now){ dirty = true; if (!saveT) saveT = setTimeout(() => { saveT = 0; save(true); }, 1500); return; } dirty = false; try { localStorage.setItem(SK(), JSON.stringify(D)); } catch (e) { /* сховище недоступне */ } }
  function load(){
    let o = null; try { const s = localStorage.getItem(SK()); if (s) o = JSON.parse(s); } catch (e) { o = null; }
    if (!o || o.v !== 1 || !o.rel || !Array.isArray(o.tr)){ fresh(); return false; }
    fresh(); const def = D;                                  // нові поля/країни добираються зі стандартного світу
    D = Object.assign(def, o); D.hits = Object.assign({ ua: 0, ru: 0 }, o.hits); D.cd = o.cd || {};
    D.air = Object.assign(freshAir(), o.air || {}); D.air.perm.forEach(q => { if (!q.ac) q.ac = {}; }); if (!Array.isArray(D.air.dec)) D.air.dec = [];      // 7.74: старі дозволи без обліку літаків                                  // етап 7.73: старі збереження без «неба» отримують порожній стан
    ["req", "perm", "hist"].forEach(k => { if (!Array.isArray(D.air[k])) D.air[k] = []; });
    ["inc", "trust", "cool"].forEach(k => { if (!D.air[k] || typeof D.air[k] !== "object") D.air[k] = {}; });
    ["ua", "ru"].forEach(s => { D.air.stat = D.air.stat || {}; D.air.stat[s] = Object.assign({ ok: 0, cond: 0, den: 0, viol: 0, exp: 0 }, D.air.stat[s]); });
    D.air.perm = D.air.perm.filter(q => BY[q.st] && (q.sd === "ua" || q.sd === "ru")); D.air.req = D.air.req.filter(q => BY[q.to] && BY[q.from]);
    for (const k in def.rel) if (typeof D.rel[k] !== "number") D.rel[k] = def.rel[k];
    for (const k in def.base) if (typeof D.base[k] !== "number") D.base[k] = def.base[k];
    IDS.forEach(id => { if (D.rep[id] == null) D.rep[id] = 0; if (D.ide[id] == null) D.ide[id] = BY[id].ide; });
    D.tr = D.tr.filter(t => BY[t.a] && BY[t.b]); D.sc = D.sc.filter(s => BY[s.from] && BY[s.to]);
    return true;
  }

  /* ---------- допоміжне ---------- */
  const R = (a, b) => a === b ? 100 : D.rel[key(a, b)] || 0;
  const setR = (a, b, v) => { if (a === b) return; D.rel[key(a, b)] = clamp(v, -100, 100); D.ver++; dirty = true; };
  const addR = (a, b, d) => setR(a, b, R(a, b) + d);
  const stOf = (a, b) => { const s = D.st[key(a, b)]; if (!s) return "peace"; if (s.s === "truce" && D.t >= s.until){ return "war"; } return s.s; };
  const stRec = (a, b) => D.st[key(a, b)] || null;
  const hasT = (a, b, type) => D.tr.find(t => t.type === type && ((t.a === a && t.b === b) || (t.a === b && t.b === a)));
  const partners = (a, type) => D.tr.filter(t => (!type || t.type === type) && (t.a === a || t.b === a)).map(t => ({ id: t.a === a ? t.b : t.a, type: t.type }));
  const allies = a => partners(a, "alliance").map(x => x.id);
  const sancLvl = (from, to) => { const s = D.sc.find(x => x.from === from && x.to === to); return s ? s.lvl : 0; };
  const warCount = () => { let n = 0; for (const k in D.st){ if (D.st[k].s === "war" && k !== "ru|ua" && k !== "ua|ru") n++; } return n; };
  const enemies = a => IDS.filter(x => x !== a && stOf(a, x) === "war");
  const gm = () => { const g = GM(); return g && g.on ? g : null; };
  const humanSides = () => { const g = gm(); return g ? MAIN.filter(sd => g.ctrl[sd] === "me") : []; };
  const isHuman = id => humanSides().includes(id);
  const pov = () => { const h = humanSides(); if (!h.length) return null; return UI.pov && h.includes(UI.pov) ? UI.pov : h[0]; };
  const active = () => { const g = gm(); return !!(g && !g.spec && !g.puppet && (g.ctx === "single" || g.ctx === "sandbox") && g.phase !== "idle"); };
  const ecoE = sd => { try { const E = XX().ecoE(sd); return E && E.on ? E : null; } catch (e) { return null; } };
  const fm = v => (Math.round(v * 10) / 10).toString().replace(".", ",");
  function log(x, k, ids, ntf){
    D.log.push({ t: D.t, x, k: k || "info", ids: ids || [] }); if (D.log.length > 140) D.log.shift(); D.ver++; dirty = true;
    if (ntf && active()){ const p = pov(); if (p && (!ids || !ids.length || ids.includes(p))) { try { XX().toast(x, k === "bad" ? "warn" : "info"); } catch (e) { /* */ } } }
  }
  const nm = id => BY[id].n;
  const cdOk = (k, mins) => !(D.cd[k] > D.t) && (mins == null || true);
  const cdSet = (k, mins) => { D.cd[k] = D.t + (mins == null ? CDMIN : mins); };

  /* ---------- оцінка ситуації ---------- */
  const hostility = (a, x) => stOf(a, x) === "war" ? 1 : R(a, x) < -25 ? (-R(a, x) - 25) / 75 : 0;
  function threat(a){ let t = 0; for (const x of IDS){ if (x === a) continue; const w = hostility(a, x); if (!w) continue; t = Math.max(t, w * (0.4 + BY[x].pow / 12) * (BY[a].nb.includes(x) || BY[x].nb.includes(a) ? 1.25 : 0.8)); } return clamp(t, 0, 1); }
  function sharedThreat(a, b){ let t = 0; for (const x of IDS){ if (x === a || x === b) continue; t = Math.max(t, Math.min(hostility(a, x), hostility(b, x)) * (0.4 + BY[x].pow / 12)); } return clamp(t * 1.4, 0, 1); }
  function ww(a, b){                                          // втома від війни a проти b, 0…1
    const g = gm();
    if (MAIN.includes(a) && MAIN.includes(b) && g){
      const pa = g.st[a].pts, pb = g.st[b].pts, diff = (pb - pa) / Math.max(60, pa + pb), span = isFinite(g.end) ? g.end - g.start : 1e9;
      const prog = isFinite(span) && span < 1e8 ? clamp((g.clock - g.start) / span, 0, 1) : 0.3;
      return clamp(0.25 + diff * 1.6 + prog * 0.5, 0, 1);
    }
    const r = stRec(a, b); return clamp(0.2 + ((D.t - (r ? r.since : D.t)) / 900) - BY[a].aggr * 0.3, 0, 1);
  }
  const conflictPen = (from, to) => { let p = 0; for (const y of allies(to).concat(partners(to, "military").map(x => x.id))){ if (y !== from && (stOf(from, y) === "war" || R(from, y) < -50)) p += 35; } return p; };

  /* ---------- оцінка пропозиції: { blk, p, rs } ---------- */
  function evalP(from, to, type){
    const A = BY[from], B = BY[to], r = R(from, to), s = stOf(from, to), rs = []; let sc = 0;
    const add = (l, v) => { if (Math.abs(v) >= 0.5){ rs.push([l, Math.round(v)]); sc += v; } };
    if (type === "truce" || type === "peace"){
      if (s !== "war" && !(s === "truce" && type === "peace")) return { blk: "Ви не воюєте" };
      const w = ww(to, from);
      if (type === "peace"){ const r0 = stRec(from, to); if (s !== "truce" && w < 0.65) return { blk: "Спершу перемир'я" }; add("Втома від війни", w * 55 - 20); if (s === "truce") add("Перемир'я діє", 14); }
      else add("Втома від війни", w * 45 - 14);
      if (D.med > D.t) add("Посередник", 22);
      let pr = 0; for (const y of allies(to)) pr += R(y, from) > 20 ? 4 : R(y, from) < -30 ? -4 : 0; add("Тиск союзників", clamp(pr, -12, 12));
      if (MAIN.includes(to) && MAIN.includes(from) && gm()){ const g = gm(); const lead = g.st[to].pts - g.st[from].pts; add("Рахунок бою", clamp(-lead / 6, -25, 15)); }
      return fin({ p: 0, rs }, sc);
    }
    if (s === "war") return { blk: "Ви у стані війни" };
    if (type === "trade"){
      if (hasT(from, to, "trade")) return { blk: "Угода вже діє" };
      if (sancLvl(from, to) || sancLvl(to, from)) return { blk: "Діють санкції" };
      if (r < -15) return { blk: "Відносини надто холодні (потрібно ≥ −15)" };
      add("Відносини", r * 0.55); add("Інтерес до торгівлі", B.tr * 20 - 8); add("Економіка партнера", (B.eco - 4) * 1.2);
      add("Конфлікт інтересів", -conflictPen(from, to) * 0.4);
    } else if (type === "military"){
      if (hasT(from, to, "military") || hasT(from, to, "alliance")) return { blk: "Уже є договір" };
      if (r < 30) return { blk: "Потрібні відносини ≥ 30" };
      add("Відносини", (r - 30) * 0.9); add("Спільна загроза", sharedThreat(from, to) * 30); add("Вірність союзникам", (B.loy - 0.5) * 10); add("Конфлікт інтересів", -conflictPen(from, to));
    } else if (type === "alliance"){
      if (hasT(from, to, "alliance")) return { blk: "Союз уже діє" };
      if (NATO_SET.has(from) !== NATO_SET.has(to)) return { blk: "Колективна оборона — лише через членство в НАТО (потрібна згода всіх членів, під час війни неможливо). Доступний військовий договір" };
      if (r < 50) return { blk: "Потрібні відносини ≥ 50" };
      if (!hasT(from, to, "military") && r < 70) return { blk: "Спершу військовий договір (або відносини ≥ 70)" };
      add("Відносини", (r - 50) * 0.8); add("Спільна загроза", sharedThreat(from, to) * 32); add("Військова співпраця", hasT(from, to, "military") ? 12 : 0); add("Конфлікт інтересів", -conflictPen(from, to)); add("Вірність союзникам", (B.loy - 0.5) * 12);
    } else return { blk: "Невідома дія" };
    return fin({ rs }, sc);
  }
  function fin(o, sc){ o.sc = sc; o.p = clamp(0.5 + sc / 50, 0.02, 0.97); return o; }

  /* ---------- дії (виконання) ---------- */
  function spill(a, b, sgn){                                   // нова близькість a—b змінює думку їхніх друзів і ворогів
    for (const c of allies(a)) if (c !== b) addR(c, b, 3 * sgn);
    for (const c of allies(b)) if (c !== a) addR(c, a, 3 * sgn);
    for (const e of enemies(a)) if (e !== b) addR(e, b, -4 * sgn);
    for (const e of enemies(b)) if (e !== a) addR(e, a, -4 * sgn);
  }
  function sign(type, a, b, by){
    D.tr.push({ id: D.nid++, type, a, b, t0: D.t }); addR(a, b, type === "alliance" ? 10 : type === "military" ? 6 : 4); spill(a, b, 1);
    log(`${BY[a].f} ${nm(a)} та ${BY[b].f} ${nm(b)} уклали: ${TT[type].toLowerCase()}` + (by ? ` (ініціатор — ${nm(by)})` : ""), "good", [a, b], true);
    if (type === "alliance") D.tr = D.tr.filter(t => !(t.type === "military" && ((t.a === a && t.b === b) || (t.a === b && t.b === a))));
    if (isHuman(a) || isHuman(b)) incRefresh();
  }
  function cancel(id, by){
    const i = D.tr.findIndex(t => t.id === id); if (i < 0) return; const t = D.tr[i]; D.tr.splice(i, 1);
    addR(t.a, t.b, t.type === "alliance" ? -30 : t.type === "military" ? -15 : -8); spill(t.a, t.b, -0.5);
    log(`${nm(by || t.a)} розірвала ${TT[t.type].toLowerCase()} з ${nm(by === t.a ? t.b : t.a)}`, "bad", [t.a, t.b], true);
    if (by) for (const c of allies(by === t.a ? t.b : t.a)) if (c !== by) addR(c, by, -4);
    incRefresh();
  }
  function sanction(from, to, lvl){
    const ex = D.sc.find(s => s.from === from && s.to === to);
    if (ex) ex.lvl = lvl; else D.sc.push({ id: D.nid++, from, to, lvl, t0: D.t });
    for (const t of D.tr.filter(t => t.type === "trade" && ((t.a === from && t.b === to) || (t.a === to && t.b === from)))) D.tr.splice(D.tr.indexOf(t), 1);
    addR(from, to, -8 * lvl); for (const c of allies(to)) addR(c, from, -2 * lvl); for (const c of allies(from)) addR(c, to, -1 * lvl);
    log(`${BY[from].f} ${nm(from)} ввела санкції (рівень ${lvl}) проти ${BY[to].f} ${nm(to)}`, "bad", [from, to], true); D.ver++; incRefresh();
  }
  function lift(from, to){
    const i = D.sc.findIndex(s => s.from === from && s.to === to); if (i < 0) return; D.sc.splice(i, 1); addR(from, to, 6);
    log(`${nm(from)} зняла санкції проти ${nm(to)}`, "good", [from, to], true); incRefresh();
  }
  function declareWar(a, b, why, depth){
    depth = depth || 0; if (a === b || stOf(a, b) === "war") return false;
    if (MAIN.includes(a) && MAIN.includes(b)) return false;
    D.st[key(a, b)] = { s: "war", since: D.t, by: a };
    D.tr = D.tr.filter(t => !((t.a === a && t.b === b) || (t.a === b && t.b === a))); setR(a, b, Math.min(R(a, b), -85));
    const agg = !why || why === "agr"; if (agg) D.rep[a] = clamp(D.rep[a] - 12, -100, 100);
    log(`⚔ ${BY[a].f} ${nm(a)} оголосила війну ${BY[b].f} ${nm(b)}` + (why && why !== "agr" ? ` — ${why}` : ""), "war", [a, b], true);
    for (const c of allies(b).concat(partners(b, "military").map(x => x.id))){                       // союзники жертви
      if (c === a || stOf(c, a) === "war") continue; addR(c, a, -15);
      if (depth < 1 && !isHuman(c) && warCount() < 5 && hasT(c, b, "alliance") && mayJoin(c, a, b) && rnd() < BY[c].loy * 0.45 * (BY[c].pow + 3) / 9){ declareWar(c, a, `допомога союзнику (${nm(b)})`, depth + 1); }
    }
    for (const c of allies(a)) if (c !== b) { if (R(c, b) < 0 || hasT(c, a, "alliance")) addR(c, b, -4); }
    for (const x of IDS) if (x !== a && x !== b && !allies(a).includes(x)) addR(x, a, agg ? -3 : 0);
    incRefresh(); return true;
  }
  function endWar(a, b, kind){
    const r = stRec(a, b); if (!r) return;
    if (kind === "truce"){ r.s = "truce"; r.until = D.t + 120; r.t0 = D.t; log(`🕊 Перемир'я між ${nm(a)} і ${nm(b)} на 2 години`, "good", [a, b], true); }
    else { delete D.st[key(a, b)]; setR(a, b, Math.max(R(a, b), -40) + 10); log(`☮ Мирна угода: ${nm(a)} — ${nm(b)}`, "good", [a, b], true); }
    D.ver++; incRefresh();
  }

  /* ---------- дії гравця ---------- */
  function playerAct(act, id){
    if (!active()) return; const p = pov(); if (!p || !D) return;
    const t = id, k = act + ":" + key(p, t);
    const msg = (m, kind) => { try { XX().toast(m, kind || "info"); } catch (e) { /* */ } };
    if (act === "improve"){
      if (D.cd[k] > D.t) return msg("Дипломатична місія вже працює — зачекайте " + Math.ceil(D.cd[k] - D.t) + " хв");
      if (stOf(p, t) === "war") return msg("Із державою, з якою воюєте, відносини так не покращити");
      const E = ecoE(p), cost = 2; if (E && E.money < cost) return msg("Бракує коштів на місію (" + cost + " млн $)", "warn");
      if (E) E.money -= cost; const d = 3 + Math.round(rnd() * 4); addR(p, t, d); cdSet(k, 60); log(`Дипломатична місія ${nm(p)} → ${nm(t)}: відносини ${d > 0 ? "+" : ""}${d}`, "info", [p, t]); msg(`Місія до ${nm(t)}: відносини +${d}`, "ok");
    } else if (act === "trade" || act === "military" || act === "alliance"){
      const e = evalP(p, t, act); if (e.blk) return msg(e.blk, "warn");
      if (D.cd[k] > D.t) return msg("Повторити пропозицію можна через " + Math.ceil(D.cd[k] - D.t) + " хв", "warn");
      cdSet(k); if (rnd() < e.p){ sign(act, p, t, p); msg(`${nm(t)} прийняла: ${TT[act].toLowerCase()}`, "ok"); } else { addR(p, t, -1); log(`${nm(t)} відхилила пропозицію (${TT[act].toLowerCase()}) від ${nm(p)}`, "bad", [p, t]); msg(`${nm(t)} відхилила пропозицію`, "warn"); }
    } else if (act === "cancel"){ const tr = D.tr.find(x => x.id === +id); if (tr) cancel(tr.id, p); return afterAct(); }
    else if (act === "sanc"){ const lv = sancLvl(p, t); if (lv >= 3) return; if (stOf(p, t) === "war" && false) return; const E = ecoE(p); sanction(p, t, lv + 1); if (E && D.tr.length) { /* втрати торгівлі враховує incK */ } }
    else if (act === "unsanc"){ lift(p, t); }
    else if (act === "war"){
      if (MAIN.includes(t) && MAIN.includes(p)) return msg("Україна й Росія вже воюють — це і є бій", "warn");
      if (allies(p).includes(t)) return msg("Спершу розірвіть союз", "warn");
      declareWar(p, t, "agr");
    } else if (act === "truce" || act === "peace"){
      const e = evalP(p, t, act); if (e.blk) return msg(e.blk, "warn");
      if (D.cd[k] > D.t) return msg("Повторити пропозицію можна через " + Math.ceil(D.cd[k] - D.t) + " хв", "warn");
      cdSet(k, 20);
      if (rnd() < e.p) accepted(act, p, t, "Супротивник прийняв"); else { log(`${nm(t)} відхилила ${act === "truce" ? "перемир'я" : "мир"} від ${nm(p)}`, "bad", [p, t]); msg(`${nm(t)} відхилила пропозицію — бій триває`, "warn"); }
    }
    afterAct();
  }
  function accepted(kind, a, b, note){
    if (kind === "truce"){ endWar(a, b, "truce"); }
    else {
      endWar(a, b, "peace");
      if (MAIN.includes(a) && MAIN.includes(b)){ const x = XX(); try { x.toast("Мирна угода підписана — бій завершується миром", "ok"); x.endBy({ winner: "draw", peace: true }); } catch (e) { /* */ } }
    }
  }
  function afterAct(){ D.ver++; save(); render(true); try { window.dispatchEvent(new Event("bv-dip-change")); } catch (e) { /* */ } }
  function incRefresh(){ /* доходи рахуються на льоту (incK) — окремого оновлення не потрібно */ }

  /* ---------- вплив на гру ---------- */
  function incK(sd){
    if (!D || !MAIN.includes(sd)) return 1; let k = 1;
    for (const t of D.tr) if (t.type === "trade" && (t.a === sd || t.b === sd)) k += 0.011 * BY[t.a === sd ? t.b : t.a].eco;
    for (const s of D.sc) if (s.to === sd) k -= 0.012 * BY[s.from].eco * s.lvl;
    for (const e of enemies(sd)) if (e !== other(sd)) k -= 0.02 + BY[e].pow * 0.004;
    let sk = 1; try { if (window.BV_SEA && window.BV_SEA.incK) sk = +window.BV_SEA.incK(sd) || 1; } catch (e) { /* sea:ext */ }      // 7.75: морські інциденти
    return clamp(k, 0.55, 1.6) * clamp(sk, 0.7, 1.05);
  }
  const truceOn = () => !!(D && active() && stOf("ua", "ru") === "truce");
  function aid(src, dst, mult){
    const S = BY[src], E = ecoE(dst), g = gm(); const parts = [];
    if (!E || !g) { log(`${S.f} ${nm(src)} → ${BY[dst].f} ${nm(dst)}: пакет допомоги`, "good", [src, dst]); return; }
    const m = (1.5 + S.pow * 0.9) * mult; E.money += m; parts.push(fm(m) + " млн $");
    if (E.mun){ for (const k of ["sam", "abm"]) if (k in E.mun && rnd() < 0.7){ const n = Math.max(1, Math.round(S.pow * (k === "sam" ? 1.6 : 0.5) * mult)); E.mun[k] += n; parts.push(`+${n} ${k === "sam" ? "ракет ЗРК" : "ракет ПРО"}`); } }
    if (rnd() < 0.35){
      const box = g.stock && g.stock[dst] ? Object.keys(g.stock[dst]).filter(k => !NOAID.test(k) && g.stock[dst][k] > 0) : [];
      if (box.length){ const k = pick(box), n = Math.max(1, Math.round(S.pow * 0.8 * mult * (rnd() + 0.5))); try { XX().ecoAdd(dst, "w:" + k, n); parts.push(`+${n} × ${k}`); } catch (e) { /* */ } }
    }
    log(`${S.f} ${nm(src)} → ${BY[dst].f} ${nm(dst)}: допомога — ${parts.join(", ")}`, "good", [src, dst], true);
  }
  const povLabel = sd => (BY[sd] ? BY[sd].n : sd);

  /* ---------- діплом. ІІ ---------- */
  function propose(a, b, type){
    const e = evalP(a, b, type); if (e.blk) return false; const k = type + ":" + key(a, b); if (D.cd[k] > D.t) return false; cdSet(k, 60 + rnd() * 60);
    if (isHuman(b)){
      if (D.pend.some(x => x.from === a && x.type === type) || D.pend.length >= 5) return false;
      const ev2 = evalP(b, a, type); if (ev2.blk) return false;
      D.pend.push({ id: D.nid++, from: a, to: b, type, exp: D.t + 180, t0: D.t });
      log(`${BY[a].f} ${nm(a)} пропонує вам: ${type === "truce" ? "перемир'я" : type === "peace" ? "мирну угоду" : TT[type].toLowerCase()}`, "ask", [a, b], true); return true;
    }
    if (rnd() < e.p){ if (type === "truce" || type === "peace") accepted(type, a, b); else sign(type, a, b, a); return true; }
    return false;
  }
  function aiAct(a){
    if (isHuman(a)) return;
    const A = BY[a], thr = threat(a), en = enemies(a), al = allies(a);
    // 1. війна: перемир'я / мир, виклик союзників
    for (const e of en){
      const w = ww(a, e);
      if (MAIN.includes(a) && MAIN.includes(e)){ const h = humanSides(); if (h.length && w > 0.5 && rnd() < 0.18) propose(a, e, stOf(a, e) === "truce" && w > 0.6 ? "peace" : "truce"); }
      else if (w > 0.55 && rnd() < 0.25){ const s = stOf(a, e); if (s === "war") propose(a, e, "truce"); else if (s === "truce") propose(a, e, "peace"); }
      for (const c of al) if (!isHuman(c) && warCount() < 5 && stOf(c, e) !== "war" && R(c, e) < 0 && mayJoin(c, e, a) && rnd() < 0.04 * BY[c].loy) declareWar(c, e, `допомога союзнику (${nm(a)})`);
    }
    // 2. допомога союзникам, що воюють
    if (en.length && !MAIN.includes(a)) for (const c of al) if (MAIN.includes(c) && !isHuman(c) && c !== a && rnd() < 0.12) aid(a, c, 0.6);
    // 3. реакція на загрозу — пошук союзників
    if (thr > 0.3 && rnd() < 0.35){
      const cands = IDS.filter(x => x !== a && !isHuman(x) || (isHuman(x) && x !== a)).filter(x => stOf(a, x) !== "war" && R(a, x) > 25)
        .map(x => ({ x, t: hasT(a, x, "military") ? "alliance" : "military", e: null })).map(o => (o.e = evalP(a, o.x, o.t), o)).filter(o => !o.e.blk).sort((p, q) => q.e.sc - p.e.sc);
      if (cands.length && cands[0].e.sc > -5) propose(a, cands[0].x, cands[0].t);
    }
    // 4. торгівля з дружніми
    if (rnd() < 0.12 + A.tr * 0.1){ const x = pick(IDS.filter(y => y !== a && R(a, y) > 5 && !hasT(a, y, "trade") && stOf(a, y) === "peace")); if (x) propose(a, x, "trade"); }
    // 4b. зближення сусідів зі схожими поглядами
    if (rnd() < 0.08){ const x = pick(IDS.filter(y => y !== a && R(a, y) >= 30 && !hasT(a, y, "military") && !hasT(a, y, "alliance") && stOf(a, y) === "peace")); if (x) propose(a, x, "military"); }
    // 5. санкції проти ворогів блоку
    if (A.eco >= 3 && !MAIN.includes(a) || (MAIN.includes(a) && !isHuman(a))){
      for (const x of IDS){
        if (x === a) continue; const lv = sancLvl(a, x);
        const bad = R(a, x) < -50 && (enemies(x).some(e => e === a || allies(a).includes(e) || R(a, e) > 40) || D.rep[x] < -25);
        if (bad && lv < 3 && rnd() < 0.12 && stOf(a, x) !== "war") { if (lv === 0 || R(a, x) < -70) sanction(a, x, lv + 1); }
        else if (lv && R(a, x) > -5 && rnd() < 0.25) lift(a, x);
      }
    }
    // 6. оголошення війни (рідко)
    if (A.aggr >= 0.3 && D.ai && warCount() < 2 && rnd() < 0.002 * A.aggr){
      const tg = IDS.filter(x => x !== a && !MAIN.includes(x) && stOf(a, x) === "peace" && R(a, x) < -80 && BY[x].pow < A.pow + 1 && !NUKE_SET.has(x) && !allies(a).includes(x) && !isHuman(x));
      const t = pick(tg); if (t){ const defenders = allies(t).filter(c => BY[c].pow >= A.pow).length; if (!defenders) declareWar(a, t, "agr"); }
    }
    // 7. союзник на війні закликає — інші перевіряють свою думку
    if (!D.rep[a]) D.rep[a] = 0;
  }
  function pendingExpire(){
    const keep = []; for (const p of D.pend){ if (D.t >= p.exp){ if (p.type === "airc"){ log(`Умови ${nm(p.from)} щодо повітряного простору не прийнято вчасно — пропозицію знято`, "info", [p.from, p.to]); addR(p.to, p.from, -1); if (p.air && p.air.dep) refund(p.to, p.air.dep, "пропозицію знято"); } else { log(`Пропозицію від ${nm(p.from)} (${TT[p.type] || p.type}) залишено без відповіді`, "info", [p.from, p.to]); addR(p.from, p.to, -2); } } else keep.push(p); } D.pend = keep;
  }
  function answerPend(id, yes){
    const i = D.pend.findIndex(p => p.id === id); if (i < 0) return; const p = D.pend[i];
    if (p.type === "airc") return airAnswer(p, yes);
    D.pend.splice(i, 1);
    if (yes){
      if (p.type === "truce" || p.type === "peace"){ if (stOf(p.from, p.to) === "peace"){ /* уже мир */ } else accepted(p.type, p.from, p.to); }
      else if (!hasT(p.from, p.to, p.type)) sign(p.type, p.from, p.to, p.from);
    } else { addR(p.from, p.to, -2); log(`Ви відхилили пропозицію від ${nm(p.from)}`, "info", [p.from, p.to]); }
    afterAct();
  }

  /* ---------- події ---------- */
  const EV = [
    { id: "aid", w: 3, ok: (p, x) => R(p, x) > 25 && !MAIN.includes(x), t: (p, x) => `${nm(x)} пропонує пакет допомоги.`, o: [["Прийняти", (p, x) => { addR(p, x, 3); aid(x, p, 0.7); }], ["Відмовитися", (p, x) => { addR(p, x, -1); }]] },
    { id: "airspace", w: 2, ok: (p, x) => BY[p].nb.includes(x) || BY[x].nb.includes(p), t: (p, x) => `${nm(x)} скаржиться на уламки й порушення повітряного простору після ударів.`,
      o: [["Вибачитися й виплатити компенсацію (−5 млн $)", (p, x) => { const E = ecoE(p); if (E) E.money = Math.max(0, E.money - 5); addR(p, x, 6); }], ["Відкинути звинувачення", (p, x) => addR(p, x, -10)]] },
    { id: "summit", w: 2, ok: (p, x) => R(p, x) > -10 && !MAIN.includes(x), t: (p, x) => `${nm(x)} запрошує на дипломатичний саміт.`,
      o: [["Взяти участь (−3 млн $)", (p, x) => { const E = ecoE(p); if (E) E.money = Math.max(0, E.money - 3); addR(p, x, 8); allies(x).forEach(c => addR(p, c, 2)); }], ["Відхилити", (p, x) => addR(p, x, -3)]] },
    { id: "sancjoin", w: 2, ok: (p, x) => R(p, x) > 20 && !MAIN.includes(x) && !sancLvl(x, other(p)) && other(p) !== x && R(x, other(p)) < -20, t: (p, x) => `${nm(x)} просить приєднатися до санкцій проти ${nm(other(p))}.`,
      o: [["Приєднатися", (p, x) => { addR(p, x, 8); }], ["Відмовитися", (p, x) => addR(p, x, -5)]] },
    { id: "spy", w: 2, ok: (p, x) => !MAIN.includes(x) && R(p, x) < 40, t: (p, x) => `Шпигунський скандал: у ${nm(x)} затримали ваших дипломатів.`,
      o: [["Визнати й домовитися (−4 млн $)", (p, x) => { const E = ecoE(p); if (E) E.money = Math.max(0, E.money - 4); addR(p, x, 2); }], ["Відкинути обвинувачення", (p, x) => addR(p, x, -8)]] },
    { id: "ultimatum", w: 2, ok: (p, x) => !MAIN.includes(x) && R(p, x) < -35 && BY[x].aggr >= 0.3 && stOf(p, x) === "peace", t: (p, x) => `${nm(x)} висуває ультиматум: поступки або розрив відносин.`,
      o: [["Поступитися (−8 млн $)", (p, x) => { const E = ecoE(p); if (E) E.money = Math.max(0, E.money - 8); addR(p, x, 12); }], ["Відхилити", (p, x) => { addR(p, x, -12); if (rnd() < 0.25 && BY[x].aggr >= 0.5) declareWar(x, p, "ультиматум відхилено"); }]] },
    { id: "energy", w: 2, ok: (p, x) => hasT(p, x, "trade") && !!ecoE(p) && !!ecoE(p).fuel, t: (p, x) => `${nm(x)} пропонує знижку на пальне: партія поставляється негайно.`,
      o: [["Прийняти (−3 млн $)", (p, x) => { const E = ecoE(p); if (E && E.fuel){ E.money = Math.max(0, E.money - 3); E.fuel.st = Math.min(E.fuel.cap, E.fuel.st + E.fuel.cap * 0.08); } addR(p, x, 2); }], ["Не потрібно", () => {}]] },
    { id: "arms", w: 2, ok: (p, x) => (hasT(p, x, "military") || hasT(p, x, "alliance")) && !!ecoE(p), t: (p, x) => `${nm(x)} пропонує партію озброєння за пільговою ціною.`,
      o: [["Купити (−10 млн $)", (p, x) => { const E = ecoE(p); if (E && E.money >= 10){ E.money -= 10; aid(x, p, 0.8); } else try { XX().toast("Бракує коштів", "warn"); } catch (e) { /* */ } }], ["Відмовитися", () => {}]] },
    { id: "lobby", w: 2, ok: (p, x) => !MAIN.includes(x) && R(other(p), x) > 10, t: (p, x) => `${nm(other(p))} веде кампанію проти вас у ${nm(x)}.`,
      o: [["Протидіяти (−4 млн $)", (p, x) => { const E = ecoE(p); if (E) E.money = Math.max(0, E.money - 4); addR(p, x, 4); }], ["Проігнорувати", (p, x) => addR(p, x, -6)]] },
    { id: "mediator", w: 2, ok: (p, x) => !MAIN.includes(x) && R(p, x) > 0 && R(other(p), x) > -20, t: (p, x) => `${nm(x)} пропонує посередництво для перемир'я з ${nm(other(p))}.`,
      o: [["Прийняти (шанс перемир'я зросте на 2 години)", (p, x) => { D.med = D.t + 120; addR(p, x, 4); }], ["Відмовитися", (p, x) => addR(p, x, -2)]] },
    { id: "coup", w: 1, ok: (p, x) => !MAIN.includes(x), t: (p, x) => `Зміна влади в державі ${nm(x)}: курс переглядається.`, auto: (p, x) => { D.ide[x] = clamp(D.ide[x] + (rnd() - 0.5) * 0.8, -1, 1); for (const y of IDS) if (y !== x){ const k = key(x, y); D.base[k] = clamp(Math.round(D.base[k] * 0.5 + (40 - 70 * Math.abs(D.ide[x] - D.ide[y])) * 0.5), -90, 90); addR(x, y, (D.base[k] - R(x, y)) * 0.3); } }, o: [["Прийнято до відома", () => {}]] },
    { id: "human", w: 1, ok: (p, x) => true, t: (p, x) => `Гуманітарний обмін між ${nm(p)} і ${nm(other(p))} за посередництва третьої сторони.`,
      o: [["Погодитися", (p, x) => { addR(p, other(p), 4); IDS.forEach(y => { if (!MAIN.includes(y)) addR(p, y, 1); }); }], ["Відхилити", () => {}]] },
    { id: "allycall", w: 2, ok: (p, x) => allies(p).includes(x) && enemies(x).length > 0 && !MAIN.includes(enemies(x)[0]), t: (p, x) => `${nm(x)} воює з ${nm(enemies(x)[0])} і просить підтримки.`,
      o: [["Допомогти (−6 млн $)", (p, x) => { const E = ecoE(p); if (E) E.money = Math.max(0, E.money - 6); addR(p, x, 8); }], ["Відмовити", (p, x) => addR(p, x, -10)]] }
  ];
  function maybeEvent(){
    const p = pov(); if (!p || D.t - D.evT < 45 || D.cards.length >= 3 || rnd() > 0.28) return;
    const pool = []; for (const e of EV) for (const x of IDS){ if (x === p) continue; let ok = false; try { ok = e.ok(p, x); } catch (er) { ok = false; } if (ok && (e.id !== "human" || x === other(p))) for (let i = 0; i < e.w; i++) pool.push([e, x]); }
    if (!pool.length) return; const [e, x] = pick(pool); D.evT = D.t;
    if (e.auto){ e.auto(p, x); log("🗞 " + e.t(p, x), "info", [x], true); return; }
    D.cards.push({ id: D.nid++, ev: e.id, x, pov: p, t0: D.t, exp: D.t + 150 });
    log("📨 " + e.t(p, x), "ask", [p], true);
  }
  function answerCard(id, oi){
    const i = D.cards.findIndex(c => c.id === id); if (i < 0) return; const c = D.cards[i]; D.cards.splice(i, 1); const e = EV.find(z => z.id === c.ev); if (!e) return;
    const o = e.o[oi]; if (o){ try { o[1](c.pov, c.x); } catch (er) { /* подію пропущено */ } log(`Рішення: «${o[0].replace(/\s*\(.*$/, "")}» — ${nm(c.x)}`, "info", [c.pov, c.x]); }
    afterAct();
  }
  function cardsExpire(){ const keep = []; for (const c of D.cards){ if (D.t >= c.exp){ const e = EV.find(z => z.id === c.ev); if (e && e.o[e.o.length - 1]) try { e.o[e.o.length - 1][1](c.pov, c.x); } catch (er) { /* */ } log(`Подію з ${nm(c.x)} залишено без рішення`, "info", [c.pov]); } else keep.push(c); } D.cards = keep; }

  /* ---------- крок ---------- */
  function drift(){
    for (const k in D.rel){
      const [a, b] = k.split("|"); const s = stOf(a, b); let tgt = D.base[k];
      if (s === "war") tgt = -92; else if (s === "truce") tgt = Math.min(tgt, -45);
      else { if (hasT(a, b, "alliance")) tgt += 14; else if (hasT(a, b, "military")) tgt += 7; if (hasT(a, b, "trade")) tgt += 5; tgt -= 9 * Math.max(sancLvl(a, b), sancLvl(b, a)); }
      D.rel[k] = clamp(D.rel[k] + (clamp(tgt, -100, 100) - D.rel[k]) * (s === "war" ? 0.08 : 0.03), -100, 100);
    }
  }
  function strikes(){
    const g = gm(); if (!g) return;
    for (const sd of MAIN){
      const n = g.st[sd].objHits | 0, d = n - (D.hits[sd] | 0); D.hits[sd] = n; if (d <= 0) continue; const v = other(sd);
      for (const x of IDS){ if (MAIN.includes(x)) continue; const side = Math.sign(D.ide[x] - (D.ide[v] || 0)) === 0 ? 0 : (Math.abs(D.ide[x] - BY[v].ide) < Math.abs(D.ide[x] - BY[sd].ide) ? 1 : 0.4);
        addR(x, sd, -Math.min(2, d * 0.04 * side)); addR(x, v, Math.min(1, d * 0.02 * side)); }
    }
  }
  function aidTimers(){
    const g = gm(); if (!g) return;
    for (const m of MAIN){
      for (const pt of partners(m)){
        if (pt.type === "trade" || stOf(m, pt.id) === "war") continue; const k = m + ">" + pt.id; if (D.aidT[k] == null) D.aidT[k] = D.t + 40 + rnd() * 80;
        if (D.t >= D.aidT[k]){ D.aidT[k] = D.t + (pt.type === "alliance" ? 110 : 170) + rnd() * 60; if (R(m, pt.id) > 20 && !MAIN.includes(pt.id)) aid(pt.id, m, (pt.type === "alliance" ? 1 : 0.55) * clamp(0.5 + R(m, pt.id) / 100, 0.5, 1.3)); }
      }
      const E = ecoE(m); if (E){ for (const e of enemies(m)) if (!MAIN.includes(e)) E.money = Math.max(0, E.money - (0.6 + BY[e].pow * 0.25) * TICK / 60); }
    }
    // сторона ворога теж отримує допомогу від своїх партнерів — тут обробляється циклом вище (MAIN)
  }
  function tick(){
    D.tn++; drift(); strikes(); pendingExpire(); cardsExpire(); airTick();
    for (const sd of ["ua", "ru"]){ const r = stRec("ua", "ru"); if (r && r.s === "truce" && D.t >= r.until){ r.s = "war"; r.since = D.t; log("Перемир'я між Україною й Росією закінчилося — бої поновлено", "war", ["ua", "ru"], true); } break; }
    aidTimers();
    if (D.ai){ const order = IDS.slice().sort(() => rnd() - 0.5).slice(0, 4); order.forEach(aiAct); }
    maybeEvent(); applyTruceGate();
    if (D.tn % 6 === 0) save(true); else save();
    if (UI.open) render();
  }
  function applyTruceGate(){
    // у перемир'я ІІ-бот не планує пуски: canAttack повертає false через BV_DIP.truceOn() (міст у 03_game.js)
  }
  function step(dt){
    if (!D || !active()) return; D.t += dt; D.acc += dt;
    while (D.acc >= TICK){ D.acc -= TICK; try { tick(); } catch (e) { if (window.console) console.warn("[dip]", e); } }
  }
  function start(){
    const g = gm(); if (!g) return;
    if (g.ctx === "online" || g.puppet) return;
    if (!D) load(); D.st[key("ua", "ru")] = { s: "war", since: D.t }; D.hits = { ua: 0, ru: 0 }; D.pend = []; D.cards = D.cards.filter(c => c.exp > D.t);
    D.ver++; hookLaunch(); mountUi(); UI.pov = null; save(true); render(true);
  }
  function over(res){ if (!D) return; try { log(`Бій завершено: ${res && res.peace ? "мир" : res && res.winner === "draw" ? "нічия" : "перемога " + (res && res.winner ? nm(res.winner) : "—")}`, "sys"); save(true); } catch (e) { /* */ } }

  let hooked = false;
  function hookLaunch(){
    if (hooked) return; const x = XX(); if (!x || !x.HOOKS) return; const H = x.HOOKS(); if (!H || !H.launchBlock) return; hooked = true;
    const orig = H.launchBlock; H.launchBlock = function (side, k, n, c){ if (truceOn()) return "Перемир'я: пуски заборонені, доки воно діє"; return orig.apply(this, arguments); };
  }

  /* ---------- повітряний простір (етап 7.73 · форма запиту й планувальник — етап 7.74) ----------
     Запит доступу до неба сусідніх держав. Запит можливий лише коли одночасно:
       · відносини ≥ RELMIN, · політична сумісність ≥ COMPMIN, · ризик ескалації ≤ RISKMAX.
     Форма запиту (7.74): країна · мета · дата й час початку · строк · тип операції · обсяг · додаткові умови (свої гарантії).
     Далі: очікування рішення → відмова (з причиною й наслідками) / умовний дозвіл (пропозиція з умовами) / повний дозвіл.
     Дозвіл — тимчасовий: вікно [from, until), тип операції, глибина коридору, ліміт (пусків або літаків), заборона балістики,
     заборона застосування зброї, повідомлення про вхід, плата й депозит. Порушення умов = відкликання + удар по репутації.
     У грі: дозвіл типу «msl» відкриває коридор над сушею країни для маршрутів ракет і БпЛА сторони (BV_DIP.airGrid в avoidForeign);
     дозволи авіаційних типів діють для літаків: планувальник перевіряє маршрут (airCheckRoute), а монітор (airMonitor) стежить за
     польотами й попереджає про вихід за межі зони. Без активних дозволів гра поводиться як раніше. */
  const AIRST = ["pl", "ro", "hu", "by", "tr"], TRN = 5;               // держави з небом на мапі; ширина вільної транзитної смуги в грі (клітинок)
  // грубі контури (lon, lat); у розрахунок входять лише клітинки «чужої суші» всередині контуру, решта (Молдова, Литва, Словаччина…) лишається закритою
  const AIRPOLY = {
    pl: [[14.12, 53.93], [14.20, 52.85], [14.60, 52.60], [14.75, 51.85], [15.00, 51.05], [15.30, 50.85], [16.45, 50.60], [16.85, 50.25], [17.75, 50.05], [18.85, 49.50], [19.80, 49.20], [20.60, 49.40], [21.80, 49.35], [22.55, 49.05], [22.70, 49.50], [23.45, 50.40], [23.95, 50.75], [23.62, 51.50], [23.55, 52.10], [23.90, 52.70], [23.45, 53.35], [23.50, 53.95], [22.80, 54.36], [19.65, 54.45], [18.90, 54.80], [17.20, 54.70], [16.20, 54.20], [14.90, 54.05]],
    ro: [[20.26, 46.12], [21.20, 46.35], [22.00, 47.45], [22.90, 47.95], [24.00, 47.95], [25.10, 47.75], [26.05, 48.25], [26.70, 48.25], [27.55, 47.40], [28.10, 46.65], [28.15, 45.45], [28.75, 45.20], [29.65, 45.20], [29.70, 44.80], [28.70, 43.75], [27.30, 44.15], [25.50, 43.65], [23.00, 43.80], [22.65, 44.25], [22.45, 44.65], [21.35, 44.85], [21.00, 45.40], [20.60, 45.80]],
    hu: [[16.11, 46.87], [16.50, 47.00], [16.45, 47.65], [17.10, 48.00], [17.80, 47.75], [18.75, 47.85], [19.50, 48.05], [20.30, 48.30], [21.50, 48.55], [22.15, 48.40], [22.90, 47.95], [22.00, 47.45], [21.20, 46.35], [20.26, 46.12], [19.60, 46.15], [18.80, 45.90], [17.60, 45.95], [16.60, 46.45]],
    by: [[23.62, 51.50], [24.05, 51.62], [25.00, 51.90], [25.90, 51.90], [27.30, 51.60], [28.50, 51.55], [29.30, 51.40], [30.20, 51.45], [30.75, 51.40], [31.78, 52.10], [31.60, 52.80], [31.20, 53.20], [30.90, 53.55], [31.50, 54.15], [30.80, 54.65], [30.95, 55.00], [30.55, 55.45], [29.90, 55.85], [28.30, 56.05], [28.10, 56.15], [27.60, 55.80], [26.60, 55.30], [25.70, 54.85], [25.55, 54.15], [24.45, 53.95], [23.50, 53.95], [23.45, 53.35], [23.90, 52.70], [23.55, 52.10]],
    tr: [[26.05, 40.40], [26.05, 41.75], [28.00, 41.95], [28.90, 41.25], [30.00, 41.15], [31.00, 41.12], [32.00, 41.80], [32.50, 42.00], [34.00, 42.05], [35.20, 42.00], [36.00, 41.60], [37.00, 41.20], [38.50, 40.95], [40.00, 41.00], [41.50, 41.55], [41.50, 40.40]]
  };
  const AIR = {
    RELMIN: 20,            // відносини для запиту
    COMPMIN: 0.40,         // політична сумісність (0…1)
    RISKMAX: 0.60,         // допустимий ризик ескалації (0…1)
    FULLMAX: 0.50,         // вище цього ризику країна дає лише умовний дозвіл
    WAIT: [20, 60],        // очікування рішення, хв гри
    COOL: 90,              // перерва після відмови, хв
    OFFER: 60,             // скільки діє пропозиція умов, хв
    LEAD: 5,               // мінімальне випередження початку, хв
    CELL: 4.5,             // середній розмір клітинки сітки, км
    GRACE: 12,             // секунд реального часу між попередженням і порушенням (монітор)
    SCOPE: {
      corr: { n: "Коридор", km: 90, dur: 180, risk: 0, acc: 0, d: "смуга до 90 км углиб від кордону" },
      wide: { n: "Весь простір", km: 9999, dur: 360, risk: 0.18, acc: -9, d: "увесь повітряний простір країни" }
    }
  };
  const SCP = AIR.SCOPE;
  /* мета запиту й тип авіаційної операції (етап 7.74): впливають на ризик і шанс згоди, обмежують дозволені дії */
  const PURP = {
    strike:       { n: "Ракетно-авіаційний удар", i: "💥", risk: 0.08, acc: -5, ops: ["msl", "strike"], d: "траси ракет, БпЛА й ударних літаків" },
    patrol:       { n: "Патрулювання й прикриття", i: "🛡", risk: 0.03, acc: 0, ops: ["cap"], d: "бойове чергування винищувачів" },
    recon:        { n: "Розвідка й ДРЛО", i: "📡", risk: 0.05, acc: -3, ops: ["recon"], d: "політ літака ДРЛО або розвідника" },
    transit:      { n: "Транзит і перебазування", i: "🛫", risk: -0.02, acc: 4, ops: ["ferry"], d: "перегін літаків між аеродромами" },
    humanitarian: { n: "Гуманітарна / евакуаційна місія", i: "🕊", risk: -0.07, acc: 12, ops: ["ferry"], d: "небойовий переліт" },
    exercise:     { n: "Спільні навчання", i: "🎯", risk: -0.01, acc: 3, ops: ["cap", "recon", "ferry"], d: "навчальні польоти з партнером (потрібен договір)" }
  };
  const OPS = {
    msl:    { n: "Пуски ракет і БпЛА (траса)", s: "Пуски", risk: 0.06, acc: -3, av: false, d: "траси ракет і дронів через небо країни" },
    strike: { n: "Ударна авіація", s: "Удар", risk: 0.12, acc: -7, av: true, weap: true, d: "носії з пуском ракет або скиданням бомб" },
    cap:    { n: "Бойове патрулювання", s: "Патруль", risk: 0.04, acc: -2, av: true, weap: true, d: "винищувачі та вертольоти ППО" },
    recon:  { n: "Розвідка / ДРЛО", s: "Розвідка", risk: 0.04, acc: -2, av: true, d: "літаки ДРЛО й розвідники" },
    ferry:  { n: "Транзитний переліт", s: "Транзит", risk: 0, acc: 3, av: true, d: "небойові перельоти" }
  };
  const COVERS = { msl: ["msl"], strike: ["strike", "ferry"], cap: ["cap", "ferry"], recon: ["recon", "ferry"], ferry: ["ferry"] };   // що саме дозволяє дозвіл кожного типу
  /* власні гарантії запитувача: підвищують шанс згоди, але стають обов'язковими умовами дозволу (їх порушення = порушення дозволу) */
  const CONDS = {
    noweap: { n: "Без застосування зброї над територією країни", s: "без зброї", risk: -0.06, acc: 6, ok: op => op === "strike" || op === "cap" },
    nobal:  { n: "Без балістики й гіперзвуку", s: "без балістики", risk: -0.06, acc: 6, ok: op => op === "msl" },
    notify: { n: "Повідомляти країну про кожен вхід у зону", s: "повідомлення про вхід", risk: -0.03, acc: 4, ok: () => true }
  };
  const SCPS = SCP;
  function freshAir(){ return { req: [], perm: [], hist: [], dec: [], inc: {}, trust: {}, cool: {}, enforce: true, stat: { ua: { ok: 0, cond: 0, den: 0, viol: 0, exp: 0 }, ru: { ok: 0, cond: 0, den: 0, viol: 0, exp: 0 } }, ver: 1, tn: 0 }; }
  const pk = (p, x) => p + ">" + x;
  const winOn = (q, t) => !q.dead && t >= (q.from == null ? q.t0 : q.from) && t < q.until;
  const permsOf = sd => D.air.perm.filter(q => q.sd === sd && winOn(q, D.t));                // діють зараз
  const permsAll = sd => D.air.perm.filter(q => q.sd === sd && !q.dead && D.t < q.until);       // діють або ще не почалися
  const opOf = q => q.op || "msl";
  const permFor = (sd, x, op) => permsOf(sd).find(q => q.st === x && (!op || opOf(q) === op));
  const permAny = (sd, x, op) => permsAll(sd).find(q => q.st === x && (!op || opOf(q) === op));
  const reqFor = (sd, x, op) => D.air.req.find(q => q.from === sd && q.to === x && (!op || !q.f || q.f.op === op));
  const trustOf = (p, x) => D.air.trust[pk(p, x)] || 0;
  const addTrust = (p, x, d) => { D.air.trust[pk(p, x)] = clamp(trustOf(p, x) + d, -40, 40); };
  const airTouch = () => { D.air.ver++; D.ver++; dirty = true; try { const x = XX(); x && x.airReset && x.airReset(); } catch (e) { /* */ } };
  const pct = v => Math.round(v * 100) + "%";
  const fmtDur = m => { m = Math.max(0, Math.round(m)); const h = Math.floor(m / 60), r = m % 60; return h ? h + " год" + (r ? " " + r + " хв" : "") : r + " хв"; };
  const capWord = q => opOf(q) === "msl" ? "пусків" : "літаків";
  const termsText = q => [q.km >= 9999 ? "весь простір країни" : `коридор до ${q.km} км від кордону`, q.cap ? `до ${q.cap} ${capWord(q)}` : "без ліміту", q.noBal ? "без балістики й гіперзвуку" : "", q.noWeap ? "без застосування зброї" : "", q.notify ? "повідомлення про вхід" : "", q.fee ? `плата ${fm(q.fee)} млн $` : "", q.dep ? `депозит ${fm(q.dep)} млн $` : ""].filter(Boolean).join(" · ");
  const E0 = sd => { try { return ecoE(sd); } catch (e) { return null; } };
  function refund(sd, v, why){ if (!(v > 0)) return; const E = E0(sd); if (E) E.money += v; if (why) log(`Депозит ${fm(v)} млн $ повернено (${why})`, "info", [sd]); }

  /* нормалізація форми запиту. legacy — старий виклик (лише обсяг): без модифікаторів 7.74, строк рахується від рішення */
  function airForm(p, f, legacy){
    f = f || {}; const scope = SCP[f.scope] ? f.scope : "corr";
    const purpose = PURP[f.purpose] ? f.purpose : "strike";
    const op = OPS[f.op] && PURP[purpose].ops.includes(f.op) ? f.op : (legacy ? "msl" : PURP[purpose].ops[0]);
    const dur = clamp(Math.round((+f.dur || SCP[scope].dur) / 10) * 10, 30, 720);
    const start = legacy ? D.t : Math.max(D.t + AIR.LEAD, Math.round(+f.start || D.t + AIR.LEAD));
    const conds = {}; if (f.conds) for (const k in CONDS) if (f.conds[k] && CONDS[k].ok(op)) conds[k] = 1;
    const cap = f.cap > 0 ? clamp(Math.round(f.cap), 1, 40) : 0, dep = f.dep > 0 ? clamp(Math.round(f.dep * 2) / 2, 0.5, 30) : 0;
    return { _n: 1, legacy: !!legacy, scope, purpose, op, dur, start, conds, cap, dep };
  }
  const normForm = (p, f, scope) => f && f._n ? f : (f && typeof f === "object" ? airForm(p, f, false) : airForm(p, { scope }, true));

  /* політична сумісність 0…1: ідеологія, договори, спільні союзники; мінус — конфлікт блоків і санкції */
  function airCompat(p, x){
    const rs = []; let v = 0.55; const add = (l, d) => { if (Math.abs(d) >= 0.005){ rs.push([l, d]); v += d; } };
    add("Ідеологічна відстань", -0.35 * Math.abs(D.ide[p] - D.ide[x]));
    add(hasT(p, x, "alliance") ? "Союз" : hasT(p, x, "military") ? "Військовий договір" : "Договори", hasT(p, x, "alliance") ? 0.30 : hasT(p, x, "military") ? 0.20 : 0);
    add("Торгівля", hasT(p, x, "trade") ? 0.08 : 0);
    let sh = 0; for (const y of allies(x).concat(partners(x, "military").map(z => z.id))) if (y !== p && R(p, y) > 30) sh += 0.04; add("Спільні союзники", Math.min(0.12, sh));
    add("Конфлікт блоків", -conflictPen(p, x) / 100);
    add("Санкції", -0.12 * Math.max(sancLvl(x, p), sancLvl(p, x)));
    return { v: clamp(v, 0, 1), rs };
  }
  /* ризик ескалації 0…1: близькість до противника запитувача, міць противника, його ворожість до країни, власна напруга, інциденти;
     за формою 7.74 — ще мета, тип операції, строк, випередження й гарантії запитувача */
  function airRisk(p, x, scope, form){
    const rs = []; let v = 0.04; const add = (l, d) => { if (Math.abs(d) >= 0.005){ rs.push([l, d]); v += d; } };
    add("Обсяг запиту", (SCP[scope] || SCP.corr).risk);
    const foes = enemies(p).filter(e => e !== x);
    for (const f of foes){
      const near = BY[x].nb.includes(f) || BY[f].nb.includes(x);
      add(near ? `Спільний кордон із ${nm(f)}` : `Противник: ${nm(f)}`, near ? 0.16 : 0.05);
      add("Військова міць противника", BY[f].pow / 10 * 0.14);
      if (R(f, x) < -40) add("Ворожість противника до країни", 0.08); else if (R(f, x) > 40) add("Країна дружня до противника", 0.14);
      if (hasT(f, x, "alliance") || hasT(f, x, "military")) add("Країна пов'язана договором із противником", 0.2);
    }
    add("Власна напруга країни", threat(x) * 0.18);
    add("Попередні інциденти", Math.min(0.3, (D.air.inc[x] || 0) * 0.06));
    if ((hasT(p, x, "alliance") || hasT(p, x, "military")) && BY[x].pow >= 4) add("Гарантії союзника", -0.10);
    if (form && !form.legacy){
      const P = PURP[form.purpose], O = OPS[form.op];
      add("Мета: " + P.n.toLowerCase(), P.risk); add("Тип операції: " + O.n.toLowerCase(), O.risk);
      add("Тривалість " + fmtDur(form.dur), clamp((form.dur / 60 - 2) * 0.012, -0.01, 0.1));
      const lead = form.start - D.t; if (lead < 20) add("Запит «в останню мить»", 0.03); else if (lead > 360) add("Далекий горизонт планування", 0.015);
      for (const k in form.conds) add("Гарантія: " + CONDS[k].s, CONDS[k].risk);
      if (form.cap) add("Обмеження кількості (" + form.cap + ")", -clamp((12 - form.cap) * 0.004, 0, 0.04));
      if (form.dep) add("Депозит " + fm(form.dep) + " млн $", -Math.min(0.03, form.dep * 0.003));
    }
    return { v: clamp(v, 0, 1), rs };
  }
  /* повна оцінка запиту: blk — чому недоступний; gates — три умови; p — шанс згоди; rs — причини */
  function airGates(p, x, scope, form){
    scope = SCP[scope] ? scope : "corr";
    const r = Math.round(R(p, x)), cm = airCompat(p, x), rk = airRisk(p, x, scope, form);
    return { scope, r, cm, rk, gates: { rel: r >= AIR.RELMIN, cmp: cm.v >= AIR.COMPMIN, rsk: rk.v <= AIR.RISKMAX } };
  }
  function evalAir(p, x, scope, form){
    if (scope && typeof scope === "object"){ form = scope; scope = form.scope; }
    const f = normForm(p, form, scope); scope = f.scope;
    const o = airGates(p, x, scope, f), rs = []; let sc = 0; const add = (l, v) => { if (Math.abs(v) >= 0.5){ rs.push([l, Math.round(v)]); sc += v; } };
    add("Відносини", (o.r - AIR.RELMIN) * 0.35); add("Політична сумісність", (o.cm.v - AIR.COMPMIN) * 45); add("Ризик ескалації", -o.rk.v * 60);
    add("Довіра до виконання умов", trustOf(p, x) * 0.5); add("Репутація", clamp(D.rep[p] * 0.15, -10, 10)); add("Обсяг запиту", SCP[scope].acc);
    const pm = permFor(p, x, f.op); if (pm && !pm.viol) add("Бездоганне використання", 8);
    if (!f.legacy){
      const P = PURP[f.purpose], O = OPS[f.op], lead = f.start - D.t;
      add("Мета запиту", P.acc); add("Тип операції", O.acc);
      add("Тривалість", -clamp((f.dur / 60 - 3) * 1.2, 0, 8));
      if (lead >= 60) add("Завчасне подання", 3); else if (lead < 20) add("Запит в останню мить", -6);
      for (const k in f.conds) add("Гарантія: " + CONDS[k].s, CONDS[k].acc);
      if (f.cap) add("Обмеження кількості", clamp((12 - f.cap) * 0.6, -3, 6));
      if (f.dep) add("Депозит", Math.min(14, f.dep * 1.4));
    }
    o.rs = rs; o.p = clamp(0.35 + sc / 60, 0.02, 0.95); o.f = f;
    const s = stOf(p, x), cd = D.air.cool[pk(p, x)] || 0, pa = permAny(p, x, f.op), Ep = E0(p);
    if (!AIRST.includes(x)) o.blk = "У цієї держави немає неба на мапі";
    else if (s === "war") o.blk = "Ви у стані війни";
    else if (sancLvl(x, p)) o.blk = "Ця держава ввела проти вас санкції";
    else if (reqFor(p, x, f.op)) o.blk = "Запит на цей тип операції вже розглядається";
    else if (pa && pa.until - D.t > 60) o.blk = pa.from > D.t ? "Дозвіл на цей тип операції вже оформлено — він набуде чинності пізніше" : "Дозвіл ще діє — повторний запит за годину до завершення";
    else if (cd > D.t) o.blk = "Повторити запит можна через " + Math.ceil(cd - D.t) + " хв";
    else if (!o.gates.rel) o.blk = `Потрібні відносини ≥ ${AIR.RELMIN} (зараз ${o.r})`;
    else if (!o.gates.cmp) o.blk = `Політична сумісність ${pct(o.cm.v)} < ${pct(AIR.COMPMIN)}`;
    else if (!o.gates.rsk) o.blk = `Ризик ескалації ${pct(o.rk.v)} > ${pct(AIR.RISKMAX)}`;
    else if (!f.legacy && f.purpose === "exercise" && !hasT(p, x, "alliance") && !hasT(p, x, "military")) o.blk = "Спільні навчання потребують військового договору або союзу";
    else if (!f.legacy && f.dep && Ep && Ep.money < f.dep) o.blk = `Бракує коштів на депозит (${fm(f.dep)} млн $)`;
    return o;
  }
  /* орієнтовне очікування рішення, хв (для форми й відправки) */
  function airWait(p, x, e){
    const span = AIR.WAIT[1] - AIR.WAIT[0], k = (hasT(p, x, "alliance") ? 0.6 : hasT(p, x, "military") ? 0.8 : 1) * (1 + e.rk.v * 0.6);
    return Math.round((AIR.WAIT[0] + rnd() * span) * k / 5) * 5 || 5;
  }
  const waitRange = (p, x, e) => { const k = (hasT(p, x, "alliance") ? 0.6 : hasT(p, x, "military") ? 0.8 : 1) * (1 + e.rk.v * 0.6); return [Math.max(5, Math.round(AIR.WAIT[0] * k / 5) * 5), Math.max(5, Math.round(AIR.WAIT[1] * k / 5) * 5)]; };

  /* ---- рішення, дозволи ---- */
  function airTerms(e, full, f){
    const S = SCP[e.scope]; f = f || airForm(null, { scope: e.scope }, true);
    const km = full ? S.km : Math.round(clamp(S.km >= 9999 ? 140 : S.km * (0.55 + rnd() * 0.35), 30, 200) / 10) * 10;
    const base = f.legacy ? S.dur : f.dur, u = rnd();
    const dur = Math.max(30, Math.round((full ? base * (f.legacy ? 0.85 + u * 0.15 : 0.9 + u * 0.1) : base * (0.45 + u * 0.3)) / 10) * 10);
    const t = { km, dur, cap: null, noBal: false, noWeap: false, notify: false, fee: 0, dep: 0 };
    if (!full){
      t.cap = 6 + Math.floor(rnd() * 11); t.noBal = f.op === "msl" && e.rk.v > 0.28; t.noWeap = (f.op === "strike" || f.op === "cap") && e.rk.v > 0.3;
      t.fee = Math.round((1 + e.rk.v * 8 + rnd() * 2) * 2) / 2;
    }
    if (f.conds.noweap) t.noWeap = true; if (f.conds.nobal) t.noBal = true; if (f.conds.notify) t.notify = true;      // власні гарантії запитувача — обов'язкові
    if (f.cap) t.cap = t.cap ? Math.min(t.cap, f.cap) : f.cap;
    if (f.dep) t.dep = f.dep;
    return t;
  }
  function decRec(rec){ rec.id = D.nid++; rec.t = D.t; rec.read = false; D.air.dec.push(rec); if (D.air.dec.length > 24) D.air.dec.shift(); D.ver++; dirty = true; return rec; }
  const fmtWin = q => `${fmtT(q.from == null ? q.t0 : q.from)} → ${fmtT(q.until)}`;
  function airNotify(rec, toast){
    try { window.dispatchEvent(new CustomEvent("bv-air-decision", { detail: rec })); } catch (e) { /* */ }
    if (toast && isHuman(rec.p) && active()) try { XX().toast(toast, rec.out === "deny" || rec.out === "viol" || rec.out === "revoked" ? "warn" : "ok"); } catch (e) { /* */ }
  }
  function airGrant(p, x, scope, t, cond, f, decId, dep){
    const f0 = f || airForm(p, { scope }, true), op = f0.op;
    const old = D.air.perm.filter(q => q.sd === p && q.st === x && opOf(q) === op && !q.dead); old.forEach(q => { q.dead = true; D.air.perm = D.air.perm.filter(z => z !== q); if (q.dep) refund(p, q.dep, "дозвіл замінено новим"); });
    const from = f0.legacy ? D.t : Math.max(D.t, f0.start), winEnd = f0.legacy ? Infinity : f0.start + f0.dur;
    const until = f0.legacy ? D.t + t.dur : from + Math.min(t.dur, Math.max(20, winEnd - from));
    const q = { id: D.nid++, sd: p, st: x, scope, op, purpose: f0.purpose, t0: D.t, from, until, km: t.km, cap: t.cap || 0, noBal: !!t.noBal, noWeap: !!t.noWeap, notify: !!t.notify, fee: t.fee || 0, dep: dep != null ? dep : (t.dep || 0), uses: 0, viol: 0, cond: !!cond, warned: false, on: from <= D.t, ac: {} };
    D.air.perm.push(q);
    const cq = [], eff = (k, tx, d) => cq.push({ k, t: tx, d });
    const wide = scope === "wide", r0 = R(p, x), rp0 = D.rep[x];
    addR(p, x, cond ? 2 : 4); eff("rel", `Відносини з ${nm(x)}`, Math.round(R(p, x) - r0));
    D.rep[p] = clamp(D.rep[p] + 1, -100, 100); eff("rep", `Ваша репутація`, 1);
    D.rep[x] = clamp(D.rep[x] - (wide ? 2 : 1), -100, 100); eff("rep", `Репутація ${nm(x)} серед противників (пустила ${wide ? "увесь простір" : "коридор"})`, Math.round(D.rep[x] - rp0));
    for (const fo of enemies(p)){ if (fo === x) continue; const b = R(fo, x); addR(fo, x, -(2 + (R(fo, x) < -40 ? 2 : 4) * (wide ? 1.5 : 1))); for (const c of allies(fo)) if (c !== x) addR(c, x, -1); eff("third", `${nm(fo)} гірше ставиться до ${nm(x)} (і його союзники)`, Math.round(R(fo, x) - b)); }
    D.air.stat[p][cond ? "cond" : "ok"]++;
    const when = q.from > D.t ? `з ${fmtT(q.from)} до ${fmtT(q.until)}` : `на ${fmtDur(q.until - D.t)}`;
    log(`✈ ${BY[x].f} ${nm(x)} ${cond ? "умовно відкрила" : "відкрила"} небо для ${nm(p)} (${OPS[op].s.toLowerCase()}): ${termsText(q)} · ${when}`, "good", [p, x], true);
    const dr = decId ? D.air.dec.find(z => z.id === decId) : null;
    if (dr){ dr.cq = (dr.cq || []).concat(cq); dr.q = q.id; dr.win = [q.from, q.until]; dr.out = cond ? "cond-ok" : dr.out; dr.read = false; airNotify(dr, null); }
    airTouch(); return q;
  }
  function airEnd(q, how, why){
    if (q.dead) return; q.dead = true; D.air.perm = D.air.perm.filter(z => z !== q); const p = q.sd, x = q.st, clean = !q.viol;
    D.air.hist.push({ sd: p, st: x, op: opOf(q), t0: q.t0, t1: D.t, how, uses: q.uses, why: why || "" }); if (D.air.hist.length > 12) D.air.hist.shift();
    const cq = [], eff = (k, tx, d) => cq.push({ k, t: tx, d });
    if (how === "expired" || how === "limit" || how === "returned"){
      if (clean && q.uses > 0){ addTrust(p, x, Math.min(8, 3 + q.uses * 0.3)); addR(p, x, 2); D.rep[p] = clamp(D.rep[p] + 1, -100, 100); eff("rel", `Відносини з ${nm(x)}`, 2); eff("trust", `Довіра ${nm(x)} до виконання умов`, Math.round(Math.min(8, 3 + q.uses * 0.3))); eff("rep", "Ваша репутація", 1); }
      else if (clean){ addTrust(p, x, 1); eff("trust", `Довіра ${nm(x)} до виконання умов`, 1); }
      if (clean && q.dep){ refund(p, q.dep, "дозвіл виконано без порушень"); eff("money", "Депозит повернено", q.dep); }
      D.air.stat[p].exp++;
      log(`✈ Дозвіл ${nm(x)} для ${nm(p)} ${how === "limit" ? "вичерпано за лімітом" : how === "returned" ? "повернено достроково" : "завершився за строком"}` + (q.uses ? ` (використано ${q.uses}${clean ? ", без порушень" : ""})` : ""), "info", [p, x], true);
    } else if (how === "revoked"){
      addTrust(p, x, -3); eff("trust", `Довіра ${nm(x)} до виконання умов`, -3);
      if (q.dep){ refund(p, q.dep, "дозвіл відкликано країною"); eff("money", "Депозит повернено", q.dep); }
      log(`⛔ ${nm(x)} відкликала дозвіл для ${nm(p)}: ${why}`, "bad", [p, x], true);
    } else if (how === "violation"){
      const r0 = R(p, x); addR(p, x, -12); D.rep[p] = clamp(D.rep[p] - 8, -100, 100); addTrust(p, x, -15); D.air.inc[x] = (D.air.inc[x] || 0) + 1; D.air.stat[p].viol++; D.air.cool[pk(p, x)] = D.t + 240;
      eff("rel", `Відносини з ${nm(x)}`, Math.round(R(p, x) - r0)); eff("rep", "Ваша репутація", -8); eff("trust", `Довіра ${nm(x)} до виконання умов`, -15); eff("cool", `Новий запит до ${nm(x)} — не раніше ніж за 240 хв`, 0);
      for (const c of allies(x)) if (c !== p){ const b = R(c, p); addR(c, p, -3); eff("third", `Союзник ${nm(c)} гірше ставиться до вас`, Math.round(R(c, p) - b)); }
      if (q.dep) eff("money", "Депозит втрачено", -q.dep);
      log(`⚠ Порушення умов неба: ${nm(p)} → ${BY[x].f} ${nm(x)} (${why}). Дозвіл скасовано, відносини −12, репутація −8` + (q.dep ? `, депозит ${fm(q.dep)} млн $ втрачено` : ""), "bad", [p, x], true);
    }
    if (how === "violation" || how === "revoked"){ const rec = decRec({ p, x, out: how === "violation" ? "viol" : "revoked", why: why || "", rs: [], cq, op: opOf(q), q: q.id }); airNotify(rec, (how === "violation" ? "Порушення неба " : "Дозвіл відкликано: ") + nm(x)); }
    airTouch();
  }
  function airRevokeWhy(q){
    const p = q.sd, x = q.st;
    if (stOf(p, x) === "war") return "між державами війна";
    if (R(p, x) < AIR.RELMIN - 25) return "відносини надто погіршилися";
    if (sancLvl(x, p)) return "введено санкції проти запитувача";
    if (airRisk(p, x, q.scope).v > AIR.RISKMAX + 0.15) return "ризик ескалації став неприйнятним";
    return "";
  }
  function airUsedBy(side, pts){                         // у яких країнах із дозволом маршрут іде за межами вільної смуги
    const geo = GEO; if (!geo || !pts) return null; const used = new Set();
    for (const p of pts){ const ix = Math.floor((p[0] - geo.F.lon0) / geo.F.step), iy = Math.floor((p[1] - geo.F.lat0) / geo.F.step); if (ix < 0 || iy < 0 || ix >= geo.F.nx || iy >= geo.F.ny) continue; const i = iy * geo.F.nx + ix; const c = geo.cid[i]; if (c && geo.dist[i] > TRN) used.add(AIRST[c - 1]); }
    return used;
  }
  function airUse(side, pts, W){                         // міст із spawnWeapon: фіксує використання й перевіряє умови (лише дозволи типу «msl»)
    if (!D || !D.air || !active() || !side) return; const ps = permsOf(side).filter(q => opOf(q) === "msl"); if (!ps.length) return;
    let used; try { used = airUsedBy(side, pts); } catch (e) { return; } if (!used || !used.size) return;
    for (const st of used){
      const q = ps.find(z => z.st === st); if (!q || q.dead) continue; q.uses++;
      if (q.noBal && W && (W.cls === "ballistic" || W.cls === "hyper")) { q.viol = 1; airEnd(q, "violation", `${W.n || "ракета"}: балістику й гіперзвук через це небо заборонено`); continue; }
      if (q.notify && isHuman(side)) log(`📣 Повідомлення ${nm(st)}: ${W && W.n || "ціль"} проходить через її небо`, "info", [side, st]);
      if (q.cap && q.uses >= q.cap) airEnd(q, "limit"); else airTouch();
    }
  }
  function airResolve(rq){
    const p = rq.from, x = rq.to, f = rq.f || airForm(p, { scope: rq.scope }, true); rq.f = f;
    const g = airGates(p, x, f.scope, f), e = evalAir(p, x, f); e.rs = e.rs || [];
    const human = isHuman(p); let out = "deny", why = "", late = false;
    if (!f.legacy && f.start + f.dur - D.t < 20){ why = "вікно запиту вже минуло до ухвалення рішення"; late = true; }
    else if (stOf(p, x) === "war") why = "стан війни";
    else if (!g.gates.rel) why = "недостатній рівень довіри";
    else if (!g.gates.cmp) why = "політична несумісність";
    else if (!g.gates.rsk) why = "ризик ескалації надто високий";
    else { const u = rnd(); if (u < e.p) out = (u < e.p * 0.55 && g.rk.v <= AIR.FULLMAX) ? "full" : "cond"; if (out === "deny"){ const w = e.rs.filter(r => r[1] < 0).sort((a, b) => a[1] - b[1])[0]; why = w ? w[0].toLowerCase() : "рішення не на користь запитувача"; } }
    const rsl = e.rs.slice().sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 7);
    if (out === "deny"){
      const cq = [], eff = (k, tx, d) => cq.push({ k, t: tx, d });
      refund(p, rq.dep);
      if (late){ eff("none", "Відносини й репутація не змінилися — країна не відмовляла по суті", 0); if (rq.dep) eff("money", "Депозит повернено", rq.dep); D.air.cool[pk(p, x)] = D.t + 20; eff("cool", `Новий запит — через 20 хв`, 0); }
      else {
        const wide = f.scope === "wide", r0 = R(p, x); addR(p, x, wide ? -3 : -1); D.air.stat[p].den++; D.air.cool[pk(p, x)] = D.t + AIR.COOL; addTrust(p, x, -1);
        eff("rel", `Відносини з ${nm(x)}`, Math.round(R(p, x) - r0)); eff("trust", `Довіра ${nm(x)} до виконання умов`, -1); eff("cool", `Новий запит до ${nm(x)} — не раніше ніж за ${AIR.COOL} хв`, 0);
        if (rq.dep) eff("money", "Депозит повернено", rq.dep);
        if (g.rk.v > 0.4) for (const fo of enemies(p)) if (fo !== x){ const b = R(fo, x); addR(fo, x, 1); eff("third", `${nm(fo)} ставиться до ${nm(x)} трохи краще (обережна нейтральність)`, Math.round(R(fo, x) - b) || 1); }
        if (wide) eff("note", "Запит на весь простір сприйнято як надмірний — відносини впали сильніше", 0);
      }
      log(`🚫 ${BY[x].f} ${nm(x)} відмовила ${nm(p)} у доступі до неба (${why})` + (late ? "" : `; відносини ${f.scope === "wide" ? "−3" : "−1"}`), "bad", [p, x], true);
      const rec = decRec({ p, x, out: late ? "late" : "deny", why, rs: rsl, cq, f, op: f.op }); airNotify(rec, `${nm(x)} відмовила у доступі до неба: ${why}`); airTouch(); return;
    }
    const t = airTerms(g, out === "full", f);
    const rec = decRec({ p, x, out, why: "", rs: rsl, cq: [], f, op: f.op, terms: t });
    if (out === "full"){ airGrant(p, x, f.scope, t, false, f, rec.id, rq.dep); airNotify(rec, `${nm(x)} відкрила небо`); return; }
    if (human){
      D.pend.push({ id: D.nid++, from: x, to: p, type: "airc", exp: D.t + AIR.OFFER, t0: D.t, air: { scope: f.scope, t, f, dec: rec.id, dep: rq.dep || 0 } });
      log(`📨 ${BY[x].f} ${nm(x)} пропонує умовний дозвіл на небо: ${termsText(t)} · ${fmtDur(t.dur)}`, "ask", [p, x], true); airNotify(rec, `${nm(x)} пропонує умови — відповідь у «Подіях»`); airTouch(); return;
    }
    const E = ecoE(p); if (!E || E.money >= t.fee){ if (E) E.money -= t.fee; airGrant(p, x, f.scope, t, true, f, rec.id, 0); }
    else { D.air.stat[p].den++; D.air.cool[pk(p, x)] = D.t + AIR.COOL; log(`${nm(p)} відхилила умови ${nm(x)} щодо неба`, "info", [p, x]); airTouch(); }
  }
  function airAnswer(pd, yes){
    const i = D.pend.indexOf(pd), x = pd.from, p = pd.to, a = pd.air; if (i < 0) return;
    if (yes){
      const E = ecoE(p), fee = a.t.fee || 0;
      if (E && E.money < fee){ try { XX().toast(`Бракує коштів на умови (${fm(fee)} млн $)`, "warn"); } catch (e) { /* */ } return; }
      D.pend.splice(i, 1); if (E) E.money -= fee; airGrant(p, x, a.scope, a.t, true, a.f, a.dec, a.dep);
    } else {
      D.pend.splice(i, 1); const r0 = R(p, x); addR(p, x, -1); D.air.cool[pk(p, x)] = D.t + 30; refund(p, a.dep); log(`Ви відхилили умови ${nm(x)} щодо повітряного простору`, "info", [p, x]);
      const dr = D.air.dec.find(z => z.id === a.dec); if (dr){ dr.out = "cond-no"; dr.cq = [{ k: "rel", t: `Відносини з ${nm(x)}`, d: Math.round(R(p, x) - r0) }, { k: "cool", t: `Новий запит до ${nm(x)} — не раніше ніж за 30 хв`, d: 0 }].concat(a.dep ? [{ k: "money", t: "Депозит повернено", d: a.dep }] : []); dr.read = false; airNotify(dr, null); }
      airTouch();
    }
    afterAct();
  }
  function airSend(x, arg){
    if (!active() || !D) return; const p = pov(); if (!p) return; const msg = (m, k) => { try { XX().toast(m, k || "info"); } catch (e) { /* */ } };
    const f = normForm(p, arg && typeof arg === "object" ? arg : null, typeof arg === "string" ? arg : (arg && arg.scope));
    const e = evalAir(p, x, f); if (e.blk){ msg(e.blk, "warn"); return null; }
    const wait = airWait(p, x, e), E = ecoE(p); if (f.dep && E) E.money -= f.dep;
    const rq = { id: D.nid++, from: p, to: x, scope: e.scope, f, t0: D.t, dec: D.t + wait, dep: f.dep || 0 };
    D.air.req.push(rq);
    log(`✈ ${nm(p)} запросила у ${BY[x].f} ${nm(x)} доступ до повітряного простору (${f.legacy ? SCP[e.scope].n.toLowerCase() : OPS[f.op].s.toLowerCase() + " · " + fmtDur(f.dur) + " з " + fmtT(f.start)}); рішення очікується ≈ через ${fmtDur(wait)}`, "info", [p, x]);
    msg(`Запит до ${nm(x)} надіслано — відповідь за ≈ ${fmtDur(wait)}`, "ok"); airTouch(); afterAct(); return rq;
  }
  function airCancelReq(id){ const i = D.air.req.findIndex(q => q.id === id); if (i < 0) return; const q = D.air.req[i]; D.air.req.splice(i, 1); refund(q.from, q.dep, "запит скасовано"); log(`Запит до ${nm(q.to)} скасовано`, "info", [q.from, q.to]); airTouch(); afterAct(); }
  function airReturn(id){ const q = D.air.perm.find(z => z.id === id); if (q) airEnd(q, "returned"); afterAct(); }
  function airTick(){
    const A = D.air; A.tn++; if (A.tn % 24 === 0) for (const k in A.inc) if (A.inc[k] > 0) A.inc[k]--;
    for (const rq of A.req.slice()) if (D.t >= rq.dec){ A.req.splice(A.req.indexOf(rq), 1); airResolve(rq); }
    for (const q of A.perm.slice()){
      if (q.dead) continue;
      if (D.t >= q.until){ airEnd(q, "expired"); continue; }
      const why = airRevokeWhy(q); if (why){ airEnd(q, "revoked", why); continue; }
      if (!q.on && D.t >= (q.from == null ? q.t0 : q.from)){ q.on = true; log(`✈ Дозвіл ${nm(q.st)} на небо набув чинності (${OPS[opOf(q)].s.toLowerCase()}, до ${fmtT(q.until)})`, "good", [q.sd, q.st], true); airTouch(); }
      if (q.on && !q.warned && q.until - D.t <= 30){ q.warned = true; log(`⏳ Дозвіл ${nm(q.st)} на небо спливає за ≈ ${fmtDur(q.until - D.t)}`, "info", [q.sd, q.st], true); }
    }
    if (D.ai) for (const sd of MAIN){                    // ІІ-сторона теж просить небо (рідко, лише коли умови виконано)
      if (isHuman(sd) || rnd() > 0.07) continue;
      const c = AIRST.filter(x => x !== sd && !permAny(sd, x, "msl")).map(x => ({ x, e: evalAir(sd, x, "corr") })).filter(o => !o.e.blk && o.e.p > 0.45).sort((a, b) => b.e.p - a.e.p)[0];
      if (c){ const wait = AIR.WAIT[0] + Math.round(rnd() * (AIR.WAIT[1] - AIR.WAIT[0])); A.req.push({ id: D.nid++, from: sd, to: c.x, scope: "corr", f: airForm(sd, { scope: "corr" }, true), t0: D.t, dec: D.t + wait, dep: 0 }); log(`✈ ${nm(sd)} запросила небо ${nm(c.x)}`, "info", [sd, c.x]); airTouch(); }
    }
  }
  /* ---- карта неба: країни, глибина від вільного неба; сітка «чужої суші» береться з гри (BV_DIPX.foreignGrid) ---- */
  let GEO = null; const GR = {};
  function airGeo(F){
    if (GEO && GEO.F === F) return GEO;
    const nx = F.nx, ny = F.ny, cid = new Uint8Array(nx * ny), dist = new Int16Array(nx * ny).fill(-1), q = [];
    AIRST.forEach((k, ci) => {
      const P = AIRPOLY[k]; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const v of P){ x0 = Math.min(x0, v[0]); x1 = Math.max(x1, v[0]); y0 = Math.min(y0, v[1]); y1 = Math.max(y1, v[1]); }
      const ix0 = Math.max(0, Math.floor((x0 - F.lon0) / F.step)), ix1 = Math.min(nx - 1, Math.ceil((x1 - F.lon0) / F.step)), iy0 = Math.max(0, Math.floor((y0 - F.lat0) / F.step)), iy1 = Math.min(ny - 1, Math.ceil((y1 - F.lat0) / F.step));
      for (let iy = iy0; iy <= iy1; iy++) for (let ix = ix0; ix <= ix1; ix++){
        const i = iy * nx + ix; if (!F.blk[i] || cid[i]) continue; const X = F.lon0 + (ix + 0.5) * F.step, Y = F.lat0 + (iy + 0.5) * F.step; let inn = false;
        for (let a = 0, b = P.length - 1; a < P.length; b = a++){ const A = P[a], B = P[b]; if ((A[1] > Y) !== (B[1] > Y) && X < (B[0] - A[0]) * (Y - A[1]) / (B[1] - A[1]) + A[0]) inn = !inn; }
        if (inn) cid[i] = ci + 1;
      }
    });
    for (let i = 0; i < dist.length; i++) if (!F.blk[i]){ dist[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++){ const i = q[h], x = i % nx, y = (i / nx) | 0, d = dist[i];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){ const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= nx || Y >= ny) continue; const j = Y * nx + X; if (dist[j] < 0){ dist[j] = d + 1; q.push(j); } } }
    return (GEO = { F, cid, dist });
  }
  const FGRID = () => { try { const x = XX(); return x && x.foreignGrid ? x.foreignGrid() : null; } catch (e) { return null; } };
  const limCells = q => q.km >= 9999 ? 1e4 : Math.round(q.km / AIR.CELL);
  /* сітка, у якій клітинки країн із дозволом сторони відкриті в межах глибини коридору; null — немає дозволів (гра рахує як раніше).
     Беруться лише діючі дозволи типу «msl» (траси ракет і БпЛА) */
  function airGrid(side, T, F){
    try {
      if (!D || !D.air || !active()) return null; side = side || pov(); if (!side) return null;
      const ps = permsOf(side).filter(q => opOf(q) === "msl"); if (!ps.length || !T || !T.blk || !F || !F.blk) return null;
      const key = D.air.ver + ":" + ps.map(q => q.id).join(","), c = GR[side]; if (c && c.key === key && c.T === T) return c.g;
      const geo = airGeo(F), g = Object.assign({}, T, { blk: T.blk.slice(), cache: new Map() }), by = {};
      ps.forEach(q => { by[AIRST.indexOf(q.st) + 1] = q; });
      for (let i = 0; i < g.blk.length; i++){ if (!g.blk[i]) continue; const q = by[geo.cid[i]]; if (q && geo.dist[i] <= limCells(q)) g.blk[i] = 0; }
      GR[side] = { key, T, g }; return g;
    } catch (e) { if (window.console) console.warn("[dip air]", e); return null; }
  }

  /* ---- перевірка точки й маршруту проти дозволів (етап 7.74) ---- */
  const dkm = (a, b) => { const kx = 111.32 * Math.cos((a[1] + b[1]) / 2 * Math.PI / 180); return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 110.574); };
  function cellAt(F, pos){
    const geo = airGeo(F), ix = Math.floor((pos[0] - F.lon0) / F.step), iy = Math.floor((pos[1] - F.lat0) / F.step);
    if (ix < 0 || iy < 0 || ix >= F.nx || iy >= F.ny || !F.blk[iy * F.nx + ix]) return { free: true };
    const i = iy * F.nx + ix, c = geo.cid[i]; return c ? { st: AIRST[c - 1], d: geo.dist[i], i } : { closed: true, d: geo.dist[i], i };
  }
  /* стан польоту над кліткою c у момент t: free / closed / noperm / op / early / late / depth / edge / ok */
  function airStatusAt(side, c, op, t){
    if (c.free) return { k: "free" }; if (c.closed) return { k: "closed" };
    const all = permsAll(side).filter(q => q.st === c.st);
    if (!all.length) return { k: "noperm", req: !!reqFor(side, c.st) };
    const cov = all.filter(q => (COVERS[opOf(q)] || []).includes(op));
    if (!cov.length) return { k: "op", q: all[0] };
    const ok = cov.filter(q => t >= (q.from == null ? q.t0 : q.from) && t < q.until);
    if (!ok.length){
      const before = cov.filter(q => t < (q.from == null ? q.t0 : q.from)).sort((a, b) => a.from - b.from)[0];
      return before ? { k: "early", q: before } : { k: "late", q: cov.sort((a, b) => b.until - a.until)[0] };
    }
    const q = ok.sort((a, b) => limCells(b) - limCells(a))[0], L = limCells(q), mc = L - c.d;
    if (mc < 0) return { k: "depth", q, mc };
    return { k: mc <= 2 ? "edge" : "ok", q, mc };
  }
  const STATUS_TXT = {
    noperm: (st, s) => `Немає дозволу на небо ${BY[st].f} ${nm(st)}` + (s.req ? " (запит ще розглядається)" : ""),
    closed: () => "Закрите небо третьої країни — дозвіл неможливий",
    op: (st, s) => `Дозвіл ${nm(st)} не охоплює цей тип операції`,
    early: (st, s) => `Політ у небі ${nm(st)} раніше початку дозволу (${fmtT(s.q.from)})`,
    late: (st, s) => `Дозвіл ${nm(st)} уже спливе (${fmtT(s.q.until)})`,
    depth: (st, s) => `Вихід за межі коридору ${nm(st)} (ліміт ${s.q.km >= 9999 ? "—" : s.q.km + " км"})`
  };
  const isBad = k => k === "noperm" || k === "closed" || k === "op" || k === "early" || k === "late" || k === "depth";
  /* маршрут pts [[lon,lat]…] для сторони side: opt = { op, speed (км/год), start (хв гри), n (літаків), weap, cls, step } */
  function airCheckRoute(side, pts, opt){
    opt = Object.assign({ op: "strike", speed: 800, start: D ? D.t : 0, n: 1, weap: false, cls: "", step: 4 }, opt || {});
    const F = opt.F || FGRID(), out = { ok: true, errors: [], warns: [], segs: [], parts: [], km: 0, eta: 0, tEnd: opt.start, n: opt.n, noGrid: !F };
    if (!D || !D.air || !pts || pts.length < 2) return out; if (!F) return out;
    const P = [pts[0]], S = [0]; let tot = 0;
    for (let i = 1; i < pts.length; i++){ const a = pts[i - 1], b = pts[i], d = dkm(a, b), n = Math.max(1, Math.ceil(d / opt.step)); for (let k = 1; k <= n; k++){ P.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); tot += d / n; S.push(tot); } }
    const sp = Math.max(60, opt.speed), T = S.map(s => opt.start + s / sp * 60);
    const C = P.map((p, i) => { const c = cellAt(F, p); return { c, s: airStatusAt(side, c, opt.op, T[i]) }; });
    out.km = tot; out.eta = tot / sp * 60; out.tEnd = T[T.length - 1];
    const keyOf = c => c.free ? "free" : c.closed ? "closed" : c.st;
    for (let a = 0; a < C.length;){
      let b = a; const kk = keyOf(C[a].c); while (b + 1 < C.length && keyOf(C[b + 1].c) === kk) b++;
      if (kk !== "free"){
        const st = C[a].c.st || null; let maxd = 0, worst = "ok", qs = null; const bad = {};
        for (let i = a; i <= b; i++){ const s = C[i].s; maxd = Math.max(maxd, C[i].c.d || 0); if (s.q && !qs) qs = s.q; if (isBad(s.k) && !bad[s.k]) bad[s.k] = i; if (s.k === "edge" && worst === "ok") worst = "edge"; }
        const seg = { st, km0: S[a], km1: S[b], tIn: T[a], tOut: T[b], maxKm: Math.round(maxd * AIR.CELL), q: qs ? qs.id : 0, k: Object.keys(bad).length ? "bad" : worst, bad: Object.keys(bad) };
        out.segs.push(seg);
        const kmTxt = `км ${Math.round(S[a])}–${Math.round(S[b])}`;
        Object.keys(bad).forEach(k => { const i = bad[k]; out.errors.push({ k, st, at: P[i], km: S[i], t: T[i], msg: (STATUS_TXT[k](st, C[i].s)) + ` (${kmTxt})`, hint: k === "noperm" ? "Подайте запит на небо цієї країни або оберіть обхід" : k === "depth" ? "Перенесіть точки ближче до кордону або запросіть весь простір" : k === "late" || k === "early" ? "Змініть час початку польоту" : k === "op" ? "Потрібен дозвіл на цей тип операції" : "" }); });
        const ed = C.findIndex((z, i) => i >= a && i <= b && z.s.k === "edge");
        if (ed >= 0 && !Object.keys(bad).length) out.warns.push({ k: "edge", st, at: P[ed], km: S[ed], msg: `Маршрут у небі ${nm(st)} проходить за ≈ ${Math.max(1, Math.round(C[ed].s.mc * AIR.CELL))} км від межі дозволеної зони` });
        else if (ed >= 0) out.warns.push({ k: "edge", st, at: P[ed], km: S[ed], msg: `Ділянка в небі ${nm(st)} впритул до межі зони` });
        if (qs && !Object.keys(bad).length){
          const q = qs, used = opOf(q) === "msl" ? q.uses : Object.keys(q.ac || {}).length;
          if (q.cap && used + opt.n > q.cap) out.errors.push({ k: "cap", st, at: P[Math.round((a + b) / 2)], km: S[a], t: T[a], msg: `Заплановано ${opt.n} ${capWord(q)}, а дозвіл ${nm(st)} — до ${q.cap} (вже використано ${used})`, hint: "Зменште групу або запросіть вищий ліміт" });
          if (opt.weap && q.noWeap) out.errors.push({ k: "weap", st, at: P[Math.round((a + b) / 2)], km: S[a], t: T[a], msg: `Застосування зброї в небі ${nm(st)} заборонене умовами дозволу`, hint: "Приберіть бойові дії в зоні" });
          if ((opt.cls === "ballistic" || opt.cls === "hyper") && q.noBal) out.errors.push({ k: "bal", st, at: P[Math.round((a + b) / 2)], km: S[a], t: T[a], msg: `Балістика й гіперзвук заборонені умовами дозволу ${nm(st)}`, hint: "Оберіть крилату ракету або дрон" });
          if (q.until - T[b] < 15 && q.until - T[b] >= 0) out.warns.push({ k: "tight", st, at: P[b], km: S[b], msg: `Запас часу до кінця дозволу ${nm(st)} — лише ≈ ${Math.max(0, Math.round(q.until - T[b]))} хв` });
          if (q.notify) out.warns.push({ k: "notify", st, at: P[a], km: S[a], msg: `${nm(st)} буде повідомлена про вхід (умова дозволу)` });
        }
      }
      a = b + 1;
    }
    // частини маршруту для малювання: free / ok / warn / bad
    const grade = (z) => z.s.k === "free" ? "free" : z.s.k === "ok" ? "ok" : z.s.k === "edge" ? "warn" : "bad";
    let cur = null;
    for (let i = 0; i < C.length; i++){ const g = grade(C[i]); if (!cur || cur.k !== g){ cur = { k: g, pts: i ? [P[i - 1]] : [] }; out.parts.push(cur); } cur.pts.push(P[i]); }
    out.ok = !out.errors.length; return out;
  }

  /* авто-прокладання: A* по клітинках, де небо вільне або відкрите дозволом (з відступом від межі) */
  function airReroute(side, A, B, opt){
    opt = Object.assign({ op: "strike", start: D ? D.t : 0, dur: 120, margin: 2, F: null }, opt || {});
    const F = opt.F || FGRID(); if (!F || !D || !D.air) return null;
    const geo = airGeo(F), nx = F.nx, ny = F.ny, lim = {};
    permsAll(side).forEach(q => { if (!(COVERS[opOf(q)] || []).includes(opt.op)) return; if (q.until <= opt.start || (q.from == null ? q.t0 : q.from) >= opt.start + opt.dur) return; const ci = AIRST.indexOf(q.st) + 1, L = Math.max(0, limCells(q) - opt.margin); if (!(ci in lim) || L > lim[ci]) lim[ci] = L; });
    const okI = i => !F.blk[i] || (geo.cid[i] > 0 && geo.cid[i] in lim && geo.dist[i] <= lim[geo.cid[i]]);
    const cx = p => Math.floor((p[0] - F.lon0) / F.step), cy = p => Math.floor((p[1] - F.lat0) / F.step);
    const snap = p => { let x = cx(p), y = cy(p); if (x < 0 || y < 0 || x >= nx || y >= ny) return -1; if (okI(y * nx + x)) return y * nx + x; for (let r = 1; r <= 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++){ if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < nx && Y < ny && okI(Y * nx + X)) return Y * nx + X; } return -1; };
    const s = snap(A), e = snap(B); if (s < 0 || e < 0) return null;
    const ctr = i => [F.lon0 + ((i % nx) + 0.5) * F.step, F.lat0 + (((i / nx) | 0) + 0.5) * F.step];
    const bx0 = Math.max(0, Math.min(cx(A), cx(B)) - 60), bx1 = Math.min(nx - 1, Math.max(cx(A), cx(B)) + 60), by0 = Math.max(0, Math.min(cy(A), cy(B)) - 60), by1 = Math.min(ny - 1, Math.max(cy(A), cy(B)) + 60);
    const G = new Float32Array(nx * ny).fill(1e9), PAR = new Int32Array(nx * ny).fill(-1), DONE = new Uint8Array(nx * ny), H = [], eC = ctr(e);
    const hp = i => dkm(ctr(i), eC), push = (i, f) => { H.push([f, i]); let k = H.length - 1; while (k > 0){ const p = (k - 1) >> 1; if (H[p][0] <= H[k][0]) break; [H[p], H[k]] = [H[k], H[p]]; k = p; } };
    const pop = () => { const t = H[0], l = H.pop(); if (H.length){ H[0] = l; let k = 0; for (;;){ let a = 2 * k + 1, b = a + 1, m = k; if (a < H.length && H[a][0] < H[m][0]) m = a; if (b < H.length && H[b][0] < H[m][0]) m = b; if (m === k) break; [H[m], H[k]] = [H[k], H[m]]; k = m; } } return t; };
    G[s] = 0; push(s, hp(s)); let found = false, guard = 0;
    while (H.length && guard++ < 400000){
      const [, i] = pop(); if (DONE[i]) continue; DONE[i] = 1; if (i === e){ found = true; break; }
      const x = i % nx, y = (i / nx) | 0, ci = ctr(i);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){
        if (!dx && !dy) continue; const X = x + dx, Y = y + dy; if (X < bx0 || X > bx1 || Y < by0 || Y > by1) continue; const j = Y * nx + X; if (DONE[j] || !okI(j)) continue;
        if (dx && dy && (!okI(y * nx + X) || !okI(Y * nx + x))) continue;                       // без зрізання кутів чужої клітинки
        const g = G[i] + dkm(ci, ctr(j)); if (g < G[j]){ G[j] = g; PAR[j] = i; push(j, g + hp(j)); }
      }
    }
    if (!found) return null;
    const cells = []; for (let i = e; i >= 0; i = PAR[i]){ cells.push(i); if (i === s) break; } cells.reverse();
    const clear = (a, b) => { const A1 = ctr(a), B1 = ctr(b), n = Math.max(2, Math.ceil(dkm(A1, B1) / (AIR.CELL * 0.5))); for (let k = 0; k <= n; k++){ const px = A1[0] + (B1[0] - A1[0]) * k / n, py = A1[1] + (B1[1] - A1[1]) * k / n, X = Math.floor((px - F.lon0) / F.step), Y = Math.floor((py - F.lat0) / F.step); if (X < 0 || Y < 0 || X >= nx || Y >= ny || !okI(Y * nx + X)) return false; } return true; };
    const way = [cells[0]]; let a = 0; while (a < cells.length - 1){ let b = cells.length - 1; while (b > a + 1 && !clear(cells[a], cells[b])) b--; way.push(cells[b]); a = b; }
    return [A.slice()].concat(way.slice(1, -1).map(ctr), [B.slice()]);
  }

  /* ---- контури зон дозволів: клітинки країни в межах глибини → замкнені кільця [lon,lat] (для карти) ---- */
  const ZR = new Map();
  function airZoneRings(st, km, F){
    F = F || FGRID(); if (!F || !AIRST.includes(st)) return { rings: [], c: null, cells: 0 };
    const geo = airGeo(F), ci = AIRST.indexOf(st) + 1, L = km >= 9999 ? 1e4 : Math.round(km / AIR.CELL), key = st + ":" + L, hit = ZR.get(key); if (hit && hit.F === F) return hit.v;
    const nx = F.nx, ny = F.ny, W = nx + 1, inz = (ix, iy) => ix >= 0 && iy >= 0 && ix < nx && iy < ny && geo.cid[iy * nx + ix] === ci && geo.dist[iy * nx + ix] <= L;
    const nxt = new Map(); let cnt = 0, sx = 0, sy = 0; const cells = [];
    const addE = (ax, ay, bx, by) => { const k = ay * W + ax; let l = nxt.get(k); if (!l){ l = []; nxt.set(k, l); } l.push([bx, by]); };
    for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++){
      if (!inz(ix, iy)) continue; cnt++; sx += ix; sy += iy; cells.push(ix, iy);
      if (!inz(ix, iy - 1)) addE(ix, iy, ix + 1, iy);              // південна межа → на схід (інтер'єр зліва)
      if (!inz(ix + 1, iy)) addE(ix + 1, iy, ix + 1, iy + 1);      // східна → на північ
      if (!inz(ix, iy + 1)) addE(ix + 1, iy + 1, ix, iy + 1);      // північна → на захід
      if (!inz(ix - 1, iy)) addE(ix, iy + 1, ix, iy);              // західна → на південь
    }
    const rings = [];
    for (const [k0, l0] of nxt){
      while (l0.length){
        const e0 = l0.pop(), x0 = k0 % W, y0 = (k0 / W) | 0, ring = [[x0, y0]]; let cx = e0[0], cy = e0[1], dx = cx - x0, dy = cy - y0, guard = 0;
        while ((cx !== x0 || cy !== y0) && guard++ < 200000){
          ring.push([cx, cy]); const l = nxt.get(cy * W + cx); if (!l || !l.length) break;
          let bi = 0, bs = -9; for (let q = 0; q < l.length; q++){ const ex = l[q][0] - cx, ey = l[q][1] - cy, cr = dx * ey - dy * ex, sc = cr < 0 ? 3 : cr === 0 ? 2 : 1; if (sc > bs){ bs = sc; bi = q; } }
          const nx2 = l.splice(bi, 1)[0]; dx = nx2[0] - cx; dy = nx2[1] - cy; cx = nx2[0]; cy = nx2[1];
        }
        // прибрати колінеарні вершини
        const R2 = []; for (let i = 0; i < ring.length; i++){ const a = ring[(i + ring.length - 1) % ring.length], b = ring[i], c = ring[(i + 1) % ring.length]; if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) !== 0) R2.push([F.lon0 + b[0] * F.step, F.lat0 + b[1] * F.step]); }
        if (R2.length >= 3) rings.push(R2);
      }
    }
    let c = null; if (cnt){ const mx = sx / cnt, my = sy / cnt; let bd = 1e9; for (let i = 0; i < cells.length; i += 2){ const d = (cells[i] - mx) * (cells[i] - mx) + (cells[i + 1] - my) * (cells[i + 1] - my); if (d < bd){ bd = d; c = [F.lon0 + (cells[i] + 0.5) * F.step, F.lat0 + (cells[i + 1] + 0.5) * F.step]; } } }
    const v = { rings, c, cells: cnt }; ZR.set(key, { F, v }); if (ZR.size > 24) ZR.delete(ZR.keys().next().value); return v;
  }
  /* зони сторони для карти й інтерфейсу: діючі, заплановані й запити в розгляді */
  function airZones(side){
    if (!D || !D.air) return []; side = side || pov(); if (!side) return [];
    return D.air.perm.filter(q => q.sd === side && !q.dead && D.t < q.until).map(q => ({ id: q.id, st: q.st, op: opOf(q), purpose: q.purpose || "strike", from: q.from == null ? q.t0 : q.from, until: q.until, km: q.km, cap: q.cap, uses: opOf(q) === "msl" ? q.uses : Object.keys(q.ac || {}).length, noBal: !!q.noBal, noWeap: !!q.noWeap, notify: !!q.notify, cond: !!q.cond, on: winOn(q, D.t), left: q.until - D.t, dep: q.dep || 0, fee: q.fee || 0, viol: q.viol || 0 }));
  }
  const airReqs = side => D && D.air ? D.air.req.filter(q => q.from === (side || pov())).map(q => ({ id: q.id, st: q.to, scope: q.scope, km: SCP[q.scope].km, f: q.f, left: q.dec - D.t, start: q.f && !q.f.legacy ? q.f.start : q.t0, dur: q.f ? q.f.dur : SCP[q.scope].dur })) : [];

  /* ---- монітор польотів: літаки гравця над чужим небом (міст BV_DIPX.airUnits) ---- */
  const MON = new Map();
  function airIncursion(p, x, u, why){
    const cd = pk(p, x) + ":inc", cq = [], eff = (k, t, d) => cq.push({ k, t, d }); if (D.cd[cd] > D.t) return; D.cd[cd] = D.t + 15;
    const r0 = R(p, x); addR(p, x, -6); D.rep[p] = clamp(D.rep[p] - 4, -100, 100); addTrust(p, x, -8); D.air.inc[x] = (D.air.inc[x] || 0) + 1; D.air.stat[p].viol++; D.air.cool[pk(p, x)] = Math.max(D.air.cool[pk(p, x)] || 0, D.t + 120);
    eff("rel", `Відносини з ${nm(x)}`, Math.round(R(p, x) - r0)); eff("rep", "Ваша репутація", -4); eff("trust", `Довіра ${nm(x)} до виконання умов`, -8); eff("cool", `Новий запит до ${nm(x)} — не раніше ніж за 120 хв`, 0);
    for (const c of allies(x)) if (c !== p){ const b = R(c, p); addR(c, p, -2); eff("third", `Союзник ${nm(c)} гірше ставиться до вас`, Math.round(R(c, p) - b)); }
    log(`🚨 Порушення повітряного простору ${BY[x].f} ${nm(x)}: ${u.name} (${why}). Відносини −6, репутація −4`, "bad", [p, x], true);
    const rec = decRec({ p, x, out: "incursion", why, rs: [], cq, op: u.op }); airNotify(rec, `Порушення кордону ${nm(x)}: ${u.name}`); airTouch();
  }
  function airMonitor(){
    if (!D || !D.air || !active()) return; const X = XX(); if (!X || !X.airUnits) return; const F = FGRID(); if (!F) return;
    let list; try { list = X.airUnits(); } catch (e) { return; }
    const seen = new Set(), now = Date.now(), msg = (m, k) => { try { X.toast(m, k || "warn"); } catch (e) { /* */ } };
    for (const u of list){
      if (!u.pos || !isHuman(u.side)) continue; seen.add(u.id);
      const m = MON.get(u.id) || { in: null, g: 0, pen: false, w: 0 }; MON.set(u.id, m);
      const c = cellAt(F, u.pos); const key = c.free ? null : (c.st || "closed");
      if (key !== m.in){ if (m.in && m.q && !m.pen && m.in !== "closed") log(`✈ ${u.name} залишив небо ${nm(m.in)}`, "info", [u.side, m.in]); m.in = key; m.g = 0; m.pen = false; m.q = null; m.w = 0; if (!key){ continue; } }
      if (!key) continue;
      const s = airStatusAt(u.side, c, u.op, D.t), q = s.q; m.q = q && !isBad(s.k) ? q.id : null;
      if (!isBad(s.k)){
        if (q && !q.ac[u.id]){
          q.ac[u.id] = 1; const n = Object.keys(q.ac).length;
          if (q.notify) log(`📣 Повідомлення ${nm(q.st)}: ${u.name} входить у її небо`, "info", [u.side, q.st]);
          if (q.cap && opOf(q) !== "msl" && n > q.cap){ q.viol = 1; airEnd(q, "violation", `перевищено ліміт літаків (${q.cap}): ${u.name}`); continue; }
          airTouch();
        }
        if (q && q.noWeap && /Пуск|Скид|пуск|скид/.test(u.phase || "")){ q.viol = 1; airEnd(q, "violation", `${u.name}: застосування зброї в небі ${nm(q.st)}`); continue; }
        if (s.k === "edge" && now - m.w > 90000){ m.w = now; msg(`⚠ ${u.name}: наближення до межі зони неба ${nm(q.st)} (≈ ${Math.max(1, Math.round(s.mc * AIR.CELL))} км)`); }
        m.g = 0; continue;
      }
      const why = STATUS_TXT[s.k](c.st, s).replace(/^./, ch => ch.toLowerCase());
      if (!m.g){ m.g = now; msg(`⚠ ${u.name}: ${why}. Поверніться в дозволену зону`); }
      else if (!m.pen && D.air.enforce && now - m.g > AIR.GRACE * 1000){
        m.pen = true;
        if (c.st){ if (q && (s.k === "depth" || s.k === "late" || s.k === "early")){ q.viol = 1; airEnd(q, "violation", `${u.name}: ${why}`); } else airIncursion(u.side, c.st, u, why); }
      }
    }
    for (const id of MON.keys()) if (!seen.has(id)) MON.delete(id);
  }
  setInterval(() => { try { airMonitor(); } catch (e) { if (window.console) console.warn("[dip mon]", e); } }, 1000);
  /* ---- інтерфейс неба в дипломатії ---- */
  function gateChip(ok, label, val, lim, tip){ return `<span class="dp-gate ${ok ? "ok" : "no"}" title="${esc(tip || "")}"><i>${ok ? "✓" : "✕"}</i>${label}<b>${val}</b><small>${lim}</small></span>`; }
  const why2 = rs => rs.map(r => r[0] + " " + (r[1] > 0 ? "+" : "") + (Math.abs(r[1]) < 1 ? r[1].toFixed(2) : Math.round(r[1] * 100) / 100)).join(", ");
  const gateBlk = (p, x, e) => e.blk && (!e.gates.rel || !e.gates.cmp || !e.gates.rsk || stOf(p, x) === "war" || sancLvl(x, p) || !AIRST.includes(x)) ? e.blk : "";
  const ui = () => window.BV_AIRUI || null;
  function airBlock(p, x){
    const e = evalAir(p, x, "corr"), pms = permsAll(p).filter(q => q.st === x), rqs = D.air.req.filter(q => q.from === p && q.to === x), gb = gateBlk(p, x, e);
    let h = `<div class="dp-air"><div class="dp-sec sm">✈ Повітряний простір ${BY[x].f}</div><div class="dp-gates">`;
    h += gateChip(e.gates.rel, "Відносини", e.r, "≥ " + AIR.RELMIN, "Рівень відносин із країною");
    h += gateChip(e.gates.cmp, "Сумісність", pct(e.cm.v), "≥ " + pct(AIR.COMPMIN), why2(e.cm.rs.map(r => [r[0], Math.round(r[1] * 100)])) + " (пункти)");
    h += gateChip(e.gates.rsk, "Ризик", pct(e.rk.v), "≤ " + pct(AIR.RISKMAX), why2(e.rk.rs.map(r => [r[0], Math.round(r[1] * 100)])) + " (пункти ризику)");
    h += `</div>`;
    for (const pm of pms) h += `<div class="dp-note ok">${esc(OPS[opOf(pm)].s)}: ${pm.from > D.t ? "почнеться " + fmtT(pm.from) + " · до " + fmtT(pm.until) : "діє ще ≈ " + fmtDur(pm.until - D.t)} · ${esc(termsText(pm))}${pm.cap ? ` · ${opOf(pm) === "msl" ? pm.uses : Object.keys(pm.ac || {}).length}/${pm.cap}` : ""}</div>`;
    for (const rq of rqs) h += `<div class="dp-note">Запит${rq.f && !rq.f.legacy ? " (" + esc(OPS[rq.f.op].s.toLowerCase()) + ")" : ""} розглядається — рішення ≈ через ${fmtDur(rq.dec - D.t)} <button class="dp-b ghost sm" data-dp="aircx" data-v="${rq.id}">Скасувати</button></div>`;
    h += `<div class="dp-acts"><button class="dp-b gold ${gb ? "dis" : ""}" data-dp="airform" data-v="${x}" title="${esc(gb || "Форма запиту: мета, дата й час, строк, тип операції, умови")}">✈ Запит неба…<small>${gb ? "" : pct(e.p)}</small></button><button class="dp-b ghost sm" data-dp="airplan">🧭 Маршрут</button></div>${gb ? `<em class="dp-why">${esc(gb)}</em>` : ""}</div>`;
    return h;
  }
  function airOfferCard(q){
    const a = q.air, x = q.from, fee = a.t.fee, f = a.f;
    return `<div class="dp-card air"><div class="dp-ct">✈ ${BY[x].f} <b>${esc(nm(x))}</b> готова відкрити небо на умовах:</div><div class="dp-terms">${f && !f.legacy ? esc(OPS[f.op].n) + " · " + esc(PURP[f.purpose].n.toLowerCase()) + "<br>" : ""}${esc(termsText({ km: a.t.km, cap: a.t.cap, noBal: a.t.noBal, noWeap: a.t.noWeap, notify: a.t.notify, fee, dep: a.dep, op: f && f.op }))}<br>Термін: ${fmtDur(a.t.dur)}${f && !f.legacy ? " · початок " + fmtT(Math.max(D.t, f.start)) : ""}</div><div class="dp-note">Пропозиція діє ще ≈ ${Math.max(0, Math.ceil(q.exp - D.t))} хв. Порушення умов = відкликання, відносини −12, репутація −8${a.dep ? ", депозит втрачено" : ""}.</div><div class="dp-acts"><button class="dp-b gold" data-dp="ans" data-v="${q.id}" data-w="1">Прийняти${fee ? ` (−${fm(fee)} млн $)` : ""}</button><button class="dp-b ghost" data-dp="ans" data-v="${q.id}" data-w="0">Відхилити</button></div></div>`;
  }
  /* картка рішення: причина, чинники, наслідки (для відмови, порушення, відкликання, умовної пропозиції, схвалення) */
  const DEC_T = { deny: ["🚫", "Відмова", "bad"], late: ["⌛", "Вікно запиту минуло", "bad"], full: ["✅", "Небо відкрито", "good"], cond: ["📨", "Умовна пропозиція", "ask"], "cond-ok": ["✅", "Умови прийнято — небо відкрито", "good"], "cond-no": ["✖", "Умови відхилено", "bad"], viol: ["⚠", "Порушення умов дозволу", "bad"], revoked: ["⛔", "Дозвіл відкликано країною", "bad"], incursion: ["🚨", "Порушення повітряного простору", "bad"] };
  const CQ_I = { rel: "🤝", rep: "📉", trust: "🔒", cool: "⏳", third: "🌐", money: "💰", note: "ℹ", none: "ℹ" };
  function decHtml(r, compact){
    const t = DEC_T[r.out] || ["•", r.out, ""], f = r.f; let h = `<div class="dp-dec ${t[2]}"><div class="dp-dh"><span class="dp-di">${t[0]}</span><b>${t[1]}</b><span class="dp-dx">${BY[r.x].f} ${esc(nm(r.x))}</span><time>${fmtT(r.t)}</time></div>`;
    if (f && !f.legacy) h += `<div class="dp-dq">${esc(PURP[f.purpose].i)} ${esc(PURP[f.purpose].n)} · ${esc(OPS[f.op].s)} · ${fmtDur(f.dur)} з ${fmtT(f.start)}${Object.keys(f.conds).length ? " · " + Object.keys(f.conds).map(k => esc(CONDS[k].s)).join(", ") : ""}</div>`;
    if (r.why && r.out !== "full" && r.out !== "cond") h += `<div class="dp-dwhy"><span>Причина</span>${esc(r.why.replace(/^./, c => c.toUpperCase()))}</div>`;
    if (r.terms && (r.out === "full" || r.out === "cond" || r.out === "cond-ok")) h += `<div class="dp-dq">${esc(termsText({ km: r.terms.km, cap: r.terms.cap, noBal: r.terms.noBal, noWeap: r.terms.noWeap, notify: r.terms.notify, fee: r.out === "full" ? 0 : r.terms.fee, dep: r.terms.dep, op: r.op }))} · ${fmtDur(r.terms.dur)}</div>`;
    if (r.win) h += `<div class="dp-dq">Вікно дії: ${fmtT(r.win[0])} → ${fmtT(r.win[1])}</div>`;
    if (!compact && r.rs && r.rs.length) h += `<div class="dp-dsec">Що вплинуло на рішення</div><ul class="dp-rs">${r.rs.map(z => `<li class="${z[1] >= 0 ? "pos" : "neg"}"><span>${esc(z[0])}</span><b>${z[1] > 0 ? "+" : ""}${z[1]}</b></li>`).join("")}</ul>`;
    if (r.cq && r.cq.length){
      h += `<div class="dp-dsec">${r.out === "deny" || r.out === "late" || r.out === "cond-no" || r.out === "viol" || r.out === "revoked" || r.out === "incursion" ? "Дипломатичні наслідки" : "Наслідки"}</div><ul class="dp-cq">`;
      h += r.cq.map(z => `<li class="${z.d > 0 ? "pos" : z.d < 0 ? "neg" : ""}"><i>${CQ_I[z.k] || "•"}</i><span>${esc(z.t)}</span>${z.d ? `<b>${z.d > 0 ? "+" : ""}${z.k === "money" ? fm(z.d) + " млн $" : z.d}</b>` : ""}</li>`).join("") + `</ul>`;
    }
    return h + `</div>`;
  }
  const decsOf = p => D.air.dec.filter(z => z.p === p);
  const unreadAir = p => decsOf(p).filter(z => !z.read).length;
  const capUsed = q => opOf(q) === "msl" ? q.uses : Object.keys(q.ac || {}).length;
  function tabAir(p){
    const A = D.air, S = A.stat[p], pms = permsAll(p), rqs = A.req.filter(q => q.from === p), ofs = D.pend.filter(q => q.type === "airc" && q.to === p), dcs = decsOf(p).slice(-6).reverse();
    let h = `<div class="dp-acts"><button class="dp-b gold" data-dp="airform" data-v="">✈ Новий запит</button><button class="dp-b ghost" data-dp="airplan">🧭 Планувальник</button><button class="dp-b ghost" data-dp="airmap">🗺 Зони на мапі</button></div>`;
    h += `<div class="dp-sec">Дозволи</div>` + (pms.length ? pms.map(q => { const on = winOn(q, D.t), tot = Math.max(1, q.until - (q.from == null ? q.t0 : q.from)); return `<div class="dp-card air ${on ? "" : "wait"}"><div class="dp-ct">${BY[q.st].f} <b>${esc(nm(q.st))}</b> · ${esc(OPS[opOf(q)].s)} · ${q.cond ? "умовний" : "повний"}${on ? "" : ' · <i class="dp-t air w">очікує початку</i>'}</div><div class="dp-terms">${esc(termsText(q))}</div><div class="dp-bar2"><i style="width:${on ? clamp((q.until - D.t) / tot * 100, 0, 100) : 100}%"></i></div><div class="dp-note">${on ? `Залишилось ≈ ${fmtDur(q.until - D.t)}` : `Почнеться ${fmtT(q.from)}`} · до ${fmtT(q.until)}${q.cap ? ` · ${capWord(q)} ${capUsed(q)}/${q.cap}` : capUsed(q) ? ` · ${capWord(q)} ${capUsed(q)}` : ""}</div><div class="dp-acts"><button class="dp-b ghost sm" data-dp="airplan" data-v="${q.id}">🧭 Маршрут</button><button class="dp-b ghost sm" data-dp="airret" data-v="${q.id}">Повернути дозвіл</button></div></div>`; }).join("") : `<div class="dp-empty">Немає</div>`);
    h += `<div class="dp-sec">Запити й пропозиції</div>`;
    h += rqs.map(q => `<div class="dp-line"><span>${BY[q.to].f} ${esc(nm(q.to))} · ${esc(q.f && !q.f.legacy ? OPS[q.f.op].s.toLowerCase() + " · " + fmtDur(q.f.dur) : SCP[q.scope].n.toLowerCase())}</span><b>≈ ${fmtDur(q.dec - D.t)}</b><button class="dp-b ghost sm" data-dp="aircx" data-v="${q.id}">Скасувати</button></div>`).join("");
    h += ofs.map(airOfferCard).join(""); if (!rqs.length && !ofs.length) h += `<div class="dp-empty">Немає</div>`;
    h += `<div class="dp-sec">Рішення й наслідки${unreadAir(p) ? ` <span class="bd">${unreadAir(p)}</span>` : ""}</div>` + (dcs.length ? dcs.map(z => `<div class="dp-line dec ${z.read ? "" : "new"}"><span>${DEC_T[z.out] ? DEC_T[z.out][0] : "•"} ${BY[z.x].f} ${esc(nm(z.x))} · ${esc(DEC_T[z.out] ? DEC_T[z.out][1] : z.out)}${z.why && z.out !== "full" && z.out !== "cond" ? " — " + esc(z.why) : ""}</span><button class="dp-b ghost sm" data-dp="airdec" data-v="${z.id}">Деталі</button></div>`).join("") : `<div class="dp-empty">Рішень ще не було</div>`);
    h += `<div class="dp-sec">Кому можна написати</div>` + AIRST.filter(x => x !== p).map(x => { const e = evalAir(p, x, "corr"), gb = gateBlk(p, x, e); return `<div class="dp-line"><span>${BY[x].f} ${esc(nm(x))}</span><b class="${gb ? "bad" : "good"}" title="${esc(gb || "")}">${gb ? "недоступно" : "шанс ≈ " + pct(e.p)}</b><button class="dp-b ghost sm" data-dp="airform" data-v="${x}">Запит…</button></div>`; }).join("");
    h += `<div class="dp-sec">Моя історія</div><div class="dp-note">Схвалено: <b>${S.ok}</b> · умовно: <b>${S.cond}</b> · відмов: <b>${S.den}</b> · порушень: <b class="${S.viol ? "bad" : ""}">${S.viol}</b> · завершено штатно: <b>${S.exp}</b><br>Репутація: <b>${Math.round(D.rep[p])}</b></div>`;
    const tr = AIRST.map(x => [x, trustOf(p, x)]).filter(z => z[1]); if (tr.length) h += `<div class="dp-note">Довіра до виконання умов: ${tr.map(z => `${BY[z[0]].f} ${z[1] > 0 ? "+" : ""}${Math.round(z[1])}`).join(" · ")}</div>`;
    const hs = A.hist.filter(z => z.sd === p).slice(-5).reverse(); if (hs.length) h += hs.map(z => `<div class="dp-line"><span>${BY[z.st].f} ${esc(nm(z.st))} · ${z.op ? esc(OPS[z.op].s) + " · " : ""}${fmtT(z.t1)}</span><b class="${z.how === "violation" || z.how === "revoked" ? "bad" : "good"}">${({ expired: "завершено", limit: "ліміт", returned: "повернено", revoked: "відкликано", violation: "порушення" })[z.how] || z.how}</b></div>`).join("");
    h += `<div class="dp-sec">Контроль польотів</div><div class="dp-acts"><button class="dp-b ghost" data-dp="airenf">Штрафи за порушення кордону: ${A.enforce ? "увімкнено" : "вимкнено"}</button></div><div class="dp-note">Монітор стежить за вашими літаками над чужим небом: спершу попередження, а якщо літак лишається поза дозволом понад ${AIR.GRACE} с — порушення (відносини, репутація, довіра). Вимкнення лишає лише попередження.</div>`;
    h += `<div class="dp-note">Правила: запит можливий, коли <b>відносини ≥ ${AIR.RELMIN}</b>, <b>політична сумісність ≥ ${pct(AIR.COMPMIN)}</b> і <b>ризик ескалації ≤ ${pct(AIR.RISKMAX)}</b>. Дозвіл типу «${esc(OPS.msl.s)}» відкриває коридор для ваших ракет і дронів; дозволи авіаційних типів діють для літаків — їх перевіряє планувальник маршруту й монітор польотів. Відмови знижують відносини, порушення умов — відносини, репутацію й довіру.</div>`;
    return h;
  }

  /* ---------- інтерфейс ---------- */
  function relCol(v){ return v >= 60 ? "#3ddc84" : v >= 25 ? "#8bd96a" : v > -25 ? "#9aa4b2" : v > -60 ? "#ff9a3c" : "#ff4d4d"; }
  function relName(v){ return v >= 75 ? "Побратими" : v >= 50 ? "Друзі" : v >= 20 ? "Прихильні" : v > -20 ? "Нейтральні" : v > -50 ? "Напружені" : v > -80 ? "Ворожі" : "Смертельні вороги"; }
  function mountUi(){
    if ($("gmDip")) return;
    const el = document.createElement("div"); el.id = "gmDip"; el.className = "hud panel"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Дипломатія");
    document.body.appendChild(el);
    el.addEventListener("click", e => { const b = e.target.closest("[data-dp]"); if (!b) return; e.stopPropagation(); onClick(b.dataset.dp, b.dataset.v, b.dataset.w); });
    el.addEventListener("input", e => { if (e.target.id === "dpFilter"){ UI.filter = e.target.value; render(true, true); } });
  }
  function onClick(a, v, w){
    if (a === "close") return toggle(false);
    if (a === "tab"){ UI.tab = v; return render(true); }
    if (a === "sel"){ UI.sel = UI.sel === v ? null : v; return render(true); }
    if (a === "pov"){ UI.pov = v; UI.sel = null; return render(true); }
    if (a === "ans"){ return answerPend(+v, w === "1"); }
    if (a === "card"){ return answerCard(+v, +w); }
    if (a === "air") return airSend(v, w);                                   // старий швидкий запит (лише обсяг)
    if (a === "airform"){ const u = ui(); if (u && u.openForm) return u.openForm(v || null); return; }
    if (a === "airplan"){ const u = ui(); if (u && u.openPlan) return u.openPlan(v ? +v : null); return; }
    if (a === "airmap"){ const u = ui(); if (u && u.toggleMap) return u.toggleMap(); return; }
    if (a === "airdec"){ const u = ui(); if (u && u.openDec) return u.openDec(+v); return; }
    if (a === "airenf"){ D.air.enforce = !D.air.enforce; D.ver++; save(); return render(true); }
    if (a === "opencty"){ UI.tab = "c"; UI.sel = v; return render(true); }
    if (a === "aircx") return airCancelReq(+v);
    if (a === "airret") return airReturn(+v);
    if (a === "reset"){ if (!UI.rs){ UI.rs = true; render(true); setTimeout(() => { UI.rs = false; render(true); }, 4000); return; } UI.rs = false; try { localStorage.removeItem(SK()); } catch (e) { /* */ } fresh(); D.st[key("ua", "ru")] = { s: "war", since: 0 }; save(true); render(true); return; }
    if (a === "ai"){ D.ai = !D.ai; save(); return render(true); }
    playerAct(a, v);
  }
  function toggle(on){
    const el = $("gmDip"); if (!el) return; UI.open = on == null ? !UI.open : on; el.classList.toggle("on", UI.open);
    if (UI.open){ ["gmStat", "gmFree", "gmChat"].forEach(i => { const o = $(i); o && o.classList.remove("on"); }); render(true); } try { window.dispatchEvent(new Event("bv-dip-change")); } catch (e) { /* */ }
  }
  const badge = () => !D || !active() ? 0 : D.pend.length + D.cards.length;
  function tagsFor(p, x){
    const t = [], s = stOf(p, x);
    if (s === "war") t.push(`<i class="dp-t war">війна</i>`); else if (s === "truce") t.push(`<i class="dp-t good">перемир'я</i>`);
    if (hasT(p, x, "alliance")) t.push(`<i class="dp-t al">союз</i>`); if (hasT(p, x, "military")) t.push(`<i class="dp-t mil">військ. договір</i>`); if (hasT(p, x, "trade")) t.push(`<i class="dp-t tr">торгівля</i>`);
    if (D.air && permFor(p, x)) t.push(`<i class="dp-t air">✈ небо відкрито</i>`); else if (D.air && reqFor(p, x)) t.push(`<i class="dp-t air w">✈ запит</i>`);
    const a = sancLvl(p, x), b = sancLvl(x, p); if (a) t.push(`<i class="dp-t sc">ваші санкції ${a}</i>`); if (b) t.push(`<i class="dp-t sc">санкції проти вас ${b}</i>`);
    return t.join("");
  }
  function relBar(v){ const w = Math.abs(v) / 2; return `<span class="dp-bar"><i class="m"></i><i class="f" style="${v >= 0 ? `left:50%;width:${w}%` : `right:50%;width:${w}%`};background:${relCol(v)}"></i></span>`; }
  function actBtn(act, id, label, e, extra){
    const dis = e && e.blk, cls = dis ? "dis" : "", tip = dis ? e.blk : e && e.rs ? "Шанс згоди " + Math.round(e.p * 100) + "%: " + e.rs.map(r => r[0] + " " + (r[1] > 0 ? "+" : "") + r[1]).join(", ") : "";
    const pct = e && !e.blk && e.p != null ? `<small>${Math.round(e.p * 100)}%</small>` : "";
    return `<button class="dp-b ${cls} ${extra || ""}" data-dp="${act}" data-v="${id}" title="${esc(tip)}" ${dis ? "aria-disabled=true" : ""}>${label}${pct}</button>${dis ? `<em class="dp-why">${esc(e.blk)}</em>` : ""}`;
  }
  function detail(p, x){
    const s = stOf(p, x), r = Math.round(R(p, x)), S = BY[x]; let h = `<div class="dp-det">`;
    h += `<div class="dp-meta">Міць ${S.pow}/10 · Економіка ${S.eco}/10 · Репутація ${Math.round(D.rep[x])}${allies(x).length ? " · союзники: " + allies(x).slice(0, 5).map(i => BY[i].f).join(" ") : ""}</div>`;
    const mainFoe = MAIN.includes(x) && MAIN.includes(p);
    const tail = [];
    if (s === "war"){
      h += `<div class="dp-acts">` + actBtn("truce", x, "🕊 Перемир'я", evalP(p, x, "truce")) + actBtn("peace", x, "☮ Мирна угода", evalP(p, x, "peace")) + `</div>`;
    } else if (s === "truce"){
      const rc = stRec(p, x); h += `<div class="dp-note">Перемир'я діє ще ≈ ${Math.max(0, Math.ceil(rc.until - D.t))} хв гри. Пуски заборонені.</div><div class="dp-acts">` + actBtn("peace", x, "☮ Мирна угода", evalP(p, x, "peace")) + `</div>`;
    } else {
      h += `<div class="dp-acts">` + actBtn("improve", x, "🤝 Місія (−2 млн $)", null) + actBtn("trade", x, "💱 Торгівля", evalP(p, x, "trade")) + actBtn("military", x, "🛡 Військ. договір", evalP(p, x, "military")) + actBtn("alliance", x, "⭐ Союз", evalP(p, x, "alliance")) + `</div>`;
      h += `<div class="dp-acts">` + (sancLvl(p, x) ? actBtn("unsanc", x, "Зняти санкції", null) : "") + (sancLvl(p, x) < 3 ? actBtn("sanc", x, sancLvl(p, x) ? `Посилити санкції (${sancLvl(p, x)}→${sancLvl(p, x) + 1})` : "⛔ Санкції", null) : "") + actBtn("war", x, "⚔ Оголосити війну", null, "danger") + `</div>`;
    }
    if (AIRST.includes(x) && s !== "war") h += airBlock(p, x);
    const mine = D.tr.filter(t => (t.a === p && t.b === x) || (t.a === x && t.b === p));
    if (mine.length && s !== "war") h += `<div class="dp-acts">` + mine.map(t => `<button class="dp-b ghost" data-dp="cancel" data-v="${t.id}">Розірвати: ${TT[t.type].toLowerCase()}</button>`).join("") + `</div>`;
    return h + `</div>`;
  }
  function tabCountries(p){
    const f = UI.filter.trim().toLowerCase();
    const list = IDS.filter(x => x !== p && (!f || nm(x).toLowerCase().includes(f))).sort((a, b) => R(p, b) - R(p, a));
    let h = `<input id="dpFilter" class="dp-in" placeholder="Пошук країни…" value="${esc(UI.filter)}" autocomplete="off">`;
    h += `<div class="dp-list">`;
    for (const x of list){
      const r = Math.round(R(p, x)), open = UI.sel === x;
      h += `<div class="dp-row ${open ? "open" : ""}"><button class="dp-hd" data-dp="sel" data-v="${x}"><span class="dp-f">${BY[x].f}</span><span class="dp-n"><b>${esc(nm(x))}</b><small>${relName(r)}</small></span>${relBar(r)}<span class="dp-v" style="color:${relCol(r)}">${r > 0 ? "+" : ""}${r}</span></button><div class="dp-tags">${tagsFor(p, x)}</div>${open ? detail(p, x) : ""}</div>`;
    }
    return h + `</div>`;
  }
  function tabTreaties(p){
    let h = ""; const mine = D.tr.filter(t => t.a === p || t.b === p), sc1 = D.sc.filter(s => s.from === p), sc2 = D.sc.filter(s => s.to === p), wars = enemies(p), tr = stOf("ua", "ru") === "truce" && (p === "ua" || p === "ru");
    h += `<div class="dp-sec">Союзи й договори</div>` + (mine.length ? mine.map(t => { const o = t.a === p ? t.b : t.a; return `<div class="dp-line"><span>${BY[o].f} ${esc(nm(o))}</span><b>${TT[t.type]}</b><button class="dp-b ghost sm" data-dp="cancel" data-v="${t.id}">Розірвати</button></div>`; }).join("") : `<div class="dp-empty">Немає</div>`);
    h += `<div class="dp-sec">Ваші санкції</div>` + (sc1.length ? sc1.map(s => `<div class="dp-line"><span>${BY[s.to].f} ${esc(nm(s.to))}</span><b>рівень ${s.lvl}</b><button class="dp-b ghost sm" data-dp="unsanc" data-v="${s.to}">Зняти</button></div>`).join("") : `<div class="dp-empty">Немає</div>`);
    h += `<div class="dp-sec">Санкції проти вас</div>` + (sc2.length ? sc2.map(s => `<div class="dp-line"><span>${BY[s.from].f} ${esc(nm(s.from))}</span><b>рівень ${s.lvl}</b></div>`).join("") : `<div class="dp-empty">Немає</div>`);
    h += `<div class="dp-sec">Війни${tr ? " · перемир'я" : ""}</div>` + (wars.length ? wars.map(e => `<div class="dp-line"><span>${BY[e].f} ${esc(nm(e))}</span><b class="bad">війна</b></div>`).join("") : (tr ? `<div class="dp-line"><span>🇺🇦 / 🇷🇺</span><b class="good">перемир'я</b></div>` : `<div class="dp-empty">Немає</div>`));
    const k = incK(p); h += `<div class="dp-sec">Вплив на економіку</div><div class="dp-note">Множник доходу від дипломатії: <b style="color:${k >= 1 ? "#3ddc84" : "#ff7a6b"}">×${k.toFixed(2).replace(".", ",")}</b>. Торгівля збільшує дохід, санкції й війни зменшують; союзники періодично надсилають допомогу (гроші, боєприпаси, техніка).</div>`;
    return h;
  }
  function tabEvents(p){
    let h = "";
    if (D.pend.length || D.cards.length) h += `<div class="dp-sec">Потребують рішення</div>`;
    for (const q of D.pend){ if (q.type === "airc") h += airOfferCard(q); else h += `<div class="dp-card"><div class="dp-ct">${BY[q.from].f} <b>${esc(nm(q.from))}</b>: ${q.type === "truce" ? "пропонує перемир'я" : q.type === "peace" ? "пропонує мирну угоду" : "пропонує " + TT[q.type].toLowerCase()}</div><div class="dp-note">Діє ще ≈ ${Math.max(0, Math.ceil(q.exp - D.t))} хв</div><div class="dp-acts"><button class="dp-b gold" data-dp="ans" data-v="${q.id}" data-w="1">Прийняти</button><button class="dp-b ghost" data-dp="ans" data-v="${q.id}" data-w="0">Відхилити</button></div></div>`; }
    for (const c of D.cards){ const e = EV.find(z => z.id === c.ev); if (!e) continue; h += `<div class="dp-card"><div class="dp-ct">${BY[c.x].f} ${esc(e.t(c.pov, c.x))}</div><div class="dp-note">Рішення потрібне ще ≈ ${Math.max(0, Math.ceil(c.exp - D.t))} хв</div><div class="dp-acts">${e.o.map((o, i) => `<button class="dp-b ${i ? "ghost" : "gold"}" data-dp="card" data-v="${c.id}" data-w="${i}">${esc(o[0])}</button>`).join("")}</div></div>`; }
    h += `<div class="dp-sec">Журнал</div>`;
    const L = D.log.filter(l => !l.ids.length || l.ids.includes(p) || l.k === "war" || l.k === "sys" || l.ids.some(i => !MAIN.includes(i))).slice(-40).reverse();
    h += L.map(l => `<div class="dp-log ${l.k}"><time>${fmtT(l.t)}</time><span>${esc(l.x)}</span></div>`).join("") || `<div class="dp-empty">Подій ще немає</div>`;
    return h;
  }
  const fmtT = t => { const d = Math.floor(t / 1440) + 1, m = Math.floor(t % 1440); return `Д${d} ${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
  function tabWorld(){
    const blocs = [], seen = new Set();
    for (const id of IDS){ if (seen.has(id)) continue; const comp = [id]; seen.add(id); for (let i = 0; i < comp.length; i++) for (const a of allies(comp[i])) if (!seen.has(a)){ seen.add(a); comp.push(a); } if (comp.length > 1) blocs.push(comp); }
    let h = `<div class="dp-sec">Блоки (за союзами)</div>` + (blocs.length ? blocs.map(b => `<div class="dp-line"><span>${b.map(i => BY[i].f).join(" ")}</span><b>${b.length} держав</b></div>`).join("") : `<div class="dp-empty">Союзів немає</div>`);
    const wars = []; for (const k in D.st){ const [a, b] = k.split("|"); const s = stOf(a, b); if (s !== "peace") wars.push([a, b, s]); }
    h += `<div class="dp-sec">Конфлікти світу</div>` + (wars.length ? wars.map(([a, b, s]) => `<div class="dp-line"><span>${BY[a].f} ${esc(nm(a))} — ${BY[b].f} ${esc(nm(b))}</span><b class="${s === "war" ? "bad" : "good"}">${s === "war" ? "війна" : "перемир'я"}</b></div>`).join("") : `<div class="dp-empty">Немає</div>`);
    h += `<div class="dp-sec">Санкції у світі</div>` + (D.sc.length ? D.sc.slice(0, 18).map(s => `<div class="dp-line"><span>${BY[s.from].f} → ${BY[s.to].f} ${esc(nm(s.to))}</span><b>рівень ${s.lvl}</b></div>`).join("") : `<div class="dp-empty">Немає</div>`);
    h += `<div class="dp-sec">Керування</div><div class="dp-acts"><button class="dp-b ghost" data-dp="ai">ІІ держав: ${D.ai ? "увімкнено" : "вимкнено"}</button><button class="dp-b ghost danger" data-dp="reset">${UI.rs ? "Підтвердити скидання" : "Скинути світ"}</button></div><div class="dp-note">Світ автоматично зберігається й діє в усіх наступних боях цього профілю.</div>`;
    return h;
  }
  function render(force, keepFocus){
    const el = $("gmDip"); if (!el || !D || !UI.open) return;
    const p = pov(); if (!p){ el.innerHTML = `<div class="hd"><span>Дипломатія</span><button class="lp-x" data-dp="close">×</button></div><div class="dp-note" style="padding:12px">Дипломатія недоступна в цьому режимі.</div>`; return; }
    const sig = [D.ver, UI.tab, UI.sel, UI.rs, p, Math.floor(D.t / 5), UI.filter].join("|"); if (!force && sig === UI.sig) return; UI.sig = sig;
    const body = el.querySelector(".dp-body"), sc = body ? body.scrollTop : 0, hadFocus = document.activeElement && document.activeElement.id === "dpFilter";
    const hs = humanSides(); const tabs = [["c", "Країни"], ["t", "Договори"], ["a", "Небо" + (permsOf(p).length ? ` <span class="bd ok">${permsOf(p).length}</span>` : "")], ["e", "Події" + (badge() ? ` <span class="bd">${badge()}</span>` : "")], ["w", "Світ"]];
    let h = `<div class="hd"><span>Дипломатія · ${BY[p].f} ${esc(nm(p))}</span><button class="lp-x" data-dp="close" aria-label="Закрити">×</button></div>`;
    if (hs.length > 1) h += `<div class="dp-pov">${hs.map(s => `<button class="dp-b ${s === p ? "gold" : "ghost"} sm" data-dp="pov" data-v="${s}">${BY[s].f} ${esc(nm(s))}</button>`).join("")}</div>`;
    h += `<div class="dp-tabs">${tabs.map(([k, n]) => `<button class="${UI.tab === k ? "on" : ""}" data-dp="tab" data-v="${k}">${n}</button>`).join("")}</div><div class="dp-body">`;
    h += UI.tab === "c" ? tabCountries(p) : UI.tab === "t" ? tabTreaties(p) : UI.tab === "a" ? tabAir(p) : UI.tab === "e" ? tabEvents(p) : tabWorld();
    h += `</div>`; el.innerHTML = h;
    const nb = el.querySelector(".dp-body"); if (nb) nb.scrollTop = sc;
    if (hadFocus || keepFocus){ const i = $("dpFilter"); if (i){ i.focus(); const l = i.value.length; try { i.setSelectionRange(l, l); } catch (e) { /* */ } } }
  }
  (window.BV_PERF ? BV_PERF.ui : (f, m) => setInterval(f, m))(() => { if (UI.open && D && active()) render(); }, 700);
  document.addEventListener("click", e => { const b = e.target.closest && e.target.closest("[data-dip]"); if (!b) return; e.stopPropagation(); if (!D) start(); mountUi(); toggle(); }, true);
  window.addEventListener("beforeunload", () => { if (D) save(true); });

  /* ---------- публічне API ---------- */
  window.BV_DIP = {
    start, over, step, incK, truceOn, airGrid, airUse,
    /* етап 7.75 (sea:ext): вузький API для морських інцидентів — відносини, репутація, санкції, журнал; див. 176_naval.js */
    ext: {
      ok: () => !!(D && active() && pov()), side: () => pov(), now: () => D ? D.t : 0, truce: () => truceOn(), ai: () => !!(D && D.ai),
      ids: () => IDS.slice(), nm, flag: x => BY[x] ? BY[x].f : "🏳", has: x => !!BY[x], info: x => BY[x] ? { pow: BY[x].pow, eco: BY[x].eco } : null,
      rel: (a, b) => D ? R(a, b) : 0, addR: (a, b, d) => { if (D && BY[a] && BY[b] && a !== b) addR(a, b, d); },
      rep: x => D && D.rep[x] != null ? D.rep[x] : 0, addRep: (x, d) => { if (D && BY[x]){ D.rep[x] = clamp((D.rep[x] || 0) + d, -100, 100); D.ver++; dirty = true; } },
      allies: x => D ? allies(x) : [], partners: (x, t) => D ? partners(x, t).map(p => p.id) : [], stOf: (a, b) => D ? stOf(a, b) : "peace",
      sanc: (f, t) => D ? sancLvl(f, t) : 0, sanction: (f, t, l) => { if (D && BY[f] && BY[t] && f !== t && !MAIN.includes(f)) sanction(f, t, l); },
      log: (x, k, ids, ntf) => { if (D) log(x, k, ids, ntf); }, bump: () => { if (D){ D.ver++; dirty = true; } }, fmtT, key: SK
    },
    /* етап 7.74: інтерфейс неба (форма запиту, планувальник, карта) — див. 175_airspace_ui.js */
    air: {
      AIRST, AIR, PURP, OPS, CONDS, COVERS, SCP, STATUS_TXT,
      ok: () => !!(active() && D && pov()), side: () => pov(), now: () => D.t, nm, flag: x => BY[x].f, fmtT, fmtDur, pct, esc, termsText, capWord,
      form: f => airForm(pov(), f, false),
      eval: (x, f) => { const p = pov(), ff = airForm(p, f, false), e = evalAir(p, x, ff); e.wait = waitRange(p, x, e); e.blkGate = gateBlk(p, x, e); return e; },
      send: (x, f) => airSend(x, airForm(pov(), f, false)),
      cancel: id => airCancelReq(id), ret: id => airReturn(id),
      zones: side => airZones(side), reqs: side => airReqs(side), rings: (st, km) => airZoneRings(st, km),
      check: (pts, opt) => airCheckRoute(pov(), pts, opt), reroute: (A, B, opt) => airReroute(pov(), A, B, opt),
      status: (pos, op, t) => { const F = FGRID(); if (!F) return { k: "free" }; const c = cellAt(F, pos), s = airStatusAt(pov(), c, op, t == null ? D.t : t); return Object.assign({ st: c.st || null, bad: isBad(s.k) }, s, { q: s.q ? s.q.id : 0 }); },
      geo: () => FGRID(),
      perms: () => permsAll(pov()), decs: () => decsOf(pov()), dec: id => D.air.dec.find(z => z.id === id) || null,
      decHtml: (id, compact) => { const r = D.air.dec.find(z => z.id === id); return r ? decHtml(r, compact) : ""; },
      markRead: id => { const r = D.air.dec.find(z => z.id === id); if (r && !r.read){ r.read = true; D.ver++; dirty = true; } },
      unread: () => D && pov() ? unreadAir(pov()) : 0, enforce: () => !!(D && D.air.enforce), ver: () => D && D.air ? D.air.ver : 0,
      relEvalText: (e) => why2(e.rs || [])
    },
    available: () => active() && !!D, sig: () => D ? [badge(), UI.open ? 1 : 0, stOf("ua", "ru"), D.air.ver].join(":") : "", humanSide: () => pov(), badge, isOpen: () => UI.open, toggle,
    /* для тестів і налагодження */
    _: { get D(){ return D; }, ST, IDS, R, setR, addR, stOf, hasT, sancLvl, allies, enemies, evalP, sign, cancel, sanction, lift, declareWar, endWar, aiAct, tick, aid, propose, answerPend, answerCard, playerAct, maybeEvent, threat, ww, load, fresh, save, SK, UI, EV, render, mountUi, accepted, AIR, AIRST, AIRPOLY, PURP, OPS, CONDS, airForm, airCheckRoute, airReroute, airZoneRings, airMonitor, airStatusAt, airGeo, evalAir, airSend, airResolve, airTick, airGeo, airRisk, airCompat, permsOf, permFor, airEnd, airAnswer }
  };
})();
