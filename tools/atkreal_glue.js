/* atkreal:v1 */
/* ---------- етап 7.63: реалізм атак (обидві сторони однаково) ----------
   • надійність: частина дронів/ракет відмовляє в польоті (двигун, наведення) і падає, не долетівши;
   • влучність: при досягненні цілі — шанс «близького промаху» (шкода ×0,3) залежно від класу;
   • авіація-носії: збитий літак безповоротно зменшує парк (раніше втрати були безкоштовні) і дає очки обороні;
   • оборот літака: після повернення носій проходить обслуговування, перш ніж знову вилетить;
   Баланс — таблиця ATKR; з консолі (#debug): BV_EVAL("ATKR.on=false") вимикає все. */
const ATKR = {
  on: true,
  fail:  { drone: 0.06, cruise: 0.05, ballistic: 0.025, hyper: 0.04, missile: 0 },      // шанс відмови за політ
  phit:  { drone: 0.88, cruise: 0.92, ballistic: 0.85, hyper: 0.88 },                   // шанс повного ураження при досягненні цілі
  missK: 0.3,                                                                           // частка шкоди при близькому промаху
  tat:   { tu95: 120, tu22: 90, mig31: 90, su34: 75, su24: 60, s70: 60 },               // с обслуговування між вильотами (час симуляції)
  tatDefault: 60
};
function atkFailP(W){
  if (!ATKR.on || !W || W.child || W.mirv || W.recon || W.sea) return 0;
  let p = ATKR.fail[W.cls] || 0;
  if (W.fpv) p = 0.08; else if (W.glide) p = 0.02;
  return p;
}
function atkPhit(key){
  const W = WEAPONS[key]; if (!ATKR.on || !W || W.child) return 1;
  let p = ATKR.phit[W.cls]; if (p == null) return 1;
  if (W.fpv) p = 0.8; else if (W.glide) p = 0.85;
  return Math.random() < p ? 1 : ATKR.missK;
}
/* відмова в польоті: апарат падає (не вражає ціль; у втрати оборони не рахується) */
function atkFail(u){
  u.failAt = null; u.onEnd = null;
  u.meta = Object.assign({}, u.meta, { phase: "Відмова — падає" });
  u.fall = { t: 0, dur: rnd(2.2, 4.4), w: (Math.random() < 0.5 ? -1 : 1) * rnd(120, 400), v0: Math.max(1.2, u.spd * 0.4), dir: u.hdg };
  const S = GAME.st && GAME.st[u.sd]; if (S) S.fails = (S.fails | 0) + 1;
  try { fxFall(u); } catch (e) {}
  ADS.dirty = true;
}
function atkCarLost(t, u){
  const C = CARRIERS[t.key], sd = u ? (u.side || "ua") : other(t.sd), S = GAME.st[sd], E = ecoE(t.sd);
  if (E && E.fleet && E.fleet[t.key] > 0){ E.fleet[t.key]--; facClamp(t.sd); }
  if (S){ S.downed++; S.pts += 15; S.ptsDef += 15; }
  if (GAME.st[t.sd]) GAME.st[t.sd].lost++;
  gameToast(`${SIDE_N[sd]}: збито ${C.n}`);
}
function atkLanded(cu){
  const C = CARRIERS[cu.key]; if (!C || C.kind !== "air" || !GAME.on) return;
  (GAME.carCool || (GAME.carCool = [])).push({ sd: cu.sd, key: cu.key, until: SIM.t + (ATKR.tat[cu.key] || ATKR.tatDefault) });
}
function atkCooling(sd, cKey){
  const L = GAME.carCool; if (!L || !L.length) return 0;
  let n = 0;
  for (let i = L.length - 1; i >= 0; i--){ if (L[i].until <= SIM.t) L.splice(i, 1); else if (L[i].sd === sd && L[i].key === cKey) n++; }
  return n;
}
