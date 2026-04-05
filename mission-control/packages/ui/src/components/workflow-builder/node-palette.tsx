import { Bot, Wrench, GitBranch, ArrowRightCircle, ArrowLeftCircle, Shield, Columns } from 'lucide-react'

const nodeTypes = [
  { type: 'agent', label: 'Agent', icon: Bot, color: 'text-blue-400' },
  { type: 'tool', label: 'Tool', icon: Wrench, color: 'text-amber-400' },
  { type: 'branch', label: 'Branch', icon: GitBranch, color: 'text-purple-400' },
  { type: 'parallel', label: 'Parallel', icon: Columns, color: 'text-cyan-400' },
  { type: 'approval', label: 'Approval', icon: Shield, color: 'text-amber-400' },
  { type: 'input', label: 'Input', icon: ArrowRightCircle, color: 'text-green-400' },
  { type: 'output', label: 'Output', icon: ArrowLeftCircle, color: 'text-red-400' },
]

export function NodePalette() {
  const onDragStart = (event: React.DragEvent, nodeType: string, label: string) => {
    event.dataTransfer.setData('application/reactflow-type', nodeType)
    event.dataTransfer.setData('application/reactflow-label', label)
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="w-48 border-r border-zinc-800 p-3 space-y-1">
      <p className="text-xs text-zinc-500 font-medium uppercase mb-2">Nodes</p>
      {nodeTypes.map(({ type, label, icon: Icon, color }) => (
        <div
          key={type}
          draggable
          onDragStart={(e) => onDragStart(e, type, label)}
          className="flex items-center gap-2 p-2 rounded cursor-grab hover:bg-zinc-800 text-sm"
        >
          <Icon size={16} className={color} />
          <span className="text-zinc-300">{label}</span>
        </div>
      ))}
    </div>
  )
}
