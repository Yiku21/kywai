// Habilidades que trae kywai de serie: se copian una vez a la carpeta «habilidades» (las ven todos los agentes, como
// las tuyas). Si borras una, no vuelve: queda anotada en «.incluidas». Escritas por kywai, sin texto de nadie.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const UX_ANIMATION = `---
name: principios-ux-animacion
description: Úsala al hacer o repasar cualquier interfaz (web, app, escritorio, componentes, pantallas): 20 principios de movimiento y de usabilidad con números concretos para que se note hecha con cuidado.
---

# 20 principios de UX y animación

Aplícalos al diseñar, programar o revisar una interfaz. Cada uno dice qué hacer y con qué números. El movimiento
sirve para explicar qué pasa, nunca para adornar: si una animación no ayuda a entender, quítala.

## Movimiento (los 12 de la animación, aplicados a la interfaz)

1. **Aplastar y estirar.** Lo que se pulsa cede un poco: \`scale(0.96)\` al presionar y vuelve con un rebote corto
   (120–180 ms). Da sensación de peso. Nunca más de un 6 % en botones.
2. **Anticipación.** Antes de un movimiento grande, un gesto mínimo en sentido contrario (un panel que se va a la
   derecha retrocede 4–8 px antes). Prepara al ojo.
3. **Un foco a la vez.** En cada momento, una sola cosa se mueve o destaca; lo demás se queda quieto o se apaga
   (opacidad 40–60 %). Si entran varias, en cascada (30–60 ms entre una y otra).
4. **De pose a pose.** Define el estado inicial y el final y deja que la transición los una; no animes cada
   propiedad por separado. Anima solo \`transform\` y \`opacity\` (no \`width\`, \`top\` ni \`height\`).
5. **Inercia.** Las partes de un bloque no paran todas a la vez: el contenido llega 40–80 ms después que el contenedor
   (una notificación entra y su texto se asienta detrás).
6. **Entrar y salir suave.** Nada a velocidad fija: \`cubic-bezier(0.2, 0, 0, 1)\` para entrar (rápido y frena al
   llegar), \`cubic-bezier(0.4, 0, 1, 1)\` para salir. Lo que sale tarda menos que lo que entra (70–80 %).
7. **En arco.** Lo que viaja de un sitio a otro (un producto al carrito, un archivo a una carpeta) va en curva, no
   en línea recta.
8. **Acción secundaria.** Un detalle pequeño refuerza la acción principal: una chispa al guardar, la casilla que se
   marca con un trazo. Siempre más corto y más discreto que lo principal.
9. **Ritmo.** Duraciones: 100–150 ms para respuestas a un toque, 200–300 ms para paneles y menús, 300–500 ms para
   cambios de pantalla. Más de 500 ms se siente lento.
10. **Exagerar la respuesta.** Un error se nota de verdad: el campo tiembla (3 sacudidas de ±6 px en 300 ms), se pone
    en rojo y dice qué pasó y cómo arreglarlo, junto al campo.
11. **Volumen.** Profundidad con sombra y un poco de perspectiva (\`perspective: 700px\` en tarjetas que giran); lo que
    está más arriba proyecta más sombra.
12. **Atractivo.** Esquinas, sombras, colores y tiempos coherentes en toda la app: los mismos 3–4 valores de radio,
    sombra y duración en todas partes (variables de diseño).

## Usabilidad (leyes con números)

13. **Ley de Fitts.** Lo que más se usa, grande y cerca. Botones principales al alcance del pulgar en móvil y en las
    esquinas o bordes en escritorio.
14. **Zonas de clic más grandes.** El área táctil mínima es 44×44 px (aunque el icono mida 20 px): amplíala con
    \`padding\` o un pseudo-elemento. Separación mínima de 8 px entre dos zonas.
15. **Ley de Hick.** Cuantas más opciones, más se tarda en elegir: 3–5 visibles y el resto en «Más». Marca la
    recomendada.
16. **Ley de Miller.** La memoria corta guarda unas 7 cosas: agrupa (números de tarjeta en bloques de 4, teléfonos de
    3, menús en secciones de 5–7).
17. **Umbral de Doherty.** Responde en menos de 400 ms: si algo tarda más, enseña al momento que se ha recibido (estado
    pulsado, esqueleto, barra) y el progreso después. Interfaz optimista cuando sea seguro.
18. **Ley de Postel.** Acepta entradas desordenadas y devuelve limpio: fechas en cualquier formato razonable, espacios y
    guiones en teléfonos, mayúsculas en correos. Corrige tú, no le pidas al usuario que lo haga.
19. **Ley de Jakob.** La gente usa otras apps la mayor parte del tiempo: los patrones conocidos ganan (el logo lleva al
    inicio, Esc cierra, Ctrl/⌘+K busca, deslizar para borrar).
20. **Frecuencia de uso.** Cuanto más se usa algo, menos debe animarse: la paleta de órdenes, los menús de todos los
    días y el autocompletado aparecen al instante (0–80 ms). Las animaciones largas, para lo que se ve pocas veces
    (bienvenida, logro, primera vez).

## Siempre

- Respeta \`prefers-reduced-motion\`: sin desplazamientos ni rebotes, solo fundidos cortos o nada.
- Nada se mueve solo más de una vez sin que el usuario haga algo (sin bucles que distraigan mientras lee).
- El foco del teclado se ve siempre (anillo de 2 px con contraste) y el orden de tabulación sigue el visual.
- Comprueba a 60 fps: si una animación salta, quítale propiedades caras o hazla más corta.

## Cómo comprobar que salió bien

Recorre la interfaz y, para cada pantalla, mira: ¿cada toque responde en menos de 100 ms?, ¿hay una sola cosa
destacando?, ¿los errores dicen cómo arreglarlos?, ¿las zonas táctiles miden 44 px?, ¿lo que se usa a diario aparece
al instante?, ¿con movimiento reducido sigue funcionando todo? Lo que falle, arréglalo antes de entregar.
`

/** Las habilidades de serie: carpeta → SKILL.md. */
export const BUILTIN_SKILLS: Record<string, string> = {
  'principios-ux-animacion': UX_ANIMATION
}

const STAMP = '.incluidas'

/**
 * Copia a `dir` las habilidades de serie que aún no se copiaron nunca. Las que ya se copiaron una vez no se vuelven a
 * poner (si las borraste o las cambiaste, se respeta). Devuelve las que copió.
 */
export function seedBuiltinSkills(dir: string): string[] {
  if (!dir) return []
  const stamp = join(dir, STAMP)
  let done: string[] = []
  try {
    done = readFileSync(stamp, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
  } catch {
    /* primera vez */
  }
  const added: string[] = []
  for (const [name, text] of Object.entries(BUILTIN_SKILLS)) {
    if (done.includes(name)) continue
    const folder = join(dir, name)
    try {
      if (!existsSync(join(folder, 'SKILL.md'))) {
        mkdirSync(folder, { recursive: true })
        writeFileSync(join(folder, 'SKILL.md'), text, 'utf8')
        added.push(name)
      }
      done.push(name)
    } catch {
      /* sin permiso: otra vez será */
    }
  }
  try {
    if (added.length || !existsSync(stamp)) writeFileSync(stamp, done.join('\n') + '\n', 'utf8')
  } catch {
    /* nada */
  }
  return added
}
