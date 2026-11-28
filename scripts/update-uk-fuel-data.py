#!/usr/bin/env python3
"""Update the UK prices in the fuel cost calculator (data/fuel-cost-calculator.html).

The calculator's EU prices come from scripts/update-fuel-data.py. The UK isn't in the Commission's bulletin, so this
script adds it, for the same Monday as the EU figures. It downloads, with no API key:
  - GOV.UK's description of "Weekly road fuel prices" (Department for Energy Security and Net Zero), to find the
    CSV of every week since 2018. The file's address changes each week; the page's address doesn't.
  - That CSV: the average UK pump price of ultra-low-sulphur unleaded petrol and diesel, in pence a litre, one row per
    Monday. Open Government Licence v3.0.
  - The ECB's euro reference rate for the pound (EXR D.GBP.EUR.SP00.A), to turn pence into euros.

Writes:
  _data/uk_fuel_prices.json   the UK prices for the EU figures' week (or the last week before it), in pence and in
                              euros, and the rate used

Run it from the repository root, after update-fuel-data.py:   python3 scripts/update-uk-fuel-data.py
To read a CSV already on disk instead of downloading it:   python3 scripts/update-uk-fuel-data.py path/to/file.csv
Standard library only, with the download and file helpers of update-oil-data.py: if anything fails or looks wrong, it
stops with an error and leaves the file as it was. When nothing has changed, it rewrites nothing.
"""

import csv
import datetime as dt
import importlib.util
import io
import json
import os
import sys

_spec = importlib.util.spec_from_file_location('update_oil_data', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'update-oil-data.py'))
oil = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(oil)
DataError, check, fetch = oil.DataError, oil.check, oil.fetch

ROOT = oil.ROOT
EU_JSON = os.path.join(ROOT, '_data', 'fuel_prices.json')
UK_JSON = os.path.join(ROOT, '_data', 'uk_fuel_prices.json')

CONTENT_URL = 'https://www.gov.uk/api/content/government/statistics/weekly-road-fuel-prices'
PAGE_URL = 'https://www.gov.uk/government/statistics/weekly-road-fuel-prices'
ASSET_HOST = 'https://assets.publishing.service.gov.uk/'
RATE_KEY = 'EXR/D.GBP.EUR.SP00.A'
COLUMNS = {'petrol': 'ULSP', 'diesel': 'ULSD'}   # this site's name: the start of the CSV's column heading
MAX_GAP_DAYS = 14        # the UK week may be at most this much older than the EU week
PENCE = (60, 400)        # a plausible pump price, pence a litre
RATE = (0.6, 1.1)        # a plausible number of pounds to the euro (about 1.2 would be euros to the pound)

SOURCES = {
    'prices': 'Department for Energy Security and Net Zero, Weekly road fuel prices: average UK pump prices of ultra-low-sulphur unleaded petrol and diesel, pence a litre. Contains public sector information licensed under the Open Government Licence v3.0.',
    'rate': 'European Central Bank, euro reference rate for the pound sterling (EXR D.GBP.EUR.SP00.A), on the day of the prices or the last day before it',
}


def csv_url(content):
    """The address of the 2018-onwards CSV, from GOV.UK's description of the page."""
    try:
        attachments = json.loads(content)['details']['attachments']
    except (ValueError, KeyError, TypeError):
        raise DataError('GOV.UK’s page description has no attachments')
    found = [a.get('url', '') for a in attachments
             if a.get('content_type') == 'text/csv' and str(a.get('title', '')).startswith('Weekly road fuel prices (CSV) 2018')]
    check(len(found) == 1, 'Expected one CSV of prices from 2018 on GOV.UK, found {}'.format(len(found)))
    check(found[0].startswith(ASSET_HOST), 'The CSV is not on GOV.UK’s asset host: {}'.format(found[0]))
    return found[0]


def weekly(text):
    """{date: {'petrol': pence, 'diesel': pence}} from the CSV, checked as it goes."""
    rows = list(csv.reader(io.StringIO(text.lstrip('﻿'))))
    check(len(rows) > 1, 'The CSV is empty')
    head = [h.strip() for h in rows[0]]
    check(head and head[0] == 'Date', 'The CSV’s first column is not Date')
    cols = {}
    for fuel, prefix in COLUMNS.items():
        match = [i for i, h in enumerate(head) if h.startswith(prefix) and 'Pump price in pence/litre' in h]
        check(len(match) == 1, 'No single {} pump price column in the CSV'.format(prefix))
        cols[fuel] = match[0]
    out = {}
    for row in rows[1:]:
        if not row or not row[0].strip():
            continue
        try:
            day = dt.datetime.strptime(row[0].strip(), '%d/%m/%Y').date()
        except ValueError:
            raise DataError('Unreadable date in the CSV: {}'.format(row[0]))
        try:
            out[day] = {fuel: float(row[i]) for fuel, i in cols.items()}
        except (ValueError, IndexError):
            continue   # a week with a missing price is skipped, never filled in
    check(out, 'No complete weeks in the CSV')
    return out


def build(text, rates, eu_week):
    """The UK figures for the EU week, or for the last UK week before it. rates is {iso day: pounds per euro}."""
    weeks = weekly(text)
    usable = sorted(d for d in weeks if d <= eu_week)
    check(usable, 'The CSV has no week on or before {}'.format(eu_week))
    week = usable[-1]
    check((eu_week - week).days <= MAX_GAP_DAYS, 'The latest UK week, {}, is too far behind the EU week, {}'.format(week, eu_week))
    check(week.weekday() == 0, 'The UK week {} is not a Monday'.format(week))
    rate = oil.rate_on_or_before(rates, week)
    check(rate is not None, 'No ECB pound rate on or within a week before {}'.format(week))
    check(RATE[0] <= rate <= RATE[1], 'Implausible pound rate: {}'.format(rate))
    out = {'week': week.isoformat(), 'eu_week': eu_week.isoformat(), 'gbp_per_eur': rate}
    for fuel in COLUMNS:
        pence = weeks[week][fuel]
        check(PENCE[0] <= pence <= PENCE[1], 'Implausible UK {} price: {}p'.format(fuel, pence))
        out[fuel] = {
            'pence': '{:.2f}'.format(pence),
            'per1000': round(pence * 10, 1),                       # pounds per 1,000 litres, for the calculator
            'eur': '{:.3f}'.format(pence / 100 / rate),            # euros a litre, for the page's table
        }
    out['sources'] = SOURCES
    out['source_url'] = PAGE_URL
    return out


def rate_window(eu_week):
    return '{}?startPeriod={}&endPeriod={}&format=csvdata'.format(
        oil.ECB_CSV.split('?')[0].format(RATE_KEY), (eu_week - dt.timedelta(days=21)).isoformat(), eu_week.isoformat())


def main(argv):
    today = dt.datetime.now(dt.timezone.utc).date()
    try:
        eu = oil.load(EU_JSON)
        check(eu and eu.get('week'), 'No EU week in {}'.format(os.path.relpath(EU_JSON, ROOT)))
        eu_week = dt.date.fromisoformat(eu['week'])
        if len(argv) > 1:
            with open(argv[1], encoding='utf-8-sig') as f:
                text = f.read()
        else:
            text = fetch(csv_url(fetch(CONTENT_URL))).decode('utf-8-sig')
        rates = {}
        for row in csv.DictReader(io.StringIO(fetch(rate_window(eu_week)).decode('utf-8'))):
            check(row.get('KEY') == RATE_KEY.replace('/', '.'), 'ECB returned {} instead of {}'.format(row.get('KEY'), RATE_KEY))
            if row.get('OBS_VALUE'):
                rates[row['TIME_PERIOD']] = float(row['OBS_VALUE'])
        uk = build(text, rates, eu_week)
    except (DataError, OSError, UnicodeDecodeError) as e:
        print('UK fuel data NOT updated: {}'.format(e), file=sys.stderr)
        print('The existing file is unchanged.', file=sys.stderr)
        return 1

    old = oil.load(UK_JSON)
    if old and {k: v for k, v in old.items() if k != 'updated'} == uk:
        print('No change: UK prices are still for the week of {}.'.format(uk['week']))
        return 0
    uk = dict({'updated': today.isoformat()}, **uk)
    oil.write_atomically([(UK_JSON, oil.dumps(uk))])
    print('Wrote {} ({:,} bytes)'.format(os.path.relpath(UK_JSON, ROOT), os.path.getsize(UK_JSON)))
    print('Week of {}: UK petrol {}p, diesel {}p a litre; £{} to the euro.'.format(
        uk['week'], uk['petrol']['pence'], uk['diesel']['pence'], uk['gbp_per_eur']))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
