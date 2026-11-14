#!/usr/bin/env python3
"""Update the data behind the inflation-by-country page (data/inflation-by-country.html, _includes/inflation-ranking.html
and _includes/inflation-country-chart.html).

Downloads, with no API key:
  - prc_hicp_minr, unit RCH_A                 from Eurostat: HICP, annual rate of change, monthly, for the euro area and
                                              the 27 EU countries. Two categories: all items (coicop18 TOTAL), and all
                                              items excluding energy, food, alcohol and tobacco (TOT_X_NRG_FOOD, "core").
                                              This is Eurostat's live dataset: prc_hicp_manr and prc_hicp_midx stopped
                                              at December 2025.
  - HICP.M.{area}.N.{000000,XEF000}.4D0.ANR   from the ECB Data Portal: the ECB's copy of the same figures, which the
                                              ECB rates page reads for the euro area. Used only to check Eurostat's
                                              answer: the figures on the page are Eurostat's own.

Writes:
  _data/inflation_by_country.json         everything Jekyll draws: the latest month's ranking, each area's peak and
                                          chart scales, and every month for every area
  assets/data/inflation-by-country.json   the same months, for the page's script (assets/js/inflation-by-country.js)

Run it from the repository root:   python3 scripts/update-inflation-data.py
Standard library only. It reuses the download and file helpers of update-oil-data.py, so it follows the same rules:
every download is checked, and if one fails or looks wrong the script stops with an error and leaves both files
exactly as they were. When nothing in the data has changed, it rewrites nothing. A gap inside a series stops it too:
a missing month is never filled in.

The files end at the last month every one of the 28 areas has. Eurostat's flash estimate covers the euro area and its
members only, so until the full release the six countries outside the euro hold the ranking a month back.
"""

import csv
import datetime as dt
import importlib.util
import io
import json
import math
import os
import re
import sys

_spec = importlib.util.spec_from_file_location('update_oil_data', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'update-oil-data.py'))
oil = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(oil)
DataError, check, fetch, months = oil.DataError, oil.check, oil.fetch, oil.months

ROOT = oil.ROOT
PAGE_JSON = os.path.join(ROOT, '_data', 'inflation_by_country.json')
SCRIPT_JSON = os.path.join(ROOT, 'assets', 'data', 'inflation-by-country.json')

# The page's code, Eurostat's code, the ECB's code, the name, and whether the country uses the euro (None for the euro
# area itself). The euro area is the area in its changing composition. When a country adopts the euro, change its flag
# here: the script stops if the number of members no longer matches Eurostat's label for the euro area.
AREAS = [
    ('EA', 'EA', 'U2', 'Euro area', None),
    ('AT', 'AT', 'AT', 'Austria', True),
    ('BE', 'BE', 'BE', 'Belgium', True),
    ('BG', 'BG', 'BG', 'Bulgaria', True),
    ('HR', 'HR', 'HR', 'Croatia', True),
    ('CY', 'CY', 'CY', 'Cyprus', True),
    ('CZ', 'CZ', 'CZ', 'Czechia', False),
    ('DK', 'DK', 'DK', 'Denmark', False),
    ('EE', 'EE', 'EE', 'Estonia', True),
    ('FI', 'FI', 'FI', 'Finland', True),
    ('FR', 'FR', 'FR', 'France', True),
    ('DE', 'DE', 'DE', 'Germany', True),
    ('GR', 'EL', 'GR', 'Greece', True),
    ('HU', 'HU', 'HU', 'Hungary', False),
    ('IE', 'IE', 'IE', 'Ireland', True),
    ('IT', 'IT', 'IT', 'Italy', True),
    ('LV', 'LV', 'LV', 'Latvia', True),
    ('LT', 'LT', 'LT', 'Lithuania', True),
    ('LU', 'LU', 'LU', 'Luxembourg', True),
    ('MT', 'MT', 'MT', 'Malta', True),
    ('NL', 'NL', 'NL', 'Netherlands', True),
    ('PL', 'PL', 'PL', 'Poland', False),
    ('PT', 'PT', 'PT', 'Portugal', True),
    ('RO', 'RO', 'RO', 'Romania', False),
    ('SK', 'SK', 'SK', 'Slovakia', True),
    ('SI', 'SI', 'SI', 'Slovenia', True),
    ('ES', 'ES', 'ES', 'Spain', True),
    ('SE', 'SE', 'SE', 'Sweden', False),
]
EURO_AREA = 'EA'

# The measure's name on the page, Eurostat's category and the ECB's item code
MEASURES = [
    ('headline', 'TOTAL', '000000'),
    ('core', 'TOT_X_NRG_FOOD', 'XEF000'),
]
EUROSTAT_URL = ('https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr'
                '?format=JSON&lang=EN&freq=M&unit=RCH_A&coicop18={}&{}&sinceTimePeriod={}')
ECB_KEY = 'HICP/M.{}.N.{}.4D0.ANR'

FIRST_MONTH = '1999-01'    # the euro's first month. Every area has headline inflation from here
CORE_BY = '2001-12'        # core inflation starts later in many countries, and in all of them by this month
LAG_MONTHS = 4             # the newest month may be this old before the script calls the data stale
LOWEST, HIGHEST = -15, 100  # annual rates outside this range are taken as a fault (Romania's was 56.7% in January 2000)
ECB_STEP = 0.1             # the ECB's copy may differ from Eurostat's by one rounding step, as it does for Greece
ECB_SHARE = 0.01           # but in no more than this share of the figures

# Eurostat's flags. A letter not listed stops the script, so that it gets looked at.
FLAGS = {'e': 'estimated', 'p': 'provisional', 'd': 'definition differs', 'b': 'break in series'}
SHOWN = ('estimated', 'provisional')   # listed per country on the page; the other two apply to core in every area

# The chart's views: the name in the page, and how many months back from the latest one (None: from FIRST_MONTH)
RANGES = [('5y', 60), ('10y', 120), ('all', None)]
STEPS = (1, 2, 5, 10, 20, 50)   # the gap between the chart's gridlines, in percentage points
MAX_STEPS = 6

SOURCES = {
    'inflation': 'Eurostat, HICP, annual rate of change (prc_hicp_minr): all items, and all items excluding energy, '
                 'food, alcohol and tobacco. Euro area in its changing composition.',
    'check': "Checked against the ECB Data Portal's copy (HICP.M.{area}.N.000000.4D0.ANR and .XEF000.)",
}


def read_eurostat(text, category):
    """Eurostat's JSON-stat answer as ({area: {month: value}}, {area: {month: flags}}, date updated, {area: label}).
    Checked to be monthly annual rates of the one category asked for."""
    data = json.loads(text)
    ids = data.get('id', [])
    check(ids == ['freq', 'unit', 'coicop18', 'geo', 'time'], "Eurostat's layout has changed: {}".format(ids))
    size = dict(zip(ids, data['size']))
    dims = data['dimension']
    for name, want in (('freq', 'M'), ('unit', 'RCH_A'), ('coicop18', category)):
        got = list(dims[name]['category']['index'])
        check(got == [want], 'Eurostat returned {} {} instead of {}'.format(name, got, want))
    cells = data.get('value')
    check(isinstance(cells, dict) and cells, 'Eurostat returned no figures for {}'.format(category))
    marks = data.get('status') or {}
    geos = dims['geo']['category']['index']
    times = dims['time']['category']['index']
    values, flags = {}, {}
    for geo, g in geos.items():
        values[geo], flags[geo] = {}, {}
        for month, t in times.items():
            cell = str(g * size['time'] + t)
            if cells.get(cell) is not None:
                check(re.match(r'^\d{4}-\d{2}$', month), 'Eurostat returned the period {!r}, not a month'.format(month))
                values[geo][month] = float(cells[cell])
                flags[geo][month] = str(marks.get(cell, ''))
    updated = str(data.get('updated', ''))[:10]
    dt.date.fromisoformat(updated)
    return values, flags, updated, dims['geo']['category'].get('label', {})


def read_ecb(text, item):
    """The ECB's copy of one measure as {ECB area: {month: value}}, each row checked against its series key."""
    out = {}
    for row in csv.DictReader(io.StringIO(text)):
        area = row.get('REF_AREA')
        key = 'HICP.M.{}.N.{}.4D0.ANR'.format(area, item)
        check(row.get('KEY') == key, 'ECB returned {} where {} was expected'.format(row.get('KEY'), key))
        if row['OBS_VALUE']:
            out.setdefault(area, {})[row['TIME_PERIOD']] = float(row['OBS_VALUE'])
    check(out, 'The ECB returned nothing for {}'.format(item))
    return out


def check_members(labels):
    """Eurostat names the euro area with its history, ending "EA21-2026": the number of members must match AREAS."""
    found = re.findall(r'EA(\d+)-(\d{4})', labels.get(EURO_AREA, ''))
    if not found:
        return   # the label was reworded: nothing to compare with
    count = int(max(found, key=lambda pair: pair[1])[0])
    ours = sum(1 for area in AREAS if area[4])
    check(count == ours, 'Eurostat counts {} euro area members and this script {}. Update the euro flags in AREAS.'.format(count, ours))


def pct(v, places=1):
    text = '{:.{}f}'.format(v, places)
    return '0.' + '0' * places if text == '-0.' + '0' * places else text


def signed(v):
    """A difference in points with its sign: +2.7, -0.4, and 0.0 with none."""
    text = pct(v)
    return text if text.startswith('-') or float(text) == 0 else '+' + text


def chart_scale(values):
    """The chart's bottom, its top and the gap between its gridlines, in whole points. Zero is always inside. The top
    is a gridline; the bottom is the whole point under the lowest figure, so a dip below zero doesn't cost the chart
    a whole empty band. At most MAX_STEPS gaps. assets/js/inflation-by-country.js has the same rule (scale)."""
    lo, hi = min(0, math.floor(min(values))), max(0, max(values))
    step = STEPS[-1]
    for candidate in STEPS:
        if math.ceil(hi / candidate) + (-lo) // candidate <= MAX_STEPS:
            step = candidate
            break
    return [lo, max(1, math.ceil(hi / step)) * step, step]


def window(count, back):
    """Where a view starts in a series of count months: back months before the last, or at the first month."""
    return 0 if back is None else max(0, count - 1 - back)


def marked(flags, keys, wanted):
    """The stretches of months that carry a wanted flag, as [label, first, last]."""
    out, previous = [], None
    for month in keys:
        labels = [FLAGS[letter] for letter in flags.get(month, '') if FLAGS[letter] in wanted]
        label = labels[0] if labels else None
        if label and out and out[-1][0] == label and out[-1][2] == previous:
            out[-1][2] = month
        elif label:
            out.append([label, month, month])
        previous = month
    return out


def assemble(eurostat, ecb, source_updated, today):
    """Both files' contents from what was downloaded, as (page, script).
    eurostat is {measure: ({Eurostat area: {month: value}}, {Eurostat area: {month: flags}})}; ecb is
    {measure: {ECB area: {month: value}}}."""
    series, flags = {}, {}
    for measure, _, _ in MEASURES:
        values, marks = eurostat[measure]
        for code, at_eurostat, _, name, _ in AREAS:
            label = '{} {} inflation'.format(name, measure)
            check(values.get(at_eurostat), 'Eurostat has no {}'.format(label))
            oil.check_monthly(values[at_eurostat], label, today, LOWEST, HIGHEST, LAG_MONTHS)
            unknown = sorted({letter for mark in marks.get(at_eurostat, {}).values() for letter in mark} - set(FLAGS))
            check(not unknown, 'Unexpected flag {!r} on {}'.format(''.join(unknown), label))
            series[measure, code] = values[at_eurostat]
            flags[measure, code] = marks.get(at_eurostat, {})

    # The common endpoint: the last month every area has for both measures. A flash estimate that covers only the
    # euro area's members can't put them a month ahead of everyone else.
    to = min(max(s) for s in series.values())
    keys = list(months(FIRST_MONTH, to))
    starts = {}
    for measure, _, _ in MEASURES:
        for code, _, _, name, _ in AREAS:
            s = series[measure, code]
            first = min(k for k in s if k >= FIRST_MONTH)
            check(first <= (FIRST_MONTH if measure == 'headline' else CORE_BY), '{} {} inflation starts too late: {}'.format(name, measure, first))
            gaps = [k for k in months(first, to) if k not in s]
            check(not gaps, '{} {} inflation is missing {}'.format(name, measure, ', '.join(gaps[:6])))
            starts[measure, code] = first

    # The ECB's copy: it reaches the same month, and no figure is more than one rounding step from Eurostat's
    compared = differing = 0
    for measure, _, _ in MEASURES:
        for code, _, at_ecb, name, _ in AREAS:
            copy = ecb[measure].get(at_ecb)
            check(copy and to in copy, "The ECB's copy of {} {} inflation doesn't reach {}".format(name, measure, to))
            for k in keys:
                if k in copy and k in series[measure, code]:
                    gap = abs(copy[k] - series[measure, code][k])
                    check(gap <= ECB_STEP + 1e-9, "The ECB's {} {} inflation for {} is {}, Eurostat's {}".format(name, measure, k, copy[k], series[measure, code][k]))
                    compared += 1
                    differing += gap > 1e-9
    check(differing <= compared * ECB_SHARE, "{} of {} figures differ between Eurostat and the ECB's copy".format(differing, compared))

    codes = [area[0] for area in AREAS]
    names = {area[0]: area[3] for area in AREAS}
    euro = {area[0]: area[4] for area in AREAS}
    tables = {measure: [[k] + [series[measure, code].get(k) for code in codes] for k in keys] for measure, _, _ in MEASURES}

    # The latest month, highest first. The euro area takes its place among the countries, ahead of any it ties with.
    headline = {code: series['headline', code][to] for code in codes}
    core = {code: series['core', code][to] for code in codes}
    order = sorted(codes, key=lambda code: (-headline[code], code != EURO_AREA, names[code]))
    ranking = [[code, names[code], euro[code], pct(headline[code]), pct(core[code]),
                '' if code == EURO_AREA else signed(round(headline[code] - headline[EURO_AREA], 1))]
               for code in order]
    countries = [row for row in ranking if row[0] != EURO_AREA]

    # Each country's highest headline rate since FIRST_MONTH (the latest month, if it was reached twice), and the scale
    # of each view of its chart, which has to hold the euro area's line too
    peaks, scales = {}, {}
    for code in codes:
        own = series['headline', code]
        month = max(keys, key=lambda k: (own[k], k))
        peaks[code] = [month, pct(own[month])]
        scales[code] = {}
        for view, back in RANGES:
            shown = keys[window(len(keys), back):]
            scales[code][view] = chart_scale([s[k] for s in (own, series['headline', EURO_AREA]) for k in shown])

    estimated = [[measure, code] + stretch for measure, _, _ in MEASURES for code in codes
                 for stretch in marked(flags[measure, code], keys, SHOWN)]
    differs = sorted(k for code in codes for k in keys if 'd' in flags['core', code].get(k, ''))
    breaks = sorted({k for code in codes for k in keys if 'b' in flags['core', code].get(k, '')})

    shared = {
        'source_updated': source_updated,
        'from': FIRST_MONTH,
        'to': to,
        'months': len(keys),
        'areas_cols': ['code', 'name', 'uses the euro'],
        'areas': [[area[0], area[3], area[4]] for area in AREAS],
        'core_from': {code: starts['core', code] for code in codes},
    }
    series_tables = {
        'cols': ['month'] + codes,
        'headline': tables['headline'],
        'core': tables['core'],
    }
    page = dict(shared, **{
        'names': names,
        'default': countries[0][0],
        'euro_area': {'headline': pct(headline[EURO_AREA]), 'core': pct(core[EURO_AREA])},
        'highest': countries[0][:2] + [countries[0][3]],
        'lowest': countries[-1][:2] + [countries[-1][3]],
        'above': sum(1 for row in countries if float(row[3]) > float(pct(headline[EURO_AREA]))),
        'rank_scale': [min(0, math.floor(min(headline.values()))), max(1, math.ceil(max(headline.values())))],
        'ranking_cols': ['code', 'name', 'uses the euro', 'headline', 'core', 'against the euro area'],
        'ranking': ranking,
        'peaks': peaks,
        'scales': scales,
        'estimated_cols': ['measure', 'code', 'flag', 'first', 'last'],
        'estimated': estimated,
        'core_differs': [differs[0], differs[-1]] if differs else [],
        'core_breaks': breaks,
        'sources': SOURCES,
    })
    page.update(series_tables)
    script = dict(shared, **series_tables)
    return page, script, (compared, differing)


def build(today):
    geo = '&'.join('geo=' + area[1] for area in AREAS)
    at_ecb = '+'.join(area[2] for area in AREAS)
    eurostat, ecb, updated = {}, {}, []
    for measure, category, item in MEASURES:
        values, flags, day, labels = read_eurostat(fetch(EUROSTAT_URL.format(category, geo, FIRST_MONTH)).decode('utf-8'), category)
        check_members(labels)
        eurostat[measure] = (values, flags)
        updated.append(day)
        url = oil.ECB_CSV.format(ECB_KEY.format(at_ecb, item)) + '&detail=dataonly&startPeriod=' + FIRST_MONTH
        ecb[measure] = read_ecb(fetch(url).decode('utf-8'), item)
    return assemble(eurostat, ecb, max(updated), today)


def main():
    today = dt.datetime.now(dt.timezone.utc).date()
    try:
        page, script, (compared, differing) = build(today)
    except (DataError, KeyError, ValueError) as e:
        print('Inflation by country NOT updated: {}'.format(e), file=sys.stderr)
        print('The existing files are unchanged.', file=sys.stderr)
        return 1

    old_page, old_script = oil.load(PAGE_JSON), oil.load(SCRIPT_JSON)
    strip = lambda d: {k: v for k, v in (d or {}).items() if k != 'updated'}
    if old_page and old_script and strip(old_page) == page and strip(old_script) == script:
        print('No change: inflation by country still runs to {}.'.format(page['to']))
        return 0

    # 'updated' is the day this script last found new data, so an unchanged run leaves the files byte for byte alone.
    page = dict({'updated': today.isoformat()}, **page)
    script = dict({'updated': today.isoformat()}, **script)
    oil.write_atomically([(PAGE_JSON, oil.dumps(page)), (SCRIPT_JSON, oil.dumps(script))])
    for path in (PAGE_JSON, SCRIPT_JSON):
        print('Wrote {} ({:,} bytes)'.format(os.path.relpath(path, ROOT), os.path.getsize(path)))
    print('{} areas to {}; Eurostat last updated {}. Highest: {} {}%, euro area {}%.'.format(
        len(AREAS), page['to'], page['source_updated'], page['highest'][1], page['highest'][2], page['euro_area']['headline']))
    print("{} of {:,} figures differ from the ECB's copy, none by more than {} point.".format(differing, compared, ECB_STEP))
    return 0


if __name__ == '__main__':
    sys.exit(main())
