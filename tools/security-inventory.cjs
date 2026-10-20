// Read-only inventory: never executes dependency source or project install hooks.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const meta=JSON.parse(fs.readFileSync('evidence/cargo-metadata.json','utf8').replace(/^\uFEFF/,''));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const buildScripts=[];
for(const p of meta.packages){for(const t of p.targets.filter(t=>t.kind.includes('custom-build'))){const bytes=fs.readFileSync(t.src_path);buildScripts.push({package:p.name,version:p.version,path:t.src_path,sha256:sha(bytes),source:bytes.toString('utf8')});}}
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(d=>{const p=path.join(dir,d.name);return d.isDirectory()?walk(p):[p];});}
const files=['Cargo.toml','Cargo.lock','package.json','render.yaml',...walk('crates'),...walk('web'),...walk('tools'),...walk('legacy')].filter(p=>!p.endsWith('.wasm'));
const hashes=files.map(p=>({path:p.replaceAll('\\','/'),sha256:sha(fs.readFileSync(p))}));
const originalChecks=files.filter(p=>p.startsWith('legacy')).map(p=>({path:p,suspiciousLines:fs.readFileSync(p,'utf8').split(/\r?\n/).map((s,i)=>({line:i+1,text:s.trim()})).filter(r=>/\beval\s*\(|\bFunction\s*\(|\batob\s*\(|child_process|powershell|cmd\.exe|\.ssh|GITHUB_TOKEN|process\.env|https?:\/\//i.test(r.text))}));
fs.writeFileSync('evidence/security-inventory.json',JSON.stringify({checked_at:new Date().toISOString(),packages:meta.packages.map(p=>({name:p.name,version:p.version,source:p.source})),buildScripts,hashes,originalChecks},null,2));
console.log(JSON.stringify({packages:meta.packages.length,buildScripts:buildScripts.map(s=>`${s.package}@${s.version}`),hashedFiles:hashes.length,originalChecks},null,2));
