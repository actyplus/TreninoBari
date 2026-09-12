const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
(async()=>{
  const db=new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb,created_at timestamptz default now(),email_confirmed_at timestamptz default now()); create function auth.uid() returns uuid language sql as 'select null::uuid';");
  let base=fs.readFileSync('supabase/schema.sql','utf8').replace(/do \$\$[\s\S]*?alter publication[\s\S]*?end \$\$;/g,'');
  await db.exec(base);
  await db.exec(fs.readFileSync('supabase/migrations/20260912_members.sql','utf8'));
  const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
  for(const id of [a,b])await db.query("insert into auth.users(id,raw_user_meta_data) values($1,$2)",[id,{full_name:'Nome Google molto molto molto lungo oltre il limite'}]);
  const nick=await db.query('select nickname from public.profiles');
  assert.equal(nick.rows[0].nickname.length,24);
  async function act(action,data={},user=a){
    const r=await db.query('select public.tb_member_action($1,$2,$3) as value',[user,action,{keys:['n-test'],current_fixture:'match1',fixture:'match1',kickoff:'2099-01-01',...data}]);
    return r.rows[0].value;
  }
  let r=await act('reaction',{article:'n-test',value:1});
  assert.equal(r.articles['n-test'].likes,1);
  r=await act('reaction',{article:'n-test',value:1});assert.equal(r.articles['n-test'].likes,1);
  r=await act('reaction',{article:'n-test',value:-1});assert.equal(r.articles['n-test'].likes,0);assert.equal(r.articles['n-test'].dislikes,1);
  r=await act('view',{article:'n-test',viewer:'day-identity'},null);
  r=await act('view',{article:'n-test',viewer:'day-identity'},null);assert.equal(r.articles['n-test'].views,1);
  r=await act('prediction',{home:1,away:0});assert.equal(r.awarded,15);
  r=await act('prediction',{home:2,away:0});assert.equal(r.awarded,0);assert.equal(r.member.xp,15);
  await assert.rejects(()=>act('prediction',{home:1,away:0,kickoff:'2000-01-01'}));
  await db.exec("update public.tb_predictions set updated_at=now()-interval '20 seconds'");
  r=await act('comment',{comment:'Credo nella vittoria dei biancorossi'});assert.equal(r.awarded,5);
  await db.exec("update public.tb_predictions set updated_at=now()-interval '20 seconds'");
  r=await act('comment',{comment:'Credo ancora nella vittoria dei biancorossi'});assert.equal(r.awarded,0);
  r=await act('penalty',{request_id:'33333333-3333-4333-8333-333333333333',mode:'shoot',choice:'left-high',opponent:'right-low'});assert.equal(r.round.awarded,10);
  let replay=await act('penalty',{request_id:'33333333-3333-4333-8333-333333333333',mode:'shoot',choice:'left-high',opponent:'left-high'});assert.equal(replay.member.xp,r.member.xp);assert.equal(replay.member.goals,1);
  await assert.rejects(()=>act('penalty',{request_id:'44444444-4444-4444-8444-444444444444',mode:'shoot',choice:'left-high',opponent:'right-low'}));
  for(let i=0;i<7;i++){
    await db.exec("update public.tb_members set last_play=now()-interval '5 seconds'");
    r=await act('penalty',{request_id:'55555555-5555-4555-8555-'+String(i).padStart(12,'0'),mode:'shoot',choice:'left-high',opponent:'right-low'});
  }
  assert.equal(r.member.xp,80);assert.equal(r.round.awarded,0);
  const code=r.member.referral_code;
  await act('referral',{code},b);
  await act('referral',{code},b);
  r=await act('state');assert.equal(r.member.xp,130);assert.equal(r.member.level,2);
  await assert.rejects(()=>act('referral',{code},a));
  const privateState=await act('state',{},null);assert.equal(privateState.member,null);assert.equal(privateState.leaders.length,0);
  r=await act('settings',{topics:['video'],leaderboard:true});assert.equal(r.leaders.length,1);
  await db.exec('set role authenticated');
  await assert.rejects(()=>db.query('select public.tb_member_action($1,$2,$3)',[a,'state',{}]));
  await assert.rejects(()=>db.exec("insert into public.tb_xp_events values('11111111-1111-4111-8111-111111111111','fake',50,now())"));
  await assert.rejects(()=>db.exec("update public.profiles set role='admin'"));
  await db.close();
  console.log('PASS: migration, Google name bounds, reactions, views, prediction deadline, XP dedup/cap, replay, referrals, privacy and privilege checks');
})().catch(e=>{console.error(e);process.exitCode=1;});
