import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { ArrowUp, Download, File as FileIcon, Folder, FolderOpen, HardDrive, Home, LoaderCircle, X } from 'lucide-react'
import { clientBridge, isClient } from '@/lib/api'
import { childPath, closeFilesRequest, crumbs, currentFilesRequest, subscribeFilesRequest } from '@/lib/serverFiles'
import { fileSize, relativeTime } from '@/lib/format'
import { cx, errorText } from '../common/util'
import u from '../common/ui.module.css'
import s from './ServerFiles.module.css'
import { t } from '@/lib/i18n'

interface Entry {
  name: string
  kind: 'dir' | 'file'
  size: number
  mtime: number
  link?: boolean
}
interface Listing {
  path: string
  parent: string | null
  entries: Entry[]
  truncated: boolean
}
interface Root {
  name: string
  path: string
  kind: 'home' | 'drive' | 'root' | 'project'
}
interface Roots {
  roots: Root[]
  restricted: boolean
  platform: string
  sep: string
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' })
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)
  return data as T
}

const q = (p: string): string => encodeURIComponent(p)

/** Abre un archivo del servidor: con la aplicación de este equipo en el cliente; en el navegador, en otra pestaña. */
async function openRemote(path: string): Promise<void> {
  if (clientBridge()?.openRemotePath) return clientBridge()!.openRemotePath!(path)
  // Un cliente anterior no sabe abrir archivos del servidor y su navegador externo no tendría la llave.
  if (isClient) throw new Error(t('Esta versión del cliente no puede abrir archivos: instala la nueva con ⚙ → Ajustes → «Actualizar este equipo…». Mientras, usa el botón de descargar.'))
  window.open(`/api/fs/read?path=${q(path)}`, '_blank', 'noopener')
}

/** Baja un archivo o una carpeta (como zip). */
async function downloadRemote(path: string, kind: 'file' | 'dir'): Promise<void> {
  if (kind === 'dir' && clientBridge()?.saveRemoteFolder) return void (await clientBridge()!.saveRemoteFolder!(path))
  const a = document.createElement('a')
  a.href = kind === 'dir' ? `/api/fs/zip?path=${q(path)}` : `/api/fs/read?path=${q(path)}&download=1`
  a.download = ''
  document.body.append(a)
  a.click()
  a.remove()
}

/**
 * Explorador de los archivos del servidor. En modo «browse» sirve para mirar, abrir y bajar (carpetas como zip); en
 * modo «pick» devuelve la carpeta que se elija (la de trabajo de un proyecto).
 */
export function ServerFiles() {
  const request = useSyncExternalStore(subscribeFilesRequest, currentFilesRequest, currentFilesRequest)
  const [roots, setRoots] = useState<Roots | null>(null)
  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const pick = request?.mode === 'pick'

  const go = useCallback(async (path: string): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      setListing(await getJson<Listing>(`/api/fs/list?path=${q(path)}`))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  // Al abrir: las raíces y, si hay una, la primera carpeta (la del usuario o la del proyecto).
  useEffect(() => {
    if (!request) return
    let alive = true
    setListing(null)
    setError(null)
    getJson<Roots>('/api/fs/roots').then(
      (r) => {
        if (!alive) return
        setRoots(r)
        const first = r.roots.find((x) => x.kind === 'project') ?? r.roots.find((x) => x.kind === 'home') ?? r.roots[0]
        if (first) void go(first.path)
      },
      (e) => alive && setError(errorText(e))
    )
    return () => {
      alive = false
    }
  }, [request, go])

  useEffect(() => {
    if (!request) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !e.defaultPrevented) closeFilesRequest(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [request])

  if (!request) return null
  const sep = roots?.sep ?? '/'

  async function act(key: string, fn: () => Promise<void>): Promise<void> {
    setBusy(key)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={s.backdrop} role="dialog" aria-modal="true" aria-labelledby="serverfiles-title" onMouseDown={(e) => e.target === e.currentTarget && closeFilesRequest(null)}>
      <div className={s.dialog}>
        <header className={s.head}>
          <FolderOpen size={20} aria-hidden="true" className={s.headIcon} />
          <div className={s.headText}>
            <h2 id="serverfiles-title" className={s.title}>
              {pick ? t('Elegir la carpeta de trabajo') : t('Archivos del servidor')}
            </h2>
            <p className={s.subtitle}>
              {pick
                ? t('Elige la carpeta del servidor en la que trabajarán los agentes de este proyecto.')
                : isClient
                  ? t('Los archivos del equipo servidor. Al abrir uno se descarga a una carpeta temporal y se abre con tu aplicación.')
                  : t('Los archivos del equipo servidor.')}
              {roots?.restricted ? t(' El servidor limita el acceso a las carpetas de los proyectos.') : ''}
            </p>
          </div>
          <button type="button" className={cx(u.iconBtn, s.close)} aria-label={t('Cerrar')} onClick={() => closeFilesRequest(null)}>
            <X size={18} />
          </button>
        </header>

        {roots && roots.roots.length > 1 && (
          <div className={s.roots} role="group" aria-label={t('Lugares')}>
            {roots.roots.map((r) => {
              const Icon = r.kind === 'home' ? Home : r.kind === 'project' ? Folder : HardDrive
              return (
                <button key={r.path} type="button" className={cx(s.chip, listing?.path === r.path && s.chipOn)} onClick={() => void go(r.path)} title={r.path}>
                  <Icon size={13} aria-hidden="true" />
                  {r.name}
                </button>
              )
            })}
          </div>
        )}

        <div className={s.crumbs} aria-label={t('Ruta')}>
          <button type="button" className={s.up} disabled={!listing?.parent || loading} onClick={() => listing?.parent && void go(listing.parent)} aria-label={t('Subir una carpeta')} title={t('Subir una carpeta')}>
            <ArrowUp size={15} aria-hidden="true" />
          </button>
          {listing &&
            crumbs(listing.path, sep).map((c, i, all) => (
              <span key={c.path} className={s.crumbWrap}>
                <button type="button" className={cx(s.crumb, i === all.length - 1 && s.crumbLast)} onClick={() => void go(c.path)}>
                  {c.name}
                </button>
                {i < all.length - 1 && <span aria-hidden="true">›</span>}
              </span>
            ))}
        </div>

        <div className={s.list} aria-busy={loading}>
          {loading && !listing ? (
            <p className={s.empty}>
              <LoaderCircle size={14} className={u.spin} aria-hidden="true" /> {t('Cargando…')}
            </p>
          ) : listing && listing.entries.length === 0 ? (
            <p className={s.empty}>{t('Esta carpeta está vacía.')}</p>
          ) : (
            listing?.entries.map((e) => {
              const full = childPath(listing.path, e.name, sep)
              const dir = e.kind === 'dir'
              const key = `${e.kind}:${e.name}`
              return (
                <div key={key} className={s.item}>
                  <button
                    type="button"
                    className={s.itemMain}
                    disabled={pick && !dir}
                    onClick={() => (dir ? void go(full) : void act(key, () => openRemote(full)))}
                    title={dir ? t('Abrir la carpeta') : pick ? t('Elige una carpeta') : t('Abrir con tu aplicación')}
                  >
                    {dir ? <Folder size={16} aria-hidden="true" className={s.dirIcon} /> : <FileIcon size={16} aria-hidden="true" className={s.fileIcon} />}
                    <span className={s.name}>{e.name}</span>
                    <span className={s.meta}>{dir ? '' : fileSize(e.size)}</span>
                    <span className={s.meta}>{relativeTime(e.mtime)}</span>
                  </button>
                  {!pick && (
                    <button
                      type="button"
                      className={cx(u.iconBtn, s.dl)}
                      aria-label={dir ? t('Descargar {name} como zip', { name: e.name }) : t('Descargar {name}', { name: e.name })}
                      title={dir ? t('Descargar como zip') : t('Descargar')}
                      disabled={busy === `dl:${key}`}
                      onClick={() => void act(`dl:${key}`, () => downloadRemote(full, dir ? 'dir' : 'file'))}
                    >
                      {busy === `dl:${key}` ? <LoaderCircle size={15} className={u.spin} /> : <Download size={15} />}
                    </button>
                  )}
                </div>
              )
            })
          )}
          {listing?.truncated && <p className={s.empty}>{t('Hay más elementos de los que se enseñan aquí.')}</p>}
        </div>

        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}

        <footer className={s.foot}>
          <span className={s.path} title={listing?.path}>
            {listing?.path ?? ''}
          </span>
          {pick ? (
            <button type="button" className={cx(u.btn, u.btnPrimary)} disabled={!listing || loading} onClick={() => closeFilesRequest(listing?.path ?? null)}>
              {t('Usar esta carpeta')}
            </button>
          ) : (
            <button
              type="button"
              className={cx(u.btn)}
              disabled={!listing || loading || busy === 'zip'}
              onClick={() => listing && void act('zip', () => downloadRemote(listing.path, 'dir'))}
            >
              {busy === 'zip' ? <LoaderCircle size={14} className={u.spin} aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}
              {t('Descargar esta carpeta (.zip)')}
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
