"""The inflation-by-country updater, on synthetic figures only: no downloads.
Run from the repository root: python3 -m unittest discover -s tests -p 'test_*.py'"""
import contextlib
import datetime as dt
import importlib.util
import io
import json
import os
import pathlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('inflation', pathlib.Path(__file__).parents[1] / 'scripts/update-inflation-data.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

TODAY = dt.date(2026, 11, 14)
UPDATED = '2026-11-04'
CODES = [area[0] for area in m.AREAS]
AT_EUROSTAT = {area[0]: area[1] for area in m.AREAS}
AT_ECB = {area[0]: area[2] for area in m.AREAS}


def series(base, first='1999-01', last='2026-09', drop=()):
    """A flat series: every month the same rate, so a test can say exactly where an area ranks."""
    return {k: base for k in m.months(first, last) if k not in drop}


def downloads(headline=None, core=None):
    """What build() hands to assemble(): Eurostat's answer and the ECB's identical copy. Areas rank in AREAS order,
    highest first, unless a test replaces one: headline={'RO': {...}}."""
    tables = {}
    for measure, given, first, top in (('headline', headline or {}, '1999-01', 9.0), ('core', core or {}, '2001-12', 5.0)):
        tables[measure] = {code: given.get(code, series(round(top - i / 10, 1), first)) for i, code in enumerate(CODES)}
    eurostat = {measure: ({AT_EUROSTAT[code]: dict(s) for code, s in table.items()}, {AT_EUROSTAT[code]: {} for code in table})
                for measure, table in tables.items()}
    ecb = {measure: {AT_ECB[code]: dict(s) for code, s in table.items()} for measure, table in tables.items()}
    return eurostat, ecb


def assemble(eurostat, ecb, today=TODAY):
    return m.assemble(eurostat, ecb, UPDATED, today)


def jsonstat(category='TOTAL', unit='RCH_A', ids=None, label=None):
    """Eurostat's answer for two areas and three months. Romania has no figure for the last month."""
    return json.dumps({
        'updated': '2026-11-04T11:00:00+0100',
        'id': ids or ['freq', 'unit', 'coicop18', 'geo', 'time'],
        'size': [1, 1, 1, 2, 3],
        'value': {'0': 3.2, '1': 3.8, '2': 4.0, '3': 6.3, '4': 6.5},
        'status': {'2': 'e'},
        'dimension': {
            'freq': {'category': {'index': {'M': 0}}},
            'unit': {'category': {'index': {unit: 0}}},
            'coicop18': {'category': {'index': {category: 0}}},
            'geo': {'category': {'index': {'EA': 0, 'RO': 1}, 'label': {'EA': label or 'Euro area (EA11-1999, EA20-2023, EA21-2026)', 'RO': 'Romania'}}},
            'time': {'category': {'index': {'2026-08': 0, '2026-09': 1, '2026-10': 2}}},
        },
    })


class ReadEurostatTests(unittest.TestCase):
    def test_values_flags_and_the_date_updated(self):
        values, flags, updated, labels = m.read_eurostat(jsonstat(), 'TOTAL')
        self.assertEqual(values, {'EA': {'2026-08': 3.2, '2026-09': 3.8, '2026-10': 4.0}, 'RO': {'2026-08': 6.3, '2026-09': 6.5}})
        self.assertEqual(flags['EA'], {'2026-08': '', '2026-09': '', '2026-10': 'e'})
        self.assertEqual(updated, '2026-11-04')
        self.assertIn('EA21-2026', labels['EA'])

    def test_another_unit_category_or_layout_is_refused(self):
        with self.assertRaisesRegex(m.DataError, 'unit'):
            m.read_eurostat(jsonstat(unit='I25'), 'TOTAL')
        with self.assertRaisesRegex(m.DataError, 'coicop18'):
            m.read_eurostat(jsonstat(category='TOT_X_NRG_FOOD'), 'TOTAL')
        with self.assertRaisesRegex(m.DataError, 'layout'):
            m.read_eurostat(jsonstat(ids=['freq', 'unit', 'coicop', 'geo', 'time']), 'TOTAL')

    def test_the_member_count_must_match_the_euro_flags(self):
        _, _, _, labels = m.read_eurostat(jsonstat(), 'TOTAL')
        m.check_members(labels)
        with self.assertRaisesRegex(m.DataError, '22 euro area members'):
            m.check_members({'EA': 'Euro area (EA21-2026, EA22-2028)'})
        m.check_members({'EA': 'Euro area'})   # a reworded label is not a fault


class ReadEcbTests(unittest.TestCase):
    HEAD = 'KEY,FREQ,REF_AREA,ADJUSTMENT,ICP_ITEM,DATA_PROVIDER,ICP_SUFFIX,TIME_PERIOD,OBS_VALUE\n'

    def test_rows_by_area(self):
        text = self.HEAD + ('HICP.M.U2.N.000000.4D0.ANR,M,U2,N,000000,4D0,ANR,2026-09,3.8\n'
                            'HICP.M.GR.N.000000.4D0.ANR,M,GR,N,000000,4D0,ANR,2026-09,5.1\n'
                            'HICP.M.GR.N.000000.4D0.ANR,M,GR,N,000000,4D0,ANR,2026-10,\n')
        self.assertEqual(m.read_ecb(text, '000000'), {'U2': {'2026-09': 3.8}, 'GR': {'2026-09': 5.1}})

    def test_another_series_is_refused(self):
        text = self.HEAD + 'HICP.M.U2.N.000000.4D0.INX,M,U2,N,000000,4D0,INX,2026-09,104.31\n'
        with self.assertRaisesRegex(m.DataError, 'ECB returned'):
            m.read_ecb(text, '000000')
        with self.assertRaisesRegex(m.DataError, 'ECB returned'):
            m.read_ecb(self.HEAD + 'HICP.M.U2.N.000000.4D0.ANR,M,U2,N,000000,4D0,ANR,2026-09,3.8\n', 'XEF000')
        with self.assertRaisesRegex(m.DataError, 'nothing'):
            m.read_ecb(self.HEAD, '000000')


class AssembleTests(unittest.TestCase):
    def test_both_files_hold_every_month_for_every_area(self):
        page, script, _ = assemble(*downloads())
        for out in (page, script):
            self.assertEqual(out['cols'], ['month'] + CODES)
            self.assertEqual((out['from'], out['to'], out['months']), ('1999-01', '2026-09', 333))
            self.assertEqual((out['headline'][0][0], out['headline'][-1][0], len(out['headline'])), ('1999-01', '2026-09', 333))
            self.assertTrue(all(len(row) == len(CODES) + 1 for row in out['headline'] + out['core']))
        self.assertEqual(page['headline'], script['headline'])
        self.assertEqual(page['core'], script['core'])
        self.assertEqual(len(page['areas']), 28)
        self.assertEqual(sum(1 for area in page['areas'] if area[2]), 21)
        self.assertEqual([area[0] for area in page['areas'] if area[2] is False], ['CZ', 'DK', 'HU', 'PL', 'RO', 'SE'])

    def test_core_is_empty_before_it_starts(self):
        page, _, _ = assemble(*downloads())
        col = page['cols'].index('RO')
        by_month = {row[0]: row[col] for row in page['core']}
        self.assertIsNone(by_month['2001-11'])
        self.assertIsNotNone(by_month['2001-12'])
        self.assertEqual(page['core_from']['RO'], '2001-12')

    def test_the_endpoint_is_the_last_month_every_area_has(self):
        # The flash estimate: euro members a month ahead of the six countries outside the euro
        ahead = {area[0]: series(3.0, last='2026-10') for area in m.AREAS if area[4] is not False}
        page, script, _ = assemble(*downloads(headline=ahead))
        self.assertEqual((page['to'], script['to']), ('2026-09', '2026-09'))
        self.assertEqual(page['headline'][-1][0], '2026-09')
        # Core a month behind holds the headline figures back too, so one month is ranked on both
        page, _, _ = assemble(*downloads(core={'SE': series(1.0, '2001-12', '2026-08')}))
        self.assertEqual(page['to'], '2026-08')

    def test_a_gap_stops_the_script_instead_of_being_filled(self):
        with self.assertRaisesRegex(m.DataError, 'France headline inflation is missing 2020-03'):
            assemble(*downloads(headline={'FR': series(3.0, drop=('2020-03',))}))
        with self.assertRaisesRegex(m.DataError, 'Romania core inflation is missing 2010-06'):
            assemble(*downloads(core={'RO': series(3.0, '2001-12', drop=('2010-06',))}))

    def test_a_series_that_starts_too_late_stops_the_script(self):
        with self.assertRaisesRegex(m.DataError, 'Croatia headline inflation starts too late: 1999-02'):
            assemble(*downloads(headline={'HR': series(3.0, '1999-02')}))
        with self.assertRaisesRegex(m.DataError, 'Spain core inflation starts too late: 2002-01'):
            assemble(*downloads(core={'ES': series(3.0, '2002-01')}))

    def test_stale_or_implausible_figures_stop_the_script(self):
        with self.assertRaisesRegex(m.DataError, 'stale'):
            assemble(*downloads(), today=dt.date(2027, 3, 1))
        wild = series(3.0)
        wild['2015-05'] = 140.0
        with self.assertRaisesRegex(m.DataError, 'implausible'):
            assemble(*downloads(headline={'BG': wild}))

    def test_an_unknown_flag_stops_the_script(self):
        eurostat, ecb = downloads()
        eurostat['headline'][1]['IT']['2020-01'] = 'u'
        with self.assertRaisesRegex(m.DataError, "Unexpected flag 'u' on Italy headline"):
            assemble(eurostat, ecb)

    def test_the_ecb_copy_may_differ_by_one_rounding_step_only(self):
        eurostat, ecb = downloads()
        ecb['headline']['GR']['2020-08'] = round(ecb['headline']['GR']['2020-08'] - 0.1, 1)
        _, _, (compared, differing) = assemble(eurostat, ecb)
        self.assertEqual(differing, 1)
        self.assertEqual(compared, 28 * 333 + 28 * 298)
        ecb['headline']['GR']['2020-08'] = round(ecb['headline']['GR']['2020-08'] - 0.1, 1)
        with self.assertRaisesRegex(m.DataError, "The ECB's Greece headline inflation for 2020-08"):
            assemble(eurostat, ecb)

    def test_too_many_small_differences_stop_the_script(self):
        eurostat, ecb = downloads()
        for code in ('U2', 'DE', 'FR'):
            ecb['headline'][code] = {k: round(v + 0.1, 1) for k, v in ecb['headline'][code].items()}
        with self.assertRaisesRegex(m.DataError, 'figures differ'):
            assemble(eurostat, ecb)

    def test_the_ecb_copy_must_reach_the_same_month(self):
        eurostat, ecb = downloads()
        del ecb['core']['PL']['2026-09']
        with self.assertRaisesRegex(m.DataError, "The ECB's copy of Poland core inflation doesn't reach 2026-09"):
            assemble(eurostat, ecb)
        eurostat, ecb = downloads()
        del ecb['headline']['U2']
        with self.assertRaisesRegex(m.DataError, "copy of Euro area headline"):
            assemble(eurostat, ecb)

    def test_the_ranking_runs_highest_first_with_the_euro_area_in_place(self):
        headline = {'EA': series(3.8), 'RO': series(6.5), 'IE': series(3.8), 'AT': series(3.8), 'SE': series(1.0), 'HU': series(-0.4)}
        core = {'RO': series(7.0, '2001-12'), 'EA': series(2.5, '2000-12')}
        page, _, _ = assemble(*downloads(headline=headline, core=core))
        rows = {row[0]: row for row in page['ranking']}
        order = [row[0] for row in page['ranking']]
        self.assertEqual(len(order), 28)
        self.assertEqual([float(row[3]) for row in page['ranking']], sorted((float(row[3]) for row in page['ranking']), reverse=True))
        # A tie: the euro area first, then the countries by name
        self.assertEqual(order[order.index('EA'):order.index('EA') + 3], ['EA', 'AT', 'IE'])
        self.assertEqual(rows['RO'], ['RO', 'Romania', False, '6.5', '7.0', '+2.7'])
        self.assertEqual(rows['EA'], ['EA', 'Euro area', None, '3.8', '2.5', ''])
        self.assertEqual(rows['IE'][5], '0.0')
        self.assertEqual(rows['SE'][5], '-2.8')
        self.assertEqual(rows['HU'][3:6:2], ['-0.4', '-4.2'])
        self.assertEqual(page['euro_area'], {'headline': '3.8', 'core': '2.5'})
        self.assertEqual(page['lowest'], ['HU', 'Hungary', '-0.4'])
        self.assertEqual(page['above'], sum(1 for row in page['ranking'] if row[0] != 'EA' and float(row[3]) > 3.8))
        self.assertEqual(page['rank_scale'], [-1, 9])

    def test_the_page_opens_on_the_country_with_the_highest_rate(self):
        page, _, _ = assemble(*downloads(headline={'EA': series(9.9), 'LT': series(9.5)}))
        self.assertEqual(page['ranking'][0][0], 'EA')
        self.assertEqual(page['default'], 'LT')
        self.assertEqual(page['highest'], ['LT', 'Lithuania', '9.5'])

    def test_peaks_and_chart_scales(self):
        romania = series(4.0)
        # The ten-year view starts 120 months before the last one, in September 2016: the dip is its first month
        romania.update({'2000-01': 56.7, '2016-09': -2.9, '2022-11': 14.6, '2023-01': 14.6})
        estonia = series(3.0)
        estonia.update({'2022-06': 25.2, '2022-08': 25.2})
        page, _, _ = assemble(*downloads(headline={'EA': series(2.0), 'RO': romania, 'EE': estonia}))
        self.assertEqual(page['peaks']['RO'], ['2000-01', '56.7'])
        self.assertEqual(page['peaks']['EE'], ['2022-08', '25.2'])   # reached twice: the later month
        self.assertEqual(page['scales']['RO'], {'5y': [0, 15, 5], '10y': [-3, 15, 5], 'all': [-3, 60, 10]})
        self.assertEqual(page['scales']['EA']['all'], [0, 2, 1])
        self.assertEqual(page['scales']['EE'], {'5y': [0, 30, 5], '10y': [0, 30, 5], 'all': [0, 30, 5]})
        romania['2016-08'], romania['2016-09'] = -2.9, 4.0   # a month earlier, it is outside that view
        page, _, _ = assemble(*downloads(headline={'EA': series(2.0), 'RO': romania}))
        self.assertEqual(page['scales']['RO'], {'5y': [0, 15, 5], '10y': [0, 15, 5], 'all': [-3, 60, 10]})

    def test_flags_become_stretches_of_months(self):
        eurostat, ecb = downloads()
        for k in m.months('1999-01', '2016-12'):
            eurostat['headline'][1]['FR'][k] = 'e'
        eurostat['headline'][1]['MT'].update({'2006-01': 'e', '2006-02': 'e', '2008-05': 'p'})
        for k in m.months('2001-12', '2017-12'):
            eurostat['core'][1]['RO'][k] = 'b' if k == '2017-01' else 'd'
        eurostat['core'][1]['RO']['2018-01'] = 'b'
        page, script, _ = assemble(eurostat, ecb)
        self.assertEqual(page['estimated'], [
            ['headline', 'FR', 'estimated', '1999-01', '2016-12'],
            ['headline', 'MT', 'estimated', '2006-01', '2006-02'],
            ['headline', 'MT', 'provisional', '2008-05', '2008-05'],
        ])
        self.assertEqual(page['core_differs'], ['2001-12', '2017-12'])
        self.assertEqual(page['core_breaks'], ['2017-01', '2018-01'])
        self.assertNotIn('estimated', script)


class HelperTests(unittest.TestCase):
    def test_chart_scale(self):
        self.assertEqual(m.chart_scale([0.4, 10.6]), [0, 12, 2])
        self.assertEqual(m.chart_scale([-0.3, 10.6]), [-1, 12, 2])
        self.assertEqual(m.chart_scale([-4.4, 22.0]), [-5, 25, 5])
        self.assertEqual(m.chart_scale([1.1, 5.9]), [0, 6, 1])
        self.assertEqual(m.chart_scale([6.0, 6.0]), [0, 6, 1])
        self.assertEqual(m.chart_scale([0.0, 0.0]), [0, 1, 1])
        self.assertEqual(m.chart_scale([-2.0, -0.5]), [-2, 1, 1])
        self.assertEqual(m.chart_scale([3.0, 547.6]), [0, 550, 50])

    def test_signed_points_and_windows(self):
        self.assertEqual([m.signed(v) for v in (2.7, -0.4, 0.0, -0.04, 0.04)], ['+2.7', '-0.4', '0.0', '0.0', '0.0'])
        self.assertEqual(m.pct(-0.04), '0.0')
        self.assertEqual([m.window(333, back) for _, back in m.RANGES], [272, 212, 0])
        self.assertEqual(m.window(40, 120), 0)


class MainTests(unittest.TestCase):
    """main() with build() replaced and both files in a temporary folder."""

    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.saved = (m.build, m.PAGE_JSON, m.SCRIPT_JSON)
        self.addCleanup(lambda: setattr(m, 'build', self.saved[0]) or setattr(m, 'PAGE_JSON', self.saved[1]) or setattr(m, 'SCRIPT_JSON', self.saved[2]))
        m.PAGE_JSON = os.path.join(self.folder.name, '_data', 'inflation_by_country.json')
        m.SCRIPT_JSON = os.path.join(self.folder.name, 'assets', 'data', 'inflation-by-country.json')

    def run_main(self, build):
        m.build = build
        with contextlib.redirect_stdout(io.StringIO()) as out, contextlib.redirect_stderr(io.StringIO()) as err:
            code = m.main()
        return code, out.getvalue() + err.getvalue()

    def read(self):
        return [pathlib.Path(p).read_bytes() for p in (m.PAGE_JSON, m.SCRIPT_JSON)]

    def test_writes_once_then_leaves_unchanged_data_alone(self):
        good = lambda today: assemble(*downloads())
        code, said = self.run_main(good)
        self.assertEqual(code, 0)
        self.assertIn('Wrote', said)
        first = self.read()
        page = json.loads(first[0])
        self.assertEqual(page['updated'], dt.datetime.now(dt.timezone.utc).date().isoformat())
        self.assertEqual(json.loads(first[1])['updated'], page['updated'])
        # An older 'updated' proves the second run rewrote nothing
        for path in (m.PAGE_JSON, m.SCRIPT_JSON):
            text = pathlib.Path(path).read_text(encoding='utf-8').replace(page['updated'], '2026-01-01', 1)
            pathlib.Path(path).write_text(text, encoding='utf-8')
        before = self.read()
        code, said = self.run_main(good)
        self.assertEqual(code, 0)
        self.assertIn('No change', said)
        self.assertEqual(self.read(), before)

    def test_a_failed_check_leaves_both_files_exactly_as_they_were(self):
        self.run_main(lambda today: assemble(*downloads()))
        before = self.read()

        def broken(today):
            return assemble(*downloads(headline={'FR': series(3.0, drop=('2020-03',))}))
        code, said = self.run_main(broken)
        self.assertEqual(code, 1)
        self.assertIn('NOT updated', said)
        self.assertEqual(self.read(), before)
        self.assertEqual(sorted(os.listdir(os.path.dirname(m.PAGE_JSON))), ['inflation_by_country.json'])

    def test_new_data_rewrites_both_files(self):
        self.run_main(lambda today: assemble(*downloads()))
        code, _ = self.run_main(lambda today: assemble(*downloads(headline={'RO': series(9.9)})))
        self.assertEqual(code, 0)
        page, script = (json.loads(b) for b in self.read())
        self.assertEqual(page['highest'], ['RO', 'Romania', '9.9'])
        self.assertEqual(script['headline'][-1][script['cols'].index('RO')], 9.9)


class StoredFileTests(unittest.TestCase):
    """The files in the repository, as the last real run left them."""

    def test_the_two_files_agree(self):
        root = pathlib.Path(__file__).parents[1]
        page = json.loads((root / '_data/inflation_by_country.json').read_text(encoding='utf-8'))
        script = json.loads((root / 'assets/data/inflation-by-country.json').read_text(encoding='utf-8'))
        for key in ('updated', 'source_updated', 'from', 'to', 'months', 'areas', 'core_from', 'cols', 'headline', 'core'):
            self.assertEqual(page[key], script[key], key)
        self.assertEqual(len(page['ranking']), 28)
        self.assertEqual(page['headline'][-1][0], page['to'])
        self.assertEqual(len(page['headline']), page['months'])
        col = page['cols'].index(page['default'])
        self.assertEqual(m.pct(page['headline'][-1][col]), page['highest'][2])


if __name__ == '__main__':
    unittest.main()
