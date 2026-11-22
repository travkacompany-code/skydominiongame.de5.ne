/* SKYDOMINION · 216 · командний пункт: зведення підпорядкованих систем (етап 6, перший зріз).
   У панелі ППО відкритого КП показує, які системи підпорядковані цьому пункту (поле post у техніки):
   скільки і яких типів, і дає швидкий перехід до кожної. Лише читання: переподчинення, втрата зв'язку
   та резервний КП ще не змодельовані. Блок лежить у панелі #adp, як і інші інструменти авіації. */
(function boot() {
  "use strict";
  if (window.BV_CP_UI) return;
  if (!window.BV_QUICK || !window.BV_QUICK_UI || !window.BV_AP || !document.getElementById("avWrap")) return setTimeout(boot, 200);
  window.BV_CP_UI = true;

  const wrap = document.getElementById("avWrap");
  const box = document.createElement("div");
  box.id = "avCP"; box.hidden = true;
  wrap.insertBefore(box, document.getElementById("avToolbar") || wrap.firstChild);

  let sig = "";
  function render(){
    const A = window.BV_AP;
    const show = A.mode === "post" && A.post && document.getElementById("adp").classList.contains("open");
    box.hidden = !show;
    if (!show){ sig = ""; return; }
    const name = A.post.n, side = A.post.side || "ua";
    const mine = window.BV_QUICK.list().filter(x => x.post === name);
    const link = window.BV_LINK ? window.BV_LINK.text(name) : "";
    const s = JSON.stringify([name, link, mine.map(x => [x.id, x.name, x.state, x.mag])]);
    if (s === sig) return;
    sig = s;
    box.textContent = "";
    const h = document.createElement("div"); h.className = "cp-h";
    const t = document.createElement("b"); t.textContent = `КП «${name}»`;
    const c = document.createElement("small"); c.textContent = `${side === "ru" ? "Росія" : "Україна"} · підпорядковано систем: ${mine.length} · ${link}`;
    h.append(t, c); box.appendChild(h);
    if (!mine.length){
      const e = document.createElement("div"); e.className = "cp-e";
      e.textContent = "Жодна система не підпорядкована цьому пункту. Розгорнута ППО автоматично належить пункту, з якого її розміщено.";
      box.appendChild(e); return;
    }
    const byType = {};
    for (const x of mine) byType[x.name] = (byType[x.name] || 0) + 1;
    const types = document.createElement("div"); types.className = "cp-t";
    types.textContent = Object.entries(byType).map(([k, v]) => `${k} ×${v}`).join(" · ");
    box.appendChild(types);
    const list = document.createElement("div"); list.className = "cp-l";
    for (const x of mine){
      const b = document.createElement("button");
      b.type = "button"; b.className = "cp-u" + (x.sel ? " on" : "");
      b.textContent = `${x.name} · ${x.mag} рак.`;
      b.title = "Вибрати систему і центрувати камеру";
      b.addEventListener("click", () => window.BV_QUICK.focus(x.id));
      list.appendChild(b);
    }
    box.appendChild(list);
  }
  setInterval(render, 500);
  render();
})();
