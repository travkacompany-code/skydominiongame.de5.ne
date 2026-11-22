  /* bv-quick-glue — етап 2 (панель швидкого доступу): читання списку ПВО й дії «вибрати + камера».
     Вставляється поруч із HOOKS.selClear, де доступні ADS, selSet, SEL, allowSide. Нової логіки не додає:
     вибір — та сама функція selSet, що й клік по техніці на мапі. */
  const QGRP = new Set();                       // етап 4: підрозділ — набір id систем ППО (лише читання/зміна вибору)
  HOOKS.quickGroupIds = () => [...QGRP].filter(id => ADS.units.has(id));
  HOOKS.quickGroupSet = ids => { QGRP.clear(); for (const i of ids) QGRP.add(i); };
  HOOKS.quickUnits = () => {
    const out = [];
    for (const u of ADS.units.values()){
      if (!u || !allowSide(u.side || "ua")) continue;
      const T = AD_TYPES[u.key]; if (!T) continue;
      out.push({ id: u.id, key: u.key, name: T.n, state: u.state, mag: u.mag | 0, max: T.mag | 0, reserve: u.reserve === Infinity ? "inf" : (u.reserve | 0),
        mode: u.mode || "auto", air: !!T.air, post: u.post || "", dmg: window.BV_DMG ? window.BV_DMG.level(u.id) : 0, pos: u.pos, side: u.side || "ua", sel: SEL.kind === "ad" && SEL.id === u.id, grp: QGRP.has(u.id) });
    }
    return out;
  };
  HOOKS.quickFocus = id => {
    const u = ADS.units.get(id); if (!u || !allowSide(u.side || "ua")) return false;
    selSet("ad", id);
    if (S7.map && u.pos) S7.map.easeTo({ center: u.pos, zoom: Math.max(S7.map.getZoom(), 7), duration: 600 });
    return true;
  };
  /* етап 3: лише перевірені команди з контекстного меню; кожна йде через ту саму команду, що й панель */
  HOOKS.quickOrder = (id, op, v) => {
    const u = ADS.units.get(id); if (!u || !allowSide(u.side || "ua")) return false;
    if (op === "reload") return !!HOOKS.adCmd("reload", { id });
    if (op === "mode" && (v === "auto" || v === "manual")) return !!HOOKS.adCmd("mode", { id, v });
    if (op === "remove") return !!HOOKS.adCmd("remove", { id });
    if (op === "patrolTo" && v && v.length === 2) return !!HOOKS.adCmd("airCmd", { id, p: [+v[0], +v[1]] });   // маршрути: точка патрулювання
    if (op === "rtb") return !!HOOKS.adCmd("rtb", { id });
    if (op === "repair") return !!(window.BV_DMG && window.BV_DMG.repair(id));
    if (op === "addMag" && typeof v === "number" && v > 0) return !!HOOKS.adCmd("add", { id, v });
    return false;
  };
  HOOKS.quickSelect = id => { if (!ADS.units.get(id)) return false; selSet("ad", id); return true; };
  window.BV_QUICK = { list: () => HOOKS.quickUnits(), focus: id => HOOKS.quickFocus(id), order: (id, op, v) => HOOKS.quickOrder(id, op, v),
    select: id => HOOKS.quickSelect(id),
    group: {
      ids: () => HOOKS.quickGroupIds(),
      set: ids => HOOKS.quickGroupSet(ids),
      clear: () => HOOKS.quickGroupSet([]),
      toggle: id => { const g = HOOKS.quickGroupIds(); HOOKS.quickGroupSet(g.includes(id) ? g.filter(x => x !== id) : [...g, id]); },
    } };
  /* bv-quick-glue-end */
