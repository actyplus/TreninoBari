(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const auth = () => window.TBAuth;
  let state = null, identity = undefined, version = 0, toastTimer, online = false;
  let gameAccount = null;
  const articles = new Map(), visibleTimers = new Map(), viewed = new Set();
  function notify(message) {
    let el=$('tbToast');
    if(!el){el=document.createElement('div');el.id='tbToast';el.className='tb-toast';el.setAttribute('role','status');document.body.append(el);}
    el.textContent=message;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,6000);
  }
  async function api(action, data={}) {
    const requester=auth()?.user?.id||null;
    const token=auth()?.user ? await auth().token() : null;
    const response=await fetch('/api/community', {method:action?'POST':'GET',headers:{
      ...(action?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})
    },...(action?{body:JSON.stringify({action,...data})}:{}),signal:AbortSignal.timeout(16000)});
    const result=await response.json();
    if(requester!==(auth()?.user?.id||null))throw new Error('Sessione cambiata. Riprova con il tuo account.');
    if(!response.ok) throw new Error(result.error || 'Operazione non completata.');
    return result;
  }
  function requireUser() {
    if(auth()?.user)return true;
    window.switchView('community');notify('🐓 Accedi con Google o email per partecipare.');return false;
  }
  function renderState(result) {
    state=result;online=true;
    articles.forEach((cards,id)=>{
      const count=result.articles?.[id] || {likes:0,dislikes:0,views:0,mine:0};
      cards.forEach(card=>{
        const bar=card.querySelector('.tb-reactions');
        bar.querySelector('[data-vote="1"]').textContent='👍 '+count.likes;
        bar.querySelector('[data-vote="-1"]').textContent='👎 '+count.dislikes;
        bar.querySelectorAll('[data-vote]').forEach(b=>b.setAttribute('aria-pressed',Number(b.dataset.vote)===count.mine?'true':'false'));
        bar.querySelector('small').textContent='👁 '+count.views+' letture';
      });
    });
    const m=result.member;
    $('tbMemberXp').textContent=m?m.xp+' XP · Livello '+m.level:'Accedi per costruire il tuo percorso';
    $('tbMemberProgress').value=m?m.xp%100:0;
    $('tbMemberNext').textContent=m?(100-m.xp%100)+' XP al prossimo livello':'I punti saranno collegati al tuo account.';
    if(m && !penaltyGame.animating) {
      penaltyGame.stats={goals:m.goals,saves:m.saves,xp:m.xp};
      renderPenaltyHud();
    }
    $('tbLeaderboard').innerHTML=result.leaders?.length?result.leaders.map((x,i)=>'<li><span>'+ (i+1)+'. '+escape(x.nickname)+'</span><b>Livello '+x.level+' · '+x.xp+' XP</b></li>').join(''):'<li>La classifica si popola con i membri che scelgono di partecipare.</li>';
    renderFixture(result);
  }
  async function refresh() {
    const ticket=version;
    try{const result=await api();if(ticket===version)renderState(result);}
    catch(error){if(ticket!==version)return;online=false;$('tbMemberNext').textContent=error.message;}
  }
  const profile=document.createElement('section');
  profile.id='view-profile';profile.className='view';
  profile.innerHTML='<div class="section"><div class="section-head"><h2>🐓 Il mio profilo TB</h2><button class="tb-member-link" onclick="switchView(\'home\')">Torna alla Home</button></div><div class="post"><form id="tbProfileForm" class="tb-profile-form"><label>Nickname<input id="tbProfileNickname" minlength="2" maxlength="24" required autocomplete="nickname"></label><label>Città<input id="tbProfileCity" maxlength="30" autocomplete="address-level2"></label><label>Da quanto segui il Bari?<select id="tbProfileYears"></select></label><fieldset><legend>Argomenti preferiti</legend>'+['squadra','mercato','tifosi','societa','partite','video'].map(t=>'<label><input type="checkbox" name="topic" value="'+t+'">'+({societa:'Società',video:'🎬 Video'}[t]||t)+'</label>').join('')+'</fieldset><label class="tb-check"><input type="checkbox" id="tbProfileRanking">Mostra nickname, livello e XP nella classifica della community</label><button class="primary" type="submit">Salva profilo e preferenze</button><p id="tbProfileMessage" role="status"></p><button type="button" class="account-secondary" onclick="logoutCommunity()">Esci dal mio account</button></form></div></div>';
  $('view-community').after(profile);
  $('tbProfileYears').innerHTML=$('joinYears').innerHTML;
  const profileButton=document.createElement('button');
  profileButton.className='tb-member-link';profileButton.type='button';profileButton.textContent='Accedi';
  profileButton.setAttribute('aria-label','Accedi o apri il tuo profilo');
  document.querySelector('.head-actions').prepend(profileButton);
  profileButton.onclick=()=>{if(requireUser()){populateProfile();window.switchView('profile');}};
  window.editCommunityProfile=()=>{if(requireUser()){populateProfile();window.switchView('profile');}};
  function populateProfile(){
    const p=auth()?.profile||{}, prefs=auth()?.user?.user_metadata?.tb_preferences||{};
    $('tbProfileNickname').value=p.nickname||'';$('tbProfileCity').value=p.city||'';$('tbProfileYears').value=p.supporter_years||'';
    const topics=state?.member?.topics||prefs.topics||['squadra','mercato','video'];
    document.querySelectorAll('#tbProfileForm [name=topic]').forEach(el=>el.checked=topics.includes(el.value));
    $('tbProfileRanking').checked=state?.member?.leaderboard??prefs.leaderboard??false;
  }
  $('tbProfileForm').onsubmit=async event=>{
    event.preventDefault();if(!requireUser())return;
    const button=event.submitter;button.disabled=true;
    try{
      const nickname=$('tbProfileNickname').value.trim(),city=$('tbProfileCity').value.trim(),supporter_years=$('tbProfileYears').value;
      if(nickname.length<2)throw new Error('Scegli un nickname di almeno 2 caratteri.');
      const prefs={topics:[...document.querySelectorAll('#tbProfileForm [name=topic]:checked')].map(x=>x.value),leaderboard:$('tbProfileRanking').checked};
      const {data,error}=await auth().client.from('profiles').update({nickname,city,supporter_years,updated_at:new Date().toISOString()}).eq('id',auth().user.id).select('id').single();
      if(error||!data)throw error||new Error('Profilo non aggiornato.');
      const meta=await auth().client.auth.updateUser({data:{nickname,city,supporter_years,tb_preferences:prefs}});
      if(meta.error)throw meta.error;
      let message='✅ Profilo e preferenze salvati.';
      try{renderState(await api('settings',prefs));}catch(e){message+=' La classifica XP è ancora in attivazione.';}
      await auth().refresh();$('tbProfileMessage').textContent=message;
    }catch(error){$('tbProfileMessage').textContent=error.message;}finally{button.disabled=false;}
  };
  const xp=document.createElement('div');
  xp.className='section';
  xp.innerHTML='<div class="section-head"><h2>⭐ Il tuo percorso biancorosso</h2></div><div class="tb-xp-panel"><strong id="tbMemberXp">XP account in attivazione</strong><progress id="tbMemberProgress" max="100" value="0" aria-label="Progresso livello"></progress><p id="tbMemberNext">Verifica del servizio…</p><button class="primary" type="button" onclick="shareSite()">🐓 Invita un tifoso</button><p>15 XP per il primo pronostico di ogni partita, 5 XP per un commento originale. Rigori: fino a 60 XP al giorno (giorno UTC). Inviti: 50 XP per nuovo iscritto verificato, massimo 10 premi ogni 7 giorni. Modifiche e clic ripetuti non danno altri punti. Un livello ogni 100 XP.</p></div><h3>🏆 Classifica della community</h3><ul class="tb-leaderboard" id="tbLeaderboard"></ul>';
  $('tbPrediction').before(xp);
  function renderFixture(result){
    const f=result.fixture,box=$('tbPrediction');
    if(!f){box.querySelector('.prediction-head h3').textContent='In attesa della prossima partita verificata';box.querySelectorAll('input,textarea,button').forEach(x=>x.disabled=true);return;}
    box.querySelector('.prediction-head small').textContent=new Date(f.kickoff).toLocaleString('it-IT',{timeZone:'Europe/Rome',dateStyle:'medium',timeStyle:'short'});
    box.querySelector('.prediction-head h3').textContent=f.home+' – '+f.away;
    box.querySelectorAll('.pred-team').forEach((el,i)=>el.textContent=i?f.away:f.home);
    $('predHome').setAttribute('aria-label','Gol '+f.home);$('predAway').setAttribute('aria-label','Gol '+f.away);
    box.querySelector('.outcome-buttons').hidden=true;
    box.querySelector('.pred-summary').hidden=true;
    $('predictionClosed').style.display='none';
    const mine=result.predictions?.find(x=>x.mine);
    $('myPrediction').style.display=mine?'block':'none';
    if(mine)$('myPrediction').textContent='🔮 Il tuo pronostico: '+f.home+' '+mine.home+'–'+mine.away+' '+f.away;
    $('predComments').innerHTML=(result.predictions||[]).filter(x=>x.comment).map(x=>'<div class="pred-comment"><b>🐓 '+escape(x.nickname)+'</b><p>'+escape(x.comment)+'</p></div>').join('')||'<p>Nessun commento pubblicato su questa partita.</p>';
  }
  async function predictionAction(action) {
    if(!requireUser())return;
    if(!online||!state?.fixture)return notify('Pronostici online in attivazione.');
    const payload={fixture:state.fixture.id};
    if(action==='prediction'){
      if(!$('predHome').value.trim()||!$('predAway').value.trim())return notify('Inserisci entrambi i punteggi.');
      payload.home=Number($('predHome').value);payload.away=Number($('predAway').value);
    }else payload.comment=$('predCommentInput').value;
    try{const result=await api(action,payload);renderState(result);notify(result.awarded?'✅ Pubblicato · +'+result.awarded+' XP':'✅ Aggiornato. Nessun XP aggiuntivo per questa azione.');}
    catch(error){notify(error.message);}
  }
  window.savePrediction=()=>predictionAction('prediction');
  window.addPredictionComment=()=>predictionAction('comment');
  // Never render local demo identities or fabricated percentages as community data.
  window.renderPrediction=()=>{};window.renderPredictionComments=()=>{};
  $('predComments').textContent='I commenti condivisi saranno disponibili con i pronostici online.';
  $('tbPrediction').querySelector('.pred-summary').hidden=true;
  window.renderCommunityProfile=()=>{};
  window.joinCommunity=()=>notify('Usa Google o email per creare un vero account TB.');
  const shareText='🐓❤️🤍 Sali sul Trenino Bari! News, video, partite e una community tutta biancorossa. ⚽ Fai il tuo pronostico, sfida gli amici ai rigori e cresci con noi. Forza Bari! 🚂';
  window.shareSite=async()=>{
    const url=new URL('/',location.origin);
    if(auth()?.user&&state?.member?.referral_code)url.searchParams.set('ref',state.member.referral_code);
    const payload={title:'TB • Trenino Bari',text:shareText,url:url.href};
    try{if(navigator.share)await navigator.share(payload);else{await navigator.clipboard.writeText(shareText+' '+url.href);notify('🔗 Messaggio e link copiati!');}}catch(e){if(e.name!=='AbortError')notify('Non è stato possibile aprire la condivisione.');}
  };
  window.shareArticle=async(title,key)=>{
    const url=new URL('/',location.origin);if(key)url.searchParams.set('news',key);
    try{if(navigator.share)await navigator.share({title,text:'🐓 '+title+' · Leggilo su Trenino Bari ❤️🤍',url:url.href});else{await navigator.clipboard.writeText('🐓 '+title+' '+url.href);notify('🔗 Notizia copiata!');}}catch(e){if(e.name!=='AbortError')notify('Condivisione non disponibile.');}
  };
  try{const code=new URL(location.href).searchParams.get('ref');if(/^[a-f0-9]{24}$/.test(code||'')&&!localStorage.getItem('tb-referral'))localStorage.setItem('tb-referral',code);}catch{}
  async function sessionChanged() {
    const id=auth()?.user?.id||null;
    profileButton.textContent=id?'👤 Profilo':'Accedi';
    if(identity===id)return;
    identity=id;version++;state=null;online=false;
    document.querySelectorAll('.tb-reactions [data-vote]').forEach(b=>b.setAttribute('aria-pressed','false'));
    gameAccount=id;
    penaltyGame.stats={goals:0,saves:0,xp:0};renderPenaltyHud();
    $('tbMemberXp').textContent=id?'Caricamento XP…':'Accedi per costruire il tuo percorso';
    $('tbMemberProgress').value=0;
    $('tbProfileMessage').textContent='';
    $('myPrediction').style.display='none';$('predHome').value='';$('predAway').value='';$('predCommentInput').value='';
    if(!id&&$('view-profile').classList.contains('active'))window.switchView('home');
    await refresh();
    if(id){
      try{const code=localStorage.getItem('tb-referral');if(code){renderState(await api('referral',{code}));localStorage.removeItem('tb-referral');}}catch{}
    }
  }
  window.addEventListener('tb:auth',sessionChanged);
  window.penaltyLevel=()=>Math.floor(penaltyGame.stats.xp/100)+1;
  window.penaltyProgressPct=()=>penaltyGame.stats.xp%100;
  window.savePenaltyStats=()=>{};
  window.loadPenaltyStats=()=>{};
  window.playPenalty=async choice=>{
    if(penaltyGame.animating)return;
    if(!auth()?.user || !online){
      const opponent=penaltyRandomDir(),mode=penaltyGame.mode;
      penaltyGame.animating=true;markActiveAngle(choice);
      penaltyAnimate(mode==='shoot'?choice:opponent,mode==='save'?choice:opponent,()=>{
        setPenaltyLog('⚽ Allenamento libero · nessun XP account assegnato.');penaltyGame.animating=false;
      });
      return;
    }
    penaltyGame.animating=true;
    const player=gameAccount,mode=penaltyGame.mode;
    try{
      const result=await api('penalty',{choice,mode,requestId:crypto.randomUUID()});
      if(player!==gameAccount){penaltyGame.animating=false;return;}
      const round=result.round;
      const shot=mode==='shoot'?choice:round.opponent,keeper=mode==='shoot'?round.opponent:choice;
      markActiveAngle(choice);
      penaltyAnimate(shot,keeper,()=>{
        penaltyGame.animating=false;
        if(player===gameAccount){renderState(result);setPenaltyLog((round.success?'🎉 Riuscito! ':'⚽ Ritenta! ')+(round.awarded?'+'+round.awarded+' XP':'Nessun XP aggiuntivo.'));}
      });
    }catch(error){penaltyGame.animating=false;notify(error.message);}
  };
  // Visitors can still practice without writing account points.
  const practice=document.createElement('button');
  practice.type='button';practice.className='account-secondary';practice.textContent='⚽ Allenamento libero · senza XP';
  practice.onclick=()=>{
    if(penaltyGame.animating)return;penaltyGame.animating=true;
    penaltyAnimate(penaltyRandomDir(),penaltyRandomDir(),()=>{setPenaltyLog('⚽ Allenamento libero completato. Nessun punto account assegnato.');penaltyGame.animating=false;});
  };
  $('tbGameLog').after(practice);
  window.resetPenaltyProgress=()=>notify('I progressi sono legati al tuo account e non vengono azzerati dal browser.');
  const oldFilter=window.filterNews;
  window.filterNews=()=>{
    oldFilter();
    let empty=$('tbNewsEmpty');
    if(!empty){empty=document.createElement('p');empty.id='tbNewsEmpty';empty.className='tb-news-empty';empty.textContent='Nessun contenuto corrisponde alla ricerca.';$('allNews').after(empty);}
    empty.hidden=[...$('allNews').children].some(x=>x.style.display!=='none');
  };
  async function prepareArticles(){
    for(const card of document.querySelectorAll('#view-home article.post,#allNews article')){
      const source=card.querySelector('.source-line a')?.getAttribute('href'),vid=card.dataset.videoId;
      if(!source&&!vid)continue;
      const id=vid?'v-'+vid:'n-'+[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source)))].map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,32);
      card.dataset.articleId=id;if(!articles.has(id))articles.set(id,[]);articles.get(id).push(card);
      const bar=document.createElement('div');bar.className='tb-reactions';
      card.querySelector('.post-actions')?.remove();
      bar.innerHTML='<button type="button" data-vote="1" aria-label="Mi piace" aria-pressed="false">👍 —</button><button type="button" data-vote="-1" aria-label="Non mi piace" aria-pressed="false">👎 —</button><button type="button" data-share>↗ Condividi</button><small title="Letture deduplicate per giornata; non indica persone uniche">👁 In attivazione</small>';
      card.append(bar);
      bar.onclick=async event=>{
        const button=event.target.closest('button');if(!button)return;
        if(button.hasAttribute('data-share'))return window.shareArticle(card.querySelector('h3')?.textContent||'Trenino Bari',id);
        if(!requireUser())return;
        button.disabled=true;
        try{const value=Number(button.dataset.vote);renderState(await api('reaction',{article:id,value:state?.articles?.[id]?.mine===value?0:value}));}
        catch(e){notify(e.message);}finally{button.disabled=false;}
      };
    }
    const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
      const card=entry.target,id=card.dataset.articleId;
      clearTimeout(visibleTimers.get(card));
      if(!entry.isIntersecting||entry.intersectionRatio<.3||viewed.has(id))return;
      visibleTimers.set(card,setTimeout(async()=>{
        if(!online||document.hidden||!card.closest('.view').classList.contains('active')||viewed.has(id))return;
        viewed.add(id);
        try{const result=await api('view',{article:id});if(state){state.articles[id]=result.articles[id];renderState(state);}}catch{viewed.delete(id);}
      },2000));
    }),{threshold:.3});
    articles.forEach(cards=>cards.forEach(c=>observer.observe(c)));
    await sessionChanged();
    const linked=new URL(location.href).searchParams.get('news');
    if(linked&&articles.has(linked)){window.switchView('news');articles.get(linked).find(c=>c.closest('#allNews'))?.scrollIntoView({block:'center'});}
  }
  prepareArticles();
})();
