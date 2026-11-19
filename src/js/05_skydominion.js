/* SKYDOMINION — иллюстрации карточек меню. Только декор: игровые обработчики и данные не затрагиваются. */
(() => {
  const B = "#2bb7ff", G = "#ffc23d";
  const M = {
    radar: c => `<g fill="none" stroke="${c}" opacity=".7"><circle cx="270" cy="60" r="18"/><circle cx="270" cy="60" r="38"/><circle cx="270" cy="60" r="58"/><path d="M270 60 L330 14" stroke-width="2" opacity=".9"/></g><circle cx="300" cy="78" r="3.5" fill="${G}"/><circle cx="238" cy="38" r="3" fill="${c}"/>`,
    duel: c => `<g fill="${c}" opacity=".85"><path d="M215 92 L300 60 L215 28 L240 60Z"/><path d="M345 92 L260 60 L345 28 L320 60Z" fill="${G}" opacity=".7"/></g><path d="M200 60H350" stroke="${c}" stroke-dasharray="4 5" opacity=".5"/>`,
    mirror: c => `<path d="M280 6V114" stroke="${c}" stroke-dasharray="3 4" opacity=".6"/><g opacity=".85"><path d="M270 60 L220 30 L232 60 L220 90Z" fill="${c}"/><path d="M290 60 L340 30 L328 60 L340 90Z" fill="${G}"/></g>`,
    cal: c => `<g fill="none" stroke="${c}" opacity=".6"><rect x="215" y="24" width="110" height="74" rx="6"/><path d="M215 46H325M243 24V98M271 24V98M299 24V98M215 72H325"/></g><circle cx="312" cy="36" r="13" fill="${G}" opacity=".9"/><circle cx="318" cy="32" r="11" fill="#071022"/>`,
    cross: c => `<g fill="none" stroke="${c}" opacity=".75"><circle cx="275" cy="60" r="30"/><circle cx="275" cy="60" r="8"/><path d="M275 14V40M275 80V106M229 60H255M295 60H321" stroke-width="2"/></g><path d="M215 100H340M215 20H340" stroke="${G}" opacity=".3"/>`,
    net: c => `<g stroke="${c}" opacity=".6" fill="none"><circle cx="275" cy="60" r="42"/><ellipse cx="275" cy="60" rx="18" ry="42"/><path d="M233 60H317M240 38H310M240 82H310"/></g><g fill="${G}"><circle cx="248" cy="40" r="4"/><circle cx="300" cy="72" r="4"/><circle cx="276" cy="20" r="3"/></g>`,
    star: c => `<g opacity=".85"><path d="M275 18 L286 46 L316 48 L292 66 L300 96 L275 79 L250 96 L258 66 L234 48 L264 46Z" fill="${G}"/></g><path d="M200 108Q275 70 350 108" stroke="${c}" fill="none" opacity=".6"/>`,
    play: c => `<g fill="${c}" opacity=".8"><path d="M240 30 L290 60 L240 90Z"/><path d="M285 30 L335 60 L285 90Z" opacity=".5"/></g>`,
    crate: c => `<g fill="none" stroke="${c}" stroke-width="2" opacity=".75"><path d="M275 22 L322 44 V88 L275 110 L228 88 V44Z"/><path d="M228 44 L275 66 L322 44M275 66V110"/></g><circle cx="275" cy="66" r="5" fill="${G}"/>`,
    missile: c => `<g fill="${c}" opacity=".85"><path d="M335 28 L225 80 L232 90 L338 36Z"/><path d="M335 28 L346 24 L342 36Z" fill="${G}"/></g><path d="M225 84Q190 96 160 94" stroke="${G}" stroke-width="3" opacity=".5" fill="none"/>`,
    bars: c => `<g fill="${c}" opacity=".75"><rect x="230" y="70" width="20" height="30"/><rect x="258" y="48" width="20" height="52" fill="${G}"/><rect x="286" y="30" width="20" height="70"/></g>`
  };
  const KIND = { scen: "radar", online: "net", tours: "star", sandbox: "cross", resume: "play", bcshop: "crate", bcars: "missile", lb: "bars", rnew: "net", rjoincode: "net", ready: "radar", duel: "duel", mirror: "mirror", calendar: "cal", free: "cross" };
  const cache = {};
  const art = (kind, gold) => {
    const k = kind + (gold ? "g" : ""); if (cache[k]) return cache[k];
    const c = gold ? G : B;
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 360 120' preserveAspectRatio='xMaxYMid slice'><defs><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${gold ? "#2a1d06" : "#0d2a55"}'/><stop offset='1' stop-color='#050b17'/></linearGradient></defs><rect width='360' height='120' fill='url(#s)'/><g stroke='${c}' opacity='.12'><path d='M0 30H360M0 60H360M0 90H360M60 0V120M120 0V120M180 0V120M240 0V120M300 0V120'/></g><path d='M0 120L90 96 170 108 260 88 360 104V120Z' fill='#02060d' opacity='.7'/>${(M[kind] || M.radar)(c)}</svg>`;
    return cache[k] = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  };
  const EMB = `<svg class="sd-emb" viewBox="0 0 64 64" fill="none"><path d="M32 4 58 16v18c0 13-10 22-26 27C16 56 6 47 6 34V16Z" fill="#0a1830" stroke="#2bb7ff" stroke-width="2.2"/><path d="M10 31 32 13l22 18-9-2-13-9-13 9z" fill="#ffc23d"/><path d="M32 24v24M23 40l9 9 9-9" stroke="#2bb7ff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="32" cy="24" r="2.6" fill="#fff"/></svg>`;
  // иллюстрации — чистым CSS по data-атрибутам: не мигают при перерисовке меню
  const decorate = () => {
    let css = "";
    for (const [k, kind] of Object.entries(KIND)) for (const g of [0, 1]) {
      const v = art(kind, g), gc = g ? ".gold" : ":not(.gold)";
      css += `#s7menu .mbtn${gc}[data-s7="${k}"],#s7menu .mbtn${gc}[data-s7="go"][data-v="${k}"]{--art:${v}}`;
      if (!g) css += `#s7menu .mcard[data-v="${k}"]{--art:${v}}`;
    }
    const st = document.createElement("style"); st.id = "sd-art"; st.textContent = css; document.head.appendChild(st);
  };
  const brand = () => {
    document.querySelectorAll("#brand .mark,.mm-brand>svg,#brand>svg.mark").forEach(s => { if (!s.classList.contains("sd-emb")) s.insertAdjacentHTML("beforebegin", EMB), s.remove(); });
    const L = document.getElementById("loader"), em = L && L.querySelector(".ld-emblem");
    if (em && !em.querySelector(".sd-emb")) em.insertAdjacentHTML("afterbegin", EMB);
    if (L && !L.querySelector(".sd-corner")) L.insertAdjacentHTML("afterbegin", '<span class="sd-corner a"></span><span class="sd-corner b"></span>');
  };
  const init = () => {
    brand(); decorate();
    const fix = () => { if (/SKYDOMINION/i.test(document.title)) document.title = document.title.replace(/SKYDOMINION/gi, "SKYDOMINION"); };
    fix(); new MutationObserver(fix).observe(document.querySelector("title"), { childList: true });
  };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();
