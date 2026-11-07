# kywai — contexto para seguir trabajando desde cualquier sitio

Documento de traspaso: lo que hace falta saber para retomar el desarrollo de kywai en un chat nuevo, en otro
equipo o desde el móvil, sin depender de la memoria de ninguna conversación anterior. Complementa al
[README](../README.md) (la presentación) y al [MANUAL](MANUAL.md) (cada función en detalle).

Estado: **12–13 de octubre de 2026**. Rama de trabajo: `master`, publicada en GitHub (el Mac se actualiza desde ahí).

---

## 1. Qué es y quién lo usa

kywai es una app de escritorio (Electron + React + Three.js) que junta las suscripciones de IA que el usuario
ya paga (Claude Code, Codex CLI, Gemini CLI, Muse Code, un modelo local por Ollama…) en **un equipo de agentes**:

1. El usuario escribe lo que necesita en el chat.
2. **Hermes**, el coordinador, propone un plan (qué tareas y qué agente hace cada una).
3. El usuario lo aprueba (opcional: «pedir mi visto bueno a cada plan»).
4. Los agentes trabajan en la carpeta del proyecto, cada uno con su programa oficial y la sesión del usuario.
5. Los resultados llegan al chat como entregables; el espacio 3D muestra a cada robot trabajando.

Es **una sola persona usándola desde varios sitios** (no se comparte con más gente). Habla **español**: interfaz,
documentos y mensajes de commit.

Desde octubre de 2026 es también una **plataforma abierta**: no solo los agentes de fábrica; el usuario conecta los
programas de terminal que ya paga (catálogo de 28 contrastados con su documentación, entre ellos Qwen Code, Antigravity CLI, Rovo Dev, MiniMax Code
y Qoder CLI, + «Otro programa…»), puede
quitar agentes y elegir quién coordina (no tiene por qué ser Hermes).

---

## 2. Las piezas y cómo se actualiza cada una

| Pieza | Dónde corre | Qué es | Cómo se actualiza |
|---|---|---|---|
| **Servidor** («kywai principal») | Mac mini `mac-mini`, encendido 24/7, por Tailscale | La app de escritorio con el motor: lanza los agentes, guarda proyectos, sirve la web y la API móvil | ⋮ → «Buscar actualizaciones…» (descarga de GitHub, instala y reinicia) |
| **Escritorio** | Windows (este PC de desarrollo) / Mac | La misma app, con su propio motor | Igual que el servidor |
| **Cliente** | Otro Windows/Mac | App instalada que se conecta al servidor: ve sus proyectos, abre sus carpetas y archivos, sincroniza carpetas | La interfaz viene del servidor (se actualiza con él). La parte nativa (ventana y puente) se publica con `npm run publicar-cliente` y los clientes la bajan **del servidor** (⋮ → «Actualizar este equipo…») |
| **Navegador** | Cualquiera, por Tailscale | La misma interfaz servida por el servidor (`?t=<código>` en el enlace) | Con el servidor |
| **Órbita** | Móvil Android | App en Kotlin/Compose que habla con la API móvil v1 | Ajustes → Órbita → «Buscar actualizaciones» (la APK sale del Mac). Se publica con `publishOrbita` |

Reglas que se derivan de esto:

- Cambios en `src/renderer`, `src/main` o `src/shared` llegan al servidor, al navegador y a los clientes al
  actualizar el **servidor**. Solo lo que toca la parte nativa del cliente (`src/preload/client.ts`,
  `src/main/client.ts`, `src/main/clientConfig.ts`) o el empaquetado exige publicar e instalar de nuevo el cliente.
- Cambios en `android/` **no llegan** hasta publicar la APK en `android/release/` y que el Mac la sirva.
- Un cliente instalado antes del sistema de actualización por servidor hay que cambiarlo una vez a mano
  (instalador en `release/AI-Cowork-Setup-<versión>.exe`).

---

## 3. Mapa del código

```
src/
  shared/      contrato entre motor e interfaz (importado por main, renderer y tests)
    types.ts          todos los tipos (ChatMessage, Task, TraceEntry, WorkStep, TaskWork, CoworkApi…)
    work.ts           convierte el registro de una tarea en pasos para el chat (workSteps, totals, +/−)
    agentCatalog*.ts  catálogo de agentes conectables (cómo se lanza cada uno, cuenta, instalación)
    deliverables.ts   agrupación de entregables · music.ts, mobile.ts, defaults.ts …
  main/        el motor (proceso principal de Electron)
    orchestrator.ts   planificación, reparto, ejecución de tareas, mensajes de trabajo, avances
    agents/           un lector por programa (claude, codex, gemini, muse, ollama…) y generic.ts (catálogo)
    taskTrace.ts      registro paso a paso de cada tarea (workspace/traces, 30 días)
    progressFiles.ts  qué archivos nuevos merecen enseñarse en el chat mientras una tarea trabaja
    coordinatorGuide.ts  lo que Hermes sabe de kywai (se inyecta en cada planificación) + test
    projectBrief.ts   ficha automática de la carpeta del proyecto para el coordinador (README, pruebas, árbol) + test
    agentSessions.ts  última sesión de CLI de cada agente por proyecto, para retomarla en continuaciones y correcciones + test
    routines.ts       rutinas por proyecto: peticiones que se lanzan solas (horario, webhook /hooks/…, carpeta) + test
                      (lo puro —próxima hora, «/rutina …»— está en shared/routines.ts)
    checkpoints.ts    instantáneas de la carpeta por tarea (repo git en la sombra), diff, deshacer y copias aparte + test
    inbox.ts          bandeja «Te necesita» (avisos con botones, inbox.json, evento inbox.updated)
    uiShots.ts        capturas de la web (escritorio y móvil) y errores de consola para el verificador + test
    coworkMcp.ts      servidor MCP «ai-cowork» para Claude (memoria, equipo, preguntas, habilidades) + test
    skills.ts / repoInstructions.ts   habilidades compartidas (workspace/habilidades) y AGENTS.md/CLAUDE.md/GEMINI.md
    macPermissions.ts ventanas de permisos de macOS pendientes (van a «Te necesita»)
    webServer.ts / mobileApi.ts / mobileBackend.ts   acceso web, API `/api/call/*`, `/api/fs/*`, API móvil v1
    devices.ts        registro de dispositivos emparejados, llaves por dispositivo, registro de accesos
    client*.ts, sync*.ts, serverFiles.ts   modo cliente, explorador del servidor, sincronización de carpetas
    selfUpdate.ts, updater.ts, orbitaRelease.ts   actualizaciones (GitHub, cliente, APK)
    secrets.ts, keys.ts   claves de API de agentes, cifradas con el llavero del sistema
    __checks__/       pruebas sin red del motor con CLIs falsos
  preload/     index.ts (escritorio) y client.ts (cliente instalado): dos puentes `window.cowork`
  renderer/src/
    ui/        left/ (chat: Messages.tsx), header/, files/, setup/ (asistente, añadir agente), trace/, space/…
    scene/     espacio 3D (Three.js)
    store/     estado (datos reales y demo separados) · lib/ utilidades (api, audio, rutas locales…)
android/       Órbita (Kotlin + Compose + Robolectric); release/ lleva orbita.apk y orbita.json
docs/          MANUAL.md, GUIA-MODELOS.md, mobile-api/openapi.json (contrato de la API móvil)
scripts/       instalar/actualizar en Mac, accesos de Windows, publicar-cliente.mjs
workspace/     datos locales (config.json, projects/…): NO está en git
```

### Cómo viaja una petición

`chat` → `orchestrator` (planifica con el coordinador) → plan aprobado → tareas (en paralelo si no dependen) → cada
tarea lanza el **programa de terminal** del agente con el texto del encargo por stdin/archivo (nunca en la línea de
órdenes) → su salida se lee en un `TraceUpdate` → `taskTrace` lo guarda y lo emite → `workSteps` lo resume en el
mensaje de la tarea (se actualiza como mucho una vez por segundo) → el chat lo pinta.

Al terminar una tarea que cambió archivos, `verifyTask` (orchestrator) la hace comprobar por un agente de otra
familia en modo de solo lectura y, si ve fallos, el autor corrige una vez en su misma sesión del CLI; al acabar un
plan de varias tareas, `finalAnswer` hace que el coordinador redacte la respuesta al usuario con todos los
resultados delante.

Mientras la tarea corre, `watchProgress` (orchestrator) mira cada 12 s los archivos nuevos del proyecto y las
imágenes que el agente abre (aunque estén fuera, p. ej. `/tmp`: se copian a la carpeta interna `avances/`) y los
añade al mensaje como un paso `files`.

### El mensaje de una tarea (tres niveles)

`TaskWork { taskId, title, status, steps[], hidden?, totals? }`. Pasos: `note` (frase), `tools` (grupo con `items`,
`refs` —id de la entrada del registro, resultado, líneas +/−—, `failed`, `add`, `del`) y `files` (capturas y
documentos). La interfaz lo enseña **plegado** (frase de ahora + resumen con flecha), **desplegado** (todos los
pasos) y **cada herramienta** (detalle: comando, diff coloreado, resultado, pedido al registro de la tarea con
`getTaskTrace` / `GET /tasks/{id}/trace`). Está en `Messages.tsx` (escritorio/web/cliente) y `WorkCards.kt` (Órbita).

---

## 4. Cómo trabajar

### Escritorio / motor

```bash
npm install
npm run dev            # app de escritorio en desarrollo
npm run web            # solo la interfaz en el navegador (localhost:5199), siempre en modo Demo
npm run typecheck      # node + web
npx vitest run         # ~350 pruebas
npm run dist:win       # instalador de Windows (release/)
npm run publicar-cliente -- --servidor <ip> --codigo <código>   # publica el cliente en el servidor
```

### Android (Órbita)

```bash
cd android
export JAVA_HOME="C:/Users/usuario/AppData/Local/Programs/Temurin/jdk-21.0.12.1+1"   # JDK 21 de este PC
./gradlew :app:testDebugUnitTest --offline    # pruebas (Robolectric, sin emulador)
./gradlew :app:publishOrbita --offline        # firma y publica android/release/orbita.apk + orbita.json
```

El `versionCode` es el **número de commits** de git, y nunca menos que el de `android/release/orbita.json` + 1 (el repositorio público tiene poco historial): nunca se publica con `-PorbitaVersionCode` (eso es solo para
pruebas en emulador). Tras publicar, se commitea `android/release` junto con el código.

### Después de cambiar algo

1. `npm run typecheck` y `npx vitest run` en verde (y los tests de Android si se tocó `android/`).
2. Si cambia la API móvil: actualizar `docs/mobile-api/openapi.json` (lo valida `mobileApi.test.ts`).
3. Si cambia lo que Hermes debe saber o cómo reaccionar: `src/main/coordinatorGuide.ts` + test.
4. Documentar la función en `docs/MANUAL.md` (el README solo cambia con titulares nuevos).
5. Si se tocó Android: al subirlo a `master`, GitHub Actions («Publicar Órbita») compila, firma y sube la APK solo; no hace falta `publishOrbita` a mano (desde el PC sigue valiendo).
6. Un commit por mejora, `git push` a `master` sin esperar a que lo pidan.

---

## 5. Reglas del repositorio y del usuario

- **Commits** en español, largos y descriptivos (mira `git log`), terminados con la línea
  `Co-Authored-By: <modelo> <noreply@anthropic.com>`.
- **Subir siempre al terminar una mejora**: el Mac se actualiza desde GitHub; lo que no se sube no le llega.
- **Varias sesiones editan el repo a la vez.** Nunca `git add -A` ni `git add src`: se añaden los archivos
  **uno a uno por ruta**. Antes de commitear: `git branch --show-current` debe ser `master` y `git status` se
  revisa; lo modificado que no es tuyo se deja y se avisa. Si otra sesión cambió de rama el árbol común, se
  commitea desde un `git worktree` temporal.
- **README = presentación; MANUAL = funciones en detalle** (con su índice). Mantener la sección «Instalar» del
  README: `selfUpdate.ts` envía ahí a quien tiene que instalar a mano.
- **Lo que Hermes debe saber** va en `coordinatorGuide.ts`, no solo en la documentación.
- **Idiomas**: todo texto nuevo que vea el usuario pasa por `t('…')` (`@/lib/i18n` en la interfaz) o `tr('…')`
  (`@shared/i18n` en el motor) y lleva su traducción en `src/shared/i18n-en.ts` y en `i18n-pt.ts`, `i18n-fr.ts` e `i18n-zh.ts`; `i18n.test.ts`
  avisa si falta. Las
  instrucciones a los agentes siguen en español y llevan `replyLanguage()`. En Órbita, `t("…")` de
  `com.aicowork.remote.i18n` con la traducción en `I18nEn.kt`, `I18nPt.kt`, `I18nFr.kt` e `I18nZh.kt` (lo comprueba `I18nTest`). Ver «Idioma» en el MANUAL.
- **Seguridad**: el texto del usuario nunca va en la línea de órdenes de un agente; las claves de API se guardan
  cifradas con el llavero del sistema, solo en el servidor (nunca por web, API móvil ni `config.json`). El código de
  acceso (`?t=`) y las llaves de dispositivo no se escriben en documentos ni en commits.
- **Restricción de clientes**: por defecto un cliente ve el disco entero del servidor (es el propio dueño); hay un
  interruptor opcional para limitarlo a las carpetas de los proyectos y un registro de accesos. No hay permisos por
  dispositivo ni aprobación de emparejamiento (decisión del dueño: no se comparte con terceros).
- **Sincronizar carpetas**: ante conflicto se conservan las dos versiones; los borrados van a la papelera con aviso.

---

## 6. Trampas conocidas (te ahorrarán tiempo)

- **Shell de Windows**: el entorno usa Git Bash. Los scripts con barras invertidas (`\n`, `\\`) escritos en un
  heredoc salen estropeados. Para parches: crear el `.cjs` con la herramienta de escribir archivos y ejecutarlo con
  `node`. No hay Python.
- **Finales de línea**: casi todos los archivos son CRLF. Los parches deben leer, normalizar a `\n`, y volver a
  escribir con `\r\n` si el original lo era.
- **`tar` en Windows** resuelve al GNU de Git y no lee zip: usar `C:\Windows\System32\tar.exe`.
- **`quoteArg` de los agentes** solo admite letras/dígitos y `_.:-/=,@ `; el texto del encargo va siempre por
  stdin, archivo o una instrucción que apunta al archivo.
- **Los comandos que `cd` a otra ruta** pueden pedir permiso; mejor rutas absolutas.
- **Git worktrees/sesiones**: ver sección 5.
- **Cliente desactualizado**: si el usuario ve la interfaz antigua, casi siempre es el cliente instalado (versión de
  `release/`), no el servidor.

---

## 7. Qué se ha hecho (resumen por bloques)

- **Voces de los agentes** con volumen y silencio aparte de la música.
- **Dispositivos**: registro de equipos emparejados con llave propia, etiqueta del rol (servidor/cliente) en ⋮.
- **Cliente de escritorio**: se conecta al servidor, menú propio (sin barra nativa), se actualiza desde el servidor.
- **Explorador del servidor** (carpetas y archivos, zip, elegir carpeta del proyecto), registro de accesos e
  interruptor de restricción.
- **Sincronización completa de carpetas** (tres vías, dos versiones en conflicto, papelera).
- **Plataforma de agentes**: añadir/quitar, catálogo de 22 programas, «Otro programa…», elegir coordinador,
  DeepSeek vía Aider con clave de API cifrada (asistente → Sesiones).
- **Imágenes del chat** (rutas del servidor) visibles en servidor, cliente, navegador y Órbita.
- **Avances con imágenes**: capturas y documentos que el agente crea o abre salen en el chat mientras trabaja.
- **Mensaje de tarea en tres niveles** (frase de ahora → todo lo que hizo → detalle de cada herramienta).
- **Órbita** en 1.87 con todo lo anterior.
- **Calidad por delante (13 oct 2026)**, tras el análisis de `analisis/optimizar-ai-cowork-calidad.md`: cada agente
  recibe el contexto completo (conversación, trabajo anterior, archivos, plan); ficha automática del proyecto para
  el coordinador (`projectBrief`); la calidad manda por defecto (esfuerzo medio/alto, sin interruptor); verificación
  por otra familia con una ronda de corrección; respuesta final redactada por el coordinador; paralelo solo si
  compensa; guía de Hermes más corta si no se habla de la app; 👍/👎 en cada resultado (va a la ficha del agente);
  los agentes retoman su sesión del CLI en continuaciones y correcciones (`agentSessions`); «a dos manos» con juez
  para entregables visuales (`twoHandsPlan`). Todo en el MANUAL.
- **Rutinas (13 oct 2026)**: pestaña Rutinas y `/rutina …`: peticiones que se lanzan solas a una hora, cada N horas,
  por webhook (dirección con secreto propio; GitHub firmado) o al cambiar archivos; nunca dos a la vez, una sola
  recuperación (con aviso) de las horas perdidas con la app cerrada, historial, API móvil `GET /routines` y
  `POST /routines/{id}/run`. Hermes las conoce y las sugiere para lo periódico.
- **Panorama de mejoras (13 oct 2026)**, del informe `analisis/mejoras-ai-cowork-panorama-2026.md` (el dueño: «todas
  menos Telegram/WhatsApp»): cambios por tarea con diff y «Deshacer» y copias aparte para tareas a la vez
  (`checkpoints.ts`); bandeja «Te necesita» en escritorio, web y Órbita con notificación; rutinas; verificador que
  abre la web y mira capturas (`uiShots.ts`); AGENTS.md para todos, habilidades compartidas y servidor MCP de AI
  Cowork; panel «Cómo rinde cada agente»; catálogo ampliado (Qwen Code, Antigravity, Rovo Dev, MiniMax, Qoder).

---

## 8. Pendiente e ideas (sin hacer)

- Probar de extremo a extremo con un **agente real** los avances con imágenes y el mensaje en tres niveles (hoy
  cubiertos con pruebas y con un mensaje simulado en el navegador).
- Probar con **agentes reales** lo de calidad: retomar sesiones (`codex exec resume` se implementó por su
  documentación: no había Codex en el PATH del Mac para comprobar la ayuda), la verificación, «a dos manos» y la
  respuesta final; y mirar en «Consumo y tokens…» cuánto suben el gasto y el tiempo.
- **👍/👎 desde Órbita** (hoy solo en el escritorio; la API móvil ya expone `rating`).
- Compilar y probar en el Mac la **bandeja de Órbita** (escrita sin SDK de Android) y publicarla desde el PC;
  dar el **servidor MCP** también a Codex (sus `-c` con comillas no pasan por la consola: haría falta otra vía).
- **Enlaces tocables** en el chat de Órbita (hoy solo se pintan imágenes).
- **Sincronización**: exclusiones editables y transferencias en paralelo.
- **DeepSeek-TUI**: se valoró, no se añadió (DeepSeek va por Aider con clave de API).
- **Cliente de Mac**: sigue actualizándose con `scripts/actualizar-mac.sh` (el sistema por servidor es solo Windows).
- Entradas del catálogo de agentes marcadas «sin comprobar» (alguna pieza de su documentación sin confirmar).

---

## 9. Cómo retomar el trabajo

**Con acceso al repositorio** (Claude Code en cualquier equipo):

```bash
git clone <repositorio de kywai> && cd "kywai"
npm install
git log --oneline | head -20      # qué se hizo último
```

Lee este documento, la sección que toque del `MANUAL.md` y el código del módulo. Antes de tocar nada:
`git status`, `git branch --show-current` y la regla de las sesiones concurrentes (sección 5).

**Sin acceso al repositorio** (un chat en la web o en el móvil): este documento es el contexto. Describe el cambio
con el archivo y la función afectados; el cambio real se aplica desde una sesión con el repo (la del PC o el Mac).

**Plantilla para empezar un chat nuevo:**

> Trabajamos en kywai (Electron + React + Three.js, con la app Android Órbita). Lee `docs/CONTEXTO-DEL-PROYECTO.md`
> y la sección relevante de `docs/MANUAL.md`. Hoy quiero: <qué>. Sigue las reglas del documento (commits por mejora,
> subir a master, archivos uno a uno, documentar en el MANUAL).
