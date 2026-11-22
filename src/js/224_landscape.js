/* SKYDOMINION · 224 · горизонтальний вид на телефоні.
   У портреті показує підказку «поверніть телефон». Спроба зафіксувати альбомну орієнтацію — за натиском
   (браузери дозволяють це не всюди; на iOS Safari блокування орієнтації недоступне — тоді лишається підказка).
   Коли телефон повернуто — підказка зникає сама. «Продовжити так» дозволяє грати й у портреті. */
(function () {
  "use strict";
  if (window.BV_LAND) return;
  window.BV_LAND = true;
  const phone = () => window.matchMedia("(pointer: coarse) and (max-width: 900px)").matches;
  const portrait = () => window.matchMedia("(orientation: portrait)").matches;

  const box = document.createElement("div");
  box.id = "rotHint"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Поверніть телефон");
  box.innerHTML = '<div class="rh-ic" aria-hidden="true"></div><b>Поверніть телефон</b><div>Гра розрахована на горизонтальний вигляд.</div>';
  const go = document.createElement("button"); go.type = "button"; go.textContent = "Повернути в альбомний вигляд";
  const skip = document.createElement("button"); skip.type = "button"; skip.textContent = "Продовжити так";
  box.append(go, skip);
  document.body.appendChild(box);

  let skipped = false;
  function refresh(){
    const need = phone() && portrait() && !skipped;
    box.classList.toggle("on", need);
  }
  go.addEventListener("click", () => {
    const o = screen.orientation;
    if (o && o.lock) o.lock("landscape").catch(() => {});
    refresh();
  });
  skip.addEventListener("click", () => { skipped = true; refresh(); });
  window.addEventListener("orientationchange", () => setTimeout(refresh, 200));
  window.addEventListener("resize", refresh);
  refresh();
})();
