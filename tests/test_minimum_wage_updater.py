"""The minimum wage updater, on synthetic figures only: no downloads.
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

spec = importlib.util.spec_from_file_location('minimum_wage', pathlib.Path(__file__).parents[1] / 'scripts/update-minimum-wage-data.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

TODAY = dt.date(2026, 11, 15)
UPDATED = '2026-07-31'
AT = {code: e for code, e, _ in m.COUNTRIES}
RATED = [code for code, _, _ in m.COUNTRIES if code not in m.NO_NATIONAL]
LAST = '2026-S2'


def downloads(last=LAST, eur=None, pps=None, nac=None, flags=None, drop=(), none=m.NO_NATIONAL, skip=()):
    """What read_eurostat() hands to assemble(), flat over time so that a test can say exactly where a country ranks.
    The 22 countries with a rate run from €2,000 down in steps of €50 in COUNTRIES order, and from 1,000 PPS up in
    steps of 20, so the two orders are each other's reverse. eur={'RO': {'2026-S2': 900}} replaces single figures,
    drop=[('RO', '2026-S2')] removes both of a country's figures for a half-year, none= the countries flagged "m",
    skip= half-years missing from Eurostat's list altogether."""
    keys = [p for p in m.periods(m.FIRST_PERIOD, last) if p not in skip]
    values = {c: {} for c in m.CURRENCY_CODES}
    marks = {c: {} for c in m.CURRENCY_CODES}
    rated = [code for code, _, _ in m.COUNTRIES if code not in none]
    for i, code in enumerate(rated):
        e = AT[code]
        base = {'EUR': 2000 - 50 * i, 'PPS': 1000 + 20 * i}
        base['NAC'] = base['EUR'] * (5 if code in m.CURRENCIES else 1)
        for cur in m.CURRENCY_CODES:
            values[cur][e] = {p: base[cur] for p in keys if (code, p) not in drop}
            marks[cur][e] = {p: 'e' for p in keys if cur == 'PPS' and (code, p) not in drop}
    for code in none:
        for cur in m.CURRENCY_CODES:
            values[cur][AT[code]] = {}
            marks[cur][AT[code]] = {p: 'm' for p in keys}
    for cur, given in (('EUR', eur), ('PPS', pps), ('NAC', nac)):
        for code, figures in (given or {}).items():
            values[cur][AT[code]].update(figures)
    for (cur, code, p), mark in (flags or {}).items():
        marks[cur][AT[code]][p] = mark
    return values, marks, UPDATED, keys


def assemble(*args, today=TODAY, **kw):
    return m.assemble(*downloads(*args, **kw), today)


def jsonstat(ids=None, freq='S', period='2026-S2', status=None, value=None):
    """Eurostat's answer for two countries, two half-years and the three currencies. Austria has no national minimum
    wage: no figure, flagged "m"."""
    geos, times, curs = ['AT', 'RO'], ['2026-S1', period], ['EUR', 'NAC', 'PPS']
    cells, marks = {}, {}
    for c, cur in enumerate(curs):
        for g, geo in enumerate(geos):
            for t, _ in enumerate(times):
                i = str((c * 2 + g) * 2 + t)
                if geo == 'AT':
                    marks[i] = 'm'
                else:
                    cells[i] = {'EUR': 795.0, 'NAC': 4050.0, 'PPS': 1316.5}[cur] + t * 30
                    if cur == 'PPS':
                        marks[i] = 'e'
    cells.update(value or {})
    marks.update(status or {})
    return json.dumps({
        'updated': '2026-07-31T23:00:00+0200',
        'id': ids or ['freq', 'currency', 'geo', 'time'],
        'size': [1, 3, 2, 2],
        'value': cells,
        'status': marks,
        'dimension': {
            'freq': {'category': {'index': {freq: 0}}},
            'currency': {'category': {'index': {cur: i for i, cur in enumerate(curs)}}},
            'geo': {'category': {'index': {geo: i for i, geo in enumerate(geos)}}},
            'time': {'category': {'index': {p: i for i, p in enumerate(times)}}},
        },
    })


def row(page, code):
    return next(r for r in page['rows'] if r['code'] == code)


class ReadEurostatTests(unittest.TestCase):
    def test_values_flags_and_dates(self):
        values, flags, updated, keys = m.read_eurostat(jsonstat())
        self.assertEqual(values['EUR'], {'AT': {}, 'RO': {'2026-S1': 795, '2026-S2': 825}})
        self.assertIsInstance(values['EUR']['RO']['2026-S1'], int)          # whole figures print without decimals
        self.assertEqual(values['PPS']['RO']['2026-S2'], 1346.5)
        self.assertEqual(flags['EUR']['AT'], {'2026-S1': 'm', '2026-S2': 'm'})
        self.assertEqual(flags['PPS']['RO'], {'2026-S1': 'e', '2026-S2': 'e'})
        self.assertEqual(flags['EUR']['RO'], {})
        self.assertEqual(updated, '2026-07-31')
        self.assertEqual(keys, ['2026-S1', '2026-S2'])

    def test_another_layout_frequency_or_period_is_refused(self):
        with self.assertRaisesRegex(m.DataError, 'layout'):
            m.read_eurostat(jsonstat(ids=['freq', 'unit', 'geo', 'time']))
        with self.assertRaisesRegex(m.DataError, 'freq'):
            m.read_eurostat(jsonstat(freq='A'))
        with self.assertRaisesRegex(m.DataError, 'half-year'):
            m.read_eurostat(jsonstat(period='2026'))

    def test_an_unknown_flag_stops_the_script(self):
        with self.assertRaisesRegex(m.DataError, 'Unexpected flag'):
            m.read_eurostat(jsonstat(status={'3': 'u'}))

    def test_a_figure_flagged_as_no_minimum_wage_stops_the_script(self):
        with self.assertRaisesRegex(m.DataError, 'flagged as having no minimum wage'):
            m.read_eurostat(jsonstat(value={'0': 1000}))


class PeriodTests(unittest.TestCase):
    def test_half_years(self):
        self.assertEqual(m.period_date('2026-S2'), '2026-07-01')
        self.assertEqual(m.period_date('2026-S1'), '2026-01-01')
        self.assertEqual(list(m.periods('2025-S2', '2026-S2')), ['2025-S2', '2026-S1', '2026-S2'])
        self.assertEqual(m.shift_period('2026-S2', 1), '2026-S1')
        self.assertEqual(m.shift_period('2026-S1', 1), '2025-S2')
        self.assertEqual(m.shift_period('2026-S2', 2), '2025-S2')
        self.assertEqual(m.short_period('2026-S1'), 'Jan 2026')


class LatestHalfYearTests(unittest.TestCase):
    def test_the_latest_half_year_every_country_has(self):
        page, script = assemble()
        self.assertEqual((page['period'], page['date'], page['pending']), (LAST, '2026-07-01', None))
        self.assertEqual(page['source_updated'], UPDATED)
        self.assertEqual(script['periods'][0], m.FIRST_PERIOD)
        self.assertEqual(script['periods'][-1], LAST)

    def test_a_newer_half_year_missing_a_country_waits(self):
        page, script = assemble(last='2027-S1', drop=[('RO', '2027-S1')], today=dt.date(2027, 2, 15))
        self.assertEqual(page['period'], LAST)
        self.assertEqual(page['pending'], {'period': '2027-S1', 'date': '2027-01-01', 'missing': ['RO'], 'missing_names': ['Romania']})
        self.assertEqual(script['periods'][-1], LAST)                        # nothing newer than the date shown

    def test_a_missing_figure_is_never_carried_forward(self):
        page, script = assemble(drop=[('BG', '2020-S1')])
        self.assertEqual(page['period'], LAST)
        i = script['periods'].index('2020-S1')
        self.assertIsNone(script['eur']['BG'][i])
        self.assertEqual(script['status']['BG'][i], '-')                     # no figure, not "no minimum wage"
        self.assertEqual(script['status']['AT'][i], 'n')
        self.assertEqual(script['status']['RO'][i], 'r')

    def test_a_euro_figure_without_its_pps_figure_is_incomplete(self):
        values, flags, updated, keys = downloads()
        del values['PPS']['RO'][LAST]
        page, _ = m.assemble(values, flags, updated, keys, TODAY)
        self.assertEqual(page['period'], '2026-S1')
        self.assertEqual(page['pending']['missing'], ['RO'])


class ChecksTests(unittest.TestCase):
    def test_a_change_in_the_countries_without_a_rate_stops_the_script(self):
        with self.assertRaisesRegex(m.DataError, 'NO_NATIONAL'):
            assemble(none=('AT', 'DK', 'FI', 'SE'))                          # Italy brings in a national rate
        with self.assertRaisesRegex(m.DataError, 'NO_NATIONAL'):
            assemble(none=m.NO_NATIONAL + ('RO',))

    def test_stale_figures_stop_the_script(self):
        assemble(today=dt.date(2027, 5, 31))                                 # ten months after 1 July: still fine
        with self.assertRaisesRegex(m.DataError, 'stale'):
            assemble(today=dt.date(2027, 6, 1))

    def test_an_implausible_figure_stops_the_script(self):
        with self.assertRaisesRegex(m.DataError, 'implausible'):
            assemble(eur={'BG': {LAST: 20}})
        with self.assertRaisesRegex(m.DataError, 'implausible'):
            assemble(pps={'LU': {LAST: 25000}})

    def test_a_wild_six_month_move_stops_the_script(self):
        with self.assertRaisesRegex(m.DataError, 'six months'):
            assemble(nac={'RO': {LAST: 20000}})                              # 5 times the rate a half-year before
        page, _ = assemble(nac={'RO': {LAST: 7700}})                         # 1.4 times 5,500 lei: big, but believable
        self.assertEqual(row(page, 'RO')['change'], '+40.0')

    def test_a_skipped_half_year_stops_the_script(self):
        with self.assertRaisesRegex(m.DataError, 'skipped'):
            assemble(skip=('2010-S2',))


class RankTests(unittest.TestCase):
    def test_competition_ranks(self):
        self.assertEqual(m.ranks({'a': 3, 'b': 2, 'c': 2, 'd': 1}), {'a': (1, False), 'b': (2, True), 'c': (2, True), 'd': (4, False)})
        self.assertEqual(m.rank_text(12, True), '12=')
        self.assertEqual(m.rank_text(14, False), '14')
        self.assertEqual([m.ordinal(n) for n in (1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111)],
                         ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st', '111th'])

    def test_equal_figures_share_a_rank_and_the_next_one_skips(self):
        # Bulgaria and Croatia come 2nd and 3rd in euros; give Croatia Bulgaria's figure
        page, _ = assemble(eur={'HR': {LAST: 1950}})
        bg, hr, cy = row(page, 'BG'), row(page, 'HR'), row(page, 'CY')
        self.assertEqual((bg['eur_rank'], bg['eur_rank_text'], bg['eur_tied'], bg['eur_ordinal']), (2, '2=', True, '2nd='))
        self.assertEqual((hr['eur_rank'], hr['eur_rank_text'], hr['eur_tied']), (2, '2=', True))
        self.assertEqual((cy['eur_rank'], cy['eur_rank_text'], cy['eur_tied'], cy['eur_ordinal']), (4, '4', False, '4th'))
        self.assertEqual(row(page, 'BE')['eur_rank_text'], '1')
        self.assertEqual(hr['pps_rank_text'], '20')                          # the other measure is untouched
        names = [r['name'] for r in page['rows']]
        self.assertEqual(names.index('Croatia'), names.index('Bulgaria') + 1)   # a tie is shown by name

    def test_the_rows_and_the_places_moved(self):
        page, _ = assemble()
        rated = [r for r in page['rows'] if r['status'] == 'rate']
        self.assertEqual([r['code'] for r in rated], RATED)                  # highest in euros first
        self.assertEqual([r['eur_rank'] for r in rated], list(range(1, 23)))
        self.assertEqual([r['pps_rank'] for r in rated], list(range(22, 0, -1)))
        self.assertEqual(rated[0]['shift'], 1 - 22)                          # first in euros, last by purchasing power
        self.assertEqual(rated[-1]['shift'], 22 - 1)
        self.assertEqual((rated[0]['eur_text'], rated[0]['pps_text'], rated[0]['pps_flag']), ('2,000', '1,000', 'e'))


class NoNationalRateTests(unittest.TestCase):
    def test_countries_without_a_rate_are_listed_never_ranked_or_zero(self):
        page, script = assemble()
        none = [r for r in page['rows'] if r['status'] == 'none']
        self.assertEqual([r['code'] for r in none], ['AT', 'DK', 'FI', 'IT', 'SE'])
        self.assertEqual([r['code'] for r in page['rows'][-5:]], ['AT', 'DK', 'FI', 'IT', 'SE'])
        for r in none:
            self.assertNotIn('eur', r)
            self.assertNotIn('eur_rank', r)
            self.assertIsNone(r['conversion'])
            self.assertEqual(set(script['eur'][r['code']]), {None})
            self.assertEqual(set(script['status'][r['code']]), {'n'})
        self.assertEqual((page['with_rate'], page['total']), (22, 27))
        self.assertEqual(page['no_national_names'], ['Austria', 'Denmark', 'Finland', 'Italy', 'Sweden'])
        self.assertEqual(page['eu_card']['value'], '22 of 27')
        self.assertEqual(page['eu_card']['rows'][-1], ['No national minimum wage', '', 'Austria, Denmark, Finland, Italy and Sweden'])
        for by_country in script['flags'].values():                         # "m" is a status, not a flag beside a figure
            for code, marks in by_country.items():
                self.assertNotIn(code, m.NO_NATIONAL)
                self.assertTrue(all('m' not in mark for mark in marks.values()))

    def test_a_pair_without_a_rate_falls_back_to_the_two_highest(self):
        saved = m.DEFAULT_PAIR
        self.addCleanup(setattr, m, 'DEFAULT_PAIR', saved)
        m.DEFAULT_PAIR = ('AT', 'DE')
        page, _ = assemble()
        self.assertEqual(page['default_pair'], ['BE', 'BG'])


class MapTests(unittest.TestCase):
    def test_bands_are_equal_round_and_the_narrowest_that_fit(self):
        self.assertEqual(m.band_scale([620, 2771]), [1000, 1500, 2000, 2500])
        self.assertEqual(m.band_scale([935, 2164]), [1200, 1500, 1800, 2100])
        self.assertEqual(m.band_scale([1000, 1400]), [1100, 1200, 1300, 1400])
        with self.assertRaisesRegex(m.DataError, 'too far apart'):
            m.band_scale([50, 12000])

    def test_a_figure_on_a_break_joins_the_band_above(self):
        breaks = [1000, 1500, 2000, 2500]
        self.assertEqual([m.band_class(v, breaks) for v in (620, 999, 1000, 1499, 1500, 2771)], [0, 0, 1, 1, 2, 4])

    def test_the_legend_s_words(self):
        self.assertEqual(m.legend('EUR', [1000, 1500, 2000, 2500]),
                         ['Under €1,000', '€1,000 to €1,500', '€1,500 to €2,000', '€2,000 to €2,500', '€2,500 or more'])
        self.assertEqual(m.legend('PPS', [1200, 1500, 1800, 2100])[0], 'Under 1,200 PPS')
        self.assertEqual(m.legend('PPS', [1200, 1500, 1800, 2100])[-1], '2,100 PPS or more')

    def test_each_country_s_shade_in_each_measure(self):
        page, _ = assemble()
        self.assertEqual(page['map_scales'], {'eur': [1200, 1500, 1800, 2100], 'pps': [1100, 1200, 1300, 1400]})
        for r in page['rows']:
            if r['status'] == 'rate':
                self.assertEqual(r['eur_class'], m.band_class(r['eur'], page['map_scales']['eur']))
                self.assertEqual(r['pps_class'], m.band_class(r['pps'], page['map_scales']['pps']))


class ArithmeticTests(unittest.TestCase):
    def test_percentages_round_half_away_from_zero(self):
        self.assertEqual(m.pct_tenths(2391, 2343), 20)
        self.assertEqual(m.pct_tenths(1756, 2164), -189)
        self.assertEqual(m.pct_tenths(2000, 2000), 0)
        self.assertEqual(m.pct_tenths(1001, 2000), -500)                    # -49.95% is -50.0%
        self.assertEqual(m.pct_tenths(20010, 20000), 1)                     # +0.05% is +0.1%
        self.assertEqual(m.pct_tenths(19990, 20000), -1)                    # and -0.05% is -0.1%
        self.assertEqual(m.pct_tenths(20009, 20000), 0)
        self.assertEqual(m.pct_tenths(1316.52, 1000), 317)                  # cents count: 31.652%

    def test_times_as_much(self):
        self.assertEqual(m.ratio_tenths(2771, 620), 45)
        self.assertEqual(m.ratio_tenths(2164, 935), 23)
        self.assertEqual(m.ratio_tenths(1250, 1000), 13)                    # 1.25 rounds half up
        self.assertEqual(m.tenths_text(45), '4.5')
        self.assertEqual(m.tenths_text(-189), '18.9')

    def test_amounts_and_names(self):
        self.assertEqual((m.amount(2391), m.amount(1316.52), m.amount(4050)), ('2,391', '1,316.52', '4,050'))
        self.assertEqual((m.place('Netherlands'), m.possessive('Netherlands'), m.possessive('Cyprus'), m.possessive('Ireland')),
                         ('the Netherlands', 'the Netherlands’', 'Cyprus’', 'Ireland’s'))
        self.assertEqual(m.join(['Austria', 'Denmark', 'Italy']), 'Austria, Denmark and Italy')
        self.assertEqual(m.long_date('2026-07-01'), '1 July 2026')


class SentenceTests(unittest.TestCase):
    names = {code: name for code, _, name in m.COUNTRIES}

    def test_the_map_s_summary(self):
        self.assertEqual(m.summary('EUR', {'LU': 2771, 'BG': 620, 'IE': 2391}, self.names),
                         'In euros, the minimum wage is highest in Luxembourg, at €2,771 a month, and lowest in Bulgaria, at €620: 4.5 times as much.')
        self.assertEqual(m.summary('PPS', {'DE': 2164, 'EE': 935, 'NL': 2164}, self.names),
                         'Adjusted for prices, it is highest in Germany and the Netherlands, at 2,164 PPS, and lowest in Estonia, at 935 PPS: 2.3 times as much.')

    def test_the_comparison_s_sentence(self):
        latest = {'EUR': {'IE': 2391, 'DE': 2343, 'NL': 2343}, 'PPS': {'IE': 1756, 'DE': 2164, 'NL': 2164}}
        none = ('AT', 'IT')
        self.assertEqual(m.compare_sentence('IE', 'DE', self.names, latest, none),
                         'In euros, Ireland’s minimum wage is 2.0% higher than Germany’s. Adjusted for prices, it is 18.9% lower than Germany’s.')
        self.assertEqual(m.compare_sentence('NL', 'DE', self.names, latest, none),
                         'In euros, the Netherlands’ minimum wage is the same as Germany’s. Adjusted for prices, it is the same as Germany’s.')
        self.assertEqual(m.compare_sentence('AT', 'IE', self.names, latest, none),
                         'Austria has no national minimum wage, so there is nothing to set against Ireland’s minimum wage.')
        self.assertEqual(m.compare_sentence('AT', 'IT', self.names, latest, none), 'Neither Austria nor Italy has a national minimum wage.')
        self.assertEqual(m.compare_sentence('IE', 'RO', self.names, latest, none),
                         'Romania has no figure for this date, so there is nothing to set against Ireland’s minimum wage.')

    def test_the_comparison_s_table_and_half_years(self):
        page, _ = assemble(last=LAST, none=m.NO_NATIONAL, drop=[('IE', p) for p in m.periods(m.FIRST_PERIOD, '2000-S1')])
        mc = page['compare']
        self.assertEqual((mc['a'], mc['b']), ('IE', 'DE'))
        self.assertEqual(mc['rows'][0][0], 'Gross a month, in euros')
        self.assertEqual(mc['rows'][2][1:3], [row(page, 'IE')['pps_text'] + ' PPS (e)', row(page, 'DE')['pps_text'] + ' PPS (e)'])
        self.assertEqual(len(mc['rows']), 4)                                 # two euro countries: no national-currency row
        self.assertEqual(mc['history'][0][0], 'Jul 2026')
        self.assertEqual(mc['history'][-1][0], 'Jan 1999')                   # Germany has figures from the start here
        self.assertEqual(mc['history'][-1][1], '–')                          # Ireland has none yet: a dash, not a zero
        self.assertEqual(mc['bars']['eur'], [round(row(page, 'IE')['eur'] * 100 / 2000, 1), round(row(page, 'DE')['eur'] * 100 / 2000, 1)])


class RevisionTests(unittest.TestCase):
    def test_no_earlier_file_means_nothing_to_compare(self):
        _, script = assemble()
        self.assertIsNone(m.revisions(None, script))
        self.assertIsNone(m.revisions({}, script))

    def test_changed_figures_are_listed_and_new_half_years_are_not(self):
        _, old = assemble(last='2026-S1', today=TODAY)
        _, new = assemble(eur={'RO': {'2025-S2': 1111}})
        self.assertEqual(m.revisions(new, new), [])
        changes = m.revisions(old, new)
        self.assertEqual(changes, [['2025-S2', 'RO', 'EUR', 1100, 1111]])    # 2026-S2 is new, not a revision


class MainTests(unittest.TestCase):
    """main() with build() replaced and both files in a temporary folder."""

    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.saved = (m.build, m.PAGE_JSON, m.SCRIPT_JSON)
        self.addCleanup(lambda: setattr(m, 'build', self.saved[0]) or setattr(m, 'PAGE_JSON', self.saved[1]) or setattr(m, 'SCRIPT_JSON', self.saved[2]))
        m.PAGE_JSON = os.path.join(self.folder.name, '_data', 'minimum_wage_europe.json')
        m.SCRIPT_JSON = os.path.join(self.folder.name, 'assets', 'data', 'minimum-wage-europe.json')

    def run_main(self, build):
        m.build = build
        with contextlib.redirect_stdout(io.StringIO()) as out, contextlib.redirect_stderr(io.StringIO()) as err:
            code = m.main()
        return code, out.getvalue() + err.getvalue()

    def read(self):
        return [pathlib.Path(p).read_bytes() for p in (m.PAGE_JSON, m.SCRIPT_JSON)]

    def test_writes_once_then_leaves_unchanged_data_alone(self):
        good = lambda today: assemble()
        code, said = self.run_main(good)
        self.assertEqual(code, 0)
        self.assertIn('Wrote', said)
        first = self.read()
        page = json.loads(first[0])
        self.assertEqual(page['updated'], dt.datetime.now(dt.timezone.utc).date().isoformat())
        self.assertIsNone(page['revisions'])                                 # a first run has nothing to compare with
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
        self.run_main(lambda today: assemble())
        before = self.read()
        code, said = self.run_main(lambda today: assemble(eur={'BG': {LAST: 20}}))
        self.assertEqual(code, 1)
        self.assertIn('NOT updated', said)
        self.assertEqual(self.read(), before)
        self.assertEqual(sorted(os.listdir(os.path.dirname(m.PAGE_JSON))), ['minimum_wage_europe.json'])

        def offline(today):
            raise m.DataError('Eurostat did not answer')
        code, said = self.run_main(offline)
        self.assertEqual(code, 1)
        self.assertEqual(self.read(), before)

    def test_a_revision_is_recorded_on_the_page(self):
        self.run_main(lambda today: assemble())
        code, said = self.run_main(lambda today: assemble(eur={'RO': {'2026-S1': 1111}}))
        self.assertEqual(code, 0)
        self.assertIn('revised', said)
        page, script = (json.loads(b) for b in self.read())
        self.assertEqual(page['revisions'], [['2026-S1', 'RO', 'EUR', 1100, 1111]])
        self.assertEqual(script['eur']['RO'][script['periods'].index('2026-S1')], 1111)


class StoredFileTests(unittest.TestCase):
    """The files in the repository, as the last update wrote them."""

    def test_the_two_files_agree_and_hold_every_country(self):
        root = pathlib.Path(__file__).parents[1]
        page = json.loads((root / '_data/minimum_wage_europe.json').read_text(encoding='utf-8'))
        script = json.loads((root / 'assets/data/minimum-wage-europe.json').read_text(encoding='utf-8'))
        for key in ('period', 'date', 'source_updated', 'updated', 'periods', 'eur', 'pps', 'nac', 'status', 'default_pair', 'map_scales'):
            self.assertEqual(page[key], script[key], key)
        self.assertEqual(len(page['rows']), 27)
        self.assertEqual(sorted(r['code'] for r in page['rows']), sorted(AT))
        self.assertEqual([r['code'] for r in page['rows'] if r['status'] == 'none'], list(m.NO_NATIONAL))
        self.assertEqual(page['periods'][-1], page['period'])


if __name__ == '__main__':
    unittest.main()
