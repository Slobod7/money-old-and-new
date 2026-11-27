#!/usr/bin/env python3
"""Check the facts typed by hand on the site against the dates they must be checked by.

The data updates refresh every figure that comes from a download, but not the facts typed by hand: a tax cut that
ends, a rate "since 16 September", "its second rise this year". Each of those has an entry in _data/review_dates.yml
with the date to check it by. A file of hand-typed data in _data/ can carry its own top-level review_by line instead
(minimum_wage_national.yml does), and counts the same.

The script lists them all. Once a date has passed, it ends with an error, so the workflow run fails and GitHub emails
you. A date in the next SOON_DAYS days is listed as coming up, without failing. The monthly workflow
(.github/workflows/update-oil-data.yml) runs it on the 2nd and the 18th of each month.

Run it from the repository root:          python3 scripts/check-review-dates.py
To see what will be due on a later day:   python3 scripts/check-review-dates.py --today 2027-01-02

Standard library only. It reads the simple form described at the top of _data/review_dates.yml, not YAML in general,
and stops with an error on any line it doesn't understand, so a mistake in the file fails the run instead of hiding
an entry.
"""

import argparse
import datetime as dt
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REGISTER = os.path.join('_data', 'review_dates.yml')
SOON_DAYS = 16   # the workflow runs on the 2nd and the 18th, at most 16 days apart, so the run before a date warns

KEYS = ('fact', 'where', 'review_by', 'check')
ENTRY = re.compile(r'^- fact: (.*)$')
FIELD = re.compile(r'^  ([a-z_]+): (.*)$')
QUOTED = re.compile(r'^"([^"\\]*)"$')
DATE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
TOP_REVIEW_BY = re.compile(r'^review_by:\s*"?([^"#\s]*)"?\s*(?:#.*)?$')


class FormatError(Exception):
    """A line in a review file that the script can't read: it names the file and the line."""

    def __init__(self, path, line, message):
        super().__init__('{} line {}: {}'.format(path, line, message))
        self.path, self.line = path, line


def parse_date(text, path, line):
    if not DATE.match(text):
        raise FormatError(path, line, 'review_by must be a date written YYYY-MM-DD, not {!r}'.format(text))
    try:
        return dt.date.fromisoformat(text)
    except ValueError:
        raise FormatError(path, line, 'review_by is not a real date: {}'.format(text))


def parse_value(raw, key, path, line):
    raw = raw.strip()
    if key == 'review_by':
        return parse_date(raw, path, line)
    m = QUOTED.match(raw)
    if not m:
        raise FormatError(path, line, 'put the {} in double quotes, on one line, with no straight double quote or '
                                      'backslash inside'.format(key))
    if not m.group(1).strip():
        raise FormatError(path, line, 'the {} is empty'.format(key))
    return m.group(1)


def where_path(where):
    """The file or folder an entry's "where" starts with: everything before the first comma."""
    return where.split(',', 1)[0].strip()


def read_register(root, path=REGISTER):
    """The entries in review_dates.yml, as dicts with the four keys, the line each starts on and the file."""
    entries, current = [], None
    with open(os.path.join(root, path), encoding='utf-8') as f:
        lines = f.read().split('\n')
    for n, line in enumerate(lines, 1):
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        m = ENTRY.match(line)
        if m:
            current = {'fact': parse_value(m.group(1), 'fact', path, n), 'file': path, 'line': n}
            entries.append(current)
            continue
        m = FIELD.match(line)
        if m and current is not None:
            key = m.group(1)
            if key not in KEYS or key == 'fact':
                raise FormatError(path, n, 'unknown key {!r}: an entry has only {}'.format(key, ', '.join(KEYS)))
            if key in current:
                raise FormatError(path, n, 'the entry that starts on line {} has two {} lines'.format(current['line'], key))
            current[key] = parse_value(m.group(2), key, path, n)
            continue
        raise FormatError(path, n, 'not understood: {}'.format(line.strip()))
    for e in entries:
        missing = [k for k in KEYS if k not in e]
        if missing:
            raise FormatError(path, e['line'], 'the entry has no {}'.format(' or '.join(missing)))
        target = where_path(e['where'])
        if not target or not os.path.exists(os.path.join(root, target)):
            raise FormatError(path, e['line'], '"where" starts with {!r}, which is not a file or folder in the site. '
                                               'Has the page moved?'.format(target))
    return entries


def read_data_files(root, skip=REGISTER):
    """An entry for each other file in _data/ with a top-level review_by line. Its fact is the file's first comment."""
    entries = []
    for full in sorted(glob.glob(os.path.join(root, '_data', '*.yml')) + glob.glob(os.path.join(root, '_data', '*.yaml'))):
        path = os.path.relpath(full, root)
        if path == skip:
            continue
        with open(full, encoding='utf-8') as f:
            lines = f.read().split('\n')
        found = [(n, m.group(1)) for n, line in enumerate(lines, 1) for m in [TOP_REVIEW_BY.match(line)] if m]
        if not found:
            continue
        if len(found) > 1:
            raise FormatError(path, found[1][0], 'a second review_by line (the first is on line {})'.format(found[0][0]))
        n, text = found[0]
        about = next((l.lstrip('#').strip().rstrip('.') for l in lines if l.startswith('#') and l.lstrip('#').strip()), path)
        entries.append({'fact': about, 'where': path, 'review_by': parse_date(text, path, n),
                        'check': 'See the notes at the top of the file.', 'file': path, 'line': n})
    return entries


def long_date(d):
    return '{} {}'.format(d.day, d.strftime('%B %Y'))


def sort_out(entries, today, soon_days=SOON_DAYS):
    """(passed, coming up, later), each in date order. A fact is due on its date, and has passed the day after."""
    ordered = sorted(entries, key=lambda e: (e['review_by'], e['fact']))
    passed = [e for e in ordered if e['review_by'] < today]
    soon = [e for e in ordered if today <= e['review_by'] <= today + dt.timedelta(days=soon_days)]
    later = [e for e in ordered if e['review_by'] > today + dt.timedelta(days=soon_days)]
    return passed, soon, later


def escape_message(text):
    return text.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')


def escape_property(text):
    return escape_message(text).replace(':', '%3A').replace(',', '%2C')


def annotation(level, title, where, message):
    """A GitHub Actions workflow command, shown on the run's page against the file and line in where."""
    return '::{} file={},line={},title={}::{}'.format(level, escape_property(where['file']), where['line'],
                                                      escape_property(title), escape_message(message))


def describe(e):
    return '{} ({}), check by {}. {}'.format(e['fact'], e['where'], long_date(e['review_by']), e['check'])


def summary(passed, soon, later, today):
    """The run's summary on GitHub, as Markdown: every fact and its date."""
    rows = [('Passed', e) for e in passed] + [('Coming up', e) for e in soon] + [('Later', e) for e in later]
    out = ['## Review dates on {}'.format(long_date(today)), '']
    if passed:
        out += ['**{} past {} review date.** Check {}, correct the page if it needs it, then move `review_by` on in '
                '`{}`.'.format(len(passed), 'its' if len(passed) == 1 else 'their', 'it' if len(passed) == 1 else 'them',
                               '`, `'.join(sorted({e['file'] for e in passed}))), '']
    out += ['| | Check by | Fact | Where |', '|---|---|---|---|']
    for status, e in rows:
        out.append('| {} | {} | {} | {} |'.format(status, long_date(e['review_by']), e['fact'].replace('|', '\\|'),
                                                 e['where'].replace('|', '\\|')))
    return '\n'.join(out) + '\n'


def run(root, today, out, github=False, summary_path=None, soon_days=SOON_DAYS):
    """Print the report and return the exit code: 1 if a date has passed or a file can't be read, else 0."""
    try:
        entries = read_register(root) + read_data_files(root)
    except FormatError as err:
        if github:
            print(annotation('error', 'Review dates file not understood', {'file': err.path, 'line': err.line}, str(err)), file=out)
        print('Error: {}'.format(err), file=out)
        return 1
    passed, soon, later = sort_out(entries, today, soon_days)
    print('Review dates on {}: {} {}.'.format(long_date(today), len(entries), 'fact' if len(entries) == 1 else 'facts'), file=out)
    for heading, group, level in (('Passed their date, so this run fails:', passed, 'error'),
                                  ('Coming up in the next {} days:'.format(soon_days), soon, 'warning')):
        if not group:
            continue
        print('', file=out)
        print(heading, file=out)
        for e in group:
            print('  - ' + describe(e), file=out)
            if github:
                print(annotation(level, 'Review date passed' if level == 'error' else 'Review date coming up', e, describe(e)), file=out)
    if later:
        print('', file=out)
        print('Later: {} more, the next on {}.'.format(len(later), long_date(later[0]['review_by'])), file=out)
    if not passed:
        print('', file=out)
        print('No review date has passed.', file=out)
    if summary_path:
        with open(summary_path, 'a', encoding='utf-8') as f:
            f.write(summary(passed, soon, later, today))
    return 1 if passed else 0


def main(argv=None):
    parser = argparse.ArgumentParser(description='Check the facts typed by hand against their review dates.')
    parser.add_argument('--today', help='check as if it were this day, YYYY-MM-DD (default: today, in UTC)')
    args = parser.parse_args(argv)
    try:
        today = dt.date.fromisoformat(args.today) if args.today else dt.datetime.now(dt.timezone.utc).date()
    except ValueError:
        parser.error('--today must be a date written YYYY-MM-DD')
    github = os.environ.get('GITHUB_ACTIONS') == 'true'
    return run(ROOT, today, sys.stdout, github=github, summary_path=os.environ.get('GITHUB_STEP_SUMMARY') or None)


if __name__ == '__main__':
    sys.exit(main())
