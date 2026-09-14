/* The verified Home archive is the single source for Home, News and match details. */
(() => {
  const months={gen:1,gennaio:1,feb:2,febbraio:2,mar:3,marzo:3,apr:4,aprile:4,mag:5,maggio:5,giu:6,giugno:6,lug:7,luglio:7,ago:8,agosto:8,set:9,settembre:9,ott:10,ottobre:10,nov:11,novembre:11,dic:12,dicembre:12};
  const dayParts={mattina:[9,0],pomeriggio:[15,0],sera:[21,0],finale:[23,59]};
  const calendarKey=(year,month,day,hour,minute,second=0)=>Number(
    String(year).padStart(4,'0')+String(month).padStart(2,'0')+String(day).padStart(2,'0')+
    String(hour).padStart(2,'0')+String(minute).padStart(2,'0')+String(second).padStart(2,'0')
  );
  function keyFromIso(value,endOfDay=false){
    const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if(!match)return 0;
    const hasTime=match[4]!==undefined;
    return calendarKey(Number(match[1]),Number(match[2]),Number(match[3]),hasTime?Number(match[4]):endOfDay?23:12,hasTime?Number(match[5]):endOfDay?59:0,hasTime&&match[6]?Number(match[6]):0);
  }
  function keyFromLabel(label){
    const text=String(label||'').toLocaleLowerCase('it-IT').replace(/^agg\.\s*/,'').trim();
    const match=text.match(/(\d{1,2})\s+(gen(?:naio)?|feb(?:braio)?|mar(?:zo)?|apr(?:ile)?|mag(?:gio)?|giu(?:gno)?|lug(?:lio)?|ago(?:sto)?|set(?:tembre)?|ott(?:obre)?|nov(?:embre)?|dic(?:embre)?)(?:\s+(\d{4}))?(?:\s*·\s*(?:(\d{1,2}):(\d{2})|(mattina|pomeriggio|sera|finale)))?/);
    if(!match||!months[match[2]])return 0;
    let hour=12,minute=0;
    if(match[4]!==undefined){hour=Number(match[4]);minute=Number(match[5]);}
    else if(match[6]&&dayParts[match[6]])[hour,minute]=dayParts[match[6]];
    return calendarKey(Number(match[3]||2026),months[match[2]],Number(match[1]),hour,minute);
  }
  function timelineKey(item){
    if(item.dataset.publishedAt)return keyFromIso(item.dataset.publishedAt,item.classList.contains('tb-video-card'));
    const semanticTime=item.querySelector('time[datetime]')?.getAttribute('datetime');
    if(semanticTime)return keyFromIso(semanticTime,item.classList.contains('tb-video-card'));
    if(item.dataset.matchDate)return keyFromIso(item.dataset.matchDate,true);
    return keyFromLabel(item.querySelector('.post-time')?.textContent);
  }
  function sortNewsChronologically(){
    const feed=document.getElementById('allNews');
    if(!feed)return;
    const items=[...feed.children].filter(item=>item.classList.contains('news-item'));
    items.forEach((item,index)=>{
      if(!item.dataset.timelineOrder)item.dataset.timelineOrder=String(index+1);
      item.dataset.timelineKey=String(timelineKey(item));
    });
    items.sort((a,b)=>Number(b.dataset.timelineKey)-Number(a.dataset.timelineKey)||Number(a.dataset.timelineOrder)-Number(b.dataset.timelineOrder));
    const fragment=document.createDocumentFragment();
    items.forEach(item=>fragment.append(item));
    feed.append(fragment);
  }
  window.sortNewsChronologically=sortNewsChronologically;

  const news = document.getElementById('allNews');
  const originals = [...document.querySelectorAll('#bari-videos .tb-video-card')];
  originals.forEach(card => {
    const copy = card.cloneNode(true);
    copy.removeAttribute('id');
    copy.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    copy.classList.add('news-item');
    copy.dataset.cat = 'video';
    news.append(copy);
  });
  window.sortNewsChronologically?.();
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
