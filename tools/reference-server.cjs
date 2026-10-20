// Test-only loopback server for the reviewed original snapshot. No CDN/PeerJS.
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const root=path.resolve('web');let source=fs.readFileSync('legacy/index.html','utf8');
source=source.replace(/  <script src="https:[^\n]+\n/g,'').replace(/  <link[^\n]+https:[^\n]+\n/g,'').replace('https://unpkg.com/three@0.160.0/build/three.module.js','/three.module.js');
source=source.replace('  <style>','  <link rel="stylesheet" href="/ui.css"><link rel="stylesheet" href="/fonts.css">\n  <style>');
const allow=new Set(['three.module.js','ui.css','fonts.css',...Array.from({length:9},(_,i)=>`font-${i}.woff2`)]);
http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname.slice(1);if(!name){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(source);}if(!allow.has(name)){res.statusCode=404;return res.end();}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'font/woff2');res.end(fs.readFileSync(path.join(root,name)));}).listen(3214,'127.0.0.1',()=>console.log('Reviewed original reference: http://127.0.0.1:3214'));
