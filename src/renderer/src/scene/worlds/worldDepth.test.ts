import { describe,expect,it } from 'vitest'
import { DEFAULT_STATIONS } from '@shared/defaults'
import { environmentModel } from './models'
import { crystalIslands } from './CrystalExpanse'

describe('surrounding worlds',()=>{
  it('keeps sanctuary architecture beyond the courtyard in depth, height and both side galleries',()=>{
    for(const detail of [false,true]){
      const parts=environmentModel('relicario',DEFAULT_STATIONS,detail)
      expect(parts.some(p=>p.at[2]<-45&&p.at[1]>12)).toBe(true)
      expect(parts.some(p=>p.at[0]<-20)).toBe(true)
      expect(parts.some(p=>p.at[0]>20)).toBe(true)
      expect(parts.some(p=>p.at[2]>10)).toBe(true)
    }
  })
  it('surrounds the workspace with crystal landforms while preserving the robot landing areas',()=>{
    expect(crystalIslands.some(i=>i.at[2]<-45)).toBe(true)
    expect(crystalIslands.some(i=>i.at[2]>10)).toBe(true)
    expect(crystalIslands.some(i=>i.at[1]>10)).toBe(true)
    for(const island of crystalIslands) for(const station of DEFAULT_STATIONS){
      const distance=Math.hypot(island.at[0]-station.position[0],island.at[2]-station.position[1])
      expect(distance).toBeGreaterThan(island.size*.8+2)
    }
  })
})
