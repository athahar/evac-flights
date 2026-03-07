-- On-demand live search persistence cache/community table

create table if not exists search_queries (
  id                         uuid primary key default gen_random_uuid(),
  created_at                 timestamptz not null default now(),
  query_signature            text not null,
  origin                     text not null,
  departure_date             date not null,
  destinations_json          jsonb not null,
  destinations_blocked_json  jsonb not null default '[]'::jsonb,
  source                     text not null check (source in ('live', 'cache')),
  pairs_checked              int not null default 0,
  offers_found               int not null default 0,
  duration_ms                int not null default 0,
  errors_json                jsonb not null default '[]'::jsonb,
  results_json               jsonb not null
);

create index if not exists idx_search_queries_signature_created_at
  on search_queries(query_signature, created_at desc);
create index if not exists idx_search_queries_created_at
  on search_queries(created_at desc);

alter table search_queries enable row level security;

drop policy if exists "service_role_all" on search_queries;

create policy "service_role_all"
  on search_queries
  for all
  to service_role
  using (true)
  with check (true);
