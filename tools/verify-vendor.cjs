// Offline integrity check. No installation, network or executable loading.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const provenance=require('../third_party/provenance.json');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
assert.equal(hash(provenance.three.asset),provenance.three.sha256,'Pinned Three.js module changed');
assert.equal(hash('web/ui.css'),provenance.stylesheet.sha256,'Compiled stylesheet changed');
for(const f of require('../third_party/fonts.json').fonts)assert.equal(hash(f.path),f.sha256,'Pinned font changed: '+f.path);
console.log('Local renderer, stylesheet and font integrity verified.');
