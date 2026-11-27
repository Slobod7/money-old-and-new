"""The review-date check, on small files it writes itself, then on the site's own files.
Run from the repository root: python3 -m unittest discover -s tests -p 'test_*.py'"""
import datetime as dt
import importlib.util
import io
import os
import pathlib
import tempfile
import unittest

ROOT = pathlib.Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location('review_dates', ROOT / 'scripts/check-review-dates.py')
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)

TODAY = dt.date(2026, 12, 2)


def entry(fact='A tax cut', where='data/page.html, its FAQ', review_by='2026-12-31', check='Check the law.'):
    return '- fact: "{}"\n  where: "{}"\n  review_by: {}\n  check: "{}"\n'.format(fact, where, review_by, check)


class Site:
    """A throwaway site folder with data/page.html, a register and any other _data files."""

    def __init__(self, register, others=None):
        self.dir = tempfile.TemporaryDirectory()
        self.root = self.dir.name
        os.makedirs(os.path.join(self.root, '_data'))
        os.makedirs(os.path.join(self.root, 'data'))
        open(os.path.join(self.root, 'data', 'page.html'), 'w').close()
        self.write('_data/review_dates.yml', '# Facts typed by hand\n\n' + register)
        for name, text in (others or {}).items():
            self.write(name, text)

    def write(self, name, text):
        with open(os.path.join(self.root, name), 'w', encoding='utf-8') as f:
            f.write(text)

    def run(self, today=TODAY, **kw):
        out = io.StringIO()
        code = r.run(self.root, today, out, **kw)
        return code, out.getvalue()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.dir.cleanup()


class ReadTest(unittest.TestCase):
    def test_reads_every_field(self):
        with Site(entry() + '\n' + entry(fact='Spain’s duty cut', review_by='2027-01-01', check='See the BOE: “RDL”.')) as s:
            entries = r.read_register(s.root)
        self.assertEqual([e['fact'] for e in entries], ['A tax cut', 'Spain’s duty cut'])
        self.assertEqual(entries[1]['review_by'], dt.date(2027, 1, 1))
        self.assertEqual(entries[1]['check'], 'See the BOE: “RDL”.')
        self.assertEqual((entries[0]['file'], entries[0]['line']), ('_data/review_dates.yml', 3))

    def test_comments_and_blank_lines_are_skipped(self):
        with Site('# a note\n\n' + entry() + '  # an indented note\n') as s:
            self.assertEqual(len(r.read_register(s.root)), 1)

    def assert_refused(self, register, *words, line=None):
        with Site(register) as s:
            with self.assertRaises(r.FormatError) as ctx:
                r.read_register(s.root)
            for w in words:
                self.assertIn(w, str(ctx.exception))
            if line is not None:
                self.assertEqual(ctx.exception.line, line)
            code, out = s.run()
            self.assertEqual(code, 1)
            self.assertIn('Error:', out)

    def test_refuses_an_unquoted_value(self):
        self.assert_refused(entry().replace('"Check the law."', 'Check the law.'), 'double quotes', line=6)

    def test_refuses_a_straight_quote_or_backslash_inside(self):
        self.assert_refused(entry(check='Say "no"'), 'double quotes')
        self.assert_refused(entry(check='a\\b'), 'double quotes')

    def test_refuses_an_empty_value(self):
        self.assert_refused(entry(check=' '), 'empty')

    def test_refuses_an_unknown_or_repeated_key(self):
        self.assert_refused(entry() + '  note: "x"\n', "unknown key 'note'", line=7)
        self.assert_refused(entry() + '  check: "again"\n', 'two check lines', line=7)

    def test_refuses_a_missing_key(self):
        self.assert_refused(entry().replace('  check: "Check the law."\n', ''), 'has no check', line=3)

    def test_refuses_a_bad_date(self):
        self.assert_refused(entry(review_by='31/12/2026'), 'YYYY-MM-DD', line=5)
        self.assert_refused(entry(review_by='2026-02-30'), 'not a real date')

    def test_refuses_a_line_it_does_not_understand(self):
        self.assert_refused('  where: "data/page.html"\n', 'not understood', line=3)
        self.assert_refused(entry() + 'review_by: 2027-01-01\n', 'not understood')

    def test_refuses_a_where_that_names_nothing(self):
        self.assert_refused(entry(where='data/moved.html, its FAQ'), "'data/moved.html'", 'Has the page moved?')

    def test_where_can_name_a_folder_and_needs_no_comma(self):
        with Site(entry(where='data/') + entry(where='data/page.html')) as s:
            self.assertEqual(len(r.read_register(s.root)), 2)


class DataFileTest(unittest.TestCase):
    def test_a_review_by_line_in_another_data_file_counts(self):
        other = '# Ireland and Spain, typed by hand.\n# More notes.\nchecked: 2026-11-15\nreview_by: 2027-01-01\nIE:\n  review_by: 2020-01-01\n'
        with Site(entry(), {'_data/national.yml': other, '_data/cards.yml': '- title: x\n'}) as s:
            found = r.read_data_files(s.root)
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]['fact'], 'Ireland and Spain, typed by hand')
        self.assertEqual((found[0]['where'], found[0]['line'], found[0]['review_by']), ('_data/national.yml', 4, dt.date(2027, 1, 1)))

    def test_a_quoted_date_is_read(self):
        with Site(entry(), {'_data/national.yml': 'review_by: "2027-01-01"  # check then\n'}) as s:
            self.assertEqual(r.read_data_files(s.root)[0]['review_by'], dt.date(2027, 1, 1))

    def test_two_review_by_lines_are_refused(self):
        with Site(entry(), {'_data/national.yml': 'review_by: 2027-01-01\nreview_by: 2027-02-01\n'}) as s:
            with self.assertRaises(r.FormatError) as ctx:
                r.read_data_files(s.root)
        self.assertEqual(ctx.exception.line, 2)

    def test_the_register_is_not_read_twice(self):
        with Site(entry()) as s:
            self.assertEqual(r.read_data_files(s.root), [])


class DueTest(unittest.TestCase):
    def facts(self, *dates):
        return [{'fact': d, 'review_by': dt.date.fromisoformat(d)} for d in dates]

    def test_due_on_the_day_passed_the_day_after(self):
        passed, soon, later = r.sort_out(self.facts('2026-12-01', '2026-12-02', '2026-12-18', '2026-12-19'), TODAY)
        self.assertEqual([e['fact'] for e in passed], ['2026-12-01'])
        self.assertEqual([e['fact'] for e in soon], ['2026-12-02', '2026-12-18'])
        self.assertEqual([e['fact'] for e in later], ['2026-12-19'])

    def test_each_group_in_date_order(self):
        passed, _, later = r.sort_out(self.facts('2026-11-30', '2026-06-01', '2027-05-01', '2027-01-03'), TODAY)
        self.assertEqual([e['fact'] for e in passed], ['2026-06-01', '2026-11-30'])
        self.assertEqual([e['fact'] for e in later], ['2027-01-03', '2027-05-01'])

    def test_the_run_before_a_date_warns(self):
        # The workflow runs on the 2nd and the 18th: the run on 18 December sees a 2 January date coming up,
        # and the run on 2 January passes it, as it's due that day.
        _, soon, _ = r.sort_out(self.facts('2027-01-02'), dt.date(2026, 12, 18))
        self.assertEqual(len(soon), 1)
        passed, soon, _ = r.sort_out(self.facts('2027-01-02'), dt.date(2027, 1, 2))
        self.assertEqual((passed, len(soon)), ([], 1))


class RunTest(unittest.TestCase):
    def test_fails_once_a_date_has_passed(self):
        with Site(entry(fact='Old', review_by='2026-12-01') + entry(fact='Soon', review_by='2026-12-10')
                  + entry(fact='Later', review_by='2027-05-01')) as s:
            code, out = s.run()
        self.assertEqual(code, 1)
        self.assertIn('Passed their date, so this run fails:\n  - Old (data/page.html, its FAQ), check by 1 December 2026.', out)
        self.assertIn('Coming up in the next 16 days:\n  - Soon', out)
        self.assertIn('Later: 1 more, the next on 1 May 2027.', out)
        self.assertNotIn('::', out)

    def test_passes_while_no_date_has_passed(self):
        with Site(entry(review_by='2026-12-02')) as s:
            code, out = s.run()
        self.assertEqual(code, 0)
        self.assertIn('No review date has passed.', out)

    def test_on_github_it_annotates_and_writes_a_summary(self):
        with Site(entry(fact='Old, 50%', review_by='2026-12-01') + entry(fact='Soon', review_by='2026-12-10')) as s:
            path = os.path.join(s.root, 'summary.md')
            code, out = s.run(github=True, summary_path=path)
            text = pathlib.Path(path).read_text(encoding='utf-8')
        self.assertEqual(code, 1)
        self.assertIn('::error file=_data/review_dates.yml,line=3,title=Review date passed::Old, 50%25 (data/page.html', out)
        self.assertIn('::warning file=_data/review_dates.yml,line=7,title=Review date coming up::Soon', out)
        self.assertIn('**1 past its review date.**', text)
        self.assertIn('| Passed | 1 December 2026 | Old, 50% | data/page.html, its FAQ |', text)
        self.assertIn('| Coming up | 10 December 2026 | Soon |', text)

    def test_a_format_error_is_annotated_on_its_line(self):
        with Site(entry(review_by='soon')) as s:
            code, out = s.run(github=True)
        self.assertEqual(code, 1)
        self.assertIn('::error file=_data/review_dates.yml,line=5,title=Review dates file not understood::', out)

    def test_escapes_workflow_command_text(self):
        self.assertEqual(r.escape_message('a%b\nc'), 'a%25b%0Ac')
        self.assertEqual(r.escape_property('a:b,c'), 'a%3Ab%2Cc')


class SiteFilesTest(unittest.TestCase):
    """The site's own register and data files, so an edit that breaks the form fails the tests too."""

    def test_the_site_files_read(self):
        entries = r.read_register(str(ROOT)) + r.read_data_files(str(ROOT))
        self.assertGreaterEqual(len(entries), 4)
        self.assertIn('_data/minimum_wage_national.yml', [e['where'] for e in entries])

    def test_every_value_is_plain_on_one_line(self):
        for e in r.read_register(str(ROOT)):
            for key in ('fact', 'where', 'check'):
                self.assertEqual(e[key], e[key].strip(), key)


if __name__ == '__main__':
    unittest.main()
