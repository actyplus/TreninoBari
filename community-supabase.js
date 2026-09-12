(function () {
  'use strict';

  let db = null;
  let currentUser = null;
  let currentProfile = null;
  let realtimeChannel = null;
  let sessionRevision = 0;
  let emailStarting = false;
  let initializing = true, authEventRevision = 0, lastAuthSession = null, googleStarting = false;
  const AUTH_PENDING_KEY = 'tb-oauth-started-at';
  const callbackParams = new URLSearchParams(location.hash.replace(/^#/, ''));
  const queryParams = new URLSearchParams(location.search);
  const callbackError = queryParams.get('error_description') || callbackParams.get('error_description') || queryParams.get('error') || callbackParams.get('error');
  const callbackCode = queryParams.get('error_code') || callbackParams.get('error_code') || '';
  const storage = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key,value) { try { localStorage.setItem(key,value); return true; } catch { return false; } },
    remove(key) { try { localStorage.removeItem(key); } catch {} }
  };
  let returning = !!(callbackError || queryParams.get('code') || callbackParams.get('access_token') || queryParams.get('tb_auth') === 'complete' || Date.now() - Number(storage.get(AUTH_PENDING_KEY) || 0) < 15 * 60 * 1000);
  function deadline(promise, ms=15000) {
    let timer;
    return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Connessione account troppo lenta. Riprova.')),ms);})]).finally(()=>clearTimeout(timer));
  }
  function authErrorMessage(error, code='') {
    const message=String(error?.message || error || '');
    if (/Unable to exchange external code/i.test(message)) return 'Google non ha completato il collegamento con Trenino Bari. Il problema è nel servizio di accesso, non nella casella Privacy. Riferimento: TB-GOOGLE-EXCHANGE.';
    if (/database error saving new user/i.test(message)) return 'Il servizio non riesce a creare il profilo TB. Riferimento: TB-AUTH-DATABASE. La registrazione deve essere ripristinata dal gestore.';
    if (/access_denied|cancelled|canceled/i.test(message+' '+code)) return 'Accesso Google annullato o non autorizzato. Puoi riprovare con “Continua con Google”.';
    if (/flow_state|code_verifier|invalid.*code|expired/i.test(message+' '+code)) return 'Il tentativo di accesso è scaduto. Riparti da “Continua con Google” in questa scheda.';
    if (/storage/i.test(message)) return 'Il browser non consente di salvare la sessione. Apri il sito in una scheda normale di Chrome e consenti i dati del sito.';
    if (/fetch|network|timeout|troppo lenta/i.test(message)) return 'Connessione al servizio di accesso interrotta o troppo lenta. Riprova fra poco.';
    return 'Non è stato possibile completare l’accesso. Riprova dal pulsante Google. Riferimento: TB-AUTH-FAILED.';
  }
  function showAuthError(error, code='') {
    renderOnlineLoggedOut();
    if ($('accountStatusTitle')) $('accountStatusTitle').textContent='Accesso non completato';
    if ($('accountStatusText')) $('accountStatusText').textContent='Leggi il messaggio sotto e riprova';
    showMessage(authErrorMessage(error,code),'error');
    openCommunityView();
  }
  function finishOAuthReturn() {
    if (!returning) return;
    returning=false;storage.remove(AUTH_PENDING_KEY);clearOAuthMarkers();window.switchView?.('home');
  }
  window.TBAuth = { get user() { return currentUser; }, get profile() { return currentProfile; },
    get client() { return db; }, refresh: () => syncVisibleSession(),
    async token() { if (!db) return null; const { data, error } = await deadline(db.auth.getSession()); if (error) throw error; return data.session?.access_token; } };
  function announceSession() {
    document.documentElement.classList.remove('tb-auth-loading');
    document.documentElement.classList.toggle('tb-authenticated', !!currentUser);
    window.dispatchEvent(new CustomEvent('tb:auth', {detail:{user:currentUser,profile:currentProfile}}));
  }

  const $ = (id) => document.getElementById(id);
  const localJoinCommunity = window.joinCommunity;
  const localLogoutCommunity = window.logoutCommunity;
  const localPublishCommunityPost = window.publishCommunityPost;
  const CONSENT_VERSION = '1.0';

  function showMessage(text, kind) {
    let box = $('accountMessage');
    if (!box) {
      box = document.createElement('div');
      box.id = 'accountMessage';
      box.className = 'account-message';
      $('joinCard')?.prepend(box);
    }
    box.hidden = !text;
    box.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    box.textContent = text;
    box.className = 'account-message ' + (kind || '');
  }

  function setConnectionState(online, text) {
    document.documentElement.classList.toggle('supabase-ready', online);
    const help = $('accountHelp');
    const road = $('accountRoadmap');
    if (help) {
      help.innerHTML = online
        ? '🔐 Accesso protetto da Supabase. Email e password non vengono salvate nel codice del sito.'
        : 'Accesso temporaneamente non disponibile. Puoi continuare a navigare.';
    }
    if (road) {
      road.innerHTML = online
        ? '<b>🔐 Servizio account raggiungibile.</b> Lo stato di accesso è indicato nel tuo TB ID.'
        : '<b>⚠️ Account non raggiungibile.</b> Notizie, video e navigazione restano disponibili.';
    }
    if (!online && text) showMessage(text, 'error');
  }

  function profileFromMetadata(user) {
    const meta = user?.user_metadata || {};
    return {
      id: user?.id,
      nickname: meta.nickname || meta.full_name || meta.name || (user?.email ? user.email.split('@')[0] : 'Tifoso TB'),
      city: meta.city || '',
      supporter_years: meta.supporter_years || '',
      avatar_url: meta.avatar_url || meta.picture || ''
    };
  }

  function clearOAuthMarkers() {
    const url = new URL(location.href);
    ['tb_auth','view','code','error','error_code','error_description'].forEach(key=>url.searchParams.delete(key));
    const hash = new URLSearchParams(url.hash.replace(/^#/,''));
    if (['access_token','refresh_token','error','error_code','error_description'].some(key=>hash.has(key))) url.hash='';
    history.replaceState({}, document.title, url.pathname + url.search + url.hash);
  }

  function openCommunityView() {
    if (typeof window.switchView === 'function') window.switchView('community');
  }

  async function loadProfileSafely(user) {
    try {
      return await deadline(loadProfile(user),8000);
    } catch (error) {
      console.warn('Profilo remoto non ancora disponibile:', error.message);
      return profileFromMetadata(user);
    }
  }

  async function applySession(session) {
    const revision = ++sessionRevision;
    if (!session?.user) return renderOnlineLoggedOut();
    showMessage('');
    // Optional data requests must never block a valid authenticated session.
    renderOnlineProfile(session.user, profileFromMetadata(session.user));
    finishOAuthReturn();
    if (storage.get('tb-pending-consent') === CONSENT_VERSION) deadline(recordConsent(session.user),8000).catch(()=>{});
    loadProfileSafely(session.user).then(profile=>{
      if (revision === sessionRevision && currentUser?.id === session.user.id) renderOnlineProfile(session.user,profile);
    });
    deadline(loadOnlinePosts(),8000).catch(()=>{});
  }

  async function loadProfile(user) {
    const { data, error } = await db
      .from('profiles')
      .select('id,nickname,city,supporter_years,role,created_at')
      .eq('id', user.id)
      .maybeSingle();
    if (error) throw error;
    return data || profileFromMetadata(user);
  }

  function renderOnlineProfile(user, profile) {
    currentUser = user;
    currentProfile = profile;
    announceSession();
    const join = $('joinCard');
    const card = $('profileCard');
    if (!join || !card) return;

    join.style.display = 'none';
    card.classList.add('show');
    $('accountDot')?.classList.add('on');
    $('navAccountDot')?.classList.add('on');
    $('accountMode')?.classList.add('on');
    if ($('accountMode')) $('accountMode').textContent = 'ONLINE';
    if ($('accountStatusTitle')) $('accountStatusTitle').textContent = 'Account TB connesso';
    if ($('accountStatusText')) $('accountStatusText').textContent = user.email || 'Sessione verificata';

    const nick = profile.nickname || 'Tifoso TB';
    const provider = user.app_metadata?.provider || 'email';
    const providerLabel = provider === 'google' ? 'Google' : provider === 'facebook' ? 'Meta' : 'Email';
    if ($('accountMode')) $('accountMode').textContent = 'ONLINE · ' + providerLabel.toUpperCase();
    if ($('accountStatusTitle')) $('accountStatusTitle').textContent = 'Accesso effettuato';
    if ($('accountStatusText')) $('accountStatusText').textContent = (user.email || nick) + ' · sessione protetta';
    if ($('profileNick')) $('profileNick').textContent = nick;
    if ($('profileAvatar')) {
      const avatarUrl = profile.avatar_url || user.user_metadata?.avatar_url || user.user_metadata?.picture;
      $('profileAvatar').innerHTML = avatarUrl
        ? '<img src="' + window.esc(avatarUrl) + '" alt="" referrerpolicy="no-referrer">'
        : window.esc((nick[0] || 'T').toUpperCase());
    }
    if ($('profileHandle')) $('profileHandle').textContent = '@' + window.profileSlug(nick) + ' · verificato con ' + providerLabel;
    const meta = ['✅ Account collegato'];
    if (profile.city) meta.push('📍 ' + profile.city);
    if (profile.supporter_years) meta.push('❤️ ' + profile.supporter_years);
    if ($('profileMeta')) $('profileMeta').textContent = meta.join(' · ') || 'Community biancorossa';
    if ($('seniorityBadge')) $('seniorityBadge').textContent = profile.supporter_years ? '⚽ ' + profile.supporter_years : '⚽ Nuovo membro';
    const pct = 60 + (profile.city ? 20 : 0) + (profile.supporter_years ? 20 : 0);
    if ($('profileProgressText')) $('profileProgressText').textContent = pct + '% completo';
    if ($('profileProgressFill')) $('profileProgressFill').style.width = pct + '%';
  }

  function renderOnlineLoggedOut(message) {
    currentUser = null;
    currentProfile = null;
    announceSession();
    $('joinCard') && ($('joinCard').style.display = 'block');
    $('profileCard')?.classList.remove('show');
    $('accountDot')?.classList.remove('on');
    $('navAccountDot')?.classList.remove('on');
    $('accountMode')?.classList.remove('on');
    if ($('accountMode')) $('accountMode').textContent = 'ONLINE · USCITO';
    if ($('accountStatusTitle')) $('accountStatusTitle').textContent = 'Nessun account collegato';
    if ($('accountStatusText')) $('accountStatusText').textContent = 'Registrati o accedi al tuo TB ID';
    if (message) showMessage(message, 'ok');
  }

  function readCredentials(signup = false) {
    const email = ($('joinEmail')?.value || '').trim().toLowerCase();
    const password = $('joinPassword')?.value || '';
    if (!email || !email.includes('@')) throw new Error('Inserisci un indirizzo email valido.');
    if (!password || (signup && password.length < 8)) throw new Error(signup ? 'La password deve contenere almeno 8 caratteri.' : 'Inserisci la password del tuo account.');
    return { email, password };
  }

  function requireConsent() {
    if (!$('joinConsent')?.checked) {
      throw new Error('Per creare o collegare l’account devi accettare Privacy e Regolamento Community.');
    }
  }

  async function recordConsent(user) {
    if (!db || !user) return;
    const { error } = await db.from('consents').upsert({
      user_id: user.id,
      policy_version: CONSENT_VERSION,
      privacy_accepted: true,
      community_rules_accepted: true,
      age_declaration: '14_or_parental_authorization',
      accepted_at: new Date().toISOString(),
      user_agent: navigator.userAgent.slice(0, 300)
    }, { onConflict: 'user_id,policy_version' });
    if (error) console.warn('Consenso non registrato:', error.message);
    if (!error) storage.remove('tb-pending-consent');
  }

  window.signInSocial = async function (provider) {
    if (provider !== 'google' || googleStarting) return;
    if (!db || initializing) return showMessage('Connessione account in corso. Riprova fra poco.', 'error');
    const button = document.querySelector('button.google');
    googleStarting=true;button.disabled=true;button.setAttribute('aria-busy','true');
    showMessage('Ti stiamo collegando a Google…');
    try {
      if (!storage.set(AUTH_PENDING_KEY,String(Date.now()))) throw new Error('storage unavailable');
      storage.set('tb-pending-consent', CONSENT_VERSION);
      // Use the existing allow-listed root, never an old callback URL.
      const { data, error } = await deadline(db.auth.signInWithOAuth({provider:'google',options:{
        redirectTo:location.origin + '/',skipBrowserRedirect:true
      }}));
      if(error) throw error;
      if(!data?.url) throw new Error('Accesso Google non disponibile.');
      location.assign(data.url);
    } catch(error) {
      storage.remove(AUTH_PENDING_KEY);storage.remove('tb-pending-consent');
      showMessage(authErrorMessage(error),'error');resetGoogleButton();
    }
  };
  function resetGoogleButton() {
    googleStarting=false;
    const button=document.querySelector('button.google');
    if(button){button.disabled=false;button.removeAttribute('aria-busy');}
  }

  function emailBusy(busy) {
    emailStarting = busy;
    document.querySelectorAll('[onclick="createOnlineAccount()"],[onclick="loginOnlineAccount()"]').forEach(button => {
      button.disabled = busy;
      button.setAttribute('aria-busy', String(busy));
    });
  }
  function emailError(error) {
    const message = String(error?.message || '');
    if (/database error saving new user/i.test(message)) return authErrorMessage(error);
    if (/invalid login credentials/i.test(message)) return 'Email o password non corrette. Se ti sei registrato con Google, usa Continua con Google.';
    if (/email not confirmed/i.test(message)) return 'Conferma prima l’indirizzo email usando il messaggio ricevuto da Trenino Bari.';
    if (/rate|too many|security purposes/i.test(message)) return 'Troppi tentativi ravvicinati. Attendi qualche minuto prima di riprovare.';
    return message || 'Accesso non riuscito. Riprova.';
  }
  window.createOnlineAccount = async function () {
    if (!db || initializing) return showMessage('Connessione account in corso. Riprova fra poco.', 'error');
    if (emailStarting) return;
    emailBusy(true);
    try {
      requireConsent();
      const { email, password } = readCredentials(true);
      const nickname = ($('joinNick')?.value || '').trim();
      if (nickname.length < 2 || nickname.length > 24) throw new Error('Scegli un nickname da 2 a 24 caratteri.');
      if (!storage.set('tb-pending-consent', CONSENT_VERSION)) throw new Error('Il browser non consente di salvare la sessione.');
      showMessage('Creazione dell’account in corso…');
      const { data, error } = await deadline(db.auth.signUp({email, password, options: {
        emailRedirectTo: location.origin + '/',
        data: {nickname, city: ($('joinCity')?.value || '').trim().slice(0,30), supporter_years: $('joinYears')?.value || ''}
      }}));
      if (error) throw error;
      if (data.session?.user) {
        await applySession(data.session);
        window.switchView?.('home');
      } else {
        showMessage('Controlla la posta e lo spam: se la registrazione può essere completata, riceverai il link di conferma. Se hai già un account, usa Accedi.', 'ok');
      }
    } catch (error) { showMessage(emailError(error), 'error'); }
    finally { emailBusy(false); }
  };

  window.loginOnlineAccount = async function () {
    if (!db || initializing) return showMessage('Connessione account in corso. Riprova fra poco.', 'error');
    if (emailStarting) return;
    emailBusy(true);
    try {
      const { email, password } = readCredentials();
      showMessage('Accesso in corso…');
      const { data, error } = await deadline(db.auth.signInWithPassword({ email, password }));
      if (error) throw error;
      if (!data.session?.user) throw new Error('Il servizio non ha restituito una sessione. Riprova.');
      await applySession(data.session);
      window.switchView?.('home');
    } catch (error) { showMessage(emailError(error), 'error'); }
    finally { emailBusy(false); }
  };

  window.logoutCommunity = async function () {
    if (!db || !currentUser) return;
    if (!confirm('Vuoi uscire dal tuo account TB?')) return;
    try {
      const { error } = await deadline(db.auth.signOut());
      if (error) throw error;
      ++sessionRevision;
      storage.remove(AUTH_PENDING_KEY);
      renderOnlineLoggedOut('Sei uscito correttamente dal tuo account TB.');
      window.switchView?.('home');
    } catch (error) {
      // Keep a valid identity visible when logout failed. Never claim it succeeded.
      window.alert('Uscita non completata. La sessione potrebbe essere ancora attiva. Riprova.');
    }
  };

  window.editCommunityProfile = async function () {
    if (!db || !currentUser) {
      $('joinCard').style.display = 'block';
      $('profileCard').classList.remove('show');
      return;
    }
    const nickname = prompt('Nickname TB', currentProfile?.nickname || '');
    if (nickname === null) return;
    const city = prompt('Città', currentProfile?.city || '');
    if (city === null) return;
    const cleanNick = nickname.trim();
    if (cleanNick.length < 2 || cleanNick.length > 24) {
      alert('Il nickname deve contenere da 2 a 24 caratteri.');
      return;
    }
    const { error } = await db.from('profiles').update({
      nickname: cleanNick,
      city: city.trim().slice(0, 30),
      updated_at: new Date().toISOString()
    }).eq('id', currentUser.id);
    if (error) return alert('Modifica non riuscita: ' + error.message);
    currentProfile = await loadProfile(currentUser);
    renderOnlineProfile(currentUser, currentProfile);
  };

  function onlinePostHtml(post) {
    const when = new Date(post.created_at).toLocaleString('it-IT', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });
    return '<article class="community-post user-generated" data-post-id="' + post.id + '">' +
      '<div class="cp-head"><div class="cp-avatar">🐓</div><div class="cp-meta"><b>' +
      window.esc(post.author_name || 'Tifoso TB') + '</b><span>🌐 Community online · ' + when +
      '</span></div></div><p>' + window.esc(post.body) +
      '</p><div class="cp-actions"><button onclick="toggleOnlineReaction(' + post.id + ',this)">❤️ ' +
      (post.reaction_count || 0) + '</button><button onclick="shareSite()">↗ Condividi</button></div></article>';
  }

  async function loadOnlinePosts() {
    if (!db) return;
    const { data, error } = await db
      .from('posts')
      .select('id,user_id,author_name,body,created_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(40);
    if (error) {
      if (/relation .* does not exist/i.test(error.message || '')) {
        setConnectionState(true);
        $('accountRoadmap').innerHTML = '<b>🛠 Database collegato, schema da attivare.</b> Applica il file supabase/schema.sql per abilitare post e profili condivisi.';
      }
      return;
    }
    document.querySelectorAll('#communityFeed .demo-post,#communityFeed .user-generated').forEach((node) => node.remove());
    const feed = $('communityFeed');
    if (feed) data.slice().reverse().forEach((post) => feed.insertAdjacentHTML('afterbegin', onlinePostHtml(post)));
    if ($('statPosts') && currentUser) $('statPosts').textContent = data.filter((post) => post.user_id === currentUser.id).length;
  }

  window.publishCommunityPost = async function () {
    if (!db) return showMessage('Accedi al tuo account per pubblicare.', 'error');
    if (!currentUser || !currentProfile) return alert('Accedi prima al tuo account TB.');
    const composer = $('communityComposer');
    const body = (composer?.value || '').trim();
    if (!body) return;
    const { error } = await db.from('posts').insert({
      user_id: currentUser.id,
      author_name: currentProfile.nickname,
      body
    });
    if (error) return alert('Pubblicazione non riuscita: ' + error.message);
    composer.value = '';
    await loadOnlinePosts();
  };

  window.toggleOnlineReaction = async function (postId, button) {
    if (!currentUser) return alert('Accedi per lasciare una reazione.');
    const { data } = await db.from('post_reactions').select('post_id').eq('post_id', postId).eq('user_id', currentUser.id).maybeSingle();
    const query = data
      ? db.from('post_reactions').delete().eq('post_id', postId).eq('user_id', currentUser.id)
      : db.from('post_reactions').insert({ post_id: postId, user_id: currentUser.id, reaction: 'heart' });
    const { error } = await query;
    if (!error && button) {
      const count = Number((button.textContent.match(/\d+/) || ['0'])[0]);
      button.textContent = '❤️ ' + Math.max(0, count + (data ? -1 : 1));
    }
  };

  window.submitPrivacyRequest = async function () {
    const status = $('privacyRequestStatus');
    if (!currentUser) return alert('Accedi al tuo account TB per inviare una richiesta privacy.');
    const requestType = $('privacyRequestType')?.value || 'access';
    const details = ($('privacyRequestText')?.value || '').trim();
    if (details.length < 5) return alert('Descrivi brevemente la richiesta.');
    const { error } = await db.from('privacy_requests').insert({
      user_id: currentUser.id,
      request_type: requestType,
      details
    });
    if (status) {
      status.style.display = 'block';
      status.className = 'account-message ' + (error ? 'error' : 'ok');
      status.textContent = error ? 'Richiesta non inviata: ' + error.message : 'Richiesta registrata. Puoi conservarne traccia nel tuo account.';
    }
    if (!error && $('privacyRequestText')) $('privacyRequestText').value = '';
  };

  window.deleteOnlineAccount = async function () {
    if (!db || !currentUser) return alert('Non risulta alcun account online collegato.');
    const confirmation = prompt('Operazione irreversibile. Scrivi CANCELLA per eliminare account, profilo e contenuti.');
    if (confirmation !== 'CANCELLA') return;
    const { data } = await db.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return alert('Sessione scaduta: accedi nuovamente.');
    const response = await fetch('/api/delete-account', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation: 'CANCELLA' })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return alert(result.error || 'Cancellazione non riuscita.');
    await db.auth.signOut();
    localStorage.removeItem('tb-community-profile');
    renderOnlineLoggedOut('Account e dati collegati sono stati cancellati.');
  };

  async function syncVisibleSession() {
    if (!db) return;
    const revision=authEventRevision;
    const { data, error } = await deadline(db.auth.getSession());
    if (error || revision!==authEventRevision) return;
    await applySession(data.session);
  }

  window.addEventListener('focus', () => { if (!initializing) syncVisibleSession().catch(()=>{}); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !initializing) syncVisibleSession().catch(()=>{}); });
  window.addEventListener('storage', event => { if (event.key?.includes('auth-token') && !initializing) syncVisibleSession().catch(()=>{}); });
  window.addEventListener('pageshow', event => {
    resetGoogleButton();
    if(callbackError && !currentUser && !initializing) openCommunityView();
    if(event.persisted && !initializing) syncVisibleSession().catch(()=>{});
  });

  async function init() {
    if ($('accountStatusTitle')) $('accountStatusTitle').textContent='Verifica accesso…';
    if ($('accountStatusText')) $('accountStatusText').textContent='Ripristino della sessione TB';
    try {
      if(callbackError){clearOAuthMarkers();storage.remove(AUTH_PENDING_KEY);}
      const response = await fetch('/api/supabase-config', {cache:'no-store',headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});
      const config = await response.json();
      if (!response.ok || !config.configured || !window.supabase) throw new Error('Configurazione Supabase non disponibile.');
      db = window.supabase.createClient(config.url, config.key, {
        auth: {persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
      });
      setConnectionState(true);
      // Subscribe before any other request. Do not await Auth inside its callback.
      db.auth.onAuthStateChange((_event,session)=>{
        authEventRevision++;lastAuthSession=session;
        if(initializing) return;
        setTimeout(()=>applySession(session).catch(()=>{}),0);
      });
      const revision=authEventRevision;
      const {data,error}=await deadline(db.auth.getSession());
      if(error) throw error;
      const session=authEventRevision===revision ? data.session : lastAuthSession;
      initializing=false;
      if(session) await applySession(session);
      else if(callbackError) showAuthError(callbackError,callbackCode);
      else if(returning) {
        storage.remove(AUTH_PENDING_KEY);clearOAuthMarkers();returning=false;
        showAuthError('Accesso non completato');
      } else renderOnlineLoggedOut();
      deadline(loadOnlinePosts(),8000).catch(()=>{});
      realtimeChannel=db.channel('tb-community-posts')
        .on('postgres_changes',{event:'*',schema:'public',table:'posts'},loadOnlinePosts).subscribe();
    } catch(error) {
      initializing=false;
      if(returning){clearOAuthMarkers();storage.remove(AUTH_PENDING_KEY);returning=false;}
      setConnectionState(!!db);showAuthError(callbackError || error,callbackCode);
    } finally {resetGoogleButton();}
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();

