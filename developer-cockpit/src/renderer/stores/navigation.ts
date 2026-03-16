import { create } from 'zustand';

export type ViewId =
  | 'dashboard'
  | 'specs-editor'
  | 'code-generator'
  | 'domain-model'
  | 'api-explorer'
  | 'git-overview'
  | 'branch-manager'
  | 'knowledge-base'
  | 'requirements'
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
  { id: 'specs-editor', label: 'Specs Editor', group: 'Development', icon: 'FileCode' },
  { id: 'code-generator', label: 'Code Generator', group: 'Development', icon: 'Wand2' },
  { id: 'domain-model', label: 'Domain Model', group: 'Development', icon: 'Database' },
  { id: 'api-explorer', label: 'API Explorer', group: 'Development', icon: 'Globe' },
  { id: 'git-overview', label: 'Git Overview', group: 'Source Control', icon: 'GitBranch' },
  { id: 'branch-manager', label: 'Branch Manager', group: 'Source Control', icon: 'GitMerge' },
  { id: 'knowledge-base', label: 'Knowledge Base', group: 'Knowledge', icon: 'BookOpen' },
  { id: 'requirements', label: 'Requirements', group: 'Knowledge', icon: 'ClipboardList' },
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

export const useNavigationStore = create<NavigationState>((set) => ({
  activeView: 'dashboard',
  sidebarCollapsed: false,
  setActiveView: (view) => set({ activeView: view }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
}));
