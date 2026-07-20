import { Handle, Position } from '@xyflow/react'
import { ArrowRightCircle } from 'lucide-react'

export function InputNode() {
  return (
    <div className="px-4 py-3 bg-green-950 border border-green-700 rounded-full">
      <div className="flex items-center gap-2">
        <ArrowRightCircle size={16} className="text-green-400" />
        <span className="text-sm font-medium text-green-100">Input</span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-green-500" />
    </div>
  )
}
