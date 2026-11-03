#!/usr/bin/env python3
"""Update the data behind the old-vs-new calculator (_includes/old-new-calculator.html): what money put into cash,
a bank deposit, German bonds, gold, US stocks, European stocks or Bitcoin would be worth today, in euros.

Downloads, with no API keys:
  - Euro area households' bank deposits with agreed maturity of up to one year, new business, annual rate:
    ECB Data Portal series MIR.M.U2.B.L22.F.R.A.2250.EUR.N
  - Germany's long-term interest rate for convergence purposes (10-year government bonds), monthly average:
    ECB Data Portal series IRS.M.DE.L.L40.CI.0000.EUR.N.Z
  - Euro area consumer prices: ECB Data Portal series HICP.M.U2.N.000000.4D0.INX, as in the oil script
  - US dollars per euro: ECB Data Portal series EXR.D.USD.EUR.SP00.A (daily) and EXR.M.USD.EUR.SP00.A (monthly average)
  - Gold, US dollars a troy ounce, monthly average: the World Bank's Pink Sheet (CMO-Historical-Data-Monthly.xlsx),
    found through the link on its Commodity Markets page, because the file's address changes with each release
  - US and European stock markets, monthly total returns in US dollars with dividends reinvested: Kenneth French's
    Data Library (F-F_Research_Data_Factors and Europe_3_Factors), market excess return plus the one-month T-bill rate
  - Bitcoin, US dollars, daily: Coin Metrics Community API, metric PriceUSD

Writes:
  assets/data/old-new.json   one row a month from January 1999: each asset's value in euros, and HICP
  _data/old_new.json         the calculator's default case worked out here, so the page shows it without JavaScript,
                             and the figures the home page's questions quote

Every value is at the end of its month (the ECB's last rate of the month converts dollars to euros), except gold,
whose only free monthly price is the month's average (converted at the month's average rate).

Run it from the repository root:   python3 scripts/update-old-new-data.py
Standard library only. It reuses the download and file helpers of update-oil-data.py, so it follows the same rules:
every download is checked, and if one fails or looks wrong the script stops with an error and leaves both files
exactly as they were. When nothing in the data has changed, it rewrites nothing.
"""

import csv
import datetime as dt
import importlib.util
import io
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

_spec = importlib.util.spec_from_file_location('update_oil_data', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'update-oil-data.py'))
oil = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(oil)
DataError, check, fetch, ecb_series, months = oil.DataError, oil.check, oil.fetch, oil.ecb_series, oil.months

ROOT = oil.ROOT
OUT_JSON = os.path.join(ROOT, 'assets', 'data', 'old-new.json')
DEFAULT_JSON = os.path.join(ROOT, '_data', 'old_new.json')

DEPOSIT_KEY = 'MIR/M.U2.B.L22.F.R.A.2250.EUR.N'
BUND_KEY = 'IRS/M.DE.L.L40.CI.0000.EUR.N.Z'
HICP_KEY = oil.HICP_KEY
FX_DAILY_KEY = oil.EXR_KEY
FX_MONTHLY_KEY = 'EXR/M.USD.EUR.SP00.A'
WORLD_BANK_PAGE = 'https://www.worldbank.org/en/research/commodity-markets'
FRENCH_ZIP = 'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/{}_CSV.zip'
COIN_METRICS = 'https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=PriceUSD&frequency=1d&page_size=10000&start_time=2010-01-01'

FIRST_MONTH = '1999-01'   # the euro's first month
BOND_YEARS = 10
DEPOSIT_CARRY = 2         # months the deposit rate may lag the other data, carried forward from its latest month
STALE_MONTHS = 3          # the latest common month must be at most this many months before today

# In the calculator's order: id, name, the name inside a sentence ("your gold was worth"), and a note. 'from' is
# filled in from the data. All of it shows on the page.
ASSETS = [
    ('cash', 'Cash at home', 'cash', 'Notes in a drawer, earning nothing'),
    ('deposit', 'Bank deposit', 'deposit', 'The euro area’s average rate on household deposits fixed for up to a year'),
    ('bund', 'German bonds', 'bonds', 'A 10-year Bund, swapped for a new one each month'),
    ('gold', 'Gold', 'gold', 'Bought at the month’s average price'),
    ('us', 'US stocks', 'US stocks', 'The whole US market, dividends reinvested'),
    ('europe', 'European stocks', 'European stocks', 'Developed European markets, dividends reinvested'),
    ('bitcoin', 'Bitcoin', 'Bitcoin', 'The new money'),
]

SOURCES = {
    'deposit': 'European Central Bank, MFI interest rates: deposits from euro area households with agreed maturity of up to one year, new business',
    'bund': 'European Central Bank, long-term interest rate for convergence purposes, Germany (10-year government bond yield, monthly average)',
    'gold': 'World Bank, Commodity Price Data (the Pink Sheet), gold, US dollars a troy ounce, monthly average',
    'us': 'Kenneth R. French Data Library, US market return (all NYSE, AMEX and NASDAQ stocks, from CRSP), in US dollars',
    'europe': 'Kenneth R. French Data Library, European market return (developed Europe, from Bloomberg), in US dollars',
    'bitcoin': 'Coin Metrics Community Data, Bitcoin reference rate in US dollars',
    'hicp': oil.SOURCES['hicp'],
    'eurusd': oil.SOURCES['eurusd'],
}

# The default case, as the form starts: a lump sum, the month and year below, adjusted for inflation
DEFAULT = {'amount': 1000, 'start': '2000-01'}


# Downloads ----------------------------------------------------------------------------------------

def read_xlsx_sheet(data, name):
    """Return {(row, col): value} for one sheet of an .xlsx workbook, rows and columns counted from 0."""
    ns = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
    rel_ns = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
        workbook = ET.fromstring(z.read('xl/workbook.xml'))
        rels = {r.get('Id'): r.get('Target') for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
        strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            strings = [''.join(t.text or '' for t in si.iter(ns + 't')) for si in ET.fromstring(z.read('xl/sharedStrings.xml')).iter(ns + 'si')]
        target = next((rels[s.get(rel_ns + 'id')] for s in workbook.iter(ns + 'sheet') if s.get('name') == name), None)
        if target is None:
            raise DataError('No sheet called {} in the workbook'.format(name))
        sheet = ET.fromstring(z.read('xl/' + target.lstrip('/').replace('xl/', '', 1)))
    except (zipfile.BadZipFile, KeyError, ET.ParseError) as e:
        raise DataError('Not a readable .xlsx file ({})'.format(e))
    cells = {}
    for c in sheet.iter(ns + 'c'):
        m = re.match(r'([A-Z]+)(\d+)$', c.get('r', ''))
        if not m:
            continue
        col = 0
        for ch in m.group(1):
            col = col * 26 + ord(ch) - 64
        kind, v = c.get('t'), c.find(ns + 'v')
        if kind == 'inlineStr':
            value = ''.join(t.text or '' for t in c.iter(ns + 't'))
        elif v is None:
            continue
        elif kind == 's':
            value = strings[int(v.text)]
        elif kind in ('str', 'e'):
            value = v.text
        else:
            value = float(v.text)
        cells[(int(m.group(2)) - 1, col - 1)] = value
    return cells


def world_bank_gold():
    """Gold's monthly average in US dollars a troy ounce, as {'YYYY-MM': price}."""
    page = fetch(WORLD_BANK_PAGE).decode('utf-8', 'replace')
    links = sorted(set(re.findall(r'https://thedocs\.worldbank\.org/[^"\'\s<>]*CMO-Historical-Data-Monthly\.xlsx', page)))
    check(len(links) == 1, 'Expected one link to the monthly Pink Sheet on the World Bank page, found {}'.format(len(links)))
    cells = read_xlsx_sheet(fetch(links[0]), 'Monthly Prices')
    heads = [(r, c) for (r, c), v in cells.items() if v == 'Gold']
    check(len(heads) == 1, 'Expected one Gold column in the Pink Sheet, found {}'.format(len(heads)))
    r0, col = heads[0]
    check(cells.get((r0 + 1, col)) == '($/troy oz)', 'The Pink Sheet\'s gold column is not in dollars a troy ounce: {}'.format(cells.get((r0 + 1, col))))
    out = {}
    for (r, c), v in cells.items():
        if c == 0 and isinstance(v, str) and re.match(r'\d{4}M\d\d$', v) and isinstance(cells.get((r, col)), float):
            out['{}-{}'.format(v[:4], v[5:])] = cells[(r, col)]
    return out


def french_market(name):
    """A Kenneth French market return series as {'YYYY-MM': monthly return}, from its first (monthly) table."""
    z = zipfile.ZipFile(io.BytesIO(fetch(FRENCH_ZIP.format(name))))
    text = z.read(z.namelist()[0]).decode('latin-1')
    lines = [l.strip() for l in text.replace('\r', '').split('\n')]
    head = next((i for i, l in enumerate(lines) if l.replace(' ', '') == ',Mkt-RF,SMB,HML,RF'), None)
    check(head is not None, '{} has no Mkt-RF,SMB,HML,RF table'.format(name))
    out = {}
    for l in lines[head + 1:]:
        cols = [c.strip() for c in l.split(',')]
        if not re.match(r'\d{6}$', cols[0]):
            break  # the monthly table ends at the blank line before the annual one
        excess, rf = float(cols[1]), float(cols[4])
        check(excess != -99.99 and rf != -99.99, '{} is missing a value for {}'.format(name, cols[0]))
        out['{}-{}'.format(cols[0][:4], cols[0][4:])] = (excess + rf) / 100
    return out


def coin_metrics_btc():
    """Bitcoin's daily price in US dollars as {'YYYY-MM-DD': price}."""
    out, url = {}, COIN_METRICS
    for _ in range(20):
        page = json.loads(fetch(url).decode('utf-8'))
        for row in page.get('data', []):
            check(row.get('asset') == 'btc', 'Coin Metrics returned {} instead of btc'.format(row.get('asset')))
            out[row['time'][:10]] = float(row['PriceUSD'])
        url = page.get('next_page_url')
        if not url:
            return out
    raise DataError('Coin Metrics kept paging')


# The maths -----------------------------------------------------------------------------------------

def bond_return(y0, y1):
    """A month's return on a 10-year government bond bought new at par, at the end of the month before, yielding y0%:
    one month later it has 10 years less a month to run, and its annual coupons of y0% and its principal are valued
    at the new yield y1%. Then it's sold and a new 10-year bond bought, so the bond never ages."""
    c, y = y0 / 100, y1 / 100
    first = 1 - 1 / 12
    value = sum(c * (1 + y) ** -(first + k) for k in range(BOND_YEARS)) + (1 + y) ** -(BOND_YEARS - 1 / 12)
    return value - 1


def month_end_rates(daily):
    """The ECB's last daily rate in each month, as {'YYYY-MM': rate}."""
    out = {}
    for day in sorted(daily):
        out[day[:7]] = daily[day]
    return out


def bitcoin_month_ends(daily, first, last):
    """PriceUSD 1d labels a UTC day's close, not the start of its timestamped day.
    Require the actual final calendar day; do not turn a partial month into a close.
    """
    out = {}
    for key in months(first, last):
        year, month = map(int, key.split('-'))
        next_month = dt.date(year + (month == 12), month % 12 + 1, 1)
        day = (next_month - dt.timedelta(days=1)).isoformat()
        check(day in daily and daily[day] > 0, 'Bitcoin is missing its UTC day-end observation for {}'.format(day))
        out[key] = daily[day]
    return out


def sig(v, digits=7):
    return float('{:.{}g}'.format(v, digits))


# Building the files --------------------------------------------------------------------------------

def build(today):
    deposit = ecb_series(DEPOSIT_KEY)
    bund = ecb_series(BUND_KEY)
    hicp = ecb_series(HICP_KEY)
    fx_daily = ecb_series(FX_DAILY_KEY)
    fx_avg = ecb_series(FX_MONTHLY_KEY)
    gold = world_bank_gold()
    us = french_market('F-F_Research_Data_Factors')
    europe = french_market('Europe_3_Factors')
    btc = coin_metrics_btc()

    check(all(-2 < v < 20 for v in deposit.values()), 'The deposit rate has an implausible value')
    check(all(-2 < v < 20 for v in bund.values()), 'The Bund yield has an implausible value')
    check(all(0.5 < v < 2.5 for v in list(fx_daily.values()) + list(fx_avg.values())), 'ECB EUR/USD has an implausible rate')
    check(all(10 < v < 20000 for v in gold.values()), 'The gold price has an implausible value')
    check(all(-0.5 < v < 0.5 for s in (us, europe) for v in s.values()), 'A stock market return is implausible')
    check(all(0 < v < 10000000 for v in btc.values()), 'The Bitcoin price has an implausible value')
    check(min(btc) <= '2010-07-31', 'Coin Metrics should start in July 2010, not {}'.format(min(btc)))

    # The calculator runs to the latest month every series has, except the deposit rate, which may lag a little
    latest = {'stocks (US)': max(us), 'stocks (Europe)': max(europe), 'gold': max(gold), 'Bund yield': max(bund),
              'HICP': max(hicp), 'EUR/USD': max(fx_avg), 'Bitcoin': max(btc)[:7]}
    to = min(latest.values())
    lag = (today.year - int(to[:4])) * 12 + today.month - int(to[5:7])
    check(lag <= STALE_MONTHS, 'The data is stale: it only runs to {} ({})'.format(to, ', '.join('{} {}'.format(k, v) for k, v in latest.items())))
    keys = list(months(FIRST_MONTH, to))
    for name, series in (('US stocks', us), ('European stocks', europe), ('gold', gold), ('HICP', hicp), ('EUR/USD', fx_avg)):
        gaps = [k for k in keys if k not in series]
        check(not gaps, '{} is missing {}'.format(name, ', '.join(gaps[:5])))
    check(all(k in bund for k in ['1998-12'] + keys), 'The Bund yield has a gap')
    fx_end = month_end_rates(fx_daily)
    check(all(k in fx_end for k in keys), 'ECB EUR/USD has a month with no daily rate')

    deposit_from = max(FIRST_MONTH, min(deposit))
    deposit_filled = [k for k in months(deposit_from, to) if k not in deposit]
    check(len(deposit_filled) <= DEPOSIT_CARRY and all(k > max(deposit) for k in deposit_filled),
          'The deposit rate is missing {}'.format(', '.join(deposit_filled)))
    btc_from = '2010-07'
    btc_end = bitcoin_month_ends(btc, btc_from, to)

    # Each asset's value in euros at the end of each month. Stocks, bonds and deposits are indices, 100 in their first month.
    level = {'us': 100.0, 'europe': 100.0, 'bund': 100.0, 'deposit': 100.0}
    usd = {'us': 1.0, 'europe': 1.0}
    rate = None
    rows = []
    for i, k in enumerate(keys):
        for name, series in (('us', us), ('europe', europe)):
            usd[name] *= 1 + series[k]
        if i:
            level['bund'] *= 1 + bond_return(bund[keys[i - 1]], bund[k])
        if k >= deposit_from:
            rate = deposit.get(k, rate)
            if k > deposit_from:
                level['deposit'] *= (1 + rate / 100) ** (1 / 12)
        if i == 0:
            base = {name: usd[name] / fx_end[k] for name in usd}
        row = {
            'cash': 1,
            'deposit': level['deposit'] if k >= deposit_from else None,
            'bund': level['bund'],
            'gold': gold[k] / fx_avg[k],
            'us': 100 * usd['us'] / fx_end[k] / base['us'],
            'europe': 100 * usd['europe'] / fx_end[k] / base['europe'],
            'bitcoin': btc_end[k] / fx_end[k] if k >= btc_from else None,
        }
        rows.append([k, hicp[k]] + [None if row[a] is None else sig(row[a]) for a, _, _, _ in ASSETS])

    starts = {a: next(r[0] for r in rows if r[2 + j] is not None) for j, (a, _, _, _) in enumerate(ASSETS)}
    assets = [{'id': a, 'name': name, 'short': short, 'note': note, 'from': starts[a]} for a, name, short, note in ASSETS]
    data = {
        'to': to,
        'hicp_to': max(hicp),
        'deposit_filled': deposit_filled,
        'sources': SOURCES,
        'assets': assets,
        'cols': ['month', 'hicp'] + [a for a, _, _, _ in ASSETS],
        'rows': rows,
    }
    return data, default_case(data)


def default_case(data):
    """The form's starting case for the page without JavaScript: a lump sum put into each asset at the end of the start
    month, its value at the end of the latest month, in today's money (deflated by HICP), ranked as the calculator ranks it."""
    rows, amount, start = data['rows'], DEFAULT['amount'], DEFAULT['start']
    i0 = next(i for i, r in enumerate(rows) if r[0] == start)
    last = rows[-1]
    end_day = lambda key: dt.date(int(key[:4]) + (key[5:] == '12'), int(key[5:]) % 12 + 1, 1) - dt.timedelta(days=1)
    days = (end_day(last[0]) - end_day(start)).days
    put_in_real = amount * last[1] / rows[i0][1]
    out = []
    for j, a in enumerate(data['assets']):
        col = 2 + j
        if rows[i0][col] is None:
            continue
        value = amount * last[col] / rows[i0][col]
        # The biggest fall from a high, in today's money, between the start month and the latest
        peak, fall = None, 0
        for r in rows[i0:]:
            real = r[col] / r[1]
            peak = real if peak is None or real > peak else peak
            fall = min(fall, real / peak - 1)
        out.append({'name': a['name'], 'value': value, 'annual': (value / put_in_real) ** (365 / days) - 1, 'fall': fall})
    out.sort(key=lambda r: -r['value'])
    fmt_pct = lambda x: ('−' if x < 0 and round(abs(x) * 100, 1) else '') + '{:,.1f}%'.format(abs(x) * 100)
    # For the home page's introduction: how far prices have risen since the first month, and what €1,000 kept in a
    # drawer since then buys now, in that month's money
    first = rows[0]
    since = {'from': first[0], 'prices_up': '{:,.0f}'.format((last[1] / first[1] - 1) * 100), 'drawer': '{:,.0f}'.format(1000 * first[1] / last[1])}

    def lump_annual(asset, start):
        """The yearly return after inflation on a lump sum put into an asset at the end of start, as the calculator has it."""
        col = 2 + next(j for j, a in enumerate(data['assets']) if a['id'] == asset)
        r0 = next(r for r in rows if r[0] == start)
        growth = (last[col] / r0[col]) / (last[1] / r0[1])
        return growth ** (365 / (end_day(last[0]) - end_day(start)).days) - 1

    # For the home page's questions (faq in index.html): the figures their answers quote from the calculator, so they
    # move with the data. _includes/faq-fill.html swaps each [name] in an answer for its value here.
    faq = {
        'to': end_day(last[0]).strftime('%B %Y'),
        'prices_up': since['prices_up'] + '%',
        'drawer': '€' + since['drawer'],
        'lost': '{:,.0f}%'.format((1 - first[1] / last[1]) * 100),
        'europe_2000': fmt_pct(lump_annual('europe', '2000-03')),
        'europe_2003': fmt_pct(lump_annual('europe', '2003-03')),
        'europe_2009': fmt_pct(lump_annual('europe', '2009-02')),
        'deposit_2000': fmt_pct(lump_annual('deposit', '2000-01')),
        'gold_1999': fmt_pct(lump_annual('gold', '1999-01')),
    }
    return {
        'to': last[0],
        'hicp_to': data['hicp_to'],
        'deposit_filled': data['deposit_filled'],
        'from': {a['id']: a['from'] for a in data['assets']},
        'unavailable': [{'name': a['name'], 'from': a['from']} for a in data['assets'] if rows[i0][2 + data['assets'].index(a)] is None],
        'since': since,
        'faq': faq,
        'start': start,
        'amount': '{:,}'.format(amount),
        'put_in_real': '{:,.0f}'.format(put_in_real),
        'cols': ['asset', 'value', 'annual', 'fall'],
        'rows': [[r['name'], '{:,.0f}'.format(r['value']), fmt_pct(r['annual']), fmt_pct(r['fall']) if round(r['fall'] * 100) else '0%'] for r in out],
    }


def main():
    today = dt.datetime.now(dt.timezone.utc).date()
    try:
        data, default = build(today)
    except DataError as e:
        print('Old-vs-new data NOT updated: {}'.format(e), file=sys.stderr)
        print('The existing files are unchanged.', file=sys.stderr)
        return 1

    old_data, old_default = oil.load(OUT_JSON), oil.load(DEFAULT_JSON)
    strip = lambda d: {k: v for k, v in (d or {}).items() if k != 'updated'}
    if old_data and old_default and strip(old_data) == data and strip(old_default) == default:
        print('No change: the data still runs to {}.'.format(data['to']))
        return 0

    data = dict({'updated': today.isoformat()}, **data)
    default = dict({'updated': today.isoformat()}, **default)
    oil.write_atomically([(OUT_JSON, oil.dumps(data)), (DEFAULT_JSON, oil.dumps(default))])
    for path in (OUT_JSON, DEFAULT_JSON):
        print('Wrote {} ({:,} bytes)'.format(os.path.relpath(path, ROOT), os.path.getsize(path)))
    print('Data to {}; deposit rate carried forward for {}.'.format(data['to'], ', '.join(data['deposit_filled']) or 'no month'))
    return 0


if __name__ == '__main__':
    sys.exit(main())
