import type { IpcMain } from 'electron';
import type { ConfigService } from '../services/ConfigService';
import { ApiCatalogService } from '../services/ApiCatalogService';
import { ApiHistoryService } from '../services/ApiHistoryService';
import { ApiTemplateService } from '../services/ApiTemplateService';
import { OmsHttpService, type OmsHttpOptions } from '../services/OmsHttpService';
import {
  COMMAND_PATH,
  DEFAULT_OMS_CORE_URL,
  SEARCH_PATH,
  isLocalHost,
  type ApiResponse,
  type Paging,
  type QueryParam,
  type SaveTemplateRequest,
  type SaveTemplateResult,
} from '../../shared/apiExplorer';

/** Path and query of a response URL, for the history; the base URL is shown separately. */
function pathOf(r: ApiResponse, fallback: string): string {
  try {
    const url = new URL(r.url);
    return url.pathname + url.search;
  } catch {
    return fallback;
  }
}

function commandLabel(bodyText: string): string {
  try {
    const type = JSON.parse(bodyText)?.type;
    return typeof type === 'string' && type ? type : '(no type)';
  } catch {
    return '(invalid JSON)';
  }
}

// Requests are built in main from the configured base URL and fixed paths; the renderer only
// supplies a body, filter rows or an order id, all validated by OmsHttpService.
export function registerApiExplorerIpc(ipcMain: IpcMain, configService: ConfigService, httpOptions: OmsHttpOptions = {}): void {
  // Read per request, so a URL saved in Settings applies to the next call.
  const baseUrl = () => configService.getConfig().infrastructure.omsCoreUrl?.trim() || DEFAULT_OMS_CORE_URL;
  const http = new OmsHttpService(baseUrl, httpOptions);
  const history = new ApiHistoryService(configService.getConfigDir());
  // The request already happened; a history that cannot be written must not lose its response.
  const record = (entry: Parameters<ApiHistoryService['add']>[0]) => {
    try {
      history.add(entry);
    } catch (err) {
      console.warn(`[api-explorer] history not written: ${(err as Error).message}`);
    }
  };

  ipcMain.handle('apiExplorer:catalog', async () => {
    const config = configService.getConfig();
    return new ApiCatalogService(config.general.workspaceRoot, config.specs.openApiPaths).load();
  });

  ipcMain.handle('apiExplorer:baseUrl', async () => ({ baseUrl: baseUrl(), local: isLocalHost(baseUrl()) }));

  ipcMain.handle('apiExplorer:sendCommand', async (_event, bodyText: string, confirmedHost?: string) => {
    const text = String(bodyText ?? '');
    const r = await http.sendCommand(text, typeof confirmedHost === 'string' ? confirmedHost : undefined);
    record({
      kind: 'command',
      label: commandLabel(text),
      method: 'POST',
      path: pathOf(r, COMMAND_PATH),
      status: r.status,
      durationMs: r.durationMs,
      request: { body: text },
      ...(r.refused ? { refused: true } : {}),
    });
    return r;
  });

  ipcMain.handle('apiExplorer:search', async (_event, params: QueryParam[], paging: Paging) => {
    const rows = Array.isArray(params) ? params : [];
    const p = paging ?? {};
    const r = await http.search(rows, p);
    record({
      kind: 'query',
      label: 'search',
      method: 'GET',
      path: pathOf(r, SEARCH_PATH),
      status: r.status,
      durationMs: r.durationMs,
      request: { params: rows, ...p },
      ...(r.refused ? { refused: true } : {}),
    });
    return r;
  });

  ipcMain.handle('apiExplorer:followUp', async (_event, orderId: string) => http.followUp(String(orderId ?? '')));

  ipcMain.handle('apiExplorer:history', async () => history.list());

  ipcMain.handle('apiExplorer:clearHistory', async () => history.clear());

  const templates = () => {
    const config = configService.getConfig();
    return new ApiTemplateService(config.general.workspaceRoot, config.infrastructure.apiTemplateSources ?? [], baseUrl);
  };

  ipcMain.handle('apiExplorer:templates', async () => templates().list());

  ipcMain.handle('apiExplorer:saveTemplate', async (_event, req: SaveTemplateRequest): Promise<SaveTemplateResult> => {
    const valid =
      req && typeof req === 'object' && typeof req.name === 'string' && typeof req.body === 'string' &&
      (('path' in req && typeof req.path === 'string') || ('newFile' in req && typeof req.newFile === 'string'));
    return valid ? templates().save(req) : { ok: false, error: 'Invalid save request' };
  });
}
