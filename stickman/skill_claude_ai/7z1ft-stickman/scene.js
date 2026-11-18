/* 7Z1FT desk scene (inspired by the logo): tower, car, desk with radios / tablet,
   stool, and a director that plays a keyframe script for the character.
   Needs engine.js loaded first. Stage is 1920x1080, floor at y=900. */
const SC={W:1920,H:1080,FLOOR:900,S:1.05,SEAT_X:1648};

/* ---------- held / desk items (drawn in character-native units, origin = grip) ---------- */
function itemRadio(t,tx){
  const led=tx?(Math.sin(t*10)>0?O:'#ff5a3c'):'#2c4a33',scr=tx?O:'#7a5a2a';
  return `<g><rect x="6" y="-130" width="7" height="54" rx="3.5" fill="${D}" stroke="${O}" stroke-width="3"/>
  <rect x="-18" y="-80" width="36" height="82" rx="9" fill="${D}" stroke="${O}" stroke-width="4"/>
  <circle cx="-8" cy="-86" r="4" fill="${led}"/><rect x="-12" y="-70" width="24" height="16" rx="3" fill="${scr}"/>
  ${[0,1,2].map(r=>[0,1,2].map(c=>`<circle cx="${-9+c*9}" cy="${-42+r*10}" r="2.6" fill="${C}" opacity=".85"/>`).join('')).join('')}</g>`;
}
function itemTablet(t,prog){
  const w=Math.max(0,Math.min(1,prog))*92;
  return `<g transform="rotate(-10)"><rect x="-62" y="-44" width="124" height="86" rx="10" fill="${D}" stroke="${O}" stroke-width="5"/>
  <rect x="-54" y="-36" width="108" height="70" rx="4" fill="#123d1c"/>
  <path d="M-38,-2 l10,-14 h40 l12,14 h8 v12 h-78z" fill="${G}" stroke="${O}" stroke-width="2.5"/>
  <circle cx="-22" cy="12" r="5" fill="${C}"/><circle cx="14" cy="12" r="5" fill="${C}"/>
  <rect x="-46" y="20" width="92" height="7" rx="3.5" fill="#0a1a0e"/><rect x="-46" y="20" width="${w}" height="7" rx="3.5" fill="${O}"/></g>`;
}
const ITEMS={radio:itemRadio,tablet:itemTablet};

/* ---------- static scene pieces (stage coords) — layout follows the logo ---------- */
function sceneBg(){
  return `<defs><radialGradient id="scbg" cx=".45" cy=".3" r=".85"><stop offset="0" stop-color="#2f7138"/><stop offset=".65" stop-color="#215a2b"/><stop offset="1" stop-color="#143a1b"/></radialGradient>
  <radialGradient id="glow"><stop offset="0" stop-color="#fff6d8" stop-opacity=".95"/><stop offset="1" stop-color="#fff6d8" stop-opacity="0"/></radialGradient>
  <linearGradient id="gnd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d2212"/><stop offset="1" stop-color="#050c07"/></linearGradient></defs>
  <rect width="1920" height="1080" fill="url(#scbg)"/><rect y="900" width="1920" height="180" fill="url(#gnd)"/>
  <path d="M120,900 H1800" stroke="${O}" stroke-width="7" stroke-linecap="round"/>
  <path d="M300,912 H560 M720,912 H1060" stroke="${O}" stroke-width="5" stroke-linecap="round" opacity=".45"/>`;
}
function tower(t,boost){
  const x=300,top=300,bot=870;let s=`<g stroke="${O}" stroke-width="8" stroke-linecap="round" fill="none">
  <path d="M${x-80},${bot} L${x-10},${top} M${x+80},${bot} L${x+10},${top} M${x},${top} V${top-60}"/>`;
  const W=y=>80-(bot-y)/(bot-top)*70;
  for(let y=bot;y>top+40;y-=80){const y2=y-80;s+=`<path d="M${x-W(y)},${y} L${x+W(y2)},${y2} M${x+W(y)},${y} L${x-W(y2)},${y2} M${x-W(y2)},${y2} H${x+W(y2)}" stroke-width="5"/>`}
  s+='</g>';
  for(let i=0;i<3;i++){const ph=(t*1.1*(1+boost)+i/3)%1,r=46+ph*80,o=(1-ph)*(.6+.4*boost);
    for(const dir of [-1,1])s+=`<path d="M${x+dir*r*.5},${top-40-r*.86} A${r},${r} 0 0 ${dir>0?1:0} ${x+dir*r*.5},${top-40+r*.86}" fill="none" stroke="${O}" stroke-width="8" stroke-linecap="round" opacity="${o.toFixed(2)}"/>`}
  return s;
}
const CAR_X=200, CAR_G='#1a5025', CAR_LINE='#0c2a12';
function car(t,flash){
  const hl=flash>0?`<circle cx="36" cy="-168" r="${70+flash*60}" fill="url(#glow)" opacity="${flash}"/><circle cx="86" cy="-170" r="${50+flash*40}" fill="url(#glow)" opacity="${flash*.8}"/>`:'';
  const lamp=flash>0?'#fffbe8':C;
  return `<g transform="translate(${CAR_X},900)">
  <path d="M8,-104 L18,-196 Q24,-212 62,-216 L340,-232 L432,-328 Q452,-348 484,-350 L752,-350 Q778,-350 794,-330 L874,-236 L946,-228 Q972,-224 972,-196 L970,-116 Q968,-84 940,-84 L862,-84 A78,78 0 0 0 708,-84 L310,-84 A78,78 0 0 0 156,-84 L44,-84 Q8,-84 8,-104 Z" fill="${CAR_G}" stroke="${O}" stroke-width="9" stroke-linejoin="round"/>
  <path d="M452,-240 L510,-326 L612,-326 L612,-240 Z M628,-240 L628,-326 L740,-326 Q760,-326 772,-310 L824,-240 Z" fill="${C}"/>
  <path d="M14,-150 L110,-150" stroke="${CAR_LINE}" stroke-width="5"/>
  <path d="M110,-200 L110,-96 M620,-232 V-96 M440,-232 L448,-96 M110,-168 H950" stroke="${CAR_LINE}" stroke-width="6" fill="none" stroke-linecap="round"/>
  <path d="M20,-128 h80 M22,-138 h78 M24,-118 h76" stroke="${CAR_LINE}" stroke-width="4"/>
  <rect x="2" y="-112" width="112" height="20" rx="8" fill="${CAR_G}" stroke="${O}" stroke-width="6"/>
  <rect x="890" y="-112" width="84" height="20" rx="8" fill="${CAR_G}" stroke="${O}" stroke-width="6"/>
  <rect x="490" y="-214" width="40" height="9" rx="4" fill="${CAR_LINE}"/><rect x="664" y="-214" width="40" height="9" rx="4" fill="${CAR_LINE}"/>
  <rect x="944" y="-206" width="24" height="34" rx="6" fill="${flash>0?'#ff6a48':'#9c3a24'}" stroke="${O}" stroke-width="3"/>
  ${hl}<circle cx="36" cy="-168" r="20" fill="${lamp}" stroke="${O}" stroke-width="4"/><circle cx="86" cy="-170" r="15" fill="${lamp}" stroke="${O}" stroke-width="4"/>
  ${[233,785].map(cx=>`<circle cx="${cx}" cy="-84" r="70" fill="#0a170d" stroke="${O}" stroke-width="8"/><circle cx="${cx}" cy="-84" r="38" fill="${CAR_G}" stroke="${O}" stroke-width="5"/><circle cx="${cx}" cy="-84" r="10" fill="${O}"/>`).join('')}</g>`;
}
function beeps(t,on){if(!on)return '';let s='';for(let i=0;i<3;i++){const ph=(t*1.6+i/3)%1,r=30+ph*100;
  s+=`<path d="M${CAR_X+560-r*.4},${520-r*.5} A${r},${r} 0 0 1 ${CAR_X+560+r*.9},${520-r*.1}" fill="none" stroke="${C}" stroke-width="7" stroke-linecap="round" opacity="${(1-ph)*.85}"/>`}return s}
/* circuit traces from the car to the console, as in the logo */
const TRACES=[[1000,842,'M1000,842 H1060 L1086,816 H1160'],[1012,876,'M1012,876 H1110 L1132,852 H1180'],[1040,806,'M1040,806 H1080 L1102,782 H1176']];
function traces(t,on){
  let s='';TRACES.forEach(([x,y,d],i)=>{s+=`<path d="${d}" fill="none" stroke="${O}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${x}" cy="${y}" r="10" fill="${CAR_G}" stroke="${O}" stroke-width="5"/>`;
    if(on){const ph=(t*.9+i/3)%1;s+=`<circle cx="${1170-ph*(1170-x)}" cy="${y-(1-ph)*0}" r="7" fill="${C}" opacity="${(1-ph).toFixed(2)}"/>`}});
  return s;
}
/* the slanted programming console from the logo (used as the table) */
function desk(t){
  let keys='';for(let r=0;r<4;r++)for(let c=0;c<5;c++){const x=1218+c*30+r*-16,y=760+r*30,on=((Math.floor(t*3)+r*5+c)%7===0);
    keys+=`<rect x="${x}" y="${y}" width="20" height="13" rx="3" fill="${on?C:O}" opacity="${on?1:.85}"/>`}
  return `<path d="M1236,696 L1518,696 L1500,900 L1138,900 Z" fill="${CAR_G}" stroke="${O}" stroke-width="8" stroke-linejoin="round"/>
  <path d="M1250,714 L1494,714 L1482,746 L1236,746 Z" fill="#0f3317" stroke="${O}" stroke-width="3"/>
  <rect x="1268" y="722" width="54" height="16" rx="3" fill="${O}" opacity=".9"/><rect x="1340" y="722" width="38" height="16" rx="3" fill="${C}" opacity=".8"/>
  ${keys}<circle cx="1420" cy="800" r="16" fill="#0f3317" stroke="${O}" stroke-width="4"/><circle cx="1446" cy="852" r="11" fill="#0f3317" stroke="${O}" stroke-width="4"/>
  <rect x="1222" y="686" width="304" height="16" rx="6" fill="${CAR_G}" stroke="${O}" stroke-width="6"/>`;
}
function stool(){
  return `<g stroke="${O}" stroke-linecap="round"><path d="M1590,786 L1578,898 M1694,786 L1708,898 M1584,850 H1702" stroke-width="10"/></g>
  <rect x="1566" y="766" width="156" height="22" rx="10" fill="${CAR_G}" stroke="${O}" stroke-width="6"/>`;
}
function baseRadio(t,tx){
  const f=(145.5+Math.floor(t*.5)%3*.025).toFixed(3);
  return `<g transform="translate(1262,620)"><rect x="0" y="0" width="176" height="66" rx="10" fill="${D}" stroke="${O}" stroke-width="6"/>
  <rect x="12" y="12" width="88" height="30" rx="4" fill="${tx?O:'#7a5a2a'}"/>
  <text x="56" y="35" direction="ltr" text-anchor="middle" font-family="monospace" font-weight="700" font-size="20" fill="${D}">${f}</text>
  <circle cx="124" cy="33" r="15" fill="${G}" stroke="${O}" stroke-width="4"/><circle cx="158" cy="33" r="9" fill="${G}" stroke="${O}" stroke-width="4"/>
  <path d="M14,54 h84" stroke="${C}" stroke-width="3" opacity=".5"/>
  <path d="M0,40 C-24,48 -10,62 -30,62 C-48,62 -36,48 -50,52" fill="none" stroke="${O}" stroke-width="4"/>
  <rect x="-70" y="36" width="24" height="32" rx="9" fill="${D}" stroke="${O}" stroke-width="4"/></g>`;
}
function laptop(t){
  const c=(Math.sin(t*5)>0)?C:O;
  return `<g transform="translate(1290,686)"><polygon points="0,0 120,0 112,-10 8,-10" fill="${G}" stroke="${O}" stroke-width="5" stroke-linejoin="round"/>
  <polygon points="10,-10 30,-10 2,-96 -18,-96" fill="${G}" stroke="${O}" stroke-width="5" stroke-linejoin="round"/><circle cx="6" cy="-56" r="5" fill="${c}"/></g>`;
}
function brand(){return `<text x="1880" y="1036" direction="ltr" text-anchor="end" font-family="Arial Black,Arial" font-weight="900" font-size="46" fill="${C}">@Eng_<tspan fill="${O}">7Z1FT</tspan></text>`}

/* ---------- director ---------- */
const SCRIPTS={
  radio:{items:['radio'],k:[
    {t:0,   pose:'sit_idle',  x:SC.SEAT_X, talk:1},
    {t:2.6, pose:'sit_reach', x:SC.SEAT_X},
    {t:3.2, pose:'sit_hold',  x:SC.SEAT_X, hold:'radio', talk:1, fx:'tx'},
    {t:7.2, pose:'stand_hold',x:SC.SEAT_X, hold:'radio'},
    {t:8.2, pose:'walk',      x:960, hold:'radio'},
    {t:10.2,pose:'stand_point_hold',x:960, hold:'radio', talk:1, fx:'tower'},
    {t:13.6,pose:'stand_hold',x:960, hold:'radio', talk:1, fx:'tx'},
    {t:17,  pose:'thinking',  x:960, hold:'radio', talk:1},
    {t:19.4,pose:'stand_hold',x:960, hold:'radio', talk:1, fx:'tx'},
  ],end:22},
  car:{items:['tablet'],k:[
    {t:0,   pose:'sit_idle',  x:SC.SEAT_X, talk:1, fx:'link'},
    {t:2.6, pose:'sit_reach', x:SC.SEAT_X, fx:'link'},
    {t:3.2, pose:'sit_tablet',x:SC.SEAT_X, hold:'tablet', talk:1, fx:'link'},
    {t:7.2, pose:'stand_tablet',x:SC.SEAT_X, hold:'tablet', fx:'link'},
    {t:8.2, pose:'walk',      x:880, hold:'tablet', fx:'link'},
    {t:10.4,pose:'stand_point_hold',x:880, hold:'tablet', talk:1, fx:'link'},
    {t:13.4,pose:'stand_tablet',x:880, hold:'tablet', talk:1, fx:'prog'},
    {t:17.2,pose:'celebrate', x:880, hold:'tablet', fx:'car'},
    {t:19.6,pose:'stand_point_hold',x:880, hold:'tablet', talk:1, fx:'car'},
  ],end:22},
};
const WALK_SPEED=300;
function keyAt(k,t){let i=0;while(i<k.length-1&&t>=k[i+1].t)i++;return i}
function rawPose(k,i,t,m){ // pose of keyframe i at time t, without blending from i-1
  const K=k[i],prevX=i?k[i-1].x:K.x;
  if(K.pose==='walk'){
    const dist=K.x-prevX,dur=Math.max(.6,Math.abs(dist)/WALK_SPEED),q=clamp((t-K.t)/dur),e=ease(q);
    return {P:walkPose(Math.abs(dist)*e/26),x:prevX+dist*e,f:dist<0?-1:1,dy:0};
  }
  const a=animate(POSES[K.pose],K.pose,t,K.talk?m:0);
  return {P:a.P,x:K.x,f:K.f||-1,dy:a.dy};
}
function scenePose(script,t,m){
  const k=script.k,i=keyAt(k,t),K=k[i],cur=rawPose(k,i,t,m);
  if(!i)return {...cur,K};
  const prev=k[i-1],sitStand=/^sit/.test(prev.pose)!==/^sit/.test(K.pose);
  const bl=K.pose==='walk'?.3:sitStand?.8:.45,q=clamp((t-K.t)/bl);
  if(q>=1)return {...cur,K};
  const pt=prev.pose==='walk'?K.t:t,P0=rawPose(k,i-1,pt,m),e=smooth(0,1,q);
  return {P:lerpPose(P0.P,cur.P,e),x:lerp(P0.x,cur.x,e),f:q<.5?P0.f:cur.f,dy:lerp(P0.dy,cur.dy,e),K};
}
const toStage=([nx,ny],x,f,dy)=>[x+f*SC.S*(nx-300),SC.FLOOR+SC.S*(ny-680)+dy*SC.S];
const DESK_SPOT={radio:[1478,688],tablet:[1468,672]};

function sceneFrame(name,t,m,blink){
  const script=SCRIPTS[name],{P,x,f,dy,K}=scenePose(script,t,m),fx=K.fx||'';
  const tx=fx==='tx'&&m>.1,linkOn=/link|prog|car/.test(fx);
  const prog=fx==='prog'?clamp((t-K.t)/3.4):/car/.test(fx)?1:0;
  const flash=fx==='car'?Math.max(0,Math.sin(t*9)):0;
  let s=sceneBg()+tower(t,fx==='tower'?1:tx?.6:0)+car(t,flash)+beeps(t,fx==='car')+traces(t,linkOn||tx)+stool()+desk(t)+(script.items.includes('radio')?baseRadio(t,tx||fx==='tower'):laptop(t));
  const held=K.hold||null,hand=P.arms[1][2];
  for(const it of script.items){if(it===held)continue;const [ix,iy]=DESK_SPOT[it];
    s+=`<g transform="translate(${ix},${iy}) scale(${SC.S})">${ITEMS[it](t,it==='radio'?tx:prog)}</g>`;
    if(it==='tablet'&&linkOn)s+=cable([ix,iy-20])}
  if(held==='tablet'&&linkOn)s+=cable(toStage(hand,x,f,dy));
  const item=held?`<g transform="translate(${hand[0]},${hand[1]})">${ITEMS[held](t,held==='radio'?tx:prog)}</g>`:'';
  const engineProps=/^(sit|stand)_|walk/.test(K.pose)?'':props(P.props,t,f<0);
  SCALE=SC.S;s+=place(engineProps+figure(P,blink,K.talk?m:0)+item,x,SC.FLOOR+dy*SC.S,f);
  if(tx)for(let i=0;i<2;i++){const [ax,ay]=toStage([hand[0]+9,hand[1]-130],x,f,dy),ph=(t*2+i/2)%1,r=14+ph*50;
    s+=`<circle cx="${ax}" cy="${ay}" r="${r}" fill="none" stroke="${O}" stroke-width="5" opacity="${(1-ph)*.9}"/>`}
  return s+brand();
}
function cable([x,y]){return `<path d="M${x},${y} C${x-60},${y+180} 760,${SC.FLOOR+20} 700,${SC.FLOOR-110}" fill="none" stroke="#0a1a0e" stroke-width="9"/><path d="M${x},${y} C${x-60},${y+180} 760,${SC.FLOOR+20} 700,${SC.FLOOR-110}" fill="none" stroke="${O}" stroke-width="3"/><rect x="684" y="${SC.FLOOR-122}" width="30" height="20" rx="4" fill="${D}" stroke="${O}" stroke-width="3"/>`}
