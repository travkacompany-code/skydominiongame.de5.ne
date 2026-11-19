/* ---------- кімнати (етап 6: 1×1 і 2×2 — склад, ролі, чат, позначки й журнал КП веде BV_TEAM.Hub) ---------- */
const genCode = () => genId(6);
const TM = () => window.BV_TEAM;
const isTeam = () => !!(GAME.on && GAME.room && GAME.room.team2);
const tNow = () => performance.now() / 1000;
const roomBase = R => ({ code: R.code, mode: R.mode, pub: !!R.pub, tempo: R.tempo, status: R.status, side: R.side, tour: R.tour || null });
const roomInfo = R => R.hub.room(R.hub.ep("H"));
const SESS_KEY = () => "bv2-sess" + PKEY.slice(11);
const sessSave = (code, role) => lsSet(SESS_KEY(), { code, role, at: Date.now() });
const sessClear = () => lsSet(SESS_KEY(), null);
let EIDN = 0;
const myPlayer = R => R && (R.host ? R.roster.get(PROF.id) : ((R.info && R.info.players) || []).find(p => p.id === PROF.id)) || null;
/* команда власника кімнати → гравці її боку (і лише вони) */
const teamEs = (R, side) => [...R.conns].filter(E => E.role === "player" && E.side === side);
function roomCreate(o){
  if (!NET.open){ toast("Мережа недоступна — перевірте підключення до інтернету"); return null; }
  roomLeave(true);
  const R = { code: o.code || genCode(), host: true, mode: o.mode, pub: !!o.pub, side: o.side, tempo: 1, tour: o.tour || null, status: "wait", open: false,
    conns: new Set(), byEid: new Map(), chat: [], inviteAfter: o.inviteAfter || null, team2: !!o.team2 && !o.tour, botFor: {}, info: null };
  R.roster = new (TM().Roster)({ team2: R.team2, hostSide: o.side });
  R.hub = new (TM().Hub)({ roster: R.roster, now: tNow, ts: () => Date.now(), pub: R.pub, tour: R.tour, inGame: () => R.status === "game", info: () => roomBase(R),
    send: (eid, m) => { const E = R.byEid.get(eid); if (E) nsend(E.c, m); },
    closeEp: eid => { const E = R.byEid.get(eid); if (E){ E.dead = true; E.role = null; setTimeout(() => { try { E.c.close(); } catch (e) {} }, 400); } },
    local: m => roomRecv(R, m),
    hooks: { joined: p => toast(`${p.name} приєднався до кімнати`), left: p => { if (R.status !== "game") toast(`${p.name} залишив кімнату`); else teamGone(R, p); },
             away: p => teamAway(R, p), back: p => teamBack(R, p), gone: p => teamGone(R, p), changed: () => teamChanged(R) } });
  R.hub.setHost(profPub(), o.side);
  R.players = R.roster.players;
  NET.room = R;
  let p; try { p = mkPeer(RPFX + R.code); } catch (e) { NET.room = null; toast("Не вдалося створити кімнату"); return null; }
  R.peer = p;
  p.on("open", () => {
    R.open = true; lobbyHb(); S7.ui && S7.ui.refresh("room");
    if (R.inviteAfter){ friendInvite(R.inviteAfter); R.inviteAfter = null; }
  });
  p.on("connection", c => {
    const E = { c, eid: "e" + (++EIDN), role: null, prof: null, side: null, full: true };
    R.conns.add(E); R.byEid.set(E.eid, E);
    c.on("data", m => roomHostMsg(R, E, m));
    c.on("close", () => roomHostDrop(R, E));
  });
  p.on("error", e => {
    if (e && e.type === "unavailable-id" && !R.open){
      if (R.tour){ NET.room = null; toast("Кімната матчу вже існує — приєднуйтесь до неї"); roomJoin(R.code, "player"); return; }
      try { p.destroy(); } catch (er) {} NET.room = null; roomCreate(Object.assign({}, o, { code: genCode() }));
    }
  });
  R.tick = setInterval(() => { if (NET.room !== R){ clearInterval(R.tick); return; } R.hub.tick(); }, 2000);
  return R;
}
const roomBroadcast = (R, m, exceptE) => { for (const E of R.conns) if (E !== exceptE && E.role) nsend(E.c, m); };
/* власник: синхронізує E.side / E.role з ростером (після переведення між командами, відключень) */
function teamChanged(R){
  if (NET.room !== R) return;
  for (const E of R.conns){
    const ep = R.hub.ep(E.eid); if (!ep){ continue; }
    E.role = ep.role;
    if (ep.role === "player"){ const p = R.roster.get(ep.id); if (p) E.side = p.side; }
  }
  const me = R.roster.get(PROF.id); if (me) R.side = me.side;
  R.info = R.hub.room(R.hub.ep("H"));
  S7.ui && S7.ui.refresh("room"); S7.team && S7.team.update();
  lobbyHb();
}
/* спільний обробник повідомлень, що йдуть і гостю від власника, і власнику від хаба */
function roomRecv(R, m){
  switch (m && m.t){
    case "chat": R.chat.push(m.m); if (R.chat.length > 120) R.chat.shift(); S7.ui && S7.ui.chat(m.m); return true;
    case "ping": S7.team && S7.team.ping(m.p); return true;
    case "tlog": S7.team && S7.team.log(m.e); return true;
    case "room": R.info = m.r; if (!R.host){ const me = (m.r.players || []).find(p => p.id === PROF.id); if (me) R.side = me.side; } S7.ui && S7.ui.refresh("room"); S7.team && S7.team.update(); return true;
    case "toast": toast(clipT(m.msg, 200)); return true;
  }
  return false;
}
function roomHostMsg(R, E, m){
  if (!m || typeof m !== "object" || NET.room !== R || E.dead) return;
  if (m.t === "hello"){
    const prof = cleanProf(m.prof), res = R.hub.hello(E.eid, { role: m.role === "spec" ? "spec" : "player", prof, side: m.side === "ua" || m.side === "ru" ? m.side : null });
    if (!res.ok) return;
    E.prof = prof; E.role = m.role === "spec" ? "spec" : "player"; teamChanged(R);
    if (R.status === "game" && GAME.on){ E.full = true; nsend(E.c, { t: "start", cfg: startCfg() }); }
    lobbyHb();
    return;
  }
  if (!E.role) return;
  if (R.hub.msg(E.eid, m)) return;                 // чат, позначки, ролі, переведення, вихід
  if (E.role !== "player" || !GAME.on || GAME.puppet) return;
  if (m.t === "cmd"){ hostCmd(E, m.k, m.p || {}); return; }
  const lead = R.roster.lead(E.side), isLead = !isTeam() || (lead && lead.id === E.prof.id);
  // етап 7.40: капітуляція й припинення вогню; у 2×2 — лише командир команди (першим у складі) від імені всієї команди
  if (m.t === "surr" && !GAME.over){
    if (!isLead){ nsend(E.c, { t: "toast", msg: "Здатися може лише командир команди" }); return; }
    gameToast(`${E.prof.name} здався — бій завершено`); endBy({ winner: other(E.side), surr: E.side }); return;
  }
  if (m.t === "cf" && !GAME.over){
    if (!isLead){ nsend(E.c, { t: "toast", msg: "Припинення вогню пропонує лише командир команди" }); return; }
    cfPropose(R, E.side, E.prof.name); return;
  }
  if (m.t === "cfa" && !GAME.over){
    const from = R.cf && R.cf.from, tl = from && R.roster.lead(other(from));
    if (!from || !tl || tl.id !== E.prof.id) return;
    cfAnswer(R, !!m.ok); return;
  }
}
/* припинення вогню: пропозицію бачить лише командир ворожої команди (у 1×1 — суперник) */
function cfPropose(R, from, name){
  R.cf = { from, name };
  const tl = R.roster.lead(other(from)); if (!tl) return;
  if (tl.host){ S7.ui && S7.ui.cfAsk(name, ok => cfAnswer(R, ok)); return; }
  const E = [...R.conns].find(x => x.role === "player" && x.prof && x.prof.id === tl.id);
  if (E) nsend(E.c, { t: "cf", n: name });
}
function cfAnswer(R, ok){
  const from = R.cf && R.cf.from; R.cf = null;
  if (!GAME.on || GAME.over) return;
  if (ok){ endBy({ winner: "draw", peace: true }); return; }
  for (const E of teamEs(R, from)) nsend(E.c, { t: "cfno" });
  if (R.roster.get(PROF.id) && R.roster.get(PROF.id).side === from) S7.ui && S7.ui.cfNo();
}
function roomHostDrop(R, E){
  if (!R.conns.has(E)) return;
  R.conns.delete(E); R.byEid.delete(E.eid);
  if (NET.room !== R || E.dead) return;
  R.hub.drop(E.eid);
  lobbyHb(); S7.ui && S7.ui.refresh("room");
}
/* відключення гравця в бою: команда продовжує грати; сторона без людей — під керування бота до повернення */
function teamAway(R, p){
  toast(`${p.name} втратив зв'язок`);
  if (GAME.on && R.status === "game" && R.roster.act(p.side).length === 0 && GAME.ctrl[p.side] === "remote"){
    botTakeover(p.side); R.botFor[p.side] = true;
    gameToast(`${p.name} втратив зв'язок — стороною «${SIDE_N[p.side]}» тимчасово керує бот`);
  }
  S7.team && S7.team.update();
}
function teamBack(R, p){
  if (GAME.on && R.botFor[p.side] && GAME.ctrl[p.side] === "bot"){
    GAME.ctrl[p.side] = "remote"; BOT[p.side] = null; R.botFor[p.side] = false;
    gameToast(`${p.name} повернувся — керування стороною «${SIDE_N[p.side]}» повернуто гравцям`);
  } else toast(`${p.name} повернувся в бій`);
  S7.team && S7.team.update();
}
function teamGone(R, p){
  if (GAME.on && R.status === "game" && !GAME.over){
    if (R.roster.act(p.side).length === 0 && GAME.ctrl[p.side] === "remote"){ botTakeover(p.side); R.botFor[p.side] = true; gameToast(`${p.name} залишив бій — стороною «${SIDE_N[p.side]}» керує бот`); }
    else toast(`${p.name} залишив бій`);
  } else toast(`${p.name} залишив кімнату`);
  S7.team && S7.team.update();
}
function chatSend(text, ch){
  const R = NET.room; text = clipT(text, 200); if (!R || !text) return;
  ch = (R.host ? R.team2 : !!(R.info && R.info.team2)) && ch !== "all" ? "team" : "all";
  if (R.host) R.hub.msg("H", { t: "chat", text, ch });
  else if (R.role === "player") nsend(R.conn, { t: "chat", text, ch });
  else toast("Глядач не може писати в чат");
}
/* позначка на карті, ролі, переведення між командами — одним шляхом і для власника, і для гостя */
function teamSend(m){
  const R = NET.room; if (!R) return false;
  if (R.host) return R.hub.msg("H", m);
  if (R.role === "player") nsend(R.conn, m);
  return true;
}
const RCV = { on: false, code: null, role: null, tries: 0, t: null };
function roomJoin(code, role, tries, recover){
  code = clipT(code, 6).toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)){ toast("Код кімнати — 6 символів"); return; }
  if (!NET.open){ toast("Мережа недоступна"); return; }
  if (NET.room && NET.room.code === code) return;
  roomLeave(true);
  S7.joining = code;
  S7.ui && S7.ui.net();
  dial(RPFX + code, c => {
    if (S7.joining !== code){ try { c.close(); } catch (e) {} return; }
    S7.joining = null;
    const R = { code, host: false, conn: c, role, side: null, info: null, chat: [], ok: false, recover: !!recover };
    NET.room = R;
    c.on("data", m => roomGuestMsg(R, m));
    c.on("close", () => roomGuestClosed(R));
    nsend(c, { t: "hello", role, prof: profPub() });
  }, () => {
    if (S7.joining !== code) return;
    S7.joining = null;
    if (recover){ RCV.t = setTimeout(recTry, 3000); return; }
    if (tries > 0){ setTimeout(() => { if (!S7.joining){ roomJoin(code, role, tries - 1); } }, 3000); return; }
    toast("Кімнату не знайдено або вона недоступна"); S7.ui && S7.ui.net();
  }, NET.kind === "local" ? 2500 : 7000);
}
function roomGuestMsg(R, m){
  if (!m || NET.room !== R) return;
  if (roomRecv(R, m)) return;
  switch (m.t){
    case "welcome": R.ok = true; R.role = m.role; R.side = m.side; R.info = m.r; R.chat = m.chat || [];
      sessSave(R.code, R.role);
      if (RCV.on){ RCV.on = false; clearTimeout(RCV.t); toast("Сесію відновлено — ви знову в бою", "ok"); }
      S7.team && S7.team.sync(m.log, m.pg);
      if (m.rejoin){ toast("Повернення в бій…"); break; }
      toast(m.role === "spec" ? "Ви — глядач: можна лише спостерігати за боєм" : `Ви в кімнаті ${R.code} · ваша сторона — ${SIDE_N[R.side]}`);
      S7.ui && S7.ui.toRoom(); break;
    case "reject": toast(clipT(m.msg, 160)); NET.room = null; sessClear(); try { R.conn.close(); } catch (e) {}
      if (RCV.on){ RCV.on = false; clearTimeout(RCV.t); if (GAME.on && GAME.puppet && !GAME.over) S7.ui && S7.ui.abortGame(); }
      S7.ui && S7.ui.refresh("room"); break;
    case "start": guestStart(R, m.cfg); break;
    case "snap": if (GAME.on && GAME.puppet) applySnap(m); break;
    case "cf": if (GAME.on && GAME.puppet && !GAME.spec && !GAME.over){ const h = (R.info && R.info.players || []).find(p => p.host); S7.ui && S7.ui.cfAsk(m.n || (h ? h.name : "Противник"), ok => nsend(R.conn, { t: "cfa", ok: !!ok })); } break;
    case "cfno": S7.ui && S7.ui.cfNo(); break;
    case "over": if (GAME.on && GAME.puppet){ sessClear(); GAME.phase = "over"; GAME.over = true; GAME.res = m.res; recFrame(); S7.onGameOver && S7.onGameOver(m.res); } break;
    case "closed": toast("Власник закрив кімнату"); sessClear(); roomGuestClosed(R, true); break;
  }
}
function roomGuestClosed(R, final){
  if (NET.room !== R) return;
  // втрата зв'язку посеред бою — не кінець: пробуємо повернутися в ту саму кімнату (місце за гравцем тримається)
  if (!final && GAME.on && GAME.puppet && !GAME.over && R.ok && !R.leaving){
    NET.room = null; guestRecover(R); return;
  }
  NET.room = null;
  if (GAME.on && GAME.puppet && !GAME.over){ toast("Зв'язок із власником кімнати втрачено — бій перервано"); S7.ui && S7.ui.abortGame(); }
  else S7.ui && S7.ui.refresh("room");
}
function guestRecover(R){
  if (RCV.on) return;
  RCV.on = true; RCV.code = R.code; RCV.role = R.role; RCV.tries = 0;
  toast("Зв'язок із кімнатою втрачено — відновлюємо сесію…", "warn");
  recTry();
}
function recTry(){
  clearTimeout(RCV.t);
  if (!RCV.on) return;
  if (!GAME.on || GAME.over || !GAME.puppet){ RCV.on = false; return; }
  if (++RCV.tries > 30){ RCV.on = false; toast("Не вдалося повернутися в кімнату — бій перервано"); S7.ui && S7.ui.abortGame(); return; }
  if (!NET.open){ RCV.t = setTimeout(recTry, 3000); return; }
  roomJoin(RCV.code, RCV.role, 0, true);
  RCV.t = setTimeout(() => { if (RCV.on && !(NET.room && NET.room.ok)){ if (NET.room){ try { NET.room.conn.close(); } catch (e) {} NET.room = null; } S7.joining = null; recTry(); } }, 9000);
}
/* відновлення сесії після перезавантаження сторінки: гравець повертається в кімнату, де йшов бій */
let sessTried = false;
function sessResume(){
  if (sessTried || NET.room || S7.joining) return; sessTried = true;
  const s = lsGet(SESS_KEY(), null);
  if (!s || !s.code || Date.now() - (s.at || 0) > 20 * 60 * 1000){ if (s) sessClear(); return; }
  toast("Відновлюємо сесію в кімнаті " + s.code + "…", "info");
  roomJoin(s.code, s.role === "spec" ? "spec" : "player", 0, false);
}
/* етап 7.40: надіслати супернику в мережевому бою (гість → власник, власник → гравці противника) */
function roomFoeSend(m){
  const R = NET.room; if (!R) return false;
  if (!R.host){ nsend(R.conn, m); return true; }
  if (!isTeam()){ for (const E of R.conns) if (E.role === "player") nsend(E.c, m); return true; }
  if (m.t === "cf"){ const me = R.roster.get(PROF.id); cfPropose(R, me.side, PROF.name); }
  return true;
}
function roomLeave(silent){
  const R = NET.room; if (!R) return;
  NET.room = null; sessClear(); RCV.on = false; clearTimeout(RCV.t);
  if (R.host){
    clearInterval(R.tick);
    roomBroadcast(R, { t: "closed" });
    setTimeout(() => { for (const E of R.conns) try { E.c.close(); } catch (e) {} try { R.peer.destroy(); } catch (e) {} }, 350);
    lobbyHb();
  } else { R.leaving = true; nsend(R.conn, { t: "bye" }); setTimeout(() => { try { R.conn.close(); } catch (e) {} }, 200); }
  S7.team && S7.team.reset();
  if (!silent) S7.ui && S7.ui.refresh("room");
}
const startCfg = () => ({ mode: GAME.mode, tempo: GAME.tempo, clock: [GAME.start, GAME.end], rwin: GAME.rwin, first: GAME.first, room: GAME.room });
function roomStart(){
  const R = NET.room; if (!R || !R.host || R.status === "game") return false;
  const cs = R.roster.canStart(); if (!cs.ok){ toast(cs.msg); return false; }
  const me = R.roster.get(PROF.id); R.side = me.side;
  R.status = "game"; R.roster.locked = true; R.roster.resetReady(); R.botFor = {}; R.cf = null;
  R.hub.cp.clear(); R.hub.pings = new (TM().PingBook)();
  startGame({ mode: R.mode, ctx: "online", ctrl: { [R.side]: "me", [other(R.side)]: "remote" }, tempo: R.tempo, room: { code: R.code, tour: R.tour, team2: R.team2 } });
  const cfg = startCfg();
  for (const E of R.conns){ E.full = true; if (E.role) nsend(E.c, { t: "start", cfg }); }
  R.hub.pushRoom(); lobbyHb();
  S7.ui && S7.ui.enterGame();
  S7.team && S7.team.start();
  return true;
}
function guestStart(R, cfg){
  if (!cfg || !MODES[cfg.mode]) return;
  const me = R.role === "player" ? R.side : null;
  // повернення в той самий бій: стан приходить повним знімком — світ не скидаємо
  if (GAME.on && GAME.puppet && !GAME.over && GAME.room && cfg.room && GAME.room.code === cfg.room.code && !!GAME.spec === !me){
    SNAP.tRecv = performance.now(); return;
  }
  startGame({ mode: cfg.mode, ctx: "online", puppet: true, tempo: cfg.tempo, clock: cfg.clock, rwin: cfg.rwin, first: cfg.first, room: cfg.room,
              ctrl: me ? { [me]: "me", [other(me)]: "remote" } : { ua: "none", ru: "none" } });
  GAME.spec = !me;
  SNAP.tRecv = performance.now();
  S7.ui && S7.ui.enterGame();
  S7.team && S7.team.start();
}
/* кінець бою в мережевій кімнаті (на стороні власника) */
function roomGameOver(res){
  const R = NET.room; if (!R || !R.host) return;
  roomBroadcast(R, { t: "over", res });
  R.status = "wait"; R.roster.locked = false; R.roster.resetReady(); R.botFor = {}; R.cf = null;
  for (const p of R.roster.players.slice()) if (p.away){ R.roster.remove(p.id); }
  R.hub.pushRoom(); lobbyHb();
  if (R.tour){
    const g = R.players.find(p => !p.host), h = R.players.find(p => p.host);
    let w = res.winner === "draw" ? (res.pts[R.side] >= res.pts[other(R.side)] ? h : g) : res.winner === R.side ? h : g;
    w = w || h;
    const t = R.tour;
    if (t.org === PROF.id){ const T = NET.tours.find(x => x.tid === t.tid); T && tourResult(T, t.r, t.m, w.id); }
    else sendTo(t.org, { t: "tres", tid: t.tid, r: t.r, m: t.m, w: w.id });
  }
}

/* ---------- ролі: права гравця на команди (кожен вид керування закріплений за роллю; один активний гравець у команді керує всім) ---------- */
function myEffRole(){
  const R = NET.room, p = myPlayer(R);
  return !p ? "both" : R.host ? R.roster.effRole(p) : (p.er || p.role || "both");
}
function teamOk(kind){
  if (!isTeam() || GAME.spec) return true;
  const need = TM().KIND_PERM[kind]; if (!need) return true;
  return !!TM().ROLES[myEffRole()].perms[need];
}
function teamDeny(kind){
  const need = TM().KIND_PERM[kind], r = TM().ROLES[myEffRole()];
  toast(`Ваша роль — ${r.n}: ${need === "ad" ? "керування ППО" : "пуски, виробництво й логістика"} веде інший гравець команди (роль можна змінити в панелі КП)`, "warn");
}
/* готовність у підготовці: у 2×2 сторона готова, коли готові всі її гравці */
function teamMarkReady(id){
  const R = NET.room; if (!R || !R.host) return;
  R.roster.setReady(id);
  for (const sd of ["ua", "ru"]) GAME.ready[sd] = R.roster.sideReady(sd);
  R.hub.pushRoom(); checkReady();
}
