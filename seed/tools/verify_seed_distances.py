import math
R = 6371000.0
def hav(a, b, c, d):
    p1 = math.radians(a); p2 = math.radians(c)
    dp = math.radians(c - a); dl = math.radians(d - b)
    h = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2*R*math.asin(math.sqrt(h))
pts = {
    'C1': (10.716354, 122.567179),
    'C2': (10.716885, 122.567410),
    'C3': (10.715500, 122.566000),
    'C4': (10.716000, 122.568000),
    'C5': (10.715000, 122.565500),
    'RHub': (10.716925, 122.567448),
}
for a in ('C1', 'C2', 'C3', 'C4', 'C5'):
    for b in ('C1', 'C2', 'C3', 'C4', 'C5', 'RHub'):
        print(a + '-' + b, '%.1f' % hav(pts[a][0], pts[a][1], pts[b][0], pts[b][1]))
def prio(sev_w, count, prox):
    return sev_w*0.40 + min(count*25, 100)*0.35 + prox*0.25
print('C1', prio(100, 3, 100))
print('C2', prio(60, 1, 100))
print('C3', prio(60, 1, 50))
print('C4', prio(20, 1, 50))
print('C5', prio(20, 1, 50))
