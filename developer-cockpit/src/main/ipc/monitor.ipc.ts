import type { IpcMain } from 'electron';
import type { ConfigService } from '../services/ConfigService';
import { MonitorService } from '../services/MonitorService';
import { DEFAULT_OMS_CORE_URL } from '../../shared/apiExplorer';
import type { MonitorHealthResult, MonitorMetricsResult } from '../../shared/types/monitor';

/**
 * IPC for the Monitoring view (SPEC-0053). Mirrors `docker.ipc.ts`: the base URL is read per
 * request from the configured `infrastructure.omsCoreUrl` so a Settings change applies to the next
 * poll, and both channels always resolve (never reject) — a failure comes back as a typed result.
 *
 * Channels:
 * - `monitor:health`  → GET <base>/actuator/health
 * - `monitor:metrics` → GET <base>/actuator/prometheus
 */
export function registerMonitorIpc(ipcMain: IpcMain, configService: ConfigService): void {
  const baseUrl = () => configService.getConfig().infrastructure.omsCoreUrl?.trim() || DEFAULT_OMS_CORE_URL;
  const service = new MonitorService(baseUrl);

  ipcMain.handle('monitor:health', async (): Promise<MonitorHealthResult> => service.health());
  ipcMain.handle('monitor:metrics', async (): Promise<MonitorMetricsResult> => service.prometheus());
}
