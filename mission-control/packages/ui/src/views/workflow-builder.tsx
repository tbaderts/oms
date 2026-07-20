import { NodePalette } from '../components/workflow-builder/node-palette.js'
import { WorkflowCanvas } from '../components/workflow-builder/canvas.js'
import { useWorkflowStore } from '../stores/workflow.js'
import { Save, Play, Trash2 } from 'lucide-react'

export function WorkflowBuilder() {
  const { name, setName, reset } = useWorkflowStore()

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bg-transparent text-lg font-medium text-zinc-100 focus:outline-none"
        />
        <div className="flex gap-2">
          <button className="flex items-center gap-1 px-3 py-1.5 text-sm bg-zinc-800 rounded hover:bg-zinc-700">
            <Save size={14} /> Save
          </button>
          <button className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 rounded hover:bg-blue-500">
            <Play size={14} /> Run
          </button>
          <button onClick={reset} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-zinc-800 rounded hover:bg-zinc-700 text-red-400">
            <Trash2 size={14} /> Clear
          </button>
        </div>
      </div>

      {/* Canvas + Palette */}
      <div className="flex flex-1 overflow-hidden">
        <NodePalette />
        <WorkflowCanvas />
      </div>
    </div>
  )
}
