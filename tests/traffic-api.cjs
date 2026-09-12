const test=require('node:test'),assert=require('node:assert/strict');
const handler=require('../api/traffic');
process.env.SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-server-secret';process.env.VERCEL_ENV='production';
const visitor='11111111-1111-4111-8111-111111111111',page='22222222-2222-4222-8222-222222222222';
const headers={origin:'https://treninobari.vercel.app','content-type':'application/json','x-vercel-forwarded-for':'192.0.2.1','user-agent':'test-browser'};
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},status(s){this.statusCode=s;return this;},json(data){this.body=data;return this;},end(){return this;}};}
async function run(overrides={}){const res=response();await handler({method:'POST',headers,body:{action:'beat',visitor,page,consent:true},...overrides},res);return res;}
test('reject invalid origin, missing consent, oversized body and method before upstream',async()=>{
 global.fetch=async()=>{throw Error('must not fetch');};
 assert.equal((await run({headers:{...headers,origin:'https://evil.test'}})).statusCode,403);
 assert.equal((await run({body:{action:'beat',visitor,page}})).statusCode,400);
 assert.equal((await run({body:'x'.repeat(513)})).statusCode,413);
 assert.equal((await run({method:'DELETE'})).statusCode,405);
});
test('guest beat never trusts supplied account or stores raw IP, UUID, key',async()=>{
 let payload;global.fetch=async(url,options)=>{payload=JSON.parse(options.body);return{ok:true,json:async()=>({visits:1})};};
 const r=await run({body:{action:'beat',visitor,page,consent:true,user_id:'forged'}});
 assert.equal(r.statusCode,200);assert.equal(payload.p_account,null);assert.match(payload.p_visitor,/^[a-f0-9]{64}$/);
 assert.ok(!JSON.stringify(payload).includes('192.0.2.1'));assert.ok(!JSON.stringify(payload).includes(visitor));
 assert.equal(r.headers['Cache-Control'],'no-store');
});
test('authenticated presence uses verified server identity; invalid tokens rejected',async()=>{
 let n=0,payload;global.fetch=async(url,options)=>{n++;if(url.endsWith('/user'))return{ok:true,json:async()=>({id:'verified-user'})};payload=JSON.parse(options.body);return{ok:true,json:async()=>({})};};
 assert.equal((await run({headers:{...headers,authorization:'Bearer test-token'}})).statusCode,200);
 assert.equal(n,2);assert.match(payload.p_account,/^[a-f0-9]{64}$/);
 global.fetch=async()=>({ok:false,status:401});
 assert.equal((await run({headers:{...headers,authorization:'Bearer bad-token'}})).statusCode,401);
});
test('read is aggregate only, missing migration never yields fabricated counters',async()=>{
 global.fetch=async()=>({ok:false,json:async()=>({code:'PGRST202'})});
 const r=await run({method:'GET',headers:{}});assert.equal(r.statusCode,503);assert.equal(r.body.code,'MIGRATION_REQUIRED');assert.equal(r.body.visits,undefined);
 global.fetch=async()=>({ok:true,json:async()=>({visits:4,members:1,guests:2})});
 const ok=await run({method:'GET',headers:{}});assert.equal(ok.statusCode,200);assert.match(ok.headers['Cache-Control'],/s-maxage=30/);
});
