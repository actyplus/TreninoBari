(() => {
  'use strict';
  const consentKey='tb-stats-consent-v1', visitKey='tb-stats-visit-v1';
  const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
  let enabled=false, busy=false, revision=0, accountId=null;
  const page=crypto.randomUUID();
  const read=key=>{try{return localStorage.getItem(key);}catch{return null;}};
  const write=(key,value)=>{try{localStorage.setItem(key,value);return true;}catch{return false;}};
  const remove=key=>{try{localStorage.removeItem(key);}catch{}};
  enabled=read(consentKey)==='yes';
  const panels=[];
  for(const view of ['home','community']) {
    const host=document.getElementById('view-'+view);
    if(!host)continue;
    const panel=document.createElement('section');
    panel.className='section tb-traffic';panel.setAttribute('aria-label','Visite e presenze sul sito');
    panel.innerHTML='<div class="section-head"><h2>🐓 Insieme su Trenino Bari</h2><small>Presenze stimate · ultimi 2 minuti</small></div><div class="tb-traffic-grid"><div><strong data-count="members">—</strong><span>Utenti con accesso</span></div><div><strong data-count="guests">—</strong><span>Ospiti online</span></div><div><strong data-count="visits">—</strong><span>Visite totali misurate</span></div><div><strong data-count="pageviews">—</strong><span>Pagine aperte</span></div></div><p data-status role="status">Verifica statistiche…</p><details><summary>Come vengono contate · Preferenze</summary><p>Contiamo anche gli ospiti che scelgono di partecipare alle statistiche. Una visita termina dopo 30 minuti senza attività; ricaricare la pagina aumenta le pagine aperte, non crea subito una nuova visita. Gli utenti con accesso sono deduplicati per account; gli ospiti per browser. Le presenze indicano una pagina visibile negli ultimi 2 minuti, non persone identificate con certezza.</p><p>Con il tuo consenso salviamo un identificativo casuale temporaneo nel browser e inviamo segnali di presenza a TB. Non usiamo questi dati per pubblicità. Puoi disattivare le statistiche in qualsiasi momento; accesso e sito continuano a funzionare.</p></details><div class="tb-traffic-consent"><span data-choice></span><button type="button" data-enable>Consenti statistiche</button><button type="button" data-disable>Non partecipare</button></div>';
    const first=host.querySelector('.section');
    if(first)first.before(panel);else host.append(panel);
    panels.push(panel);
  }
  const all=selector=>panels.flatMap(p=>[...p.querySelectorAll(selector)]);
  function preferences(){
    all('[data-choice]').forEach(el=>el.textContent=enabled?'Partecipi alle statistiche facoltative.':'Statistiche facoltative: scegli se partecipare.');
    all('[data-enable]').forEach(el=>el.hidden=enabled);
    all('[data-disable]').forEach(el=>{el.hidden=read(consentKey)==='no';el.textContent=enabled?'Disattiva statistiche':'Non partecipare';});
  }
  function visitor(){
    let value;
    try{value=JSON.parse(read(visitKey));}catch{}
    if(!uuid.test(value?.id||'') || !Number.isFinite(value?.last) || Date.now()-value.last>1800000) value={id:crypto.randomUUID()};
    value.last=Date.now();
    if(!write(visitKey,JSON.stringify(value)))throw new Error('STORAGE');
    return value.id;
  }
  function render(data){
    if(!['members','guests','visits','pageviews'].every(k=>Number.isSafeInteger(data[k])&&data[k]>=0))throw new Error('INVALID_DATA');
    for(const k of ['members','guests','visits','pageviews'])all('[data-count="'+k+'"]').forEach(el=>el.textContent=data[k].toLocaleString('it-IT'));
    const since=data.started_at?new Date(data.started_at).toLocaleDateString('it-IT'):null;
    all('[data-status]').forEach(el=>el.textContent=(since?'Dati raccolti dal '+since+'. ':'Nessuna visita ancora misurata. ')+'Solo visitatori che partecipano alle statistiche.');
  }
  function unavailable(){
    all('[data-count]').forEach(el=>el.textContent='—');
    all('[data-status]').forEach(el=>el.textContent='Statistiche non ancora disponibili. Nessun numero stimato viene mostrato come dato reale.');
  }
  async function poll(){
    if(busy || document.hidden)return;
    busy=true;const ticket=revision;
    try {
      let options={cache:'no-store',signal:AbortSignal.timeout(15000)};
      if(enabled && !document.documentElement.classList.contains('tb-auth-loading')) {
        const id=visitor(), user=window.TBAuth?.user;
        const token=user?await window.TBAuth.token():null;
        if(user&&!token)throw new Error('SESSION');
        if(ticket!==revision)return;
        options={...options,method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({action:'beat',visitor:id,page,consent:true})};
      }
      const response=await fetch('/api/traffic',options);
      if(!response.ok || response.status===204)throw new Error('UNAVAILABLE');
      const data=await response.json();if(ticket===revision)render(data);
    }catch{if(ticket===revision)unavailable();}
    finally{busy=false;if(ticket!==revision)poll();}
  }
  async function choose(value){
    const old=read(visitKey);
    if(!write(consentKey,value?'yes':'no')) {all('[data-choice]').forEach(el=>el.textContent='Il browser non consente di salvare questa preferenza. Statistiche disattivate.');enabled=false;return;}
    enabled=value;revision++;preferences();
    if(!value){
      remove(visitKey);
      // Remove current presence on consent withdrawal; aggregate totals remain.
      try{const id=JSON.parse(old)?.id;if(uuid.test(id||''))await fetch('/api/traffic',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'leave',visitor:id,page,consent:true}),signal:AbortSignal.timeout(15000)});}catch{}
    }
    poll();
  }
  all('[data-enable]').forEach(el=>el.onclick=()=>choose(true));
  all('[data-disable]').forEach(el=>el.onclick=()=>choose(false));
  window.addEventListener('tb:auth',()=>{
    const id=window.TBAuth?.user?.id||null;
    if(accountId!==id){accountId=id;revision++;}
    poll();
  });
  window.addEventListener('storage',event=>{
    if(event.key!==consentKey)return;
    enabled=read(consentKey)==='yes';revision++;preferences();poll();
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();});
  window.addEventListener('pageshow',()=>poll());
  preferences();poll();setInterval(poll,60000);
})();
