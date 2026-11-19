// Браузерний тест реалізму атак (7.63): node tools/test_browser_atkreal.js <abs dist.html>; MAPLIBRE=<maplibre-gl/dist/>
const{chromium}=require('playwright');const ML=process.env.MAPLIBRE||'';
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']}),p=await b.newPage({viewport:{width:1000,height:700}});const errs=[];p.on('pageerror',e=>errs.push(String(e)));
await p.route(/maplibre-gl\.(js|css)/,r=>{const u=r.request().url();r.fulfill({path:ML+(u.endsWith('.css')?'maplibre-gl.css':'maplibre-gl.js'),contentType:u.endsWith('.css')?'text/css':'application/javascript'})});
await p.route(/tiles\.openfreemap|fonts\.g|peerjs|monobank/,r=>r.abort());
await p.goto('file://'+process.argv[2]+'#debug');await p.waitForTimeout(5000);
console.log(await p.evaluate(()=>window.BV_EVAL(`(()=>{try{
 startGame({mode:"duel",ctx:"sandbox",ctrl:{ua:"me",ru:"bot"}});
 const E=ecoE("ru"); const a0=carAvail("ru","tu95"), f0=E&&E.fleet?E.fleet.tu95:null;
 atkLanded({key:"tu95",sd:"ru"}); const a1=carAvail("ru","tu95");
 SIM.t+=200; const a2=carAvail("ru","tu95");
 GAME.phase="run"; const t={id:99999,kind:"c",key:"tu95",sd:"ru"}; onDown(t,{side:"ua",kills:0});
 return {a0,f0,a1,a2,fleetAfterLoss:E&&E.fleet?E.fleet.tu95:null,avAfter:carAvail("ru","tu95")}}catch(e){return "ERR "+e.stack.slice(0,300)}})()`)));
console.log('errors',errs.slice(0,5));await b.close()})()
