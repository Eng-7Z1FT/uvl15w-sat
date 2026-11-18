/* 7Z1FT desk scene (inspired by the logo): tower, car, desk with radios / tablet,
   stool, and a director that plays a keyframe script for the character.
   Needs engine.js loaded first. Stage is 1920x1080, floor at y=900. */
const SC={W:1920,H:1080,FLOOR:900,S:.9,SEAT_X:1640};

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

/* ---------- static scene pieces (stage coords) ---------- */
function sceneBg(){
  return `<defs><radialGradient id="scbg" cx=".35" cy=".25" r=".9"><stop offset="0" stop-color="#1f4a2a"/><stop offset=".6" stop-color="#11291a"/><stop offset="1" stop-color="#08130c"/></radialGradient>
  <radialGradient id="glow"><stop offset="0" stop-color="${C}" stop-opacity=".9"/><stop offset="1" stop-color="${C}" stop-opacity="0"/></radialGradient></defs>
  <rect width="1920" height="1080" fill="url(#scbg)"/><rect y="900" width="1920" height="180" fill="#07100a"/>
  <path d="M0,900 H1920" stroke="${O}" stroke-width="5" opacity=".75"/>`;
}
function tower(t,boost){
  const x=230,top=360;let s=`<g stroke="${O}" stroke-width="8" stroke-linecap="round" fill="none">
  <path d="M${x-75},900 L${x-10},${top} M${x+75},900 L${x+10},${top} M${x},${top} V${top-55}"/>`;
  for(let y=900,i=0;y>top+30;y-=78,i++){const w1=75-(900-y)/540*65,y2=y-78,w2=75-(900-y2)/540*65;
    s+=`<path d="M${x-w1},${y} L${x+w2},${y2} M${x+w1},${y} L${x-w2},${y2} M${x-w2},${y2} H${x+w2}" stroke-width="5"/>`}
  s+='</g>';
  for(let i=0;i<3;i++){const ph=(t*1.2*(1+boost)+i/3)%1,r=40+ph*70,o=(1-ph)*(.55+.45*boost);
    for(const dir of [-1,1])s+=`<path d="M${x+dir*r*.5},${top-30-r*.86} A${r},${r} 0 0 ${dir>0?1:0} ${x+dir*r*.5},${top-30+r*.86}" fill="none" stroke="${O}" stroke-width="7" stroke-linecap="round" opacity="${o.toFixed(2)}"/>`}
  return s;
}
function car(t,flash){
  const hl=flash>0?`<circle cx="52" cy="-98" r="${60+flash*50}" fill="url(#glow)" opacity="${flash}"/>`:'';
  return `<g transform="translate(330,900)">${hl}
  <path d="M22,-62 Q14,-118 64,-128 L205,-142 L292,-214 Q306,-228 330,-228 L528,-228 Q552,-228 568,-210 L640,-142 L702,-134 Q738,-126 738,-92 L738,-62 Q738,-42 716,-42 L642,-42 A67,67 0 0 0 508,-42 L234,-42 A67,67 0 0 0 100,-42 L44,-42 Q22,-42 22,-62 Z" fill="${G}" stroke="${O}" stroke-width="8" stroke-linejoin="round"/>
  <path d="M302,-146 L346,-206 L430,-206 L430,-146 Z M446,-146 L446,-206 L526,-206 Q546,-206 558,-190 L598,-146 Z" fill="${C}"/>
  <path d="M440,-140 V-52 M226,-140 L230,-52 M36,-78 H160" stroke="#0e2a15" stroke-width="5" fill="none" stroke-linecap="round"/>
  <path d="M30,-104 h22 M30,-114 h22 M30,-94 h22" stroke="#0e2a15" stroke-width="4"/>
  <circle cx="52" cy="-98" r="15" fill="${flash>0?'#fff8e0':C}"/><rect x="700" y="-112" width="22" height="16" rx="5" fill="${flash>0?'#ff5a3c':'#a0402a'}"/>
  <rect x="470" y="-122" width="30" height="7" rx="3.5" fill="#0e2a15"/>
  ${[167,575].map(cx=>`<circle cx="${cx}" cy="-42" r="56" fill="#0a150d" stroke="${O}" stroke-width="7"/><circle cx="${cx}" cy="-42" r="24" fill="${G}" stroke="${O}" stroke-width="4"/>`).join('')}</g>`;
}
function beeps(t,on){if(!on)return '';let s='';for(let i=0;i<3;i++){const ph=(t*1.6+i/3)%1,r=30+ph*90;
  s+=`<path d="M${700-r*.3},${700-r} A${r},${r} 0 0 1 ${700+r*.8},${700-r*.4}" fill="none" stroke="${C}" stroke-width="6" stroke-linecap="round" opacity="${(1-ph)*.8}"/>`}return s}
function traces(t,on){
  if(!on)return '';const path='M1176,770 H1120 L1100,790 H1072 M1176,810 H1130 L1110,830 H1068 M1176,850 H1100';
  const pulse=(t*.8)%1;
  return `<path d="${path}" fill="none" stroke="${O}" stroke-width="6" stroke-linecap="round"/>
  ${[[1072,790],[1068,830],[1100,850]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="9" fill="#08130c" stroke="${O}" stroke-width="5"/>`).join('')}
  <circle cx="${1176-pulse*104}" cy="790" r="6" fill="${C}" opacity="${1-pulse}"/>`;
}
function desk(){
  return `<g stroke="${O}" stroke-linecap="round"><path d="M1200,728 L1188,898 M1546,728 L1558,898 M1194,836 H1552" stroke-width="10"/></g>
  <rect x="1166" y="706" width="404" height="22" rx="8" fill="${G}" stroke="${O}" stroke-width="6"/>`;
}
function stool(){
  return `<g stroke="${O}" stroke-linecap="round"><path d="M1594,800 L1584,898 M1690,800 L1702,898 M1590,856 H1696" stroke-width="9"/></g>
  <rect x="1570" y="782" width="146" height="20" rx="9" fill="${G}" stroke="${O}" stroke-width="6"/>`;
}
function baseRadio(t,tx){
  const f=(145.5+Math.floor(t*.5)%3*.025).toFixed(3);
  return `<g transform="translate(1214,640)"><rect x="0" y="0" width="190" height="66" rx="10" fill="${D}" stroke="${O}" stroke-width="6"/>
  <rect x="14" y="12" width="92" height="30" rx="4" fill="${tx?O:'#7a5a2a'}"/>
  <text x="60" y="35" direction="ltr" text-anchor="middle" font-family="monospace" font-weight="700" font-size="20" fill="${D}">${f}</text>
  <circle cx="132" cy="33" r="16" fill="${G}" stroke="${O}" stroke-width="4"/><circle cx="168" cy="33" r="10" fill="${G}" stroke="${O}" stroke-width="4"/>
  <path d="M16,54 h86" stroke="${C}" stroke-width="3" opacity=".5"/>
  <path d="M0,40 C-26,48 -10,64 -34,64 C-56,64 -42,46 -60,52" fill="none" stroke="${O}" stroke-width="4"/>
  <rect x="-80" y="34" width="26" height="34" rx="9" fill="${D}" stroke="${O}" stroke-width="4"/></g>`;
}

/* ---------- director ---------- */
const SCRIPTS={
  radio:{items:['radio'],k:[
    {t:0,   pose:'sit_idle',  x:SC.SEAT_X, talk:1},
    {t:2.6, pose:'sit_reach', x:SC.SEAT_X},
    {t:3.2, pose:'sit_hold',  x:SC.SEAT_X, hold:'radio', talk:1, fx:'tx'},
    {t:7.2, pose:'stand_hold',x:SC.SEAT_X, hold:'radio'},
    {t:8.2, pose:'walk',      x:1060, hold:'radio'},
    {t:10.2,pose:'stand_point_hold',x:1060, hold:'radio', talk:1, fx:'tower'},
    {t:13.6,pose:'stand_hold',x:1060, hold:'radio', talk:1, fx:'tx'},
    {t:17,  pose:'thinking',  x:1060, hold:'radio', talk:1},
    {t:19.4,pose:'stand_hold',x:1060, hold:'radio', talk:1, fx:'tx'},
  ],end:22},
  car:{items:['tablet'],k:[
    {t:0,   pose:'sit_idle',  x:SC.SEAT_X, talk:1, fx:'link'},
    {t:2.6, pose:'sit_reach', x:SC.SEAT_X, fx:'link'},
    {t:3.2, pose:'sit_tablet',x:SC.SEAT_X, hold:'tablet', talk:1, fx:'link'},
    {t:7.2, pose:'stand_tablet',x:SC.SEAT_X, hold:'tablet', fx:'link'},
    {t:8.2, pose:'walk',      x:1000, hold:'tablet', fx:'link'},
    {t:10.4,pose:'stand_point_hold',x:1000, hold:'tablet', talk:1, fx:'link'},
    {t:13.4,pose:'stand_tablet',x:1000, hold:'tablet', talk:1, fx:'prog'},
    {t:17.2,pose:'celebrate', x:1000, hold:'tablet', fx:'car'},
    {t:19.6,pose:'stand_point_hold',x:1000, hold:'tablet', talk:1, fx:'car'},
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
  return {P:a.P,x:K.x,f:K.f||(K.x>960?-1:1),dy:a.dy};
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
const DESK_SPOT={radio:[1487,708],tablet:[1470,704]};

function sceneFrame(name,t,m,blink){
  const script=SCRIPTS[name],{P,x,f,dy,K}=scenePose(script,t,m),fx=K.fx||'';
  const tx=fx==='tx'&&m>.1,linkOn=/link|prog|car/.test(fx);
  const prog=fx==='prog'?clamp((t-K.t)/3.4):/car/.test(fx)?1:0;
  const flash=fx==='car'?Math.max(0,Math.sin(t*9)):0;
  let s=sceneBg()+tower(t,fx==='tower'?1:tx?.6:0)+car(t,flash)+beeps(t,fx==='car')+traces(t,linkOn)+desk()+baseRadio(t,tx||fx==='tower')+stool();
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
  return s+`<text x="1880" y="1050" direction="ltr" text-anchor="end" font-family="Arial Black,Arial" font-weight="900" font-size="40" fill="${O}">7Z1FT</text>`;
}
function cable([x,y]){return `<path d="M${x},${y} C${x-60},${y+160} 820,${SC.FLOOR+20} 770,${SC.FLOOR-62}" fill="none" stroke="#0a1a0e" stroke-width="9"/><path d="M${x},${y} C${x-60},${y+160} 820,${SC.FLOOR+20} 770,${SC.FLOOR-62}" fill="none" stroke="${O}" stroke-width="3"/><rect x="752" y="${SC.FLOOR-74}" width="30" height="20" rx="4" fill="${D}" stroke="${O}" stroke-width="3"/>`}
