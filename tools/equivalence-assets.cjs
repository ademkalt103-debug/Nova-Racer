// Development-only extraction of reviewed, presentation-only upstream sources.
// No upstream app, npm lifecycle hook or remote executable is evaluated here.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const src=fs.readFileSync('legacy/index.html','utf8').replaceAll('\r\n','\n');
const depRoot=process.env.NOVA_STYLE_DEPS;
if(!depRoot)throw Error('Set NOVA_STYLE_DEPS to the isolated reviewed presentation dependency directory');
function section(a,b){const i=src.indexOf(a),j=src.indexOf(b,i+1);if(i<0||j<0)throw Error('Missing section '+a);return src.slice(i,j);}
function method(name,next){let s=section('      '+name+'(','      '+next+'(');const end=s.lastIndexOf('\n      }');if(end<0)throw Error('Missing method '+name);return s.slice(0,end+8);}
function change(s,a,b){if(!s.includes(a))throw Error('Missing presentation replacement: '+a.slice(0,100));return s.replace(a,b);}
const names=[['initThree','openStarterSelectionModal'],['openStarterSelectionModal','setupWorkshopScene'],['setupWorkshopScene','rebuildWorkshopCar'],['rebuildWorkshopCar','setWorkshopCameraPreset'],['setWorkshopCameraPreset','updateWorkshopCamera'],['updateWorkshopCamera','startRace'],['spawnDriftSmokeAndSkid','pushStuntToast'],['renderSpeedLines','updateRaceHUD'],['updateRaceHUD','finishRaceSession'],['refreshAllGarageUI','renderDrivePanel'],['renderDrivePanel','renderTuningPanel'],['renderTuningPanel','renderDealershipPanel'],['renderDealershipPanel','renderChallengesModal'],['renderChallengesModal','initInput']];
const methods={};for(const [name,next]of names)methods[name]=method(name,next);
let s=methods.openStarterSelectionModal;
s=change(s,'this.state.selectedCarId = starterId;','this.previewCarId = starterId;');
const begin=s.indexOf('            this.state.cash = 25000 - car.price;');const end=s.indexOf('\n          });',begin);
if(begin<0||end<0)throw Error('Starter handler');s=s.slice(0,begin)+"            this.dispatch({type:'buy',id:starterId});"+s.slice(end);methods.openStarterSelectionModal=s;
s=methods.renderDrivePanel;s=change(s,"this.state.selectedTrackId = t.id;\n            this.saveState();\n            this.refreshAllGarageUI();","this.dispatch({type:'track',id:t.id});");s=change(s,"this.state.selectedMode = m.id;\n            this.saveState();\n            this.refreshAllGarageUI();","this.dispatch({type:'mode',id:m.id});");methods.renderDrivePanel=s;
s=methods.renderTuningPanel;const stageBegin=s.indexOf('              if (idx > curStage && this.state.cash < price) return;');const stageEnd=s.indexOf('\n            });',stageBegin);if(stageBegin<0||stageEnd<0)throw Error('Stage handler');s=s.slice(0,stageBegin)+"              this.dispatch({type:'stage',id:activeCatObj.id,stage:idx});"+s.slice(stageEnd);methods.renderTuningPanel=s;
s=methods.renderDealershipPanel;
s=change(s,"            this.previewCarId = car.id;\n            this.rebuildWorkshopCar(car.id);\n            this.renderDealershipPanel();","            if(this.previewCarId===car.id)return;\n            this.previewCarId = car.id;\n            this.rebuildWorkshopCar(car.id);\n            this.renderDealershipPanel();");
s=change(s,"              this.state.selectedCarId = car.id;\n              this.saveState();\n              this.rebuildWorkshopCar(car.id);\n              this.refreshAllGarageUI();","              this.dispatch({type:'buy',id:car.id});");
const buyBegin=s.indexOf('              if (this.state.cash < car.price) return;');const buyEnd=s.indexOf('\n            });',buyBegin);if(buyBegin<0||buyEnd<0)throw Error('Buy handler');s=s.slice(0,buyBegin)+"              this.dispatch({type:'buy',id:car.id});"+s.slice(buyEnd);methods.renderDealershipPanel=s;
s=methods.renderChallengesModal;const claimBegin=s.indexOf('              this.state.challengeClaimed[ch.id] = true;');const claimEnd=s.indexOf('\n            });',claimBegin);if(claimBegin<0||claimEnd<0)throw Error('Claim handler');s=s.slice(0,claimBegin)+"              this.dispatch({type:'claim',id:ch.id});"+s.slice(claimEnd);methods.renderChallengesModal=s;
methods.refreshAllGarageUI=change(methods.refreshAllGarageUI,'xpToNext(this.state.level)','this.snapshot.needXp');
methods.updateRaceHUD=change(methods.updateRaceHUD,"(performance.now() - rr.startTime) / 1000","rr.elapsed");
// All writable game/save authority has been removed from these presentation methods.
for(const [name,code]of Object.entries(methods)){if(/this\.state\.[\w.]+\s*(?:\+\+|--|[+\-]?=(?!=))|this\.state\.[\w.]+\.push\(|this\.addXP\(|this\.saveState\(/.test(code))throw Error('Game mutation remains in '+name);}
fs.mkdirSync('web',{recursive:true});
let html=src.slice(0,src.indexOf('  <script type="module">'))+'  <script type="module" src="boot.js"></script>\n</body>\n</html>\n';
html=html.replace(/  <script src="https:[^\n]+\n/g,'').replace(/  <link[^\n]+https:[^\n]+\n/g,'').replace(/  <script type="importmap">[\s\S]*?  <\/script>/,'  <link rel="stylesheet" href="ui.css" />\n  <link rel="stylesheet" href="fonts.css" />');
fs.writeFileSync('web/index.html',html);
let assets="// Presentation primitives preserved from the original game. No simulation or save writes.\nimport * as THREE from './three.module.js';\n";
assets+=section("    const STARTER_IDS",'    const SAVE_KEY');
assets+=section('    class SoundEngineV6','    /* =========================================================================\n       7. MAIN APPLICATION CONTROLLER');
assets+='\nexport {THREE,SoundEngineV6,buildVehicleMesh,createWorkshopEnvironment,buildTrack3D,getClassSvgSilhouette,STARTER_IDS,VEHICLE_CATALOG,TUNING_CATEGORIES,STAGE_LABELS,TRACKS,GAME_MODES,CHALLENGES};\n';
fs.writeFileSync('web/visual-assets.js',assets);
fs.writeFileSync('web/presentation-methods.js',"// Extracted display methods. All game changes are dispatched to Rust.\nimport {THREE,SoundEngineV6,buildVehicleMesh,createWorkshopEnvironment,buildTrack3D,getClassSvgSilhouette,STARTER_IDS,VEHICLE_CATALOG,TUNING_CATEGORIES,STAGE_LABELS,TRACKS,GAME_MODES,CHALLENGES} from './visual-assets.js';\nexport class OriginalPresentationMethods {\n"+Object.values(methods).join('\n')+'\n}\n');
const threeRoot=path.join(depRoot,'node_modules/three');if(JSON.parse(fs.readFileSync(path.join(threeRoot,'package.json'))).version!=='0.160.0')throw Error('Wrong Three version');
fs.copyFileSync(path.join(threeRoot,'build/three.module.js'),'web/three.module.js');
fs.mkdirSync('third_party',{recursive:true});fs.copyFileSync(path.join(threeRoot,'LICENSE'),'third_party/THREE-LICENSE.txt');
const lock=JSON.parse(fs.readFileSync(path.join(depRoot,'package-lock.json')));const p=lock.packages['node_modules/three'];
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
fs.writeFileSync('third_party/provenance.json',JSON.stringify({three:{version:'0.160.0',source:p.resolved,package_integrity:p.integrity,asset:'web/three.module.js',sha256:sha('web/three.module.js'),license:'MIT'},presentation_source:{base_commit:'42a8aa98e19903d745b760ddac1a2c2b96d1c179',sha256:sha('legacy/index.html'),sha256_normalized_lf:crypto.createHash('sha256').update(fs.readFileSync('legacy/index.html','utf8').replace(/\r\n/g,'\n')).digest('hex')},stylesheet:{sha256:sha('web/ui.css'),compiler:'tailwindcss@3.4.17',runtime:'static CSS only',note:'Build tooling is isolated; no npm install or CSS compiler executes during game build/play.'}},null,2));
console.log('Generated local original HTML, presentation methods, procedural assets and pinned Three renderer.');
