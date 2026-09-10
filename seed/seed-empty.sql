-- BantayBaha empty seed — 19 critical sites, 0 clusters, 0 reports
-- Cold-start / empty-state test. Run in Supabase SQL Editor.
-- Campus: ISAT-U, La Paz, Iloilo City. Source: approximate (OSM), see seed/map/critical_sites.coords.json.
-- Use this to verify: empty queue, empty map, MT3D —, submit still works.

create extension if not exists postgis;

-- clear all reports/clusters (order matters FK) — keep critical_sites then re-seed
do $$ begin delete from status_events; exception when others then null; end $$;
do $$ begin delete from vision_observations; exception when others then null; end $$;
delete from reports;
delete from clusters;
delete from critical_sites;

-- critical sites: 19 OSM-derived pins (same as seed.sql)
insert into critical_sites (id, name, lat, lng) values
  ('00000000-0000-0000-0000-000000000001', 'College of Engineering and Architecture (CEA)', 10.716130, 122.566833),
  ('00000000-0000-0000-0000-000000000002', 'CEA-ICT Building', 10.715997, 122.566568),
  ('00000000-0000-0000-0000-000000000003', 'Science Building', 10.716300, 122.567247),
  ('00000000-0000-0000-0000-000000000004', 'Research Hub', 10.716925, 122.567448),
  ('00000000-0000-0000-0000-000000000005', 'Campus Parking Lot', 10.716415, 122.567123),
  ('00000000-0000-0000-0000-000000000006', 'Green Courtyard / Mini-Park', 10.716550, 122.567464),
  ('00000000-0000-0000-0000-000000000007', 'Press Play', 10.715820, 122.566996),
  ('00000000-0000-0000-0000-000000000008', 'Zerox', 10.715815, 122.566355),
  ('00000000-0000-0000-0000-000000000009', 'I-Mart', 10.716450, 122.565700),
  ('00000000-0000-0000-0000-000000000010', 'ISAT-U Bus / Jeepney Stop', 10.716240, 122.566052),
  ('00000000-0000-0000-0000-000000000011', 'ISAT-U Football Field', 10.714857, 122.565922),
  ('00000000-0000-0000-0000-000000000012', 'ISAT-U Volleyball Court', 10.714206, 122.565653),
  ('00000000-0000-0000-0000-000000000013', 'N-Building', 10.714351, 122.565445),
  ('00000000-0000-0000-0000-000000000014', 'L-Building', 10.714180, 122.566227),
  ('00000000-0000-0000-0000-000000000015', 'University Library', 10.714819, 122.566351),
  ('00000000-0000-0000-0000-000000000016', 'WVCST Multi-Purpose Cooperative', 10.715395, 122.566467),
  ('00000000-0000-0000-0000-000000000017', 'West Campus Parking Bay', 10.715040, 122.565398),
  ('00000000-0000-0000-0000-000000000018', 'Old Railroad (north segment)', 10.716928, 122.565073),
  ('00000000-0000-0000-0000-000000000019', 'Burgos Street (campus frontage)', 10.714753, 122.567190);

-- no clusters, no reports — empty queue

-- verify
select 'clusters' as tbl, count(*) from clusters union all select 'reports', count(*) from reports union all select 'critical_sites', count(*) from critical_sites;
