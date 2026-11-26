"""Tests for stooq_eod: Stooq downloads in, the price service's end-of-day CSV out.

Run: python -m unittest discover -s tools/stooq-eod -v
"""

import csv
import io
import os
import tempfile
import unittest
import zipfile
from pathlib import Path

import stooq_eod

BULK_HEADER = "<TICKER>,<PER>,<DATE>,<TIME>,<OPEN>,<HIGH>,<LOW>,<CLOSE>,<VOL>,<OPENINT>\n"


def bulk_file(ticker, *rows):
    """A file as in Stooq's bulk daily archive: one ticker, (date, close) rows."""
    lines = [BULK_HEADER]
    for date, close in rows:
        lines.append(f"{ticker},D,{date},000000,{close},{close},{close},{close},1000,0\n")
    return "".join(lines)


def read_output(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.reader(f))


class ConvertTest(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.out = self.dir / "out" / "stooq-closes.csv"

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, name, content):
        path = self.dir / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return path

    def run_tool(self, *args):
        err = io.StringIO()
        code = stooq_eod.main([*map(str, args), "--out", str(self.out)], stderr=err)
        return code, err.getvalue()

    def test_bulk_files_give_last_close_and_previous_close_in_the_price_service_format(self):
        self.write("data/daily/us/nasdaq stocks/1/aapl.us.txt",
                   bulk_file("AAPL.US", ("20261121", "228.10"), ("20261124", "229.50"), ("20261125", "231.05")))
        self.write("data/daily/us/nyse stocks/1/ibm.us.txt",
                   bulk_file("IBM.US", ("20261125", "250.35")))

        code, _ = self.run_tool(self.dir / "data")

        self.assertEqual(code, 0)
        self.assertEqual(read_output(self.out), [
            ["symbol", "date", "close", "previousClose", "currency"],
            ["AAPL", "2026-11-25", "231.05", "229.50", "USD"],
            ["IBM", "2026-11-25", "250.35", "", "USD"],
        ])

    def test_reads_the_zipped_archive(self):
        archive = self.dir / "d_us_txt.zip"
        with zipfile.ZipFile(archive, "w") as z:
            z.writestr("data/daily/us/nasdaq stocks/1/msft.us.txt",
                       bulk_file("MSFT.US", ("20261124", "470.00"), ("20261125", "475.10")))
            z.writestr("data/daily/us/nasdaq etfs/qqq.us.txt", bulk_file("QQQ.US", ("20261125", "510.00")))
            z.writestr("readme.txt", "not data")

        code, _ = self.run_tool(archive)

        self.assertEqual(code, 0)
        self.assertEqual(read_output(self.out)[1:], [
            ["MSFT", "2026-11-25", "475.10", "470.00", "USD"],
            ["QQQ", "2026-11-25", "510.00", "", "USD"],
        ])

    def test_rows_out_of_order_still_give_the_latest_two(self):
        self.write("ko.us.txt", bulk_file("KO.US", ("20261125", "60.10"), ("20261120", "59.00"), ("20261124", "60.00")))

        self.run_tool(self.dir / "ko.us.txt")

        self.assertEqual(read_output(self.out)[1], ["KO", "2026-11-25", "60.10", "60.00", "USD"])

    def test_per_symbol_downloads_from_the_web_page(self):
        self.write("aapl_us_d.csv", "Date,Open,High,Low,Close,Volume\n"
                                    "2026-11-24,228,230,227,229.50,100\n"
                                    "2026-11-25,229,232,228,231.05,120\n")
        # the Polish site language names the columns differently
        self.write("nvda_us_d.csv", "Data,Otwarcie,Najwyzszy,Najnizszy,Zamkniecie,Wolumen\n"
                                    "2026-11-25,120,122,119,121.40,500\n")

        code, _ = self.run_tool(self.dir / "aapl_us_d.csv", self.dir / "nvda_us_d.csv")

        self.assertEqual(code, 0)
        self.assertEqual(read_output(self.out)[1:], [
            ["AAPL", "2026-11-25", "231.05", "229.50", "USD"],
            ["NVDA", "2026-11-25", "121.40", "", "USD"],
        ])

    def test_only_us_listings_are_kept(self):
        self.write("vod.uk.txt", bulk_file("VOD.UK", ("20261125", "70.12")))
        self.write("brk-b.us.txt", bulk_file("BRK-B.US", ("20261125", "480.00")))

        code, err = self.run_tool(self.dir)

        self.assertEqual(code, 0)
        self.assertEqual([row[0] for row in read_output(self.out)[1:]], ["BRK-B"])
        self.assertIn("1 non-US", err)

    def test_a_symbols_file_limits_the_output(self):
        self.write("a/aapl.us.txt", bulk_file("AAPL.US", ("20261125", "231.05")))
        self.write("a/ibm.us.txt", bulk_file("IBM.US", ("20261125", "250.35")))
        # the price service's own instruments.csv works as a symbols file
        symbols = self.write("instruments.csv", "symbol,name,type,region,currency\nIBM,IBM,Stock,NYSE,USD\n")

        self.run_tool(self.dir / "a", "--symbols", symbols)

        self.assertEqual([row[0] for row in read_output(self.out)[1:]], ["IBM"])

    def test_a_plain_symbols_list_works_too(self):
        self.write("a/aapl.us.txt", bulk_file("AAPL.US", ("20261125", "231.05")))
        self.write("a/ibm.us.txt", bulk_file("IBM.US", ("20261125", "250.35")))
        symbols = self.write("watch.txt", "# my list\naapl\n\n")

        self.run_tool(self.dir / "a", "--symbols", symbols)

        self.assertEqual([row[0] for row in read_output(self.out)[1:]], ["AAPL"])

    def test_since_drops_symbols_whose_last_close_is_older(self):
        self.write("a/old.us.txt", bulk_file("OLD.US", ("20200102", "1.00")))
        self.write("a/ibm.us.txt", bulk_file("IBM.US", ("20261125", "250.35")))

        self.run_tool(self.dir / "a", "--since", "2026-11-01")

        self.assertEqual([row[0] for row in read_output(self.out)[1:]], ["IBM"])

    def test_malformed_rows_are_skipped_and_reported(self):
        self.write("x.us.txt", BULK_HEADER
                   + "X.US,D,20261124,000000,1,1,1,10.00,1,0\n"
                   + "X.US,D,2026-11-25,000000,1,1,1,11.00,1,0\n"   # bad date
                   + "X.US,D,20261125,000000,1,1,1,n/a,1,0\n"        # bad close
                   + "X.US,D,20261125\n")                            # too few columns

        code, err = self.run_tool(self.dir / "x.us.txt")

        self.assertEqual(code, 0)
        self.assertEqual(read_output(self.out)[1], ["X", "2026-11-24", "10.00", "", "USD"])
        self.assertIn("3 rows skipped", err)
        self.assertIn("x.us.txt:3", err)

    def test_weekly_and_intraday_rows_are_ignored(self):
        self.write("y.us.txt", BULK_HEADER
                   + "Y.US,D,20261125,000000,1,1,1,20.00,1,0\n"
                   + "Y.US,W,20261126,000000,1,1,1,99.00,1,0\n"
                   + "Y.US,5,20261126,153000,1,1,1,98.00,1,0\n")

        self.run_tool(self.dir / "y.us.txt")

        self.assertEqual(read_output(self.out)[1], ["Y", "2026-11-25", "20.00", "", "USD"])

    def test_nothing_usable_is_an_error_and_writes_nothing(self):
        self.write("notes.txt", "hello\n")

        code, err = self.run_tool(self.dir / "notes.txt")

        self.assertEqual(code, 1)
        self.assertFalse(self.out.exists())
        self.assertIn("no closes", err)

    def test_a_missing_input_is_a_usage_error(self):
        code, err = self.run_tool(self.dir / "nope.zip")

        self.assertEqual(code, 2)
        self.assertIn("nope.zip", err)

    def test_writes_atomically_leaving_no_temp_files(self):
        self.write("ibm.us.txt", bulk_file("IBM.US", ("20261125", "250.35")))
        self.out.parent.mkdir(parents=True)
        self.out.write_text("old content", encoding="utf-8")

        self.run_tool(self.dir / "ibm.us.txt")

        self.assertEqual(read_output(self.out)[1][0], "IBM")
        self.assertEqual(sorted(os.listdir(self.out.parent)), ["stooq-closes.csv"])


if __name__ == "__main__":
    unittest.main()
