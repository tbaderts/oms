import type { SpecTicketSummary } from '@shared/types/specTickets';

export type SignalLevel = 'critical' | 'attention' | 'good' | 'info';

export interface Signal {
  /** `ticketId|raw line|occurrence`: stable while older entries leave the log window. */
  key: string;
  ticketId: string;
  title: string;
  owner: string;
  date: string;
  /** HH:MM, or '' for entries without a time ("created"). */
  time: string;
  text: string;
  level: SignalLevel;
  /** Position in the ticket's log window; breaks ties within the same minute. */
  index: number;
}

const ENTRY = /^(\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}))?(?: — | )(.*)$/;

/** A `## Log` entry as written by spec.mjs `logTo()`; unknown lines keep their whole text. */
export function parseLogEntry(raw: string): { date: string; time: string; text: string } {
  const m = raw.match(ENTRY);
  return m ? { date: m[1], time: m[2] ?? '', text: m[3] } : { date: '', time: '', text: raw };
}

const RULES: [RegExp, SignalLevel][] = [
  [/^verify run: fail/, 'critical'],
  [/^blocked:/, 'critical'],
  [/^reopened at /, 'critical'],
  [/^autopilot switched off/, 'critical'],
  [/gate passed; awaiting human approval/, 'attention'],
  [/^verify run: pass/, 'good'],
  [/→ done$/, 'good'],
];

export function classify(text: string): SignalLevel {
  return RULES.find(([re]) => re.test(text))?.[1] ?? 'info';
}

/** All entries of one ticket's log window as signals, oldest first. */
export function signalsOf(ticket: SpecTicketSummary): Signal[] {
  const seen = new Map<string, number>();
  return ticket.recentLog.map((raw, index) => {
    const n = seen.get(raw) ?? 0;
    seen.set(raw, n + 1);
    const { date, time, text } = parseLogEntry(raw);
    return {
      key: `${ticket.id}|${raw}|${n}`,
      ticketId: ticket.id,
      title: ticket.title,
      owner: ticket.owner,
      date,
      time,
      text,
      level: classify(text),
      index,
    };
  });
}

const sortKey = (s: Signal) => (s.date ? `${s.date} ${s.time || '00:00'}` : '');

/** Newest first; within the same minute the later log position wins, then the ticket id. */
export function newestFirst(a: Signal, b: Signal): number {
  return sortKey(b).localeCompare(sortKey(a))
    || (a.ticketId === b.ticketId ? b.index - a.index : a.ticketId.localeCompare(b.ticketId));
}

/** The `limit` most recent signals of the non-archived tickets, newest first. */
export function collectSignals(tickets: SpecTicketSummary[], limit = 20): Signal[] {
  return tickets
    .filter((t) => !t.archived)
    .flatMap(signalsOf)
    .sort(newestFirst)
    .slice(0, limit);
}
