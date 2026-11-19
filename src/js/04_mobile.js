/* SKYDOMINION — мобільні шторки: тап по заголовку панелі згортає її до смужки («peek»), щоб бачити карту.
   Працює для панелей пусків, ППО, заводу й логістики; на ПК нічого не робить. */
(() => {
  const IDS = ["launch", "adp", "facp", "lgp"];
  const narrow = () => window.innerWidth < 700;
  document.addEventListener("click", e => {
    if (!narrow()) return;
    const h = e.target.closest && e.target.closest(".lp-head");
    if (!h || e.target.closest("button,a,input,select,label")) return;
    const p = h.parentElement;
    if (p && IDS.includes(p.id)) p.classList.toggle("peek");
  }, true);
  const obs = new MutationObserver(ms => ms.forEach(m => {
    const p = m.target;
    if (p.classList.contains("peek") && !p.classList.contains("open") && !p.classList.contains("on")) p.classList.remove("peek");
  }));
  const arm = () => IDS.forEach(id => { const p = document.getElementById(id); if (p) obs.observe(p, { attributes: true, attributeFilter: ["class"] }); });
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", arm) : arm();
})();
