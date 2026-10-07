"""Genera data/sky/sky_stars.webp (mapa equirectangular RA/Dec 4096x2048) para el cielo nocturno del juego.
Datos: paquete npm `d3-celestial` (Olaf Frohn, BSD-3; estrellas Hipparcos mag<6). Uso:
  npm pack d3-celestial && mkdir pkg && tar xzf d3-celestial-*.tgz -C pkg
  (ajusta D y O abajo) && python3 -I bake_sky.py
Solo se usa el archivo de estrellas; las líneas de constelaciones y etiquetas se generan pero no se usan en el juego."""
import json, math, numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter
D='/tmp/claude-0/sky/pkg/package/data/'
O='/tmp/claude-0/sky/out/'
W,H=4096,2048
rng=np.random.default_rng(7)
def ld(n): return json.load(open(D+n))
def px(ra,dec): return (ra%360)/360*W, (90-dec)/180*H   # row 0 = dec +90 (flipY in three => v=(dec+90)/180)
# ---------------- stars
stars=ld('stars.6.json')['features']
img=np.zeros((H,W,3),np.float32)
def bv2rgb(bv):
    t=max(-.4,min(2.0,bv))
    # blue-white -> white -> yellow -> orange -> red
    pts=[(-.4,(.62,.72,1.)),(0.,(.8,.87,1.)),(.45,(1.,.97,.92)),(.8,(1.,.88,.68)),(1.3,(1.,.74,.5)),(2.,(1.,.55,.38))]
    for (a,ca),(b,cb) in zip(pts,pts[1:]):
        if t<=b:
            f=(t-a)/(b-a);return tuple(ca[i]*(1-f)+cb[i]*f for i in range(3))
    return pts[-1][1]
for s in stars:
    ra,dec=s['geometry']['coordinates'];mag=s['properties']['mag'];bv=s['properties'].get('bv');bv=float(bv) if bv not in (None,'') else .6
    amp=min(1.8,.20*10**(.17*(6-mag)))
    sig=min(2.4,.62+.2*(6-mag)*.55)
    cd=max(math.cos(math.radians(dec)),.07)
    sx=sig/cd; sy=sig
    x0,y0=px(ra,dec)
    rx=int(math.ceil(3.2*sx)); ry=int(math.ceil(3.2*sy))
    xs=np.arange(int(x0)-rx,int(x0)+rx+1); ys=np.arange(int(y0)-ry,int(y0)+ry+1)
    ysm=(ys>=0)&(ys<H); ys=ys[ysm]
    if len(ys)==0: continue
    g=np.exp(-((xs[None,:]+.5-x0)**2/(2*sx*sx)+(ys[:,None]+.5-y0)**2/(2*sy*sy)))*amp
    c=np.array(bv2rgb(bv),np.float32)
    xi=xs%W
    img[np.ix_(ys,xi)]+=g[:,:,None]*c[None,None,:]
# bright star halos (soft glow)
for s in stars:
    mag=s['properties']['mag']
    if mag>2.2: continue
    ra,dec=s['geometry']['coordinates'];x0,y0=px(ra,dec);cd=max(math.cos(math.radians(dec)),.07)
    sx=7./cd;sy=7.;rx=int(3*sx);ry=int(3*sy);xs=np.arange(int(x0)-rx,int(x0)+rx+1);ys=np.arange(int(y0)-ry,int(y0)+ry+1);ys=ys[(ys>=0)&(ys<H)]
    if len(ys)==0: continue
    g=np.exp(-((xs[None,:]+.5-x0)**2/(2*sx*sx)+(ys[:,None]+.5-y0)**2/(2*sy*sy)))*.07*(2.4-mag)
    img[np.ix_(ys,xs%W)]+=g[:,:,None]*np.array([.85,.9,1.],np.float32)[None,None,:]
# ---------------- Milky Way (analytic model in galactic coordinates)
ra=(np.arange(W)+.5)/W*360.; dec=90-(np.arange(H)+.5)/H*180.
RA,DEC=np.meshgrid(np.radians(ra),np.radians(dec))
aG=math.radians(192.85948);dG=math.radians(27.12825);lN=math.radians(122.93192)
sb=np.sin(DEC)*math.sin(dG)+np.cos(DEC)*math.cos(dG)*np.cos(RA-aG)
bg=np.degrees(np.arcsin(np.clip(sb,-1,1)))
y=np.cos(DEC)*np.sin(RA-aG);x=np.sin(DEC)*math.cos(dG)-np.cos(DEC)*math.sin(dG)*np.cos(RA-aG)
lg=np.degrees(lN-np.arctan2(y,x));lg=(lg+180)%360-180     # -180..180, 0 = galactic centre
def fbm(shape,scales):
    out=np.zeros(shape,np.float32)
    for s_,a_ in scales:
        n=rng.random((shape[0]//s_+2,shape[1]//s_+2)).astype(np.float32)
        n=np.asarray(Image.fromarray((n*255).astype(np.uint8)).resize((shape[1],shape[0]),Image.BICUBIC),np.float32)/255.
        out+=a_*n
    return out/sum(a_ for _,a_ in scales)
nz=fbm((H,W),[(180,.35),(70,.35),(28,.2),(10,.1)])
disk=np.exp(-(bg/7.5)**2/2)*(.40+.34*np.cos(np.radians(lg)))          # thin disk, brighter toward the centre
core=np.exp(-((lg/22.)**2+(bg/9.)**2)/2)*.95                          # bulge / Sagittarius–Scorpius cloud
carina=np.exp(-(((lg+62)/14.)**2+(bg/5.)**2)/2)*.35                   # Carina–Crux
mwv=(disk+core+carina)*(.55+.9*nz)
rift=np.exp(-(((bg-1.6)/2.0)**2)/2)*np.clip((lg+25)/25,0,1)*np.clip((95-lg)/30,0,1)   # Great Rift (dust lane), l≈0..60
mwv*=1-.62*rift*(.4+.9*nz)
# Coalsack (RA 12h50m, Dec -63)
cs=np.degrees(np.arccos(np.clip(np.sin(DEC)*math.sin(math.radians(-63))+np.cos(DEC)*math.cos(math.radians(-63))*np.cos(RA-math.radians(192.5)),-1,1)))
mwv*=1-.85*np.exp(-(cs/3.2)**2/2)
mwv=np.clip(mwv,0,None).astype(np.float32)
img+=mwv[:,:,None]*np.array([.60,.64,.80],np.float32)[None,None,:]*.27
# unresolved starlight grain inside the band
grain=(rng.random((H,W))<(mwv*.012)).astype(np.float32)*(.25+rng.random((H,W)).astype(np.float32)*.55)
img+=grain[:,:,None]*np.array([.9,.92,1.],np.float32)[None,None,:]
# ---------------- Magellanic Clouds
def blob(ra,dec,sdeg,amp,ar=1.0,pa=0.):
    x0,y0=px(ra,dec);cd=math.cos(math.radians(dec))
    sy=sdeg/180*H;sx=sdeg/360*W/cd
    rx=int(4*sx);ry=int(4*sy);xs=np.arange(int(x0)-rx,int(x0)+rx+1);ys=np.arange(int(y0)-ry,int(y0)+ry+1);ys=ys[(ys>=0)&(ys<H)]
    gg=np.exp(-((xs[None,:]+.5-x0)**2/(2*sx*sx*ar)+(ys[:,None]+.5-y0)**2/(2*sy*sy)))*amp
    n=1+.35*(fbm(gg.shape,[(24,.6),(8,.4)])-.5)
    img[np.ix_(ys,xs%W)]+=(gg*n)[:,:,None]*np.array([.78,.82,.95],np.float32)[None,None,:]
blob(80.9,-69.75,2.2,.30,1.6);blob(80.9,-69.75,.8,.18,1.0)   # LMC (+ bar)
blob(13.2,-72.8,1.1,.26,1.3)                                   # SMC
blob(10.7,41.3,.9,.11,3.0)                                     # Andromeda galaxy (faint)
# ---------------- tone and save
img=np.clip(img,0,None)
img=1-np.exp(-img*1.15)          # soft clip, keeps faint stars faint, bright ones saturating
out=(np.clip(img,0,1)**(1/1.12)*255).astype(np.uint8)
Image.fromarray(out,'RGB').save(O+'sky_stars.webp',lossless=True,quality=100,method=5)
# ---------------- constellation lines (anti-aliased by 2x supersampling)
S=2
L=Image.new('L',(W*S,H*S),0);dr=ImageDraw.Draw(L)
def v3(ra,dec):
    a=math.radians(ra);d=math.radians(dec);return np.array([math.cos(d)*math.cos(a),math.cos(d)*math.sin(a),math.sin(d)])
def seg(a,b):
    va,vb=v3(*a),v3(*b);om=math.acos(max(-1,min(1,float(va@vb))))
    n=max(2,int(math.degrees(om)/.4)+1);pts=[]
    for i in range(n+1):
        t=i/n;
        v=(math.sin((1-t)*om)*va+math.sin(t*om)*vb)/max(math.sin(om),1e-6) if om>1e-6 else va
        ra=math.degrees(math.atan2(v[1],v[0]))%360;dec=math.degrees(math.asin(max(-1,min(1,v[2]))))
        pts.append(((ra/360*W)*S,((90-dec)/180*H)*S))
    run=[pts[0]]
    for p in pts[1:]:
        if abs(p[0]-run[-1][0])>W*S/2:
            if len(run)>1: dr.line(run,fill=255,width=3)
            run=[p]
        else: run.append(p)
    if len(run)>1: dr.line(run,fill=255,width=3)
for f in ld('constellations.lines.json')['features']:
    for line in f['geometry']['coordinates']:
        for a,b in zip(line,line[1:]): seg(a,b)
L=L.resize((W,H),Image.LANCZOS)
L.save(O+'sky_lines.webp',lossless=True,quality=100,method=5)
# ---------------- labels (constellations + bright named stars), Spanish
sp=lambda s:(s or '').replace(' ',' ').replace(' ',' ')
lbl=[]
for f in ld('constellations.json')['features']:
    p=f['properties'];lon,lat=f['geometry']['coordinates']
    if lat>62: continue
    lbl.append(['c',sp(p.get('es') or p.get('en')),round(lon%360,2),round(lat,2)])
names=ld('starnames.json');pos={s['id']:(s['geometry']['coordinates'],s['properties']['mag']) for s in stars}
es={'Sirius':'Sirio','Canopus':'Canopus','Rigil Kentaurus':'Alfa Centauri','Arcturus':'Arturo','Vega':'Vega','Capella':'Capela','Rigel':'Rigel','Procyon':'Proción','Betelgeuse':'Betelgeuse','Achernar':'Achernar','Hadar':'Hadar','Altair':'Altair','Acrux':'Acrux','Aldebaran':'Aldebarán','Antares':'Antares','Spica':'Espiga','Pollux':'Pólux','Fomalhaut':'Fomalhaut','Mimosa':'Mimosa','Regulus':'Régulo','Adhara':'Adhara','Shaula':'Shaula','Gacrux':'Gacrux','Bellatrix':'Bellatrix','Alnilam':'Alnilam','Peacock':'Pavo','Alnair':'Alnair'}
cnt=0
for sid,nm in names.items():
    try:sid=int(sid)
    except:continue
    if sid in pos:
        (ra,dec),mg=pos[sid]
        n=nm.get('name') if isinstance(nm,dict) else nm
        if mg<1.4 and n in es: lbl.append(['s',es[n],round(ra%360,2),round(dec,2)]);cnt+=1
print('stars',len(stars),'labels',len(lbl),'named',cnt)
open(O+'skylabels.js','w',encoding='utf-8').write('/* constelaciones y estrellas (d3-celestial, BSD-3, Olaf Frohn; Hipparcos) */\nwindow.SKYLBL='+json.dumps(lbl,ensure_ascii=False,separators=(',',':'))+';\n')
