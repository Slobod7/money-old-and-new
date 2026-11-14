"""Run: python3 -m unittest tests/test_fuel_updater.py. The fuel prices script, on a small workbook made here."""
import datetime as dt
import importlib.util
import io
import pathlib
import unittest
import zipfile
from xml.sax.saxutils import escape

spec = importlib.util.spec_from_file_location('fuel', pathlib.Path(__file__).parents[1] / 'scripts/update-fuel-data.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

LATEST = dt.date(2026, 11, 9)
TODAY = dt.date(2026, 11, 14)
CODES = ['EU'] + sorted(m.COUNTRIES)


def letters(i):
    out = ''
    i += 1
    while i:
        i, r = divmod(i - 1, 26)
        out = chr(65 + r) + out
    return out


def xlsx(sheets):
    """A minimal .xlsx: {sheet name: rows of cells}. Text goes in as inline strings, None leaves the cell out."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w') as z:
        ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
        z.writestr('xl/workbook.xml', '<workbook {}><sheets>{}</sheets></workbook>'.format(ns, ''.join(
            '<sheet name="{}" sheetId="{}" r:id="rId{}"/>'.format(escape(name), i + 1, i + 1) for i, name in enumerate(sheets))))
        z.writestr('xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{}</Relationships>'.format(''.join(
            '<Relationship Id="rId{}" Target="worksheets/sheet{}.xml"/>'.format(i + 1, i + 1) for i in range(len(sheets)))))
        for i, rows in enumerate(sheets.values()):
            body = []
            for r, row in enumerate(rows):
                cells = []
                for c, v in enumerate(row):
                    ref = '{}{}'.format(letters(c), r + 1)
                    if isinstance(v, str):
                        cells.append('<c r="{}" t="inlineStr"><is><t>{}</t></is></c>'.format(ref, escape(v)))
                    elif v is not None:
                        cells.append('<c r="{}"><v>{}</v></c>'.format(ref, v))
                body.append('<row r="{}">{}</row>'.format(r + 1, ''.join(cells)))
            z.writestr('xl/worksheets/sheet{}.xml'.format(i + 1), '<worksheet {}><sheetData>{}</sheetData></worksheet>'.format(ns, ''.join(body)))
    return buf.getvalue()


def price(kind, fuel, place, back):
    """The made-up price of a fuel in the place at index `place`, `back` weeks before the latest."""
    if kind == 'with':
        return (1800 if fuel == 'petrol' else 1900) + 10 * place - (2 if fuel == 'petrol' else 3) * back
    return (900 if fuel == 'petrol' else 1000) + 4 * place - (1 if fuel == 'petrol' else 2) * back


def workbook(weeks=110, change=None, drop_weeks=()):
    """Both price sheets, newest week first. change(kind, code, fuel, back, value) can return another value, or None for a gap."""
    sheets = {}
    for kind, name in m.SHEETS.items():
        head, units = ['Consumer prices'], ['Date']
        for code in CODES:
            head += [m.COLUMNS[kind].format(code, m.FUELS['petrol']), m.COLUMNS[kind].format(code, m.FUELS['diesel'])]
            units += ['1000 l', '1000 l']
        rows = [head, units]
        for back in range(weeks):
            if back in drop_weeks:
                continue
            row = [(LATEST - dt.timedelta(weeks=back) - dt.date(1899, 12, 30)).days]
            for place, code in enumerate(CODES):
                for fuel in ('petrol', 'diesel'):
                    v = price(kind, fuel, place, back) + 0.25   # a fraction, to be rounded away
                    row.append(change(kind, code, fuel, back, v) if change else v)
            rows.append(row)
        rows.append([None, 'Disclaimer: a note under the table'])
        sheets[name] = rows
    return xlsx(sheets)


class Helpers(unittest.TestCase):
    def test_dates_and_formats(self):
        self.assertEqual(m.excel_day(46335.0), LATEST)
        self.assertEqual(m.euros(1877), '1.877')
        self.assertEqual([m.cents(v) for v in (-52, 0, 4, 133)], ['−5.2', '0.0', '+0.4', '+13.3'])
        self.assertEqual(m.money(1877), '93.85')

    def test_classes(self):
        breaks = [1500, 1750, 2000, 2250]
        self.assertEqual([m.price_class(v, breaks) for v in (1499, 1500, 1749, 2000, 2250, 3000)], [0, 1, 1, 3, 4, 4])
        change = [-100, -10, 10, 100]
        self.assertEqual([m.change_class(v, change) for v in (-250, -100, -99, -11, -10, 0, 10, 11, 99, 100)], [0, 0, 1, 1, 2, 2, 2, 3, 3, 4])

    def test_scales(self):
        self.assertEqual(m.price_scale([1340, 2391]), [1500, 1750, 2000, 2250])
        self.assertEqual(m.price_scale([1700, 1790]), [1750, 1800, 1850, 1900])
        self.assertEqual(m.change_scale([-250, 30]), [-100, -10, 10, 100])
        self.assertEqual(m.change_scale([-12, 8]), [-20, -10, 10, 20])
        self.assertEqual(m.change_scale([]), [-20, -10, 10, 20])


class Build(unittest.TestCase):
    def test_latest_week(self):
        page, history = m.build(workbook(), TODAY)
        self.assertEqual((page['week'], page['compared_with'], page['countries'], page['missing']), ('2026-11-09', '2026-10-12', 27, []))
        self.assertEqual([r['code'] for r in page['rows'][:3]], sorted(m.COUNTRIES)[:3])   # cheapest petrol first
        at = page['rows'][0]   # Austria is the place at index 1
        self.assertEqual(at['petrol'], {'price': '1.810', 'pretax': '0.904', 'tax': '0.906', 'share': 50, 'fill': '90.50', 'price_class': at['petrol']['price_class'],
                                        'change': '+0.8', 'pretax_change': '+0.4', 'tax_change': '+0.4', 'change_class': 2, 'vs_eu': '+1.0'})
        self.assertEqual(at['diesel']['change'], '+1.2')
        self.assertEqual(page['eu']['petrol']['price'], '1.800')
        self.assertNotIn('vs_eu', page['eu']['petrol'])
        self.assertEqual((page['cheapest']['petrol']['code'], page['dearest']['petrol']['code']), (sorted(m.COUNTRIES)[0], sorted(m.COUNTRIES)[-1]))
        self.assertEqual(len(page['legend']['petrol']['price']), m.CLASSES)

    def test_parts_add_up(self):
        page, _ = m.build(workbook(), TODAY)
        thousandths = lambda text: int(round(float(text) * 1000))
        for row in page['rows']:
            for fuel in m.FUELS:
                f = row[fuel]
                self.assertEqual(thousandths(f['pretax']) + thousandths(f['tax']), thousandths(f['price']))

    def test_history(self):
        _, history = m.build(workbook(drop_weeks=(30,)), TODAY)
        self.assertEqual((history['weeks'], history['first_week']), (105, '2024-11-11'))
        eu = history['series'][0]
        self.assertEqual((eu['code'], len(eu['p']), eu['p'][-1], eu['p0'][-1], eu['d'][-1]), ('EU', 105, 1800, 900, 1900))
        self.assertIsNone(eu['p'][104 - 30])    # a week the bulletin skipped is a gap, not a guess
        self.assertEqual(eu['p'][104 - 29], 1800 - 2 * 29)
        self.assertEqual([s['name'] for s in history['series'][1:3]], ['Austria', 'Belgium'])

    def test_repeats(self):
        same = lambda kind, code, fuel, back, v: price(kind, fuel, CODES.index(code), 1) if code == 'FR' and back == 0 else v
        page, _ = m.build(workbook(change=same), TODAY)
        self.assertEqual([r['code'] for r in page['rows'] if r.get('repeats')], ['FR'])

    def test_a_country_without_a_figure(self):
        gap = lambda kind, code, fuel, back, v: None if (code, fuel, back, kind) == ('ES', 'diesel', 0, 'with') else v
        page, history = m.build(workbook(change=gap), TODAY)
        spain = [r for r in page['rows'] if r['code'] == 'ES'][0]
        self.assertIsNone(spain['diesel'])
        self.assertEqual(spain['petrol']['price'][:2], '1.')
        self.assertEqual(page['missing'], ['Spain'])
        self.assertIsNone([s for s in history['series'] if s['code'] == 'ES'][0]['d0'][-1])   # half a pair is no pair

    def test_refuses_bad_files(self):
        with self.assertRaises(m.DataError):
            m.build(workbook(), TODAY + dt.timedelta(days=40))   # stale
        with self.assertRaises(m.DataError):
            m.build(workbook(weeks=60), TODAY)                   # too little history
        with self.assertRaises(m.DataError):
            m.build(workbook(change=lambda kind, code, fuel, back, v: None if code == 'EU' and back == 0 else v), TODAY)
        with self.assertRaises(m.DataError):
            m.build(workbook(change=lambda kind, code, fuel, back, v: None if code in ('AT', 'BE', 'BG', 'CY') and back == 0 else v), TODAY)
        with self.assertRaises(m.DataError):
            m.build(workbook(change=lambda kind, code, fuel, back, v: 50 if kind == 'with' and code == 'DE' and back == 0 else v), TODAY)   # tax can't be negative
        with self.assertRaises(m.DataError):
            m.build(b'not a workbook', TODAY)
        with self.assertRaises(m.DataError):
            m.build(xlsx({'Prices with taxes': [['x']]}), TODAY)   # a sheet is missing


if __name__ == '__main__':
    unittest.main()
