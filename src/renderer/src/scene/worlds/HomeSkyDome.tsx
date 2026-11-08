import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useHomeNight } from '@/lib/homeLighting'
import sunsetUrl from '@/assets/kywai/coastal-sunset.png'
import { homeSkyGeometry } from './homeSkyGeometry'

const FRAGMENT=/* glsl */ `
  uniform sampler2D landscape;
  uniform float skyTime;
  uniform float nightMode;
  varying vec3 skyDirection;
  const float PI=3.141592653589793;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
  float hash3(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
  float noise3(vec3 p){
    vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
      mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+1.),f.x),f.y),f.z);
  }
  float cloudNoise(vec3 p){return noise3(p)*.55+noise3(p*2.03)*.27+noise3(p*4.07)*.13+noise3(p*8.11)*.05;}
  void main(){
    vec3 d=normalize(skyDirection);
    float az=atan(d.x,-d.z+.000001),elevation=asin(clamp(d.y,-1.,1.));
    float horizon=smoothstep(-.063,-.041,elevation);

    // A smooth periodic longitude mapping extends the coastal vista around the whole sphere.
    // There is no rectangular photo fade: horizon, cloud colour and coastline stay connected.
    vec2 photoUv=vec2(.5+.5*sin(az),.4+(7.2+tan(clamp(elevation,-1.4,1.4))*132.5)/150.);
    vec2 uv=clamp(photoUv,vec2(.001),vec2(.999));
    float photoSea=1.-smoothstep(.385,.407,uv.y);
    vec2 waveUv=uv+vec2(sin(uv.y*220.+skyTime*.65)*.0018,sin(uv.y*100.-skyTime*.40+uv.x*35.)*.0013)*photoSea;
    vec3 photograph=texture2D(landscape,clamp(waveUv,.001,.999)).rgb;
    float photoHills=(1.-smoothstep(.27,.40,photograph.r))*smoothstep(.45,.7,uv.x)*(1.-smoothstep(.535,.58,uv.y))*smoothstep(.394,.410,uv.y);
    float sunProtect=1.-smoothstep(.035,.065,length((uv-vec2(.30,.452))*vec2(2.,1.)));
    vec2 cloudUv=uv+vec2(sin(skyTime*.018)*.018,sin(skyTime*.013)*.003);
    float photoCloud=smoothstep(.425,.49,uv.y)*(1.-photoHills)*(1.-sunProtect);
    photograph=mix(photograph,texture2D(landscape,clamp(cloudUv,.001,.999)).rgb,photoCloud*.7);

    float skyHeight=smoothstep(-.05,.85,elevation);
    vec3 sunDir=normalize(vec3(-60.,.3,-132.5));
    float sunAlignment=max(0.,dot(d,sunDir));
    vec3 zenith=texture2D(landscape,vec2(uv.x,.998)).rgb*.58;
    vec3 day=mix(photograph,zenith,smoothstep(.65,1.35,elevation));

    vec3 nightSky=mix(vec3(.018,.033,.061),vec3(.003,.007,.023),skyHeight);
    vec2 starUv=vec2(az/(2.*PI)+.5,elevation/PI+.5),grid=starUv*vec2(960.,480.);
    vec2 cell=floor(grid),pin=fract(grid)-.5;
    cell.x=mod(cell.x,960.);
    float star=step(.995,hash(cell))*exp(-dot(pin,pin)*85.)*(.75+.25*sin(skyTime*.5+hash(cell)*20.));
    nightSky+=vec3(.65,.77,1.)*star*smoothstep(-.04,.06,elevation);
    vec3 dark=mix(vec3(.008,.019,.036),nightSky,horizon);
    float village=smoothstep(.34,.65,photograph.r)*smoothstep(.07,.20,photograph.r-photograph.b);
    vec3 nightCoast=vec3(.010,.020,.032)+photograph*vec3(.025,.04,.065)+vec3(.5,.29,.09)*village;
    dark=mix(dark,nightCoast,photoHills);

    vec3 moonDir=normalize(vec3(33.,10.05,-132.5));
    vec3 moonRight=normalize(cross(moonDir,vec3(0,1,0))),moonUp=normalize(cross(moonRight,moonDir));
    vec2 moon=vec2(dot(d,moonRight),dot(d,moonUp));float radius=.0158,dist=length(moon);
    float disk=(1.-smoothstep(radius-.00035,radius+.00035,dist))*step(0.,dot(d,moonDir));
    float maria=smoothstep(.40,.72,noise2(moon*230.));
    float limb=sqrt(max(0.,1.-dot(moon,moon)/(radius*radius)));
    vec3 moonNormal=normalize(vec3(moon/radius,limb));
    float relief=(.91-maria*.18+.06*noise2(moon*1700.))*(.56+.44*max(0.,dot(moonNormal,normalize(vec3(-.4,.3,.9)))));
    dark+=vec3(.035,.055,.095)*exp(-dist*70.)*(1.-disk)*step(0.,dot(d,moonDir));
    dark=mix(dark,vec3(.72,.82,.91)*relief,disk);

    // 3D advection has no longitude seam; clouds cross every side of the dome in the same breeze.
    vec3 cloudP=d*vec3(6.,11.,6.)+vec3(skyTime*.026,skyTime*.003,skyTime*.011);
    float cloud=cloudNoise(cloudP),detail=cloudNoise(cloudP*1.7+vec3(3.,0.,1.));
    float density=smoothstep(.43,.66,cloud*.78+detail*.22);
    float cloudAlpha=density*smoothstep(-.065,.045,elevation)*.58;
    cloudAlpha*=1.-photoHills;
    vec3 cloudDay=mix(vec3(.57,.37,.35),vec3(.77,.50,.35),pow(sunAlignment,3.));
    vec3 cloudNight=mix(vec3(.035,.054,.082),vec3(.075,.10,.15),pow(max(0.,dot(d,moonDir)),9.));
    day=mix(day,cloudDay,cloudAlpha);
    dark=mix(dark,cloudNight,cloudAlpha*.72);
    gl_FragColor=vec4(mix(day,dark,nightMode),1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function HomeSkyDome({reduced}:{reduced:boolean}) {
  const night=useHomeNight(),mesh=useRef<THREE.Mesh>(null!)
  const resources=useMemo(()=>{
    const texture=new THREE.TextureLoader().load(sunsetUrl);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8
    const material=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,depthTest:false,
      uniforms:{landscape:{value:texture},skyTime:{value:0},nightMode:{value:0}},
      vertexShader:'varying vec3 skyDirection;void main(){skyDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:FRAGMENT})
    return {texture,material,geometry:homeSkyGeometry()}
  },[])
  useFrame((state,delta)=>{
    mesh.current.position.copy(state.camera.position)
    if(!reduced)resources.material.uniforms.skyTime.value+=Math.min(delta,.1)
    resources.material.uniforms.nightMode.value=night?1:0
  })
  useEffect(()=>()=>{resources.texture.dispose();resources.material.dispose();resources.geometry.dispose()},[resources])
  return <mesh ref={mesh} geometry={resources.geometry} material={resources.material} renderOrder={-20} frustumCulled={false} raycast={()=>{}} name="kywai-panoramic-sky-dome" />
}
