import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AiAssistKind, AiProposal, ContinueAt, StepLinks } from '@shared/types/storyboards';

const LABELS: Record<AiAssistKind, string> = {
  draftProse: 'Draft prose',
  reviewExtensions: 'Review alternate paths',
  suggestLinks: 'Suggest links',
};

/**
 * Optional AI assists. Each returns a proposal that the user reviews and applies to the editor draft;
 * nothing is written until the step is saved.
 */
export function AiAssistMenu({ storyId, stepId, onProse, onLinks, onExtension }: {
  storyId: string;
  stepId: string;
  onProse: (markdown: string) => void;
  onLinks: (links: StepLinks) => void;
  onExtension: (e: { when: string; then: string; continueAt: ContinueAt }) => void;
}) {
  const [busy, setBusy] = useState<AiAssistKind | null>(null);
  const [proposal, setProposal] = useState<AiProposal | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: AiAssistKind) => {
    setBusy(kind);
    setError(null);
    setProposal(null);
    const r = await window.cockpit.storyboards.aiAssist(kind, storyId, stepId);
    setBusy(null);
    if (r.ok) setProposal(r.proposal);
    else setError(r.message);
  };

  return (
    <div className="relative flex items-center gap-1" aria-label="AI assists">
      <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
      {(Object.keys(LABELS) as AiAssistKind[]).map((k) => (
        <Button key={k} variant="ghost" size="sm" disabled={busy !== null} onClick={() => run(k)}>{busy === k ? '…' : LABELS[k]}</Button>
      ))}
      {(proposal || error) && (
        <div role="dialog" aria-label="AI proposal" className="absolute right-0 top-9 z-40 w-[32rem] rounded-md border border-border bg-background p-3 text-sm shadow-lg">
          {error && <p className="text-destructive">{error}</p>}
          {proposal?.kind === 'draftProse' && (
            <>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">{proposal.markdown}</pre>
              <Button size="sm" className="mt-2" onClick={() => { onProse(proposal.markdown); setProposal(null); }}>Replace prose in draft</Button>
            </>
          )}
          {proposal?.kind === 'suggestLinks' && (
            <>
              <ul className="text-xs">
                {(Object.entries(proposal.links) as [string, string[]][]).flatMap(([c, values]) => values.map((v) => <li key={`${c}:${v}`}>{c}: {v}</li>))}
              </ul>
              <Button size="sm" className="mt-2" onClick={() => { onLinks(proposal.links); setProposal(null); }}>Add to draft</Button>
            </>
          )}
          {proposal?.kind === 'reviewExtensions' && (
            <ul className="space-y-1 text-xs">
              {proposal.extensions.length === 0 && <li>No missing alternate paths suggested.</li>}
              {proposal.extensions.map((e, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="flex-1">When {e.when} — then {e.then}</span>
                  <Button size="sm" variant="outline" onClick={() => onExtension(e)}>Add as draft</Button>
                </li>
              ))}
            </ul>
          )}
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => { setProposal(null); setError(null); }}>Close</Button>
        </div>
      )}
    </div>
  );
}
