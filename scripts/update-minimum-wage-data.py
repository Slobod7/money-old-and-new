#!/usr/bin/env python3
"""Update the data behind the minimum wages page (data/minimum-wage-europe.html and its three includes:
minimum-wage-map.html, minimum-wage-compare.html and minimum-wage-table.html).

Downloads, with no API key:
  - earn_mw_cur   from Eurostat: monthly minimum wages, gross, twice a year (on 1 January, "S1", and on 1 July, "S2"),
                  in euros (EUR), in purchasing power standards (PPS) and in national currency (NAC), for the 27 EU
                  countries, every half-year from 1999.

Writes:
  _data/minimum_wage_europe.json          everything Jekyll draws: the latest half-year's figures for each country in
                                          rank order, with its ranks and map shades, the legends, the sentences, and
                                          every half-year for every country
  assets/data/minimum-wage-europe.json    the same half-years, for the page's script (assets/js/minimum-wage-europe.js)

Run it from the repository root:   python3 scripts/update-minimum-wage-data.py
Standard library only. It reuses the download and file helpers of update-oil-data.py, so it follows the same rules:
every download is checked, and if one fails or looks wrong the script stops with an error and leaves both files
exactly as they were. When nothing in the data has changed, it rewrites nothing.

The page uses Eurostat's published figures as they are. It never works out a PPS figure from another dataset, never
turns a monthly figure into an hourly one, and never makes an EU average (Eurostat publishes none). Five countries
have no national minimum wage: Eurostat flags them "m" (data cannot exist), and the page says so instead of showing
a zero. The files show the latest half-year for which every country has either both figures or that flag. A newer
half-year that some countries are still missing is named in the data, not shown.
"""

import datetime as dt
import importlib.util
import json
import os
import re
import sys

_spec = importlib.util.spec_from_file_location('update_oil_data', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'update-oil-data.py'))
oil = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(oil)
DataError, check, fetch = oil.DataError, oil.check, oil.fetch

ROOT = oil.ROOT
PAGE_JSON = os.path.join(ROOT, '_data', 'minimum_wage_europe.json')
SCRIPT_JSON = os.path.join(ROOT, 'assets', 'data', 'minimum-wage-europe.json')

# The page's code, Eurostat's code and the name, alphabetically by name
COUNTRIES = [
    ('AT', 'AT', 'Austria'), ('BE', 'BE', 'Belgium'), ('BG', 'BG', 'Bulgaria'), ('HR', 'HR', 'Croatia'),
    ('CY', 'CY', 'Cyprus'), ('CZ', 'CZ', 'Czechia'), ('DK', 'DK', 'Denmark'), ('EE', 'EE', 'Estonia'),
    ('FI', 'FI', 'Finland'), ('FR', 'FR', 'France'), ('DE', 'DE', 'Germany'), ('GR', 'EL', 'Greece'),
    ('HU', 'HU', 'Hungary'), ('IE', 'IE', 'Ireland'), ('IT', 'IT', 'Italy'), ('LV', 'LV', 'Latvia'),
    ('LT', 'LT', 'Lithuania'), ('LU', 'LU', 'Luxembourg'), ('MT', 'MT', 'Malta'), ('NL', 'NL', 'Netherlands'),
    ('PL', 'PL', 'Poland'), ('PT', 'PT', 'Portugal'), ('RO', 'RO', 'Romania'), ('SK', 'SK', 'Slovakia'),
    ('SI', 'SI', 'Slovenia'), ('ES', 'ES', 'Spain'), ('SE', 'SE', 'Sweden'),
]

# The countries with no national minimum wage, which Eurostat flags "m" in every currency. Pay floors there are set by
# collective agreements, sector by sector. If Eurostat's list changes (a country brings in a national rate, say), the
# script stops: change this list once the change is confirmed.
NO_NATIONAL = ('AT', 'DK', 'FI', 'IT', 'SE')

# Countries outside the euro: the national currency Eurostat reports, as the page writes an amount in it, and its name.
# For euro countries Eurostat's national-currency series is in euros throughout ("euro-fixed").
CURRENCIES = {
    'CZ': ['CZK', '{} Kč', 'Czech koruny'],
    'HU': ['HUF', '{} Ft', 'Hungarian forints'],
    'PL': ['PLN', '{} zł', 'Polish złoty'],
    'RO': ['RON', '{} lei', 'Romanian lei'],
    'DK': ['DKK', '{} kr', 'Danish kroner'],
    'SE': ['SEK', '{} kr', 'Swedish kronor'],
}

# How Eurostat turns a national rate into a monthly one, from its notes on the dataset
# (https://ec.europa.eu/eurostat/cache/metadata/en/earn_minw_esms.htm, last updated 31 July 2026, read 15 November
# 2026). The factors are each country's own: the page shows them, and never applies one country's to another.
# Every other country with a rate is reported as a monthly amount.
METHOD_CHECKED = '2026-11-15'
CONVERSIONS = {
    'DE': 'Set by the hour. Eurostat’s monthly figure is the hourly rate × 38.8 hours a week × 4.345 weeks, the hours Germany supplies.',
    'IE': 'Set by the hour. Eurostat’s monthly figure is the hourly rate × 39 hours × 52 weeks ÷ 12, the hours Ireland supplies.',
    'FR': 'Set by the hour. Eurostat’s monthly figure is the hourly rate × 35 hours × 52 weeks ÷ 12, the hours France supplies.',
    'NL': 'Set by the hour. Eurostat’s monthly figure is the hourly rate × 36 hours × 52 weeks ÷ 12, the hours the Netherlands supplies.',
    'MT': 'Set by the week. Eurostat’s monthly figure is the weekly rate × 52 weeks ÷ 12.',
    'GR': 'Paid 14 times a year. Eurostat spreads the year’s 14 payments over 12 months.',
    'ES': 'Paid 14 times a year. Eurostat spreads the year’s 14 payments over 12 months.',
    'PT': 'Paid 14 times a year. Eurostat spreads the year’s 14 payments over 12 months.',
}
MONTHLY = 'Reported to Eurostat as a monthly amount.'

# The comparison the page opens on: Ireland is a little above Germany in euros and well below it by purchasing power.
# If either has no figure, the page opens on the two highest in euros.
DEFAULT_PAIR = ('IE', 'DE')

EUROSTAT_URL = ('https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/earn_mw_cur'
                '?format=JSON&lang=EN&freq=S&{}&{}')
MEASURES = ('EUR', 'PPS')          # the two the page compares; NAC is shown beside them
CURRENCY_CODES = ('EUR', 'PPS', 'NAC')
FIRST_PERIOD = '1999-S1'
STALE_MONTHS = 10                  # the half-year shown may be this many months old (1 July to the next May)
LOWEST, HIGHEST = 50, 10000        # a monthly amount in EUR or PPS outside this range is taken as a fault
JUMP = (0.7, 1.5)                  # nor may a rate move further than this in six months, in its own currency
MIN_WITH_RATE = 20                 # fewer countries with a figure than this means a broken answer

# Eurostat's flags. A letter not listed stops the script, so that it gets looked at. "m" is how Eurostat marks a
# country with no national minimum wage; the others are shown beside the figure.
FLAGS = {'e': 'estimated', 'p': 'provisional', 'b': 'break in series', 'd': 'definition differs', 'm': 'no national minimum wage'}

# The map: five shades in equal bands on round numbers, set afresh at each update from the half-year's range
CLASSES = 5
BAND_STEPS = (100, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000)

SOURCES = {
    'wages': 'Eurostat, monthly minimum wages, bi-annual data (earn_mw_cur): gross monthly amounts in euros, '
             'purchasing power standards and national currency, on 1 January and 1 July.',
}


# Reading Eurostat's answer ------------------------------------------------------------------------

def read_eurostat(text):
    """Eurostat's JSON-stat answer as ({currency: {Eurostat geo: {period: value}}}, {currency: {geo: {period: flags}}},
    the date updated, [periods]). Checked to be half-yearly minimum wages in the three currencies."""
    data = json.loads(text)
    ids = data.get('id', [])
    check(ids == ['freq', 'currency', 'geo', 'time'], "Eurostat's layout has changed: {}".format(ids))
    size = dict(zip(ids, data['size']))
    dims = data['dimension']
    freq = list(dims['freq']['category']['index'])
    check(freq == ['S'], 'Eurostat returned freq {} instead of S'.format(freq))
    currencies = dims['currency']['category']['index']
    check(set(CURRENCY_CODES) <= set(currencies), 'Eurostat returned currencies {}, not {}'.format(sorted(currencies), CURRENCY_CODES))
    geos = dims['geo']['category']['index']
    times = dims['time']['category']['index']
    for period in times:
        check(re.match(r'^\d{4}-S[12]$', period), 'Eurostat returned the period {!r}, not a half-year'.format(period))
    cells = data.get('value')
    check(isinstance(cells, dict) and cells, 'Eurostat returned no figures')
    marks = data.get('status') or {}
    values, flags = {}, {}
    for cur, c in currencies.items():
        if cur not in CURRENCY_CODES:
            continue
        values[cur], flags[cur] = {}, {}
        for geo, g in geos.items():
            values[cur][geo], flags[cur][geo] = {}, {}
            for period, t in times.items():
                cell = str((c * size['geo'] + g) * size['time'] + t)
                mark = str(marks.get(cell, ''))
                unknown = set(mark) - set(FLAGS)
                check(not unknown, 'Unexpected flag {!r} on {} {} {}'.format(mark, geo, cur, period))
                value = cells.get(cell)
                if value is not None:
                    check('m' not in mark, '{} {} {} has a figure but is flagged as having no minimum wage'.format(geo, cur, period))
                    value = float(value)
                    values[cur][geo][period] = int(value) if value.is_integer() else value
                if mark:
                    flags[cur][geo][period] = mark
    updated = str(data.get('updated', ''))[:10]
    dt.date.fromisoformat(updated)
    return values, flags, updated, sorted(times, key=times.get)


# Half-years ---------------------------------------------------------------------------------------

def period_date(period):
    """2026-S2 is the rate on 1 July 2026, 2026-S1 on 1 January."""
    return '{}-{}-01'.format(period[:4], '01' if period.endswith('S1') else '07')


def periods(first, last):
    """Every half-year from first to last, in order."""
    y, h = int(first[:4]), int(first[-1])
    while '{}-S{}'.format(y, h) <= last:
        yield '{}-S{}'.format(y, h)
        y, h = (y + 1, 1) if h == 2 else (y, 2)


def shift_period(period, back):
    """The half-year `back` half-years before period."""
    n = int(period[:4]) * 2 + int(period[-1]) - 1 - back
    return '{}-S{}'.format(n // 2, n % 2 + 1)


# Numbers as the page prints them -------------------------------------------------------------------

def amount(v):
    """2391 as 2,391; a figure with cents keeps two decimals."""
    return '{:,.0f}'.format(v) if v == int(v) else '{:,.2f}'.format(v)


def pct_tenths(a, b):
    """How far a is above (or below) b, in tenths of a percent, rounded half away from zero in whole-number arithmetic
    so that the page's JavaScript (pctTenths) gets the same answer to the last digit."""
    a, b = int(round(a * 100)), int(round(b * 100))
    n = 1000 * (a - b)
    q = (2 * abs(n) + b) // (2 * b)
    return q if n >= 0 else -q


def ratio_tenths(a, b):
    """a as a multiple of b, in tenths (4.5 times is 45), rounded half up in whole-number arithmetic (ratioTenths)."""
    a, b = int(round(a * 100)), int(round(b * 100))
    return (20 * a + b) // (2 * b)


def tenths_text(t):
    """A number of tenths as 2.0, 18.9."""
    return '{}.{}'.format(abs(t) // 10, abs(t) % 10)


def ordinal(n):
    return '{}{}'.format(n, 'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th'))


def place(name):
    """A name as it reads in a sentence: the Netherlands."""
    return 'the Netherlands' if name == 'Netherlands' else name


def possessive(name):
    p = place(name)
    return p + '’' if p.endswith('s') else p + '’s'


def join(names):
    return names[0] if len(names) == 1 else ', '.join(names[:-1]) + ' and ' + names[-1]


def in_unit(measure, v):
    return '€' + amount(v) if measure == 'EUR' else amount(v) + ' PPS'


def ranks(values):
    """Competition ranks, highest first: equal figures share a rank and the next rank skips the shared places
    (1, 2, 2, 4). values is {code: value}; returns {code: (rank, tied)}."""
    out = {}
    for code, v in values.items():
        rank = 1 + sum(1 for w in values.values() if w > v)
        tied = sum(1 for w in values.values() if w == v) > 1
        out[code] = (rank, tied)
    return out


def rank_text(rank, tied):
    """12 for a rank of its own, 12= for a shared one."""
    return '{}{}'.format(rank, '=' if tied else '')


# The map's shades ---------------------------------------------------------------------------------

def band_scale(values):
    """Break points for the map's shades: CLASSES equal bands on round numbers, the narrowest that hold the lowest
    and the highest figure, as [b1, b2, b3, b4]."""
    lo, hi = min(values), max(values)
    for width in BAND_STEPS:
        start = int(lo // width * width)
        if start + CLASSES * width > hi:
            return [start + width * i for i in range(1, CLASSES)]
    raise DataError('Minimum wages spread too far apart to draw: {} to {}'.format(lo, hi))


def band_class(value, breaks):
    """Which shade a figure takes: 0 below the first break, up to len(breaks). A figure on a break joins the band above."""
    return sum(1 for b in breaks if value >= b)


def legend(measure, breaks):
    """The words beside each shade, lowest first. assets/js/minimum-wage-europe.js writes the same (legendLabels)."""
    if measure == 'EUR':
        f = lambda v: '€' + amount(v)
        return (['Under ' + f(breaks[0])] + ['{} to {}'.format(f(a), f(b)) for a, b in zip(breaks, breaks[1:])]
                + [f(breaks[-1]) + ' or more'])
    f = amount
    return (['Under {} PPS'.format(f(breaks[0]))] + ['{} to {} PPS'.format(f(a), f(b)) for a, b in zip(breaks, breaks[1:])]
            + ['{} PPS or more'.format(f(breaks[-1]))])


# The sentences ------------------------------------------------------------------------------------

def summary(measure, figures, names):
    """The sentence above the map, for one measure. figures is {code: value} for the countries with a rate.
    assets/js/minimum-wage-europe.js writes the same (summary)."""
    top, bottom = max(figures.values()), min(figures.values())
    highest = [place(names[c]) for c in sorted(figures, key=lambda c: names[c]) if figures[c] == top]
    lowest = [place(names[c]) for c in sorted(figures, key=lambda c: names[c]) if figures[c] == bottom]
    times = tenths_text(ratio_tenths(top, bottom))
    if measure == 'EUR':
        return ('In euros, the minimum wage is highest in {}, at {} a month, and lowest in {}, at {}: {} times as much.'
                .format(join(highest), in_unit(measure, top), join(lowest), in_unit(measure, bottom), times))
    return ('Adjusted for prices, it is highest in {}, at {}, and lowest in {}, at {}: {} times as much.'
            .format(join(highest), in_unit(measure, top), join(lowest), in_unit(measure, bottom), times))


def compare_sentence(a, b, names, latest, none):
    """The sentence above the comparison of two countries. assets/js/minimum-wage-europe.js writes the same (verdict)."""
    na, nb = place(names[a]), place(names[b])
    has = lambda c: latest['EUR'].get(c) is not None and latest['PPS'].get(c) is not None
    if not has(a) and not has(b):
        both_none = a in none and b in none
        return ('Neither {} nor {} has a national minimum wage.'.format(na, nb) if both_none
                else 'There are no figures to compare for {} and {}.'.format(na, nb))
    if not has(a) or not has(b):
        missing, other = (a, b) if not has(a) else (b, a)
        what = 'has no national minimum wage' if missing in none else 'has no figure for this date'
        return '{} {}, so there is nothing to set against {} minimum wage.'.format(place(names[missing])[0].upper() + place(names[missing])[1:], what, possessive(names[other]))
    parts = []
    for measure, lead in (('EUR', 'In euros, '), ('PPS', 'Adjusted for prices, ')):
        t = pct_tenths(latest[measure][a], latest[measure][b])
        how = 'the same as' if t == 0 else '{}% {} than'.format(tenths_text(t), 'higher' if t > 0 else 'lower')
        subject = possessive(names[a]) + ' minimum wage is' if measure == 'EUR' else 'it is'
        parts.append('{}{} {} {}.'.format(lead, subject, how, possessive(names[b])))
    return ' '.join(parts)


def difference(a, b):
    """One figure against another, as the comparison's table says it: 2.0% higher, 18.9% lower, the same."""
    t = pct_tenths(a, b)
    return 'the same' if t == 0 else '{}% {}'.format(tenths_text(t), 'higher' if t > 0 else 'lower')


def short_period(period):
    return ('Jan ' if period.endswith('S1') else 'Jul ') + period[:4]


def long_date(iso):
    d = dt.date.fromisoformat(iso)
    return '{} {}'.format(d.day, d.strftime('%B %Y'))


# Putting it together ------------------------------------------------------------------------------

def complete(period, values, flags):
    """Every country either has both figures for the half-year, or is flagged as having no national minimum wage
    in both. Returns (complete, the codes missing, the codes flagged)."""
    missing, none = [], []
    for code, at, _ in COUNTRIES:
        has = [values[m].get(at, {}).get(period) is not None for m in MEASURES]
        flagged = ['m' in flags[m].get(at, {}).get(period, '') for m in MEASURES]
        if all(has):
            continue
        if all(flagged):
            none.append(code)
        else:
            missing.append(code)
    return not missing, missing, none


def assemble(values, flags, source_updated, period_list, today):
    """Both files' contents from what was downloaded, as (page, script)."""
    names = {code: name for code, _, name in COUNTRIES}
    at = {code: e for code, e, _ in COUNTRIES}
    for code, e, name in COUNTRIES:
        check(any(values[m].get(e) or flags[m].get(e) for m in MEASURES), 'Eurostat has nothing for {}'.format(name))

    # The latest half-year every country has an answer for, and any newer one still waiting for some
    candidates = [p for p in period_list if any(values[m].get(at[c], {}).get(p) is not None for m in MEASURES for c in at)]
    check(candidates, 'Eurostat returned no figures for any EU country')
    period, pending = None, None
    for p in reversed(candidates):
        ok, missing, none = complete(p, values, flags)
        if ok:
            period = p
            break
        if pending is None:
            pending = {'period': p, 'date': period_date(p), 'missing': missing,
                       'missing_names': [names[c] for c in missing]}
    check(period, 'No half-year has a figure or a "no minimum wage" flag for every country')
    _, _, none = complete(period, values, flags)
    check(tuple(sorted(none)) == tuple(sorted(NO_NATIONAL)),
          'Eurostat now flags {} as having no national minimum wage, and this script expects {}. Check, then update NO_NATIONAL.'
          .format(', '.join(sorted(none)) or 'no country', ', '.join(NO_NATIONAL)))
    date = period_date(period)
    ref = dt.date.fromisoformat(date)
    check((today.year - ref.year) * 12 + today.month - ref.month <= STALE_MONTHS, 'Minimum wages are stale: latest is {}'.format(period))

    rated = [code for code, _, _ in COUNTRIES if code not in none]
    check(len(rated) >= MIN_WITH_RATE, 'Only {} countries have a minimum wage figure for {}'.format(len(rated), period))
    latest = {m: {c: values[m][at[c]][period] for c in rated} for m in MEASURES}
    nac = {c: values['NAC'].get(at[c], {}).get(period) for c in rated}
    for m in MEASURES:
        for c in rated:
            check(LOWEST < latest[m][c] < HIGHEST, '{} {} {} is implausible: {}'.format(names[c], m, period, latest[m][c]))
    before = shift_period(period, 1)
    for c in rated:
        was, now = values['NAC'].get(at[c], {}).get(before), nac[c]
        if was and now:
            check(JUMP[0] <= now / was <= JUMP[1], '{} moved from {} to {} in six months'.format(names[c], amount(was), amount(now)))

    # Every half-year from the first, for every country: the figure, or None
    keys = list(periods(FIRST_PERIOD, period))
    check(keys[0] == FIRST_PERIOD and all(p in period_list for p in keys), 'Eurostat skipped a half-year')
    series = {m: {code: [values[m].get(at[code], {}).get(p) for p in keys] for code in names} for m in CURRENCY_CODES}
    # One letter a half-year: r a figure, n no national minimum wage, - no figure
    status = {}
    for code in names:
        s = ''
        for i, p in enumerate(keys):
            if series['EUR'][code][i] is not None:
                s += 'r'
            elif 'm' in flags['EUR'].get(at[code], {}).get(p, ''):
                s += 'n'
            else:
                s += '-'
        status[code] = s
    # The other flags, by currency, country and half-year
    marks = {}
    for m in CURRENCY_CODES:
        for code in names:
            for p, mark in flags[m].get(at[code], {}).items():
                mark = mark.replace('m', '')
                if mark and p in keys:
                    marks.setdefault(m, {}).setdefault(code, {})[p] = mark

    scales = {m: band_scale(list(latest[m].values())) for m in MEASURES}
    order = {m: ranks(latest[m]) for m in MEASURES}

    # The same date a year earlier, in the country's own currency (euros throughout for euro countries)
    year_ago = shift_period(period, 2)

    def row(code):
        out = {'code': code, 'name': names[code], 'place': place(names[code]), 'currency': CURRENCIES.get(code, ['EUR'])[0],
               'conversion': CONVERSIONS.get(code, MONTHLY) if code in rated else None}
        if code in none:
            out['status'] = 'none'
            return out
        out['status'] = 'rate'
        for m in MEASURES:
            key = m.lower()
            rank, tied = order[m][code]
            mark = marks.get(m, {}).get(code, {}).get(period, '')
            out.update({key: latest[m][code], key + '_text': amount(latest[m][code]), key + '_flag': mark,
                        key + '_rank': rank, key + '_rank_text': rank_text(rank, tied), key + '_tied': tied,
                        key + '_ordinal': ordinal(rank) + ('=' if tied else ''),
                        key + '_class': band_class(latest[m][code], scales[m])})
        out['shift'] = order['EUR'][code][0] - order['PPS'][code][0]
        cur = CURRENCIES.get(code)
        if cur and nac[code] is not None:
            out['nac'] = nac[code]
            out['nac_text'] = cur[1].format(amount(nac[code]))
        then = values['NAC'].get(at[code], {}).get(year_ago)
        if then is not None and nac[code] is not None:
            out['year_ago_text'] = cur[1].format(amount(then)) if cur else '€' + amount(then)
            t = pct_tenths(nac[code], then)
            out['change'] = ('+' if t > 0 else '−' if t < 0 else '') + tenths_text(t)
        return out

    # Highest in euros first; equal figures by name. The countries without a national rate follow, by name.
    ranked = sorted(rated, key=lambda c: (-latest['EUR'][c], names[c]))
    rows = [row(c) for c in ranked] + [row(c) for c in sorted(none, key=lambda c: names[c])]

    def extremes(m):
        top, bottom = max(latest[m].values()), min(latest[m].values())
        pick = lambda v: [c for c in sorted(rated, key=lambda c: names[c]) if latest[m][c] == v]
        return {'highest': {'codes': pick(top), 'names': join([place(names[c]) for c in pick(top)]), 'text': in_unit(m, top)},
                'lowest': {'codes': pick(bottom), 'names': join([place(names[c]) for c in pick(bottom)]), 'text': in_unit(m, bottom)}}

    a, b = DEFAULT_PAIR
    if a not in rated or b not in rated:
        a, b = ranked[0], ranked[1]
    tops = {m: max(latest[m].values()) for m in MEASURES}

    # What the page shows before its script runs, worked out the way assets/js/minimum-wage-europe.js does: the EU's
    # card (card with no country), the comparison's table (compareRows) and its half-years (historyRows)
    def unit_text(m, code):
        mark = ' (e)' if 'e' in marks.get(m, {}).get(code, {}).get(period, '') else ''
        return in_unit(m, latest[m][code]) + mark

    def nac_text(code, v):
        return '–' if v is None else CURRENCIES.get(code, ['EUR', '€{}'])[1].format(amount(v))

    ord_text = lambda m, c: ordinal(order[m][c][0]) + ('=' if order[m][c][1] else '')
    compare_rows = [
        ['Gross a month, in euros', unit_text('EUR', a), unit_text('EUR', b), difference(latest['EUR'][a], latest['EUR'][b])],
        ['Rank in euros', ord_text('EUR', a), ord_text('EUR', b), ''],
        ['By purchasing power', unit_text('PPS', a), unit_text('PPS', b), difference(latest['PPS'][a], latest['PPS'][b])],
        ['Rank by purchasing power', ord_text('PPS', a), ord_text('PPS', b), ''],
    ]
    if any(c in CURRENCIES and nac.get(c) is not None for c in (a, b)):
        compare_rows.append(['In national currency', nac_text(a, nac[a]), nac_text(b, nac[b]), ''])

    def history_cell(code, m, i):
        v = series[m][code][i]
        return in_unit(m, v) if v is not None else 'No national rate' if status[code][i] == 'n' else '–'

    first = next(i for i in range(len(keys)) if 'r' in (status[a][i], status[b][i]))
    history_rows = [[short_period(keys[i]), history_cell(a, 'EUR', i), history_cell(b, 'EUR', i), history_cell(a, 'PPS', i), history_cell(b, 'PPS', i)]
                    for i in range(len(keys) - 1, first - 1, -1)]

    def ends(m):
        e = extremes(m)
        return [[e['highest']['text'], e['highest']['names']], [e['lowest']['text'], e['lowest']['names']]]
    e_eur, e_pps = ends('EUR'), ends('PPS')
    eu_card = {
        'name': 'European Union', 'value': '{} of {}'.format(len(rated), len(COUNTRIES)),
        'unit': 'countries have a national minimum wage on ' + long_date(date),
        'rows': [['Highest in euros'] + e_eur[0], ['Lowest in euros'] + e_eur[1],
                 ['Highest by purchasing power'] + e_pps[0], ['Lowest by purchasing power'] + e_pps[1],
                 ['No national minimum wage', '', join([names[c] for c in sorted(none, key=lambda c: names[c])])]],
        'note': 'Eurostat publishes no EU average: five countries have no national rate, and an average of the others would say little.',
    }

    estimated = {m.lower(): [names[c] for c in sorted(rated, key=lambda c: names[c]) if 'e' in marks.get(m, {}).get(c, {}).get(period, '')] for m in MEASURES}
    other_flags = sorted({(m, names[c], FLAGS[letter]) for m in MEASURES for c in rated
                          for letter in marks.get(m, {}).get(c, {}).get(period, '') if letter != 'e'})

    shared = {
        'source_updated': source_updated,
        'period': period,
        'date': date,
        'before': before,
        'year_ago': year_ago,
        'year_ago_date': period_date(year_ago),
        'pending': pending,
        'countries_cols': ['code', 'name', 'currency', 'amount in it', 'its name'],
        'countries': [[code, names[code]] + CURRENCIES.get(code, ['EUR', '€{}', 'euros']) for code, _, _ in COUNTRIES],
        'no_national': sorted(none, key=lambda c: names[c]),
        'map_scales': {m.lower(): scales[m] for m in MEASURES},
        'default_pair': [a, b],
        'conversions': {code: CONVERSIONS.get(code, MONTHLY) for code in rated},
        'method_checked': METHOD_CHECKED,
    }
    history = {
        'periods': keys,
        'status': status,
        'eur': series['EUR'],
        'pps': series['PPS'],
        'nac': series['NAC'],
        'flags': {m.lower(): v for m, v in marks.items()},
    }
    page = dict(shared, **{
        'with_rate': len(rated),
        'total': len(COUNTRIES),
        'no_national_names': [names[c] for c in sorted(none, key=lambda c: names[c])],
        'rows': rows,
        'legend': {m.lower(): legend(m, scales[m]) for m in MEASURES},
        'extremes': {m.lower(): extremes(m) for m in MEASURES},
        'summary': {m.lower(): summary(m, latest[m], names) for m in MEASURES},
        'compare': {'a': a, 'b': b, 'sentence': compare_sentence(a, b, names, latest, none), 'rows': compare_rows,
                    'history': history_rows,
                    'bars': {m.lower(): [round(latest[m][c] * 100 / tops[m], 1) for c in (a, b)] for m in MEASURES}},
        'eu_card': eu_card,
        'tops': {m.lower(): tops[m] for m in MEASURES},
        'estimated': estimated,
        'other_flags': [list(f) for f in other_flags],
        'sources': SOURCES,
    })
    page.update(history)
    script = dict(shared, **history)
    return page, script


def revisions(old, new):
    """Figures Eurostat changed or withdrew since the last saved file: [half-year, code, currency, was, now]. A
    half-year the old file didn't have is new, not revised. None when there is no old file to compare with."""
    if not old or 'periods' not in old:
        return None
    out = []
    old_keys = old['periods']
    for m in ('eur', 'pps', 'nac'):
        for code, now in new[m].items():
            was = old.get(m, {}).get(code)
            if not was:
                continue
            for i, p in enumerate(old_keys):
                if p in new['periods']:
                    v = now[new['periods'].index(p)]
                    if was[i] != v:
                        out.append([p, code, m.upper(), was[i], v])
    return out


def dumps(obj):
    """oil.dumps, with a list of objects written one to a line, so that a data update reads as a short diff."""
    lines, items = ['{'], list(obj.items())
    for i, (key, value) in enumerate(items):
        comma = ',' if i < len(items) - 1 else ''
        if isinstance(value, list) and value and isinstance(value[0], (list, dict)):
            rows = [json.dumps(r, separators=(',', ':'), ensure_ascii=False) for r in value]
            lines.append('{}:[\n{}\n]{}'.format(json.dumps(key), ',\n'.join(rows), comma))
        else:
            lines.append('{}:{}{}'.format(json.dumps(key), json.dumps(value, separators=(',', ':'), ensure_ascii=False), comma))
    lines.append('}')
    return '\n'.join(lines) + '\n'


def build(today):
    geo = '&'.join('geo=' + e for _, e, _ in COUNTRIES)
    cur = '&'.join('currency=' + c for c in CURRENCY_CODES)
    values, flags, updated, period_list = read_eurostat(fetch(EUROSTAT_URL.format(cur, geo)).decode('utf-8'))
    return assemble(values, flags, updated, period_list, today)


def main():
    today = dt.datetime.now(dt.timezone.utc).date()
    try:
        page, script = build(today)
    except (DataError, KeyError, ValueError, TypeError, ZeroDivisionError) as e:
        print('Minimum wages NOT updated: {}'.format(e), file=sys.stderr)
        print('The existing files are unchanged.', file=sys.stderr)
        return 1

    old_page, old_script = oil.load(PAGE_JSON), oil.load(SCRIPT_JSON)
    strip = lambda d: {k: v for k, v in (d or {}).items() if k not in ('updated', 'revisions')}
    if old_page and old_script and strip(old_page) == page and strip(old_script) == script:
        print('No change: minimum wages still at {}.'.format(page['period']))
        return 0

    # 'updated' is the day this script last found new data, so an unchanged run leaves the files byte for byte alone.
    # 'revisions' lists what Eurostat changed in half-years the previous file already had.
    changed = revisions(old_script, script)
    page = dict({'updated': today.isoformat(), 'revisions': changed}, **page)
    script = dict({'updated': today.isoformat()}, **script)
    oil.write_atomically([(PAGE_JSON, dumps(page)), (SCRIPT_JSON, dumps(script))])
    for path in (PAGE_JSON, SCRIPT_JSON):
        print('Wrote {} ({:,} bytes)'.format(os.path.relpath(path, ROOT), os.path.getsize(path)))
    print('{} countries with a minimum wage on {} ({}); Eurostat last updated {}.'.format(page['with_rate'], page['date'], page['period'], page['source_updated']))
    print('Highest in euros: {} {}; by purchasing power: {} {}.'.format(page['extremes']['eur']['highest']['names'], page['extremes']['eur']['highest']['text'],
                                                                       page['extremes']['pps']['highest']['names'], page['extremes']['pps']['highest']['text']))
    if page['pending']:
        print('Eurostat has {} for some countries but not yet for {}: the page stays at {}.'.format(page['pending']['period'], ', '.join(page['pending']['missing_names']), page['period']))
    if changed:
        print('{} figure(s) revised since the last update, first: {}'.format(len(changed), changed[0]))
    return 0


if __name__ == '__main__':
    sys.exit(main())
