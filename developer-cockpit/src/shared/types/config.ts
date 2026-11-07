import { DEFAULT_STORYBOARDS_CONFIG, type StoryboardsConfig } from './storyboards';

export interface CockpitConfig {
  general: GeneralConfig;
  scm: ScmConfig;
  ai: AiConfig;
  knowledgeBase: KnowledgeBaseConfig;
  infrastructure: InfrastructureConfig;
  specs: SpecsConfig;
  storyboards: StoryboardsConfig;
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

/** An MCP server the assistant's agent may use as a tool source (SPEC-0042). */
export interface AiMcpServer {
  name: string;
  /** HTTP(S) endpoint of the MCP server's streamable-HTTP transport. */
  url: string;
}

export interface AiConfig {
  provider: 'anthropic' | 'openai' | 'local';
  model: string;
  apiKeyEnvVar: string;
  /**
   * An explicit API key value. When set, it takes precedence over the `apiKeyEnvVar` lookup,
   * so a local vLLM server with a non-standard key can be configured without exporting an env var.
   */
  apiKey?: string;
  maxTokens: number;
  temperature: number;
  /** OpenAI-compatible endpoint for the `local` provider (e.g. Ollama `:11434/v1` or a vLLM server). */
  baseUrl?: string;
  /** MCP servers exposing tools to the agent. Empty/absent = KB-search tool only. */
  mcpServers?: AiMcpServer[];
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
  /** oms-core base URL the API Explorer calls. */
  omsCoreUrl: string;
  /** Extra `.http` files the API Explorer lists as templates, workspace-relative or absolute. */
  apiTemplateSources: string[];
}

export interface SpecsConfig {
  openApiPaths: string[];
  avroPaths: string[];
  autoGenerate: boolean;
}

/** Contract paths before the contracts moved to oms-contracts; saved configs with exactly these are migrated. */
export const LEGACY_SPECS_PATHS: Pick<SpecsConfig, 'openApiPaths' | 'avroPaths'> = {
  openApiPaths: ['oms-core/src/main/openapi'],
  avroPaths: ['oms-core/src/main/avro'],
};

export const DEFAULT_CONFIG: CockpitConfig = {
  general: {
    // Empty by default: the main process fills it from the git repo the app runs inside, so a
    // fresh checkout works on any machine. An explicit path saved in Settings always wins.
    workspaceRoot: '',
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
    // baseUrl is intentionally absent (the `local` provider has no default endpoint; a missing
    // baseUrl is a surfaced configuration error, AC-3). mcpServers defaults to "none configured".
    mcpServers: [],
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
    omsCoreUrl: 'http://localhost:8090',
    apiTemplateSources: [],
  },
  specs: {
    openApiPaths: ['oms-contracts/src/main/openapi'],
    avroPaths: ['oms-contracts/src/main/avro'],
    autoGenerate: false,
  },
  storyboards: { ...DEFAULT_STORYBOARDS_CONFIG, roots: [...DEFAULT_STORYBOARDS_CONFIG.roots] },
};
