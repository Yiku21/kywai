import type { ReactNode } from 'react'
import { Check, FileText } from 'lucide-react'
import { useCowork, useData } from '@/store/cowork'
import { setAnchorElement } from './anchors'
import { usePackets } from './packetStore'
import { RobotLabel } from './RobotLabel'
import s from './labels.module.css'

function Anchored({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div className={s.anchor} ref={(el) => setAnchorElement(id, el)}>
      {children}
    </div>
  )
}

/** Capa HTML sobre el espacio 3D con las etiquetas de robots, transferencias y núcleo. */
export function SceneLabels() {
  const agents = useData((d) => d.agents)
  const order = useData((d) => d.agentOrder)
  const projectName = useData((d) => d.project?.name)
  const mode = useCowork((st) => st.mode)
  const select = useCowork((st) => st.select)
  const packets = usePackets((st) => st.list)

  return (
    <div className={s.layer}>
      {order.map((id) =>
        agents[id] ? (
          <Anchored key={`robot:${id}`} id={`robot:${id}`}>
            <RobotLabel agent={agents[id]} />
          </Anchored>
        ) : null
      )}
      {packets.map((p) => (
        <Anchored key={`transfer:${p.id}`} id={`transfer:${p.id}`}>
          <div
            className={[s.transfer, p.arrived && s.transferArrived, !p.shown && s.transferHidden].filter(Boolean).join(' ')}
            style={{ ['--agent' as string]: p.colorHex }}
            role="button"
            tabIndex={0}
            aria-label={`Transferencia: ${p.transfer.label}`}
            onClick={(ev) => {
              ev.stopPropagation()
              select({ type: 'transfer', id: p.transfer.id })
            }}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter') select({ type: 'transfer', id: p.transfer.id })
            }}
          >
            {p.arrived ? <Check size={12} aria-hidden="true" /> : <FileText size={12} aria-hidden="true" />}
            {p.transfer.label}
          </div>
        </Anchored>
      ))}
      <Anchored id="core">
        <div className={s.core}>
          Proyecto
          <span className={s.coreSub}>{mode === 'demo' ? 'Demo' : (projectName ?? '')}</span>
        </div>
      </Anchored>
    </div>
  )
}
