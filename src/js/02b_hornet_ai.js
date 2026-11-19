/* SKYDOMINION · ІІ тактичного БпЛА «Хорнет» (ігрова абстракція автономного пошуку)
   ---------------------------------------------------------------------------------
   Модуль чистий: не знає про мапу, MapLibre і гру. Працює в локальних координатах (км: x — схід, y — північ)
   з центром у «районі пошуку». Усе, що знає про світ, приходить через `env` (див. step):
     env.vis                  0..1   видимість (час доби / погода)
     env.ew(p)                0..1   рівень придушення зв'язку й навігації в точці p
     env.threat(p)            0..1   небезпека ППО в точці p
     env.candidates(p, r)     [{id,x,y,value,conceal,decoy?}]   ігрові об'єкти поблизу p
     env.alive(id)            чи ціль ще існує (її могли знищити інші засоби)
   Усі числа — ігрові умовні величини, а не характеристики реальних систем; баланс — лише в таблиці P.

   Автомат станів:   search → track → classify → (await) → engage → strike
                         ↑________|________|________|
   Рішення пояснюються: b.log (explain) — чому дрон обрав/відкинув контакт, чому змінив стан.
   Детермінізм: усі випадковості — з власного генератора (seed), тому сценарії відтворювані й тестовані. */
(function (root) {
  "use strict";

  /* ---------- єдина таблиця балансу (км, с) ---------- */
  const P = {
    areaR: 8,            // радіус району пошуку навколо точки, яку вказав гравець
    sweep: 3.4,          // відстань між галсами пошуку
    detR: 3.0,           // радіус виявлення при ідеальній видимості
    searchSpd: 0.65,     // частка крейсерської швидкості під час пошуку
    trackSpd: 0.75,      // частка швидкості під час супроводу
    diveSpd: 1.25,       // множник швидкості в атаці
    gain: 0.85,          // швидкість наростання впевненості в контакті (1/с, ідеальні умови)
    decay: 0.07,         // спад впевненості контакту, що випав з огляду (1/с)
    confTrack: 0.2,      // з якої впевненості контакт береться в супровід (слабкий сигнал — іде перевіряти)
    confId: 0.7,         // впевненість, за якої запускається розпізнавання
    decide: 1.0,         // с на розпізнавання й рішення
    retargetCd: 8,       // с — «охолодження» зміни цілі (проти метання між цілями)
    switchK: 1.25,       // нова ціль має бути кращою щонайменше в стільки разів
    bingoKm: 14,         // залишок ходу, з якого дрон іде на «останній шанс»
    lastChanceConf: 0.3, // мінімальна впевненість для атаки «останнього шансу»
    clutterPerMin: 1.1,  // хибні контакти за хвилину (при поганій видимості більше)
    clutterTtl: 12,      // с життя хибного контакту
    foolBase: 0.22,      // базова ймовірність прийняти хибний контакт/приманку за ціль (за поганої видимості)
    foolEw: 0.28,        // додаток від придушення
    foolDecoy: 0.12,     // приманка переконливіша за випадкову заваду
    missSigma: 0.42,     // км — розкид точки влучання при ідеальних умовах
    navDrift: 0.035,     // км/с — дрейф навігації при придушенні
    linkLostEw: 0.7,     // рівень придушення, з якого зв'язок з оператором втрачено
    confirmTimeout: 20,  // с очікування підтвердження оператора
    blackSec: 60,        // с, скільки відкинутий контакт ігнорується
    maxSub: 0.25,        // с — максимальний підкрок (щоб при прискоренні не «проскочити» ціль)
    maxSubs: 60
  };

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const hyp = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

  /* власний генератор (mulberry32): стан зберігається в b.rs, тому мозок серіалізується */
  function rnd(b){
    b.rs = (b.rs + 0x6D2B79F5) >>> 0;
    let t = b.rs;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function gauss(b){ const u = Math.max(1e-9, rnd(b)), v = rnd(b); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  const LABEL = { search: "ІІ-пошук цілі", track: "Супровід контакту", classify: "Розпізнавання цілі", await: "Очікує підтвердження оператора", engage: "Атака цілі" };

  function note(b, msg){
    b.log.push({ t: +b.t.toFixed(1), st: b.st, msg });
    if (b.log.length > 80) b.log.shift();
  }
  function setState(b, st, msg){ if (b.st !== st){ b.st = st; } note(b, msg); }

  /* розширювана спіраль від точки, яку вказав гравець: найімовірніші місця оглядаються першими, паливо не марнується */
  function spiral(R, spacing, phase){
    const out = [[0, 0]];
    for (let th = 0.4; ; ){
      const r = spacing * th / (2 * Math.PI);
      if (r >= R){ out.push([Math.sin(th + phase) * R, Math.cos(th + phase) * R]); break; }
      out.push([Math.sin(th + phase) * r, Math.cos(th + phase) * r]);
      th += Math.min(0.8, 1.2 / Math.max(r, 0.6));
    }
    return out;
  }
  const pathLen = w => { let L = 0; for (let i = 1; i < w.length; i++) L += Math.hypot(w[i][0] - w[i - 1][0], w[i][1] - w[i - 1][1]); return L; };

  /* ---------- створення ---------- */
  function create(o){
    const R = o.areaR || P.areaR;
    const b = {
      v: 1, id: o.id | 0, t: 0, st: "search", R,
      p: [o.x || 0, o.y || 0], hdg: o.hdg || 0, h: 1,
      drift: [0, 0], dh: 0,
      fuel: o.fuelKm, spd: o.speedKms, roe: o.roe === "confirm" ? "confirm" : "auto", lostLink: o.lostLink === "ditch" ? "ditch" : "autonomous",
      rs: ((o.seed | 0) || 1) >>> 0,
      legs: [], li: 0, pass: 1,
      contacts: {}, black: {}, cur: null, cd: 0, timer: 0, nid: 1, clutterT: 0,
      confirmed: false, flown: 0, switches: 0, res: null, log: []
    };
    b.legs = spiral(R, P.sweep, 0);
    b.clutterT = 6 + rnd(b) * 10;
    note(b, `Початок пошуку: район R=${R} км, спіраль ≈ ${Math.round(pathLen(b.legs))} км, запас ходу ${Math.round(b.fuel)} км, режим «${b.roe === "auto" ? "автономний" : "з підтвердженням оператора"}»`);
    return b;
  }

  /* рух: pursue=true — на контакт (за власним датчиком, фактична позиція); інакше — за навігаційною оцінкою (з дрейфом) */
  function move(b, tx, ty, mul, dt, belief){
    const bx = belief ? b.p[0] - b.drift[0] : b.p[0], by = belief ? b.p[1] - b.drift[1] : b.p[1];
    const dx = tx - bx, dy = ty - by, d = Math.hypot(dx, dy), step = Math.min(d, b.spd * mul * dt);
    if (d > 1e-6){
      b.p[0] += dx / d * step; b.p[1] += dy / d * step;
      const want = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360, dd = ((want - b.hdg + 540) % 360) - 180;
      b.hdg = (b.hdg + dd * Math.min(1, 6 * dt) + 360) % 360;
    }
    b.fuel -= step; b.flown += step;
    return d - step;
  }

  const score = (b, k, env) => {
    const th = env.threat ? clamp(env.threat([k.x, k.y]), 0, 1) : 0;
    return k.value * k.conf * (1 - 0.6 * th) / (1 + hyp(b.p[0], b.p[1], k.x, k.y) / 10);
  };

  /* ---------- сприйняття: виявлення, пам'ять, хибні контакти ---------- */
  function perceive(b, env, dt, vis, ew){
    const detR = P.detR * (0.45 + 0.55 * vis), seen = {};
    const list = env.candidates ? env.candidates(b.p, detR + 1) : [];
    for (const c of list){
      if (b.black[c.id] > b.t) continue;
      const d = hyp(b.p[0], b.p[1], c.x, c.y);
      if (d > detR) continue;
      let k = b.contacts[c.id];
      if (!k) k = b.contacts[c.id] = { id: c.id, conf: 0, phantom: false };
      k.x = c.x; k.y = c.y; k.value = c.value == null ? 0.5 : c.value; k.conceal = c.conceal || 0; k.decoy = !!c.decoy; k.name = c.name;
      const rate = P.gain * vis * (1 - clamp(k.conceal, 0, 0.9)) * (1 - 0.6 * ew) * (1 - d / detR);
      k.conf = Math.min(1, k.conf + rate * dt);
      seen[c.id] = 1;
    }
    /* хибні контакти (завади, відблиски, тепло місцевості): чим гірша видимість — тим частіше */
    b.clutterT -= dt;
    if (b.clutterT <= 0){
      const bad = clamp(1.2 - vis + ew * 0.5, 0.3, 2);
      b.clutterT = -Math.log(Math.max(1e-6, rnd(b))) * 60 / (P.clutterPerMin * bad);
      const a = rnd(b) * 6.283, r = detR * (0.3 + 0.6 * rnd(b)), id = "ph" + (b.nid++);
      b.contacts[id] = { id, conf: 0.12 + 0.16 * rnd(b), phantom: true, ttl: P.clutterTtl, x: b.p[0] + Math.sin(a) * r, y: b.p[1] + Math.cos(a) * r, value: 0.5, conceal: 0, decoy: false };
    }
    for (const id in b.contacts){
      const k = b.contacts[id];
      if (k.phantom){
        k.ttl -= dt;
        const d = hyp(b.p[0], b.p[1], k.x, k.y);
        if (d < detR) k.conf = Math.min(1, k.conf + P.gain * vis * 0.6 * (1 - d / detR) * dt);
        if (k.ttl <= 0) delete b.contacts[id];
        continue;
      }
      if (env.alive && !env.alive(id)){ delete b.contacts[id]; if (b.cur === id){ b.cur = null; } continue; }
      if (!seen[id]){ k.conf -= P.decay * dt; if (k.conf < 0.02) delete b.contacts[id]; }
    }
  }

  const best = (b, env, min) => {
    let bk = null, bs = -1;
    for (const id in b.contacts){
      const k = b.contacts[id];
      if (k.conf < min || b.black[id] > b.t) continue;
      const s = score(b, k, env);
      if (s > bs){ bs = s; bk = k; }
    }
    return bk;
  };

  function finish(b, res, msg){ b.res = res; note(b, msg); }
  const tName = k => (k.name ? "«" + k.name + "»" : k.phantom ? "хибний контакт" : "контакт " + k.id);

  /* ---------- один підкрок ---------- */
  function sub(b, dt, env, vis){
    b.t += dt; b.cd = Math.max(0, b.cd - dt);
    const ew = env.ew ? clamp(env.ew(b.p), 0, 1) : 0, linkLost = ew >= P.linkLostEw;
    if (ew > 0.3){                       // навігація деградує: оцінка положення «пливе»
      b.dh += gauss(b) * 0.4 * dt;
      b.drift[0] += Math.sin(b.dh) * P.navDrift * ew * dt; b.drift[1] += Math.cos(b.dh) * P.navDrift * ew * dt;
    }
    perceive(b, env, dt, vis, ew);
    if (b.fuel <= 0){ finish(b, "ditch", "Паливо вичерпано — дрон падає"); return; }

    const k = b.cur != null ? b.contacts[b.cur] : null;
    switch (b.st){
      case "search": {
        if (b.fuel <= P.bingoKm){
          const c = best(b, env, P.lastChanceConf);
          if (c){ b.cur = c.id; b.lastChance = true; setState(b, "engage", `Паливо на межі (${Math.round(b.fuel)} км): «останній шанс» — атака ${tName(c)} (впевненість ${Math.round(c.conf * 100)}%)`); return; }
          finish(b, "ditch", `Паливо на межі (${Math.round(b.fuel)} км), надійних контактів немає — самоліквідація без удару`); return;
        }
        const c = best(b, env, P.confTrack);
        if (c){ b.cur = c.id; setState(b, "track", `Контакт ${tName(c)}: впевненість ${Math.round(c.conf * 100)}% — беру в супровід`); return; }
        if (b.li >= b.legs.length){ b.li = 0; b.pass++; b.legs = spiral(b.R, P.sweep, b.pass * 1.05); note(b, `Район пройдено, повторний прохід №${b.pass}`); }
        const w = b.legs[b.li];
        const left = move(b, w[0], w[1], P.searchSpd, dt, true);
        if (left < 0.4) b.li++;
        break;
      }
      case "track": {
        if (!k){ b.cur = null; setState(b, "search", "Контакт втрачено — повертаюсь до пошуку"); return; }
        const alt = best(b, env, P.confTrack);
        if (alt && alt.id !== k.id && b.cd <= 0 && score(b, alt, env) > score(b, k, env) * P.switchK){
          note(b, `Перемикання: ${tName(alt)} краще за ${tName(k)} (оцінка ${score(b, alt, env).toFixed(2)} проти ${score(b, k, env).toFixed(2)})`);
          b.cur = alt.id; b.cd = P.retargetCd; b.switches++; return;
        }
        if (k.conf >= P.confId){ b.timer = P.decide; setState(b, "classify", `Контакт ${tName(k)} стабільний (${Math.round(k.conf * 100)}%) — розпізнавання`); return; }
        move(b, k.x, k.y, P.trackSpd, dt, false);
        break;
      }
      case "classify": {
        if (!k){ b.cur = null; setState(b, "search", "Контакт зник під час розпізнавання"); return; }
        move(b, k.x, k.y, P.trackSpd * 0.6, dt, false);
        b.timer -= dt;
        if (b.timer > 0) break;
        const fake = k.phantom || k.decoy;
        if (fake){
          const fool = clamp(P.foolBase * (1 - vis) + P.foolEw * ew + (k.decoy ? P.foolDecoy : 0), 0, 0.9);
          if (rnd(b) >= fool){
            b.black[k.id] = b.t + P.blackSec; delete b.contacts[k.id]; b.cur = null;
            setState(b, "search", `Розпізнано: ${tName(k)} — не ціль (${k.decoy ? "приманка" : "завада"}). Відкидаю на ${P.blackSec} с`); return;
          }
          note(b, `ПОМИЛКА розпізнавання: ${tName(k)} прийнято за ціль (ймовірність помилки ${Math.round(fool * 100)}%)`);
        } else note(b, `Розпізнано: ${tName(k)} — валідна ціль`);
        if (b.roe === "confirm"){          // рішення за оператором; політика втрати зв'язку розбирається у стані await
          b.timer = P.confirmTimeout; b.confirmed = false;
          setState(b, "await", linkLost ? "Зв'язок з оператором втрачено — застосовую політику втрати зв'язку" : "Чекаю підтвердження оператора");
        } else setState(b, "engage", "Автономне рішення: атакую");
        return;
      }
      case "await": {
        if (!k){ b.cur = null; setState(b, "search", "Контакт зник, поки чекав підтвердження"); return; }
        move(b, k.x, k.y, P.trackSpd * 0.5, dt, false);
        if (b.confirmed){ setState(b, "engage", "Оператор підтвердив ціль — атакую"); return; }
        if (linkLost){
          if (b.lostLink === "ditch"){ finish(b, "ditch", "Зв'язок втрачено, політика «самоліквідація» — дрон падає"); return; }
          if (k.conf >= 0.9){ setState(b, "engage", "Зв'язок втрачено, впевненість ≥ 90% — автономна атака"); return; }
        }
        b.timer -= dt;
        if (b.timer <= 0){ b.black[k.id] = b.t + 30; b.cur = null; setState(b, "search", "Оператор не підтвердив за відведений час — продовжую пошук"); }
        break;
      }
      case "engage": {
        if (!k){ b.cur = null; b.lastChance = false; setState(b, "search", "Ціль зникла чи вже знищена — відміна атаки"); return; }
        const left = move(b, k.x, k.y, P.diveSpd, dt, false);
        b.h = clamp(left / 6, 0, 1);
        if (left <= 0.05){
          const bad = 1 + 1.2 * ew + 1.5 * (1 - vis), sg = P.missSigma * bad;
          const ex = gauss(b) * sg, ey = gauss(b) * sg;
          b.strike = { x: k.x + ex, y: k.y + ey, target: k.phantom ? null : k.id, phantom: k.phantom, miss: Math.hypot(ex, ey) };
          finish(b, "strike", `Удар: ${k.phantom ? "по хибному контакту (марно)" : "по цілі " + tName(k)}, промах ${b.strike.miss.toFixed(2)} км`);
        }
        break;
      }
    }
  }

  /* ---------- крок (з підкроками) ---------- */
  function step(b, dt, env){
    env = env || {};
    const vis = clamp(env.vis == null ? 1 : env.vis, 0.05, 1);
    let n = Math.max(1, Math.ceil(dt / P.maxSub)); if (n > P.maxSubs) n = P.maxSubs;
    const h = dt / n;
    for (let i = 0; i < n && !b.res; i++) sub(b, h, env, vis);
    return { x: b.p[0], y: b.p[1], hdg: b.hdg, h: b.st === "engage" ? b.h : 0.75, st: b.st, res: b.res, strike: b.res === "strike" ? b.strike : null, fuel: b.fuel };
  }

  const api = {
    P, create, step,
    label: b => { const k = b.cur != null ? b.contacts[b.cur] : null; return LABEL[b.st] + (k && b.st !== "search" ? ": " + (k.name || (k.phantom ? "контакт" : k.id)) : "") + " · ≈" + Math.max(0, Math.round(b.fuel / 5) * 5) + " км"; },
    explain: b => b.log.slice(),
    setRoe: (b, roe) => { b.roe = roe === "confirm" ? "confirm" : "auto"; note(b, "Оператор змінив режим: " + (b.roe === "auto" ? "автономний" : "з підтвердженням")); },
    confirm: b => { if (b.st === "await"){ b.confirmed = true; return true; } return false; }
  };
  root.BV_HORNET_AI = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
