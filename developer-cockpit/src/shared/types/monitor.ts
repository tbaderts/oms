/**
 * Shared monitor types (SPEC-0076). The Monitoring view asks the main process for the project's
 * `monitoring` configuration (`monitor:config`) and, on every poll, for the state of each
 * configured service and the value of each configured panel (`monitor:poll`). The renderer never
 * talks to a monitored service directly.
 */
import type { ConfigProblem, MonitoringConfig, PanelUnit } from '../projectConfig';

export type ServiceStatus = 'UP' | 'DOWN' | 'UNKNOWN';

/** The result of one health check. */
export interface ServiceCheck {
  name: string;
  status: ServiceStatus;
  /** Milliseconds until the answer (or the failure); null when the check could not start. */
  latencyMs: number | null;
  /** Epoch ms when the check finished. */
  checkedAt: number;
  /** What was checked: the URL, or `host:port` for a TCP check. */
  target: string;
  /** Why the service is DOWN or UNKNOWN. */
  reason?: string;
  /** Spring Boot actuator components (`db`, `diskSpace`, …) and their status. */
  components?: Record<string, string>;
}

export interface PanelBar {
  label: string;
  value: number;
}

export interface PanelPoint {
  /** Epoch ms. */
  t: number;
  value: number;
}

/** The value of one panel for one poll. */
export interface PanelResult {
  title: string;
  type: 'stat' | 'timeseries' | 'bars';
  unit: PanelUnit;
  ok: boolean;
  error?: string;
  /** stat (and scrape timeseries, which the renderer accumulates): null when there is no data. */
  value?: number | null;
  bars?: PanelBar[];
  /** timeseries from PromQL: the points of the range query. */
  series?: PanelPoint[];
}

/** The result of `monitor:config`. */
export interface MonitorConfigResult {
  /** Absolute path of the project's `cockpit.yaml`. */
  file: string;
  present: boolean;
  projectName: string;
  monitoring: MonitoringConfig;
  /** Validation errors of `cockpit.yaml`; when non-empty, `monitoring` is the empty default. */
  errors: ConfigProblem[];
  /** The project's links (Grafana, docs, …), shown in the view header. */
  links: { label: string; url: string }[];
}

/** The result of `monitor:poll`. */
export interface MonitorPoll {
  checks: ServiceCheck[];
  panels: PanelResult[];
  /** Epoch ms when the poll finished. */
  at: number;
}
