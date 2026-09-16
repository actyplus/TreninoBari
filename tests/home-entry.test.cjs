/* Run with: node tests/home-entry.test.cjs. No real accounts or external requests. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const local=path.join(__dirname,'..','community-supabase.js');
const source=fs.readFileSync(fs.existsSync(local)?local:path.join(__dirname,'community-supabase.js'),'utf8');
function element(){return {style:{},classList:{add(){},remove(){},toggle(){}},setAttribute(){},removeAttribute(){},prepend(){},textContent:'',innerHTML:''};}
async function scenario({url='https://treninobari.vercel.app/',configured=false,session=null,pending=false}={}){
  const nodes=new Map(),listeners={},calls=[],stored=new Map();
  if(pending)stored.set('tb-oauth-started-at',String(Date.now()));
  const node=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  const query={select(){return this;},eq(){return this;},is(){return this;},order(){return this;},limit(){return Promise.resolve({data:[],error:null});},maybeSingle(){return Promise.resolve({data:null,error:null});}};
  const channel={on(){return this;},subscribe(){return this;}};
  const db={auth:{onAuthStateChange(){},getSession:async()=>({data:{session},error:null})},from:()=>query,channel:()=>channel};
  const location=new URL(url);
  const c={console,URL,URLSearchParams,AbortSignal,Date,setTimeout,clearTimeout,CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail;}},
    location,history:{replaceState(_a,_b,next){Object.assign(location,new URL(next,location.href));}},
    localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)},
    document:{readyState:'complete',hidden:false,title:'TB',documentElement:element(),getElementById:node,createElement:element,querySelector:()=>node('google'),querySelectorAll:()=>[],addEventListener(){}},
    fetch:async()=>({ok:configured,json:async()=>({configured,url:'https://example.supabase.co',key:'test-only'})}),
    supabase:{createClient:()=>db},switchView:name=>calls.push(name),esc:String,profileSlug:String,
    addEventListener:(name,fn)=>{(listeners[name]??=[]).push(fn);},dispatchEvent(){}
  };c.window=c;
  vm.runInNewContext(source,c,{filename:'community-supabase.js'});
  for(let i=0;i<4;i++)await new Promise(setImmediate);
  return {c,nodes,listeners,calls,stored};
}
(async()=>{
  let total=0;
  for(const options of [{},{url:'https://treninobari.vercel.app/#community'},{url:'https://treninobari.vercel.app/?error=access_denied&error_description=Annullato'},{pending:true},{configured:true}]){
    const s=await scenario(options);
    assert.deepEqual(s.calls,[],'Background auth must not navigate away from Home');
    for(const handler of s.listeners.pageshow||[])handler({persisted:true});
    await new Promise(setImmediate);
    assert.deepEqual(s.calls,[],'Auth pageshow must not override the page entry handler');
    s.c.switchView('community');assert.deepEqual(s.calls,['community'],'Explicit navigation remains available');
    if(!options.configured)assert.ok(s.nodes.get('accountMessage')?.textContent,'Keep useful auth errors in the account panel');
    total++;
  }
  const user={id:'test-user',email:'test@example.invalid',user_metadata:{name:'Test'},app_metadata:{provider:'google'}};
  const signed=await scenario({configured:true,session:{user},url:'https://treninobari.vercel.app/?code=test-code&tb_auth=complete'});
  assert.deepEqual(signed.calls,['home'],'Successful OAuth callback still returns Home');
  assert.equal(signed.c.TBAuth.user.id,user.id,'Do not break session restoration');
  assert.equal(signed.nodes.get('accountStatusTitle').textContent,'Accesso effettuato');
  total++;
  console.log('PASS: '+total+' Home/auth scenarios (mocked API).');
})().catch(error=>{console.error(error);process.exitCode=1;});
