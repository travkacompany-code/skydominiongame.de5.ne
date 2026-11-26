
/* SKYDOMINION · 217 · зв'язок із командним пунктом (етап 6, зв'язок).
   Правило: зв'язок КП із підпорядкованими системами втрачається, якщо противник двічі вдарив поблизу:
     • самого КП (у радіусі CP_KM), або
     • установки (системи ППО) цього КП (у радіусі UNIT_KM) — лічильник на кожну установку.
   Після втрати зв'язку системи продовжують свої останні накази, але нові накази їм не приймаються
   (HOOKS.adBlock), як і нові розміщення з такого КП. Відновлення — через RESTORE_MS без нових влучань.
   Попадання беруться з HOOKS.fx (те саме, що малює вибух на мапі). Лише для поведінки гри,
   без нової графіки. Конфігурація: window.BV_LINK_CFG (для тестів). */
(function boot() {
  "use strict";
  if (window.BV_LINK) return;
  const H = window.BV_DND_HOST;
  if (!H || !H.HOOKS || !H.HOOKS.fx || !window.BV_QUICK || !window.BV_QUICK_UI) return setTimeout(boot, 200);
  window.BV_LINK = {};

  const CFG = Object.assign({ CP_KM: 15, UNIT_KM: 3, HITS: 2, RESTORE_MS: 120000 }, window.BV_LINK_CFG || {});
  const HOOKS = H.HOOKS;
  const toast = m => { if (H.toast) H.toast(m); };
  const dkm = (a, b) => { const kx = 111.32 * Math.cos(a[1] * Math.PI / 180); return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 110.574); };

  /* стан: по назві КП */
  const POSTS = new Map();                       // name → { lost, hits: [], since, unitHits: Map(id→n), side }
  const post = name => { if (!POSTS.has(name)) POSTS.set(name, { lost: false, hits: 0, unitHits: new Map(), t: 0 }); return POSTS.get(name); };
  const ownPosts = () => (H.posts ? H.posts() : []);

  function lose(name, why){
    const P = post(name); if (P.lost) return;
    P.lost = true; P.t = performance.now(); P.hits = 0; P.unitHits.clear();
    toast(`Втрачено зв'язок з КП «${name}»: ${why}`);
  }
  function restore(name){
    const P = post(name); if (!P.lost) return;
    P.lost = false; P.hits = 0; P.unitHits.clear();
    toast(`Зв'язок з КП «${name}» відновлено`);
  }

  /* попадання: рахуємо лише близькі до КП або до його установок */
  function onHit(p){
    if (!Array.isArray(p) || p.length < 2) return;
    const now = performance.now();
    for (const cp of ownPosts()){
      const P = post(cp.n);
      if (dkm(cp.c, p) <= CFG.CP_KM){
        P.hits++; P.t = now;
        if (!P.lost && P.hits >= CFG.HITS) lose(cp.n, `двічі влучили поблизу КП`);
      }
    }
    for (const u of window.BV_QUICK.list()){
      if (!u.pos || !u.post || dkm(u.pos, p) > CFG.UNIT_KM) continue;
      const P = post(u.post);
      const n = (P.unitHits.get(u.id) || 0) + 1; P.unitHits.set(u.id, n);
      if (!P.lost && n >= CFG.HITS) lose(u.post, `двічі влучили поблизу установки «${u.name}»`);
    }
  }

  /* відновлення після тиші */
  setInterval(() => {
    const now = performance.now();
    for (const [name, P] of POSTS) if (P.lost && now - P.t >= CFG.RESTORE_MS) restore(name);
  }, 1000);

  /* перехоплення попадань: HOOKS.fx лишається як був, ми лише підглядаємо */
  const prevFx = HOOKS.fx;
  HOOKS.fx = function (p, k, cls){
    try { onHit(p); } catch (_) {}
    return prevFx ? prevFx.apply(this, arguments) : undefined;
  };

  /* блокування наказів системам без зв'язку */
  const ORDER_OPS = new Set(["move", "airCmd", "airAtk", "rtb", "mode", "reload", "prio", "skip", "skipAll", "loadout", "manual", "remove", "alert", "add"]);
  HOOKS.adBlock = (op, a) => {
    if (op === "place" && a && a.post){
      return POSTS.get(a.post) && POSTS.get(a.post).lost ? `Зв'язок з КП «${a.post}» втрачено — розміщення неможливе` : null;
    }
    if (ORDER_OPS.has(op) && a && a.id != null){
      const u = window.BV_QUICK.list().find(x => x.id === a.id);
      const P = u && u.post && POSTS.get(u.post);
      if (P && P.lost) return `${u.name}: зв'язок з КП «${u.post}» втрачено — наказ не прийнято`;
    }
    return null;
  };

  window.BV_LINK = {
    lost: name => !!(POSTS.get(name) && POSTS.get(name).lost),
    text: name => { const P = POSTS.get(name); return !P ? "зв'язок: є" : P.lost ? "зв'язок: ВТРАЧЕНО" : `зв'язок: є · влучань поблизу: ${P.hits}`; },
    hit: onHit,                                    // для тестів
    cfg: CFG,
  };
})();
