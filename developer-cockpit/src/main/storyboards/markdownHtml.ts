// Markdown → HTML for the standalone export, in the main process. unified and the remark/rehype
// packages are ESM-only while the main process is CommonJS, so they are loaded with a real dynamic
// import that the TypeScript CommonJS transform leaves alone.

// eslint-disable-next-line @typescript-eslint/no-implied-eval
const nativeImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<unknown>;

/**
 * Electron/Node (CommonJS build): the Function-wrapped import survives tsc. Vitest runs this file
 * untranspiled in a VM context that has no callback for Function-created imports, so it uses import().
 */
const importEsm = <T>(specifier: string): Promise<T> => (process.env.VITEST ? import(specifier) : nativeImport(specifier)) as Promise<T>;

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

type Processor = { process(md: string): Promise<{ toString(): string }> };
let processor: Promise<Processor> | null = null;

/**
 * Raw HTML in the Markdown is dropped (remark-rehype without allowDangerousHtml). Links that leave
 * the document become text with the URL in brackets, and images become their alt text, so the
 * exported file never refers to anything outside itself.
 */
function selfContained() {
  const visit = (node: HastNode) => {
    if (!node.children) return;
    node.children = node.children.map((child) => {
      if (child.type === 'element' && child.tagName === 'a') {
        const href = String(child.properties?.href ?? '');
        if (href.startsWith('#')) return child;
        const label = (child.children ?? []).map(textOf).join('');
        const safe = /^(https?:|mailto:)/i.test(href) ? ` (${href})` : '';
        return { type: 'text', value: `${label}${safe}` };
      }
      if (child.type === 'element' && child.tagName === 'img') {
        return { type: 'text', value: `[image: ${String(child.properties?.alt ?? '')}]` };
      }
      visit(child);
      return child;
    });
  };
  return (tree: HastNode) => visit(tree);
}

function textOf(node: HastNode): string {
  return node.type === 'text' ? node.value ?? '' : (node.children ?? []).map(textOf).join('');
}

async function load(): Promise<Processor> {
  const [{ unified }, remarkParse, remarkGfm, remarkRehype, rehypeStringify] = await Promise.all([
    importEsm<{ unified: () => any }>('unified'),
    importEsm<{ default: unknown }>('remark-parse'),
    importEsm<{ default: unknown }>('remark-gfm'),
    importEsm<{ default: unknown }>('remark-rehype'),
    importEsm<{ default: unknown }>('rehype-stringify'),
  ]);
  return unified()
    .use(remarkParse.default)
    .use(remarkGfm.default)
    .use(remarkRehype.default)
    .use(selfContained)
    .use(rehypeStringify.default);
}

export async function markdownToHtml(markdown: string): Promise<string> {
  processor ??= load();
  return String(await (await processor).process(markdown));
}
