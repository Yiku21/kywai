import { describe, expect, it } from 'vitest'
import { DEFAULT_STATIONS } from '@shared/defaults'
import { crystalConnections, threadGeometry, orbWebCurves } from './crystalThreads'

describe('crystalline thread network', () => {
  it('keeps the spatial orb web closed and finite at both scene and seat scale',()=>{
    for(const radius of [.4,1.75,24]) {
      const curves=orbWebCurves(radius,24,15,radius*.2)
      for(const curve of curves) for(let i=0;i<=32;i++) expect(curve.getPoint(i/32).toArray().every(Number.isFinite)).toBe(true)
      for(const ring of curves.slice(24)) expect(ring.getPoint(0).distanceTo(ring.getPoint(1))).toBeLessThan(1e-6)
      const geometry=threadGeometry(curves,2,.008,96)
      expect(Array.from(geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true)
      geometry.dispose()
    }
  })
  it('reaches every seat underside with empty, default and custom layouts', () => {
    for (const stations of [[], DEFAULT_STATIONS, [{ id:'custom', label:'Custom', position:[14,-12] as [number,number] }]]) {
      const curves=crystalConnections(stations)
      for(const st of stations) expect(curves.some(curve=>{
        const p=curve.getPoint(1)
        return Math.abs(p.x-st.position[0])<1e-6 && Math.abs(p.z-st.position[1])<1e-6 && p.y<0
      })).toBe(true)
      for(const strands of [1,6,9]) {
        const geometry=threadGeometry(curves,strands)
        const vertices=geometry.getAttribute('position')
        expect(vertices.count%2).toBe(0)
        expect(Array.from(vertices.array).every(Number.isFinite)).toBe(true)
        expect(geometry.getAttribute('progress').count).toBe(vertices.count)
        geometry.dispose()
      }
    }
  })
})
