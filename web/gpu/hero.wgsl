// Rejilla de puntos del héroe de kywai: una onda lenta la atraviesa y el puntero agranda los puntos de al lado.
// Es la «red de agentes» de la portada: casi todos los puntos son grises y unos pocos llevan los colores del logo.
// La salida va con el alfa premultiplicado y el lienzo es transparente: el fondo es el de la página.
struct Params {
  time: f32,
  aspect: f32,
  pointer: vec2f,
  dark: f32,
}
@group(0) @binding(0) var<uniform> params: Params;

fn hash21(p: vec2f) -> f32 {
  var q = fract(p * vec2f(123.34, 456.21));
  q += vec2f(dot(q, q + 45.32));
  return fract(q.x * q.y);
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let cells = 30.0;
  let p = vec2f(uv.x * params.aspect, uv.y) * cells;
  let id = floor(p);
  let f = fract(p) - 0.5;
  let t = params.time;

  let wave = sin(id.x * 0.21 - t * 0.5) + sin(id.y * 0.33 + t * 0.38) + sin((id.x + id.y) * 0.1 + t * 0.22);
  var size = 0.06 + 0.14 * smoothstep(-0.8, 2.2, wave);

  let near = distance(id + 0.5, vec2f(params.pointer.x * params.aspect, params.pointer.y) * cells);
  size += 0.18 * smoothstep(6.0, 0.0, near);

  let d = length(f);
  let aa = max(fwidth(d), 0.02);
  let dot_ = 1.0 - smoothstep(size - aa, size + aa, d);

  // Colores: gris azulado casi siempre; blue, green y orange del logo en unos pocos puntos.
  let h = hash21(id);
  var tint = select(vec3f(0.62, 0.68, 0.82), vec3f(0.36, 0.42, 0.58), params.dark < 0.5);
  var boost = 0.34;
  if (h > 0.93) {
    tint = select(vec3f(0.29, 0.57, 1.0), vec3f(0.06, 0.38, 0.85), params.dark < 0.5);
    boost = 0.95;
  } else if (h > 0.885) {
    tint = select(vec3f(0.12, 0.79, 0.52), vec3f(0.04, 0.56, 0.35), params.dark < 0.5);
    boost = 0.9;
  } else if (h > 0.855) {
    tint = select(vec3f(1.0, 0.54, 0.24), vec3f(0.79, 0.32, 0.04), params.dark < 0.5);
    boost = 0.9;
  }

  // Se apaga hacia el texto (izquierda) y hacia abajo, para que no estorbe a nada.
  let mask = smoothstep(0.34, 0.92, uv.x) * (1.0 - smoothstep(0.55, 1.0, uv.y));
  let a = dot_ * boost * mask;
  return vec4f(tint * a, a);
}
