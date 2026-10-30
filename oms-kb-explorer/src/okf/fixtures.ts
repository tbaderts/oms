// Test fixtures shaped like GET /api/kb/documents for the real bundle.
import type { DocMeta, OkfMetadata } from '../types/index.ts';

const B = 'oms-knowledge-base';

function okf(partial: Partial<OkfMetadata>): OkfMetadata {
  return { tags: [], stale: false, sources: [], trustTier: 'unverified', status: 'draft', ...partial };
}

export function doc(path: string, meta?: Partial<OkfMetadata> | null, extra: Partial<DocMeta> = {}): DocMeta {
  const name = path.split('/').pop()!;
  const reserved = name === 'index.md' || name === 'log.md';
  return {
    path: `${B}/${path}`, name, size: 1000, lastModifiedIso: '2026-10-27T00:00:00Z',
    concept: !reserved, status: meta?.status ?? 'draft', okf: meta === null ? null : okf(meta ?? {}), ...extra,
  };
}

export const DOCS: DocMeta[] = [
  doc('index.md', {}),
  doc('log.md', {}),
  doc('okf-conventions.md', { type: 'Reference', title: 'Knowledge Base Conventions (OKF)', status: 'stable' }),
  doc('capabilities/index.md', {}),
  doc('capabilities/order-capture.md', { type: 'Capability', title: 'Order Capture', maturity: 'implemented' }),
  doc('capabilities/quotes.md', { type: 'Capability', title: 'Quotes', maturity: 'planned' }),
  doc('capabilities/execution-processing.md', { type: 'Capability', title: 'Execution Processing', maturity: 'partial' }),
  doc('functional-requirements/index.md', {}),
  doc('functional-requirements/FR-010-deduplicate.md', { type: 'Requirement', title: 'Dedupe', id: 'FR-010' }),
  doc('functional-requirements/FR-002-validate.md', { type: 'Requirement', title: 'Validate', id: 'FR-002', trustTier: 'human-reviewed' }),
  doc('non-functional-requirements/NFR-001-idempotency.md', { type: 'Requirement', title: 'Idempotency', id: 'NFR-001' }),
  doc('oms-concepts/index.md', {}),
  doc('oms-concepts/order-lifecycle.md', { type: 'Specification', title: 'Order Lifecycle', status: 'stable' }),
  doc('oms-concepts/legacy-notes.md', null, { status: 'Active' }),
  doc('oms-concepts/sub/deep.md', { type: 'Diagram', title: 'Deep Diagram' }),
];
