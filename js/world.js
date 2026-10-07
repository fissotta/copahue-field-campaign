(function(){
'use strict';
// ------------------------------------------------------------------ geo helpers
const LAT0=-37.93, LON0=-70.91, KX=87.8, KZ=110.95, VE=4.2;
const P=(lat,lon)=>[(lon-LON0)*KX, -(lat-LAT0)*KZ];
const Y=h=>(h-900)/1000*VE;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const [LON_MIN,LON_MAX,LAT_MAX,LAT_MIN]=GEO.bounds;
const [X0,Z1]=P(LAT_MIN,LON_MIN), [X1,Z0]=P(LAT_MAX,LON_MAX);
const W=X1-X0, D=Z1-Z0;

function hash(i,j){let h=(Math.imul(i,374761393)+Math.imul(j,668265263))|0;h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return (h>>>0)/4294967295;}
function vnoise(x,y){const i=Math.floor(x),j=Math.floor(y),fx=x-i,fy=y-j,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);
  const a=hash(i,j),b=hash(i+1,j),c=hash(i,j+1),d=hash(i+1,j+1);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;}
function fbm(x,y,o=5){let s=0,a=.5,f=1,n=0;for(let k=0;k<o;k++){s+=a*vnoise(x*f+k*17.3,y*f-k*9.1);n+=a;f*=2.03;a*=.5;}return s/n;}
let seed=1234567;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return (seed>>>0)/4294967296;};

// ------------------------------------------------------------------ colours
const HAB={VER:{n:'Vertientes / cráter',c:'#ff4f3a'},RAS:{n:'Río Agrio Superior',c:'#ff9f1c'},LC:{n:'Lago Caviahue',c:'#2ec4b6'},
  RAI:{n:'Río Agrio Inferior',c:'#ffd23f'},DUL:{n:'Agua dulce (control)',c:'#3a86ff'},TER:{n:'Termas / geotermal (sin clasificar)',c:'#b15cff'}};
const PH_STOPS=[[0,'#c9184a'],[1,'#e5383b'],[2,'#f46036'],[3,'#ff9f1c'],[4,'#ffd23f'],[5,'#a7c957'],[6,'#2ec4b6'],[7,'#3a86ff'],[8.5,'#5e2bff']];
const HEAT=[[0,'#3a86ff'],[.25,'#2ec4b6'],[.5,'#ffd23f'],[.75,'#ff9f1c'],[1,'#ff4f3a']];
function hex2rgb(h){const n=parseInt(h.slice(1),16);return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];}
function ramp(stops,v){if(v<=stops[0][0])return hex2rgb(stops[0][1]);for(let i=1;i<stops.length;i++){if(v<=stops[i][0]){const t=(v-stops[i-1][0])/(stops[i][0]-stops[i-1][0]);const a=hex2rgb(stops[i-1][1]),b=hex2rgb(stops[i][1]);return [lerp(a[0],b[0],t),lerp(a[1],b[1],t),lerp(a[2],b[2],t)];}}return hex2rgb(stops[stops.length-1][1]);}
const rgbCss=c=>`rgb(${c.map(v=>Math.round(v*255)).join(',')})`;
const phColor=v=>ramp(PH_STOPS,v);
const GEN_COL={Acidithiobacillus:'#ff4f3a',Leptospirillum:'#ffb703',Ferroplasma:'#9b5de5',Sulfobacillus:'#f15bb5',Acidiphilium:'#00bbf9',Ferrovum:'#00d4a8',
 Limnohabitans:'#3a86ff',Polynucleobacter:'#8ac926',Thiomonas:'#fb8500',Acidocella:'#06d6a0',Sulfuriferula:'#e9c46a',Rhodanobacter:'#bc6c25',Legionella:'#8d99ae',
 Flavobacterium:'#48cae4',Acidiferrobacter:'#d62828',Halomonas:'#adb5bd',Curvibacter:'#4361ee',Aquirufa:'#7209b7',Acidianus:'#c77dff',Pseudomonas:'#90be6d',
 'Candidatus Parvarchaeum':'#e0aaff',Brevundimonas:'#f4a261',Vibrio:'#588157',Metallibacterium:'#a44a3f',Acidisphaera:'#ffafcc',Rhodoferax:'#264653',
 'Otros y no asignados':'#e9e4d4',Otros:'#e9e4d4',Proteobacteria:'#ff4f3a',Firmicutes:'#ffb703',Actinobacteria:'#00bbf9',Euryarchaeota:'#9b5de5',Acidobacteria:'#06d6a0',Nitrospirae:'#fb8500',
 Bacteroidetes:'#3a86ff',Planctomycetes:'#f15bb5',Cyanobacteria:'#8ac926','Filos < 1%':'#adb5bd',Bacteria:'#ff9f1c',Arquea:'#9b5de5',Eucariota:'#8ac926',Viruses:'#f15bb5',Desconocido:'#cfc8b6'};
const ARCHAEA=new Set(['Ferroplasma','Acidianus','Candidatus Parvarchaeum']);
const gcol=n=>GEN_COL[n]||'#cccccc';

// ------------------------------------------------------------------ sites
const CRED={CHC:'Muestreo 2020 · F. Issotta',CL:'Muestreo 2020 · F. Issotta',VA2:'Muestreo 2019 · R. Quatrini',VA1:'Muestreo 2019 · R. Quatrini',ME1:'Muestreo 2020 · F. Issotta',ME2:'Muestreo 2020 · F. Issotta',
 RAS1:'Muestreo 2019 · R. Quatrini',CC:'Muestreo 2019 · R. Quatrini',RJ:'Muestreo 2019 · R. Quatrini',RA_RJ:'Muestreo 2019 · R. Quatrini',LC:'Muestreo 2019 · R. Quatrini',RAI1:'Muestreo 2018 · R. Quatrini',
 SA1:'Muestreo 2019 · R. Quatrini',SA2:'Muestreo 2019 · R. Quatrini',PT:'Muestreo 2019 · R. Quatrini',LN:'Muestreo 2019 · R. Quatrini'};
const SITES=[
 {c:'CL',n:'Laguna del Cráter',lat:-37.85595,lon:-71.1583,hab:'VER',sid:'S13',ids:['S13'],photo:'CL',lo:[-60,-8]},
 {c:'VA2',n:'Vertiente del Agrio 2',lat:-37.85627,lon:-71.15428,hab:'VER',sid:'S7',site:'VA2',photo:'VA2',lo:[0,22],
   note:'El GPS 2019 de VA2 en la planilla (-37.866, -71.058) cae junto a Caviahue y parece un error, así que se usa el GPS 2020. En los gráficos de la tesis la muestra de vertiente secuenciada aparece rotulada como VA2 y, en otras diapositivas, como VA1.',lab:'<b>Del laboratorio:</b> la vertiente la domina <i>Fervidacidithiobacillus caldus</i>, con 6,6 M lecturas en el metagenoma. Pacheco-Acosta et al. (2025) describieron su plasmidoma: más de 30 plásmidos en 5 familias. Del complejo Caviahue-Copahue también proviene <i>Igneacidithiobacillus copahuensis</i> VAN18-1ᵀ, especie tipo de un género nuevo (Arisan et al. 2024).'},
 {c:'VA1',n:'Vertiente del Agrio 1',lat:-37.8551,lon:-71.1515,hab:'VER',sid:'S8',site:'VA1',photo:'VA1',lo:[62,-6]},
 {c:'CHC',n:'Chancho-Có, terma',lat:-37.8181,lon:-71.16612,hab:'TER',sid:'S16',ids:['S16'],photo:'CHC',lo:[-30,-4]},
 {c:'CHCa',n:'Chancho-Có arriba',lat:-37.8208,lon:-71.15477,hab:'TER',sid:'S17',ids:['S17'],lo:[40,-4],
   note:'En Metadata.xlsx la fila S17 comparte hora (12:15:33) y GPS con Melliza 2, así que puede estar duplicada. Aquí el sitio se ubica donde el mapa HTML registra las lecturas "ChanchoCo" (06-03-2020: pH 3,12 y 37 °C).'},
 {c:'ME1',n:'Laguna Melliza 1',lat:-37.83687,lon:-71.10142,hab:'DUL',note:'Las Mellizas son reservorios de agua potable de Caviahue y en la tesis se usan como control de agua dulce.',sid:'S14',site:'ME1',photo:'ME1',lo:[34,0]},
 {c:'ME2',n:'Laguna Melliza 2',lat:-37.83645,lon:-71.1095,hab:'DUL',note:'Las Mellizas son reservorios de agua potable de Caviahue y en la tesis se usan como control de agua dulce.',sid:'S15',site:'ME2',photo:'ME2',lo:[-34,0]},
 {c:'LSM',n:'Laguna Madre Sulfurosa',lat:-37.8190,lon:-71.0975,hab:'TER',sid:'LSM1–2, S18–19',site:'LSM',approx:true,lo:[0,-10],
   note:'No hay coordenadas ni fisicoquímica en la planilla (LSM1 y LSM2 de 2019; S18 a 0 m y S19 a −1 m de 2020). La ubicación es aproximada, dentro de las Termas de Copahue, donde la Laguna Sulfurosa se usa para madurar el fango de balneoterapia (Monasterio et al., 2016).'},
 {c:'RAS1',n:'Río Agrio Superior 1',lat:-37.8859,lon:-71.08107,hab:'RAS',lab:'<b>Del laboratorio:</b> Duarte et al. (2026, <i>ISME J</i>) muestran que en este río ácido y rico en azufre el caudal y la fracción del agua (libre o asociada a partículas) estructuran las comunidades. Sobre esferas de azufre, los oxidadores de azufre autótrofos colonizan primero y después llegan los heterótrofos de biofilm.',sid:'S3',site:'RAS1',photo:'RAS1',lo:[-40,6]},
 {c:'CC',n:'Cascada de la Culebra',lat:-37.88538,lon:-71.0671,hab:'RAS',sid:'S4',site:'CC',photo:'CC',lo:[0,30]},
 {c:'RA_RJ',n:'Unión Río Jara–Río Agrio',lat:-37.87868,lon:-71.05976,hab:'RAS',sid:'S6',site:'RA_RJ',photo:'RA_RJ',lo:[28,-18]},
 {c:'RJ',n:'Río Jara',lat:-37.87847,lon:-71.06109,hab:'DUL',sid:'S5',site:'RJ',photo:'RJ',lo:[-40,-18]},
 {c:'LC',n:'Lago Caviahue, brazo norte',lat:-37.86522,lon:-71.037,hab:'LC',sid:'S10',site:'LC',photo:'LC',lo:[0,0]},
 {c:'RAI1',n:'Río Agrio Inferior 1 (Puente de Gendarmería)',lat:-37.8285,lon:-70.96844,hab:'RAI',sid:'S1',site:'RAI1',photo:'RAI1',lo:[0,0]},
 {c:'SA1',n:'Salto del Agrio, arriba del salto',lat:-37.81019,lon:-70.92511,hab:'RAI',sid:'S2',site:'SA1',photo:'SA1',lo:[-34,0]},
 {c:'SA2',n:'Salto del Agrio, pozo',lat:-37.8099,lon:-70.92392,hab:'RAI',sid:'S11',site:'SA2',photo:'SA2',lo:[34,0]},
 {c:'PT',n:'Puerta de Trolope',lat:-37.81215,lon:-70.84148,hab:'RAI',sid:'S9',site:'PT',photo:'PT',lo:[0,0]},
 {c:'LN',n:'Norte de Loncopué',lat:-38.06277,lon:-70.59931,hab:'DUL',sid:'S12',site:'LN',photo:'LN',lo:[0,0]},
];
const SMP=DATA.samples, TAXA=DATA.taxa, FIELD=DATA.field;
SITES.forEach(s=>{
  s.samples=SMP.filter(m=>s.ids?s.ids.includes(m.id):m.site===s.site).sort((a,b)=>a.year-b.year||(a.name<b.name?-1:1));
  s.taxa=TAXA[s.c]||null;
  const p=P(s.lat,s.lon);s.x=p[0];s.z=p[1];
});
const byCode=Object.fromEntries(SITES.map(s=>[s.c,s]));

// ------------------------------------------------------------------ terrain model
// rivers from the DEM (STL) + thesis anchors: [lat,lon,elev,pH,habitat]
const RIVERS=GEO.rivers;
RIVERS.forEach(r=>{r.P=r.pts.map(p=>{const q=P(p[0],p[1]);return {x:q[0],z:q[1],e:p[2],ph:p[3],hab:p[4]};});});
const SEGS=[];RIVERS.forEach((r,ri)=>{for(let i=0;i<r.P.length-1;i++){const a=r.P[i],b=r.P[i+1];SEGS.push({a,b,ri,x0:Math.min(a.x,b.x),x1:Math.max(a.x,b.x),z0:Math.min(a.z,b.z),z1:Math.max(a.z,b.z)});}});
function nearestRiver(x,z){let best={d:1e9};for(const s of SEGS){const qx=Math.max(s.x0-x,0,x-s.x1),qz=Math.max(s.z0-z,0,z-s.z1);if(qx*qx+qz*qz>best.d*best.d)continue;const ax=s.a.x,az=s.a.z,bx=s.b.x-ax,bz=s.b.z-az;const L=bx*bx+bz*bz;let t=((x-ax)*bx+(z-az)*bz)/L;t=clamp(t,0,1);
  const px=ax+bx*t-x,pz=az+bz*t-z;const d=Math.sqrt(px*px+pz*pz);if(d<best.d)best={d,t,s};}
  const s=best.s;best.e=lerp(s.a.e,s.b.e,best.t);best.ph=lerp(s.a.ph,s.b.ph,best.t);best.hab=best.t<.5?s.a.hab:s.b.hab;best.ri=s.ri;return best;}

// lakes: capsule chains
function capsule(x,z,a,b,r){const bx=b[0]-a[0],bz=b[1]-a[1];let t=((x-a[0])*bx+(z-a[1])*bz)/(bx*bx+bz*bz);t=clamp(t,0,1);return Math.hypot(a[0]+bx*t-x,a[1]+bz*t-z)-r;}
// DEM (from mapa_escalado_2.stl, georeferenced on the sampling sites)
const DEMN=GEO.dem;
const DEM=(()=>{const b=atob(DEMN.b64);const a=new Uint16Array(b.length/2);for(let i=0;i<a.length;i++)a[i]=b.charCodeAt(2*i)|(b.charCodeAt(2*i+1)<<8);return a;})();
function demAt(x,z){const fx=clamp((x-X0)/W*DEMN.nx,0,DEMN.nx-1e-3),fz=clamp((z-Z0)/D*DEMN.nz,0,DEMN.nz-1e-3);const i=Math.floor(fx),j=Math.floor(fz),tx=fx-i,tz=fz-j;const g=(a,b)=>DEM[b*(DEMN.nx+1)+a];return lerp(lerp(g(i,j),g(i+1,j),tx),lerp(g(i,j+1),g(i+1,j+1),tx),tz);}
// Ruta Provincial 26 según Google Maps (camino.png): hacia Copahue sale al norte por el brazo norte; hacia Loncopué bordea la orilla sur del brazo sur
const ROADS=[
 [[-37.8712,-71.0509],[-37.8653,-71.0495],[-37.86228,-71.04633],[-37.86255,-71.04106],[-37.86105,-71.03653],[-37.85688,-71.03159],[-37.8524,-71.02619],[-37.8493,-71.02247],[-37.84288,-71.01943],[-37.836,-71.022],[-37.830,-71.036],[-37.826,-71.056],[-37.823,-71.078],[-37.8215,-71.0955]],
 [[-37.86228,-71.04633],[-37.86533,-71.0495],[-37.8712,-71.05086],[-37.87495,-71.05052],[-37.87938,-71.05505],[-37.8843,-71.05052],[-37.8875,-71.04612],[-37.89044,-71.03903],[-37.89327,-71.03159],[-37.89445,-71.02551],[-37.89392,-71.01551],[-37.89498,-71.00658],[-37.89632,-70.9978],[-37.90166,-70.99374],[-37.90781,-70.99239],[-37.91075,-70.98698],[-37.91144,-70.97752],[-37.9134,-70.9741],[-37.93,-70.94],[-37.96,-70.87],[-38.00,-70.78],[-38.04,-70.69],[-38.07,-70.62],[-38.10,-70.585]],
].map(r=>r.map(p=>P(p[0],p[1])));
const LG=GEO.lake;const LSDF=(()=>{const b=atob(LG.b64);const a=new Float32Array(b.length);for(let i=0;i<a.length;i++){let v=b.charCodeAt(i);if(v>127)v-=256;a[i]=v/50;}
  // Lake Caviahue grown a little (up to LAKE_GROW) so the boat has room, but not near Ruta 26, which hugs the shore
  const LAKE_GROW=.19,segs=[];ROADS.forEach(R=>{for(let k=0;k<R.length-1;k++)segs.push([R[k],R[k+1]]);});
  for(let j=0;j<LG.nz;j++)for(let i=0;i<LG.nx;i++){const n=j*LG.nx+i;if(a[n]>LAKE_GROW+.3)continue;const x=LG.x0+i*LG.res,z=LG.z0+j*LG.res;let rd=1e9;
    for(const [p,q] of segs){const bx=q[0]-p[0],bz=q[1]-p[1];const t=clamp(((x-p[0])*bx+(z-p[1])*bz)/(bx*bx+bz*bz),0,1);rd=Math.min(rd,Math.hypot(p[0]+bx*t-x,p[1]+bz*t-z));}
    a[n]-=LAKE_GROW*smooth(.12,.4,rd);}
  return a;})();
function caviSdf(x,z){const fx=(x-LG.x0)/LG.res,fz=(z-LG.z0)/LG.res;if(fx<0||fz<0||fx>=LG.nx-1||fz>=LG.nz-1)return 3;const i=Math.floor(fx),j=Math.floor(fz),tx=fx-i,tz=fz-j;const g=(a,b)=>LSDF[b*LG.nx+a];return lerp(lerp(g(i,j),g(i+1,j),tx),lerp(g(i,j+1),g(i+1,j+1),tx),tz);}
const LAKES=[
 {n:'Lago Caviahue',level:LG.level,col:'#39c6c0',depth:80,grid:true,bbox:[LG.x0,LG.x0+LG.nx*LG.res,LG.z0,LG.z0+LG.nz*LG.res]},
 {n:'Laguna del Cráter',col:'#b9e4c9',depth:40,caps:[[[-37.8561,-71.1605],[-37.8557,-71.1582],.33]]},
 {n:'Melliza 1',col:'#4cc9f0',depth:15,caps:[[[-37.8374,-71.1022],[-37.8364,-71.1006],.17]]},
 {n:'Melliza 2',col:'#4895ef',depth:15,caps:[[[-37.8370,-71.1106],[-37.8360,-71.1084],.2]]},
 {n:'Laguna Sulfurosa',col:'#d0e37f',depth:6,caps:[[[-37.8190,-71.0980],[-37.8190,-71.0970],.07]]},
 {n:'Laguna del Cacique',col:'#4cc9f0',depth:8,caps:[[[-37.8995,-70.9848],[-37.9035,-70.9858],.07]]},
 {n:'Laguna Escondida',col:'#3a86ff',depth:5,caps:[[[-37.8683,-71.0626],[-37.8681,-71.0620],.04]]},
 {n:'Laguna Verde',col:'#6fd08c',depth:4,caps:[[[-37.8214,-71.0968],[-37.8212,-71.0960],.045]]},
 {n:'Laguna del Chancho',col:'#a0856b',depth:4,caps:[[[-37.8199,-71.0962],[-37.8197,-71.0955],.04]]},
];
LAKES.forEach(l=>{if(l.caps){l.C=l.caps.map(c=>[P(c[0][0],c[0][1]),P(c[1][0],c[1][1]),c[2]]);const c0=l.C[0][0];l.level=demAt(c0[0],c0[1])-2;}});
function lakeSdf(l,x,z){if(l.grid)return caviSdf(x,z);let d=1e9;for(const c of l.C)d=Math.min(d,capsule(x,z,c[0],c[1],c[2]));return d;}

const VOLC=(()=>{let m=0,mi=0;for(let i=0;i<DEM.length;i++)if(DEM[i]>m){m=DEM[i];mi=i;}const j=Math.floor(mi/(DEMN.nx+1)),i=mi%(DEMN.nx+1);return [X0+i/DEMN.nx*W,Z0+j/DEMN.nz*D];})();
const CRATER=P(-37.8559,-71.1583);
// ------------------------------------------------------------------ Salto del Agrio: carved amphitheater, plunge pool and waterfall
const SALTO=(()=>{const R=RIVERS[2].P;if(!R||R.length<33)return null;
  const n2=(a,b)=>{const x=b.x-a.x,z=b.z-a.z,l=Math.hypot(x,z)||1;return [x/l,z/l];};
  const up=n2(R[28],R[27]);const Lp=[R[28].x+up[0]*.02,R[28].z+up[1]*.02];const d=n2(R[28],R[29]);
  const Rb=.42,D=.7,wc=.3,Lc=2.1;const Pc=[Lp[0]+d[0]*Rb,Lp[1]+d[1]*Rb];
  const C=[Pc,[R[29].x,R[29].z],[R[30].x,R[30].z],[R[31].x,R[31].z],[R[32].x,R[32].z],[R[33].x,R[33].z]];
  const cum=[Rb];for(let i=1;i<C.length;i++)cum.push(cum[i-1]+Math.hypot(C[i][0]-C[i-1][0],C[i][1]-C[i-1][1]));
  const left=[-d[1],d[0]];
  let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;[Lp,...C].forEach(p=>{x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);z0=Math.min(z0,p[1]);z1=Math.max(z1,p[1]);});
  return {Lp,Pc,d,up,left,Rb,D,wc,Lc,C,cum,bb:[x0-.75,x1+.75,z0-.75,z1+.75]};})();
function saltoCarve(x,z){const S=SALTO;if(!S||x<S.bb[0]||x>S.bb[1]||z<S.bb[2]||z>S.bb[3])return 0;
  const db=Math.hypot(x-S.Pc[0],z-S.Pc[1]);let m=1-smooth(S.Rb-.035,S.Rb+.012,db);
  // canyon downstream of the bowl, following the river; the floor ramps back up to the plateau
  let best=1e9,sAt=0;for(let i=0;i<S.C.length-1;i++){const a=S.C[i],b=S.C[i+1],bx=b[0]-a[0],bz=b[1]-a[1],L=bx*bx+bz*bz;let t=clamp(((x-a[0])*bx+(z-a[1])*bz)/L,0,1);const dd=Math.hypot(a[0]+bx*t-x,a[1]+bz*t-z);if(dd<best){best=dd;sAt=S.cum[i]+t*Math.sqrt(L);}}
  if(sAt<S.Lc){const ramp=1-smooth(S.Rb*1.6,S.Lc,sAt),w=S.wc*(1+.25*smooth(S.Lc*.6,S.Lc,sAt));m=Math.max(m,(1-smooth(w-.03,w+.012,best))*ramp);}
  return m*S.D;}
if(SALTO){const S=SALTO;const s1=byCode.SA1,s2=byCode.SA2;
  s1.x=S.Lp[0]+S.up[0]*.16-S.left[0]*.05;s1.z=S.Lp[1]+S.up[1]*.16-S.left[1]*.05;
  s2.x=S.Pc[0]+S.left[0]*.3+S.d[0]*.02;s2.z=S.Pc[1]+S.left[1]*.3+S.d[1]*.02;}
function elevation(x,z){
  const rv=nearestRiver(x,z);
  let dl=1e9,lake=null;for(const l of LAKES){const d=lakeSdf(l,x,z);if(d<dl){dl=d;lake=l;}}
  const east=smooth(-2,14,x);
  const n1=fbm(x*.16+11,z*.16+3),n2=fbm(x*.45-7,z*.45+5,4);
  let h=demAt(x,z)+(n2-.5)*26;
  const dv=Math.hypot(x-VOLC[0],z-VOLC[1]),dc=Math.hypot(x-CRATER[0],z-CRATER[1]);
  if(rv.d<.35){const bed=rv.e-5;h=Math.min(h,lerp(bed,h,smooth(.03,.35,rv.d)));}
  if(dl<.6){const L=lake.level;if(dl<0)h=L-4-lake.depth*smooth(0,.5,-dl);else h=lerp(L+2,Math.max(h,L+2),smooth(0,.6,dl));}
  return {h,rv,dl,lake,n1,n2,east,dv,dc};
}

// ------------------------------------------------------------------ three setup
const canvas=document.getElementById('gl');
const renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();console.warn('WebGL context lost');try{document.body.insertAdjacentHTML('beforeend','<div id="ctxlost" style="position:fixed;inset:auto 0 40% 0;text-align:center;z-index:999;font:22px sans-serif;color:#fff;text-shadow:0 2px 4px #000">La tarjeta gráfica se reinició… recuperando</div>');}catch(_){}} ,false);
canvas.addEventListener('webglcontextrestored',()=>{const d=document.getElementById('ctxlost');if(d)d.remove();},false);
let DPR=Math.min(window.devicePixelRatio||1,2);renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth,innerHeight);renderer.outputEncoding=THREE.LinearEncoding;
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(42,innerWidth/innerHeight,.05,500);
camera.position.set(-9,16,11);
const controls=new THREE.MapControls(camera,canvas);
controls.enableDamping=true;controls.dampingFactor=.09;controls.screenSpacePanning=false;
controls.minDistance=1.2;controls.maxDistance=110;controls.maxPolarAngle=1.36;controls.zoomSpeed=1.1;
controls.target.set(-17,5.5,-5.5);controls.autoRotateSpeed=.6;
controls.update();

const gradTex=(()=>{const d=new Uint8Array([85,85,85,255,150,150,150,255,205,205,205,255,245,245,245,255]);const t=new THREE.DataTexture(d,4,1,THREE.RGBAFormat);t.minFilter=t.magFilter=THREE.NearestFilter;t.needsUpdate=true;return t;})();
const toon=(c,o={})=>new THREE.MeshToonMaterial(Object.assign({color:c,gradientMap:gradTex},o));
const hemi=new THREE.HemisphereLight(0xfff4d6,0x5a4a7a,.5);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffffff,.78);sun.position.set(-18,40,16);scene.add(sun);

// ------------------------------------------------------------------ terrain mesh
const NX=DEMN.nx, NZ=DEMN.nz, DXS=W/NX, DZS=D/NZ;
const HGT=new Float32Array((NX+1)*(NZ+1));
const geo=new THREE.PlaneGeometry(W,D,NX,NZ);geo.rotateX(-Math.PI/2);geo.translate(X0+W/2,0,Z0+D/2);
const pos=geo.attributes.position, NV=pos.count;
const colBase=new Float32Array(NV*3), colHab=new Float32Array(NV*3);
const INFO=[];
function buildTerrain(){
  for(let i=0;i<NV;i++){
    const x=pos.getX(i),z=pos.getZ(i);const E=elevation(x,z);
    HGT[i]=E.h;pos.setY(i,Y(E.h));INFO.push(E);
  }
  geo.computeVertexNormals();
  const nor=geo.attributes.normal;
  const C=k=>hex2rgb(k);
  const SNOW=C('#f6f8ff'),ASH=C('#9a93ad'),ASH2=C('#7b728f'),GRN=C('#5a9a48'),GRN2=C('#447f3e'),STEP1=C('#cbb679'),STEP2=C('#b39a60'),MES=C('#c99466'),MES2=C('#b27a52'),
        RUST=C('#e0662c'),RUST2=C('#f2a03d'),SAND=C('#e9d7a6'),ROCK=C('#a8917a'),BED=C('#8a7a66'),SULF=C('#f2e35b');
  for(let i=0;i<NV;i++){
    const E=INFO[i],h=E.h,slope=1-nor.getY(i);let c;
    const n=E.n2;
    if(E.dl<0){c=BED;}
    else if(h>2560-70*n){c=SNOW;}
    else if(E.dv<5.5){c=(n>.52?ASH:ASH2);if(E.dv>3.5&&h<2150&&E.n1>.5)c=mix3(c,GRN,.5);}
    else{
      const forest=(E.n1>.47&&h<2050&&h>1580&&E.east<.35);
      if(forest)c=n>.5?GRN:GRN2;
      else{c=n>.5?STEP1:STEP2;const band=(Math.floor(h/110)%2)?MES:MES2;c=mix3(c,band,smooth(.35,.95,E.east)*.75);}
      if(slope>.35)c=mix3(c,ROCK,.6);
    }
    if(E.dl>=0&&E.dl<.12)c=mix3(c,SAND,.8);
    if(E.rv.d<.45&&E.dl>=0){const acid=E.rv.ph<4.5;const k=1-smooth(.1,.45,E.rv.d);c=mix3(c,acid?(E.rv.ph<3?RUST:RUST2):GRN,k*(acid?.85:.5));}
    const nearSulf=[CRATER,P(-37.8208,-71.1548),P(-37.834,-71.084),P(-37.822,-71.098),P(-37.8563,-71.1543)].some(p=>Math.hypot(pos.getX(i)-p[0],pos.getZ(i)-p[1])<.28);
    if(nearSulf&&E.dl>=0)c=mix3(c,SULF,.75);
    colBase.set(c,i*3);
    // habitat tint
    let hc=null;const d=E.rv.d;
    if(E.lake&&E.lake.n==='Lago Caviahue'&&E.dl<1.1)hc=HAB.LC.c;
    else if(d<1.3)hc=HAB[E.rv.hab].c;
    let tint=c;
    if(hc){const k=E.lake&&E.dl<1.1?1-smooth(0,1.1,E.dl):1-smooth(.2,1.3,d);tint=mix3(c,hex2rgb(hc),.78*k);}
    colHab.set(tint,i*3);
  }
  geo.setAttribute('color',new THREE.BufferAttribute(colBase.slice(),3));
}
function mix3(a,b,t){return [lerp(a[0],b[0],t),lerp(a[1],b[1],t),lerp(a[2],b[2],t)];}
function infoAt(x,z){const i=Math.round(clamp((x-X0)/DXS,0,NX)),j=Math.round(clamp((z-Z0)/DZS,0,NZ));return INFO[j*(NX+1)+i];}
function heightAt(x,z){
  const fx=clamp((x-X0)/DXS,0,NX-1e-3),fz=clamp((z-Z0)/DZS,0,NZ-1e-3);const i=Math.floor(fx),j=Math.floor(fz),tx=fx-i,tz=fz-j;
  const g=(a,b)=>HGT[b*(NX+1)+a];
  const h=lerp(lerp(g(i,j),g(i+1,j),tx),lerp(g(i,j+1),g(i+1,j+1),tx),tz);return Y(h)-saltoCarve(x,z);
}
let saltoTex=null;
function buildSalto(){const S=SALTO;if(!S)return;
  const baseH=(x,z)=>{const fx=clamp((x-X0)/DXS,0,NX-1e-3),fz=clamp((z-Z0)/DZS,0,NZ-1e-3);const i=Math.floor(fx),j=Math.floor(fz),tx=fx-i,tz=fz-j;const g=(a,b)=>HGT[b*(NX+1)+a];return Y(lerp(lerp(g(i,j),g(i+1,j),tx),lerp(g(i,j+1),g(i+1,j+1),tx),tz));};
  // 1) sink the coarse terrain under the detailed patch
  const near=(x,z)=>{let m=0;for(let a=0;a<6;a++){const r=.26,ang=a/6*6.283;m=Math.max(m,saltoCarve(x+Math.cos(ang)*r,z+Math.sin(ang)*r),saltoCarve(x+Math.cos(ang)*r*.5,z+Math.sin(ang)*r*.5));}return Math.max(m,saltoCarve(x,z));};
  for(let i=0;i<NV;i++){const x=pos.getX(i),z=pos.getZ(i);if(x<S.bb[0]||x>S.bb[1]||z<S.bb[2]||z>S.bb[3])continue;if(near(x,z)>0)pos.setY(i,pos.getY(i)-S.D-.25);}
  pos.needsUpdate=true;geo.computeVertexNormals();
  // 2) detailed patch
  const res=.02,nx=Math.ceil((S.bb[1]-S.bb[0])/res),nz=Math.ceil((S.bb[3]-S.bb[2])/res);
  const pg=new THREE.PlaneGeometry(nx*res,nz*res,nx,nz);pg.rotateX(-Math.PI/2);pg.translate(S.bb[0]+nx*res/2,0,S.bb[2]+nz*res/2);
  const pp=pg.attributes.position,cols=new Float32Array(pp.count*3),tc=geo.attributes.color;
  const BAS=[hex2rgb('#5d5955'),hex2rgb('#6c6863'),hex2rgb('#4d4a48')],RUSTc=hex2rgb('#b4532a'),RUST2c=hex2rgb('#d27a3a'),MOSS=hex2rgb('#5f9b3c'),GRAV=hex2rgb('#b8743e'),CAP=hex2rgb('#a9a197');
  for(let i=0;i<pp.count;i++){const x=pp.getX(i),z=pp.getZ(i),cv=saltoCarve(x,z);pp.setY(i,baseH(x,z)-cv+.012);
    const fi=Math.round(clamp((x-X0)/DXS,0,NX)),fj=Math.round(clamp((z-Z0)/DZS,0,NZ)),vi=fj*(NX+1)+fi;let c=[colBase[vi*3],colBase[vi*3+1],colBase[vi*3+2]];
    if(cv>.004){const f=cv/S.D;const lat=(x-S.Pc[0])*S.left[0]+(z-S.Pc[1])*S.left[1];
      if(f>.9){c=lat>.05?mix3(GRAV,MOSS,.55):mix3(GRAV,RUSTc,.35);}
      else{const n=Math.abs(Math.sin(x*310)*Math.cos(z*290));c=BAS[Math.floor(n*2.99)];if(f>.3&&f<.62)c=mix3(c,f>.45?RUSTc:RUST2c,.7);if(f>.78&&lat>0)c=mix3(c,MOSS,.75);}}
    else{const dl=Math.hypot(x-S.Lp[0],z-S.Lp[1]);if(dl<.12)c=mix3(c,RUST2c,.6*(1-dl/.12));}
    cols.set(c,i*3);}
  pg.setAttribute('color',new THREE.BufferAttribute(cols,3));pg.computeVertexNormals();
  const patch=new THREE.Mesh(pg,new THREE.MeshToonMaterial({vertexColors:true,gradientMap:gradTex}));groups.static.add(patch);
  const floorY=baseH(S.Pc[0],S.Pc[1])-S.D;S.floorY=floorY;
  // 3) turquoise plunge pool
  const pool=new THREE.Mesh(new THREE.CircleGeometry(S.Rb*.84,48),new THREE.MeshToonMaterial({color:'#1aa3a3',gradientMap:gradTex,transparent:true,opacity:.92}));pool.rotation.x=-Math.PI/2;pool.position.set(S.Pc[0]+S.d[0]*.03,floorY+.035,S.Pc[1]+S.d[1]*.03);groups.static.add(pool);
  const pool2=new THREE.Mesh(new THREE.CircleGeometry(S.Rb*.4,32),new THREE.MeshBasicMaterial({color:0x5fd6cf,transparent:true,opacity:.55}));pool2.rotation.x=-Math.PI/2;pool2.position.set(S.Pc[0]-S.d[0]*.1,floorY+.037,S.Pc[1]-S.d[1]*.1);groups.static.add(pool2);
  // 4) basalt columns around the amphitheater
  const ang0=Math.atan2(-S.d[1],-S.d[0]);const top=baseH(S.Lp[0],S.Lp[1]);
  for(let k=0;k<96;k++){const a=ang0+(k/95-.5)*Math.PI*1.3;const r=S.Rb-.006;const x=S.Pc[0]+Math.cos(a)*r,z=S.Pc[1]+Math.sin(a)*r;const h=baseH(x,z)-floorY-.01;if(h<.1)continue;
    const w=.022+((k*37)%5)*.003;const col=['#5d5955','#6c6863','#4d4a48','#58524e'][k%4];const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,.02),toon(col));m.position.set(x,floorY+h/2,z);m.rotation.y=-a-Math.PI/2;groups.static.add(m);
    if(k%3!==1){const rh=h*(.2+((k*13)%7)*.03);const rs=new THREE.Mesh(new THREE.BoxGeometry(w*1.02,rh,.021),toon(k%2?'#b4532a':'#c8683a'));rs.position.set(x,floorY+h*.42,z);rs.rotation.y=-a-Math.PI/2;groups.static.add(rs);}
    const lat=(x-S.Pc[0])*S.left[0]+(z-S.Pc[1])*S.left[1];if(lat>.05){const mh=h*.28;const mm=new THREE.Mesh(new THREE.BoxGeometry(w*1.04,mh,.022),toon(k%2?'#5f9b3c':'#6fae47'));mm.position.set(x,floorY+mh/2,z);mm.rotation.y=-a-Math.PI/2;groups.static.add(mm);}
    const cap=new THREE.Mesh(new THREE.BoxGeometry(w*1.2,.02,.05),toon('#a9a197'));cap.position.set(x-Math.cos(a)*.012,floorY+h+.004,z-Math.sin(a)*.012);cap.rotation.y=-a-Math.PI/2;groups.static.add(cap);}
  // 5) the waterfall ribbon + spray
  const ct=document.createElement('canvas');ct.width=64;ct.height=256;const cx=ct.getContext('2d');cx.fillStyle='rgba(235,248,255,.9)';cx.fillRect(0,0,64,256);
  for(let i=0;i<70;i++){cx.fillStyle=Math.random()<.5?'rgba(255,255,255,1)':'rgba(170,220,240,.9)';cx.fillRect(Math.random()*64,Math.random()*256,1+Math.random()*3,20+Math.random()*60);}
  saltoTex=new THREE.CanvasTexture(ct);saltoTex.wrapS=saltoTex.wrapT=THREE.RepeatWrapping;saltoTex.repeat.set(1,2);
  const fh=top+.05-(floorY+.035),fw=.2;const fall=new THREE.Mesh(new THREE.PlaneGeometry(fw,fh,1,6),new THREE.MeshBasicMaterial({map:saltoTex,transparent:true,opacity:.95,side:THREE.DoubleSide,depthWrite:false}));
  const fp=fall.geometry.attributes.position;for(let i=0;i<fp.count;i++){const yy=fp.getY(i)/fh+.5;fp.setX(i,fp.getX(i)*(1+(1-yy)*.5));fp.setZ(i,Math.pow(1-yy,2)*.03);}
  fall.position.set(S.Lp[0]+S.d[0]*.035,floorY+.035+fh/2,S.Lp[1]+S.d[1]*.035);fall.rotation.y=Math.atan2(S.d[0],S.d[1]);groups.static.add(fall);
  const lip=new THREE.Mesh(new THREE.BoxGeometry(.08,.018,.3),toon('#c9722f'));lip.position.set(S.Lp[0],top+.012,S.Lp[1]);lip.rotation.y=-Math.atan2(S.d[1],S.d[0]);groups.static.add(lip);
  const st=document.createElement('canvas');st.width=st.height=64;const sx=st.getContext('2d');const gr=sx.createRadialGradient(32,32,2,32,32,30);gr.addColorStop(0,'rgba(255,255,255,.95)');gr.addColorStop(1,'rgba(255,255,255,0)');sx.fillStyle=gr;sx.fillRect(0,0,64,64);
  const stex=new THREE.CanvasTexture(st);const bx=S.Lp[0]+S.d[0]*.07,bz=S.Lp[1]+S.d[1]*.07;
  for(let k=0;k<10;k++){const s=new THREE.Sprite(new THREE.SpriteMaterial({map:stex,transparent:true,depthWrite:false}));s.userData={x:bx,z:bz,y:floorY-.05,ph:k/10,sz:.28};groups.life.add(s);steam.push(s);}
}


// ------------------------------------------------------------------ build world
const groups={};['sites','meta','taxa','field','photos','rivers','life','landmarks','static'].forEach(k=>{groups[k]=new THREE.Group();scene.add(groups[k]);});
let terrain;
function buildSlab(){
  // side walls with strata
  const mat=new THREE.MeshToonMaterial({vertexColors:true,gradientMap:gradTex});
  const BASE=-1.6;
  const edges=[[0,0,1,0],[1,0,1,1],[1,1,0,1],[0,1,0,0]];
  const verts=[],cols=[];
  const strata=['#8c5a3c','#a86f47','#6f4a36','#c28a57','#5b3d2e'].map(hex2rgb);
  edges.forEach(([a,b,c,d])=>{
    const N=a===c?NZ:NX;
    for(let k=0;k<N;k++){
      const p=t=>{const u=lerp(a,c,t),v=lerp(b,d,t);const x=X0+u*W,z=Z0+v*D;return [x,heightAt(x,z),z];};
      const p0=p(k/N),p1=p((k+1)/N);
      const bands=5;const top0=p0[1],top1=p1[1];
      for(let s=0;s<bands;s++){
        const y0a=lerp(top0,BASE,s/bands),y1a=lerp(top0,BASE,(s+1)/bands),y0b=lerp(top1,BASE,s/bands),y1b=lerp(top1,BASE,(s+1)/bands);
        verts.push(p0[0],y0a,p0[2],p0[0],y1a,p0[2],p1[0],y0b,p1[2], p1[0],y0b,p1[2],p0[0],y1a,p0[2],p1[0],y1b,p1[2]);
        const cc=s===0?hex2rgb('#6b8f3e'):strata[s];for(let q=0;q<6;q++)cols.push(...cc);
      }
    }
  });
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));g.computeVertexNormals();
  const m=new THREE.Mesh(g,mat);m.material.side=THREE.DoubleSide;groups.static.add(m);
  const bot=new THREE.Mesh(new THREE.PlaneGeometry(W,D).rotateX(Math.PI/2).translate(X0+W/2,BASE,Z0+D/2),toon('#3d2a22'));groups.static.add(bot);
}

// water with animated shader
const waterMats=[];
function waterMaterial(col){
  const m=new THREE.ShaderMaterial({uniforms:{time:{value:0},lum:{value:1},col:{value:new THREE.Color(col)},glow:{value:0},realK:{value:0},sunW:{value:new THREE.Vector3(0,1,0)},tRefl:{value:null},reflM:{value:new THREE.Matrix4()},reflY:{value:-99},reflOn:{value:0}},
    vertexShader:`attribute float sd;uniform float time,realK;varying float vSd;varying vec3 vW;void main(){vSd=sd;vec4 w=modelMatrix*vec4(position,1.);if(realK>.5){float k=smoothstep(0.,.03,-sd+.012);w.y+=(sin(w.x*38.+time*1.7)*.5+sin(w.z*31.-time*1.3+w.x*9.)*.35+sin((w.x+w.z)*63.+time*2.6)*.15)*.0032*k;}vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader:`uniform float time,glow,realK,reflY,reflOn,lum;uniform vec3 col,sunW;uniform sampler2D tRefl;uniform mat4 reflM;varying vec3 vW;varying float vSd;
      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
      void main(){vec2 p=vW.xz*3.;float w=n(p+vec2(time*.35,time*.2))+.5*n(p*2.3-vec2(time*.5,0.));
        if(vSd>.012)discard;float d=.012-vSd;
        vec3 c=col;float s=smoothstep(1.02,1.08,w);c=mix(c,vec3(1.),s*.85);c*=.92+.08*step(.7,w);
        float rl=abs(fract(w*3.2+time*.05)-.5);c=mix(c,c*.62,(1.-smoothstep(.02,.05,rl))*smoothstep(.08,.3,d)*.55);
        float fw=.028+.012*sin(time*1.8+vW.x*23.+vW.z*17.);float foam=1.-smoothstep(fw*.55,fw,d);c=mix(c,vec3(.97,.99,1.),foam*.92);
        c+=col*glow*(.55+.45*n(p*.7+time*.3));
        vec3 V=normalize(cameraPosition-vW);float fr=pow(1.-max(V.y,0.),3.);c=mix(c,mix(vec3(.62,.8,.95),vec3(1.,.95,.85),.25),fr*.45);
        c+=vec3(smoothstep(.93,.97,n(vW.xz*70.+vec2(time*.9,-time*.6))))*.35*(1.-foam);
        if(realK>.5){vec2 q=vW.xz*9.;float e=.05;float h0=n(q+vec2(time*.5,time*.3))+.5*n(q*2.7-vec2(time*.8,0.));float hx=n(q+vec2(e,0.)+vec2(time*.5,time*.3))+.5*n((q+vec2(e,0.))*2.7-vec2(time*.8,0.));float hz=n(q+vec2(0.,e)+vec2(time*.5,time*.3))+.5*n((q+vec2(0.,e))*2.7-vec2(time*.8,0.));
          vec3 N=normalize(vec3((h0-hx)*.9-(cos(vW.x*38.+time*1.7)*38.*.5+cos((vW.x+vW.z)*63.+time*2.6)*63.*.15+cos(vW.z*31.-time*1.3+vW.x*9.)*9.*.35)*.0032,1.,(h0-hz)*.9-(cos(vW.z*31.-time*1.3+vW.x*9.)*31.*.35+cos((vW.x+vW.z)*63.+time*2.6)*63.*.15)*.0032));float F=.02+.98*pow(1.-max(dot(N,V),0.),5.);vec3 Rr=reflect(-V,N);vec3 sky=mix(vec3(.72,.84,.97),vec3(.18,.38,.78),smoothstep(0.,.6,Rr.y));
          if(reflOn>.5&&abs(vW.y-reflY)<.03){vec4 rp=reflM*vec4(vW+vec3(N.x,0.,N.z)*.06,1.);vec2 ru=rp.xy/rp.w*.5+.5;if(ru.x>0.&&ru.x<1.&&ru.y>0.&&ru.y<1.){vec4 rc=texture2D(tRefl,ru);sky=mix(sky,rc.rgb,.92);}}
          vec3 base=col*mix(.35,.6,smoothstep(.0,.012,.012-vSd));vec3 wc=mix(base,sky,clamp(F*1.35+.08,0.,1.))+vec3(1.,.95,.85)*pow(max(dot(Rr,sunW),0.),260.)*5.;c=mix(wc,vec3(.95),foam*.8)+col*glow*.6;}
        gl_FragColor=vec4(c*lum,1.);}`});
  waterMats.push(m);return m;
}
function buildLakes(){
  LAKES.forEach(l=>{
    let mnx=1e9,mxx=-1e9,mnz=1e9,mxz=-1e9;if(l.bbox){[mnx,mxx,mnz,mxz]=l.bbox;}else l.C.forEach(c=>{[c[0],c[1]].forEach(p=>{mnx=Math.min(mnx,p[0]-c[2]);mxx=Math.max(mxx,p[0]+c[2]);mnz=Math.min(mnz,p[1]-c[2]);mxz=Math.max(mxz,p[1]+c[2]);});});
    const res=.04,nx=Math.max(2,Math.ceil((mxx-mnx)/res)),nz=Math.max(2,Math.ceil((mxz-mnz)/res));
    const shape=[];const idx=[];const vid={};
    const v=[];let count=0;
    const inside=(x,z)=>lakeSdf(l,x,z)<.05;
    for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
      const x=mnx+i*res,z=mnz+j*res;
      if(inside(x+res/2,z+res/2)){
        const quad=[[x,z],[x+res,z],[x,z+res],[x+res,z+res]].map(q=>{const k=q[0].toFixed(3)+','+q[1].toFixed(3);if(vid[k]===undefined){vid[k]=count++;v.push(q[0],Y(l.level)+.004,q[1]);}return vid[k];});
        idx.push(quad[0],quad[2],quad[1],quad[1],quad[2],quad[3]);
      }
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setIndex(idx);
    {const sd=new Float32Array(v.length/3);for(let i=0;i<sd.length;i++)sd[i]=lakeSdf(l,v[i*3],v[i*3+2]);g.setAttribute('sd',new THREE.BufferAttribute(sd,1));}
    const m=new THREE.Mesh(g,waterMaterial(l.col));m.renderOrder=1;groups.static.add(m);l.mesh=m;
  });
}

// rivers ribbons coloured by pH, animated flow
const riverMats=[];
function buildRivers(){
  RIVERS.forEach(r=>{
    const pts=[];for(let i=0;i<r.P.length-1;i++){const a=r.P[i],b=r.P[i+1];const L=Math.hypot(b.x-a.x,b.z-a.z);const n=Math.max(2,Math.ceil(L/.05));
      for(let k=0;k<n;k++){const t=k/n;pts.push({x:lerp(a.x,b.x,t),z:lerp(a.z,b.z,t),ph:lerp(a.ph,b.ph,t)});}}
    const last=r.P[r.P.length-1];pts.push({x:last.x,z:last.z,ph:last.ph});
    // smooth
    for(let it=0;it<3;it++)for(let i=1;i<pts.length-1;i++){pts[i].x=(pts[i-1].x+2*pts[i].x+pts[i+1].x)/4;pts[i].z=(pts[i-1].z+2*pts[i].z+pts[i+1].z)/4;}
    const v=[],c=[],uv=[],idx=[];let acc=0;
    for(let i=0;i<pts.length;i++){
      const p=pts[i],q=pts[Math.min(i+1,pts.length-1)],o=pts[Math.max(i-1,0)];
      let tx=q.x-o.x,tz=q.z-o.z;const l=Math.hypot(tx,tz)||1;tx/=l;tz/=l;
      if(i>0)acc+=Math.hypot(p.x-pts[i-1].x,p.z-pts[i-1].z);
      const w=r.w*(.7+.6*i/pts.length);
      const nx=-tz*w,nz=tx*w;
      const inLake=LAKES.some(L=>lakeSdf(L,p.x,p.z)<0);
      const scv=saltoCarve(p.x,p.z);const y=scv>.01?heightAt(p.x,p.z)+(scv>SALTO.D*.9?.012:.05):Math.max(heightAt(p.x,p.z),Math.min(heightAt(p.x+nx,p.z+nz),heightAt(p.x-nx,p.z-nz)))+.05+(inLake?-.5:0);
      v.push(p.x+nx,y,p.z+nz,p.x-nx,y,p.z-nz);
      const col=phColor(p.ph);c.push(...col,...col);uv.push(acc,0,acc,1);
      if(i<pts.length-1){const b=i*2;idx.push(b,b+1,b+2,b+1,b+3,b+2);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);
    const m=new THREE.ShaderMaterial({uniforms:{time:{value:0},lum:{value:1},realK:{value:0},sunW:{value:new THREE.Vector3(0,1,0)}},vertexColors:true,
      vertexShader:`varying vec3 vC;varying vec2 vU;varying vec3 vW;void main(){vC=color;vU=uv;vW=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`uniform float time,realK,lum;uniform vec3 sunW;varying vec3 vC;varying vec2 vU;varying vec3 vW;
        float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
        void main(){float lane=abs(vU.y-.5)*2.;vec2 fp=vec2(vU.x*9.-time*1.1,vU.y*4.);float w=n(fp*2.)*.6+n(fp*5.+vec2(-time*.9,1.3))*.4;
        vec3 c=vC*(.82+.18*lane);c=mix(c,vC*1.18+.04,smoothstep(.58,.8,w)*.55);c=mix(c,vC*.7,smoothstep(.25,.1,w)*.3*(1.-lane));
        float s=fract(vU.x*4.-time*.9);c=mix(c,vec3(1.),smoothstep(.0,.08,s)*smoothstep(.35,.2,s)*step(lane,.56)*.18);
        float foam=smoothstep(.74,.96,lane+w*.28);c=mix(c,vec3(.96,.97,.95),foam*.75);
        c+=vec3(smoothstep(.9,.95,n(vW.xz*90.+vec2(time*1.7,-time)))*(1.-lane))*.4;
        c=mix(c,vC*.5,smoothstep(.93,1.,lane)*.6);
        if(realK>.5){vec3 V=normalize(cameraPosition-vW);vec3 N=normalize(vec3((w-.5)*.35,1.,(n(fp*5.+1.7)-.5)*.35));float F=.02+.98*pow(1.-max(dot(N,V),0.),5.);vec3 Rr=reflect(-V,N);
          vec3 sky=mix(vec3(.72,.84,.97),vec3(.2,.4,.8),smoothstep(0.,.6,Rr.y));vec3 base=vC*(.5+.18*lane);vec3 wc=mix(base,sky,clamp(F,0.,.7))+vec3(1.,.95,.85)*pow(max(dot(Rr,sunW),0.),200.)*4.;c=mix(wc,vec3(.95),foam*.7);}
        gl_FragColor=vec4(c*lum,1.);}`});
    m.side=THREE.DoubleSide;m.polygonOffset=true;m.polygonOffsetFactor=-3;m.polygonOffsetUnits=-3;riverMats.push(m);const mesh=new THREE.Mesh(g,m);mesh.renderOrder=2;groups.rivers.add(mesh);
    // mid-point label anchor
    r.mid=pts[Math.floor(pts.length*(r.n==='Río Agrio Inferior'?.3:r.approx?.35:.5))];
  });
}

// roads + cars
const roadPaths=[];
function buildRoads(){
  const mat=toon('#5a5566',{side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});const dash=new THREE.MeshBasicMaterial({color:0xffd23f,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4});
  ROADS.forEach(R=>{
    const pts=[];for(let i=0;i<R.length-1;i++){const a=R[i],b=R[i+1];const n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.05);for(let k=0;k<n;k++)pts.push([lerp(a[0],b[0],k/n),lerp(a[1],b[1],k/n)]);}
    pts.push(R[R.length-1]);
    for(let it=0;it<4;it++)for(let i=1;i<pts.length-1;i++){pts[i]=[(pts[i-1][0]+2*pts[i][0]+pts[i+1][0])/4,(pts[i-1][1]+2*pts[i][1]+pts[i+1][1])/4];}
    const v=[],idx=[],dv=[],di=[];const P3=[];let acc=0;
    for(let i=0;i<pts.length;i++){const p=pts[i],q=pts[Math.min(i+1,pts.length-1)],o=pts[Math.max(i-1,0)];let tx=q[0]-o[0],tz=q[1]-o[1];const l=Math.hypot(tx,tz)||1;tx/=l;tz/=l;
      const w=.055,nx=-tz*w,nz=tx*w;const y=Math.max(heightAt(p[0]+nx,p[1]+nz),heightAt(p[0]-nx,p[1]-nz))+.035;
      v.push(p[0]+nx,y,p[1]+nz,p[0]-nx,y,p[1]-nz);P3.push(new THREE.Vector3(p[0],y+.005,p[1]));
      if(i<pts.length-1){const b=i*2;idx.push(b,b+1,b+2,b+1,b+3,b+2);}
      if(i>0)acc+=Math.hypot(p[0]-pts[i-1][0],p[1]-pts[i-1][1]);
      if(i<pts.length-1&&Math.floor(acc/.25)%2===0){const q2=pts[i+1];const b=dv.length/3;const dw=.009;
        dv.push(p[0]-tz*dw,y+.004,p[1]+tx*dw,p[0]+tz*dw,y+.004,p[1]-tx*dw,q2[0]-tz*dw,y+.004,q2[1]+tx*dw,q2[0]+tz*dw,y+.004,q2[1]-tx*dw);di.push(b,b+1,b+2,b+1,b+3,b+2);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setIndex(idx);g.computeVertexNormals();
    groups.static.add(new THREE.Mesh(g,mat));
    const g2=new THREE.BufferGeometry();g2.setAttribute('position',new THREE.Float32BufferAttribute(dv,3));g2.setIndex(di);groups.static.add(new THREE.Mesh(g2,dash));
    const curve=new THREE.CatmullRomCurve3(P3);curve.arcLengthDivisions=800;roadPaths.push(curve);
  });
}
const cars=[];
function buildCars(){
  const colors=['#ff4f3a','#3a86ff','#ffd23f','#ffffff','#2d6a4f','#9b5de5','#f15bb5','#1d1a2b','#fb8500'];
  const tire=toon('#222'),glass=toon('#bfe9ff',{transparent:true,opacity:.55}),chrome=toon('#d9d9d9');
  for(let i=0;i<4;i++){
    const g=new THREE.Group();const c=toon(colors[i%colors.length]);const jeep=i%3===1;
    if(jeep){ // jeep 4x4: caja alta, rueda de repuesto atrás, parrilla en el techo
      const body=new THREE.Mesh(new THREE.BoxGeometry(.12,.05,.068),c);body.position.y=.047;
      const cab=new THREE.Mesh(new THREE.BoxGeometry(.075,.045,.064),c);cab.position.set(-.012,.092,0);
      const win=new THREE.Mesh(new THREE.BoxGeometry(.076,.022,.066),glass);win.position.set(-.012,.098,0);
      const rack=new THREE.Mesh(new THREE.BoxGeometry(.07,.006,.06),toon('#333'));rack.position.set(-.012,.118,0);
      const spare=new THREE.Mesh(new THREE.CylinderGeometry(.022,.022,.012,10).rotateZ(Math.PI/2),tire);spare.position.set(-.067,.06,0);
      const bump=new THREE.Mesh(new THREE.BoxGeometry(.008,.014,.07),chrome);bump.position.set(.062,.03,0);
      g.add(body,cab,win,rack,spare,bump);
    }else{ // camioneta doble cabina con pickup
      const bed=new THREE.Mesh(new THREE.BoxGeometry(.07,.03,.066),c);bed.position.set(-.04,.045,0);
      const bedIn=new THREE.Mesh(new THREE.BoxGeometry(.06,.012,.054),toon('#2b2b2b'));bedIn.position.set(-.04,.058,0);
      const front=new THREE.Mesh(new THREE.BoxGeometry(.08,.04,.066),c);front.position.set(.035,.045,0);
      const cab=new THREE.Mesh(new THREE.BoxGeometry(.055,.038,.062),c);cab.position.set(.015,.083,0);
      const win=new THREE.Mesh(new THREE.BoxGeometry(.056,.018,.064),glass);win.position.set(.015,.088,0);
      const bar=new THREE.Mesh(new THREE.BoxGeometry(.006,.02,.06),chrome);bar.position.set(-.012,.075,0);
      g.add(bed,bedIn,front,cab,win,bar);
      if(i%2===0){const load=new THREE.Mesh(new THREE.BoxGeometry(.03,.02,.03),toon('#c9a45a'));load.position.set(-.045,.07,.01);g.add(load);}
    }
    [[.045,.036],[.045,-.036],[-.045,.036],[-.045,-.036]].forEach(w=>{const wh=new THREE.Mesh(new THREE.CylinderGeometry(.022,.022,.016,10).rotateX(Math.PI/2),tire);wh.position.set(w[0],.022,w[1]);g.add(wh);});
    { // details: lights, rims, driver, mud flaps, plate
      const fx=jeep?.062:.076,hl=new THREE.MeshBasicMaterial({color:0xfff4c8}),tl=new THREE.MeshBasicMaterial({color:0xff3030});
      [-1,1].forEach(sd=>{const h=new THREE.Mesh(new THREE.BoxGeometry(.004,.01,.014),hl);h.position.set(fx+.002,.052,.024*sd);g.add(h);const t=new THREE.Mesh(new THREE.BoxGeometry(.004,.01,.01),tl);t.position.set(-fx+(jeep?-.008:.002),.05,.027*sd);g.add(t);});
      const plate=new THREE.Mesh(new THREE.BoxGeometry(.003,.008,.02),toon('#f4f0e6'));plate.position.set(-fx+(jeep?-.009:0),.034,0);g.add(plate);
      [[.045,.036],[.045,-.036],[-.045,.036],[-.045,-.036]].forEach(w=>{const r=new THREE.Mesh(new THREE.CylinderGeometry(.011,.011,.018,8).rotateX(Math.PI/2),chrome);r.position.set(w[0],.022,w[1]);g.add(r);
        const fl=new THREE.Mesh(new THREE.BoxGeometry(.002,.014,.012),toon('#1d1a2b'));fl.position.set(w[0]-.026,.02,w[1]*1.02);g.add(fl);});
      const hd=new THREE.Mesh(new THREE.SphereGeometry(.011,8,6),toon(['#c99472','#e0ae8a','#9a6a48'][i%3]));hd.position.set(jeep?-.005:.022,jeep?.094:.089,.013);g.add(hd);
      const ht=new THREE.Mesh(new THREE.CylinderGeometry(.012,.013,.006,10),toon(['#1d1a2b','#8a5a33','#ff4f3a'][i%3]));ht.position.set(hd.position.x,hd.position.y+.009,hd.position.z);g.add(ht);}
    const road=roadPaths[i%3===0?0:1];
    cars.push({g,road,t:rnd(),sp:(road===roadPaths[0]?.02:.006)*(rnd()>.5?1:-1)*(.7+rnd()*.6)});groups.life.add(g);
  }
}

// ---------- fauna: zorros culpeo, ovejas, perros, chivas de veranada
const animals=[];
// ---------- low-poly anatomical animal builder (lofted bodies instead of spheres/capsules)
// loft(stations,seg,mat): stations [x,y,ry,rz,z?] along a spine in the XY plane; rings are perpendicular to the spine.
const Q=(()=>{
  const mats={};const fm=c=>mats[c]||(mats[c]=toon(c));
  function loft(S,seg,col,smooth){seg=seg||8;const pos=[],idx=[];const n=S.length;
    for(let i=0;i<n;i++){const a=S[Math.max(0,i-1)],b=S[Math.min(n-1,i+1)];let tx=b[0]-a[0],ty=b[1]-a[1];const l=Math.hypot(tx,ty)||1;tx/=l;ty/=l;const nx=-ty,ny=tx;const s=S[i],z0=s[4]||0;
      for(let k=0;k<seg;k++){const t=k/seg*Math.PI*2,c=Math.cos(t),sn=Math.sin(t);pos.push(s[0]+nx*s[2]*c,s[1]+ny*s[2]*c,z0+s[3]*sn);}}
    for(let i=0;i<n-1;i++)for(let k=0;k<seg;k++){const a=i*seg+k,b=i*seg+(k+1)%seg,c=a+seg,d=b+seg;idx.push(a,b,c,b,d,c);}
    const c0=pos.length/3;pos.push(S[0][0],S[0][1],S[0][4]||0);const c1=c0+1;const L=S[n-1];pos.push(L[0],L[1],L[4]||0);
    for(let k=0;k<seg;k++){idx.push(c0,(k+1)%seg,k);idx.push(c1,(n-1)*seg+k,(n-1)*seg+(k+1)%seg);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);if(smooth){g.computeVertexNormals();return new THREE.Mesh(g,fm(col));}const f=g.toNonIndexed();f.computeVertexNormals();g.dispose();  // faceted normals: low-poly look
    return new THREE.Mesh(f,fm(col));}
  // leg hanging from a hip/shoulder pivot: list of [dx,dy,r] joints (dy negative, relative to pivot)
  function leg(x,y,z,J,col,hoofCol){const G=new THREE.Group();G.position.set(x,y,z);const S=J.map(j=>[j[0],j[1],j[2],j[2]*.9]);const m=loft(S,6,col);G.add(m);
    if(hoofCol){const L=J[J.length-1];const h=new THREE.Mesh(new THREE.CylinderGeometry(L[2]*1.1,L[2]*1.25,L[2]*1.2,6),fm(hoofCol));h.position.set(L[0],L[1]-L[2]*.2,0);G.add(h);}return G;}
  function cone(r,h,col,x,y,z,rx,rz){const m=new THREE.Mesh(new THREE.ConeGeometry(r,h,5),fm(col));m.position.set(x,y,z);m.rotation.set(rx||0,0,rz||0);return m;}
  function eye(x,y,z,r){const m=new THREE.Mesh(new THREE.SphereGeometry(r,6,4),fm('#111111'));m.position.set(x,y,z);return m;}
  function ringlet(len,rc,turns,r,mat,seed){const pts=[];const N=Math.max(12,Math.round(turns*8));const ph=(seed||0)*6.283;
    for(let i=0;i<=N;i++){const t=i/N,a=ph+t*turns*Math.PI*2,rr=rc*(1-t*.25);pts.push(new THREE.Vector3(Math.cos(a)*rr,-t*len,Math.sin(a)*rr));}
    const g=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),N*2,r,5,false);return new THREE.Mesh(g,mat);}
  function strand(P,r,mat){const g=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(P.map(p=>new THREE.Vector3(p[0],p[1],p[2]))),Math.max(8,P.length*5),r,5,false);return new THREE.Mesh(g,mat);}
  // merge a figure's non-animated meshes into one mesh per material (people: ~50 draw calls -> ~6)
  let VCM=null;const vcm=()=>VCM||(VCM=toon('#ffffff',{vertexColors:true}));
  function mergeStatic(g,keep,vc){if(vc===undefined)vc=true;const K=new Set();keep.forEach(k=>k&&k.traverse(o=>K.add(o)));g.updateMatrixWorld(true);const inv=new THREE.Matrix4().copy(g.matrixWorld).invert();
    const byMat=new Map(),dead=[];g.traverse(o=>{if(!o.isMesh||K.has(o)||o===g)return;const m=o.material;if(!m||Array.isArray(m)||m.transparent||o.userData.keep)return;let p=o.parent,bad=false;while(p&&p!==g){if(K.has(p)||p.userData.keep){bad=true;break;}p=p.parent;}if(bad)return;
      let geo=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv,o.matrixWorld));if(!geo.attributes.normal)geo.computeVertexNormals();
      const useVC=vc&&m.isMeshToonMaterial&&!m.map&&!m.vertexColors;if(useVC){const n=geo.attributes.position.count,C=new Float32Array(n*3);for(let i=0;i<n;i++){C[i*3]=m.color.r;C[i*3+1]=m.color.g;C[i*3+2]=m.color.b;}geo.setAttribute('color',new THREE.BufferAttribute(C,3));}
      const key=useVC?vcm():m;let a=byMat.get(key);if(!a)byMat.set(key,a=[]);a.push(geo);dead.push(o);});
    dead.forEach(o=>o.parent.remove(o));
    byMat.forEach((geos,m)=>{let n=0;geos.forEach(q=>n+=q.attributes.position.count);const P=new Float32Array(n*3),N=new Float32Array(n*3),Cc=m.vertexColors?new Float32Array(n*3):null;let off=0;geos.forEach(q=>{P.set(q.attributes.position.array,off*3);N.set(q.attributes.normal.array,off*3);if(Cc)Cc.set(q.attributes.color.array,off*3);off+=q.attributes.position.count;q.dispose();});
      const G=new THREE.BufferGeometry();G.setAttribute('position',new THREE.BufferAttribute(P,3));G.setAttribute('normal',new THREE.BufferAttribute(N,3));if(Cc)G.setAttribute('color',new THREE.BufferAttribute(Cc,3));G.computeBoundingSphere();const mesh=new THREE.Mesh(G,m);mesh.userData.merged=1;g.add(mesh);});
    [...g.children].forEach(c=>{if(c.isGroup&&!K.has(c)&&c.children.length===0)g.remove(c);});return g;}
  return {loft,leg,cone,eye,fm,ringlet,strand,mergeStatic};})();

// all models built in metres inside an inner group (M1 = world units per metre at the game's 1.5 outer scale)
const M1=.117;
function inner(g,k){const I=new THREE.Group();I.scale.setScalar(k||M1);g.add(I);return I;}
function makeFox(){const g=new THREE.Group(),I=inner(g);const back='#8a7a6c',fur='#c8642c',w='#efe4d4',dk='#2b1d16';  // zorro culpeo
  I.add(Q.loft([[-.36,.36,.05,.05],[-.3,.38,.1,.09],[-.1,.39,.12,.1],[.1,.38,.12,.1],[.25,.38,.1,.09],[.33,.4,.07,.07]],8,back));
  I.add(Q.loft([[-.25,.31,.05,.07],[0,.3,.07,.08],[.22,.31,.06,.07]],7,w));
  I.add(Q.loft([[.3,.4,.07,.065],[.38,.48,.06,.055],[.42,.52,.055,.05]],7,fur));
  I.add(Q.loft([[.38,.53,.06,.06],[.46,.54,.065,.06],[.54,.5,.04,.035],[.61,.47,.02,.018]],7,fur));
  I.add(Q.loft([[.52,.46,.03,.03],[.58,.45,.02,.02]],6,w));I.add(Q.eye(.62,.47,0,.012));
  [-1,1].forEach(s=>{I.add(Q.cone(.035,.11,fur,.44,.62,.035*s,.25*s));I.add(Q.eye(.53,.54,.04*s,.01));});
  I.add(Q.loft([[-.34,.37,.05,.05],[-.45,.3,.075,.075],[-.58,.22,.08,.08],[-.7,.16,.06,.06],[-.76,.14,.02,.02]],8,back));
  I.add(Q.loft([[-.7,.16,.06,.06],[-.76,.14,.035,.035],[-.79,.13,.005,.005]],6,dk));
  const legs=[];[[.2,.07,1],[.2,-.07,1],[-.25,.07,0],[-.25,-.07,0]].forEach(([x,z,f])=>{const L=Q.leg(x,.33,z,f?[[0,0,.04],[0,-.15,.028],[.01,-.3,.018],[.02,-.33,.016]]:[[0,0,.055],[-.03,-.12,.035],[.02,-.2,.02],[.02,-.33,.016]],fur,dk);I.add(L);legs.push(L);});
  Q.mergeStatic(g,legs);g.userData.legs=legs;return g;}
function makeSheep(col){const g=new THREE.Group(),I=inner(g);const dk='#2b2622',face=col==='#6b4a33'?'#3a2a20':'#3a3430';
  const wool=toon(col);const fleece=Q.loft([[-.55,.56,.1,.1],[-.46,.6,.27,.26],[-.2,.63,.33,.31],[.1,.63,.34,.31],[.36,.61,.29,.27],[.5,.61,.16,.16]],14,col,true);fleece.material=wool;I.add(fleece);
  for(let k=0;k<9;k++){const a=k/9*Math.PI;const m=new THREE.Mesh(new THREE.SphereGeometry(.12,10,8),wool);m.position.set(-.38+k*.1,.72+Math.sin(a)*.08,(k%2?.1:-.1));m.scale.set(1,.7,1);I.add(m);}
  I.add(Q.loft([[.45,.66,.1,.09],[.55,.72,.1,.085],[.66,.66,.075,.065],[.72,.6,.045,.045]],7,face));
  const top=new THREE.Mesh(new THREE.SphereGeometry(.1,10,8),wool);top.position.set(.5,.78,0);top.scale.set(1,.7,1);I.add(top);
  [-1,1].forEach(s=>{const e=Q.loft([[.52,.72,.03,.012,.06*s],[.52,.72,.03,.012,.14*s]],5,face);I.add(e);I.add(Q.eye(.64,.7,.05*s,.014));});
  I.add(Q.loft([[-.53,.6,.06,.06],[-.6,.5,.05,.05],[-.6,.42,.02,.02]],6,col));
  const legs=[];[[.3,.12],[.3,-.12],[-.35,.12],[-.35,-.12]].forEach(([x,z])=>{const L=Q.leg(x,.36,z,[[0,0,.05],[0,-.18,.035],[0,-.34,.028]],dk,'#1d1a2b');I.add(L);legs.push(L);});
  Q.mergeStatic(g,legs);g.userData.legs=legs;return g;}
function makeGoat(col){const g=new THREE.Group(),I=inner(g);const dk='#2b2622',horn='#8a7a66';  // chiva de veranada
  I.add(Q.loft([[-.45,.55,.08,.08],[-.38,.58,.16,.14],[-.1,.58,.19,.16],[.15,.58,.2,.16],[.33,.6,.15,.13]],8,col));
  I.add(Q.loft([[.3,.62,.08,.07],[.4,.76,.07,.06],[.46,.84,.065,.055]],7,col));
  I.add(Q.loft([[.44,.86,.07,.06],[.54,.84,.06,.05],[.62,.78,.035,.035]],7,col));I.add(Q.eye(.53,.86,.045,.012));I.add(Q.eye(.53,.86,-.045,.012));
  I.add(Q.loft([[.56,.76,.02,.015],[.55,.66,.025,.02],[.54,.62,.005,.005]],5,dk));
  [-1,1].forEach(s2=>{I.add(Q.loft([[.44,.9,.02,.02,.03*s2],[.4,1,.017,.017,.04*s2],[.33,1.05,.012,.012,.05*s2],[.28,1.03,.004,.004,.055*s2]],5,horn));I.add(Q.cone(.02,.07,col,.45,.88,.07*s2,1.3*s2,0));});
  I.add(Q.loft([[-.44,.6,.03,.03],[-.48,.68,.025,.025],[-.47,.72,.005,.005]],5,col));
  const legs=[];[[.25,.08],[.25,-.08],[-.33,.08],[-.33,-.08]].forEach(([x,z])=>{const L=Q.leg(x,.5,z,[[0,0,.045],[0,-.25,.028],[0,-.48,.022]],col,dk);I.add(L);legs.push(L);});
  Q.mergeStatic(g,legs);g.userData.legs=legs;return g;}
function makeDog(col){const g=new THREE.Group(),I=inner(g);const w='#ffffff';  // ovejero / border collie
  I.add(Q.loft([[-.35,.45,.08,.07],[-.25,.47,.13,.11],[0,.47,.14,.12],[.2,.48,.15,.12],[.32,.5,.1,.09]],8,col));
  I.add(Q.loft([[.18,.4,.08,.09],[.3,.45,.09,.08],[.36,.55,.07,.07]],7,w));
  I.add(Q.loft([[.3,.56,.09,.085],[.4,.62,.09,.08],[.5,.58,.05,.045],[.56,.55,.025,.025]],7,col));I.add(Q.loft([[.46,.56,.04,.04],[.56,.54,.02,.02]],6,w));I.add(Q.eye(.57,.55,0,.013));
  [-1,1].forEach(s=>{I.add(Q.cone(.035,.08,col,.38,.72,.045*s,.35*s,.2));I.add(Q.eye(.48,.63,.045*s,.011));});
  const tl=new THREE.Group();tl.position.set(-.34,.47,0);tl.add(Q.loft([[0,0,.035,.035],[-.1,-.05,.035,.035],[-.2,-.14,.025,.025],[-.24,-.2,.012,.012]],6,col));I.add(tl);
  const legs=[];[[.2,.07],[.2,-.07],[-.25,.07],[-.25,-.07]].forEach(([x,z])=>{const L=Q.leg(x,.42,z,[[0,0,.045],[0,-.2,.03],[.01,-.4,.025]],col,'#ffffff');I.add(L);legs.push(L);});
  Q.mergeStatic(g,legs.concat([tl]));g.userData.tail=tl;g.userData.legs=legs;return g;}
function okGround(x,z){const E=infoAt(x,z);return E&&E.dl>.05&&E.rv.d>.08;}
function buildFauna(){
  // zorros culpeo que merodean por la precordillera
  for(let i=0;i<3;i++){let x,z,t=0;do{x=lerp(P(0,-71.2)[0],P(0,-70.85)[0],rnd());z=lerp(P(-37.78,0)[1],P(-37.95,0)[1],rnd());t++;}while(!okGround(x,z)&&t<50);
    const g=makeFox();groups.life.add(g);animals.push({g,kind:'fox',x,z,hx:x,hz:z,a:rnd()*6.28,sp:.05+rnd()*.05,R:1.2,ph:rnd()*6});}
  // rebaño de ovejas con perros cerca de Caviahue
  const flocks=[{c:P(-37.8638,-71.0745),n:26,col:['#fbf7ee','#f1e9da','#e3d6c0'],dogs:['#3b2a20','#d8d3c9']},
                {c:P(-37.8795,-71.1215),n:14,col:['#fbf7ee','#6b4a33','#ffffff'],dogs:['#6b4a33'],goats:true}];
  flocks.forEach(F=>{
    for(let i=0;i<F.n;i++){const a=rnd()*6.28,r=Math.sqrt(rnd())*.28;const x=F.c[0]+Math.cos(a)*r,z=F.c[1]+Math.sin(a)*r;
      const g=F.goats?makeGoat(F.col[i%F.col.length]):makeSheep(F.col[i%F.col.length]);groups.life.add(g);animals.push({g,kind:'sheep',goat:!!F.goats,x,z,hx:F.c[0],hz:F.c[1],a:rnd()*6.28,sp:.012,R:.33,ph:rnd()*6});}
    F.dogs.forEach((dc,j)=>{const g=makeDog(dc);groups.life.add(g);animals.push({g,kind:'dog',x:F.c[0],z:F.c[1],hx:F.c[0],hz:F.c[1],a:j*3,sp:.45,R:.42,ph:j*3});});
  });
}
function updateFauna(t,dt){
  animals.forEach(A=>{
    if(A.kind==='dog'){A.a+=dt*A.sp/A.R;const x=A.hx+Math.cos(A.a)*A.R,z=A.hz+Math.sin(A.a)*A.R*.8;const hd=Math.atan2(z-A.z,x-A.x);A.x=x;A.z=z;A.g.rotation.y=-hd;A.g.userData.tail.rotation.x=Math.sin(t*20)*.5;}
    else{A.a+=(Math.sin(t*.7+A.ph)*.9)*dt*(A.kind==='fox'?1.6:.6);let x=A.x+Math.cos(A.a)*A.sp*dt,z=A.z+Math.sin(A.a)*A.sp*dt;
      if(Math.hypot(x-A.hx,z-A.hz)>A.R||!okGround(x,z)){A.a+=Math.PI*.7;x=A.x;z=A.z;}A.x=x;A.z=z;A.g.rotation.y=-A.a;}
    if(A.g.userData.legs){A.wk=(A.wk||0)+dt*(A.kind==='dog'?14:A.kind==='fox'?9:5);const sw=A.kind==='sheep'?.25:.45;A.g.userData.legs.forEach((L,k)=>L.rotation.z=Math.sin(A.wk+((k===0||k===3)?0:Math.PI))*sw);}
    const s=(window.GAME&&GAME.active)?1.5:clamp(SF*.9,.7,2.4);A.g.scale.setScalar(s);A.g.position.set(A.x,heightAt(A.x,A.z)+(A.kind==='sheep'?0:Math.abs(Math.sin(t*9+A.ph))*.004*s),A.z);
  });
}

// ---------- Caniche, guía del volcán (moreno, delgado, ropa outdoor, pelo largo y crespo)
let caniche=null;
function buildCaniche(){
  const g=new THREE.Group();const skin=toon('#8a5a3c'),hair=toon('#241c18'),hair2=toon('#3a2a22'),grey=toon('#7d766e'),jacket=toon('#3a3f46'),pants=toon('#2a2c30'),pack=toon('#6b705c'),red=toon('#ff3b30'),boot=toon('#4a3322');
  const LF=(S,seg,m)=>{const o=Q.loft(S,seg||10,'#ffffff',true);o.material=m;return o;};
  const legS=[[0,.004,.0085,.0085],[.001,-.03,.0065,.0068],[.0015,-.036,.0068,.007],[0,-.06,.005,.0053],[0,-.064,.0048,.005]];
  const shoe=()=>LF([[-.007,-.0655,.0058,.007],[.004,-.0665,.0064,.0076],[.013,-.0675,.0044,.0064],[.016,-.068,.002,.004]],8,boot);
  const legL=LF(legS,8,pants);legL.position.set(0,.075,.012);legL.add(shoe());const legR=LF(legS,8,pants);legR.position.set(0,.075,-.012);legR.add(shoe());
  const torso=LF([[0,.074,.012,.0165],[0,.086,.015,.0195],[0,.104,.0132,.0165],[.001,.124,.0155,.0195],[0,.142,.014,.022],[0,.149,.01,.016],[0,.152,.007,.008]],12,jacket);
  const zip=new THREE.Mesh(new THREE.BoxGeometry(.002,.06,.004),toon('#ff9f1c'));zip.position.set(.016,.112,0);
  const bp=new THREE.Mesh(new THREE.BoxGeometry(.022,.06,.034),pack);bp.position.set(-.026,.118,0);
  const arm=()=>{const a=LF([[0,.004,.0062,.0062],[0,-.028,.0053,.0055],[.0008,-.033,.0051,.0052],[0,-.058,.0043,.0044],[0,-.061,.004,.0041]],8,jacket);const h=new THREE.Mesh(new THREE.SphereGeometry(.0055,8,6),skin);h.scale.set(1,1.25,.7);h.position.y=-.066;a.add(h);return a;};
  const armL=arm();armL.position.set(0,.145,.025);const armR=arm();armR.position.set(0,.145,-.025);
  const neck=new THREE.Mesh(new THREE.CylinderGeometry(.0068,.0078,.012,8),skin);neck.position.y=.153;
  const head=new THREE.Mesh(new THREE.SphereGeometry(.018,14,12),skin);head.position.y=.172;head.scale.set(.93,1.12,.88);
  const cap=new THREE.Mesh(new THREE.SphereGeometry(.0205,14,8,0,Math.PI*2,0,Math.PI*.42),toon('#161616'));cap.position.set(-.001,.18,0);
  const visor=new THREE.Mesh(new THREE.BoxGeometry(.018,.003,.03),toon('#161616'));visor.position.set(.021,.186,0);visor.rotation.z=-.12;
  const gl1=new THREE.Mesh(new THREE.BoxGeometry(.004,.008,.011),red);gl1.position.set(.0172,.1745,.007);const gl2=gl1.clone();gl2.position.z=-.007;
  const bridge=new THREE.Mesh(new THREE.BoxGeometry(.003,.0022,.026),toon('#1d1a2b'));bridge.position.set(.0175,.177,0);
  const nose=new THREE.Mesh(new THREE.ConeGeometry(.0028,.007,5),skin);nose.rotation.z=-Math.PI/2;nose.position.set(.0185,.169,0);
  const mo=new THREE.Mesh(new THREE.BoxGeometry(.0015,.0014,.007),toon('#5a2a22'));mo.position.set(.017,.162,0);
  g.add(legL,legR,torso,zip,bp,armL,armR,neck,head,cap,visor,gl1,gl2,bridge,nose,mo);
  // long, curly hair: a soft volume under the cap + helical ringlets falling over the shoulders and down the back
  const vol=new THREE.Mesh(new THREE.SphereGeometry(.0215,14,12),hair);vol.position.set(-.006,.172,0);vol.scale.set(.85,1.08,1.05);g.add(vol);
  const HR=[];const nR=38;
  for(let i=0;i<nR;i++){const a=Math.PI*.42+ (i/nR)*Math.PI*1.16+(rnd()-.5)*.12;   // from one temple, round the back, to the other
    const side=Math.cos(a);const R=.0205+rnd()*.002;const x=Math.cos(a)*R*.9-.006,z=Math.sin(a)*R;const y=.184-rnd()*.012-(side>-.2?.008:0);
    const len=.045+rnd()*.035+(side<-.3?.02:0);const mat=rnd()<.14?grey:(rnd()<.35?hair2:hair);
    const G=new THREE.Group();G.position.set(x,y,z);const rg=Q.ringlet(len,.0032+rnd()*.0012,4.5+rnd()*2.5,.00225+rnd()*.0006,mat,rnd());G.add(rg);
    G.rotation.set(Math.sin(a)*.25,0,(-.18-side*.25));g.add(G);HR.push({G,ph:rnd()*6,a0x:G.rotation.x,a0z:G.rotation.z});}
  for(let i=0;i<16;i++){const a=Math.PI*.35+rnd()*Math.PI*1.3;const t=new THREE.Mesh(new THREE.TorusGeometry(.0034,.0017,5,9),rnd()<.2?grey:hair);   // loose curls peeking under the cap
    t.position.set(Math.cos(a)*.021-.004,.183+rnd()*.004,Math.sin(a)*.021);t.rotation.set(rnd()*3,rnd()*3,rnd()*3);g.add(t);}
  {const CL=[0,1,2,3].map(k=>{const G=new THREE.Group();G.position.set(-.006,.184,0);g.add(G);return {G,ph:k*1.7,a0x:0,a0z:0,k};});
    HR.forEach(h=>{const k=Math.min(3,Math.floor(((Math.atan2(h.G.position.z,h.G.position.x)+Math.PI*2)%(Math.PI*2))/(Math.PI*2)*4));const c=CL[k];h.G.position.x+=.006;h.G.position.y-=.184;g.remove(h.G);c.G.add(h.G);});
    CL.forEach(c=>{Q.mergeStatic(c.G,[]);c.G.userData.keep=1;});HR.length=0;CL.forEach(c=>HR.push(c));}
  Q.mergeStatic(g,[legL,legR,armL,armR]);
  g.userData={legL,legR,armL,armR,a:0,hair:HR};
  groups.life.add(g);caniche=g;
  const lbl=addLabel('CANICHE<small>volcano guide</small>','site-lbl guide',()=>new THREE.Vector3(g.position.x,g.position.y+.32*g.scale.y,g.position.z),'life',{onclick:()=>openInfo(POI_CANICHE)});
  lbl.el.style.background='#ffd23f';
}
function updateCaniche(t){
  if(!caniche)return;const u=caniche.userData;const a=Math.PI*.95+Math.sin(t*.05)*.9;const r=.62;
  const x=CRATER[0]+Math.cos(a)*r,z=CRATER[1]+Math.sin(a)*r;const x2=CRATER[0]+Math.cos(a+.01)*r,z2=CRATER[1]+Math.sin(a+.01)*r;
  const s=(window.GAME&&GAME.active)?1.7:clamp(SF*1.1,.8,3);caniche.scale.setScalar(s);caniche.position.set(x,heightAt(x,z),z);
  const dir=Math.cos(t*.05)>0?1:-1;caniche.rotation.y=-Math.atan2(z2-z,x2-x)+(dir>0?0:Math.PI);
  const w=Math.sin(t*6)*.5;u.legL.rotation.z=w;u.legR.rotation.z=-w;u.armL.rotation.z=-w*.8;u.armR.rotation.z=w*.8;
  if(u.hair)u.hair.forEach(h=>{h.G.rotation.z=h.a0z+Math.sin(t*6+h.ph)*.06+Math.sin(t*1.3+h.ph)*.05;h.G.rotation.x=h.a0x+Math.sin(t*2.1+h.ph)*.06;});  // curls bounce as he walks
}

// trees & houses (instanced)
function buildTrees(){
  // aguas arriba del lago: solo araucarias. Aguas abajo: mezcla con árboles de copa redonda (ñire/lenga)
  const N=2000;const G=new THREE.Vector3(0,1,0);const XL=P(-37.868,-70.985)[0];
  const trunk=new THREE.InstancedMesh(new THREE.CylinderGeometry(.006,.012,.30,6).translate(0,.15,0),toon('#a79d8e'),N);
  const crownA=new THREE.InstancedMesh(new THREE.SphereGeometry(.085,10,6).scale(1,.34,1).translate(0,.30,0),toon('#2e5e34'),N);
  const crownB=new THREE.InstancedMesh(new THREE.CylinderGeometry(.09,.05,.022,10).translate(0,.277,0),toon('#244b2b'),N);
  const crownC=new THREE.InstancedMesh(new THREE.SphereGeometry(.045,8,5).scale(1,.55,1).translate(0,.325,0),toon('#3d7a44'),N);
  const tier=new THREE.InstancedMesh(new THREE.CylinderGeometry(.055,.03,.014,8).translate(0,.22,0),toon('#2a5530'),N);
  const young1=new THREE.InstancedMesh(new THREE.ConeGeometry(.055,.11,8).translate(0,.1,0),toon('#35683b'),N);
  const young2=new THREE.InstancedMesh(new THREE.ConeGeometry(.04,.09,8).translate(0,.17,0),toon('#43804a'),N);
  const rtrunk=new THREE.InstancedMesh(new THREE.CylinderGeometry(.008,.012,.09,5).translate(0,.045,0),toon('#6b4226'),N);
  const round1=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.07,1).translate(0,.13,0),toon('#6f9a3e'),N);
  const round2=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.048,1).translate(.035,.17,.01),toon('#86ad4c'),N);
  const all=[trunk,crownA,crownB,crownC,tier,young1,young2,rtrunk,round1,round2];
  const lows=[new THREE.CylinderGeometry(.006,.012,.30,3,1,true).translate(0,.15,0),new THREE.SphereGeometry(.085,6,4).scale(1,.34,1).translate(0,.30,0),
    new THREE.CylinderGeometry(.09,.05,.022,6).translate(0,.277,0),new THREE.SphereGeometry(.045,5,3).scale(1,.55,1).translate(0,.325,0),
    new THREE.CylinderGeometry(.055,.03,.014,5).translate(0,.22,0),new THREE.ConeGeometry(.055,.11,5).translate(0,.1,0),new THREE.ConeGeometry(.04,.09,5).translate(0,.17,0),
    new THREE.CylinderGeometry(.008,.012,.09,3,1,true).translate(0,.045,0),new THREE.IcosahedronGeometry(.07,0).translate(0,.13,0),new THREE.IcosahedronGeometry(.048,0).translate(.035,.17,.01)];
  const Z=new THREE.Matrix4().makeScale(0,0,0);
  const m=new THREE.Matrix4(),q=new THREE.Quaternion(),s=new THREE.Vector3(),p=new THREE.Vector3();let k=0,tries=0;
  const put=(list)=>all.forEach(t=>t.setMatrixAt(k,list.includes(t)?m:Z));window.TREELIST=[];
  while(k<N&&tries<90000){tries++;
    const x=lerp(X0+1,X1-1,rnd()),z=lerp(Z0+1,Z1-1,rnd());
    const up=x<XL;if(!up&&x>P(-37.8,-70.74)[0])continue;
    const E=infoAt(x,z);
    if(E.dl<.06||E.rv.d<.12||E.dv<3.0)continue;
    if(up){if(E.h<1540||E.h>2150)continue;}else{if(E.h<1200||E.h>1900)continue;}
    if(fbm(x*.16+11,z*.16+3)<(up?.46:.52))continue;
    const kind=up?(rnd()<.26?'young':'arau'):(rnd()<.4?(rnd()<.3?'young':'arau'):'round');
    const sc=kind==='young'?.6+rnd()*.5:kind==='round'?.7+rnd()*.8:.75+rnd()*.7;
    p.set(x,heightAt(x,z)-.01,z);s.set(sc,sc*(.9+rnd()*.35),sc);q.setFromAxisAngle(G,rnd()*6.28);m.compose(p,q,s);
    if(kind==='young'){const m2=m.clone().multiply(new THREE.Matrix4().makeScale(1,.4,1));all.forEach(t=>t.setMatrixAt(k,Z));trunk.setMatrixAt(k,m2);young1.setMatrixAt(k,m);young2.setMatrixAt(k,m);}
    else if(kind==='arau'){put([trunk,crownA,crownB,crownC].concat(rnd()<.45?[tier]:[]));}
    else put([rtrunk,round1,round2]);
    window.TREELIST.push({kind,m:m.clone(),x,z});
    k++;}
  mergeTreeKinds(all,k,groups.static,lows);
  // steppe shrubs east
  const N2=900;const sh=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.035,0).translate(0,.02,0),toon('#9aa35a'),N2);let k2=0;tries=0;
  while(k2<N2&&tries<20000){tries++;const x=lerp(-2,X1-1,rnd()),z=lerp(Z0+1,Z1-1,rnd());const E=infoAt(x,z);if(E.dl<.05||E.rv.d<.1)continue;
    const sc=.6+rnd()*1.2;p.set(x,heightAt(x,z),z);s.set(sc,sc*.7,sc);q.identity();m.compose(p,q,s);sh.setMatrixAt(k2++,m);}
  sh.count=k2;addSway(sh.material,6);chunkInstanced(sh,groups.static,1,20);
}
function buildTown(center,n,radius){
  const c=P(center[0],center[1]);
  const walls=new THREE.InstancedMesh(new THREE.BoxGeometry(.06,.05,.06).translate(0,.025,0),toon('#fff3dc'),n);
  const roofs=new THREE.InstancedMesh(new THREE.ConeGeometry(.056,.05,4).rotateY(Math.PI/4).translate(0,.075,0),toon('#ffffff'),n);
  const RC=['#ff4f3a','#3a86ff','#2ec4b6','#ffb703','#9b5de5','#1d1a2b'].map(h=>new THREE.Color(h));
  const m=new THREE.Matrix4(),q=new THREE.Quaternion(),s=new THREE.Vector3(),p=new THREE.Vector3();let k=0,tries=0;
  while(k<n&&tries<3000){tries++;const a=rnd()*6.28,r=Math.sqrt(rnd())*radius;const x=c[0]+Math.cos(a)*r,z=c[1]+Math.sin(a)*r;
    if(LAKES.some(L=>lakeSdf(L,x,z)<.05))continue;if(nearestRiver(x,z).d<.06)continue;
    const sc=.8+rnd()*.7;p.set(x,heightAt(x,z)-.005,z);s.set(sc,sc*(1+rnd()*.6),sc);q.setFromAxisAngle(new THREE.Vector3(0,1,0),rnd()*1.5);
    m.compose(p,q,s);(window.OCCL=window.OCCL||[]).push([x,z,.04*sc,p.y+.1*sc*(1+.3)]);walls.setMatrixAt(k,m);roofs.setMatrixAt(k,m);roofs.setColorAt(k,RC[k%RC.length]);k++;}
  walls.count=roofs.count=k;roofs.instanceColor.needsUpdate=true;groups.static.add(walls,roofs);addWindows(walls);
}

// comunidad mapuche-pehuenche (ilustrativa) near Chancho-Có
function buildRuka(lat,lon,n=7){
  const c=P(lat,lon);const g=new THREE.Group();
  const wall=toon('#b98b5e'),roof=toon('#d9b45a'),dark=toon('#5b3b24'),wood=toon('#8a5a33');
  for(let i=0;i<n;i++){const a=i/n*6.28+rnd()*.4,r=.18+rnd()*.22;const x=c[0]+Math.cos(a)*r,z=c[1]+Math.sin(a)*r;const y=heightAt(x,z);
    const sc=.8+rnd()*.5;const h=new THREE.Group();
    const base=new THREE.Mesh(new THREE.CylinderGeometry(.05,.055,.035,12).translate(0,.017,0),wall);
    const top=new THREE.Mesh(new THREE.ConeGeometry(.068,.075,12).translate(0,.07,0),roof);
    const door=new THREE.Mesh(new THREE.BoxGeometry(.016,.024,.004),dark);door.position.set(0,.013,.052);
    h.add(base,top,door);h.position.set(x,y-.004,z);h.rotation.y=Math.atan2(c[0]-x,c[1]-z)+Math.PI;h.scale.setScalar(sc);g.add(h);}
  // rewe (altar ceremonial) y corral de chivas
  const y0=heightAt(c[0],c[1]);
  const rewe=new THREE.Mesh(new THREE.CylinderGeometry(.008,.01,.16,6).translate(0,.08,0),wood);rewe.position.set(c[0],y0,c[1]);g.add(rewe);
  for(let k=0;k<4;k++){const st=new THREE.Mesh(new THREE.BoxGeometry(.02,.004,.006),wood);st.position.set(c[0],y0+.04+k*.03,c[1]+.009);g.add(st);}
  const cc=[c[0]+.32,c[1]+.12];const cy=heightAt(cc[0],cc[1]);
  for(let k=0;k<12;k++){const a=k/12*6.28;const post=new THREE.Mesh(new THREE.CylinderGeometry(.004,.004,.035,4).translate(0,.017,0),wood);post.position.set(cc[0]+Math.cos(a)*.1,heightAt(cc[0]+Math.cos(a)*.1,cc[1]+Math.sin(a)*.1),cc[1]+Math.sin(a)*.1);g.add(post);}
  for(let k=0;k<5;k++){const a=rnd()*6.28,r=rnd()*.07;const goat=new THREE.Mesh(new THREE.BoxGeometry(.022,.012,.01),toon(k%2?'#ffffff':'#6b4a33'));goat.position.set(cc[0]+Math.cos(a)*r,cy+.012,cc[1]+Math.sin(a)*r);goat.rotation.y=rnd()*6;g.add(goat);}
  // fogón con humo
  groups.static.add(g);
  RUKA=c;
}

let RUKA=null;
// Aeródromo, centro de esquí y lugares de Caviahue (de camino.png)
function buildCaviahueExtras(){
  const a=P(-37.85624,-71.01875),b=P(-37.84582,-70.99915);const L=Math.hypot(b[0]-a[0],b[1]-a[1]);const ang=Math.atan2(b[1]-a[1],b[0]-a[0]);
  const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];const y=Math.max(heightAt(a[0],a[1]),heightAt(b[0],b[1]),heightAt(mid[0],mid[1]))+.01;
  const rw=new THREE.Mesh(new THREE.BoxGeometry(L,.012,.07),toon('#6a6573'));rw.position.set(mid[0],y,mid[1]);rw.rotation.y=-ang;groups.static.add(rw);
  for(let k=0;k<9;k++){const st=new THREE.Mesh(new THREE.BoxGeometry(L/22,.004,.008),new THREE.MeshBasicMaterial({color:0xffffff}));const t=(k+.5)/9-.5;st.position.set(mid[0]+Math.cos(ang)*L*t,y+.008,mid[1]+Math.sin(ang)*L*t);st.rotation.y=-ang;groups.static.add(st);}
  const sock=new THREE.Mesh(new THREE.ConeGeometry(.012,.04,6).rotateZ(Math.PI/2),toon('#ff9f1c'));sock.position.set(mid[0]+.06,y+.08,mid[1]+.06);groups.static.add(sock);
  // centro de esquí Cerro Caviahue: andarivel
  const s0=P(-37.8650,-71.0660),s1=P(-37.86105,-71.07586);const y0=heightAt(s0[0],s0[1]),y1=heightAt(s1[0],s1[1]);
  const pts=[];for(let k=0;k<=5;k++){const t=k/5;const x=lerp(s0[0],s1[0],t),z=lerp(s0[1],s1[1],t),yy=heightAt(x,z);const pole=new THREE.Mesh(new THREE.CylinderGeometry(.005,.005,.12,5).translate(0,.06,0),toon('#5b5b66'));pole.position.set(x,yy,z);groups.static.add(pole);pts.push(new THREE.Vector3(x,yy+.12,z));}
  const cable=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),30,.0025,4),toon('#1d1a2b'));groups.static.add(cable);
  const hut=new THREE.Mesh(new THREE.BoxGeometry(.07,.05,.05).translate(0,.025,0),toon('#ff4f3a'));hut.position.set(s1[0],y1,s1[1]);groups.static.add(hut);
}

// Termas de Copahue: complejo termal y centro médico de balneoterapia
// Chancho-Có solfatara field: grey boiling-mud pools and yellow/white sulfur crusts draped on the ground
function buildSolfataras(){const C=P(-37.8165,-71.166);
  const mud=new THREE.ShaderMaterial({uniforms:{time:{value:0},lum:{value:1}},polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
    vertexShader:'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'uniform float time,lum;varying vec2 vU;float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}void main(){vec2 p=vU-.5;float r=length(p)*2.;if(r>1.)discard;vec3 c=mix(vec3(.46,.45,.43),vec3(.33,.32,.31),smoothstep(.2,.95,r));'+
      'vec2 g=floor(vU*7.);float cell=h(g);vec2 f=fract(vU*7.)-.5;float ph=fract(time*.35+cell*9.);float bub=smoothstep(.34*ph,.3*ph,length(f))*step(.55,cell)*(1.-ph);c=mix(c,vec3(.62,.61,.58),bub);'+
      'float ring=abs(fract(r*3.-time*.5)-.5);c=mix(c,c*.8,smoothstep(.06,.0,ring)*.5*(1.-r));c=mix(c,vec3(.8,.72,.35),smoothstep(.88,1.,r)*.7);gl_FragColor=vec4(c*lum,1.);}'});
  waterMats.push(mud);
  const drape=(x,z,R,col,seg,jag)=>{const pos=[x,heightAt(x,z)+.004,z],uv=[.5,.5],idx=[];for(let k=0;k<=seg;k++){const a=k/seg*6.283,rr=R*(1-jag+jag*2*rnd());const px=x+Math.cos(a)*rr,pz=z+Math.sin(a)*rr;pos.push(px,heightAt(px,pz)+.004,pz);uv.push(.5+Math.cos(a)*.5,.5+Math.sin(a)*.5);if(k)idx.push(0,k+1,k);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
    const m=new THREE.Mesh(g,col.isMaterial?col:toon(col,{polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));groups.static.add(m);return m;};
  let n=0,tr=0;while(n<60&&tr<900){tr++;const a=rnd()*6.283,r=Math.sqrt(rnd())*.75;const x=C[0]+Math.cos(a)*r,z=C[1]+Math.sin(a)*r;const E=infoAt(x,z);if(!E||E.dl<.04||E.rv.d<.035)continue;
    if(n<14)drape(x,z,.025+rnd()*.035,mud,22,.05);                                                    // boiling grey mud pools
    else drape(x,z,.03+rnd()*.09,['#e8d23a','#f2e36a','#d9b82a','#f4f0e6','#c98a2a'][n%5],14,.35);  // sulfur / sinter crusts
    n++;}}
function buildTermas(){
  const c=P(-37.8206,-71.0992);const y=heightAt(c[0],c[1]);const g=new THREE.Group();
  const main=new THREE.Mesh(new THREE.BoxGeometry(.26,.07,.1).translate(0,.035,0),toon('#f4efe3'));
  const roof=new THREE.Mesh(new THREE.BoxGeometry(.28,.02,.12).translate(0,.08,0),toon('#3a86ff'));
  const band=new THREE.Mesh(new THREE.BoxGeometry(.262,.012,.102).translate(0,.05,0),toon('#2ec4b6'));
  g.add(main,roof,band);g.position.set(c[0],y-.01,c[1]);g.rotation.y=.35;groups.static.add(g);
  const m=P(-37.8222,-71.1010);const ym=heightAt(m[0],m[1]);const h=new THREE.Group();
  const med=new THREE.Mesh(new THREE.BoxGeometry(.12,.08,.09).translate(0,.04,0),toon('#ffffff'));
  const mr=new THREE.Mesh(new THREE.BoxGeometry(.13,.015,.1).translate(0,.087,0),toon('#ff4f3a'));
  const cx1=new THREE.Mesh(new THREE.BoxGeometry(.004,.04,.012),toon('#ff4f3a'));cx1.position.set(.061,.05,0);
  const cx2=new THREE.Mesh(new THREE.BoxGeometry(.004,.012,.04),toon('#ff4f3a'));cx2.position.set(.061,.05,0);
  h.add(med,mr,cx1,cx2);h.position.set(m[0],ym-.01,m[1]);h.rotation.y=.35;groups.static.add(h);
  POIS.forEach(o=>{const q=P(o.lat,o.lon);o.x=q[0];o.z=q[1];o.label=addLabel(`${o.icon} ${o.short}<small>${o.sub}</small>`,'site-lbl',()=>new THREE.Vector3(o.x,heightAt(o.x,o.z)+(o.dy||.35)*clamp(SF,.6,2.5),o.z),o.layer||'landmarks',{dx:o.lo?o.lo[0]:0,dy:o.lo?o.lo[1]:0,onclick:()=>openInfo(o),minD:0,maxD:o.maxD||45});
    o.label.el.style.background=o.col;if(o.dark)o.label.el.style.color='#fff';});
}
const POIS=[
 {id:'termas',short:'TERMAS DE COPAHUE',sub:'complejo termal',icon:'♨',lat:-37.8203,lon:-71.0985,col:'#2ec4b6',lo:[-60,-30],
  title:'Termas de Copahue',meta:'Villa Copahue · ~2.000 m s.n.m. · abierta en verano',
  html:`<p>Es la manifestación termal más importante de la región. Su aspecto original se modificó mucho con edificios, caminos, diques y terraplenes que formaron pequeñas lagunas para balneoterapia.</p>
  <p>Sus fuentes más conocidas son las lagunas <b>Sulfurosa</b>, <b>Verde</b> y <b>Del Chancho</b> y el <b>Baño Nº 9</b>. La Laguna Madre Sulfurosa (LSM) es uno de los sitios muestreados en 2019 y 2020.</p>
  <div class="kpis"><div class="kpi"><b>30.000</b><span>visitantes por temporada</span></div><div class="kpi"><b>200.000+</b><span>tratamientos médicos</span></div></div>
  <p>El clima es seco y frío. En invierno la villa queda casi cubierta de nieve y solo se llega en vehículos oruga, por eso hoteles y centros de salud abren solo en verano.</p>
  <div class="note">Fuente: Mas &amp; Mas y Monasterio et al., en <i>Copahue Volcano</i> (Tassi, Vaselli &amp; Caselli, eds., Springer 2016).</div>`},
 {id:'medico',short:'CENTRO MÉDICO TERMAL',sub:'balneoterapia',icon:'✚',lat:-37.8222,lon:-71.1010,col:'#ffffff',lo:[70,10],dy:.28,
  title:'Centro médico termal de Copahue',meta:'Edificio de balneoterapia · Villa Copahue',
  html:`<p>Es el edificio de balneoterapia. Ahí se hacen terapias individuales de fango y baños, con tratamientos personalizados que prescribe el personal médico.</p>
  <p>Las aguas mineromedicinales de Copahue se usan en terapias para enfermedades de la piel, reumáticas y respiratorias. En la Laguna Sulfurosa madura el fango y el agua sulfatada se usa en baños.</p>
  <div class="note">Fuente: Monasterio, Armijo &amp; Maraver, en <i>Copahue Volcano</i> (Springer 2016).</div>`},
 {id:'mapuche1',short:'COMUNIDAD MAPUCHE-PEHUENCHE',sub:'ilustrativa · Chancho-Có',icon:'◉',lat:-37.8105,lon:-71.1795,col:'#d9b45a',lo:[0,-6],
  title:'Comunidad mapuche-pehuenche',meta:'Ilustrativa, junto a Chancho-Có · sin nombre ni ubicación exacta',
  html:`<p>El pueblo mapuche-pehuenche habita la zona desde mucho antes que las villas termales. Los topónimos vienen del mapudungun: <b>Copahue</b> significa "lugar de azufre" y <b>Caviahue</b>, "lugar sagrado de fiesta".</p>
  <p>En verano practican la <b>veranada</b>, una trashumancia en la que llevan sus animales a pastar cerca del volcán. El piñón de la araucaria es central en su alimentación, y según el libro también lo usaban por sus propiedades medicinales.</p>
  <p>Las rukas, el rewe y el corral de chivas del mapa son ilustrativos.</p>
  <div class="note">Fuente: Tassi et al. (eds.) 2016, cap. 13 y cap. 10.</div>`},
 {id:'mapuche2',short:'ASENTAMIENTO MAPUCHE',sub:'sobre las cascadas del RAS',icon:'◉',lat:-37.8915,lon:-71.0735,col:'#d9b45a',lo:[-10,40],dy:.3,
  title:'Asentamiento mapuche sobre las cascadas',meta:'Río Agrio Superior · ubicación aproximada',
  html:`<p>Varekamp y colaboradores midieron flujos de elementos durante 15 años en dos puntos: el puente del Río Agrio Superior en Caviahue y un punto "junto al asentamiento mapuche, justo sobre la zona de cascadas" del Río Agrio Superior.</p>
  <p>Durante la erupción de 2000, parte de las comunidades mapuche que pastoreaban al sureste del volcán fueron evacuadas hacia el valle alto del Río Agrio.</p>
  <div class="note">Fuente: Varekamp et al. y Caselli et al., en <i>Copahue Volcano</i> (Springer 2016). La posición en el mapa es aproximada.</div>`},
];
const POI_CANICHE={id:'caniche',title:'Caniche, guía del volcán',meta:'Guía de montaña del Copahue',col:'#ffd23f',
  html:`<p><b>Caniche</b> es el guía que acompaña al laboratorio hasta el cráter del Copahue. En el mapa es un personaje de cómic: moreno, delgado, con ropa outdoor, gorra, lentes rojos, mochila y su sello más llamativo, un <b>pelo largo y crespo</b>.</p>
  <p>Anda por el borde del cráter, cerca de la Laguna del Cráter (pH ≈ 0,8) y de las Vertientes del Agrio, donde nace el Río Agrio.</p>`};
function openInfo(o){
  selected=null;side.style.setProperty('--c',o.col||'#ffd23f');
  document.getElementById('sTitle').textContent=o.title;document.getElementById('sMeta').innerHTML=o.meta||'';
  document.getElementById('sBody').innerHTML=o.html;side.classList.add('open');side.scrollTop=0;
  if(o.x!==undefined)flyTo(new THREE.Vector3(o.x,heightAt(o.x,o.z),o.z),Math.min(camera.position.distanceTo(controls.target),6),null);
  else if(o===POI_CANICHE&&caniche)flyTo(caniche.position.clone(),4,null);
}

// clouds, steam, condors
const clouds=[],steam=[],birds=[];
function buildLife(){
  const cm=toon('#ffffff');
  for(let i=0;i<14;i++){const g=new THREE.Group();const n=4+Math.floor(rnd()*4);
    for(let k=0;k<n;k++){const r=.5+rnd()*.8;const s=new THREE.Mesh(new THREE.IcosahedronGeometry(r,2),cm);s.position.set((k-n/2)*.7+rnd()*.3,rnd()*.35,rnd()*.6-.3);s.scale.y=.7;g.add(s);}
    g.position.set(lerp(X0,X1,rnd()),13+rnd()*3,lerp(Z0,Z1,rnd()));g.userData.sp=.25+rnd()*.35;g.traverse(o=>{o.castShadow=o.receiveShadow=false;o.userData.noShadow=1;});clouds.push(g);groups.life.add(g);}
  // steam puffs
  const ct=document.createElement('canvas');ct.width=ct.height=64;const cx=ct.getContext('2d');
  cx.fillStyle='#fff';cx.strokeStyle='#1d1a2b';cx.lineWidth=5;cx.beginPath();cx.arc(32,32,26,0,6.3);cx.fill();cx.stroke();
  const tex=new THREE.CanvasTexture(ct);
  const vents=[[-37.8559,-71.1583,1.4],[-37.8563,-71.1543,1],[-37.8551,-71.1515,.8],[-37.8181,-71.1661,.9],[-37.8208,-71.1548,.8],[-37.834,-71.084,1.1],[-37.822,-71.098,.9],[-37.8195,-71.087,.8],[-37.8105,-71.1795,.35]];
  {let n=0,tr=0;while(n<18&&tr<400){tr++;const la=-37.8165+(rnd()-.5)*.016,lo=-71.166+(rnd()-.5)*.02;const q=P(la,lo),E=infoAt(q[0],q[1]);if(!E||E.dl<.04||E.rv.d<.04)continue;vents.push([la,lo,.35+rnd()*.7]);n++;}}  // Chancho-Có solfatara field
  vents.forEach(v=>{const p=P(v[0],v[1]);const y=heightAt(p[0],p[1]);
    for(let k=0;k<9;k++){const sm=new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false});const s=new THREE.Sprite(sm);
      s.userData={x:p[0],z:p[1],y,ph:k/9,sz:v[2]};groups.life.add(s);steam.push(s);}});
  // condors
  for(let i=0;i<4;i++){const g=new THREE.Group();const mat=toon('#1d1a2b');
    const body=new THREE.Mesh(new THREE.SphereGeometry(.05,8,6).scale(1.8,.7,.8),mat);
    const w1=new THREE.Mesh(new THREE.BoxGeometry(.06,.008,.32).translate(0,0,.16),mat),w2=new THREE.Mesh(new THREE.BoxGeometry(.06,.008,.32).translate(0,0,-.16),mat);
    const collar=new THREE.Mesh(new THREE.SphereGeometry(.03,8,6),toon('#ffffff'));collar.position.x=.08;
    g.add(body,w1,w2,collar);g.userData={w1,w2,r:2+i*1.1,h:6.8+i*.5,sp:.18+.05*i,ph:i*1.7,c:i<2?VOLC:P(-37.82,-70.93)};birds.push(g);groups.life.add(g);}
}

// ------------------------------------------------------------------ pins, labels
const labelsEl=document.getElementById('labels');
const LBL=[];
function addLabel(html,cls,getPos,layer,opts={}){const el=document.createElement('div');el.className='lbl '+cls;el.innerHTML=html;labelsEl.appendChild(el);
  const L={el,getPos,layer,dx:opts.dx||0,dy:opts.dy||0,minD:opts.minD||0,maxD:opts.maxD||1e9,site:opts.site,w:0,h:0};LBL.push(L);if(opts.onclick)el.addEventListener('click',e=>{e.stopPropagation();opts.onclick();});return L;}
const pickables=[];
let SF=1;
function buildSites(){
  SITES.forEach(s=>{
    const g=new THREE.Group();const y=heightAt(s.x,s.z);g.position.set(s.x,y,s.z);
    const col=HAB[s.hab].c;
    const post=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.55,6).translate(0,.275,0),toon('#ffffff'));
    const head=new THREE.Mesh(new THREE.SphereGeometry(.11,16,12),toon(col));head.position.y=.6;
    const tip=new THREE.Mesh(new THREE.ConeGeometry(.07,.14,10).rotateX(Math.PI),toon(col));tip.position.y=.5;
    const base=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,.02,16),toon('#1d1a2b'));
    g.add(post,tip,head,base);head.userData.site=s;tip.userData.site=s;pickables.push(head,tip);
    s.pin=g;s.head=head;s.y=y;groups.sites.add(g);
    const sub=s.approx?'ubicación aprox.':s.n;
    s.label=addLabel(`${s.c.replace('_','–').replace('CHCa','CHC↑')}<small>${sub}</small>`,'site-lbl',()=>new THREE.Vector3(s.x,y+.78*SF,s.z),'sites',{dx:s.lo[0],dy:s.lo[1],site:s,onclick:()=>selectSite(s)});
    s.label.el.style.background=col;s.label.el.style.color=(s.hab==='TER'||s.hab==='DUL'||s.hab==='VER')?'#fff':'#1d1a2b';
    if(s.hab==='TER'||s.hab==='DUL'||s.hab==='VER')s.label.el.style.textShadow='1px 1px 0 #1d1a2b';
  });
}
function buildLandmarks(){
  const L=(t,lat,lon,dh,cls='',minD=0,maxD=1e9)=>{const p=P(lat,lon);addLabel(t,'land-lbl '+cls,()=>new THREE.Vector3(p[0],heightAt(p[0],p[1])+dh,p[1]),'landmarks',{minD,maxD});};
  L('▲ COPAHUE VOLCANO 2,997 m',-37.852,-71.168,.9);
  L('LAKE CAVIAHUE',-37.874,-71.012,.2,'water');
  L('CAVIAHUE',-37.8685,-71.0585,.35,'',0,40);
  L('✈ AIRFIELD',-37.851,-71.009,.3,'',0,22);L('⛷ CAVIAHUE SKI',-37.86105,-71.07586,.35,'',0,20);
  L('USINA VIEJA FALLS',-37.8556,-71.05782,.25,'',0,14);L('LA VIRGEN FALLS',-37.88269,-71.06674,.25,'',0,12);L('EL GIGANTE FALLS',-37.88617,-71.0708,.2,'',0,12);
  L('STONE BRIDGE',-37.88323,-71.01314,.25,'',0,18);L('LAGUNA DEL CACIQUE',-37.9014,-70.98529,.25,'water',0,20);L('ROUTE 26',-37.8524,-71.0262,.2,'',0,16);L('ROUTE 26',-37.8939,-71.0155,.2,'',0,16);
  L('VILLA COPAHUE',-37.8185,-71.0935,.5,'',8,40);
  L('LAS MÁQUINAS',-37.834,-71.084,.3,'',0,26);
  L('CALDERA DEL AGRIO',-37.935,-71.00,.4,'',8,120);
  L('SALTO DEL AGRIO',-37.807,-70.925,.5,'',0,30);
  L('TO LONCOPUÉ ➘',-38.08,-70.60,.4,'',0,120);
  L('CHILE ◂',-37.80,-71.27,.4,'',0,120);

  RIVERS.forEach(r=>{const m=r.mid;addLabel(r.n.toUpperCase()+(r.approx?' ≈':''),'land-lbl water',()=>new THREE.Vector3(m.x,heightAt(m.x,m.z)+.12,m.z),'landmarks',{minD:0,maxD:60});});
}

// ------------------------------------------------------------------ metadata columns
const META_VARS=[['pH','pH','',false],['Temp.[ºC]','Temperatura','°C',false],['EC[µS/cm]','Conductividad','µS/cm',true],['ORP[mV]','ORP','mV',false],['TDS [ppm]','TDS','ppm',true],
 ['Sal.[psu]','Salinidad','psu',true],['D.O.[%]','Oxígeno disuelto','%',false],['D.O.[ppm]','Oxígeno disuelto','ppm',false],['Turb.FNU','Turbidez','FNU',true],
 ['SO4','Sulfato SO₄²⁻','mg/L',true],['Cl-','Cloruro Cl⁻','mg/L',true],['Fe','Hierro','mg/L',true],['Al','Aluminio','mg/L',true],['Mg','Magnesio','mg/L',true],['Ca','Calcio','mg/L',true],
 ['Na','Sodio','mg/L',true],['K','Potasio','mg/L',true],['Mn','Manganeso','mg/L',true],['Zn','Zinc','mg/L',true],['As','Arsénico','mg/L',true],['Cu','Cobre','mg/L',true]];
const selVar=document.getElementById('metaVar');META_VARS.forEach(v=>{const o=document.createElement('option');o.value=v[0];o.textContent=`${v[1]}${v[2]?' ('+v[2]+')':''}`;selVar.appendChild(o);});
let metaCols=[];const metaLabels=[];
const colGeo=new THREE.CylinderGeometry(1,1,1,14).translate(0,.5,0);
function fmt(v){const a=Math.abs(v);if(a>=10000)return (v/1000).toFixed(1)+'k';if(a>=100)return v.toFixed(0);if(a>=10)return v.toFixed(1);if(a>=1)return v.toFixed(2);return v.toPrecision(2);}
function rebuildMeta(){
  metaCols.forEach(c=>{groups.meta.remove(c.mesh);});metaCols=[];
  metaLabels.forEach(L=>{L.el.remove();LBL.splice(LBL.indexOf(L),1);});metaLabels.length=0;
  const key=selVar.value,yr=document.getElementById('metaYear').value;const vdef=META_VARS.find(v=>v[0]===key);const log=vdef[3];
  const all=[];SITES.forEach(s=>s.samples.forEach(m=>{if(m.v[key]!==undefined)all.push(m.v[key]);}));
  const tf=v=>log?Math.log10(Math.max(v,.01)):v;
  let mn=Math.min(...all.map(tf)),mx=Math.max(...all.map(tf));if(key==='pH'){mn=0;mx=8.5;}if(key==='Temp.[ºC]')mn=0;if(mx-mn<1e-6)mx=mn+1;
  SITES.forEach(s=>{
    let ss=s.samples.filter(m=>m.v[key]!==undefined);
    if(yr==='2019'||yr==='2020')ss=ss.filter(m=>String(m.year)===yr);
    else if(yr==='auto'&&ss.length){const ly=Math.max(...ss.map(m=>m.year));ss=ss.filter(m=>m.year===ly).slice(0,1);}
    ss.forEach((m,i)=>{
      const val=m.v[key];const t=(tf(val)-mn)/(mx-mn);
      const col=key==='pH'?phColor(val):ramp(HEAT,t);
      const mesh=new THREE.Mesh(colGeo,toon(new THREE.Color(col[0],col[1],col[2])));
      const off=(i-(ss.length-1)/2)*.2;
      mesh.userData={site:s,target:.25+t*3.2,off,cur:.001};mesh.position.set(s.x+off,s.y,s.z+.16);mesh.userData.site=s;pickables.push(mesh);
      groups.meta.add(mesh);metaCols.push({mesh});
      const tag=(yr==='all'||ss.length>1||s.samples.filter(q=>q.v[key]!==undefined).length>1)?`<small> ${m.year}${/caliente|fria|clara|turbia/i.test(m.name)?' '+m.name.split(',').pop().trim():''}</small>`:'';
      const L=addLabel(`${fmt(val)}${tag}`,'meta-lbl',()=>new THREE.Vector3(mesh.position.x,mesh.position.y+mesh.scale.y+.08*SF,mesh.position.z),'meta',{dy:0});
      L.el.style.background=rgbCss(col);metaLabels.push(L);
    });
  });
  updateLegend();
}

// ------------------------------------------------------------------ taxa bubbles + critters
const taxaLabels=[];const critters=[];
function donutSVG(parts,size){let a=-Math.PI/2;const r=size/2-3,ri=r*.5,cx=size/2;let p='';
  parts.forEach(([n,v])=>{if(v<=0)return;const b=a+v/100*Math.PI*2;const large=b-a>Math.PI?1:0;
    const x1=cx+r*Math.cos(a),y1=cx+r*Math.sin(a),x2=cx+r*Math.cos(b),y2=cx+r*Math.sin(b),x3=cx+ri*Math.cos(b),y3=cx+ri*Math.sin(b),x4=cx+ri*Math.cos(a),y4=cx+ri*Math.sin(a);
    if(v>=99.99)p+=`<circle cx="${cx}" cy="${cx}" r="${(r+ri)/2}" fill="none" stroke="${gcol(n)}" stroke-width="${r-ri}"/>`;
    else p+=`<path d="M${x1},${y1}A${r},${r} 0 ${large} 1 ${x2},${y2}L${x3},${y3}A${ri},${ri} 0 ${large} 0 ${x4},${y4}Z" fill="${gcol(n)}" stroke="#1d1a2b" stroke-width="1.6"/>`;a=b;});
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${cx}" cy="${cx}" r="${r}" fill="#fff" stroke="#1d1a2b" stroke-width="3"/>${p}<circle cx="${cx}" cy="${cx}" r="${ri}" fill="#fff" stroke="#1d1a2b" stroke-width="2.5"/></svg>`;}
function taxaParts(t,level){
  if(level==='genus'){const top=t.genus.slice(0,5).map(g=>[g[0],g[1]]);const s=top.reduce((a,b)=>a+b[1],0);top.push(['Otros y no asignados',Math.max(0,100-s)]);return top;}
  const o=level==='phylum'?t.phylum:t.domain;const arr=Object.entries(o).sort((a,b)=>b[1]-a[1]);const s=arr.reduce((a,b)=>a+b[1],0);if(s<99.9)arr.push(['Otros',100-s]);return arr;}
function rebuildTaxa(){
  taxaLabels.forEach(L=>{L.el.remove();LBL.splice(LBL.indexOf(L),1);});taxaLabels.length=0;
  const level=document.getElementById('taxaLevel').value;
  SITES.filter(s=>s.taxa).forEach(s=>{
    const parts=taxaParts(s.taxa,level);const top=parts[0];
    const cap=level==='genus'?`${top[0]} ${top[1].toFixed(0)}%`:`${top[0]} ${top[1].toFixed(0)}%`;
    const L=addLabel(`${donutSVG(parts,64)}<br><span class="cap">${cap}</span>`,'taxa-lbl',()=>new THREE.Vector3(s.x,s.y+1.05*SF,s.z),'taxa',{dx:s.lo[0]*.9,dy:-8,site:s,onclick:()=>selectSite(s)});
    L.el.title=parts.map(p=>`${p[0]}: ${p[1].toFixed(2)}%`).join('\n');taxaLabels.push(L);
  });
  updateLegend();
}
function buildCritters(){
  const eyeW=toon('#ffffff'),eyeB=new THREE.MeshBasicMaterial({color:0x111111});
  SITES.filter(s=>s.taxa).forEach(s=>{
    const top=s.taxa.genus.slice(0,5);const tot=top.reduce((a,b)=>a+b[1],0);
    for(let k=0;k<7;k++){
      let r=rnd()*tot,g=top[0];for(const q of top){r-=q[1];if(r<=0){g=q;break;}}
      const grp=new THREE.Group();const arch=ARCHAEA.has(g[0]);
      const body=new THREE.Mesh(arch?new THREE.IcosahedronGeometry(.05,1):new THREE.CapsuleGeometry?new THREE.CapsuleGeometry(.03,.07,4,8).rotateZ(Math.PI/2):new THREE.SphereGeometry(.04,10,8).scale(2,1,1),toon(gcol(g[0])));
      grp.add(body);
      [.018,-.018].forEach(zz=>{const e=new THREE.Mesh(new THREE.SphereGeometry(.013,8,6),eyeW);e.position.set(arch?.035:.05,.018,zz);const pu=new THREE.Mesh(new THREE.SphereGeometry(.006,6,4),eyeB);pu.position.set(arch?.046:.061,.018,zz);grp.add(e,pu);});
      if(!arch){const fl=new THREE.Mesh(new THREE.CylinderGeometry(.004,.002,.08,4).rotateZ(Math.PI/2).translate(-.1,0,0),toon('#1d1a2b'));grp.add(fl);grp.userData.fl=fl;}
      grp.userData={s,r:.3+rnd()*.35,h:.2+rnd()*.45,sp:(.6+rnd()*.8)*(rnd()>.5?1:-1),ph:rnd()*6.28,g:g[0],fl:grp.userData.fl};
      critters.push(grp);groups.taxa.add(grp);
    }
  });
}

// ------------------------------------------------------------------ field readings (points)
let fieldPts;const fieldIdx=[];
function buildField(){
  const v=[],c=[];
  FIELD.forEach((f,i)=>{const p=P(f.lat,f.lon);const jit=(hash(f.id,3)-.5)*.03;v.push(p[0]+jit,heightAt(p[0],p[1])+.08+(hash(f.id,7))*.08,p[1]+(hash(f.id,9)-.5)*.03);c.push(...phColor(f.ph));f.year=f.d.slice(-4);fieldIdx.push(f);});
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));
  g.setAttribute('vis',new THREE.Float32BufferAttribute(new Float32Array(FIELD.length).fill(1),1));
  const m=new THREE.ShaderMaterial({uniforms:{px:{value:10*DPR}},vertexColors:true,
    vertexShader:`attribute float vis;uniform float px;varying vec3 vC;varying float vV;void main(){vC=color;vV=vis;vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=px*vis;}`,
    fragmentShader:`varying vec3 vC;varying float vV;void main(){if(vV<.5)discard;vec2 p=gl_PointCoord-.5;float r=length(p);if(r>.5)discard;vec3 c=r>.36?vec3(.11,.1,.17):vC;gl_FragColor=vec4(c,1.);}`});
  fieldPts=new THREE.Points(g,m);fieldPts.renderOrder=3;groups.field.add(fieldPts);
}
function updateFieldVis(){const ys=[...document.querySelectorAll('.fy')].filter(x=>x.checked).map(x=>x.value);const a=fieldPts.geometry.attributes.vis;fieldIdx.forEach((f,i)=>a.setX(i,ys.includes(f.year)?1:0));a.needsUpdate=true;}

// ------------------------------------------------------------------ photos (comicified)
const comicCache={};
function comicify(src,maxW,cb){
  const key=src.slice(-40)+maxW;if(comicCache[key])return cb(comicCache[key]);
  const img=new Image();img.onload=()=>{
    const s=Math.min(1,maxW/img.width),w=Math.round(img.width*s),h=Math.round(img.height*s);
    const cv=document.createElement('canvas');cv.width=w;cv.height=h;const cx=cv.getContext('2d');cx.drawImage(img,0,0,w,h);
    const id=cx.getImageData(0,0,w,h),d=id.data;const L=new Float32Array(w*h);
    for(let i=0;i<w*h;i++)L[i]=.299*d[i*4]+.587*d[i*4+1]+.114*d[i*4+2];
    const out=cx.createImageData(w,h),o=out.data;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;
      let r=d[i*4],g=d[i*4+1],b=d[i*4+2];const l=L[i];
      r=l+(r-l)*1.55;g=l+(g-l)*1.55;b=l+(b-l)*1.55;
      const q=v=>Math.round(clamp((v-8)*1.12,0,255)/51)*51;r=q(r);g=q(g);b=q(b);
      let gx=0,gy=0;if(x>0&&y>0&&x<w-1&&y<h-1){gx=L[i+1-w]+2*L[i+1]+L[i+1+w]-L[i-1-w]-2*L[i-1]-L[i-1+w];gy=L[i-1+w]+2*L[i+w]+L[i+1+w]-L[i-1-w]-2*L[i-w]-L[i+1-w];}
      const e=Math.sqrt(gx*gx+gy*gy);const ink=e>190?.18:e>130?.62:1;
      const dot=(l<70&&((x+y)%4===0)&&(x%4===0))?.6:1;
      o[i*4]=clamp(r,0,255)*ink*dot;o[i*4+1]=clamp(g,0,255)*ink*dot;o[i*4+2]=clamp(b,0,255)*ink*dot;o[i*4+3]=255;}
    cx.putImageData(out,0,0);const url=cv.toDataURL('image/jpeg',.85);comicCache[key]={url,cv,w,h};cb(comicCache[key]);
  };img.src=src;}
const photoSprites=[];
function buildPhotos(){
  SITES.filter(s=>s.photo&&PHOTOS[s.photo]).forEach(s=>{
    comicify(PHOTOS[s.photo],300,res=>{
      const cv=document.createElement('canvas');const W2=300,H2=Math.round(res.h*300/res.w)+46;cv.width=W2+16;cv.height=H2+12;const cx=cv.getContext('2d');
      cx.fillStyle='#1d1a2b';cx.fillRect(6,6,W2+10,H2+6);cx.fillStyle='#fffdf5';cx.fillRect(0,0,W2+10,H2+6);cx.lineWidth=4;cx.strokeStyle='#1d1a2b';cx.strokeRect(2,2,W2+6,H2+2);
      cx.drawImage(res.cv,5,5,W2,res.h*300/res.w);cx.strokeRect(5,5,W2,res.h*300/res.w);
      cx.fillStyle='#1d1a2b';cx.font='28px Bangers, Impact, sans-serif';cx.textAlign='center';cx.fillText(s.c.replace('_','–')+' · '+s.n.split(',')[0].split('(')[0].toUpperCase().slice(0,22),W2/2+5,H2-8);
      const tex=new THREE.CanvasTexture(cv);tex.minFilter=THREE.LinearFilter;
      const smat=new THREE.SpriteMaterial({map:tex,transparent:false,alphaTest:.5});smat.onBeforeCompile=sh=>{sh.fragmentShader=sh.fragmentShader.replace(/}\s*$/,'gl_FragColor.a=0.5;}');};const sp=new THREE.Sprite(smat);const asp=cv.height/cv.width;sp.userData={site:s,asp};sp.center.set(.5,0);
      groups.photos.add(sp);photoSprites.push(sp);pickables.push(sp);
    });
  });
}

// ------------------------------------------------------------------ post-processing (Borderlands-style ink, hatching, grading) + quality presets
const GFX_PRESETS={
  low:   {dpr:1,   hq:0, hatch:0, shadow:0, ink:1.7, lod:22, tlod:5,  glod:8,  aa:0, label:'LOW'},
  medium:{dpr:1.5, hq:1, hatch:1, shadow:0, ink:2.1, lod:40, tlod:8,  glod:12, aa:1, label:'MED'},
  high:  {dpr:2,   hq:1, hatch:1, shadow:1, ink:2.4, lod:70, tlod:13, glod:20, aa:1, label:'HIGH'}
};
// soften cast shadows: shadowed areas keep 45% of direct sun so toon bands + hatching still read
THREE.ShaderChunk.lights_fragment_begin=THREE.ShaderChunk.lights_fragment_begin.replace('receiveShadow ) ) ? getShadow(','receiveShadow ) ) ? .45+.55*getShadow(');
const GFX=(()=>{let mode='auto';try{mode=localStorage.getItem('copahue.gfx')||'auto';}catch(e){}
  if(mode!=='auto'&&!GFX_PRESETS[mode])mode='auto';
  let gpu='';try{const gl=renderer.getContext();const ext=gl.getExtension('WEBGL_debug_renderer_info');gpu=ext?String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)):'';}catch(e){}
  const mobile=/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  let guess='medium';
  if(mobile||/SwiftShader|llvmpipe|Mali|Adreno|PowerVR|Intel.*HD Graphics|Intel\(R\) HD|GMA/i.test(gpu))guess='low';
  else if(/Apple M|Apple GPU|NVIDIA|GeForce|RTX|Radeon RX|Radeon Pro|AMD Radeon\(TM\) Graphics/i.test(gpu))guess='high';
  return {mode,gpu,guess,level:mode==='auto'?guess:mode,scale:1,acc:0,n:0,good:0,bad:0};
})();
const rt=new THREE.WebGLRenderTarget(1,1,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});
rt.depthTexture=new THREE.DepthTexture(1,1);rt.depthTexture.type=THREE.UnsignedIntType;
const skyStars=new THREE.TextureLoader().load('data/sky/sky_stars.webp');skyStars.minFilter=skyStars.magFilter=THREE.LinearFilter;skyStars.generateMipmaps=false;skyStars.wrapS=THREE.RepeatWrapping;
window.SKYGLSL=`uniform sampler2D skyStars;uniform float lst;
    vec3 starMap(vec3 rd,float tm){const float sp=-.61375,cp=.78950;float N=rd.z,E=-rd.x,U=rd.y;float Z=sp*U+cp*N,X=cp*U-sp*N,Y=-E;float ra=lst-atan(Y,X);
      vec2 uv=vec2(fract(ra*.15915494),asin(clamp(Z,-1.,1.))*.31830989+.5);vec3 s=texture2D(skyStars,uv).rgb;
      float h=hs(floor(uv*vec2(1800.,900.)));float tw=.8+.2*sin(tm*(2.5+5.*h)+h*60.);s*=mix(1.,tw,smoothstep(.12,.55,dot(s,vec3(.33))));return s;}
    float meteors(vec2 uv,float t,float asp){float acc=0.;for(int j=0;j<2;j++){float fj=float(j);float P=17.+fj*6.;float tt=t/P+fj*.41;float k=floor(tt);float st=fract(tt)*P;
        if(hs(vec2(k,fj*5.3))>.62&&st<1.1){float p=st/1.1;vec2 s0=vec2(.12+hs(vec2(k,2.+fj))*.76,.55+hs(vec2(k,4.+fj))*.4);float ang=-.55-hs(vec2(k,6.+fj))*1.9;vec2 dir=vec2(cos(ang),sin(ang));
          vec2 q=(uv-s0)*vec2(asp,1.);float al=dot(q,dir);float pr=abs(dot(q,vec2(-dir.y,dir.x)));float head=p*.38;float tail=smoothstep(head-.17,head,al)*step(al,head);
          acc+=tail*(1.-smoothstep(.0006,.0022,pr))*sin(3.14159*p)*(.7+.6*smoothstep(head-.03,head,al));}}return acc;}
    `;  // real star map (Hipparcos) for lat 37.85°S + meteors; shared with real.js
const postMat=new THREE.ShaderMaterial({defines:{HQ:1,HATCH:1},uniforms:{aaK:{value:1},hazeK:{value:1},fovK:{value:new THREE.Vector2(1,1)},sunV:{value:new THREE.Vector3(0,1,0)},camR:{value:new THREE.Matrix3()},cloudK:{value:.55},camP:{value:new THREE.Vector3()},mistK:{value:0},inkW:{value:1.6},tC:{value:rt.texture},tD:{value:rt.depthTexture},tint:{value:new THREE.Vector3(1,1,1)},skyT:{value:new THREE.Vector3(.36,.76,1)},skyB:{value:new THREE.Vector3(1,.94,.76)},snowK:{value:0},stars:{value:0},moonW:{value:new THREE.Vector3(0,.7,-.7)},skyStars:{value:skyStars},lst:{value:0},res:{value:new THREE.Vector2()},near:{value:camera.near},far:{value:camera.far},dpr:{value:DPR},time:{value:0}},
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
  fragmentShader:`uniform sampler2D tC,tD;uniform vec2 res;uniform float near,far,dpr,time;varying vec2 vUv;uniform vec3 tint,skyT,skyB,sunV,moonW;uniform vec2 fovK;uniform mat3 camR;uniform vec3 camP;uniform float snowK,stars,aaK,hazeK,cloudK,mistK;
    float hs(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float ns(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hs(i),hs(i+vec2(1,0)),f.x),mix(hs(i+vec2(0,1)),hs(i+vec2(1,1)),f.x),f.y);}
    float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*ns(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
    float lin(float d){float z=d*2.-1.;return 2.*near*far/(far+near-z*(far-near));}
    float lum(vec3 c){return dot(c,vec3(.299,.587,.114));}
    ${window.SKYGLSL}
    void main(){vec2 px=dpr*1.1/res;float d=texture2D(tD,vUv).x;vec3 col=texture2D(tC,vUv).rgb;
      if(d>.99999){vec3 top=skyT,bot=skyB;vec3 vd=normalize(vec3((vUv*2.-1.)*fovK,-1.));vec3 rd=normalize(camR*vd);float el=rd.y;
        col=mix(bot,top,smoothstep(-.02,.6,el));col=mix(col,bot*1.06+vec3(.03),exp(-abs(el)*14.)*.55);if(el<0.)col=mix(col,bot*.8,smoothstep(0.,-.25,el));
        float sd=max(dot(vd,sunV),0.);float day=1.-stars;
        col+=vec3(1.,.86,.62)*(pow(sd,90.)*.55+pow(sd,10.)*.14)*day;if(stars>.01){col+=starMap(rd,time)*stars*smoothstep(-.03,.16,el)*mix(.5,1.,smoothstep(0.,.35,el))*2.6;}float mr=acos(clamp(dot(rd,moonW),-1.,1.));float MR=.11;{vec3 mt=normalize(cross(moonW,vec3(0.,1.,0.)));vec3 mb=cross(mt,moonW);vec2 mq=vec2(dot(rd,mt),dot(rd,mb))/MR;float mdisc=1.-smoothstep(MR*.97,MR,mr);float mar=smoothstep(.5,.72,fbm(mq*1.7+4.))*.5+smoothstep(.6,.8,fbm(mq*5.+9.))*.12;vec3 mc=mix(vec3(1.,.99,.95),vec3(.74,.77,.84),mar)*(1.-.12*dot(mq,mq));float mg=exp(-pow(mr/(MR*2.6),2.))*.34+exp(-pow(mr/(MR*7.),2.))*.12;col+=vec3(.78,.86,1.)*mg*stars;col=mix(col,mc*1.12,mdisc*stars);}
        if(el>.0){vec2 cp=rd.xz/(el+.12)*.9+vec2(time*.012,time*.004);float cn=fbm(cp*1.3);float cov=smoothstep(.63-cloudK*.25,.69-cloudK*.25,cn)*smoothstep(.0,.12,el);
          float sh=fbm(cp*1.3+vec2(.06,.05));vec3 cc=mix(vec3(1.),mix(bot,top,.3)*.82+vec3(.08),smoothstep(.0,.03,sh-cn-.035)*.8*smoothstep(.04,.3,el));cc=mix(cc,cc*vec3(1.,.9,.85),pow(sd,6.)*.5);
          cc=mix(cc,col,.15+stars*.6);col=mix(col,cc,cov*(.92-stars*.5));}
        if(stars>.01){float y=vUv.y;float ax=vUv.x*5.+time*.04;float yc=.74+.05*sin(ax*1.3+sin(ax*.6+time*.1)*2.);float band=exp(-pow((y-yc)*11.,2.))+.6*exp(-pow((y-yc-.07)*16.,2.));
          float cur=.55+.45*sin(vUv.x*38.+time*.7+sin(vUv.x*11.+time*.3)*3.);col+=mix(vec3(.15,1.,.55),vec3(.65,.3,1.),smoothstep(yc-.02,yc+.1,y))*band*cur*stars*.18;
          col+=vec3(1.,.95,.82)*meteors(vUv,time,res.x/res.y)*stars*1.6;}
        vec2 g=gl_FragCoord.xy/(9.*dpr);vec2 f=fract(g)-.5;float r=length(f);col=mix(col,col*.86,(1.-smoothstep(.18,.24,r))*smoothstep(.45,1.,vUv.y));col=mix(col,vec3(.86,.88,.92),snowK);gl_FragColor=vec4(col,1.);return;}
      float dc=lin(d);float e=0.;float ce=0.;float lc=lum(col);
      for(int i=0;i<4;i++){vec2 o=i==0?vec2(px.x,0.):i==1?vec2(-px.x,0.):i==2?vec2(0.,px.y):vec2(0.,-px.y);
        float dn=texture2D(tD,vUv+o).x;float ld=dn>.99999?far:lin(dn);e=max(e,(ld-dc)/dc);
        ce=max(ce,abs(lum(texture2D(tC,vUv+o).rgb)-lc));}
      float photo=step(texture2D(tC,vUv).a,.75);float edge=max(smoothstep(.018,.045,e),smoothstep(.2,.32,ce)*.85*(1.-photo));
      if(aaK>.5&&ce>.06){vec3 nb=(texture2D(tC,vUv+vec2(px.x,0.)).rgb+texture2D(tC,vUv-vec2(px.x,0.)).rgb+texture2D(tC,vUv+vec2(0.,px.y)).rgb+texture2D(tC,vUv-vec2(0.,px.y)).rgb)*.25;
        col=mix(col,nb,smoothstep(.06,.25,ce)*.45*(1.-photo));lc=lum(col);}
      vec2 p=gl_FragCoord.xy/(5.*dpr);p=mat2(.707,-.707,.707,.707)*p;vec2 cell=fract(p)-.5;float r=length(cell);
      float dr=sqrt(clamp(1.-lc*1.45,0.,1.))*.62;float dotm=1.-smoothstep(dr-.07,dr+.07,r);
      col=mix(col,col*.5,dotm*.7*(1.-photo));
      col=mix(col,vec3(.11,.1,.17),edge);
      {float hz=smoothstep(14.,120.,dc)*.38*hazeK*(1.-photo);col=mix(col,mix(skyB,skyT,.35),hz);}
      if(mistK>.01){vec3 wp=camP+camR*(vec3((vUv*2.-1.)*fovK,-1.)*dc);float lo=smoothstep(camP.y-.15,camP.y-1.6,wp.y)*(1.-exp(-dc*.035));float wv=.75+.25*sin(wp.x*.7+time*.05)*sin(wp.z*.6-time*.04);col=mix(col,mix(skyB,vec3(.97,.97,.95),.6),clamp(lo*wv*mistK*.85,0.,.8)*(1.-photo));}
      col*=tint;col=mix(col,vec3(.9,.92,.98),snowK*.9);
      gl_FragColor=vec4(col,1.);}`,depthTest:false,depthWrite:false});
const postScene=new THREE.Scene(),postCam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),postMat));
function resize(){const w=innerWidth,h=innerHeight;const d=Math.max(.5,Math.min(DPR,Math.sqrt(1920*1080/Math.max(1,w*h))));  // cap at 1080p worth of pixels
  const W=Math.round(w*d),H=Math.round(h*d);if(resize.k===W+'x'+H+'@'+w+'x'+h)return;resize.k=W+'x'+H+'@'+w+'x'+h;
  renderer.setPixelRatio(d);renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();rt.setSize(W,H);postMat.uniforms.res.value.set(W,H);postMat.uniforms.dpr.value=d;}
addEventListener('resize',resize);
// ---- quality management
sun.target.position.set(0,0,0);scene.add(sun.target);
sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.0006;sun.shadow.normalBias=.03;sun.shadow.camera.near=1;sun.shadow.camera.far=200;
let shadowScanT=0;
function markShadowCasters(){scene.traverse(o=>{if(!(o.isMesh||o.isInstancedMesh)||o.isSprite)return;const m=Array.isArray(o.material)?o.material[0]:o.material;if(!m)return;
  const solid=!m.transparent&&!m.isMeshBasicMaterial&&!m.isShaderMaterial&&!m.isPointsMaterial;o.receiveShadow=solid||!!m.isMeshToonMaterial;o.castShadow=solid&&o!==terrain&&!o.userData.terr;});
  if(typeof clouds!=='undefined')clouds.forEach(c=>c.traverse(o=>{o.castShadow=o.receiveShadow=false;}));}
function applyGfx(recompile){const P=GFX_PRESETS[GFX.level];
  DPR=Math.max(.5,Math.min(window.devicePixelRatio||1,P.dpr)*GFX.scale);resize();postMat.uniforms.inkW.value=P.ink;postMat.uniforms.aaK.value=P.aa;
  if(postMat.defines.HQ!==P.hq||postMat.defines.HATCH!==P.hatch){postMat.defines.HQ=P.hq;postMat.defines.HATCH=P.hatch;postMat.needsUpdate=true;}
  const sh=!!P.shadow;if(renderer.shadowMap.enabled!==sh||recompile){renderer.shadowMap.enabled=sh;sun.castShadow=sh;if(sh)markShadowCasters();scene.traverse(o=>{if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.needsUpdate=true);});}
  const b=document.getElementById('gfx-btn');if(b)b.textContent='🎨 GFX: '+(GFX.mode==='auto'?'AUTO·'+P.label:P.label)+' (G)';}
function cycleGfx(){const order=['auto','low','medium','high'];GFX.mode=order[(order.indexOf(GFX.mode)+1)%order.length];try{localStorage.setItem('copahue.gfx',GFX.mode);}catch(e){}
  GFX.level=GFX.mode==='auto'?GFX.guess:GFX.mode;GFX.scale=1;GFX.acc=GFX.n=GFX.good=GFX.bad=0;applyGfx();}
function gfxFrame(rawDt){ // adaptive resolution (auto mode only)
  if(GFX.mode!=='auto')return;if(document.hidden||rawDt>1){GFX.acc=GFX.n=0;return;}rawDt=Math.min(rawDt,.25);GFX.acc+=rawDt;GFX.n++;if(GFX.acc<1.5)return;
  const avg=GFX.acc/GFX.n;GFX.acc=GFX.n=0;const order=['low','medium','high'];const now=performance.now();if(now-(GFX.last||0)<6000)return;const L0=GFX.level,S0=GFX.scale;
  if(avg>1/40){GFX.good=0;GFX.bad++;if(GFX.scale>.65){GFX.scale=Math.max(.6,GFX.scale-.12);applyGfx();}else if(GFX.bad>=2&&GFX.level!=='low'){GFX.level=order[order.indexOf(GFX.level)-1];GFX.scale=.85;GFX.bad=0;applyGfx();}}
  else if(avg<1/56){GFX.bad=0;GFX.good++;if(GFX.good>=3&&GFX.scale<1){GFX.scale=Math.min(1,GFX.scale+.1);GFX.good=0;applyGfx();}}
  else{GFX.good=0;GFX.bad=0;}
  if(GFX.level!==L0||GFX.scale!==S0)GFX.last=now;}
function gfxBeforeRender(){const U=postMat.uniforms;const th=Math.tan(camera.fov*Math.PI/360);U.fovK.value.set(th*camera.aspect,th);
  U.sunV.value.copy(sun.position).normalize().transformDirection(camera.matrixWorldInverse);U.camR.value.setFromMatrix4(camera.matrixWorld);U.camP.value.copy(camera.position);
  if(renderer.shadowMap.enabled){const T=controls.target,dist=camera.position.distanceTo(T),S=Math.min(55,Math.max(6,dist*.95));
    const sc=sun.shadow.camera;if(sc.right!==S){sc.left=sc.bottom=-S;sc.right=sc.top=S;sc.updateProjectionMatrix();}
    const dir=sun.position.clone().normalize();if(dir.y<.72){const hz=Math.hypot(dir.x,dir.z)||1;dir.x*=.694/hz;dir.z*=.694/hz;dir.y=.72;}gfxSunSave.copy(sun.position);sun.position.copy(T).addScaledVector(dir,90);sun.target.position.copy(T);sun.target.updateMatrixWorld();
    shadowScanT-=1;if(shadowScanT<=0){shadowScanT=60;markShadowCasters();}renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=(shadowScanT%2===0);return true;}return false;}
const gfxSunSave=new THREE.Vector3();
function gfxAfterRender(moved){if(moved){sun.position.copy(gfxSunSave);sun.target.position.set(0,0,0);sun.target.updateMatrixWorld();}}
// ---- scene optimizer: compact + spatially chunk instanced vegetation (frustum culling + distance LOD), merge static meshes
const LOD_CHUNKS=[];
function chunkInstanced(src,parent,secondary,cell,lo){cell=cell||22;const out=new Map();
  const m=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();const cells=new Map();let maxS=0;
  for(let i=0;i<src.count;i++){src.getMatrixAt(i,m);m.decompose(p,q,s);if(s.x<1e-6||s.y<1e-6)continue;maxS=Math.max(maxS,s.x,s.y,s.z);
    const key=Math.floor(p.x/cell)+','+Math.floor(p.z/cell);let c=cells.get(key);if(!c){c=[];cells.set(key,c);}c.push(m.clone());}
  const lg=lo&&lo.geometry;
  const sg=src.geometry;sg.computeBoundingSphere();const gr=(sg.boundingSphere.center.length()+sg.boundingSphere.radius)*maxS;
  const mk=(srcG,list,sph)=>{const g=new THREE.BufferGeometry();g.setIndex(srcG.index);for(const k in srcG.attributes)g.setAttribute(k,srcG.attributes[k]);g.boundingSphere=sph;
    const im=new THREE.InstancedMesh(g,src.material,list.length);list.forEach((mm,i)=>im.setMatrixAt(i,mm));im.instanceMatrix.needsUpdate=true;return im;};
  cells.forEach((list,key)=>{const box=new THREE.Box3();list.forEach(mm=>{p.setFromMatrixPosition(mm);box.expandByPoint(p);});
    const sph=new THREE.Sphere();box.getBoundingSphere(sph);sph.radius+=gr;
    const im=mk(sg,list,sph);im.userData.lod={c:sph.center.clone(),r:sph.radius,sec:!!secondary};parent.add(im);LOD_CHUNKS.push(im);
    if(lg){const il=mk(lg,list,sph.clone());il.userData.lod={c:sph.center.clone(),r:sph.radius,lo:true};im.userData.lod.pair=il;il.visible=false;parent.add(il);}
    out.set(key,im);});
  src.geometry=new THREE.BufferGeometry();src.count=0;if(src.parent)src.parent.remove(src);return out;}
function updateLOD(){const cp=camera.position,P=GFX_PRESETS[GFX.level];const d2=P.lod*P.lod;
  for(let i=0;i<LOD_CHUNKS.length;i++){const o=LOD_CHUNKS[i],u=o.userData.lod;if(u.sec){o.visible=u.c.distanceToSquared(cp)<d2;continue;}
    if(u.pair){const d=Math.max(0,u.c.distanceTo(cp)-u.r*.6);const near=d<P.tlod;o.visible=near;u.pair.visible=!near;}}
  updateTerrainLOD(cp,P);}
// ---- terrain in tiles: frustum culling + 2 detail levels (full grid near the camera, every 2nd vertex far away), skirts hide seams
const TERR_TILES=[];
function buildTerrainTiles(){
  const PA=geo.attributes.position.array,NA=geo.attributes.normal.array,CA=geo.attributes.color.array,T=56;
  const make=(i0,j0,i1,j1,st)=>{const is=[],js=[];for(let i=i0;i<i1;i+=st)is.push(i);is.push(i1);for(let j=j0;j<j1;j+=st)js.push(j);js.push(j1);
    const nx=is.length,nz=js.length,nEdge=2*(nx+nz)-4,nv=nx*nz+nEdge;const pos=new Float32Array(nv*3),nor=new Float32Array(nv*3),col=new Float32Array(nv*3),src=new Int32Array(nv);
    let v=0;const drop=st>1?.012:0;
    for(let b=0;b<nz;b++)for(let a=0;a<nx;a++){const k=js[b]*(NX+1)+is[a];src[v]=k;pos[v*3]=PA[k*3];pos[v*3+1]=PA[k*3+1]-drop;pos[v*3+2]=PA[k*3+2];for(let c=0;c<3;c++){nor[v*3+c]=NA[k*3+c];col[v*3+c]=CA[k*3+c];}v++;}
    const idx=[];for(let b=0;b<nz-1;b++)for(let a=0;a<nx-1;a++){const A=b*nx+a,B=(b+1)*nx+a,C=(b+1)*nx+a+1,D=b*nx+a+1;idx.push(A,B,D,B,C,D);}
    // skirt: a ring of vertices under the tile border
    const ring=[];for(let a=0;a<nx;a++)ring.push(a);for(let b=1;b<nz;b++)ring.push(b*nx+nx-1);for(let a=nx-2;a>=0;a--)ring.push((nz-1)*nx+a);for(let b=nz-2;b>0;b--)ring.push(b*nx);
    const s0=v;ring.forEach(r=>{src[v]=src[r];pos[v*3]=pos[r*3];pos[v*3+1]=pos[r*3+1]-.18*st;pos[v*3+2]=pos[r*3+2];for(let c=0;c<3;c++){nor[v*3+c]=nor[r*3+c];col[v*3+c]=col[r*3+c];}v++;});
    for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],sa=s0+i,sb=s0+(i+1)%ring.length;idx.push(a,sa,b,b,sa,sb,a,b,sa,b,sb,sa);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('normal',new THREE.BufferAttribute(nor,3));g.setAttribute('color',new THREE.BufferAttribute(col,3));
    g.setIndex(new THREE.BufferAttribute(nv>65535?new Uint32Array(idx):new Uint16Array(idx),1));g.computeBoundingSphere();g.userData.src=src;return g;};
  for(let j0=0;j0<NZ;j0+=T)for(let i0=0;i0<NX;i0+=T){const i1=Math.min(NX,i0+T),j1=Math.min(NZ,j0+T);
    const hi=new THREE.Mesh(make(i0,j0,i1,j1,1),terrain.material),lo=new THREE.Mesh(make(i0,j0,i1,j1,2),terrain.material);
    hi.userData.terr=1;lo.userData.terr=1;lo.visible=false;hi.receiveShadow=lo.receiveShadow=true;
    const bb=new THREE.Box3().setFromBufferAttribute(hi.geometry.attributes.position);groups.static.add(hi,lo);TERR_TILES.push({hi,lo,bb});}
  terrain.visible=false;}   // kept (hidden) as the reference surface for picking
function recolorTiles(){if(!TERR_TILES.length)return;const CA=geo.attributes.color.array;
  TERR_TILES.forEach(T=>[T.hi,T.lo].forEach(m=>{const a=m.geometry.attributes.color,src=m.geometry.userData.src,arr=a.array;for(let v=0;v<src.length;v++){const k=src[v]*3;arr[v*3]=CA[k];arr[v*3+1]=CA[k+1];arr[v*3+2]=CA[k+2];}a.needsUpdate=true;}));}
const _tp=new THREE.Vector3();
function updateTerrainLOD(cp,P){for(const T of TERR_TILES){T.bb.clampPoint(cp,_tp);const near=_tp.distanceTo(cp)<P.glod;T.hi.visible=near;T.lo.visible=!near;}}
function mergeStatic(){ // merge opaque, un-animated toon meshes of identical look into a few big meshes
  const cand=[];groups.static.traverse(o=>{if(!o.isMesh||o.isInstancedMesh||o===terrain||!o.visible)return;const mt=o.material;if(Array.isArray(mt)||!mt||!mt.isMeshToonMaterial||mt.transparent||mt.map||mt.vertexColors)return;
    if(Object.keys(o.userData).length||pickables.includes(o))return;const g=o.geometry,a=g.attributes;if(!g.index||!a.position||!a.normal||g.morphAttributes.position)return;
    const keys=Object.keys(a).sort().join();if(keys!=='normal,position'&&keys!=='normal,position,uv')return;o.updateMatrixWorld(true);cand.push({o,w:o.matrixWorld.clone()});});
  setTimeout(()=>{try{const bins=new Map();
    cand.forEach(c=>{const o=c.o;if(!o.parent||!o.visible)return;o.updateMatrixWorld(true);if(!o.matrixWorld.equals(c.w))return;
      const mt=o.material;const key=mt.color.getHexString()+'|'+mt.side+'|'+(mt.emissive?mt.emissive.getHexString():'')+'|'+mt.opacity+'|'+(mt.gradientMap?mt.gradientMap.uuid:'');let b=bins.get(key);if(!b){b=[];bins.set(key,b);}b.push(o);});
    let merged=0,removed=0;const nm=new THREE.Matrix3();
    bins.forEach(list=>{if(list.length<3)return;let nv=0,ni=0;list.forEach(o=>{nv+=o.geometry.attributes.position.count;ni+=o.geometry.index.count;});if(nv>65000*8)return;
      const pos=new Float32Array(nv*3),nor=new Float32Array(nv*3),idx=nv>65535?new Uint32Array(ni):new Uint16Array(ni);let vo=0,io=0;const v=new THREE.Vector3();
      list.forEach(o=>{const g=o.geometry,P=g.attributes.position,N=g.attributes.normal,I=g.index;nm.getNormalMatrix(o.matrixWorld);
        for(let i=0;i<P.count;i++){v.fromBufferAttribute(P,i).applyMatrix4(o.matrixWorld);pos.set([v.x,v.y,v.z],(vo+i)*3);v.fromBufferAttribute(N,i).applyMatrix3(nm).normalize();nor.set([v.x,v.y,v.z],(vo+i)*3);}
        for(let i=0;i<I.count;i++)idx[io+i]=I.getX(i)+vo;vo+=P.count;io+=I.count;});
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('normal',new THREE.BufferAttribute(nor,3));g.setIndex(new THREE.BufferAttribute(idx,1));g.computeBoundingSphere();
      const mesh=new THREE.Mesh(g,list[0].material);mesh.matrixAutoUpdate=false;mesh.receiveShadow=true;mesh.castShadow=renderer.shadowMap.enabled;groups.static.add(mesh);merged++;
      list.forEach(o=>{o.parent.remove(o);removed++;});});
    console.info('[gfx] merged',removed,'static meshes into',merged);}catch(e){console.warn('mergeStatic',e);}},3500);}
// merge parallel InstancedMeshes (one per tree part) into one vertex-coloured InstancedMesh per tree kind -> ~3x fewer draw calls
function mergeTreeKinds(parts,count,parent,lows){
  const Mi=new THREE.Matrix4(),Mr=new THREE.Matrix4(),inv=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();
  const kinds=new Map();
  for(let k=0;k<count;k++){const used=[];let ref=-1;
    for(let i=0;i<parts.length;i++){parts[i].getMatrixAt(k,Mi);Mi.decompose(p,q,s);if(s.x>1e-6&&s.y>1e-6){used.push(i);}}
    if(!used.length)continue;ref=used.length>1?used[1]:used[0];
    const key=used.join(',');let K=kinds.get(key);if(!K){K={used,ref,mats:[],rel:null};kinds.set(key,K);}
    parts[ref].getMatrixAt(k,Mr);K.mats.push(Mr.clone());
    if(!K.rel){inv.copy(Mr).invert();K.rel=used.map(i=>{parts[i].getMatrixAt(k,Mi);return new THREE.Matrix4().multiplyMatrices(inv,Mi);});}}
  const col=new THREE.Color();
  const build=(K,srcOf)=>{let nv=0,ni=0;const geos=K.used.map((i,j)=>{const g=srcOf(i).clone();g.applyMatrix4(K.rel[j]);nv+=g.attributes.position.count;ni+=g.index?g.index.count:g.attributes.position.count;return g;});
    const pos=new Float32Array(nv*3),nor=new Float32Array(nv*3),cols=new Float32Array(nv*3),idx=new Uint32Array(ni);let vo=0,io=0;
    geos.forEach((g,j)=>{const P=g.attributes.position,N=g.attributes.normal;col.copy(parts[K.used[j]].material.color);
      pos.set(P.array,vo*3);nor.set(N.array,vo*3);for(let i=0;i<P.count;i++){cols[(vo+i)*3]=col.r;cols[(vo+i)*3+1]=col.g;cols[(vo+i)*3+2]=col.b;}
      if(g.index){for(let i=0;i<g.index.count;i++)idx[io+i]=g.index.getX(i)+vo;io+=g.index.count;}else{for(let i=0;i<P.count;i++)idx[io+i]=vo+i;io+=P.count;}vo+=P.count;g.dispose();});
    const G=new THREE.BufferGeometry();G.setAttribute('position',new THREE.BufferAttribute(pos,3));G.setAttribute('normal',new THREE.BufferAttribute(nor,3));G.setAttribute('color',new THREE.BufferAttribute(cols,3));G.setIndex(new THREE.BufferAttribute(idx,1));return G;};
  kinds.forEach(K=>{const G=build(K,i=>parts[i].geometry);const GL=lows?build(K,i=>lows[i]):null;
    const tm=toon('#ffffff',{vertexColors:true});addSway(tm,.11);const src=new THREE.InstancedMesh(G,tm,K.mats.length);K.mats.forEach((m,i)=>src.setMatrixAt(i,m));
    chunkInstanced(src,parent,0,12,GL?{geometry:GL}:null);});
  if(lows)lows.forEach(g=>g.dispose());
  parts.forEach(t=>{t.geometry.dispose();t.count=0;});}
// ---- wind sway for instanced vegetation (vertex shader, zero CPU cost)
const WIND={time:{value:0},amp:{value:1}};
function addSway(mat,k){mat.onBeforeCompile=sh=>{sh.uniforms.wT=WIND.time;sh.uniforms.wA=WIND.amp;
  sh.vertexShader='uniform float wT,wA;\n'+sh.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
  #ifdef USE_INSTANCING
  {vec3 ip=instanceMatrix[3].xyz;float hh=max(transformed.y,0.);hh*=hh*${k.toFixed(3)};float ph=ip.x*2.7+ip.z*3.1;
   transformed.x+=(sin(wT*1.6+ph)+.4*sin(wT*3.7+ph*1.7))*hh*wA;transformed.z+=cos(wT*1.2+ph*1.3)*hh*.6*wA;}
  #endif`);};mat.customProgramCacheKey=()=>'sway'+k;mat.needsUpdate=true;}
// ---- lit windows on town houses (dark blue by day, warm glow at night)
const winMat=new THREE.MeshBasicMaterial({color:'#2c3e66'});
function addWindows(walls){const q=[];const w=.0075,y0=.018,y1=.034;
  [[0,1],[0,-1],[1,0],[-1,0]].forEach(([ax,az])=>{[-.014,.014].forEach(o=>{const cx=ax?ax*.0302:o,cz=az?az*.0302:o;const tx=az?1:0,tz=ax?1:0;
    const a=[cx-tx*w,y0,cz-tz*w],b=[cx+tx*w,y0,cz+tz*w],c=[cx+tx*w,y1,cz+tz*w],d=[cx-tx*w,y1,cz-tz*w];q.push(a,b,c,a,c,d);});});
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(q.flat(),3));
  const im=new THREE.InstancedMesh(g,winMat,walls.count);winMat.side=THREE.DoubleSide;const m=new THREE.Matrix4();for(let i=0;i<walls.count;i++){walls.getMatrixAt(i,m);im.setMatrixAt(i,m);}
  im.instanceMatrix.needsUpdate=true;im.frustumCulled=false;groups.static.add(im);}

// ---- hand-painted terrain detail: crisp dirt speckles + ink cracks in world space (fade out with distance via derivatives)
function addTerrainDetail(mat){mat.onBeforeCompile=sh=>{
  sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vTw;').replace('#include <begin_vertex>','#include <begin_vertex>\nvTw=(modelMatrix*vec4(transformed,1.)).xyz;');
  sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
  varying vec3 vTw;float th(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float tn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(th(i),th(i+vec2(1,0)),f.x),mix(th(i+vec2(0,1)),th(i+vec2(1,1)),f.x),f.y);}`)
  .replace('#include <color_fragment>',`#include <color_fragment>
  {vec2 p=vTw.xz;float fw=length(fwidth(p));
   float fs=1.-smoothstep(.006,.02,fw);float fc=1.-smoothstep(.02,.07,fw);
   float sp=tn(p*42.)*.6+tn(p*97.)*.4;diffuseColor.rgb*=1.-.16*smoothstep(.66,.7,sp)*fs;diffuseColor.rgb*=1.+.07*smoothstep(.3,.26,sp)*fs;
   float msk=smoothstep(.68,.8,tn(p*1.1+9.3));float r=abs(tn(p*9.+tn(p*2.3)*1.6)-.5);diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*.5,(1.-smoothstep(.01,.022,r))*fc*msk*.75);
   float band=tn(p*3.1+1.7);diffuseColor.rgb*=.94+.12*smoothstep(.45,.55,band);}`);};
  mat.customProgramCacheKey=()=>'terrainDetail';mat.needsUpdate=true;}

// ------------------------------------------------------------------ layers & UI
const layerOn={sites:true,meta:false,taxa:false,field:false,photos:false,rivers:true,habitat:false,life:true,landmarks:true};
function applyLayers(){
  groups.sites.visible=layerOn.sites;groups.meta.visible=layerOn.meta;groups.taxa.visible=layerOn.taxa&&document.getElementById('critters').checked;
  groups.field.visible=layerOn.field;groups.photos.visible=layerOn.photos;groups.rivers.visible=layerOn.rivers;groups.life.visible=layerOn.life;
  const ca=geo.attributes.color;ca.array.set(layerOn.habitat?colHab:colBase);ca.needsUpdate=true;recolorTiles();
  document.querySelectorAll('.chip').forEach(c=>c.classList.toggle('on',!!layerOn[c.dataset.layer]));
  document.getElementById('metaOpts').classList.toggle('hidden',!layerOn.meta);
  document.getElementById('taxaOpts').classList.toggle('hidden',!layerOn.taxa);
  document.getElementById('fieldOpts').classList.toggle('hidden',!layerOn.field);
  if(layerOn.meta&&!metaCols.length)rebuildMeta();
  if(layerOn.taxa&&!taxaLabels.length)rebuildTaxa();
  updateLegend();
}
document.querySelectorAll('.chip').forEach(c=>c.addEventListener('click',()=>{const k=c.dataset.layer;layerOn[k]=!layerOn[k];applyLayers();}));
document.getElementById('allOn').onclick=()=>{Object.keys(layerOn).forEach(k=>layerOn[k]=true);applyLayers();};
document.getElementById('allOff').onclick=()=>{Object.keys(layerOn).forEach(k=>layerOn[k]=false);applyLayers();};
selVar.onchange=rebuildMeta;document.getElementById('metaYear').onchange=rebuildMeta;
document.getElementById('taxaLevel').onchange=rebuildTaxa;document.getElementById('critters').onchange=applyLayers;
document.querySelectorAll('.fy').forEach(x=>x.onchange=updateFieldVis);
const gotoSel=document.getElementById('goto');SITES.forEach(s=>{const o=document.createElement('option');o.value=s.c;o.textContent=`${s.c.replace('CHCa','CHC↑')} · ${s.n}`;gotoSel.appendChild(o);});
[...POIS,POI_CANICHE].forEach(o=>{const op=document.createElement('option');op.value='poi:'+o.id;op.textContent='★ '+o.title;gotoSel.appendChild(op);});
gotoSel.onchange=()=>{const v=gotoSel.value;if(v.startsWith('poi:')){const o=[...POIS,POI_CANICHE].find(q=>'poi:'+q.id===v);if(o)openInfo(o);return;}const s=byCode[v];if(s)selectSite(s);};
document.getElementById('mobtoggle').onclick=()=>document.getElementById('layers').classList.toggle('open');

const legend=document.getElementById('legend');let legendMin=innerWidth<760;
function rampCss(stops,mn,mx){return 'linear-gradient(90deg,'+stops.map(s=>`${s[1]} ${((s[0]-mn)/(mx-mn)*100).toFixed(0)}%`).join(',')+')';}
function updateLegend(){
  let h='<div class="lg-t">HÁBITATS</div>'+Object.values(HAB).map(v=>`<span class="sw"><i style="background:${v.c}"></i>${v.n}</span>`).join('');
  if(layerOn.rivers||layerOn.field||(layerOn.meta&&selVar.value==='pH'))h+=`<div class="lg-t">pH ${layerOn.field?'(ríos y sonda)':'(ríos)'}</div><div class="ramp" style="background:${rampCss(PH_STOPS,0,8.5)}"></div><div class="rl"><span>0 ácido</span><span>2</span><span>4</span><span>6</span><span>8 neutro+</span></div>`;
  if(layerOn.meta&&selVar.value!=='pH'){const v=META_VARS.find(q=>q[0]===selVar.value);h+=`<div class="lg-t">COLUMNAS: ${v[1].toUpperCase()} ${v[2]?'('+v[2]+')':''}${v[3]?' · escala log':''}</div><div class="ramp" style="background:${rampCss(HEAT,0,1)}"></div><div class="rl"><span>bajo</span><span>alto</span></div>`;}
  if(layerOn.taxa){const lv=document.getElementById('taxaLevel').value;const names=new Set();SITES.filter(s=>s.taxa).forEach(s=>taxaParts(s.taxa,lv).forEach(p=>names.add(p[0])));
    h+=`<div class="lg-t">TAXA (${lv==='genus'?'género':lv==='phylum'?'filo':'dominio'}, % de lecturas · 2019)</div>`+[...names].map(n=>`<span class="sw"><i style="background:${gcol(n)}"></i><em>${n}</em></span>`).join('');}
  legend.innerHTML=`<button class="btn sm" id="lgT" style="position:absolute;right:6px;top:6px">${legendMin?'▴':'▾'}</button>`+(legendMin?'<div class="lg-t" style="margin-right:30px">LEYENDA</div>':h);document.getElementById('lgT').onclick=()=>{legendMin=!legendMin;updateLegend();};
}

// ------------------------------------------------------------------ side panel
const side=document.getElementById('side');let selected=null;
const UNITS={'Temp.[ºC]':'°C','ORP[mV]':'mV','mV[pH]':'mV','EC[µS/cm]':'µS/cm','EC Abs.[µS/cm]':'µS/cm','RES[Ohm-cm ]':'Ω·cm','TDS [ppm]':'ppm','Sal.[psu]':'psu','Press.[psi]':'psi','D.O.[%]':'%','D.O.[ppm]':'ppm','Turb.FNU':'FNU'};
const NAMES={'Temp.[ºC]':'Temperatura','pH':'pH','mV[pH]':'mV (pH)','ORP[mV]':'ORP','EC[µS/cm]':'Conductividad','EC Abs.[µS/cm]':'Conduct. abs.','RES[Ohm-cm ]':'Resistividad','TDS [ppm]':'TDS','Sal.[psu]':'Salinidad','Press.[psi]':'Presión','D.O.[%]':'O₂ disuelto','D.O.[ppm]':'O₂ disuelto','Turb.FNU':'Turbidez'};
const PHYS=Object.keys(NAMES),ELEM=['SO4','Cl-','Mg','Ca','Fe','Al','Na','K','Mn','Sr','Zn','As','Li','V','Cu','Ni','Cr','Co'];
function selectSite(s){
  selected=s;const hb=HAB[s.hab];
  side.style.setProperty('--c',hb.c);
  document.getElementById('sTitle').textContent=`${s.c.replace('_','–').replace('CHCa','CHC↑')} · ${s.n}`;
  const alt=s.samples.find(m=>m.alt_lit)?.alt_lit;
  document.getElementById('sMeta').innerHTML=`${hb.n} · ${Math.abs(s.lat).toFixed(4)}°S ${Math.abs(s.lon).toFixed(4)}°O${alt?` · ${alt} m s.n.m. (lit.)`:''} · ID ${s.sid}${s.approx?' · ⚠ ubicación aproximada':''}`;
  let h='';
  if(s.photo&&PHOTOS[s.photo])h+=`<div class="photo"><img id="sImg" alt="${s.n}"><span class="cred">📷 ${CRED[s.photo]||''}</span><button class="btn sm pbtn" id="sImgT">VER ORIGINAL</button></div>`;
  else h+=`<div class="warn">📷 No hay foto de este sitio en la presentación.</div>`;
  if(s.note)h+=`<div class="warn">⚠ ${s.note}</div>`;
  if(s.lab)h+=`<div class="kpi" style="margin:8px 0;font-size:12.5px;font-weight:400;background:#eaf7ff">🔬 ${s.lab}</div>`;
  // KPIs
  const last=s.samples.filter(m=>m.v.pH!==undefined).slice(-1)[0];
  if(last)h+=`<div class="kpis"><div class="kpi"><b style="color:${rgbCss(phColor(last.v.pH))};-webkit-text-stroke:1px #1d1a2b">${last.v.pH.toFixed(2)}</b><span>pH ${last.year}</span></div><div class="kpi"><b>${fmt(last.v['Temp.[ºC]'])}°</b><span>°C ${last.year}</span></div><div class="kpi"><b>${fmt(last.v['EC[µS/cm]'])}</b><span>µS/cm</span></div>${s.taxa?`<div class="kpi"><b>${s.taxa.shannon.toFixed(2)}</b><span>Shannon</span></div>`:''}</div>`;
  // metadata table
  const sm=s.samples.filter(m=>Object.keys(m.v).length);
  if(sm.length){
    h+=`<h4>METADATA FISICOQUÍMICA</h4><table class="t"><thead><tr><th>Variable</th>${sm.map(m=>`<th>${m.year}${/,/.test(m.name)?'<br><small>'+m.name.split(',').pop().trim()+'</small>':''}</th>`).join('')}</tr></thead><tbody>`;
    PHYS.forEach(k=>{if(sm.some(m=>m.v[k]!==undefined))h+=`<tr><td>${NAMES[k]} <small>${UNITS[k]||''}</small></td>${sm.map(m=>`<td>${m.v[k]!==undefined?fmt(m.v[k]):'–'}</td>`).join('')}</tr>`;});
    h+=`<tr><td>Fecha</td>${sm.map(m=>`<td>${m.date||'–'}</td>`).join('')}</tr></tbody></table>`;
    if(sm.some(m=>ELEM.some(k=>m.v[k]!==undefined))){
      h+=`<h4>ELEMENTOS (mg/L)</h4><table class="t"><thead><tr><th>Elem.</th>${sm.map(m=>`<th>${m.year}</th>`).join('')}</tr></thead><tbody>`;
      ELEM.forEach(k=>{if(sm.some(m=>m.v[k]))h+=`<tr><td>${k.replace('SO4','SO₄²⁻').replace('Cl-','Cl⁻')}</td>${sm.map(m=>`<td>${m.v[k]!==undefined?fmt(m.v[k]):'n.d.'}</td>`).join('')}</tr>`;});
      h+=`</tbody></table><div class="note">SO₄²⁻ y Cl⁻ solo se midieron en 2019 (n.d. en 2020). Se omiten los elementos no detectados.</div>`;
    }
  } else h+=`<div class="warn">Sin fisicoquímica en Metadata.xlsx para este sitio.</div>`;
  // taxa
  if(s.taxa){const t=s.taxa;
    h+=`<h4>COMUNIDAD MICROBIANA (METAGENOMA 2019)</h4>`;
    h+=`<div class="kpis"><div class="kpi"><b>${(t.total_reads/1e6).toFixed(1)} M</b><span>lecturas asignadas</span></div><div class="kpi"><b>${t.evenness.toFixed(2)}</b><span>uniformidad</span></div>${t.mags?`<div class="kpi"><b>${t.mags.bins}</b><span>bins (HQ ${t.mags.HQ} · MQ ${t.mags.MQ})</span></div>`:''}</div>`;
    h+=`<div style="font-weight:700;font-size:12px">Dominios</div><div class="stack">${Object.entries(t.domain).sort((a,b)=>b[1]-a[1]).map(([n,v])=>`<i title="${n} ${v.toFixed(2)}%" style="width:${v}%;background:${gcol(n)}"></i>`).join('')}</div>`;
    h+=`<div class="note">${Object.entries(t.domain).sort((a,b)=>b[1]-a[1]).map(([n,v])=>`<span style="color:${gcol(n)};-webkit-text-stroke:.3px #1d1a2b">■</span> ${n} ${v.toFixed(v<1?2:1)}%`).join(' · ')}</div>`;
    const mx=t.genus[0][1];
    h+=`<div style="font-weight:700;font-size:12px;margin-top:8px">Géneros más abundantes (% del total de lecturas)</div>`+t.genus.slice(0,10).map(g=>`<div class="bar"><span class="n">${g[0]}</span><span class="b"><i style="width:${(g[1]/mx*100).toFixed(1)}%;background:${gcol(g[0])}"></i></span><span class="v">${g[1]<.1?g[1].toFixed(3):g[1].toFixed(2)}%</span></div>`).join('');
    const ph=Object.entries(t.phylum).sort((a,b)=>b[1]-a[1]).slice(0,5);
    h+=`<div style="font-weight:700;font-size:12px;margin-top:8px">Filos</div><div class="stack">${ph.map(([n,v])=>`<i title="${n} ${v.toFixed(1)}%" style="width:${v}%;background:${gcol(n)}"></i>`).join('')}</div><div class="note">${ph.map(([n,v])=>`${n} ${v.toFixed(1)}%`).join(' · ')}</div>`;
    const ac=Object.entries(t.acidithio).filter(([n,v])=>v>0&&n!=='Acidithiobacillus').sort((a,b)=>b[1]-a[1]);
    if(ac.length&&ac[0][1]>1000)h+=`<div style="font-weight:700;font-size:12px;margin-top:8px">Especies de Acidithiobacillia (lecturas)</div><div class="note">${ac.slice(0,6).map(([n,v])=>`<i>${n}</i> ${v.toLocaleString('es-CL')}`).join(' · ')}</div>`;
  } else h+=`<h4>COMUNIDAD MICROBIANA</h4><div class="warn">No hay datos taxonómicos para este sitio en los archivos: el metagenoma cubre 11 sitios de 2019 y las muestras 2020 estaban en procesamiento.</div>`;
  // field readings near
  const near=FIELD.filter(f=>{const p=P(f.lat,f.lon);return Math.hypot(p[0]-s.x,p[1]-s.z)<.35;});
  if(near.length){const byY={};near.forEach(f=>{(byY[f.d.slice(-4)]=byY[f.d.slice(-4)]||[]).push(f);});
    h+=`<h4>LECTURAS DE SONDA (&lt;350 m)</h4><table class="t"><thead><tr><th>Año</th><th>n</th><th>pH</th><th>T °C</th><th>Rótulos</th></tr></thead><tbody>`+
      Object.entries(byY).map(([y,a])=>{const ph=a.map(f=>f.ph).filter(v=>v>0),T=a.map(f=>f.T).filter(v=>v<130);return `<tr><td>${y}</td><td>${a.length}</td><td>${Math.min(...ph).toFixed(2)}–${Math.max(...ph).toFixed(2)}</td><td>${T.length?Math.min(...T).toFixed(1)+'–'+Math.max(...T).toFixed(1):'–'}</td><td style="text-align:left">${[...new Set(a.map(f=>f.n))].join(', ')}</td></tr>`;}).join('')+`</tbody></table><div class="note">No se consideran las lecturas con T ≥ 130 °C (posible saturación del sensor) ni con pH = 0.</div>`;}
  document.getElementById('sBody').innerHTML=h;
  if(s.photo&&PHOTOS[s.photo]){const im=document.getElementById('sImg');let orig=false;
    comicify(PHOTOS[s.photo],760,r=>{if(selected===s&&!orig)im.src=r.url;});
    document.getElementById('sImgT').onclick=()=>{orig=!orig;if(orig){im.src=PHOTOS[s.photo];}else comicify(PHOTOS[s.photo],760,r=>im.src=r.url);document.getElementById('sImgT').textContent=orig?'VER CÓMIC':'VER ORIGINAL';};}
  side.classList.add('open');side.scrollTop=0;
  flyTo(new THREE.Vector3(s.x,s.y,s.z),Math.min(camera.position.distanceTo(controls.target),9),null);
  burst(s);
}
document.getElementById('sClose').onclick=()=>{side.classList.remove('open');selected=null;};

// comic "POW" burst on select
function burst(s){const el=document.createElement('div');el.className='lbl';el.style.cssText='font:34px Bangers,Impact;color:#ffd23f;-webkit-text-stroke:2px #1d1a2b;text-shadow:3px 3px 0 #1d1a2b;transition:opacity .9s,transform .9s';
  el.textContent=['¡POW!','¡ZAS!','¡BAM!','¡PLOP!'][Math.floor(Math.random()*4)];labelsEl.appendChild(el);
  const L={el,getPos:()=>new THREE.Vector3(s.x,s.y+1.4*SF,s.z),layer:'always',dx:0,dy:0,minD:0,maxD:1e9};LBL.push(L);
  setTimeout(()=>{el.style.opacity=0;},500);setTimeout(()=>{el.remove();LBL.splice(LBL.indexOf(L),1);},1500);}

// ------------------------------------------------------------------ camera moves
let tween=null;
function flyTo(target,dist,polar,dur=1.3){
  const off=camera.position.clone().sub(controls.target);const sph=new THREE.Spherical().setFromVector3(off);
  if(dist)sph.radius=dist;if(polar!==null&&polar!==undefined)sph.phi=polar;
  const endPos=target.clone().add(new THREE.Vector3().setFromSpherical(sph));endPos.y=Math.max(endPos.y,heightAt(endPos.x,endPos.z)+2.5,target.y+2.5);
  tween={start:performance.now(),dur,p0:camera.position.clone(),t0:controls.target.clone(),p1:endPos,t1:target.clone()};
}
const allCenter=new THREE.Vector3(X0+W/2,1.5,Z0+D/2);
document.getElementById('vTop').onclick=()=>flyTo(controls.target.clone(),Math.max(camera.position.distanceTo(controls.target),14),.0001);
document.getElementById('v3d').onclick=()=>flyTo(controls.target.clone(),null,.95);
document.getElementById('vAll').onclick=()=>flyTo(allCenter,62,.75);
const spinBtn=document.getElementById('vSpin');spinBtn.onclick=()=>{controls.autoRotate=!controls.autoRotate;spinBtn.classList.toggle('on',controls.autoRotate);};
let riverTour=null;
document.getElementById('vRiver').onclick=()=>{
  const path=[...RIVERS[0].P,...RIVERS[2].P].map(p=>new THREE.Vector3(p.x,Y(p.e),p.z));riverTour={curve:new THREE.CatmullRomCurve3(path),t:0,start:performance.now()};
  side.classList.remove('open');
};

// ------------------------------------------------------------------ picking / tooltip
const ray=new THREE.Raycaster();const mouse=new THREE.Vector2();const tip=document.getElementById('tip');
let downAt=null;
canvas.addEventListener('pointerdown',e=>{downAt=[e.clientX,e.clientY];tween=null;riverTour=null;});
canvas.addEventListener('pointerup',e=>{if(!downAt)return;const moved=Math.hypot(e.clientX-downAt[0],e.clientY-downAt[1]);downAt=null;if(moved>6)return;
  setMouse(e);ray.setFromCamera(mouse,camera);
  const hits=ray.intersectObjects(pickables.filter(o=>visibleDeep(o)),false);
  if(hits.length){const s=hits[0].object.userData.site;if(s)selectSite(s);}});
function visibleDeep(o){while(o){if(!o.visible)return false;o=o.parent;}return true;}
function setMouse(e){mouse.x=e.clientX/innerWidth*2-1;mouse.y=-(e.clientY/innerHeight)*2+1;}
canvas.addEventListener('pointermove',e=>{
  if(downAt)return;setMouse(e);ray.setFromCamera(mouse,camera);let shown=false;
  if(layerOn.field&&fieldPts){ray.params.Points.threshold=.03*SF*3;const h=ray.intersectObject(fieldPts);const vis=fieldPts.geometry.attributes.vis;
    const hh=h.find(q=>vis.getX(q.index)>.5);
    if(hh){const f=fieldIdx[hh.index];tip.innerHTML=`🌡️ <b>${f.n}</b> · ID ${f.id}<br>${f.d} ${f.t}<br>pH <b>${f.ph.toFixed(2)}</b> · ${f.T.toFixed(1)} °C${f.T>=130?' ⚠ posible saturación del sensor':''}${f.ph===0?' ⚠ pH 0 (lectura dudosa)':''}`;shown=true;}}
  if(!shown){const hits=ray.intersectObjects(pickables.filter(o=>visibleDeep(o)),false);if(hits.length&&hits[0].object.userData.site){const s=hits[0].object.userData.site;tip.innerHTML=`<b>${s.c}</b> · ${s.n}<br><small>clic para ver la ficha</small>`;shown=true;canvas.style.cursor='pointer';}else canvas.style.cursor='';}
  tip.style.display=shown?'block':'none';if(shown){tip.style.left=Math.min(e.clientX+14,innerWidth-270)+'px';tip.style.top=(e.clientY+14)+'px';}
});

// ------------------------------------------------------------------ about
const about=document.getElementById('about');document.getElementById('aboutImg').src=PHOTOS.VIEW||'';
document.getElementById('aboutBtn').onclick=()=>about.classList.add('open');
document.getElementById('aboutClose').onclick=()=>about.classList.remove('open');
about.addEventListener('click',e=>{if(e.target===about)about.classList.remove('open');});

// ------------------------------------------------------------------ animation loop
const clock=new THREE.Clock();const v3=new THREE.Vector3();
// line of sight from the camera to a point, against the terrain (labels hide behind mountains)
let losFrame=0;const _lp=new THREE.Vector3();
let OGRID=null;const OC=.5;function occGrid(){if(OGRID)return OGRID;OGRID=new Map();const add=(x,z,r,top)=>{const k=Math.floor(x/OC)+','+Math.floor(z/OC);let a=OGRID.get(k);if(!a)OGRID.set(k,a=[]);a.push([x,z,r,top]);};
  (window.TREELIST||[]).forEach(t=>{const e=t.m.elements;const sy=Math.hypot(e[4],e[5],e[6]),sx=Math.hypot(e[0],e[1],e[2]);const top=e[13]+(t.kind==='young'?.2:t.kind==='round'?.2:.33)*sy;add(e[12],e[14],(t.kind==='round'?.06:.05)*sx,top);});
  (window.OCCL||[]).forEach(o=>add(o[0],o[1],o[2],o[3]));return OGRID;}
function los(x,y,z){const C=camera.position;const dx=x-C.x,dy=y-C.y,dz=z-C.z,L=Math.hypot(dx,dz);const n=Math.max(6,Math.min(40,Math.ceil(L*3)));const G=occGrid();
  for(let i=1;i<n;i++){const t=i/n;if(t>.94)break;const px=C.x+dx*t,pz=C.z+dz*t,py=C.y+dy*t;if(heightAt(px,pz)>py+.015)return false;
    if(L*(1-t)>.12){const a=G.get(Math.floor(px/OC)+','+Math.floor(pz/OC));if(a)for(const o of a){if(py<o[3]&&(px-o[0])**2+(pz-o[1])**2<o[2]*o[2])return false;}}}return true;}
function losCached(el,x,y,z){if(el._losF==null||(losFrame-el._losF)>=4||Math.abs((el._losX||0)-x)>.05){el._losF=losFrame-(Math.random()*3|0);el._losX=x;el._los=los(x,y,z);}return el._los;}
function updateLabels(){losFrame++;
  const dist=camera.position.distanceTo(controls.target);const w=innerWidth,h=innerHeight;
  const sc=clamp(1.15-dist/110,.62,1.1);
  for(const L of LBL){
    const on=L.layer==='always'||(layerOn[L.layer]&&(L.layer!=='taxa'||true));
    if(!on||dist<L.minD||dist>L.maxD){if(L.el.style.display!=='none')L.el.style.display='none';continue;}
    v3.copy(L.getPos()).project(camera);
    if(v3.z>1||v3.x<-1.2||v3.x>1.2||v3.y<-1.2||v3.y>1.2){if(L.el.style.display!=='none')L.el.style.display='none';continue;}
    {const p=L.getPos();if(L.layer!=='always'&&!losCached(L.el,p.x,p.y,p.z)){if(L.el.style.display!=='none')L.el.style.display='none';continue;}}
    if(L.el.style.display==='none')L.el.style.display='';
    const x=(v3.x*.5+.5)*w,y=(-v3.y*.5+.5)*h;
    const k=L.layer==='sites'?clamp(18/dist,0,1):L.layer==='taxa'?clamp(14/dist,0,1):0;
    L.el.style.transform=`translate(-50%,-100%) translate(${(x+L.dx*k).toFixed(1)}px,${(y+L.dy*k).toFixed(1)}px) scale(${sc.toFixed(3)})`;
    L.el.style.zIndex=String(1000-Math.round(v3.z*1000));
  }
}
function animate(){
  requestAnimationFrame(animate);
  const rawDt=clock.getDelta(),dt=Math.min(rawDt,.05),t=clock.elapsedTime;gfxFrame(rawDt);postMat.uniforms.time.value=t;WIND.time.value=t;
  const GA=window.GAME&&GAME.active;
  if(tween&&!GA){tween.t=Math.min(1,(performance.now()-tween.start)/1000/tween.dur);const k=tween.t>=1?1:(tween.t<.5?4*tween.t**3:1-Math.pow(-2*tween.t+2,3)/2);
    camera.position.lerpVectors(tween.p0,tween.p1,k);controls.target.lerpVectors(tween.t0,tween.t1,k);if(tween.t>=1)tween=null;}
  if(riverTour&&!GA){riverTour.t=(performance.now()-riverTour.start)/1000*.018;if(riverTour.t>=1)riverTour=null;else{const p=riverTour.curve.getPointAt(riverTour.t),q=riverTour.curve.getPointAt(Math.min(1,riverTour.t+.03));
    controls.target.lerp(p,.08);const dir=q.clone().sub(p).setY(0).normalize();const cp=p.clone().add(dir.multiplyScalar(-3.2)).add(new THREE.Vector3(0,2.6,0));camera.position.lerp(cp,.05);}}
  if(GA)GAME.tick(dt,t);else controls.update();
  {const gy=heightAt(camera.position.x,camera.position.z)+(camera.near<.01?.03:.35);if(camera.position.y<gy)camera.position.y=gy;}  // first person (near .004) keeps its eye height
  const dist=camera.position.distanceTo(controls.target);SF=clamp(dist/16,.35,3.2);
  SITES.forEach(s=>{s.pin.scale.setScalar(SF);s.head.position.y=.6+Math.sin(t*2.4+s.x)*.03;});
  metaCols.forEach(c=>{const m=c.mesh,u=m.userData;u.cur+=(u.target*SF*.6-u.cur)*Math.min(1,dt*6);m.scale.set(.1*SF,u.cur,.1*SF);m.position.x=u.site.x+u.off*SF;});
  photoSprites.forEach(sp=>{const s=sp.userData.site;const sc=1.25*SF;sp.scale.set(sc,sc*sp.userData.asp,1);sp.position.set(s.x+(s.lo[0]/40)*.9*SF,s.y+1.55*SF,s.z+(s.lo[1]/40)*.6*SF);});
  if(groups.taxa.visible)critters.forEach(c=>{const u=c.userData;c.visible=Math.abs(u.s.x-camera.position.x)+Math.abs(u.s.z-camera.position.z)<(window.GAME&&GAME.active?5:40);if(!c.visible)return;const a=t*u.sp+u.ph;const r=u.r*SF;c.position.set(u.s.x+Math.cos(a)*r,u.s.y+u.h*SF+Math.sin(t*3+u.ph)*.03*SF,u.s.z+Math.sin(a)*r);
    c.rotation.y=-a-(u.sp>0?Math.PI/2:-Math.PI/2);c.scale.setScalar(SF*2);if(u.fl)u.fl.rotation.y=Math.sin(t*14+u.ph)*.6;});
  if(groups.life.visible){
    clouds.forEach(c=>{c.position.x+=c.userData.sp*dt;if(c.position.x>X1+4)c.position.x=X0-4;c.visible=!(window.REAL&&REAL.on)&&c.position.distanceTo(camera.position)>6&&camera.position.y<c.position.y-1.5;});
    steam.forEach(s=>{const u=s.userData;const ph=(t*.28+u.ph)%1;s.position.set(u.x+Math.sin(ph*5+u.ph*9)*.12,u.y+.1+ph*1.6*u.sz,u.z);const sc=(.08+ph*.4)*u.sz*clamp(SF,.5,1.6);s.scale.set(sc,sc,1);s.material.opacity=.95*(1-ph);});
    updateFauna(t,dt);updateCaniche(t);
    cars.forEach(c=>{c.t=(c.t+c.sp*dt+1)%1;const p=c.road.getPointAt(c.t),q=c.road.getPointAt((c.t+.002*Math.sign(c.sp)+1)%1);c.g.position.copy(p);c.g.lookAt(q);c.g.rotateY(-Math.PI/2);c.g.scale.setScalar(GA?2.2:clamp(SF,.7,2.4));});
    birds.forEach(b=>{const u=b.userData;const a=t*u.sp+u.ph;b.position.set(u.c[0]+Math.cos(a)*u.r,u.h+Math.sin(t*.7+u.ph)*.3,u.c[1]+Math.sin(a)*u.r);b.rotation.y=-a;b.rotation.z=.25;
      const fl=Math.sin(t*6+u.ph)*.35;u.w1.rotation.x=fl;u.w2.rotation.x=-fl;b.scale.setScalar(clamp(SF*.8,.8,2.4));});
  }
  waterMats.forEach(m=>m.uniforms.time.value=t);if(saltoTex)saltoTex.offset.y=-t*1.4;riverMats.forEach(m=>m.uniforms.time.value=t);
  updateLOD();const gfxMoved=gfxBeforeRender();const RL=!!(window.REAL&&REAL.frame(dt,t));renderer.setRenderTarget(rt);renderer.render(scene,camera);if(window.FPG&&FPG.render)FPG.render(renderer,camera);renderer.setRenderTarget(null);gfxAfterRender(gfxMoved);if(RL)REAL.post();else renderer.render(postScene,postCam);if(window.__afterRender)window.__afterRender();
  updateLabels();
}

// ------------------------------------------------------------------ boot
function boot(){
  buildTerrain();
  terrain=new THREE.Mesh(geo,new THREE.MeshToonMaterial({vertexColors:true,gradientMap:gradTex}));groups.static.add(terrain);
  try{buildSalto();}catch(e){console.warn('salto',e);}
  buildSlab();buildLakes();buildRivers();buildRoads();buildCars();buildTrees();
  buildTown([-37.8685,-71.0585],60,.42);buildCaviahueExtras();buildTown([-37.8212,-71.0985],32,.33);
  buildRuka(-37.8105,-71.1795);buildRuka(-37.8915,-71.0735,5);buildTermas();buildSolfataras();buildLife();buildFauna();buildCaniche();buildSites();buildLandmarks();buildCritters();buildField();buildPhotos();
  buildTerrainTiles();{const an=Math.min(8,renderer.capabilities.getMaxAnisotropy());scene.traverse(o=>{const m=o.material;if(m&&!Array.isArray(m)&&m.map&&m.map.isTexture){m.map.anisotropy=an;m.map.needsUpdate=true;}});}mergeStatic();resize();applyLayers();applyGfx(true);
  {const gb=document.getElementById('gfx-btn');if(gb)gb.onclick=cycleGfx;addEventListener('keydown',e=>{if(e.code==='KeyG'&&!/INPUT|TEXTAREA|SELECT/.test((e.target&&e.target.tagName)||''))cycleGfx();});}
  const ld=document.getElementById('loader');ld.style.opacity=0;setTimeout(()=>ld.remove(),600);
  animate();
  window.WORLD={animals,birds,lakeSdf,los,losCached,rt,get terrain(){return terrain;},clouds,waterMats,riverMats,Q,steam,get TREELIST(){return window.TREELIST||[];},phColor,GFX,cycleGfx,WIND,winMat,LAKES,hemi,sun,postMat,scene,camera,controls,renderer,heightAt,infoAt,P,Y,SITES,byCode,LAKES,lakeSdf,nearestRiver,roadPaths,RIVERS,groups,toon,gradTex,TAXA,SMP,FIELD,PHOTOS,X0,X1,Z0,Z1,CRATER,VOLC,get caniche(){return caniche},gcol,HAB,phColor,rgbCss,layerOn,applyLayers};
  if(window.onWorldReady)window.onWorldReady();
  window.__ready=true;window.__cam=()=>{if(caniche){tween=null;controls.target.copy(caniche.position);camera.position.copy(caniche.position).add(new THREE.Vector3(.5,.35,.5));}};window.__look=(lat,lon,d,pol)=>{const q=P(lat,lon);flyTo(new THREE.Vector3(q[0],heightAt(q[0],q[1]),q[1]),d,pol,.01);};window.__dbg=()=>({photos:photoSprites.length,vis:groups.photos.visible,sp:photoSprites.slice(0,2).map(p=>[p.position.toArray(),p.scale.toArray()])});
}
setTimeout(()=>{try{boot();}catch(err){document.querySelector('#loader .boom small').textContent='Error: '+err.message;console.error(err);}},60);
})();
