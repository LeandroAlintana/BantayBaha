-- BantayBaha base schema (spec §3) — run BEFORE 001_dedupe_scoring.sql
-- Supabase (Postgres + PostGIS). Zero-auth PWA: anon can insert reports, read clusters.
create extension if not exists postgis;
create extension if not exists "pgcrypto";

-- critical_sites: hardcoded Library / Lecture Halls etc (19 OSM pins)
create table if not exists critical_sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lat double precision not null,
  lng double precision not null
);

create table if not exists clusters (
  id uuid primary key default gen_random_uuid(),
  hazard_type text not null,
  lat double precision,
  lng double precision,
  severity int not null check (severity between 1 and 3),
  report_count int not null default 1,
  priority_score int,
  status text not null default 'Pending' check (status in ('Pending','In Progress','Cleared','Quarantined')),
  ai_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  tracking_id text not null unique,
  hazard_type text not null,
  photo_path text,
  lat double precision,
  lng double precision,
  landmark text,
  severity int check (severity between 1 and 3),
  ai_summary text,
  cluster_id uuid references clusters(id) on delete set null,
  status text not null default 'Pending' check (status in ('Pending','In Progress','Cleared','Quarantined')),
  created_at timestamptz not null default now()
);

create table if not exists status_events (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references clusters(id) on delete cascade,
  from_status text not null,
  to_status text not null,
  actor text not null default 'system',
  at timestamptz not null default now()
);

create index if not exists idx_reports_tracking on reports(tracking_id);
create index if not exists idx_reports_cluster on reports(cluster_id);
create index if not exists idx_clusters_status on clusters(status);
create index if not exists idx_status_events_cluster on status_events(cluster_id);

-- updated_at trigger
create or replace function bb_touch_updated() returns trigger language plpgsql as $$
begin NEW.updated_at := now(); return NEW; end $$;
drop trigger if exists trg_clusters_touch on clusters;
create trigger trg_clusters_touch before update on clusters for each row execute function bb_touch_updated();

-- RLS: PWA is zero-auth (anon) — allow read/insert per spec §2/§4
alter table critical_sites enable row level security;
alter table clusters enable row level security;
alter table reports enable row level security;
alter table status_events enable row level security;

-- drop existing policies if re-running
do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname='public' loop
    execute format('drop policy if exists %I on %I', r.policyname, r.tablename);
  end loop;
end $$;

-- public read for maps/queues/tracking
create policy "public read critical_sites" on critical_sites for select using (true);
create policy "public read clusters" on clusters for select using (true);
create policy "public read reports" on reports for select using (true);
create policy "public read status_events" on status_events for select using (true);
-- anon insert reports (zero-auth upload)
create policy "anon insert reports" on reports for insert with check (true);
-- anon insert status_events (vision quarantine path) + admin updates
create policy "anon insert status_events" on status_events for insert with check (true);
-- admin/dashboard updates clusters (status, hazard_type, pin) — anon for hackathon, tighten to auth in prod
create policy "anon update clusters" on clusters for update using (true) with check (true);
create policy "anon insert clusters" on clusters for insert with check (true);
-- allow anon to update own report's cluster_id is handled by trigger (reports insert only)

-- Storage bucket for photos (create if not exists) — run in Dashboard > Storage if this fails
insert into storage.buckets (id, name, public) values ('report-photos','report-photos', true)
on conflict (id) do nothing;

-- storage.objects policies (public read, anon upload)
do $$ begin
  drop policy if exists "public read report-photos" on storage.objects;
  drop policy if exists "anon upload report-photos" on storage.objects;
  drop policy if exists "anon update report-photos" on storage.objects;
exception when others then null; end $$;
create policy "public read report-photos" on storage.objects for select using (bucket_id='report-photos');
create policy "anon upload report-photos" on storage.objects for insert with check (bucket_id='report-photos');
create policy "anon update report-photos" on storage.objects for update using (bucket_id='report-photos') with check (bucket_id='report-photos');
