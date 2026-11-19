// usage: node shot.js file.html out.png [js-to-eval-after]
const{chromium}=require('playwright');const fs=require('fs');(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']}),p=await b.newPage({viewport:{width:1400,height:850}});const errs=[];p.on('pageerror',e=>errs.push(String(e)));
await p.route(/maplibre-gl\.(js|css)/,r=>{const u=r.request().url();r.fulfill({path:__dirname+(u.endsWith('.css')?'/maplibre-gl.css':'/maplibre-gl.js'),contentType:u.endsWith('.css')?'text/css':'application/javascript'})});
await p.route(/tiles\.openfreemap|fonts\.g/,r=>r.abort());
await p.goto('file://'+process.argv[2]);await p.waitForTimeout(5000);
if(process.argv[4]){console.log(JSON.stringify(await p.evaluate(process.argv[4])))}
await p.screenshot({path:process.argv[3]});console.log(errs.slice(0,8));await b.close()})()
