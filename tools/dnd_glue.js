/* SKYDOMINION · 174 · клей Drag & Drop ↔ гра (етапи 1 і 5)
   Підключається всередині замикання гри (див. tools/apply_group.py). Нової ігрової логіки немає:
   кожна дія викликає ту саму функцію, що й звичайна панель, а перевірки — ті самі.
   Підтримувані картки (кроме ударів по противнику):
     ad  — наземна ППО (#adp · data-ad=key) → HOOKS.adCmd("place")
     rad — РЛС (#adp · data-ad=radpick)     → radarAdd (як клік по мапі в режимі вибору)
     ew  — РЕБ (#adp · data-ad=ewpick)      → ewAdd
     air — авіація ППО (#adp · .wcard akey) → HOOKS.adCmd("takeoff"): злітає з найближчого свого
           аеродрому, точка скидання — патрульна точка (ті самі правила, що в панелі).
   Не підтримуються: ракети (удари), мобільні ПУ балістики, кораблі ППО — лишаються кліком. */
(function () {
  "use strict";
  const ap = () => window.BV_AP || null;
  const side = T => (T && T.side) || "ua";
  const types = () => (typeof AD_TYPES !== "undefined" ? AD_TYPES : null);
  const typeOf = key => { const T = types(); return T ? T[key] || null : null; };
  const sideAt = () => { const A = ap(); return (A && A.post && A.post.side) || "ua"; };
  const landOK = (sd, p) => (sd === "ru" ? !!ruLand(p) : !!canPlaceAD(p));
  const sitesOf = sd => (window.BV_SITES || []).filter(s => (sd === "ru" ? s.t === "fighter" : s.t === "ua_air") && !s.off);
  const dkm = (a, b) => { const kx = 111.32 * Math.cos(a[1] * Math.PI / 180); return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 110.574); };
  function nearestSite(sd, p){ let best = null, bd = Infinity; for (const s of sitesOf(sd)){ const d = dkm(s.c, p); if (d < bd){ bd = d; best = s; } } return best ? { s: best, d: bd } : null; }
  function ammoFor(key, T){
    const A = ap();
    if (A && A.aammoInf && A.akey === key) return "inf";
    if (A && A.akey === key && (A.aammo | 0) > 0) return Math.max(1, A.aammo | 0);
    return Math.max(1, (T.mag || 1) * 3);
  }
  const say = m => { if (window.BV_DND_HOST && window.BV_DND_HOST.toast) window.BV_DND_HOST.toast(m); };
  const bad = msg => ({ ok: false, state: "bad", msg });
  const ewOwn = (sd, key) => typeof EW_STR === "undefined" || !EW_STR[sd] || EW_STR[sd].includes(key);   // станція — лише своєї сторони

  const dndAp = {
    zone(kind, key){
      try {
        if (kind === "ad"){ const T = typeOf(key); return T && !T.ship ? (p => !!HOOKS.canPlaceSide(T.side, p)) : null; }
        if (kind === "rad"){ const u = radBV().BYID[key]; return u ? (p => landOK(u.side, p)) : null; }
        if (kind === "ew"){ const sd = sideAt(); return EWSYS[key] ? (p => landOK(sd, p)) : null; }
        if (kind === "air"){ const T = typeOf(key); return T && !T.ship ? (p => typeof patrolOK === "function" ? !!patrolOK(side(T), p) : true) : null; }
      } catch (_) {}
      return null;
    },

    probe(kind, key, p){
      try {
        if (kind === "ad"){
          const T = typeOf(key); if (!T) return bad("Ця картка на мапу не ставиться");
          if (T.ship) return bad("Кораблі ППО ставляться з військового порту");
          const A = ap(); if (!A || !A.post) return bad("Спершу оберіть командний пункт");
          if (!HOOKS.canPlaceSide(T.side, p)) return bad(T.side === "ru" ? "ППО Росії — лише на її території або окупованій" : "ППО можна розмістити лише на підконтрольній Україні території");
          return { ok: true, state: "ok", label: `${T.n} · радіус ${String(T.r).replace(".", ",")} км`, ring: T.r };
        }
        if (kind === "rad"){
          const u = radBV().BYID[key]; if (!u) return bad("Невідома РЛС");
          if (!landOK(u.side, p)) return bad(u.side === "ru" ? "РЛС Росії — лише на її території або окупованій" : "РЛС можна розгорнути лише на підконтрольній Україні території");
          return { ok: true, state: "ok", label: `${u.name} · розгортання` };
        }
        if (kind === "ew"){
          const E = EWSYS[key]; if (!E) return bad("Невідома станція РЕБ");
          const sd = sideAt();
          if (!ewOwn(sd, key)) return bad("Ця станція РЕБ — іншої сторони");
          if (!landOK(sd, p)) return bad(sd === "ru" ? "РЕБ Росії — лише на її території або окупованій" : "РЕБ можна розгорнути лише на підконтрольній Україні території");
          return { ok: true, state: "ok", label: `${E.n} · розгортання ${E.rdy} с` };
        }
        if (kind === "air"){
          const T = typeOf(key); if (!T || T.ship) return bad("Ця система не злітає з мапи");
          const sd = side(T);
          if (typeof patrolOK === "function" && !patrolOK(sd, p)) return bad("Патрульна точка — лише над своєю територією або водами, поза запретною зоною");
          const n = nearestSite(sd, p); if (!n) return bad("Немає свого аеродрому");
          return { ok: true, state: "ok", label: `${T.n} → патрулювання · з «${n.s.n}» ≈ ${Math.round(n.d)} км`, ring: 0, from: n.s.c };
        }
      } catch (e) { return bad("Не вдалося перевірити точку"); }
      return bad("Ця картка на мапу не ставиться");
    },

    apply(kind, key, p){
      try {
        if (kind === "ad"){
          const T = typeOf(key), A = ap();
          if (!T || !A || !A.post) return false;
          if (HOOKS.bcLock && HOOKS.bcLock("a", key)) return false;
          const ok = HOOKS.adCmd("place", { key, pos: p.slice(), ammo: ammoFor(key, T), post: A.post.n });
          if (!ok){ say("Розміщення відхилено: перевірте склад і правила"); return false; }
          say(`${T.n} розміщено · радіус ${String(T.r).replace(".", ",")} км`);
          if (HOOKS.apRender) HOOKS.apRender();
          return true;
        }
        if (kind === "rad"){
          const u = radBV().BYID[key]; if (!u) return false;
          const st = radarAdd(key, p.slice(), u.side, false);
          if (!st){ say("РЛС не розгорнуто: місце або ліміт станцій"); return false; }
          say(`${u.name} розгортається`);
          if (typeof radarPanel === "function") radarPanel();
          return true;
        }
        if (kind === "ew"){
          const E = EWSYS[key], sd = sideAt();
          if (!E || !ewOwn(sd, key)) return false;
          const st = ewAdd(key, p.slice(), sd, false);
          if (!st){ say("РЕБ не розгорнуто: місце або ліміт станцій"); return false; }
          say(`РЕБ «${E.n}»: розгортання ${E.rdy} с`);
          if (typeof ewPanel === "function") ewPanel();
          return true;
        }
        if (kind === "air"){
          const T = typeOf(key), A = ap(); if (!T || !A) return false;
          const sd = side(T), n = nearestSite(sd, p); if (!n) return false;
          const idx = (window.BV_SITES || []).indexOf(n.s);
          const ok = HOOKS.adCmd("takeoff", { site: idx, key, ammo: ammoFor(key, T), patrol: p.slice(), lo: null });
          if (!ok){ say("Зліт відхилено: дальність, склад або точка патрулювання"); return false; }
          say(`${T.n} злітає з аеродрому «${n.s.n}» → патрулювання`);
          if (HOOKS.apRender) HOOKS.apRender();
          return true;
        }
      } catch (e) { say("Не вдалося виконати наказ"); if (window.console) console.error("[dnd]", e); return false; }
      return false;
    }
  };

  window.BV_DND_HOST = {
    HOOKS,
    S7,
    toast: m => toast(m),
    circleRing: (c, km, n) => circleRing(c, km, n),
    supports: (kind, key) => {
      if (kind === "ad" || kind === "air"){ const T = typeOf(key); return !!T && !T.ship; }
      if (kind === "rad") return true;
      if (kind === "ew") return true;
      return false;
    },
    posts: () => (typeof AD_POSTS !== "undefined" ? AD_POSTS : []),
  };
  HOOKS.dndAp = dndAp;
  HOOKS.dndLp = { zone: () => null, probe: () => bad("Ракети — через панель пуску"), apply: () => false };
})();
