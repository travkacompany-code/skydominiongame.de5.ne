
/* SKYDOMINION · сайт (етап 7.47): вхід у гру вільний — без ключа доступу.
   Гра відкривається одразу; паралельно пристрій реєструється на сервері (Cloudflare Worker),
   і після відповіді вмикаються спільні дані: список лідерів, друзі, поповнення Skycoin, адмін-панель.
   Без зв'язку із сервером гра теж працює (як звичайна версія). */
(function(){
  "use strict";
  window.BV_SITEV = 1;      // версія для сайту: турніри створює лише адміністрація
  var LS = {
    get: function(k){ try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function(k, v){ try { localStorage.setItem(k, v); } catch (e) {} }
  };
  var qs = null; try { qs = new URLSearchParams(location.search); } catch (e) {}
  var API = String((qs && qs.get("api")) || window.BV_API || "").replace(/\/+$/, "");
  if (!/^https?:\/\/[^\s"<>]+$/.test(API) || /ВАШ-ПІДДОМЕН/.test(API)) API = "";
  var vid = LS.get("bv2-vid");
  if (!vid || !/^[A-Za-z0-9]{20}$/.test(vid)){
    var A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", r = new Uint8Array(20), i;
    try { crypto.getRandomValues(r); } catch (e) { for (i = 0; i < 20; i++) r[i] = Math.floor(Math.random() * 256); }
    vid = ""; for (i = 0; i < 20; i++) vid += A[r[i] % 62];
    LS.set("bv2-vid", vid);
  }
  var dev = LS.get("bv2-dev"); if (dev && !/^[A-Za-z0-9]{32}$/.test(dev)) dev = null;
  // пристрій уже зареєстровано — спільні дані вмикаються одразу під час запуску гри
  window.BV_GATE = API && dev ? { api: API, dev: dev, admin: LS.get("bv2-adm") === "1", vid: vid } : null;
  if (!API) return;
  function apply(g){ window.BV_GATE = g; if (window.BV_SITE && window.BV_SITE.start) window.BV_SITE.start(g); }
  var tries = 0;
  function hello(){
    var ctl = window.AbortController ? new AbortController() : null, tm = setTimeout(function(){ if (ctl) ctl.abort(); }, 15000);
    var body = { vid: vid, join: 1, ua: navigator.userAgent }; if (dev) body.dev = dev;
    fetch(API + "/api/hello", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "text/plain;charset=UTF-8" }, cache: "no-store", signal: ctl ? ctl.signal : undefined })
      .then(function(r){ clearTimeout(tm); return r.json(); })
      .then(function(r){
        if (!r || !r.ok || !r.dev) throw new Error("hello");
        if (typeof r.tok === "string" && /^[A-Za-z0-9]{32}$/.test(r.tok)){ dev = r.tok; LS.set("bv2-dev", dev); }
        if (!dev) throw new Error("dev");
        LS.set("bv2-adm", r.admin ? "1" : "0");
        apply({ api: API, dev: dev, admin: !!r.admin, vid: vid });
      })
      .catch(function(){ clearTimeout(tm); if (++tries < 4) setTimeout(hello, tries * 20000); });      // немає зв'язку — гра працює далі, повтор пізніше
  }
  hello();
})();
