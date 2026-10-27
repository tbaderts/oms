import { vi } from 'vitest';

// The real monaco-editor needs a browser (jsdom lacks e.g. document.queryCommandSupported). Tests
// that render an editor replace `@monaco-editor/react` with a textarea; this stubs the bundled
// Monaco that src/renderer/lib/monaco.ts hands to its loader.
vi.mock('monaco-editor', () => ({}));

// jsdom implements no layout, so scrollIntoView is missing; real browsers and Electron have it.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
vi.mock('monaco-editor/esm/vs/editor/editor.worker?worker', () => ({ default: class {} }));
vi.mock('monaco-editor/esm/vs/language/json/json.worker?worker', () => ({ default: class {} }));
vi.mock('monaco-editor/esm/vs/language/css/css.worker?worker', () => ({ default: class {} }));
vi.mock('monaco-editor/esm/vs/language/html/html.worker?worker', () => ({ default: class {} }));
vi.mock('monaco-editor/esm/vs/language/typescript/ts.worker?worker', () => ({ default: class {} }));
