export interface AdapterStatus {
  id: string
  name: string
  enabled: boolean
  connected: boolean
  error?: string
}

export interface Investigation {
  id: string
  symptom: string
  playbook?: string
  startedAt: string
  completedAt?: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  report?: {
    rootCause: string
    evidence: Array<{ source: string; finding: string; data?: string }>
    timeline: Array<{ timestamp: string; event: string }>
    recommendations: string[]
  }
}

export interface Playbook {
  title: string
  triggers: string[]
  priority: number
  content?: string
  filePath: string
}

export interface AgentInfo {
  id: string
  name: string
  description: string
}

export interface ToolInfo {
  id: string
  description: string
}

export interface WorkflowDefinition {
  id: string
  name: string
  description: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

export interface WorkflowNode {
  id: string
  type: 'agent' | 'tool' | 'workflow' | 'branch' | 'parallel' | 'approval' | 'map' | 'input' | 'output'
  position: { x: number; y: number }
  config: Record<string, unknown>
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  dataMapping?: Record<string, string>
}

export interface MissionControlConfig {
  server: { port: number }
  ai: { provider: string; model: string; apiKey: string }
  adapters: {
    kubernetes: { enabled: boolean; kubeconfig: string; defaultNamespace: string }
    docker: { enabled: boolean; socketPath: string }
    postgresql: { enabled: boolean; connectionString: string }
    prometheus: { enabled: boolean; url: string }
  }
}
