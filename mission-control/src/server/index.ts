import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp, defaultOrigins } from './api/routes.js';
import { mountInvestigations } from './ai/routes.js';
import { systemClock } from './clock.js';
import { loadConfig } from './config.js';
import { KafkaEventSource, checkKafka } from './kafka/EventConsumer.js';
import { createLogger } from './log.js';
import { OmsClient } from './oms/OmsClient.js';
import { checkRegistry, preflight } from './run/Preflight.js';
import { RunEngine } from './run/RunEngine.js';
import { RunStore } from './run/RunStore.js';

const config = loadConfig();
const log = createLogger({ service: 'mission-control' });
const store = new RunStore(config.dataDir);

const engine = new RunEngine({
  clock: systemClock,
  store,
  log,
  eventSource: () => new KafkaEventSource({ brokers: config.kafkaBrokers, registryUrl: config.registryUrl, topics: config.topics, log }),
  client: (baseUrl, timeoutMs) => new OmsClient(baseUrl, { timeoutMs }),
  preflight: (runConfig) =>
    preflight(runConfig, {
      allowedHosts: config.allowedHosts,
      omsHealth: async (url) => {
        const client = new OmsClient(url);
        try {
          return await client.health();
        } finally {
          await client.close();
        }
      },
      kafka: () => checkKafka(config.kafkaBrokers),
      registry: () => checkRegistry(config.registryUrl),
    }),
});

const app = createApp({
  engine,
  store,
  allowedOrigins: defaultOrigins(config.port),
  extend: (a) => mountInvestigations(a, { config, store, engine, log }),
});

// Production: serve the built UI from dist/ui, with index.html for client-side routes.
const uiDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../ui');
if (existsSync(uiDir)) {
  app.use('/*', serveStatic({ root: uiDir }));
  app.get('*', serveStatic({ root: uiDir, path: 'index.html' }));
}

// Bound to loopback only: Mission Control is a local tool (P-16).
serve({ fetch: app.fetch, hostname: '127.0.0.1', port: config.port }, (info) => {
  log.info('mission-control listening', { url: `http://127.0.0.1:${info.port}`, dataDir: config.dataDir, kafka: config.kafkaBrokers, registry: config.registryUrl });
});
