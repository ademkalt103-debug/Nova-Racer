const fs=require('node:fs'),crypto=require('node:crypto');
(async()=>{
 const url='https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Orbitron:wght@600;700;800;900&display=swap';
 const response=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36'}});if(!response.ok)throw Error('Font CSS HTTP '+response.status);let css=await response.text();const manifest=[];
 const urls=[...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m=>m[1]))];
 for(let i=0;i<urls.length;i++){const remote=urls[i];const r=await fetch(remote);if(!r.ok)throw Error('Font HTTP '+r.status);const bytes=Buffer.from(await r.arrayBuffer());const file=`font-${i}.woff2`;fs.writeFileSync('web/'+file,bytes);css=css.replaceAll(remote,file);manifest.push({source:remote,path:'web/'+file,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}
 fs.writeFileSync('web/fonts.css',css);fs.writeFileSync('third_party/fonts.json',JSON.stringify({css_source:url,fonts:manifest},null,2));console.log('Localized fonts:',manifest.length);
})().catch(e=>{console.error(e.message);process.exitCode=1});
