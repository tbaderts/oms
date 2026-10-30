// Identifier rules for storyboards, steps, extensions, lanes and assets (source-spec §5.2).
// Pure and dependency-free so the renderer, the main process and the CLI share one definition.

/** Storyboard, step, extension and lane ids. */
export const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** A flat asset file name: slug stem plus an allowed image extension. No separators, no dots in the stem. */
export const ASSET_NAME = /^[a-z0-9][a-z0-9-]{0,63}\.(excalidraw\.svg|svg|png|jpe?g|webp)$/;

/** Assets the integrated editor can open and save. */
export const EDITABLE_ASSET_NAME = /^[a-z0-9][a-z0-9-]{0,63}\.excalidraw\.svg$/;

const MAX_SLUG = 64;

/** Title → slug: ASCII-folded, lowercase, runs of other characters become one '-', trimmed to 64. */
export function slugify(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/ß/g, 'ss')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG)
    .replace(/-+$/, '');
}

/** A domain is one or more '/'-separated slugs (nested domain folders). */
export function isDomain(domain: string): boolean {
  return domain.length > 0 && domain.split('/').every((part) => SLUG.test(part));
}

/**
 * Stem for a new asset of a step (and optionally one of its extensions), with an optional counter.
 * Stems longer than 64 characters keep their first 55 and get an 8-hex hash of the full stem, so
 * they stay valid slugs and two long names never collide by truncation.
 */
export function assetStem(stepId: string, extensionId?: string, n?: number): string {
  const full = [stepId, extensionId, n && n > 1 ? String(n) : undefined].filter(Boolean).join('-');
  if (full.length <= MAX_SLUG) return full;
  return `${full.slice(0, 55).replace(/-+$/, '')}-${fnv1a(full).toString(16).padStart(8, '0')}`;
}

/** 32-bit FNV-1a; also used for stable sketch seeds in the renderer. */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
