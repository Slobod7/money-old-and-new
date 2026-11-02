#!/usr/bin/env python3
"""Update the data behind the oil widgets (the Brent chart and the oil calculator).

Downloads, with no API keys:
  - Europe Brent spot price FOB, US dollars a barrel: EIA series RBRTE, daily and monthly and annual,
    from EIA's spreadsheet downloads (hist_xls). Monthly and annual averages are EIA's own.
  - US consumer prices: FRED series CPIAUCSL (CPI for all urban consumers, seasonally adjusted).
  - Euro area consumer prices: ECB Data Portal series HICP.M.U2.N.000000.4D0.INX
    (HICP overall index, euro area in its changing composition, from Eurostat).
  - US dollars per euro: ECB Data Portal series EXR.D.USD.EUR.SP00.A (the ECB's daily reference rate).

Writes:
  assets/data/oil.json      for the widgets' JavaScript
  _data/brent_annual.json   for the table of annual averages that Jekyll renders, so it works without JavaScript

Run it from the repository root:   python3 scripts/update-oil-data.py
Standard library only. Every download is checked; if one fails or looks wrong, the script stops with an
error and leaves both files exactly as they were. When nothing in the data has changed, it rewrites nothing.
"""

import csv
import datetime as dt
import io
import json
import math
import os
import statistics
import struct
import sys
import tempfile
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OIL_JSON = os.path.join(ROOT, 'assets', 'data', 'oil.json')
ANNUAL_JSON = os.path.join(ROOT, '_data', 'brent_annual.json')

EIA_XLS = 'https://www.eia.gov/dnav/pet/hist_xls/RBRTE{}.xls'   # d, m or a
FRED_CSV = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id={}'
ECB_CSV = 'https://data-api.ecb.europa.eu/service/data/{}?format=csvdata'
HICP_KEY = 'HICP/M.U2.N.000000.4D0.INX'
EXR_KEY = 'EXR/D.USD.EUR.SP00.A'

DAILY_YEARS = 2          # daily rows kept for the chart's 1Y view
FIRST_MONTH = '1990-01'  # the widgets go back to January 1990; EIA's daily series starts on 20 May 1987

SOURCES = {
    'brent': 'U.S. Energy Information Administration, Europe Brent Spot Price FOB (RBRTE)',
    'cpi': 'U.S. Bureau of Labor Statistics via FRED, CPI for All Urban Consumers, seasonally adjusted (CPIAUCSL)',
    'hicp': 'Eurostat via the ECB Data Portal, HICP overall index, euro area, changing composition (2025 = 100)',
    'eurusd': 'European Central Bank, euro reference exchange rate, US dollars per euro',
}


class DataError(Exception):
    pass


# Downloads ----------------------------------------------------------------------------------------

def fetch(url, tries=3):
    """Return the body of url as bytes, retrying twice. Raises DataError if it never succeeds."""
    last = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'moneyoldandnew-data/1.0 (+https://moneyoldandnew.com)'})
            with urllib.request.urlopen(req, timeout=60) as resp:
                if resp.status != 200:
                    raise DataError('HTTP {}'.format(resp.status))
                return resp.read()
        except Exception as e:  # network errors, timeouts, HTTP errors
            last = e
            time.sleep(5 * (attempt + 1))
    raise DataError('Download failed: {} ({})'.format(url, last))


# A minimal reader for EIA's .xls files: an OLE2 compound file holding a BIFF8 workbook --------------

def _cfb_stream(data, names):
    """Return the first stream in the compound file whose name is in names."""
    if data[:8] != b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1':
        raise DataError('Not an Excel 97-2003 file')
    u16 = lambda off: struct.unpack_from('<H', data, off)[0]
    u32 = lambda off: struct.unpack_from('<I', data, off)[0]
    ssz = 1 << u16(30)
    mini_sz = 1 << u16(32)
    n_fat, dir_start, mini_cutoff = u32(44), u32(48), u32(56)
    minifat_start, difat_start, n_difat = u32(60), u32(68), u32(72)
    per = ssz // 4

    def sector(n):
        off = (n + 1) * ssz
        return data[off:off + ssz]

    difat = list(struct.unpack_from('<109I', data, 76))
    s = difat_start
    for _ in range(n_difat):
        vals = struct.unpack('<%dI' % per, sector(s))
        difat.extend(vals[:-1])
        s = vals[-1]
    fat = []
    for n in difat[:n_fat]:
        fat.extend(struct.unpack('<%dI' % per, sector(n)))

    def chain(start, table):
        out, s = [], start
        while s < 0xFFFFFFFA:
            if len(out) > len(table):
                raise DataError('Broken sector chain in Excel file')
            out.append(s)
            s = table[s]
        return out

    def read(start):
        return b''.join(sector(n) for n in chain(start, fat))

    directory = read(dir_start)
    entries = []
    for off in range(0, len(directory) - 127, 128):
        e = directory[off:off + 128]
        nlen = struct.unpack_from('<H', e, 64)[0]
        name = e[:max(nlen - 2, 0)].decode('utf-16-le', 'replace')
        entries.append((name, e[66], struct.unpack_from('<I', e, 116)[0], struct.unpack_from('<I', e, 120)[0]))
    for name, kind, start, size in entries:
        if kind == 2 and name in names:
            if size >= mini_cutoff:
                return read(start)[:size]
            ministream = read(entries[0][2])
            minifat = list(struct.unpack('<%dI' % (len(read(minifat_start)) // 4), read(minifat_start)))
            return b''.join(ministream[n * mini_sz:(n + 1) * mini_sz] for n in chain(start, minifat))[:size]
    raise DataError('No workbook inside the Excel file')


def _rk(v):
    if v & 2:
        n = struct.unpack('<i', struct.pack('<I', v))[0] >> 2
    else:
        n = struct.unpack('<d', struct.pack('<Q', (v & 0xFFFFFFFC) << 32))[0]
    return n / 100 if v & 1 else n


def _sst(segments):
    """Parse the shared string table, which may run on across CONTINUE records."""
    seg, pos = 0, 0
    buf = segments[0]

    def take(n):
        nonlocal seg, pos, buf
        out = b''
        while n > 0:
            if pos >= len(buf):
                seg, pos = seg + 1, 0
                buf = segments[seg]
            k = min(n, len(buf) - pos)
            out += buf[pos:pos + k]
            pos, n = pos + k, n - k
        return out

    def chars(cch, wide):
        nonlocal seg, pos, buf
        out = ''
        while cch > 0:
            if pos >= len(buf):
                seg, pos = seg + 1, 0
                buf = segments[seg]
                wide = buf[0] & 1   # a continued string restates its encoding
                pos = 1
            width = 2 if wide else 1
            k = min(cch, (len(buf) - pos) // width)
            raw = buf[pos:pos + k * width]
            out += raw.decode('utf-16-le' if wide else 'latin-1')
            pos, cch = pos + k * width, cch - k
        return out

    total, unique = struct.unpack('<II', take(8))
    strings = []
    for _ in range(unique):
        cch, flags = struct.unpack('<HB', take(3))
        runs = struct.unpack('<H', take(2))[0] if flags & 8 else 0
        ext = struct.unpack('<I', take(4))[0] if flags & 4 else 0
        strings.append(chars(cch, flags & 1))
        take(4 * runs + ext)
    return strings


def read_xls(data):
    """Return {sheet name: {(row, col): value}} for a BIFF8 workbook, plus the workbook's date base."""
    wb = _cfb_stream(data, ('Workbook', 'Book'))
    records, pos = [], 0
    while pos + 4 <= len(wb):
        kind, size = struct.unpack_from('<HH', wb, pos)
        records.append((pos, kind, wb[pos + 4:pos + 4 + size]))
        pos += 4 + size

    sheets, sst, date_1904 = [], [], False
    i = 0
    while i < len(records):
        _, kind, body = records[i]
        if kind == 0x0085:  # BOUNDSHEET
            cch, wide = body[6], body[7] & 1
            name = body[8:8 + cch * (2 if wide else 1)].decode('utf-16-le' if wide else 'latin-1')
            sheets.append((struct.unpack_from('<I', body, 0)[0], name))
        elif kind == 0x0022:  # DATEMODE
            date_1904 = struct.unpack_from('<H', body, 0)[0] == 1
        elif kind == 0x00FC:  # SST, then any CONTINUE records
            segments = [body]
            while i + 1 < len(records) and records[i + 1][1] == 0x003C:
                i += 1
                segments.append(records[i][2])
            sst = _sst(segments)
        elif kind == 0x000A:  # EOF of the workbook globals
            break
        i += 1

    by_offset = {rec[0]: n for n, rec in enumerate(records)}
    out = {}
    for offset, name in sheets:
        cells = {}
        j = by_offset[offset] + 1
        while j < len(records) and records[j][1] != 0x000A:
            _, kind, b = records[j]
            if kind == 0x0203:    # NUMBER
                r, c = struct.unpack_from('<HH', b, 0)
                cells[(r, c)] = struct.unpack_from('<d', b, 6)[0]
            elif kind == 0x027E:  # RK
                r, c = struct.unpack_from('<HH', b, 0)
                cells[(r, c)] = _rk(struct.unpack_from('<I', b, 6)[0])
            elif kind == 0x00BD:  # MULRK
                r, c = struct.unpack_from('<HH', b, 0)
                for k in range((len(b) - 6) // 6):
                    cells[(r, c + k)] = _rk(struct.unpack_from('<I', b, 6 + 6 * k)[0])
            elif kind == 0x00FD:  # LABELSST
                r, c = struct.unpack_from('<HH', b, 0)
                cells[(r, c)] = sst[struct.unpack_from('<I', b, 6)[0]]
            elif kind == 0x0204:  # LABEL
                r, c = struct.unpack_from('<HH', b, 0)
                cch, wide = struct.unpack_from('<H', b, 6)[0], b[8] & 1
                cells[(r, c)] = b[9:9 + cch * (2 if wide else 1)].decode('utf-16-le' if wide else 'latin-1')
            elif kind == 0x0006:  # FORMULA with a numeric result
                r, c = struct.unpack_from('<HH', b, 0)
                if b[12:14] != b'\xff\xff':
                    cells[(r, c)] = struct.unpack_from('<d', b, 6)[0]
            j += 1
        out[name] = cells
    return out, date_1904


# The sources -------------------------------------------------------------------------------------

def eia_series(freq):
    """EIA's Brent series as [(date, price)], checked against the sheet's own headings."""
    sheets, date_1904 = read_xls(fetch(EIA_XLS.format(freq)))
    cells = sheets.get('Data 1')
    if not cells or cells.get((1, 1)) != 'RBRTE' or 'Europe Brent Spot Price FOB' not in str(cells.get((2, 1))) \
            or 'Dollars per Barrel' not in str(cells.get((2, 1))):
        raise DataError('EIA file {} is not the Europe Brent spot price in dollars a barrel'.format(freq))
    base = dt.date(1904, 1, 1) if date_1904 else dt.date(1899, 12, 30)
    rows = []
    for r in sorted({r for r, _ in cells if r >= 3}):
        day, price = cells.get((r, 0)), cells.get((r, 1))
        if isinstance(day, float) and isinstance(price, float):
            rows.append((base + dt.timedelta(days=int(day)), price))
    release = None
    contents = sheets.get('Contents', {})
    for (r, c), v in contents.items():
        if v == 'Release Date:':
            release = dt.datetime.strptime(contents[(r, c + 1)], '%m/%d/%Y').date()
    return rows, release


def fred_monthly(series):
    """A monthly FRED series as {'YYYY-MM': value}."""
    text = fetch(FRED_CSV.format(series)).decode('utf-8')
    reader = csv.reader(io.StringIO(text))
    head = next(reader)
    if head[-1] != series:
        raise DataError('FRED returned {} instead of {}'.format(head, series))
    return {d[:7]: float(v) for d, v in reader if v not in ('', '.')}


def ecb_series(key):
    """An ECB Data Portal series as {period: value}, checked against its key."""
    text = fetch(ECB_CSV.format(key)).decode('utf-8')
    out = {}
    for row in csv.DictReader(io.StringIO(text)):
        if row.get('KEY') != key.replace('/', '.'):
            raise DataError('ECB returned {} instead of {}'.format(row.get('KEY'), key))
        if row['OBS_VALUE']:
            out[row['TIME_PERIOD']] = float(row['OBS_VALUE'])
    return out


# Checks --------------------------------------------------------------------------------------------

def check(ok, message):
    if not ok:
        raise DataError(message)


def check_daily(rows, today):
    check(len(rows) > 9000, 'EIA daily series is too short: {} rows'.format(len(rows)))
    check(rows[0][0] == dt.date(1987, 5, 20), 'EIA daily series should start on 20 May 1987, not {}'.format(rows[0][0]))
    check(all(a[0] < b[0] for a, b in zip(rows, rows[1:])), 'EIA daily dates are out of order')
    check(all(0 < p < 1000 for _, p in rows), 'EIA daily series has an implausible price')
    check((today - rows[-1][0]).days <= 30, 'EIA daily series is stale: latest price is for {}'.format(rows[-1][0]))


def check_monthly(series, name, today, lo, hi, lag_months):
    latest = max(series)
    check(all(lo < v < hi for v in series.values()), '{} has an implausible value'.format(name))
    y, m = map(int, latest[:7].split('-'))
    check((today.year - y) * 12 + today.month - m <= lag_months, '{} is stale: latest is {}'.format(name, latest))


# Building the files --------------------------------------------------------------------------------

def month_key(day):
    return day.strftime('%Y-%m')


def months(first, last):
    y, m = map(int, first.split('-'))
    while '{:04d}-{:02d}'.format(y, m) <= last:
        yield '{:04d}-{:02d}'.format(y, m)
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def fill_single_gaps(series, name, first):
    """Fill a month that was never published, between two that were, with their geometric midpoint.
    US CPI for October 2025 is one: BLS didn't publish it because of the federal shutdown. A longer gap stops the script."""
    filled = []
    keys = list(months(max(first, min(series)), max(series)))
    for i, key in enumerate(keys):
        if key not in series:
            check(0 < i < len(keys) - 1 and keys[i - 1] in series and keys[i + 1] in series,
                  '{} is missing {} and a month next to it'.format(name, key))
            series[key] = round(math.sqrt(series[keys[i - 1]] * series[keys[i + 1]]), 3)
            filled.append(key)
    return filled


def rate_on_or_before(rates, day):
    """The ECB rate for day, or the last one published before it (the ECB doesn't fix on TARGET holidays)."""
    for back in range(0, 8):
        key = (day - dt.timedelta(days=back)).isoformat()
        if key in rates:
            return rates[key]
    return None


# Annotations for the chart: each one's figures are found in the daily data here, never typed in by hand.
# 'on' takes the price on that day; 'max' and 'min' find the highest or lowest price between two dates.
EVENTS = [
    ('kuwait', [('on', '1990-08-02'), ('max', '1990-08-02', '1990-12-31')]),
    ('peak2008', [('max', '2008-01-01', '2008-12-31')]),
    ('crash2016', [('max', '2014-01-01', '2014-12-31'), ('min', '2014-06-01', '2016-12-31')]),
    ('covid2020', [('min', '2020-01-01', '2020-12-31')]),
    ('ukraine2022', [('on', '2022-02-24'), ('max', '2022-02-24', '2022-12-31')]),
    ('iran2026', [('max', '2026-01-01', '2026-12-31')]),
    ('record', [('max', '1987-05-20', '9999-12-31')]),  # not drawn: tells the 2008 label whether it's still the record
]


def find_events(daily):
    out = {}
    for name, facts in EVENTS:
        found = []
        for fact in facts:
            if fact[0] == 'on':
                hits = [(d, p) for d, p in daily if d.isoformat() == fact[1]]
            else:
                window = [(d, p) for d, p in daily if fact[1] <= d.isoformat() <= fact[2]]
                pick = max if fact[0] == 'max' else min
                hits = [pick(window, key=lambda t: t[1])] if window else []
            check(len(hits) == 1, 'No EIA price for the {} annotation ({})'.format(name, fact))
            found.append([hits[0][0].isoformat(), hits[0][1]])
        out[name] = found
    return out


def build(today):
    daily, release = eia_series('d')
    monthly, _ = eia_series('m')
    annual, _ = eia_series('a')
    cpi = fred_monthly('CPIAUCSL')
    hicp = ecb_series(HICP_KEY)
    fx = ecb_series(EXR_KEY)

    check_daily(daily, today)
    check(len(monthly) > 450 and len(annual) > 35, 'EIA monthly or annual series is too short')
    check_monthly(cpi, 'CPI', today, 0, 1000, 4)
    check_monthly(hicp, 'HICP', today, 0, 1000, 4)
    check(all(0.5 < v < 2.5 for v in fx.values()), 'ECB EUR/USD has an implausible rate')
    check((today - dt.date.fromisoformat(max(fx))).days <= 10, 'ECB EUR/USD is stale: latest is {}'.format(max(fx)))
    check(min(fx) == '1999-01-04', 'ECB EUR/USD should start on 4 January 1999, not {}'.format(min(fx)))
    filled = {'cpi': fill_single_gaps(cpi, 'CPI', FIRST_MONTH), 'hicp': fill_single_gaps(hicp, 'HICP', '1999-01')}

    by_month = {}
    for day, price in daily:
        by_month.setdefault(month_key(day), []).append((day, price))
    eia_month = {month_key(d): p for d, p in monthly}
    eia_year = {d.year: p for d, p in annual}

    # EIA's published monthly averages, checked loosely against its daily prices.
    # Before 2007 the daily series has gaps, so the two can differ by a dollar or so; EIA's average is the one used.
    for key, avg in eia_month.items():
        days = by_month.get(key, [])
        if len(days) >= 15:
            mean = statistics.mean(p for _, p in days)
            check(abs(mean - avg) / avg < 0.1, 'EIA monthly average for {} ({}) is far from its daily prices ({:.2f})'.format(key, avg, mean))

    last_day, last_price = daily[-1]
    last_month = month_key(last_day)
    partial_month = last_month if last_month not in eia_month else None
    rows = []
    for key in months(FIRST_MONTH, last_month):
        days = by_month.get(key)
        check(days, 'No EIA daily prices in {}'.format(key))
        avg = eia_month.get(key)
        if avg is None:
            check(key == partial_month, 'EIA has no monthly average for {}'.format(key))
            avg = statistics.mean(p for _, p in days)
        first_day, first_price = days[0]
        rate = rate_on_or_before(fx, first_day)
        rows.append([key, round(avg, 2), first_day.day, first_price, cpi.get(key), hicp.get(key),
                     rate if first_day >= dt.date(1999, 1, 1) else None])
    for row in rows:
        check(row[6] is not None or row[0] < '1999-01', 'No ECB rate on or before the first trading day of {}'.format(row[0]))

    cutoff = last_day.replace(year=last_day.year - DAILY_YEARS) if not (last_day.month == 2 and last_day.day == 29) \
        else last_day.replace(year=last_day.year - DAILY_YEARS, day=28)
    recent = [[d.isoformat(), p] for d, p in daily if d > cutoff]

    first_year = int(FIRST_MONTH[:4])
    partial_year = last_day.year if last_day.year not in eia_year else None
    years = []
    for year in range(first_year, last_day.year + 1):
        avg = eia_year.get(year)
        if avg is None:
            check(year == partial_year, 'EIA has no annual average for {}'.format(year))
            avg = statistics.mean(p for d, p in daily if d.year == year)
        years.append([year, round(avg, 2)])

    cpi_to, hicp_to = max(cpi), max(hicp)
    cpi_months = {k: v for k, v in cpi.items() if k >= FIRST_MONTH}

    oil = {
        'brent_to': last_day.isoformat(),
        'eia_release': release.isoformat() if release else None,
        'cpi_to': cpi_to,
        'hicp_to': hicp_to,
        'partial_month': partial_month,
        'partial_year': partial_year,
        'filled': filled,
        'sources': SOURCES,
        'latest': [last_day.isoformat(), last_price, rate_on_or_before(fx, last_day)],
        'monthly_cols': ['month', 'avg', 'first_day', 'first_price', 'cpi', 'hicp', 'eurusd_first'],
        'monthly': rows,
        'daily_cols': ['date', 'price'],
        'daily': recent,
        'annual_cols': ['year', 'avg'],
        'annual': years,
        'events': find_events(daily),
    }

    # For Liquid: the same annual averages, already formatted, with each year also in today's dollars
    # (the year's average price times latest CPI over the year's average CPI).
    ref = cpi[cpi_to]
    table = []
    for year, avg in years:
        year_cpi = [v for k, v in cpi_months.items() if k.startswith(str(year))]
        real = avg * ref / statistics.mean(year_cpi)
        table.append([year, '{:,.2f}'.format(avg), '{:,.2f}'.format(real)])
    # The calculator's default ($1,000 in January 2000), worked out here too, so the page can show it without JavaScript
    jan = next(r for r in rows if r[0] == '2000-01')
    barrels = 1000 / jan[3]
    example = {
        'date': '2000-01-{:02d}'.format(jan[2]),
        'price': '{:,.2f}'.format(jan[3]),
        'barrels': '{:,.2f}'.format(barrels),
        'value': '{:,.0f}'.format(barrels * last_price),
        'latest_price': '{:,.2f}'.format(last_price),
    }
    annual_file = {
        'brent_to': last_day.isoformat(),
        'cpi_to': cpi_to,
        'hicp_to': hicp_to,
        'partial_year': partial_year,
        'cpi_filled': filled['cpi'],
        'hicp_filled': filled['hicp'],
        'calculator_default': example,
        'cols': ['year', 'avg_usd', 'avg_today_usd'],
        'rows': table,
    }
    return oil, annual_file


# Writing -------------------------------------------------------------------------------------------

def dumps(obj):
    """JSON with one row per line, so a data update reads as a short diff."""
    lines = ['{']
    items = list(obj.items())
    for i, (key, value) in enumerate(items):
        comma = ',' if i < len(items) - 1 else ''
        if isinstance(value, list) and value and isinstance(value[0], list):
            rows = [json.dumps(r, separators=(',', ':'), ensure_ascii=False) for r in value]
            lines.append('{}:[\n{}\n]{}'.format(json.dumps(key), ',\n'.join(rows), comma))
        else:
            lines.append('{}:{}{}'.format(json.dumps(key), json.dumps(value, separators=(',', ':'), ensure_ascii=False), comma))
    lines.append('}')
    return '\n'.join(lines) + '\n'


def load(path):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def write_atomically(files):
    """Write every file to a temporary neighbour first, then swap them all in."""
    temps = []
    try:
        for path, text in files:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix='.tmp-', suffix='.json')
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                f.write(text)
            os.chmod(tmp, 0o644)
            temps.append((tmp, path))
        for tmp, path in temps:
            os.replace(tmp, path)
    finally:
        for tmp, _ in temps:
            if os.path.exists(tmp):
                os.remove(tmp)


def main():
    today = dt.datetime.now(dt.timezone.utc).date()
    try:
        oil, annual = build(today)
    except DataError as e:
        print('Oil data NOT updated: {}'.format(e), file=sys.stderr)
        print('The existing files are unchanged.', file=sys.stderr)
        return 1

    old_oil, old_annual = load(OIL_JSON), load(ANNUAL_JSON)
    strip = lambda d: {k: v for k, v in (d or {}).items() if k != 'updated'}
    if old_oil and old_annual and strip(old_oil) == oil and strip(old_annual) == annual:
        print('No change: Brent data still runs to {}.'.format(oil['brent_to']))
        return 0

    # 'updated' is the day this script last found new data, so an unchanged run leaves the files byte for byte alone.
    oil = dict({'updated': today.isoformat()}, **oil)
    annual = dict({'updated': today.isoformat()}, **annual)
    write_atomically([(OIL_JSON, dumps(oil)), (ANNUAL_JSON, dumps(annual))])
    for path in (OIL_JSON, ANNUAL_JSON):
        print('Wrote {} ({:,} bytes)'.format(os.path.relpath(path, ROOT), os.path.getsize(path)))
    print('Brent to {}, CPI to {}, HICP to {}, EUR/USD to {}.'.format(oil['brent_to'], oil['cpi_to'], oil['hicp_to'], oil['latest'][0]))
    return 0


if __name__ == '__main__':
    sys.exit(main())
