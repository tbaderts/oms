// dateFilter.ts - One meaning for a date column filter, in the grid and on the server.
//
// AG Grid's date filter picks calendar days ("today", "before 25 Nov") in the browser's time zone,
// the zone the blotters display times in (DateTimeService.formatForDisplay). Its model carries the
// day as "YYYY-MM-DD HH:mm:ss" with no zone. The backend's filters compare ISO-8601 instants
// (Instant.parse) and skip a value they cannot parse. So a day is sent as the instants of its local
// midnights: "equals 25 Nov" is from 25 Nov 00:00 local up to, not including, 26 Nov 00:00 local.
// The grid filters the rows it holds with the same day semantics (localDayComparator).
import { IDateFilterParams } from 'ag-grid-community';
import { FilterCondition } from '../types/types';

/** The AG Grid date filter model, as getFilterModel() returns it for one condition. */
export interface DateFilterModel {
  filterType?: string;
  type?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}

/** "YYYY-MM-DD[ HH:mm:ss]" (AG Grid's model) → that calendar day, at local midnight. */
function localDay(value: string | null | undefined): Date | null {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Local midnight of `day` plus `days`, as an instant. The Date constructor handles month ends and DST. */
function startOf(day: Date, days = 0): string {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + days).toISOString();
}

/**
 * The server filters for one date column's grid filter. Operators the server cannot express (not
 * equal, blank) give none; DATE_FILTER_PARAMS does not offer them.
 */
export function dateFilterToConditions(field: string, model: DateFilterModel): FilterCondition[] {
  const from = localDay(model.dateFrom);
  if (!from) return [];
  const condition = (operation: '__gte' | '__lt', value: string): FilterCondition => ({ field, operation, value });
  switch (model.type) {
    case 'equals':
      return [condition('__gte', startOf(from)), condition('__lt', startOf(from, 1))];
    case 'lessThan':
      return [condition('__lt', startOf(from))];
    case 'greaterThan':
      return [condition('__gte', startOf(from, 1))];
    case 'inRange': {
      const to = localDay(model.dateTo);
      return to ? [condition('__gte', startOf(from)), condition('__lt', startOf(to, 1))] : [];
    }
    default:
      return [];
  }
}

/**
 * AG Grid's date filter comparator: the cell's ISO instant against the filter's day, by the cell's
 * local calendar day. Negative: the cell is on an earlier day; positive: a later one. A missing or
 * unreadable time never equals a day.
 */
export function localDayComparator(filterLocalDateAtMidnight: Date, cellValue: unknown): number {
  const time = typeof cellValue === 'string' ? new Date(cellValue) : null;
  if (!time || Number.isNaN(time.getTime())) return -1;
  const cellDay = new Date(time.getFullYear(), time.getMonth(), time.getDate()).getTime();
  return cellDay - filterLocalDateAtMidnight.getTime();
}

/**
 * Date columns' filter: the operators the server answers, one condition (the server ANDs filters and
 * has no OR), ranges including both days, and the comparator above. Shared by both blotters.
 */
export const DATE_FILTER_PARAMS: IDateFilterParams = {
  filterOptions: ['equals', 'lessThan', 'greaterThan', 'inRange'],
  maxNumConditions: 1,
  inRangeInclusive: true,
  comparator: localDayComparator,
};
