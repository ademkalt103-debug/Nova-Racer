'use strict';
/**
 * NOVA RACER 3D — ULTIMATE OVERDRIVE v4.0 SERVER
 * Zero-dependency Node.js HTTP + RFC-6455 WebSocket Relay & Leaderboard Server
 * Supports Team-Code & Direct Invite Link (?room=CODE) Multiplayer, Game Modes,
 * 3D Car/Tuning Sync, Tactical Items & Anti-Cache Delivery for Render.com
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;

const MAX_PLAYERS_PER_ROOM = 8;
const MAX_ROOMS = 500;
const MAX_PAYLOAD = 32 * 1024;
const MAX_MSGS_PER_SEC = 65;
const OPEN = 1;

const rooms = new Map();
const sockets = new Map();
const clients = new Set();
const ipConnections = new Map();

const leaderboards = {
  drag: [
    { name: 'NovaKing_AT', carName: '2026 Nova Jesko Hyperion X', whp: 1890, time: 6.38, speed: 374 },
    { name: 'Godzilla_R34', carName: '1999 Skyline GT-R R34 V-Spec', whp: 1340, time: 7.12, speed: 331 },
    { name: 'AkinaGhost', carName: '1998 Supra MK4 A80 RZ', whp: 1250, time: 7.45, speed: 318 },
    { name: 'SpoonEG6', carName: '1994 Civic EG6 Turbo', whp: 890, time: 8.31, speed: 284 }
  ],
  circuit: [
    { name: 'NovaKing_AT', trackId: 'nova_gp', carName: '2024 Porsche 911 GT3 RS 992', time: 41.85 },
    { name: 'WörtherseeGT', trackId: 'woerthersee_tour', carName: '2024 BMW M3 G80 Comp', time: 45.20 },
    { name: 'RotaryFD', trackId: 'akina_touge', carName: '1998 Mazda RX-7 FD Spirit R', time: 49.90 }
  ],
  drift: [
    { name: 'DK_Takumi', trackId: 'shibuya_drift', carName: '2002 Silvia S15 Spec-R', score: 48500 },
    { name: 'RotaryFD', trackId: 'akina_touge', carName: '1998 Mazda RX-7 FD Spirit R', score: 39200 }
  ]
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function cleanText(val, maxLen = 28, fallback = '') {
  const s = String(val ?? '')
    .replace(/[<>"'`\\\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLen);
  return s || fallback;
}

function cleanColor(val, fallback = '#38bdf8') {
  const s = String(val ?? '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : fallback;
}

function clampNum(val, min, max, fallback = 0) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function sanitizePlayerProfile(input = {}, existing = {}) {
  return {
    name: cleanText(input.name ?? existing.name, 16, 'PILOT'),
    carId: cleanText(input.carId ?? existing.carId, 28, 'civic_eg6'),
    carName: cleanText(input.carName ?? existing.carName, 38, '1994 Civic EG6 Turbo'),
    carClass: cleanText(input.carClass ?? existing.carClass, 6, 'D'),
    pi: Math.round(clampNum(input.pi ?? existing.pi, 100, 999, 340)),
    hp: Math.round(clampNum(input.hp ?? existing.hp, 100, 3500, 210)),
    bodyColor: cleanColor(input.bodyColor ?? input.color ?? existing.bodyColor, '#38bdf8'),
    rimColor: cleanColor(input.rimColor ?? existing.rimColor, '#fbbf24'),
    caliperColor: cleanColor(input.caliperColor ?? existing.caliperColor, '#ef4444'),
    neonColor: cleanColor(input.neonColor ?? existing.neonColor, '#00f2fe'),
    finish: cleanText(input.finish ?? existing.finish, 16, 'metallic'),
    livery: cleanText(input.livery ?? existing.livery, 16, 'none'),
    rideHeightMm: clampNum(input.rideHeightMm ?? existing.rideHeightMm, -60, 20, -20),
    camberDeg: clampNum(input.camberDeg ?? existing.camberDeg, -14, 0, -3),
    carbonHood: Boolean(input.carbonHood ?? existing.carbonHood ?? false),
    underglow: Boolean(input.underglow ?? existing.underglow ?? true),
    parts: (typeof input.parts === 'object' && input.parts) ? input.parts : (existing.parts || {})
  };
}

function sanitizeRoomConfig(cfg = {}, current = {}) {
  return {
    gameMode: cleanText(cfg.gameMode ?? current.gameMode, 20, 'circuit'),
    trackId: cleanText(cfg.trackId ?? current.trackId, 32, 'sunset_coast'),
    laps: Math.round(clampNum(cfg.laps ?? current.laps, 1, 10, 3)),
    items: Boolean(cfg.items ?? current.items ?? true)
  };
}

class TinyWebSocket {
  constructor(socket, head = Buffer.alloc(0), clientIp = 'unknown') {
    this.socket = socket;
    this.clientIp = clientIp;
    this.readyState = OPEN;
    this.buffer = Buffer.alloc(0);
    this.events = new Map();
    this.ended = false;
    this.lastPong = Date.now();
    this.msgCount = 0;
    this.msgWindowStart = Date.now();

    socket.setNoDelay(true);
    socket.on('data', chunk => this.consume(chunk));
    socket.on('close', () => this.finish());
    socket.on('end', () => this.finish());
    socket.on('error', err => this.emit('error', err));
    if (head && head.length) this.consume(head);
  }

  on(name, cb) {
    const list = this.events.get(name) || [];
    list.push(cb);
    this.events.set(name, list);
    return this;
  }

  emit(name, val) {
    for (const fn of (this.events.get(name) || [])) {
      try { fn(val); } catch (e) {}
    }
  }

  finish() {
    if (this.ended) return;
    this.ended = true;
    this.readyState = 3;
    this.emit('close');
  }

  frame(opcode, payload = Buffer.alloc(0), cb) {
    if (this.socket.destroyed) return;
    const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
    let header;
    if (data.length < 126) {
      header = Buffer.from([0x80 | opcode, data.length]);
    } else if (data.length <= 0xffff) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(data.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(data.length), 2);
    }
    try {
      this.socket.write(Buffer.concat([header, data]), cb);
    } catch {
      this.finish();
    }
  }

  send(value) {
    if (this.readyState !== OPEN) return;
    this.frame(0x1, Buffer.from(String(value), 'utf8'));
  }

  ping() {
    if (this.readyState !== OPEN) return;
    this.frame(0x9, Buffer.from('ping'));
  }

  close(code = 1000, reason = '') {
    if (this.readyState !== OPEN) return;
    this.readyState = 2;
    const text = Buffer.from(String(reason).slice(0, 80), 'utf8');
    const payload = Buffer.alloc(2 + text.length);
    payload.writeUInt16BE(code, 0);
    text.copy(payload, 2);
    this.frame(0x8, payload, () => this.socket.end());
    setTimeout(() => {
      if (!this.socket.destroyed) this.socket.destroy();
    }, 800).unref();
  }

  consume(chunk) {
    const now = Date.now();
    if (now - this.msgWindowStart > 1000) {
      this.msgWindowStart = now;
      this.msgCount = 0;
    }

    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    if (this.buffer.length > MAX_PAYLOAD * 2) {
      return this.close(1009, 'Buffer overflow');
    }

    while (this.buffer.length >= 2) {
      const b0 = this.buffer[0];
      const b1 = this.buffer[1];
      const opcode = b0 & 0x0f;
      const masked = Boolean(b1 & 0x80);
      let length = b1 & 0x7f;
      let offset = 2;

      if (length === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) return;
        const big = this.buffer.readBigUInt64BE(2);
        if (big > BigInt(MAX_PAYLOAD)) return this.close(1009, 'Payload too large');
        length = Number(big);
        offset = 10;
      }

      if (length > MAX_PAYLOAD) return this.close(1009, 'Payload too large');
      let mask = null;
      if (masked) {
        if (this.buffer.length < offset + 4) return;
        mask = this.buffer.subarray(offset, offset + 4);
        offset += 4;
      }
      if (this.buffer.length < offset + length) return;

      const payload = Buffer.from(this.buffer.subarray(offset, offset + length));
      this.buffer = this.buffer.subarray(offset + length);

      if (masked && mask) {
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      }

      if (opcode === 0x8) {
        this.frame(0x8, payload, () => this.socket.end());
        this.readyState = 2;
        this.socket.end();
        this.finish();
        return;
      }
      if (opcode === 0x9) {
        this.frame(0xA, payload);
        continue;
      }
      if (opcode === 0xA) {
        this.lastPong = Date.now();
        continue;
      }
      if (opcode === 0x1) {
        this.msgCount++;
        if (this.msgCount <= MAX_MSGS_PER_SEC) {
          this.emit('message', payload);
        }
      }
    }
  }
}

function setSecurityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

function sendJson(res, status, data) {
  setSecurityHeaders(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  setSecurityHeaders(res);
  let pathname = '/';
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    pathname = '/';
  }

  if (pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('OK');
  }

  if (pathname === '/api/status') {
    return sendJson(res, 200, {
      ok: true,
      version: '4.0.0-ULTIMATE-OVERDRIVE',
      uptimeSec: Math.round(process.uptime()),
      activeRooms: rooms.size,
      onlinePlayers: clients.size,
      leaderboards
    });
  }

  if (pathname === '/api/leaderboard') {
    if (req.method === 'GET') {
      return sendJson(res, 200, leaderboards);
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 8192) req.destroy();
      });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const name = cleanText(data.name, 16, 'PILOT');
          const carName = cleanText(data.carName, 38, 'Custom Car');
          if (data.mode === 'drag') {
            const time = clampNum(data.time, 3.8, 60, 0);
            const speed = Math.round(clampNum(data.speed, 80, 560, 200));
            const whp = Math.round(clampNum(data.whp, 100, 3500, 300));
            if (time >= 3.8) {
              leaderboards.drag.push({ name, carName, whp, time: Number(time.toFixed(3)), speed });
              leaderboards.drag.sort((a, b) => a.time - b.time);
              leaderboards.drag = leaderboards.drag.slice(0, 15);
            }
          } else if (data.mode === 'drift') {
            const score = Math.round(clampNum(data.score, 500, 999999, 0));
            const trackId = cleanText(data.trackId, 32, 'shibuya_drift');
            if (score >= 500) {
              leaderboards.drift.push({ name, trackId, carName, score });
              leaderboards.drift.sort((a, b) => b.score - a.score);
              leaderboards.drift = leaderboards.drift.slice(0, 15);
            }
          } else {
            const time = clampNum(data.time, 12, 600, 0);
            const trackId = cleanText(data.trackId, 32, 'sunset_coast');
            if (time >= 12) {
              leaderboards.circuit.push({ name, trackId, carName, time: Number(time.toFixed(2)) });
              leaderboards.circuit.sort((a, b) => a.time - b.time);
              leaderboards.circuit = leaderboards.circuit.slice(0, 15);
            }
          }
          return sendJson(res, 200, { ok: true, leaderboards });
        } catch {
          return sendJson(res, 400, { ok: false, error: 'Invalid JSON' });
        }
      });
      return;
    }
  }

  // Wichtig: Liefert für alle normalen Seitenaufrufe garantiert die index.html als echtes HTML aus!
  const allowedStatic = new Set(['/index.html', '/README.md', '/LICENSE']);
  const fileToServe = allowedStatic.has(pathname) ? pathname.slice(1) : 'index.html';
  const target = path.join(ROOT, fileToServe);

  fs.readFile(target, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    const ext = path.extname(target);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'text/html; charset=utf-8'
    });
    res.end(data);
  });
});

function send(ws, obj) {
  if (ws && ws.readyState === OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function broadcast(room, obj, exceptWs = null) {
  const str = JSON.stringify(obj);
  for (const p of room.players.values()) {
    if (p.ws !== exceptWs && p.ws.readyState === OPEN) {
      p.ws.send(str);
    }
  }
}

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[crypto.randomInt(0, chars.length)];
    }
  } while (rooms.has(code));
  return code;
}

function serializeRoomPlayers(room) {
  return [...room.players.values()].map(p => ({
    id: p.id,
    ...p.profile,
    isHost: room.hostId === p.id
  }));
}

function broadcastLobbyState(room) {
  broadcast(room, {
    type: 'lobby',
    code: room.code,
    hostId: room.hostId,
    config: room.config,
    started: room.started,
    players: serializeRoomPlayers(room)
  });
}

function leaveRoom(ws) {
  const info = sockets.get(ws);
  if (!info) return;
  sockets.delete(ws);
  const room = rooms.get(info.code);
  if (!room) return;
  room.players.delete(info.id);
  broadcast(room, { type: 'playerLeft', playerId: info.id });
  if (room.players.size === 0) {
    rooms.delete(info.code);
    return;
  }
  if (room.hostId === info.id) {
    room.hostId = room.players.keys().next().value;
  }
  broadcastLobbyState(room);
}

function attachGameProtocol(ws) {
  const id = 'p_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  clients.add(ws);

  send(ws, {
    type: 'welcome',
    playerId: id,
    serverTime: Date.now(),
    onlinePlayers: clients.size
  });

  ws.on('close', () => {
    clients.delete(ws);
    leaveRoom(ws);
  });

  ws.on('error', () => {
    clients.delete(ws);
    leaveRoom(ws);
  });

  ws.on('message', buffer => {
    let msg;
    try {
      msg = JSON.parse(buffer.toString('utf8'));
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'pingClient') {
      return send(ws, { type: 'pongClient', clientTs: msg.clientTs, serverTime: Date.now(), onlinePlayers: clients.size });
    }

    if (msg.type === 'joinOrCreate' || msg.type === 'createRoom' || msg.type === 'joinRoom') {
      leaveRoom(ws);
      let requestedCode = String(msg.code || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 10);

      if (!requestedCode || requestedCode.length < 2) {
        requestedCode = genCode();
      }

      let room = rooms.get(requestedCode);
      if (!room) {
        if (rooms.size >= MAX_ROOMS) {
          return send(ws, { type: 'error', message: 'Maximale Server-Raumanzahl erreicht.' });
        }
        room = {
          code: requestedCode,
          hostId: id,
          players: new Map(),
          config: sanitizeRoomConfig(msg.config),
          started: false,
          createdAt: Date.now()
        };
        rooms.set(requestedCode, room);
      }

      if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
        return send(ws, { type: 'error', message: `Team-Lobby ${requestedCode} ist voll (max. 8 Fahrer).` });
      }

      const profile = sanitizePlayerProfile(msg.player);
      room.players.set(id, { id, ws, profile, state: null });
      sockets.set(ws, { id, code: requestedCode });

      const isHost = room.hostId === id;
      send(ws, {
        type: isHost ? 'roomCreated' : 'joinedRoom',
        code: requestedCode,
        playerId: id,
        host: isHost,
        hostId: room.hostId,
        config: room.config,
        started: room.started,
        players: serializeRoomPlayers(room)
      });

      broadcastLobbyState(room);
      return;
    }

    const info = sockets.get(ws);
    if (!info) return;
    const room = rooms.get(info.code);
    if (!room) return;
    const player = room.players.get(info.id);
    if (!player) return;

    if (msg.type === 'leaveRoom') {
      leaveRoom(ws);
      return;
    }

    if (msg.type === 'updatePlayer') {
      player.profile = sanitizePlayerProfile(msg.player, player.profile);
      broadcastLobbyState(room);
      return;
    }

    if (msg.type === 'updateConfig') {
      room.config = sanitizeRoomConfig(msg.config, room.config);
      broadcastLobbyState(room);
      return;
    }

    if (msg.type === 'chat') {
      const text = cleanText(msg.text, 80, '');
      if (!text) return;
      broadcast(room, {
        type: 'chat',
        playerId: id,
        name: player.profile.name,
        text,
        ts: Date.now()
      });
      return;
    }

    if (msg.type === 'startRace') {
      room.started = true;
      room.config = sanitizeRoomConfig(msg.config, room.config);
      room.startedAt = Date.now();
      broadcast(room, {
        type: 'raceStart',
        code: room.code,
        hostId: room.hostId,
        config: room.config,
        players: serializeRoomPlayers(room),
        serverTime: Date.now()
      });
      return;
    }

    if (msg.type === 'action') {
      broadcast(room, {
        type: 'playerAction',
        playerId: id,
        name: player.profile.name,
        kind: cleanText(msg.kind, 16, 'oil'),
        x: clampNum(msg.x, -50000, 50000, 0),
        z: clampNum(msg.z, -50000, 50000, 0)
      }, ws);
      return;
    }

    if (msg.type === 'state') {
      const s = msg.state || {};
      player.state = {
        id,
        name: player.profile.name,
        carId: player.profile.carId,
        x: clampNum(s.x, -100000, 100000, 0),
        z: clampNum(s.z, -100000, 100000, 0),
        heading: clampNum(s.heading, -1000, 1000, 0),
        steerAngle: clampNum(s.steerAngle, -1, 1, 0),
        speed: clampNum(s.speed, -200, 650, 0),
        lap: Math.round(clampNum(s.lap, 1, 20, 1)),
        sampleIdx: Math.round(clampNum(s.sampleIdx, 0, 2000, 0)),
        driftCash: Math.round(clampNum(s.driftCash, 0, 9999999, 0)),
        isDrifting: Boolean(s.isDrifting),
        isBraking: Boolean(s.isBraking),
        useNos: Boolean(s.useNos),
        finished: Boolean(s.finished),
        finishTime: clampNum(s.finishTime, 0, 3600, 0)
      };
      broadcast(room, { type: 'playerState', state: player.state }, ws);
    }
  });
}

server.on('upgrade', (req, socket, head) => {
  let pathname = '';
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch {
    pathname = '';
  }

  const key = req.headers['sec-websocket-key'];
  const isWsPath = pathname === '/race' || pathname === '/ws' || pathname === '/';
  if (!isWsPath || !key || String(req.headers.upgrade || '').toLowerCase() !== 'websocket') {
    socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const currentCount = ipConnections.get(ip) || 0;
  if (currentCount >= 20) {
    socket.write('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  ipConnections.set(ip, currentCount + 1);

  const accept = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
  );

  const ws = new TinyWebSocket(socket, head, ip);
  ws.on('close', () => {
    const c = ipConnections.get(ip) || 1;
    if (c <= 1) ipConnections.delete(ip);
    else ipConnections.set(ip, c - 1);
  });

  attachGameProtocol(ws);
});

setInterval(() => {
  const now = Date.now();
  for (const ws of clients) {
    if (now - ws.lastPong > 75000) {
      ws.close(1001, 'Idle timeout');
    } else {
      ws.ping();
    }
  }
}, 20000).unref();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🚀 NOVA RACER 3D v4.0 OVERDRIVE SERVER ON PORT ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`⚡ WebSocket Relay: ws://localhost:${PORT}/race`);
  console.log(`====================================================`);
});

process.on('SIGINT', () => {
  for (const ws of clients) ws.close(1001, 'Server shutting down');
  server.close(() => process.exit(0));
});
