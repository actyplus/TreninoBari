(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const state = { fixture: null, timer: null };
  const WINDOW_BEFORE = 48 * 60 * 60 * 1000;
  const WINDOW_AFTER = 4 * 60 * 60 * 1000;
  const ALLOWED_EMBEDS = new Set(['www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com', 'youtube-nocookie.com']);

  function safeHttps(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? url : null;
    } catch (_) {
      return null;
    }
  }

  function safeEmbed(value) {
    const url = safeHttps(value);
    return url && ALLOWED_EMBEDS.has(url.hostname) && url.pathname.startsWith('/embed/') ? url.href : '';
  }

  function formatKickoff(value) {
    return new Intl.DateTimeFormat('it-IT', {
      timeZone: 'Europe/Rome',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  }

  function formatConfirmed(value) {
    if (!value) return 'programmazione ufficiale';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'programmazione ufficiale';
    return 'verificata il ' + new Intl.DateTimeFormat('it-IT', {
      timeZone: 'Europe/Rome',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  function countdown(kickoff, now) {
    const difference = kickoff - now;
    if (difference <= 0) return '🔴 PARTITA IN CORSO';
    const hours = Math.floor(difference / 3600000);
    const minutes = Math.floor((difference % 3600000) / 60000);
    return hours >= 24 ? '⏳ Tra ' + Math.floor(hours / 24) + 'g ' + (hours % 24) + 'h' : '⏳ Tra ' + hours + 'h ' + minutes + 'm';
  }

  function selectFixture(fixtures, now) {
    return (fixtures || [])
      .filter(fixture => {
        const kickoff = Date.parse(fixture.kickoff);
        return Number.isFinite(kickoff) && now >= kickoff - WINDOW_BEFORE && now <= kickoff + WINDOW_AFTER;
      })
      .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))[0] || null;
  }

  function renderProvider(coverage, isLive) {
    const access = coverage.access || 'checking';
    const provider = coverage.provider || 'Disponibilità video in verifica';
    const providerName = $('matchProviderName');
    const providerDetail = $('matchProviderDetail');
    const providerStatus = $('matchProviderStatus');
    const providerIcon = $('matchProviderIcon');
    const officialWatch = $('matchOfficialWatch');
    const video = $('matchCoverageVideo');

    providerName.textContent = provider;
    providerStatus.className = 'match-provider-status';
    officialWatch.hidden = true;
    officialWatch.removeAttribute('href');
    video.hidden = true;
    video.replaceChildren();

    if (access === 'free-embed') {
      const embed = safeEmbed(coverage.embedUrl);
      providerIcon.textContent = '📺';
      providerStatus.textContent = 'GRATIS';
      providerStatus.classList.add('free');
      providerDetail.textContent = embed ? 'Player ufficiale disponibile su TB.' : 'Apri la fonte ufficiale.';
      if (embed && isLive) {
        const frame = document.createElement('iframe');
        frame.src = embed;
        frame.title = 'Diretta video ufficiale della partita';
        frame.loading = 'lazy';
        frame.allow = 'autoplay; encrypted-media; picture-in-picture';
        frame.allowFullscreen = true;
        frame.referrerPolicy = 'strict-origin-when-cross-origin';
        video.append(frame);
        video.hidden = false;
      }
    } else if (access === 'free-link') {
      providerIcon.textContent = '📺';
      providerStatus.textContent = 'GRATIS';
      providerStatus.classList.add('free');
      providerDetail.textContent = 'La diretta si apre sul sito dell’emittente.';
    } else if (access === 'paid') {
      providerIcon.textContent = '🔒';
      providerStatus.textContent = 'ABBONAMENTO';
      providerStatus.classList.add('paid');
      providerDetail.textContent = coverage.note || 'Nessuna diretta video gratuita ufficiale annunciata.';
    } else if (access === 'none') {
      providerIcon.textContent = '🎙️';
      providerStatus.textContent = 'TB LIVE';
      providerDetail.textContent = 'Salomone e cronaca descrittiva su Trenino Bari.';
    } else {
      providerIcon.textContent = '🔎';
      providerStatus.textContent = 'IN VERIFICA';
      providerDetail.textContent = 'TB controlla emittenti e canali ufficiali prima del calcio d’inizio.';
    }

    const watchUrl = safeHttps(coverage.watchUrl);
    if (watchUrl && (access === 'free-link' || access === 'free-embed')) {
      officialWatch.href = watchUrl.href;
      officialWatch.textContent = access === 'free-link' ? '📺 Guarda gratis sulla fonte ↗' : '📺 Apri il player ufficiale ↗';
      officialWatch.hidden = false;
    }
  }

  function render() {
    const fixture = state.fixture;
    const shell = $('matchCoverage');
    if (!fixture || !shell) {
      if (shell) shell.hidden = true;
      return;
    }

    const now = Date.now();
    const kickoff = Date.parse(fixture.kickoff);
    if (now < kickoff - WINDOW_BEFORE || now > kickoff + WINDOW_AFTER) {
      shell.hidden = true;
      return;
    }

    const isLive = now >= kickoff;
    const coverage = fixture.coverage || { access: 'checking' };
    shell.hidden = false;
    $('matchCoverageHeading').textContent = isLive ? '🔴 Partita in diretta' : '📡 Dove seguirla';
    $('matchCoverageWhen').textContent = isLive ? 'Segui e partecipa' : 'Disponibilità verificata';
    $('matchCoverageBadge').textContent = isLive ? '🔴 LIVE · TRENINO BARI' : '📡 PREPARTITA · ' + (coverage.access === 'checking' ? 'IN VERIFICA' : 'VERIFICATO');
    $('matchCoverageBadge').classList.toggle('live', isLive);
    $('matchCoverageCountdown').textContent = countdown(kickoff, now);
    $('matchCoverageTitle').textContent = fixture.home + '–' + fixture.away;
    $('matchCoverageKickoff').textContent = '⚽ ' + formatKickoff(fixture.kickoff) + ' · ' + (fixture.competition || 'Serie C');
    $('matchCoverageMessage').textContent = isLive
      ? (coverage.access === 'free-embed' || coverage.access === 'free-link'
          ? 'Guarda la fonte video ufficiale, reagisci con gli altri tifosi e segui anche radiocronaca e cronaca descrittiva.'
          : 'La copertura TB continua con la voce di Michele Salomone, la cronaca descrittiva e la community biancorossa.')
      : (coverage.access === 'free-embed' || coverage.access === 'free-link'
          ? 'Diretta gratuita ufficiale confermata. Condividi ora la partita e porta un altro tifoso sul Trenino.'
          : 'Condividi l’appuntamento: durante la gara troverai radiocronaca, cronaca descrittiva e interazioni della community.');

    renderProvider(coverage, isLive);

    const source = safeHttps(coverage.source || fixture.source);
    const sourceLink = $('matchCoverageSource');
    if (source) sourceLink.href = source.href;
    sourceLink.textContent = (coverage.sourceName || 'Fonte ufficiale') + ' ↗';
    $('matchCoverageSourceNote').textContent = formatConfirmed(coverage.confirmedAt);

    document.title = isLive ? '🔴 ' + fixture.home + '–' + fixture.away + ' • Trenino Bari' : 'TB • Trenino Bari';
  }

  window.shareMatchCoverage = async () => {
    if (!state.fixture) return;
    const fixture = state.fixture;
    const url = new URL('/', location.origin);
    url.searchParams.set('match', fixture.id);
    url.hash = 'copertura-partita';
    const text = '🐓⚽ ' + fixture.home + '–' + fixture.away + ' su Trenino Bari: dove vederla, radiocronaca, cronaca live e community. Sali sul Trenino! ❤️🤍';
    try {
      if (navigator.share) await navigator.share({ title: fixture.home + '–' + fixture.away + ' • Trenino Bari', text, url: url.href });
      else {
        await navigator.clipboard.writeText(text + ' ' + url.href);
        alert('🔗 Messaggio e link copiati!');
      }
    } catch (error) {
      if (error.name !== 'AbortError') alert('Condivisione non disponibile. Riprova.');
    }
  };

  window.openCoverageCommunity = mode => {
    if (typeof window.switchView === 'function') window.switchView('community');
    const target = mode === 'prediction' ? $('tbPrediction') : $('view-community');
    setTimeout(() => target?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };

  async function init() {
    try {
      const response = await fetch('/data/fixtures.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Calendario non disponibile');
      const data = await response.json();
      state.fixture = selectFixture(data.fixtures, Date.now());
      render();
      if (state.fixture) state.timer = setInterval(render, 30000);
      if (new URL(location.href).searchParams.get('match') === state.fixture?.id) {
        setTimeout(() => $('matchCoverage')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250);
      }
    } catch (_) {
      $('matchCoverage')?.setAttribute('hidden', '');
    }
  }

  document.addEventListener('DOMContentLoaded', init, { once: true });
})();