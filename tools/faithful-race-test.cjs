// Full Rust/WASM sprint with normal key events and virtual animation time.
// Intermediate GPU draws are thinned only to accelerate the test; final UI is rendered.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.NOVA_URL||'http://127.0.0.1:3123';let browser;
(async()=>{
 const roads=JSON.parse(fs.readFileSync('evidence/roads.json','utf8').replace(/^\uFEFF/,''));
 browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const p=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{window.testFrames=[];window.testClock=performance.now();window.requestAnimationFrame=cb=>(window.testFrames.push(cb),1);});await p.goto(base);
 for(let i=0;i<100;i++){if(await p.evaluate(()=>window.testFrames.length>0))break;await new Promise(r=>setTimeout(r,30));}
 async function frames(n){await p.evaluate(n=>{for(let i=0;i<n;i++){const q=window.testFrames.splice(0);window.testClock+=1000/60;for(const cb of q)cb(window.testClock);}},n);}
 await frames(6);await p.locator('.btn-starter-pick').first().click();await frames(6);
 await p.evaluate(()=>{const p=novaPresentation;window.originalRender=p.renderer.render.bind(p.renderer);let calls=0;p.renderer.render=(...args)=>{if(++calls%30===0)window.originalRender(...args);};});
 await p.locator('#drive-mode-list button').nth(2).click();await frames(6);await p.locator('#btn-launch-race').click();await frames(170);
 assert.equal(await p.evaluate(()=>novaState.mode),'timeattack');
 const report=await p.evaluate(async road=>{
  const held=new Set();const set=(code,on)=>{if(on&&!held.has(code)){window.dispatchEvent(new KeyboardEvent('keydown',{code,key:code==='KeyW'?'w':code==='KeyS'?'s':code==='KeyA'?'a':'d'}));held.add(code);}else if(!on&&held.has(code)){window.dispatchEvent(new KeyboardEvent('keyup',{code}));held.delete(code);}};let frames=0;
  while(!novaState.finished&&frames<18000){const s=novaState,p=s.position;let idx=0,best=Infinity;road.forEach((r,i)=>{const d=(r.x-p.x)**2+(r.z-p.z)**2;if(d<best){best=d;idx=i;}});const t=road[(idx+6)%420];const desired=Math.atan2(t.x-p.x,t.z-p.z);const e=((desired-s.yaw+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;set('KeyW',s.speed<105);set('KeyS',s.speed>115);set('KeyA',e>0.03);set('KeyD',e< -0.03);
   for(let i=0;i<6;i++){const q=testFrames.splice(0);testClock+=1000/60;for(const cb of q)cb(testClock);frames++;}if(frames%300===0)await new Promise(r=>setTimeout(r,0));}
  for(const code of [...held])set(code,false);window.originalRender(novaPresentation.scene,novaPresentation.camera);return{frames,state:novaState,save:JSON.parse(localStorage.getItem('novaRacerRustSaveV1'))};
 },roads.woerthersee);
 assert(report.state.finished,JSON.stringify(report.state));assert.equal(report.state.lap,2);assert(report.save.cash>=13500);assert.equal(report.save.freeSpins,1);assert(report.save.xp>0);assert(await p.locator('#finish-modal').isVisible());await p.screenshot({path:'evidence/race-finish.png'});
 const cash=report.save.cash;await frames(600);assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('novaRacerRustSaveV1')).cash),cash);
 await p.locator('#btn-finish-to-garage').click();await frames(6);await p.locator('#btn-open-crate-modal').click();await frames(6);await p.locator('#btn-spin-crate').click();await frames(6);assert(await p.locator('#btn-spin-crate').isDisabled());assert.equal(await p.locator('#slot-reel > div').count(),30);await frames(210);assert(!(await p.locator('#btn-spin-crate').isDisabled()));assert.match(await p.locator('#crate-result-banner').textContent(),/GEWONNEN/);assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('novaRacerRustSaveV1')).freeSpins),0);
 assert.deepEqual(errors,[]);report.checks=['WASM sprint completed through ordinary keyboard events, without teleport/save injection','Original finish modal rendered and reward persisted','Continued frames cannot pay again','Original 30-tile crate animation receives Rust-reserved spin and Rust-settled reward'];report.errors=errors;report.rendering='Normal UI test renders all frames; this accelerated race thins intermediate GPU draws to one in 30.';
 fs.writeFileSync('evidence/browser-race.json',JSON.stringify(report,null,2));console.log(JSON.stringify({frames:report.frames,elapsed:report.state.elapsed,cash,checks:report.checks}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
