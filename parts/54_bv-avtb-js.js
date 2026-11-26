
/* SKYDOMINION · 215 · панель авіації ПВО: вбудований рядок інструментів (рамка, маршрути).
   Кнопки «▭ Рамка» (200_group.js) і «⟶ Маршрути» (210_routes.js) не плавають над грою, а переносяться
   в панель #adp, коли відкрито авіацію ППО. Перенос — лише DOM; логіку кнопок модулі не змінюють. */
(function boot() {
  "use strict";
  if (window.BV_AVTB) return;
  const adp = document.getElementById("adp");
  const mseld = document.getElementById("mselBtn"), rt = document.getElementById("rtBtn"), rp = document.getElementById("rtPanel");
  if (!adp || !mseld || !rt || !rp || !window.BV_AP) return setTimeout(boot, 150);
  window.BV_AVTB = true;

  const tb = document.createElement("div");
  tb.id = "avToolbar"; tb.setAttribute("role", "toolbar"); tb.setAttribute("aria-label", "Інструменти авіації");
  const body = document.createElement("div");
  body.id = "avBody";
  const wrap = document.createElement("div"); wrap.id = "avWrap"; wrap.classList.add("fold");
  /* кнопка-згортка: усі допоміжні блоки авіації за замовчуванням згорнуті, щоб не витісняти кнопки розміщення */
  const fold = document.createElement("button");
  fold.type = "button"; fold.id = "avFold"; fold.setAttribute("aria-expanded", "false");
  const setFold = v => { wrap.classList.toggle("fold", v); fold.setAttribute("aria-expanded", String(!v)); fold.textContent = (v ? "▸ " : "▾ ") + "Інструменти авіації"; };
  fold.addEventListener("click", () => { setFold(!wrap.classList.contains("fold")); schedule(); });
  setFold(true);
  wrap.append(fold, tb, body);

  function isAir(){
    const A = window.BV_AP;
    if (A.mode === "air" || A.atab === "air") return true;
    const sel = window.BV_QUICK && window.BV_QUICK.list().find(x => x.sel);
    return !!(sel && sel.air);
  }

  let scheduled = false;
  function place(){
    scheduled = false;
    const head = adp.querySelector("#adHead");
    if (!wrap.isConnected || wrap.parentElement !== adp){
      if (head) head.after(wrap); else adp.insertBefore(wrap, adp.firstChild);
    } else if (head && head.nextElementSibling !== wrap){
      head.after(wrap);
    }
    if (mseld.parentElement !== tb) tb.appendChild(mseld);
    if (rt.parentElement !== tb) tb.appendChild(rt);
    if (rp.parentElement !== body) body.appendChild(rp);
    const on = adp.classList.contains("open") && isAir();
    if (wrap.hidden !== !on) wrap.hidden = !on;
    const routesOpen = !rp.hidden;
    if (body.hidden !== !routesOpen) body.hidden = !routesOpen;
  }
  const schedule = () => { if (!scheduled){ scheduled = true; requestAnimationFrame(place); } };

  new MutationObserver(schedule).observe(adp, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  rt.addEventListener("click", () => setTimeout(schedule, 0));
  mseld.addEventListener("click", schedule);
  (window.BV_PERF ? BV_PERF.ui(schedule, 600) : setInterval(schedule, 600));
  schedule();
})();
