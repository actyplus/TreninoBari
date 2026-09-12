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
