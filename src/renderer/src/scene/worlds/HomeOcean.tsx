import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useHomeNight } from '@/lib/homeLighting'

const WAVES=/* glsl */ `
  float seaHeight(vec2 p,float t) {
    return sin(dot(p,vec2(.12,.31))-t*.83)*.24
      +sin(dot(p,vec2(-.27,.17))-t*.61)*.13
      +sin(dot(p,vec2(.62,.48))-t*1.17)*.045;
  }
`

/** Real, displaced water below the coastal cliff; the distant photo blends into its far edge. */
export function HomeOcean({reduced}:{reduced:boolean}) {
  const night=useHomeNight()
  const resources=useMemo(()=>{
    const time={value:0},material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,
      uniforms:{seaTime:time,nightMode:{value:0},zenithColor:{value:new THREE.Color(.38,.22,.32)},sunDirection:{value:new THREE.Vector3(-.44,.072,-.895).normalize()},
        waterColor:{value:new THREE.Color('#465d69')},horizonColor:{value:new THREE.Color('#bd929c')},sunColor:{value:new THREE.Color('#f5b064')}},
      vertexShader:`uniform float seaTime;varying vec3 seaWorld;${WAVES}
        void main(){vec3 p=position;p.y+=seaHeight(p.xz,seaTime);seaWorld=(modelMatrix*vec4(p,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(seaWorld,1.);}`,
      fragmentShader:`uniform float seaTime;uniform float nightMode;uniform vec3 zenithColor;uniform vec3 sunDirection;uniform vec3 waterColor;uniform vec3 horizonColor;uniform vec3 sunColor;varying vec3 seaWorld;${WAVES}
        void main(){vec2 p=seaWorld.xz;float e=.12;
          float dx=(seaHeight(p+vec2(e,0.),seaTime)-seaHeight(p-vec2(e,0.),seaTime))/(2.*e);
          float dz=(seaHeight(p+vec2(0.,e),seaTime)-seaHeight(p-vec2(0.,e),seaTime))/(2.*e);
          dx+=sin(p.x*2.5+p.y*1.2-seaTime*1.7)*.014;
          dz+=sin(p.y*3.7+p.x*.6+seaTime*1.3)*.018;
          vec3 n=normalize(vec3(-dx,1.,-dz)),v=normalize(cameraPosition-seaWorld),r=reflect(-v,n);
          float fresnel=pow(1.-max(dot(n,v),0.),3.);
          vec3 sky=mix(horizonColor,zenithColor,smoothstep(.02,.55,r.y));
          vec3 col=mix(waterColor,sky,.45+fresnel*.43);
          float alignment=max(0.,dot(r,sunDirection));
          col+=sunColor*(pow(alignment,150.)*.72+pow(alignment,18.)*.12)*(1.-nightMode*.58);
          float crest=smoothstep(.23,.39,seaHeight(p,seaTime));
          col+=vec3(.07,.065,.055)*(1.-nightMode*.65)*crest*(.5+.5*sin(p.x*2.1-p.y*1.6-seaTime));
          float farFade=1.-smoothstep(225.,370.,length(p-cameraPosition.xz));
          gl_FragColor=vec4(col,farFade*.95);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`})
    const geometry=new THREE.PlaneGeometry(1000,1000,320,320);geometry.rotateX(-Math.PI/2);geometry.translate(0,-9.75,0)
    return {material,geometry,time}
  },[])
  useEffect(()=>{
    const u=resources.material.uniforms
    u.nightMode.value=night?1:0
    u.sunDirection.value.set(...(night?[.30,.28,-.91]:[-.44,.072,-.895])).normalize()
    u.waterColor.value.set(night?'#081522':'#465d69')
    u.horizonColor.value.set(night?'#1d344e':'#bd929c')
    u.sunColor.value.set(night?'#bddbfa':'#f5b064')
    if(night)u.zenithColor.value.set('#080f23');else u.zenithColor.value.setRGB(.38,.22,.32)
  },[night,resources])
  useFrame((_,delta)=>{if(!reduced) resources.time.value+=Math.min(delta,.1)})
  useEffect(()=>()=>{resources.material.dispose();resources.geometry.dispose()},[resources])
  return <mesh geometry={resources.geometry} material={resources.material} renderOrder={-15} name="animated-coastal-water" />
}
