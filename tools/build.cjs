// Explicit, fail-fast build. No install hooks, shell expansion or remote scripts.
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
for(const [command,args] of [
 ['rustup',['target','add','wasm32-unknown-unknown']],
 ['cargo',['build','--locked','--release','-p','nova-client','--target','wasm32-unknown-unknown']],
 ['cargo',['build','--locked','--release','-p','nova-server']],
]){
 const r=spawnSync(command,args,{stdio:'inherit',shell:false});
 if(r.error){console.error(r.error.message);process.exit(1);}if(r.status!==0)process.exit(r.status||1);
}
fs.copyFileSync('target/wasm32-unknown-unknown/release/nova_client.wasm','web/nova-client.wasm');
