import { useCallback } from 'react'
import {
  ReactFlow,
  addEdge,
  Background,
  Controls,
  type Connection,
  type OnNodesChange,
  type OnEdgesChange,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useWorkflowStore } from '../../stores/workflow.js'
import { AgentNode } from './nodes/agent-node.js'
import { ToolNode } from './nodes/tool-node.js'
import { InputNode } from './nodes/input-node.js'
import { OutputNode } from './nodes/output-node.js'

const nodeTypes = {
  agent: AgentNode,
  tool: ToolNode,
  input: InputNode,
  output: OutputNode,
}

export function WorkflowCanvas() {
  const { nodes, edges, setNodes, setEdges, addNode } = useWorkflowStore()

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes(applyNodeChanges(changes, nodes)),
    [nodes, setNodes]
  )

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges(applyEdgeChanges(changes, edges)),
    [edges, setEdges]
  )

  const onConnect = useCallback(
    (connection: Connection) => setEdges(addEdge(connection, edges)),
    [edges, setEdges]
  )

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const type = event.dataTransfer.getData('application/reactflow-type')
      const label = event.dataTransfer.getData('application/reactflow-label')
      if (!type) return

      const bounds = (event.target as HTMLElement).closest('.react-flow')?.getBoundingClientRect()
      if (!bounds) return

      const position = {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      }

      addNode({
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: { label },
      })
    },
    [addNode]
  )

  return (
    <div className="flex-1 h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        fitView
        className="bg-zinc-950"
      >
        <Background color="#333" gap={20} />
        <Controls className="!bg-zinc-800 !border-zinc-700" />
      </ReactFlow>
    </div>
  )
}
