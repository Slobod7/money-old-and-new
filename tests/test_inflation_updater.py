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


# Where each measure's flat series starts and the rate of the first area in AREAS order
FLAT = {'headline': ('1999-01', 9.0), 'core': ('2001-12', 5.0), 'food': ('2001-12', 3.0), 'energy': ('2001-12', 20.0),
        'goods': ('2001-12', 2.0), 'services': ('2001-12', 4.0)}


def downloads(**given):
    """What build() hands to assemble(): Eurostat's answer and the ECB's identical copy, for every measure. Areas rank
    in AREAS order, highest first, unless a test replaces one: headline={'RO': {...}}, energy={'BE': {...}}."""
    tables = {}
    for measure, _, _ in m.MEASURES:
        first, top = FLAT[measure]
        tables[measure] = {code: given.get(measure, {}).get(code, series(round(top - i / 10, 1), first)) for i, code in enumerate(CODES)}
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
        for measure, _, _ in m.MEASURES:
            self.assertEqual(page[measure], script[measure], measure)
            self.assertEqual(len(page[measure]), 333, measure)
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
        self.assertEqual(page['core_by'], '2001-12')

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
        page, _, (compared, differing) = assemble(eurostat, ecb)
        self.assertEqual(differing, 1)
        self.assertEqual(compared, 28 * 333 + 5 * 28 * 298)   # headline from 1999, core and the four groups from December 2001
        self.assertEqual(page['ecb_check'], {'compared': '51,044', 'differing': '1'})
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

    def test_the_rows_run_highest_first_with_the_euro_area_in_place(self):
        romania, area = series(6.5), series(3.8)
        romania['2025-09'], area['2025-09'] = 8.6, 2.2
        headline = {'EA': area, 'RO': romania, 'IE': series(3.8), 'AT': series(3.8), 'SE': series(1.0), 'HU': series(-0.4)}
        core = {'RO': series(7.0, '2001-12'), 'EA': series(2.5, '2000-12')}
        page, _, _ = assemble(*downloads(headline=headline, core=core))
        rows = {row['code']: row for row in page['rows']}
        order = [row['code'] for row in page['rows']]
        self.assertEqual(len(order), 28)
        rates = [float(row['headline']['rate']) for row in page['rows']]
        self.assertEqual(rates, sorted(rates, reverse=True))
        # A tie: the euro area first, then the countries by name
        self.assertEqual(order[order.index('EA'):order.index('EA') + 3], ['EA', 'AT', 'IE'])
        ro = rows['RO']
        self.assertEqual((ro['name'], ro['place'], ro['euro']), ('Romania', 'Romania', False))
        self.assertEqual({k: ro['headline'][k] for k in ('rate', 'before', 'change', 'gap', 'gap_before')},
                         {'rate': '6.5', 'before': '8.6', 'change': '-2.1', 'gap': '+2.7', 'gap_before': '+6.4'})
        self.assertEqual((ro['core']['rate'], ro['core']['change'], ro['core']['gap']), ('7.0', '0.0', '+4.5'))
        # The euro area has no gap to itself and no shade on the map
        self.assertEqual(rows['EA']['headline'], {'rate': '3.8', 'before': '2.2', 'change': '+1.6', 'peak': '3.8', 'peak_month': '2026-09'})
        self.assertEqual((rows['EA']['euro'], rows['EA']['place'], rows['NL']['place']), (None, 'the euro area', 'the Netherlands'))
        self.assertEqual(page['euro_area'], {measure: rows['EA'][measure] for measure, _, _ in m.MEASURES})
        self.assertEqual(rows['IE']['headline']['gap'], '0.0')
        self.assertEqual(rows['SE']['headline']['gap'], '-2.8')
        self.assertEqual((rows['HU']['headline']['rate'], rows['HU']['headline']['gap']), ('-0.4', '-4.2'))
        self.assertEqual((page['to'], page['before']), ('2026-09', '2025-09'))
        ends = page['extremes']['headline']
        self.assertEqual(ends['highest'], {'code': 'BE', 'place': 'Belgium', 'rate': '8.8'})
        self.assertEqual(ends['lowest'], {'code': 'HU', 'place': 'Hungary', 'rate': '-0.4'})
        self.assertEqual(ends['above'], sum(1 for row in page['rows'] if row['code'] != 'EA' and float(row['headline']['rate']) > 3.8))
        self.assertEqual(page['extremes']['core']['highest'], {'code': 'RO', 'place': 'Romania', 'rate': '7.0'})

    def test_the_page_opens_on_the_country_with_the_highest_rate(self):
        page, _, _ = assemble(*downloads(headline={'EA': series(9.9), 'LT': series(9.5)}))
        self.assertEqual(page['rows'][0]['code'], 'EA')
        self.assertEqual(page['default'], 'LT')
        self.assertEqual(page['extremes']['headline']['highest'], {'code': 'LT', 'place': 'Lithuania', 'rate': '9.5'})

    def test_the_map_bands_and_each_country_s_shade(self):
        # Flat series in AREAS order: Austria 8.9% down to Sweden 6.3%, none of them moving
        page, script, _ = assemble(*downloads())
        bands = {'rate': [7.0, 8.0, 9.0, 10.0], 'change': [-0.5, -0.2, 0.2, 0.5]}
        self.assertEqual(page['map_scales']['headline'], bands)
        self.assertEqual(script['map_scales'], page['map_scales'])
        self.assertEqual(page['legend']['headline']['rate'], ['Under 7%', '7% to 8%', '8% to 9%', '9% to 10%', '10% or more'])
        self.assertEqual(page['legend']['headline']['change'], ['Down 0.5 points or more', 'Down 0.2 to 0.5', 'Within 0.2', 'Up 0.2 to 0.5', 'Up 0.5 points or more'])
        rows = {row['code']: row for row in page['rows']}
        self.assertEqual([rows[c]['headline']['rate_class'] for c in ('AT', 'FR', 'DE', 'SE')], [2, 2, 1, 0])   # 8.9, 8.0 on the break, 7.9, 6.3
        self.assertEqual({row['headline']['change_class'] for row in page['rows'] if row['code'] != 'EA'}, {2})
        self.assertNotIn('rate_class', rows['EA']['headline'])
        # One country that fell by more than the outer band widens it for all of them
        cyprus = series(3.0)
        cyprus['2025-09'] = 8.4
        page, _, _ = assemble(*downloads(headline={'CY': cyprus}))
        self.assertEqual(page['map_scales']['headline']['change'], [-2, -0.2, 0.2, 2])
        self.assertEqual(next(row for row in page['rows'] if row['code'] == 'CY')['headline']['change_class'], 0)

    def test_peaks_and_chart_scales(self):
        romania = series(4.0)
        # The ten-year view starts 120 months before the last one, in September 2016: the dip is its first month
        romania.update({'2000-01': 56.7, '2016-09': -2.9, '2022-11': 14.6, '2023-01': 14.6})
        estonia = series(3.0)
        estonia.update({'2022-06': 25.2, '2022-08': 25.2})
        # Core is counted from the first month every area has, so Bulgaria's early peak is left out
        bulgaria = series(3.0, '1999-01')
        bulgaria.update({'2000-05': 13.2, '2008-07': 11.4})
        page, _, _ = assemble(*downloads(headline={'EA': series(2.0), 'RO': romania, 'EE': estonia}, core={'BG': bulgaria}))
        rows = {row['code']: row for row in page['rows']}
        self.assertEqual(page['since'], {'headline': '1999-01', 'core': '2001-12', 'food': '2001-12', 'energy': '2001-12',
                                         'goods': '2001-12', 'services': '2001-12'})
        self.assertEqual((rows['RO']['headline']['peak'], rows['RO']['headline']['peak_month']), ('56.7', '2000-01'))
        self.assertEqual((rows['EE']['headline']['peak'], rows['EE']['headline']['peak_month']), ('25.2', '2022-08'))   # reached twice: the later month
        self.assertEqual((rows['BG']['core']['peak'], rows['BG']['core']['peak_month']), ('11.4', '2008-07'))
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
        for measure in ('core',) + m.CATEGORIES:   # Eurostat flags core and the four groups alike
            for k in m.months('2001-12', '2017-12'):
                eurostat[measure][1]['RO'][k] = 'b' if k == '2017-01' else 'd'
            eurostat[measure][1]['RO']['2018-01'] = 'b'
        page, script, _ = assemble(eurostat, ecb)
        self.assertEqual(page['estimated'], [
            ['headline', 'FR', 'estimated', '1999-01', '2016-12'],
            ['headline', 'MT', 'estimated', '2006-01', '2006-02'],
            ['headline', 'MT', 'provisional', '2008-05', '2008-05'],
        ])
        self.assertEqual(page['core_differs'], ['2001-12', '2017-12'])
        self.assertEqual(page['core_breaks'], ['2017-01', '2018-01'])
        self.assertNotIn('estimated', script)
        # The page gives core and the groups one note on definitions: a group flagged differently stops the script
        eurostat['services'][1]['RO']['2018-01'] = ''
        with self.assertRaisesRegex(m.DataError, 'flags services inflation differently from core'):
            assemble(eurostat, ecb)

    def test_the_four_groups_are_measures_like_core(self):
        page, script, _ = assemble(*downloads(energy={'BE': series(39.4, '2001-12'), 'MT': series(0.0, '2001-12')},
                                              services={'RO': series(9.7, '2001-12')}))
        self.assertEqual(page['measures'], [['headline', 'Headline', 'Inflation'], ['core', 'Core', 'Core inflation'],
                                            ['food', 'Food', 'Food inflation'], ['energy', 'Energy', 'Energy inflation'],
                                            ['goods', 'Goods', 'Goods inflation'], ['services', 'Services', 'Services inflation']])
        self.assertEqual(page['categories'], ['food', 'energy', 'goods', 'services'])
        self.assertNotIn('measures', script)
        self.assertEqual(page['extremes']['energy']['highest'], {'code': 'BE', 'place': 'Belgium', 'rate': '39.4'})
        self.assertEqual(page['extremes']['energy']['lowest'], {'code': 'MT', 'place': 'Malta', 'rate': '0.0'})
        self.assertEqual(page['extremes']['services']['highest']['code'], 'RO')
        rows = {row['code']: row for row in page['rows']}
        self.assertEqual((rows['RO']['services']['rate'], rows['RO']['services']['gap']), ('9.7', '+5.7'))   # the euro area's flat 4.0
        self.assertEqual(set(page['map_scales']), {measure for measure, _, _ in m.MEASURES})
        self.assertEqual(set(page['legend']), set(page['map_scales']))
        # The order of the rows is still the headline rate's
        self.assertEqual(page['rows'][0]['code'], 'EA')

    def test_each_group_has_its_own_plausible_range(self):
        energy = series(5.0, '2001-12')
        energy.update({'2022-09': 113.8, '2023-09': -42.6})   # energy's own extremes since 1999 pass
        food = series(2.0, '2001-12')
        food['2009-08'] = -13.1
        assemble(*downloads(energy={'EE': energy}, food={'SE': food}))
        energy['2022-10'] = 250.0
        with self.assertRaisesRegex(m.DataError, 'implausible'):
            assemble(*downloads(energy={'EE': energy}))
        with self.assertRaisesRegex(m.DataError, 'Spain goods inflation starts too late: 2002-01'):
            assemble(*downloads(goods={'ES': series(1.0, '2002-01')}))


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

    def test_the_map_s_rate_bands_are_equal_and_round(self):
        self.assertEqual(m.rate_scale([1.0, 6.5]), [1.5, 3.0, 4.5, 6.0])
        self.assertEqual(m.rate_scale([1.1, 7.0]), [1.5, 3.0, 4.5, 6.0])
        self.assertEqual(m.rate_scale([-2.8, 0.8]), [-2.0, -1.0, 0.0, 1.0])
        self.assertEqual(m.rate_scale([7.1, 22.5]), [8.0, 12.0, 16.0, 20.0])
        self.assertEqual(m.rate_scale([2.0, 2.0]), [2.5, 3.0, 3.5, 4.0])
        with self.assertRaisesRegex(m.DataError, 'too far apart'):
            m.rate_scale([-15.0, 400.0])
        bands = [1.5, 3.0, 4.5, 6.0]   # a rate on a break joins the band above
        self.assertEqual([m.rate_class(v, bands) for v in (1.0, 1.4, 1.5, 2.9, 3.0, 4.4, 5.9, 6.0, 6.5)], [0, 0, 1, 1, 2, 2, 3, 4, 4])
        self.assertEqual([m.rate_class(v, [-2.0, -1.0, 0.0, 1.0]) for v in (-2.8, -2.0, -0.1, 0.0, 0.8)], [0, 1, 2, 3, 3])

    def test_the_map_s_change_bands_sit_either_side_of_no_change(self):
        self.assertEqual(m.change_scale([-2.2, 5.2]), [-2, -0.2, 0.2, 2])
        self.assertEqual(m.change_scale([0.1, -0.3]), [-0.5, -0.2, 0.2, 0.5])
        self.assertEqual(m.change_scale([-20.2, 3.0]), [-10, -0.2, 0.2, 10])
        bands = [-2, -0.2, 0.2, 2]
        self.assertEqual([m.change_class(v, bands) for v in (-2.2, -2.0, -1.9, -0.3, -0.2, 0.0, 0.2, 0.3, 1.9, 2.0, 5.2)],
                         [0, 0, 1, 1, 2, 2, 2, 3, 3, 4, 4])

    def test_the_legend_s_words(self):
        self.assertEqual(m.legend([1.5, 3.0, 4.5, 6.0], [-2, -0.2, 0.2, 2]), {
            'rate': ['Under 1.5%', '1.5% to 3%', '3% to 4.5%', '4.5% to 6%', '6% or more'],
            'change': ['Down 2 points or more', 'Down 0.2 to 2', 'Within 0.2', 'Up 0.2 to 2', 'Up 2 points or more']})
        words = m.legend([-2.0, -1.0, 0.0, 1.0], [-1, -0.2, 0.2, 1])
        self.assertEqual(words['rate'][:3], ['Under −2%', '−2% to −1%', '−1% to 0%'])
        self.assertEqual((words['change'][0], words['change'][4]), ('Down 1 point or more', 'Up 1 point or more'))

    def test_places_and_rows_on_their_own_lines(self):
        self.assertEqual([m.place(n) for n in ('Netherlands', 'Euro area', 'Czechia')], ['the Netherlands', 'the euro area', 'Czechia'])
        text = m.dumps({'to': '2026-09', 'rows': [{'code': 'RO'}, {'code': 'SE'}], 'headline': [['2026-09', 6.5]]})
        self.assertEqual(text, '{\n"to":"2026-09",\n"rows":[\n{"code":"RO"},\n{"code":"SE"}\n],\n"headline":[\n["2026-09",6.5]\n]\n}\n')

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
        self.assertEqual(page['extremes']['headline']['highest'], {'code': 'RO', 'place': 'Romania', 'rate': '9.9'})
        self.assertEqual(script['headline'][-1][script['cols'].index('RO')], 9.9)


class StoredFileTests(unittest.TestCase):
    """The files in the repository, as the last real run left them."""

    def test_the_two_files_agree(self):
        root = pathlib.Path(__file__).parents[1]
        page = json.loads((root / '_data/inflation_by_country.json').read_text(encoding='utf-8'))
        script = json.loads((root / 'assets/data/inflation-by-country.json').read_text(encoding='utf-8'))
        for key in ('updated', 'source_updated', 'from', 'to', 'before', 'since', 'months', 'areas', 'core_from', 'core_by', 'map_scales', 'cols') + tuple(measure for measure, _, _ in m.MEASURES):
            self.assertEqual(page[key], script[key], key)
        self.assertEqual([row[0] for row in page['measures']], [measure for measure, _, _ in m.MEASURES])
        self.assertEqual(len(page['rows']), 28)
        self.assertEqual(page['headline'][-1][0], page['to'])
        self.assertEqual(len(page['headline']), page['months'])
        col = page['cols'].index(page['default'])
        self.assertEqual(m.pct(page['headline'][-1][col]), page['extremes']['headline']['highest']['rate'])


if __name__ == '__main__':
    unittest.main()
