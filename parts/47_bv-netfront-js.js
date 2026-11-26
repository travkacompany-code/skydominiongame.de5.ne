
/* SKYDOMINION — «МЕРЕЖЕВИЙ ФРОНТ» / «Tactical Lobby» (етап 7.71): надбудова над екранами «Мережевий фронт» і «Кімната».
   Мережу, кімнати, ролі й чат не чіпає: лише читає стан через window.BV_NET (= NET) і розставляє .nf-* після кожного menuRender().
   Якщо BV_NET немає — екран лишається як був. Ідемпотентно: кожен прохід перевіряє, що вже зроблено. */
(function () {
  "use strict";
  if (window.__bvNet2) return; window.__bvNet2 = 1;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const NF = { f: "all", q: "", cur: "" };
  const FLT = [["all", "Усі"], ["t1", "1×1"], ["t2", "2×2"], ["open", "Є місця"], ["game", "Бій іде"]];
  const PILL = { open: "Відкрита", full: "Повна", game: "Бій триває" }, STC = { open: "#34d27a", full: "#ffc53d", game: "#ff6b5e" };
  const lob = () => { const N = window.BV_NET; return N && N.lob && N.lob.state ? N.lob.state : null; };
  const roomOf = code => { const s = lob(); return s ? (s.rooms || []).find(r => r.code === code) : null; };
  const stOf = r => { const max = r.team2 ? 4 : 2; return r.status === "game" ? "game" : r.players >= max ? "full" : "open"; };
  const seatBar = (n, max, cls) => `<span class="${cls}">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("")}</span>`;

  /* ───────── екран «Мережевий фронт» (список) ───────── */
  function listPass(sc, menu){
    const s = lob(); if (!s) return;
    menu.classList.add("nf-on");
    const rooms = s.rooms || [];
    /* uplink */
    const up = $(".mm-note", sc);
    if (up && $(".ndot", up) && !up.classList.contains("nf-uplink")){
      up.classList.add("nf-uplink"); const dot = $(".ndot", up), t = document.createElement("span"); t.className = "nf-txt";
      Array.from(up.childNodes).forEach(n => { if (n !== dot) t.appendChild(n); }); up.appendChild(t);
    }
    if (up && up.classList.contains("nf-uplink")){
      const nb = $(".nf-txt b", up), onl = Math.max(nb ? +nb.textContent || 0 : 0, (s.online || []).length);
      const games = rooms.filter(r => r.status === "game").length, free = rooms.reduce((a, r) => a + (r.status === "game" ? 0 : Math.max(0, (r.team2 ? 4 : 2) - r.players)), 0);
      let st = $(".nf-stats", up); if (!st){ st = document.createElement("div"); st.className = "nf-stats"; up.appendChild(st); }
      const h = `<span>Онлайн <b>${onl}</b></span><span>Кімнат <b>${rooms.length}</b></span><span class="g">Вільних місць <b>${free}</b></span><span class="r">Боїв <b>${games}</b></span>`;
      if (st.innerHTML !== h) st.innerHTML = h;
    }
    /* дві головні дії */
    const tiles = $$(".mm-acts-in .mbtn", sc);
    if (tiles[0] && !$(".nf-code", tiles[0])){ const tx = tiles[0].lastElementChild; if (tx) tx.insertAdjacentHTML("beforeend", `<span class="nf-code" aria-hidden="true">${"<i></i>".repeat(6)}</span>`); }
    if (tiles[1]) tiles[1].classList.add("nf-primary");
    /* картки кімнат */
    const cards = $$(".room-card", sc);
    cards.forEach((c, i) => {
      const code = ($(".tag.code", c) || {}).textContent, r = roomOf(code); if (!r) return;
      c.classList.toggle("nf-cur", code === NF.cur); c.dataset.code = code; c.dataset.t2 = r.team2 ? "1" : "0"; c.dataset.i = i; c.style.setProperty("--i", Math.min(i, 12)); c.tabIndex = 0;
      const st = stOf(r); c.dataset.st = st;
      if (!$(".nf-pill", c)){
        const top = $(".rc-top", c);
        $$(".tag", top).forEach(t => { if (!t.classList.contains("code") && !/2×2/.test(t.textContent) && !t.classList.contains("ru") && t.textContent.trim() !== "") t.classList.add("nf-hide"); else if (t.classList.contains("ru")) t.classList.add("nf-hide"); });
        const mode = $(".rc-mode", top); mode.insertAdjacentHTML("afterend", `<span class="nf-pill">${PILL[st]}</span>`);
        const code = $(".tag.code", top); code.dataset.s7 = "copy"; code.dataset.v = r.code; code.title = "Копіювати код";
        const max = r.team2 ? 4 : 2;
        const nt = $(".mm-note", c); if (nt) Array.from(nt.childNodes).forEach(n => { if (n.nodeType === 3 && /гравців|глядачів/.test(n.textContent)) n.remove(); });      /* дубль: склад показує смуга місць */
        top.parentNode.insertBefore(Object.assign(document.createElement("div"), { className: "nf-seats", innerHTML: seatBar(r.players, max, "bar") + `<small>${r.players}/${max} гравців · ${r.specs | 0} глядачів</small>` }), top.nextSibling);
      }
    });
    /* інструменти */
    const sec = $(".mm-sec", sc);
    if (sec && !$(".nf-tools", sc) && (rooms.length || cards.length)){
      sec.insertAdjacentHTML("afterend", `<div class="nf-tools">${FLT.map(f => `<button class="nf-chip" data-nf="f" data-v="${f[0]}">${f[1]}<em></em></button>`).join("")}<input class="nf-q" type="search" placeholder="Код або командир…" autocomplete="off" aria-label="Пошук кімнати"></div>`);
      const q = $(".nf-q", sc); q.value = NF.q;
    }
    const cnt = { all: cards.length, t1: 0, t2: 0, open: 0, game: 0 };
    cards.forEach(c => { cnt[c.dataset.t2 === "1" ? "t2" : "t1"]++; if (c.dataset.st === "open") cnt.open++; if (c.dataset.st === "game") cnt.game++; });
    $$(".nf-chip", sc).forEach(b => { b.classList.toggle("on", b.dataset.v === NF.f); const e = $("em", b); if (e && e.textContent !== String(cnt[b.dataset.v])) e.textContent = cnt[b.dataset.v]; });
    applyFilter(sc);
    /* порожній стан */
    if (!cards.length){
      const n = $$(".mm-note", sc).find(x => !x.classList.contains("nf-uplink") && !x.classList.contains("nf-empty") && x.previousElementSibling && /mm-sec/.test(x.previousElementSibling.className));
      if (n){ n.classList.add("nf-empty"); n.insertAdjacentHTML("afterbegin", `<div class="nf-radar" aria-hidden="true"></div>`); }
    }
    dock(menu, cards);
  }
  function applyFilter(sc){
    const q = NF.q.trim().toLowerCase(); let vis = 0, all = 0;
    $$(".room-card", sc).forEach(c => {
      all++; const f = NF.f, ok = f === "all" || (f === "t1" && c.dataset.t2 === "0") || (f === "t2" && c.dataset.t2 === "1") || (f === "open" && c.dataset.st === "open") || (f === "game" && c.dataset.st === "game");
      const hit = ok && (!q || (c.textContent || "").toLowerCase().includes(q)); c.hidden = !hit; if (hit) vis++;
    });
    let none = $(".nf-none", sc);
    if (all && !vis){ if (!none){ const l = $$(".room-card", sc).pop(); l.insertAdjacentHTML("afterend", `<div class="mm-note nf-none">За цими умовами кімнат немає — змініть фільтр.</div>`); } }
    else if (none) none.remove();
  }

  /* ───────── док: огляд мережі → деталі кімнати ───────── */
  function dock(menu, cards){
    const acts = $("#mmActs"); if (!acts) return;
    let d = $(".nf-dock", acts); if (!d){ d = document.createElement("aside"); d.className = "nf-dock"; d.setAttribute("aria-live", "polite"); acts.appendChild(d); }
    const code = NF.cur, card = code && cards.find(c => c.dataset.code === code), r = code && roomOf(code);
    paintDock(d, card && r ? card : null, r);
  }
  function paintDock(d, card, r){
    const s = lob(), key = card ? card.dataset.code + "|" + r.players + "|" + r.status + "|" + (r.specs | 0) : "ov|" + (s.rooms || []).length + "|" + (s.online || []).length + "|" + (s.rooms || []).map(x => x.players + x.status).join();
    if (d.dataset.k === key) return; d.dataset.k = key;
    if (!card){
      const rooms = s.rooms || [], games = rooms.filter(x => x.status === "game").length, free = rooms.reduce((a, x) => a + (x.status === "game" ? 0 : Math.max(0, (x.team2 ? 4 : 2) - x.players)), 0), onl = (s.online || []).length;
      d.style.removeProperty("--st");
      d.innerHTML = `<small class="k">Огляд мережі</small><h4>Оперативна обстановка</h4><div class="big"><div><b>${onl}</b><span>Командирів онлайн</span></div><div class="y"><b>${rooms.length}</b><span>Публічних кімнат</span></div><div class="g"><b>${free}</b><span>Вільних місць</span></div><div class="r"><b>${games}</b><span>Боїв триває</span></div></div>` +
        `<div class="tip">Наведіть курсор на кімнату — тут з’являться склад, власник і швидкі дії. Приватну кімнату можна відкрити лише за кодом.</div>`;
      return;
    }
    const max = r.team2 ? 4 : 2, st = card.dataset.st, mid = $(".rc-mid", card).cloneNode(true), mode = $(".rc-mode", card).textContent;
    $$("button,.tag", mid).forEach(x => x.remove()); mid.className = "own";
    const join = $('[data-s7="rjoin"]', card), spec = $('[data-s7="rspec"]', card);
    d.style.setProperty("--st", STC[st]);
    d.innerHTML = `<small class="k">Кімната · ${r.team2 ? "2×2" : "1×1"}</small><h4>${esc(mode)}</h4><div class="code">${esc(r.code)}</div><div><span class="nf-pill" style="--st:${STC[st]}">${PILL[st]}</span></div>` +
      seatBar(r.players, max, "seat") + `<div class="nf-kv"><div>Гравці<b>${r.players}/${max}</b></div><div>Глядачі<b>${r.specs | 0}</b></div></div><div class="own">${mid.innerHTML}</div>` +
      `<div class="acts"><button data-nfp="join" ${!join || join.disabled ? "disabled" : ""}>Приєднатися</button><button class="ghost" data-nfp="spec" ${!spec || spec.disabled ? "disabled" : ""}>Дивитися як глядач</button></div>`;
  }

  /* ───────── екран «Кімната» ───────── */
  function roomPass(sc, menu){
    menu.classList.remove("nf-on");
    const cb = $(".codebig", sc);
    if (cb && !cb.dataset.nf){ const t = cb.textContent.trim(); cb.dataset.nf = t; cb.setAttribute("aria-label", t); cb.innerHTML = Array.from(t).map((c, i) => `<span class="nf-ch" style="--i:${i}">${esc(c)}</span>`).join(""); }
    if ($(".nf-vs", sc)) return;
    const sec = $(".mm-sec", sc); if (!sec) return;
    const isTh = x => x.matches(".mm-note") && x.firstElementChild && x.firstElementChild.matches(".tag.ua,.tag.ru");
    const els = []; let e = sec.nextElementSibling;
    while (e && !e.matches(".mm-sec") && !e.matches("button.s7b.big") && !(e.matches(".mm-note") && !isTh(e))){ els.push(e); e = e.nextElementSibling; }
    if (!els.some(x => x.matches(".slot"))) return;
    const G = { ua: [], ru: [] }, H = {}; let cur = null, idx = 0;
    els.forEach(x => {
      if (isTh(x)){ cur = x.firstElementChild.classList.contains("ua") ? "ua" : "ru"; H[cur] = x; }
      else if (x.matches(".slot")){ const side = cur || (x.classList.contains("ua") ? "ua" : x.classList.contains("ru") ? "ru" : idx === 0 ? "ua" : "ru"); G[side].push(x); idx++; }
    });
    const vs = document.createElement("div"); vs.className = "nf-vs";
    ["ua", "ru"].forEach((sd, i) => {
      const t = document.createElement("section"); t.className = "nf-team " + sd;
      const h = H[sd] || Object.assign(document.createElement("div"), { className: "mm-note", innerHTML: `<span class="tag ${sd}">${sd === "ua" ? "Україна" : "Росія"}</span>` });
      h.classList.add("nf-th"); h.removeAttribute("style"); t.appendChild(h); G[sd].forEach(x => t.appendChild(x)); vs.appendChild(t);
      if (i === 0) vs.insertAdjacentHTML("beforeend", `<div class="nf-vsb" aria-hidden="true">VS</div>`);
    });
    sec.parentNode.insertBefore(vs, sec.nextSibling);
  }

  /* ───────── головний прохід ───────── */
  let busy = false, raf = 0, mo = null;
  function pass(){
    const menu = $("#s7menu"), sc = $("#mmScroll"); if (!menu || !sc) return;
    busy = true; if (mo) mo.disconnect();
    const kind = $('.mm-acts-in [data-s7="rjoincode"]', sc) ? "list" : $(".codebig", sc) ? "room" : "";      /* анімація появи — лише при вході на екран, не при кожній перерисовці */
    if (kind && kind !== pass.kind){ menu.classList.add("nf-anim"); clearTimeout(pass.t); pass.t = setTimeout(() => menu.classList.remove("nf-anim"), 900); }
    pass.kind = kind;
    try {
      if ($('.mm-acts-in [data-s7="rjoincode"]', sc)) listPass(sc, menu);
      else if ($(".codebig", sc)) roomPass(sc, menu);
      else { menu.classList.remove("nf-on"); }
    } catch (err) { console.warn("netfront", err); }
    if (mo && menu) mo.observe(menu, { childList: true, subtree: true });
    busy = false;
  }
  function start(){
    const menu = $("#s7menu"); if (!menu) return false;
    mo = new MutationObserver(() => { if (busy) return; cancelAnimationFrame(raf); raf = requestAnimationFrame(pass); });
    mo.observe(menu, { childList: true, subtree: true }); pass(); return true;
  }
  if (!start()){ const w = new MutationObserver(() => { if (start()) w.disconnect(); }); w.observe(document.body, { childList: true }); }

  /* ───────── події ───────── */
  function setCur(card){
    const sc = $("#mmScroll"), code = card && (card.dataset.code || ($(".tag.code", card) || {}).textContent);
    if (!sc || !code || NF.cur === code) return; NF.cur = code;
    $$(".nf-cur", sc).forEach(x => x.classList.remove("nf-cur")); card.classList.add("nf-cur"); pass();
  }
  document.addEventListener("mouseover", e => { const c = e.target.closest && e.target.closest("#mmScroll .room-card"); if (c) setCur(c); });
  document.addEventListener("focusin", e => { const c = e.target.closest && e.target.closest("#mmScroll .room-card"); if (c) setCur(c); });
  document.addEventListener("click", e => {
    const b = e.target.closest && e.target.closest("[data-nf],[data-nfp]"); if (!b) return;
    const sc = $("#mmScroll");
    if (b.dataset.nf === "f"){ NF.f = b.dataset.v; pass(); return; }
    if (b.dataset.nfp){ const c = $(`.room-card[data-code="${NF.cur}"]`, sc), t = c && $(`[data-s7="${b.dataset.nfp === "join" ? "rjoin" : "rspec"}"]`, c); if (t && !t.disabled) t.click(); }
  });
  document.addEventListener("input", e => { if (!e.target.classList || !e.target.classList.contains("nf-q")) return; NF.q = e.target.value; const sc = $("#mmScroll"); if (sc) applyFilter(sc); });
  document.addEventListener("keydown", e => {
    if (e.key !== "Enter" || !e.target.classList || !e.target.classList.contains("room-card")) return;
    const j = $('[data-s7="rjoin"]', e.target); if (j && !j.disabled){ e.preventDefault(); j.click(); }
  });
})();
