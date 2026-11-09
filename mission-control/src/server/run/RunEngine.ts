import { randomBytes } from 'node:crypto';
import { DELTAS, runConfig, type RunConfig, type RunConfigInput, type RunStatus, type RunSummary, type Snapshot } from '../../shared/types.js';
import type { Clock } from '../clock.js';
import type { EventSource } from '../kafka/EventConsumer.js';
import { silentLogger, type Logger } from '../log.js';
import type { OmsClient } from '../oms/OmsClient.js';
import { LoadGenerator } from './LoadGenerator.js';
import { OrderTracker } from './OrderTracker.js';
import type { Refusal } from './Preflight.js';
import { RunStats } from './RunStats.js';
import type { RunStore, StoredRun } from './RunStore.js';

export class RunRefusedError extends Error {
  constructor(readonly refusal: Refusal) {
    super(`run refused by ${refusal.check}: ${refusal.detail}`);
  }
}

export class ActiveRunError extends Error {
  constructor(readonly runId: string) {
    super(`run ${runId} is still active`);
  }
}

export interface EngineDeps {
  clock: Clock;
  store: RunStore;
  eventSource: () => EventSource;
  client: (baseUrl: string, timeoutMs: number) => Pick<OmsClient, 'create' | 'close'>;
  preflight: (config: RunConfig) => Promise<Refusal | null>;
  log?: Logger;
  drainPollMs?: number;
}

interface ActiveRun {
  runId: string;
  config: RunConfig;
  status: RunStatus;
  startedAt: number;
  endedAt?: number;
  stats: RunStats;
  tracker: OrderTracker;
  generator: LoadGenerator;
  source: EventSource;
  client: Pick<OmsClient, 'create' | 'close'>;
  stopRequested: boolean;
  createErrors: RunSummary['createErrors'];
  created: number;
  done: Promise<void>;
}

/** A sortable, path-safe run id: UTC timestamp plus a random suffix. */
export function newRunId(now: number): string {
  const iso = new Date(now).toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  return `${iso}-${randomBytes(2).toString('hex')}`;
}

/**
 * One run at a time: PREFLIGHT → RUNNING → DRAINING → COMPLETED, or STOPPED on request, or
 * REFUSED before anything is sent (design: Run lifecycle).
 */
export class RunEngine {
  private active: ActiveRun | null = null;
  private readonly log: Logger;

  constructor(private readonly d: EngineDeps) {
    this.log = d.log ?? silentLogger;
  }

  /** Validates, preflights, subscribes and starts sending; resolves once sending has begun. */
  async start(input: RunConfigInput): Promise<{ runId: string }> {
    const config = runConfig.parse(input);
    if (this.active) throw new ActiveRunError(this.active.runId);
    // Reserve the slot before the first await so two concurrent starts cannot both pass.
    const placeholder = { runId: 'pending' } as ActiveRun;
    this.active = placeholder;
    try {
      const refusal = await this.d.preflight(config);
      if (refusal) throw new RunRefusedError(refusal);

      const startedAt = this.d.clock.now();
      const runId = newRunId(startedAt);
      const sessionId = `mc-${runId}`;
      const log = this.log.child({ runId });
      const source = this.d.eventSource();
      const stats = new RunStats(startedAt);
      const tracker = new OrderTracker(sessionId, this.d.clock, stats);
      try {
        await source.start(`mission-control-${runId}`, (ev) => tracker.onEvent(ev));
      } catch (e) {
        await source.stop().catch(() => {});
        throw new RunRefusedError({ check: 'kafka', detail: (e as Error).message });
      }

      const client = this.d.client(config.omsBaseUrl, config.requestTimeoutMs);
      const run: ActiveRun = {
        runId,
        config,
        status: 'RUNNING',
        startedAt,
        stats,
        tracker,
        source,
        client,
        stopRequested: false,
        createErrors: [],
        created: 0,
        done: Promise.resolve(),
        generator: undefined as unknown as LoadGenerator,
      };
      run.generator = new LoadGenerator({
        runId,
        sessionId,
        rate: config.rate,
        durationSec: config.durationSec,
        template: config.template,
        client,
        clock: this.d.clock,
        events: {
          onSend: (seq, clOrdId, scheduledAt, sentAt) => {
            tracker.register(seq, clOrdId, scheduledAt);
            tracker.markSent(clOrdId, sentAt);
            stats.recordSubmitted(sentAt);
          },
          onAck: (clOrdId, orderId, at) => {
            run.created++;
            tracker.markAck(clOrdId, orderId, at);
          },
          onError: (clOrdId, error) => {
            run.createErrors.push({ clOrdId, ...error });
            tracker.markError(clOrdId, error);
            log.warn('create failed', { clOrdId, status: error.status, error: error.message });
          },
        },
      });
      this.active = run;
      log.info('run started', { rate: config.rate, durationSec: config.durationSec, omsBaseUrl: config.omsBaseUrl });
      run.done = this.drive(run, log);
      return { runId };
    } catch (e) {
      if (this.active === placeholder) this.active = null;
      throw e;
    }
  }

  stop(runId: string): boolean {
    const run = this.active;
    if (!run || run.runId !== runId || run.status === 'COMPLETED' || run.status === 'STOPPED') return false;
    run.stopRequested = true;
    run.generator.stop();
    return true;
  }

  activeRunId(): string | null {
    return this.active && this.active.runId !== 'pending' ? this.active.runId : null;
  }

  activeConfig(): RunConfig | null {
    return this.activeRunId() ? this.active!.config : null;
  }

  /** Samples of the active run so far (the API serves them while it runs). */
  activeSamples() {
    return this.activeRunId() ? this.active!.tracker.samples() : null;
  }

  /** The live view of the active run, or null when idle. */
  snapshot(): Snapshot | null {
    const run = this.active;
    if (!run || run.runId === 'pending') return null;
    return { summary: this.summary(run), series: run.stats.series(run.endedAt ?? this.d.clock.now()) };
  }

  /** Resolves when no run is active. */
  async idle(): Promise<void> {
    while (this.active) await (this.active.runId === 'pending' ? new Promise((r) => setTimeout(r, 10)) : this.active.done);
  }

  private async drive(run: ActiveRun, log: Logger): Promise<void> {
    try {
      await run.generator.run();
      if (!run.stopRequested) {
        run.status = 'DRAINING';
        const deadline = this.d.clock.now() + run.config.completionTimeoutSec * 1000;
        while (!run.stopRequested && !run.tracker.allTerminal() && this.d.clock.now() < deadline) {
          await new Promise((r) => setTimeout(r, this.d.drainPollMs ?? 100));
        }
      }
      run.status = run.stopRequested ? 'STOPPED' : 'COMPLETED';
      run.endedAt = this.d.clock.now();
      const stored: StoredRun = {
        formatVersion: 1,
        config: run.config,
        summary: this.summary(run),
        series: run.stats.series(run.endedAt),
        samples: run.tracker.samples(),
      };
      await this.d.store.save(stored);
      log.info('run finished', { status: run.status, sent: stored.summary.sent, created: stored.summary.created, incomplete: stored.summary.incomplete.length });
    } catch (e) {
      log.error('run failed', { err: e });
    } finally {
      await run.source.stop().catch((e) => log.warn('consumer stop failed', { err: e }));
      await run.client.close().catch(() => {});
      this.active = null;
    }
  }

  private summary(run: ActiveRun): RunSummary {
    const g = run.generator.result();
    const finished = run.status === 'COMPLETED' || run.status === 'STOPPED';
    const deltas = run.tracker.deltaStats();
    return {
      runId: run.runId,
      label: run.config.label,
      status: run.status,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      targetRate: g.targetRate,
      achievedRate: g.achievedRate,
      p99LatenessMs: g.p99LatenessMs,
      generatorLimited: g.generatorLimited,
      scheduled: g.scheduled,
      sent: g.sent,
      created: run.created,
      createErrors: [...run.createErrors].sort((a, b) => seqOf(a.clOrdId) - seqOf(b.clOrdId)),
      rejected: run.tracker.rejected(),
      // While the run is live every open order is simply in flight; only a finished run has incomplete orders.
      incomplete: finished ? run.tracker.incomplete() : [],
      stateCounts: run.tracker.stateCounts(),
      decodeErrors: run.source.decodeErrors,
      figures: run.stats.figureStats(),
      deltas: Object.fromEntries(DELTAS.map((d) => [d, deltas[d]])) as RunSummary['deltas'],
    };
  }
}

function seqOf(clOrdId: string): number {
  return Number(clOrdId.slice(clOrdId.lastIndexOf('-') + 1));
}
