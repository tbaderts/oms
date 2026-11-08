# Load Baseline — 2026-11-08

This is the measured baseline of the order flow, taken before SPEC-0020 (projections) and
SPEC-0022 (order trees) rework the command path (SPEC-0024, AC-6). It was produced by
`LoadSuiteRunnerTest` (see oms-knowledge-base/oms-concepts/exchange-simulator.md §8). The figures
below are copied from that run's report, `build/load-reports/load-baseline-20261108-103813.md`.

## How to compare against it

Rerun the suite with the same shape (500 orders, concurrency 8, 1 fill slice) on the same host,
against a freshly started stack. Then compare the throughput and the percentiles below.

- The numbers depend on the machine, so a run of another shape or on another host is not
  comparable.
- Precision is the histogram bucket bounds. A difference within one bucket is noise, not a
  regression.

## Run configuration

| Setting | Value |
|---|---|
| Started | 2026-11-08T10:38:13Z |
| oms-core | `http://localhost:8090`, root `docker compose` stack, `KAFKA_ENABLED=true` |
| oms-core image | `sha256:730399e47f29…`, built 2026-11-08T07:38Z from the uncommitted working tree on top of `9263c59`. That tree already held in-progress SPEC-0048 outbox changes (`OutboxNudge`, relay leadership), so this is not tied to a commit; see the note below |
| Exchange simulator image | `sha256:c9a037da085d…`, built 2026-11-02T12:17Z |
| Simulator | `SIMULATOR_FILL_SLICES=1`, `SIMULATOR_FILL_DELAY=0ms` |
| Orders | 500 MARKET BUY AAPL, 100 each, via `POST /api/command/execute` |
| Concurrency | 8 creates in flight |
| Fill slices per order | 1 |
| Host | AMD Ryzen 7 6800H (16 threads), 31 GB RAM, Windows 11, Docker Desktop |

## Throughput

| Measure | Value |
|---|---|
| Duration (first submit → last order terminal) | 18.93 s |
| Commands applied | 1500 (500 creates over REST + 1000 accepts and fills from Kafka) |
| **Throughput** | **79.25 commands/s** |
| Orders ending FILLED | 500 of 500 |

## Command latency (SLA timers, ms)

| Timer | Observations | p50 | p95 | p99 |
|---|---|---|---|---|
| `oms_order_time_to_ack` | 500 | 1.35 | 12.26 | 24.12 |
| `oms_order_oms_processing_time` | 500 | 1.40 | 13.11 | 24.12 |
| `oms_order_market_round_trip` | 500 | 9052.47 | 13765.92 | 14206.43 |
| `oms_order_time_to_market` | 500 | 9052.47 | 13765.92 | 14206.43 |

## Reading the numbers

- **OMS processing is fast.** From ingress until the order is released downstream, p99 is
  about 24 ms. The command path itself is not the bottleneck at this load.
- **The market round trip is queueing, not work.**
  - The 500 creates are submitted in a few seconds, faster than the
    outbox → `orders` topic → simulator → commands topic → OMS consumer loop returns the acks.
  - Each order's round trip therefore includes the time it waited in that backlog. That is why
    the median is about 9 s and the tail grows toward the end of the run.
  - The figure measures the drain rate of the asynchronous leg under a burst. It is not
    per-message latency.
- **Throughput is limited by the asynchronous leg.** The 79 commands/s is end-to-end, bounded by
  how fast accepts and fills come back through Kafka.
  - The architecture review's estimate of about 500 messages/s per outbox instance (finding 7)
    is not reached in this flow.
  - This run does not isolate which hop limits it: the outbox relay, the simulator, or the
    consumer.

**Run-to-run variance.** A second run of the same shape against the same stack, at
2026-11-08T10:50:01Z (`load-baseline-20261108-105001.md`), measured:
- throughput: 103.89 commands/s (14.44 s);
- OMS processing: p50 0.58 / p95 2.10 / p99 5.00 ms;
- market round trip: p50 5785 / p95 10003 / p99 11155 ms.

That run had a warm JVM, against the first run's cold start. Throughput moved by about 30% and the
OMS-side percentiles by a factor of about 5 between two consecutive runs. Treat one run as noisy:
- warm up with one discarded run;
- compare the median of three runs of the same shape;
- read a change smaller than that spread as noise.

The first run's figures above stay the recorded baseline, because they come from the first run
on that image.

**Provenance.** The measured build was the working tree of that morning, not a commit. That tree
included SPEC-0048's outbox nudge, which acts on the asynchronous leg that limits this baseline.
Rerun the suite once that work is committed and record the commit sha here. Until then, a
comparison should use a run of the same image.

These are the numbers SPEC-0020 and SPEC-0022 are measured against.
