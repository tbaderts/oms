import type { IpcMain } from 'electron';
import type { ConfigService } from '../services/ConfigService';
import { ApiCatalogService } from '../services/ApiCatalogService';
import { ApiHistoryService } from '../services/ApiHistoryService';
import { ApiTemplateService } from '../services/ApiTemplateService';
import { HttpRequestService, type HttpRequestOptions } from '../services/HttpRequestService';
import type { ApiRequest, ApiResponse, SaveTemplateRequest, SaveTemplateResult } from '../../shared/apiExplorer';

/** Headers whose values are credentials; the history keeps their names only. */
const SECRET_HEADER = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key|x-auth-token)$|token|secret|password/i;
export const REDACTED = '<redacted>';

/** The headers as the history stores them: credential values replaced. */
export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, SECRET_HEADER.test(k) ? REDACTED : v]));
}

/** Path and query of a URL, for the history list. */
function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

/**
 * IPC for the API Explorer (SPEC-0076). The APIs and template files come from the project's
 * `cockpit.yaml`, read per call so an edit applies at once; requests are sent from the main process.
 */
export function registerApiExplorerIpc(ipcMain: IpcMain, configService: ConfigService, httpOptions: HttpRequestOptions = {}): void {
  const http = new HttpRequestService(httpOptions);
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
    const root = configService.getWorkspaceRoot();
    return new ApiCatalogService(root, configService.getProject().config.apiExplorer.apis).load();
  });

  ipcMain.handle('apiExplorer:send', async (_event, req: ApiRequest, confirmedHost?: string): Promise<ApiResponse> => {
    const request: ApiRequest = {
      method: String(req?.method ?? ''),
      url: String(req?.url ?? ''),
      ...(req?.headers && typeof req.headers === 'object' ? { headers: req.headers } : {}),
      ...(typeof req?.body === 'string' ? { body: req.body } : {}),
    };
    const r = await http.send(request, typeof confirmedHost === 'string' ? confirmedHost : undefined);
    record({
      label: typeof req?.label === 'string' && req.label.trim() ? req.label.trim() : `${request.method.toUpperCase()} ${pathOf(request.url)}`,
      method: request.method.toUpperCase(),
      path: pathOf(r.url || request.url),
      url: request.url,
      status: r.status,
      durationMs: r.durationMs,
      request: { ...(request.body ? { body: request.body } : {}), ...(request.headers && Object.keys(request.headers).length ? { headers: redactHeaders(request.headers) } : {}) },
      ...(r.refused ? { refused: true } : {}),
    });
    return r;
  });

  ipcMain.handle('apiExplorer:history', async () => history.list());

  ipcMain.handle('apiExplorer:clearHistory', async () => history.clear());

  const templates = () => {
    const config = configService.getConfig();
    return new ApiTemplateService(config.general.workspaceRoot, config.infrastructure.apiTemplateSources ?? []);
  };

  ipcMain.handle('apiExplorer:templates', async () => templates().list());

  ipcMain.handle('apiExplorer:saveTemplate', async (_event, req: SaveTemplateRequest): Promise<SaveTemplateResult> => {
    const valid =
      req && typeof req === 'object' && typeof req.name === 'string' && typeof req.body === 'string' &&
      typeof req.method === 'string' && typeof req.url === 'string' &&
      (('path' in req && typeof req.path === 'string') || ('newFile' in req && typeof req.newFile === 'string'));
    return valid ? templates().save(req) : { ok: false, error: 'Invalid save request' };
  });
}
