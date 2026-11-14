#!/usr/bin/env python3
"""Update the data behind the fuel prices page (data/europe-fuel-prices.html).

Downloads one file, with no API key:
  - The European Commission's Weekly Oil Bulletin, "Price developments 2005 onwards": a workbook with every
    week's national average price of Euro-super 95 petrol and automotive diesel, with and without taxes, for each
    EU country, plus the Commission's own consumption-weighted EU average. Prices are in euros per 1,000 litres,
    dated by the Monday of the bulletin's week.

Writes:
  _data/fuel_prices.json    the latest week, ready-formatted, for the map and table that Jekyll draws (so the page
                            reads the same without JavaScript)
  assets/data/fuel.json     the last two years of weekly prices, for the page's JavaScript

Run it from the repository root:   python3 scripts/update-fuel-data.py
To read a workbook already on disk instead of downloading it:   python3 scripts/update-fuel-data.py path/to/file.xlsx
Standard library only. It reuses the download and file helpers of update-oil-data.py, so it follows the same rules:
the download is checked, and if it fails or looks wrong the script stops with an error and leaves both files exactly
as they were. When nothing in the data has changed, it rewrites nothing.

Tax is never downloaded: it is the price with taxes minus the price without, both from the same row. Prices are
kept as whole euros per 1,000 litres, which is a tenth of a cent per litre, so the parts always add up to the whole.
"""

import datetime as dt
import importlib.util
import io
import json
import math
import os
import sys
import zipfile
import xml.etree.ElementTree as ET

_spec = importlib.util.spec_from_file_location('update_oil_data', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'update-oil-data.py'))
oil = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(oil)
DataError, check, fetch = oil.DataError, oil.check, oil.fetch

ROOT = oil.ROOT
PAGE_JSON = os.path.join(ROOT, '_data', 'fuel_prices.json')
HISTORY_JSON = os.path.join(ROOT, 'assets', 'data', 'fuel.json')

# The link on https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en. The Commission replaces the file
# behind it each week; if the link itself ever changes, copy the new one from that page.
WORKBOOK_URL = 'https://energy.ec.europa.eu/document/download/906e60ca-8b6a-44e7-8589-652854d2fd3f_en?filename=Weekly_Oil_Bulletin_Prices_History_maticni_4web.xlsx'
SHEETS = {'with': 'Prices with taxes', 'without': 'Prices wo taxes'}
COLUMNS = {'with': '{}_price_with_tax_{}', 'without': '{}_price_wo_tax_{}'}
FUELS = {'petrol': 'euro95', 'diesel': 'diesel'}   # this site's name: the workbook's

COUNTRIES = {
    'AT': 'Austria', 'BE': 'Belgium', 'BG': 'Bulgaria', 'HR': 'Croatia', 'CY': 'Cyprus', 'CZ': 'Czechia',
    'DK': 'Denmark', 'EE': 'Estonia', 'FI': 'Finland', 'FR': 'France', 'DE': 'Germany', 'GR': 'Greece',
    'HU': 'Hungary', 'IE': 'Ireland', 'IT': 'Italy', 'LV': 'Latvia', 'LT': 'Lithuania', 'LU': 'Luxembourg',
    'MT': 'Malta', 'NL': 'Netherlands', 'PL': 'Poland', 'PT': 'Portugal', 'RO': 'Romania', 'SK': 'Slovakia',
    'SI': 'Slovenia', 'ES': 'Spain', 'SE': 'Sweden',
}
EU = 'EU'

HISTORY_WEEKS = 105      # two years of Mondays, both ends included
CHANGE_WEEKS = 4         # the page's "four-week change"
FILL_LITRES = 50
MAX_AGE_DAYS = 24        # the bulletin skips a week or two around Christmas and Easter; older than this is stale
MIN_COUNTRIES = 24       # of 27 with a full set of figures in the latest week, or the file is treated as broken
CLASSES = 5              # colour classes on the map, for prices and for changes

SOURCES = {
    'prices': 'European Commission, Weekly Oil Bulletin, price developments 2005 onwards: national average consumer prices with and without taxes, euros per 1,000 litres',
    'eu': 'The same bulletin’s EU average, weighted by each country’s consumption',
}


# A minimal reader for .xlsx files: a zip of XML sheets ----------------------------------------------

_NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
_REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'


def _column(ref):
    """'AB12' -> 27: the column's index, counting from 0."""
    n = 0
    for ch in ref:
        if not ch.isalpha():
            break
        n = n * 26 + ord(ch.upper()) - 64
    return n - 1


def read_xlsx(data, wanted):
    """The named sheets of an .xlsx file (bytes) as {name: [{column: value}, ...]}, rows in file order.

    Numbers come back as floats and text as str; empty cells are left out. Formulas give their saved result.
    """
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
        names = set(z.namelist())
        strings = []
        if 'xl/sharedStrings.xml' in names:
            for si in ET.fromstring(z.read('xl/sharedStrings.xml')).iter(_NS + 'si'):
                strings.append(''.join(t.text or '' for t in si.iter(_NS + 't')))
        rels = {r.get('Id'): r.get('Target') for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
        paths = {}
        for sheet in ET.fromstring(z.read('xl/workbook.xml')).iter(_NS + 'sheet'):
            target = rels.get(sheet.get(_REL + 'id'), '')
            paths[sheet.get('name')] = target.lstrip('/') if target.startswith('/') else 'xl/' + target
        out = {}
        for name in wanted:
            check(name in paths and paths[name] in names, 'The workbook has no sheet called "{}"'.format(name))
            rows = []
            with z.open(paths[name]) as f:
                for _, el in ET.iterparse(f):
                    if el.tag != _NS + 'row':
                        continue
                    row = {}
                    for c in el.iter(_NS + 'c'):
                        kind, v = c.get('t'), c.find(_NS + 'v')
                        if kind == 'inlineStr':
                            row[_column(c.get('r'))] = ''.join(t.text or '' for t in c.iter(_NS + 't'))
                        elif v is None or v.text is None:
                            continue
                        elif kind == 's':
                            row[_column(c.get('r'))] = strings[int(v.text)]
                        elif kind in ('str', 'e', 'b'):
                            row[_column(c.get('r'))] = v.text
                        else:
                            row[_column(c.get('r'))] = float(v.text)
                    rows.append(row)
                    el.clear()
            out[name] = rows
        return out
    except DataError:
        raise
    except Exception as e:  # not a zip, broken XML, a cell that isn't what it says
        raise DataError('Could not read the workbook: {}'.format(e))


def excel_day(serial):
    """An Excel date serial as a date (1900 date system, as the workbook uses)."""
    return dt.date(1899, 12, 30) + dt.timedelta(days=int(serial))


# The bulletin ---------------------------------------------------------------------------------------

def weekly_prices(rows, kind):
    """One price sheet as {date: {code: {fuel: euros per 1,000 litres, rounded}}}, for the EU and each country.

    The first row names every column (FR_price_with_tax_diesel); data rows start with the week's date.
    """
    check(rows, 'The "{}" sheet is empty'.format(SHEETS[kind]))
    header = {v.strip(): c for c, v in rows[0].items() if isinstance(v, str)}
    columns = {}
    for code in [EU] + sorted(COUNTRIES):
        for fuel, theirs in FUELS.items():
            name = COLUMNS[kind].format(code, theirs)
            check(name in header, 'The "{}" sheet has no column {}'.format(SHEETS[kind], name))
            columns[code, fuel] = header[name]
    out = {}
    for row in rows[1:]:
        if not isinstance(row.get(0), float):
            continue   # the units row, and the notes under the table
        day = excel_day(row[0]).isoformat()
        check(day not in out, 'The "{}" sheet has {} twice'.format(SHEETS[kind], day))
        week = {}
        for (code, fuel), c in columns.items():
            v = row.get(c)
            if isinstance(v, float) and v > 0:
                week.setdefault(code, {})[fuel] = int(round(v))
        out[day] = week
    return out


def nice_step(lo, hi, steps):
    """The smallest round step (in euros per 1,000 litres) at which `steps` classes starting on a multiple of it cover lo to hi."""
    for step in (50, 100, 150, 200, 250, 300, 400, 500, 750, 1000):
        if math.floor(lo / step) * step + steps * step > hi:
            return step
    raise DataError('Prices spread too far apart to draw: {} to {}'.format(lo, hi))


def price_scale(values):
    """Break points for the map's price classes: CLASSES equal bands on round numbers, as [b1, b2, b3, b4]."""
    step = nice_step(min(values), max(values), CLASSES)
    start = math.floor(min(values) / step) * step
    return [start + step * i for i in range(1, CLASSES)]


def change_scale(values):
    """Break points for the map's change classes: a band around zero, then two bands each way, as [-b, -1c, +1c, +b]."""
    biggest = max(abs(v) for v in values) if values else 0
    outer = max(b for b in (20, 50, 100, 200, 500) if b == 20 or b <= biggest / 2)
    return [-outer, -10, 10, outer]


def price_class(value, breaks):
    """Which price class a value falls in: 0 below the first break, up to len(breaks). A value on a break joins the class above."""
    return sum(1 for b in breaks if value >= b)


def change_class(value, breaks):
    """Which change class: 0 and 4 are falls and rises of the outer break or more, 2 is within the inner break either way."""
    down_big, down, up, up_big = breaks
    return 0 if value <= down_big else 1 if value < down else 2 if value <= up else 3 if value < up_big else 4


def euros(v):
    """Euros per 1,000 litres as euros per litre: 1877 -> '1.877'."""
    return '{:.3f}'.format(v / 1000)


def cents(v):
    """A change in euros per 1,000 litres as cents per litre, signed with a real minus: -52 -> '−5.2'."""
    text = '{:+.1f}'.format(v / 10)
    return '0.0' if text in ('+0.0', '-0.0') else text.replace('-', '−')


def money(v):
    """The cost of FILL_LITRES at v euros per 1,000 litres: 1877 -> '93.85'."""
    return '{:.2f}'.format(v * FILL_LITRES / 1000)


def figures(now, then):
    """One place's figures for one fuel, as numbers. now and then are (price, pretax) pairs, or None when missing."""
    if not now:
        return None
    price, pretax = now
    out = {'price': price, 'pretax': pretax, 'tax': price - pretax, 'share': math.floor((price - pretax) * 100 / price + 0.5)}   # halves round up, as in the page's JavaScript
    if then:
        out['change'] = price - then[0]
        out['pretax_change'] = pretax - then[1]
        out['tax_change'] = out['change'] - out['pretax_change']
    return out


def build(data, today):
    sheets = read_xlsx(data, SHEETS.values())
    prices = {kind: weekly_prices(sheets[name], kind) for kind, name in SHEETS.items()}
    check(set(prices['with']) == set(prices['without']), 'The two price sheets cover different weeks')
    days = sorted(prices['with'])
    check(len(days) >= HISTORY_WEEKS, 'The workbook holds only {} weeks'.format(len(days)))
    week = days[-1]
    age = (today - dt.date.fromisoformat(week)).days
    check(-1 <= age <= MAX_AGE_DAYS, 'The bulletin is stale or misdated: its latest week is {}'.format(week))

    def pair(day, code, fuel):
        """(price with taxes, price without) on a day, or None unless both are there and make sense."""
        w = prices['with'][day].get(code, {}).get(fuel)
        o = prices['without'][day].get(code, {}).get(fuel)
        if w is None or o is None:
            return None
        check(300 < w < 6000 and 100 < o < w, '{} {} on {} looks wrong: {} with taxes, {} without'.format(code, fuel, day, w, o))
        return (w, o)

    # The week to compare with: CHANGE_WEEKS before the latest, when the bulletin has that Monday
    target = (dt.date.fromisoformat(week) - dt.timedelta(weeks=CHANGE_WEEKS)).isoformat()
    check(target in prices['with'], 'The bulletin has no week of {} to compare {} with'.format(target, week))

    previous = days[-2]
    places = {}
    for code in [EU] + sorted(COUNTRIES):
        places[code] = {fuel: figures(pair(week, code, fuel), pair(target, code, fuel)) for fuel in FUELS}
    for fuel in FUELS:
        check(places[EU][fuel] and 'change' in places[EU][fuel], 'The EU average for {} is missing'.format(fuel))
    complete = [c for c in COUNTRIES if all(places[c][f] and 'change' in places[c][f] for f in FUELS)]
    check(len(complete) >= MIN_COUNTRIES, 'Only {} of {} countries have a full set of figures for {}'.format(len(complete), len(COUNTRIES), week))

    # A country whose four figures all repeat last week's: prices that really held, or a week it didn't report.
    # The workbook doesn't say which, so the page only says they repeat.
    def repeats(code):
        return all(pair(week, code, f) is not None and pair(week, code, f) == pair(previous, code, f) for f in FUELS)

    scales = {}
    for fuel in FUELS:
        scales[fuel] = {
            'price': price_scale([places[c][fuel]['price'] for c in COUNTRIES if places[c][fuel]]),
            'change': change_scale([places[c][fuel]['change'] for c in COUNTRIES if places[c][fuel] and 'change' in places[c][fuel]]),
        }

    def shown(code, fuel):
        """A place's figures for one fuel as the page prints them, with its two map classes."""
        f = places[code][fuel]
        if not f:
            return None
        out = {'price': euros(f['price']), 'pretax': euros(f['pretax']), 'tax': euros(f['tax']), 'share': f['share'],
               'fill': money(f['price']), 'price_class': price_class(f['price'], scales[fuel]['price'])}
        if 'change' in f:
            out.update({'change': cents(f['change']), 'pretax_change': cents(f['pretax_change']), 'tax_change': cents(f['tax_change']),
                        'change_class': change_class(f['change'], scales[fuel]['change'])})
        if code != EU:
            out['vs_eu'] = cents(f['price'] - places[EU][fuel]['price'])
        return out

    rows = []
    for code in sorted(COUNTRIES, key=lambda c: ((places[c]['petrol'] or {}).get('price', 10 ** 6), COUNTRIES[c])):
        row = {'code': code, 'name': COUNTRIES[code]}
        for fuel in FUELS:
            row[fuel] = shown(code, fuel)
        if repeats(code):
            row['repeats'] = True
        rows.append(row)

    def extreme(fuel, pick):
        code = pick((c for c in COUNTRIES if places[c][fuel]), key=lambda c: (places[c][fuel]['price'], COUNTRIES[c]))
        return {'code': code, 'name': COUNTRIES[code], 'price': euros(places[code][fuel]['price'])}

    def legend(fuel):
        """The words beside each colour class, lowest first."""
        p, c = scales[fuel]['price'], scales[fuel]['change']
        price = ['Under €{:.2f}'.format(p[0] / 1000)] + ['€{:.2f} to €{:.2f}'.format(a / 1000, b / 1000) for a, b in zip(p, p[1:])] + ['€{:.2f} or more'.format(p[-1] / 1000)]
        big, small = '{:g}c'.format(c[3] / 10), '{:g}c'.format(c[2] / 10)
        change = ['Down {} or more'.format(big), 'Down {} to {}'.format(small, big), 'Within {}'.format(small), 'Up {} to {}'.format(small, big), 'Up {} or more'.format(big)]
        return {'price': price, 'change': change}

    page = {
        'week': week,
        'compared_with': target,
        'change_weeks': CHANGE_WEEKS,
        'fill_litres': FILL_LITRES,
        'countries': len(COUNTRIES),
        'missing': sorted(COUNTRIES[c] for c in COUNTRIES if c not in complete),
        'eu': {fuel: shown(EU, fuel) for fuel in FUELS},
        'cheapest': {fuel: extreme(fuel, min) for fuel in FUELS},
        'dearest': {fuel: extreme(fuel, max) for fuel in FUELS},
        'scales': scales,
        'legend': {fuel: legend(fuel) for fuel in FUELS},
        'sources': SOURCES,
        'rows': rows,
    }

    # The history: every Monday of the last two years, with a gap (null) where the bulletin skipped a week or a
    # country has no figure. Four series a place: petrol and diesel, with taxes (p, d) and without (p0, d0).
    first = dt.date.fromisoformat(week) - dt.timedelta(weeks=HISTORY_WEEKS - 1)
    mondays = [(first + dt.timedelta(weeks=i)).isoformat() for i in range(HISTORY_WEEKS)]
    series = []
    for code in [EU] + sorted(COUNTRIES, key=COUNTRIES.get):
        line = {'code': code, 'name': 'EU average' if code == EU else COUNTRIES[code]}
        for key, fuel in (('p', 'petrol'), ('d', 'diesel')):
            pairs = [pair(day, code, fuel) if day in prices['with'] else None for day in mondays]
            line[key] = [p[0] if p else None for p in pairs]
            line[key + '0'] = [p[1] if p else None for p in pairs]
        series.append(line)
    history = {
        'week': week,
        'first_week': mondays[0],
        'weeks': HISTORY_WEEKS,
        'change_weeks': CHANGE_WEEKS,
        'fill_litres': FILL_LITRES,
        'unit': 'euros per 1,000 litres; divide by 1,000 for euros per litre',
        'scales': scales,
        'sources': SOURCES,
        'series': series,
    }
    return page, history


def dumps(obj):
    """JSON with one row or series per line, so a weekly update reads as a short diff."""
    lines = ['{']
    items = list(obj.items())
    for i, (key, value) in enumerate(items):
        comma = ',' if i < len(items) - 1 else ''
        if isinstance(value, list) and value and isinstance(value[0], dict):
            rows = [json.dumps(r, separators=(',', ':'), ensure_ascii=False) for r in value]
            lines.append('{}:[\n{}\n]{}'.format(json.dumps(key), ',\n'.join(rows), comma))
        else:
            lines.append('{}:{}{}'.format(json.dumps(key), json.dumps(value, separators=(',', ':'), ensure_ascii=False), comma))
    lines.append('}')
    return '\n'.join(lines) + '\n'


def main(argv):
    today = dt.datetime.now(dt.timezone.utc).date()
    try:
        if len(argv) > 1:
            with open(argv[1], 'rb') as f:
                data = f.read()
        else:
            data = fetch(WORKBOOK_URL)
        page, history = build(data, today)
    except (DataError, OSError) as e:
        print('Fuel data NOT updated: {}'.format(e), file=sys.stderr)
        print('The existing files are unchanged.', file=sys.stderr)
        return 1

    old_page, old_history = oil.load(PAGE_JSON), oil.load(HISTORY_JSON)
    strip = lambda d: {k: v for k, v in (d or {}).items() if k != 'updated'}
    if old_page and old_history and strip(old_page) == page and strip(old_history) == history:
        print('No change: fuel prices still run to the week of {}.'.format(page['week']))
        return 0

    # 'updated' is the day this script last found new data, so an unchanged run leaves the files byte for byte alone.
    page = dict({'updated': today.isoformat()}, **page)
    history = dict({'updated': today.isoformat()}, **history)
    oil.write_atomically([(PAGE_JSON, dumps(page)), (HISTORY_JSON, dumps(history))])
    for path in (PAGE_JSON, HISTORY_JSON):
        print('Wrote {} ({:,} bytes)'.format(os.path.relpath(path, ROOT), os.path.getsize(path)))
    eu = page['eu']
    print('Week of {}: EU average petrol €{}, diesel €{} a litre; {} of {} countries complete.'.format(
        page['week'], eu['petrol']['price'], eu['diesel']['price'], page['countries'] - len(page['missing']), page['countries']))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
