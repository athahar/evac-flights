-- Evac Flight Alert: dashboard pipeline schema
-- Applied via Supabase MCP. This file is for reproducibility.

create type run_status as enum ('running', 'active', 'archived');

create table runs (
  id            uuid primary key default gen_random_uuid(),
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  status        run_status not null default 'running',
  origin        text not null,
  total_checked int,
  total_found   int
);

create table flights (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references runs(id) on delete cascade,
  date          date not null,
  airline       text,
  iata_code     text,
  flight_no     text,
  origin        text,
  destination   text,
  departure_at  timestamptz,
  arrival_at    timestamptz,
  stops         int,
  price_usd     numeric,
  seats         int,
  offer_id      text,
  created_at    timestamptz default now()
);

create table alerts_sent (
  id         uuid primary key default gen_random_uuid(),
  run_id     uuid references runs(id) on delete cascade,
  flight_id  uuid references flights(id) on delete cascade,
  sent_at    timestamptz default now()
);

create index on flights(run_id);
create index on runs(status);

-- Invariant: at most one active run
create unique index runs_one_active on runs ((true)) where status = 'active';
-- Invariant: at most one running run
create unique index runs_one_running on runs ((true)) where status = 'running';

-- RLS (service_role bypasses, but defense-in-depth)
alter table runs enable row level security;
alter table flights enable row level security;
alter table alerts_sent enable row level security;

create policy "service_role_all" on runs for all to service_role using (true) with check (true);
create policy "service_role_all" on flights for all to service_role using (true) with check (true);
create policy "service_role_all" on alerts_sent for all to service_role using (true) with check (true);

-- Atomic run finalization
create or replace function finalize_evac_run(
  p_run_id uuid,
  p_completed_at timestamptz,
  p_total_checked int,
  p_total_found int,
  p_success boolean,
  p_error text default null
) returns void language plpgsql
set search_path = public
as $$
begin
  if p_success and p_total_found > 0 then
    update runs set status = 'archived' where status = 'active';
    update runs set
      status = 'active', completed_at = p_completed_at,
      total_checked = p_total_checked, total_found = p_total_found
    where id = p_run_id;
  else
    update runs set
      status = 'archived', completed_at = p_completed_at,
      total_checked = p_total_checked, total_found = p_total_found
    where id = p_run_id;
  end if;
end; $$;

-- Manual purge: removes archived runs older than 24 hours
create or replace function purge_old_runs() returns void
set search_path = public
as $$
  delete from runs
  where status = 'archived'
  and completed_at < now() - interval '24 hours';
$$ language sql;
