
/* SKYDOMINION 2 · AAA-оболонка інтерфейсу (лише подання).
   Будує навколо штатного меню гри: верхню HUD-панель, навігацію, сітку режимів, блок подій, сцену завантаження.
   Усі кнопки несуть ті самі data-s7 / data-v, що й оригінальні: роботу виконує штатний обробник кліків гри.
   Дані (ім'я, ранг, XP, Skycoin, заявки, підписи режимів) читаються з уже відрендереного штатного меню. */
(() => {
  "use strict";
  const A = window.BV2ART || {};
  const $ = id => document.getElementById(id);
  const menu = $("s7menu"), sc = $("mmScroll"), body = document.body;
  if (!menu || !sc || menu.querySelector("#bv2")) return;

  /* ---------- переклад власних написів (штатний перекладач їх не знає) ---------- */
  const lang = () => { try { return localStorage.getItem("bv2-lang") || "uk"; } catch (e) { return "uk"; } };
  const D = {
    "Головна": ["Главная", "Home"], "Бій": ["Бой", "Battle"], "Магазин": ["Магазин", "Shop"], "Профіль": ["Профиль", "Profile"],
    "Налаштування": ["Настройки", "Settings"], "Вихід": ["Выход", "Exit"], "Меню": ["Меню", "Menu"],
    "Оперативний статус": ["Оперативный статус", "Operational status"], "Командир": ["Командир", "Commander"],
    "Баланс": ["Баланс", "Balance"], "Поповнити баланс Skycoin": ["Пополнить баланс Skycoin", "Top up Skycoin"],
    "Заявки в друзі": ["Заявки в друзья", "Friend requests"],
    "Онлайн": ["Онлайн", "Online"], "Останні події": ["Последние события", "Recent events"],
    "Перемога": ["Победа", "Victory"], "Поразка": ["Поражение", "Defeat"], "Нічия": ["Ничья", "Draw"], "Мир": ["Мир", "Peace"], "Капітуляція": ["Капитуляция", "Surrender"],
    "Лінія фронту": ["Линия фронта", "Front line"], "Дані DeepState": ["Данные DeepState", "DeepState data"],
    "Нових заявок": ["Новых заявок", "New requests"], "Відкрити профіль": ["Открыть профиль", "Open profile"],
    "Боїв ще не було": ["Боёв ещё не было", "No battles yet"], "Почніть з оборонного сценарію": ["Начните с оборонного сценария", "Start with a defence scenario"],
    "Бойова готовність": ["Боевая готовность", "Combat readiness"], "Тактична дуель": ["Тактическая дуэль", "Tactical duel"],
    "Дзеркальний удар": ["Зеркальный удар", "Mirror strike"], "Оперативний календар": ["Оперативный календарь", "Operational calendar"],
    "Вільний полігон": ["Свободный полигон", "Free range"], "Мережевий бій": ["Сетевой бой", "Online battle"],
    "Версія": ["Версия", "Version"], "Вийти з гри?": ["Выйти из игры?", "Quit the game?"],
    "Прогрес і налаштування буде збережено на цьому пристрої.": ["Прогресс и настройки сохранены на этом устройстве.", "Progress and settings stay saved on this device."],
    "Скасувати": ["Отмена", "Cancel"], "Закрийте вкладку або застосунок, щоб вийти з гри.": ["Закройте вкладку или приложение, чтобы выйти из игры.", "Close the tab or the app to leave the game."],
    "Плануй · Керуй · Перемагай": ["Планируй · Управляй · Побеждай", "Plan · Command · Win"],
    "В бій": ["В бой", "Battle"], "Порада": ["Совет", "Tip"], "хв тому": ["мин назад", "min ago"], "год тому": ["ч назад", "h ago"], "дн тому": ["дн назад", "d ago"], "щойно": ["только что", "just now"]
  };
  const T = s => { const l = lang(), v = D[s]; return v ? (l === "ru" ? v[0] : l === "en" ? v[1] : s) : s; };

  /* ---------- іконки ---------- */
  const ic = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const I = {
    home: ic('<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h5v-6h3v6h5V10"/>'),
    battle: ic('<path d="M12 3 4.5 6v5.6c0 4.4 3 7.6 7.5 9.4 4.5-1.8 7.5-5 7.5-9.4V6z"/><path d="m12 8.2 1.1 2.3 2.5.3-1.8 1.7.5 2.5-2.3-1.2-2.3 1.2.5-2.5-1.8-1.7 2.5-.3z"/>'),
    shop: ic('<path d="M3 4h2.4l2 10.2h10.3L19.8 7H6.4"/><circle cx="9" cy="18.4" r="1.4"/><circle cx="17" cy="18.4" r="1.4"/>'),
    me: ic('<path d="M5 20V12M10 20V6M15 20v-9M20 20V3"/>'),
    gear: ic('<circle cx="12" cy="12" r="3"/><path d="M19.4 14.6a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h0a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v0a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>'),
    exit: ic('<path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14"/><path d="M4 12h10M8 8l-4 4 4 4"/>'),
    mail: ic('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>'),
    globe: ic('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.9 5.6 3.9 9s-1.3 6.4-3.9 9c-2.6-2.6-3.9-5.6-3.9-9S9.4 5.6 12 3z"/>'),
    chev: '<svg viewBox="0 0 28 20" aria-hidden="true"><path d="m3 3 8 7-8 7M14 3l8 7-8 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    plus: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
    swords: ic('<path d="m4 4 7 7M20 4l-7 7M4 20l5-5M20 20l-5-5"/><path d="m3 7 4-4M17 3l4 4M3 17l4 4M21 17l-4 4"/>'),
    shield: ic('<path d="M12 3 4.5 6v5.6c0 4.4 3 7.6 7.5 9.4 4.5-1.8 7.5-5 7.5-9.4V6z"/><path d="M9 12l2.2 2.2L15.5 10"/>'),
    info: ic('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
    flame: ic('<path d="M12 3c1 3.5 5 5.4 5 10a5 5 0 0 1-10 0c0-2 1-3.2 2-4.4.4 1.2 1 1.9 1.7 2.2C10.3 8 10.7 5.4 12 3z"/>')
  };
  const EMB = `<svg class="bv2-emb" viewBox="0 0 72 64" aria-hidden="true"><defs><linearGradient id="bv2e1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#7d93b4"/></linearGradient><linearGradient id="bv2e2" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#ff9d00"/><stop offset="1" stop-color="#ffe27a"/></linearGradient></defs><path d="M36 4 66 58H50L36 32 22 58H6Z" fill="none" stroke="url(#bv2e1)" stroke-width="6" stroke-linejoin="round"/><path d="M4 50C26 46 48 38 70 14 60 38 36 54 8 58Z" fill="url(#bv2e2)"/></svg>`;
  const wordmark = (cls) => `<span class="bv2-wm ${cls || ""}"><span class="w1">SKY</span><b>DOMINION</b></span>`;

  /* ---------- стилі з арт-даними (один раз, без дублювання data: у DOM) ---------- */
  const art = document.createElement("style"); art.id = "bv2-art";
  const K = { net: "net", scen: "scen", tour: "tour", sim: "sim", shop: "help", res: "unity" };
  let css = "";
  for (const [k, src] of Object.entries(K)) if (A[src]) css += `.bv2c-art[data-art="${k}"]{background-image:url("${A[src]}")}`;
  if (A.load) css += `.bv2-bg .scene,.bv2-ld-scene .scene{background-image:url("${A.load}")}`;
  if (A.sp_f16 && A.sp_ad_patriot) css += `.bv2c-art[data-art="ars"]{--sp1:url("${A.sp_f16}");--sp2:url("${A.sp_ad_patriot}")}`;
  art.textContent = css; document.head.appendChild(art);

  /* ---------- мапа України (контури з геоданих гри) ---------- */
  const M = A.MAP;
  const mapSvg = (cls) => !M ? "" : `<svg class="${cls}" viewBox="0 0 ${M.W} ${M.H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <defs>
      <linearGradient id="bv2mg${cls}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d8bff"/><stop offset=".55" stop-color="#7fb8ff"/><stop offset="1" stop-color="#ffc83d"/></linearGradient>
      <filter id="bv2mb${cls}" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="7"/></filter>
      <pattern id="bv2gp${cls}" width="26" height="22.5" patternUnits="userSpaceOnUse" patternTransform="rotate(0)"><path d="M13 0 26 7.5v15M13 0 0 7.5v15" fill="none" stroke="#4aa8ff" stroke-opacity=".09"/></pattern>
    </defs>
    <path d="${M.occ}" fill="rgba(255,40,40,.18)" stroke="#ff3b30" stroke-width="2.2" stroke-opacity=".85" stroke-linejoin="round"/>
    <path d="${M.occ}" fill="none" stroke="#ff3b30" stroke-width="7" opacity=".45" filter="url(#bv2mb${cls})"/>
    <path d="${M.ua}" fill="none" stroke="url(#bv2mg${cls})" stroke-width="9" opacity=".55" filter="url(#bv2mb${cls})" stroke-linejoin="round"/>
    <path d="${M.ua}" fill="none" stroke="url(#bv2mg${cls})" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="${M.front}" fill="none" stroke="#ffb02e" stroke-width="2.4" stroke-dasharray="10 6" stroke-linejoin="round" class="front"/>
  </svg>`;

  /* ---------- оболонка ---------- */
  const NAV = [
    { k: "home", ico: I.home, t: "Головна", s7: "go", v: "main" },
    { k: "battle", ico: I.battle, t: "Бій", s7: "go", v: "online" },
    { k: "shop", ico: I.shop, t: "Магазин", s7: "bcshop", v: "" },
    { k: "me", ico: I.me, t: "Профіль", s7: "go", v: "profile" },
    { k: "set", ico: I.gear, t: "Налаштування", s7: "langmdl", v: "" },
    { k: "exit", ico: I.exit, t: "Вихід", s7: "", v: "" }
  ];
  const CARDS = [
    { k: "net", src: '.mbtn[data-v="online"]', s7: "go", v: "online", cls: "hero", t: "Мережевий фронт", s: "Онлайн-кімнати" },
    { k: "scen", src: '.mbtn[data-v="scen"]', s7: "go", v: "scen", cls: "wide", t: "Оборонні сценарії", s: "Одиночні режими проти бота" },
    { k: "tour", src: '.mbtn[data-v="tours"]', s7: "go", v: "tours", t: "Бойові змагання", s: "Турніри між командирами" },
    { k: "sim", src: '.mbtn[data-v="sandbox"]', s7: "go", v: "sandbox", t: "Симулятор полігону", s: "Обидві сторони · вибір режиму" },
    { k: "shop", src: '.mbtn[data-s7="bcshop"]', s7: "bcshop", v: "", cls: "gold", t: "Торговельний майданчик", s: "Контейнери й техніка за Skycoin" },
    { k: "ars", src: '.mbtn[data-s7="bcars"]', s7: "bcars", v: "", cls: "gold", t: "Арсенал", s: "Уся доступна техніка й контейнери" },
    { k: "res", src: '.mbtn[data-s7="resume"]', s7: "resume", v: "", cls: "res", t: "Повернення в операцію", s: "Немає перерваної операції полігону" }
  ];
  const cardHtml = c => `<button type="button" class="bv2c ${c.cls || ""}" data-card="${c.k}" data-s7="${c.s7}" data-v="${c.v}">
    <span class="in"><i class="bv2c-art" data-art="${c.k === "ars" ? "ars" : c.k}"></i><i class="bv2c-fx"></i>
      ${c.k === "net" ? `<span class="sd-cta">${T("В бій")}${I.chev}</span>` : ""}
      ${c.k === "net" ? `<span class="bv2c-live"><b></b><em>${T("Онлайн")}</em></span>` : ""}
      <span class="bv2c-tx"><b data-f="t">${c.t}</b><small data-f="s">${c.s}</small></span>
      <i class="bv2c-go">${I.chev}</i></span></button>`;

  const shell = document.createElement("div");
  shell.id = "bv2";
  shell.innerHTML = `
    <div class="bv2-bg" aria-hidden="true">
      <i class="sky"></i><i class="scene"></i>${mapSvg("bv2-map")}<i class="grid"></i><i class="scan"></i><i class="vig"></i>
    </div>
    <header class="bv2-top">
      <button type="button" class="bv2-logo" data-s7="go" data-v="main" aria-label="SKYDOMINION"><img class="sd-logo-img" alt="SKYDOMINION" draggable="false" src="data:image/webp;base64,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"></button>
      <button type="button" class="bv2-cmd bv2-chamf" data-s7="go" data-v="profile" title="${T("Відкрити профіль")}">
        <span class="bv2-hex" data-f="rk"></span>
        <span class="bv2-cmd-tx"><em data-f="em">${T("Оперативний статус")}</em><b data-f="nm">${T("Командир")}</b><small data-f="rank"></small><i class="bv2-xp"><u data-f="xp"></u></i></span>
        <span class="bv2-lv" data-f="lv"></span>
      </button>
      <button type="button" class="bv2-cur bv2-chamf" data-s7="bctop" title="${T("Поповнити баланс Skycoin")}">
        <span class="bv2-coin" data-f="coin"></span>
        <span class="bv2-cur-tx"><b data-f="bc">0</b><small>SKYCOIN</small></span>
        <i class="bv2-plus">${I.plus}</i>
      </button>
      <button type="button" class="bv2-sq bv2-mail bv2-chamf" data-s7="go" data-v="profile" aria-label="${T("Заявки в друзі")}" title="${T("Заявки в друзі")}">${I.mail}<i class="bv2-bdg" data-f="mail" hidden></i></button>
      <button type="button" class="bv2-sq bv2-lang bv2-chamf" data-s7="langmdl" aria-label="${T("Налаштування")}"><span class="bv2-flag" data-f="flag"></span><em data-f="lcode">УКР</em></button>
    </header>
    <nav class="bv2-rail" aria-label="${T("Меню")}">
      ${NAV.map(n => `<button type="button" class="bv2-nav bv2-chamf" data-nav="${n.k}" ${n.s7 ? `data-s7="${n.s7}" data-v="${n.v}"` : `data-bv2="exit"`}>${n.ico}<span>${T(n.t)}</span><i class="bv2-nbdg" data-f="nb" hidden></i></button>`).join("")}
      <div class="bv2-ver"><span>${T("Версія")}: <b data-f="ver">v2</b></span></div>
    </nav>
    <main class="bv2-home" aria-label="${T("Головна")}">
      <div class="bv2-sub">${wordmark("sm")}<span>${T("Плануй · Керуй · Перемагай")}</span></div>
      ${CARDS.map(cardHtml).join("")}
      <section class="bv2-ev bv2-chamf" aria-label="${T("Останні події")}">
        <button type="button" class="bv2-evh" data-s7="go" data-v="profile"><b>${T("Останні події")}</b><i>${I.chev}</i></button>
        <div class="bv2-evl" data-f="events"></div>
      </section>
    </main>
    <div class="bv2-dlg" id="bv2dlg" hidden role="dialog" aria-modal="true" aria-labelledby="bv2dt">
      <div class="bv2-dbox bv2-chamf"><h3 id="bv2dt">${T("Вийти з гри?")}</h3><p data-f="dm">${T("Прогрес і налаштування буде збережено на цьому пристрої.")}</p>
        <div class="bv2-dact"><button type="button" class="bv2-dbtn ghost" data-bv2="dno">${T("Скасувати")}</button><button type="button" class="bv2-dbtn" data-bv2="dyes">${T("Вихід")}</button></div></div>
    </div>`;
  menu.insertBefore(shell, menu.firstChild);
  menu.classList.add("bv2m");
  const f = (name, root) => (root || shell).querySelector(`[data-f="${name}"]`);

  /* ---------- синхронізація з штатним меню ---------- */
  const NAVMAP = { main: "home", online: "battle", scen: "battle", tours: "battle", sandbox: "battle", profile: "me", friends: "me", lb: "me" };
  const MODEN = {};   // ключ режиму → назва (з карток сценаріїв, коли вони відрендерені); запасний словник нижче
  ["ready:Бойова готовність", "duel:Тактична дуель", "mirror:Дзеркальний удар", "calendar:Оперативний календар", "free:Вільний полігон"].forEach(s => { const [k, n] = s.split(":"); MODEN[k] = n; });
  const q = s => sc.querySelector(s);
  const setTx = (el, v) => { if (el && el.textContent !== v) el.textContent = v; };
  const setHtml = (el, v) => { if (el && el._h !== v) { el.innerHTML = v; el._h = v; } };
  const num = s => { const m = /(\d[\d\s.,]*)/.exec(s || ""); return m ? m[1].trim() : ""; };

  function readProfile() {
    try {
      const p = new URLSearchParams(location.search).get("profile");
      const key = "bv2-profile" + (p ? "-" + p.replace(/\W/g, "").slice(0, 12) : "");
      const o = JSON.parse(localStorage.getItem(key) || "null"); return o && Array.isArray(o.hist) ? o : null;
    } catch (e) { return null; }
  }
  const ago = ms => {
    const m = Math.max(0, (Date.now() - ms) / 60000);
    if (m < 1) return T("щойно");
    if (m < 60) return Math.floor(m) + " " + T("хв тому");
    if (m < 1440) return Math.floor(m / 60) + " " + T("год тому");
    return Math.floor(m / 1440) + " " + T("дн тому");
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  let reqN = 0;
  function events() {
    const items = [];
    const P = readProfile();
    if (reqN) items.push({ ico: I.mail, tone: "gold", t: `${T("Нових заявок")}: ${reqN}`, s: T("Відкрити профіль"), s7: "go", v: "profile" });
    if (P) P.hist.slice(-3).reverse().forEach(h => {
      const res = h.surr ? T("Капітуляція") : h.peace ? T("Мир") : h.w === h.side ? T("Перемога") : h.w === "draw" ? T("Нічия") : T("Поразка");
      const win = !h.surr && !h.peace && h.w === h.side;
      items.push({ ico: win ? I.shield : I.swords, tone: win ? "ok" : "", t: T(MODEN[h.mode] || MODEN.ready), s: `${res}${h.ctx === "online" ? " · " + T("Мережевий бій") : ""} · ${ago(h.at)}`, x: h.xp ? "+" + Math.round(h.xp) + " XP" : "", s7: "go", v: "profile" });
    });
    if (!P || !P.hist.length) items.push({ ico: I.swords, tone: "", t: T("Боїв ще не було"), s: T("Почніть з оборонного сценарію"), s7: "go", v: "scen" });
    const st = document.querySelector("#status .l2");
    if (st && st.textContent.trim()) items.push({ ico: I.info, tone: "blue", t: `${T("Лінія фронту")} · ${st.textContent.trim()}`, s: T("Дані DeepState") });
    return items.slice(0, 4).map(e => `<${e.s7 ? `button type="button" data-s7="${e.s7}" data-v="${e.v}"` : "div"} class="bv2-evi ${e.tone}"><span class="ico">${e.ico}</span><span class="tx"><b>${esc(e.t)}</b><small>${esc(e.s)}</small></span>${e.x ? `<em>${esc(e.x)}</em>` : ""}</${e.s7 ? "button" : "div"}>`).join("");
  }

  function sync() {
    const scr = sc.dataset.scr || "main";
    menu.dataset.scr = scr;
    const on = NAVMAP[scr];
    shell.querySelectorAll(".bv2-nav").forEach(b => b.classList.toggle("on", b.dataset.nav === on));
    const shopOn = !!q('[data-s7="bcshop"]') || scr !== "main";
    const shopNav = shell.querySelector('[data-nav="shop"]'); if (scr === "main") shopNav.hidden = !shopOn;
    /* код мови й прапор */
    const lc = $("langCode"), code = lc ? lc.textContent.trim() : "УКР";
    setTx(f("lcode"), code); const flag = f("flag"); const uk = lang() === "uk"; flag.classList.toggle("uk", uk); setHtml(flag, uk ? "" : I.globe);
    const vb = document.querySelector("#loader .ld-top b"); setTx(f("ver"), vb ? vb.textContent.trim() : "v2");
    if (scr !== "main") return;

    const me = q(".mm-me"), bal = q(".bc-mbal");
    if (me) {
      setHtml(f("rk"), (me.querySelector(".rk") || {}).innerHTML || "");
      setHtml(f("lv"), (me.querySelector(".lv") || {}).innerHTML || "");
      const em = me.querySelector(".gr em"), emt = em ? em.textContent : "";
      setTx(f("em"), emt.split("·")[0].trim() || T("Оперативний статус"));
      setTx(f("nm"), (me.querySelector(".gr b") || {}).textContent || T("Командир"));
      setTx(f("rank"), (me.querySelector(".gr small") || {}).textContent || "");
      const xi = me.querySelector(".xpbar i"); f("xp").style.width = xi ? xi.style.width : "0%";
      const m = /:\s*(\d+)/.exec(emt); reqN = m ? +m[1] : 0;
      const bd = f("mail"); bd.hidden = !reqN; setTx(bd, reqN ? String(reqN) : "");
    }
    shell.querySelector(".bv2-cur").hidden = !bal;
    if (bal) {
      const c = bal.firstElementChild; setHtml(f("coin"), c && c.tagName !== "SPAN" ? c.outerHTML : (c ? c.outerHTML : ""));
      const b = bal.querySelector("b"); setTx(f("bc"), b ? num(b.firstChild ? b.firstChild.textContent : b.textContent) || "0" : "0");
    }
    for (const c of CARDS) {
      const el = shell.querySelector(`[data-card="${c.k}"]`), src = q(c.src);
      el.hidden = !src;
      if (!src) continue;
      el.disabled = src.disabled;
      setTx(f("t", el), (src.querySelector(".mt") || {}).textContent || c.t);
      setTx(f("s", el), (src.querySelector(".ms") || {}).textContent || c.s);
    }
    setHtml(f("events"), events());
  }

  /* ---------- вихід з гри ---------- */
  const dlg = $("bv2dlg");
  shell.addEventListener("click", e => {
    const b = e.target.closest("[data-bv2]"); if (!b) return;
    const a = b.dataset.bv2;
    if (a === "exit") { dlg.hidden = false; const y = dlg.querySelector('[data-bv2="dyes"]'); y && y.focus(); }
    else if (a === "dno") dlg.hidden = true;
    else if (a === "dyes") {
      try { window.close(); } catch (x) {}
      setTimeout(() => { setTx(f("dm"), T("Закрийте вкладку або застосунок, щоб вийти з гри.")); dlg.querySelector('[data-bv2="dyes"]').hidden = true; }, 250);
    }
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !dlg.hidden) dlg.hidden = true; });

  /* ---------- завантажувальний екран: декор поверх штатної розмітки (id-елементи не чіпаємо) ---------- */
  const L = $("loader");
  if (L && !L.querySelector(".bv2-ld-scene")) {
    L.insertAdjacentHTML("afterbegin", `<div class="bv2-ld-scene" aria-hidden="true"><i class="sky"></i><i class="scene"></i>${mapSvg("bv2-ldmap")}<i class="scan"></i><i class="vig"></i></div><span class="bv2-corner a"></span><span class="bv2-corner b"></span>`);
    const em = L.querySelector(".ld-emblem"); if (em) em.insertAdjacentHTML("afterbegin", EMB);
    const sub = L.querySelector(".ld-hero .sub");
    if (sub) sub.insertAdjacentHTML("afterend", `<div class="bv2-slogan"><span>${T("Плануй · Керуй · Перемагай").split(" · ").join("</span><i></i><span>")}</span></div>`);
    const row = L.querySelector(".ld-row"); if (row) row.insertAdjacentHTML("afterbegin", '<i class="bv2-ldspin"></i>');
  }

  /* ---------- підписка на зміни ---------- */
  let raf = 0; const sched = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(sync); };
  new MutationObserver(sched).observe(sc, { childList: true, subtree: false, attributes: true, attributeFilter: ["data-scr"] });
  const lc = $("langCode"); if (lc) new MutationObserver(sched).observe(lc, { childList: true, characterData: true, subtree: true });
  new MutationObserver(sched).observe(body, { attributes: true, attributeFilter: ["class"] });
  const st = document.querySelector("#status .l2"); if (st) new MutationObserver(sched).observe(st, { childList: true, characterData: true, subtree: true });
  sync();
  setInterval(() => { if (body.classList.contains("s7-menu") && (sc.dataset.scr || "main") === "main") setHtml(f("events"), events()); }, 30000);
})();

