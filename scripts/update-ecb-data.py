#!/usr/bin/env python3
"""Update the data behind the ECB chart (ECB rates against euro area inflation, _includes/ecb-rates-chart.html).

Downloads from the ECB Data Portal, with no API key:
  - HICP.M.U2.N.000000.4D0.ANR     euro area inflation (HICP, all items), annual rate of change, from Eurostat.
                                   Euro area in its changing composition, the same basis as the oil script's index.
  - HICP.M.U2.N.XEF000.4D0.ANR     the same excluding energy, food, alcohol and tobacco ("core inflation")
  - FM.B.U2.EUR.4F.KR.DFR.LEV      the deposit facility rate, on each date a change took effect
  - FM.B.U2.EUR.4F.KR.MRR_MBR.LEV  the main refinancing rate while it was the minimum bid rate of variable rate
                                   tenders (28 June 2000 to 14 October 2008)
  - FM.B.U2.EUR.4F.KR.MRR_FR.LEV   the main refinancing rate as a fixed rate (from 15 October 2008)
  - FM.D.U2.EUR.4F.KR.DFR.LEV and FM.D.U2.EUR.4F.KR.MRR_FR.LEV, the last few weeks only, to check the change
    dates above are up to date

Writes:
  _data/ecb_rates_inflation.json   monthly rows for the table, rate steps and hiking episodes for the chart

Run it from the repository root:   python3 scripts/update-ecb-data.py
Standard library only. It reuses the download and file helpers of update-oil-data.py, so it follows the same rules:
every download is checked, and if one fails or looks wrong the script stops with an error and leaves the file
exactly as it was. When nothing in the data has changed, it rewrites nothing.
"""

import calendar
import csv
import datetime as dt
import importlib.util
import io
import math
import os
import sys

_spec = importlib.util.spec_from_file_location('update_oil_data', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'update-oil-data.py'))
oil = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(oil)
DataError, check, fetch, ecb_series, months = oil.DataError, oil.check, oil.fetch, oil.ecb_series, oil.months

ROOT = oil.ROOT
OUT_JSON = os.path.join(ROOT, '_data', 'ecb_rates_inflation.json')

HEADLINE_KEY = 'HICP/M.U2.N.000000.4D0.ANR'
CORE_KEY = 'HICP/M.U2.N.XEF000.4D0.ANR'
DFR_KEY = 'FM/B.U2.EUR.4F.KR.DFR.LEV'
MBR_KEY = 'FM/B.U2.EUR.4F.KR.MRR_MBR.LEV'
MRO_KEY = 'FM/B.U2.EUR.4F.KR.MRR_FR.LEV'
DAILY_KEYS = {'deposit': 'FM/D.U2.EUR.4F.KR.DFR.LEV', 'main': 'FM/D.U2.EUR.4F.KR.MRR_FR.LEV'}

FIRST_MONTH = '2007-01'
MBR_FROM = '2000-06-28'   # the ECB switched its main refinancing operations to variable rate tenders
MRO_FROM = '2008-10-15'   # and back to fixed rate tenders: the first one settled on 15 October 2008

# The four times the ECB raised rates into an energy shock: the day of the decision to make the first hike, and of
# the first cut (None while it's still open). These are decision days, from the ECB's press releases; the rates
# above change on the day they take effect, usually six days later. The script checks each date against the rates.
EPISODES = [
    ('2008-07-03', '2008-10-08'),
    ('2011-04-07', '2011-11-03'),
    ('2022-07-21', '2024-06-06'),
    ('2026-06-11', None),
]
TAKES_EFFECT_WITHIN = 14  # days between a decision and the change in the rate data

SOURCES = {
    'inflation': 'Eurostat via the ECB Data Portal, HICP, euro area (changing composition), annual rate of change: all items, and excluding energy, food, alcohol and tobacco',
    'rates': 'European Central Bank, key interest rates: deposit facility, and main refinancing operations (minimum bid rate to 14 October 2008, fixed rate after)',
}


def ecb_recent(key, start):
    """The daily ECB series since start, as {date: value}, checked against its key like ecb_series."""
    text = fetch(oil.ECB_CSV.format(key) + '&startPeriod=' + start).decode('utf-8')
    out = {}
    for row in csv.DictReader(io.StringIO(text)):
        if row.get('KEY') != key.replace('/', '.'):
            raise DataError('ECB returned {} instead of {}'.format(row.get('KEY'), key))
        if row['OBS_VALUE']:
            out[row['TIME_PERIOD']] = float(row['OBS_VALUE'])
    return out


def rate_on(changes, day):
    """The rate in force on day (an ISO date): the last change on or before it."""
    past = [d for d in changes if d <= day]
    check(past, 'No ECB rate in force on {}'.format(day))
    return changes[max(past)]


def month_x(day):
    """A date as months since the start of FIRST_MONTH, so 15 January 2007 is about 0.45."""
    d = dt.date.fromisoformat(day)
    y0, m0 = map(int, FIRST_MONTH.split('-'))
    return round((d.year - y0) * 12 + d.month - m0 + (d.day - 1) / calendar.monthrange(d.year, d.month)[1], 3)


def month_end(key):
    y, m = map(int, key.split('-'))
    return '{}-{:02d}'.format(key, calendar.monthrange(y, m)[1])


def pct(v, places):
    text = '{:.{}f}'.format(v, places)
    return '0.' + '0' * places if text == '-0.' + '0' * places else text


def build(today):
    headline = ecb_series(HEADLINE_KEY)
    core = ecb_series(CORE_KEY)
    deposit = ecb_series(DFR_KEY)
    mbr = ecb_series(MBR_KEY)
    mro = ecb_series(MRO_KEY)
    since = (today - dt.timedelta(days=45)).isoformat()
    daily = {name: ecb_recent(key, since) for name, key in DAILY_KEYS.items()}

    # Inflation: every month from FIRST_MONTH, plausible, and recent. Both series end in the same month.
    for name, series in (('Headline inflation', headline), ('Core inflation', core)):
        oil.check_monthly(series, name, today, -10, 30, 4)
        missing = [k for k in months(FIRST_MONTH, max(series)) if k not in series]
        check(not missing, '{} is missing {}'.format(name, ', '.join(missing)))
    check(max(headline) == max(core), 'Headline inflation runs to {} but core to {}'.format(max(headline), max(core)))
    last_month = max(headline)

    # Rates: dates in order, values plausible, and the main rate joined from its two series.
    for name, series in (('Deposit rate', deposit), ('Minimum bid rate', mbr), ('Main refinancing rate', mro)):
        check(all(len(d) == 10 for d in series), '{} should be dated by day'.format(name))
        check(all(-2 < v < 10 for v in series.values()), '{} has an implausible value'.format(name))
    check(min(mbr) == MBR_FROM and max(mbr) < MRO_FROM, 'The minimum bid rate should run from {} to before {}, not {} to {}'.format(MBR_FROM, MRO_FROM, min(mbr), max(mbr)))
    check(MRO_FROM in mro and not [d for d in mro if MBR_FROM <= d < MRO_FROM],
          'The fixed main refinancing rate should restart on {} with no changes in the variable rate tender years'.format(MRO_FROM))
    main = {d: v for d, v in mro.items() if d < MBR_FROM or d >= MRO_FROM}
    main.update(mbr)

    # The change dates must be current: each daily series reaches the last few days and agrees with them.
    for name, changes in (('deposit', deposit), ('main', mro)):
        series = daily[name]
        check(series, 'The daily ECB {} rate returned nothing since {}'.format(name, since))
        latest = max(series)
        check((today - dt.date.fromisoformat(latest)).days <= 10, 'The daily ECB {} rate is stale: latest is {}'.format(name, latest))
        check(series[latest] == rate_on(changes, latest),
              'The daily ECB {} rate ({} on {}) disagrees with its change dates ({})'.format(name, series[latest], latest, rate_on(changes, latest)))

    # Each hiking episode: a hike takes effect just after its first decision, the rate only rises until the
    # first cut, and that cut takes effect just after its decision. An open episode stops the script once the
    # ECB cuts, so the date of that decision can be added to EPISODES above.
    days_after = lambda d, n: (dt.date.fromisoformat(d) + dt.timedelta(days=n)).isoformat()
    changes = sorted(deposit.items())
    moves = [(d, v - prev) for (_, prev), (d, v) in zip(changes, changes[1:])]  # each change, up or down
    for start, end in EPISODES:
        first = [(d, up) for d, up in moves if start <= d <= days_after(start, TAKES_EFFECT_WITHIN)]
        check(first and first[0][1] > 0, 'No rise in the deposit rate within {} days of the decision on {}'.format(TAKES_EFFECT_WITHIN, start))
        cuts = [d for d, up in moves if start <= d < (end or '9999') and up < 0]
        if end is None:
            check(not cuts, 'The ECB cut its deposit rate with effect from {}. Add the date of that decision as the end of the '
                  'episode that began on {} (EPISODES in this script).'.format(cuts[0] if cuts else '', start))
            continue
        check(not cuts, 'The deposit rate fell on {}, before the episode that began on {} ended'.format(cuts[0] if cuts else '', start))
        cut = [(d, up) for d, up in moves if end <= d <= days_after(end, TAKES_EFFECT_WITHIN)]
        check(cut and cut[0][1] < 0, 'No cut in the deposit rate within {} days of the decision on {}'.format(TAKES_EFFECT_WITHIN, end))

    # The rows: each month's inflation, and the rates in force at the end of the month
    keys = list(months(FIRST_MONTH, last_month))
    rows = [[k, pct(headline[k], 1), pct(core[k], 1), pct(rate_on(main, month_end(k)), 2), pct(rate_on(deposit, month_end(k)), 2)] for k in keys]

    # The steps: the rates on the first day, then every day either one changed, to the end of the last month
    first_day, last_day = FIRST_MONTH + '-01', month_end(last_month)
    days = sorted(d for d in set(main) | set(deposit) if first_day < d <= last_day)
    steps = [[first_day, 0, rate_on(main, first_day), rate_on(deposit, first_day)]]
    for d in days:
        pair = [rate_on(main, d), rate_on(deposit, d)]
        if pair != steps[-1][2:]:
            steps.append([d, month_x(d)] + pair)

    # Each episode's label is its years: 2008, or 2022–24 when the first cut came in a later year
    label = lambda start, end: start[:4] + ('–' + end[2:4] if end and end[:4] != start[:4] else '')
    episodes = [[start, end, month_x(start), month_x(end) if end else len(keys), label(start, end)] for start, end in EPISODES]

    def peak(series):
        k = max(keys, key=lambda m: (series[m], m))
        return [k, pct(series[k], 1)]

    # Each panel's scale, in whole points, always including zero. The chart gives a point the same height in both
    # panels, so a gap between inflation and a rate looks the same size as it really is.
    def scale(values):
        return [min(0, math.floor(min(values))), max(1, math.ceil(max(values)))]

    return {
        'hicp_to': last_month,
        'first_month': FIRST_MONTH,
        'months': len(keys),
        'headline_peak': peak(headline),
        'core_peak': peak(core),
        'scales': {'inflation': scale([s[k] for s in (headline, core) for k in keys]), 'rates': scale([v for s in steps for v in s[2:]])},
        'sources': SOURCES,
        'cols': ['month', 'headline', 'core', 'main', 'deposit'],
        'rows': rows,
        'steps_cols': ['date', 'x', 'main', 'deposit'],
        'steps': steps,
        'episodes_cols': ['first_hike', 'first_cut', 'x0', 'x1', 'label'],
        'episodes': episodes,
    }


def main():
    today = dt.datetime.now(dt.timezone.utc).date()
    try:
        data = build(today)
    except DataError as e:
        print('ECB data NOT updated: {}'.format(e), file=sys.stderr)
        print('The existing file is unchanged.', file=sys.stderr)
        return 1

    old = oil.load(OUT_JSON)
    if old and {k: v for k, v in old.items() if k != 'updated'} == data:
        print('No change: euro area inflation still runs to {}.'.format(data['hicp_to']))
        return 0

    data = dict({'updated': today.isoformat()}, **data)
    oil.write_atomically([(OUT_JSON, oil.dumps(data))])
    print('Wrote {} ({:,} bytes)'.format(os.path.relpath(OUT_JSON, ROOT), os.path.getsize(OUT_JSON)))
    print('Inflation to {}; deposit rate {}%, main rate {}% at the end of it.'.format(data['hicp_to'], data['rows'][-1][4], data['rows'][-1][3]))
    return 0


if __name__ == '__main__':
    sys.exit(main())
