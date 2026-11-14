#!/usr/bin/env python3
"""Draw the outline map on the fuel prices page (_includes/fuel-map.html), once.

Reads Natural Earth's 1:50m countries (public domain, naturalearthdata.com), as GeoJSON:
  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson

Writes:
  _data/fuel_map.json   one SVG path for each EU country, one for the land around them, and the size of the drawing

Run it from the repository root, with the downloaded file:   python3 scripts/build-fuel-map.py path/to/countries.geojson
Standard library only. Borders don't change with the weekly prices, so nothing runs this on a schedule: run it again
only to redraw the map (a new member state, a different crop). It prints how many points it kept.

The map is a Lambert azimuthal equal-area projection centred on 52°N 10°E, the one the EU's own statistical maps use,
on a 1,000-unit-wide drawing. Each outline is thinned to what shows at the size the page draws it, and written as
whole-number steps from point to point, which keeps the page light. Far-off territories (the Canaries, the Azores,
Madeira, the overseas departments) are left out, as are islands too small to see; the price figures are national
averages either way. The whole island of Cyprus takes Cyprus's colour, as on the Commission's maps.
"""

import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_JSON = os.path.join(ROOT, '_data', 'fuel_map.json')

EU = {
    'AT': 'Austria', 'BE': 'Belgium', 'BG': 'Bulgaria', 'HR': 'Croatia', 'CY': 'Cyprus', 'CZ': 'Czechia',
    'DK': 'Denmark', 'EE': 'Estonia', 'FI': 'Finland', 'FR': 'France', 'DE': 'Germany', 'GR': 'Greece',
    'HU': 'Hungary', 'IE': 'Ireland', 'IT': 'Italy', 'LV': 'Latvia', 'LT': 'Lithuania', 'LU': 'Luxembourg',
    'MT': 'Malta', 'NL': 'Netherlands', 'PL': 'Poland', 'PT': 'Portugal', 'RO': 'Romania', 'SK': 'Slovakia',
    'SI': 'Slovenia', 'ES': 'Spain', 'SE': 'Sweden',
}
ADM0 = {'AUT': 'AT', 'BEL': 'BE', 'BGR': 'BG', 'HRV': 'HR', 'CYP': 'CY', 'CYN': 'CY', 'CZE': 'CZ', 'DNK': 'DK', 'EST': 'EE',
        'FIN': 'FI', 'ALD': 'FI', 'FRA': 'FR', 'DEU': 'DE', 'GRC': 'GR', 'HUN': 'HU', 'IRL': 'IE', 'ITA': 'IT', 'LVA': 'LV',
        'LTU': 'LT', 'LUX': 'LU', 'MLT': 'MT', 'NLD': 'NL', 'POL': 'PL', 'PRT': 'PT', 'ROU': 'RO', 'SVK': 'SK', 'SVN': 'SI',
        'ESP': 'ES', 'SWE': 'SE'}

LAT0, LON0 = 52.0, 10.0          # the projection's centre
WINDOW = (-11.5, 34.0, 35.5, 71.5)  # lon west, lat south, lon east, lat north: a polygon centred outside it is far-off territory
WIDTH = 1000                     # the drawing's width in its own units; the page scales it to fit
PAD = 14                         # empty units around the EU's outline
MIN_AREA = 9.0                   # square units: smaller islands are dropped (Malta's are always kept)
TOLERANCE = {'eu': 0.8, 'around': 1.5}   # how far, in units, a thinned outline may stray from the real one
DOTS = ('LU', 'MT')              # too small to see or tap at phone width: the page adds a dot of fixed size on each


def project(lon, lat):
    """Lambert azimuthal equal-area on a sphere, in kilometres east and north of the centre."""
    lam, phi, phi0 = math.radians(lon - LON0), math.radians(lat), math.radians(LAT0)
    k = math.sqrt(2 / (1 + math.sin(phi0) * math.sin(phi) + math.cos(phi0) * math.cos(phi) * math.cos(lam)))
    return (6371 * k * math.cos(phi) * math.sin(lam),
            6371 * k * (math.cos(phi0) * math.sin(phi) - math.sin(phi0) * math.cos(phi) * math.cos(lam)))


def area(ring):
    return abs(sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]))) / 2


def centroid(ring):
    a = cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]):
        f = x0 * y1 - x1 * y0
        a += f
        cx += (x0 + x1) * f
        cy += (y0 + y1) * f
    return (cx / (3 * a), cy / (3 * a)) if a else ring[0]


def thin(points, tolerance):
    """Douglas-Peucker: drop the points that sit within tolerance of the line between the points kept."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = points[a], points[b]
        dx, dy = bx - ax, by - ay
        length = math.hypot(dx, dy)
        worst, at = 0.0, None
        for i in range(a + 1, b):
            px, py = points[i]
            d = abs(dy * (px - ax) - dx * (py - ay)) / length if length else math.hypot(px - ax, py - ay)
            if d > worst:
                worst, at = d, i
        if at is not None and worst > tolerance:
            keep[at] = True
            stack += [(a, at), (at, b)]
    return [p for p, k in zip(points, keep) if k]


def thin_ring(ring, tolerance):
    """Thin a closed outline, split at its two most distant points so neither half collapses to nothing."""
    if len(ring) < 8:
        return ring
    far = max(range(len(ring)), key=lambda i: (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2)
    return thin(ring[:far + 1], tolerance)[:-1] + thin(ring[far:] + ring[:1], tolerance)[:-1]


def clip(ring, box):
    """Sutherland-Hodgman: the part of a closed outline inside a rectangle (x0, y0, x1, y1)."""
    x0, y0, x1, y1 = box
    edges = ((0, x0, 1), (0, x1, -1), (1, y0, 1), (1, y1, -1))   # axis, limit, which side is inside
    for axis, limit, sign in edges:
        if not ring:
            break
        out = []
        for a, b in zip(ring, ring[1:] + ring[:1]):
            a_in, b_in = (a[axis] - limit) * sign >= 0, (b[axis] - limit) * sign >= 0
            if a_in != b_in:
                t = (limit - a[axis]) / (b[axis] - a[axis])
                out.append((a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])))
            if b_in:
                out.append(b)
        ring = out
    return ring


def path(rings):
    """Closed outlines as one SVG path of whole-number steps: m x y, then l dx dy for each point, then z."""
    parts = []
    for ring in rings:
        pts = []
        for x, y in ring:
            p = (int(round(x)), int(round(y)))
            if not pts or p != pts[-1]:
                pts.append(p)
        if len(pts) > 1 and pts[0] == pts[-1]:
            pts.pop()
        if len(pts) < 3:
            continue
        steps = ''.join('{}{}{}'.format(' ' if i and dx >= 0 else '', dx, ' {}'.format(dy) if dy >= 0 else dy)
                        for i, (dx, dy) in enumerate((b[0] - a[0], b[1] - a[1]) for a, b in zip(pts, pts[1:])))
        parts.append('M{} {}l{}z'.format(pts[0][0], pts[0][1], steps))
    return ''.join(parts)


def build(features):
    # Every polygon's outer ring, in kilometres, with the country it belongs to (None: the land around the EU)
    shapes = []
    for f in features:
        code = ADM0.get(f['properties']['ADM0_A3'])
        geom = f['geometry']
        polys = geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]
        for poly in polys:
            ring = poly[0]
            lons, lats = [p[0] for p in ring], [p[1] for p in ring]
            if max(lons) < -40 or min(lons) > 75 or max(lats) < 20:
                continue   # the far side of the world, where the projection has nothing useful to say
            mid_lon, mid_lat = (min(lons) + max(lons)) / 2, (min(lats) + max(lats)) / 2
            if code and not (WINDOW[0] <= mid_lon <= WINDOW[2] and WINDOW[1] <= mid_lat <= WINDOW[3]):
                continue   # a member state's far-off territory: the Canaries, the Azores, Madeira, the overseas departments
            shapes.append((code, [project(lon, lat) for lon, lat in ring]))

    missing = sorted(set(EU) - {c for c, _ in shapes})
    if missing:
        raise SystemExit('No outline found for: ' + ', '.join(missing))

    # The frame: the EU's outlines, padded, scaled to WIDTH units across; y grows downward on the page
    xs = [x for c, ring in shapes if c for x, _ in ring]
    ys = [y for c, ring in shapes if c for _, y in ring]
    scale = (WIDTH - 2 * PAD) / (max(xs) - min(xs))
    height = int(math.ceil((max(ys) - min(ys)) * scale + 2 * PAD))
    place = lambda p: ((p[0] - min(xs)) * scale + PAD, (max(ys) - p[1]) * scale + PAD)
    frame = (-20, -20, WIDTH + 20, height + 20)   # clipped a little outside the drawing, so the cut edge never shows

    countries, around, points = {}, [], 0
    for code, ring in shapes:
        ring = clip([place(p) for p in ring], frame)
        if len(ring) < 3:
            continue
        if code is None:
            if area(ring) >= MIN_AREA:
                around.append(thin_ring(ring, TOLERANCE['around']))
        elif area(ring) >= MIN_AREA or code == 'MT':
            countries.setdefault(code, []).append(ring)

    rows = []
    for code in sorted(EU, key=EU.get):
        rings = sorted(countries[code], key=area, reverse=True)
        cx, cy = centroid(rings[0])
        thinned = [thin_ring(r, TOLERANCE['eu']) for r in rings]
        points += sum(len(r) for r in thinned)
        row = {'code': code, 'name': EU[code], 'x': round(cx, 1), 'y': round(cy, 1), 'd': path(thinned)}
        if code in DOTS:
            row['dot'] = True
        rows.append(row)
    points_around = sum(len(r) for r in around)
    data = {
        'source': 'Made with Natural Earth, 1:50m countries (public domain). Lambert azimuthal equal-area, centred on 52°N 10°E.',
        'width': WIDTH,
        'height': height,
        'around': path(around),
        'countries': rows,
    }
    return data, points, points_around


def dumps(data):
    lines = ['{']
    for key in ('source', 'width', 'height', 'around'):
        lines.append('{}:{},'.format(json.dumps(key), json.dumps(data[key], ensure_ascii=False)))
    rows = [json.dumps(r, separators=(',', ':'), ensure_ascii=False) for r in data['countries']]
    lines.append('"countries":[\n{}\n]'.format(',\n'.join(rows)))
    lines.append('}')
    return '\n'.join(lines) + '\n'


def main(argv):
    if len(argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    with open(argv[1], encoding='utf-8') as f:
        features = json.load(f)['features']
    data, points, points_around = build(features)
    with open(OUT_JSON, 'w', encoding='utf-8') as f:
        f.write(dumps(data))
    print('Wrote {} ({:,} bytes): {} x {} units, {:,} points for {} countries and {:,} for the land around them.'.format(
        os.path.relpath(OUT_JSON, ROOT), os.path.getsize(OUT_JSON), data['width'], data['height'], points, len(data['countries']), points_around))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
