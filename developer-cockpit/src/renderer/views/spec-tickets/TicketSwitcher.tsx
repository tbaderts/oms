import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useSpecTicketsStore } from '@/stores/specTickets';
import { StageBadge } from './StageProgress';

/**
 * Searchable ticket picker for the Spec Tickets header (ARIA combobox + listbox). Selecting goes
 * through the store's select(), so the unsaved-edit guard applies.
 */
export function TicketSwitcher() {
  const tickets = useSpecTicketsStore((s) => s.tickets);
  const selectedId = useSpecTicketsStore((s) => s.selectedId);
  const select = useSpecTicketsStore((s) => s.select);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  const current = tickets.find((t) => t.id === selectedId);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? tickets.filter((t) => t.id.toLowerCase().includes(q) || t.title.toLowerCase().includes(q)) : tickets;
  }, [tickets, query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Keep the keyboard-active option visible in the scrolling list.
  useEffect(() => {
    if (open) document.getElementById(`${listId}-option-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, listId]);

  const show = () => {
    setQuery('');
    setActive(0);
    setOpen(true);
  };
  /** Closes the popup; `refocus` returns focus to the trigger (keyboard close or selection). */
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };
  const choose = (id: string | undefined) => {
    if (!id) return;
    close(true);
    select(id);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!matches.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (a + step + matches.length) % matches.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(matches[active]?.id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    }
  };
  const optionId = (i: number) => `${listId}-option-${i}`;

  return (
    <div ref={rootRef} className="relative w-[28rem] max-w-full">
      <Button
        ref={triggerRef}
        variant="outline"
        aria-label="Switch ticket"
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full justify-between font-normal"
        onClick={() => (open ? setOpen(false) : show())}
      >
        <span className="truncate">
          {current ? (
            <><span className="font-mono text-xs text-muted-foreground">{current.id}</span> {current.title}</>
          ) : (
            <span className="text-muted-foreground">Select a ticket…</span>
          )}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>

      {open && (
        <div
          className="absolute left-0 right-0 z-50 mt-1 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          // Clicks on the popup's padding or empty text must not blur the input (which closes it);
          // the input itself keeps normal mouse behaviour.
          onMouseDown={(e) => {
            if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
          }}
        >
          <Input
            autoFocus
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={matches.length ? optionId(active) : undefined}
            placeholder="Search id or title"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            // Tabbing away closes the popup (clicks on options keep focus via preventDefault).
            onBlur={(e) => {
              if (!rootRef.current?.contains(e.relatedTarget as Node | null)) close(false);
            }}
            className="mb-1 h-8"
          />
          <ul id={listId} role="listbox" aria-label="Tickets" className="max-h-80 overflow-auto">
            {matches.map((t, i) => (
              <li
                key={t.id}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(t.id)}
                // Not bg-accent: in dark mode it equals the popover background, so the highlight would vanish.
                className={cn('flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm', i === active && 'bg-primary/15 ring-1 ring-primary/40')}
              >
                <span className="font-mono text-xs text-muted-foreground">{t.id}</span>{' '}
                <span className="flex-1 truncate">{t.title}</span>{' '}
                <StageBadge ticket={t} />
              </li>
            ))}
          </ul>
          {!matches.length && <p className="px-2 py-1.5 text-sm text-muted-foreground">No matching tickets</p>}
        </div>
      )}
    </div>
  );
}
