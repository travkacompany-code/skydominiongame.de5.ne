/* SKYDOMINION · 175 · повітряний простір — інтерфейс (етап 7.74)
   • Форма запиту: країна · мета · дата й час початку · строк · тип авіаційної операції · обсяг · додаткові умови (гарантії, ліміт, депозит),
     з живою оцінкою трьох умов, шансу згоди й очікування рішення.
   • Планувальник маршруту: точки по кліку на мапі (їх можна перетягувати), живий звіт про відповідність дозволам, попередження про вихід
     за межі зони / часу / ліміту / заборон, авто-обхід через дозволені зони, перехід до запиту на небо.
   • Мапа: діючі, заплановані й розглядувані дозволи малюються умовними зонами (шар підписується мітками).
   • Картка рішення: причина, чинники й дипломатичні наслідки (відмова, порушення, відкликання, умовна пропозиція, схвалення).
   Усе читає/пише через BV_DIP.air (173_diplomacy.js) і мапу з BV_DND_HOST.S7. Без дипломатії/мапи модуль нічого не робить. */
(function boot() {
  "use strict";
  if (window.BV_AIRUI) return;
  const A = () => (window.BV_DIP && window.BV_DIP.air) || null;
  const HOST = () => window.BV_DND_HOST || null;
  const mp = () => (HOST() && HOST().S7 ? HOST().S7.map : null);
  const GL = () => (HOST() && HOST().S7 ? HOST().S7.gl : null) || window.maplibregl || null;
  if (!A() || !HOST() || !mp() || !GL()) return setTimeout(boot, 400);

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const toast = (m, k) => { try { HOST().toast(m, k || "info"); } catch (e) { /* */ } };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dkm = (a, b) => { const kx = 111.32 * Math.cos((a[1] + b[1]) / 2 * Math.PI / 180); return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 110.574); };
  const hhmm = t => { const m = Math.floor(((t % 1440) + 1440) % 1440); return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); };
  const dayOf = t => Math.floor(t / 1440) + 1;
  const toT = (day, hm) => { const p = String(hm || "00:00").split(":").map(Number); return (Math.max(1, Math.round(+day) || 1) - 1) * 1440 + (p[0] || 0) * 60 + (p[1] || 0); };
  const roundUp5 = t => Math.ceil(t / 5) * 5;
  const el = (tag, id, cls) => { const e = document.createElement(tag); if (id) e.id = id; if (cls) e.className = cls; return e; };
  const svgPlane = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"><path d="M10 2.5v15M10 6 3 11.5v1.6L10 11l7 2.1v-1.6L10 6zM7.6 16.6 10 15.4l2.4 1.2"/></svg>';

  const S = { form: null, plan: null, mapOn: true, decId: 0, showAll: false };

  /* ======================================================================================================
     Форма запиту
     ====================================================================================================== */
  const chip = (ok, l, v, lim, tip) => `<span class="dp-gate ${ok ? "ok" : "no"}" title="${esc(tip || "")}"><i>${ok ? "✓" : "✕"}</i>${l}<b>${v}</b><small>${lim}</small></span>`;
  const ptsList = (rs, mul) => rs.map(r => { const d = Math.round(r[1] * (mul || 1) * 10) / 10; return `<li class="${d >= 0 ? "pos" : "neg"}"><span>${esc(r[0])}</span><b>${d > 0 ? "+" : ""}${d}</b></li>`; }).join("");

  function firstAvail() {
    const a = A();
    for (const x of a.AIRST) { const e = a.eval(x, { scope: "corr", purpose: "strike", op: "msl" }); if (!e.blk) return x; }
    return a.AIRST[0];
  }
  function newForm(x, op) {
    const a = A(), t = a.now(), f = { x: x || firstAvail(), purpose: "strike", op: "msl", scope: "corr", start: roundUp5(t + 15), dur: 180, conds: {}, cap: 0, dep: 0 };
    if (op && a.OPS[op]) { f.op = op; f.purpose = op === "msl" || op === "strike" ? "strike" : op === "cap" ? "patrol" : op === "recon" ? "recon" : "transit"; }
    return f;
  }
  function mountForm() {
    let w = $("airForm"); if (w) return w;
    w = el("div", "airForm", "af-wrap"); w.setAttribute("role", "dialog"); w.setAttribute("aria-label", "Запит повітряного простору"); w.hidden = true;
    document.body.appendChild(w);
    w.addEventListener("click", e => {
      if (e.target === w) return closeForm();
      const b = e.target.closest("[data-af]"); if (!b) return; e.stopPropagation(); formAct(b.dataset.af, b.dataset.v);
    });
    w.addEventListener("input", e => {
      const f = S.form, t = e.target; if (!f || !t.dataset.afi) return;
      const k = t.dataset.afi;
      if (k === "day" || k === "time") { f.start = toT($("afDay").value, $("afTime").value); }
      else if (k === "dur") { f.dur = +t.value; }
      else if (k === "cap") { f.cap = Math.max(0, Math.round(+t.value || 0)); }
      else if (k === "dep") { f.dep = Math.max(0, +t.value || 0); }
      else if (k === "cond") { if (t.checked) f.conds[t.dataset.k] = 1; else delete f.conds[t.dataset.k]; }
      liveForm(true);
    });
    return w;
  }
  function openForm(x, op) {
    const a = A(); if (!a || !a.ok()) return toast("Дипломатія недоступна в цьому режимі", "warn");
    S.form = newForm(x, op); const w = mountForm(); w.hidden = false; document.body.classList.add("af-open"); renderForm();
  }
  function closeForm() { const w = $("airForm"); if (w) w.hidden = true; S.form = null; document.body.classList.remove("af-open"); }
  function formAct(k, v) {
    const a = A(), f = S.form; if (!f) return;
    if (k === "close") return closeForm();
    if (k === "x") f.x = v;
    else if (k === "purpose") { f.purpose = v; if (!a.PURP[v].ops.includes(f.op)) f.op = a.PURP[v].ops[0]; for (const c in f.conds) if (!a.CONDS[c].ok(f.op)) delete f.conds[c]; }
    else if (k === "op") { f.op = v; for (const c in f.conds) if (!a.CONDS[c].ok(f.op)) delete f.conds[c]; }
    else if (k === "scope") { f.scope = v; f.dur = Math.min(f.dur, a.SCP[v].dur * 2); }
    else if (k === "startp") f.start = roundUp5(a.now() + (+v));
    else if (k === "durp") f.dur = +v;
    else if (k === "send") {
      const e = a.eval(f.x, f); if (e.blk) return toast(e.blk, "warn");
      const rq = a.send(f.x, f); if (rq) closeForm();
      return;
    } else if (k === "plan") { const x = f.x; closeForm(); return openPlan(null, { st: x }); }
    return renderForm();
  }
  function renderForm() {
    const a = A(), f = S.form, w = $("airForm"); if (!a || !f || !w) return;
    const e0 = a.eval(f.x, f), ff = e0.f, side = a.side();
    const P = a.PURP, O = a.OPS;
    let h = `<div class="af-box"><div class="af-hd"><b>✈ Запит повітряного простору</b><button class="af-x" data-af="close" aria-label="Закрити">×</button></div><div class="af-body">`;
    // 1. країна
    h += `<div class="af-sec">1 · Країна</div><div class="af-ctry">` + a.AIRST.map(x => {
      const e = a.eval(x, f), bad = !!e.blkGate;
      return `<button class="af-c ${x === f.x ? "on" : ""} ${bad ? "no" : ""}" data-af="x" data-v="${x}" title="${esc(e.blk || "Шанс згоди ≈ " + a.pct(e.p))}"><span class="af-fl">${a.flag(x)}</span><b>${esc(a.nm(x))}</b><small>${bad ? "недоступно" : "≈ " + a.pct(e.p)}</small></button>`;
    }).join("") + `</div>`;
    // 2. мета
    h += `<div class="af-sec">2 · Мета використання</div><div class="af-purp">` + Object.keys(P).map(k => `<button class="af-p ${k === f.purpose ? "on" : ""}" data-af="purpose" data-v="${k}"><span>${P[k].i}</span><b>${esc(P[k].n)}</b><small>${esc(P[k].d)}</small></button>`).join("") + `</div>`;
    // 3. тип операції
    h += `<div class="af-sec">3 · Тип авіаційної операції</div><div class="af-ops">` + P[f.purpose].ops.map(k => `<button class="af-o ${k === f.op ? "on" : ""}" data-af="op" data-v="${k}"><b>${esc(O[k].n)}</b><small>${esc(O[k].d)}${O[k].av ? " · планувальник + монітор польотів" : ""}</small></button>`).join("") + `</div>`;
    // 4. обсяг
    h += `<div class="af-sec">4 · Обсяг</div><div class="af-scope">` + Object.keys(a.SCP).map(k => `<button class="af-o ${k === f.scope ? "on" : ""}" data-af="scope" data-v="${k}"><b>${esc(a.SCP[k].n)}</b><small>${esc(a.SCP[k].d)}${a.SCP[k].risk ? " · ризик +" + Math.round(a.SCP[k].risk * 100) + " п. п." : ""}</small></button>`).join("") + `</div>`;
    // 5. дата, час і строк
    const t0 = a.now(), st = ff.start;
    h += `<div class="af-sec">5 · Дата й час початку</div><div class="af-time"><label>День<input id="afDay" data-afi="day" type="number" min="1" step="1" value="${dayOf(f.start)}"></label><label>Час<input id="afTime" data-afi="time" type="time" step="300" value="${hhmm(f.start)}"></label>`
      + `<div class="af-chips">` + [[5, "+5 хв"], [30, "+30 хв"], [60, "+1 год"], [180, "+3 год"], [360, "+6 год"]].map(z => `<button data-af="startp" data-v="${z[0]}">${z[1]}</button>`).join("") + `</div></div>`
      + `<div class="af-note" id="afStart"></div>`;
    h += `<div class="af-sec">Термін дії <b id="afDurV"></b></div><input class="af-range" data-afi="dur" type="range" min="30" max="720" step="10" value="${f.dur}"><div class="af-chips">` + [[60, "1 год"], [180, "3 год"], [360, "6 год"], [720, "12 год"]].map(z => `<button data-af="durp" data-v="${z[0]}">${z[1]}</button>`).join("") + `</div><div class="af-note" id="afWin"></div>`;
    // 6. додаткові умови
    const cs = Object.keys(a.CONDS).filter(k => a.CONDS[k].ok(f.op));
    h += `<div class="af-sec">6 · Додаткові умови (ваші гарантії)</div><div class="af-conds">` + cs.map(k => `<label class="af-ck"><input type="checkbox" data-afi="cond" data-k="${k}" ${f.conds[k] ? "checked" : ""}><span><b>${esc(a.CONDS[k].n)}</b><small>ризик ${Math.round(a.CONDS[k].risk * 100)} п. п. · шанс +${a.CONDS[k].acc} · стає обов'язковою умовою дозволу</small></span></label>`).join("")
      + `<div class="af-row"><label>Ліміт ${f.op === "msl" ? "пусків" : "літаків"} <input data-afi="cap" type="number" min="0" max="40" step="1" value="${f.cap || ""}" placeholder="без ліміту"></label><label>Депозит, млн $<input data-afi="dep" type="number" min="0" max="30" step="0.5" value="${f.dep || ""}" placeholder="0"></label></div>`
      + `<div class="af-note">Менший ліміт і депозит підвищують шанс згоди. Депозит повертається при бездоганному виконанні; при порушенні — втрачається.</div></div>`;
    // жива оцінка
    h += `<div class="af-sec">Оцінка запиту</div><div class="af-live" id="afLive"></div>`;
    h += `</div><div class="af-ft"><button class="dp-b ghost" data-af="plan" title="Відкрити планувальник маршруту">🧭 Планувальник</button><span class="af-sp"></span><button class="dp-b ghost" data-af="close">Скасувати</button><button class="dp-b gold" id="afSend" data-af="send">Надіслати запит</button></div></div>`;
    const sc = w.querySelector(".af-body") ? w.querySelector(".af-body").scrollTop : 0;
    w.innerHTML = h; const nb = w.querySelector(".af-body"); if (nb) nb.scrollTop = sc; liveForm(false);
  }
  function liveForm(deep) {
    const a = A(), f = S.form, w = $("airForm"); if (!a || !f || !w || w.hidden) return;
    const e = a.eval(f.x, f), ff = e.f, t0 = a.now();
    const q = id => w.querySelector(id);
    const dv = q("#afDurV"); if (dv) dv.textContent = a.fmtDur(f.dur);
    const sn = q("#afStart"); if (sn) { const shifted = ff.start !== f.start; sn.innerHTML = `Початок: <b>Д${dayOf(ff.start)} ${hhmm(ff.start)}</b> — через ${a.fmtDur(ff.start - t0)}` + (shifted ? ` <span class="bad">(не раніше ніж через ${a.AIR.LEAD} хв — зсунуто)</span>` : "") + `<br>Зараз: Д${dayOf(t0)} ${hhmm(t0)}`; }
    const wn = q("#afWin"); if (wn) wn.innerHTML = `Вікно дії: <b>Д${dayOf(ff.start)} ${hhmm(ff.start)} → Д${dayOf(ff.start + ff.dur)} ${hhmm(ff.start + ff.dur)}</b> · країна може скоротити строк`;
    const lv = q("#afLive"); if (!lv) return;
    let h = `<div class="dp-gates">` + chip(e.gates.rel, "Відносини", e.r, "≥ " + a.AIR.RELMIN, "Рівень відносин із країною")
      + chip(e.gates.cmp, "Сумісність", a.pct(e.cm.v), "≥ " + a.pct(a.AIR.COMPMIN), e.cm.rs.map(r => r[0] + " " + Math.round(r[1] * 100)).join(", "))
      + chip(e.gates.rsk, "Ризик", a.pct(e.rk.v), "≤ " + a.pct(a.AIR.RISKMAX), e.rk.rs.map(r => r[0] + " " + Math.round(r[1] * 100)).join(", ")) + `</div>`;
    if (e.blk) h += `<div class="af-blk">⛔ ${esc(e.blk)}</div>`;
    else {
      h += `<div class="af-chance"><div class="af-meter"><i style="width:${Math.round(e.p * 100)}%"></i></div><b>шанс згоди ≈ ${a.pct(e.p)}</b></div>`
        + `<div class="af-note">Рішення очікується через <b>${e.wait[0]}–${e.wait[1]} хв</b> гри${e.rk.v > a.AIR.FULLMAX ? " · за такого ризику — лише <b>умовний</b> дозвіл" : ""}. Країна вирішує за відносинами, політичною ситуацією й ризиком ескалації.</div>`;
    }
    {
      h += `<details class="af-det"><summary>Що впливає на рішення</summary><div class="af-two"><div><h5>Шанс згоди</h5><ul class="dp-rs">${ptsList((e.rs || []).slice().sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).slice(0, 9))}</ul></div><div><h5>Ризик ескалації (п. п.)</h5><ul class="dp-rs">${ptsList(e.rk.rs.map(r => [r[0], r[1]]), 100)}</ul></div></div></details>`;
    }
    const keep = lv.querySelector("details"), open = keep && keep.open; lv.innerHTML = h; if (open) { const d = lv.querySelector("details"); if (d) d.open = true; }
    const sb = $("afSend"); if (sb) { sb.classList.toggle("dis", !!e.blk); sb.title = e.blk || ""; sb.setAttribute("aria-disabled", e.blk ? "true" : "false"); }
    // оновлюємо маркування країн (шанс) — легко, без перебудови форми
    w.querySelectorAll(".af-c").forEach(b => { const x = b.dataset.v, ee = a.eval(x, f), s = b.querySelector("small"); b.classList.toggle("no", !!ee.blkGate); if (s) s.textContent = ee.blkGate ? "недоступно" : "≈ " + a.pct(ee.p); b.title = ee.blk || ""; });
  }

  /* ======================================================================================================
     Мапа: зони дозволів, маршрут планувальника
     ====================================================================================================== */
  const COL = { on: "#3ddc84", wait: "#ffc53d", req: "#4cc3ff", viol: "#ff4d4d", muted: "#8ea3c7", free: "#8fb4ff", ok: "#3ddc84", warn: "#ffc53d", bad: "#ff4d4d" };
  const FC = f => ({ type: "FeatureCollection", features: f || [] });
  const ringArea = r => { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
  const inRing = (p, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { if ((r[i][1] > p[1]) !== (r[j][1] > p[1]) && p[0] < (r[j][0] - r[i][0]) * (p[1] - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; } return c; };
  const PC = new Map();
  function polysOf(st, km) {
    const key = st + ":" + km, hit = PC.get(key); if (hit) return hit;
    const R = A().rings(st, km).rings, outs = [], holes = [];
    for (const r of R) { (ringArea(r) > 0 ? outs : holes).push(r); }
    if (!outs.length && holes.length) { outs.push(...holes.splice(0)); }           // страховка: орієнтація кілець інша
    const polys = outs.map(o => ({ o: o.concat([o[0]]), a: Math.abs(ringArea(o)), h: [] }));
    for (const h of holes) { const c = polys.filter(p => inRing(h[0], p.o)).sort((x, y) => x.a - y.a)[0]; if (c) c.h.push(h.concat([h[0]])); }
    const v = { type: "MultiPolygon", coordinates: polys.map(p => [p.o].concat(p.h)) };
    PC.set(key, v); if (PC.size > 40) PC.delete(PC.keys().next().value); return v;
  }
  let layersOk = false;
  function ensureLayers() {
    const m = mp(); if (!m || !m.getSource) return false;
    try {
      if (m.getSource("airz")) return true;
      m.addSource("airz", { type: "geojson", data: FC() }); m.addSource("airr", { type: "geojson", data: FC() });
      m.addLayer({ id: "airz-f", type: "fill", source: "airz", paint: { "fill-color": ["get", "c"], "fill-opacity": ["get", "fo"] } });
      m.addLayer({ id: "airz-l", type: "line", source: "airz", filter: ["!=", ["get", "d"], 1], paint: { "line-color": ["get", "c"], "line-width": ["get", "lw"], "line-opacity": 0.95 } });
      m.addLayer({ id: "airz-ld", type: "line", source: "airz", filter: ["==", ["get", "d"], 1], paint: { "line-color": ["get", "c"], "line-width": ["get", "lw"], "line-opacity": 0.95, "line-dasharray": [2, 2] } });
      m.addLayer({ id: "airr-c", type: "line", source: "airr", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#050a14", "line-width": 6.5, "line-opacity": 0.75 } });
      m.addLayer({ id: "airr-l", type: "line", source: "airr", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "c"], "line-width": 3.4 } });
      return true;
    } catch (e) { if (window.console) console.warn("[air ui] layers", e); return false; }
  }
  let zSig = "", zMarks = [];
  function clearMarks(list) { list.forEach(k => { try { k.remove(); } catch (e) { /* */ } }); list.length = 0; }
  function zoneLabel(z, a) {
    const o = a.OPS[z.op];
    return `<b>${a.flag(z.st)} ${esc(a.nm(z.st))}</b><span>${esc(o.s)} · ${z.km >= 9999 ? "весь простір" : "до " + z.km + " км"}</span><span>${z.on ? "ще " + a.fmtDur(z.left) : "з " + a.fmtT(z.from)}${z.cap ? " · " + z.uses + "/" + z.cap : ""}</span>`;
  }
  function updateZones() {
    const a = A(), m = mp(); if (!m) return;
    const live = a && a.ok(), side = live ? a.side() : null;
    const zs = live && S.mapOn ? a.zones(side) : [], rq = live && S.mapOn ? a.reqs(side) : [];
    const pw = $("airPlan"), plannerOn = !!S.plan && !!pw && !pw.hidden;
    const sig = [live ? a.ver() : "x", S.mapOn, plannerOn, S.showAll, zs.map(z => z.id + (z.on ? "o" : "w") + z.km + (z.viol ? "v" : "")).join(","), rq.map(r => r.id + ":" + r.km).join(","), Math.floor((live ? a.now() : 0) / 5)].join("|");
    if (sig === zSig) return;
    if (!ensureLayers()) return; zSig = sig;
    const fs = [];
    if (live && S.mapOn && (plannerOn || S.showAll)) for (const st of a.AIRST) { fs.push({ type: "Feature", properties: { c: COL.muted, fo: 0.045, lw: 1 }, geometry: polysOf(st, 9999) }); }
    for (const r of rq) { if (!a.AIRST.includes(r.st)) continue; fs.push({ type: "Feature", properties: { c: COL.req, fo: 0.07, lw: 1.6, d: 1 }, geometry: polysOf(r.st, r.km) }); }
    for (const z of zs) fs.push({ type: "Feature", properties: { c: z.viol ? COL.viol : z.on ? COL.on : COL.wait, fo: z.on ? 0.17 : 0.1, lw: 2.2 }, geometry: polysOf(z.st, z.km) });
    try { m.getSource("airz").setData(FC(fs)); } catch (e) { /* */ }
    clearMarks(zMarks);
    const gl = GL();
    for (const z of zs) {
      const r = a.rings(z.st, z.km); if (!r.c) continue;
      const d = el("div", "", "az-lab " + (z.viol ? "v" : z.on ? "on" : "w")); d.innerHTML = zoneLabel(z, a);
      d.addEventListener("click", ev => { ev.stopPropagation(); openPlan(z.id); });
      zMarks.push(new gl.Marker({ element: d, anchor: "center" }).setLngLat(r.c).addTo(m));
    }
    for (const r of rq) { const rr = a.rings(r.st, r.km); if (!rr.c) continue; const d = el("div", "", "az-lab req"); d.innerHTML = `<b>${a.flag(r.st)} ${esc(a.nm(r.st))}</b><span>запит розглядається · ≈ ${a.fmtDur(r.left)}</span>`; zMarks.push(new gl.Marker({ element: d, anchor: "center" }).setLngLat(rr.c).addTo(m)); }
    const b = $("airZb"); if (b) b.classList.toggle("has", zs.length > 0 || rq.length > 0);
  }

  /* ======================================================================================================
     Планувальник маршруту
     ====================================================================================================== */
  const CLS = { drone: ["Дрон / БпЛА", 180], cruise: ["Крилата ракета", 850], ballistic: ["Балістична ракета", 3000], hyper: ["Гіперзвукова", 5000] };
  const OPSPEED = { strike: 850, cap: 900, recon: 700, ferry: 650 };
  let wMarks = [], eMarks = [], lastChk = null;
  function newPlan(op) {
    const a = A(), o = op && a.OPS[op] ? op : "strike";
    return { op: o, cls: "cruise", speed: o === "msl" ? CLS.cruise[1] : OPSPEED[o], start: roundUp5(a.now() + 10), n: 1, weap: false, pts: [], adding: true, pid: 0 };
  }
  function mountPlan() {
    let w = $("airPlan"); if (w) return w;
    w = el("div", "airPlan", "pl-wrap"); w.hidden = true; w.setAttribute("role", "dialog"); w.setAttribute("aria-label", "Планувальник маршруту");
    document.body.appendChild(w);
    w.addEventListener("click", e => { const b = e.target.closest("[data-pl]"); if (!b) return; e.stopPropagation(); planAct(b.dataset.pl, b.dataset.v); });
    w.addEventListener("input", e => {
      const P = S.plan, t = e.target; if (!P || !t.dataset.pli) return; const k = t.dataset.pli;
      if (k === "speed") P.speed = clamp(+t.value || 100, 60, 6000);
      else if (k === "n") P.n = clamp(Math.round(+t.value) || 1, 1, 40);
      else if (k === "off") P.start = roundUp5(A().now() + Math.max(0, +t.value || 0));
      else if (k === "weap") P.weap = !!t.checked;
      recheck(true);
    });
    w.addEventListener("change", e => {
      const P = S.plan, t = e.target; if (!P || !t.dataset.pli) return; const k = t.dataset.pli;
      if (k === "op") { P.op = t.value; if (P.op !== "msl") P.speed = OPSPEED[P.op]; else P.speed = CLS[P.cls][1]; if (!A().OPS[P.op].weap) P.weap = false; renderPlan(); recheck(); }
      else if (k === "cls") { P.cls = t.value; P.speed = CLS[P.cls][1]; renderPlan(); recheck(); }
    });
    return w;
  }
  function openPlan(permId, opt) {
    const a = A(); if (!a || !a.ok()) return toast("Дипломатія недоступна в цьому режимі", "warn");
    closeForm(); closeDec(); const w = mountPlan(), pm = permId ? a.perms().find(q => q.id === permId) : null;
    if (!S.plan) S.plan = newPlan(pm ? (pm.op === "msl" ? "msl" : pm.op) : null);
    const P = S.plan;
    if (pm) { P.pid = pm.id; if (a.OPS[pm.op]) { P.op = pm.op; P.speed = pm.op === "msl" ? CLS[P.cls][1] : OPSPEED[pm.op]; } const from = pm.from == null ? pm.t0 : pm.from; P.start = Math.max(roundUp5(a.now() + 5), from); if (!a.OPS[P.op].weap) P.weap = false; }
    w.hidden = false; document.body.classList.add("pl-open"); S.mapOn = true; zSig = "";
    renderPlan(); recheck(); bindMapEvents(); updateZones(); drawRoute();
    const m = mp(), focus = pm ? pm.st : opt && opt.st; if (focus) { const r = a.rings(focus, pm ? pm.km : 9999); if (r.c) m.flyTo({ center: r.c, zoom: Math.max(m.getZoom(), 5.2), duration: 700 }); }
    const b = $("airZb"); if (b) b.classList.add("on");
  }
  function closePlan() {
    const w = $("airPlan"); if (w) w.hidden = true; document.body.classList.remove("pl-open", "pl-adding"); S.plan = null; lastChk = null;
    clearMarks(wMarks); clearMarks(eMarks); const m = mp(); try { m.getSource("airr") && m.getSource("airr").setData(FC()); m.getCanvas().style.cursor = ""; } catch (e) { /* */ }
    zSig = ""; updateZones(); const b = $("airZb"); if (b) b.classList.remove("on");
  }
  function planAct(k, v) {
    const a = A(), P = S.plan; if (!P) return;
    if (k === "close") return closePlan();
    if (k === "add") { P.adding = !P.adding; renderPlan(); return setCursor(); }
    if (k === "pm") { const q = a.perms().find(z => z.id === +v); if (!q) return; const r = a.rings(q.st, q.km); if (r.c) mp().flyTo({ center: r.c, zoom: Math.max(mp().getZoom(), 5.6), duration: 600 }); return; }
    if (k === "undo") { P.pts.pop(); }
    else if (k === "clear") { P.pts = []; }
    else if (k === "del") { P.pts.splice(+v, 1); }
    else if (k === "rev") { P.pts.reverse(); }
    else if (k === "startp") { P.start = roundUp5(a.now() + (+v)); }
    else if (k === "auto") {
      if (P.pts.length < 2) return toast("Поставте початкову й кінцеву точки", "warn");
      const A0 = P.pts[0], B0 = P.pts[P.pts.length - 1], dur = Math.max(60, dkm(A0, B0) / Math.max(60, P.speed) * 60 + 30);
      const r = a.reroute(A0, B0, { op: P.op, start: Math.max(P.start, a.now()), dur });
      if (!r) return toast("Обхід через вільне або дозволене небо не знайдено — запросіть дозвіл на небо", "warn");
      P.pts = r; toast("Маршрут прокладено через вільне й дозволене небо", "ok");
    } else if (k === "all") { S.showAll = !S.showAll; zSig = ""; updateZones(); return renderPlan(); }
    else if (k === "goto") { const it = lastChk && (lastChk.errors.concat(lastChk.warns))[+v]; if (it && it.at) { mp().flyTo({ center: it.at, zoom: Math.max(mp().getZoom(), 7), duration: 600 }); } return; }
    else if (k === "req") { const it = lastChk && lastChk.errors.find(z => z.st) || lastChk && lastChk.segs.find(z => z.st); const st = it ? it.st : null; closePlan(); return openForm(st, P.op); }
    else if (k === "fit") { return fitRoute(); }
    renderPlan(); recheck(); drawRoute();
  }
  function setCursor() { document.body.classList.toggle("pl-adding", !!(S.plan && S.plan.adding)); const m = mp(); try { m.getCanvas().style.cursor = S.plan && S.plan.adding ? "crosshair" : ""; } catch (e) { /* */ } }
  function recheck(light) {
    const a = A(), P = S.plan; if (!P || !a.ok()) return;
    lastChk = a.check(P.pts, { op: P.op, speed: P.speed, start: Math.max(P.start, a.now()), n: P.n, weap: P.weap, cls: P.op === "msl" ? P.cls : "" });
    renderResult(); drawRoute();
  }
  function bindMapEvents() {
    if (bindMapEvents.done) return; bindMapEvents.done = true;
    let down = null;
    document.addEventListener("pointerdown", e => { if (S.plan && S.plan.adding) down = { x: e.clientX, y: e.clientY }; }, true);
    document.addEventListener("click", e => {
      const P = S.plan; if (!P || !P.adding || $("airPlan").hidden) return;
      const mapEl = $("map"); if (!mapEl || !mapEl.contains(e.target) || e.target.closest(".pl-mk,.pl-iss-mk,.maplibregl-ctrl,.hud,.panel")) return;
      const d = down; down = null; if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
      e.stopImmediatePropagation(); e.preventDefault();
      const m = mp(), r = m.getContainer().getBoundingClientRect(), ll = m.unproject([e.clientX - r.left, e.clientY - r.top]);
      P.pts.push([+ll.lng.toFixed(4), +ll.lat.toFixed(4)]); renderPlan(); recheck();
    }, true);
    document.addEventListener("keydown", e => {
      const P = S.plan; if (!P || $("airPlan").hidden) return;
      if (e.key === "Escape") { e.preventDefault(); if (P.adding) { P.adding = false; renderPlan(); setCursor(); } else closePlan(); }
      else if (e.key === "Backspace" && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || "")) { e.preventDefault(); P.pts.pop(); renderPlan(); recheck(); }
    }, true);
  }
  function fitRoute() {
    const P = S.plan, m = mp(); if (!P || P.pts.length < 1) return;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; P.pts.forEach(p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    try { m.fitBounds([[x0, y0], [x1, y1]], { padding: { top: 90, bottom: 190, left: 60, right: 80 }, maxZoom: 8, duration: 600 }); } catch (e) { /* */ }
  }
  function renderPlan() {
    const a = A(), P = S.plan, w = $("airPlan"); if (!a || !P || !w) return;
    const O = a.OPS, t0 = a.now(), perms = a.perms();
    let h = `<div class="pl-hd"><b>🧭 Планувальник · повітряні зони</b><button class="af-x" data-pl="close" aria-label="Закрити">×</button></div><div class="pl-body">`;
    h += `<div class="pl-grid"><label>Операція<select data-pli="op">` + Object.keys(O).map(k => `<option value="${k}" ${k === P.op ? "selected" : ""}>${esc(O[k].n)}</option>`).join("") + `</select></label>`;
    if (P.op === "msl") h += `<label>Тип цілі<select data-pli="cls">` + Object.keys(CLS).map(k => `<option value="${k}" ${k === P.cls ? "selected" : ""}>${CLS[k][0]}</option>`).join("") + `</select></label>`;
    h += `<label>Швидкість, км/год<input data-pli="speed" type="number" min="60" max="6000" step="10" value="${P.speed}"></label>`
      + `<label>${P.op === "msl" ? "Ракет / дронів" : "Літаків"}<input data-pli="n" type="number" min="1" max="40" step="1" value="${P.n}"></label>`
      + `<label>Старт через, хв<input data-pli="off" type="number" min="0" step="5" value="${Math.max(0, Math.round(P.start - t0))}"></label>`;
    if (O[P.op].weap) h += `<label class="pl-ck"><input data-pli="weap" type="checkbox" ${P.weap ? "checked" : ""}> Бойові дії в чужому небі</label>`;
    h += `</div><div class="af-chips pl-chips">` + [[5, "зараз"], [30, "+30 хв"], [60, "+1 год"], [180, "+3 год"]].map(z => `<button data-pl="startp" data-v="${z[0]}">${z[1]}</button>`).join("") + `<span class="pl-t">Старт: Д${dayOf(P.start)} ${hhmm(P.start)}</span></div>`;
    h += `<div class="pl-tools"><button class="dp-b ${P.adding ? "gold" : "ghost"} sm" data-pl="add">${P.adding ? "● Клік по мапі додає точку" : "＋ Додавати точки"}</button><button class="dp-b ghost sm" data-pl="undo">↶ Назад</button><button class="dp-b ghost sm" data-pl="rev">⇄ Розвернути</button><button class="dp-b ghost sm" data-pl="auto" title="Прокласти маршрут між першою й останньою точкою лише через вільне або дозволене небо">⤴ Авто-обхід</button><button class="dp-b ghost sm" data-pl="clear">Очистити</button><button class="dp-b ghost sm" data-pl="fit">⌖</button><button class="dp-b ${S.showAll ? "gold" : "ghost"} sm" data-pl="all" title="Показати все небо країн, де можливий дозвіл">Небо країн</button></div>`;
    h += `<div class="pl-leg"><span><i style="background:${COL.on}"></i>дозвіл діє</span><span><i style="background:${COL.wait}"></i>почнеться</span><span><i class="d" style="background:${COL.req}"></i>запит</span><span><i style="background:${COL.free}"></i>вільне небо</span><span><i style="background:${COL.bad}"></i>порушення</span></div>`;
    h += `<div class="pl-pts" id="plPts">` + (P.pts.length ? P.pts.map((p, i) => `<span class="pl-pt"><b>${i === 0 ? "A" : i === P.pts.length - 1 ? "B" : i}</b>${p[1].toFixed(2)}, ${p[0].toFixed(2)}<button data-pl="del" data-v="${i}" aria-label="Видалити точку">×</button></span>`).join("") : `<span class="pl-hint">Оберіть початкову й кінцеву точки на мапі — звіт про відповідність дозволам з'явиться одразу.</span>`) + `</div>`;
    h += `<div id="plRes"></div>`;
    h += `<div class="pl-perms"><div class="dp-sec sm">Мої дозволи</div>` + (perms.length ? perms.map(q => `<div class="pl-pm ${q.from <= t0 ? "on" : "w"}"><span>${a.flag(q.st)} ${esc(a.nm(q.st))} · ${esc(O[q.op].s)} · ${q.km >= 9999 ? "весь простір" : q.km + " км"}</span><small>${q.from <= t0 ? "до " + a.fmtT(q.until) : a.fmtT(q.from) + " → " + a.fmtT(q.until)}</small><button class="dp-b ghost sm" data-pl="pm" data-v="${q.id}">Показати</button></div>`).join("") : `<div class="pl-hint">Дозволів немає — маршрут над чужим небом буде позначено як порушення.</div>`)
      + `<div class="af-chips"><button data-pl="req">✈ Запит на небо…</button></div></div>`;
    h += `</div>`;
    const sc = w.querySelector(".pl-body") ? w.querySelector(".pl-body").scrollTop : 0; w.innerHTML = h; const nb = w.querySelector(".pl-body"); if (nb) nb.scrollTop = sc;
    renderResult(); setCursor();
  }
  function renderResult() {
    const a = A(), P = S.plan, box = $("plRes"); if (!a || !P || !box) return; const c = lastChk;
    if (!c) { box.innerHTML = ""; return; }
    let h = "";
    if (P.pts.length < 2) h = `<div class="pl-v idle">Додайте щонайменше дві точки маршруту.</div>`;
    else if (c.noGrid) h = `<div class="pl-v warn">Сітка неба недоступна — перевірку виконати неможливо.</div>`;
    else {
      const ne = c.errors.length, nw = c.warns.length, foreign = c.segs.length;
      h = ne ? `<div class="pl-v bad">⛔ Маршрут порушує умови дозволу: ${ne}</div>` : nw ? `<div class="pl-v warn">⚠ Маршрут допустимий, але є попередження: ${nw}</div>` : foreign ? `<div class="pl-v ok">✅ Маршрут відповідає дозволам</div>` : `<div class="pl-v ok">✅ Маршрут лишається у вільному небі — дозвіл не потрібен</div>`;
      h += `<div class="pl-st"><span>Довжина <b>${Math.round(c.km)} км</b></span><span>Політ <b>${a.fmtDur(c.eta)}</b></span><span>Приліт <b>${a.fmtT(c.tEnd)}</b></span></div>`;
      if (c.segs.length) {
        h += `<table class="pl-seg"><thead><tr><th>Небо</th><th>Ділянка</th><th>Час</th><th>Глибина</th></tr></thead><tbody>` + c.segs.map(s => {
          const q = s.q ? a.perms().find(z => z.id === s.q) : null, lim = q ? (q.km >= 9999 ? "∞" : q.km) : "—";
          return `<tr class="${s.k}"><td>${s.st ? a.flag(s.st) + " " + esc(a.nm(s.st)) : "🚫 закрите"}</td><td>${Math.round(s.km0)}–${Math.round(s.km1)} км</td><td>${a.fmtT(s.tIn)} → ${hhmm(s.tOut)}</td><td>${s.maxKm} / ${lim} км</td></tr>`;
        }).join("") + `</tbody></table>`;
      }
      if (ne) h += `<ul class="pl-iss bad">` + c.errors.map((z, i) => `<li><span>⛔ ${esc(z.msg)}${z.hint ? `<small>${esc(z.hint)}</small>` : ""}</span><button data-pl="goto" data-v="${i}" aria-label="Показати на мапі">📍</button></li>`).join("") + `</ul>`;
      if (nw) h += `<ul class="pl-iss warn">` + c.warns.map((z, i) => `<li><span>⚠ ${esc(z.msg)}</span><button data-pl="goto" data-v="${ne + i}" aria-label="Показати на мапі">📍</button></li>`).join("") + `</ul>`;
      if (ne) h += `<div class="af-chips"><button data-pl="auto">⤴ Авто-обхід</button><button data-pl="req">✈ Запросити небо…</button></div>`;
    }
    box.innerHTML = h;
  }
  function drawRoute() {
    const a = A(), P = S.plan, m = mp(); if (!m) return;
    if (!P) return;
    ensureLayers(); const gl = GL();
    const fs = []; if (lastChk && lastChk.parts) for (const pt of lastChk.parts) if (pt.pts.length >= 2) fs.push({ type: "Feature", properties: { c: COL[pt.k] || COL.free }, geometry: { type: "LineString", coordinates: pt.pts } });
    if (!fs.length && P.pts.length >= 2) fs.push({ type: "Feature", properties: { c: COL.free }, geometry: { type: "LineString", coordinates: P.pts } });
    try { m.getSource("airr") && m.getSource("airr").setData(FC(fs)); } catch (e) { /* */ }
    // маркери точок (перетягуються)
    if (wMarks.length !== P.pts.length || wMarks.some((k, i) => !k._p || k._p !== P.pts[i])) {
      clearMarks(wMarks);
      P.pts.forEach((p, i) => {
        const d = el("div", "", "pl-mk " + (i === 0 ? "a" : i === P.pts.length - 1 ? "b" : "")); d.textContent = i === 0 ? "A" : i === P.pts.length - 1 ? "B" : String(i);
        const mk = new gl.Marker({ element: d, draggable: true }).setLngLat(p).addTo(m); mk._p = p;
        mk.on("drag", () => { const ll = mk.getLngLat(); P.pts[i] = [+ll.lng.toFixed(4), +ll.lat.toFixed(4)]; mk._p = P.pts[i]; if (!drawRoute.t) drawRoute.t = setTimeout(() => { drawRoute.t = 0; recheck(); }, 90); });
        mk.on("dragend", () => { renderPlan(); recheck(); });
        wMarks.push(mk);
      });
    }
    clearMarks(eMarks);
    if (lastChk) { lastChk.errors.forEach(z => { if (!z.at) return; const d = el("div", "", "pl-iss-mk bad"); d.textContent = "⛔"; d.title = z.msg; eMarks.push(new gl.Marker({ element: d }).setLngLat(z.at).addTo(m)); }); lastChk.warns.forEach(z => { if (!z.at || z.k === "notify") return; const d = el("div", "", "pl-iss-mk warn"); d.textContent = "⚠"; d.title = z.msg; eMarks.push(new gl.Marker({ element: d }).setLngLat(z.at).addTo(m)); }); }
  }
  function planTick() {
    const P = S.plan; if (!P || $("airPlan").hidden) return;
    const a = A(); if (!a || !a.ok()) return closePlan();
    const sig = a.ver() + ":" + Math.floor(a.now() / 5); if (planTick.sig !== sig) { planTick.sig = sig; const f = document.activeElement; if (f && $("airPlan").contains(f) && /INPUT|SELECT/.test(f.tagName)) recheck(); else { renderPlan(); recheck(); } }
  }

  /* ======================================================================================================
     Картка рішення (причина + наслідки)
     ====================================================================================================== */
  function mountDec() {
    let w = $("airDec"); if (w) return w;
    w = el("div", "airDec", "ad-wrap"); w.hidden = true; w.setAttribute("role", "dialog"); w.setAttribute("aria-label", "Рішення щодо повітряного простору"); document.body.appendChild(w);
    w.addEventListener("click", e => {
      const b = e.target.closest("[data-ad]"); if (!b) return; e.stopPropagation(); const k = b.dataset.ad;
      if (k === "close") return closeDec();
      if (k === "plan") { const id = +b.dataset.v; closeDec(); return openPlan(id || null); }
      if (k === "events") { closeDec(); return gotoDip("e"); }
      if (k === "sky") { closeDec(); return gotoDip("a"); }
      if (k === "again") { const x = b.dataset.v; closeDec(); return openForm(x); }
    });
    return w;
  }
  function gotoDip(tab) { try { const d = window.BV_DIP; if (d && d._ && d._.UI) { d._.UI.tab = tab; } if (d && !d.isOpen()) d.toggle(true); else if (d && d._ && d._.render) d._.render(true); } catch (e) { /* */ } }
  function openDec(id) {
    const a = A(); if (!a) return; const r = a.dec(id); if (!r) return;
    const w = mountDec(); S.decId = id; a.markRead(id);
    const grant = r.out === "full" || r.out === "cond-ok", cond = r.out === "cond", bad = ["deny", "late", "viol", "revoked", "incursion", "cond-no"].includes(r.out);
    let h = `<div class="ad-hd"><b>Повітряний простір · ${bad ? "дипломатичні наслідки" : "рішення"}</b><button class="af-x" data-ad="close" aria-label="Закрити">×</button></div><div class="ad-body">${a.decHtml(id, false)}</div><div class="ad-ft">`;
    if (grant && r.q) h += `<button class="dp-b gold" data-ad="plan" data-v="${r.q}">🧭 Спланувати маршрут у зоні</button>`;
    if (cond) h += `<button class="dp-b gold" data-ad="events">Умови — у «Подіях»</button>`;
    if (bad && r.out !== "incursion") h += `<button class="dp-b ghost" data-ad="again" data-v="${r.x}">Новий запит…</button>`;
    h += `<button class="dp-b ghost" data-ad="sky">Небо</button><button class="dp-b ghost" data-ad="close">Закрити</button></div>`;
    w.className = "ad-wrap " + (bad ? "bad" : grant ? "good" : "ask"); w.innerHTML = h; w.hidden = false;
  }
  function closeDec() { const w = $("airDec"); if (w) w.hidden = true; }
  window.addEventListener("bv-air-decision", ev => {
    try { const a = A(), r = ev.detail; if (!a || !r || !a.ok() || r.p !== a.side()) return; setTimeout(() => openDec(r.id), 60); } catch (e) { /* */ }
  });

  /* ======================================================================================================
     Кнопка на мапі, загальне
     ====================================================================================================== */
  function mountButton() {
    if ($("airZb")) return true; const c = $("controls"); if (!c) return false;
    const b = el("button", "airZb", "btn"); b.type = "button"; b.setAttribute("aria-label", "Повітряні зони й планувальник"); b.title = "Повітряні зони · планувальник маршруту (небо країн)"; b.innerHTML = svgPlane + `<i class="az-dot"></i>`;
    b.addEventListener("click", ev => { ev.stopPropagation(); const w = $("airPlan"); if (w && !w.hidden) closePlan(); else openPlan(null); });
    c.appendChild(b); return true;
  }
  function toggleMap() { S.mapOn = !S.mapOn; zSig = ""; updateZones(); toast(S.mapOn ? "Зони дозволів показано на мапі" : "Зони дозволів приховано", "info"); }
  let mt = setInterval(() => { if (mountButton()) { clearInterval(mt); } }, 500); mountButton();
  setInterval(() => { try { updateZones(); planTick(); const b = $("airZb"); if (b) { const a = A(); b.style.display = a && a.ok() ? "" : "none"; } } catch (e) { if (window.console) console.warn("[air ui]", e); } }, 800);
  try { mp().on("styledata", () => { zSig = ""; }); } catch (e) { /* */ }
  document.addEventListener("keydown", e => { if (e.key === "Escape") { const f = $("airForm"); if (f && !f.hidden) { closeForm(); } } }, true);

  window.BV_AIRUI = { openForm, openPlan, openDec, toggleMap, closeForm, closePlan, closeDec, state: S, recheck, updateZones, polysOf };
})();
