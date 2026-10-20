// Differential fixtures: runs the actual archived controller at the same dt/input as Rust.
// Fixtures may seed positions/speeds to reach edge cases; they are not human-play proof.
const fs=require('node:fs'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const cat=require('../crates/core/data/catalog.json');let browser;
(async()=>{
 browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage();await page.addInitScript(()=>{window.requestAnimationFrame=()=>1;Math.random=()=>0.5;});
 await page.goto('http://127.0.0.1:3214');await page.waitForFunction(()=>window.novaRacerV6);
 const scenarios=[];
 for(const track of cat.tracks) {
  for(const car of cat.cars)scenarios.push({name:`${track.id}/${car.id}/controls`,track:track.id,car:car.id,mode:'circuit',kind:'controls',initial:{}});
  for(const [name,initial] of Object.entries({near:{idx:10,speed:120,nos:10,bots:[[10/420,0,0],[10/420,0,0],[10/420,0,0]]},slip:{idx:10,speed:120,bots:[[12/420,0,0],[.5,0,0],[.6,0,0]]},offroad:{idx:100,speed:180,offroad:20},landing:{idx:200,speed:170,height:.01,airtime:.6},wrap:{idx:0,lastSample:419,speed:5}}))scenarios.push({name:`${track.id}/${name}`,track:track.id,car:'starter_golf2',mode:name==='wrap'?'timeattack':'circuit',kind:'edge',initial});
  for(const mode of cat.modes)scenarios.push({name:`${track.id}/${mode.id}/finish`,track:track.id,car:'starter_golf2',mode:mode.id,kind:'driver',initial:{}});
 }
 const cases=[];
 for(const sc of scenarios){
  const result=await page.evaluate(sc=>{
   const g=novaRacerV6;g.returnToWorkshop();
   const save={version:6,cash:123456,xp:250,level:6,starterChosen:true,ownedCars:[sc.car],selectedCarId:sc.car,selectedTrackId:sc.track,selectedMode:sc.mode,freeSpins:0,tuning:{[sc.car]:{engine:2,aero:2,exhaust:1,suspension:2,rims:2}},colors:{},challengeProgress:{d_drift:0,d_nearmiss:0,d_airtime:0,p_wins:0,p_topspeed:0,p_cars:1},challengeClaimed:{}};
   g.state=structuredClone(save);g.startRace();clearInterval(g.cdTimer);const r=g.raceRuntime;r.countdown=0;g.__rank=1;
   g.updateRaceHUD=rank=>g.__rank=rank;g.renderSpeedLines=()=>{};g.broadcastMultiplayerPacket=()=>{};g.spawnDriftSmokeAndSkid=()=>{};
   const samples=g.trackDataRuntime.samples,init=sc.initial;
   if(init.idx!==undefined){r.pos.copy(samples[init.idx].point);r.sampleIdx=r.lastSampleIdx=init.idx;r.yaw=Math.atan2(samples[init.idx].tangent.x,samples[init.idx].tangent.z);}
   if(init.lastSample!==undefined)r.lastSampleIdx=init.lastSample;
   if(init.speed!==undefined)r.speedKmh=init.speed;if(init.nos!==undefined)r.nos=init.nos;
   if(init.height)r.pos.y+=init.height;if(init.airtime)r.airborneTime=init.airtime;
   if(init.offroad)r.pos.addScaledVector(samples[r.sampleIdx].right,init.offroad);
   if(init.bots)g.aiVehicles.forEach((b,i)=>{[b.sNorm,b.speedKmh,b.laneOffset]=init.bots[i];});
   const snapshot=()=>{const s=g.state,p=s.challengeProgress;return [r.speedKmh,r.nos,r.yaw,r.pos.x,r.pos.y,r.pos.z,r.driftAngle,r.driftTimer,r.driftPointsCurrent,r.driftCombo,r.airborneTime,r.velY,r.slipstreamTimer,r.stuntCashEarned,r.lap,r.sampleIdx,g.__rank,+r.finished,p.d_drift,p.d_nearmiss,p.d_airtime,p.p_topspeed,p.p_wins,s.cash,s.xp,s.level,s.freeSpins,...g.aiVehicles.flatMap(b=>[b.sNorm,b.nearMissCooldown])];};
   const frames=[];
   for(let i=0;i<(sc.kind==='driver'?60000:sc.kind==='edge'?180:720);i++){
    let k;
    if(sc.kind==='driver') {let idx=0,best=Infinity;for(let j=0;j<420;j++){const p=samples[j].point,d=(p.x-r.pos.x)**2+(p.z-r.pos.z)**2;if(d<best){best=d;idx=j;}}const p=samples[(idx+5)%420].point,desired=Math.atan2(p.x-r.pos.x,p.z-r.pos.z);const error=((desired-r.yaw+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;k=(r.speedKmh<110?1:0)|(r.speedKmh>125?2:0)|(error>.025?4:0)|(error<-.025?8:0);}
    else if(sc.kind==='edge')k=1;
    else k=i<180?1:i<270?33:i<390?21:i<450?1:i<510?0:i<630?2:10;
    g.keys={gas:!!(k&1),brake:!!(k&2),left:!!(k&4),right:!!(k&8),handbrake:!!(k&16),nos:!!(k&32)};
    g.updateRacePhysics(1/60);frames.push([k,snapshot()]);if(r.finished)break;
   }
   return {...sc,save,frames,finished:r.finished};
  },sc);
  if(sc.kind==='driver')assert(result.finished,sc.name+' original driver failed');cases.push(result);console.log('Captured',sc.name,result.frames.length);
 }
 fs.mkdirSync('evidence',{recursive:true});fs.writeFileSync('evidence/gameplay-fixtures.json',JSON.stringify(cases));
 const r=cp.spawnSync('cargo',['run','--quiet','-p','nova-core','--example','parity'],{input:JSON.stringify(cases),encoding:'utf8',maxBuffer:20*1024*1024});if(r.stderr)process.stderr.write(r.stderr);assert(r.stdout,'Rust replay produced no result');const report=JSON.parse(r.stdout);fs.writeFileSync('evidence/gameplay-parity.json',JSON.stringify({...report,description:'Actual original V6 physics vs Rust f64, identical per-frame inputs and 1/60 s dt. Seeded edge fixtures and deterministic drivers are automated evidence, not human play.'},null,2));console.log(report);assert.equal(r.status,0,'Gameplay parity mismatch');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();});
