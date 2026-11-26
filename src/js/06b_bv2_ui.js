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
      <button type="button" class="bv2-logo" data-s7="go" data-v="main" aria-label="SKYDOMINION">${EMB}${wordmark()}</button>
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
