/* SKYDOMINION — 150_adaptive.js · адаптация под экран и доводка модалок.
   Только наблюдает и ставит атрибуты/классы; игровой логики не трогает. Идемпотентно. */
(() => {
  "use strict";
  if (window.__SX_ADAPT) return; window.__SX_ADAPT = 1;
  const root = document.documentElement, body = () => document.body;
  const mq = q => { try { return matchMedia(q).matches; } catch (e) { return false; } };

  /* ---------- 1. Режим экрана ---------- */
  let kbBase = 0, raf = 0, last = "";
  function measure(){
    raf = 0;
    const vv = window.visualViewport;
    const w = Math.round(vv ? vv.width : innerWidth), vh = Math.round(vv ? vv.height + vv.offsetTop : innerHeight);
    const H = innerHeight, W = innerWidth;
    const land = W > H, short = Math.min(W, H) < 520 || H < 520;
    const coarse = mq("(pointer:coarse)") || mq("(hover:none)");
    const minSide = Math.min(W, H);
    /* телефон: короткая сторона < 600 css-px; планшет: до 1100 по длинной; иначе ПК */
    const dev = minSide < 600 ? "phone" : (coarse && Math.max(W, H) < 1400) || W < 1100 ? "tablet" : "desktop";
    /* клавиатура: видимая область заметно ниже окна (iOS/Android) */
    const kb = vv ? Math.max(0, Math.round(H - vv.height - vv.offsetTop)) : 0;
    const kbOn = kb > 120 && (coarse || dev !== "desktop") && /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || "");
    const a = { dev, orient: land ? "land" : "port", short: short ? "1" : "0", touch: coarse ? "1" : "0", kb: kbOn ? "1" : "0" };
    for (const k in a) if (root.dataset[k] !== a[k]) root.dataset[k] = a[k];
    root.style.setProperty("--vh", (vv ? Math.round(vv.height) : H) + "px");
    const gb = document.getElementById("gmBar");
    if (gb && gb.offsetParent){ const bb = Math.round(gb.getBoundingClientRect().bottom); if (bb > 0 && bb < H * .6) root.style.setProperty("--sx-bar", bb + "px"); }
    root.style.setProperty("--kb", (kbOn ? kb : 0) + "px");
    const sig = [W, H, dev, kbOn].join();
    if (sig !== last){ last = sig; window.dispatchEvent(new CustomEvent("sx:screen", { detail: { w: W, h: H, dev, land, short, coarse, kb: kbOn } })); }
  }
  const sched = () => { if (!raf) raf = requestAnimationFrame(measure); };
  measure();
  addEventListener("resize", sched); addEventListener("orientationchange", () => { sched(); setTimeout(sched, 350); });
  if (window.visualViewport){ visualViewport.addEventListener("resize", sched); visualViewport.addEventListener("scroll", sched); }
  try { matchMedia("(pointer:coarse)").addEventListener("change", sched); } catch (e) {}
  document.addEventListener("focusin", () => setTimeout(sched, 60)); setInterval(() => { if (!document.hidden) sched(); }, 1500); document.addEventListener("focusout", () => setTimeout(sched, 120));

  /* низкий экран: «Умовні позначення» по умолчанию свёрнуты — не закрывают карту (один раз, дальше выбор за игроком) */
  let legAuto = false;
  addEventListener("sx:screen", e => {
    if (e.detail.short && !legAuto){ const l = document.getElementById("legend"); if (l){ legAuto = true; l.classList.add("closed"); } }
  });
  setTimeout(() => { const d = { short: root.dataset.short === "1" }; if (d.short && !legAuto){ const l = document.getElementById("legend"); if (l){ legAuto = true; l.classList.add("closed"); } } }, 1500);

  /* ---------- 2. Окна: открыто/закрыто, блокировка прокрутки, фокус, aria ---------- */
  const ROOTS = "#s7mdl.on:not(.ig),#bcLayer.on,#bcShop.on,.bv2-dlg:not([hidden])";
  const isOpen = () => !!document.querySelector(ROOTS);
  let prevFocus = null, wasOpen = false;
  function decorate(){
    document.querySelectorAll("#s7mdl.on:not(.ig) .mdl,#bcLayer.on .bc-dlg,.bv2-dlg:not([hidden]) .bv2-dbox").forEach(d => {
      if (d.dataset.sx) return; d.dataset.sx = "1";
      d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true");
      const h = d.querySelector("h1,h2,h3,[id$='dt']"); if (h){ if (!h.id) h.id = "sxT" + Math.random().toString(36).slice(2, 7); d.setAttribute("aria-labelledby", h.id); }
      d.tabIndex = -1; d.classList.add("sx-modal-root");
      /* фокус на первое действие (не на «закрыть») — только если фокус ещё не внутри */
      if (!d.contains(document.activeElement)){
        const f = d.querySelector("input:not([type=hidden]),textarea,.foot button,.bc-dft button,.bv2-dact button:last-child") ||
                  d.querySelector("button:not(.mdl-x):not(.bc-x)");
        /* на телефоне не фокусируем текстовые поля сами — не выезжает клавиатура */
        try { (f && !(root.dataset.touch === "1" && /^(INPUT|TEXTAREA)$/.test(f.tagName)) ? f : d).focus({ preventScroll: true }); } catch (e) {}
      }
    });
  }
  function sync(){
    const o = isOpen();
    if (o && !wasOpen){ prevFocus = document.activeElement; }
    body().classList.toggle("modal-open", o);
    if (o) decorate();
    if (!o && wasOpen){ const p = prevFocus; prevFocus = null; if (p && p.isConnected && p !== document.body){ try { p.focus({ preventScroll: true }); } catch (e) {} } }
    wasOpen = o;
  }
  const mo = new MutationObserver(() => { clearTimeout(sync._t); sync._t = setTimeout(sync, 16); });
  function watch(){
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden"] });
    sync();
  }
  if (document.body) watch(); else addEventListener("DOMContentLoaded", watch);

  /* ---------- 3. Esc, фон, Tab-ловушка для окон магазина и подтверждений ---------- */
  document.addEventListener("keydown", e => {
    if (e.key === "Escape"){
      const bc = document.querySelector("#bcLayer.on [data-bc='dlgx']");
      if (bc){ bc.click(); e.stopPropagation(); e.preventDefault(); return; }
    }
    if (e.key !== "Tab") return;
    const d = document.querySelector("#bcLayer.on .bc-dlg,.bv2-dlg:not([hidden]) .bv2-dbox"); if (!d) return;
    const f = [...d.querySelectorAll("button,input,select,textarea,a[href],[tabindex]:not([tabindex='-1'])")].filter(x => !x.disabled && x.offsetParent);
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0){ e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && (i === -1 || i === f.length - 1)){ e.preventDefault(); f[0].focus(); }
  }, true);
  document.addEventListener("click", e => {     // тап по затемнению закрывает окно магазина
    const l = e.target; if (l && l.id === "bcLayer" && l.classList.contains("on")){ const x = l.querySelector("[data-bc='dlgx']"); x && x.click(); }
  });

  /* ---------- 4. Свайп вниз закрывает окно магазина (телефон, портрет) ---------- */
  let sw = null;
  document.addEventListener("pointerdown", e => {
    if (root.dataset.dev !== "phone" || root.dataset.orient !== "port" || e.button > 0) return;
    const d = e.target.closest("#bcLayer .bc-dlg"); if (!d || e.target.closest("button,input,select,textarea,a,.ct-stagew")) return;
    if (d.scrollTop > 0) return;
    sw = { d, y: e.clientY, dy: 0 }; d.style.transition = "none";
  });
  document.addEventListener("pointermove", e => {
    if (!sw) return; sw.dy = Math.max(0, e.clientY - sw.y);
    sw.d.style.translate = "0 " + sw.dy + "px"; sw.d.style.opacity = String(1 - Math.min(sw.dy / 420, .5));
  });
  const end = () => {
    if (!sw) return; const { d, dy } = sw; sw = null; d.style.transition = "translate .2s,opacity .2s";
    if (dy > 110){ const x = d.querySelector("[data-bc='dlgx']"); x && x.click(); } else { d.style.translate = ""; d.style.opacity = ""; }
  };
  document.addEventListener("pointerup", end); document.addEventListener("pointercancel", end);

  /* ---------- 5. Поле ввода не прячется под клавиатурой ---------- */
  document.addEventListener("focusin", e => {
    const t = e.target; if (!t || !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || !t.closest("#s7mdl,#bcLayer,#bcShop")) return;
    setTimeout(() => { try { t.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (x) {} }, 280);
  });
})();
