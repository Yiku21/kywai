import { describe, expect, it } from 'vitest'
import { plaqueFace, plaqueTopFace } from './homePlaques'
import { lawnPositions, homeLandHeight } from './homeLand'

describe('fitted home plaques',()=>{
  it('inlays Hermes on the wooden annulus, clear of the opening and the overhang',()=>{
    const face=plaqueTopFace(1.45,.30,2.8,Math.atan2(2,-2.2)-.18)
    const p=face.getAttribute('position'),n=face.getAttribute('normal')
    for(let i=0;i<p.count;i++) {
      expect(Math.hypot(p.getX(i),p.getZ(i))).toBeGreaterThan(2.42)
      expect(Math.hypot(p.getX(i),p.getZ(i))).toBeLessThan(3.5)
      expect(n.getY(i)).toBeGreaterThan(.99)
      expect(p.getY(i)).toBe(0)
    }
    expect(Array.from(p.array).every(Number.isFinite)).toBe(true);face.dispose()
  })
  it('wraps the curved desks and keeps rectangular desk plates flat',()=>{
    const curved=plaqueFace(1.95,.33,{radiusX:1.75,radiusZ:1.08,offset:.095})
    curved.computeBoundingBox()
    expect(curved.boundingBox!.max.z-curved.boundingBox!.min.z).toBeGreaterThan(.12)
    const flat=plaqueFace(1.8,.205);flat.computeBoundingBox()
    expect(flat.boundingBox!.max.z).toBe(0);expect(flat.boundingBox!.min.z).toBe(0)
    curved.dispose();flat.dispose()
  })
})

describe('coastal lawn',()=>{
  it('keeps the grass rooted on finite terrain and clear of the room and entrance paving',()=>{
    const positions=lawnPositions(2048)
    expect(positions).toHaveLength(2048)
    expect(positions).toEqual(lawnPositions(2048))
    for(const p of positions) {
      expect(Math.hypot(p.x,p.z+1)).toBeGreaterThanOrEqual(17.65)
      expect(p.z<=17.5||Math.abs(p.x)>=3.63).toBe(true)
      expect(Number.isFinite(homeLandHeight(p.x,p.z))).toBe(true)
      expect(p.height).toBeGreaterThan(.1)
    }
  })
})
