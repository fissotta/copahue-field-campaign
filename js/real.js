// Copahue Field Campaign v8 — "REALISTA" look (inspired by dgreenheck/tidewater, MIT), WebGL2 only.
// Toggle with the 🎬 button or the O key; the comic look stays untouched when this is off.
// What it does while on:
//  • swaps toon materials for PBR (MeshStandardMaterial) with an environment map made from the current sky
//  • HDR render target, soft shadows, procedural detail on the terrain (rock on slopes, grit, macro variation)
//  • its own post pass: analytic atmosphere + sun + lit clouds, aerial perspective, ground AO,
//    god rays, bloom, ACES filmic tone mapping, grade, vignette and grain
//  • realistic water: fresnel sky reflection, sun glint, depth tint (the river colour still comes from measured pH)
(function(){
'use strict';
const T=THREE;const REAL={on:false};window.REAL=REAL;
let W=null,R=null,ready=false,post,bright,blurH,blurV,rtB1,rtB2,quad,qScene,qCam,pmrem=null,envRT=null,envT=-99,sweepT=0,btn=null;
try{REAL.on=localStorage.getItem('copahue.look')==='real';}catch(_){}

const VQ='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
const NOISE=`float hs(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float ns(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hs(i),hs(i+vec2(1,0)),f.x),mix(hs(i+vec2(0,1)),hs(i+vec2(1,1)),f.x),f.y);}
  float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*ns(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}`;
// analytic sky: Rayleigh-ish gradient that reddens with a low sun, Mie halo, sun disc, night blue
const SKY=`vec3 skyCol(vec3 rd,vec3 sw,float night){float el=max(rd.y,-.05),se=sw.y;float mu=max(dot(rd,sw),0.);
  vec3 zen=mix(vec3(.16,.36,.78),vec3(.22,.3,.55),smoothstep(.3,-.05,se)),hor=mix(vec3(.72,.84,.98),vec3(1.,.62,.38),smoothstep(.35,.0,se));
  vec3 c=mix(hor,zen,pow(smoothstep(-.02,.7,el),.55));c+=vec3(1.,.72,.42)*pow(mu,6.)*.35*smoothstep(-.1,.2,se)+vec3(1.,.9,.7)*pow(mu,48.)*.8;
  c=mix(c,vec3(.015,.025,.07)+vec3(.02,.03,.06)*(1.-el),night);if(rd.y<0.)c=mix(c,hor*.55,smoothstep(0.,-.3,rd.y));return c;}`;

function makePost(){return new T.ShaderMaterial({defines:{AO:1,RAYS:1},
  uniforms:{tC:{value:null},tD:{value:null},tB:{value:null},res:{value:new T.Vector2(1,1)},near:{value:.05},far:{value:500},camR:{value:new T.Matrix3()},camP:{value:new T.Vector3()},
    fovK:{value:new T.Vector2(1,1)},sunV:{value:new T.Vector3(0,1,0)},sunW:{value:new T.Vector3(0,1,0)},sunS:{value:new T.Vector3(.5,.5,0)},time:{value:0},night:{value:0},
    expo:{value:1.1},fogK:{value:1},cloudK:{value:.5},snowK:{value:0},mistK:{value:0},stars:{value:0}},
  vertexShader:VQ,depthTest:false,depthWrite:false,
  fragmentShader:`uniform sampler2D tC,tD,tB;uniform vec2 res,fovK;uniform float near,far,time,night,expo,fogK,cloudK,snowK,mistK,stars;uniform mat3 camR;uniform vec3 camP,sunV,sunW,sunS;varying vec2 vUv;
  ${NOISE}${SKY}
  float lin(float d){float z=d*2.-1.;return 2.*near*far/(far+near-z*(far-near));}
  vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
  void main(){float d=texture2D(tD,vUv).x;vec3 vd=normalize(vec3((vUv*2.-1.)*fovK,-1.));vec3 rd=normalize(camR*vd);vec3 col;
    if(d>.99999){col=skyCol(rd,sunW,night);float mu=max(dot(vd,sunV),0.);col+=vec3(1.,.95,.85)*smoothstep(.9996,.9999,mu)*6.*(1.-night);
      if(rd.y>0.){vec2 cp=rd.xz/(rd.y+.09)*.55+vec2(time*.006,time*.002);float n=fbm(cp*1.6),n2=fbm(cp*1.6+sunW.xz*.06);
        float cov=smoothstep(.62-cloudK*.28,.8-cloudK*.28,n)*smoothstep(0.,.1,rd.y);float lit=clamp(.55+(n-n2)*5.,.15,1.);
        vec3 cc=mix(vec3(.48,.52,.6),vec3(1.,.97,.92),lit)*mix(1.,.3,night);cc+=vec3(1.,.7,.45)*pow(mu,5.)*.6*(1.-night);
        float ci=smoothstep(.55,.85,fbm(vec2(cp.x*.4,cp.y*3.)+3.))*.35*(1.-cov);col=mix(col,cc,cov*.95);col+=vec3(.9,.9,.95)*ci*(1.-night)*.5;}
      {vec2 sc=floor(gl_FragCoord.xy/2.);float h=hs(sc);col+=vec3(step(.998,h))*stars*smoothstep(.1,.5,rd.y)*(.6+.4*sin(time*2.+h*40.));}
      col=mix(col,vec3(.8,.82,.86),snowK);}
    else{col=texture2D(tC,vUv).rgb;float dc=lin(d);vec3 wp=camP+camR*(vec3((vUv*2.-1.)*fovK,-1.)*dc);
      #if AO
      {float ao=0.;float rr=clamp(3./dc,.002,.03);for(int i=0;i<8;i++){float a=float(i)*.785+hs(gl_FragCoord.xy)*.8;vec2 o=vec2(cos(a),sin(a)*res.x/res.y)*rr*(.5+float(i)*.07);
        float dn=texture2D(tD,vUv+o).x;float ld=dn>.99999?far:lin(dn);ao+=clamp((dc-ld)/(dc*.08+.02),0.,1.)*step(ld,dc*.97);}col*=1.-ao/8.*.55;}
      #endif
      float fog=1.-exp(-dc*.003*fogK*(1.+smoothstep(6.,1.,wp.y)));vec3 fc=skyCol(normalize(vec3(rd.x,max(rd.y,.02),rd.z)),sunW,night)*mix(1.,.8,night);
      fc+=vec3(1.,.8,.55)*pow(max(dot(rd,sunW),0.),8.)*.25*(1.-night);col=mix(col,fc,clamp(fog,0.,.92));
      if(mistK>.01){float lo=smoothstep(camP.y-.15,camP.y-1.6,wp.y)*(1.-exp(-dc*.035));col=mix(col,fc*.95+.02*(1.-night),clamp(lo*mistK*.32,0.,.3));}
      col=mix(col,vec3(.9,.92,.96)*(1.-night*.7),snowK*.7);}
    #if RAYS
    if(sunS.z>.5&&night<.9){vec2 dir=(sunS.xy-vUv)/24.;vec2 p=vUv;float acc=0.;float w=1.;for(int i=0;i<24;i++){p+=dir;float s=step(.99999,texture2D(tD,clamp(p,0.,1.)).x);acc+=s*w;w*=.96;}
      float fall=pow(max(dot(vd,sunV),0.),6.);col+=vec3(1.,.82,.58)*acc/24.*fall*.55*(1.-night);}
    #endif
    col+=texture2D(tB,vUv).rgb*.35;
    col*=mix(vec3(1.),vec3(.5,.56,.82),night);
    col=aces(col*expo);col=pow(col,vec3(1.04));
    float l=dot(col,vec3(.299,.587,.114));col=mix(vec3(l),col,1.25);col*=vec3(1.02,1.,.97);
    vec2 q=vUv-.5;col*=1.-dot(q,q)*.55;col+=(hs(gl_FragCoord.xy+fract(time)*91.)-.5)*.018;
    gl_FragColor=vec4(col,1.);}`});}
function makeBright(){return new T.ShaderMaterial({uniforms:{tC:{value:null},tD:{value:null},px:{value:new T.Vector2()}},vertexShader:VQ,depthTest:false,depthWrite:false,
  fragmentShader:`uniform sampler2D tC,tD;uniform vec2 px;varying vec2 vUv;void main(){vec3 c=vec3(0.);for(int i=0;i<4;i++){vec2 o=vec2(i==0||i==2?-1.:1.,i<2?-1.:1.)*px;vec3 s=texture2D(tC,vUv+o).rgb;
    float l=max(max(s.r,s.g),s.b);c+=s*smoothstep(1.05,1.7,l);}gl_FragColor=vec4(c*.25,1.);}`});}
function makeBlur(){return new T.ShaderMaterial({uniforms:{tC:{value:null},dir:{value:new T.Vector2()}},vertexShader:VQ,depthTest:false,depthWrite:false,
  fragmentShader:`uniform sampler2D tC;uniform vec2 dir;varying vec2 vUv;void main(){vec3 c=texture2D(tC,vUv).rgb*.227;
    c+=(texture2D(tC,vUv+dir*1.38).rgb+texture2D(tC,vUv-dir*1.38).rgb)*.316;c+=(texture2D(tC,vUv+dir*3.23).rgb+texture2D(tC,vUv-dir*3.23).rgb)*.07;gl_FragColor=vec4(c,1.);}`});}

// ------------------------------------------------------------ materials
const std=new WeakMap();
function toStd(m){if(std.has(m))return std.get(m);const s=new T.MeshStandardMaterial({color:m.color.clone(),map:m.map||null,vertexColors:m.vertexColors,transparent:m.transparent,opacity:m.opacity,side:m.side,
    depthWrite:m.depthWrite,depthTest:m.depthTest,alphaTest:m.alphaTest,polygonOffset:m.polygonOffset,polygonOffsetFactor:m.polygonOffsetFactor,polygonOffsetUnits:m.polygonOffsetUnits,
    roughness:.82,metalness:0,envMapIntensity:.32});
  if(m.onBeforeCompile&&m.onBeforeCompile!==T.Material.prototype.onBeforeCompile){s.onBeforeCompile=m.onBeforeCompile;s.customProgramCacheKey=()=>'sw'+m.uuid;}
  const hx=m.color.getHexString();if(/^(bfe9ff|e6f6ff|eef4f6|cfe3ff|dff4ff|f4fbff)$/.test(hx)&&m.transparent){s.roughness=.08;s.metalness=.1;s.envMapIntensity=1.6;}  // glass & ice
  if(/^(d9d9d9|c9ced4|9aa3ad|b8bcc6)$/.test(hx)){s.metalness=.7;s.roughness=.35;}  // chrome / aluminium
  s.userData.toon=m;std.set(m,s);return s;}
function terrainStd(m){if(std.has(m))return std.get(m);const s=toStd(m);s.roughness=.95;
  // close-up ground detail without textures: biome-aware micro relief (rock strata, volcanic grit and pebbles, grass streaks) + bump lighting
  s.onBeforeCompile=sh=>{sh.vertexShader='varying vec3 vWP;varying vec3 vWN;\n'+sh.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvWP=(modelMatrix*vec4(transformed,1.)).xyz;vWN=normalize(mat3(modelMatrix)*objectNormal);');
    sh.fragmentShader='varying vec3 vWP;varying vec3 vWN;float gH;float gK;\n'+NOISE+`
      float vor(vec2 p){vec2 i=floor(p),f=fract(p);float d=1.;for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 g=vec2(x,y);vec2 o=vec2(hs(i+g),hs(i+g+17.));d=min(d,length(g+o-f));}return d;}
      `+'\n'+sh.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      {float n=fbm(vWP.xz*9.),m=fbm(vWP.xz*.8+7.);float slope=1.-smoothstep(.62,.86,vWN.y);vec3 vc=diffuseColor.rgb;
       float green=clamp((vc.g-max(vc.r,vc.b))*4.,0.,1.),snow=smoothstep(.8,.92,min(vc.r,min(vc.g,vc.b)));float near=clamp(1.-length(vViewPosition)/3.5,0.,1.);
       vec2 q=vWP.xz;float strata=sin(vWP.y*140.+fbm(q*30.)*6.)*.5+.5;float crack=smoothstep(.05,.0,vor(q*55.));
       float peb=smoothstep(.42,.3,vor(q*95.));float grit=hs(floor(q*400.));float blades=ns(vec2(q.x*420.,q.y*60.))*ns(vec2(q.x*60.,q.y*420.));
       float hRock=strata*.6+fbm(q*70.)*.6-crack*.8,hSand=peb*.7+grit*.25,hGrass=blades*.9+fbm(q*50.)*.3;
       gH=mix(mix(hSand,hGrass,green),hRock,slope)*(1.-snow*.8);gK=near;
       vec3 base=pow(vc,vec3(1.25))*1.08*(.82+.3*n)*(.9+.2*m);vec3 rock=mix(vec3(.36,.33,.31),vec3(.52,.47,.42),strata*.5+n*.5)*(.85+.3*m)*(1.-crack*.35);
       base*=mix(1.,.86+.28*gH,near);base=mix(base,base*vec3(.92,.9,.86)+peb*.08,near*(1.-green)*(1.-snow));
       diffuseColor.rgb=mix(base,rock,slope*.85)*(.95+.1*grit);}`).replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      if(gK>.01){vec3 dpx=dFdx(-vViewPosition),dpy=dFdy(-vViewPosition);float dhx=dFdx(gH),dhy=dFdy(gH);vec3 r1=cross(dpy,normal),r2=cross(normal,dpx);float det=dot(dpx,r1);
        vec3 grad=sign(det)*(dhx*r1+dhy*r2);normal=normalize(mix(normal,normalize(abs(det)*normal-grad*.0025),gK));}`);};
  s.customProgramCacheKey=()=>'terrR2';return s;}
function sweep(root){root.traverse(o=>{if(!o.material||o.userData.noReal)return;const conv=m=>{if(m&&m.isMeshToonMaterial){return o.userData.terr||o===W.terrain?terrainStd(m):toStd(m);}return m;};
  if(Array.isArray(o.material))o.material=o.material.map(conv);else o.material=conv(o.material);if(o.isMesh&&o.material&&o.material.isMeshStandardMaterial&&!o.userData.noShadow){o.receiveShadow=true;if(REAL.shadows&&!o.isInstancedMesh&&!o.material.transparent&&!o.userData.terr)o.castShadow=true;}});}
function unsweep(root){root.traverse(o=>{if(!o.material)return;const back=m=>m&&m.userData&&m.userData.toon?m.userData.toon:m;if(Array.isArray(o.material))o.material=o.material.map(back);else o.material=back(o.material);});}

// ------------------------------------------------------------ environment map from the current sky (for PBR reflections / ambient)
const envCv=document.createElement('canvas');envCv.width=128;envCv.height=64;const envTex=new T.CanvasTexture(envCv);envTex.mapping=T.EquirectangularReflectionMapping;
function updateEnv(night){if(!pmrem)pmrem=new T.PMREMGenerator(R);const x=envCv.getContext('2d');const s=W.sun.position.clone().sub(W.sun.target.position).normalize();
  const g=x.createLinearGradient(0,0,0,64);const k=1-night;const warm=Math.max(0,1-s.y*3);
  g.addColorStop(0,`rgb(${10+90*k|0},${16+154*k|0},${34+206*k|0})`);g.addColorStop(.48,`rgb(${16+214*k*(1+warm*.1)|0},${22+198*k|0},${38+182*k*(1-warm*.4)|0})`);g.addColorStop(.52,`rgb(${12+98*k|0},${12+93*k|0},${14+71*k|0})`);g.addColorStop(1,`rgb(${6+49*k|0},${6+47*k|0},${8+34*k|0})`);
  x.fillStyle=g;x.fillRect(0,0,128,64);const sx=((Math.atan2(s.x,-s.z)/(2*Math.PI))+1)%1*128,sy=(.5-Math.asin(Math.max(-1,Math.min(1,s.y)))/Math.PI)*64;const r=x.createRadialGradient(sx,sy,0,sx,sy,12);r.addColorStop(0,`rgba(255,235,200,${.9*k})`);r.addColorStop(1,'rgba(255,235,200,0)');x.fillStyle=r;x.fillRect(0,0,128,64);
  envTex.needsUpdate=true;if(envRT)envRT.dispose();envRT=pmrem.fromEquirectangular(envTex);W.scene.environment=envRT.texture;}

// ------------------------------------------------------------ setup / toggle
function setup(){W=window.WORLD;R=W.renderer;post=makePost();bright=makeBright();blurH=makeBlur();blurV=makeBlur();
  rtB1=new T.WebGLRenderTarget(4,4,{type:T.HalfFloatType,minFilter:T.LinearFilter,magFilter:T.LinearFilter});rtB2=rtB1.clone();
  qScene=new T.Scene();qCam=new T.OrthographicCamera(-1,1,1,-1,0,1);quad=new T.Mesh(new T.PlaneGeometry(2,2),post);qScene.add(quad);
  btn=document.createElement('button');btn.className='g-btn';btn.id='look-btn';btn.style.cssText='position:fixed;left:12px;top:212px;z-index:41;font-size:14px;padding:4px 8px';btn.onclick=()=>REAL.toggle();document.body.appendChild(btn);
  addEventListener('keydown',e=>{if(e.code==='KeyO'&&!/INPUT|TEXTAREA|SELECT/.test((e.target&&e.target.tagName)||''))REAL.toggle();});
  ready=true;label();if(REAL.on)apply(true);}
function label(){if(btn)btn.textContent=(REAL.on?'🎬 LOOK: REALISTA':'🎬 LOOK: CÓMIC')+' (O)';}
let saved=null;
function apply(on){const rt=W.rt;rt.dispose();rt.texture.type=on?T.HalfFloatType:T.UnsignedByteType;
  if(on){saved={sun:W.sun.intensity,hemi:W.hemi.intensity,sh:R.shadowMap.enabled,sht:R.shadowMap.type};REAL.shadows=W.GFX.level!=='low';R.shadowMap.enabled=REAL.shadows;R.shadowMap.type=T.PCFSoftShadowMap;W.sun.castShadow=REAL.shadows;
    if(REAL.shadows&&W.sun.shadow){W.sun.shadow.radius=3;W.sun.shadow.bias=-.0004;}
    sweep(W.scene);if(window.FPG&&FPG.scene)sweep(FPG.scene);(W.clouds||[]).forEach(c=>c.visible=false);envT=-99;
    (W.steam||[]).forEach(s=>{if(!s.userData.m0){s.userData.m0=s.material.map;}s.material.map=softTex();s.material.color.set(0xe8e8e4);s.material.needsUpdate=true;});}
  else{unsweep(W.scene);if(window.FPG&&FPG.scene)unsweep(FPG.scene);W.scene.environment=null;if(saved){R.shadowMap.enabled=saved.sh;R.shadowMap.type=saved.sht;W.sun.castShadow=saved.sh;}
    (W.clouds||[]).forEach(c=>c.visible=true);(W.steam||[]).forEach(s=>{if(s.userData.m0){s.material.map=s.userData.m0;s.material.color.set(0xffffff);s.material.needsUpdate=true;}});}
  W.scene.traverse(o=>{if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.needsUpdate=true);});
  (W.waterMats||[]).concat(W.riverMats||[]).forEach(m=>{if(m.uniforms&&m.uniforms.realK)m.uniforms.realK.value=on?1:0;});if(!on)setRefl(0);
  label();}
let _soft=null;function softTex(){if(_soft)return _soft;const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');const g=x.createRadialGradient(32,32,2,32,32,32);g.addColorStop(0,'rgba(255,255,255,.9)');g.addColorStop(.5,'rgba(255,255,255,.35)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,64,64);return _soft=new T.CanvasTexture(c);}
REAL.toggle=function(){if(!ready)return;REAL.on=!REAL.on;try{localStorage.setItem('copahue.look',REAL.on?'real':'comic');}catch(_){}apply(REAL.on);};

// ------------------------------------------------------------ per frame (called by world.js instead of the comic post pass)
const v=new T.Vector3();
REAL.frame=function(dt,t){if(!ready){if(window.WORLD&&WORLD.rt)setup();else return false;}if(!REAL.on)return false;
  const P=W.postMat.uniforms;sweepT-=dt;if(sweepT<=0){sweepT=1;sweep(W.scene);if(window.FPG&&FPG.scene)sweep(FPG.scene);}
  const night=P.stars.value;if(Math.abs(t-envT)>20||REAL._n==null||Math.abs(REAL._n-night)>.15){envT=t;REAL._n=night;updateEnv(night);}
  const C=W.camera,U=post.uniforms;const sw=v.copy(W.sun.position).sub(W.sun.target.position).normalize();U.sunW.value.copy(sw);U.sunV.value.copy(sw).transformDirection(C.matrixWorldInverse);
  U.camR.value.setFromMatrix4(C.matrixWorld);U.camP.value.copy(C.position);const th=Math.tan(C.fov*Math.PI/360);U.fovK.value.set(th*C.aspect,th);U.near.value=C.near;U.far.value=C.far;U.time.value=t;
  U.night.value=night;U.stars.value=night;U.cloudK.value=P.cloudK?P.cloudK.value:.5;U.snowK.value=P.snowK.value;U.mistK.value=P.mistK?P.mistK.value:0;
  (W.waterMats||[]).concat(W.riverMats||[]).forEach(m=>{if(m.uniforms&&m.uniforms.sunW){m.uniforms.sunW.value.copy(sw);m.uniforms.realK.value=1;}});
  const sp=C.position.clone().addScaledVector(sw,100).project(C);U.sunS.value.set(sp.x*.5+.5,sp.y*.5+.5,(sp.z<1&&Math.abs(sp.x)<1.6&&Math.abs(sp.y)<1.6)?1:0);
  W.sun.intensity=(1.+.25*(1-night))*(1-night*.85);W.hemi.intensity=.24*(1-night*.7)+.04;U.expo.value=.74+night*.06;  // night stays dark (exposure used to go UP at night)
  post.defines.AO=W.GFX.level==='low'?0:1;post.defines.RAYS=W.GFX.level==='low'?0:1;if(post.defines._l!==W.GFX.level){post.defines._l=W.GFX.level;post.needsUpdate=true;}
  try{reflect();}catch(e){console.warn('refl',e);setRefl(0);}
  return true;};
// ------------------------------------------------------------ planar reflection of mountains, trees and sky on the nearest lake
let rRT=null,rCam=null,rN=0;const rPlane=new T.Plane(new T.Vector3(0,1,0),0);
function reflect(){const C=W.camera,L=W.LAKES;if(!L||!L.length||W.GFX.level==='low'){setRefl(0);return;}
  let best=null,bd=1e9;for(const l of L){const d=W.lakeSdf(l,C.position.x,C.position.z);if(d<bd){bd=d;best=l;}}if(!best||bd>10){setRefl(0);return;}
  const Y=W.Y(best.level)+.004;if(C.position.y<Y+.01){setRefl(0);return;}
  rN++;if(rN%2&&rRT)return;  // every other frame
  const w=Math.max(64,W.rt.width>>1),h=Math.max(64,W.rt.height>>1);if(!rRT){rRT=new T.WebGLRenderTarget(w,h,{type:T.HalfFloatType});rCam=new T.PerspectiveCamera();}else if(rRT.width!==w||rRT.height!==h)rRT.setSize(w,h);
  rCam.copy(C);rCam.position.y=2*Y-C.position.y;const f=new T.Vector3();C.getWorldDirection(f);f.y=-f.y;rCam.up.set(0,1,0);rCam.lookAt(rCam.position.clone().add(f));rCam.updateMatrixWorld();rCam.updateProjectionMatrix();
  rPlane.set(new T.Vector3(0,1,0),-Y);const wm=[];W.scene.traverse(o=>{if(o.isMesh&&o.material&&W.waterMats.includes(o.material)&&o.visible){o.visible=false;wm.push(o);}});
  const cp=R.clippingPlanes,bg=W.scene.background;R.clippingPlanes=[rPlane];W.scene.background=new T.Color(0x9cc4ea);R.setRenderTarget(rRT);R.clear();R.render(W.scene,rCam);R.setRenderTarget(null);R.clippingPlanes=cp;W.scene.background=bg;wm.forEach(o=>o.visible=true);
  const M=new T.Matrix4().multiplyMatrices(rCam.projectionMatrix,rCam.matrixWorldInverse);  // shader maps clip xy/w to 0..1
  W.waterMats.forEach(m=>{if(m.uniforms.tRefl){m.uniforms.tRefl.value=rRT.texture;m.uniforms.reflM.value.copy(M);m.uniforms.reflY.value=Y;m.uniforms.reflOn.value=1;}});}
function setRefl(v){(W.waterMats||[]).forEach(m=>{if(m.uniforms&&m.uniforms.reflOn)m.uniforms.reflOn.value=v;});}
REAL.reflect=reflect;
REAL.post=function(){const rt=W.rt,w=rt.width,h=rt.height;const bw=Math.max(2,w>>2),bh=Math.max(2,h>>2);if(rtB1.width!==bw||rtB1.height!==bh){rtB1.setSize(bw,bh);rtB2.setSize(bw,bh);}
  quad.material=bright;bright.uniforms.tC.value=rt.texture;bright.uniforms.px.value.set(1/w,1/h);R.setRenderTarget(rtB1);R.render(qScene,qCam);
  quad.material=blurH;blurH.uniforms.tC.value=rtB1.texture;blurH.uniforms.dir.value.set(1/bw,0);R.setRenderTarget(rtB2);R.render(qScene,qCam);
  quad.material=blurV;blurV.uniforms.tC.value=rtB2.texture;blurV.uniforms.dir.value.set(0,1/bh);R.setRenderTarget(rtB1);R.render(qScene,qCam);
  blurH.uniforms.tC.value=rtB1.texture;blurH.uniforms.dir.value.set(2/bw,0);R.setRenderTarget(rtB2);quad.material=blurH;R.render(qScene,qCam);
  quad.material=post;const U=post.uniforms;U.tC.value=rt.texture;U.tD.value=rt.depthTexture;U.tB.value=rtB2.texture;U.res.value.set(w,h);R.setRenderTarget(null);R.render(qScene,qCam);};
})();
