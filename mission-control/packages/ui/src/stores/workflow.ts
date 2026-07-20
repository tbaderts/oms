import { create } from 'zustand'
import type { Node, Edge } from '@xyflow/react'

interface WorkflowState {
  nodes: Node[]
  edges: Edge[]
  name: string
  setNodes: (nodes: Node[]) => void
  setEdges: (edges: Edge[]) => void
  setName: (name: string) => void
  addNode: (node: Node) => void
  reset: () => void
}

export const useWorkflowStore = create<WorkflowState>((set) => ({
  nodes: [],
  edges: [],
  name: 'New Workflow',
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  setName: (name) => set({ name }),
  addNode: (node) => set((state) => ({ nodes: [...state.nodes, node] })),
  reset: () => set({ nodes: [], edges: [], name: 'New Workflow' }),
}))
