// Parse data literals only. Never evaluate the upstream application.
const fs = require('node:fs');
const source = fs.readFileSync('legacy/index.html', 'utf8');
function literal(name) {
  const start = source.indexOf('const '+name+' = ');
  if(start < 0) throw Error('Missing '+name);
  const text = source.slice(source.indexOf('=',start)+1);
  const token = /\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|-?(?:0x[0-9a-fA-F]+|\d+(?:\.\d+)?)|[A-Za-z_$][\w$]*|[\[\]{},:;]/gy;
  let pos=0, peek;
  function next(){if(peek!==undefined){const t=peek;peek=undefined;return t;}for(;;){token.lastIndex=pos;const m=token.exec(text);if(!m)throw Error('Unexpected data at '+text.slice(pos,pos+30));pos=token.lastIndex;if(!/^(\s|\/)/.test(m[0]))return m[0];}}
  function take(){const t=next();if(t==='[' || t==='{'){const obj=t==='['?[]:{};const end=t==='['?']':'}';let n=next();while(n!==end){peek=n;if(t==='[')obj.push(take());else{const k=next().replace(/^['"]|['"]$/g,'');if(next()!==':')throw Error('Expected colon');obj[k]=take();}n=next();if(n===',')n=next();else if(n!==end)throw Error('Expected separator');}return obj;}
    if(t[0]==="'"||t[0]==='"')return t.slice(1,-1).replace(/\\'/g,"'").replace(/\\"/g,'"').replace(/\\n/g,'\n');
    if(t==='true'||t==='false')return t==='true';if(t==='null')return null;if(/^-?\d/.test(t))return Number(t);throw Error('Executable identifier rejected: '+t);}
  return take();
}
const data={cars:literal('VEHICLE_CATALOG'),tuning:literal('TUNING_CATEGORIES'),tracks:literal('TRACKS'),modes:literal('GAME_MODES'),challenges:literal('CHALLENGES')};
fs.mkdirSync('crates/core/data',{recursive:true});fs.writeFileSync('crates/core/data/catalog.json',JSON.stringify(data,null,2)+'\n');
console.log(Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v.length])));
