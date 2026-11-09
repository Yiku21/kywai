import { useEffect, useMemo, useRef, useState } from 'react'
import type { ModInfo } from '@shared/extensions'
import { useCowork, useData } from '@/store/cowork'
import { api, isWeb } from '@/lib/api'
import { t } from '@/lib/i18n'
import { cx, errorText } from '../common/util'
import u from '../common/ui.module.css'
import s from './ModsView.module.css'

/** Aviso para que la barra de pestañas y esta vista vuelvan a leer los mods (al instalar, quitar o encender uno). */
export const MODS_CHANGED = 'kywai:mods-changed'

/** Los paneles de los mods encendidos. */
export function modPanels(mods: ModInfo[]): Array<{ mod: ModInfo; id: string; title: string }> {
  return mods.filter((m) => m.enabled).flatMap((m) => m.panels.map((p) => ({ mod: m, id: p.id, title: p.title })))
}

/** Los mods instalados, al día (vacío si no hay motor). */
export function useMods(): ModInfo[] {
  const live = useCowork((st) => st.mode === 'live') && !!api
  const [mods, setMods] = useState<ModInfo[]>([])
  useEffect(() => {
    if (!live) return
    const load = (): void => void api!.listMods().then((m) => setMods(Array.isArray(m) ? m : []), () => undefined)
    load()
    window.addEventListener(MODS_CHANGED, load)
    return () => window.removeEventListener(MODS_CHANGED, load)
  }, [live])
  return mods
}

/**
 * Pestaña «Mods» del panel izquierdo: los paneles de los mods, cada uno en una caja aislada (iframe sin acceso a la
 * app). Por mensajes, un panel puede pedir el contexto del proyecto y, con el permiso «chat», proponer un mensaje
 * que tú confirmas.
 */
export function ModsView() {
  const mods = useMods()
  const panels = useMemo(() => modPanels(mods), [mods])
  const [pick, setPick] = useState(0)
  const [doc, setDoc] = useState<{ title: string; chat: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const project = useData((d) => d.project)
  const tasks = useData((d) => d.tasks)
  const messages = useData((d) => d.messages)
  const current = panels[Math.min(pick, panels.length - 1)]

  useEffect(() => {
    if (!current) return
    setError(null)
    // Se pide antes para saber si existe y sus permisos; la página la sirve kywai con su propia política de seguridad.
    api!.modPanel(current.mod.name, current.id).then((p) => setDoc({ title: p.title, chat: p.chat }), (e) => {
      setDoc(null)
      setError(errorText(e))
    })
  }, [current?.mod.name, current?.id])

  // Lo que puede leer un panel: el proyecto, sus tareas y los últimos mensajes (solo texto).
  const context = useMemo(
    () => ({
      kywai: 'context',
      project: project ? { name: project.name } : null,
      tasks: Object.values(tasks)
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
        .slice(0, 30)
        .map((x) => ({ title: x.title, status: x.status, agent: x.agentId, result: (x.result ?? '').slice(0, 500) })),
      messages: messages.slice(-15).map((m) => ({ author: m.author.type, text: (m.text ?? '').slice(0, 1000) }))
    }),
    [project, tasks, messages]
  )

  useEffect(() => {
    frame.current?.contentWindow?.postMessage(context, '*')
  }, [context])

  useEffect(() => {
    const onMsg = (e: MessageEvent): void => {
      if (!frame.current || e.source !== frame.current.contentWindow) return
      const d = e.data as { kywai?: string; text?: unknown }
      if (d?.kywai === 'context') frame.current.contentWindow?.postMessage(context, '*')
      if (d?.kywai === 'send' && typeof d.text === 'string' && d.text.trim() && project) {
        if (!doc?.chat) return
        const text = d.text.trim().slice(0, 8000)
        if (window.confirm(t('El panel «{panel}» quiere enviar al chat:\n\n{text}', { panel: current?.title ?? '', text }))) {
          void api!.sendMessage({ projectId: project.id, text, filePaths: [] }).catch((err) => setError(errorText(err)))
        }
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [context, doc, project, current])

  if (!panels.length) return <p className={s.empty}>{t('Ningún mod encendido tiene paneles. Instálalos en ⚙ → Ajustes → Extensiones → Mods.')}</p>

  return (
    <div className={s.wrap}>
      {panels.length > 1 && (
        <div className={s.picker} role="tablist" aria-label={t('Paneles de los mods')}>
          {panels.map((p, i) => (
            <button key={`${p.mod.name}/${p.id}`} type="button" role="tab" aria-selected={p === current} className={cx(u.btn, u.btnSm, p === current && s.on)} onClick={() => setPick(i)}>
              {p.title}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
      {doc && current && (
        <iframe
          ref={frame}
          key={`${current.mod.name}/${current.id}`}
          className={s.frame}
          title={doc.title}
          // Sin allow-same-origin: no ve la app, ni sus datos, ni su almacenamiento (y la respuesta trae su «sandbox»).
          sandbox="allow-scripts allow-forms"
          src={`${isWeb ? '/api/mod-panel' : 'cowork://mod'}/${encodeURIComponent(current.mod.name)}/${encodeURIComponent(current.id)}`}
          onLoad={() => frame.current?.contentWindow?.postMessage(context, '*')}
        />
      )}
      {current && <p className={s.foot}>{t('Panel del mod «{mod}». Funciona en una caja aislada: no puede tocar el resto de kywai.', { mod: current.mod.title })}</p>}
    </div>
  )
}
