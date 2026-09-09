-- BantayBaha seed — 19 critical sites (OSM), 5 clusters, 7 reports, 1x 🔴 dedupe demo (count=3)
-- Run in Supabase SQL Editor. Resets demo state in one go.
-- Campus: ISAT-U, La Paz, Iloilo City. Source: approximate (OSM), see seed/map/critical_sites.coords.json.
-- Reference view: https://www.openstreetmap.org/#map=19/10.714859/122.565935
-- Campus center: 10.715500,122.566400. Proximity: 100 if ≤30m of a critical site else 50.

create extension if not exists postgis;

-- clear (order matters FK)
delete from status_events;
delete from reports;
delete from clusters;
delete from critical_sites;

-- critical sites: 19 OSM-derived pins (Map 1 = CEA & Extension Campus, Map 2 = Main Grounds & Athletics)
-- Map 1 pin 9 (I-Mart) is estimated across Burgos St; all others are OSM way/node centroids.
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

-- clusters: priority = severity*0.4 + density*0.35 + proximity*0.25
-- severity weight: LOW 20, MEDIUM 60, HIGH 100; density min(count*25,100); proximity 100 if ≤30m else 50
insert into clusters (id, hazard_type, lat, lng, severity, report_count, priority_score, status, created_at, updated_at) values
  -- 🔴 HIGH, 3 reports, density 75, proximity 100 (9m from Campus Parking Lot / Science Bldg) => 91
  ('10000000-0000-0000-0000-000000000001', 'Clogged drain', 10.716354, 122.567179, 3, 3, 91, 'Pending', now() - interval '3 days', now() - interval '3 days'),
  -- 🟡 MEDIUM, 1 report, proximity 100 (6m from Research Hub) => 58
  ('10000000-0000-0000-0000-000000000002', 'Trash buildup', 10.716885, 122.567410, 2, 1, 58, 'Pending', now() - interval '2 days', now() - interval '2 days'),
  -- 🟡 MEDIUM, 1 report, proximity 50 => 45
  ('10000000-0000-0000-0000-000000000003', 'Standing water', 10.715500, 122.566000, 2, 1, 45, 'Pending', now() - interval '1 day', now() - interval '1 day'),
  -- 🟢 LOW, 1 report, proximity 50 => 29
  ('10000000-0000-0000-0000-000000000004', 'Trash buildup', 10.716000, 122.568000, 1, 1, 29, 'Pending', now() - interval '5 hours', now() - interval '5 hours'),
  -- 🟢 LOW, 1 report, proximity 50 (95m from University Library) => 29
  ('10000000-0000-0000-0000-000000000005', 'Clogged drain', 10.715000, 122.565500, 1, 1, 29, 'Pending', now() - interval '2 hours', now() - interval '2 hours');

-- reports: 7 total, 3 attached to 🔴 cluster to demo dedupe (same hazard_type + 15m)
insert into reports (id, tracking_id, hazard_type, photo_path, lat, lng, landmark, severity, ai_summary, cluster_id, status, created_at) values
  ('20000000-0000-0000-0000-000000000001', 'TRK-RED01', 'Clogged drain', null, 10.716354, 122.567179, 'Campus Parking Lot, near Science Building', 3, 'Blocked canal drainage, high debris', '10000000-0000-0000-0000-000000000001', 'Pending', now() - interval '3 days'),
  ('20000000-0000-0000-0000-000000000002', 'TRK-RED02', 'Clogged drain', null, 10.716360, 122.567185, 'Campus Parking Lot, near Science Building', 3, 'Same drain, standing water', '10000000-0000-0000-0000-000000000001', 'Pending', now() - interval '2 days 12 hours'),
  ('20000000-0000-0000-0000-000000000003', 'TRK-RED03', 'Clogged drain', null, 10.716350, 122.567175, 'Campus Parking Lot, near Science Building', 2, 'Moderate debris', '10000000-0000-0000-0000-000000000001', 'Pending', now() - interval '1 day 6 hours'),
  ('20000000-0000-0000-0000-000000000004', 'TRK-YEL01', 'Trash buildup', null, 10.716885, 122.567410, 'Research Hub service lane', 2, 'Debris buildup', '10000000-0000-0000-0000-000000000002', 'Pending', now() - interval '2 days'),
  ('20000000-0000-0000-0000-000000000005', 'TRK-YEL02', 'Standing water', null, 10.715500, 122.566000, 'Football Field north edge', 2, 'Standing water after rain', '10000000-0000-0000-0000-000000000003', 'Pending', now() - interval '1 day'),
  ('20000000-0000-0000-0000-000000000006', 'TRK-GRN01', 'Trash buildup', null, 10.716000, 122.568000, 'Jocson Drive sidewalk', 1, 'Minor trash', '10000000-0000-0000-0000-000000000004', 'Pending', now() - interval '5 hours'),
  ('20000000-0000-0000-0000-000000000007', 'TRK-GRN02', 'Clogged drain', null, 10.715000, 122.565500, 'West Campus Parking Bay', 1, 'Minor gutter leak', '10000000-0000-0000-0000-000000000005', 'Pending', now() - interval '2 hours');

-- verify
select 'clusters' as tbl, count(*) from clusters union all select 'reports', count(*) from reports union all select 'critical_sites', count(*) from critical_sites;
