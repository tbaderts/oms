import type { RunConfig } from '../../shared/types.js';

export interface Refusal {
  check: 'allowlist' | 'oms-core' | 'kafka' | 'schema-registry' | string;
  detail: string;
}

export interface PreflightChecks {
  allowedHosts: string[];
  /** HTTP status of oms-core's /actuator/health, 0 when unreachable. */
  omsHealth(baseUrl: string): Promise<number>;
  /** null when the brokers answer, else why not. */
  kafka(): Promise<string | null>;
  /** null when the registry answers, else why not. */
  registry(): Promise<string | null>;
}

/**
 * Checks run before any order is sent (AC-6): the target host must be allowlisted, then oms-core,
 * Kafka and the Schema Registry must answer. The first failure, in that order, refuses the run.
 */
export async function preflight(config: RunConfig, checks: PreflightChecks): Promise<Refusal | null> {
  const host = new URL(config.omsBaseUrl).hostname;
  if (!checks.allowedHosts.includes(host)) {
    return { check: 'allowlist', detail: `host ${host} is not in MC_ALLOWED_HOSTS (${checks.allowedHosts.join(', ')})` };
  }
  const [oms, kafka, registry] = await Promise.all([checks.omsHealth(config.omsBaseUrl), checks.kafka(), checks.registry()]);
  if (oms < 200 || oms >= 300) return { check: 'oms-core', detail: oms === 0 ? `${config.omsBaseUrl} is unreachable` : `${config.omsBaseUrl}/actuator/health answered ${oms}` };
  if (kafka) return { check: 'kafka', detail: kafka };
  if (registry) return { check: 'schema-registry', detail: registry };
  return null;
}

/** GET {registryUrl}/subjects answers 2xx. */
export async function checkRegistry(registryUrl: string, timeoutMs = 3000): Promise<string | null> {
  try {
    const res = await fetch(`${registryUrl}/subjects`, { signal: AbortSignal.timeout(timeoutMs) });
    await res.arrayBuffer();
    return res.ok ? null : `${registryUrl}/subjects answered ${res.status}`;
  } catch (e) {
    return `${registryUrl} is unreachable: ${(e as Error).message}`;
  }
}
