/**
 * A small parser for the Prometheus text exposition format, plus the three reductions the
 * Monitoring panels need on scraped text (SPEC-0076): a sum, a group-by-label and a histogram
 * quantile. Dependency-free on purpose; it never throws, and lines it cannot read are skipped.
 */

export interface Sample {
  name: string;
  labels: Record<string, string>;
  value: number;
}

const LINE = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{.*\})?\s+(\S+)(?:\s+-?\d+)?$/;

/** Every sample line of a scrape. `NaN`, `+Inf` and `-Inf` values are kept as numbers. */
export function parsePrometheusText(raw: string | null | undefined): Sample[] {
  const samples: Sample[] = [];
  if (!raw) return samples;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = LINE.exec(trimmed);
    if (!m) continue;
    const labels = m[2] ? parseLabels(m[2]) : {};
    if (labels === null) continue;
    const value = parseValue(m[3]);
    if (value === null) continue;
    samples.push({ name: m[1], labels, value });
  }
  return samples;
}

function parseValue(text: string): number | null {
  if (text === '+Inf' || text === 'Inf') return Infinity;
  if (text === '-Inf') return -Infinity;
  if (text === 'NaN') return NaN;
  const v = Number(text);
  return Number.isNaN(v) ? null : v;
}

/** `{a="x",b="y \"q\""}` → `{ a: 'x', b: 'y "q"' }`; null when malformed. */
function parseLabels(group: string): Record<string, string> | null {
  const labels: Record<string, string> = {};
  let i = 1;
  const end = group.length - 1;
  while (i < end) {
    while (i < end && (group[i] === ',' || group[i] === ' ')) i++;
    if (i >= end) break;
    const eq = group.indexOf('=', i);
    if (eq < 0 || group[eq + 1] !== '"') return null;
    const key = group.slice(i, eq).trim();
    let j = eq + 2;
    let value = '';
    while (j < end && group[j] !== '"') {
      if (group[j] === '\\' && j + 1 < end) {
        const next = group[j + 1];
        value += next === 'n' ? '\n' : next;
        j += 2;
      } else {
        value += group[j++];
      }
    }
    if (group[j] !== '"') return null;
    labels[key] = value;
    i = j + 1;
  }
  return labels;
}

const matches = (s: Sample, metric: string, labels: Record<string, string> = {}) =>
  s.name === metric && Object.entries(labels).every(([k, v]) => s.labels[k] === v);

/** The sum of every finite sample of `metric` whose labels include `labels`; null when none matches. */
export function sumMatching(samples: Sample[], metric: string, labels?: Record<string, string>): number | null {
  let sum: number | null = null;
  for (const s of samples) {
    if (matches(s, metric, labels) && Number.isFinite(s.value)) sum = (sum ?? 0) + s.value;
  }
  return sum;
}

/** One entry per value of label `by`, summed, in first-seen order. Samples without the label are skipped. */
export function groupBy(samples: Sample[], metric: string, by: string, labels?: Record<string, string>): { label: string; value: number }[] {
  const out = new Map<string, number>();
  for (const s of samples) {
    if (!matches(s, metric, labels) || !Number.isFinite(s.value)) continue;
    const key = s.labels[by];
    if (key === undefined) continue;
    out.set(key, (out.get(key) ?? 0) + s.value);
  }
  return [...out].map(([label, value]) => ({ label, value }));
}

/**
 * The `q` quantile of histogram `metric` (read from `<metric>_bucket`, buckets summed per `le`
 * across series), with Prometheus `histogram_quantile` semantics: linear interpolation inside the
 * bucket the rank falls in; the highest finite bound when it falls in `+Inf`. Null when there are
 * no buckets or no observations.
 */
export function histogramQuantile(samples: Sample[], metric: string, q: number, labels?: Record<string, string>): number | null {
  const byLe = new Map<number, number>();
  for (const s of samples) {
    if (!matches(s, `${metric}_bucket`, labels)) continue;
    const le = parseValue(s.labels.le ?? '');
    if (le === null || Number.isNaN(le) || !Number.isFinite(s.value)) continue;
    byLe.set(le, (byLe.get(le) ?? 0) + s.value);
  }
  const buckets = [...byLe].map(([le, count]) => ({ le, count })).sort((a, b) => a.le - b.le);
  if (!buckets.length || buckets[buckets.length - 1].le !== Infinity) return null;
  const total = buckets[buckets.length - 1].count;
  if (total <= 0) return null;

  const rank = q * total;
  let prevLe = 0;
  let prevCount = 0;
  for (const b of buckets) {
    if (b.count >= rank) {
      if (b.le === Infinity) return buckets.length > 1 ? buckets[buckets.length - 2].le : null;
      const inBucket = b.count - prevCount;
      if (inBucket <= 0) return b.le;
      return prevLe + (b.le - prevLe) * ((rank - prevCount) / inBucket);
    }
    prevLe = b.le;
    prevCount = b.count;
  }
  return null;
}
