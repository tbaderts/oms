import { Handle, Position } from '@xyflow/react'
import { ArrowLeftCircle } from 'lucide-react'

export function OutputNode() {
  return (
    <div className="px-4 py-3 bg-red-950 border border-red-700 rounded-full">
      <Handle type="target" position={Position.Top} className="!bg-red-500" />
      <div className="flex items-center gap-2">
        <ArrowLeftCircle size={16} className="text-red-400" />
        <span className="text-sm font-medium text-red-100">Output</span>
      </div>
    </div>
  )
}
