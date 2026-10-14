/* Copahue FM — radio estilo GTA. Las canciones viven en /music (se listan abajo).
   Cada una existe como <f>.opus (principal, 64 kbps) y <f>.m4a (AAC, respaldo para Safari antiguo).
   Para agregar una: convertir con ffmpeg (ver LEEME.md), copiar ambos a /music y añadir una línea a TRACKS.
   Carga diferida: no se descarga ningún audio hasta que el jugador sube a un vehículo y pulsa play/T; solo se baja la pista actual. */
(function(){
'use strict';
const TRACKS=[
 {"f":"bonus-track-1-raquel-cracks-the-code","t":"Raquel cracks the code (Bonus)"},
 {"f":"agua-de-la-muerte","t":"Agua de la muerte"},
 {"f":"esto-no-es-agua","t":"Esto No Es Agua"},
 {"f":"adios-fernando","t":"Adiós Fernando"},
 {"f":"celia-duarte","t":"Celia Duarte"},
 {"f":"copahue-no-te-caigas","t":"Copahue No Te Caigas"},
 {"f":"el-cruce-imposible-de-seba","t":"El Cruce Imposible de Seba"},
 {"f":"la-erre-del-perro","t":"La Erre del Perro"},
 {"f":"pedro-no-cree","t":"Pedro No Cree"},
 {"f":"yasna-volvio-al-lab","t":"Yasna volvió al lab"}
];
const $=s=>document.querySelector(s);
const root=$('#g-radio');if(!root||!TRACKS.length)return;
const a=new Audio();a.preload='metadata';
const els={t:$('#rd-title'),pp:$('#rd-pp'),pv:$('#rd-prev'),nx:$('#rd-next'),mx:$('#rd-mix'),vol:$('#rd-vol')};
let idx=0,auto=false,wasPlaying=false,vol=.22,remix=true,queue=[],hist=[],started=false,segStart=0,segEnd=Infinity;
try{const v=parseFloat(localStorage.getItem('copahueRadioVol'));if(v>=0&&v<=1)vol=v;const r=localStorage.getItem('copahueRadioRemix');if(r!==null)remix=r==='1';}catch(e){}
els.vol.value=Math.round(vol*100);
const SEG=()=>50+Math.random()*20;                       // ~1 min per cut in Remix mode
const EXT=(()=>{try{const t=document.createElement('audio');if(t.canPlayType('audio/ogg; codecs="opus"')||t.canPlayType('audio/webm; codecs="opus"'))return 'opus';}catch(e){}return 'm4a';})();
const url=i=>'music/'+TRACKS[i].f+'.'+EXT;
const driving=()=>{try{if(window.CFC_DRIVING)return !!window.CFC_DRIVING();if(window.__cfc){const c=window.__cfc();return !!(c&&c.inTruck&&!c.frozen);}}catch(e){}return false;};   // respaldo por si el navegador conserva un game.js antiguo en caché
const lvl=()=>{try{return (typeof AU!=='undefined')?AU.level:2;}catch(e){return 2;}};
function applyVol(g){a.volume=Math.min(1,Math.max(0,vol*(g==null?1:g)));a.muted=lvl()===0;}
function nextIdx(){
  if(!remix)return (idx+1)%TRACKS.length;
  if(!queue.length){queue=TRACKS.map((_,i)=>i).filter(i=>TRACKS.length<2||i!==idx);for(let i=queue.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[queue[i],queue[j]]=[queue[j],queue[i]];}}
  return queue.shift();}
function ui(){
  const on=!a.paused;els.pp.textContent=on?'⏸':'▶';root.classList.toggle('on',on);
  els.t.textContent=a.getAttribute('src')?(on?'♪ ':'⏸ ')+TRACKS[idx].t:'Copahue FM · pulsa ▶ o T';els.t.title=TRACKS[idx].t;
  els.mx.classList.toggle('on',remix);els.mx.title=remix?'Remix ACTIVADO: ~1 min de cada canción, desde cualquier parte ( I )':'Remix apagado: canciones completas ( I )';}
function load(i,play,noHist){
  if(!noHist&&a.getAttribute('src')){hist.push(idx);if(hist.length>20)hist.shift();}
  idx=(i+TRACKS.length)%TRACKS.length;segStart=0;segEnd=Infinity;a.src=url(idx);applyVol(remix?0:1);ui();
  if(play)a.play().catch(()=>{ui();});}
/* al cargar la canción: en Remix salta a un punto cualquiera y fija el corte de ~1 min; sin Remix, solo la primera vez ("radio en vivo") */
a.addEventListener('loadedmetadata',()=>{
  const d=a.duration;
  if((remix||!started)&&isFinite(d)&&d>40){const st=Math.random()*Math.max(0,d-(remix?72:20))*(remix?1:.6);a.currentTime=st;segStart=st;}
  segEnd=remix?Math.min(segStart+SEG(),isFinite(d)?d-.8:1e9):Infinity;started=true;});
function toggle(){
  if(!driving())return;          // la radio solo funciona en modo conducción
  if(a.paused){
    if(!a.getAttribute('src'))load(Math.floor(Math.random()*TRACKS.length),false,true);
    applyVol(remix?0:1);a.play().catch(()=>{});
  }else a.pause();
  auto=false;wasPlaying=false;ui();}
a.addEventListener('play',ui);a.addEventListener('pause',ui);
a.addEventListener('ended',()=>load(nextIdx(),true));
a.addEventListener('error',()=>{if(a.getAttribute('src'))setTimeout(()=>load(nextIdx(),true),600);});
function next(){if(!driving())return;load(nextIdx(),true);}
function prev(){if(!driving())return;if(hist.length)load(hist.pop(),true,true);else if(isFinite(a.duration))a.currentTime=segStart;}
function setRemix(v){remix=v;try{localStorage.setItem('copahueRadioRemix',v?'1':'0');}catch(e){}
  if(v&&!a.paused){segStart=Math.max(0,a.currentTime-3);segEnd=a.currentTime+25+Math.random()*30;}else if(!v){segEnd=Infinity;applyVol(1);}
  ui();}
els.pp.onclick=e=>{e.stopPropagation();toggle();};
els.nx.onclick=e=>{e.stopPropagation();next();};
els.pv.onclick=e=>{e.stopPropagation();prev();};
els.mx.onclick=e=>{e.stopPropagation();setRemix(!remix);};
els.vol.oninput=()=>{vol=els.vol.value/100;applyVol(remix?.999:1);try{localStorage.setItem('copahueRadioVol',vol);}catch(e){}};
els.vol.onchange=()=>els.vol.blur();
addEventListener('keydown',e=>{
  if(e.repeat||/INPUT|TEXTAREA|SELECT/.test((e.target&&e.target.tagName)||''))return;
  if(e.code==='KeyT')toggle();else if(e.code==='Period')next();else if(e.code==='Comma')prev();else if(e.code==='KeyI')setRemix(!remix);});
/* fundidos suaves y cambio automático en Remix */
setInterval(()=>{
  if(a.paused||!isFinite(a.duration))return;
  if(!remix){applyVol(1);return;}
  const t=a.currentTime;
  if(t>=segEnd){next();return;}
  applyVol(Math.max(0,Math.min(1,(t-segStart)/2+.05,(segEnd-t)/2.5)));},100);
/* sigue el estado del juego: la radio SOLO suena (y se ve) en modo conducción.
   Al bajarse del vehículo, en cinemáticas, exploración o el final se pausa; si estaba sonando, retoma al volver a conducir.
   También respeta "SOUND OFF". */
setInterval(()=>{
  const drv=driving()&&!document.body.classList.contains('cine');
  document.body.classList.toggle('driving',drv);
  a.muted=lvl()===0;
  if(!drv&&!a.paused){a.pause();wasPlaying=true;}
  else if(drv&&wasPlaying){wasPlaying=false;a.play().catch(()=>{});}
},250);
applyVol();ui();
})();
