// Runs the shipped WASM with recorded normal inputs; no race/save mutation exports.
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const all=JSON.parse(fs.readFileSync('evidence/gameplay-fixtures.json'));
 const bytes=fs.readFileSync('web/nova-client.wasm'),enc=new TextEncoder(),dec=new TextDecoder();
 let frames=0,worst=0;const failures=[];let cases=0;
 for(const c of all.filter(c=>c.kind!=='edge'&&(!process.env.NOVA_PARITY_CASE||c.name===process.env.NOVA_PARITY_CASE))){
  let memory,snapshot;const events=[];
  const env={nr_read(kind,p,cap){let s=kind===0?JSON.stringify(c.save):kind===1?'2026-10-21':kind===7?(events.shift()||''):'';const b=enc.encode(s);if(b.length>cap)return 0;new Uint8Array(memory.buffer,p,b.length).set(b);return b.length;},nr_write(kind,p,n){if(kind===6)snapshot=JSON.parse(dec.decode(new Uint8Array(memory.buffer,p,n)));}};
  const {instance}=await WebAssembly.instantiate(bytes,{env});memory=instance.exports.memory;instance.exports.nova_init();
  const tick=(dt,k)=>instance.exports.nova_frame(1280,800,dt,k,0,-1,-1,0);
  events.push(JSON.stringify({type:'launch'}));tick(0,0);for(let i=0;i<152;i++)tick(1/60,0);
  for(const [i,[k,e]]of c.frames.entries()){
   tick(1/60,k);const r=snapshot.race,s=snapshot.save,p=s.challengeProgress;
   const actual=[r.speedKmh,r.nos,r.yaw,r.pos.x,r.pos.y,r.pos.z,r.driftAngle,null,r.driftPointsCurrent,r.driftCombo,null,null,null,r.stuntCashEarned,r.lap,r.sampleIdx,r.rank,+r.finished,(p.d_drift||0),(p.d_nearmiss||0),(p.d_airtime||0),(p.p_topspeed||0),(p.p_wins||0),s.cash,s.xp,s.level,s.freeSpins];
   for(let j=0;j<actual.length;j++){if(actual[j]===null)continue;assert(Number.isFinite(actual[j])&&Number.isFinite(e[j]),`${c.name} nonfinite field ${j}: ${actual[j]} expected ${e[j]}`);const error=Math.abs(actual[j]-e[j]);worst=Math.max(worst,error);const tol=j<7?1e-7:0;if(error>tol&&failures.length<5)failures.push(`${c.name} frame ${i} field ${j}: ${actual[j]} vs ${e[j]}`);}
   frames++;
  }cases++;console.log('WASM replayed',c.name);
 }
 const report={cases,frames,maxAbsoluteError:worst,failures,description:'Shipped WASM game export replayed original ordinary input traces after its real countdown. Edge cases requiring position injection excluded. Economy/finish and visible physics compared.'};fs.writeFileSync('evidence/wasm-parity.json',JSON.stringify(report,null,2));console.log(report);assert.deepEqual(failures,[]);
})().catch(e=>{console.error(e);process.exitCode=1;});
