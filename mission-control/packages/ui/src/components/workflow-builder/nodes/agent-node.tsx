import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Bot } from 'lucide-react'

export function AgentNode({ data }: NodeProps) {
  return (
    <div className="px-4 py-3 bg-blue-950 border border-blue-700 rounded-xl min-w-[160px]">
      <Handle type="target" position={Position.Top} className="!bg-blue-500" />
      <div className="flex items-center gap-2">
        <Bot size={16} className="text-blue-400" />
        <span className="text-sm font-medium text-blue-100">{(data as { label?: string }).label ?? 'Agent'}</span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-blue-500" />
    </div>
  )
}
