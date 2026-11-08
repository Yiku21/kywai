import { describe, expect, it } from 'vitest'
import { DEFAULT_AGENTS, DEFAULT_STATIONS } from '@shared/defaults'
import { HOME_SPOTS, homeLayout } from './homeLayout'
import { kywaiArchitecture } from './kywaiArchitecture'
import { homeIdentity } from '../homeIdentity'
import { curvedHomeTimber } from './homeJoinery'

describe('Kywai home', () => {
  const agents=Object.fromEntries(DEFAULT_AGENTS.map(a=>[a.id,a]))
  it('adapts the visual layout without changing saved positions, IDs or providers',()=>{
    const original=JSON.stringify({stations:DEFAULT_STATIONS,agents})
    const visual=homeLayout(DEFAULT_STATIONS,agents)
    expect(visual.map(s=>s.id)).toEqual(DEFAULT_STATIONS.map(s=>s.id))
    expect(visual.find(s=>s.id==='st-hermes')?.position).toEqual(HOME_SPOTS.hermes)
    expect(visual.find(s=>s.id==='st-claude')?.position).toEqual(HOME_SPOTS.claude)
    expect(JSON.stringify({stations:DEFAULT_STATIONS,agents})).toBe(original)
  })
  it('keeps unnamed and overflow stations distinct and accessible',()=>{
    const stations=Array.from({length:14},(_,i)=>({id:`custom-${i}`,label:'Custom',position:[i,i] as [number,number]}))
    const visual=homeLayout(stations,{})
    expect(new Set(visual.map(s=>s.position.join(','))).size).toBe(14)
    expect(visual.flatMap(s=>s.position).every(Number.isFinite)).toBe(true)
  })
  it('gives the nine companions distinct designs and preserves custom avatar choices',()=>{
    const avatar=DEFAULT_AGENTS[1].avatar!
    const designs=Object.keys(HOME_SPOTS).map(role=>homeIdentity(role,avatar))
    expect(new Set(designs.map(d=>[d.body,d.accessory,d.eyes,d.cloth].join(':'))).size).toBe(9)
    expect(new Set(designs.map(d=>d.body)).size).toBeGreaterThanOrEqual(6)
    const custom={...avatar,body:'cube' as const,accessory:'antenna' as const}
    expect(homeIdentity('Custom companion',custom)).toMatchObject({body:'cube',accessory:'antenna',eyes:avatar.eyes})
    expect(custom).toEqual({...avatar,body:'cube',accessory:'antenna'})
  })
  it('builds continuous roof beams with finite normals and grain coordinates',()=>{
    for(const args of [[.36,.34,Math.PI/2],[.075,.075,.88]] as const) {
      const g=curvedHomeTimber(...args)
      for(const key of ['position','normal','uv']) expect(Array.from(g.getAttribute(key).array).every(Number.isFinite)).toBe(true)
      g.computeBoundingBox()
      expect(g.boundingBox!.max.x).toBeGreaterThan(16)
      expect(g.boundingBox!.max.y).toBeGreaterThan(9)
      g.dispose()
    }
  })
  it('builds finite architecture at both quality levels within the material batch budget',()=>{
    const stations=homeLayout(DEFAULT_STATIONS,agents)
    for(const detail of [false,true]) {
      const pieces=kywaiArchitecture(stations,detail)
      expect(pieces.length).toBeGreaterThan(2000)
      for(const p of pieces) {
        expect(p.at.every(Number.isFinite)).toBe(true)
        expect(p.size.every(v=>Number.isFinite(v)&&v>0)).toBe(true)
        if(p.quaternion) expect(p.quaternion.toArray().every(Number.isFinite)).toBe(true)
      }
      expect(new Set(pieces.map(p=>`${p.shape}:${p.color}:${p.glow??0}`)).size).toBeLessThan(80)
    }
  })
})
