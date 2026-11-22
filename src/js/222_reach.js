/* SKYDOMINION · 222 · доступність кнопок дії в панелі ППО (виправлення).
   Кнопки «Обрати точку на мапі» (pickplace) і «Зліт» (launch) стоять внизу прокручуваного списку.
   Після вибору системи чи літака панель сама прокручує до цієї кнопки, щоб її можна було натиснути.
   Лише прокрутка: жодної зміни логіки. */
(function () {
  "use strict";
  if (window.BV_REACH) return;
  window.BV_REACH = true;
  const ACTION = '#adp [data-ad="pickplace"], #adp [data-ad="launch"], #adp [data-ad="pickpatrol"]';
  document.addEventListener("click", e => {
    const card = e.target.closest && e.target.closest("#adp .wcard, #adp .trow");
    if (!card) return;
    setTimeout(() => {
      const b = document.querySelector(ACTION);
      if (b && b.offsetParent !== null) b.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 180);
  }, true);
})();
