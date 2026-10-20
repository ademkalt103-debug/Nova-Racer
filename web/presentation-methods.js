// Extracted display methods. All game changes are dispatched to Rust.
import {THREE,SoundEngineV6,buildVehicleMesh,createWorkshopEnvironment,buildTrack3D,getClassSvgSilhouette,STARTER_IDS,VEHICLE_CATALOG,TUNING_CATEGORIES,STAGE_LABELS,TRACKS,GAME_MODES,CHALLENGES} from './visual-assets.js';
export class OriginalPresentationMethods {
      initThree() {
        const container = document.getElementById('canvas-container');
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x06080f);
        this.scene.fog = new THREE.FogExp2(0x06080f, 0.028);

        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1500);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        container.innerHTML = '';
        container.appendChild(this.renderer.domElement);

        const hemi = new THREE.HemisphereLight(0xe2e8f0, 0x0f172a, 1.0);
        this.scene.add(hemi);

        const dir = new THREE.DirectionalLight(0xffffff, 1.35);
        dir.position.set(25, 45, 30);
        dir.castShadow = true;
        this.scene.add(dir);

        // Separater Container für Multiplayer-Fahrzeuge
        this.scene.add(this.remotePlayersGroup);

        const speedCanvas = document.getElementById('speedlines-canvas');
        speedCanvas.width = window.innerWidth;
        speedCanvas.height = window.innerHeight;

        window.addEventListener('resize', () => {
          this.camera.aspect = window.innerWidth / window.innerHeight;
          this.camera.updateProjectionMatrix();
          this.renderer.setSize(window.innerWidth, window.innerHeight);
          speedCanvas.width = window.innerWidth;
          speedCanvas.height = window.innerHeight;
        });
      }
      openStarterSelectionModal() {
        const modal = document.getElementById('starter-modal');
        const container = document.getElementById('starter-cards-container');
        modal.classList.remove('hidden');
        container.innerHTML = '';

        STARTER_IDS.forEach(starterId => {
          const car = this.getCarById(starterId);
          const card = document.createElement('div');
          card.className = 'glass-panel rounded-2xl p-4 flex flex-col justify-between border border-slate-700 hover:border-cyan-400 transition cursor-pointer';
          card.innerHTML = `
            <div>
              <div class="flex items-center justify-between mb-2">
                <span class="text-[10px] font-display font-bold px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-400/40">${car.rarity}</span>
                <span class="font-display font-black text-emerald-400 text-xs">$${car.price.toLocaleString()}</span>
              </div>
              <div class="flex items-center justify-between gap-2 mb-2">
                <h3 class="font-display font-bold text-sm text-white">${car.name}</h3>
                ${getClassSvgSilhouette(car.meshType, car.defaultColor)}
              </div>
              <div class="space-y-1 text-[10px] bg-slate-950/75 p-2.5 rounded-xl mb-3">
                <div class="flex justify-between"><span>⚡ Topspeed</span><span class="font-display text-cyan-300">${car.stats.topSpeed}/10 (${car.baseKmh} km/h)</span></div>
                <div class="flex justify-between"><span>🚀 Beschleunigung</span><span class="font-display text-cyan-300">${car.stats.accel}/10</span></div>
                <div class="flex justify-between"><span>🛞 Handling</span><span class="font-display text-cyan-300">${car.stats.handling}/10</span></div>
                <div class="flex justify-between"><span>💨 Drift-Potenzial</span><span class="font-display text-cyan-300">${car.stats.drift}/10</span></div>
              </div>
            </div>
            <div class="flex gap-2">
              <button class="btn-starter-sound px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-display font-bold text-xs">
                🔊 SOUND
              </button>
              <button class="btn-starter-pick flex-1 py-2 rounded-xl bg-gradient-to-r from-cyan-400 to-sky-500 hover:brightness-110 text-slate-950 font-display font-black text-xs">
                ✓ FÜR $18.000 KAUFEN
              </button>
            </div>
          `;

          card.addEventListener('mouseenter', () => {
            this.previewCarId = starterId;
            this.rebuildWorkshopCar(starterId);
          });

          card.querySelector('.btn-starter-sound').addEventListener('click', e => {
            e.stopPropagation();
            this.sound.playSoundCheck(car.soundProfile);
          });

          card.querySelector('.btn-starter-pick').addEventListener('click', e => {
            e.stopPropagation();
            this.dispatch({type:'buy',id:starterId});
          });

          container.appendChild(card);
        });
      }
      setupWorkshopScene() {
        this.inRace = false;
        this.sound.stopRaceAudio();
        document.getElementById('speedlines-canvas').classList.add('hidden');

        if (this.raceGroup) {
          this.scene.remove(this.raceGroup);
          this.raceGroup = null;
        }
        if (this.workshopGroup) {
          this.scene.remove(this.workshopGroup);
        }

        this.scene.background = new THREE.Color(0x070a12);
        this.scene.fog = new THREE.FogExp2(0x070a12, 0.032);
        this.camera.fov = 52;
        this.camera.updateProjectionMatrix();

        this.workshopGroup = createWorkshopEnvironment();
        this.scene.add(this.workshopGroup);
        this.rebuildWorkshopCar(this.state.selectedCarId);
        this.setWorkshopCameraPreset('hero');
      }
      rebuildWorkshopCar(carId = this.state.selectedCarId) {
        if (!this.workshopGroup) return;
        if (this.playerMesh) {
          this.workshopGroup.remove(this.playerMesh);
        }
        const car = this.getCarById(carId);
        const tune = this.getCarTuning(carId);
        const colors = this.getCarColors(carId);
        this.playerMesh = buildVehicleMesh(car, tune, colors);
        this.workshopGroup.add(this.playerMesh);
      }
      setWorkshopCameraPreset(presetName) {
        this.garageCamPreset = presetName;
        this.camStartPos.copy(this.camCurrentPos);
        this.camStartTarget.copy(this.camCurrentTarget);
        this.camLerpT = 0;

        const presets = {
          hero: { pos: new THREE.Vector3(4.6, 2.0, 5.2), target: new THREE.Vector3(0, 0.65, 0) },
          rims: { pos: new THREE.Vector3(2.55, 0.58, 1.45), target: new THREE.Vector3(0.85, 0.42, 1.35) },
          spoiler: { pos: new THREE.Vector3(2.1, 1.55, -3.35), target: new THREE.Vector3(0, 0.95, -2.0) },
          exhaust: { pos: new THREE.Vector3(1.25, 0.55, -3.55), target: new THREE.Vector3(0, 0.35, -2.25) },
          front: { pos: new THREE.Vector3(1.6, 1.05, 3.85), target: new THREE.Vector3(0, 0.55, 2.0) },
          rear: { pos: new THREE.Vector3(-2.1, 1.15, -3.7), target: new THREE.Vector3(0, 0.55, -1.9) }
        };

        const p = presets[presetName] || presets.hero;
        this.camGoalPos.copy(p.pos);
        this.camGoalTarget.copy(p.target);
      }
      updateWorkshopCamera(dt) {
        if (this.garageCamPreset === 'hero' && this.camLerpT >= 1) {
          // Ruhiger Showcase-Orbit um das zentrale 3D-Fahrzeug
          const t = performance.now() * 0.00028;
          this.camCurrentPos.set(Math.sin(t) * 5.6 - 0.8, 1.95, Math.cos(t) * 5.6);
          this.camCurrentTarget.set(-0.6, 0.65, 0);
        } else {
          this.camLerpT = Math.min(1, this.camLerpT + dt / 0.6); // ~0.6s Dauer
          const ease = this.camLerpT < 0.5
            ? 2 * this.camLerpT * this.camLerpT
            : 1 - Math.pow(-2 * this.camLerpT + 2, 2) / 2;
          this.camCurrentPos.lerpVectors(this.camStartPos, this.camGoalPos, ease);
          this.camCurrentTarget.lerpVectors(this.camStartTarget, this.camGoalTarget, ease);
        }
        this.camera.position.copy(this.camCurrentPos);
        this.camera.lookAt(this.camCurrentTarget);

        // Schwebende Staubpartikel animieren
        if (this.workshopGroup && this.workshopGroup.userData.dustPoints) {
          this.workshopGroup.userData.dustPoints.rotation.y += dt * 0.04;
        }
      }
      spawnDriftSmokeAndSkid(pos, yaw, rightVec) {
        if (!this.raceGroup) return;
        // 1. Drift-Qualm-Partikel
        const smokeGeo = new THREE.SphereGeometry(0.26, 6, 6);
        const smokeMat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.45 });
        const puff = new THREE.Mesh(smokeGeo, smokeMat);
        puff.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.22, (Math.random() - 0.5) * 1.2));
        this.raceGroup.add(puff);
        this.smokeParticles.push({ mesh: puff, life: 0.65 });

        // 2. Reifenspuren (Skidmark-Decals auf der Straße)
        const skidGeo = new THREE.PlaneGeometry(1.5, 0.65);
        skidGeo.rotateX(-Math.PI / 2);
        const skidMat = new THREE.MeshBasicMaterial({ color: 0x090d16, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
        const skid = new THREE.Mesh(skidGeo, skidMat);
        skid.position.copy(pos);
        skid.position.y += 0.04;
        skid.rotation.y = yaw;
        this.raceGroup.add(skid);
        this.skidMeshes.push(skid);
        if (this.skidMeshes.length > 140) {
          const old = this.skidMeshes.shift();
          this.raceGroup.remove(old);
        }
      }
      renderSpeedLines(speedRatio, isNos) {
        const canvas = document.getElementById('speedlines-canvas');
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const alpha = Math.max(0, (speedRatio - 0.55) * 1.4 + (isNos ? 0.35 : 0));
        if (alpha <= 0.02) return;

        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        ctx.save();
        ctx.strokeStyle = isNos ? `rgba(0, 243, 255, ${alpha * 0.55})` : `rgba(255, 255, 255, ${alpha * 0.38})`;
        ctx.lineWidth = 2;

        for (let i = 0; i < 26; i++) {
          const angle = (i / 26) * Math.PI * 2 + (performance.now() * 0.01);
          const rInner = 220 + (i % 4) * 45;
          const rOuter = Math.max(canvas.width, canvas.height);
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(angle) * rInner, cy + Math.sin(angle) * rInner);
          ctx.lineTo(cx + Math.cos(angle) * rOuter, cy + Math.sin(angle) * rOuter);
          ctx.stroke();
        }
        ctx.restore();
      }
      updateRaceHUD(rank) {
        const rr = this.raceRuntime;
        document.getElementById('hud-pos').textContent = `${rank}/4`;
        document.getElementById('hud-lap').textContent = `${Math.min(rr.lap, rr.maxLaps)}/${rr.maxLaps}`;
        document.getElementById('hud-speed').textContent = Math.round(Math.abs(rr.speedKmh));
        document.getElementById('hud-gear').textContent = rr.gear;
        document.getElementById('hud-drift-combo').textContent = `x${rr.driftCombo} • ${rr.driftPointsCurrent}`;
        document.getElementById('hud-session-stunt-cash').textContent = `+$${rr.stuntCashEarned}`;

        const elapsed = rr.countdown <= 0 ? rr.elapsed : 0;
        const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const s = (elapsed % 60).toFixed(1).padStart(4, '0');
        document.getElementById('hud-time').textContent = `${m}:${s}`;

        // Runder SVG-Drehzahlmesser (Nadel von -120° bis +120°, Bogenlänge 335)
        const deg = -120 + rr.rpmNorm * 240;
        document.getElementById('svg-rpm-needle').style.transform = `rotate(${deg}deg)`;
        const dashOffset = 335 - rr.rpmNorm * 335;
        document.getElementById('svg-rpm-arc').setAttribute('stroke-dashoffset', String(dashOffset));

        // Schaltblitz > 90% RPM
        const shiftEl = document.getElementById('hud-shift-light');
        if (rr.rpmNorm > 0.9) {
          shiftEl.className = 'px-2 py-0.5 rounded bg-rose-500 text-white font-display font-black text-[10px] shift-active shadow-[0_0_12px_#f43f5e]';
        } else {
          shiftEl.className = 'px-2 py-0.5 rounded bg-slate-800 text-slate-500 font-display font-black text-[10px]';
        }

        // NOS-Säule
        const nosPct = Math.round(rr.nos);
        document.getElementById('hud-nos-fill').style.height = `${nosPct}%`;
        document.getElementById('hud-nos-pct').textContent = `${nosPct}%`;

        // Live Challenge-Fortschritt oben rechts
        const chBox = document.getElementById('hud-challenges-live');
        chBox.innerHTML = '';
        CHALLENGES.slice(0, 3).forEach(ch => {
          const cur = Math.min(ch.target, this.state.challengeProgress[ch.key] || 0);
          const pct = Math.round((cur / ch.target) * 100);
          const row = document.createElement('div');
          row.innerHTML = `
            <div class="flex justify-between text-[10px]">
              <span class="text-slate-300 truncate">${ch.title}</span>
              <span class="font-display text-cyan-300">${cur}/${ch.target}</span>
            </div>
            <div class="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
              <div class="h-full bg-cyan-400" style="width:${pct}%"></div>
            </div>
          `;
          chBox.appendChild(row);
        });
      }
      refreshAllGarageUI() {
        const car = this.getCarById();
        const stats = this.getEffectiveStats();
        const needXp = this.snapshot.needXp;

        // Top-Bar aktualisieren
        document.getElementById('top-car-class').textContent = car.carClass.toUpperCase();
        document.getElementById('top-car-name').textContent = car.name;
        document.getElementById('top-car-pi').textContent = `PI ${stats.pi} (${stats.maxKmh} km/h)`;
        document.getElementById('top-owned-count').textContent = `Besitz: ${this.state.ownedCars.length}/${VEHICLE_CATALOG.length}`;
        document.getElementById('ui-level').textContent = `LVL ${this.state.level}`;
        document.getElementById('ui-xp-text').textContent = `${this.state.xp} / ${needXp}`;
        document.getElementById('ui-xp-bar').style.width = `${Math.min(100, Math.round((this.state.xp / needXp) * 100))}%`;
        document.getElementById('ui-cash').textContent = this.state.cash.toLocaleString();
        document.getElementById('badge-free-spins').textContent = `${this.state.freeSpins || 0} GRATIS`;

        this.renderDrivePanel(stats);
        this.renderTuningPanel();
        this.renderDealershipPanel();
      }
      renderDrivePanel(stats) {
        const statBox = document.getElementById('drive-current-stats');
        const rows = [
          { label: '⚡ Topspeed', val: stats.topSpeed },
          { label: '🚀 Beschleunigung', val: stats.accel },
          { label: '🛞 Handling', val: stats.handling },
          { label: '💨 Drift', val: stats.drift },
          { label: '🛑 Bremsen', val: stats.brakes }
        ];
        statBox.innerHTML = rows.map(r => `
          <div>
            <div class="flex justify-between text-[10px] mb-0.5"><span class="text-slate-400">${r.label}</span><span class="font-display text-cyan-300">${r.val.toFixed(1)}/10</span></div>
            <div class="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden"><div class="h-full bg-cyan-400 transition-all duration-300" style="width:${r.val * 10}%"></div></div>
          </div>
        `).join('');

        // Streckenliste
        const trackList = document.getElementById('drive-track-list');
        trackList.innerHTML = '';
        TRACKS.forEach(t => {
          const active = t.id === this.state.selectedTrackId;
          const btn = document.createElement('button');
          btn.className = `w-full text-left px-3 py-2 rounded-xl border transition flex items-center justify-between text-xs ${
            active ? 'bg-cyan-500/20 border-cyan-400 text-white' : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:border-slate-600'
          }`;
          btn.innerHTML = `
            <div>
              <div class="font-display font-bold">${t.name}</div>
              <div class="text-[10px] text-slate-400">${t.region}</div>
            </div>
            <span class="font-display text-emerald-400 font-bold">$${(t.reward / 1000).toFixed(1)}k</span>
          `;
          btn.addEventListener('click', () => {
            this.dispatch({type:'track',id:t.id});
          });
          trackList.appendChild(btn);
        });

        // Modusliste
        const modeList = document.getElementById('drive-mode-list');
        modeList.innerHTML = '';
        GAME_MODES.forEach(m => {
          const active = m.id === this.state.selectedMode;
          const btn = document.createElement('button');
          btn.className = `px-2.5 py-2 rounded-xl border font-display font-bold text-[10px] transition truncate ${
            active ? 'bg-fuchsia-500/25 border-fuchsia-400 text-fuchsia-200' : 'bg-slate-900/70 border-slate-800 text-slate-400'
          }`;
          btn.textContent = m.name;
          btn.addEventListener('click', () => {
            this.dispatch({type:'mode',id:m.id});
          });
          modeList.appendChild(btn);
        });
      }
      renderTuningPanel() {
        const tune = this.getCarTuning();
        const colors = this.getCarColors();
        document.getElementById('tune-color-body').value = colors.body;
        document.getElementById('tune-color-rims').value = colors.rims;
        document.getElementById('tune-color-neon').value = colors.neon;

        const catGrid = document.getElementById('tuning-cat-grid');
        catGrid.innerHTML = '';
        TUNING_CATEGORIES.forEach(cat => {
          const active = cat.id === this.activeTuningCat;
          const b = document.createElement('button');
          b.className = `px-2 py-1.5 rounded-lg border text-[10px] font-semibold transition flex items-center justify-center gap-1 ${
            active ? 'bg-orange-500/25 border-orange-400 text-orange-200' : 'bg-slate-900/75 border-slate-800 text-slate-400 hover:border-slate-600'
          }`;
          b.innerHTML = `<span>${cat.icon}</span><span class="truncate">${cat.name}</span>`;
          b.addEventListener('click', () => {
            this.activeTuningCat = cat.id;
            this.setWorkshopCameraPreset(cat.cam); // Automatischer Kamera-Zoom auf das gewählte Bauteil!
            this.renderTuningPanel();
          });
          catGrid.appendChild(b);
        });

        const activeCatObj = TUNING_CATEGORIES.find(c => c.id === this.activeTuningCat) || TUNING_CATEGORIES[0];
        const curStage = tune[activeCatObj.id] || 0;
        const stageList = document.getElementById('tuning-stage-list');
        stageList.innerHTML = '';

        STAGE_LABELS.forEach((label, idx) => {
          const price = idx === 0 ? 0 : Math.round(activeCatObj.cost * idx * 1.3);
          const installed = curStage === idx;
          const row = document.createElement('div');
          row.className = `p-2.5 rounded-xl border flex items-center justify-between text-xs ${
            installed ? 'bg-orange-500/15 border-orange-400/60' : 'bg-slate-900/75 border-slate-800'
          }`;
          row.innerHTML = `
            <div>
              <div class="font-display font-bold text-white">${activeCatObj.icon} ${label}</div>
              <div class="text-[10px] text-slate-400">Stufe ${idx}/4 • Bauteil-Upgrade</div>
            </div>
          `;
          const btn = document.createElement('button');
          if (installed) {
            btn.className = 'px-3 py-1.5 rounded-lg bg-orange-500 text-slate-950 font-display font-bold text-[10px]';
            btn.textContent = 'AKTIV';
          } else {
            btn.className = 'px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-emerald-400 hover:text-slate-950 text-emerald-300 font-display font-bold text-[10px] transition';
            btn.textContent = idx < curStage ? 'WÄHLEN' : `$${price.toLocaleString()}`;
            btn.addEventListener('click', () => {
              this.dispatch({type:'stage',id:activeCatObj.id,stage:idx});
            });
          }
          row.appendChild(btn);
          stageList.appendChild(row);
        });
      }
      renderDealershipPanel() {
        const filterVal = document.getElementById('dealer-class-filter').value;
        const currentStats = this.getEffectiveStats(this.state.selectedCarId);
        const compareId = this.previewCarId || this.state.selectedCarId;
        const compareCar = this.getCarById(compareId);
        const compareStats = this.getEffectiveStats(compareId);

        document.getElementById('dealer-preview-name').textContent = compareCar.name;

        // Animierte Stat-Balken (0-10) mit Delta-Preview (Grün = besser, Rot = schlechter)
        const deltaContainer = document.getElementById('dealer-delta-bars');
        const fields = [
          { key: 'topSpeed', label: '⚡ Topspeed' },
          { key: 'accel', label: '🚀 Beschleunigung' },
          { key: 'handling', label: '🛞 Handling' },
          { key: 'drift', label: '💨 Drift' },
          { key: 'brakes', label: '🛑 Bremsen' }
        ];

        deltaContainer.innerHTML = fields.map(f => {
          const curV = currentStats[f.key];
          const cmpV = compareStats[f.key];
          const diff = +(cmpV - curV).toFixed(1);
          const diffBadge = diff > 0
            ? `<span class="text-emerald-400 font-display">+${diff}</span>`
            : diff < 0
            ? `<span class="text-rose-400 font-display">${diff}</span>`
            : `<span class="text-slate-500 font-display">±0.0</span>`;

          const barColor = diff > 0 ? 'bg-emerald-400' : diff < 0 ? 'bg-rose-500' : 'bg-cyan-400';
          return `
            <div>
              <div class="flex justify-between text-[10px] mb-0.5">
                <span class="text-slate-300">${f.label}</span>
                <span><strong class="font-display text-white">${cmpV.toFixed(1)}</strong> (${diffBadge})</span>
              </div>
              <div class="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div class="h-full ${barColor} transition-all duration-300" style="width:${cmpV * 10}%"></div>
              </div>
            </div>
          `;
        }).join('');

        // Karten-Liste rendern
        const listEl = document.getElementById('dealer-cards-list');
        listEl.innerHTML = '';

        const filtered = VEHICLE_CATALOG.filter(c => {
          if (filterVal === 'OWNED') return this.state.ownedCars.includes(c.id);
          if (filterVal !== 'ALL' && c.carClass !== filterVal) return false;
          return true;
        });

        filtered.forEach(car => {
          const isOwned = this.state.ownedCars.includes(car.id);
          const isSelected = this.state.selectedCarId === car.id;
          const levelLocked = this.state.level < car.levelReq && !isOwned;

          const badgeColors = {
            'Cult-Starter': 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40',
            'Common': 'bg-slate-800 text-slate-300 border-slate-600',
            'Rare': 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40',
            'Legendary': 'bg-amber-500/20 text-amber-300 border-amber-400/40',
            'Kult-Meme': 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-400/40'
          };

          const card = document.createElement('div');
          card.className = `p-3 rounded-2xl border transition ${
            isSelected ? 'bg-cyan-500/15 border-cyan-400' : 'bg-slate-900/80 border-slate-800 hover:border-slate-600'
          }`;

          card.innerHTML = `
            <div class="flex items-center justify-between mb-1">
              <div class="flex items-center gap-1.5">
                <span class="text-[9px] font-display font-bold px-2 py-0.5 rounded border ${badgeColors[car.rarity] || badgeColors.Common}">${car.rarity}</span>
                <span class="text-[10px] text-slate-400 uppercase font-display">${car.carClass}</span>
              </div>
              <span class="text-[10px] font-display ${levelLocked ? 'text-rose-400' : 'text-slate-400'}">Ab LVL ${car.levelReq}</span>
            </div>
            <div class="flex items-center justify-between gap-2 my-1.5">
              <div>
                <h4 class="font-display font-bold text-xs text-white">${car.name}</h4>
                <div class="text-[10px] text-slate-400">Basis V-Max: ${car.baseKmh} km/h</div>
              </div>
              <div class="flex items-center gap-2">
                <span class="w-3.5 h-3.5 rounded-full border border-white/30" style="background:${car.defaultColor}" title="Farbvorschau"></span>
                ${getClassSvgSilhouette(car.meshType, car.defaultColor)}
              </div>
            </div>
            <div class="flex items-center gap-2 mt-2">
              <button class="btn-card-sound px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 font-display font-bold text-[10px]">
                🔊 SOUND-CHECK
              </button>
              <button class="btn-card-action flex-1 py-1.5 rounded-lg font-display font-bold text-[11px] transition"></button>
            </div>
          `;

          card.addEventListener('mouseenter', () => {
            if(this.previewCarId===car.id)return;
            this.previewCarId = car.id;
            this.rebuildWorkshopCar(car.id);
            this.renderDealershipPanel();
          });

          card.querySelector('.btn-card-sound').addEventListener('click', e => {
            e.stopPropagation();
            this.sound.playSoundCheck(car.soundProfile);
          });

          const actBtn = card.querySelector('.btn-card-action');
          if (isSelected) {
            actBtn.className += ' bg-cyan-400 text-slate-950';
            actBtn.textContent = '✓ AUSGERÜSTET';
          } else if (isOwned) {
            actBtn.className += ' bg-emerald-500/25 border border-emerald-400 text-emerald-300 hover:bg-emerald-400 hover:text-slate-950';
            actBtn.textContent = 'FAHRZEUG WÄHLEN';
            actBtn.addEventListener('click', () => {
              this.dispatch({type:'buy',id:car.id});
            });
          } else if (levelLocked) {
            actBtn.className += ' bg-slate-800 text-rose-400 cursor-not-allowed';
            actBtn.textContent = `🔒 RUF-LEVEL ${car.levelReq} NÖTIG`;
          } else {
            actBtn.className += ' bg-amber-400 hover:bg-amber-300 text-slate-950';
            actBtn.textContent = `KAUFEN • $${car.price.toLocaleString()}`;
            actBtn.addEventListener('click', () => {
              this.dispatch({type:'buy',id:car.id});
            });
          }

          listEl.appendChild(card);
        });
      }
      renderChallengesModal() {
        const list = document.getElementById('challenges-modal-list');
        list.innerHTML = '';

        CHALLENGES.forEach(ch => {
          const cur = Math.min(ch.target, this.state.challengeProgress[ch.key] || 0);
          const done = cur >= ch.target;
          const claimed = !!this.state.challengeClaimed[ch.id];
          const pct = Math.round((cur / ch.target) * 100);

          const card = document.createElement('div');
          card.className = `p-3.5 rounded-2xl border flex flex-col justify-between ${
            done && !claimed ? 'bg-emerald-500/15 border-emerald-400' : 'bg-slate-900/85 border-slate-800'
          }`;
          card.innerHTML = `
            <div>
              <div class="flex items-center justify-between mb-1">
                <span class="text-[9px] font-display px-2 py-0.5 rounded ${ch.type === 'DAILY' ? 'bg-cyan-500/20 text-cyan-300' : 'bg-fuchsia-500/20 text-fuchsia-300'}">${ch.type}</span>
                <span class="text-[10px] font-display text-emerald-400">+$${ch.cash.toLocaleString()} • +${ch.xp} XP</span>
              </div>
              <h4 class="font-display font-bold text-sm text-white">${ch.title}</h4>
              <p class="text-xs text-slate-400 mb-2">${ch.desc}</p>
              <div class="flex justify-between text-[10px] text-slate-300 mb-1">
                <span>Fortschritt</span><span class="font-display">${cur} / ${ch.target}</span>
              </div>
              <div class="w-full h-2 bg-slate-800 rounded-full overflow-hidden mb-3">
                <div class="h-full bg-gradient-to-r from-cyan-400 to-emerald-400" style="width:${pct}%"></div>
              </div>
            </div>
          `;

          const btn = document.createElement('button');
          if (claimed) {
            btn.className = 'w-full py-2 rounded-xl bg-slate-800 text-slate-500 font-display font-bold text-xs cursor-default';
            btn.textContent = '✓ BELOHNUNG ABGEHOLT';
          } else if (done) {
            btn.className = 'w-full py-2 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-display font-black text-xs';
            btn.textContent = '🎁 BELOHNUNG EINLÖSEN';
            btn.addEventListener('click', () => {
              this.dispatch({type:'claim',id:ch.id});
            });
          } else {
            btn.className = 'w-full py-2 rounded-xl bg-slate-800 text-slate-400 font-display text-xs cursor-default';
            btn.textContent = 'IM RENNEN ABSCHLIESSEN';
          }

          card.appendChild(btn);
          list.appendChild(card);
        });
      }
}
