
  /* ---- карта неба: країни, глибина від вільного неба; сітка «чужої суші» береться з гри (BV_DIPX.foreignGrid) ---- */
  let GEO = null; const GR = {};
  function airGeo(F){
    if (GEO && GEO.F === F) return GEO;
    const nx = F.nx, ny = F.ny, cid = new Uint8Array(nx * ny), dist = new Int16Array(nx * ny).fill(-1), q = [];
    AIRST.forEach((k, ci) => {
      const P = AIRPOLY[k]; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const v of P){ x0 = Math.min(x0, v[0]); x1 = Math.max(x1, v[0]); y0 = Math.min(y0, v[1]); y1 = Math.max(y1, v[1]); }
      const ix0 = Math.max(0, Math.floor((x0 - F.lon0) / F.step)), ix1 = Math.min(nx - 1, Math.ceil((x1 - F.lon0) / F.step)), iy0 = Math.max(0, Math.floor((y0 - F.lat0) / F.step)), iy1 = Math.min(ny - 1, Math.ceil((y1 - F.lat0) / F.step));
      for (let iy = iy0; iy <= iy1; iy++) for (let ix = ix0; ix <= ix1; ix++){
        const i = iy * nx + ix; if (!F.blk[i] || cid[i]) continue; const X = F.lon0 + (ix + 0.5) * F.step, Y = F.lat0 + (iy + 0.5) * F.step; let inn = false;
        for (let a = 0, b = P.length - 1; a < P.length; b = a++){ const A = P[a], B = P[b]; if ((A[1] > Y) !== (B[1] > Y) && X < (B[0] - A[0]) * (Y - A[1]) / (B[1] - A[1]) + A[0]) inn = !inn; }
        if (inn) cid[i] = ci + 1;
      }
    });
    for (let i = 0; i < dist.length; i++) if (!F.blk[i]){ dist[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++){ const i = q[h], x = i % nx, y = (i / nx) | 0, d = dist[i];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){ const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= nx || Y >= ny) continue; const j = Y * nx + X; if (dist[j] < 0){ dist[j] = d + 1; q.push(j); } } }
    return (GEO = { F, cid, dist });
  }
  const FGRID = () => { try { const x = XX(); return x && x.foreignGrid ? x.foreignGrid() : null; } catch (e) { return null; } };
  const limCells = q => q.km >= 9999 ? 1e4 : Math.round(q.km / AIR.CELL);
  /* сітка, у якій клітинки країн із дозволом сторони відкриті в межах глибини коридору; null — немає дозволів (гра рахує як раніше).
     Беруться лише діючі дозволи типу «msl» (траси ракет і БпЛА) */
  function airGrid(side, T, F){
    try {
      if (!D || !D.air || !active()) return null; side = side || pov(); if (!side) return null;
      const ps = permsOf(side).filter(q => opOf(q) === "msl"); if (!ps.length || !T || !T.blk || !F || !F.blk) return null;
      const key = D.air.ver + ":" + ps.map(q => q.id).join(","), c = GR[side]; if (c && c.key === key && c.T === T) return c.g;
      const geo = airGeo(F), g = Object.assign({}, T, { blk: T.blk.slice(), cache: new Map() }), by = {};
      ps.forEach(q => { by[AIRST.indexOf(q.st) + 1] = q; });
      for (let i = 0; i < g.blk.length; i++){ if (!g.blk[i]) continue; const q = by[geo.cid[i]]; if (q && geo.dist[i] <= limCells(q)) g.blk[i] = 0; }
      GR[side] = { key, T, g }; return g;
    } catch (e) { if (window.console) console.warn("[dip air]", e); return null; }
  }

  /* ---- перевірка точки й маршруту проти дозволів (етап 7.74) ---- */
  const dkm = (a, b) => { const kx = 111.32 * Math.cos((a[1] + b[1]) / 2 * Math.PI / 180); return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 110.574); };
  function cellAt(F, pos){
    const geo = airGeo(F), ix = Math.floor((pos[0] - F.lon0) / F.step), iy = Math.floor((pos[1] - F.lat0) / F.step);
    if (ix < 0 || iy < 0 || ix >= F.nx || iy >= F.ny || !F.blk[iy * F.nx + ix]) return { free: true };
    const i = iy * F.nx + ix, c = geo.cid[i]; return c ? { st: AIRST[c - 1], d: geo.dist[i], i } : { closed: true, d: geo.dist[i], i };
  }
  /* стан польоту над кліткою c у момент t: free / closed / noperm / op / early / late / depth / edge / ok */
  function airStatusAt(side, c, op, t){
    if (c.free) return { k: "free" }; if (c.closed) return { k: "closed" };
    const all = permsAll(side).filter(q => q.st === c.st);
    if (!all.length) return { k: "noperm", req: !!reqFor(side, c.st) };
    const cov = all.filter(q => (COVERS[opOf(q)] || []).includes(op));
    if (!cov.length) return { k: "op", q: all[0] };
    const ok = cov.filter(q => t >= (q.from == null ? q.t0 : q.from) && t < q.until);
    if (!ok.length){
      const before = cov.filter(q => t < (q.from == null ? q.t0 : q.from)).sort((a, b) => a.from - b.from)[0];
      return before ? { k: "early", q: before } : { k: "late", q: cov.sort((a, b) => b.until - a.until)[0] };
    }
    const q = ok.sort((a, b) => limCells(b) - limCells(a))[0], L = limCells(q), mc = L - c.d;
    if (mc < 0) return { k: "depth", q, mc };
    return { k: mc <= 2 ? "edge" : "ok", q, mc };
  }
  const STATUS_TXT = {
    noperm: (st, s) => `Немає дозволу на небо ${BY[st].f} ${nm(st)}` + (s.req ? " (запит ще розглядається)" : ""),
    closed: () => "Закрите небо третьої країни — дозвіл неможливий",
    op: (st, s) => `Дозвіл ${nm(st)} не охоплює цей тип операції`,
    early: (st, s) => `Політ у небі ${nm(st)} раніше початку дозволу (${fmtT(s.q.from)})`,
    late: (st, s) => `Дозвіл ${nm(st)} уже спливе (${fmtT(s.q.until)})`,
    depth: (st, s) => `Вихід за межі коридору ${nm(st)} (ліміт ${s.q.km >= 9999 ? "—" : s.q.km + " км"})`
  };
  const isBad = k => k === "noperm" || k === "closed" || k === "op" || k === "early" || k === "late" || k === "depth";
  /* маршрут pts [[lon,lat]…] для сторони side: opt = { op, speed (км/год), start (хв гри), n (літаків), weap, cls, step } */
  function airCheckRoute(side, pts, opt){
    opt = Object.assign({ op: "strike", speed: 800, start: D ? D.t : 0, n: 1, weap: false, cls: "", step: 4 }, opt || {});
    const F = opt.F || FGRID(), out = { ok: true, errors: [], warns: [], segs: [], parts: [], km: 0, eta: 0, tEnd: opt.start, n: opt.n, noGrid: !F };
    if (!D || !D.air || !pts || pts.length < 2) return out; if (!F) return out;
    const P = [pts[0]], S = [0]; let tot = 0;
    for (let i = 1; i < pts.length; i++){ const a = pts[i - 1], b = pts[i], d = dkm(a, b), n = Math.max(1, Math.ceil(d / opt.step)); for (let k = 1; k <= n; k++){ P.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); tot += d / n; S.push(tot); } }
    const sp = Math.max(60, opt.speed), T = S.map(s => opt.start + s / sp * 60);
    const C = P.map((p, i) => { const c = cellAt(F, p); return { c, s: airStatusAt(side, c, opt.op, T[i]) }; });
    out.km = tot; out.eta = tot / sp * 60; out.tEnd = T[T.length - 1];
    const keyOf = c => c.free ? "free" : c.closed ? "closed" : c.st;
    for (let a = 0; a < C.length;){
      let b = a; const kk = keyOf(C[a].c); while (b + 1 < C.length && keyOf(C[b + 1].c) === kk) b++;
      if (kk !== "free"){
        const st = C[a].c.st || null; let maxd = 0, worst = "ok", qs = null; const bad = {};
        for (let i = a; i <= b; i++){ const s = C[i].s; maxd = Math.max(maxd, C[i].c.d || 0); if (s.q && !qs) qs = s.q; if (isBad(s.k) && !bad[s.k]) bad[s.k] = i; if (s.k === "edge" && worst === "ok") worst = "edge"; }
        const seg = { st, km0: S[a], km1: S[b], tIn: T[a], tOut: T[b], maxKm: Math.round(maxd * AIR.CELL), q: qs ? qs.id : 0, k: Object.keys(bad).length ? "bad" : worst, bad: Object.keys(bad) };
        out.segs.push(seg);
        const kmTxt = `км ${Math.round(S[a])}–${Math.round(S[b])}`;
        Object.keys(bad).forEach(k => { const i = bad[k]; out.errors.push({ k, st, at: P[i], km: S[i], t: T[i], msg: (STATUS_TXT[k](st, C[i].s)) + ` (${kmTxt})`, hint: k === "noperm" ? "Подайте запит на небо цієї країни або оберіть обхід" : k === "depth" ? "Перенесіть точки ближче до кордону або запросіть весь простір" : k === "late" || k === "early" ? "Змініть час початку польоту" : k === "op" ? "Потрібен дозвіл на цей тип операції" : "" }); });
        const ed = C.findIndex((z, i) => i >= a && i <= b && z.s.k === "edge");
        if (ed >= 0 && !Object.keys(bad).length) out.warns.push({ k: "edge", st, at: P[ed], km: S[ed], msg: `Маршрут у небі ${nm(st)} проходить за ≈ ${Math.max(1, Math.round(C[ed].s.mc * AIR.CELL))} км від межі дозволеної зони` });
        else if (ed >= 0) out.warns.push({ k: "edge", st, at: P[ed], km: S[ed], msg: `Ділянка в небі ${nm(st)} впритул до межі зони` });
        if (qs && !Object.keys(bad).length){
          const q = qs, used = opOf(q) === "msl" ? q.uses : Object.keys(q.ac || {}).length;
          if (q.cap && used + opt.n > q.cap) out.errors.push({ k: "cap", st, at: P[Math.round((a + b) / 2)], km: S[a], t: T[a], msg: `Заплановано ${opt.n} ${capWord(q)}, а дозвіл ${nm(st)} — до ${q.cap} (вже використано ${used})`, hint: "Зменште групу або запросіть вищий ліміт" });
          if (opt.weap && q.noWeap) out.errors.push({ k: "weap", st, at: P[Math.round((a + b) / 2)], km: S[a], t: T[a], msg: `Застосування зброї в небі ${nm(st)} заборонене умовами дозволу`, hint: "Приберіть бойові дії в зоні" });
          if ((opt.cls === "ballistic" || opt.cls === "hyper") && q.noBal) out.errors.push({ k: "bal", st, at: P[Math.round((a + b) / 2)], km: S[a], t: T[a], msg: `Балістика й гіперзвук заборонені умовами дозволу ${nm(st)}`, hint: "Оберіть крилату ракету або дрон" });
          if (q.until - T[b] < 15 && q.until - T[b] >= 0) out.warns.push({ k: "tight", st, at: P[b], km: S[b], msg: `Запас часу до кінця дозволу ${nm(st)} — лише ≈ ${Math.max(0, Math.round(q.until - T[b]))} хв` });
          if (q.notify) out.warns.push({ k: "notify", st, at: P[a], km: S[a], msg: `${nm(st)} буде повідомлена про вхід (умова дозволу)` });
        }
      }
      a = b + 1;
    }
    // частини маршруту для малювання: free / ok / warn / bad
    const grade = (z) => z.s.k === "free" ? "free" : z.s.k === "ok" ? "ok" : z.s.k === "edge" ? "warn" : "bad";
    let cur = null;
    for (let i = 0; i < C.length; i++){ const g = grade(C[i]); if (!cur || cur.k !== g){ cur = { k: g, pts: i ? [P[i - 1]] : [] }; out.parts.push(cur); } cur.pts.push(P[i]); }
    out.ok = !out.errors.length; return out;
  }

  /* авто-прокладання: A* по клітинках, де небо вільне або відкрите дозволом (з відступом від межі) */
  function airReroute(side, A, B, opt){
    opt = Object.assign({ op: "strike", start: D ? D.t : 0, dur: 120, margin: 2, F: null }, opt || {});
    const F = opt.F || FGRID(); if (!F || !D || !D.air) return null;
    const geo = airGeo(F), nx = F.nx, ny = F.ny, lim = {};
    permsAll(side).forEach(q => { if (!(COVERS[opOf(q)] || []).includes(opt.op)) return; if (q.until <= opt.start || (q.from == null ? q.t0 : q.from) >= opt.start + opt.dur) return; const ci = AIRST.indexOf(q.st) + 1, L = Math.max(0, limCells(q) - opt.margin); if (!(ci in lim) || L > lim[ci]) lim[ci] = L; });
    const okI = i => !F.blk[i] || (geo.cid[i] > 0 && geo.cid[i] in lim && geo.dist[i] <= lim[geo.cid[i]]);
    const cx = p => Math.floor((p[0] - F.lon0) / F.step), cy = p => Math.floor((p[1] - F.lat0) / F.step);
    const snap = p => { let x = cx(p), y = cy(p); if (x < 0 || y < 0 || x >= nx || y >= ny) return -1; if (okI(y * nx + x)) return y * nx + x; for (let r = 1; r <= 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++){ if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < nx && Y < ny && okI(Y * nx + X)) return Y * nx + X; } return -1; };
    const s = snap(A), e = snap(B); if (s < 0 || e < 0) return null;
    const ctr = i => [F.lon0 + ((i % nx) + 0.5) * F.step, F.lat0 + (((i / nx) | 0) + 0.5) * F.step];
    const bx0 = Math.max(0, Math.min(cx(A), cx(B)) - 60), bx1 = Math.min(nx - 1, Math.max(cx(A), cx(B)) + 60), by0 = Math.max(0, Math.min(cy(A), cy(B)) - 60), by1 = Math.min(ny - 1, Math.max(cy(A), cy(B)) + 60);
    const G = new Float32Array(nx * ny).fill(1e9), PAR = new Int32Array(nx * ny).fill(-1), DONE = new Uint8Array(nx * ny), H = [], eC = ctr(e);
    const hp = i => dkm(ctr(i), eC), push = (i, f) => { H.push([f, i]); let k = H.length - 1; while (k > 0){ const p = (k - 1) >> 1; if (H[p][0] <= H[k][0]) break; [H[p], H[k]] = [H[k], H[p]]; k = p; } };
    const pop = () => { const t = H[0], l = H.pop(); if (H.length){ H[0] = l; let k = 0; for (;;){ let a = 2 * k + 1, b = a + 1, m = k; if (a < H.length && H[a][0] < H[m][0]) m = a; if (b < H.length && H[b][0] < H[m][0]) m = b; if (m === k) break; [H[m], H[k]] = [H[k], H[m]]; k = m; } } return t; };
    G[s] = 0; push(s, hp(s)); let found = false, guard = 0;
    while (H.length && guard++ < 400000){
      const [, i] = pop(); if (DONE[i]) continue; DONE[i] = 1; if (i === e){ found = true; break; }
      const x = i % nx, y = (i / nx) | 0, ci = ctr(i);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){
        if (!dx && !dy) continue; const X = x + dx, Y = y + dy; if (X < bx0 || X > bx1 || Y < by0 || Y > by1) continue; const j = Y * nx + X; if (DONE[j] || !okI(j)) continue;
        if (dx && dy && (!okI(y * nx + X) || !okI(Y * nx + x))) continue;                       // без зрізання кутів чужої клітинки
        const g = G[i] + dkm(ci, ctr(j)); if (g < G[j]){ G[j] = g; PAR[j] = i; push(j, g + hp(j)); }
      }
    }
    if (!found) return null;
    const cells = []; for (let i = e; i >= 0; i = PAR[i]){ cells.push(i); if (i === s) break; } cells.reverse();
    const clear = (a, b) => { const A1 = ctr(a), B1 = ctr(b), n = Math.max(2, Math.ceil(dkm(A1, B1) / (AIR.CELL * 0.5))); for (let k = 0; k <= n; k++){ const px = A1[0] + (B1[0] - A1[0]) * k / n, py = A1[1] + (B1[1] - A1[1]) * k / n, X = Math.floor((px - F.lon0) / F.step), Y = Math.floor((py - F.lat0) / F.step); if (X < 0 || Y < 0 || X >= nx || Y >= ny || !okI(Y * nx + X)) return false; } return true; };
    const way = [cells[0]]; let a = 0; while (a < cells.length - 1){ let b = cells.length - 1; while (b > a + 1 && !clear(cells[a], cells[b])) b--; way.push(cells[b]); a = b; }
    return [A.slice()].concat(way.slice(1, -1).map(ctr), [B.slice()]);
  }

  /* ---- контури зон дозволів: клітинки країни в межах глибини → замкнені кільця [lon,lat] (для карти) ---- */
  const ZR = new Map();
  function airZoneRings(st, km, F){
    F = F || FGRID(); if (!F || !AIRST.includes(st)) return { rings: [], c: null, cells: 0 };
    const geo = airGeo(F), ci = AIRST.indexOf(st) + 1, L = km >= 9999 ? 1e4 : Math.round(km / AIR.CELL), key = st + ":" + L, hit = ZR.get(key); if (hit && hit.F === F) return hit.v;
    const nx = F.nx, ny = F.ny, W = nx + 1, inz = (ix, iy) => ix >= 0 && iy >= 0 && ix < nx && iy < ny && geo.cid[iy * nx + ix] === ci && geo.dist[iy * nx + ix] <= L;
    const nxt = new Map(); let cnt = 0, sx = 0, sy = 0; const cells = [];
    const addE = (ax, ay, bx, by) => { const k = ay * W + ax; let l = nxt.get(k); if (!l){ l = []; nxt.set(k, l); } l.push([bx, by]); };
    for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++){
      if (!inz(ix, iy)) continue; cnt++; sx += ix; sy += iy; cells.push(ix, iy);
      if (!inz(ix, iy - 1)) addE(ix, iy, ix + 1, iy);              // південна межа → на схід (інтер'єр зліва)
      if (!inz(ix + 1, iy)) addE(ix + 1, iy, ix + 1, iy + 1);      // східна → на північ
      if (!inz(ix, iy + 1)) addE(ix + 1, iy + 1, ix, iy + 1);      // північна → на захід
      if (!inz(ix - 1, iy)) addE(ix, iy + 1, ix, iy);              // західна → на південь
    }
    const rings = [];
    for (const [k0, l0] of nxt){
      while (l0.length){
        const e0 = l0.pop(), x0 = k0 % W, y0 = (k0 / W) | 0, ring = [[x0, y0]]; let cx = e0[0], cy = e0[1], dx = cx - x0, dy = cy - y0, guard = 0;
        while ((cx !== x0 || cy !== y0) && guard++ < 200000){
          ring.push([cx, cy]); const l = nxt.get(cy * W + cx); if (!l || !l.length) break;
          let bi = 0, bs = -9; for (let q = 0; q < l.length; q++){ const ex = l[q][0] - cx, ey = l[q][1] - cy, cr = dx * ey - dy * ex, sc = cr < 0 ? 3 : cr === 0 ? 2 : 1; if (sc > bs){ bs = sc; bi = q; } }
          const nx2 = l.splice(bi, 1)[0]; dx = nx2[0] - cx; dy = nx2[1] - cy; cx = nx2[0]; cy = nx2[1];
        }
        // прибрати колінеарні вершини
        const R2 = []; for (let i = 0; i < ring.length; i++){ const a = ring[(i + ring.length - 1) % ring.length], b = ring[i], c = ring[(i + 1) % ring.length]; if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) !== 0) R2.push([F.lon0 + b[0] * F.step, F.lat0 + b[1] * F.step]); }
        if (R2.length >= 3) rings.push(R2);
      }
    }
    let c = null; if (cnt){ const mx = sx / cnt, my = sy / cnt; let bd = 1e9; for (let i = 0; i < cells.length; i += 2){ const d = (cells[i] - mx) * (cells[i] - mx) + (cells[i + 1] - my) * (cells[i + 1] - my); if (d < bd){ bd = d; c = [F.lon0 + (cells[i] + 0.5) * F.step, F.lat0 + (cells[i + 1] + 0.5) * F.step]; } } }
    const v = { rings, c, cells: cnt }; ZR.set(key, { F, v }); if (ZR.size > 24) ZR.delete(ZR.keys().next().value); return v;
  }
  /* зони сторони для карти й інтерфейсу: діючі, заплановані й запити в розгляді */
  function airZones(side){
    if (!D || !D.air) return []; side = side || pov(); if (!side) return [];
    return D.air.perm.filter(q => q.sd === side && !q.dead && D.t < q.until).map(q => ({ id: q.id, st: q.st, op: opOf(q), purpose: q.purpose || "strike", from: q.from == null ? q.t0 : q.from, until: q.until, km: q.km, cap: q.cap, uses: opOf(q) === "msl" ? q.uses : Object.keys(q.ac || {}).length, noBal: !!q.noBal, noWeap: !!q.noWeap, notify: !!q.notify, cond: !!q.cond, on: winOn(q, D.t), left: q.until - D.t, dep: q.dep || 0, fee: q.fee || 0, viol: q.viol || 0 }));
  }
  const airReqs = side => D && D.air ? D.air.req.filter(q => q.from === (side || pov())).map(q => ({ id: q.id, st: q.to, scope: q.scope, km: SCP[q.scope].km, f: q.f, left: q.dec - D.t, start: q.f && !q.f.legacy ? q.f.start : q.t0, dur: q.f ? q.f.dur : SCP[q.scope].dur })) : [];

  /* ---- монітор польотів: літаки гравця над чужим небом (міст BV_DIPX.airUnits) ---- */
  const MON = new Map();
  function airIncursion(p, x, u, why){
    const cd = pk(p, x) + ":inc", cq = [], eff = (k, t, d) => cq.push({ k, t, d }); if (D.cd[cd] > D.t) return; D.cd[cd] = D.t + 15;
    const r0 = R(p, x); addR(p, x, -6); D.rep[p] = clamp(D.rep[p] - 4, -100, 100); addTrust(p, x, -8); D.air.inc[x] = (D.air.inc[x] || 0) + 1; D.air.stat[p].viol++; D.air.cool[pk(p, x)] = Math.max(D.air.cool[pk(p, x)] || 0, D.t + 120);
    eff("rel", `Відносини з ${nm(x)}`, Math.round(R(p, x) - r0)); eff("rep", "Ваша репутація", -4); eff("trust", `Довіра ${nm(x)} до виконання умов`, -8); eff("cool", `Новий запит до ${nm(x)} — не раніше ніж за 120 хв`, 0);
    for (const c of allies(x)) if (c !== p){ const b = R(c, p); addR(c, p, -2); eff("third", `Союзник ${nm(c)} гірше ставиться до вас`, Math.round(R(c, p) - b)); }
    log(`🚨 Порушення повітряного простору ${BY[x].f} ${nm(x)}: ${u.name} (${why}). Відносини −6, репутація −4`, "bad", [p, x], true);
    const rec = decRec({ p, x, out: "incursion", why, rs: [], cq, op: u.op }); airNotify(rec, `Порушення кордону ${nm(x)}: ${u.name}`); airTouch();
  }
  function airMonitor(){
    if (!D || !D.air || !active()) return; const X = XX(); if (!X || !X.airUnits) return; const F = FGRID(); if (!F) return;
    let list; try { list = X.airUnits(); } catch (e) { return; }
    const seen = new Set(), now = Date.now(), msg = (m, k) => { try { X.toast(m, k || "warn"); } catch (e) { /* */ } };
    for (const u of list){
      if (!u.pos || !isHuman(u.side)) continue; seen.add(u.id);
      const m = MON.get(u.id) || { in: null, g: 0, pen: false, w: 0 }; MON.set(u.id, m);
      const c = cellAt(F, u.pos); const key = c.free ? null : (c.st || "closed");
      if (key !== m.in){ if (m.in && m.q && !m.pen && m.in !== "closed") log(`✈ ${u.name} залишив небо ${nm(m.in)}`, "info", [u.side, m.in]); m.in = key; m.g = 0; m.pen = false; m.q = null; m.w = 0; if (!key){ continue; } }
      if (!key) continue;
      const s = airStatusAt(u.side, c, u.op, D.t), q = s.q; m.q = q && !isBad(s.k) ? q.id : null;
      if (!isBad(s.k)){
        if (q && !q.ac[u.id]){
          q.ac[u.id] = 1; const n = Object.keys(q.ac).length;
          if (q.notify) log(`📣 Повідомлення ${nm(q.st)}: ${u.name} входить у її небо`, "info", [u.side, q.st]);
          if (q.cap && opOf(q) !== "msl" && n > q.cap){ q.viol = 1; airEnd(q, "violation", `перевищено ліміт літаків (${q.cap}): ${u.name}`); continue; }
          airTouch();
        }
        if (q && q.noWeap && /Пуск|Скид|пуск|скид/.test(u.phase || "")){ q.viol = 1; airEnd(q, "violation", `${u.name}: застосування зброї в небі ${nm(q.st)}`); continue; }
        if (s.k === "edge" && now - m.w > 90000){ m.w = now; msg(`⚠ ${u.name}: наближення до межі зони неба ${nm(q.st)} (≈ ${Math.max(1, Math.round(s.mc * AIR.CELL))} км)`); }
        m.g = 0; continue;
      }
      const why = STATUS_TXT[s.k](c.st, s).replace(/^./, ch => ch.toLowerCase());
      if (!m.g){ m.g = now; msg(`⚠ ${u.name}: ${why}. Поверніться в дозволену зону`); }
      else if (!m.pen && D.air.enforce && now - m.g > AIR.GRACE * 1000){
        m.pen = true;
        if (c.st){ if (q && (s.k === "depth" || s.k === "late" || s.k === "early")){ q.viol = 1; airEnd(q, "violation", `${u.name}: ${why}`); } else airIncursion(u.side, c.st, u, why); }
      }
    }
    for (const id of MON.keys()) if (!seen.has(id)) MON.delete(id);
  }
  setInterval(() => { try { airMonitor(); } catch (e) { if (window.console) console.warn("[dip mon]", e); } }, 1000);
