'use strict';
// Tiny WebSocket relay implemented with Node's built-in HTTP/TCP modules.
// This keeps the private-room server dependency-free (no npm install needed).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const rooms = new Map();
const sockets = new Map();
const clients = new Set();
const MAX_PLAYERS = 8;
const MAX_PAYLOAD = 64 * 1024;
const OPEN = 1;
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.png':'image/png', '.svg':'image/svg+xml' };

class TinyWebSocket {
  constructor(socket, head = Buffer.alloc(0)) {
    this.socket = socket;
    this.readyState = OPEN;
    this.buffer = Buffer.alloc(0);
    this.events = new Map();
    this.ended = false;
    socket.on('data', chunk => this.consume(chunk));
    socket.on('close', () => this.finish());
    socket.on('end', () => this.finish());
    socket.on('error', error => this.emit('error', error));
    if (head.length) this.consume(head);
  }
  on(name, callback) { const list = this.events.get(name) || []; list.push(callback); this.events.set(name, list); return this; }
  emit(name, value) { for (const fn of (this.events.get(name) || [])) { try { fn(value); } catch (error) { process.stderr.write(`Socket handler error: ${error.message}\n`); } } }
  finish() { if (this.ended) return; this.ended = true; this.readyState = 3; this.emit('close'); }
  frame(opcode, payload = Buffer.alloc(0), callback) {
    if (this.socket.destroyed) return;
    const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
    let header;
    if (data.length < 126) { header = Buffer.from([0x80 | opcode, data.length]); }
    else if (data.length <= 0xffff) { header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(data.length, 2); }
    else { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(data.length), 2); }
    this.socket.write(Buffer.concat([header, data]), callback);
  }
  send(value) { if (this.readyState !== OPEN) return; this.frame(0x1, Buffer.from(String(value), 'utf8')); }
  close(code = 1000, reason = '') {
    if (this.readyState !== OPEN) return;
    this.readyState = 2;
    const text = Buffer.from(String(reason).slice(0, 100), 'utf8');
    const payload = Buffer.alloc(2 + text.length); payload.writeUInt16BE(code, 0); text.copy(payload, 2);
    this.frame(0x8, payload, () => this.socket.end());
    setTimeout(() => { if (!this.socket.destroyed) this.socket.destroy(); }, 1000).unref();
  }
  consume(chunk) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    while (this.buffer.length >= 2) {
      const b0 = this.buffer[0], b1 = this.buffer[1], opcode = b0 & 0x0f, masked = !!(b1 & 0x80);
      let length = b1 & 0x7f, offset = 2;
      if (length === 126) { if (this.buffer.length < 4) return; length = this.buffer.readUInt16BE(2); offset = 4; }
      else if (length === 127) { if (this.buffer.length < 10) return; const big = this.buffer.readBigUInt64BE(2); if (big > BigInt(MAX_PAYLOAD)) return this.close(1009, 'message too large'); length = Number(big); offset = 10; }
      let mask;
      if (masked) { if (this.buffer.length < offset + 4) return; mask = this.buffer.subarray(offset, offset + 4); offset += 4; }
      if (length > MAX_PAYLOAD) return this.close(1009, 'message too large');
      if (this.buffer.length < offset + length) return;
      const payload = Buffer.from(this.buffer.subarray(offset, offset + length));
      this.buffer = this.buffer.subarray(offset + length);
      if (masked && mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      if (opcode === 0x8) { this.frame(0x8, payload, () => this.socket.end()); this.readyState = 2; this.socket.end(); this.finish(); return; }
      if (opcode === 0x9) { this.frame(0xA, payload); continue; }
      if (opcode === 0x1) this.emit('message', payload);
      // Client game messages are small, complete UTF-8 text frames; binary/fragmented frames are ignored.
    }
  }
}

const server = http.createServer((req, res) => {
  let pathname = '/';
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch {}
  if (pathname === '/') pathname = '/index.html';
  const target = path.resolve(ROOT, '.' + pathname);
  if (!target.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(target, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type':MIME[path.extname(target)] || 'application/octet-stream', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
    res.end(data);
  });
});

function send(ws, obj) { if (ws && ws.readyState === OPEN) ws.send(JSON.stringify(obj)); }
function broadcast(room, obj, except = null) { for (const p of room.players.values()) if (p.ws !== except) send(p.ws, obj); }
function cleanName(value) { return String(value || 'Driver').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 18) || 'Driver'; }
function genCode() { let code; do { code = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 5); } while (rooms.has(code)); return code; }
function roomList(room) { return [...room.players.values()].map(p => ({ id:p.id, name:p.name, carId:p.carId, color:p.color })); }
function leave(ws) {
  const info = sockets.get(ws); if (!info) return;
  sockets.delete(ws);
  const room = rooms.get(info.code); if (!room) return;
  room.players.delete(info.id);
  broadcast(room, { type:'playerLeft', playerId:info.id });
  if (!room.players.size) { rooms.delete(info.code); return; }
  if (room.hostId === info.id) room.hostId = room.players.keys().next().value;
  broadcast(room, { type:'lobby', code:room.code, players:roomList(room), hostId:room.hostId });
}
function attachGameProtocol(ws) {
  const id = crypto.randomUUID();
  clients.add(ws);
  ws.on('close', () => { clients.delete(ws); leave(ws); });
  ws.on('error', () => { clients.delete(ws); leave(ws); });
  ws.on('message', buffer => {
    let msg; try { msg = JSON.parse(buffer.toString()); } catch { return send(ws, { type:'error', message:'Ungültige Nachricht.' }); }
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'createRoom') {
      leave(ws);
      const code = genCode(), input = msg.player || {};
      const room = { code, hostId:id, players:new Map(), config:msg.config || { track:0, laps:3 }, started:false };
      room.players.set(id, { id, ws, name:cleanName(input.name), carId:String(input.carId || 'gt3rs').slice(0, 24), color:/^#[0-9a-f]{6}$/i.test(input.color || '') ? input.color : '#62efff', state:null });
      rooms.set(code, room); sockets.set(ws, { id, code });
      return send(ws, { type:'roomCreated', code, playerId:id, host:true, players:roomList(room) });
    }
    if (msg.type === 'joinRoom') {
      leave(ws);
      const code = String(msg.code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''), room = rooms.get(code);
      if (!room) return send(ws, { type:'error', message:'Kein Raum mit diesem Code gefunden.' });
      if (room.started) return send(ws, { type:'error', message:'Dieses Rennen läuft bereits.' });
      if (room.players.size >= MAX_PLAYERS) return send(ws, { type:'error', message:'Lobby voll (maximal 8 Fahrer).' });
      const input = msg.player || {};
      room.players.set(id, { id, ws, name:cleanName(input.name), carId:String(input.carId || 'gt3rs').slice(0, 24), color:/^#[0-9a-f]{6}$/i.test(input.color || '') ? input.color : '#62efff', state:null });
      sockets.set(ws, { id, code });
      send(ws, { type:'joinedRoom', code, playerId:id, host:false, players:roomList(room) });
      broadcast(room, { type:'lobby', code, players:roomList(room), hostId:room.hostId }, ws);
      return;
    }
    const info = sockets.get(ws); if (!info) return send(ws, { type:'error', message:'Erstelle zuerst einen Raum oder trete einem bei.' });
    const room = rooms.get(info.code); if (!room) return;
    if (msg.type === 'leaveRoom') { leave(ws); return; }
    if (msg.type === 'startRace') {
      if (room.hostId !== id) return send(ws, { type:'error', message:'Nur der Host kann das Rennen starten.' });
      room.started = true;
      room.config = { track:Math.max(0, Math.min(9, Number(msg.config?.track) || 0)), laps:[2,3,5].includes(Number(msg.config?.laps)) ? Number(msg.config.laps) : 3 };
      room.startedAt = Date.now();
      broadcast(room, { type:'raceStart', config:room.config, hostId:room.hostId, players:roomList(room) });
      return;
    }
    if (msg.type === 'state') {
      const p = room.players.get(id); if (!p) return;
      const s = msg.state || {}, finite = n => Number.isFinite(Number(n)) ? Math.max(-100000, Math.min(100000, Number(n))) : 0;
      p.state = { id, name:p.name, carId:p.carId, color:p.color, x:finite(s.x), y:finite(s.y), angle:finite(s.angle), speed:finite(s.speed), lap:Math.max(0, Math.min(10, Math.floor(finite(s.lap)))), progress:finite(s.progress), finished:!!s.finished, finishTime:Math.max(0, finite(s.finishTime)) };
      broadcast(room, { type:'playerState', state:p.state }, ws);
    }
  });
}

server.on('upgrade', (req, socket, head) => {
  let pathname = ''; try { pathname = new URL(req.url, 'http://localhost').pathname; } catch {}
  const key = req.headers['sec-websocket-key'];
  if (pathname !== '/race' || !key || String(req.headers.upgrade || '').toLowerCase() !== 'websocket') {
    socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n'); socket.destroy(); return;
  }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  attachGameProtocol(new TinyWebSocket(socket, head));
});
server.listen(PORT, '0.0.0.0', () => console.log(`NOVA RACER running at http://localhost:${PORT}`));
process.on('SIGINT', () => { for (const ws of clients) ws.close(1001, 'server shutdown'); server.close(() => process.exit(0)); });
