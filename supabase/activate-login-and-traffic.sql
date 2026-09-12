-- Apply to the existing Trenino Bari Supabase project; base schema required.
-- Apply after supabase/schema.sql. All writes below are service-only.
begin;
create table if not exists public.tb_members (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  referral_code text not null unique default left(replace(gen_random_uuid()::text,'-',''),24),
  topics jsonb not null default '["squadra","mercato","video"]',
  leaderboard boolean not null default false,
  goals integer not null default 0,
  saves integer not null default 0,
  last_play timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.tb_xp_events (
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_key text not null,
  points integer not null check(points between 1 and 50),
  created_at timestamptz not null default now(),
  primary key(user_id,event_key)
);
create table if not exists public.tb_news_reactions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  article text not null,
  value smallint not null check(value in (-1,1)),
  primary key(user_id,article)
);
create table if not exists public.tb_news_views (
  article text not null,
  viewer text not null,
  day date not null default (now() at time zone 'UTC')::date,
  primary key(article,viewer,day)
);
create table if not exists public.tb_predictions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  fixture text not null,
  home smallint not null check(home between 0 and 20),
  away smallint not null check(away between 0 and 20),
  comment text check(length(comment)<=400),
  updated_at timestamptz not null default now(),
  primary key(user_id,fixture)
);
create table if not exists public.tb_referrals (
  joined_user uuid primary key references public.profiles(id) on delete cascade,
  referrer uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check(joined_user<>referrer)
);
create table if not exists public.tb_penalty_rounds (
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(user_id,request_id)
);
do $$
declare t text;
begin
  foreach t in array array['tb_members','tb_xp_events','tb_news_reactions','tb_news_views','tb_predictions','tb_referrals','tb_penalty_rounds'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;

-- Prevent a long Google display name from aborting account creation.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare nick text;
begin
  nick := left(trim(coalesce(nullif(new.raw_user_meta_data->>'nickname',''),
    nullif(new.raw_user_meta_data->>'full_name',''),nullif(new.raw_user_meta_data->>'name',''),'Tifoso TB')),24);
  if length(nick)<2 then nick:='Tifoso TB'; end if;
  insert into public.profiles(id,nickname,city,supporter_years)
    values(new.id,nick,left(new.raw_user_meta_data->>'city',30),left(new.raw_user_meta_data->>'supporter_years',40))
    on conflict(id) do nothing;
  return new;
end $$;
-- The pre-existing profile policy must not let a member change their role.
revoke update on public.profiles from authenticated;
grant update(nickname,city,supporter_years,updated_at) on public.profiles to authenticated;

create or replace function public.tb_member_action(p_user uuid,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  awarded integer:=0; total integer:=0; used integer:=0; affected integer:=0;
  success boolean; existing jsonb; round_result jsonb:='{}'; ref uuid;
  member jsonb:=null; reactions jsonb; prediction_rows jsonb; leaders jsonb;
  utc_day date:=(now() at time zone 'UTC')::date;
begin
  if p_action not in ('state','view','reaction','prediction','comment','settings','referral','penalty') then raise exception 'Azione non valida.'; end if;
  if p_action not in ('state','view') and p_user is null then raise exception 'Accesso richiesto.'; end if;
  if p_user is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
    insert into public.tb_members(user_id) values(p_user) on conflict do nothing;
  end if;
  if p_action in ('reaction','view') and not ((p_data->'keys') ? (p_data->>'article')) then raise exception 'Notizia non valida.'; end if;
  if p_action='reaction' then
    if (p_data->>'value')::integer=0 then
      delete from public.tb_news_reactions where user_id=p_user and article=p_data->>'article';
    else
      insert into public.tb_news_reactions values(p_user,p_data->>'article',(p_data->>'value')::smallint)
      on conflict(user_id,article) do update set value=excluded.value;
    end if;
  elsif p_action='view' then
    insert into public.tb_news_views(article,viewer) values(p_data->>'article',p_data->>'viewer') on conflict do nothing;
  elsif p_action in ('prediction','comment') then
    if (p_data->>'kickoff')::timestamptz<=now() then raise exception 'La partita è iniziata: pronostici chiusi.'; end if;
    if p_action='prediction' then
      insert into public.tb_predictions(user_id,fixture,home,away)
      values(p_user,p_data->>'fixture',(p_data->>'home')::smallint,(p_data->>'away')::smallint)
      on conflict(user_id,fixture) do update set home=excluded.home,away=excluded.away,updated_at=now();
      insert into public.tb_xp_events values(p_user,'prediction:'||(p_data->>'fixture'),15,now()) on conflict do nothing;
      get diagnostics affected=row_count; awarded:=affected*15;
    else
      if length(trim(p_data->>'comment'))<12 then raise exception 'Scrivi un commento di almeno 12 caratteri.'; end if;
      if exists(select 1 from public.tb_predictions where user_id=p_user and updated_at>now()-interval '10 seconds') then
        raise exception 'Attendi qualche secondo prima di aggiornare il commento.';
      end if;
      update public.tb_predictions set comment=trim(p_data->>'comment'),updated_at=now()
      where user_id=p_user and fixture=p_data->>'fixture';
      if not found then raise exception 'Pubblica prima il tuo pronostico.'; end if;
      -- A copied comment from another fixture never earns another reward.
      if not exists(select 1 from public.tb_predictions where user_id=p_user and fixture<>p_data->>'fixture'
        and lower(regexp_replace(comment,'[[:space:]]+','','g'))=lower(regexp_replace(p_data->>'comment','[[:space:]]+','','g'))) then
        insert into public.tb_xp_events values(p_user,'comment:'||(p_data->>'fixture'),5,now()) on conflict do nothing;
        get diagnostics affected=row_count; awarded:=affected*5;
      end if;
    end if;
  elsif p_action='settings' then
    update public.tb_members set topics=p_data->'topics',leaderboard=coalesce((p_data->>'leaderboard')::boolean,false) where user_id=p_user;
  elsif p_action='referral' then
    select user_id into ref from public.tb_members where referral_code=p_data->>'code';
    if ref is null or ref=p_user then raise exception 'Invito non valido.'; end if;
    if not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null and created_at>now()-interval '7 days') then raise exception 'Invito riservato ai nuovi iscritti verificati.'; end if;
    -- Lock the referrer too so the weekly ceiling is safe across concurrent signups.
    perform pg_advisory_xact_lock(hashtextextended(ref::text,1));
    insert into public.tb_referrals(joined_user,referrer) values(p_user,ref) on conflict do nothing;
    get diagnostics affected=row_count;
    if affected=1 and (select count(*) from public.tb_xp_events where user_id=ref and event_key like 'referral:%' and created_at>now()-interval '7 days')<10 then
      insert into public.tb_xp_events values(ref,'referral:'||p_user,50,now()) on conflict do nothing;
    end if;
  elsif p_action='penalty' then
    select result into existing from public.tb_penalty_rounds where user_id=p_user and request_id=(p_data->>'request_id')::uuid;
    if existing is not null then round_result:=existing;
    else
      if exists(select 1 from public.tb_members where user_id=p_user and last_play>now()-interval '3 seconds') then raise exception 'Aspetta il prossimo rigore.'; end if;
      success:=case when p_data->>'mode'='shoot' then p_data->>'choice'<>p_data->>'opponent' else p_data->>'choice'=p_data->>'opponent' end;
      select coalesce(sum(points),0) into used from public.tb_xp_events where user_id=p_user and event_key like 'penalty:%' and (created_at at time zone 'UTC')::date=utc_day;
      awarded:=case when success then least(greatest(60-used,0),case when p_data->>'mode'='shoot' then 10 else 12 end) else 0 end;
      if awarded>0 then insert into public.tb_xp_events values(p_user,'penalty:'||(p_data->>'request_id'),awarded,now()); end if;
      update public.tb_members set last_play=now(),
        goals=goals+case when success and p_data->>'mode'='shoot' then 1 else 0 end,
        saves=saves+case when success and p_data->>'mode'='save' then 1 else 0 end where user_id=p_user;
      round_result:=jsonb_build_object('opponent',p_data->>'opponent','success',success,'awarded',awarded);
      insert into public.tb_penalty_rounds values(p_user,(p_data->>'request_id')::uuid,round_result,now());
    end if;
  end if;
  if p_user is not null then
    select coalesce(sum(points),0) into total from public.tb_xp_events where user_id=p_user;
    select to_jsonb(m)-'last_play'-'created_at' into member from public.tb_members m where user_id=p_user;
    member:=member||jsonb_build_object('xp',total,'level',1+total/100);
  end if;
  select coalesce(jsonb_object_agg(k,jsonb_build_object(
    'likes',(select count(*) from public.tb_news_reactions where article=k and value=1),
    'dislikes',(select count(*) from public.tb_news_reactions where article=k and value=-1),
    'views',(select count(*) from public.tb_news_views where article=k),
    'mine',coalesce((select value from public.tb_news_reactions where article=k and user_id=p_user),0)
  )),'{}') into reactions from jsonb_array_elements_text(p_data->'keys') as keys(k);
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into prediction_rows from (
    select p.nickname,t.home,t.away,t.comment,(t.user_id=p_user) as mine from public.tb_predictions t
    join public.profiles p on p.id=t.user_id where t.fixture=p_data->>'current_fixture'
    order by (t.user_id=p_user) desc nulls last,t.updated_at desc limit 100
  ) q;
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into leaders from (
    select p.nickname,coalesce(sum(e.points),0) as xp,1+coalesce(sum(e.points),0)/100 as level
    from public.tb_members m join public.profiles p on p.id=m.user_id left join public.tb_xp_events e on e.user_id=m.user_id
    where m.leaderboard group by m.user_id,p.nickname order by xp desc,m.user_id limit 20
  ) q;
  return jsonb_build_object('member',member,'articles',reactions,'predictions',prediction_rows,'leaders',leaders,'awarded',awarded,'round',round_result);
end $$;
revoke all on function public.tb_member_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.tb_member_action(uuid,text,jsonb) to service_role;
create index if not exists tb_xp_user_time on public.tb_xp_events(user_id,created_at);
create index if not exists tb_reaction_article on public.tb_news_reactions(article);
commit;


-- Run after schema.sql and 20260912_members.sql. No existing content is deleted.
begin;
create table if not exists public.tb_traffic_totals (
  id boolean primary key default true check(id),
  visits bigint not null default 0,
  pageviews bigint not null default 0,
  started_at timestamptz not null default now()
);
create table if not exists public.tb_traffic_sessions (
  visitor text primary key,
  account text,
  last_seen timestamptz not null,
  active boolean not null default true
);
create index if not exists tb_traffic_seen on public.tb_traffic_sessions(last_seen);
create table if not exists public.tb_traffic_pages (
  page text primary key,
  visitor text not null,
  last_seen timestamptz not null
);
create index if not exists tb_traffic_page_seen on public.tb_traffic_pages(last_seen);
create table if not exists public.tb_traffic_rate (
  bucket text primary key,
  started_at timestamptz not null,
  requests integer not null
);
alter table public.tb_traffic_totals enable row level security;
alter table public.tb_traffic_sessions enable row level security;
alter table public.tb_traffic_pages enable row level security;
alter table public.tb_traffic_rate enable row level security;
revoke all on public.tb_traffic_totals,public.tb_traffic_sessions,public.tb_traffic_pages,public.tb_traffic_rate from public,anon,authenticated;

create or replace function public.tb_traffic_action(p_action text,p_visitor text default null,p_page text default null,p_account text default null,p_bucket text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare last_visit timestamptz; allowed boolean; affected integer; hits integer; result jsonb;
begin
  if p_action not in ('read','beat','leave') then raise exception 'invalid_action'; end if;
  if p_action <> 'read' and (p_visitor is null or p_visitor !~ '^[a-f0-9]{64}$' or p_page is null or p_page !~ '^[a-f0-9]{64}$' or p_bucket is null or p_bucket !~ '^[a-f0-9]{64}$' or (p_account is not null and p_account !~ '^[a-f0-9]{64}$')) then raise exception 'invalid_identity'; end if;
  if p_action = 'read' then
    if not exists(select 1 from public.tb_traffic_totals) then
      return jsonb_build_object('visits',0,'pageviews',0,'members',0,'guests',0,'started_at',null,'as_of',now());
    end if;
  else
    insert into public.tb_traffic_rate as r values(p_bucket,now(),1)
      on conflict(bucket) do update set
        requests=case when r.started_at < now()-interval '1 minute' then 1 else r.requests+1 end,
        started_at=case when r.started_at < now()-interval '1 minute' then now() else r.started_at end
      returning requests into hits;
    if hits>120 then raise exception 'rate_limit'; end if;
    -- Serialise updates to a visitor across concurrent tabs and retries.
    perform pg_advisory_xact_lock(hashtextextended(p_visitor,0));
    if p_action = 'leave' then
      insert into public.tb_traffic_sessions values(p_visitor,null,now(),false)
        on conflict(visitor) do update set account=null,active=false,last_seen=now();
    else
      insert into public.tb_traffic_totals(id) values(true) on conflict do nothing;
      select last_seen,active into last_visit,allowed from public.tb_traffic_sessions where visitor=p_visitor;
      if allowed is distinct from false then
      if last_visit is null or last_visit < now()-interval '30 minutes' then
        update public.tb_traffic_totals set visits=visits+1 where id;
      end if;
      insert into public.tb_traffic_sessions values(p_visitor,p_account,now(),true)
        on conflict(visitor) do update set account=excluded.account,last_seen=excluded.last_seen,active=true;
      insert into public.tb_traffic_pages values(p_page,p_visitor,now()) on conflict do nothing;
      get diagnostics affected = row_count;
      if affected=1 then update public.tb_traffic_totals set pageviews=pageviews+1 where id; end if;
      update public.tb_traffic_pages set last_seen=now() where page=p_page;
      end if;
    end if;
    -- Short-lived pseudonyms; cleanup on subsequent traffic. Totals contain no identities.
    delete from public.tb_traffic_pages where last_seen < now()-interval '35 minutes';
    delete from public.tb_traffic_sessions where last_seen < now()-interval '35 minutes';
    delete from public.tb_traffic_rate where started_at < now()-interval '35 minutes';
  end if;
  select jsonb_build_object('visits',t.visits,'pageviews',t.pageviews,'started_at',t.started_at,
    'members',(select count(distinct account) from public.tb_traffic_sessions where account is not null and active and last_seen>now()-interval '2 minutes'),
    'guests',(select count(*) from public.tb_traffic_sessions where account is null and active and last_seen>now()-interval '2 minutes'),
    'as_of',now()) into result from public.tb_traffic_totals t where id;
  return coalesce(result,jsonb_build_object('visits',0,'pageviews',0,'members',0,'guests',0,'started_at',null,'as_of',now()));
end $$;
revoke all on function public.tb_traffic_action(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.tb_traffic_action(text,text,text,text,text) to service_role;
notify pgrst, 'reload schema';
commit;
