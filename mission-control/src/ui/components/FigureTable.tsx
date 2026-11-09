import { DELTAS, FIGURES, FIGURE_LABELS, type RunSummary } from '../../shared/types';
import { fmtMs } from '../api';

const DELTA_LABELS = { omsAck: 'OMS ack (ackTime − received)', omsToMarket: 'OMS to market (marketSend − received)', marketRoundTrip: 'Market round trip (marketAck − marketSend)' } as const;

/** count / p50 / p95 / p99 / max per figure, then the OMS checkpoint deltas. */
export function FigureTable({ summary }: { summary: RunSummary }) {
  const rows = [
    ...FIGURES.map((f) => ({ key: f, label: FIGURE_LABELS[f], s: summary.figures[f], group: 'Mission Control clock' })),
    ...DELTAS.map((d) => ({ key: d, label: DELTA_LABELS[d], s: summary.deltas[d], group: 'OMS checkpoints' })),
  ];
  return (
    <table className="w-full text-sm" data-testid="figure-table">
      <thead className="text-left text-slate-400">
        <tr>
          <th className="py-1">Figure</th>
          <th>count</th>
          <th>p50</th>
          <th>p95</th>
          <th>p99</th>
          <th>max</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ key, label, s, group }) => (
          <tr key={key} data-testid={`row-${key}`} className="border-t border-slate-800" title={group}>
            <td className="py-1">{label}</td>
            <td>{s.count}</td>
            <td>{fmtMs(s.p50)}</td>
            <td>{fmtMs(s.p95)}</td>
            <td>{fmtMs(s.p99)}</td>
            <td>{fmtMs(s.max)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
