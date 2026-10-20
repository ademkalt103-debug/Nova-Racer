"use strict";
(async()=>{
  const host=window.novaHost, canvas=host.canvas;
  const response=await fetch("nova-client.wasm");if(!response.ok)throw Error("Build nova-client.wasm first");
  const {instance}=await WebAssembly.instantiate(await response.arrayBuffer(),{env:host.env});
  host.bind(instance.exports.memory);instance.exports.nova_init();document.getElementById("loading").hidden=true;
  let keys=0,pressed=0,mx=-1,my=-1,click=0,last=performance.now();
  const codes={KeyW:1,ArrowUp:1,KeyS:2,ArrowDown:2,KeyA:4,ArrowLeft:4,KeyD:8,ArrowRight:8,Space:16,ShiftLeft:32,ShiftRight:32,KeyP:64,KeyR:128,KeyC:256,Escape:512,KeyM:1024};
  const held=new Set();const rebuild=()=>{keys=0;for(const code of held)keys|=codes[code]||0;};
  window.addEventListener("keydown",e=>{const bit=codes[e.code];if(bit){e.preventDefault();held.add(e.code);rebuild();if(!e.repeat)pressed|=bit;}});
  window.addEventListener("keyup",e=>{held.delete(e.code);rebuild();});
  window.addEventListener("blur",()=>{held.clear();keys=0;if(window.novaState?.racing&&!window.novaState?.paused)pressed|=64;});
  canvas.addEventListener("pointermove",e=>{const r=canvas.getBoundingClientRect();mx=(e.clientX-r.left)*canvas.width/r.width;my=(e.clientY-r.top)*canvas.height/r.height;});
  canvas.addEventListener("pointerdown",e=>{const r=canvas.getBoundingClientRect();mx=(e.clientX-r.left)*canvas.width/r.width;my=(e.clientY-r.top)*canvas.height/r.height;click=1;canvas.focus();});
  for(const button of document.querySelectorAll("#touch button")){const bit=Number(button.dataset.key||button.dataset.press);const release=()=>{keys&=~bit;};button.addEventListener("pointerdown",e=>{e.preventDefault();button.setPointerCapture(e.pointerId);if(button.dataset.press)pressed|=bit;else keys|=bit;});for(const type of ["pointerup","pointercancel","lostpointercapture"])button.addEventListener(type,release);}
  function frame(t){const aspect=innerWidth/innerHeight;canvas.height=Math.max(740,innerHeight);canvas.width=Math.max(960,Math.ceil(canvas.height*aspect));instance.exports.nova_frame(canvas.width,canvas.height,Math.min(0.05,(t-last)/1000),keys,pressed,mx,my,click);last=t;pressed=0;click=0;requestAnimationFrame(frame);}requestAnimationFrame(frame);
})().catch(e=>{document.getElementById("loading").textContent="Could not load NOVA RACER: "+e.message;console.error(e);});
