/* Copahue FM — radio estilo GTA. Las canciones viven en /music (se listan abajo).
   Para agregar una: copiar el mp3 a /music y añadir una línea a TRACKS. */
(function(){
'use strict';
const TRACKS=[
 {
  "f": "10. Bonus Track 1 Raquel cracks the code.mp3",
  "t": "Raquel cracks the code (Bonus)"
 },
 {
  "f": "5.Agua de la muerte.mp3",
  "t": "Agua de la muerte"
 },
 {
  "f": "7. Esto No Es Agua.mp3",
  "t": "Esto No Es Agua"
 },
 {
  "f": "9.Adi\u00f3s Fernando.mp3",
  "t": "Adi\u00f3s Fernando"
 },
 {
  "f": "Celia Duarte.mp3",
  "t": "Celia Duarte"
 },
 {
  "f": "El Cruce Imposible de Seba.mp3",
  "t": "El Cruce Imposible de Seba"
 },
 {
  "f": "La Erre del Perro.mp3",
  "t": "La Erre del Perro"
 },
 {
  "f": "Pedro No Cree.mp3",
  "t": "Pedro No Cree"
 },
 {
  "f": "Yasna-volvio-al-lab.mp3",
  "t": "Yasna volvi\u00f3 al lab"
 }
];
const $=s=>document.querySelector(s);
const root=$('#g-radio');if(!root||!TRACKS.length)return;
const a=new Audio();a.preload='metadata';
const els={t:$('#rd-title'),pp:$('#rd-pp'),pv:$('#rd-prev'),nx:$('#rd-next'),mx:$('#rd-mix'),vol:$('#rd-vol')};
let idx=0,auto=false,vol=.22,remix=true,queue=[],hist=[],started=false,segStart=0,segEnd=Infinity;
try{const v=parseFloat(localStorage.getItem('copahueRadioVol'));if(v>=0&&v<=1)vol=v;const r=localStorage.getItem('copahueRadioRemix');if(r!==null)remix=r==='1';}catch(e){}
els.vol.value=Math.round(vol*100);
const SEG=()=>50+Math.random()*20;                       // ~1 min per cut in Remix mode
const url=i=>'music/'+encodeURIComponent(TRACKS[i].f);
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
  if(a.paused){
    if(!a.getAttribute('src'))load(Math.floor(Math.random()*TRACKS.length),false,true);
    applyVol(remix?0:1);a.play().catch(()=>{});
  }else a.pause();
  auto=false;ui();}
a.addEventListener('play',ui);a.addEventListener('pause',ui);
a.addEventListener('ended',()=>load(nextIdx(),true));
a.addEventListener('error',()=>{if(a.getAttribute('src'))setTimeout(()=>load(nextIdx(),true),600);});
function next(){load(nextIdx(),true);}
function prev(){if(hist.length)load(hist.pop(),true,true);else if(isFinite(a.duration))a.currentTime=segStart;}
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
/* sigue el estado del juego: respeta "SOUND OFF" y se pausa en cinemáticas/final (que tienen su propia música) */
setInterval(()=>{
  const cine=document.body.classList.contains('cine');
  a.muted=lvl()===0;
  if(cine&&!a.paused){a.pause();auto=true;}
  else if(!cine&&auto){auto=false;a.play().catch(()=>{});}
},500);
applyVol();ui();
})();
