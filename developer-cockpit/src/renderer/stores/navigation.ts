import { create } from 'zustand';
import { useDocEditorStore } from './docEditor';

export type ViewId =
  | 'dashboard'
  | 'spec-tickets'
  | 'contracts'
  | 'api-explorer'
  | 'git-overview'
  | 'branch-manager'
  | 'knowledge-base'
  | 'requirements'
  | 'storyboards'
  | 'file-explorer'
  | 'docker'
  | 'kubernetes'
  | 'monitoring'
  | 'ai-chat'
  | 'settings';

export interface NavItem {
  id: ViewId;
  label: string;
  group: string;
  icon: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', group: 'Development', icon: 'LayoutDashboard' },
  { id: 'spec-tickets', label: 'Spec Tickets', group: 'Development', icon: 'ListChecks' },
  { id: 'contracts', label: 'Contracts', group: 'Development', icon: 'FileCode' },
  { id: 'api-explorer', label: 'API Explorer', group: 'Development', icon: 'Globe' },
  { id: 'git-overview', label: 'Git Overview', group: 'Source Control', icon: 'GitBranch' },
  { id: 'branch-manager', label: 'Branch Manager', group: 'Source Control', icon: 'GitMerge' },
  { id: 'knowledge-base', label: 'Knowledge Base', group: 'Knowledge', icon: 'BookOpen' },
  { id: 'requirements', label: 'Requirements', group: 'Knowledge', icon: 'ClipboardList' },
  { id: 'storyboards', label: 'Storyboards', group: 'Knowledge', icon: 'Clapperboard' },
  { id: 'file-explorer', label: 'File Explorer', group: 'Knowledge', icon: 'FolderOpen' },
  { id: 'docker', label: 'Docker', group: 'Infrastructure', icon: 'Container' },
  { id: 'kubernetes', label: 'Kubernetes', group: 'Infrastructure', icon: 'Ship' },
  { id: 'monitoring', label: 'Monitoring', group: 'Infrastructure', icon: 'Activity' },
  { id: 'ai-chat', label: 'AI Assistant', group: 'System', icon: 'Bot' },
  { id: 'settings', label: 'Settings', group: 'System', icon: 'Settings' },
];

interface NavigationState {
  activeView: ViewId;
  sidebarCollapsed: boolean;
  setActiveView: (view: ViewId) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  activeView: 'dashboard',
  sidebarCollapsed: false,
  setActiveView: (view) => {
    // Unsaved document edits are discarded only after the user confirms.
    if (view === get().activeView || !useDocEditorStore.getState().confirmLeave()) return;
    set({ activeView: view });
  },
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
}));
