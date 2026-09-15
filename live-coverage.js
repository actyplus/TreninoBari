/* TB live hub 20260915.2. Only the match box is changed; news, login and video carousels stay intact. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id), HOUR=3600000;
  const state={fixtures:[],fixture:null,data:null,busy:false,calendarAt:0,tab:'text',started:false,radioPending:false,eventsKey:'',providerKey:'',newsKey:''};
  let radioTimeout,calendarBusy=false;
  const safe=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}};
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\b(ssc|calcio|fc)\b/g,'').replace(/[^a-z0-9]/g,'');
  const format=value=>new Intl.DateTimeFormat('it-IT',{timeZone:'Europe/Rome',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
  const clock=value=>Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('it-IT',{timeZone:'Europe/Rome',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(value)):'—';
  function select(){const now=Date.now();return state.fixtures.filter(f=>Number.isFinite(Date.parse(f.kickoff))&&now>=Date.parse(f.kickoff)-48*HOUR&&now<=Date.parse(f.kickoff)+18*HOUR).sort((a,b)=>Date.parse(a.kickoff)-Date.parse(b.kickoff))[0]||null;}
  function valid(data){const f=state.fixture;if(!f||!data)return false;return norm(data.home)===norm(f.home)&&norm(data.away)===norm(f.away)&&Number.isFinite(Date.parse(data.matchDate||data.kickoff))&&Math.abs(Date.parse(data.matchDate||data.kickoff)-Date.parse(f.kickoff))<6*HOUR;}
  function currentPhase(){if(state.data?.finished)return 'finished';if(state.data?.live)return 'live';if(!state.fixture)return 'idle';return Date.now()<Date.parse(state.fixture.kickoff)?'pre':'waiting';}
  function build(){
    const shell=$('matchCoverage');if(!shell)return false;
    const style=document.createElement('style');style.id='tb-live-hub-css';style.textContent=`
#matchCoverage{scroll-margin-top:75px}#matchCoverage [hidden]{display:none!important}
#matchCoverage .tb-live-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:12px 0}
#matchCoverage .tb-live-tabs button{min-height:60px;border:1px solid #e5b5b7;background:#fff;color:#85101a;border-radius:14px;padding:9px 4px;font-size:15px;font-weight:900;cursor:pointer}
#matchCoverage .tb-live-tabs button[aria-selected=true]{background:#c9141c;color:#fff;border-color:#c9141c}
#matchCoverage .tb-live-tabs span{display:block;font-size:21px;margin-bottom:3px}
#matchCoverage .tb-hub-panel{background:#fafafa;border:1px solid #e8e8ea;border-radius:16px;padding:12px;color:#26262b}
#matchCoverage .tb-hub-panel h4{font-size:18px;margin:0 0 8px}#matchCoverage .tb-hub-panel p{font-size:14px;line-height:1.45;margin:8px 0}
#matchCoverage .tb-hub-links{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}#matchCoverage .tb-hub-links a,#matchCoverage .tb-hub-links button{min-height:44px;display:inline-flex;align-items:center;justify-content:center;border:1px solid #e0b8bc;border-radius:12px;padding:10px 12px;font-size:14px;font-weight:850;color:#920b12;background:#fff;text-decoration:none;cursor:pointer}
#matchCoverage .tb-hub-links .primary{background:#c9141c;color:#fff}#matchCoverage .tb-status-note{font-size:12px;color:#62656b;line-height:1.4}#matchCoverage .tb-warning{color:#825300;background:#fff4d9;padding:9px;border-radius:10px}
#matchCoverage audio{display:block;width:100%;margin:10px 0}#matchCoverage .tb-score{font-size:30px;font-weight:950;text-align:center;margin:12px 0}#matchCoverage .tb-score small{display:block;font-size:14px;font-weight:700;margin:5px 0;color:#60636a}
#matchCoverage #tbLiveEvents{max-height:390px;overflow:auto;overscroll-behavior:contain;display:grid;gap:6px}
#matchCoverage .tb-event{display:grid;grid-template-columns:48px 1fr;gap:9px;background:#fff;border:1px solid #eee;border-radius:11px;padding:9px;font-size:14px;line-height:1.4}#matchCoverage .tb-event b{color:#b70f17}
#matchCoverage .tb-embed{aspect-ratio:16/9;background:#151517;border-radius:12px;overflow:hidden;margin:10px 0}#matchCoverage .tb-embed iframe{width:100%;height:100%;border:0}
#matchCoverage button:focus-visible,#matchCoverage a:focus-visible{outline:3px solid #2176b4;outline-offset:3px}#matchCoverage .tb-source{font-size:11px;margin-top:9px;line-height:1.4}#matchCoverage .tb-source a{color:#920b12}
@media(max-width:360px){#matchCoverage .tb-live-tabs button{font-size:13px}#matchCoverage .tb-hub-panel{padding:10px}}
`;
    document.head.append(style);
    shell.innerHTML=`<div class="section-head"><h2>⚽ Vivi la partita</h2><small id="tbHubPhase">Collegamento…</small></div>
<article class="post match-coverage-card" id="matchCoverageCard"><div class="post-body">
<div class="match-coverage-top"><span class="match-coverage-badge" id="matchCoverageBadge">📡 MATCH CENTER</span><span class="match-coverage-countdown" id="matchCoverageCountdown"></span></div>
<h3 id="matchCoverageTitle">La partita del Bari</h3><p class="match-coverage-kickoff" id="matchCoverageKickoff"></p>
<div class="tb-live-tabs" role="tablist" aria-label="Segui la partita"><button id="tb-tab-watch" type="button" role="tab" aria-selected="false" aria-controls="tb-panel-watch" data-live-tab="watch" tabindex="-1"><span aria-hidden="true">📺</span>Guarda</button><button id="tb-tab-listen" type="button" role="tab" aria-selected="false" aria-controls="tb-panel-listen" data-live-tab="listen" tabindex="-1"><span aria-hidden="true">🎙️</span>Salomone</button><button id="tb-tab-text" type="button" role="tab" aria-selected="true" aria-controls="tb-panel-text" data-live-tab="text"><span aria-hidden="true">📝</span>Cronaca</button></div>
<div class="tb-hub-panel" id="tb-panel-watch" role="tabpanel" aria-labelledby="tb-tab-watch" hidden><h4>📺 Guarda la partita</h4><div id="tbWatchOptions"></div><div id="tbEmbedHost"></div><p class="tb-status-note">La diretta web si apre sul servizio ufficiale. Un’eventuale trasmissione TV in chiaro non implica che il video sia disponibile gratuitamente online.</p></div>
<div class="tb-hub-panel" id="tb-panel-listen" role="tabpanel" aria-labelledby="tb-tab-listen" hidden><h4>🎙️ Michele Salomone · Voce al Bari</h4><p>Il programma di Radio Norba Music dedicato alle partite del Bari. Premi ▶ per ascoltare il segnale dell’emittente.</p><button type="button" class="live-radio-play" id="tbRadioPlay" aria-pressed="false">▶ Ascolta Salomone</button><audio id="tbHubAudio" controls preload="none" aria-label="Radio Norba Music"></audio><p class="tb-status-note" id="tbRadioStatus" role="status">L’audio parte solo con un tuo tocco.</p><div class="tb-hub-links"><a href="https://play.radionorba.it/#channel=radio-norba-music" target="_blank" rel="noopener noreferrer">Apri il lettore ufficiale ↗</a></div><div class="tb-source">Fonte: <a href="https://radionorba.it/voce-al-bari-2/" target="_blank" rel="noopener noreferrer">Radio Norba · Voce al Bari</a>. Fuori dalla trasmissione sportiva ascolti il palinsesto della radio.</div></div>
<div class="tb-hub-panel" id="tb-panel-text" role="tabpanel" aria-labelledby="tb-tab-text"><div class="tb-score" id="tbHubScore">—<small>In attesa della fonte live</small></div><p class="tb-status-note" id="tbLiveFreshness" role="status">Collegamento alla cronaca…</p><div id="tbLiveEvents" aria-label="Cronaca della partita"></div><div class="tb-hub-links"><button type="button" id="tbRefreshLive">🔄 Aggiorna</button><a id="tbFullChronicle" href="https://www.corrieredellosport.it/squadra/calcio/bari/calendario/t122" target="_blank" rel="noopener noreferrer">Cronaca sulla fonte ↗</a></div><p class="tb-source">Eventi sintetici con fonte. Risultato e finale compaiono solo quando ricevuti dal servizio dati.</p></div>
<div class="tb-hub-links"><button type="button" id="tbInviteLive">↗ Invita un tifoso</button><button type="button" id="tbLiveCommunity">💬 Community</button></div>
</div></article>`;
    shell.addEventListener('click',event=>{const tab=event.target.closest('[data-live-tab]');if(tab){openTab(tab.dataset.liveTab);if(tab.dataset.liveTab==='listen' && $('tbHubAudio').paused)playRadio();}});
    shell.querySelector('[role=tablist]').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const tabs=['watch','listen','text'];let n=tabs.indexOf(state.tab);n=event.key==='Home'?0:event.key==='End'?2:(n+(event.key==='ArrowLeft'?-1:1)+3)%3;openTab(tabs[n]);$('tb-tab-'+tabs[n]).focus();});
    $('tbRadioPlay').addEventListener('click',playRadio);
    $('tbRefreshLive').addEventListener('click',()=>poll());
    $('tbInviteLive').addEventListener('click',()=>window.shareMatchCoverage());
    $('tbLiveCommunity').addEventListener('click',()=>window.openCoverageCommunity('community'));
    const radio=$('tbHubAudio');
    radio.addEventListener('playing',()=>{clearTimeout(radioTimeout);state.radioPending=false;radioUI('playing','In ascolto su Radio Norba Music.');});
    radio.addEventListener('pause',()=>{if(!state.radioPending)radioUI('idle','Audio in pausa.');});
    radio.addEventListener('waiting',()=>{if(!radio.paused)radioUI('loading','Caricamento audio…');});
    radio.addEventListener('error',()=>radioError());
    return true;
  }
  function openTab(tab){state.tab=tab;for(const name of ['watch','listen','text']){$('tb-panel-'+name).hidden=name!==tab;$('tb-tab-'+name).setAttribute('aria-selected',String(name===tab));$('tb-tab-'+name).tabIndex=name===tab?0:-1;}}
  function radioUI(mode,message){const b=$('tbRadioPlay');b.textContent=mode==='playing'?'Ⅱ Metti in pausa':mode==='loading'?'■ Ferma collegamento':mode==='error'?'▶ Riprova audio':'▶ Ascolta Salomone';b.setAttribute('aria-pressed',String(mode==='playing'));$('tbRadioStatus').textContent=message;}
  function radioError(){clearTimeout(radioTimeout);state.radioPending=false;$('tbHubAudio').pause();radioUI('error','L’audio non è partito qui. Riprova o apri il lettore ufficiale qui sotto.');}
  async function playRadio(){
    const audio=$('tbHubAudio');if(!audio)return;
    if(state.radioPending||!audio.paused){state.radioPending=false;clearTimeout(radioTimeout);audio.pause();radioUI('idle','Audio in pausa.');return;}
    $('liveRadio')?.pause();state.radioPending=true;radioUI('loading','Collegamento a Radio Norba Music…');
    if(!audio.getAttribute('src'))audio.src=typeof LIVE_RADIO_STREAM==='string'?LIVE_RADIO_STREAM:'https://ad1.xdevel.com/radionorbamusic';
    if(audio.error)audio.load();
    radioTimeout=setTimeout(radioError,12000);
    try{await audio.play();}catch(_){radioError();}
  }
  function renderVideo(){
    const f=state.fixture,c=f?.coverage||{},key=JSON.stringify([f?.id,c]);if(key===state.providerKey)return;state.providerKey=key;
    $('tbEmbedHost').replaceChildren();const box=$('tbWatchOptions');box.replaceChildren();
    const p=document.createElement('p');p.className='tb-warning';
    const isTV=c.access==='free-tv'||(c.access==='free-link'&&!c.watchUrl);
    p.textContent=isTV?`${c.provider||'TV in chiaro'}: ${c.note||'Disponibile sul digitale terrestre. Streaming gratuito non confermato.'}`:c.note||'Scegli un servizio ufficiale. La disponibilità dipende dai diritti della singola partita.';box.append(p);
    const links=document.createElement('div');links.className='tb-hub-links';
    function add(label,url,primary=false){const href=safe(url);if(!href)return;const a=document.createElement('a');a.textContent=label;a.href=href;a.target='_blank';a.rel='noopener noreferrer';if(primary)a.className='primary';links.append(a);}
    if(c.access==='free-link'&&c.watchUrl)add('▶ Apri la diretta gratuita',c.watchUrl,true);
    const paid=c.paid||[];for(const service of paid)add(service.name+' · abbonamento ↗',service.url,true);
    if(!paid.length && /serie c/i.test(f?.competition||''))add('▶ Apri NOW · abbonamento','https://www.nowtv.it/sport/calcio/serie-c',true);
    if(c.source)add('Fonte programmazione ↗',c.source);
    box.append(links);
    const u=safe(c.embedUrl);let embed='';try{const x=new URL(u);if(c.access==='free-embed'&&c.embedAuthorized===true&&/^(www\.)?youtube(-nocookie)?\.com$/.test(x.hostname)&&/^\/embed\/[A-Za-z0-9_-]{11}$/.test(x.pathname))embed='https://www.youtube-nocookie.com'+x.pathname;}catch(_){}
    if(embed){const b=document.createElement('button');b.type='button';b.className='primary';b.textContent='▶ Guarda qui · player ufficiale';links.prepend(b);b.addEventListener('click',()=>{$('tbHubAudio').pause();b.hidden=true;const wrap=document.createElement('div');wrap.className='tb-embed';const frame=document.createElement('iframe');frame.src=embed;frame.title='Diretta ufficiale';frame.allow='fullscreen; picture-in-picture; encrypted-media';frame.allowFullscreen=true;wrap.append(frame);$('tbEmbedHost').append(wrap);});}
  }
  function renderNews(phase){
    const card=$('newsMatchCoverage'),f=state.fixture;if(!card)return;
    const key=(f?.id||'')+'-'+phase;if(key===state.newsKey)return;state.newsKey=key;
    card.hidden=!f;card.dataset.runtimeActive=String(Boolean(f));if(!f){card.style.display='none';return;}
    card.style.removeProperty('display');card.dataset.publishedAt=f.coverage?.confirmedAt||f.kickoff;
    const set=(id,text)=>{if($(id))$(id).textContent=text;};
    set('newsMatchCoverageBadge',phase==='live'?'🔴 DIRETTA':phase==='finished'?'✅ POST PARTITA':'📡 COPERTURA PARTITA');
    set('newsMatchCoverageTime',format(f.kickoff));set('newsMatchCoverageTitle',f.home+'–'+f.away+': video, Salomone e cronaca');
    set('newsMatchCoverageText','Apri il Match Center: servizi video ufficiali, Radio Norba Music e cronaca testuale. La TV in chiaro è distinta dallo streaming web.');
    set('newsMatchCoverageStatus','📺 Guarda · 🎙️ Salomone · 📝 Cronaca');set('newsMatchCoverageKickoff',format(f.kickoff));
    set('newsMatchCoverageSourceNote','Copertura della singola partita');
    if($('newsMatchCoverageSource')){$('newsMatchCoverageSource').href=safe(f.coverage?.source||f.source)||'https://www.nowtv.it/sport/calcio/serie-c';$('newsMatchCoverageSource').textContent='Fonte programmazione ↗';}
    window.sortNewsChronologically?.();window.filterNews?.();
  }
  function render(){
    if(!state.started)return;const f=state.fixture,shell=$('matchCoverage'),d=state.data,phase=currentPhase();
    shell.hidden=!f;if(!f){renderNews('idle');return;}
    $('liveMatch')?.setAttribute('hidden','');
    $('matchCoverageTitle').textContent=f.home+' – '+f.away;$('matchCoverageKickoff').textContent=format(f.kickoff)+' · '+(f.competition||'Partita del Bari');
    const labels={pre:'🔥 PREPARTITA',live:'🔴 LIVE',finished:'✅ FINALE',waiting:'📡 ATTESA DATI'};
    $('tbHubPhase').textContent=d?.stale?'⚠️ ULTIMO DATO':labels[phase];$('matchCoverageBadge').textContent=d?.stale?'⚠️ DATI IN RITARDO':labels[phase];$('matchCoverageBadge').classList.toggle('live',phase==='live'&&!d?.stale);
    const diff=Date.parse(f.kickoff)-Date.now();$('matchCoverageCountdown').textContent=diff>0?'⏳ '+Math.floor(diff/HOUR)+'h '+Math.floor(diff%HOUR/60000)+'m':d?.status||'Aggiornamento in corso';
    const score=d?.score||'—';$('tbHubScore').replaceChildren(document.createTextNode(score));const small=document.createElement('small');small.textContent=(d?.status||labels[phase])+' · '+f.home+'–'+f.away;$('tbHubScore').append(small);
    const bad=d?.unavailable||d?.stale||!d;const freshness=$('tbLiveFreshness');freshness.classList.toggle('tb-warning',Boolean(bad));freshness.textContent=bad?(d?.message||'Collegamento alla fonte in corso. Non mostriamo risultati non verificati.'):'Ultimo controllo '+clock(d.checkedAt||d.updatedAt)+' · aggiornamento automatico ogni 25 secondi durante la gara';
    const events=Array.isArray(d?.events)?d.events:[],key=JSON.stringify(events);
    if(key!==state.eventsKey){state.eventsKey=key;const container=$('tbLiveEvents'),top=container.scrollTop;container.innerHTML=events.length?events.map(e=>`<div class="tb-event"><b>${esc(e.minute||'')}</b><span>${icon(e.text)} ${esc(e.text)}</span></div>`).join(''):'<p>Nessun evento live verificato ricevuto. Puoi aprire la cronaca sulla fonte o ascoltare Radio Norba Music.</p>';container.scrollTop=top;}
    $('tbFullChronicle').href=safe(d?.source)||(f.livePath?'https://www.corrieredellosport.it'+f.livePath:'https://www.corrieredellosport.it/squadra/calcio/bari/calendario/t122');
    if($('snapshotMatchDate'))$('snapshotMatchDate').textContent=labels[phase];if($('snapshotMatchLabel'))$('snapshotMatchLabel').textContent=f.home+' '+(d?.score||'–')+' '+f.away;
    renderVideo();renderNews(phase);
  }
  function icon(text){const s=String(text||'').toLowerCase();return /gol|autorete/.test(s)?'⚽':/espuls|seconda ammon/.test(s)?'🟥':/ammon/.test(s)?'🟨':/cambio|sostit/.test(s)?'🔄':/parat/.test(s)?'🧤':/intervallo/.test(s)?'⏸️':/finale/.test(s)?'🏁':'📍';}
  async function refreshFixtures(){
    if(calendarBusy)return;calendarBusy=true;try{const r=await fetch('/data/fixtures.json',{cache:'no-store',signal:AbortSignal.timeout(8000)});if(!r.ok)throw new Error();const json=await r.json();if(!Array.isArray(json.fixtures))throw new Error();state.fixtures=json.fixtures;state.calendarAt=Date.now();}catch(_){}finally{calendarBusy=false;}
    const f=select();if(f?.id!==state.fixture?.id){state.data=null;state.eventsKey='';state.providerKey='';state.newsKey='';}state.fixture=f;
  }
  function schedule(delay){if(typeof livePollTimer!=='undefined'){clearTimeout(livePollTimer);livePollTimer=setTimeout(poll,delay);}else{clearTimeout(state.timer);state.timer=setTimeout(poll,delay);}}
  async function poll(){
    if(!state.started||state.busy)return;
    if(document.hidden){schedule(60000);return;}
    state.busy=true;
    try{
      if(Date.now()-state.calendarAt>300000||!state.fixtures.length)await refreshFixtures();else{const f=select();if(f?.id!==state.fixture?.id){state.data=null;state.eventsKey='';state.fixture=f;}}
      render();if(!state.fixture)return;
      const r=await fetch('/api/live',{cache:'no-store',signal:AbortSignal.timeout(18000)});if(!r.ok)throw new Error('Fonte non disponibile');
      const data=await r.json();if(!valid(data))throw new Error('La risposta non corrisponde alla partita');state.data=data;
      if(typeof liveMatchData!=='undefined')liveMatchData=data;
      render();
    }catch(_){if(state.data)state.data={...state.data,unavailable:true,stale:true,message:'Collegamento momentaneamente interrotto: gli ultimi dati restano visibili.'};render();}
    finally{state.busy=false;const k=Date.parse(state.fixture?.kickoff),near=Number.isFinite(k)&&Date.now()>=k-90*60000&&Date.now()<=k+5*HOUR;schedule(near?25000:180000);}
  }
  window.shareMatchCoverage=async()=>{if(!state.fixture)return;const f=state.fixture,u=new URL('/',location.origin);u.searchParams.set('match',f.id);u.hash='copertura-partita';const message={title:f.home+'–'+f.away+' · Trenino Bari',text:'🐓 Vivi la partita: video ufficiale, Salomone e cronaca. ❤️🤍',url:u.href};try{if(navigator.share)await navigator.share(message);else{await navigator.clipboard.writeText(u.href);$('tbHubPhase').textContent='🔗 Link copiato';}}catch(error){if(error.name!=='AbortError')prompt('Copia il link della partita:',u.href);}};
  window.openCoverageCommunity=()=>{window.switchView?.('community');};
  window.openNewsMatchCoverage=()=>{window.switchView?.('home');$('matchCoverage')?.scrollIntoView({behavior:'smooth',block:'start'});};
  // Use one polling loop. Existing visibility listeners resolve to this function too.
  window.loadLiveMatch=poll;
  window.renderLiveMatch=()=>{if(typeof liveMatchData!=='undefined'&&valid(liveMatchData)){state.data=liveMatchData;render();}};
  function init(){if(state.started||!build())return;state.started=true;if(typeof livePollTimer!=='undefined')clearTimeout(livePollTimer);poll();document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();});}
  window.TBLiveHub={version:'20260915.2',refresh:poll};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
