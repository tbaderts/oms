import { DOMParser, type Element as XmlElement, type Node as XmlNode } from '@xmldom/xmldom';

export type SvgCheck = { ok: true } | { ok: false; reason: string };

const SVG_NS = 'http://www.w3.org/2000/svg';
const XHTML_NS = 'http://www.w3.org/1999/xhtml';
const FORBIDDEN_ELEMENTS = new Set(['script', 'foreignobject', 'iframe', 'embed', 'object', 'handler', 'listener']);
const ELEMENT_NODE = 1;

/** href values an SVG may keep: in-document fragments and inline images. */
const SAFE_HREF = /^(#|data:image\/)/i;
/** CSS url() targets: fragments, inline images and the inline fonts Excalidraw embeds. */
const SAFE_CSS_URL = /^(#|data:image\/|data:font\/)/i;

/**
 * Decides whether an SVG may be stored as a storyboard illustration (source-spec §7.5). Unsafe
 * content is rejected, never rewritten, so a saved file is exactly what its author drew.
 */
export function checkSvg(text: string, maxBytes: number): SvgCheck {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, reason: 'the SVG is empty' };
  if (Buffer.byteLength(text, 'utf8') > maxBytes) return { ok: false, reason: `the SVG is larger than ${maxBytes} bytes` };
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) return { ok: false, reason: 'DOCTYPE and entity declarations are not allowed' };

  let root: XmlElement | null;
  try {
    const doc = new DOMParser({
      onError: (level, message) => {
        if (level !== 'warning') throw new Error(message);
      },
    }).parseFromString(text, 'image/svg+xml');
    root = doc.documentElement;
  } catch (err) {
    return { ok: false, reason: `the SVG is not well-formed XML (${(err as Error).message.split('\n')[0]})` };
  }
  if (!root || root.localName?.toLowerCase() !== 'svg' || root.namespaceURI !== SVG_NS) {
    return { ok: false, reason: 'the root element must be an svg element in the SVG namespace' };
  }

  const stack: XmlNode[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.nodeType !== ELEMENT_NODE) continue;
    const el = node as XmlElement;
    const name = (el.localName ?? el.nodeName).toLowerCase();
    if (FORBIDDEN_ELEMENTS.has(name)) return { ok: false, reason: `<${el.localName ?? el.nodeName}> elements are not allowed (no script, foreignObject or embedded documents)` };
    if (el.namespaceURI === XHTML_NS) return { ok: false, reason: `<${name}> is in the XHTML namespace; only SVG content is allowed` };

    if ((name === 'set' || name.startsWith('animate')) && /href$/i.test(el.getAttribute('attributeName') ?? '')) {
      return { ok: false, reason: `<${name}> may not animate an href` };
    }

    for (let i = 0; i < el.attributes.length; i++) {
      const attr = el.attributes.item(i)!;
      const fullName = attr.name.toLowerCase();
      // Namespace declarations name a namespace; they never load anything.
      if (fullName === 'xmlns' || fullName.startsWith('xmlns:')) continue;
      const attrName = (attr.localName ?? attr.name).toLowerCase();
      const value = attr.value.trim();
      if (attrName.startsWith('on')) return { ok: false, reason: `event handler attribute "${attr.name}" is not allowed` };
      if (fullName === 'xml:base' || attrName === 'base') return { ok: false, reason: 'xml:base is not allowed' };
      if (attrName === 'href') {
        if (!SAFE_HREF.test(value)) return { ok: false, reason: `${attr.name}="${value.slice(0, 60)}" is not allowed; only #fragment and data:image/* references are` };
        continue;
      }
      // Every other attribute (fill, filter, mask, clip-path, style, …) is checked like CSS: url()
      // only to fragments or inline data, and no external scheme anywhere.
      const css = checkCss(value);
      if (css) return { ok: false, reason: `attribute "${attr.name}": ${css}` };
    }
    if (name === 'style') {
      const css = checkCss(el.textContent ?? '');
      if (css) return { ok: false, reason: css };
    }
    for (let i = el.childNodes.length - 1; i >= 0; i--) stack.push(el.childNodes.item(i)!);
  }
  return { ok: true };
}

/** Returns a reason when CSS can reach outside the file, or null when it is self-contained. */
function checkCss(css: string): string | null {
  if (/@import/i.test(css)) return 'CSS @import is not allowed';
  // Escapes (\75rl(…)) would let a reference hide from the checks below.
  if (css.includes('\\')) return 'CSS escape sequences are not allowed';
  if (/expression\s*\(|javascript:/i.test(css)) return 'CSS expressions and javascript: URLs are not allowed';
  if (/image-set\s*\(|(?:^|[^-\w])image\s*\(|cross-fade\s*\(/i.test(css)) return 'CSS image-set(), image() and cross-fade() are not allowed';
  for (const m of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi)) {
    const target = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    if (!SAFE_CSS_URL.test(target)) return `url(${target.slice(0, 60)}) is not allowed; only #fragment, data:image/* and data:font/* are`;
  }
  // Inline data (base64) contains no "scheme:"; anything else that names one is an external reference.
  const outsideData = css.replace(/data:(image|font)\/[^"')\s]*/gi, '');
  if (/(?:^|[^a-z0-9+.-])(?:https?|ftp|file|wss?):|(?:^|[\s("'=])\/\//i.test(outsideData)) return 'external references are not allowed';
  return null;
}
