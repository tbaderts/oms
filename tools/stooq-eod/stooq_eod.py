"""Convert Stooq end-of-day downloads into the price service's end-of-day CSV (SPEC-0079).

Stooq's downloads are behind a browser check, so they are fetched by hand in a browser; this tool
only converts what was downloaded. It reads:

* the bulk daily archive (e.g. ``d_us_txt.zip``), zipped or unpacked, or single files from it:
  ``<TICKER>,<PER>,<DATE>,<TIME>,<OPEN>,<HIGH>,<LOW>,<CLOSE>,<VOL>,<OPENINT>`` with tickers like
  ``AAPL.US`` and dates like ``20261125``;
* per-symbol downloads from a symbol's page, e.g. ``aapl_us_d.csv``:
  ``Date,Open,High,Low,Close,Volume`` (or the Polish column names).

For each US symbol it writes the last close and the one before it, as the price service reads them
from ``<data-dir>/eod/*.csv``::

    symbol,date,close,previousClose,currency
    AAPL,2026-11-25,231.05,229.50,USD

Standard library only. Exit codes: 0 written, 1 nothing usable found, 2 usage error.
"""

from __future__ import annotations

import argparse
import csv
import io
import os
import re
import sys
import tempfile
import zipfile
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Iterable, Iterator, TextIO

OUTPUT_HEADER = ["symbol", "date", "close", "previousClose", "currency"]
BULK_HEADER = "<TICKER>"
WEB_DATE_COLUMNS = {"date", "data"}
WEB_CLOSE_COLUMNS = {"close", "zamkniecie"}
DATA_SUFFIXES = (".txt", ".csv")
MAX_REPORTED_PROBLEMS = 10


@dataclass
class Closes:
    """The two latest closes seen for one symbol."""

    last: tuple[date, str] | None = None
    previous: tuple[date, str] | None = None

    def add(self, day: date, close: str) -> None:
        if self.last is None or day > self.last[0]:
            if self.last is not None:
                self.previous = self.last
            self.last = (day, close)
        elif day < self.last[0] and (self.previous is None or day > self.previous[0]):
            self.previous = (day, close)


@dataclass
class Report:
    files: int = 0
    skipped_rows: int = 0
    non_us: set[str] = field(default_factory=set)
    problems: list[str] = field(default_factory=list)

    def problem(self, where: str, why: str) -> None:
        self.skipped_rows += 1
        if len(self.problems) < MAX_REPORTED_PROBLEMS:
            self.problems.append(f"{where}: {why}")


def parse_date(text: str, bulk: bool) -> date:
    """``20261125`` in the bulk archive, ``2026-11-25`` in per-symbol downloads."""
    text = text.strip()
    if bulk and re.fullmatch(r"\d{8}", text):
        return date(int(text[:4]), int(text[4:6]), int(text[6:]))
    if not bulk and re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        return date.fromisoformat(text)
    raise ValueError("date is not " + ("yyyymmdd" if bulk else "yyyy-mm-dd"))


def parse_close(text: str) -> str:
    """The close as written, if it is a positive number; kept as text so no digits change."""
    text = text.strip()
    try:
        value = Decimal(text)
    except InvalidOperation:
        raise ValueError("close is not a number") from None
    if value <= 0:
        raise ValueError("close is not positive")
    return text


def us_symbol(ticker: str) -> str | None:
    """``AAPL.US`` -> ``AAPL``; another market -> None; no market suffix is taken as US."""
    ticker = ticker.strip().upper()
    if "." not in ticker:
        return ticker or None
    base, _, market = ticker.rpartition(".")
    return base if market == "US" and base else None


def symbol_from_filename(name: str) -> str:
    """``aapl_us_d.csv`` / ``aapl.us.txt`` -> ``AAPL.US``; ``nvda.csv`` -> ``NVDA``."""
    stem = Path(name).name.rsplit(".", 1)[0]
    stem = re.sub(r"_d$", "", stem, flags=re.IGNORECASE)
    stem = re.sub(r"_([a-z]{2})$", r".\1", stem, flags=re.IGNORECASE)
    return stem.upper()


def read_rows(name: str, text: TextIO, closes: dict[str, Closes], report: Report) -> bool:
    """Adds one file's daily closes; False when the file is not a Stooq price file."""
    reader = csv.reader(text)
    header = next(reader, None)
    if not header:
        return False
    first = header[0].strip().lstrip("﻿")
    if first.upper() == BULK_HEADER:
        read_bulk(name, reader, closes, report)
        return True
    columns = [c.strip().lstrip("﻿").lower() for c in header]
    date_col = next((i for i, c in enumerate(columns) if c in WEB_DATE_COLUMNS), None)
    close_col = next((i for i, c in enumerate(columns) if c in WEB_CLOSE_COLUMNS), None)
    if date_col is None or close_col is None:
        return False
    read_web(name, reader, date_col, close_col, closes, report)
    return True


def read_bulk(name: str, reader: Iterable[list[str]], closes: dict[str, Closes], report: Report) -> None:
    for line_number, row in enumerate(reader, start=2):
        if not row or not "".join(row).strip():
            continue
        if len(row) < 8:
            report.problem(f"{name}:{line_number}", f"expected 10 columns, found {len(row)}")
            continue
        if row[1].strip().upper() != "D":
            continue  # weekly, monthly or intraday rows
        symbol = us_symbol(row[0])
        if symbol is None:
            report.non_us.add(row[0].strip().upper())
            continue
        add(symbol, row[2], row[7], True, f"{name}:{line_number}", closes, report)


def read_web(name: str, reader: Iterable[list[str]], date_col: int, close_col: int,
             closes: dict[str, Closes], report: Report) -> None:
    ticker = symbol_from_filename(name)
    symbol = us_symbol(ticker)
    if symbol is None:
        report.non_us.add(ticker)
        return
    for line_number, row in enumerate(reader, start=2):
        if not row or not "".join(row).strip():
            continue
        if len(row) <= max(date_col, close_col):
            report.problem(f"{name}:{line_number}", f"expected at least {max(date_col, close_col) + 1} columns")
            continue
        add(symbol, row[date_col], row[close_col], False, f"{name}:{line_number}", closes, report)


def add(symbol: str, date_text: str, close_text: str, bulk: bool, where: str,
        closes: dict[str, Closes], report: Report) -> None:
    try:
        day = parse_date(date_text, bulk)
        close = parse_close(close_text)
    except ValueError as e:
        report.problem(where, str(e))
        return
    closes.setdefault(symbol, Closes()).add(day, close)


def data_files(path: Path) -> Iterator[tuple[str, TextIO]]:
    """Every price file under a path: a file, a folder (recursively) or a zip archive."""
    if path.is_dir():
        for child in sorted(path.rglob("*")):
            if child.is_file():
                yield from data_files(child)
    elif path.suffix.lower() == ".zip":
        with zipfile.ZipFile(path) as archive:
            for member in sorted(archive.namelist()):
                if member.lower().endswith(DATA_SUFFIXES):
                    with archive.open(member) as raw:
                        yield member, io.TextIOWrapper(raw, encoding="utf-8", errors="replace", newline="")
    elif path.suffix.lower() in DATA_SUFFIXES:
        with path.open(encoding="utf-8", errors="replace", newline="") as f:
            yield path.name, f


def read_symbols(path: Path) -> set[str]:
    """One symbol per line (# comments allowed), or a CSV with a ``symbol`` column."""
    lines = [l.strip() for l in path.read_text(encoding="utf-8").splitlines()]
    lines = [l for l in lines if l and not l.startswith("#")]
    if lines and "," in lines[0] and "symbol" in [c.strip().lower() for c in lines[0].split(",")]:
        reader = csv.DictReader(io.StringIO("\n".join(lines)))
        key = next(k for k in reader.fieldnames if k.strip().lower() == "symbol")
        return {row[key].strip().upper() for row in reader if row.get(key, "").strip()}
    return {l.split(",")[0].strip().upper() for l in lines}


def write_atomically(out: Path, rows: list[list[str]]) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix=out.name, suffix=".tmp", dir=out.parent)
    try:
        with os.fdopen(fd, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f, lineterminator="\n")
            writer.writerow(OUTPUT_HEADER)
            writer.writerows(rows)
        os.replace(temp, out)
    finally:
        if os.path.exists(temp):
            os.remove(temp)


def main(argv: list[str] | None = None, stderr: TextIO = sys.stderr) -> int:
    parser = argparse.ArgumentParser(
        description="Convert Stooq end-of-day downloads into the price service's eod CSV.")
    parser.add_argument("inputs", nargs="+", type=Path,
                        help="Stooq files: the bulk archive (.zip), a folder of it, .txt or per-symbol .csv files")
    parser.add_argument("--out", type=Path, required=True,
                        help="the CSV to write, e.g. oms-price-service/data/eod/stooq.csv")
    parser.add_argument("--symbols", type=Path,
                        help="keep only these: one per line, or a CSV with a symbol column (e.g. instruments.csv)")
    parser.add_argument("--since", type=date.fromisoformat,
                        help="drop symbols whose last close is older than this date (yyyy-mm-dd)")
    try:
        args = parser.parse_args(argv)
    except SystemExit as e:
        return 2 if e.code else 0

    # PowerShell hands "~" to python unexpanded; expand it here so the README's commands work anywhere.
    args.inputs = [p.expanduser() for p in args.inputs]
    args.out = args.out.expanduser()
    args.symbols = args.symbols.expanduser() if args.symbols else None

    missing = [str(p) for p in args.inputs if not p.exists()]
    if args.symbols is not None and not args.symbols.is_file():
        missing.append(f"{args.symbols} (--symbols)")
    if missing:
        print(f"stooq-eod: not found: {', '.join(missing)}", file=stderr)
        return 2
    wanted = read_symbols(args.symbols) if args.symbols else None

    closes: dict[str, Closes] = {}
    report = Report()
    for path in args.inputs:
        for name, text in data_files(path):
            if read_rows(name, text, closes, report):
                report.files += 1

    rows = []
    for symbol in sorted(closes):
        c = closes[symbol]
        if c.last is None or (wanted is not None and symbol not in wanted):
            continue
        if args.since is not None and c.last[0] < args.since:
            continue
        rows.append([symbol, c.last[0].isoformat(), c.last[1], c.previous[1] if c.previous else "", "USD"])

    for problem in report.problems:
        print(f"stooq-eod: skipped {problem}", file=stderr)
    summary = (f"stooq-eod: {report.files} file(s) read, {len(rows)} symbol(s) written, "
               f"{report.skipped_rows} rows skipped, {len(report.non_us)} non-US ticker(s) ignored")
    if not rows:
        print(summary, file=stderr)
        print("stooq-eod: no closes found; nothing written", file=stderr)
        return 1
    write_atomically(args.out, rows)
    print(summary + f" -> {args.out}", file=stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
