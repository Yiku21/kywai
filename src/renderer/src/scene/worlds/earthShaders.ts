export const earthVertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}`

export const earthFragment = /* glsl */ `
uniform sampler2D dayMap;
uniform sampler2D nightMap;
uniform sampler2D cloudMap;
uniform vec3 sun;
uniform float cloudOffset;
uniform float work;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vec3 n = normalize(vNormal);
  vec3 viewDir = normalize(cameraPosition - vWorld);
  vec3 light = normalize(sun);
  float ndl = dot(n, light);
  vec3 land = texture2D(dayMap, vUv).rgb;
  float water = smoothstep(0.015, 0.07, land.b - max(land.r, land.g) * 1.15);
  float day = smoothstep(-0.08, 0.22, ndl);
  float cloudShadow = texture2D(cloudMap, vUv + vec2(cloudOffset + 0.003, -0.001)).r;
  vec3 surface = land * (0.025 + max(ndl, 0.0) * 1.65) * (1.0 - cloudShadow * 0.35);
  float specular = pow(max(dot(n, normalize(light + viewDir)), 0.0), 95.0) * water;
  surface += vec3(0.75,0.84,0.92) * specular * 0.38 * day;
  vec3 cities = texture2D(nightMap, vUv).rgb;
  surface += cities * (1.0 - smoothstep(-0.12,0.16,ndl)) * (1.3 + 1.7 * work) * (1.0-cloudShadow*0.65);
  float fresnel = pow(1.0 - max(dot(n,viewDir),0.0), 4.0);
  surface += vec3(0.025,0.16,0.34) * fresnel * smoothstep(-0.18,0.35,ndl);
  surface += vec3(0.19,0.055,0.012) * fresnel * exp(-abs(ndl)*18.0);
  gl_FragColor = vec4(surface, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

export const cloudFragment = /* glsl */ `
uniform sampler2D cloudMap;
uniform vec3 sun;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  float density = texture2D(cloudMap, vUv).r;
  float alpha = smoothstep(0.10,0.86,density) * 0.93;
  float ndl = dot(normalize(vNormal),normalize(sun));
  vec3 color = mix(vec3(0.018,0.027,0.05),vec3(0.95,0.97,1.0),smoothstep(-0.09,0.28,ndl));
  color *= 0.3 + max(ndl,0.0)*1.2;
  color += vec3(0.26,0.09,0.025)*exp(-abs(ndl)*20.0);
  gl_FragColor = vec4(color,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

export const atmosphereFragment = /* glsl */ `
uniform vec3 sun;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vec3 n=normalize(vNormal), viewDir=normalize(cameraPosition-vWorld);
  float rim=pow(1.0-abs(dot(n,viewDir)),5.5);
  float lit=dot(n,normalize(sun));
  vec3 color=mix(vec3(0.85,0.23,0.055),vec3(0.16,0.48,1.0),smoothstep(-0.05,0.20,lit));
  float alpha=rim*smoothstep(-0.27,0.3,lit)*0.56;
  gl_FragColor=vec4(color,alpha);
}`
