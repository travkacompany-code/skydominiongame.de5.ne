// Тест модуля BV_TEAM (режим 2×2): склад, ролі, права, чат-канали, позначки, реконнект, журнал КП, дані КП.
//   node tools/test_team.js
const T = require('../src/js/02j_team.js');
let ok = 0, bad = 0;
const t = (n, c, x) => { if (c) ok++; else { bad++; console.log('✗', n, x === undefined ? '' : JSON.stringify(x)); } };
const prof = (id, name) => ({ id, name: name || id, xp: 100, rp: 0 });

/* ---------- склад й ролі ---------- */
{
  const R = new T.Roster({ team2: true, hostSide: 'ua' });
  const h = R.join(prof('HOST0001', 'Хост'), { host: true, side: 'ua' });
  t('хост у команді ua, роль cmd', h.ok && h.p.side === 'ua' && h.p.role === 'cmd');
  t('один у команді — ефективна роль both', R.effRole(h.p) === 'both');
  const b = R.join(prof('BBBB0002'));
  t('другий гравець іде в порожню команду ru', b.p.side === 'ru', b.p);
  const c = R.join(prof('CCCC0003'));
  t('третій — у ru (баланс, напарник B), роль pvo', c.p.side === 'ru' && c.p.role === 'pvo', c.p);
  const d = R.join(prof('DDDD0004'));
  t('четвертий — у ua, роль pvo', d.p.side === 'ua' && d.p.role === 'pvo', d.p);
  t('п\'ятий — відмова', !R.join(prof('EEEE0005')).ok);
  t('дубль власника — відмова', !R.join(prof('HOST0001')).ok);
  // права
  t('cmd: пуск так, ППО ні', R.can('HOST0001', 'launch') && !R.can('HOST0001', 'ad'));
  t('pvo: ППО так, пуск і виробництво ні', R.can('DDDD0004', 'ad') && !R.can('DDDD0004', 'launch') && !R.can('DDDD0004', 'eco') && !R.can('DDDD0004', 'fuel'));
  t('готовність — для всіх', R.can('DDDD0004', 'ready'));
  // зміна ролей
  let r = R.setRole('DDDD0004', 'HOST0001', 'both');
  t('рядовий не змінює чужу роль', !r.ok);
  r = R.setRole('HOST0001', 'DDDD0004', 'both');
  t('командир команди змінює роль', r.ok && R.get('DDDD0004').role === 'both');
  t('both: доступні обидві групи прав', R.can('DDDD0004', 'launch') && R.can('DDDD0004', 'ad'));
  r = R.setRole('DDDD0004', 'DDDD0004', 'cmd');
  t('власна зміна cmd → напарник стає pvo', r.ok && R.get('HOST0001').role === 'pvo' && R.get('DDDD0004').role === 'cmd', R.info());
  t('власник кімнати міняє будь-кого', R.setRole('HOST0001', 'BBBB0002', 'pvo').ok && R.get('BBBB0002').role === 'pvo' && R.get('CCCC0003').role === 'cmd');
  t('невідома роль — відмова', !R.setRole('HOST0001', 'BBBB0002', 'xxx').ok);
  // відключення
  R.setAway('DDDD0004', 100);
  t('напарник відключився — решта керує всім', R.effRole(R.get('HOST0001')) === 'both' && R.can('HOST0001', 'launch') && R.can('HOST0001', 'ad'));
  t('місце за відсутнім зберігається', R.free('ua') === 0 && !R.join(prof('FFFF0006')).ok);
  t('до завершення пільгового часу не видаляє', R.expire(150).length === 0);
  const rj = R.join(prof('DDDD0004', 'Новий нік'));
  t('повернення: той самий слот, rejoin=true', rj.ok && rj.rejoin && !rj.p.away && rj.p.role === 'cmd' && rj.p.name === 'Новий нік');
  R.setAway('DDDD0004', 200);
  const ex = R.expire(200 + T.CFG.grace);
  t('після пільгового часу гравець видаляється', ex.length === 1 && ex[0].id === 'DDDD0004' && !R.get('DDDD0004') && R.free('ua') === 1);
  t('хост не може бути away', R.setAway('HOST0001', 1) === null);
  // готовність
  R.resetReady();
  R.setReady('HOST0001'); t('сторона не готова, поки не готові всі', R.sideReady('ua') && !R.allReady());
  R.setReady('BBBB0002'); t('ru ще не готова', !R.sideReady('ru'));
  R.setReady('CCCC0003'); t('усі готові', R.allReady());
  // переведення
  const R2 = new T.Roster({ team2: true });
  R2.join(prof('H1', 'h'), { host: true, side: 'ua' }); R2.join(prof('P2')); R2.join(prof('P3')); R2.join(prof('P4'));
  t('move: лише власник', !R2.move('P2', 'P3', 'ua').ok);
  t('move: немає місць', !R2.move('H1', 'P2', 'ua').ok || R2.get('P2').side === 'ua');
  const R3 = new T.Roster({ team2: true }); R3.join(prof('H1', 'h'), { host: true, side: 'ua' }); R3.join(prof('P2'));
  t('move: гравця можна перевести', R3.move('H1', 'P2', 'ua').ok && R3.get('P2').side === 'ua' && R3.get('P2').role === 'pvo');
  t('canStart: порожня команда — ні', !R3.canStart().ok);
  R3.move('H1', 'P2', 'ru'); t('canStart: по гравцю — так, неповна', R3.canStart().ok && !R3.canStart().full);
  // 1×1 — все як раніше
  const R1 = new T.Roster({ team2: false }); R1.join(prof('H1', 'h'), { host: true, side: 'ru' });
  const g = R1.join(prof('G2'));
  t('1×1: другий у протилежну сторону, роль both', g.p.side === 'ua' && R1.effRole(g.p) === 'both' && R1.can('G2', 'launch') && R1.can('G2', 'ad'));
  t('1×1: третій — відмова', !R1.join(prof('G3')).ok);
  t('1×1: ролі не змінюються', !R1.setRole('H1', 'G2', 'pvo').ok);
}

/* ---------- чат: канали й видимість ---------- */
{
  const R = new T.Roster({ team2: true });
  R.join(prof('A'), { host: true, side: 'ua' }); R.join(prof('B')); R.join(prof('C')); R.join(prof('D'));
  const sd = id => R.get(id).side;
  const m = T.makeMsg(R, 'A', '  привіт\n  команда ', 'team', 1);
  t('текст нормалізується, канал team', m.text === 'привіт команда' && m.ch === 'team' && m.side === sd('A'));
  t('team бачать лише свої', T.chatVisible(m, { side: sd('A') }) && !T.chatVisible(m, { side: T.other(sd('A')) }));
  t('глядач не бачить team', !T.chatVisible(m, { spec: true }));
  const a = T.makeMsg(R, 'A', 'всім', 'all', 1);
  t('all бачать усі, зокрема глядачі', T.chatVisible(a, { side: 'ru' }) && T.chatVisible(a, { spec: true }));
  t('порожнє повідомлення — null', T.makeMsg(R, 'A', '   ', 'all') === null);
  t('невідомий автор — null', T.makeMsg(R, 'ZZ', 'x', 'all') === null);
  t('довге повідомлення обрізається', T.makeMsg(R, 'A', 'x'.repeat(500), 'all').text.length === 200);
  const R1 = new T.Roster({ team2: false }); R1.join(prof('A'), { host: true, side: 'ua' });
  t('1×1: team неможливий → all', T.makeMsg(R1, 'A', 'x', 'team').ch === 'all');
  const s = T.sysMsg('x', 'ua'); t('sys: лише своя сторона й глядачі', T.chatVisible(s, { side: 'ua' }) && !T.chatVisible(s, { side: 'ru' }) && T.chatVisible(s, { spec: true }));
}

/* ---------- позначки ---------- */
{
  const P = new T.PingBook();
  t('позначка створюється', !!P.add('ua', 'A', 'Ан', [30, 50], 'atk', 0));
  t('частота обмежена', P.add('ua', 'A', 'Ан', [31, 50], 'atk', 0.3) === null);
  t('координати перевіряються', P.add('ua', 'B', 'Б', [999, 50], 'atk', 5) === null && P.add('ua', 'B', 'Б', ['x'], 'atk', 5) === null && P.add('xx', 'B', 'Б', [1, 1], 'atk', 5) === null);
  t('невідомий тип → warn', P.add('ua', 'C', 'В', [30, 50], 'zzz', 5).k === 'warn');
  t('ворожа сторона не бачить', P.active('ru', 5).length === 0 && P.active('ua', 5).length === 2);
  t('закінчується за ttl', P.active('ua', 5 + T.CFG.pingTtl + 1).length === 0);
  for (let i = 0; i < 12; i++) P.add('ru', 'P' + i, 'x', [1, 1], 'warn', 100 + i * 2);
  t('не більше pingMax на сторону', P.active('ru', 125).length === T.CFG.pingMax);
}

/* ---------- журнал КП ---------- */
{
  const L = new T.CpLog(5);
  const e1 = L.add('ua', 'det', 'Виявлено: Шахед', { t: 1, ll: [30, 50] });
  t('запис додано', e1 && e1.id === 1 && e1.ll[0] === 30);
  t('дубль у межах 2 с згортається', L.add('ua', 'det', 'Виявлено: Шахед', { t: 2 }) === null && L.last('ua')[0].c === 2);
  for (let i = 0; i < 9; i++) L.add('ua', 'info', 'e' + i, { t: 10 + i });
  t('ліміт довжини', L.last('ua', 99).length === 5);
  L.add('ru', 'info', 'лише рф', { t: 1 });
  t('сторони розділені', L.last('ru').length === 1 && L.last('ru')[0].x === 'лише рф' && !L.last('ua').some(e => e.x === 'лише рф'));
  t('некоректна сторона — null', L.add('zz', 'info', 'x') === null);
  t('некоректні координати відкидаються', L.add('ua', 'info', 'nan', { t: 99, ll: [NaN, 1] }).ll === null);
}

/* ---------- диспетчер: сесія з чотирьох гравців, глядача, відключень ---------- */
{
  let clock = 0, game = false; const inbox = {}, closed = [], hk = [];
  const rost = new T.Roster({ team2: true });
  const hub = new T.Hub({ roster: rost, send: (e, m) => (inbox[e] = inbox[e] || []).push(m), closeEp: e => closed.push(e), now: () => clock, ts: () => clock * 1000,
    info: () => ({ code: 'ABC123', mode: 'duel', pub: true, tempo: 1, status: game ? 'game' : 'wait', side: 'ua', tour: null }), local: m => (inbox.H = inbox.H || []).push(m),
    inGame: () => game, pub: true, hooks: { away: p => hk.push('away:' + p.id), back: p => hk.push('back:' + p.id), gone: p => hk.push('gone:' + p.id), joined: p => hk.push('join:' + p.id), left: p => hk.push('left:' + p.id) } });
  hub.setHost(prof('HOST', 'Хост'), 'ua');
  const got = (e, tp) => (inbox[e] || []).filter(m => m.t === tp);
  const clear = () => { for (const k in inbox) inbox[k] = []; };
  t('хост — гравець ua', hub.H && hub.H.side === 'ua' && hub.H.host);
  t('hello: другий гравець у ru', hub.hello('c1', { role: 'player', side: 'ru', prof: prof('P2', 'Два') }).ok && rost.get('P2').side === 'ru');
  hub.hello('c2', { role: 'player', side: 'ua', prof: prof('P3', 'Три') }); hub.hello('c3', { role: 'player', side: 'ru', prof: prof('P4', 'Чотири') });
  t('четверо гравців у двох командах', rost.on('ua').length === 2 && rost.on('ru').length === 2, rost.info());
  const wl = got('c1', 'welcome')[0];
  t('welcome містить сторону, інформацію про кімнату й ролі', wl.side === 'ru' && wl.r.players.length >= 2 && wl.r.team2 === true && wl.r.code === 'ABC123');
  const rl = got('c1', 'welcome')[0].r.players;
  t('ролі противника приховано у room/welcome, свої — видно', rl.filter(p => p.side !== 'ru').every(p => p.role === '' && p.er === '') && rl.filter(p => p.side === 'ru').every(p => p.role !== ''), rl);
  t('глядач бачить усі ролі', (hub.hello('s0', { role: 'spec', prof: prof('S0') }), got('s0', 'welcome')[0].r.players.every(p => p.role !== '')));
  hub.drop('s0');
  t('п\'ятий гравець — відмова з reject', !hub.hello('c9', { role: 'player', prof: prof('P9') }).ok && got('c9', 'reject').length === 1);
  t('глядач у публічній кімнаті', hub.hello('s1', { role: 'spec', prof: prof('S1', 'Глядач') }).ok && hub.specs === 1);
  // чат
  clear();
  hub.msg('c1', { t: 'chat', text: 'тільки своїм', ch: 'team' });
  const to = e => got(e, 'chat').map(x => x.m.text);
  t('team-чат: напарник (c3, ru) отримав', to('c3').includes('тільки своїм'));
  t('team-чат: автор отримав', to('c1').includes('тільки своїм'));
  t('team-чат: супротивники НЕ отримали', !to('H').includes('тільки своїм') && !to('c2').includes('тільки своїм'));
  t('team-чат: глядач НЕ отримав', !to('s1').includes('тільки своїм'));
  hub.msg('c1', { t: 'chat', text: 'усім', ch: 'all' });
  t('all-чат: отримали всі, зокрема глядач і хост', ['H', 'c1', 'c2', 'c3', 's1'].every(e => to(e).includes('усім')));
  hub.msg('s1', { t: 'chat', text: 'від глядача', ch: 'all' });
  t('глядач не пише в чат', !to('c1').includes('від глядача'));
  t('історія для нового глядача не містить team', !hub.historyFor(hub.ep('s1')).some(m => m.ch === 'team'));
  t('історія для гравця ru містить team ru', hub.historyFor(hub.ep('c1')).some(m => m.text === 'тільки своїм'));
  // ролі через повідомлення
  clear();
  hub.msg('c2', { t: 'role', id: 'P3', role: 'both' }); // c2 = P3 (ua) сам собі
  t('роль змінено, розіслано room', rost.get('P3').role === 'both' && got('c1', 'room').length > 0);
  hub.msg('c2', { t: 'role', id: 'P2', role: 'pvo' });
  t('чужа роль: тост відмови', got('c2', 'toast').length === 1 && rost.get('P2').role !== undefined);
  // права на команди
  t('allow: власник (cmd) — пуск так, ППО — так (лише 2 в команді → не both)', hub.allow('H', 'launch') !== undefined);
  hub.msg('c2', { t: 'role', id: 'P3', role: 'pvo' });
  t('allow: P3 pvo → пуск ні, ППО так', !hub.allow('c2', 'launch') && hub.allow('c2', 'ad') && hub.sideOf('c2') === 'ua');
  // позначки
  game = true; rost.locked = true; clear();
  hub.msg('c1', { t: 'ping', pos: [30.5, 50.4], k: 'atk' });
  t('позначка: своя команда (c3) отримала', got('c3', 'ping').length === 1 && got('c3', 'ping')[0].p.pos[0] === 30.5);
  t('позначка: супротивник і глядач — ні', got('H', 'ping').length === 0 && got('c2', 'ping').length === 0 && got('s1', 'ping').length === 0);
  // журнал
  hub.log('ua', 'det', 'Виявлено: Шахед', { t: 5, ll: [30, 50] });
  t('журнал КП ua: ua-гравці й глядач, не ru', got('H', 'tlog').length === 1 && got('c2', 'tlog').length === 1 && got('s1', 'tlog').length === 1 && got('c1', 'tlog').length === 0 && got('c3', 'tlog').length === 0);
  // відключення й повернення
  clear(); hk.length = 0;
  const d = hub.drop('c1');
  t('drop у бою: away, не видалення', d.away && rost.get('P2').away && hk.includes('away:P2'));
  t('напарник (c3) і хост отримали оновлену кімнату', got('c3', 'room').length > 0 && got('H', 'room').length > 0);
  t('напарник став керувати всім (both)', rost.effRole(rost.get('P4')) === 'both' && hub.allow('c3', 'launch') && hub.allow('c3', 'ad'));
  t('sys-повідомлення — лише своїй стороні', got('c3', 'chat').some(x => /втратив зв'язок/.test(x.m.text)) && !got('c2', 'chat').some(x => /втратив зв'язок/.test(x.m.text)));
  clock = 20;
  const old = hub.hello('c1b', { role: 'player', prof: prof('P2', 'Два') });
  t('повернення з нового з\'єднання в той самий слот', old.ok && old.rejoin && !rost.get('P2').away && hk.includes('back:P2'));
  const wl2 = got('c1b', 'welcome')[0];
  t('welcome при поверненні: rejoin, історія, журнал, позначки', wl2.rejoin === true && wl2.chat.length > 0 && Array.isArray(wl2.log) && Array.isArray(wl2.pg) && wl2.pg.length === 1);
  t('журнал/позначки при поверненні — лише своєї сторони', wl2.log.every(e => e.side === 'ru') && wl2.pg.every(p => p.side === 'ru'));
  t('чужак не потрапляє в бій', !hub.hello('cX', { role: 'player', prof: prof('NEWBIE') }).ok && got('cX', 'reject')[0].msg.includes('Бій уже триває'));
  // заміна «зависшого» з'єднання
  const before = hub.eps.size;
  hub.hello('c1c', { role: 'player', prof: prof('P2', 'Два') });
  t('нове з\'єднання витісняє старе (без дубля)', hub.eps.size === before && closed.includes('c1b') && !hub.ep('c1b'));
  t('закриття витісненого не робить away', hub.drop('c1b') === null && !rost.get('P2').away);
  // тривале відсутнє
  hub.drop('c3'); clock = 22;
  t('до спливу терміну місце тримається', hub.tick().length === 0);
  clock = 22 + T.CFG.grace + 1; hk.length = 0;
  const gone = hub.tick();
  t('після спливу — місце звільнено, hook gone', gone.length === 1 && gone[0].id === 'P4' && hk.includes('gone:P4') && !rost.get('P4'));
  // свідомий вихід
  hub.msg('c2', { t: 'bye' });
  t('bye у бою: гравця прибрано, hook gone', !rost.get('P3') && hk.includes('gone:P3'));
  // кінець бою
  game = false; rost.locked = false;
  hub.drop('s1'); t('глядач пішов', hub.specs === 0);
}
{ // приватна кімната + турнірні обмеження
  const rost = new T.Roster({ team2: false }); const inbox = {};
  const hub = new T.Hub({ roster: rost, send: (e, m) => (inbox[e] = inbox[e] || []).push(m), closeEp() {}, now: () => 0, info: () => ({ code: 'X', mode: 'duel', status: 'wait' }), pub: false, tour: { ids: ['H', 'G'] }, inGame: () => false });
  hub.setHost(prof('H'), 'ua');
  t('приватна: глядач відхилений', !hub.hello('s', { role: 'spec', prof: prof('S') }).ok);
  t('турнір: сторонній відхилений', !hub.hello('x', { role: 'player', prof: prof('XX') }).ok);
  t('турнір: учасник приєднався (1×1)', hub.hello('g', { role: 'player', prof: prof('G') }).ok && rost.get('G').side === 'ru');
  t('1×1: ping ігнорується', (hub.msg('g', { t: 'ping', pos: [1, 1] }), !(inbox.H || []).some(m => m.t === 'ping')));
}

/* ---------- КП: зведення, цілі, події ---------- */
{
  const S = T.cpSummary([
    { key: 's300', state: 'ready', mag: 4, reserve: 8, hp: 1, kills: 2, fired: 5 },
    { key: 's300', state: 'reload', mag: 0, reserve: 0, hp: 0.5, kills: 1, fired: 3, engaged: 7 },
    { key: 'gun', state: 'ready', mag: 0, reserve: 0, hp: 0.2, _auto: true },
    { key: 'f16', state: 'base', mag: 6, reserve: 0 }], { name: k => k.toUpperCase() });
  t('зведення: кількість і стани', S.n === 4 && S.ready === 2 && S.reload === 1 && S.base === 1);
  t('зведення: без БК, пошкодженні, виведені', S.noAmmo === 2 && S.damaged === 1 && S.down === 1 && S.auto === 1 && S.engaged === 1);
  t('зведення: збиття, постріли, типи', S.kills === 3 && S.fired === 8 && S.types[0].key === 's300' && S.types[0].n === 2 && S.types[0].name === 'S300');
  t('зведення: порожній список не ламається', T.cpSummary([]).n === 0 && T.cpSummary([]).hp === 1);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) * 100;
  const tg = T.cpTargets([
    { k: 'air', id: 1, st: 'tracking', conf: 0.8, age: 1, ll: [10, 10], hdg: 90, spd: 2, nm: 'Шахед' },
    { k: 'air', id: 2, st: 'identified', conf: 1, age: 0, ll: [1, 1], hdg: 10, spd: 4, nm: 'Х-101' },
    { k: 'air', id: 3, st: 'detected', conf: 0.5, age: 3, ll: [0, 0], hdg: null, spd: 0, cat: 'літак' },
    { k: 'gnd', id: 'g1', st: 'detected', ll: [0, 0], spd: 0 }], { dist, assets: [{ name: 'Київ', pos: [0, 0] }], engaged: new Map([[2, 2]]) });
  t('цілі: наземні контакти відфільтровано', tg.length === 3 && !tg.some(x => x.id === 'g1'));
  t('цілі: сортування за часом підльоту, без ETA — в кінці', tg[0].id === 2 && tg[1].id === 1 && tg[2].id === 3, tg.map(x => x.id));
  t('цілі: ETA, найближчий об\'єкт, кількість ППО на цілі', Math.abs(tg[0].eta - dist([1, 1], [0, 0]) / 4) < 1e-9 && tg[0].near.name === 'Київ' && tg[0].eng === 2 && tg[2].eta === null);
  let d = T.diffContacts(new Map(), [{ k: 'air', id: 1, st: 'preliminary', ll: [1, 1] }, { k: 'air', id: 2, st: 'tracking', ll: [2, 2], hdg: 45, cat: 'ракета' }]);
  t('події: попередній контакт без шуму, супровід — «виявлено»', d.events.length === 1 && d.events[0].k === 'det' && /курс 45/.test(d.events[0].x));
  d = T.diffContacts(d.next, [{ k: 'air', id: 1, st: 'tracking', ll: [1, 1] }, { k: 'air', id: 2, st: 'identified', nm: 'Калібр', ll: [2, 2] }]);
  t('події: попередній→супровід і ідентифікація', d.events.length === 2 && d.events.some(e => e.k === 'warn' && /Калібр/.test(e.x)) && d.events.some(e => e.k === 'det'));
  d = T.diffContacts(d.next, [{ k: 'air', id: 1, st: 'lost', ll: [1, 1] }]);
  t('події: втрата контакту й зникнення', d.events.length === 2 && d.events.every(e => e.k === 'lost'), d.events);
  d = T.diffContacts(d.next, []);
  t('події: без змін — порожньо', d.events.length === 0);
}

console.log(bad ? `FAIL: ${bad} провалено, ${ok} ок` : `OK: ${ok} перевірок`);
process.exit(bad ? 1 : 0);
