import type { Model, Vec } from './models'

const stone='#283746',edge='#566876',gold='#b99a60',glass='#85bac9'

function column(m:Model,x:number,z:number,h:number,y=0,r=.4){
  m.add('cylinder',[x,y+h/2,z],[r,h,r],stone)
  for(const [dy,s] of [[.12,1.7],[.32,1.4],[h-.3,1.4],[h-.1,1.7]])m.add('cylinder',[x,y+dy,z],[r*s,.18,r*s],edge)
  for(let i=0;i<12;i++){
    const a=i*Math.PI/6
    m.beam([x+Math.sin(a)*r,y+.45,z+Math.cos(a)*r],[x+Math.sin(a)*r,y+h-.4,z+Math.cos(a)*r],.014,gold)
  }
}

function arch(m:Model,x:number,y:number,z:number,w:number,h:number,yaw=0){
  m.add('pointedArch',[x,y,z],[w,h,.65],stone,0,[0,yaw,0])
  for(const s of [-1,1])m.add('pointedArch',[x+Math.sin(yaw)*s*.36,y,z+Math.cos(yaw)*s*.36],[w*.97,h*.97,.04],gold,.06,[0,yaw,0])
}

function balustrade(m:Model,a:Vec,b:Vec){
  for(const y of [.22,1.04])m.beam([a[0],a[1]+y,a[2]],[b[0],b[1]+y,b[2]],.055,gold)
  const length=Math.hypot(a[0]-b[0],a[2]-b[2]),count=Math.max(1,Math.floor(length/.65))
  for(let i=0;i<=count;i++){
    const x=a[0]+(b[0]-a[0])*i/count,z=a[2]+(b[2]-a[2])*i/count
    m.add('cylinder',[x,a[1]+.59,z],[.035,.86,.035],edge)
    m.add('sphere',[x,a[1]+.59,z],[.075,.13,.075],gold)
  }
}

function crystalBed(m:Model,x:number,y:number,z:number,s:number){
  m.add('rock',[x,y-.28*s,z],[s*1.25,s*.5,s],stone)
  for(let j=0;j<9;j++){
    const a=j*2.4,r=(j%3)*s*.25,h=s*(.8+Math.sin(j*17)**2*1.8)
    m.add('crystal',[x+Math.sin(a)*r,y+h*.42,z+Math.cos(a)*r],[s*.16,h,s*.18],j%3?glass:'#bfdce3',0,[Math.sin(a)*.13,a,Math.cos(a)*.13])
  }
}

function tower(m:Model,x:number,z:number,base:number,h:number){
  for(let tier=0;tier<4;tier++){
    const y=base+tier*h/4,r=2.45-tier*.28
    m.add('cylinder',[x,y+h/8,z],[r,h/4,r],stone)
    m.add('cylinder',[x,y,z],[r+.22,.28,r+.22],edge)
    m.ring([x,y+.16,z],r+.22,gold,undefined,.05)
    for(let k=0;k<12;k++){
      const a=k*Math.PI/6,dx=Math.sin(a),dz=Math.cos(a)
      m.beam([x+dx*(r+.03),y+.3,z+dz*(r+.03)],[x+dx*(r+.03),y+h/4-.3,z+dz*(r+.03)],.034,gold)
      if(k%2===0){
        const px=x+dx*(r+.07),pz=z+dz*(r+.07),baseY=y+.45,scale=(h/4-.8)/10.35
        m.add('pointedArch',[px,baseY+6.95*scale,pz],[.36,3.4*scale,.09],gold,0,[0,a,0])
        for(const side of [-1,1])m.beam([px+Math.cos(a)*side*.36,baseY,pz-Math.sin(a)*side*.36],[px+Math.cos(a)*side*.36,baseY+6.95*scale,pz-Math.sin(a)*side*.36],.024,gold)
      }
    }
  }
  const y=base+h,r=1.8
  for(let k=0;k<8;k++){
    const a=k*Math.PI/4
    m.beam([x+Math.sin(a)*r,y,z+Math.cos(a)*r],[x,y+5.5,z],.045,gold)
  }
  m.add('crystal',[x,y+1.6,z],[1.05,4.2,1.05],glass,.07)
  m.ring([x,y,z],2.05,gold,undefined,.15)
}

/** A navigable courtyard inside a much larger, multi-level sanctuary. */
export function addRelicSanctuary(m:Model,detailed:boolean){
  // Open axial portal: the eye continues through it to stairs, bridges and the observatory.
  for(const x of [-15,-10,-5,5,10,15])column(m,x,-17,7)
  for(const x of [-12.5,-7.5,7.5,12.5])arch(m,x,7,-17,2.5,3.8)
  arch(m,0,7,-17,5,6.2)
  for(const side of [-1,1]){
    m.box([side*18.3,-.03,-2],[4.5,.44,30],stone)
    for(const z of [-14,-6,2,10]){
      column(m,side*16.5,z,7.3)
      column(m,side*21,z,7.3)
      arch(m,side*18.75,7.3,z,2.25,3.7)
    }
    for(const z of [-10,-2,6]){
      arch(m,side*16.5,7.3,z,4,4.1,Math.PI/2)
      arch(m,side*21,7.3,z,4,4.1,Math.PI/2)
      balustrade(m,[side*16.5,.2,z-3.4],[side*16.5,.2,z+3.4])
      crystalBed(m,side*19,.25,z,.75)
    }
    // Long gallery roof ribs and a second, higher terrace behind it.
    for(const x of [side*16.5,side*21])m.beam([x,7.35,-14],[x,7.35,10],.14,gold)
    m.box([side*22.5,3,-24],[7,.65,12],stone)
    balustrade(m,[side*19,3.35,-18],[side*19,3.35,-30])
    for(const z of [-19,-25,-31])column(m,side*25,z,11,3,.5)
    for(const z of [-22,-28])arch(m,side*25,14,z,3,4,Math.PI/2)
    tower(m,side*13,-31,1.2,18)
    tower(m,side*30,-50,2,24)
    // Rock shoulders and quartz formations continue far outside the court.
    for(let i=0;i<(detailed?9:5);i++){
      const z=-12-i*7,x=side*(28+Math.sin(i*2.4)*6)
      m.add('rock',[x,-3-i*.12,z],[5.5,4.5,6.1],i%2?stone:'#374958')
      crystalBed(m,x,0,z,1.3+(i%3)*.6)
    }
    for(const x of [side*5.1,side*9.1])balustrade(m,[x,.2,-18],[x,2.3,-29])
    m.box([side*7.1,.7,-23.5],[4,.6,11],stone)
    for(let i=0;i<28;i++)m.box([side*7.1,.08+i*.073,-18-i*.4],[4,.15,.43],i%2?edge:stone)
    m.box([side*13,1,-31],[12,.45,7],stone)
    balustrade(m,[side*7.4,1.3,-34.3],[side*18.6,1.3,-34.3])
  }
  // Ceremonial stair and the raised far sanctum.
  for(let i=0;i<34;i++)m.box([0,i*.075,-18-i*.48],[7.4,.14,.52],i%4===0?edge:stone)
  m.add('cylinder',[0,1.9,-39],[9,.6,9],stone)
  for(let i=0;i<3;i++)m.add('cylinder',[0,2.3+i*.19,-39],[8.5-i*.32,.2,8.5-i*.32],edge)
  for(let j=0;j<12;j++){
    const a=j/12*Math.PI*2,x=Math.sin(a)*7.8,z=-39+Math.cos(a)*7.8
    if(z>-35&&Math.abs(x)<4)continue
    column(m,x,z,11,2.8,.42)
    const next=a+Math.PI/6
    m.beam([x,13.8,z],[Math.sin(next)*7.8,13.8,-39+Math.cos(next)*7.8],.1,gold)
    for(let k=0;k<28;k++){
      const a0=k/28*Math.PI/2,a1=(k+1)/28*Math.PI/2
      m.beam([Math.sin(a)*7.8*Math.cos(a0),13.8+6.2*Math.sin(a0),-39+Math.cos(a)*7.8*Math.cos(a0)],[Math.sin(a)*7.8*Math.cos(a1),13.8+6.2*Math.sin(a1),-39+Math.cos(a)*7.8*Math.cos(a1)],.055,gold)
    }
  }
  m.add('dome',[0,13.8,-39],[7.8,6.2,7.8],'#4c7d89')
  for(const y of [14,15.5,17,18.5,19.5])m.ring([0,y,-39],7.8*Math.sqrt(1-((y-13.8)/6.2)**2),gold,undefined,.10)
  crystalBed(m,0,2.9,-39,3.1)
  // Foreground landings provide nearby mass and occlusion when the camera moves.
  for(const side of [-1,1]){
    m.box([side*16,-.3,13],[6,.5,5],stone)
    balustrade(m,[side*13,.05,13],[side*18,.05,13])
    crystalBed(m,side*18,0,11,1.3)
  }
}
