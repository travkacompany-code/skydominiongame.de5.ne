
  /* ---- інтерфейс неба в дипломатії ---- */
  function gateChip(ok, label, val, lim, tip){ return `<span class="dp-gate ${ok ? "ok" : "no"}" title="${esc(tip || "")}"><i>${ok ? "✓" : "✕"}</i>${label}<b>${val}</b><small>${lim}</small></span>`; }
  const why2 = rs => rs.map(r => r[0] + " " + (r[1] > 0 ? "+" : "") + (Math.abs(r[1]) < 1 ? r[1].toFixed(2) : Math.round(r[1] * 100) / 100)).join(", ");
  const gateBlk = (p, x, e) => e.blk && (!e.gates.rel || !e.gates.cmp || !e.gates.rsk || stOf(p, x) === "war" || sancLvl(x, p) || !AIRST.includes(x)) ? e.blk : "";
  const ui = () => window.BV_AIRUI || null;
  function airBlock(p, x){
    const e = evalAir(p, x, "corr"), pms = permsAll(p).filter(q => q.st === x), rqs = D.air.req.filter(q => q.from === p && q.to === x), gb = gateBlk(p, x, e);
    let h = `<div class="dp-air"><div class="dp-sec sm">✈ Повітряний простір ${BY[x].f}</div><div class="dp-gates">`;
    h += gateChip(e.gates.rel, "Відносини", e.r, "≥ " + AIR.RELMIN, "Рівень відносин із країною");
    h += gateChip(e.gates.cmp, "Сумісність", pct(e.cm.v), "≥ " + pct(AIR.COMPMIN), why2(e.cm.rs.map(r => [r[0], Math.round(r[1] * 100)])) + " (пункти)");
    h += gateChip(e.gates.rsk, "Ризик", pct(e.rk.v), "≤ " + pct(AIR.RISKMAX), why2(e.rk.rs.map(r => [r[0], Math.round(r[1] * 100)])) + " (пункти ризику)");
    h += `</div>`;
    for (const pm of pms) h += `<div class="dp-note ok">${esc(OPS[opOf(pm)].s)}: ${pm.from > D.t ? "почнеться " + fmtT(pm.from) + " · до " + fmtT(pm.until) : "діє ще ≈ " + fmtDur(pm.until - D.t)} · ${esc(termsText(pm))}${pm.cap ? ` · ${opOf(pm) === "msl" ? pm.uses : Object.keys(pm.ac || {}).length}/${pm.cap}` : ""}</div>`;
    for (const rq of rqs) h += `<div class="dp-note">Запит${rq.f && !rq.f.legacy ? " (" + esc(OPS[rq.f.op].s.toLowerCase()) + ")" : ""} розглядається — рішення ≈ через ${fmtDur(rq.dec - D.t)} <button class="dp-b ghost sm" data-dp="aircx" data-v="${rq.id}">Скасувати</button></div>`;
    h += `<div class="dp-acts"><button class="dp-b gold ${gb ? "dis" : ""}" data-dp="airform" data-v="${x}" title="${esc(gb || "Форма запиту: мета, дата й час, строк, тип операції, умови")}">✈ Запит неба…<small>${gb ? "" : pct(e.p)}</small></button><button class="dp-b ghost sm" data-dp="airplan">🧭 Маршрут</button></div>${gb ? `<em class="dp-why">${esc(gb)}</em>` : ""}</div>`;
    return h;
  }
  function airOfferCard(q){
    const a = q.air, x = q.from, fee = a.t.fee, f = a.f;
    return `<div class="dp-card air"><div class="dp-ct">✈ ${BY[x].f} <b>${esc(nm(x))}</b> готова відкрити небо на умовах:</div><div class="dp-terms">${f && !f.legacy ? esc(OPS[f.op].n) + " · " + esc(PURP[f.purpose].n.toLowerCase()) + "<br>" : ""}${esc(termsText({ km: a.t.km, cap: a.t.cap, noBal: a.t.noBal, noWeap: a.t.noWeap, notify: a.t.notify, fee, dep: a.dep, op: f && f.op }))}<br>Термін: ${fmtDur(a.t.dur)}${f && !f.legacy ? " · початок " + fmtT(Math.max(D.t, f.start)) : ""}</div><div class="dp-note">Пропозиція діє ще ≈ ${Math.max(0, Math.ceil(q.exp - D.t))} хв. Порушення умов = відкликання, відносини −12, репутація −8${a.dep ? ", депозит втрачено" : ""}.</div><div class="dp-acts"><button class="dp-b gold" data-dp="ans" data-v="${q.id}" data-w="1">Прийняти${fee ? ` (−${fm(fee)} млн $)` : ""}</button><button class="dp-b ghost" data-dp="ans" data-v="${q.id}" data-w="0">Відхилити</button></div></div>`;
  }
  /* картка рішення: причина, чинники, наслідки (для відмови, порушення, відкликання, умовної пропозиції, схвалення) */
  const DEC_T = { deny: ["🚫", "Відмова", "bad"], late: ["⌛", "Вікно запиту минуло", "bad"], full: ["✅", "Небо відкрито", "good"], cond: ["📨", "Умовна пропозиція", "ask"], "cond-ok": ["✅", "Умови прийнято — небо відкрито", "good"], "cond-no": ["✖", "Умови відхилено", "bad"], viol: ["⚠", "Порушення умов дозволу", "bad"], revoked: ["⛔", "Дозвіл відкликано країною", "bad"], incursion: ["🚨", "Порушення повітряного простору", "bad"] };
  const CQ_I = { rel: "🤝", rep: "📉", trust: "🔒", cool: "⏳", third: "🌐", money: "💰", note: "ℹ", none: "ℹ" };
  function decHtml(r, compact){
    const t = DEC_T[r.out] || ["•", r.out, ""], f = r.f; let h = `<div class="dp-dec ${t[2]}"><div class="dp-dh"><span class="dp-di">${t[0]}</span><b>${t[1]}</b><span class="dp-dx">${BY[r.x].f} ${esc(nm(r.x))}</span><time>${fmtT(r.t)}</time></div>`;
    if (f && !f.legacy) h += `<div class="dp-dq">${esc(PURP[f.purpose].i)} ${esc(PURP[f.purpose].n)} · ${esc(OPS[f.op].s)} · ${fmtDur(f.dur)} з ${fmtT(f.start)}${Object.keys(f.conds).length ? " · " + Object.keys(f.conds).map(k => esc(CONDS[k].s)).join(", ") : ""}</div>`;
    if (r.why && r.out !== "full" && r.out !== "cond") h += `<div class="dp-dwhy"><span>Причина</span>${esc(r.why.replace(/^./, c => c.toUpperCase()))}</div>`;
    if (r.terms && (r.out === "full" || r.out === "cond" || r.out === "cond-ok")) h += `<div class="dp-dq">${esc(termsText({ km: r.terms.km, cap: r.terms.cap, noBal: r.terms.noBal, noWeap: r.terms.noWeap, notify: r.terms.notify, fee: r.out === "full" ? 0 : r.terms.fee, dep: r.terms.dep, op: r.op }))} · ${fmtDur(r.terms.dur)}</div>`;
    if (r.win) h += `<div class="dp-dq">Вікно дії: ${fmtT(r.win[0])} → ${fmtT(r.win[1])}</div>`;
    if (!compact && r.rs && r.rs.length) h += `<div class="dp-dsec">Що вплинуло на рішення</div><ul class="dp-rs">${r.rs.map(z => `<li class="${z[1] >= 0 ? "pos" : "neg"}"><span>${esc(z[0])}</span><b>${z[1] > 0 ? "+" : ""}${z[1]}</b></li>`).join("")}</ul>`;
    if (r.cq && r.cq.length){
      h += `<div class="dp-dsec">${r.out === "deny" || r.out === "late" || r.out === "cond-no" || r.out === "viol" || r.out === "revoked" || r.out === "incursion" ? "Дипломатичні наслідки" : "Наслідки"}</div><ul class="dp-cq">`;
      h += r.cq.map(z => `<li class="${z.d > 0 ? "pos" : z.d < 0 ? "neg" : ""}"><i>${CQ_I[z.k] || "•"}</i><span>${esc(z.t)}</span>${z.d ? `<b>${z.d > 0 ? "+" : ""}${z.k === "money" ? fm(z.d) + " млн $" : z.d}</b>` : ""}</li>`).join("") + `</ul>`;
    }
    return h + `</div>`;
  }
  const decsOf = p => D.air.dec.filter(z => z.p === p);
  const unreadAir = p => decsOf(p).filter(z => !z.read).length;
  const capUsed = q => opOf(q) === "msl" ? q.uses : Object.keys(q.ac || {}).length;
  function tabAir(p){
    const A = D.air, S = A.stat[p], pms = permsAll(p), rqs = A.req.filter(q => q.from === p), ofs = D.pend.filter(q => q.type === "airc" && q.to === p), dcs = decsOf(p).slice(-6).reverse();
    let h = `<div class="dp-acts"><button class="dp-b gold" data-dp="airform" data-v="">✈ Новий запит</button><button class="dp-b ghost" data-dp="airplan">🧭 Планувальник</button><button class="dp-b ghost" data-dp="airmap">🗺 Зони на мапі</button></div>`;
    h += `<div class="dp-sec">Дозволи</div>` + (pms.length ? pms.map(q => { const on = winOn(q, D.t), tot = Math.max(1, q.until - (q.from == null ? q.t0 : q.from)); return `<div class="dp-card air ${on ? "" : "wait"}"><div class="dp-ct">${BY[q.st].f} <b>${esc(nm(q.st))}</b> · ${esc(OPS[opOf(q)].s)} · ${q.cond ? "умовний" : "повний"}${on ? "" : ' · <i class="dp-t air w">очікує початку</i>'}</div><div class="dp-terms">${esc(termsText(q))}</div><div class="dp-bar2"><i style="width:${on ? clamp((q.until - D.t) / tot * 100, 0, 100) : 100}%"></i></div><div class="dp-note">${on ? `Залишилось ≈ ${fmtDur(q.until - D.t)}` : `Почнеться ${fmtT(q.from)}`} · до ${fmtT(q.until)}${q.cap ? ` · ${capWord(q)} ${capUsed(q)}/${q.cap}` : capUsed(q) ? ` · ${capWord(q)} ${capUsed(q)}` : ""}</div><div class="dp-acts"><button class="dp-b ghost sm" data-dp="airplan" data-v="${q.id}">🧭 Маршрут</button><button class="dp-b ghost sm" data-dp="airret" data-v="${q.id}">Повернути дозвіл</button></div></div>`; }).join("") : `<div class="dp-empty">Немає</div>`);
    h += `<div class="dp-sec">Запити й пропозиції</div>`;
    h += rqs.map(q => `<div class="dp-line"><span>${BY[q.to].f} ${esc(nm(q.to))} · ${esc(q.f && !q.f.legacy ? OPS[q.f.op].s.toLowerCase() + " · " + fmtDur(q.f.dur) : SCP[q.scope].n.toLowerCase())}</span><b>≈ ${fmtDur(q.dec - D.t)}</b><button class="dp-b ghost sm" data-dp="aircx" data-v="${q.id}">Скасувати</button></div>`).join("");
    h += ofs.map(airOfferCard).join(""); if (!rqs.length && !ofs.length) h += `<div class="dp-empty">Немає</div>`;
    h += `<div class="dp-sec">Рішення й наслідки${unreadAir(p) ? ` <span class="bd">${unreadAir(p)}</span>` : ""}</div>` + (dcs.length ? dcs.map(z => `<div class="dp-line dec ${z.read ? "" : "new"}"><span>${DEC_T[z.out] ? DEC_T[z.out][0] : "•"} ${BY[z.x].f} ${esc(nm(z.x))} · ${esc(DEC_T[z.out] ? DEC_T[z.out][1] : z.out)}${z.why && z.out !== "full" && z.out !== "cond" ? " — " + esc(z.why) : ""}</span><button class="dp-b ghost sm" data-dp="airdec" data-v="${z.id}">Деталі</button></div>`).join("") : `<div class="dp-empty">Рішень ще не було</div>`);
    h += `<div class="dp-sec">Кому можна написати</div>` + AIRST.filter(x => x !== p).map(x => { const e = evalAir(p, x, "corr"), gb = gateBlk(p, x, e); return `<div class="dp-line"><span>${BY[x].f} ${esc(nm(x))}</span><b class="${gb ? "bad" : "good"}" title="${esc(gb || "")}">${gb ? "недоступно" : "шанс ≈ " + pct(e.p)}</b><button class="dp-b ghost sm" data-dp="airform" data-v="${x}">Запит…</button></div>`; }).join("");
    h += `<div class="dp-sec">Моя історія</div><div class="dp-note">Схвалено: <b>${S.ok}</b> · умовно: <b>${S.cond}</b> · відмов: <b>${S.den}</b> · порушень: <b class="${S.viol ? "bad" : ""}">${S.viol}</b> · завершено штатно: <b>${S.exp}</b><br>Репутація: <b>${Math.round(D.rep[p])}</b></div>`;
    const tr = AIRST.map(x => [x, trustOf(p, x)]).filter(z => z[1]); if (tr.length) h += `<div class="dp-note">Довіра до виконання умов: ${tr.map(z => `${BY[z[0]].f} ${z[1] > 0 ? "+" : ""}${Math.round(z[1])}`).join(" · ")}</div>`;
    const hs = A.hist.filter(z => z.sd === p).slice(-5).reverse(); if (hs.length) h += hs.map(z => `<div class="dp-line"><span>${BY[z.st].f} ${esc(nm(z.st))} · ${z.op ? esc(OPS[z.op].s) + " · " : ""}${fmtT(z.t1)}</span><b class="${z.how === "violation" || z.how === "revoked" ? "bad" : "good"}">${({ expired: "завершено", limit: "ліміт", returned: "повернено", revoked: "відкликано", violation: "порушення" })[z.how] || z.how}</b></div>`).join("");
    h += `<div class="dp-sec">Контроль польотів</div><div class="dp-acts"><button class="dp-b ghost" data-dp="airenf">Штрафи за порушення кордону: ${A.enforce ? "увімкнено" : "вимкнено"}</button></div><div class="dp-note">Монітор стежить за вашими літаками над чужим небом: спершу попередження, а якщо літак лишається поза дозволом понад ${AIR.GRACE} с — порушення (відносини, репутація, довіра). Вимкнення лишає лише попередження.</div>`;
    h += `<div class="dp-note">Правила: запит можливий, коли <b>відносини ≥ ${AIR.RELMIN}</b>, <b>політична сумісність ≥ ${pct(AIR.COMPMIN)}</b> і <b>ризик ескалації ≤ ${pct(AIR.RISKMAX)}</b>. Дозвіл типу «${esc(OPS.msl.s)}» відкриває коридор для ваших ракет і дронів; дозволи авіаційних типів діють для літаків — їх перевіряє планувальник маршруту й монітор польотів. Відмови знижують відносини, порушення умов — відносини, репутацію й довіру.</div>`;
    return h;
  }
