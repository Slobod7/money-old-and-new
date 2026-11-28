"""Run: python3 -m unittest tests/test_uk_fuel_updater.py. The UK fuel prices script, on a small CSV made here."""
import datetime as dt
import importlib.util
import json
import pathlib
import unittest

spec = importlib.util.spec_from_file_location('ukfuel', pathlib.Path(__file__).parents[1] / 'scripts/update-uk-fuel-data.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

HEAD = ('﻿Date,ULSP (Ultra low sulphur unleaded petrol) Pump price in pence/litre,'
        'ULSD (Ultra low sulphur diesel) Pump price in pence/litre,ULSP Duty rate in pence/litre,'
        'ULSD Duty rate in pence/litre,ULSP VAT percentage rate,ULSD VAT percentage rate\n')
EU_WEEK = dt.date(2026, 11, 23)
RATES = {'2026-11-20': 0.835, '2026-11-23': 0.83673, '2026-11-16': 0.84}


def csv_text(rows):
    return HEAD + ''.join('{},{},{},52.95,52.95,20,20\n'.format(d, p, s) for d, p, s in rows)


GOOD = csv_text([('09/11/2026', '160.10', '191.00'), ('16/11/2026', '161.00', '192.50'), ('23/11/2026', '161.96', '193.29')])


def attachments(*items):
    return json.dumps({'details': {'attachments': list(items)}})


class Url(unittest.TestCase):
    CSV = {'title': 'Weekly road fuel prices (CSV) 2018 to 2026', 'content_type': 'text/csv',
           'url': 'https://assets.publishing.service.gov.uk/media/abc/weekly_road_fuel_prices_241126.csv'}

    def test_picks_the_2018_csv(self):
        old = dict(self.CSV, title='Weekly road fuel prices (CSV) 2003 to 2017', url='https://assets.publishing.service.gov.uk/old.csv')
        xlsx = dict(self.CSV, content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', url='https://assets.publishing.service.gov.uk/x.xlsx')
        self.assertEqual(m.csv_url(attachments(old, self.CSV, xlsx)), self.CSV['url'])

    def test_refuses_none_two_or_another_host(self):
        for content in (attachments(), attachments(self.CSV, self.CSV), attachments(dict(self.CSV, url='https://example.com/a.csv')),
                        '{"details": {}}', 'not json'):
            with self.assertRaises(m.DataError):
                m.csv_url(content)


class Build(unittest.TestCase):
    def test_same_week(self):
        out = m.build(GOOD, RATES, EU_WEEK)
        self.assertEqual(out['week'], '2026-11-23')
        self.assertEqual(out['eu_week'], '2026-11-23')
        self.assertEqual(out['gbp_per_eur'], 0.83673)
        self.assertEqual(out['petrol'], {'pence': '161.96', 'per1000': 1619.6, 'eur': '1.936'})
        self.assertEqual(out['diesel'], {'pence': '193.29', 'per1000': 1932.9, 'eur': '2.310'})
        self.assertIn('Open Government Licence v3.0', out['sources']['prices'])

    def test_uk_a_week_behind(self):
        text = csv_text([('09/11/2026', '160.10', '191.00'), ('16/11/2026', '161.00', '192.50')])
        out = m.build(text, RATES, EU_WEEK)
        self.assertEqual(out['week'], '2026-11-16')
        self.assertEqual(out['gbp_per_eur'], 0.84)
        self.assertEqual(out['petrol']['eur'], '{:.3f}'.format(1.61 / 0.84))

    def test_a_later_uk_week_is_ignored(self):
        text = GOOD + '30/11/2026,150.00,180.00,52.95,52.95,20,20\n'
        self.assertEqual(m.build(text, RATES, EU_WEEK)['week'], '2026-11-23')

    def test_rate_from_the_last_day_before(self):
        out = m.build(GOOD, {'2026-11-20': 0.835}, EU_WEEK)
        self.assertEqual(out['gbp_per_eur'], 0.835)

    def test_a_week_with_a_gap_is_skipped_not_filled(self):
        text = csv_text([('16/11/2026', '161.00', '192.50'), ('23/11/2026', '', '193.29')])
        self.assertEqual(m.build(text, RATES, EU_WEEK)['week'], '2026-11-16')

    def test_refusals(self):
        bad = {
            'too old': (csv_text([('02/11/2026', '160', '190')]), RATES),
            'no week before': (csv_text([('30/11/2026', '160', '190')]), RATES),
            'not a Monday': (csv_text([('22/11/2026', '160', '190')]), RATES),
            'pence typo': (csv_text([('23/11/2026', '1619.6', '193.29')]), RATES),
            'pounds not pence': (csv_text([('23/11/2026', '1.62', '193.29')]), RATES),
            'no rate': (GOOD, {}),
            'rate upside down': (GOOD, {'2026-11-23': 1.195}),
            'empty': (HEAD, RATES),
            'columns moved': (GOOD.replace('ULSD (Ultra', 'Diesel (Ultra'), RATES),
            'date unreadable': (csv_text([('2026-11-23', '160', '190')]), RATES),
        }
        for name, (text, rates) in bad.items():
            with self.subTest(name), self.assertRaises(m.DataError):
                m.build(text, rates, EU_WEEK)


class RealFile(unittest.TestCase):
    """The data file in the repository matches the EU week and reads as the calculator expects."""

    def test_committed_file(self):
        root = pathlib.Path(__file__).parents[1]
        uk = json.loads((root / '_data/uk_fuel_prices.json').read_text())
        eu = json.loads((root / '_data/fuel_prices.json').read_text())
        self.assertEqual(uk['eu_week'], eu['week'])
        self.assertLessEqual((dt.date.fromisoformat(uk['eu_week']) - dt.date.fromisoformat(uk['week'])).days, m.MAX_GAP_DAYS)
        for fuel in ('petrol', 'diesel'):
            pence = float(uk[fuel]['pence'])
            self.assertAlmostEqual(uk[fuel]['per1000'], round(pence * 10, 1))
            self.assertAlmostEqual(float(uk[fuel]['eur']), pence / 100 / uk['gbp_per_eur'], places=3)


if __name__ == '__main__':
    unittest.main()
