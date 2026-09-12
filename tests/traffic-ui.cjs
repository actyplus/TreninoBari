const assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const tick=()=>new Promise(r=>setTimeout(r,25));
(async()=>{
 const dom=new JSDOM('<html class="tb-auth-loading"><body><section id="view-home"><div class="section" id="homeFirst"></div></section><section id="view-community"><div class="section"></div></section></body></html>',{url:'https://treninobari.vercel.app',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,calls=[];let timer,fail=false;
 w.AbortSignal.timeout=()=>undefined;w.setInterval=fn=>timer=fn;
 w.localStorage.setItem('tb-consent','all'); // old generic cookie choice is not consent for new analytics
 w.TBAuth={user:null,token:async()=>'test-only-token'};
 w.fetch=async(url,options)=>{calls.push(options);return{ok:!fail,status:fail?503:200,json:async()=>({visits:1,pageviews:1,members:0,guests:1,started_at:'2026-09-13T00:00:00Z'})};};
 w.eval(fs.readFileSync('traffic.js','utf8'));await tick();
 assert.equal(w.document.querySelectorAll('.tb-traffic').length,2);
 assert.equal(w.document.getElementById('homeFirst').previousElementSibling.className,'section tb-traffic');
 assert.ok(calls.every(c=>!c.method));assert.equal(w.localStorage.getItem('tb-stats-visit-v1'),null);
 w.document.documentElement.classList.remove('tb-auth-loading');
 w.document.querySelector('[data-enable]').click();await tick();
 let beat=calls.find(c=>c.method==='POST');assert.ok(beat);const first=JSON.parse(beat.body);assert.equal(first.consent,true);assert.equal(beat.headers.Authorization,undefined);
 timer();await tick();let last=calls.at(-1);assert.equal(JSON.parse(last.body).visitor,first.visitor);assert.equal(JSON.parse(last.body).page,first.page);
 w.TBAuth.user={id:'test-user'};w.dispatchEvent(new w.CustomEvent('tb:auth'));await tick();
 assert.equal(calls.at(-1).headers.Authorization,'Bearer test-only-token');
 w.TBAuth.user=null;w.dispatchEvent(new w.CustomEvent('tb:auth'));await tick();assert.equal(calls.at(-1).headers.Authorization,undefined);
 w.document.querySelector('[data-disable]').click();await tick();
 assert.equal(w.localStorage.getItem('tb-stats-visit-v1'),null);assert.ok(calls.some(c=>c.body&&JSON.parse(c.body).action==='leave'));
 const count=calls.filter(c=>c.method==='POST').length;timer();await tick();assert.equal(calls.filter(c=>c.method==='POST').length,count);
 fail=true;timer();await tick();assert.equal(w.document.querySelector('[data-count]').textContent,'—');assert.match(w.document.querySelector('[data-status]').textContent,/non ancora disponibili/);
 dom.window.close();console.log('PASS traffic UI: separate consent, guest/member/logout, stable heartbeat IDs, withdrawal, unavailable counters.');
})().catch(e=>{console.error(e);process.exitCode=1;});
