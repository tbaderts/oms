export interface CockpitConfig {
  general: GeneralConfig;
  scm: ScmConfig;
  ai: AiConfig;
  knowledgeBase: KnowledgeBaseConfig;
  infrastructure: InfrastructureConfig;
  specs: SpecsConfig;
}

export interface GeneralConfig {
  workspaceRoot: string;
  theme: 'light' | 'dark' | 'system';
  fontSize: number;
  sidebarCollapsed: boolean;
}

export interface ScmConfig {
  defaultBranch: string;
  autoFetch: boolean;
  fetchIntervalSeconds: number;
}

export interface AiConfig {
  provider: 'anthropic' | 'openai' | 'local';
  model: string;
  apiKeyEnvVar: string;
  maxTokens: number;
  temperature: number;
}

export interface KnowledgeBaseConfig {
  rootPath: string;
  categories: string[];
  fileExtensions: string[];
  excludePatterns: string[];
}

export interface InfrastructureConfig {
  dockerEnabled: boolean;
  kubernetesEnabled: boolean;
  prometheusUrl: string;
  grafanaUrl: string;
  lokiUrl: string;
}

export interface SpecsConfig {
  openApiPaths: string[];
  avroPaths: string[];
  autoGenerate: boolean;
}

export const DEFAULT_CONFIG: CockpitConfig = {
  general: {
    workspaceRoot: 'C:\\data\\workspace\\oms',
    theme: 'dark',
    fontSize: 14,
    sidebarCollapsed: false,
  },
  scm: {
    defaultBranch: 'main',
    autoFetch: true,
    fetchIntervalSeconds: 300,
  },
  ai: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    maxTokens: 4096,
    temperature: 0.7,
  },
  knowledgeBase: {
    rootPath: 'oms-knowledge-base',
    categories: ['oms-concepts', 'oms-framework', 'oms-methodolgy'],
    fileExtensions: ['.md', '.mdx'],
    excludePatterns: ['node_modules', '.git', 'build', 'dist'],
  },
  infrastructure: {
    dockerEnabled: true,
    kubernetesEnabled: false,
    prometheusUrl: 'http://localhost:9090',
    grafanaUrl: 'http://localhost:3000',
    lokiUrl: 'http://localhost:3100',
  },
  specs: {
    openApiPaths: ['oms-core/src/main/openapi'],
    avroPaths: ['oms-core/src/main/avro'],
    autoGenerate: false,
  },
};
