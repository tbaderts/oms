import { contextBridge, ipcRenderer } from 'electron';
import type { CockpitAPI } from '../shared/types/ipc';

const api: CockpitAPI = {
  config: {
    load: () => ipcRenderer.invoke('config:load'),
    save: (config) => ipcRenderer.invoke('config:save', config),
    getWorkspaceRoot: () => ipcRenderer.invoke('config:getWorkspaceRoot'),
  },
  kb: {
    getCategories: () => ipcRenderer.invoke('kb:getCategories'),
    getDocuments: (category) => ipcRenderer.invoke('kb:getDocuments', category),
    getDocument: (path) => ipcRenderer.invoke('kb:getDocument', path),
    search: (query) => ipcRenderer.invoke('kb:search', query),
  },
  fs: {
    readDir: (path) => ipcRenderer.invoke('fs:readDir', path),
    readFile: (path) => ipcRenderer.invoke('fs:readFile', path),
    stat: (path) => ipcRenderer.invoke('fs:stat', path),
  },
  requirements: {
    getUseCases: () => ipcRenderer.invoke('requirements:getUseCases'),
    getFunctionalRequirements: () => ipcRenderer.invoke('requirements:getFunctionalRequirements'),
    getNonFunctionalRequirements: () => ipcRenderer.invoke('requirements:getNonFunctionalRequirements'),
    getActors: () => ipcRenderer.invoke('requirements:getActors'),
  },
  git: {
    getStatus: () => ipcRenderer.invoke('git:getStatus'),
    getLog: (limit?: number) => ipcRenderer.invoke('git:getLog', limit),
    getDiff: (ref?: string) => ipcRenderer.invoke('git:getDiff', ref),
    getFileDiff: (path: string) => ipcRenderer.invoke('git:getFileDiff', path),
    getBranches: () => ipcRenderer.invoke('git:getBranches'),
    createBranch: (name: string) => ipcRenderer.invoke('git:createBranch', name),
    checkoutBranch: (name: string) => ipcRenderer.invoke('git:checkoutBranch', name),
    deleteBranch: (name: string, force?: boolean) => ipcRenderer.invoke('git:deleteBranch', name, force),
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
    showItemInFolder: (path) => ipcRenderer.invoke('shell:showItemInFolder', path),
    getAppVersion: () => ipcRenderer.invoke('shell:getAppVersion'),
    getPlatform: () => ipcRenderer.invoke('shell:getPlatform'),
  },
  specs: {
    discoverFiles: () => ipcRenderer.invoke('specs:discoverFiles'),
    readFile: (path: string) => ipcRenderer.invoke('specs:readFile', path),
    writeFile: (path: string, content: string) => ipcRenderer.invoke('specs:writeFile', path, content),
    validate: (path: string, content: string) => ipcRenderer.invoke('specs:validate', path, content),
    getCodeGenTasks: () => ipcRenderer.invoke('specs:getCodeGenTasks'),
    runCodeGen: (taskId: string) => ipcRenderer.invoke('specs:runCodeGen', taskId),
    parseEntities: () => ipcRenderer.invoke('specs:parseEntities'),
  },
  specTickets: {
    list: (includeArchived: boolean) => ipcRenderer.invoke('specTickets:list', includeArchived),
    get: (id: string) => ipcRenderer.invoke('specTickets:get', id),
    run: (action) => ipcRenderer.invoke('specTickets:run', action),
    saveDocument: (id, doc, content, baseContent, force) =>
      ipcRenderer.invoke('specTickets:saveDocument', id, doc, content, baseContent, force),
    draftGate: (id, doc, content) => ipcRenderer.invoke('specTickets:draftGate', id, doc, content),
    toggleTask: (id, taskId, done, baseContent, force) =>
      ipcRenderer.invoke('specTickets:toggleTask', id, taskId, done, baseContent, force),
  },
  apiExplorer: {
    catalog: () => ipcRenderer.invoke('apiExplorer:catalog'),
    baseUrl: () => ipcRenderer.invoke('apiExplorer:baseUrl'),
    sendCommand: (bodyText, confirmedHost) => ipcRenderer.invoke('apiExplorer:sendCommand', bodyText, confirmedHost),
    search: (params, paging) => ipcRenderer.invoke('apiExplorer:search', params, paging),
    followUp: (orderId) => ipcRenderer.invoke('apiExplorer:followUp', orderId),
    history: () => ipcRenderer.invoke('apiExplorer:history'),
    clearHistory: () => ipcRenderer.invoke('apiExplorer:clearHistory'),
    templates: () => ipcRenderer.invoke('apiExplorer:templates'),
    saveTemplate: (req) => ipcRenderer.invoke('apiExplorer:saveTemplate', req),
  },
  storyboards: {
    scan: () => ipcRenderer.invoke('storyboards:scan'),
    detail: (id) => ipcRenderer.invoke('storyboards:detail', id),
    create: (input) => ipcRenderer.invoke('storyboards:create', input),
    saveStory: (id, patch, body, revision) => ipcRenderer.invoke('storyboards:saveStory', id, patch, body, revision),
    createStep: (id, title, afterStepId, revision) => ipcRenderer.invoke('storyboards:createStep', id, title, afterStepId, revision),
    saveStep: (id, stepId, patch, body, revision) => ipcRenderer.invoke('storyboards:saveStep', id, stepId, patch, body, revision),
    deleteStep: (id, stepId, deleteAssets, revision) => ipcRenderer.invoke('storyboards:deleteStep', id, stepId, deleteAssets, revision),
    reorder: (id, stepIds, revision) => ipcRenderer.invoke('storyboards:reorder', id, stepIds, revision),
    saveIllustration: (id, name, svg) => ipcRenderer.invoke('storyboards:saveIllustration', id, name, svg),
    readIllustration: (id, name) => ipcRenderer.invoke('storyboards:readIllustration', id, name),
    library: (id) => ipcRenderer.invoke('storyboards:library', id),
    links: () => ipcRenderer.invoke('storyboards:links'),
    backlinks: (target) => ipcRenderer.invoke('storyboards:backlinks', target),
    exportMermaid: (id, extensions, save) => ipcRenderer.invoke('storyboards:exportMermaid', id, extensions, save),
    exportHtml: (id, sequenceSvg, save) => ipcRenderer.invoke('storyboards:exportHtml', id, sequenceSvg, save),
    exportPdf: (id, sequenceSvg) => ipcRenderer.invoke('storyboards:exportPdf', id, sequenceSvg),
    aiAvailable: () => ipcRenderer.invoke('storyboards:aiAvailable'),
    aiAssist: (kind, id, stepId) => ipcRenderer.invoke('storyboards:aiAssist', kind, id, stepId),
  },
  events: {
    getWebSocketUrl: () => ipcRenderer.invoke('events:getWebSocketUrl'),
  },
};

contextBridge.exposeInMainWorld('cockpit', api);
