const fs=require('node:fs'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync('index.html','utf8');
const dom=new JSDOM(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,''),{url:'https://treninobari.vercel.app/',runScripts:'dangerously',pretendToBeVisual:true});
const w=dom.window;
w.scrollTo=()=>{};w.HTMLElement.prototype.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
w.matchMedia=()=>({matches:false,addEventListener(){}});
w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({},{get:()=>()=>({addColorStop(){}})});
w.ResizeObserver=class{observe(){}};w.IntersectionObserver=class{observe(){}};
w.requestAnimationFrame=()=>1;w.alert=()=>{};w.confirm=()=>false;
w.crypto.subtle=require('node:crypto').webcrypto.subtle;w.TextEncoder=TextEncoder;
w.AbortSignal=AbortSignal;
w.fetch=async()=>({ok:false,json:async()=>({error:'Interazioni online in attivazione.'})});
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).filter(Boolean);
const combined=scripts.join('\n')+'\n'+fs.readFileSync('community-supabase.js','utf8')+'\n'+fs.readFileSync('video-news.js','utf8')+'\n'+fs.readFileSync('member.js','utf8');
w.eval(combined);
setTimeout(async()=>{
try{
  assert.equal(w.document.querySelectorAll('#allNews .tb-video-card').length,3);
  w.document.querySelector('[data-filter=video]').click();
  assert.equal([...w.document.querySelectorAll('#allNews .news-item')].filter(x=>x.style.display!=='none').length,3);
  w.document.getElementById('newsSearch').value='Rastelli';w.filterNews();
  assert.equal([...w.document.querySelectorAll('#allNews .news-item')].filter(x=>x.style.display!=='none').length,1);
  w.switchView('news');
  w.document.querySelector('#allNews .tb-video-card .tb-video-play').click();
  assert.equal(w.document.querySelectorAll('.tb-video-screen iframe').length,1);
  w.switchView('community');
  await new Promise(r=>setTimeout(r,0));
  assert.equal(w.document.querySelectorAll('.tb-video-screen iframe').length,0);
  assert.ok(w.document.querySelector('#view-profile form'));
  assert.ok(w.document.querySelectorAll('.tb-reactions').length>10);
  assert.equal(w.document.getElementById('joinConsent').checked,false);
  assert.equal(w.document.querySelector('.social-login .google').textContent.trim(),'Continua con Google');
  assert.equal(w.document.querySelectorAll('[data-filter=video]').length,1);
  assert.equal(w.document.querySelectorAll('#bari-videos').length,1);
  console.log('PASS: video copies/filter/search/player teardown, profile, news controls and Google UI');
}catch(error){console.error(error);process.exitCode=1;}
finally{w.close();}
},200);
