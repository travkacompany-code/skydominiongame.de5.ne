/* ======================================================================
   BV_TEAM — режим 2×2 («BANGVECTOR 2 · етап 6»). Чистий модуль, без DOM і мережі.
   • Roster  — склад кімнати: команди (по 2), ролі, права, відключення / повернення, готовність.
   • Hub     — «диспетчер кімнати» на боці власника: приймає повідомлення від гравців і глядачів,
               розсилає їх лише тим, кому вони призначені (командний чат, позначки, журнал КП),
               відновлює сесію гравця, що повернувся. Транспорт (PeerJS) і гра підключаються колбеками.
   • CpLog / PingBook — журнал подій командного пункту й позначки на карті (окремо для кожної сторони).
   • cpSummary / cpTargets / diffContacts — дані для інтерфейсу КП ППО.
   Ролі: cmd — Командувач (пуски, ПУ, виробництво, логістика, пальне), pvo — Начальник ППО (зенітні засоби,
   тривоги), both — обидві. Якщо в команді лишився один активний гравець — він керує всім (ефективна роль both).
   ====================================================================== */
(function (root) {
  "use strict";
  const CFG = { cap: 2, grace: 120, logMax: 120, chatMax: 150, chatLen: 200, pingTtl: 30, pingMax: 8, pingGap: 1.2, histMax: 60 };
  const ROLES = {
    cmd: { n: "Командувач", s: "КМД", perms: { cmd: 1 } },
    pvo: { n: "Начальник ППО", s: "ППО", perms: { ad: 1 } },
    both: { n: "Командувач + ППО", s: "КМД+ППО", perms: { cmd: 1, ad: 1 } }
  };
  const KIND_PERM = { launch: "cmd", tel: "cmd", sea: "cmd", fpv: "cmd", eco: "cmd", logi: "cmd", fuel: "cmd", ad: "ad" };
  const PING_KINDS = { warn: "Увага", atk: "Атака", def: "Оборона", move: "Рух" };
  const QUICK = [
    { k: "air", t: "Повітряна тривога!" }, { k: "need", t: "Потрібне прикриття ППО" }, { k: "ammo", t: "Закінчується боєкомплект" },
    { k: "go", t: "Починаю пуск" }, { k: "ok", t: "Прийняв" }, { k: "wait", t: "Чекайте" }, { k: "foe", t: "Бачу ціль" }, { k: "help", t: "Потрібна допомога" }
  ];
  const other = sd => sd === "ua" ? "ru" : "ua";
  const SIDES = ["ua", "ru"];
  const clip = (s, n) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n);
  const okSide = s => s === "ua" || s === "ru";

  /* ------------------------------ склад кімнати ------------------------------ */
  class Roster {
    constructor(o) {
      o = o || {};
      this.team2 = !!o.team2; this.cap = this.team2 ? CFG.cap : 1; this.grace = o.grace || CFG.grace;
      this.players = []; this.seq = 0; this.locked = false; this.hostSide = o.hostSide || "ua";
    }
    get(id) { return this.players.find(p => p.id === id) || null; }
    on(side) { return this.players.filter(p => p.side === side); }
    act(side) { return this.players.filter(p => p.side === side && !p.away); }
    free(side) { return this.cap - this.on(side).length; }
    lead(side) { const a = this.act(side); return a.find(p => p.host) || a.slice().sort((x, y) => x.n - y.n)[0] || null; }
    effRole(p) { return !p || p.away ? (p && p.role) || "both" : this.cap < 2 || this.act(p.side).length < 2 ? "both" : p.role; }
    can(id, kind) {
      const p = this.get(id); if (!p) return false;
      const need = KIND_PERM[kind]; if (!need) return true;
      return !!ROLES[this.effRole(p)].perms[need];
    }
    _defRole(side, except) {
      if (this.cap < 2) return "both";
      const o = this.on(side).filter(x => x !== except)[0];
      return !o ? "cmd" : o.role === "cmd" ? "pvo" : o.role === "pvo" ? "cmd" : "pvo";
    }
    join(prof, o) {
      o = o || {};
      const fail = msg => ({ ok: false, msg });
      const ex = this.get(prof.id);
      if (ex) {
        if (ex.host && !o.host) return fail("Ви вже власник цієї кімнати");
        if (ex.away) { ex.away = false; ex.awayAt = 0; }
        ex.name = prof.name; ex.xp = prof.xp; ex.rp = prof.rp || 0;
        return { ok: true, p: ex, rejoin: true };
      }
      if (this.locked) return fail("Бій уже триває");
      let side = null;
      if (okSide(o.side) && this.free(o.side) > 0) side = o.side;
      else {
        const c = SIDES.filter(s => this.free(s) > 0).sort((a, b) => this.on(a).length - this.on(b).length || ((a === this.hostSide) - (b === this.hostSide)));
        side = c[0] || null;
      }
      if (!side) return fail("Кімнату заповнено");
      const p = { id: prof.id, name: prof.name, xp: prof.xp, rp: prof.rp || 0, side, role: this._defRole(side), host: !!o.host, away: false, awayAt: 0, n: ++this.seq, ready: false };
      this.players.push(p); this.fixRoles(side);
      return { ok: true, p, rejoin: false };
    }
    fixRoles(side) {
      const a = this.act(side).sort((x, y) => x.n - y.n);
      if (this.cap > 1 && a.length === 2 && a[0].role === a[1].role && a[0].role !== "both") a[1].role = a[0].role === "cmd" ? "pvo" : "cmd";
    }
    setRole(byId, targetId, role) {
      const by = this.get(byId), t = this.get(targetId);
      if (!ROLES[role]) return { ok: false, msg: "Невідома роль" };
      if (!by || !t) return { ok: false, msg: "Гравця не знайдено" };
      if (this.cap < 2) return { ok: false, msg: "Ролі діють лише в режимі 2×2" };
      const lead = this.lead(t.side);
      if (!(by.host || by.id === t.id || (by.side === t.side && lead && lead.id === by.id))) return { ok: false, msg: "Роль іншого гравця змінює лише його командир або власник кімнати" };
      if (t.role === role) return { ok: true, changed: [] };
      t.role = role; const changed = [t.id];
      const mate = this.on(t.side).find(x => x !== t);
      if (mate && mate.role === role && role !== "both") { mate.role = role === "cmd" ? "pvo" : "cmd"; changed.push(mate.id); }
      return { ok: true, changed };
    }
    move(byId, id, side) {
      const by = this.get(byId), t = this.get(id);
      if (!by || !by.host) return { ok: false, msg: "Склад команд змінює лише власник кімнати" };
      if (this.locked) return { ok: false, msg: "Бій уже триває" };
      if (!t || !okSide(side)) return { ok: false, msg: "Гравця не знайдено" };
      if (t.side === side) return { ok: true, changed: [] };
      if (this.free(side) <= 0) return { ok: false, msg: "У цій команді немає вільних місць" };
      const old = t.side; t.side = side; t.ready = false;
      t.role = this._defRole(side, t); this.fixRoles(side); this.fixRoles(old);
      if (t.host) this.hostSide = side;
      return { ok: true, changed: [t.id] };
    }
    remove(id) {
      const i = this.players.findIndex(p => p.id === id); if (i < 0) return null;
      const p = this.players.splice(i, 1)[0]; this.fixRoles(p.side); return p;
    }
    setAway(id, now) { const p = this.get(id); if (!p || p.host) return null; p.away = true; p.awayAt = now; return p; }
    expire(now) {
      const out = [];
      for (const p of this.players.slice()) if (p.away && now - p.awayAt >= this.grace) out.push(this.remove(p.id));
      return out;
    }
    setReady(id) { const p = this.get(id); if (p) p.ready = true; return !!p; }
    sideReady(side) { const a = this.act(side); return a.length === 0 || a.every(p => p.ready); }
    allReady() { return SIDES.every(s => this.sideReady(s)); }
    resetReady() { for (const p of this.players) p.ready = false; }
    canStart() {
      const n = s => this.act(s).length;
      if (!n("ua") || !n("ru")) return { ok: false, msg: "У кожній команді має бути хоча б один гравець" };
      return { ok: true, full: n("ua") === this.cap && n("ru") === this.cap };
    }
    info() { return this.players.map(p => ({ id: p.id, name: p.name, xp: p.xp, rp: p.rp || 0, side: p.side, host: !!p.host, role: p.role, er: this.effRole(p), away: !!p.away, ready: !!p.ready })); }
  }

  /* ------------------------------ повідомлення ------------------------------ */
  function chatVisible(m, v) {
    v = v || {};
    if (!m) return false;
    if (m.ch === "team") return !v.spec && !!v.side && v.side === m.side;
    if (m.ch === "sys") return !m.side || !!v.spec || v.side === m.side;
    return true;
  }
  function makeMsg(roster, fromId, text, ch, ts) {
    const p = roster.get(fromId), t = clip(text, CFG.chatLen);
    if (!p || !t) return null;
    return { id: p.id, name: p.name, side: p.side, text: t, ch: ch === "team" && roster.team2 ? "team" : "all", ts: ts || Date.now(), role: p.role };
  }
  const sysMsg = (text, side, ts) => ({ id: "sys", name: "", side: side || null, text: clip(text, CFG.chatLen), ch: "sys", ts: ts || Date.now() });

  /* ------------------------------ позначки на карті ------------------------------ */
  class PingBook {
    constructor() { this.list = []; this.seq = 0; this.last = new Map(); }
    add(side, byId, name, pos, kind, now) {
      if (!okSide(side) || !Array.isArray(pos) || !(Math.abs(pos[0]) <= 180) || !(Math.abs(pos[1]) <= 90)) return null;
      if (!PING_KINDS[kind]) kind = "warn";
      const lt = this.last.get(byId); if (lt != null && now - lt < CFG.pingGap) return null;
      this.last.set(byId, now); this.prune(now);
      const mine = this.list.filter(p => p.side === side);
      if (mine.length >= CFG.pingMax) this.list.splice(this.list.indexOf(mine[0]), 1);
      const p = { id: ++this.seq, side, by: byId, name: clip(name, 22), pos: [+pos[0], +pos[1]], k: kind, t: now, ttl: CFG.pingTtl };
      this.list.push(p); return p;
    }
    prune(now) { this.list = this.list.filter(p => now - p.t < p.ttl); }
    active(side, now) { this.prune(now); return this.list.filter(p => p.side === side).map(p => ({ id: p.id, side: p.side, name: p.name, pos: p.pos, k: p.k, left: Math.max(1, Math.round(p.ttl - (now - p.t))) })); }
  }

  /* ------------------------------ журнал КП ------------------------------ */
  class CpLog {
    constructor(max) { this.max = max || CFG.logMax; this.seq = 0; this.by = { ua: [], ru: [] }; }
    add(side, k, text, o) {
      if (!okSide(side)) return null;
      o = o || {}; const l = this.by[side], t = o.t || 0, x = clip(text, 160);
      const last = l[l.length - 1];
      if (last && last.x === x && last.k === k && t - last.t < 2) { last.c = (last.c || 1) + 1; return null; }
      const e = { id: ++this.seq, side, k, x, t, ll: o.ll && isFinite(o.ll[0]) && isFinite(o.ll[1]) ? [+o.ll[0], +o.ll[1]] : null, c: 1 };
      l.push(e); if (l.length > this.max) l.shift(); return e;
    }
    last(side, n) { return okSide(side) ? this.by[side].slice(-(n || 40)) : []; }
    clear() { this.by = { ua: [], ru: [] }; }
  }

  /* ------------------------------ диспетчер кімнати ------------------------------ */
  /* o: roster, send(eid, msg), closeEp(eid), now() — секунди, info() → частина roomInfo (код, режим…), local(msg) — повідомлення власнику,
        hooks: { away(p), back(p), gone(p), joined(p), left(p), changed() }, pub, tour */
  class Hub {
    constructor(o) {
      this.o = o; this.roster = o.roster; this.eps = new Map(); this.chat = []; this.cp = new CpLog(); this.pings = new PingBook();
      this.seq = 0; this.specs = 0; this.inGame = () => !!(o.inGame && o.inGame());
      this.H = null;
    }
    hooks(n, ...a) { const f = this.o.hooks && this.o.hooks[n]; if (f) try { f(...a); } catch (e) { console.error(e); } }
    now() { return this.o.now(); }
    setHost(prof, side) {
      this.roster.hostSide = side;
      const r = this.roster.join(prof, { host: true, side });
      this.H = r.p; this.eps.set("H", { eid: "H", role: "player", id: prof.id, virtual: true });
      return r;
    }
    ep(eid) { return this.eps.get(eid) || null; }
    viewer(ep) { const p = ep.role === "player" ? this.roster.get(ep.id) : null; return { side: p ? p.side : null, spec: ep.role === "spec" }; }
    send(eid, m) { if (eid === "H") { this.o.local && this.o.local(m); } else this.o.send(eid, m); }
    each(fn) { for (const ep of [...this.eps.values()]) fn(ep); }
    /* інформація про кімнату для конкретного учасника: ролі противника приховано (це тактична інформація команди) */
    room(ep) {
      let pl = this.roster.info();
      const me = ep && ep.role === "player" ? this.roster.get(ep.id) : null;
      if (me) pl = pl.map(p => p.side === me.side ? p : Object.assign({}, p, { role: "", er: "" }));
      return Object.assign({}, this.o.info(), { specs: this.specs, players: pl, team2: this.roster.team2 });
    }
    pushRoom() { this.each(ep => this.send(ep.eid, { t: "room", r: this.room(ep) })); this.hooks("changed"); }
    /* розсилка повідомлення чату лише тим, кому воно призначене */
    deliverChat(m) {
      this.chat.push(m); if (this.chat.length > CFG.chatMax) this.chat.shift();
      this.each(ep => { if (chatVisible(m, this.viewer(ep))) this.send(ep.eid, { t: "chat", m }); });
    }
    historyFor(ep) { const v = this.viewer(ep); return this.chat.filter(m => chatVisible(m, v)).slice(-CFG.histMax); }
    sys(text, side) { this.deliverChat(sysMsg(text, side, this.o.ts ? this.o.ts() : Date.now())); }
    welcome(ep, rejoin) {
      const p = ep.role === "player" ? this.roster.get(ep.id) : null, now = this.now();
      this.send(ep.eid, { t: "welcome", role: ep.role, side: p ? p.side : null, r: this.room(ep), chat: this.historyFor(ep), rejoin: !!rejoin,
        log: p ? this.cp.last(p.side, 40) : [], pg: p ? this.pings.active(p.side, now) : [] });
    }
    /* вхід або повернення. m = { role, prof } */
    hello(eid, m) {
      const o = this.o, rej = msg => { o.send(eid, { t: "reject", msg }); setTimeout(() => o.closeEp && o.closeEp(eid), 400); return { ok: false }; };
      const prof = m.prof, game = this.inGame();
      if (m.role === "spec") {
        if (!o.pub) return rej("Приватна кімната: режим глядача доступний лише в публічних кімнатах");
        const old = this.dupOf(eid, prof.id, "spec"); if (old) this.kill(old);
        this.eps.set(eid, { eid, role: "spec", id: prof.id, name: prof.name }); this.specs++;
        this.welcome(this.ep(eid), game); this.pushRoom();
        return { ok: true, spec: true, rejoin: false };
      }
      if (o.tour && o.tour.ids && !o.tour.ids.includes(prof.id)) return rej("Це кімната турнірного матчу для інших учасників");
      const ex = this.roster.get(prof.id);
      if (game && !ex) return rej(o.pub ? "Бій уже триває — приєднайтеся як глядач" : "Бій уже триває");
      this.roster.locked = game;
      const r = this.roster.join(prof, { side: m.side });
      if (!r.ok) return rej(r.msg + (o.pub && /заповнено/.test(r.msg) ? " — можна приєднатися як глядач" : ""));
      const old = this.dupOf(eid, prof.id, "player"); if (old) this.kill(old);
      this.eps.set(eid, { eid, role: "player", id: prof.id, name: prof.name });
      const p = r.p;
      this.welcome(this.ep(eid), r.rejoin && game);
      if (r.rejoin && game) {
        this.sys(`${p.name} повернувся в бій`, p.side); this.hooks("back", p);
      } else if (!r.rejoin) {
        this.sys(`${p.name} приєднався до команди «${p.side === "ua" ? "Україна" : "Росія"}»`, null); this.hooks("joined", p);
      }
      this.pushRoom();
      return { ok: true, p, rejoin: r.rejoin };
    }
    dupOf(eid, id, role) { for (const e of this.eps.values()) if (e.eid !== eid && !e.virtual && e.id === id && e.role === role) return e; return null; }
    kill(ep) { this.eps.delete(ep.eid); ep.dead = true; if (ep.role === "spec") this.specs = Math.max(0, this.specs - 1); try { this.o.closeEp && this.o.closeEp(ep.eid); } catch (e) { /* */ } }
    /* зв'язок з гравцем / глядачем розірвано */
    drop(eid) {
      const ep = this.eps.get(eid); if (!ep || ep.virtual) return null;
      this.eps.delete(eid);
      if (ep.role === "spec") { this.specs = Math.max(0, this.specs - 1); this.pushRoom(); return { spec: true }; }
      const p = this.roster.get(ep.id); if (!p) return null;
      if (this.inGame()) {
        this.roster.setAway(p.id, this.now());
        this.sys(`${p.name} втратив зв'язок — ${this.roster.grace} с на повернення`, p.side);
        this.hooks("away", p); this.pushRoom();
        return { away: true, p };
      }
      this.roster.remove(p.id); this.roster.resetReady();
      this.sys(`${p.name} залишив кімнату`, null); this.hooks("left", p); this.pushRoom();
      return { left: true, p };
    }
    /* гравець свідомо виходить (bye) */
    leave(eid) {
      const ep = this.eps.get(eid); if (!ep || ep.virtual || ep.role !== "player") return this.drop(eid);
      const p = this.roster.get(ep.id); this.eps.delete(eid);
      if (!p) return null;
      this.roster.remove(p.id); this.sys(`${p.name} залишив ${this.inGame() ? "бій" : "кімнату"}`, this.inGame() ? p.side : null);
      this.hooks(this.inGame() ? "gone" : "left", p); this.pushRoom(); return { left: true, p };
    }
    tick() {
      const gone = this.roster.expire(this.now());
      for (const p of gone) { this.sys(`${p.name} не повернувся — місце звільнено`, p.side); this.hooks("gone", p); }
      if (gone.length) this.pushRoom();
      this.pings.prune(this.now());
      return gone;
    }
    /* повідомлення від клієнта. Повертає true, якщо оброблено тут. */
    msg(eid, m) {
      const ep = this.eps.get(eid); if (!ep || !m || typeof m !== "object") return false;
      const p = ep.role === "player" ? this.roster.get(ep.id) : null;
      switch (m.t) {
        case "chat": {
          if (!p) return true;
          const c = makeMsg(this.roster, p.id, m.text, m.ch, this.o.ts ? this.o.ts() : Date.now()); if (c) this.deliverChat(c); return true;
        }
        case "ping": {
          if (!p || !this.roster.team2 || !this.inGame()) return true;
          const g = this.pings.add(p.side, p.id, p.name, m.pos, m.k, this.now()); if (!g) return true;
          const left = g.ttl;
          this.each(e => { const v = this.viewer(e); if (!v.spec && v.side === p.side) this.send(e.eid, { t: "ping", p: { id: g.id, side: g.side, name: g.name, pos: g.pos, k: g.k, left } }); });
          return true;
        }
        case "role": {
          if (!p) return true;
          const r = this.roster.setRole(p.id, String(m.id), m.role);
          if (!r.ok) { this.send(eid, { t: "toast", msg: r.msg }); return true; }
          if (r.changed.length) { const t = this.roster.get(String(m.id)); this.sys(`${t.name}: роль — ${ROLES[t.role].n}`, t.side); this.pushRoom(); }
          return true;
        }
        case "move": {
          if (!p) return true;
          const r = this.roster.move(p.id, String(m.id), m.side);
          if (!r.ok) { this.send(eid, { t: "toast", msg: r.msg }); return true; }
          if (r.changed.length) { const t = this.roster.get(String(m.id)); this.sys(`${t.name} переведено до команди «${t.side === "ua" ? "Україна" : "Росія"}»`, null); this.pushRoom(); }
          return true;
        }
        case "bye": this.leave(eid); return true;
      }
      return false;
    }
    /* дозвіл на ігрову команду гравця (kind: launch / ad / eco …) */
    allow(eid, kind) { const ep = this.eps.get(eid); if (!ep || ep.role !== "player") return false; return this.roster.can(ep.id, kind); }
    sideOf(eid) { const ep = this.eps.get(eid); const p = ep && ep.role === "player" ? this.roster.get(ep.id) : null; return p ? p.side : null; }
    /* запис у журнал КП й розсилка лише своїй стороні (і глядачам) */
    log(side, k, text, o) {
      const e = this.cp.add(side, k, text, o); if (!e) return null;
      this.each(ep => { const v = this.viewer(ep); if (v.spec || v.side === side) this.send(ep.eid, { t: "tlog", e }); });
      return e;
    }
  }

  /* ------------------------------ дані для КП ------------------------------ */
  function cpSummary(list, o) {
    o = o || {}; const nm = o.name || (k => k);
    const S = { n: 0, ready: 0, reload: 0, base: 0, other: 0, noAmmo: 0, damaged: 0, down: 0, auto: 0, engaged: 0, kills: 0, fired: 0, hp: 0, types: [] };
    const bt = new Map();
    for (const u of list) {
      S.n++;
      const hp = u.hp == null ? 1 : u.hp; S.hp += hp;
      if (hp < 0.3) S.down++; else if (hp < 0.65) S.damaged++;
      if (u.state === "ready") S.ready++; else if (u.state === "reload") S.reload++; else if (u.state === "base") S.base++; else S.other++;
      if ((u.mag | 0) <= 0 && !(u.reserve > 0)) S.noAmmo++;
      if (u._auto) S.auto++;
      if (u.engaged) S.engaged++;
      S.kills += u.kills | 0; S.fired += u.fired | 0;
      const t = bt.get(u.key) || { key: u.key, name: nm(u.key), n: 0, mag: 0 }; t.n++; t.mag += u.mag | 0; bt.set(u.key, t);
    }
    S.hp = S.n ? S.hp / S.n : 1; S.types = [...bt.values()].sort((a, b) => b.n - a.n);
    return S;
  }
  /* contacts: [{id, st, conf, age, ll, hdg, spd, nm, cat}] (spd — км/с ігрового часу) */
  function cpTargets(contacts, o) {
    o = o || {}; const dist = o.dist || (() => Infinity), assets = o.assets || [], eng = o.engaged || new Map();
    const out = [];
    for (const c of contacts) {
      if (!c || c.k === "gnd") continue;
      let best = null, bd = Infinity;
      for (const a of assets) { const d = dist(c.ll, a.pos); if (d < bd) { bd = d; best = a; } }
      const spd = c.spd > 0.02 ? c.spd : 0;
      out.push({ id: c.id, label: c.nm || c.cat || "ціль", st: c.st, conf: c.conf, age: c.age || 0, ll: c.ll, hdg: c.hdg, spd,
        near: best ? { name: best.name, km: bd } : null, eta: best && spd ? bd / spd : null, eng: eng.get(c.id) || 0 });
    }
    out.sort((a, b) => (a.eta == null) - (b.eta == null) || (a.eta || 0) - (b.eta || 0) || a.age - b.age);
    return out;
  }
  const FIRM = { tracking: 1, identified: 1 };
  /* події за зміною картини РЛС сторони: prev — Map id → {st, nm}; повертає { events, next } */
  function diffContacts(prev, contacts) {
    const next = new Map(), ev = [];
    for (const c of contacts) {
      if (!c || c.k === "gnd") continue;
      next.set(c.id, { st: c.st, nm: c.nm || null, cat: c.cat || null, ll: c.ll });
      const p = prev.get(c.id), name = c.nm || c.cat || "повітряна ціль";
      if (!p) { if (c.st !== "preliminary" && c.st !== "lost") ev.push({ k: "det", x: `Виявлено: ${name}${c.hdg != null ? ", курс " + Math.round(c.hdg) + "°" : ""}`, ll: c.ll, id: c.id }); }
      else {
        if (p.st === "preliminary" && c.st !== "preliminary" && c.st !== "lost") ev.push({ k: "det", x: `Виявлено: ${name}`, ll: c.ll, id: c.id });
        else if (c.st === "identified" && p.st !== "identified") ev.push({ k: "warn", x: `Ідентифіковано: ${c.nm || name}`, ll: c.ll, id: c.id });
        else if (c.st === "lost" && p.st !== "lost" && (FIRM[p.st] || p.st === "detected")) ev.push({ k: "lost", x: `Контакт втрачено: ${p.nm || p.cat || name}`, ll: c.ll, id: c.id });
      }
    }
    for (const [id, p] of prev) if (!next.has(id) && p.st !== "lost") ev.push({ k: "lost", x: `Контакт зник: ${p.nm || p.cat || "ціль"}`, ll: p.ll, id });
    return { events: ev, next };
  }

  const API = { CFG, ROLES, KIND_PERM, PING_KINDS, QUICK, other, Roster, Hub, PingBook, CpLog, chatVisible, makeMsg, sysMsg, cpSummary, cpTargets, diffContacts, clip };
  root.BV_TEAM = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
