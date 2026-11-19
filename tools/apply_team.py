# Етап 6 («BANGVECTOR 2 · етап 6»): повноцінний режим 2×2. Вшиває src/js/02j_team.js, мережевий шар (team_net.js),
# знімки з приховуванням даних ворога (team_snap.js), інтерфейс КП (team_ui.js) і точкові правки в
# src/js/03_game.js, src/index.html та dist/skydominion.html (ідемпотентно).   python3 tools/apply_team.py
# Кожен якір має зустрічатися рівно 1 раз, інакше — помилка й жоден файл не змінюється.
import re, os, sys
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
rd = lambda p: open(p, encoding='utf8').read()
wr = lambda p, s: open(p, 'w', encoding='utf8').write(s)

NET = rd('tools/team_net.js').rstrip() + '\n'
SNAP = rd('tools/team_snap.js').rstrip() + '\n'
UI = rd('tools/team_ui.js').rstrip() + '\n'
MARK = '/* team:v1 */'
REG_A = '/* ---------- кімнати ---------- */\n'
REG_B = '/* ---------- команди гостя'
NET_BEGIN, NET_END = '/* team:net:begin */\n', '/* team:net:end */\n'
UI_BEGIN, UI_END = '  /* team:ui:begin */\n', '  /* team:ui:end */\n'
SNAP_BEGIN, SNAP_END = '/* team:snap:begin */\n', '/* team:snap:end */\n'

P = []
def p(old, new): P.append((old, new))

# --- лобі: 4 місця у 2×2
p('players: R.players.length, specs: R.specs,', 'players: R.players.length, specs: R.hub.specs, team2: R.team2 ? 1 : 0,')
p('const full = r.players >= 2 || r.status === "game"', 'const full = r.players >= (r.team2 ? 4 : 2) || r.status === "game"')
p('<span class="tag">Публічна</span><span class="tag code">${escH(r.code)}</span>', '<span class="tag">Публічна</span>${r.team2 ? \'<span class="tag">2×2</span>\' : ""}<span class="tag code">${escH(r.code)}</span>')
p('гравців ${r.players}/2 ·', 'гравців ${r.players}/${r.team2 ? 4 : 2} ·')
# --- команди гостя: ролі й готовність
p('  if (k === "tel"){ telCmd(sd, p, deny); return; }      // етап 7.66: команди гостя щодо ПУ',
  '  if (isTeam() && !NET.room.hub.allow(E.eid, k)) return deny("Ваша роль не дозволяє цю дію — роль змінюється в панелі «Команда»");      // етап 6: ролі 2×2\n'
  '  if (k === "tel"){ telCmd(sd, p, deny); return; }      // етап 7.66: команди гостя щодо ПУ')
p('  if (k === "ready"){ if (GAME.phase === "prep"){ GAME.ready[sd] = true; checkReady(); } return; }',
  '  if (k === "ready"){ if (GAME.phase === "prep"){ if (isTeam()) teamMarkReady(E.prof.id); else { GAME.ready[sd] = true; checkReady(); } } return; }')
# --- знімки: кожному — лише його сторона
p('    nsend(E.c, m);\n  }\n  for (const sk in fullS)', '    nsend(E.c, teamSnapFor(E, m));      // етап 6: приховування даних ворога\n  }\n  for (const sk in fullS)')
p('const fogSnapKey = E =>', SNAP_BEGIN + '@@SNAP@@' + SNAP_END + 'const fogSnapKey = E =>')
# --- повідомлення сторони → журнал КП
p('function gameToast(msg){ toast(msg); S7.netEv && S7.netEv(["toast", msg]); }',
  'function gameToast(msg){ toast(msg); S7.netEv && S7.netEv(["toast", msg]); S7.team && (S7.team.sideEv("ua", msg), S7.team.sideEv("ru", msg)); }')
p('function sideToast(sd, msg){ if (GAME.ctrl[sd] === "me" && !GAME.spec) toast(msg); S7.netEv && S7.netEv(["stoast", sd, msg]); }',
  'function sideToast(sd, msg){ if (GAME.ctrl[sd] === "me" && !GAME.spec) toast(msg); S7.netEv && S7.netEv(["stoast", sd, msg]); S7.team && S7.team.sideEv(sd, msg); }')
# --- права за ролями
p('    if (HOOKS.canControl && !HOOKS.canControl(siteSide(s))){ const m = HOOKS.denyMsg ?',
  '    if (HOOKS.canControl && !HOOKS.canControl(siteSide(s), "launch")){ const m = HOOKS.denyMsg ?')
p('  const allowSide = side => !HOOKS.canControl || HOOKS.canControl(side);',
  '  const allowSide = (side, kind) => !HOOKS.canControl || HOOKS.canControl(side, kind || "ad");')
p('if (u.sea){ if (!allowSide("ua")) return false;', 'if (u.sea){ if (!allowSide("ua", "launch")) return false;')
p('&& !u.fall){ if (!allowSide(u.sd)) return false; selSet("fpv", u.id); return true; }', '&& !u.fall){ if (!allowSide(u.sd, "launch")) return false; selSet("fpv", u.id); return true; }')
p('    if (!allowSide(siteSide(s))) return denySide(siteSide(s));\n    HOOKS.closeAd && HOOKS.closeAd();',
  '    if (!allowSide(siteSide(s), "launch")) return denySide(siteSide(s));\n    HOOKS.closeAd && HOOKS.closeAd();') if False else None
p('  HOOKS.canControl = side => !GAME.on || GAME.ctrl[side] === "me";',
  '  HOOKS.canControl = (side, kind) => !GAME.on || (GAME.ctrl[side] === "me" && (!kind || teamOk(kind)));      // етап 6: роль у 2×2')
p('  HOOKS.denyMsg = side => GAME.spec ?', '  HOOKS.denyMsg = (side, kind) => (GAME.ctrl[side] === "me" && !GAME.spec) ? (isTeam() ? "Ваша роль не дозволяє цю дію — роль змінюється в панелі «Команда»" : "Немає доступу") : GAME.spec ?')
p('    if (!GAME.on || !GAME.puppet) return false;\n    if (GAME.spec){ toast("Режим глядача',
  '    if (GAME.on && isTeam() && !GAME.spec && !teamOk(kind)){ teamDeny(kind); return true; }      // етап 6: роль гравця не дозволяє цю дію\n    if (!GAME.on || !GAME.puppet) return false;\n    if (GAME.spec){ toast("Режим глядача')
p('const facMine = f => GAME.on && !GAME.spec && GAME.ctrl[f.side] === "me";', 'const facMine = f => GAME.on && !GAME.spec && GAME.ctrl[f.side] === "me" && teamOk("eco");')
p('const lgMine = v => GAME.on && !GAME.spec && GAME.ctrl[v.side] === "me";', 'const lgMine = v => GAME.on && !GAME.spec && GAME.ctrl[v.side] === "me" && teamOk("eco");')
p('function telDo(side, op, p){\n', 'function telDo(side, op, p){\n  if (!teamOk("tel")){ teamDeny("tel"); return { ok: false }; }      // етап 6\n')
p('function infCmd(sd, op, v){\n', 'function infCmd(sd, op, v){\n  if (!teamOk("fuel")) return "Недоступно для вашої ролі";      // етап 6\n')
p('const E = ecoE(v); if (!E || GAME.ctrl[v] !== "me" || GAME.spec) return;', 'const E = ecoE(v); if (!E || GAME.ctrl[v] !== "me" || GAME.spec || !teamOk("eco")) return;')
# --- капітуляція / вихід
p('    if (GAME.ctx === "online" && GAME.puppet){\n      roomFoeSend({ t: "surr" });',
  '    if (GAME.ctx === "online" && GAME.puppet){\n      if (isTeam() && !isLeadMe()) return toast("Здатися може лише командир команди");      // етап 6\n      roomFoeSend({ t: "surr" });')
p('  function doSurrender(toMenu){', '  const isLeadMe = () => { const R = NET.room, l = R && R.host ? R.roster.lead(R.side) : null; if (R && R.host) return !!l && l.id === PROF.id; const me = myPlayer(R), pl = (R && R.info && R.info.players) || []; const f = pl.filter(x => x.side === (me && me.side) && !x.away)[0]; return !!me && !!f && f.id === me.id; };\n  function doSurrender(toMenu){')
p('        if ((GAME.ctx === "single" || (GAME.ctx === "online" && !GAME.spec)) && GAME.on && !GAME.over)      // етап 7.40: вихід із бою — капітуляція',
  '        if (GAME.ctx === "online" && isTeam() && !GAME.spec && GAME.on && !GAME.over)      // етап 6: у 2×2 вихід — не капітуляція команди\n'
  '          return confirmBox("Покинути бій? Ваш товариш по команді продовжить без вас, а керування вашою роллю перейде до нього. Повернутися можна з тим самим кодом кімнати.", "Вийти", () => { modalClose(); roomLeave(true); endToMenu("online"); });\n'
  '        if ((GAME.ctx === "single" || (GAME.ctx === "online" && !GAME.spec)) && GAME.on && !GAME.over)      // етап 7.40: вихід із бою — капітуляція')
# --- HUD
p('''        const sd = mySides()[0], mine = sd && GAME.ready[sd], foe = sd && GAME.ready[other(sd)];
        b.push(`<button class="chip ${mine ? "go" : "hot"}" data-s7="gmready" ${mine ? "disabled" : ""}>${mine ? "Готовий ✓" : "Готовий"}</button>`);
        b.push(`<span class="chip" style="cursor:default">${foe ? "суперник готовий" : "суперник готується"}</span>`);''',
  '''        const sd = mySides()[0], mp = isTeam() ? myPlayer(NET.room) : null, mine = mp ? !!mp.ready : sd && GAME.ready[sd], foe = sd && GAME.ready[other(sd)];
        b.push(`<button class="chip ${mine ? "go" : "hot"}" data-s7="gmready" ${mine ? "disabled" : ""}>${mine ? "Готовий ✓" : "Готовий"}</button>`);
        if (isTeam() && NET.room){ const pl = (NET.room.host ? NET.room.roster.info() : (NET.room.info && NET.room.info.players) || []).filter(x => x.side === sd); b.push(`<span class="chip" style="cursor:default">команда: ${pl.filter(x => x.ready).length}/${pl.length} готові${foe ? " · супротивник готовий" : ""}</span>`); }
        else b.push(`<span class="chip" style="cursor:default">${foe ? "суперник готовий" : "суперник готується"}</span>`);''')
p('    if (freeOk()) b.push(`<button class="chip ${$("gmFree")',
  '    if (isTeam() && !GAME.spec){      // етап 6: командний пункт і позначки\n'
  '      const tu = S7.team ? S7.team.unread() : 0;\n'
  '      b.push(`<button class="chip ${S7.team && S7.team.isOpen() ? "on" : ""}" data-s7="cpopen" title="Командний пункт: ППО, цілі, події, команда">КП${tu ? `<span class="bd">${tu}</span>` : ""}</button>`);\n'
  '      b.push(`<button class="chip ${S7.team && S7.team.pinging() ? "on" : ""}" data-s7="gmping" title="Позначка на карті для команди (або Alt+клік)">📍${narrow() ? "" : " Позначка"}</button>`);\n'
  '    }\n'
  '    if (freeOk()) b.push(`<button class="chip ${$("gmFree")')
p('      S7.phone ? (S7.phone.isOpen() ? 1 : 0) + ":" + S7.phone.unread() : ""].join("|");',
  '      S7.phone ? (S7.phone.isOpen() ? 1 : 0) + ":" + S7.phone.unread() : "", S7.team ? S7.team.sig() : ""].join("|");')
p('''        { const sd = mySides()[0]; if (!sd) return; if (GAME.puppet){ GAME.ready[sd] = true; HOOKS.route("ready", {}); } else { GAME.ready[sd] = true; checkReady(); } }''',
  '''        { const sd = mySides()[0]; if (!sd) return;
          if (isTeam()){ if (GAME.puppet) HOOKS.route("ready", {}); else teamMarkReady(PROF.id); }
          else if (GAME.puppet){ GAME.ready[sd] = true; HOOKS.route("ready", {}); } else { GAME.ready[sd] = true; checkReady(); } }''')
# --- чат
p('''  function chatHTML(list){
    return (list || []).map(m => `<div class="cm"><b class="${m.side === "ru" ? "ru" : "ua"}">${escU(m.name)}${tickH(m.id, 13)}</b>${escU(m.text)}<i>${new Date(m.ts || Date.now()).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}</i></div>`).join("") ||''',
  '''  const tmHM = ts => new Date(ts || Date.now()).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
  function chatHTML(list){      // етап 6: канали «усі / команда» і системні повідомлення
    return (list || []).map(m => m.ch === "sys" ? `<div class="cm sysm">${escU(m.text)}<i>${tmHM(m.ts)}</i></div>` :
      `<div class="cm"><b class="${m.side === "ru" ? "ru" : "ua"}">${escU(m.name)}${tickH(m.id, 13)}</b>${m.ch === "team" ? `<span class="ch">КОМАНДА</span>` : ""}${escU(m.text)}<i>${tmHM(m.ts)}</i></div>`).join("") ||''')
p('''  const chatBox = (p, ro) => `<div class="chatbox"><div class="chatlog"''',
  '''  const roomTeam2 = R => !!(R && (R.host ? R.team2 : R.info && R.info.team2));
  function chatTools(){
    if (!roomTeam2(NET.room) || (NET.room.role === "spec" && !NET.room.host)) return "";
    return `<div class="chch">` + [["team", "Команда"], ["all", "Усі"]].map(([v, n]) => `<button class="${UI.chCh === v ? "on" : ""}" data-s7="chch" data-v="${v}">${n}</button>`).join("") + `</div>` +
      `<div class="cpq">` + TM().QUICK.map((q, i) => `<button data-s7="tq" data-v="${i}">${escH(q.t)}</button>`).join("") + `</div>`;
  }
  function gcDecor(){ const bx = $("gmChat").querySelector(".chatbox"); if (!bx) return; let d = bx.querySelector(".chdec"); const t = chatTools(); if (!t){ d && d.remove(); return; } if (!d){ d = document.createElement("div"); d.className = "chdec"; bx.insertBefore(d, bx.firstChild); } d.innerHTML = t; }
  const chatBox = (p, ro) => `<div class="chatbox">${p === "gc" ? "" : chatTools()}<div class="chatlog"''')
p('      [$("rcLog"), $("gcLog")].forEach(el =>', '      [$("rcLog"), $("gcLog"), $("cpLog")].forEach(el =>')
p('m.id !== PROF.id){ UI.unread++; toast(`${m.name}: ${m.text}`);', 'm.id !== PROF.id && m.ch !== "sys"){ UI.unread++; toast(`${m.name}: ${m.text}`);')
p('if (t.id === "rcIn" || t.id === "gcIn") return act("chatsend", t.id);', 'if (t.id === "rcIn" || t.id === "gcIn" || t.id === "cpIn") return act("chatsend", t.id);')
p('chatSend(i.value); i.value = ""; } return; }', 'chatSend(i.value, UI.chCh); i.value = ""; } return; }')
p('tn: { name: "", mode: "duel", size: 4 }, unread: 0 };', 'tn: { name: "", mode: "duel", size: 4 }, unread: 0, chCh: "team" };')
p('''      case "gmchat": $("gmChat").classList.toggle("on"); UI.unread = 0;''', '''      case "gmchat": gcDecor(); $("gmChat").classList.toggle("on"); UI.unread = 0;''')
# --- екран кімнати
p('    h += `<div class="mm-sec"><span>Сторони</span><b>глядачів: ${info.specs | 0}</b></div>`;\n    for (const sd of ["ua", "ru"]){',
  '    if (info.team2) h += teamSlots(info, R); else h += `<div class="mm-sec"><span>Сторони</span><b>глядачів: ${info.specs | 0}</b></div>`;\n    for (const sd of info.team2 ? [] : ["ua", "ru"]){')
p('${info.players.length < 2 || info.status === "game" ? "disabled" : ""}>Розпочати бій</button>`;',
  '${!roomCanStart(info) || info.status === "game" ? "disabled" : ""}>Розпочати бій</button>`;\n      if (info.team2 && !roomCanStart(info)) h += `<div class="mm-note">Для старту потрібен хоча б один гравець у кожній команді (до двох у кожній). Неповну команду можна поповнити пізніше — до початку бою.</div>`;')
p('  function scrRoom(){\n    const R = NET.room;', '''  const roomCanStart = info => info.team2 ? ["ua", "ru"].every(sd => info.players.some(q => q.side === sd)) : info.players.length >= 2;
  function teamSlots(info, R){      // етап 6: склад команд 2×2, ролі й переведення (ворожі ролі не показуємо)
    const T = TM(), meP = info.players.find(q => q.id === PROF.id), amHost = !!R.host;
    let h = `<div class="mm-sec"><span>Команди 2×2</span><b>глядачів: ${info.specs | 0}</b></div>`;
    for (const sd of ["ua", "ru"]){
      const mates = info.players.filter(q => q.side === sd);
      h += `<div class="mm-note" style="margin:8px 0 4px"><span class="tag ${sd}">${SIDE_N[sd]}</span> ${mates.length}/2</div>`;
      for (let i = 0; i < 2; i++){
        const q = mates[i];
        if (!q){ h += `<div class="slot"><div class="pi"><b style="color:#8a9097">Вільне місце</b><small>Очікуємо гравця…</small></div></div>`; continue; }
        const mine = meP && meP.side === sd, can = amHost || q.id === PROF.id;
        const rb = mine && can && info.status !== "game" ? ["cmd", "pvo", "both"].map(r => `<button class="s7b sm ${q.role === r ? "blue" : "ghost"}" data-s7="trole" data-v="${escH(q.id)}:${r}" title="${escH(T.ROLES[r].n)}">${escH(T.ROLES[r].s)}</button>`).join("") : "";
        const mv = amHost && info.status !== "game" ? `<button class="s7b sm ghost" data-s7="tmove" data-v="${escH(q.id)}:${other(sd)}" title="Перевести до іншої команди">⇄</button>` : "";
        const rl = mine && T.ROLES[q.er] ? ` · ${T.ROLES[q.er].n}` : "";
        h += `<div class="slot ${sd}">${rkSvgOf(q.rp, 34)}${lvB(q.xp, 28)}<div class="pi"><b>${escU(q.name)}${tickH(q.id)}${q.id === PROF.id ? " (ви)" : ""}</b><small>${SIDE_N[sd]} · ID ${escH(q.id)}${q.host ? " · власник" : ""}${rl}${q.away ? " · немає зв'язку" : ""}</small></div>${rb}${mv}` +
          (q.id !== PROF.id && !isFriend(q.id) ? `<button class="s7b sm ghost" data-s7="rfadd" data-v="${escH(q.id)}">+ У друзі</button>` : "") + `</div>`;
      }
    }
    return h + `<div class="mm-note">Ролі: «КМД» — пуски, ПУ, виробництво, логістика; «ППО» — зенітні засоби й тривоги; «КМД+ППО» — усе. Якщо в команді один гравець — він керує всім. Ворог бачить лише склад, не ролі.</div>`;
  }
  function scrRoom(){
    const R = NET.room;''')
p('''      sideOpt(c.mode, c.side, "rcside") +''', '''      `<div class="opt"><div class="lbl">Формат</div><div class="chips7">${chip("rcteam", "0", c.team2 ? "1" : "0", "1×1")}${chip("rcteam", "1", c.team2 ? "1" : "0", "2×2 — команди, ролі, КП")}</div></div>` +
      sideOpt(c.mode, c.side, "rcside") +''')
p('{ mode: "ready", pub: true, side: "ua", tempo: 1 }', '{ mode: "ready", pub: true, side: "ua", tempo: 1, team2: false }')
p('      case "rcside": UI.rc.side = v; return mdlRoomNew();', '      case "rcside": UI.rc.side = v; return mdlRoomNew();\n      case "rcteam": UI.rc.team2 = v === "1"; return mdlRoomNew();')
p('roomCreate({ mode: c.mode, pub: c.pub, side: c.side, tempo: c.tempo, inviteAfter: c.inviteAfter })', 'roomCreate({ mode: c.mode, pub: c.pub, side: c.side, tempo: c.tempo, inviteAfter: c.inviteAfter, team2: c.team2 })')
p('      case "rstart": if (!roomStart()) toast("Потрібно два гравці"); return;', '''      case "cpopen": S7.team && S7.team.open(); gbSig = ""; return gmTick();
      case "cpx": S7.team && S7.team.open(false); gbSig = ""; return gmTick();
      case "cptab": S7.team && S7.team.setTab(v); return;
      case "cpfly": S7.team && S7.team.fly(v); return;
      case "cpall": S7.team && S7.team.all(v); return;
      case "tpk": S7.team && S7.team.setKind(v); return;
      case "tping": case "gmping": S7.team && S7.team.pingMode(); gbSig = ""; return gmTick();
      case "trole": { const i = v.lastIndexOf(":"); teamSend({ t: "role", id: v.slice(0, i), role: v.slice(i + 1) }); return; }
      case "tmove": { const i = v.lastIndexOf(":"); teamSend({ t: "move", id: v.slice(0, i), side: v.slice(i + 1) }); return; }
      case "tq": { const q = TM().QUICK[+v]; if (q) chatSend(q.t, "team"); return; }
      case "chch": UI.chCh = v === "all" ? "all" : "team"; document.querySelectorAll('[data-s7="chch"]').forEach(x => x.classList.toggle("on", x.dataset.v === UI.chCh)); return;
      case "rstart": roomStart(); return;''')
p('    lobbyJoin(); setTimeout(deliverOut, 1500);', '    lobbyJoin(); setTimeout(deliverOut, 1500); setTimeout(() => sessResume(), 600);      // етап 6: відновлення сесії кімнати')
p('  S7.ui = {\n    scr: () =>', UI_BEGIN + '@@UI@@' + UI_END + '  S7.ui = {\n    scr: () =>')

def patch(text, label, is_dist=False):
    if MARK in text:
        # оновлення вшитих блоків
        for b, e, body in ((NET_BEGIN, NET_END, NET), (SNAP_BEGIN, SNAP_END, SNAP), (UI_BEGIN, UI_END, UI)):
            a = text.index(b) + len(b); z = text.index(e, a)
            text = text[:a] + body + text[z:]
        print(label, 'блоки оновлено'); return text
    miss = []
    a = text.find(REG_A); z = text.find(REG_B)
    if text.count(REG_A) != 1 or text.count(REG_B) != 1 or z < a: miss.append(('region', text.count(REG_A), text.count(REG_B)))
    if miss: print(label, 'MISS', miss); sys.exit(1)
    text = text[:a] + NET_BEGIN + NET + NET_END + text[z:]
    for i, (o, n) in enumerate(P):
        c = text.count(o)
        if c != 1: miss.append((i, c, o[:90].replace('\n', '⏎')))
    if miss: print(label, 'MISS', miss); sys.exit(1)
    for o, n in P:
        n = n.replace('@@SNAP@@', SNAP).replace('@@UI@@', UI)
        text = text.replace(o, n)
    text = MARK + '\n' + text if False else text.replace(NET_BEGIN, MARK + '\n' + NET_BEGIN, 1)
    print(label, 'ok'); return text

def patch_module(d, label):
    src = rd('src/js/02j_team.js')
    if 'id="bvTeam"' in d:
        a = re.search(r'<script id="bvTeam">', d); b = d.index('</script>', a.end())
        return d[:a.end()] + src + d[b:]
    m = re.search(r'<script id="bvAvia">.*?</script>', d, re.S)
    if not m: print(label, 'MISS bvAvia'); sys.exit(1)
    return d[:m.end()] + '\n<script id="bvTeam">' + src + '</script>' + d[m.end():]

pat = re.compile(r'(<script[^>]*>)(.*?)(</script>)', re.S)
g = rd('src/js/03_game.js'); g2 = patch(g, 'src/js/03_game.js')
dist = 'dist/skydominion.html'; d = rd(dist)
ms = list(pat.finditer(d)); main = max(ms, key=lambda m: len(m.group(2)))
dm2 = patch(main.group(2), 'dist main', True)
d2 = d[:main.start(2)] + dm2 + d[main.end(2):]
d2 = patch_module(d2, 'dist')
h = rd('src/index.html'); h2 = h
if '02j_team.js' not in h2 and '02i_avia.js' in h2:
    h2 = h2.replace('<script>@@F:js/02i_avia.js@@</script>\n', '<script>@@F:js/02i_avia.js@@</script>\n<script>@@F:js/02j_team.js@@</script>\n')
for f, a, b in [('src/js/03_game.js', g, g2), (dist, d, d2), ('src/index.html', h, h2)]:
    if a != b: wr(f, b); print('записано', f)
print('done')
