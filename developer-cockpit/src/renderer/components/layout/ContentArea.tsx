import React, { Suspense, lazy } from 'react';
import { useNavigationStore, type ViewId } from '@/stores/navigation';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { PlaceholderView } from '@/components/PlaceholderView';

const DashboardView = lazy(() => import('@/views/dashboard/DashboardView').then(m => ({ default: m.DashboardView })));
const SettingsView = lazy(() => import('@/views/settings/SettingsView').then(m => ({ default: m.SettingsView })));
const KnowledgeBaseView = lazy(() => import('@/views/knowledge-base/KnowledgeBaseView').then(m => ({ default: m.KnowledgeBaseView })));
const RequirementsView = lazy(() => import('@/views/requirements/RequirementsView').then(m => ({ default: m.RequirementsView })));
const FileExplorerView = lazy(() => import('@/views/file-explorer/FileExplorerView').then(m => ({ default: m.FileExplorerView })));
const GitOverviewView = lazy(() => import('@/views/git-overview/GitOverviewView').then(m => ({ default: m.GitOverviewView })));
const BranchManagerView = lazy(() => import('@/views/branch-manager/BranchManagerView').then(m => ({ default: m.BranchManagerView })));
const SpecsEditorView = lazy(() => import('@/views/specs-editor/SpecsEditorView').then(m => ({ default: m.SpecsEditorView })));
const CodeGeneratorView = lazy(() => import('@/views/code-generator/CodeGeneratorView').then(m => ({ default: m.CodeGeneratorView })));
const DomainModelView = lazy(() => import('@/views/domain-model/DomainModelView').then(m => ({ default: m.DomainModelView })));

const VIEW_MAP: Record<ViewId, React.LazyExoticComponent<React.FC>> = {
  dashboard: DashboardView,
  settings: SettingsView,
  'knowledge-base': KnowledgeBaseView,
  requirements: RequirementsView,
  'file-explorer': FileExplorerView,
  'specs-editor': SpecsEditorView,
  'code-generator': CodeGeneratorView,
  'domain-model': DomainModelView,
  'api-explorer': lazy(() => Promise.resolve({ default: () => <PlaceholderView name="API Explorer" /> })),
  'git-overview': GitOverviewView,
  'branch-manager': BranchManagerView,
  docker: lazy(() => Promise.resolve({ default: () => <PlaceholderView name="Docker" /> })),
  kubernetes: lazy(() => Promise.resolve({ default: () => <PlaceholderView name="Kubernetes" /> })),
  monitoring: lazy(() => Promise.resolve({ default: () => <PlaceholderView name="Monitoring" /> })),
  'ai-chat': lazy(() => Promise.resolve({ default: () => <PlaceholderView name="AI Assistant" /> })),
};

export function ContentArea() {
  const activeView = useNavigationStore((s) => s.activeView);
  const ViewComponent = VIEW_MAP[activeView];

  return (
    <main className="flex-1 overflow-auto bg-background">
      <Suspense fallback={<LoadingSpinner />}>
        <ViewComponent />
      </Suspense>
    </main>
  );
}
