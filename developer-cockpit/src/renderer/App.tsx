import React, { useEffect, useState } from 'react';
import { loader } from '@monaco-editor/react';
import { Sidebar } from '@/components/layout/Sidebar';
import { ContentArea } from '@/components/layout/ContentArea';
import { StatusBar } from '@/components/layout/StatusBar';
import { CommandPalette } from '@/components/CommandPalette';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useConfigStore } from '@/stores/config';
import { eventBus } from '@/lib/event-bus';

// Preload Monaco editor during idle time so it's ready when the user opens Specs Editor
if (typeof window !== 'undefined') {
  const preloadMonaco = () => loader.init();
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(preloadMonaco);
  } else {
    setTimeout(preloadMonaco, 2000);
  }
}

export function App() {
  const loadConfig = useConfigStore((s) => s.loadConfig);
  const loaded = useConfigStore((s) => s.loaded);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    async function connectWs() {
      try {
        const url = await window.cockpit.events.getWebSocketUrl();
        eventBus.connect(url);
      } catch {
        // Will retry on reconnect
      }
    }
    connectWs();
    return () => eventBus.disconnect();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!loaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="text-center">
          <div className="mb-2 text-lg font-medium">Developer Cockpit</div>
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="flex h-screen flex-col bg-background text-foreground">
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <ContentArea />
        </div>
        <StatusBar />
        <CommandPalette
          open={commandPaletteOpen}
          onOpenChange={setCommandPaletteOpen}
        />
      </div>
    </ErrorBoundary>
  );
}
