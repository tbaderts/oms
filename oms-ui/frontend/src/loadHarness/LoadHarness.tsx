// LoadHarness.tsx - Measures the live blotter under a synthetic event rate (SPEC-0057 AC-9, AC-10).
//
// Open the app with ?loadHarness, for example
//   /?loadHarness&domain=Order&rate=2000&duration=60&keys=10000&maxRows=2000
// A real StreamingBlotter reads a synthetic stream; the page reports events sent and applied, the
// ingest lag, frame intervals, long tasks and the JS heap, and sets window.__omsLoadResult.
// Run it on the production build in Chrome (performance.memory is Chrome-only).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import StreamingBlotter from '../components/StreamingBlotter';
import { DomainObjectType } from '../types/types';
import { buildReport, Histogram, HeapSample, LoadParams, LoadReport, LongTask } from './metrics';
import { SyntheticStreamingService } from './SyntheticStreamingService';

/** The run's parameters from the URL, with the AC-9 run as the default. */
export function parseLoadParams(search: string): LoadParams {
  const query = new URLSearchParams(search);
  const number = (name: string, fallback: number) => {
    const value = Number(query.get(name));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  return {
    domain: query.get('domain') === 'Execution' ? 'Execution' : 'Order',
    rate: number('rate', 2000),
    duration: number('duration', 60),
    keys: number('keys', 10_000),
    maxRows: number('maxRows', 2000),
  };
}

type Phase = 'running' | 'draining' | 'done';

const LoadHarness: React.FC = () => {
  const params = useMemo(() => parseLoadParams(window.location.search), []);
  const [phase, setPhase] = useState<Phase>('running');
  const [progress, setProgress] = useState({ sent: 0, applied: 0 });
  const [report, setReport] = useState<LoadReport | null>(null);

  const lag = useRef(new Histogram(10_000));
  const frames = useRef(new Histogram(1000));
  const longTasks = useRef<LongTask[]>([]);
  const heapSamples = useRef<HeapSample[]>([]);
  const applied = useRef(0);
  // Whether the page was animated throughout (SPEC-0057): hidden time from visibilitychange, and
  // frame gaps over 1 s (to tell from long tasks, which show the page itself busy).
  const hiddenMs = useRef(0);
  const hiddenSince = useRef<number | null>(null);
  const frameGaps = useRef<Array<{ start: number; end: number }>>([]);
  const lastFrameAt = useRef(0);
  const service = useMemo(() => new SyntheticStreamingService(params, () => setPhase('draining')), [params]);

  // Lag of every event the transaction now reflects: from its receipt to now.
  const onFlush = (eventsApplied: number) => {
    const now = performance.now();
    for (let i = applied.current; i < eventsApplied && i < service.receivedAt.length; i++) {
      lag.current.record(now - service.receivedAt[i]);
    }
    applied.current = Math.max(applied.current, eventsApplied);
  };

  // Frames, long tasks and the heap, while the run lasts.
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const onFrame = (now: number) => {
      if (service.startedAt > 0) {
        frames.current.record(now - last);
        if (now - last > 1000) {
          frameGaps.current.push({ start: last - service.startedAt, end: now - service.startedAt });
        }
      }
      last = now;
      lastFrameAt.current = now;
      frame = requestAnimationFrame(onFrame);
    };
    frame = requestAnimationFrame(onFrame);

    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver(list => {
        list.getEntries().forEach(entry => longTasks.current.push({
          startTime: entry.startTime - service.startedAt,
          duration: entry.duration,
        }));
      });
      observer.observe({ type: 'longtask', buffered: false });
    } catch {
      // No long task API in this browser: AC-9's long task check reads as none observed.
    }

    const onVisibility = () => {
      const now = performance.now();
      if (document.visibilityState === 'hidden') {
        hiddenSince.current = now;
      } else if (hiddenSince.current !== null) {
        hiddenMs.current += now - hiddenSince.current;
        hiddenSince.current = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Every 10 s, with Chrome started with --js-flags=--expose-gc, collect garbage first, so the
    // minute's minimum is the live heap and not garbage-collection timing.
    let tick = 0;
    const sampler = setInterval(() => {
      const memory = (performance as any).memory;
      if (memory && service.startedAt > 0) {
        const gc = (window as any).gc;
        if (typeof gc === 'function' && ++tick % 10 === 0) {
          gc();
        }
        heapSamples.current.push({ t: performance.now() - service.startedAt, bytes: memory.usedJSHeapSize });
      }
      setProgress({ sent: service.sent, applied: applied.current });
    }, 1000);

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      clearInterval(sampler);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [service]);

  // After the last event: wait until the grid shows it (or 5 s), then report.
  useEffect(() => {
    if (phase !== 'draining') return;
    const deadline = performance.now() + 5000;
    const check = setInterval(() => {
      if (applied.current >= service.sent || performance.now() > deadline) {
        clearInterval(check);
        const now = performance.now();
        if (hiddenSince.current !== null) {
          hiddenMs.current += now - hiddenSince.current;
        }
        if (now - lastFrameAt.current > 1000) {
          // Frames stopped and had not resumed by the end of the run.
          frameGaps.current.push({ start: lastFrameAt.current - service.startedAt, end: now - service.startedAt });
        }
        // A gap with a long task in it is the page being busy, which AC-9 judges; a gap without one
        // is Chrome not animating the page, which makes the run invalid.
        const stalledMs = frameGaps.current
          .filter(gap => !longTasks.current.some(task => task.startTime < gap.end && task.startTime + task.duration > gap.start))
          .reduce((sum, gap) => sum + (gap.end - gap.start), 0);
        const result = buildReport({
          params,
          sent: service.sent,
          applied: applied.current,
          lag: lag.current,
          frames: frames.current,
          longTasks: longTasks.current,
          heapSamples: heapSamples.current,
          hiddenMs: Math.round(hiddenMs.current),
          stalledMs: Math.round(stalledMs),
        });
        (window as any).__omsLoadResult = result;
        console.info('[LoadHarness] result', JSON.stringify(result));
        setReport(result);
        setPhase('done');
      }
    }, 100);
    return () => clearInterval(check);
  }, [phase, params, service]);

  const verdict = (pass: boolean | null) => (pass === null ? 'not measured' : pass ? 'PASS' : 'FAIL');

  return (
    // A full-height column: the blotter fills what the header and report leave (its grid sizes to its
    // parent, see SPEC-0056's .blotter-view).
    <div className="load-harness" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="load-harness-header" style={{ padding: '0.5rem 1rem' }}>
        <strong>Load harness</strong> (SPEC-0057) — {params.domain}, {params.rate.toLocaleString('en-US')} events/s
        for {params.duration} s over {params.keys.toLocaleString('en-US')} rows, cap {params.maxRows.toLocaleString('en-US')}
        {' · '}
        <span className="load-harness-phase">{phase}</span>
        {' · '}sent {progress.sent.toLocaleString('en-US')}, applied {progress.applied.toLocaleString('en-US')}
      </div>
      {report && (
        <div className="load-harness-report" style={{ padding: '0 1rem', maxHeight: '40vh', overflow: 'auto' }}>
          {!report.valid && (
            <div className="load-harness-invalid">
              <strong>INVALID RUN</strong>: the page was hidden for {report.hiddenMs} ms or not animated for
              {' '}{report.stalledMs} ms. Keep the window in front, uncovered, and run again.
            </div>
          )}
          <div>AC-9: <strong>{verdict(report.ac9.pass)}</strong> · AC-10: <strong>{verdict(report.ac10.pass)}</strong></div>
          <pre>{JSON.stringify(report, null, 2)}</pre>
        </div>
      )}
      <div className="load-harness-blotter" style={{ flex: 1, minHeight: 0 }}>
        <StreamingBlotter
          domainObject={params.domain as DomainObjectType}
          streamingService={service}
          maxRows={params.maxRows}
          onFlush={onFlush}
          persistState={false}
        />
      </div>
    </div>
  );
};

export default LoadHarness;
