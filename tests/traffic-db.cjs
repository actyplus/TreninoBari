const assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
(async()=>{
 const db=new PGlite();
 await db.exec('create role anon; create role authenticated; create role service_role;');
 const sql=fs.readFileSync('supabase/migrations/20260913_traffic.sql','utf8');
 await db.exec(sql);await db.exec(sql); // rerunnable without losing totals
 const v='a'.repeat(64),v2='b'.repeat(64),p='c'.repeat(64),p2='d'.repeat(64),u='e'.repeat(64),ip='f'.repeat(64);
 const act=async(a='read',visitor=v,page=p,user=null,bucket=ip)=>(await db.query('select public.tb_traffic_action($1,$2,$3,$4,$5) as data',[a,visitor,page,user,bucket])).rows[0].data;
 let r=await act();assert.equal(r.started_at,null);assert.equal(r.visits,0);
 r=await act('beat');assert.equal(r.visits,1);assert.equal(r.pageviews,1);assert.equal(r.guests,1);
 r=await act('beat');assert.equal(r.visits,1);assert.equal(r.pageviews,1);
 r=await act('beat',v,p2);assert.equal(r.visits,1);assert.equal(r.pageviews,2);assert.equal(r.guests,1);
 r=await act('beat',v,p2,u);assert.equal(r.guests,0);assert.equal(r.members,1);assert.equal(r.visits,1);
 r=await act('beat',v2,p,u);assert.equal(r.members,1); // same account, second device
 r=await act('beat',v2,p,null);assert.equal(r.members,1);assert.equal(r.guests,1); // logout
 await db.exec("update public.tb_traffic_sessions set last_seen=now()-interval '3 minutes'");
 r=await act();assert.equal(r.members,0);assert.equal(r.guests,0);
 await db.exec("update public.tb_traffic_sessions set last_seen=now()-interval '31 minutes'");
 r=await act('beat',v,p,u);assert.equal(r.visits,3);assert.equal(r.members,1);
 r=await act('leave',v,p);assert.equal(r.members,0);assert.equal(r.visits,3);
 r=await act('beat',v,p,u);assert.equal(r.members,0);assert.equal(r.visits,3); // late request cannot undo opt-out
 await db.exec("update public.tb_traffic_rate set requests=120");
 await assert.rejects(()=>act('beat',v2,p),/rate_limit/);
 await db.exec("update public.tb_traffic_rate set started_at=now()-interval '2 minutes'");
 await act('beat',v2,p);
 await db.exec(sql);r=await act();assert.equal(r.visits,4);
 await db.exec('set role anon');
 await assert.rejects(()=>act());
 await assert.rejects(()=>db.exec('select * from public.tb_traffic_sessions'));
 await db.exec('reset role; set role authenticated');
 await assert.rejects(()=>db.exec('update public.tb_traffic_totals set visits=999'));
 await db.exec('reset role; set role service_role');r=await act();assert.equal(r.visits,4);
 await db.close();console.log('PASS traffic SQL: totals, repeat requests, reloads, login/logout, multi-device dedup, expiry, withdrawal race, throttle, rerun, RLS.');
})().catch(e=>{console.error(e);process.exitCode=1;});
