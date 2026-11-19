"""Етап 7.59 · підвісне озброєння літаків: гравець сам обирає ракети на вузли підвіски.
   • таблиця AIR_WPN (9 ракет зі спрайтами), AIR_POOL (що може нести кожен літак), AIR_PRESET (3 готові підвіски);
   • u.lo — обрана підвіска (шаблон), u.ld — що зараз на борту; u.mag = сума ld; перезарядка повертає борт до шаблону;
   • пуск: тип ракети обирається за дистанцією серед тих, що на борту; ІЧ-ракети не зазнають впливу РЕБ по радіолокації;
     дальність пуску літака = дальність найдальшої ракети на борту; шанс збиття множиться на коефіцієнт ракети;
   • інтерфейс: розділ «Підвісне озброєння» при зльоті і в панелі літака (зміна — лише на аеродромі, з перезарядкою).
   Патчить src/js/03_game.js і dist/skydominion.html. Ідемпотентно. Після apply_sprites.py."""
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); os.chdir(ROOT)
MARK = "/* loadout:v1 */"

CORE = MARK + r'''
/* ---------- етап 7.59: підвісне озброєння літаків ----------
   rk — вікно пуску як частка радіуса літака T.r (поза вікном ракета не обирається; дальність літака = rk[1] найдальшої ракети на борту);
   pk — множник шансу збиття; ir — ІЧ-ГСН (РЕБ проти радіолокації на неї не діє). id збігається зі спрайтом BV_SPR.missiles. */
const AIR_WPN = {
  r27r1:  { n: "Р-27Р1",             role: "РЛ, напівактивна",   rk: [0.30, 1.00], pk: 1.00, ir: false },
  r27er:  { n: "Р-27ЕР",             role: "РЛ, збільшена дальність", rk: [0.40, 1.25], pk: 0.96, ir: false },
  r27t:   { n: "Р-27Т",              role: "ІЧ, середня дальність", rk: [0.20, 0.80], pk: 1.00, ir: true },
  r27et:  { n: "Р-27ЕТ",             role: "ІЧ, збільшена дальність", rk: [0.30, 1.05], pk: 0.96, ir: true },
  r73e:   { n: "Р-73Е",              role: "ІЧ, ближній бій",    rk: [0.00, 0.55], pk: 1.10, ir: true },
  aam_a:  { n: "AIM-120C AMRAAM",    role: "РЛ, активна",        rk: [0.35, 1.05], pk: 1.05, ir: false },
  aam_b:  { n: "MICA-EM",            role: "РЛ, активна",        rk: [0.25, 0.95], pk: 1.00, ir: false },
  aam_c:  { n: "AIM-9M Sidewinder",  role: "ІЧ, ближній бій",    rk: [0.00, 0.55], pk: 1.08, ir: true },
  aam_d:  { n: "MICA-IR",            role: "ІЧ, ближній і середній", rk: [0.00, 0.70], pk: 1.05, ir: true }
};
const AIR_RU = ["r27r1", "r27er", "r27t", "r27et", "r73e"];
const AIR_POOL = { su27: AIR_RU, mig29: AIR_RU, su30: AIR_RU, su35: AIR_RU, f16: ["aam_a", "aam_c"], mirage: ["aam_b", "aam_d"] };
const AIR_PRESET = {      // bal — збалансована, long — дальній бій, short — ближній бій; сума = кількість вузлів (T.mag)
  su27:   { bal: { r27r1: 2, r27t: 2, r73e: 2 },  long: { r27er: 3, r27et: 1, r73e: 2 }, short: { r27r1: 1, r27t: 1, r73e: 4 } },
  mig29:  { bal: { r27r1: 2, r27t: 2, r73e: 2 },  long: { r27er: 3, r27et: 1, r73e: 2 }, short: { r27r1: 1, r73e: 5 } },
  su30:   { bal: { r27er: 2, r27et: 2, r73e: 2 }, long: { r27er: 4, r27et: 1, r73e: 1 }, short: { r27r1: 2, r73e: 4 } },
  su35:   { bal: { r27er: 3, r27et: 2, r73e: 3 }, long: { r27er: 5, r27et: 1, r73e: 2 }, short: { r27r1: 2, r73e: 6 } },
  f16:    { bal: { aam_a: 3, aam_c: 3 },          long: { aam_a: 5, aam_c: 1 },           short: { aam_a: 1, aam_c: 5 } },
  mirage: { bal: { aam_b: 2, aam_d: 2 },          long: { aam_b: 3, aam_d: 1 },           short: { aam_b: 1, aam_d: 3 } }
};
const AIR_PRESET_N = { bal: "Збалансована", long: "Дальній бій", short: "Ближній бій" };
const lsum = o => { let s = 0; for (const k in o) s += o[k] | 0; return s; };
/* очищення підвіски від сторонніх ракет і надлишку вузлів; порожня → збалансована */
function loadClean(key, lo){
  const T = AD_TYPES[key], pool = AIR_POOL[key]; if (!T || !pool) return null;
  const out = {}; let left = T.mag;
  if (lo) for (const k of pool){ const n = Math.max(0, Math.min(left, lo[k] | 0)); if (n){ out[k] = n; left -= n; } }
  return lsum(out) ? out : Object.assign({}, AIR_PRESET[key].bal);
}
const capOf = (u, T) => (T.air && !T.gun && u.lo) ? lsum(u.lo) : T.mag;      // скільки ракет літак бере (за обраною підвіскою)
function loadFill(u, n){      // додати n ракет на борт за шаблоном u.lo
  if (!u.lo) return; if (!u.ld) u.ld = {};
  for (const k in u.lo){ if (n <= 0) break; const need = u.lo[k] - (u.ld[k] | 0); if (need > 0){ const t = Math.min(need, n); u.ld[k] = (u.ld[k] | 0) + t; n -= t; } }
}
function airReach(u, T){      // дальність пуску = у найдальшої ракети, що є на борту
  const ld = u.ld; if (!ld) return T.r; let m = 0;
  for (const k in ld) if (ld[k] > 0 && AIR_WPN[k]) m = Math.max(m, AIR_WPN[k].rk[1]);
  return m ? T.r * m : T.r;
}
function airPickW(u, T, d){   // яку ракету пустити за дистанції d: серед тих, що на борту й чиє вікно містить d (за кількістю)
  const ld = u.ld; if (!ld) return null;
  const ids = Object.keys(ld).filter(k => ld[k] > 0 && AIR_WPN[k]); if (!ids.length) return null;
  const f = T.r > 0 ? d / T.r : 0, mid = k => (AIR_WPN[k].rk[0] + AIR_WPN[k].rk[1]) / 2;
  let ok = ids.filter(k => f >= AIR_WPN[k].rk[0] && f <= AIR_WPN[k].rk[1]);
  if (!ok.length) ok = [ids.slice().sort((a, b) => Math.abs(f - mid(a)) - Math.abs(f - mid(b)))[0]];
  let tot = 0; for (const k of ok) tot += ld[k];
  let r = Math.random() * tot; for (const k of ok){ r -= ld[k]; if (r < 0) return k; }
  return ok[0];
}
/* ----- інтерфейс ----- */
function loadBoard(u){        // що зараз на борту
  const ld = u.ld || {}, parts = Object.keys(ld).filter(k => ld[k] > 0 && AIR_WPN[k]).map(k => `${escH(AIR_WPN[k].n)} ×${ld[k]}`);
  return parts.length ? `На борту: <b>${parts.join(" · ")}</b>` : "На борту ракет немає";
}
function airLoadSec(u){
  const key = u ? u.key : AP.akey, T = AD_TYPES[key], pool = AIR_POOL[key]; if (!T || T.gun || !pool) return "";
  const edit = !u || u.state === "base";
  let lo;
  if (!u) lo = AP.aload[key] || (AP.aload[key] = Object.assign({}, AIR_PRESET[key].bal));
  else lo = AP.draft && AP.draft.id === u.id ? AP.draft.lo : (u.lo || loadClean(key));
  const sum = lsum(lo); let reach = 0, pks = 0;
  for (const k in lo){ reach = Math.max(reach, AIR_WPN[k].rk[1]); pks += lo[k] * AIR_WPN[k].pk; }
  const fmt = x => x.toFixed(2).replace(".", ",");
  const rows = pool.map(id => {
    const W = AIR_WPN[id], n = lo[id] | 0, M = window.BV_SPR && window.BV_SPR.missiles && window.BV_SPR.missiles[id];
    const ic = M ? `<span style="display:inline-block;position:relative;width:60px;height:22px;flex:none"><img src="${M.src}" alt="" style="position:absolute;left:50%;top:50%;height:58px;width:auto;transform:translate(-50%,-50%) rotate(90deg)"></span>` : "";
    return `<div class="trow" style="display:flex;align-items:center;gap:8px;padding:4px 0">${ic}<span class="tn" style="flex:1;min-width:0">${escH(W.n)}<small>${escH(W.role)} · до ${Math.round(T.r * W.rk[1])} км · шанс ×${fmt(W.pk)}</small></span>` +
      (edit ? `<button class="chip" data-ad="lw" data-w="${id}" data-v="-1" ${n ? "" : "disabled"}>−</button><b style="min-width:20px;text-align:center">${n}</b><button class="chip" data-ad="lw" data-w="${id}" data-v="1" ${sum < T.mag ? "" : "disabled"}>+</button>`
            : `<b style="min-width:20px;text-align:center">${n}</b>`) + `</div>`;
  }).join("");
  const changed = u && AP.draft && AP.draft.id === u.id && JSON.stringify(Object.entries(lo).sort()) !== JSON.stringify(Object.entries(u.lo || {}).sort());
  let h = `<div class="lp-sec"><div class="lp-h"><span>Підвісне озброєння</span><span>${sum} / ${T.mag} вузлів</span></div>`;
  if (edit) h += `<div class="chips" style="margin-bottom:6px">` + Object.keys(AIR_PRESET_N).map(p => `<button class="chip" data-ad="lpre" data-v="${p}">${AIR_PRESET_N[p]}</button>`).join("") + `</div>`;
  h += rows + (sum ? `<div class="note">Дальність пуску: до <b>${Math.round(T.r * reach)} км</b> · середній шанс ×<b>${fmt(pks / sum)}</b>. Ракету літак обирає сам за дистанцією до цілі; ІЧ-ракети не залежать від РЕБ проти радіолокації.</div>`
                   : `<div class="note">Підвіска порожня — буде взято «Збалансовану».</div>`);
  if (u){
    h += `<div class="note" id="adLoadLive">${loadBoard(u)}</div>`;
    h += edit ? `<div class="chips"><button class="chip" data-ad="lapply" ${changed && sum ? "" : "disabled"}>⟳ Перепідвісити · ${T.reload} с</button></div><div class="note">Зміна підвіски — лише на аеродромі: поточні ракети повертаються в запас, літак перезаряджається за новою підвіскою.</div>`
               : `<div class="note">Підвіску можна змінити тільки на аеродромі (літак у стані «на аеродромі»).</div>`;
  }
  return h + `</div>`;
}
function loadAct(a, w, v){
  const u = AP.mode === "unit" ? ADS.units.get(AP.unit) : null, key = u ? u.key : AP.akey, T = AD_TYPES[key]; if (!T || !AIR_POOL[key]) return;
  if (u && u.state !== "base") return;
  let lo;
  if (u){ if (!AP.draft || AP.draft.id !== u.id) AP.draft = { id: u.id, lo: Object.assign({}, u.lo || loadClean(key)) }; lo = AP.draft.lo; }
  else lo = AP.aload[key] || (AP.aload[key] = Object.assign({}, AIR_PRESET[key].bal));
  if (a === "lw"){ const n = (lo[w] | 0) + v; if (n < 0 || !AIR_WPN[w] || lsum(lo) + v > T.mag) return; if (n) lo[w] = n; else delete lo[w]; }
  else if (a === "lpre"){ const P = AIR_PRESET[key][v]; if (!P) return; for (const k in lo) delete lo[k]; Object.assign(lo, P); }
  else if (a === "lapply"){ if (u && AP.draft && lsum(lo)){ if (cmd("loadout", { id: u.id, lo: Object.assign({}, lo) })) toast(`${T.n}: перепідвіска, перезарядка ${T.reload} с`); AP.draft = null; } }
  return apRender();
}
window.BV_LOAD = { AIR_WPN, AIR_POOL, AIR_PRESET, loadClean, airPickW, airReach, capOf, lsum, loadFill };      // для тестів
'''

_i = CORE.index("/* ----- інтерфейс ----- */"); _j = CORE.index("window.BV_LOAD = {")
UI = CORE[_i:_j]; CORE = CORE[:_i] + CORE[_j:]      # UI живе в області панелі ППО (там AP, cmd, apRender), логіка — на верхньому рівні

EDITS = [
  # --- ядро ---
  ('function airFire(u, T, shotsBy, t){\n', CORE + 'function airFire(u, T, shotsBy, t){\n'),
  # дальність пуску
  ('const d = hav(u.pos, x.pos); if (d > T.r) continue;\n      const off = Math.abs(((brg(u.pos, x.pos) - u.hdg + 540) % 360) - 180); if (off > airArc(T)) continue;',
   'const d = hav(u.pos, x.pos); if (d > airReach(u, T)) continue;\n      const off = Math.abs(((brg(u.pos, x.pos) - u.hdg + 540) % 360) - 180); if (off > airArc(T)) continue;'),
  # пуск конкретної ракети
  ('    u.mag--; u.fired++; ADS.fired++;\n    fireMissile(u, T, best, T.p[AD_CI[WEAPONS[best.key].ad]]);',
   '    u.mag--; u.fired++; ADS.fired++;\n    const wid = airPickW(u, T, hav(u.pos, best.pos)), WP = wid && AIR_WPN[wid]; if (wid) u.ld[wid]--;\n    fireMissile(u, T, best, T.p[AD_CI[WEAPONS[best.key].ad]] * (WP ? WP.pk * (WP.ir ? 1 : ewRadarK(u.side || "ua", best.pos)) : 1), wid);'),
  ('function fireMissile(u, T, t, pk){', 'function fireMissile(u, T, t, pk, wid){'),
  ('aam: T.air ? aamPick(u.key, hav(pos, t.pos), T.r) : null', 'aam: T.air ? (wid || aamPick(u.key, hav(pos, t.pos), T.r)) : null'),
  # місткість і перезарядка за підвіскою
  ('if (u.mag >= T.mag || !(u.reserve > 0)) return false;\n  if (u.state === "base")', 'if (u.mag >= capOf(u, T) || !(u.reserve > 0)) return false;\n  if (u.state === "base")'),
  ('const take = Math.min(T.mag - u.mag, u.reserve); u.mag += take; if (u.reserve !== Infinity) u.reserve -= take;\n      if (u.after === "patrol"',
   'const take = Math.min(capOf(u, T) - u.mag, u.reserve); u.mag += take; loadFill(u, take); if (u.reserve !== Infinity) u.reserve -= take;\n      if (u.after === "patrol"'),
  ('if (u.after === "patrol" && u.mag < T.mag && u.reserve > 0)', 'if (u.after === "patrol" && u.mag < capOf(u, T) && u.reserve > 0)'),
  ('T.air ? !(u.mag < T.mag && u.reserve > 0 &&', 'T.air ? !(u.mag < capOf(u, T) && u.reserve > 0 &&'),
  ('`${u.mag} / ${T.mag}`', '`${u.mag} / ${capOf(u, T)}`'),
  (': u.mag / T.mag) * 100}%', ': u.mag / capOf(u, T)) * 100}%'),
  # створення літака з підвіскою
  ('patrolOK(T.side, a.patrol)) return null;\n        const total = a.ammo === "inf" || a.ammo === Infinity ? Infinity : Math.max(1, a.ammo | 0), mag = Math.min(T.mag, total);',
   'patrolOK(T.side, a.patrol)) return null;\n        const lo0 = loadClean(a.key, a.lo);\n        const total = a.ammo === "inf" || a.ammo === Infinity ? Infinity : Math.max(1, a.ammo | 0), mag = Math.min(lo0 ? lsum(lo0) : T.mag, total);'),
  ('ADS.units.set(nu.id, nu); airGo(nu, nu.patrol, "transit");', 'if (lo0){ nu.lo = lo0; nu.ld = {}; loadFill(nu, nu.mag); }\n        ADS.units.set(nu.id, nu); airGo(nu, nu.patrol, "transit");'),
  ('      case "reload": return T.air ? airReload(u) : adStartReload(u);',
   '''      case "loadout": {      // 7.59: нова підвіска — лише на аеродромі; ракети з борту йдуть у запас, перезарядка за новим шаблоном
        const T0 = u && AD_TYPES[u.key]; if (!T0 || !T0.air || T0.gun || u.state !== "base") return null;
        const lo = loadClean(u.key, a.lo); if (!lo) return null;
        if (u.reserve !== Infinity) u.reserve += u.mag;
        u.lo = lo; u.ld = {}; u.mag = 0; ADS.dirty = true;
        if (u.reserve > 0){ u.state = "reload"; u.rl = T0.reload; u.after = "base"; }
        HOOKS.onAd && HOOKS.onAd(op, a, u); return true;
      }
      case "reload": return T.air ? airReload(u) : adStartReload(u);'''),
  # інтерфейс
  ('  const airChars = T => kv(', UI + '  const airChars = T => kv('),
  ('const AP = { open: false, mode: null,', 'const AP = { aload: {}, draft: null, open: false, mode: null,'),
  ('ammo: AP.aammoInf ? "inf" : Math.max(1, AP.aammo | 0), patrol: AP.place.slice() })', 'ammo: AP.aammoInf ? "inf" : Math.max(1, AP.aammo | 0), patrol: AP.place.slice(), lo: loadClean(AP.akey, AP.aload[AP.akey]) })'),
  ('const alim = HOOKS.adStock && HOOKS.adStock(side, AP.akey) !== Infinity;', 'const alim = HOOKS.adStock && HOOKS.adStock(side, AP.akey) !== Infinity;\n      h += airLoadSec(null);'),
  ('h += targetModes(u, T) + skipSec(u, T);\n    h += `<div class="lp-sec"><div class="lp-h"><span>Керування', 'h += airLoadSec(u) + targetModes(u, T) + skipSec(u, T);\n    h += `<div class="lp-sec"><div class="lp-h"><span>Керування'),
  ('const pg = $("adP1Go"); if (pg) pg.disabled = !(u.state === "ready" && u.mag > 0);', 'const pg = $("adP1Go"); if (pg) pg.disabled = !(u.state === "ready" && u.mag > 0);\n    const ll = $("adLoadLive"); if (ll) ll.innerHTML = loadBoard(u);'),
  ('      case "pickpatrol": return adStartPick("patrol");', '      case "lw": return loadAct("lw", b.dataset.w, +v);      // 7.59: підвісне озброєння\n      case "lpre": return loadAct("lpre", null, v);\n      case "lapply": return loadAct("lapply");\n      case "pickpatrol": return adStartPick("patrol");'),
]
def patch(t, name):
    if MARK in t: print(name, ": вже застосовано"); return t
    if "sprites:v1" not in t: sys.exit(name + ": спершу tools/apply_sprites.py")
    for old, new in EDITS:
        n = t.count(old)
        if n != 1: sys.exit(f"{name}: очікувався 1 збіг, знайдено {n}: {old[:80]!r}")
        t = t.replace(old, new)
    t = t.replace("${u.mag}/${T.mag}", "${u.mag}/${capOf(u, T)}")      # списки літаків: «6/6» → за підвіскою
    print(name, ": OK"); return t
def rw(path, fn):
    t = open(path, encoding="utf8").read(); n = fn(t)
    if n != t: open(path, "w", encoding="utf8").write(n)
rw("src/js/03_game.js", lambda t: patch(t, "src/js/03_game.js"))
rw("dist/skydominion.html", lambda t: patch(t, "dist (гра)"))
