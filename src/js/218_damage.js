
/* SKYDOMINION · 218 · ADVANCED AIR DEFENSE DAMAGE SYSTEM
 *
 * DAMAGE:
 * 1 hit                 -> DAMAGED
 * CRIT_HITS hits        -> CRITICAL
 * REPAIR                -> REPAIRING
 * Repair completed      -> OPERATIONAL
 *
 * Integration:
 * BV_DND_HOST.HOOKS.fx
 * BV_DND_HOST.HOOKS.adBlock
 * BV_QUICK.list()
 *
 * Core combat logic remains unchanged.
 */

(function boot() {
  "use strict";

  if (window.BV_DMG) return;

  const H = window.BV_DND_HOST;

  if (
    !H || !H.HOOKS ||
    typeof H.HOOKS.fx !== "function" ||
    !window.BV_QUICK ||
    !window.BV_QUICK_UI ||
    !window.BV_LINK
  ) {
    setTimeout(boot, 200);
    return;
  }

  const CFG = Object.assign({
    NEAR_KM: 1.5,
    CRIT_HITS: 3,
    REPAIR_MS: 60000,
    UPDATE_MS: 500,
    MAX_HITS: 100,
    REPAIR_INTERRUPTED_BY_HIT: true
  }, window.BV_DMG_CFG || {});

  CFG.NEAR_KM = Math.max(0, Number(CFG.NEAR_KM) || 1.5);
  CFG.CRIT_HITS = Math.max(1, Math.floor(Number(CFG.CRIT_HITS) || 3));
  CFG.REPAIR_MS = Math.max(1000, Number(CFG.REPAIR_MS) || 60000);
  CFG.UPDATE_MS = Math.max(100, Number(CFG.UPDATE_MS) || 500);

  const HOOKS = H.HOOKS;
  const ST = new Map();

  const toast = message => {
    try {
      H.toast?.(message);
    } catch (_) {}
  };

  const units = () => {
    try {
      return window.BV_QUICK.list() || [];
    } catch (_) {
      return [];
    }
  };

  const get = id => {
    if (!ST.has(id)) {
      ST.set(id, {
        hits: 0,
        until: 0,
        repaired: false
      });
    }
    return ST.get(id);
  };

  const validPos = p =>
    Array.isArray(p) &&
    p.length >= 2 &&
    Number.isFinite(Number(p[0])) &&
    Number.isFinite(Number(p[1])) &&
    Math.abs(Number(p[0])) <= 180 &&
    Math.abs(Number(p[1])) <= 90;

  function distanceKm(a, b) {
    if (!validPos(a) || !validPos(b)) return Infinity;

    const lat = Number(a[1]) * Math.PI / 180;
    const dx = 111.32 * Math.cos(lat);

    return Math.hypot(
      (Number(a[0]) - Number(b[0])) * dx,
      (Number(a[1]) - Number(b[1])) * 110.574
    );
  }

  /*
   * SYSTEM STATES
   * 0 OPERATIONAL
   * 1 DAMAGED
   * 2 CRITICAL
   * 3 REPAIRING
   */

  function level(id) {
    const s = ST.get(id);

    if (!s) return 0;

    if (s.until > performance.now()) return 3;
    if (s.hits >= CFG.CRIT_HITS) return 2;
    if (s.hits > 0) return 1;

    return 0;
  }

  function status(id) {
    const s = ST.get(id);
    const lv = level(id);

    const names = [
      "OPERATIONAL",
      "DAMAGED",
      "CRITICAL",
      "REPAIRING"
    ];

    return {
      id,
      level: lv,
      state: names[lv],
      hits: s?.hits || 0,
      repairRemaining: s
        ? Math.max(0, s.until - performance.now())
        : 0,
      operational: lv === 0,
      canRepair: lv === 1 || lv === 2
    };
  }

  function onHit(position) {
    if (!validPos(position)) return;

    const list = units();

    for (const u of list) {
      if (
        !u ||
        u.id == null ||
        !validPos(u.pos)
      ) continue;

      if (distanceKm(u.pos, position) > CFG.NEAR_KM) continue;

      const s = get(u.id);
      const previous = level(u.id);

      // A hit during repair interrupts the repair process.
      if (previous === 3 && CFG.REPAIR_INTERRUPTED_BY_HIT) {
        s.until = 0;
        toast(`${u.name}: ремонт перервано — нове пошкодження`);
      }

      s.hits = Math.min(CFG.MAX_HITS, s.hits + 1);

      const current = level(u.id);

      if (current === 1 && previous === 0) {
        toast(`${u.name}: техніку пошкоджено`);
      }

      if (current === 2 && previous !== 2) {
        toast(`${u.name}: КРИТИЧНІ ПОШКОДЖЕННЯ`);
      }
    }
  }

  function repair(id) {
    const u = units().find(x => x && x.id === id);

    if (!u) return false;

    const s = get(id);
    const lv = level(id);

    if (lv !== 1 && lv !== 2) return false;

    s.until = performance.now() + CFG.REPAIR_MS;

    toast(
      `${u.name}: розпочато ремонт (${Math.ceil(CFG.REPAIR_MS / 1000)} с)`
    );

    return true;
  }

  function repairAll() {
    let count = 0;

    for (const u of units()) {
      if (u && repair(u.id)) count++;
    }

    return count;
  }

  /*
   * REPAIR PROCESSING
   */

  const timer = setInterval(() => {
    const now = performance.now();
    const list = units();
    const alive = new Set(list.map(u => u.id));

    for (const [id, s] of ST) {
      if (!alive.has(id)) {
        ST.delete(id);
        continue;
      }

      if (s.until && s.until <= now) {
        s.until = 0;
        s.hits = 0;
        s.repaired = true;

        const u = list.find(x => x.id === id);

        if (u) {
          toast(`${u.name}: ремонт завершено — система справна`);
        }
      }
    }
  }, CFG.UPDATE_MS);

  /*
   * FX HOOK INTEGRATION
   * Preserves the previous hook and its return value.
   */

  const prevFx = HOOKS.fx;

  HOOKS.fx = function () {
    let result;

    try {
      result = prevFx.apply(this, arguments);
    } finally {
      try {
        onHit(arguments[0]);
      } catch (error) {
        console.error("[BV_DMG] Damage processing error:", error);
      }
    }

    return result;
  };

  /*
   * COMMAND BLOCKING
   */

  const prevBlock = HOOKS.adBlock;

  const ORDER_OPS = new Set([
    "move",
    "airCmd",
    "airAtk",
    "rtb",
    "mode",
    "reload",
    "prio",
    "skip",
    "skipAll",
    "loadout",
    "manual",
    "remove",
    "alert",
    "add"
  ]);

  HOOKS.adBlock = function (op, args) {
    const previous = prevBlock
      ? prevBlock.apply(this, arguments)
      : null;

    if (previous) return previous;

    if (!ORDER_OPS.has(op) || !args || args.id == null) {
      return null;
    }

    const lv = level(args.id);

    if (lv !== 2 && lv !== 3) return null;

    const u = units().find(x => x.id === args.id);
    const name = u?.name || "Система ППО";

    return lv === 3
      ? `${name}: ремонт триває — наказ відхилено`
      : `${name}: критичні пошкодження — необхідний ремонт`;
  };

  /*
   * PUBLIC API
   */

  window.BV_DMG = {
    level,
    status,
    repair,
    repairAll,
    hit: onHit,
    cfg: CFG,

    isOperational(id) {
      return level(id) === 0;
    },

    isBlocked(id) {
      const lv = level(id);
      return lv === 2 || lv === 3;
    },

    getAll() {
      return units().map(u => status(u.id));
    },

    destroy() {
      clearInterval(timer);

      if (HOOKS.fx !== prevFx) {
        // Do not overwrite hooks installed by later modules.
        console.warn("[BV_DMG] FX hook was replaced by another module.");
      }
    }
  };

  console.info("[BV_DMG] Advanced damage system initialized.");
})();
