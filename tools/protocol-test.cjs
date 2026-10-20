// Requires Node >=22 (built-in fetch and WebSocket). Local fixtures only.
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.NOVA_URL||'http://127.0.0.1:3123';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const checks=[];const record=name=>checks.push(name);
async function client(origin){
  const ws=new WebSocket(base.replace(/^http/,'ws')+'/race');const pending=[],queue=[];
  ws.addEventListener('message',e=>{const v=JSON.parse(e.data);const i=pending.findIndex(p=>p.type===v.type);if(i>=0){const p=pending.splice(i,1)[0];clearTimeout(p.timer);p.resolve(v);}else queue.push(v);});
  const wait=type=>{const i=queue.findIndex(v=>v.type===type);if(i>=0)return Promise.resolve(queue.splice(i,1)[0]);return new Promise((resolve,reject)=>{const p={type,resolve,timer:setTimeout(()=>{pending.splice(pending.indexOf(p),1);reject(Error('Timeout '+type));},4000)};pending.push(p);});};
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  const welcome=await wait('welcome');return{ws,wait,send:v=>ws.send(JSON.stringify(v)),id:welcome.playerId,close:()=>ws.close()};
}
(async()=>{
 const health=await fetch(base+'/healthz');assert.equal(await health.text(),'OK');record('HTTP health');
 const index=await fetch(base);assert.match(index.headers.get('content-security-policy'),/default-src 'self'/);assert.equal(index.headers.get('x-content-type-options'),'nosniff');record('CSP and nosniff');
 for(const path of ['/server.js','/Cargo.toml','/.env','/..%2fCargo.toml'])assert.equal((await fetch(base+path)).status,404);record('Static allowlist rejects source and traversal');
 assert.equal((await fetch(base+'/api/leaderboard',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'})).status,400);
 assert.equal((await fetch(base+'/api/leaderboard',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'x'.repeat(9000)})})).status,413);record('Malformed and oversized HTTP bodies rejected');
 for(let i=0;i<20;i++)await fetch(base+'/api/leaderboard',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'drift',name:'<script>"bad</script>',score:500+i})});
 const board=await(await fetch(base+'/api/leaderboard')).json();assert.equal(board.drift.length,15);assert.equal(board.drift[0].score,519);assert(!board.drift[0].name.includes('<'));record('Leaderboard sanitization, ordering and 15-entry bound');
 const a=await client(),b=await client();const extra=[];
 try{
 a.send({type:'createRoom',code:'PROTO1',player:{name:'HOST'}});assert.equal((await a.wait('roomCreated')).host,true);
 b.send({type:'joinRoom',code:'MISSING'});assert.match((await b.wait('error')).message,/not found/);
 b.send({type:'joinRoom',code:'PROTO1',player:{name:'GUEST'}});assert.equal((await b.wait('joinedRoom')).host,false);record('Room creation and explicit missing-room rejection');
 b.send({type:'updateConfig',config:{trackId:'shuto_c1'}});assert.match((await b.wait('error')).message,/host/);
 b.send({type:'startRace'});assert.match((await b.wait('error')).message,/host/);record('Guest cannot change config or start race');
 a.send({type:'startRace',config:{trackId:'shuto_c1',gameMode:'timeattack'}});assert.equal((await b.wait('raceStart')).config.trackId,'shuto_c1');await a.wait('raceStart');record('Host race start broadcast');
 a.send({type:'state',state:{id:'spoof',x:1e20,y:-1e10,z:12,heading:'bad',speed:900,lap:1,sampleIdx:18}});const state=(await b.wait('playerState')).state;assert.equal(state.id,a.id);assert.equal(state.x,100000);assert.equal(state.y,-1000);assert.equal(state.heading,0);assert.equal(state.speed,650);record('State identity bound to socket and numbers clamped');
 b.send({type:'chat',text:'<b>hello</b>'});assert.equal((await a.wait('chat')).text,'bhello/b');record('Chat sanitization');
 for(let i=0;i<6;i++){const c=await client();extra.push(c);c.send({type:'joinRoom',code:'PROTO1'});await c.wait('joinedRoom');}
 const ninth=await client();extra.push(ninth);ninth.send({type:'joinRoom',code:'PROTO1'});assert.match((await ninth.wait('error')).message,/full/);record('Eight-player capacity');
 a.close();let inherited;for(let i=0;i<20;i++){const v=await b.wait('playerLeft');if(v.playerId===a.id){inherited=v;break;}}assert.equal(inherited.hostId,b.id);record('Host disconnect transfers ownership');
 const flood=await client();extra.push(flood);const closed=new Promise(resolve=>flood.ws.addEventListener('close',resolve,{once:true}));flood.ws.send('x'.repeat(32769));await Promise.race([closed,sleep(4000).then(()=>{throw Error('Oversized WS not closed');})]);record('Oversized WebSocket message disconnected');
 }finally{a.close();b.close();extra.forEach(c=>c.close());}
 for(let i=0;i<30;i++){const s=await(await fetch(base+'/api/status')).json();if(s.activeRooms===0&&s.onlinePlayers===0){record('Disconnect removes all rooms and connection slots');break;}if(i===29)throw Error('Cleanup failed');await sleep(50);}
 fs.mkdirSync('evidence',{recursive:true});fs.writeFileSync('evidence/protocol.json',JSON.stringify({checked_at:new Date().toISOString(),checks},null,2));console.log(JSON.stringify({passed:checks.length,checks},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
