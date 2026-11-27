/* SKYDOMINION · COMMAND DECK — командний шар бойового екрана.
   Усе тут читає реальний стан гри через BV_API (units, ADS, OBJS, GAME, SIM, радари, туман війни) і шину подій BV_EV;
   команди йдуть штатними API гри (BV_QUICK, BV_FOLLOW, кнопки панелі бою). Декоративних заглушок немає. */
(function () {
  "use strict";
  if (window.BV_CMD) return;
  const $ = id => document.getElementById(id);
  const body = document.body;
  const A = () => window.BV_API;
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* */ } };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const D2R = Math.PI / 180;

  /* ------------------------------------------------------------------ іконки */
  const IC = {
    threat: "M12 12l6-5M12 3a9 9 0 1 0 9 9M12 7.5a4.5 4.5 0 1 0 4.5 4.5",
    assets: "M12 3l7.5 3v5.2c0 4.7-3.1 8-7.5 9.8-4.4-1.8-7.5-5.1-7.5-9.8V6z M9 12l2.2 2.2L15.5 10",
    objs: "M4 20V8l6-4v16M10 20v-8l10 3v5M3 20h18M7 9v.01M7 13v.01M14 16v.01M17 17v.01",
    log: "M5 6h14M5 12h14M5 18h9",
    layers: "M12 3l9 5-9 5-9-5zM3 12.5l9 5 9-5M3 16.5l9 5 9-5",
    search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5.2-5.2",
    help: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.6 9.4a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2.9-1.2 1.8M12 17h.01",
    pause: "M8.5 5v14M15.5 5v14", play: "M8 4.5l11 7.5-11 7.5z", dots: "M5 12h.01M12 12h.01M19 12h.01", x: "M6 6l12 12M18 6L6 18",
    map: "M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14", warn: "M12 3l9.5 17h-19zM12 10v4.5M12 17.5v.01",
    city: "M4 20V9h5v11M9 20V5h6v15M15 20v-8h5v8M3 20h18", launch: "M12 3l4 8h-8zM8 11v6M16 11v6M6 20h12", air: "M12 3v18M4 11l8-2 8 2M9 20l3-3 3 3",
    port: "M12 4v12M8 8h8M4 15c0 3 4 5 8 5s8-2 8-5", fac: "M3 20V10l5 3V10l5 3V6h4v14z", post: "M4 17a8 8 0 0 1 16 0M8 17a4 4 0 0 1 8 0M12 17h.01",
    node: "M12 4v16M4 12h16M12 12m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0", fs: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
    target: "M12 3v4M12 17v4M3 12h4M17 12h4M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0", flag: "M6 21V4M6 5h11l-2 4 2 4H6",
    chat: "M4 5h16v11H9l-5 4z", stat: "M5 20V10M12 20V4M19 20v-7", gen: "M12 8v4M12 16h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
    copy: "M9 9h10v11H9zM5 15V4h10", cmd: "M4 6l5 5-5 5M12 17h8", eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"
  };
  const ico = (d, c) => `<svg class="k-ico ${c || ""}" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;

  /* ------------------------------------------------------------------ переклад нових рядків */
  const DICT = {
    "Обстановка": ["Обстановка", "Situation"], "Техніка": ["Техника", "Assets"], "Об'єкти": ["Объекты", "Objects"], "Журнал": ["Журнал", "Log"], "Шари": ["Слои", "Layers"],
    "Пошук": ["Поиск", "Search"], "Довідка": ["Справка", "Help"], "Цілі в повітрі": ["Цели в воздухе", "Airborne"], "Найближчий вплив": ["Ближайшее попадание", "Next impact"],
    "Збито": ["Сбито", "Downed"], "Прорвалося": ["Прорвалось", "Leaked"], "Усі": ["Все", "All"], "БпЛА": ["БПЛА", "UAV"], "Крилаті": ["Крылатые", "Cruise"], "Балістика": ["Баллистика", "Ballistic"],
    "Інше": ["Прочее", "Other"], "Небо чисте": ["Небо чистое", "Sky clear"], "Супровід": ["Сопровождение", "Follow"], "На мапі": ["На карте", "Locate"], "Закрити": ["Закрыть", "Close"],
    "Потребує уваги": ["Требует внимания", "Needs attention"], "Готова": ["Готова", "Ready"], "Перезарядка": ["Перезарядка", "Reloading"], "Режим": ["Режим", "Mode"],
    "Боєкомплект": ["Боекомплект", "Ammo"], "Резерв": ["Резерв", "Reserve"], "Збиття": ["Сбития", "Kills"], "Стан": ["Состояние", "Status"], "Автоматично": ["Автоматически", "Auto"],
    "Вручну": ["Вручную", "Manual"], "Додати БК": ["Добавить БК", "Add ammo"], "Ремонт": ["Ремонт", "Repair"], "Зняти": ["Снять", "Remove"], "Повернути": ["Вернуть", "Return"],
    "Міцність": ["Прочность", "Health"], "Прикриття ППО": ["Прикрытие ПВО", "AD cover"], "Незахищено": ["Не защищено", "Unprotected"], "Знищено": ["Уничтожено", "Destroyed"],
    "Сітка координат": ["Сетка координат", "Coordinate grid"], "Зони прикриття ППО": ["Зоны прикрытия ПВО", "AD coverage zones"], "Виявлення РЛС": ["Обнаружение РЛС", "Radar detection"],
    "Вектори загроз": ["Векторы угроз", "Threat vectors"], "Підписи цілей": ["Подписи целей", "Target labels"], "Сліди руху": ["Следы движения", "Movement trails"],
    "Мінікарта": ["Миникарта", "Minimap"], "Шари мапи": ["Слои карты", "Map layers"], "Тактичні накладки": ["Тактические наложения", "Tactical overlays"],
    "Подій поки немає": ["Событий пока нет", "No events yet"], "Копіювати": ["Копировать", "Copy"], "Зберегти": ["Сохранить", "Save"], "Очистити": ["Очистить", "Clear"],
    "Повітряна тривога": ["Воздушная тревога", "Air raid alert"], "Відбій": ["Отбой", "All clear"], "Пауза": ["Пауза", "Pause"], "Продовжити": ["Продолжить", "Resume"], "Готово": ["Готово", "Ready"],
    "Загроза": ["Угроза", "Threat"], "Підготовка": ["Подготовка", "Preparation"], "Бій": ["Бой", "Battle"], "Завершено": ["Завершено", "Finished"], "День": ["День", "Day"],
    "Швидкість": ["Скорость", "Speed"], "Курс": ["Курс", "Heading"], "Ціль": ["Цель", "Target"], "Пуск": ["Пуск", "Launch"], "Відстань": ["Расстояние", "Distance"], "Пошук цілей, техніки, об'єктів…": ["Поиск целей, техники, объектов…", "Search targets, assets, objects…"],
    "Гарячі клавіші": ["Горячие клавиши", "Hotkeys"], "Командний пункт": ["Командный пункт", "Command post"], "Увага": ["Внимание", "Attention"], "Немає виявлених цілей": ["Нет обнаруженных целей", "No detected targets"],
    "Нічого не знайдено": ["Ничего не найдено", "Nothing found"], "Ваша техніка відсутня": ["Вашей техники нет", "No own assets"], "Об'єктів немає": ["Объектов нет", "No objects"],
    "Упевненість": ["Уверенность", "Confidence"], "Вік даних": ["Возраст данных", "Data age"], "Розпізнано": ["Опознано", "Identified"], "Виявлено": ["Обнаружено", "Detected"], "Втрачено": ["Потеряно", "Lost"]
  };
  Object.assign(DICT, {
    "Пресети": ["Пресеты", "Presets"], "Бойовий": ["Боевой", "Combat"], "Чистий": ["Чистый", "Clean"], "Розвідка": ["Разведка", "Recon"],
    "Копіювати координати": ["Копировать координаты", "Copy coordinates"], "Координати скопійовано": ["Координаты скопированы", "Coordinates copied"],
    "Команди": ["Команды", "Commands"], "Цілі": ["Цели", "Targets"], "Панелі": ["Панели", "Panels"], "Карта": ["Карта", "Map"], "Накладки": ["Наложения", "Overlays"], "Система": ["Система", "System"],
    "Наступна ціль": ["Следующая цель", "Next target"], "Попередня ціль": ["Предыдущая цель", "Previous target"], "Центрувати на виборі": ["Центрировать на выборе", "Center on selection"],
    "Наблизити · віддалити": ["Приблизить · отдалить", "Zoom in · out"], "Підписи цілей": ["Подписи целей", "Target labels"], "Пошук": ["Поиск", "Search"],
    "Вибір": ["Выбор", "Select"], "Перейти": ["Перейти", "Go"], "Увімкнено": ["Включено", "Enabled"], "Вимкнено": ["Выключено", "Disabled"], "Стан": ["Состояние", "Status"],
    "Міцність": ["Прочность", "Integrity"], "Боєкомплект": ["Боекомплект", "Ammo"], "Ракети": ["Ракеты", "Missiles"], "Упевненість": ["Уверенность", "Confidence"], "Вік даних": ["Возраст данных", "Data age"]
  });
  function i18n() { try { if (A() && A().i18nAdd) A().i18nAdd(DICT); } catch (e) { /* */ } }

  /* ------------------------------------------------------------------ стан шару */
  const OV = { grid: lsGet("cmd.grid", "1") === "1", cover: lsGet("cmd.cover", "1") === "1", detect: lsGet("cmd.detect", "1") === "1", vec: lsGet("cmd.vec", "1") === "1", lbl: lsGet("cmd.lbl", "1") === "1", trail: lsGet("cmd.trail", "1") === "1" };
  const C = { tab: null, sel: null, hover: null, thrFilter: "all", thrSort: "eta", assetFilter: "all", objFilter: "all", objQ: "", logFilter: "all", logQ: "", log: [], logNew: 0, ready: false,
    trails: new Map(), flashes: [], hit: [], lastAlert: 0, prevN: 0, clearUntil: 0, thr: [], thrSig: "", mini: lsGet("cmd.mini", "1") === "1" };
  let root = null;

  /* ------------------------------------------------------------------ дані: сторони, цілі */
  const sides = () => (A() ? A().mySides() : []);
  const viewSide = () => { const m = sides(); return m.length === 1 ? m[0] : null; };
  const fogLive = () => { try { return !!(window.BV_FOG_API && BV_FOG_API.live() && BV_FOG_API.side()); } catch (e) { return false; } };
  const KCLS = { drone: "uav", jet: "uav", rd: "uav", cruise: "msl", ballistic: "bal", hyper: "bal", icbm: "bal", bomb: "oth", tac: "oth" };
  const CLS_N = { uav: "БпЛА", msl: "Крилаті", bal: "Балістика", oth: "Інше" };
  const wName = u => { const a = A(); const W = u.kind === "w" ? a.WEAPONS[u.key] : u.kind === "c" ? a.CARRIERS[u.key] : null; return W ? W.n : u.key || "Ціль"; };
  const fmtT = s => { if (s == null || !isFinite(s)) return "—"; s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  const fmtKm = d => d == null ? "—" : d < 10 ? d.toFixed(1) + " км" : Math.round(d) + " км";
  const hav = (p, q) => A().hav(p, q);
  const fastKm = (p, q) => { const kx = 111.32 * Math.cos((p[1] + q[1]) * 0.5 * D2R); const dx = (p[0] - q[0]) * kx, dy = (p[1] - q[1]) * 110.574; return Math.sqrt(dx * dx + dy * dy); };
  const bearing = (a, b) => { const y = Math.sin((b[0] - a[0]) * D2R) * Math.cos(b[1] * D2R), x = Math.cos(a[1] * D2R) * Math.sin(b[1] * D2R) - Math.sin(a[1] * D2R) * Math.cos(b[1] * D2R) * Math.cos((b[0] - a[0]) * D2R); return (Math.atan2(y, x) / D2R + 360) % 360; };

  function ownAssets() {
    const a = A(), ms = sides(), out = [];
    if (!a) return out;
    for (const u of a.ADS.units.values()) { const sd = u.side || "ua"; if (!ms.length || ms.includes(sd)) out.push(u); }
    return out;
  }
  function allAD() { const a = A(); return a ? [...a.ADS.units.values()] : []; }

  /* список повітряних цілей: або картина з туману війни (знання сторони), або реальні юніти */
  function collectThreats() {
    const a = A(); if (!a || !a.GAME.on) return [];
    const out = [], vs = viewSide();
    if (fogLive()) {
      const fs = BV_FOG_API.side();
      for (const c of BV_FOG_API.contacts(fs)) {
        if (c.k !== "air") continue;
        out.push({ id: "f" + c.id, fog: true, name: c.nm || (c.cat ? c.cat : "Невідома ціль"), cls: "oth", pos: c.ll, hdg: c.hdg, spd: Math.round((c.spd || 0) * 3600), conf: c.conf, st: c.st, age: c.age, side: null, eta: null, from: "", target: "", cs: "C-" + String(c.id).slice(-3).toUpperCase() });
      }
      return out;
    }
    for (const u of a.units.values()) {
      if (u.kind !== "w" && u.kind !== "c") continue;
      if (u.fall) continue;
      if (vs && u.sd === vs) continue;                // у бою за одну сторону показуємо лише противника
      const W = u.kind === "w" ? a.WEAPONS[u.key] : a.CARRIERS[u.key]; if (!W) continue;
      const pos = a.unitPos(u); if (!pos) continue;
      const end = u.pts && u.pts[u.pts.length - 1];
      let eta = null;
      if (u.kind === "w" && u.L != null && u.spd > 0 && !u.loiter && !u.ai && !u.sea) eta = Math.max(0, (u.L - u.s) / u.spd) + (u.wait > 0 ? u.wait : 0);
      const sp = (a.DSPEC[u.key] && a.DSPEC[u.key].v) || (u.spd ? Math.round(u.spd * 3600) : 0);
      out.push({ id: u.id, u, name: W.n, cls: u.kind === "w" ? (KCLS[W.ad] || "oth") : "oth", carrier: u.kind === "c", pos, hdg: u.hdg, spd: sp, side: u.sd, eta, end, from: (u.meta && u.meta.from) || "", target: (u.meta && u.meta.target) || "",
        phase: (u.meta && u.meta.phase) || "", key: u.key, cs: (u.sd === "ru" ? "R-" : "U-") + String(u.id).padStart(4, "0") });
    }
    return out;
  }
  const thrLevel = th => {
    const n = th.filter(t => !t.carrier).length; if (!n) return { l: 0, n: 0, eta: null };
    let eta = Infinity; for (const t of th) if (t.eta != null && t.eta < eta) eta = t.eta; if (!isFinite(eta)) eta = null;
    let l = n < 3 ? 1 : n < 8 ? 2 : n < 20 ? 3 : n < 40 ? 4 : 5;
    if (eta != null) { if (eta < 45) l = Math.max(l, 4); if (eta < 20) l = 5; }
    return { l, n, eta };
  };
  /* прикриття точки засобами ППО сторони: 0..1 (імовірність, що хоч одна система «дотягнеться» по БпЛА) */
  function coverAt(p, side, ads) {
    const a = A(); let miss = 1, n = 0;
    for (const u of ads || allAD()) {
      if ((u.side || "ua") !== side) continue;
      const T = a.AD_TYPES[u.key]; if (!T || !T.r || T.air || T.drone) continue;
      if (u.state === "move") continue;
      if (fastKm(p, u.pos) <= T.r) { miss *= 1 - clamp((T.p && T.p[0] ? T.p[0] : 40) / 100, 0.05, 0.95) * 0.8; n++; }
    }
    return { v: 1 - miss, n };
  }

  /* ------------------------------------------------------------------ DOM */
function build() {
    root = document.createElement("div"); root.id = "cmd";
    const rb = (tab, ic, nm, key, bg) => `<button class="rb" data-tab="${tab}" aria-label="${nm} (${key})">${ico(IC[ic])}<span class="tt">${nm}<kbd>${key}</kbd></span>${bg ? `<i class="bg ${bg[1]}" id="${bg[0]}"></i>` : ""}</button>`;
    root.innerHTML = `
    <canvas id="cmdOv"></canvas>
    <header id="cmdTop" class="k-pn">
      <div class="tl"><svg class="mark" viewBox="0 0 32 32" fill="none"><rect x="1" y="1" width="30" height="30" rx="8" stroke="#f2b53c" stroke-opacity=".55"/><path d="M7 24 16 7l9 17" stroke="#f1f3f5" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/><path d="M11.5 18.5h9" stroke="#f2b53c" stroke-width="2.2" stroke-linecap="round"/><circle cx="16" cy="7" r="2.2" fill="#f2b53c"/></svg>
        <div class="nm"><b>SKY<i>DOMINION</i></b><small id="ctMode">—</small></div><div class="ph" id="ctPh">—</div></div>
      <div class="tc"><button class="pp" id="ctPause" title="Пауза (Пробіл)">${ico(IC.pause)}</button>
        <div class="clk"><span class="t" id="ctClk">00:00</span><span class="d" id="ctDay">—</span></div>
        <div class="sc" id="ctSc" title="Очки сторін: Україна : Росія"><span class="ua">0</span><em>:</em><span class="ru">0</span></div></div>
      <div class="tr"><div class="thr" id="ctThr" data-l="0"><small><span>Загроза</span><b id="ctThrN">0</b></small><div class="bar"><i></i><i></i><i></i><i></i><i></i></div></div>
        <div class="mny" id="ctMny" style="display:none"><b>—</b><small>бюджет</small></div>
        <button class="go" id="ctReady" style="display:none">Готово</button>
        <button class="ib sr" id="ctSearch" aria-label="Пошук (Ctrl K)">${ico(IC.search)}<span>Пошук</span><kbd>Ctrl K</kbd></button>
        <button class="ib" id="ctMore" aria-label="Меню бою">${ico(IC.dots)}</button></div>
      <div class="prg"><i id="ctPrg"></i></div>
    </header>
    <div id="cmdMenu" class="k-pn"></div>
    <nav id="cmdRail" class="k-pn" aria-label="Навігація">
      ${rb("threat", "threat", "Обстановка", "1", ["bgThr", ""])}${rb("assets", "assets", "Техніка", "2", ["bgAst", "cy"])}${rb("objs", "objs", "Об'єкти", "3", ["bgObj", ""])}${rb("log", "log", "Журнал", "4", ["bgLog", "cy"])}${rb("layers", "layers", "Шари", "5")}
      <hr><button class="rb" data-act="help" aria-label="Гарячі клавіші (?)">${ico(IC.help)}<span class="tt">Гарячі клавіші<kbd>?</kbd></span></button>
    </nav>
    <aside id="cmdDrawer" class="k-pn"><div class="dh"><div class="tt"><h3 id="cdT"></h3><span class="ds" id="cdS"></span></div><button class="x" data-act="close" aria-label="Закрити">${ico(IC.x)}</button></div><div class="db" id="cdB"></div></aside>
    <section id="cmdInsp" class="k-pn"></section>
    <div id="cmdAlert" class="k-pn"><svg class="sg k-ico" viewBox="0 0 24 24"><path d="${IC.warn}"/></svg><b id="caT">Повітряна тривога</b><span id="caS"></span></div>
    <div id="cmdToasts" aria-live="polite"></div>
    <section id="cmdMini" class="k-pn"><canvas id="cmdMiniC"></canvas><div class="mh">Мінікарта</div><button class="mx" data-act="mini" aria-label="Сховати">${ico(IC.x)}</button></section>
    <button id="cmdMiniOpen" class="k-pn" style="display:none" aria-label="Мінікарта (M)">${ico(IC.map)}</button>
    <section id="cmdLog" class="k-pn"><button class="lh" id="clH"><b>Журнал</b><span id="clL"><i></i>Подій поки немає</span><em id="clC"></em><i class="cnt" id="clN">0</i></button></section>
    <div id="cmdTip"></div>
    <div id="cmdPal"><div class="box k-pn"><div class="pin">${ico(IC.search)}<input id="kpIn" placeholder="Пошук цілей, техніки, об'єктів…" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></div><div class="res" id="kpR"></div>
      <div class="pf"><span><kbd>↑</kbd><kbd>↓</kbd>Вибір</span><span><kbd>Enter</kbd>Перейти</span></div></div></div>
    <div id="cmdKeys"><div class="box k-pn"><div class="kh"><h3>Гарячі клавіші</h3><button class="kx" data-act="keysx" aria-label="Закрити">${ico(IC.x)}</button></div><div class="kb">${keysHtml()}</div></div></div>`;
    body.appendChild(root);
    const ov = $("cmdOv"); body.insertBefore(ov, $("map").nextSibling); ov.style.cssText = "";   // канва — одразу над мапою, під інтерфейсом
    wire();
  }

  /* гарячі клавіші: єдине джерело для довідки (і нагадування в палітрі) */
  const KEYS = [
    ["Панелі", [["Обстановка", ["1"]], ["Техніка", ["2"]], ["Об'єкти", ["3"]], ["Журнал", ["4"]], ["Шари мапи", ["5"]]]],
    ["Обстановка", [["Наступна ціль", ["]"]], ["Попередня ціль", ["["]], ["Найближча загроза", ["N"]], ["Супровід цілі", ["F"]], ["Центрувати на виборі", ["C"]]]],
    ["Карта", [["Загальний вид", ["Home"]], ["Наблизити · віддалити", ["+", "−"]], ["Мінікарта", ["M"]], ["Пошук", ["Ctrl", "K"]]]],
    ["Накладки", [["Сітка координат", ["G"]], ["Зони прикриття ППО", ["Z"]], ["Виявлення РЛС", ["R"]], ["Вектори загроз", ["V"]], ["Сліди руху", ["T"]], ["Підписи цілей", ["B"]]]],
    ["Система", [["Пауза / продовжити", ["Пробіл"]], ["Довідка", ["?"]], ["Закрити все", ["Esc"]]]]
  ];
  function keysHtml() {
    return KEYS.map(([g, rows]) => `<div class="grp"><h4>${g}</h4>${rows.map(([n, ks]) => `<div class="r"><span>${n}</span><span class="ks">${ks.map(k => `<kbd>${k}</kbd>`).join("")}</span></div>`).join("")}</div>`).join("");
  }

  /* сповіщення зверху: коротка відповідь інтерфейсу на дію */
  function say(m, kind) {
    const box = $("cmdToasts"); if (!box || !m) return; m = String(m);
    const dismiss = e => { e.classList.add("out"); setTimeout(() => e.remove(), 220); };
    const last = box.lastElementChild;
    if (last && last._m === m && !last.classList.contains("out")) { clearTimeout(last._to); last._to = setTimeout(() => dismiss(last), 2800); return; }
    const e = document.createElement("div"); e.className = "kt " + (kind || "info"); e.textContent = m; e._m = m; box.appendChild(e);
    while (box.children.length > 3) box.firstElementChild.remove();
    e._to = setTimeout(() => dismiss(e), kind === "warn" || kind === "alert" ? 4200 : 2800);
  }

  
  /* ------------------------------------------------------------------ керування вкладками */
  const TABS = { threat: "Обстановка", assets: "Техніка", objs: "Об'єкти", log: "Журнал", layers: "Шари мапи" };
  function openTab(t) {
    if (t === C.tab) t = null;
    C.tab = t; body.classList.toggle("k-dr", !!t);
    $("cmdDrawer").classList.toggle("on", !!t);
    root.querySelectorAll("#cmdRail .rb[data-tab]").forEach(b => b.classList.toggle("on", b.dataset.tab === t));
    if (t) { $("cdT").textContent = TABS[t]; $("cmdDrawer").classList.remove("still"); C.sig = ""; renderDrawer(true); if (t === "log") { C.logNew = 0; updBadges(); } }
  }
  function updBadges() {
    const set = (id, n, cls) => { const e = $(id); if (!e) return; e.textContent = n > 99 ? "99+" : n; e.classList.toggle("on", n > 0); };
    set("bgThr", C.thr.filter(t => !t.carrier).length); set("bgLog", C.logNew); set("bgAst", 0);
    const sup = ownAssets().filter(needsAttention).length; set("bgObj", C.objRisk | 0);
    const e = $("bgAst"); if (e) { e.textContent = sup; e.classList.toggle("on", sup > 0); e.classList.remove("cy"); e.style.background = "var(--k-warn)"; e.style.color = "#1b1200"; }
  }
  const needsAttention = u => { const T = A().AD_TYPES[u.key]; if (!T) return false; const mag = u.mag | 0, cap = T.mag | 0; const dm = window.BV_DMG ? window.BV_DMG.level(u.id) : 0; return (cap > 0 && mag / cap < 0.34 && !(u.reserve > 0)) || dm > 0; };

  /* ------------------------------------------------------------------ відмальовка вкладок */
  function unitIconHtml(t) {
    const a = A(); let src = "";
    try { if (t.u && t.u.kind === "w") { const W = a.WEAPONS[t.u.key]; src = a.spr(t.u.img || (W.img && W.img[0])); } else if (t.u && t.u.kind === "c") src = a.spr(a.CARRIERS[t.u.key].img); } catch (e) { /* */ }
    return src ? `<img src="${src}" alt="">` : ico(IC.threat);
  }
  function threatRows() {
    const th = C.thr, f = C.thrFilter; let list = th.filter(t => f === "all" || t.cls === f);
    const anchor = ownAssets().map(u => u.pos);
    for (const t of list) { let d = Infinity; for (const p of anchor) { const k = fastKm(t.pos, p); if (k < d) d = k; } t.dm = isFinite(d) ? d : null; }
    list.sort(C.thrSort === "eta" ? (x, y) => (x.eta == null) - (y.eta == null) || (x.eta - y.eta) || (x.dm - y.dm) : C.thrSort === "dist" ? (x, y) => (x.dm == null) - (y.dm == null) || x.dm - y.dm : (x, y) => x.name.localeCompare(y.name));
    return list;
  }
  function renderThreat(force) {
    const a = A(), th = C.thr, lv = thrLevel(th), st = a.GAME.st, vs = viewSide();
    const down = vs ? st[vs].downed : st.ua.downed + st.ru.downed, leaks = a.ADS.leaks + a.ADS.uaHits;
    const cnt = k => th.filter(t => k === "all" || t.cls === k).length;
    const chips = [["all", "Усі"], ["uav", "БпЛА"], ["msl", "Крилаті"], ["bal", "Балістика"], ["oth", "Інше"]].map(([k, n]) => `<button class="k-chip ${C.thrFilter === k ? "on" : ""}" data-thf="${k}">${n}<i>${cnt(k)}</i></button>`).join("");
    const rows = threatRows();
    const sig = [C.thrFilter, C.thrSort, rows.map(r => r.id).join(","), C.sel && C.sel.id].join("|");
    if (!force && sig === C.sig) { patchThreat(rows); return; }
    C.sig = sig;
    const head = `<div class="k-kpis q"><div class="k-kpi"><small>У повітрі</small><b class="${lv.n ? "b" : "g"}" id="kpN">${lv.n}</b></div><div class="k-kpi"><small>До впливу</small><b class="${lv.eta != null && lv.eta < 30 ? "b" : "w"}" id="kpE">${fmtT(lv.eta)}</b></div>
      <div class="k-kpi"><small>Збито</small><b class="g">${down}</b></div><div class="k-kpi"><small>Прорвалося</small><b class="${leaks ? "w" : ""}">${leaks}</b></div></div>
      <div class="k-chips">${chips}</div><div class="k-sortl">Сортування</div><div class="k-chips"><button class="k-chip ${C.thrSort === "eta" ? "on" : ""}" data-ths="eta">за часом</button><button class="k-chip ${C.thrSort === "dist" ? "on" : ""}" data-ths="dist">за відстанню</button><button class="k-chip ${C.thrSort === "name" ? "on" : ""}" data-ths="name">за типом</button></div>`;
    let h = head;
    if (!rows.length) h += `<div class="k-empty">${ico(IC.threat)}<br>${fogLive() ? "Немає виявлених цілей" : "Небо чисте"}</div>`;
    for (const r of rows.slice(0, 120)) h += threatRowHtml(r);
    $("cdB").innerHTML = h;
  }
  function threatRowHtml(r) {
    const eta = r.eta, c = eta == null ? "" : eta < 20 ? "b" : eta < 60 ? "w" : "";
    const sub = r.fog ? `${esc(({ identified: "Розпізнано", detected: "Виявлено", lost: "Втрачено" })[r.st] || r.st)} · ${Math.round((r.conf || 0) * 100)}% · ${r.spd} км/год` : `${esc((r.from || "").replace("Ручний запуск · ", "") || "—")}${r.target ? " → " + esc(r.target) : ""}`;
    return `<div class="k-row ${r.side || ""} ${eta != null && eta < 20 ? "bad" : ""} ${C.sel && C.sel.id === r.id ? "sel" : ""}" data-thr="${r.id}"><div class="ic">${unitIconHtml(r)}</div><div class="tx"><b>${esc(r.name)} <em class="k-num" style="font-style:normal;color:var(--k-dim);font-size:10px">${r.cs}</em></b><small>${sub}</small></div>
      <div class="rt"><b class="k-num ${c}" data-eta="${r.id}">${r.fog ? (r.age != null ? Math.round(r.age) + "с" : "") : fmtT(eta)}</b><small>${r.fog ? "вік" : r.dm != null ? fmtKm(r.dm) : "ETA"}</small></div></div>`;
  }
  function patchThreat(rows) {
    const lv = thrLevel(C.thr); const n = $("kpN"), e = $("kpE"); if (n) n.textContent = lv.n; if (e) e.textContent = fmtT(lv.eta);
    for (const r of rows) { const el = $("cdB").querySelector(`[data-eta="${r.id}"]`); if (el && !r.fog) { el.textContent = fmtT(r.eta); el.className = "k-num " + (r.eta == null ? "" : r.eta < 20 ? "b" : r.eta < 60 ? "w" : ""); } }
  }

  function renderAssets(force) {
    const a = A(), list = ownAssets();
    const f = C.assetFilter, att = list.filter(needsAttention).length;
    const chips = [["all", "Усі", list.length], ["ready", "Готові", list.filter(u => u.state === "ready" || u.state === "patrol").length], ["att", "Потребує уваги", att]].map(([k, n, c]) => `<button class="k-chip ${f === k ? "on" : ""}" data-asf="${k}">${n}<i>${c}</i></button>`).join("");
    let rows = list.filter(u => f === "all" || (f === "att" ? needsAttention(u) : (u.state === "ready" || u.state === "patrol")));
    const byKey = {}; for (const u of list) byKey[u.key] = (byKey[u.key] || 0) + 1;
    const sig = f + "|" + rows.map(u => [u.id, u.state, u.mag, u.reserve, u.mode, u.kills].join(":")).join(",") + "|" + (C.sel && C.sel.id) + "|" + (window.BV_DMG ? rows.map(u => window.BV_DMG.level(u.id)).join("") : "");
    if (!force && sig === C.sig) return; C.sig = sig;
    let h = `<div class="k-kpis"><div class="k-kpi"><small>Систем ППО</small><b class="c">${list.length}</b></div><div class="k-kpi"><small>Збиття</small><b class="g">${list.reduce((s, u) => s + (u.kills | 0), 0)}</b></div></div><div class="k-chips">${chips}</div>`;
    if (!rows.length) h += `<div class="k-empty">${ico(IC.assets)}<br>${list.length ? "Нічого не знайдено" : "Ваша техніка відсутня"}<br><small>Розмістіть ППО з панелі ППО (кнопка «Панель» або перетягніть картку на мапу).</small></div>`;
    for (const u of rows.slice(0, 150)) {
      const T = a.AD_TYPES[u.key]; if (!T) continue; const cap = T.mag | 0, mag = u.mag | 0, pc = cap ? clamp(mag / cap * 100, 0, 100) : 0;
      const dm = window.BV_DMG ? window.BV_DMG.level(u.id) : 0, low = cap > 0 && mag / cap < 0.34 && !(u.reserve > 0);
      const stN = ({ ready: "Готова", reload: "Перезарядка", move: "Переміщення", patrol: "Патруль", base: "На базі", transit: "Виліт", rtb: "Повертається" })[u.state] || u.state;
      h += `<div class="k-row ${u.side || "ua"} ${dm || low ? "warn" : ""} ${C.sel && C.sel.id === "a" + u.id ? "sel" : ""}" data-ast="${u.id}"><div class="ic"><img src="${a.adSrc(u.key)}" alt=""></div><div class="tx"><b>${esc(T.n)}</b><small>${esc(stN)}${u.post ? " · " + esc(u.post) : ""} · збито ${u.kills | 0}${dm ? " · ушкоджено" : ""}</small>
        <div class="k-bar"><i class="${low ? "b" : pc < 50 ? "w" : ""}" style="width:${pc}%"></i></div></div><div class="rt"><b class="k-num ${low ? "b" : ""}">${mag}/${cap}</b><small>${u.reserve === Infinity ? "∞" : "+" + (u.reserve | 0)}</small></div></div>`;
    }
    $("cdB").innerHTML = h;
  }

  const OBJ_N = { city: "Місто", launch: "Пусковий рубіж", air: "Аеродром", port: "Порт", strat: "Стратегічний аеродром", fighter: "Аеродром винищувачів", fac: "Завод", post: "Пункт ППО", lport: "Порт логістики", lrail: "Залізничний вузол", llog: "Логістичний вузол" };
  const OBJ_IC = { city: IC.city, launch: IC.launch, air: IC.air, strat: IC.air, fighter: IC.air, port: IC.port, lport: IC.port, fac: IC.fac, post: IC.post, lrail: IC.node, llog: IC.node };
  function objData() {
    const a = A(), vs = viewSide(), G = a.GAME, out = [], ads = allAD();
    const free = G.mode === "free" || !G.obj || G.obj.length !== a.OBJS.length;
    let risk = 0;
    for (const o of a.OBJS) {
      if (vs && o.side !== vs) continue;
      const hp = free ? o.hp : G.obj[o.i], f = o.hp ? clamp(hp / o.hp, 0, 1) : 1, dead = !free && hp <= 0;
      let cov = null; if (o.t !== "city" || true) cov = coverAt(o.c, o.side, ads);
      const unprot = !dead && cov.n === 0 && o.t !== "post";
      if (!dead && (unprot || f < 0.5)) risk++;
      out.push({ o, f, dead, cov, unprot });
    }
    C.objRisk = risk; return out;
  }
  function renderObjs(force) {
    const a = A(); let all = objData();
    const q = C.objQ.trim().toLowerCase(), f = C.objFilter;
    const types = ["all", "city", "launch", "air", "port", "post", "risk"];
    const tn = { all: "Усі", city: "Міста", launch: "Рубежі", air: "Аеродроми", port: "Порти", post: "ППО", risk: "Ризик" };
    const match = r => (f === "all" || (f === "risk" ? (r.unprot || r.f < 0.5) && !r.dead : f === "air" ? /air|strat|fighter/.test(r.o.t) : f === "port" ? /port/.test(r.o.t) : r.o.t === f)) && (!q || r.o.n.toLowerCase().includes(q));
    let rows = all.filter(match);
    rows.sort((x, y) => (y.unprot - x.unprot) || (x.f - y.f) || x.o.n.localeCompare(y.o.n));
    const sig = f + "|" + q + "|" + rows.slice(0, 60).map(r => r.o.i + ":" + r.f.toFixed(2) + ":" + r.cov.n + r.dead).join(",");
    if (!force && sig === C.sig) return; C.sig = sig;
    const act = document.activeElement && document.activeElement.id === "cdQ";
    let h = `<input class="k-search" id="cdQ" placeholder="Пошук цілей, техніки, об'єктів…" value="${esc(C.objQ)}"><div class="k-chips">${types.map(k => `<button class="k-chip ${f === k ? "on" : ""}" data-obf="${k}">${tn[k]}${k === "risk" ? `<i>${all.filter(r => (r.unprot || r.f < 0.5) && !r.dead).length}</i>` : ""}</button>`).join("")}</div>`;
    if (!rows.length) h += `<div class="k-empty">${ico(IC.objs)}<br>${a.OBJS.length ? "Нічого не знайдено" : "Об'єктів немає"}</div>`;
    for (const r of rows.slice(0, 100)) {
      const o = r.o, pc = Math.round(r.f * 100), cls = r.dead ? "bad" : r.unprot || r.f < 0.5 ? "warn" : o.side;
      h += `<div class="k-row ${cls} ${C.sel && C.sel.id === "o" + o.i ? "sel" : ""}" data-obj="${o.i}"><div class="ic">${ico(OBJ_IC[o.t] || IC.gen)}</div><div class="tx"><b>${esc(o.n)}</b><small>${esc(OBJ_N[o.t] || o.t)} · ${r.dead ? "Знищено" : r.unprot ? "Незахищено" : "ППО: " + r.cov.n + " сист. · " + Math.round(r.cov.v * 100) + "%"}</small><div class="k-bar"><i class="${r.dead ? "b" : r.f < 0.5 ? "b" : r.f < 0.8 ? "w" : ""}" style="width:${r.dead ? 0 : pc}%"></i></div></div><div class="rt"><b class="k-num ${r.dead ? "b" : r.unprot ? "w" : ""}">${r.dead ? "✕" : pc + "%"}</b><small>${r.dead ? "" : "міцність"}</small></div></div>`;
    }
    $("cdB").innerHTML = h;
    if (act) { const i = $("cdQ"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  }

  const LOG_CATS = [["all", "Усі"], ["alert", "Тривоги"], ["kill", "Збиття"], ["hit", "Влучання"], ["launch", "Пуски"], ["obj", "Об'єкти"], ["info", "Система"]];
  function renderLog(force) {
    const sig = C.logFilter + "|" + C.logQ + "|" + C.log.length + "|" + (C.log.length ? C.log[C.log.length - 1].n : 0);
    if (!force && sig === C.sig) return; C.sig = sig;
    const q = C.logQ.trim().toLowerCase(), f = C.logFilter;
    const rows = C.log.filter(e => (f === "all" || e.cat === f || (f === "info" && !["alert", "kill", "hit", "launch", "obj"].includes(e.cat))) && (!q || e.x.toLowerCase().includes(q)));
    const act = document.activeElement && document.activeElement.id === "cdLQ", box = $("cdB"), atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
    let h = `<input class="k-search" id="cdLQ" placeholder="Пошук у журналі…" value="${esc(C.logQ)}"><div class="k-chips">${LOG_CATS.map(([k, n]) => `<button class="k-chip ${f === k ? "on" : ""}" data-lgf="${k}">${n}</button>`).join("")}</div>`;
    if (!rows.length) h += `<div class="k-empty">${ico(IC.log)}<br>Подій поки немає</div>`;
    for (const e of rows.slice(-250)) h += `<div class="k-log ${e.cat} ${e.k} ${e.pos ? "loc" : ""}" ${e.pos ? `data-lg="${e.id}"` : ""}><time>${esc(e.t)}</time><i></i><div>${esc(e.x)}${e.n > 1 ? `<em>×${e.n}</em>` : ""}</div></div>`;
    h += `<div class="k-act" style="margin-top:10px"><button class="k-btn" data-act="logcopy">Копіювати</button><button class="k-btn" data-act="logsave">Зберегти</button><button class="k-btn dng" data-act="logclr">Очистити</button></div>`;
    box.innerHTML = h;
    if (act) { const i = $("cdLQ"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
    if (atEnd) box.scrollTop = box.scrollHeight;
  }

  const PRESETS = { combat: { cover: 1, detect: 1, vec: 1, lbl: 1, trail: 1, grid: 0 }, clean: { cover: 0, detect: 0, vec: 0, lbl: 0, trail: 0, grid: 0 }, recon: { cover: 0, detect: 1, vec: 1, lbl: 1, trail: 1, grid: 1 } };
  const presetOn = p => OV_KEYS.every(k => !!OV[k] === !!PRESETS[p][k]);
  function renderLayers() {
    if (C.sig === "L" + JSON.stringify(OV)) return; C.sig = "L" + JSON.stringify(OV);
    const tg = (k, n, d, key) => `<label class="k-tg"><input type="checkbox" data-ov="${k}" ${OV[k] ? "checked" : ""}><span class="sw"></span><span class="l">${n}<small>${d}</small></span><span class="kk"><kbd>${key}</kbd></span></label>`;
    const pre = [["combat", "Бойовий"], ["clean", "Чистий"], ["recon", "Розвідка"]];
    let h = `<div class="k-sec">Пресети</div><div class="k-pre">${pre.map(([k, n]) => `<button data-pre="${k}" class="${presetOn(k) ? "on" : ""}">${n}</button>`).join("")}</div>` +
      `<div class="k-sec">Тактичні накладки</div><div class="k-card">` + tg("cover", "Зони прикриття ППО", "радіуси дії систем сторін, перекриття підсилюють колір", "Z") + tg("detect", "Виявлення РЛС", "дальність виявлення радіолокаційних станцій, розгортка", "R") +
      tg("vec", "Вектори загроз", "курс, маршрут до цілі й час до влучання", "V") + tg("lbl", "Підписи цілей", "позивний, тип і ETA біля кожної цілі", "B") + tg("trail", "Сліди руху", "траєкторії останніх хвилин", "T") + tg("grid", "Сітка координат", "градусна сітка з підписами на краях", "G") +
      `</div><div class="k-sec">Шари мапи</div><div class="k-card">`;
    const inputs = [...document.querySelectorAll("#layers input[type=checkbox]")];
    for (const i of inputs) { const lab = i.closest("label"); const nm = lab ? lab.textContent.trim() : i.dataset.group; h += `<label class="k-tg"><input type="checkbox" data-proxy="${inputs.indexOf(i)}" ${i.checked ? "checked" : ""}><span class="sw"></span><span class="l">${esc(nm)}</span></label>`; }
    $("cdB").innerHTML = h + `</div>`;
  }
  const OV_KEYS = ["cover", "detect", "vec", "lbl", "trail", "grid"];
  function drawerSub() {
    const a = A(), n = C.thr.filter(t => !t.carrier).length;
    switch (C.tab) {
      case "threat": return n ? n + " цілей у повітрі" : fogLive() ? "Немає виявлених цілей" : "Небо чисте";
      case "assets": return ownAssets().length + " систем ППО";
      case "objs": return (C.objRisk | 0) ? (C.objRisk | 0) + " у зоні ризику" : "Усі об'єкти під контролем";
      case "log": return C.log.length + " подій";
      case "layers": return OV_KEYS.filter(k => OV[k]).length + " із " + OV_KEYS.length + " накладок активні";
    }
    return "";
  }
  function renderDrawer(force) {
    if (!C.tab) return;
    const keepScroll = $("cdB").scrollTop;
    ({ threat: renderThreat, assets: renderAssets, objs: renderObjs, log: renderLog, layers: renderLayers })[C.tab](force);
    if (C.tab !== "log") $("cdB").scrollTop = keepScroll;
    const sub = drawerSub(), e = $("cdS"); if (e && e.textContent !== sub) e.textContent = sub;
    const dr = $("cmdDrawer"); if (!dr.classList.contains("still")) setTimeout(() => dr.classList.add("still"), 420);   // вхідна анімація — лише при відкритті
  }

  /* ------------------------------------------------------------------ інспектор */
  function setSel(s) { C.sel = s; C.sig = ""; renderInsp(); renderDrawer(true); }
  function renderInsp() {
    const el = $("cmdInsp"), a = A(), s = C.sel; if (!s) { el.classList.remove("on"); el._sid = null; return; }
    let h = "", ok = false, side = "";
    const hd = (ic, nm, sub) => `<div class="ih"><div class="ic">${ic}</div><div><b>${esc(nm)}</b><small>${esc(sub)}</small></div><button class="x" data-act="insx" aria-label="Закрити">${ico(IC.x)}</button></div>`;
    const st = (k, v, span, cls) => `<div class="is ${span ? "span" : ""}"><small>${k}</small><b class="${cls || ""}">${v}</b></div>`;
    const pill = (t, c) => `<span class="pill ${c || ""}">${t}</span>`;
    const gauge = (lb, val, pc, cls) => `<div class="kg"><div class="t"><span>${lb}</span><b>${val}</b></div><div class="k-bar"><i class="${cls || ""}" style="width:${clamp(pc, 0, 100)}%"></i></div></div>`;
    const body2 = x => `<div class="ib2">${x}</div>`;
    if (s.type === "thr") {
      const t = C.thr.find(x => x.id === s.id);
      if (t) {
        ok = true; side = t.side || "";
        const dm = (() => { let d = Infinity; for (const u of ownAssets()) { const k = fastKm(t.pos, u.pos); if (k < d) d = k; } return isFinite(d) ? d : null; })();
        const pl = t.fog ? pill(({ identified: "Розпізнано", detected: "Виявлено", lost: "Втрачено" })[t.st] || t.st, t.st === "lost" ? "warn" : "ok") : t.eta != null && t.eta < 20 ? pill("Влучання за " + fmtT(t.eta), "bad") : t.eta != null && t.eta < 60 ? pill("До цілі " + fmtT(t.eta), "warn") : pill("У польоті");
        h = hd(unitIconHtml(t), t.name, (t.side ? a.SIDE_N[t.side] + " · " : "") + t.cs) + body2(pl + `<div class="ig">` + st("Швидкість", t.spd ? t.spd + " км/год" : "—") + st("Курс", t.hdg != null ? Math.round(t.hdg) + "°" : "—") + (t.fog ? st("Упевненість", Math.round((t.conf || 0) * 100) + "%") + st("Вік даних", Math.round(t.age || 0) + " с") : st("Час до цілі", fmtT(t.eta), false, t.eta != null && t.eta < 20 ? "b" : "") + st("До ППО", fmtKm(dm))) +
          (t.from ? st("Пуск", esc(t.from.replace("Ручний запуск · ", "")), true) : "") + (t.target ? st("Ціль", esc(t.target), true) : "") + `</div>
          <div class="k-act"><button class="k-btn pri" data-act="follow">${ico(IC.target)}Супровід</button><button class="k-btn" data-act="locate">${ico(IC.map)}На мапі</button></div>`);
      }
    } else if (s.type === "ad") {
      const u = a.ADS.units.get(s.rid), T = u && a.AD_TYPES[u.key];
      if (u && T) {
        ok = true; side = u.side || "ua"; const cap = T.mag | 0, mag = u.mag | 0, pc = cap ? mag / cap * 100 : 0, dm = window.BV_DMG ? window.BV_DMG.level(u.id) : 0, mine = sides().includes(u.side || "ua"), low = cap > 0 && mag / cap < 0.34 && !(u.reserve > 0);
        const stN = ({ ready: "Готова", reload: "Перезарядка " + Math.ceil(u.rl || 0) + " с", move: "Переміщення", patrol: "Патруль", base: "На базі", transit: "Виліт", rtb: "Повернення" })[u.state] || u.state;
        h = hd(`<img src="${a.adSrc(u.key)}" alt="">`, T.n, a.SIDE_N[u.side || "ua"] + " · " + T.type) + body2(pill(esc(stN), dm ? "bad" : u.state === "ready" || u.state === "patrol" ? "ok" : low ? "warn" : "") + (cap ? gauge(T.gun ? "Боєкомплект" : "Ракети", mag + " / " + cap, pc, low ? "b" : pc < 50 ? "w" : "") : "") +
          `<div class="ig">` + st("Режим", u.mode === "manual" ? "Вручну" : "Автоматично") + st("Резерв", u.reserve === Infinity ? "∞" : (u.reserve | 0)) + st("Радіус", T.r + " км") + st("Збиття", u.kills | 0, false, (u.kills | 0) ? "g" : "") + (dm ? st("Стан техніки", "ушкоджена", true, "b") : "") + `</div>` +
          (mine ? `<div class="k-act"><button class="k-btn pri" data-act="ad-focus">${ico(IC.map)}На мапі</button><button class="k-btn" data-act="ad-reload">Перезарядка</button><button class="k-btn" data-act="ad-mode">${u.mode === "manual" ? "Автоматично" : "Вручну"}</button>` +
            (dm ? `<button class="k-btn" data-act="ad-repair">Ремонт</button>` : "") + (T.air ? `<button class="k-btn" data-act="ad-rtb">Повернути</button>` : "") + `<button class="k-btn dng" data-act="ad-remove">Зняти</button></div>` : `<div class="k-act"><button class="k-btn" data-act="ad-focus">${ico(IC.map)}На мапі</button></div>`));
      }
    } else if (s.type === "obj") {
      const o = a.OBJS[s.rid]; if (o) {
        ok = true; side = o.side; const G = a.GAME, free = G.mode === "free" || !G.obj || G.obj.length !== a.OBJS.length, hp = free ? o.hp : G.obj[o.i], f = o.hp ? clamp(hp / o.hp, 0, 1) : 1, cv = coverAt(o.c, o.side), dead = !free && hp <= 0;
        h = hd(ico(OBJ_IC[o.t] || IC.gen), o.n, a.SIDE_N[o.side] + " · " + (OBJ_N[o.t] || o.t)) + body2((dead ? pill("Знищено", "bad") : cv.n ? pill("Під прикриттям ППО", "ok") : pill("Незахищено", "warn")) +
          gauge("Міцність", dead ? "знищено" : Math.round(f * 100) + "%", dead ? 0 : f * 100, dead || f < 0.5 ? "b" : f < 0.8 ? "w" : "") + `<div class="ig">` + st("Прикриття ППО", cv.n ? cv.n + " сист. · " + Math.round(cv.v * 100) + "%" : "Незахищено", true, cv.n ? "g" : "w") + st("Координати", o.c[1].toFixed(3) + "°, " + o.c[0].toFixed(3) + "°", true) + `</div>
          <div class="k-act"><button class="k-btn pri" data-act="obj-focus">${ico(IC.map)}На мапі</button><button class="k-btn" data-act="obj-copy">${ico(IC.copy)}Копіювати координати</button></div>`);
      }
    }
    if (!ok) { C.sel = null; el.classList.remove("on"); el._sid = null; return; }
    const sid = s.type + ":" + (s.id != null ? s.id : s.rid);
    el.dataset.side = side;
    if (el._h !== h) { el.innerHTML = h; el._h = h; }
    if (el._sid !== sid) { el._sid = sid; el.classList.remove("on"); void el.offsetWidth; }   // нова картка — анімація «прицілу» грає знову
    el.classList.add("on");
  }

  /* ------------------------------------------------------------------ верхня смуга, тривога, тикер */
  function renderTop() {
    const a = A(), G = a.GAME; if (!G.on) return;
    const M = a.MODES[G.mode] || {}, c = a.gameClock();
    $("ctMode").textContent = M.n || "—";
    const ph = $("ctPh"), pre = G.phase === "prep", over = G.phase === "over" || G.over;
    ph.className = "ph" + (pre ? " prep" : over ? " over" : ""); ph.textContent = pre ? "Підготовка " + fmtT(G.prepLeft) : over ? "Завершено" : G.spec ? "Глядач" : "Бій";
    $("ctClk").textContent = a.clockHM(c); $("ctDay").textContent = "День " + a.dayOf(c) + (G.mode === "free" ? " · полігон" : "");
    const sp = $("ctSc"); sp.firstChild.textContent = Math.round(G.st.ua.pts); sp.lastChild.textContent = Math.round(G.st.ru.pts);
    const prg = $("ctPrg"); prg.style.width = isFinite(G.end) && G.end > G.start ? clamp((c - G.start) / (G.end - G.start) * 100, 0, 100) + "%" : "0%";
    const pb = document.querySelector('#gbBtns [data-s7="gmpause"]'), pp = $("ctPause"), paused = a.SIM.paused;
    pp.disabled = !pb; pp.innerHTML = ico(paused ? IC.play : IC.pause); pp.classList.toggle("paused", !!paused); pp.title = (paused ? "Продовжити" : "Пауза") + " (Пробіл)";
    const rb = document.querySelector('#gbBtns [data-s7="gmready"]'), rd = $("ctReady"); rd.style.display = rb && pre ? "" : "none";
    const my = document.querySelector("#gbMoney"), mn = $("ctMny"), tx = my ? my.textContent.replace(/\s+/g, " ").trim() : "";
    mn.style.display = tx && my.offsetParent !== undefined && tx.length < 40 ? "" : "none"; if (tx) mn.firstChild.textContent = tx;
    const lv = thrLevel(C.thr), t = $("ctThr"); t.dataset.l = lv.l; $("ctThrN").textContent = lv.n ? lv.n + (lv.eta != null ? " · " + fmtT(lv.eta) : "") : "—";
  }
  function renderAlert() {
    const a = A(), lv = thrLevel(C.thr), el = $("cmdAlert"), now = performance.now();
    if (lv.n > 0) {
      C.prevN = lv.n; C.clearUntil = 0; el.classList.remove("ok"); $("caT").textContent = "Повітряна тривога";
      $("caS").innerHTML = `<span class="k-num">${lv.n}</span> цілей${lv.eta != null ? ` · найближча <span class="k-num">${fmtT(lv.eta)}</span>` : ""}`; el.classList.add("on");
    } else if (C.prevN > 0) { C.prevN = 0; C.clearUntil = now + 5000; el.classList.add("ok", "on"); $("caT").textContent = "Відбій"; $("caS").textContent = "небо чисте"; }
    else if (C.clearUntil && now > C.clearUntil) { C.clearUntil = 0; el.classList.remove("on"); }
    else if (!C.clearUntil) el.classList.remove("on");
  }
  function renderTicker() {
    const last = C.log[C.log.length - 1];
    $("clL").className = last ? last.cat + " " + last.k : ""; $("clL").innerHTML = last ? `<i></i>${esc(last.x)}${last.n > 1 ? " ×" + last.n : ""}` : "<i></i>Подій поки немає";
    $("clC").textContent = last ? last.t : ""; $("cmdLog").classList.toggle("nw", C.logNew > 0 && C.tab !== "log"); $("clN").textContent = C.logNew;
  }

  /* ------------------------------------------------------------------ журнал подій (з шини BV_EV) */
  let logId = 1; const pend = new Map();
  function logAdd(x, cat, k, pos) {
    x = String(x || "").replace(/\s+/g, " ").trim(); if (!x) return; const a = A(), p = C.log[C.log.length - 1], now = performance.now();
    const t = a ? a.clockHM(a.gameClock()) : "";
    if (p && p.x === x && now - p.at < 3500) { p.n++; p.at = now; return; }
    C.log.push({ id: logId++, x, cat: cat || "info", k: k || "info", t, pos: pos || null, n: 1, at: now }); if (C.log.length > 600) C.log.shift();
    if (C.tab !== "log") C.logNew++;
  }
  function flash(pos, kind) { C.flashes.push({ pos, kind, t0: performance.now() }); if (C.flashes.length > 40) C.flashes.shift(); }
  function bindEvents() {
    const EV = window.BV_EV; if (!EV) return;
    EV.on("gamestart", () => { C.log = []; C.logNew = 0; C.trails.clear(); C.flashes = []; C.sel = null; C.prevN = 0; C.sig = ""; pend.clear(); logAdd("Бій розпочато", "info", "ok"); renderInsp(); });
    EV.on("gameend", () => logAdd("Бій завершено", "info", "ok"));
    EV.on("spawn", u => {
      const a = A(); if (!a || !a.GAME.on) return; const W = u.kind === "w" ? a.WEAPONS[u.key] : u.kind === "c" ? a.CARRIERS[u.key] : null; if (!W) return;
      const from = ((u.meta && u.meta.from) || "").replace("Ручний запуск · ", ""), key = u.sd + "|" + u.key + "|" + from;
      let p = pend.get(key); if (!p) { p = { n: 0, W, u, from, to: null }; pend.set(key, p); p.to = setTimeout(() => { pend.delete(key); const e = (p.u.sd === "ru" ? "РФ" : "УКР"); logAdd(`Пуск ${e}: ${p.W.n}${p.n > 1 ? " ×" + p.n : ""}${p.from ? " · " + p.from : ""}`, "launch", "launch", p.u.pos); }, 1300); }
      p.n++;
    });
    EV.on("kill", d => { const a = A(); if (!a || !d.t) return; const T = d.u && a.AD_TYPES[d.u.key]; const nm = a.WEAPONS[d.t.key] ? a.WEAPONS[d.t.key].n : (a.CARRIERS[d.t.key] ? a.CARRIERS[d.t.key].n : "ціль"); logAdd(`Збито: ${nm}${T ? " · " + T.n : ""}`, "kill", "kill", d.t.pos); flash(d.t.pos, "kill"); });
    EV.on("strike", d => { const a = A(); if (!a || !d.u) return; const W = a.WEAPONS[d.u.key]; logAdd(`Влучання: ${W ? W.n : "удар"}${d.u.meta && d.u.meta.target ? " → " + d.u.meta.target : ""}`, "hit", "hit", d.u.pos); flash(d.u.pos, "hit"); });
    EV.on("objdead", d => { flash(d.o.c, "dead"); });
    EV.on("toast", d => {
      const m = d.msg, cat = /знищено об'єкт|знищ/i.test(m) && !/збит/i.test(m) ? "obj" : /тривог/i.test(m) ? "alert" : "info";
      logAdd(m, cat, d.kind === "alert" ? "alert" : d.kind === "warn" ? "warn" : d.kind === "ok" ? "ok" : "info");
      if (d.kind === "alert" || d.kind === "warn") say(m, d.kind);
    });
    EV.on("offline", () => logAdd("Картографічний сервер недоступний — працює офлайн-підкладка з вбудованих геоданих", "info", "warn"));
  }

  /* ------------------------------------------------------------------ навігація по картах / вибору */
  function fly(pos, z) { const m = A().map; if (m && pos) m.easeTo({ center: pos, zoom: Math.max(m.getZoom(), z || 6.5), duration: 700 }); }
  function selectThreat(id, go) { const t = C.thr.find(x => String(x.id) === String(id)); if (!t) return; setSel({ type: "thr", id: t.id }); if (go) fly(t.pos, 7); }
  function selectAd(id, go) { const a = A(), u = a.ADS.units.get(+id); if (!u) return; C.sel = { type: "ad", id: "a" + u.id, rid: u.id }; if (go && window.BV_QUICK && sides().includes(u.side || "ua")) window.BV_QUICK.focus(u.id); else if (go) fly(u.pos, 7); C.sig = ""; renderInsp(); renderDrawer(true); }
  function selectObj(i, go) { const a = A(), o = a.OBJS[+i]; if (!o) return; C.sel = { type: "obj", id: "o" + o.i, rid: o.i }; if (go) fly(o.c, 7); C.sig = ""; renderInsp(); renderDrawer(true); }
  function cycleThreat(dir) {
    const rows = threatRows(); if (!rows.length) return say("Немає виявлених цілей", "warn");
    let i = C.sel && C.sel.type === "thr" ? rows.findIndex(r => r.id === C.sel.id) : -1; i = (i + dir + rows.length) % rows.length; selectThreat(rows[i].id, true);
  }
  function overview() { const m = A().map; if (m) m.easeTo({ center: [32.2, 49.6], zoom: window.innerWidth < 700 ? 4.3 : 5.2, duration: 900 }); }

  /* ------------------------------------------------------------------ палітра пошуку */
  function palItems(q) {
    const a = A(), out = []; q = q.trim().toLowerCase();
    const m = (s) => !q || s.toLowerCase().includes(q);
    const acts = [["Обстановка", "1", () => openTab("threat"), IC.threat], ["Техніка", "2", () => openTab("assets"), IC.assets], ["Об'єкти", "3", () => openTab("objs"), IC.objs], ["Журнал", "4", () => openTab("log"), IC.log], ["Шари мапи", "5", () => openTab("layers"), IC.layers], ["Загальний вид", "Home", overview, IC.map], ["Гарячі клавіші", "?", () => toggleKeys(true), IC.help]];
    for (const [n, k, f, ic] of acts) if (m(n)) out.push({ n, s: "", k, f, g: "Команди", ic });
    for (const t of C.thr) if (m(t.name + " " + t.cs + " " + t.from + " " + t.target)) out.push({ n: t.name + " · " + t.cs, s: t.eta != null ? fmtT(t.eta) : "", f: () => { selectThreat(t.id, true); }, g: "Цілі", ic: IC.threat });
    for (const u of ownAssets()) { const T = a.AD_TYPES[u.key]; if (T && m(T.n + " " + (u.post || ""))) out.push({ n: T.n + (u.post ? " · " + u.post : ""), s: "", f: () => { openTab("assets"); selectAd(u.id, true); }, g: "Техніка", ic: IC.assets }); }
    if (q.length > 1) for (const o of a.OBJS) { if (out.length > 40) break; if (m(o.n)) out.push({ n: o.n, s: OBJ_N[o.t] || "об'єкт", f: () => { selectObj(o.i, true); }, g: "Об'єкти", ic: OBJ_IC[o.t] || IC.gen }); }
    return out.slice(0, 40);
  }
  let palSel = 0, palList = [];
  function palRender() {
    palList = palItems($("kpIn").value); palSel = clamp(palSel, 0, Math.max(0, palList.length - 1));
    let h = "", g = null;
    palList.forEach((r, i) => { if (r.g !== g) { g = r.g; h += `<div class="gh">${g}</div>`; } h += `<div class="it ${i === palSel ? "sel" : ""}" data-pi="${i}">${ico(r.ic || IC.gen)}<span class="nn">${esc(r.n)}</span>${r.s ? `<small>${esc(r.s)}</small>` : ""}${r.k ? `<kbd>${r.k}</kbd>` : ""}</div>`; });
    $("kpR").innerHTML = h || `<div class="k-empty">Нічого не знайдено</div>`;
    const sel = $("kpR").querySelector(".it.sel"); if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: "nearest" });
  }
  function togglePal(on) { const p = $("cmdPal"); on = on == null ? !p.classList.contains("on") : on; p.classList.toggle("on", on); if (!on) $("kpIn").blur(); if (on) { $("kpIn").value = ""; palSel = 0; palRender(); setTimeout(() => $("kpIn").focus(), 20); } }
  function toggleKeys(on) { const p = $("cmdKeys"); on = on == null ? !p.classList.contains("on") : on; p.classList.toggle("on", on); }

  /* ------------------------------------------------------------------ події інтерфейсу */
  function proxyClick(sel) { const b = document.querySelector(sel); if (b) { b.click(); return true; } return false; }
  function wire() {
    root.addEventListener("click", e => {
      const t = e.target;
      const rb = t.closest("#cmdRail [data-tab]"); if (rb) return openTab(rb.dataset.tab);
      const ac = t.closest("[data-act]"), act = ac && ac.dataset.act;
      if (act === "close") return openTab(C.tab);
      if (act === "help") return toggleKeys(true);
      if (act === "insx") return setSel(null);
      if (act === "mini") { C.mini = false; lsSet("cmd.mini", "0"); applyMini(); return; }
      if (act === "locate") { const t2 = C.thr.find(x => x.id === C.sel.id); if (t2) fly(t2.pos, 7.5); return; }
      if (act === "follow") { const s = C.sel; if (s && s.type === "thr" && window.BV_FOLLOW && typeof s.id === "number") window.BV_FOLLOW.start(s.id); else say("Супровід доступний для цілей, що йдуть у вашому полі зору", "warn"); return; }
      if (act === "ad-focus") { const s = C.sel; if (s) { if (window.BV_QUICK && window.BV_QUICK.focus(s.rid)) return; const u = A().ADS.units.get(s.rid); if (u) fly(u.pos, 7.5); } return; }
      if (act && act.startsWith("ad-") && C.sel && C.sel.type === "ad" && window.BV_QUICK) {
        const id = C.sel.rid, u = A().ADS.units.get(id); if (!u) return; const Q = window.BV_QUICK;
        const ok = act === "ad-reload" ? Q.order(id, "reload") : act === "ad-mode" ? Q.order(id, "mode", u.mode === "manual" ? "auto" : "manual") : act === "ad-repair" ? Q.order(id, "repair") : act === "ad-rtb" ? Q.order(id, "rtb") : act === "ad-remove" ? Q.order(id, "remove") : false;
        if (act === "ad-remove" && ok) setSel(null); if (!ok) say("Команду зараз виконати неможливо", "warn"); C.sig = ""; renderInsp(); return;
      }
      if (act === "keysx") return toggleKeys(false);
      if (act === "obj-copy") { const o = A().OBJS[C.sel.rid]; if (o) { const txt = o.c[1].toFixed(5) + ", " + o.c[0].toFixed(5); (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => say("Координати скопійовано: " + txt, "ok"), () => say("Не вдалося скопіювати координати", "warn")); } return; }
      const pre = t.closest("[data-pre]"); if (pre) { const P = PRESETS[pre.dataset.pre]; for (const k of OV_KEYS) { OV[k] = !!P[k]; lsSet("cmd." + k, OV[k] ? "1" : "0"); } C.sig = ""; renderLayers(); say("Пресет: " + pre.textContent.trim(), "info"); return; }
      if (act === "obj-focus") { const o = A().OBJS[C.sel.rid]; if (o) fly(o.c, 7.5); return; }
      if (act === "logcopy") { const txt = C.log.map(e => e.t + "  " + e.x + (e.n > 1 ? " ×" + e.n : "")).join("\n"); (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => say("Журнал скопійовано", "ok"), () => say("Не вдалося скопіювати", "warn")); return; }
      if (act === "logsave") { const txt = C.log.map(e => e.t + "  " + e.x + (e.n > 1 ? " ×" + e.n : "")).join("\n"), l = document.createElement("a"); l.href = URL.createObjectURL(new Blob([txt], { type: "text/plain;charset=utf-8" })); l.download = "skydominion-log.txt"; l.click(); setTimeout(() => URL.revokeObjectURL(l.href), 2000); return; }
      if (act === "logclr") { C.log = []; C.logNew = 0; C.sig = ""; renderDrawer(true); renderTicker(); return; }
      const thf = t.closest("[data-thf]"); if (thf) { C.thrFilter = thf.dataset.thf; C.sig = ""; return renderDrawer(true); }
      const ths = t.closest("[data-ths]"); if (ths) { C.thrSort = ths.dataset.ths; C.sig = ""; return renderDrawer(true); }
      const asf = t.closest("[data-asf]"); if (asf) { C.assetFilter = asf.dataset.asf; C.sig = ""; return renderDrawer(true); }
      const obf = t.closest("[data-obf]"); if (obf) { C.objFilter = obf.dataset.obf; C.sig = ""; return renderDrawer(true); }
      const lgf = t.closest("[data-lgf]"); if (lgf) { C.logFilter = lgf.dataset.lgf; C.sig = ""; return renderDrawer(true); }
      const tr = t.closest("[data-thr]"); if (tr) return selectThreat(tr.dataset.thr.match(/^\d+$/) ? +tr.dataset.thr : tr.dataset.thr, true);
      const as = t.closest("[data-ast]"); if (as) return selectAd(as.dataset.ast, true);
      const ob = t.closest("[data-obj]"); if (ob) return selectObj(ob.dataset.obj, true);
      const lg = t.closest("[data-lg]"); if (lg) { const e2 = C.log.find(x => x.id === +lg.dataset.lg); if (e2 && e2.pos) fly(e2.pos, 7); return; }
      const pi = t.closest("[data-pi]"); if (pi) { const r = palList[+pi.dataset.pi]; togglePal(false); r && r.f(); return; }
      if (t.id === "cmdPal") return togglePal(false); if (t.id === "cmdKeys") return toggleKeys(false);
      if (t.closest("#cmdAlert")) { cycleThreat(1); return; }
      if (t.closest("#clH")) return openTab("log");
      if (t.closest("#ctSearch")) return togglePal(true);
      if (t.closest("#ctPause")) return void proxyClick('#gbBtns [data-s7="gmpause"]');
      if (t.closest("#ctReady")) return void proxyClick('#gbBtns [data-s7="gmready"]');
      if (t.closest("#ctMore")) return toggleMenu();
      if (t.closest("#cmdMiniOpen")) { C.mini = true; lsSet("cmd.mini", "1"); applyMini(); return; }
      const mi = t.closest("[data-gb]"); if (mi) { const b = [...document.querySelectorAll("#gbBtns > button")][+mi.dataset.gb]; toggleMenu(false); if (b) b.click(); return; }
      if (t.closest("[data-mfs]")) { toggleMenu(false); try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); } catch (er) { /* */ } return; }
    });
    root.addEventListener("input", e => {
      if (e.target.id === "cdQ") { C.objQ = e.target.value; C.sig = ""; renderObjs(true); } else if (e.target.id === "cdLQ") { C.logQ = e.target.value; C.sig = ""; renderLog(true); } else if (e.target.id === "kpIn") { palSel = 0; palRender(); }
    });
    root.addEventListener("change", e => {
      const t = e.target, ov = t.dataset && t.dataset.ov;
      if (ov) { OV[ov] = t.checked; lsSet("cmd." + ov, t.checked ? "1" : "0"); C.sig = ""; return; }
      if (t.dataset && t.dataset.proxy != null) { const i = [...document.querySelectorAll("#layers input[type=checkbox]")][+t.dataset.proxy]; if (i) { i.checked = t.checked; i.dispatchEvent(new Event("change", { bubbles: true })); } }
    });
    root.addEventListener("mouseover", e => { const r = e.target.closest("[data-thr]"); C.hover = r ? r.dataset.thr : null; });
    root.addEventListener("mouseleave", () => { C.hover = null; });
    $("kpIn").addEventListener("keydown", e => {
      if (e.key === "ArrowDown") { palSel = Math.min(palSel + 1, palList.length - 1); palRender(); e.preventDefault(); } else if (e.key === "ArrowUp") { palSel = Math.max(0, palSel - 1); palRender(); e.preventDefault(); }
      else if (e.key === "Enter") { const r = palList[palSel]; togglePal(false); r && r.f(); } else if (e.key === "Escape") togglePal(false);
      e.stopPropagation();
    });
    document.addEventListener("keydown", onKey, true);
    // наведення на цілі на мапі
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("click", onMapClick, true);
    miniWire();
  }
  function toggleMenu(on) {
    const m = $("cmdMenu"); on = on == null ? !m.classList.contains("on") : on; m.classList.toggle("on", on); $("ctMore").classList.toggle("on", on); if (!on) return;
    const bs = [...document.querySelectorAll("#gbBtns > button")]; let h = "";
    bs.forEach((b, i) => { const s = b.dataset.s7 || ""; if (s === "gmpause" || s === "gmready") return; const nm = (b.title || b.textContent || "").replace(/\s+/g, " ").trim(); if (!nm) return; h += `<button data-gb="${i}" class="${s === "gmsurr" ? "warn" : ""}">${ico(/surr/.test(s) ? IC.flag : /chat/.test(s) ? IC.chat : /stat/.test(s) ? IC.stat : IC.gen)}${esc(nm)}</button>`; });
    h += (h ? "<hr>" : "") + `<button data-mfs="1">${ico(IC.fs)}Повний екран</button>`; m.innerHTML = h;
  }
  document.addEventListener("click", e => { const m = $("cmdMenu"); if (m && m.classList.contains("on") && !e.target.closest("#cmdMenu,#ctMore")) toggleMenu(false); }, true);

  function onKey(e) {
    if (!body.classList.contains("s7-game") || e.ctrlKey && e.key.toLowerCase() !== "k" || e.altKey) return;
    const tg = e.target, typing = tg && (/^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName) || tg.isContentEditable);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); e.stopPropagation(); return togglePal(); }
    if (typing) return;
    const k = e.key;
    if (k === "Escape") { if ($("cmdPal").classList.contains("on")) { togglePal(false); } else if ($("cmdKeys").classList.contains("on")) toggleKeys(false); else if (C.sel) setSel(null); else if (C.tab) openTab(C.tab); else return; return; }
    if ($("cmdPal").classList.contains("on")) return;
    const lk = k.toLowerCase(), pre = () => { e.preventDefault(); e.stopPropagation(); };
    if (k === " ") { if (proxyClick('#gbBtns [data-s7="gmpause"]')) pre(); } else if (k === "1") { pre(); openTab("threat"); } else if (k === "2") { pre(); openTab("assets"); } else if (k === "3") { pre(); openTab("objs"); } else if (k === "4") { pre(); openTab("log"); } else if (k === "5") { pre(); openTab("layers"); }
    else if (k === "/" ) { pre(); togglePal(true); } else if (k === "?") { pre(); toggleKeys(); } else if (k === "]") { pre(); cycleThreat(1); } else if (k === "[") { pre(); cycleThreat(-1); }
    else if (lk === "n") { pre(); const r = threatRows()[0]; r ? selectThreat(r.id, true) : say("Немає виявлених цілей", "warn"); }
    else if (lk === "f") { pre(); if (C.sel && C.sel.type === "thr" && typeof C.sel.id === "number" && window.BV_FOLLOW) window.BV_FOLLOW.start(C.sel.id); else say("Оберіть ціль у списку обстановки", "warn"); }
    else if (k === "Home") { pre(); overview(); }
    else if (lk === "g") { pre(); tgl("grid"); } else if (lk === "z") { pre(); tgl("cover"); } else if (lk === "r") { pre(); tgl("detect"); } else if (lk === "v") { pre(); tgl("vec"); } else if (lk === "t") { pre(); tgl("trail"); }
    else if (lk === "m") { pre(); C.mini = !C.mini; lsSet("cmd.mini", C.mini ? "1" : "0"); applyMini(); }
    else if (lk === "b") { pre(); tgl("lbl"); }
    else if (lk === "c") { pre(); const p = selPos(); if (p) fly(p, 7.5); else say("Спершу оберіть ціль, техніку або об'єкт", "warn"); }
    else if (k === "+" || k === "=") { pre(); const m = A().map; if (m) m.easeTo({ zoom: m.getZoom() + 1, duration: 260 }); }
    else if (k === "-" || k === "_" || k === "−") { pre(); const m = A().map; if (m) m.easeTo({ zoom: m.getZoom() - 1, duration: 260 }); }
  }
  function selPos() {
    const s = C.sel, a = A(); if (!s) return null;
    if (s.type === "thr") { const t = C.thr.find(x => x.id === s.id); return t ? t.pos : null; }
    if (s.type === "ad") { const u = a.ADS.units.get(s.rid); return u ? u.pos : null; }
    if (s.type === "obj") { const o = a.OBJS[s.rid]; return o ? o.c : null; }
    return null;
  }
  function tgl(k) { OV[k] = !OV[k]; lsSet("cmd." + k, OV[k] ? "1" : "0"); C.sig = ""; if (C.tab === "layers") renderLayers(); say((OV[k] ? "Увімкнено: " : "Вимкнено: ") + ({ grid: "сітка координат", cover: "зони прикриття ППО", detect: "виявлення РЛС", vec: "вектори загроз", trail: "сліди руху", lbl: "підписи цілей" })[k], "info"); }

  /* наведення / клацання по цілях на мапі */
  function nearestHit(x, y, r) { let best = null, bd = r * r; for (const h of C.hit) { const d = (h.x - x) * (h.x - x) + (h.y - y) * (h.y - y); if (d < bd) { bd = d; best = h; } } return best; }
  function onMove(e) {
    if (!body.classList.contains("s7-game")) return; const tip = $("cmdTip");
    if (e.target.closest && e.target.closest("#cmd .k-pn,.hud,.panel")) { tip.classList.remove("on"); return; }
    const h = nearestHit(e.clientX, e.clientY, 14);
    if (!h) { tip.classList.remove("on"); return; }
    const t = C.thr.find(x => x.id === h.id); if (!t) return;
    tip.innerHTML = `<b>${esc(t.name)}</b><small>${t.cs} · ${t.spd ? t.spd + " км/год · " : ""}${t.eta != null ? "до цілі " + fmtT(t.eta) : t.fog ? Math.round((t.conf || 0) * 100) + "%" : ""}</small>`;
    tip.style.left = e.clientX + "px"; tip.style.top = e.clientY + "px"; tip.classList.add("on");
  }
  function onMapClick(e) {
    if (!body.classList.contains("s7-game") || (e.target.closest && e.target.closest("#cmd .k-pn,.hud,.panel"))) return;
    const h = nearestHit(e.clientX, e.clientY, 16); if (h) { const t = C.thr.find(x => x.id === h.id); if (t) { C.sel = { type: "thr", id: t.id }; C.sig = ""; renderInsp(); renderDrawer(true); } }
  }

  /* ------------------------------------------------------------------ оверлей карти (canvas) */
  let ovc = null, g = null, W = 0, H = 0, dpr = 1;
  function sizeOv() { ovc = $("cmdOv"); dpr = Math.min(window.devicePixelRatio || 1, 2); W = window.innerWidth; H = window.innerHeight; ovc.width = Math.round(W * dpr); ovc.height = Math.round(H * dpr); ovc.style.width = W + "px"; ovc.style.height = H + "px"; g = ovc.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); }
  const SIDE_COL = { ua: [77, 163, 255], ru: [255, 91, 77] };
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  function kmToPx(map, c, km) { const p0 = map.project(c), p1 = map.project([c[0] + km / (111.32 * Math.cos(c[1] * D2R)), c[1]]); return Math.abs(p1.x - p0.x); }

  function drawGrid(map) {
    const z = map.getZoom(), step = z < 4.2 ? 10 : z < 5.6 ? 5 : z < 7.2 ? 2 : z < 9 ? 1 : 0.5;
    const b = map.getBounds(), w = b.getWest(), e = b.getEast(), s = b.getSouth(), n = b.getNorth();
    g.save(); g.lineWidth = 1; g.strokeStyle = "rgba(160,186,224,.07)"; g.fillStyle = "rgba(160,190,235,.42)"; g.font = "600 10px ui-monospace,Menlo,monospace";
    g.beginPath();
    for (let lo = Math.ceil(w / step) * step; lo <= e; lo += step) { const a = map.project([lo, n]), c = map.project([lo, s]); g.moveTo(Math.round(a.x) + .5, 0); g.lineTo(Math.round(c.x) + .5, H); }
    for (let la = Math.ceil(s / step) * step; la <= n; la += step) { const a = map.project([w, la]); g.moveTo(0, Math.round(a.y) + .5); g.lineTo(W, Math.round(a.y) + .5); }
    g.stroke();
    const topPad = 64, botPad = 44;
    for (let lo = Math.ceil(w / step) * step; lo <= e; lo += step) { const p = map.project([lo, (n + s) / 2]); g.fillText(lo.toFixed(step < 1 ? 1 : 0) + "°E", p.x + 4, H - botPad - 6); }
    for (let la = Math.ceil(s / step) * step; la <= n; la += step) { const p = map.project([(w + e) / 2, la]); if (p.y > topPad && p.y < H - botPad) g.fillText(la.toFixed(step < 1 ? 1 : 0) + "°N", W - 104, p.y - 4); }
    g.restore();
  }
  function drawCoverage(map, t) {
    const a = A(), ads = allAD(), vs = viewSide(); if (!ads.length) return;
    const many = ads.length > 120; g.save();
    for (const pass of [0, 1]) {
      g.globalCompositeOperation = pass === 0 ? "lighter" : "source-over";
      for (const u of ads) {
        const T = a.AD_TYPES[u.key]; if (!T || !T.r || T.air || T.drone) continue; const sd = u.side || "ua"; if (vs && sd !== vs && !fogShown(sd)) continue;
        const c = u.pos, p = map.project(c), r = kmToPx(map, c, T.r); if (r < 3 || p.x < -r || p.y < -r || p.x > W + r || p.y > H + r) continue; const col = SIDE_COL[sd] || SIDE_COL.ua;
        if (pass === 0 && !many) { const gr = g.createRadialGradient(p.x, p.y, r * 0.15, p.x, p.y, r); gr.addColorStop(0, rgba(col, .0)); gr.addColorStop(.7, rgba(col, .05)); gr.addColorStop(1, rgba(col, .13)); g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.fill(); }
        if (pass === 1) { const sel = C.sel && C.sel.type === "ad" && C.sel.rid === u.id; g.strokeStyle = rgba(col, sel ? .95 : .38); g.lineWidth = sel ? 1.8 : 1; g.setLineDash(sel ? [] : [5, 5]); g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.stroke(); }
      }
    }
    g.restore();
  }
  const fogShown = sd => !fogLive();
  function drawDetect(map, t) {
    const a = A(), vs = viewSide(), rd = (a.GAME.on && typeof a.radars === "function") ? a.radars() : []; if (!rd.length) return; g.save();
    for (const r of rd) {
      if (vs && r.side !== vs) continue; const km = r.range; if (!km || (r.st && r.st.status === "destroyed")) continue; const p = map.project(r.c), pr = kmToPx(map, r.c, km); if (pr < 4) continue; const col = [70, 210, 255];
      g.strokeStyle = rgba(col, .5); g.lineWidth = 1; g.setLineDash([2, 4]); g.beginPath(); g.arc(p.x, p.y, pr, 0, 7); g.stroke(); g.setLineDash([]);
      const ang = (t / 2600 + r.c[0] * 3) % 1 * Math.PI * 2, wd = 0.55; const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, pr); gr.addColorStop(0, rgba(col, .0)); gr.addColorStop(1, rgba(col, .22));
      g.fillStyle = gr; g.beginPath(); g.moveTo(p.x, p.y); g.arc(p.x, p.y, pr, ang - wd, ang); g.closePath(); g.fill();
      g.strokeStyle = rgba(col, .7); g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + Math.cos(ang) * pr, p.y + Math.sin(ang) * pr); g.stroke();
    }
    g.restore();
  }
  function drawVectors(map, t) {
    const a = A(), z = map.getZoom(); C.hit = []; g._lb = new Set(); g.save(); g.font = "700 10px ui-monospace,Menlo,monospace"; g.textBaseline = "middle";
    for (const th of C.thr) {
      const p = map.project(th.pos); if (p.x < -40 || p.y < -40 || p.x > W + 40 || p.y > H + 40) continue; C.hit.push({ x: p.x, y: p.y, id: th.id });
      const col = th.side ? SIDE_COL[th.side] : [255, 190, 60], sel = C.sel && C.sel.type === "thr" && C.sel.id === th.id, hov = C.hover != null && String(C.hover) === String(th.id), hot = sel || hov;
      // маршрут до цілі
      if (OV.vec && th.end && !th.carrier && (hot || z > 4.6 || th.eta != null && th.eta < 90)) {
        const q = map.project(th.end); g.strokeStyle = rgba(col, hot ? .85 : .32); g.lineWidth = hot ? 1.6 : 1; g.setLineDash([6, 6]); g.lineDashOffset = -(t / 60) % 12; g.beginPath(); g.moveTo(p.x, p.y);
        const u = th.u; if (hot && u && u.pts && u.pts.length > 2 && u.pts.length < 400) { let started = false; for (let i = Math.max(0, u.seg | 0); i < u.pts.length; i++) { const pp = map.project(u.pts[i]); g.lineTo(pp.x, pp.y); started = true; } } else g.lineTo(q.x, q.y);
        g.stroke(); g.setLineDash([]);
        g.strokeStyle = rgba(col, .8); g.lineWidth = 1.2; g.beginPath(); g.arc(q.x, q.y, 5, 0, 7); g.moveTo(q.x - 8, q.y); g.lineTo(q.x - 3, q.y); g.moveTo(q.x + 3, q.y); g.lineTo(q.x + 8, q.y); g.moveTo(q.x, q.y - 8); g.lineTo(q.x, q.y - 3); g.moveTo(q.x, q.y + 3); g.lineTo(q.x, q.y + 8); g.stroke();
      }
      // вектор швидкості
      if (OV.vec && th.hdg != null && th.spd > 0) { const L = clamp(th.spd / 20, 14, 44), h = th.hdg * D2R; g.strokeStyle = rgba(col, .95); g.lineWidth = 1.5; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + Math.sin(h) * L, p.y - Math.cos(h) * L); g.stroke(); }
      // кільце загрози
      if (th.eta != null && th.eta < 30 && !th.carrier) { const k = (t / 500) % 1; g.strokeStyle = `rgba(255,77,63,${.7 * (1 - k)})`; g.lineWidth = 1.5; g.beginPath(); g.arc(p.x, p.y, 10 + k * 14, 0, 7); g.stroke(); }
      if (hot) { g.strokeStyle = "#f2b53c"; g.lineWidth = 1.6; const r = 13; g.beginPath(); for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { g.moveTo(p.x + dx * r, p.y + dy * (r - 5)); g.lineTo(p.x + dx * r, p.y + dy * r); g.lineTo(p.x + dx * (r - 5), p.y + dy * r); } g.stroke(); }
      // підпис
      const cellK = Math.round(p.x / 70) + "," + Math.round(p.y / 22);
      if (OV.lbl && (z >= 5.6 || hot) && (hot || !g._lb.has(cellK))) { g._lb.add(cellK); const txt = th.cs + (th.eta != null ? " " + fmtT(th.eta) : ""), w = g.measureText(txt).width + 10; g.fillStyle = "rgba(4,8,15,.78)"; g.fillRect(p.x + 12, p.y - 24, w, 15); g.strokeStyle = rgba(col, .6); g.lineWidth = 1; g.strokeRect(p.x + 12.5, p.y - 23.5, w, 15); g.fillStyle = hot ? "#ffd98a" : "#e8f0ff"; g.fillText(txt, p.x + 17, p.y - 16.5); }
    }
    g.restore();
  }
  function trackTrails(t) {
    if (!OV.trail) { if (C.trails.size) C.trails.clear(); return; }
    const live = new Set();
    for (const th of C.thr) { if (th.fog) continue; live.add(th.id); let tr = C.trails.get(th.id); if (!tr) { tr = { pts: [], t: 0, side: th.side }; C.trails.set(th.id, tr); } if (t - tr.t > 700) { tr.t = t; tr.pts.push(th.pos.slice()); if (tr.pts.length > 40) tr.pts.shift(); } }
    for (const k of C.trails.keys()) if (!live.has(k)) { const tr = C.trails.get(k); tr.dead = (tr.dead || t) ; if (t - tr.dead > 4000) C.trails.delete(k); }
  }
  function drawTrails(map) {
    if (!OV.trail) return; g.save(); g.lineWidth = 1.4;
    for (const [id, tr] of C.trails) { if (tr.pts.length < 2) continue; const col = tr.side ? SIDE_COL[tr.side] : [255, 190, 60]; const n = tr.pts.length; for (let i = 1; i < n; i++) { const a = map.project(tr.pts[i - 1]), b = map.project(tr.pts[i]); g.strokeStyle = rgba(col, .12 + .5 * i / n); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); } }
    g.restore();
  }
  function drawFlashes(map, t) {
    const keep = []; g.save();
    for (const f of C.flashes) { const k = (t - f.t0) / (f.kind === "dead" ? 1800 : 1100); if (k >= 1) continue; keep.push(f); const p = map.project(f.pos); if (p.x < -50 || p.y < -50 || p.x > W + 50 || p.y > H + 50) continue;
      const col = f.kind === "kill" ? [53, 220, 150] : f.kind === "dead" ? [217, 119, 255] : [255, 77, 63], r = 6 + k * (f.kind === "dead" ? 46 : 28); g.strokeStyle = rgba(col, 1 - k); g.lineWidth = 2 * (1 - k) + .5; g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.stroke();
      if (f.kind === "kill") { const s = 5 * (1 - k * .5); g.beginPath(); g.moveTo(p.x - s, p.y - s); g.lineTo(p.x + s, p.y + s); g.moveTo(p.x + s, p.y - s); g.lineTo(p.x - s, p.y + s); g.stroke(); } }
    C.flashes = keep; g.restore();
  }
  function drawSelRing(map, t) {
    const s = C.sel; if (!s || s.type === "thr") return; let c = null; if (s.type === "ad") { const u = A().ADS.units.get(s.rid); c = u && u.pos; } else if (s.type === "obj") { const o = A().OBJS[s.rid]; c = o && o.c; } if (!c) return;
    const p = map.project(c), k = (t / 900) % 1; g.save(); g.strokeStyle = "#f2b53c"; g.lineWidth = 1.6; g.beginPath(); g.arc(p.x, p.y, 16, 0, 7); g.stroke(); g.globalAlpha = 1 - k; g.beginPath(); g.arc(p.x, p.y, 16 + k * 14, 0, 7); g.stroke(); g.restore();
  }
  let lastDraw = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    if (!body.classList.contains("s7-game") || !C.ready) return; const a = A(), map = a && a.map; if (!map || !g) return;
    if (t - lastDraw < 32) return; lastDraw = t;
    if (W !== window.innerWidth || H !== window.innerHeight) sizeOv();
    g.clearRect(0, 0, W, H);
    try {
      if (OV.grid) drawGrid(map); if (OV.cover) drawCoverage(map, t); if (OV.detect) drawDetect(map, t); drawTrails(map); drawVectors(map, t); drawFlashes(map, t); drawSelRing(map, t);
    } catch (e) { if (!frame.err) { frame.err = 1; console.error("cmd overlay", e); } }
    drawMini(t);
  }

  /* ------------------------------------------------------------------ мінікарта */
  const MB = { lon0: 21, lon1: 50.5, lat0: 43.2, lat1: 56.8 }; let mini = null, miniBg = null, mw = 0, mh = 0;
  const mY = lat => Math.log(Math.tan(Math.PI / 4 + lat * D2R / 2));
  const mxy = p => [(p[0] - MB.lon0) / (MB.lon1 - MB.lon0) * mw, (1 - (mY(p[1]) - mY(MB.lat0)) / (mY(MB.lat1) - mY(MB.lat0))) * mh];
  const mll = (x, y) => [MB.lon0 + x / mw * (MB.lon1 - MB.lon0), (2 * Math.atan(Math.exp(mY(MB.lat0) + (1 - y / mh) * (mY(MB.lat1) - mY(MB.lat0)))) - Math.PI / 2) / D2R];
  function miniStatic() {
    const cv = $("cmdMiniC"), r = $("cmdMini").getBoundingClientRect(); mw = Math.max(40, Math.round(r.width)); mh = Math.max(40, Math.round(r.height)); const d = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = mw * d; cv.height = mh * d; mini = cv.getContext("2d"); mini.setTransform(d, 0, 0, d, 0, 0);
    const bg = document.createElement("canvas"); bg.width = mw * d; bg.height = mh * d; const b = bg.getContext("2d"); b.setTransform(d, 0, 0, d, 0, 0);
    b.fillStyle = "#050c18"; b.fillRect(0, 0, mw, mh);
    let geo = null; try { geo = BV; } catch (e) { /* */ }
    const poly = (feat, fill, stroke, lw) => { if (!feat) return; const fs = feat.features || [feat]; for (const f of fs) { const gm = f.geometry; if (!gm) continue; const polys = gm.type === "Polygon" ? [gm.coordinates] : gm.type === "MultiPolygon" ? gm.coordinates : []; const lines = gm.type === "LineString" ? [gm.coordinates] : gm.type === "MultiLineString" ? gm.coordinates : [];
        for (const pg of polys) { b.beginPath(); for (const ring of pg) { ring.forEach((c, i) => { const q = mxy(c); i ? b.lineTo(q[0], q[1]) : b.moveTo(q[0], q[1]); }); b.closePath(); } if (fill) { b.fillStyle = fill; b.fill("evenodd"); } if (stroke) { b.strokeStyle = stroke; b.lineWidth = lw || 1; b.stroke(); } }
        for (const ln of lines) { b.beginPath(); ln.forEach((c, i) => { const q = mxy(c); i ? b.lineTo(q[0], q[1]) : b.moveTo(q[0], q[1]); }); b.strokeStyle = stroke; b.lineWidth = lw || 1; b.stroke(); } } };
    if (geo) { poly(geo.mask, "rgba(120,140,170,.10)", "rgba(140,170,220,.18)", .6); poly(geo.uaOutline, "rgba(61,155,255,.14)", "rgba(61,155,255,.8)", 1); poly(geo.ruOutline, "rgba(255,77,63,.07)", "rgba(255,77,63,.45)", .8); poly(geo.occupied, "rgba(255,77,63,.32)", null); poly(geo.front, null, "rgba(255,200,61,.95)", 1.3); }
    miniBg = bg;
  }
  function drawMini(t) {
    if (!C.mini || !body.classList.contains("s7-game")) return; const cv = $("cmdMiniC"), r = $("cmdMini").getBoundingClientRect(); if (!r.width) return;
    if (!mini || Math.abs(r.width - mw) > 2 || Math.abs(r.height - mh) > 2 || !miniBg) miniStatic();
    const a = A(), m = mini; m.clearRect(0, 0, mw, mh); m.drawImage(miniBg, 0, 0, mw, mh);
    // засоби ППО та об'єкти
    for (const u of allAD()) { const T = a.AD_TYPES[u.key]; if (!T || T.air) continue; const q = mxy(u.pos); m.fillStyle = (u.side || "ua") === "ru" ? "#ff6a5e" : "#5fb0ff"; m.fillRect(q[0] - 1, q[1] - 1, 2, 2); }
    for (const th of C.thr) { const q = mxy(th.pos), col = th.side === "ua" ? "#5fb0ff" : th.side === "ru" ? "#ff4d3f" : "#ffbe3c"; m.fillStyle = col; m.beginPath(); m.arc(q[0], q[1], th.carrier ? 2.4 : 1.8, 0, 7); m.fill(); if (th.eta != null && th.eta < 30) { m.strokeStyle = "rgba(255,77,63,.7)"; m.beginPath(); m.arc(q[0], q[1], 3 + (t / 120) % 4, 0, 7); m.stroke(); } }
    for (const f of C.flashes) { const q = mxy(f.pos); m.strokeStyle = f.kind === "kill" ? "#35dc96" : "#ff4d3f"; m.beginPath(); m.arc(q[0], q[1], 2 + ((performance.now() - f.t0) / 140) % 6, 0, 7); m.stroke(); }
    // видима область
    const map = a.map; if (map) { const b = map.getBounds(), p0 = mxy([b.getWest(), b.getNorth()]), p1 = mxy([b.getEast(), b.getSouth()]); m.strokeStyle = "#f2b53c"; m.lineWidth = 1.2; m.strokeRect(Math.max(.5, p0[0]), Math.max(.5, p0[1]), Math.min(mw - 1, p1[0]) - Math.max(.5, p0[0]), Math.min(mh - 1, p1[1]) - Math.max(.5, p0[1])); }
  }
  function miniWire() {
    const cv = $("cmdMiniC"); let drag = false;
    const go = e => { const r = cv.getBoundingClientRect(), p = mll(e.clientX - r.left, e.clientY - r.top), map = A().map; if (map) map.jumpTo({ center: p }); };
    cv.addEventListener("pointerdown", e => { drag = true; cv.setPointerCapture(e.pointerId); go(e); }); cv.addEventListener("pointermove", e => { if (drag) go(e); }); cv.addEventListener("pointerup", () => { drag = false; });
  }
  function applyMini() { body.classList.toggle("k-nomini", !C.mini); const o = $("cmdMiniOpen"); o.style.display = C.mini ? "none" : ""; }

  /* ------------------------------------------------------------------ головний цикл */
  let tickN = 0;
  function syncTips() {
    document.querySelectorAll("#controls .btn").forEach(b => { const t = b.getAttribute("aria-label") || b._tip || ""; if (t) { b.dataset.tip = t; if (b.title) { b._tip = b.title; b.removeAttribute("title"); } } else if (b.title) { b._tip = b.title; b.dataset.tip = b.title; b.removeAttribute("title"); } });
  }
  function tick() {
    if (!body.classList.contains("s7-game")) return; const a = A(); if (!a || !a.GAME.on) return;
    C.thr = collectThreats(); C.thr.forEach(t => { if (t.fog) t.cs = t.cs; });
    syncTips(); renderTop(); renderAlert(); renderTicker(); updBadges();
    if (C.tab && (tickN % 2 === 0 || C.tab === "threat")) renderDrawer(false);
    if (C.sel) { if (C.sel.type === "thr" && !C.thr.some(t => t.id === C.sel.id)) { setSel(null); } else if (tickN % 2 === 0) renderInsp(); }
    tickN++;
  }
  function init() {
    if (C.ready) return; if (!window.BV_API || !A().map || !$("map")) return setTimeout(init, 300);
    if (window.S7 === undefined) { /* S7 не експортується — переклад додаємо через BV_I18N_ADD, якщо є */ }
    build(); sizeOv(); bindEvents(); applyMini(); C.ready = true; i18n();
    window.addEventListener("resize", () => { sizeOv(); miniStatic(); });
    setInterval(tick, 250); requestAnimationFrame(frame);
    // увімкнути переклад нових рядків
    try { A().i18nAdd && A().i18nAdd(DICT); } catch (e) { /* */ }
  }
  window.BV_CMD = { state: C, overlays: OV, openTab, log: logAdd, select: setSel, version: "1.0" };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
