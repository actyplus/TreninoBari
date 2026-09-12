const fs=require('node:fs'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
const script=fs.readFileSync('community-supabase.js','utf8');
const user={id:'test-user',email:'test@example.invalid',app_metadata:{provider:'google'},user_metadata:{full_name:'Tifoso test'}};
const tick=()=>new Promise(r=>setTimeout(r,20));
async function setup(options={}) {
 const dom=new JSDOM(html,{url:options.url||'https://treninobari.vercel.app/',runScripts:'outside-only',virtualConsole:new VirtualConsole()});
 const w=dom.window;let session=options.session||null,callback,oauthOptions,clientOptions,view='',resolveProfile;
 w.AbortSignal.timeout=()=>undefined;
 const query={select(){return this;},eq(){return this;},is(){return this;},order(){return this;},upsert:async()=>({error:null}),maybeSingle:()=>options.pendingProfile?new Promise(r=>resolveProfile=r):Promise.resolve({data:{id:user.id,nickname:'Tifoso test'},error:null}),limit:async()=>({data:[],error:null})};
 w.fetch=async()=>({ok:true,json:async()=>({configured:true,url:'https://test.supabase.co',key:'test-publishable'})});
 w.switchView=v=>view=v;w.confirm=()=>true;w.esc=String;w.profileSlug=()=> 'tifosotest';
 if(options.pending)w.localStorage.setItem('tb-oauth-started-at',String(Date.now()));
 w.supabase={createClient:(_url,_key,config)=>{clientOptions=config;return {
   from:()=>query,channel:()=>({on(){return this;},subscribe(){}}),
   auth:{getSession:async()=>({data:{session},error:options.sessionError}),onAuthStateChange:fn=>{callback=fn;},
    signInWithOAuth:async config=>{oauthOptions=config;return {error:new Error('Test: stop before navigation')};},
    signOut:async()=>{session=null;callback('SIGNED_OUT',null);return{error:null};}}
 };}};
 w.eval(script);await tick();
 return {w,dom,get view(){return view;},get oauth(){return oauthOptions;},get config(){return clientOptions;},emit(s){session=s;callback(s?'SIGNED_IN':'SIGNED_OUT',s);},resolveProfile(){resolveProfile?.({data:{id:user.id,nickname:'Late profile'},error:null});}};
}
(async()=>{
 let t=await setup();
 assert.equal(t.w.document.getElementById('joinConsent').checked,false);
 await t.w.signInSocial('google');assert.equal(t.oauth.provider,'google');assert.equal(t.oauth.options.redirectTo,'https://treninobari.vercel.app/');
 assert.equal(t.config.auth.persistSession,true);assert.equal(t.config.auth.autoRefreshToken,true);assert.equal(t.config.auth.detectSessionInUrl,true);
 t.emit({user});await tick();assert.equal(t.w.TBAuth.user.id,user.id);assert.equal(t.w.document.getElementById('joinCard').style.display,'none');
 await t.w.TBAuth.refresh();assert.equal(t.w.TBAuth.user.id,user.id);
 await t.w.logoutCommunity();await tick();assert.equal(t.w.TBAuth.user,null);t.w.close();
 t=await setup({url:'https://treninobari.vercel.app/?error=server_error&error_code=unexpected_failure&error_description=Unable+to+exchange+external+code#',pending:true});
 assert.match(t.w.document.getElementById('accountMessage').textContent,/TB-GOOGLE-EXCHANGE/);
 assert.equal(t.w.document.getElementById('accountMessage').parentElement.id,'joinCard');assert.equal(t.view,'community');assert.equal(t.w.location.search,'');assert.equal(t.w.TBAuth.user,null);t.w.close();
 t=await setup({url:'https://treninobari.vercel.app/#error=access_denied&error_description=access_denied'});
 assert.match(t.w.document.getElementById('accountMessage').textContent,/annullato/);assert.equal(t.w.location.hash,'');t.w.close();
 t=await setup({session:{user},pending:true,pendingProfile:true});
 assert.equal(t.w.TBAuth.user.id,user.id);assert.equal(t.view,'home');assert.equal(t.w.document.getElementById('joinCard').style.display,'none');
 t.emit(null);await tick();t.resolveProfile();await tick();assert.equal(t.w.TBAuth.user,null);t.w.close();
 t=await setup({session:{user}});assert.equal(t.w.TBAuth.user.id,user.id);assert.equal(t.w.document.getElementById('joinCard').style.display,'none');t.w.close();
 t=await setup({sessionError:new Error('invalid code expired')});assert.match(t.w.document.getElementById('accountMessage').textContent,/scaduto/);assert.equal(t.w.document.documentElement.classList.contains('tb-auth-loading'),false);t.w.close();
 console.log('PASS: Google without email consent, persistence, callback errors visible and cleaned, restored login, nonblocking profile, late profile cannot undo logout, SDK errors surfaced.');
})().catch(e=>{console.error(e);process.exitCode=1;});
