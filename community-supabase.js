(function () {
  'use strict';

  let db = null;
  let currentUser = null;
  let currentProfile = null;
  let realtimeChannel = null;

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
      $('joinCard')?.appendChild(box);
    }
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
        : '📱 Modalità locale disponibile: il profilo resta soltanto su questo dispositivo.';
    }
    if (road) {
      road.innerHTML = online
        ? '<b>✅ Database TB collegato.</b> Account, post e sessione possono essere sincronizzati fra telefono e PC.'
        : '<b>⚠️ Database non raggiungibile.</b> TB continua a funzionare in modalità locale senza perdere la navigazione.';
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

  function oauthReturnPending() {
    return new URLSearchParams(location.search).get('tb_auth') === 'complete';
  }

  function oauthPopupIsOpen() {
    return Boolean(window.opener && !window.opener.closed);
  }

  function clearOAuthMarkers() {
    const url = new URL(location.href);
    url.searchParams.delete('tb_auth');
    url.searchParams.delete('view');
    const query = url.searchParams.toString();
    history.replaceState({}, document.title, url.pathname + (query ? '?' + query : '') + url.hash);
  }

  function openCommunityView() {
    if (typeof window.switchView === 'function') window.switchView('community');
  }

  async function loadProfileSafely(user) {
    try {
      return await loadProfile(user);
    } catch (error) {
      console.warn('Profilo remoto non ancora disponibile:', error.message);
      return profileFromMetadata(user);
    }
  }

  async function applySession(session) {
    if (!session?.user) return renderOnlineLoggedOut();
    const fallback = profileFromMetadata(session.user);
    renderOnlineProfile(session.user, fallback);
    if (localStorage.getItem('tb-pending-consent') === CONSENT_VERSION) {
      await recordConsent(session.user);
    }
    const profile = await loadProfileSafely(session.user);
    renderOnlineProfile(session.user, profile);
    await loadOnlinePosts();
    if (oauthReturnPending()) {
      clearOAuthMarkers();
      if (oauthPopupIsOpen()) {
        window.opener.postMessage({ type: 'tb-auth-complete' }, location.origin);
        setTimeout(() => window.close(), 350);
      }
    }
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

  function readCredentials() {
    const email = ($('joinEmail')?.value || '').trim().toLowerCase();
    const password = $('joinPassword')?.value || '';
    if (!email || !email.includes('@')) throw new Error('Inserisci un indirizzo email valido.');
    if (password.length < 8) throw new Error('La password deve contenere almeno 8 caratteri.');
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
    localStorage.removeItem('tb-pending-consent');
  }

  window.signInSocial = async function (provider) {
    if (!db) return showMessage('Account social temporaneamente non disponibile.', 'error');
    const authWindow = window.open('', 'tb-social-login');
    try {
      localStorage.setItem('tb-pending-consent', CONSENT_VERSION);
      localStorage.setItem('tb-pending-provider', provider);
      showMessage('Completa l’accesso nella scheda Google: tornerai qui automaticamente.', 'ok');
      const { data, error } = await db.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: location.origin + location.pathname + '?tb_auth=complete&view=community',
          skipBrowserRedirect: true
        }
      });
      if (error) throw error;
      if (!data?.url) throw new Error('Google non ha restituito il collegamento di accesso.');
      if (authWindow) authWindow.location.replace(data.url);
      else location.assign(data.url);
    } catch (error) {
      if (authWindow) authWindow.close();
      localStorage.removeItem('tb-pending-consent');
      localStorage.removeItem('tb-pending-provider');
      showMessage(error.message || 'Accesso social non disponibile.', 'error');
    }
  };

  window.createOnlineAccount = async function () {
    if (!db) return localJoinCommunity();
    try {
      requireConsent();
      const { email, password } = readCredentials();
      const nickname = ($('joinNick')?.value || '').trim();
      if (nickname.length < 2) throw new Error('Scegli un nickname di almeno 2 caratteri.');
      localStorage.setItem('tb-pending-consent', CONSENT_VERSION);
      showMessage('Creazione dell’account in corso…');
      const { data, error } = await db.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: location.origin,
          data: {
            nickname,
            city: ($('joinCity')?.value || '').trim(),
            supporter_years: $('joinYears')?.value || ''
          }
        }
      });
      if (error) throw error;
      if (data.session && data.user) {
        await recordConsent(data.user);
        const profile = await loadProfile(data.user);
        renderOnlineProfile(data.user, profile);
        await loadOnlinePosts();
      } else {
        renderOnlineLoggedOut();
        showMessage('Account creato. Controlla l’email e conferma il collegamento per entrare.', 'ok');
      }
    } catch (error) {
      showMessage(error.message || 'Impossibile creare l’account.', 'error');
    }
  };

  window.loginOnlineAccount = async function () {
    if (!db) return localJoinCommunity();
    try {
      const { email, password } = readCredentials();
      showMessage('Accesso in corso…');
      const { data, error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await applySession(data.session);
    } catch (error) {
      showMessage(error.message || 'Accesso non riuscito.', 'error');
    }
  };

  window.logoutCommunity = async function () {
    if (!db) return localLogoutCommunity();
    if (!confirm('Vuoi uscire dal tuo account TB?')) return;
    await db.auth.signOut();
    renderOnlineLoggedOut('Sei uscito correttamente dal tuo account TB.');
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
    if (!db) return localPublishCommunityPost();
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
    const { data, error } = await db.auth.getSession();
    if (error) return console.warn('Sincronizzazione sessione:', error.message);
    if (data.session) await applySession(data.session);
  }

  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.data?.type !== 'tb-auth-complete') return;
    openCommunityView();
    setTimeout(() => syncVisibleSession(), 150);
  });

  window.addEventListener('focus', () => {
    setTimeout(() => syncVisibleSession(), 250);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') setTimeout(() => syncVisibleSession(), 250);
  });

  window.addEventListener('storage', (event) => {
    if (event.key && event.key.includes('auth-token')) setTimeout(() => syncVisibleSession(), 100);
  });

  async function init() {
    const returning = oauthReturnPending();
    if (returning && oauthPopupIsOpen()) {
      if ($('joinCard')) $('joinCard').style.display = 'none';
      if ($('accountStatusTitle')) $('accountStatusTitle').textContent = 'Accesso in corso…';
      if ($('accountStatusText')) $('accountStatusText').textContent = 'Stiamo ripristinando la tua sessione TB';
      if ($('accountMode')) $('accountMode').textContent = 'CONNESSIONE';
    }
    try {
      const response = await fetch('/api/supabase-config', { headers: { Accept: 'application/json' } });
      const config = await response.json();
      if (!response.ok || !config.configured || !window.supabase) throw new Error('Configurazione Supabase non disponibile.');
      db = window.supabase.createClient(config.url, config.key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      setConnectionState(true);

      let { data } = await db.auth.getSession();
      if (!data.session && returning) {
        for (let attempt = 0; attempt < 5 && !data.session; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 350));
          ({ data } = await db.auth.getSession());
        }
      }
      if (data.session) await applySession(data.session);
      else {
        if (returning) clearOAuthMarkers();
        renderOnlineLoggedOut(returning ? 'Accesso Google non completato. Riprova dal pulsante dedicato.' : '');
      }

      await loadOnlinePosts();
      db.auth.onAuthStateChange((_event, session) => {
        setTimeout(() => applySession(session).catch((error) => {
          console.warn('Aggiornamento sessione non riuscito:', error.message);
        }), 0);
      });
      realtimeChannel = db.channel('tb-community-posts')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, loadOnlinePosts)
        .subscribe();
    } catch (error) {
      if (returning) clearOAuthMarkers();
      setConnectionState(false, 'Account online temporaneamente non disponibile. Riprova tra poco.');
    }
  }
  document.addEventListener('DOMContentLoaded', init);
})();
