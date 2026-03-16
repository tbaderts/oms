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
  events: {
    getWebSocketUrl: () => ipcRenderer.invoke('events:getWebSocketUrl'),
  },
};

contextBridge.exposeInMainWorld('cockpit', api);
