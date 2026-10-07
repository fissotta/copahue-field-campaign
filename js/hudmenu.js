/* Menú plegable: el cartel amarillo (#g-top) abre/cierra los botones laterales al pasar el mouse.
   En pantallas táctiles, tocar el cartel alterna el menú (se cierra solo a los 7 s). */
(function(){
'use strict';
const B=document.body,top=document.querySelector('#g-top');if(!top)return;
const h=document.createElement('span');h.className='hm';h.textContent='☰ MENU';top.appendChild(h);
top.title='Menú (pasa el mouse por aquí)';
const SEL=['#g-top','#g-snd','#gfx-btn','#g-chr','#g-look','#xa-bar','#look-btn','#g-side','#g-radio'];
let tm=0;
const open=()=>{clearTimeout(tm);B.classList.add('hudm');};
const closeSoon=(ms)=>{clearTimeout(tm);tm=setTimeout(()=>B.classList.remove('hudm'),ms||650);};
SEL.forEach(s=>{const e=document.querySelector(s);if(!e)return;e.addEventListener('mouseenter',open);e.addEventListener('mouseleave',()=>closeSoon());});
/* #xa-bar y #look-btn los crea game.js; por si se montan después, delegamos */
document.addEventListener('mouseover',e=>{if(e.target.closest&&e.target.closest('#xa-bar,#look-btn'))open();});
document.addEventListener('mouseout',e=>{if(e.target.closest&&e.target.closest('#xa-bar,#look-btn'))closeSoon();});
top.addEventListener('click',()=>{if(B.classList.contains('hudm')){clearTimeout(tm);B.classList.remove('hudm');}else{open();closeSoon(7000);}});
const rh=document.querySelector('#g-radio .rd-h');if(rh)rh.addEventListener('click',()=>document.querySelector('#g-radio').classList.toggle('open'));
})();
