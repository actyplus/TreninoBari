const test=require('node:test'),assert=require('node:assert/strict');
const handler=require('../api/community.js');
process.env.SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only-key';
const user={id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:new Date().toISOString(),created_at:new Date().toISOString()};
let calls=[];
global.fetch=async(url,options)=>{calls.push({url,options});return{ok:true,json:async()=>url.endsWith('/auth/v1/user')?user:{member:{xp:0}}};};
async function request(body,token='valid'){
  calls=[];let status=200,result;
  const res={setHeader(){},status(n){status=n;return this;},json(x){result=x;return this;}};
  await handler({method:'POST',body,headers:token?{authorization:'Bearer '+token}:{}},res);
  return{status,result};
}
test('rejects unauthenticated mutations',async()=>assert.equal((await request({action:'reaction'},null)).status,401));
test('rejects unknown article keys',async()=>assert.equal((await request({action:'reaction',article:'fake',value:1})).status,400));
test('verifies caller and ignores forged identity and XP',async()=>{
  const article=[...handler.newsKeys()][0];
  assert.ok(article);
  const response=await request({action:'reaction',article,value:1,user_id:'attacker',points:999});
  assert.equal(response.status,200);
  const rpc=JSON.parse(calls.at(-1).options.body);
  assert.equal(rpc.p_user,user.id);assert.equal(rpc.p_data.points,undefined);assert.equal(rpc.p_data.user_id,undefined);
});
test('accepts anonymous deduplicated views without storing raw address',async()=>{
  const article=[...handler.newsKeys()][0];
  assert.equal((await request({action:'view',article},null)).status,200);
  const rpc=JSON.parse(calls.at(-1).options.body);assert.match(rpc.p_data.viewer,/^[a-f0-9]{64}$/);assert.equal(rpc.p_user,null);
});
test('server determines penalty opponent, not client',async()=>{
  const response=await request({action:'penalty',mode:'shoot',choice:'left-high',requestId:crypto.randomUUID(),opponent:'forged',points:5000});
  assert.equal(response.status,200);const rpc=JSON.parse(calls.at(-1).options.body);
  assert.notEqual(rpc.p_data.opponent,'forged');assert.equal(rpc.p_data.points,undefined);
});
