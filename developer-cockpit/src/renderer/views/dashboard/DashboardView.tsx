import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useNavigationStore, type ViewId } from '@/stores/navigation';
import { BookOpen, ClipboardList, FolderOpen, Settings, FileCode, Activity } from 'lucide-react';

const QUICK_LINKS: { id: ViewId; label: string; description: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'knowledge-base', label: 'Knowledge Base', description: 'Browse project documentation', icon: BookOpen },
  { id: 'requirements', label: 'Requirements', description: 'Explore use cases and requirements', icon: ClipboardList },
  { id: 'file-explorer', label: 'File Explorer', description: 'Navigate workspace files', icon: FolderOpen },
  { id: 'specs-editor', label: 'Specs Editor', description: 'Edit OpenAPI & Avro specs', icon: FileCode },
  { id: 'monitoring', label: 'Monitoring', description: 'View infrastructure health', icon: Activity },
  { id: 'settings', label: 'Settings', description: 'Configure the cockpit', icon: Settings },
];

export function DashboardView() {
  const setActiveView = useNavigationStore((s) => s.setActiveView);

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Developer Cockpit</h1>
        <p className="mt-1 text-muted-foreground">
          Unified workbench for spec-driven development
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {QUICK_LINKS.map((link) => (
          <Card
            key={link.id}
            className="cursor-pointer transition-shadow hover:shadow-lg"
            onClick={() => setActiveView(link.id)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <link.icon className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">{link.label}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription>{link.description}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Getting Started</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>Welcome to the OMS Developer Cockpit. Use the sidebar or the cards above to navigate.</p>
            <p>Press <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs font-mono">Ctrl+K</kbd> to open the command palette for quick navigation.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
