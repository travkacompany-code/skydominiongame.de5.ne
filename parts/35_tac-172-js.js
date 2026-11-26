
/* SKYDOMINION · 172 · тактичний стиль карти
   APP-6 знаки (без неону, свічення й ореолів), тонкий контур сторони,
   темний топографічний фон. Працює через перехват maplibregl.Map і IMAGES;
   ігрова логіка не змінюється. */
(function (){
  "use strict";

  const SHOW_ZONE_LINES = true;                      // тонка пунктирна межа зони; false — прибрати й її
  const SIDE_COL = { ua: "#3d8bff", ru: "#ff3b30", dead: "#6b7480" };
  const isGlow = id => /glow/i.test(id);
  const isHidden = id => isGlow(id) || id === "site-zone-fill" || (!SHOW_ZONE_LINES && id === "site-zone-line");

  /* ---------- APP-6 знаки ---------- */
  // kind: art (артилерія / пускова), ad (ППО), inf (піхота), arm (танк), hq (штаб), inst (інфраструктура)
  function drawApp6(g, kind, o){
    const { cx, cy, w, h, col, side, fill } = o;
    const x = cx - w / 2, y = cy - h / 2;
    if (kind === "inst"){
      g.fillStyle = fill || col; g.fillRect(x, y, w, h);
      g.strokeStyle = col; g.lineWidth = 1; g.strokeRect(x, y, w, h);
    } else {
      g.fillStyle = "rgba(8,11,16,0.88)"; g.fillRect(x, y, w, h);
      g.strokeStyle = col; g.lineWidth = 1.5; g.strokeRect(x, y, w, h);
    }
    if (side && SIDE_COL[side]){                     // тонкий контур сторони поза рамкою
      g.strokeStyle = SIDE_COL[side]; g.lineWidth = 0.9;
      g.strokeRect(x - 2.2, y - 2.2, w + 4.4, h + 4.4);
    }
    g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 1.4; g.lineCap = "butt";
    if (kind === "art"){
      g.beginPath(); g.arc(cx, cy, Math.min(w, h) * 0.17, 0, Math.PI * 2); g.fill();
    } else if (kind === "ad"){
      g.beginPath(); g.arc(cx, cy + h * 0.12, h * 0.36, Math.PI, 0); g.stroke();
    } else if (kind === "inf"){
      g.beginPath();
      g.moveTo(x + 2, y + 2); g.lineTo(x + w - 2, y + h - 2);
      g.moveTo(x + w - 2, y + 2); g.lineTo(x + 2, y + h - 2); g.stroke();
    } else if (kind === "arm"){
      g.beginPath(); g.ellipse(cx, cy, w * 0.3, h * 0.2, 0, 0, Math.PI * 2); g.stroke();
    } else if (kind === "hq"){
      g.beginPath(); g.moveTo(cx, y + h); g.lineTo(cx, y + h + h * 0.5); g.stroke();
      g.beginPath(); g.moveTo(cx, y + h + h * 0.5); g.lineTo(cx + w * 0.22, y + h + h * 0.36);
      g.lineTo(cx, y + h + h * 0.22); g.closePath(); g.fill();
    }
  }

  function app6Image(W, H, kind, o){
    return canvasImageWH(W, H, g => drawApp6(g, kind, Object.assign({ cx: W / 2, cy: H / 2, w: o.w, h: o.h }, o)));
  }

  function siteSym(t, a){
    const T = a ? Object.assign({}, SITE_TYPES[t], siteAlPal(t, a)) : SITE_TYPES[t];
    const dead = a === "dead";
    const kind = T.shape === "diamond" ? "art" : "inst";   // пускові рубежі — артилерійський знак; аеродроми/порти — інфраструктура
    const col = dead ? SIDE_COL.dead : (T.fill || "#ffffff");
    return app6Image(40, 40, kind, { w: 28, h: 20, col, side: dead ? null : T.side, fill: col });
  }

  function adSym(v){
    const P = POST_PAL[v || "none"] || POST_PAL.none;
    const dead = v === "dead";
    const col = dead ? SIDE_COL.dead : P.fill;
    const side = dead ? null : (v && v.indexOf("ru") === 0 ? "ru" : "ua");
    return app6Image(46, 36, "ad", { w: 29, h: 19, col, side });
  }

  function installImages(){
    if (typeof IMAGES !== "object" || !IMAGES) return;
    Object.keys(SITE_TYPES).forEach(t => {
      IMAGES["site-" + t] = () => siteSym(t);
      IMAGES["site-" + t + "-yellow"] = () => siteSym(t, "yellow");
      IMAGES["site-" + t + "-red"] = () => siteSym(t, "red");
      IMAGES["site-" + t + "-dead"] = () => siteSym(t, "dead");
    });
    ["none", "yellow", "red", "ru", "ru_yellow", "ru_red", "dead"].forEach(v => {
      IMAGES[v === "none" ? "adpost" : "adpost-" + v] = () => adSym(v);
    });
  }

  /* ---------- топографічний фон: периодичний шум → ізолінії ---------- */
  function topoTile(N){
    const F = new Float32Array(N * N);
    let seed = 7;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const octave = (cells, amp) => {
      const L = new Float32Array(cells * cells);
      for (let i = 0; i < L.length; i++) L[i] = rnd();
      const at = (i, j) => L[((j % cells + cells) % cells) * cells + ((i % cells + cells) % cells)];
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++){
        const u = x * cells / N, v = y * cells / N;
        const x0 = Math.floor(u), y0 = Math.floor(v);
        const fx = u - x0, fy = v - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
        const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
        const top = a + (b - a) * sx, bot = c + (d - c) * sx;
        F[y * N + x] += amp * (top + (bot - top) * sy);
      }
    };
    octave(4, 1); octave(8, 0.5); octave(16, 0.25);
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < F.length; i++){ if (F[i] < mn) mn = F[i]; if (F[i] > mx) mx = F[i]; }
    const LV = 11, lvl = new Uint8Array(N * N);
    for (let i = 0; i < F.length; i++) lvl[i] = Math.min(LV - 1, Math.floor((F[i] - mn) / (mx - mn) * LV));
    const data = new Uint8Array(N * N * 4);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++){
      const i = y * N + x, l = lvl[i];
      const edge = l !== lvl[y * N + (x + 1) % N] || l !== lvl[((y + 1) % N) * N + x];
      if (!edge) continue;
      const major = l % 5 === 0;
      data[i * 4] = 150; data[i * 4 + 1] = 172; data[i * 4 + 2] = 184;
      data[i * 4 + 3] = major ? 84 : 40;
    }
    return { width: N, height: N, data };
  }

  function applyStyle(map){
    const sp = map.__tacSp, sl = map.__tacSl;
    const style = map.getStyle ? map.getStyle() : null;
    const layers = (style && style.layers) || [];
    layers.forEach(l => {
      if (isHidden(l.id)) sl(l.id, "visibility", "none");
      if (l.type === "fill" && (l["source-layer"] === "landcover" || l["source-layer"] === "landuse"))
        sl(l.id, "visibility", "none");                              // суцільні підкладки не закривають рельєф
      if (SHOW_ZONE_LINES && l.id === "site-zone-line"){
        sp(l.id, "line-opacity", 0.45);
      }
    });
    try {
      map.addImage("tac-topo", topoTile(256), { pixelRatio: 1 });
      sp("background", "background-color", "#0f1316");
      sp("background", "background-pattern", "tac-topo");
    } catch (e){ console.warn("[172] фон:", e); }
  }


  /* ---------- базові шари: схема / супутник / топо / висоти ---------- */
  const BASES = {
    map:  "Схема",
    sat:  "Супутник",
    topo: "Топо",
    elev: "Висоти"
  };
  const RASTER_SRC = {
    "tac-sat-src":  { type: "raster", tileSize: 256, maxzoom: 18,
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      attribution: "Esri, Maxar, Earthstar Geographics" },
    "tac-topo-src": { type: "raster", tileSize: 256, maxzoom: 19,
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"],
      attribution: "Esri, HERE, Garmin, USGS" },
    "tac-dem-src":  { type: "raster-dem", tileSize: 256, maxzoom: 13, encoding: "terrarium",
      tiles: ["https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png"],
      attribution: "Mapzen, USGS, SRTM" }
  };
  const ELEV_RAMP = ["interpolate", ["linear"], ["elevation"],
    -50, "#1d3d5c", 0, "#2f6b52", 150, "#7aa35a", 400, "#c9b96a",
    900, "#a77c4b", 1500, "#7d6a5f", 2500, "#e8e8ea"];

  function addBaseLayers(map){
    const sl = map.__tacSl;
    const style = map.getStyle();
    const before = (style.layers.find(l => l.type !== "background") || {}).id;
    Object.keys(RASTER_SRC).forEach(id => { if (!map.getSource(id)) map.addSource(id, RASTER_SRC[id]); });
    const add = (layer) => { if (!map.getLayer(layer.id)) map.addLayer(layer, before); };
    add({ id: "tac-sat",  type: "raster", source: "tac-sat-src",  layout: { visibility: "none" } });
    add({ id: "tac-topo", type: "raster", source: "tac-topo-src", layout: { visibility: "none" } });
    add({ id: "tac-dem",  type: "color-relief", source: "tac-dem-src", layout: { visibility: "none" },
          paint: { "color-relief-color": ELEV_RAMP } });
    map.__tacSl = sl;
    setBase(map, "map");
    addSwitcher(map);
  }


  function set3D(map, on){
    map.__tac3d = !!on;
    const btn = document.getElementById("tac-3d");
    try {
      if (on){
        map.setMaxPitch && map.setMaxPitch(70);
        map.setTerrain({ source: "tac-dem-src", exaggeration: 1.6 });
        map.easeTo({ pitch: 55, duration: 700 });
      } else {
        map.setTerrain(null);
        map.easeTo({ pitch: 0, duration: 500 });
      }
    } catch (e){ console.warn("[172] 3D:", e); }
    if (btn) btn.classList.toggle("on", !!on);
  }

  function setBase(map, key){
    const sl = map.__tacSl;
    const show = { sat: "tac-sat", topo: "tac-topo", elev: "tac-dem" };
    ["tac-sat", "tac-topo", "tac-dem"].forEach(id => { if (map.getLayer(id)) sl(id, "visibility", show[key] === id ? "visible" : "none"); });
    // векторна підкладка (суцільна заливка суші) ховається, коли показано растр
    (map.getStyle().layers || []).forEach(l => {
      if (l.type !== "fill" || l.source !== "omt") return;
      const tacticalFill = l["source-layer"] === "landcover" || l["source-layer"] === "landuse";
      const visible = key === "map" && !tacticalFill;   // у схемі лісові/сільські заливки лишаються сховані, як у тактичному фоні
      sl(l.id, "visibility", visible ? "visible" : "none");
    });
    document.querySelectorAll("#tac-base button[data-k]").forEach(b => b.classList.toggle("on", b.dataset.k === key));
    const t3 = document.getElementById("tac-3d");
    if (t3){
      t3.style.display = key === "sat" ? "" : "none";
      if (key !== "sat" && map.__tac3d) set3D(map, false);   // 3D лише для супутника
    }
    map.__tacBase = key;
  }

  function addSwitcher(map){
    if (document.getElementById("tac-base")) return;
    const st = document.createElement("style");
    st.textContent = "#tac-base{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0 2px;padding:0;background:none;border:0}" +
      "#tac-base button{font:600 12px system-ui,sans-serif;color:#9aa4ae;background:transparent;border:1px solid #2a3138;border-radius:3px;padding:6px 10px;cursor:pointer}" +
      "#tac-base button:hover{color:#c9d1d9}#tac-base button.on{background:#1f2a33;color:#e6edf3}" + "#tac-3d{border-left:1px solid #2a3138;margin-left:2px;padding-left:12px}";
    document.head.appendChild(st);
    const box = document.createElement("div"); box.id = "tac-base";
    Object.keys(BASES).forEach(k => {
      const b = document.createElement("button");
      b.type = "button"; b.dataset.k = k; b.textContent = BASES[k];
      b.addEventListener("click", () => setBase(map, k));
      box.appendChild(b);
      if (k === "sat"){
        const t = document.createElement("button");
        t.type = "button"; t.id = "tac-3d"; t.textContent = "3D";
        t.title = "Рельєф і нахил камери";
        t.style.display = "none";
        t.addEventListener("click", () => set3D(map, !map.__tac3d));
        box.appendChild(t);
      }
    });
    /* layers-base:v1 — перемикач основи мапи живе в панелі «Шари мапи» (видна лише в бою), а не плаває поверх гри */
    const mount = () => {
      const pane = document.getElementById("layers");
      if (!pane) return false;
      const h = document.createElement("h4"); h.textContent = "Основа мапи";
      pane.insertBefore(box, pane.firstChild); pane.insertBefore(h, box);
      return true;
    };
    if (!mount()) document.addEventListener("DOMContentLoaded", mount, { once: true });
  }

  /* ---------- перехват карти ---------- */
  function guardMap(map){
    const sp = map.setPaintProperty.bind(map), sl = map.setLayoutProperty.bind(map);
    map.__tacSp = sp; map.__tacSl = sl;
    // шари ореолів і зон не повертаються ані через видимість, ані через прозорість
    map.setPaintProperty = (id, p, v, o) => isHidden(id) ? map : sp(id, p, v, o);
    map.setLayoutProperty = (id, p, v, o) => (isHidden(id) && p === "visibility") ? map : sl(id, p, v, o);
  }

  function wrapLib(lib){
    if (!lib || !lib.Map || lib.Map.__tac) return lib;
    const Base = lib.Map;
    class TacMap extends Base {
      constructor(opts){
        super(opts);
        try { guardMap(this); installImages(); } catch (e){ console.warn("[172] перехват:", e); }
        this.once("load", () => { try { applyStyle(this); } catch (e){ console.warn("[172] стиль:", e); } try { addBaseLayers(this); } catch (e){ console.warn("[172] базові шари:", e); } });
      }
    }
    TacMap.__tac = true;
    lib.Map = TacMap;
    return lib;
  }

  let ML = window.maplibregl || null;
  if (ML) ML = wrapLib(ML);
  Object.defineProperty(window, "maplibregl", {
    configurable: true, enumerable: true,
    get(){ return ML; },
    set(v){ ML = wrapLib(v); }
  });

  /* експорт знаків для інших шарів (танки, піхота, штаби) */
  window.TAC_APP6 = {
    kinds: ["art", "ad", "inf", "arm", "hq", "inst"],
    image: (kind, side, col, W = 40, H = 40) => app6Image(W, H, kind, { w: W * 0.7, h: H * 0.5, col, side })
  };
})();

