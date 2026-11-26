
/* SKYDOMINION · 220 · логістика: доставка боєкомплекту конвоєм (етап 1, перший зріз).
   Магазин виїжджає зі складу (BV_PROD) від КП, якому підпорядкована система, і їде до неї зі швидкістю
   CFG.KMS км/с. Під час руху склад уже списано. Після прибуття магазин додається в резерв (штатна «add»).
   • Конвой знищується, якщо противник влучив поблизу його поточної позиції (CFG.HIT_KM) — вантаж втрачено.
   • Відправка неможлива, якщо зв'язок із КП втрачено (217_link).
   Не змодельовано: дороги, вантажівки як окремі одиниці, пропускна здатність вузлів, резервні маршрути. */
(function boot() {
  "use strict";
  if (window.BV_LOG) return;
  const H = window.BV_DND_HOST;
  if (!H || !H.HOOKS || !H.HOOKS.fx || !window.BV_QUICK || !window.BV_QUICK_UI || !window.BV_PROD || !window.BV_LINK || !window.BV_DMG) return setTimeout(boot, 200);

  const CFG = Object.assign({ KMS: 3, HIT_KM: 2, MAX: 8 }, window.BV_LOG_CFG || {});
  const toast = m => { if (H.toast) H.toast(m); };
  const dkm = (a, b) => { const kx = 111.32 * Math.cos(a[1] * Math.PI / 180); return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 110.574); };
  const postOf = name => (H.posts() || []).find(p => p.n === name) || null;
  const CONV = [];                                    // { id, unit, key, from, to, km, t0, dur, state, label }
  let seq = 1;

  function send(id, key){
    const u = window.BV_QUICK.list().find(x => x.id === id);
    if (!u || !u.pos) return false;
    if (u.reserve === "inf") { toast("Нескінченний резерв — підвезення не потрібне"); return false; }
    const cp = postOf(u.post);
    if (!cp){ toast("Немає КП для постачання"); return false; }
    if (window.BV_LINK.lost(u.post)){ toast(`Зв'язок з КП «${u.post}» втрачено — конвой не відправити`); return false; }
    if (CONV.filter(c => c.state === "road").length >= CFG.MAX){ toast("Забагато конвоїв у дорозі"); return false; }
    if (window.BV_PROD.stock(key) < 1){ toast("Склад порожній: нічого відправляти"); return false; }
    const km = dkm(cp.c, u.pos);
    window.BV_PROD.take(key, 1);
    const c = { id: seq++, unit: id, key, from: cp.c.slice(), to: u.pos.slice(), km, t0: performance.now(), dur: Math.max(1, km / CFG.KMS) * 1000, state: "road", name: u.name, post: u.post };
    CONV.push(c);
    toast(`Конвой №${c.id} вирушив з КП «${u.post}» до ${u.name} · ≈ ${Math.round(c.dur / 1000)} с`);
    return true;
  }

  const posOf = c => { const t = Math.min(1, (performance.now() - c.t0) / c.dur); return [c.from[0] + (c.to[0] - c.from[0]) * t, c.from[1] + (c.to[1] - c.from[1]) * t]; };

  function onHit(p){
    if (!Array.isArray(p) || p.length < 2) return;
    for (const c of CONV){
      if (c.state !== "road") continue;
      if (dkm(posOf(c), p) <= CFG.HIT_KM){ c.state = "lost"; c.end = performance.now(); toast(`Конвой №${c.id} знищено — магазин втрачено`); }
    }
  }

  /* прибуття і прибирання старих записів */
  setInterval(() => {
    const now = performance.now();
    for (const c of CONV){
      if (c.state === "road" && now - c.t0 >= c.dur){
        const u = window.BV_QUICK.list().find(x => x.id === c.unit);
        if (!u){ c.state = "lost"; c.end = now; toast(`Конвой №${c.id}: техніка знищена — магазин повернуто на склад`); window.BV_PROD.give(c.key, 1); continue; }
        if (window.BV_QUICK.order(c.unit, "addMag", 1)){ c.state = "done"; c.end = now; toast(`Конвой №${c.id} прибув до ${c.name}: +1 магазин`); }
        else { c.state = "lost"; c.end = now; window.BV_PROD.give(c.key, 1); toast(`Конвой №${c.id}: резерв не прийнято — магазин повернуто на склад`); }
      }
    }
    for (let i = CONV.length - 1; i >= 0; i--) if (CONV[i].state !== "road" && CONV[i].end && now - CONV[i].end > 15000) CONV.splice(i, 1);
  }, 400);

  /* хук попадань: ланцюжок (217 → 218 → тут) */
  const prevFx = H.HOOKS.fx;
  H.HOOKS.fx = function (p){ try { onHit(p); } catch (_) {} return prevFx ? prevFx.apply(this, arguments) : undefined; };

  window.BV_LOG = {
    send, convoys: () => CONV.map(c => ({ id: c.id, state: c.state, name: c.name, pct: c.state === "road" ? Math.min(100, Math.round((performance.now() - c.t0) / c.dur * 100)) : 100, post: c.post })),
    cfg: CFG,
  };
})();
