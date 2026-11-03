package com.aicowork.remote.ui.space.gl

/**
 * Sombreadores GLSL ES 1.00. Los de la escena son los de `shaders.ts` del escritorio; los materiales de three.js
 * (estándar, básico) se aproximan con las mismas luces, entorno y niebla. Todo se calcula en espacio lineal y se pasa
 * a sRGB al final, como hace el escritorio con su composición de posprocesado.
 */
internal object Shaders {

    private const val FRAG_HEAD = """
        #ifdef GL_FRAGMENT_PRECISION_HIGH
        precision highp float;
        #else
        precision mediump float;
        #endif
        vec3 toSrgb(vec3 c) {
            c = clamp(c, 0.0, 1.0);
            return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
        }
        float hash11(float n) { return fract(sin(n) * 43758.5453123); }
        float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
    """

    /** Cabecera para usar `fwidth` si el dispositivo lo permite (si no, [DERIV_FALLBACK]). */
    const val DERIV_EXT = "#extension GL_OES_standard_derivatives : enable\n#define HAS_DERIV 1\n"
    const val DERIV_FALLBACK = "#define HAS_DERIV 0\n"

    // ---------- Material estándar (MeshStandard/MeshPhysical) ----------

    const val LIT_VS = """
        uniform mat4 uVP;
        uniform mat4 uModel;
        attribute vec3 aPos;
        attribute vec3 aNormal;
        varying vec3 vN;
        varying vec3 vW;
        void main() {
            vec4 w = uModel * vec4(aPos, 1.0);
            vW = w.xyz;
            vN = (uModel * vec4(aNormal, 0.0)).xyz;
            gl_Position = uVP * w;
        }
    """

    const val LIT_FS = FRAG_HEAD + """
        const float PI = 3.14159265;
        uniform vec3 uColor;
        uniform vec3 uEmissive;
        uniform float uMetal;
        uniform float uRough;
        uniform float uOpacity;
        uniform float uClear;
        uniform float uSheen;
        uniform float uEnvI;
        uniform vec3 uCam;
        uniform vec4 uPL[8];
        uniform vec3 uPLc[8];
        uniform int uPLn;
        uniform vec3 uFogColor;
        uniform vec2 uFog;
        uniform float uDesat;
        varying vec3 vN;
        varying vec3 vW;

        // Entorno de los visores (los Lightformer del escritorio): franja clara delante, azul a la izquierda,
        // anillo violeta arriba a la derecha y suelo violeta.
        float lobe(vec3 r, vec3 d, float rad, float rough) {
            float w = rad + rough * 1.1;
            return smoothstep(cos(w), cos(rad * 0.5), dot(r, d)) * (rad * rad) / (w * w);
        }
        vec3 envSpec(vec3 r, float rough) {
            vec3 c = vec3(0.69, 0.86, 1.0) * 1.3 * lobe(r, vec3(0.0, 0.5, 0.866), 0.45, rough);
            c += vec3(0.068, 0.15, 1.0) * 1.2 * lobe(r, vec3(-0.94, 0.31, 0.16), 0.4, rough);
            c += vec3(0.258, 0.147, 1.0) * 0.9 * lobe(r, vec3(0.65, 0.65, -0.39), 0.3, rough);
            c += vec3(0.323, 0.147, 1.0) * 0.6 * lobe(r, vec3(0.0, -1.0, 0.0), 1.0, rough);
            return c;
        }
        vec3 envDiff(vec3 n) {
            vec3 c = vec3(0.69, 0.86, 1.0) * 0.5 * max(dot(n, vec3(0.0, 0.5, 0.866)), 0.0);
            c += vec3(0.068, 0.15, 1.0) * 0.35 * max(dot(n, vec3(-0.94, 0.31, 0.16)), 0.0);
            c += vec3(0.258, 0.147, 1.0) * 0.09 * max(dot(n, vec3(0.65, 0.65, -0.39)), 0.0);
            c += vec3(0.323, 0.147, 1.0) * 0.9 * max(-n.y, 0.0);
            return c;
        }

        vec3 diffSum;
        vec3 specSum;
        float shin;
        void addLight(vec3 n, vec3 v, vec3 l, vec3 c) {
            float ndl = max(dot(n, l), 0.0);
            diffSum += c * ndl;
            vec3 h = normalize(l + v);
            specSum += c * ndl * pow(max(dot(n, h), 0.0), shin) * (shin + 8.0) / (8.0 * PI);
        }

        void main() {
            vec3 n = normalize(vN);
            vec3 v = normalize(uCam - vW);
            float ndv = clamp(dot(n, v), 0.001, 1.0);
            float rough = max(uRough, 0.04);
            shin = clamp(2.0 / (rough * rough * rough * rough) - 2.0, 2.0, 1024.0);
            diffSum = vec3(0.0);
            specSum = vec3(0.0);
            // Luces del escritorio: hemisférica, ambiental y dos direccionales.
            vec3 irr = mix(vec3(0.0015, 0.0018, 0.0103), vec3(0.0423, 0.0497, 0.3419), 0.5 * n.y + 0.5) * 0.8;
            irr += vec3(0.323, 0.381, 1.0) * 0.22;
            irr += envDiff(n);
            addLight(n, v, normalize(vec3(-7.0, 14.0, 9.0)), vec3(0.737, 0.776, 1.0) * 1.15);
            addLight(n, v, normalize(vec3(8.0, 6.0, -6.0)), vec3(0.202, 0.147, 1.0) * 0.4);
            for (int i = 0; i < 8; i++) {
                if (i >= uPLn) break;
                vec3 d = uPL[i].xyz - vW;
                float dist = length(d);
                float att = 1.0 / max(dist * dist, 0.01) * pow(clamp(1.0 - pow(dist / uPL[i].w, 4.0), 0.0, 1.0), 2.0);
                addLight(n, v, d / dist, uPLc[i] * att);
            }
            vec3 f0 = mix(vec3(0.04), uColor, uMetal);
            float fres = pow(1.0 - ndv, 5.0);
            vec3 r = reflect(-v, n);
            vec3 col = uColor * (1.0 - uMetal) * (irr + diffSum) / PI;
            col += specSum * mix(f0, vec3(1.0), fres);
            col += envSpec(r, rough) * (f0 + (max(vec3(1.0 - rough), f0) - f0) * fres) * uEnvI;
            // Capa transparente (visores de cristal y laca de los cuerpos).
            if (uClear > 0.0) {
                float cf = 0.04 + 0.96 * fres;
                col += uClear * cf * envSpec(r, 0.05) * 1.6;
                col += uClear * cf * specSum * 4.0;
            }
            col += uSheen * mix(uColor, vec3(1.0), 0.5) * pow(1.0 - ndv, 2.0) * 0.18;
            col += uEmissive;
            float g = dot(col, vec3(0.299, 0.587, 0.114));
            col = mix(col, vec3(g) * 0.7, uDesat);
            float f = smoothstep(uFog.x, uFog.y, length(uCam - vW));
            gl_FragColor = vec4(toSrgb(mix(col, uFogColor, f)), uOpacity);
        }
    """

    // ---------- Material básico (MeshBasic, con o sin textura) ----------

    const val BASIC_VS = """
        uniform mat4 uVP;
        uniform mat4 uModel;
        attribute vec3 aPos;
        attribute vec2 aUV;
        varying vec2 vUV;
        varying vec3 vW;
        void main() {
            vUV = aUV;
            vec4 w = uModel * vec4(aPos, 1.0);
            vW = w.xyz;
            gl_Position = uVP * w;
        }
    """

    const val BASIC_FS = FRAG_HEAD + """
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform sampler2D uTex;
        uniform float uUseTex;
        uniform vec3 uCam;
        uniform vec3 uFogColor;
        uniform vec2 uFog;
        uniform float uFogOn;
        varying vec2 vUV;
        varying vec3 vW;
        void main() {
            vec3 c = uColor;
            float a = uOpacity;
            if (uUseTex > 0.5) {
                vec4 t = texture2D(uTex, vec2(vUV.x, 1.0 - vUV.y));
                vec3 rgb = t.a > 0.001 ? t.rgb / t.a : vec3(0.0);
                c *= pow(rgb, vec3(2.2));
                a *= t.a;
            }
            float f = uFogOn * smoothstep(uFog.x, uFog.y, length(uCam - vW));
            gl_FragColor = vec4(toSrgb(mix(c, uFogColor, f)), a);
        }
    """

    // ---------- Pantallas holográficas de las estaciones ----------

    const val UV_VS = """
        uniform mat4 uVP;
        uniform mat4 uModel;
        attribute vec3 aPos;
        attribute vec2 aUV;
        varying vec2 vUv;
        void main() {
            vUv = aUV;
            gl_Position = uVP * uModel * vec4(aPos, 1.0);
        }
    """

    /** uMode: 0 código, 1 gráfico de barras, 2 documento, 3 maqueta de diseño, 4 lista/tabla. */
    const val HOLO_FS = FRAG_HEAD + """
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

            float bx = min(uv.x, 1.0 - uv.x);
            float by = min(uv.y, 1.0 - uv.y);
            float edge = 1.0 - smoothstep(0.0, 0.012, min(bx, by));
            float corner = (1.0 - smoothstep(0.0, 0.025, min(bx, by))) * step(max(bx, by), 0.12);
            float sweepPos = fract(uTime * (0.07 + uSeed * 0.03) + uSeed) * 1.6 - 0.3;
            float sd = (uv.y - sweepPos) * 9.0;
            float sweep = exp(-sd * sd) * 0.18 * uAmbient;

            a += content * (0.55 + 0.45 * uActive) + edge * 0.35 + corner * 0.5 + sweep;
            vec3 col = uColor * (0.78 + 0.45 * uActive) + vec3(sweep * 0.45);
            gl_FragColor = vec4(toSrgb(col), clamp(a * uOpacity, 0.0, 1.0));
        }
    """

    /** Paneles holográficos con texto (zonas y muros). */
    const val PANEL_FS = FRAG_HEAD + """
        uniform sampler2D uMap;
        uniform vec3 uColor;
        uniform float uTime;
        uniform float uSeed;
        uniform float uAmbient;
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
            vec4 tex = texture2D(uMap, vec2(vUv.x, 1.0 - vUv.y));
            float texR = tex.a > 0.001 ? tex.r / tex.a : 0.0;
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
            vec3 col = mix(uColor, vec3(1.0), texR * tex.a * 0.55) * (0.9 + sweep * 2.0);
            float a = fill + tex.a * 0.9 * scan + edge * 0.55 + corner * 0.5 + sweep;
            gl_FragColor = vec4(toSrgb(col), clamp(a * uOpacity, 0.0, 1.0));
        }
    """

    // ---------- Suelo con rejilla ----------

    const val WORLD_VS = """
        uniform mat4 uVP;
        uniform mat4 uModel;
        attribute vec3 aPos;
        varying vec3 vWorld;
        void main() {
            vec4 w = uModel * vec4(aPos, 1.0);
            vWorld = w.xyz;
            gl_Position = uVP * w;
        }
    """

    /** Se compila con [DERIV_EXT] o [DERIV_FALLBACK] delante. */
    const val FLOOR_FS = FRAG_HEAD + """
        uniform float uTime;
        uniform float uAmbient;
        uniform vec3 uFog;
        uniform vec3 uCam;
        uniform float uPx;
        varying vec3 vWorld;

        vec2 fw(vec2 q, float size) {
        #if HAS_DERIV
            return fwidth(q);
        #else
            vec3 d = vWorld - uCam;
            float k = uPx * length(d) / size;
            return vec2(k, k / max(abs(normalize(d).y), 0.2));
        #endif
        }

        float gridLine(vec2 p, float size, float w) {
            vec2 q = p / size;
            vec2 g = abs(fract(q - 0.5) - 0.5) / (fw(q, size) * w);
            return 1.0 - min(min(g.x, g.y), 1.0);
        }

        void main() {
            vec2 p = vWorld.xz;
            float d = length(p * vec2(0.8, 1.0));
            float fade = smoothstep(32.0, 6.0, d);
            vec2 cell = floor(p / 2.0);
            float h = hash21(cell);
            vec3 base = mix(vec3(0.016, 0.02, 0.058), vec3(0.03, 0.036, 0.09), h * 0.6);
            float seams = gridLine(p, 2.0, 1.2) * 0.5 + gridLine(p, 8.0, 1.6) * 0.35;
            float lit = step(0.9, h);
            float wave = sin(uTime * (0.16 + h * 0.3) + h * 40.0) * 0.5 + 0.5;
            vec2 local = fract(p / 2.0);
            float inner = smoothstep(0.0, 0.1, local.x) * smoothstep(0.0, 0.1, local.y) *
                          smoothstep(0.0, 0.1, 1.0 - local.x) * smoothstep(0.0, 0.1, 1.0 - local.y);
            float tile = lit * wave * wave * inner * uAmbient;
            vec3 line = vec3(0.2, 0.32, 0.95);
            vec3 col = base + line * seams * 0.2 * fade + vec3(0.25, 0.3, 1.0) * tile * 0.06 * fade;
            col += vec3(0.06, 0.16, 0.5) * smoothstep(8.0, 0.0, d) * 0.3;
            col += vec3(0.12, 0.05, 0.3) * smoothstep(6.0, 22.0, abs(p.x)) * 0.12 * fade;
            float far = smoothstep(20.0, 46.0, length(p * vec2(0.75, 1.0)));
            gl_FragColor = vec4(toSrgb(mix(col, uFog, far)), 1.0);
        }
    """

    // ---------- Ciudad (todos los bloques en una malla) ----------

    const val CITY_VS = """
        uniform mat4 uVP;
        attribute vec3 aPos;
        attribute vec3 aNormal;
        attribute vec3 aCenter;
        attribute vec3 aScale;
        attribute float aSeed;
        varying vec3 vLocal;
        varying vec3 vNormalL;
        varying vec3 vScale;
        varying float vSeed;
        varying vec3 vWorld;
        void main() {
            vLocal = aPos;
            vNormalL = aNormal;
            vSeed = aSeed;
            vScale = aScale;
            vec3 w = aCenter + aPos * aScale;
            vWorld = w;
            gl_Position = uVP * vec4(w, 1.0);
        }
    """

    const val CITY_FS = FRAG_HEAD + """
        uniform float uTime;
        uniform float uAmbient;
        uniform vec3 uFog;
        uniform float uFogNear;
        uniform float uFogFar;
        uniform vec3 uCam;
        uniform float uPx;
        varying vec3 vLocal;
        varying vec3 vNormalL;
        varying vec3 vScale;
        varying float vSeed;
        varying vec3 vWorld;

        void main() {
            vec3 n = vNormalL;
            float roof = step(0.5, abs(n.y));
            float sideX = step(0.5, abs(n.x));
            vec2 f = sideX > 0.5 ? vec2(vLocal.z * vScale.z, vLocal.y * vScale.y) : vec2(vLocal.x * vScale.x, vLocal.y * vScale.y);
            float h = vLocal.y + 0.5;
            vec3 base = mix(vec3(0.014, 0.017, 0.05), vec3(0.035, 0.042, 0.11), h);
            base *= sideX > 0.5 ? 0.7 : 1.0;
            vec2 size = vec2(0.26, 0.34);
            vec2 cell = floor(f / size);
            vec2 g = fract(f / size);
            float win = step(0.22, g.x) * step(g.x, 0.78) * step(0.28, g.y) * step(g.y, 0.72);
            float faceId = sideX + n.z * 2.0;
            float r = hash21(cell + vec2(vSeed * 37.0, faceId * 7.3));
            float on = step(0.7, r);
            vec3 wcol = r > 0.93 ? vec3(0.35, 0.95, 1.0) : r > 0.84 ? vec3(0.62, 0.42, 1.0) : vec3(0.28, 0.5, 1.0);
            float depth = length(vWorld - uCam);
        #if HAS_DERIV
            vec2 fwv = fwidth(f / size);
            float fwm = max(fwv.x, fwv.y);
        #else
            float fwm = uPx * depth / 0.26;
        #endif
            float detail = clamp(1.6 - fwm * 3.0, 0.0, 1.0);
            vec3 lit = mix(vec3(0.3, 0.48, 1.0) * 0.075, wcol * win * on, detail);
            float band = step(h * vScale.y, vScale.y - 0.22) * step(0.2, h * vScale.y);
            vec3 col = base + lit * band * (1.0 - roof) * 0.9;
            float top = smoothstep(vScale.y - 0.06, vScale.y, h * vScale.y) * (1.0 - roof);
            vec2 rf = abs(vLocal.xz) * 2.0;
            float rim = roof * max(smoothstep(0.9, 1.0, rf.x), smoothstep(0.9, 1.0, rf.y));
            vec3 edgeCol = mix(vec3(0.25, 0.45, 1.0), vec3(0.55, 0.35, 1.0), step(0.7, fract(vSeed * 13.0)));
            col += edgeCol * (top * 0.7 + rim * 0.55);
            col = mix(col, base * 1.4 + vec3(0.02, 0.03, 0.08), roof * (1.0 - rim));
            float fogF = smoothstep(uFogNear, uFogFar, depth);
            gl_FragColor = vec4(toSrgb(mix(col, uFog, fogF)), 1.0);
        }
    """

    // ---------- Circuitos del suelo ----------

    const val CIRCUIT_VS = """
        uniform mat4 uVP;
        attribute vec3 aPos;
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
            vWorld = aPos;
            gl_Position = uVP * vec4(aPos, 1.0);
        }
    """

    const val CIRCUIT_FS = FRAG_HEAD + """
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
            float core = 1.0 - smoothstep(0.15, 1.0, abs(vSide));
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
            vec3 col = base * (0.85 + (1.0 - filler) * 0.3 + motion * 1.05);
            gl_FragColor = vec4(toSrgb(col), clamp(a * fade, 0.0, 1.0));
        }
    """

    // ---------- Conexiones estación ↔ núcleo ----------

    const val TRACE_FS = FRAG_HEAD + """
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
            float period = 7.0 + uPhase * 5.0;
            float head = fract(uTime / period + uPhase);
            head = head * 1.4 - 0.2;
            float d = (s - head) * uLen;
            float pulse = exp(-d * d / 0.35) * uAmbient;
            float flow = 0.5 + 0.5 * sin((s * uLen * 2.2 - uTime * 5.0 * uDir));
            vec3 col = uBase * (0.55 + pulse * 1.3) + uActiveColor * uActive * (0.95 + 0.5 * flow);
            float a = 0.28 + pulse * 0.45 + uActive * (0.5 + 0.3 * flow);
            gl_FragColor = vec4(toSrgb(col), clamp(a, 0.0, 1.0));
        }
    """

    /** Arco de una transferencia entre agentes. */
    const val ARC_FS = FRAG_HEAD + """
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
            gl_FragColor = vec4(toSrgb(uColor * 1.35), clamp(a * uOpacity, 0.0, 1.0));
        }
    """

    // ---------- Esfera de cristal del núcleo ----------

    const val SHELL_VS = """
        uniform mat4 uVP;
        uniform mat4 uModel;
        uniform vec3 uCam;
        attribute vec3 aPos;
        attribute vec3 aNormal;
        varying vec3 vN;
        varying vec3 vView;
        varying vec3 vPos;
        void main() {
            vPos = aPos;
            vec4 w = uModel * vec4(aPos, 1.0);
            vN = (uModel * vec4(aNormal, 0.0)).xyz;
            vView = uCam - w.xyz;
            gl_Position = uVP * w;
        }
    """

    const val SHELL_FS = FRAG_HEAD + """
        uniform vec3 uColor;
        uniform float uIntensity;
        uniform float uTime;
        varying vec3 vN;
        varying vec3 vView;
        varying vec3 vPos;
        void main() {
            float fres = pow(clamp(1.0 - abs(dot(normalize(vN), normalize(vView))), 0.0, 1.0), 2.4);
            float bands = 0.5 + 0.5 * sin(vPos.y * 22.0 - uTime * 1.2);
            float a = fres * 0.75 * uIntensity + 0.05 + bands * 0.025;
            gl_FragColor = vec4(toSrgb(uColor * (0.8 + fres * 1.2 * uIntensity)), clamp(a, 0.0, 1.0));
        }
    """

    // ---------- Partículas ambientales ----------

    const val PARTICLE_VS = """
        uniform mat4 uVP;
        uniform vec3 uCam;
        uniform float uTime;
        uniform float uPixelRatio;
        uniform float uMotion;
        attribute vec3 aPos;
        attribute float aSeed;
        attribute float aSize;
        varying float vAlpha;
        void main() {
            vec3 p = aPos;
            float sp = 0.08 + aSeed * 0.18;
            p.y = mod(p.y + uTime * sp * uMotion, 9.0) - 0.5;
            p.x += sin(uTime * 0.07 * uMotion + aSeed * 31.0) * 0.6;
            p.z += cos(uTime * 0.05 * uMotion + aSeed * 17.0) * 0.6;
            gl_Position = uVP * vec4(p, 1.0);
            gl_PointSize = aSize * uPixelRatio * (16.0 / max(0.5, gl_Position.w));
            float tw = 0.55 + 0.45 * sin(uTime * (0.6 + aSeed) * uMotion + aSeed * 50.0);
            float edgeFade = smoothstep(-0.5, 0.6, p.y) * smoothstep(8.5, 6.0, p.y);
            vAlpha = tw * edgeFade * (0.35 + aSeed * 0.4);
        }
    """

    const val PARTICLE_FS = FRAG_HEAD + """
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
            vec2 c = gl_PointCoord - 0.5;
            float a = smoothstep(0.5, 0.0, length(c));
            gl_FragColor = vec4(toSrgb(uColor), a * a * vAlpha);
        }
    """

    // ---------- Fondo (globo de red): solo se ve más allá de la oficina ----------

    const val BACKDROP_VS = """
        uniform mat4 uVP;
        uniform mat4 uModel;
        uniform float uSize;
        attribute vec3 aPos;
        attribute vec2 aUV;
        varying vec3 vWorld;
        varying vec2 vUv;
        void main() {
            vUv = aUV;
            vec4 w = uModel * vec4(aPos, 1.0);
            vWorld = w.xyz;
            gl_Position = uVP * w;
            gl_PointSize = uSize * (300.0 / max(1.0, gl_Position.w));
        }
    """

    /** uKind: 0 líneas, 1 puntos, 2 resplandor (textura). */
    const val BACKDROP_FS = FRAG_HEAD + """
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uKind;
        uniform sampler2D uMap;
        uniform vec3 uCam;
        varying vec3 vWorld;
        varying vec2 vUv;
        void main() {
            vec3 dir = normalize(vWorld - uCam);
            float keep = 1.0;
            if (dir.y < 0.0) {
                vec3 hit = uCam + dir * (-uCam.y / dir.y);
                keep = smoothstep(13.0, 21.0, length(hit.xz * vec2(0.8, 1.0)));
            }
            float a = uOpacity * keep;
            if (uKind > 1.5) a *= texture2D(uMap, vUv).a;
            else if (uKind > 0.5) a *= smoothstep(0.5, 0.15, length(gl_PointCoord - 0.5));
            gl_FragColor = vec4(toSrgb(uColor), clamp(a, 0.0, 1.0));
        }
    """

    // ---------- Pantalla: etiquetas, barras y viñeta ----------

    const val SCREEN_VS = """
        attribute vec2 aPos;
        attribute vec2 aUV;
        varying vec2 vUV;
        void main() {
            vUV = aUV;
            gl_Position = vec4(aPos, 0.0, 1.0);
        }
    """

    /** uMode: 0 textura premultiplicada, 1 color liso, 2 viñeta (multiplica la imagen). */
    const val SCREEN_FS = """
        precision mediump float;
        uniform sampler2D uTex;
        uniform vec4 uColor;
        uniform float uMode;
        uniform vec2 uVignette;
        varying vec2 vUV;
        void main() {
            if (uMode < 0.5) {
                gl_FragColor = texture2D(uTex, vUV) * uColor.a;
            } else if (uMode < 1.5) {
                gl_FragColor = vec4(uColor.rgb * uColor.a, uColor.a);
            } else {
                float d = distance(vUV, vec2(0.5));
                float k = smoothstep(0.8, uVignette.x * 0.799, d * (uVignette.y + uVignette.x));
                gl_FragColor = vec4(vec3(k), 1.0);
            }
        }
    """
}
