
/* екран завантаження: плавний прогрес, статуси, поради; ховається через window.__ldDone() */
(() => {
  const $ = id => document.getElementById(id), L = $("loader"), fill = $("ldFill"), pct = $("ldPct"), st = $("ldSt"), tip = $("ldTip");
  if (!L) return;
  const TIPS = [
    "Червоні позначки — об'єкти й ППО Росії, сині — України. Натисніть на позначку, щоб відкрити панель.",
    "Балістику й гіперзвукові ракети ППО збиває лише на зниженні — розміщуйте установки ближче до цілі.",
    "Натисніть на дрон і клацніть по мапі, щоб скерувати його на нову точку.",
    "Заголовок панелі можна потягнути, а двічі клацнути — згорнути, щоб звільнити мапу.",
    "Під час вибору точки на мапі панелі пусків і ППО згортаються самі.",
    "Морський дрон ходить лише по воді — обирайте точки в Чорному чи Азовському морі.",
    "Автотривога вмикається в панелі ППО: області отримують сповіщення без вашої участі."
  ];
  const STAGES = [[0, "Підключення до штабу"], [.25, "Завантаження картографічного рушія"], [.55, "Розгортання тактичної мапи"], [.8, "Калібрування радарів і ППО"], [.94, "Майже готово"]];
  let p = 0, done = false, closed = false, ti = Math.floor(Math.random() * TIPS.length);
  const t0 = performance.now();
  const showTip = () => { tip.classList.remove("in"); setTimeout(() => { tip.textContent = TIPS[ti = (ti + 1) % TIPS.length]; tip.classList.add("in"); }, 300); };
  ti--; showTip(); const tipT = setInterval(showTip, 4200);
  function close(){
    if (closed) return; closed = true; clearInterval(tipT);
    st.textContent = "Готово"; pct.textContent = "100%";
    setTimeout(() => { L.classList.add("gone"); setTimeout(() => { L.style.display = "none"; }, 700); }, 380);
  }
  function frame(now){
    if (closed) return;
    const el = (now - t0) / 1000;
    let tg = Math.min(.9, 1 - Math.exp(-el / 2.4));
    tg = window.maplibregl ? Math.max(tg, .55) : Math.min(tg, .5);
    if (done) tg = 1;
    p += (tg - p) * (done ? .16 : .05);
    if (done && 1 - p < .004) p = 1;
    fill.style.width = (p * 100).toFixed(1) + "%"; pct.textContent = Math.floor(p * 100) + "%";
    if (!done){ let s = STAGES[0][1]; for (const x of STAGES) if (p >= x[0]) s = x[1]; st.textContent = s; }
    if (p >= 1) return close();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__ldDone = () => { done = true; };
})();
