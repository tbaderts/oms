import type { Extension, Illustration, Lane, Step, StoryboardDetail } from '../../src/shared/types/storyboards';

/** Builders for in-memory storyboards used by the pure-logic and renderer tests. */
export const lanes: Lane[] = [
  { id: 'customer', label: 'Customer', kind: 'actor' },
  { id: 'app', label: 'Mobile App', kind: 'channel' },
  { id: 'oms', label: 'OMS', kind: 'system' },
  { id: 'market', label: 'Market', kind: 'external' },
];

export function illustration(src: string, missing = false): Illustration {
  return { src, url: `storyboard-asset://s/${src}`, missing, editable: src.endsWith('.excalidraw.svg') };
}

export function ext(id: string, overrides: Partial<Extension> = {}): Extension {
  return { id, label: '', when: `when ${id}`, then: `then ${id}`, continueAt: { kind: 'end' }, illustrations: [], in: [], out: [], ...overrides };
}

export function step(id: string, index: number, overrides: Partial<Step> = {}): Step {
  return {
    id,
    index,
    title: id.replace(/-/g, ' '),
    kind: 'system',
    illustrations: [],
    links: { api: [], events: [], states: [], requirements: [] },
    in: [],
    out: [],
    extensions: [],
    body: '## What happens\n\nSomething happens.\n',
    headings: [],
    revision: `r-${id}`,
    sourcePath: `steps/${id}.md`,
    readable: true,
    ...overrides,
  };
}

export function story(steps: Step[], overrides: Partial<StoryboardDetail> = {}): StoryboardDetail {
  return {
    id: 'buy-gold-mobile',
    title: 'Buy gold via mobile app',
    description: '',
    domain: 'precious-metals',
    status: 'draft',
    tags: [],
    sourcePath: 'oms-knowledge-base/storyboards/precious-metals/buy-gold-mobile',
    modified: 0,
    stepCount: steps.length,
    stepTitles: steps.map((s) => s.title),
    thumbnails: steps.map(() => null),
    trust: 'unevidenced',
    drift: 'none',
    hasCard: false,
    brokenEvidence: false,
    lanes,
    steps,
    body: '## Summary\n\nA story.\n',
    headings: [],
    revision: 'r-story',
    evidence: null,
    problems: [],
    orphanSteps: [],
    ...overrides,
  };
}
