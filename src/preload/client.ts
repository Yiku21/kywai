// Puente del modo cliente. Lo cargan tanto las páginas propias (elegir modo, conectar) como la interfaz del servidor;
// el motor solo hace caso a cada llamada desde la página que le corresponde.
import { contextBridge, ipcRenderer } from 'electron'

export interface ClientView {
  name: 'chooser' | 'connect' | 'offline' | 'opening'
  message?: string
  server?: { name: string; origin: string }
  address?: string
}

contextBridge.exposeInMainWorld('coworkClient', {
  /** Páginas propias. */
  view: (): Promise<ClientView | null> => ipcRenderer.invoke('client:view'),
  onView: (cb: (view: ClientView) => void): void => {
    ipcRenderer.on('client:view', (_e, view: ClientView) => cb(view))
  },
  chooseMode: (mode: 'server' | 'client'): Promise<void> => ipcRenderer.invoke('client:chooseMode', mode),
  pair: (address: string, code: string): Promise<{ error?: string }> => ipcRenderer.invoke('client:pair', address, code),
  retry: (): Promise<void> => ipcRenderer.invoke('client:retry'),
  switchServer: (): Promise<void> => ipcRenderer.invoke('client:switchServer'),
  /** Interfaz del servidor (menú ⋮). */
  reload: (): Promise<void> => ipcRenderer.invoke('client:reload'),
  forget: (): Promise<void> => ipcRenderer.invoke('client:forget'),
  openFile: (projectId: string, relPath: string): Promise<void> => ipcRenderer.invoke('client:openFile', projectId, relPath),
  info: (): Promise<{ client: true; server: string; device: string; version: string } | null> => ipcRenderer.invoke('client:info'),
  /** Sincronización de carpetas con el servidor. */
  syncList: (): Promise<unknown[]> => ipcRenderer.invoke('client:syncList'),
  syncAdd: (remoteDir: string): Promise<unknown> => ipcRenderer.invoke('client:syncAdd', remoteDir),
  syncRemove: (id: string): Promise<void> => ipcRenderer.invoke('client:syncRemove', id),
  syncToggle: (id: string, enabled: boolean): Promise<void> => ipcRenderer.invoke('client:syncToggle', id, enabled),
  syncNow: (id: string): Promise<void> => ipcRenderer.invoke('client:syncNow', id),
  syncConfirm: (id: string): Promise<void> => ipcRenderer.invoke('client:syncConfirm', id),
  /** Archivos del servidor: abrir uno con la aplicación de este equipo o bajar una carpeta como zip. */
  openRemotePath: (path: string): Promise<void> => ipcRenderer.invoke('client:openRemotePath', path),
  saveRemoteFolder: (path: string): Promise<string | null> => ipcRenderer.invoke('client:saveRemoteFolder', path),
  /** Busca una versión nueva del propio cliente en el servidor; installUpdate la descarga, la instala y reinicia. */
  update: (): Promise<unknown> => ipcRenderer.invoke('client:update'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('client:installUpdate')
})
