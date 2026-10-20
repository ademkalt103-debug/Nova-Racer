// Deterministic visual fixtures, distinct from the ordinary-play acceptance tests.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const catalog=require('../crates/core/data/catalog.json');
const dir='evidence/equivalence';fs.mkdirSync(dir,{recursive:true});let browser;
function clock(){
 const sim=window.__sim={now:10000,raf:[],timers:new Map(),id:1};Math.random=()=>0.5;performance.now=()=>sim.now;
 window.requestAnimationFrame=cb=>(sim.raf.push(cb),sim.id++);
 window.setTimeout=(fn,ms=0,...args)=>{const id=sim.id++;sim.timers.set(id,{fn:()=>fn(...args),due:sim.now+Math.max(0,ms),repeat:0});return id;};
 window.setInterval=(fn,ms=1,...args)=>{const id=sim.id++;sim.timers.set(id,{fn:()=>fn(...args),due:sim.now+Math.max(1,ms),repeat:Math.max(1,ms)});return id;};window.clearTimeout=window.clearInterval=id=>sim.timers.delete(id);
 sim.advance=n=>{for(let i=0;i<n;i++){sim.now+=1000/60;for(const [id,t]of [...sim.timers])if(t.due<=sim.now){if(t.repeat)t.due+=t.repeat;else sim.timers.delete(id);t.fn();}const q=sim.raf.splice(0);for(const cb of q)cb(sim.now);}};
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function open(url,fixture){const p=await browser.newPage({viewport:{width:1280,height:800}});await p.addInitScript(clock);await p.addInitScript(s=>localStorage.setItem('novaRacerV6NextLevelSave',JSON.stringify(s)),fixture);p.on('pageerror',e=>{throw Error(url+': '+e.message);});await p.goto(url);for(let n=0;n<100;n++){if(await p.evaluate(()=>window.__sim.raf.length>0))break;await sleep(30);}await p.evaluate(()=>window.__sim.advance(65));await p.evaluate(()=>document.fonts.ready);return p;}
(async()=>{
 browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const cases=[];
 for(const [name,id,tab]of [['garage','starter_golf2','drive'],['tuning','starter_e36','tuning'],['moped','cult_moped','tuning'],['tuktuk','cult_tuktuk','tuning'],['mower','cult_mower','tuning'],['hyper','hyper_jesko','tuning'],['dealership','wagon_rs6','dealership'],['suv','suv_urus','tuning'],['gt3','gt3_992','tuning']]){
  if(process.env.NOVA_COMPARE_CASE&&process.env.NOVA_COMPARE_CASE!==name)continue;
  const fixture={version:6,cash:123456,xp:250,level:6,starterChosen:true,ownedCars:[id],selectedCarId:id,selectedTrackId:'woerthersee',selectedMode:'circuit',freeSpins:2,tuning:{[id]:{engine:2,aero:2,exhaust:1,suspension:2,rims:2}},colors:{[id]:{body:'#00f3ff',rims:'#fbbf24',neon:'#ff007f'}},challengeProgress:{d_drift:500,d_nearmiss:1,d_airtime:0,p_wins:1,p_topspeed:180,p_cars:1},challengeClaimed:{}};
  const ref=await open('http://127.0.0.1:3214',fixture),rust=await open(process.env.NOVA_URL||'http://127.0.0.1:3123',fixture);
  if(tab!=='drive'){for(const p of [ref,rust]){await p.locator(`.bottom-tab-btn[data-tab="${tab}"]`).click();await p.evaluate(()=>window.__sim.advance(40));}}
  await ref.screenshot({animations:'disabled',path:`${dir}/${name}-original.png`});await rust.screenshot({animations:'disabled',path:`${dir}/${name}-rust.png`});
  const states=await Promise.all([ref.evaluate(()=>({name:novaRacerV6.state.selectedCarId,cash:novaRacerV6.state.cash,stats:novaRacerV6.getEffectiveStats()})),rust.evaluate(()=>({name:novaState.car,cash:novaState.cash,stats:novaPresentation.getEffectiveStats()}))]);
  assert.equal(states[0].name,states[1].name);assert.equal(states[0].cash,states[1].cash);for(const k of ['topSpeed','accel','handling','drift','brakes','maxKmh','pi'])assert(Math.abs(states[0].stats[k]-states[1].stats[k])<0.011,name+' '+k);
  cases.push({name,id,tab,states});await ref.close();await rust.close();console.log('Compared:',name);
 }
 const three=await import(require('node:url').pathToFileURL(require('node:path').resolve('web/three.module.js')).href);const rustRoads=JSON.parse(fs.readFileSync('evidence/roads.json','utf8').replace(/^\uFEFF/,''));let maxRoadError=0;
 for(const t of catalog.tracks){const curve=new three.CatmullRomCurve3(t.points.map(p=>new three.Vector3(p[0]*1.45,p[1]*1.35,p[2]*1.45)),true,'catmullrom',0.5);const pts=curve.getSpacedPoints(420);for(let i=0;i<420;i++){const r=rustRoads[t.id][i];maxRoadError=Math.max(maxRoadError,pts[i].distanceTo(new three.Vector3(r.x,r.y,r.z)));}}assert(maxRoadError<0.003,'Spline mismatch: '+maxRoadError);
 const previous=process.env.NOVA_COMPARE_CASE&&fs.existsSync(dir+'/comparison.json')?JSON.parse(fs.readFileSync(dir+'/comparison.json')).cases:[];
 const merged=[...previous.filter(c=>!cases.some(n=>n.name===c.name)),...cases];
 fs.writeFileSync(dir+'/comparison.json',JSON.stringify({cases:merged,maxRoadError,description:'Rendering fixtures use the same save, fixed clock and fixed visual randomness; finite CSS transitions settle before capture. These are not earned progression or human play evidence.'},null,2));console.log({passed:cases.length,maxRoadError});
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
