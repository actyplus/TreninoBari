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
      nickname: meta.nickname || (user?.email ? user.email.split('@')[0] : 'Tifoso TB'),
      city: meta.city || '',
      supporter_years: meta.supporter_years || ''
    };
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
    if ($('profileNick')) $('profileNick').textContent = nick;
    if ($('profileAvatar')) $('profileAvatar').textContent = (nick[0] || 'T').toUpperCase();
    if ($('profileHandle')) $('profileHandle').textContent = '@' + window.profileSlug(nick) + ' · account sincronizzato';
    const meta = [];
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

  window.createOnlineAccount = async function () {
    if (!db) return localJoinCommunity();
    try {
      const { email, password } = readCredentials();
      const nickname = ($('joinNick')?.value || '').trim();
      if (nickname.length < 2) throw new Error('Scegli un nickname di almeno 2 caratteri.');
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
      const profile = await loadProfile(data.user);
      renderOnlineProfile(data.user, profile);
      await loadOnlinePosts();
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

  async function init() {
    try {
      const response = await fetch('/api/supabase-config', { headers: { Accept: 'application/json' } });
      const config = await response.json();
      if (!response.ok || !config.configured || !window.supabase) throw new Error('Configurazione Supabase non disponibile.');
      db = window.supabase.createClient(config.url, config.key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      setConnectionState(true);
      const { data } = await db.auth.getSession();
      if (data.session?.user) {
        const profile = await loadProfile(data.session.user);
        renderOnlineProfile(data.session.user, profile);
      } else {
        renderOnlineLoggedOut();
      }
      await loadOnlinePosts();
      db.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          const profile = await loadProfile(session.user);
          renderOnlineProfile(session.user, profile);
        } else {
          renderOnlineLoggedOut();
        }
      });
      realtimeChannel = db.channel('tb-community-posts')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, loadOnlinePosts)
        .subscribe();
    } catch (error) {
      setConnectionState(false, 'Account online temporaneamente non disponibile. Puoi usare l’anteprima locale.');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
