'use strict';
/**
 * NOVA RACER 3D — ULTIMATE PIXEL GARAGE & STREET LEGENDS SERVER
 * Zero-dependency Node.js HTTP + RFC-6455 WebSocket Relay & Leaderboard Server
 * Optimized for Render.com (Free & Pro Tiers) + Local LAN/Localhost
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;

// Security & Lobby Constants
const MAX_PLAYERS_PER_ROOM = 8;
const MAX_ROOMS = 500;
const MAX_PAYLOAD = 32 * 1024; // 32 KB max WebSocket frame
const MAX_MSGS_PER_SEC = 55;
const OPEN = 1;

const rooms = new Map();
const sockets = new Map();
const clients = new Set();
const ipConnections = new Map();

// In-Memory Global Highscores (Drag 1/4 Mile & Circuit Lap Records)
const leaderboards = {
  drag: [
    { name: 'NovaKing_AT', carName: '2026 Nova Jesko Hyperion X', whp: 1840, time: 6.42, speed: 368 },
    { name: 'Godzilla_R34', carName: '1999 Skyline GT-R R34 V-Spec', whp: 1320, time: 7.18, speed: 329 },
    { name: 'AkinaGhost', carName: '1998 Supra MK4 A80 RZ', whp: 1250, time: 7.45, speed: 318 },
    { name: 'SpoonEG6', carName: '1994 Civic EG6 Turbo', whp: 890, time: 8.31, speed: 284 }
  ],
  circuit: [
    { name: 'NovaKing_AT', trackId: 0, carName: '2024 Porsche 911 GT3 RS 992', time: 42.18 },
    { name: 'WörtherseeGT', trackId: 3, carName: '2026 Nova Jesko Hyperion X', time: 48.65 },
    { name: 'RotaryFD', trackId: 2, carName: '1998 Mazda RX-7 FD Spirit R', time: 51.90 }
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

// Sanitization & Validation Helpers
function cleanText(val, maxLen = 24, fallback = '') {
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
    name: cleanText(input.name ?? existing.name, 18, 'Racer'),
    carId: cleanText(input.carId ?? existing.carId, 24, 'eg6'),
    carName: cleanText(input.carName ?? existing.carName, 36, 'Civic EG6'),
    color: cleanColor(input.color ?? existing.color, '#38bdf8'),
    finishType: cleanText(input.finishType ?? existing.finishType, 16, 'metallic'),
    wheelColor: cleanColor(input.wheelColor ?? existing.wheelColor, '#fbbf24'),
    caliperColor: cleanColor(input.caliperColor ?? existing.caliperColor, '#ef4444'),
    neonColor: cleanText(input.neonColor ?? existing.neonColor, 16, '#00f5ff'),
    whp: Math.round(clampNum(input.whp ?? existing.whp, 100, 3500, 280)),
    rank: cleanText(input.rank ?? existing.rank, 6, 'D'),
    camber: clampNum(input.camber ?? existing.camber, -15, 0, -2),
    rideHeight: clampNum(input.rideHeight ?? existing.rideHeight, -10, 5, 0),
    hasBlower: Boolean(input.hasBlower ?? existing.hasBlower),
    hasIntercooler: Boolean(input.hasIntercooler ?? existing.hasIntercooler),
    spoilerType: Math.round(clampNum(input.spoilerType ?? existing.spoilerType, 0, 4, 1)),
    ready: Boolean(input.ready ?? existing.ready ?? true)
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
      try { fn(val); } catch (e) { /* ignore handler errors */ }
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

  // Healthcheck for Render
  if (pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('OK');
  }

  // Live Status API
  if (pathname === '/api/status') {
    return sendJson(res, 200, {
      ok: true,
      version: '3.0.0-ULTIMATE-3D',
      uptimeSec: Math.round(process.uptime()),
      activeRooms: rooms.size,
      onlinePlayers: clients.size,
      leaderboards
    });
  }

  // Leaderboard API (GET & POST)
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
          const name = cleanText(data.name, 18, 'Racer');
          const carName = cleanText(data.carName, 36, 'Custom Car');
          if (data.mode === 'drag') {
            const time = clampNum(data.time, 4.2, 60, 0);
            const speed = Math.round(clampNum(data.speed, 80, 520, 200));
            const whp = Math.round(clampNum(data.whp, 100, 3500, 300));
            if (time >= 4.2) {
              leaderboards.drag.push({ name, carName, whp, time: Number(time.toFixed(3)), speed });
              leaderboards.drag.sort((a, b) => a.time - b.time);
              leaderboards.drag = leaderboards.drag.slice(0, 15);
            }
          } else {
            const time = clampNum(data.time, 15, 600, 0);
            const trackId = Math.round(clampNum(data.trackId, 0, 10, 0));
            if (time >= 15) {
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

  // Serve Static Files Safely
  const allowedFiles = new Set(['/index.html', '/README.md', '/LICENSE', '/package.json']);
  const fileToServe = allowedFiles.has(pathname) ? pathname.slice(1) : 'index.html';
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

// WebSocket Room & Broadcast Helpers
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

function sanitizeRoomConfig(cfg = {}, current = {}) {
  return {
    track: Math.round(clampNum(cfg.track ?? current.track, 0, 5, 0)),
    laps: Math.round(clampNum(cfg.laps ?? current.laps, 1, 10, 3)),
    weather: cleanText(cfg.weather ?? current.weather, 16, 'sunset'),
    traffic: Boolean(cfg.traffic ?? current.traffic ?? false),
    items: Boolean(cfg.items ?? current.items ?? true)
  };
}

function attachGameProtocol(ws) {
  const id = crypto.randomUUID().slice(0, 12);
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
      return send(ws, { type: 'error', message: 'Ungültiges Datenformat.' });
    }
    if (!msg || typeof msg.type !== 'string') return;

    // 1. Unified Join-or-Create by Custom Team Code (or Create New Room)
    if (msg.type === 'joinOrCreate' || msg.type === 'createRoom' || msg.type === 'joinRoom') {
      leaveRoom(ws);
      let requestedCode = String(msg.code || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 10);

      if (msg.type === 'createRoom' && !requestedCode) {
        requestedCode = genCode();
      }
      if (!requestedCode || requestedCode.length < 3) {
        requestedCode = genCode();
      }

      let room = rooms.get(requestedCode);

      if (msg.type === 'joinRoom' && !room) {
        // Auto-create room if user typed a custom team code so friends never get stuck!
        if (rooms.size >= MAX_ROOMS) {
          return send(ws, { type: 'error', message: 'Maximale Server-Raumanzahl erreicht.' });
        }
      }

      if (!room) {
        if (rooms.size >= MAX_ROOMS) {
          return send(ws, { type: 'error', message: 'Server-Lobby voll.' });
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

    // 2. Live Garage / Car Profile Sync
    if (msg.type === 'updatePlayer') {
      player.profile = sanitizePlayerProfile(msg.player, player.profile);
      broadcastLobbyState(room);
      return;
    }

    // 3. Room Configuration Sync (Track, Laps, Weather, Items)
    if (msg.type === 'updateConfig') {
      if (room.hostId !== id) return;
      room.config = sanitizeRoomConfig(msg.config, room.config);
      broadcastLobbyState(room);
      return;
    }

    // 4. Quick Chat / Lobby Emote
    if (msg.type === 'chat') {
      const text = cleanText(msg.text, 80, '');
      if (!text) return;
      broadcast(room, {
        type: 'chat',
        playerId: id,
        name: player.profile.name,
        color: player.profile.color,
        text,
        ts: Date.now()
      });
      return;
    }

    // 5. Start Race (Host or 2+ Players Ready)
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

    // 6. Return to Lobby for Rematch
    if (msg.type === 'returnToLobby') {
      room.started = false;
      broadcastLobbyState(room);
      return;
    }

    // 7. Tactical Action / Horn / Nitro Purge / EMP / Oil Hazard
    if (msg.type === 'action') {
      broadcast(room, {
        type: 'playerAction',
        playerId: id,
        name: player.profile.name,
        kind: cleanText(msg.kind, 16, 'horn'),
        x: clampNum(msg.x, -50000, 50000, 0),
        z: clampNum(msg.z, -50000, 50000, 0)
      }, ws);
      return;
    }

    // 8. Real-Time 3D Telemetry State Relay
    if (msg.type === 'state') {
      const s = msg.state || {};
      player.state = {
        id,
        name: player.profile.name,
        carId: player.profile.carId,
        color: player.profile.color,
        finishType: player.profile.finishType,
        wheelColor: player.profile.wheelColor,
        neonColor: player.profile.neonColor,
        camber: player.profile.camber,
        rideHeight: player.profile.rideHeight,
        hasBlower: player.profile.hasBlower,
        hasIntercooler: player.profile.hasIntercooler,
        spoilerType: player.profile.spoilerType,
        whp: player.profile.whp,
        rank: player.profile.rank,
        x: clampNum(s.x, -100000, 100000, 0),
        y: clampNum(s.y, -1000, 5000, 0),
        z: clampNum(s.z ?? s.y, -100000, 100000, 0),
        angle: clampNum(s.angle, -1000, 1000, 0),
        steer: clampNum(s.steer, -1, 1, 0),
        speed: clampNum(s.speed, -200, 650, 0),
        lap: Math.round(clampNum(s.lap, 0, 20, 1)),
        progress: clampNum(s.progress, 0, 100, 0),
        drifting: Boolean(s.drifting),
        nos: Boolean(s.nos),
        headlights: Boolean(s.headlights ?? true),
        finished: Boolean(s.finished),
        finishTime: clampNum(s.finishTime, 0, 3600, 0)
      };
      broadcast(room, { type: 'playerState', state: player.state }, ws);
    }
  });
}

// WebSocket Upgrade Handler (/race and /ws)
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
  if (currentCount >= 16) {
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

// Keep-Alive Heartbeat for Render Load Balancer (every 20s)
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
  console.log(`🚀 NOVA RACER 3D ULTIMATE SERVER RUNNING ON PORT ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`⚡ WebSocket Relay: ws://localhost:${PORT}/race`);
  console.log(`====================================================`);
});

process.on('SIGINT', () => {
  for (const ws of clients) ws.close(1001, 'Server shutting down');
  server.close(() => process.exit(0));
});
