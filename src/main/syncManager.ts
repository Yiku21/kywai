// Las parejas de carpetas que sincroniza este cliente: cuáles son, cuándo se mira cada una (cada 30 s y poco después
// de que cambie algo aquí) y qué pasó. Guarda su lista y la «base» de cada una en la carpeta de datos de la app.
import { mkdirSync, readFileSync, renameSync, rmSync, watch, writeFileSync, type FSWatcher } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { DEFAULT_EXCLUDES, type BaseState, type SyncNotice, type SyncPairConfig, type SyncPairStatus, type SyncPhase } from '@shared/sync'
import { localIO, syncOnce } from './syncEngine'
import { connectRemote, type ServerAccess } from './syncRemote'

export interface SyncManagerOptions {
  /** Archivo con la lista de parejas. */
  file: string
  /** Carpeta donde se guarda la base de cada pareja. */
  stateDir: string
  getServer: () => ServerAccess | null
  /** Nombre de este equipo (va en las copias de conflicto). */
  device: string
  trash: (abs: string) => Promise<void>
  /** Aviso al usuario (notificación del sistema). */
  notify: (title: string, body: string) => void
}

interface Entry {
  cfg: SyncPairConfig
  base: BaseState
  phase: SyncPhase
  lastSyncAt?: number
  activity?: string
  problem?: string
  notices: SyncNotice[]
  running: boolean
  confirm: boolean
  watcher?: FSWatcher
  debounce?: NodeJS.Timeout
  quietUntil: number
}

const INTERVAL_MS = 30_000
const WATCH_DEBOUNCE_MS = 4_000
const MAX_NOTICES = 30

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return null
  }
}

function writeJson(file: string, data: unknown): void {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  renameSync(tmp, file)
}

export class SyncManager {
  private readonly pairs = new Map<string, Entry>()
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly o: SyncManagerOptions) {
    const saved = readJson<{ pairs?: SyncPairConfig[] }>(o.file)
    for (const cfg of saved?.pairs ?? []) {
      if (!cfg || typeof cfg.id !== 'string' || typeof cfg.localDir !== 'string' || typeof cfg.remoteDir !== 'string') continue
      const state = readJson<{ base?: BaseState; notices?: SyncNotice[]; lastSyncAt?: number }>(this.stateFile(cfg.id))
      this.pairs.set(cfg.id, {
        cfg: { ...cfg, exclude: Array.isArray(cfg.exclude) ? cfg.exclude : [...DEFAULT_EXCLUDES], enabled: cfg.enabled !== false },
        base: state?.base && typeof state.base === 'object' ? { files: state.base.files ?? {}, dirs: state.base.dirs ?? [] } : { files: {}, dirs: [] },
        phase: cfg.enabled === false ? 'disabled' : 'idle',
        ...(state?.lastSyncAt ? { lastSyncAt: state.lastSyncAt } : {}),
        notices: Array.isArray(state?.notices) ? state!.notices!.slice(-MAX_NOTICES) : [],
        running: false,
        confirm: false,
        quietUntil: 0
      })
    }
  }

  private stateFile(id: string): string {
    return join(this.o.stateDir, `${id}.json`)
  }

  private saveList(): void {
    writeJson(this.o.file, { pairs: [...this.pairs.values()].map((e) => e.cfg) })
  }

  private saveState(e: Entry): void {
    writeJson(this.stateFile(e.cfg.id), { base: e.base, notices: e.notices, lastSyncAt: e.lastSyncAt })
  }

  private note(e: Entry, n: Omit<SyncNotice, 't'>): void {
    e.notices.push({ t: Date.now(), ...n })
    if (e.notices.length > MAX_NOTICES) e.notices.splice(0, e.notices.length - MAX_NOTICES)
    if (n.kind !== 'error') this.o.notify(`Sincronización · ${e.cfg.name}`, n.message)
  }

  list(): SyncPairStatus[] {
    return [...this.pairs.values()].map((e) => ({
      ...e.cfg,
      phase: e.cfg.enabled ? e.phase : 'disabled',
      ...(e.lastSyncAt ? { lastSyncAt: e.lastSyncAt } : {}),
      ...(e.activity ? { activity: e.activity } : {}),
      ...(e.problem ? { problem: e.problem } : {}),
      files: Object.keys(e.base.files).length,
      notices: [...e.notices].reverse().slice(0, 10)
    }))
  }

  add(input: { name?: string; localDir: string; remoteDir: string; exclude?: string[] }): SyncPairStatus {
    if ([...this.pairs.values()].some((e) => e.cfg.localDir === input.localDir && e.cfg.remoteDir === input.remoteDir)) {
      throw new Error('Esa pareja de carpetas ya se está sincronizando')
    }
    const cfg: SyncPairConfig = {
      id: randomUUID(),
      name: (input.name || input.remoteDir.split(/[\\/]/).filter(Boolean).pop() || 'Carpeta').slice(0, 80),
      localDir: input.localDir,
      remoteDir: input.remoteDir,
      enabled: true,
      exclude: input.exclude ?? [...DEFAULT_EXCLUDES]
    }
    const e: Entry = { cfg, base: { files: {}, dirs: [] }, phase: 'idle', notices: [], running: false, confirm: false, quietUntil: 0 }
    this.pairs.set(cfg.id, e)
    this.saveList()
    this.watch(e)
    void this.run(cfg.id)
    return this.list().find((p) => p.id === cfg.id)!
  }

  remove(id: string): void {
    const e = this.pairs.get(id)
    if (!e) return
    e.watcher?.close()
    this.pairs.delete(id)
    this.saveList()
    rmSync(this.stateFile(id), { force: true })
  }

  setEnabled(id: string, enabled: boolean): void {
    const e = this.pairs.get(id)
    if (!e) return
    e.cfg.enabled = enabled
    e.phase = enabled ? 'idle' : 'disabled'
    e.problem = undefined
    this.saveList()
    if (enabled) {
      this.watch(e)
      void this.run(id)
    } else {
      e.watcher?.close()
      e.watcher = undefined
    }
  }

  /** El usuario confirma que se borren muchos archivos de golpe (la ronda que se paró por eso). */
  confirmDeletes(id: string): void {
    const e = this.pairs.get(id)
    if (!e) return
    e.confirm = true
    void this.run(id)
  }

  syncNow(id: string): void {
    void this.run(id)
  }

  start(): void {
    if (this.timer) return
    for (const e of this.pairs.values()) if (e.cfg.enabled) this.watch(e)
    this.timer = setInterval(() => {
      for (const id of this.pairs.keys()) void this.run(id)
    }, INTERVAL_MS)
    this.timer.unref()
    for (const id of this.pairs.keys()) void this.run(id)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    for (const e of this.pairs.values()) {
      e.watcher?.close()
      e.watcher = undefined
    }
  }

  private watch(e: Entry): void {
    if (e.watcher || !e.cfg.enabled) return
    try {
      e.watcher = watch(e.cfg.localDir, { recursive: true }, () => {
        // Lo que cambia la propia sincronización no cuenta.
        if (Date.now() < e.quietUntil) return
        clearTimeout(e.debounce)
        e.debounce = setTimeout(() => void this.run(e.cfg.id), WATCH_DEBOUNCE_MS)
      })
      e.watcher.on('error', () => {
        e.watcher?.close()
        e.watcher = undefined
      })
    } catch {
      /* sin vigilancia (p. ej. Linux sin recursivo): queda la ronda periódica */
    }
  }

  private async run(id: string): Promise<void> {
    const e = this.pairs.get(id)
    if (!e || !e.cfg.enabled || e.running) return
    const server = this.o.getServer()
    if (!server) {
      e.phase = 'error'
      e.problem = 'Sin conexión con el servidor'
      return
    }
    e.running = true
    e.phase = 'syncing'
    e.problem = undefined
    const confirm = e.confirm
    e.confirm = false
    try {
      const remote = await connectRemote(server)
      const res = await syncOnce(e.cfg, e.base, { local: localIO(this.o.trash), remote }, {
        device: this.o.device,
        now: () => new Date(),
        activity: (m) => {
          e.activity = m
        },
        notice: (n) => this.note(e, n),
        confirmDeletes: confirm
      })
      if (res.paused) {
        e.phase = 'paused'
        e.problem = res.paused
        if (!e.notices.some((n) => n.kind === 'paused' && n.message === res.paused)) this.note(e, { kind: 'paused', message: res.paused })
      } else {
        e.phase = 'idle'
        e.lastSyncAt = Date.now()
        if (res.errors.length) {
          e.problem = `${res.errors.length} ${res.errors.length === 1 ? 'archivo no se pudo' : 'archivos no se pudieron'} sincronizar: ${res.errors[0]}`
        }
      }
      this.saveState(e)
    } catch (err) {
      e.phase = 'error'
      const msg = (err as Error).message
      e.problem = /ENOENT/.test(msg) ? `No se encuentra la carpeta de este equipo: ${e.cfg.localDir}` : msg
    } finally {
      e.running = false
      e.activity = undefined
      e.quietUntil = Date.now() + 3000
    }
  }
}
