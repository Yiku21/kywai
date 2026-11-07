import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type { CoworkApi, CoworkEvent, RoutineInput } from '../shared/types'

/** Copia simple (sin prototipos ni funciones) de lo que se manda al crear o cambiar una rutina. */
function routineInput(input: Partial<RoutineInput>): Partial<RoutineInput> {
  return JSON.parse(JSON.stringify(input ?? {})) as Partial<RoutineInput>
}

const api: CoworkApi = {
  getConfig: () => ipcRenderer.invoke('cowork:getConfig'),
  listProjects: () => ipcRenderer.invoke('cowork:listProjects'),
  createProject: (name) => ipcRenderer.invoke('cowork:createProject', name),
  renameProject: (projectId, name) => ipcRenderer.invoke('cowork:renameProject', projectId, name),
  deleteProject: (projectId) => ipcRenderer.invoke('cowork:deleteProject', projectId),
  clearChat: (projectId) => ipcRenderer.invoke('cowork:clearChat', projectId),
  listConversations: (projectId) => ipcRenderer.invoke('cowork:listConversations', projectId),
  recentConversations: (limit) => ipcRenderer.invoke('cowork:recentConversations', limit),
  newConversation: (projectId) => ipcRenderer.invoke('cowork:newConversation', projectId),
  openConversation: (projectId, conversationId) => ipcRenderer.invoke('cowork:openConversation', projectId, conversationId),
  renameConversation: (projectId, conversationId, title) => ipcRenderer.invoke('cowork:renameConversation', projectId, conversationId, title),
  deleteConversation: (projectId, conversationId) => ipcRenderer.invoke('cowork:deleteConversation', projectId, conversationId),
  setConversationPinned: (projectId, conversationId, pinned) => ipcRenderer.invoke('cowork:setConversationPinned', projectId, conversationId, pinned),
  pinnedConversations: () => ipcRenderer.invoke('cowork:pinnedConversations'),
  forkConversation: (projectId, conversationId) => ipcRenderer.invoke('cowork:forkConversation', projectId, conversationId),
  moveConversation: (projectId, conversationId, toProjectId) => ipcRenderer.invoke('cowork:moveConversation', projectId, conversationId, toProjectId),
  setProjectPinned: (projectId, pinned) => ipcRenderer.invoke('cowork:setProjectPinned', projectId, pinned),
  search: (query, projectId) => ipcRenderer.invoke('cowork:search', query, projectId),
  loadProject: (projectId) => ipcRenderer.invoke('cowork:loadProject', projectId),
  getRuntime: () => ipcRenderer.invoke('cowork:getRuntime'),
  sendMessage: (input) =>
    ipcRenderer.invoke('cowork:sendMessage', {
      projectId: input.projectId,
      text: input.text,
      filePaths: [...(input.filePaths ?? [])]
    }),
  cancelRun: (runId) => ipcRenderer.invoke('cowork:cancelRun', runId),
  pickFiles: (kind) => ipcRenderer.invoke('cowork:pickFiles', kind),
  pathForFile: (file) => webUtils.getPathForFile(file),
  readArtifact: (projectId, relPath) => ipcRenderer.invoke('cowork:readArtifact', projectId, relPath),
  openPath: (projectId, relPath) => ipcRenderer.invoke('cowork:openPath', projectId, relPath),
  setQuotaBudget: (groupId, budget) => ipcRenderer.invoke('cowork:setQuotaBudget', groupId, budget),
  refreshQuotas: () => ipcRenderer.invoke('cowork:refreshQuotas'),
  getUsageRuns: () => ipcRenderer.invoke('cowork:getUsageRuns'),
  getTaskTrace: (taskId) => ipcRenderer.invoke('cowork:getTaskTrace', taskId),
  getTaskChanges: (projectId, taskId) => ipcRenderer.invoke('cowork:getTaskChanges', projectId, taskId),
  undoTask: (projectId, taskId) => ipcRenderer.invoke('cowork:undoTask', projectId, taskId),
  listInbox: () => ipcRenderer.invoke('cowork:listInbox'),
  actInbox: (id, actionId) => ipcRenderer.invoke('cowork:actInbox', id, actionId),
  resetAgent: (agentId) => ipcRenderer.invoke('cowork:resetAgent', agentId),
  setAgentThinking: (agentId, enabled) => ipcRenderer.invoke('cowork:setAgentThinking', agentId, enabled),
  searchMusic: (query, kind) => ipcRenderer.invoke('cowork:searchMusic', query, kind),
  addMemory: (projectId, input) => ipcRenderer.invoke('cowork:addMemory', projectId, { kind: input.kind, text: input.text }),
  updateMemory: (projectId, id, patch) =>
    ipcRenderer.invoke('cowork:updateMemory', projectId, id, { kind: patch.kind, text: patch.text, status: patch.status }),
  deleteMemory: (projectId, id) => ipcRenderer.invoke('cowork:deleteMemory', projectId, id),
  setInstructions: (projectId, text) => ipcRenderer.invoke('cowork:setInstructions', projectId, text),
  createRoutine: (projectId, input) => ipcRenderer.invoke('cowork:createRoutine', projectId, routineInput(input)),
  updateRoutine: (projectId, id, patch) => ipcRenderer.invoke('cowork:updateRoutine', projectId, id, routineInput(patch)),
  deleteRoutine: (projectId, id) => ipcRenderer.invoke('cowork:deleteRoutine', projectId, id),
  runRoutineNow: (projectId, id) => ipcRenderer.invoke('cowork:runRoutineNow', projectId, id),
  getRoutineWebhook: (projectId, id, regenerate) => ipcRenderer.invoke('cowork:getRoutineWebhook', projectId, id, regenerate === true),
  resumeRun: (projectId, runId) => ipcRenderer.invoke('cowork:resumeRun', projectId, runId),
  approvePlan: (projectId, messageId) => ipcRenderer.invoke('cowork:approvePlan', projectId, messageId),
  rateMessage: (projectId, messageId, rating) => ipcRenderer.invoke('cowork:rateMessage', projectId, messageId, rating),
  rejectPlan: (projectId, messageId) => ipcRenderer.invoke('cowork:rejectPlan', projectId, messageId),
  setPlanApproval: (on) => ipcRenderer.invoke('cowork:setPlanApproval', on),
  setLanguage: (lang) => ipcRenderer.invoke('cowork:setLanguage', lang),
  getHermesModels: () => ipcRenderer.invoke('cowork:getHermesModels'),
  setHermesModel: (choice) =>
    ipcRenderer.invoke('cowork:setHermesModel', choice ? { provider: choice.provider, model: choice.model } : null),
  fixClaudeDirect: () => ipcRenderer.invoke('cowork:fixClaudeDirect'),
  listLocalEngines: () => ipcRenderer.invoke('cowork:listLocalEngines'),
  startLocalServer: (engine) => ipcRenderer.invoke('cowork:startLocalServer', engine),
  pullLocalModel: (model, agentId) => ipcRenderer.invoke('cowork:pullLocalModel', model, agentId),
  cancelLocalPull: () => ipcRenderer.invoke('cowork:cancelLocalPull'),
  setLocalAgent: (input) =>
    ipcRenderer.invoke('cowork:setLocalAgent', {
      agentId: input.agentId,
      engine: input.engine,
      model: input.model,
      modelLabel: input.modelLabel,
      name: input.name
    }),
  setQuotaUnlimited: (groupId, unlimited) => ipcRenderer.invoke('cowork:setQuotaUnlimited', groupId, unlimited),
  setAgentAccess: (access) => ipcRenderer.invoke('cowork:setAgentAccess', access),
  setupDetect: () => ipcRenderer.invoke('cowork:setupDetect'),
  setupInstall: (id) => ipcRenderer.invoke('cowork:setupInstall', id),
  setupLogin: (id) => ipcRenderer.invoke('cowork:setupLogin', id),
  setupAuth: (id) => ipcRenderer.invoke('cowork:setupAuth', id),
  setupGeminiKey: (key) => ipcRenderer.invoke('cowork:setupGeminiKey', key),
  setAgentKey: (agentId, key) => ipcRenderer.invoke('cowork:setAgentKey', agentId, key),
  setAgentsEnabled: (ids) => ipcRenderer.invoke('cowork:setAgentsEnabled', ids),
  addAgent: (input) => ipcRenderer.invoke('cowork:addAgent', input),
  removeAgent: (agentId) => ipcRenderer.invoke('cowork:removeAgent', agentId),
  setCoordinator: (agentId) => ipcRenderer.invoke('cowork:setCoordinator', agentId),
  setupFinish: () => ipcRenderer.invoke('cowork:setupFinish'),
  openExternal: (url) => ipcRenderer.invoke('cowork:openExternal', url),
  getWebAccess: () => ipcRenderer.invoke('cowork:getWebAccess'),
  getHostInfo: () => ipcRenderer.invoke('cowork:getHostInfo'),
  mobilePairingPin: () => ipcRenderer.invoke('cowork:mobilePairingPin'),
  getAccessLog: (limit) => ipcRenderer.invoke('cowork:getAccessLog', limit),
  setProjectFolder: (projectId, dir) => ipcRenderer.invoke('cowork:setProjectFolder', projectId, dir),
  listDevices: () => ipcRenderer.invoke('cowork:listDevices'),
  revokeDevice: (id) => ipcRenderer.invoke('cowork:revokeDevice', id),
  forgetDevice: (id) => ipcRenderer.invoke('cowork:forgetDevice', id),
  getHttpsLink: (host) => ipcRenderer.invoke('cowork:getHttpsLink', host),
  checkForUpdates: () => ipcRenderer.invoke('cowork:checkForUpdates'),
  restartApp: () => ipcRenderer.invoke('cowork:restartApp'),
  transcribeAudio: (path, language) => ipcRenderer.invoke('cowork:transcribeAudio', path, language),
  requestMicrophone: () => ipcRenderer.invoke('cowork:requestMicrophone'),
  applyUpdate: (setAside) => ipcRenderer.invoke('cowork:applyUpdate', setAside),
  setWebAccess: (input) => ipcRenderer.invoke('cowork:setWebAccess', input),
  savePastedFile: (name, data) => ipcRenderer.invoke('cowork:savePastedFile', name, data),
  pickProjectFolder: (projectId) => ipcRenderer.invoke('cowork:pickProjectFolder', projectId),
  listModelOptions: (agentId) => ipcRenderer.invoke('cowork:listModelOptions', agentId),
  setAgentModels: (input) =>
    ipcRenderer.invoke('cowork:setAgentModels', {
      agentId: input.agentId,
      light: input.light ? { model: input.light.model, label: input.light.label } : null,
      standard: { model: input.standard.model, label: input.standard.label },
      strong: input.strong ? { model: input.strong.model, label: input.strong.label } : null
    }),
  clearProjectFolder: (projectId) => ipcRenderer.invoke('cowork:clearProjectFolder', projectId),
  onEvent: (cb) => {
    const listener = (_e: IpcRendererEvent, ev: CoworkEvent): void => cb(ev)
    ipcRenderer.on('cowork:event', listener)
    return () => {
      ipcRenderer.removeListener('cowork:event', listener)
    }
  }
}

contextBridge.exposeInMainWorld('cowork', api)
