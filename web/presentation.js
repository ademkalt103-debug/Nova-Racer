// Presentation adapter only: geometry/materials, DOM, camera, particles and audio.
// All purchases, rewards, saves, simulation and multiplayer authority live in Rust.
import {OriginalPresentationMethods} from './presentation-methods.js';
import {THREE,SoundEngineV6,buildVehicleMesh,buildTrack3D,VEHICLE_CATALOG,TUNING_CATEGORIES,TRACKS,CHALLENGES} from './visual-assets.js';
const byId=id=>document.getElementById(id);
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;}
function dispose(root){if(!root)return;const geometries=new Set(),materials=new Set();root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}
export class Presentation extends OriginalPresentationMethods{
 constructor(snapshot,dispatch){
  super();this.dispatch=dispatch;this.snapshot=snapshot;this.state=freeze(snapshot.save);this.sound=new SoundEngineV6();this.sound.muted=snapshot.muted;
  this.activeBottomTab='drive';this.activeTuningCat='engine';this.previewCarId=null;this.inRace=false;this.raceCamMode=0;
  this.workshopGroup=null;this.raceGroup=null;this.playerMesh=null;this.trackDataRuntime=null;this.aiVehicles=[];this.smokeParticles=[];this.skidMeshes=[];this.remotePeers={};
  this.remotePlayersGroup=new THREE.Group();this.garageCamPreset='hero';this.camStartPos=new THREE.Vector3(4.8,2.1,5.4);this.camStartTarget=new THREE.Vector3(0,0.65,0);this.camGoalPos=this.camStartPos.clone();this.camGoalTarget=this.camStartTarget.clone();this.camCurrentPos=this.camStartPos.clone();this.camCurrentTarget=this.camStartTarget.clone();this.camLerpT=1;
  this.initThree();this.setupWorkshopScene();this.bindUI();if(!this.state.starterChosen)this.openStarterSelectionModal();else this.refreshAllGarageUI();
  this.lastSave='';this.lastCar='';this.lastTab='';this.lastNotice='';this.lastStunt=0;this.lastCount=null;this.lastCrate=0;this.wasFinished=false;this.wasRacing=false;this.lastSoundProfile='';
 }
 getCarById(id=this.state.selectedCarId){return VEHICLE_CATALOG.find(c=>c.id===id)||VEHICLE_CATALOG[0];}
 getCarTuning(id=this.state.selectedCarId){return this.state.tuning[id]||{};}
 getCarColors(id=this.state.selectedCarId){return this.state.colors[id]||{body:this.getCarById(id).defaultColor,rims:'#fbbf24',neon:'#00f3ff'};}
 getEffectiveStats(id=this.state.selectedCarId){return this.snapshot.stats[id]||this.snapshot.stats[VEHICLE_CATALOG[0].id];}
 spawnDriftSmokeAndSkid(...args){const old=this.skidMeshes.length>=140?this.skidMeshes[0]:null;super.spawnDriftSmokeAndSkid(...args);if(old&&!this.skidMeshes.includes(old))dispose(old);}
 // Dispose replaced meshes; the original accumulated GPU objects after previews.
 rebuildWorkshopCar(id=this.state.selectedCarId){if(!this.workshopGroup)return;if(this.playerMesh){this.workshopGroup.remove(this.playerMesh);dispose(this.playerMesh);}this.playerMesh=buildVehicleMesh(this.getCarById(id),this.getCarTuning(id),this.getCarColors(id));this.workshopGroup.add(this.playerMesh);}
 setupWorkshopScene(){dispose(this.raceGroup);dispose(this.workshopGroup);super.setupWorkshopScene();}
 bindUI(){
  const on=(id,type,fn)=>byId(id)?.addEventListener(type,fn);
  document.querySelectorAll('.bottom-tab-btn').forEach(b=>b.addEventListener('click',()=>this.dispatch({type:'tab',id:b.dataset.tab})));
  on('btn-top-soundcheck','click',()=>this.sound.playSoundCheck(this.getCarById().soundProfile));
  on('btn-prev-owned','click',()=>this.dispatch({type:'cycle',dir:-1}));on('btn-next-owned','click',()=>this.dispatch({type:'cycle',dir:1}));
  document.querySelectorAll('.cam-preset-btn').forEach(b=>b.addEventListener('click',()=>{this.setWorkshopCameraPreset(b.dataset.cam);this.sound.playTone(720,0.06);}));
  on('btn-cam-reset-hero','click',()=>this.setWorkshopCameraPreset('hero'));
  for(const id of ['body','rims','neon'])on('tune-color-'+id,'input',e=>this.dispatch({type:'color',id,value:e.target.value}));
  on('dealer-class-filter','change',()=>this.renderDealershipPanel());
  for(const [id,type,open] of [['btn-toggle-challenges','challenges',true],['btn-close-challenges','challenges',false],['btn-open-crate-modal','crate',true],['btn-close-crate','crate',false]])on(id,'click',()=>this.dispatch({type,open}));
  on('btn-spin-crate','click',()=>this.dispatch({type:'spin'}));on('btn-toggle-mute','click',()=>this.dispatch({type:'mute'}));
  on('btn-mp-join','click',()=>this.dispatch({type:'room',mode:'join',code:byId('mp-target-code').value}));
  on('btn-mp-sync-start','click',()=>this.dispatch({type:'sync'}));
  // Keep the original panel and labels; add explicit local-relay controls.
  const panel=byId('panel-multiplayer');const extras=document.createElement('div');extras.className='flex flex-wrap gap-2 my-2';
  panel.querySelector('span').textContent='Rust WebSocket Lobby';byId('mp-target-code').maxLength=10;byId('mp-target-code').placeholder='TEAM-CODE';
  for(const [id,label,action]of [['btn-mp-connect','RELAY VERBINDEN',{type:'connect'}],['btn-mp-create','RAUM ERSTELLEN',null],['btn-mp-leave','RAUM VERLASSEN',{type:'leave'}]]){const b=document.createElement('button');b.id=id;b.textContent=label;b.className='px-3 py-2 rounded-xl bg-slate-800 text-cyan-300 text-xs font-display';b.addEventListener('click',()=>this.dispatch(action||{type:'room',mode:'create',code:byId('mp-target-code').value}));extras.appendChild(b);}panel.appendChild(extras);
  for(const id of ['btn-launch-race','btn-finish-rematch'])on(id,'click',()=>this.dispatch({type:'launch'}));
  for(const id of ['btn-race-quit','btn-finish-to-garage'])on(id,'click',()=>this.dispatch({type:'garage'}));
  on('btn-race-cam','click',()=>this.dispatch({type:'camera'}));

  const note=document.createElement('div');note.id='rust-notice';note.className='fixed bottom-24 left-1/2 -translate-x-1/2 z-50 glass-panel rounded-xl px-4 py-2 font-display text-sm text-cyan-300 hidden';document.body.appendChild(note);
 }
 setTab(tab){this.activeBottomTab=tab;document.querySelectorAll('.bottom-tab-btn').forEach(b=>{const active=b.dataset.tab===tab;b.className=`bottom-tab-btn flex-1 py-2.5 px-3 rounded-xl font-display font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2 ${active?'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/25':'bg-slate-900/80 text-slate-300 hover:text-white'}`;});for(const id of ['drive','tuning','dealership','multiplayer'])byId('panel-'+id).classList.toggle('hidden',id!==tab);if(tab!=='tuning'){this.previewCarId=null;this.setWorkshopCameraPreset('hero');this.rebuildWorkshopCar();}this.refreshAllGarageUI();}
 buildRace(){
  this.inRace=true;this.startLevel=this.state.level;this.wasFinished=false;this.lastStunt=0;this.lastCount=null;this.steerVisual=0;this.sound.stopRaceAudio();
  if(this.workshopGroup){this.scene.remove(this.workshopGroup);dispose(this.workshopGroup);this.workshopGroup=null;}if(this.raceGroup){this.scene.remove(this.raceGroup);dispose(this.raceGroup);}
  const track=TRACKS.find(t=>t.id===this.state.selectedTrackId)||TRACKS[0];this.scene.background=new THREE.Color(track.sky);this.scene.fog=new THREE.FogExp2(track.sky,0.0018);this.trackDataRuntime=buildTrack3D(track);this.raceGroup=this.trackDataRuntime.group;this.scene.add(this.raceGroup);
  this.playerMesh=buildVehicleMesh(this.getCarById(),this.getCarTuning(),this.getCarColors());this.raceGroup.add(this.playerMesh);
  this.aiVehicles=[];for(let i=0;i<3;i++){const car=VEHICLE_CATALOG[(i*3+2)%VEHICLE_CATALOG.length];const mesh=buildVehicleMesh(car,{}, {body:car.defaultColor});this.raceGroup.add(mesh);this.aiVehicles.push({mesh});}
  this.smokeParticles=[];this.skidMeshes=[];byId('garage-ui').classList.add('hidden');byId('race-hud').classList.remove('hidden');byId('finish-modal').classList.add('hidden');byId('speedlines-canvas').classList.remove('hidden');byId('stunt-ticker-stack').replaceChildren();
 }
 renderCrate(crate){
  if(crate.seq!==this.lastCrate){this.lastCrate=crate.seq;const reel=byId('slot-reel');reel.style.transition='none';reel.style.transform='translateX(0px)';reel.replaceChildren();const names=['+$5.000 Cash','+450 Ruf-XP','+$14.000 Jackpot','Beta RR 50 Moped','Bangkok TukTuk','Stark Varg Supermoto'];const rarity=['Common','Common','Rare','Kult-Meme','Kult-Meme','Legendary'];const colors=['border-slate-500 text-slate-200','border-cyan-400 text-cyan-300','border-emerald-400 text-emerald-300','border-amber-400 text-amber-300','border-fuchsia-400 text-fuchsia-300','border-rose-400 text-rose-300'];
   for(const i of crate.items){const tile=document.createElement('div');tile.className=`w-32 h-20 shrink-0 rounded-xl bg-slate-900 border-2 ${colors[i]} flex flex-col items-center justify-center p-2 text-center`;const r=document.createElement('span');r.className='text-[9px] font-display uppercase opacity-75';r.textContent=rarity[i];const n=document.createElement('span');n.className='font-display font-bold text-xs mt-1';n.textContent=names[i];tile.append(r,n);reel.appendChild(tile);}
   requestAnimationFrame(()=>{const center=reel.parentElement.clientWidth/2-64;reel.style.transition='transform 3.2s cubic-bezier(0.12, 0.85, 0.2, 1)';reel.style.transform=`translateX(${-24*136+center}px)`;});let clicks=0;const timer=setInterval(()=>{clicks++;this.sound.playTone(420+(clicks%5)*60,0.04);if(clicks>18)clearInterval(timer);},150);
  }byId('btn-spin-crate').disabled=crate.busy;byId('crate-result-banner').textContent=crate.result?'🎉 GEWONNEN: '+crate.result:'';
 }
 network(snapshot){
  byId('mp-own-code').textContent=snapshot.room||'—';byId('mp-peer-count').textContent=String(Math.max(0,snapshot.players.length-1));const badge=byId('mp-status-badge');badge.textContent=snapshot.connected?'Online & Bereit':'Relay nicht verbunden';badge.className='text-xs font-display '+(snapshot.connected?'text-emerald-400':'text-slate-400');
  const list=byId('mp-peer-list');const key=JSON.stringify(snapshot.players);if(key!==this.lastPlayers){this.lastPlayers=key;list.replaceChildren();for(const p of snapshot.players){const li=document.createElement('li');li.className='flex items-center justify-between bg-slate-950/70 px-2.5 py-1.5 rounded-lg';li.textContent=(p.id===snapshot.hostId?'HOST · ':'')+(p.name||'PILOT')+' · '+p.carName;list.appendChild(li);}}
 }
 apply(snapshot){
  this.snapshot=snapshot;this.state=freeze(snapshot.save);this.raceCamMode=snapshot.camera;this.sound.muted=snapshot.muted;byId('btn-toggle-mute').textContent=snapshot.muted?'🔇':'🔊';
  const racing=!!snapshot.race;if(racing&&!this.wasRacing)this.buildRace();if(!racing&&this.wasRacing){this.setupWorkshopScene();byId('race-hud').classList.add('hidden');byId('garage-ui').classList.remove('hidden');byId('finish-modal').classList.add('hidden');}
  this.inRace=racing;this.wasRacing=racing;
  if(!racing){for(const remote of Object.values(this.remotePeers))remote.mesh.visible=false;const saveKey=JSON.stringify(this.state);if(saveKey!==this.lastSave){this.lastSave=saveKey;this.previewCarId=null;this.refreshAllGarageUI();this.rebuildWorkshopCar();if(snapshot.challengesOpen)this.renderChallengesModal();}
   if(snapshot.tab!==this.lastTab){this.lastTab=snapshot.tab;this.setTab(snapshot.tab);}this.updateWorkshopCamera(snapshot.dt);
  }else{this.raceFrame(snapshot);}
  byId('starter-modal').classList.toggle('hidden',this.state.starterChosen);byId('challenges-modal').classList.toggle('hidden',!snapshot.challengesOpen);if(snapshot.challengesOpen&&!this.wasChallenges)this.renderChallengesModal();this.wasChallenges=snapshot.challengesOpen;byId('crate-modal').classList.toggle('hidden',!snapshot.crateOpen);this.renderCrate(snapshot.crate);this.network(snapshot);
  byId('rust-notice').textContent=snapshot.notice;byId('rust-notice').classList.toggle('hidden',!snapshot.notice);
  this.renderer.render(this.scene,this.camera);
 }
 raceFrame(snapshot){
  if(snapshot.race.finished){this.showFinish(snapshot.race);return;}
  if(this.raceRuntime&&(snapshot.race.paused||(snapshot.race.finished&&this.wasFinished))){this.sound.stopRaceAudio();byId('hud-countdown').textContent=snapshot.race.paused?'PAUSE':'';byId('hud-countdown').classList.toggle('hidden',!snapshot.race.paused);return;}
  const r=snapshot.race,dt=snapshot.dt;const pos=new THREE.Vector3(r.pos.x,r.pos.y,r.pos.z);const samples=this.trackDataRuntime.samples;const sample=samples[r.sampleIdx%420];const next=samples[(r.sampleIdx+1)%420];const slope=next.point.y-sample.point.y;
  const heading=new THREE.Vector3(Math.sin(r.yaw+r.driftAngle),slope*0.85,Math.cos(r.yaw+r.driftAngle)).normalize();const right=new THREE.Vector3().crossVectors(sample.up,heading).normalize();const up=new THREE.Vector3().crossVectors(heading,right).normalize();const targetQuat=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,heading));this.playerMesh.quaternion.slerp(targetQuat,dt*10);this.playerMesh.position.copy(pos);
  const steer=((snapshot.keys&4)?1:0)-((snapshot.keys&8)?1:0);this.steerVisual=THREE.MathUtils.lerp(this.steerVisual||0,steer*0.42,dt*12);for(const p of this.playerMesh.userData.frontWheelPivots)p.rotation.y=this.steerVisual;for(const w of this.playerMesh.userData.allWheelMeshes)w.rotation.x+=r.moveMeters*1.8;for(const f of this.playerMesh.userData.flames)f.visible=r.isNos;
  const drifting=r.isDrifting&&!r.paused&&!r.finished;
  if(drifting&&Math.random()<0.65)this.spawnDriftSmokeAndSkid(new THREE.Vector3(r.smokePos.x,r.smokePos.y,r.smokePos.z),r.yaw+r.driftAngle,new THREE.Vector3(1,0,0));
  for(let i=this.smokeParticles.length-1;i>=0;i--){const p=this.smokeParticles[i];p.life-=dt;p.mesh.position.y+=dt*1.1;p.mesh.scale.addScalar(dt*2.2);p.mesh.material.opacity=Math.max(0,p.life*0.6);if(p.life<=0){this.raceGroup.remove(p.mesh);dispose(p.mesh);this.smokeParticles.splice(i,1);}}
  this.aiVehicles.forEach((a,i)=>{const b=r.bots[i];a.mesh.visible=!!b;if(b){const s=samples[Math.floor(b.sNorm*420)%420];a.mesh.position.copy(s.point).addScaledVector(s.right,b.laneOffset);a.mesh.rotation.y=Math.atan2(s.tangent.x,s.tangent.z);}});
  const ids=new Set(snapshot.remotes.map(r=>r.id));for(const [id,remote]of Object.entries(this.remotePeers)){if(!ids.has(id)){this.remotePlayersGroup.remove(remote.mesh);dispose(remote.mesh);delete this.remotePeers[id];}}
  for(const remote of snapshot.remotes){let peer=this.remotePeers[remote.id];if(!peer||peer.carId!==remote.carId){if(peer){this.remotePlayersGroup.remove(peer.mesh);dispose(peer.mesh);}const mesh=buildVehicleMesh(this.getCarById(remote.carId),{}, {body:remote.color});this.remotePlayersGroup.add(mesh);peer=this.remotePeers[remote.id]={mesh,carId:remote.carId};}peer.mesh.visible=true;peer.mesh.position.set(remote.pos.x,remote.pos.y,remote.pos.z);peer.mesh.rotation.y=remote.yaw;}
  const speedRatio=Math.min(1,Math.abs(r.speedKmh)/this.getEffectiveStats().maxKmh);this.camera.fov=THREE.MathUtils.lerp(this.camera.fov,60+speedRatio*15+(r.isNos?7:0),dt*6);this.camera.updateProjectionMatrix();const camDist=this.raceCamMode===0?6.8:this.raceCamMode===1?9.8:-0.4;const camH=this.raceCamMode===0?2.5:this.raceCamMode===1?3.8:1.15;const shake=speedRatio>0.75?(speedRatio-0.75)*0.14:0;this.camera.position.lerp(new THREE.Vector3(pos.x-Math.sin(r.yaw)*camDist+(Math.random()-0.5)*shake,pos.y+camH+(Math.random()-0.5)*shake,pos.z-Math.cos(r.yaw)*camDist),dt*11);this.camera.lookAt(pos.x+Math.sin(r.yaw)*12,pos.y+1,pos.z+Math.cos(r.yaw)*12);this.renderSpeedLines(speedRatio,r.isNos);
  const thresholds=[0,52,98,148,205,268,440];let gear=1;for(let i=1;i<thresholds.length;i++)if(Math.abs(r.speedKmh)>=thresholds[i])gear=Math.min(6,i+1);const rpm=THREE.MathUtils.clamp((Math.abs(r.speedKmh)-(thresholds[gear-1]||0))/((thresholds[gear]||100)-(thresholds[gear-1]||0)),0.12,0.99);
  this.raceRuntime={...r,pos,quat:this.playerMesh.quaternion,gear:r.speedKmh< -1?'R':gear,rpmNorm:rpm};this.updateRaceHUD(r.rank);byId('hud-pos').textContent=`${r.rank}/4`;
  const count=r.countdown>0?Math.ceil(r.countdown/0.85):r.elapsed<0.85?'GO!':'';byId('hud-countdown').textContent=r.paused?'PAUSE':String(count);byId('hud-countdown').classList.toggle('hidden',!count&&!r.paused);if(count!==this.lastCount){if(count)this.sound.playTone(count==='GO!'?960:540,count==='GO!'?0.28:0.14);this.lastCount=count;}
  if(!r.finished&&!r.paused&&!snapshot.muted){if(!this.sound.running)this.sound.startRaceAudio(this.getCarById().soundProfile);this.sound.updateRaceAudio(rpm,r.isNos,drifting?0.9:((snapshot.keys&2)&&r.speedKmh>60?0.55:0));}else this.sound.stopRaceAudio();
  if(r.stuntCashEarned!==this.lastStunt&&r.toastTime>0){this.lastStunt=r.stuntCashEarned;for(const event of r.stunts){const stack=byId('stunt-ticker-stack');while(stack.children.length>=3)stack.firstChild.remove();const t=document.createElement('div');t.className='glass-panel px-3.5 py-1.5 rounded-xl border '+event.style+' font-display font-black text-xs shadow-lg transition-all duration-300';t.textContent=event.label+' (+$'+event.cash+' • +'+event.nos+'% NOS)';stack.appendChild(t);setTimeout(()=>t.remove(),2300);this.sound.playTone(880,0.09);}}
 }
 showFinish(r){if(!this.wasFinished){this.wasFinished=true;this.sound.stopRaceAudio();this.sound.playTone(1040,0.35);byId('finish-levelup-banner').classList.toggle('hidden',this.state.level<=this.startLevel);byId('finish-time').textContent=byId('hud-time').textContent;byId('finish-base-cash').textContent='+$'+(TRACKS.find(t=>t.id===this.state.selectedTrackId)||TRACKS[0]).reward.toLocaleString();byId('finish-stunt-cash').textContent='+$'+r.stuntCashEarned.toLocaleString();byId('finish-xp').textContent='+'+(480+Math.round(r.stuntCashEarned*0.15))+' XP';byId('finish-modal').classList.remove('hidden');}}
}
