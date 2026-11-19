// Бенчмарк у headless-Chromium: node tools/test_browser_bench.js <abs dist.html> [N цілей]. Потрібні playwright і MAPLIBRE=<шлях до maplibre-gl/dist/> (npm i maplibre-gl).
// Запускає пісочницю (?play=free#debug), спавнить N шахедів, міряє FPS і топ функцій за CPU-профілем.
const{chromium}=require('playwright');const ML=process.env.MAPLIBRE||'';
const N=+process.argv[3]||300;
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']}),p=await b.newPage({viewport:{width:1400,height:850}});const errs=[];p.on('pageerror',e=>errs.push(String(e)));
await p.route(/maplibre-gl\.(js|css)/,r=>{const u=r.request().url();r.fulfill({path:ML+(u.endsWith('.css')?'maplibre-gl.css':'maplibre-gl.js'),contentType:u.endsWith('.css')?'text/css':'application/javascript'})});
await p.route(/tiles\.openfreemap|fonts\.g|peerjs|monobank/,r=>r.abort());
await p.goto('file://'+process.argv[2]+'?play=free#debug');await p.waitForTimeout(6000);
console.log('eval',await p.evaluate(()=>typeof window.BV_EVAL),'units',await p.evaluate(()=>window.BV_EVAL('units.size')));
const sp=await p.evaluate((N)=>{try{let k=0;for(let i=0;i<N;i++){spawnWeapon("shahed",0,[36+Math.random()*2,50+Math.random()*1.5],[30.5+Math.random()*.5,50.4+Math.random()*.3],"direct");k++;}return k+" "+units.size}catch(e){return "ERR "+e.message}},N).catch(async()=>null);
console.log('spawn',await p.evaluate((N)=>window.BV_EVAL(`(()=>{try{let k=0;for(let i=0;i<${N};i++){spawnWeapon("shahed",0,[36+Math.random()*2,50+Math.random()*1.5],[30.5+Math.random()*.5,50.4+Math.random()*.3],"direct");k++;}return k+" units="+units.size}catch(e){return "ERR "+e.message}})()`),N));
const cdp=await p.context().newCDPSession(p);await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
const fps=await p.evaluate(()=>new Promise(res=>{let n=0,t0=performance.now(),mx=0,l=t0;const f=t=>{n++;mx=Math.max(mx,t-l);l=t;if(t-t0>5000)res({fps:n/((t-t0)/1000),maxFrameMs:mx});else requestAnimationFrame(f)};requestAnimationFrame(f)}));
const prof=(await cdp.send('Profiler.stop')).profile;
console.log(fps, 'units',await p.evaluate(()=>window.BV_EVAL('units.size')));
const self=new Map();const dt=prof.timeDeltas;const idx=new Map(prof.nodes.map(n=>[n.id,n]));
prof.samples.forEach((id,i)=>{const n=idx.get(id);const k=n.callFrame.functionName+':'+n.callFrame.lineNumber;self.set(k,(self.get(k)||0)+(dt[i]||0))});
const tot=[...self.values()].reduce((a,b)=>a+b,0);
console.log([...self.entries()].sort((a,b)=>b[1]-a[1]).slice(0,18).map(([k,v])=>(v/tot*100).toFixed(1)+'% '+k).join('\n'));
console.log(errs.slice(0,5));await b.close()})()
