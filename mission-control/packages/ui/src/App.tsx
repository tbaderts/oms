import { Routes, Route, NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Search,
  Workflow,
  Bot,
  History,
  BookOpen,
  Settings,
} from 'lucide-react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/investigations', icon: Search, label: 'Investigations' },
  { to: '/workflows', icon: Workflow, label: 'Workflows' },
  { to: '/agents', icon: Bot, label: 'Agents' },
  { to: '/runs', icon: History, label: 'Run History' },
  { to: '/playbooks', icon: BookOpen, label: 'Playbooks' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-center h-full text-zinc-400">
      <h2 className="text-2xl">{title}</h2>
    </div>
  )
}

export function App() {
  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      {/* Sidebar */}
      <nav className="w-56 border-r border-zinc-800 flex flex-col">
        <div className="p-4 border-b border-zinc-800">
          <h1 className="text-lg font-semibold">Mission Control</h1>
        </div>
        <div className="flex-1 py-2">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2 text-sm ${
                  isActive
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </div>
        {/* Status bar */}
        <div className="p-3 border-t border-zinc-800 text-xs text-zinc-500">
          Adapters: loading...
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<Placeholder title="Dashboard" />} />
          <Route path="/investigations" element={<Placeholder title="Investigations" />} />
          <Route path="/workflows" element={<Placeholder title="Workflow Builder" />} />
          <Route path="/agents" element={<Placeholder title="Agents" />} />
          <Route path="/runs" element={<Placeholder title="Run History" />} />
          <Route path="/playbooks" element={<Placeholder title="Playbooks" />} />
          <Route path="/settings" element={<Placeholder title="Settings" />} />
        </Routes>
      </main>
    </div>
  )
}
