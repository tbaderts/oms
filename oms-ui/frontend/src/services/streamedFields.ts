// streamedFields.ts - which blotter columns live (streaming) mode can fill (SPEC-0056)
import { DomainObjectType } from '../types/types';
import STREAMED_FIELDS from '../config/streamedFields.json';

/**
 * The metamodel fields the streaming service sends, per domain object. Live mode cannot fill any
 * other column: such a column stays in the saved column choice for History mode, but is not shown
 * live. oms-streaming-service's StreamedFieldsTest checks every listed field is in its DTOs.
 */
const streamed: Record<string, ReadonlySet<string>> = Object.fromEntries(
  Object.entries(STREAMED_FIELDS as Record<string, string[]>).map(([domain, fields]) => [domain, new Set(fields)])
);

export function isStreamed(domainObject: DomainObjectType, field: string): boolean {
  return streamed[domainObject]?.has(field) ?? false;
}

export function streamedFieldsOf(domainObject: DomainObjectType): string[] {
  return Array.from(streamed[domainObject] ?? []);
}

/** The saved columns split into those live mode can show and those only History mode can. */
export function splitColumns(domainObject: DomainObjectType, columns: string[]): { live: string[]; historyOnly: string[] } {
  return {
    live: columns.filter(column => isStreamed(domainObject, column)),
    historyOnly: columns.filter(column => !isStreamed(domainObject, column)),
  };
}

/**
 * The saved columns after a selection made in live mode: the live selection, with every
 * history-only column of the previous choice kept at its place, so History mode still shows it.
 */
export function mergeLiveSelection(domainObject: DomainObjectType, saved: string[], liveSelection: string[]): string[] {
  const merged = [...liveSelection];
  saved.forEach((column, index) => {
    if (!isStreamed(domainObject, column) && !merged.includes(column)) {
      merged.splice(Math.min(index, merged.length), 0, column);
    }
  });
  return merged;
}
