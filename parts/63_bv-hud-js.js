
/* SKYDOMINION · 225 · tactical HUD (ландшафт).
   Надстройка над существующим интерфейсом, игровой логики не содержит:
   • левый dock дублирует кнопки верхней панели (#gbBtns) и «ПУ» — нажатие вызывает штатную кнопку;
   • в правый стек (#controls) добавлены «Легенда» и «Полный экран»;
   • нижний журнал событий собирает сообщения из #toast и #bgNote (MutationObserver), координаты карты — в его заголовке.
   Всё пересоздаётся/синхронизируется без вмешательства в код игры. */
(function () {
  "use strict";
  if (window.BV_HUD) return;
  window.BV_HUD = true;
  const $ = id => document.getElementById(id);
  const body = document.body;
  const NS = "http://www.w3.org/2000/svg";
  const IC = {
    menu: "M4 7h16M4 12h16M4 17h16",
    phone: "M8 3h8a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 16 21H8a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 8 3zM11 18h2",
    dip: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z",
    stat: "M5 20V10M12 20V4M19 20v-7",
    surr: "M6 21V4M6 5h11l-2 4 2 4H6",
    chat: "M4 5h16v11H9l-5 4z",
    leg: "M5 6h2M10 6h9M5 12h2M10 12h9M5 18h2M10 18h9",
    fs: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
    fs2: "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5",
    gen: "M12 8v4M12 16h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
    chev: "M6 9l6 6 6-6",
    left: "M15 6l-6 6 6 6"
  };
  function svg(d, cls) {
    const s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); if (cls) s.setAttribute("class", cls);
    const p = document.createElementNS(NS, "path"); p.setAttribute("d", d); s.appendChild(p); return s;
  }
  const iconFor = key => /menu/.test(key) ? "menu" : /phone/.test(key) ? "phone" : /^dip/.test(key) ? "dip" : /stat/.test(key) ? "stat" : /surr/.test(key) ? "surr" : /chat/.test(key) ? "chat" : "gen";

  /* ---------- левый dock ---------- */
  const dock = document.createElement("nav");
  dock.id = "hudDock"; dock.setAttribute("aria-label", "Панель команд");
  const fold = document.createElement("button");
  fold.id = "hudDockFold"; fold.type = "button"; fold.setAttribute("aria-label", "Згорнути панель команд"); fold.title = "Згорнути / розгорнути панель";
  fold.appendChild(svg(IC.left));
  fold.addEventListener("click", () => {
    const off = body.classList.toggle("hud-dock-off");
    fold.setAttribute("aria-label", off ? "Розгорнути панель команд" : "Згорнути панель команд");
    try { localStorage.setItem("hudDockOff", off ? "1" : "0"); } catch (e) { /* */ }
  });
  try { if (localStorage.getItem("hudDockOff") === "1") body.classList.add("hud-dock-off"); } catch (e) { /* */ }
  body.append(dock, fold);

  let dockSig = "";
  const srcSel = k => k.t === "s" ? '#gbBtns [data-s7="' + k.v + '"]' : k.t === "d" ? "#gbBtns [data-dip]" : "#telFab";
  function gather() {
    const keys = [];
    document.querySelectorAll("#gbBtns > button").forEach(b => {
      const s = b.dataset.s7, dp = b.hasAttribute("data-dip");
      if (s === "gmready" || s === "gmpause") return;
      if (dp) keys.push({ t: "d", v: "dip", tip: (b.title || b.textContent).trim(), label: b.textContent.trim(), icon: "dip" });
      else if (s) keys.push({ t: "s", v: s, tip: (b.title || b.textContent).trim(), label: b.textContent.trim(), icon: iconFor(s) });
    });
    const fab = $("telFab");
    if (fab && fab.style.display !== "none") keys.push({ t: "f", v: "tel", tip: (fab.title || "ПУ").trim(), label: "ПУ", icon: "" });
    return keys;
  }
  function syncDock() {
    if (!body.classList.contains("s7-game")) return;
    const keys = gather(), sig = keys.map(k => k.t + k.v).join("|");
    if (sig !== dockSig) {
      dockSig = sig; dock.textContent = "";
      keys.forEach((k, i) => {
        if (k.v === "gmsurr" && i) { const sp = document.createElement("i"); sp.className = "hd-sep"; dock.appendChild(sp); }
        const b = document.createElement("button");
        b.type = "button"; b.className = "hd-b" + (k.v === "gmsurr" ? " warn" : ""); b.dataset.k = k.t + ":" + k.v;
        b.setAttribute("aria-label", k.tip); b.title = k.tip; b.dataset.tip = k.label.replace(/^[^\p{L}\p{N}]+/u, "") || k.tip;
        if (k.icon) b.appendChild(svg(IC[k.icon])); else { const t = document.createElement("span"); t.className = "hd-t"; t.textContent = k.label.slice(0, 3); b.appendChild(t); }
        dock.appendChild(b);
      });
    }
    keys.forEach(k => {
      const src = document.querySelector(srcSel(k)), b = dock.querySelector('[data-k="' + k.t + ":" + k.v + '"]');
      if (src && b) b.classList.toggle("on", src.classList.contains("on") || src.classList.contains("act") || src.getAttribute("aria-pressed") === "true");
    });
  }
  dock.addEventListener("click", e => {
    const b = e.target.closest(".hd-b"); if (!b) return;
    const [t, v] = b.dataset.k.split(":");
    const src = document.querySelector(srcSel({ t, v })); if (src) src.click();
    setTimeout(syncDock, 60);
  });

  /* ---------- правый стек: легенда и полный экран ---------- */
  function ensureRight() {
    const c = $("controls"); if (!c || $("hudRight")) return;
    const wrap = document.createElement("div"); wrap.id = "hudRight";
    const sep = document.createElement("i"); sep.className = "hr-sep";
    const mk = (id, d, tip) => { const b = document.createElement("button"); b.type = "button"; b.id = id; b.className = "hr-b"; b.title = tip; b.setAttribute("aria-label", tip); b.dataset.tip = tip; b.appendChild(svg(d)); return b; };
    const leg = mk("hudLeg", IC.leg, "Умовні позначення");
    leg.addEventListener("click", () => {
      const on = body.classList.toggle("hud-leg"); leg.classList.toggle("on", on);
      const L = $("legend"); if (L && on) L.classList.remove("closed");
    });
    wrap.append(sep, leg);
    if (document.documentElement.requestFullscreen) {
      const fs = mk("hudFs", IC.fs, "Повний екран");
      fs.addEventListener("click", () => {
        try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => {}); } catch (e) { /* */ }
      });
      document.addEventListener("fullscreenchange", () => {
        const on = !!document.fullscreenElement; fs.classList.toggle("on", on); fs.textContent = ""; fs.appendChild(svg(on ? IC.fs2 : IC.fs));
      });
      wrap.appendChild(fs);
    }
    c.appendChild(wrap);
  }

  /* ---------- журнал событий ---------- */
  const log = document.createElement("section");
  log.id = "hudLog"; log.setAttribute("aria-label", "Журнал подій");
  log.innerHTML = '<button type="button" class="hl-h" aria-expanded="false" aria-controls="hudLogBody"><svg class="hl-ch" viewBox="0 0 24 24" aria-hidden="true"><path d="' + IC.chev + '"/></svg>' +
    '<span class="hl-ttl">Журнал</span><span class="hl-last" id="hlLast"></span><span class="hl-badge" id="hlBadge">0</span><span class="hl-co" id="hlCo"></span></button>' +
    '<div class="hl-body" id="hudLogBody" role="log" aria-live="off"></div><div class="hl-tools"><button type="button" class="hl-clr">Очистити</button></div>';
  body.appendChild(log);
  const head = log.querySelector(".hl-h"), lb = $("hudLogBody"), last = $("hlLast"), badge = $("hlBadge"), co = $("hlCo");
  const MAX = 150; let items = [], unread = 0;
  const clock = () => { const c = $("gbClock"); const m = c && /\d{1,2}:\d{2}/.exec(c.textContent); return m ? m[0] : ""; };
  const row = it => {
    const r = document.createElement("div"); r.className = "hl-r k-" + it.k;
    const tm = document.createElement("time"); tm.textContent = it.t;
    const sp = document.createElement("span"), d = document.createElement("i"); sp.appendChild(d); sp.appendChild(document.createTextNode(it.x));
    if (it.n > 1) { const e = document.createElement("em"); e.textContent = "×" + it.n; sp.appendChild(e); }
    r.append(tm, sp); return r;
  };
  function renderLast() {
    const it = items[items.length - 1];
    last.textContent = ""; last.className = "hl-last" + (it ? " k-" + it.k : "");
    if (!it) { last.textContent = "Подій поки немає"; return; }
    const d = document.createElement("i"); last.appendChild(d); last.appendChild(document.createTextNode((it.t ? it.t + "  " : "") + it.x));
  }
  function renderAll() {
    lb.textContent = "";
    if (!items.length) { const e = document.createElement("div"); e.className = "hl-empty"; e.textContent = "Подій поки немає."; lb.appendChild(e); }
    else items.forEach(it => lb.appendChild(row(it)));
    lb.scrollTop = lb.scrollHeight;
  }
  let lastAt = 0;
  function add(x, k) {
    x = String(x || "").replace(/\s+/g, " ").trim(); if (!x) return;
    k = /^(alert|warn|ok|info)$/.test(k) ? k : "info";
    const now = performance.now(), p = items[items.length - 1];
    if (p && p.x === x && now - lastAt < 2500) { p.n++; lastAt = now; renderLast(); if (log.classList.contains("open")) renderAll(); return; }
    lastAt = now;
    items.push({ x, k, t: clock(), n: 1 }); if (items.length > MAX) items.shift();
    renderLast();
    if (log.classList.contains("open")) { const r = row(items[items.length - 1]); r.classList.add("new"); const e = lb.querySelector(".hl-empty"); if (e) e.remove(); lb.appendChild(r); while (lb.children.length > MAX) lb.firstChild.remove(); lb.scrollTop = lb.scrollHeight; }
    else { unread++; badge.textContent = unread > 99 ? "99+" : unread; log.classList.add("has-new"); }
  }
  function setOpen(on) {
    log.classList.toggle("open", on); head.setAttribute("aria-expanded", String(on)); lb.setAttribute("aria-live", on ? "polite" : "off");
    if (on) { unread = 0; log.classList.remove("has-new"); renderAll(); }
  }
  head.addEventListener("click", () => setOpen(!log.classList.contains("open")));
  log.querySelector(".hl-clr").addEventListener("click", () => { items = []; renderLast(); renderAll(); });
  renderLast();
  document.addEventListener("keydown", e => { if (e.key === "Escape" && log.classList.contains("open") && !document.querySelector("#s7mdl.on")) setOpen(false); });

  const toastEl = $("toast");
  if (toastEl) new MutationObserver(() => {
    if (toastEl.style.display === "none") return;
    const tx = toastEl.querySelector(".ts-tx"); if (!tx || !tx.textContent) return;
    const m = /\bk-(alert|warn|ok|info|lock)\b/.exec(toastEl.className);
    add(tx.textContent, m ? (m[1] === "lock" ? "warn" : m[1]) : "info");
  }).observe(toastEl, { childList: true, subtree: true });
  let noteObs = null;
  function hookNote() {
    const n = $("bgNote"); if (!n || noteObs) return;
    noteObs = new MutationObserver(() => {
      const tx = n.querySelector(".bn-tx"), nm = n.querySelector(".bn-t b"); if (!tx || !tx.textContent) return;
      add((nm ? nm.firstChild && nm.firstChild.textContent + ": " : "") + tx.textContent, "info");
    });
    noteObs.observe(n, { childList: true });
  }

  /* ---------- координаты в заголовке журнала ---------- */
  function syncCoords() {
    const a = $("cLat"), b = $("cLon"), z = $("cZ"); if (!a || !b || !z) return;
    const f = s => (s.textContent.match(/-?\d+(?:[.,]\d+)?/) || ["—"])[0].replace(",", ".");
    const t = a.textContent === "—" ? "" : f(a).slice(0, 7) + "  " + f(b).slice(0, 7) + "  ×" + f(z);
    if (co.textContent !== t) co.textContent = t;
  }

  /* ---------- общий цикл синхронизации ---------- */
  const gb = $("gbBtns");
  if (gb) new MutationObserver(() => requestAnimationFrame(syncDock)).observe(gb, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  setInterval(() => { ensureRight(); hookNote(); syncDock(); syncCoords(); if (!body.classList.contains("s7-game")) body.classList.remove("hud-leg"); }, 500);
  ensureRight(); syncDock();
})();
