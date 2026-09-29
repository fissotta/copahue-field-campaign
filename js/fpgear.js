// Copahue Field Campaign v8 — first-person gear (viewmodel): hands, jerrycan, multiparameter sonde,
// and a 3D differential-filtration bench (carboy, funnel + membrane, Kitasato flask, vacuum gauge, pump, cryovials).
// Everything is modelled in metres inside frames scaled by M (1 m in world units; eyes at .172 ≈ 1.55 m).
// Drawn after the world into the same render target: first its silhouette is "punched" to far depth,
// then it is drawn normally, so it never sinks into the terrain but keeps its own depth (ink outlines still work).
(function(){
'use strict';
const T=THREE;let M=.111;  // metres → world units; set each frame from the character's eye height (eye ≈ 1.55 m)
const FPG={scene:null,visible:false,probe:null,filt:null,fpLast:false};window.FPG=FPG;
let W=null,vs,camF,bodyF,hemi,dir,punch,built=false,charCfg=null;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t,sm=(k,dt)=>1-Math.exp(-dt*k);
const V=(x,y,z)=>new T.Vector3(x,y,z);
const TC={};const tn=(c,o)=>W.toon(c,o||{});const tc=c=>TC[c]||(TC[c]=W.toon(c));
const glass=(c,op)=>W.toon(c||'#e6f6ff',{transparent:true,opacity:op==null?.28:op});
const cyl=(r1,r2,h,s,mat)=>new T.Mesh(new T.CylinderGeometry(r1,r2,h,s||16),mat);
const box=(x,y,z,mat)=>new T.Mesh(new T.BoxGeometry(x,y,z),mat);
const cap=(r,l,mat)=>new T.Mesh(new T.CapsuleGeometry(r,l,4,8),mat);
function canvasTex(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return {c,x:c.getContext('2d'),t};}
function waterCol(ph){try{if(W.phColor&&ph!=null){const a=W.phColor(ph);return new T.Color(a[0],a[1],a[2]);}}catch(_){}return new T.Color('#7fb8c8');}

// ------------------------------------------------------------ hands
function makeHand(side){ // side: 1 right, -1 left. Local: fingers toward -z, back of hand +y, wrist at origin, sleeve toward +z
  const g=new T.Group(),skin=tn('#e0ae8a'),sleeve=tn('#3a3d44'),cuff=tn('#2a2a30');
  const palm=new T.Mesh(new T.SphereGeometry(1,14,10),skin);palm.scale.set(.043,.017,.05);palm.position.set(0,0,-.035);g.add(palm);
  const wrist=cyl(.026,.03,.06,12,skin);wrist.rotation.x=Math.PI/2;wrist.position.z=.02;g.add(wrist);
  const slv=cyl(.035,.041,.17,14,sleeve);slv.rotation.x=Math.PI/2;slv.position.z=.145;g.add(slv);
  const cf=cyl(.037,.037,.025,14,cuff);cf.rotation.x=Math.PI/2;cf.position.z=.055;g.add(cf);
  const fingers=[];const xs=[-.027,-.009,.009,.026],ls=[.024,.027,.025,.019];
  xs.forEach((x,i)=>{const b=new T.Group();b.position.set(x*side,-.002,-.075);const s1=cap(.0088,ls[i],skin);s1.rotation.x=Math.PI/2;s1.position.z=-ls[i]/2;b.add(s1);
    const j=new T.Group();j.position.z=-ls[i];b.add(j);const s2=cap(.0082,ls[i]*.8,skin);s2.rotation.x=Math.PI/2;s2.position.z=-ls[i]*.4;j.add(s2);g.add(b);fingers.push({b,j,s:[s1,s2]});});
  const th=new T.Group();th.position.set(-.04*side,-.008,-.03);th.rotation.set(0,.75*side,-.35*side);const t1=cap(.0098,.028,skin);t1.rotation.x=Math.PI/2;t1.position.z=-.018;th.add(t1);
  const tj=new T.Group();tj.position.z=-.036;th.add(tj);const t2=cap(.009,.02,skin);t2.rotation.x=Math.PI/2;t2.position.z=-.012;tj.add(t2);g.add(th);
  const skinParts=[palm,wrist,...fingers.flatMap(f=>f.s),t1,t2];
  const H={g,side,fingers,th,tj,palm,curl:0,thumb:0,cur:{p:V(0,0,0),q:new T.Quaternion(),c:.3,init:false},
    setCurl(c,t){this.curl=c;fingers.forEach((f,i)=>{const k=c*(1+i*.04);f.b.rotation.x=-k*1.25;f.j.rotation.x=-k*1.45;});th.rotation.x=-(t==null?c:t)*.5;tj.rotation.x=-(t==null?c:t)*.9;},
    style(cfg,glove){const sk=glove?'#5f7cf0':(cfg&&cfg.skin)||'#e0ae8a';skinParts.forEach(m=>m.material=H._m(sk));if(!glove&&H.fingerless){[palm,t1,...fingers.map(f=>f.s[0])].forEach(m=>m.material=H._m(H.fingerless));}
      H.gloved=glove;if(H.acc)H.acc.children.forEach(o=>{if(o.userData.skinOnly)o.visible=!glove;});fingers.forEach(f=>f.j.children.forEach(o=>{if(o.userData.skinOnly)o.visible=!glove;}));slv.material=H._m((cfg&&(cfg.jacket||cfg.top))||'#3a3d44');cf.material=H._m(glove?'#4a63d0':'#2a2a30');},
    _m(c){return (H._mc[c]=H._mc[c]||tn(c));},_mc:{}};
  H.setCurl(.3);return H;
}

// ------------------------------------------------------------ jerrycan (10 L HDPE, translucent so the level shows)
function makeCan(){
  const g=new T.Group();const shellM=W.toon('#cfe3ff',{transparent:true,opacity:.62});
  const sh=new T.Shape();const w=.24,h=.30,r=.03;sh.moveTo(-w/2+r,0);sh.lineTo(w/2-r,0);sh.quadraticCurveTo(w/2,0,w/2,r);sh.lineTo(w/2,h-r);sh.quadraticCurveTo(w/2,h,w/2-r,h);sh.lineTo(-w/2+r,h);sh.quadraticCurveTo(-w/2,h,-w/2,h-r);sh.lineTo(-w/2,r);sh.quadraticCurveTo(-w/2,0,-w/2+r,0);
  const geo=new T.ExtrudeGeometry(sh,{depth:.11,bevelEnabled:true,bevelSize:.012,bevelThickness:.014,bevelSegments:2,curveSegments:5});geo.translate(0,0,-.055);
  const body=new T.Mesh(geo,shellM);body.position.y=-.33;g.add(body);
  const liq=box(.225,.28,.115,tn('#7fb8c8'));liq.geometry.translate(0,.14,0);liq.position.y=-.32;liq.scale.y=.001;g.add(liq);
  // handle bar on top (the hand grips it), with its two posts
  const hb=cyl(.014,.014,.13,10,tn('#e2e8ea'));hb.rotation.z=Math.PI/2;hb.position.y=0;g.add(hb);
  [-.06,.06].forEach(x=>{const p=box(.018,.03,.03,tn('#e2e8ea'));p.position.set(x,-.02,0);g.add(p);});
  // spout + blue cap on the right shoulder
  const sp=cyl(.022,.024,.035,12,tn('#e2e8ea'));sp.position.set(.095,-.02,0);g.add(sp);
  const cp=cyl(.027,.027,.025,12,tn('#2f6fe0'));cp.position.set(.095,-.001,0);g.add(cp);
  // label
  const L=canvasTex(256,128);const lb=new T.Mesh(new T.PlaneGeometry(.14,.07),new T.MeshBasicMaterial({map:L.t,transparent:true}));lb.position.set(-.02,-.19,.072);g.add(lb);
  const C={g,liq,cap:cp,body,L,lb,site:''};
  C.label=function(site,ll){if(C.site===site+ll)return;C.site=site+ll;const x=L.x;x.clearRect(0,0,256,128);x.fillStyle='#fff';x.strokeStyle='#1d1a2b';x.lineWidth=6;x.beginPath();x.roundRect(4,4,248,120,12);x.fill();x.stroke();
    x.fillStyle='#1d1a2b';x.font='bold 40px sans-serif';x.textAlign='center';x.fillText(site||'CFC',128,54);x.font='bold 28px sans-serif';x.fillText(ll,128,98);L.t.needsUpdate=true;};
  C.label('CFC','10 L');return C;
}

// ------------------------------------------------------------ multiparameter sonde + handheld meter
function makeSonde(){
  const g=new T.Group();// origin = sensor tip; body goes up (+y)
  const bk=tn('#1e1e24');
  const bodyM=cyl(.022,.022,.30,16,bk);bodyM.position.y=.07+.15;g.add(bodyM);
  const band=cyl(.0225,.0225,.05,16,tn('#ffd23f'));band.position.y=.33;g.add(band);
  const mark=cyl(.0228,.0228,.012,16,tn('#8ac926'));mark.position.y=.15;g.add(mark);  // 15 cm above the tip (green band 15–55 cm)
  const topc=cyl(.012,.022,.03,12,bk);topc.position.y=.385;g.add(topc);
  // sensor guard (cage)
  const gm=tn('#9aa3ad');for(let i=0;i<5;i++){const a=i/5*6.283;const b=cyl(.003,.003,.07,5,gm);b.position.set(Math.cos(a)*.02,.035,Math.sin(a)*.02);g.add(b);}
  const ring=new T.Mesh(new T.TorusGeometry(.02,.003,5,16),gm);ring.rotation.x=Math.PI/2;ring.position.y=.002;g.add(ring);
  ['#3a86ff','#ff4f3a','#f4f0e6','#8ac926'].forEach((c,i)=>{const s=cyl(.005,.005,.04,8,tn(c));const a=i/4*6.283+.4;s.position.set(Math.cos(a)*.009,.045,Math.sin(a)*.009);g.add(s);});
  return g;
}
function makeMeter(){
  const g=new T.Group();// local: screen faces +z (toward the eye when held), long axis y
  const b=new T.Mesh(new T.BoxGeometry(.095,.19,.035),tn('#1f3b73'));g.add(b);
  const bump=box(.1,.04,.04,tn('#ffd23f'));bump.position.y=-.09;g.add(bump);
  const L=canvasTex(256,290);const scr=new T.Mesh(new T.PlaneGeometry(.084,.095),new T.MeshBasicMaterial({map:L.t}));scr.position.set(0,.03,.0182);g.add(scr);
  for(let i=0;i<6;i++){const k=cyl(.007,.007,.006,10,tn(i===0?'#8ac926':i===1?'#ff4f3a':'#d9dde3'));k.rotation.x=Math.PI/2;k.position.set(-.025+(i%3)*.025,-.03-Math.floor(i/3)*.022,.019);g.add(k);}
  return {g,L,draw(site,rows,st,stab){const x=L.x;x.fillStyle='#bfe3b4';x.fillRect(0,0,256,290);x.fillStyle='#1c2a1a';x.font='bold 26px monospace';x.textAlign='left';
    x.fillText(site||'SONDE',10,30);x.textAlign='right';x.font='bold 22px monospace';x.fillText((st||'').slice(0,11),248,30);x.fillRect(8,40,240,3);
    (rows||[]).slice(0,3).forEach((r,i)=>{x.textAlign='left';x.font='bold 30px monospace';x.fillText(r[0],10,86+i*50);x.textAlign='right';x.font='bold 44px monospace';x.fillText(r[1],248,90+i*50);});
    if(stab!=null){x.strokeStyle='#1c2a1a';x.lineWidth=3;x.strokeRect(10,250,236,24);x.fillRect(13,253,230*clamp(stab/100,0,1),18);}
    L.t.needsUpdate=true;}};
}

// ------------------------------------------------------------ vacuum gauge (dial canvas + needle)
function makeGauge(){
  const g=new T.Group();const L=canvasTex(256,256),x=L.x;
  x.fillStyle='#fff';x.beginPath();x.arc(128,128,124,0,6.283);x.fill();x.lineWidth=10;x.strokeStyle='#1d1a2b';x.stroke();
  const arc=(a0,a1,c)=>{x.strokeStyle=c;x.lineWidth=22;x.beginPath();x.arc(128,128,92,(a0-90)*Math.PI/180,(a1-90)*Math.PI/180);x.stroke();};
  const A=v=>-120+v*240;arc(A(.35),A(.70),'#8ac926');arc(A(.84),A(1),'#ff4f3a');
  x.strokeStyle='#1d1a2b';x.lineWidth=4;for(let i=0;i<=10;i++){const a=(A(i/10)-90)*Math.PI/180;x.beginPath();x.moveTo(128+Math.cos(a)*104,128+Math.sin(a)*104);x.lineTo(128+Math.cos(a)*80,128+Math.sin(a)*80);x.stroke();}
  x.fillStyle='#1d1a2b';x.font='bold 30px sans-serif';x.textAlign='center';x.fillText('−bar',128,200);x.font='bold 22px sans-serif';x.fillText('0',128+Math.cos((A(0)-90)*Math.PI/180)*60,128+Math.sin((A(0)-90)*Math.PI/180)*60+8);x.fillText('1',128+Math.cos((A(1)-90)*Math.PI/180)*60,128+Math.sin((A(1)-90)*Math.PI/180)*60+8);
  L.t.needsUpdate=true;
  const rim=cyl(.036,.036,.014,24,tn('#c9ced4'));rim.rotation.x=Math.PI/2;g.add(rim);
  const face=new T.Mesh(new T.CircleGeometry(.031,28),new T.MeshBasicMaterial({map:L.t}));face.position.z=.0075;g.add(face);
  const nd=new T.Group();nd.position.z=.009;const n=box(.0025,.026,.002,tn('#ff4f3a'));n.position.y=.012;nd.add(n);g.add(nd);const hub=cyl(.003,.003,.004,8,tn('#1d1a2b'));hub.rotation.x=Math.PI/2;hub.position.z=.01;g.add(hub);
  return {g,set(v){nd.rotation.z=-(-120+clamp(v,0,1)*240)*Math.PI/180;}};
}

// ------------------------------------------------------------ hand vacuum pump (portable kit) & electric pump (truck)
function makeHandPump(){
  const g=new T.Group();// held under the palm; nozzle toward -z
  const body=box(.05,.035,.16,tn('#d34a3a'));body.position.set(0,-.035,-.04);g.add(body);
  const barrel=cyl(.017,.017,.12,12,tn('#d6d9de'));barrel.rotation.x=Math.PI/2;barrel.position.set(0,-.035,-.17);g.add(barrel);
  const noz=cyl(.006,.008,.03,8,tn('#9aa3ad'));noz.rotation.x=Math.PI/2;noz.position.set(0,-.035,-.245);g.add(noz);
  const lev=new T.Group();lev.position.set(0,-.06,-.1);const lv=box(.04,.014,.14,tn('#2a2a30'));lv.position.set(0,-.012,.05);lev.add(lv);g.add(lev);
  const gauge=makeGauge();gauge.g.position.set(.035,-.01,-.13);gauge.g.rotation.set(-.9,.5,0);gauge.g.scale.setScalar(1.1);g.add(gauge.g);
  return {g,lev,gauge,nozzle:V(0,-.035,-.26)};
}
function makeElecPump(){
  const g=new T.Group();
  const b=box(.2,.13,.14,tn('#ff4f3a'));b.position.y=.065;g.add(b);
  const fins=box(.21,.02,.12,tn('#1d1a2b'));fins.position.y=.02;g.add(fins);
  const sw=box(.03,.012,.04,tn('#1d1a2b'));sw.position.set(.05,.136,.02);g.add(sw);
  const led=new T.Mesh(new T.SphereGeometry(.007,8,6),new T.MeshBasicMaterial({color:'#333'}));led.position.set(.05,.14,-.03);g.add(led);
  const gauge=makeGauge();gauge.g.position.set(-.05,.16,.02);gauge.g.rotation.x=-.9;g.add(gauge.g);
  const noz=cyl(.008,.008,.04,8,tn('#9aa3ad'));noz.rotation.z=Math.PI/2;noz.position.set(-.115,.09,0);g.add(noz);
  return {g,gauge,sw,led,nozzle:V(-.135,.09,0)};
}

// ------------------------------------------------------------ filtration bench
function makeBench(){
  const g=new T.Group(),TOP=-.80;
  const top=box(1.0,.03,.58,tn('#c9a45a'));top.position.set(0,TOP-.015,-.5);g.add(top);
  [[-.47,-.24],[.47,-.24],[-.47,-.76],[.47,-.76]].forEach(p=>{const l=cyl(.012,.012,.75,6,tn('#9aa3ad'));l.position.set(p[0],TOP-.03-.375,p[1]);g.add(l);});
  const cloth=box(.36,.004,.3,tn('#f4f0e6'));cloth.position.set(-.02,TOP+.002,-.47);g.add(cloth);
  // source carboy (20 L)
  const cb=new T.Group();cb.position.set(-.33,TOP,-.54);g.add(cb);
  const cbL=cyl(.118,.118,.3,20,tn('#7fb8c8'));cbL.geometry.translate(0,.15,0);cbL.position.y=.012;cb.add(cbL);
  const cbS=cyl(.13,.13,.34,20,glass('#eef4f6',.42));cbS.position.y=.17;cb.add(cbS);
  const cbT=cyl(.035,.13,.07,20,glass('#eef4f6',.42));cbT.position.y=.375;cb.add(cbT);
  const cbN=cyl(.032,.032,.04,14,tn('#2f6fe0'));cbN.position.y=.43;cb.add(cbN);
  // Kitasato receiver (lathe) + liquid
  const fl=new T.Group();fl.position.set(.03,TOP,-.47);g.add(fl);
  const prof=[[0,0],[.112,0],[.118,.012],[.112,.035],[.036,.23],[.03,.25],[.03,.31],[.034,.315]].map(p=>new T.Vector2(p[0],p[1]));
  const flS=new T.Mesh(new T.LatheGeometry(prof,28),glass('#e6f6ff',.3));fl.add(flS);
  const flLm=tn('#bfe9ff');let flL=null,flLev=-1;
  const arm=cyl(.008,.008,.07,8,glass('#e6f6ff',.45));arm.rotation.z=Math.PI/2;arm.position.set(.06,.275,0);fl.add(arm);
  // stopper, filter base, membrane, funnel, clamp
  const stp=cyl(.036,.03,.035,16,tn('#3a3a40'));stp.position.y=.33;fl.add(stp);
  const base=cyl(.05,.04,.03,20,tn('#d9dde3'));base.position.y=.362;fl.add(base);
  const frit=cyl(.046,.046,.004,20,tn('#f7f7f4'));frit.position.y=.378;fl.add(frit);
  const mem=new T.Mesh(new T.CircleGeometry(.046,28),tn('#ffffff'));mem.rotation.x=-Math.PI/2;mem.position.y=.3815;fl.add(mem);
  const tear=box(.07,.002,.006,tn('#1d1a2b'));tear.position.y=.383;tear.rotation.y=.6;tear.visible=false;fl.add(tear);
  const fun=cyl(.05,.05,.16,24,glass('#e6f6ff',.26));fun.material.side=T.DoubleSide;fun.geometry=new T.CylinderGeometry(.05,.05,.16,24,1,true);fun.position.y=.382+.08;fl.add(fun);
  for(let i=1;i<=4;i++){const gr=new T.Mesh(new T.TorusGeometry(.0505,.0012,3,24,1.2),tn('#1d1a2b'));gr.rotation.x=Math.PI/2;gr.rotation.z=1.2;gr.position.y=.382+i*.03;fl.add(gr);}
  const clampR=new T.Mesh(new T.TorusGeometry(.056,.008,6,24),tn('#9aa3ad'));clampR.rotation.x=Math.PI/2;clampR.position.y=.382;fl.add(clampR);
  const fW=cyl(.047,.047,1,24,tn('#7fb8c8'));fW.geometry.translate(0,.5,0);fW.position.y=.383;fW.scale.y=.001;fl.add(fW);
  const stream=cyl(.003,.003,1,6,tn('#bfe9ff'));stream.geometry.translate(0,-.5,0);stream.position.y=.315;fl.add(stream);
  // siphon from carboy to funnel
  const siph=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3([V(-.33,TOP+.43,-.54),V(-.33,TOP+.53,-.54),V(-.18,TOP+.6,-.5),V(.02,TOP+.58,-.47),V(.03,TOP+.47,-.47)]),30,.007,6),glass('#e9d6b8',.8));g.add(siph);
  // cryovial rack
  const rk=new T.Group();rk.position.set(-.15,TOP,-.31);g.add(rk);const rb=box(.17,.035,.06,tn('#f4f0e6'));rb.position.y=.017;rk.add(rb);
  const vials=[];for(let i=0;i<10;i++){const v=new T.Group();v.position.set(-.068+(i%5)*.034,.035,-.012+Math.floor(i/5)*.024);const vb=cyl(.0065,.0065,.045,10,glass('#f7fbff',.7));vb.position.y=.018;v.add(vb);
    const roll=cyl(.004,.004,.03,8,tn('#c8b08a'));roll.position.y=.018;v.add(roll);const vc=cyl(.0075,.0075,.012,10,tn('#ff9f1c'));vc.position.y=.045;v.add(vc);v.userData={vc,roll};rk.add(v);vials.push(v);}
  // spare membrane box + forceps on the cloth
  const mb=box(.08,.02,.08,tn('#3a86ff'));mb.position.set(.2,TOP+.01,-.3);g.add(mb);
  const fc=makeForceps();fc.position.set(.16,TOP+.006,-.24);fc.rotation.set(-Math.PI/2,0,.4);g.add(fc);
  // pumps & vacuum hose
  const hp=makeHandPump(),ep=makeElecPump();ep.g.position.set(.34,TOP,-.5);ep.g.rotation.y=-.4;g.add(ep.g);
  const hose={m:new T.Mesh(new T.BufferGeometry(),tn('#d8a3a3')),t:0};g.add(hose.m);
  const bg=makeGauge();bg.g.scale.setScalar(2.0);bg.g.position.set(.36,TOP+.4,-.5);bg.g.lookAt(0,0,0);g.add(bg.g);  // up by the pump, off the table
  const post=cyl(.007,.01,.4,8,tn('#9aa3ad'));post.position.set(.36,TOP+.2,-.5);g.add(post);
  const RD=canvasTex(256,64);const rd=new T.Mesh(new T.PlaneGeometry(.14,.035),new T.MeshBasicMaterial({map:RD.t,transparent:true}));rd.position.set(.36,TOP+.31,-.49);rd.lookAt(0,0,0);g.add(rd);
  const halo=new T.Mesh(new T.RingGeometry(.085,.1,32),new T.MeshBasicMaterial({color:'#ff4f3a',transparent:true,opacity:0,side:T.DoubleSide}));halo.position.copy(bg.g.position);halo.lookAt(0,0,0);halo.translateZ(.002);g.add(halo);
  const D={g,bg,RD,halo,rdv:-1,fl,flS,flLm,cbL,mem,tear,fW,stream,vials,hp,ep,hose,fc,top,TOP,
    flask(lvl){lvl=clamp(lvl,0,1);if(Math.abs(lvl-flLev)<.004)return;flLev=lvl;if(!flL){flL=new T.Mesh(new T.BufferGeometry(),flLm);fl.add(flL);}flL.visible=lvl>=.005;if(!flL.visible)return;
      const H=.23*lvl+.008;const pts=[new T.Vector2(0,.006)];for(let i=0;i<=8;i++){const y=.006+H*i/8;const r=y<.035?.108:lerp(.108,.034,(y-.035)/.195)-.004;pts.push(new T.Vector2(Math.max(.01,r),y));}pts.push(new T.Vector2(0,.006+H));
      refill(flL,new T.LatheGeometry(pts,24));}};
  return D;
}
function makeForceps(){const g=new T.Group(),m=tn('#c9ced4');[-1,1].forEach(s=>{const a=box(.004,.12,.003,m);a.position.set(s*.004,-.06,0);a.rotation.z=s*.04;g.add(a);});return g;}

// ------------------------------------------------------------ water patch (river surface around the sampling spot)
function makeWater(){
  const u={time:{value:0},col:{value:new T.Color('#7fb8c8')},c0:{value:new T.Vector2(0,0)},amp:{value:0}};
  const m=new T.ShaderMaterial({transparent:true,uniforms:u,vertexShader:'varying vec2 vP;varying vec3 vW;void main(){vP=position.xy;vec4 w=modelViewMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*w;}',
    fragmentShader:'uniform float time,amp;uniform vec3 col;uniform vec2 c0;varying vec2 vP;varying vec3 vW;void main(){float d=length(vP-c0);float r=sin(d*70.-time*7.)*.5+.5;r=smoothstep(.8,1.,r)*amp*exp(-d*7.);'+
      'float fl=(sin(vP.x*5.+time*.8+sin(vP.y*4.+time*.5))*sin(vP.y*6.-time*.6))*.5+.5;float edge=smoothstep(4.,2.8,length(vP-vec2(0.,1.)));float sk=smoothstep(-.5,3.5,vP.y);vec3 c=col*(.9+fl*.08)+vec3(r*.5)+vec3(.35,.4,.45)*sk*.3+vec3(smoothstep(.93,1.,fl)*.3);float a=(.62+r*.3)*edge;if(a<.01)discard;gl_FragColor=vec4(c,a);}'});
  const p=new T.Mesh(new T.PlaneGeometry(9,9,1,1),m);p.rotation.x=-Math.PI/2;const sed=new T.Mesh(new T.CircleGeometry(4,24),tn('#7a6650'));sed.rotation.x=-Math.PI/2;
  const g=new T.Group();g.add(sed,p);return {g,p,sed,u};
}

// ------------------------------------------------------------ build
function build(){
  W=window.WORLD;vs=new T.Scene();FPG.scene=vs;
  hemi=new T.HemisphereLight(0xfff4d6,0x5a4a7a,.5);dir=new T.DirectionalLight(0xffffff,.8);vs.add(hemi,dir,dir.target);
  camF=new T.Group();bodyF=new T.Group();camF.scale.setScalar(M);bodyF.scale.setScalar(M);vs.add(camF,bodyF);
  punch=new T.ShaderMaterial({vertexShader:'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'void main(){gl_FragDepth=1.;gl_FragColor=vec4(0.);}',colorWrite:false,depthWrite:true,depthTest:true,depthFunc:T.AlwaysDepth,side:T.DoubleSide});
  FPG.R=makeHand(1);FPG.L=makeHand(-1);camF.add(FPG.R.g,FPG.L.g);
  FPG.can=makeCan();FPG.R.g.add(FPG.can.g);
  FPG.meter=makeMeter();FPG.L.g.add(FPG.meter.g);
  FPG.sonde=makeSonde();bodyF.add(FPG.sonde);
  FPG.cable={m:new T.Mesh(new T.BufferGeometry(),tn('#1e1e24'))};bodyF.add(FPG.cable.m);
  FPG.tape=cyl(.0065,.0065,.014,8,tn('#8ac926'));bodyF.add(FPG.tape);
  FPG.bench=makeBench();bodyF.add(FPG.bench.g);FPG.R.g.add(FPG.bench.hp.g);
  FPG.water=makeWater();bodyF.add(FPG.water.g);
  FPG.ring=new T.Mesh(new T.TorusGeometry(.05,.004,4,24),new T.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.6}));FPG.ring.rotation.x=Math.PI/2;bodyF.add(FPG.ring);
  FPG.bub=[];for(let i=0;i<10;i++){const b=new T.Mesh(new T.SphereGeometry(.008,6,5),new T.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.8}));b.userData={t:Math.random()};bodyF.add(b);FPG.bub.push(b);}
  FPG.mud=[];for(let i=0;i<7;i++){const b=new T.Mesh(new T.SphereGeometry(.06,8,6),new T.MeshBasicMaterial({color:'#8a7056',transparent:true,opacity:0,depthWrite:false}));bodyF.add(b);FPG.mud.push(b);}
  FPG.forceps=makeForceps();FPG.L.g.add(FPG.forceps);FPG.forceps.position.set(-.02,-.03,-.09);FPG.forceps.rotation.set(-1.3,0,0);
  FPG.flyMem=new T.Mesh(new T.CircleGeometry(.03,20),tn('#c8b08a'));FPG.flyMem.material.side=T.DoubleSide;FPG.flyMem.visible=false;bodyF.add(FPG.flyMem);
  vs.traverse(o=>{o.frustumCulled=false;});
  built=true;
}
// ------------------------------------------------------------ hand accessories (watch, bracelets, rings, nails, band-aid, tattoo…)
function starGeo(r){const sh=new T.Shape();for(let i=0;i<10;i++){const a=i/10*Math.PI*2-Math.PI/2,rr=i%2?r*.45:r;const x=Math.cos(a)*rr,y=Math.sin(a)*rr;i?sh.lineTo(x,y):sh.moveTo(x,y);}return new T.ShapeGeometry(sh);}
function clearAcc(H){if(H.acc){H.g.remove(H.acc);}H.acc=new T.Group();H.g.add(H.acc);H.fingers.forEach(f=>{[...f.j.children].forEach(o=>{if(o.userData.acc)f.j.remove(o);});[...f.b.children].forEach(o=>{if(o.userData.acc)f.b.remove(o);});});H.fingerless=null;}
function addAcc(H,it){const A=H.acc,c=it.c,mk=(geo,col,basic)=>{const m=new T.Mesh(geo,basic?new T.MeshBasicMaterial({color:col}):H._m(col));m.userData.acc=1;return m;};
  if(it.k==='watch'||it.k==='smartwatch'){const band=mk(new T.TorusGeometry(.029,.0045,5,18),it.k==='watch'?'#5a3a24':c);band.position.z=.028;A.add(band);
    const face=mk(new T.BoxGeometry(.026,.008,.024),it.k==='watch'?'#c9ced4':'#1d1a2b');face.position.set(0,.03,.028);A.add(face);
    const scr=mk(it.k==='watch'?new T.CircleGeometry(.0095,16):new T.PlaneGeometry(.019,.017),it.k==='watch'?'#fffdf5':c,it.k!=='watch');scr.rotation.x=-Math.PI/2;scr.position.set(0,.0345,.028);A.add(scr);
    if(it.k==='watch'){[0,1].forEach(k=>{const hnd=mk(new T.BoxGeometry(.0012,.0006,k?.008:.006),'#1d1a2b');hnd.position.set(0,.0352,.028-(k?.003:.002));hnd.rotation.y=k?.9:-.4;A.add(hnd);});}}
  else if(it.k==='bracelets'){for(let k=0;k<3;k++){const b=mk(new T.TorusGeometry(.03+k*.001,.0028,4,16),['#ffd23f',c,'#ff2d95'][k]);b.position.z=.03+k*.007;b.rotation.x=(k-1)*.12;A.add(b);}}
  else if(it.k==='glowband'){const b=mk(new T.TorusGeometry(.03,.003,4,16),c,true);b.position.z=.032;A.add(b);}
  else if(it.k==='rubberband'){const b=mk(new T.TorusGeometry(.0295,.0015,3,16),c);b.position.z=.036;A.add(b);}
  else if(it.k==='rings'){[1,3].forEach((fi,k)=>{const f=H.fingers[fi];const r=mk(new T.TorusGeometry(.0098,.0022,4,12),k?'#c9ced4':'#ffd23f');r.position.z=-.012;r.userData.skinOnly=1;f.b.add(r);});}
  else if(it.k==='nails'){H.fingers.forEach(f=>{const n=mk(new T.SphereGeometry(1,6,4),c);n.scale.set(.006,.0022,.007);n.position.set(0,.0065,-.018);n.userData.skinOnly=1;f.j.add(n);});}
  else if(it.k==='bandaid'){const f=H.fingers[2];const b=mk(new T.BoxGeometry(.02,.019,.012),'#e8c49a');b.position.z=-.012;b.userData.skinOnly=1;f.b.add(b);}
  else if(it.k==='tattoo'){const t=mk(starGeo(.012),'#1d3a5a');t.rotation.x=-Math.PI/2;t.position.set(0,.0172,-.03);t.userData.skinOnly=1;A.add(t);}
  else if(it.k==='fingerless'){H.fingerless=['#3a3d44','#6b2a2a','#1d3557'][Math.floor(Math.random()*3)];}}

// ------------------------------------------------------------ lab gear carried in a free hand (first person)
function labLathe(prof,m){return new T.Mesh(new T.LatheGeometry(prof.map(p=>new T.Vector2(p[0],p[1])),20),m);}
function makeLab(kind,c){const g=new T.Group(),gl=glass('#e6f6ff',.32),liq=tn(c||'#7cff4f');
  if(kind==='thermometer'){const b=cyl(.0045,.0045,.17,10,gl);b.position.y=-.05;g.add(b);const col=cyl(.0016,.0016,.1,6,tn('#ff3030'));col.position.y=-.085;g.add(col);
    const bu=new T.Mesh(new T.SphereGeometry(.0065,10,8),tn('#ff3030'));bu.position.y=-.138;g.add(bu);for(let k=0;k<8;k++){const t=box(.004,.0008,.001,tn('#1d1a2b'));t.position.set(0,-.12+k*.015,.0045);g.add(t);}}
  else if(kind==='erlenmeyer'){const P=[[0,0],[.04,0],[.042,.006],[.014,.085],[.012,.1],[.015,.104]];const f=labLathe(P,gl);f.position.y=-.13;g.add(f);
    const L=labLathe([[0,.003],[.037,.003],[.03,.03],[.022,.05],[0,.05]],liq);L.position.y=-.13;g.add(L);}
  else if(kind==='beaker'){const b=cyl(.034,.032,.075,20,gl);b.geometry=new T.CylinderGeometry(.034,.032,.075,20,1,true);b.material.side=T.DoubleSide;b.position.y=-.09;g.add(b);
    const L=cyl(.031,.031,.035,20,liq);L.position.y=-.108;g.add(L);for(let k=1;k<4;k++){const gr=box(.012,.0012,.001,tn('#1d1a2b'));gr.position.set(0,-.125+k*.017,.0342);g.add(gr);}}
  else if(kind==='pasteur'){const t=cyl(.0035,.0035,.1,8,gl);t.position.y=-.06;g.add(t);const tip=cyl(.0012,.003,.06,6,gl);tip.position.y=-.14;g.add(tip);
    const bulb=new T.Mesh(new T.CapsuleGeometry(.007,.02,4,8),tn('#d62828'));bulb.position.y=0;g.add(bulb);const L=cyl(.0025,.0025,.03,6,liq);L.position.y=-.1;g.add(L);}
  else if(kind==='micropipette'){const body=cyl(.011,.013,.12,12,tn('#d9dde3'));body.position.y=-.03;g.add(body);const grip=box(.014,.03,.02,tn('#9aa3ad'));grip.position.set(.008,.0,0);g.add(grip);
    const pl=cyl(.005,.005,.02,8,tn('#9aa3ad'));pl.position.y=.04;g.add(pl);const btn=cyl(.009,.009,.008,12,tn(c||'#3a86ff'));btn.position.y=.052;g.add(btn);
    const cone=cyl(.004,.009,.03,10,tn('#9aa3ad'));cone.position.y=-.105;g.add(cone);const tip=cyl(.0008,.0045,.05,8,glass('#ffe38a',.6));tip.position.y=-.145;g.add(tip);
    const win=box(.008,.014,.002,tn('#1d1a2b'));win.position.set(0,-.01,.012);g.add(win);}
  else if(kind==='testtube'){const t=cyl(.008,.008,.1,12,gl);t.geometry=new T.CylinderGeometry(.008,.008,.1,12,1,true);t.material.side=T.DoubleSide;t.position.y=-.07;g.add(t);
    const bot=new T.Mesh(new T.SphereGeometry(.008,10,6,0,Math.PI*2,Math.PI/2,Math.PI/2),gl);bot.position.y=-.12;g.add(bot);const L=cyl(.0072,.0072,.04,10,liq);L.position.y=-.1;g.add(L);
    const cp=cyl(.009,.009,.012,12,tn('#ff2d95'));cp.position.y=-.016;g.add(cp);}
  else if(kind==='falcon'){const t=cyl(.014,.014,.09,14,glass('#f4fbff',.45));t.position.y=-.07;g.add(t);const tip=new T.Mesh(new T.ConeGeometry(.014,.025,14),glass('#f4fbff',.45));tip.rotation.x=Math.PI;tip.position.y=-.128;g.add(tip);
    const L=cyl(.013,.013,.05,14,liq);L.position.y=-.09;g.add(L);const cp=cyl(.016,.016,.016,14,tn('#3a86ff'));cp.position.y=-.02;g.add(cp);const lb=box(.018,.03,.002,tn('#ffffff'));lb.position.set(0,-.065,.0142);g.add(lb);}
  else if(kind==='petri'){const d=cyl(.045,.045,.012,24,glass('#f4fbff',.5));d.position.set(0,-.03,-.02);g.add(d);const ag=cyl(.042,.042,.006,24,tn('#e8d58a'));ag.position.set(0,-.032,-.02);g.add(ag);
    for(let k=0;k<9;k++){const co=new T.Mesh(new T.SphereGeometry(.003+Math.random()*.003,6,4),tn(['#ffffff','#ff7b00','#ffd23f'][k%3]));co.scale.y=.4;co.position.set((Math.random()-.5)*.06,-.028,-.02+(Math.random()-.5)*.06);g.add(co);}}
  else if(kind==='notebook'){const b=box(.1,.012,.14,tn(c||'#1d3557'));b.position.set(0,-.02,-.02);g.add(b);const pg=box(.094,.01,.134,tn('#fffdf5'));pg.position.set(.004,-.02,-.02);g.add(pg);
    const pen=cyl(.004,.004,.12,8,tn('#ffd23f'));pen.rotation.x=Math.PI/2;pen.position.set(.055,-.012,-.02);g.add(pen);}
  g.traverse(o=>{o.frustumCulled=false;});return g;}
const LAB_KINDS=['thermometer','erlenmeyer','beaker','pasteur','micropipette','testtube','falcon','petri','notebook'];
FPG.LAB_KINDS=LAB_KINDS;
let handsRef=null;
FPG.setHands=function(list){if(!built||list===handsRef)return;handsRef=list;[FPG.R,FPG.L].forEach(clearAcc);if(FPG.lab){FPG.lab.parent&&FPG.lab.parent.remove(FPG.lab);FPG.lab=null;}
  const li=(list||[]).find(it=>it.k==='lab');if(li){FPG.lab=new T.Group();const it=makeLab(li.item,li.c);it.scale.setScalar(1.25);FPG.lab.add(it);FPG.lab.userData.h=centerY(it)*1.25;FPG.lab.visible=false;}
  (list||[]).filter(it=>it.k!=='lab').forEach(it=>{const both=it.k==='nails'||it.k==='fingerless';(both?[FPG.R,FPG.L]:[it.side>0?FPG.R:FPG.L]).forEach(H=>addAcc(H,it));});
  FPG.R.style(charCfg,!!FPG.R.gloved);FPG.L.style(charCfg,!!FPG.L.gloved);};
function centerY(g){const b=new T.Box3().setFromObject(g);const c=(b.min.y+b.max.y)/2;g.children.forEach(o=>o.position.y-=c);return b.max.y-b.min.y;}
function gripUpright(H,obj,lift){ // hand rolled thumb-up: its local x is vertical; the fist hole is at (0,-.026,-.066)
  if(obj.parent!==H.g)H.g.add(obj);const up=H.side>0?-1:1;obj.position.set(up*(lift||0),-.026,-.066);obj.rotation.set(0,0,H.side>0?Math.PI/2:-Math.PI/2);}
FPG.setChar=function(cfg){if(!built||cfg===charCfg)return;charCfg=cfg;FPG.R.style(cfg,false);FPG.L.style(cfg,false);FPG._glove=null;};

// ------------------------------------------------------------ per-frame
const qa=new T.Quaternion(),qb=new T.Quaternion(),e3=new T.Euler(),v1=new T.Vector3(),v2=new T.Vector3();
let crouch=0,pw=0,pitchT=0,st={t:0,mode:'',anim:null,prevFlask:0,prevMemb:0,prevTorn:false,pump:0,meterT:0};
const POSE={
  idle:  {R:['cam',[.21,-.25,-.42],[.35,.1,.15],.35],L:['cam',[-.21,-.25,-.42],[.35,-.1,-.15],.35]},
  carry: {R:['cam',[.19,-.08,-.44],[.55,-.3,.05],.95]},
  meterW:{L:['cam',[-.17,-.2,-.4],[.12,.3,Math.PI/2],.9]},
  sondeW:{R:['cam',[.2,-.19,-.44],[.2,-.1,.1],.9]},
  fill:  {R:['body',[.06,-.67,-.52],[.05,-.2,-.9],.95],L:['body',[-.2,-.8,-.46],[.2,.5,.9],.5]},
  probe: {R:['body',[.13,-.6,-.62],[-.45,-.25,0],.95],L:['cam',[-.18,-.17,-.4],[.1,.3,Math.PI/2],.9]},
  filter:{R:['body',[.24,-.52,-.3],[.45,-.55,0],.85],L:['body',[-.21,-.77,-.36],[.1,.3,.1],.3]},
  filterT:{R:['body',[.3,-.63,-.46],[.2,-.2,0],.5],L:['body',[-.12,-.77,-.33],[.1,.3,.1],.3]}
};
function setT(H,p,dt,k){if(!p){p=H.side>0?POSE.idle.R:POSE.idle.L;}
  const [fr,pos,rot,c]=p;v1.set(pos[0],pos[1],pos[2]);qa.setFromEuler(e3.set(rot[0],rot[1],rot[2]));
  if(fr==='body'){qb.copy(camF.quaternion).invert().multiply(bodyF.quaternion);v1.applyQuaternion(qb);qa.premultiply(qb);}
  const C=H.cur;if(!C.init){C.p.copy(v1);C.q.copy(qa);C.init=true;}const s=sm(k||11,dt);C.p.lerp(v1,s);C.q.slerp(qa,s);C.c=lerp(C.c,c,s);
  H.g.position.copy(C.p);H.g.quaternion.copy(C.q);H.setCurl(C.c);}
function camToBody(p,out){qb.copy(bodyF.quaternion).invert().multiply(camF.quaternion);return out.copy(p).applyQuaternion(qb);}
function refill(mesh,g2){const g=mesh.geometry;if(!g.attributes.position||g.attributes.position.count!==g2.attributes.position.count){g.dispose();mesh.geometry=g2;
    ['position','normal'].forEach(k=>g2.attributes[k].setUsage(T.DynamicDrawUsage));return;}
  ['position','normal','uv'].forEach(k=>{if(g.attributes[k]&&g2.attributes[k]){g.attributes[k].array.set(g2.attributes[k].array);g.attributes[k].needsUpdate=true;}});g2.dispose();}
function tube(obj,pts,r){refill(obj.m,new T.TubeGeometry(new T.CatmullRomCurve3(pts),36,r,5));}

FPG.update=function(dt,I){
  if(!window.WORLD||!window.THREE)return;if(!built)build();
  st.t+=dt;const C=W.camera;FPG.fpLast=!!I.fp;if(I.eye){M=I.eye/1.55;camF.scale.setScalar(M);bodyF.scale.setScalar(M);}
  const md=I.fp?(I.modal==='filter'?'filter':I.modal==='probe'?'probe':I.filling?'fill':'walk'):'off';
  FPG.visible=md!=='off';if(!FPG.visible){crouch=0;pw=0;FPG.R.cur.init=FPG.L.cur.init=false;return;}
  // camera: crouch to fill, look down at the bench / water during mini-games
  const wantC=md==='fill'?.78:0,wantP=md==='fill'?-.9:md==='probe'?-.8:md==='filter'?-.82:null;
  crouch=lerp(crouch,wantC,sm(6,dt));if(wantP!=null){pitchT=wantP;pw=lerp(pw,1,sm(5,dt));}else pw=lerp(pw,0,sm(6,dt));
  if(crouch>.002||pw>.002){const p=lerp(I.pitch,pitchT,pw),cp=Math.cos(p);C.position.y-=crouch*M;
    const breathe=md==='filter'||md==='probe'?Math.sin(st.t*1.3)*.0006:0;st.yo=lerp(st.yo||0,(md==='filter'||md==='probe')&&I.panel?.26:0,sm(5,dt));const yw=I.yaw-st.yo;  // the side panel covers the right: turn a bit so the bench sits left of it
    C.lookAt(C.position.x+Math.cos(yw)*cp,C.position.y+Math.sin(p)+breathe,C.position.z-Math.sin(yw)*cp);}
  C.updateMatrixWorld();camF.position.copy(C.position);camF.quaternion.copy(C.quaternion);bodyF.position.copy(C.position);bodyF.rotation.set(0,I.yaw-Math.PI/2,0);
  camF.updateMatrixWorld(true);bodyF.updateMatrixWorld(true);
  // light follows the world sun
  hemi.color.copy(W.hemi.color);hemi.groundColor.copy(W.hemi.groundColor);hemi.intensity=W.hemi.intensity;dir.color.copy(W.sun.color);dir.intensity=W.sun.intensity;
  dir.position.copy(W.sun.position).sub(W.sun.target.position).normalize();dir.target.position.set(0,0,0);
  // gloves on at the water and at the bench
  const glove=md!=='walk'||I.canNear||I.nearQ;if(FPG._glove!==glove){FPG._glove=glove;FPG.R.style(charCfg,glove);FPG.L.style(charCfg,glove);}
  const R=FPG.R,L=FPG.L,can=FPG.can,B=FPG.bench,Wt=FPG.water;
  const mv=I.moving&&I.jy<.002,bob=mv?Math.sin(I.walk*2)*.012*(I.running?1.6:1):0,sw=mv?Math.sin(I.walk)*.02:0;
  // defaults
  let pR=null,pL=null;if(FPG.lab)FPG.lab.visible=false;can.g.visible=false;FPG.meter.g.visible=false;FPG.sonde.visible=false;FPG.cable.m.visible=false;FPG.tape.visible=false;B.g.visible=false;B.hp.g.visible=false;Wt.g.visible=false;
  FPG.ring.visible=false;FPG.bub.forEach(b=>b.visible=false);FPG.mud.forEach(b=>b.visible=false);FPG.forceps.visible=false;FPG.flyMem.visible=false;
  const wc=waterCol(I.ph);
  if(md==='walk'){
    const hasCan=I.carry>0||I.canNear;if(hasCan){if(can.g.parent!==R.g)R.g.add(can.g);pR=POSE.carry.R;can.g.visible=true;can.g.position.set(0,-.03,-.055);can.g.rotation.set(-.55,.3,0);can.liq.scale.y=I.carry>0?.92:.001;can.cap.visible=true;can.liq.material.color.copy(wc);can.label(I.site||'CFC',I.carry>0?'10 L ✓':'10 L');}
    else if(I.nearQ){pR=POSE.sondeW.R;}
    if(I.nearQ){pL=POSE.meterW.L;FPG.meter.g.visible=true;gripUpright(L,FPG.meter.g,.06);if(st.meterT<=0){st.meterT=.5;FPG.meter.draw(I.site,[['pH','--'],['T °C','--'],['EC','--'],['ORP','--']],'READY',null);}}
    if(pR)pR=[pR[0],[pR[1][0]+sw*.3,pR[1][1]+bob,pR[1][2]],pR[2],pR[3]];
    const a=pL||POSE.idle.L;pL=[a[0],[a[1][0],a[1][1]+bob*.8,a[1][2]-sw],a[2],a[3]];
    if(!pR){const b=POSE.idle.R;pR=[b[0],[b[1][0],b[1][1]+bob*.8,b[1][2]+sw],b[2],b[3]];}
    if(!hasCan&&I.nearQ){FPG.sonde.visible=true;}
    if(FPG.lab){const H=!hasCan&&!I.nearQ?R:!I.nearQ?L:null;FPG.lab.visible=!!H;if(H){gripUpright(H,FPG.lab,Math.min(.04,(FPG.lab.userData.h||.1)*.18));
      const sd=H===R?1:-1,P=['cam',[.16*sd,-.19+bob*.8,-.42],[.12,-.3*sd,-sd*Math.PI/2],.92];if(H===R)pR=P;else pL=P;}}
  }
  else if(md==='fill'){
    if(can.g.parent!==bodyF)bodyF.add(can.g);const dip=Math.sin(st.t*2)*.006;
    pR=['body',[.0,-.515+dip,-.45],[0,0,-.8],.95];pL=['body',[-.13,-.5+dip,-.42],[.3,.4,-.4],.6];
    can.g.visible=true;can.cap.visible=false;can.g.position.set(0,-.54+dip,-.45);can.g.rotation.set(0,0,-.8);can.liq.scale.y=Math.max(.001,I.fill*.92);can.liq.material.color.copy(wc);can.label(I.site||'CFC','10 L');
    Wt.g.visible=true;Wt.g.position.set(0,-.62,-.8);Wt.sed.visible=false;Wt.u.col.value.copy(wc);Wt.u.time.value=st.t;Wt.u.amp.value=1;Wt.u.c0.value.set(.05,-.35);Wt.u.amp.value=.8;// plane coords: x right, y = -z
    FPG.bub.forEach((b,i)=>{const u=b.userData;u.t+=dt*(1.2+i*.07);if(u.t>1)u.t-=1;b.visible=true;b.position.set(.05+Math.sin(i*2.1+st.t*3)*.03,-.66+u.t*.05,-.45+Math.cos(i*1.3)*.03);b.scale.setScalar(.6+u.t);b.material.opacity=.9*(1-u.t);});
  }
  else if(md==='probe'){
    const P=FPG.probe||{depth:0,stab:0,sed:0,rows:[],st:''};
    pR=POSE.probe.R;pL=POSE.probe.L;FPG.meter.g.visible=true;gripUpright(L,FPG.meter.g,.06);
    st.meterT-=0;if(st.meterT<=0){st.meterT=.12;FPG.meter.draw(I.site,P.rows,P.st,P.stab);}
    const wy=-1.4;Wt.g.visible=true;Wt.g.position.set(0,wy,-1.1);Wt.sed.visible=true;Wt.sed.position.y=-.53;Wt.u.col.value.copy(wc);Wt.u.time.value=st.t;
    FPG.sonde.visible=true;
    if(P.sed>0)FPG.mud.forEach((b,i)=>{b.visible=true;const k=P.sed/2.2;b.position.set(Math.sin(i*2.4)*.12*(1.6-k),wy-.5+(1-k)*.18+Math.cos(i)*.03,-.62+Math.cos(i*1.7)*.1*(1.6-k));b.scale.setScalar(.6+(1-k)*1.4);b.material.opacity=.55*k;});
  }
  else if(md==='filter'){
    const F=FPG.filt||{si:0,vac:0,vol:0,flask:0,clog:0,swapNeeded:false,q:0,memb:[1,0],fin:false,where:'kit',VOL:20,FL:10};
    const truck=F.where==='truck';B.g.visible=true;B.top.material=tc(truck?'#5d6470':'#c9a45a');
    B.ep.g.visible=truck;B.hp.g.visible=!truck;
    // stage liquids
    const raw=waterCol(F.ph),filtC=raw.clone().lerp(new T.Color('#e8f6ff'),.45);
    B.cbL.material.color.copy(F.si===0?raw:filtC);B.cbL.scale.y=Math.max(.002,(F.VOL-F.vol)/F.VOL);B.cbL.visible=F.VOL-F.vol>.05;
    B.flLm.color.copy(F.si===0?filtC:filtC.clone().lerp(new T.Color('#ffffff'),.4));B.flask(F.flask/F.FL);
    const cc=new T.Color(`rgb(${Math.round(255-F.clog*150)},${Math.round(255-F.clog*175)},${Math.round(255-F.clog*215)})`);B.mem.material.color.copy(F.swapNeeded?new T.Color('#ff4f3a'):cc);B.tear.visible=!!F.swapNeeded;
    const flow=F.q>.05;st.lev=lerp(st.lev||0,flow?.06+Math.sin(st.t*5)*.004:0,sm(flow?3:1.2,dt));B.fW.scale.y=Math.max(.001,st.lev);B.fW.material.color.copy(F.si===0?raw:filtC);B.fW.visible=st.lev>.002;
    B.stream.visible=flow;B.stream.scale.y=Math.max(.01,.3-(.23*F.flask/F.FL+.008));B.stream.scale.x=B.stream.scale.z=.8+Math.sin(st.t*30)*.2;
    // vials: finished membranes (orange cap 0.45 µm, blue cap 0.22 µm)
    const n45=F.memb[0]-(F.si===0&&!F.fin?1:0),n22=F.memb[1]-(F.si===1&&!F.fin?1:0);
    B.vials.forEach((v,i)=>{const u=v.userData;const on=i<n45?'#ff9f1c':i-5>=0&&i-5<n22?'#3a86ff':null;u.vc.material=tc(on||'#d9dde3');u.roll.visible=!!on;});
    // pumping
    const pumping=!!F.pumping;st.pump=pumping?st.pump+dt:0;
    if(truck){pR=POSE.filterT.R;B.ep.gauge.set(F.vac);B.ep.led.material.color.set(pumping?'#8ac926':'#333');B.ep.g.position.y=B.TOP+(pumping?Math.sin(st.t*70)*.0015:0);B.ep.sw.rotation.z=pumping?.25:-.1;}
    else{const sq=pumping?(Math.sin(st.pump*9)*.5+.5):0;pR=[POSE.filter.R[0],POSE.filter.R[1],POSE.filter.R[2],.55+sq*.4];B.hp.lev.rotation.x=.38-sq*.36;B.hp.gauge.set(F.vac);
      B.hp.g.position.set(0,-.012,.02);B.hp.g.rotation.set(0,0,0);}
    pL=POSE.filter.L;
    B.bg.set(F.vac);{const v=Math.round(F.vac*100);if(v!==B.rdv){B.rdv=v;const x=B.RD.x,ok=F.vac>=.35&&F.vac<=.7,hi=F.vac>.7;x.clearRect(0,0,256,64);x.fillStyle=hi?'#ff4f3a':ok?'#8ac926':'#fffdf5';x.strokeStyle='#1d1a2b';x.lineWidth=5;x.beginPath();x.roundRect(3,3,250,58,10);x.fill();x.stroke();
      x.fillStyle='#1d1a2b';x.font='bold 38px sans-serif';x.textAlign='center';x.fillText('−'+F.vac.toFixed(2)+' bar',128,46);B.RD.t.needsUpdate=true;}}
    B.halo.material.opacity=F.vac>.7||F.swapNeeded?.5+Math.sin(st.t*14)*.4:0;
    // hose flask side-arm -> pump nozzle
    const sa=V(.03+.095,B.TOP+.275,-.47);let nz;
    if(truck){nz=B.ep.nozzle.clone();B.ep.g.updateMatrix();nz.applyMatrix4(B.ep.g.matrix);}
    else{B.hp.g.updateMatrixWorld(true);nz=B.hp.g.localToWorld(B.hp.nozzle.clone());bodyF.worldToLocal(nz);}
    tube(B.hose,[sa,V(sa.x+.05,sa.y,sa.z),V((sa.x+nz.x)/2,Math.min(sa.y,nz.y)-.06,(sa.z+nz.z)/2),V(nz.x,nz.y,nz.z)],.008);
    // one-shot animations: swapping a membrane (R), emptying the flask (F)
    const ms=F.memb[0]+F.memb[1];if(ms>st.prevMemb&&st.prevMemb>0&&!F.fin)st.anim={k:'swap',t:0};st.prevMemb=ms;
    if(F.flask<st.prevFlask-.5)st.anim={k:'empty',t:0};st.prevFlask=F.flask;
    if(st.anim){st.anim.t+=dt;const a=st.anim,k=a.t;
      if(a.k==='swap'){FPG.forceps.visible=true;const up=k<.45?k/.45:1,to=clamp((k-.45)/.5,0,1);
        pL=['body',[lerp(-.12,.03,Math.min(1,k/.3))+lerp(0,-.18,to),lerp(-.6,-.33,Math.sin(Math.min(1,k/.9)*Math.PI)*.8+(k<.3?0:.2)),lerp(-.33,-.47,Math.min(1,k/.3))+to*.16],[.6,.2,.1],.55];
        if(k>.3&&k<.95){FPG.flyMem.visible=true;L.g.updateMatrixWorld(true);const fp=FPG.forceps.localToWorld(V(0,-.12,0));bodyF.worldToLocal(fp);FPG.flyMem.position.copy(fp);FPG.flyMem.rotation.set(-1.2+k*2,0,k*3);FPG.flyMem.scale.setScalar(1-to*.6);}
        if(k>1.1)st.anim=null;}
      else if(a.k==='empty'){const s=Math.sin(Math.min(1,k/1.1)*Math.PI);pL=['body',[lerp(-.12,-.02,s),lerp(-.77,-.55,s),lerp(-.33,-.47,s)],[.1,.8*s,.2],.3+s*.6];B.fl.rotation.z=s*.35;if(k>1.1){st.anim=null;B.fl.rotation.z=0;}}}
    else B.fl.rotation.z=0;
  }
  setT(R,pR,dt,md==='walk'?14:9);setT(L,pL,dt,md==='walk'?14:9);
  if(md!=='filter'){B.fl.rotation.z=0;}
  st.meterT-=dt;
  // sonde hangs from the right hand on its cable; cable runs on to the handheld meter
  if(FPG.sonde.visible){camF.updateMatrixWorld(true);R.g.updateMatrixWorld(true);const hp=R.g.localToWorld(V(0,-.02,-.07));bodyF.worldToLocal(hp);
    let tipY;if(md==='probe'){const P=FPG.probe||{depth:0};tipY=-1.4+.10-P.depth/100;}else tipY=hp.y-.12-.37;
    const swx=Math.sin(st.t*1.7)*.012,swz=Math.cos(st.t*1.3)*.01;const sx=hp.x+swx,sz=hp.z+swz;FPG.sonde.position.set(sx,tipY,sz);FPG.sonde.rotation.set(swz*.8,0,-swx*.8);
    const top=V(sx,tipY+.4,sz);L.g.updateMatrixWorld(true);FPG.meter.g.updateMatrixWorld(true);const mp=FPG.meter.g.localToWorld(V(0,-.1,0));bodyF.worldToLocal(mp);
    const mid=V((hp.x+mp.x)/2,Math.min(hp.y,mp.y)-.14,(hp.z+mp.z)/2+.05);
    tube(FPG.cable,FPG.meter.g.visible?[top,V(sx,(top.y+hp.y)/2,sz),hp,V(hp.x-.02,hp.y-.05,hp.z+.03),mid,mp]:[top,V(sx,(top.y+hp.y)/2,sz),hp,V(hp.x+.03,hp.y+.02,hp.z+.06)],.0045);FPG.cable.m.visible=true;
    if(tipY+.55<hp.y-.02){FPG.tape.visible=true;FPG.tape.position.set(sx,tipY+.55,sz);}
    if(md==='probe'){const wy=-1.4;FPG.ring.visible=tipY<wy&&top.y>wy;FPG.ring.position.set(sx,wy+.002,sz);const pulse=(st.t*1.5)%1;FPG.ring.scale.setScalar(.4+pulse*1.6);FPG.ring.material.opacity=.6*(1-pulse);
      Wt.u.amp.value=FPG.ring.visible?1:.2;Wt.u.c0.value.set(sx,-(sz+1.1));}}
};
FPG.render=function(R,C){if(!built||!FPG.visible)return;const ac=R.autoClear;R.autoClear=false;vs.overrideMaterial=punch;R.render(vs,C);vs.overrideMaterial=null;R.render(vs,C);R.autoClear=ac;};
FPG.can3d=()=>FPG.fpLast;
FPG.debugAnim=k=>{st.anim={k,t:0};};
})();
