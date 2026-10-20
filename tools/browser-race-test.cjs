// Browser WASM race using a virtual animation clock and ordinary keyboard events.
// The reference road is exported by `cargo run -p nova-core --example roads`.
// No game state, lap, position, finish flag or save is injected into the client.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.NOVA_URL||'http://127.0.0.1:3123';
let browser;
(async()=>{
 const roads=JSON.parse(fs.readFileSync('evidence/roads.json','utf8').replace(/^\uFEFF/,''));
 browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 const p=await browser.newPage({viewport:{width:1280,height:800}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{window.testFrames=[];window.testClock=performance.now();window.requestAnimationFrame=cb=>(window.testFrames.push(cb),1);});
 await p.goto(base);await p.waitForFunction(()=>window.testFrames.length>0);
 async function frames(n){await p.evaluate(n=>{for(let i=0;i<n;i++){const q=window.testFrames.splice(0);window.testClock+=1000/60;for(const cb of q)cb(window.testClock);}},n);}
 async function click(x,y){await p.mouse.click(x,y);await frames(6);}
 await frames(6);await click(900,187);await click(810,495);await click(900,575);await frames(170);
 assert.equal((await p.evaluate(()=>window.novaState)).mode,'timeattack');
 const report=await p.evaluate(async road=>{
   const held=new Set();const set=(code,on)=>{if(on&&!held.has(code)){window.dispatchEvent(new KeyboardEvent('keydown',{code,key:code==='KeyW'?'w':code==='KeyS'?'s':code==='KeyA'?'a':'d'}));held.add(code);}else if(!on&&held.has(code)){window.dispatchEvent(new KeyboardEvent('keyup',{code}));held.delete(code);}};
   let frames=0;
   while(!window.novaState.finished&&frames<18000){
     const s=window.novaState,point=s.position;
     let idx=0,best=Infinity;road.forEach((p,i)=>{const d=(p.x-point.x)**2+(p.z-point.z)**2;if(d<best){idx=i;best=d;}});
     const target=road[(idx+6)%road.length];const desired=Math.atan2(target.x-point.x,target.z-point.z);const error=((desired-s.yaw+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
     set('KeyW',s.speed<105);set('KeyS',s.speed>115);set('KeyA',error>0.03);set('KeyD',error< -0.03);
     for(let k=0;k<6;k++){const q=window.testFrames.splice(0);window.testClock+=1000/60;for(const cb of q)cb(window.testClock);frames++;}
     if(frames%300===0)await new Promise(resolve=>setTimeout(resolve,0));
   }
   for(const code of [...held])set(code,false);
   return {frames,state:window.novaState,save:JSON.parse(localStorage.getItem('novaRacerRustSaveV1'))};
 },roads.woerthersee);
 assert(report.state.finished,JSON.stringify(report.state));assert.equal(report.state.lap,2);assert(report.save.cash>=13500);assert.equal(report.save.freeSpins,1);assert(report.save.xp>0);
 await p.screenshot({path:'evidence/race-finish.png'});
 const cash=report.save.cash;await frames(600);assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('novaRacerRustSaveV1')).cash),cash);
 assert.deepEqual(errors,[]);report.checks=['Real browser/WASM completes sprint using keyboard events and virtual animation time','Finish screen displayed','Cash, XP and one free spin persisted','Continued frames cannot award twice'];report.errors=errors;
 fs.writeFileSync('evidence/browser-race.json',JSON.stringify(report,null,2));console.log(JSON.stringify({frames:report.frames,elapsed:report.state.elapsed,cash,checks:report.checks}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
