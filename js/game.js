
(function(){
'use strict';
const $=s=>document.querySelector(s);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t;
const angLerp=(a,b,t)=>{let d=((b-a+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;return a+d*t;};
const GAME={active:false,tick(){} };window.GAME=GAME;
let Wd=null;
window.onWorldReady=()=>{Wd=window.WORLD;try{init();}catch(e){console.error(e);}try{xaInit();}catch(e){console.error('xaInit',e);}};

// ------------------------------------------------------------ mission definition (real sites of the lab's campaigns)
const VOL=20;   // litres collected and filtered per site (two 10 L jerrycan trips)
const HAB_EN={VER:'Springs / crater',RAS:'Upper Río Agrio',LC:'Lake Caviahue',RAI:'Lower Río Agrio',DUL:'Freshwater control',TER:'Geothermal'};
const MISSION=[
 {c:'CL',en:'Crater Lake',year:2020,hike:true},
 {c:'VA2',en:'Agrio Spring 2 (Vertiente del Agrio)',year:2019,hike:true},
 {c:'VA1',en:'Agrio Spring 1 (Vertiente del Agrio)',year:2019,hike:true},
 {c:'RAS1',en:'Upper Río Agrio 1',year:2019},
 {c:'CC',en:'Culebra Waterfall',year:2019},
 {c:'RJ',en:'Río Jara (freshwater)',year:2019},
 {c:'RA_RJ',en:'Jara–Agrio confluence',year:2019},
 {c:'LC',en:'Lake Caviahue, north arm',year:2019},
 {c:'RAI1',en:'Lower Río Agrio 1 (Gendarmería bridge)',year:2019},
 {c:'SA1',en:'Salto del Agrio, above the falls',year:2019},
 {c:'SA2',en:'Salto del Agrio, plunge pool',year:2019},
 {c:'PT',en:'Puerta de Trolope',year:2019},
 {c:'LN',en:'North of Loncopué (freshwater control)',year:2019},
];
const PROBE=[['Temp.[ºC]','Temperature','°C',1],['pH','pH','',2],['ORP[mV]','ORP','mV',0],['EC[µS/cm]','Conductivity','µS/cm',0],['TDS [ppm]','TDS','ppm',0],
 ['Sal.[psu]','Salinity','psu',2],['D.O.[%]','Dissolved O₂','%',1],['D.O.[ppm]','Dissolved O₂','mg/L',2],['Turb.FNU','Turbidity','FNU',1]];
const DOM_EN={Bacteria:'Bacteria',Arquea:'Archaea',Eucariota:'Eukaryota',Viruses:'Viruses',Desconocido:'Unclassified'};
const DOM_COL={Bacteria:'#ff9f1c',Arquea:'#9b5de5',Eucariota:'#8ac926',Viruses:'#f15bb5',Desconocido:'#cfc8b6'};

// ------------------------------------------------------------ state
const S={t:0,score:0,sites:{},samples:[],shipped:false,target:null};
let M=[];               // runtime mission entries
const pl={x:0,z:0,yaw:0,inTruck:true,carry:0,fill:0,walk:0,g:null};
const truck={x:0,z:0,yaw:0,speed:0,g:null,wheels:[]};
const cam={fp:true,fpPitch:0,fpY:null,wasTruck:true,yaw:0,pitch:.42,dist:1.9,dragYaw:0,dragPitch:0,zoom:1,map:false,lastDrag:-9};
let base=null,mode='title',modal=null,roadPts=[];
const keys={};let joy={x:0,y:0};

function save(){try{localStorage.setItem('cfc_save_v1',JSON.stringify({sites:S.sites,samples:S.samples,score:S.score,t:S.t,shipped:S.shipped,quakeAt:S.quakeAt,petted:!!S.petted,kits:kits.map(k=>[k.x,k.z])}));}catch(e){}}
function load(){try{const d=JSON.parse(localStorage.getItem('cfc_save_v1')||'null');return d;}catch(e){return null;}}

// ------------------------------------------------------------ helpers
const meters=y=>y/4.2*1000+900;
function walkable(x,z){if(x<Wd.X0+.2||x>Wd.X1-.2||z<Wd.Z0+.2||z>Wd.Z1-.2)return false;const E=Wd.infoAt(x,z);return !!E&&E.dl>.02;}
function accessPoint(x,z){if(walkable(x,z)&&Wd.infoAt(x,z).dl>.06)return [x,z];for(let r=.05;r<3;r+=.05)for(let a=0;a<32;a++){const q=a/32*6.283,px=x+Math.cos(q)*r,pz=z+Math.sin(q)*r;if(walkable(px,pz)&&Wd.infoAt(px,pz).dl>.06)return [px,pz];}return [x,z];}
function roadDist(x,z){let b=1e9;for(let i=0;i<roadPts.length;i++){const p=roadPts[i];const d=(p[0]-x)**2+(p[1]-z)**2;if(d<b)b=d;}return Math.sqrt(b);}
function nearestRoad(x,z){let b=1e9,bi=0;roadPts.forEach((p,i)=>{const d=(p[0]-x)**2+(p[1]-z)**2;if(d<b){b=d;bi=i;}});return roadPts[bi];}
const fmtT=s=>{s=Math.floor(s);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');};
function fmtV(v,d){if(v===undefined||v===null||isNaN(v))return '—';return Math.abs(v)>=10000?(v/1000).toFixed(1)+'k':v.toFixed(d);}
let toastT=null;function toast(msg,warn,ms=3200){const el=$('#g-toast');el.innerHTML=msg;el.classList.toggle('warn',!!warn);el.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>el.classList.remove('on'),ms);}
let lastWarn=0;function warnOnce(msg){if(S.t-lastWarn>2.5){lastWarn=S.t;toast(msg,true,2200);beep(180,.12);}}
function stamp(big,small){AU.sfx.stamp();const el=$('#g-stamp');el.innerHTML=big+(small?'<small>'+small+'</small>':'');el.classList.add('on');setTimeout(()=>el.classList.remove('on'),1700);}
// ------------------------------------------------------------ AUDIO (all procedural WebAudio: no files)
const AU=(()=>{
  let AUprev=0,AUprevD=0,C=null,master,bus={},L={},noise,brown,level=2,nextNote=0,step=0,bar=0,timers={bird:3,cricket:1,animal:12,flute:20},lastMel=7;
  const R=Math.random;
  function gain(v,to){const g=C.createGain();g.gain.value=v;g.connect(to||master);return g;}
  function buf(kind){const n=C.sampleRate*2,b=C.createBuffer(1,n,C.sampleRate),d=b.getChannelData(0);let last=0;for(let i=0;i<n;i++){const w=R()*2-1;if(kind==='brown'){last=(last+.02*w)/1.02;d[i]=last*3.5;}else d[i]=w;}return b;}
  function src(b){const s=C.createBufferSource();s.buffer=b;s.loop=true;s.start(0,R()*1.5);return s;}
  function filt(type,f,q){const x=C.createBiquadFilter();x.type=type;x.frequency.value=f;if(q!==undefined)x.Q.value=q;return x;}
  function loop(b,chain,to){const s=src(b);let n=s;chain.forEach(c=>{n.connect(c);n=c;});const g=gain(0,to);n.connect(g);return {s,g,f:chain[0]};}
  function init(){
    if(C){if(C.state==='suspended')C.resume();return;}
    try{C=new (window.AudioContext||window.webkitAudioContext)();}catch(e){return;}
    master=C.createGain();master.gain.value=.9;const comp=C.createDynamicsCompressor();master.connect(comp);comp.connect(C.destination);
    bus.mus=gain(.0);bus.amb=gain(.9);bus.sfx=gain(.9);
    const rev=C.createConvolver();{const n=C.sampleRate*2.2,b=C.createBuffer(2,n,C.sampleRate);for(let ch=0;ch<2;ch++){const d=b.getChannelData(ch);for(let i=0;i<n;i++)d[i]=(R()*2-1)*Math.pow(1-i/n,3);}rev.buffer=b;}
    bus.rev=gain(.35);rev.connect(bus.rev);bus.revIn=C.createGain();bus.revIn.connect(rev);bus.rev.disconnect();bus.rev.connect(bus.mus);
    noise=buf('white');brown=buf('brown');
    // ambience loops
    L.water=loop(brown,[filt('bandpass',900,.6)],bus.amb);L.water2=loop(noise,[filt('highpass',3500)],bus.amb);
    const lfo=C.createOscillator(),lg=C.createGain();lfo.frequency.value=.23;lg.gain.value=350;lfo.connect(lg);lg.connect(L.water.f.frequency);lfo.start();
    L.wind=loop(brown,[filt('lowpass',420)],bus.amb);L.rumble=loop(brown,[filt('lowpass',85)],bus.amb);L.hiss=loop(noise,[filt('highpass',4200)],bus.amb);
    // machine loops
    L.gravel=loop(noise,[filt('bandpass',1800,1.2)],bus.sfx);L.gurgle=loop(noise,[filt('bandpass',600,9)],bus.sfx);L.beat=loop(noise,[filt('bandpass',3200,2)],bus.sfx);
    L.hand=loop(noise,[filt('bandpass',1400,1.5)],bus.sfx);{const o=C.createOscillator();o.type='sawtooth';o.frequency.value=62;o.start();const f=filt('lowpass',420,2);L.bg=gain(0,bus.amb);o.connect(f);f.connect(L.bg);}L.rain=loop(noise,[filt('lowpass',2800),filt('highpass',450)],bus.amb);
    const eng=(f,type)=>{const o=C.createOscillator();o.type=type;o.frequency.value=f;o.start();return o;};
    L.e1=eng(45,'sawtooth');L.e2=eng(22,'square');const ef=filt('lowpass',260,3);L.eg=gain(0,bus.sfx);L.e1.connect(ef);L.e2.connect(ef);ef.connect(L.eg);L.ef=ef;
    L.p1=eng(118,'sawtooth');L.p2=eng(237,'square');const pf=filt('bandpass',900,1.5);L.pg=gain(0,bus.sfx);L.p1.connect(pf);L.p2.connect(pf);pf.connect(L.pg);
    setLevel(level);nextNote=C.currentTime+.3;
  }
  function setLevel(l){level=l;if(!C)return;const t=C.currentTime;bus.mus.gain.setTargetAtTime(l===2?.17:0,t,.4);bus.amb.gain.setTargetAtTime(l>0?.9:0,t,.2);bus.sfx.gain.setTargetAtTime(l>0?.9:0,t,.1);}
  const set=(n,v,tc=.15)=>{if(n)n.g?n.g.gain.setTargetAtTime(v,C.currentTime,tc):n.gain.setTargetAtTime(v,C.currentTime,tc);};
  // ---------- one-shots
  function env(g,t,a,peak,d){g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(peak,t+a);g.gain.exponentialRampToValueAtTime(.0001,t+a+d);}
  function tone(f,d,type='sine',vol=.1,to,f2,at){if(!C)return;const t=(at||C.currentTime),o=C.createOscillator(),g=gain(0,to||bus.sfx);o.type=type;o.frequency.setValueAtTime(f,t);if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+d);o.connect(g);env(g,t,.008,vol,d);o.start(t);o.stop(t+d+.05);return g;}
  function burst(d,type,f,q,vol,to,at,f2){if(!C)return;const t=at||C.currentTime,s=C.createBufferSource();s.buffer=noise;const x=filt(type,f,q);if(f2)x.frequency.exponentialRampToValueAtTime(f2,t+d);const g=gain(0,to||bus.sfx);s.connect(x);x.connect(g);env(g,t,.005,vol,d);s.start(t,R());s.stop(t+d+.05);}
  const sfx={
    beep:(f=660,d=.08,type='square',vol=.05)=>tone(f,d,type,vol*1.2),
    click:()=>tone(1200,.03,'square',.03),
    step:(surf)=>{if(surf==='water'){burst(.16,'bandpass',700+R()*400,1.5,.16);burst(.08,'highpass',3000,.7,.05);}else if(surf==='snow')burst(.09,'bandpass',3500+R()*800,.8,.07);
      else if(surf==='ash')burst(.08,'bandpass',1200+R()*500,.9,.11);else{burst(.06,'bandpass',1500+R()*900,1,.12);burst(.03,'lowpass',300,.7,.08);}},
    door:()=>{burst(.12,'lowpass',400,1,.35);tone(90,.12,'triangle',.18);},
    pour:()=>{if(!C)return;for(let i=0;i<14;i++)burst(.07,'bandpass',300+R()*700,8,.18,null,C.currentTime+i*.06+R()*.03);},
    splash:()=>{burst(.35,'bandpass',900,.8,.25,null,null,300);},
    skid:()=>{burst(.4,'bandpass',1400,1.2,.22,null,null,500);tone(900,.12,'sawtooth',.02,null,300);},
    tear:()=>{burst(.45,'bandpass',2500,3,.35,null,null,400);tone(160,.3,'sawtooth',.08,null,60);},
    ping:()=>{tone(1318,.25,'sine',.08);tone(1760,.35,'sine',.05,null,null,C&&C.currentTime+.09);},
    tada:()=>{if(!C)return;const t=C.currentTime;[523,659,784,1046].forEach((f,i)=>{tone(f,.28,'triangle',.09,null,null,t+i*.09);});},
    stamp:()=>{burst(.12,'lowpass',260,1,.5);tone(70,.2,'sine',.3,null,40);},
    horn:()=>{tone(370,.35,'square',.05);tone(466,.35,'square',.04);},
    voice:(n=8,base=150)=>{if(!C)return;const V=[[800,1200],[400,2000],[300,2400],[500,900],[350,750]];let t=C.currentTime+.02;
      for(let i=0;i<n;i++){const d=.07+R()*.07,o=C.createOscillator();o.type='sawtooth';const f=base*(1+(R()-.5)*.5)*(i===n-1?.85:1);o.frequency.setValueAtTime(f,t);o.frequency.linearRampToValueAtTime(f*(.9+R()*.25),t+d);
        const v=V[Math.floor(R()*V.length)],f1=filt('bandpass',v[0],6),f2=filt('bandpass',v[1],8),g=gain(0,bus.sfx);o.connect(f1);o.connect(f2);f1.connect(g);f2.connect(g);env(g,t,.015,.5,d);o.start(t);o.stop(t+d+.05);
        if(R()<.4)burst(.03,'highpass',4000,.7,.05,null,t-.02);t+=d+.02+(R()<.15?.12:0);}},
  };
  // ---------- nature one-shots
  function bird(){if(!C)return;const t=C.currentTime,n=2+Math.floor(R()*5),f0=2200+R()*2500,p=(R()-.5)*1.4;
    for(let i=0;i<n;i++){const s=t+i*(.09+R()*.08),o=C.createOscillator(),g=gain(0,bus.amb);const pan=C.createStereoPanner?C.createStereoPanner():null;
      o.frequency.setValueAtTime(f0*(1+R()*.2),s);o.frequency.exponentialRampToValueAtTime(f0*(R()<.5?1.5:.7),s+.07);if(pan){pan.pan.value=p;o.connect(pan);pan.connect(g);}else o.connect(g);env(g,s,.005,.035,.08);o.start(s);o.stop(s+.12);}}
  function crickets(){if(!C)return;const t=C.currentTime,f=4300+R()*600;for(let k=0;k<3;k++)for(let i=0;i<4;i++){const s=t+k*.45+i*.035;tone(f,.02,'sine',.012,bus.amb,null,s);}}
  function animal(kind){if(!C)return;const t=C.currentTime;
    if(kind==='sheep'){const o=C.createOscillator(),lf=C.createOscillator(),lg=C.createGain(),f=filt('bandpass',900,2),g=gain(0,bus.amb);o.type='sawtooth';o.frequency.value=260+R()*80;lf.frequency.value=7;lg.gain.value=18;lf.connect(lg);lg.connect(o.frequency);o.connect(f);f.connect(g);env(g,t,.05,.05,.7);o.start(t);lf.start(t);o.stop(t+.9);lf.stop(t+.9);}
    else if(kind==='dog'){for(let i=0;i<2+Math.floor(R()*2);i++){const s=t+i*.28;tone(420,.1,'sawtooth',.03,bus.amb,260,s);burst(.08,'bandpass',900,2,.04,bus.amb,s);}}
    else if(kind==='fox'){tone(900,.18,'triangle',.03,bus.amb,1500);tone(1400,.2,'triangle',.02,bus.amb,700,t+.22);}
    else if(kind==='owl'){[0,.45,.7].forEach((d,i)=>{const o=C.createOscillator(),g=gain(0,bus.amb);o.frequency.setValueAtTime(390,t+d);o.frequency.linearRampToValueAtTime(340,t+d+.3);o.connect(g);o.connect(bus.revIn);env(g,t+d,.05,i===0?.05:.035,.35);o.start(t+d);o.stop(t+d+.5);});}
    else if(kind==='condor'){burst(.5,'bandpass',500,2,.03,bus.amb);}
    else if(kind==='goat'){const o=C.createOscillator(),f=filt('bandpass',1200,3),g=gain(0,bus.amb);o.type='sawtooth';o.frequency.setValueAtTime(420,t);o.frequency.linearRampToValueAtTime(380,t+.5);const lf=C.createOscillator(),lg=C.createGain();lf.frequency.value=11;lg.gain.value=40;lf.connect(lg);lg.connect(o.frequency);o.connect(f);f.connect(g);env(g,t,.03,.04,.5);o.start(t);lf.start(t);o.stop(t+.6);lf.stop(t+.6);}}
  // ---------- music: calm generative "forest walk" in D major pentatonic
  const CH=[[50,57,62,66,69],[47,54,59,62,66],[43,50,55,59,62],[45,52,57,62,64]];  // D, Bm, Gmaj, Asus (midi)
  const PENT=[62,64,66,69,71,74,76,78,81,83];const mf=m=>440*Math.pow(2,(m-69)/12);
  function pluck(m,t,vol=.1,dur=1.6){const o=C.createOscillator(),o2=C.createOscillator(),g=gain(0,bus.mus),f=filt('lowpass',2600,.5);o.type='triangle';o2.type='sine';o.frequency.value=mf(m);o2.frequency.value=mf(m)*2.005;
    const g2=C.createGain();g2.gain.value=.25;o.connect(f);o2.connect(g2);g2.connect(f);f.connect(g);f.connect(bus.revIn);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+.006);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.start(t);o2.start(t);o.stop(t+dur+.05);o2.stop(t+dur+.05);}
  function pad(ch,t,dur){ch.slice(1,4).forEach((m,i)=>{const o=C.createOscillator(),f=filt('lowpass',700,.3),g=gain(0,bus.mus);o.type='sawtooth';o.frequency.value=mf(m);o.detune.value=(i-1)*7;o.connect(f);f.connect(g);f.connect(bus.revIn);
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.022,t+1.4);g.gain.setValueAtTime(.022,t+dur-1.2);g.gain.linearRampToValueAtTime(0,t+dur+.4);o.start(t);o.stop(t+dur+.5);});
    const b=C.createOscillator(),bg=gain(0,bus.mus);b.type='sine';b.frequency.value=mf(ch[0]-12);b.connect(bg);bg.gain.setValueAtTime(0,t);bg.gain.linearRampToValueAtTime(.09,t+.05);bg.gain.exponentialRampToValueAtTime(.0001,t+dur*.9);b.start(t);b.stop(t+dur);}
  function flute(t){const m=PENT[3+Math.floor(R()*5)],o=C.createOscillator(),v=C.createOscillator(),vg=C.createGain(),g=gain(0,bus.mus);o.type='sine';o.frequency.value=mf(m);v.frequency.value=5;vg.gain.value=4;v.connect(vg);vg.connect(o.frequency);o.connect(g);o.connect(bus.revIn);
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.05,t+.5);g.gain.linearRampToValueAtTime(.0001,t+3.2);o.start(t);v.start(t);o.stop(t+3.3);v.stop(t+3.3);}
  function music(){const spb=60/72/2;   // eighth notes at 72 bpm
    while(nextNote<C.currentTime+.25){const t=nextNote,ch=CH[bar%4];
      if(step===0)pad(ch,t,spb*16);
      if(step%4===0&&R()<.8)pluck(ch[1+Math.floor(R()*3)]+12,t,.05,2.2);
      if(R()<.42){lastMel=clamp(lastMel+Math.round((R()-.5)*4),0,PENT.length-1);pluck(PENT[lastMel],t,.075,1.4);}
      if(step===0&&bar%8===5&&R()<.7)flute(t+spb*2);
      nextNote+=spb*(step%2?.92:1.08);step++;if(step>=16){step=0;bar++;}}}
  // ---------- volcano drama music: tense action (quake) and a loud, strident symphony (eruption)
  let dStep=0;const mfq=n=>440*Math.pow(2,(n-69)/12);
  function dOsc(type,f,t,a,d,g,to,f2){const o=C.createOscillator(),e=gain(0,to||bus.mus);o.type=type;o.frequency.setValueAtTime(f,t);if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+a+d);env(e,t,a,g,d);o.connect(e);o.start(t);o.stop(t+a+d+.05);return o;}
  function dNoise(t,d,g,type,f,q){const s=C.createBufferSource();s.buffer=noise;const fl=filt(type,f,q),e=gain(0,bus.mus);env(e,t,.004,g,d);s.connect(fl);fl.connect(e);s.start(t,R()*1.5);s.stop(t+d+.1);}
  function brassChord(ns,t,d,g){ns.forEach(n=>[-9,0,9].forEach(dt=>{const o=C.createOscillator(),f=filt('lowpass',2400,1.4),e=gain(0,bus.mus);o.type='sawtooth';o.frequency.value=mfq(n);o.detune.value=dt;
    e.gain.setValueAtTime(0,t);e.gain.linearRampToValueAtTime(g,t+.06);e.gain.setValueAtTime(g*.85,t+d*.7);e.gain.exponentialRampToValueAtTime(.0001,t+d);f.frequency.setValueAtTime(900,t);f.frequency.linearRampToValueAtTime(3200,t+.12);o.connect(f);f.connect(e);o.start(t);o.stop(t+d+.05);}));}
  function tense(){const s16=60/138/4;const CHd=[[50,53,57],[46,50,53],[43,46,50],[45,49,52]];
    while(nextNote<C.currentTime+.25){const t=nextNote,b=dStep%16,ch=CHd[Math.floor(dStep/32)%4];
      dOsc('sawtooth',mfq(ch[0]-12+(b%8===6?1:0)),t,.004,s16*.8,.16);                                // low string ostinato
      if(b%2===0)dOsc('sawtooth',mfq(ch[[0,1,2,1][(b/2)%4]]),t,.004,s16*.9,.05);
      if(b===0||b===6||b===10)dOsc('sine',95,t,.002,.35,.9,null,38);                                  // taiko
      if(b===0||b===10)dNoise(t,.25,.35,'lowpass',400);
      if(b%4===2)dNoise(t,.05,.08,'highpass',7000);                                                 // tick
      if(b===12&&(dStep/16)%2===1)brassChord([ch[0]+12,ch[2]+12],t,s16*4,.03);                        // stabs
      if(dStep%64===48)dOsc('sawtooth',mfq(ch[0]+12),t,.02,s16*16,.04,null,mfq(ch[0]+24));            // rising siren
      nextNote+=s16;dStep++;}}
  function orch(){const s16=60/150/4;const CHo=[[38,50,53,57,62],[34,46,50,53,58],[31,43,46,50,55],[33,45,49,52,57,58]];
    while(nextNote<C.currentTime+.25){const t=nextNote,b=dStep%16,bar=Math.floor(dStep/16),ch=CHo[bar%4];
      if(b===0){brassChord(ch.slice(1),t,s16*14,.05);dOsc('sawtooth',mfq(ch[0]),t,.02,s16*15,.3);dNoise(t,2.2,.55,'highpass',5000);}  // brass + bass + crash
      if(b===8&&bar%2)brassChord([ch[1]+12,ch[2]+12,ch[2]+13],t,s16*6,.035);                         // strident cluster
      dOsc('sawtooth',mfq(ch[2]+24+(b%2)),t,.003,s16*.9,.035);                                         // string tremolo
      if(b%2===0||bar%4===3)dOsc('sine',70,t,.002,.3,.7,null,45);                                     // timpani
      if(b%4===0)dNoise(t,.3,.4,'lowpass',260);
      if(b===4||b===12)dNoise(t,.12,.3,'bandpass',1800,1);                                           // snare
      if(b===14)dOsc('square',mfq(ch[3]+24),t,.01,s16*2,.03);
      nextNote+=s16;dStep++;}}
  // ---------- per-frame update
  function update(dt,E){
    if(!C||C.state!=='running')return;
    if(E.drama!==AUprevD){AUprevD=E.drama;nextNote=Math.max(nextNote,C.currentTime+.05);if(nextNote>C.currentTime+1)nextNote=C.currentTime+.05;dStep=0;}
    if(level===2&&!E.finale){if(E.drama===2){orch();set(bus.mus,.6,.5);}else if(E.drama===1){tense();set(bus.mus,.34,.8);}else{music();set(bus.mus,.17*(1-.35*(E.night||0)),.8);}}else set(bus.mus,0,.3);
    set(L.rain,(E.rain||0)*.32,.4);set(L.bg,(E.boat||0)*.06,.3);timers.owl=(timers.owl===undefined?20:timers.owl);
    set(L.water,E.water*.5);set(L.water2,E.water*.05);set(L.wind,E.wind*.35);set(L.rumble,Math.max(E.crater*.5,(E.quake||0)*1.2));set(L.hiss,E.vent*.06);
    // truck
    const sp=Math.abs(E.speed);L.e1.frequency.setTargetAtTime(40+sp*30+(E.thr?8:0),C.currentTime,.12);L.e2.frequency.setTargetAtTime(20+sp*15,C.currentTime,.12);L.ef.frequency.setTargetAtTime(220+sp*180,C.currentTime,.12);
    set(L.eg,E.driving?.11+sp*.03:0,.2);set(L.gravel,E.driving&&E.offroad?Math.min(.25,sp*.12):0);
    set(L.pg,E.pump===1?.22:0,.05);set(L.hand,E.pump===2?.2*(.45+.55*Math.abs(Math.sin(C.currentTime*6))):0,.02);
    if(E.pump&&!AUprev){sfx.beep(E.pump===1?140:260,.12,'sawtooth',.06);}AUprev=E.pump;
    set(L.gurgle,E.gurgle?.25:0,.08);if(E.gurgle)L.gurgle.f.frequency.setTargetAtTime(300+R()*700,C.currentTime,.03);
    set(L.beat,E.beater?.22*(.6+.4*R()):0,.02);
    // nature
    for(const k in timers)timers[k]-=dt;
    if(timers.bird<=0){timers.bird=2+R()*7/(E.forest?2:1);if(E.alt<2400&&E.night<.5&&!E.snow)bird();}
    if(timers.owl<=0){timers.owl=10+R()*14;if(E.night>.6)animal('owl');}
    if(timers.cricket<=0){timers.cricket=(E.night>.5?.6:1.2)+R()*3;if(E.alt<2100&&!E.driving&&!E.snow&&!E.rain)crickets();}
    if(timers.animal<=0){timers.animal=14+R()*22;const k=E.alt>2300?(R()<.5?'condor':'fox'):['sheep','dog','goat','sheep','fox','sheep','dog'][Math.floor(R()*7)];animal(k);}
  }
  return {init,setLevel,get level(){return level},update,sfx,animal,raw:()=>C?{C,master}:null};
})();
const beep=(f,d,type,vol)=>AU.sfx.beep(f,d,type,vol);
const tada=()=>AU.sfx.tada();


// ------------------------------------------------------------ models
const VEH_TYPES=[['pickup','Double-cab pickup','Camioneta doble cabina'],['van','Field-lab van','Furgón laboratorio'],['monster','Monster truck','Monster truck'],['buggy','Dune buggy','Buggy arenero']];
const VEH_COLORS=[['#440154','Viridis purple','Morado viridis'],['#414487','Viridis indigo','Índigo viridis'],['#2a788e','Viridis blue','Azul viridis'],['#22a884','Viridis teal','Turquesa viridis'],['#7ad151','Viridis green','Verde viridis'],['#fde725','Viridis yellow','Amarillo viridis'],
 ['#30123b','Turbo night','Noche turbo'],['#4662d7','Turbo blue','Azul turbo'],['#36aaf9','Turbo sky','Cielo turbo'],['#1ae4b6','Turbo aqua','Aguamarina turbo'],['#72fe5e','Turbo lime','Lima turbo'],['#c8ef34','Turbo chartreuse','Chartreuse turbo'],['#faba39','Turbo amber','Ámbar turbo'],['#f66b19','Turbo orange','Naranjo turbo'],['#ca2a04','Turbo red','Rojo turbo'],['#7a0403','Turbo maroon','Burdeo turbo']];
let VEH={type:'pickup',col:'#22a884'};try{const v=JSON.parse(localStorage.getItem('cfc_vehicle')||'null');if(v&&v.type)VEH=v;}catch(e){}
if(!['pickup','van','monster','buggy'].includes(VEH.type))VEH.type='pickup';if(!VEH_COLORS.some(c=>c[0]===VEH.col))VEH.col='#22a884';
function makeTruck(type,col,wheelsOut){
  type=type||VEH.type;col=col||VEH.col;const W=wheelsOut||truck.wheels;W.length=0;if(type==='vitara')col='#f6f6f2';
  const toon=Wd.toon,g=new THREE.Group();const body=toon(col),glass=toon('#bfe9ff'),tire=toon('#222'),dk=toon('#2b2b2b'),chrome=toon('#d9d9d9');
  const accent=toon(col==='#ff4f3a'?'#1d1a2b':'#ff4f3a');
  const add=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);g.add(m);return m;};
  let wr=.021,wy=.022,wx=.048,wz=.037;
  if(type==='pickup'){
    add(new THREE.BoxGeometry(.075,.032,.07),body,-.042,.047,0);add(new THREE.BoxGeometry(.065,.012,.058),dk,-.042,.061,0);
    add(new THREE.BoxGeometry(.085,.042,.07),body,.036,.047,0);add(new THREE.BoxGeometry(.058,.04,.066),body,.016,.088,0);add(new THREE.BoxGeometry(.059,.018,.068),glass,.016,.093,0);
    add(new THREE.BoxGeometry(.16,.008,.072),accent,-.003,.052,0);add(new THREE.BoxGeometry(.03,.006,.05),toon('#ffd23f'),.018,.111,0);
    add(new THREE.BoxGeometry(.006,.02,.064),chrome,-.013,.076,0);add(new THREE.BoxGeometry(.006,.016,.074),chrome,.08,.036,0);
    add(new THREE.BoxGeometry(.026,.018,.03),toon('#ffffff'),-.06,.072,.013);add(new THREE.BoxGeometry(.026,.006,.031),toon('#3a86ff'),-.06,.083,.013);
    for(let k=0;k<2;k++)add(new THREE.CylinderGeometry(.009,.009,.026,8),toon('#8fd3ff'),-.03,.078,-.018+k*.012);}
  else if(type==='vitara'){  // Raquel's white 4-door Suzuki Vitara (compact SUV)
    const blk=toon('#1d1a20'),red=toon('#d62828'),lamp=toon('#fff6d0');
    add(new THREE.BoxGeometry(.156,.034,.07),body,0,.05,0);                                              // lower body
    add(new THREE.BoxGeometry(.05,.012,.068),body,.052,.072,0).rotation.z=-.08;                          // hood
    add(new THREE.BoxGeometry(.098,.036,.066),body,-.022,.087,0);                                        // cabin
    add(new THREE.BoxGeometry(.1,.004,.067),body,-.022,.106,0);                                          // roof
    const ws=add(new THREE.BoxGeometry(.004,.034,.062),glass,.029,.088,0);ws.rotation.z=.55;              // windscreen
    add(new THREE.BoxGeometry(.004,.026,.06),glass,-.0715,.089,0);                                       // tailgate window
    [-1,1].forEach(s=>{add(new THREE.BoxGeometry(.086,.022,.002),glass,-.02,.09,.0335*s);                // side windows
      [.022,-.012,-.046,-.068].forEach(x=>add(new THREE.BoxGeometry(.005,.024,.003),blk,x,.09,.0342*s));  // A/B/C/D pillars
      [.008,-.03].forEach(x=>add(new THREE.BoxGeometry(.0012,.034,.0012),blk,x,.06,.0352*s));            // door seams: 4 doors
      [.0,-.038].forEach(x=>add(new THREE.BoxGeometry(.008,.0025,.002),chrome,x,.07,.0356*s));            // door handles
      add(new THREE.BoxGeometry(.16,.012,.003),blk,0,.036,.0352*s);                                      // black lower cladding
      add(new THREE.BoxGeometry(.088,.0025,.003),chrome,-.022,.106,.03*s);                               // roof rails
      add(new THREE.BoxGeometry(.008,.008,.012),blk,.03,.08,.04*s);                                      // mirrors
      add(new THREE.BoxGeometry(.003,.008,.016),lamp,.0785,.06,.024*s);                                   // headlights
      add(new THREE.BoxGeometry(.003,.012,.01),red,-.0785,.066,.028*s);});                               // tail lights
    add(new THREE.BoxGeometry(.004,.014,.034),blk,.079,.054,0);add(new THREE.BoxGeometry(.0045,.002,.036),chrome,.0795,.057,0);  // grille + chrome bar
    add(new THREE.BoxGeometry(.0048,.006,.006),chrome,.0798,.051,0);                                     // "S" badge
    add(new THREE.BoxGeometry(.006,.012,.074),blk,.079,.036,0);add(new THREE.BoxGeometry(.006,.012,.074),blk,-.079,.036,0);  // bumpers
    add(new THREE.BoxGeometry(.003,.008,.022),toon('#ffffff'),-.081,.048,0);                             // plate
    wr=.022;wy=.022;wx=.05;wz=.037;}
  else if(type==='jeep'){
    add(new THREE.BoxGeometry(.13,.045,.072),body,0,.052,0);add(new THREE.BoxGeometry(.08,.042,.068),body,-.015,.095,0);add(new THREE.BoxGeometry(.081,.02,.07),glass,-.015,.1,0);
    add(new THREE.BoxGeometry(.07,.006,.06),dk,-.015,.119,0);for(let k=0;k<3;k++)add(new THREE.BoxGeometry(.004,.008,.06),chrome,-.04+k*.025,.124,0);
    const sp=add(new THREE.CylinderGeometry(.021,.021,.012,12).rotateZ(Math.PI/2),tire,-.07,.065,0);add(new THREE.BoxGeometry(.008,.02,.075),chrome,.068,.035,0);
    add(new THREE.BoxGeometry(.132,.006,.074),accent,0,.04,0);[-1,1].forEach(s=>add(new THREE.CylinderGeometry(.007,.007,.004,10).rotateZ(Math.PI/2),toon('#fff6a0'),.066,.06,.022*s));wr=.024;wy=.024;}
  else if(type==='van'){
    add(new THREE.BoxGeometry(.15,.075,.074),body,-.005,.068,0);add(new THREE.BoxGeometry(.03,.03,.07),glass,.058,.085,0);add(new THREE.BoxGeometry(.152,.012,.076),accent,-.005,.05,0);
    for(let k=0;k<3;k++)add(new THREE.BoxGeometry(.022,.018,.076),glass,-.045+k*.03,.09,0);add(new THREE.CylinderGeometry(.012,.012,.02,12),toon('#ffffff'),-.03,.115,0);
    add(new THREE.BoxGeometry(.04,.004,.03),toon('#1d1a2b'),.01,.107,0);wx=.05;}
  else if(type==='monster'){
    add(new THREE.BoxGeometry(.12,.04,.07),body,0,.098,0);add(new THREE.BoxGeometry(.06,.036,.064),body,-.005,.135,0);add(new THREE.BoxGeometry(.061,.016,.066),glass,-.005,.14,0);
    add(new THREE.BoxGeometry(.1,.012,.05),dk,0,.07,0);add(new THREE.BoxGeometry(.122,.008,.072),accent,0,.09,0);for(let k=0;k<4;k++)add(new THREE.CylinderGeometry(.003,.003,.04,5),chrome,(k<2?.035:-.035),.058,(k%2?.02:-.02));
    [-1,1].forEach(s=>{const f=add(new THREE.ConeGeometry(.006,.02,6),toon('#ff7b00'),-.04,.12,.036*s);f.rotation.x=Math.PI/2*s;});wr=.04;wy=.04;wx=.05;wz=.045;}
  else if(type==='buggy'){
    add(new THREE.BoxGeometry(.1,.018,.06),body,0,.04,0);add(new THREE.BoxGeometry(.03,.02,.05),body,.04,.055,0);
    [[.02,.03],[.02,-.03],[-.035,.03],[-.035,-.03]].forEach(p=>add(new THREE.CylinderGeometry(.002,.002,.06,5),toon('#1d1a2b'),p[0],.075,p[1]));add(new THREE.BoxGeometry(.06,.003,.064),toon('#1d1a2b'),-.008,.105,0);
    add(new THREE.BoxGeometry(.016,.022,.02),dk,-.02,.06,0);add(new THREE.CylinderGeometry(.006,.006,.02,8),chrome,-.05,.05,.012).rotation.z=Math.PI/2;add(new THREE.BoxGeometry(.004,.03,.004),toon('#ff7b00'),-.045,.11,-.025);
    wr=.024;wy=.024;wx=.045;wz=.04;}
  else if(type==='horse'){const Q=Wd.Q,I=new THREE.Group();I.scale.setScalar(.072);I.position.y=-.01;g.add(I);const coat='#8a5a33',dkc='#2a1c14',hoofC='#1d1a2b';  // criollo horse, lofted low-poly
    I.add(Q.loft([[-.95,1.25,.14,.14],[-.85,1.33,.3,.3],[-.5,1.33,.36,.32],[0,1.28,.37,.32],[.45,1.3,.38,.32],[.75,1.36,.3,.27],[.9,1.42,.16,.15]],10,coat));
    const nkg=new THREE.Group();nkg.position.set(.75,1.45,0);I.add(nkg);
    nkg.add(Q.loft([[0,0,.2,.14],[.15,.25,.16,.11],[.3,.45,.13,.095],[.38,.55,.12,.09]],8,coat));
    nkg.add(Q.loft([[-.1,.12,.035,.05],[.05,.35,.03,.05],[.2,.55,.03,.045],[.3,.64,.025,.035]],5,dkc));
    const hd=new THREE.Group();hd.position.set(1.18,2.02,0);I.add(hd);
    hd.add(Q.loft([[-.08,.04,.13,.1],[.08,.0,.12,.09],[.25,-.12,.09,.08],[.36,-.2,.08,.07],[.4,-.23,.04,.04]],8,coat));
    hd.add(Q.loft([[.28,-.15,.085,.075],[.38,-.22,.07,.06],[.41,-.24,.03,.03]],7,dkc));
    hd.add(Q.loft([[.02,.06,.01,.03],[.25,-.1,.01,.025]],4,'#f4ece0'));
    [-1,1].forEach(s=>{hd.add(Q.eye(.08,.05,.09*s,.018));hd.add(Q.cone(.035,.13,coat,-.08,.2,.05*s,.25*s,.2));});
    const tl=new THREE.Group();tl.position.set(-.92,1.3,0);I.add(tl);[0,1,2].forEach(k=>tl.add(Q.loft([[0,0,.06,.05,(k-1)*.03],[-.12,-.25,.07,.06,(k-1)*.04],[-.14,-.6,.055,.05,(k-1)*.05],[-.12,-.85,.01,.01,(k-1)*.05]],6,dkc)));
    const hl=[];[[.62,.17,1],[.62,-.17,1],[-.68,.17,0],[-.68,-.17,0]].forEach(([x,z,f],k)=>{const J=f?[[0,0,.12],[0,-.4,.075],[.02,-.47,.08],[.02,-.95,.05],[.05,-1.05,.065],[.08,-1.14,.06]]:[[0,0,.16],[-.1,-.45,.1],[-.07,-.6,.07],[.01,-.95,.05],[.05,-1.05,.065],[.08,-1.14,.06]];
      const L=Q.leg(x,1.2,z,J,k%2?coat:coat,hoofC);I.add(L);hl.push(L);});
    add(new THREE.BoxGeometry(.042,.012,.058),body,-.004,.107,0);add(new THREE.BoxGeometry(.03,.004,.062),accent,-.004,.1,0);add(new THREE.BoxGeometry(.008,.014,.05),body,.014,.113,0);
    [-1,1].forEach(s=>add(new THREE.BoxGeometry(.004,.02,.004),chrome,-.004,.085,.03*s));
    g.userData.kind='horse';g.userData.hl=hl;g.userData.tail=tl;g.userData.head=hd;}
  else if(type==='bike'){const tr=toon('#1d1a2b');const seg=(x1,y1,x2,y2,th,mat)=>{const L=Math.hypot(x2-x1,y2-y1);const m=add(new THREE.BoxGeometry(L,th,th),mat,(x1+x2)/2,(y1+y2)/2,0);m.rotation.z=Math.atan2(y2-y1,x2-x1);return m;};
    [.045,-.045].forEach(x=>{const w=add(new THREE.TorusGeometry(.026,.0045,6,20),tr,x,.03,0);W.push(w);[0,Math.PI/3,2*Math.PI/3].forEach(r=>{const sp=new THREE.Mesh(new THREE.BoxGeometry(.05,.0012,.0012),chrome);sp.rotation.z=r;w.add(sp);});});
    seg(-.012,.075,.034,.072,.005,body);seg(.034,.072,-.002,.032,.005,body);seg(-.012,.075,-.002,.032,.005,body);seg(-.002,.032,-.045,.03,.004,body);seg(-.012,.075,-.045,.03,.004,body);seg(.045,.03,.036,.085,.004,body);
    add(new THREE.BoxGeometry(.004,.004,.042),tr,.036,.086,0);add(new THREE.BoxGeometry(.022,.005,.014),tr,-.014,.079,0);add(new THREE.CylinderGeometry(.008,.008,.004,10).rotateX(Math.PI/2),chrome,-.002,.032,.006);
    add(new THREE.BoxGeometry(.02,.014,.024),toon('#c9a45a'),.056,.07,0);add(new THREE.CylinderGeometry(.004,.004,.014,8),toon('#8fd3ff'),.056,.08,.005);
    g.userData.kind='bike';}
  if(type!=='horse'&&type!=='bike')[[wx,wz],[wx,-wz],[-wx,wz],[-wx,-wz]].forEach(w=>{const wh=add(new THREE.CylinderGeometry(wr,wr,type==='monster'?.026:.016,14).rotateX(Math.PI/2),tire,w[0],wy,w[1]);W.push(wh);
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(wr*.45,wr*.45,type==='monster'?.028:.018,8).rotateX(Math.PI/2),chrome);wh.add(hub);});
  g.userData.vt=type;g.rotation.order='YZX';g.scale.setScalar(2.4);return g;
}
function setVehicle(type,col){VEH={type,col};try{localStorage.setItem('cfc_vehicle',JSON.stringify(VEH));}catch(e){}
  if(!truck.g)return;const old=truck.g,n=makeTruck(PK.veh(type),col);n.position.copy(old.position);n.rotation.copy(old.rotation);
  if(WX.beam)n.add(WX.beam);(WX.lamps||[]).forEach(l=>n.add(l));Wd.scene.remove(old);Wd.scene.add(n);truck.g=n;}
function vehPreview(type,col){try{const R=Wd.renderer,rt=new THREE.WebGLRenderTarget(200,120),sc=new THREE.Scene(),cm=new THREE.PerspectiveCamera(30,200/120,.01,10);
  sc.add(new THREE.HemisphereLight(0xffffff,0x6a5a8a,.75));const dl=new THREE.DirectionalLight(0xffffff,.7);dl.position.set(2,3,2);sc.add(dl);
  const m=makeTruck(type,col,[]);m.scale.setScalar(1);m.rotation.y=-.6;sc.add(m);cm.position.set(.2,.12,.23);cm.lookAt(0,.055,0);
  const px=new Uint8Array(200*120*4);R.setRenderTarget(rt);R.setClearColor(0xfff3c4,1);R.clear();R.render(sc,cm);R.readRenderTargetPixels(rt,0,0,200,120,px);R.setRenderTarget(null);R.setClearColor(0,0);rt.dispose();
  const cv=document.createElement('canvas');cv.width=200;cv.height=120;const cx=cv.getContext('2d');const id=cx.createImageData(200,120);for(let y=0;y<120;y++)id.data.set(px.subarray((119-y)*800,(120-y)*800),y*800);cx.putImageData(id,0,0);return cv.toDataURL();}catch(e){return '';}}
function vehPickerHTML(){const L=LANG==='es'?2:1;
  return `<h4>${LANG==='es'?'TU VEHÍCULO':'YOUR VEHICLE'}</h4>
   <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px">${VEH_TYPES.map(t=>`<div class="scard vp-t" data-t="${t[0]}" style="margin:0;padding:5px;cursor:pointer;text-align:center;${VEH.type===t[0]?'background:#ffd23f':''}">
     <img class="vp-img" data-t="${t[0]}" src="${vehPreview(t[0],VEH.col)}" alt="" style="width:100%;border:2px solid #1d1a2b;border-radius:6px;background:#fff3c4;display:block">
     <div style="font:15px Bangers,Impact;letter-spacing:.04em;margin-top:4px">${t[L]}</div></div>`).join('')}</div>
   <div class="g-row"><span style="font-weight:700">${LANG==='es'?'Color:':'Colour:'}</span>${VEH_COLORS.map(c=>`<button class="g-btn vp-c" data-c="${c[0]}" title="${c[L]}" style="width:34px;height:34px;padding:0;background:${c[0]};${VEH.col===c[0]?'outline:3px solid #1d1a2b;outline-offset:2px':''}"></button>`).join('')}</div>`;}
function bindVehPicker(root){const upd=(recolor)=>{if(recolor)root.querySelectorAll('.vp-img').forEach(im=>im.src=vehPreview(im.dataset.t,VEH.col));
    root.querySelectorAll('.vp-t').forEach(b=>b.style.background=b.dataset.t===VEH.type?'#ffd23f':'');root.querySelectorAll('.vp-c').forEach(b=>b.style.outline=b.dataset.c===VEH.col?'3px solid #1d1a2b':'none');};
  root.querySelectorAll('.vp-t').forEach(b=>b.onclick=e=>{e.stopPropagation();setVehicle(b.dataset.t,VEH.col);AU.sfx.click();upd(false);});
  root.querySelectorAll('.vp-c').forEach(b=>b.onclick=e=>{e.stopPropagation();setVehicle(VEH.type,b.dataset.c);AU.sfx.click();upd(true);});}
// ------------------------------------------------------------ CHARACTERS (cartoon avatars of the lab team photo)
const PORTRAITS=["data:image/jpeg;base64,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", "data:image/jpeg;base64,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", "data:image/jpeg;base64,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", "data:image/jpeg;base64,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", "data:image/jpeg;base64,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", "data:image/jpeg;base64,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", "data:image/jpeg;base64,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", "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgFBgcGBQgHBgcJCAgJDBMMDAsLDBgREg4THBgdHRsYGxofIywlHyEqIRobJjQnKi4vMTIxHiU2OjYwOiwwMTD/2wBDAQgJCQwKDBcMDBcwIBsgMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDD/wAARCACEAG4DASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD1AU4Ck/X3pRUAH1paBS0AFLRRQAYpQKKSgBSKaaXNIaAGmgUGk/GgYtFJR9KQBinYpBS9qoQopRSfjS0WAX60YqrqOpWWm25n1C6itoh3d8Z+nr+FeT+IPjBNLdyW2iwRrCDtWVsl2GeuOg+lFgPWbrULK0JFzdwQ4GTvkAxWTH418NPceQutWfmE4wXwPzPFfPniLWr7Urt5pnd5HOST/QVhzzyFMzQPwPlYEgCiwz67SRJEDxsGVhkEHINBNfNXgXx9qehSCFJy8IP+pkJKMP6H3Fe8eFPFFh4lsvOtG2SrxJCx+ZD/AFHvSCxtmkpSabmgQtHNGaAaTGO/WjNJmkz6CqEOzVDXtZs9B0m41HUH2QwLnA+857KPcmrbMFBJ7V4D8ZfFba3rg0m2kItLNsHH8b9z+HSmBh6hqusePvELNLIymRyFUE7IkzwB9K7/AEbwRpenwL5iefLjmRjnJrL+HWjR21iLnbzJ0J612rnauGbFclao2+WJ30KSteRRh0HTxNvMEeVGBxU99o1hNamLyIwpGMbRU6FR0apFaNiV3gmuVuR08sex41408LNpU32myB8rPKjt9Kq+E/Et3oWqw3trIQVIDrnhx3Br1zWtPS7gaORQwYV4nr9g2l6xLbsCATuXNdlCo5rllucNemoPmjsfU+i6rb6xpsF9aOGjmUMMHp7VeBzXjHwK8Qlbu40SZ/klBmhB/vD7w/LB/A17IDW5zEgpaYDS7vakwHUjED3pTUbnvViM/wARXbWujXU6feSMkV8tOWkvWdvmlnkzz1JJ/wDr19JeO72Oz8PXbzEbfLIAz94npXzfpLq/iSy837puUBHp8wo2Gj16EtpmnxWscoiESAGTvmsefVbhrnamrxzHP3CATXQ67on9oIOHYdcK23n3rFsvA0aTSPKgjRzuIyeO/HpXCpK2p6fLLoa9gbi5thJGpbjqK5rV75YrpluLicbScpEcdOua77SoY7W2aGL7oGB+VZ93otheuSwVJehOAazUrPU0lFtHM6VrenSuiW8zhzwCZCcn0Oaz/iVpq3Gnw6kqYeJhuI/unrXd6d4Ttbb5tsUgHQbBVD4h28S+Fr7gBUiJ+lNT99NGcoPkaZ5R4I1FtM8R6bdg42TjP0PBH5GvqKJw6KwOQRmvkK3kKSRkHlWzX1bolys+k2cqNuWSBHDDvlRXoM8w1AadUStnvUg6UgHH68VGxOM1IfyqGY4UntVCPM/izemWMWyPhI+SOxbGf8K8QklEWo+dH0SUOPwOa9Z+I0jvbXMuPvzbB7Z3Y/QV4/OcyMexJoRT0Po+21ONbVZQR8yg/nWZqOrNOxigJ3kcYrI8M3Cap4Z0+YNl/KEb4/vL8p/lVcSXVhdMy2r3XODsYAqPXmvPcdbHqqelzXPiBbRdjW0yhTtG4fe9waqT3V3cgajHA1sEJQoTneOzVBc3F1KyN9niwTxuk4p9zca08Jihht8kYwwOAPzpuDHzM0LLxExwN3IqHxdc/bPC+pM/CC3cn64qhpVg3mSfaNvnY4A4GapeP9US08NtYqw866+TA/ujlv6D8amKvJJGdST5W2eVpkHNfRHwg1Qaj4Lt0LZezdoD64ByP0NfPIXIbFenfAfVvs+t3ukyN8l3F50Y/wBtev8A46T+VehJaHmI9uU1KpqFaePeoAtNVW5Pyn6GrDmqc71oI8o+JEXkpPA3AMwlHupViP1JFeOTLhz717p8YYYG8O/aT8s0MgCMPQ9V+leGzsC2aOo+h1vgLXBaTRadF5hWVXaTdjAccgr/AMB4P0rv7CVZS7ggseoryTwgwHiO1DfxFlz9VNejtI9pJzwfUd65KySkd2HbcSxfwNJNmHcB7GrumKYUPmcE9STk1iT6jN/Dgj2qp/aE2Ducism20dPMa2rX6Q3BMJyR1xXmnia+mvdblMrZWP8AdqPQdf512MatcEyNkIvOT3rgLyTzr6eX+8zGtqCVzirt2GQruDD1HFa/hPU20nXrDUQcG1mUv7p0YfkTWYqbFT8j/SrEcO4rMmMMcMPQ11M5kj6qiZXUMjblYAqR3B6GphXJ/DPUzqPhGz3vvktx5DH/AHemfwxXVisxD5HrPvZljQszbRWPfa3dzZ8sLAvvyf0/xrHuLi4djvkUn1K9P1rUkz/GNu3iFVguGNvYQsZDghpJSB6dFH1yfauXm8AW09pHdoZImcbgoOcDtn14611FwkjKwZi2R+FbNiVm0iAqORGFI9xx/SufEScUrHVh4qTdzzbSfDa22qxStEF2Zzj8q6i4hVk8uRd3oatXUZjmOB1yKbkuo3DtXC5N7nfGKjojDn0tWyY2I9qhj01Vf5/mx+VbrRgnoaQWoUZIo5h8pkzW7eQw4VMfnXmt1biF5ywwfMxj0Gc163JbNMWyp8tBXl/iFgmpzQhcI2MfWujDvVnLiY6EcLxNAVb+L5WFLbuFyGP3vlf69j+NUYGIbB71I/BUjowxXYcZ6V8JfEsWlXtzY3hIhuWVlYdFYA/zr2S3u4JkDRzIwP8AtV84+GrWa9vU8iUROAG3kZAI4wa9CsJ5YV2X0zwuBgFcAN+IAzSsJmwMyDO7gcHNIqAnkknsMdTUdo2N+c47g4q4oXktgduuMGrIKxhDZ5Pp9Kn0g+UXtm7ksv8AWpVUAYGenPtTDGQVkQHcDngcCs6sOeNjWlPklcZfQZ6iqPksCQegHfv7VvoFuIg45zSLZhjxxXk3s7M9hWkrmRbWRlAOODV5NLDY3cD0rTgslj5HGfQ4qWSJ1QtuBwOy5P8AOpci7JGPfWqRWrqowAuTivDvGVuV1KWT0xXu2pktaT4YyKAfn8soD9AeSMd68b8ZIga4AHICn9BXXhdzjxNnE5ZeHVj3qxcxsYc4+5g/nUbp+6iIHbmrq/vIxjkN8p/EcfqBXeecdZ8NgDLcMR8yxqfwJ5/XFd3dKmVLBSCM/MMivNvAdy1tqkKMeJ1MR57nkfqK9JuCxtoWwMqSvNAmMsRt83nuBWgoCoSvGD2ooqiSwQAiH25FSKBtVhxuHQdqKKAI4WKXC7eA55HbritdFHHFFFeXi1756uEfuE4AwKZJ92iiuQ6jN1X/AFQH9/g14brrGRr1nOSIl/Q4/lRRXpYP4WefjHqkYcZJtEJ7ZI/Op4CWtpc9sEY9etFFdjOJFqykeK6jdDgq2R7Ec17FaqLm3YSjIDBv0NFFJgf/2Q==", "data:image/jpeg;base64,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", "data:image/jpeg;base64,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", "data:image/jpeg;base64,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", "data:image/jpeg;base64,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", "data:image/jpeg;base64,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", "data:image/jpeg;base64,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", "data:image/jpeg;base64,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", "data:image/jpeg;base64,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", "data:image/jpeg;base64,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", "data:image/jpeg;base64,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", "data:image/jpeg;base64,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", "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgFBgcGBQgHBgcJCAgJDBMMDAsLDBgREg4THBgdHRsYGxofIywlHyEqIRobJjQnKi4vMTIxHiU2OjYwOiwwMTD/2wBDAQgJCQwKDBcMDBcwIBsgMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDD/wAARCACEAG4DASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3z5huIwfQUnmbAS5UAdST2prS7W5PGOMCmyuhiwQp8zjae4PWkBKsiszKCcrj9ax/FR2wQknHzn+VaJjjE0WFw0akLg9B/hWD4quJWsoGMLRuZWGGxwMcGkpCexFpbf6WkjA8HgeldSwJjKlsE5GRxXn9netDKrSuuVAOTxz61H4h+JNlbTNBaMLhgCGIPy59j3pyYRR3F7cxIi7mjYZ7nkHB/wAKz9T1+2sJ4PNuo4o9jM+5Sx9sEV5DqfjeWcMoXaW5yv3sVz1941uZlSCa58xU+6pIJFZtvoaJH0DY+Io7uyJhHm3XASPoHLfd57D19K0XRpLRHvSI5ghDeW52gkc49a+c9I8aXdpKkkUpBBzh14rtNN8az63bx2Et8tpuDK0pGSwIPAPqeKOZrcHE9gykaB2fAAxkmsnWtcWzkkhjDM8aKWIHTcwA/rWFDL/ZthaS/bBMzLHDtJJKfTnHQ965vxLrZg8QXyXexziOPKdJDkYIPbp+lTKpoTY9Ts7yK7TMLbhjJ9q5nx3baojRXul6oLE8QsFjyzfePJJ6fhXH2Pjk6PaQQHls5kIHv1z9OKk8TeN7HxBp8MSRzbEkDkopOGwRj9aTqJx1BHQ+F/EiNI9rfOGhkBI3dj1P51LceK7GHX47d7iNLZVyzPyScHAH415BqeuG2vQtuHyhwear3FybqZ5lduWAw3XnpVVJroKCfU960TWrfUEadJlK9GVepPUn/PpXO/ELxPDZ28ayBTglkUfeJ6flXnmiarJY2rXQcoqhhuViC3+yfrXFeJ/Elxql48jyHzGPJzSi5MuyNnXfEU9+5+0TlEzxFE2Bj39axvOEoIiJAPBJOa58SSMQFwSf1ro9E02WeEttOOwx1q2NK+xTvZJ/K2R5jVh8zk4OKoqkcWcSFm+g2j8+tbOr2F5sJWNyAeOOp/wrCmsdQiJM1tJtHqpoTQ3Fosp5yDcqhx3ZPlYfhV2C6YRhi546MOCPqKxbYpvO3fAw6lTx+IrSgmLExygCQjgjo/8A9ehiR2Og+LjHaNaXPznGFcnv2/CtC+u11O9N0UVpiFZv7vHtXmbFllIBwRW1o+uy2rrHKMr0D+g/rWE4NrQZ1d+0U9iLWRFXkvuUc8jHWs+zVLONvLaXJbkc8U67vo5SixIhJXiT+9mokvooo18ncrkANmuazJehmXiP5+5id+AQ7KTj3q3pV0QqxtuZ85bjj2/Ctw3KLAyRBJlPC5BJIx+nWo7vUrj7K6tBFGrZJ2pj/PQflW7lHYmLVzC8R3+yEwoQAPvAdzXEy3GZTsABJ5J5rU1+6LIxU9ah8HaSNV1WMSN+7U5Ye1dCtFXNHduyNrwZ4fn1a4Dsh8sclmHFetaVoEFrAka4AHSl0qGKCFI4I1RVGAAMVswLyO+K4p1XJnp0qCitSOLTLaMDMSNj1FSS2FrLEytboQw6bauIAR05qYxgjpWN2dHIux4x4w8NpZ3cs1pEEDAgYHAPauMZdqZbO1Tz6qa+gdc0lb2JlChieteQeK9Cn0u5aRo8xnIJx27g+tddKpfRnn16DXvI5mVmM+4YLD7w/ve9TwuHBAGT6EYrMmMiSbkblen0q3DdpOAJQEk9T0NdNjjNmwuBKhtnfaUyUz79c1bkCxhRLycdelYMblJQR8pHeutt9IGo2kRFxtJAdtxACnnjNctS8XcTR0QiVRlYx9Sa57xXdGJBECcnk1s+dIiliFz61xPim6L7ixJYnJrnoK8iKdmc1fSmcvnoDxXZfCuw8xpbgdvlrhGkJ5969F+Fd7HZ6VPIyl380hUB5JxXfV+A6aCvUR6dZRiJQXq/9qjGAcVx13qOuXa5toEt4u5HLfrVS3vL21ZhdSsytzyOh+tcDiexGSvqd5PepCgcnAx1rGbxU8snlWsDOTwGY4FWrSD7fpwLkkEdq5fWre8jcw2EThd2DIBilHcuTstDrbX7VdKGubzyyf4IztqPVNM+2xtb3G2VGGPnGT+dcJbeFtSubgm61OVELfwkg4z+Vd1oGi3tjEI11B7qEdrgbiPoRg1UrLZmMW5bo8e8ZeGZtEvCdpaBj8j46fWucdATx8rDqp6GvpXXdEg1bT3gukDgjrtxj6V4F4n0ltD1F7O5BMecxuOoFdNGrzaM4MRQ5fejsYy3XlyBHztHfuPaur8P6ojRGK4PmQqMqFPQ1ycsPODtkXqD0OKSLdbOTCTgjpuFbSimjkTPofWPC9hBYTSJJJuC4HP4V4549tY7a+MURJAPf/P1r6D8TRKNPAA5eRRj8c/0r59+IRP9r+W33ggz256/1rloK0jaUUlojin6kCu1+Gj/ALq4BOPLfdnPHIriphhiPQ113wtMc1/c2kvIdA2M9cda6qnwMmg/3iN26vNb1i42QSyW1vuwgXjcvrWza6J5EEYurlpJCclSSxYY6cnj610Nvo0M4UbiiqMALVqTT7axjZwMkD7zcmuNz0sepGjrdl/wonl6esWeB681Pe6PFdHDMwH+ycVS8PTZiEnABOR9K3HZHUDdjPvWTR1paGVb6FCjAhmbHqxrYt4ViUADpXKzapPp9/LG7GSFWwH/AMa17bVklUMpySPWpHy9jaLDGM15T8YtJ862jvI1y0bYb6GvRDd72BBrO8SWS6hpU0ZUN8pIpxlyyTMalO8Gj50nSa0wsq/IegqLaJeYnCHuDW/48hSzNlbjHm+WzuPRc4X+Rrloi3ORz616cXzRueHUjyysfXWu4kyo5ECMx/3mGB+mfzr5++JahPEswzlQNoP0r6AuR5NvMhGXUEHJ+8x7/iK+fviSMau4bltzc+1ctL4jWWxw1x94+9avgq/GneJbSZzhHbyn+jcfzxWZOvzVDypBU4I6Gu1q6sc8XyyTPo61ugq8Gq+sXubZlJPzcVyXh/XGvtMt585Zl2v7MODWndySTJG2CVLYrzJRadmfQRqKUboG1u+sZlCwh4sAEg9K1bG8uNWZFd5YFx/CcE+1Yn2+2wyBTM8eNyqM7T74rT0e5vLiVI4rdo93AYgJj6nrQ0ClbdnQvYKLbYVwAO9c6Q9lfBInO3P3eorVjjd32NP9rYqwKxdI3B6MTz7UkHhyK0ikdVzNMS7ck49hUNW3K5m9jStwfLDHg9we1W0YupQ9KrRvhEyOSKmV8DdWZV9NTwrx1ZxxeLZ0d9wkX5u+0gkVzclu8JwF3DsR3r0b4laO84j1K3G545GRx7N8w/ma4V4JVOcOpP8AdJGfwr1ack4o8KtBqTPpnWbyPzJn4IMWGwMZ5OB+Wa8B8aTG91qaQkHGQSD1OecfjXdeIPEDz74o3EYJO6RTkkAYwD9DXn+rBRGHHG5jn/CsKSsxz2Odmj5z6VWZcA1flA8wg9B/hVWcfKcCuxHMzY8FawLG9+zTNiGc8E9Fb/69esaa8NxH5MuBu6H39a8HwQRjr2xXc+GPE5in+xX7bJFbCO3f2PvXPXp395HZhq3L7sjtb3SI903kgwtMuyUxHaXGc9au2kSqqiWKaZl6F5DgfgKdY3kdwBvwc+vUVq20UKvnGQa5Ls9SFr3RPpxZwuVAA6KowBWwkeRubpVaB4kxt2gUs94iIQGHFZSdzV9xksY3kjHFU7mT/lnGcselVLjVWLbIjuLdQKntYzw8hyxoSMJSOV1mOUzsS5AKfdLfK+PUD9Poapv4eSR8gBY2G5QvXmtvxWjs8csSqqw4JXfjd/nNWNJeOe2WNX3yRqNw747GuhpxRyKSlJnmsurRC0SPyC7jLBnbpkelUdavIpQiR5OFUHI5Jxyaz42Z48lsDue5qCZju3D8DXWo2OJu4kmDMR7ioJRhPfFSwAySE56VHeMFBQdRWqMilyZVAODng+lS3wYXb7jknkfTtTIx+9Q+4p15k3O5jncMg0yTd8P+KruyZIJmMsY4VieV/wARXf6f4rG3EoYEV5AgwRkV1Wg3P2qDax/exfK3+0OxrCrTT1OyhWlHS56MPFEZX5SaUarLefLHkA9xXMWyKMEjit3TXjUjHFcjgkd3tZS3Og0y1AIdhWvPAJrZolOCR1rGtbnbjHStW3mEmMH8ayZVrnFeJDefJbTQGMb9zuOnoMfXt71LpP2mW9khttu2JMFucZz0z7Y/Su2uvLlt2ilVXRxhgRnIqjY6bbWEBS1TaGbcSTkn6mtee6sY+ys7o8Dt1DEA5xnpS3oAOB0FFFd3U87oVdxjQhDjIqueetFFWiGRMOKkuyS0eey8fmaKKpCFI5Bq5pcrw6hA0ZxuO0+4oooezNInoWnqJF+brircaBX4JoorzpbnowNqxG5VBrWtmPAHGKKKxZui0SSMk0qscUUUIZ//2Q==", "data:image/jpeg;base64,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", "data:image/jpeg;base64,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", "data:image/jpeg;base64,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", "data:image/jpeg;base64,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","data:image/jpeg;base64,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"];
const CHARS=[
 {skin:'#c99472',hair:'#141010',style:'short',beard:'full',glasses:1,top:'#8aa0c0',pants:'#2a2e38',shoes:'#3a2a20',h:1.02},
 {f:1,skin:'#e6b08c',hair:'#d8b070',style:'long',shades:1,hoops:1,top:'#f15bb5',jacket:'#1a1a1e',pants:'#2a2a30',shoes:'#3a2a20',h:.97},
 {skin:'#e0ae8a',hair:'#1a1414',style:'short',top:'#e8a0a8',jacket:'#f7f7f4',coat:1,pants:'#2a2e38',shoes:'#222',h:1.03},
 {f:1,skin:'#d9a585',hair:'#5a3a24',style:'long',glasses:1,top:'#3a3d44',pants:'#2e3a52',shoes:'#222',h:.95},
 {f:1,skin:'#e8bc9c',hair:'#1e1410',style:'long',glasses:1,top:'#2a2a3a',pattern:'#f4f0e6',pants:'#1c1c20',shoes:'#222',h:.96},
 {f:1,skin:'#e6b494',hair:'#141a2e',style:'long',top:'#161616',pants:'#161616',wide:1,shoes:'#161616',h:.98},
 {f:1,skin:'#d9a585',hair:'#3a2418',style:'long',top:'#161616',pants:'#2e3a52',shoes:'#f0ece4',h:.96},
 {f:1,skin:'#9a6a48',hair:'#e0c070',style:'long',top:'#8a8a90',pants:'#2a2a30',shoes:'#222',h:.96},
 {f:1,skin:'#e6b89a',hair:'#2a1c16',style:'shortCurly',big:1,hoops:1,top:'#b8aec8',pants:'#2a2a30',shoes:'#222',h:.96},
 {f:1,skin:'#c9926c',hair:'#141010',style:'long',top:'#161616',jacket:'#e0a020',pants:'#1c1c20',shoes:'#161616',h:.95},
 {skin:'#d9a47e',hair:'#2a1c16',style:'short',beard:'full',top:'#f4f4f2',jacket:'#2e9e4e',pants:'#2a2e38',shoes:'#3a2a20',h:1.03},
 {skin:'#e0b08c',hair:'#5a3a26',style:'medium',top:'#1d1d22',pants:'#3a4660',shoes:'#9a948a',h:1.02},
 {skin:'#c99472',hair:'#141010',style:'short',beard:'stubble',phones:1,top:'#c0606a',pants:'#2a2e38',shoes:'#333',h:1.02},
 {skin:'#c68d66',hair:'#141010',style:'short',top:'#3a3d44',pants:'#2a2a2e',shoes:'#333',h:1.0},
 {skin:'#e8bc9c',hair:'#6b4a33',style:'short',beard:'full',top:'#2a2a2e',jacket:'#4a4a50',pants:'#2a2e38',shoes:'#3a2a20',h:1.04},
 {skin:'#c99472',hair:'#3a2418',style:'short',top:'#d9c6a0',jacket:'#1d1d22',pants:'#1d1d22',shoes:'#161616',h:1.0},
 {skin:'#e0ae8a',hair:'#1a1414',style:'shortCurly',beard:'stubble',top:'#1d2a4a',pattern:'#b8c4dc',pants:'#e8908a',shoes:'#f0ece4',h:1.03},
 {skin:'#e8b894',hair:'#1a1414',style:'short',beard:'full',top:'#7d8c86',pants:'#2a2a30',shoes:'#222',h:1.02},
 {f:1,skin:'#e0ae8a',hair:'#3a2418',style:'long',top:'#6b6b58',pants:'#2e3a52',shoes:'#222',h:.96},
 {f:1,skin:'#e8b89a',hair:'#1e1410',style:'long',hoops:1,top:'#6b2a6b',pants:'#2a2a30',shoes:'#3a2a20',h:.97},
 {skin:'#c99472',hair:'#141010',style:'short',beard:'full',top:'#3f8a90',jacket:'#f4f4f2',coat:1,pants:'#2a2e38',shoes:'#222',h:1.02},
 {skin:'#d9a47e',hair:'#141010',style:'short',top:'#f4f4f2',jacket:'#2e9e4e',pants:'#2a2e38',shoes:'#333',h:1.0},
 {skin:'#e8bc9c',hair:'#3a2418',style:'short',top:'#9ec0e8',pants:'#3a3a40',shoes:'#222',h:1.04},
 {f:1,skin:'#e3ae8c',hair:'#1e1410',style:'longCurly',hoops:1,top:'#d9c6a0',jacket:'#f7f7f4',coat:1,pants:'#2a2a30',shoes:'#222',h:.96},
 {f:1,skin:'#c99472',hair:'#2a1c16',style:'longCurly',hoops:1,top:'#e64980',jacket:'#2a2a3a',pants:'#2e3a52',shoes:'#222',h:.95}
];
const PICK_ORDER=[];
const CHAR_NAMES=["Abraham", "Alejandra", "Alejandro", "Ana", "Camila", "Cata", "Catalina", "Celia", "Dilanaz", "Estefania", "Fernando", "Gabriel", "Gustavo", "Tito", "Issotta", "Juan", "Mati", "Pedro", "Prisci", "Raquel", "Ricardo", "Seba", "Simon", "Sofi", "Yasna"];
let charNames=CHAR_NAMES.slice(),charIdx=0;
for(let i=0;i<CHAR_NAMES.length;i++)PICK_ORDER.push(i);for(let i=PICK_ORDER.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[PICK_ORDER[i],PICK_ORDER[j]]=[PICK_ORDER[j],PICK_ORDER[i]];}
try{const d=JSON.parse(localStorage.getItem('cfc_chars_v2')||'null');if(d){if(Array.isArray(d.names)&&d.names.length<=CHARS.length)charNames=d.names.concat(CHAR_NAMES.slice(d.names.length));if(d.idx>=0&&d.idx<CHARS.length)charIdx=d.idx;}}catch(e){}
if(/^h[eé]ctor$/i.test(charNames[13]||''))charNames[13]='Tito';
if(/^priscil+a$/i.test(charNames[18]||''))charNames[18]='Prisci';
function saveChars(){try{localStorage.setItem('cfc_chars_v2',JSON.stringify({names:charNames,idx:charIdx}));}catch(e){}}
const esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function makePerson(cfg){
  cfg=cfg||CHARS[charIdx];
  const toon=Wd.toon,g=new THREE.Group(),rnd=(()=>{let s=7;return ()=>{s=(s*16807)%2147483647;return s/2147483647;};})();
  const skin=toon(cfg.skin),hairM=toon(cfg.hair),topM=toon(cfg.top),jk=toon(cfg.jacket||cfg.top),pants=toon(cfg.pants),boot=toon(cfg.shoes),pack=toon('#3a86ff'),glove=toon('#2ec4b6');
  const lw=cfg.wide?.011:.009;
  // shaped body (lofted): hips, waist, chest, shoulders; legs with knees and shaped shoes; arms taper to the wrist
  const Q=Wd.Q,LF=(S,seg,m)=>{const o=Q.loft(S,seg||10,'#ffffff',true);o.material=m;return o;};const wl=cfg.wide?1.3:1,pf=cfg.puffer?1.15:1,fm=cfg.f?1:0;
  const legL=LF([[0,.004,.0088*wl,.0088*wl],[.001,-.03,.0068*wl,.007*wl],[.0015,-.036,.007*wl,.0072*wl],[0,-.06,.0052*wl,.0055*wl],[0,-.064,.005*wl,.0052*wl]],8,pants);legL.position.set(0,.075,.012);
  const shoe=()=>LF([[-.007,-.0655,.0055,.0068],[.004,-.0665,.0062,.0074],[.013,-.0675,.0042,.0062],[.016,-.068,.002,.004]],8,boot);legL.add(shoe());
  const legR=LF([[0,.004,.0088*wl,.0088*wl],[.001,-.03,.0068*wl,.007*wl],[.0015,-.036,.007*wl,.0072*wl],[0,-.06,.0052*wl,.0055*wl],[0,-.064,.005*wl,.0052*wl]],8,pants);legR.position.set(0,.075,-.012);legR.add(shoe());
  const torso=LF([[0,.074,.013,.0175],[0,.086,.0165*pf,.021*pf],[0,.104,(.0145-fm*.0015)*pf,(.0178-fm*.0022)*pf],[.001,.124,(.0168+fm*.002)*pf,.0205*pf],[0,.142,.0152*pf,.0232*pf],[0,.149,.011,.0165],[0,.152,.007,.008]],12,jk);
  g.add(legL,legR,torso);
  if(cfg.jacket){const inner=new THREE.Mesh(new THREE.BoxGeometry(.006,.066,.012),topM);inner.position.set(.0152,.115,0);inner.scale.set(.6,1,1);g.add(inner);}
  if(cfg.puffer)for(let k=0;k<3;k++){const r=new THREE.Mesh(new THREE.CylinderGeometry(.0225,.0225,.004,10),toon('#2a2a2a'));r.position.y=.09+k*.02;g.add(r);}
  if(cfg.coat){const sk=new THREE.Mesh(new THREE.CylinderGeometry(.021,.025,.04,10,1,true).translate(0,.058,0),jk);sk.material=jk.clone();sk.material.side=THREE.DoubleSide;g.add(sk);}
  if(cfg.pattern)for(let k=0;k<14;k++){const d=new THREE.Mesh(new THREE.SphereGeometry(.0035,5,4),toon(k%2?cfg.pattern:'#c9a45a'));const a=rnd()*6.28;d.position.set(Math.cos(a)*.019,.09+rnd()*.05,Math.sin(a)*.019);g.add(d);}
  const bp=new THREE.Mesh(new THREE.BoxGeometry(.02,.052,.03),pack);bp.position.set(-.026,.12,0);g.add(bp);
  const arm=()=>{const a=LF([[0,.004,.0066,.0066],[0,-.028,.0056,.0058],[.0008,-.033,.0054,.0055],[0,-.058,.0045,.0046],[0,-.061,.0042,.0043]],8,jk);
    const gl=new THREE.Mesh(new THREE.SphereGeometry(.0062,8,6),glove);gl.scale.set(1.05,1.25,.7);gl.position.y=-.066;a.add(gl);const th=new THREE.Mesh(new THREE.SphereGeometry(.0026,6,4),glove);th.position.set(.004,-.062,0);a.add(th);return a;};
  const armL=arm();armL.position.set(0,.145,.026);const armR=arm();armR.position.z=-.026;armR.position.set(0,.145,-.026);g.add(armL,armR);
  const neck=new THREE.Mesh(new THREE.CylinderGeometry(.007,.008,.012,6),cfg.top==='#f4f2ee'?topM:skin);neck.position.y=.153;g.add(neck);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.018,12,10),skin);head.position.y=.172;head.scale.set(.95,1.1,.9);g.add(head);
  const eye1=new THREE.Mesh(new THREE.SphereGeometry(.0028,5,4),toon('#1d1a2b'));eye1.position.set(.0165,.176,.0065);const eye2=eye1.clone();eye2.position.z=-.0065;g.add(eye1,eye2);
  {const nose=new THREE.Mesh(new THREE.ConeGeometry(.0028,.007,5),skin);nose.rotation.z=-Math.PI/2;nose.position.set(.0185,.171,0);g.add(nose);   // face: nose, brows, mouth, ears
   [-1,1].forEach(s2=>{const br=new THREE.Mesh(new THREE.BoxGeometry(.002,.0016,.0065),hairM);br.position.set(.0172,.1815,.0066*s2);br.rotation.x=-.15*s2;g.add(br);
     const ear=new THREE.Mesh(new THREE.SphereGeometry(.0042,6,5),skin);ear.scale.set(.6,1,.35);ear.position.set(-.001,.172,.0165*s2);g.add(ear);});
   const mo=new THREE.Mesh(new THREE.BoxGeometry(.0015,.0014,.007),toon('#8a3a3a'));mo.position.set(.0172,.1635,0);g.add(mo);}
  const smile=new THREE.Mesh(new THREE.BoxGeometry(.002,.002,.008),toon('#7a2a2a'));smile.position.set(.0172,.164,0);g.add(smile);
  // hair
  const cap=new THREE.Mesh(new THREE.SphereGeometry(.0195,12,8,0,Math.PI*2,0,Math.PI*.36),hairM);cap.position.set(-.002,.177,0);cap.scale.set(1,1.1,1);g.add(cap);
  const bk=new THREE.Mesh(new THREE.SphereGeometry(.0188,12,10),hairM);bk.position.set(-.0065,.174,0);bk.scale.set(.75,1.05,1.02);g.add(bk);
  const curls=(n,r0,yTop,drop,sz)=>{for(let i=0;i<n;i++){const a=rnd()*6.283;const yy=yTop-rnd()*drop;const front=Math.cos(a)>.45;if(front&&yy<yTop-.012)continue;
      const r=r0+rnd()*.006+(yTop-yy)*.12;const c=new THREE.Mesh(new THREE.IcosahedronGeometry(sz+rnd()*.003,0),hairM);c.position.set(Math.cos(a)*r*.9-.004,yy,Math.sin(a)*r);g.add(c);}};
  // hair styles: soft lofted volumes + strands / ringlets instead of boxes and gravel
  const HQ=Wd.Q,HL=(S,seg)=>{const o=HQ.loft(S,seg||10,'#ffffff',true);o.material=hairM;g.add(o);return o;};
  if(cfg.style==='long'){HL([[-.012,.19,.009,.019],[-.016,.172,.011,.021],[-.018,.15,.009,.02],[-.017,.133,.006,.017],[-.016,.126,.002,.012]],12);
    [-1,1].forEach(sd=>{HL([[-.002,.183,.004,.006,.017*sd],[.001,.168,.004,.0065,.019*sd],[.002,.15,.0035,.006,.0195*sd],[.001,.138,.002,.004,.019*sd]],8);
      for(let k=0;k<4;k++){const z=(.008+k*.003)*sd;const st=HQ.strand([[-.01,.185,z],[-.016-k*.001,.16,z*1.15],[-.017,.135-k*.002,z*1.1]],.0016,hairM);g.add(st);}});
    for(let k=0;k<7;k++){const z=(k-3)*.0055;g.add(HQ.strand([[-.014,.182,z],[-.02,.155,z*1.05],[-.019,.13-(k%3)*.003,z]],.0018,hairM));}
    if(cfg.streak){const sm=toon(cfg.streak);g.add(HQ.strand([[.0,.186,.017],[.003,.165,.02],[.004,.142,.0195]],.0022,sm));g.add(HQ.strand([[-.003,.186,.0185],[.0,.163,.021],[.001,.14,.02]],.002,sm));}}
  else if(cfg.style==='longCurly'){const vol=new THREE.Mesh(new THREE.SphereGeometry(.0215,14,12),hairM);vol.position.set(-.005,.176,0);vol.scale.set(.9,1.08,1.08);g.add(vol);
    for(let i=0;i<26;i++){const a=Math.PI*.4+(i/26)*Math.PI*1.2+(rnd()-.5)*.12,side=Math.cos(a);const G=new THREE.Group();G.position.set(Math.cos(a)*.0205*.9-.005,.184-rnd()*.01,Math.sin(a)*.021);
      G.add(HQ.ringlet(.04+rnd()*.03+(side<-.3?.015:0),.0032+rnd()*.001,4+rnd()*2,.0022,hairM,rnd()));G.rotation.set(Math.sin(a)*.25,0,-.15-side*.25);g.add(G);}
    for(let i=0;i<14;i++){const a=rnd()*6.283;const t=new THREE.Mesh(new THREE.TorusGeometry(.0036,.0018,5,9),hairM);t.position.set(Math.cos(a)*.0195-.004,.19+rnd()*.008,Math.sin(a)*.0195);t.rotation.set(rnd()*3,rnd()*3,rnd()*3);g.add(t);}}
  else if(cfg.style==='shortCurly'){const n=cfg.big?44:28,top=.197,drop=cfg.big?.03:.016;for(let i=0;i<n;i++){const a=rnd()*6.283;const yy=top-rnd()*drop;const front=Math.cos(a)>.45;if(front&&yy<top-.012)continue;
      const r=.017+rnd()*.005+(top-yy)*.12;const t=new THREE.Mesh(new THREE.TorusGeometry((cfg.big?.0046:.004)+rnd()*.0012,.0019,5,9),hairM);t.position.set(Math.cos(a)*r*.9-.004,yy,Math.sin(a)*r);t.rotation.set(rnd()*3,rnd()*3,rnd()*3);g.add(t);}}
  else if(cfg.style==='medium'){HL([[-.01,.19,.008,.019],[-.014,.176,.0105,.021],[-.015,.163,.008,.0195],[-.013,.156,.003,.015]],12);
    [-1,1].forEach(sd=>HL([[-.002,.184,.0035,.005,.0175*sd],[.0,.172,.0035,.0055,.019*sd],[.0,.163,.002,.004,.0185*sd]],8));}
  else{/* short: a neat side part */const pt=new THREE.Mesh(new THREE.BoxGeometry(.012,.0012,.0015),toon('#1d1a2b'));pt.position.set(.006,.196,.006);pt.rotation.x=.1;g.add(pt);}
  if(cfg.beard){const bm=toon(cfg.hair);if(cfg.beard==='full'){const b=new THREE.Mesh(new THREE.SphereGeometry(.0135,10,8,0,Math.PI*2,Math.PI*.45,Math.PI*.55),bm);b.position.set(.004,.168,0);b.scale.set(1.05,1.05,1.15);g.add(b);}
    const mu=new THREE.Mesh(new THREE.BoxGeometry(.003,.003,.012),bm);mu.position.set(.0178,.167,0);g.add(mu);
    if(cfg.beard==='stubble'){const b=new THREE.Mesh(new THREE.BoxGeometry(.004,.006,.014),bm);b.position.set(.0165,.159,0);g.add(b);}}
  if(cfg.glasses){const gm=toon('#1d1a2b');[-1,1].forEach(sd=>{const f=new THREE.Mesh(new THREE.TorusGeometry(.0042,.0011,4,10),gm);f.rotation.y=Math.PI/2;f.position.set(.018,.176,.0068*sd);g.add(f);});}
  if(cfg.cap){const cp=new THREE.Mesh(new THREE.SphereGeometry(.0205,12,8,0,Math.PI*2,0,Math.PI*.42),toon(cfg.cap));cp.position.set(-.002,.179,0);g.add(cp);const vz=new THREE.Mesh(new THREE.BoxGeometry(.016,.003,.026),toon(cfg.cap));vz.position.set(-.022,.186,0);vz.rotation.z=-.3;g.add(vz);}
  if(cfg.shades){const lm=toon('#2a1a14'),fm=toon('#c8a48a');[-1,1].forEach(sd=>{const l=new THREE.Mesh(new THREE.BoxGeometry(.003,.008,.011),lm);l.position.set(.018,.176,.0068*sd);g.add(l);});const br=new THREE.Mesh(new THREE.BoxGeometry(.003,.0025,.026),fm);br.position.set(.0182,.18,0);g.add(br);}
  if(cfg.phones){const hp=new THREE.Mesh(new THREE.TorusGeometry(.021,.003,5,14,Math.PI),toon('#e9e4d4'));hp.rotation.y=Math.PI/2;hp.position.set(-.002,.177,0);g.add(hp);[-1,1].forEach(sd=>{const e=new THREE.Mesh(new THREE.CylinderGeometry(.008,.008,.008,12).rotateX(Math.PI/2),toon('#e9e4d4'));e.position.set(-.002,.172,.02*sd);g.add(e);});}
  if(cfg.scarf){const sc=new THREE.Mesh(new THREE.TorusGeometry(.012,.006,6,14),toon(cfg.scarf));sc.rotation.x=Math.PI/2;sc.position.y=.152;g.add(sc);for(let k=0;k<6;k++){const d=new THREE.Mesh(new THREE.SphereGeometry(.0025,4,3),toon('#f4f0e6'));const a=k/6*6.283;d.position.set(Math.cos(a)*.015,.153,Math.sin(a)*.015);g.add(d);}}
  if(cfg.choker){const ch=new THREE.Mesh(new THREE.CylinderGeometry(.0078,.0078,.003,10),toon(cfg.choker));ch.position.y=.155;g.add(ch);}
  if(cfg.hoops){[-1,1].forEach(sd=>{const h=new THREE.Mesh(new THREE.TorusGeometry(.004,.0009,4,10),toon('#e8c35a'));h.position.set(0,.162,.0175*sd);g.add(h);});}
  // jerrycan in right hand, probe in left
  const can=new THREE.Group();const cb=new THREE.Mesh(new THREE.BoxGeometry(.03,.034,.016),toon('#3a86ff'));cb.position.y=-.02;const chd=new THREE.Mesh(new THREE.BoxGeometry(.012,.006,.006),toon('#1d1a2b'));can.add(cb,chd);can.position.y=-.07;armR.add(can);can.visible=false;
  const probe=new THREE.Mesh(new THREE.CylinderGeometry(.004,.004,.05,6),toon('#1d1a2b'));probe.position.y=-.09;armL.add(probe);probe.visible=false;
  try{Wd.Q.mergeStatic(g,[legL,legR,armL,armR]);}catch(e){console.warn('merge',e);}  // fewer draw calls per person
  g.userData={legL,legR,armL,armR,can,probe,cfg,anim:[]};g.scale.setScalar(1.7*(cfg.h||1));return g;
}
// small 3D previews rendered once into images
let AVATARS=[];
function renderAvatars(){
  try{const R=Wd.renderer,rt=new THREE.WebGLRenderTarget(120,150),sc=new THREE.Scene(),cm=new THREE.PerspectiveCamera(30,120/150,.01,10);
    sc.add(new THREE.HemisphereLight(0xffffff,0x6a5a8a,.75));const dl=new THREE.DirectionalLight(0xffffff,.7);dl.position.set(2,3,2);sc.add(dl);
    const px=new Uint8Array(120*150*4),cv=document.createElement('canvas');cv.width=120;cv.height=150;const cx=cv.getContext('2d');
    AVATARS=CHARS.map(c=>{const m=makePerson(c);m.scale.setScalar(1);m.rotation.y=-.5;sc.add(m);cm.position.set(.36,.16,.2);cm.lookAt(0,.11,0);
      R.setRenderTarget(rt);R.setClearColor(0xfff3c4,1);R.clear();R.render(sc,cm);R.readRenderTargetPixels(rt,0,0,120,150,px);R.setRenderTarget(null);sc.remove(m);
      const id=cx.createImageData(120,150);for(let y=0;y<150;y++)id.data.set(px.subarray((149-y)*480,(150-y)*480),y*480);cx.putImageData(id,0,0);return cv.toDataURL('image/png');});
    R.setClearColor(0x000000,0);rt.dispose();}catch(e){console.warn(e);AVATARS=[];}
}
// ------------------------------------------------------------ RANDOM FUNNY ACCESSORIES
const NEON=['#ff2d95','#ffd23f','#00e5ff','#7cff4f','#ff7b00','#b15cff','#ff4f3a','#3a86ff','#ffffff'];
const pick=a=>a[Math.floor(Math.random()*a.length)];
function AM(geo,col,x,y,z,parent){const m=new THREE.Mesh(geo,Wd.toon(col));m.position.set(x,y,z);parent.add(m);return m;}
const HEAD_ACC=[
 ['Party cone hat',g=>{const c=pick(NEON);const h=AM(new THREE.ConeGeometry(.013,.04,12),c,-.002,.212,0,g);for(let k=0;k<5;k++)AM(new THREE.SphereGeometry(.0028,5,4),pick(NEON),Math.cos(k*1.3)*.008,.2+k*.004,Math.sin(k*1.3)*.008,g);AM(new THREE.SphereGeometry(.005,6,5),pick(NEON),-.002,.233,0,g);}],
 ['Backwards baseball cap',g=>{const c=pick(NEON);AM(new THREE.SphereGeometry(.021,12,8,0,Math.PI*2,0,Math.PI*.45),c,-.002,.18,0,g);const v=AM(new THREE.BoxGeometry(.018,.003,.028),c,-.026,.185,0,g);v.rotation.z=-.25;}],
 ['Beanie with a giant pompom',g=>{const c=pick(NEON),c2=pick(NEON);AM(new THREE.SphereGeometry(.021,12,8,0,Math.PI*2,0,Math.PI*.5),c,-.002,.179,0,g);AM(new THREE.CylinderGeometry(.021,.021,.007,12),c2,-.002,.18,0,g);AM(new THREE.IcosahedronGeometry(.011,1),c2,-.002,.206,0,g);}],
 ['Cowboy hat',g=>{const c=pick(['#a8703a','#f4f0e6','#1d1a22','#ff2d95']);AM(new THREE.CylinderGeometry(.04,.04,.003,20),c,-.002,.19,0,g);AM(new THREE.CylinderGeometry(.014,.017,.024,14),c,-.002,.203,0,g);AM(new THREE.CylinderGeometry(.0172,.0172,.004,14),'#1d1a2b',-.002,.195,0,g);}],
 ['Viking helmet',g=>{AM(new THREE.SphereGeometry(.0215,12,8,0,Math.PI*2,0,Math.PI*.5),'#b8bcc6',-.002,.179,0,g);[-1,1].forEach(s=>{const h=AM(new THREE.ConeGeometry(.005,.03,8),'#fff4d6',-.002,.2,.022*s,g);h.rotation.x=-.9*s;});}],
 ['Royal crown',g=>{const c=AM(new THREE.CylinderGeometry(.016,.015,.012,8,1,true),'#ffd23f',-.002,.198,0,g);c.material.side=THREE.DoubleSide;for(let k=0;k<8;k++){const a=k/8*6.283;AM(new THREE.ConeGeometry(.003,.008,4),'#ffd23f',-.002+Math.cos(a)*.015,.207,Math.sin(a)*.015,g);}AM(new THREE.SphereGeometry(.003,6,5),'#ff2d95',.013,.198,0,g);}],
 ['Propeller beanie',g=>{AM(new THREE.SphereGeometry(.0205,12,8,0,Math.PI*2,0,Math.PI*.5),pick(['#ff4f3a','#3a86ff','#ffd23f']),-.002,.179,0,g);AM(new THREE.CylinderGeometry(.0015,.0015,.012,5),'#1d1a2b',-.002,.205,0,g);
   const p=new THREE.Group();p.position.set(-.002,.212,0);g.add(p);AM(new THREE.BoxGeometry(.05,.002,.008),pick(NEON),0,0,0,p);AM(new THREE.BoxGeometry(.008,.002,.05),pick(NEON),0,0,0,p);g.userData.anim.push((t,mv)=>{p.rotation.y+=mv?.9:.25;});}],
 ['Chef hat',g=>{AM(new THREE.CylinderGeometry(.018,.017,.02,14),'#ffffff',-.002,.198,0,g);for(let k=0;k<6;k++){const a=k/6*6.283;AM(new THREE.SphereGeometry(.011,8,6),'#ffffff',-.002+Math.cos(a)*.009,.214,Math.sin(a)*.009,g);}}],
 ['Top hat with a flower',g=>{AM(new THREE.CylinderGeometry(.028,.028,.003,18),'#1d1a2b',-.002,.19,0,g);AM(new THREE.CylinderGeometry(.016,.016,.04,14),'#1d1a2b',-.002,.21,0,g);AM(new THREE.CylinderGeometry(.0162,.0162,.006,14),'#ff2d95',-.002,.196,0,g);AM(new THREE.SphereGeometry(.005,6,5),'#ffd23f',.012,.198,.008,g);}],
 ['Pirate hat & eyepatch',g=>{const h=AM(new THREE.BoxGeometry(.03,.016,.05),'#1d1a2b',-.002,.198,0,g);h.scale.set(1,1,1);AM(new THREE.SphereGeometry(.004,6,5),'#ffffff',.012,.2,0,g);AM(new THREE.BoxGeometry(.003,.008,.009),'#1d1a2b',.0185,.176,.0065,g);AM(new THREE.BoxGeometry(.001,.002,.04),'#1d1a2b',.012,.182,0,g);}],
 ['Bunny ears',g=>{[-1,1].forEach(s=>{const e=AM(new THREE.CapsuleGeometry?new THREE.CapsuleGeometry(.005,.03,4,8):new THREE.CylinderGeometry(.005,.005,.04,8),'#ffffff',-.004,.212,.009*s,g);e.rotation.x=.25*s;const i=AM(new THREE.BoxGeometry(.001,.026,.005),'#ff9fc8',.0006,.212,.009*s,g);i.rotation.x=.25*s;});}],
 ['Reindeer antlers',g=>{[-1,1].forEach(s=>{const a=AM(new THREE.CylinderGeometry(.0018,.0022,.03,5),'#8a5a33',-.004,.205,.012*s,g);a.rotation.x=.5*s;AM(new THREE.CylinderGeometry(.0015,.0015,.014,5),'#8a5a33',-.001,.212,.018*s,g).rotation.z=.8;});AM(new THREE.SphereGeometry(.0045,8,6),'#ff2020',.0195,.169,0,g);}],
 ['Snorkel mask',g=>{AM(new THREE.BoxGeometry(.006,.014,.03),'#8fe3ff',.0185,.176,0,g);AM(new THREE.TorusGeometry(.019,.0015,5,16),pick(NEON),0,.176,0,g).rotation.x=Math.PI/2;const sn=AM(new THREE.CylinderGeometry(.0025,.0025,.05,6),pick(NEON),.004,.195,-.021,g);sn.rotation.x=-.15;}],
 ['Heart sunglasses',g=>{const c=pick(['#ff2d95','#ff4f3a','#b15cff']);[-1,1].forEach(s=>{AM(new THREE.SphereGeometry(.0055,8,6),c,.0185,.177,.0075*s,g).scale.set(.4,1,1);});AM(new THREE.BoxGeometry(.002,.002,.03),'#1d1a2b',.019,.179,0,g);}],
 ['Giant neon shades',g=>{const c=pick(NEON);[-1,1].forEach(s=>AM(new THREE.BoxGeometry(.004,.012,.017),'#1d1a2b',.019,.177,.009*s,g));AM(new THREE.BoxGeometry(.005,.016,.044),c,.0175,.177,0,g).scale.set(.5,1,1);}],
 ['Sombrero',g=>{const c=pick(['#ffd23f','#e9c46a','#ff7b00']);AM(new THREE.CylinderGeometry(.05,.05,.003,24),c,-.002,.189,0,g);AM(new THREE.ConeGeometry(.018,.035,16),c,-.002,.207,0,g);AM(new THREE.TorusGeometry(.045,.002,4,24),'#ff2d95',-.002,.19,0,g).rotation.x=Math.PI/2;}],
 ['Flower crown',g=>{for(let k=0;k<10;k++){const a=k/10*6.283;AM(new THREE.SphereGeometry(.0045,6,5),pick(['#ff2d95','#ffd23f','#ffffff','#b15cff','#ff7b00']),-.002+Math.cos(a)*.018,.186,Math.sin(a)*.018,g);}}],
];
const BODY_ACC=[
 ['Super-long striped scarf',g=>{const a=pick(NEON),b=pick(NEON);AM(new THREE.TorusGeometry(.011,.004,6,14),a,0,.153,0,g).rotation.x=Math.PI/2;const tail=new THREE.Group();tail.position.set(-.008,.152,.006);g.add(tail);
   for(let k=0;k<9;k++)AM(new THREE.BoxGeometry(.006,.009,.008),k%2?a:b,-k*.0085,-k*.004,0,tail);g.userData.anim.push((t,mv)=>{tail.rotation.z=(mv?-.25:.9)+Math.sin(t*9)*.18*(mv?1:.2);tail.rotation.y=Math.sin(t*5)*.25;});}],
 ['Superhero cape',g=>{const c=pick(['#ff4f3a','#3a86ff','#b15cff','#ff2d95']);const cp=new THREE.Group();cp.position.set(-.02,.15,0);g.add(cp);const m=AM(new THREE.BoxGeometry(.003,.075,.042),c,0,-.037,0,cp);
   g.userData.anim.push((t,mv)=>{cp.rotation.z=mv?-.75+Math.sin(t*14)*.12:-.08+Math.sin(t*2)*.03;});}],
 ['Inflatable duck ring',g=>{AM(new THREE.TorusGeometry(.03,.011,8,20),'#ffd23f',0,.085,0,g).rotation.x=Math.PI/2;AM(new THREE.SphereGeometry(.012,8,6),'#ffd23f',.036,.1,0,g);AM(new THREE.ConeGeometry(.005,.012,6),'#ff7b00',.049,.1,0,g).rotation.z=-Math.PI/2;AM(new THREE.SphereGeometry(.002,4,4),'#1d1a2b',.045,.105,.006,g);}],
 ['Hawaiian flower lei',g=>{for(let k=0;k<14;k++){const a=k/14*6.283;AM(new THREE.SphereGeometry(.0045,6,5),pick(['#ff2d95','#ffd23f','#ff7b00','#ffffff']),Math.cos(a)*.019,.146-Math.max(0,Math.cos(a))*.012,Math.sin(a)*.019,g);}}],
 ['Enormous bow tie',g=>{const c=pick(NEON);[-1,1].forEach(s=>AM(new THREE.ConeGeometry(.012,.02,4),c,.02,.148,.01*s,g).rotation.x=s*Math.PI/2);AM(new THREE.SphereGeometry(.004,6,5),c,.021,.148,0,g);}],
 ['Ballet tutu',g=>{const c=pick(['#ff9fc8','#b15cff','#00e5ff','#ffd23f']);const tu=AM(new THREE.CylinderGeometry(.022,.045,.012,20,1,true),c,0,.078,0,g);tu.material.side=THREE.DoubleSide;}],
 ['Neon fanny pack',g=>{AM(new THREE.BoxGeometry(.012,.014,.03),pick(NEON),.022,.084,0,g);AM(new THREE.TorusGeometry(.022,.0015,4,18),'#1d1a2b',0,.086,0,g).rotation.x=Math.PI/2;}],
 ['Rubber chicken',g=>{const u=g.userData;const ch=new THREE.Group();ch.position.set(0,-.07,0);u.armL.add(ch);AM(new THREE.CapsuleGeometry?new THREE.CapsuleGeometry(.004,.03,4,6):new THREE.CylinderGeometry(.004,.004,.035,6),'#ffd23f',0,-.02,0,ch);AM(new THREE.SphereGeometry(.006,6,5),'#ffd23f',0,-.04,0,ch);AM(new THREE.ConeGeometry(.003,.006,4),'#ff4f3a',0,-.044,.005,ch);}],
];
// swim kit: board shorts + floaties + flippers (+ snorkel sometimes)
function swimKit(g){const u=g.userData,sk=Wd.toon(u.cfg.skin),c=pick(NEON),c2=pick(NEON);
  [u.legL,u.legR].forEach(l=>{l.material=sk;const sh=AM(new THREE.CylinderGeometry(.013,.013,.03,8).translate(0,-.012,0),c,0,0,0,l);for(let k=0;k<3;k++)AM(new THREE.SphereGeometry(.004,5,4),c2,.012*Math.cos(k*2),-.01-k*.007,.012*Math.sin(k*2),l);});
  [u.armL,u.armR].forEach(a=>AM(new THREE.TorusGeometry(.009,.005,6,12),'#ff7b00',0,-.02,0,a).rotation.x=Math.PI/2);
  [u.legL,u.legR].forEach(l=>{const f=AM(new THREE.BoxGeometry(.05,.003,.022),pick(['#00e5ff','#7cff4f','#ff2d95']),.022,-.074,0,l);});}
HEAD_ACC.push(
 ['Wizard hat with stars',g=>{const c=pick(['#3a2a8a','#1d3557','#6b2a6b']);AM(new THREE.CylinderGeometry(.03,.03,.003,18),c,-.002,.188,0,g);const h=AM(new THREE.ConeGeometry(.018,.07,14),c,-.006,.225,0,g);h.rotation.z=.25;for(let k=0;k<6;k++)AM(new THREE.OctahedronGeometry(.0035,0),'#ffd23f',-.002+Math.cos(k)*.012,.2+k*.006,Math.sin(k*2)*.012,g);}],
 ['Astronaut helmet',g=>{const m=new THREE.Mesh(new THREE.SphereGeometry(.03,16,12),new THREE.MeshBasicMaterial({color:0xbfe9ff,transparent:true,opacity:.35,depthWrite:false}));m.position.set(0,.175,0);g.add(m);AM(new THREE.TorusGeometry(.024,.004,6,18),'#f4f4f2',0,.152,0,g).rotation.x=Math.PI/2;AM(new THREE.CylinderGeometry(.0015,.0015,.03,5),'#9a9aa2',-.01,.21,.01,g);AM(new THREE.SphereGeometry(.004,6,5),'#ff4f3a',-.01,.226,.01,g);}],
 ['Detective deerstalker & pipe (Sherlock Holmes)',g=>{const c='#a0845a';AM(new THREE.SphereGeometry(.021,12,8,0,Math.PI*2,0,Math.PI*.5),c,-.002,.18,0,g);[-1,1].forEach(s=>{const v=AM(new THREE.BoxGeometry(.016,.003,.024),c,.02*s,.184,0,g);v.rotation.z=.3*s;});AM(new THREE.BoxGeometry(.004,.004,.04),'#6b4a33',-.002,.2,0,g);
   const p=AM(new THREE.CylinderGeometry(.0015,.0015,.02,5),'#3a2418',.026,.162,.006,g);p.rotation.z=Math.PI/2;AM(new THREE.CylinderGeometry(.004,.003,.008,8),'#3a2418',.036,.166,.006,g);}],
 ['Vampire count collar & fangs (Dracula)',g=>{const u=g.userData;[-1,1].forEach(s=>{const c=AM(new THREE.BoxGeometry(.004,.03,.022),'#8a0d1d',-.012,.172,.013*s,g);c.rotation.x=-.35*s;});[-1,1].forEach(s=>AM(new THREE.ConeGeometry(.0015,.005,4),'#ffffff',.0175,.16,.003*s,g).rotation.x=Math.PI);
   const cp=new THREE.Group();cp.position.set(-.02,.15,0);g.add(cp);AM(new THREE.BoxGeometry(.003,.09,.05),'#15121a',0,-.045,0,cp);AM(new THREE.BoxGeometry(.0032,.088,.046),'#8a0d1d',.001,-.045,0,cp);g.userData.anim.push((t,mv)=>{cp.rotation.z=mv?-.6+Math.sin(t*12)*.1:-.05;});}],
 ['Robin Hood feathered cap',g=>{AM(new THREE.ConeGeometry(.022,.03,4),'#2e6b2e',-.004,.2,0,g).rotation.z=-.5;const f=AM(new THREE.BoxGeometry(.003,.04,.006),'#d62828',-.012,.215,.012,g);f.rotation.z=.8;}],
 ['Ninja headband',g=>{const c=pick(['#d62828','#1d1a2b','#3a86ff']);AM(new THREE.CylinderGeometry(.0205,.0205,.006,14),c,-.002,.181,0,g);const t=new THREE.Group();t.position.set(-.022,.181,0);g.add(t);[-1,1].forEach(s=>{const r=AM(new THREE.BoxGeometry(.03,.004,.003),c,-.015,0,.003*s,t);r.rotation.z=.3*s;});g.userData.anim.push((tt,mv)=>{t.rotation.y=Math.sin(tt*9)*.4;t.rotation.z=mv?.3:-.2;});}],
 ['Alien antennae',g=>{[-1,1].forEach(s=>{const a=AM(new THREE.CylinderGeometry(.0012,.0012,.035,5),'#7cff4f',-.004,.205,.009*s,g);a.rotation.x=.3*s;const b=new THREE.Mesh(new THREE.SphereGeometry(.005,8,6),new THREE.MeshBasicMaterial({color:0x7cff4f}));b.position.set(-.004,.222,.015*s);g.add(b);});}],
 ['Superhero eye mask',g=>{const c=pick(['#1d1a2b','#ff4f3a','#3a86ff','#ffd23f']);AM(new THREE.BoxGeometry(.004,.01,.034),c,.018,.176,0,g);AM(new THREE.CylinderGeometry(.0198,.0198,.004,14),c,-.001,.176,0,g);}],
 ['Mummy bandages',g=>{for(let k=0;k<7;k++){const b=AM(new THREE.TorusGeometry(.019+(k%3)*.002,.0025,4,14),'#e9e4d4',0,.1+k*.012,0,g);b.rotation.x=Math.PI/2+(k%2?.25:-.25);}}],
);
BODY_ACC.push(
 ['Glowing sci-fi laser sword',g=>{const u=g.userData;const sw=new THREE.Group();sw.position.set(0,-.07,0);u.armL.add(sw);AM(new THREE.CylinderGeometry(.003,.003,.018,6),'#9a9aa2',0,0,0,sw);const c=pick([0x00e5ff,0xff2020,0x7cff4f,0xb15cff]);
   const bl=new THREE.Mesh(new THREE.CylinderGeometry(.0028,.0028,.08,8),new THREE.MeshBasicMaterial({color:c}));bl.position.y=-.05;sw.add(bl);const glow=new THREE.Mesh(new THREE.CylinderGeometry(.006,.006,.08,8),new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.3,depthWrite:false}));glow.position.y=-.05;sw.add(glow);}],
 ['Magic wand',g=>{const u=g.userData;const w=new THREE.Group();w.position.set(0,-.07,0);u.armR.add(w);AM(new THREE.CylinderGeometry(.0018,.0022,.04,6),'#3a2418',0,-.02,0,w);const s=new THREE.Mesh(new THREE.SphereGeometry(.004,6,5),new THREE.MeshBasicMaterial({color:0xfff6a0}));s.position.y=-.042;w.add(s);g.userData.anim.push(t=>{s.scale.setScalar(1+Math.sin(t*10)*.4);});}],
 ['Sheriff star & lasso',g=>{AM(new THREE.OctahedronGeometry(.006,0),'#ffd23f',.021,.13,.008,g).scale.set(.3,1,1);const l=AM(new THREE.TorusGeometry(.014,.0018,4,16),'#c9a45a',.012,.085,-.024,g);l.rotation.y=Math.PI/2;}],
 ['Pirate parrot on the shoulder',g=>{const p=new THREE.Group();p.position.set(-.002,.158,.026);g.add(p);AM(new THREE.SphereGeometry(.007,8,6),'#2ec4b6',0,.006,0,p).scale.set(1,1.4,1);AM(new THREE.SphereGeometry(.005,8,6),'#ff4f3a',.002,.017,0,p);AM(new THREE.ConeGeometry(.002,.005,4),'#ffd23f',.007,.016,0,p).rotation.z=-Math.PI/2;AM(new THREE.BoxGeometry(.003,.012,.004),'#3a86ff',-.005,-.002,0,p);g.userData.anim.push(t=>{p.rotation.y=Math.sin(t*3)*.5;});}],
);
HEAD_ACC.push(
 ['Time-traveller goggles',g=>{[-1,1].forEach(s=>{AM(new THREE.CylinderGeometry(.006,.006,.006,12).rotateZ(Math.PI/2),'#b87333',.019,.179,.0075*s,g);const l=new THREE.Mesh(new THREE.CircleGeometry(.0045,12),new THREE.MeshBasicMaterial({color:0x7cffea}));l.rotation.y=Math.PI/2;l.position.set(.0225,.179,.0075*s);g.add(l);});AM(new THREE.CylinderGeometry(.0205,.0205,.004,14),'#5b3b24',-.001,.179,0,g);}],
 ['Jungle explorer pith helmet',g=>{AM(new THREE.SphereGeometry(.022,14,8,0,Math.PI*2,0,Math.PI*.5),'#e9d7a6',-.002,.18,0,g);AM(new THREE.CylinderGeometry(.032,.032,.003,18),'#e9d7a6',-.002,.182,0,g);AM(new THREE.CylinderGeometry(.0222,.0222,.004,16),'#8a5a33',-.002,.184,0,g);}],
 ['Knight helmet with plume',g=>{AM(new THREE.CylinderGeometry(.021,.021,.04,14),'#b8bcc6',-.002,.176,0,g);AM(new THREE.BoxGeometry(.004,.004,.03),'#1d1a2b',.02,.18,0,g);AM(new THREE.SphereGeometry(.021,14,8,0,Math.PI*2,0,Math.PI*.5),'#b8bcc6',-.002,.196,0,g);
   for(let k=0;k<5;k++)AM(new THREE.SphereGeometry(.006,6,5),pick(['#d62828','#3a86ff','#ffd23f']),-.01-k*.006,.222-k*.003,0,g);}],
 ['Samurai topknot',g=>{AM(new THREE.CylinderGeometry(.004,.005,.018,8),'#141010',-.008,.203,0,g).rotation.z=.6;AM(new THREE.TorusGeometry(.004,.0015,4,8),'#d62828',-.004,.2,0,g);}],
 ['Werewolf ears & tail',g=>{[-1,1].forEach(s=>{const e=AM(new THREE.ConeGeometry(.007,.018,4),'#6b5a4a',-.004,.2,.012*s,g);e.rotation.x=.25*s;});const t=new THREE.Group();t.position.set(-.022,.08,0);g.add(t);const tl=AM(new THREE.ConeGeometry(.008,.05,6),'#6b5a4a',-.02,0,0,t);tl.rotation.z=Math.PI/2+.4;g.userData.anim.push((tt,mv)=>{t.rotation.y=Math.sin(tt*(mv?14:4))*.5;});}],
 ['Devil horns',g=>{[-1,1].forEach(s=>{const h=AM(new THREE.ConeGeometry(.004,.016,6),'#d62828',.004,.198,.01*s,g);h.rotation.x=.35*s;h.rotation.z=-.3;});}],
 ['Angel halo',g=>{const h=new THREE.Mesh(new THREE.TorusGeometry(.016,.002,6,20),new THREE.MeshBasicMaterial({color:0xfff6a0}));h.rotation.x=Math.PI/2;h.position.set(-.002,.214,0);g.add(h);g.userData.anim.push(t=>{h.position.y=.214+Math.sin(t*2)*.003;});}],
 ['Clown nose & rainbow wig',g=>{AM(new THREE.SphereGeometry(.0055,8,6),'#ff2020',.0205,.172,0,g);for(let k=0;k<16;k++){const a=k/16*6.283;AM(new THREE.IcosahedronGeometry(.008,0),['#ff2d95','#ffd23f','#00e5ff','#7cff4f'][k%4],-.006+Math.cos(a)*.017,.19+Math.sin(k)*.006,Math.sin(a)*.02,g);}}],
 ['Hot-dog hat',g=>{AM(new THREE.CapsuleGeometry?new THREE.CapsuleGeometry(.012,.03,4,8):new THREE.CylinderGeometry(.012,.012,.04,8),'#e9a04a',-.002,.2,0,g).rotation.x=Math.PI/2;const d=AM(new THREE.CapsuleGeometry?new THREE.CapsuleGeometry(.006,.045,4,8):new THREE.CylinderGeometry(.006,.006,.05,8),'#b5412a',-.002,.21,0,g);d.rotation.x=Math.PI/2;AM(new THREE.BoxGeometry(.002,.002,.04),'#ffd23f',-.002,.217,0,g);}],
 ['Movie director beret & megaphone',g=>{AM(new THREE.CylinderGeometry(.021,.019,.008,14),'#1d1a2b',-.004,.19,0,g).rotation.z=.2;const u=g.userData;const mg=AM(new THREE.ConeGeometry(.01,.03,10,1,true),'#ffd23f',0,-.08,0,u.armR);mg.material=mg.material.clone();mg.material.side=THREE.DoubleSide;}],
);
BODY_ACC.push(
 ['Ghost-catcher vacuum backpack',g=>{AM(new THREE.BoxGeometry(.024,.05,.034),'#6b6b70',-.036,.12,0,g);AM(new THREE.CylinderGeometry(.006,.006,.03,8),'#ff7b00',-.05,.13,0,g);const hose=AM(new THREE.TorusGeometry(.02,.0025,5,14,Math.PI),'#1d1a2b',-.02,.09,.02,g);hose.rotation.y=Math.PI/2;
   const l=new THREE.Mesh(new THREE.SphereGeometry(.003,6,5),new THREE.MeshBasicMaterial({color:0x7cff4f}));l.position.set(-.049,.14,.012);g.add(l);g.userData.anim.push(t=>{l.visible=Math.sin(t*8)>0;});}],
 ['Witch broom',g=>{const b=AM(new THREE.CylinderGeometry(.0018,.0018,.12,5),'#8a5a33',-.03,.1,.0,g);b.rotation.z=.9;const br=AM(new THREE.ConeGeometry(.012,.03,8),'#c9a45a',-.078,.065,0,g);br.rotation.z=.9+Math.PI;}],
 ['Knight shield',g=>{const u=g.userData;const sh=AM(new THREE.BoxGeometry(.004,.04,.03),'#3a86ff',0,-.05,.01,u.armL);AM(new THREE.BoxGeometry(.0045,.03,.006),'#ffd23f',0,0,0,sh);AM(new THREE.BoxGeometry(.0045,.006,.022),'#ffd23f',0,.005,0,sh);}],
 ['Dinosaur tail',g=>{const t=new THREE.Group();t.position.set(-.02,.075,0);g.add(t);for(let k=0;k<5;k++){const s=AM(new THREE.SphereGeometry(.011-k*.0018,8,6),'#6aab3a',-k*.013,-k*.006,0,t);if(k<4)AM(new THREE.ConeGeometry(.003,.008,4),'#ffd23f',-k*.013,-k*.006+.01-k*.001,0,t);}g.userData.anim.push((tt,mv)=>{t.rotation.y=Math.sin(tt*(mv?9:2))*.4;});}],
);
HEAD_ACC.push(
 ['PhD graduation cap',g=>{AM(new THREE.CylinderGeometry(.0195,.0195,.01,14),'#1d1a2b',-.002,.19,0,g);AM(new THREE.BoxGeometry(.04,.003,.04),'#1d1a2b',-.002,.197,0,g).rotation.y=.4;const t=AM(new THREE.CylinderGeometry(.001,.001,.02,4),'#ffd23f',.016,.19,.012,g);AM(new THREE.SphereGeometry(.003,5,4),'#ffd23f',.016,.18,.012,g);}],
 ['Aviator cap & goggles',g=>{AM(new THREE.SphereGeometry(.0215,12,8,0,Math.PI*2,0,Math.PI*.55),'#6b4226',-.002,.178,0,g);[-1,1].forEach(s=>{AM(new THREE.BoxGeometry(.012,.016,.004),'#6b4226',-.004,.165,.02*s,g);AM(new THREE.CylinderGeometry(.005,.005,.004,10).rotateX(Math.PI/2),'#8fe3ff',.012,.192,.008*s,g);});AM(new THREE.BoxGeometry(.003,.003,.03),'#3a2418',.012,.192,0,g);}],
 ['Frog hat',g=>{AM(new THREE.SphereGeometry(.022,12,8,0,Math.PI*2,0,Math.PI*.5),'#6aab3a',-.002,.18,0,g);[-1,1].forEach(s=>{AM(new THREE.SphereGeometry(.007,8,6),'#ffffff',.008,.2,.009*s,g);AM(new THREE.SphereGeometry(.0035,6,5),'#1d1a2b',.013,.201,.009*s,g);});}],
 ['Unicorn horn',g=>{AM(new THREE.ConeGeometry(.005,.032,8),'#fff4d6',.012,.206,0,g).rotation.z=-.35;for(let k=0;k<5;k++)AM(new THREE.SphereGeometry(.004,5,4),['#ff9fc8','#b15cff','#00e5ff','#ffd23f','#7cff4f'][k],-.012-k*.004,.19-k*.006,0,g);}],
 ['Mushroom hat',g=>{AM(new THREE.SphereGeometry(.03,14,8,0,Math.PI*2,0,Math.PI*.5),'#d62828',-.002,.185,0,g);for(let k=0;k<7;k++){const a=k*1.7;AM(new THREE.SphereGeometry(.004,5,4),'#ffffff',-.002+Math.cos(a)*.017,.2+Math.sin(k)*.004,Math.sin(a)*.017,g);}}],
 ['Pineapple hat',g=>{AM(new THREE.SphereGeometry(.02,10,8),'#f2b134',-.002,.198,0,g).scale.set(1,1.2,1);for(let k=0;k<6;k++){const l=AM(new THREE.ConeGeometry(.004,.022,4),'#2e8a3a',-.002,.227,0,g);l.rotation.set(Math.cos(k)*.5,0,Math.sin(k)*.5);}}],
 ['Traffic cone hat',g=>{AM(new THREE.ConeGeometry(.018,.05,12),'#ff7b00',-.002,.21,0,g);AM(new THREE.CylinderGeometry(.013,.015,.006,12),'#ffffff',-.002,.206,0,g);}],
 ['Rubber duck on the head',g=>{AM(new THREE.SphereGeometry(.009,8,6),'#ffd23f',-.002,.2,0,g).scale.set(1.3,1,1);AM(new THREE.SphereGeometry(.006,8,6),'#ffd23f',.007,.21,0,g);AM(new THREE.ConeGeometry(.0025,.007,5),'#ff7b00',.014,.209,0,g).rotation.z=-Math.PI/2;}],
);
BODY_ACC.push(
 ['Guitar on the back',g=>{const G=new THREE.Group();G.position.set(-.03,.12,0);G.rotation.x=.5;g.add(G);AM(new THREE.SphereGeometry(.016,10,8),'#b5651d',0,-.02,0,G).scale.set(.45,1,1);AM(new THREE.SphereGeometry(.012,10,8),'#b5651d',0,.004,0,G).scale.set(.45,1,1);AM(new THREE.BoxGeometry(.004,.05,.006),'#3a2418',0,.035,0,G);}],
 ['Butterfly wings',g=>{const c=pick(NEON),c2=pick(NEON);[-1,1].forEach(s=>{const w=AM(new THREE.CircleGeometry(.024,12),c,-.028,.14,.018*s,g);w.rotation.y=Math.PI/2+.6*s;w.material.side=THREE.DoubleSide;const w2=AM(new THREE.CircleGeometry(.015,10),c2,-.028,.108,.014*s,g);w2.rotation.y=Math.PI/2+.6*s;w2.material.side=THREE.DoubleSide;
   g.userData.anim.push(t=>{w.rotation.y=Math.PI/2+(.6+Math.sin(t*6)*.25)*s;w2.rotation.y=w.rotation.y;});});}],
 ['Balloon tied to the backpack',g=>{const c=pick(NEON);const b=AM(new THREE.SphereGeometry(.02,10,8),c,-.05,.29,0,g);b.scale.y=1.2;const st=AM(new THREE.CylinderGeometry(.0005,.0005,.13,3),'#ffffff',-.045,.2,0,g);g.userData.anim.push(t=>{b.position.x=-.05+Math.sin(t*1.3)*.006;});}],
 ['Teddy bear backpack',g=>{AM(new THREE.SphereGeometry(.018,10,8),'#a0724a',-.034,.12,0,g);AM(new THREE.SphereGeometry(.012,10,8),'#a0724a',-.036,.148,0,g);[-1,1].forEach(s=>AM(new THREE.SphereGeometry(.005,6,5),'#a0724a',-.036,.16,.009*s,g));}],
 ['Vintage camera around the neck',g=>{AM(new THREE.BoxGeometry(.008,.012,.02),'#1d1a2b',.022,.125,0,g);AM(new THREE.CylinderGeometry(.005,.005,.006,10).rotateZ(Math.PI/2),'#b8bcc6',.028,.125,0,g);AM(new THREE.TorusGeometry(.016,.0008,3,14),'#8a5a33',.004,.14,0,g).rotation.z=Math.PI/2;}],
 ['Andean striped poncho',g=>{const c=pick(['#d62828','#1d3557','#6b2a6b','#2e5e4e']),c2=pick(['#ffd23f','#f4f0e6','#ff7b00']);AM(new THREE.ConeGeometry(.04,.05,4,1,true),c,0,.13,0,g).rotation.y=Math.PI/4;AM(new THREE.CylinderGeometry(.03,.034,.004,4,1,true),c2,0,.123,0,g).rotation.y=Math.PI/4;}],
);
// hand accessories: only visible up close, i.e. in first person (js/fpgear.js draws them)
const HAND_ACC=['watch','smartwatch','bracelets','rings','nails','bandaid','tattoo','glowband','rubberband','fingerless'];
const TECH_HANDS=[0,4,14,17];  // Abraham, Camila, Issotta, Pedro: computer people, they carry a mouse or a keyboard instead of lab gear
// third-person version of the held mouse / keyboard (cartoon-sized so it reads from the game camera)
function addTechProp(g){const it=(g.userData.hands||[]).find(h=>h.k==='lab'&&(h.item==='mouse'||h.item==='keyboard'));const u=g.userData;if(!it||!u.armR||u.tech)return;
  const p=new THREE.Group();p.position.set(.006,-.07,-.008);p.scale.setScalar(1.45);p.rotation.x=.25;u.armR.add(p);u.tech=p;  // a bit bigger and held away from the leg so it reads from the game camera
  const c=new THREE.Color(it.c),hsl={};c.getHSL(hsl);const col=hsl.l<.3||hsl.l>.85?pick(['#ff2d95','#3a86ff','#7cff4f','#ffd23f','#00e5ff','#ff7b00']):it.c;  // dark or white props vanish against clothes: use a bright one
  if(it.item==='mouse'){const m=AM(new THREE.SphereGeometry(.011,12,8),col,0,-.012,0,p);m.scale.set(1.5,.8,1);AM(new THREE.BoxGeometry(.0015,.004,.004),'#3a3d44',.008,-.004,0,p);
    AM(new THREE.CylinderGeometry(.0006,.0006,.03,4),'#2a2a30',-.004,.006,0,p);}
  else{const L=.05+Math.random()*.02;AM(new THREE.BoxGeometry(.006,L,.024),col,.004,-L/2+.004,0,p);const cap=pick(['#2a2a30','#f4f0e6','#e8dcc0']);
    [-1,1].forEach(s=>{for(let r=0;r<4;r++)AM(new THREE.BoxGeometry(.0016,L-.008,.0035),Math.random()<.2?pick(NEON):cap,.004+s*.0034,-L/2+.004,-.008+r*.0055,p);});}
  return p;}
function rollHands(ci){const n=Math.random()<.2?0:1+Math.floor(Math.random()*3),out=[];const pool=HAND_ACC.slice();for(let i=0;i<n;i++){const k=pool.splice(Math.floor(Math.random()*pool.length),1)[0];out.push({k,c:pick(NEON),side:Math.random()<.5?1:-1});}
  if(TECH_HANDS.includes(ci)){out.push({k:'lab',item:pick(['mouse','keyboard']),c:pick(['#1d1a2b','#f4f0e6','#d9dde3','#ff2d95','#3a86ff','#7cff4f','#ffd23f','#b15cff','#e8dcc0','#ff7b00'])});return out;}
  if(Math.random()<.8)out.push({k:'lab',item:pick(['thermometer','erlenmeyer','beaker','pasteur','micropipette','testtube','falcon','petri','notebook']),c:pick(['#7cff4f','#3a86ff','#ff2d95','#ffd23f','#00e5ff','#b15cff'])});  // lab gear held in a free hand
  return out;}
const FEET_ACC=[['Diving flippers',g=>{const u=g.userData;[u.legL,u.legR].forEach(l=>AM(new THREE.BoxGeometry(.05,.003,.022),pick(['#00e5ff','#7cff4f','#ff2d95']),.022,-.074,0,l));}],
 ['Bunny slippers',g=>{const u=g.userData;[u.legL,u.legR].forEach(l=>{AM(new THREE.SphereGeometry(.011,8,6),'#ffffff',.006,-.068,0,l).scale.set(1.4,.8,1);[-1,1].forEach(s=>AM(new THREE.BoxGeometry(.003,.014,.004),'#ffffff',-.002,-.058,.004*s,l));});}]];
function swimBasic(g){const u=g.userData,sk=Wd.toon(u.cfg.skin),c=pick(['#1d3557','#2a2a30','#8a1c2b','#2e5e4e','#3a86ff']);[u.legL,u.legR].forEach(l=>{l.material=sk;AM(new THREE.CylinderGeometry(.012,.012,.026,8).translate(0,-.01,0),c,0,0,0,l);});}
function rollAccessories(g,reroll){  // reroll: a new random look (L / 🎲); a character's first look never gets the knight shield (it reads as a Bible)
  const BA=reroll?BODY_ACC:BODY_ACC.filter(b=>b[0]!=='Knight shield');
  g.userData.anim=g.userData.anim||[];const names=[];
  const swim=Math.random()<.18;
  if(swim){swimKit(g);names.push('Swim kit (board shorts, floaties & flippers)');if(Math.random()<.5){HEAD_ACC.find(h=>h[0]==='Snorkel mask')[1](g);names.push('Snorkel mask');}else{const h=pick(HEAD_ACC.filter(h=>h[0]!=='Snorkel mask'));h[1](g);names.push(h[0]);}return names;}
  const h=pick(HEAD_ACC);h[1](g);names.push(h[0]);
  if(Math.random()<.75){const b=pick(BA);b[1](g);names.push(b[0]);}
  if(Math.random()<.25){const f=pick(FEET_ACC);f[1](g);names.push(f[0]);}
  if(Math.random()<.35){const b=pick(BA.filter(b=>!names.includes(b[0])));b[1](g);names.push(b[0]);}  // sometimes a second body accessory
  g.userData.hands=rollHands(CHARS.indexOf(g.userData.cfg));addTechProp(g);
  return names;
}

function addHeadlamp(g){const h=new THREE.Group();h.position.set(.0,.184,0);
  const strap=new THREE.Mesh(new THREE.TorusGeometry(.0185,.0022,5,16).rotateX(Math.PI/2),Wd.toon('#222'));strap.scale.set(.97,1,.93);h.add(strap);
  const box=new THREE.Mesh(new THREE.BoxGeometry(.006,.008,.01),Wd.toon('#333'));box.position.x=.019;h.add(box);
  const bulb=new THREE.Mesh(new THREE.BoxGeometry(.002,.005,.006),new THREE.MeshBasicMaterial({color:0xfff6d0}));bulb.position.x=.0225;h.add(bulb);
  const glow=new THREE.Mesh(new THREE.SphereGeometry(.009,8,6),new THREE.MeshBasicMaterial({color:0xfff6d0,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));glow.position.x=.024;h.add(glow);
  const beam=new THREE.Mesh(new THREE.ConeGeometry(.045,.26,14,1,true).rotateZ(Math.PI/2).translate(.13,0,0).rotateZ(-.42),new THREE.MeshBasicMaterial({color:0xfff2c0,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}));beam.position.x=.023;h.add(beam);
  glow.visible=beam.visible=false;g.add(h);g.userData.hl={beam,glow,bulb};}
function setCharacter(i,silent,reroll){
  charIdx=i;saveChars();if(!pl.g)return;const old=pl.g;const n=makePerson(CHARS[i]);const look=rollAccessories(n,reroll);addHeadlamp(n);n.position.copy(old.position);n.rotation.copy(old.rotation);Wd.scene.remove(old);Wd.scene.add(n);pl.g=n;PK.onChar(silent);
  if(!silent){toast(`👤 Now playing as <b>${esc(charNames[i])}</b><br>🎲 Today's look: <b>${look.join(' + ')}</b>${PK.desc()?'<br>✨ '+PK.desc():''}`,false,PK.desc()?6500:3600);AU.sfx.voice(5,CHARS[i].f?210:130);}
}
function openPicker(after){
  const inGame=!after;
  openModal({title:inGame?'SWITCH SCIENTIST':'CHOOSE YOUR SCIENTIST',meta:'The Microbial Ecophysiology Lab team · click a card to play · tap a name to rename it',col:'#f15bb5',close:inGame,html:`
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px">${PICK_ORDER.map(i=>{const c=CHARS[i];return `
     <div class="scard ch${i===charIdx?' sel':''}" data-i="${i}" style="margin:0;padding:6px;cursor:pointer;${i===charIdx?'background:#ffd23f':''}">
      <div style="display:flex;gap:4px"><img src="${PORTRAITS[i]}" alt="" style="width:50%;border:2px solid #1d1a2b;border-radius:6px;display:block">${AVATARS[i]?`<img src="${AVATARS[i]}" alt="" style="width:50%;border:2px solid #1d1a2b;border-radius:6px;display:block">`:''}</div>
      <input class="chn" data-i="${i}" value="${esc(charNames[i])}" maxlength="22" style="width:100%;margin-top:5px;font:16px 'Bangers',Impact;letter-spacing:.04em;border:2px solid #1d1a2b;border-radius:6px;padding:2px 5px;background:#fff">
     </div>`;}).join('')}</div>
    ${inGame?'':vehPickerHTML()}
    <div class="g-row">${inGame?'':`<button class="g-btn y" id="pk-go" style="font-size:24px">▶ START SAMPLING</button>`}<span class="note">${inGame?'Tip: press <kbd>P</kbd> in-game to jump straight to the next scientist.':'You can switch anytime with the 👤 button or <kbd>P</kbd>.'}</span></div>`,
   init(){const mb=$('#g-mb');
     mb.querySelectorAll('.chn').forEach(inp=>{inp.addEventListener('click',e=>e.stopPropagation());inp.addEventListener('keydown',e=>e.stopPropagation());inp.addEventListener('input',()=>{charNames[+inp.dataset.i]=inp.value.trim()||CHAR_NAMES[+inp.dataset.i];saveChars();});});
     mb.querySelectorAll('.ch').forEach(cd=>cd.addEventListener('click',()=>{const i=+cd.dataset.i;AU.sfx.click();
       if(inGame){setCharacter(i);closeModal();}else{charIdx=i;saveChars();mb.querySelectorAll('.ch').forEach(o=>o.style.background=+o.dataset.i===i?'#ffd23f':'');}}));
     if(!inGame)bindVehPicker(mb);
     const go=$('#pk-go');if(go)go.onclick=()=>{setCharacter(charIdx,true);after();};}});
}

// ------------------------------------------------------------ FILM CREW (camera operator + boom operator)
const CREW=[];const DUST=[];
function makeCrew(){
  const toon=Wd.toon;
  const mk=(cfg,kind,side)=>{
    const outer=new THREE.Group(),body=makePerson(cfg);body.scale.setScalar(1.6);outer.add(body);const u=body.userData;
    if(kind==='cam'){ // shoulder camera pointing forward, red REC light
      const cam=new THREE.Group();const b=new THREE.Mesh(new THREE.BoxGeometry(.036,.022,.016),toon('#2b2b30'));const lens=new THREE.Mesh(new THREE.CylinderGeometry(.007,.009,.016,10).rotateZ(Math.PI/2),toon('#111'));lens.position.x=.025;
      const hood=new THREE.Mesh(new THREE.BoxGeometry(.006,.012,.014),toon('#111'));hood.position.x=.035;const top=new THREE.Mesh(new THREE.BoxGeometry(.02,.006,.004),toon('#555'));top.position.y=.014;
      const rec=new THREE.Mesh(new THREE.SphereGeometry(.003,6,5),new THREE.MeshBasicMaterial({color:0xff2020}));rec.position.set(.01,.013,.006);cam.add(b,lens,hood,top,rec);cam.position.set(.006,.168,-.024);body.add(cam);
      u.armR.rotation.x=-.2;outer.userData.rec=rec;}
    else{ // boom pole with a fluffy "dead cat" mic, headphones
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.0018,.0018,.3,5).translate(0,.15,0),toon('#9a9aa2'));pole.rotation.z=-1.05;pole.position.set(.01,.14,0);
      const fur=new THREE.Mesh(new THREE.CapsuleGeometry?new THREE.CapsuleGeometry(.009,.022,4,8).rotateZ(Math.PI/2):new THREE.SphereGeometry(.012,8,6),toon('#b8b0a0'));fur.position.set(0,.3,0);fur.rotation.z=1.05;pole.add(fur);
      for(let k=0;k<10;k++){const h=new THREE.Mesh(new THREE.IcosahedronGeometry(.004,0),toon('#a09880'));h.position.set((Math.random()-.5)*.03,.3+(Math.random()-.5)*.012,(Math.random()-.5)*.014);pole.add(h);}
      body.add(pole);outer.userData.pole=pole;
      const hp=new THREE.Mesh(new THREE.TorusGeometry(.02,.0025,5,14,Math.PI),toon('#1d1a2b'));hp.rotation.y=Math.PI/2;hp.position.set(-.002,.176,0);body.add(hp);
      [-1,1].forEach(sd=>{const e=new THREE.Mesh(new THREE.CylinderGeometry(.006,.006,.006,10).rotateX(Math.PI/2),toon('#ff4f3a'));e.position.set(-.002,.172,.019*sd);body.add(e);});
      u.armL.rotation.x=.6;u.armR.rotation.x=-.6;}
    Wd.scene.add(outer);
    return {g:outer,b:body,u,kind,side,x:pl.x,z:pl.z,yaw:0,st:'wait',wait:0,sp:0,lean:0,ph:Math.random()*6,react:0,huff:0};
  };
  CREW.push(mk({skin:'#d9a47e',hair:'#1e1612',style:'short',beard:'stubble',cap:'#ff4f3a',top:'#1d1a22',pants:'#3a4660',shoes:'#333',h:1},'cam',1));
  CREW.push(mk({skin:'#e6b89a',hair:'#7a4a2a',style:'long',top:'#2ec4b6',jacket:'#44546a',pants:'#2a2a30',shoes:'#222',h:.96},'boom',-1));
  CREW.forEach(c=>{c.x=pl.x-.3;c.z=pl.z+.3*c.side;});
}
const PUFFG=new THREE.SphereGeometry(.03,6,5);
function puff(x,z){const m=new THREE.Mesh(PUFFG,new THREE.MeshBasicMaterial({color:0xf2e8d4,transparent:true,opacity:.8,depthWrite:false}));m.position.set(x,Wd.heightAt(x,z)+.02,z);Wd.scene.add(m);DUST.push({m,t:0});}
function updateCrew(dt,t){
  if(!CREW.length)return;
  for(let i=DUST.length-1;i>=0;i--){const d=DUST[i];d.t+=dt;d.m.scale.setScalar(1+d.t*4);d.m.position.y+=dt*.12;d.m.material.opacity=.8*(1-d.t/.9);if(d.t>.9){Wd.scene.remove(d.m);d.m.material.dispose();DUST.splice(i,1);}}
  CREW.forEach((c,ci)=>{
    const u=c.u;
    if(pl.inTruck&&!PK.animal()){ // ride in the truck bed
      c.st='ride';c.g.visible=true;const bx=-.1-.02*ci,bz=.045*c.side;const cy=Math.cos(truck.yaw),sy=Math.sin(truck.yaw);
      c.x=truck.x+cy*bx+sy*bz;c.z=truck.z-sy*bx+cy*bz;c.g.position.set(c.x,truck.g.position.y+.1,c.z);c.yaw=truck.yaw+(ci?.4:-.4);c.g.rotation.set(0,c.yaw,0);
      u.legL.rotation.z=u.legR.rotation.z=0;c.b.rotation.z=0;c.b.position.y=Math.abs(Math.sin(t*9+ci))*.004*Math.min(1,Math.abs(truck.speed));return;}
    if(c.st==='ride'){c.st='wait';c.wait=0;c.x=pl.x-Math.cos(pl.yaw)*.25+Math.sin(pl.yaw)*.3*c.side;c.z=pl.z+Math.sin(pl.yaw)*.25+Math.cos(pl.yaw)*.3*c.side;puff(c.x,c.z);}
    // their slot: behind and beside the scientist
    const sx=pl.x-Math.cos(pl.yaw)*.22+Math.sin(pl.yaw)*.28*c.side,sz=pl.z+Math.sin(pl.yaw)*.22+Math.cos(pl.yaw)*.28*c.side;
    let dP=Math.hypot(pl.x-c.x,pl.z-c.z),dS=Math.hypot(sx-c.x,sz-c.z);if(dP>5){c.x=sx;c.z=sz;puff(c.x,c.z);dP=dS=0;c.st='wait';}
    if(c.st==='wait'){c.sp=0;
      if(pl.running&&dS>.35&&!WX.block){c.st='sprint';c.huff=0;}
      else if(dP>1.25&&!WX.block){c.react+=dt;if(c.react>.35+ci*.25){c.st='sprint';c.react=0;c.huff=0;AU.sfx.voice(2,c.kind==='cam'?140:215);}}else c.react=0;}
    else if(c.st==='sprint'){c.sp=Math.min(pl.running?Math.max(1.15,.46*1.75*1.35):1.7,c.sp+dt*5);c.huff-=dt;if(c.huff<=0){c.huff=.35;puff(c.x,c.z);}
      if(dS<.28){c.st='skid';c.skid=.45;AU.sfx.skid();}}
    else if(c.st==='skid'){c.skid-=dt;c.sp=Math.max(0,c.sp-dt*4.5);if(Math.random()<.5)puff(c.x,c.z);if(c.skid<=0||c.sp<=.02){c.st='wait';c.sp=0;}}
    if(c.sp>0){const tx=c.st==='skid'?c.x+Math.cos(c.yaw):sx,tz=c.st==='skid'?c.z-Math.sin(c.yaw):sz;
      if(c.st==='sprint')c.yaw=angLerp(c.yaw,Math.atan2(-(tz-c.z),tx-c.x),Math.min(1,dt*12));
      const mv=Math.min(c.sp*dt,c.st==='sprint'?dS:1);c.x+=Math.cos(c.yaw)*mv;c.z-=Math.sin(c.yaw)*mv;}
    else{ // face / film the scientist
      const want=Math.atan2(-(pl.z-c.z),pl.x-c.x);c.yaw=angLerp(c.yaw,want,Math.min(1,dt*4));}
    const leanT=c.st==='sprint'?-.45:c.st==='skid'?.42:0;c.lean+=(leanT-c.lean)*Math.min(1,dt*10);
    c.g.visible=true;c.g.position.set(c.x,Wd.heightAt(c.x,c.z),c.z);c.g.rotation.set(0,c.yaw,0);c.b.rotation.z=c.lean;
    c.ph+=dt*(c.st==='sprint'?26:c.st==='skid'?0:2);
    const sw=c.st==='sprint'?Math.sin(c.ph)*1.1:c.st==='skid'?.6:Math.sin(c.ph)*.04;
    u.legL.rotation.z=sw;u.legR.rotation.z=c.st==='skid'?-.2:-sw;
    if(c.kind==='cam'){u.armL.rotation.z=c.st==='sprint'?-sw*1.2:0;c.g.userData.rec.visible=Math.sin(t*6)>0;}
    else{c.g.userData.pole.rotation.z=-1.05+(c.st==='sprint'?Math.sin(c.ph*.5)*.35:c.st==='skid'?-.35:Math.sin(t*1.3)*.05);}
    c.b.position.y=c.st==='sprint'?Math.abs(Math.sin(c.ph))*.02:0;
  });
}

// ------------------------------------------------------------ SAMPLING BOAT on Lake Caviahue
const BOAT={g:null,x:0,z:0,yaw:0,pts:[],tgt:null,st:'move',wait:0,sp:0,foam:[],ft:0,niskin:null,rope:null,crew:[]};
function lakeY(){const L=Wd.LAKES[0];return Wd.Y(L.level)+.004;}
function inWater(x,z,m=.12){return Wd.lakeSdf(Wd.LAKES[0],x,z)<-m;}
function clearPath(a,b){const n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.08);for(let i=1;i<=n;i++){const t=i/n;if(!inWater(lerp(a[0],b[0],t),lerp(a[1],b[1],t),.04))return false;}return true;}
function buildBoat(){
  const L=Wd.LAKES[0];if(!L||!L.bbox)return;const [x0,x1,z0,z1]=L.bbox;
  for(let x=x0;x<x1;x+=.2)for(let z=z0;z<z1;z+=.2)if(inWater(x,z,.15))BOAT.pts.push([x,z]);
  if(BOAT.pts.length<3)return;
  const toon=Wd.toon,g=new THREE.Group(),hull=new THREE.Group();g.add(hull);
  const add=(geo,col,x,y,z,p=hull)=>{const m=new THREE.Mesh(geo,toon(col));m.position.set(x,y,z);p.add(m);return m;};
  add(new THREE.BoxGeometry(.14,.022,.07),'#ffffff',0,.011,0);
  const bow=add(new THREE.CylinderGeometry(.035,.035,.022,3),'#ffffff',.075,.011,0);bow.rotation.y=Math.PI;bow.scale.set(1.2,1,1);
  add(new THREE.BoxGeometry(.142,.006,.072),'#ff4f3a',0,.018,0);
  add(new THREE.BoxGeometry(.13,.004,.06),'#3a86ff',0,.023,0);
  add(new THREE.BoxGeometry(.02,.03,.018),'#1d1a2b',-.078,.028,0);add(new THREE.BoxGeometry(.006,.03,.006),'#555',-.086,.005,0);   // outboard motor
  add(new THREE.BoxGeometry(.03,.012,.03),'#ffffff',-.02,.03,.018);add(new THREE.BoxGeometry(.03,.004,.031),'#3a86ff',-.02,.037,.018);  // cooler
  const flag=add(new THREE.BoxGeometry(.002,.05,.002),'#ddd',-.06,.05,-.025);add(new THREE.BoxGeometry(.02,.012,.001),'#ffd23f',-.05,.068,-.025);
  // A-frame winch + Niskin bottle
  const af=add(new THREE.BoxGeometry(.003,.06,.003),'#9a9aa2',.05,.05,.03);af.rotation.x=-.5;
  BOAT.rope=add(new THREE.CylinderGeometry(.0007,.0007,1,4).translate(0,-.5,0),'#1d1a2b',.05,.075,.045,g);
  BOAT.niskin=add(new THREE.CylinderGeometry(.005,.005,.022,8),'#8fd3ff',.05,.06,.045,g);
  // scientists aboard: Pedro (grey hair, plaid shirt) and Sofi (long curly hair, gold hoops), both in white lab coats
  [[{skin:'#e8b89a',hair:'#b8b8b4',style:'short',top:'#6d6a8a',jacket:'#f7f7f4',coat:1,pants:'#2a2e38',shoes:'#3a2a20',h:1.03},-.01,-.012,0],
   [{skin:'#e3ae8c',hair:'#1e1410',style:'longCurly',hoops:1,top:'#d9c6a0',jacket:'#f7f7f4',coat:1,pants:'#2a2a30',shoes:'#222',h:.96},.045,.012,-.6]].forEach(([cfg,x,z,ry])=>{
    const p=makePerson(cfg);p.scale.setScalar(.6);p.position.set(x,.02,z);p.rotation.y=ry;hull.add(p);BOAT.crew.push(p);});
  g.scale.setScalar(2.4);Wd.scene.add(g);BOAT.g=g;BOAT.hull=hull;
  const p0=BOAT.pts[Math.floor(Math.random()*BOAT.pts.length)];BOAT.x=p0[0];BOAT.z=p0[1];
  const c=document.createElement('canvas');c.width=c.height=32;const cx=c.getContext('2d');cx.fillStyle='#fff';cx.beginPath();cx.arc(16,16,14,0,6.3);cx.fill();BOAT.ftex=new THREE.CanvasTexture(c);
  BOAT.lbl=mkLabel('R/V CAVIAHUE<small>Pedro &amp; Sofi sampling</small>','glbl kit');
}
function nextBoatTarget(){for(let k=0;k<60;k++){const p=BOAT.pts[Math.floor(Math.random()*BOAT.pts.length)];const d=Math.hypot(p[0]-BOAT.x,p[1]-BOAT.z);if(d>.5&&d<7&&clearPath([BOAT.x,BOAT.z],p))return p;}
  let best=null,bd=1e9;BOAT.pts.forEach(p=>{const d=Math.hypot(p[0]-BOAT.x,p[1]-BOAT.z);if(d>.3&&d<bd&&clearPath([BOAT.x,BOAT.z],p)){bd=d;best=p;}});return best;}
function updateBoat(dt,t){
  if(!BOAT.g)return;const y=lakeY();
  if(BOAT.st==='move'){if(!BOAT.tgt){BOAT.tgt=nextBoatTarget();if(!BOAT.tgt){BOAT.st='sample';BOAT.wait=3;}}
    if(BOAT.tgt){const dx=BOAT.tgt[0]-BOAT.x,dz=BOAT.tgt[1]-BOAT.z,d=Math.hypot(dx,dz);const want=Math.atan2(-dz,dx);BOAT.yaw=angLerp(BOAT.yaw,want,Math.min(1,dt*1.6));
      BOAT.acc=Math.min(.75,(BOAT.acc||0)+dt*.5);BOAT.sp=BOAT.acc*(d<.4?Math.max(.3,d/.4):1);const nx=BOAT.x+Math.cos(BOAT.yaw)*BOAT.sp*dt,nz=BOAT.z-Math.sin(BOAT.yaw)*BOAT.sp*dt;
      if(inWater(nx,nz,.02)){BOAT.x=nx;BOAT.z=nz;}else{BOAT.tgt=null;BOAT.acc*=.5;}
      if(d<.1){BOAT.acc=0;BOAT.st='sample';BOAT.wait=7+Math.random()*4;BOAT.tgt=null;}
      BOAT.ft-=dt;if(BOAT.ft<=0&&BOAT.sp>.15){BOAT.ft=.12;const m=new THREE.Sprite(new THREE.SpriteMaterial({map:BOAT.ftex,transparent:true,opacity:.8,depthWrite:false}));
        m.position.set(BOAT.x-Math.cos(BOAT.yaw)*.24,y+.01,BOAT.z+Math.sin(BOAT.yaw)*.24);m.scale.setScalar(.06);Wd.scene.add(m);BOAT.foam.push({m,t:0});}}}
  else{BOAT.sp=Math.max(0,BOAT.sp-dt*.8);BOAT.wait-=dt;if(BOAT.wait<=0)BOAT.st='move';}
  // foam
  for(let i=BOAT.foam.length-1;i>=0;i--){const f=BOAT.foam[i];f.t+=dt;if(f.v){f.m.position.x+=f.v[0]*dt;f.m.position.y+=f.v[1]*dt;f.m.position.z+=f.v[2]*dt;f.v[1]-=2.5*dt;}f.m.scale.setScalar(.06+f.t*.12);f.m.material.opacity=.8*(1-f.t/1.6);if(f.t>1.6){Wd.scene.remove(f.m);f.m.material.dispose();BOAT.foam.splice(i,1);}}
  // pose: bobbing, Niskin bottle lowered while sampling
  BOAT.g.position.set(BOAT.x,y+Math.sin(t*2.2)*.006,BOAT.z);BOAT.g.rotation.set(Math.sin(t*1.7)*.05,BOAT.yaw,Math.sin(t*2.3)*.03+BOAT.sp*.08);
  const depth=BOAT.st==='sample'?clamp(Math.min(7-BOAT.wait,BOAT.wait)*.02,0,.06):0;BOAT.niskin.position.y=.06-depth;BOAT.rope.scale.y=Math.max(.001,.015+depth);
  BOAT.crew.forEach((p,i)=>{const u=p.userData;u.armL.rotation.z=BOAT.st==='sample'&&i===1?-1.2+Math.sin(t*3)*.2:Math.sin(t*1.5+i)*.1;u.armR.rotation.z=BOAT.st==='sample'&&i===0?-.8+Math.sin(t*2.5)*.3:0;});
  const d=Math.hypot(pl.x-BOAT.x,pl.z-BOAT.z);projectLabel(BOAT.lbl,BOAT.x,y+.45,BOAT.z,!cam.map&&d<5&&mode==='play');
  BOAT.near=clamp(1-d/3,0,1)*(BOAT.sp/.75);
}

// ------------------------------------------------------------ BATHERS in the acidic river / lake
const BATHERS=[];
const WARN=[
 ph=>`Excuse me! This water is <b>pH ${ph}</b>, about as acidic as lemon juice. It can irritate your skin and eyes!`,
 ph=>`Seriously, it's loaded with sulfuric acid, iron and aluminium from the volcano. Please get out!`,
 ph=>`At least keep your eyes shut underwater… and rinse off with fresh water afterwards!`,
 ph=>`OK… I'll just write this down in the field notebook.`];
const REPLY=[
 ['Acidic?! Nonsense! My grandma swam here every summer and lived to 102!','It\'s MEDICINAL! The volcano cures everything, everybody knows that!','Go take your little bottles somewhere else, we were here first!','Lemon juice? Then it\'s basically a salad. Healthy!'],
 ['Sulfuric what? It just tingles a bit, that\'s how you know it\'s working!','My rash went away! …well, it changed colour, but that counts.','Forty years bathing here. Who are you, the water police?','Iron is good for you! I\'m absorbing vitamins!'],
 ['My eyes only sting for the first hour, then you stop feeling them!','Fresh water is for tourists.','Scientists! Always ruining the fun. Take THIS! *SPLASH*','Rinse? The river IS the rinse.'],
 ['*SPLASH* Keep sampling, we keep bathing!','Put THAT in your metagenome!','Come in, the water\'s great! pH is just a number!','Tell Acidithiobacillus we said hi! *SPLASH*','I\'m going to report YOU to the tourism office!']];
const FACTS=['🔬 Fact: the Río Agrio is born at pH ~1–2 because volcanic SO₂ and HCl dissolve into the springs below the crater.','🔬 Fact: acidic, metal-rich water dissolves skin oils and can cause dermatitis and eye burns. Acidophiles like <i>Acidithiobacillus</i> love it, though.','🔬 Fact: downstream the Río Agrio stays acidic (pH 2–5) for ~40 km before it neutralises.'];
function shallowLakePoint(x,z){const L=Wd.LAKES[0];for(let r=0;r<2;r+=.04)for(let a=0;a<24;a++){const q=a/24*6.283,px=x+Math.cos(q)*r,pz=z+Math.sin(q)*r;const d=Wd.lakeSdf(L,px,pz);if(d<-.04&&d>-.16)return [px,pz];}return null;}
// bathers are their own NPCs (not playable scientists): swimsuits, snorkels, floaties, sun hats
function makeBather(){const f=Math.random()<.5,sw=pick(['#ff2d95','#00e5ff','#ffd23f','#ff4f3a','#7cff4f','#b15cff','#1d3557','#ff7b00']);
  const cfg={f:f?1:0,skin:pick(['#f1d2bc','#e6b494','#d9a585','#c99472','#9a6a48','#7a4a30']),hair:pick(['#141010','#3a2418','#6b4a33','#d8b070','#b8b8b4','#8a3a24']),style:pick(f?['long','longCurly','medium','shortCurly']:['short','shortCurly','medium']),
    top:f?sw:null,pants:sw,shoes:null,h:.92+Math.random()*.14};cfg.shoes=cfg.skin;if(!f)cfg.top=cfg.skin;
  const p=makePerson(cfg);p.userData.anim=p.userData.anim||[];
  if(Math.random()<.5)swimKit(p);else swimBasic(p);
  const r=Math.random();const H=n=>{const h=HEAD_ACC.find(a=>a[0]===n);if(h)h[1](p);};
  if(r<.3)H('Snorkel mask');else if(r<.5)H(pick(['Giant neon shades','Heart sunglasses']));else if(r<.65)H('Backwards baseball cap');else if(r<.75)H('Sombrero');
  if(Math.random()<.35){const b=BODY_ACC.find(a=>a[0]==='Inflatable duck ring');if(b)b[1](p);}
  return p;}
function buildBathers(){
  const spots=[{ll:[-37.8085,-70.918],n:4},{ll:[-37.826,-70.975],n:3},{ll:[-37.8735,-71.043],n:4,lake:true},{ll:[-37.8862,-71.074],n:2}];
  spots.forEach((sp,si)=>{let [x,z]=Wd.P(...sp.ll),ph,water;
    if(sp.lake){const q=shallowLakePoint(x,z);if(!q)return;[x,z]=q;if(M.some(m=>Math.hypot(m.ax-x,m.az-z)<.9)){const q2=shallowLakePoint(x-.9,z+.6);if(q2)[x,z]=q2;}ph=3.1;water=Wd.Y(Wd.LAKES[0].level);}
    else{let best=null,bd=1e9;Wd.RIVERS.forEach(r=>r.P.forEach(q=>{if(q.ph>=4||M.some(m=>Math.hypot(m.ax-q.x,m.az-q.z)<.9))return;const d=Math.hypot(q.x-x,q.z-z);if(d<bd){bd=d;best=q;}}));if(!best)return;x=best.x;z=best.z;ph=best.ph;water=Wd.heightAt(x,z)+.05;}
    const grp={x,z,ph:Math.round(ph*10)/10,water,people:[],stage:0,busy:0,warned:false};
    for(let k=0;k<sp.n;k++){const p=makeBather();
      p.scale.setScalar(1.5);const a=k/sp.n*6.283+Math.random(),r=.07+Math.random()*.1;p.userData.off=[Math.cos(a)*r,Math.sin(a)*r];p.userData.ph=Math.random()*6;p.userData.float=Math.random()<.3;
      Wd.scene.add(p);grp.people.push(p);}
    grp.lbl=mkLabel('🏊 BATHERS<small>pH '+grp.ph+' water!</small>','glbl');grp.bub=mkLabel('','glbl');grp.bub.style.maxWidth='240px';grp.bub.style.whiteSpace='normal';grp.bub.style.font="700 15px 'Comic Neue',sans-serif";grp.bub.style.background='#fff';grp.bub.style.display='none';grp.bubT=0;
    BATHERS.push(grp);});
}
function talkBathers(g){
  if(g.busy>0)return;const k=Math.min(g.stage,WARN.length-1);
  toast('<b>YOU:</b> '+WARN[k](g.ph),false,7000);AU.sfx.voice(7,CHARS[charIdx].f?220:140);g.busy=6;
  setTimeout(()=>{const pool=REPLY[Math.min(g.stage,REPLY.length-1)];const line=pool[Math.floor(Math.random()*pool.length)];
    g.bub.innerHTML='😠 '+esc(line).replace(/\*([^*]+)\*/g,'<b>$1</b>');g.bubT=10;AU.sfx.voice(10,190+Math.random()*80);
    if(/SPLASH/.test(line)||g.stage>=2){splashAt(g);}
    if(!g.warned){g.warned=true;S.score+=10;setTimeout(()=>toast(FACTS[Math.floor(Math.random()*FACTS.length)]+' <b>+10 outreach</b>',false,9000),6500);}
    g.stage++;},1500);
}
function splashAt(g){AU.sfx.splash();if(!BOAT.ftex)return;for(let i=0;i<14;i++){const m=new THREE.Sprite(new THREE.SpriteMaterial({map:BOAT.ftex,color:0xbfe9ff,transparent:true,opacity:.9,depthWrite:false}));
  m.position.set(g.x,g.water+.05,g.z);m.scale.setScalar(.035);Wd.scene.add(m);const dx=pl.x-g.x,dz=pl.z-g.z,d=Math.hypot(dx,dz)||1;
  BOAT.foam.push({m,t:0,v:[dx/d*(.6+Math.random()*.5)+(Math.random()-.5)*.3,.8+Math.random()*.5,dz/d*(.6+Math.random()*.5)+(Math.random()-.5)*.3]});}
  setTimeout(()=>{if(Math.hypot(pl.x-g.x,pl.z-g.z)<1)toast('💦 You got splashed. With pH '+g.ph+' water. Lovely.',true,4000);},4200);}
function updateBathers(dt,t){
  BATHERS.forEach(g=>{g.busy-=dt;
    g.people.forEach(p=>{const u=p.userData;const bob=Math.sin(t*2+u.ph)*.01;p.position.set(g.x+u.off[0],(u.float?g.water-.07:g.water-.16)+bob,g.z+u.off[1]);
      p.rotation.y=Math.atan2(-(pl.z-p.position.z),pl.x-p.position.x)*(g.bubT>0?1:0)+(g.bubT>0?0:t*.2+u.ph);
      const angry=g.bubT>0;u.armL.rotation.z=angry?-2.4+Math.sin(t*14+u.ph)*.4:-.6+Math.sin(t*3+u.ph)*.5;u.armR.rotation.z=angry?-2.4+Math.cos(t*13+u.ph)*.4:-.6+Math.cos(t*3+u.ph)*.5;
      (u.anim||[]).forEach(f=>f(t,false));});
    const d=Math.hypot(pl.x-g.x,pl.z-g.z);projectLabel(g.lbl,g.x,g.water+.55,g.z,!cam.map&&d<5&&mode==='play'&&g.bubT<=0);
    g.bubT-=dt;projectLabel(g.bub,g.x,g.water+.6,g.z,g.bubT>0&&mode==='play');});
}

// ------------------------------------------------------------ EASTER EGGS
const EGGS=[];let eggsFound=[];try{eggsFound=JSON.parse(localStorage.getItem('cfc_eggs')||'[]');}catch(e){}
function buildEggs(){
  const T=Wd.toon,add=(g,geo,col,x,y,z)=>{const m=new THREE.Mesh(geo,T(col));m.position.set(x,y,z);g.add(m);return m;};
  const D=[
   {id:'cuero',near:'lake',ll:[-37.88,-70.995],s:1.6,r:.65,title:'EL CUERO',msg:'🟤 <b>El Cuero (Coo / Ñictatall), "the hide".</b> A creature shaped exactly like a stretched cowhide, floating at the edge of Lake Caviahue. Its rim is lined with sharp claws, and eyes on stalks glow at its corners. Legend says it waits for anyone who comes to drink or swim, wraps them up and drags them to the bottom. <i>Maybe that\'s the real reason to stay out of the water…</i>',
    mk:g=>{const segs=[];for(let k=0;k<5;k++){const sg=new THREE.Group();sg.position.x=(k-2)*.032;g.add(sg);add(sg,new THREE.BoxGeometry(.034,.004,.1),k%2?'#7a4a2a':'#8a5a33',0,0,0);
        [-1,1].forEach(s=>{for(let j=0;j<2;j++){const c=add(sg,new THREE.ConeGeometry(.004,.014,5),'#f4efe3',(j-.5)*.016,0,.054*s);c.rotation.x=s*Math.PI/2;}});segs.push(sg);}
      [[-.08,-.05],[-.08,.05],[.08,-.05],[.08,.05]].forEach(p=>{add(g,new THREE.CylinderGeometry(.002,.002,.02,4),'#5a3a24',p[0],.01,p[1]);const e=new THREE.Mesh(new THREE.SphereGeometry(.005,6,5),new THREE.MeshBasicMaterial({color:0xff3030}));e.position.set(p[0],.022,p[1]);g.add(e);});
      g.userData.segs=segs;}},
   {id:'ucumar',ll:[-37.838,-71.128],s:2.2,r:.6,title:'THE UCUMAR',msg:'👣 <b>Huge footprints in the mud… and something big behind the trees.</b> The <b>Ucumar</b> (or Jucumari): a giant half-man, half-bear covered in dark reddish hair, said to live in the densest forests and darkest ravines of the cordillera. It walks on two legs, leaves only enormous tracks, and is blamed for carrying off lonely travellers and livestock to its caves.',
    mk:g=>{const Q=Wd.Q,I=new THREE.Group();I.scale.setScalar(.095);g.add(I);const fur='#4a2a1c',fur2='#6b3a22',face='#8a6a55';  // lofted, faceted giant (~2.3 m)
      I.add(Q.loft([[0,.9,.2,.16],[0,1.15,.3,.22],[.02,1.5,.36,.26],[.03,1.8,.34,.25],[.02,1.98,.22,.18]],9,fur));
      for(let k=0;k<22;k++){const a=k*2.4,y=1.0+(k%7)*.14;const m=new THREE.Mesh(new THREE.ConeGeometry(.06,.18,4),Q.fm(k%2?fur:fur2));m.position.set(Math.cos(a)*.3*(y>1.7?.85:1)-.02,y,Math.sin(a)*.24);m.rotation.set(Math.sin(a)*1.2,0,-Math.cos(a)*1.2+.4);I.add(m);}
      I.add(Q.loft([[.02,2.0,.17,.15],[.05,2.15,.2,.17],[.06,2.3,.16,.14],[.04,2.38,.08,.08]],8,fur2));
      I.add(Q.loft([[.15,2.12,.07,.09],[.23,2.1,.06,.07],[.26,2.06,.03,.04]],6,face));
      [-1,1].forEach(s2=>{I.add(Q.leg(0,1.85,.3*s2,[[0,0,.1],[.05,-.35,.08],[.12,-.7,.07],[.16,-.85,.08]],fur));I.add(Q.leg(0,.95,.13*s2,[[0,0,.13],[0,-.45,.1],[.03,-.85,.09],[.12,-.93,.08]],fur2));
        const e=new THREE.Mesh(new THREE.SphereGeometry(.028,6,5),new THREE.MeshBasicMaterial({color:0xffd23f}));e.position.set(.2,2.18,.07*s2);I.add(e);});
      for(let k=0;k<8;k++){const f=add(g,new THREE.CylinderGeometry(.016,.016,.002,8),'#2b1d16',.07+k*.055,.002,(k%2?.02:-.02));f.scale.set(1.5,1,.9);}}},
   {id:'pillan',ll:[-37.8525,-71.1655],s:2.2,r:.55,title:'PILLÁN',msg:'⚡ <b>A pehuén split in two and still smouldering.</b> The work of <b>Pillán</b>, the great ancestral spirit of thunder, lightning, earthquakes and eruptions. When Copahue roars and spits ash and sulfur, the old people said Pillán was angry, or that the spirits of the earth were fighting deep below. Lightning is his weapon against the ancient trees.',
    mk:g=>{[-1,1].forEach(s=>{const t=add(g,new THREE.CylinderGeometry(.006,.012,.2,6),'#2a1f1a',0,.1,.008*s);t.rotation.x=.35*s;});
      for(let k=0;k<8;k++){const e=new THREE.Mesh(new THREE.SphereGeometry(.004,5,4),new THREE.MeshBasicMaterial({color:k%2?0xff7b00:0xffd23f}));e.position.set((Math.random()-.5)*.05,.01+Math.random()*.03,(Math.random()-.5)*.05);g.add(e);}
      const bolt=new THREE.Group();const pts=[[0,.6],[.03,.45],[-.02,.35],[.025,.22],[0,.1]];for(let k=0;k<pts.length-1;k++){const a=pts[k],b=pts[k+1];const L=Math.hypot(b[0]-a[0],b[1]-a[1]);
        const m=new THREE.Mesh(new THREE.BoxGeometry(.008,L,.008),new THREE.MeshBasicMaterial({color:0xfff6a0}));m.position.set((a[0]+b[0])/2,(a[1]+b[1])/2,0);m.rotation.z=Math.atan2(b[0]-a[0],a[1]-b[1]);bolt.add(m);}
      bolt.visible=false;g.add(bolt);g.userData.bolt=bolt;}},
   {id:'pirepillan',ll:[-37.8235,-71.104],s:2.2,r:.55,title:'PIREPILLÁN',msg:'❄️ <b>A shimmering figure made of snow, floating above the steaming ground.</b> <b>Pirepillán</b>, the spirit of the snow who lived on the heights. The mighty cacique <b>Copahue</b> climbed the mountain for her love, facing dangers and beasts. The gods (or an enemy tribe) punished their romance and unleashed the mountain\'s fury: Pirepillán\'s body became the <b>healing hot springs</b>, and Copahue\'s rage still smokes inside the volcano.',
    mk:g=>{const Q=Wd.Q,I=new THREE.Group();I.scale.setScalar(.075);g.add(I);const ice=new THREE.MeshToonMaterial({color:0xdff4ff,gradientMap:Wd.gradTex,transparent:true,opacity:.78,depthWrite:false}),glow=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.9});
      const P=(S,seg,m)=>{const o=Q.loft(S,seg,'#dff4ff');o.material=m||ice;I.add(o);return o;};
      P([[0,.2,.5,.5],[0,.6,.34,.34],[0,1.0,.2,.18],[0,1.3,.14,.12],[0,1.5,.1,.09]],12);            // flowing gown
      {const face=new THREE.MeshToonMaterial({color:0xf4fbff,gradientMap:Wd.gradTex});P([[0,1.5,.07,.07],[0,1.56,.13,.12],[0,1.72,.15,.13],[0,1.88,.12,.11],[0,1.97,.05,.05]],12,face);   // head (opaque so it reads)
        [-1,1].forEach(s2=>{const e=new THREE.Mesh(new THREE.SphereGeometry(.022,8,6),new THREE.MeshBasicMaterial({color:0x3a86ff}));e.position.set(.13,1.74,.05*s2);I.add(e);});
        const lip=new THREE.Mesh(new THREE.BoxGeometry(.01,.012,.05),new THREE.MeshBasicMaterial({color:0x8fb8e8}));lip.position.set(.14,1.63,0);I.add(lip);}
      P([[-.08,1.92,.12,.12],[-.16,1.62,.12,.14],[-.22,1.2,.11,.15],[-.26,.8,.05,.09]],8,new THREE.MeshToonMaterial({color:0xbfe9ff,gradientMap:Wd.gradTex,transparent:true,opacity:.85}));   // long hair
      [-1,1].forEach(s2=>P([[0,1.38,.05,.05,.12*s2],[.2,1.2,.04,.04,.3*s2],[.35,1.25,.03,.03,.45*s2]],6));
      const crown=new THREE.Group();crown.position.set(0,1.95,0);I.add(crown);for(let k=0;k<7;k++){const c=new THREE.Mesh(new THREE.ConeGeometry(.025,.16,4),glow);const a=k/7*Math.PI*2;c.position.set(Math.cos(a)*.1,.06,Math.sin(a)*.09);crown.add(c);}
      const hem=new THREE.Mesh(new THREE.RingGeometry(.35,.62,24),new THREE.MeshBasicMaterial({color:0xbfe9ff,transparent:true,opacity:.35,side:THREE.DoubleSide,depthWrite:false}));hem.rotation.x=-Math.PI/2;hem.position.y=.05;I.add(hem);
      for(let k=0;k<14;k++){const f=new THREE.Mesh(new THREE.OctahedronGeometry(.006,0),new THREE.MeshBasicMaterial({color:0xffffff}));f.userData.a=k/14*6.283;f.userData.r=.05+Math.random()*.03;f.userData.h=.04+Math.random()*.14;g.add(f);(g.userData.flakes=g.userData.flakes||[]).push(f);}}},
   {id:'pehuen',ll:[-37.8735,-71.083],s:2.4,r:.55,title:'THE FIRST PIÑONES',msg:'🌲 <b>A giant, ancient pehuén with a small fire roasting piñones.</b> The Pehuenche once believed the seeds of the araucaria were poisonous. In a brutal winter, when snow covered everything and people were starving, <b>Nguenechen</b> (or a wise elder he sent) appeared to young people lost in the forest and taught them to gather the piñones, <b>toast and boil them</b>. Since then the tree is sacred, and it gave its name to the people: <b>Pehuenche, "people of the pehuén"</b>.',
    mk:g=>{add(g,new THREE.CylinderGeometry(.012,.022,.42,8),'#8a7a6a',0,.21,0);[.42,.37,.32].forEach((y,k)=>{const c=add(g,new THREE.ConeGeometry(.1-k*.018,.035,10),'#2d6a3e',0,y,0);c.rotation.x=Math.PI;});
      add(g,new THREE.SphereGeometry(.07,10,6,0,Math.PI*2,0,Math.PI/2),'#3a7a48',0,.44,0).scale.set(1,.35,1);
      for(let k=0;k<3;k++)add(g,new THREE.CylinderGeometry(.002,.002,.03,4),'#5b3b24',.07+Math.cos(k*2)*.008,.006,.04+Math.sin(k*2)*.008).rotation.z=1.2;
      const fire=new THREE.Mesh(new THREE.ConeGeometry(.008,.02,6),new THREE.MeshBasicMaterial({color:0xff7b00}));fire.position.set(.07,.014,.04);g.add(fire);g.userData.fire=fire;
      add(g,new THREE.CylinderGeometry(.012,.009,.014,10),'#1d1a2b',.07,.032,.04);for(let k=0;k<7;k++)add(g,new THREE.CapsuleGeometry?new THREE.CapsuleGeometry(.0025,.006,3,5):new THREE.SphereGeometry(.003,5,4),'#a0522d',.035+Math.random()*.02,.004,-.02+Math.random()*.02).rotation.z=1.5;}},
   {id:'pihuchen',ll:[-37.8095,-71.1755],lift:.9,s:2.2,r:.7,title:'PIHUCHÉN',msg:'🐍 <b>A winged serpent circling the corral… but it won\'t come close.</b> The <b>Pihuchén</b> (Pihuchao) is a nocturnal monster, half snake, half bird, whose cry terrifies the puesteros. It feeds on blood, of sheep, cattle or unprotected people. That\'s why herders keep <b>billy goats</b> with their flocks: the smell and strength of goat blood is said to scare the Pihuchén away. Look at it keep its distance from these goats!',
    mk:g=>{const s=new THREE.Group();g.add(s);g.userData.snake=s;const body=[];for(let k=0;k<9;k++){const b=add(s,new THREE.SphereGeometry(.013-k*.001,8,6),k%2?'#2e5e4e':'#1f4a3c',-k*.02,0,0);body.push(b);}g.userData.body=body;
      [-1,1].forEach(sd=>{const w=new THREE.Group();w.position.set(-.02,.005,.012*sd);s.add(w);const wm=add(w,new THREE.BoxGeometry(.05,.002,.07),'#3a2a3a',0,0,.035*sd);(g.userData.wings=g.userData.wings||[]).push([w,sd]);});
      [-1,1].forEach(sd=>{const e=new THREE.Mesh(new THREE.SphereGeometry(.003,5,4),new THREE.MeshBasicMaterial({color:0xff2020}));e.position.set(.01,.006,.006*sd);s.add(e);});}},
  ];
  D.forEach(d=>{let [x,z]=Wd.P(...d.ll);if(d.near==='lake'){const q=shallowLakePoint(x,z);if(q)[x,z]=q;d.lift='lake';}const g=new THREE.Group();d.mk(g);g.scale.setScalar(d.s*1.35);  // legends a bit larger so they read at eye level
    let y=d.lift==='lake'?Wd.Y(Wd.LAKES[0].level)+.004:Wd.heightAt(x,z)+(typeof d.lift==='number'?d.lift:0);const rot=Math.random()*6.28;g.position.set(x,y,z);g.rotation.y=rot;Wd.scene.add(g);
    EGGS.push(Object.assign({},d,{x,z,y,g,rot}));});
  eggsFound=eggsFound.filter(id=>EGGS.some(e=>e.id===id));
}
function eggHere(){if(pl.inTruck)return null;return EGGS.find(e=>Math.hypot(pl.x-e.x,pl.z-e.z)<(e.r||.55))||null;}
function findEgg(e){
  const first=!eggsFound.includes(e.id);openModal({title:e.title||'LEGEND',meta:'Legends of Caviahue–Copahue · as told in the region',col:'#b15cff',html:`<p style="font-size:15px;line-height:1.45">${e.msg}</p><div class="g-row"><button class="g-btn y" id="eg-ok">KEEP EXPLORING ➜</button></div>`,init(){$('#eg-ok').onclick=closeModal;}});
  if(first){eggsFound.push(e.id);try{localStorage.setItem('cfc_eggs',JSON.stringify(eggsFound));}catch(x){}S.score+=50;save();
    setTimeout(()=>{stamp('LEGEND FOUND!',`${eggsFound.length} / ${EGGS.length} · +50`);AU.sfx.tada();},400);
    if(eggsFound.length===EGGS.length)setTimeout(()=>toast('🏆 <b>You found ALL the legends of Caviahue–Copahue!</b> The Pehuenche storytellers would be proud.',false,5000),2600);}
  else AU.sfx.voice(4,260);
}
function updateEggs(dt,t){EGGS.forEach(e=>{const u=e.g.userData;
  if(e.id==='cuero'){e.g.position.y=e.y+Math.sin(t*1.3)*.004;(u.segs||[]).forEach((sg,k)=>{sg.rotation.x=Math.sin(t*2+k*.8)*.12;sg.position.y=Math.sin(t*2+k*.8)*.004;});}
  if(e.id==='ucumar'){e.g.rotation.y=e.rot+Math.sin(t*.5)*.3;}
  if(e.id==='pillan'&&u.bolt){const ph=(t%6);u.bolt.visible=ph<.12||(ph>.2&&ph<.28);}
  if(e.id==='pirepillan'){e.g.position.y=e.y+.03+Math.sin(t*1.1)*.02;(u.flakes||[]).forEach(f=>{const a=f.userData.a+t*.6;f.position.set(Math.cos(a)*f.userData.r,f.userData.h+Math.sin(t*2+a)*.01,Math.sin(a)*f.userData.r);f.rotation.y=t*2;});}
  if(e.id==='pehuen'&&u.fire){u.fire.scale.set(1,1+Math.sin(t*17)*.25,1);}
  if(e.id==='pihuchen'&&u.snake){const a=t*.7;u.snake.position.set(Math.cos(a)*.22,.1+Math.sin(t*1.5)*.03,Math.sin(a)*.22);u.snake.rotation.y=-a-Math.PI/2;(u.body||[]).forEach((b,k)=>{b.position.z=Math.sin(t*6-k*.7)*.008;});(u.wings||[]).forEach(([w,sd])=>{w.rotation.x=sd*Math.sin(t*9)*.6;});}
});}

// ------------------------------------------------------------ PEHUENCHE COMMUNITY: storytellers + Nehuen
const TELLERS=[];let NEHUEN=null;
const STORIES={
 machi:[['The origin of Copahue and the hot springs','Long ago there was a powerful and feared cacique called <b>Copahue</b>. He fell in love with <b>Pirepillán</b>, the spirit of the snow, whose home was high on the mountain. He climbed to find her, facing dangers and beasts, and they loved each other for a long time. But the gods, or an enemy tribe, punished them and unleashed the fury of the mountain. Pirepillán\'s body became the <b>healing waters</b> of the termas, and Copahue\'s cries and rage live forever in the <b>smoking heart of the volcano</b>.'],
        ['Pillán, the force of the volcano','Above all spirits of this land stands <b>Pillán</b>, an ancestral spirit of thunder, lightning, earthquakes and eruptions. When Copahue roars and throws ash and sulfur, it means Pillán is angry, or the spirits of the earth are fighting great battles below. His weapons are the lightning bolts that split the ancient trees. That is why we treat the mountain with respect.']],
 lonko:[['The gift of the pehuén','Our grandparents\' grandparents thought the <b>piñones</b> of the pehuén were poison. Then came a winter without end: snow covered everything and the people were dying of hunger. <b>Nguenechen</b>, or a wise old man he sent, appeared to some young people lost in the forest and taught them to gather the piñones, <b>toast them and boil them</b>. They lived. Since then the pehuén is sacred, and we are the <b>Pehuenche, the people of the pehuén</b>.'],
        ['The Pihuchén and the billy goats','At night, listen: if you hear a terrible cry, it may be the <b>Pihuchén</b>, a flying serpent, half bird, that drinks the blood of sheep, cattle, and careless people. You follow it by the drops of blood it leaves. That is why every herder keeps <b>billy goats</b> with the flock: their blood smells so strong that the Pihuchén will not come near. Look at our corral, you will see.']],
 weaver:[['El Cuero of the lakes','Never swim alone in the cold lakes, like <b>Caviahue</b>. There lives <b>El Cuero</b>, a creature shaped exactly like a stretched cowhide. Its edges are full of sharp claws, and at its corners it has dark eyes that shine like a snail\'s. It waits quietly at the shore until an animal or a person comes to drink or swim. Then it wraps them, drags them to the bottom, and only the dry skin floats back up.'],
        ['The Ucumar of the ravines','In the thickest forests and darkest ravines lives the <b>Ucumar</b>, a giant, half man and half bear, covered in dark or reddish hair. It walks on two legs, and all it leaves are huge footprints in the mud or the snow. It is shy, but they say it sometimes carries off animals, or people who walk alone, to its caves deep in the hills. So when you sample in the forest, go together!']]};
function makeMapuche(kind){
  const T=Wd.toon;let cfg,g;
  if(kind==='machi')cfg={skin:'#b98460',hair:'#141010',style:'long',top:'#15121a',jacket:'#15121a',coat:1,pants:'#15121a',shoes:'#2a1f1a',h:1};
  else if(kind==='lonko')cfg={skin:'#a8744f',hair:'#1a1414',style:'medium',top:'#e9e4d4',pants:'#2a2a2e',shoes:'#3a2a20',h:1.04};
  else cfg={skin:'#b07a55',hair:'#1a1212',style:'long',top:'#15121a',jacket:'#15121a',coat:1,pants:'#15121a',shoes:'#2a1f1a',h:.97,hoops:1};
  g=makePerson(cfg);const u=g.userData;const A=(geo,col,x,y,z,p=g)=>{const m=new THREE.Mesh(geo,T(col));m.position.set(x,y,z);p.add(m);return m;};
  // trarilonko (headband) with silver coins
  A(new THREE.CylinderGeometry(.0205,.0205,.004,14),kind==='lonko'?'#c1121f':'#c9ccd3',-.002,.183,0);
  if(kind!=='lonko')for(let k=0;k<5;k++)A(new THREE.CylinderGeometry(.003,.003,.001,8),'#e8eaf0',.019,.183-(k%2)*.004,-.01+k*.005).rotation.z=Math.PI/2;
  if(kind==='lonko'){ // makuñ poncho with geometric stripes
    A(new THREE.BoxGeometry(.05,.05,.06),'#1d1a22',0,.125,0);[['#c1121f',.13],['#f4f0e6',.115],['#c1121f',.1]].forEach(([c,y])=>A(new THREE.BoxGeometry(.052,.006,.062),c,0,y,0));
    for(let k=0;k<3;k++)A(new THREE.BoxGeometry(.0525,.004,.006),'#f4f0e6',0,.108,-.018+k*.018);}
  else{ // ikülla shawl + trapelacucha silver pectoral + trarihue sash
    A(new THREE.BoxGeometry(.044,.02,.05),kind==='machi'?'#3a2a6b':'#8a1c2b',-.002,.142,0);
    A(new THREE.BoxGeometry(.036,.004,.044),'#c1121f',0,.1,0);
    for(let k=0;k<4;k++)A(new THREE.BoxGeometry(.003,.006,.012-k*.002),'#dfe3ea',.021,.14-k*.009,0);}
  if(kind==='machi'){ // kultrun drum
    const dr=new THREE.Group();dr.position.set(.012,-.05,-.004);u.armR.add(dr);A(new THREE.CylinderGeometry(.018,.012,.01,14),'#a0522d',0,0,0,dr);
    const sk=A(new THREE.CylinderGeometry(.018,.018,.002,14),'#f4e8cf',0,.006,0,dr);[0,Math.PI/2].forEach(r=>{const l=A(new THREE.BoxGeometry(.034,.0022,.002),'#3a86ff',0,.0072,0,dr);l.rotation.y=r;});
    u.armR.rotation.z=-.9;u.drum=dr;}
  if(kind==='weaver'){ // small loom
    const lm=new THREE.Group();g.add(lm);lm.position.set(.07,0,0);A(new THREE.BoxGeometry(.004,.08,.004),'#8a5a33',0,.04,-.025,lm);A(new THREE.BoxGeometry(.004,.08,.004),'#8a5a33',0,.04,.025,lm);
    A(new THREE.BoxGeometry(.004,.004,.054),'#8a5a33',0,.08,0,lm);['#c1121f','#1d1a22','#f4f0e6','#c1121f'].forEach((c,k)=>A(new THREE.BoxGeometry(.002,.012,.046),c,0,.02+k*.014,0,lm));}
  g.scale.setScalar(1.7*(cfg.h||1));return g;
}
function makeNehuen(){
  const T=Wd.toon,g=new THREE.Group(),blk='#141414',A=(geo,col,x,y,z,p=g)=>{const m=new THREE.Mesh(geo,T(col));m.position.set(x,y,z);p.add(m);return m;};
  const body=A(new THREE.CapsuleGeometry?new THREE.CapsuleGeometry(.03,.07,6,10):new THREE.CylinderGeometry(.03,.03,.12,10),blk,0,.075,0);body.rotation.z=Math.PI/2;
  const head=new THREE.Group();head.position.set(.075,.11,0);g.add(head);A(new THREE.SphereGeometry(.026,10,8),blk,0,0,0,head);A(new THREE.BoxGeometry(.03,.02,.024),blk,.026,-.008,0,head);
  A(new THREE.SphereGeometry(.006,6,5),'#2b2b2b',.042,-.004,0,head);[-1,1].forEach(s=>{A(new THREE.SphereGeometry(.0035,5,4),'#5a3a24',.018,.008,.011*s,head);const e=A(new THREE.BoxGeometry(.012,.028,.006),'#0a0a0a',-.004,-.01,.024*s,head);e.rotation.x=.2*s;});
  const tongue=A(new THREE.BoxGeometry(.012,.002,.008),'#ff7aa0',.032,-.02,0,head);g.userData.tongue=tongue;
  A(new THREE.CylinderGeometry(.021,.021,.008,10),'#c1121f',.058,.095,0).rotation.z=Math.PI/2;
  const legs=[];[[.04,.018],[.04,-.018],[-.04,.018],[-.04,-.018]].forEach(p=>{const l=A(new THREE.CylinderGeometry(.009,.008,.055,6).translate(0,-.0275,0),blk,p[0],.055,p[1]);legs.push(l);});
  const tail=new THREE.Group();tail.position.set(-.07,.09,0);g.add(tail);A(new THREE.CylinderGeometry(.006,.004,.05,6).translate(0,.025,0),blk,0,0,0,tail);tail.rotation.z=-1;
  g.userData={head,legs,tail,tongue};g.scale.setScalar(2.4);return g;
}
function buildVillage(){
  const c=Wd.P(-37.8105,-71.1795);
  [['machi',.1,.06,'Machi Ayelén','machi (healer)'],['lonko',-.12,.12,'Lonko Antümalen','lonko (elder)'],['weaver',.02,-.17,'Rayen','weaver']].forEach(([k,dx,dz,nm,role],i)=>{
    const g=makeMapuche(k);const x=c[0]+dx,z=c[1]+dz;g.position.set(x,Wd.heightAt(x,z),z);Wd.scene.add(g);
    TELLERS.push({kind:k,name:nm,role,g,x,z,idx:0,lbl:mkLabel(`${nm.toUpperCase()}<small>${role} · stories</small>`,'glbl')});});
  const d=makeNehuen();const nx=c[0]+.42,nz=c[1]+.22;d.position.set(nx,Wd.heightAt(nx,nz),nz);Wd.scene.add(d);
  NEHUEN={g:d,x:nx,z:nz,yaw:0,hx:nx,hz:nz,st:'idle',t:0,hearts:[],lbl:mkLabel('NEHUEN<small>very good boy · 🐾</small>','glbl'),pets:0};
  const vl=mkLabel('PEHUENCHE COMMUNITY<small>listen to the elders\' stories</small>','glbl kit');TELLERS.village={lbl:vl,x:c[0],z:c[1]};
}
function openStories(T){
  const list=STORIES[T.kind];const [ttl,txt]=list[T.idx%list.length];T.idx++;AU.sfx.voice(10,T.kind==='lonko'?120:200);
  openModal({title:ttl.toUpperCase(),meta:`${T.name} · ${T.role} · Pehuenche community`,col:'#c1121f',html:`<p style="font-size:15.5px;line-height:1.5">“${txt}”</p>
    <p class="note">A legend of the Caviahue–Copahue region, as told locally. Each storyteller knows ${list.length} stories; talk to them again to hear the next one.</p>
    <div class="g-row"><button class="g-btn y" id="st-ok">MAÑUM (THANK YOU) ➜</button>${T.idx%list.length?'<button class="g-btn" id="st-next">NEXT STORY</button>':''}</div>`,
    init(){$('#st-ok').onclick=closeModal;const n=$('#st-next');if(n)n.onclick=()=>{closeModal();setTimeout(()=>openStories(T),50);};}});
  if(!T.told){T.told=true;S.score+=15;}
}
function petNehuen(){const N=NEHUEN;N.pets++;if(!S.petted){S.petted=true;save();}N.st='happy';N.t=2.5;AU.sfx.voice(3,420);setTimeout(()=>AU.animal('dog'),200);
  for(let k=0;k<6;k++){const h=mkLabel('❤️','');h.style.cssText='position:absolute;left:0;top:0;font-size:22px;pointer-events:none';N.hearts.push({el:h,t:0,dx:(Math.random()-.5)*.2,dz:(Math.random()-.5)*.2});}
  const L=['Nehuen rolls over for belly rubs. His tail is a blur.','Nehuen ("strength" in Mapudungun) leans his whole giant body on you. You almost fall over.','Nehuen gives you a very wet kiss and brings you a stick the size of a pehuén branch.','Nehuen sniffs your jerrycan, approves, and wags so hard his back legs dance.','Nehuen sits politely, offers his paw, and gets a second belly rub. He knows the rules.'];
  toast('🐾 '+L[(N.pets-1)%L.length],false,3200);}
function updateVillage(dt,t){
  if(!NEHUEN)return;
  TELLERS.forEach(T=>{const d=Math.hypot(pl.x-T.x,pl.z-T.z);if(d<2){T.g.rotation.y=angLerp(T.g.rotation.y,Math.atan2(-(pl.z-T.z),pl.x-T.x),Math.min(1,dt*3));}
    const u=T.g.userData;if(u.drum)u.armR.rotation.z=-.9+Math.sin(t*6)*.12;u.armL.rotation.z=d<1.2?Math.sin(t*2)*.3:0;
    projectLabel(T.lbl,T.x,T.g.position.y+.42,T.z,!cam.map&&d<3.5&&mode==='play');});
  projectLabel(TELLERS.village.lbl,TELLERS.village.x,Wd.heightAt(TELLERS.village.x,TELLERS.village.z)+.8,TELLERS.village.z,!cam.map&&mode==='play'&&Math.hypot(pl.x-TELLERS.village.x,pl.z-TELLERS.village.z)<9&&Math.hypot(pl.x-TELLERS.village.x,pl.z-TELLERS.village.z)>1.2);
  const N=NEHUEN,u=N.g.userData;const dP=Math.hypot(pl.x-N.x,pl.z-N.z);N.t-=dt;
  let tx=N.hx,tz=N.hz,sp=0;
  if(!pl.inTruck&&dP<1.8&&Math.hypot(pl.x-N.hx,pl.z-N.hz)<2.5){tx=pl.x+Math.sin(pl.yaw)*.3;tz=pl.z+Math.cos(pl.yaw)*.3;}   // trot over to say hi
  const dT=Math.hypot(tx-N.x,tz-N.z);if(dT>.12&&N.st!=='happy'){sp=Math.min(.7,dT*1.5);N.yaw=angLerp(N.yaw,Math.atan2(-(tz-N.z),tx-N.x),Math.min(1,dt*6));N.x+=Math.cos(N.yaw)*sp*dt;N.z-=Math.sin(N.yaw)*sp*dt;}
  if(N.st==='happy'&&N.t<=0)N.st='idle';
  N.g.position.set(N.x,Wd.heightAt(N.x,N.z)+(N.st==='happy'?Math.abs(Math.sin(t*10))*.02:0),N.z);N.g.rotation.y=N.yaw;
  u.tail.rotation.x=Math.sin(t*(N.st==='happy'||dP<1.5?22:6))*(N.st==='happy'?.9:.5);u.legs.forEach((l,k)=>l.rotation.z=sp>0?Math.sin(t*14+k*Math.PI*(k%2?1:0)+(k>1?Math.PI:0))*.6:0);
  u.tongue.visible=dP<2||N.st==='happy';u.head.rotation.z=N.st==='happy'?Math.sin(t*8)*.2:Math.sin(t*1.3)*.05;
  projectLabel(N.lbl,N.x,N.g.position.y+.4,N.z,!cam.map&&dP<3&&mode==='play'&&N.st!=='happy');
  for(let i=N.hearts.length-1;i>=0;i--){const h=N.hearts[i];h.t+=dt;projectLabel(h.el,N.x+h.dx,N.g.position.y+.3+h.t*.35,N.z+h.dz,true);h.el.style.opacity=1-h.t/1.6;if(h.t>1.6){h.el.remove();N.hearts.splice(i,1);}}
}

// ------------------------------------------------------------ DAY / NIGHT + WEATHER
const WX={tod:8,day:1,type:null,t:0,dur:0,k:0,next:100+Math.random()*80,cover:0,night:0,parts:null,rain:null,block:false};
const V3=THREE.Vector3;
function lerp3(a,b,t){return [lerp(a[0],b[0],t),lerp(a[1],b[1],t),lerp(a[2],b[2],t)];}
function buildWeather(){
  const N=2600,p=new Float32Array(N*3);for(let i=0;i<N;i++){p[i*3]=(Math.random()-.5)*9;p[i*3+1]=Math.random()*5;p[i*3+2]=(Math.random()-.5)*9;}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));
  WX.parts=new THREE.Points(g,new THREE.PointsMaterial({color:0xffffff,size:.028,transparent:true,opacity:0,depthWrite:false,alphaTest:.3,map:(()=>{const c=document.createElement('canvas');c.width=c.height=32;const x=c.getContext('2d');const gr=x.createRadialGradient(16,16,2,16,16,15);gr.addColorStop(0,'#fff');gr.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=gr;x.fillRect(0,0,32,32);return new THREE.CanvasTexture(c);})()}));WX.parts.frustumCulled=false;Wd.scene.add(WX.parts);
  const M=1400,q=new Float32Array(M*6);for(let i=0;i<M;i++){const x=(Math.random()-.5)*8,y=Math.random()*5,z=(Math.random()-.5)*8;q.set([x,y,z,x-.02,y-.14,z],i*6);}
  const g2=new THREE.BufferGeometry();g2.setAttribute('position',new THREE.BufferAttribute(q,3));
  WX.rain=new THREE.LineSegments(g2,new THREE.LineBasicMaterial({color:0xbfe9ff,transparent:true,opacity:0,depthWrite:false}));WX.rain.frustumCulled=false;Wd.scene.add(WX.rain);
  // truck headlights for the night
  const bmat=new THREE.MeshBasicMaterial({color:0xfff2c0,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});const bm=new THREE.Group();[-1,1].forEach(sd=>{const c=new THREE.Mesh(new THREE.ConeGeometry(.055,.42,16,1,true).rotateZ(Math.PI/2).translate(.29,.035,.024*sd).rotateY(-.06*sd),bmat);bm.add(c);});bm.material=bmat;truck.g.add(bm);WX.beam=bm;
  WX.lamps=[-1,1].map(sd=>{const m=new THREE.Mesh(new THREE.BoxGeometry(.004,.01,.014),new THREE.MeshBasicMaterial({color:0xfff2c0}));m.position.set(.081,.042,.024*sd);const gw=new THREE.Mesh(new THREE.SphereGeometry(.014,10,8),new THREE.MeshBasicMaterial({color:0xfff6d0,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));gw.position.x=.004;m.add(gw);m.userData.glow=gw;truck.g.add(m);return m;});
}
function updateWorldEnv(dt,active){
  if(active){const nightish=WX.tod>=19.5||WX.tod<5.5;WX.tod+=dt*(nightish?.12:.05);if(WX.tod>=24){WX.tod-=24;WX.day++;}}
  const el=Math.sin((WX.tod-6)/12*Math.PI);                         // sun elevation proxy (−1..1)
  const n=clamp(1-(el+.12)/.3,0,1),gold=clamp(1-Math.abs(el-.08)/.16,0,1)*(1-n);WX.night=n;
  let tint=lerp3(lerp3([1,1,1],[1.06,.9,.78],gold),[.6,.64,.84],n);
  let top=lerp3(lerp3([.36,.76,1],[.52,.58,.9],gold),[.12,.15,.32],n),bot=lerp3(lerp3([1,.94,.76],[1,.72,.48],gold),[.22,.22,.38],n);
  // weather events
  if(active){
    if(!WX.type){WX.next-=dt;if(WX.next<=0){const alt=meters(Wd.heightAt(pl.x,pl.z));const snowP=alt>2000?.7:alt>1500?.5:.3;
        WX.type=Math.random()<snowP?'snow':'rain';WX.dur=WX.type==='snow'?30:45+Math.random()*35;WX.t=0;
        toast(WX.type==='snow'?'❄ A snow squall is rolling in from the Andes! For about 30 seconds you won\'t be able to walk or sample. Take shelter in the truck.':'🌧 Rain shower. Keep working, but mind the slippery rocks.',WX.type==='snow',4500);}}
    else{WX.t+=dt;if(WX.t>=WX.dur){if(WX.type==='snow')toast('☀ The squall has passed. Back to work!',false,2500);WX.type=null;WX.next=120+Math.random()*150;}}
  }
  const want=WX.type?(WX.t<5?WX.t/5:WX.t>WX.dur-5?(WX.dur-WX.t)/5:1):0;WX.k+=(want-WX.k)*Math.min(1,dt*2);
  const snow=WX.type==='snow'?WX.k:0,rain=WX.type==='rain'?WX.k:0;WX.snow=snow;WX.rainK=rain;
  WX.cover=clamp(WX.cover+(snow>.5?dt/40:-dt/90),0,1);
  WX.block=WX.type==='snow'&&WX.t>3&&WX.t<WX.dur-3;
  const dim=1-.28*Math.max(snow,rain);tint=tint.map(v=>v*dim);top=lerp3(top,[.7,.72,.78],Math.max(snow,rain)*.8);bot=lerp3(bot,[.8,.82,.86],Math.max(snow,rain)*.8);
  const u=Wd.postMat.uniforms;u.tint.value.set(...tint);u.skyT.value.set(...top);u.skyB.value.set(...bot);u.stars.value=n*(1-Math.max(snow,rain));u.snowK.value=snow*.42+WX.cover*.08;
  {const C=Wd.camera,hG=C.position.y-Wd.heightAt(C.position.x,C.position.z);const tod=WX.tod,morn=tod<5?.3:tod<9.5?1:tod<11.5?1-(tod-9.5)/2:tod>18.5&&tod<22?.45:tod>=22?.3:0;
    u.mistK.value=clamp(Math.max(morn,Math.max(snow,rain)*.7),0,1)*clamp(1-(hG-.6)/2.4,0,1);u.cloudK.value=.5+Math.max(snow,rain)*.4;}
  Wd.sun.intensity=.78*(1-n*.55)*(1-.3*Math.max(snow,rain));
  {const wm=gold*(1-Math.max(snow,rain));Wd.sun.color.setRGB(lerp(1,1,wm)*lerp(1,.62,n),lerp(1,.8,wm)*lerp(1,.72,n),lerp(1,.58,wm)*lerp(1,1,n));Wd.hemi.color.setRGB(1,lerp(.96,.86,wm),lerp(.84,.7,wm));}  // warm dawn/dusk light, cool moonlight
  Wd.hemi.intensity=.5*(1-n*.45);
  {const lum=1-n*.5*(1-.3*Math.max(snow,rain));[...Wd.waterMats,...(Wd.riverMats||[])].forEach(m=>{if(m.uniforms&&m.uniforms.lum)m.uniforms.lum.value=lum;});}  // unlit water and mud dim at night like everything else (they used to glow)
  const sa=(WX.tod-6)/12*Math.PI;Wd.sun.position.set(-40*Math.cos(sa),10+40*Math.max(.15,Math.sin(sa)),16);
  if(WX.beam){WX.beam.material.opacity=n*.3;WX.beam.visible=n>.05;WX.lamps.forEach(m=>{m.material.color.setRGB(1,.95*(n>.3?1:.8),n>.3?.75:.55);m.userData.glow.material.opacity=n*.85;m.userData.glow.visible=n>.05;});}
  if(pl.g&&pl.g.userData.hl){const H=pl.g.userData.hl,on=n>.05&&!pl.inTruck;H.beam.visible=H.glow.visible=on;H.beam.material.opacity=n*.32;H.glow.material.opacity=n*.9;H.bulb.material.color.setRGB(1,1,n>.3?.8:.6);}
  // particles follow the camera target
  const c=Wd.controls.target;
  if(WX.parts){const pm=WX.parts.material;pm.opacity=snow*.95;WX.parts.visible=snow>.02;WX.parts.position.set(c.x,c.y-1.2,c.z);
    if(WX.parts.visible){const a=WX.parts.geometry.attributes.position,arr=a.array;const tt=S.t;for(let i=0;i<arr.length;i+=3){arr[i+1]-=dt*(.45+(i%7)*.05);arr[i]+=dt*(.25+Math.sin(tt+i)*.15);if(arr[i+1]<0){arr[i+1]+=5;}if(arr[i]>4.5)arr[i]-=9;}a.needsUpdate=true;}}
  if(WX.rain){const rm=WX.rain.material;rm.opacity=rain*.7;WX.rain.visible=rain>.02;WX.rain.position.set(c.x,c.y-1.2,c.z);
    if(WX.rain.visible){const a=WX.rain.geometry.attributes.position,arr=a.array;for(let i=0;i<arr.length;i+=6){const dy=dt*(5+(i%5));arr[i+1]-=dy;arr[i+4]-=dy;if(arr[i+4]<0){arr[i+1]+=5;arr[i+4]+=5;}}a.needsUpdate=true;}}
}
function wxHUD(){
  const h=Math.floor(WX.tod),m=Math.floor((WX.tod-h)*60);const ic=WX.night>.6?'🌙':WX.tod<9||WX.tod>17.5?'🌅':'☀';
  let w='';if(WX.type==='snow')w=` · ❄ ${LANG==='es'?'NIEVE':'SNOW'} ${Math.max(0,Math.ceil(WX.dur-WX.t))} s`;else if(WX.type==='rain')w=` · 🌧 ${LANG==='es'?'lluvia':'rain'}`;
  return `${ic} ${LANG==='es'?'Día':'Day'} ${WX.day} · ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}${w}`;
}

function makeKit(){
  const toon=Wd.toon,g=new THREE.Group();
  const tab=new THREE.Mesh(new THREE.BoxGeometry(.07,.006,.05),toon('#c9a45a'));tab.position.y=.035;
  [[-.03,-.02],[.03,-.02],[-.03,.02],[.03,.02]].forEach(p=>{const l=new THREE.Mesh(new THREE.CylinderGeometry(.002,.002,.035,4).translate(0,.0175,0),toon('#5b3b24'));l.position.set(p[0],0,p[1]);g.add(l);});
  const flask=new THREE.Mesh(new THREE.ConeGeometry(.013,.03,10),toon('#bfe9ff'));flask.position.set(.01,.053,0);
  const funnel=new THREE.Mesh(new THREE.CylinderGeometry(.011,.006,.016,10),toon('#ffffff'));funnel.position.set(.01,.075,0);
  const carboy=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,.03,10),toon('#8fd3ff'));carboy.position.set(-.02,.053,0);
  const pump=new THREE.Mesh(new THREE.BoxGeometry(.016,.012,.012),toon('#ff4f3a'));pump.position.set(.028,.044,.015);
  g.add(tab,flask,funnel,carboy,pump);g.scale.setScalar(2);return g;
}
function makeBase(pos){
  const toon=Wd.toon,g=new THREE.Group();
  const h=new THREE.Mesh(new THREE.BoxGeometry(.16,.07,.11).translate(0,.035,0),toon('#fff3dc'));
  const r=new THREE.Mesh(new THREE.ConeGeometry(.12,.06,4).rotateY(Math.PI/4).scale(1,1,.75).translate(0,.1,0),toon('#ff4f3a'));
  const d=new THREE.Mesh(new THREE.BoxGeometry(.004,.035,.025),toon('#1d1a2b'));d.position.set(.081,.018,0);
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.003,.003,.2,5).translate(0,.1,0),toon('#ddd'));pole.position.set(-.1,0,.06);
  const flag=new THREE.Mesh(new THREE.BoxGeometry(.05,.03,.002),toon('#ffd23f'));flag.position.set(-.075,.18,.06);
  const dish=new THREE.Mesh(new THREE.SphereGeometry(.02,10,6,0,Math.PI*2,0,Math.PI/2),toon('#ffffff'));dish.position.set(-.04,.13,-.03);dish.rotation.z=.8;
  g.add(h,r,d,pole,flag,dish);g.scale.setScalar(2.2);
  let ymax=-1e9,ymin=1e9;for(let i=-2;i<=2;i++)for(let j=-2;j<=2;j++){const y=Wd.heightAt(pos[0]+i*.12,pos[1]+j*.09);ymax=Math.max(ymax,y);ymin=Math.min(ymin,y);}
  const top=ymax+.04,depth=(top-ymin+.12)/2.2;
  const plinth=new THREE.Mesh(new THREE.BoxGeometry(.24,depth,.18).translate(0,-depth/2,0),toon('#b8b2a6'));g.add(plinth);
  const deck=new THREE.Mesh(new THREE.BoxGeometry(.25,.008,.19).translate(0,-.004,0),toon('#8a8478'));g.add(deck);
  for(let k=0;k<3;k++){const st=new THREE.Mesh(new THREE.BoxGeometry(.03,.012,.06),toon(k%2?'#a8a296':'#c9c3b6'));st.position.set(.135+k*.028,-.006-k*.012,0);g.add(st);}
  const sign=new THREE.Mesh(new THREE.BoxGeometry(.004,.02,.09),toon('#ff4f3a'));sign.position.set(.082,.058,0);g.add(sign);
  g.position.set(pos[0],top,pos[1]);Wd.groups.static.add(g);return g;
}
function makeBeacon(col){
  const g=new THREE.Group();
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.2,.022,6,32).rotateX(Math.PI/2),Wd.toon(col));ring.position.y=.02;
  const mat=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.32,depthWrite:false});
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,2.6,10,1,true).translate(0,1.3,0),mat);
  const drop=new THREE.Mesh(new THREE.SphereGeometry(.04,12,10),Wd.toon('#3a86ff'));drop.scale.set(1,1.3,1);drop.position.y=.55;
  const tip=new THREE.Mesh(new THREE.ConeGeometry(.028,.05,10),Wd.toon('#3a86ff'));tip.position.y=.62;
  g.add(ring,beam,drop,tip);g.userData={ring,beam,drop,tip,mat};return g;
}

// ------------------------------------------------------------ init
let labelsEl;
function init(){
  // world tweaks for the game
  Wd.layerOn.sites=false;Wd.layerOn.meta=false;Wd.layerOn.taxa=false;Wd.layerOn.photos=false;Wd.layerOn.field=false;Wd.applyLayers();
  Wd.controls.enabled=false;
  Wd.roadPaths.forEach(c=>c.getSpacedPoints(Math.ceil(c.getLength()/.04)).forEach(p=>roadPts.push([p.x,p.z])));
  labelsEl=$('#g-labels');
  const bp=nearestRoad(...Wd.P(-37.8685,-71.0585));
  // base west of Ruta 26, between the road and the village (east of the road the shipping pad fell in the lake and pushed the LC beacon inland)
  base={x:bp[0]-.18,z:bp[1]-.12};base.g=makeBase([base.x,base.z]);
  base.pad=makeBeacon('#ff4f3a');base.px=base.x-.02;base.pz=base.z+.34;base.pad.position.set(base.px,Wd.heightAt(base.px,base.pz),base.pz);base.pad.scale.set(1.2,1,1.2);base.pad.userData.drop.visible=base.pad.userData.tip.visible=false;Wd.groups.static.add(base.pad);
  base.lbl=mkLabel('MEL FIELD BASE<small>ship samples to sequencing</small>','glbl base');
  const RV0=Wd.RIVERS[0].P;const SPREAD={VA2:RV0[Math.min(4,RV0.length-1)],VA1:RV0[Math.min(8,RV0.length-1)]};
  M=MISSION.map(m=>{const s=Wd.byCode[m.c];const sp=SPREAD[m.c];const ap=sp?accessPoint(sp.x,sp.z):accessPoint(s.x,s.z);
    const smp=(s.samples||[]).filter(q=>Object.keys(q.v||{}).length).sort((a,b)=>(b.year===m.year)-(a.year===m.year)||Object.keys(b.v).length-Object.keys(a.v).length)[0]||null;
    const e=Object.assign({},m,{s,ax:ap[0],az:ap[1],smp,taxa:Wd.TAXA[m.c]||null,col:Wd.HAB[s.hab].c,kit:null});
    e.b=makeBeacon(e.col);e.b.position.set(e.ax,Wd.heightAt(e.ax,e.az),e.az);Wd.groups.static.add(e.b);
    e.lbl=mkLabel('','glbl');return e;});
  spreadSites();
  truck.g=makeTruck(PK.veh(VEH.type));Wd.scene.add(truck.g);pl.g=makePerson();addHeadlamp(pl.g);Wd.scene.add(pl.g);buildWeather();renderAvatars();makeCrew();try{buildBoat();}catch(e){console.warn(e);}try{buildBathers();}catch(e){console.warn(e);}try{buildEggs();}catch(e){console.warn(e);}try{buildMinerals();}catch(e){console.warn(e);}try{buildVillage();}catch(e){console.warn(e);}
  resetPositions();
  buildMissionList();buildMinimapBg();bindInput();
  GAME.tick=tick;GAME.active=true;window.__shot=(ci,acc)=>{const R=Wd.renderer,rt=new THREE.WebGLRenderTarget(160,200),sc=new THREE.Scene(),cm=new THREE.PerspectiveCamera(30,.8,.01,10);sc.add(new THREE.HemisphereLight(0xffffff,0x6a5a8a,.75));const dl=new THREE.DirectionalLight(0xffffff,.7);dl.position.set(2,3,2);sc.add(dl);const m=makePerson(CHARS[ci]);let nm;if(acc){m.userData.anim=m.userData.anim||[];const A=[...HEAD_ACC,...BODY_ACC].find(a=>a[0]===acc);A[1](m);nm=[acc];}else nm=rollAccessories(m);(m.userData.anim||[]).forEach(f=>f(1,true));m.scale.setScalar(1);m.rotation.y=-.6;sc.add(m);cm.position.set(.42,.17,.24);cm.lookAt(0,.12,0);const px=new Uint8Array(160*200*4);R.setRenderTarget(rt);R.setClearColor(0xfff3c4,1);R.clear();R.render(sc,cm);R.readRenderTargetPixels(rt,0,0,160,200,px);R.setRenderTarget(null);R.setClearColor(0,0);const cv=document.createElement('canvas');cv.width=160;cv.height=200;const cx=cv.getContext('2d');const id=cx.createImageData(160,200);for(let y=0;y<200;y++)id.data.set(px.subarray((199-y)*640,(200-y)*640),y*640);cx.putImageData(id,0,0);return [nm.join(' + '),cv.toDataURL()];};
window.__g={EGGS,mkVeh:(t)=>makeTruck(t),openProbe:(...a)=>openProbe(...a),openFilter:(...a)=>openFilter(...a),st:(c)=>st(c),AUX,EV,runFinale,TELLERS,get NEHUEN(){return NEHUEN},EGGS,BATHERS,BOAT,WX,pl,truck,S,cam,M,kits,get modal(){return modal},get mode(){return mode},get ctx(){return ctx},base,get PK(){return PK},setCharacter,CHAR_NAMES,CHARS,walkable,get charIdx(){return charIdx},get charNames(){return charNames}};
  if(matchMedia('(pointer:coarse)').matches)document.body.classList.add('touch');
  showTitle();setLang(LANG);
}
// keep every sampling point (beacon ring + water point) apart so their E/Q prompts never collide
const SITE_MIN=.75,PINNED=['CL','RA_RJ','RJ','SA1','CC','VA2'];
function spreadSites(){
  // Río Jara (freshwater) sat 120 m from the Jara–Agrio confluence: move it upstream on the Jara, past the Culebra waterfall
  {const rj=M.find(m=>m.c==='RJ'),cc=M.find(m=>m.c==='CC');const J=Wd.RIVERS.find(R=>/Jara/.test(R.n));
   if(rj&&cc&&J){const P=J.P;let ci=0,cd=1e9;P.forEach((p,i)=>{const d=Math.hypot(p.x-cc.ax,p.z-cc.az);if(d<cd){cd=d;ci=i;}});
     for(let i=ci;i>=0;i--){const p=P[i];if(Math.hypot(p.x-cc.ax,p.z-cc.az)>=.8&&walkable(p.x,p.z)){rj.ax=p.x;rj.az=p.z;rj.b.position.set(p.x,Wd.heightAt(p.x,p.z),p.z);break;}}}}
  const tooClose=(m,x,z)=>M.some(o=>o!==m&&Math.hypot(o.ax-x,o.az-z)<SITE_MIN)||Math.hypot(base.x-x,base.z-z)<.85||Math.hypot(base.px-x,base.pz-z)<.8;
  for(let pass=0;pass<6;pass++){let moved=false;
    for(let i=M.length-1;i>=0;i--){const m=M[i];if(!tooClose(m,m.ax,m.az))continue;
      const other=M.find(o=>o!==m&&Math.hypot(o.ax-m.ax,o.az-m.az)<SITE_MIN);
      if(other&&PINNED.includes(m.c)&&!PINNED.includes(other.c))continue;   // the other one moves instead
      const x0=m.ax,z0=m.az,E0=Wd.infoAt(x0,z0),rv0=Wd.nearestRiver(x0,z0),atRiver=rv0.d<.12,atLake=E0.dl<.3;
      const okAt=(x,z)=>{if(!walkable(x,z))return false;const dl=Wd.infoAt(x,z).dl;return dl>.06&&(!atLake||atRiver||dl<.12);};  // lake sites stay right at the water's edge
      let best=null,bd=1e9;
      // 1) a river site slides along the rivers so the beacon stays at the water
      if(atRiver)[Wd.RIVERS[rv0.ri]].forEach(R=>{for(let k=0;k<R.P.length-1;k++)for(let f=0;f<1;f+=.2){const a=R.P[k],b=R.P[k+1];const x=a.x+(b.x-a.x)*f,z=a.z+(b.z-a.z)*f;const d=Math.hypot(x-x0,z-z0);
        if(d<2.4&&d<bd&&okAt(x,z)&&!tooClose(m,x,z)){bd=d;best=[x,z];}}});
      // 2) otherwise the nearest free spot around it (lake sites stay on the shore)
      if(!best)for(let r=.05;r<2.4&&!best;r+=.05)for(let a=0;a<48;a++){const q=a/48*6.283,x=x0+Math.cos(q)*r,z=z0+Math.sin(q)*r;if(okAt(x,z)&&!tooClose(m,x,z)){best=[x,z];break;}}
      if(best){m.ax=best[0];m.az=best[1];m.b.position.set(m.ax,Wd.heightAt(m.ax,m.az),m.az);moved=true;}}
    if(!moved)break;}
}
// rivers: half-width of the ribbon at a point (used to keep vehicles/kits out of the water)
function riverAt(x,z){const rv=Wd.nearestRiver(x,z);const R=Wd.RIVERS[rv.ri];if(!R||!R.w||!rv.s)return {d:rv.d,hw:.07};const i=R.P.indexOf(rv.s.a);const f=i<0?1:(i+rv.t)/Math.max(1,R.P.length-1);return {d:rv.d,hw:R.w*(.7+.6*f)};}
function inRiver(x,z,pad=0){const r=riverAt(x,z);return r.d<r.hw+pad;}
function truckInRiver(){const tg=tailgate();const fx=Math.cos(truck.yaw),fz=-Math.sin(truck.yaw);return inRiver(truck.x,truck.z,.02)||inRiver(tg[0],tg[1],.02)||inRiver(truck.x+fx*.13,truck.z+fz*.13,.0);}
function resetPositions(){
  const i=roadPts.findIndex(p=>Math.hypot(p[0]-base.x,p[1]-base.z)<.5);const a=roadPts[Math.max(0,i)],b=roadPts[Math.min(roadPts.length-1,Math.max(0,i)+3)];
  truck.x=a[0];truck.z=a[1];truck.yaw=Math.atan2(-(b[1]-a[1]),b[0]-a[0])+Math.PI;truck.speed=0;
  {const d=Math.hypot(truck.x-base.x,truck.z-base.z);if(d<.7){const k=(.75-d)/(d||1);truck.x+=(truck.x-base.x)*k;truck.z+=(truck.z-base.z)*k;}}
  if(truckInRiver()){  // pushed off the base onto the Río Agrio: park on the nearest dry stretch of road instead, or you can't get out
    const c=roadPts.map((p,j)=>[p,j]).filter(([p])=>Math.hypot(p[0]-base.x,p[1]-base.z)>=.7).sort((u,v)=>Math.hypot(u[0][0]-base.x,u[0][1]-base.z)-Math.hypot(v[0][0]-base.x,v[0][1]-base.z));
    for(const [p,j] of c.slice(0,80)){const q=roadPts[Math.min(roadPts.length-1,j+3)];truck.x=p[0];truck.z=p[1];truck.yaw=Math.atan2(-(q[1]-p[1]),q[0]-p[0])+Math.PI;if(!truckInRiver())break;}}
  pl.inTruck=true;pl.x=truck.x;pl.z=truck.z;pl.carry=0;cam.yaw=truck.yaw;
}
function mkLabel(html,cls){const el=document.createElement('div');el.className=cls;el.innerHTML=html;labelsEl.appendChild(el);return el;}
function st(c){return S.sites[c]||(S.sites[c]={carboy:0,probe:null,filt:null,done:false});}

// ------------------------------------------------------------ input
const AUX={pump:0,beater:0,gurgle:0};
const SND_LBL=['🔇 SOUND OFF','🔈 SFX ONLY','🔊 MUSIC + SFX'];
function bindInput(){
  const ai=()=>AU.init();addEventListener('pointerdown',ai,true);addEventListener('keydown',ai,true);
  $('#g-lang').onclick=e=>{e.stopPropagation();setLang(LANG==='es'?'en':'es');};
  $('#g-exp').onclick=e=>{e.stopPropagation();enterExplore();};$('#g-back').onclick=e=>{e.stopPropagation();exitExplore();};
  $('#g-look').onclick=e=>{e.stopPropagation();if(mode==='play'&&!modal)setCharacter(charIdx,false,true);};
  $('#g-chr').onclick=e=>{e.stopPropagation();if(mode==='play'&&!modal)openPicker();};
  const sb=$('#g-snd');sb.onclick=e=>{e.stopPropagation();AU.init();AU.setLevel((AU.level+2)%3);sb.textContent=SND_LBL[AU.level];};sb.textContent=SND_LBL[AU.level];
  addEventListener('keydown',e=>{
    if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(e.code))e.preventDefault();
    if(modal&&!/INPUT|TEXTAREA|SELECT/.test((e.target&&e.target.tagName)||'')){keys[e.code]=true;if(e.repeat)return;if(e.code==='Escape'&&modal.close!==false){closeModal();return;}const m0=modal;if(modal.key)modal.key(e.code);
      if((e.code==='Enter'||e.code==='NumpadEnter')&&modal===m0){e.preventDefault();enterPrimary('#g-mb');}return;}
    if((e.code==='Enter'||e.code==='NumpadEnter')&&!e.repeat&&enterPrimary('#g-fin,#g-pick,.g-ov.open,#xa-res,#xa-over')){e.preventDefault();return;}
    const first=!keys[e.code];keys[e.code]=true;if(!first)return;
    if(modal){if(e.code==='Escape'&&modal.close!==false){closeModal();return;}if(modal.key)modal.key(e.code);return;}
    if(mode!=='play')return;
    if(e.code==='KeyE')act('E');else if(e.code==='KeyQ')act('Q');else if(e.code==='KeyM'&&e.shiftKey)enterExplore();else if(e.code==='KeyM')cam.map=!cam.map;else if(e.code==='Space'){doJump();}else if(e.code==='KeyV'){cam.fp=!cam.fp;cam.fpPitch=0;toast(cam.fp?LX(' First-person view <kbd>V</kbd> to switch',' Vista en primera persona <kbd>V</kbd> para cambiar'):LX(' Third-person view <kbd>V</kbd> to switch',' Vista en tercera persona <kbd>V</kbd> para cambiar'),false,1800);}else if(e.code==='KeyC'){cam.dragYaw=0;cam.dragPitch=0;cam.zoom=1;}
    else if(e.code==='KeyJ'||e.code==='Tab')$('#g-mis').classList.toggle('min');else if(e.code==='KeyH')showHelp();else if(e.code==='KeyN')nextTarget();else if(e.code==='KeyP')setCharacter((charIdx+1)%CHARS.length);else if(e.code==='KeyL')setCharacter(charIdx,false,true);else if(e.code==='KeyU')$('#g-snd').click();else if(e.code==='KeyB'&&pl.inTruck)AU.sfx.horn();
  });
  addEventListener('keyup',e=>{keys[e.code]=false;});
  addEventListener('blur',()=>{for(const k in keys)keys[k]=false;});
  const cv=document.getElementById('gl');let drag=null;
  cv.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'&&document.body.classList.contains('touch')&&e.clientX<innerWidth*.45)return;drag=[e.clientX,e.clientY];cv.setPointerCapture(e.pointerId);if(e.pointerType==='mouse'&&fpOn()&&!document.pointerLockElement){try{cv.requestPointerLock();}catch(_){}}});
cv.addEventListener('pointermove',e=>{const lk=document.pointerLockElement===cv;if(!lk&&!drag)return;const dx=lk?e.movementX:e.clientX-drag[0],dy=lk?e.movementY:e.clientY-drag[1];
    if(fpOn()){const k=lk?.0052:.0042;cam.dragYaw-=dx*k;cam.fpPitch=clamp(cam.fpPitch-dy*k,-1.5,1.5);}else{cam.dragYaw-=dx*.0085;cam.dragPitch=clamp(cam.dragPitch+dy*.0055,-.3,.8);}
    if(!lk)drag=[e.clientX,e.clientY];cam.lastDrag=S.t;});
  cv.addEventListener('pointerup',()=>drag=null);cv.addEventListener('pointercancel',()=>drag=null);
  cv.addEventListener('wheel',e=>{cam.zoom=clamp(cam.zoom*(e.deltaY>0?1.12:1/1.12),.5,4);e.preventDefault();},{passive:false});
  $('#g-mism').onclick=()=>$('#g-mis').classList.toggle('min');
  // touch
  const J=$('#g-joy'),Ji=J.querySelector('i');let jid=null;
  const jm=e=>{const r=J.getBoundingClientRect();let dx=(e.clientX-r.left-r.width/2)/(r.width/2),dy=(e.clientY-r.top-r.height/2)/(r.height/2);const l=Math.hypot(dx,dy);if(l>1){dx/=l;dy/=l;}joy.x=dx;joy.y=-dy;Ji.style.transform=`translate(${dx*34}px,${dy*34}px)`;};
  J.addEventListener('pointerdown',e=>{jid=e.pointerId;J.setPointerCapture(jid);jm(e);});J.addEventListener('pointermove',e=>{if(e.pointerId===jid)jm(e);});
  const je=()=>{jid=null;joy.x=joy.y=0;Ji.style.transform='';};J.addEventListener('pointerup',je);J.addEventListener('pointercancel',je);
  const hold=(el,code,tap)=>{el.addEventListener('pointerdown',e=>{e.preventDefault();keys[code]=true;el.classList.add('hold');if(tap)tap();});const up=()=>{keys[code]=false;el.classList.remove('hold');};el.addEventListener('pointerup',up);el.addEventListener('pointerleave',up);el.addEventListener('pointercancel',up);};
  hold($('#g-tE'),'KeyE',()=>{if(!modal&&mode==='play')act('E');});hold($('#g-tQ'),'KeyQ',()=>{if(!modal&&mode==='play')act('Q');});
  $('#g-tM').onclick=()=>cam.map=!cam.map;
  $('#g-mx').onclick=()=>{if(modal&&modal.close!==false)closeModal();};
}
const K=c=>!!keys[c];
function inputAxes(){let x=(K('KeyD')||K('ArrowRight')?1:0)-(K('KeyA')||K('ArrowLeft')?1:0)+joy.x;let y=(K('KeyW')||K('ArrowUp')?1:0)-(K('KeyS')||K('ArrowDown')?1:0)+joy.y;return [clamp(x,-1,1),clamp(y,-1,1)];}

// ------------------------------------------------------------ interactions
let ctx=null;   // current context action
const kits=[];  // portable filtration kits {x,z,g,lbl}
function findContext(){
  if(pl.inTruck){
    if(Math.hypot(truck.x-base.x,truck.z-base.z)<1.4&&Math.abs(truck.speed)<.45)return {E:{t:'Get out of the truck',f:exitTruck},Q:{t:'Walk into the MEL Field Base to ship samples',info:true}};
    if(Math.abs(truck.speed)<.35&&truckInRiver())return {E:{t:LX('🌊 You are in the river — drive onto dry ground to park','🌊 Estás en el río — sal a tierra firme para estacionar'),info:true}};
    return Math.abs(truck.speed)<.35?{E:{t:'Get out of the truck',f:exitTruck}}:null;
  }
  const c={};let base_=null,wA=null,sA=null;
  if(Math.hypot(pl.x-truck.x,pl.z-truck.z)<.42)base_={t:'Get in the truck',f:enterTruck};
  if(Math.hypot(pl.x-base.x,pl.z-base.z)<.42)base_={t:'Ship samples to sequencing',f:openShip};
  if(NEHUEN&&!base_){const tl=TELLERS.find(T=>Math.hypot(pl.x-T.x,pl.z-T.z)<.4);const dN=Math.hypot(pl.x-NEHUEN.x,pl.z-NEHUEN.z);if(tl)base_={t:`Listen to ${tl.name}'s story`,f:()=>openStories(tl)};else if(dN<.5)base_={t:'Pet Nehuen 🐾',f:petNehuen};}
  if(base_&&base_.f===talkCaniche&&(wA||sA))base_=null;
  const eg=eggHere();{if(eg&&!base_)base_={t:eggsFound.includes(eg.id)?'Hear this legend again':'❓ Something mysterious here… inspect it',f:()=>findEgg(eg)};}
  {const bg=BATHERS.find(g=>Math.hypot(pl.x-g.x,pl.z-g.z)<.75);if(bg&&!base_)base_={t:`Warn the bathers: this water is pH ${bg.ph}!`,f:()=>talkBathers(bg)};}
  const cn=Wd.caniche;if(cn&&!base_&&Math.hypot(pl.x-cn.position.x,pl.z-cn.position.z)<.35)base_={t:'Talk to Caniche, the volcano guide',f:talkCaniche};
  if(BOAT.g&&!base_&&Math.hypot(pl.x-BOAT.x,pl.z-BOAT.z)<1.8)base_={t:LX('Shout to Pedro on the R/V Caviahue 🚤','Gritarle a Pedro del bote 🚤'),f:PK.talkBoat};
  // water point of the nearest unfinished site
  let wm=null,wd=1e9;M.forEach(m=>{if(st(m.c).done)return;const d=Math.hypot(pl.x-m.ax,pl.z-m.az);if(d<wd){wd=d;wm=m;}});
  if(wm&&wd<.36){const s=st(wm.c);
    if(!s.probe)c.Q={t:`Measure ${wm.c.replace('_','–')} with the multiparameter probe`,f:()=>openProbe(wm)};
    if(pl.carry===0&&s.carboy<VOL)wA={t:`Hold to fill the 10 L jerrycan at ${wm.c.replace('_','–')} (${s.carboy}/${VOL} L)`,hold:true,m:wm};
    else if(pl.carry>0)wA={t:'Jerrycan full — carry it to the filtration station',info:true};
    else if(!s.filt)wA={t:'20 L collected — go to the filtration station',info:true};
  }
  // stations: truck tailgate (truck parked near the site) or a portable kit
  const tb=tailgate();const dTg=Math.hypot(pl.x-tb[0],pl.z-tb[1]);const atTruck=dTg<.3&&!inRiver(tb[0],tb[1],.02);
  const kit=kits.slice().sort((a,b)=>Math.hypot(pl.x-a.x,pl.z-a.z)-Math.hypot(pl.x-b.x,pl.z-b.z)).find(k=>Math.hypot(pl.x-k.x,pl.z-k.z)<.34);
  const dSt=atTruck?dTg/.3:kit?Math.hypot(pl.x-kit.x,pl.z-kit.z)/.34:9;
  if(atTruck||kit){
    const valid=m=>!st(m.c).done&&(atTruck?Math.hypot(truck.x-m.ax,truck.z-m.az)<1.8:Math.hypot(kit.x-m.ax,kit.z-m.az)<2);
    const where=atTruck?'truck':'kit';
    if(pl.carry>0){const m=M.find(q=>q.c===pl.carrySite);
      if(m&&valid(m)){const s=st(m.c);sA={t:`Pour 10 L into the ${m.c.replace('_','–')} carboy (${s.carboy}/${VOL} L)`,f:()=>{s.carboy=Math.min(VOL,s.carboy+pl.carry);pl.carry=0;AU.sfx.pour();toast(`Carboy ${m.c.replace('_','–')}: <b>${s.carboy} / ${VOL} L</b>${s.carboy<VOL?' — one more trip!':' — ready to filter.'}`);save();buildMissionList();}};}
      else sA={t:'This station is too far from where you filled the jerrycan',info:true};}
    else{const m=M.find(q=>valid(q)&&st(q.c).carboy>=VOL&&!st(q.c).filt);
      if(m)sA={t:`Start differential vacuum filtration (${m.c.replace('_','–')})`,f:()=>openFilter(m,where)};
      else{const m2=M.find(q=>valid(q)&&!st(q.c).filt);if(m2)sA={t:`Carboy ${m2.c.replace('_','–')} ${st(m2.c).carboy}/${VOL} L — fetch water at the beacon`,info:true};}}
  }
  if(!sA&&dTg<.3&&!kit&&inRiver(tb[0],tb[1],.02))sA={t:LX('🌊 The tailgate is over the river — park the truck on dry ground','🌊 La puerta trasera quedó sobre el río — estaciona en tierra firme'),info:true};
  if(WX.block&&!PK.is('gabriel')){const left=Math.ceil(WX.dur-3-WX.t);delete c.Q;if(base_&&base_.f===enterTruck)c.E=base_;else if(wA||sA||base_)c.E={t:`❄ Snow squall — sampling paused (${left} s)`,info:true};return c.E?c:null;}
  let E=null;
  const dBase=base_?(base_.f===enterTruck?Math.hypot(pl.x-truck.x,pl.z-truck.z)/.42:.55):9,dW=wA?wd/.36:9;
  if(pl.carry>0)E=sA&&!sA.info?sA:(base_&&!(sA||wA)?base_:(sA||wA));
  else{ // several things overlap here: the one you stand closest to wins, the others are hinted
    const acts=[[wA,dW],[sA,dSt],[base_,dBase]].filter(q=>q[0]&&!q[0].info).sort((a,b)=>a[1]-b[1]);
    if(acts.length){E=acts[0][0];if(acts[1])c.hint=acts[1][0].t;}
    else E=sA||base_||wA;}
  if(Math.hypot(pl.x-base.x,pl.z-base.z)<.42)E={t:'Ship samples to sequencing',f:openShip};
  if(E)c.E=E;
  if(eg&&!eggsFound.includes(eg.id)&&(!E||(E.t.indexOf('Something mysterious')<0&&E.t.indexOf('legend again')<0))&&!eg._auto){eg._auto=true;setTimeout(()=>findEgg(eg),50);}
  return (c.E||c.Q)?c:null;
}
function tailgate(){return [truck.x-Math.cos(truck.yaw)*.24,truck.z+Math.sin(truck.yaw)*.24];}
function act(k){
  if(!ctx||PK.freeze())return;const a=k==='E'?ctx.E:ctx.Q;if(!a||a.hold||a.info)return;a.f&&a.f();
}
// ------------------------------------------------------------ falling off the edge of the world: a few seconds in the void, then you drop back in near the start (progress kept)
let FALL=null;
function offEdge(x,z,m){return x<Wd.X0+m||x>Wd.X1-m||z<Wd.Z0+m||z>Wd.Z1-m;}
function startFall(inTruck,vx,vz){if(FALL)return;const o=inTruck?truck.g:pl.g;const sp=Math.hypot(vx,vz);if(sp<.45){const k=.45/(sp||1);vx=(vx||(pl.x<(Wd.X0+Wd.X1)/2?-1:1))*k;vz*=k;}
  FALL={ph:'void',t:0,truck:inTruck,vx,vz,vy:.35,x:o.position.x,y:o.position.y,z:o.position.z,spin:(Math.random()-.5)*4};
  const C=Wd.camera.position.clone(),F=FALL;lookCine(9,()=>C,()=>new THREE.Vector3(F.x,F.y,F.z));
  PK._say&&PK._say(pk2([LX('Aaaaaaah!','¡Aaaaaaah!'),LX('Nooooo… the edge!','¡Nooooo… el borde!'),LX('Where did the map go?!','¡¿Dónde se fue el mapa?!')]),2.6);try{AU.sfx.skid();}catch(_){}}
const pk2=a=>a[Math.floor(Math.random()*a.length)];
function fallTick(dt,t){const F=FALL;if(!F)return;F.t+=dt;const o=F.truck?truck.g:pl.g;
  F.vy-=2.6*dt;F.x+=F.vx*dt;F.z+=F.vz*dt;F.y+=F.vy*dt;o.position.set(F.x,F.y,F.z);
  const yw=F.truck?truck.yaw:pl.yaw;if(F.truck)o.rotation.set(F.spin*F.t*.25,yw,F.spin*F.t*.4);else{o.rotation.set(0,yw,F.spin*F.t);const u=o.userData;if(u.armL){u.armL.rotation.z=-2.6+Math.sin(t*20)*.5;u.armR.rotation.z=-2.6+Math.cos(t*19)*.5;u.legL.rotation.z=Math.sin(t*16)*.7;u.legR.rotation.z=-Math.sin(t*16)*.7;}}
  if(F.ph==='void'&&F.t>2.6)respawnFall();
  else if(F.ph==='drop'){if(F.y<=F.g){o.position.y=F.g;o.rotation.set(0,F.truck?truck.yaw:pl.yaw,0);if(!F.truck)o.rotation.z=0;
    puff(F.x,F.z);puff(F.x+.05,F.z-.04);try{AU.sfx.stamp();}catch(_){}EV.cine=null;FALL=null;pl.jy=0;pl.jv=0;
    toast(LX('🕳️ You fell off the edge of the world… and landed back near the MEL Field Base. Your samples are safe.','🕳️ Te caíste por el borde del mundo… y aterrizaste de vuelta cerca de la base MEL. Tus muestras están a salvo.'),false,4200);
    try{window.__XA.unlock('void');}catch(_){}save();}}}
function respawnFall(){const F=FALL,carry=pl.carry;resetPositions();pl.carry=carry;
  if(!F.truck||carry>0){pl.inTruck=false;const a=truck.yaw+Math.PI/2;let x=truck.x+Math.cos(a)*.3,z=truck.z-Math.sin(a)*.3;if(!walkable(x,z)){x=truck.x-Math.cos(a)*.3;z=truck.z+Math.sin(a)*.3;}if(!walkable(x,z)){x=base.x+.3;z=base.z;}pl.x=x;pl.z=z;pl.yaw=truck.yaw;F.truck=false;}
  truck.g.rotation.set(0,truck.yaw,0);truck.g.position.set(truck.x,Wd.heightAt(truck.x,truck.z),truck.z);
  F.ph='drop';F.x=F.truck?truck.x:pl.x;F.z=F.truck?truck.z:pl.z;F.g=Wd.heightAt(F.x,F.z)-(F.truck?.012:0);F.y=F.g+2.2;F.vx=F.vz=0;F.vy=0;F.spin*=.5;
  const c=new THREE.Vector3(F.x+.9,F.g+.55,F.z+.9);EV.cine={t:0,dur:9,posFn:()=>c,tgtFn:()=>new THREE.Vector3(F.x,Math.max(F.y,F.g)+.1,F.z)};Wd.camera.position.copy(c);}
function exitTruck(){
  if(truckInRiver()){warnOnce(LX('🌊 Don\'t park in the river! Drive onto the bank first.','🌊 ¡No estaciones en el río! Sube primero a la orilla.'));return;}
  // step out on the left side
  const lx=Math.sin(truck.yaw)*-.28,lz=Math.cos(truck.yaw)*-.28;let x=truck.x+lx,z=truck.z+lz;if(!walkable(x,z)){x=truck.x-lx;z=truck.z-lz;}
  if(!walkable(x,z)){x=truck.x;z=truck.z;}
  pl.inTruck=false;pl.x=x;pl.z=z;pl.yaw=truck.yaw;truck.speed=0;AU.sfx.door();PK.onExit();
}
function enterTruck(){if(pl.carry>0){warnOnce('Pour the water into the carboy first!');return;}pl.inTruck=true;cam.yaw=truck.yaw;AU.sfx.door();}
const CANICHE_LINES=['"My grandmother warned me about El Cuero, a living cowhide in the lakes. Don\'t swim in Caviahue at night."','"In the dark ravines north of here people find giant footprints. They say it\'s the Ucumar."','"When Copahue rumbles, the old ones say Pillán is angry. His lightning split a pehuén near the rim."','"The hot springs are Pirepillán, the snow spirit. Copahue loved her, and the mountain took her."','"Visit the Pehuenche community west of the crater. The elders tell the stories better than I do."','"Up here we walk. The truck stays below."','"Fill the jerrycan, walk it to your kit, repeat. Twenty litres, no shortcuts!"'];
function talkCaniche(){if(PK.cheCaniche())return;toast('<b>CANICHE:</b> '+CANICHE_LINES[Math.floor(Math.random()*CANICHE_LINES.length)],false,5200);AU.sfx.voice(12,118);}

// ------------------------------------------------------------ CHARACTER PERKS (special abilities per scientist)
const PK=(()=>{
  const ID=['abraham','alejandra','alejandro','ana','camila','cata','catalina','celia','dilanaz','estefania','fernando','gabriel','gustavo','tito','issotta','juan','mati','pedro','priscilla','raquel','ricardo','seba','simon','sofi','yasna'];
  const who=()=>ID[charIdx]||'';
  const is=k=>who()===k;
  const isArg=()=>['raquel','ricardo','alejandra'].includes(who());
  const R=(a,b)=>a+Math.random()*(b-a);
  const pk=a=>a[Math.floor(Math.random()*a.length)];
  const L2=(en,es)=>()=>LX(en,es);
  const ps={act:null,next:10,talk:4,boost:0,cans:0,met:{},sofiCd:3,scan:0,dist:0,every:1.2,lx:null,lz:null,pdiN:0};
const IDOLS=[{f:1,skin:'#f1d2bc',hair:'#ff7eb6',style:'long',top:'#ffffff',jacket:'#ff2d95',pants:'#1d1a2b',shoes:'#ffffff',h:.97},{f:0,skin:'#eecbb0',hair:'#d9dde8',style:'medium',top:'#111111',jacket:'#b15cff',pants:'#111111',shoes:'#ffffff',h:1.02},
    {f:1,skin:'#f3d6c2',hair:'#ffe066',style:'long',top:'#00e5ff',jacket:'#1d1a2b',pants:'#ffffff',shoes:'#ff2d95',h:.95},{f:0,skin:'#e8c4a6',hair:'#3a86ff',style:'short',top:'#ffffff',jacket:'#111111',pants:'#ff2d95',shoes:'#111111',h:1.03}];
  const IDOL_N=['Ji-woo','Min-jun','Seo-yeon','Tae-yang'];
  const FREEZE=['breakfast','piano','smoke','kpop','fall','pdi','dash','magic','karaoke','photo','taste','salsa','dance','seal','bino','read','yeta','mech','friend'];
  // ---------- small helpers
  let _tx=null;function ptex(){if(!_tx){const c=document.createElement('canvas');c.width=c.height=32;const x=c.getContext('2d');const g=x.createRadialGradient(16,16,0,16,16,15);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.5,'rgba(255,255,255,.8)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,32,32);_tx=new THREE.CanvasTexture(c);}return _tx;}
  const FX=[],TMP=[];
  function spark(x,y,z,n,col,spd=.5,life=1.2,size=.045){for(let i=0;i<n;i++){const m=new THREE.Sprite(new THREE.SpriteMaterial({map:ptex(),color:col===undefined?pk([0xffd23f,0xff2d95,0x00e5ff,0x7cff4f,0xb15cff]):col,transparent:true,opacity:1,depthWrite:false}));
    m.position.set(x,y,z);m.scale.setScalar(size);Wd.scene.add(m);const a=Math.random()*6.283,e=Math.random()*1.3;FX.push({m,t:0,life:life*(.7+Math.random()*.6),v:[Math.cos(a)*Math.cos(e)*spd,Math.sin(e)*spd+.15,Math.sin(a)*Math.cos(e)*spd],g:-.35,s:size});}}
  function smokeP(x,y,z,big){const m=new THREE.Sprite(new THREE.SpriteMaterial({map:ptex(),color:0xdadada,transparent:true,opacity:.75,depthWrite:false}));m.position.set(x,y,z);m.scale.setScalar(big?.035:.02);Wd.scene.add(m);
    FX.push({m,t:0,life:big?2.4:1.4,v:[(Math.random()-.5)*.05+(big?.03:0),.11,(Math.random()-.5)*.05],g:0,s:big?.035:.02,grow:big?.14:.06,op:.75});}
  function updFX(dt){for(let i=FX.length-1;i>=0;i--){const f=FX[i];f.t+=dt;f.m.position.x+=f.v[0]*dt;f.m.position.y+=f.v[1]*dt;f.m.position.z+=f.v[2]*dt;f.v[1]+=f.g*dt;const k=Math.min(1,f.t/f.life);
      f.m.material.opacity=(f.op||1)*(1-k);if(f.grow)f.m.scale.setScalar(f.s+f.t*f.grow);if(f.t>=f.life){Wd.scene.remove(f.m);f.m.material.dispose();FX.splice(i,1);}}
    for(let i=TMP.length-1;i>=0;i--){const o=TMP[i];o.t+=dt;if(o.t>=o.life){Wd.scene.remove(o.g);TMP.splice(i,1);}}}
  const headPos=()=>pl.inTruck?[truck.x,truck.g.position.y+(animal()?.42:.3),truck.z]:[pl.x,pl.g.position.y+.3,pl.z];
  // ---------- speech bubbles
  const mkBub=bg=>{const b=mkLabel('','glbl');b.style.maxWidth='250px';b.style.whiteSpace='normal';b.style.font="700 14px/1.2 'Comic Neue',sans-serif";b.style.background=bg||'#fff';b.style.display='none';b.style.zIndex='3';return b;};
  let bub=null,bubT=0;
  function say(html,secs=3.5){if(!bub)bub=mkBub();bub.innerHTML=html;bubT=secs;ps.q=0;}
  const hush=()=>(ps.q||0)<15;  // ambient chatter (talkers, thoughts, animals) waits at least 15 s after anything the character said
  const NB=[];
  function npcSay(html,pos,secs=4){const b=mkBub('#fff3c4');b.innerHTML=html;const p=typeof pos==='function'?pos:()=>pos;NB.push({el:b,p,t:secs});}
  // ---------- audio bits
  const cluck=()=>{[[820,.06,0],[620,.06,90],[900,.14,190],[700,.08,420]].forEach(([f,d,w])=>setTimeout(()=>beep(f,d,'square',.05),w));};
  const siren=()=>{for(let i=0;i<6;i++)setTimeout(()=>beep(i%2?960:700,.2,'sawtooth',.035),i*220);};
  const glug=()=>{for(let i=0;i<5;i++)setTimeout(()=>beep(180+Math.random()*60,.07,'sine',.08),i*160);setTimeout(()=>beep(1400,.05,'triangle',.04),900);};
  function kpop(dur,vol){const A=AU.raw&&AU.raw();if(!A)return;const {C,master}=A;const out=C.createGain();out.gain.value=vol;out.connect(master);
    const t0=C.currentTime+.05,spb=60/128,s16=spb/4,fq=n=>440*Math.pow(2,(n-69)/12);
    const ch=[[57,60,64],[53,57,60],[48,52,55],[55,59,62]];
    const nb=C.createBuffer(1,C.sampleRate*.25,C.sampleRate),nd=nb.getChannelData(0);for(let i=0;i<nd.length;i++)nd[i]=Math.random()*2-1;
    const osc=(type,f,t,d,g)=>{const o=C.createOscillator(),e=C.createGain();o.type=type;o.frequency.setValueAtTime(f,t);e.gain.setValueAtTime(0,t);e.gain.linearRampToValueAtTime(g,t+.005);e.gain.exponentialRampToValueAtTime(.0005,t+d);o.connect(e);e.connect(out);o.start(t);o.stop(t+d+.03);return o;};
    const noise=(t,d,g,ftype,ff)=>{const s=C.createBufferSource();s.buffer=nb;const fl=C.createBiquadFilter();fl.type=ftype;fl.frequency.value=ff;const e=C.createGain();e.gain.setValueAtTime(g,t);e.gain.exponentialRampToValueAtTime(.0005,t+d);s.connect(fl);fl.connect(e);e.connect(out);s.start(t);s.stop(t+d+.03);};
    const n16=Math.floor(dur/s16);
    for(let i=0;i<n16;i++){const t=t0+i*s16,c=ch[Math.floor(i/16)%4];
      if(i%4===0){const o=osc('sine',160,t,.28,.9);o.frequency.exponentialRampToValueAtTime(45,t+.22);}
      if(i%8===4){noise(t,.16,.55,'bandpass',1600);noise(t+.012,.12,.35,'bandpass',1200);}
      if(i%2===1)noise(t,.035,.16,'highpass',7000);
      if(i%2===0)osc('sawtooth',fq(c[0]-24),t,s16*1.7,.16);
      osc('square',fq(c[[0,1,2,1,0,2,1,2][i%8]]+12),t,s16*.85,.06);
      if(i%16===0)c.forEach(n=>osc('triangle',fq(n),t,spb*4,.045));
      if(i%16===14||i%16===15)osc('square',fq(c[2]+24),t,s16*.7,.04);}
    setTimeout(()=>{try{out.disconnect();}catch(e){}},(dur+1.5)*1000);}
  // ---------- models
  const A_=(p,geo,col,x,y,z,basic)=>{const m=new THREE.Mesh(geo,basic?new THREE.MeshBasicMaterial({color:col}):Wd.toon(col));m.position.set(x,y,z);p.add(m);return m;};
  function chickenModel(){const g=new THREE.Group();
    A_(g,new THREE.SphereGeometry(.045,12,10),'#ffffff',0,.08,0).scale.set(1.15,.95,.9);
    A_(g,new THREE.SphereGeometry(.028,10,8),'#ffffff',.04,.135,0);
    A_(g,new THREE.ConeGeometry(.008,.02,6),'#ffb21a',.074,.132,0).rotation.z=-Math.PI/2;
    for(let k=0;k<3;k++)A_(g,new THREE.SphereGeometry(.008,6,5),'#e8262b',.028+k*.01,.162+(k===1?.004:0),0);
    A_(g,new THREE.SphereGeometry(.006,6,5),'#e8262b',.064,.116,0).scale.set(.7,1.4,.7);
    [-1,1].forEach(s=>{A_(g,new THREE.SphereGeometry(.004,5,4),'#1d1a2b',.058,.142,.015*s);const w=A_(g,new THREE.SphereGeometry(.03,8,6),'#f4f0e6',-.005,.085,.04*s);w.scale.set(1,.6,.25);});
    for(let k=0;k<3;k++){const f=A_(g,new THREE.ConeGeometry(.012,.045,5),'#f4f0e6',-.055,.115+k*.006,(k-1)*.013);f.rotation.z=.85;}
    const legs=[];[-1,1].forEach(s=>{const l=new THREE.Group();l.position.set(0,.04,.016*s);g.add(l);A_(l,new THREE.CylinderGeometry(.003,.003,.04,5).translate(0,-.02,0),'#ffb21a',0,0,0);A_(l,new THREE.BoxGeometry(.02,.003,.014),'#ffb21a',.006,-.04,0);legs.push(l);});
    g.userData.legs=legs;g.visible=false;return g;}
  function tableModel(){const g=new THREE.Group();
    A_(g,new THREE.BoxGeometry(.1,.005,.09),'#f4f0e6',.035,.07,0);
    for(let k=0;k<4;k++)A_(g,new THREE.BoxGeometry(.101,.0055,.009),'#e63946',.035,.0702,-.036+k*.024);
    [[.075,.035],[.075,-.035],[-.005,.035],[-.005,-.035]].forEach(p=>A_(g,new THREE.CylinderGeometry(.003,.003,.07,6),'#8a5a33',p[0],.035,p[1]));
    A_(g,new THREE.CylinderGeometry(.02,.018,.003,16),'#ffffff',.012,.0745,0);
    A_(g,new THREE.CylinderGeometry(.009,.009,.002,12),'#ffffff',.006,.0765,.006);A_(g,new THREE.SphereGeometry(.004,8,6),'#ffc300',.006,.0775,.006).scale.set(1,.5,1);
    A_(g,new THREE.BoxGeometry(.013,.004,.016),'#d9a05b',.018,.077,-.008);
    A_(g,new THREE.CylinderGeometry(.007,.006,.016,10),'#ffffff',.03,.081,.03);A_(g,new THREE.CylinderGeometry(.0065,.0065,.001,10),'#5a3a24',.03,.089,.03);
    A_(g,new THREE.TorusGeometry(.009,.004,6,10,Math.PI),'#d9953a',.05,.075,-.028).rotation.x=-Math.PI/2;
    A_(g,new THREE.CylinderGeometry(.006,.005,.02,10),'#ff9f1c',.055,.083,.02);
    A_(g,new THREE.CylinderGeometry(.018,.018,.005,12),'#8a5a33',-.045,.045,0);A_(g,new THREE.CylinderGeometry(.004,.004,.045,6),'#6b4a33',-.045,.022,0);
    g.scale.setScalar(1.7);return g;}
  function paperModel(kind){const g=new THREE.Group();
    if(kind===0){A_(g,new THREE.BoxGeometry(.03,.002,.04),'#ffffff',0,.001,0);const b=A_(g,new THREE.BoxGeometry(.03,.002,.04),'#f4f0e6',.004,.003,.003);b.rotation.y=.25;A_(g,new THREE.BoxGeometry(.018,.0005,.003),'#1d1a2b',.004,.0045,-.008).rotation.y=.25;A_(g,new THREE.BoxGeometry(.004,.001,.004),'#9a9aa2',-.008,.005,-.014);}
    else if(kind===1){A_(g,new THREE.BoxGeometry(.034,.007,.044),'#3a86ff',0,.0035,0);A_(g,new THREE.BoxGeometry(.03,.0072,.04),'#ffffff',.001,.0035,0);for(let k=0;k<6;k++)A_(g,new THREE.TorusGeometry(.003,.0008,4,8),'#1d1a2b',-.017,.0035,-.018+k*.007);A_(g,new THREE.BoxGeometry(.016,.0005,.012),'#ffd23f',.002,.0074,0);}
    else{A_(g,new THREE.BoxGeometry(.036,.016,.048),'#1d1a2b',0,.008,0);A_(g,new THREE.BoxGeometry(.032,.0145,.046),'#f4f0e6',.003,.008,0);A_(g,new THREE.BoxGeometry(.02,.0005,.006),'#ffd23f',0,.0163,-.01);A_(g,new THREE.BoxGeometry(.004,.017,.049),'#8a1c2b',-.017,.008,0);}
    g.scale.setScalar(1.7);return g;}
  function handProp(u,kind){u.pk=u.pk||{};if(u.pk[kind])return u.pk[kind];const p=new THREE.Group();p.position.set(0,-.068,0);u.armR.add(p);
    if(kind==='cig'){const c=A_(p,new THREE.CylinderGeometry(.0013,.0013,.016,5),'#ffffff',.007,0,0);c.rotation.z=Math.PI/2;A_(p,new THREE.CylinderGeometry(.0014,.0014,.004,5),'#e0a050',.0,0,0).rotation.z=Math.PI/2;p.userData.tip=A_(p,new THREE.SphereGeometry(.0018,5,4),0xff5a1a,.015,0,0,true);}
    else if(kind==='can'){A_(p,new THREE.CylinderGeometry(.0055,.0055,.017,10),'#1d8cff',0,-.004,0);A_(p,new THREE.CylinderGeometry(.0056,.0056,.005,10),'#ffd23f',0,-.004,0);A_(p,new THREE.CylinderGeometry(.005,.005,.002,10),'#c9c9d1',0,.005,0);}
    else if(kind==='card'){A_(p,new THREE.BoxGeometry(.003,.013,.019),'#f4f0e6',.006,-.004,0);A_(p,new THREE.BoxGeometry(.0032,.004,.0192),'#3a86ff',.006,.001,0);A_(p,new THREE.BoxGeometry(.0033,.005,.005),'#c99472',.006,-.006,.005);}
    p.visible=false;u.pk[kind]=p;return p;}
  function compassModel(){const g=new THREE.Group();
    const ring=A_(g,new THREE.TorusGeometry(.055,.008,8,28),'#ffd23f',0,0,0);ring.rotation.x=Math.PI/2;
    const face=new THREE.Mesh(new THREE.CircleGeometry(.05,24),new THREE.MeshBasicMaterial({color:0x2a1f4a,side:THREE.DoubleSide}));face.rotation.x=-Math.PI/2;g.add(face);
    for(let k=0;k<4;k++){const a=k/4*6.283;A_(g,new THREE.BoxGeometry(.004,.002,.012),0xffd23f,Math.cos(a)*.042,.002,Math.sin(a)*.042,true).rotation.y=-a;}
    const nd=new THREE.Group();g.add(nd);const tip=A_(nd,new THREE.ConeGeometry(.013,.07,8),0xff2d95,.035,.006,0,true);tip.rotation.z=-Math.PI/2;const tl=A_(nd,new THREE.ConeGeometry(.011,.045,8),0xf4f0e6,-.022,.006,0,true);tl.rotation.z=Math.PI/2;
    const gem=A_(g,new THREE.OctahedronGeometry(.012),0x00e5ff,0,.016,0,true);
    const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:ptex(),color:0xfff6a0,transparent:true,opacity:.5,depthWrite:false}));halo.scale.setScalar(.28);g.add(halo);
    g.userData={nd,gem,halo};g.scale.setScalar(1.4);return g;}
  // ---------- vehicles: Celia rides a horse, Fernando a bicycle
  const veh=t=>is('fernando')?'bike':is('raquel')?'vitara':t;
  const animal=()=>!!(truck.g&&truck.g.userData.kind);
  const vmax=onRoad=>{const k=truck.g&&truck.g.userData.kind;const dz=is('dilanaz')?1.25*(ps.tune>0?1.2:1):1;return (k==='bike'?.8:k==='horse'?(onRoad?1:1.35):1)*dz;};
  const driveLbl=()=>{const k=truck.g&&truck.g.userData.kind;return k==='horse'?LX('🐴 RIDING','🐴 CABALGANDO'):k==='bike'?LX('🚲 PEDALLING','🚲 PEDALEANDO'):'🛻 DRIVING';};
  // ---------- texts
  const DESC={
    gustavo:L2('Gustavo walks faster, flails his arms like crazy and every so often sprints off a few metres… and zooms right back. He also keeps inviting you to the gym: he has a free pass!','Gustavo camina más rápido, mueve mucho los brazos y cada tanto sale corriendo unos metros… y vuelve volando. Además te invita al gimnasio a cada rato: ¡tiene un pase gratis!'),
    abraham:L2('Every so often Abraham stops for breakfast (a full table appears out of nowhere) and, in between, puts on a tailcoat to play a grand piano.','Cada cierto rato Abraham para a desayunar (aparece una mesa completa de la nada) y, entremedio, se pone frac para tocar un piano de cola.'),
    simon:L2('Simón is a bit clumsy: he may break the jerrycan, the probe sensor or the filtration glassware while sampling.','Simón es medio torpe: puede quebrar el bidón, el sensor de la sonda o el material de filtración durante el muestreo.'),
    tito:L2('Tito carries a magic compass that always points (with a sparkly trail) to the next sampling site. He also filters 4× faster.','Tito lleva una brújula mágica que siempre apunta (con un rastro brillante) al siguiente sitio de muestreo. Además filtra 4 veces más rápido.'),
    dilanaz:L2('Dilanaz takes smoke breaks chatting in Turkish, dreams of being a car mechanic, drives a faster truck and tunes it up for extra speed.','Dilanaz para a fumar hablando en turco, sueña con ser mecánica de autos, su camioneta anda más rápido y la afina para que corra aún más.'),
    raquel:L2('Raquel drops papers and theses as she walks. And she is Argentine: with Caniche or Pedro it is che, che, che. She drives her white 4-door Suzuki Vitara.','Raquel va botando papers y tesis mientras camina. Y es argentina: con Caniche o Pedro es che, che, che. Maneja su Suzuki Vitara blanca de 4 puertas.'),
    ricardo:L2('Ricardo is Argentine: he says che, che as he walks, and with Caniche or Pedro on the boat it is che, che, che.','Ricardo es argentino: dice che, che mientras camina, y con Caniche o Pedro del bote es puro che, che, che.'),
    alejandra:L2('Alejandra is Argentine: she says che, che as she walks, and with Caniche or Pedro on the boat it is che, che, che.','Alejandra es argentina: dice che, che mientras camina, y con Caniche o Pedro del bote es puro che, che, che.'),
    celia:L2('Celia dances salsa, talks about the orishas and keeps bumping into her best friend, another Celia from Cuba: they chat in slang nobody understands.','Celia baila salsa, habla de los orishas y a cada rato aparece su mejor amiga, otra Celia de Cuba: conversan en términos que nadie entiende.'),
    fernando:L2('Fernando rides a bicycle and always wants to taste the acid river water, just to see what happens.','Fernando anda en bicicleta y siempre quiere probar el agua ácida del río, a ver qué pasa.'),
    pedro:L2('When Pedro gets out of the truck, Camila magically appears beside him and never leaves his side.','Cuando Pedro se baja del auto, Camila aparece mágicamente a su lado y lo acompaña siempre.'),
    camila:L2('Camila stops every so often to dance K-pop, music and all, and four idols pop up behind her to do the choreography.','Camila para cada cierto rato a bailar K-pop, con música y todo, y aparecen cuatro idols detrás que le hacen la coreografía.'),
    alejandro:L2('Every so often Alejandro turns into a chicken for 2 seconds.','Cada cierto rato Alejandro se transforma en pollo por 2 segundos.'),
    juan:L2('Juan drinks a LOT of energy drinks (speed boost!) and will not stop talking about startups.','Juan toma MUCHA energética (¡turbo!) y no para de hablar de startups.'),
    sofi:L2('Sofi wants to chat with everyone about seals, does ballet while walking and slaps her belly like a seal.','Sofi quiere conversar con todos sobre focas, baila ballet caminando y se golpea la guata como foca.'),
    cata:L2('Cata works hard, but complains about the state of science in Chile and Latin America… and plans her escape to a better world: Switzerland.','Cata es buena para trabajar, pero alega de la ciencia en Chile y Latinoamérica… y planea escapar a un mundo mejor: Suiza.'),
    catalina:L2('Catalina stops to pose for photos: flashes out of nowhere and an extravagant outfit.','Catalina para a posar para fotos: flashes de la nada y ropa extravagante.'),
    ana:L2('Ana stops to dance ballet, cueca, tango, flamenco and disco (big applause at the end), or to read a book and comment on it.','Ana para a bailar ballet, cueca, tango, flamenco y disco (con muchos aplausos al final), o a leer un libro y comentarlo.'),
    mati:L2('Mati is a jinx: the weirdest bad luck only happens to him… but he always fixes it with the best attitude.','Mati es yeta: le pasan las cosas más raras que a nadie le pasan… pero siempre lo soluciona con el mejor ánimo.'),
    estefania:L2('Estefanía walks without making a sound, whispers calmly and sometimes turns half-transparent.','Estefanía camina sin hacer ruido, habla susurrando con calma y a veces se vuelve medio translúcida.'),
    priscilla:L2('Prisci is followed everywhere by her ten kids of all ages: Mom this, Mom that… And she filters 4× faster.','A Prisci la siguen todo el rato sus diez niños y niñas de distintas edades: mamá esto, mamá esto otro… Y filtra 4 veces más rápido.'),
    gabriel:L2('Gabriel is an outdoor pro: he walks and samples in snow squalls, climbs steep slopes very fast and keeps switching his mountain gear.','Gabriel es un experto outdoor: camina y muestrea en plena nevazón, escala muy rápido y va cambiando su equipo de montaña.'),
    yasna:L2('Yasna stops to sing karaoke with her animals: three dogs, Culli, a duck, a hen, a parrot, a rabbit, a guinea pig and a cockroach.','Yasna para a cantar karaoke con sus animales: tres perros, Culli, un pato, una gallina, un loro, un conejo, un cuy y una cucaracha.'),
    seba:L2('Every so often the PDI shows up and asks Seba for his ID card.','Cada cierto rato aparece la PDI y le pide el carnet a Seba.'),
    issotta:L2('Issotta made the game: at every site he does magic and it is instantly sampled, filtered and sequenced. And he keeps bragging about it.','Issotta hizo el juego: en cada sitio hace magia y queda muestreado, filtrado y secuenciado al tiro. Y no para de presumirlo.')};
  const desc=()=>DESC[who()]?DESC[who()]():'';
  const TR=[['Bir sigara molası… beş dakika.','A smoke break… five minutes.','Una pausa pa\' fumar… cinco minutos.'],['Of ya, bu volkan çok güzel.','Wow, this volcano is so beautiful.','Uf, este volcán es precioso.'],['Keşke bir çay olsaydı.','I wish there were some tea.','Ojalá hubiera un tecito.'],
    ['Numuneler bekleyebilir, değil mi?','The samples can wait, right?','Las muestras pueden esperar, ¿no?'],['Hava çok soğuk ama manzara harika.','It is very cold, but the view is amazing.','Hace mucho frío, pero la vista es increíble.'],['Asitli su mu? Hiç sorun değil.','Acidic water? No problem at all.','¿Agua ácida? Ningún problema.'],
    ['Hayat kısa, filtreleme uzun.','Life is short, filtration is long.','La vida es corta, la filtración es larga.'],['Kolay gelsin, arkadaşlar!','May it go easy, friends!','¡Que les sea leve, amigos!']];
  const TR_END=['Tamam, yeter. Hadi işe dönelim!','OK, enough. Back to work!','Ya, suficiente. ¡Volvamos a la pega!'];
  const trHTML=l=>`🚬 <b>${l[0]}</b><br><small style="font-weight:400;opacity:.75">(${LX(l[1],l[2])})</small>`;
  const STARTUP=[L2('This is basically Uber, but for metagenomes.','Esto es como Uber, pero para metagenomas.'),L2('We are pivoting: jerrycans-as-a-service, monthly subscription.','Estamos pivoteando: bidones-as-a-service, con suscripción mensual.'),L2('What if we tokenize the 0.22 µm membranes?','¿Y si tokenizamos las membranas de 0,22 µm?'),
    L2('Our TAM: every volcano on the planet. Conservative estimate.','Nuestro TAM: todos los volcanes del planeta. Estimación conservadora.'),L2('Closed our seed round: three energy drinks and a dream.','Cerré la ronda seed: tres latas de energética y un sueño.'),L2('B2B extremophile disruption. Write that down.','Disrupción extremófila B2B. Anótalo.'),
    L2('I have a 48-slide pitch deck about Acidithiobacillus.','Tengo un pitch deck de 48 slides sobre Acidithiobacillus.'),L2('MVP: one jerrycan, one filter, lots of attitude.','MVP: un bidón, un filtro y mucha actitud.'),L2('This is not a field campaign, it is a go-to-market.','Esto no es un muestreo, es un go-to-market.'),
    L2('We need to blitzscale all the way to the crater.','Hay que hacer blitzscaling hasta el cráter.'),L2('Acidophile-as-a-Service. Think about it.','Acidófilo-as-a-Service. Piénsalo.'),L2('If it does not scale it is not science. Well, it is, but it does not scale.','Si no escala, no es ciencia. Bueno, sí es, pero no escala.'),
    L2('Let\'s circle back after the sulfur standup.','Hagamos un follow-up después de la daily del azufre.'),L2('Pre-revenue, post-pH.','Pre-revenue, post-pH.')];
  const SEALS=[L2('did you know southern elephant seals can dive deeper than 2,000 metres?','¿sabías que el elefante marino del sur puede bucear a más de 2.000 metros?'),L2('did you know Weddell seals can hold their breath for over an hour?','¿sabías que la foca de Weddell aguanta más de una hora sin respirar?'),
    L2('did you know leopard seals sing underwater?','¿sabías que las focas leopardo cantan bajo el agua?'),L2('did you know crabeater seals do not eat crabs? They eat krill!','¿sabías que las focas cangrejeras no comen cangrejos? ¡Comen krill!'),
    L2('did you know seal whiskers can follow the wake a fish left seconds earlier?','¿sabías que los bigotes de las focas pueden seguir la estela que dejó un pez segundos antes?'),L2('did you know true seals have no external ears, unlike sea lions?','¿sabías que las focas no tienen orejas externas, a diferencia de los lobos marinos?'),
    L2('did you know a male elephant seal can weigh up to 4 tonnes?','¿sabías que un elefante marino macho puede pesar hasta 4 toneladas?'),L2('did you know Península Valdés, right here in Argentina, has a huge elephant seal colony?','¿sabías que en Península Valdés, aquí en Argentina, hay una colonia enorme de elefantes marinos?'),
    L2('did you know harp seal pups are born with white fur?','¿sabías que las crías de foca arpa nacen con pelaje blanco?'),L2('did you know elephant seals take power naps of a few minutes while diving?','¿sabías que los elefantes marinos duermen siestas de pocos minutos mientras bucean?')];
  const REPL={gen:[L2('…seals? Up here, at 2,000 m?','…¿focas? ¿Aquí, a 2.000 m?'),L2('I had never thought about it that way.','Nunca lo había pensado así.'),L2('Fascinating! Now let me work.','¡Fascinante! Ahora déjame trabajar.'),L2('What does that have to do with microbes?','¿Y eso qué tiene que ver con los microbios?'),L2('OK… 🦭','Ok… 🦭')],
    crew:[L2('Keep going, this goes straight into the documentary 🎥','Sigue, esto va directo al documental 🎥'),L2('Can we redo the seal take?','¿Podemos repetir la toma de las focas?'),L2('Sofi, we are filming the VOLCANO…','Sofi, estamos grabando el VOLCÁN…')],
    dog:[L2('Woof? 🐾','¿Guau? 🐾'),L2('*wags his tail every time he hears "seal"*','*mueve la cola cada vez que oye "foca"*')],
    bath:[L2('Seals bathe in acid water and live to 102!','¡Las focas se bañan en agua ácida y viven 102 años!'),L2('The only seal around here is me! *SPLASH*','¡Aquí la única foca soy yo! *SPLASH*')],
    teller:[L2('Our stories have no seals… but there could be one.','En nuestras historias no hay focas… pero podría haber una.'),L2('Mañum for the seal story.','Mañum por la historia de las focas.')],
    caniche:[L2('Che, there are no seals up here, but there are guanacos.','Che, acá arriba no hay focas, pero hay guanacos.'),L2('Seals? I take you to the crater, not to Península Valdés.','¿Focas? Yo te llevo al cráter, no a Península Valdés.')],
    boat:[L2('Sofi?! But Sofi is right here on the boat with me!','¡¿Sofi?! ¡Pero si Sofi está aquí en el bote conmigo!'),L2('If I see a seal in the lake I will let you know!','¡Si veo una foca en el lago te aviso!')]};
  const PAPERS=[[L2('Acidithiobacillus and me: an acidic love story','Acidithiobacillus y yo: una historia de amor ácido'),L2('Why is the Río Agrio sour? (Spoiler: the volcano)','¿Por qué el Río Agrio es agrio? (Spoiler: el volcán)'),L2('Metagenomics of jerrycans forgotten in the truck','Metagenómica de bidones olvidados en la camioneta'),
      L2('Effect of mate on 0.22 µm filtration efficiency','Efecto del mate en la eficiencia de filtración a 0,22 µm'),L2('Ferrovum: the microbe nobody invited but always shows up','Ferrovum: el microbio que nadie invitó pero siempre llega'),L2('pH 1 and other ways to lose a glove','pH 1 y otras formas de perder un guante'),L2('New high-quality MAGs of questionable origin','Nuevos MAGs de alta calidad y dudosa procedencia'),
      L2('Reviewer 2 is an extremophile: evidence from 14 rejections','El revisor 2 es un extremófilo: evidencia de 14 rechazos'),L2('Leptospirillum does not answer e-mails','Leptospirillum no contesta los correos'),
      L2('16S or not 16S: that is the question','16S o no 16S: esa es la cuestión'),L2('Sulfur, sweat and a broken Niskin bottle','Azufre, sudor y una botella Niskin rota'),
      L2('Rotifers of Lake Caviahue: a love letter','Rotíferos del Lago Caviahue: una carta de amor'),L2('Horizontal gene transfer between me and my coffee cup','Transferencia horizontal de genes entre mi taza de café y yo'),
      L2('On the impossibility of labelling a Falcon tube with gloves on','Sobre la imposibilidad de rotular un Falcon con guantes puestos'),L2('Iron-oxidizers at dawn: a sleepless sampling protocol','Ferrooxidantes al amanecer: un protocolo de muestreo sin dormir'),
      L2('Supplementary Table S47 (the one nobody opens)','Tabla Suplementaria S47 (la que nadie abre)'),L2('Che, where is my sample? A spatial analysis','Che, ¿dónde está mi muestra? Un análisis espacial')],
    [L2('Counting 10⁶ cells by hand (and other youthful mistakes)','Conteo manual de 10⁶ células (y otros errores de juventud)'),L2('Characterisation of the mud in the parking lot','Caracterización del barro del estacionamiento'),L2('Is the Copahue hot? A preliminary study','¿Está caliente el Copahue? Un estudio preliminar'),
      L2('How many jerrycans fit in a pickup? An experimental approach','¿Cuántos bidones caben en una camioneta? Un enfoque experimental'),L2('Autoclave queue times in a shared lab','Tiempos de espera del autoclave en un laboratorio compartido'),
      L2('The pH strip changed colour: now what?','La tira de pH cambió de color: ¿y ahora qué?'),L2('Culture media I forgot in the incubator (2019–2024)','Medios de cultivo que olvidé en la incubadora (2019–2024)'),
      L2('Descriptive statistics of lost pipette tips','Estadística descriptiva de puntas de pipeta perdidas')],
    [L2('Microbial ecophysiology of the Caviahue–Copahue system (Vol. I of VII)','Ecofisiología microbiana del sistema Caviahue–Copahue (Vol. I de VII)'),L2('Towards a unified theory of clogged membranes','Hacia una teoría unificada de las membranas tapadas'),L2('Archaea, sulfur and six years of my life','Arqueas, azufre y seis años de mi vida'),
      L2('Life at pH 2: microbes, mate and resilience in the Andes','La vida a pH 2: microbios, mate y resiliencia en los Andes'),L2('Metagenomes of the Río Agrio and the author\'s mental health','Metagenomas del Río Agrio y la salud mental de la autora'),
      L2('From Buenos Aires to the crater: a thesis in 412 figures','De Buenos Aires al cráter: una tesis en 412 figuras'),L2('Chapter 5 will be ready soon: a longitudinal study','El capítulo 5 ya casi está: un estudio longitudinal'),
      L2('Extremophiles, extreme deadlines','Extremófilos, plazos extremos')]];
  const PTYPE=[L2('📄 Paper','📄 Paper'),L2('📘 Undergrad thesis','📘 Tesis de pregrado'),L2('📕 PhD thesis','📕 Tesis de doctorado')];
  // ---------- actions
  function start(k,dur,extra){ps.act=Object.assign({k,t:0,dur,yaw:pl.yaw,g:pl.g,said:{}},extra||{});const A=ps.act,u=pl.g.userData;
    if(['karaoke','photo','dance','salsa','seal','piano'].includes(k)){const c=Wd.camera.position;A.yaw=cam.fp&&!pl.inTruck?cam.yaw+cam.dragYaw+2.45+Math.PI:Math.atan2(-(c.z-pl.z),c.x-pl.x);}  // in first person: face the show camera
    if(X2[k]){X2[k].start(A,u);return;}
    if(k==='breakfast'){const f=[Math.cos(A.yaw),-Math.sin(A.yaw)];A.tab=tableModel();A.tab.position.set(pl.x,Wd.heightAt(pl.x,pl.z),pl.z);A.tab.rotation.y=A.yaw;Wd.scene.add(A.tab);
      puff(pl.x+f[0]*.1,pl.z+f[1]*.1);spark(pl.x+f[0]*.1,Wd.heightAt(pl.x,pl.z)+.12,pl.z+f[1]*.1,14);AU.sfx.voice(4,150);say(LX('🍳 Breakfast break!','🍳 ¡Pausa para el desayuno!'),2.8);}
    else if(k==='smoke'){handProp(u,'cig').visible=true;}
    else if(k==='kpop'){const cp=Wd.camera.position;A.yaw=Math.atan2(-(cp.z-pl.z),cp.x-pl.x);kpop(dur,.55);say(LX('🎵 K-POP TIME! 🎵','🎵 ¡HORA DEL K-POP! 🎵'),2.8);
      const f=[Math.cos(A.yaw),-Math.sin(A.yaw)],sd=[Math.sin(A.yaw),Math.cos(A.yaw)],SL=[[-.2,-.2],[-.2,.2],[-.38,-.4],[-.38,.4]];
      A.idols=IDOLS.map((c,i)=>{const g=makePerson(c);const x=pl.x+f[0]*SL[i][0]+sd[0]*SL[i][1],z=pl.z+f[1]*SL[i][0]+sd[1]*SL[i][1];g.position.set(x,Wd.heightAt(x,z),z);g.rotation.y=A.yaw;g.visible=false;Wd.scene.add(g);return {g,x,z,in:.3+i*.25};});}
    else if(k==='fall'){A.spill=pl.carry>0&&Math.random()<.45;}
    else if(k==='chicken'){u.pk=u.pk||{};if(!u.pk.chicken){u.pk.chicken=chickenModel();pl.g.add(u.pk.chicken);}A.vis=pl.g.children.map(c=>c.visible);pl.g.children.forEach(c=>c.visible=false);u.pk.chicken.visible=true;
      puff(pl.x,pl.z);spark(pl.x,pl.g.position.y+.15,pl.z,16,0xffffff,.6,1);cluck();say(pk([LX('🐔 BAWK BAWK!','🐔 ¡COCOROCÓ!'),LX('🐔 Cluck?!','🐔 ¡¿Kikirikí?!'),'🐔 🐔 🐔']),1.9);}
    else if(k==='drink'){handProp(u,'can').visible=true;glug();say(LX('⚡ glug-glug-glug…','⚡ glu-glu-glu…'),1.7);}
    else if(k==='pdi'){const side=Math.random()<.5?1:-1,hp=headPos(),px=hp[0],pz=hp[2],yw=pl.inTruck?truck.yaw:pl.yaw;const sx=Math.sin(yw)*side,sz=Math.cos(yw)*side;
      const g=makePerson({skin:'#c99472',hair:'#141010',style:'short',cap:'#1b2a4a',top:'#e9e9ee',jacket:'#1b2a4a',pants:'#1b2a4a',shoes:'#111',h:1.03});A_(g,new THREE.OctahedronGeometry(.004),'#ffd23f',.02,.13,.008).scale.set(.4,1,1);
      A.of={g,x:px+sx*.6+Math.cos(yw)*.15,z:pz+sz*.6-Math.sin(yw)*.15,tx:px+sx*(pl.inTruck?.22:.16),tz:pz+sz*(pl.inTruck?.22:.16),ph:0};g.position.set(A.of.x,Wd.heightAt(A.of.x,A.of.z),A.of.z);Wd.scene.add(g);puff(A.of.x,A.of.z);
      siren();ps.pdiN++;toast(LX(`🚨 <b>PDI!</b> Identity check #${ps.pdiN} for Seba.`,`🚨 <b>¡PDI!</b> Control de identidad n.º ${ps.pdiN} para Seba.`),false,3000);}
    else if(k==='magic'){AU.sfx.voice(6,260);say(LX('✨ Abracadabra, metagenome!','✨ ¡Abracadabra, metagenoma!'),2);}}
  function endAct(){const A=ps.act;if(!A)return;ps.act=null;if(A.idols){A.idols.forEach(o=>{if(o.g.visible){puff(o.x,o.z);spark(o.x,Wd.heightAt(o.x,o.z)+.2,o.z,8,undefined,.4,.8);}Wd.scene.remove(o.g);});A.idols=null;}const u=A.g&&A.g.userData;
    if(X2[A.k]){try{X2[A.k].end(A);}catch(e){console.warn(e);}hideProps(u);return;}
    if(A.tab){puff(A.tab.position.x,A.tab.position.z);Wd.scene.remove(A.tab);}
    if(u&&u.pk){['cig','can','card'].forEach(k=>{if(u.pk[k])u.pk[k].visible=false;});}
    if(A.k==='chicken'&&A.g){A.g.children.forEach((c,i)=>c.visible=A.vis&&i<A.vis.length?A.vis[i]:true);if(u.pk.chicken)u.pk.chicken.visible=false;if(A.g===pl.g){puff(pl.x,pl.z);beep(500,.08,'square',.04);}}
    if(A.of){puff(A.of.x,A.of.z);Wd.scene.remove(A.of.g);}
    if(A.g!==pl.g)return;
    if(A.k==='breakfast')say(LX('Now we can sample! 💪','¡Ahora sí, a muestrear! 💪'),2.2);
    if(A.k==='drink'){ps.boost=8;ps.cans++;say(LX(`⚡ Can #${ps.cans} today! LET'S GOOO!`,`⚡ ¡Lata n.º ${ps.cans} del día! ¡VAMOOO!`),2.5);spark(pl.x,pl.g.position.y+.2,pl.z,12,0xffd23f,.5,.9);}}
  const once=(A,key,at)=>{if(A.t>=at&&!A.said[key]){A.said[key]=1;return true;}return false;};
  function actTick(dt,t){const A=ps.act,u=pl.g.userData;
    if(X2[A.k]){X2[A.k].tick(A,dt,t);return;}
    if(A.k==='dash'){let v;
      if(A.ph==='out'){v=2.3;const nx=pl.x+Math.cos(A.yaw)*v*dt,nz=pl.z-Math.sin(A.yaw)*v*dt;if(!walkable(nx,nz)||A.d>=A.len){A.ph='back';say(LX('🔙 …and back!','🔙 …¡y de vuelta!'),1.3);}else{pl.x=nx;pl.z=nz;A.d+=v*dt;}}
      else{v=3.4;const dx=A.ox-pl.x,dz=A.oz-pl.z,d=Math.hypot(dx,dz);if(d<=v*dt+1e-4){pl.x=A.ox;pl.z=A.oz;A.dur=0;say(pk([LX('Done! 😅','¡Listo! 😅'),LX('Where was I?','¿En qué iba?'),LX('Just checking something 🤓','Solo revisaba algo 🤓')]),1.6);}else{pl.x+=dx/d*v*dt;pl.z+=dz/d*v*dt;A.by=Math.atan2(-dz,dx);}}
      pl.yaw=A.ph==='back'&&A.by!=null?A.by:A.yaw;pl.walk+=dt*v*32;A.pf=(A.pf||0)-dt;if(A.pf<=0){A.pf=.07;puff(pl.x,pl.z);}}
    else if(A.k==='breakfast'){if(once(A,'m',2.8))say(LX('Nom nom… 🥐☕🍳','Ñam ñam… 🥐☕🍳'),3);}
    else if(A.k==='smoke'){if(once(A,'a',.4)){A.l=pk(TR);say(trHTML(A.l),2.4);}if(once(A,'b',2.8)){let l;do l=pk(TR);while(l===A.l);A.l=l;say(trHTML(l),2.4);}if(once(A,'c',5.2))say(trHTML(TR_END),2.4);
      const ph=(A.t%2.6)/2.6;A.st=(A.st||0)-dt;if(A.st<=0){A.st=.35;const tp=handProp(u,'cig').userData.tip;const w=new THREE.Vector3();tp.getWorldPosition(w);smokeP(w.x,w.y,w.z,false);}
      if(ph>.4&&ph<.6){A.ex=(A.ex||0)-dt;if(A.ex<=0){A.ex=.1;const w=pl.g.localToWorld(new THREE.Vector3(.03,.165,0));smokeP(w.x,w.y,w.z,true);}}}
    else if(A.k==='kpop'){if(A.idols)A.idols.forEach((o,i)=>{const gy=Wd.heightAt(o.x,o.z);if(!o.g.visible&&A.t>=o.in){o.g.visible=true;puff(o.x,o.z);spark(o.x,gy+.2,o.z,14,undefined,.5,1.1);AU.sfx.voice(1,280+i*30);if(i===IDOLS.length-1)npcSay(LX('✨ '+IDOL_N.join(', ')+': 준비됐어? Ready? 1, 2, 3!','✨ '+IDOL_N.join(', ')+': 준비됐어? ¿Listas? ¡Hana, dul, set!'),[o.x,gy+.5,o.z],2.4);}
        if(o.g.visible){dance(o.g,o.g.userData,A.t,A.yaw,gy);o.g.userData.can&&(o.g.userData.can.visible=false);}});
      const b=Math.floor(A.t/(60/128));if(b!==A.b){A.b=b;if(b%2===0)spark(pl.x,pl.g.position.y+.34,pl.z,4,pk([0xff2d95,0xff9fc8,0xb15cff]),.35,1,.04);}
      if(once(A,'a',3))say(LX('💖 Saranghae~ 사랑해! ♪','💖 ¡Saranghae~ 사랑해! ♪'),2.6);if(once(A,'b',6))say(LX('✌ Hwaiting! 화이팅!','✌ ¡Hwaiting! 화이팅!'),2.4);if(once(A,'c',8.1))say(LX('Thank you, thank you! 🙇‍♀️','¡Gracias, gracias! 🙇‍♀️'),1.8);}
    else if(A.k==='fall'){if(once(A,'hit',.35)){AU.sfx.stamp();AU.sfx.voice(3,170);puff(pl.x+Math.cos(A.yaw)*.12,pl.z-Math.sin(A.yaw)*.12);say(pk([LX('Ouch! 🤕','¡Ay! 🤕'),LX('Whoops, again!','¡Uuuy, otra vez!'),LX('I\'m fine, I\'m fine…','Estoy bien, estoy bien…'),LX('Who put that rock there?','¿Quién puso esa piedra ahí?'),LX('The ground attacked me!','¡El suelo me atacó!')]),2.2);
        if(A.spill){pl.carry=0;AU.sfx.splash();const f=[Math.cos(A.yaw),-Math.sin(A.yaw)],x=pl.x+f[0]*.16,z=pl.z+f[1]*.16,y=Wd.heightAt(x,z);spark(x,y+.05,z,18,0x3a86ff,.5,1,.035);
          const cg=new THREE.Group();A_(cg,new THREE.BoxGeometry(.03,.034,.016),'#3a86ff',0,.017,0);A_(cg,new THREE.BoxGeometry(.012,.006,.006),'#1d1a2b',0,.036,0);cg.scale.setScalar(1.7);cg.position.set(x,y,z);cg.rotation.set(0,A.yaw,Math.PI/2);Wd.scene.add(cg);TMP.push({g:cg,t:0,life:4});
          toast(LX('💦 Simón dropped the jerrycan! 10 L spilled, go refill it.','💦 ¡Simón botó el bidón! Se derramaron los 10 L, hay que volver a llenarlo.'),true,4200);}}}
    else if(A.k==='pdi'){const o=A.of,hp=headPos();let tx=o.tx,tz=o.tz;if(A.t>5.9){tx=o.tx+(o.tx-hp[0])*6;tz=o.tz+(o.tz-hp[2])*6;}
      const dx=tx-o.x,dz=tz-o.z,d=Math.hypot(dx,dz),mv=d>.01&&(A.t<1.3||A.t>5.9);if(mv){const s=Math.min(d,.55*dt);o.x+=dx/d*s;o.z+=dz/d*s;o.ph+=dt*16;}
      const face=A.t>5.9?Math.atan2(-dz,dx):Math.atan2(-(hp[2]-o.z),hp[0]-o.x);o.g.position.set(o.x,Wd.heightAt(o.x,o.z),o.z);o.g.rotation.y=face;const w=mv?Math.sin(o.ph)*.6:0;const ou=o.g.userData;ou.legL.rotation.z=w;ou.legR.rotation.z=-w;ou.armL.rotation.z=-w*.7;ou.armR.rotation.z=A.t>1.3&&A.t<5.9?-.3+Math.sin(A.t*2)*.15:w*.7;
      if(!pl.inTruck)pl.yaw=angLerp(pl.yaw,Math.atan2(-(o.z-pl.z),o.x-pl.x),Math.min(1,dt*6));
      const op=()=>[o.x,Wd.heightAt(o.x,o.z)+.46,o.z];
      if(once(A,'a',1.3)){npcSay(LX('👮 <b>PDI.</b> Good afternoon, routine identity check. Your ID card, please.','👮 <b>PDI.</b> Buenas tardes, control de identidad de rutina. Su carnet, por favor.'),op,2.6);beep(300,.1,'square',.03);}
      if(once(A,'b',3.1)){say(pk([LX('Here you go, officer 🪪 …again.','Aquí tiene, oficial 🪪 …otra vez.'),LX('Seriously? Again?! 🪪','¿En serio? ¡¿Otra vez?! 🪪'),LX('I\'m just sampling water, I swear 🪪','Solo estoy muestreando agua, se lo juro 🪪')]),2.2);if(!pl.inTruck)handProp(u,'card').visible=true;}
      if(once(A,'c',4.8)){npcSay(pk([LX('All in order. Happy sampling.','Todo en orden. Que tenga buen muestreo.'),LX('Hmm… you look younger in the photo. Move along.','Mmm… sale más joven en la foto. Circule.'),LX('Valid. And careful with that pH 1, OK?','Vigente. Y ojo con ese pH 1, ¿ya?'),LX('And that jerrycan of acid water? …Fine, carry on.','¿Y ese bidón con agua ácida? …Bueno, siga nomás.'),LX('We\'re keeping an eye on you, Seba. Move along.','Lo tenemos vigilado, Seba. Circule.')]),op,2.4);if(u.pk&&u.pk.card)u.pk.card.visible=false;}}
    else if(A.k==='magic'){const m=A.m,by=Wd.heightAt(m.ax,m.az);A.sp=(A.sp||0)-dt;if(A.sp<=0){A.sp=.08;spark(m.ax,by+.1+Math.random()*.4,m.az,3,undefined,.4,1);const hp=headPos();spark(hp[0],hp[1]+.05,hp[2],2,0xfff6a0,.3,.8,.035);}
      if(once(A,'done',1.1)){const s=st(m.c);s.carboy=VOL;s.probe={v:Object.assign({},m.smp?m.smp.v:{}),t:.1,sample:m.smp?m.smp.name:null};s.filt={m045:1,m022:1,rupt:0,t:1,magic:1};S.score+=50;tada();spark(m.ax,by+.2,m.az,40,undefined,.9,1.6,.05);
        stamp(LX('✨ ISSOTTA MAGIC ✨','✨ MAGIA DE ISSOTTA ✨'),LX(`${m.c.replace('_','–')} sampled, filtered and sequenced · +50`,`${m.c.replace('_','–')} muestreado, filtrado y secuenciado · +50`));
        toast(LX(`🪄 <b>${m.c.replace('_','–')}</b>: 20 L collected, probe logged, 0.45 + 0.22 µm filtered and already sequenced. Perks of making the game.`,`🪄 <b>${m.c.replace('_','–')}</b>: 20 L listos, sonda registrada, filtrado a 0,45 + 0,22 µm y ya secuenciado. Ventajas de haber hecho el juego.`),false,5200);
        checkDone(m);save();buildMissionList();}}}
  // ---------- Issotta: magic when approaching a site
  function issotta(){for(const m of M){if(st(m.c).done)continue;if(Math.hypot(pl.x-m.ax,pl.z-m.az)<.6){start('magic',2.1,{m});return;}}}
  // ---------- Sofi: seal talk with every character she meets
  function npcs(){const L=[];
    CREW.forEach((c,i)=>L.push({id:'crew'+i,n:i?LX('boom operator','sonidista'):LX('camera operator','camarógrafo'),x:c.x,z:c.z,y:Wd.heightAt(c.x,c.z)+.4,cd:75,kind:'crew'}));
    BATHERS.forEach((g,i)=>L.push({id:'bath'+i,n:LX('bathers','bañistas'),x:g.x,z:g.z,y:g.water+.45,kind:'bath',r:1}));
    TELLERS.forEach(T=>L.push({id:'tl'+T.name,n:T.name,x:T.x,z:T.z,y:Wd.heightAt(T.x,T.z)+.5,kind:'teller'}));
    if(NEHUEN)L.push({id:'neh',n:'Nehuen',x:NEHUEN.x,z:NEHUEN.z,y:Wd.heightAt(NEHUEN.x,NEHUEN.z)+.4,kind:'dog'});
    const cn=Wd.caniche;if(cn)L.push({id:'can',n:'Caniche',x:cn.position.x,z:cn.position.z,y:cn.position.y+.5,kind:'caniche'});
    if(BOAT.g)L.push({id:'boat',n:'Pedro',x:BOAT.x,z:BOAT.z,y:lakeY()+.45,kind:'boat',r:1.5});
    return L;}
  function sofi(dt){ps.sofiCd-=dt;ps.scan-=dt;if(ps.scan>0||ps.sofiCd>0||pl.inTruck||ps.act)return;ps.scan=.6;
    let best=null,bd=1e9;for(const n of npcs()){const d=Math.hypot(pl.x-n.x,pl.z-n.z);if(d<(n.r||.85)&&d<bd&&(ps.met[n.id]===undefined||S.t-ps.met[n.id]>(n.cd||45))){bd=d;best=n;}}
    if(!best)return;ps.met[best.id]=S.t;ps.sofiCd=9;const n=best;
    say(`🦭 ${LX('Hi','¡Hola')}, ${esc(n.n)}! ${pk(SEALS)()}`,5.2);AU.sfx.voice(8,235);
    setTimeout(()=>{if(!is('sofi'))return;npcSay(esc(pk(REPL[n.kind]||REPL.gen)()).replace(/\*([^*]+)\*/g,'<i>$1</i>'),[n.x,n.y,n.z],4.2);AU.sfx.voice(5,n.kind==='dog'?420:165);},2600);}
  // ---------- Raquel: drops papers and theses
  const PAP=[];
  function raquel(dt){if(pl.inTruck){ps.lx=null;return;}if(ps.lx===null){ps.lx=pl.x;ps.lz=pl.z;return;}const d=Math.hypot(pl.x-ps.lx,pl.z-ps.lz);ps.lx=pl.x;ps.lz=pl.z;if(d>.3)return;ps.dist+=d;
    if(ps.dist<ps.every)return;ps.dist=0;ps.every=R(3,5);const r=Math.random(),kind=r<.55?0:r<.85?1:2;const g=paperModel(kind);const x=pl.x-Math.cos(pl.yaw)*.05,z=pl.z+Math.sin(pl.yaw)*.05;g.position.set(x,Wd.heightAt(x,z)+.002,z);g.rotation.y=Math.random()*6.28;Wd.scene.add(g);
    PAP.push(g);if(PAP.length>30)Wd.scene.remove(PAP.shift());AU.sfx.click();
    npcSay(`${PTYPE[kind]()}<br><i>“${pk(PAPERS[kind])()}”</i>`,[x,Wd.heightAt(x,z)+.14,z],3.4);
    if(Math.random()<.35&&!hush())say(pk([LX('Oops, another one…','Uy, se me cayó otro…'),LX('Cite me! 📚','¡Cítenme! 📚'),LX('That one was peer-reviewed, che.','Ese estaba revisado por pares, che.')]),2);}
  // ---------- Tito: magic compass
  let cmp=null;const trail=[];
  function compass(t){if(!cmp){cmp=compassModel();Wd.scene.add(cmp);for(let i=0;i<9;i++){const s=new THREE.Mesh(new THREE.OctahedronGeometry(.022),new THREE.MeshBasicMaterial({color:i%2?0xff2d95:0xffd23f,transparent:true,opacity:.9}));Wd.scene.add(s);trail.push(s);}}
    const Tg=S.target||nearestOpen();const tx=Tg==='base'?base.x:Tg.ax,tz=Tg==='base'?base.z:Tg.az;
    const y0=pl.inTruck?truck.g.position.y+(animal()?.55:.36):pl.g.position.y+.44;cmp.visible=true;cmp.position.set(pl.x,y0+Math.sin(t*2.5)*.012,pl.z);
    const ang=Math.atan2(-(tz-pl.z),tx-pl.x),u=cmp.userData;u.nd.rotation.y=angLerp(u.nd.rotation.y,ang,.25);u.gem.rotation.y=t*2.2;u.halo.material.opacity=.35+Math.sin(t*4)*.15;
    const d=Math.hypot(tx-pl.x,tz-pl.z),dx=(tx-pl.x)/(d||1),dz=(tz-pl.z)/(d||1);
    trail.forEach((s,i)=>{const f=((i+t*1.3)%9)/9,dd=.22+f*Math.max(.1,Math.min(2.6,d-.15));s.visible=d>.4;const x=pl.x+dx*dd,z=pl.z+dz*dd;s.position.set(x,Wd.heightAt(x,z)+.07+Math.sin(t*5+i)*.015,z);s.material.opacity=.95*Math.sin(f*Math.PI);s.rotation.y=t*3+i;s.scale.setScalar(.6+.6*Math.sin(f*Math.PI));});}
  function compassOff(){if(cmp){cmp.visible=false;trail.forEach(s=>s.visible=false);}}
  // ---------- Pedro: Camila appears by magic and follows him
  const comp={g:null,on:false,x:0,z:0,yaw:0,ph:0,dance:0,d0:0,next:R(40,55),call:-99};
  function compMake(){if(comp.g)return;comp.g=makePerson(CHARS[4]);comp.g.userData.hands=rollHands(4);addTechProp(comp.g);comp.g.visible=false;Wd.scene.add(comp.g);}
  function compRemove(){if(!comp.g)return;Wd.scene.remove(comp.g);comp.g=null;comp.on=false;comp.dance=0;}
  function compSlot(){return [pl.x-Math.cos(pl.yaw)*.03+Math.sin(pl.yaw)*.17,pl.z+Math.sin(pl.yaw)*.03+Math.cos(pl.yaw)*.17];}
  function onExit(){if(!is('pedro'))return;compMake();const [x,z]=compSlot();comp.x=x;comp.z=z;comp.yaw=pl.yaw;const y=Wd.heightAt(x,z);spark(x,y+.15,z,26,undefined,.6,1.3);
    if(!comp.on){comp.on=true;AU.sfx.tada();toast(LX(`✨ <b>${esc(charNames[4])}</b> magically appeared next to Pedro. She's not going anywhere!`,`✨ <b>${esc(charNames[4])}</b> apareció mágicamente al lado de Pedro. ¡Y no se va a ir a ninguna parte!`),false,4200);
      npcSay(LX('✨ Ta-da! Where are we going, Pedro?','✨ ¡Tarán! ¿Pa\' dónde vamos, Pedro?'),[x,y+.5,z],3.5);}}
  function compUpdate(dt,t){compMake();const g=comp.g,u=g.userData;if(!comp.on){g.visible=false;return;}g.visible=true;g.rotation.x=0;u.armL.rotation.x=u.armR.rotation.x=u.legL.rotation.x=u.legR.rotation.x=0;
    if(pl.inTruck){const bx=-.16,cy=Math.cos(truck.yaw),sy=Math.sin(truck.yaw);comp.x=truck.x+cy*bx;comp.z=truck.z-sy*bx;comp.dance=0;g.position.set(comp.x,truck.g.position.y+.1,comp.z);g.rotation.set(0,truck.yaw,0);
      u.legL.rotation.z=u.legR.rotation.z=0;u.armL.rotation.z=0;u.armR.rotation.z=Math.abs(truck.speed)>1.2?2.6+Math.sin(t*9)*.3:.2;return;}
    const gy=Wd.heightAt(comp.x,comp.z);
    if(comp.dance>0){comp.dance-=dt;dance(g,u,comp.d0-comp.dance,comp.yaw,gy);return;}
    const [sx,sz]=compSlot();const dx=sx-comp.x,dz=sz-comp.z,d=Math.hypot(dx,dz);let mv=false;
    if(d>3){comp.x=sx;comp.z=sz;spark(sx,Wd.heightAt(sx,sz)+.15,sz,16);}
    else if(d>.03){const v=Math.min(d*5,1.7),s=Math.min(d,v*dt);comp.x+=dx/d*s;comp.z+=dz/d*s;comp.yaw=angLerp(comp.yaw,Math.atan2(-dz,dx),Math.min(1,dt*10));comp.ph+=dt*v*30;mv=true;}
    else comp.yaw=angLerp(comp.yaw,pl.yaw,Math.min(1,dt*4));
    g.position.set(comp.x,Wd.heightAt(comp.x,comp.z),comp.z);g.rotation.set(0,comp.yaw,0);const w=mv?Math.sin(comp.ph)*.7:0;u.legL.rotation.z=w;u.legR.rotation.z=-w;u.armL.rotation.z=-w*.8;u.armR.rotation.z=w*.8;
    if(d>.9&&S.t-comp.call>14){comp.call=S.t;npcSay(pk([LX('Pedro, wait for me!','¡Pedro, espérame!'),LX('Coming, coming!','¡Voy, voy!')]),()=>[comp.x,Wd.heightAt(comp.x,comp.z)+.5,comp.z],2.2);}
    comp.next-=dt;if(comp.next<=0&&d<.4){comp.next=R(40,60);comp.dance=comp.d0=6;kpop(6,.28);npcSay(LX('🎵 K-pop break! Go on, I\'ll catch up 🎵','🎵 ¡Pausa K-pop! Sigue, ya te alcanzo 🎵'),[comp.x,gy+.5,comp.z],3);}}
  // ---------- K-pop choreography (shared by Camila and her magic copy)
  function dance(g,u,tm,yaw,gy){const b=tm/(60/128),mv=Math.floor(b/4)%4,s=Math.sin(b*Math.PI);let y=gy,ry=yaw,rx=0;
    u.armL.rotation.x=u.armR.rotation.x=u.legL.rotation.x=u.legR.rotation.x=0;
    if(mv===0){u.armL.rotation.z=.3+2.6*Math.max(0,s);u.armR.rotation.z=.3+2.6*Math.max(0,-s);rx=s*.15;u.legL.rotation.z=Math.max(0,s)*.45;u.legR.rotation.z=Math.max(0,-s)*.45;}
    else if(mv===1){y+=Math.abs(s)*.05;u.armL.rotation.z=u.armR.rotation.z=2.9;u.armL.rotation.x=-.5;u.armR.rotation.x=.5;u.legL.rotation.x=-.3*Math.abs(s);u.legR.rotation.x=.3*Math.abs(s);u.legL.rotation.z=u.legR.rotation.z=0;}
    else if(mv===2){ry=yaw+((b%4)/4)*Math.PI*2;u.armL.rotation.z=u.armR.rotation.z=1.5;u.armL.rotation.x=-1.2;u.armR.rotation.x=1.2;u.legL.rotation.z=u.legR.rotation.z=0;y+=Math.abs(s)*.015;}
    else{u.armL.rotation.z=2.4+s*.3;u.armR.rotation.z=2.4-s*.3;u.armL.rotation.x=.35;u.armR.rotation.x=-.35;rx=s*.2;u.legL.rotation.z=s*.35;u.legR.rotation.z=-s*.35;}
    g.position.y=y;g.rotation.set(rx,ry,0);}
  // ---------- Argentines: che, che, che
  // Argentine small talk: a short che-che back-and-forth. lines alternate you / them
  const CHE_CANICHE=[
    [L2('Che, Caniche! All good, che?','¡Che, Caniche! ¿Todo bien, che?'),L2('Che, che, che! All good, che. And you, che?','¡Che, che, che! Todo bien, che. ¿Y vos, che?'),L2('Here, che, sampling, che. Cold, che.','Acá, che, muestreando, che. Frío, che.'),L2('Che, cold is Ushuaia, che. This is spring, che.','Che, frío es Ushuaia, che. Esto es primavera, che.')],
    [L2('Che, che, che… which way to the crater, che?','Che, che, che… ¿pa\' dónde queda el cráter, che?'),L2('Che, look, che: up there, che, where the smoke is, che.','Che, mirá, che: allá arriba, che, donde sale humo, che.'),L2('Che, and is it far, che?','Che, ¿y queda lejos, che?'),L2('Che, two hours walking, che. Or four, che, if you stop for mate, che.','Che, dos horas caminando, che. O cuatro, che, si parás a tomar mate, che.')],
    [L2('Che, Caniche, got any mate, che?','Che, Caniche, ¿tenés un mate, che?'),L2('Of course, che! Che, che, sweet or bitter, che?','¡Obvio, che! Che, che, ¿dulce o amargo, che?'),L2('Bitter, che. Obviously, che.','Amargo, che. Obvio, che.'),L2('That\'s it, che! You\'re one of us, che. Che, che.','¡Eso, che! Sos de los nuestros, che. Che, che.'),L2('Che, thanks, che.','Che, gracias, che.'),L2('Che, don\'t say thanks, che, or I stop serving, che!','Che, no digas gracias, che, ¡que dejo de cebar, che!')],
    [L2('Che, did you see the river, che? It\'s orange, che.','Che, ¿viste el río, che? Está naranja, che.'),L2('Che, it\'s the iron, che. The volcano, che. Che.','Che, es el hierro, che. El volcán, che. Che.'),L2('Che, and can you drink it, che?','Che, ¿y se puede tomar, che?'),L2('Che, NO, che! Che, che, che. Ask Fernando, che.','¡Che, NO, che! Che, che, che. Preguntale a Fernando, che.')],
    [L2('Che, Caniche, where are you from, che?','Che, Caniche, ¿vos de dónde sos, che?'),L2('Caviahue, che. Born and raised, che. And you, che?','De Caviahue, che. Nacido y criado, che. ¿Y vos, che?'),L2('From over there, che. You know, che.','De por allá, che. Vos sabés, che.'),L2('Ah, che, then you\'re from here, che. Che, che.','Ah, che, entonces sos de acá, che. Che, che.')],
    [L2('Che… che.','Che… che.'),L2('Che.','Che.'),L2('Che, che, che.','Che, che, che.'),L2('Che! Che, che. Che.','¡Che! Che, che. Che.'),L2('Che, what a nice chat, che.','Che, qué linda charla, che.'),L2('The best, che.','La mejor, che.')]];
  const CHE_BOAT=[
    [L2('Che, Pedro! Che, che, how\'s it going, che?','¡Che, Pedro! Che, che, ¿cómo va eso, che?'),L2('Che, che, che! All good, che. Here throwing the Niskin, che.','¡Che, che, che! Todo bien, che. Acá tirando la Niskin, che.'),L2('Che, and how deep, che?','Che, ¿y a qué profundidad, che?'),L2('Twenty metres, che. Che, che, bring more bottles, che!','Veinte metros, che. ¡Che, che, traé más botellas, che!')],
    [L2('Che! Che, Pedro! Che, over here, che!','¡Che! ¡Che, Pedro! ¡Che, acá, che!'),L2('Che! What\'s up, che! Che, is Sofi talking about seals again, che?','¡Che! ¡Qué hacés, che! Che, ¿la Sofi sigue hablando de focas, che?'),L2('Che, obviously, che.','Che, obvio, che.'),L2('Che, che, che. Classic, che.','Che, che, che. Clásico, che.')],
    [L2('Che, Pedro, lend me the boat, che, che.','Che, Pedro, prestame el bote, che, che.'),L2('Che, no, che, the boat stays, che.','Che, no, che, el bote no se presta, che.'),L2('Che, just one lap, che!','¡Che, una vueltita nomás, che!'),L2('Che… OK, che. But you row, che. Che, che.','Che… bueno, che. Pero remás vos, che. Che, che.')],
    [L2('Che, Pedro, is there any fish in the lake, che?','Che, Pedro, ¿hay pescado en el lago, che?'),L2('Che, none, che! pH 2.6, che. Only rotifers, che.','¡Che, ninguno, che! pH 2,6, che. Solo rotíferos, che.'),L2('Che, and rotifer asado, che?','Che, ¿y asado de rotíferos, che?'),L2('Che, you\'d need a million, che. Che, che, che.','Che, necesitarías un millón, che. Che, che, che.')]];
  function cheChat(D,name,pos,voice){const L=pk(D);let t=0;L.forEach((l,i)=>{const mine=i%2===0;setTimeout(()=>{const s=l();
      if(mine){toast(`<b>${LX('YOU','TÚ')}:</b> ${s}`,false,3000);say(s,2.8);AU.sfx.voice(6,CHARS[charIdx].f?225:140);}
      else{toast(`<b>${name}:</b> ${s}`,false,3400);npcSay(s,pos(),3);AU.sfx.voice(10,voice);}},t);t+=mine?1700:2700;});}
  function cheCaniche(){if(!isArg())return false;cheChat(CHE_CANICHE,'CANICHE',()=>{const cn=Wd.caniche;return cn?[cn.position.x,cn.position.y+.5,cn.position.z]:headPos();},118);return true;}
  // Pedro on the R/V Caviahue gives one fact about the lake per shout, in order
  const LAKE_FACTS=[L2('Lake Caviahue is about 9 km², a horseshoe with a north and a south arm. Up to ~95 m deep!','El Lago Caviahue tiene unos 9 km², es una herradura con brazo norte y brazo sur. ¡Hasta ~95 m de profundidad!'),
    L2('pH around 2.6 today: acid as lemon juice. The Río Agrio brings it straight from the Copahue volcano.','pH cerca de 2,6 hoy: ácido como jugo de limón. El Río Agrio lo trae directo del volcán Copahue.'),
    L2('The water is loaded with sulfate, iron and aluminium. That is why it looks so turquoise.','El agua está cargada de sulfato, hierro y aluminio. Por eso se ve tan turquesa.'),
    L2('No fish here. Not one! Too acidic.','Aquí no hay peces. ¡Ni uno! Demasiado ácido.'),
    L2('No copepods, no cladocerans, no molluscs either. The zooplankton is almost only rotifers.','Tampoco hay copépodos, ni cladóceros, ni moluscos. El zooplancton es casi puro rotífero.'),
    L2('The phytoplankton is dominated by a tiny green alga, <i>Keratococcus</i>. It loves the acid.','El fitoplancton lo domina una microalga verde chiquitita, <i>Keratococcus</i>. Le encanta el ácido.'),
    L2('Down in the mud, midge larvae (chironomids) are about the only animals that make it.','Abajo en el barro, las larvas de mosquito (quironómidos) son casi los únicos animales que aguantan.'),
    L2('We lower the Niskin bottle to take water at different depths: surface, 20 m, the bottom…','Bajamos la botella Niskin para sacar agua a distintas profundidades: superficie, 20 m, el fondo…'),
    L2('Extreme lake, extreme microbes: that is why we come to sample it!','Lago extremo, microbios extremos: ¡por eso venimos a muestrearlo!')];
  let lakeFactI=0;
  function talkBoat(){const arg=isArg();if(arg&&Math.random()<.6){cheChat(CHE_BOAT,'PEDRO (R/V Caviahue)',()=>[BOAT.x,lakeY()+.5,BOAT.z],125);return;}
    const you=arg?pk([LX('Che, Pedro! Che, che, how\'s it going, che?','¡Che, Pedro! Che, che, ¿cómo va eso, che?'),LX('Che! Che, Pedro! Che, over here, che!','¡Che! ¡Che, Pedro! ¡Che, acá, che!'),LX('Che, Pedro, lend me the boat, che, che.','Che, Pedro, prestame el bote, che, che.')]):LX('Ahoy, R/V Caviahue! How is the lake today?','¡Ah del barco, R/V Caviahue! ¿Cómo está el lago hoy?');
    let rep=arg?pk([LX('Che, che, che! All good, che. Here throwing the Niskin, che.','¡Che, che, che! Todo bien, che. Acá tirando la Niskin, che.'),LX('Che! What\'s up, che! The lake is pH 2.6, che. Che.','¡Che! ¡Qué hacés, che! El lago está a pH 2,6, che. Che.'),LX('Che, no, che, the boat stays, che. Che, che, che.','Che, no, che, el bote no se presta, che. Che, che, che.')]):
      (Math.random()<.85?'🌊 '+LAKE_FACTS[lakeFactI++%LAKE_FACTS.length]():pk([LX('Tell the truck team to bring more dry ice!','¡Dile al equipo de la camioneta que traiga más hielo seco!'),LX('Sofi says hi! …and something about seals.','¡Sofi te manda saludos! …y algo sobre focas.')]));
    if(arg&&Math.random()<.6)rep='🌊 '+LAKE_FACTS[lakeFactI++%LAKE_FACTS.length]()+' '+LX('Che.','Che.');
    toast(`<b>${LX('YOU','TÚ')}:</b> ${you}`,false,3200);AU.sfx.voice(6,CHARS[charIdx].f?225:140);say(you,2.8);
    setTimeout(()=>{toast('<b>PEDRO (R/V Caviahue):</b> '+rep,false,5500);npcSay(rep,[BOAT.x,lakeY()+.5,BOAT.z],4.5);AU.sfx.voice(10,125);},1600);}
  // ================= PERKS 2: Ricardo, Yasna, Catalina, Cata, Fernando, Celia, Gustavo, Ana, Sofi, Issotta
  const X2={};
  // ---- generic step sequencer on the game's audio graph
  function seqMusic(dur,vol,bpm,fn){const A=AU.raw&&AU.raw();if(!A)return;const {C,master}=A;const out=C.createGain();out.gain.value=vol;out.connect(master);
    const t0=C.currentTime+.05,s16=60/bpm/4,fq=n=>440*Math.pow(2,(n-69)/12);
    const nb=C.createBuffer(1,C.sampleRate*.3,C.sampleRate),nd=nb.getChannelData(0);for(let i=0;i<nd.length;i++)nd[i]=Math.random()*2-1;
    const osc=(type,f,t,d,g,f2)=>{const o=C.createOscillator(),e=C.createGain();o.type=type;o.frequency.setValueAtTime(f,t);if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+d*.8);e.gain.setValueAtTime(0,t);e.gain.linearRampToValueAtTime(g,t+.006);e.gain.exponentialRampToValueAtTime(.0005,t+d);o.connect(e);e.connect(out);o.start(t);o.stop(t+d+.03);return o;};
    const noise=(t,d,g,ftype,ff,q)=>{const s=C.createBufferSource();s.buffer=nb;const fl=C.createBiquadFilter();fl.type=ftype;fl.frequency.value=ff;if(q)fl.Q.value=q;const e=C.createGain();e.gain.setValueAtTime(g,t);e.gain.exponentialRampToValueAtTime(.0005,t+d);s.connect(fl);fl.connect(e);e.connect(out);s.start(t);s.stop(t+d+.05);};
    const vib=(f,t,d,g)=>{const o=C.createOscillator(),e=C.createGain(),l=C.createOscillator(),lg=C.createGain(),fl=C.createBiquadFilter();o.type='sawtooth';o.frequency.setValueAtTime(f,t);l.frequency.value=5.5;lg.gain.value=f*.012;l.connect(lg);lg.connect(o.frequency);
      fl.type='bandpass';fl.frequency.value=900;fl.Q.value=1.2;e.gain.setValueAtTime(0,t);e.gain.linearRampToValueAtTime(g,t+.04);e.gain.setValueAtTime(g,t+d*.75);e.gain.exponentialRampToValueAtTime(.0005,t+d);o.connect(fl);fl.connect(e);e.connect(out);o.start(t);l.start(t);o.stop(t+d+.05);l.stop(t+d+.05);};
    const n16=Math.floor(dur/s16);for(let i=0;i<n16;i++)fn(i,t0+i*s16,s16,{osc,noise,vib,fq});
    setTimeout(()=>{try{out.disconnect();}catch(e){}},(dur+1.5)*1000);}
  const kick=(T,t)=>{const o=T.osc('sine',150,t,.25,.8);o.frequency.exponentialRampToValueAtTime(45,t+.2);};
  function salsaMusic(dur){seqMusic(dur,.5,100,(i,t,s,T)=>{const b=i%32,bar=i%16,ch=[[48,52,55,60],[53,57,60,65],[55,59,62,67],[53,57,60,65]][Math.floor(i/16)%4];
    if([0,6,12,20,24].includes(b))T.noise(t,.05,.5,'bandpass',2600,6);             // son clave 3-2
    if(bar%4===0)T.osc('square',820,t,.07,.05);                                     // cowbell
    if(bar===12||bar===14)T.osc('sine',210,t,.18,.35,190);if(bar===4)T.noise(t,.05,.3,'bandpass',900,2); // congas: open tones + slap
    if(bar===6||bar===12)T.osc('triangle',T.fq(ch[0]-12),t,s*5,.35);               // bass tumbao
    const mont=[0,2,1,3,0,2,1,3];if(i%2===1||bar===0)T.osc('square',T.fq(ch[mont[bar%8]]+12),t,s*.8,.045); // piano montuno
    if(bar%8===0)T.osc('sawtooth',T.fq(ch[3]+12),t,s*2,.03,T.fq(ch[3]+12)*1.01);});}
  function karaokeMusic(dur){const mel=[64,64,67,69,67,64,62,60,62,64,64,62,60,62,64,null];seqMusic(dur,.5,104,(i,t,s,T)=>{const bar=i%16,ch=[[48,52,55],[45,48,52],[41,45,48],[43,47,50]][Math.floor(i/16)%4];
    if(bar%4===0)kick(T,t);if(bar===4||bar===12)T.noise(t,.18,.45,'bandpass',1500);if(i%2===1)T.noise(t,.03,.12,'highpass',7000);
    if(bar%2===0)T.osc('triangle',T.fq(ch[0]-12),t,s*1.8,.3);if(bar===0)ch.forEach(n=>T.osc('triangle',T.fq(n+12),t,s*16,.04));
    if(bar%2===0){const n=mel[(Math.floor(i/2))%16];if(n)T.vib(T.fq(n),t,s*1.9,.09);}});}
  function styleMusic(st,dur){
    if(st==='ballet')seqMusic(dur,.45,132,(i,t,s,T)=>{const b=i%12,ch=[[60,64,67],[57,60,64],[53,57,60],[55,59,62]][Math.floor(i/12)%4];if(b===0)T.osc('triangle',T.fq(ch[0]-12),t,s*4,.3);if(b===4||b===8)ch.forEach(n=>T.osc('triangle',T.fq(n),t,s*3,.05));if(i%2===0)T.osc('sine',T.fq(ch[(i/2)%3]+24),t,s*1.5,.05);});
    else if(st==='cueca')seqMusic(dur,.5,160,(i,t,s,T)=>{const b=i%12,ch=[[55,59,62,67],[50,54,57,62]][Math.floor(i/24)%2];if(b%2===0)ch.forEach((n,k)=>T.osc('sawtooth',T.fq(n),t+k*.012,s*1.6,.028));if(b===0||b===6||b===9)T.noise(t,.05,.5,'bandpass',1800,2);if(b===0)T.osc('triangle',T.fq(ch[0]-12),t,s*5,.3);});
    else if(st==='tango')seqMusic(dur,.5,120,(i,t,s,T)=>{const b=i%16,ch=[[57,60,64],[52,56,59]][Math.floor(i/16)%2];if(b%4===0)ch.forEach(n=>T.osc('square',T.fq(n),t,s*.9,.035));if(b===0||b===6||b===12)T.osc('triangle',T.fq(ch[0]-12),t,s*2,.35);if(b===14)T.osc('square',T.fq(ch[2]+12),t,s*1.5,.05);});
    else if(st==='flamenco')seqMusic(dur,.5,180,(i,t,s,T)=>{const b=i%24;if([0,6,12,16,20].includes(b))T.noise(t,.06,.6,'bandpass',2200,2);if(b%6===0)[52,56,59,64].forEach((n,k)=>T.osc('sawtooth',T.fq(n),t+k*.015,s*2,.03));if(b===0)T.osc('triangle',T.fq(40),t,s*6,.3);});
    else seqMusic(dur,.5,120,(i,t,s,T)=>{const b=i%16;if(b%4===0)kick(T,t);if(b%4===2)T.noise(t,.05,.2,'highpass',6000);if(b===4||b===12)T.noise(t,.14,.35,'bandpass',1800);if(b%2===0)T.osc('sawtooth',T.fq([45,57][(b/2)%2]),t,s*.9,.12);});}
  function applause(sec=3.2){const A=AU.raw&&AU.raw();if(!A)return;const {C,master}=A;const nb=C.createBuffer(1,C.sampleRate*.05,C.sampleRate),d=nb.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/(d.length*.18));
    const t0=C.currentTime+.02;for(let k=0;k<Math.floor(sec*70);k++){const t=t0+Math.random()*sec,s=C.createBufferSource();s.buffer=nb;const f=C.createBiquadFilter();f.type='bandpass';f.frequency.value=900+Math.random()*2400;f.Q.value=.9;const g=C.createGain();const fade=1-Math.max(0,(t-t0)/sec-.6)*2.2;g.gain.value=.18*Math.max(.1,fade);s.connect(f);f.connect(g);g.connect(master);s.start(t);}
    [0,500,1100].forEach(w=>setTimeout(()=>AU.sfx.voice(2,180+Math.random()*80),w));}
  const shutter=()=>{beep(4200,.012,'square',.05);setTimeout(()=>beep(2600,.02,'square',.04),60);};
  const sealBark=()=>{for(let i=0;i<3;i++)setTimeout(()=>{AU.sfx.voice(1,300-i*25);beep(260-i*20,.12,'sawtooth',.05);},i*260);};
  const slap=()=>{AU.sfx.stamp();};
  const evilLaugh=()=>{for(let i=0;i<7;i++)setTimeout(()=>AU.sfx.voice(1,190-i*11),i*150);setTimeout(()=>beep(90,.5,'sawtooth',.04),1100);};
  const splatDOM=()=>{const d=document.createElement('div');d.style.cssText='position:fixed;inset:0;background:#fff;opacity:.55;pointer-events:none;z-index:60;transition:opacity .25s';document.body.appendChild(d);requestAnimationFrame(()=>requestAnimationFrame(()=>d.style.opacity='0'));setTimeout(()=>d.remove(),400);};
  // ---- props attached to the player
  function prop(u,g,kind){u.pk=u.pk||{};if(u.pk[kind])return u.pk[kind];const p=new THREE.Group();
    if(kind==='mic'){p.position.set(0,-.068,0);u.armR.add(p);A_(p,new THREE.CylinderGeometry(.003,.0022,.022,8),'#1d1a2b',.004,.006,0);A_(p,new THREE.SphereGeometry(.0055,8,6),'#c9c9d1',.004,.019,0);}
    else if(kind==='hanky'){p.position.set(0,-.07,0);u.armR.add(p);const h=A_(p,new THREE.PlaneGeometry(.03,.03),'#ffffff',.0,-.012,0);h.material.side=THREE.DoubleSide;p.userData.h=h;}
    else if(kind==='glam'){g.add(p);
      for(let k=0;k<16;k++){const a=k/16*6.283;A_(p,new THREE.SphereGeometry(.0075,6,5),k%2?'#ff5fb4':'#ff9fd6',Math.cos(a)*.023,.152+Math.sin(a*2)*.003,Math.sin(a)*.023);}
      [-1,1].forEach(s=>{for(let k=0;k<5;k++)A_(p,new THREE.SphereGeometry(.0065,6,5),'#ff5fb4',.02,.14-k*.012,.02*s);});
      const hat=A_(p,new THREE.CylinderGeometry(.014,.015,.05,12),'#ffd23f',-.002,.215,0);A_(p,new THREE.CylinderGeometry(.026,.026,.003,16),'#ffd23f',-.002,.192,0);A_(p,new THREE.ConeGeometry(.004,.05,5),'#b15cff',-.012,.25,.008).rotation.z=.5;
      [-1,1].forEach(s=>{const st=A_(p,new THREE.OctahedronGeometry(.011),0xffd23f,.02,.178,.0085*s,true);st.scale.set(.25,1,1);});A_(p,new THREE.BoxGeometry(.002,.003,.006),'#1d1a2b',.021,.178,0);
      const cape=A_(p,new THREE.PlaneGeometry(.055,.09),'#b15cff',-.024,.105,0);cape.rotation.y=Math.PI/2;cape.material.side=THREE.DoubleSide;hat.userData.x=1;}
    else if(kind==='green'){g.add(p);const m=new THREE.Mesh(new THREE.SphereGeometry(.0195,12,10),new THREE.MeshBasicMaterial({color:0x5bd14b,transparent:true,opacity:.55,depthWrite:false}));m.position.y=.172;m.scale.set(.97,1.12,.93);p.add(m);}
    p.visible=false;u.pk[kind]=p;return p;}
  const hideProps=u=>{if(u&&u.pk)['mic','hanky','glam','green'].forEach(k=>{if(u.pk[k])u.pk[k].visible=false;});};
  // ---- Yasna's animal choir
  function animalModel(kind){const g=new THREE.Group(),a=(geo,c,x,y,z)=>A_(g,geo,c,x,y,z),S=(r)=>new THREE.SphereGeometry(r,10,8),B=(x,y,z)=>new THREE.BoxGeometry(x,y,z);
    const legs=(c,n,h,dx,dz,r=.005)=>{for(let i=0;i<n;i++){const x=(i<2?dx:-dx),z=(i%2?dz:-dz);a(new THREE.CylinderGeometry(r,r,h,5),c,x,h/2,z);}};
    if(kind==='dog'||kind==='dog2'||kind==='dog3'){const c=kind==='dog'?'#c9954c':kind==='dog2'?'#222025':'#f4efe6',e=kind==='dog3'?'#c9954c':'#1d1a2b';legs(c,4,.04,.025,.014);a(S(.024),c,0,.055,0).scale.set(1.7,1,1);a(S(.019),c,.043,.08,0);a(B(.018,.012,.016),c,.06,.075,0);a(S(.0045),'#1d1a2b',.069,.079,0);
      [-1,1].forEach(s=>{a(B(.008,.022,.008),e,.038,.083,.013*s).rotation.x=.3*s;a(S(.003),'#1d1a2b',.056,.088,.008*s);});const t=a(new THREE.CylinderGeometry(.003,.004,.03,5),c,-.045,.07,0);t.rotation.z=.9;g.userData.tail=t;}
    else if(kind==='cat'){const c='#8a8a92';legs(c,4,.03,.02,.011,.004);a(S(.02),c,0,.045,0).scale.set(1.6,.9,.9);a(S(.017),c,.035,.07,0);[-1,1].forEach(s=>{a(new THREE.ConeGeometry(.006,.013,4),c,.035,.088,.009*s);a(S(.0032),'#9cff5b',.05,.073,.007*s);});a(S(.0025),'#ff8fb1',.052,.066,0);
      const t=a(new THREE.CylinderGeometry(.003,.003,.05,5),c,-.04,.07,0);t.rotation.z=-.4;g.userData.tail=t;[0,1,2].forEach(k=>a(B(.012,.003,.035),'#5a5a62',-.012+k*.012,.062,0));}
    else if(kind==='duck'){a(S(.022),'#ffd23f',0,.028,0).scale.set(1.4,.9,1);a(S(.015),'#ffd23f',.022,.055,0);a(B(.016,.005,.012),'#ff8a1c',.04,.053,0);[-1,1].forEach(s=>a(S(.0028),'#1d1a2b',.03,.06,.008*s));}
    else if(kind==='hen'){a(S(.022),'#b85a2a',0,.045,0).scale.set(1.3,1,.9);a(S(.013),'#b85a2a',.022,.07,0);a(new THREE.ConeGeometry(.004,.01,5),'#ffb21a',.036,.068,0).rotation.z=-Math.PI/2;for(let k=0;k<3;k++)a(S(.0045),'#e8262b',.016+k*.006,.084,0);
      legs('#ffb21a',2,.026,0,.008,.002);for(let k=0;k<3;k++)a(new THREE.ConeGeometry(.007,.025,5),'#3a2a20',-.028,.055+k*.004,(k-1)*.007).rotation.z=.8;}
    else if(kind==='parrot'){a(S(.014),'#27c24c',0,.05,0).scale.set(1,1.5,1);a(S(.011),'#27c24c',.004,.075,0);a(new THREE.ConeGeometry(.005,.011,5),'#ffd23f',.016,.073,0).rotation.z=-Math.PI/2;a(S(.004),'#e8262b',.006,.086,0);
      const t=a(B(.006,.03,.012),'#2d6cff',-.01,.028,0);t.rotation.z=.4;[-1,1].forEach(s=>a(B(.014,.022,.004),'#e8262b',-.002,.05,.012*s));a(new THREE.CylinderGeometry(.002,.002,.03,4),'#8a5a33',0,.02,0).rotation.x=Math.PI/2;}
    else if(kind==='rabbit'){a(S(.021),'#f7f5f0',0,.03,0).scale.set(1.3,1,1);a(S(.015),'#f7f5f0',.024,.052,0);[-1,1].forEach(s=>{a(B(.006,.03,.009),'#f7f5f0',.02,.078,.006*s);a(S(.0026),'#e8262b',.036,.056,.006*s);});a(S(.007),'#ffffff',-.028,.036,0);}
    else if(kind==='guinea'){a(S(.02),'#d99a5a',0,.024,0).scale.set(1.5,.9,1);a(S(.014),'#f4efe6',.022,.026,0);a(S(.009),'#3a2418',-.01,.038,0);[-1,1].forEach(s=>a(S(.0026),'#1d1a2b',.034,.03,.007*s));}
    else if(kind==='roach'){a(S(.016),'#6b3a1c',0,.012,0).scale.set(1.6,.5,1);a(S(.007),'#3a1f10',.024,.012,0);[-1,1].forEach(s=>{const an=a(new THREE.CylinderGeometry(.0008,.0008,.035,3),'#3a1f10',.04,.03,.006*s);an.rotation.z=-1;an.rotation.x=.3*s;
      for(let k=0;k<3;k++){const l=a(new THREE.CylinderGeometry(.001,.001,.02,3),'#3a1f10',-.01+k*.01,.006,.012*s);l.rotation.x=1.1*s;}});g.scale.setScalar(1.4);}
    return g;}
  const CHOIR=[['dog','Pituca','🐶',LX2('woof','guau')],['dog2','Negro','🐕',LX2('WOOF','GUAU')],['dog3','Motita','🐩',LX2('arf','arf')],['cat','Culli','🐱',LX2('meow','miau')],['duck','Cuack','🦆',LX2('quack','cuac')],
    ['hen','Turuleca','🐔',LX2('cluck','cocorocó')],['parrot','Lorenzo','🦜',LX2('SQUAWK','¡LORO LINDO!')],['rabbit','Copito','🐰',LX2('*thump*','*tum tum*')],['guinea','Cuyi','🐹',LX2('wheek','uiik')],['roach','La Cucaracha','🪳',LX2('♪ tiki-tiki ♪','♪ tiki-tiki ♪')]];
  function LX2(en,es){return ()=>LX(en,es);}
  const LYRICS=[L2('♪ Twenty litres of acid love… ♪','♪ Veinte litros de amor ácido… ♪'),L2('♪ My 0.22 filter clogged my heart ♪','♪ Mi filtro 0,22 me tapó el corazón ♪'),L2('♪ Oh Copahue, pH one, pH twooo ♪','♪ Oh Copahue, pH uno, pH dooos ♪'),
    L2('♪ Me and my critters, singing on the volcano ♪','♪ Mis bichos y yo, cantando en el volcán ♪'),L2('♪ Shotgun, shotgun, sequence me tonight ♪','♪ Shotgun, shotgun, secuénciame esta noche ♪'),L2('♪ Everybody now! ♪','♪ ¡Todos juntos! ♪')];
  X2.karaoke={start(A,u){prop(u,pl.g,'mic').visible=true;karaokeMusic(A.dur);say(LX('🎤 KARAOKE TIME! Everybody, come!','🎤 ¡HORA DEL KARAOKE! ¡Vengan todos!'),2.6);
      const f=[Math.cos(A.yaw),-Math.sin(A.yaw)],sd=[Math.sin(A.yaw),Math.cos(A.yaw)];A.an=CHOIR.map((c,i)=>{const g=animalModel(c[0]);const k=i-(CHOIR.length-1)/2,ang=k*.3;const r=.2+Math.abs(k)*.018;
        const x=pl.x+f[0]*(Math.cos(ang)*r*.55+.06)+sd[0]*Math.sin(ang)*r*1.4,z=pl.z+f[1]*(Math.cos(ang)*r*.55+.06)+sd[1]*Math.sin(ang)*r*1.4;g.position.set(x,Wd.heightAt(x,z),z);g.rotation.y=A.yaw;g.scale.multiplyScalar(1.5);g.visible=false;Wd.scene.add(g);return {g,c,x,z,in:.25+i*.18,sang:-1};});
      const tv=new THREE.Group();A_(tv,new THREE.BoxGeometry(.012,.07,.1),'#1d1a2b',0,.1,0);const sc=A_(tv,new THREE.PlaneGeometry(.085,.058),0x7a2cff,.0065,.1,0,true);sc.rotation.y=Math.PI/2;A_(tv,new THREE.CylinderGeometry(.003,.003,.065,6),'#555',0,.033,0);
      const tx=pl.x-f[0]*.3+sd[0]*.12,tz=pl.z-f[1]*.3+sd[1]*.12;tv.position.set(tx,Wd.heightAt(tx,tz),tz);tv.rotation.y=A.yaw;tv.scale.setScalar(1.6);Wd.scene.add(tv);A.tv=tv;A.sc=sc;},
    tick(A,dt,t){A.an.forEach((o,i)=>{if(!o.g.visible&&A.t>=o.in&&A.t<A.dur-.4){o.g.visible=true;puff(o.x,o.z);spark(o.x,Wd.heightAt(o.x,o.z)+.08,o.z,6,undefined,.3,.8,.035);AU.sfx.voice(1,300+i*25);}
        if(o.g.visible&&A.t>=A.dur-.4+i*.02){o.g.visible=false;puff(o.x,o.z);}
        const b=A.t*104/60;o.g.position.y=Wd.heightAt(o.x,o.z)+Math.abs(Math.sin((b+i*.5)*Math.PI))*.02;o.g.rotation.z=Math.sin(b*Math.PI+i)*.12;if(o.g.userData.tail)o.g.userData.tail.rotation.x=Math.sin(t*14+i)*.6;
        if(o.g.visible&&A.t>1.6&&Math.floor((A.t-1.6)/.7)%CHOIR.length===i&&o.sang!==Math.floor((A.t-1.6)/(.7*CHOIR.length))){o.sang=Math.floor((A.t-1.6)/(.7*CHOIR.length));const y=Wd.heightAt(o.x,o.z)+.2;npcSay(`${o.c[2]} <b>${o.c[1]}</b>: ♪ ${o.c[3]()} ♪`,[o.x,y,o.z],1.3);}});
      if(A.sc)A.sc.material.color.setHSL((t*.3)%1,.8,.55);
      const li=Math.floor((A.t-.4)/2.1);if(li>=0&&li!==A.li&&li<LYRICS.length){A.li=li;say('🎤 '+LYRICS[li](),2);A.sp=0;}
      A.sp=(A.sp||0)-dt;if(A.sp<=0){A.sp=.3;spark(pl.x,pl.g.position.y+.34,pl.z,2,pk([0xff2d95,0x00e5ff,0xffd23f]),.3,1,.035);}},
    pose(A,u,g){const b=A.t*104/60,s=Math.sin(b*Math.PI);g.rotation.y=A.yaw+Math.sin(b*Math.PI/2)*.25;u.armR.rotation.z=2.5+s*.08;u.armR.rotation.x=.25;u.armL.rotation.z=.6+Math.max(0,s)*1.8;u.legL.rotation.z=Math.max(0,s)*.2;u.legR.rotation.z=Math.max(0,-s)*.2;g.rotation.x=s*.08;g.position.y+=Math.abs(s)*.008;u.can.visible=false;},
    end(A){A.an.forEach(o=>Wd.scene.remove(o.g));if(A.tv){puff(A.tv.position.x,A.tv.position.z);Wd.scene.remove(A.tv);}if(A.g===pl.g){say(LX('Thank you, my babies! 🐾💖','¡Gracias, mis bebés! 🐾💖'),2.4);applause(2);}}};
  // ---- Abraham: grand piano recital in a tailcoat (alternates with his breakfasts)
  function pianoModel(){const g=new THREE.Group(),blk='#0d0d10';
    // case outline seen from above (x = away from the pianist, z = across the keyboard): straight bass side, curved treble side, round tail
    const sh=new THREE.Shape(),P=(x,z)=>[x,-z];sh.moveTo(...P(0,-.16));sh.lineTo(...P(.4,-.16));sh.quadraticCurveTo(...P(.47,-.16),...P(.46,-.07));
    sh.bezierCurveTo(...P(.44,.0),...P(.3,-.01),...P(.2,.08));sh.quadraticCurveTo(...P(.13,.16),...P(.06,.16));sh.lineTo(...P(0,.16));sh.lineTo(...P(0,-.16));
    const ext=(d)=>new THREE.ExtrudeGeometry(sh,{depth:d,bevelEnabled:false,curveSegments:14}).rotateX(-Math.PI/2);
    const body=A_(g,ext(.055),blk,.12,.115,0);body.material.side=THREE.DoubleSide;
    A_(g,ext(.004),'#5a3a1e',.12,.166,0).scale.set(.97,1,.97);                         // wooden soundboard inside
    for(let k=0;k<9;k++){const s=A_(g,new THREE.BoxGeometry(.3-k*.018,.0015,.002),'#c9a24a',.29-k*.006,.171,-.12+k*.026);s.material.emissive&&s.material.emissive.set('#000');}  // strings
    const lid=new THREE.Group();lid.position.set(.12,.172,-.16);lid.rotation.x=-.62;g.add(lid);A_(lid,ext(.004),blk,0,0,.16);g.userData.lid=lid;   // lid hinged on the bass side
    const stick=A_(g,new THREE.CylinderGeometry(.002,.002,.16,5),blk,.3,.235,.03);stick.rotation.x=-.5;
    A_(g,new THREE.BoxGeometry(.06,.026,.32),blk,.105,.13,0);                            // keybed
    A_(g,new THREE.BoxGeometry(.045,.008,.3),'#f6f3ea',.1,.147,0);                       // white keys
    for(let i=0;i<36;i++){const n=i%7;if(n===2||n===6)continue;A_(g,new THREE.BoxGeometry(.028,.007,.0045),'#111',.11,.153,-.145+i*.0083+.004);}
    for(let i=0;i<36;i++)A_(g,new THREE.BoxGeometry(.044,.0004,.0006),'#9a9a9a',.1,.1513,-.145+i*.0083);   // key gaps
    [-1,1].forEach(s=>A_(g,new THREE.BoxGeometry(.06,.03,.012),blk,.105,.15,.166*s));     // cheek blocks
    const desk=A_(g,new THREE.BoxGeometry(.004,.05,.14),blk,.135,.19,0);desk.rotation.z=.25;
    const sheet=A_(g,new THREE.PlaneGeometry(.1,.045),'#fbf7ea',.131,.193,0,true);sheet.rotation.set(0,-Math.PI/2,0);sheet.rotation.order='YXZ';sheet.rotation.x=.25;sheet.material.side=THREE.DoubleSide;
    [[.14,-.13],[.14,.13],[.43,-.08]].forEach(p=>{A_(g,new THREE.CylinderGeometry(.009,.007,.115,8),blk,p[0],.058,p[1]);A_(g,new THREE.SphereGeometry(.008,6,4),'#c9a24a',p[0],.004,p[1]);});
    const lyre=A_(g,new THREE.BoxGeometry(.012,.1,.03),blk,.15,.06,0);A_(g,new THREE.BoxGeometry(.03,.004,.008),'#c9a24a',.135,.01,-.008);A_(g,new THREE.BoxGeometry(.03,.004,.008),'#c9a24a',.135,.01,.008);
    A_(g,new THREE.CylinderGeometry(.004,.005,.03,8),'#f4efe0',.37,.2,-.13);const fl=A_(g,new THREE.SphereGeometry(.004,6,5),0xffc24a,.37,.219,-.13,true);fl.scale.set(.7,1.5,.7);g.userData.flame=fl;  // candle on the lid edge
    // bench
    A_(g,new THREE.BoxGeometry(.07,.016,.16),'#0d0d10',-.005,.068,0);A_(g,new THREE.BoxGeometry(.066,.008,.155),'#7a1020',-.005,.08,0);
    [[-.03,-.07],[-.03,.07],[.02,-.07],[.02,.07]].forEach(p=>A_(g,new THREE.CylinderGeometry(.004,.004,.06,6),'#0d0d10',p[0],.03,p[1]));
    return g;}
  // tailcoat worn over the character's clothes (local person coordinates, before the 1.7 scale)
  function fracProp(u,g){u.pk=u.pk||{};if(u.pk.frac)return u.pk.frac;const p=new THREE.Group(),Q=Wd.Q,blk=Wd.toon('#141418'),wht=Wd.toon('#fbfbf6');
    const sh=(S,m)=>{const o=Q.loft(S,10,'#ffffff',true);o.material=m;return o;};
    p.add(sh([[0,.084,.0176,.0222],[0,.104,.0158,.0192],[.001,.124,.018,.0218],[0,.142,.0164,.0244],[0,.149,.012,.0175],[0,.1525,.0078,.0088]],blk));
    const vest=A_(p,new THREE.BoxGeometry(.004,.05,.013),'#fbfbf6',.0178,.123,0);vest.material=wht;
    [-1,1].forEach(s=>{const l=A_(p,new THREE.BoxGeometry(.003,.04,.006),'#141418',.0186,.128,.0068*s);l.rotation.x=.32*s;});   // lapels
    [-1,1].forEach(s=>{const b=A_(p,new THREE.ConeGeometry(.0035,.007,4),'#141418',.0102,.1495,.0035*s);b.rotation.x=-Math.PI/2*s;});A_(p,new THREE.SphereGeometry(.0018,5,4),'#141418',.0105,.1495,0); // bow tie
    for(let k=0;k<3;k++)A_(p,new THREE.SphereGeometry(.0011,4,3),'#141418',.0201,.132-k*.009,0);
    const tails=[-1,1].map(s=>{const t=A_(p,new THREE.BoxGeometry(.0028,.062,.015),'#141418',-.0175,.06,.0078*s);t.rotation.x=.08*s;return t;});p.userData.tails=tails;
    const sleeve=()=>{const o=sh([[0,.0045,.0071,.0071],[0,-.028,.0061,.0063],[.0008,-.033,.0059,.006],[0,-.054,.005,.0051]],blk);const c=new THREE.Mesh(new THREE.CylinderGeometry(.0052,.0052,.004,8),wht);c.position.y=-.057;o.add(c);return o;};
    const sl=[sleeve(),sleeve()];u.armL.add(sl[0]);u.armR.add(sl[1]);
    const trouser=()=>sh([[0,.0045,.0093,.0093],[.001,-.03,.0073,.0075],[.0015,-.036,.0075,.0077],[0,-.059,.0057,.006]],blk);const tr=[trouser(),trouser()];u.legL.add(tr[0]);u.legR.add(tr[1]);
    p.userData.parts=[...sl,...tr];g.add(p);p.visible=false;u.pk.frac=p;
    const vis=p.visible;Object.defineProperty(p,'shown',{set(v){p.visible=v;p.userData.parts.forEach(o=>o.visible=v);},get(){return p.visible;}});p.shown=vis;return p;}
  // Abraham's repertoire (all public domain). mel: [midi (0 = rest), 16ths, chord]; chords: {b: bass, c: [notes]}; st: arp | block | waltz
  const SONGS=(()=>{const el=[[76,1],[75,1],[76,1],[75,1],[76,1],[71,1],[74,1],[72,1],[69,2,'A'],[0,1],[60,1],[64,1],[69,1],[71,2,'E'],[0,1]];
    const ode=e=>[[64,4,'C'],[64,4],[65,4],[67,4],[67,4,'G'],[65,4],[64,4],[62,4],[60,4,'C'],[60,4],[62,4],[64,4],...e];
    const gy=[[0,12,'G'],[0,12,'D'],[0,12,'G'],[0,12,'D'],[0,4,'G'],[78,4],[81,4],[79,4,'D'],[78,4],[73,4],[71,4,'G'],[73,4],[74,4],[69,12,'D'],[66,12,'G'],[66,12,'D'],[66,12,'G'],[66,12,'D']];
    const tk=[[71,1],[69,1],[68,1],[69,1],[72,4,'Am'],[74,1],[72,1],[71,1],[72,1],[76,4,'Am'],[77,1],[76,1],[75,1],[76,1],[83,1],[81,1],[80,1],[81,1],[83,1],[81,1],[80,1],[81,1],[84,4,'Am'],[81,2],[84,2],
      [83,2,'E'],[81,2],[79,2],[81,2],[83,2,'E'],[81,2],[79,2],[81,2],[83,2,'E'],[81,2],[79,2],[78,2],[76,4,'Am'],[0,4]];
    const cn=[[78,4,'D'],[76,4,'A'],[74,4,'Bm'],[73,4,'Fm'],[71,4,'G'],[69,4,'D'],[71,4,'G'],[73,4,'A'],[74,4,'D'],[73,4,'A'],[71,4,'Bm'],[69,4,'Fm'],[67,4,'G'],[66,4,'D'],[67,4,'G'],[64,4,'A'],[66,8,'D']];
    const br=[[64,2,'C'],[64,2],[67,6],[64,2],[64,2,'C'],[67,6],[64,2],[67,2,'G'],[72,4],[71,4],[69,4,'F'],[69,4],[67,4],[62,2,'G'],[64,2],[65,4],[62,4],[62,2,'G'],[64,2],[65,8],[62,2,'G'],[65,2],[71,2],[69,2],[67,4],[71,4,'C'],[72,8]];
    return [{n:['Für Elise (Beethoven)','Para Elisa (Beethoven)'],bpm:72,st:'arp',ch:{A:{b:45,c:[52,57]},E:{b:40,c:[52,56]}},mel:[...el,[64,1],[68,1],[71,1],[72,2,'A'],[0,1],[64,1],...el,[64,1],[72,1],[71,1],[69,4,'A'],[0,2]]},
      {n:['Ode to Joy (Beethoven)','Himno de la alegría (Beethoven)'],bpm:100,st:'block',ch:{C:{b:36,c:[48,52,55]},G:{b:43,c:[47,50,53]}},mel:[...ode([[64,6,'G'],[62,2],[62,8]]),...ode([[62,6,'G'],[60,2],[60,8,'C']])]},
      {n:['Gymnopédie No. 1 (Satie)','Gymnopédie n.º 1 (Satie)'],bpm:84,st:'waltz',ch:{G:{b:43,c:[59,62,66]},D:{b:38,c:[57,61,66]}},mel:gy},
      {n:['Rondo alla turca (Mozart)','Marcha turca (Mozart)'],bpm:112,st:'arp',ch:{Am:{b:45,c:[57,60,64]},E:{b:40,c:[56,59,64]}},mel:[...tk,...tk]},
      {n:['Canon in D (Pachelbel)','Canon en re (Pachelbel)'],bpm:78,st:'block',ch:{D:{b:38,c:[50,54,57]},A:{b:33,c:[49,52,57]},Bm:{b:35,c:[50,54,59]},Fm:{b:30,c:[49,54,57]},G:{b:31,c:[50,55,59]}},mel:cn},
      {n:['Lullaby (Brahms)','Canción de cuna (Brahms)'],bpm:96,st:'waltz',ch:{C:{b:36,c:[52,55,60]},G:{b:31,c:[50,53,59]},F:{b:41,c:[53,57,60]}},mel:br}];})();
  const songLen=S=>S.mel.reduce((a,e)=>a+e[1],0)*60/S.bpm/4;
  function pianoMusic(S,dur){const ev={};let s=0;S.mel.forEach(e=>{ev[s]=e;s+=e[1];});const len=s;
    seqMusic(dur,.55,S.bpm,(i,t,s16,T)=>{const e=ev[i%len];if(!e)return;const pn=(n,g,d,tt=t)=>{const f=T.fq(n);T.osc('triangle',f,tt,d,g);T.osc('sine',f*2,tt,d*.5,g*.25);T.osc('sine',f,tt,.05,g*.4);};
      if(e[0])pn(e[0],.13,e[1]*s16*2+.5);
      const c=e[2]&&S.ch[e[2]];if(!c)return;
      if(S.st==='arp'){[c.b,...c.c].forEach((n,k)=>pn(n,.08,s16*4,t+k*s16));}
      else if(S.st==='waltz'){pn(c.b,.1,s16*5);c.c.forEach(n=>pn(n,.05,s16*8,t+s16*4));}
      else{pn(c.b,.1,s16*10);c.c.forEach(n=>pn(n,.05,s16*8));}});}
  const RECITAL=[L2('🎹 Dedicated to the Río Agrio.','🎹 Dedicada al Río Agrio.'),L2('🎹 Silence in the hall, please… I mean, in the steppe.','🎹 Silencio en la sala, por favor… digo, en la estepa.'),L2('🎹 A grand piano at 2,000 m: the logistics were a nightmare.','🎹 Un piano de cola a 2.000 m: la logística fue una pesadilla.'),
    L2('🎹 The acoustics of this volcano are incredible.','🎹 La acústica de este volcán es increíble.'),L2('🎹 After the recital, breakfast. Obviously.','🎹 Después del recital, desayuno. Obvio.')];
  X2.piano={start(A,u){A.yaw+=1.25;{let i;do i=Math.floor(Math.random()*SONGS.length);while(SONGS.length>1&&i===ps.song);ps.song=i;A.song=SONGS[i];A.dur=clamp(songLen(A.song)+2.4,9,17);}const f=[Math.cos(A.yaw),-Math.sin(A.yaw)];const gy=Wd.heightAt(pl.x,pl.z);
      A.pn=pianoModel();A.pn.position.set(pl.x-f[0]*.005,gy,pl.z-f[1]*.005);A.pn.rotation.y=A.yaw;A.pn.scale.setScalar(.001);Wd.scene.add(A.pn);
      fracProp(u,pl.g).shown=true;puff(pl.x,pl.z);spark(pl.x,gy+.2,pl.z,26,0xffffff,.6,1.3);AU.sfx.tada();say(LX('🎩 Excuse me… recital time: <b>','🎩 Permiso… es hora del recital: <b>')+A.song.n[LANG==='es'?1:0]+'</b>',2.6);},
    tick(A,dt,t){const p=A.pn;const k=Math.min(1,A.t/.45),e=1-Math.pow(1-k,3);p.scale.setScalar(Math.max(.001,A.t>A.dur-.35?(A.dur-A.t)/.35:e));
      if(once(A,'m',.9)){pianoMusic(A.song,A.dur-1.2);}
      if(once(A,'a',2.8))say(pk(RECITAL)(),3.4);if(once(A,'b',Math.min(7,A.dur-3)))say(pk([LX('🎶 …and with feeling…','🎶 …y con sentimiento…'),LX('🎶 Pianissimo… now FORTISSIMO!','🎶 Pianissimo… ¡ahora FORTISSIMO!'),LX('🎶 *closes his eyes*','🎶 *cierra los ojos*')]),2.6);
      const fl=p.userData.flame;if(fl)fl.scale.set(.7,1.5+Math.sin(t*23)*.25,.7);
      A.nt=(A.nt||0)-dt;if(A.nt<=0&&A.t>1&&A.t<A.dur-1){A.nt=R(.25,.55);const f=[Math.cos(A.yaw),-Math.sin(A.yaw)],sd=[Math.sin(A.yaw),Math.cos(A.yaw)],r=R(-.3,.3);
        const x=pl.x+f[0]*.25+sd[0]*r,z=pl.z+f[1]*.25+sd[1]*r;npcSay(pk(['♪','♫','♬','𝄞']),[x,Wd.heightAt(x,z)+R(.3,.45),z],1);}},
    pose(A,u,g,t){g.rotation.y=A.yaw;g.position.y-=.05;u.legL.rotation.z=1.4;u.legR.rotation.z=1.35+Math.max(0,Math.sin(t*2.6))*.12;   // right foot on the pedal
      const pl2=A.t>1&&A.t<A.dur-1;u.armL.rotation.z=1.15+(pl2?Math.sin(t*11)*.06:0);u.armR.rotation.z=1.15+(pl2?Math.sin(t*13+1)*.07:0);
      u.armL.rotation.x=pl2?-.12+Math.sin(t*1.7)*.18:0;u.armR.rotation.x=pl2?.12+Math.sin(t*2.1+2)*.16:0;g.rotation.x=pl2?Math.sin(t*1.4)*.07:0;
      u.can.visible=false;u.probe.visible=false;},
    end(A){if(A.pn){puff(A.pn.position.x,A.pn.position.z);Wd.scene.remove(A.pn);A.pn.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});}
      const u=A.g&&A.g.userData;if(u&&u.pk&&u.pk.frac)u.pk.frac.shown=false;
      if(A.g===pl.g){applause(2.6);say(LX('🙇 Thank you, thank you. Now… breakfast? I mean, sampling.','🙇 Gracias, gracias. Ahora… ¿desayuno? Digo, a muestrear.'),2.8);}}};
  // ---- Catalina: photo shoot with flashes and an extravagant outfit
  const POSES=[[2.9,2.9,.2,-.2,0],[2.2,.3,0,.5,.6],[1.5,1.5,.4,.4,-.6],[3,.8,-.3,0,1.2],[.9,2.6,0,.6,-1.2],[2.6,2.6,.5,.5,3.14]];
  X2.photo={start(A,u){prop(u,pl.g,'glam').visible=true;puff(pl.x,pl.z);spark(pl.x,pl.g.position.y+.25,pl.z,26,undefined,.6,1.3);AU.sfx.tada();say(LX('💅 Wait wait wait… PHOTO TIME!','💅 Espera espera espera… ¡HORA DE LA FOTO!'),2.2);A.nf=.8;A.pi=0;},
    tick(A,dt){A.nf-=dt;if(A.nf<=0&&A.t<A.dur-.5){A.nf=R(.35,.85);A.pi=(A.pi+1+Math.floor(Math.random()*3))%POSES.length;const a=Math.random()*6.283,r=R(.3,.6),x=pl.x+Math.cos(a)*r,z=pl.z+Math.sin(a)*r,y=pl.g.position.y+R(.1,.4);
        const m=new THREE.Sprite(new THREE.SpriteMaterial({map:ptex(),color:0xffffff,transparent:true,opacity:1,depthWrite:false}));m.position.set(x,y,z);m.scale.setScalar(.22);Wd.scene.add(m);FX.push({m,t:0,life:.18,v:[0,0,0],g:0,s:.22,grow:.8});
        spark(x,y,z,5,0xffffff,.4,.4,.03);shutter();if(Math.random()<.55)splatDOM();}
      if(once(A,'a',2))say(pk([LX('My good side is the left one 😘','Mi lado bueno es el izquierdo 😘'),LX('One more, one more! 📸','¡Una más, una más! 📸'),LX('Get the volcano behind me!','¡Que salga el volcán atrás!')]),2.2);
      if(once(A,'b',4.4))say(pk([LX('Did I blink? Again!','¿Pestañeé? ¡Otra vez!'),LX('For the cover of Nature ✨','Para la portada de Nature ✨'),LX('This boa is lab-safe, trust me 🪶','Esta boa es apta para laboratorio, créeme 🪶')]),2.2);},
    pose(A,u,g){const P=POSES[A.pi];u.armL.rotation.z=P[0];u.armR.rotation.z=P[1];u.armL.rotation.x=-.3;u.armR.rotation.x=.3;u.legL.rotation.z=P[2];u.legR.rotation.z=P[3];g.rotation.y=A.yaw+P[4];g.rotation.x=.12*Math.sin(A.pi);u.can.visible=false;},
    end(A){if(A.g===pl.g){puff(pl.x,pl.z);say(LX('Send me all of them. ALL of them. 💖','Mándenmelas todas. TODAS. 💖'),2.4);}}};
  // ---- Fernando: tastes the acid river
  X2.taste={start(A,u){say(pk([LX('Just a tiny sip… for science 🤓','Solo un sorbito… por la ciencia 🤓'),LX('What does pH '+A.ph.toFixed(1)+' taste like?','¿A qué sabrá el pH '+A.ph.toFixed(1)+'?'),LX('Nobody look… 👀','Que nadie mire… 👀')]),2.2);},
    tick(A,dt){if(once(A,'s',1.4))AU.sfx.pour();
      if(once(A,'r',2.5)){prop(pl.g.userData,pl.g,'green').visible=true;AU.sfx.voice(6,110);const f=A.ph<2.2?[LX('AAAAGH! It tastes like a car battery! 🔋','¡¡AAAAH!! ¡Sabe a batería de auto! 🔋'),LX('My fillings are dissolving 🦷','Se me están disolviendo las tapaduras 🦷')]:A.ph<3.2?[LX('Sour… metallic… notes of sulfur. 7/10 🍋','Ácido… metálico… notas de azufre. 7/10 🍋'),LX('Like lemon juice with a nail in it 😖','Como jugo de limón con un clavo adentro 😖')]:[LX('Hmm, like a flat soda. Boring.','Mmm, como bebida sin gas. Fome.'),LX('Barely acidic. I want the real stuff!','Casi nada ácida. ¡Quiero de la buena!')];say(pk(f),2.8);}
      if(A.t>2.5){A.st=(A.st||0)-dt;if(A.st<=0){A.st=.25;[-1,1].forEach(s=>{const w=pl.g.localToWorld(new THREE.Vector3(0,.175,.022*s));smokeP(w.x,w.y,w.z,false);});}}
      if(once(A,'w',4.6))toast(LX(`⚠️ Game only! pH ${A.ph.toFixed(1)} is ${A.ph<2.2?'as acidic as battery acid':A.ph<3.2?'more acidic than lemon juice':'like soda'} and full of dissolved metals. Never drink it.`,`⚠️ ¡Solo en el juego! pH ${A.ph.toFixed(1)} es ${A.ph<2.2?'tan ácido como el ácido de batería':A.ph<3.2?'más ácido que el jugo de limón':'como una bebida'} y lleno de metales disueltos. Nunca lo tomes.`),true,4200);},
    pose(A,u,g){g.position.y-=.035;u.legL.rotation.z=1.2;u.legR.rotation.z=.6;g.rotation.z=-.2;const t=A.t;u.armR.rotation.z=t<1.6?.3+Math.sin(t*5)*.15:t<2.4?lerp(.3,2.5,(t-1.6)/.8):2.5;u.armL.rotation.z=t>2.5?2.8:.2;if(t>2.5)g.rotation.y=A.yaw+Math.sin(t*28)*.12;u.can.visible=false;},
    end(A){const u=A.g&&A.g.userData;if(u&&u.pk&&u.pk.green)u.pk.green.visible=false;if(A.g===pl.g)say(pk([LX('…same time tomorrow? 😏','…¿mañana a la misma hora? 😏'),LX('I regret nothing.','No me arrepiento de nada.')]),2);}};
  // ---- Celia: salsa with Cuban music
  const SANT=[L2('May Changó protect us from the volcano! ⚡','¡Que Changó nos proteja del volcán! ⚡'),L2('Yemayá looks after the waters… even these acidic ones 🌊','Yemayá cuida las aguas… aunque estas sean ácidas 🌊'),L2('We should leave something for Elegguá so he opens the path to the crater 🍬','Hay que dejarle algo a Elegguá pa\' que abra los caminos al cráter 🍬'),
    L2('Oshún, give me clean samples 💛','Oshún, dame muestras limpias 💛'),L2('My godmother would do a cleansing on this jerrycan, mi amor.','Mi madrina le haría una limpieza a este bidón, mi amor.'),L2('White and blue beads for Yemayá, yellow for Oshún. Never forget it.','Collar blanco y azul pa\' Yemayá, amarillo pa\' Oshún. No se te olvide.'),
    L2('Obatalá, give me patience for the 0.22 µm filter 🤍','Obatalá, dame paciencia pa\' el filtro de 0,22 µm 🤍'),L2('In Cuba we would say this volcano has aché, mi vida ✨','En Cuba diríamos que este volcán tiene aché, mi vida ✨')];
  X2.salsa={start(A){salsaMusic(A.dur);say(LX('🎺 ¡AZÚCAR! Salsa break, mi amor!','🎺 ¡AZÚCAR! ¡Pausa de salsa, mi amor!'),2.4);},
    tick(A,dt){if(once(A,'a',3.2))say(pk([LX('One-two-three… five-six-seven 💃','Un-dos-tres… cinco-seis-siete 💃'),LX('This is timba, mi amor! 🇨🇺','¡Esto es timba, mi amor! 🇨🇺')]),2.4);if(once(A,'b',6.2))say(pk(SANT)(),3);
      A.sp=(A.sp||0)-dt;if(A.sp<=0){A.sp=.45;spark(pl.x,pl.g.position.y+.3,pl.z,3,pk([0xff2d2d,0xffd23f,0x2d6cff]),.35,1,.035);}},
    pose(A,u,g){const b=A.t*100/60*2,st=Math.floor(b)%8,ph=b%1,step=[1,0,-1,0,-1,0,1,0][st];const turn=Math.floor(b/16)%2===1&&st<4;
      g.position.x+=Math.cos(A.yaw)*step*.012;g.position.z-=Math.sin(A.yaw)*step*.012;g.rotation.y=A.yaw+(turn?(st+ph)/4*Math.PI*2:Math.sin(b*Math.PI)*.35);g.rotation.x=Math.sin(b*Math.PI)*.12;
      u.legL.rotation.z=step>0?.35:step<0?-.1:0;u.legR.rotation.z=step<0?-.35:step>0?.1:0;u.armL.rotation.z=1.4+Math.sin(b*Math.PI)*.4;u.armR.rotation.z=turn?2.9:1.2-Math.sin(b*Math.PI)*.4;u.armL.rotation.x=-.4;u.armR.rotation.x=.4;u.can.visible=false;},
    end(A){if(A.g===pl.g){applause(1.6);say(LX('Now yes, back to work, mi amor 💃','Ahora sí, a trabajar, mi amor 💃'),2);}}};
  // ---- Ana: dances every style… a bit stiffly, then applause
  const STYLES=[['ballet','🩰',L2('Ballet','Ballet')],['cueca','🇨🇱',L2('Cueca','Cueca')],['tango','🌹',L2('Tango','Tango')],['flamenco','💃',L2('Flamenco','Flamenco')],['disco','🪩',L2('Disco','Disco')]];
  X2.dance={start(A,u){A.st=STYLES[ps.anaI%STYLES.length];ps.anaI++;styleMusic(A.st[0],A.dur-2.6);if(A.st[0]==='cueca')prop(u,pl.g,'hanky').visible=true;
      say(`${A.st[1]} ${LX('Time for','¡Hora de')} ${A.st[2]()}!`,2.6);},
    tick(A,dt){if(once(A,'m',3.4))say(pk([LX('And one, and two… ✨','Y un, y dos… ✨'),LX('I could dance all day 💃','Podría bailar todo el día 💃'),LX('The volcano is my stage!','¡El volcán es mi escenario!')]),2.4);
      if(once(A,'ap',A.dur-2.6)){applause(2.8);say(LX('👏 Thank you, thank you! 🙇‍♀️','👏 ¡Gracias, gracias! 🙇‍♀️'),2.4);toast(LX('👏👏👏 BRAVO, ANA! 👏👏👏','👏👏👏 ¡BRAVO, ANA! 👏👏👏'),false,2400);}},
    pose(A,u,g){const T=A.dur-2.6,t=Math.min(A.t,T),q=t,s=Math.sin(q*Math.PI*1.5),k=A.st[0];u.can.visible=false;u.armL.rotation.x=u.armR.rotation.x=0;g.rotation.y=A.yaw;
      if(A.t>T){u.armL.rotation.z=u.armR.rotation.z=.5;g.rotation.x=.45;g.rotation.y=A.yaw;return;}                   // bow
      if(k==='ballet'){u.armL.rotation.z=u.armR.rotation.z=2.8;u.armL.rotation.x=-.3;u.armR.rotation.x=.3;g.position.y+=.012;u.legL.rotation.z=s>0?.9:0;g.rotation.y=A.yaw+Math.floor(q*2)*Math.PI/2;}
      else if(k==='cueca'){u.armR.rotation.z=2.6;u.armL.rotation.z=1.2;u.armL.rotation.x=-1;g.rotation.y=A.yaw+Math.floor(q)*Math.PI/2;u.legL.rotation.z=s>0?.35:0;u.legR.rotation.z=s<0?-.35:0;const h=u.pk&&u.pk.hanky;if(h)h.rotation.x=Math.sin(A.t*9)*.8;}
      else if(k==='tango'){u.armL.rotation.z=1.6;u.armR.rotation.z=1.6;u.armL.rotation.x=-.9;u.armR.rotation.x=.9;g.rotation.x=.18*(s>0?1:0);u.legL.rotation.z=s>0?.7:0;g.position.x+=Math.cos(A.yaw)*Math.floor(q%2)*.02;g.position.z-=Math.sin(A.yaw)*Math.floor(q%2)*.02;}
      else if(k==='flamenco'){u.armL.rotation.z=2.9;u.armR.rotation.z=2.3;u.armL.rotation.x=-.6;u.armR.rotation.x=.6;g.rotation.y=A.yaw+(s>0?.5:-.5);u.legR.rotation.z=s>0?.4:0;g.position.y+=s>0?.004:0;}
      else{u.armR.rotation.z=s>0?3:.8;u.armR.rotation.x=.5;u.armL.rotation.z=.4;g.rotation.z=s>0?-.12:.08;u.legL.rotation.z=s>0?.3:0;}},
    end(A){const u=A.g&&A.g.userData;if(u&&u.pk&&u.pk.hanky)u.pk.hanky.visible=false;}};
  // ---- Sofi: seal belly slap
  X2.seal={start(){say(LX('🦭 ORK ORK ORK!','🦭 ¡ORK ORK ORK!'),2);},tick(A){const n=Math.floor(A.t/.26);if(n!==A.n&&n<6){A.n=n;if(n%2===0)slap();}if(once(A,'b',.1))sealBark();},
    pose(A,u,g){const c=Math.abs(Math.sin(A.t/.26*Math.PI));u.armL.rotation.z=u.armR.rotation.z=.15+c*.9;u.armL.rotation.x=-.9*c;u.armR.rotation.x=.9*c;g.rotation.x=-.2;g.position.y+=c*.006;u.can.visible=false;},end(){}};
  // ---- talkers
  const RIC=[L2('Che, che, che…','Che, che, che…'),L2('Che! What a volcano, che.','¡Che! Qué volcán, che.'),L2('Che, how far is it, che?','Che, ¿cuánto falta, che?'),L2('Che, che… it\'s cold, che.','Che, che… hace frío, che.'),L2('Hey, che! Che!','¡Eh, che! ¡Che!'),L2('Che, pass me the mate, che.','Che, pasame el mate, che.'),L2('Che, look at that, che, che.','Che, mirá eso, che, che.')];
  const CATA=[L2('Chile invests less than 0.4% of GDP in science… less than 0.4%!','Chile invierte menos del 0,4 % del PIB en ciencia… ¡menos del 0,4!'),L2('Another grant rejected… the reviewer didn\'t even read the methods.','Otro Fondecyt rechazado… y el evaluador ni leyó la metodología.'),
    L2('A two-year postdoc and then what? Nobody knows.','¿Postdoc de dos años y después? Nadie sabe.'),L2('The kit arrived thawed from customs… again.','El kit llegó descongelado de aduana… otra vez.'),L2('Three months waiting for one reagent. Three!','Tres meses esperando un reactivo. ¡Tres!'),
    L2('Here you need a public tender to buy a pipette.','Aquí para comprar una pipeta hay que licitar.'),L2('World-class Latin American science on a street-market budget.','Ciencia latinoamericana de primer nivel con presupuesto de feria.'),
    L2('A permanent contract for researchers? Hahaha.','¿Contrato indefinido para investigadores? Jajaja.'),L2('PhD, papers… and freelance invoices with no pension.','Doctorado, papers… y boleta de honorarios sin previsión.'),
    L2('They cut the science budget again.','Otra vez recortaron el presupuesto de ciencia.'),L2('The nearest sequencer is in another country.','El secuenciador más cercano está en otro país.')];
  const SUIZA=[L2('That\'s it, I have to escape to a better world… Switzerland 🇨🇭','Ya, tengo que escapar a un mundo mejor… a Suiza 🇨🇭'),L2('In Switzerland the reagents arrive before you order them.','En Suiza los reactivos llegan antes de pedirlos.'),
    L2('A better world exists, and it\'s called Switzerland 🇨🇭','Un mundo mejor existe y se llama Suiza 🇨🇭'),L2('In Switzerland postdocs get paid… in Swiss francs 💰','En Suiza a los postdocs les pagan… en francos suizos 💰'),L2('Right, I\'m sending my CV to Zurich ✈️','Listo, mando mi CV a Zúrich ✈️')];
  const GYM=[L2('Want to come to the gym with me? I have a free pass 💪','¿Quieres ir al gimnasio conmigo? Tengo un pase gratis 💪'),L2('Come on, it\'s quick, it\'s close!','¡Vamos, es rápido, queda cerca!'),L2('Just walking on the treadmill, with incline, that\'s all.','Solo a caminar en la trotadora, con inclinación, nada más.'),
    L2('Free pass! You have no excuse.','¡Pase gratis! No tienes excusa.'),L2('Thirty minutes at incline 12 and done.','Treinta minutos con inclinación 12 y listo.'),L2('Leg day tomorrow, are you in?','Mañana toca pierna, ¿te sumas?')];
  const ISS=[L2('What a great game! It turned out so fun, haha','¡Qué buen juego! Quedó muy divertido, jaja'),L2('See this? I made it 😎','¿Vieron? Lo hice yo 😎'),L2('Well… me and my slave Claude, hahaha 😈','Bueno… yo y mi esclavo Claude, jajaja 😈'),L2('Claude, faster with those lines of code! MWAHAHA','¡Claude, más rápido con esas líneas de código! MUAJAJAJA'),
    L2('So good I want to play it… oh wait, I am.','Quedó tan bueno que me dan ganas de jugarlo… ah, estoy jugando.'),L2('Give it 5 stars, OK?','Pónganle 5 estrellas, ¿ya?')];
  const CAMI_ASK=[L2('Cami, how do I do this?','Cami, ¿cómo hago esto?'),L2('Cami, how does this work?','Cami, ¿cómo es esto?'),L2('Cami… Cami… how do I do this?','Cami… Cami… ¿cómo hago esto?'),
    L2('Cami, is this right?','Cami, ¿así está bien?'),L2('Cami, what do you think?','Cami, ¿tú qué opinas?'),L2('Cami, which button do I press?','Cami, ¿qué botón aprieto?'),
    L2('Cami, where does this go?','Cami, ¿esto dónde va?'),L2('Cami, can you check this for me?','Cami, ¿me revisas esto?'),L2('Cami, how did you do this last time?','Cami, ¿cómo hiciste esto la otra vez?'),
    L2('Cami, one quick question… well, several.','Cami, una preguntita… bueno, varias.'),L2('Cami, how do I do this? Again, sorry.','Cami, ¿cómo hago esto? De nuevo, perdón.'),L2('Cami, the mouse isn\'t working.','Cami, no me funciona el mouse.')];
  const CAMI_RE=[L2('Again, Pedro? 😅','¿Otra vez, Pedro? 😅'),L2('I just explained it to you!','¡Si te lo acabo de explicar!'),L2('Give it here, I\'ll do it.','Pásamelo, yo lo hago.'),
    L2('The same as five minutes ago, Pedro.','Igual que hace cinco minutos, Pedro.'),L2('Yes, Pedro, it\'s fine 👍','Sí, Pedro, está bien 👍'),L2('Did you try turning it off and on?','¿Probaste apagar y prender?'),L2('Mmm… let me see.','Mmm… a ver, muéstrame.')];
  const CAMI_ALONE=[L2('I should ask Cami about this…','Debería preguntarle esto a la Cami…'),L2('What would Cami say?','¿Qué diría la Cami?'),L2('I\'ll ask Cami for her opinion.','Le voy a pedir su opinión a la Cami.'),
    L2('Cami would know how to do this.','La Cami sabría cómo hacer esto.'),L2('Better check it with Cami first.','Mejor lo reviso con la Cami primero.'),L2('I\'ll write it down to ask Cami later.','Lo anoto pa\' preguntarle después a la Cami.'),
    L2('Cami? …ah, she isn\'t here.','¿Cami? …ah, no está.'),L2('How did Cami do this?','¿Cómo era que lo hacía la Cami?')];
  function talkers(k,dt){ps.t2-=dt;if(ps.t2>0||ps.act||hush())return;const onFoot=!pl.inTruck,mv=onFoot&&inputAxes().some(a=>Math.abs(a)>.05);
    if(k==='ricardo'||k==='alejandra'){if(!mv)return;ps.t2=R(15,30);say('🧉 '+pk(RIC)(),2.4);AU.sfx.voice(4,k==='alejandra'?225:125);}
    else if(k==='cata'){ps.t2=R(15,30);ps.cataN++;const sw=ps.cataN%2===0;say((sw?'✈️ ':'😒 ')+pk(sw?SUIZA:CATA)(),3.2);AU.sfx.voice(5,215);}
    else if(k==='pedro'){ps.t2=R(15,30);if(comp.on&&comp.g&&comp.dance<=0){say(pk(CAMI_ASK)(),2.8);AU.sfx.voice(10,120);
        setTimeout(()=>{if(comp.on&&comp.g)npcSay(pk(CAMI_RE)(),()=>[comp.x,(pl.inTruck?truck.g.position.y+.1:Wd.heightAt(comp.x,comp.z))+.5,comp.z],2.6);},1900);}
      else say('💭 '+pk(CAMI_ALONE)(),3.2);}
    else if(k==='gustavo'){ps.t2=R(15,30);say('🏋️ '+pk(GYM)(),3.4);AU.sfx.voice(6,150);}
    else if(k==='issotta'){ps.t2=R(15,30);const l=pk(ISS)();say(l,3.4);if(/MUA|MWA|jaja|haha/i.test(l))evilLaugh();else AU.sfx.voice(5,140);}
    else if(k==='celia'&&onFoot){ps.t2=R(15,30);say('📿 '+pk(SANT)(),3.6);AU.sfx.voice(6,215);}
    else if(k==='fernando'&&onFoot){ps.t2=R(15,30);const E=Wd.infoAt(pl.x,pl.z);if(E&&E.rv.d<.7&&E.rv.ph<4.5)say(pk([LX('That acidic river is calling me… 🤤','Ese río ácido me está llamando… 🤤'),LX('Just one little taste, nobody will notice…','Una probadita nomás, nadie se va a dar cuenta…')]),2.8);}}
  // ---- inner thoughts for characters (shown as subtitles in first person)
  const THINK={abraham:[L2("Is it breakfast time yet? It's always breakfast time.",'¿Ya es hora del desayuno? Siempre es hora del desayuno.'),L2('Toast, eggs, coffee… and then the metagenomes.','Tostadas, huevos, café… y después los metagenomas.'),L2('Nobody samples well on an empty stomach.','Nadie muestrea bien con el estómago vacío.')],alejandro:[L2('I feel a little… feathery.','Me siento medio… emplumado.'),L2('Please, not the chicken thing in front of the PI.','Por favor, que no me pase lo del pollo delante del jefe.'),L2('Why do I keep wanting to peck at the gravel?','¿Por qué me dan ganas de picotear el ripio?')],camila:[L2('That river has a K-pop beat, I swear.','Ese río tiene ritmo de K-pop, lo juro.'),L2('Five, six, seven, eight… sample!','Cinco, seis, siete, ocho… ¡muestra!'),L2('I bet the idols would love Copahue.','Seguro que a los idols les encantaría el Copahue.')],catalina:[L2('This light is perfect for a photo.','Esta luz está perfecta para una foto.'),L2('Does this jacket go with the volcano?','¿Esta chaqueta combina con el volcán?'),L2('Pose first, sample second.','Primero la pose, después la muestra.')],dilanaz:[L2('This truck needs a better air filter.','A esta camioneta le falta un mejor filtro de aire.'),L2('Çay would be perfect right now.','Un çay me vendría perfecto ahora.'),L2('I can hear the engine asking for a tune-up.','Escucho al motor pidiendo una afinación.')],estefania:[L2('Shhh… the volcano is listening.','Shhh… el volcán está escuchando.'),L2('If I walk softly enough, nobody will notice me.','Si camino muy suave, nadie me va a notar.'),L2('Sometimes I can see through my own hands.','A veces veo a través de mis propias manos.')],gabriel:[L2('This slope? A warm-up.','¿Esta pendiente? Un calentamiento.'),L2("Crampons, ice axe, gaiters… I'm ready.",'Crampones, piolet, polainas… estoy listo.'),L2('Snow squall incoming. My favourite weather.','Viene una ventisca. Mi clima favorito.')],tito:[L2('The compass is tingling… the next site is that way.','La brújula está vibrando… el próximo sitio es por allá.'),L2('Filtering this fast should be illegal.','Filtrar así de rápido debería ser ilegal.'),L2('Follow the sparkles, Tito.','Sigue los brillitos, Tito.')],mati:[L2('Something weird is about to happen to me. I can feel it.','Algo raro me va a pasar. Lo presiento.'),L2('Bad luck? No, just a plot twist.','¿Mala suerte? No, un giro de guion.'),L2("Whatever breaks, I'll fix it with a smile.",'Lo que se rompa, lo arreglo con una sonrisa.')],pedro:[L2('Where is Camila? Oh, right behind me. As always.','¿Dónde está Camila? Ah, justo detrás de mí. Como siempre.'),L2('I should run this by Cami.','Esto debería consultarlo con la Cami.'),L2('What would Cami think of this?','¿Qué opinará la Cami de esto?')],priscilla:[L2('Ten kids, twenty litres. Easy.','Diez niños, veinte litros. Fácil.'),L2('I filter faster than they can ask for snacks.','Filtro más rápido de lo que alcanzan a pedir colación.'),L2('Just one quiet minute… please.','Solo un minuto de silencio… por favor.')],raquel:[L2('Did I drop another thesis?','¿Se me cayó otra tesis?'),L2('Che, this valley is gorgeous.','Che, qué lindo este valle.'),L2('I should staple my papers to my jacket.','Debería corchetear los papers a la chaqueta.')],seba:[L2('Here comes the PDI again… I can feel it.','Ya viene la PDI otra vez… lo presiento.'),L2('Where did I put my ID card?','¿Dónde dejé mi carnet?'),L2("Yes, officer, it's still me.",'Sí, oficial, sigo siendo yo.')],simon:[L2('Careful with the glassware… careful…','Cuidado con el vidrio… cuidado…'),L2("If something breaks, it wasn't me. Probably.",'Si algo se rompe, no fui yo. Probablemente.'),L2('Two hands on the jerrycan, Simón.','Las dos manos en el bidón, Simón.')],sofi:[L2('Did you know seals can sleep underwater?','¿Sabías que las focas pueden dormir bajo el agua?'),L2('This lake needs a seal.','A este lago le falta una foca.'),L2('Plié… and sample.','Plié… y muestra.')],yasna:[L2('The dogs are ready for the chorus.','Los perros están listos para el coro.'),L2('Culli, remember your part this time.','Culli, esta vez acuérdate de tu parte.'),L2('I think the cockroach has perfect pitch.','Creo que la cucaracha tiene oído absoluto.')],ana:[L2('This chapter is getting good.','Este capítulo se está poniendo bueno.'),L2('Cueca or tango at the next site?','¿Cueca o tango en el próximo sitio?'),L2('A little flamenco for the microbes.','Un poco de flamenco para los microbios.')],juan:[L2('What if we sold volcano water as an energy drink?','¿Y si vendemos agua del volcán como bebida energética?')]};
  function thinkers(k,dt){if(!THINK[k]||ps.act||pl.inTruck||hush())return;ps.t3=(ps.t3==null?R(8,14):ps.t3)-dt;if(ps.t3>0)return;ps.t3=R(15,30);if(bubT>0)return;say('💭 '+pk(THINK[k])(),3.6);}
  // ---- more repertoire: extra inner thoughts for everyone and more lines for the talkers
  const THINK2={
    abraham:[L2('Scrambled or fried? Why not both?','¿Revueltos o fritos? ¿Por qué no los dos?'),L2('I packed three sandwiches. For the morning.','Traje tres sánguches. Para la mañana.'),L2('A metagenome is like a breakfast buffet: a bit of everything.','Un metagenoma es como un buffet de desayuno: un poco de todo.'),
      L2('If I smell toast, I\'m stopping. No discussion.','Si huelo pan tostado, me detengo. Sin discusión.'),L2('Second breakfast is a scientific necessity.','El segundo desayuno es una necesidad científica.'),L2('Coffee first, reads mapping later.','Primero el café, después el mapeo de lecturas.')],
    alejandro:[L2('Why do I suddenly want to peck the ground?','¿Por qué de repente me dan ganas de picotear el suelo?'),L2('Cock-a-doodle… no. No. Focus.','Kikirikí… no. No. Concéntrate.'),L2('I swear I just laid something.','Juraría que acabo de poner algo.'),
      L2('Feathers in my lab coat again…','Plumas en la bata otra vez…'),L2('Is it normal to be afraid of foxes?','¿Es normal tenerle miedo a los zorros?'),L2('I should get tested. For… chicken.','Debería hacerme un examen. De… pollo.')],
    alejandra:[L2('Che, this wind would blow a mate gourd away.','Che, este viento se lleva el mate volando.'),L2('Che, in Neuquén we call this a breeze.','Che, en Neuquén a esto le decimos brisa.'),L2('I miss a good choripán, che.','Extraño un buen choripán, che.'),
      L2('Che, sulfur for breakfast, lunch and dinner.','Che, azufre al desayuno, almuerzo y cena.'),L2('Is the thermos still hot? Che, it has to be.','¿Sigue caliente el termo? Che, tiene que estar.'),L2('Che, this landscape is worth the trip.','Che, este paisaje vale el viaje.')],
    ana:[L2('Chapter nine: the scientist climbs the volcano. Classic.','Capítulo nueve: la científica sube el volcán. Clásico.'),L2('A pirouette on the scoria? Maybe not.','¿Una pirueta en la escoria? Mejor no.'),L2('Five, six, seven, eight… sample!','Cinco, seis, siete, ocho… ¡muestra!'),
      L2('This valley would be a perfect stage.','Este valle sería un escenario perfecto.'),L2('I brought two books. I should have brought four.','Traje dos libros. Debí traer cuatro.'),L2('Tango needs a partner. The jerrycan will do.','El tango necesita pareja. El bidón servirá.')],
    camila:[L2('Pedro is going to ask me something in 3… 2… 1…','Pedro me va a preguntar algo en 3… 2… 1…'),L2('That choreography needs more practice.','Esa coreografía necesita más ensayo.'),L2('Python script, K-pop playlist, all set.','Script en Python, playlist de K-pop, todo listo.'),
      L2('Who left the mouse without batteries?','¿Quién dejó el mouse sin pilas?'),L2('If this pipeline fails, I\'m dancing it off.','Si este pipeline falla, lo bailo pa\' olvidarlo.'),L2('Saranghae, Río Agrio 💜','Saranghae, Río Agrio 💜')],
    cata:[L2('Deadline on Friday. Of course it is.','La fecha límite es el viernes. Obvio.'),L2('I wonder if the Alps smell like sulfur. Probably not.','Me pregunto si los Alpes huelen a azufre. Probablemente no.'),L2('Another form to fill. In triplicate.','Otro formulario que llenar. En triplicado.'),
      L2('At least the volcano doesn\'t ask for an overhead.','Al menos el volcán no pide overhead.'),L2('Fondecyt, please, this year…','Fondecyt, por favor, este año…'),L2('I love this job. I just hate the budget.','Amo este trabajo. Solo odio el presupuesto.')],
    catalina:[L2('This light is perfect for a portrait.','Esta luz es perfecta para un retrato.'),L2('Is my outfit volcano-proof? Let\'s find out.','¿Mi outfit es a prueba de volcán? Veamos.'),L2('The Copahue is my best side.','El Copahue es mi mejor ángulo.'),
      L2('Golden hour at the crater. Iconic.','Hora dorada en el cráter. Icónico.'),L2('I need a flash for the fumaroles.','Necesito un flash pa\' las fumarolas.'),L2('Sampling look: neon boots, obviously.','Look de muestreo: botas neón, obvio.')],
    celia:[L2('This rhythm in my feet won\'t stop, mi vida.','Este ritmo en los pies no se me quita, mi vida.'),L2('Where is my Cuban Celia when I need her?','¿Dónde está mi Celia cubana cuando la necesito?'),L2('Azúcar! Even the river has flavour.','¡Azúcar! Hasta el río tiene sabor.'),
      L2('A little son montuno for the microbes.','Un poquito de son montuno pa\' los microbios.'),L2('Ay, qué frío, this is not Havana.','Ay, qué frío, esto no es La Habana.'),L2('Asere, what\'s going on here?','Asere, ¿qué bolá aquí?')],
    dilanaz:[L2('That pickup needs new brake pads. I can hear it.','A esa camioneta le faltan pastillas de freno. Se escucha.'),L2('Çay after this site. Definitely.','Un çay después de este sitio. Seguro.'),L2('Torque, horsepower, cylinders… so relaxing.','Torque, caballos de fuerza, cilindros… qué relajante.'),
      L2('Maybe I can swap the filtration pump for a fuel pump.','Quizás cambio la bomba de filtración por una de bencina.'),L2('Istanbul traffic trained me for these roads.','El tráfico de Estambul me entrenó para estos caminos.'),L2('One day I\'ll restore a classic 4x4.','Algún día voy a restaurar un 4x4 clásico.')],
    estefania:[L2('Nobody heard me coming. As usual.','Nadie me escuchó llegar. Como siempre.'),L2('The quieter you are, the more you hear.','Mientras más silencio, más se escucha.'),L2('I feel a bit transparent today.','Hoy me siento un poco transparente.'),
      L2('The lenga forest has its own voice.','El bosque de lenga tiene su propia voz.'),L2('I could stay here all afternoon.','Me podría quedar aquí toda la tarde.'),L2('Calm water, calm mind.','Agua tranquila, mente tranquila.')],
    fernando:[L2('pH 2… how bad can it really be?','pH 2… ¿qué tan malo puede ser?'),L2('My bike could use a little acid wash.','A mi bici le vendría bien un lavado ácido.'),L2('Mountain bike, volcano, acid river: perfect day.','Bici de montaña, volcán, río ácido: día perfecto.'),
      L2('Downhill to the lake, uphill for the science.','Bajada al lago, subida por la ciencia.'),L2('One sip. For science. Just one.','Un sorbo. Por la ciencia. Solo uno.'),L2('I should put a sampling rack on my bike.','Debería ponerle un portamuestras a la bici.')],
    gabriel:[L2('This slope is only 40°. Easy.','Esta pendiente tiene solo 40°. Fácil.'),L2('Crampons or no crampons… crampons.','¿Crampones o sin crampones?… crampones.'),L2('Wind from the west, snow in an hour. I love it.','Viento del oeste, nieve en una hora. Me encanta.'),
      L2('I left a spare rope in every truck. Just in case.','Dejé una cuerda de repuesto en cada camioneta. Por si acaso.'),L2('The summit is always closer than it looks. Almost.','La cumbre siempre está más cerca de lo que parece. Casi.'),L2('Headlamp, gloves, thermos. Ready.','Frontal, guantes, termo. Listo.')],
    gustavo:[L2('Every jerrycan is a set of reps.','Cada bidón es una serie de repeticiones.'),L2('Protein shake after this site.','Batido de proteína después de este sitio.'),L2('These hills are free cardio.','Estos cerros son cardio gratis.'),
      L2('Twenty litres? That\'s a warm-up.','¿Veinte litros? Eso es calentamiento.'),L2('I should film this for my routine.','Debería grabar esto pa\' mi rutina.'),L2('Squat to sample, stand to celebrate.','Sentadilla pa\' muestrear, de pie pa\' celebrar.')],
    issotta:[L2('I should add more easter eggs. Nobody will find them.','Debería agregar más easter eggs. Nadie los va a encontrar.'),L2('Version 8.18 coming soon…','La versión 8.18 viene pronto…'),L2('I wrote this river. With my own shaders.','Este río lo escribí yo. Con mis propios shaders.'),
      L2('Is this a bug or a feature? A feature.','¿Esto es un bug o una feature? Una feature.'),L2('One more line of code and I\'ll sleep.','Una línea más de código y me voy a dormir.'),L2('Did everybody rate it 5 stars yet?','¿Ya todos le pusieron 5 estrellas?')],
    juan:[L2('Acid water as a service. AWaaS.','Agua ácida como servicio. AWaaS.'),L2('I need a pitch deck for this volcano.','Necesito un pitch deck pa\' este volcán.'),L2('Third can today… or fourth.','Tercera lata del día… o cuarta.'),
      L2('What if the jerrycans were on the blockchain?','¿Y si los bidones estuvieran en la blockchain?'),L2('Series A funding for microbes. Think about it.','Ronda Serie A pa\' microbios. Piénsalo.')],
    mati:[L2('What could go wrong today? Everything, probably.','¿Qué puede salir mal hoy? Todo, probablemente.'),L2('Is that cloud following me?','¿Esa nube me está siguiendo?'),L2('If a rock falls, it falls on me. Statistics.','Si cae una piedra, me cae a mí. Estadística.'),
      L2('Plan B, plan C, plan D… I always need plan D.','Plan B, plan C, plan D… siempre necesito el plan D.'),L2('At least it makes for good stories.','Al menos sale una buena historia.'),L2('I\'ll fix it. I always do.','Lo arreglo. Siempre lo arreglo.')],
    pedro:[L2('Sofi is on the boat… and I am here. Hmm.','La Sofi está en el bote… y yo aquí. Mmm.'),L2('Let me write down the question so I don\'t forget it.','Anoto la pregunta pa\' que no se me olvide.'),L2('Which cable was it again?','¿Cuál era el cable?'),
      L2('I have a lot of questions. That\'s science.','Tengo muchas preguntas. Eso es ciencia.'),L2('Niskin, sonde, Niskin, sonde…','Niskin, sonda, Niskin, sonda…')],
    priscilla:[L2('Did everyone put on sunscreen? Everyone?','¿Todos se echaron bloqueador? ¿Todos?'),L2('Counting heads: one, two… ten. Good.','Contando cabezas: uno, dos… diez. Bien.'),L2('Snacks are for AFTER the sample.','La colación es DESPUÉS de la muestra.'),
      L2('Nobody touches the acid water. Nobody!','Nadie toca el agua ácida. ¡Nadie!'),L2('The little one wants to be a microbiologist. Help.','El más chico quiere ser microbiólogo. Auxilio.'),L2('I filter fast because I have no choice.','Filtro rápido porque no me queda otra.')],
    raquel:[L2('Che, which folder was the draft in?','Che, ¿en qué carpeta estaba el borrador?'),L2('Reviewer 2 again, che. Always reviewer 2.','El revisor 2 otra vez, che. Siempre el revisor 2.'),L2('I need a bigger backpack, che.','Necesito una mochila más grande, che.'),
      L2('Che, should I print another copy? Just in case.','Che, ¿imprimo otra copia? Por las dudas.'),L2('Twenty papers in the backpack… nineteen… eighteen…','Veinte papers en la mochila… diecinueve… dieciocho…')],
    ricardo:[L2('Che, a good asado after this, che.','Che, un buen asado después de esto, che.'),L2('Che, the yerba is almost gone, che.','Che, se está acabando la yerba, che.'),L2('Che, in Buenos Aires they won\'t believe this.','Che, en Buenos Aires no me lo van a creer.'),
      L2('Che, where did I leave the thermos?','Che, ¿dónde dejé el termo?'),L2('Che, che… what a view, che.','Che, che… qué vista, che.')],
    seba:[L2('I have my ID. I checked three times.','Tengo el carnet. Lo revisé tres veces.'),L2('Do I look suspicious? I don\'t think so.','¿Me veo sospechoso? No creo.'),L2('Maybe I should wear a name tag.','Quizás debería usar una credencial.'),
      L2('Sampler, not smuggler. Sampler.','Muestreador, no contrabandista. Muestreador.'),L2('Is that a patrol car? No… just a rock.','¿Eso es una patrulla? No… solo una piedra.')],
    simon:[L2('Hands steady… hands steady…','Manos firmes… manos firmes…'),L2('I brought two spare sensors. I\'ll need three.','Traje dos sensores de repuesto. Voy a necesitar tres.'),L2('Glassware is just fragile by design.','El vidrio es frágil por diseño.'),
      L2('Why does everything slip out of my hands?','¿Por qué todo se me resbala de las manos?'),L2('Nothing broken yet. Yet.','Nada roto todavía. Todavía.')],
    sofi:[L2('A seal would slide down this slope so fast.','Una foca bajaría esta pendiente rapidísimo.'),L2('Elephant seals can dive 1,500 m. Just saying.','Los elefantes marinos bucean 1.500 m. Solo digo.'),L2('First position, second position… sampling position.','Primera posición, segunda posición… posición de muestreo.'),
      L2('I miss the ocean. And its seals.','Extraño el mar. Y sus focas.'),L2('Is the lake cold enough for seals? Too acidic, sadly.','¿El lago está helado pa\' las focas? Muy ácido, qué pena.')],
    tito:[L2('The compass tingles. We\'re close.','La brújula cosquillea. Estamos cerca.'),L2('Four times faster. It\'s not magic… it is magic.','Cuatro veces más rápido. No es magia… sí es magia.'),L2('Follow the sparkles. Always follow the sparkles.','Sigue los brillitos. Siempre sigue los brillitos.'),
      L2('Where did I get this compass? Better not ask.','¿De dónde saqué esta brújula? Mejor no preguntar.'),L2('North is overrated. Samples are the way.','El norte está sobrevalorado. Las muestras son el camino.')],
    yasna:[L2('Chorus rehearsal at 6. Everybody.','Ensayo del coro a las 6. Todos.'),L2('The duck is off-key again.','El pato está desafinado otra vez.'),L2('The guinea pig has stage fright.','El cuyi tiene miedo escénico.'),
      L2('Culli wants a solo. We\'ll see.','La Culli quiere un solo. Veremos.'),L2('Which song for the next site? Something volcanic.','¿Qué canción pa\'l próximo sitio? Algo volcánico.')]};
  Object.entries(THINK2).forEach(([k,a])=>{(THINK[k]=THINK[k]||[]).push(...a);});
  RIC.push(L2('Che, che, what a cold, che.','Che, che, qué frío, che.'),L2('Che, want a mate? It\'s bitter, che.','Che, ¿querés un mate? Es amargo, che.'),L2('Che, don\'t walk so fast, che.','Che, no camines tan rápido, che.'),L2('Che, look at the colours of that river, che.','Che, mirá los colores de ese río, che.'),
    L2('Che, the Copahue is ours, che. Well… half and half.','Che, el Copahue es nuestro, che. Bueno… mitad y mitad.'),L2('Che, loco, careful with the jerrycan.','Che, loco, cuidado con el bidón.'),L2('Che, re lindo esto, che.','Che, re lindo esto, che.'),L2('Che, dale, dale, che, let\'s go.','Che, dale, dale, che, vamos.'));
  SUIZA.push(L2('In Switzerland the cows have better funding than I do.','En Suiza las vacas tienen más financiamiento que yo.'),L2('Geneva, Bern, Basel… I don\'t mind which.','Ginebra, Berna, Basilea… me da igual cuál.'),L2('Chocolate, mountains and salaries. Switzerland has it all.','Chocolate, montañas y sueldos. Suiza lo tiene todo.'),
    L2('I\'m already learning German. Grüezi!','Ya estoy aprendiendo alemán. ¡Grüezi!'));
  GYM.push(L2('Carry the jerrycan like a farmer\'s walk. Core tight!','Lleva el bidón como farmer\'s walk. ¡Abdomen firme!'),L2('Rest day? I don\'t know her.','¿Día de descanso? No la conozco.'),L2('After the campaign: gym, gym and more gym.','Después de la campaña: gimnasio, gimnasio y más gimnasio.'),
    L2('Volcano stairs: the best glute workout.','Subir el volcán: el mejor ejercicio de glúteos.'),L2('Hydration is key! Not with that water, though.','¡La hidratación es clave! Pero no con esa agua.'));
  ISS.push(L2('Claude, add more sheep. No, more.','Claude, pon más ovejas. No, más.'),L2('Every bug you find is an easter egg. Officially.','Cada bug que encuentren es un easter egg. Oficialmente.'),L2('Nobody samples faster than me. Because I wrote the rules.','Nadie muestrea más rápido que yo. Porque yo escribí las reglas.'),
    L2('Look at those shadows. Look at them!','Miren esas sombras. ¡Mírenlas!'),L2('Next version: the volcano erupts confetti.','Próxima versión: el volcán erupciona confeti.'));
  SANT.push(L2('Ochosi, guide my steps to the sampling site 🏹','Ochosi, guía mis pasos al sitio de muestreo 🏹'),L2('A candle for the ancestors when we get back, mi amor.','Una vela pa\' los ancestros cuando volvamos, mi amor.'),L2('Oyá rules the wind… and today she\'s angry 🌪️','Oyá manda en el viento… y hoy está brava 🌪️'),
    L2('With aché everything works, even the pump.','Con aché todo funciona, hasta la bomba.'));
  // ---- remarks when walking past animals (sheep, goats, dogs, foxes, guanacos, bandurrias, condors, fish)
  const FAUNA_SAY={
    sheep:['🐑',[L2('Look at all these sheep! Somebody is going to have a lot of wool.','¡Mira todas estas ovejas! Alguien va a tener harta lana.'),L2('Baaa. Sorry, I had to.','Beee. Perdón, tenía que hacerlo.'),
      L2('Easy, sheep, I only want water, not your grass.','Tranquila, oveja, yo solo quiero agua, no tu pasto.'),L2('One sheep, two sheep… don\'t fall asleep, Lab!','Una oveja, dos ovejas… ¡no te duermas, Lab!'),L2('These are veranada sheep: they come up to the valley in summer.','Son ovejas de veranada: suben al valle en verano.')]],
    goat:['🐐',[L2('Chivas! They climb better than we do.','¡Chivas! Trepan mejor que nosotros.'),L2('That goat is looking at me like I owe it money.','Esa chiva me mira como si le debiera plata.'),
      L2('Don\'t eat my field notebook, please.','No te comas mi libreta de campo, por favor.'),L2('The crianceros bring the chivas up for the summer.','Los crianceros suben las chivas pa\'l verano.')]],
    dog:['🐕',[L2('Hello, good boy! Guarding the flock?','¡Hola, perrito! ¿Cuidando el rebaño?'),L2('Working dog, no petting… well, maybe a little.','Perro de trabajo, no se acaricia… bueno, un poquito.'),
      L2('He is doing a better job than all of us.','Está trabajando mejor que todos nosotros.')]],
    fox:['🦊',[L2('A culpeo fox! Stay still, stay still…','¡Un zorro culpeo! Quieto, quieto…'),L2('Look at that orange tail!','¡Mira esa cola naranja!'),
      L2('The fox is watching the sheep. And us.','El zorro está vigilando las ovejas. Y a nosotros.'),L2('Don\'t steal our sandwiches, fox.','No te robes los sánguches, zorro.')]],
    guanaco:['🦙',[L2('Guanacos! Keep your distance, they spit.','¡Guanacos! Mantén la distancia, que escupen.'),L2('What a view: guanacos grazing in the steppe.','Qué vista: guanacos pastando en la estepa.'),
      L2('That one is the lookout. It is staring right at me.','Ese es el vigía. Me está mirando fijo.'),L2('Wild cousins of the llama, living in the cold.','Primos salvajes de la llama, viviendo en el frío.')]],
    guanacoRun:['🦙',[L2('Wait, don\'t run! I\'m harmless!','¡Espera, no corras! ¡Soy inofensivo!'),L2('Look at them go! Guanacos are fast.','¡Mira cómo corren! Los guanacos son rápidos.'),L2('Oops, I scared the herd.','Ups, asusté a la manada.')]],
    bandurria:['🐦',[L2('Bandurrias! Look at those curved beaks.','¡Bandurrias! Mira esos picos curvos.'),L2('They are digging for worms in the mud.','Están sacando gusanos del barro.'),
      L2('Bandurrias are so loud in the morning…','Las bandurrias son tan escandalosas en la mañana…')]],
    bandurriaFly:['🐦',[L2('Ay, I scared the bandurrias!','¡Ay, espanté a las bandurrias!'),L2('There they go, honking like a traffic jam.','Ahí van, gritando como taco en hora punta.'),L2('Sorry, birds! Keep eating!','¡Perdón, pajaritos! ¡Sigan comiendo!')]],
    condor:['🦅',[L2('Look up! A condor!','¡Mira arriba! ¡Un cóndor!'),L2('Three metres of wings and it doesn\'t even flap.','Tres metros de alas y ni siquiera aletea.'),
      L2('The condor is circling… I hope it is not waiting for me.','El cóndor está dando vueltas… ojalá no me esté esperando a mí.'),L2('The condor rides the warm air off the volcano.','El cóndor aprovecha el aire caliente del volcán.')]],
    fish:['🐟',[L2('A fish jumped! This water is not so acidic here.','¡Saltó un pez! Aquí el agua no es tan ácida.'),L2('Trout! In the Agrio up high you would never see that.','¡Una trucha! Río arriba en el Agrio nunca verías eso.'),L2('Did you see that? Splash!','¿Viste eso? ¡Splash!')]]};
  const FAUNA_ME={abraham:{sheep:[L2('Sheep… lamb… asado… is it lunch time?','Ovejas… cordero… asado… ¿ya es hora de almuerzo?')],goat:[L2('Chivito al palo… no, Abraham, focus.','Chivito al palo… no, Abraham, concéntrate.')]},
    sofi:{sheep:[L2('Cute, but they are not seals.','Tiernas, pero no son focas.')],fish:[L2('A fish! A seal would love this river.','¡Un pez! A una foca le encantaría este río.')],guanaco:[L2('Guanacos are fine… but have you seen a seal?','Los guanacos están bien… ¿pero has visto una foca?')]},
    alejandro:{bandurria:[L2('Bandurrias… I feel a strange connection to them.','Bandurrias… siento una conexión extraña con ellas.')],condor:[L2('Condor, brother! Take me with you!','¡Cóndor, hermano! ¡Llévame contigo!')]},
    yasna:{dog:[L2('Another voice for the dog choir!','¡Otra voz para el coro de perros!')],sheep:[L2('The sheep could do the backing vocals. Beee!','Las ovejas podrían hacer los coros. ¡Beee!')]},
    fernando:{fish:[L2('If a fish lives here, I can drink it. Right?','Si aquí vive un pez, me lo puedo tomar. ¿Cierto?')]},
    pedro:{guanaco:[L2('Cami, do guanacos count as microbes? No? OK.','Cami, ¿los guanacos cuentan como microbios? ¿No? Ya.')]},
    simon:{goat:[L2('Careful, chiva, don\'t knock over the glassware!','¡Cuidado, chiva, no me botes el vidrio!')]},
    gustavo:{guanaco:[L2('Look at those legs! Guanacos never skip leg day.','¡Mira esas patas! Los guanacos nunca se saltan el día de pierna.')]}};
  const faunaCd={};let faunaT=6;
  function faunaNear(){const o=[],x=pl.x,z=pl.z;
    if(Wd.groups.life.visible)(Wd.animals||[]).forEach(A=>{if(A.g.visible!==false)o.push({kind:A.goat?'goat':A.kind,d:Math.hypot(A.x-x,A.z-z)});});
    if(window.FPW&&FPW.fauna)try{FPW.fauna(x,z).forEach(a=>o.push(a.kind==='guanaco'&&a.st==='flee'?{kind:'guanacoRun',d:a.d}:a.kind==='bandurria'&&a.st==='fly'?{kind:'bandurriaFly',d:a.d}:a));}catch(_){}
    return o;}
  const FAUNA_R={sheep:.7,goat:.7,dog:.5,fox:.9,guanaco:1.1,guanacoRun:1.1,bandurria:.8,bandurriaFly:.9,condor:2.5,fish:.9};
  const FAUNA_CD={condor:150,fish:40,guanacoRun:25,bandurriaFly:25};
  function faunaTalk(k,dt){faunaT-=dt;for(const q in faunaCd)faunaCd[q]-=dt;if(faunaT>0||ps.act||pl.inTruck||bubT>0||hush()||mode!=='play')return;faunaT=1;
    const seen=faunaNear().filter(a=>FAUNA_SAY[a.kind]&&a.d<FAUNA_R[a.kind]&&!(faunaCd[a.kind]>0)).sort((a,b)=>a.d/FAUNA_R[a.kind]-b.d/FAUNA_R[b.kind]);if(!seen.length)return;
    const kind=seen[0].kind,[ico,pool]=FAUNA_SAY[kind],base=kind.replace(/Run|Fly/,''),mine=(FAUNA_ME[k]||{})[base];
    let l=(mine&&Math.random()<.5?pk(mine):pk(pool))();if(isArg()&&Math.random()<.5)l='Che, '+l.charAt(0).toLowerCase()+l.slice(1);
    say(ico+' '+l,3.4);AU.sfx.voice(5,CHARS[charIdx].f?220:140);faunaCd[kind]=FAUNA_CD[kind]||R(45,70);if(kind!==base)faunaCd[base]=Math.max(faunaCd[base]||0,20);faunaT=R(15,30);}
  // ---- scheduler for the new acts
  function trigger2(k,dt,foot,moving){if(ps.act)return;
    if(k==='yasna'){ps.n2-=dt;if(ps.n2<=0&&foot&&pl.carry===0){ps.n2=R(38,55);start('karaoke',10.5);}}
    else if(k==='catalina'){ps.n2-=dt;if(ps.n2<=0&&foot&&pl.carry===0){ps.n2=R(28,42);start('photo',6.5);}}
    else if(k==='celia'){ps.n2-=dt;if(ps.n2<=0&&foot&&pl.carry===0){ps.n2=R(32,46);start('salsa',9);}}
    else if(k==='ana'){ps.n2-=dt;if(ps.n2<=0&&foot&&pl.carry===0){ps.n2=R(30,44);if(Math.random()<.4)start('read',8.5);else start('dance',9.5);}}
    else if(k==='mati'){ps.n2-=dt;if(ps.n2<=0&&foot&&pl.carry===0){ps.n2=R(22,34);start('yeta',5.2);}}
    else if(k==='fernando'){ps.n2-=dt;if(ps.n2<=0&&foot){const E=Wd.infoAt(pl.x,pl.z);if(E&&E.rv.d<.14&&E.rv.ph<4.5){ps.n2=R(35,55);start('taste',5.4,{ph:E.rv.ph});}}}
    else if(k==='sofi'){ps.n2-=dt;if(ps.n2<=0&&foot&&moving){ps.n2=R(16,26);if(Math.random()<.5){ps.bal=4;say(LX('🩰 Ballet walk!','🩰 ¡Caminata de ballet!'),1.8);}else start('seal',2.4);}}}
  function sofiBallet(u,g,dt){if(!(ps.bal>0))return;ps.bal-=dt;if(pl.inTruck){ps.bal=0;return;}u.armL.rotation.z=u.armR.rotation.z=2.85;u.armL.rotation.x=-.35;u.armR.rotation.x=.35;g.position.y+=.012;u.legL.rotation.z=.5+Math.sin(pl.walk)*.2;u.legR.rotation.z=-.15;g.rotation.y=pl.yaw+ (4-ps.bal)*Math.PI*1.6;g.rotation.z=0;}
  // ================= PERKS 3: Prisci's ten kids, Gabriel the mountaineer
  const KIDS={list:[],crumbs:[],talk:2,hid:false};
  const MAMA=[L2('Mom, I\'m hungry!','¡Mamá, tengo hambre!'),L2('Mom, are we there yet?','Mamá, ¿falta mucho?'),L2('Mom, look, a fox!','¡Mamá, mira, un zorro!'),L2('Mom, he hit me!','¡Mamá, él me pegó!'),L2('Mom, I need to pee!','¡Mamá, me hago pipí!'),
    L2('Mom, why is the river orange?','Mamá, ¿por qué el río es naranjo?'),L2('Mom, can I carry the jerrycan?','Mamá, ¿puedo llevar yo el bidón?'),L2('Mom, mom, MOM!','¡Mamá, mamá, MAMÁ!'),L2('Mom, will you buy me a volcano?','Mamá, ¿me compras un volcán?'),
    L2('Mom, I lost a shoe!','¡Mamá, se me cayó un zapato!'),L2('Mom, I\'m cold!','¡Mamá, tengo frío!'),L2('Mom, what\'s a metagenome?','Mamá, ¿qué es un metagenoma?'),L2('Mom, carry me!','¡Mamá, tómame en brazos!'),
    L2('Mom, Nehuen licked me!','¡Mamá, el Nehuen me lamió!'),L2('Mom, can we swim in the acid pool?','Mamá, ¿nos podemos bañar en la piscina ácida?'),L2('Mom, she took my snack!','¡Mamá, ella me quitó la colación!'),
    L2('Mom, I\'m bored…','Mamá, estoy aburrido…'),L2('Mom, can I press the pump button?','Mamá, ¿puedo apretar el botón de la bomba?'),L2('Mom, is the volcano going to explode?','Mamá, ¿el volcán va a explotar?'),L2('Mom, I want ice cream!','¡Mamá, quiero helado!')];
  const KIDCOL=['#ff4f6d','#ffb703','#3a86ff','#8338ec','#06d6a0','#fb5607','#ff006e','#2ec4b6','#ffd23f','#9ef01a'];
  function kidsMake(){if(KIDS.list.length)return;const skins=['#e6b08c','#d9a585','#c99472','#e8bc9c','#b98060'],hairs=['#141010','#3a2418','#5a3a24','#d8b070','#1e1410'];
    for(let i=0;i<10;i++){const h=[.42,.48,.52,.56,.6,.63,.66,.7,.74,.78][i],f=i%2===0;const g=makePerson({f:f?1:0,skin:pk(skins),hair:pk(hairs),style:f?pk(['long','longCurly','medium']):pk(['short','shortCurly','medium']),top:KIDCOL[i],pants:pk(['#2e3a52','#3a3d44','#6b2a6b','#2a6b4a']),shoes:pk(['#f0ece4','#ff4f6d','#222']),h});
      const bp=g.children.find(c=>c.geometry&&c.geometry.type==='BoxGeometry'&&Math.abs(c.position.x+.026)<.002);if(bp)bp.visible=false;
      g.visible=false;Wd.scene.add(g);KIDS.list.push({g,x:pl.x,z:pl.z,yaw:pl.yaw,ph:Math.random()*6,h,off:(Math.random()-.5)*.09,lag:0});}}
  function kidsRemove(){KIDS.list.forEach(k=>Wd.scene.remove(k.g));KIDS.list=[];KIDS.crumbs=[];}
  function kidsUpdate(dt,t){kidsMake();const L=KIDS.list;
    if(pl.inTruck){if(!KIDS.hid){KIDS.hid=true;L.forEach(k=>{if(k.g.visible)puff(k.x,k.z);k.g.visible=false;});}
      L.forEach(k=>{k.x=truck.x;k.z=truck.z;});KIDS.crumbs=[];return;}
    if(KIDS.hid||!L[0].g.visible){KIDS.hid=false;L.forEach((k,i)=>{const a=i/10*6.283;k.x=pl.x+Math.cos(a)*.12;k.z=pl.z+Math.sin(a)*.12;k.g.visible=true;puff(k.x,k.z);});}
    const C=KIDS.crumbs,last=C[0];if(!last||Math.hypot(pl.x-last[0],pl.z-last[1])>.025){C.unshift([pl.x,pl.z]);if(C.length>80)C.pop();}
    L.forEach((k,i)=>{const ci=Math.min(C.length-1,3+i*3),c=C[ci]||[pl.x,pl.z];let tx=c[0],tz=c[1];const py=pl.yaw;tx+=Math.sin(py)*k.off;tz+=Math.cos(py)*k.off;
      if(!inputAxes().some(q=>Math.abs(q)>.05)){const an=py+Math.PI*.35+i/10*Math.PI*1.3,rr=.13+(i%3)*.045;tx=pl.x+Math.cos(an)*rr;tz=pl.z-Math.sin(an)*rr;}
      // keep a little distance from mum and from each other
      const dm=Math.hypot(tx-pl.x,tz-pl.z);if(dm<.07){tx=pl.x-Math.cos(py)*.07;tz=pl.z+Math.sin(py)*.07;}
      const dx=tx-k.x,dz=tz-k.z,d=Math.hypot(dx,dz);let mv=false;
      if(d>2){k.x=tx;k.z=tz;puff(tx,tz);}else if(d>.02){const v=Math.min(d*6,pl.running?1.9:1.2),s=Math.min(d,v*dt);k.x+=dx/d*s;k.z+=dz/d*s;k.yaw=angLerp(k.yaw,Math.atan2(-dz,dx),Math.min(1,dt*10));k.ph+=dt*v*(46/k.h);mv=true;}
      else k.yaw=angLerp(k.yaw,Math.atan2(-(pl.z-k.z),pl.x-k.x),Math.min(1,dt*3));
      L.forEach(o=>{if(o===k)return;const ex=k.x-o.x,ez=k.z-o.z,ed=Math.hypot(ex,ez);if(ed<.045&&ed>1e-5){k.x+=ex/ed*(.045-ed)*.5;k.z+=ez/ed*(.045-ed)*.5;}});
      const u=k.g.userData,w=mv?Math.sin(k.ph)*.8:0,hop=(!mv&&(i%3===0))?Math.abs(Math.sin(t*6+i))*.012:0;
      k.g.position.set(k.x,Wd.heightAt(k.x,k.z)+hop+(mv?Math.abs(Math.sin(k.ph))*.006:0),k.z);k.g.rotation.set(0,k.yaw,0);
      u.legL.rotation.z=w;u.legR.rotation.z=-w;u.armL.rotation.z=mv?-w*.8:(i%4===1?2.6+Math.sin(t*8+i)*.3:.1);u.armR.rotation.z=mv?w*.8:.1;u.can.visible=u.probe.visible=false;});
    KIDS.talk-=dt;if(KIDS.talk<=0&&mode==='play'){KIDS.talk=R(1.8,3.6);const k=pk(L.filter(q=>q.g.visible));if(k){const yy=()=>[k.x,Wd.heightAt(k.x,k.z)+.5*k.h+.06,k.z];npcSay(pk(MAMA)(),yy,2.6);AU.sfx.voice(2+Math.floor(Math.random()*3),330+Math.random()*120);}}}
  // ---- Gabriel: outdoor pro — random gear, walks & samples in snow, climbs fast
  const GEAR={g:null,next:0,look:[]};
  const GEAR_ITEMS=[
    ['helmet',L2('climbing helmet','casco de escalada'),(p)=>{A_(p,new THREE.SphereGeometry(.021,12,8,0,Math.PI*2,0,Math.PI*.5),'#ff7b00',-.001,.18,0);A_(p,new THREE.BoxGeometry(.006,.006,.012),'#1d1a2b',.017,.197,0);}],
    ['rope',L2('coiled rope','cuerda enrollada'),(p)=>{for(let k=0;k<3;k++){const r=A_(p,new THREE.TorusGeometry(.028,.0035,6,20),k%2?'#e63946':'#ffd23f',-.01,.13-k*.006,0);r.rotation.set(.2,0,.9);}}],
    ['biners',L2('carabiners & harness','mosquetones y arnés'),(p)=>{const hr=A_(p,new THREE.TorusGeometry(.022,.003,6,18),'#1d1a2b',0,.08,0);hr.rotation.x=Math.PI/2;['#ffd23f','#3a86ff','#e63946','#06d6a0','#c9c9d1'].forEach((c,k)=>{const b=A_(p,new THREE.TorusGeometry(.0045,.0012,4,10),c,.012-k*.006,.068,.018-k*.008);b.rotation.y=k;});}],
    ['axe',L2('ice axe','piolet'),(p,u)=>{const q=new THREE.Group();q.position.set(0,-.068,0);u.armL.add(q);A_(q,new THREE.CylinderGeometry(.002,.002,.06,5),'#3a3d44',0,-.01,0);const hd=A_(q,new THREE.BoxGeometry(.034,.005,.004),'#c9c9d1',0,.02,0);hd.rotation.z=.1;p.userData.extra=(p.userData.extra||[]).concat([q]);}],
    ['bino',L2('binoculars','binoculares'),(p)=>{[-1,1].forEach(s=>A_(p,new THREE.CylinderGeometry(.004,.004,.012,8),'#1d1a2b',.022,.137,.006*s).rotation.z=Math.PI/2);A_(p,new THREE.TorusGeometry(.016,.0012,4,16),'#222',.012,.148,0).rotation.set(0,Math.PI/2,.5);}],
    ['poles',L2('trekking poles','bastones de trekking'),(p,u)=>{[u.armL,u.armR].forEach(a=>{const q=new THREE.Group();q.position.set(0,-.068,0);a.add(q);A_(q,new THREE.CylinderGeometry(.0015,.0015,.09,5),'#8a8a92',.004,-.04,0);A_(q,new THREE.CylinderGeometry(.0028,.0028,.012,6),'#1d1a2b',.004,.002,0);p.userData.extra=(p.userData.extra||[]).concat([q]);});}],
    ['crampons',L2('crampons','crampones'),(p,u)=>{[u.legL,u.legR].forEach(l=>{const q=new THREE.Group();q.position.set(.005,-.075,0);l.add(q);for(let k=0;k<4;k++)A_(q,new THREE.ConeGeometry(.002,.007,4),'#c9c9d1',-.008+k*.005,0,0).rotation.x=Math.PI;p.userData.extra=(p.userData.extra||[]).concat([q]);});}],
    ['pack',L2('huge alpine pack','mochila alpina gigante'),(p)=>{A_(p,new THREE.BoxGeometry(.03,.085,.036),'#2a6b4a',-.032,.13,0);A_(p,new THREE.CylinderGeometry(.009,.009,.04,8),'#ff7b00',-.032,.18,0).rotation.x=Math.PI/2;}],
    ['glasses',L2('glacier glasses','lentes de glaciar'),(p)=>{[-1,1].forEach(s=>A_(p,new THREE.CylinderGeometry(.0055,.0055,.003,10),'#1d1a2b',.018,.177,.007*s).rotation.z=Math.PI/2);[-1,1].forEach(s=>A_(p,new THREE.BoxGeometry(.004,.006,.002),'#3a3d44',.017,.177,.013*s));}],
    ['gaiters',L2('snow gaiters','polainas de nieve'),(p,u)=>{[u.legL,u.legR].forEach(l=>{const q=A_(l,new THREE.CylinderGeometry(.0105,.0105,.028,8),'#ffd23f',0,-.055,0);p.userData.extra=(p.userData.extra||[]).concat([q]);});}]];
  function gearOff(){const G=GEAR.g;if(!G)return;(G.userData.extra||[]).forEach(q=>q.parent&&q.parent.remove(q));G.parent&&G.parent.remove(G);GEAR.g=null;}
  function gearRoll(silent){gearOff();const u=pl.g.userData,p=new THREE.Group();pl.g.add(p);p.userData.extra=[];const pool=GEAR_ITEMS.slice().sort(()=>Math.random()-.5),n=3+Math.floor(Math.random()*3),pick=pool.slice(0,n);
    if(!pick.find(x=>x[0]==='rope'))pick[0]=GEAR_ITEMS[1];pick.forEach(it=>it[2](p,u));GEAR.g=p;GEAR.look=pick.map(x=>x[0]);GEAR.next=R(20,32);
    if(!silent){toast(LX('🧗 Gabriel gears up: ','🧗 Gabriel se equipa: ')+'<b>'+pick.map(x=>x[1]()).join(' + ')+'</b>',false,3600);AU.sfx.click();spark(pl.x,pl.g.position.y+.2,pl.z,10,0xffd23f,.4,.9);}}
  const GAB=[L2('This is nothing, you should see Aconcagua.','Esto no es nada, deberías ver el Aconcagua.'),L2('Snow? Perfect conditions 🏔️','¿Nieve? Condiciones perfectas 🏔️'),L2('Summit first, coffee later ☕','Primero la cumbre, después el café ☕'),
    L2('Always carry a spare carabiner.','Siempre hay que llevar un mosquetón de repuesto.'),L2('I can sample in a whiteout blindfolded.','Yo muestreo en un whiteout con los ojos cerrados.'),L2('Who needs trails? 🐐','¿Quién necesita senderos? 🐐')];
  GAB.push(L2('Rope, harness, helmet. The three amigos.','Cuerda, arnés, casco. Los tres amigos.'),L2('This squall is barely a breeze.','Esta ventisca es apenas una brisa.'),L2('I\'ll race you to the crater. You\'ll lose.','Te echo una carrera al cráter. Vas a perder.'),
    L2('Mountains don\'t care about deadlines.','A las montañas no les importan los plazos.'));
  X2.bino={start(){say(LX('🔭 Let me check the route…','🔭 Déjame revisar la ruta…'),2);},tick(A){if(once(A,'a',1.3))say(pk([LX('I see the summit… and a condor 🦅','Veo la cumbre… y un cóndor 🦅'),LX('Route looks good. Crampons on!','La ruta se ve bien. ¡Crampones puestos!'),LX('Weather window: 20 minutes. Let\'s go!','Ventana de buen tiempo: 20 minutos. ¡Vamos!')]),2.4);},
    pose(A,u,g){g.rotation.y=A.yaw;u.armL.rotation.z=u.armR.rotation.z=2.2;u.armL.rotation.x=.55;u.armR.rotation.x=-.55;g.rotation.x=-.08;u.can.visible=false;},end(){}};
  function gabriel(dt){if(!GEAR.g||GEAR.g.parent!==pl.g)gearRoll(true);GEAR.next-=dt;if(GEAR.next<=0)gearRoll(false);
    if(!ps.act){ps.n2-=dt;if(ps.n2<=0&&!pl.inTruck&&pl.fill<=0){ps.n2=R(28,42);if(GEAR.look.includes('bino'))start('bino',3);else{ps.t2=0;}}
      ps.t2-=dt;if(ps.t2<=0&&!hush()){ps.t2=R(15,30);say('🧗 '+pk(GAB)(),3);AU.sfx.voice(5,140);}}}
  // ================= PERKS 4: Ana reads, Mati the jinx, Estefanía the silent
  const BOOKS=[['📗','One Hundred Years of Solitude','Cien años de soledad',L2('Too many Aurelianos… I need a family tree 🌳','Demasiados Aurelianos… necesito un árbol genealógico 🌳')],
    ['📘','Brock Biology of Microorganisms','Brock, Biología de los microorganismos',L2('Chapter 13: acidophiles. Basically, this river.','Capítulo 13: acidófilos. O sea, este río.')],
    ['📙','The Selfish Gene','El gen egoísta',L2('So my genes wanted to come to Copahue. Makes sense.','O sea que mis genes querían venir al Copahue. Tiene sentido.')],
    ['📕','The House of the Spirits','La casa de los espíritus',L2('Clara would have predicted this eruption 🔮','Clara habría predicho esta erupción 🔮')],
    ['📗','I Contain Multitudes','Yo contengo multitudes',L2('Me too: about 38 trillion bacteria 🦠','Yo también: unos 38 billones de bacterias 🦠')],
    ['📘','Hopscotch (Rayuela)','Rayuela',L2('You can read it in any order. Like my field notes.','Se puede leer en cualquier orden. Como mis notas de campo.')],
    ['📙','Cosmos','Cosmos',L2('We are star stuff… and a bit of sulfur ✨','Somos polvo de estrellas… y un poco de azufre ✨')],
    ['📕','Bioinformatics for Dummies','Bioinformática para dummies',L2('Page 1: "Have you tried turning the cluster off and on?"','Página 1: "¿Probaste apagar y prender el clúster?"')]];
  X2.read={start(A,u){A.b=pk(BOOKS);const p=new THREE.Group();p.position.set(0,-.066,0);u.armR.add(p);A_(p,new THREE.BoxGeometry(.004,.028,.02),pk(['#e63946','#3a86ff','#06d6a0','#ffb703']),.012,0,.012);A_(p,new THREE.BoxGeometry(.0042,.026,.018),'#f4f0e6',.0125,0,.0135);A.book=p;
      say(`${A.b[0]} ${LX('Reading break:','Pausa de lectura:')} <i>${LX(A.b[1],A.b[2])}</i>`,3);AU.sfx.click();},
    tick(A){if(once(A,'a',3.3)){say(A.b[3](),3.4);AU.sfx.voice(5,215);}if(once(A,'p',2))beep(2400,.03,'triangle',.02);if(once(A,'c',6.4))say(pk([LX('10/10, recommended to the whole lab 📚','10/10, se lo recomiendo a todo el lab 📚'),LX('I\'ll lend it to you after the campaign.','Te lo presto después de la campaña.'),LX('Just one more chapter… OK, back to work!','Un capítulo más… ¡ya, a trabajar!')]),2.4);},
    pose(A,u,g){g.rotation.y=A.yaw;u.armR.rotation.z=1.25;u.armR.rotation.x=.45;u.armL.rotation.z=1.2;u.armL.rotation.x=-.5;g.rotation.x=.08;u.can.visible=false;if(A.t>2&&A.t<2.2&&A.book)A.book.rotation.y=Math.sin(A.t*40)*.3;},
    end(A){if(A.book&&A.book.parent)A.book.parent.remove(A.book);}};
  // ---- Mati: the jinx (yeta) — weird bad luck, best attitude
  const YETA=[['cloud',L2('A tiny cloud is raining ONLY on me ☔','Una nubecita está lloviendo SOLO sobre mí ☔'),L2('Free water to rinse the filters! 😄','¡Agua gratis pa\' enjuagar los filtros! 😄')],
    ['bolt',L2('Lightning out of a clear blue sky?! ⚡','¡¿Un rayo con el cielo despejado?! ⚡'),L2('Now I\'m charged to 100%! Let\'s go! 💪','¡Ahora estoy cargado al 100 %! ¡Vamos! 💪')],
    ['pine',L2('A pine nut, straight to the head! 🌰','¡Un piñón directo a la cabeza! 🌰'),L2('Well… lunch is sorted! 😋','Bueno… ¡almuerzo resuelto! 😋')],
    ['geyser',L2('A brand-new geyser, right under my feet! 💨','¡Un géiser nuevo justo bajo mis pies! 💨'),L2('New sampling site discovered! 📍','¡Nuevo sitio de muestreo descubierto! 📍')],
    ['condor',L2('A condor stole my sandwich! 🦅','¡Un cóndor me robó el sándwich! 🦅'),L2('Good thing I brought two! 🥪','¡Menos mal que traje dos! 🥪')],
    ['txt',L2('My boot sole just fell off 👢','Se me despegó la suela de la bota 👢'),L2('Duct tape and done! 🩹','¡Cinta americana y listo! 🩹')],
    ['txt',L2('A guanaco spat right in my face 🦙','Un guanaco me escupió en la cara 🦙'),L2('It\'s good for the skin, right? 😄','Es bueno pa\' la piel, ¿no? 😄')],
    ['txt',L2('My phone slid into the acid river 📱','Se me cayó el celular al río ácido 📱'),L2('Now it has pH 2 wallpaper! Ha!','¡Ahora tiene fondo de pantalla pH 2! ¡Ja!')],
    ['txt',L2('A pen exploded in my pocket 🖊️','Me explotó un lápiz en el bolsillo 🖊️'),L2('Blue is my colour anyway 💙','Igual el azul es mi color 💙')],
    ['txt',L2('The only cow pie on the whole volcano… and I stepped on it 💩','La única bosta de vaca en todo el volcán… y la pisé 💩'),L2('Statistically impressive! Onwards! 📈','¡Estadísticamente impresionante! ¡Adelante! 📈')],
    ['txt',L2('The zipper of my jacket broke 🧥','Se me rompió el cierre de la chaqueta 🧥'),L2('Extra ventilation, perfect for hiking! 🌬️','¡Ventilación extra, perfecta pa\' caminar! 🌬️')],
    ['txt',L2('A bee got into my helmet 🐝','Se me metió una abeja en el casco 🐝'),L2('We\'re friends now. Her name is Bea 🐝','Ya somos amigos. Se llama Bea 🐝')]];
  X2.yeta={start(A,u){A.e=pk(YETA);const K=A.e[0],y0=pl.g.position.y;say('😱 '+A.e[1](),2.4);AU.sfx.voice(4,190);
      if(K==='cloud'){const c=new THREE.Group();[[0,0,0,.07],[.06,.01,.02,.05],[-.06,.005,-.01,.055],[.02,.03,-.03,.05]].forEach(q=>A_(c,new THREE.SphereGeometry(q[3],10,8),'#6b6f80',q[0],q[1],q[2]));c.position.set(pl.x,y0+.55,pl.z);Wd.scene.add(c);A.obj=c;
        const q=new Float32Array(40*6);for(let i=0;i<40;i++){const x=(Math.random()-.5)*.14,z=(Math.random()-.5)*.14,y=Math.random()*.5;q.set([x,y,z,x,y-.04,z],i*6);}const gg=new THREE.BufferGeometry();gg.setAttribute('position',new THREE.BufferAttribute(q,3));
        A.rain=new THREE.LineSegments(gg,new THREE.LineBasicMaterial({color:0x8fd3ff}));A.rain.position.set(pl.x,y0,pl.z);Wd.scene.add(A.rain);AU.sfx.pour();}
      else if(K==='bolt'){const b=new THREE.Mesh(new THREE.BoxGeometry(.02,3,.02),new THREE.MeshBasicMaterial({color:0xfff27a}));b.position.set(pl.x,y0+1.6,pl.z);b.rotation.z=.05;Wd.scene.add(b);A.obj=b;splatDOM();AU.sfx.tear();AU.sfx.stamp();spark(pl.x,y0+.3,pl.z,30,0xfff27a,.8,1,.04);}
      else if(K==='pine'){const p=new THREE.Group();A_(p,new THREE.ConeGeometry(.03,.07,8),'#7a4a24',0,0,0).rotation.z=Math.PI;A_(p,new THREE.SphereGeometry(.025,8,6),'#5a3a1c',0,.02,0);p.position.set(pl.x,y0+1.4,pl.z);Wd.scene.add(p);A.obj=p;A.fall=1;}
      else if(K==='geyser'){AU.sfx.splash();burstSteam(pl.x,pl.z,y0,A);}
      else if(K==='condor'){const c=new THREE.Group();A_(c,new THREE.SphereGeometry(.04,10,8),'#1d1a2b',0,0,0).scale.set(1.8,.7,.8);A_(c,new THREE.SphereGeometry(.02,8,6),'#f4efe6',.07,.005,0);[-1,1].forEach(s=>{const w=A_(c,new THREE.BoxGeometry(.09,.006,.2),'#1d1a2b',0,.01,.11*s);w.userData.s=s;});
        A.obj=c;A.cx=pl.x-1.5;A.cz=pl.z-.6;c.position.set(A.cx,y0+.5,A.cz);Wd.scene.add(c);}
      else{puff(pl.x,pl.z);AU.sfx.stamp();}},
    tick(A,dt,t){const K=A.e[0],y0=Wd.heightAt(pl.x,pl.z);
      if(K==='cloud'&&A.rain){const p=A.rain.geometry.attributes.position;for(let i=0;i<p.count;i+=2){let y=p.getY(i)-dt*1.2;if(y<.02)y=.5;p.setY(i,y);p.setY(i+1,y-.04);}p.needsUpdate=true;A.obj.position.y=y0+.55+Math.sin(t*3)*.01;}
      if(K==='bolt'&&A.obj&&A.t>.3){Wd.scene.remove(A.obj);A.obj=null;}if(K==='bolt'&&A.t<2.5){A.sm=(A.sm||0)-dt;if(A.sm<=0){A.sm=.15;smokeP(pl.x,y0+.3,pl.z,true);}}
      if(K==='pine'&&A.fall){A.obj.position.y-=dt*2.4;A.obj.rotation.x+=dt*9;if(A.obj.position.y<=y0+.32){A.fall=0;AU.sfx.stamp();beep(900,.08,'triangle',.06);spark(pl.x,y0+.33,pl.z,8,0xffd23f,.3,.8,.03);A.obj.position.y=y0+.02;A.obj.position.x+=.06;}}
      if(K==='pine'&&!A.fall&&A.t<3){A.st=(A.st||0)-dt;if(A.st<=0){A.st=.2;const a=t*6;spark(pl.x+Math.cos(a)*.05,y0+.36,pl.z+Math.sin(a)*.05,1,0xffd23f,.05,.4,.03);}}
      if(K==='geyser'){A.sm=(A.sm||0)-dt;if(A.sm<=0&&A.t<2.5){A.sm=.06;smokeP(pl.x+(Math.random()-.5)*.05,y0+.02,pl.z+(Math.random()-.5)*.05,true);}}
      if(K==='condor'&&A.obj){A.cx+=dt*1.1;A.cz+=dt*.45;const dx=A.cx-pl.x,dz=A.cz-pl.z;A.obj.position.set(A.cx,y0+.28+Math.hypot(dx,dz)*.25,A.cz);A.obj.rotation.y=-Math.atan2(.45,1.1);A.obj.children.forEach(w=>{if(w.userData.s)w.rotation.x=Math.sin(t*9)*.4*w.userData.s;});if(A.t>1.3&&!A.sq){A.sq=1;AU.sfx.voice(3,520);}}
      if(once(A,'fix',2.6)){say('💪 '+A.e[2](),2.8);AU.sfx.tada();spark(pl.x,y0+.35,pl.z,14,undefined,.5,1);}},
    pose(A,u,g){g.rotation.y=A.yaw;u.can.visible=false;const K=A.e[0];let lift=0;
      if(K==='geyser')lift=A.t<1.6?Math.sin(Math.min(1,A.t/1.6)*Math.PI)*.28:0;g.position.y+=lift;
      if(A.t<2.6){u.armL.rotation.z=u.armR.rotation.z=2.7+Math.sin(A.t*18)*.15;g.rotation.z=K==='bolt'?Math.sin(A.t*40)*.08:0;}
      else{u.armR.rotation.z=2.9;u.armL.rotation.z=.4;g.position.y+=Math.abs(Math.sin(A.t*8))*.012;}},
    end(A){if(A.obj)Wd.scene.remove(A.obj);if(A.rain)Wd.scene.remove(A.rain);}};
  function burstSteam(x,z,y,A){for(let i=0;i<8;i++)smokeP(x+(Math.random()-.5)*.06,y+.02,z+(Math.random()-.5)*.06,true);}
  // ---- Estefanía: silent, calm, sometimes half-transparent
  const ESTE=[L2('(whispers) listen… the forest is breathing 🌿','(susurra) escucha… el bosque respira 🌿'),L2('(whispers) no need to rush.','(susurra) no hay que apurarse.'),L2('(whispers) shhh… a bird is singing.','(susurra) shhh… está cantando un pájaro.'),
    L2('(whispers) I like the sound of the water.','(susurra) me gusta el sonido del agua.'),L2('(whispers) breathe in… breathe out…','(susurra) inhala… exhala…'),L2('(whispers) I\'ve been here the whole time.','(susurra) estuve aquí todo el rato.')];
  ESTE.push(L2('(whispers) the wind is saying something…','(susurra) el viento está diciendo algo…'),L2('(whispers) look how the steam moves.','(susurra) mira cómo se mueve el vapor.'),L2('(whispers) the stones are warm here.','(susurra) aquí las piedras están tibias.'),
    L2('(whispers) everything is fine.','(susurra) todo está bien.'));
  const EST={a:1,tgt:1,next:R(14,24),hold:0,mats:null,g:null};
  function esteMats(){if(EST.g===pl.g&&EST.mats)return;EST.g=pl.g;EST.mats=[];pl.g.traverse(o=>{if(o.isMesh&&o.material&&!o.material.transparent){o.material=o.material.clone();o.material.transparent=true;EST.mats.push(o.material);}});}
  function estefania(dt){esteMats();EST.next-=dt;if(EST.hold>0){EST.hold-=dt;if(EST.hold<=0)EST.tgt=1;}
    if(EST.next<=0){EST.next=R(18,30);EST.tgt=.28;EST.hold=R(6,9);say('<span style="opacity:.7;font-size:12px">'+pk([LX('(fades out quietly…)','(se desvanece en silencio…)'),LX('(whispers) I\'m still here…','(susurra) sigo aquí…')])+'</span>',2.4);}
    EST.a+=(EST.tgt-EST.a)*Math.min(1,dt*1.6);EST.mats.forEach(m=>m.opacity=EST.a);
    ps.t2-=dt;if(ps.t2<=0&&!ps.act&&!hush()){ps.t2=R(15,30);say('<span style="font-size:12px;font-weight:400;font-style:italic;opacity:.8">'+pk(ESTE)()+'</span>',3.2);}}
  function esteOff(){if(EST.mats){EST.mats.forEach(m=>m.opacity=1);}EST.a=EST.tgt=1;EST.hold=0;}
  // ================= PERKS 5: Dilanaz the mechanic, Celia's Cuban best friend
  const MECH=[L2('One day I\'ll have my own garage: "Dilanaz Motors" 🏁','Algún día tendré mi propio taller: "Dilanaz Motors" 🏁'),L2('Science? Nah. Pistons, gaskets and motor oil 🛢️','¿Ciencia? Nah. Pistones, empaquetaduras y aceite de motor 🛢️'),
    L2('Hear that idle? The fan belt is slipping.','¿Escuchas ese ralentí? Está patinando la correa.'),L2('I\'d swap the 0.22 µm filter for an oil filter any day.','Cambiaría el filtro de 0,22 µm por un filtro de aceite cuando quieras.'),
    L2('This truck deserves a turbo. And so do I.','Esta camioneta merece un turbo. Y yo también.'),L2('Forget sequencing, I want to rebuild a V8 🔧','Olvídate de secuenciar, yo quiero armar un V8 🔧'),L2('Double-overhead cam… so beautiful 😍','Doble árbol de levas a la cabeza… qué hermoso 😍')];
  MECH.push(L2('Diesel smells better than sulfur. Fight me.','El diésel huele mejor que el azufre. Discútanme.'),L2('I can hear a loose bolt somewhere.','Escucho un perno suelto por algún lado.'),L2('A lift kit and bigger tyres: that\'s the dream.','Un kit de suspensión y ruedas más grandes: ese es el sueño.'),
    L2('Motor oil every 10,000 km. Don\'t forget it.','Aceite cada 10.000 km. No se olviden.'));
  X2.mech={start(A,u){const w=new THREE.Group();w.position.set(0,-.068,0);u.armR.add(w);A_(w,new THREE.BoxGeometry(.003,.03,.004),'#c9c9d1',.004,.004,0);A_(w,new THREE.TorusGeometry(.005,.0018,4,8,Math.PI*1.4),'#c9c9d1',.004,.02,0);A.w=w;
      A.yaw=Math.atan2(-(truck.z-pl.z),truck.x-pl.x);say(LX('🔧 Wait, this engine sounds wrong… let me check!','🔧 Espera, este motor suena raro… ¡déjame revisar!'),2.6);},
    tick(A,dt){A.c=(A.c||0)-dt;if(A.c<=0&&A.t<5.4){A.c=R(.25,.5);beep(pk([180,240,320]),.05,'square',.05);const fx=truck.x+Math.cos(truck.yaw)*.18,fz=truck.z-Math.sin(truck.yaw)*.18;spark(fx,truck.g.position.y+.12,fz,5,0xffb21a,.4,.6,.03);if(Math.random()<.4)smokeP(fx,truck.g.position.y+.12,fz,false);}
      if(once(A,'a',2.6))say(pk(MECH)(),3);
      if(once(A,'d',5.4)){ps.tune=90;AU.sfx.horn();toast(LX('🏁 Dilanaz tuned the truck: extra speed for 90 s!','🏁 Dilanaz afinó la camioneta: ¡velocidad extra por 90 s!'),false,3400);say(LX('Purrs like a kitten now 😎','Ahora ronronea como gatito 😎'),2.4);}},
    pose(A,u,g){g.rotation.y=A.yaw;g.rotation.x=.35;u.armR.rotation.z=1.6+Math.sin(A.t*14)*.35;u.armL.rotation.z=1.2;u.can.visible=false;},
    end(A){if(A.w&&A.w.parent)A.w.parent.remove(A.w);}};
  // ---- Celia's best friend, also Cuban: slang nobody else understands
  const CUBA=[['¡Asere, qué bolá!','¡Asere, qué bolá contigo, mi yunta!'],['Oye, eso está en llave, chama.','¡Tremenda muela la tuya, mi hermana!'],['¿Cogiste botella hasta el volcán?','No, mija, vine en guagua y a pie.'],
    ['Esto es un arroz con mango, asere.','¡Ñooo, qué clase de lío!'],['Ese bidón pesa un tanque, chica.','Dale, que tú estás puesta pa\' esto.'],['¿Y el yuma ese quién es?','Un pepillo del laboratorio, no te preocupes.'],
    ['Me voy echando, que se me va la guagua.','¡Ahorita nos vemos, mi amor!'],['¡Qué volá con el azufre, asere!','Eso huele a fósforo, chama.'],['Tú eres tremenda jeva, ¿sabes?','¡Ay, qué zalamera tú eres!']];
  const FRCOL=['#ffd23f','#ff4f6d','#00b4d8','#8338ec'];
  X2.friend={start(A,u){const cfg=Object.assign({},CHARS[charIdx],{top:pk(FRCOL),hair:pk(['#141010','#3a2418','#e0c070'])});const g=makePerson(cfg);const f=[Math.cos(pl.yaw),-Math.sin(pl.yaw)];
      A.fx=pl.x+f[0]*.14;A.fz=pl.z+f[1]*.14;g.position.set(A.fx,Wd.heightAt(A.fx,A.fz),A.fz);g.rotation.y=Math.atan2(-(pl.z-A.fz),pl.x-A.fx);Wd.scene.add(g);A.fg=g;A.yaw=Math.atan2(-(A.fz-pl.z),A.fx-pl.x);
      puff(A.fx,A.fz);spark(A.fx,Wd.heightAt(A.fx,A.fz)+.2,A.fz,22,undefined,.5,1.2);AU.sfx.tada();A.lines=CUBA.slice().sort(()=>Math.random()-.5).slice(0,3);
      toast(LX(`🇨🇺 Celia's best friend (also called Celia, also from Cuba) just showed up!`,`🇨🇺 ¡Apareció la mejor amiga de Celia (también se llama Celia y también es de Cuba)!`),false,3200);},
    tick(A){const fp=()=>[A.fx,Wd.heightAt(A.fx,A.fz)+.46,A.fz];A.lines.forEach((l,i)=>{if(once(A,'y'+i,.6+i*2.7)){say(l[0],2.4);AU.sfx.voice(6,220);}if(once(A,'f'+i,1.9+i*2.7)){npcSay('<b>Celia 2:</b> '+l[1],fp,2.4);AU.sfx.voice(6,240);}});
      if(once(A,'x',8.6))toast(LX('🤷 Nobody else understood a single word.','🤷 Nadie más entendió ni una palabra.'),false,2600);},
    pose(A,u,g,t){g.rotation.y=A.yaw;const s=Math.sin(A.t*7);u.armR.rotation.z=1.2+s*.6;u.armL.rotation.z=.6-s*.3;u.can.visible=false;
      const fu=A.fg.userData;fu.armL.rotation.z=1.3+Math.sin(A.t*6+1)*.7;fu.armR.rotation.z=.8+Math.cos(A.t*6)*.5;A.fg.position.y=Wd.heightAt(A.fx,A.fz)+Math.abs(Math.sin(A.t*4))*.006;},
    end(A){if(A.fg){puff(A.fx,A.fz);spark(A.fx,Wd.heightAt(A.fx,A.fz)+.2,A.fz,14,undefined,.4,1);Wd.scene.remove(A.fg);}if(A.g===pl.g)say(LX('Ay, I love her! 💛','¡Ay, cómo la quiero! 💛'),2);}};
  function trigger5(k,dt,foot){if(ps.act)return;
    if(k==='dilanaz'){ps.n3-=dt;if(ps.n3<=0&&foot&&Math.hypot(pl.x-truck.x,pl.z-truck.z)<.7){ps.n3=R(35,55);start('mech',6.4);}
      ps.t3-=dt;if(ps.t3<=0&&!hush()){ps.t3=R(15,30);say('🔧 '+pk(MECH)(),3.2);AU.sfx.voice(5,215);}}
    else if(k==='celia'){ps.n3-=dt;if(ps.n3<=0&&foot&&pl.carry===0){ps.n3=R(28,42);start('friend',9.6);}}}
  // ---------- main hooks
  function onChar(silent){if(ps.act)endAct();ps.n3=R(12,20);ps.t3=R(6,10);ps.t2=R(4,8);ps.n2=R(9,15);ps.bal=0;ps.anaI=ps.anaI||Math.floor(Math.random()*5);ps.cataN=0;ps.next=R(7,12);ps.talk=R(3,6);ps.boost=0;ps.sofiCd=2;ps.dist=0;ps.lx=null;if(is('seba'))ps.next=R(18,28);
    if(!is('pedro'))compRemove();if(!is('tito'))compassOff();
    const want=veh(VEH.type);if(truck.g&&truck.g.userData.vt!==want)setVehicle(VEH.type,VEH.col);
    if(silent&&desc())setTimeout(()=>toast('✨ '+desc(),false,6000),2600);}
  function update(dt,t){const k=who();updFX(dt);ps.q=(ps.q||0)+dt;
    bubT-=dt;for(let i=NB.length-1;i>=0;i--){NB[i].t-=dt;if(NB[i].t<=0){NB[i].el.remove();NB.splice(i,1);}}
    if(k==='pedro')compUpdate(dt,t);else if(comp.g)compRemove();
    if(k==='tito')compass(t);else compassOff();
    if(ps.act){ps.act.t+=dt;actTick(dt,t);if(ps.act&&ps.act.t>=ps.act.dur)endAct();}
    const foot=!pl.inTruck&&!WX.block&&pl.fill<=0,moving=!pl.inTruck&&inputAxes().some(a=>Math.abs(a)>.05);
    if(!ps.act){const tk=c=>{if(c){ps.next-=dt;return ps.next<=0;}return false;};
      if(k==='gustavo'&&tk(foot&&pl.carry===0)){ps.next=R(10,18);start('dash',6,{ox:pl.x,oz:pl.z,ph:'out',d:0,len:R(.45,.7),yaw:Math.random()*6.283});say(pk([LX('💨 Be right back!','💨 ¡Voy y vuelvo!'),LX('🏃 Wheee!','🏃 ¡Wiiii!'),LX('💨 I forgot something!','💨 ¡Se me olvidó algo!')]),1.4);AU.sfx.voice(3,260);}
      else if(k==='abraham'&&tk(foot&&pl.carry===0)){ps.next=R(24,38);ps.abP=!ps.abP;if(ps.abP)start('breakfast',6.5);else start('piano',11);}  // breakfast and piano recital, one after the other

      else if(k==='dilanaz'&&tk(foot&&pl.carry===0)){ps.next=R(24,36);start('smoke',7.6);}
      else if(k==='camila'&&tk(foot&&pl.carry===0)){ps.next=R(30,45);start('kpop',8.5);}
      else if(k==='alejandro'&&tk(!pl.inTruck)){ps.next=R(14,26);start('chicken',2);}
      else if(k==='juan'&&tk(!pl.inTruck&&pl.fill<=0)){ps.next=R(15,24);start('drink',1.8);}
      else if(k==='seba'&&tk(!WX.block&&pl.fill<=0)){ps.next=R(45,70);start('pdi',7.2);}
      else if(k==='issotta')issotta();}
    if(k==='juan'){ps.boost=Math.max(0,ps.boost-dt);if(!ps.act&&(ps.talk-=dt)<=0&&!hush()){ps.talk=R(15,30);say('💼 '+pk(STARTUP)(),4.6);}}
    trigger2(k,dt,foot,moving);talkers(k,dt);thinkers(k,dt);faunaTalk(k,dt);trigger5(k,dt,foot);if(ps.tune>0)ps.tune-=dt;
    if(k==='priscilla')kidsUpdate(dt,t);else if(KIDS.list.length)kidsRemove();
    if(k==='gabriel')gabriel(dt);else if(GEAR.g)gearOff();
    if(k==='estefania')estefania(dt);else if(EST.a<1)esteOff();
    if(k==='sofi')sofi(dt);
    if(k==='raquel')raquel(dt);}
  function pose(u,t,dt){const A=ps.act,g=pl.g,rk=truck.g&&truck.g.userData.kind;
    if(rk==='horse'){const ud=truck.g.userData,a=Math.min(1,Math.abs(truck.speed)/.5);ud.ph=(ud.ph||0)+Math.abs(truck.speed)*dt*10;ud.hl.forEach((l,i)=>l.rotation.z=Math.sin(ud.ph+(i===0||i===3?0:Math.PI))*.6*a);ud.tail.rotation.x=Math.sin(t*3)*.3;ud.head.rotation.z=Math.sin(ud.ph*2)*.06*a;}
    u.armL.rotation.x=u.armR.rotation.x=u.legL.rotation.x=u.legR.rotation.x=0;g.rotation.x=0;
    if(pl.inTruck&&rk){g.visible=true;const bike=rk==='bike',fx=Math.cos(truck.yaw),fz=-Math.sin(truck.yaw),back=bike?-.035:-.01,up=bike?.062:.13;
      const bob=bike?0:Math.abs(Math.sin(truck.g.userData.ph||0))*.012*Math.min(1,Math.abs(truck.speed));
      g.position.set(truck.x+fx*back,truck.g.position.y+up+bob,truck.z+fz*back);g.rotation.set(0,truck.yaw,bike?-.28:-.04);
      if(bike){u._ped=(u._ped||0)+truck.speed*dt*14;u.legL.rotation.z=1.05+Math.sin(u._ped)*.45;u.legR.rotation.z=1.05-Math.sin(u._ped)*.45;u.armL.rotation.z=u.armR.rotation.z=.8;}
      else{u.legL.rotation.set(-.6,0,.5);u.legR.rotation.set(.6,0,.5);u.armL.rotation.z=u.armR.rotation.z=.9;}
      u.can.visible=u.probe.visible=false;(u.anim||[]).forEach(f=>f(t,Math.abs(truck.speed)>.1));return;}
    if(pl.inTruck)return;
    const mv=inputAxes().some(a=>Math.abs(a)>.05);
    if(!A){if(is('gustavo')&&mv){const w=Math.sin(pl.walk)*1.9;u.armL.rotation.z=-w;if(pl.carry===0)u.armR.rotation.z=w;u.armL.rotation.x=-.3-Math.abs(w)*.25;u.armR.rotation.x=.3+Math.abs(w)*.25;}
      if(is('juan')&&ps.boost>0){g.position.x+=(Math.random()-.5)*.004;g.position.z+=(Math.random()-.5)*.004;}
      if(is('sofi'))sofiBallet(u,g,dt);
      return;}
    const k=A.k;
    if(X2[k]){X2[k].pose(A,u,g,t);return;}
    if(k==='dash'){const w=Math.sin(pl.walk)*1.15;u.legL.rotation.z=w;u.legR.rotation.z=-w;u.armL.rotation.z=-w*1.7;u.armR.rotation.z=w*1.7;u.armL.rotation.x=-.5;u.armR.rotation.x=.5;g.rotation.z=A.ph==='out'?-.4:.3;}
    else if(k==='breakfast'){g.rotation.y=A.yaw;g.position.y-=.05;u.legL.rotation.z=u.legR.rotation.z=1.4;u.armL.rotation.z=1.25;u.armR.rotation.z=1.9+Math.sin(A.t*6)*.65;u.can.visible=false;u.probe.visible=false;}
    else if(k==='smoke'){const ph=(A.t%2.6)/2.6;u.armR.rotation.z=ph<.4?2.55:lerp(.35,.2,ph);u.armL.rotation.z=.15;u.legL.rotation.z=u.legR.rotation.z=0;}
    else if(k==='kpop'){dance(g,u,A.t,A.yaw,g.position.y);u.can.visible=false;}
    else if(k==='fall'){const e=A.t<.35?Math.pow(A.t/.35,2):A.t<1.9?1:1-(A.t-1.9)/.7;g.rotation.z=-1.45*clamp(e,0,1);u.armL.rotation.z=u.armR.rotation.z=2.6*clamp(e,0,1);u.legL.rotation.z=-.2*e;u.legR.rotation.z=.2*e;if(A.t<.35)g.rotation.y=A.yaw;}
    else if(k==='chicken'){const c=u.pk&&u.pk.chicken;if(c){const w=mv?Math.sin(pl.walk*1.4)*.8:0;c.userData.legs[0].rotation.z=w;c.userData.legs[1].rotation.z=-w;c.position.y=mv?Math.abs(Math.sin(pl.walk*1.4))*.01:0;c.rotation.z=Math.sin(t*20)*.05;}}
    else if(k==='drink'){u.armR.rotation.z=2.55;}
    else if(k==='pdi'){u.legL.rotation.z=u.legR.rotation.z=0;u.armL.rotation.z=0;u.armR.rotation.z=(u.pk&&u.pk.card&&u.pk.card.visible)?1.3:0;}
    else if(k==='magic'){u.armL.rotation.z=u.armR.rotation.z=2.9;u.armL.rotation.x=-.5-Math.sin(A.t*12)*.2;u.armR.rotation.x=.5+Math.sin(A.t*12)*.2;g.rotation.y=A.yaw+A.t*3;u.legL.rotation.z=u.legR.rotation.z=0;}}
  function hud(){const show=mode==='play'&&!cam.map;
    if(bub){const sub=fpOn();bub.classList.toggle('fpsub',sub);if(sub)bub.style.display=show&&bubT>0?'':'none';else{const y=pl.inTruck?truck.g.position.y+(animal()?.52:.32):pl.g.position.y+(is('tito')?.52:.37);projectLabel(bub,pl.x,y,pl.z,show&&bubT>0);}}
    NB.forEach(b=>{const p=b.p();projectLabel(b.el,p[0],p[1],p[2],show&&b.t>0);});}
  return {descOf:i=>DESC[ID[i]]?DESC[ID[i]]():'',is,veh,vmax,animal,driveLbl,desc,update,pose,hud,onChar,onExit,cheCaniche,talkBoat,
    _cmp:()=>({cmp,trail}),_start:(k,d,e)=>start(k,d,e),_say:(h,s)=>say(h,s),freeze:()=>!!(ps.act&&FREEZE.includes(ps.act.k)),spd:()=>is('gustavo')?1.35:(is('juan')&&ps.boost>0)?1.5:1,_ps:ps};
})();
window.__pk=PK;

// ------------------------------------------------------------ update: player / truck
let fillTarget=null;
function updatePlay(dt,t){
  S.t+=dt;PK.update(dt,t);
  const [ax,ay]=inputAxes();
  if(pl.inTruck){
    const onRoad=roadDist(truck.x,truck.z)<.08;const E=Wd.infoAt(truck.x,truck.z);const ford=E&&E.rv.d<.07;
    let vmax=(onRoad?3.0:1.5)*PK.vmax(onRoad);if(ford)vmax=.5;if(WX.block)vmax*=.4;
    const tgt=PK.freeze()?0:(ay>0?vmax*ay:ay<0?-.7*(-ay):0);if(PK.freeze())truck.speed*=Math.max(0,1-dt*3);
    const acc=(Math.sign(tgt)!==Math.sign(truck.speed)&&Math.abs(truck.speed)>.05)?4.8:(tgt===0?1.7:2.05);
    truck.speed+=clamp(tgt-truck.speed,-acc*dt,acc*dt);
    truck.yaw-=ax*dt*1.9*clamp(truck.speed/.9,-1,1);
    const fx=Math.cos(truck.yaw),fz=-Math.sin(truck.yaw);
    const nx=truck.x+fx*truck.speed*dt,nz=truck.z+fz*truck.speed*dt;
    const h0=Wd.heightAt(truck.x,truck.z),h1=Wd.heightAt(nx,nz);const dd=Math.abs(truck.speed*dt)||1e-6;
    const slope=(h1-h0)/dd,m1=meters(h1);
    let block=null;
    if(offEdge(nx,nz,.3)){startFall(true,fx*truck.speed,fz*truck.speed);return;}
    if(Math.hypot(nx-base.x,nz-base.z)<.55&&Math.hypot(nx-base.x,nz-base.z)<Math.hypot(truck.x-base.x,truck.z-base.z))block='🚧 Vehicles stay outside the MEL Field Base. Park and walk in (E).';
    else if(Wd.infoAt(nx,nz).dl<.03)block='Trucks don\'t float — find another way around the lake.';
    else if(m1>2330&&h1>h0)block='Too steep and loose for the truck up here. Get out <kbd>E</kbd> and hike!';
    else if(!onRoad&&slope>1.6&&truck.speed>0)block='Too steep! Try a gentler line (or walk).';
    if(block){truck.speed*=-.25;warnOnce(block);}else{truck.x=nx;truck.z=nz;}
    pl.x=truck.x;pl.z=truck.z;pl.yaw=truck.yaw;
  }else if(WX.block&&!PK.is('gabriel')){if(inputAxes().some(v=>Math.abs(v)>.1))warnOnce('❄ Whiteout! It is too dangerous to walk until the squall passes.');
  }else if(PK.freeze()){pl.moveT=0;pl.running=false;
  }else{
    // camera-relative walking
    const cy=cam.yaw+cam.dragYaw;const fx=Math.cos(cy),fz=-Math.sin(cy),rx=-fz,rz=fx;
    let dx=fx*ay+rx*ax,dz=fz*ay+rz*ax;const l=Math.hypot(dx,dz);
    if(l<=.05){pl.moveT=0;pl.running=false;}
    if(l>.05){dx/=Math.max(1,l);dz/=Math.max(1,l);
      pl.moveT=(pl.moveT||0)+dt;const run=(K('ShiftLeft')||K('ShiftRight')||pl.moveT>1.1)&&pl.carry===0;pl.running=run;
      let sp=(pl.carry>0?.3:.46)*(run?1.75:1)*PK.spd();
      const nx=pl.x+dx*sp*dt,nz=pl.z+dz*sp*dt;const h0=Wd.heightAt(pl.x,pl.z),h1=Wd.heightAt(nx,nz);const slope=(h1-h0)/(Math.hypot(nx-pl.x,nz-pl.z)||1e-6);
      const GB=PK.is('gabriel');if(meters(h0)>2500&&!GB)sp*=.82;
      if(GB){if(slope>.6)sp*=1.35;if(WX.block&&S.t-lastWarn>6){lastWarn=S.t;toast(LX('❄ Gabriel laughs at the squall and keeps going 🧗','❄ Gabriel se ríe de la nevazón y sigue 🧗'),false,1800);}}
      else sp*=clamp(1-Math.max(0,slope-.6)*.22,.3,1);if(slope>2.6&&S.t-lastWarn>3){lastWarn=S.t;toast(GB?LX('🐐 Gabriel flies up the scree like a mountain goat!','🐐 ¡Gabriel sube el acarreo como cabra de montaña!'):'🧗 Scrambling up loose scree…',false,1400);}
      const mx=pl.x+dx*sp*dt,mz=pl.z+dz*sp*dt;
      if(offEdge(mx,mz,.2)){startFall(false,dx*sp,dz*sp);return;}
      if(!walkable(mx,mz))warnOnce('Too deep to wade — go around.');
      else if(slope>(PK.is('gabriel')?16:9))warnOnce('Sheer cliff! Find another route.');
      else{const ps=Math.floor(pl.walk/Math.PI);pl.x=mx;pl.z=mz;pl.walk+=dt*sp*38;
        if(Math.floor(pl.walk/Math.PI)!==ps&&!PK.is('estefania')){const E2=Wd.infoAt(pl.x,pl.z),al=meters(Wd.heightAt(pl.x,pl.z));AU.sfx.step(E2.rv.d<.07||E2.dl<.1?'water':al>2560?'snow':E2.dv<5.5?'ash':'gravel');}}
      pl.yaw=angLerp(pl.yaw,Math.atan2(-dz,dx),Math.min(1,dt*10));
      if(ay>.2&&!fpOn()&&S.t-cam.lastDrag>1.5)cam.dragYaw=angLerp(cam.dragYaw,0,dt*.25);
    }
    // auto-deploy a portable kit when arriving at a site far from the truck (shared by nearby sites)
    for(const m of M){if(st(m.c).done)continue;const d=Math.hypot(pl.x-m.ax,pl.z-m.az);
      if(d<1.1&&d>.45&&Math.hypot(truck.x-m.ax,truck.z-m.az)>=1.8&&!kits.some(k=>Math.hypot(k.x-m.ax,k.z-m.az)<2)){addKit(pl.x,pl.z);
        AU.sfx.voice(5,165);AU.sfx.door();toast(`🎒 The truck is far away, so you set up the <b>portable filtration kit</b> here (hand vacuum pump, filter holder, carboys).`,false,4200);save();break;}}
  }
  // hold-to-fill
  ctx=findContext();
  const hf=ctx&&ctx.E&&ctx.E.hold;
  if(hf&&K('KeyE')){pl.fill+=dt/1.6;if(pl.fill>=1&&PK.is('simon')&&Math.random()<.4){pl.fill=0;AU.sfx.tear();AU.sfx.splash();toast(LX('💥 CRACK! Simón banged the jerrycan on a rock and it split open. The water is gone, fill it again.','💥 ¡CRACK! Simón golpeó el bidón contra una piedra y se partió. Se perdió el agua, llénalo de nuevo.'),true,3800);}
  else if(pl.fill>=1){pl.fill=0;pl.carry=10;pl.carrySite=ctx.E.m.c;tada();toast('💧 Jerrycan full: <b>10 L</b>. Carry it to the filtration station (truck tailgate or portable kit).');}}
  else pl.fill=Math.max(0,pl.fill-dt*2);
}
function addKit(x,z){const k={x,z,g:makeKit(),lbl:mkLabel('KIT<small>filtration station</small>','glbl kit')};k.g.position.set(x,Wd.heightAt(x,z),z);Wd.scene.add(k.g);kits.push(k);}
function clearKits(){kits.forEach(k=>{Wd.scene.remove(k.g);k.lbl.remove();});kits.length=0;}

// ------------------------------------------------------------ poses & camera
const v3=new THREE.Vector3();
function updateModels(dt,t){
  // truck
  const fx=Math.cos(truck.yaw),fz=-Math.sin(truck.yaw),L=.13,Wt=.09;
  const hf=Wd.heightAt(truck.x+fx*L,truck.z+fz*L),hb=Wd.heightAt(truck.x-fx*L,truck.z-fz*L);
  const hl=Wd.heightAt(truck.x+fz*Wt,truck.z-fx*Wt),hr=Wd.heightAt(truck.x-fz*Wt,truck.z+fx*Wt);
  truck.g.position.set(truck.x,Math.max(hf,hb,hl,hr,Wd.heightAt(truck.x,truck.z))-.012,truck.z);
  truck.g.rotation.set(Math.atan2(hl-hr,2*Wt),truck.yaw,Math.atan2(hf-hb,2*L));
  truck.wheels.forEach(w=>w.rotation.z-=truck.speed*dt*20);
  // person
  const u=pl.g.userData;pl.g.visible=!pl.inTruck;{const F=fpOn();bodyLayers(F);camLens(F);}
  if(!pl.inTruck){stepJump(dt);pl.g.position.set(pl.x,Wd.heightAt(pl.x,pl.z)+pl.jy,pl.z);pl.g.rotation.y=pl.yaw;
    const w=Math.sin(pl.walk)*(pl.running?.95:.55)*(inputAxes().some(a=>Math.abs(a)>.05)?1:0);pl.g.rotation.z=pl.running?-.18:0;u.legL.rotation.z=w;u.legR.rotation.z=-w;u.armL.rotation.z=-w*.8;u.armR.rotation.z=pl.carry>0?.15:w*.8;
    u.can.visible=pl.carry>0||pl.fill>0;u.probe.visible=!!(ctx&&ctx.Q);(u.anim||[]).forEach(f=>f(t,Math.abs(w)>.01));}
  PK.pose(u,t,dt);
  // beacons
  M.forEach(m=>{const s=st(m.c);const b=m.b.userData;const on=!s.done;const nearFP=fpOn()&&Math.hypot(pl.x-m.ax,pl.z-m.az)<.3;b.beam.visible=on&&!nearFP;b.drop.visible=b.tip.visible=on&&!nearFP;b.ring.visible=!nearFP;b.ring.material.color.set(s.done?'#8ac926':m.col);
    b.drop.position.y=b.tip.position.y-.07;b.tip.position.y=.62+Math.sin(t*2.2+m.ax)*.05;b.mat.opacity=S.target===m?.5:.26;b.beam.scale.set(S.target===m?1.6:1,1,S.target===m?1.6:1);});
}
window.__cfc=()=>({pl,cam,jy:pl.jy,inTruck:pl.inTruck,frozen:PK.freeze(),ctx:!!ctx,E:ctx&&ctx.E?String(ctx.E.t||ctx.E.n||Object.keys(ctx.E)):null,mode,modal:!!modal,fp:fpOn(),exit:()=>exitTruck()});
pl.jy=0;pl.jv=0;pl.land=0;
function doJump(){if(pl.inTruck||PK.freeze()||(WX&&WX.block)||pl.jy>.002)return;pl.jv=.5;try{AU.sfx.step('gravel');}catch(_){}}
function stepJump(dt){if(pl.jy>0||pl.jv>0){pl.jv-=1.6*dt;pl.jy+=pl.jv*dt;if(pl.jy<=0){pl.jy=0;pl.jv=0;pl.land=.18;try{AU.sfx.step('gravel');}catch(_){}}}}
function bodyLayers(on){const g=pl.g;if(!g)return;if(!on&&!cam.vmOn)return;const u=g.userData||{},keep=new Set([u.legL,u.legR,u.armL,u.armR,u.can,u.probe].filter(Boolean));
  // first person: the body stays visible (torso, pack, legs, arms); only head-level parts (head, hair, eyes, hats, lamp) go to a layer the camera does not draw
  const walk=(o,k,y)=>{const kk=k||keep.has(o);const yy=y+(o===g?0:o.position.y);if(o.isMesh||o.isInstancedMesh||o.isSprite||o.isPoints||o.isLine)o.layers.set(on&&!kk&&yy>=.148?1:0);for(const c of o.children)walk(c,kk,yy);};
  walk(g,false,0);if(on&&window.FPG)g.traverse(o=>o.layers.set(1));cam.vmOn=on;  // first person: the 3D hands replace the body (legs looked like shoulders)
  // shorten the torso a bit in first person so its flat top does not cover the ground and boots; it still shows when you look steeply down
  for(const o of g.children){const gm=o.geometry;if(o.isMesh&&gm&&gm.type==='CylinderGeometry'&&Math.abs(gm.parameters.height-.075)<1e-6&&o.position.y===0)o.scale.y=on?.7:1;}}
function fpOn(){return cam.fp&&mode==='play'&&!pl.inTruck&&!cam.map&&!EV.cine&&!fpShow();}
function fpShow(){try{return !pl.inTruck&&!!(PK._ps&&PK._ps.act);}catch(_){return false;}}
function fpFront(){try{return !!PK.freeze();}catch(_){return false;}}  // a character show is playing: watch it in third person
function eyeH(){return .174*((pl.g&&pl.g.scale.y)||1.7);}  // eye height of the current character (was a fixed .172 ≈ child height)
function camLens(fp){const C=Wd.camera,n=fp?.004:.05,f=fp?160:500;if(C.near!==n||C.far!==f){C.near=n;C.far=f;C.updateProjectionMatrix();const U=Wd.postMat.uniforms;U.near.value=n;U.far.value=f;}}
function updateCamera(dt){
  const FP=fpOn();camLens(FP);
  if(((!FP&&!(cam.fp&&fpShow()&&mode==='play'))||modal)&&document.pointerLockElement){cam._autoExit=true;try{document.exitPointerLock();}catch(_){}}
  if(pl.inTruck&&!cam.wasTruck){cam.dragYaw=0;cam.dragPitch=0;}cam.wasTruck=pl.inTruck;
  if(FP){const C=Wd.camera,gy=Wd.heightAt(pl.x,pl.z);
    if(cam.fpY==null||Math.abs(cam.fpY-gy)>.3)cam.fpY=gy;cam.fpY+=(gy-cam.fpY)*Math.min(1,dt*14);
    stepJump(0);const mv=(pl.moveT||0)>0&&pl.jy<.002,bob=mv?Math.sin(pl.walk*2)*.0028*(pl.running?1.5:1):0;
    const yw=cam.yaw+cam.dragYaw,pt=clamp(cam.fpPitch,-1.5,1.5),cp=Math.cos(pt);
    const ex=pl.x-Math.cos(yw)*.02,ey=cam.fpY+pl.jy+eyeH()+bob-(pl.land>0?Math.sin(Math.min(1,pl.land/.18)*Math.PI)*.012:0),ez=pl.z+Math.sin(yw)*.02,fx=Math.cos(yw)*cp,fy=Math.sin(pt),fz=-Math.sin(yw)*cp;
    C.position.set(ex,ey,ez);
    if(EV.shake>0){const sh=EV.shake*.004;C.position.x+=(Math.random()-.5)*sh;C.position.y+=(Math.random()-.5)*sh;C.position.z+=(Math.random()-.5)*sh;}
    C.lookAt(ex+fx,ey+fy,ez+fz);Wd.controls.target.set(ex+fx*1.2,ey+fy*1.2,ez+fz*1.2);
    if(pl.land>0)pl.land=Math.max(0,pl.land-dt);
    pl.g.rotation.y=yw;const u=pl.g.userData;if(u&&u.armL&&u.armR){const sw=Math.sin(pl.walk)*.14*((pl.moveT||0)>0?1:0)*(pl.jy>.002?0:1);const A=cam.armA||2.1;u.armL.rotation.z=A+sw;u.armR.rotation.z=A-sw;}
    return;}
  const C=Wd.camera;const tgt=v3.set(pl.x,(pl.inTruck?truck.g.position.y:pl.g.position.y)+.2,pl.z);
  const chase=pl.inTruck&&!cam.map?clamp(truck.speed/2.5,-.3,1):0;if(chase){tgt.x+=Math.cos(truck.yaw)*.25*chase;tgt.z-=Math.sin(truck.yaw)*.25*chase;}
  if(pl.inTruck)cam.yaw=angLerp(cam.yaw,truck.yaw,Math.min(1,dt*(Math.abs(truck.speed)>.2?3:1)));
  let want;
  if(cam.map){const yw=cam.yaw+cam.dragYaw,fx=Math.cos(yw),fz=-Math.sin(yw),Z=cam.zoom;tgt.x+=fx*3.2*Z;tgt.z+=fz*3.2*Z;want=new THREE.Vector3(tgt.x-fx*8.5*Z,tgt.y+14*Z,tgt.z-fz*8.5*Z);}
  else{cam.show=lerp(cam.show||0,cam.fp&&fpShow()&&fpFront()&&mode==='play'?2.45:0,Math.min(1,dt*2.5));const dist=(pl.inTruck?1.85+.55*Math.max(0,chase):1.25)*cam.zoom*(1+.25*cam.show/2.45),pitch=clamp((pl.inTruck?.38-.1*Math.max(0,chase):.34)+cam.dragPitch+(cam.show>.05?-.12*cam.show/2.45:0),.05,1.35),yw=cam.yaw+cam.dragYaw+cam.show;
    want=new THREE.Vector3(tgt.x-Math.cos(yw)*Math.cos(pitch)*dist,tgt.y+Math.sin(pitch)*dist,tgt.z+Math.sin(yw)*Math.cos(pitch)*dist);
    const gy=Wd.heightAt(want.x,want.z)+.18;if(want.y<gy)want.y=gy;}
  C.position.lerp(want,1-Math.exp(-dt*(cam.map?4:9)));if(EV.shake>0){const sh=EV.shake*.05;C.position.x+=(Math.random()-.5)*sh;C.position.y+=(Math.random()-.5)*sh;C.position.z+=(Math.random()-.5)*sh;}C.lookAt(tgt);Wd.controls.target.copy(tgt);
}

// ------------------------------------------------------------ HUD
function relock(){try{if(cam.hadLock&&cam.fp&&!pl.inTruck&&!document.pointerLockElement){const cv=Wd.renderer.domElement;const r=cv.requestPointerLock&&cv.requestPointerLock();if(r&&r.catch)r.catch(()=>{});}}catch(_){}}
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement)cam.hadLock=true;else if(!cam._autoExit)cam.hadLock=false;cam._autoExit=false;});
function projectLabel(el,x,y,z,show,always){
  if(!show){if(el.style.display!=='none')el.style.display='none';return;}
  v3.set(x,y,z).project(Wd.camera);if(v3.z>1||Math.abs(v3.x)>1.1||Math.abs(v3.y)>1.1){el.style.display='none';return;}
  if(!always&&Wd.losCached&&!Wd.losCached(el,x,y,z)){if(el.style.display!=='none')el.style.display='none';return;}  // hidden behind terrain
  el.style.display='';el.style.transform=`translate(-50%,-100%) translate(${((v3.x*.5+.5)*innerWidth).toFixed(1)}px,${((-v3.y*.5+.5)*innerHeight).toFixed(1)}px)`;
}
// ------------------------------------------------------------ compass (top): heading, sampling target and the truck
let cmpEl=null,nameEl=null;const dirV=new THREE.Vector3();
function compassHUD(){if(!cmpEl){cmpEl=document.createElement('canvas');cmpEl.id='g-cmpx';cmpEl.width=520;cmpEl.height=58;document.body.appendChild(cmpEl);
    nameEl=document.createElement('div');nameEl.id='g-pname';document.body.appendChild(nameEl);}
  const show=mode==='play'&&!document.body.classList.contains('xa-photo');cmpEl.style.display=show?'':'none';nameEl.style.display=show?'':'none';if(!show)return;
  const nm=(charNames&&charNames[charIdx])||'';if(nameEl.textContent!==nm)nameEl.textContent='🧑‍🔬 '+nm;
  const m=$('#g-map');if(m){const r=m.getBoundingClientRect();nameEl.style.left=r.left+'px';nameEl.style.width=r.width+'px';nameEl.style.top=(r.bottom+4)+'px';}
  Wd.camera.getWorldDirection(dirV);const hd=Math.atan2(dirV.x,-dirV.z);const c=cmpEl.getContext('2d'),W=520,H=58,PX=W/(Math.PI*1.1),px0=pl.inTruck?truck.x:pl.x,pz0=pl.inTruck?truck.z:pl.z;
  const rel=a=>{let d=a-hd;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;return d;};
  c.clearRect(0,0,W,H);c.fillStyle='rgba(255,253,245,.92)';c.strokeStyle='#1d1a2b';c.lineWidth=3;c.beginPath();c.roundRect(2,2,W-4,32,9);c.fill();c.stroke();
  c.save();c.beginPath();c.rect(4,4,W-8,28);c.clip();
  for(let dg=0;dg<360;dg+=15){const d=rel(dg*Math.PI/180);if(Math.abs(d)>Math.PI*.58)continue;const x=W/2+d*PX,big=dg%45===0;c.fillStyle='#1d1a2b';c.fillRect(x-1,big?4:4,2,big?9:5);
    if(big){const L=['N','NE','E','SE','S','SW','W','NW'][dg/45];c.font=(dg%90===0?'bold 15px':'bold 11px')+' sans-serif';c.textAlign='center';c.fillStyle=dg===0?'#ff4f3a':'#1d1a2b';c.fillText(L,x,28);}}
  const mark=(x,z,col,txt,emoji)=>{const d=rel(Math.atan2(x-px0,-(z-pz0)));const off=Math.abs(d)>Math.PI*.55;const xx=W/2+clamp(d,-Math.PI*.55,Math.PI*.55)*PX;const km=Math.hypot(x-px0,z-pz0);
    c.restore();c.save();c.globalAlpha=off?.7:1;c.fillStyle=col;c.strokeStyle='#1d1a2b';c.lineWidth=2;c.beginPath();c.moveTo(xx,34);c.lineTo(xx-7,44);c.lineTo(xx+7,44);c.closePath();c.fill();c.stroke();
    c.font='bold 12px sans-serif';c.textAlign='center';const lab=(emoji?emoji+' ':'')+txt+' '+(km<1?Math.round(km*1000)+' m':km.toFixed(1)+' km')+(off?(d<0?' ◀':' ▶'):'');const tw=c.measureText(lab).width+8;
    c.fillStyle='rgba(255,253,245,.95)';c.fillRect(xx-tw/2,44,tw,14);c.fillStyle='#1d1a2b';c.fillText(lab,xx,55);c.restore();c.save();c.beginPath();c.rect(4,4,W-8,28);c.clip();
    c.fillStyle=col;c.beginPath();c.arc(xx,18,6,0,6.283);c.fill();c.lineWidth=2;c.stroke();};
  if(S.target&&!st(S.target.c).done)mark(S.target.ax,S.target.az,S.target.col||'#ffd23f',S.target.c.replace('_','–'),'📍');
  if(!pl.inTruck)mark(truck.x,truck.z,'#9aa3ad',LX('truck','camioneta'),'🛻');
  c.restore();c.fillStyle='#1d1a2b';c.beginPath();c.moveTo(W/2-6,2);c.lineTo(W/2+6,2);c.lineTo(W/2,10);c.fill();}
function updateHUD(){compassHUD();
  const done=M.filter(m=>st(m.c).done).length;
  $('#g-cnt').textContent=`Samples ${done}/${M.length} · 📜 ${eggsFound.length}/${EGGS.length}`;$('#g-score').textContent='Score '+S.score;$('#g-time').textContent='⏱ '+fmtT(S.t);$('#g-wxs').textContent=wxHUD()+quakeHUD();$('#g-wxb').style.display=WX.block&&mode==='play'&&!PK.is('gabriel')?'block':'none';if(WX.block)$('#g-wxb').innerHTML=`❄ SNOW SQUALL — whiteout! No walking or sampling for <b>${Math.ceil(WX.dur-3-WX.t)} s</b>. ${pl.inTruck?'You can drive slowly.':'Stay put or get in the truck.'}`;
  // labels
  M.forEach(m=>{const s=st(m.c);const d=Math.hypot(pl.x-m.ax,pl.z-m.az);
    const html=`${m.c.replace('_','–')}${s.done?' ✔':''}<small>${m.en}${d>3?' · '+d.toFixed(1)+' km':''}</small>`;if(m.lbl._h!==html){m.lbl.innerHTML=html;m.lbl._h=html;}
    m.lbl.className='glbl'+(s.done?' done':'')+(S.target===m?' tg':'');
    projectLabel(m.lbl,m.ax,m.b.position.y+.78,m.az,cam.map||d<2.5||S.target===m,cam.map||S.target===m);  // the selected site shows through everything; others only up close (and in line of sight) or on the map
});
  kits.forEach(k=>projectLabel(k.lbl,k.x,Wd.heightAt(k.x,k.z)+.3,k.z,!cam.map&&Math.hypot(pl.x-k.x,pl.z-k.z)<4));
  const db=Math.hypot(pl.x-base.x,pl.z-base.z);projectLabel(base.lbl,base.x,base.g.position.y+.45,base.z,cam.map||db<2.5||S.target==='base',cam.map||S.target==='base');
  // compass
  let T=S.target;if(!T){T=nearestOpen();}
  if(T){const tx=T==='base'?base.x:T.ax,tz=T==='base'?base.z:T.az;const ang=Math.atan2(-(tz-pl.z),tx-pl.x);const rel=ang-(cam.yaw+cam.dragYaw);
    $('#g-ar').style.transform=`rotate(${(-rel*180/Math.PI).toFixed(0)}deg)`;const d=Math.hypot(tx-pl.x,tz-pl.z);
    $('#g-cmpt').innerHTML=T==='base'?`MEL Field Base · ${d.toFixed(1)} km`:`${S.target?'':'Nearest: '}<b>${T.c.replace('_','–')}</b> ${T.en} · ${d.toFixed(1)} km${T.hike?' · 🥾 hike':''}`;}
  // prompt
  const pr=$('#g-prompt');
  if(ctx&&mode==='play'&&!modal){let h='';if(ctx.E)h+=ctx.E.info?`<span style="opacity:.75">${ctx.E.t}</span>`:`<kbd>E</kbd> ${ctx.E.t}`;if(ctx.Q)h+=`${h?'<br>':''}<kbd>Q</kbd> ${ctx.Q.t}`;if(ctx.hint)h+=`<br><span style="opacity:.7;font-size:.85em"><span>↔ ${LX('Step closer for:','Acércate para:')}</span> <span>${ctx.hint}</span></span>`;
    if(ctx.E&&ctx.E.hold&&pl.fill>0)h+=`<div class="bar"><i style="width:${(pl.fill*100).toFixed(0)}%"></i></div>`;
    if(pr._h!==h){pr.innerHTML=h;pr._h=h;}pr.style.display='block';}else pr.style.display='none';
  // status
  const hh=pl.inTruck?truck.g.position.y:Wd.heightAt(pl.x,pl.z);const E=Wd.infoAt(pl.x,pl.z);
  const cs=S.target&&S.target!=='base'?st(S.target.c):null;
  const sh=`<div class="row2"><b>${pl.inTruck?PK.driveLbl():'🥾 ON FOOT'}</b><span>${Math.round(meters(hh)).toLocaleString('en')} m a.s.l.</span></div>`+
   (pl.inTruck?`<div class="row2"><span>Speed</span><span>${Math.round(Math.abs(truck.speed)*30)} km/h ${roadDist(truck.x,truck.z)<.08?'· Route 26':'· off-road'}</span></div>`:`<div class="row2"><span>Jerrycan</span><span>${pl.carry?'💧 10 L from '+String(pl.carrySite).replace('_','–'):'empty'}</span></div>`)+
   `<div class="row2"><span>Cooler</span><span>❄ ${S.samples.length} sample${S.samples.length===1?'':'s'}</span></div>`+
   (cs?`<div class="row2"><span>${S.target.c} carboy</span><span>${cs.carboy}/${VOL} L ${cs.probe?'🌡️':''}${cs.filt?'⚗️':''}</span></div>`:'')+
   (E&&E.rv.d<.5?`<div class="row2"><span>${Wd.RIVERS[E.rv.ri].n}</span><span>pH ≈ ${E.rv.ph.toFixed(1)}</span></div>`:'');
  const se=$('#g-stat');if(se._h!==sh){se.innerHTML=sh;se._h=sh;}
  PK.hud();
}
function nearestOpen(){let b=null,bd=1e9;M.forEach(m=>{if(st(m.c).done)return;const d=Math.hypot(pl.x-m.ax,pl.z-m.az);if(d<bd){bd=d;b=m;}});return b||'base';}
function nextTarget(){const open=M.filter(m=>!st(m.c).done);if(!open.length){S.target='base';return;}const i=open.indexOf(S.target);S.target=open[(i+1)%open.length];buildMissionList();}
function buildMissionList(){
  const L=$('#g-misl');L.innerHTML='';
  M.forEach(m=>{const s=st(m.c);const d=document.createElement('div');d.className='it'+(s.done?' done':'')+(S.target===m?' tg':'');
    d.innerHTML=`<span class="cd" style="background:${m.col};border:2px solid #1d1a2b;border-radius:5px;padding:0 4px;text-align:center">${m.c.replace('_','–')}</span><span class="nm">${m.en}${m.hike?' 🥾':''}</span><span class="ic"><i class="${s.carboy>=VOL?'ok':''}">💧</i><i class="${s.probe?'ok':''}">🌡️</i><i class="${s.filt?'ok':''}">⚗️</i></span>`;
    d.onclick=()=>{S.target=S.target===m?null:m;buildMissionList();};L.appendChild(d);});
  const b=document.createElement('div');b.className='it'+(S.target==='base'?' tg':'');b.innerHTML=`<span class="cd">🏠</span><span class="nm">MEL Field Base · sequencing</span>`;b.onclick=()=>{S.target=S.target==='base'?null:'base';buildMissionList();};L.appendChild(b);
}

// ------------------------------------------------------------ minimap
let mapBg=null;const MW=440,MH=330,BGK=3,VW=20;   // minimap: 20 km window around the player
function m2b(x,z){return [(x-Wd.X0)/(Wd.X1-Wd.X0)*MW*BGK,(z-Wd.Z0)/(Wd.Z1-Wd.Z0)*MH*BGK];}
function buildMinimapBg(){
  const BW=MW*BGK,BH=MH*BGK;mapBg=document.createElement('canvas');mapBg.width=BW;mapBg.height=BH;const c=mapBg.getContext('2d');const img=c.createImageData(BW,BH);
  const dx=(Wd.X1-Wd.X0)/BW;
  for(let j=0;j<BH;j++)for(let i=0;i<BW;i++){const x=Wd.X0+(i+.5)*dx,z=Wd.Z0+(j+.5)/BH*(Wd.Z1-Wd.Z0);const E=Wd.infoAt(x,z);const h=E.h;let col;
    if(E.dl<0)col=[57,198,192];else if(E.rv.d<.07)col=Wd.phColor(E.rv.ph).map(v=>v*255);
    else{const k=clamp((h-1000)/2000,0,1);col=h>2560?[246,248,255]:E.dv<5.5?[154,147,173]:[lerp(201,120,k),lerp(182,160,k),lerp(121,110,k)];
      const hx=Wd.heightAt(x+.15,z-.15)-Wd.heightAt(x,z);const sh=clamp(1-hx*1.2,.6,1.3);col=col.map(v=>v*sh);}
    const o=(j*BW+i)*4;img.data[o]=col[0];img.data[o+1]=col[1];img.data[o+2]=col[2];img.data[o+3]=255;}
  c.putImageData(img,0,0);c.lineCap='round';
  const path=()=>{c.beginPath();let prev=null;roadPts.forEach(p=>{const q=m2b(p[0],p[1]);if(prev&&Math.hypot(q[0]-prev[0],q[1]-prev[1])<30)c.lineTo(q[0],q[1]);else c.moveTo(q[0],q[1]);prev=q;});};
  path();c.strokeStyle='#1d1a2b';c.lineWidth=7;c.stroke();path();c.strokeStyle='#ffd23f';c.lineWidth=3;c.stroke();
}
function drawMinimap(){
  const cv=$('#g-mapc'),c=cv.getContext('2d');
  const vh=VW*MH/MW;let cx=clamp(pl.x,Wd.X0+VW/2,Wd.X1-VW/2),cz=clamp(pl.z,Wd.Z0+vh/2,Wd.Z1-vh/2);
  const x0=cx-VW/2,z0=cz-vh/2;const s0=m2b(x0,z0),s1=m2b(x0+VW,z0+vh);
  c.imageSmoothingEnabled=true;c.drawImage(mapBg,s0[0],s0[1],s1[0]-s0[0],s1[1]-s0[1],0,0,MW,MH);
  const k=MW/VW;const w2c=(x,z)=>[(x-x0)*k,(z-z0)*k];
  const pin=(x,z,r,fill,lw,sq)=>{let [px,py]=w2c(x,z);const out=px<8||px>MW-8||py<8||py>MH-8;px=clamp(px,8,MW-8);py=clamp(py,8,MH-8);c.globalAlpha=out?.55:1;c.fillStyle=fill;c.strokeStyle='#1d1a2b';c.lineWidth=lw;c.beginPath();if(sq)c.rect(px-r,py-r,2*r,2*r);else c.arc(px,py,r,0,6.3);c.fill();c.stroke();c.globalAlpha=1;};
  pin(base.x,base.z,7,'#ff4f3a',3,true);
  kits.forEach(q=>pin(q.x,q.z,5,'#00bbf9',2,true));
  M.forEach(m=>{const s=st(m.c);pin(m.ax,m.az,S.target===m?9:7,s.done?'#8ac926':m.col,S.target===m?4:2.5);});
  const tq=w2c(truck.x,truck.z);c.save();c.translate(tq[0],tq[1]);c.rotate(-truck.yaw);c.fillStyle='#fff';c.strokeStyle='#1d1a2b';c.lineWidth=2.5;c.fillRect(-9,-5,18,10);c.strokeRect(-9,-5,18,10);c.fillStyle='#ff4f3a';c.fillRect(3,-5,6,10);c.restore();
  if(!pl.inTruck){const q=w2c(pl.x,pl.z);c.save();c.translate(q[0],q[1]);c.rotate(-pl.yaw);c.beginPath();c.moveTo(12,0);c.lineTo(-7,7);c.lineTo(-7,-7);c.closePath();c.fillStyle='#ff9f1c';c.fill();c.lineWidth=2.5;c.stroke();c.restore();}
  c.fillStyle='#1d1a2b';c.font='22px Bangers, Impact';c.fillText('N ▲',MW-46,26);
  c.strokeStyle='#1d1a2b';c.lineWidth=4;c.strokeRect(0,0,MW,MH);
}


// ------------------------------------------------------------ EXPLORER (the original flying map, inside the game)
let prevLayers=null;
function enterExplore(){
  if(mode!=='play'||modal)return;mode='explore';GAME.active=false;document.body.classList.add('explore');
  prevLayers=Object.assign({},Wd.layerOn);Object.assign(Wd.layerOn,{sites:true,landmarks:true,rivers:true,life:true});Wd.applyLayers();
  const y=pl.inTruck?truck.g.position.y:Wd.heightAt(pl.x,pl.z);Wd.controls.target.set(pl.x,y,pl.z);Wd.controls.enabled=true;Wd.controls.update();
  for(const k in keys)keys[k]=false;AUX.pump=AUX.beater=AUX.gurgle=0;
  AU.update(.016,{water:.2,crater:0,vent:0,wind:.15,alt:1600,forest:false,driving:false,speed:0,thr:false,offroad:false,pump:0,beater:0,gurgle:false,rain:0,snow:0,night:0});
}
function exitExplore(){
  if(mode!=='explore')return;document.getElementById('side').classList.remove('open');const ab=document.getElementById('about');if(ab)ab.classList.remove('open');
  Object.assign(Wd.layerOn,{sites:false,meta:false,taxa:false,field:false,photos:false,habitat:false,rivers:true,life:true,landmarks:true});Wd.applyLayers();
  Wd.controls.enabled=false;Wd.controls.autoRotate=false;document.body.classList.remove('explore');GAME.active=true;mode='play';toast('🛻 Back in the field!',false,1500);
}
// ------------------------------------------------------------ LANGUAGE: English / Español (live DOM translation)
let LANG='en';try{LANG=localStorage.getItem('cfc_lang')||'en';}catch(e){}
const I18N={"D": {"!! TURBID": "!! TURBIA", "\"Fill the jerrycan, walk it to your kit, repeat. Twenty litres, no shortcuts!\"": "\"Llena el bidón, llévalo caminando a tu kit y repite. Veinte litros, ¡sin atajos!\"", "\"In the dark ravines north of here people find giant footprints. They say it's the Ucumar.\"": "\"En las quebradas oscuras al norte de aquí la gente encuentra huellas gigantes. Dicen que es el Ucumar.\"", "\"My grandmother warned me about El Cuero, a living cowhide in the lakes. Don't swim in Caviahue at night.\"": "\"Mi abuela me advertía del Cuero, un cuero vivo en los lagos. No te bañes en el Caviahue de noche.\"", "\"The hot springs are Pirepillán, the snow spirit. Copahue loved her, and the mountain took her.\"": "\"Las termas son Pirepillán, el espíritu de la nieve. Copahue la amó, y la montaña se la llevó.\"", "\"Up here we walk. The truck stays below.\"": "\"Aquí arriba se camina. La camioneta se queda abajo.\"", "\"Visit the Pehuenche community west of the crater. The elders tell the stories better than I do.\"": "\"Visita la comunidad pehuenche al oeste del cráter. Los mayores cuentan las historias mejor que yo.\"", "\"When Copahue rumbles, the old ones say Pillán is angry. His lightning split a pehuén near the rim.\"": "\"Cuando el Copahue retumba, los antiguos dicen que Pillán está enojado. Su rayo partió un pehuén cerca del borde.\"", "# & # sampling": "# y # muestreando", "# L collected — go to the filtration station": "# L recolectados — ve a la estación de filtrado", "# and # cycles": "# y # ciclos", "# filtrate": "filtrado de #", "# km/h · Route #": "# km/h · Ruta #", "# km/h · off-road": "# km/h · fuera de camino", "# µm membrane": "membrana de # µm", "# µm membranes": "membranas de # µm", "# µm · free-living fraction": "# µm · fracción de vida libre", "# µm · particle-attached fraction": "# µm · fracción asociada a partículas", "#× # µm + #× # µm on dry ice · +#": "#× # µm + #× # µm en hielo seco · +#", "'s story": "", "(Caviahue): extract DNA, build libraries and sequence on the Illumina.": "(Caviahue): extrae el ADN, prepara las librerías y secuencia en el Illumina.", "(Pihuchao) is a nocturnal monster, half snake, half bird, whose cry terrifies the puesteros. It feeds on blood, of sheep, cattle or unprotected people. That's why herders keep": "(Pihuchao) es un monstruo nocturno, mitad serpiente y mitad ave, cuyo grito aterroriza a los puesteros. Se alimenta de sangre de ovejas, vacas o personas desprotegidas. Por eso los crianceros mantienen", "(free-living cells).": "(células de vida libre).", "(or Jucumari): a giant half-man, half-bear covered in dark reddish hair, said to live in the densest forests and darkest ravines of the cordillera. It walks on two legs, leaves only enormous tracks, and is blamed for carrying off lonely travellers and livestock to its caves.": "(o Jucumari): un gigante mitad hombre, mitad oso, cubierto de pelo oscuro o rojizo, que viviría en los bosques más densos y las quebradas más oscuras de la cordillera. Camina en dos patas, solo deja huellas enormes y se le culpa de llevarse a viajeros solitarios y ganado a sus cuevas.", "(or a wise elder he sent) appeared to young people lost in the forest and taught them to gather the piñones,": "(o un anciano sabio enviado por él) se apareció a unos jóvenes perdidos en el bosque y les enseñó a recolectar los piñones,", "(two # L jerrycan trips) to your station,": "(dos viajes con el bidón de # L) hasta tu estación,", "*SPLASH* Keep sampling, we keep bathing!": "*¡SPLASH!* ¡Sigan muestreando, nosotros seguimos bañándonos!", "+ membrane sets) in the cooler.": "+ juegos de membranas) en el cooler.", "+# outreach": "+# divulgación", ", a creature shaped exactly like a stretched cowhide. Its edges are full of sharp claws, and at its corners it has dark eyes that shine like a snail's. It waits quietly at the shore until an animal or a person comes to drink or swim. Then it wraps them, drags them to the bottom, and only the dry skin floats back up.": ", una criatura con la forma exacta de un cuero de vaca estirado. Sus bordes están llenos de garras filosas y en las esquinas tiene ojos oscuros que brillan como los de un caracol. Espera tranquila en la orilla hasta que un animal o una persona se acerca a beber o nadar. Entonces lo envuelve, lo arrastra al fondo y solo el cuero seco vuelve a flotar.", ", a flying serpent, half bird, that drinks the blood of sheep, cattle, and careless people. You follow it by the drops of blood it leaves. That is why every herder keeps": ", una serpiente voladora, mitad ave, que bebe la sangre de ovejas, vacas y personas descuidadas. Se le sigue por las gotas de sangre que deja. Por eso todo criancero mantiene", ", a giant, half man and half bear, covered in dark or reddish hair. It walks on two legs, and all it leaves are huge footprints in the mud or the snow. It is shy, but they say it sometimes carries off animals, or people who walk alone, to its caves deep in the hills. So when you sample in the forest, go together!": ", un gigante mitad hombre y mitad oso, cubierto de pelo oscuro o rojizo. Camina en dos patas y solo deja huellas enormes en el barro o la nieve. Es esquivo, pero dicen que a veces se lleva animales, o personas que andan solas, a sus cuevas en lo profundo de los cerros. Así que cuando muestreen en el bosque, ¡vayan juntos!", ", about as acidic as lemon juice. It can irritate your skin and eyes!": ", casi tan ácida como el jugo de limón. ¡Puede irritarte la piel y los ojos!", ", an ancestral spirit of thunder, lightning, earthquakes and eruptions. When Copahue roars and throws ash and sulfur, it means Pillán is angry, or the spirits of the earth are fighting great battles below. His weapons are the lightning bolts that split the ancient trees. That is why we treat the mountain with respect.": ", un espíritu ancestral del trueno, el rayo, los terremotos y las erupciones. Cuando el Copahue ruge y lanza ceniza y azufre, es que Pillán está enojado, o que los espíritus de la tierra libran grandes batallas allá abajo. Sus armas son los rayos que parten los árboles antiguos. Por eso tratamos a la montaña con respeto.", ", an ancestral spirit of thunder, lightning, earthquakes and eruptions. When Copahue roars and throws ash and sulfur, it means Pillán is angry, or the spirits of the earth are fighting great battles below. His weapons are the lightning bolts that split the ancient trees. That is why we treat the mountain with respect.”": ", un espíritu ancestral del trueno, el rayo, los terremotos y las erupciones. Cuando el Copahue ruge y lanza ceniza y azufre, es que Pillán está enojado, o que los espíritus de la tierra libran grandes batallas allá abajo. Sus armas son los rayos que parten los árboles antiguos. Por eso tratamos a la montaña con respeto.”", ", and Copahue's rage still smokes inside the volcano.": ", y la furia de Copahue todavía humea dentro del volcán.", ", empty the flask": ", vacía el matraz", ", keep it in the green depth band until readings stabilise, then": ", mantenla en la franja verde de profundidad hasta que las lecturas se estabilicen y luego", ", or a wise old man he sent, appeared to some young people lost in the forest and taught them to gather the piñones,": ", o un anciano sabio enviado por él, se apareció a unos jóvenes perdidos en el bosque y les enseñó a recolectar los piñones,", ", the great ancestral spirit of thunder, lightning, earthquakes and eruptions. When Copahue roars and spits ash and sulfur, the old people said Pillán was angry, or that the spirits of the earth were fighting deep below. Lightning is his weapon against the ancient trees.": ", el gran espíritu ancestral del trueno, el rayo, los terremotos y las erupciones. Cuando el Copahue ruge y escupe ceniza y azufre, los antiguos decían que Pillán estaba enojado, o que los espíritus de la tierra peleaban en las profundidades. El rayo es su arma contra los árboles antiguos.", ", the spirit of the snow who lived on the heights. The mighty cacique": ", el espíritu de la nieve que vivía en las alturas. El poderoso cacique", ", the spirit of the snow, whose home was high on the mountain. He climbed to find her, facing dangers and beasts, and they loved each other for a long time. But the gods, or an enemy tribe, punished them and unleashed the fury of the mountain. Pirepillán's body became the": ", el espíritu de la nieve, cuya morada estaba en lo alto de la montaña. Subió a buscarla enfrentando peligros y bestias, y se amaron por mucho tiempo. Pero los dioses, o una tribu enemiga, los castigaron y desataron la furia de la montaña. El cuerpo de Pirepillán se convirtió en las", ". # L through # µm, then the filtrate through # µm.": ". # L por # µm, y luego el filtrado por # µm.", ". Carry it to the filtration station (truck tailgate or portable kit).": ". Llévalo a la estación de filtrado (pickup de la camioneta o kit portátil).", ". He fell in love with": ". Se enamoró de", ". Hold the button and release in the green zone: too short leaves tough cells (Gram-positives, archaea) intact, too long shears the DNA.": ". Mantén el botón y suéltalo en la zona verde: muy poco deja intactas las células resistentes (Gram positivas, arqueas) y demasiado fragmenta el ADN.", ". Real run: ~# days. Here: time-lapse.": ". Corrida real: ~# días. Aquí: en cámara rápida.", ". Since then the tree is sacred, and it gave its name to the people:": ". Desde entonces el árbol es sagrado y le dio nombre al pueblo:", ". Stay put or get in the truck.": ". Quédate quieto o súbete a la camioneta.", ". There lives": ". Allí vive", ". They lived. Since then the pehuén is sacred, and we are the": ". Sobrevivieron. Desde entonces el pehuén es sagrado, y nosotros somos los", ". Too many cycles → PCR duplicates and bias.": ". Demasiados ciclos → duplicados de PCR y sesgo.", ": first a": ": primero una", ": hold": ": mantén", ": lower the probe with": ": baja la sonda con", ": stop the thermocycler between": ": detén el termociclador entre", "= DNA extraction + library quality.": "= calidad de extracción de ADN + librerías.", "= filtration quality (torn membranes and slow filtering lower it) ·": "= calidad del filtrado (membranas rotas y filtrado lento la bajan) ·", "= how fast you got stable readings ·": "= qué tan rápido lograste lecturas estables ·", "= points from sampling, probe, filtration and the lab.": "= puntos por muestreo, sonda, filtrado y laboratorio.", "A Tiny World sampling game · Caviahue–Copahue volcanic system, Neuquén, Argentina": "Un juego de muestreo Tiny World · sistema volcánico Caviahue–Copahue, Neuquén, Argentina", "A creature shaped exactly like a stretched cowhide, floating at the edge of Lake Caviahue. Its rim is lined with sharp claws, and eyes on stalks glow at its corners. Legend says it waits for anyone who comes to drink or swim, wraps them up and drags them to the bottom.": "Una criatura con la forma exacta de un cuero de vaca estirado, flotando en la orilla del Lago Caviahue. Su borde está lleno de garras filosas y en las esquinas le brillan ojos sobre tentáculos. La leyenda dice que espera a quien venga a beber o nadar, lo envuelve y lo arrastra al fondo.", "A giant, ancient pehuén with a small fire roasting piñones.": "Un pehuén gigante y antiguo con un fueguito tostando piñones.", "A legend of the Caviahue–Copahue region, as told locally. Each storyteller knows": "Una leyenda de la zona Caviahue–Copahue, tal como se cuenta localmente. Cada narrador sabe", "A legend of the Caviahue–Copahue region, as told locally. Each storyteller knows # stories; talk to them again to hear the next one.": "Una leyenda de la zona Caviahue–Copahue, tal como se cuenta localmente. Cada narrador sabe # historias; vuelve a hablarle para escuchar la siguiente.", "A pehuén split in two and still smouldering.": "Un pehuén partido en dos y todavía humeante.", "A shimmering figure made of snow, floating above the steaming ground.": "Una figura brillante hecha de nieve, flotando sobre el suelo humeante.", "A winged serpent circling the corral… but it won't come close.": "Una serpiente alada dando vueltas sobre el corral… pero no se acerca.", "Above all spirits of this land stands": "Por sobre todos los espíritus de esta tierra está", "Acidic?! Nonsense! My grandma swam here every summer and lived to #!": "¿¡Ácida?! ¡Tonteras! ¡Mi abuela se bañaba aquí cada verano y vivió hasta los #!", "Agrio Spring # (Vertiente del Agrio)": "Vertiente del Agrio #", "At every site:": "En cada sitio:", "At least keep your eyes shut underwater… and rinse off with fresh water afterwards!": "Al menos cierren los ojos bajo el agua… ¡y enjuáguense con agua dulce después!", "At night, listen: if you hear a terrible cry, it may be the": "De noche, escucha: si oyes un grito terrible, puede ser el", "At the beacon": "En la baliza", "At the beacon press": "En la baliza presiona", "At the station press": "En la estación presiona", "Back at the": "De vuelta en la", "Backwards baseball cap": "Jockey al revés", "Ballet tutu": "Tutú de ballet", "Base called": "Base leída", "Beanie with a giant pompom": "Gorro con pompón gigante", "Best Copahue field campaigns · shared by everyone who plays · updates live": "Mejores campañas en Copahue · compartido por todos los que juegan · se actualiza en vivo", "Bunny ears": "Orejas de conejo", "Bunny slippers": "Pantuflas de conejo", "CHOOSE YOUR SCIENTIST": "ELIGE TU CIENTÍFICO", "COPAHUE FIELD CAMPAIGN": "CAMPAÑA DE TERRENO COPAHUE", "Carboy": "Bidón", "Carboy #:": "Bidón #:", "Caviahue · −# °C freezer, dry shipper & courier": "Caviahue · freezer de −# °C, dry shipper y courier", "Chef hat": "Gorro de chef", "Chemistry": "Química", "Come in, the water's great! pH is just a number!": "¡Métanse, el agua está buenísima! ¡El pH es solo un número!", "Conductivity": "Conductividad", "Cooler": "Cooler", "Could not save (you may only have view access). Try again later.": "No se pudo guardar (quizás solo tienes acceso de lectura). Intenta más tarde.", "Cowboy hat": "Sombrero vaquero", "Crater Lake": "Laguna del Cráter", "Culebra Waterfall": "Cascada de la Culebra", "Cut the membranes into bead tubes and lyse the cells by": "Corta las membranas en tubos con perlas y lisa las células con", "Cycle": "Ciclo", "DIFFERENTIAL VACUUM FILTRATION": "FILTRACIÓN DIFERENCIAL AL VACÍO", "DNA extraction": "Extracción de ADN", "DNA per sample (# + # µm fractions pooled per site for this run). Libraries need ≥ # ng of input.": "ADN por muestra (fracciones de # + # µm juntadas por sitio en esta corrida). Las librerías necesitan ≥ # ng de entrada.", "DNA yields are simulated from your lysis and filtration performance.": "Los rendimientos de ADN se simulan según tu lisis y tu filtrado.", "Date": "Fecha", "Day": "Día", "Differential filtration:": "Filtración diferencial:", "Dissolved O₂": "O₂ disuelto", "Diving flippers": "Aletas de buceo", "Drive": "Maneja", "E · ACT": "E · ACCIÓN", "Each cluster is thousands of copies of one DNA fragment. Every cycle adds one fluorescent base:": "Cada cluster son miles de copias de un fragmento de ADN. Cada ciclo agrega una base fluorescente:", "El Cuero (Coo / Ñictatall), \"the hide\".": "El Cuero (Coo / Ñictatall).", "El Cuero of the lakes": "El Cuero de los lagos", "Enormous bow tie": "Humita gigante", "Excuse me! This water is": "¡Disculpen! Esta agua tiene", "Extraction efficiency": "Eficiencia de extracción", "FIELD NOTEBOOK": "LIBRETA DE CAMPO", "FILTERED!": "¡FILTRADO!", "FILTERS": "FILTROS", "FLASK FULL — EMPTY IT (F)": "MATRAZ LLENO — VACÍALO (F)", "Filtered": "Filtrado", "Filtr.": "Filtr.", "Flower crown": "Corona de flores", "Fluorometric DNA quantification": "Cuantificación fluorométrica de ADN", "Forty years bathing here. Who are you, the water police?": "Cuarenta años bañándonos aquí. ¿Y tú quién eres, la policía del agua?", "Fresh water is for tourists.": "El agua dulce es para los turistas.", "Freshwater control": "Control de agua dulce", "Get in the truck": "Subir a la camioneta", "Get out of the truck": "Bajar de la camioneta", "Giant neon shades": "Lentes neón gigantes", "Go take your little bottles somewhere else, we were here first!": "¡Vayan a llevarse sus botellitas a otro lado, nosotros llegamos primero!", "HOW TO SAMPLE": "CÓMO MUESTREAR", "Hawaiian flower lei": "Collar hawaiano", "Hear this legend again": "Escuchar esta leyenda otra vez", "Heart sunglasses": "Lentes de corazón", "Hold to fill the # L jerrycan at": "Mantén para llenar el bidón de # L en", "Hold to fill the # L jerrycan at # (#/# L)": "Mantén para llenar el bidón de # L en # (#/# L)", "Huge footprints in the mud… and something big behind the trees.": "Huellas enormes en el barro… y algo grande detrás de los árboles.", "I'm going to report YOU to the tourism office!": "¡Te voy a acusar a TI a la oficina de turismo!", "IN AIR": "EN EL AIRE", "Illumina DNA Prep · tagmentation + unique dual indexes": "Illumina DNA Prep · tagmentación + índices duales únicos", "Illumina NovaSeq · shotgun metagenomics · # × # bp paired-end": "Illumina NovaSeq · metagenómica shotgun · # × # pb paired-end", "Illumina shotgun metagenome sequencing": "secuenciación de metagenomas shotgun en Illumina", "In the thickest forests and darkest ravines lives the": "En los bosques más espesos y las quebradas más oscuras vive el", "Inflatable duck ring": "Salvavidas de pato", "Iron is good for you! I'm absorbing vitamins!": "¡El hierro hace bien! ¡Estoy absorbiendo vitaminas!", "It's MEDICINAL! The volcano cures everything, everybody knows that!": "¡Es MEDICINAL! El volcán lo cura todo, ¡todo el mundo lo sabe!", "Jara–Agrio confluence": "Unión Jara–Agrio", "Jerrycan": "Bidón", "Jerrycan full — carry it to the filtration station": "Bidón lleno — llévalo a la estación de filtrado", "KEEP EXPLORING ➜": "SEGUIR EXPLORANDO ➜", "KEEP GOING ➜": "SEGUIR ➜", "Keep the sensor tip in the green band (#–# cm): fully submerged but off the sediment. Stirring up the bottom ruins the turbidity and resets stabilisation.": "Mantén la punta del sensor en la franja verde (#–# cm): totalmente sumergida pero sin tocar el sedimento. Revolver el fondo arruina la turbidez y reinicia la estabilización.", "L — fetch water at the beacon": "L — trae agua desde la baliza", "LEGEND": "LEYENDA", "LEGEND FOUND!": "¡LEYENDA ENCONTRADA!", "LOAD THE SEQUENCER ➜": "CARGAR EL SECUENCIADOR ➜", "Lake Caviahue": "Lago Caviahue", "Lake Caviahue, north arm": "Lago Caviahue, brazo norte", "Legends of Caviahue–Copahue · as told in the region": "Leyendas de Caviahue–Copahue · tal como se cuentan en la zona", "Lemon juice? Then it's basically a salad. Healthy!": "¿Jugo de limón? Entonces es casi una ensalada. ¡Sano!", "Libraries pooled equimolarly and loaded on the flow cell.": "Librerías juntadas en cantidades equimolares y cargadas en la flow cell.", "Library prep": "Preparación de librerías", "Listen to": "Escuchar a", "Listen to Machi Ayelén's story": "Escuchar la historia de la Machi Ayelén", "Loading the lab ranking…": "Cargando el ranking del laboratorio…", "Long ago there was a powerful and feared cacique called": "Hace mucho tiempo existía un cacique poderoso y temido llamado", "Lower Río Agrio": "Río Agrio Inferior", "Lower Río Agrio # (Gendarmería bridge)": "Río Agrio Inferior # (puente de Gendarmería)", "M read pairs · lab bonus +": "M pares de lecturas · bono de laboratorio +", "MAÑUM (THANK YOU) ➜": "MAÑUM (GRACIAS) ➜", "MEL FIELD BASE": "BASE DE TERRENO MEL", "MEL Field Base": "Base de terreno MEL", "MEL Field Base ·": "Base de terreno MEL ·", "MEL Field Base · sequencing": "Base de terreno MEL · secuenciación", "MEMBRANE CLOGGED — SWAP (R)": "MEMBRANA TAPADA — CÁMBIALA (R)", "METAGENOME REPORT": "REPORTE DE METAGENOMAS", "MISSION": "MISIÓN", "MULTIPARAMETER PROBE": "SONDA MULTIPARAMÉTRICA", "Machi Ayelén · machi (healer) · Pehuenche community": "Machi Ayelén · machi (sanadora) · comunidad pehuenche", "Maybe that's the real reason to stay out of the water…": "Quizás esa es la verdadera razón para no meterse al agua…", "Measure": "Medir", "Measure # with the multiparameter probe": "Medir # con la sonda multiparamétrica", "Membrane clogging": "Colmatación de la membrana", "Membranes used": "Membranas usadas", "Membranes → DNA → libraries → reads": "Membranas → ADN → librerías → lecturas", "My eyes only sting for the first hour, then you stop feeling them!": "¡Los ojos solo arden la primera hora, después ya no los sientes!", "My rash went away! …well, it changed colour, but that counts.": "¡Se me quitó el sarpullido! …bueno, cambió de color, pero cuenta.", "NEXT STORY": "SIGUIENTE HISTORIA", "NEXT ➜": "SIGUIENTE ➜", "NOT YET": "TODAVÍA NO", "Nearest:": "Más cercano:", "Nehuen (\"strength\" in Mapudungun) leans his whole giant body on you. You almost fall over.": "Nehuen (\"fuerza\" en mapudungun) se apoya con todo su cuerpo gigante en ti. Casi te caes.", "Nehuen gives you a very wet kiss and brings you a stick the size of a pehuén branch.": "Nehuen te da un beso muy mojado y te trae un palo del tamaño de una rama de pehuén.", "Nehuen rolls over for belly rubs. His tail is a blur.": "Nehuen se da vuelta para que le rasquen la guata. Su cola se mueve a mil.", "Nehuen sits politely, offers his paw, and gets a second belly rub. He knows the rules.": "Nehuen se sienta educado, da la pata y consigue otra rascada de guata. Se sabe las reglas.", "Nehuen sniffs your jerrycan, approves, and wags so hard his back legs dance.": "Nehuen olfatea tu bidón, lo aprueba y mueve la cola tan fuerte que le bailan las patas traseras.", "Neon fanny pack": "Banano neón", "Never swim alone in the cold lakes, like": "Nunca nades solo en los lagos fríos, como el", "New": "Nueva", "New # µm membrane placed with sterile forceps; the used one goes into a labelled cryovial.": "Nueva membrana de # µm puesta con pinzas estériles; la usada va a un criotubo rotulado.", "Next: pick another site from the mission list.": "Siguiente: elige otro sitio de la lista de misiones.", "No campaigns yet — be the first on the board!": "Todavía no hay campañas: ¡sé el primero en el ranking!", "North of Loncopué (freshwater control)": "Norte de Loncopué (control de agua dulce)", "Now the": "Ahora el", "OK… I'll just write this down in the field notebook.": "Ok… lo voy a anotar en la libreta de campo.", "Our grandparents' grandparents thought the": "Los abuelos de nuestros abuelos creían que los", "PEHUENCHE COMMUNITY": "COMUNIDAD PEHUENCHE", "PILLÁN, THE FORCE OF THE VOLCANO": "PILLÁN, LA FUERZA DEL VOLCÁN", "PUMP": "BOMBA", "Party cone hat": "Gorro de fiesta", "Pehuenche, \"people of the pehuén\"": "pehuenche, \"gente del pehuén\"", "Pehuenche, the people of the pehuén": "pehuenche, la gente del pehuén", "Pet Nehuen 🐾": "Acariciar a Nehuen 🐾", "Pillán, the force of the volcano": "Pillán, la fuerza del volcán", "Pirate hat & eyepatch": "Sombrero pirata y parche", "Pour # L into the": "Vierte # L en el", "Pour # L into the # carboy (#/# L)": "Vierte # L en el bidón de # (#/# L)", "Pour the water into the carboy first!": "¡Primero vierte el agua en el bidón!", "Probe": "Sonda", "Propeller beanie": "Gorro con hélice", "Put THAT in your metagenome!": "¡Pon ESO en tu metagenoma!", "Q · PROBE": "Q · SONDA", "R# (forward)": "R# (directa)", "R# (reverse)": "R# (reversa)", "RECORD": "REGISTRAR", "RECORDED!": "¡REGISTRADO!", "Read": "Lectura", "Read pairs (real)": "Pares de lecturas (reales)", "Readings are the lab's real values for this site (Cascada de la Culebra, #-#-#).": "Las lecturas son los valores reales del laboratorio para este sitio (Cascada de la Culebra, #-#-#).", "Reindeer antlers": "Cuernos de reno", "Rinse? The river IS the rinse.": "¿Enjuagarse? El río ES el enjuague.", "Royal crown": "Corona real", "Rubber chicken": "Pollo de goma", "Ruptures": "Roturas", "Río Jara (freshwater)": "Río Jara (agua dulce)", "SAMPLE SECURED!": "¡MUESTRA ASEGURADA!", "SEDIMENT": "SEDIMENTO", "SEQUENCING LAB": "LABORATORIO DE SECUENCIACIÓN", "SETTLING…": "ESTABILIZANDO…", "SONDE ·": "SONDA ·", "SONDE · #": "SONDA · #", "SPLASH": "SPLASH", "STABLE": "ESTABLE", "STABLE ✔": "ESTABLE ✔", "SWITCH SCIENTIST": "CAMBIAR DE CIENTÍFICO", "Salinity": "Salinidad", "Salto del Agrio, above the falls": "Salto del Agrio, sobre el salto", "Salto del Agrio, plunge pool": "Salto del Agrio, pozón", "Samples": "Muestras", "Samples #/#": "Muestras #/#", "Samples #/# · 📜 #/#": "Muestras #/# · 📜 #/#", "Scientist": "Científico", "Scientists! Always ruining the fun. Take THIS! *SPLASH*": "¡Científicos! Siempre arruinando la diversión. ¡Toma ESTO! *SPLASH*", "Score": "Puntaje", "Score #": "Puntaje #", "Seq.": "Sec.", "Sequenced in your run! This site has no metagenome in the lab's # dataset, so here are its probe readings instead: pH": "¡Secuenciado en tu corrida! Este sitio no tiene metagenoma en el set de datos # del laboratorio, así que aquí van sus lecturas de sonda: pH", "Seriously, it's loaded with sulfuric acid, iron and aluminium from the volcano. Please get out!": "En serio, está cargada de ácido sulfúrico, hierro y aluminio del volcán. ¡Por favor salgan!", "Shannon diversity": "Diversidad de Shannon", "Sheer cliff! Find another route.": "¡Acantilado! Busca otra ruta.", "Ship samples to sequencing": "Enviar muestras a secuenciar", "Sites": "Sitios", "Snorkel mask": "Máscara de snorkel", "Something mysterious": "Algo misterioso", "Speed": "Velocidad", "Springs / crater": "Vertientes / cráter", "Stabilisation": "Estabilización", "Stage": "Etapa", "Start differential vacuum filtration (": "Iniciar filtración diferencial al vacío (", "Start differential vacuum filtration (#)": "Iniciar filtración diferencial al vacío (#)", "Sulfuric what? It just tingles a bit, that's how you know it's working!": "¿Sulfúrico qué? Solo pica un poquito, ¡así sabes que está funcionando!", "Super-long striped scarf": "Bufanda a rayas superlarga", "Superhero cape": "Capa de superhéroe", "Swim kit (board shorts, floaties & flippers)": "Kit de playa (traje de baño, flotadores y aletas)", "THE FIRST PIÑONES": "LOS PRIMEROS PIÑONES", "THE ORIGIN OF COPAHUE AND THE HOT SPRINGS": "EL ORIGEN DEL COPAHUE Y LAS TERMAS", "THE UCUMAR": "EL UCUMAR", "TOO DEEP": "MUY HONDO", "TOO MUCH VACUUM!": "¡DEMASIADO VACÍO!", "TOO SHALLOW": "MUY SUPERFICIAL", "TORN MEMBRANE — SWAP (R)": "MEMBRANA ROTA — CÁMBIALA (R)", "Tagmentation:": "Tagmentación:", "Talk to Caniche, the volcano guide": "Hablar con Caniche, el guía del volcán", "Taxonomy (% of reads, top # genera), read counts, Shannon diversity and MAG bins are the lab's real # shotgun metagenomes. Notice how": "La taxonomía (% de lecturas, top # géneros), las lecturas, la diversidad de Shannon y los MAGs son los metagenomas shotgun reales # del laboratorio. Fíjate cómo", "Tell Acidithiobacillus we said hi! *SPLASH*": "¡Salúdame a Acidithiobacillus! *SPLASH*", "Temperature": "Temperatura", "Terrain, rivers, sites, probe readings (Metadata.xlsx) and metagenome results (# campaign, thesis data) are real; the mini-game mechanics and DNA yields are simulated.": "El terreno, los ríos, los sitios, las lecturas de sonda (Metadata.xlsx) y los metagenomas (campaña #, datos de tesis) son reales; las mecánicas de los minijuegos y los rendimientos de ADN son simulados.", "That is the edge of the map!": "¡Ese es el borde del mapa!", "The": "El", "The Microbial Ecophysiology Lab team · click a card to play · tap a name to rename it": "El equipo del Microbial Ecophysiology Lab · haz clic en una tarjeta para jugar · toca un nombre para cambiarlo", "The Pehuenche once believed the seeds of the araucaria were poisonous. In a brutal winter, when snow covered everything and people were starving,": "Los pehuenches creían que las semillas de la araucaria eran venenosas. En un invierno brutal, cuando la nieve lo cubría todo y la gente moría de hambre,", "The Pehuenche storytellers would be proud.": "Los narradores pehuenches estarían orgullosos.", "The Pihuchén and the billy goats": "El Pihuchén y los chivos", "The Ucumar of the ravines": "El Ucumar de las quebradas", "The board is full — ask the owner to clear old entries.": "El ranking está lleno — pídele a la dueña que borre entradas antiguas.", "The gift of the pehuén": "El regalo del pehuén", "The origin of Copahue and the hot springs": "El origen del Copahue y las termas", "The ranking is unavailable right now.": "El ranking no está disponible ahora.", "Your best runs, saved in this browser:": "Tus mejores partidas, guardadas en este navegador:", "The truck can't climb the volcano's loose ash:": "La camioneta no puede subir por la ceniza suelta del volcán:", "The work of": "Obra de", "This membrane is still fine — swap only when it clogs.": "Esta membrana todavía está bien — cámbiala solo cuando se tape.", "This station is too far from where you filled the jerrycan": "Esta estación está muy lejos de donde llenaste el bidón", "Time": "Tiempo", "Too deep to wade — go around.": "Muy hondo para cruzar — rodéalo.", "Too steep and loose for the truck up here. Get out": "Muy empinado y suelto para la camioneta. Bájate", "Too steep! Try a gentler line (or walk).": "¡Muy empinado! Prueba una ruta más suave (o camina).", "Top hat with a flower": "Sombrero de copa con flor", "Trucks don't float — find another way around the lake.": "Las camionetas no flotan — busca otra forma de rodear el lago.", "Turbidity": "Turbidez", "Upper Río Agrio": "Río Agrio Superior", "Upper Río Agrio #": "Río Agrio Superior #", "Viking helmet": "Casco vikingo", "Warn the bathers: this water is pH": "Advertir a los bañistas: esta agua tiene pH", "Warn the bathers: this water is pH #!": "Advertir a los bañistas: ¡esta agua tiene pH #!", "YOU:": "TÚ:", "You can switch anytime with the 👤 button or": "Puedes cambiar cuando quieras con el botón 👤 o", "You found ALL the legends of Caviahue–Copahue!": "¡Encontraste TODAS las leyendas de Caviahue–Copahue!", "You have": "Tienes", "Your cooler is empty — collect at least one complete sample first.": "Tu cooler está vacío — primero junta al menos una muestra completa.", "Your mission:": "Tu misión:", "Your quality: filtration": "Tu calidad: filtrado", "and hike!": "¡y camina!", "and wait for stable readings, then run": "y espera lecturas estables, luego haz la", "bead-linked transposomes fragment the DNA and add adapters in one step.": "transposomas unidos a perlas fragmentan el ADN y agregan adaptadores en un solo paso.", "billy goats": "chivos", "building vacuum…": "generando vacío…", "campaign time": "tiempo de campaña", "carboy (": "bidón (", "climbed the mountain for her love, facing dangers and beasts. The gods (or an enemy tribe) punished their romance and unleashed the mountain's fury: Pirepillán's body became the": "subió la montaña por su amor, enfrentando peligros y bestias. Los dioses (o una tribu enemiga) castigaron el romance y desataron la furia de la montaña: el cuerpo de Pirepillán se convirtió en las", "close to a beacon. Park and press": "cerca de una baliza. Estaciona y presiona", "complete sample": "muestra completa", "complete samples (#+ membrane sets) in the cooler.": "muestras completas (#+ juegos de membranas) en el cooler.", "differential vacuum filtration": "filtración diferencial al vacío", "dip the multiparameter probe": "mete la sonda multiparamétrica", "dominates the acidic springs and upper river,": "domina las vertientes ácidas y el río alto,", "drag to look around · wheel to zoom": "arrastra para mirar · rueda para zoom", "drive / walk (arrows work too)": "manejar / caminar (también flechas)", "drive the lab's pickup along Route # to the real sampling sites of the Microbial Ecophysiology Lab, from the hyper-acidic": "maneja la camioneta del laboratorio por la Ruta # hasta los sitios de muestreo reales del Microbial Ecophysiology Lab, desde la hiperácida", "empty": "vacío", "filtration station": "estación de filtrado", "final score": "puntaje final", "flat membrane (particle-attached cells), then the filtrate through": "membrana plana (células asociadas a partículas), y luego el filtrado por", "flow dropping — swap soon (R)": "el flujo baja — cambia pronto (R)", "flying info map (🗺️) ·": "mapa volador con info (🗺️) ·", "free-living fraction": "fracción de vida libre", "healing hot springs": "termas curativas", "healing waters": "aguas curativas", "here (hand vacuum pump, filter holder, carboys).": "aquí (bomba de vacío manual, portafiltro, bidones).", "hike": "a pie", "hold": "mantén", "honk": "bocina", "i#/i# index pair": "par de índices i#/i#", "in Caviahue and send everything for": "en Caviahue y envía todo a", "index PCR": "PCR de índices", "interact · hold to fill the jerrycan": "interactuar · mantén para llenar el bidón", "jog (not while carrying water)": "trotar (no con el bidón lleno)", "legend again": "leyenda otra vez", "list (or follow the arrow). Hike sites 🥾 are on the volcano.": "(o sigue la flecha). Los sitios a pie 🥾 están en el volcán.", "listen to the elders' stories": "escucha las historias de los mayores", "lonko (elder)": "lonko (autoridad)", "lonko (elder) · stories": "lonko (autoridad) · historias", "love it, though.": "la adoran, eso sí.", "machi (healer)": "machi (sanadora)", "machi (healer) · stories": "machi (sanadora) · historias", "map view ·": "vista de mapa ·", "marks the freshwater controls.": "marca los controles de agua dulce.", "mission list": "lista de misiones", "multiparameter probe": "sonda multiparamétrica", "next target ·": "siguiente objetivo ·", "of Copahue volcano down the": "del volcán Copahue, bajando por el", "of the pehuén were poison. Then came a winter without end: snow covered everything and the people were dying of hunger.": "del pehuén eran veneno. Entonces llegó un invierno sin fin: la nieve lo cubría todo y la gente moría de hambre.", "of the termas, and Copahue's cries and rage live forever in the": "de las termas, y los gritos y la furia de Copahue viven para siempre en el", "pH ≈": "pH ≈", "particle-attached fraction": "fracción asociada a partículas", "portable filtration kit": "kit portátil de filtrado", "probe data logged · +": "datos de sonda registrados · +", "probe data logged · +#": "datos de sonda registrados · +#", "pump / lower probe in the mini-games": "bombear / bajar la sonda en los minijuegos", "raw sample": "muestra cruda", "receiver #/# L": "receptor #/# L", "ship samples to sequencing": "enviar muestras a secuenciar", "site is still unsampled — once you ship, the campaign ends.": "sitio todavía sin muestrear — si envías ahora, la campaña termina.", "sites sampled": "sitios muestreados", "sites ·": "sitios ·", "smoking heart of the volcano": "corazón humeante del volcán", "sound: music + SFX / SFX only / off ·": "sonido: música + efectos / solo efectos / apagado ·", "stage.": ".", "switch scientist (or the 👤 button)": "cambiar de científico (o el botón 👤)", "take over in the lake and lower river, and": "dominan en el lago y el río bajo, y", "the whole # L goes through a # µm membrane first; it traps cells attached to particles and bigger organisms. The filtrate is kept and pushed through # µm to catch the smaller, free-living bacteria and archaea. Keep vacuum between −# and −# bar: too weak and nothing flows, too strong and the membrane tears.": "los # L pasan primero por una membrana de # µm, que atrapa las células asociadas a partículas y organismos más grandes. El filtrado se guarda y se pasa por # µm para capturar las bacterias y arqueas de vida libre, más pequeñas. Mantén el vacío entre −# y −# bar: muy débil y no fluye nada, muy fuerte y la membrana se rompe.", "to fill the # L jerrycan, walk to the station (truck tailgate or kit) and press": "para llenar el bidón de # L, camina a la estación (pickup de la camioneta o kit) y presiona", "to get out. If the truck is more than ~# km away (e.g. on the volcano), a portable kit is set up where you arrive.": "para bajarte. Si la camioneta queda a más de ~# km (por ejemplo en el volcán), se arma un kit portátil donde llegues.", "to pour. Twice → # L.": "para verterlo. Dos veces → # L.", "to pump, keep the vacuum gauge in the green. Swap clogged membranes": "para bombear y mantén el manómetro en verde. Cambia las membranas tapadas", "to the crater sites. When your cooler is full, return to the": "hasta los sitios del cráter. Cuando tu cooler esté lleno, vuelve a la", "to the freshwater controls near": "hasta los controles de agua dulce cerca de", "toast and boil them": "tostarlos y hervirlos", "toast them and boil them": "tostarlos y hervirlos", "torn membranes": "membranas rotas", "very good boy · 🐾": "un perro muy bueno · 🐾", "walk # L of water": "camina # L de agua", "water!": "¡de agua!", "water. Lovely.": ". Qué rico.", "weaver · stories": "tejedora · historias", "with the flock: their blood smells so strong that the Pihuchén will not come near. Look at our corral, you will see.": "con el rebaño: su sangre tiene un olor tan fuerte que el Pihuchén no se acerca. Mira nuestro corral y lo verás.", "with the multiparameter probe": "con la sonda multiparamétrica", "with their flocks: the smell and strength of goat blood is said to scare the Pihuchén away. Look at it keep its distance from these goats!": "con sus rebaños: se dice que el olor y la fuerza de la sangre de chivo espantan al Pihuchén. ¡Mira cómo se mantiene lejos de estos chivos!", "· Pehuenche community": "· comunidad pehuenche", "· probe": "· sonda", "· sample in the cooler": "· muestra en el cooler", "· sequencing": "· secuenciación", "· stories": "· historias", "· turbidity": "· turbidez", "· ❄ SNOW": "· ❄ NIEVE", "· 🌧 rain": "· 🌧 lluvia", "× # µm on dry ice · +": "× # µm en hielo seco · +", "— one more trip!": "— ¡un viaje más!", "— ready to filter.": "— listo para filtrar.", "“Above all spirits of this land stands": "“Por sobre todos los espíritus de esta tierra está", "“Long ago there was a powerful and feared cacique called": "“Hace mucho tiempo existía un cacique poderoso y temido llamado", "■ STOP PCR (SPACE)": "■ DETENER PCR (ESPACIO)", "▶ BACK TO THE GAME": "▶ VOLVER AL JUEGO", "▶ NEW CAMPAIGN": "▶ NUEVA CAMPAÑA", "▶ START SAMPLING": "▶ EMPEZAR A MUESTREAR", "● RECORD (E)": "● REGISTRAR (E)", "☀ The squall has passed. Back to work!": "☀ Pasó la tormenta. ¡A trabajar!", "⚙ HOLD TO BEAD-BEAT (SPACE)": "⚙ MANTÉN PARA BEAD-BEATING (ESPACIO)", "⛽ HOLD TO PUMP (SPACE)": "⛽ MANTÉN PARA BOMBEAR (ESPACIO)", "✅ # L through # µm. The filtrate goes back into a clean carboy for the": "✅ # L por # µm. El filtrado vuelve a un bidón limpio para la etapa de", "✔ Each sample gets its own": "✔ Cada muestra recibe su propio", "✔ You are on the board! Your row is highlighted.": "✔ ¡Estás en el ranking! Tu fila está destacada.", "❄ # sample": "❄ # muestra", "❄ # samples": "❄ # muestras", "❄ A snow squall is rolling in from the Andes! For about # seconds you won't be able to walk or sample. Take shelter in the truck.": "❄ ¡Viene una nevazón desde los Andes! Por unos # segundos no podrás caminar ni muestrear. Refúgiate en la camioneta.", "❄ FOLD MEMBRANES INTO CRYOVIALS & STORE (E)": "❄ DOBLAR MEMBRANAS EN CRIOTUBOS Y GUARDAR (E)", "❄ SNOW SQUALL — whiteout! No walking or sampling for": "❄ NEVAZÓN — ¡no se ve nada! No puedes caminar ni muestrear por", "❄ Snow squall — sampling paused (": "❄ Nevazón — muestreo en pausa (", "❄ Whiteout! It is too dangerous to walk until the squall passes.": "❄ ¡No se ve nada! Es muy peligroso caminar hasta que pase la nevazón.", "❓ Something mysterious here… inspect it": "❓ Aquí hay algo misterioso… examínalo", "⟳ SWAP MEMBRANE (R)": "⟳ CAMBIAR MEMBRANA (R)", "⤓ EMPTY FLASK (F)": "⤓ VACIAR MATRAZ (F)", "⬇ HOLD TO LOWER (SPACE)": "⬇ MANTÉN PARA BAJAR (ESPACIO)", "⭐ ADD MY CAMPAIGN": "⭐ AGREGAR MI CAMPAÑA", "🌧 Rain shower. Keep working, but mind the slippery rocks.": "🌧 Chubasco. Sigue trabajando, pero cuidado con las rocas resbalosas.", "🎒 The truck is far away, so you set up the": "🎒 La camioneta está lejos, así que armaste el", "🎲 NEW LOOK (L)": "🎲 NUEVA PINTA (L)", "🎲 Today's look:": "🎲 Pinta de hoy:", "🏆 HALL OF FAME": "🏆 SALÓN DE LA FAMA", "🏊 BATHERS": "🏊 BAÑISTAS", "👤 Now playing as": "👤 Ahora juegas como", "👤 SWITCH (P)": "👤 CAMBIAR (P)", "💥 RIIIP! Too much vacuum — the membrane tore. Swap it (R) and pump gently.": "💥 ¡RIIIP! Demasiado vacío — se rompió la membrana. Cámbiala (R) y bombea suave.", "💥 You hit the sediment! Turbidity spiked — lift the probe and wait.": "💥 ¡Tocaste el sedimento! La turbidez se disparó — sube la sonda y espera.", "💦 You got splashed. With pH": "💦 Te mojaron. Con agua de pH", "💧 # L from #": "💧 # L de #", "💧 Jerrycan full:": "💧 Bidón lleno:", "🔇 SOUND OFF": "🔇 SIN SONIDO", "🔈 SFX ONLY": "🔈 SOLO EFECTOS", "🔊 MUSIC + SFX": "🔊 MÚSICA + EFECTOS", "🔬 Fact: acidic, metal-rich water dissolves skin oils and can cause dermatitis and eye burns. Acidophiles like": "🔬 Dato: el agua ácida y rica en metales disuelve los aceites de la piel y puede causar dermatitis y quemaduras en los ojos. Los acidófilos como", "🔬 Fact: downstream the Río Agrio stays acidic (pH #–#) for ~# km before it neutralises.": "🔬 Dato: río abajo, el Río Agrio sigue ácido (pH #–#) por ~# km antes de neutralizarse.", "🔬 Fact: the Río Agrio is born at pH ~#–# because volcanic SO₂ and HCl dissolve into the springs below the crater.": "🔬 Dato: el Río Agrio nace con pH ~#–# porque el SO₂ y el HCl volcánicos se disuelven en las vertientes bajo el cráter.", "🛻 Back in the field!": "🛻 ¡De vuelta en terreno!", "🛻 DRIVING": "🛻 MANEJANDO", "🛻 KEEP DRIVING AROUND": "🛻 SEGUIR MANEJANDO", "🛻 Welcome to Caviahue! Pick a site from the": "🛻 ¡Bienvenido a Caviahue! Elige un sitio de la", "🥾 ON FOOT": "🥾 A PIE", "🧗 Scrambling up loose scree…": "🧗 Trepando por el pedrero suelto…", "🧬 SHIP FOR ILLUMINA SEQUENCING": "🧬 ENVIAR A SECUENCIAR EN ILLUMINA", "Upper Río Agrio · sample in the cooler": "Río Agrio Superior · muestra en el cooler", "Top hat with a flower + Ballet tutu": "Sombrero de copa con flor + Tutú de ballet", "# · # µm — free-living": "# · # µm — vida libre", "# · # µm — particle-attached": "# · # µm — asociada a partículas", "# · store membranes": "# · guardar membranas", "pH # water!": "¡agua de pH #!", "SPACE": "ESPACIO", "MAP": "MAPA", "SHIFT": "SHIFT", "Geothermal": "Geotermal", "Scientists! Always ruining the fun. Take THIS!": "¡Científicos! Siempre arruinando la diversión. ¡Toma ESTO!", "Keep sampling, we keep bathing!": "¡Sigan muestreando, nosotros seguimos bañándonos!", "Tell Acidithiobacillus we said hi!": "¡Salúdame a Acidithiobacillus!", "KIT": "KIT", "MEL Field Base · # km": "Base de terreno MEL · # km", "Sombrero": "Sombrero mexicano", "🎉 FINISH": "🎉 FINALIZAR", "Wizard hat with stars": "Sombrero de mago con estrellas", "Astronaut helmet": "Casco de astronauta", "Detective deerstalker & pipe (Sherlock Holmes)": "Gorro de detective y pipa (Sherlock Holmes)", "Vampire count collar & fangs (Dracula)": "Capa de conde vampiro y colmillos (Drácula)", "Robin Hood feathered cap": "Gorro con pluma de Robin Hood", "Ninja headband": "Cinta ninja", "Alien antennae": "Antenas de extraterrestre", "Superhero eye mask": "Antifaz de superhéroe", "Mummy bandages": "Vendas de momia", "Glowing sci-fi laser sword": "Espada láser de ciencia ficción", "Magic wand": "Varita mágica", "Sheriff star & lasso": "Estrella de sheriff y lazo", "Pirate parrot on the shoulder": "Loro pirata en el hombro", "Time-traveller goggles": "Gafas de viajero en el tiempo", "Jungle explorer pith helmet": "Casco de explorador de la selva", "Knight helmet with plume": "Casco de caballero con penacho", "Samurai topknot": "Moño de samurái", "Werewolf ears & tail": "Orejas y cola de hombre lobo", "Devil horns": "Cuernos de diablo", "Angel halo": "Aureola de ángel", "Clown nose & rainbow wig": "Nariz de payaso y peluca arcoíris", "Hot-dog hat": "Gorro de completo", "Movie director beret & megaphone": "Boina y megáfono de director de cine", "Ghost-catcher vacuum backpack": "Mochila aspiradora caza-fantasmas", "Witch broom": "Escoba de bruja", "Knight shield": "Escudo de caballero", "Dinosaur tail": "Cola de dinosaurio", "Walk into the MEL Field Base to ship samples": "Entra caminando a la base MEL para enviar las muestras", "🚧 Vehicles stay outside the MEL Field Base. Park and walk in (E).": "🚧 Los vehículos quedan fuera de la base MEL. Estaciona y entra caminando (E)."}, "P": {"Crater Lake": "Laguna del Cráter", "Agrio Spring 2 (Vertiente del Agrio)": "Vertiente del Agrio 2", "Agrio Spring 1 (Vertiente del Agrio)": "Vertiente del Agrio 1", "Upper Río Agrio 1": "Río Agrio Superior 1", "Culebra Waterfall": "Cascada de la Culebra", "Río Jara (freshwater)": "Río Jara (agua dulce)", "Jara–Agrio confluence": "Unión Jara–Agrio", "Lake Caviahue, north arm": "Lago Caviahue, brazo norte", "Lower Río Agrio 1 (Gendarmería bridge)": "Río Agrio Inferior 1 (puente de Gendarmería)", "Salto del Agrio, above the falls": "Salto del Agrio, sobre el salto", "Salto del Agrio, plunge pool": "Salto del Agrio, pozón", "North of Loncopué (freshwater control)": "Norte de Loncopué (control de agua dulce)", "Springs / crater": "Vertientes / cráter", "Upper Río Agrio": "Río Agrio Superior", "Lower Río Agrio": "Río Agrio Inferior", "Lake Caviahue": "Lago Caviahue", "Freshwater control": "Control de agua dulce", "Geothermal": "Geotermal", "MEL Field Base": "Base de terreno MEL", "sample in the cooler": "muestra en el cooler", "sequencing": "secuenciación", "hike": "a pie", "stories": "historias", "Nearest:": "Más cercano:", "Party cone hat": "Gorro de fiesta", "Backwards baseball cap": "Jockey al revés", "Beanie with a giant pompom": "Gorro con pompón gigante", "Cowboy hat": "Sombrero vaquero", "Viking helmet": "Casco vikingo", "Royal crown": "Corona real", "Propeller beanie": "Gorro con hélice", "Chef hat": "Gorro de chef", "Top hat with a flower": "Sombrero de copa con flor", "Pirate hat & eyepatch": "Sombrero pirata y parche", "Bunny ears": "Orejas de conejo", "Reindeer antlers": "Cuernos de reno", "Snorkel mask": "Máscara de snorkel", "Heart sunglasses": "Lentes de corazón", "Giant neon shades": "Lentes neón gigantes", "Flower crown": "Corona de flores", "Super-long striped scarf": "Bufanda a rayas superlarga", "Superhero cape": "Capa de superhéroe", "Inflatable duck ring": "Salvavidas de pato", "Hawaiian flower lei": "Collar hawaiano", "Enormous bow tie": "Humita gigante", "Ballet tutu": "Tutú de ballet", "Neon fanny pack": "Banano neón", "Rubber chicken": "Pollo de goma", "Diving flippers": "Aletas de buceo", "Bunny slippers": "Pantuflas de conejo", "Swim kit (board shorts, floaties & flippers)": "Kit de playa (traje de baño, flotadores y aletas)", "Sombrero": "Sombrero mexicano", "turbidity": "turbidez", "electric pump at the truck tailgate": "bomba eléctrica en la pickup", "hand vacuum pump (portable kit)": "bomba de vacío manual (kit portátil)", "Wizard hat with stars": "Sombrero de mago con estrellas", "Astronaut helmet": "Casco de astronauta", "Detective deerstalker & pipe (Sherlock Holmes)": "Gorro de detective y pipa (Sherlock Holmes)", "Vampire count collar & fangs (Dracula)": "Capa de conde vampiro y colmillos (Drácula)", "Robin Hood feathered cap": "Gorro con pluma de Robin Hood", "Ninja headband": "Cinta ninja", "Alien antennae": "Antenas de extraterrestre", "Superhero eye mask": "Antifaz de superhéroe", "Mummy bandages": "Vendas de momia", "Glowing sci-fi laser sword": "Espada láser de ciencia ficción", "Magic wand": "Varita mágica", "Sheriff star & lasso": "Estrella de sheriff y lazo", "Pirate parrot on the shoulder": "Loro pirata en el hombro", "Time-traveller goggles": "Gafas de viajero en el tiempo", "Jungle explorer pith helmet": "Casco de explorador de la selva", "Knight helmet with plume": "Casco de caballero con penacho", "Samurai topknot": "Moño de samurái", "Werewolf ears & tail": "Orejas y cola de hombre lobo", "Devil horns": "Cuernos de diablo", "Angel halo": "Aureola de ángel", "Clown nose & rainbow wig": "Nariz de payaso y peluca arcoíris", "Hot-dog hat": "Gorro de completo", "Movie director beret & megaphone": "Boina y megáfono de director de cine", "Ghost-catcher vacuum backpack": "Mochila aspiradora caza-fantasmas", "Witch broom": "Escoba de bruja", "Knight shield": "Escudo de caballero", "Dinosaur tail": "Cola de dinosaurio"}};
const esc2=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const I18_TOKRE=(()=>{const t=[...new Set([...MISSION.map(m=>m.c),...MISSION.map(m=>m.c.replace('_','–')),...CHAR_NAMES])].sort((a,b)=>b.length-a.length);
  return new RegExp('(?<![A-Za-z])(?:'+t.map(esc2).join('|')+')(?![A-Za-z0-9])|\\d+(?:[.,]\\d+)?','g');})();
const I18_PHR=(()=>{const k=Object.keys(I18N.P).sort((a,b)=>b.length-a.length);return new RegExp('(?<![A-Za-zÀ-ÿ])(?:'+k.map(esc2).join('|')+')(?![A-Za-zÀ-ÿ])','g');})();
function trText(s){
  const m=s.match(/^(\s*)([\s\S]*?)(\s*)$/);const core=m[2];if(!core||!/[A-Za-z]/.test(core))return s;
  let r=I18N.D[core];
  if(r===undefined){const toks=[];const k=core.replace(I18_TOKRE,t=>{toks.push(t);return '#';});const t=I18N.D[k];if(t!==undefined){let i=0;r=t.replace(/#/g,()=>toks[i++]!==undefined?toks[i-1]:'#');}}
  if(r===undefined){const p=core.match(/^([^A-Za-z¿¡"“*]+)([A-Za-z¿¡"“*][\s\S]*)$/);if(p){const t=trText(p[2]);if(t!==p[2])r=p[1]+t;}}
  if(r===undefined){const t=core.replace(I18_PHR,x=>I18N.P[x]);if(t!==core)r=t;}
  return r===undefined?s:m[1]+r+m[3];
}
const I18_ORIG=new WeakMap(),I18_SET=new WeakMap();const I18_SKIP='#labels,#layers,#views,#legend,#help,#side,#about,#title,#loader,script,style,textarea,input';
function i18Node(n){const v=n.nodeValue;if(I18_SET.get(n)===v)return;I18_ORIG.set(n,v);
  if(LANG==='es'){const t=trText(v);if(t!==v){I18_SET.set(n,t);n.nodeValue=t;return;}}I18_SET.delete(n);}
function i18Walk(root,restore){const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;
  while(n=w.nextNode()){const pe=n.parentElement;if(pe&&pe.closest(I18_SKIP))continue;
    if(restore){if(I18_SET.get(n)===n.nodeValue&&I18_ORIG.has(n)){n.nodeValue=I18_ORIG.get(n);}I18_SET.delete(n);}else i18Node(n);}}
new MutationObserver(ms=>{for(const m of ms){if(m.type==='characterData'){const pe=m.target.parentElement;if(!pe||!pe.closest(I18_SKIP))i18Node(m.target);}
  else m.addedNodes.forEach(x=>{if(x.nodeType===3){const pe=x.parentElement;if(!pe||!pe.closest(I18_SKIP))i18Node(x);}else if(x.nodeType===1&&!x.closest(I18_SKIP))i18Walk(x,false);});}})
  .observe(document.body,{subtree:true,childList:true,characterData:true});
function setLang(l){LANG=l;try{localStorage.setItem('cfc_lang',l);}catch(e){}i18Walk(document.body,true);if(l==='es')i18Walk(document.body,false);
  const b=document.getElementById('g-lang');if(b){b.textContent=l==='es'?'EN':'ES';b.dataset.tip=l==='es'?'Switch to English':'Cambiar a español';}
  document.documentElement.lang=l;}

// hard techno engine (150 BPM): distorted kick, rumble, hats, claps, acid line
function makeTechno(){
  const A=AU.raw();if(!A||!A.C)return null;const C=A.C,out=C.createGain();out.gain.value=level0();out.connect(A.master);
  function level0(){return AU.level===0?0:.9;}
  const ws=C.createWaveShaper();{const n=1024,c=new Float32Array(n);for(let i=0;i<n;i++){const x=i/n*2-1;c[i]=Math.tanh(x*6);}ws.curve=c;}ws.connect(out);
  const nb=C.createBuffer(1,C.sampleRate,C.sampleRate);{const d=nb.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;}
  const env=(g,t,a,p,d)=>{g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(p,t+a);g.gain.exponentialRampToValueAtTime(.0001,t+a+d);};
  function kick(t){const o=C.createOscillator(),g=C.createGain();o.frequency.setValueAtTime(160,t);o.frequency.exponentialRampToValueAtTime(42,t+.12);o.connect(g);g.connect(ws);env(g,t,.002,1,.32);o.start(t);o.stop(t+.4);
    const r=C.createOscillator(),rg=C.createGain(),lp=C.createBiquadFilter();lp.type='lowpass';lp.frequency.value=180;r.type='sawtooth';r.frequency.value=44;r.connect(lp);lp.connect(rg);rg.connect(ws);
    rg.gain.setValueAtTime(0,t+.1);rg.gain.linearRampToValueAtTime(.35,t+.14);rg.gain.exponentialRampToValueAtTime(.0001,t+.38);r.start(t+.1);r.stop(t+.4);}
  function noise(t,type,f,q,v,d){const s=C.createBufferSource();s.buffer=nb;const fl=C.createBiquadFilter();fl.type=type;fl.frequency.value=f;fl.Q.value=q;const g=C.createGain();s.connect(fl);fl.connect(g);g.connect(out);env(g,t,.001,v,d);s.start(t,Math.random()*.5);s.stop(t+d+.05);}
  const ACID=[36,36,48,36,39,36,43,36,36,48,46,36,41,36,43,48];
  function acid(t,st,sweep){const o=C.createOscillator(),f=C.createBiquadFilter(),g=C.createGain();o.type='sawtooth';o.frequency.value=440*Math.pow(2,(ACID[st]-57)/12);
    f.type='lowpass';f.Q.value=18;f.frequency.setValueAtTime(300+sweep*2600,t);f.frequency.exponentialRampToValueAtTime(180,t+.09);o.connect(f);f.connect(g);g.connect(out);env(g,t,.003,.16,.1);o.start(t);o.stop(t+.14);}
  const SPB=60/150/4;let next=C.currentTime+.08,step=0,alive=true;const kicks=[];
  function sched(){if(!alive)return;while(next<C.currentTime+.15){const t=next,s=step%16,bar=Math.floor(step/16);
      if(s%4===0){kick(t);kicks.push(t);}
      if(s%4===2)noise(t,'highpass',7500,.7,.22,.09);else noise(t,'highpass',9000,.7,.05,.025);
      if(s===4||s===12)noise(t,'bandpass',1600,1.2,.35,.12);
      if(bar>=1)acid(t,s,(Math.sin(step*.08)+1)/2);
      if(bar>=2&&s%8===6)noise(t,'bandpass',3200,4,.12,.25);
      next+=SPB;step++;}
    setTimeout(sched,25);}
  sched();
  return {stop(){alive=false;out.gain.setTargetAtTime(0,C.currentTime,.3);setTimeout(()=>out.disconnect(),1500);},kickSince(){const now=C.currentTime;let last=-1;for(const k of kicks)if(k<=now)last=k;return last<0?9:now-last;},bpmBeat(){return (C.currentTime-kicks[0]||0)/(60/150);}};
}
// ------------------------------------------------------------ FINALE: everyone dances, then the lab logo
const LX=(en,es)=>LANG==='es'?es:en;
function logoSrc(){const i=document.querySelector('.logo-about img')||document.querySelector('.logo-tile img');return i?i.src:'';}

// ------------------------------------------------------------ finale genres: random music + dance moves + formations
function makeBand(G){const A=AU.raw();if(!A||!A.C)return null;const C=A.C,out=C.createGain();out.gain.value=AU.level===0?0:.8;out.connect(A.master);
  const ws=C.createWaveShaper();{const n=1024,c=new Float32Array(n);for(let i=0;i<n;i++){const x=i/n*2-1;c[i]=Math.tanh(x*(G.id==='metal'?14:3));}ws.curve=c;}const wg=C.createGain();wg.gain.value=G.id==='metal'?.35:.6;ws.connect(wg);wg.connect(out);
  const nb=C.createBuffer(1,C.sampleRate,C.sampleRate);{const d=nb.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;}
  const env=(g,t,a,p,d)=>{g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(p,t+a);g.gain.exponentialRampToValueAtTime(.0001,t+a+d);};
  const F=m=>440*Math.pow(2,(m-69)/12);const kicks=[];
  const K={kick(t,v){const o=C.createOscillator(),g=C.createGain();o.frequency.setValueAtTime(150,t);o.frequency.exponentialRampToValueAtTime(45,t+.1);o.connect(g);g.connect(out);env(g,t,.002,v||.9,.25);o.start(t);o.stop(t+.3);kicks.push(t);},
    noise(t,type,f,q,v,d){const s=C.createBufferSource();s.buffer=nb;const fl=C.createBiquadFilter();fl.type=type;fl.frequency.value=f;fl.Q.value=q;const g=C.createGain();s.connect(fl);fl.connect(g);g.connect(out);env(g,t,.001,v,d);s.start(t,Math.random()*.5);s.stop(t+d+.05);},
    tom(t,f,v,d){const o=C.createOscillator(),g=C.createGain();o.frequency.setValueAtTime(f*1.6,t);o.frequency.exponentialRampToValueAtTime(f,t+.05);o.connect(g);g.connect(out);env(g,t,.002,v,d||.2);o.start(t);o.stop(t+(d||.2)+.05);},
    tone(t,m,d,v,type,cut,dist,vib){const o=C.createOscillator(),g=C.createGain();o.type=type||'triangle';o.frequency.setValueAtTime(F(m),t);if(vib){const l=C.createOscillator(),lg=C.createGain();l.frequency.value=6;lg.gain.value=F(m)*.012;l.connect(lg);lg.connect(o.frequency);l.start(t);l.stop(t+d+.05);}
      let n=o;if(cut){const f=C.createBiquadFilter();f.type='lowpass';f.frequency.value=cut;o.connect(f);n=f;}n.connect(g);g.connect(dist?ws:out);env(g,t,.005,v,d);o.start(t);o.stop(t+d+.05);},
    chord(t,ms,d,v,type,cut,dist){ms.forEach(m=>K.tone(t,m,d,v/ms.length*1.6,type,cut,dist));}};
  const SPB=60/G.bpm/4;let next=C.currentTime+.08,step=0,alive=true;
  (function sched(){if(!alive)return;while(next<C.currentTime+.15){G.step(K,next,step%G.steps,Math.floor(step/G.steps),step);next+=SPB;step++;}setTimeout(sched,25);})();
  return {stop(){alive=false;out.gain.setTargetAtTime(0,C.currentTime,.3);setTimeout(()=>out.disconnect(),1500);},kickSince(){const now=C.currentTime;let l=-1;for(const k of kicks)if(k<=now)l=k;return l<0?9:now-l;}};}
const MV={
 fistpump:(u,p,x,h)=>{u.armR.rotation.z=-2.8+h*.9;u.armL.rotation.z=-.6;p.position.y+=h*.03;},
 handsup:(u,p,x,h)=>{u.armL.rotation.z=u.armR.rotation.z=-2.9+h*.5;u.armL.rotation.x=Math.sin(x*.5)*.3;p.position.y+=h*.03;},
 shuffle:(u,p,x,h)=>{p.rotation.y+=Math.sin(x*.25)*.5;u.armL.rotation.z=-1.6+Math.sin(x)*.8;u.armR.rotation.z=-1.6-Math.sin(x)*.8;u.legL.rotation.z=Math.sin(x)*.4;u.legR.rotation.z=-Math.sin(x)*.4;},
 running:(u,p,x)=>{u.armL.rotation.z=u.armR.rotation.z=-.9;u.armL.rotation.x=-Math.sin(x)*.9;u.armR.rotation.x=Math.sin(x)*.9;u.legL.rotation.z=Math.max(0,Math.sin(x))*.8;u.legR.rotation.z=Math.max(0,-Math.sin(x))*.8;},
 headbang:(u,p,x,h)=>{p.rotation.z=-h*.45;u.armL.rotation.z=u.armR.rotation.z=-.3;u.legL.rotation.z=.3;u.legR.rotation.z=-.3;},
 airguitar:(u,p,x,h)=>{u.armL.rotation.z=-1.3;u.armL.rotation.x=.6;u.armR.rotation.z=-.7+Math.sin(x*2)*.5;p.rotation.z=-h*.2;u.legL.rotation.z=.4;},
 horns:(u,p,x,h)=>{u.armR.rotation.z=-2.9;u.armL.rotation.z=-2.9;p.position.y+=Math.abs(Math.sin(x*.5))*.05;p.rotation.z=-h*.3;},
 mosh:(u,p,x,h,i)=>{p.position.y+=Math.abs(Math.sin(x*.5+i))*.08;p.rotation.y+=Math.sin(x*.25+i)*1.2;u.armL.rotation.z=-1.2;u.armR.rotation.z=-2;},
 bulb:(u,p,x)=>{u.armR.rotation.z=-2.8;u.armR.rotation.y=x*.5;u.armL.rotation.z=-1.2+Math.sin(x)*.3;p.rotation.y+=Math.sin(x*.5)*.25;},
 thumka:(u,p,x)=>{p.rotation.z=Math.sin(x*.5)*.18;u.armL.rotation.z=-2.4;u.armR.rotation.z=-.5;u.armR.rotation.x=.6;u.legL.rotation.z=Math.max(0,Math.sin(x*.5))*.4;},
 bhangra:(u,p,x,h)=>{u.armL.rotation.z=u.armR.rotation.z=-2.6;p.position.y+=h*.05;u.legL.rotation.z=h>.5?.8:0;u.legR.rotation.z=h>.5?0:-.8;},
 pirouette:(u,p,x,h,i,b)=>{p.rotation.y+=b*Math.PI;u.armL.rotation.z=u.armR.rotation.z=-2.7;u.armL.rotation.x=-.4;u.armR.rotation.x=.4;p.position.y+=.012;u.legL.rotation.x=.3;},
 arabesque:(u,p,x)=>{u.legR.rotation.z=1.25;u.armL.rotation.z=-2.2;u.armR.rotation.z=-1.1;p.rotation.z=.12;p.position.y+=.01;},
 plie:(u,p,x)=>{p.position.y-=Math.abs(Math.sin(x*.5))*.04;u.legL.rotation.x=.5;u.legR.rotation.x=-.5;u.armL.rotation.z=u.armR.rotation.z=-1.4+Math.sin(x*.5)*.6;},
 halay:(u,p,x,h)=>{u.armL.rotation.z=u.armR.rotation.z=-1.1;u.armL.rotation.x=-1.1;u.armR.rotation.x=1.1;p.position.y+=h*.025;u.legL.rotation.z=Math.max(0,Math.sin(x*.5))*.7;p.rotation.z=Math.sin(x)*.08;},
 shimmy:(u,p,x)=>{p.rotation.x=Math.sin(x*4)*.1;u.armL.rotation.z=-2.2;u.armR.rotation.z=-2.2;u.armL.rotation.x=Math.sin(x*4)*.2;},
 salsa:(u,p,x)=>{const s=Math.sin(x*.5);u.legL.rotation.z=s*.5;u.legR.rotation.z=-s*.2;p.rotation.z=s*.1;u.armL.rotation.z=-1.2;u.armR.rotation.z=-1.2;u.armL.rotation.x=-.5;u.armR.rotation.x=.5;},
 spin:(u,p,x,h,i,b)=>{p.rotation.y+=(b%4<2?b*Math.PI:0);u.armR.rotation.z=-2.8;u.armL.rotation.z=-.8;},
 travolta:(u,p,x,h)=>{const up=Math.floor(x/Math.PI)%2===0;u.armR.rotation.z=up?-2.9:-.3;u.armR.rotation.x=up?-.4:.5;u.armL.rotation.z=-.3;p.rotation.z=up?-.12:.08;},
 hustle:(u,p,x)=>{p.position.x+=Math.sin(x*.25)*.05;u.armL.rotation.z=-1.5;u.armL.rotation.y=Math.sin(x)*.8;u.armR.rotation.z=-1.5;u.armR.rotation.y=-Math.sin(x)*.8;u.legL.rotation.z=Math.max(0,Math.sin(x*.5))*.5;},
 wave:(u,p,x)=>{u.armL.rotation.z=-1.6+Math.sin(x)*1.2;u.armR.rotation.z=-1.6-Math.sin(x)*1.2;p.position.y+=Math.max(0,Math.sin(x))*.03;}};
const FIN_GENRES=[
 {id:'techno',en:'HARD TECHNO MODE',es:'MODO HARD TECHNO',bpm:150,bg:'#07060d',lasers:1,strobe:1,moves:[MV.fistpump,MV.handsup,MV.shuffle,MV.running],forms:['rows','vee','circle']},
 {id:'bollywood',en:'BOLLYWOOD ENDING (like the movies!)',es:'FINAL BOLLYWOOD (¡como en las películas!)',bpm:112,steps:16,bg:'#ff7b00',floor:'#b8402a',tiles:['#ffd23f','#ff2d95','#ffffff','#7cff4f'],conf:['#ff9f1c','#ffd23f','#ff4f3a'],wave:1,moves:[MV.bulb,MV.thumka,MV.bhangra,MV.wave],forms:['vee','lines','rows'],
  step(K,t,s,bar){if([0,6,8,11,14].includes(s))K.tom(t,70,.8,.25);if(s===4||s===12)K.tom(t,190,.55,.12);if(s%2)K.noise(t,'highpass',8000,.8,.08,.04);if(s===0)K.tone(t,36,1.9,.14,'sawtooth',500);
   const R=[60,61,64,65,67,68,71,72];if(s%2===0&&bar>=1)K.tone(t,R[(s*3+bar*5)%8]+12,.2,.16,'sawtooth',2600,false,true);if(s===0)K.kick(t,.6);}},
 {id:'metal',en:'HEAVY METAL HEADBANG',es:'HEADBANG DE HEAVY METAL',bpm:170,steps:16,bg:'#1a0505',floor:'#2a0a0a',tiles:['#ff2020','#ff7b00','#ffffff'],strobe:1,shake:3,conf:['#ff2020','#1d1a2b','#ff7b00'],moves:[MV.headbang,MV.airguitar,MV.horns,MV.mosh],forms:['rows','vee'],
  step(K,t,s,bar){if(bar>=1&&s%2===0)K.kick(t,.9);else if(s===0)K.kick(t,.9);if(s===4||s===12)K.noise(t,'bandpass',1800,.9,.6,.15);if(s===0&&bar%2===0)K.noise(t,'highpass',5000,.5,.4,.9);
   const RIF=[40,40,0,43,40,0,45,43,40,40,0,46,45,0,43,0];const m=RIF[(s+bar*16)%16];if(m)K.chord(t,[m,m+7,m+12],.13,.5,'sawtooth',3000,true);}},
 {id:'ballet',en:'BALLET GALA',es:'GALA DE BALLET',bpm:100,steps:12,bg:'#3a2a5a',floor:'#2a2044',tiles:['#ffc8e8','#e8e0ff','#ffffff'],conf:['#ffffff','#ffc8e8','#e8e0ff'],wave:1,moves:[MV.pirouette,MV.arabesque,MV.plie,MV.wave],forms:['circle','rows'],forms2:'circle',
  step(K,t,s,bar){const ch=[[50,57,62],[55,59,62],[57,61,64],[50,54,57]][bar%4];if(s===0)K.tone(t,ch[0]-12,.4,.25,'triangle');if(s===4||s===8)K.chord(t,ch,.25,.22,'triangle');
   const MEL=[74,76,78,79,78,76,74,73,71,73,74,76];if(s%2===0&&bar>=1)K.tone(t,MEL[(s/2+bar*6)%12],.35,.16,'sine');if(s===0)K.tom(t,60,.25,.1);}},
 {id:'turkish',en:'TURKISH HALAY (everyone link pinkies!)',es:'HALAY TURCO (¡todos del meñique!)',bpm:125,steps:18,bg:'#0b4f6c',floor:'#083a52',tiles:['#ff2020','#ffffff','#ffd23f'],conf:['#ff2020','#ffffff'],moves:[MV.halay,MV.shimmy,MV.halay,MV.bhangra],forms:['conga','lines'],forms2:'conga',
  step(K,t,s,bar){if([0,4,8,12].includes(s))K.tom(t,s===0?65:80,.8,.22);if([2,6,10,14,16].includes(s))K.tom(t,300,.35,.06);if(s===0)K.kick(t,.5);
   const H=[69,70,73,74,76,77,79,81];if(s%2===0)K.tone(t,H[(s*5+bar*3)%8],.22,.15,'square',2400,false,true);}},
 {id:'salsa',en:'SALSA NIGHT · ¡AZÚCAR!',es:'NOCHE DE SALSA · ¡AZÚCAR!',bpm:190,steps:32,bg:'#6b0f3a',floor:'#3a0820',tiles:['#ff2d95','#ffd23f','#00e5ff'],conf:['#ff2d95','#ffd23f','#ffffff'],moves:[MV.salsa,MV.spin,MV.salsa,MV.wave],forms:['lines','rows','circle'],
  step(K,t,s,bar){if([0,6,12,20,24].includes(s))K.noise(t,'bandpass',2500,6,.5,.05);if(s%4===0){K.tone(t,88,.05,.12,'square',4000);if(s%8===0)K.kick(t,.45);}if(s===14||s===15||s===30||s===31)K.tom(t,s%2?260:200,.4,.12);
   const ch=[[60,64,67],[65,69,72],[67,71,74],[65,69,72]][Math.floor(s/8)];if(s%2===1)K.chord(t,ch.map(m=>m+(s%4===1?0:12)),.1,.2,'triangle');if(s===6||s===12||s===22||s===28)K.tone(t,ch[0]-24,.25,.3,'sine');}},
 {id:'disco',en:'DISCO FEVER',es:'FIEBRE DISCO',bpm:120,steps:16,bg:'#1d0b3a',floor:'#12082a',tiles:['#ff2d95','#00e5ff','#ffd23f','#b15cff'],ball:1,conf:['#ffd23f','#00e5ff','#ff2d95'],moves:[MV.travolta,MV.hustle,MV.fistpump,MV.wave],forms:['rows','vee','lines'],
  step(K,t,s,bar){if(s%4===0)K.kick(t,.8);if(s%4===2)K.noise(t,'highpass',7000,.7,.25,.12);if(s===4||s===12)K.noise(t,'bandpass',1500,1,.35,.1);const r=[57,50,55,48][bar%4];K.tone(t,r-12+(s%2?12:0),.1,.28,'sawtooth',900);
   if(s===0||s===10)K.chord(t,[r+12,r+15,r+19],.25,.18,'sawtooth',3500);}}];
function runFinale(after){
  mode='finale';closeModal();AUX.pump=AUX.beater=AUX.gurgle=0;
  const ov=document.createElement('div');ov.id='g-fin';ov.style.cssText='position:fixed;inset:0;z-index:200;background:#1d1a2b;opacity:0;transition:opacity .6s';
  const cv=document.createElement('canvas');cv.style.cssText='position:absolute;inset:0;width:100%;height:100%';ov.appendChild(cv);
  const cap=document.createElement('div');cap.style.cssText="position:absolute;left:0;right:0;top:4%;text-align:center;font:clamp(28px,5vw,58px)/1 Bangers,Impact;letter-spacing:.05em;color:#ffd23f;-webkit-text-stroke:2px #1d1a2b;text-shadow:4px 4px 0 #1d1a2b";
  cap.textContent=LX('CAMPAIGN COMPLETE! 🎉','¡CAMPAÑA COMPLETADA! 🎉');ov.appendChild(cap);document.body.appendChild(ov);requestAnimationFrame(()=>ov.style.opacity=1);
  const R=new THREE.WebGLRenderer({canvas:cv,antialias:true});R.setPixelRatio(Math.min(devicePixelRatio,2));R.setSize(innerWidth,innerHeight);
  const sc=new THREE.Scene();sc.background=new THREE.Color('#2a1f4a');const cm=new THREE.PerspectiveCamera(38,innerWidth/innerHeight,.01,50);
  sc.add(new THREE.HemisphereLight(0xffffff,0x6a4a8a,.8));const dl=new THREE.DirectionalLight(0xffffff,.7);dl.position.set(2,4,3);sc.add(dl);
  // dance floor with coloured tiles
  const tiles=[];const TC=['#ff4f3a','#ffd23f','#2ec4b6','#3a86ff','#f15bb5','#8ac926'];
  for(let i=-6;i<=6;i++)for(let j=-4;j<=2;j++){const m=new THREE.Mesh(new THREE.BoxGeometry(.19,.02,.19),new THREE.MeshBasicMaterial({color:TC[(i+j+20)%6]}));m.position.set(i*.2,-.01,j*.2);sc.add(m);tiles.push(m);}
  // dancers: all playable scientists + Pedro from the boat, in random order
  const cast=CHARS.map((c,i)=>({cfg:c,name:charNames[i]}));
  cast.push({cfg:{skin:'#e8b89a',hair:'#b8b8b4',style:'short',top:'#6d6a8a',jacket:'#f7f7f4',coat:1,pants:'#2a2e38',shoes:'#3a2a20',h:1.03},name:'Pedro (R/V Caviahue)'});
  for(let i=cast.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[cast[i],cast[j]]=[cast[j],cast[i]];}
  const G=(window.__finG&&FIN_GENRES.find(g=>g.id===window.__finG))||pick(FIN_GENRES);const FORM=pick(G.forms||['rows','circle','vee','lines','conga']);
  const D=[];const N=cast.length;
  cast.forEach((c,k)=>{const p=makePerson(c.cfg);p.scale.setScalar(1.5*(c.cfg.h||1));sc.add(p);D.push({p,ph:Math.random()*6,k,bx:0,bz:0,ry:-Math.PI/2});});
  function place(form,t){D.forEach((d,k)=>{let x=0,z=0,ry=-Math.PI/2;
    if(form==='rows'){const per=9,row=Math.floor(k/per),col=k%per,n=Math.min(per,N-row*per);x=(col-(n-1)/2)*.2+(row%2)*.1;z=-row*.28+.2;}
    else if(form==='circle'){const a=k/N*6.283+t*.25;x=Math.cos(a)*.75;z=Math.sin(a)*.55-.35;ry=-a-Math.PI;}
    else if(form==='vee'){const s=k%2?1:-1,r=Math.ceil(k/2);x=s*r*.13;z=.3-r*.13;}
    else if(form==='lines'){const s=k%2?1:-1,c=Math.floor(k/2);x=(c-(N/2-1)/2)*.2;z=-.35+s*.3;ry=s>0?0:Math.PI;}
    else if(form==='conga'){const a=t*.5-k*.26;x=Math.cos(a)*.85;z=Math.sin(a)*.5-.35;ry=-a;}
    d.bx=x;d.bz=z;d.ry=ry;});}
  // confetti (marigolds for Bollywood, snow for ballet…)
  const conf=[];for(let i=0;i<220;i++){const m=new THREE.Mesh(new THREE.PlaneGeometry(.015,.025),new THREE.MeshBasicMaterial({color:new THREE.Color(pick(G.conf||TC)),side:THREE.DoubleSide}));m.position.set((Math.random()-.5)*2.4,Math.random()*1.4,(Math.random()-.5)*1.4);m.userData.v=.15+Math.random()*.25;sc.add(m);conf.push(m);}
  AU.init();const TK=G.id==='techno'?makeTechno():makeBand(G);let t=0,last=performance.now(),done=false,beat=-1;
  cap.textContent=LX('CAMPAIGN COMPLETE! · ','¡CAMPAÑA COMPLETADA! · ')+LX(G.en,G.es);
  sc.background=new THREE.Color(G.bg);
  const lasers=[];const LC=[0xff2d95,0x00e5ff,0x7cff4f,0xffd23f];
  if(G.lasers)for(let i=0;i<8;i++){const m=new THREE.Mesh(new THREE.BoxGeometry(.006,.006,6),new THREE.MeshBasicMaterial({color:LC[i%4],transparent:true,opacity:.8}));m.position.set((i-3.5)*.25,1.2,-1.2);sc.add(m);lasers.push(m);}
  let ball=null;if(G.ball){ball=new THREE.Mesh(new THREE.IcosahedronGeometry(.12,1),new THREE.MeshBasicMaterial({color:0xd9dde3,wireframe:false}));ball.position.set(0,1.25,-.3);sc.add(ball);}
  const strobe=new THREE.PointLight(0xffffff,0,6);strobe.position.set(0,1.2,.8);sc.add(strobe);
  const spot=new THREE.Mesh(new THREE.CircleGeometry(.16,24),new THREE.MeshBasicMaterial({color:0xfff6c0,transparent:true,opacity:0}));spot.rotation.x=-Math.PI/2;spot.position.y=.002;sc.add(spot);
  const DUR=16;setTimeout(()=>{if(!done){done=true;showLogo();}},(DUR+.5)*1000);
  const moves=G.moves.slice();for(let i=moves.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[moves[i],moves[j]]=[moves[j],moves[i]];}
  let soloK=-1;
  const loop=now=>{if(done)return;const dt=Math.max(0,Math.min(.25,(now-last)/1000));last=now;t+=dt;
    const bps=G.bpm/60,b=t*bps,ks=TK&&TK.kickSince?TK.kickSince():(b%1)/bps,hit=Math.max(0,1-ks*7);
    if(Math.floor(b)!==beat){beat=Math.floor(b);if(!TK)AU.sfx.beep(60,.1,'sine',.2);}
    const bar=Math.floor(b/4),sect=Math.floor(bar/2),mv=moves[sect%moves.length];
    place(sect%3===2&&G.id!=='turkish'?(G.forms2||'circle'):FORM,t);
    if(bar%4===3){if(soloK<0)soloK=Math.floor(Math.random()*N);}else soloK=-1;   // a solo spotlight every few bars
    D.forEach((d,i)=>{const u=d.p.userData;u.armL.rotation.set(0,0,0);u.armR.rotation.set(0,0,0);u.legL.rotation.set(0,0,0);u.legR.rotation.set(0,0,0);
      const solo=i===soloK;const lag=(G.wave?i*.12:0);const x=(b-lag)*Math.PI*2;
      d.p.position.set(d.bx+(solo?0:0),0,d.bz+(solo?.25:0));if(solo){d.p.position.x=0;}d.p.rotation.set(0,d.ry,0);
      mv(u,d.p,x,hit,i,b-lag,solo);(u.anim||[]).forEach(f=>f(t,true));});
    if(soloK>=0){const sp=D[soloK].p.position;spot.position.x=sp.x;spot.position.z=sp.z;spot.material.opacity=.55;}else spot.material.opacity=0;
    tiles.forEach((m,i)=>{const on=((i*7+beat)%5)===0||hit>.8&&i%3===beat%3;m.material.color.set(on?pick(G.tiles||TC):G.floor||'#15121f');});
    lasers.forEach((m,i)=>{m.rotation.y=Math.sin(t*1.7+i)*.9;m.rotation.x=-.35+Math.sin(t*2.3+i*.7)*.25;m.material.opacity=t>4?.85:.35;});
    if(ball){ball.rotation.y+=dt*1.5;ball.material.color.setHSL((t*.2)%1,.3,.8);}
    const flash=G.strobe&&t>4&&(beat%4===3)&&hit>.5;strobe.intensity=flash?4:hit*.6;sc.background.set(flash?'#ffffff':G.bg);
    conf.forEach(m=>{m.position.y-=m.userData.v*dt*1.6;m.rotation.x+=dt*6;m.rotation.y+=dt*5;if(m.position.y<0)m.position.y=1.4;});
    const a=t*.35;cm.position.set(Math.sin(a)*.8+(Math.random()-.5)*hit*.02*(G.shake||1),.45+hit*.02,1.9-hit*.05);cm.lookAt(0,.18,-.3);
    cap.style.transform=`scale(${1+hit*.08})`;
    R.render(sc,cm);
    if(t<DUR)requestAnimationFrame(loop);else if(!done){done=true;showLogo();}};
  requestAnimationFrame(loop);
  function showLogo(){if(TK)TK.stop();R.dispose();cv.remove();cap.remove();
    const box=document.createElement('div');box.style.cssText='position:absolute;inset:0;display:grid;place-items:center;background:#fff8e7;opacity:0;transition:opacity 1s';
    box.innerHTML=`<div style="text-align:center;padding:20px"><img src="${logoSrc()}" alt="Microbial Ecophysiology Lab" style="max-width:min(560px,80vw);display:block;margin:0 auto 18px">
      <div style="font:clamp(22px,3.5vw,40px) Bangers,Impact;letter-spacing:.05em;color:#1d1a2b">${LX('THANKS FOR SAMPLING WITH US!','¡GRACIAS POR MUESTREAR CON NOSOTROS!')}</div>
      <div style="font:700 15px 'Comic Neue',sans-serif;margin:6px 0 16px">Microbial Ecophysiology Lab · Copahue–Caviahue</div>
      <div class="g-row" style="justify-content:center"><button class="g-btn y" id="fin-new">${LX('▶ NEW CAMPAIGN','▶ NUEVA CAMPAÑA')}</button><button class="g-btn" id="fin-exp">${LX('🛻 KEEP EXPLORING','🛻 SEGUIR EXPLORANDO')}</button></div></div>`;
    ov.appendChild(box);requestAnimationFrame(()=>box.style.opacity=1);AU.sfx.tada();
    box.querySelector('#fin-new').onclick=()=>{ov.remove();try{localStorage.removeItem('cfc_save_v1');}catch(e){}showTitle();};
    box.querySelector('#fin-exp').onclick=()=>{ov.remove();mode='play';if(after)after();};}
}

// ------------------------------------------------------------ EARTHQUAKE + ERUPTION (after 15 min of play)
const QUAKE_AT=900,ERUPT_DELAY=180;
const EV={ghosts:[],st:'calm',t:0,shake:0,pulse:0,lava:null,blobs:[],smoke:[],surf:null,cine:null};
function fmtMS(s){s=Math.max(0,Math.ceil(s));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}
function crater(){const [x,z]=Wd.CRATER||Wd.VOLC;return {x,z,y:Wd.heightAt(x,z)};}
function lookCine(dur,posFn,tgtFn){EV.cine={t:0,dur,posFn,tgtFn};}
function startQuake(){EV.st='quake';EV.t=0;EV.pulse=0;closeModal&&modal&&modal.field&&closeModal();
  toast(LX('⚠ <b>EARTHQUAKE!</b> Copahue is waking up… it could erupt in about 3 minutes. Finish what you can!','⚠ <b>¡TERREMOTO!</b> El Copahue está despertando… podría hacer erupción en unos 3 minutos. ¡Termina lo que puedas!'),true,6000);
  const c=crater();const s={x:pl.x,z:pl.z};lookCine(5.5,k=>new THREE.Vector3(lerp(s.x,c.x,.45)+2,c.y+2.2,lerp(s.z,c.z,.45)+3.5),()=>new THREE.Vector3(c.x,c.y+.5,c.z));
  EV.shake=1;}
function spawnBlob(c,big){const m=new THREE.Mesh(new THREE.SphereGeometry(big?.09:.05,6,5),new THREE.MeshBasicMaterial({color:Math.random()<.5?0xff4f1a:0xffb000}));
  m.position.set(c.x+(Math.random()-.5)*.3,c.y+.2,c.z+(Math.random()-.5)*.3);m.userData.v=new THREE.Vector3((Math.random()-.5)*1.6,2.4+Math.random()*2.2,(Math.random()-.5)*1.6);Wd.scene.add(m);EV.blobs.push(m);}
function spawnSmoke(c){const t=EV.smokeTex||(EV.smokeTex=(()=>{const cv=document.createElement('canvas');cv.width=cv.height=64;const x=cv.getContext('2d');x.fillStyle='#5a5560';x.strokeStyle='#1d1a2b';x.lineWidth=4;x.beginPath();x.arc(32,32,27,0,6.3);x.fill();x.stroke();return new THREE.CanvasTexture(cv);})());
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false}));s.position.set(c.x+(Math.random()-.5)*.4,c.y+.4,c.z+(Math.random()-.5)*.4);s.scale.setScalar(.6);s.userData={v:1.2+Math.random(),dx:(Math.random()-.5)*.4,t:0};Wd.scene.add(s);EV.smoke.push(s);}
function makeLava(){const W=Wd.X1-Wd.X0,D=Wd.Z1-Wd.Z0;
  const m=new THREE.ShaderMaterial({uniforms:{time:{value:0}},vertexShader:`varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader:`uniform float time;varying vec3 vW;float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
      void main(){vec2 p=vW.xz*1.6;float a=n(p+vec2(time*.3,-time*.2))*.6+n(p*2.7-vec2(time*.5,time*.1))*.4;vec3 c=mix(vec3(.55,.05,.02),vec3(1.,.35,.02),smoothstep(.35,.7,a));c=mix(c,vec3(1.,.85,.25),smoothstep(.78,.9,a));gl_FragColor=vec4(c,1.);}`});
  const p=new THREE.Mesh(new THREE.PlaneGeometry(W*1.2,D*1.2,1,1).rotateX(-Math.PI/2),m);p.position.set((Wd.X0+Wd.X1)/2,-5,(Wd.Z0+Wd.Z1)/2);Wd.scene.add(p);return p;}
function makeBoard(col){const b=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,.008,16),Wd.toon(col));b.scale.set(2.8,1,.9);return b;}
function spawnGhost(cx,cy,cz){const cfg=CHARS[Math.floor(Math.random()*CHARS.length)];const g=makePerson(cfg);
  const mat=new THREE.MeshBasicMaterial({color:0xeaf6ff,transparent:true,opacity:.45,depthWrite:false});g.traverse(o=>{if(o.isMesh)o.material=mat;});
  const halo=new THREE.Mesh(new THREE.TorusGeometry(.016,.002,6,18),new THREE.MeshBasicMaterial({color:0xfff6a0,transparent:true,opacity:.8}));halo.rotation.x=Math.PI/2;halo.position.y=.215;g.add(halo);
  g.scale.setScalar(2);const a=Math.random()*6.283,r=.35+Math.random()*1.0;g.position.set(cx+Math.cos(a)*r,cy,cz+Math.sin(a)*r);g.rotation.y=Math.random()*6.28;
  g.userData.gh={v:.25+Math.random()*.25,ph:Math.random()*6,t:0,mat};Wd.scene.add(g);EV.ghosts.push(g);}
function startEruption(){
  EV.st='erupt';EV.t=0;if(modal)closeModal();mode='cine';AUX.pump=AUX.beater=AUX.gurgle=0;
  toast(LX('🌋 <b>ERUPTION!</b>','🌋 <b>¡ERUPCIÓN!</b>'),true,4000);AU.sfx.stamp();
  EV.lava=makeLava();EV.lava0=Wd.Y(1300);EV.lava1=Wd.Y(2250);EV.lava.position.y=EV.lava0;
  const c=crater();lookCine(99,k=>{const a=EV.t*.06;return new THREE.Vector3(c.x+Math.cos(a)*9,c.y+4.5,c.z+Math.sin(a)*9+2);},()=>new THREE.Vector3(c.x,c.y+1,c.z));
  // surfers: Caniche clone + Nehuen on boards
  const g=new THREE.Group();Wd.scene.add(g);g.visible=false;
  const cn=Wd.caniche?Wd.caniche.clone():makePerson({skin:'#8a5a3c',hair:'#241c18',style:'longCurly',top:'#3a3f46',pants:'#2a2c30',shoes:'#4a3322'});cn.scale.setScalar(1.7);cn.position.set(0,.03,0);cn.rotation.y=Math.PI/2;
  const b1=makeBoard('#ffd23f');b1.position.y=.012;const s1=new THREE.Group();s1.add(b1,cn);s1.position.set(0,0,-.18);
  const dog=makeNehuen();dog.scale.setScalar(1.8);dog.position.set(0,.03,0);const b2=makeBoard('#3a86ff');b2.position.y=.012;const s2=new THREE.Group();s2.add(b2,dog);s2.position.set(-.35,0,.2);
  g.add(s1,s2);EV.surf={g,s1,s2,cn,dog};
  if(S.petted){const me=makePerson(CHARS[charIdx]);rollAccessories(me);me.scale.setScalar(1.7);me.position.set(-.06,.03,.07);me.rotation.y=Math.PI/2;s2.add(me);EV.surf.me=me;dog.position.x=.05;}
}
function updateVolcano(dt,t){
  if(mode==='play'&&EV.st==='calm'&&S.t>=(S.quakeAt||QUAKE_AT))startQuake();
  if(EV.st==='quake'){EV.t+=dt;EV.pulse-=dt;
    if(EV.pulse<=0){EV.pulse=14+Math.random()*10;EV.shake=.6+EV.t/ERUPT_DELAY;AU.sfx.stamp();}
    if(EV.t>=ERUPT_DELAY&&mode==='play'&&!modal)startEruption();
    else if(EV.t>=ERUPT_DELAY+20)startEruption();}
  EV.shake=Math.max(0,EV.shake-dt*.35);
  if(EV.st==='erupt'){EV.t+=dt;const c=crater();EV.lava.material.uniforms.time.value=t;EV.shake=Math.max(EV.shake,.9);
    if(EV.t<22){for(let k=0;k<4;k++)spawnBlob(c,Math.random()<.2);if(Math.random()<.5)spawnSmoke(c);}
    const k=clamp((EV.t-4)/12,0,1);EV.lava.position.y=lerp(EV.lava0,EV.lava1,k*k*(3-2*k));
    // surfing phase
    if(EV.t>15&&EV.surf){const S2=EV.surf;S2.g.visible=true;const bx=(Wd.X0+Wd.X1)/2-6,bz=(Wd.Z0+Wd.Z1)/2-3;const a=(EV.t-15)*.35;
      const x=bx+Math.cos(a)*4,z=bz+Math.sin(a)*3;const ahead=Math.atan2(-(Math.cos(a)*3),-Math.sin(a)*4);
      S2.g.position.set(x,EV.lava.position.y+Math.sin(EV.t*3)*.03,z);S2.g.rotation.y=ahead;S2.s1.rotation.z=Math.sin(EV.t*2)*.15;S2.s2.rotation.z=Math.cos(EV.t*2.3)*.15;S2.s2.position.y=Math.abs(Math.sin(EV.t*4))*.03;
      const u=S2.dog.userData;if(u.tail)u.tail.rotation.x=Math.sin(EV.t*20)*.8;
      if(EV.cine){EV.cine.posFn=()=>new THREE.Vector3(x-Math.cos(ahead)*1.6+Math.sin(ahead)*.8,EV.lava.position.y+.7,z+Math.sin(ahead)*1.6+Math.cos(ahead)*.8);EV.cine.tgtFn=()=>new THREE.Vector3(x,EV.lava.position.y+.15,z);}
      if(EV.surf.me){const u2=EV.surf.me.userData;u2.armL.rotation.z=-2.5+Math.sin(EV.t*6)*.3;u2.armR.rotation.z=-2.5-Math.sin(EV.t*6)*.3;}
      if(!EV.said){EV.said=1;toast(S.petted?LX('🐾 <b>NEHUEN TO THE RESCUE!</b> He remembered your belly rubs, grabbed you and jumped on his surfboard!','🐾 <b>¡NEHUEN AL RESCATE!</b> Se acordó de tus cariños, te agarró y saltó a su tabla de surf.'):LX('🏄 Caniche and Nehuen: "SURF\'S UP!"','🏄 Caniche y Nehuen: "¡A SURFEAR!"'),false,5000);AU.sfx.voice(8,200);setTimeout(()=>AU.animal('dog'),500);}}
    if(EV.t>15&&EV.surf){EV.gt=(EV.gt||0)-dt;if(EV.gt<=0&&EV.ghosts.length<18){EV.gt=EV.ghosts.length<4?.05:.4+Math.random()*.4;const P2=EV.surf.g.position;spawnGhost(P2.x,EV.lava.position.y+.05,P2.z);}}
    if(EV.t>27&&!EV.over){EV.over=1;gameOverLava();}}
  for(let i=EV.ghosts.length-1;i>=0;i--){const g=EV.ghosts[i],u=g.userData.gh;u.t+=dt;g.position.y+=u.v*dt;g.position.x+=Math.sin(u.t*2+u.ph)*.15*dt;g.rotation.y+=dt*.6;
    const ud=g.userData;if(ud.armL){ud.armL.rotation.z=-2.4+Math.sin(u.t*3+u.ph)*.4;ud.armR.rotation.z=-2.4-Math.sin(u.t*3+u.ph)*.4;}
    u.mat.opacity=.62*Math.min(1,u.t/.8)*Math.max(0,1-u.t/9);if(u.t>9){Wd.scene.remove(g);g.traverse(o=>{if(o.isMesh)o.geometry.dispose();});u.mat.dispose();EV.ghosts.splice(i,1);}}
  for(let i=EV.blobs.length-1;i>=0;i--){const b=EV.blobs[i];b.userData.v.y-=4*dt;b.position.addScaledVector(b.userData.v,dt);if(b.position.y<(EV.lava?EV.lava.position.y:0)-.2||b.position.y<Wd.heightAt(b.position.x,b.position.z)-.1){Wd.scene.remove(b);b.geometry.dispose();b.material.dispose();EV.blobs.splice(i,1);}}
  for(let i=EV.smoke.length-1;i>=0;i--){const s=EV.smoke[i];s.userData.t+=dt;s.position.y+=s.userData.v*dt;s.position.x+=s.userData.dx*dt;s.scale.setScalar(.6+s.userData.t*1.2);s.material.opacity=Math.max(0,1-s.userData.t/8);if(s.userData.t>8){Wd.scene.remove(s);s.material.dispose();EV.smoke.splice(i,1);}}
}
function cineCamera(dt){const C=Wd.camera,E=EV.cine;document.body.classList.toggle('cine',!!E||mode==='finale');if(!E)return false;E.t+=dt;const p=E.posFn(E.t),q=E.tgtFn(E.t);C.position.lerp(p,1-Math.exp(-dt*2.5));
  const sh=EV.shake*.06;C.position.x+=(Math.random()-.5)*sh;C.position.y+=(Math.random()-.5)*sh;C.lookAt(q);Wd.controls.target.copy(q);if(E.t>=E.dur){EV.cine=null;return false;}return true;}
function gameOverLava(){
  const saved=!!S.petted;if(saved&&!EV.bonus){EV.bonus=1;S.score+=200;save();}
  openModal({title:saved?LX('NEHUEN SAVED YOU! 🐾','¡NEHUEN TE SALVÓ! 🐾'):LX('GAME OVER · COPAHUE ERUPTED!','FIN DEL JUEGO · ¡ERUPCIONÓ EL COPAHUE!'),
   meta:saved?LX('You petted him during the campaign, so he came back for you. Good boy! (+200)','Le hiciste cariño durante la campaña, así que volvió por ti. ¡Buen perro! (+200)'):LX('The lava flooded the whole valley. Caniche and Nehuen are fine: they are surfing. (Tip: be nice to Nehuen…)','La lava inundó todo el valle. Caniche y Nehuen están bien: están surfeando. (Pista: sé cariñoso con Nehuen…)'),col:saved?'#8ac926':'#ff4f3a',close:false,
   html:`<p style="font-size:15px">${saved?LX('You surfed the lava to safety with your cooler intact!','¡Surfeaste la lava hasta un lugar seguro con tu cooler intacto!'):''} ${LX('Your samples so far:','Tus muestras hasta ahora:')} <b>${S.samples.length}/${M.length}</b> · ${LX('Score','Puntaje')} <b>${S.score}</b></p>
    <div class="g-row"><button class="g-btn y" id="lv-cont" style="font-size:22px">${LX('↻ CONTINUE (clear the lava)','↻ CONTINUAR (limpiar la lava)')}</button><button class="g-btn r" id="lv-end" style="font-size:22px">${LX('■ FINISH','■ TERMINAR')}</button></div>`,
   init(){$('#lv-cont').onclick=()=>{closeModal();clearEruption();mode='play';S.quakeAt=S.t+QUAKE_AT;save();toast(LX('🌱 The valley cooled down. Back to sampling!','🌱 El valle se enfrió. ¡A seguir muestreando!'),false,3000);};
     $('#lv-end').onclick=()=>{closeModal();clearEruption();runFinale(()=>{S.quakeAt=S.t+QUAKE_AT;});};}});
}
function clearEruption(){if(EV.lava){Wd.scene.remove(EV.lava);EV.lava=null;}if(EV.surf){Wd.scene.remove(EV.surf.g);EV.surf=null;}EV.blobs.forEach(b=>Wd.scene.remove(b));EV.ghosts.forEach(g=>Wd.scene.remove(g));EV.ghosts=[];EV.smoke.forEach(s=>Wd.scene.remove(s));EV.blobs=[];EV.smoke=[];
  EV.st='calm';EV.t=0;EV.shake=0;EV.cine=null;EV.said=0;EV.over=0;EV.bonus=0;}
function quakeHUD(){if(EV.st==='quake')return ` · 🌋 ${LX('ERUPTION IN','ERUPCIÓN EN')} ${fmtMS(ERUPT_DELAY-EV.t)}`;return '';}

// ------------------------------------------------------------ first-person gear (js/fpgear.js)
function fpgHook(dt){if(!window.FPG)return;try{
  const E=ctx&&ctx.E,wm=(E&&E.m)||(modal&&modal.fpSite)||null;const site=wm?wm.c.replace('_','–'):(pl.carrySite||'').replace('_','–');
  let ph=null;const mm=wm||M.find(q=>q.c===pl.carrySite);if(mm&&mm.smp&&mm.smp.v&&mm.smp.v.pH!=null)ph=mm.smp.v.pH;else if(FPG.visible){try{ph=Wd.nearestRiver(pl.x,pl.z).ph;}catch(_){}}
  FPG.setChar(CHARS[charIdx]||CHARS[0]);if(pl.g&&!pl.g.userData.hands){pl.g.userData.hands=rollHands(charIdx);addTechProp(pl.g);}FPG.setHands(pl.g&&pl.g.userData.hands);
  if(window.FPW)try{FPW.update(dt,{fishZones:(fpgHook.fz=fpgHook.fz||M.filter(m=>m.c==='PT'||m.c==='LN').map(m=>[m.ax,m.az,2.4])),x:pl.inTruck?truck.x:pl.x,z:pl.inTruck?truck.z:pl.z,play:mode==='play'||mode==='finale',meters,roadPts,eggs:EGGS,found:eggsFound,night:WX.night});}catch(e){console.error('fpworld',e);}
  FPG.update(dt,{eye:eyeH(),fp:fpOn()&&!EV.cine,yaw:cam.yaw+cam.dragYaw,pitch:clamp(cam.fpPitch||0,-1.5,1.5),walk:pl.walk||0,moving:(pl.moveT||0)>0,running:!!pl.running,jy:pl.jy||0,
    carry:pl.carry,fill:pl.fill||0,filling:!modal&&!!(E&&E.hold&&K('KeyE')),canNear:!modal&&!!(E&&E.hold),nearQ:!modal&&!!(ctx&&ctx.Q&&ctx.Q.f),modal:modal&&modal.fp3d||null,panel:!!(modal&&$('#g-ov').classList.contains('fp3d')),site,ph,lang:LANG});
}catch(e){console.error('fpgear',e);}}
// ------------------------------------------------------------ UV-fluorescent minerals: a few rocks that glow at night; walk up to one to learn what it is
const MINS=[
 {n:['Fluorite','Fluorita'],c:'#7a5cff',r:'#9a8fb0',t:['Glows blue-violet under UV. The word "fluorescence" comes from this mineral.','Brilla azul violeta con luz UV. La palabra "fluorescencia" viene de este mineral.']},
 {n:['Hyalite opal','Ópalo hialita'],c:'#3dff6e',r:'#d8e6d0',t:['Glassy volcanic opal with traces of uranium: it shines neon green under UV.','Ópalo vítreo de origen volcánico con trazas de uranio: brilla verde neón con luz UV.']},
 {n:['Calcite','Calcita'],c:'#ff5a2a',r:'#e8dcc6',t:['With a little manganese it glows red-orange. It builds the travertine of hot springs.','Con un poco de manganeso brilla rojo anaranjado. Forma el travertino de las termas.']},
 {n:['Aragonite','Aragonito'],c:'#b6ff4a',r:'#efe8d8',t:['Hot spring carbonate that glows yellow-green and keeps shining a moment after the light goes off.','Carbonato de aguas termales que brilla verde amarillo y sigue brillando un momento al apagar la luz.']},
 {n:['Gypsum','Yeso (selenita)'],c:'#bfe8ff',r:'#f2efe8',t:['Grows where fumarole sulfur meets limestone; some crystals glow a pale blue-white.','Crece donde el azufre de las fumarolas toca roca calcárea; algunos cristales brillan blanco azulado.']},
 {n:['Scheelite','Scheelita'],c:'#5fd0ff',r:'#c9c2a8',t:['A tungsten ore: prospectors find it at night with UV lamps because it glows bright sky blue.','Mena de tungsteno: los buscadores la encuentran de noche con lámparas UV porque brilla celeste intenso.']},
 {n:['Willemite','Willemita'],c:'#2dff9a',r:'#b9a88a',t:['A zinc silicate famous for its vivid green fluorescence.','Silicato de zinc famoso por su fluorescencia verde intensa.']},
 {n:['Hackmanite','Hackmanita'],c:'#ff9a2a',r:'#d9d3e8',t:['Glows orange under UV and even changes colour in sunlight (tenebrescence).','Brilla naranja con luz UV y hasta cambia de color con el sol (tenebrescencia).']},
 {n:['Autunite','Autunita'],c:'#e8ff3a',r:'#c8c070',t:['Uranium phosphate that glows lemon yellow-green. Pretty, but look and do not touch!','Fosfato de uranio que brilla verde limón. Linda, pero se mira y no se toca.']}];
const MINERALS=[];let minTex=null;
function buildMinerals(){const toon=Wd.toon;minTex=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');const g=x.createRadialGradient(32,32,2,32,32,32);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.3,'rgba(255,255,255,.5)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);})();
  const sites=M.slice().sort(()=>Math.random()-.5).slice(0,10);  // only a few: one near ~10 of the sites
  sites.forEach((m,i)=>{let p=null;for(let k=0;k<40&&!p;k++){const a=Math.random()*6.283,r=.45+Math.random()*.6,x=m.ax+Math.cos(a)*r,z=m.az+Math.sin(a)*r;if(walkable(x,z)&&Wd.infoAt(x,z).dl>.12&&!inRiver(x,z,.05)&&Math.hypot(x-base.x,z-base.z)>.6)p=[x,z];}
    if(!p)return;const D=MINS[i%MINS.length],g=new THREE.Group();const y=Wd.heightAt(p[0],p[1]);g.position.set(p[0],y,p[1]);g.rotation.y=Math.random()*6.283;
    const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(.022,0),toon('#5a5560'));rock.scale.set(1.3,.6,1);rock.position.y=.006;g.add(rock);
    const mat=new THREE.MeshBasicMaterial({color:D.r});const xs=[];
    for(let k=0;k<6;k++){const cr=new THREE.Mesh(new THREE.OctahedronGeometry(.008+Math.random()*.005,0),mat);const a=k/6*6.283+Math.random()*.5,rr=.006+Math.random()*.012;
      cr.position.set(Math.cos(a)*rr,.016+Math.random()*.008,Math.sin(a)*rr);cr.scale.set(.55,1.6+Math.random()*.8,.55);cr.rotation.set((Math.random()-.5)*.8,Math.random()*3,(Math.random()-.5)*.8);g.add(cr);xs.push(cr);}
    const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:minTex,color:D.c,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));glow.position.y=.03;glow.scale.setScalar(.16);g.add(glow);
    Wd.scene.add(g);MINERALS.push({g,mat,glow,D,x:p[0],z:p[1],ph:Math.random()*6,seen:-1e9,base:new THREE.Color(D.r),hot:new THREE.Color(D.c)});});}
const _mc=new THREE.Color();
function updateMinerals(dt,t){if(!MINERALS.length)return;const n=WX.night,boost=window.REAL&&REAL.on?4.5:1.25;
  for(const o of MINERALS){const far=Math.hypot(o.x-pl.x,o.z-pl.z)>14;o.g.visible=!far;if(far)continue;
    const k=n*(.8+.2*Math.sin(t*1.7+o.ph));_mc.copy(o.base).lerp(o.hot,Math.min(1,n*1.4)).multiplyScalar(1+(boost-1)*k);o.mat.color.copy(_mc);
    o.glow.visible=n>.05;o.glow.material.opacity=k*.75;o.glow.scale.setScalar(.12+.05*k);
    if(mode==='play'&&!pl.inTruck&&n>.4&&S.t-o.seen>90&&Math.hypot(o.x-pl.x,o.z-pl.z)<.3){o.seen=S.t;const L=LANG==='es'?1:0;
      toast(`💎 <b>${o.D.n[L]}</b> · ${LX('UV-fluorescent mineral','mineral fluorescente con luz UV')}<br><small>${o.D.t[L]}</small>`,false,6500);try{AU.sfx.tada();}catch(_){}}}}
// ------------------------------------------------------------ main tick
function tick(dt,t){
  if(mode==='play'&&!modal&&!EV.cine)updatePlay(dt,t);
  if(modal&&modal.tick){if(WX.block&&modal.field&&!PK.is('gabriel')){AUX.pump=0;AUX.gurgle=0;}else modal.tick(dt);}
  updateWorldEnv(dt,mode==='play');
  updateModels(dt,t);fallTick(dt,t);if(mode!=='title')updateCrew(dt,t);updateBoat(dt,t);updateBathers(dt,t);updateEggs(dt,t);updateMinerals(dt,t);updateVillage(dt,t);updateVolcano(dt,t);if(!cineCamera(dt))updateCamera(dt);fpgHook(dt);updateHUD();drawMinimap();
  const E=Wd.infoAt(pl.x,pl.z),alt=meters(pl.inTruck?truck.g.position.y:Wd.heightAt(pl.x,pl.z));
  const filling=!modal&&ctx&&ctx.E&&ctx.E.hold&&K('KeyE');
  AU.update(dt,{water:Math.max(clamp(1-E.rv.d/1.1,0,1),E.dl<.8?clamp(1-E.dl/.8,0,1)*.45:0),crater:clamp(1-E.dc/4,0,1),vent:clamp(1-E.dc/1.5,0,1),wind:Math.max(clamp((alt-1800)/900,0,1)*.8+.12,WX.snow*.95),rain:WX.rainK,snow:WX.snow,boat:BOAT.near||0,finale:mode==='finale',drama:EV.st==='erupt'?2:EV.st==='quake'?1:0,quake:EV.shake,night:WX.night,alt,
    forest:E.n1>.47&&alt<2050,driving:pl.inTruck&&mode!=='title'&&!PK.animal(),speed:truck.speed,thr:K('KeyW')||K('ArrowUp')||joy.y>.2,offroad:roadDist(truck.x,truck.z)>.08,pump:AUX.pump,beater:AUX.beater,gurgle:filling||AUX.gurgle});
}

// ------------------------------------------------------------ modal framework
function openModal(o){modal=o;const ov=$('#g-ov');ov.classList.add('open');ov.classList.toggle('fp3d',!!(o.fp3d&&window.FPG&&FPG.can3d()));$('#g-modal').style.setProperty('--c',o.col||'#ffd23f');$('#g-mh').textContent=o.title;$('#g-mm').innerHTML=o.meta||'';$('#g-mb').innerHTML=o.html||'';$('#g-mx').style.display=o.close===false?'none':'';$('#g-mb').scrollTop=0;$('#g-modal').scrollTop=0;if(o.init)o.init();}
function closeModal(){const o=modal;modal=null;relock();AUX.pump=0;AUX.beater=0;AUX.gurgle=0;$('#g-ov').classList.remove('open','fp3d');for(const k in keys)keys[k]=false;if(o&&o.onclose)o.onclose();}
function enterPrimary(scope){const roots=[...document.querySelectorAll(scope)].filter(r=>r.offsetParent||getComputedStyle(r).position==='fixed');
  for(const r of roots){const bs=[...r.querySelectorAll('button.g-btn')].filter(b=>!b.disabled&&b.offsetParent!==null&&!/pump|lower|swap|empty|mx$/.test(b.id||''));if(!bs.length)continue;
    const b=bs.find(b=>b.classList.contains('t'))||bs.find(b=>/(ok|next|go|cont|store|new|n)$/i.test(b.id||''))||(bs.length===1?bs[0]:bs.find(b=>b.classList.contains('y')));if(b){b.click();return true;}}return false;}
function holdBtn(id,code){const el=document.getElementById(id);if(!el)return;el.addEventListener('pointerdown',e=>{e.preventDefault();keys[code]=true;el.classList.add('hold');});const up=()=>{keys[code]=false;el.classList.remove('hold');};['pointerup','pointerleave','pointercancel'].forEach(ev=>el.addEventListener(ev,up));}

// ------------------------------------------------------------ title / help
function showTitle(){
  mode='title';const sv=load();
  openModal({title:'COPAHUE FIELD CAMPAIGN',meta:'A Tiny World sampling game · Caviahue–Copahue volcanic system, Neuquén, Argentina',col:'#ffd23f',close:false,html:`
   <div class="g-grid"><div>
   <p><b>Your mission:</b> drive the lab's pickup along Route 26 to the real sampling sites of the Microbial Ecophysiology Lab, from the hyper-acidic <b>Crater Lake</b> of Copahue volcano down the <b>Río Agrio</b> to the freshwater controls near <b>Loncopué</b>.</p>
   <p>At every site: <b>walk 20 L of water</b> (two 10 L jerrycan trips) to your station, <b>dip the multiparameter probe</b> and wait for stable readings, then run <b>differential vacuum filtration</b>: first a <b>0.45 µm</b> flat membrane (particle-attached cells), then the filtrate through <b>0.22 µm</b> (free-living cells).</p>
   <p>The truck can't climb the volcano's loose ash: <b>hike</b> to the crater sites. When your cooler is full, return to the <b>MEL Field Base</b> in Caviahue and send everything for <b>Illumina shotgun metagenome sequencing</b>.</p>
   </div><div><div class="photo"><img id="g-tImg" alt="View from Copahue volcano"></div>
   <div class="ctl" style="margin-top:8px"><kbd>W A S D</kbd><span>drive / walk (arrows work too)</span><kbd>E</kbd><span>interact · hold to fill the jerrycan</span><kbd>Q</kbd><span>multiparameter probe</span><kbd>SPACE</kbd><span>pump / lower probe in the mini-games</span><kbd>SHIFT</kbd><span>jog (not while carrying water)</span><kbd>M</kbd><span>map view · <kbd>SHIFT+M</kbd> flying info map (🗺️) · <kbd>N</kbd> next target · <kbd>J</kbd> mission list</span><kbd>P</kbd><span>switch scientist (or the 👤 button)</span><kbd>U</kbd><span>sound: music + SFX / SFX only / off · <kbd>B</kbd> honk</span><kbd>🖱️</kbd><span>drag to look around · wheel to zoom</span></div></div></div>
   <div class="g-row"><button class="g-btn y" id="g-new" style="font-size:24px">▶ NEW CAMPAIGN</button><button class="g-btn" id="g-hof" style="font-size:24px">🏆 HALL OF FAME</button><button class="g-btn" id="g-tlang" style="font-size:20px">🌐 ESPAÑOL / ENGLISH</button>${sv&&Object.keys(sv.sites||{}).length?`<button class="g-btn t" id="g-cont" style="font-size:24px">↻ CONTINUE (${(sv.samples||[]).length} samples)</button>`:''}</div>
   <p class="note">Terrain, rivers, sites, probe readings (Metadata.xlsx) and metagenome results (2019 campaign, thesis data) are real; the mini-game mechanics and DNA yields are simulated.</p>`,
   init(){const im=$('#g-tImg');if(window.WORLD&&Wd.PHOTOS&&Wd.PHOTOS.VIEW)im.src=Wd.PHOTOS.VIEW;else im.parentNode.style.display='none';
     $('#g-hof').onclick=()=>{const back=()=>setTimeout(showTitle,0);openHall();const o=modal;o.onclose=((f)=>()=>{f&&f();back();})(o.onclose);};
     $('#g-tlang').onclick=()=>setLang(LANG==='es'?'en':'es');
     $('#g-new').onclick=()=>{S.sites={};S.samples=[];S.score=0;S.t=0;S.shipped=false;S.target=null;S.quakeAt=QUAKE_AT;S.petted=false;clearEruption();clearKits();resetPositions();save();openPicker(start);};
     const c=$('#g-cont');if(c)c.onclick=()=>{Object.assign(S,{sites:sv.sites||{},samples:sv.samples||[],score:sv.score||0,t:sv.t||0,shipped:!!sv.shipped,quakeAt:Math.max(sv.quakeAt||QUAKE_AT,(sv.t||0)+60),petted:!!sv.petted});clearEruption();clearKits();(sv.kits||[]).forEach(k=>addKit(k[0],k[1]));resetPositions();openPicker(start);};}});
}
function start(){closeModal();mode='play';AU.init();setTimeout(()=>setCharacter(charIdx),900);setTimeout(()=>AU.sfx.voice(10,170),300);buildMissionList();toast('🛻 Welcome to Caviahue! Pick a site from the <b>MISSION</b> list (or follow the arrow). Hike sites 🥾 are on the volcano.',false,5000);}
function showHelp(){if(modal&&modal.help){closeModal();return;}
  const K=(k,en,es)=>`<tr><td style="width:44%;padding:3px 10px 3px 0;vertical-align:top;line-height:1.7">${k.split(' ').map(x=>x==='/'||x==='+'?x:`<kbd>${x}</kbd>`).join(' ')}</td><td style="padding:3px 0">${LX(en,es)}</td></tr>`;
  const H=(en,es)=>`<tr><td colspan="2" style="padding:10px 0 3px;font-family:Bangers,sans-serif;font-size:18px;letter-spacing:.5px;color:#1d1a2b">${LX(en,es)}</td></tr>`;
  openModal({help:true,title:LX('COMMANDS & HELP','COMANDOS Y AYUDA'),meta:LX('Press <kbd>H</kbd> or <kbd>Esc</kbd> to close','Pulsa <kbd>H</kbd> o <kbd>Esc</kbd> para cerrar'),col:'#00bbf9',key:c=>{if(c==='KeyH')closeModal();},html:`
 <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:4px 26px;font-size:14px;line-height:1.3">
 <table style="border-collapse:collapse;width:100%;table-layout:fixed">
  ${H('Moving','Moverse')}
  ${K('W A S D ↑ ↓ ← →','Walk / drive','Caminar / manejar')}
  ${K('Space','Jump (on foot)','Saltar (a pie)')}
  ${K('Shift','Turbo (in a vehicle)','Turbo (en vehículo)')}
  ${K('B','Horn','Bocina')}
  ${K('Click','Capture the mouse to look around (Esc releases it)','Capturar el mouse para mirar (Esc lo suelta)')}
  ${H('Camera & view','Cámara y vista')}
  ${K('V','First / third person','Primera / tercera persona')}
  ${K('C','Reset camera','Reiniciar cámara')}
  ${K('M','Map view','Vista de mapa')}
  ${K('Shift + M','Explore mode','Modo explorar')}
  ${K('O','Realistic / comic look','Look realista / cómic')}
  ${K('G','Graphics quality','Calidad gráfica')}
  ${K('K','Photo mode','Modo foto')}
 </table>
 <table style="border-collapse:collapse;width:100%;table-layout:fixed">
  ${H('Sampling','Muestreo')}
  ${K('E','Get in/out of the truck, fill and pour the jerrycan (hold), filter','Subir/bajar de la camioneta, llenar y vaciar el bidón (mantener), filtrar')}
  ${K('Q','Multiparameter probe','Sonda multiparamétrica')}
  ${K('Space','Lower the probe / pump the vacuum (hold)','Bajar la sonda / bombear vacío (mantener)')}
  ${K('R','Swap a clogged membrane','Cambiar membrana tapada')}
  ${K('F','Empty the flask','Vaciar el matraz')}
  ${K('Enter','Main button of any window','Botón principal de cualquier ventana')}
  ${H('Game','Juego')}
  ${K('N','Next sampling site','Siguiente sitio de muestreo')}
  ${K('J / Tab','Collapse the mission list','Minimizar la lista de misiones')}
  ${K('P','Next character','Siguiente personaje')}
  ${K('L','New look','Nuevo look')}
  ${K('U','Sound level','Nivel de sonido')}
  ${K('H','This help','Esta ayuda')}
  ${K('Esc','Close windows','Cerrar ventanas')}
 </table></div>
 <div style="margin-top:12px;padding-top:8px;border-top:2px dashed #1d1a2b55;font-size:13.5px">
 <b>${LX('How to sample','Cómo muestrear')}</b>
 <ol style="margin:4px 0 0;padding-left:20px">
 <li>${LX('<b>Drive</b> close to a beacon 📍. Park and press <kbd>E</kbd> to get out. If the truck is more than ~1.8 km away (e.g. on the volcano), a portable kit is set up where you arrive.','<b>Maneja</b> hasta una baliza 📍. Estaciona y pulsa <kbd>E</kbd> para bajarte. Si la camioneta queda a más de ~1,8 km (p. ej. en el volcán), se arma un kit portátil donde llegues.')}</li>
 <li>${LX('At the beacon <b>hold</b> <kbd>E</kbd> to fill the 10 L jerrycan, walk to the station (truck tailgate or kit) and press <kbd>E</kbd> to pour. Twice → 20 L.','En la baliza <b>mantén</b> <kbd>E</kbd> para llenar el bidón de 10 L, camina a la estación (pick-up o kit) y pulsa <kbd>E</kbd> para vaciarlo. Dos veces → 20 L.')}</li>
 <li>${LX('At the beacon press <kbd>Q</kbd>: lower the probe with <kbd>SPACE</kbd>, keep it in the green depth band until readings stabilise, then <b>RECORD</b>.','En la baliza pulsa <kbd>Q</kbd>: baja la sonda con <kbd>ESPACIO</kbd>, mantenla en la franja verde hasta que se estabilice y <b>REGISTRA</b>.')}</li>
 <li>${LX('At the station press <kbd>E</kbd>: hold <kbd>SPACE</kbd> to pump, keep the vacuum gauge in the green. Swap clogged membranes <kbd>R</kbd>, empty the flask <kbd>F</kbd>. 20 L through 0.45 µm, then the filtrate through 0.22 µm.','En la estación pulsa <kbd>E</kbd>: mantén <kbd>ESPACIO</kbd> para bombear con el vacío en verde. Cambia membranas tapadas con <kbd>R</kbd>, vacía el matraz con <kbd>F</kbd>. 20 L por 0,45 µm y luego el filtrado por 0,22 µm.')}</li>
 <li>${LX('Back at the <b>MEL Field Base</b> (Caviahue): extract DNA, build libraries and sequence on the Illumina.','De vuelta en la <b>Base MEL</b> (Caviahue): extrae ADN, prepara librerías y secuencia en el Illumina.')}</li></ol></div>`});}

// ------------------------------------------------------------ PROBE mini-game
function openProbe(m){
  const real=m.smp?m.smp.v:{};const cur={};PROBE.forEach(p=>cur[p[0]]=p[0]==='pH'?7:p[0]==='Temp.[ºC]'?8:0);
  let depth=0,stab=0,sed=0,tt=0,done=false;const air=()=>depth<8;
  openModal({field:true,fp3d:'probe',fpSite:m,title:'MULTIPARAMETER PROBE',meta:`${m.c.replace('_','–')} · ${m.en} · ${HAB_EN[m.s.hab]}`,col:'#8ac926',html:`
   <div class="g-grid"><div>
    <svg viewBox="0 0 220 250" style="width:100%;max-height:300px;border:3px solid #1d1a2b;border-radius:8px;background:#e8f4ff">
     <rect x="0" y="40" width="220" height="210" fill="${m.col}" opacity=".35"/><path d="M0 40 Q55 32 110 40 T220 40" fill="none" stroke="#1d1a2b" stroke-width="3"/>
     <rect x="0" y="206" width="220" height="44" fill="#8a7a66"/><path d="M0 206 q20 -6 40 0 t40 0 t40 0 t40 0 t40 0 t40 0" fill="none" stroke="#1d1a2b" stroke-width="3"/>
     <rect id="pb-band" x="4" y="0" width="212" height="0" fill="#8ac926" opacity=".35" stroke="#1d1a2b" stroke-dasharray="5 4" stroke-width="2"/>
     <line id="pb-cab" x1="110" y1="0" x2="110" y2="10" stroke="#1d1a2b" stroke-width="3"/>
     <g id="pb-probe"><rect x="98" y="-60" width="24" height="60" rx="6" fill="#2b2b2b" stroke="#1d1a2b" stroke-width="3"/><rect x="100" y="-14" width="20" height="10" fill="#ffd23f"/><circle cx="110" cy="2" r="5" fill="#3a86ff" stroke="#1d1a2b" stroke-width="2"/></g>
     <text x="8" y="232" font-family="Bangers" font-size="16" fill="#fff">SEDIMENT</text><text id="pb-dt" x="212" y="24" text-anchor="end" font-family="Bangers" font-size="18" fill="#1d1a2b">0 cm</text></svg>
    <div class="g-row"><button class="g-btn y" id="pb-lower">⬇ HOLD TO LOWER (SPACE)</button><button class="g-btn t" id="pb-rec" disabled>● RECORD (E)</button></div>
    <div class="note">Keep the sensor tip in the green band (15–55 cm): fully submerged but off the sediment. Stirring up the bottom ruins the turbidity and resets stabilisation.</div>
   </div><div>
    <div class="lcd"><div class="hdr"><span>SONDE · ${m.c}</span><span id="pb-st">IN AIR</span></div><div id="pb-lcd"></div></div>
    <div style="margin-top:8px;font-weight:700;font-size:12.5px">Stabilisation</div><div class="meter"><i id="pb-m" style="width:0%"></i><span id="pb-ms">0%</span></div>
    <p class="note">${m.smp?`Readings are the lab's real values for this site (${m.smp.name}, ${m.smp.date||m.smp.year}).`:'No probe record exists for this site.'}</p>
   </div></div>`,
   init(){holdBtn('pb-lower','Space');$('#pb-rec').onclick=record;},
   key(c){if(c==='KeyE'||c==='Enter')record();},
   tick(dt){if(done)return;tt+=dt;
     const d0=depth;if(K('Space'))depth+=32*dt;else depth-=11*dt;depth=clamp(depth,0,72);if(d0<8&&depth>=8)AU.sfx.splash();
     if(depth>62&&sed<=0){sed=2.2;stab=0;AU.sfx.stamp();toast('💥 You hit the sediment! Turbidity spiked — lift the probe and wait.',true,2000);}
     sed=Math.max(0,sed-dt);const inBand=depth>=15&&depth<=55&&sed<=0;
     const s0=stab;stab=clamp(stab+(inBand?26:-18)*dt,0,100);if(s0<100&&stab>=100)AU.sfx.ping();
     const k=air()?.6:inBand?2.4:1;
     PROBE.forEach(([key])=>{let tgt=real[key];if(tgt===undefined)tgt=0;if(air()){tgt=key==='pH'?7+Math.sin(tt*3)*1.5:key==='Temp.[ºC]'?9:key==='D.O.[%]'?100:0;}
       if(key==='Turb.FNU'&&sed>0)tgt=(real[key]||0)+900*sed;
       const noise=(1-stab/100)*(Math.abs(tgt)*.06+.05)*(Math.random()-.5)*2;cur[key]+=((tgt-cur[key])*Math.min(1,k*dt))+noise*dt*6;});
     // draw
     const py=40+depth*2.3;$('#pb-probe').setAttribute('transform',`translate(0,${py})`);$('#pb-cab').setAttribute('y2',py-60);
     const b=$('#pb-band');b.setAttribute('y',40+15*2.3);b.setAttribute('height',40*2.3);$('#pb-dt').textContent=Math.round(depth)+' cm';
     $('#pb-lcd').innerHTML=PROBE.map(([key,n,u,d])=>`<div class="ln"><span>${n}</span><span>${real[key]===undefined&&!air()?'--':fmtV(cur[key],d)} ${u}</span></div>`).join('');
     $('#pb-m').style.width=stab+'%';$('#pb-ms').textContent=stab>=100?'STABLE ✔':Math.round(stab)+'%';$('#pb-m').style.background=stab>=100?'#8ac926':'#2ec4b6';
     $('#pb-st').textContent=air()?'IN AIR':sed>0?'!! TURBID':inBand?(stab>=100?'STABLE':'SETTLING…'):depth>55?'TOO DEEP':'TOO SHALLOW';
     $('#pb-rec').disabled=stab<100;
     if(window.FPG){const R3=[['pH','pH',2],['Temp.[ºC]','T°C',1],['EC[µS/cm]','EC',0],['ORP[mV]','ORP',0],['D.O.[%]','OD%',0]].filter(r=>real[r[0]]!==undefined||air()).slice(0,5);
       FPG.probe={depth,stab,sed,air:air(),st:$('#pb-st').textContent,rows:R3.map(r=>[r[1],real[r[0]]===undefined&&!air()?'--':fmtV(cur[r[0]],r[2])])};}}
  });
  function record(){if(done||stab<100)return;if(PK.is('simon')&&!m._sbk&&Math.random()<.6){m._sbk=1;stab=0;AU.sfx.tear();toast(LX('💥 CRACK! Simón knocked the probe against the rocks and cracked the pH sensor. Swapping in the spare… wait for stable readings again.','💥 ¡CRACK! Simón golpeó la sonda contra las rocas y quebró el sensor de pH. Poniendo el de repuesto… espera otra vez a que se estabilice.'),true,4200);return;}done=true;const s=st(m.c);s.probe={v:Object.assign({},real),t:tt,sample:m.smp?m.smp.name:null};
    const pts=Math.max(20,Math.round(60-tt*2));S.score+=pts;tada();closeModal();stamp('RECORDED!',`probe data logged · +${pts}`);checkDone(m);save();buildMissionList();}
}

// ------------------------------------------------------------ FILTRATION mini-game
function openFilter(m,where){
  const turb=(m.smp&&m.smp.v['Turb.FNU'])||5;
  const pw=PK.is('tito')||PK.is('priscilla');const ST=[{pore:'0.45 µm',frac:'particle-attached fraction',clogL:pw?0:Math.max(.075,.02+turb/9000),col:'#ff9f1c'},{pore:'0.22 µm',frac:'free-living fraction',clogL:pw?0:Math.max(.07,.03+turb/60000),col:'#3a86ff'}];
  let si=0,vac=0,clog=0,vol=0,flask=0,memb=[1,0],rupt=0,swapNeeded=false,over=0,tt=0,fin=false;const FL=10;
  openModal({field:true,fp3d:'filter',fpSite:m,title:'DIFFERENTIAL VACUUM FILTRATION',meta:`${m.c.replace('_','–')} · ${m.en} · ${where==='truck'?(LANG==='es'?'bomba eléctrica en la pickup':'electric pump at the truck tailgate'):(LANG==='es'?'bomba de vacío manual (kit portátil)':'hand vacuum pump (portable kit)')} · turbidity ${fmtV(turb,1)} FNU`,col:'#00bbf9',html:`
   <div class="steps"><span id="fs0" class="on">1 · 0.45 µm — particle-attached</span><span id="fs1">2 · 0.22 µm — free-living</span><span id="fs2">3 · store membranes</span></div>
   <div class="g-grid"><div>
    <svg viewBox="0 0 300 250" style="width:100%;max-height:310px;border:3px solid #1d1a2b;border-radius:8px;background:#fffdf5">
     <!-- source carboy -->
     <rect x="14" y="60" width="62" height="150" rx="10" fill="#fff" stroke="#1d1a2b" stroke-width="3"/><clipPath id="fcl"><rect x="16" y="62" width="58" height="146" rx="8"/></clipPath>
     <rect id="f-src" clip-path="url(#fcl)" x="16" y="62" width="58" height="146" fill="${m.col}" opacity=".6"/><rect x="34" y="46" width="22" height="16" fill="#fff" stroke="#1d1a2b" stroke-width="3"/>
     <text id="f-srct" x="45" y="228" text-anchor="middle" font-family="Bangers" font-size="14">20 L</text><text id="f-srcn" x="45" y="243" text-anchor="middle" font-family="Comic Neue" font-weight="700" font-size="10">sample</text>
     <path d="M56 50 C 90 20, 120 20, 150 44" fill="none" stroke="#1d1a2b" stroke-width="4"/>
     <!-- funnel + membrane -->
     <path d="M118 44 L182 44 L172 92 L128 92 Z" fill="#e8f4ff" stroke="#1d1a2b" stroke-width="3"/>
     <rect id="f-fun" x="124" y="70" width="52" height="20" fill="${m.col}" opacity=".5"/>
     <rect id="f-mem" x="126" y="92" width="48" height="7" fill="#fff" stroke="#1d1a2b" stroke-width="2.5"/>
     <text id="f-pore" x="150" y="36" text-anchor="middle" font-family="Bangers" font-size="15">0.45 µm</text>
     <rect x="143" y="99" width="14" height="22" fill="#ddd" stroke="#1d1a2b" stroke-width="2.5"/>
     <!-- flask -->
     <path d="M140 121 L160 121 L160 140 L196 222 Q198 230 190 230 L110 230 Q102 230 104 222 L140 140 Z" fill="#fff" stroke="#1d1a2b" stroke-width="3"/>
     <clipPath id="ffl"><path d="M140 121 L160 121 L160 140 L196 222 Q198 230 190 230 L110 230 Q102 230 104 222 L140 140 Z"/></clipPath>
     <rect id="f-flk" clip-path="url(#ffl)" x="100" y="230" width="100" height="0" fill="#bfe9ff"/><text id="f-flt" x="150" y="245" text-anchor="middle" font-family="Bangers" font-size="13">receiver 0/10 L</text>
     <path d="M160 132 L220 132 L220 170" fill="none" stroke="#1d1a2b" stroke-width="4"/>
     <!-- gauge -->
     <circle cx="252" cy="190" r="36" fill="#fff" stroke="#1d1a2b" stroke-width="3"/>
     <path id="f-gz" fill="none" stroke="#8ac926" stroke-width="9"/><path id="f-gr" fill="none" stroke="#ff4f3a" stroke-width="9"/>
     <line id="f-nd" x1="252" y1="190" x2="252" y2="160" stroke="#1d1a2b" stroke-width="4" stroke-linecap="round"/><circle cx="252" cy="190" r="5" fill="#1d1a2b"/>
     <text x="252" y="243" text-anchor="middle" font-family="Bangers" font-size="13" id="f-gt">0.00 bar</text>
     <rect x="228" y="120" width="48" height="26" rx="5" fill="${where==='truck'?'#ff4f3a':'#ffd23f'}" stroke="#1d1a2b" stroke-width="3"/><text x="252" y="138" text-anchor="middle" font-family="Bangers" font-size="13" fill="#1d1a2b">PUMP</text>
     <text id="f-warn" x="150" y="16" text-anchor="middle" font-family="Bangers" font-size="15" fill="#ff4f3a"></text>
    </svg>
   </div><div>
    <div class="kv" style="margin-bottom:6px"><span>Stage</span><b id="f-stg"></b><span>Filtered</span><b id="f-vol"></b><span>Membrane clogging</span><b id="f-clg"></b><span>Membranes used</span><b id="f-mb"></b><span>Ruptures</span><b id="f-rp">0</b></div>
    <div class="fp3donly vacbar"><b>VACUUM</b><div class="vb"><i id="f-vbn"></i></div><span id="f-vbt">−0.00 bar</span></div>
    <div class="meter"><i id="f-vm" style="width:0%;background:#3a86ff"></i><span id="f-vms">0 / 20 L</span></div>
    <div class="g-row"><button class="g-btn y" id="f-pump">⛽ HOLD TO PUMP (SPACE)</button><button class="g-btn" id="f-swap">⟳ SWAP MEMBRANE (R)</button><button class="g-btn" id="f-empty">⤓ EMPTY FLASK (F)</button></div>
    <div class="g-row" id="f-next"></div>
    <p class="note"><b>Differential filtration:</b> the whole 20 L goes through a 0.45 µm membrane first; it traps cells attached to particles and bigger organisms. The filtrate is kept and pushed through 0.22 µm to catch the smaller, free-living bacteria and archaea. Keep vacuum between −0.35 and −0.70 bar: too weak and nothing flows, too strong and the membrane tears.</p>
   </div></div>`,
   init(){holdBtn('f-pump','Space');$('#f-swap').onclick=swap;$('#f-empty').onclick=empty;gaugeArcs();},
   key(c){if(c==='KeyR')swap();if(c==='KeyF')empty();if((c==='KeyE'||c==='Enter')&&fin)store();},
   tick(dt){if(fin){AUX.pump=0;AUX.gurgle=0;if(window.FPG&&FPG.filt){FPG.filt.fin=true;FPG.filt.q=0;FPG.filt.pumping=false;}return;}tt+=dt;const S2=ST[si];
     AUX.pump=(K('Space')&&!swapNeeded)?(where==='truck'?1:2):0;
     if(K('Space')&&!swapNeeded)vac+=(where==='truck'?.6:.48)*dt*(1+vac*.5);else vac-=.22*dt;vac=clamp(vac,0,1);
     let warn='';
     if(vac>.84&&!swapNeeded){over+=dt;if(over>.25){rupt++;S.score=Math.max(0,S.score-15);swapNeeded=true;vac=0;AU.sfx.tear();toast('💥 RIIIP! Too much vacuum — the membrane tore. Swap it (R) and pump gently.',true,3000);vol=Math.max(0,vol-1);}}else over=0;
     if(PK.is('simon')&&!swapNeeded&&K('Space')&&vol>1&&Math.random()<dt*.09){rupt++;S.score=Math.max(0,S.score-15);swapNeeded=true;vac=0;vol=Math.max(0,vol-1);AU.sfx.tear();toast(LX((a=>a[Math.floor(Math.random()*a.length)])(['💥 CRASH! Simón elbowed the filter holder and cracked the glass funnel. New membrane (R)!','💥 CRACK! Simón dropped the forceps right through the membrane. Swap it (R)!','💥 CLINK! Simón knocked the Kitasato flask over. Clean up and put a new membrane (R).']),(a=>a[Math.floor(Math.random()*a.length)])(['💥 ¡CRASH! Simón le pegó con el codo al portafiltro y quebró el embudo de vidrio. ¡Membrana nueva (R)!','💥 ¡CRACK! A Simón se le cayó la pinza justo encima de la membrana. ¡Cámbiala (R)!','💥 ¡CLINK! Simón botó el matraz Kitasato. Limpia y pon una membrana nueva (R).'])),true,3800);}
     let q=0;
     if(!swapNeeded&&flask<FL){q=Math.max(0,vac-.12)*3.4*Math.pow(1-clog,1.2)*((PK.is('tito')||PK.is('priscilla'))?4:1);q=Math.min(q,(VOL-vol)/Math.max(dt,1e-3)+.01,(FL-flask)/Math.max(dt,1e-3));}
     AUX.gurgle=q>.05;vol+=q*dt;flask+=q*dt;if(VOL-vol<.03&&q>0)vol=VOL;clog=clamp(clog+S2.clogL*q*dt,0,1);
     if(swapNeeded)warn='TORN MEMBRANE — SWAP (R)';else if(clog>.92)warn='MEMBRANE CLOGGED — SWAP (R)';else if(flask>=FL-.01)warn='FLASK FULL — EMPTY IT (F)';else if(vac>.7)warn='TOO MUCH VACUUM!';else if(clog>.6)warn='flow dropping — swap soon (R)';else if(vac<.35&&K('Space'))warn='building vacuum…';
     if(vol>=VOL-1e-6&&!swapNeeded){ // stage complete
       if(si===0){si=1;vol=0;clog=0;vac=0;flask=0;memb[1]=1;tada();toast('✅ 20 L through 0.45 µm. The filtrate goes back into a clean carboy for the <b>0.22 µm</b> stage.',false,3500);$('#fs0').className='ok';$('#fs1').className='on';}
       else{fin=true;$('#fs1').className='ok';$('#fs2').className='on';tada();
         $('#f-next').innerHTML=`<button class="g-btn t" id="f-store" style="font-size:22px">❄ FOLD MEMBRANES INTO CRYOVIALS &amp; STORE (E)</button>`;$('#f-store').onclick=store;}}
     // draw
     const srcL=VOL-vol;$('#f-src').setAttribute('y',62+146*(1-srcL/VOL));$('#f-srct').textContent=srcL.toFixed(1)+' L';$('#f-srcn').textContent=si===0?'raw sample':'0.45 filtrate';
     $('#f-fun').setAttribute('opacity',q>0?.55:.15);
     const cc=Math.round(255-clog*150),cg=Math.round(255-clog*175),cb=Math.round(255-clog*215);$('#f-mem').setAttribute('fill',swapNeeded?'#ff4f3a':`rgb(${cc},${cg},${cb})`);
     $('#f-pore').textContent=ST[si].pore+' membrane';
     const fh=110*flask/FL;$('#f-flk').setAttribute('y',230-fh);$('#f-flk').setAttribute('height',fh);$('#f-flt').textContent=`receiver ${flask.toFixed(1)}/10 L`;
     const a=(-120+vac*240)*Math.PI/180;$('#f-nd').setAttribute('x2',252+Math.sin(a)*28);$('#f-nd').setAttribute('y2',190-Math.cos(a)*28);$('#f-gt').textContent='−'+vac.toFixed(2)+' bar';
     $('#f-warn').textContent=warn;{const n=$('#f-vbn');if(n){n.style.left=(vac*100)+'%';const t=$('#f-vbt');t.textContent='−'+vac.toFixed(2)+' bar'+(warn?' · '+warn:'');t.style.color=vac>.7||swapNeeded?'#ff4f3a':vac>=.35?'#2b8a1e':'#1d1a2b';}}
     $('#f-stg').textContent=`${ST[si].pore} · ${ST[si].frac}`;$('#f-vol').textContent=vol.toFixed(1)+' / '+VOL+' L';$('#f-clg').textContent=Math.round(clog*100)+'%';
     $('#f-mb').textContent=`${memb[0]} × 0.45 · ${memb[1]} × 0.22`;$('#f-rp').textContent=rupt;
     if(window.FPG)FPG.filt={si,vac,vol,flask,clog,swapNeeded,q,memb:memb.slice(),fin,where,warn,pumping:K('Space')&&!swapNeeded,VOL,FL,ph:m.smp&&m.smp.v?m.smp.v.pH:null};
     $('#f-vm').style.width=(vol/VOL*100)+'%';$('#f-vm').style.background=ST[si].col;$('#f-vms').textContent=`${vol.toFixed(1)} / ${VOL} L`;}
  });
  function gaugeArcs(){const arc=(a0,a1)=>{const p=a=>[252+Math.sin(a*Math.PI/180)*30,190-Math.cos(a*Math.PI/180)*30];const s=p(a0),e=p(a1);return `M${s[0]} ${s[1]} A30 30 0 0 1 ${e[0]} ${e[1]}`;};
    $('#f-gz').setAttribute('d',arc(-120+.35*240,-120+.7*240));$('#f-gr').setAttribute('d',arc(-120+.84*240,120));}
  function swap(){if(fin)return;if(!swapNeeded&&clog<.15){toast('This membrane is still fine — swap only when it clogs.',true,1800);return;}memb[si]++;clog=0;vac=0;swapNeeded=false;AU.sfx.click();toast(`New ${ST[si].pore} membrane placed with sterile forceps; the used one goes into a labelled cryovial.`,false,2200);}
  function empty(){if(fin)return;if(flask<.3)return;flask=0;AU.sfx.pour();}
  function store(){if(!fin)return;fin=false;const s=st(m.c);s.filt={m045:memb[0],m022:memb[1],rupt,t:tt};const pts=Math.max(30,Math.round(120-tt-rupt*20));S.score+=pts;closeModal();stamp('FILTERED!',`${memb[0]}× 0.45 µm + ${memb[1]}× 0.22 µm on dry ice · +${pts}`);checkDone(m);save();buildMissionList();}
}

function checkDone(m){const s=st(m.c);if(s.done||!s.probe||!s.filt)return;s.done=true;S.score+=100;
  S.samples.push({c:m.c,en:m.en,hab:m.s.hab,probe:s.probe,filt:s.filt,t:S.t});save();
  setTimeout(()=>{stamp('SAMPLE SECURED!',`${m.c.replace('_','–')} · ${m.en} · +100`);tada();},1800);
  setTimeout(()=>showSiteCard(m),3400);
  if(S.target===m)S.target=null;
}
function showSiteCard(m){
  if(modal)return;const s=st(m.c);const ph=Wd.PHOTOS&&Wd.PHOTOS[m.c];const v=s.probe.v;
  const all=M.every(q=>st(q.c).done);
  openModal({title:m.c.replace('_','–')+' · '+m.en,meta:HAB_EN[m.s.hab]+' · sample in the cooler',col:m.col,html:`<div class="g-grid"><div>${ph?`<div class="photo"><img src="${ph}" alt="${m.en}"></div>`:''}</div><div>
    <h4>FIELD NOTEBOOK</h4><div class="kv">${PROBE.filter(p=>v[p[0]]!==undefined).map(p=>`<span>${p[1]}</span><b>${fmtV(v[p[0]],p[3])} ${p[2]}</b>`).join('')}</div>
    <h4>FILTERS</h4><div class="kv"><span>0.45 µm membranes</span><b>${s.filt.m045}</b><span>0.22 µm membranes</span><b>${s.filt.m022}</b><span>Ruptures</span><b>${s.filt.rupt}</b></div>
    <p class="note">${all?'<b>All sites sampled!</b> Head back to the MEL Field Base in Caviahue to send everything for sequencing.':'Next: pick another site from the mission list.'}</p></div></div>
    <div class="g-row"><button class="g-btn y" id="g-ok">KEEP GOING ➜</button></div>`,init(){$('#g-ok').onclick=closeModal;},onclose(){if(all)S.target='base';buildMissionList();}});
}

// ------------------------------------------------------------ HALL OF FAME (shared, persistent: artifact db)
let DBP=null;
function getDB(){return Promise.resolve(null);}
const num=(v,a,b)=>{v=Number(v);return isFinite(v)?clamp(v,a,b):a;};
function calcRun(lysis,pcr){
  const ss=S.samples;const avg=f=>ss.length?ss.reduce((a,s)=>a+f(s),0)/ss.length:0;
  const filtQ=Math.round(avg(s=>clamp(100-(s.filt.rupt||0)*22-Math.max(0,(s.filt.t||0)-30)*.6,0,100)));
  const probeQ=Math.round(avg(s=>clamp(100-Math.max(0,((s.probe&&s.probe.t)||0)-8)*3,0,100)));
  const seqQ=Math.round((lysis*.5+pcr*.5)*100);
  return {score:S.score,sites:ss.length,total:M.length,time:Math.round(S.t),filtQ,probeQ,seqQ,rupt:ss.reduce((a,s)=>a+(s.filt.rupt||0),0),ch:charIdx,at:new Date().toISOString().slice(0,10)};
}
function boardHTML(rows,mine){
  if(!rows.length)return '<p class="note">No campaigns yet — be the first on the board!</p>';
  const td='style="border:1.5px solid #1d1a2b;padding:3px 6px;text-align:right"',th='style="border:1.5px solid #1d1a2b;padding:3px 6px;background:#ffd23f;font:15px Bangers,Impact;letter-spacing:.03em"';
  return `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px;background:#fff"><thead><tr><th ${th}>#</th><th ${th}>Scientist</th><th ${th}>Score</th><th ${th}>Sites</th><th ${th}>Time</th><th ${th} title="Filtration quality">Filtr.</th><th ${th} title="Probe quality">Probe</th><th ${th} title="Extraction + library quality">Seq.</th><th ${th}>Date</th></tr></thead><tbody>${rows.map((r,i)=>{const d=r.d;const me=r.id===mine;
    const pic=(d.ch>=0&&d.ch<PORTRAITS.length)?`<img src="${PORTRAITS[d.ch|0]}" alt="" style="width:22px;height:26px;object-fit:cover;border:1.5px solid #1d1a2b;border-radius:4px;vertical-align:middle;margin-right:5px">`:'';
    return `<tr style="${me?'background:#c9f7d8;font-weight:700':''}"><td ${td}>${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</td><td style="border:1.5px solid #1d1a2b;padding:3px 6px;white-space:nowrap">${pic}${esc(String(d.name||'Anonymous').slice(0,24))}${me?' ← you':''}</td><td ${td}><b>${num(d.score,0,1e6)|0}</b></td><td ${td}>${num(d.sites,0,99)|0}/${num(d.total,0,99)|0}</td><td ${td}>${fmtT(num(d.time,0,1e7))}</td><td ${td}>${num(d.filtQ,0,100)|0}%</td><td ${td}>${num(d.probeQ,0,100)|0}%</td><td ${td}>${num(d.seqQ,0,100)|0}%</td><td ${td}>${esc(String(d.at||'').slice(0,10))}</td></tr>`;}).join('')}</tbody></table></div>`;
}
// subscribe the board inside element `el`; returns an unsubscribe
async function mountBoard(el,getMine){
  const db=await getDB();
  if(!db){let loc=[];try{loc=JSON.parse(localStorage.getItem('cfc_local_board')||'[]');}catch(e){}
    el.innerHTML='<p class="note">Your best runs, saved in this browser:</p>'+boardHTML(loc.sort((a,b)=>b.d.score-a.d.score).slice(0,20),getMine());return ()=>{};}
  el.innerHTML='<p class="note">Loading the lab ranking…</p>';
  try{return db.collection('scores').orderBy('score','desc').limit(25).onSnapshot(sn=>{el.innerHTML=boardHTML(sn.docs.filter(d=>d.exists).map(d=>({id:d.id,d:d.data()})),getMine());},
    e=>{el.innerHTML='<p class="note">The ranking is unavailable right now.</p>';});}catch(e){el.innerHTML='<p class="note">The ranking is unavailable right now.</p>';return ()=>{};}
}
async function submitRun(run,name){
  const rec=Object.assign({},run,{name:String(name||'Anonymous').trim().slice(0,24)||'Anonymous'});
  const db=await getDB();
  if(!db){let loc=[];try{loc=JSON.parse(localStorage.getItem('cfc_local_board')||'[]');}catch(e){}const id='l'+Date.now();loc.push({id,d:rec});try{localStorage.setItem('cfc_local_board',JSON.stringify(loc.slice(-50)));}catch(e){}return id;}
  const ref=db.collection('scores').doc();await ref.set(rec);return ref.id;
}
function openHall(){
  let unsub=()=>{};
  openModal({title:'🏆 HALL OF FAME',meta:'Your best Copahue field campaigns on this device',col:'#ffd23f',html:`<div id="hf-b"></div>
    <p class="note"><b>Score</b> = points from sampling, probe, filtration and the lab. <b>Filtr.</b> = filtration quality (torn membranes and slow filtering lower it) · <b>Probe</b> = how fast you got stable readings · <b>Seq.</b> = DNA extraction + library quality.</p>`,
    init(){mountBoard($('#hf-b'),()=>null).then(u=>{unsub=u;});},onclose(){unsub();}});
}

// ------------------------------------------------------------ SEQUENCING
function openShip(){
  const n=S.samples.length;
  if(!n){toast('Your cooler is empty — collect at least one complete sample first.',true);return;}
  const left=M.length-n;
  openModal({title:'MEL FIELD BASE',meta:'Caviahue · −80 °C freezer, dry shipper & courier',col:'#ff4f3a',html:`<p>You have <b>${n}</b> complete sample${n>1?'s':''} (${n*2}+ membrane sets) in the cooler.${left?` <b>${left}</b> site${left>1?'s are':' is'} still unsampled — once you ship, the campaign ends.`:' Every site is sampled. Great campaign!'}</p>
   <div class="g-row"><button class="g-btn y" id="sh-go" style="font-size:22px">🧬 SHIP FOR ILLUMINA SEQUENCING</button><button class="g-btn" id="sh-no">NOT YET</button></div>`,
   init(){$('#sh-go').onclick=()=>{closeModal();lab();};$('#sh-no').onclick=closeModal;}});
}
function lab(){
  mode='lab';AU.sfx.voice(9,210);let step=0,lysis=null,pcr=null;
  if(PK.is('issotta')){step=4;lysis=1;pcr=1;setTimeout(()=>toast(LX('🪄 Issotta already extracted, prepped and sequenced everything. He made the game.','🪄 Issotta ya extrajo, preparó y secuenció todo. Él hizo el juego.'),false,5000),400);}
  const steps=['DNA extraction','QC','Library prep','Sequencing','Results'];
  const hdr=i=>`<div class="steps">${steps.map((s,k)=>`<span class="${k<i?'ok':k===i?'on':''}">${k+1} · ${s}</span>`).join('')}</div>`;
  const E=()=>{
    if(step===0){let lv=0,holding=false,run=true;
      openModal({title:'SEQUENCING LAB',meta:'Membranes → DNA → libraries → reads',col:'#b15cff',close:false,html:hdr(0)+`
        <p>Cut the membranes into bead tubes and lyse the cells by <b>bead-beating</b>. Hold the button and release in the green zone: too short leaves tough cells (Gram-positives, archaea) intact, too long shears the DNA.</p>
        <div class="meter" style="height:28px"><i id="lb-m" style="width:0%;background:#b15cff"></i><span id="lb-s">0 s</span></div>
        <div style="position:relative;height:10px;margin:2px 0 8px"><div style="position:absolute;left:55%;width:20%;height:10px;background:#8ac926;border:2px solid #1d1a2b;border-radius:4px"></div></div>
        <div class="g-row"><button class="g-btn y" id="lb-go" style="font-size:22px">⚙ HOLD TO BEAD-BEAT (SPACE)</button></div><div id="lb-r"></div>`,
        init(){holdBtn('lb-go','Space');},
        tick(dt){AUX.beater=run&&K('Space')?1:0;if(!run)return;if(K('Space')){holding=true;lv=Math.min(1,lv+dt*.32);}else if(holding){run=false;const ok=lv>=.55&&lv<=.75;lysis=ok?1:lv<.55?.55+lv*.6:1-(lv-.75)*1.6;
            $('#lb-r').innerHTML=`<p><b>${ok?'Perfect lysis!':lv<.55?'Under-lysed: some tough cells survived.':'Over-beaten: DNA got a bit sheared.'}</b> Extraction efficiency ${Math.round(lysis*100)}%.</p><div class="g-row"><button class="g-btn t" id="lb-n">NEXT ➜</button></div>`;$('#lb-n').onclick=()=>{step=1;E();};}
          $('#lb-m').style.width=(lv*100)+'%';$('#lb-s').textContent=(lv*100/1.2).toFixed(0)+' s';}});
    }else if(step===1){
      const rows=S.samples.map(s=>{const base={VER:22,RAS:48,LC:70,RAI:55,DUL:35,TER:30}[s.hab]||40;const f=s.filt;const y=base*lysis*(1-f.rupt*.08)*(1+(f.m045+f.m022-2)*.05);s.dna=Math.max(2,y);return s;});
      openModal({title:'SEQUENCING LAB',meta:'Fluorometric DNA quantification',col:'#b15cff',close:false,html:hdr(1)+`<p>DNA per sample (0.45 + 0.22 µm fractions pooled per site for this run). Libraries need ≥ 1 ng of input.</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff">${rows.map(s=>`<tr><td style="border:1.5px solid #1d1a2b;padding:3px 6px"><b>${s.c.replace('_','–')}</b> ${s.en}</td><td style="border:1.5px solid #1d1a2b;padding:3px 6px;text-align:right"><b>${s.dna.toFixed(1)} ng/µL</b> ✔</td></tr>`).join('')}</table>
        <p class="note">DNA yields are simulated from your lysis and filtration performance.</p><div class="g-row"><button class="g-btn t" id="q-n">NEXT ➜</button></div>`,init(){$('#q-n').onclick=()=>{step=2;E();};}});
    }else if(step===2){let cyc=0,run=true,tac=0;
      openModal({title:'SEQUENCING LAB',meta:'Illumina DNA Prep · tagmentation + unique dual indexes',col:'#b15cff',close:false,html:hdr(2)+`
        <p>✔ <b>Tagmentation:</b> bead-linked transposomes fragment the DNA and add adapters in one step.<br>✔ Each sample gets its own <b>i5/i7 index pair</b>.<br>Now the <b>index PCR</b>: stop the thermocycler between <b>6 and 9 cycles</b>. Too many cycles → PCR duplicates and bias.</p>
        <div style="font:48px 'Bangers';text-align:center" id="pc-c">0</div><div style="text-align:center;font-weight:700" id="pc-t">cycles</div>
        <div class="g-row" style="justify-content:center"><button class="g-btn r" id="pc-s" style="font-size:24px">■ STOP PCR (SPACE)</button></div><div id="pc-r"></div>`,
        init(){$('#pc-s').onclick=stop;},key(c){if(c==='Space')stop();},
        tick(dt){if(!run)return;tac+=dt;if(tac>.55){tac=0;cyc++;beep(300+cyc*30,.04,'sine',.04);$('#pc-c').textContent=cyc;if(cyc>=16)stop();}}});
      function stop(){if(!run)return;run=false;pcr=cyc>=6&&cyc<=9?1:cyc<6?.7:Math.max(.4,1-(cyc-9)*.08);
        $('#pc-r').innerHTML=`<p><b>${pcr===1?'Great libraries!':cyc<6?'Low library yield — enough to sequence, but thin.':'Over-amplified: expect more duplicate reads.'}</b> Libraries pooled equimolarly and loaded on the flow cell.</p><div class="g-row"><button class="g-btn t" id="pc-n">LOAD THE SEQUENCER ➜</button></div>`;$('#pc-n').onclick=()=>{step=3;E();};}
    }else if(step===3){let c=0,run=true,acc=0;
      openModal({title:'SEQUENCING LAB',meta:'Illumina NovaSeq · shotgun metagenomics · 2 × 150 bp paired-end',col:'#b15cff',close:false,html:hdr(3)+`
        <div class="g-grid"><div><canvas id="sq-c" width="300" height="220" style="width:100%;border:3px solid #1d1a2b;border-radius:8px;background:#05060d"></canvas></div>
        <div><div class="kv" style="font-size:14px"><span>Chemistry</span><b>sequencing-by-synthesis</b><span>Cycle</span><b id="sq-cy">0 / 300</b><span>Read</span><b id="sq-rd">R1</b><span>Base called</span><b id="sq-b">—</b><span>%≥Q30</span><b id="sq-q">—</b></div>
        <div class="meter" style="margin-top:8px"><i id="sq-m" style="width:0%;background:#b15cff"></i><span id="sq-ms">0%</span></div>
        <p class="note">Each cluster is thousands of copies of one DNA fragment. Every cycle adds one fluorescent base: <b style="color:#2ec4b6">A</b> <b style="color:#3a86ff">C</b> <b style="color:#ffd23f">G</b> <b style="color:#ff4f3a">T</b>. Real run: ~2 days. Here: time-lapse.</p><div id="sq-n"></div></div></div>`,
        init(){const cv=$('#sq-c');const g=cv.getContext('2d');this.g=g;this.cl=[...Array(420)].map(()=>[Math.random()*300,Math.random()*220,1.5+Math.random()*2]);},
        tick(dt){if(!run)return;acc+=dt*38;const g=this.g;
          while(acc>=1&&c<300){acc--;c++;}
          g.fillStyle='rgba(5,6,13,.55)';g.fillRect(0,0,300,220);const COLS=['#2ec4b6','#3a86ff','#ffd23f','#ff4f3a'];
          this.cl.forEach(p=>{g.fillStyle=COLS[Math.floor(Math.random()*4)];g.beginPath();g.arc(p[0],p[1],p[2],0,6.3);g.fill();});
          $('#sq-cy').textContent=`${c} / 300`;$('#sq-rd').textContent=c<=150?'R1 (forward)':'R2 (reverse)';$('#sq-b').textContent='ACGT'[Math.floor(Math.random()*4)];
          $('#sq-q').textContent=(92-c*.018*(2-pcr)).toFixed(1)+'%';$('#sq-m').style.width=(c/3)+'%';$('#sq-ms').textContent=Math.round(c/3)+'%';
          if(c>=300){run=false;tada();$('#sq-n').innerHTML='<div class="g-row"><button class="g-btn t" id="sq-go" style="font-size:22px">DEMULTIPLEX &amp; CLASSIFY READS ➜</button></div>';$('#sq-go').onclick=()=>{step=4;E();};}}});
    }else results();
  };
  E();
  function results(){
    const bonus=Math.round(150*lysis+150*pcr);S.score+=bonus;S.shipped=true;save();const run=calcRun(lysis,pcr);let mine=null,unsub=()=>{},sent=false;
    const cards=S.samples.map(s=>{const m=M.find(q=>q.c===s.c);const T=m.taxa;
      if(!T)return `<div class="scard"><div class="t"><span style="background:${m.col};border:2px solid #1d1a2b;border-radius:5px;padding:0 5px">${s.c.replace('_','–')}</span><span style="font-size:14px">${s.en}</span></div><p class="note">Sequenced in your run! This site has no metagenome in the lab's 2019 dataset, so here are its probe readings instead: pH ${fmtV(s.probe.v.pH,2)}, ${fmtV(s.probe.v['Temp.[ºC]'],1)} °C, EC ${fmtV(s.probe.v['EC[µS/cm]'],0)} µS/cm.</p></div>`;
      const dom=Object.entries(T.domain);const dsum=dom.reduce((a,b)=>a+b[1],0);
      const g5=T.genus.slice(0,5);const mx=g5[0][1];
      return `<div class="scard"><div class="t"><span style="background:${m.col};border:2px solid #1d1a2b;border-radius:5px;padding:0 5px">${s.c.replace('_','–')}</span><span style="font-size:14px">${s.en}</span></div>
        <div class="kv"><span>Read pairs (real)</span><b>${(T.total_reads/1e6).toFixed(1)} M</b><span>Shannon diversity</span><b>${T.shannon.toFixed(2)}</b><span>MAGs (HQ / MQ / LQ)</span><b>${T.mags.HQ||0} / ${T.mags.MQ||0} / ${T.mags.LQ||0}</b></div>
        <div class="stack">${dom.map(([k,v])=>`<i title="${DOM_EN[k]||k} ${v.toFixed(1)}%" style="width:${v/dsum*100}%;background:${DOM_COL[k]||'#ccc'}"></i>`).join('')}</div>
        ${g5.map(([n,p])=>`<div class="gb"><span class="n">${n}</span><span class="b"><i style="width:${p/mx*100}%;background:${Wd.gcol(n)}"></i></span><span class="v">${p.toFixed(1)}%</span></div>`).join('')}</div>`;}).join('');
    const tot=S.samples.reduce((a,s)=>{const T=(M.find(q=>q.c===s.c)||{}).taxa;return a+(T?T.total_reads:0);},0);
    openModal({title:'METAGENOME REPORT',meta:`${S.samples.length} sites · ${(tot/1e6).toFixed(0)} M read pairs · lab bonus +${bonus}`,col:'#8ac926',close:false,html:hdr(4)+`
      <div class="kpis" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px">
       <div class="scard" style="margin:0"><div class="t">${S.score}</div><span class="note">final score</span></div>
       <div class="scard" style="margin:0"><div class="t">${S.samples.length}/${M.length}</div><span class="note">sites sampled</span></div>
       <div class="scard" style="margin:0"><div class="t">${fmtT(S.t)}</div><span class="note">campaign time</span></div>
       <div class="scard" style="margin:0"><div class="t">${S.samples.reduce((a,s)=>a+s.filt.rupt,0)}</div><span class="note">torn membranes</span></div></div>
      <div class="lg" style="margin-bottom:6px">${Object.keys(DOM_EN).map(k=>`<span><i style="background:${DOM_COL[k]}"></i>${DOM_EN[k]}</span>`).join('')}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:0 10px">${cards}</div>
      <p class="note">Taxonomy (% of reads, top 5 genera), read counts, Shannon diversity and MAG bins are the lab's real 2019 shotgun metagenomes. Notice how <i>Acidithiobacillus</i> dominates the acidic springs and upper river, <i>Acidiphilium</i> and <i>Ferrovum</i> take over in the lake and lower river, and <i>Limnohabitans</i> marks the freshwater controls.</p>
      <h4>🏆 HALL OF FAME</h4>
      <div class="scard" id="rs-sub"><div class="g-row" style="margin:0"><span style="font-weight:700">Your quality: filtration <b>${run.filtQ}%</b> · probe <b>${run.probeQ}%</b> · sequencing <b>${run.seqQ}%</b></span></div>
       <div class="g-row"><input id="rs-name" maxlength="24" value="${esc(charNames[charIdx])}" style="flex:1;min-width:160px;font:18px 'Bangers',Impact;letter-spacing:.04em;border:2.5px solid #1d1a2b;border-radius:8px;padding:5px 8px"><button class="g-btn y" id="rs-send">⭐ ADD MY CAMPAIGN</button></div><div id="rs-msg" class="note"></div></div>
      <div id="rs-board"></div>
      <div class="g-row"><button class="g-btn t" id="rs-fin" style="font-size:22px">🎉 FINISH</button><button class="g-btn y" id="rs-new">▶ NEW CAMPAIGN</button><button class="g-btn" id="rs-exp">🛻 KEEP DRIVING AROUND</button></div>`,
      init(){$('#rs-fin').onclick=()=>{closeModal();runFinale();};$('#rs-new').onclick=()=>{closeModal();try{localStorage.removeItem('cfc_save_v1');}catch(e){}showTitle();};$('#rs-exp').onclick=()=>{closeModal();mode='play';};
        const nm=$('#rs-name');nm.addEventListener('keydown',e=>e.stopPropagation());
        mountBoard($('#rs-board'),()=>mine).then(u=>{unsub=u;});
        $('#rs-send').onclick=async()=>{if(sent)return;sent=true;const b=$('#rs-send');b.disabled=true;$('#rs-msg').textContent='Saving…';
          try{mine=await submitRun(run,nm.value);AU.sfx.tada();$('#rs-msg').innerHTML='✔ You are on the board! Your row is highlighted.';nm.disabled=true;
            const db=await getDB();if(!db){unsub();mountBoard($('#rs-board'),()=>mine).then(u=>{unsub=u;});}}
          catch(e){sent=false;b.disabled=false;$('#rs-msg').textContent=(e&&e.code==='quota_exceeded')?'The board is full — ask the owner to clear old entries.':'Could not save (you may only have view access). Try again later.';}};},
      onclose(){unsub();}});
  }
}
// ============================================================ XA ADDONS: comic FX, driving feel, road events, achievements, journal,
// difficulty, modes (time trial / daily / classroom), photo mode, ghost race, fullscreen, local records
function xaInit(){
const LS=(k,d)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):d;}catch(e){return d;}};
const SS=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}};
const cfg=Object.assign({diff:'normal',mode:'campaign',quiz:false},LS('cfc_cfg',{}));delete cfg.inset;const saveCfg=()=>SS('cfc_cfg',cfg);cfg.diff='normal';cfg.mode='campaign';cfg.quiz=false;   // single level + the normal campaign/exploration mode only
const life=Object.assign({km:0,turbo:0,quiz:0,photos:0},LS('cfc_life',{}));let lifeDirty=0;
const ach=LS('cfc_ach',{});const journal=LS('cfc_journal',{});
const X={streak:0,flags:{},run:null,photo:false,snapReq:null};window.__XA=X;
const MULT={relaxed:.8,normal:1,expedition:1.3};const mult=()=>MULT[cfg.diff]||1;
const esc2=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// ---------------- CSS
const css=document.createElement('style');css.textContent=`
.xa-pow{position:fixed;left:0;top:0;z-index:46;pointer-events:none;font:44px Bangers,Impact,sans-serif;letter-spacing:.04em;color:#ffd23f;-webkit-text-stroke:2.5px #1d1a2b;paint-order:stroke fill;text-shadow:4px 4px 0 #1d1a2b;white-space:nowrap;will-change:transform,opacity}
.xa-pow:before{content:'';position:absolute;left:50%;top:50%;width:190%;height:230%;transform:translate(-50%,-50%);z-index:-1;background:#fff;
  clip-path:polygon(50% 0,58% 30%,80% 8%,70% 36%,100% 30%,76% 50%,100% 70%,70% 64%,80% 92%,58% 70%,50% 100%,42% 70%,20% 92%,30% 64%,0 70%,24% 50%,0 30%,30% 36%,20% 8%,42% 30%);filter:drop-shadow(0 0 0 #1d1a2b)}
#xa-speed{position:fixed;inset:-10%;z-index:30;pointer-events:none;opacity:0;background:repeating-conic-gradient(from 0deg at 50% 55%,rgba(255,255,255,0) 0deg 4deg,rgba(255,255,255,.75) 4deg 4.7deg,rgba(255,255,255,0) 4.7deg 9deg);
  -webkit-mask-image:radial-gradient(ellipse at 50% 55%,transparent 32%,#000 78%);mask-image:radial-gradient(ellipse at 50% 55%,transparent 32%,#000 78%)}
#xa-hud{position:fixed;right:12px;bottom:170px;z-index:41;display:flex;flex-direction:column;gap:6px;align-items:flex-end;pointer-events:none}
#xa-hud .g-panel{padding:4px 10px;font:700 12.5px 'Comic Neue',sans-serif;pointer-events:auto}
#xa-turbo i{display:inline-block;height:9px;background:#ff4f3a;border:1.5px solid #1d1a2b;border-radius:3px;vertical-align:middle;margin-left:6px;width:70px;overflow:hidden;position:relative}
#xa-turbo i b{position:absolute;left:0;top:0;bottom:0;background:#ffd23f}
#xa-bar{position:fixed;left:12px;top:146px;z-index:41;display:flex;gap:6px;flex-wrap:wrap;max-width:60vw}
#xa-bar .g-btn{font-size:14px;padding:4px 8px}
body.xa-photo .g-panel,body.xa-photo .g-btn,body.xa-photo .glbl,body.xa-photo #g-touch,body.xa-photo #xa-bar,body.xa-photo #xa-hud,body.xa-photo #g-toast,body.xa-photo .lbl{visibility:hidden!important}
#xa-frame{position:fixed;inset:0;z-index:70;pointer-events:none;display:none;border:14px solid #1d1a2b;box-shadow:inset 0 0 0 5px #fffdf5,inset 0 0 0 9px #1d1a2b}
#xa-frame .cap{position:absolute;left:18px;bottom:14px;background:#ffd23f;border:3px solid #1d1a2b;padding:2px 12px;font:26px Bangers,Impact;letter-spacing:.05em;box-shadow:4px 4px 0 #1d1a2b}
#xa-pbar{position:fixed;left:50%;top:22px;transform:translateX(-50%);z-index:71;display:none;gap:8px}
#xa-pbar .g-btn{font-size:16px;padding:5px 10px;visibility:visible!important}
.xa-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px}
.xa-card{border:2.5px solid #1d1a2b;border-radius:8px;background:#fff;padding:6px;box-shadow:3px 3px 0 #1d1a2b;font-size:12px}
.xa-card.lock{background:#e9e4d8;color:#8a8398}
.xa-card img{width:100%;height:88px;object-fit:cover;border:2px solid #1d1a2b;border-radius:5px;display:block;margin-bottom:4px}
.xa-card .t{font:17px Bangers,Impact;letter-spacing:.03em;line-height:1.05;margin-bottom:3px}
.xa-opt{display:inline-flex;gap:4px;flex-wrap:wrap;margin:2px 0}
.xa-opt .g-btn{font-size:15px;padding:3px 9px}.xa-opt .g-btn.on{background:#ffd23f}
.xa-q .g-btn{display:block;width:100%;text-align:left;margin:6px 0;font-size:17px}
.xa-ach{display:flex;gap:8px;align-items:center}.xa-ach .i{font-size:26px;width:34px;text-align:center}.xa-card.lock .i{filter:grayscale(1);opacity:.5}
.xa-prog{height:10px;border:2px solid #1d1a2b;border-radius:4px;background:#fff;overflow:hidden;width:160px}.xa-prog b{display:block;height:100%;background:#8ac926}
`;document.head.appendChild(css);
// ---------------- comic onomatopoeia
const POWS=[];const pv=new THREE.Vector3();
function pow(txt,x,y,z,col,size){const el=document.createElement('div');el.className='xa-pow';el.textContent=txt;if(col)el.style.color=col;if(size)el.style.fontSize=size+'px';document.body.appendChild(el);
  POWS.push({el,P:new THREE.Vector3(x,y,z),t0:performance.now(),rot:(Math.random()-.5)*22});}
function powAt(txt,col,size,dy){const y=(pl.inTruck?truck.g.position.y:Wd.heightAt(pl.x,pl.z))+(dy||.28);pow(txt,pl.x,y,pl.z,col,size);}
function updPows(){const now=performance.now();for(let i=POWS.length-1;i>=0;i--){const p=POWS[i],t=(now-p.t0)/1000;
  if(t>1.5){p.el.remove();POWS.splice(i,1);continue;}pv.copy(p.P).project(Wd.camera);if(pv.z>1){p.el.style.opacity=0;continue;}
  const sc=t<.14?t/.14*1.3:1.3-.3*Math.min(1,(t-.14)/.18);const x=(pv.x*.5+.5)*innerWidth,y=(-pv.y*.5+.5)*innerHeight-t*38;
  p.el.style.opacity=String(t<1.05?1:1-(t-1.05)/.45);p.el.style.transform=`translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%) rotate(${p.rot}deg) scale(${sc.toFixed(3)})`;}}
const speedEl=document.createElement('div');speedEl.id='xa-speed';document.body.appendChild(speedEl);
// ---------------- HUD bar (journal, achievements, photo, fullscreen)
const bar=document.createElement('div');bar.id='xa-bar';bar.innerHTML=`<button class="g-btn" id="xa-jb">📓 ${LX('JOURNAL','DIARIO')}</button><button class="g-btn" id="xa-ab">🏅 ${LX('BADGES','LOGROS')}</button><button class="g-btn" id="xa-pb">📷 ${LX('PHOTO','FOTO')} (K)</button><button class="g-btn" id="xa-fs" title="Fullscreen">🖥️</button>`;
document.body.appendChild(bar);
const hud=document.createElement('div');hud.id='xa-hud';hud.innerHTML=`<div class="g-panel" id="xa-goal" style="display:none"></div><div class="g-panel" id="xa-evt" style="display:none"></div><div class="g-panel" id="xa-turbo" style="display:none">⚡ TURBO (SHIFT)<i><b></b></i></div>`;document.body.appendChild(hud);
$('#xa-jb').onclick=()=>openJournal();$('#xa-ab').onclick=()=>openAch();$('#xa-pb').onclick=()=>togglePhoto();
$('#xa-fs').onclick=()=>{const d=document.documentElement;try{if(document.fullscreenElement){document.exitFullscreen();return;}const r=(d.requestFullscreen||d.webkitRequestFullscreen).call(d);if(r&&r.catch)r.catch(()=>toast(LX('Your browser does not allow fullscreen here — try the browser\'s own fullscreen (F11 / ⌃⌘F).','Tu navegador no permite pantalla completa aquí: usa la del navegador (F11 / ⌃⌘F).'),true));}catch(e){toast(LX('Fullscreen is not available here.','La pantalla completa no está disponible aquí.'),true);}};
{const tb=$('#g-tbtn');if(tb){const b=document.createElement('button');b.className='g-btn';b.id='g-tT';b.textContent='⚡ TURBO';tb.appendChild(b);b.addEventListener('pointerdown',e=>{e.preventDefault();X.turboReq=true;});}}
// ---------------- achievements
const ACH=[
 ['first','🧪','First sample','Primera muestra','Complete your first site.','Completa tu primer sitio.'],
 ['five','🧫','Five for five','Cinco de cinco','Complete 5 sites in one campaign.','Completa 5 sitios en una campaña.'],
 ['all','🏔️','Full transect','Transecta completa','Sample all 13 sites.','Muestrea los 13 sitios.'],
 ['perfect3','💎','Steady hands','Manos de cirujano','3 perfect filtrations in a row (no torn membranes).','3 filtraciones perfectas seguidas (sin membranas rotas).'],
 ['nofail','🛡️','Zero ruptures','Cero roturas','Ship a campaign without tearing a single membrane.','Envía una campaña sin romper ninguna membrana.'],
 ['snow','❄️','Snow sampler','Muestreo en la nieve','Finish a site during a snow squall.','Termina un sitio durante una nevazón.'],
 ['night','🌙','Night shift','Turno de noche','Finish a site at night.','Termina un sitio de noche.'],
 ['eggs3','📜','Curious mind','Mente curiosa','Find 3 hidden stories.','Encuentra 3 historias escondidas.'],
 ['eggsAll','🗝️','Lore master','Maestro del saber','Find every hidden story.','Encuentra todas las historias.'],
 ['erupt','🌋','Eyewitness','Testigo','Witness the eruption.','Presencia la erupción.'],
 ['pet','🐕','Good dog','Buen perrito','Pet the camp dog.','Acaricia al perro del campamento.'],
 ['void','🕳️','Off the edge','Al vacío','Fall off the edge of the world (and land back in one piece).','Cáete por el borde del mundo (y aterriza entero).'],
 ['brake','🦙','Guanaco guardian','Guardián del guanaco','Brake in time for a crossing guanaco.','Frena a tiempo ante un guanaco.'],
 ['fixer','🔧','Pit crew','Mecánico de ruta','Change a flat tyre.','Cambia un neumático pinchado.'],
 ['ride','🤝','Good colleague','Buen colega','Give a colleague a lift.','Lleva a un colega.'],
 ['turbo10','⚡','Turbo junkie','Adicto al turbo','Use the turbo 10 times.','Usa el turbo 10 veces.'],
 ['km20','🛻','Road warrior','Guerrero del camino','Drive 20 km in total.','Maneja 20 km en total.'],
 ['fast30','⏱️','Speed science','Ciencia express','Ship a full campaign in under 30 minutes.','Envía una campaña completa en menos de 30 minutos.'],
 ['ta','🏁','Time trialist','Contrarrelojista','Finish a time trial.','Termina una contrarreloj.'],
 ['daily','📅','Daily grind','Desafío cumplido','Finish a daily challenge.','Completa un desafío diario.'],
 ['quiz5','🎓','Top of the class','Primero de la clase','Answer 5 classroom questions correctly.','Responde bien 5 preguntas del modo aula.'],
 ['photo','📸','Field photographer','Fotógrafo de campo','Take a photo in photo mode.','Toma una foto en el modo foto.'],
 ['expedition','🧗','Hardcore','Expedicionario','Complete a site on Expedition difficulty.','Completa un sitio en dificultad Expedición.'],
];
X.unlock=id=>unlock(id);  // for game code outside xaInit (e.g. falling off the edge)
function unlock(id){if(ach[id])return;ach[id]=new Date().toISOString().slice(0,10);SS('cfc_ach',ach);const a=ACH.find(q=>q[0]===id);if(!a)return;
  setTimeout(()=>{toast(`🏅 <b>${LX('BADGE UNLOCKED','¡LOGRO DESBLOQUEADO!')}</b> ${a[1]} ${LX(a[2],a[3])}`,false,3600);try{AU.sfx.tada();}catch(e){}if(Wd&&mode==='play')powAt(a[1]+' '+LX('BADGE!','¡LOGRO!'),'#8ac926',34,.4);},900);}
function checkAch(){const n=S.samples.length;if(n>=1)unlock('first');if(n>=5)unlock('five');if(M.length&&M.every(m=>st(m.c).done))unlock('all');
  if(X.streak>=3)unlock('perfect3');if(eggsFound.length>=3)unlock('eggs3');if(EGGS.length&&eggsFound.length>=EGGS.length)unlock('eggsAll');
  if(S.petted)unlock('pet');if(life.turbo>=10)unlock('turbo10');if(life.km>=20)unlock('km20');if(life.quiz>=5)unlock('quiz5');if(life.photos>=1)unlock('photo');
  if(S.shipped&&S.samples.length&&S.samples.every(s=>!(s.filt&&s.filt.rupt)))unlock('nofail');if(S.shipped&&S.samples.length===M.length&&S.t<1800)unlock('fast30');}
function openAch(){const got=ACH.filter(a=>ach[a[0]]).length;openModal({title:'🏅 '+LX('BADGES','LOGROS'),meta:`${got}/${ACH.length} · ${LX('saved in this browser','guardados en este navegador')}`,col:'#8ac926',
  html:`<div class="xa-grid">${ACH.map(a=>`<div class="xa-card xa-ach${ach[a[0]]?'':' lock'}"><div class="i">${a[1]}</div><div><div class="t">${LX(a[2],a[3])}</div>${LX(a[4],a[5])}${ach[a[0]]?`<br><small>✔ ${ach[a[0]]}</small>`:''}</div></div>`).join('')}</div>`});}
// ---------------- field journal (persists across campaigns)
function openJournal(){const done=M.filter(m=>journal[m.c]).length;
  openModal({title:'📓 '+LX('FIELD JOURNAL','DIARIO DE CAMPO'),meta:`${done}/${M.length} ${LX('sites documented · real data from the lab\'s campaigns','sitios documentados · datos reales de las campañas del laboratorio')}`,col:'#00bbf9',
  html:`<div class="xa-grid">${M.map(m=>{const j=journal[m.c];const code=m.c.replace('_','–');
    if(!j)return `<div class="xa-card lock"><div class="t">${code} · ???</div>${m.hike?'🥾 '+LX('Hike site on the volcano','Sitio a pie en el volcán'):'🛻 '+LX('Reachable by road','Accesible por camino')}<br><small>${LX('Sample it to unlock this page.','Muestréalo para desbloquear esta página.')}</small></div>`;
    const ph=Wd.PHOTOS&&Wd.PHOTOS[m.c];const v=j.v||{};const T=m.taxa;const g3=T&&T.genus?T.genus.slice(0,3):[];
    const dom=T&&T.domain?Object.entries(T.domain).sort((a,b)=>b[1]-a[1])[0]:null;
    return `<div class="xa-card">${ph?`<img src="${ph}" alt="">`:''}<div class="t">${code} · ${esc2(m.en)}</div>
      ${v.pH!==undefined?`pH <b>${fmtV(v.pH,2)}</b> · `:''}${v['Temp.[ºC]']!==undefined?`<b>${fmtV(v['Temp.[ºC]'],1)} °C</b> · `:''}${v['EC[µS/cm]']!==undefined?`EC <b>${fmtV(v['EC[µS/cm]'],0)}</b> µS/cm`:''}
      ${dom?`<br>${LX('Dominant','Dominan')}: <b>${DOM_EN[dom[0]]||dom[0]}</b> ${dom[1].toFixed(0)}%`:''}${g3.length?`<br>${LX('Top genera','Géneros principales')}: <i>${g3.map(g=>esc2(g[0])).join(', ')}</i>`:''}
      <br><small>✔ ${j.d}${j.n?' · '+esc2(j.n):''}</small></div>`;}).join('')}</div>`});}
// ---------------- difficulty / mode / classroom selectors on the title screen
const dailyKey=()=>new Date().toISOString().slice(0,10);
function dailySites(){const key=dailyKey();let h=0;for(const ch of key)h=(h*31+ch.charCodeAt(0))>>>0;const pool=M.filter(m=>!m.hike).map(m=>m.c);const out=[];
  while(out.length<3&&pool.length){h=(h*1103515245+12345)>>>0;out.push(pool.splice(h%pool.length,1)[0]);}const wx=['clear','rain','snow'][h%3];return {sites:out,wx};}
function augmentTitle(){const mb=$('#g-mb');if(!mb||!modal||modal.title!=='COPAHUE FIELD CAMPAIGN'||$('#xa-opts'))return;
  const opt=(k,v,label)=>`<button class="g-btn${cfg[k]===v?' on':''}" data-k="${k}" data-v="${v}">${label}</button>`;
  const d=dailySites();const box=document.createElement('div');box.id='xa-opts';box.style.cssText='border:2.5px solid #1d1a2b;border-radius:8px;padding:6px 10px;margin:8px 0;background:#fff8e0';
  box.innerHTML=`<div class="g-row" style="margin-top:4px"><button class="g-btn" id="xa-t-ach">🏅 ${LX('BADGES','LOGROS')} (${ACH.filter(a=>ach[a[0]]).length}/${ACH.length})</button><button class="g-btn" id="xa-t-jr">📓 ${LX('JOURNAL','DIARIO')}</button></div>`;
  const row=mb.querySelector('.g-row');row?row.parentNode.insertBefore(box,row):mb.appendChild(box);
  const note=()=>{const n=$('#xa-mnote');if(!n)return;n.innerHTML=cfg.mode==='ta'?LX('Sample any <b>5 sites</b> as fast as you can. Your best run races you as a <b>ghost truck</b>.','Muestrea <b>5 sitios</b> cualquiera lo más rápido posible. Tu mejor vuelta te corre como <b>camioneta fantasma</b>.')
    :cfg.mode==='daily'?LX(`Today (${dailyKey()}): sample <b>${d.sites.join(', ')}</b> · weather: <b>${d.wx}</b>. Same challenge for everyone today.`,`Hoy (${dailyKey()}): muestrea <b>${d.sites.join(', ')}</b> · clima: <b>${{clear:'despejado',rain:'lluvia',snow:'nieve'}[d.wx]}</b>. El mismo desafío para todos hoy.`)
    :LX('The full field campaign: 13 sites, then sequence at the MEL Field Base.','La campaña completa: 13 sitios y luego secuenciar en la base MEL.');
    n.innerHTML+=' '+(cfg.diff==='relaxed'?LX('Relaxed: no storms, score ×0.8.','Relajado: sin tormentas, puntaje ×0,8.'):cfg.diff==='expedition'?LX('Expedition: frequent storms and road trouble, score ×1.3.','Expedición: tormentas y problemas en ruta frecuentes, puntaje ×1,3.'):'');};
  note();box.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{const k=b.dataset.k;cfg[k]=b.dataset.v==='true'?true:b.dataset.v==='false'?false:b.dataset.v;saveCfg();
    box.querySelectorAll(`[data-k="${k}"]`).forEach(o=>o.classList.toggle('on',o===b));note();AU.sfx.click&&AU.sfx.click();});
  $('#xa-t-ach').onclick=()=>{openAch();const o=modal;o.onclose=()=>setTimeout(showTitle,0);};$('#xa-t-jr').onclick=()=>{openJournal();const o=modal;o.onclose=()=>setTimeout(showTitle,0);};
  const cont=$('#g-cont');if(cont){const f=cont.onclick;cont.onclick=()=>{cfg.mode='campaign';saveCfg();f&&f();};}}
const _showTitle=showTitle;showTitle=function(){_showTitle.apply(this,arguments);augmentTitle();};augmentTitle();
const _start=start;start=function(){_start.apply(this,arguments);beginRun();};
function beginRun(){X.streak=0;X.flags={};EVT.cur=null;EVT.next=60+Math.random()*40;clearEvt();
  X.run={mode:cfg.mode,diff:cfg.diff,t0:S.t,goal:null,sites:null,done:false,path:[],pt:0};
  if(cfg.mode==='ta'){X.run.goal=5;ghostStart();toast(LX('🏁 <b>TIME TRIAL</b>: sample any 5 sites as fast as you can!','🏁 <b>CONTRARRELOJ</b>: ¡muestrea 5 sitios lo más rápido que puedas!'),false,4500);}
  else if(cfg.mode==='daily'){const d=dailySites();X.run.sites=d.sites;X.run.goal=d.sites.length;const m=M.find(q=>q.c===d.sites[0]);if(m)S.target=m;
    if(d.wx!=='clear'){WX.next=8;X.run.forceWx=d.wx;}toast(LX(`📅 <b>DAILY CHALLENGE</b>: ${d.sites.join(', ')}`,`📅 <b>DESAFÍO DIARIO</b>: ${d.sites.join(', ')}`),false,4500);}
  if(cfg.diff!=='normal')setTimeout(()=>toast(cfg.diff==='relaxed'?LX('😌 Relaxed difficulty: calm skies.','😌 Dificultad relajada: cielo tranquilo.'):LX('🧗 Expedition difficulty: expect trouble!','🧗 Dificultad expedición: ¡prepárate para problemas!'),false,2800),4800);}
// ---------------- sample completion: juice, bonuses, journal, achievements, classroom
const _checkDone=checkDone;checkDone=function(m){const s=st(m.c);const was=s.done;const sc0=S.score;_checkDone.apply(this,arguments);if(was||!s.done)return;
  const base=S.score-sc0;S.score+=Math.round(base*(mult()-1));
  const rupt=(s.filt&&s.filt.rupt)||0,pt=(s.probe&&s.probe.t)||99;let bonus=0,msgs=[];
  if(rupt===0){X.streak++;const b=Math.round(50*(1+.5*(X.streak-1))*mult());bonus+=b;msgs.push(`💎 ${LX('PERFECT FILTRATION','FILTRACIÓN PERFECTA')} +${b}${X.streak>1?' (combo ×'+X.streak+')':''}`);}else X.streak=0;
  if(pt<12){const b=Math.round(25*mult());bonus+=b;msgs.push(`⚡ ${LX('FAST PROBE','SONDA RÁPIDA')} +${b}`);}
  S.score+=bonus;save();
  setTimeout(()=>{powAt(LX('SAMPLED!','¡MUESTRA!'),'#ffd23f',50,.35);if(rupt===0)setTimeout(()=>powAt(X.streak>1?LX('COMBO ×','¡COMBO ×')+X.streak+'!':LX('PERFECT!','¡PERFECTO!'),'#00e5ff',40,.6),450);},1700);
  if(msgs.length)setTimeout(()=>toast(msgs.join('<br>'),false,3600),2600);
  journal[m.c]={v:Object.assign({},s.probe&&s.probe.v||{}),d:new Date().toISOString().slice(0,10),n:charNames&&charNames[charIdx]};SS('cfc_journal',journal);
  if(WX.snow>.3||WX.type==='snow')unlock('snow');if(WX.night>.5)unlock('night');if(cfg.diff==='expedition')unlock('expedition');
  if(X.run&&X.run.goal&&!X.run.done){const n=X.run.sites?X.run.sites.filter(c=>st(c).done).length:S.samples.length-(X.run.n0||0);if(n>=X.run.goal)setTimeout(finishRun,3600);}};
const _showSiteCard=showSiteCard;showSiteCard=function(m){const before=modal;_showSiteCard.apply(this,arguments);if(!cfg.quiz||modal===before||!modal)return;const o=modal;const oc=o.onclose;o.onclose=function(){oc&&oc.apply(this,arguments);setTimeout(()=>openQuiz(m),200);};};
function quizFor(m){const s=st(m.c);const v=(s.probe&&s.probe.v)||{};const Q=[];
  if(v.pH!==undefined){const p=v.pH;Q.push({q:LX(`The water at ${m.en} had pH ${fmtV(p,1)}. How would you classify it?`,`El agua de ${m.en} tuvo pH ${fmtV(p,1)}. ¿Cómo la clasificarías?`),
    o:[LX('Strongly acidic (pH < 4)','Muy ácida (pH < 4)'),LX('Slightly acidic / near neutral (4–8)','Levemente ácida / casi neutra (4–8)'),LX('Alkaline (pH > 8)','Alcalina (pH > 8)')],a:p<4?0:p<=8?1:2,
    e:LX('Copahue\'s crater lake and upper Río Agrio are among the most acidic natural waters on Earth (pH < 2), fed by volcanic sulfuric and hydrochloric acid. The Río Jara is a freshwater control.','La laguna del cráter y el Agrio superior están entre las aguas naturales más ácidas del planeta (pH < 2), alimentadas por ácido sulfúrico y clorhídrico volcánico. El Río Jara es un control de agua dulce.')});}
  if(v['Temp.[ºC]']!==undefined){const T=v['Temp.[ºC]'];Q.push({q:LX(`The probe read ${fmtV(T,1)} °C. What does that suggest?`,`La sonda midió ${fmtV(T,1)} °C. ¿Qué sugiere?`),o:[LX('Cold snowmelt water (< 15 °C)','Agua fría de deshielo (< 15 °C)'),LX('Temperate water (15–35 °C)','Agua templada (15–35 °C)'),LX('Geothermal input (> 35 °C)','Aporte geotermal (> 35 °C)')],a:T<15?0:T<=35?1:2,
    e:LX('Hot water near the volcano comes from hydrothermal circulation; downstream it cools and mixes with snowmelt.','El agua caliente cerca del volcán viene de circulación hidrotermal; río abajo se enfría y se mezcla con deshielo.')});}
  const T=m.taxa;if(T&&T.domain){const e=Object.entries(T.domain).filter(x=>['Bacteria','Arquea','Eucariota'].includes(x[0])).sort((a,b)=>b[1]-a[1]);if(e.length){const names=['Bacteria','Arquea','Eucariota'];
    Q.push({q:LX('Which domain of life dominates this site\'s metagenome?','¿Qué dominio de la vida domina el metagenoma de este sitio?'),o:[LX('Bacteria','Bacteria'),LX('Archaea','Arqueas'),LX('Eukaryotes','Eucariontes')],a:names.indexOf(e[0][0]),
      e:LX(`Real data: ${DOM_EN[e[0][0]]} ≈ ${e[0][1].toFixed(0)}% of classified reads.`,`Dato real: ${e[0][0]} ≈ ${e[0][1].toFixed(0)}% de las lecturas clasificadas.`)});}}
  return Q;}
function openQuiz(m){if(modal)return;const Q=quizFor(m);if(!Q.length)return;let i=0,ok=0;
  const render=()=>{const q=Q[i];openModal({title:'🎓 '+LX('CLASSROOM','MODO AULA')+` ${i+1}/${Q.length}`,meta:m.c.replace('_','–')+' · '+m.en,col:'#9b5de5',close:false,
    html:`<p style="font-size:17px"><b>${q.q}</b></p><div class="xa-q">${q.o.map((o,k)=>`<button class="g-btn" data-k="${k}">${String.fromCharCode(65+k)}. ${o}</button>`).join('')}</div><p class="note" id="xa-qe"></p><div class="g-row"><button class="g-btn y" id="xa-qn" style="display:none">${i<Q.length-1?LX('NEXT ➜','SIGUIENTE ➜'):LX('DONE ✔','LISTO ✔')}</button></div>`,
    init(){const bs=[...document.querySelectorAll('.xa-q .g-btn')];bs.forEach(b=>b.onclick=()=>{if(bs.some(x=>x.disabled))return;bs.forEach(x=>x.disabled=true);const k=+b.dataset.k;const good=k===q.a;
      bs[q.a].style.background='#8ac926';if(!good)b.style.background='#ff6b6b';$('#xa-qe').innerHTML=(good?'✔ ':'✘ ')+q.e;
      if(good){ok++;const pts=Math.round(20*mult());S.score+=pts;life.quiz++;lifeDirty=1;AU.sfx.tada();powAt(LX('CORRECT!','¡CORRECTO!')+' +'+pts,'#8ac926',38,.4);}else AU.sfx.beep&&AU.sfx.beep();
      $('#xa-qn').style.display='';});
      $('#xa-qn').onclick=()=>{closeModal();i++;if(i<Q.length)setTimeout(render,120);else{save();toast(`🎓 ${ok}/${Q.length} ${LX('correct','correctas')}`,false,2500);}};}});};render();}
// ---------------- run completion (time trial / daily) + local records
function finishRun(){const R=X.run;if(!R||R.done)return;R.done=true;const time=S.t-R.t0;const name=(charNames&&charNames[charIdx])||'Scientist';
  const key=R.mode==='ta'?'cfc_ta_board':'cfc_daily_'+dailyKey();const board=LS(key,[]);const me={n:name,t:time,s:S.score,d:dailyKey(),diff:R.diff,id:Date.now()};board.push(me);board.sort((a,b)=>a.t-b.t);SS(key,board.slice(0,15));
  unlock(R.mode==='ta'?'ta':'daily');if(R.mode==='ta')ghostSave(time);
  const rows=LS(key,[]);const rank=rows.findIndex(r=>r.id===me.id)+1;
  if(modal)closeModal();
  openModal({title:R.mode==='ta'?'🏁 '+LX('TIME TRIAL COMPLETE','¡CONTRARRELOJ COMPLETA!'):'📅 '+LX('DAILY CHALLENGE COMPLETE','¡DESAFÍO DIARIO COMPLETO!'),meta:`${fmtT(time)} · ${LX('score','puntaje')} ${S.score}`,col:'#ffd23f',close:false,
    html:`<p style="font-size:20px">${rank===1?'🥇 '+LX('New personal record!','¡Nuevo récord personal!'):LX('Rank','Posición')+' #'+rank}</p>${recTable(rows,me.id)}
     <p class="note">${LX('Records are saved in this browser.','Los récords se guardan en este navegador.')}</p><div class="g-row"><button class="g-btn y" id="xa-r1">↻ ${LX('TRY AGAIN','OTRA VEZ')}</button><button class="g-btn" id="xa-r2">🛻 ${LX('KEEP DRIVING','SEGUIR MANEJANDO')}</button><button class="g-btn" id="xa-r3">🏠 ${LX('TITLE','MENÚ')}</button></div>`,
    init(){$('#xa-r1').onclick=()=>{closeModal();S.sites={};S.samples=[];S.score=0;S.t=0;S.shipped=false;S.target=null;S.quakeAt=QUAKE_AT;clearEruption();clearKits();resetPositions();save();start();};
      $('#xa-r2').onclick=()=>{closeModal();X.run.goal=null;};$('#xa-r3').onclick=()=>{closeModal();showTitle();};}});
  AU.sfx.tada();}
function recTable(rows,mine){if(!rows.length)return `<p class="note">${LX('No runs yet.','Aún no hay partidas.')}</p>`;const td='style="border:1.5px solid #1d1a2b;padding:3px 6px"';
  return `<table style="width:100%;border-collapse:collapse;background:#fff;font-size:13px"><tr><th ${td}>#</th><th ${td}>${LX('Scientist','Científico/a')}</th><th ${td}>${LX('Time','Tiempo')}</th><th ${td}>${LX('Score','Puntaje')}</th><th ${td}>${LX('Difficulty','Dificultad')}</th><th ${td}>${LX('Date','Fecha')}</th></tr>${rows.map((r,i)=>`<tr style="${r.id===mine?'background:#c9f7d8;font-weight:700':''}"><td ${td}>${i<3?['🥇','🥈','🥉'][i]:i+1}</td><td ${td}>${esc2(r.n)}</td><td ${td}>${fmtT(r.t)}</td><td ${td}>${r.s|0}</td><td ${td}>${r.diff||''}</td><td ${td}>${r.d}</td></tr>`).join('')}</table>`;}
const _openHall=openHall;openHall=function(){_openHall.apply(this,arguments);const mb=$('#g-mb');if(!mb)return;$('#g-mm').textContent=LX('Your best runs on this device','Tus mejores partidas en este equipo');
  const ex=document.createElement('div');ex.innerHTML=`<h4>🏁 ${LX('TIME TRIAL','CONTRARRELOJ')}</h4>${recTable(LS('cfc_ta_board',[]))}<h4>📅 ${LX('TODAY\'S CHALLENGE','DESAFÍO DE HOY')} (${dailyKey()})</h4>${recTable(LS('cfc_daily_'+dailyKey(),[]))}`;mb.appendChild(ex);};
// ---------------- ghost race (time trial): replays your best run
let ghost=null;
function ghostStart(){if(ghost){Wd.scene.remove(ghost.g);ghost=null;}const best=LS('cfc_ta_ghost',null);if(!best||!best.p||best.p.length<4)return;
  let g;try{g=makeTruck(PK.veh(VEH.type),'#b8f3ff');}catch(e){g=new THREE.Mesh(new THREE.BoxGeometry(.2,.1,.12),new THREE.MeshBasicMaterial({color:'#b8f3ff'}));}
  g.traverse(o=>{if(o.material){o.material=o.material.clone();o.material.transparent=true;o.material.opacity=.42;o.material.depthWrite=false;}o.castShadow=false;});Wd.scene.add(g);ghost={g,p:best.p,t:best.t};
  setTimeout(()=>toast(LX(`👻 Your best time (${fmtT(best.t)}) races you as a ghost truck.`,`👻 Tu mejor tiempo (${fmtT(best.t)}) te corre como camioneta fantasma.`),false,3500),5200);}
function ghostSave(time){const best=LS('cfc_ta_ghost',null);if(!best||time<best.t)SS('cfc_ta_ghost',{t:time,p:X.run.path.slice(0,3000)});}
function ghostUpd(){if(!ghost||!X.run)return;const tt=(S.t-X.run.t0)/.5;const i=Math.floor(tt),f=tt-i;const P=ghost.p;if(i>=P.length-1){ghost.g.visible=false;return;}
  const a=P[i],b=P[i+1];const x=a[0]+(b[0]-a[0])*f,z=a[1]+(b[1]-a[1])*f;ghost.g.visible=true;ghost.g.position.set(x,Wd.heightAt(x,z),z);ghost.g.rotation.set(0,a[2]+angDiff(a[2],b[2])*f,0);}
const angDiff=(a,b)=>((b-a+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
// ---------------- road events
const EVT={next:80,cur:null};
const gmat=c=>Wd.toon(c);
function guanaco(){const g=new THREE.Group();const B=(w,h,d,c,x,y,z)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),gmat(c));m.position.set(x,y,z);g.add(m);return m;};
  B(.09,.04,.035,'#c98a4b',0,.075,0);B(.02,.07,.018,'#c98a4b',.045,.115,0).rotation.z=-.25;B(.03,.02,.018,'#e8c9a0',.062,.15,0);B(.006,.014,.004,'#c98a4b',.056,.165,.006);B(.006,.014,.004,'#c98a4b',.056,.165,-.006);
  B(.042,.012,.037,'#f2e2c8',0,.056,0);[[.035,.012],[.035,-.012],[-.035,.012],[-.035,-.012]].forEach(([x,z])=>B(.008,.055,.008,'#b07a42',x,.028,z));g.userData.legs=g.children.slice(-4);return g;}
function clearEvt(){const E=EVT.cur;if(E&&E.g)Wd.scene.remove(E.g);EVT.cur=null;const el=$('#xa-evt');if(el)el.style.display='none';}
function startEvt(){const onRoad=roadDist(truck.x,truck.z)<.08;const fx=Math.cos(truck.yaw),fz=-Math.sin(truck.yaw);const kinds=['guanaco','flat','fog','ride'];let k=kinds[Math.floor(Math.random()*kinds.length)];
  if(!onRoad&&(k==='guanaco'||k==='ride'))k=Math.random()<.5?'flat':'fog';
  if(k==='guanaco'){const d=1.25;const cx=truck.x+fx*d,cz=truck.z+fz*d;const nx=-fz,nz=fx;const g=guanaco();Wd.scene.add(g);
    EVT.cur={k,g,t:0,x0:cx-nx*.55,z0:cz-nz*.55,x1:cx+nx*.55,z1:cz+nz*.55,hit:false,minSp:9};toast(LX('🦙 Guanaco crossing ahead — brake!','🦙 ¡Guanaco cruzando adelante, frena!'),true,2600);AU.sfx.horn&&0;}
  else if(k==='flat'){EVT.cur={k,t:0,fix:0};toast(LX('💥 Flat tyre! Stop and hold <kbd>R</kbd> to change it (or limp along slowly).','💥 ¡Pinchazo! Detente y mantén <kbd>R</kbd> para cambiar la rueda (o sigue muy lento).'),true,4200);AU.sfx.tear&&AU.sfx.tear();powAt('¡PSSSHH!','#ff8a1c',40);}
  else if(k==='fog'){EVT.cur={k,t:0,dur:26,crash:false};toast(LX('🌫 Sudden fog bank — drive carefully! (+15 if you don\'t crash)','🌫 Niebla repentina: ¡maneja con cuidado! (+15 si no chocas)'),false,3500);}
  else{const d=1.4;const px=truck.x+fx*d-fz*.12,pz=truck.z+fz*d+fx*.12;let g;const ci=(charIdx+1+Math.floor(Math.random()*(CHARS.length-1)))%CHARS.length;try{g=makePerson(CHARS[ci]);}catch(e){g=guanaco();}
    g.position.set(px,Wd.heightAt(px,pz),pz);g.rotation.y=truck.yaw+Math.PI;Wd.scene.add(g);EVT.cur={k,g,t:0,x:px,z:pz,who:(charNames&&charNames[ci])||'Colleague'};
    toast(LX(`🙋 ${EVT.cur.who} is waiting by the road — stop next to them to give a lift!`,`🙋 ${EVT.cur.who} espera junto al camino: ¡detente a su lado para llevarle!`),false,3800);}}
function updEvt(dt){const playing=mode==='play'&&!modal&&!EV.cine&&!X.photo;const el=$('#xa-evt');
  if(!EVT.cur){if(!playing||!pl.inTruck||EV.st!=='calm'||WX.block||Math.abs(truck.speed)<.6)return;EVT.next-=dt*(cfg.diff==='expedition'?1.7:cfg.diff==='relaxed'?.6:1);if(EVT.next<=0){EVT.next=75+Math.random()*60;startEvt();}return;}
  const E=EVT.cur;E.t+=dt;
  if(E.k==='guanaco'){const k=Math.min(1,E.t/3.6);const x=E.x0+(E.x1-E.x0)*k,z=E.z0+(E.z1-E.z0)*k;E.g.position.set(x,Wd.heightAt(x,z),z);E.g.rotation.y=Math.atan2(-(E.z1-E.z0),E.x1-E.x0);
    E.g.userData.legs.forEach((l,i)=>l.rotation.z=Math.sin(E.t*14+i*1.6)*.5);const d=Math.hypot(truck.x-x,truck.z-z);if(d<.6)E.minSp=Math.min(E.minSp,Math.abs(truck.speed));
    if(!E.hit&&d<.13&&Math.abs(truck.speed)>.7){E.hit=true;truck.speed*=-.2;EV.shake=Math.max(EV.shake,.5);S.score=Math.max(0,S.score-15);powAt('¡PLAF!','#ff4f3a',48);toast(LX('🦙 Bonk! The guanaco is fine (and offended). −15','🦙 ¡Paf! El guanaco está bien (y ofendido). −15'),true,2500);const dx=E.x1-E.x0,dz=E.z1-E.z0;E.x0=x;E.z0=z;E.x1=x+dx*1.5;E.z1=z+dz*1.5;E.t=0;}
    if(k>=1){if(!E.hit&&E.minSp<.8){const p=Math.round(20*mult());S.score+=p;powAt(LX('NICE BRAKING!','¡BUENA FRENADA!')+' +'+p,'#8ac926',36);unlock('brake');}clearEvt();}}
  else if(E.k==='flat'){const fixing=K('KeyR')&&Math.abs(truck.speed)<.15&&pl.inTruck;if(fixing)E.fix+=dt/3;else E.fix=Math.max(0,E.fix-dt*.5);
    el.style.display='';el.innerHTML=`💥 ${LX('Flat tyre','Pinchazo')} · ${LX('stop + hold R','detente y mantén R')} <span class="xa-prog" style="display:inline-block;vertical-align:middle"><b style="width:${(E.fix*100).toFixed(0)}%"></b></span>`;
    if(E.fix>=1){const p=Math.round(10*mult());S.score+=p;powAt(LX('FIXED!','¡LISTO!')+' +'+p,'#8ac926',38);unlock('fixer');clearEvt();}else if(E.t>120)clearEvt();}
  else if(E.k==='fog'){el.style.display='';el.innerHTML=`🌫 ${LX('Fog','Niebla')} · ${Math.ceil(E.dur-E.t)} s`;if(E.t>E.dur){if(!E.crash){const p=Math.round(15*mult());S.score+=p;powAt(LX('SAFE DRIVING!','¡MANEJO SEGURO!')+' +'+p,'#8ac926',34);}clearEvt();}}
  else if(E.k==='ride'){const d=Math.hypot(truck.x-E.x,truck.z-E.z);E.g.rotation.y=Math.atan2(-(truck.z-E.z),truck.x-E.x);
    if(d<.35&&Math.abs(truck.speed)<.25&&pl.inTruck){const p=Math.round(30*mult());S.score+=p;powAt(LX('THANKS!','¡GRACIAS!')+' +'+p,'#ffd23f',40);toast(LX(`🤝 ${E.who} hops in the back. Teamwork!`,`🤝 ${E.who} se sube atrás. ¡Trabajo en equipo!`),false,2600);unlock('ride');clearEvt();}
    else if(d>6||E.t>90)clearEvt();}}
// ---------------- driving feel: turbo, lean, bumps, FOV kick, speed lines, dust
const TB={t:0,cd:0};const _vmax=PK.vmax;PK.vmax=function(r){let v=_vmax.apply(this,arguments);if(TB.t>0)v*=1.5;const E=EVT.cur;if(E&&E.k==='flat')v*=.45;if(E&&E.k==='fog')v*=.75;if(cfg.diff==='expedition')v*=.92;return v;};
const DUSTP=[];let dustT=0;let dustTex=null;
function dustTexture(){if(dustTex)return dustTex;const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');x.fillStyle='#fff';x.strokeStyle='#1d1a2b';x.lineWidth=5;
  x.beginPath();for(let i=0;i<9;i++){const a=i/9*6.283,r=22+Math.sin(i*2.3)*5;x.lineTo(32+Math.cos(a)*r,32+Math.sin(a)*r);}x.closePath();x.fill();x.stroke();dustTex=new THREE.CanvasTexture(c);return dustTex;}
function spawnDust(x,y,z,col){let p=DUSTP.find(q=>q.life<=0);if(!p){if(DUSTP.length>=46)return;const s=new THREE.Sprite(new THREE.SpriteMaterial({map:dustTexture(),transparent:true,depthWrite:false}));Wd.scene.add(s);p={s,life:0};DUSTP.push(p);}
  p.s.material.color.set(col);p.s.position.set(x,y,z);p.life=1;p.v=[(Math.random()-.5)*.08,.07+Math.random()*.06,(Math.random()-.5)*.08];p.s.visible=true;}
function updDust(dt){for(const p of DUSTP){if(p.life<=0)continue;p.life-=dt*1.3;if(p.life<=0){p.s.visible=false;continue;}p.s.position.x+=p.v[0]*dt;p.s.position.y+=p.v[1]*dt;p.s.position.z+=p.v[2]*dt;const k=1-p.life;const sc=.05+k*.13;p.s.scale.set(sc,sc,1);p.s.material.opacity=.8*p.life;}}
// footprints on ash / snow
const FP_N=80;let fpMesh=null,fpI=0,fpSide=1,lastStep=0;const fpM=new THREE.Matrix4(),fpQ=new THREE.Quaternion(),fpS=new THREE.Vector3(),fpP=new THREE.Vector3();
function footprint(){if(!fpMesh){fpMesh=new THREE.InstancedMesh(new THREE.CircleGeometry(.0085,7).rotateX(-Math.PI/2).scale(1,1,1.6),new THREE.MeshBasicMaterial({color:'#3a3348',transparent:true,opacity:.45,depthWrite:false}),FP_N);
  for(let i=0;i<FP_N;i++)fpMesh.setMatrixAt(i,new THREE.Matrix4().makeScale(0,0,0));fpMesh.frustumCulled=false;fpMesh.renderOrder=2;Wd.scene.add(fpMesh);}
  const cx=Math.cos(pl.yaw),cz=-Math.sin(pl.yaw);fpSide=-fpSide;const x=pl.x+cz*.012*fpSide,z=pl.z-cx*.012*fpSide;fpP.set(x,Wd.heightAt(x,z)+.004,z);fpQ.setFromAxisAngle(new THREE.Vector3(0,1,0),pl.yaw+Math.PI/2);fpS.set(1,1,1);
  fpM.compose(fpP,fpQ,fpS);fpMesh.setMatrixAt(fpI,fpM);fpI=(fpI+1)%FP_N;fpMesh.instanceMatrix.needsUpdate=true;}
// ---------------- embers (own pooled sparks)
const EMB=[];let embTex=null;
function spark(x,y,z,n,col,spd,life,size){if(!embTex){const c=document.createElement('canvas');c.width=c.height=32;const g=c.getContext('2d');const r=g.createRadialGradient(16,16,0,16,16,16);r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.35,'rgba(255,255,255,.8)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,32,32);embTex=new THREE.CanvasTexture(c);}
  for(let i=0;i<n;i++){let p=EMB.find(q=>q.life<=0);if(!p){if(EMB.length>=140)return;const s=new THREE.Sprite(new THREE.SpriteMaterial({map:embTex,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));Wd.scene.add(s);p={s,life:0};EMB.push(p);}
    p.s.material.color.set(col);p.s.position.set(x,y,z);p.life=p.l0=life||1;p.sz=size||.05;p.v=[(Math.random()-.5)*(spd||.5),Math.random()*(spd||.5),(Math.random()-.5)*(spd||.5)];p.s.visible=true;}}
function updEmb(dt){for(const p of EMB){if(p.life<=0)continue;p.life-=dt;if(p.life<=0){p.s.visible=false;continue;}p.v[1]-=dt*.6;p.s.position.x+=p.v[0]*dt;p.s.position.y+=p.v[1]*dt;p.s.position.z+=p.v[2]*dt;const k=p.life/p.l0;p.s.scale.set(p.sz*k,p.sz*k,1);p.s.material.opacity=k;}}
// ---------------- eruption extras: ash column, lava bombs, red sky
const ASH=[];const BOMBS=[];let ashOn=false;
function updEruptFX(dt){const on=EV.st==='erupt';if(!on&&!ASH.length&&!BOMBS.length)return;const c=crater();
  if(on&&ASH.length<30&&Math.random()<dt*9){const m=new THREE.Mesh(new THREE.IcosahedronGeometry(.5,1),Wd.toon(Math.random()<.5?'#4b4455':'#5d5566'));m.position.set(c.x+(Math.random()-.5)*.8,c.y+.4,c.z+(Math.random()-.5)*.8);m.userData={v:1.6+Math.random()*1.2,g:.5+Math.random()*.5,life:0};m.scale.setScalar(.4);Wd.scene.add(m);ASH.push(m);}
  for(let i=ASH.length-1;i>=0;i--){const m=ASH[i],u=m.userData;u.life+=dt;m.position.y+=u.v*dt*(1-Math.min(.8,u.life/9));m.position.x+=dt*.35*u.life*.3;const s=.4+u.life*u.g;m.scale.setScalar(s);m.rotation.y+=dt*.3;
    if(u.life>(on?12:4)){Wd.scene.remove(m);m.geometry.dispose();m.material.dispose();ASH.splice(i,1);}}
  if(on&&Math.random()<dt*4){const m=new THREE.Mesh(new THREE.SphereGeometry(.07,7,5),new THREE.MeshBasicMaterial({color:'#ff6a1a'}));m.position.set(c.x,c.y+.5,c.z);const a=Math.random()*6.283,sp=1.5+Math.random()*2.5;
    m.userData={v:new THREE.Vector3(Math.cos(a)*sp,4+Math.random()*3,Math.sin(a)*sp),life:0};Wd.scene.add(m);BOMBS.push(m);}
  for(let i=BOMBS.length-1;i>=0;i--){const m=BOMBS[i],u=m.userData;u.life+=dt;u.v.y-=6*dt;m.position.addScaledVector(u.v,dt);if(Math.random()<dt*14)spark(m.position.x,m.position.y,m.position.z,1,0xffb347,.2,.5,.05);
    if(m.position.y<Wd.heightAt(m.position.x,m.position.z)||u.life>4){spark(m.position.x,m.position.y+.05,m.position.z,5,0xff6a1a,.6,.7,.06);Wd.scene.remove(m);m.geometry.dispose();m.material.dispose();BOMBS.splice(i,1);}}}
const _clearEruption=clearEruption;clearEruption=function(){_clearEruption.apply(this,arguments);ASH.forEach(m=>Wd.scene.remove(m));ASH.length=0;BOMBS.forEach(m=>Wd.scene.remove(m));BOMBS.length=0;};
const lerpV=(v,arr,k)=>v.set(v.x+(arr[0]-v.x)*k,v.y+(arr[1]-v.y)*k,v.z+(arr[2]-v.z)*k);
let redK=0;
const _uwe=updateWorldEnv;updateWorldEnv=function(dt,active){
  if(active&&!WX.type){if(cfg.diff==='relaxed')WX.next=Math.max(WX.next,9999);else if(cfg.diff==='expedition'&&WX.next>55)WX.next=55;if(X.run&&X.run.forceWx&&WX.next>8){WX.next=8;}}
  _uwe.apply(this,arguments);
  if(X.run&&X.run.forceWx&&WX.type){if(WX.type!==X.run.forceWx)WX.type=X.run.forceWx;X.run.forceWx=null;}
  const u=Wd.postMat.uniforms;redK+=((EV.st==='erupt'?1:EV.st==='quake'?.25:0)-redK)*Math.min(1,dt*.8);
  if(redK>.01){lerpV(u.skyT.value,[.5,.1,.08],redK*.85);lerpV(u.skyB.value,[1,.42,.18],redK*.8);lerpV(u.tint.value,[1.12,.82,.72],redK*.55);}
  const E=EVT.cur;if(E&&E.k==='fog'){const f=Math.min(1,E.t/3,(E.dur-E.t)/3);u.snowK.value=Math.max(u.snowK.value,.5*f);}
  // night: lit windows, glowing crater lake, wind
  const n=WX.night||0;Wd.winMat.color.setRGB(.17+.83*n,.24+.6*n,.4-.02*n);
  const cl=Wd.LAKES&&Wd.LAKES.find(l=>/Cr[aá]ter/.test(l.n));if(cl&&cl.mesh)cl.mesh.material.uniforms.glow.value=.06+n*.45;
  Wd.WIND.amp.value=1+(WX.snow||0)*1.8+(WX.rainK||0)*1.2;};
// fireflies at night
const FF=[];let ffTex=null;
function updFireflies(dt,t){const want=(WX.night||0)>.45&&mode==='play'&&meters(Wd.heightAt(pl.x,pl.z))<2050;
  if(want&&!FF.length){if(!ffTex){const c=document.createElement('canvas');c.width=c.height=32;const x=c.getContext('2d');const g=x.createRadialGradient(16,16,0,16,16,16);g.addColorStop(0,'rgba(255,255,190,1)');g.addColorStop(.3,'rgba(210,255,120,.8)');g.addColorStop(1,'rgba(160,255,80,0)');x.fillStyle=g;x.fillRect(0,0,32,32);ffTex=new THREE.CanvasTexture(c);}
    for(let i=0;i<26;i++){const s=new THREE.Sprite(new THREE.SpriteMaterial({map:ffTex,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));s.scale.set(.035,.035,1);s.userData={a:Math.random()*6.28,r:.2+Math.random()*.9,h:.03+Math.random()*.18,sp:.2+Math.random()*.5,ph:Math.random()*9};Wd.scene.add(s);FF.push(s);}}
  if(!want&&FF.length){FF.forEach(s=>Wd.scene.remove(s));FF.length=0;}
  FF.forEach(s=>{const u=s.userData;u.a+=dt*u.sp;const x=pl.x+Math.cos(u.a)*u.r,z=pl.z+Math.sin(u.a*1.3)*u.r;s.position.set(x,Wd.heightAt(x,z)+u.h+Math.sin(t*2+u.ph)*.03,z);s.material.opacity=.5+.5*Math.sin(t*3+u.ph);});}
// ---------------- models: lean, bumps, FOV
let lean=0,fovK=0,prevSpeed=0;
const _um=updateModels;updateModels=function(dt,t){_um.apply(this,arguments);if(!truck.g)return;
  // sampling-site rings: always drawn on top of road/river ribbons and slopes (only when near, so they don't show through hills)
  for(const m of M){const b=m.b&&m.b.userData;if(!b||!b.ring)continue;const r=b.ring;
    if(!r.userData.xa){r.material=r.material.clone();r.material.depthTest=false;r.renderOrder=6;r.position.y=.045;r.userData.xa=1;}
    if(r.visible)r.visible=cam.map||Math.hypot(pl.x-m.ax,pl.z-m.az)<6;}
  // vehicles fording a river ride on the water surface instead of disappearing under the ribbon
  {const r=riverHW(truck.x,truck.z);if(r.d<r.hw){const y=Wd.heightAt(truck.x,truck.z)+.05;if(truck.g.position.y<y)truck.g.position.y=y;}}
  if(!pl.inTruck&&pl.g){const r=riverHW(pl.x,pl.z);if(r.d<r.hw){const y=Wd.heightAt(pl.x,pl.z)+.035;if(pl.g.position.y<y)pl.g.position.y=y;}}
  const ax=inputAxes()[0];const sp=truck.speed;const tl=pl.inTruck&&mode==='play'?-ax*clamp(Math.abs(sp)/2.5,0,1)*.13:0;lean+=(tl-lean)*Math.min(1,dt*6);truck.g.rotation.x+=lean;
  const off=roadDist(truck.x,truck.z)>.08;if(off&&Math.abs(sp)>.4)truck.g.position.y+=Math.abs(Math.sin(t*23+truck.x*40))*.006*Math.min(1,Math.abs(sp)/1.5);
  const want=pl.inTruck&&mode==='play'?clamp((Math.abs(sp)-1.6)/1.8,0,1)+(TB.t>0?.8:0):0;fovK+=(want-fovK)*Math.min(1,dt*3);const f=(fpOn()?70:42)+fovK*7;if(Math.abs(Wd.camera.fov-f)>.02){Wd.camera.fov=f;Wd.camera.updateProjectionMatrix();}};
// ---------------- photo mode
let DL=null;try{if(window.claude&&window.claude.use)Promise.resolve(window.claude.use('downloads')).then(d=>{DL=d;}).catch(()=>{});}catch(e){}
const frame=document.createElement('div');frame.id='xa-frame';frame.innerHTML='<div class="cap" id="xa-cap"></div>';document.body.appendChild(frame);
const pbar=document.createElement('div');pbar.id='xa-pbar';pbar.innerHTML=`<button class="g-btn" id="xa-pf">🎨 ${LX('Filter','Filtro')}</button><button class="g-btn y" id="xa-ps">💾 ${LX('Save photo','Guardar foto')}</button><button class="g-btn" id="xa-px">✕ ${LX('Exit','Salir')} (K)</button>`;document.body.appendChild(pbar);
const FILT=['none','sepia(.85) contrast(1.05)','grayscale(1) contrast(1.35)','saturate(1.6) contrast(1.1)'];let filtI=0;
function togglePhoto(){if(modal||mode!=='play')return;X.photo=!X.photo;document.body.classList.toggle('xa-photo',X.photo);frame.style.display=X.photo?'block':'none';pbar.style.display=X.photo?'flex':'none';
  const C=Wd.controls;if(X.photo){X.ctlPrev=C.enabled;C.enabled=true;C.target.copy(Wd.controls.target);const near=M.slice().sort((a,b)=>Math.hypot(pl.x-a.ax,pl.z-a.az)-Math.hypot(pl.x-b.ax,pl.z-b.az))[0];
    $('#xa-cap').textContent='COPAHUE · '+(near&&Math.hypot(pl.x-near.ax,pl.z-near.az)<3?near.en.toUpperCase():'NEUQUÉN')+' · '+dailyKey();C.minDistance=.3;}
  else{C.enabled=!!X.ctlPrev;C.minDistance=1.2;Wd.canvas&&(Wd.canvas.style.filter='');document.getElementById('gl').style.filter='';}}
$('#xa-px').onclick=togglePhoto;$('#xa-pf').onclick=()=>{filtI=(filtI+1)%FILT.length;document.getElementById('gl').style.filter=FILT[filtI]==='none'?'':FILT[filtI];};
$('#xa-ps').onclick=()=>{X.snapReq=true;};
window.__afterRender=()=>{if(!X.snapReq)return;X.snapReq=false;try{const src=document.getElementById('gl');const w=src.width,h=src.height;const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');
  if(FILT[filtI]!=='none')x.filter=FILT[filtI];x.drawImage(src,0,0);x.filter='none';const b=Math.round(h*.02);x.lineWidth=b*2;x.strokeStyle='#1d1a2b';x.strokeRect(0,0,w,h);x.lineWidth=b*.5;x.strokeStyle='#fffdf5';x.strokeRect(b*1.4,b*1.4,w-b*2.8,h-b*2.8);
  const cap=$('#xa-cap').textContent;x.font=`${Math.round(h*.045)}px Bangers, Impact, sans-serif`;const tw=x.measureText(cap).width;const cx=b*2.4,cy=h-b*2.4-h*.06;x.fillStyle='#1d1a2b';x.fillRect(cx+6,cy+6,tw+b*2,h*.06);x.fillStyle='#ffd23f';x.fillRect(cx,cy,tw+b*2,h*.06);x.strokeStyle='#1d1a2b';x.lineWidth=3;x.strokeRect(cx,cy,tw+b*2,h*.06);x.fillStyle='#1d1a2b';x.fillText(cap,cx+b,cy+h*.047);
  const url=c.toDataURL('image/jpeg',.92);life.photos++;lifeDirty=1;AU.sfx.stamp&&AU.sfx.stamp();
  togglePhoto();openModal({title:'📸 '+LX('PHOTO','FOTO'),meta:DL?LX('Confirm the save prompt to keep your photo.','Confirma el aviso para guardar tu foto.'):LX('Right-click the image → Save image as…','Clic derecho sobre la imagen → Guardar imagen como…'),col:'#ffd23f',html:`<img src="${url}" style="width:100%;border:3px solid #1d1a2b;border-radius:6px">`});
  if(DL)c.toBlob(bl=>{if(!bl)return;DL.save({filename:'copahue_'+dailyKey()+'_'+Date.now()%100000+'.jpg',data:bl}).catch(e=>{if(e&&e.code!=='declined')console.warn('download',e&&e.code);});},'image/jpeg',.92);}catch(e){console.warn(e);toast(LX('Could not capture the photo here.','No se pudo capturar la foto aquí.'),true);}};
// ---------------- inputs
addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT/.test((e.target&&e.target.tagName)||''))return;if(e.code==='KeyK'&&!modal)togglePhoto();if((e.code==='ShiftLeft'||e.code==='ShiftRight')&&pl.inTruck)X.turboReq=true;});
// ---------------- hooks for existing events
const _horn=AU.sfx.horn;if(_horn)AU.sfx.horn=function(){_horn.apply(this,arguments);if(pl.inTruck&&truck.g)pow('¡BEEP BEEP!',truck.x,truck.g.position.y+.25,truck.z,'#ffd23f',34);};
const _spl=AU.sfx.splash;if(_spl)AU.sfx.splash=function(){_spl.apply(this,arguments);if(Wd&&mode==='play')powAt('¡SPLASH!','#4cc9f0',38,.2);};
const _fe=findEgg;findEgg=function(){const r=_fe.apply(this,arguments);powAt('¡EUREKA!','#b15cff',40,.4);return r;};
let prevEv='calm',prevCarry=0;
// ---------------- language switch: refresh our labels
if(typeof setLang==='function'){const _sl=setLang;setLang=function(){_sl.apply(this,arguments);try{$('#xa-jb').textContent='📓 '+LX('JOURNAL','DIARIO');$('#xa-ab').textContent='🏅 '+LX('BADGES','LOGROS');$('#xa-pb').textContent='📷 '+LX('PHOTO','FOTO')+' (K)';}catch(e){}};}
// ---------------- keep filtration kits on dry ground, away from rivers/lakes and from every water point
function riverHW(x,z){const rv=Wd.nearestRiver(x,z);const R=Wd.RIVERS&&Wd.RIVERS[rv.ri];return {d:rv.d,hw:(R&&R.w?R.w*1.3:.06)};}
function dryOK(x,z,anchor){if(!walkable(x,z))return false;for(const k of kits){if(Math.hypot(x-k.x,z-k.z)<.5)return false;}const E=Wd.infoAt(x,z);if(!E||E.dl<.12)return false;const r=riverHW(x,z);if(r.d<r.hw+.07)return false;
  for(const m of M){if(!st(m.c).done&&Math.hypot(x-m.ax,z-m.az)<.78)return false;}if(anchor&&Math.hypot(x-anchor.ax,z-anchor.az)>1.7)return false;
  const b=Math.hypot(x-base.x,z-base.z);if(b<.8)return false;return true;}
function dryNear(x,z){let anchor=null,ad=1e9;for(const m of M){if(st(m.c).done)continue;const d=Math.hypot(x-m.ax,z-m.az);if(d<ad){ad=d;anchor=m;}}if(ad>2.5)anchor=null;
  if(dryOK(x,z,anchor))return [x,z];for(let r=.05;r<1.8;r+=.04)for(let a=0;a<28;a++){const q=a/28*6.283,px=x+Math.cos(q)*r,pz=z+Math.sin(q)*r;if(dryOK(px,pz,anchor))return [px,pz];}
  for(let r=.05;r<3;r+=.05)for(let a=0;a<36;a++){const q=a/36*6.283,px=x+Math.cos(q)*r,pz=z+Math.sin(q)*r;if(dryOK(px,pz,null))return [px,pz];}return [x,z];}
const _addKit=addKit;addKit=function(x,z){const p=dryNear(x,z);const r=_addKit.call(this,p[0],p[1]);if(Math.hypot(p[0]-x,p[1]-z)>.05&&mode==='play')setTimeout(()=>toast(LX('🎒 Kit set up on dry ground next to the water.','🎒 Kit armado en suelo seco, al lado del agua.'),false,2200),4300);return r;};
// ---------------- main per-frame
X.dbg={kitTest:(c)=>{const m=M.find(q=>q.c===c);addKit(m.ax,m.az);const k=kits[kits.length-1];const r=riverHW(k.x,k.z);return {site:[m.ax,m.az],kit:[k.x,k.z],dist:Math.hypot(k.x-m.ax,k.z-m.az),riverD:r.d,hw:r.hw,dl:Wd.infoAt(k.x,k.z).dl,ws:Wd.RIVERS.map(R=>R.w)};},erupt:()=>startEruption(),night:()=>{WX.tod=22.5;},cd:(c)=>{const m=M.find(q=>q.c===c);const s=st(c);s.probe={v:(m.smp&&m.smp.v)||{pH:2.1,'Temp.[ºC]':40},t:8};s.filt={rupt:0,m045:1,m022:1,t:20};checkDone(m);},startEvt,EVT,finishRun,openQuiz,cfg,pow,checkAch,TB,togglePhoto,openJournal,openAch};
const _gt=GAME.tick;GAME.tick=function(dt,t){
  if(X.photo){Wd.controls.update();updPows();speedEl.style.opacity=0;return;}
  _gt.apply(this,arguments);
  const playing=mode==='play'&&!modal;
  // turbo
  if(TB.cd>0)TB.cd-=dt;if(TB.t>0)TB.t-=dt;
  if(X.turboReq){X.turboReq=false;if(pl.inTruck&&playing&&TB.cd<=0&&truck.speed>.3){TB.t=2.2;TB.cd=9;truck.speed+=.6;life.turbo++;lifeDirty=1;powAt('¡VROOOM!','#ff8a1c',46);EV.shake=Math.max(EV.shake,.15);AU.sfx.skid&&AU.sfx.skid();}}
  const tbEl=$('#xa-turbo');tbEl.style.display=pl.inTruck&&mode==='play'?'':'none';tbEl.querySelector('b').style.width=(TB.t>0?100*TB.t/2.2:100*(1-Math.max(0,TB.cd)/9)).toFixed(0)+'%';
  // crash detection
  if(pl.inTruck&&prevSpeed>1.1&&truck.speed<0){powAt('¡CRASH!','#ff4f3a',50);EV.shake=Math.max(EV.shake,.45);const E=EVT.cur;if(E&&E.k==='fog')E.crash=true;}prevSpeed=truck.speed;
  // speed lines
  const sl=pl.inTruck&&mode==='play'?clamp((Math.abs(truck.speed)-2.2)/1.6,0,1)*.8+(TB.t>0?.35:0):0;speedEl.style.opacity=sl.toFixed(2);if(sl>0)speedEl.style.transform=`rotate(${(Math.random()-.5)*3}deg) scale(${1+Math.random()*.02})`;
  // dust
  if(pl.inTruck&&Math.abs(truck.speed)>.7&&mode==='play'){dustT-=dt;if(dustT<=0){dustT=.05/Math.min(2,Math.abs(truck.speed));const E=Wd.infoAt(truck.x,truck.z);const off=roadDist(truck.x,truck.z)>.08;
    if(off||Math.random()<.3){const fx=Math.cos(truck.yaw),fz=-Math.sin(truck.yaw);const side=Math.random()<.5?1:-1;const x=truck.x-fx*.13+fz*.06*side,z=truck.z-fz*.13-fx*.06*side;
      spawnDust(x,Wd.heightAt(x,z)+.02,z,E.dv<5.5?'#b3abbd':meters(Wd.heightAt(x,z))>2400?'#f4f6ff':'#e8d3a2');}}}
  updDust(dt);
  // footprints
  if(!pl.inTruck&&mode==='play'){const ps=Math.floor(pl.walk/Math.PI);if(ps!==lastStep){lastStep=ps;const E=Wd.infoAt(pl.x,pl.z),al=meters(Wd.heightAt(pl.x,pl.z));if(al>2300||E.dv<5.5)footprint();}}
  // km + ghost path
  if(pl.inTruck&&mode==='play'){life.km+=Math.abs(truck.speed)*dt;lifeDirty=1;}
  if(X.run&&!X.run.done&&mode==='play'){X.run.pt-=dt;if(X.run.pt<=0){X.run.pt=.5;if(X.run.path.length<3000)X.run.path.push([+pl.x.toFixed(3),+pl.z.toFixed(3),+(pl.inTruck?truck.yaw:pl.yaw).toFixed(2)]);}}
  ghostUpd();
  // goal HUD
  const gEl=$('#xa-goal');if(X.run&&X.run.goal&&!X.run.done&&mode==='play'){const n=X.run.sites?X.run.sites.filter(c=>st(c).done).length:S.samples.length;gEl.style.display='';
    gEl.innerHTML=(X.run.mode==='ta'?'🏁 ':'📅 ')+`${n}/${X.run.goal} · ⏱ ${fmtT(S.t-X.run.t0)}`+(X.run.sites?'<br><small>'+X.run.sites.map(c=>(st(c).done?'✔':'•')+' '+c.replace('_','–')).join('  ')+'</small>':'');}else gEl.style.display='none';
  // pour / fill onomatopoeia
  if(prevCarry===0&&pl.carry>0)powAt('¡GLUG GLUG!','#4cc9f0',36,.3);if(prevCarry>0&&pl.carry===0&&!pl.inTruck)powAt('¡SPLOSH!','#4cc9f0',36,.3);prevCarry=pl.carry;
  // volcano state changes
  if(EV.st!==prevEv){if(EV.st==='quake')powAt('¡RUMBLE!','#ff8a1c',52,.5);if(EV.st==='erupt'){const c=crater();pow('¡KA-BOOOM!',c.x,c.y+2.5,c.z,'#ff4f3a',64);unlock('erupt');}prevEv=EV.st;}
  updEruptFX(dt);updEmb(dt);updEvt(dt);updFireflies(dt,t);updPows();
  if(Math.floor(t)!==Math.floor(t-dt)){checkAch();if(lifeDirty){SS('cfc_life',life);lifeDirty=0;}}
};
}

})();
