/* SKYDOMINION — «HANGAR TERMINAL» (етап 7.70): надбудова над Майданчиком і Арсеналом. Ігрову логіку не чіпає.
   Працює через window.BV_SHOP (= S7.shop) і MutationObserver на #bcBody: після кожного bcRender() розставляє тири, інструменти,
   інспектор, прогрес колекції та легенду. Якщо BV_SHOP немає — нічого не робить, магазин лишається як був. */
(function () {
  "use strict";
  if (window.__bvShop2) return; window.__bvShop2 = 1;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const TIER = [["Базова", "I"], ["Тактична", "II"], ["Елітна", "III"], ["Легендарна", "IV"]];
  const TRGB = ["143,160,192", "63,162,255", "177,132,255", "255,197,61"];
  const SORTS = [["def", "За замовчуванням"], ["pa", "Ціна ↑"], ["pd", "Ціна ↓"], ["nm", "Назва А→Я"], ["rg", "Радіус / дальність"]];
  const LS = "bv.shop2";
  let ST = { q: "", sort: "def", dense: false, large: false, dev: "kb" };
  try { Object.assign(ST, JSON.parse(localStorage.getItem(LS) || "{}")); ST.q = ""; } catch (e) {}
  const save = () => { try { localStorage.setItem(LS, JSON.stringify({ sort: ST.sort, dense: ST.dense, large: ST.large })); } catch (e) {} };
  const S = () => window.BV_SHOP;
  const num = t => +String(t || "").replace(/[^\d]/g, "") || 0;
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ── тири: за ціною (квантилі платної техніки); контейнери — за ціною серед контейнерів ── */
  let TQ = null;
  function tiers(){
    const s = S(); if (!s || !s.ITEMS) return null;
    if (TQ) return TQ;
    const p = Object.values(s.ITEMS).filter(i => i.paid).map(i => i.price).sort((a, b) => a - b);
    const q = f => p[Math.min(p.length - 1, Math.floor(p.length * f))];
    const b = Object.values(s.BOX || {}).map(x => x.price).sort((a, b) => a - b);
    TQ = { i1: q(.45), i2: q(.8), b1: b[Math.floor(b.length / 3)], b2: b[Math.floor(b.length * 2 / 3)] };
    return TQ;
  }
  const tierItem = it => { const q = tiers(); return !it || !it.paid ? 0 : it.price <= q.i1 ? 1 : it.price <= q.i2 ? 2 : 3; };
  const tierBox = B => { const q = tiers(); return B.price <= q.b1 ? 1 : B.price <= q.b2 ? 2 : 3; };
  const pips = t => `<span class="bx-pips">${[0, 1, 2, 3].map(i => `<i class="${i <= t ? "on" : ""}"></i>`).join("")}</span>`;
  const owned = it => !it.paid || !S().locked(it.k, it.key);

  /* ── розмітка карток ── */
  function markCards(body){
    const s = S(), bal = num(($(".bc-bv b") || {}).textContent);
    $$(".bc-it", body).forEach((c, i) => {
      const it = s.ITEMS[c.dataset.v]; if (!it) return;
      const t = tierItem(it); c.dataset.tier = t; c.style.setProperty("--i", Math.min(i, 24)); c.dataset.i = i;
      if (!$(".bx-tier", c)) c.insertAdjacentHTML("afterbegin", `<span class="bx-tier" title="Рідкість: ${TIER[t][0]}">${pips(t)}</span>`);
      if (it.paid && !owned(it)){
        const pr = $(".bc-pr", c); c.classList.toggle("bx-cant", bal < it.price); c.classList.toggle("bx-ok", bal >= it.price);
        if (pr && !$(".bx-short,.bx-aff", pr)) pr.insertAdjacentHTML("beforeend", bal < it.price ? `<span class="bx-short">−${it.price - bal}</span>` : `<i class="bx-aff" title="Вистачає балансу"></i>`);
      }
    });
    $$(".bc-box", body).forEach((c, i) => {
      const B = s.BOX[c.dataset.v]; if (!B) return;
      const t = tierBox(B); c.dataset.tier = t; c.style.setProperty("--i", i);
      if (!$(".bx-odds", c)) $(".bc-bch", c).insertAdjacentHTML("afterend", oddsBar(B, true));
    });
  }
  function oddsOf(B){
    const s = S(), a = [0, 0, 0, 0];
    B.drops.forEach(d => { a[tierItem(s.ITEMS[d.id])] += d.ch; });
    return a;
  }
  function oddsBar(B, small){
    const a = oddsOf(B), pc = v => (v * 100 >= 10 ? (v * 100).toFixed(0) : (v * 100).toFixed(1)).replace(".", ",") + "%";
    const bar = `<span class="bar">${a.map((v, i) => v > 0 ? `<i style="flex:${v};--c:${TRGB[i]}" title="${TIER[i][0]} ${pc(v)}"></i>` : "").join("")}</span>`;
    return small ? `<span class="bx-odds">${bar}<small><span>${TIER[3][0]}: ${pc(a[3])}</span><span>Шанси за тиром</span></small></span>` : bar;
  }

  /* ── інструменти: пошук, сортування, щільність, масштаб ── */
  function addTools(body){
    const grid = $(".bc-grid", body), flt = $(".bc-flt", body);
    if (!flt || $(".bx-tools", body)) return;
    flt.insertAdjacentHTML("afterend",
      `<div class="bx-tools"><label class="bx-search"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="7" cy="7" r="4.6"/><path d="M10.5 10.5 14 14"/></svg>` +
      `<input type="search" id="bxQ" placeholder="Пошук техніки…" autocomplete="off" value="${esc(ST.q)}"><kbd>/</kbd></label>` +
      `<select class="bx-sel" id="bxSort" aria-label="Сортування">${SORTS.map(o => `<option value="${o[0]}" ${ST.sort === o[0] ? "selected" : ""}>${o[1]}</option>`).join("")}</select>` +
      `<span class="bx-seg" role="group" aria-label="Щільність"><button data-bx="dense" data-v="0" class="${ST.dense ? "" : "on"}" title="Просторо">▦</button><button data-bx="dense" data-v="1" class="${ST.dense ? "on" : ""}" title="Компактно">▩</button></span>` +
      `<span class="bx-seg scale" role="group" aria-label="Масштаб"><button data-bx="large" data-v="0" class="${ST.large ? "" : "on"}">100%</button><button data-bx="large" data-v="1" class="${ST.large ? "on" : ""}" title="Режим для ТВ">TV</button></span>` +
      `<span class="bx-count" id="bxCount"></span></div>`);
    if (!grid) return;
  }
  function applyView(body){
    const grid = $(".bc-grid", body), cnt = $("#bxCount", body); if (!grid) return;
    const s = S(), q = ST.q.trim().toLowerCase(), cards = $$(".bc-it", grid);
    const rg = c => { const m = $(".bc-ms .bc-seg", c); return m ? $$("i.on", m).length : 0; };
    const key = { def: c => +c.dataset.i, pa: c => (s.ITEMS[c.dataset.v] || {}).price || 0, pd: c => -((s.ITEMS[c.dataset.v] || {}).price || 0), rg: c => -rg(c) }[ST.sort];
    let vis = 0;
    cards.forEach(c => { const hit = !q || (c.textContent || "").toLowerCase().includes(q); c.hidden = !hit; if (hit) vis++; });
    const arr = cards.slice();
    if (ST.sort === "nm") arr.sort((a, b) => $(".bc-nm", a).textContent.localeCompare($(".bc-nm", b).textContent, "uk"));
    else arr.sort((a, b) => key(a) - key(b) || a.dataset.i - b.dataset.i);
    arr.forEach(c => grid.appendChild(c));
    if (cnt) cnt.innerHTML = `Показано <b>${vis}</b> з ${cards.length}`;
    let emp = $(".bx-none", grid.parentNode);
    if (!vis && cards.length){ if (!emp) grid.insertAdjacentHTML("afterend", `<div class="bc-empty bx-none">За запитом «${esc(ST.q)}» нічого не знайдено.</div>`); }
    else if (emp) emp.remove();
  }

  /* ── прогрес колекції (Арсенал) ── */
  function addHero(body){
    const s = S(); if (s.state.tab !== "ars" || $(".bx-hero", body)) return;
    const paid = Object.values(s.ITEMS).filter(i => i.paid), got = paid.filter(owned);
    const per = [0, 1, 2, 3].map(t => [paid.filter(i => tierItem(i) === t && owned(i)).length, paid.filter(i => tierItem(i) === t).length]);
    const C = 2 * Math.PI * 36, pct = paid.length ? got.length / paid.length : 0;
    const left = paid.length - got.length;
    const html = `<div class="bx-hero"><div class="bx-ring"><svg viewBox="0 0 86 86"><defs><linearGradient id="bxRingG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#ff9d2e"/></linearGradient></defs>` +
      `<circle class="bg" cx="43" cy="43" r="36"/><circle class="fg" cx="43" cy="43" r="36" stroke-dasharray="${C}" stroke-dashoffset="${C}" data-to="${C * (1 - pct)}"/></svg><b>${Math.round(pct * 100)}%</b></div>` +
      `<div><h3>Колекція арсеналу</h3><p>Придбано <b style="color:#fff">${got.length}</b> із ${paid.length} позицій${left ? ` · ще ${left} до повної колекції` : " — колекція повна!"}</p>` +
      `<div class="bx-tiers">${per.slice(1).map((p, i) => `<span data-tier="${i + 1}">${pips(i + 1)}${TIER[i + 1][0]} <b>${p[0]}/${p[1]}</b></span>`).join("")}</div></div>` +
      (left ? `<button class="bc-btn" data-bc="tab" data-v="shop">До майданчика</button>` : "") + `</div>`;
    body.insertAdjacentHTML("afterbegin", html);
    requestAnimationFrame(() => requestAnimationFrame(() => { const f = $(".bx-ring .fg", body); if (f) f.style.strokeDashoffset = f.dataset.to; }));
  }

  /* ── інспектор ── */
  const noIco = `<svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M12 3 3 8v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>`;
  function addDock(body){
    let d = $(".bx-dock", body); if (d) return d;
    body.classList.add("bx-has-dock");
    body.insertAdjacentHTML("beforeend", `<aside class="bx-dock" aria-live="polite"></aside>`);
    d = $(".bx-dock", body);
    showDock(d, null);
    return d;
  }
  function showDock(d, card){
    if (!d) return;
    const s = S(), bal = num(($(".bc-bv b") || {}).textContent), ars = s.state.tab === "ars";
    if (!card){ d.dataset.tier = 0; d.innerHTML = `<div class="d-empty">${noIco}Наведіть курсор або виберіть позицію —<br>тут з’являться характеристики,<br>ціна та шанси.</div>`; return; }
    if (d.dataset.cur === card.dataset.v && d.dataset.st === s.state.tab) return;
    d.dataset.cur = card.dataset.v; d.dataset.st = s.state.tab;
    if (card.classList.contains("bc-box")){
      const B = s.BOX[card.dataset.v], t = tierBox(B), a = oddsOf(B), pc = v => (v * 100).toFixed(v * 100 >= 10 ? 0 : 1).replace(".", ",") + "%";
      const open = $(".bc-open", card), lack = B.price - bal;
      d.dataset.tier = t; d.style.setProperty("--sc", card.classList.contains("ru") ? "255,77,66" : "47,140,255");
      d.innerHTML = `<div class="d-stage"><span class="d-tier">${pips(t)}${TIER[t][0]}</span>${$(".ct3", card).outerHTML}</div><div class="d-body"><small class="k">Контейнер · ${esc($(".bc-bxs", card).textContent.split("·")[0].trim())}</small><h4>${esc($(".bc-bn b", card).textContent)}</h4>` +
        `<div class="d-hint" style="margin-top:-4px">${esc($(".bc-bn small", card).textContent)}</div>` +
        `<small class="k">Шанс за рівнем рідкості</small>${oddsBar(B)}<div class="bx-oddsrow">${[3, 2, 1, 0].filter(i => a[i] > 0).map(i => `<div data-tier="${i}"><i style="--c:${TRGB[i]}"></i>${TIER[i][0]}<em>${pc(a[i])}</em></div>`).join("")}</div>` +
        `<div class="d-stats" style="gap:4px"><div class="d-hint">Дублікат повертає частину ціни — ніщо не пропадає даремно.</div></div>` +
        (open ? `<button class="bx-cta" data-bx="go">${esc(open.textContent)}</button>` : `<div class="d-price">${s.coin(24)}<span>${B.price}</span></div>` + (lack > 0 ? `<div class="d-hint no">Бракує ${lack} Skycoin</div>` : "") + `<button class="bx-cta" data-bx="go">Переглянути й купити</button>`) + `</div>`;
      return;
    }
    const it = s.ITEMS[card.dataset.v]; if (!it) return;
    const t = tierItem(it), have = owned(it), lack = it.price - bal;
    d.dataset.tier = t; d.style.setProperty("--sc", it.side === "ru" ? "255,77,66" : "47,140,255");
    d.innerHTML = `<div class="d-stage"><span class="d-tier">${pips(t)}${TIER[t][0]}</span><img src="${esc(($("img", card) || {}).src)}" alt=""></div><div class="d-body">` +
      `<small class="k">${esc($(".bc-ctry", card).textContent)} · ${esc(it.sub)}</small><h4>${esc($(".bc-nm", card).textContent)}</h4>` +
      `<div class="d-stats">${$(".bc-mini", card).innerHTML}</div>` +
      `<div class="d-price">${!it.paid ? `<span class="bc-st">Базова — завжди в бою</span>` : have ? `<span class="bc-st paid">✓ В арсеналі</span>` : `${s.coin(24)}<span>${it.price}</span>`}</div>` +
      (it.paid && !have ? (s.fight && s.fight() ? `<div class="d-hint no">Іде бій — купівля після його завершення</div>` : lack > 0 ? `<div class="d-hint no">Бракує ${lack} Skycoin</div>` : `<div class="d-hint">Вистачає балансу — можна купувати.</div>`) : "") +
      `<button class="bx-cta ${have || !it.paid ? "ghost" : ""}" data-bx="go">${have || !it.paid ? "Характеристики" : lack > 0 ? "Докладніше" : "Купити"}</button></div>`;
  }

  /* ── легенда керування ── */
  function legend(frame){
    if (!frame || $(".bx-legend", frame)) return;
    frame.insertAdjacentHTML("beforeend", `<footer class="bx-legend"></footer>`); paintLegend();
  }
  function paintLegend(){
    const l = $("#bcShop .bx-legend"); if (!l) return;
    const d = ST.dev, ps = d === "ps", pad = d !== "kb";
    const k = (kb, a, cls) => pad ? `<i class="bx-k btn ${ps ? "ps" : cls}">${ps ? a : cls}</i>` : `<i class="bx-k">${kb}</i>`;
    l.innerHTML = `<span>${pad ? `<i class="bx-k btn ${ps ? "ps" : ""}">✥</i>` : `<i class="bx-k">←↑↓→</i>`}Навігація</span><span>${k("Enter", "✕", "A")}Обрати</span><span>${k("Esc", "○", "B")}Назад</span>` +
      `<span>${pad ? `<i class="bx-k">${ps ? "L1" : "LB"}</i><i class="bx-k">${ps ? "R1" : "RB"}</i>` : `<i class="bx-k">Q</i><i class="bx-k">E</i>`}Вкладки</span><span>${k("/", "□", "X")}Пошук</span><span class="pad">${pad ? (ps ? "DualSense" : "Gamepad") : "Клавіатура + миша"}</span>`;
  }
  function setDev(d){ if (ST.dev !== d){ ST.dev = d; paintLegend(); } }

  /* ── головний прохід після рендера ── */
  let busy = false, raf = 0;
  function enhance(){
    const ov = $("#bcShop"), body = $("#bcBody"); if (!ov || !body || !S() || !tiers()) return;
    busy = true; if (window.__bvShop2Poll) window.__bvShop2Poll();
    try {
      ov.classList.toggle("bx-dense", ST.dense); ov.classList.toggle("bx-l", ST.large);
      legend($(".bc-frame", ov));
      markCards(body); addTools(body); addHero(body); applyView(body);
      const d = addDock(body);
      if (!$(".bx-main", body)){ const m = document.createElement("div"); m.className = "bx-main"; Array.from(body.children).filter(x => x !== d).forEach(x => m.appendChild(x)); body.insertBefore(m, d); } const keep = d.dataset.cur && $(`[data-v="${d.dataset.cur}"]`, body);
      d.dataset.cur = "";
      const first = $(".bc-box", body) || $(".bc-it:not([hidden])", body);       /* інспектор ніколи не порожній: за замовчуванням — перша позиція */
      showDock(d, keep && (keep.classList.contains("bc-it") || keep.classList.contains("bc-box")) ? keep : first);
    } catch (e) { console.warn("shop2", e); }
    busy = false;
  }
  function watch(){
    const body = $("#bcBody"); if (!body || body.__bx) return; body.__bx = 1;
    new MutationObserver(() => { if (busy) return; cancelAnimationFrame(raf); raf = requestAnimationFrame(enhance); }).observe(body, { childList: true });
    const bal = $("#bcBalW");
    if (bal) new MutationObserver(() => { const b = $(".bc-bal"); if (b){ b.classList.remove("bx-bump"); void b.offsetWidth; b.classList.add("bx-bump"); } }).observe(bal, { childList: true, subtree: true, characterData: true });
    enhance();
  }
  new MutationObserver(() => { if ($("#bcBody")) watch(); }).observe(document.body, { childList: true });
  if ($("#bcBody")) watch();

  /* ── події: наведення/фокус → інспектор; керування; пошук ── */
  const overlay = () => $("#bcShop.on");
  function pick(e){
    const c = e.target.closest && e.target.closest(".bc-it,.bc-box"); const ov = overlay(); if (!c || !ov) return;
    $$(".bx-cur", ov).forEach(x => x !== c && x.classList.remove("bx-cur")); c.classList.add("bx-cur");
    showDock($(".bx-dock", ov), c);
  }
  document.addEventListener("mouseover", e => { if (e.target.closest && e.target.closest("#bcShop")) pick(e); }, true);
  document.addEventListener("focusin", e => { if (e.target.closest && e.target.closest("#bcShop")) pick(e); }, true);
  document.addEventListener("click", e => {
    const b = e.target.closest && e.target.closest("[data-bx]"); if (!b || !b.closest("#bcShop")) return;
    const ov = overlay(), a = b.dataset.bx;
    if (a === "go"){ const cur = $(".bx-dock", ov).dataset.cur, c = cur && $(`.bc-it[data-v="${cur}"],.bc-box[data-v="${cur}"]`, ov); if (c) c.click(); return; }
    if (a === "dense"){ ST.dense = b.dataset.v === "1"; save(); ov.classList.toggle("bx-dense", ST.dense); $$('[data-bx="dense"]', ov).forEach(x => x.classList.toggle("on", x === b)); return; }
    if (a === "large"){ ST.large = b.dataset.v === "1"; save(); ov.classList.toggle("bx-l", ST.large); $$('[data-bx="large"]', ov).forEach(x => x.classList.toggle("on", x === b)); }
  });
  document.addEventListener("input", e => { if (e.target.id !== "bxQ") return; ST.q = e.target.value; applyView($("#bcBody")); });
  document.addEventListener("change", e => { if (e.target.id !== "bxSort") return; ST.sort = e.target.value; save(); applyView($("#bcBody")); });

  /* клавіатура: стрілки — просторовий перехід фокуса, Q/E — вкладки, «/» — пошук */
  function navTargets(){
    const ov = overlay(); if (!ov) return [];
    const root = $("#bcLayer.on") ? $("#bcLayer") : ov;
    return $$('button:not([disabled]),a[href],input,select,[tabindex="0"]', root).filter(x => x.offsetParent && !x.hidden && !x.closest("[hidden]") && !x.closest(".bx-dock") && !x.closest(".bx-legend") && !x.classList.contains("bc-arr"));
  }
  function move(dir){
    const list = navTargets(), cur = document.activeElement; if (!list.length) return;
    if (!cur || !list.includes(cur)){ (list.find(x => x.classList.contains("bc-it") || x.classList.contains("bc-box")) || list[0]).focus(); return; }
    const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; let best = null, bs = 1e9;
    for (const el of list){
      if (el === cur) continue; const q = el.getBoundingClientRect(), x = q.left + q.width / 2 - cx, y = q.top + q.height / 2 - cy;
      const along = dir === "r" ? x : dir === "l" ? -x : dir === "d" ? y : -y, off = dir === "r" || dir === "l" ? Math.abs(y) : Math.abs(x);
      if (along <= 4) continue; const sc = along + off * 2.2; if (sc < bs){ bs = sc; best = el; }
    }
    if (best){ best.focus({ preventScroll: true }); best.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" }); }
  }
  const tab = d => { const t = $$("#bcTabs button"), i = t.findIndex(x => x.classList.contains("on")); const n = t[(i + d + t.length) % t.length]; if (n) n.click(); };
  document.addEventListener("keydown", e => {
    if (!overlay()) return; setDev("kb");
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);
    if (e.key === "/" && !typing){ const q = $("#bxQ"); if (q){ e.preventDefault(); q.focus(); q.select(); } return; }
    if (typing){ if (e.key === "Escape" && e.target.id === "bxQ"){ e.stopPropagation(); e.target.blur(); } return; }
    const m = { ArrowRight: "r", ArrowLeft: "l", ArrowDown: "d", ArrowUp: "u" }[e.key];
    if (m){ e.preventDefault(); move(m); return; }
    if (!$("#bcLayer.on")){ if (e.key === "q" || e.key === "Q" || e.key === "й" || e.key === "Й"){ tab(-1); } if (e.key === "e" || e.key === "E" || e.key === "у" || e.key === "У"){ tab(1); } }
  });
  document.addEventListener("mousemove", () => { if (ST.dev !== "kb" && overlay()) setDev("kb"); }, { passive: true });

  /* геймпад (Gamepad API): D-pad / лівий стік — навігація, A — вибір, B — назад, LB/RB — вкладки, X — пошук */
  const prev = {}; let rep = 0, loop = 0;
  function poll(){
    loop = 0; const ov = overlay(); if (!ov) return;
    const gp = (navigator.getGamepads ? Array.from(navigator.getGamepads()) : []).find(Boolean);
    if (gp){
      const id = (gp.id || "").toLowerCase(), ps = /054c|sony|dualsense|dualshock|playstation/.test(id), b = i => gp.buttons[i] && gp.buttons[i].pressed;
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, now = performance.now();
      const press = (k, v) => { const r = v && !prev[k]; prev[k] = v; return r; };
      const any = gp.buttons.some(x => x.pressed) || Math.abs(ax) > .5 || Math.abs(ay) > .5; if (any) setDev(ps ? "ps" : "xb");
      let dir = b(15) || ax > .55 ? "r" : b(14) || ax < -.55 ? "l" : b(13) || ay > .55 ? "d" : b(12) || ay < -.55 ? "u" : "";
      if (dir){ if (!prev.dir || now > rep){ move(dir); rep = now + (prev.dir ? 130 : 330); } } prev.dir = dir;
      if (press("a", b(0))){ const c = document.activeElement; if (c && c.closest("#bcShop,#bcLayer") && c.click) c.click(); }
      if (press("b", b(1))){ const x = $("#bcLayer.on .bc-x"); if (x) x.click(); else if (S()) S().close(); }
      if (press("x", b(2))){ const q = $("#bxQ"); if (q) q.focus(); }
      if (press("lb", b(4))) tab(-1); if (press("rb", b(5))) tab(1);
    }
    loop = requestAnimationFrame(poll);
  }
  window.__bvShop2Poll = () => { if (!loop && overlay()) loop = requestAnimationFrame(poll); };
})();
