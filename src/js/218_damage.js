/* SKYDOMINION · 218 · пошкодження й ремонт техніки ППО (етап 3).
   • Попадання поблизу установки (CFG.NEAR_KM) — пошкодження: 1–2 влучання → «пошкоджено»,
     з CFG.CRIT_HITS → «критично». Джерело — той самий хук HOOKS.fx, що й у зв'язку КП.
   • Ремонт — наказ «Ремонтувати»: займає CFG.REPAIR_MS, після чого система знову справна.
   • Неісправна (критично або під ремонтом) система не приймає нові накази (HOOKS.adBlock).
   Обмеження: бойова логіка ядра не змінена — пошкоджена техніка продовжує стріляти й рухатися,
   доки її не зупинено наказом. Окремого обліку вантажу/мастерських тут немає. */
(function boot() {
  "use strict";
  if (window.BV_DMG) return;
  const H = window.BV_DND_HOST;
  if (!H || !H.HOOKS || !H.HOOKS.fx || !window.BV_QUICK || !window.BV_QUICK_UI || !window.BV_LINK) return setTimeout(boot, 200);

  const CFG = Object.assign({ NEAR_KM: 1.5, CRIT_HITS: 3, REPAIR_MS: 60000 }, window.BV_DMG_CFG || {});
  const HOOKS = H.HOOKS;
  const toast = m => { if (H.toast) H.toast(m); };
  const dkm = (a, b) => { const kx = 111.32 * Math.cos(a[1] * Math.PI / 180); return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 110.574); };
  const ST = new Map();                       // id → { hits, until }

  const get = id => { if (!ST.has(id)) ST.set(id, { hits: 0, until: 0 }); return ST.get(id); };
  /* 0 — справна · 1 — пошкоджено · 2 — критично · 3 — ремонт триває */
  function level(id){
    const s = ST.get(id); if (!s) return 0;
    if (s.until > performance.now()) return 3;
    if (s.hits >= CFG.CRIT_HITS) return 2;
    return s.hits > 0 ? 1 : 0;
  }

  function onHit(p){
    if (!Array.isArray(p) || p.length < 2) return;
    for (const u of window.BV_QUICK.list()){
      if (!u.pos || dkm(u.pos, p) > CFG.NEAR_KM) continue;
      const s = get(u.id);
      const was = level(u.id);
      s.hits++;
      const now = level(u.id);
      if (now === 1 && was === 0) toast(`${u.name} пошкоджено`);
      if (now === 2 && was !== 2) toast(`${u.name}: критичні пошкодження — нові накази не приймаються`);
    }
  }

  function repair(id){
    const u = window.BV_QUICK.list().find(x => x.id === id);
    if (!u) return false;
    const s = get(id), lv = level(id);
    if (lv === 0 || lv === 3) return false;
    s.until = performance.now() + CFG.REPAIR_MS;
    toast(`${u.name}: ремонт — ${Math.round(CFG.REPAIR_MS / 1000)} с`);
    return true;
  }

  /* завершення ремонту і очищення записів знищеної техніки */
  setInterval(() => {
    const now = performance.now(), alive = new Set(window.BV_QUICK.list().map(x => x.id));
    for (const [id, s] of ST){
      if (!alive.has(id)) { ST.delete(id); continue; }
      if (s.until && s.until <= now){ s.until = 0; s.hits = 0; const u = window.BV_QUICK.list().find(x => x.id === id); if (u) toast(`${u.name}: ремонт завершено`); }
    }
  }, 500);

  /* хук попадань: ланцюжок із зв'язком КП (217 уже обгорнув HOOKS.fx) */
  const prevFx = HOOKS.fx;
  HOOKS.fx = function (p){ try { onHit(p); } catch (_) {} return prevFx ? prevFx.apply(this, arguments) : undefined; };

  /* блокування наказів у неісправної техніки — поверх блокування зв'язку */
  const prevBlock = HOOKS.adBlock;
  const ORDER_OPS = new Set(["move", "airCmd", "airAtk", "rtb", "mode", "reload", "prio", "skip", "skipAll", "loadout", "manual", "remove", "alert", "add"]);
  HOOKS.adBlock = (op, a) => {
    const prev = prevBlock ? prevBlock(op, a) : null;
    if (prev) return prev;
    if (ORDER_OPS.has(op) && a && a.id != null){
      const lv = level(a.id);
      if (lv === 2 || lv === 3){
        const u = window.BV_QUICK.list().find(x => x.id === a.id);
        return `${u ? u.name : "Система"}: ${lv === 3 ? "ремонт триває — наказ не прийнято" : "критичні пошкодження — ремонт потрібен"}`;
      }
    }
    return null;
  };

  window.BV_DMG = { level, repair, cfg: CFG, hit: onHit };
})();
