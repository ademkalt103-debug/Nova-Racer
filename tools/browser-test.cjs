const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.NOVA_URL||'http://127.0.0.1:3123';
const checks=[],errors=[],requests=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let browser;
async function page(){const c=await browser.newContext({viewport:{width:1280,height:800}});const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>requests.push(r.url()));await p.goto(base);await p.waitForFunction(()=>window.novaState);return p;}
async function state(p){return p.evaluate(()=>window.novaState);}
async function click(p,x,y){await p.mouse.click(x,y);await delay(150);}
async function wait(p,fn){await p.waitForFunction(fn,null,{timeout:8000});}
(async()=>{
 fs.mkdirSync('evidence',{recursive:true});
 browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 const a=await page();assert.equal((await state(a)).cash,25000);await a.screenshot({path:'evidence/starter.png'});await click(a,900,187);await wait(a,()=>window.novaState.starterChosen);assert.equal((await state(a)).cash,7000);checks.push('Starter selection: 25000 -> 7000');
 await a.reload();await wait(a,()=>window.novaState?.starterChosen);assert.equal((await state(a)).cash,7000);checks.push('Purchase persisted across reload');
 await click(a,950,50);await click(a,900,408);await wait(a,()=>window.novaState.cash===3880);await a.screenshot({path:'evidence/tuning.png'});checks.push('Engine upgrade and purchase deduction');
 await click(a,780,50);await a.screenshot({path:'evidence/garage.png'});await click(a,900,575);await wait(a,()=>window.novaState.countdown===0);await a.keyboard.down('w');await delay(1400);await a.keyboard.down('Shift');await delay(500);await a.keyboard.up('Shift');await a.keyboard.down('a');await a.keyboard.down('Space');await delay(350);await a.keyboard.up('Space');await a.keyboard.up('a');await a.keyboard.up('w');await delay(200);const driving=await state(a);assert(driving.speed>40);assert(driving.nos<100);assert(driving.drift>0);await a.screenshot({path:'evidence/race.png'});checks.push('Keyboard acceleration, nitro drain and drift scoring');
 await a.keyboard.press('p');await wait(a,()=>window.novaState.paused);const before=(await state(a)).elapsed;await delay(350);assert.equal((await state(a)).elapsed,before);await a.keyboard.press('p');await wait(a,()=>!window.novaState.paused);await a.keyboard.press('r');await delay(200);assert((await state(a)).speed<1);await a.keyboard.press('Escape');await wait(a,()=>!window.novaState.racing);checks.push('Pause freezes simulation; reset and garage controls work');
 const b=await page();await click(b,900,187);await wait(b,()=>window.novaState.starterChosen);
 for(const p of[a,b]){await click(p,780,92);await click(p,900,212);await delay(300);await click(p,850,262);await p.keyboard.type('BROWSER7');await delay(150);}
 await click(a,810,314);await wait(a,()=>window.novaState.room==='BROWSER7');await click(b,1100,314);await wait(b,()=>window.novaState.players===2);await wait(a,()=>window.novaState.players===2);checks.push('Two isolated browser contexts create/join one room');
 await click(a,900,428);await wait(a,()=>window.novaState.racing);await wait(b,()=>window.novaState.racing);await delay(3000);if((await state(a)).paused)await a.keyboard.press('p');await a.keyboard.down('w');await delay(1200);await a.keyboard.up('w');await wait(b,()=>window.novaState.remotes===1);await wait(a,()=>window.novaState.remotes===1);await a.screenshot({path:'evidence/multiplayer-host.png'});await b.screenshot({path:'evidence/multiplayer-guest.png'});checks.push('Host start sync and remote car state rendered in both clients');
 await a.close();await b.close();
 assert.equal(errors.length,0,errors.join('\n'));const external=requests.filter(u=>!u.startsWith(base)&&!u.startsWith(base.replace(/^http/,'ws')));assert.deepEqual(external,[]);checks.push('No page errors or third-party network requests');
 fs.writeFileSync('evidence/browser.json',JSON.stringify({checked_at:new Date().toISOString(),checks,errors,requests:[...new Set(requests)],driving},null,2));console.log(JSON.stringify({passed:checks.length,checks},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
