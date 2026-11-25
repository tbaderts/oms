import type { IpcMain } from 'electron';
import type { ConfigService } from '../services/ConfigService';
import { MonitorService } from '../services/MonitorService';
import type { MonitorConfigResult, MonitorPoll } from '../../shared/types/monitor';

/**
 * IPC for the Monitoring view (SPEC-0076). The configuration is read from the project's
 * `cockpit.yaml` on every call, so an edit applies to the next poll. Both channels always resolve.
 *
 * Channels:
 * - `monitor:config` → the monitoring section, the project's links and the file's validation errors
 * - `monitor:poll`   → one check per service and one result per panel
 */
export function registerMonitorIpc(ipcMain: IpcMain, configService: ConfigService, service = new MonitorService()): void {
  ipcMain.handle('monitor:config', async (): Promise<MonitorConfigResult> => {
    const project = configService.getProject();
    return {
      file: project.file,
      present: project.present,
      projectName: project.config.project.name,
      monitoring: project.config.monitoring,
      errors: project.errors,
      links: project.config.links,
    };
  });

  ipcMain.handle('monitor:poll', async (): Promise<MonitorPoll> => {
    try {
      return await service.poll(configService.getProject().config.monitoring);
    } catch (err) {
      // poll() does not throw; this guards the channel's promise to always resolve.
      console.warn('[monitor] poll failed:', (err as Error).message);
      return { checks: [], panels: [], at: Date.now() };
    }
  });
}
