/* The verified Home archive is the single source for Home, News and match details. */
(() => {
  const news = document.getElementById('allNews');
  const originals = [...document.querySelectorAll('#bari-videos .tb-video-card')];
  originals.slice().reverse().forEach(card => {
    const copy = card.cloneNode(true);
    copy.removeAttribute('id');
    copy.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    copy.classList.add('news-item');
    copy.dataset.cat = 'video';
    news.prepend(copy);
  });
  const placeholders = new WeakMap();
  let playing = null;
  function close() {
    if (!playing) return;
    playing.querySelector('.tb-video-screen').innerHTML = placeholders.get(playing);
    playing.querySelector('.tb-video-close').hidden = true;
    playing = null;
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('.tb-video-play,.tb-video-close');
    if (!button) return;
    const card = button.closest('.tb-video-card');
    if (button.classList.contains('tb-video-close')) {
      close(); card.querySelector('.tb-video-play').focus(); return;
    }
    const id = card.dataset.videoId;
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return;
    close();
    if (!placeholders.has(card)) placeholders.set(card, card.querySelector('.tb-video-screen').innerHTML);
    const frame = document.createElement('iframe');
    frame.title = card.querySelector('h3').textContent;
    frame.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&playsinline=1&rel=0';
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    card.querySelector('.tb-video-screen').replaceChildren(frame);
    card.querySelector('.tb-video-close').hidden = false;
    playing = card;
    frame.focus();
  });
  new MutationObserver(() => {
    if (playing && (!playing.isConnected || !playing.closest('.view')?.classList.contains('active') || playing.closest('[hidden]') || playing.style.display === 'none')) close();
  }).observe(document.querySelector('main') || document.body, {subtree:true,childList:true,attributes:true,attributeFilter:['class','style']});
  window.addEventListener('pagehide', close);
})();
