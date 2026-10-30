import React, { useEffect, useState } from 'react';
import '@excalidraw/excalidraw/index.css';
import {
  Excalidraw,
  exportToSvg,
  loadFromBlob,
  loadLibraryFromBlob,
} from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI, ExcalidrawInitialDataState } from '@excalidraw/excalidraw/types';

// Excalidraw resolves a relative asset path against location.origin, which is unusable under
// file://; an absolute URL next to index.html keeps the fonts local in dev and in the packaged app.
if (typeof window !== 'undefined') {
  (window as unknown as { EXCALIDRAW_ASSET_PATH: string }).EXCALIDRAW_ASSET_PATH = new URL(
    './excalidraw-assets/',
    window.location.href,
  ).toString();
}

export interface IllustrationEditorProps {
  /** The current *.excalidraw.svg content, or null for a new drawing. */
  initialSvg: string | null;
  /** The root's shared .excalidrawlib JSON, when it exists. */
  library: string | null;
  onSave: (svg: string) => void | Promise<void>;
  onCancel: () => void;
}

/** Excalidraw in a modal-sized pane; loaded only through React.lazy so browsing never pulls it in. */
export default function IllustrationEditor({ initialSvg, library, onSave, onCancel }: IllustrationEditorProps) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const libraryItems = library
        ? await loadLibraryFromBlob(new Blob([library], { type: 'application/vnd.excalidrawlib+json' })).catch(() => [])
        : [];
      if (!initialSvg) {
        if (!cancelled) setInitialData({ libraryItems });
        return;
      }
      try {
        const scene = await loadFromBlob(new Blob([initialSvg], { type: 'image/svg+xml' }), null, null);
        if (!cancelled) setInitialData({ elements: scene.elements, appState: scene.appState, files: scene.files, libraryItems });
      } catch (err) {
        if (!cancelled) setError(`This SVG has no embedded Excalidraw scene and cannot be edited (${(err as Error).message}).`);
      }
    })();
    return () => { cancelled = true; };
  }, [initialSvg, library]);

  const save = async () => {
    if (!api) return;
    setSaving(true);
    try {
      const svg = await exportToSvg({
        elements: api.getSceneElements(),
        appState: { ...api.getAppState(), exportEmbedScene: true, exportBackground: true },
        files: api.getFiles(),
      });
      await onSave(svg.outerHTML);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col" data-testid="illustration-editor">
      <div className="flex items-center justify-end gap-2 border-b border-border p-2">
        {error && <span className="mr-auto text-sm text-destructive">{error}</span>}
        <button type="button" className="rounded-md px-3 py-1 text-sm hover:bg-accent" onClick={onCancel}>Cancel</button>
        <button
          type="button"
          className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50"
          disabled={!api || saving}
          onClick={save}
        >
          {saving ? 'Saving…' : 'Save sketch'}
        </button>
      </div>
      <div className="min-h-0 flex-1">
        {initialData && <Excalidraw initialData={initialData} excalidrawAPI={setApi} />}
      </div>
    </div>
  );
}
