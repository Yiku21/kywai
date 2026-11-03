import { useEffect, useState } from 'react'
import { api, clientInfo, isClient, isWeb } from '@/lib/api'

export type Role = 'server' | 'client' | 'browser'

export interface Where {
  role: Role
  /** Equipo donde corre el motor (el servidor). */
  host: string
  /** Este equipo, si es distinto (cliente de escritorio). */
  device?: string
}

export const ROLE_TITLE: Record<Role, string> = { server: 'Este equipo es el servidor', client: 'Cliente de escritorio', browser: 'Navegador' }

/** Qué significa estar ahí: dónde corren los agentes y se guardan los proyectos. */
export function explainWhere(w: Where): string {
  if (w.role === 'client') {
    return `Este equipo${w.device ? ` (${w.device})` : ''} está conectado a ${w.host || 'tu servidor'}: los agentes, los proyectos y los archivos están allí.`
  }
  if (w.role === 'browser') return `Estás en el navegador: los agentes, los proyectos y los archivos están en ${w.host || 'el servidor'}.`
  return `Aquí corren los agentes y se guardan los proyectos${w.host ? ` (${w.host})` : ''}.`
}

/**
 * Dónde estás: la app instalada que hace de servidor, el cliente de escritorio conectado a otro, o un navegador.
 * En el cliente, además, tiñe una franja fina en lo alto de la ventana (data-role en la raíz) para no confundir un
 * equipo con otro; el detalle va dentro del menú ⋮, no siempre a la vista.
 */
export function useWhere(): Where | null {
  const [where, setWhere] = useState<Where | null>(null)

  useEffect(() => {
    if (!api) return
    let alive = true
    const role: Role = !isWeb ? 'server' : isClient ? 'client' : 'browser'
    void Promise.all([api.getHostInfo().catch(() => null), role === 'client' ? clientInfo() : Promise.resolve(null)]).then(([host, client]) => {
      if (!alive) return
      setWhere({ role, host: host?.name || client?.server || '', ...(client?.device ? { device: client.device } : {}) })
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const el = document.documentElement
    if (where) el.dataset.role = where.role
    return () => {
      delete el.dataset.role
    }
  }, [where])

  return where
}
