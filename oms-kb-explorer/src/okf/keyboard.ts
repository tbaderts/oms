/** The parts of a DOM element the shortcut rules look at, so they are testable without a DOM. */
export interface KeyTarget {
  tagName?: string;
  isContentEditable?: boolean;
}

/** Whether keys typed here are text: `/` must reach the field, not jump to the search (AC-7). */
export function isTypingTarget(target: KeyTarget | null | undefined): boolean {
  if (!target) return false;
  const tag = (target.tagName ?? '').toUpperCase();
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || Boolean(target.isContentEditable);
}

/** A plain `/` outside a typing target focuses the search (SPEC-0066 AC-7). */
export function isSearchShortcut(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; target: unknown }): boolean {
  return e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target as KeyTarget | null);
}
