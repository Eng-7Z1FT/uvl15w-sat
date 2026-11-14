/* 7Z1FT stickman drawing engine — shared by animate.html and the auto-video renderer */
const G='#1e6b2f',O='#e8922e',C='#f3efe4',D='#0a1a0e';
const SH=[300,268];
const LEGS=[[[300,450],[272,560],[258,678],[228,682]],[[300,450],[328,560],[342,678],[372,682]]];
const TORSO=[[300,250],[300,450]];
const base=o=>Object.assign({legs:LEGS,torso:TORSO,head:[300,180],dx:0,eyes:'dot',mouth:'smile',props:null},o);
const down=(o,dy)=>JSON.parse(JSON.stringify(o),(k,v)=>Array.isArray(v)&&v.length===2&&typeof v[0]==='number'?[v[0],v[1]+dy]:v);
const POSES={
  wave:base({arms:[[SH,[250,350],[238,432]],[SH,[388,226],[404,132]]],props:'wave'}),
  point:base({arms:[[SH,[236,336],[290,404]],[SH,[392,252],[478,212]]],dx:10,props:'point'}),
  typing:base({arms:[[[328,368],[372,438],[452,462]],[[328,368],[386,452],[486,462]]],
    legs:[[[296,548],[392,552],[398,682],[428,688]],[[296,548],[382,566],[372,692],[402,698]]],
    torso:[[330,340],[296,548]],head:[348,272],dx:12,eyes:'focus',mouth:'flat',props:'typing'}),
  thinking:base({arms:[[SH,[246,340],[338,346]],[SH,[356,326],[318,228]]],dx:6,eyes:'up',mouth:'hmm',props:'thinking'}),
  key:base({arms:[[SH,[250,352],[240,434]],[SH,[386,246],[424,170]]],dx:8,eyes:'happy',props:'key'}),
  celebrate:down(base({arms:[[SH,[236,196],[212,112]],[SH,[364,196],[388,112]]],
    legs:[[[300,440],[240,520],[270,610],[240,628]],[[300,440],[360,520],[330,610],[360,628]]],
    torso:[[300,250],[300,440]],eyes:'happy',mouth:'open',props:'confetti'}),52),
  talk:base({arms:[[SH,[258,350],[250,432]],[SH,[356,330],[392,392]]],dx:4}),
  shocked:base({arms:[[SH,[232,236],[226,162]],[SH,[368,236],[374,162]]],mouth:'o',props:'shocked'}),
};

/* ---------- math ---------- */
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,k)=>a+(b-a)*k;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t)};
const ease=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
const easeOutBack=t=>{const c=1.9;return 1+(c+1)*Math.pow(t-1,3)+c*Math.pow(t-1,2)};
function lp(a,b,k){if(typeof a==='number')return lerp(a,b,k);if(Array.isArray(a))return a.map((v,i)=>lp(v,b[i],k));return k<.5?a:b}
function lerpPose(A,B,k){return {arms:lp(A.arms,B.arms,k),legs:lp(A.legs,B.legs,k),torso:lp(A.torso,B.torso,k),head:lp(A.head,B.head,k),
  dx:lerp(A.dx,B.dx,k),eyes:k<.5?A.eyes:B.eyes,mouth:k<.5?A.mouth:B.mouth,props:k<.5?A.props:B.props}}
const clone=o=>JSON.parse(JSON.stringify(o));

function walkPose(ph){
  const bob=-Math.abs(Math.sin(ph))*9, hip=[300,446+bob];
  const legs=[0,1].map(i=>{const p=ph+i*Math.PI,a=.42*Math.sin(p),bend=.75*Math.max(0,Math.cos(p));
    const knee=[hip[0]+115*Math.sin(a),hip[1]+115*Math.cos(a)],b=a-bend;
    const foot=[knee[0]+118*Math.sin(b),knee[1]+118*Math.cos(b)];return [hip,knee,foot,[foot[0]+28,foot[1]+3]]});
  const sh=[304,268+bob];
  const arms=[1,0].map(i=>{const p=ph+i*Math.PI,a=-.5*Math.sin(p),el=[sh[0]+88*Math.sin(a),sh[1]+88*Math.cos(a)],b=a+.5;
    return [sh,el,[el[0]+84*Math.sin(b),el[1]+84*Math.cos(b)]]});
  return {arms,legs,torso:[[306,250+bob],[300,446+bob]],head:[308,180+bob],dx:10,eyes:'dot',mouth:'smile',props:null};
}

/* ---------- idle + talking motion ---------- */
function animate(P,name,t,m){
  P=clone(P);let dy=0;const b=Math.sin(t*2.2)*3;
  P.head[1]+=b-m*5;P.head[0]+=Math.sin(t*5.3)*m*4;P.torso[0][1]+=b;
  P.arms.forEach(a=>{a[0][1]+=b;a[1][1]+=b;a[2][1]+=b*.5});
  const h=P.arms[1][2],e=P.arms[1][1];
  if(name==='wave'){h[0]+=Math.sin(t*9)*14;e[0]+=Math.sin(t*9)*4}
  if(name==='point'){h[1]+=Math.sin(t*2.5)*7-m*10}
  if(name==='typing'){P.arms[0][2][1]+=Math.max(0,Math.sin(t*18))*-6;h[1]+=Math.max(0,Math.sin(t*18+2))*-6}
  if(name==='thinking'){h[1]+=Math.sin(t*4)*2.5}
  if(name==='talk'){h[0]+=Math.sin(t*3.1)*10+m*8;h[1]+=Math.sin(t*2.3)*8-m*14;e[1]+=Math.sin(t*2.3)*3}
  if(name==='key'){h[1]+=Math.sin(t*6)*5}
  if(name==='shocked'){const s=Math.sin(t*38)*2;P.head[0]+=s;P.arms.forEach(a=>a[2][0]+=s)}
  if(name==='celebrate'){dy=-Math.abs(Math.sin(t*5))*28;P.arms[0][2][0]-=Math.sin(t*10)*8;h[0]+=Math.sin(t*10)*8}
  return {P,dy};
}

/* ---------- drawing ---------- */
const pts=a=>a.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ');
const pl=(a,col,w)=>`<polyline points="${pts(a)}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
function face(P,blink,m){
  const [hx,hy]=P.head,ex=hx+P.dx*1.4;let s=`<g transform="translate(${ex.toFixed(1)},${(hy+6).toFixed(1)})" fill="${C}" stroke="${C}" stroke-linecap="round">`;
  const ry=Math.max(1.3,8*(1-blink));
  if(P.eyes==='dot')s+=`<ellipse cx="-19" cy="-8" rx="8" ry="${ry}" stroke="none"/><ellipse cx="19" cy="-8" rx="8" ry="${ry}" stroke="none"/>`;
  else if(P.eyes==='up')s+=`<ellipse cx="-15" cy="-16" rx="8" ry="${ry}" stroke="none"/><ellipse cx="23" cy="-16" rx="8" ry="${ry}" stroke="none"/>`;
  else if(P.eyes==='happy')s+=`<path d="M-29,-4 Q-19,-19 -9,-4 M9,-4 Q19,-19 29,-4" fill="none" stroke-width="6"/>`;
  else if(P.eyes==='focus')s+=`<path d="M-28,-8 h17 M11,-8 h17" stroke-width="7"/>`;
  if(m>.06)s+=`<ellipse cx="0" cy="${30+m*4}" rx="${14+6*m}" ry="${3+16*m}" fill="${D}" stroke-width="4"/>`;
  else if(P.mouth==='smile')s+=`<path d="M-18,24 Q0,41 18,24" fill="none" stroke-width="6"/>`;
  else if(P.mouth==='open')s+=`<path d="M-21,22 Q0,50 21,22Z" stroke="none"/>`;
  else if(P.mouth==='flat')s+=`<path d="M-12,30 h24" stroke-width="6"/>`;
  else if(P.mouth==='hmm')s+=`<path d="M-13,32 q13,-10 26,0" fill="none" stroke-width="6"/>`;
  else if(P.mouth==='o')s+=`<ellipse cx="0" cy="32" rx="10" ry="14" stroke="none"/>`;
  return s+'</g>';
}
function figure(P,blink,m){
  let s='';
  for(const [col,add] of [[O,10],[G,0]]){s+=pl(P.torso,col,30+add);for(const l of [...P.arms,...P.legs])s+=pl(l,col,16+add)}
  const [hx,hy]=P.head;
  s+=`<path d="M${hx-56},${hy+20} Q${hx-62},${hy-58} ${hx+2},${hy-66} Q${hx+60},${hy-60} ${hx+56},${hy+14} Q${hx+40},${hy+62} ${hx},${hy+64} Q${hx-44},${hy+62} ${hx-56},${hy+20}Z" fill="${G}" stroke="${O}" stroke-width="6" stroke-linejoin="round"/>`;
  return s+face(P,blink,m);
}
function txt(ch,x,y,size,col,flip,op=1){
  const tf=flip?` transform="translate(${2*x},0) scale(-1,1)"`:'';
  return `<text x="${x}" y="${y}" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="${size}" fill="${col}" opacity="${op}"${tf}>${ch}</text>`;
}
const stroke=(d,col=O,w=6)=>`<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
function props(name,t,flip){
  switch(name){
  case 'wave':return stroke('M430,110 q16,22 4,48')+stroke('M452,96 q24,34 6,72');
  case 'point':return stroke('M506,186 l26,-14')+stroke('M510,212 l30,0')+stroke('M506,238 l26,14');
  case 'thinking':return txt('?',440,122+Math.sin(t*3)*6,110,O,flip)+txt('?',386,88+Math.sin(t*3+1)*5,54,C,flip,.8);
  case 'shocked':return txt('!',440,118,100,O,flip)+stroke('M206,128 l-24,-20',C,5)+stroke('M394,128 l24,-20',C,5)+stroke('M300,96 l0,-24',C,5);
  case 'key':{const r=-25+Math.sin(t*6)*6;
    return `<g transform="translate(430,${172+Math.sin(t*6)*5}) rotate(${r})"><rect x="-22" y="-62" width="44" height="66" rx="16" fill="${D}" stroke="${O}" stroke-width="5"/><circle cx="0" cy="-42" r="7" fill="${O}"/><circle cx="0" cy="-22" r="6" fill="${C}"/><path d="M-7,-62 v-58 h14 v14 h-8 v8 h8 v10 h-8 v26" fill="#cfd4d6" stroke="${O}" stroke-width="3"/></g>`
      +[[500,60,14,C],[380,70,10,O],[520,170,9,C]].map(([x,y,r,c],i)=>{const k=.6+.4*Math.sin(t*4+i*2);r*=k;
        return `<path d="M${x},${y-r} Q${x+2},${y-2} ${x+r},${y} Q${x+2},${y+2} ${x},${y+r} Q${x-2},${y+2} ${x-r},${y} Q${x-2},${y-2} ${x},${y-r}Z" fill="${c}"/>`}).join('');}
  case 'typing':{const blink=(Math.sin(t*6)>0)?C:O;
    return `<path d="M232,560 h136" stroke="${O}" stroke-width="22" stroke-linecap="round"/><path d="M232,560 h136" stroke="${G}" stroke-width="14" stroke-linecap="round"/>`
      +stroke('M250,568 l-12,150 M350,568 l12,150 M244,650 h112',O,8)+stroke('M404,478 h170 M420,484 v158 M560,484 v158',O,10)
      +`<polygon points="402,476 540,476 548,466 410,466" fill="${G}" stroke="${O}" stroke-width="5" stroke-linejoin="round"/><polygon points="528,470 548,470 588,352 568,352" fill="${G}" stroke="${O}" stroke-width="5" stroke-linejoin="round"/><circle cx="560" cy="412" r="6" fill="${blink}"/>`
      +[0,1,2].map(i=>{const o=Math.max(0,Math.sin(t*18+i*2));return `<path d="M${430+i*32},${440-o*4} l${(i-1)*6},-12" stroke="${O}" stroke-width="5" stroke-linecap="round" opacity="${o}"/>`}).join('');}
  case 'confetti':return [[120,90,30,O],[180,40,-20,C],[450,50,45,O],[500,130,-35,C],[90,220,60,C],[520,250,20,O],[250,30,10,O],[380,20,-50,C]]
      .map(([x,y,r,c],i)=>{const yy=((y+t*90+i*37)%300)-10;return `<rect x="${x+Math.sin(t*2+i)*14}" y="${yy}" width="14" height="8" rx="2" fill="${c}" transform="rotate(${r+t*120*(i%2?1:-1)} ${x} ${yy})"/>`}).join('');
  }
  return '';
}
var SCALE=.85;
function place(inner,x,y,f,{sx=1,sy=1,rot=0,op=1}={}){
  return `<g opacity="${op}" transform="translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${rot}) scale(${(SCALE*sx*f).toFixed(3)},${(SCALE*sy).toFixed(3)}) translate(-300,-680)">${inner}</g>`;
}


function burst(x,y,q){if(q<=0||q>=1)return '';let s='';for(let i=0;i<10;i++){const a=i/10*Math.PI*2,r=40+q*140;
  s+=`<circle cx="${x+Math.cos(a)*r}" cy="${y+Math.sin(a)*r}" r="${9*(1-q)}" fill="${i%2?O:C}"/>`}return s}

