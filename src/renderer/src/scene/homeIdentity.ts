import type { RobotAvatar } from '@shared/types'
import { homeRole, type HomeRole } from './worlds/homeLayout'

export interface HomeIdentity {role?:HomeRole;body:RobotAvatar['body'];accessory:RobotAvatar['accessory'];eyes:RobotAvatar['eyes'];ceramic:string;cloth:string}
const identities:Record<HomeRole,Omit<HomeIdentity,'role'>>={
  claude:{body:'blob',accessory:'none',eyes:'arc',ceramic:'#efe1cb',cloth:'#ba8056'},
  gemini:{body:'capsule',accessory:'ears',eyes:'round',ceramic:'#e0e7e0',cloth:'#7facc1'},
  qwen:{body:'egg',accessory:'antenna',eyes:'pill',ceramic:'#e3e7d3',cloth:'#4c8273'},
  aider:{body:'cube',accessory:'none',eyes:'round',ceramic:'#ddc9a8',cloth:'#697a5c'},
  kilo:{body:'cube',accessory:'vents',eyes:'chevron',ceramic:'#e6d9c7',cloth:'#bd8656'},
  muse:{body:'bulb',accessory:'tuft',eyes:'wave',ceramic:'#efe2e8',cloth:'#a480a3'},
  copilot:{body:'capsule',accessory:'none',eyes:'round',ceramic:'#d9dfeb',cloth:'#777aab'},
  codex:{body:'dome',accessory:'vents',eyes:'chevron',ceramic:'#d6e3d7',cloth:'#4f8175'},
  hermes:{body:'dome',accessory:'halo',eyes:'pill',ceramic:'#f0e2be',cloth:'#6e8a78'}
}
export function homeIdentity(name:string,avatar:RobotAvatar):HomeIdentity {
  const role=homeRole(name)
  return role ? {role,...identities[role]} : {body:avatar.body,accessory:avatar.accessory,eyes:avatar.eyes,ceramic:'#e8dfcd',cloth:'#80958a'}
}
