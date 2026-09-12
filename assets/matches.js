/* TB Partite: the editorial calendar and result rows remain the data source. */
(() => {
  'use strict';
  const view = document.getElementById('view-matches');
  if (!view) return;
  const zone = 'Europe/Rome';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dayKey = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
  const dateLabel = (key, opts = {}) => new Intl.DateTimeFormat('it-IT', {timeZone:zone,day:'numeric',month:'long',...opts}).format(new Date(key+'T12:00:00Z'));
  const safeURL = raw => { try { const u = new URL(raw); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };
  const matches = [...view.querySelectorAll('.mday.has-fixture[data-date]')].map(day => {
    const parts = day.title.split(' · '), teams = parts[0].split(' - ');
    const time = parts.find(p => /^\d{2}:\d{2}$/.test(p)) || '';
    return {date:day.dataset.date,home:teams[0],away:teams[1],competition:parts[1] || 'Serie C',time,
      source:safeURL(day.dataset.source),round:day.dataset.round || '',result:day.dataset.result || '',notes:''};
  }).filter(m => m.home && m.away).sort((a,b)=>a.date.localeCompare(b.date));
  view.querySelectorAll('.match-row[data-date]').forEach(row => {
    const m = matches.find(m=>m.date===row.dataset.date && row.querySelector('.match-main b')?.textContent.trim()===m.home+' - '+m.away);
    if (!m) return;
    m.result=row.querySelector('.result')?.textContent.trim() || '';
    m.notes=row.querySelector('.match-main small')?.textContent.trim() || '';
    m.source=safeURL(row.dataset.source) || m.source;
  });
  let today=dayKey(), month=today.slice(0,7), selected=today, mode='calendar', filter='all';
  const root=document.createElement('div'); root.id='tb-match-center';
  root.innerHTML=`<header class="tm-heading"><div><h2>⚽ Partite del Bari</h2><p id="tm-today-label"></p></div><span class="tm-season">Prima squadra · 2026/27</span></header>
    <div class="tm-highlights" id="tm-highlights"></div>
    <section class="tm-panel" aria-label="Calendario e risultati del Bari">
      <div class="tm-toolbar"><div class="tm-month-nav"><button type="button" data-action="prev" aria-label="Mese precedente">‹</button><label class="tm-month-select"><span class="tm-sr">Scegli mese</span><select id="tm-month"></select></label><button type="button" data-action="next" aria-label="Mese successivo">›</button></div><button type="button" data-action="today">📍 Oggi</button></div>
      <div class="tm-options"><div class="tm-segments" aria-label="Vista partite"><button type="button" data-mode="calendar" aria-pressed="true">🗓 Calendario</button><button type="button" data-mode="list" aria-pressed="false">☷ Elenco</button></div><label>Mostra <select id="tm-filter"><option value="all">Tutte le gare</option><option value="home">🏠 In casa</option><option value="away">🚌 In trasferta</option><option value="league">Serie C</option><option value="cup">🏆 Coppa Italia</option></select></label></div>
      <p class="tm-month-info" id="tm-month-info" aria-live="polite"></p><div id="tm-calendar"></div><div id="tm-agenda" hidden></div>
      <p class="tm-legend">🔴 Oggi <span>🏠 Casa</span><span>🚌 Trasferta</span><span>🏆 Coppa</span> · Tocca una gara per i dettagli</p>
    </section><section id="tm-detail" class="tm-detail" aria-label="Dettaglio giorno" aria-live="polite"></section>
    <div id="tm-share-status" role="status"></div><p class="tm-footnote">Orari italiani. Le gare senza orario restano da confermare; il risultato compare solo dopo un aggiornamento verificato. Scorri a destra o sinistra sul calendario per cambiare mese.</p>`;
  view.prepend(root);
  const $=id=>root.querySelector('#'+id);
  const isHome=m=>m.home.toLowerCase()==='bari';
  const isCup=m=>/coppa/i.test(m.competition);
  const passes=m=>filter==='all'||filter==='home'&&isHome(m)||filter==='away'&&!isHome(m)||filter==='cup'&&isCup(m)||filter==='league'&&!isCup(m);
  const meta=m=>`${isCup(m)?'🏆 Coppa Italia':'Serie C'}${m.round?' · '+m.round:''} · ${isHome(m)?'🏠 In casa':'🚌 Trasferta'}`;
  const status=m=>m.result?'Finale':m.date<today?'Risultato da aggiornare':m.date===today?'In programma oggi':'In programma';
  const nextMatch=()=>matches.find(m=>!m.result && (m.date>today || m.date===today));
  const statusScore=m=>m.result || (m.time?'ore '+m.time:'Orario da confermare');
  const shortCard=(m,label,featured=false)=>m?`<button type="button" class="tm-feature ${featured?'tm-feature-next':''}" data-select="${m.date}"><span class="tm-eyebrow">${esc(label)}</span><strong>${esc(m.home)} – ${esc(m.away)}</strong><span class="tm-score">${esc(statusScore(m))}</span><span>${esc(dateLabel(m.date,{weekday:'short'}))} · ${esc(meta(m))}</span><span class="tm-open">Apri dettagli ↗</span></button>`:'';
  function renderHighlights(){
    $('tm-today-label').textContent='Oggi è '+dateLabel(today,{weekday:'long',year:'numeric'});
    const next=nextMatch(), last=[...matches].reverse().find(m=>m.result && m.date<=today);
    const days=next?Math.round((Date.parse(next.date+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000):0;
    $('tm-highlights').innerHTML=shortCard(next,days===0?'Si gioca oggi':days===1?'Prossima gara · domani':'Prossima gara · tra '+days+' giorni',true)+shortCard(last,'Ultimo risultato');
    if(!next) $('tm-highlights').insertAdjacentHTML('afterbegin','<p class="tm-empty">Nessun prossimo incontro pubblicato. Il calendario verrà aggiornato con le nuove date.</p>');
  }
  function monthOptions(){
    const keys=new Set([...view.querySelectorAll('.month-card[id]')].map(c=>c.id.replace('month-','')));
    keys.add(month);keys.add(today.slice(0,7));
    $('tm-month').innerHTML=[...keys].sort().map(k=>`<option value="${k}"${k===month?' selected':''}>${esc(dateLabel(k+'-01',{month:'long',year:'numeric',day:undefined}))}</option>`).join('');
  }
  function render(){
    monthOptions();
    const visible=matches.filter(m=>m.date.startsWith(month)&&passes(m));
    $('tm-month-info').textContent=`${dateLabel(month+'-01',{month:'long',year:'numeric',day:undefined})} · ${visible.length} ${visible.length===1?'gara':'gare'}${filter!=='all'?' con questo filtro':''}`;
    root.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
    $('tm-calendar').hidden=mode!=='calendar';$('tm-agenda').hidden=mode!=='list';
    const [year,mon]=month.split('-').map(Number), total=new Date(Date.UTC(year,mon,0)).getUTCDate(), offset=(new Date(Date.UTC(year,mon-1,1)).getUTCDay()+6)%7;
    let cells=['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].map(d=>`<span class="tm-weekday">${d}</span>`).join('')+'<span aria-hidden="true"></span>'.repeat(offset);
    for(let n=1;n<=total;n++){
      const key=month+'-'+String(n).padStart(2,'0'),m=visible.find(m=>m.date===key),opponent=m?(isHome(m)?m.away:m.home):'';
      const aria=dateLabel(key,{weekday:'long',year:'numeric'})+(key===today?', oggi':'')+(m?`, ${m.home} – ${m.away}, ${status(m)}, ${statusScore(m)}`:', nessuna gara con i filtri attivi');
      cells+=`<button type="button" class="tm-day ${m?'tm-has-match':''} ${m&&isCup(m)?'tm-cup':''} ${key===today?'tm-today':''}" data-select="${key}" aria-label="${esc(aria)}" aria-pressed="${key===selected}"${key===today?' aria-current="date"':''}><b>${n}</b>${m?`<span class="tm-opponent">${isHome(m)?'🏠':'🚌'} ${esc(opponent)}</span><span class="tm-day-score">${esc(m.result||m.time||'Da definire')}</span>`:''}</button>`;
    }
    $('tm-calendar').innerHTML='<div class="tm-grid">'+cells+'</div>';
    $('tm-agenda').innerHTML=visible.length?visible.map(m=>`<button type="button" class="tm-agenda-row" data-select="${m.date}" aria-pressed="${m.date===selected}"><span class="tm-agenda-date">${esc(dateLabel(m.date,{month:'short'}))}</span><span><strong>${esc(m.home)} – ${esc(m.away)}</strong><small>${esc(meta(m))} · ${esc(status(m))}</small></span><b>${esc(statusScore(m))}</b></button>`).join(''):'<p class="tm-empty">Nessuna gara pubblicata per questo mese con i filtri scelti.</p>';
    renderDetail();
  }
  function renderDetail(){
    const m=matches.find(m=>m.date===selected&&passes(m));
    if(!m){
      $('tm-detail').innerHTML=`<span class="tm-eyebrow">${esc(dateLabel(selected,{weekday:'long',year:'numeric'}))}</span><h3>${selected===today?'Oggi nessuna partita in calendario':'Nessuna gara con i filtri scelti'}</h3><p>Puoi consultare un altro giorno o aprire la prossima partita.</p>${nextMatch()?`<button type="button" data-action="upcoming">Vai alla prossima gara →</button>`:''}`;
      return;
    }
    const source=m.source?`<a href="${esc(m.source)}" target="_blank" rel="noopener">Fonte e aggiornamenti ↗</a>`:'';
    $('tm-detail').innerHTML=`<span class="tm-eyebrow">${esc(status(m))} · ${esc(dateLabel(m.date,{weekday:'long',year:'numeric'}))}</span><h3>${esc(m.home)} <span>${m.result?esc(m.result):'–'}</span> ${esc(m.away)}</h3><p>${esc(meta(m))}${m.time?' · ⏰ '+esc(m.time):!m.result?' · Orario da confermare':''}</p>${m.notes?`<p class="tm-notes">${esc(m.notes)}</p>`:''}<div class="tm-actions">${source}<button type="button" data-action="share">↗ Condividi partita</button>${!m.result&&m.time&&m.date>=today?'<button type="button" data-action="ics">📅 Salva nel calendario</button>':''}${m===nextMatch()?'<button type="button" data-action="prediction">🔮 Pronostica in Community</button>':''}</div>`;
  }
  function goToday(){today=dayKey();month=today.slice(0,7);selected=today;filter='all';$('tm-filter').value=filter;renderHighlights();render();}
  function select(key){selected=key;month=key.slice(0,7);render();}
  function move(delta){const [y,m]=month.split('-').map(Number);month=new Date(Date.UTC(y,m-1+delta,1)).toISOString().slice(0,7);selected=month===today.slice(0,7)?today:month+'-01';render();}
  function calendarFile(m){
    const clean=s=>String(s).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
    const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z/,'Z');
    const content=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Trenino Bari//Partite//IT','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:tb-${m.date}-${isCup(m)?'cup':'league'}@treninobari.vercel.app`,`DTSTAMP:${stamp}`,`DTSTART;TZID=Europe/Rome:${m.date.replace(/-/g,'')}T${m.time.replace(':','')}00`,`SUMMARY:${clean(m.home+' - '+m.away)}`,`DESCRIPTION:${clean(meta(m)+'\nVerifica eventuali variazioni sulla fonte: '+m.source)}`,`URL:${m.source}`,'END:VEVENT','END:VCALENDAR',''].join('\r\n');
    const url=URL.createObjectURL(new Blob([content],{type:'text/calendar;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='bari-'+m.date+'.ics';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  root.addEventListener('click',async event=>{
    const b=event.target.closest('button');if(!b)return;
    if(b.dataset.select){select(b.dataset.select);if(matches.some(m=>m.date===selected&&passes(m)))$('tm-detail').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});return;}
    if(b.dataset.mode){mode=b.dataset.mode;render();return;}
    const m=matches.find(m=>m.date===selected);
    switch(b.dataset.action){
      case 'prev':move(-1);break;case 'next':move(1);break;case 'today':goToday();break;
      case 'upcoming':filter='all';$('tm-filter').value=filter;if(nextMatch())select(nextMatch().date);break;
      case 'prediction':window.switchView?.('community');document.getElementById('tbPrediction')?.scrollIntoView({behavior:'smooth',block:'start'});break;
      case 'ics':if(m&&!m.result&&m.time&&m.date>=today)calendarFile(m);break;
      case 'share':if(m){const text=`🐓⚽ ${m.home} – ${m.away}${m.result?' '+m.result:''}\n📅 ${dateLabel(m.date,{year:'numeric'})} · ${m.time||'Orario da confermare'}\nSegui il Bari insieme a noi su Trenino Bari! 🔴⚪`;
        try{if(navigator.share)await navigator.share({title:m.home+' – '+m.away,text,url:'https://treninobari.vercel.app/'});else {await navigator.clipboard.writeText(text+'\nhttps://treninobari.vercel.app/');$('tm-share-status').textContent='Link e presentazione della partita copiati!';}}catch(e){if(e.name!=='AbortError')$('tm-share-status').textContent='Puoi condividere il sito copiando questo link: https://treninobari.vercel.app/';}}
    }
  });
  $('tm-month').addEventListener('change',e=>{month=e.target.value;selected=month===today.slice(0,7)?today:month+'-01';render();});
  $('tm-filter').addEventListener('change',e=>{filter=e.target.value;render();});
  $('tm-calendar').addEventListener('keydown',e=>{const key=e.target.dataset.select;if(!key)return;const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[e.key];if(!delta)return;e.preventDefault();const d=new Date(key+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+delta);const next=d.toISOString().slice(0,10);select(next);root.querySelector(`[data-select="${next}"].tm-day`)?.focus();});
  let touch=null;
  $('tm-calendar').addEventListener('touchstart',e=>{if(e.touches.length===1)touch={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:true});
  $('tm-calendar').addEventListener('touchend',e=>{if(!touch)return;const dx=e.changedTouches[0].clientX-touch.x,dy=e.changedTouches[0].clientY-touch.y;touch=null;if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.5)move(dx<0?1:-1);},{passive:true});
  let active=view.classList.contains('active');
  new MutationObserver(()=>{const current=view.classList.contains('active');if(current&&!active)goToday();active=current;}).observe(view,{attributes:true,attributeFilter:['class']});
  const rollover=()=>{if(dayKey()!==today)goToday();};
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)rollover();});window.addEventListener('pageshow',rollover);setInterval(rollover,60000);
  goToday();view.classList.add('tm-enhanced');
})();
