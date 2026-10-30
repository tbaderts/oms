import React, { Suspense, lazy } from 'react';
import { useNavigationStore, type ViewId } from '@/stores/navigation';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { PlaceholderView } from '@/components/PlaceholderView';

const DashboardView = lazy(() => import('@/views/dashboard/DashboardView').then(m => ({ default: m.DashboardView })));
const SettingsView = lazy(() => import('@/views/settings/SettingsView').then(m => ({ default: m.SettingsView })));
const KnowledgeBaseView = lazy(() => import('@/views/knowledge-base/KnowledgeBaseView').then(m => ({ default: m.KnowledgeBaseView })));
const StoryboardsView = lazy(() => import('@/views/storyboards/StoryboardsView').then(m => ({ default: m.StoryboardsView })));
const RequirementsView = lazy(() => import('@/views/requirements/RequirementsView').then(m => ({ default: m.RequirementsView })));
const FileExplorerView = lazy(() => import('@/views/file-explorer/FileExplorerView').then(m => ({ default: m.FileExplorerView })));
const GitOverviewView = lazy(() => import('@/views/git-overview/GitOverviewView').then(m => ({ default: m.GitOverviewView })));
const BranchManagerView = lazy(() => import('@/views/branch-manager/BranchManagerView').then(m => ({ default: m.BranchManagerView })));
const ContractsView = lazy(() => import('@/views/contracts/ContractsView').then(m => ({ default: m.ContractsView })));
const SpecTicketsView = lazy(() => import('@/views/spec-tickets/SpecTicketsView').then(m => ({ default: m.SpecTicketsView })));
const ApiExplorerView = lazy(() => import('@/views/api-explorer/ApiExplorerView').then(m => ({ default: m.ApiExplorerView })));

const VIEW_MAP: Record<ViewId, React.LazyExoticComponent<React.FC>> = {
  dashboard: DashboardView,
  'spec-tickets': SpecTicketsView,
  settings: SettingsView,
  'knowledge-base': KnowledgeBaseView,
  requirements: RequirementsView,
  storyboards: StoryboardsView,
  'file-explorer': FileExplorerView,
  contracts: ContractsView,
  'api-explorer': ApiExplorerView,
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
