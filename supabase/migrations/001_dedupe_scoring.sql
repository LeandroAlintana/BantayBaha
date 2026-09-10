-- BantayBaha dedupe + priority scoring (spec §B.2/B.3)
-- Same hazard_type AND within 15m of open pin → merge; different category → new pin.
-- Priority = Severity*0.40 + Density*0.35 + Proximity*0.25
-- Severity weight: LOW 20 / MEDIUM 60 / HIGH 100; Density min(count*25,100); Proximity 100 if ≤30m of critical_sites else 50

create extension if not exists postgis;

-- allow Quarantined status (spec §10.4 spam path)
do $$ begin
  alter table clusters drop constraint if exists clusters_status_check;
  alter table reports drop constraint if exists reports_status_check;
exception when others then null; end $$;
alter table clusters add constraint clusters_status_check check (status in ('Pending','In Progress','Cleared','Quarantined'));
alter table reports add constraint reports_status_check check (status in ('Pending','In Progress','Cleared','Quarantined'));

create or replace function bb_priority(sev int, cnt int, prox int) returns int language sql immutable as $$
  select ((case sev when 3 then 100 when 2 then 60 else 20 end)*0.40 + least(cnt*25,100)*0.35 + prox*0.25)::int
$$;

create or replace function bb_proximity(lat double precision, lng double precision) returns int language sql stable as $$
  select case when lat is null or lng is null then 50
  when exists(
    select 1 from critical_sites
    where ST_DWithin(ST_SetSRID(ST_MakePoint(lng, lat),4326)::geography, ST_SetSRID(ST_MakePoint(critical_sites.lng, critical_sites.lat),4326)::geography, 30)
  ) then 100 else 50 end
$$;

create or replace function bb_on_report() returns trigger language plpgsql as $$
declare
  target_id uuid;
  target_sev int;
  target_cnt int;
  prox int;
  new_score int;
begin
  -- quarantined reports: isolate in own cluster, never merge
  if NEW.status = 'Quarantined' then
    prox := bb_proximity(NEW.lat, NEW.lng);
    new_score := bb_priority(NEW.severity, 1, prox);
    insert into clusters (hazard_type, lat, lng, severity, report_count, priority_score, status)
    values (NEW.hazard_type, NEW.lat, NEW.lng, NEW.severity, 1, new_score, 'Quarantined')
    returning id into target_id;
    NEW.cluster_id := target_id;
    return NEW;
  end if;

  -- find nearest open cluster same hazard_type within 15m (geography needs SRID 4326)
  select c.id, c.severity, c.report_count into target_id, target_sev, target_cnt
  from clusters c
  where c.status in ('Pending','In Progress')
    and c.hazard_type = NEW.hazard_type
    and c.lat is not null and c.lng is not null
    and NEW.lat is not null and NEW.lng is not null
    and ST_DWithin(ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat),4326)::geography, ST_SetSRID(ST_MakePoint(c.lng, c.lat),4326)::geography, 15)
  order by ST_Distance(ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat),4326)::geography, ST_SetSRID(ST_MakePoint(c.lng, c.lat),4326)::geography)
  limit 1;

  if target_id is not null then
    -- merge: increment count, keep max severity, recalc priority
    target_sev := greatest(target_sev, NEW.severity);
    target_cnt := target_cnt + 1;
    prox := bb_proximity((select lat from clusters where id=target_id), (select lng from clusters where id=target_id));
    new_score := bb_priority(target_sev, target_cnt, prox);
    update clusters set report_count=target_cnt, severity=target_sev, priority_score=new_score, updated_at=now() where id=target_id;
    NEW.cluster_id := target_id;
  else
    prox := bb_proximity(NEW.lat, NEW.lng);
    new_score := bb_priority(NEW.severity, 1, prox);
    insert into clusters (hazard_type, lat, lng, severity, report_count, priority_score, status)
    values (NEW.hazard_type, NEW.lat, NEW.lng, NEW.severity, 1, new_score, coalesce(NEW.status,'Pending'))
    returning id into target_id;
    NEW.cluster_id := target_id;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_bb_on_report on reports;
create trigger trg_bb_on_report before insert on reports for each row execute function bb_on_report();
