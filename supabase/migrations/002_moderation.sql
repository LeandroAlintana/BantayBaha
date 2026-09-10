-- BantayBaha moderation + evidence status (spec v2.1 §6)
-- Adds reports.moderation_status / evidence_status and vision_observations table
-- Run AFTER 001_dedupe_scoring.sql

-- reports: moderation_status (NORMAL | NEEDS_REVIEW | QUARANTINED) and evidence_status (PHOTO | PHOTOLESS)
alter table reports add column if not exists moderation_status text not null default 'NORMAL' check (moderation_status in ('NORMAL','NEEDS_REVIEW','QUARANTINED'));
alter table reports add column if not exists evidence_status text not null default 'PHOTO' check (evidence_status in ('PHOTO','PHOTOLESS'));

-- backfill existing rows: photo_path null => PHOTOLESS
update reports set evidence_status = case when photo_path is null then 'PHOTOLESS' else 'PHOTO' end where evidence_status = 'PHOTO' and photo_path is null;

-- vision_observations: structured AI observation per report (spec v2.1 §4.2)
create table if not exists vision_observations (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  hazard_match text not null check (hazard_match in ('clear','possible','none')),
  hazard_type text not null check (hazard_type in ('clogged_drain','trash_buildup','standing_water','none')),
  evidence_strength text not null check (evidence_strength in ('strong','moderate','weak')),
  image_quality text not null check (image_quality in ('usable','poor','unusable')),
  possible_spam text not null check (possible_spam in ('no_evidence','possible','clear')),
  possible_duplicate text not null check (possible_duplicate in ('no_evidence','possible','clear')),
  observations text[] not null default '{}',
  needs_human_review boolean not null default false,
  moderation_state text not null check (moderation_state in ('NORMAL','NEEDS_REVIEW','QUARANTINED')),
  model text,
  created_at timestamptz not null default now()
);

create index if not exists idx_vision_obs_report on vision_observations(report_id);

-- RLS
alter table vision_observations enable row level security;
do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname='public' and tablename='vision_observations' loop
    execute format('drop policy if exists %I on vision_observations', r.policyname);
  end loop;
end $$;
create policy "public read vision_observations" on vision_observations for select using (true);
create policy "anon insert vision_observations" on vision_observations for insert with check (true);
