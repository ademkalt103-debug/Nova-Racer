// Presentation primitives preserved from the original game. No simulation or save writes.
import * as THREE from './three.module.js';
    const STARTER_IDS = ['starter_golf2', 'starter_civiceg6', 'starter_e36'];

    const VEHICLE_CATALOG = [
      // --- 3 PFLICHT-KULT-STARTER ---
      {
        id: 'starter_golf2',
        name: '1990 Volkswerk Golf 2 GTI 16V',
        brand: 'Volkswerk',
        carClass: 'cult',
        meshType: 'hatch',
        rarity: 'Cult-Starter',
        levelReq: 1,
        price: 18000,
        defaultColor: '#ef4444',
        soundProfile: 'i4_raspy',
        stats: { topSpeed: 4.8, accel: 5.2, handling: 6.8, drift: 5.5, brakes: 6.0 },
        baseKmh: 215
      },
      {
        id: 'starter_civiceg6',
        name: '1994 Kyoto Civic EG6 SiR VTEC',
        brand: 'Kyoto Works',
        carClass: 'cult',
        meshType: 'hatch',
        rarity: 'Cult-Starter',
        levelReq: 1,
        price: 18000,
        defaultColor: '#facc15',
        soundProfile: 'vtec_high',
        stats: { topSpeed: 4.9, accel: 5.4, handling: 7.4, drift: 5.2, brakes: 6.4 },
        baseKmh: 220
      },
      {
        id: 'starter_e36',
        name: '1996 Bavaria E36 328i Coupé',
        brand: 'Bavaria',
        carClass: 'cult',
        meshType: 'coupe',
        rarity: 'Cult-Starter',
        levelReq: 1,
        price: 18000,
        defaultColor: '#3b82f6',
        soundProfile: 'i6_smooth',
        stats: { topSpeed: 5.3, accel: 5.3, handling: 6.5, drift: 7.8, brakes: 6.0 },
        baseKmh: 232
      },

      // --- SPEZIAL KULT-MEME FAHRZEUGE (Moped mit Fahrer, Supermoto, TukTuk, Rasenmäher) ---
      {
        id: 'cult_moped',
        name: 'Beta RR 50 Track / Puch Maxi Tuning',
        brand: 'Alpen Zweitakt',
        carClass: 'cult',
        meshType: 'moped_rider',
        rarity: 'Kult-Meme',
        levelReq: 1,
        price: 6500,
        defaultColor: '#dc2626',
        soundProfile: 'twostroke',
        stats: { topSpeed: 3.6, accel: 6.2, handling: 8.6, drift: 8.2, brakes: 5.5 },
        baseKmh: 168
      },
      {
        id: 'cult_starkvarg',
        name: '2026 Stark Varg Alpha Supermoto (80 PS)',
        brand: 'Nordic Electric',
        carClass: 'cult',
        meshType: 'moped_rider',
        rarity: 'Legendary',
        levelReq: 3,
        price: 29000,
        defaultColor: '#f8fafc',
        soundProfile: 'electric_whine',
        stats: { topSpeed: 5.8, accel: 9.1, handling: 9.2, drift: 9.0, brakes: 8.4 },
        baseKmh: 242
      },
      {
        id: 'cult_tuktuk',
        name: 'Bangkok Hayabusa-Swap TukTuk',
        brand: 'Siam Customs',
        carClass: 'cult',
        meshType: 'tuktuk',
        rarity: 'Kult-Meme',
        levelReq: 2,
        price: 14500,
        defaultColor: '#00f3ff',
        soundProfile: 'vtec_high',
        stats: { topSpeed: 5.4, accel: 7.5, handling: 6.0, drift: 9.6, brakes: 5.2 },
        baseKmh: 228
      },
      {
        id: 'cult_mower',
        name: 'V8-Biturbo Racing Rasenmäher',
        brand: 'Gartenbau Motorsport',
        carClass: 'cult',
        meshType: 'mower',
        rarity: 'Kult-Meme',
        levelReq: 2,
        price: 11000,
        defaultColor: '#22c55e',
        soundProfile: 'mower_v8',
        stats: { topSpeed: 4.5, accel: 8.0, handling: 7.8, drift: 9.4, brakes: 5.0 },
        baseKmh: 205
      },

      // --- WAGON / TOURING ---
      {
        id: 'wagon_rs2',
        name: '1995 Ingolstadt RS2 Avant Turbo',
        brand: 'Ingolstadt',
        carClass: 'wagon',
        meshType: 'wagon',
        rarity: 'Rare',
        levelReq: 2,
        price: 34000,
        defaultColor: '#2563eb',
        soundProfile: 'i6_smooth',
        stats: { topSpeed: 6.6, accel: 6.8, handling: 7.2, drift: 6.4, brakes: 7.1 },
        baseKmh: 268
      },
      {
        id: 'wagon_rs6',
        name: '2026 RS6 Avant GT Performance',
        brand: 'Ingolstadt',
        carClass: 'wagon',
        meshType: 'wagon',
        rarity: 'Legendary',
        levelReq: 4,
        price: 78000,
        defaultColor: '#475569',
        soundProfile: 'v8_thunder',
        stats: { topSpeed: 8.4, accel: 8.6, handling: 8.0, drift: 7.4, brakes: 8.5 },
        baseKmh: 318
      },

      // --- PERFORMANCE SUV ---
      {
        id: 'suv_urus',
        name: '2026 Modena Urus Performante',
        brand: 'Modena Corse',
        carClass: 'suv',
        meshType: 'suv',
        rarity: 'Rare',
        levelReq: 3,
        price: 62000,
        defaultColor: '#f59e0b',
        soundProfile: 'v8_thunder',
        stats: { topSpeed: 7.9, accel: 8.1, handling: 7.4, drift: 7.6, brakes: 8.0 },
        baseKmh: 306
      },

      // --- GT3 / TRACK ---
      {
        id: 'gt3_m4',
        name: '2025 Bavaria M4 GT3 Evo',
        brand: 'Bavaria',
        carClass: 'gt3',
        meshType: 'gt3',
        rarity: 'Rare',
        levelReq: 3,
        price: 54000,
        defaultColor: '#10b981',
        soundProfile: 'i6_smooth',
        stats: { topSpeed: 7.8, accel: 8.0, handling: 9.0, drift: 8.2, brakes: 9.1 },
        baseKmh: 298
      },
      {
        id: 'gt3_992',
        name: '2026 Stuttgart 911 GT3 RS (992)',
        brand: 'Stuttgart',
        carClass: 'gt3',
        meshType: 'gt3',
        rarity: 'Legendary',
        levelReq: 4,
        price: 92000,
        defaultColor: '#39ff14',
        soundProfile: 'flat6_scream',
        stats: { topSpeed: 8.3, accel: 8.8, handling: 9.7, drift: 8.0, brakes: 9.6 },
        baseKmh: 315
      },

      // --- HYPERCARS (Erst ab hohem Ruf-Level + Cash) ---
      {
        id: 'hyper_revuelto',
        name: '2026 Modena Revuelto V12 Hybrid',
        brand: 'Modena Corse',
        carClass: 'hyper',
        meshType: 'hyper',
        rarity: 'Legendary',
        levelReq: 5,
        price: 145000,
        defaultColor: '#ff007f',
        soundProfile: 'v12_hyper',
        stats: { topSpeed: 9.3, accel: 9.5, handling: 9.3, drift: 8.5, brakes: 9.4 },
        baseKmh: 358
      },
      {
        id: 'hyper_jesko',
        name: '2026 Nova Jesko Absolut (Endgame)',
        brand: 'Nova Motors',
        carClass: 'hyper',
        meshType: 'hyper',
        rarity: 'Legendary',
        levelReq: 6,
        price: 240000,
        defaultColor: '#00f3ff',
        soundProfile: 'v12_hyper',
        stats: { topSpeed: 10.0, accel: 9.8, handling: 9.6, drift: 9.0, brakes: 9.8 },
        baseKmh: 412
      }
    ];

    const TUNING_CATEGORIES = [
      { id: 'engine', name: 'Motor', icon: '🔧', cam: 'front', cost: 2400, bonus: { topSpeed: 0.35, accel: 0.45, handling: 0, drift: 0.1, brakes: 0 } },
      { id: 'turbo', name: 'Turbo', icon: '🐌', cam: 'front', cost: 3200, bonus: { topSpeed: 0.45, accel: 0.5, handling: 0, drift: 0.2, brakes: 0 } },
      { id: 'exhaust', name: 'Auspuff', icon: '🔥', cam: 'exhaust', cost: 1500, bonus: { topSpeed: 0.2, accel: 0.25, handling: 0, drift: 0.1, brakes: 0 } },
      { id: 'ecu', name: 'ECU Map', icon: '💻', cam: 'front', cost: 1900, bonus: { topSpeed: 0.3, accel: 0.3, handling: 0.1, drift: 0.1, brakes: 0 } },
      { id: 'gearbox', name: 'Getriebe', icon: '⚙️', cam: 'rear', cost: 2600, bonus: { topSpeed: 0.3, accel: 0.4, handling: 0.1, drift: 0.15, brakes: 0 } },
      { id: 'intercooler', name: 'Kühler', icon: '❄️', cam: 'front', cost: 1700, bonus: { topSpeed: 0.2, accel: 0.25, handling: 0, drift: 0, brakes: 0 } },
      { id: 'nos', name: 'Lachgas', icon: '🧪', cam: 'rear', cost: 2800, bonus: { topSpeed: 0.3, accel: 0.45, handling: 0, drift: 0.1, brakes: 0 } },
      { id: 'tires', name: 'Reifen', icon: '🛞', cam: 'rims', cost: 2200, bonus: { topSpeed: 0.1, accel: 0.25, handling: 0.55, drift: 0.2, brakes: 0.4 } },
      { id: 'suspension', name: 'Fahrwerk', icon: '🔩', cam: 'rims', cost: 2100, bonus: { topSpeed: 0.1, accel: 0.1, handling: 0.5, drift: 0.45, brakes: 0.2 } },
      { id: 'brakes', name: 'Bremsen', icon: '🛑', cam: 'rear', cost: 1800, bonus: { topSpeed: 0, accel: 0, handling: 0.25, drift: 0.1, brakes: 0.65 } },
      { id: 'aero', name: 'Spoiler', icon: '🦅', cam: 'spoiler', cost: 2500, bonus: { topSpeed: 0.25, accel: 0.1, handling: 0.5, drift: 0.15, brakes: 0.2 } },
      { id: 'rims', name: 'Felgen', icon: '✨', cam: 'rims', cost: 1600, bonus: { topSpeed: 0.1, accel: 0.15, handling: 0.3, drift: 0.2, brakes: 0.15 } }
    ];

    const STAGE_LABELS = ['Serie (Stock)', 'Stage 1 • Street', 'Stage 2 • Clubsport', 'Stage 3 • Track Pro', 'Stage 4 • Titanium'];

    // 3D-Strecken mit echten Y-Höhenwellen (Sprungkuppen) & Kurven-Banking
    const TRACKS = [
      {
        id: 'woerthersee',
        name: 'Wörthersee Südufer-Ring',
        region: 'Kärnten, AT • Sprungkuppe & See-Kurve',
        sky: 0x09162c, ground: 0x102319, road: 0x1e293b, reward: 6500,
        points: [
          [0, 0, 0], [130, 6.5, -45], [240, 1.5, 35], [210, 9.5, 165],
          [60, 0.5, 230], [-110, 4.0, 185], [-200, 0, 70], [-120, 0, -55]
        ]
      },
      {
        id: 'grossglockner',
        name: 'Großglockner Hochalpen-Pass',
        region: 'Hohe Tauern, AT • Steile Berg-Serpentinen',
        sky: 0x0b1d36, ground: 0x263244, road: 0x1f2937, reward: 8500,
        points: [
          [0, 0, 0], [140, 14.0, -65], [250, 22.0, 30], [150, 16.0, 135],
          [230, 10.0, 225], [35, 4.0, 260], [-130, 8.0, 190], [-215, 2.0, 75], [-125, 0, -45]
        ]
      },
      {
        id: 'shuto_c1',
        name: 'Tokyo Shuto C1 Midnight Loop',
        region: 'Tokyo, JP • Highspeed Banking & Sprünge',
        sky: 0x050712, ground: 0x090d16, road: 0x181824, reward: 7800,
        points: [
          [0, 0, 0], [175, 5.0, 0], [260, 11.0, 95], [175, 3.0, 210],
          [0, 8.5, 210], [-150, 1.0, 150], [-205, 6.0, 35], [-120, 0, -65]
        ]
      },
      {
        id: 'nordschleife',
        name: 'Nürburgring Pflanzgarten-Sprung',
        region: 'Eifel, DE • Kuppen-Airtime & Karussell',
        sky: 0x081422, ground: 0x0f2116, road: 0x202630, reward: 9500,
        points: [
          [0, 0, 0], [160, 12.0, -85], [275, 2.0, -20], [305, 13.5, 130],
          [180, 4.0, 250], [25, 9.0, 200], [-95, 1.0, 260], [-240, 5.0, 145], [-190, 0, -35]
        ]
      }
    ];

    const GAME_MODES = [
      { id: 'circuit', name: '🏁 Rundkurs (3 Laps)' },
      { id: 'drift', name: '💨 Drift-Attack' },
      { id: 'timeattack', name: '⏱️ Sprint (1 Lap)' },
      { id: 'pursuit', name: '🚓 Street-Duell' }
    ];

    /* =========================================================================
       2. STATE & PROGRESSION ("Zero to Hero" Startwerte)
       ========================================================================= */
    class SoundEngineV6 {
      constructor() {
        this.ctx = null;
        this.muted = false;
        this.running = false;
        this.oscMain = null;
        this.oscSub = null;
        this.filter = null;
        this.shaper = null;
        this.engineGain = null;
        this.screechGain = null;
        this.screechFilter = null;
        this.currentProfile = 'i4_raspy';
      }

      init() {
        if (this.ctx || this.muted) return;
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        this.ctx = new AudioCtx();
      }

      makeDistortionCurve(amount = 35) {
        const n = 256;
        const curve = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const x = (i * 2) / n - 1;
          curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
        }
        return curve;
      }

      startRaceAudio(profile = 'i4_raspy') {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();
        this.stopRaceAudio();

        this.currentProfile = profile;
        this.oscMain = this.ctx.createOscillator();
        this.oscSub = this.ctx.createOscillator();
        this.filter = this.ctx.createBiquadFilter();
        this.shaper = this.ctx.createWaveShaper();
        this.engineGain = this.ctx.createGain();

        this.oscMain.type = profile === 'electric_whine' ? 'sine' : 'sawtooth';
        this.oscSub.type = profile === 'twostroke' ? 'square' : 'triangle';
        this.shaper.curve = this.makeDistortionCurve(profile === 'twostroke' ? 65 : 32);
        this.filter.type = 'lowpass';
        this.filter.frequency.value = 380;
        this.engineGain.gain.value = 0.045;

        this.oscMain.connect(this.shaper);
        this.oscSub.connect(this.shaper);
        this.shaper.connect(this.filter);
        this.filter.connect(this.engineGain);
        this.engineGain.connect(this.ctx.destination);

        this.oscMain.start();
        this.oscSub.start();

        // Noise-Buffer für Reifenquietschen beim Drift / Vollbremsung
        const bufferSize = this.ctx.sampleRate * 1.5;
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          output[i] = Math.random() * 2 - 1;
        }
        this.noiseSource = this.ctx.createBufferSource();
        this.noiseSource.buffer = noiseBuffer;
        this.noiseSource.loop = true;

        this.screechFilter = this.ctx.createBiquadFilter();
        this.screechFilter.type = 'bandpass';
        this.screechFilter.frequency.value = 1150;
        this.screechFilter.Q.value = 4.5;

        this.screechGain = this.ctx.createGain();
        this.screechGain.gain.value = 0.0001;

        this.noiseSource.connect(this.screechFilter);
        this.screechFilter.connect(this.screechGain);
        this.screechGain.connect(this.ctx.destination);
        this.noiseSource.start();

        this.running = true;
      }

      updateRaceAudio(rpmNorm, isNos, slipIntensity) {
        if (!this.running || !this.ctx || this.muted) return;
        const now = this.ctx.currentTime;
        let baseHz = 48 + rpmNorm * 165;
        if (this.currentProfile === 'twostroke') baseHz = 85 + rpmNorm * 260;
        if (this.currentProfile === 'electric_whine') baseHz = 180 + rpmNorm * 520;
        if (this.currentProfile === 'v12_hyper') baseHz = 65 + rpmNorm * 240;
        if (this.currentProfile === 'mower_v8') baseHz = 36 + rpmNorm * 120;

        this.oscMain.frequency.setTargetAtTime(baseHz + (isNos ? 28 : 0), now, 0.03);
        this.oscSub.frequency.setTargetAtTime(baseHz * 0.5, now, 0.03);
        this.filter.frequency.setTargetAtTime(300 + rpmNorm * 1600 + (isNos ? 500 : 0), now, 0.04);
        this.engineGain.gain.setTargetAtTime(this.muted ? 0 : 0.05 + rpmNorm * 0.03, now, 0.04);

        const targetScreech = Math.min(0.065, slipIntensity * 0.065);
        this.screechGain.gain.setTargetAtTime(this.muted ? 0 : targetScreech, now, 0.05);
      }

      stopRaceAudio() {
        if (!this.running) return;
        try {
          this.oscMain.stop();
          this.oscSub.stop();
          this.noiseSource.stop();
        } catch (e) {}
        this.running = false;
      }

      playSoundCheck(profile = 'i4_raspy') {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();

        const now = this.ctx.currentTime;
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        osc1.type = profile === 'electric_whine' ? 'sine' : 'sawtooth';
        osc2.type = profile === 'twostroke' ? 'square' : 'triangle';
        filter.type = 'lowpass';

        let startF = 65, peakF = 240;
        if (profile === 'twostroke') { startF = 110; peakF = 390; }
        if (profile === 'vtec_high') { startF = 75; peakF = 310; }
        if (profile === 'v8_thunder' || profile === 'mower_v8') { startF = 42; peakF = 165; }
        if (profile === 'v12_hyper' || profile === 'flat6_scream') { startF = 85; peakF = 350; }
        if (profile === 'electric_whine') { startF = 200; peakF = 680; }

        osc1.frequency.setValueAtTime(startF, now);
        osc1.frequency.exponentialRampToValueAtTime(peakF, now + 0.38);
        osc1.frequency.exponentialRampToValueAtTime(startF * 1.15, now + 0.85);

        osc2.frequency.setValueAtTime(startF * 0.5, now);
        osc2.frequency.exponentialRampToValueAtTime(peakF * 0.5, now + 0.38);
        osc2.frequency.exponentialRampToValueAtTime(startF * 0.6, now + 0.85);

        filter.frequency.setValueAtTime(400, now);
        filter.frequency.exponentialRampToValueAtTime(2200, now + 0.38);
        filter.frequency.exponentialRampToValueAtTime(500, now + 0.85);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.08, now + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.92);
        osc2.stop(now + 0.92);
      }

      playTone(freq = 680, duration = 0.1) {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + duration + 0.02);
      }
    }

    /* =========================================================================
       4. ASSETS / PROCEDURAL MESHES (Keilform-Karosserien, Kult-Modelle & Werkstatt)
       ========================================================================= */
    function getClassSvgSilhouette(meshType, color = '#00f3ff') {
      if (meshType === 'moped_rider') {
        return `<svg viewBox="0 0 120 50" class="w-24 h-10"><circle cx="26" cy="36" r="10" stroke="${color}" stroke-width="3" fill="none"/><circle cx="94" cy="36" r="10" stroke="${color}" stroke-width="3" fill="none"/><path d="M26 36 L48 20 L84 22 L94 36 M52 20 L62 8 L72 10" stroke="${color}" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="64" cy="6" r="4" fill="${color}"/></svg>`;
      }
      if (meshType === 'tuktuk') {
        return `<svg viewBox="0 0 120 50" class="w-24 h-10"><path d="M20 38 L25 14 L85 14 L98 38 Z" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="2.5"/><circle cx="28" cy="40" r="7" fill="#fff"/><circle cx="88" cy="40" r="7" fill="#fff"/></svg>`;
      }
      if (meshType === 'mower') {
        return `<svg viewBox="0 0 120 50" class="w-24 h-10"><rect x="25" y="24" width="68" height="14" rx="4" fill="${color}"/><path d="M35 24 L35 12 L55 12 L55 24" fill="${color}"/><circle cx="36" cy="40" r="8" fill="#fff"/><circle cx="82" cy="40" r="6" fill="#fff"/></svg>`;
      }
      if (meshType === 'wagon' || meshType === 'suv') {
        return `<svg viewBox="0 0 120 50" class="w-24 h-10"><path d="M10 36 L16 16 L76 15 L108 26 L110 36 Z" fill="${color}" fill-opacity="0.28" stroke="${color}" stroke-width="2.5"/><circle cx="28" cy="38" r="8" fill="#e2e8f0"/><circle cx="90" cy="38" r="8" fill="#e2e8f0"/></svg>`;
      }
      return `<svg viewBox="0 0 120 50" class="w-24 h-10"><path d="M8 36 L26 24 L52 14 L84 15 L112 28 L112 36 Z" fill="${color}" fill-opacity="0.28" stroke="${color}" stroke-width="2.5"/><circle cx="28" cy="38" r="8" fill="#e2e8f0"/><circle cx="92" cy="38" r="8" fill="#e2e8f0"/></svg>`;
    }

    // Erzeugt ein lenkbares, formschönes 3D-Fahrzeug (Keilform mit schräger Frontscheibe oder Spezial-Kultmodell)
    function buildVehicleMesh(car, tuning = {}, colors = {}) {
      const root = new THREE.Group();
      const bodyColor = colors.body || car.defaultColor;
      const rimColor = colors.rims || '#fbbf24';
      const neonColor = colors.neon || '#00f3ff';
      const suspDrop = (tuning.suspension || 0) * 0.03;

      const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.68, roughness: 0.22 });
      const glassMat = new THREE.MeshStandardMaterial({ color: 0x0b1322, metalness: 0.92, roughness: 0.08 });
      const darkMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.75 });
      const rimMat = new THREE.MeshStandardMaterial({ color: rimColor, metalness: 0.85, roughness: 0.18 });
      const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.1 });

      root.userData.frontWheelPivots = [];
      root.userData.allWheelMeshes = [];
      root.userData.flames = [];

      // --- SPEZIALMODELL A: SUPERMOTO / MOPED MIT FAHRER (Beta RR 50 / Puch Maxi / Stark Varg) ---
      if (car.meshType === 'moped_rider') {
        const tireGeo = new THREE.TorusGeometry(0.38, 0.11, 12, 24);
        tireGeo.rotateY(Math.PI / 2);
        const rimSpokeGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.08, 12);
        rimSpokeGeo.rotateZ(Math.PI / 2);

        const rearWheel = new THREE.Group();
        rearWheel.add(new THREE.Mesh(tireGeo, darkMat), new THREE.Mesh(rimSpokeGeo, rimMat));
        rearWheel.position.set(0, 0.48, -1.05);
        root.add(rearWheel);
        root.userData.allWheelMeshes.push(rearWheel);

        const frontPivot = new THREE.Group();
        frontPivot.position.set(0, 0.48, 1.08);
        const frontWheel = new THREE.Group();
        frontWheel.add(new THREE.Mesh(tireGeo, darkMat), new THREE.Mesh(rimSpokeGeo, rimMat));
        frontPivot.add(frontWheel);
        root.add(frontPivot);
        root.userData.frontWheelPivots.push(frontPivot);
        root.userData.allWheelMeshes.push(frontWheel);

        // Gabel, Rahmen, Sitzbank & Kotflügel
        const fork = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.95, 0.12), chromeMat);
        fork.position.set(0, 0.88, 0.92);
        fork.rotation.x = -0.28;
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.36, 1.55), bodyMat);
        frame.position.set(0, 0.88, -0.05);
        const handlebar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.85, 8), darkMat);
        handlebar.rotation.z = Math.PI / 2;
        handlebar.position.set(0, 1.32, 0.72);
        root.add(fork, frame, handlebar);

        // Fahrer mit Helm & Supermoto-Kombi
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.28), darkMat);
        torso.position.set(0, 1.38, -0.12);
        torso.rotation.x = 0.35;
        const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), bodyMat);
        helmet.position.set(0, 1.82, 0.05);
        const visor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.18), glassMat);
        visor.position.set(0, 1.82, 0.18);
        root.add(torso, helmet, visor);
      }

      // --- SPEZIALMODELL B: BANGKOK RACING TUKTUK (3-Rad mit Kabine) ---
      else if (car.meshType === 'tuktuk') {
        const base = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.35, 3.1), bodyMat);
        base.position.y = 0.45;
        const frontCowl = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.95, 0.9), bodyMat);
        frontCowl.position.set(0, 0.95, 0.95);
        frontCowl.rotation.x = -0.22;
        const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.5, 0.08), glassMat);
        windshield.position.set(0, 1.18, 1.38);
        windshield.rotation.x = -0.22;
        const roof = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.12, 2.75), new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 }));
        roof.position.set(0, 1.68, -0.1);
        root.add(base, frontCowl, windshield, roof);

        const wGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 16);
        wGeo.rotateZ(Math.PI / 2);
        const frontPivot = new THREE.Group();
        frontPivot.position.set(0, 0.34, 1.25);
        const fw = new THREE.Mesh(wGeo, rimMat);
        frontPivot.add(fw);
        root.add(frontPivot);
        root.userData.frontWheelPivots.push(frontPivot);
        root.userData.allWheelMeshes.push(fw);

        [[-0.82, 0.34, -1.05], [0.82, 0.34, -1.05]].forEach(([x, y, z]) => {
          const rw = new THREE.Mesh(wGeo, rimMat);
          rw.position.set(x, y, z);
          root.add(rw);
          root.userData.allWheelMeshes.push(rw);
        });
      }

      // --- SPEZIALMODELL C: V8 RACING RASENMÄHER MIT FAHRER ---
      else if (car.meshType === 'mower') {
        const deck = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.9, 0.22, 20), bodyMat);
        deck.position.set(0, 0.28, 0);
        const hood = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.55, 1.25), bodyMat);
        hood.position.set(0, 0.65, 0.55);
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.45, 0.55), darkMat);
        seat.position.set(0, 0.72, -0.55);
        const driver = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.65, 0.32), darkMat);
        driver.position.set(0, 1.22, -0.52);
        const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 14), chromeMat);
        helmet.position.set(0, 1.68, -0.48);
        root.add(deck, hood, seat, driver, helmet);

        const wGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.26, 16);
        wGeo.rotateZ(Math.PI / 2);
        [[-0.68, 0.32, 0.85], [0.68, 0.32, 0.85]].forEach(([x, y, z]) => {
          const p = new THREE.Group();
          p.position.set(x, y, z);
          const m = new THREE.Mesh(wGeo, rimMat);
          p.add(m);
          root.add(p);
          root.userData.frontWheelPivots.push(p);
          root.userData.allWheelMeshes.push(m);
        });
        [[-0.75, 0.38, -0.75], [0.75, 0.38, -0.75]].forEach(([x, y, z]) => {
          const m = new THREE.Mesh(wGeo, rimMat);
          m.scale.set(1.2, 1.2, 1.2);
          m.position.set(x, y, z);
          root.add(m);
          root.userData.allWheelMeshes.push(m);
        });
      }

      // --- KEILFORM-AUTOKAROSSERIEN MIT SCHRÄGER FRONTSCHEIBE (hatch, coupe, wagon, suv, gt3, hyper) ---
      else {
        const isHyper = car.meshType === 'hyper';
        const isWagon = car.meshType === 'wagon' || car.meshType === 'suv';
        const isSuv = car.meshType === 'suv';
        const rideY = (isSuv ? 0.66 : isHyper ? 0.44 : 0.52) - suspDrop;

        // 2D-Seitenprofil mit echter Keilform & schräger Windschutzscheibe extrudieren
        const shape = new THREE.Shape();
        const len = 2.22;
        const chH = isSuv ? 0.62 : isHyper ? 0.38 : 0.48;
        const roofH = isSuv ? 1.18 : isHyper ? 0.78 : 0.96;
        const rearTopZ = isWagon ? -1.85 : isHyper ? -1.45 : -1.05;

        shape.moveTo(-len, 0);
        shape.lineTo(len, 0);
        shape.lineTo(len - 0.12, chH * 0.72); // Keilförmige Frontnase
        shape.lineTo(0.95, chH);               // Motorhaube
        shape.lineTo(0.22, roofH);             // Schräge Frontscheibe!
        shape.lineTo(rearTopZ, roofH);         // Dachlinie
        shape.lineTo(-len + 0.1, chH + 0.08);  // Schräge Heckscheibe / Fastback
        shape.lineTo(-len, 0);

        const extrudeGeo = new THREE.ExtrudeGeometry(shape, {
          depth: 1.92,
          bevelEnabled: true,
          bevelThickness: 0.08,
          bevelSize: 0.06,
          bevelSegments: 2
        });
        extrudeGeo.rotateY(Math.PI / 2);
        extrudeGeo.translate(-0.96, rideY - 0.22, 0);
        const bodyMesh = new THREE.Mesh(extrudeGeo, bodyMat);
        bodyMesh.castShadow = true;
        root.add(bodyMesh);

        // Schräge Frontscheibe als reflektierendes Glaspaneel
        const wsGeo = new THREE.BoxGeometry(1.66, 0.06, 0.86);
        const wsMesh = new THREE.Mesh(wsGeo, glassMat);
        wsMesh.position.set(0, rideY + (chH + roofH) * 0.5 - 0.18, 0.58);
        wsMesh.rotation.x = 0.56;
        root.add(wsMesh);

        // Scheinwerfer & LED-Heckband
        const hlMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe });
        const tlMat = new THREE.MeshBasicMaterial({ color: 0xff0044 });
        const hlL = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.1), hlMat);
        const hlR = hlL.clone();
        hlL.position.set(-0.68, rideY + 0.18, 2.22);
        hlR.position.set(0.68, rideY + 0.18, 2.22);
        const tlBar = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.1, 0.08), tlMat);
        tlBar.position.set(0, rideY + 0.28, -2.22);
        root.add(hlL, hlR, tlBar);

        // Front-Ladeluftkühler ab Stage 1
        if ((tuning.intercooler || 0) > 0 || (tuning.turbo || 0) > 0) {
          const ic = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.22, 0.08), chromeMat);
          ic.position.set(0, rideY + 0.02, 2.25);
          root.add(ic);
        }

        // Heckspoiler (wächst mit Aero-Tuning oder Serie bei GT3/Hyper)
        const aeroStage = tuning.aero || 0;
        if (aeroStage > 0 || car.meshType === 'gt3' || isHyper) {
          const wingH = 0.28 + aeroStage * 0.05;
          const pL = new THREE.Mesh(new THREE.BoxGeometry(0.06, wingH, 0.18), darkMat);
          const pR = pL.clone();
          pL.position.set(-0.62, rideY + chH + wingH * 0.35, -2.02);
          pR.position.set(0.62, rideY + chH + wingH * 0.35, -2.02);
          const blade = new THREE.Mesh(new THREE.BoxGeometry(1.92 + aeroStage * 0.08, 0.06, 0.34), bodyMat);
          blade.position.set(0, rideY + chH + wingH * 0.72, -2.06);
          root.add(pL, pR, blade);
        }

        // Sportauspuff-Endrohre
        const exhStage = tuning.exhaust || 0;
        const pipeGeo = new THREE.CylinderGeometry(0.06 + exhStage * 0.01, 0.06 + exhStage * 0.01, 0.25, 12);
        pipeGeo.rotateX(Math.PI / 2);
        const pipeL = new THREE.Mesh(pipeGeo, chromeMat);
        const pipeR = pipeL.clone();
        pipeL.position.set(-0.52, rideY - 0.05, -2.26);
        pipeR.position.set(0.52, rideY - 0.05, -2.26);
        root.add(pipeL, pipeR);

        // 4 Räder mit echten lenkbaren Vorderrad-Pivots
        const wheelRadius = isSuv ? 0.46 : 0.40;
        const tireGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.32, 20);
        tireGeo.rotateZ(Math.PI / 2);
        const rimRadius = wheelRadius * (0.64 + (tuning.rims || 0) * 0.03);
        const rimGeo = new THREE.CylinderGeometry(rimRadius, rimRadius, 0.34, 10);
        rimGeo.rotateZ(Math.PI / 2);

        const wheelCoords = [
          { x: -0.98, y: wheelRadius, z: 1.38, front: true },
          { x: 0.98, y: wheelRadius, z: 1.38, front: true },
          { x: -0.98, y: wheelRadius, z: -1.38, front: false },
          { x: 0.98, y: wheelRadius, z: -1.38, front: false }
        ];

        wheelCoords.forEach(wc => {
          const pivot = new THREE.Group();
          pivot.position.set(wc.x, wc.y, wc.z);
          const wheelMesh = new THREE.Group();
          wheelMesh.add(new THREE.Mesh(tireGeo, darkMat), new THREE.Mesh(rimGeo, rimMat));
          pivot.add(wheelMesh);
          root.add(pivot);
          if (wc.front) root.userData.frontWheelPivots.push(pivot);
          root.userData.allWheelMeshes.push(wheelMesh);
        });
      }

      // NOS-Flammenkegel am Heck
      const flameMat = new THREE.MeshBasicMaterial({ color: 0x00f3ff, transparent: true, opacity: 0.88 });
      const flameGeo = new THREE.ConeGeometry(0.13, 0.85, 8);
      flameGeo.rotateX(-Math.PI / 2);
      const flameL = new THREE.Mesh(flameGeo, flameMat);
      const flameR = flameL.clone();
      flameL.position.set(-0.48, 0.38, -2.55);
      flameR.position.set(0.48, 0.38, -2.55);
      flameL.visible = false;
      flameR.visible = false;
      root.add(flameL, flameR);
      root.userData.flames.push(flameL, flameR);

      // Neon-Unterbodenbeleuchtung
      const neonLight = new THREE.PointLight(neonColor, 2.2, 6.5);
      neonLight.position.set(0, 0.18, 0);
      root.add(neonLight);

      return root;
    }

    // Erzeugt die komplette 3D-Werkstatt-Atmosphäre (Epoxidboden, Gitterrost, 2 Hebebühnen-Säulen, Werkzeugwagen, Reifenstapel, Neonröhren, Staubpartikel)
    function createWorkshopEnvironment() {
      const group = new THREE.Group();

      // 1. Epoxidharz-Werkstattboden (glänzend reflektierend)
      const epoxyFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(70, 70),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.78, roughness: 0.16 })
      );
      epoxyFloor.rotation.x = -Math.PI / 2;
      epoxyFloor.receiveShadow = true;
      group.add(epoxyFloor);

      // 2. Zentrales Gitterrost-Patch unter der Hebebühne
      const grate = new THREE.GridHelper(6.6, 22, 0xf97316, 0x334155);
      grate.position.y = 0.015;
      group.add(grate);

      // 3. Zwei-Säulen-Hebebühne (Werkstatt-Orange & Stahl)
      const orangeMat = new THREE.MeshStandardMaterial({ color: 0xf97316, metalness: 0.5, roughness: 0.35 });
      const steelMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.25 });

      [-2.85, 2.85].forEach(xPos => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.38, 4.2, 0.38), orangeMat);
        post.position.set(xPos, 2.1, 0);
        const armFront = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.18), steelMat);
        armFront.position.set(xPos * 0.65, 0.08, 0.85);
        const armRear = armFront.clone();
        armRear.position.set(xPos * 0.65, 0.08, -0.85);
        group.add(post, armFront, armRear);
      });
      const topBeam = new THREE.Mesh(new THREE.BoxGeometry(6.1, 0.22, 0.25), orangeMat);
      topBeam.position.set(0, 4.2, 0);
      group.add(topBeam);

      // 4. Roter Werkzeugwagen (Tool Trolley)
      const redCartMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.45, roughness: 0.3 });
      const cart = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.15, 0.68), redCartMat);
      cart.position.set(-4.3, 0.58, -1.9);
      cart.rotation.y = 0.35;
      group.add(cart);

      // 5. Reifenstapel (Tire Stacks)
      const tireRubber = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.85 });
      const stackTireGeo = new THREE.TorusGeometry(0.42, 0.15, 10, 18);
      stackTireGeo.rotateX(Math.PI / 2);
      for (let i = 0; i < 4; i++) {
        const t1 = new THREE.Mesh(stackTireGeo, tireRubber);
        t1.position.set(4.4, 0.16 + i * 0.29, -2.3);
        group.add(t1);
      }

      // 6. Decken-Neonröhren (Emissive + PointLights)
      const neonTubeGeo = new THREE.CylinderGeometry(0.05, 0.05, 5.2, 8);
      neonTubeGeo.rotateZ(Math.PI / 2);
      const cyanTubeMat = new THREE.MeshBasicMaterial({ color: 0x00f3ff });
      const pinkTubeMat = new THREE.MeshBasicMaterial({ color: 0xff007f });

      const tubeFront = new THREE.Mesh(neonTubeGeo, cyanTubeMat);
      tubeFront.position.set(0, 4.4, 2.4);
      const tubeRear = new THREE.Mesh(neonTubeGeo, pinkTubeMat);
      tubeRear.position.set(0, 4.4, -2.4);
      group.add(tubeFront, tubeRear);

      const spot = new THREE.SpotLight(0xffffff, 3.2, 22, Math.PI / 3, 0.45);
      spot.position.set(0, 6.5, 1.5);
      group.add(spot);

      // 7. Schwebende Staubpartikel im Scheinwerferkegel (Performance-Guard: 320 <= 500 Partikel)
      const dustCount = 320;
      const dustPositions = new Float32Array(dustCount * 3);
      for (let i = 0; i < dustCount; i++) {
        dustPositions[i * 3] = (Math.random() - 0.5) * 11;
        dustPositions[i * 3 + 1] = 0.2 + Math.random() * 4.5;
        dustPositions[i * 3 + 2] = (Math.random() - 0.5) * 11;
      }
      const dustGeo = new THREE.BufferGeometry();
      dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
      const dustMat = new THREE.PointsMaterial({ color: 0xbae6fd, size: 0.045, transparent: true, opacity: 0.55 });
      const dustPoints = new THREE.Points(dustGeo, dustMat);
      group.add(dustPoints);
      group.userData.dustPoints = dustPoints;

      return group;
    }

    /* =========================================================================
       5. TRACK BUILDER (CatmullRomCurve3 mit 3D-Höhenprofil, Kurven-Banking & Kuppen)
       ========================================================================= */
    function buildTrack3D(trackData) {
      const group = new THREE.Group();

      // Weite Landschaftsebene unterhalb der tiefsten Senke
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(2600, 2600),
        new THREE.MeshStandardMaterial({ color: trackData.ground, roughness: 0.95 })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -1.5;
      group.add(ground);

      // 3D-Kontrollpunkte mit echter Y-Höhenvariation
      const controlPts = trackData.points.map(([x, y, z]) => new THREE.Vector3(x * 1.45, y * 1.35, z * 1.45));
      const curve = new THREE.CatmullRomCurve3(controlPts, true, 'catmullrom', 0.5);

      const segments = 420;
      const roadHalfWidth = 7.8;
      const samples = [];

      // Vorberechnung von Tangente, Krümmungs-Banking und gebankter Normalen für jedes Segment
      const rawPoints = curve.getSpacedPoints(segments);
      for (let i = 0; i < segments; i++) {
        const pPrev = rawPoints[(i - 1 + segments) % segments];
        const pCurr = rawPoints[i];
        const pNext = rawPoints[(i + 1) % segments];

        const tan1 = new THREE.Vector3().subVectors(pCurr, pPrev).normalize();
        const tan2 = new THREE.Vector3().subVectors(pNext, pCurr).normalize();
        const tangent = new THREE.Vector3().subVectors(pNext, pPrev).normalize();

        // Kurvenkrümmung (Y-Komponente des Kreuzprodukts) bestimmt das Banking (Überhöhung)
        const crossY = tan1.z * tan2.x - tan1.x * tan2.z;
        const bankAngle = THREE.MathUtils.clamp(crossY * 2.8, -0.26, 0.26);

        const flatRight = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
        const upVec = new THREE.Vector3(0, 1, 0).applyAxisAngle(tangent, bankAngle).normalize();
        const bankedRight = new THREE.Vector3().crossVectors(tangent, upVec).normalize();

        samples.push({
          point: pCurr,
          tangent,
          up: upVec,
          right: bankedRight,
          bankAngle
        });
      }

      // Erzeuge gebanktes 3D-Straßen-Band (BufferGeometry) + Rot/Weiße Curbs
      const roadVerts = [];
      const curbVerts = [];
      const curbColors = [];

      for (let i = 0; i < segments; i++) {
        const s1 = samples[i];
        const s2 = samples[(i + 1) % segments];

        const p1L = s1.point.clone().addScaledVector(s1.right, -roadHalfWidth);
        const p1R = s1.point.clone().addScaledVector(s1.right, roadHalfWidth);
        const p2L = s2.point.clone().addScaledVector(s2.right, -roadHalfWidth);
        const p2R = s2.point.clone().addScaledVector(s2.right, roadHalfWidth);

        roadVerts.push(
          p1L.x, p1L.y, p1L.z, p1R.x, p1R.y, p1R.z, p2L.x, p2L.y, p2L.z,
          p1R.x, p1R.y, p1R.z, p2R.x, p2R.y, p2R.z, p2L.x, p2L.y, p2L.z
        );

        // Rot-Weiße Randsteine (Curbs)
        const c1L = p1L.clone().addScaledVector(s1.right, -0.75).add(new THREE.Vector3(0, 0.04, 0));
        const c2L = p2L.clone().addScaledVector(s2.right, -0.75).add(new THREE.Vector3(0, 0.04, 0));
        curbVerts.push(
          c1L.x, c1L.y, c1L.z, p1L.x, p1L.y + 0.04, p1L.z, c2L.x, c2L.y, c2L.z,
          p1L.x, p1L.y + 0.04, p1L.z, p2L.x, p2L.y + 0.04, p2L.z, c2L.x, c2L.y, c2L.z
        );
        const isRed = i % 2 === 0;
        for (let k = 0; k < 6; k++) {
          curbColors.push(isRed ? 0.94 : 0.95, isRed ? 0.18 : 0.96, isRed ? 0.25 : 0.98);
        }

        // Strecken-Leitpfosten & Neon-Bögen
        if (i % 10 === 0) {
          const pylon = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, 4.5, 0.3),
            new THREE.MeshBasicMaterial({ color: i % 20 === 0 ? 0x00f3ff : 0xff007f })
          );
          pylon.position.copy(p1R).addScaledVector(s1.right, 1.5);
          pylon.position.y += 2.1;
          group.add(pylon);
        }
      }

      const roadGeo = new THREE.BufferGeometry();
      roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadVerts, 3));
      roadGeo.computeVertexNormals();
      const roadMesh = new THREE.Mesh(
        roadGeo,
        new THREE.MeshStandardMaterial({ color: trackData.road, roughness: 0.62, metalness: 0.18, side: THREE.DoubleSide })
      );
      group.add(roadMesh);

      const curbGeo = new THREE.BufferGeometry();
      curbGeo.setAttribute('position', new THREE.Float32BufferAttribute(curbVerts, 3));
      curbGeo.setAttribute('color', new THREE.Float32BufferAttribute(curbColors, 3));
      curbGeo.computeVertexNormals();
      const curbMesh = new THREE.Mesh(curbGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
      group.add(curbMesh);

      return { group, curve, samples, roadHalfWidth };
    }

    /* =========================================================================
       6. CHALLENGES DEFINITION (3 Daily mit Datums-Reset + 3 Permanent)
       ========================================================================= */
    const CHALLENGES = [
      { id: 'd_drift', type: 'DAILY', title: 'Tages-Drifter', desc: 'Sammle 2.500 Drift-Punkte', key: 'd_drift', target: 2500, cash: 4500, xp: 350 },
      { id: 'd_nearmiss', type: 'DAILY', title: 'Millimeter-Arbeit', desc: 'Schaffe 4 Near-Miss Stunts', key: 'd_nearmiss', target: 4, cash: 5000, xp: 400 },
      { id: 'd_airtime', type: 'DAILY', title: 'Kuppen-Flieger', desc: 'Lande 2 Airtime-Sprünge (>0.4s)', key: 'd_airtime', target: 2, cash: 4000, xp: 300 },
      { id: 'p_wins', type: 'CAREER', title: 'Podest-Dominanz', desc: 'Gewinne 3 Rennen auf Platz 1', key: 'p_wins', target: 3, cash: 12000, xp: 900 },
      { id: 'p_topspeed', type: 'CAREER', title: 'Schallmauer', desc: 'Erreiche 260 km/h im Rennen', key: 'p_topspeed', target: 260, cash: 8500, xp: 650 },
      { id: 'p_cars', type: 'CAREER', title: 'Sammler-Garage', desc: 'Besitze 3 Fahrzeuge', key: 'p_cars', target: 3, cash: 15000, xp: 1100 }
    ];


export {THREE,SoundEngineV6,buildVehicleMesh,createWorkshopEnvironment,buildTrack3D,getClassSvgSilhouette,STARTER_IDS,VEHICLE_CATALOG,TUNING_CATEGORIES,STAGE_LABELS,TRACKS,GAME_MODES,CHALLENGES};
