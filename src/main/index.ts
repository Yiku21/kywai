import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, net, powerSaveBlocker, protocol, session, shell, systemPreferences, type OpenDialogOptions } from 'electron'
import { copyFileSync, existsSync, promises as fsp, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { hostname } from 'node:os'
import { pathToFileURL } from 'node:url'
import type { AddAgentInput, AgentId, ProjectState, QuotaBudget, SendMessageInput, SetAgentModelsInput, SetLocalAgentInput, SetWebAccessInput, WebAccessInfo, WebHttpsInfo } from '@shared/types'
import { parseSetupToolId } from '@shared/setupTool'
import {
  finishSetup,
  getConfig,
  loadConfig,
  setAgentAccess,
  setAgentModels,
  setAgentThinking,
  setHermesModel,
  setPlanApproval,
  setLanguage,
  addAgent,
  removeAgent,
  setCoordinator,
  setAgentsEnabled,
  setLocalAgent,
  setQuotaBudget,
  setQuotaUnlimited,
  setRestrictClients,
  setWebAccessConfig,
  validBudget
} from './config'
import { applyUpdate, checkForUpdates, sourceDir } from './selfUpdate'
import { setGuideEnv } from './coordinatorGuide'
import { transcribeAudio } from './voice'
import { lookupTempo, tempoResponse } from './musicTempo'
import { searchMusic } from './musicSearch'
import { mobilePairingPin, newWebToken, revokeMobileDevice, setClientReleaseDir, setFsAccess, startWebServer, stopWebServer, tailscaleIPv4, webAccessInfo, webHttpsPort, webMethods, type WebMethod } from './webServer'
import { DeviceRegistry } from './devices'
import { AccessLog, isInside, normalizePath, withinAny } from './serverFiles'
import { bootClient, chooseMode, closeClientWindow, focusClient, prepareClientSwitches, savedMode } from './client'
import { ensureWebCert } from './selfCert'
import { mobileSigningKey } from './mobileAuth'
import { disableHttps, enableHttps, httpsInfo } from './tailscale'
import { setAgentKeyResolver } from './agents/generic'
import { agentKey } from './keys'
import { checkAuth, detectTools, installTool, openLogin, refreshPath, saveAgentKey, saveGeminiKey } from './setup'
import { modelOptions } from './models'
import { contextMenuItems } from './contextMenu'
import { hermesModelLabel, hermesModelsInfo } from './hermesModels'
import { emit, setEventWindow } from './events'
import { cancelLocalPull, listLocalEngines, pullOllamaModel, savePastedFile, startLocalServer } from './local'
import {
  activeRunFor,
  activeRunsFor,
  approvePlan,
  rateMessage,
  getTaskChanges,
  undoTask,
  rejectPlan,
  unblockProvider,
  allAgents,
  cancelAll,
  cancelRun,
  discardRun,
  initOrchestrator,
  checkPresence,
  refreshPresence,
  resetAgent,
  resumeRun,
  runtimeSnapshot,
  runState,
  sendMessage
} from './orchestrator'
import { createRoutine, deleteRoutine, initRoutines, publicRoutines, routineWebhook, runRoutineNow, stopRoutines, updateRoutine } from './routines'
import { addMemory, deleteMemory, isMemoryKind, setInstructions, updateMemory } from './memory'
import { initUpdater } from './updater'
import * as store from './projects'
import * as conversations from './conversations'
import { computeQuotas, initQuota, latestQuotas, refreshQuotas, startQuotaTimer, stopQuota } from './quota'
import { claudeAuthMethod, removeClaudeOverrides } from './quotaProbe'
import { flushUsageLog, initUsageLog, usageRuns } from './usageLog'
import { initAgentSessions } from './agentSessions'
import { actInbox, flushInbox, initInbox, listInbox, notifyMacPermission, setScreenShareUrl } from './inbox'
import { startCoworkMcp, stopCoworkMcp } from './coworkMcp'
import { initSkills } from './skills'
import { deleteTraces, flushTaskTraces, getTaskTrace, initTaskTraces } from './taskTrace'
import { onMacPermissionPrompt, startMacPermissionWatch, stopMacPermissionWatch } from './macPermissions'
import { launchCommand, linuxAutostartEnabled, setLinuxAutostart } from './linuxDesktop'
import { isLang, tr } from '@shared/i18n'

// Must happen before 'ready'.
protocol.registerSchemesAsPrivileged([
  // corsEnabled: la interfaz pide el tempo de la música con fetch a cowork://music/… (responde con CORS abierto).
  { scheme: 'cowork', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }
])

// Modo cliente: la dirección del servidor se marca como segura (micrófono) antes de que arranque la app.
prepareClientSwitches()

let mainWindow: BrowserWindow | null = null

/** Icono de la ventana y la barra de tareas. */
const APP_ICON = join(app.getAppPath(), 'build', 'icon.ico')

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (focusClient()) return
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
  app.whenReady().then(boot).catch((e) => {
    console.error('[cowork] fallo al arrancar', e)
    dialog.showErrorBox('AI Cowork', tr('No se pudo iniciar: {message}', { message: (e as Error).message }))
    app.quit()
  })
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: '#060a12',
    title: 'AI Cowork',
    autoHideMenuBar: true,
    icon: existsSync(APP_ICON) ? APP_ICON : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })
  win.once('ready-to-show', () => win.show())
  // Clic derecho: copiar, pegar, corrector… (Electron no trae menú propio).
  win.webContents.on('context-menu', (_e, params) => {
    const items = contextMenuItems(params, {
      replaceMisspelling: (w) => win.webContents.replaceMisspelling(w),
      addToDictionary: (w) => win.webContents.session.addWordToSpellCheckerDictionary(w),
      openLink: (url) => void shell.openExternal(url),
      copyText: (t) => clipboard.writeText(t),
      copyImage: (x, y) => win.webContents.copyImageAt(x, y)
    })
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win })
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (devUrl && url.startsWith(devUrl)) return
    if (url.startsWith('file:')) return
    e.preventDefault()
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })
  if (process.env['ELECTRON_RENDERER_URL']) void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null
      setEventWindow(null)
    }
  })
  return win
}

function registerProtocol(): void {
  // cowork://file/<projectId>/<relPath...>
  protocol.handle('cowork', async (request) => {
    try {
      const url = new URL(request.url)
      if (url.hostname === 'music' && url.pathname === '/tempo') return tempoResponse(url)
      if (url.hostname !== 'file') return new Response('Not found', { status: 404 })
      const segments = url.pathname.split('/').filter(Boolean).map((s) => decodeURIComponent(s))
      const [projectId, ...rest] = segments
      if (!store.isValidProjectId(projectId) || rest.length === 0) return new Response('Forbidden', { status: 403 })
      if (rest.some((s) => s === '..' || s.includes('\\') || s.includes('\0'))) return new Response('Forbidden', { status: 403 })
      // Busca en la carpeta interna del proyecto y en la carpeta de trabajo (nunca fuera de ellas).
      let abs: string | null
      try {
        abs = store.resolveProjectFile(projectId, rest.join('/'))
      } catch {
        return new Response('Not found', { status: 404 })
      }
      if (!abs || !statSync(abs).isFile()) return new Response('Not found', { status: 404 })
      return net.fetch(pathToFileURL(abs).toString())
    } catch (e) {
      console.error('[cowork] protocol error', e)
      return new Response('Error', { status: 500 })
    }
  })
}

/**
 * El reproductor de YouTube exige que la app se identifique con la cabecera Referer; una página file:// no la
 * envía (error 152/153). Se usa el identificador de la app, como piden las normas de YouTube para apps de escritorio.
 */
const YOUTUBE_REFERER = 'https://com.aicowork.app/'
/**
 * Luces al ritmo con el sonido real, sin micrófono: la ventana de AI Cowork puede escuchar SU PROPIO sonido (lo que
 * suena en ella, como el reproductor de música) y seguir oyéndose por los altavoces. Nadie más: ni otras webs ni el
 * reproductor de YouTube (que no tiene permiso para pedirlo), y nunca la pantalla ni el sonido del resto del equipo.
 */
function allowOwnAudioForLights(): void {
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    const own = mainWindow?.webContents.mainFrame
    const frame = request.frame
    if (!own || !frame || frame.processId !== own.processId || frame.routingId !== own.routingId) {
      callback({})
      return
    }
    callback({ video: own, audio: own, enableLocalEcho: true })
  })
}

function identifyToYouTube(): void {
  const urls = ['https://www.youtube.com/*', 'https://www.youtube-nocookie.com/*']
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls }, (details, callback) => {
    const headers = details.requestHeaders
    if (!headers['Referer'] && !headers['referer']) headers['Referer'] = YOUTUBE_REFERER
    callback({ requestHeaders: headers })
  })
}

function encodeRel(relPath: string): string {
  return relPath
    .split('/')
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join('/')
}

const TEXT_CAP = 400 * 1024

async function readArtifact(projectId: unknown, relPath: unknown): Promise<{ text?: string; url?: string }> {
  if (!store.isValidProjectId(projectId) || typeof relPath !== 'string') throw new Error(tr('Ruta no válida'))
  const rel = relPath.replace(/\\/g, '/')
  const abs = store.resolveProjectFile(projectId, rel)
  if (!abs) throw new Error(tr('No se encontró el archivo en el proyecto'))
  const st = await fsp.stat(abs)
  if (!st.isFile()) throw new Error('No es un archivo')
  const kind = store.artifactKind(rel)
  const url = `cowork://file/${projectId}/${encodeRel(rel)}`
  if (kind === 'html' || kind === 'image') return { url }
  const fh = await fsp.open(abs, 'r')
  try {
    const len = Math.min(st.size, TEXT_CAP)
    const buf = Buffer.alloc(len)
    await fh.read(buf, 0, len, 0)
    if (kind === 'other' && buf.includes(0)) return { url } // binary
    let text = buf.toString('utf8')
    if (st.size > TEXT_CAP) text += tr('\n\n…(archivo truncado)')
    return { text }
  } finally {
    await fh.close()
  }
}

// ---------- Acceso web (Tailscale) ----------

let awakeId: number | null = null

/**
 * Clave de los móviles emparejados, en la carpeta de datos de la app (no cambia aunque cambie el espacio de trabajo).
 * Antes iba junto al certificado: si existe ahí, se copia, para que ningún móvil se desempareje.
 */
function mobileKeyFile(certDir: string): string {
  const file = join(app.getPath('userData'), 'mobile-key')
  const legacy = join(certDir, 'mobile-key')
  if (!existsSync(file) && existsSync(legacy)) {
    try {
      copyFileSync(legacy, file)
    } catch (e) {
      console.error('[cowork] móvil: no se pudo copiar la clave', e)
      return legacy
    }
  }
  return file
}

let accessLogFile: AccessLog | null = null
/** Registro de lo que hacen los clientes con los archivos de este equipo. */
function accessLog(): AccessLog {
  return (accessLogFile ??= new AccessLog(join(app.getPath('userData'), 'access-log.jsonl')))
}

/** Carpetas de los proyectos: la interna de cada uno y la carpeta de trabajo que le diste. */
function projectFolders(): string[] {
  return store.listProjects().flatMap((p) => [p.dir, p.workDir].filter((d): d is string => !!d))
}

let deviceRegistry: DeviceRegistry | null = null
/** Registro de móviles y clientes emparejados (en la carpeta de datos de la app, como la clave de los tokens). */
function devices(): DeviceRegistry {
  return (deviceRegistry ??= new DeviceRegistry(join(app.getPath('userData'), 'devices.json')))
}

/** Arranca o para el servidor web según la configuración; mientras está activo el equipo no suspende la app. */
async function applyWebAccess(): Promise<WebAccessInfo> {
  const w = getConfig().webAccess
  if (w.enabled) {
    // Versión HTTPS propia (puerto siguiente): certificado para esas IPs y los nombres de este equipo.
    const name = hostname().replace(/.local$/i, '').toLowerCase()
    const names = ['localhost', name, name && `${name}.local`].filter(Boolean)
    const certDir = join(getConfig().workspaceRoot, 'web-cert')
    await startWebServer(w.port, w.token, (ips) => ensureWebCert(certDir, [...ips, ...names]), allAgents, mobileSigningKey(mobileKeyFile(certDir)), devices())
    if (awakeId === null) awakeId = powerSaveBlocker.start('prevent-app-suspension')
  } else {
    await stopWebServer()
    if (awakeId !== null) powerSaveBlocker.stop(awakeId)
    awakeId = null
  }
  return currentWebAccess()
}

// Abrir al iniciar sesión: Electron lo hace en Windows y macOS; en Linux, con una entrada en ~/.config/autostart.
function openAtLogin(): boolean {
  return process.platform === 'linux' ? linuxAutostartEnabled() : app.getLoginItemSettings().openAtLogin
}

function setOpenAtLogin(on: boolean): void {
  if (process.platform === 'linux') setLinuxAutostart(on, launchCommand(process.execPath, process.argv))
  else app.setLoginItemSettings({ openAtLogin: on })
}

async function currentWebAccess(https?: WebHttpsInfo): Promise<WebAccessInfo> {
  const w = getConfig().webAccess
  return {
    ...webAccessInfo(w.enabled, w.port, w.token),
    restrictClients: w.restrictClients === true,
    openAtLogin: openAtLogin(),
    https: w.enabled ? (https ?? (await httpsInfo(w.port))) : undefined
  }
}

function registerIpc(): void {
  /** Registra una función para la app de escritorio (IPC) y para el acceso web. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handle = (name: string, fn: (...args: any[]) => unknown): void => {
    webMethods.set(name, fn as WebMethod)
    ipcMain.handle(`cowork:${name}`, (_e, ...args: unknown[]) => fn(...args))
  }
  handle('getConfig', () => getConfig())
  // Tempo de la música del espacio digital (por web; el escritorio usa cowork://music/tempo).
  handle('lookupTrackTempo', (query: unknown) => lookupTempo(query))
  handle('searchMusic', (query: unknown, kind?: unknown) => searchMusic(query, kind === 'videos' ? 'videos' : 'songs'))
  handle('listProjects', () => store.listProjects())
  handle('createProject', (name: unknown) => store.createProject(typeof name === 'string' ? name : ''))
  handle('loadProject', (projectId: unknown) => {
    if (!store.isValidProjectId(projectId)) throw new Error(tr('Proyecto no válido'))
    const active = activeRunsFor(projectId)
    const snap = store.snapshotProject(projectId)
    // Las rutinas van sin el secreto de su webhook (se pide aparte con getRoutineWebhook).
    return { ...snap, routines: publicRoutines(snap.routines), activeRunId: active[active.length - 1], activeRunIds: active }
  })
  // Eliminar un proyecto: va a la Papelera de este equipo todo lo suyo (si no se puede, se borra del todo).
  handle('deleteProject', async (projectId: unknown) => {
    if (!store.isValidProjectId(projectId)) throw new Error(tr('Proyecto no válido'))
    if (activeRunsFor(projectId).length) throw new Error(tr('Este proyecto tiene trabajo en marcha: detenlo antes de eliminarlo'))
    const { dirs, taskIds } = store.forgetProject(projectId)
    deleteTraces(taskIds)
    for (const dir of dirs) {
      try {
        await shell.trashItem(dir)
      } catch {
        await fsp.rm(dir, { recursive: true, force: true })
      }
    }
    store.ensureFirstProject()
    emit({ kind: 'project.deleted', projectId })
    return store.listProjects()
  })
  handle('renameProject', (projectId: unknown, name: unknown) => {
    if (!store.isValidProjectId(projectId)) throw new Error(tr('Proyecto no válido'))
    return store.renameProject(projectId, name)
  })
  handle('getRuntime', () => {
    const quotas = latestQuotas().length ? latestQuotas() : computeQuotas(getConfig(), allAgents())
    return { runtimes: runtimeSnapshot(), quotas }
  })
  /** Conversación nueva o volver a otra: no mientras el equipo trabaja en el proyecto (sus mensajes irían a la otra). */
  const switchConversation = (projectId: unknown, change: (id: string) => void, busyText: string): ProjectState => {
    if (!store.isValidProjectId(projectId)) throw new Error(tr('Proyecto no válido'))
    if (activeRunFor(projectId)) throw new Error(tr(busyText))
    change(projectId)
    const cid = store.getProject(projectId).conversation?.id
    emit({ kind: 'chat.cleared', projectId, conversationId: cid })
    emit({ kind: 'conversations.updated', projectId })
    const snap = store.snapshotProject(projectId)
    return { ...snap, routines: publicRoutines(snap.routines), activeRunId: undefined, activeRunIds: [] }
  }
  handle('clearChat', (projectId: unknown) => {
    switchConversation(projectId, (id) => conversations.newConversation(id), 'El equipo está trabajando en este proyecto: detenlo antes de limpiar el chat')
    return store.getProject(projectId as string).conversation?.id ?? ''
  })
  handle('newConversation', (projectId: unknown) =>
    switchConversation(projectId, (id) => conversations.newConversation(id), 'El equipo está trabajando en este proyecto: espera a que termine o detenlo para empezar otra conversación')
  )
  handle('openConversation', (projectId: unknown, conversationId: unknown) => {
    if (!conversations.isValidConversationId(conversationId)) throw new Error(tr('Conversación no válida'))
    return switchConversation(projectId, (id) => conversations.openConversation(id, conversationId), 'El equipo está trabajando en este proyecto: espera a que termine o detenlo para cambiar de conversación')
  })
  handle('listConversations', (projectId: unknown) => {
    if (!store.isValidProjectId(projectId)) throw new Error(tr('Proyecto no válido'))
    return conversations.listConversations(projectId)
  })
  handle('recentConversations', (limit?: unknown) => conversations.recentConversations(typeof limit === 'number' ? limit : 12))
  handle('renameConversation', (projectId: unknown, conversationId: unknown, title: unknown) => {
    if (!store.isValidProjectId(projectId) || !conversations.isValidConversationId(conversationId)) throw new Error(tr('Conversación no válida'))
    conversations.renameConversation(projectId, conversationId, title)
    emit({ kind: 'conversations.updated', projectId })
    return conversations.listConversations(projectId)
  })
  handle('deleteConversation', (projectId: unknown, conversationId: unknown) => {
    if (!store.isValidProjectId(projectId) || !conversations.isValidConversationId(conversationId)) throw new Error(tr('Conversación no válida'))
    conversations.deleteConversation(projectId, conversationId)
    emit({ kind: 'conversations.updated', projectId })
    return conversations.listConversations(projectId)
  })
  handle('setProjectPinned', (projectId: unknown, pinned: unknown) => {
    if (!store.isValidProjectId(projectId)) throw new Error(tr('Proyecto no válido'))
    conversations.setPinned(projectId, pinned === true)
    return { ...store.getProject(projectId).project }
  })
  handle('search', (query: unknown, projectId?: unknown) => conversations.search(query, typeof projectId === 'string' ? projectId : undefined))
  handle('sendMessage', (input: SendMessageInput) => {
    if (!input || typeof input !== 'object') throw new Error(tr('Mensaje no válido'))
    return sendMessage(input)
  })
  handle('cancelRun', (runId: unknown) => {
    if (typeof runId === 'string') cancelRun(runId)
  })
  // La pausa móvil usa la reanudación existente; cancelar desde escritorio conserva su comportamiento.
  webMethods.set('mobileStopRun', (runId: unknown) => {
    if (typeof runId !== 'string') throw new Error(tr('Petición no válida'))
    cancelRun(runId, 'pause')
  })
  // «Quitar» en Órbita: lo que quedó en pausa no se reanudará.
  webMethods.set('mobileDiscardRun', (projectId: unknown, runId: unknown) => {
    if (typeof runId !== 'string') throw new Error(tr('Petición no válida'))
    discardRun(projectArg(projectId), runId)
  })
  // Proyectos con peticiones en marcha (lista de conversaciones del móvil).
  webMethods.set('mobileRunningProjects', () => store.listProjects().filter((p) => activeRunsFor(p.id).length).map((p) => p.id))
  ipcMain.handle('cowork:pickFiles', async (e, kind: unknown) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? mainWindow
    const opts: OpenDialogOptions = {
      properties: ['openFile', 'multiSelections'],
      filters:
        kind === 'image'
          ? [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] }]
          : [{ name: tr('Todos los archivos'), extensions: ['*'] }]
    }
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    return r.canceled ? [] : r.filePaths
  })
  handle('readArtifact', (projectId: unknown, relPath: unknown) => readArtifact(projectId, relPath))
  ipcMain.handle('cowork:openPath', async (_e, projectId: unknown, relPath?: unknown) => {
    if (!store.isValidProjectId(projectId)) throw new Error(tr('Proyecto no válido'))
    let target = store.workRoot(projectId)
    if (typeof relPath === 'string' && relPath) {
      const abs = store.resolveProjectFile(projectId, relPath.replace(/\\/g, '/'))
      if (!abs) throw new Error(tr('No se encontró el archivo en el proyecto'))
      target = abs
    }
    const err = await shell.openPath(target)
    if (err) throw new Error(err)
  })
  handle('setQuotaBudget', async (groupId: unknown, budget: unknown) => {
    if (typeof groupId !== 'string') throw new Error(tr('Grupo no válido'))
    if (budget !== null && !validBudget(budget)) throw new Error(tr('Presupuesto no válido'))
    setQuotaBudget(groupId, budget as QuotaBudget | null)
    await refreshQuotas()
  })
  handle('refreshQuotas', async () => {
    await refreshPresence()
    await refreshQuotas({ codex: true, probe: true })
  })
  handle('getUsageRuns', () => usageRuns())
  handle('getTaskTrace', (taskId: unknown) => (typeof taskId === 'string' ? getTaskTrace(taskId) : []))
  handle('getTaskChanges', (projectId: unknown, taskId: unknown) => {
    if (typeof taskId !== 'string') throw new Error(tr('Tarea no válida'))
    return getTaskChanges(projectArg(projectId), taskId)
  })
  handle('undoTask', (projectId: unknown, taskId: unknown) => {
    if (typeof taskId !== 'string') throw new Error(tr('Tarea no válida'))
    return undoTask(projectArg(projectId), taskId)
  })
  handle('listInbox', () => listInbox())
  handle('actInbox', (id: unknown, actionId: unknown) => {
    if (typeof id !== 'string' || typeof actionId !== 'string') throw new Error(tr('Aviso no válido'))
    return actInbox(id, actionId)
  })
  handle('resetAgent', (id: unknown) => {
    if (typeof id !== 'string') throw new Error(tr('Agente no válido'))
    return resetAgent(id)
  })
  handle('setAgentThinking', (id: unknown, enabled: unknown) => {
    setAgentThinking(id, enabled)
    emit({ kind: 'config.updated', config: getConfig() })
  })
  // Memoria e instrucciones del proyecto (lo que escribe el usuario queda confirmado).
  const projectArg = (projectId: unknown): string => {
    if (!store.isValidProjectId(projectId)) throw new Error(tr('Proyecto no válido'))
    return projectId
  }
  handle('addMemory', (projectId: unknown, input: unknown) => {
    const i = (input ?? {}) as { kind?: unknown; text?: unknown }
    if (typeof i.text !== 'string' || !isMemoryKind(i.kind)) throw new Error(tr('Entrada no válida'))
    return addMemory(projectArg(projectId), { kind: i.kind, text: i.text }, { status: 'confirmed', by: 'user', byName: 'Tú' })
  })
  handle('updateMemory', (projectId: unknown, id: unknown, patch: unknown) => {
    if (typeof id !== 'string' || !patch || typeof patch !== 'object') throw new Error(tr('Cambio no válido'))
    const p = patch as { kind?: unknown; text?: unknown; status?: unknown }
    updateMemory(projectArg(projectId), id, {
      text: typeof p.text === 'string' ? p.text : undefined,
      kind: isMemoryKind(p.kind) ? p.kind : undefined,
      status: p.status === 'confirmed' || p.status === 'provisional' || p.status === 'superseded' ? p.status : undefined
    })
  })
  handle('deleteMemory', (projectId: unknown, id: unknown) => {
    if (typeof id !== 'string') throw new Error(tr('Entrada no válida'))
    deleteMemory(projectArg(projectId), id)
  })
  handle('setInstructions', (projectId: unknown, text: unknown) => {
    if (typeof text !== 'string') throw new Error(tr('Instrucciones no válidas'))
    setInstructions(projectArg(projectId), text)
  })
  // Rutinas del proyecto (peticiones que se lanzan solas). El secreto del webhook solo sale con getRoutineWebhook.
  handle('createRoutine', (projectId: unknown, input: unknown) => {
    if (!input || typeof input !== 'object') throw new Error(tr('Rutina no válida'))
    const i = input as { name?: unknown; request?: unknown; trigger?: unknown; enabled?: unknown }
    return createRoutine(projectArg(projectId), {
      name: typeof i.name === 'string' ? i.name : '',
      request: typeof i.request === 'string' ? i.request : '',
      trigger: i.trigger as never,
      enabled: i.enabled !== false
    })
  })
  handle('updateRoutine', (projectId: unknown, id: unknown, patch: unknown) => {
    if (typeof id !== 'string' || !patch || typeof patch !== 'object') throw new Error(tr('Cambio no válido'))
    const p = patch as { name?: unknown; request?: unknown; trigger?: unknown; enabled?: unknown }
    return updateRoutine(projectArg(projectId), id, {
      ...(typeof p.name === 'string' ? { name: p.name } : {}),
      ...(typeof p.request === 'string' ? { request: p.request } : {}),
      ...(p.trigger !== undefined ? { trigger: p.trigger as never } : {}),
      ...(typeof p.enabled === 'boolean' ? { enabled: p.enabled } : {})
    })
  })
  handle('deleteRoutine', (projectId: unknown, id: unknown) => {
    if (typeof id !== 'string') throw new Error(tr('Rutina no válida'))
    deleteRoutine(projectArg(projectId), id)
  })
  handle('runRoutineNow', (projectId: unknown, id: unknown) => {
    if (typeof id !== 'string') throw new Error(tr('Rutina no válida'))
    return runRoutineNow(projectArg(projectId), id)
  })
  handle('getRoutineWebhook', (projectId: unknown, id: unknown, regenerate?: unknown) => {
    if (typeof id !== 'string') throw new Error(tr('Rutina no válida'))
    return routineWebhook(projectArg(projectId), id, regenerate === true)
  })
  handle('resumeRun', (projectId: unknown, runId: unknown) => {
    if (typeof runId !== 'string') throw new Error(tr('Petición no válida'))
    return resumeRun(projectArg(projectId), runId)
  })
  // Plan que propone el coordinador: tu visto bueno lo pone en marcha; descartarlo no hace nada.
  handle('approvePlan', (projectId: unknown, messageId: unknown) => {
    if (typeof messageId !== 'string') throw new Error(tr('Plan no válido'))
    return approvePlan(projectArg(projectId), messageId)
  })
  handle('rateMessage', (projectId: unknown, messageId: unknown, rating: unknown) => {
    if (typeof messageId !== 'string') throw new Error('messageId inválido')
    rateMessage(projectArg(projectId), messageId, rating === 'up' || rating === 'down' ? rating : null)
  })
  handle('rejectPlan', (projectId: unknown, messageId: unknown) => {
    if (typeof messageId !== 'string') throw new Error(tr('Plan no válido'))
    rejectPlan(projectArg(projectId), messageId)
  })
  // Claude Code desviado a otro servidor (OmniRoute…): se quita el desvío para que use tu cuenta y dé la cuota.
  handle('fixClaudeDirect', async () => {
    const r = removeClaudeOverrides()
    const auth = await claudeAuthMethod()
    const quotas = await refreshQuotas({ probe: true })
    const claude = quotas.find((q) => q.agentIds.includes('claude'))
    const parts: string[] = []
    if (r.removed.length) parts.push(tr('Quitado de ~/.claude/settings.json: {v1} (copia en {basename}).', { v1: r.removed.join(', '), basename: basename(r.backup ?? '') }))
    else parts.push(tr('En ~/.claude/settings.json no había nada que desviara a Claude Code.'))
    if (r.stillInEnv.length) parts.push(tr('Siguen definidas en el entorno de la app: {v1} (quítalas de donde las configuraste).', { v1: r.stillInEnv.join(', ') }))
    if (!auth.loggedIn || auth.method !== 'claude.ai') {
      parts.push(tr('Falta iniciar sesión en Claude Code con tu cuenta de Claude: en el Terminal del equipo, «claude auth login».'))
    } else if (claude?.remainingPct != null) {
      parts.push(tr('Listo: Claude va directo a tu cuenta. Cuota restante: {v1}%.', { v1: Math.round(claude.remainingPct) }))
    } else {
      parts.push(tr('Claude ya va directo a tu cuenta; la cuota aparecerá en unos minutos.'))
    }
    return parts.join(' ')
  })

  // ---- Ejecución local (Ollama / LM Studio) ----
  const afterLocalChange = async (): Promise<void> => {
    emit({ kind: 'config.updated', config: getConfig() })
    await checkPresence(true, true)
    await refreshQuotas()
  }
  handle('listLocalEngines', () => listLocalEngines())
  handle('startLocalServer', async (engine: unknown) => {
    if (engine !== 'lmstudio' && engine !== 'ollama') throw new Error(tr('Motor no válido'))
    await startLocalServer(engine)
    await checkPresence(true, true)
  })
  handle('pullLocalModel', (model: unknown, agentId?: unknown) => {
    if (typeof model !== 'string') throw new Error(tr('Modelo no válido'))
    const target = typeof agentId === 'string' ? (agentId as AgentId) : undefined
    pullOllamaModel(
      model,
      async (m, aid) => {
        if (aid) setLocalAgent({ agentId: aid, engine: 'ollama', model: m, modelLabel: m })
        await afterLocalChange()
      },
      target
    )
  })
  handle('cancelLocalPull', () => cancelLocalPull())
  handle('setLocalAgent', async (input: SetLocalAgentInput) => {
    if (!input || typeof input !== 'object') throw new Error(tr('Datos no válidos'))
    setLocalAgent(input)
    await afterLocalChange()
  })
  handle('setQuotaUnlimited', async (groupId: unknown, unlimited: unknown) => {
    if (typeof groupId !== 'string') throw new Error(tr('Grupo no válido'))
    setQuotaUnlimited(groupId, unlimited === true)
    emit({ kind: 'config.updated', config: getConfig() })
    await refreshQuotas()
  })
  handle('setAgentAccess', (access: unknown) => {
    if (access !== 'full' && access !== 'project') throw new Error(tr('Permiso no válido'))
    setAgentAccess(access)
    emit({ kind: 'config.updated', config: getConfig() })
  })
  // «/model» en el chat: el modelo con el que coordina Hermes y los de sus proveedores con sesión.
  const hermesAgent = () => getConfig().agents.find((a) => a.provider === 'hermes')
  handle('getHermesModels', () => hermesModelsInfo(hermesAgent()))
  handle('setHermesModel', (choice: unknown) => {
    const c = choice && typeof choice === 'object' ? (choice as { provider?: unknown; model?: unknown }) : null
    if (c && (typeof c.provider !== 'string' || typeof c.model !== 'string')) throw new Error(tr('Modelo no válido'))
    setHermesModel(c ? { provider: c.provider as string, model: c.model as string } : null, hermesModelLabel)
    emit({ kind: 'config.updated', config: getConfig() })
    return hermesModelsInfo(hermesAgent())
  })
  handle('setLanguage', (id: unknown) => {
    if (!isLang(id)) throw new Error(tr('Idioma no válido'))
    setLanguage(id)
    emit({ kind: 'config.updated', config: getConfig() })
  })
  handle('setPlanApproval', (on: unknown) => {
    if (typeof on !== 'boolean') throw new Error(tr('Valor no válido'))
    setPlanApproval(on)
    emit({ kind: 'config.updated', config: getConfig() })
  })
  // ---- Asistente de configuración ----
  const toolId = parseSetupToolId
  handle('setupDetect', () => detectTools())
  ipcMain.handle('cowork:setupInstall', async (_e, id: unknown) => {
    const r = await installTool(toolId(id))
    if (r.ok) await refreshPresence()
    return r
  })
  ipcMain.handle('cowork:setupLogin', (_e, id: unknown) => openLogin(toolId(id)))
  handle('setupAuth', (id: unknown) => checkAuth(toolId(id)))
  handle('setupGeminiKey', async (key: unknown) => {
    const r = await saveGeminiKey(typeof key === 'string' ? key : '')
    // Con la clave nueva, Gemini (y sus becarios) vuelven a estar disponibles sin esperar.
    if (r.ok) unblockProvider('gemini')
    return r
  })
  // La clave de API de un agente solo se escribe desde la app de escritorio del servidor (no por web ni por móvil).
  ipcMain.handle('cowork:setAgentKey', async (_e, agentId: unknown, key: unknown) => {
    if (typeof agentId !== 'string' || typeof key !== 'string') throw new Error(tr('Datos no válidos'))
    const r = await saveAgentKey(agentId, key)
    await refreshPresence()
    return r
  })
  handle('setAgentsEnabled', async (ids: unknown) => {
    if (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string')) throw new Error(tr('Lista de agentes no válida'))
    setAgentsEnabled(ids as AgentId[])
    emit({ kind: 'config.updated', config: getConfig() })
    await refreshPresence()
  })
  // Agentes que el usuario añade o quita, y cuál coordina (la lista de agentes es suya, no solo la de fábrica).
  handle('addAgent', async (input: unknown) => {
    if (!input || typeof input !== 'object') throw new Error(tr('Datos no válidos'))
    const cfg = addAgent(input as AddAgentInput)
    emit({ kind: 'config.updated', config: cfg })
    await refreshPresence()
    return cfg
  })
  handle('removeAgent', async (agentId: unknown) => {
    if (typeof agentId !== 'string') throw new Error(tr('Agente no válido'))
    const cfg = removeAgent(agentId)
    emit({ kind: 'config.updated', config: cfg })
    emit({ kind: 'agent.removed', agentId })
    await refreshPresence()
    return cfg
  })
  handle('setCoordinator', (agentId: unknown) => {
    if (typeof agentId !== 'string') throw new Error(tr('Agente no válido'))
    const cfg = setCoordinator(agentId)
    emit({ kind: 'config.updated', config: cfg })
    return cfg
  })
  handle('setupFinish', () => {
    finishSetup()
    emit({ kind: 'config.updated', config: getConfig() })
  })
  ipcMain.handle('cowork:openExternal', async (_e, url: unknown) => {
    if (typeof url !== 'string' || !/^https:\/\/[\w.-]+(\/\S*)?$/.test(url)) throw new Error(tr('Enlace no válido'))
    await shell.openExternal(url)
  })
  // ---- Actualizaciones desde GitHub (también desde el móvil, por el acceso web) ----
  handle('checkForUpdates', () => checkForUpdates())
  // ---- Reiniciar (por si se queda pillada; también desde el navegador) ----
  handle('restartApp', () => {
    setTimeout(() => {
      app.relaunch()
      // Cierre ordenado (se guardan los proyectos); si algo lo impide, se fuerza a los 8 s.
      app.quit()
      setTimeout(() => app.exit(0), 8000).unref()
    }, 400)
  })
  // ---- Dictado (también desde el móvil: el audio se sube al equipo y se transcribe aquí) ----
  handle('transcribeAudio', (path: unknown, language?: unknown) => transcribeAudio(path, language))
  ipcMain.handle('cowork:requestMicrophone', async () => {
    if (process.platform !== 'darwin') return true
    if (systemPreferences.getMediaAccessStatus('microphone') === 'granted') return true
    return systemPreferences.askForMediaAccess('microphone')
  })
  handle('applyUpdate', (setAside?: unknown) => applyUpdate(setAside === true))
  // Qué equipo es este (el cliente de escritorio lo muestra: su interfaz es la de este servidor).
  handle('getHostInfo', () => ({ name: hostname().replace(/\.local$/i, ''), platform: process.platform }))
  ipcMain.handle('cowork:getWebAccess', () => currentWebAccess())
  // Solo en el Mac: código corto para emparejar la app del móvil.
  ipcMain.handle('cowork:mobilePairingPin', () => mobilePairingPin())
  ipcMain.handle('cowork:getAccessLog', (_e, limit: unknown) => accessLog().read(typeof limit === 'number' && limit > 0 ? Math.min(limit, 500) : 100))
  // Dispositivos emparejados: solo se ven y se gestionan desde este equipo (nunca por la API remota).
  ipcMain.handle('cowork:listDevices', () => devices().list())
  ipcMain.handle('cowork:revokeDevice', (_e, id: unknown) => {
    if (typeof id !== 'string') throw new Error(tr('Dispositivo no válido'))
    if (!revokeMobileDevice(id) && !devices().revoke(id)) throw new Error(tr('Ese dispositivo ya no está en la lista'))
  })
  ipcMain.handle('cowork:forgetDevice', (_e, id: unknown) => {
    if (typeof id !== 'string') throw new Error(tr('Dispositivo no válido'))
    revokeMobileDevice(id)
    devices().revoke(id)
    devices().forget(id)
  })
  // Desde el navegador por http:// (sin micrófono): enlace a la versión HTTPS. La de Tailscale Serve si está
  // activa (certificado válido); si no, la propia de AI Cowork en el puerto siguiente (avisa la primera vez).
  handle('getHttpsLink', async (host?: unknown) => {
    const w = getConfig().webAccess
    if (!w.enabled) return null
    const t = `/?t=${encodeURIComponent(w.token)}`
    const info = await httpsInfo(w.port).catch(() => null)
    if (info?.active && info.url) return { url: `${info.url}${t}`, selfSigned: false }
    const port = webHttpsPort()
    // La misma dirección con la que entró el navegador (IP o nombre), o la IP de Tailscale.
    const h = typeof host === 'string' && /^[a-z0-9.-]{1,253}$/i.test(host) ? host : tailscaleIPv4()
    return port && h ? { url: `https://${h}:${port}${t}`, selfSigned: true } : null
  })
  ipcMain.handle('cowork:setWebAccess', async (_e, input: SetWebAccessInput) => {
    if (!input || typeof input !== 'object') throw new Error(tr('Datos no válidos'))
    if (typeof input.openAtLogin === 'boolean') setOpenAtLogin(input.openAtLogin)
    if (typeof input.restrictClients === 'boolean') {
      setRestrictClients(input.restrictClients)
      return currentWebAccess()
    }
    if (typeof input.https === 'boolean') {
      const port = getConfig().webAccess.port
      return currentWebAccess(input.https ? await enableHttps(port) : await disableHttps(port))
    }
    if (typeof input.enabled === 'boolean' || input.regenerateToken) {
      setWebAccessConfig(typeof input.enabled === 'boolean' ? input.enabled : undefined, input.regenerateToken === true, newWebToken)
      // Un código nuevo anula todos los tokens: que la lista no los siga mostrando como vigentes.
      if (input.regenerateToken === true) for (const d of devices().list()) devices().revoke(d.id)
      try {
        return await applyWebAccess()
      } catch (e) {
        // Puerto ocupado u otro fallo: se deja apagado y se explica.
        setWebAccessConfig(false, false, newWebToken)
        await applyWebAccess()
        throw new Error(tr('No se pudo abrir el acceso web: {message}', { message: (e as Error).message }))
      }
    }
    return currentWebAccess()
  })
  ipcMain.handle('cowork:savePastedFile', (_e, name: unknown, data: unknown) => savePastedFile(name, data))

  // ---- Modelos por dificultad ----
  handle('listModelOptions', (agentId: unknown) => {
    const a = getConfig().agents.find((x) => x.id === agentId)
    return a ? modelOptions(a) : []
  })
  handle('setAgentModels', (input: SetAgentModelsInput) => {
    if (!input || typeof input !== 'object') throw new Error(tr('Datos no válidos'))
    setAgentModels(input)
    emit({ kind: 'config.updated', config: getConfig() })
  })

  // ---- Carpeta de trabajo del proyecto (acceso concedido por el usuario) ----
  ipcMain.handle('cowork:pickProjectFolder', async (e, projectId: unknown) => {
    if (!store.isValidProjectId(projectId)) throw new Error(tr('Proyecto no válido'))
    const win = BrowserWindow.fromWebContents(e.sender) ?? mainWindow
    const opts: OpenDialogOptions = {
      title: tr('Carpeta en la que trabajarán los agentes'),
      buttonLabel: tr('Dar acceso a esta carpeta'),
      properties: ['openDirectory'],
      defaultPath: store.getProject(projectId).project.workDir
    }
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (r.canceled || !r.filePaths[0]) return null
    return store.setWorkDir(projectId, r.filePaths[0])
  })
  // Desde un cliente o el navegador: la carpeta se elige en el explorador del servidor y llega aquí.
  handle('setProjectFolder', (projectId: unknown, dir: unknown) => {
    if (!store.isValidProjectId(projectId)) throw new Error(tr('Proyecto no válido'))
    const abs = normalizePath(dir)
    if (!abs) throw new Error(tr('Ruta no válida'))
    if (getConfig().webAccess.restrictClients && !withinAny(abs, projectFolders())) {
      throw new Error(tr('Este servidor limita a los clientes a las carpetas de los proyectos'))
    }
    const summary = store.setWorkDir(projectId, abs)
    accessLog().append({ device: 'Interfaz remota o local', action: 'folder', path: abs, note: tr('carpeta de trabajo del proyecto {name}', { name: summary.name }) })
    return summary
  })
  handle('clearProjectFolder', (projectId: unknown) => {
    if (!store.isValidProjectId(projectId)) throw new Error(tr('Proyecto no válido'))
    return store.setWorkDir(projectId, null)
  })
}

async function boot(): Promise<void> {
  // Una instalación nueva pregunta si este equipo es el servidor o se conecta con otro AI Cowork.
  let mode = savedMode()?.mode
  if (!mode) mode = await chooseMode()
  if (mode === 'client') {
    await bootClient()
    return
  }
  // Antes de buscar los CLIs: el PATH actual del sistema (en macOS, el de la terminal del usuario).
  await refreshPath()
  const cfg = loadConfig()
  store.initProjects(cfg.workspaceRoot)
  store.ensureFirstProject()
  initQuota(cfg.workspaceRoot, getConfig, allAgents)
  initUsageLog(cfg.workspaceRoot)
  initAgentSessions(cfg.workspaceRoot)
  initInbox(cfg.workspaceRoot)
  initSkills(cfg.workspaceRoot)
  void startCoworkMcp(cfg.workspaceRoot)
  // El botón «Abrir Compartir pantalla» de los avisos de permisos: solo tiene sentido con el servidor en un Mac.
  if (process.platform === 'darwin') setScreenShareUrl(() => {
    const ip = tailscaleIPv4()
    return ip ? `vnc://${ip}` : null
  })
  initTaskTraces(cfg.workspaceRoot)
  // Ventanas de permisos de macOS que la app o sus agentes dejan pendientes en la pantalla del Mac (para avisar al móvil).
  // Cada ventana de permisos de macOS pendiente en la pantalla del servidor sale en «Te necesita» (y en el móvil).
  onMacPermissionPrompt((p) => notifyMacPermission(p))
  startMacPermissionWatch()
  registerProtocol()
  // Las claves de API de los agentes conectados salen de este equipo (cifradas) y solo van al suyo.
  setAgentKeyResolver(agentKey)
  // Instalador del cliente de escritorio que este servidor ofrece a sus clientes (se publica con npm run publicar-cliente).
  setClientReleaseDir(join(app.getPath('userData'), 'client-release'))
  setFsAccess({
    // Por defecto los clientes ven todo el disco (eres tú desde otro sitio); con el interruptor, solo los proyectos.
    allowedRoots: () => (getConfig().webAccess.restrictClients ? projectFolders() : null),
    // Lo que nunca se comparte: las llaves y la configuración con el código de acceso de la propia app.
    protectedPaths: () => {
      const data = app.getPath('userData')
      const ws = getConfig().workspaceRoot
      return [
        join(data, 'mobile-key'),
        join(data, 'devices.json'),
        join(data, 'client.json'),
        join(data, 'access-log.jsonl'),
        join(data, 'access-log.jsonl.1'),
        join(ws, 'config.json'),
        join(ws, 'web-cert')
      ]
    },
    projects: () => store.listProjects().map((p) => ({ name: p.name, dir: p.workDir || p.dir })),
    log: (entry) => accessLog().append(entry),
    trash: (path) => shell.trashItem(path)
  })
  identifyToYouTube()
  allowOwnAudioForLights()
  registerIpc()
  // Lo que el coordinador sabe de este equipo: dónde está el código de AI Cowork y las direcciones del acceso web.
  setGuideEnv({
    codeDir: sourceDir(),
    webUrls: () => {
      const w = getConfig().webAccess
      if (!w.enabled) return []
      const info = webAccessInfo(true, w.port, w.token)
      return [...info.urls, ...(info.secureUrl ? [tr('{secureUrl} (con micrófono)', { secureUrl: info.secureUrl })] : [])]
    }
  })
  initOrchestrator()
  // Rutinas: lanzan peticiones solas (a su hora, por webhook o al cambiar archivos) como si las escribieras tú.
  initRoutines({
    send: (input, routine) => sendMessage(input, { routine }),
    runState,
    projectBusy: (projectId) => activeRunsFor(projectId).length > 0,
    webBases: () => {
      const w = getConfig().webAccess
      if (!w.enabled) return []
      const info = webAccessInfo(true, w.port, w.token)
      return [...info.urls, ...(info.secureUrl ? [info.secureUrl] : [])]
    }
  })

  mainWindow = createWindow()
  setEventWindow(mainWindow)
  closeClientWindow()
  initUpdater()
  if (getConfig().webAccess.enabled) applyWebAccess().catch((e) => console.error('[cowork] acceso web', e))
  // Quotas: initial (Codex's rollout files, then asking Claude and Codex directly) + timers.
  void refreshQuotas({ codex: true }).then(() => refreshQuotas({ probe: true }))
  startQuotaTimer()
  // Re-send the latest state once the renderer has loaded (events before that are lost).
  mainWindow.webContents.on('did-finish-load', () => void refreshQuotas())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
      setEventWindow(mainWindow)
    }
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  // Como cliente no se arrancó el motor: no hay nada que parar ni guardar.
  if (savedMode()?.mode === 'client') return
  // Antes de detener las peticiones: así las de las rutinas quedan como interrumpidas, no como fallidas.
  stopRoutines()
  stopCoworkMcp()
  try {
    cancelAll()
  } catch (e) {
    console.error(e)
  }
  stopQuota()
  stopMacPermissionWatch()
  void stopWebServer()
  store.flushAll()
  flushUsageLog()
  flushInbox()
  flushTaskTraces()
})
