# stooq-eod

Turns Stooq end-of-day downloads into the CSV the price service reads from `<data-dir>/eod/`
(SPEC-0079):

```
symbol,date,close,previousClose,currency
AAPL,2026-11-25,231.05,229.50,USD
```

For each US symbol it takes the last daily close, and the close before it as `previousClose`. It
strips `.US` from the ticker and writes `USD`. Other markets are ignored.

Stooq's downloads sit behind a browser check (a JavaScript proof of work, seen 2026-11-26), so they
are downloaded by hand in a browser. This tool only converts them; it never contacts Stooq. Check
Stooq's terms before sharing the data.

Python 3.10 or newer, standard library only. In this repository: `conda activate oms`.

## 1. Download from Stooq

Either:
- **All US stocks, daily:** on stooq.com's database page (`stooq.com/db/h/`), download the US daily
  ASCII archive (`d_us_txt.zip`). One download covers every listing; refresh it as often as you
  need.
- **A few symbols:** on a symbol's page (e.g. `stooq.com/q/d/?s=aapl.us`), download the daily CSV
  (`aapl_us_d.csv`).

## 2. Convert

```bash
# the whole archive (zipped or unpacked), only the symbols the price service lists
python tools/stooq-eod/stooq_eod.py ~/Downloads/d_us_txt.zip \
    --symbols oms-price-service/data/instruments.csv \
    --since 2026-11-01 \
    --out oms-price-service/data/eod/stooq.csv

# a few per-symbol downloads
python tools/stooq-eod/stooq_eod.py ~/Downloads/aapl_us_d.csv ~/Downloads/msft_us_d.csv \
    --out oms-price-service/data/eod/stooq.csv
```

| Option | Meaning |
|---|---|
| `inputs` | the archive (`.zip`), a folder of it, single `.txt` files from it, or per-symbol `.csv` downloads |
| `--out` | the CSV to write; replaced atomically |
| `--symbols` | keep only these: one per line (`#` comments allowed), or a CSV with a `symbol` column, such as the price service's `instruments.csv` |
| `--since` | drop symbols whose last close is older than this date (delisted or stale tickers) |

**What it handles:**
- Malformed rows are skipped, and the first ten are listed with file and line.
- Weekly, monthly and intraday rows are ignored.
- It prints a summary line.

Exit code 0 means written; 1 means no closes were found (nothing is written); 2 means a usage
error.

## 3. Hand it to the price service

- **Host-native run** (`./gradlew bootRun`): write straight into `oms-price-service/data/eod/`.
- **docker compose:**

  ```bash
  docker cp oms-price-service/data/eod/stooq.csv oms-price-service:/data/eod/stooq.csv
  ```

The price service checks `eod/` every minute, with no restart needed. Between files and closes
learned from live quotes, the most recent trading day wins. See
[Price Service](../../oms-knowledge-base/architecture/context/price-service.md).

## Tests

```bash
cd tools/stooq-eod && python -m unittest -v
```
