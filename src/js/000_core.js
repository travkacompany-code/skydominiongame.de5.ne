/* SKYDOMINION · 000 · CORE — ядро розширень (етап 9.0)
   Вшивається ПЕРШИМ скриптом (tools/apply_core.py). Без DOM і без залежностей: працює
   в браузері та в Node (тести tools/test_core.js). Гра без ядра працює як раніше.

   Що дає:
   • events      — шина подій з ізоляцією помилок обробників.
   • rng         — детермінований генератор (mulberry32) з збереженням стану.
   • kinds/content — реєстр контенту (країни, техніка, події, механіки…) зі схемами й перевіркою посилань.
   • mods        — моди ЛИШЕ з даними: атомарне завантаження, префікси імен, явні перевизначення, вивантаження.
   • systems     — ігрові системи з порядком за залежностями (детермінований), ізоляція збоїв.
   • commands    — чисті команди з журналом; сесія відтворюється з seed + журналу (основа мультиплеєра lockstep).
   • scenarios   — формат сценарію зі строгою валідацією, міграціями і канонічною серіалізацією (для редактора).
   • checksum    — хеш стану для виявлення рассинхронізації між гравцями.

   Правило детермінізму: системи й команди мають брати випадковість ТІЛЬКИ з session.rng,
   не чіпати Date/Math.random/performance і не залежати від порядку реєстрації. */
(function (root) {
  "use strict";
  if (root.BV_CORE) return;

  var CORE_VERSION = "1.0.0";
  var API = 1;                       // версія API для модів (поле api у маніфесті)
  var FORMAT = "skydominion.scenario";
  var FORMAT_VERSION = 1;            // поточна версія формату сценарію
  var LOG_WARN_MAX = 200;

  // ------------------------------------------------------------------ помилки
  var ERRORS = [];
  var quiet = false;
  function fail(where, msg) {
    var e = { where: String(where), msg: String(msg), t: now() };
    ERRORS.push(e);
    if (ERRORS.length > LOG_WARN_MAX) ERRORS.shift();
    if (!quiet && root.console && root.console.warn) root.console.warn("[BV_CORE] " + e.where + ": " + e.msg);
    return e;
  }

  function now() {
    return (typeof root.performance !== "undefined" && root.performance.now) ? root.performance.now() : Date.now();
  }

  // ------------------------------------------------------------------ утиліти
  // Канонічний JSON: ключі відсортовані, NaN/Infinity → null, функції відкидаються.
  function canon(v) {
    if (v === null || v === undefined) return "null";
    var t = typeof v;
    if (t === "number") return isFinite(v) ? String(v) : "null";
    if (t === "string" || t === "boolean") return JSON.stringify(v);
    if (t !== "object") return "null";
    if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
    var keys = Object.keys(v).filter(function (k) {
      return v[k] !== undefined && typeof v[k] !== "function";
    }).sort();
    return "{" + keys.map(function (k) { return JSON.stringify(k) + ":" + canon(v[k]); }).join(",") + "}";
  }

  // FNV-1a 32 біт; стабільний між браузерами й Node.
  function hash32(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  function clone(v) { return JSON.parse(canon(v)); }

  function freezeDeep(o) {
    if (o && typeof o === "object" && !Object.isFrozen(o)) {
      Object.keys(o).forEach(function (k) { freezeDeep(o[k]); });
      Object.freeze(o);
    }
    return o;
  }

  var TYPES = {
    string: function (v) { return typeof v === "string"; },
    number: function (v) { return typeof v === "number" && isFinite(v); },
    boolean: function (v) { return typeof v === "boolean"; },
    array: function (v) { return Array.isArray(v); },
    object: function (v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  };

  // ------------------------------------------------------------------ події
  function makeBus() {
    var m = new Map();
    return {
      on: function (name, fn) {
        if (typeof fn !== "function") throw new TypeError("events.on: очікується функція");
        var s = m.get(name);
        if (!s) { s = new Set(); m.set(name, s); }
        s.add(fn);
        return function () { s.delete(fn); };
      },
      off: function (name, fn) { var s = m.get(name); if (s) s.delete(fn); },
      emit: function (name, data) {
        var s = m.get(name);
        if (!s || !s.size) return 0;
        var n = 0;
        Array.from(s).forEach(function (fn) {
          try { fn(data); n++; } catch (e) { fail("event:" + name, (e && e.message) || e); }
        });
        return n;
      },
      count: function (name) { var s = m.get(name); return s ? s.size : 0; }
    };
  }
  var events = makeBus();

  // ------------------------------------------------------------------ RNG
  // mulberry32. Стан можна зберегти (rng.state) і відновити — для збереження й реплеїв.
  function makeRng(seed) {
    var s = (seed >>> 0) || 0x9e3779b9;
    var r = {
      next: function () {
        s = (s + 0x6d2b79f5) >>> 0;
        var t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      },
      int: function (a, b) { return a + Math.floor(r.next() * (b - a + 1)); },
      pick: function (arr) {
        if (!arr.length) throw new RangeError("rng.pick: порожній масив");
        return arr[Math.floor(r.next() * arr.length)];
      },
      fork: function (label) { return makeRng(hash32(s + ":" + String(label))); }
    };
    Object.defineProperty(r, "state", {
      get: function () { return s; },
      set: function (v) { s = v >>> 0; }
    });
    return r;
  }

  // ------------------------------------------------------------------ реєстр контенту
  var KINDS = new Map();   // kind -> { fields }
  var STORE = new Map();   // kind -> Map(id -> { def, source })
  var ID_RE = /^[a-z][a-z0-9_]{0,39}(:[a-z][a-z0-9_]{0,39})?$/;
  var KIND_RE = /^[a-z][a-z0-9_]{0,31}$/;

  function defineKind(kind, fields) {
    if (!KIND_RE.test(kind)) throw new Error("defineKind: погана назва виду '" + kind + "'");
    if (KINDS.has(kind)) return false;
    KINDS.set(kind, { fields: fields || {} });
    STORE.set(kind, new Map());
    return true;
  }

  function hasEntry(kind, id, overlay) {
    if (overlay && overlay.has(kind + "|" + id)) return true;
    var st = STORE.get(kind);
    return !!(st && st.has(id));
  }

  // Перевіряє визначення за схемою виду. refHas(kind, id) — чи існує посилання.
  function validateDef(kind, def, refHas) {
    var errs = [];
    var K = KINDS.get(kind);
    if (!K) return ["невідомий вид '" + kind + "'"];
    if (!TYPES.object(def)) return ["очікується об'єкт"];
    Object.keys(K.fields).forEach(function (name) {
      var spec = K.fields[name];
      var v = def[name];
      if (v === undefined) { if (spec.req) errs.push(name + ": обов'язкове поле"); return; }
      if (!TYPES[spec.type] || !TYPES[spec.type](v)) { errs.push(name + ": очікується " + spec.type); return; }
      if (spec.enum && spec.enum.indexOf(v) < 0) errs.push(name + ": значення поза " + JSON.stringify(spec.enum));
      if (spec.type === "number") {
        if (spec.min !== undefined && v < spec.min) errs.push(name + ": менше за " + spec.min);
        if (spec.max !== undefined && v > spec.max) errs.push(name + ": більше за " + spec.max);
      }
      if (spec.type === "array" && spec.items) {
        var bad = v.filter(function (x) { return !TYPES[spec.items](x); }).length;
        if (bad) errs.push(name + ": " + bad + " елемент(ів) не є " + spec.items);
      }
      if (spec.ref && refHas) {
        var list = spec.type === "array" ? v : [v];
        list.forEach(function (x) {
          if (typeof x === "string" && !refHas(spec.ref, x)) errs.push(name + ": немає " + spec.ref + " '" + x + "'");
        });
      }
    });
    Object.keys(def).forEach(function (k) {
      if (!(k in K.fields)) errs.push(k + ": невідоме поле");
    });
    return errs;
  }

  // Перевірка набору визначень без запису. ctx: { source, modId, overrides:Set }.
  function stage(items, ctx) {
    var errors = [];
    var overlay = new Map();     // "kind|id" -> true (ті, що в цьому наборі)
    var seen = new Set();
    var refHas = function (k, id) { return hasEntry(k, id, overlay); };

    items.forEach(function (it) {
      var where = it.kind + ":" + it.id;
      if (!KINDS.has(it.kind)) { errors.push({ where: where, msg: "невідомий вид" }); return; }
      if (typeof it.id !== "string" || !ID_RE.test(it.id)) { errors.push({ where: where, msg: "погана id" }); return; }
      if (seen.has(where)) { errors.push({ where: where, msg: "дубль у наборі" }); return; }
      seen.add(where);
      if (ctx.modId && it.id.indexOf(ctx.modId + ":") !== 0 && !ctx.overrides.has(where)) {
        errors.push({ where: where, msg: "id мода має мати префікс '" + ctx.modId + ":'" });
      }
      var existing = STORE.get(it.kind).get(it.id);
      if (existing && !ctx.overrides.has(where)) {
        errors.push({ where: where, msg: "вже зайнято (" + existing.source + "); для заміни вкажіть у overrides" });
      }
      if (!existing && ctx.overrides.has(where)) {
        errors.push({ where: where, msg: "override без цілі: такого визначення немає" });
      }
      // ключ overlay має той самий вигляд, що й у hasEntry: kind|id
      overlay.set(it.kind + "|" + it.id, true);
    });
    ctx.overrides.forEach(function (w) {
      if (!seen.has(w)) errors.push({ where: w, msg: "override не є у контенті мода" });
    });

    items.forEach(function (it) {
      if (!seen.has(it.kind + ":" + it.id)) return;
      validateDef(it.kind, it.def, refHas).forEach(function (m) {
        errors.push({ where: it.kind + ":" + it.id, msg: m });
      });
    });
    return { ok: errors.length === 0, errors: errors };
  }

  function commit(items, source) {
    items.forEach(function (it) {
      STORE.get(it.kind).set(it.id, { def: freezeDeep(clone(it.def)), source: source });
    });
  }

  // Визначити одне core-визначення (без модів).
  function define(kind, id, def) {
    var r = stage([{ kind: kind, id: id, def: def }], { source: "core", overrides: new Set() });
    if (!r.ok) return { ok: false, errors: r.errors };
    commit([{ kind: kind, id: id, def: def }], "core");
    return { ok: true };
  }

  function get(kind, id) {
    var st = STORE.get(kind);
    var e = st && st.get(id);
    return e ? e.def : undefined;
  }
  function has(kind, id) { return hasEntry(kind, id, null); }
  function list(kind) {
    var st = STORE.get(kind);
    return st ? Array.from(st.keys()).sort() : [];
  }

  // Базові види. Сторонні види додаються через defineKind (у тому числі з модів не можна —
  // вид задає код ядра або гри).
  defineKind("country", {
    name: { type: "string", req: true },
    side: { type: "string", req: true },
    neighbors: { type: "array", items: "string", ref: "country" },
    tags: { type: "array", items: "string" }
  });
  defineKind("unit", {
    name: { type: "string", req: true },
    class: { type: "string", req: true, enum: ["air", "sam", "ground", "naval", "drone", "missile", "aew", "ew"] },
    cost: { type: "number", min: 0 },
    speed: { type: "number", min: 0 },
    tags: { type: "array", items: "string" }
  });
  defineKind("event", {
    name: { type: "string", req: true },
    trigger: { type: "string", req: true, enum: ["time", "condition"] },
    at: { type: "number", min: 0 },
    once: { type: "boolean" },
    effects: { type: "array", items: "object" }
  });
  defineKind("mechanic", {
    name: { type: "string", req: true },
    enabled: { type: "boolean" },
    params: { type: "object" }
  });
  defineKind("scenario", {
    title: { type: "string", req: true },
    description: { type: "string" }
  });

  // ------------------------------------------------------------------ моди (лише дані)
  var MODS = new Map();     // id -> { id, version, title, deps, ids, prev, overrides }
  var MOD_ORDER = [];
  var MANIFEST_KEYS = ["id", "version", "title", "description", "author", "api", "deps", "overrides", "content"];
  var FORBIDDEN_KEYS = ["code", "script", "systems", "html", "eval", "url", "hooks", "handlers"];

  function checkManifest(m) {
    var e = [];
    if (!TYPES.object(m)) return ["маніфест: очікується об'єкт"];
    if (!/^[a-z][a-z0-9_]{1,31}$/.test(m.id || "")) e.push("id: 2–32 символи a-z0-9_, починаючи з літери");
    if (!/^\d+\.\d+\.\d+$/.test(m.version || "")) e.push("version: очікується X.Y.Z");
    if (m.api !== undefined && (!Number.isInteger(m.api) || m.api > API || m.api < 1)) {
      e.push("api: потрібна версія API " + m.api + ", ядро має " + API);
    }
    if (m.deps !== undefined && !(TYPES.array(m.deps) && m.deps.every(TYPES.string))) e.push("deps: масив рядків");
    if (m.overrides !== undefined && !(TYPES.array(m.overrides) && m.overrides.every(TYPES.string))) {
      e.push("overrides: масив рядків виду 'kind:id'");
    }
    if (!TYPES.object(m.content)) e.push("content: об'єкт виду → масив визначень");
    FORBIDDEN_KEYS.forEach(function (k) { if (k in m) e.push(k + ": моди містять лише дані, код заборонено"); });
    Object.keys(m).forEach(function (k) {
      if (MANIFEST_KEYS.indexOf(k) < 0 && FORBIDDEN_KEYS.indexOf(k) < 0) e.push(k + ": невідоме поле маніфесту");
    });
    return e;
  }

  function loadMod(manifest, opts) {
    opts = opts || {};
    var me = checkManifest(manifest);
    if (me.length) return { ok: false, errors: me.map(function (msg) { return { where: "manifest", msg: msg }; }) };
    var id = manifest.id;
    if (MODS.has(id)) {
      if (!opts.reload) return { ok: false, errors: [{ where: "mod:" + id, msg: "вже завантажено" }] };
      var u = unloadMod(id);
      if (!u.ok) return u;
    }
    var missing = (manifest.deps || []).filter(function (d) { return !MODS.has(d); });
    if (missing.length) return { ok: false, errors: [{ where: "mod:" + id, msg: "немає залежностей: " + missing.join(", ") }] };

    var items = [];
    var cerrs = [];
    Object.keys(manifest.content).forEach(function (kind) {
      var arr = manifest.content[kind];
      if (!KINDS.has(kind)) { cerrs.push({ where: kind, msg: "невідомий вид контенту" }); return; }
      if (!TYPES.array(arr)) { cerrs.push({ where: kind, msg: "очікується масив визначень" }); return; }
      arr.forEach(function (d, i) {
        if (!TYPES.object(d) || typeof d.id !== "string") { cerrs.push({ where: kind + "[" + i + "]", msg: "потрібна string id" }); return; }
        var rest = {};
        Object.keys(d).forEach(function (k) { if (k !== "id") rest[k] = d[k]; });
        items.push({ kind: kind, id: d.id, def: rest });
      });
    });
    if (cerrs.length) return { ok: false, errors: cerrs };

    var overrides = new Set(manifest.overrides || []);
    var r = stage(items, { source: "mod:" + id, modId: id, overrides: overrides });
    if (!r.ok) return { ok: false, errors: r.errors };   // атомарно: нічого не записано

    var prev = new Map();
    items.forEach(function (it) {
      var where = it.kind + ":" + it.id;
      var old = STORE.get(it.kind).get(it.id);
      prev.set(where, old ? { def: old.def, source: old.source, kind: it.kind, id: it.id } : null);
    });
    commit(items, "mod:" + id);
    MODS.set(id, {
      id: id, version: manifest.version, title: manifest.title || id,
      deps: (manifest.deps || []).slice(), ids: items.map(function (it) { return it.kind + ":" + it.id; }),
      prev: prev, overrides: Array.from(overrides)
    });
    MOD_ORDER.push(id);
    events.emit("mod:loaded", { id: id, count: items.length });
    return { ok: true, count: items.length };
  }

  function unloadMod(id) {
    var m = MODS.get(id);
    if (!m) return { ok: false, errors: [{ where: "mod:" + id, msg: "не завантажено" }] };
    var dependents = MOD_ORDER.filter(function (x) { return MODS.get(x).deps.indexOf(id) >= 0; });
    if (dependents.length) return { ok: false, errors: [{ where: "mod:" + id, msg: "від нього залежать: " + dependents.join(", ") }] };
    var later = MOD_ORDER.slice(MOD_ORDER.indexOf(id) + 1);
    var touched = [];
    later.forEach(function (x) {
      MODS.get(x).ids.forEach(function (w) { if (m.ids.indexOf(w) >= 0) touched.push(w); });
    });
    if (touched.length) return { ok: false, errors: [{ where: "mod:" + id, msg: "пізніший мод змінив той самий контент: " + touched[0] }] };

    m.ids.forEach(function (w) {
      var p = m.prev.get(w);
      var kind = w.slice(0, w.indexOf(":"));
      var eid = w.slice(w.indexOf(":") + 1);
      if (p) STORE.get(kind).set(eid, { def: p.def, source: p.source });
      else STORE.get(kind).delete(eid);
    });
    MODS.delete(id);
    MOD_ORDER.splice(MOD_ORDER.indexOf(id), 1);
    events.emit("mod:unloaded", { id: id });
    return { ok: true };
  }

  // ------------------------------------------------------------------ сценарії
  var SCN_KEYS = ["format", "formatVersion", "id", "title", "description", "seed", "tickSec",
    "bounds", "countries", "sides", "placements", "events", "requires"];
  var SCN_ID_RE = ID_RE;
  var MIGRATIONS = {};     // від версії → функція doc → doc

  function registerMigration(fromVersion, fn) {
    if (!Number.isInteger(fromVersion) || fromVersion < 0 || typeof fn !== "function") throw new TypeError("registerMigration");
    MIGRATIONS[fromVersion] = fn;
  }

  // Ланцюжок міграцій: кожна переводить документ на наступну версію і МУСИТЬ її підняти.
  function migrateScenario(doc) {
    while (doc.formatVersion < FORMAT_VERSION) {
      var from = doc.formatVersion;
      var fn = MIGRATIONS[from];
      if (!fn) return { ok: false, errors: [{ path: "formatVersion", msg: "немає міграції з версії " + from }] };
      var next = fn(doc);
      if (!TYPES.object(next) || !Number.isInteger(next.formatVersion) || next.formatVersion <= from) {
        return { ok: false, errors: [{ path: "formatVersion", msg: "міграція з " + from + " не підняла версію" }] };
      }
      doc = next;
    }
    return { ok: true, doc: doc };
  }

  function validateScenario(input) {
    var errs = [];
    function err(p, m) { errs.push({ path: p, msg: m }); }
    if (!TYPES.object(input)) return { ok: false, errors: [{ path: "", msg: "очікується об'єкт" }] };
    var d = input;
    if (d.format !== FORMAT) err("format", "очікується '" + FORMAT + "'");
    if (!Number.isInteger(d.formatVersion)) err("formatVersion", "очікується ціле число");
    else if (d.formatVersion > FORMAT_VERSION) err("formatVersion", "новіше за ядро (" + FORMAT_VERSION + ")");
    else if (d.formatVersion < FORMAT_VERSION) {
      var m = migrateScenario(clone(d));
      if (!m.ok) return { ok: false, errors: m.errors.concat(errs) };
      d = m.doc;
    }
    Object.keys(d).forEach(function (k) { if (SCN_KEYS.indexOf(k) < 0) err(k, "невідоме поле"); });

    var refHas = function (k, id) { return hasEntry(k, id, null); };
    function ref(p, kind, id) {
      if (typeof id !== "string") return err(p, "очікується рядок-посилання");
      if (!refHas(kind, id)) err(p, "немає " + kind + " '" + id + "' у реєстрі (чи завантажено мод?)");
    }

    if (typeof d.id !== "string" || !SCN_ID_RE.test(d.id)) err("id", "погана id");
    if (typeof d.title !== "string" || !d.title.length || d.title.length > 120) err("title", "рядок 1–120 символів");
    if (!Number.isInteger(d.seed) || d.seed < 0 || d.seed > 4294967295) err("seed", "ціле 0…4294967295");
    if (d.tickSec !== undefined && (typeof d.tickSec !== "number" || d.tickSec < 1 || d.tickSec > 60)) err("tickSec", "число 1…60");

    var b = d.bounds;
    var bok = Array.isArray(b) && b.length === 4 && b.every(function (x) { return typeof x === "number" && isFinite(x); });
    if (!bok) err("bounds", "очікується [minLon, minLat, maxLon, maxLat]");
    else {
      if (!(b[0] < b[2] && b[1] < b[3])) err("bounds", "мінімум має бути меншим за максимум");
      if (b[0] < -180 || b[2] > 180 || b[1] < -90 || b[3] > 90) err("bounds", "поза межами світу");
    }
    function inBounds(lon, lat) {
      return bok && lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];
    }

    var countries = d.countries === undefined ? [] : d.countries;
    if (!Array.isArray(countries)) err("countries", "масив");
    else {
      var cs = new Set();
      countries.forEach(function (c, i) {
        ref("countries[" + i + "]", "country", c);
        if (cs.has(c)) err("countries[" + i + "]", "дубль '" + c + "'");
        cs.add(c);
      });
    }

    var sides = d.sides === undefined ? [] : d.sides;
    if (!Array.isArray(sides)) err("sides", "масив");
    else sides.forEach(function (s, i) {
      if (!TYPES.object(s) || typeof s.side !== "string") return err("sides[" + i + "]", "потрібні side і country");
      ref("sides[" + i + "].country", "country", s.country);
      if (!Array.isArray(countries) || countries.indexOf(s.country) < 0) err("sides[" + i + "].country", "країна має бути в countries");
    });

    var pl = d.placements === undefined ? [] : d.placements;
    if (!Array.isArray(pl)) err("placements", "масив");
    else {
      var ids = new Set();
      pl.forEach(function (p, i) {
        var at = "placements[" + i + "]";
        if (!TYPES.object(p)) return err(at, "об'єкт");
        if (typeof p.id !== "string" || ids.has(p.id)) err(at + ".id", "унікальна рядкова id");
        else ids.add(p.id);
        ref(at + ".unit", "unit", p.unit);
        if (typeof p.side !== "string") err(at + ".side", "рядок");
        if (typeof p.lon !== "number" || typeof p.lat !== "number") err(at, "lon і lat — числа");
        else if (!inBounds(p.lon, p.lat)) err(at, "координати поза bounds");
      });
    }

    var evs = d.events === undefined ? [] : d.events;
    if (!Array.isArray(evs)) err("events", "масив");
    else evs.forEach(function (e, i) {
      var at = "events[" + i + "]";
      if (!TYPES.object(e)) return err(at, "об'єкт");
      if (typeof e.at !== "number" || e.at < 0) err(at + ".at", "число ≥ 0 (секунди)");
      ref(at + ".event", "event", e.event);
    });

    if (d.requires !== undefined && !(Array.isArray(d.requires) && d.requires.every(TYPES.string))) {
      err("requires", "масив id модів");
    }
    if (Array.isArray(d.requires)) d.requires.forEach(function (mid, i) {
      if (typeof mid === "string" && !MODS.has(mid)) err("requires[" + i + "]", "мод '" + mid + "' не завантажено");
    });

    return { ok: errs.length === 0, errors: errs, doc: d };
  }

  function serializeScenario(doc) {
    var r = validateScenario(doc);
    if (!r.ok) throw new Error("serializeScenario: " + r.errors[0].path + ": " + r.errors[0].msg);
    return canon(r.doc);
  }

  function parseScenario(text) {
    var doc;
    try { doc = JSON.parse(text); } catch (e) { return { ok: false, errors: [{ path: "", msg: "JSON: " + e.message }] }; }
    return validateScenario(doc);
  }

  // ------------------------------------------------------------------ команди й сесії
  var HANDLERS = new Map();   // type -> { validate, apply }
  var TYPE_RE = /^[a-z][a-z0-9_.]{0,47}$/;

  function registerCommand(type, h) {
    if (!TYPE_RE.test(type)) throw new Error("registerCommand: погана назва '" + type + "'");
    if (HANDLERS.has(type)) return false;
    if (!h || typeof h.apply !== "function") throw new TypeError("registerCommand: потрібна apply(s,args,ctx)");
    HANDLERS.set(type, { validate: h.validate || null, apply: h.apply });
    return true;
  }

  // Системи: порядок — топологічний за deps, при рівних — за id (однаковий на всіх машинах).
  var SYSTEMS = new Map();
  var SYS_ORDER = null;

  function registerSystem(spec) {
    if (!spec || !TYPE_RE.test(spec.id || "")) throw new Error("registerSystem: погана id");
    if (SYSTEMS.has(spec.id)) return false;
    SYSTEMS.set(spec.id, {
      id: spec.id,
      deps: (spec.deps || []).slice(),
      init: typeof spec.init === "function" ? spec.init : null,
      update: typeof spec.update === "function" ? spec.update : null,
      errors: 0,
      disabled: false
    });
    SYS_ORDER = null;
    return true;
  }

  function resolveSystems() {
    if (SYS_ORDER) return SYS_ORDER;
    var indeg = new Map();
    var out = new Map();
    SYSTEMS.forEach(function (s, id) {
      indeg.set(id, 0);
      out.set(id, []);
    });
    SYSTEMS.forEach(function (s, id) {
      s.deps.forEach(function (d) {
        if (!SYSTEMS.has(d)) throw new Error("система '" + id + "' потребує відсутню '" + d + "'");
        out.get(d).push(id);
        indeg.set(id, indeg.get(id) + 1);
      });
    });
    var ready = Array.from(indeg.keys()).filter(function (k) { return indeg.get(k) === 0; }).sort();
    var order = [];
    while (ready.length) {
      var cur = ready.shift();
      order.push(cur);
      out.get(cur).forEach(function (n) {
        indeg.set(n, indeg.get(n) - 1);
        if (indeg.get(n) === 0) ready.push(n);
      });
      ready.sort();
    }
    if (order.length !== SYSTEMS.size) {
      var stuck = Array.from(indeg.keys()).filter(function (k) { return indeg.get(k) > 0; });
      throw new Error("цикл залежностей систем: " + stuck.join(", "));
    }
    SYS_ORDER = order;
    return order;
  }

  function checksum(s) {
    var txt = canon({ tick: s.tick, seq: s.seq, rng: s.rng.state, world: s.world });
    var h = hash32(txt);
    return { value: h, hex: ("00000000" + h.toString(16)).slice(-8) };
  }

  function createSession(opts) {
    opts = opts || {};
    var order = resolveSystems();
    var s = {
      seed: (opts.seed >>> 0),
      tickSec: opts.tickSec || 1,
      tick: 0,
      seq: 0,
      rng: makeRng(opts.seed >>> 0),
      world: opts.world ? clone(opts.world) : {},
      log: [],
      order: order
    };
    order.forEach(function (id) {
      var sys = SYSTEMS.get(id);
      if (sys.init) sys.init(s);
    });
    return s;
  }

  function dispatch(s, cmd) {
    if (!cmd || typeof cmd.type !== "string") return { ok: false, error: "очікується type" };
    var h = HANDLERS.get(cmd.type);
    if (!h) return { ok: false, error: "невідома команда '" + cmd.type + "'" };
    var args = cmd.args === undefined ? {} : cmd.args;
    if (!TYPES.object(args)) return { ok: false, error: "args: очікується об'єкт" };
    try { JSON.stringify(args); } catch (e) { return { ok: false, error: "args: не серіалізується" }; }
    var actor = String(cmd.actor === undefined ? "system" : cmd.actor);
    if (h.validate) {
      var err = h.validate(s, args, { actor: actor });
      if (err) return { ok: false, error: String(err) };
    }
    try {
      h.apply(s, args, { actor: actor });
    } catch (e) {
      // Обробники мають повністю перевіряти вхід до зміни стану (див. CORE.md).
      return { ok: false, error: "apply: " + ((e && e.message) || e) };
    }
    var rec = { seq: s.seq + 1, tick: s.tick, actor: actor, type: cmd.type, args: clone(args) };
    s.seq = rec.seq;
    s.log.push(rec);
    return { ok: true, seq: rec.seq };
  }

  function advance(s, n) {
    n = n === undefined ? 1 : n;
    for (var k = 0; k < n; k++) {
      s.tick++;
      for (var i = 0; i < s.order.length; i++) {
        var sys = SYSTEMS.get(s.order[i]);
        if (sys.disabled || !sys.update) continue;
        try {
          sys.update(s, s.tickSec);
        } catch (e) {
          sys.errors++;
          fail("system:" + sys.id, (e && e.message) || e);
          if (sys.errors >= 5) {
            sys.disabled = true;
            events.emit("system:disabled", { id: sys.id });
          }
        }
      }
      events.emit("tick", { tick: s.tick });
    }
    return s.tick;
  }

  // Відтворення з журналу. Повертає { ok, at, error, session }.
  function replay(opts) {
    var s = createSession({ seed: opts.seed, world: opts.world, tickSec: opts.tickSec });
    var log = opts.log || [];
    var lastTick = 0;
    for (var i = 0; i < log.length; i++) {
      var rec = log[i];
      if (rec.tick < lastTick) return { ok: false, at: rec.seq, error: "журнал не монотонний за тиками", session: s };
      lastTick = rec.tick;
      while (s.tick < rec.tick) advance(s, 1);
      var r = dispatch(s, { type: rec.type, actor: rec.actor, args: rec.args });
      if (!r.ok) return { ok: false, at: rec.seq, error: r.error, session: s };
    }
    if (opts.untilTick !== undefined) while (s.tick < opts.untilTick) advance(s, 1);
    return { ok: true, session: s };
  }

  // Розбиття важкої роботи на шматки за бюджетом часу (наприклад, завантаження сценарію).
  function runBudgeted(items, fn, budgetMs, startIdx) {
    var t0 = now();
    var i = startIdx || 0;
    for (; i < items.length; i++) {
      fn(items[i], i);
      if (now() - t0 > budgetMs) { i++; break; }
    }
    return { next: i, done: i >= items.length };
  }

  function status() {
    return {
      version: CORE_VERSION,
      api: API,
      formatVersion: FORMAT_VERSION,
      kinds: Array.from(KINDS.keys()),
      counts: Array.from(KINDS.keys()).reduce(function (o, k) { o[k] = STORE.get(k).size; return o; }, {}),
      mods: MOD_ORDER.slice(),
      systems: resolveSystemsSafe(),
      commands: Array.from(HANDLERS.keys()).sort(),
      errors: ERRORS.slice(-20)
    };
  }
  function resolveSystemsSafe() {
    try { return resolveSystems().slice(); } catch (e) { return ["ERROR: " + e.message]; }
  }

  root.BV_CORE = {
    version: CORE_VERSION,
    api: API,
    FORMAT: FORMAT,
    FORMAT_VERSION: FORMAT_VERSION,
    util: { canon: canon, hash32: hash32, clone: clone },
    events: events,
    rng: makeRng,
    defineKind: defineKind,
    define: define,
    get: get,
    has: has,
    list: list,
    validateDef: function (kind, def) { return validateDef(kind, def, function (k, id) { return hasEntry(k, id, null); }); },
    loadMod: loadMod,
    unloadMod: unloadMod,
    mods: {
      list: function () { return MOD_ORDER.slice(); },
      has: function (id) { return MODS.has(id); },
      info: function (id) { var m = MODS.get(id); return m ? { id: m.id, version: m.version, title: m.title, deps: m.deps.slice(), count: m.ids.length } : null; }
    },
    registerSystem: registerSystem,
    registerCommand: registerCommand,
    createSession: createSession,
    dispatch: dispatch,
    advance: advance,
    checksum: checksum,
    replay: replay,
    validateScenario: validateScenario,
    serializeScenario: serializeScenario,
    parseScenario: parseScenario,
    registerMigration: registerMigration,
    budget: runBudgeted,
    errors: ERRORS,
    status: status,
    get quiet() { return quiet; },
    set quiet(v) { quiet = !!v; }
  };
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
