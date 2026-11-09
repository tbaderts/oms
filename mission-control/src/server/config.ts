import { resolve } from 'node:path';
import { z } from 'zod';

const list = (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean);

const env = z.object({
  MC_PORT: z.coerce.number().int().default(8097),
  MC_KAFKA_BROKERS: z.string().default('localhost:9092'),
  MC_SCHEMA_REGISTRY_URL: z.string().default('http://localhost:8081'),
  MC_MIMIR_URL: z.string().default('http://localhost:9009/prometheus'),
  MC_LOKI_URL: z.string().default('http://localhost:3100'),
  MC_DATA_DIR: z.string().default('./data'),
  MC_ALLOWED_HOSTS: z.string().default('localhost,127.0.0.1'),
  MC_ORDER_TOPIC: z.string().default('oms_orders'),
  MC_ORDER_EXECUTION_TOPIC: z.string().default('oms_order_executions'),
  MC_AI_PROVIDER: z.enum(['anthropic', 'openai', 'local', 'none']).default('anthropic'),
  MC_AI_MODEL: z.string().optional(),
  MC_AI_BASE_URL: z.string().optional(),
  MC_AI_MAX_TOKENS: z.coerce.number().int().default(4096),
});

export interface AiConfig {
  provider: 'anthropic' | 'openai' | 'local' | 'none';
  model: string;
  baseUrl?: string;
  maxTokens: number;
}

export interface AppConfig {
  port: number;
  kafkaBrokers: string[];
  registryUrl: string;
  mimirUrl: string;
  lokiUrl: string;
  dataDir: string;
  allowedHosts: string[];
  topics: { orders: string; executions: string };
  ai: AiConfig;
}

const DEFAULT_MODELS = { anthropic: 'claude-sonnet-5-5', openai: 'gpt-4o', local: 'llama3', none: '' } as const;

/** Reads the configuration from the environment. API keys are read where they are used, never stored here (P-16). */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const e = env.parse(source);
  return {
    port: e.MC_PORT,
    kafkaBrokers: list(e.MC_KAFKA_BROKERS),
    registryUrl: e.MC_SCHEMA_REGISTRY_URL,
    mimirUrl: e.MC_MIMIR_URL,
    lokiUrl: e.MC_LOKI_URL,
    dataDir: resolve(e.MC_DATA_DIR),
    allowedHosts: list(e.MC_ALLOWED_HOSTS),
    topics: { orders: e.MC_ORDER_TOPIC, executions: e.MC_ORDER_EXECUTION_TOPIC },
    ai: { provider: e.MC_AI_PROVIDER, model: e.MC_AI_MODEL ?? DEFAULT_MODELS[e.MC_AI_PROVIDER], baseUrl: e.MC_AI_BASE_URL, maxTokens: e.MC_AI_MAX_TOKENS },
  };
}
