import React, { useEffect, useState } from 'react';
import { Clapperboard } from 'lucide-react';
import { useNavigationStore } from '@/stores/navigation';
import { useStoryboardsStore } from '@/stores/storyboards';

/** Storyboards that reference a requirement id or a knowledge-base document (from the last scan). */
export function StoryboardBacklinks({ target }: { target: string }) {
  const [links, setLinks] = useState<{ id: string; title: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    const api = window.cockpit?.storyboards;
    if (!api) return;
    // The catalogue must be scanned once before backlinks exist.
    api.scan()
      .then(() => api.backlinks(target))
      .then((r) => !cancelled && setLinks(r))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [target]);
  if (!links.length) return null;
  const open = (id: string) => {
    useNavigationStore.getState().setActiveView('storyboards');
    void useStoryboardsStore.getState().open(id);
  };
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 text-xs" aria-label="Storyboards referencing this">
      <Clapperboard className="h-3 w-3 text-muted-foreground" />
      {links.map((l) => (
        <button key={l.id} type="button" onClick={() => open(l.id)} className="rounded-full border border-border px-2 hover:bg-accent">
          {l.title}
        </button>
      ))}
    </div>
  );
}
