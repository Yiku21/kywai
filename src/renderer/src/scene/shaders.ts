// Shaders de la escena. Todos son baratos: sin texturas grandes ni bucles.

const HASH = /* glsl */ `
  float hash11(float n) { return fract(sin(n) * 43758.5453123); }
  float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
`

// ---------- Suelo con rejilla ----------
export const floorVert = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`

export const floorFrag = /* glsl */ `
  ${HASH}
  uniform float uTime;
  uniform float uAmbient;
  uniform vec3 uFog;
  uniform vec3 uFloorA;
  uniform vec3 uFloorB;
  uniform vec3 uFloorLine;
  uniform vec3 uFloorTile;
  uniform vec3 uFloorGlow;
  uniform vec3 uFloorSide;
  uniform float uCobble;
  uniform float uWeave;
  varying vec3 vWorld;

  float gridLine(vec2 p, float size, float w) {
    vec2 q = p / size;
    vec2 g = abs(fract(q - 0.5) - 0.5) / (fwidth(q) * w);
    return 1.0 - min(min(g.x, g.y), 1.0);
  }

  void main() {
    vec2 p = vWorld.xz;
    float d = length(p * vec2(0.8, 1.0));
    float fade = smoothstep(32.0, 6.0, d);

    // Losas de 2 m con juntas finas y un ligero relieve por losa.
    vec2 cell = floor(p / 2.0);
    float h = hash21(cell);
    vec3 base = mix(uFloorA, uFloorB, h * 0.6);
    float seams = gridLine(p, 2.0, 1.2) * 0.5 + gridLine(p, 8.0, 1.6) * 0.35;
    // Adoquines (Halloween): piedras en hileras desfasadas, cada una de un tono, con las juntas oscuras.
    if (uCobble > 0.0) {
      vec2 q = p / vec2(0.62, 0.44);
      float row = floor(q.y);
      q.x += mod(row, 2.0) * 0.5;
      vec2 id = floor(q);
      vec2 f = fract(q) - 0.5;
      float hh = hash21(id + 3.7);
      float e = max(abs(f.x) * (1.0 + hh * 0.1), abs(f.y) * 1.05) + (hh - 0.5) * 0.04;
      float stone = 1.0 - smoothstep(0.38, 0.49, e);
      base = mix(base * 0.3, base * (0.75 + 0.6 * hh), stone);
      seams *= 1.0 - uCobble;
    }

    // Algunas losas se encienden despacio, cada una con su ritmo.
    float lit = step(0.9, h);
    float wave = sin(uTime * (0.16 + h * 0.3) + h * 40.0) * 0.5 + 0.5;
    vec2 local = fract(p / 2.0);
    float inner = smoothstep(0.0, 0.1, local.x) * smoothstep(0.0, 0.1, local.y) *
                  smoothstep(0.0, 0.1, 1.0 - local.x) * smoothstep(0.0, 0.1, 1.0 - local.y);
    float tile = lit * wave * wave * inner * uAmbient;

    // Colores del tema (palette.ts); en los claros las juntas restan (negativas) para verse más oscuras.
    // Trama de hilos en diagonal (Telar).
    if (uWeave > 0.0) {
      vec2 r = vec2(p.x + p.y, p.x - p.y) * 0.7071;
      float th = gridLine(r, 0.42, 0.9) * 0.6 + gridLine(r, 1.68, 1.4) * 0.4;
      base += uFloorLine * th * 0.18 * uWeave * fade;
    }
    vec3 col = base + uFloorLine * seams * 0.2 * fade + uFloorTile * tile * 0.06 * fade;
    // Resplandor bajo el proyecto y otro tono hacia los lados.
    col += uFloorGlow * smoothstep(8.0, 0.0, d) * 0.3;
    col += uFloorSide * smoothstep(6.0, 22.0, abs(p.x)) * 0.12 * fade;
    // A lo lejos, el suelo se funde con la niebla del horizonte (sigue habiendo suelo bajo la ciudad).
    float far = smoothstep(20.0, 46.0, length(p * vec2(0.75, 1.0)));
    gl_FragColor = vec4(mix(col, uFog, far), 1.0);
  }
`

// ---------- Pantallas holográficas ----------
export const holoVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/** uMode: 0 código, 1 gráfico de barras, 2 documento, 3 maqueta de diseño, 4 lista/tabla */
export const holoFrag = /* glsl */ `
  ${HASH}
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uActive;
  uniform float uMode;
  uniform float uSeed;
  uniform float uOpacity;
  uniform float uAmbient;
  varying vec2 vUv;

  float box(vec2 uv, vec2 a, vec2 b) {
    return step(a.x, uv.x) * step(uv.x, b.x) * step(a.y, uv.y) * step(uv.y, b.y);
  }

  void main() {
    vec2 uv = vUv;
    float speed = mix(0.12, 1.0, uActive);
    float t = uTime * speed + uSeed * 13.0;
    float a = 0.07 + 0.06 * uActive;
    float content = 0.0;

    vec2 c = (uv - vec2(0.06, 0.08)) / vec2(0.88, 0.8);
    float inside = box(uv, vec2(0.06, 0.08), vec2(0.94, 0.88));

    if (uMode < 0.5) {
      float scroll = c.y + t * 0.05;
      float row = floor(scroll * 11.0);
      float fr = fract(scroll * 11.0);
      float indent = 0.06 * floor(hash11(row * 1.7 + uSeed) * 4.0);
      float len = 0.2 + 0.6 * hash11(row + uSeed * 7.0);
      float line = step(0.3, fr) * step(fr, 0.7) * step(indent, c.x) * step(c.x, indent + len);
      float accent = step(0.7, hash11(row * 3.1 + uSeed)) * step(indent, c.x) * step(c.x, indent + 0.12);
      content = line * 0.55 + accent * 0.4;
    } else if (uMode < 1.5) {
      float i = floor(c.x * 7.0);
      float fx = fract(c.x * 7.0);
      float h = 0.18 + 0.65 * (0.5 + 0.5 * sin(t * 0.8 + i * 1.37 + uSeed * 5.0));
      content = step(c.y, h) * step(0.2, fx) * step(fx, 0.8) * 0.6;
      content += step(abs(c.y - (0.55 + 0.25 * sin(c.x * 9.0 + t))), 0.012) * 0.6;
    } else if (uMode < 2.5) {
      float head = box(c, vec2(0.0, 0.84), vec2(0.55, 0.94));
      float scroll = c.y + t * 0.03;
      float row = floor(scroll * 14.0);
      float fr = fract(scroll * 14.0);
      float len = 0.55 + 0.4 * hash11(row + uSeed);
      float para = step(0.35, fr) * step(fr, 0.65) * step(c.x, len) * step(c.y, 0.76);
      content = head * 0.7 + para * 0.45;
    } else if (uMode < 3.5) {
      float hero = box(c, vec2(0.0, 0.62), vec2(1.0, 0.98)) * (1.0 - box(c, vec2(0.02, 0.64), vec2(0.98, 0.96)));
      float title = box(c, vec2(0.08, 0.8), vec2(0.5 + 0.1 * sin(t * 0.7), 0.86));
      float cards = 0.0;
      for (int k = 0; k < 3; k++) {
        float x0 = float(k) * 0.34;
        cards += box(c, vec2(x0, 0.08), vec2(x0 + 0.3, 0.5)) * (1.0 - box(c, vec2(x0 + 0.015, 0.1), vec2(x0 + 0.285, 0.48)));
      }
      float cursor = box(c, vec2(fract(t * 0.13) * 0.9, 0.3), vec2(fract(t * 0.13) * 0.9 + 0.025, 0.36));
      content = hero * 0.6 + title * 0.55 + cards * 0.5 + cursor * 0.8 * uActive;
    } else {
      float rows = floor(c.y * 7.0);
      float fr = fract(c.y * 7.0);
      float check = box(vec2(c.x, fr), vec2(0.0, 0.3), vec2(0.07, 0.7));
      float done = step(rows, mod(floor(t * 0.5), 8.0) - 1.0);
      float txt = step(0.38, fr) * step(fr, 0.62) * step(0.12, c.x) * step(c.x, 0.4 + 0.5 * hash11(rows + uSeed));
      content = check * (0.4 + 0.4 * done) + txt * 0.45;
    }
    content *= inside;

    // Marco con esquinas reforzadas
    float bx = min(uv.x, 1.0 - uv.x);
    float by = min(uv.y, 1.0 - uv.y);
    float edge = 1.0 - smoothstep(0.0, 0.012, min(bx, by));
    float corner = (1.0 - smoothstep(0.0, 0.025, min(bx, by))) * step(max(bx, by), 0.12);

    // Barrido suave
    float sweepPos = fract(uTime * (0.07 + uSeed * 0.03) + uSeed) * 1.6 - 0.3;
    float sd = (uv.y - sweepPos) * 9.0;
    float sweep = exp(-sd * sd) * 0.18 * uAmbient;

    a += content * (0.55 + 0.45 * uActive) + edge * 0.35 + corner * 0.5 + sweep;
    vec3 col = uColor * (0.85 + 0.6 * uActive) + vec3(sweep * 0.6);
    gl_FragColor = vec4(col, a * uOpacity);
  }
`

// ---------- Conexiones del suelo (pulsos ambientales + transferencias) ----------
export const traceVert = holoVert

export const traceFrag = /* glsl */ `
  uniform float uTime;
  uniform vec3 uBase;
  uniform vec3 uActiveColor;
  uniform float uActive;
  uniform float uPhase;
  uniform float uAmbient;
  uniform float uLen;
  uniform float uDir;
  varying vec2 vUv;

  void main() {
    float s = vUv.x;
    // Pulso ambiental: tenue, lento y espaciado (no confundible con una transferencia).
    float period = 7.0 + uPhase * 5.0;
    float head = fract(uTime / period + uPhase);
    head = head * 1.4 - 0.2;
    float d = (s - head) * uLen;
    float pulse = exp(-d * d / 0.35) * uAmbient;

    // Transferencia activa: flujo nítido en el color del emisor.
    float flow = 0.5 + 0.5 * sin((s * uLen * 2.2 - uTime * 5.0 * uDir));
    vec3 col = uBase * (0.55 + pulse * 1.3) + uActiveColor * uActive * (1.1 + 0.6 * flow);
    float a = 0.28 + pulse * 0.45 + uActive * (0.5 + 0.3 * flow);
    gl_FragColor = vec4(col, a);
  }
`

// ---------- Arcos de delegación entre agentes ----------
export const arcFrag = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uHead;
  uniform float uLen;
  varying vec2 vUv;

  void main() {
    float s = vUv.x;
    float dash = step(0.45, fract(s * uLen * 1.6 - uTime * 2.2));
    float behind = smoothstep(uHead + 0.02, uHead - 0.35, s) * step(s, uHead + 0.02);
    float ahead = step(uHead, s) * 0.35;
    float a = (0.25 + 0.55 * dash) * (behind + ahead) + behind * 0.25;
    gl_FragColor = vec4(uColor * 1.6, a * uOpacity);
  }
`

// ---------- Partículas ambientales ----------
export const particleVert = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uMotion;
  attribute float aSeed;
  attribute float aSize;
  varying float vAlpha;

  void main() {
    vec3 p = position;
    float sp = 0.08 + aSeed * 0.18;
    p.y = mod(p.y + uTime * sp * uMotion, 9.0) - 0.5;
    p.x += sin(uTime * 0.07 * uMotion + aSeed * 31.0) * 0.6;
    p.z += cos(uTime * 0.05 * uMotion + aSeed * 17.0) * 0.6;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixelRatio * (16.0 / -mv.z);
    float tw = 0.55 + 0.45 * sin(uTime * (0.6 + aSeed) * uMotion + aSeed * 50.0);
    float edgeFade = smoothstep(-0.5, 0.6, p.y) * smoothstep(8.5, 6.0, p.y);
    vAlpha = tw * edgeFade * (0.35 + aSeed * 0.4);
  }
`

export const particleFrag = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(uColor, a * a * vAlpha);
  }
`

// ---------- Ciudad del fondo (edificios instanciados con ventanas) ----------
export const cityVert = /* glsl */ `
  attribute float aSeed;
  varying vec3 vLocal;
  varying vec3 vNormalL;
  varying vec3 vScale;
  varying float vSeed;
  varying float vDepth;
  void main() {
    vLocal = position;
    vNormalL = normal;
    vSeed = aSeed;
    vScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

export const cityFrag = /* glsl */ `
  ${HASH}
  uniform float uTime;
  uniform float uAmbient;
  uniform vec3 uFog;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform vec3 uCityA;
  uniform vec3 uCityB;
  uniform vec3 uWin0;
  uniform vec3 uWin1;
  uniform vec3 uWin2;
  uniform vec3 uWinDim;
  uniform vec3 uEdge0;
  uniform vec3 uEdge1;
  uniform vec3 uRoof;
  uniform float uLight;
  uniform float uLit;
  uniform float uArch;
  uniform float uCorner;
  varying vec3 vLocal;
  varying vec3 vNormalL;
  varying vec3 vScale;
  varying float vSeed;
  varying float vDepth;

  void main() {
    vec3 n = vNormalL;
    float roof = step(0.5, abs(n.y));
    float sideX = step(0.5, abs(n.x));
    // Coordenadas de la cara en metros, para que las ventanas tengan siempre el mismo tamaño.
    vec2 f = sideX > 0.5 ? vec2(vLocal.z * vScale.z, vLocal.y * vScale.y) : vec2(vLocal.x * vScale.x, vLocal.y * vScale.y);
    float h = vLocal.y + 0.5;
    vec3 base = mix(uCityA, uCityB, h);
    base *= sideX > 0.5 ? 0.7 : 1.0;

    vec2 size = vec2(0.26, 0.34);
    vec2 cell = floor(f / size);
    vec2 g = fract(f / size);
    float win = step(0.22, g.x) * step(g.x, 0.78) * step(0.28, g.y) * step(g.y, 0.72);
    // Ventanas en arco (Halloween): rectángulo con medio punto arriba.
    if (uArch > 0.5) {
      vec2 c = (g - vec2(0.5, 0.56)) / vec2(0.26, 0.2);
      win = step(0.24, g.x) * step(g.x, 0.76) * step(0.22, g.y) * step(g.y, 0.56) + step(dot(c, c), 1.0) * step(0.56, g.y);
      win = min(win, 1.0);
    }
    float faceId = sideX + n.z * 2.0;
    float r = hash21(cell + vec2(vSeed * 37.0, faceId * 7.3));
    float on = step(uLit, r);
    vec3 wcol = r > 0.93 ? uWin0 : r > 0.84 ? uWin1 : uWin2;
    // Ventanas fijas (sin titilar). A lo lejos, donde una ventana ocupa menos de un píxel, se pinta su
    // brillo medio en lugar del dibujo: así no centellean al mover la cámara.
    vec2 fw = fwidth(f / size);
    float detail = clamp(1.6 - max(fw.x, fw.y) * 3.0, 0.0, 1.0);
    vec3 lit = mix(uWinDim * 0.075, wcol * win * on, detail);
    // Sin ventanas en la última franja (cornisa) ni en el tejado.
    float band = step(h * vScale.y, vScale.y - 0.22) * step(0.2, h * vScale.y);
    vec3 col = base + lit * band * (1.0 - roof) * 1.05;
    // En los temas claros las ventanas no suman luz (sobre una fachada blanca no se verían): son cristal tintado,
    // apagado o encendido, pintado encima.
    if (uLight > 0.5) {
      vec3 glass = mix(uWinDim, mix(uWinDim, wcol, on), detail);
      col = mix(base, glass, mix(0.35, win, detail) * band * (1.0 - roof));
    }

    // Cornisa luminosa y aristas del tejado.
    float top = smoothstep(vScale.y - 0.06, vScale.y, h * vScale.y) * (1.0 - roof);
    vec2 rf = abs(vLocal.xz) * 2.0;
    float rim = roof * max(smoothstep(0.9, 1.0, rf.x), smoothstep(0.9, 1.0, rf.y));
    vec3 edgeCol = mix(uEdge0, uEdge1, step(0.7, fract(vSeed * 13.0)));
    float edge = top * 0.9 + rim * 0.7;
    col = uLight > 0.5 ? mix(col, edgeCol, clamp(edge, 0.0, 1.0)) : col + edgeCol * edge;
    // Aristas verticales encendidas (torres de cristal de Relicario y Telar).
    if (uCorner > 0.0) {
      float halfW = sideX > 0.5 ? vScale.z * 0.5 : vScale.x * 0.5;
      float ce = smoothstep(0.06, 0.0, halfW - abs(f.x)) * (1.0 - roof);
      col += edgeCol * ce * uCorner;
    }
    col = mix(col, base * mix(1.4, 1.03, uLight) + uRoof, roof * (1.0 - rim));

    float fogF = smoothstep(uFogNear, uFogFar, vDepth);
    gl_FragColor = vec4(mix(col, uFog, fogF), 1.0);
  }
`

// ---------- Circuitos del suelo ----------
/** aDist: distancia recorrida a lo largo del trazo; aInfo: x = longitud total, y = fase, z = tipo (0 enlace, 1 relleno). */
export const circuitVert = /* glsl */ `
  attribute float aDist;
  attribute vec3 aInfo;
  attribute float aSide;
  varying float vDist;
  varying vec3 vInfo;
  varying float vSide;
  varying vec3 vWorld;
  void main() {
    vDist = aDist;
    vInfo = aInfo;
    vSide = aSide;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`

export const circuitFrag = /* glsl */ `
  uniform float uTime;
  uniform float uAmbient;
  uniform vec3 uBlue;
  uniform vec3 uViolet;
  varying float vDist;
  varying vec3 vInfo;
  varying float vSide;
  varying vec3 vWorld;
  void main() {
    float len = vInfo.x;
    float phase = vInfo.y;
    float filler = vInfo.z;
    vec3 base = mix(uBlue, uViolet, step(0.62, phase));
    // Núcleo brillante y bordes suaves (la cinta tiene vSide de -1 a 1).
    float core = 1.0 - smoothstep(0.15, 1.0, abs(vSide));
    // Pulso de datos que recorre el trazo, con tres galones detrás.
    float speed = filler > 0.5 ? 1.2 : 2.2;
    float period = len / speed + 3.0 + phase * 4.0;
    float head = fract(uTime / period + phase) * (len + 4.0) - 2.0;
    float d = head - vDist;
    float pulse = exp(-d * d * 6.0) * step(-0.3, d);
    float chev = 0.0;
    for (int k = 1; k <= 3; k++) {
      float dk = d - float(k) * 0.32;
      chev += exp(-dk * dk * 60.0) * (1.0 - float(k) * 0.25);
    }
    float motion = (pulse * 1.6 + chev * 0.8) * uAmbient;
    float fade = smoothstep(30.0, 12.0, length(vWorld.xz * vec2(0.8, 1.0)));
    float a = (0.42 + 0.3 * (1.0 - filler)) * core + motion * core;
    vec3 col = base * (0.95 + (1.0 - filler) * 0.35 + motion * 1.4);
    gl_FragColor = vec4(col, a * fade);
  }
`

// ---------- Paneles holográficos con texto (zonas y carteles) ----------
export const panelFrag = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uSeed;
  uniform float uAmbient;
  uniform float uOpacity;
  uniform vec3 uInk;
  uniform float uFrost;
  uniform vec3 uFrostColor;
  varying vec2 vUv;
  void main() {
    vec4 tex = texture2D(uMap, vUv);
    float bx = min(vUv.x, 1.0 - vUv.x);
    float by = min(vUv.y, 1.0 - vUv.y);
    float m = min(bx, by);
    float edge = 1.0 - smoothstep(0.0, 0.012, m);
    float corner = (1.0 - smoothstep(0.0, 0.03, m)) * step(max(bx, by), 0.1);
    float scan = 0.88 + 0.12 * sin(vUv.y * 320.0);
    float sweepPos = fract(uTime * 0.05 + uSeed) * 1.5 - 0.25;
    float sd = (vUv.y - sweepPos) * 8.0;
    float sweep = exp(-sd * sd) * 0.16 * uAmbient;
    float fill = 0.07 + 0.05 * (1.0 - vUv.y);
    // El texto tira hacia la tinta del tema (blanco; en los claros, oscura).
    vec3 col = mix(uColor, uInk, tex.r * 0.55) * (0.9 + sweep * 2.0);
    float a = fill + tex.a * 0.9 * scan + edge * 0.55 + corner * 0.5 + sweep;
    // Cristal esmerilado (temas de fiesta): fondo opaco del color del cristal, texto encima.
    if (uFrost > 0.0) {
      float ink = clamp(tex.a * 1.2, 0.0, 1.0);
      col = mix(uFrostColor * (1.0 + sweep), mix(uInk, col, 0.25) * 1.15, ink);
      a = max(a, uFrost + edge * 0.3);
    }
    gl_FragColor = vec4(col, a * uOpacity);
  }
`

// ---------- Esfera de cristal del proyecto (brillo de borde) ----------
export const shellVert = /* glsl */ `
  varying vec3 vN;
  varying vec3 vView;
  varying vec3 vPos;
  void main() {
    vPos = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`

export const shellFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uTime;
  varying vec3 vN;
  varying vec3 vView;
  varying vec3 vPos;
  void main() {
    // pow() con base negativa da NaN, y el bloom lo extiende a toda la imagen (destello negro):
    // por redondeo, |dot| puede pasar de 1 en el centro de la esfera, así que se acota.
    float fres = pow(clamp(1.0 - abs(dot(normalize(vN), normalize(vView))), 0.0, 1.0), 2.4);
    float bands = 0.5 + 0.5 * sin(vPos.y * 22.0 - uTime * 1.2);
    float a = fres * 0.75 * uIntensity + 0.05 + bands * 0.025;
    gl_FragColor = vec4(uColor * (0.8 + fres * 1.2 * uIntensity), a);
  }
`

// ---------- Fondo (globo de red): solo se ve más allá de la oficina ----------
export const backdropVert = /* glsl */ `
  uniform float uSize;
  varying vec3 vWorld;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vec4 mv = viewMatrix * w;
    gl_PointSize = uSize * (300.0 / max(1.0, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`

/** uKind: 0 líneas, 1 puntos, 2 resplandor (textura). */
export const backdropFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uKind;
  uniform sampler2D uMap;
  varying vec3 vWorld;
  varying vec2 vUv;
  void main() {
    // Dónde cortaría el suelo la mirada hacia este punto: sobre la oficina no se dibuja.
    vec3 dir = normalize(vWorld - cameraPosition);
    float keep = 1.0;
    if (dir.y < 0.0) {
      vec3 hit = cameraPosition + dir * (-cameraPosition.y / dir.y);
      keep = smoothstep(13.0, 21.0, length(hit.xz * vec2(0.8, 1.0)));
    }
    float a = uOpacity * keep;
    if (uKind > 1.5) a *= texture2D(uMap, vUv).a;
    else if (uKind > 0.5) a *= smoothstep(0.5, 0.15, length(gl_PointCoord - 0.5));
    gl_FragColor = vec4(uColor, a);
  }
`
