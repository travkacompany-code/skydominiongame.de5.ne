/* ======================================================================
   BV_PVO — повноцінна ППО (етап 7.67, «BANGVECTOR 2 · етап 3»)
   Чистий модуль (як 02c_radar.js, 02e_fog.js, 02g_tel.js): не знає ні про мапу, ні про 03_game.js — лише про прості дані.
   Усі числа — ігровий баланс (CFG), не реальні ТТХ. Нічого не дублює: РЛС, канал до КП і «захоплення» цілі лишаються в BV_RADAR / 02e_fog,
   а тут — те, чого в грі ще не було:

   • ТЕХНІКА: прочність наземної ППО (hp 0..1), шкода від вибуху поруч (blast), самоусунення пошкоджень, вплив стану на роботу
     (cond: темп вогню, радіус, шанс ураження; нижче disabledBelow установка не стріляє);
   • КАНАЛИ: скільки цілей установка веде одночасно (channels — з її ж характеристик: гармата, магазин, радіус) і скільки цілей
     веде один КП (cpMax) — понад ліміт нові цілі не береться, поки не звільниться канал;
   • КП: пункт ППО (post) як вузол керування. Знищений КП → установки автономні (лише власні засоби), через rehomeSec переприв'язуються
     до найближчого живого КП; живих КП немає — автономні остаточно;
   • ПЕРЕХОПЛЕННЯ: чи фізично можливий перехват (intercept — розв'язок зустрічі з урахуванням швидкості цілі, радіуса, запасу ходу
     ракети й кінця маршруту цілі), узгоджена ймовірність ураження вже запущених ракет (committed) → не стріляти «ще раз», якщо
     ціль уже, найімовірніше, збита; розподіл цілей між установками (pickScore);
   • ОБЛОМКИ: що трапляється, коли збита ціль падає (debris: радіус і частка шкоди за класом), + blast по списку об'єктів.
   Час усередині модуля — СЕКУНДИ ігрового часу (як у 03_game.js: `sd`).
   ====================================================================== */
(function (root) {
  "use strict";

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const D2R = Math.PI / 180;
  const KY = 110.574;
  const dist = (p, q) => Math.hypot((q[0] - p[0]) * 111.32 * Math.cos((p[1] + q[1]) / 2 * D2R), (q[1] - p[1]) * KY);

  /* ---------- баланс ---------- */
  const CFG = {
    on: true,
    /* стан техніки */
    disabledBelow: 0.3,       // hp нижче — установка не веде вогонь (як у ПУ балістики)
    degradedBelow: 0.65,      // hp нижче — погіршення роботи (cond)
    minRateK: 0.45,           // темп вогню при hp = disabledBelow (на hp ≥ degradedBelow — 1)
    minPkK: 0.6,              // множник шансу ураження при hp = disabledBelow
    minRangeK: 0.7,           // множник радіуса при hp = disabledBelow
    repairIdleSec: 45,        // самоусунення пошкоджень починається, якщо стільки секунд не було влучань
    repairPerSec: 0.004,      // частка прочності за секунду
    /* шкода вибуху поруч */
    hitFull: 1.0, hitFar: 3.0, farK: 0.35,   // км: повне ураження / межа часткового; частка шкоди на краю
    hpPts: { gun: 1.2, short: 1.6, mid: 2.5, long: 4 },   // «очки» міцності за класом (шкода ракети ділиться на них), як RAD_HP радарів
    /* канали (одночасно ведені цілі) */
    ch: { gun: 1, short: 2, mid: 4, long: 8 },
    cpMax: 16,                // цілей, які одночасно веде один КП (усі підлеглі установки разом)
    rehomeSec: 20,            // скільки секунд установка автономна після втрати КП, поки переприв'яжеться
    ownKm: 10,                // власні засоби установки бачать ціль зблизька (те саме, що й раніше у radarAdSkip)
    reachK: 1.15,             // зустріч допускається не далі за радіус × reachK (як і відсів цілей за прямокутником в adPick)
    /* розподіл цілей */
    enough: { drone: 0.85, jet: 0.88, rd: 0.9, cruise: 0.9, ballistic: 0.93, hyper: 0.93, icbm: 0.95, bomb: 0.9, tac: 0.8 },   // скільки «вже вистачає» по класу
    shotDisc: 0.9,            // знижка шансу влучання ракети, що ще летить (не всі дійдуть)
    spare: 40,                // штраф до відстані за кожну вже призначену ціль імовірність (км на 1,0 committed)
    mAvgK: 0.8,               // середня швидкість ракети до зустрічі — частка максимальної (розгін/вигорання)
    flightK: 1.1,             // запас шляху ракети понад пряму до точки зустрічі (маневр)
    endSlack: 0.3,            // км: допуск до кінця маршруту цілі
    /* обломки */
    debris: {                 // r — радіус ураження, км; k — частка шкоди ракети/дрона; air — те саме при розриві в повітрі (менше)
      drone:     { r: 0.35, k: 0.05 }, jet:   { r: 0.45, k: 0.06 }, rd:    { r: 0.5, k: 0.08 },
      cruise:    { r: 0.6,  k: 0.10 }, ballistic: { r: 1.0, k: 0.10 }, hyper: { r: 1.0, k: 0.10 },
      icbm:      { r: 1.0,  k: 0.08 }, bomb:  { r: 0.6, k: 0.08 }, tac: { r: 0.3, k: 0.04 }
    },
    airK: 0.5                 // збитий у повітрі: уламки розлітаються ширше й слабше (множник k)
  };

  /* ---------- класи установок за їхніми справжніми даними (gun / mag / r) ---------- */
  function tier(T) {
    if (!T) return "short";
    if (T.gun) return "gun";
    if (T.air) return "short";
    const r = +T.r || 0;
    return r >= 60 ? "long" : r >= 15 ? "mid" : "short";
  }
  /* скільки цілей установка веде одночасно. Одноразові (ПЗРК, дрон-перехоплювач, магазин 1) — одна;
     гармата — одна; решта — за радіусом. Ніколи не більше, ніж ракет у магазині. */
  function channels(T) {
    if (!T) return 1;
    if (T.gun || T.drone || T.ruch || (T.mag | 0) <= 1) return 1;
    return Math.max(1, Math.min(CFG.ch[tier(T)], T.mag | 0));
  }
  const hpPoints = T => CFG.hpPts[tier(T)] || 2;

  /* ---------- стан техніки ---------- */
  /* → { down, rate, pk, range }: коефіцієнти роботи залежно від прочності */
  function cond(hp) {
    hp = hp == null ? 1 : hp;
    if (hp <= CFG.disabledBelow) return { down: true, rate: 0, pk: 0, range: 0, label: hp <= 0 ? "знищена" : "виведена з ладу" };
    const f = hp >= CFG.degradedBelow ? 1 : (hp - CFG.disabledBelow) / (CFG.degradedBelow - CFG.disabledBelow);
    return {
      down: false, rate: CFG.minRateK + (1 - CFG.minRateK) * f, pk: CFG.minPkK + (1 - CFG.minPkK) * f, range: CFG.minRangeK + (1 - CFG.minRangeK) * f,
      label: f >= 1 ? "справна" : "пошкоджена"
    };
  }
  /* шкода вибуху в точці pos для списку {id,pos,hp,pts}; повертає уражені (без змін списку — застосовує викликач) */
  function blast(list, pos, dmg, opt) {
    const o = Object.assign({}, CFG, opt || {}), out = [];
    for (const x of list) {
      if (!x || !x.pos || !(x.hp > 0)) continue;
      const d = dist(pos, x.pos); if (d > o.hitFar) continue;
      const k = d <= o.hitFull ? 1 : 1 - (1 - o.farK) * (d - o.hitFull) / (o.hitFar - o.hitFull);
      const dm = dmg * k / (x.pts || 2), hp = clamp(x.hp - dm, 0, 1);
      out.push({ id: x.id, d, dm, hp, killed: hp <= 0 });
    }
    return out;
  }
  /* крок самоусунення: hit — час останнього ураження (ігрові с), now — зараз */
  function repairStep(hp, lastHit, now, dt) {
    if (!(hp > 0) || hp >= 1 || now - (lastHit || -1e9) < CFG.repairIdleSec) return hp;
    return Math.min(1, hp + CFG.repairPerSec * dt);
  }

  /* ---------- КП ---------- */
  /* posts: [{id,pos,alive}]; повертає найближчий живий КП для установки (або null) */
  function nearestCp(posts, pos) {
    let best = null, bd = Infinity;
    for (const p of posts) { if (!p.alive) continue; const d = dist(pos, p.pos); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  /* стан зв'язку установки з КП: u.cp = id; u.cpLost = час втрати (або null).
     → { cp, linked, autonomous } і оновлює u.cp / u.cpLost / u.cpHome. */
  function linkStep(u, posts, now) {
    const cur = u.cp != null ? posts.find(p => p.id === u.cp) : null;
    if (cur && cur.alive) { u.cpLost = null; return { cp: cur.id, linked: true, autonomous: false }; }
    if (u.cpLost == null) u.cpLost = now;
    const alt = nearestCp(posts, u.pos);
    if (alt && now - u.cpLost >= CFG.rehomeSec) { u.cp = alt.id; u.cpLost = null; return { cp: alt.id, linked: true, autonomous: false, rehomed: true }; }
    return { cp: null, linked: false, autonomous: true, pending: !!alt, left: alt ? Math.max(0, CFG.rehomeSec - (now - u.cpLost)) : null };
  }
  /* ліміт цілей КП: ids — цілі, які вже веде КП. Нову ціль (tid) КП бере, якщо вона вже серед них або є вільний канал */
  function cpAllows(ids, tid) { return ids.has(tid) || ids.size < CFG.cpMax; }

  /* ---------- перехоплення ---------- */
  /* Чи можна фізично перехопити ціль ракетою установки.
     L — вектор від установки до цілі, км [dx,dy]; V — швидкість цілі, км/с [vx,vy]; vm — макс. швидкість ракети, км/с;
     R — радіус установки; max — запас ходу ракети, км; rem — шлях цілі до кінця маршруту, км (Infinity — невідомо).
     → { ok, why, tau, dist, point:[dx,dy] } */
  function intercept(L, V, vm, R, max, rem) {
    const v = vm * CFG.mAvgK;
    if (!(v > 0)) return { ok: false, why: "no-missile" };
    const a = V[0] * V[0] + V[1] * V[1] - v * v, b = 2 * (L[0] * V[0] + L[1] * V[1]), c = L[0] * L[0] + L[1] * L[1];
    let tau = null;
    if (c < 1e-9) tau = 0;
    else if (Math.abs(a) < 1e-9) { if (b < 0) tau = -c / b; }
    else {
      const D = b * b - 4 * a * c;
      if (D >= 0) {
        const s = Math.sqrt(D), t1 = (-b - s) / (2 * a), t2 = (-b + s) / (2 * a);
        const lo = Math.min(t1, t2), hi = Math.max(t1, t2);
        tau = lo > 1e-9 ? lo : hi > 1e-9 ? hi : null;
      }
    }
    if (tau == null || !isFinite(tau)) return { ok: false, why: "outrun" };           // ціль швидша й іде геть — не наздогнати
    const pt = [L[0] + V[0] * tau, L[1] + V[1] * tau], d = Math.hypot(pt[0], pt[1]);
    if (d > R + 1e-6) return { ok: false, why: "out-of-range", tau, dist: d, point: pt };          // зустріч за межами радіуса установки
    if (v * tau * CFG.flightK > max) return { ok: false, why: "out-of-fuel", tau, dist: d, point: pt };      // ракета не долетить
    const tv = Math.hypot(V[0], V[1]) * tau;
    if (rem != null && tv > rem + CFG.endSlack) return { ok: false, why: "too-late", tau, dist: d, point: pt };   // ціль влучить раніше, ніж ракета долетить
    return { ok: true, tau, dist: d, point: pt };
  }
  /* узгоджена ймовірність ураження: shots — шанси (0..1) ракет у польоті по цій цілі */
  function committed(shots) { let q = 1; for (const p of shots) q *= 1 - clamp(p, 0, 1) * CFG.shotDisc; return 1 - q; }
  const enoughFor = cls => CFG.enough[cls] != null ? CFG.enough[cls] : 0.9;
  /* чи вже достатньо ракет по цілі (клас cls, committed — узгоджена ймовірність) */
  const covered = (cls, comm) => comm >= enoughFor(cls);
  /* оцінка вибору цілі (менше — краще): відстань + штраф за вже призначені ракети */
  const pickScore = (d, comm) => d + comm * CFG.spare * 2.5;
  /* скільки цілей уже веде установка: Set id → розмір; нову ціль не приймає при заповнених каналах */
  const chFree = (ids, tid, n) => ids.has(tid) || ids.size < n;

  /* ---------- обломки ---------- */
  /* що падає на землю: cls — клас цілі, air — розірвано в повітрі (збита ракетою), dmg — шкода ціллю (wDmg).
     → { r, dmg } — радіус ураження та шкода в центрі (0 — нічого). Розвідувальні БпЛА (dmg 0) шкоди не дають. */
  function debris(cls, dmg, air) {
    const D = CFG.debris[cls]; if (!D || !(dmg > 0)) return { r: 0, dmg: 0 };
    return { r: D.r * (air ? 1.4 : 1), dmg: dmg * D.k * (air ? CFG.airK : 1) };
  }

  root.BV_PVO = { CFG, tier, channels, hpPoints, cond, blast, repairStep, nearestCp, linkStep, cpAllows, intercept, committed, enoughFor, covered, pickScore, chFree, debris, dist };
})(typeof window !== "undefined" ? window : globalThis);
