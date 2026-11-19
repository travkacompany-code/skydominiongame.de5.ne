/* Тести ІІ «Хорнет». Запуск: node tools/test_hornet_ai.js
   Світ імітується простим env: список цілей у локальних км, видимість, придушення, ППО. */
"use strict";
const H = require("../src/js/02b_hornet_ai.js");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c){ pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ ПРОВАЛ: " + m); } };

/* повний політ: повертає мозок після завершення (або після tMax) */
function fly(o, envo, tMax = 400){
  const b = H.create(Object.assign({ id: 1, x: -8, y: 0, fuelKm: 90, speedKms: 3.04, seed: 1 }, o));
  const alive = Object.assign({}, envo.dead || {});
  const env = {
    vis: envo.vis == null ? 1 : envo.vis,
    ew: p => envo.ew || 0,
    threat: p => envo.threat ? envo.threat(p) : 0,
    candidates: (p, r) => (envo.targets || []).filter(t => !alive[t.id] && Math.hypot(t.x - p[0], t.y - p[1]) <= r),
    alive: id => !alive[id]
  };
  let t = 0;
  while (!b.res && t < tMax){
    H.step(b, 0.1, env); t += 0.1;
    if (envo.onTick) envo.onTick(b, t, alive);
  }
  b.tEnd = t; b.alive = alive;
  return b;
}
const T = (id, x, y, value, conceal, extra) => Object.assign({ id, x, y, value: value == null ? 0.7 : value, conceal: conceal || 0, name: id }, extra);
const states = b => { const s = []; for (const e of b.log) if (!s.length || s[s.length - 1] !== e.st) s.push(e.st); return s; };

console.log("1. Знаходить і вражає одиночну ціль у районі пошуку");
{
  const b = fly({}, { targets: [T("fac1", 2.5, 1.5)] });
  ok(b.res === "strike", "політ завершився ударом (res=" + b.res + ")");
  ok(b.strike && b.strike.target === "fac1", "ціль — саме об'єкт fac1");
  ok(b.strike && b.strike.miss < 1.8, "промах менший за 1.8 км (" + (b.strike ? b.strike.miss.toFixed(2) : "-") + ")");
  const s = states(b).join(">");
  ok(/search.*track.*classify.*engage/.test(s), "послідовність станів: " + s);
  ok(b.log.length > 3 && b.log.every(e => typeof e.msg === "string" && e.msg.length > 5), "журнал рішень містить пояснення (" + b.log.length + " записів)");
}

console.log("2. Порожній район: паливо закінчується, удару немає");
{
  const b = fly({ fuelKm: 60 }, { targets: [], vis: 1 }, 600);
  ok(b.res === "ditch", "res=ditch, а не вигаданий удар (res=" + b.res + ")");
  ok(b.flown > 40, "налітав ≈ " + b.flown.toFixed(0) + " км, повторні проходи: " + b.pass);
}

console.log("3. Детермінізм: той самий seed → той самий журнал");
{
  const a = fly({ seed: 7 }, { targets: [T("a", 3, -2)] }), c = fly({ seed: 7 }, { targets: [T("a", 3, -2)] });
  ok(JSON.stringify(a.log) === JSON.stringify(c.log) && a.res === c.res, "журнали збігаються (" + a.log.length + " записів)");
  const d = fly({ seed: 8 }, { targets: [T("a", 3, -2)] });
  ok(JSON.stringify(a.log) !== JSON.stringify(d.log), "інший seed дає інший перебіг");
}

console.log("4. Придушення (РЕБ) погіршує точність: частка влучань ≤ 1.5 км");
{
  const rate = ew => { let n = 0, h = 0; for (let s = 1; s <= 120; s++){ const b = fly({ seed: s }, { targets: [T("t", 2, 1)], ew }, 300); if (b.res === "strike" && b.strike.target === "t"){ n++; if (b.strike.miss <= 1.5) h++; } } return { n, h, r: n ? h / n : 0 }; };
  const clean = rate(0), jam = rate(0.9);
  console.log("     без РЕБ: " + clean.h + "/" + clean.n + " · з РЕБ 0.9: " + jam.h + "/" + jam.n);
  ok(clean.r > 0.85, "без придушення влучає > 85% (" + (clean.r * 100).toFixed(0) + "%)");
  ok(jam.r < clean.r - 0.2, "з придушенням точність помітно нижча (" + (jam.r * 100).toFixed(0) + "%)");
}

console.log("5. Хибні контакти й приманки: поганий огляд → більше помилок");
{
  const stat = (vis, ew) => { let wrong = 0, total = 0;
    for (let s = 1; s <= 150; s++){
      const b = fly({ seed: s }, { targets: [T("decoy", 2, 1, 0.8, 0, { decoy: true })], vis, ew }, 300);
      total++; if (b.res === "strike" && (b.strike.phantom || b.strike.target === "decoy")) wrong++;
    }
    return wrong / total; };
  const good = stat(1, 0), bad = stat(0.35, 0.6);
  console.log("     помилкових ударів по приманці/завадах: добра видимість " + (good * 100).toFixed(0) + "% · погана " + (bad * 100).toFixed(0) + "%");
  ok(good < 0.2, "за доброї видимості приманку здебільшого відкидає (<20%)");
  ok(bad > good + 0.1, "за поганих умов помилок помітно більше");
}

console.log("6. Дві цілі водночас у полі зору: цінніша обирається частіше за дешеву");
{
  let a = 0, c = 0;
  for (let s = 1; s <= 120; s++){
    const b = fly({ seed: s }, { targets: [T("big", 0.2, 0.9, 1.0), T("small", 0.2, -0.9, 0.35)] }, 300);
    if (b.res === "strike" && b.strike.target === "big") a++; else if (b.res === "strike" && b.strike.target === "small") c++;
  }
  console.log("     цінна: " + a + " · дешева: " + c);
  ok(a > c * 1.5, "цінну ціль бере частіше щонайменше в 1.5 раза");
}

console.log("7. Не метається між майже рівними цілями (гістерезис + охолодження)");
{
  let maxSw = 0, sum = 0, both = 0;
  for (let s = 1; s <= 80; s++){
    const b = fly({ seed: s }, { targets: [T("l", 0.2, 0.8, 0.7), T("r", 0.2, -0.8, 0.72)] }, 300);
    maxSw = Math.max(maxSw, b.switches); sum += b.switches; if (b.res === "strike") both++;
  }
  console.log("     перемикань усього: " + sum + " за 80 польотів, ударів: " + both);
  ok(maxSw <= 2, "не більше 2 перемикань цілі за політ (max=" + maxSw + ")");
  ok(both >= 70, "дрон доводить атаку до кінця, а не крутиться між цілями (" + both + "/80)");
}

console.log("8. Ціль знищена іншим засобом під час супроводу → відміна атаки");
{
  let killed = false;
  const b = fly({}, { targets: [T("x", 2.5, 1.5)], onTick: (br, t, alive) => { if (!killed && br.st === "engage"){ alive.x = true; killed = true; } } }, 400);
  ok(killed, "ціль було знищено в момент атаки");
  ok(!(b.res === "strike" && b.strike.target === "x"), "удар по вже знищеній цілі не зарахований");
  ok(b.log.some(e => /зникла чи вже знищена/.test(e.msg)) || b.res === "ditch", "у журналі зафіксована відміна");
}

console.log("9. Режим «з підтвердженням оператора»");
{
  const hold = fly({ roe: "confirm" }, { targets: [T("c", 2.5, 1.5)] }, 120);
  ok(hold.res !== "strike" || hold.strike.target !== "c", "без підтвердження не вражає ціль (st=" + hold.st + ", res=" + hold.res + ")");
  ok(states(hold).includes("await"), "дрон перейшов у стан очікування");
  let sent = false;
  const b = fly({ roe: "confirm" }, { targets: [T("c", 2.5, 1.5)], onTick: br => { if (!sent && br.st === "await"){ sent = H.confirm(br); } } }, 300);
  ok(sent && b.res === "strike" && b.strike.target === "c", "після підтвердження — удар");
  const lost = fly({ roe: "confirm", lostLink: "ditch" }, { targets: [T("c", 2.5, 1.5)], ew: 0.95 }, 300);
  ok(lost.res !== "strike" || lost.strike.target !== "c", "політика «ditch» при втраті зв'язку: удару немає (res=" + lost.res + ")");
}

console.log("10. «Останній шанс»: паливо на межі й слабкий контакт → атака; без контакту → самоліквідація");
{
  const mk = () => { const b = H.create({ id: 1, x: 0, y: 0, fuelKm: 10, speedKms: 3.04, seed: 5 }); return b; };
  const env = { vis: 1, candidates: () => [], alive: () => true };
  const w = mk(); w.contacts.z = { id: "z", x: 1.5, y: 0, conf: 0.45, value: 0.6, conceal: 0, phantom: false, decoy: false, name: "z" };
  H.step(w, 0.2, env);
  ok(w.st === "engage" && w.lastChance, "слабкий контакт (45%) при залишку 10 км → «останній шанс» (st=" + w.st + ")");
  const n = mk(); n.contacts.q = { id: "q", x: 1.5, y: 0, conf: 0.15, value: 0.6, conceal: 0, phantom: false, decoy: false };
  H.step(n, 0.2, env);
  ok(n.res === "ditch", "контакт нижче порога 30% → самоліквідація без удару (res=" + n.res + ")");
}

console.log("11. Високий крок симуляції не «проскакує» ціль (прискорення часу)");
{
  const run = dt => { const b = H.create({ id: 1, x: -8, y: 0, fuelKm: 90, speedKms: 3.04, seed: 3 }); const env = { vis: 1, candidates: (p, r) => Math.hypot(2.5 - p[0], 1.5 - p[1]) <= r ? [T("f", 2.5, 1.5)] : [], alive: () => true };
    for (let t = 0; t < 400 && !b.res; t += dt) H.step(b, dt, env); return b; };
  const slow = run(0.1), fast = run(2.0);
  ok(slow.res === "strike" && fast.res === "strike", "і крок 0.1 с, і крок 2 с знаходять ціль");
}

console.log("12. Паливо, час доби: вночі пошук гірший, ніж удень");
{
  const found = vis => { let n = 0; for (let s = 1; s <= 80; s++){ const b = fly({ seed: s, fuelKm: 55 }, { targets: [T("t", 4, -3, 0.7, 0.3)], vis }, 300); if (b.res === "strike" && b.strike.target === "t") n++; } return n; };
  const day = found(1), night = found(0.4);
  console.log("     знайдено: день " + day + "/80 · ніч " + night + "/80");
  ok(day > night, "вдень успішних атак більше, ніж уночі");
}

console.log("13. Загроза ППО знижує оцінку цілі, коли обидва контакти вже в полі зору");
{
  let safe = 0;
  for (let s = 1; s <= 40; s++){
    const b = H.create({ id: 1, x: 0, y: 0, fuelKm: 90, speedKms: 3.04, seed: s });
    const mk = (id, x, y) => ({ id, x, y, conf: 0.5, value: 0.7, conceal: 0, phantom: false, decoy: false, name: id });
    b.contacts.risky = mk("risky", 2.2, 0.3); b.contacts.safe = mk("safe", -2.2, -0.3);
    H.step(b, 0.1, { vis: 1, threat: p => p[0] > 0 ? 0.6 : 0, candidates: () => [], alive: () => true });
    if (b.cur === "safe") safe++;
  }
  ok(safe === 40, "з двох однакових контактів завжди береться менш прикритий (" + safe + "/40)");
}

console.log("\nПідсумок: " + pass + " пройдено, " + fail + " провалено");
process.exit(fail ? 1 : 0);
