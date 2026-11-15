
// ---------- Puente con la app nativa ----------
// En la app de iPhone/Android esta página va dentro de la app y la app pone window.IS_NATIVE_APP=true.
const IS_APP=!!window.IS_NATIVE_APP;
const _pend={};let _nid=0;
window.__nativo=r=>{const f=_pend[r.id];if(f){delete _pend[r.id];f(r)}};
function nativo(tipo,datos){return new Promise(res=>{const id=++_nid;_pend[id]=res;
  try{window.ReactNativeWebView.postMessage(JSON.stringify({id,tipo,datos}))}catch(e){delete _pend[id];res({ok:false})}})}
// En la app, los enlaces de fuera (WhatsApp, correo, App Store) los abre el móvil
if(IS_APP)document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a[href]');if(!a)return;
  const h=a.getAttribute('href');if(/^(https?:|mailto:|tel:)/i.test(h)){e.preventDefault();nativo('abrir',{url:a.href})}},true);

// En el navegador (tu web), la página solo sirve para ver resultados: nada de crear sorteos
const enWebPropia=!IS_APP&&/^https?:$/.test(location.protocol)&&!/claude|anthropic|claudeusercontent|127\.0\.0\.1|localhost/.test(location.hostname);
const soloResultados=!IS_APP&&/^https?:$/.test(location.protocol)&&!/claude|anthropic|claudeusercontent/.test(location.hostname);

// ---------- Estado y almacenamiento ----------
const KEY='amigo-invisible-v1';
let state={groups:[]};
try{const s=localStorage.getItem(KEY); if(s) state=JSON.parse(s)}catch(e){}
function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){}}
const uid=()=>Math.random().toString(36).slice(2,9);
const COLORS=['#0b3a7a','#1a56b8','#e0a800','#3b74d6','#082a59','#f2b705','#5b8def','#c99700'];
const colorFor=n=>{let h=0;for(const c of n)h=(h*31+c.charCodeAt(0))>>>0;return COLORS[h%COLORS.length]};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const getGroup=id=>state.groups.find(g=>g.id===id);
const pName=(g,id)=>(g.people.find(p=>p.id===id)||{}).name||'?';
const loc=()=>I18N[LANG]._loc;

let view={name:'home'};
function go(v){view=v;render();window.scrollTo(0,0);if(v.name==='group')refreshStatus(v.id)}

function toast(msg){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');clearTimeout(el._h);el._h=setTimeout(()=>el.classList.remove('show'),2200)}

function modal({title,text,ok,cancel,danger=false,onOk,noCancel=false}){
  ok=ok||t('ok');cancel=noCancel?null:(cancel||t('cancel'));
  const m=document.getElementById('modal');
  m.innerHTML=`<div class="modal-bg"><div class="modal"><h3>${esc(title)}</h3><div class="muted">${text}</div>
  <div class="row">${cancel?`<button class="btn ghost" id="mc">${esc(cancel)}</button>`:''}<button class="btn ${danger?'primary':'dark'}" id="mo">${esc(ok)}</button></div></div></div>`;
  const close=()=>m.innerHTML='';
  m.querySelector('.modal-bg').onclick=e=>{if(e.target.classList.contains('modal-bg'))close()};
  if(cancel)m.querySelector('#mc').onclick=close;
  m.querySelector('#mo').onclick=()=>{close();onOk&&onOk()};
}

async function copy(text,msg){
  if(IS_APP){const r=await nativo('copiar',{texto:text});toast(r.ok?msg:t('copyFail'));return}
  try{await navigator.clipboard.writeText(text);toast(msg)}
  catch(e){toast(t('copyFail'))}
}

// ---------- Sorteo ----------
function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function draw(g){
  const ids=g.people.map(p=>p.id);
  const banned=new Set();
  g.exclusions.forEach(([a,b])=>{banned.add(a+'>'+b);banned.add(b+'>'+a)});
  const ok=(f,to)=>f!==to&&!banned.has(f+'>'+to);
  const givers=shuffle(ids).sort((a,b)=>ids.filter(x=>ok(a,x)).length-ids.filter(x=>ok(b,x)).length);
  const used=new Set(),res={};let steps=0;
  function bt(i){
    if(++steps>200000)return false;
    if(i===givers.length)return true;
    const f=givers[i];
    for(const to of shuffle(ids)){
      if(used.has(to)||!ok(f,to))continue;
      used.add(to);res[f]=to;
      if(bt(i+1))return true;
      used.delete(to);delete res[f];
    }
    return false;
  }
  return bt(0)?res:null;
}

// ---------- Códigos individuales ----------
const XK='vibra-santa-2026';
function encode(obj){
  const bytes=new TextEncoder().encode(JSON.stringify(obj));
  let sum=0;const out=[];
  bytes.forEach((b,i)=>{sum=(sum+b)%256;out.push(b^XK.charCodeAt(i%XK.length))});
  out.push(sum);
  return out.map(b=>b.toString(16).padStart(2,'0')).join('');
}
function decode(code){
  code=code.trim().replace(/^#/,'').replace(/[^0-9a-f]/gi,'').toLowerCase();
  if(code.length<6||code.length%2)return null;
  const arr=code.match(/../g).map(h=>parseInt(h,16));
  const sum=arr.pop();
  const bytes=arr.map((b,i)=>b^XK.charCodeAt(i%XK.length));
  if(bytes.reduce((s,b)=>(s+b)%256,0)!==sum)return null;
  try{return JSON.parse(new TextDecoder().decode(new Uint8Array(bytes)))}catch(e){return null}
}
function codeFor(g,fromId){return encode({g:g.name,b:g.budget||'',d:g.date||'',f:pName(g,fromId),t:pName(g,g.assignments[fromId]),p:g.premium?1:0,i:g.id,o:(g.people.find(x=>x.id===fromId)||{}).tok||''})}
function fmtDate(d,short){if(!d)return'';try{return new Date(d+'T12:00').toLocaleDateString(loc(),short?{day:'numeric',month:'short'}:{day:'numeric',month:'long',year:'numeric'})}catch(e){return d}}

// ---------- Premium ----------
const PRICE_EUR=0.99;
const price=()=>{try{return new Intl.NumberFormat(loc(),{style:'currency',currency:'EUR'}).format(PRICE_EUR)}catch(e){return '0,99 €'}};
const FREE_MAX=6;                   // máximo de participantes en la versión gratis
const SUPPORT='__EMAIL_SOPORTE__';  // se pone al construir (variable EMAIL_SOPORTE de GitHub)
// Punto único de pago. En la web irá Stripe; en la app de iOS, la compra integrada de Apple.
function buyPremium(onDone){
  if(IS_APP){
    nativo('comprar').then(r=>{
      if(r.ok){toast(t('toastPrem'));onDone()}
      else if(r.datos==='cancelado'){}
      else if(r.datos==='sin_pagos')toast(t('payUnavailable'));
      else toast(t('payError'));
    });
    return;
  }
  modal({title:t('payT',{price:price()}),text:esc(t('payX')),ok:t('payOk'),onOk:()=>{toast(t('toastPrem'));onDone()}});
}
const adHTML=()=>`<div class="ad"><b>${t('adT')}</b>${t('adX',{price:price()})}</div>`;

function paywallView(){
  return `<div class="top"><button class="back" data-act="pwback">‹</button><h2 style="flex:1;text-align:center;margin-right:50px">${t('pwTitle')}</h2></div>
  ${t('feats').map(f=>`<div class="feat"><span class="ck">✓</span><span>${f.replace('{max}',FREE_MAX)}</span></div>`).join('')}
  <button class="buy" data-act="pwbuy"><span class="l">${t('buyBtn')}</span><span class="r">${price()}</span></button>
  ${view.allowFree?`<button class="nothanks" data-act="pwfree">${t('noThanks')}</button>`:''}
  <p class="muted small" style="text-align:center;margin-top:10px">${t('oneTime')}</p>`;
}
function openPaywall({target,back,after,allowFree=false,onFree}){go({name:'paywall',target,back,after,allowFree,onFree})}

// ---------- Logo ----------
const giftHTML=()=>`<img class="gift" src="${LOGO}" alt="">`;

// ---------- Vistas ----------
function render(){
  const a=document.getElementById('app');
  // Fuera de la app, cualquier pantalla que no sea un resultado lleva a la portada (para descargar la app)
  if(soloResultados&&view.name!=='mine'){if(enWebPropia){location.replace(location.origin+'/');return}}
  const v=view;
  if(v.name==='home')a.innerHTML=homeView();
  else if(v.name==='edit')a.innerHTML=editView();
  else if(v.name==='group')a.innerHTML=groupView();
  else if(v.name==='pass')a.innerHTML=passView();
  else if(v.name==='code')a.innerHTML=codeView();
  else if(v.name==='mine')a.innerHTML=mineView();
  else if(v.name==='paywall')a.innerHTML=paywallView();
  else if(v.name==='send')a.innerHTML=sendView();
  else if(v.name==='nuevo')a.innerHTML=wizardView();
  bind();
}

function langSelect(){
  return `<label class="langsel" aria-label="${t('language')}">${I18N[LANG]._flag}<select id="lang">${LANGS.map(l=>`<option value="${l}" ${l===LANG?'selected':''}>${I18N[l]._flag} ${I18N[l]._name}</option>`).join('')}</select><span>${LANG.toUpperCase()} ▾</span></label>`;
}

function homeView(){
  const gs=state.groups;
  return `<div class="hero">${langSelect()}<div class="hero-head"><img class="hero-logo" src="${LOGO}" alt=""><div><div class="kicker">${t('kind')}</div><h1>${t('appTitle')}</h1></div></div><p>${t('heroSub')}</p></div>
  ${!gs.length?`<div class="steps"><div><span>✍️</span>${t('step1')}</div><div><span>🎲</span>${t('step2')}</div><div><span>🎁</span>${t('step3')}</div></div>`:''}
  <div class="stack">
    <button class="btn primary" data-act="new">${t('newDraw')}</button>
  </div>
  <h3 style="margin:26px 0 10px">${t('myDraws')}</h3>
  ${gs.length?gs.map(g=>`<div class="card group-item" data-open="${g.id}">
      <div class="avatar" style="background:${colorFor(g.name)}">${esc(g.name[0]||'?').toUpperCase()}</div>
      <div style="flex:1;min-width:0"><div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${g.premium?'👑 ':''}${esc(g.name)}</div>
      <div class="muted small">${t('people',{n:g.people.length})}${g.date?' · '+fmtDate(g.date):''}</div></div>
      <span class="badge ${g.assignments?'ok':''}">${g.assignments?t('drawn'):t('draft')}</span></div>`).join('')
    :`<div class="card empty">${t('emptyList')}</div>`}
  <p class="muted small" style="text-align:center;margin-top:20px">${t('localOnly')}</p>`;
}

let draft=null;
function budgetChips(){return [10,20,30,50].map(n=>{try{return new Intl.NumberFormat(loc(),{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n)}catch(e){return n+' €'}})}
function dateChips(){
  const now=new Date(),y=now.getFullYear(),pad=n=>String(n).padStart(2,'0');
  return [[12,24],[12,25],[1,6]].map(([m,d])=>{let yy=y;if(new Date(yy,m-1,d,23)<now)yy++;return `${yy}-${pad(m)}-${pad(d)}`}).sort();
}
function editView(){
  const g=draft;
  const opts=g.people.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
  return `<div class="top"><button class="back" data-act="back">‹</button><h2>${g._new?t('newTitle'):t('editTitle')}</h2></div>
  <div class="card">
    <label class="f" style="margin-top:0">${t('groupName')}</label>
    <input id="gname" placeholder="${esc(t('groupPh'))}" value="${esc(g.name)}" maxlength="40">
    <div class="grid2">
      <div><label class="f">${t('budget')}</label><input id="gbudget" placeholder="${esc(t('budgetPh'))}" value="${esc(g.budget)}" maxlength="15"></div>
      <div><label class="f">${t('date')}</label><input id="gdate" type="date" value="${esc(g.date)}"></div>
    </div>
    <div class="quick">${budgetChips().map(v=>`<button class="qc ${g.budget===v?'on':''}" data-act="bud" data-v="${esc(v)}">${esc(v)}</button>`).join('')}</div>
    <div class="quick">${dateChips().map(v=>`<button class="qc ${g.date===v?'on':''}" data-act="dt" data-v="${v}">📅 ${esc(fmtDate(v,true))}</button>`).join('')}</div>
  </div>
  <div class="card">
    <h3>${t('participants')} <span class="muted" style="font-weight:500">(${g.people.length})</span></h3>
    <div class="row" style="margin:12px 0">
      <div style="flex:1" class="stack"><input id="pname" placeholder="${esc(t('namePh'))}" maxlength="24" enterkeyhint="next">
      <input id="pemail" type="email" inputmode="email" autocapitalize="off" placeholder="${esc(t('emailPh'))}" maxlength="80" enterkeyhint="done"></div>
      <button class="btn dark sm" data-act="addp" style="align-self:stretch">${t('add')}</button>
    </div>
    <div>${g.people.map(p=>`<span class="chip">${esc(p.name)}${p.email?' ✉️':''}<button data-delp="${p.id}" aria-label="${esc(t('remove'))}">✕</button></span>`).join('')||`<p class="muted small">${t('min3')}</p>`}</div>
  </div>
  ${!g.premium?`<div class="card prem">
    <h3>${t('premTitle',{price:price()})}</h3>
    <div style="margin-top:8px">
      <div class="lockrow">${t('lockEx')}</div>
      <div class="lockrow">${t('lockMax',{max:FREE_MAX})}</div>
      <div class="lockrow">${t('lockAds')}</div>
      <div class="lockrow">${t('lockName')}</div>
    </div>
    <button class="btn dark sm" data-act="unlock" style="margin-top:10px">${t('unlock')}</button>
  </div>`:`<div class="card prem">
    <h3>${t('orgTitle')}</h3>
    <p class="muted small" style="margin-top:4px">${t('orgSub')}</p>
    <input id="gorg" placeholder="${esc(t('orgPh'))}" value="${esc(g.organizer||'')}" maxlength="24" style="margin-top:10px">
  </div>`}
  ${g.premium&&g.people.length>=3?`<div class="card">
    <h3>${t('exTitle')}</h3>
    <p class="muted small" style="margin-top:4px">${t('exSub')}</p>
    <div class="grid2" style="margin-top:12px"><select id="ex1">${opts}</select><select id="ex2">${opts}</select></div>
    <button class="btn ghost sm" data-act="addex" style="margin-top:10px">${t('addEx')}</button>
    <div style="margin-top:12px">${g.exclusions.map((e,i)=>`<span class="chip">${esc(pName(g,e[0]))} ⇄ ${esc(pName(g,e[1]))}<button data-delex="${i}" aria-label="${esc(t('remove'))}">✕</button></span>`).join('')}</div>
  </div>`:''}
  <div id="err"></div>
  ${!g._new?`<button class="btn line" data-act="delgroup" style="margin-top:8px;color:#c0392b">${t('delDraw')}</button>`:''}
  <div class="sticky"><div class="inner"><button class="btn primary" data-act="savedraw">${t('saveDraw')}</button></div></div>`;
}

function groupView(){
  const g=getGroup(view.id);if(!g){return homeView()}
  return `<div class="top"><button class="back" data-act="home">‹</button><h2 style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(g.name)}</h2>
  <button class="btn ghost sm" data-act="edit">${t('edit')}</button></div>
  <div class="card row" style="justify-content:space-around;text-align:center">
    <div><div class="stat">${g.people.length}</div><div class="muted small">${t('statPeople')}</div></div>
    <div><div class="stat">${esc(g.budget||'—')}</div><div class="muted small">${t('statBudget')}</div></div>
    <div><div class="stat" style="font-size:18px;line-height:1.35">${g.date?esc(fmtDate(g.date,true)):'—'}</div><div class="muted small">${t('statDate')}</div></div>
  </div>
  <button class="btn primary big" data-act="enviar">${t('sendResults')}</button>
  <div class="card" style="margin-top:14px">
    <div class="row" style="margin-bottom:6px"><h3 style="flex:1">${t('participants')}</h3>${apiOk&&g.synced?`<button class="btn ghost sm" data-act="refresh" aria-label="↻">↻</button>`:''}</div>
    ${apiOk&&g.synced?`<p class="muted small" style="margin-bottom:8px">${t('openedCount',{n:g.people.filter(p=>g.opened&&g.opened[p.tok]).length,total:g.people.length})}</p>`:''}
    ${g.people.map(p=>`<div class="prow">${avatar(p)}<span class="name">${esc(p.name)}</span>${estado(g,p)}</div>`).join('')}
  </div>
  ${g.premium?`<div class="card prem" style="margin-top:16px"><h3>${t('premCard')}</h3>
    ${g.organizer?`<p class="small" style="margin-top:4px">${t('organizes')} <b>${esc(g.organizer)}</b></p>`:''}
    <p class="muted small" style="margin-top:6px">${t('help',{email:SUPPORT})}</p></div>`
  :`${adHTML()}<button class="btn line" data-act="upgrade">${t('upgrade',{price:price()})}</button>`}
  <div class="stack" style="margin-top:10px">
    <button class="btn line" data-act="redraw">${t('redraw')}</button>
    <button class="btn line" data-act="spoiler">${t('spoiler')}</button>
  </div>`;
}
const avatar=(p,sz=38)=>`<div class="avatar" style="background:${colorFor(p.name)};width:${sz}px;height:${sz}px;font-size:16px;border-radius:12px">${esc(p.name[0]).toUpperCase()}</div>`;
// Estado de cada persona: abierto (servidor) > visto en el móvil > enviado > pendiente
function estado(g,p){
  if(apiOk&&g.synced&&g.opened&&g.opened[p.tok])return `<span class="st ok">${t('opened')}</span>`;
  if(g.seen&&g.seen[p.id])return `<span class="st ok">${t('seen')}</span>`;
  if(g.enviado&&g.enviado[p.id])return `<span class="st sent">${t('sentMark')}</span>`;
  return `<span class="st">${t('pending')}</span>`;
}
function marcarEnviado(g,ids){g.enviado=g.enviado||{};ids.forEach(id=>g.enviado[id]=1);save()}

// «Enviar resultados»: elegir cómo (WhatsApp, correo o pasando el móvil), cada opción explicada
function sendView(){
  const g=getGroup(view.id);if(!g)return homeView();
  const modo=view.modo;
  const atras=`<div class="top"><button class="back" data-act="${modo?'sendmenu':'togroup'}">‹</button><h2>${modo==='wa'?t('optWaT'):modo==='mail'?t('optMailT'):modo==='pass'?t('optPassT'):t('sendResultsT')}</h2></div>`;
  if(!modo)return atras+`<p class="muted" style="margin-bottom:14px">${t('sendHow')}</p>
    ${[['wa','💬',t('optWaT'),t('optWaX')],['mail','✉️',t('optMailT'),t('optMailX')],['pass','📱',t('optPassT'),t('optPassX')]].map(([m,e,ti,x])=>
      `<button class="opt" data-act="modo" data-m="${m}"><span class="e">${e}</span><span><b>${ti}</b><span class="muted small">${x}</span></span><span class="muted">›</span></button>`).join('')}`;
  if(modo==='pass')return atras+`<div class="howto">${t('passSteps')}</div>
    ${g.people.map(p=>`<button class="person ${g.seen&&g.seen[p.id]?'seen':''}" data-pass="${p.id}">${avatar(p)}
      <span class="name">${esc(p.name)}</span><span class="muted">${g.seen&&g.seen[p.id]?t('seen'):t('view')}</span></button>`).join('')}`;
  if(modo==='wa')return atras+`<div class="howto">${t('waSteps')}</div>
    ${g.people.map(p=>`<div class="prow">${avatar(p)}<span class="name">${esc(p.name)}<br>${estado(g,p)}</span>
      <button class="btn wa sm" data-act="wa" data-pid="${p.id}">${t('sendBtn')}</button>
      <button class="btn ghost sm" data-code="${p.id}" aria-label="${esc(t('more'))}">⋯</button></div>`).join('')}`;
  // Correo
  const conEmail=g.people.filter(p=>p.email);
  const servidor=apiOk&&g.synced;
  return atras+`<div class="howto">${t('mailSteps')}</div>
    ${servidor&&conEmail.length?`<button class="btn dark" data-act="sendall" style="margin-bottom:12px">${t('sendAll',{n:conEmail.length})}</button>`:''}
    ${!conEmail.length?`<p class="muted small" style="margin-bottom:10px">${t('noEmailsYet')}</p>`:''}
    ${g.people.map(p=>p.email?`<div class="prow">${avatar(p)}<span class="name">${esc(p.name)}<br><span class="muted small" style="font-weight:400">${esc(p.email)}</span></span>
        ${servidor?estado(g,p):`<a class="btn dark sm" href="mailto:${encodeURIComponent(p.email)}?subject=${encodeURIComponent(t('subject',{group:g.name}))}&body=${encodeURIComponent(msgFor(g,p))}" data-act="mailto" data-pid="${p.id}">${t('sendBtn')}</a>`}</div>`
      :`<div class="prow">${avatar(p)}<span class="name" style="min-width:0">${esc(p.name)}
        <span class="row" style="margin-top:6px;gap:6px"><input id="em-${p.id}" type="email" inputmode="email" autocapitalize="off" placeholder="${esc(t('emailPh'))}" style="height:40px;padding:8px 10px;font-size:15px">
        <button class="btn ghost sm" data-act="saveemail" data-pid="${p.id}">${t('saveBtn')}</button></span></span></div>`).join('')}`;
}

function metaLine(b,d){return `${b?esc(t('budgetLbl',{b})):''}${b&&d?' · ':''}${d?fmtDate(d):''}`}

// ---------- Servidor (api.php) ----------
const API_URL='api.php';
let apiOk=false;
async function api(a,params={},body=null){
  const qs=Object.entries(params).map(([k,v])=>'&'+k+'='+encodeURIComponent(v)).join('');
  const r=await fetch(API_URL+'?a='+a+qs,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
  if(!r.ok)throw new Error(r.status);const j=await r.json();if(j.error)throw new Error(j.error);return j;
}
const rnd=()=>uid()+uid()+uid();
function ensureIds(g){
  if(!g.key)g.key=rnd()+rnd();
  g.people.forEach(p=>{if(!p.tok)p.tok=rnd()});
}
async function syncGroup(g){
  if(!apiOk||!g.assignments)return;
  ensureIds(g);
  try{const r=await api('register',{},{d:g.id,k:g.key,people:g.people.map(p=>({t:p.tok,n:p.name,e:p.email||'',c:codeFor(g,p.id)}))});
    const cortos=r.cortos||{};g.people.forEach(p=>{if(cortos[p.tok])p.short=cortos[p.tok]});
    g.synced=true;save();
    if(['code','group','send'].includes(view.name)&&view.id===g.id)render()}catch(e){}
}
async function refreshStatus(id){
  const g=getGroup(id);if(!g||!apiOk)return;
  if(!g.synced)await syncGroup(g);
  if(!g.synced)return;
  try{const r=await api('status',{d:g.id,k:g.key});const before=JSON.stringify(g.opened||{});g.opened=r.opened||{};save();
    if(JSON.stringify(g.opened)!==before&&view.name==='group'&&view.id===id)render()}catch(e){}
}

// ---------- Enlaces, App Store y anuncios ----------
// Cuando tengas dominio propio, cambia LINK_BASE (p. ej. https://tudominio.com/s/) y configura ahí los Universal Links de iOS
// para que, si la app está instalada, el enlace se abra directamente en ella.
const LINK_BASE=(/^https?:$/.test(location.protocol)&&!/claude|anthropic|claudeusercontent/.test(location.hostname))
  ? location.origin+location.pathname          // en tu dominio: el enlace apunta a tu propia web
  : 'https://__DOMINIO__/sorteo/';
const APPSTORE_URL='https://apps.apple.com/app/id__APPSTORE_ID__'; // se pone al construir (variable APPSTORE_ID de GitHub)
const AD_SECONDS=5;
// Enlace corto (https://dominio/#Ab3xK9) cuando el servidor ya lo ha guardado; si no, el largo con todo dentro
const SHORT_BASE=LINK_BASE.replace(/\/sorteo\/.*$/,'/#');   // https://dominio/#Ab3xK9 (la portada lo pasa a /sorteo/)
const linkFor=(g,fromId)=>{const p=g.people.find(x=>x.id===fromId);
  return p&&p.short&&g.synced?SHORT_BASE+p.short:LINK_BASE+'#'+codeFor(g,fromId)};
const esCorto=h=>/^[0-9A-Za-z]{4,16}$/.test(h)&&!/^[0-9a-f]{40,}$/i.test(h);
// Abre el resultado de un enlace: código largo (todo dentro) o corto (se pide al servidor)
function abrirEnlace(h){
  if(!h)return false;
  if(/^[0-9a-f]{40,}$/i.test(h)){const d=decode(h);if(d){go({name:'mine',data:d});return true}return false}
  if(esCorto(h)){
    go({name:'mine',cargando:true});
    api('get',{s:h}).then(r=>{const d=r&&r.c?decode(r.c):null;go(d?{name:'mine',data:d}:{name:'mine',malo:true})})
      .catch(()=>go({name:'mine',malo:true}));
    return true;
  }
  return false;
}

function adNext(){if(view.name==='mine')view.stage='result';else view.adDone=true;render()}
function adView(){
  if(IS_APP){
    if(!view._adPedido){view._adPedido=true;setTimeout(()=>{const v=view;nativo('anuncio').then(()=>{if(view===v)adNext()})},0)}
    return `<div class="reveal"><img src="${LOGO}" alt="" style="width:110px;height:110px;border-radius:50%;opacity:.9"><p class="muted">${t('adLabel')}…</p></div>`;
  }
  return `<div class="adfull">
    <div class="adlabel">${t('adLabel')}</div>
    <div class="adbox"><div style="font-size:44px">📢</div><b>${t('adT')}</b><span>${t('adX',{price:price()})}</span></div>
    <button class="btn primary" id="adbtn" data-act="adnext" disabled>${t('adWait',{s:AD_SECONDS})}</button>
  </div>`;
}
let adTimer=null;
function startAdTimer(){
  clearInterval(adTimer);let s=AD_SECONDS;
  adTimer=setInterval(()=>{const b=document.getElementById('adbtn');if(!b){clearInterval(adTimer);return}
    s--;if(s<=0){clearInterval(adTimer);b.disabled=false;b.textContent=t('adContinue')}else b.textContent=t('adWait',{s})},1000);
}

function passView(){
  const g=getGroup(view.id),p=g.people.find(x=>x.id===view.pid);
  if(!view.open)return `<div class="top"><button class="back" data-act="togroup">‹</button></div>
  <div class="reveal"><p class="muted">${t('onlyLook')}</p><h1>${esc(p.name)}</h1>
  ${giftHTML()}<p class="muted">${t('tapGift')}</p></div>`;
  if(!g.premium&&!view.adDone)return adView();
  return `<div class="reveal">
  <div class="result"><div class="meta">${esc(t('youGive',{name:p.name}))}</div><div class="to">${esc(pName(g,g.assignments[p.id]))}</div>
  <div class="meta">${metaLine(g.budget,g.date)}</div></div>
  <p class="muted small">${t('memorize')}</p>
  <button class="btn dark" data-act="hide">${t('hide')}</button></div>`;
}

// Textos del correo «corporativo» (el servidor monta el diseño)
function htmlFor(g,p){
  const datos=[g.budget?t('budgetLbl',{b:g.budget}):'',g.date?t('mailDate',{d:fmtDate(g.date)}):''].filter(Boolean);
  return {lang:LANG,hola:t('mailHello',{name:p.name}),intro:t('mailIntro',{group:g.name}),datos,boton:t('mailBtn'),link:linkFor(g,p.id),
    nota:g.premium?'':t('msgNeedApp').trim(),secreto:t('mailSecret'),
    org:g.premium&&g.organizer?t('msgOrg',{o:g.organizer}).trim():'',pie:t('mailFooter')};
}
function msgFor(g,p){
  const extra=(g.budget?t('msgBudget',{b:g.budget}):'')+(g.date?t('msgDate',{d:fmtDate(g.date)}):'');
  const org=g.premium&&g.organizer?t('msgOrg',{o:g.organizer}):'';
  const app=g.premium?'':t('msgNeedApp');
  return t('msg',{name:p.name,group:g.name,extra:extra+app,org,link:linkFor(g,p.id)});
}
function codeView(){
  const g=getGroup(view.id),p=g.people.find(x=>x.id===view.pid);
  ensureIds(g);
  const link=linkFor(g,p.id);
  const msg=msgFor(g,p);
  view._msg=msg;view._link=link;
  return `<div class="top"><button class="back" data-act="togroup">‹</button><h2>${esc(t('linkOf',{name:p.name}))}</h2></div>
  <div class="card stack">
    <p class="muted small">${esc(t('linkWarn',{name:p.name}))}</p>
    ${p.email&&apiOk&&g.synced?`<button class="btn dark" data-act="mailone">${t('sendEmail')}</button>
    <p class="muted small" style="text-align:center;margin-top:4px">${esc(p.email)}</p>`:p.email?`<a class="btn dark" href="mailto:${encodeURIComponent(p.email)}?subject=${encodeURIComponent(t('subject',{group:g.name}))}&body=${encodeURIComponent(msg)}">${t('sendEmail')}</a>
    <p class="muted small" style="text-align:center;margin-top:4px">${esc(p.email)}</p>`:''}
    <a class="btn wa" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">${t('sendWa')}</a>
    ${IS_APP?`<button class="btn ghost" data-act="sharemsg">${t('shareMsg')}</button>`:''}
    <button class="btn ghost" data-act="copymsg">${t('copyMsg')}</button>
  </div>`;
}

function mineView(){
  const d=view.data;
  const logoGrande=`<img src="${LOGO}" alt="" style="width:120px;height:120px;border-radius:50%;box-shadow:0 8px 24px rgba(11,58,122,.2)">`;
  if(view.cargando)return `<div class="reveal">${logoGrande}<p class="muted">${t('loading')}</p></div>`;
  if(view.malo||!d)return `<div class="reveal">${logoGrande}<h2>${t('linkBadT')}</h2><p class="muted">${t('linkBadX')}</p>
    ${IS_APP?`<button class="btn line" data-act="home">${t('makeOwn')}</button>`:`<a class="btn dark" href="${APPSTORE_URL}" target="_blank" rel="noopener">${t('getApp')}</a>`}</div>`;
  // En el navegador: solo los sorteos premium enseñan el resultado; los gratis, solo en la app (con anuncio)
  const stage=view.stage||(IS_APP||d.p?'gift':'web');
  if(stage==='web')return `<div class="reveal">
    ${logoGrande}
    <h1>${esc(t('hello',{name:d.f}))}</h1>
    <p class="muted">${esc(t('linkIntro',{group:d.g}))}</p>
    <p style="font-weight:600">${t('needApp')}</p>
    <a class="btn primary" href="${APPSTORE_URL}" target="_blank" rel="noopener">${t('getApp')}</a>
    <a class="btn line" href="secretoogift://r${esc(location.hash)}">${t('openApp')}</a></div>`;
  if(stage==='gift')return `<div class="reveal"><p class="muted">${esc(d.g)}</p><h1>${esc(t('hello',{name:d.f}))}</h1>${giftHTML()}<p class="muted">${t('tapOpen')}</p></div>`;
  if(stage==='ad')return adView();
  if(d.i&&d.o&&!view.pinged){view.pinged=true;api('open',{d:d.i,t:d.o}).catch(()=>{})}
  return `${IS_APP?`<div class="top"><button class="back" data-act="home">‹</button></div>`:''}<div class="reveal">
    <div class="result"><div class="meta">${esc(t('youGive',{name:d.f}))}</div><div class="to">${esc(d.t)}</div>
    <div class="meta">${metaLine(d.b,d.d)}</div></div>
    <p class="muted small">${t('secret')}</p>
    ${IS_APP?`<button class="btn line" data-act="home">${t('makeOwn')}</button>`:`<a class="btn line" href="${APPSTORE_URL}" target="_blank" rel="noopener">${t('makeOwnWeb')}</a>`}</div>`;
}

// ---------- Nuevo sorteo paso a paso ----------
const PASOS=4;
const vuelta=()=>view.name==='nuevo'?{name:'nuevo',paso:view.paso}:{name:'edit'};
const sw=(k,on)=>`<button class="sw ${on?'on':''}" data-act="wztog" data-k="${k}" role="switch" aria-checked="${on}"><i></i></button>`;
function exclusionesHTML(g){
  if(!g.premium)return `<button class="btn line" data-act="unlock" style="margin-top:14px">${t('wzExcl')}</button>`;
  if(g.people.length<3)return '';
  const opts=g.people.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
  return `<div class="card" style="margin-top:14px"><h3>${t('exTitle')}</h3>
    <p class="muted small" style="margin-top:4px">${t('exSub')}</p>
    <div class="grid2" style="margin-top:12px"><select id="ex1">${opts}</select><select id="ex2">${opts}</select></div>
    <button class="btn ghost sm" data-act="addex" style="margin-top:10px">${t('addEx')}</button>
    <div style="margin-top:12px">${g.exclusions.map((e,i)=>`<span class="chip">${esc(pName(g,e[0]))} ⇄ ${esc(pName(g,e[1]))}<button data-delex="${i}" aria-label="${esc(t('remove'))}">✕</button></span>`).join('')}</div></div>`;
}
function wizardView(){
  const g=draft,paso=view.paso||1;
  const cab=`<div class="wz-top">${paso>1?`<button class="back" data-act="wzback">‹</button>`:'<span style="width:40px"></span>'}
    <div class="wz-mid"><div class="wz-t">${esc(paso>1&&g.name?g.name:t('newTitle'))}</div><div class="wz-bar"><i style="width:${paso/PASOS*100}%"></i></div></div>
    <button class="back" data-act="home" aria-label="✕">✕</button></div>`;
  const pista=x=>`<p class="wz-hint">ℹ️ ${x}</p>`;
  let cuerpo='',listo=true,boton=t('next');
  if(paso===1){
    cuerpo=`<h1 class="wz-h">${t('wzStep1T')}</h1>
      <input id="wz-name" class="wz-in" placeholder="${esc(t('wzPh'))}" value="${esc(g.name)}" maxlength="40" enterkeyhint="next" autocomplete="off">
      ${pista(t('wzStep1Hint'))}`;
    listo=!!g.name.trim();
  }else if(paso===2){
    cuerpo=`<h1 class="wz-h">${t('wzStep2T')}</h1>
      <div class="wz-row"><span>💰 ${t('wzBudget')}</span>${sw('conPres',g.conPres)}</div>
      ${g.conPres?`<div class="wz-sub"><input id="wz-budget" placeholder="${esc(t('budgetPh'))}" value="${esc(g.budget)}" maxlength="15">
        <div class="quick">${budgetChips().map(v=>`<button class="qc ${g.budget===v?'on':''}" data-act="bud" data-v="${esc(v)}">${esc(v)}</button>`).join('')}</div></div>`:''}
      <div class="wz-row"><span>📅 ${t('wzDate')}</span>${sw('conFecha',g.conFecha)}</div>
      ${g.conFecha?`<div class="wz-sub"><input id="wz-date" type="date" value="${esc(g.date)}">
        <div class="quick">${dateChips().map(v=>`<button class="qc ${g.date===v?'on':''}" data-act="dt" data-v="${v}">${esc(fmtDate(v,true))}</button>`).join('')}</div></div>`:''}`;
  }else if(paso===3){
    cuerpo=`<h1 class="wz-h">${t('wzStep3T')}</h1>
      <input id="wz-org" class="wz-in" placeholder="${esc(t('wzPh'))}" value="${esc(g.organizer||'')}" maxlength="24" enterkeyhint="next" autocomplete="off">
      <div class="wz-row"><span>🙋 ${t('wzImIn')}</span>${sw('participa',g.participa)}</div>
      ${pista(g.participa?t('wzStep3Hint'):t('wzStep3HintNo'))}`;
    listo=!!(g.organizer||'').trim();
  }else{
    const n=g.people.length;
    cuerpo=`<h1 class="wz-h">${t('wzStep4T')}</h1>
      <div class="burbujas">${g.people.map(p=>`<div class="burbuja">${avatar(p,32)}<span class="bn">${esc(p.name)}${p.yo?` <span class="muted" style="font-weight:400">${t('you')}</span>`:''}${p.email?`<small>${esc(p.email)}</small>`:''}</span>
        ${p.yo?'':`<button class="bx" data-delp="${p.id}" aria-label="${esc(t('remove'))}">✕</button>`}</div>`).join('')}</div>
      <div class="card" style="margin-top:12px">
        <h3 style="margin-bottom:10px">${t('wzAddT')} <span class="muted" style="font-weight:500">· ${t('wzCount',{n})}</span></h3>
        <div class="row" style="align-items:stretch">
          <div style="flex:1" class="stack"><input id="pname" placeholder="${esc(t('namePh'))}" maxlength="24" enterkeyhint="next">
          <input id="pemail" type="email" inputmode="email" autocapitalize="off" placeholder="${esc(t('emailPh'))}" maxlength="80" enterkeyhint="done"></div>
          <button class="btn dark sm" data-act="addp">${t('add')}</button>
        </div>
      </div>
      <div id="err"></div>
      ${exclusionesHTML(g)}
      ${pista(t('wzStep4Hint'))}`;
    listo=n>=3;
    boton=listo?t('wzDraw'):t('wzNeed',{n:3-n});
  }
  return cab+`<div class="wz-body">${cuerpo}</div>
    <div class="sticky"><div class="inner"><button class="btn primary big" id="wz-next" data-act="${paso<PASOS?'wznext':'savedraw'}" ${listo?'':'disabled'}>${boton}</button></div></div>`;
}

// ---------- Eventos ----------
function readDraftFields(){
  readWizard();
  const n=document.getElementById('gname');if(!n)return;
  draft.name=n.value;draft.budget=document.getElementById('gbudget').value;draft.date=document.getElementById('gdate').value;
  const o=document.getElementById('gorg');if(o)draft.organizer=o.value.trim();
}
function readWizard(){
  if(!draft)return;
  const v=id=>{const e=document.getElementById(id);return e?e.value:null};
  if(v('wz-name')!==null)draft.name=v('wz-name');
  if(v('wz-budget')!==null)draft.budget=v('wz-budget');
  if(v('wz-date')!==null)draft.date=v('wz-date');
  if(v('wz-org')!==null)draft.organizer=v('wz-org').trim();
}
// El organizador como participante («Tú»), siempre el primero y con el mismo id
function ponerOrganizador(){
  draft.people=draft.people.filter(p=>!p.yo);
  if(draft.participa&&(draft.organizer||'').trim()){
    draft.yoId=draft.yoId||uid();
    draft.people.unshift({id:draft.yoId,name:draft.organizer.trim(),yo:true});
  }else draft.exclusions=draft.exclusions.filter(x=>!x.includes(draft.yoId));
}
function showErr(m){const e=document.getElementById('err');if(e)e.innerHTML=`<p class="err">${esc(m)}</p>`}
function addPerson(){
  readDraftFields();
  const i=document.getElementById('pname');const n=i.value.trim();if(!n)return;
  const em=(document.getElementById('pemail').value||'').trim();
  if(em&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)){showErr(t('errEmail'));return}
  if(draft.people.some(p=>p.name.toLowerCase()===n.toLowerCase())){showErr(t('errDup'));return}
  if(!draft.premium&&draft.people.length>=FREE_MAX){
    const vv=vuelta();openPaywall({target:'draft',back:vv,after:()=>{draft.people.push({id:uid(),name:n,email:em});go(vv)}});return}
  draft.people.push({id:uid(),name:n,email:em});render();setTimeout(()=>document.getElementById('pname').focus(),0);
}
async function sendMails(g,list){
  try{const r=await api('mail',{},{d:g.id,k:g.key,items:list.map(p=>({t:p.tok,s:t('subject',{group:g.name}),b:msgFor(g,p),h:htmlFor(g,p)}))});
    if(r.sent>0)marcarEnviado(g,list.map(p=>p.id));
    toast(r.sent>0?t('toastSent',{n:r.sent}):t('sendFail'));render()}catch(e){toast(t('sendFail'))}
}
function doDraw(g){
  const res=draw(g);
  if(!res)return false;
  g.assignments=res;g.seen={};g.drawnAt=Date.now();ensureIds(g);g.synced=false;g.opened={};return true;
}

function bind(){
  const a=document.getElementById('app');
  a.onclick=e=>{
    const el=e.target.closest('[data-act],[data-open],[data-delp],[data-delex],[data-tab],[data-pass],[data-code],.gift');if(!el)return;
    const act=el.dataset.act;
    if(el.classList.contains('gift')){if(view.name==='mine'){view.stage=(view.data.p||!IS_APP)?'result':'ad'}else view.open=true;render();return}
    if(el.dataset.open){go({name:'group',id:el.dataset.open,tab:'pass'});return}
    if(el.dataset.tab){view.tab=el.dataset.tab;render();return}
    if(el.dataset.pass){go({name:'pass',id:view.id,pid:el.dataset.pass,from:{name:'send',id:view.id,modo:'pass'}});return}
    if(el.dataset.code){go({name:'code',id:view.id,pid:el.dataset.code,from:{name:view.name,id:view.id,modo:view.modo}});return}
    if(el.dataset.delp){readDraftFields();const id=el.dataset.delp;draft.people=draft.people.filter(p=>p.id!==id);draft.exclusions=draft.exclusions.filter(x=>!x.includes(id));render();return}
    if(el.dataset.delex){readDraftFields();draft.exclusions.splice(+el.dataset.delex,1);render();return}
    switch(act){
      case 'new':draft={_new:true,id:rnd(),name:'',budget:'',date:'',people:[],exclusions:[],assignments:null,seen:{},participa:true,organizer:''};go({name:'nuevo',paso:1});break;
      case 'wznext':{readWizard();
        if(view.paso===1&&!draft.name.trim())return;
        if(view.paso===2){if(!draft.conPres)draft.budget='';if(!draft.conFecha)draft.date=''}
        if(view.paso===3){if(!(draft.organizer||'').trim())return;ponerOrganizador()}
        go({name:'nuevo',paso:view.paso+1});setTimeout(()=>{const f=document.querySelector('.wz-in');if(f)f.focus()},50);break}
      case 'wzback':readWizard();go({name:'nuevo',paso:Math.max(1,view.paso-1)});break;
      case 'wztog':readWizard();draft[el.dataset.k]=!draft[el.dataset.k];
        if(el.dataset.k==='conPres'&&draft.conPres&&!draft.budget)draft.budget=budgetChips()[1];
        if(el.dataset.k==='conFecha'&&draft.conFecha&&!draft.date)draft.date=dateChips()[0];
        render();break;
      case 'home':go({name:'home'});break;
      case 'back':if(draft&&!draft._new)go({name:'group',id:draft.id,tab:'pass'});else go({name:'home'});break;
      case 'addp':addPerson();break;
      case 'addex':{readDraftFields();const x=document.getElementById('ex1').value,y=document.getElementById('ex2').value;
        if(x===y){showErr(t('errSame'));return}
        if(draft.exclusions.some(e=>e.includes(x)&&e.includes(y))){showErr(t('errExists'));return}
        draft.exclusions.push([x,y]);render();break}
      case 'savedraw':{readDraftFields();const vv=vuelta();
        if(!draft.premium)draft.organizer=draft.organizer||'';
        delete draft.conPres;delete draft.conFecha;
        if(!draft.name.trim()){showErr(t('errName'));return}
        if(draft.people.length<3){showErr(t('errMin3'));return}
        const finish=()=>{
          const g=JSON.parse(JSON.stringify(draft));const isNew=g._new;delete g._new;
          if(!doDraw(g)){go(vv);setTimeout(()=>showErr(t('errImpossible')),0);return}
          if(isNew)state.groups.unshift(g);else{const i=state.groups.findIndex(x=>x.id===g.id);state.groups[i]=g}
          save();syncGroup(g);draft=null;toast(t('toastDone'));go({name:'group',id:g.id});
        };
        if(draft._new&&!draft.premium)openPaywall({target:'draft',back:vv,after:finish,allowFree:true,onFree:finish});
        else finish();
        break}
      case 'upgrade':{const id=view.id,tab=view.tab;openPaywall({target:id,back:{name:'group',id,tab},after:()=>go({name:'group',id,tab})});break}
      case 'unlock':{readDraftFields();const vv=vuelta();openPaywall({target:'draft',back:vv,after:()=>go(vv)});break}
      case 'pwback':go(view.back);break;
      case 'pwfree':view.onFree();break;
      case 'pwbuy':{const v=view;buyPremium(()=>{
        if(v.target==='draft')draft.premium=true;else{const g=getGroup(v.target);g.premium=true;g.synced=false;save();syncGroup(g)}
        v.after();});break}
      case 'edit':{const g=getGroup(view.id);
        if(!g.premium){const id=g.id;openPaywall({target:id,back:{name:'group',id,tab:view.tab},after:()=>{draft=JSON.parse(JSON.stringify(getGroup(id)));draft._new=false;go({name:'edit'})}});break}
        const go2=()=>{draft=JSON.parse(JSON.stringify(g));draft._new=false;go({name:'edit'})};
        if(g.assignments&&Object.keys(g.seen||{}).length)modal({title:t('mEditT'),text:esc(t('mEditX')),ok:t('mEditOk'),onOk:go2});else go2();break}
      case 'delgroup':modal({title:t('mDelT'),text:esc(t('mDelX')),ok:t('mDelOk'),danger:true,onOk:()=>{state.groups=state.groups.filter(x=>x.id!==draft.id);save();draft=null;go({name:'home'})}});break;
      case 'redraw':modal({title:t('mRedrawT'),text:esc(t('mRedrawX')),ok:t('mRedrawOk'),danger:true,onOk:()=>{const g=getGroup(view.id);doDraw(g);save();syncGroup(g);toast(t('toastRedraw'));render()}});break;
      case 'spoiler':modal({title:t('mSpoilT'),text:esc(t('mSpoilX')),ok:t('mSpoilOk'),onOk:()=>{const g=getGroup(view.id);
        modal({title:t('results'),text:`<div style="margin-top:8px">${g.people.map(p=>`<div class="list-res"><span>${esc(p.name)}</span><span>→ ${esc(pName(g,g.assignments[p.id]))}</span></div>`).join('')}</div>`,ok:t('close'),noCancel:true})}});break;
      case 'togroup':go(view.from||{name:'group',id:view.id});break;
      case 'enviar':go({name:'send',id:view.id});break;
      case 'sendmenu':go({name:'send',id:view.id});break;
      case 'modo':go({name:'send',id:view.id,modo:el.dataset.m});break;
      case 'wa':{const g=getGroup(view.id),p=g.people.find(x=>x.id===el.dataset.pid);
        const url='https://wa.me/?text='+encodeURIComponent(msgFor(g,p));
        marcarEnviado(g,[p.id]);if(IS_APP)nativo('abrir',{url});else window.open(url,'_blank');render();break}
      case 'mailto':{const g=getGroup(view.id);marcarEnviado(g,[el.dataset.pid]);setTimeout(render,300);break}
      case 'saveemail':{const g=getGroup(view.id),p=g.people.find(x=>x.id===el.dataset.pid);
        const v=(document.getElementById('em-'+p.id).value||'').trim();
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)){toast(t('errEmail'));return}
        p.email=v;g.synced=false;save();render();syncGroup(g);break}
      case 'hide':{const g=getGroup(view.id);g.seen=g.seen||{};g.seen[view.pid]=true;save();go(view.from||{name:'send',id:view.id,modo:'pass'});break}
      case 'copymsg':copy(view._msg,t('copiedMsg'));break;
      case 'sharemsg':nativo('compartir',{texto:view._msg});break;
      case 'adnext':adNext();break;
      case 'webgo':view.stage='gift';render();break;
      case 'refresh':refreshStatus(view.id);toast('↻');break;
      case 'sendall':{const g=getGroup(view.id);const list=g.people.filter(p=>p.email);
        modal({title:t('mSendAllT'),text:esc(t('mSendAllX',{n:list.length})),ok:t('mSendAllOk'),onOk:()=>sendMails(g,list)});break}
      case 'mailone':{const g=getGroup(view.id);sendMails(g,[g.people.find(x=>x.id===view.pid)]);break}
      case 'bud':readDraftFields();draft.budget=el.dataset.v;render();break;
      case 'dt':readDraftFields();draft.date=el.dataset.v;render();break;
    }
  };
  ['wz-name','wz-org'].forEach(id=>{const f=document.getElementById(id);if(!f)return;
    const b=document.getElementById('wz-next');
    f.oninput=()=>{if(b)b.disabled=!f.value.trim()};
    f.onkeydown=e=>{if(e.key==='Enter'&&f.value.trim()){e.preventDefault();b&&b.click()}};
  });
  const pi=document.getElementById('pname');
  if(pi)pi.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();document.getElementById('pemail').focus()}};
  const pe=document.getElementById('pemail');
  if(pe)pe.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();addPerson()}};
  if(document.getElementById('adbtn'))startAdTimer();
  const ls=document.getElementById('lang');
  if(ls)ls.onchange=e=>setLang(e.target.value);
}

// Arranque. Si se abre con un código en el enlace (#codigo), mostrarlo directamente
(function init(){
  document.documentElement.lang=LANG;document.title=t('appName');
  const h=(location.hash||'').slice(1);
  if(!abrirEnlace(h)){
    // Sin enlace de resultado: en tu web, a la portada para descargar la app (los sorteos solo se hacen en la app)
    if(enWebPropia){location.replace(location.origin+'/');return}
    render();
  }
  api('ping').then(()=>{apiOk=true;state.groups.forEach(g=>{if(g.assignments&&!g.synced)syncGroup(g)});if(view.name==='group'){refreshStatus(view.id);render()}if(view.name==='code')render()}).catch(()=>{});
  window.addEventListener('hashchange',()=>abrirEnlace((location.hash||'').slice(1)));
})();
