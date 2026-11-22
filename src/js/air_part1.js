  /* ---------- повітряний простір (етап 7.73 · форма запиту й планувальник — етап 7.74) ----------
     Запит доступу до неба сусідніх держав. Запит можливий лише коли одночасно:
       · відносини ≥ RELMIN, · політична сумісність ≥ COMPMIN, · ризик ескалації ≤ RISKMAX.
     Форма запиту (7.74): країна · мета · дата й час початку · строк · тип операції · обсяг · додаткові умови (свої гарантії).
     Далі: очікування рішення → відмова (з причиною й наслідками) / умовний дозвіл (пропозиція з умовами) / повний дозвіл.
     Дозвіл — тимчасовий: вікно [from, until), тип операції, глибина коридору, ліміт (пусків або літаків), заборона балістики,
     заборона застосування зброї, повідомлення про вхід, плата й депозит. Порушення умов = відкликання + удар по репутації.
     У грі: дозвіл типу «msl» відкриває коридор над сушею країни для маршрутів ракет і БпЛА сторони (BV_DIP.airGrid в avoidForeign);
     дозволи авіаційних типів діють для літаків: планувальник перевіряє маршрут (airCheckRoute), а монітор (airMonitor) стежить за
     польотами й попереджає про вихід за межі зони. Без активних дозволів гра поводиться як раніше. */
  const AIRST = ["pl", "ro", "hu", "by", "tr"], TRN = 5;               // держави з небом на мапі; ширина вільної транзитної смуги в грі (клітинок)
  // грубі контури (lon, lat); у розрахунок входять лише клітинки «чужої суші» всередині контуру, решта (Молдова, Литва, Словаччина…) лишається закритою
/*@@AIRPOLY@@*/
  const AIR = {
    RELMIN: 20,            // відносини для запиту
    COMPMIN: 0.40,         // політична сумісність (0…1)
    RISKMAX: 0.60,         // допустимий ризик ескалації (0…1)
    FULLMAX: 0.50,         // вище цього ризику країна дає лише умовний дозвіл
    WAIT: [20, 60],        // очікування рішення, хв гри
    COOL: 90,              // перерва після відмови, хв
    OFFER: 60,             // скільки діє пропозиція умов, хв
    LEAD: 5,               // мінімальне випередження початку, хв
    CELL: 4.5,             // середній розмір клітинки сітки, км
    GRACE: 12,             // секунд реального часу між попередженням і порушенням (монітор)
    SCOPE: {
      corr: { n: "Коридор", km: 90, dur: 180, risk: 0, acc: 0, d: "смуга до 90 км углиб від кордону" },
      wide: { n: "Весь простір", km: 9999, dur: 360, risk: 0.18, acc: -9, d: "увесь повітряний простір країни" }
    }
  };
  const SCP = AIR.SCOPE;
  /* мета запиту й тип авіаційної операції (етап 7.74): впливають на ризик і шанс згоди, обмежують дозволені дії */
  const PURP = {
    strike:       { n: "Ракетно-авіаційний удар", i: "💥", risk: 0.08, acc: -5, ops: ["msl", "strike"], d: "траси ракет, БпЛА й ударних літаків" },
    patrol:       { n: "Патрулювання й прикриття", i: "🛡", risk: 0.03, acc: 0, ops: ["cap"], d: "бойове чергування винищувачів" },
    recon:        { n: "Розвідка й ДРЛО", i: "📡", risk: 0.05, acc: -3, ops: ["recon"], d: "політ літака ДРЛО або розвідника" },
    transit:      { n: "Транзит і перебазування", i: "🛫", risk: -0.02, acc: 4, ops: ["ferry"], d: "перегін літаків між аеродромами" },
    humanitarian: { n: "Гуманітарна / евакуаційна місія", i: "🕊", risk: -0.07, acc: 12, ops: ["ferry"], d: "небойовий переліт" },
    exercise:     { n: "Спільні навчання", i: "🎯", risk: -0.01, acc: 3, ops: ["cap", "recon", "ferry"], d: "навчальні польоти з партнером (потрібен договір)" }
  };
  const OPS = {
    msl:    { n: "Пуски ракет і БпЛА (траса)", s: "Пуски", risk: 0.06, acc: -3, av: false, d: "траси ракет і дронів через небо країни" },
    strike: { n: "Ударна авіація", s: "Удар", risk: 0.12, acc: -7, av: true, weap: true, d: "носії з пуском ракет або скиданням бомб" },
    cap:    { n: "Бойове патрулювання", s: "Патруль", risk: 0.04, acc: -2, av: true, weap: true, d: "винищувачі та вертольоти ППО" },
    recon:  { n: "Розвідка / ДРЛО", s: "Розвідка", risk: 0.04, acc: -2, av: true, d: "літаки ДРЛО й розвідники" },
    ferry:  { n: "Транзитний переліт", s: "Транзит", risk: 0, acc: 3, av: true, d: "небойові перельоти" }
  };
  const COVERS = { msl: ["msl"], strike: ["strike", "ferry"], cap: ["cap", "ferry"], recon: ["recon", "ferry"], ferry: ["ferry"] };   // що саме дозволяє дозвіл кожного типу
  /* власні гарантії запитувача: підвищують шанс згоди, але стають обов'язковими умовами дозволу (їх порушення = порушення дозволу) */
  const CONDS = {
    noweap: { n: "Без застосування зброї над територією країни", s: "без зброї", risk: -0.06, acc: 6, ok: op => op === "strike" || op === "cap" },
    nobal:  { n: "Без балістики й гіперзвуку", s: "без балістики", risk: -0.06, acc: 6, ok: op => op === "msl" },
    notify: { n: "Повідомляти країну про кожен вхід у зону", s: "повідомлення про вхід", risk: -0.03, acc: 4, ok: () => true }
  };
  const SCPS = SCP;
  function freshAir(){ return { req: [], perm: [], hist: [], dec: [], inc: {}, trust: {}, cool: {}, enforce: true, stat: { ua: { ok: 0, cond: 0, den: 0, viol: 0, exp: 0 }, ru: { ok: 0, cond: 0, den: 0, viol: 0, exp: 0 } }, ver: 1, tn: 0 }; }
  const pk = (p, x) => p + ">" + x;
  const winOn = (q, t) => !q.dead && t >= (q.from == null ? q.t0 : q.from) && t < q.until;
  const permsOf = sd => D.air.perm.filter(q => q.sd === sd && winOn(q, D.t));                // діють зараз
  const permsAll = sd => D.air.perm.filter(q => q.sd === sd && !q.dead && D.t < q.until);       // діють або ще не почалися
  const opOf = q => q.op || "msl";
  const permFor = (sd, x, op) => permsOf(sd).find(q => q.st === x && (!op || opOf(q) === op));
  const permAny = (sd, x, op) => permsAll(sd).find(q => q.st === x && (!op || opOf(q) === op));
  const reqFor = (sd, x, op) => D.air.req.find(q => q.from === sd && q.to === x && (!op || !q.f || q.f.op === op));
  const trustOf = (p, x) => D.air.trust[pk(p, x)] || 0;
  const addTrust = (p, x, d) => { D.air.trust[pk(p, x)] = clamp(trustOf(p, x) + d, -40, 40); };
  const airTouch = () => { D.air.ver++; D.ver++; dirty = true; try { const x = XX(); x && x.airReset && x.airReset(); } catch (e) { /* */ } };
  const pct = v => Math.round(v * 100) + "%";
  const fmtDur = m => { m = Math.max(0, Math.round(m)); const h = Math.floor(m / 60), r = m % 60; return h ? h + " год" + (r ? " " + r + " хв" : "") : r + " хв"; };
  const capWord = q => opOf(q) === "msl" ? "пусків" : "літаків";
  const termsText = q => [q.km >= 9999 ? "весь простір країни" : `коридор до ${q.km} км від кордону`, q.cap ? `до ${q.cap} ${capWord(q)}` : "без ліміту", q.noBal ? "без балістики й гіперзвуку" : "", q.noWeap ? "без застосування зброї" : "", q.notify ? "повідомлення про вхід" : "", q.fee ? `плата ${fm(q.fee)} млн $` : "", q.dep ? `депозит ${fm(q.dep)} млн $` : ""].filter(Boolean).join(" · ");
  const E0 = sd => { try { return ecoE(sd); } catch (e) { return null; } };
  function refund(sd, v, why){ if (!(v > 0)) return; const E = E0(sd); if (E) E.money += v; if (why) log(`Депозит ${fm(v)} млн $ повернено (${why})`, "info", [sd]); }

  /* нормалізація форми запиту. legacy — старий виклик (лише обсяг): без модифікаторів 7.74, строк рахується від рішення */
  function airForm(p, f, legacy){
    f = f || {}; const scope = SCP[f.scope] ? f.scope : "corr";
    const purpose = PURP[f.purpose] ? f.purpose : "strike";
    const op = OPS[f.op] && PURP[purpose].ops.includes(f.op) ? f.op : (legacy ? "msl" : PURP[purpose].ops[0]);
    const dur = clamp(Math.round((+f.dur || SCP[scope].dur) / 10) * 10, 30, 720);
    const start = legacy ? D.t : Math.max(D.t + AIR.LEAD, Math.round(+f.start || D.t + AIR.LEAD));
    const conds = {}; if (f.conds) for (const k in CONDS) if (f.conds[k] && CONDS[k].ok(op)) conds[k] = 1;
    const cap = f.cap > 0 ? clamp(Math.round(f.cap), 1, 40) : 0, dep = f.dep > 0 ? clamp(Math.round(f.dep * 2) / 2, 0.5, 30) : 0;
    return { _n: 1, legacy: !!legacy, scope, purpose, op, dur, start, conds, cap, dep };
  }
  const normForm = (p, f, scope) => f && f._n ? f : (f && typeof f === "object" ? airForm(p, f, false) : airForm(p, { scope }, true));

  /* політична сумісність 0…1: ідеологія, договори, спільні союзники; мінус — конфлікт блоків і санкції */
  function airCompat(p, x){
    const rs = []; let v = 0.55; const add = (l, d) => { if (Math.abs(d) >= 0.005){ rs.push([l, d]); v += d; } };
    add("Ідеологічна відстань", -0.35 * Math.abs(D.ide[p] - D.ide[x]));
    add(hasT(p, x, "alliance") ? "Союз" : hasT(p, x, "military") ? "Військовий договір" : "Договори", hasT(p, x, "alliance") ? 0.30 : hasT(p, x, "military") ? 0.20 : 0);
    add("Торгівля", hasT(p, x, "trade") ? 0.08 : 0);
    let sh = 0; for (const y of allies(x).concat(partners(x, "military").map(z => z.id))) if (y !== p && R(p, y) > 30) sh += 0.04; add("Спільні союзники", Math.min(0.12, sh));
    add("Конфлікт блоків", -conflictPen(p, x) / 100);
    add("Санкції", -0.12 * Math.max(sancLvl(x, p), sancLvl(p, x)));
    return { v: clamp(v, 0, 1), rs };
  }
  /* ризик ескалації 0…1: близькість до противника запитувача, міць противника, його ворожість до країни, власна напруга, інциденти;
     за формою 7.74 — ще мета, тип операції, строк, випередження й гарантії запитувача */
  function airRisk(p, x, scope, form){
    const rs = []; let v = 0.04; const add = (l, d) => { if (Math.abs(d) >= 0.005){ rs.push([l, d]); v += d; } };
    add("Обсяг запиту", (SCP[scope] || SCP.corr).risk);
    const foes = enemies(p).filter(e => e !== x);
    for (const f of foes){
      const near = BY[x].nb.includes(f) || BY[f].nb.includes(x);
      add(near ? `Спільний кордон із ${nm(f)}` : `Противник: ${nm(f)}`, near ? 0.16 : 0.05);
      add("Військова міць противника", BY[f].pow / 10 * 0.14);
      if (R(f, x) < -40) add("Ворожість противника до країни", 0.08); else if (R(f, x) > 40) add("Країна дружня до противника", 0.14);
      if (hasT(f, x, "alliance") || hasT(f, x, "military")) add("Країна пов'язана договором із противником", 0.2);
    }
    add("Власна напруга країни", threat(x) * 0.18);
    add("Попередні інциденти", Math.min(0.3, (D.air.inc[x] || 0) * 0.06));
    if ((hasT(p, x, "alliance") || hasT(p, x, "military")) && BY[x].pow >= 4) add("Гарантії союзника", -0.10);
    if (form && !form.legacy){
      const P = PURP[form.purpose], O = OPS[form.op];
      add("Мета: " + P.n.toLowerCase(), P.risk); add("Тип операції: " + O.n.toLowerCase(), O.risk);
      add("Тривалість " + fmtDur(form.dur), clamp((form.dur / 60 - 2) * 0.012, -0.01, 0.1));
      const lead = form.start - D.t; if (lead < 20) add("Запит «в останню мить»", 0.03); else if (lead > 360) add("Далекий горизонт планування", 0.015);
      for (const k in form.conds) add("Гарантія: " + CONDS[k].s, CONDS[k].risk);
      if (form.cap) add("Обмеження кількості (" + form.cap + ")", -clamp((12 - form.cap) * 0.004, 0, 0.04));
      if (form.dep) add("Депозит " + fm(form.dep) + " млн $", -Math.min(0.03, form.dep * 0.003));
    }
    return { v: clamp(v, 0, 1), rs };
  }
  /* повна оцінка запиту: blk — чому недоступний; gates — три умови; p — шанс згоди; rs — причини */
  function airGates(p, x, scope, form){
    scope = SCP[scope] ? scope : "corr";
    const r = Math.round(R(p, x)), cm = airCompat(p, x), rk = airRisk(p, x, scope, form);
    return { scope, r, cm, rk, gates: { rel: r >= AIR.RELMIN, cmp: cm.v >= AIR.COMPMIN, rsk: rk.v <= AIR.RISKMAX } };
  }
  function evalAir(p, x, scope, form){
    if (scope && typeof scope === "object"){ form = scope; scope = form.scope; }
    const f = normForm(p, form, scope); scope = f.scope;
    const o = airGates(p, x, scope, f), rs = []; let sc = 0; const add = (l, v) => { if (Math.abs(v) >= 0.5){ rs.push([l, Math.round(v)]); sc += v; } };
    add("Відносини", (o.r - AIR.RELMIN) * 0.35); add("Політична сумісність", (o.cm.v - AIR.COMPMIN) * 45); add("Ризик ескалації", -o.rk.v * 60);
    add("Довіра до виконання умов", trustOf(p, x) * 0.5); add("Репутація", clamp(D.rep[p] * 0.15, -10, 10)); add("Обсяг запиту", SCP[scope].acc);
    const pm = permFor(p, x, f.op); if (pm && !pm.viol) add("Бездоганне використання", 8);
    if (!f.legacy){
      const P = PURP[f.purpose], O = OPS[f.op], lead = f.start - D.t;
      add("Мета запиту", P.acc); add("Тип операції", O.acc);
      add("Тривалість", -clamp((f.dur / 60 - 3) * 1.2, 0, 8));
      if (lead >= 60) add("Завчасне подання", 3); else if (lead < 20) add("Запит в останню мить", -6);
      for (const k in f.conds) add("Гарантія: " + CONDS[k].s, CONDS[k].acc);
      if (f.cap) add("Обмеження кількості", clamp((12 - f.cap) * 0.6, -3, 6));
      if (f.dep) add("Депозит", Math.min(14, f.dep * 1.4));
    }
    o.rs = rs; o.p = clamp(0.35 + sc / 60, 0.02, 0.95); o.f = f;
    const s = stOf(p, x), cd = D.air.cool[pk(p, x)] || 0, pa = permAny(p, x, f.op), Ep = E0(p);
    if (!AIRST.includes(x)) o.blk = "У цієї держави немає неба на мапі";
    else if (s === "war") o.blk = "Ви у стані війни";
    else if (sancLvl(x, p)) o.blk = "Ця держава ввела проти вас санкції";
    else if (reqFor(p, x, f.op)) o.blk = "Запит на цей тип операції вже розглядається";
    else if (pa && pa.until - D.t > 60) o.blk = pa.from > D.t ? "Дозвіл на цей тип операції вже оформлено — він набуде чинності пізніше" : "Дозвіл ще діє — повторний запит за годину до завершення";
    else if (cd > D.t) o.blk = "Повторити запит можна через " + Math.ceil(cd - D.t) + " хв";
    else if (!o.gates.rel) o.blk = `Потрібні відносини ≥ ${AIR.RELMIN} (зараз ${o.r})`;
    else if (!o.gates.cmp) o.blk = `Політична сумісність ${pct(o.cm.v)} < ${pct(AIR.COMPMIN)}`;
    else if (!o.gates.rsk) o.blk = `Ризик ескалації ${pct(o.rk.v)} > ${pct(AIR.RISKMAX)}`;
    else if (!f.legacy && f.purpose === "exercise" && !hasT(p, x, "alliance") && !hasT(p, x, "military")) o.blk = "Спільні навчання потребують військового договору або союзу";
    else if (!f.legacy && f.dep && Ep && Ep.money < f.dep) o.blk = `Бракує коштів на депозит (${fm(f.dep)} млн $)`;
    return o;
  }
  /* орієнтовне очікування рішення, хв (для форми й відправки) */
  function airWait(p, x, e){
    const span = AIR.WAIT[1] - AIR.WAIT[0], k = (hasT(p, x, "alliance") ? 0.6 : hasT(p, x, "military") ? 0.8 : 1) * (1 + e.rk.v * 0.6);
    return Math.round((AIR.WAIT[0] + rnd() * span) * k / 5) * 5 || 5;
  }
  const waitRange = (p, x, e) => { const k = (hasT(p, x, "alliance") ? 0.6 : hasT(p, x, "military") ? 0.8 : 1) * (1 + e.rk.v * 0.6); return [Math.max(5, Math.round(AIR.WAIT[0] * k / 5) * 5), Math.max(5, Math.round(AIR.WAIT[1] * k / 5) * 5)]; };

  /* ---- рішення, дозволи ---- */
  function airTerms(e, full, f){
    const S = SCP[e.scope]; f = f || airForm(null, { scope: e.scope }, true);
    const km = full ? S.km : Math.round(clamp(S.km >= 9999 ? 140 : S.km * (0.55 + rnd() * 0.35), 30, 200) / 10) * 10;
    const base = f.legacy ? S.dur : f.dur, u = rnd();
    const dur = Math.max(30, Math.round((full ? base * (f.legacy ? 0.85 + u * 0.15 : 0.9 + u * 0.1) : base * (0.45 + u * 0.3)) / 10) * 10);
    const t = { km, dur, cap: null, noBal: false, noWeap: false, notify: false, fee: 0, dep: 0 };
    if (!full){
      t.cap = 6 + Math.floor(rnd() * 11); t.noBal = f.op === "msl" && e.rk.v > 0.28; t.noWeap = (f.op === "strike" || f.op === "cap") && e.rk.v > 0.3;
      t.fee = Math.round((1 + e.rk.v * 8 + rnd() * 2) * 2) / 2;
    }
    if (f.conds.noweap) t.noWeap = true; if (f.conds.nobal) t.noBal = true; if (f.conds.notify) t.notify = true;      // власні гарантії запитувача — обов'язкові
    if (f.cap) t.cap = t.cap ? Math.min(t.cap, f.cap) : f.cap;
    if (f.dep) t.dep = f.dep;
    return t;
  }
  function decRec(rec){ rec.id = D.nid++; rec.t = D.t; rec.read = false; D.air.dec.push(rec); if (D.air.dec.length > 24) D.air.dec.shift(); D.ver++; dirty = true; return rec; }
  const fmtWin = q => `${fmtT(q.from == null ? q.t0 : q.from)} → ${fmtT(q.until)}`;
  function airNotify(rec, toast){
    try { window.dispatchEvent(new CustomEvent("bv-air-decision", { detail: rec })); } catch (e) { /* */ }
    if (toast && isHuman(rec.p) && active()) try { XX().toast(toast, rec.out === "deny" || rec.out === "viol" || rec.out === "revoked" ? "warn" : "ok"); } catch (e) { /* */ }
  }
  function airGrant(p, x, scope, t, cond, f, decId, dep){
    const f0 = f || airForm(p, { scope }, true), op = f0.op;
    const old = D.air.perm.filter(q => q.sd === p && q.st === x && opOf(q) === op && !q.dead); old.forEach(q => { q.dead = true; D.air.perm = D.air.perm.filter(z => z !== q); if (q.dep) refund(p, q.dep, "дозвіл замінено новим"); });
    const from = f0.legacy ? D.t : Math.max(D.t, f0.start), winEnd = f0.legacy ? Infinity : f0.start + f0.dur;
    const until = f0.legacy ? D.t + t.dur : from + Math.min(t.dur, Math.max(20, winEnd - from));
    const q = { id: D.nid++, sd: p, st: x, scope, op, purpose: f0.purpose, t0: D.t, from, until, km: t.km, cap: t.cap || 0, noBal: !!t.noBal, noWeap: !!t.noWeap, notify: !!t.notify, fee: t.fee || 0, dep: dep != null ? dep : (t.dep || 0), uses: 0, viol: 0, cond: !!cond, warned: false, on: from <= D.t, ac: {} };
    D.air.perm.push(q);
    const cq = [], eff = (k, tx, d) => cq.push({ k, t: tx, d });
    const wide = scope === "wide", r0 = R(p, x), rp0 = D.rep[x];
    addR(p, x, cond ? 2 : 4); eff("rel", `Відносини з ${nm(x)}`, Math.round(R(p, x) - r0));
    D.rep[p] = clamp(D.rep[p] + 1, -100, 100); eff("rep", `Ваша репутація`, 1);
    D.rep[x] = clamp(D.rep[x] - (wide ? 2 : 1), -100, 100); eff("rep", `Репутація ${nm(x)} серед противників (пустила ${wide ? "увесь простір" : "коридор"})`, Math.round(D.rep[x] - rp0));
    for (const fo of enemies(p)){ if (fo === x) continue; const b = R(fo, x); addR(fo, x, -(2 + (R(fo, x) < -40 ? 2 : 4) * (wide ? 1.5 : 1))); for (const c of allies(fo)) if (c !== x) addR(c, x, -1); eff("third", `${nm(fo)} гірше ставиться до ${nm(x)} (і його союзники)`, Math.round(R(fo, x) - b)); }
    D.air.stat[p][cond ? "cond" : "ok"]++;
    const when = q.from > D.t ? `з ${fmtT(q.from)} до ${fmtT(q.until)}` : `на ${fmtDur(q.until - D.t)}`;
    log(`✈ ${BY[x].f} ${nm(x)} ${cond ? "умовно відкрила" : "відкрила"} небо для ${nm(p)} (${OPS[op].s.toLowerCase()}): ${termsText(q)} · ${when}`, "good", [p, x], true);
    const dr = decId ? D.air.dec.find(z => z.id === decId) : null;
    if (dr){ dr.cq = (dr.cq || []).concat(cq); dr.q = q.id; dr.win = [q.from, q.until]; dr.out = cond ? "cond-ok" : dr.out; dr.read = false; airNotify(dr, null); }
    airTouch(); return q;
  }
  function airEnd(q, how, why){
    if (q.dead) return; q.dead = true; D.air.perm = D.air.perm.filter(z => z !== q); const p = q.sd, x = q.st, clean = !q.viol;
    D.air.hist.push({ sd: p, st: x, op: opOf(q), t0: q.t0, t1: D.t, how, uses: q.uses, why: why || "" }); if (D.air.hist.length > 12) D.air.hist.shift();
    const cq = [], eff = (k, tx, d) => cq.push({ k, t: tx, d });
    if (how === "expired" || how === "limit" || how === "returned"){
      if (clean && q.uses > 0){ addTrust(p, x, Math.min(8, 3 + q.uses * 0.3)); addR(p, x, 2); D.rep[p] = clamp(D.rep[p] + 1, -100, 100); eff("rel", `Відносини з ${nm(x)}`, 2); eff("trust", `Довіра ${nm(x)} до виконання умов`, Math.round(Math.min(8, 3 + q.uses * 0.3))); eff("rep", "Ваша репутація", 1); }
      else if (clean){ addTrust(p, x, 1); eff("trust", `Довіра ${nm(x)} до виконання умов`, 1); }
      if (clean && q.dep){ refund(p, q.dep, "дозвіл виконано без порушень"); eff("money", "Депозит повернено", q.dep); }
      D.air.stat[p].exp++;
      log(`✈ Дозвіл ${nm(x)} для ${nm(p)} ${how === "limit" ? "вичерпано за лімітом" : how === "returned" ? "повернено достроково" : "завершився за строком"}` + (q.uses ? ` (використано ${q.uses}${clean ? ", без порушень" : ""})` : ""), "info", [p, x], true);
    } else if (how === "revoked"){
      addTrust(p, x, -3); eff("trust", `Довіра ${nm(x)} до виконання умов`, -3);
      if (q.dep){ refund(p, q.dep, "дозвіл відкликано країною"); eff("money", "Депозит повернено", q.dep); }
      log(`⛔ ${nm(x)} відкликала дозвіл для ${nm(p)}: ${why}`, "bad", [p, x], true);
    } else if (how === "violation"){
      const r0 = R(p, x); addR(p, x, -12); D.rep[p] = clamp(D.rep[p] - 8, -100, 100); addTrust(p, x, -15); D.air.inc[x] = (D.air.inc[x] || 0) + 1; D.air.stat[p].viol++; D.air.cool[pk(p, x)] = D.t + 240;
      eff("rel", `Відносини з ${nm(x)}`, Math.round(R(p, x) - r0)); eff("rep", "Ваша репутація", -8); eff("trust", `Довіра ${nm(x)} до виконання умов`, -15); eff("cool", `Новий запит до ${nm(x)} — не раніше ніж за 240 хв`, 0);
      for (const c of allies(x)) if (c !== p){ const b = R(c, p); addR(c, p, -3); eff("third", `Союзник ${nm(c)} гірше ставиться до вас`, Math.round(R(c, p) - b)); }
      if (q.dep) eff("money", "Депозит втрачено", -q.dep);
      log(`⚠ Порушення умов неба: ${nm(p)} → ${BY[x].f} ${nm(x)} (${why}). Дозвіл скасовано, відносини −12, репутація −8` + (q.dep ? `, депозит ${fm(q.dep)} млн $ втрачено` : ""), "bad", [p, x], true);
    }
    if (how === "violation" || how === "revoked"){ const rec = decRec({ p, x, out: how === "violation" ? "viol" : "revoked", why: why || "", rs: [], cq, op: opOf(q), q: q.id }); airNotify(rec, (how === "violation" ? "Порушення неба " : "Дозвіл відкликано: ") + nm(x)); }
    airTouch();
  }
  function airRevokeWhy(q){
    const p = q.sd, x = q.st;
    if (stOf(p, x) === "war") return "між державами війна";
    if (R(p, x) < AIR.RELMIN - 25) return "відносини надто погіршилися";
    if (sancLvl(x, p)) return "введено санкції проти запитувача";
    if (airRisk(p, x, q.scope).v > AIR.RISKMAX + 0.15) return "ризик ескалації став неприйнятним";
    return "";
  }
  function airUsedBy(side, pts){                         // у яких країнах із дозволом маршрут іде за межами вільної смуги
    const geo = GEO; if (!geo || !pts) return null; const used = new Set();
    for (const p of pts){ const ix = Math.floor((p[0] - geo.F.lon0) / geo.F.step), iy = Math.floor((p[1] - geo.F.lat0) / geo.F.step); if (ix < 0 || iy < 0 || ix >= geo.F.nx || iy >= geo.F.ny) continue; const i = iy * geo.F.nx + ix; const c = geo.cid[i]; if (c && geo.dist[i] > TRN) used.add(AIRST[c - 1]); }
    return used;
  }
  function airUse(side, pts, W){                         // міст із spawnWeapon: фіксує використання й перевіряє умови (лише дозволи типу «msl»)
    if (!D || !D.air || !active() || !side) return; const ps = permsOf(side).filter(q => opOf(q) === "msl"); if (!ps.length) return;
    let used; try { used = airUsedBy(side, pts); } catch (e) { return; } if (!used || !used.size) return;
    for (const st of used){
      const q = ps.find(z => z.st === st); if (!q || q.dead) continue; q.uses++;
      if (q.noBal && W && (W.cls === "ballistic" || W.cls === "hyper")) { q.viol = 1; airEnd(q, "violation", `${W.n || "ракета"}: балістику й гіперзвук через це небо заборонено`); continue; }
      if (q.notify && isHuman(side)) log(`📣 Повідомлення ${nm(st)}: ${W && W.n || "ціль"} проходить через її небо`, "info", [side, st]);
      if (q.cap && q.uses >= q.cap) airEnd(q, "limit"); else airTouch();
    }
  }
  function airResolve(rq){
    const p = rq.from, x = rq.to, f = rq.f || airForm(p, { scope: rq.scope }, true); rq.f = f;
    const g = airGates(p, x, f.scope, f), e = evalAir(p, x, f); e.rs = e.rs || [];
    const human = isHuman(p); let out = "deny", why = "", late = false;
    if (!f.legacy && f.start + f.dur - D.t < 20){ why = "вікно запиту вже минуло до ухвалення рішення"; late = true; }
    else if (stOf(p, x) === "war") why = "стан війни";
    else if (!g.gates.rel) why = "недостатній рівень довіри";
    else if (!g.gates.cmp) why = "політична несумісність";
    else if (!g.gates.rsk) why = "ризик ескалації надто високий";
    else { const u = rnd(); if (u < e.p) out = (u < e.p * 0.55 && g.rk.v <= AIR.FULLMAX) ? "full" : "cond"; if (out === "deny"){ const w = e.rs.filter(r => r[1] < 0).sort((a, b) => a[1] - b[1])[0]; why = w ? w[0].toLowerCase() : "рішення не на користь запитувача"; } }
    const rsl = e.rs.slice().sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 7);
    if (out === "deny"){
      const cq = [], eff = (k, tx, d) => cq.push({ k, t: tx, d });
      refund(p, rq.dep);
      if (late){ eff("none", "Відносини й репутація не змінилися — країна не відмовляла по суті", 0); if (rq.dep) eff("money", "Депозит повернено", rq.dep); D.air.cool[pk(p, x)] = D.t + 20; eff("cool", `Новий запит — через 20 хв`, 0); }
      else {
        const wide = f.scope === "wide", r0 = R(p, x); addR(p, x, wide ? -3 : -1); D.air.stat[p].den++; D.air.cool[pk(p, x)] = D.t + AIR.COOL; addTrust(p, x, -1);
        eff("rel", `Відносини з ${nm(x)}`, Math.round(R(p, x) - r0)); eff("trust", `Довіра ${nm(x)} до виконання умов`, -1); eff("cool", `Новий запит до ${nm(x)} — не раніше ніж за ${AIR.COOL} хв`, 0);
        if (rq.dep) eff("money", "Депозит повернено", rq.dep);
        if (g.rk.v > 0.4) for (const fo of enemies(p)) if (fo !== x){ const b = R(fo, x); addR(fo, x, 1); eff("third", `${nm(fo)} ставиться до ${nm(x)} трохи краще (обережна нейтральність)`, Math.round(R(fo, x) - b) || 1); }
        if (wide) eff("note", "Запит на весь простір сприйнято як надмірний — відносини впали сильніше", 0);
      }
      log(`🚫 ${BY[x].f} ${nm(x)} відмовила ${nm(p)} у доступі до неба (${why})` + (late ? "" : `; відносини ${f.scope === "wide" ? "−3" : "−1"}`), "bad", [p, x], true);
      const rec = decRec({ p, x, out: late ? "late" : "deny", why, rs: rsl, cq, f, op: f.op }); airNotify(rec, `${nm(x)} відмовила у доступі до неба: ${why}`); airTouch(); return;
    }
    const t = airTerms(g, out === "full", f);
    const rec = decRec({ p, x, out, why: "", rs: rsl, cq: [], f, op: f.op, terms: t });
    if (out === "full"){ airGrant(p, x, f.scope, t, false, f, rec.id, rq.dep); airNotify(rec, `${nm(x)} відкрила небо`); return; }
    if (human){
      D.pend.push({ id: D.nid++, from: x, to: p, type: "airc", exp: D.t + AIR.OFFER, t0: D.t, air: { scope: f.scope, t, f, dec: rec.id, dep: rq.dep || 0 } });
      log(`📨 ${BY[x].f} ${nm(x)} пропонує умовний дозвіл на небо: ${termsText(t)} · ${fmtDur(t.dur)}`, "ask", [p, x], true); airNotify(rec, `${nm(x)} пропонує умови — відповідь у «Подіях»`); airTouch(); return;
    }
    const E = ecoE(p); if (!E || E.money >= t.fee){ if (E) E.money -= t.fee; airGrant(p, x, f.scope, t, true, f, rec.id, 0); }
    else { D.air.stat[p].den++; D.air.cool[pk(p, x)] = D.t + AIR.COOL; log(`${nm(p)} відхилила умови ${nm(x)} щодо неба`, "info", [p, x]); airTouch(); }
  }
  function airAnswer(pd, yes){
    const i = D.pend.indexOf(pd), x = pd.from, p = pd.to, a = pd.air; if (i < 0) return;
    if (yes){
      const E = ecoE(p), fee = a.t.fee || 0;
      if (E && E.money < fee){ try { XX().toast(`Бракує коштів на умови (${fm(fee)} млн $)`, "warn"); } catch (e) { /* */ } return; }
      D.pend.splice(i, 1); if (E) E.money -= fee; airGrant(p, x, a.scope, a.t, true, a.f, a.dec, a.dep);
    } else {
      D.pend.splice(i, 1); const r0 = R(p, x); addR(p, x, -1); D.air.cool[pk(p, x)] = D.t + 30; refund(p, a.dep); log(`Ви відхилили умови ${nm(x)} щодо повітряного простору`, "info", [p, x]);
      const dr = D.air.dec.find(z => z.id === a.dec); if (dr){ dr.out = "cond-no"; dr.cq = [{ k: "rel", t: `Відносини з ${nm(x)}`, d: Math.round(R(p, x) - r0) }, { k: "cool", t: `Новий запит до ${nm(x)} — не раніше ніж за 30 хв`, d: 0 }].concat(a.dep ? [{ k: "money", t: "Депозит повернено", d: a.dep }] : []); dr.read = false; airNotify(dr, null); }
      airTouch();
    }
    afterAct();
  }
  function airSend(x, arg){
    if (!active() || !D) return; const p = pov(); if (!p) return; const msg = (m, k) => { try { XX().toast(m, k || "info"); } catch (e) { /* */ } };
    const f = normForm(p, arg && typeof arg === "object" ? arg : null, typeof arg === "string" ? arg : (arg && arg.scope));
    const e = evalAir(p, x, f); if (e.blk){ msg(e.blk, "warn"); return null; }
    const wait = airWait(p, x, e), E = ecoE(p); if (f.dep && E) E.money -= f.dep;
    const rq = { id: D.nid++, from: p, to: x, scope: e.scope, f, t0: D.t, dec: D.t + wait, dep: f.dep || 0 };
    D.air.req.push(rq);
    log(`✈ ${nm(p)} запросила у ${BY[x].f} ${nm(x)} доступ до повітряного простору (${f.legacy ? SCP[e.scope].n.toLowerCase() : OPS[f.op].s.toLowerCase() + " · " + fmtDur(f.dur) + " з " + fmtT(f.start)}); рішення очікується ≈ через ${fmtDur(wait)}`, "info", [p, x]);
    msg(`Запит до ${nm(x)} надіслано — відповідь за ≈ ${fmtDur(wait)}`, "ok"); airTouch(); afterAct(); return rq;
  }
  function airCancelReq(id){ const i = D.air.req.findIndex(q => q.id === id); if (i < 0) return; const q = D.air.req[i]; D.air.req.splice(i, 1); refund(q.from, q.dep, "запит скасовано"); log(`Запит до ${nm(q.to)} скасовано`, "info", [q.from, q.to]); airTouch(); afterAct(); }
  function airReturn(id){ const q = D.air.perm.find(z => z.id === id); if (q) airEnd(q, "returned"); afterAct(); }
  function airTick(){
    const A = D.air; A.tn++; if (A.tn % 24 === 0) for (const k in A.inc) if (A.inc[k] > 0) A.inc[k]--;
    for (const rq of A.req.slice()) if (D.t >= rq.dec){ A.req.splice(A.req.indexOf(rq), 1); airResolve(rq); }
    for (const q of A.perm.slice()){
      if (q.dead) continue;
      if (D.t >= q.until){ airEnd(q, "expired"); continue; }
      const why = airRevokeWhy(q); if (why){ airEnd(q, "revoked", why); continue; }
      if (!q.on && D.t >= (q.from == null ? q.t0 : q.from)){ q.on = true; log(`✈ Дозвіл ${nm(q.st)} на небо набув чинності (${OPS[opOf(q)].s.toLowerCase()}, до ${fmtT(q.until)})`, "good", [q.sd, q.st], true); airTouch(); }
      if (q.on && !q.warned && q.until - D.t <= 30){ q.warned = true; log(`⏳ Дозвіл ${nm(q.st)} на небо спливає за ≈ ${fmtDur(q.until - D.t)}`, "info", [q.sd, q.st], true); }
    }
    if (D.ai) for (const sd of MAIN){                    // ІІ-сторона теж просить небо (рідко, лише коли умови виконано)
      if (isHuman(sd) || rnd() > 0.07) continue;
      const c = AIRST.filter(x => x !== sd && !permAny(sd, x, "msl")).map(x => ({ x, e: evalAir(sd, x, "corr") })).filter(o => !o.e.blk && o.e.p > 0.45).sort((a, b) => b.e.p - a.e.p)[0];
      if (c){ const wait = AIR.WAIT[0] + Math.round(rnd() * (AIR.WAIT[1] - AIR.WAIT[0])); A.req.push({ id: D.nid++, from: sd, to: c.x, scope: "corr", f: airForm(sd, { scope: "corr" }, true), t0: D.t, dec: D.t + wait, dep: 0 }); log(`✈ ${nm(sd)} запросила небо ${nm(c.x)}`, "info", [sd, c.x]); airTouch(); }
    }
  }
