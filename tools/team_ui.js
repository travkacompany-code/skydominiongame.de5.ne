  /* ======================= етап 6 (2×2): КОМАНДНИЙ ПУНКТ ППО, ПОЗНАЧКИ НА КАРТІ, ЖУРНАЛ ПОДІЙ =======================
     Дані КП — реальні: стан засобів ППО й цілі беруться з тієї картини, яку бачить сторона гравця (знімок із туманом війни
     або РЛС-контакти власника), події веде власник кімнати й розсилає лише гравцям цієї сторони (BV_TEAM.Hub.log). */
  const hpOf = u => typeof pvoHp === "function" ? pvoHp(u) : (typeof u.hp === "number" ? Math.max(0, Math.min(1, u.hp)) : 1);      // без модуля ППО етапу 3 — запасний варіант
const CPX = { open: false, tab: "ad", logs: [], pings: [], mem: null, unread: 0, ping: false, pk: "warn", t: null, anim: null, hd: "", tb: "", bd: "", css: false };
  const TCOL = { warn: "#ffcc33", atk: "#ff5a4d", def: "#4da3ff", move: "#4dd88a" };
  const KCOL = { det: "#4da3ff", warn: "#ffcc33", lost: "#8a9097", hit: "#ff9a3d", crit: "#ff5a4d", kill: "#4dd88a", info: "#c9ced4", sys: "#c9ced4" };
  const KTAG = { det: "ВИЯВЛ.", warn: "УВАГА", lost: "ВТРАТА", hit: "УРАЖ.", crit: "КРИТ.", kill: "ЗБИТО", info: "ПОДІЯ", sys: "СИСТ." };
  const cpSd = () => mySides()[0] || null;
  function cpCss(){
    if (CPX.css) return; CPX.css = true;
    const st = document.createElement("style"); st.id = "team-css";
    st.textContent = `#cpPanel{display:none;flex-direction:column;position:fixed;z-index:62;left:8px;right:8px;bottom:calc(64px + env(safe-area-inset-bottom,0px));max-height:62vh;background:rgba(12,15,19,.96);border:1px solid #2b323b;border-radius:10px;color:#dfe3e8;font:12px/1.35 var(--sans,system-ui);box-shadow:0 8px 30px rgba(0,0,0,.5)}
#cpPanel.on{display:flex}
@media (min-width:1108px){#cpPanel{left:auto;right:calc(72px + env(safe-area-inset-right,0px));top:84px;bottom:auto;width:410px;max-height:calc(100vh - 150px)}}
#cpPanel .cphd{display:flex;align-items:center;gap:8px;padding:9px 10px;border-bottom:1px solid #2b323b}
#cpPanel .cphd b{font-size:13px;letter-spacing:.04em}#cpPanel .cphd .sp{flex:1}
#cpPanel .cptabs{display:flex;gap:4px;padding:6px 8px;border-bottom:1px solid #2b323b;overflow:auto}
#cpPanel .cptabs button{flex:1;min-width:0;white-space:nowrap;background:#171c22;border:1px solid #2b323b;color:#aab1b9;border-radius:6px;padding:6px 8px;cursor:pointer;font:inherit;position:relative}
#cpPanel .cptabs button.on{background:#25303c;color:#fff;border-color:#4da3ff}
#cpPanel .cptabs .bd,#cpPanel .bd{background:#ff5a4d;color:#fff;border-radius:9px;padding:0 5px;margin-left:4px;font-size:10px}
#cpPanel .cpbody{overflow:auto;padding:8px 10px;flex:1;min-height:90px}
#cpPanel .tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:8px}
#cpPanel .tile{background:#171c22;border:1px solid #2b323b;border-radius:6px;padding:5px 6px;text-align:center}
#cpPanel .tile b{display:block;font-size:16px}#cpPanel .tile small{color:#8a9097;font-size:10px}
#cpPanel .tile.warn b{color:#ffcc33}#cpPanel .tile.crit b{color:#ff5a4d}#cpPanel .tile.ok b{color:#4dd88a}
#cpPanel .row{display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid #1d232a}
#cpPanel .row .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#cpPanel .row small,#cpPanel .mut{color:#8a9097}
#cpPanel .hpb{width:46px;height:5px;background:#27303a;border-radius:3px;overflow:hidden}#cpPanel .hpb i{display:block;height:100%;background:#4dd88a}
#cpPanel .mini{background:#171c22;border:1px solid #2b323b;color:#dfe3e8;border-radius:5px;padding:3px 7px;cursor:pointer;font:inherit}
#cpPanel .mini:hover{border-color:#4da3ff}#cpPanel .mini[disabled]{opacity:.4;cursor:not-allowed}#cpPanel .mini.on{background:#25303c;border-color:#4da3ff}
#cpPanel .sec{margin:10px 0 4px;color:#8a9097;font-size:10px;letter-spacing:.12em;text-transform:uppercase;display:flex;justify-content:space-between}
#cpPanel .ev{display:flex;gap:6px;padding:4px 0;border-bottom:1px solid #1d232a;align-items:flex-start}
#cpPanel .ev em{font-style:normal;font-size:9px;border:1px solid currentColor;border-radius:4px;padding:1px 4px;white-space:nowrap;margin-top:1px}
#cpPanel .ev .tx{flex:1}#cpPanel .ev time{color:#6d7680;font-size:10px;white-space:nowrap}
#cpPanel .tg{display:grid;grid-template-columns:1fr auto;gap:2px 8px;padding:6px 0;border-bottom:1px solid #1d232a;cursor:pointer}
#cpPanel .tg:hover{background:#161b21}#cpPanel .tg .e{color:#ffcc33;font-weight:600;text-align:right}
#cpPanel .tg.soon .e{color:#ff5a4d}
#cpPanel .chips{display:flex;flex-wrap:wrap;gap:5px;margin:4px 0}
#cpPanel .mate{display:flex;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid #1d232a;flex-wrap:wrap}
#cpPanel .pill{border:1px solid #2b323b;border-radius:10px;padding:1px 7px;font-size:10px;color:#aab1b9}
#cpPanel .pill.pvo{color:#4da3ff;border-color:#4da3ff}#cpPanel .pill.cmd{color:#ffcc33;border-color:#ffcc33}#cpPanel .pill.both{color:#4dd88a;border-color:#4dd88a}#cpPanel .pill.away{color:#ff5a4d;border-color:#ff5a4d}
#cpPanel .cpchat{display:none;border-top:1px solid #2b323b;padding:6px 8px}
#cpPanel[data-tab="team"] .cpchat{display:block}
#cpPanel .cpchat .chatlog{max-height:150px;overflow:auto}
.chch{display:flex;gap:5px;margin:0 0 5px;flex-wrap:wrap}.chch button,.cpq button{background:#171c22;border:1px solid #2b323b;color:#cdd3da;border-radius:12px;padding:2px 9px;cursor:pointer;font:11px var(--sans,system-ui)}
.chch button.on{background:#25303c;border-color:#4da3ff;color:#fff}.cpq{display:flex;gap:4px;flex-wrap:wrap;margin:0 0 5px}
.cm .ch{font-size:9px;border-radius:4px;padding:0 4px;margin-right:4px;border:1px solid #4da3ff;color:#4da3ff}.cm .ch.sys{border-color:#8a9097;color:#8a9097}
.cm.sysm{opacity:.85;font-style:italic}
body.tping-on #map,body.tping-on .maplibregl-canvas{cursor:crosshair!important}`;
    document.head.appendChild(st);
  }
  function cpEl(){
    let el = $("cpPanel"); if (el) return el;
    cpCss();
    el = document.createElement("div"); el.id = "cpPanel"; el.className = "hud panel"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Командний пункт ППО"); el.dataset.tab = "ad";
    el.innerHTML = `<div class="cphd"></div><div class="cptabs"></div><div class="cpbody"></div><div class="cpchat">${chatBox("cp", false)}</div>`;
    document.body.appendChild(el); return el;
  }
  /* ---- дані, які бачить сторона ---- */
  const cpUnitContacts = sd => {
    const out = [];
    for (const u of units.values()){
      if (u.sd === sd || u.sd == null || u.fall || u.sea || u.kind !== "w" || !WEAPONS[u.key]) continue;
      out.push({ k: "air", id: u.id, st: "identified", conf: 1, age: 0, ll: u.pos, hdg: u.hdg == null ? null : u.hdg, spd: u.spd || 0, nm: WEAPONS[u.key].n || u.key, cat: null });
    }
    return out;
  };
  function cpContacts(sd, host){
    try { if (fogLive()) return host ? fogContacts(sd) : fogView(); } catch (e) { /* РЛС ще не ініціалізована */ }
    return cpUnitContacts(sd);
  }
  const cpAssets = sd => OBJS.filter(o => o.side === sd && GAME.obj && GAME.obj[o.i] > 0).map(o => ({ name: o.n, pos: o.c }));
  const cpOwnAd = sd => [...ADS.units.values()].filter(u => (u.side || "ua") === sd);
  const adName = k => (AD_TYPES[k] && AD_TYPES[k].n) || k;
  /* ---- власник: журнал подій КП зі зміни стану бою ---- */
  function cpWatch(){
    const R = NET.room; if (!R || !R.host || !GAME.on || GAME.over || GAME.phase !== "run") return;
    const H = R.hub, T = TM(), t = tNow();
    const M = CPX.mem || (CPX.mem = { ad: { ua: new Map(), ru: new Map() }, obj: { ua: new Map(), ru: new Map() }, kills: { ua: 0, ru: 0 }, prev: { ua: null, ru: null } });
    for (const sd of ["ua", "ru"]){
      if (!R.roster.on(sd).length) continue;
      const d = T.diffContacts(M.prev[sd] || new Map(), cpContacts(sd, true)); M.prev[sd] = d.next;
      for (const e of d.events.slice(0, 5)) H.log(sd, e.k, e.x, { t, ll: e.ll });
      const cur = new Map(); let kills = 0;
      for (const u of cpOwnAd(sd)){
        const ty = AD_TYPES[u.key] || {}, nm = ty.n || u.key, hp = hpOf(u), noAm = (u.mag | 0) <= 0 && !(u.reserve > 0), prev = M.ad[sd].get(u.id);
        kills += u.kills | 0;
        if (ty.air) continue;
        cur.set(u.id, { hp, noAm, nm, pos: u.pos });
        if (prev){
          if (hp < 0.3 && prev.hp >= 0.3) H.log(sd, "crit", `${nm}: виведено з ладу`, { t, ll: u.pos });
          else if (hp < prev.hp - 0.04) H.log(sd, "hit", `${nm} пошкоджено (${Math.round(hp * 100)}%)`, { t, ll: u.pos });
          if (noAm && !prev.noAm) H.log(sd, "warn", `${nm}: боєкомплект вичерпано`, { t, ll: u.pos });
        }
      }
      for (const [id, p] of M.ad[sd]) if (!cur.has(id)) H.log(sd, "crit", `Втрачено засіб ППО: ${p.nm}`, { t, ll: p.pos });
      M.ad[sd] = cur;
      if (kills > M.kills[sd]){ H.log(sd, "kill", `Збито цілей: +${kills - M.kills[sd]} (усього ${kills})`, { t }); }
      M.kills[sd] = Math.max(M.kills[sd], kills);
      for (const o of OBJS){
        if (o.side !== sd) continue;
        const hp = GAME.obj ? GAME.obj[o.i] : o.hp, pv = M.obj[sd].get(o.i);
        if (pv != null && hp < pv - 0.01) H.log(sd, hp <= 0 ? "crit" : "hit", hp <= 0 ? `Об'єкт «${o.n}» знищено` : `Об'єкт «${o.n}» уражено (${Math.round(hp / o.hp * 100)}%)`, { t, ll: o.c });
        M.obj[sd].set(o.i, hp);
      }
    }
  }
  /* ---- шар позначок ---- */
  function pingLayer(){
    const map = S7.map; if (!map || map.getSource("tping")) return;
    map.addSource("tping", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: "tping-ring", type: "circle", source: "tping", paint: { "circle-radius": ["get", "r"], "circle-color": "rgba(0,0,0,0)", "circle-stroke-width": 3, "circle-stroke-color": ["get", "c"], "circle-stroke-opacity": ["get", "o"] } });
    map.addLayer({ id: "tping-dot", type: "circle", source: "tping", paint: { "circle-radius": 5, "circle-color": ["get", "c"], "circle-stroke-width": 1.5, "circle-stroke-color": "#ffffff" } });
    map.addLayer({ id: "tping-lbl", type: "symbol", source: "tping", layout: { "text-field": ["get", "n"], "text-font": F_REG, "text-size": 12, "text-offset": [0, 1.4], "text-anchor": "top", "text-allow-overlap": true },
      paint: { "text-color": "#ffffff", "text-halo-color": "rgba(0,0,0,.85)", "text-halo-width": 1.6 } });
  }
  function pingDraw(){
    const map = S7.map; if (!map) return; const src = map.getSource("tping"); if (!src) return;
    const now = performance.now();
    src.setData({ type: "FeatureCollection", features: CPX.pings.map(p => {
      const age = (now - p.t0) / 1000, ph = (age % 1.6) / 1.6, fade = Math.max(0, Math.min(1, (p.ttl - age) / 4));
      return { type: "Feature", properties: { r: 8 + ph * 26, o: (1 - ph) * fade, c: TCOL[p.k] || TCOL.warn, n: `${p.name} · ${TM().PING_KINDS[p.k] || ""}` }, geometry: { type: "Point", coordinates: p.pos } };
    }) });
  }
  function pingPrune(){
    const now = performance.now(), n = CPX.pings.length;
    CPX.pings = CPX.pings.filter(p => now - p.t0 < p.ttl * 1000);
    if (!CPX.pings.length && CPX.anim){ clearInterval(CPX.anim); CPX.anim = null; pingDraw(); }
    return n !== CPX.pings.length;
  }
  function pingAdd(p){
    if (!p || !Array.isArray(p.pos)) return;
    CPX.pings = CPX.pings.filter(x => x.id !== p.id || x.side !== p.side); CPX.pings.push({ id: p.id, side: p.side, name: p.name || "?", pos: p.pos, k: p.k, ttl: Math.max(3, p.left || 30), t0: performance.now() });
    pingLayer(); pingDraw();
    if (!CPX.anim) CPX.anim = setInterval(() => { pingPrune(); if (CPX.pings.length) pingDraw(); }, 140);
  }
  let pingHooked = false;
  function pingHook(){
    const map = S7.map; if (!map || pingHooked) return; pingHooked = true;
    const cc = map.getCanvasContainer();
    cc.addEventListener("click", e => {
      if (!isTeam() || GAME.spec || !(CPX.ping || e.altKey)) return;
      e.stopPropagation(); e.preventDefault();
      const r = cc.getBoundingClientRect(), ll = map.unproject([e.clientX - r.left, e.clientY - r.top]);
      teamSend({ t: "ping", pos: [r5(ll.lng), r5(ll.lat)], k: CPX.pk });
      if (CPX.ping) cpPingMode(false);
    }, true);
  }
  function cpPingMode(on){
    CPX.ping = on; document.body.classList.toggle("tping-on", on);
    if (on) toast("Клацніть по карті — позначку побачить лише ваша команда (Alt+клік — швидка позначка)", "info");
    gbSig = ""; gmTick();
  }
  /* ---- панель КП ---- */
  const ago = at => { const s = Math.max(0, Math.round((performance.now() - at) / 1000)); return s < 90 ? s + " с" : Math.round(s / 60) + " хв"; };
  const tile = (n, l, c) => `<div class="tile ${c || ""}"><b>${n}</b><small>${l}</small></div>`;
  function tabAd(sd, canAd){
    const T = TM(), own = cpOwnAd(sd).filter(u => !(AD_TYPES[u.key] || {}).air), S = T.cpSummary(own, { name: adName });
    let h = `<div class="tiles">${tile(S.n, "засобів ППО")}${tile(S.ready, "готові", "ok")}${tile(S.reload, "перезаряд.")}${tile(S.engaged, "ведуть бій")}` +
      `${tile(S.noAmmo, "без БК", S.noAmmo ? "crit" : "")}${tile(S.damaged, "пошкоджені", S.damaged ? "warn" : "")}${tile(S.down, "виведені", S.down ? "crit" : "")}${tile(S.kills, "збито")}</div>` +
      `<div class="row"><span class="nm mut">Середній стан · постріли ${S.fired} · автономних ${S.auto}</span><div class="hpb" style="width:90px"><i style="width:${Math.round(S.hp * 100)}%"></i></div><b>${Math.round(S.hp * 100)}%</b></div>`;
    const st = GAME.ads && GAME.ads[sd] || {}, stk = Object.keys(st).filter(k => st[k] > 0 && AD_TYPES[k]);
    h += `<div class="sec"><span>Склад ППО</span><span>${stk.length ? stk.reduce((a, k) => a + st[k], 0) + " од." : "порожньо"}</span></div>` +
      (stk.length ? `<div class="chips">${stk.map(k => `<span class="pill">${escH(adName(k))} ×${st[k]}</span>`).join("")}</div>` : "");
    h += `<div class="sec"><span>Засоби в бою</span><span><button class="mini" data-s7="cpall" data-v="auto" ${canAd ? "" : "disabled"} title="Усі засоби — автоматичний режим">Усі авто</button> <button class="mini" data-s7="cpall" data-v="manual" ${canAd ? "" : "disabled"} title="Усі засоби — ручне наведення">Усі ручн.</button></span></div>`;
    const order = { ready: 0, reload: 1, base: 3 };
    h += own.slice().sort((a, b) => (order[a.state] ?? 2) - (order[b.state] ?? 2) || (a.mag | 0) - (b.mag | 0)).map(u => {
      const hp = hpOf(u), c = hp < 0.3 ? "#ff5a4d" : hp < 0.65 ? "#ffcc33" : "#4dd88a";
      return `<div class="row"><span class="nm">${escH(adName(u.key))}${u._auto ? ' <small>авт.</small>' : ""}${u.engaged ? ' <small style="color:#ffcc33">▸ бій</small>' : ""}</span>` +
        `<small>${escH(u.state || "")} · ${u.mag | 0}/${u.reserve === Infinity || u.reserve < 0 ? "∞" : u.reserve | 0}</small>` +
        `<div class="hpb"><i style="width:${Math.round(hp * 100)}%;background:${c}"></i></div><button class="mini" data-s7="cpfly" data-v="${u.id}" title="Показати на карті">◎</button></div>`;
    }).join("") || `<div class="mut" style="padding:8px 0">Засобів ППО на карті немає.</div>`;
    return h;
  }
  function tabTg(sd){
    const T = TM(), list = T.cpTargets(cpContacts(sd, GAME.puppet ? false : false), { dist: (a, b) => hav(a, b), assets: cpAssets(sd) });
    if (!list.length) return `<div class="mut" style="padding:10px 0">Повітряних цілей не виявлено.${fogLive() ? " Картину формують лише ваші РЛС і розвідка." : ""}</div>`;
    return `<div class="sec"><span>Виявлено цілей</span><span>${list.length}</span></div>` + list.slice(0, 40).map(g => {
      const e = g.eta == null ? "—" : g.eta < 90 ? Math.round(g.eta) + " с" : Math.round(g.eta / 60) + " хв";
      return `<div class="tg ${g.eta != null && g.eta < 60 ? "soon" : ""}" data-s7="cpfly" data-v="t:${g.ll[0]},${g.ll[1]}"><b>${escH(g.label)}</b><span class="e">${e}</span>` +
        `<span class="mut">${g.st === "identified" ? "ідентифікована" : g.st === "tracking" ? "супровід" : g.st === "lost" ? "втрачена" : "виявлена"}${g.hdg != null ? " · курс " + Math.round(g.hdg) + "°" : ""}${g.spd ? " · " + Math.round(g.spd * 3600) + " км/г" : ""}${g.eng ? " · ППО: " + g.eng : ""}</span>` +
        `<span class="mut" style="text-align:right">${g.near ? "→ " + escH(g.near.name) + " " + Math.round(g.near.km) + " км" : ""}</span></div>`;
    }).join("");
  }
  function tabEv(){
    return CPX.logs.slice(-60).reverse().map(e => `<div class="ev" ${e.ll ? `data-s7="cpfly" data-v="t:${e.ll[0]},${e.ll[1]}" style="cursor:pointer"` : ""}><em style="color:${KCOL[e.k] || "#c9ced4"}">${KTAG[e.k] || "ПОДІЯ"}</em>` +
      `<span class="tx">${escH(e.x)}${e.c > 1 ? ` <small class="mut">×${e.c}</small>` : ""}</span><time>${ago(e.at)}</time></div>`).join("") || `<div class="mut" style="padding:10px 0">Подій поки немає — тут з'являтимуться виявлення цілей, влучання, втрати й повідомлення КП.</div>`;
  }
  function tabTeam(sd){
    const R = NET.room, T = TM(), pl = (R && (R.host ? R.hub.room(R.hub.ep("H")) : R.info) || { players: [] }).players, me = pl.find(p => p.id === PROF.id), lead = pl.filter(p => p.side === sd && !p.away)[0];
    const mates = pl.filter(p => p.side === sd), foes = pl.filter(p => p.side !== sd);
    const iAmLead = !!me && (me.host || (lead && lead.id === me.id));
    let h = `<div class="sec"><span>Моя команда · ${SIDE_N[sd]}</span><span>${mates.length}/2</span></div>`;
    h += mates.map(p => {
      const can = p.id === PROF.id || iAmLead || (me && me.host);
      const rb = can ? ["cmd", "pvo", "both"].map(r => `<button class="mini ${p.role === r ? "on" : ""}" data-s7="trole" data-v="${escH(p.id)}:${r}" title="${T.ROLES[r].n}">${T.ROLES[r].s}</button>`).join("") : "";
      return `<div class="mate"><b>${escU(p.name)}</b>${p.id === PROF.id ? '<span class="pill">ви</span>' : ""}${p.host ? '<span class="pill">власник</span>' : ""}` +
        `<span class="pill ${p.er}">${escH(T.ROLES[p.er] ? T.ROLES[p.er].n : "")}</span>${p.away ? '<span class="pill away">немає зв\'язку</span>' : ""}<span class="sp" style="flex:1"></span>${rb}</div>`;
    }).join("");
    h += `<div class="mut" style="margin:6px 0">Командувач керує пусками, ПУ, виробництвом і логістикою; Начальник ППО — зенітними засобами й тривогами. Якщо в команді лишається один гравець — він керує всім.</div>`;
    h += `<div class="sec"><span>Позначка на карті</span><span>бачить лише команда</span></div><div class="chips">` +
      Object.keys(T.PING_KINDS).map(k => `<button class="mini ${CPX.pk === k ? "on" : ""}" data-s7="tpk" data-v="${k}" style="border-color:${TCOL[k]}">${T.PING_KINDS[k]}</button>`).join("") +
      `<button class="mini ${CPX.ping ? "on" : ""}" data-s7="tping">📍 Поставити</button></div>`;
    h += `<div class="sec"><span>Супротивник</span><span>${foes.length}</span></div><div class="mut">${foes.map(p => escU(p.name) + (p.away ? " (немає зв'язку)" : "")).join(", ") || "—"}</div>`;
    return h;
  }
  function cpRender(){
    const el = cpEl();
    if (!CPX.open || !isTeam() || GAME.spec){ el.classList.remove("on"); return; }
    const sd = cpSd(); if (!sd){ el.classList.remove("on"); return; }
    el.classList.add("on"); el.dataset.tab = CPX.tab;
    const T = TM(), canAd = teamOk("ad"), R = NET.room, me = myPlayer(R);
    const hd = `<b>КП ППО</b><span class="pill ${me ? me.er : ""}">${escH(T.ROLES[myEffRole()].n)}</span><span class="pill">${SIDE_N[sd]}</span><span class="sp"></span><button class="lp-x" data-s7="cpx" aria-label="Закрити">×</button>`;
    if (hd !== CPX.hd){ CPX.hd = hd; el.querySelector(".cphd").innerHTML = hd; }
    const evn = CPX.unread;
    const tb = [["ad", "ППО"], ["tg", "Цілі"], ["ev", "Події" + (evn ? `<span class="bd">${evn}</span>` : "")], ["team", "Команда"]].map(([k, n]) => `<button class="${CPX.tab === k ? "on" : ""}" data-s7="cptab" data-v="${k}">${n}</button>`).join("");
    if (tb !== CPX.tb){ CPX.tb = tb; el.querySelector(".cptabs").innerHTML = tb; }
    const bd = CPX.tab === "ad" ? tabAd(sd, canAd) : CPX.tab === "tg" ? tabTg(sd) : CPX.tab === "ev" ? tabEv() : tabTeam(sd);
    if (bd !== CPX.bd){ const b = el.querySelector(".cpbody"), st = b.scrollTop; CPX.bd = bd; b.innerHTML = bd; b.scrollTop = st; }
  }
  function cpOpen(v){
    CPX.open = v == null ? !CPX.open : !!v; if (CPX.open && CPX.tab === "ev") CPX.unread = 0;
    CPX.hd = CPX.tb = CPX.bd = ""; cpRender();
    if (CPX.open && CPX.tab === "team"){ const l = $("cpLog"); if (l){ l.innerHTML = chatHTML(NET.room ? NET.room.chat : []); l.scrollTop = l.scrollHeight; } }
    gbSig = ""; gmTick();
  }
  function cpFly(v){
    const map = S7.map; if (!map) return;
    let ll = null;
    if (String(v).startsWith("t:")) ll = v.slice(2).split(",").map(Number);
    else { const u = ADS.units.get(+v) || ADS.units.get(v); if (u) ll = u.pos; }
    if (ll && isFinite(ll[0]) && isFinite(ll[1])) map.easeTo({ center: ll, zoom: Math.max(map.getZoom(), 7), duration: 700 });
  }
  function cpAll(mode){
    const sd = cpSd(); if (!sd) return;
    if (!teamOk("ad")) return teamDeny("ad");
    let n = 0;
    for (const u of cpOwnAd(sd)){ const ty = AD_TYPES[u.key] || {}; if (ty.air || ty.manOnly || u.mode === mode) continue; HOOKS.adCmd("mode", { id: u.id, v: mode }); if (GAME.puppet) u.mode = mode; n++; }
    toast(n ? `Режим «${mode === "auto" ? "автоматичний" : "ручний"}»: ${n} засобів ППО` : "Змін немає", n ? "ok" : "info");
    CPX.bd = ""; cpRender();
  }
  /* ---- життєвий цикл ---- */
  function cpTick(){
    if (!isTeam()){ return; }
    cpWatch();
    if (pingPrune()) pingDraw();
    if (CPX.open) cpRender();
  }
  function teamStart(){
    teamReset(true);
    if (!isTeam()) return;
    cpEl(); pingLayer(); pingHook();
    CPX.t = setInterval(cpTick, 700);
  }
  function teamReset(keep){
    clearInterval(CPX.t); CPX.t = null; clearInterval(CPX.anim); CPX.anim = null;
    Object.assign(CPX, { logs: [], pings: [], mem: null, unread: 0, ping: false, bd: "", hd: "", tb: "" }); if (!keep) CPX.open = false;
    document.body.classList.remove("tping-on");
    const el = $("cpPanel"); if (el && !keep) el.classList.remove("on");
    try { pingDraw(); } catch (e) { /* карта ще не готова */ }
  }
  S7.team = {
    start: teamStart, reset: () => teamReset(false),
    update(){ if (isTeam()){ if (CPX.open) cpRender(); gbSig = ""; } },
    ping: pingAdd,
    log(e){
      if (!e || !e.x) return; e.at = performance.now();
      const last = CPX.logs[CPX.logs.length - 1]; if (last && last.id === e.id) return;
      CPX.logs.push(e); if (CPX.logs.length > 120) CPX.logs.shift();
      if (!CPX.open || CPX.tab !== "ev"){ CPX.unread++; if (e.k === "crit") toast("КП: " + e.x, "warn"); }
      if (CPX.open) cpRender(); gbSig = "";
    },
    sync(log, pg){ CPX.logs = (log || []).map(e => Object.assign({}, e, { at: performance.now() })); (pg || []).forEach(pingAdd); },
    sideEv(sd, msg){ const R = NET.room; if (R && R.host && isTeam()) R.hub.log(sd, "info", msg, { t: tNow() }); },
    sig: () => isTeam() ? [CPX.open ? 1 : 0, CPX.unread, CPX.ping ? 1 : 0, ((NET.room && (NET.room.host ? NET.room.roster.info() : NET.room.info && NET.room.info.players)) || []).map(p => p.id + (p.er || "") + (p.away ? 1 : 0) + (p.ready ? 1 : 0)).join(",")].join("|") : "",
    open: cpOpen, pingMode: cpPingMode, fly: cpFly, all: cpAll,
    setTab(k){ CPX.tab = k; if (k === "ev") CPX.unread = 0; CPX.hd = CPX.tb = CPX.bd = ""; cpOpen(true); },
    setKind(k){ if (TM().PING_KINDS[k]) CPX.pk = k; CPX.bd = ""; cpRender(); },
    isOpen: () => CPX.open, pinging: () => CPX.ping, unread: () => CPX.unread
  };
