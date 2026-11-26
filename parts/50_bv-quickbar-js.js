
/* SKYDOMINION · 180 · швидкий доступ до техніки — компактна іконка (як перемикач шарів мапи).
   Іконка з лічильником у правому нижньому куті; клік розгортає список техніки, повторний клік / Esc /
   клік поза списком — згортає. Дані — window.BV_QUICK (tools/quick_glue.js). */
(function boot() {
  "use strict";
  if (window.BV_QUICK_UI) return;
  if (!window.BV_QUICK) return setTimeout(boot, 150);
  window.BV_QUICK_UI = true;

  const STATE = { patrol: "патрулювання", base: "на базі", reload: "перезарядка", rtb: "повернення", transit: "перехід", engage: "бій" };

  const toggle = document.createElement("button");
  toggle.type = "button"; toggle.id = "qkToggle"; toggle.hidden = true;
  toggle.setAttribute("aria-label", "Швидкий доступ до техніки"); toggle.setAttribute("aria-expanded", "false");
  toggle.title = "Швидкий доступ до техніки";
  toggle.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="3" y="3" width="7.5" height="7.5" rx="1.2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.2"/></svg><span class="qk-n">0</span>';
  document.body.appendChild(toggle);

  const bar = document.createElement("div");
  bar.id = "qkBar"; bar.hidden = true;
  bar.setAttribute("role", "toolbar"); bar.setAttribute("aria-label", "Швидкий доступ до техніки");
  document.body.appendChild(bar);

  let open = false;
  function setOpen(v){
    open = v && !bar.hidden;
    bar.classList.toggle("open", open);
    toggle.classList.toggle("on", open);
    toggle.setAttribute("aria-expanded", String(open));
  }
  toggle.addEventListener("click", () => setOpen(!open));
  document.addEventListener("pointerdown", e => {
    if (!open) return;
    if (bar.contains(e.target) || toggle.contains(e.target)) return;
    setOpen(false);
  }, true);
  document.addEventListener("keydown", e => { if (open && e.key === "Escape"){ e.preventDefault(); setOpen(false); toggle.focus(); } }, true);

  let sig = "";
  function render(){
    const list = window.BV_QUICK.list();
    const s = JSON.stringify(list.map(x => [x.id, x.mag, x.reserve, x.state, x.sel, x.grp, x.dmg]));
    toggle.querySelector(".qk-n").textContent = String(list.length);
    toggle.hidden = list.length === 0;
    if (list.length === 0) setOpen(false);
    if (s === sig) return;
    sig = s;
    bar.hidden = list.length === 0;
    bar.textContent = "";
    for (const x of list){
      const b = document.createElement("button");
      b.type = "button"; b.className = "qk-u" + (x.sel ? " on" : "") + (x.grp ? " grp" : "");
      b.dataset.id = String(x.id);
      b.setAttribute("aria-pressed", String(x.sel));
      b.title = `${x.name}: ${STATE[x.state] || x.state || "—"} · боєкомплект ${x.mag}` + (x.reserve ? ` · резерв ${x.reserve}` : "");
      const n = document.createElement("b"); n.textContent = x.name;
      const m = document.createElement("small"); m.textContent = `${STATE[x.state] || "—"} · ${x.mag}` + (x.reserve ? ` +${x.reserve}` : "") + (x.dmg === 3 ? " · ремонт" : x.dmg === 2 ? " · КРИТ." : x.dmg === 1 ? " · пошк." : "");
      b.append(n, m);
      b.addEventListener("click", e => {          // Ctrl/⌘ — до підрозділу; звичайний — один вибір
        if (e.ctrlKey || e.metaKey){ window.BV_QUICK.group.toggle(x.id); sig = ""; render(); return; }
        window.BV_QUICK.group.clear(); window.BV_QUICK.focus(x.id); setOpen(false);
      });
      bar.appendChild(b);
    }
    setOpen(open);
  }
  (window.BV_PERF ? BV_PERF.ui(render, 400) : setInterval(render, 400));
  render();
})();
