import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location('old_new', pathlib.Path(__file__).parents[1] / 'scripts/update-old-new-data.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class BitcoinMonthEndTests(unittest.TestCase):
    def test_final_calendar_day(self):
        self.assertEqual(m.bitcoin_month_ends({'2020-02-29': 100}, '2020-02', '2020-02'), {'2020-02': 100})
        with self.assertRaises(m.DataError):
            m.bitcoin_month_ends({'2020-02-28': 100}, '2020-02', '2020-02')
