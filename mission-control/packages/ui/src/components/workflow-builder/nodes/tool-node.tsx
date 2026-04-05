import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Wrench } from 'lucide-react'

export function ToolNode({ data }: NodeProps) {
  return (
    <div className="px-4 py-3 bg-amber-950 border border-amber-700 rounded-lg min-w-[160px]">
      <Handle type="target" position={Position.Top} className="!bg-amber-500" />
      <div className="flex items-center gap-2">
        <Wrench size={16} className="text-amber-400" />
        <span className="text-sm font-medium text-amber-100">{(data as { label?: string }).label ?? 'Tool'}</span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-amber-500" />
    </div>
  )
}
