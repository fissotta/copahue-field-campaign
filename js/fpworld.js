// Copahue Field Campaign v8 — near-field world detail for walking views (first/third person):
// ground cover scattered around the player by biome (coirón, neneo, lenga-forest grass, caña colihue, stones, scoria,
// sulfur/iron crusts by acid rivers, flowers), condors soaring overhead, guanaco herds on the steppe,
// and glowing auras that mark the legends. Everything is instanced / pooled and only rebuilt when you move.
(function(){
'use strict';
const T=THREE;const FPW={};window.FPW=FPW;
let W=null,built=false,root,last={x:1e9,z:1e9},meshes={},wind={value:0},condors=[],herds=[],auras=[],hs=(i,j,k)=>{const s=Math.sin(i*127.1+j*311.7+k*74.7)*43758.5453;return s-Math.floor(s);};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t;
const K=1.6;let _XL=null;const XL=()=>_XL==null?(_XL=W.P(-37.868,-70.985)[0]):_XL; // people are ~.3 units tall (1 m ≈ .19): ground cover and animals scaled to match
function swayMat(o){const m=W.toon('#ffffff',o||{});m.onBeforeCompile=sh=>{sh.uniforms.wT=wind;sh.vertexShader='uniform float wT;\n'+sh.vertexShader.replace('#include <begin_vertex>',
  '#include <begin_vertex>\n#ifdef USE_INSTANCING\nfloat ph=instanceMatrix[3].x*37.+instanceMatrix[3].z*23.;\n#else\nfloat ph=0.;\n#endif\nfloat k=max(position.y,0.)/.05;transformed.x+=sin(wT*2.1+ph)*.004*k*k;transformed.z+=cos(wT*1.7+ph)*.003*k*k;');};return m;}
function merge(parts){ // parts: [geometry, matrix] -> one non-indexed geometry
  const pos=[],nor=[];parts.forEach(([g,m])=>{const gg=(g.index?g.toNonIndexed():g.clone());gg.applyMatrix4(m);gg.computeVertexNormals();pos.push(...gg.attributes.position.array);nor.push(...gg.attributes.normal.array);});
  const G=new T.BufferGeometry();G.setAttribute('position',new T.Float32BufferAttribute(pos,3));G.setAttribute('normal',new T.Float32BufferAttribute(nor,3));return G;}
const mat4=(x,y,z,rx,ry,rz,s,sy)=>new T.Matrix4().compose(new T.Vector3(x,y,z),new T.Quaternion().setFromEuler(new T.Euler(rx||0,ry||0,rz||0)),new T.Vector3(s||1,sy||s||1,s||1));

// ------------------------------------------------------------ ground-cover geometries (sizes in world units)
function geoTuft(n,h,spread){const P=[];for(let i=0;i<n;i++){const a=i/n*6.283+Math.random()*.4,t=.25+Math.random()*.35;P.push([new T.ConeGeometry(.0022,h*(.7+Math.random()*.5),3,1,true).translate(0,h*.45,0),mat4(Math.cos(a)*spread*.4,0,Math.sin(a)*spread*.4,Math.sin(a)*t,0,-Math.cos(a)*t)]);}return merge(P);}
function geoNeneo(){const P=[];for(let i=0;i<9;i++){const a=i/9*6.283,r=.012+Math.random()*.01;P.push([new T.IcosahedronGeometry(.013,0),mat4(Math.cos(a)*r,.006+Math.random()*.008,Math.sin(a)*r,0,0,0,1,.75)]);}P.push([new T.IcosahedronGeometry(.017,0),mat4(0,.012,0,0,0,0,1,.8)]);return merge(P);}
function geoCane(){const P=[];for(let i=0;i<7;i++){const a=Math.random()*6.283,t=.1+Math.random()*.25,h=.12+Math.random()*.08;P.push([new T.CylinderGeometry(.0012,.0018,h,3).translate(0,h/2,0),mat4(Math.cos(a)*.008,0,Math.sin(a)*.008,Math.sin(a)*t,0,-Math.cos(a)*t)]);
  for(let k=0;k<3;k++)P.push([new T.ConeGeometry(.004,.03,3).rotateZ(1.2),mat4(Math.cos(a)*.008+Math.sin(a)*t*h*.8,h*(.6+k*.13),Math.sin(a)*.008,0,Math.random()*6,0)]);}return merge(P);}
function geoFlower(){const P=[[new T.CylinderGeometry(.0008,.0008,.02,3).translate(0,.01,0),mat4(0,0,0)]];for(let k=0;k<5;k++){const a=k/5*6.283;P.push([new T.SphereGeometry(.0028,4,3),mat4(Math.cos(a)*.003,.021,Math.sin(a)*.003,0,0,0,1,.5)]);}return merge(P);}
function geoFern(){const P=[];for(let i=0;i<6;i++){const a=i/6*6.283;P.push([new T.PlaneGeometry(.012,.05).translate(0,.025,0),mat4(Math.cos(a)*.004,0,Math.sin(a)*.004,-.9,a,0)]);}return merge(P);}

// ------------------------------------------------------------ condor (Vultur gryphus), wingspan ≈ 3 m
function makeCondor(){const g=new T.Group(),bk=W.toon('#16141c'),wh=W.toon('#f4f0e6'),sk=W.toon('#8a5a5a');
  const Qb=W.Q;const I=new T.Group();I.scale.setScalar(.042);g.add(I);I.add(Qb.loft([[-1.05,0,.12,.14],[-.8,.02,.26,.3],[-.3,.03,.3,.34],[.2,.02,.26,.3],[.55,.03,.16,.18],[.7,.05,.12,.12]],8,'#16141c'));const body={};
  const ruff=new T.Mesh(new T.TorusGeometry(.009,.005,6,12),wh);ruff.rotation.y=Math.PI/2;ruff.position.x=.03;g.add(ruff);
  const head=new T.Mesh(new T.SphereGeometry(.0075,8,6),sk);head.position.set(.042,.002,0);head.scale.set(1.3,1,1);g.add(head);
  const beak=new T.Mesh(new T.ConeGeometry(.003,.01,5),W.toon('#e8dcc0'));beak.rotation.z=-Math.PI/2;beak.position.set(.053,0,0);g.add(beak);
  const tail=new T.Mesh(new T.BoxGeometry(.035,.003,.03),bk);tail.position.set(-.042,0,0);g.add(tail);
  const wings=[];[-1,1].forEach(sd=>{const w=new T.Group();w.position.set(.006,.004,.01*sd);g.add(w);
    const sh=new T.Shape();sh.moveTo(0,0);sh.lineTo(.03,.05);sh.lineTo(.028,.13);sh.lineTo(-.02,.14);sh.lineTo(-.03,.05);sh.lineTo(-.02,0);
    const wg=new T.ExtrudeGeometry(sh,{depth:.003,bevelEnabled:false});wg.rotateX(Math.PI/2);if(sd<0)wg.scale(1,1,-1);const wm=new T.Mesh(wg,bk);w.add(wm);
    const band=new T.Mesh(new T.BoxGeometry(.014,.0035,.1),wh);band.position.set(-.017,.001,.075*sd);w.add(band);
    for(let k=0;k<6;k++){const f=new T.Mesh(new T.BoxGeometry(.006,.002,.03),bk);f.position.set(.024-k*.009,0,(.148+Math.sin(k*.6)*.004)*sd);f.rotation.y=(-.35+k*.13)*sd;w.add(f);}
    wings.push([w,sd]);});
  W.Q.mergeStatic(g,wings.map(w=>w[0]));g.userData.wings=wings;g.scale.setScalar(1.15*K);return g;}

// ------------------------------------------------------------ guanaco (Lama guanicoe)
function makeGuanaco(){const Q=W.Q,g=new T.Group(),I=new T.Group();I.scale.setScalar(.117);g.add(I);const fur='#b8773f',bel='#f2e6d2',face='#5a524e',dk='#3a322e';
  I.add(Q.loft([[-.62,.95,.1,.1],[-.52,.99,.22,.19],[-.25,.98,.26,.21],[0,.96,.27,.21],[.25,.98,.28,.21],[.45,1.0,.25,.19],[.58,1.03,.16,.14]],9,fur));
  I.add(Q.loft([[-.45,.85,.1,.14],[-.1,.8,.15,.16],[.25,.82,.15,.15],[.45,.88,.1,.12]],8,bel));
  const neck=new T.Group();neck.position.set(.5,1.05,0);I.add(neck);
  neck.add(Q.loft([[0,0,.14,.11],[.08,.22,.11,.085],[.15,.42,.09,.072],[.2,.56,.08,.066]],8,fur));
  neck.add(Q.loft([[.07,.02,.07,.07],[.14,.25,.05,.05],[.2,.48,.04,.04]],6,bel));
  const hd=new T.Group();hd.position.set(.2,.6,0);neck.add(hd);
  hd.add(Q.loft([[-.03,.02,.08,.07],[.07,.02,.075,.06],[.17,-.02,.055,.05],[.23,-.05,.035,.035]],8,face));
  hd.add(Q.eye(.08,.06,.055,.013));hd.add(Q.eye(.08,.06,-.055,.013));
  [-1,1].forEach(s2=>hd.add(Q.cone(.028,.12,fur,-.02,.14,.035*s2,.2*s2,.15)));
  I.add(Q.loft([[-.6,1.02,.05,.045],[-.67,.96,.05,.04],[-.7,.86,.03,.03]],6,dk));
  const legs=[];[[.4,.1,1],[.4,-.1,1],[-.45,.1,0],[-.45,-.1,0]].forEach(([x,z,f])=>{const L=Q.leg(x,.92,z,f?[[0,0,.07],[0,-.42,.04],[.01,-.45,.045],[.02,-.84,.03],[.03,-.88,.032]]:[[0,0,.1],[-.06,-.3,.06],[-.03,-.45,.04],[.02,-.84,.03],[.03,-.88,.032]],f?fur:fur,dk);I.add(L);legs.push(L);});
  W.Q.mergeStatic(g,legs.concat([neck]));g.userData={neck,legs};return g;}

// ------------------------------------------------------------ legend aura (soft glow + rising motes)
function glowTex(){const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');const gr=x.createRadialGradient(32,32,2,32,32,32);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.35,'rgba(255,255,255,.45)');gr.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=gr;x.fillRect(0,0,64,64);return new T.CanvasTexture(c);}
const AURA_COL={cuero:'#ff6a3a',ucumar:'#ffb23f',pillan:'#ffd23f',pirepillan:'#bfe9ff',pehuen:'#8ac926',pihuchen:'#ff3a6a'};

function build(){W=window.WORLD;root=new T.Group();root.name='fpworld';W.scene.add(root);
  const add=(key,geo,max,m)=>{const im=new T.InstancedMesh(geo,m,max);im.count=0;im.instanceMatrix.setUsage(T.DynamicDrawUsage);im.frustumCulled=false;im.userData.max=max;
    im.instanceColor=new T.InstancedBufferAttribute(new Float32Array(max*3),3);root.add(im);meshes[key]=im;};
  add('tuft',geoTuft(9,.04,.02),2600,swayMat());add('grass',geoTuft(12,.028,.03),4200,swayMat());add('neneo',geoNeneo(),380,W.toon('#ffffff'));
  add('cane',geoCane(),260,swayMat());add('fern',geoFern(),260,swayMat({side:T.DoubleSide}));add('flower',geoFlower(),420,swayMat());
  add('stone',new T.DodecahedronGeometry(.012,0),900,W.toon('#ffffff'));
  for(let i=0;i<3;i++){const c=makeCondor();root.add(c);condors.push({g:c,a:Math.random()*6.28,r:1.6+i*.9,h:2.2+i*.8,sp:.16+i*.04,ox:0,oz:0,ph:i*2.1});}
  const tex=glowTex();
  herdsInit();auraTex=tex;built=true;}
let auraTex=null;
function herdsInit(){const P=W.P;const spots=[[-37.905,-71.03,7],[-37.842,-70.99,6],[-37.925,-71.07,5]];
  spots.forEach(([la,lo,n])=>{const c=P(la,lo);const H={cx:c[0],cz:c[1],an:[]};for(let i=0;i<n;i++){const g=makeGuanaco();g.scale.setScalar(1.5);root.add(g);
    const a=Math.random()*6.28,r=Math.random()*.35;H.an.push({g,x:c[0]+Math.cos(a)*r,z:c[1]+Math.sin(a)*r,yaw:Math.random()*6.28,st:'graze',t:Math.random()*4,ph:Math.random()*6,sp:0});}herds.push(H);});}

// ------------------------------------------------------------ scatter
const col=new T.Color(),m4=new T.Matrix4(),q=new T.Quaternion(),e=new T.Euler(),v=new T.Vector3(),sc=new T.Vector3();
const PAL={coiron:['#cdbb6a','#bda95a','#d8c98a','#a9a054'],green:['#6a9a3a','#5c8a34','#7fa844'],neneo:['#7a9a3c','#6d8f38','#8aa44a'],stone:['#6e6660','#8a8078','#5a4e4a','#9a9088'],
  scoria:['#8a3e2e','#6b2e24','#a24a34'],sulfur:['#e0c84a','#d8b43a','#f0dc6a'],ochre:['#b8672a','#c97a34','#9a5424'],flower:['#ffd23f','#b15cff','#ff6fa8','#ffffff'],fern:['#4f8a3a','#5f9a42'],cane:['#8aa44a','#7a9a3c']};
function pick(a,h){return a[Math.floor(h*a.length)%a.length];}
function scatter(px,pz,I){const C=.085,R=2.1,n0=Math.floor(R/C);const cnt={};for(const k in meshes)cnt[k]=0;
  const put=(key,x,y,z,s,ry,c,tilt)=>{const im=meshes[key];const i=cnt[key];if(i>=im.userData.max)return;cnt[key]++;e.set(tilt||0,ry,tilt?tilt*.7:0);q.setFromEuler(e);sc.set(s*K,s*K,s*K);m4.compose(v.set(x,y,z),q,sc);im.setMatrixAt(i,m4);col.set(c);im.setColorAt(i,col);};
  const RP=(I.roadPts||[]).filter(p=>Math.abs(p[0]-px)<R+.2&&Math.abs(p[1]-pz)<R+.2);const road=(x,z)=>{let b=1e9;for(const p of RP){const d=(p[0]-x)**2+(p[1]-z)**2;if(d<b)b=d;}return Math.sqrt(b);};
  const ci=Math.floor(px/C),cj=Math.floor(pz/C);
  for(let i=ci-n0;i<=ci+n0;i++)for(let j=cj-n0;j<=cj+n0;j++){const h1=hs(i,j,1);const x=(i+hs(i,j,2))*C,z=(j+hs(i,j,3))*C;const d=Math.hypot(x-px,z-pz);if(d>R)continue;
    if(d>1.2&&h1>.55)continue; // thinner far away
    if(d<.07)continue; // nothing growing right in your face
    const E=W.infoAt(x,z);if(!E||E.dl<.04||E.rv.d<.05)continue;if(RP.length&&road(x,z)<.035)continue;
    const y=W.heightAt(x,z),alt=I.meters?I.meters(y):1500,ry=hs(i,j,4)*6.283,s=.75+hs(i,j,5)*.6,h2=hs(i,j,6);
    const acid=E.rv.d<.22&&E.rv.ph<4,forest=E.n1>.47&&alt<2050,high=alt>2250||E.dc<1.6,vent=E.dv<.5;
    if(vent||(acid&&h2<.35)){put('stone',x,y+.002,z,s*(.6+h2*.5),ry,pick(vent?PAL.sulfur:(h2<.18?PAL.ochre:PAL.sulfur),hs(i,j,7)),.3);continue;}
    if(high){if(h1<.3)put('stone',x,y+.002,z,s*(h2<.2?1.6:.8),ry,pick(h2<.5?PAL.scoria:PAL.stone,hs(i,j,7)),.4);else if(h1<.36&&alt<2600)put('tuft',x,y,z,s*.7,ry,pick(PAL.coiron,hs(i,j,7)));continue;}
    if(I.dense&&d<1.3&&!high&&(forest||x>XL())){const hh=hs(i,j,9);if(hh<.75)put('grass',x+(hh-.4)*.05,y,z+(hs(i,j,10)-.5)*.05,s*.8,ry+1,pick(forest?PAL.green:PAL.coiron,hh));if(hh<.4)put('grass',x-(hh-.2)*.06,y,z-(hs(i,j,11)-.5)*.06,s*.65,ry+2,pick(forest?PAL.green:PAL.green,hs(i,j,12)));}
    if(forest){if(h1<.42)put('grass',x,y,z,s,ry,pick(PAL.green,hs(i,j,7)));else if(h1<.445&&E.rv.d>.25)put('cane',x,y,z,s*.75,ry,pick(PAL.cane,hs(i,j,7)));else if(h1<.55)put('fern',x,y,z,s*1.2,ry,pick(PAL.fern,hs(i,j,7)));
      else if(h1<.66)put('stone',x,y+.002,z,s*.8,ry,pick(PAL.stone,hs(i,j,7)),.3);continue;}
    if(x<XL()){ // above Lake Caviahue: Andean steppe — sparse coirón, the odd shrub, lots of rock and sulfur
      if(h1<.14)put('tuft',x,y,z,s*.85,ry,pick(PAL.coiron,hs(i,j,7)));else if(h1<.165)put('neneo',x,y,z,s*.8,ry,pick(PAL.neneo,hs(i,j,7)));
      else if(h1<.36)put('stone',x,y+.002,z,s*(h2<.2?1.8:.9),ry,pick(h2<.3?PAL.scoria:PAL.stone,hs(i,j,7)),.35);else if(h1<.42)put('stone',x,y+.002,z,s*.8,ry,pick(PAL.sulfur,hs(i,j,7)),.3);
      else if(h1<.44)put('flower',x,y,z,s,ry,pick(PAL.flower,hs(i,j,7)));continue;}
    if(h1<.4)put('tuft',x,y,z,s,ry,pick(PAL.coiron,hs(i,j,7)));else if(h1<.48)put('neneo',x,y,z,s,ry,pick(PAL.neneo,hs(i,j,7)));
    else if(h1<.6)put('stone',x,y+.002,z,s*(h2<.15?1.7:.8),ry,pick(PAL.stone,hs(i,j,7)),.35);else if(h1<.66)put('flower',x,y,z,s,ry,pick(PAL.flower,hs(i,j,7)));
    else if(h1<.7&&E.rv.d<.35)put('grass',x,y,z,s,ry,pick(PAL.green,hs(i,j,7)));}
  for(const k in meshes){const im=meshes[k];im.count=cnt[k];im.instanceMatrix.needsUpdate=true;if(im.instanceColor)im.instanceColor.needsUpdate=true;}}


// ------------------------------------------------------------ near-field detailed trees (wrap the map trees you walk among)
let TD=null;
function treeDetail(){const bark=W.toon('#8a7f70'),barkD=W.toon('#6e6456'),fol=W.toon('#2e5e34'),fol2=W.toon('#3d7a44'),br=W.toon('#5b4a3a'),lg=[W.toon('#6f9a3e'),W.toon('#86ad4c'),W.toon('#5a8a34')];
  const mk=(geo,m,n)=>{const im=new T.InstancedMesh(geo,m,n);im.count=0;im.frustumCulled=false;root.add(im);return im;};
  TD={ring:mk(new T.TorusGeometry(.0135,.0022,4,10).rotateX(Math.PI/2),barkD,60*6),
    brn:mk(new T.CylinderGeometry(.0022,.0032,.085,5).rotateZ(Math.PI/2).translate(.0425,0,0),br,60*21),
    tuft:mk(new T.CapsuleGeometry(.0085,.045,3,6).rotateZ(Math.PI/2).translate(.085,.006,0),fol,60*21),
    tip:mk(new T.ConeGeometry(.012,.03,6).rotateZ(-Math.PI/2).translate(.1,.012,0),fol2,60*21),
    leaf:[0,1,2].map(i=>mk(new T.IcosahedronGeometry(.034,1),lg[i],60*3)),
    twig:mk(new T.CylinderGeometry(.0025,.004,.06,5).translate(0,.03,0),W.toon('#6b4226'),60*3),list:[]};}
function treesNear(px,pz){if(!TD)treeDetail();const L=(W.TREELIST||[]).filter(t=>Math.abs(t.x-px)<2.4&&Math.abs(t.z-pz)<2.4&&t.kind!=='young').slice(0,60);
  const c={ring:0,brn:0,tuft:0,tip:0,twig:0,leaf:[0,0,0]};const A=new T.Matrix4(),B=new T.Matrix4(),q=new T.Quaternion(),e=new T.Euler(),v=new T.Vector3(),sc=new T.Vector3(1,1,1);
  const set=(im,key,local)=>{B.multiplyMatrices(A,local);im.setMatrixAt(c[key]++,B);};
  L.forEach((t,ti)=>{A.copy(t.m);if(t.kind==='arau'){for(let r=0;r<6;r++)set(TD.ring,'ring',new T.Matrix4().makeTranslation(0,.04+r*.04,0));
      [.215,.245,.272].forEach((y,ti2)=>{const n=7;for(let k=0;k<n;k++){const a=k/n*6.283+ti2*.45+ti;e.set(0,a,.22-ti2*.06);q.setFromEuler(e);const M=new T.Matrix4().compose(v.set(0,y,0),q,sc.set(1-ti2*.12,1,1-ti2*.12));
        set(TD.brn,'brn',M);set(TD.tuft,'tuft',M);set(TD.tip,'tip',M);}});}
    else{for(let k=0;k<3;k++){const a=k*2.1+ti;const M=new T.Matrix4().compose(v.set(Math.cos(a)*.045,.12+k*.02,Math.sin(a)*.045),q.identity(),sc.set(1,1,1));const li=k%3;TD.leaf[li].setMatrixAt(c.leaf[li]++,B.multiplyMatrices(A,M));
      e.set(Math.sin(a)*.6,0,-Math.cos(a)*.6);q.setFromEuler(e);set(TD.twig,'twig',new T.Matrix4().compose(v.set(0,.07,0),q,sc.set(1,1,1)));}}});
  ['ring','brn','tuft','tip','twig'].forEach(k=>{TD[k].count=c[k];TD[k].instanceMatrix.needsUpdate=true;});TD.leaf.forEach((im,i)=>{im.count=c.leaf[i];im.instanceMatrix.needsUpdate=true;});}

// ------------------------------------------------------------ fumarole steam (soft rising puffs near vents)
let STM=null;
function steamInit(){STM={p:[],src:[]};const seen={};(W.steam||[]).forEach(s=>{const u=s.userData;const k=u.x.toFixed(2)+','+u.z.toFixed(2);if(!seen[k]){seen[k]=1;STM.src.push({x:u.x,z:u.z,y:u.y,sz:u.sz});}});
  for(let i=0;i<70;i++){const sp=new T.Sprite(new T.SpriteMaterial({map:auraTex,color:0xd8d8d2,transparent:true,depthWrite:false,opacity:0}));sp.visible=false;root.add(sp);STM.p.push({sp,t:Math.random(),s:null,ox:0,oz:0});}}
function steamTick(dt,I,near){if(!STM)steamInit();const act=STM.src.filter(s=>Math.hypot(s.x-I.x,s.z-I.z)<4);
  STM.p.forEach((P,i)=>{if(!near||!act.length){P.sp.visible=false;return;}if(!P.s||!act.includes(P.s)){P.s=act[i%act.length];P.t=Math.random();P.ox=(Math.random()-.5)*.12;P.oz=(Math.random()-.5)*.12;}
    P.t+=dt*.16;if(P.t>1){P.t-=1;P.ox=(Math.random()-.5)*.12;P.oz=(Math.random()-.5)*.12;}const k=P.t,S=P.s.sz||1;
    P.sp.visible=true;P.sp.position.set(P.s.x+P.ox+Math.sin(k*4+i)*.05*k,P.s.y+.02+k*.9*S,P.s.z+P.oz+k*.12);const r=(.12+k*.6)*S;P.sp.scale.set(r,r,1);P.sp.material.opacity=.8*Math.sin(Math.min(1,k*1.4)*Math.PI)*(1-k*.4);});}

// ------------------------------------------------------------ bandurrias (Theristicus melanopis) in meadows, trout jumping in clear rivers
function makeBandurria(){const Q=W.Q,g=new T.Group(),I=new T.Group();I.scale.setScalar(.07);g.add(I);const gr='#8a8478',bu='#d9b27a',bk='#1d1a2b',bl='#3a3a40';  // bandurria, lofted
  I.add(Q.loft([[-.35,.42,.03,.03],[-.25,.45,.1,.1],[0,.47,.14,.13],[.18,.5,.12,.11],[.26,.55,.08,.08]],8,gr));
  I.add(Q.loft([[-.36,.42,.04,.06],[-.46,.4,.02,.05]],6,bl));
  I.add(Q.loft([[.24,.55,.07,.065],[.3,.68,.055,.05],[.32,.8,.05,.045]],7,bu));
  I.add(Q.loft([[.31,.82,.06,.055],[.38,.84,.045,.04],[.42,.83,.025,.02]],7,bu));I.add(Q.eye(.37,.86,.035,.01));I.add(Q.eye(.37,.86,-.035,.01));
  I.add(Q.loft([[.42,.83,.014,.012],[.5,.8,.011,.01],[.58,.73,.008,.008],[.62,.65,.004,.004]],5,bk));
  [-1,1].forEach(s2=>I.add(Q.leg(.02,.4,.05*s2,[[0,0,.02],[0,-.2,.014],[.03,-.4,.012]],'#c43a3a')));
  g.userData.wing=[-1,1].map(s2=>{const w=new T.Group();w.position.set(0,.02,.004*s2);g.add(w);const m=Q.loft([[.012,0,.002,.006,0],[.0,0,.002,.018,.02*s2],[-.012,0,.001,.012,.035*s2]],5,gr);w.add(m);w.visible=false;return w;});return g;}
let BIRD=null;
function birdsTick(dt,I,near,t){if(!BIRD){BIRD={a:[],cx:1e9,cz:1e9};for(let i=0;i<6;i++){const g=makeBandurria();g.scale.setScalar(K*1.1);root.add(g);BIRD.a.push({g,x:0,z:0,y:0,yaw:0,st:'walk',t:0,fly:0});}}
  if(!near||I.x<XL()-.3){BIRD.a.forEach(b=>b.g.visible=false);BIRD.cx=1e9;return;}
  if(Math.hypot(I.x-BIRD.cx,I.z-BIRD.cz)>2.6){ // move the flock to a grassy spot ahead of the walker
    for(let tr=0;tr<25;tr++){const a=Math.random()*6.28,r=1+Math.random()*1.2;const x=I.x+Math.cos(a)*r,z=I.z+Math.sin(a)*r;const E=W.infoAt(x,z);if(x>XL()&&E&&E.dl>.08&&E.rv.d>.08&&E.dv>1&&(I.meters?I.meters(W.heightAt(x,z)):1500)<2100){BIRD.cx=x;BIRD.cz=z;break;}}
    BIRD.a.forEach((b,i)=>{b.x=BIRD.cx+(Math.random()-.5)*.25;b.z=BIRD.cz+(Math.random()-.5)*.25;b.st='walk';b.fly=0;b.yaw=Math.random()*6.28;});}
  BIRD.a.forEach((b,i)=>{b.g.visible=true;const d=Math.hypot(b.x-I.x,b.z-I.z);if(d<.35&&b.st!=='fly'){b.st='fly';b.fly=0;b.yaw=Math.atan2(-(b.z-I.z),b.x-I.x);}
    const gy=W.heightAt(b.x,b.z);if(b.st==='fly'){b.fly+=dt;const fx=Math.cos(b.yaw),fz=-Math.sin(b.yaw);b.x+=fx*dt*.5;b.z+=fz*dt*.5;b.y=gy+Math.min(.6,b.fly*.35);b.g.userData.wing.forEach((w,k)=>{w.visible=true;w.rotation.x=Math.sin(t*18+k*3)*.8;});
      if(b.fly>4){b.st='walk';b.x=BIRD.cx+(Math.random()-.5)*.25;b.z=BIRD.cz+(Math.random()-.5)*.25;b.y=W.heightAt(b.x,b.z);}}
    else{b.t-=dt;if(b.t<=0){b.t=1+Math.random()*3;b.yaw+=(Math.random()-.5)*2;b.peck=Math.random()<.5;}const sp=b.peck?0:.03;b.x+=Math.cos(b.yaw)*sp*dt;b.z-=Math.sin(b.yaw)*sp*dt;b.y=gy;b.g.userData.wing.forEach(w=>w.visible=false);}
    b.g.position.set(b.x,b.y,b.z);b.g.rotation.set(0,b.yaw,b.st!=='fly'&&b.peck?-.5*Math.max(0,Math.sin(t*6+i)):0);});}
let FISH=null;
function fishTick(dt,I,near){if(!FISH){const g=new T.Group();const m=new T.Mesh(new T.CapsuleGeometry(.006,.028,3,8),W.toon('#b7c3c9'));m.rotation.z=Math.PI/2;g.add(m);
    const st=new T.Mesh(new T.BoxGeometry(.03,.003,.0122),W.toon('#e98a9a'));g.add(st);const tl=new T.Mesh(new T.ConeGeometry(.008,.014,4),W.toon('#8a9aa2'));tl.rotation.z=Math.PI/2;tl.position.x=-.024;g.add(tl);
    g.scale.setScalar(K);g.visible=false;root.add(g);const ring=new T.Mesh(new T.RingGeometry(.02,.03,20),new T.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0,side:T.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;root.add(ring);
    FISH={g,ring,t:-3,x:0,z:0,y:0,yaw:0,rt:9};}
  const F=FISH;F.t+=dt;if(F.t<0||!near){F.g.visible=false;if(F.rt<1){F.rt+=dt;F.ring.material.opacity=.7*(1-F.rt);F.ring.scale.setScalar(1+F.rt*3);}else F.ring.material.opacity=0;return;}
  if(F.t>0&&!F.on){let R=null;try{R=W.nearestRiver(I.x,I.z);}catch(_){}if(!R||R.d>1.4||R.ph<5.5||!(I.fishZones||[]).some(z=>Math.hypot(I.x-z[0],I.z-z[1])<z[2])){F.t=-4;return;}const s=R.s;const x=s.a.x+(s.b.x-s.a.x)*R.t,z=s.a.z+(s.b.z-s.a.z)*R.t;
    F.x=x+(Math.random()-.5)*.1;F.z=z+(Math.random()-.5)*.1;F.y=W.heightAt(F.x,F.z)+.05;F.yaw=Math.atan2(-(s.b.z-s.a.z),s.b.x-s.a.x);F.on=1;F.t=0;}
  if(F.on){const k=F.t/.7;F.g.visible=k<1;F.g.position.set(F.x+Math.cos(F.yaw)*.12*k,F.y+Math.sin(k*Math.PI)*.1,F.z-Math.sin(F.yaw)*.12*k);F.g.rotation.set(0,F.yaw,Math.cos(k*Math.PI)*.9);
    if(k>=1){F.on=0;F.t=-(3+Math.random()*6);F.rt=0;F.ring.position.set(F.x+Math.cos(F.yaw)*.12,F.y+.001,F.z-Math.sin(F.yaw)*.12);}}}

// ------------------------------------------------------------ per frame
FPW.update=function(dt,I){if(!window.WORLD)return;if(!built)build();wind.value+=dt;const t=wind.value;
  const C=W.camera,near=Math.hypot(C.position.x-I.x,C.position.z-I.z)<3.5&&I.play;root.visible=true;
  for(const k in meshes)meshes[k].visible=near;
  I.dense=!!(window.REAL&&REAL.on);if(I.dense!==FPW._dense){FPW._dense=I.dense;last.x=1e9;}
  if(near&&(Math.hypot(I.x-last.x,I.z-last.z)>.3)){last.x=I.x;last.z=I.z;scatter(I.x,I.z,I);try{treesNear(I.x,I.z);}catch(e){console.warn('trees',e);}}
  if(TD){['ring','brn','tuft','tip','twig'].forEach(k=>TD[k].visible=near);TD.leaf.forEach(im=>im.visible=near);}
  steamTick(dt,I,near);birdsTick(dt,I,near,t);fishTick(dt,I,near);
  // condors soar over the walker, drifting slowly
  condors.forEach((c,i)=>{c.g.visible=near;if(!near)return;c.a+=dt*c.sp;c.ox=lerp(c.ox,I.x+Math.sin(t*.03+c.ph)*1.2,dt*.05);c.oz=lerp(c.oz,I.z+Math.cos(t*.025+c.ph)*1.2,dt*.05);if(!c.init){c.ox=I.x;c.oz=I.z;c.init=1;}
    const x=c.ox+Math.cos(c.a)*c.r,z=c.oz+Math.sin(c.a)*c.r;const y=Math.max(W.heightAt(x,z),W.heightAt(c.ox,c.oz))+c.h+Math.sin(t*.4+c.ph)*.15;c.g.position.set(x,y,z);
    c.g.rotation.set(0,-(c.a+Math.PI/2),0);c.g.rotateX(-.35);const flap=Math.sin(t*.5+c.ph)>.93?Math.sin(t*9)*.35:0;c.g.userData.wings.forEach(([w,sd])=>{w.rotation.x=(.08+flap)*-sd;});});
  // guanaco herds: graze, walk, trot away from people
  herds.forEach(H=>H.an.forEach(A=>{const dp=Math.hypot(A.x-I.x,A.z-I.z),dc=Math.hypot(A.x-C.position.x,A.z-C.position.z);A.g.visible=dc<9;if(!A.g.visible)return;
    A.t-=dt;if(dp<.45){A.st='flee';A.yaw=Math.atan2(-(A.z-I.z),A.x-I.x);A.t=2;}
    else if(A.t<=0){A.st=Math.random()<.55?'graze':'walk';A.t=2+Math.random()*5;if(A.st==='walk'){const hc=Math.hypot(A.x-H.cx,A.z-H.cz);A.yaw=hc>.45?Math.atan2(-(H.cz-A.z),H.cx-A.x)+(Math.random()-.5):A.yaw+(Math.random()-.5)*2;}}
    const want=A.st==='flee'?.34:A.st==='walk'?.05:0;A.sp=lerp(A.sp,want,dt*3);const fx=Math.cos(A.yaw),fz=-Math.sin(A.yaw);const nx=A.x+fx*A.sp*dt,nz=A.z+fz*A.sp*dt;
    const E=W.infoAt(nx,nz);if(E&&E.dl>.05&&E.rv.d>.06){A.x=nx;A.z=nz;}else A.yaw+=2;
    A.g.position.set(A.x,W.heightAt(A.x,A.z),A.z);A.g.rotation.y=A.yaw;const u=A.g.userData,st=A.sp*(A.st==='flee'?40:90);A.ph+=dt*(3+st*8);
    u.legs.forEach((L,k)=>{L.rotation.z=A.sp>.01?Math.sin(A.ph+(k%2?Math.PI:0)+(k>1?Math.PI/2:0))*(A.st==='flee'?.6:.35):0;});
    u.neck.rotation.z=lerp(u.neck.rotation.z,A.st==='graze'?-1.5+Math.sin(t*2+A.ph)*.08:A.st==='flee'?.2:0,dt*3);}));
  // legend auras
  if(I.eggs&&auras.length!==I.eggs.length){auras.forEach(a=>root.remove(a.g));auras=I.eggs.map(E=>{const g=new T.Group();const c=new T.Color(AURA_COL[E.id]||'#ffffff');
      const sp=new T.Sprite(new T.SpriteMaterial({map:auraTex,color:c,transparent:true,depthWrite:false,blending:T.AdditiveBlending,opacity:.6}));sp.scale.set(.7,.9,1);sp.position.y=.3;g.add(sp);
      const N=36,pos=new Float32Array(N*3);for(let k=0;k<N;k++){pos[k*3]=(Math.random()-.5)*.4;pos[k*3+1]=Math.random()*.7;pos[k*3+2]=(Math.random()-.5)*.4;}
      const pg=new T.BufferGeometry();pg.setAttribute('position',new T.BufferAttribute(pos,3));const pts=new T.Points(pg,new T.PointsMaterial({color:c,size:.018,transparent:true,opacity:.9,depthWrite:false,blending:T.AdditiveBlending}));g.add(pts);
      g.position.set(E.x,E.y,E.z);root.add(g);return {g,sp,pts,E};});}
  auras.forEach((a,i)=>{const d=Math.hypot(a.E.x-C.position.x,a.E.z-C.position.z);a.g.visible=d<7;if(!a.g.visible)return;const found=I.found&&I.found.includes(a.E.id);
    const k=(found?.35:1)*(.55+.45*Math.sin(t*1.6+i))*(.6+.4*(I.night||0));a.sp.material.opacity=.45*k;const arr=a.pts.geometry.attributes.position.array;
    for(let j=1;j<arr.length;j+=3){arr[j]+=dt*.12;if(arr[j]>.75)arr[j]=0;}a.pts.geometry.attributes.position.needsUpdate=true;a.pts.material.opacity=.8*k;});
};
})();
