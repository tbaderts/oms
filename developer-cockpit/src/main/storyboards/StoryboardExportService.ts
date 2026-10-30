import { extensionLabel, stepLabel } from '../../shared/storyboards/labels';
import { toMermaid } from '../../shared/storyboards/mermaid';
import type {
  ContinueAt,
  DataIn,
  DataOut,
  Illustration,
  Origin,
  StoryboardDetail,
  StoryboardResult,
} from '../../shared/types/storyboards';
import { resolveAsset } from './assets';
import { markdownToHtml } from './markdownHtml';
import { checkSvg } from './svgSafety';
import type { StoryboardService } from './StoryboardService';

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const stripProlog = (svg: string) => svg.replace(/^﻿?\s*<\?xml[^>]*\?>\s*/i, '').replace(/^<!--[\s\S]*?-->\s*/, '');

const STYLE = `
:root { color-scheme: light; --ink: #1f2328; --muted: #57606a; --line: #d0d7de; --soft: #f6f8fa; --accent: #0969da; }
* { box-sizing: border-box; }
body { margin: 0 auto; max-width: 960px; padding: 32px 24px 64px; font: 15px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--ink); background: #fff; }
h1 { font-size: 28px; margin: 0 0 8px; }
h2 { font-size: 20px; margin: 0 0 4px; }
h3 { font-size: 15px; margin: 20px 0 6px; }
.meta { border-collapse: collapse; margin: 12px 0 24px; font-size: 13px; }
.meta th { text-align: left; color: var(--muted); font-weight: 500; padding: 2px 16px 2px 0; }
.meta td { padding: 2px 0; }
.lanes { display: flex; flex-wrap: wrap; gap: 6px; padding: 0; list-style: none; }
.lanes li { border: 1px solid var(--line); border-radius: 999px; padding: 1px 10px; font-size: 13px; }
.sequence { border: 1px solid var(--line); border-radius: 8px; padding: 12px; margin: 16px 0 32px; overflow: auto; }
.sequence svg, figure svg { max-width: 100%; height: auto; }
pre { background: var(--soft); padding: 12px; border-radius: 6px; overflow: auto; font-size: 12px; }
.step { border-top: 1px solid var(--line); padding: 24px 0; break-inside: avoid-page; }
.handoff { color: var(--muted); font-size: 13px; margin: 0 0 12px; }
.figures { display: flex; flex-wrap: wrap; gap: 12px; margin: 8px 0 16px; }
figure { margin: 0; flex: 1 1 280px; border: 1px solid var(--line); border-radius: 8px; padding: 8px; background: #fff; }
figure img { max-width: 100%; height: auto; display: block; }
figcaption { font-size: 12px; color: var(--muted); margin-top: 6px; }
figure.missing { display: flex; flex-direction: column; justify-content: center; min-height: 120px; background: var(--soft); color: var(--muted); font-size: 13px; text-align: center; }
table.data { border-collapse: collapse; font-size: 13px; width: 100%; }
table.data th, table.data td { border: 1px solid var(--line); padding: 4px 8px; text-align: left; vertical-align: top; }
.ext { border-left: 3px solid var(--accent); padding: 4px 12px; margin: 8px 0; background: var(--soft); }
.ext p { margin: 2px 0; }
@media print {
  body { max-width: none; padding: 0; font-size: 11pt; }
  .step { break-before: page; border-top: none; }
  .sequence, figure { break-inside: avoid; }
  a { color: inherit; text-decoration: none; }
}`;

/** Derived outputs of a storyboard (source-spec §9): Mermaid source and the standalone HTML handout. */
export class StoryboardExportService {
  constructor(private readonly service: StoryboardService) {}

  mermaid(id: string, extensions: boolean): StoryboardResult<{ source: string }> {
    const r = this.service.detail(id);
    return r.ok ? { ok: true, source: toMermaid(r.detail, { extensions }) } : r;
  }

  /**
   * One self-contained, script-free document: inline (re-checked) SVG, raster images as data: URLs,
   * a readable fallback for anything that cannot be read, and print CSS. `sequenceSvg` is the diagram
   * the renderer drew with Mermaid; without a safe one the Mermaid source is shown instead.
   */
  async html(id: string, sequenceSvg?: string): Promise<StoryboardResult<{ html: string }>> {
    const r = this.service.detail(id);
    if (!r.ok) return r;
    const d = r.detail;
    const lane = (laneId?: string) => (laneId ? d.lanes.find((l) => l.id === laneId)?.label ?? laneId : '—');

    const sequence = sequenceSvg && checkSvg(sequenceSvg, 4 * 1024 * 1024).ok
      ? stripProlog(sequenceSvg)
      : `<pre class="mermaid-source">${escape(toMermaid(d, { extensions: true }))}</pre>`;

    const steps: string[] = [];
    for (const step of d.steps) {
      const parts = [
        `<section class="step" id="step-${escape(step.id)}">`,
        `<h2>${stepLabel(step.index)}. ${escape(step.title)}</h2>`,
        `<p class="handoff">${escape(lane(step.from))} → ${escape(lane(step.to))} · ${escape(step.kind)} step</p>`,
      ];
      if (!step.readable) parts.push(`<p><em>This step could not be read: ${escape(step.unreadableReason ?? 'unknown reason')}.</em></p>`);
      if (step.illustrations.length) parts.push(`<div class="figures">${step.illustrations.map((i) => this.figure(d, i)).join('')}</div>`);
      parts.push(await markdownToHtml(step.body));
      parts.push(dataTables(step.in, step.out, d, lane));
      if (step.extensions.length) {
        parts.push('<h3>Alternate paths</h3>');
        step.extensions.forEach((ext, i) => {
          parts.push(
            `<div class="ext"><p><strong>${extensionLabel(step.index, i)}</strong> <strong>When</strong> ${escape(ext.when)}</p>` +
              `<p><strong>Then</strong> ${escape(ext.then)}</p><p><strong>Continues</strong> ${escape(continuation(ext.continueAt, d, step.index))}</p>` +
              (ext.illustrations.length ? `<div class="figures">${ext.illustrations.map((ill) => this.figure(d, ill)).join('')}</div>` : '') +
              dataTables(ext.in, ext.out, d, lane) +
              '</div>',
          );
        });
      }
      parts.push('</section>');
      steps.push(parts.join('\n'));
    }

    const meta: [string, string][] = [
      ['Domain', d.domain],
      ['Status', d.status],
      ...(d.owner ? ([['Owner', d.owner]] as [string, string][]) : []),
      ...(d.tags.length ? ([['Tags', d.tags.join(', ')]] as [string, string][]) : []),
      ['Steps', String(d.steps.length)],
      ['Evidence', `${d.trust}${d.drift !== 'none' ? `, drift ${d.drift}` : ''}`],
      ['Source', d.sourcePath],
    ];
    const html = [
      '<!doctype html>',
      '<html lang="en"><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:">`,
      `<title>${escape(d.title)}</title>`,
      `<style>${STYLE}</style>`,
      '</head><body>',
      `<h1>${escape(d.title)}</h1>`,
      `<table class="meta">${meta.map(([k, v]) => `<tr><th>${escape(k)}</th><td>${escape(v)}</td></tr>`).join('')}</table>`,
      `<ul class="lanes">${d.lanes.map((l) => `<li>${escape(l.label)} <small>(${escape(l.kind)})</small></li>`).join('')}</ul>`,
      await markdownToHtml(d.body),
      '<h2>Sequence</h2>',
      `<div class="sequence">${sequence}</div>`,
      ...steps,
      '</body></html>',
    ].join('\n');
    return { ok: true, html };
  }

  private figure(d: StoryboardDetail, ill: Illustration): string {
    const caption = ill.caption ? `<figcaption>${escape(ill.caption)}</figcaption>` : '';
    const missing = (why: string) => `<figure class="missing"><span>${escape(ill.src)}</span><span>${escape(why)}</span>${caption}</figure>`;
    if (ill.missing || !ill.url) return missing('Illustration not available');
    const asset = resolveAsset(this.service, d.id, ill.src);
    if (asset.status !== 200 || !asset.body) return missing('Illustration could not be read');
    const type = asset.headers['Content-Type'];
    if (type === 'image/svg+xml') {
      const svg = asset.body.toString('utf8');
      return checkSvg(svg, this.service.config.maxAssetBytes).ok ? `<figure>${stripProlog(svg)}${caption}</figure>` : missing('Illustration rejected by the SVG safety check');
    }
    return `<figure><img alt="${escape(ill.caption ?? ill.src)}" src="data:${type};base64,${asset.body.toString('base64')}">${caption}</figure>`;
  }
}

function continuation(c: ContinueAt, d: StoryboardDetail, ownIndex: number): string {
  if (c.kind === 'stay') return `retry step ${stepLabel(ownIndex)}`;
  if (c.kind === 'end') return 'end of journey';
  const target = d.steps.find((s) => s.id === c.step);
  return target ? `continue at step ${stepLabel(target.index)} (${target.title})` : `continue at ${c.step}`;
}

function originText(o: Origin, d: StoryboardDetail, lane: (id?: string) => string): string {
  switch (o.kind) {
    case 'step': {
      const s = d.steps.find((x) => x.id === o.ref);
      return s ? `step ${stepLabel(s.index)} (${s.title})` : `step ${o.ref}`;
    }
    case 'extension':
      return `alternate path ${o.ref}`;
    case 'external':
      return 'lane' in o ? `external: ${lane(o.lane)}` : `external: ${o.label}`;
    default:
      return 'unknown source';
  }
}

function dataTables(inputs: DataIn[], outputs: DataOut[], d: StoryboardDetail, lane: (id?: string) => string): string {
  if (!inputs.length && !outputs.length) return '';
  const rows = [
    ...inputs.map((i) => `<tr><td>in</td><td>${escape(i.name)}</td><td>${escape(i.shape ?? '')}</td><td>${escape(originText(i.origin, d, lane))}</td></tr>`),
    ...outputs.map((o) => `<tr><td>out</td><td>${escape(o.name)}</td><td>${escape(o.shape ?? '')}</td><td>${o.final ? 'leaves the journey' : ''}</td></tr>`),
  ];
  return `<h3>Data</h3><table class="data"><tr><th></th><th>Name</th><th>Shape</th><th>Source / note</th></tr>${rows.join('')}</table>`;
}
