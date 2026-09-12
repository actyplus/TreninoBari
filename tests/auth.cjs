const fs=require('node:fs'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
const dom=new JSDOM(html,{url:'https://treninobari.vercel.app/',runScripts:'outside-only',virtualConsole:new VirtualConsole()});
const w=dom.window;let session=null,callback,oauthOptions,clientOptions;
const profile={id:'test-user',nickname:'Tifoso test',city:'Bari'};
const user={id:'test-user',email:'test@example.invalid',app_metadata:{provider:'google'},user_metadata:{full_name:'Tifoso test'}};
const query={select(){return this;},eq(){return this;},is(){return this;},order(){return this;},upsert(){return Promise.resolve({error:null});},maybeSingle:async()=>({data:profile,error:null}),limit:async()=>({data:[],error:null})};
w.fetch=async()=>({ok:true,json:async()=>({configured:true,url:'https://test.supabase.co',key:'test-publishable'})});
w.switchView=()=>{};w.confirm=()=>true;w.esc=x=>String(x);w.profileSlug=()=> 'tifosotest';
w.supabase={createClient:(_url,_key,options)=>{clientOptions=options;return{
  from:()=>query,channel:()=>({on(){return this;},subscribe(){}}),
  auth:{getSession:async()=>({data:{session}}),onAuthStateChange:fn=>{callback=fn;},
    signInWithOAuth:async options=>{oauthOptions=options;return{error:new Error('Test: stop before external navigation')};},
    signOut:async()=>{session=null;return{error:null};}}
};}};
w.eval(fs.readFileSync('community-supabase.js','utf8'));
setTimeout(async()=>{
try{
  assert.equal(w.document.getElementById('joinConsent').checked,false);
  await w.signInSocial('google');
  assert.equal(oauthOptions.provider,'google');assert.equal(oauthOptions.options.redirectTo,'https://treninobari.vercel.app/');
  assert.equal(clientOptions.auth.persistSession,true);assert.equal(clientOptions.auth.autoRefreshToken,true);
  session={user};callback('SIGNED_IN',session);await new Promise(r=>setTimeout(r,20));
  assert.equal(w.TBAuth.user.id,'test-user');assert.equal(w.document.getElementById('joinCard').style.display,'none');
  assert.ok(w.document.documentElement.classList.contains('tb-authenticated'));
  await w.TBAuth.refresh();assert.equal(w.TBAuth.user.id,'test-user');
  await w.logoutCommunity();assert.equal(w.TBAuth.user,null);assert.equal(w.document.getElementById('joinCard').style.display,'block');
  assert.ok(!w.document.documentElement.classList.contains('tb-authenticated'));
  console.log('PASS: Google ignores email checkbox, persistent session config, restoration and logout UI');
}catch(e){console.error(e);process.exitCode=1;}finally{w.close();}
},100);
