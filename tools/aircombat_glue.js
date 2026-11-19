/* ---------- Air combat integration — BV_AC bridge ----------
   Loaded after 02k_aircombat.js and 03_game.js.
   Creates the BV_AC engine and exposes a small runtime API without changing the base game loop.
*/
(function(root){
  "use strict";
  const api = root.BV_AC;
  if(!api){ console.warn("BV_AC: module is not loaded"); return; }

  const toSide = u => u && (u.side || u.sd || u.SIDE) || "ua";
  const canFly = u => u && u.pos && u.state !== "base" && u.state !== "reload" && u.state !== "dead";
  const groundSams = () => [];

  const env = {
    rand: Math.random,
    say(side, msg, kind){
      if(root.HOOKS && typeof root.HOOKS.adHint === "function") root.HOOKS.adHint(side, msg);
      else console.info("["+side+"]", msg, kind||"");
    },
    fx(kind, pos){ if(kind === "launch" || kind === "kill" || kind === "hit") root.dispatchEvent(new CustomEvent("bv-ac-fx",{detail:{kind,pos}})); },
    kill(t){
      if(root.ADS && root.ADS.units && root.ADS.units.has(t.gameId)){
        root.ADS.units.delete(t.gameId); root.ADS.dirty = true;
      }
    },
    damaged(t, by, dmg){ root.dispatchEvent(new CustomEvent("bv-ac-damage",{detail:{target:t.id,damge:dmg}})); },
    cue(side, t){
      if(!root.RAD || !root.RAD.sim) return null;
      return {q:0.55,via:"radar-net",conf:0.55};
    }
  };

  const engine = api.create(env);

  function collect(){
    const actors=[];
    const sams=groundSams();
    if(root.ADS && root.ADS.units){
      for(const u of root.ADS.units.values()){
        const T=root.AD_TYPES && root.AD_TYPES[u.key];
        if(!T || !T.air || !canFly(u)) continue;
        const st=u.__bvac || (u.__bvac={hp:api.perf(u.key).hp, alt:api.perf(u.key).alt[0], flares:0, chaff:0});
        actors.push({
          id:"game:"+u.id, gameId:u.id, key:u.key, side:toSide(u), label:T.n||u.key,
          pos:u.pos.slice(), alt:st.alt||api.perf(u.key).alt[0], hdg:u.hdg||0,
          spd:u.spd||T.spd||1, cls:api.perf(u.key).cls, airborne:true, free:false,
          pilot:true, st,
          ammo(){ const ld=u.ld||{}; const out={}; for(const k in ld) if(ld[k]>0) out[k]=ld[k]; return Object.keys(out).length?out:null; }
        });
      }
    }
    return {actors,sams};
  }

  let last=performance.now(), acc=0;
  function frame(now){
    const sd=Math.min(0.5,(now-last)/1000); last=now;
    acc+=sd;
    if(acc>=0.2){
      try{ const c=collect(); engine.step(acc,c.actors,c.sams); } catch(e){ console.error("BV_AC step:",e); }
      acc=0;
    }
    root.requestAnimationFrame(frame);
  }
  root.requestAnimationFrame(frame);

  root.BV_AC_GAME = {
    engine,
    stats:engine.stats,
    missiles:engine.mis,
    decoys:engine.dec,
    collect
  };
})(typeof window!=="undefined"?window:globalThis);
