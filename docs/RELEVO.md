# kywai — documento de relevo para otro agente (GPT, Codex u otro)

> **Léelo entero antes de tocar nada.** Lo escribió Claude el 7 de noviembre de 2026 para que otro agente siga el
> trabajo sin romper lo que ya funciona ni pisar a las sesiones que trabajan a la vez. Complementa a
> [CONTEXTO-DEL-PROYECTO.md](CONTEXTO-DEL-PROYECTO.md) (mapa del código y forma de trabajar, sección 3 y 4) y al
> [MANUAL.md](MANUAL.md) (cada función en detalle). Si algo de aquí choca con el código, manda el código: compruébalo.

---

## 0. Las 15 reglas que no se rompen

1. **Todo en español**: interfaz, documentos, mensajes de commit y respuestas al dueño (una sola persona).
2. **Dos repositorios, los cambios van a los DOS**, a la rama `master`:
   - `Yiku21/kywai-original` (privado, con todo el historial; es el que usa el Mac mini servidor).
   - `Yiku21/kywai` (público, sin historial personal; publica la web kywai.app y las Releases con los instaladores).
   - Nombres antiguos `Yiku21/ai-cowork-original` y `Yiku21/ai-cowork`: GitHub redirige. **Nunca crees un repo con un
     nombre viejo** (rompería la redirección).
   - Un cambio se hace en el original y se pasa al público con `git format-patch -1` + `git am -3` (si falla,
     `git apply --reject` y arreglar a mano). No empujes el historial privado al público.
   - **Diferencias que existen hoy a propósito o pendientes** (no las «arregles» sin preguntar; ver §2.1).
3. **Nada personal en el repo público**: ni el nombre del dueño ni de su equipo, ni sus rutas personales
   (se escribe «el dueño», `mac-mini`, `usuario`).
4. **Nunca escribas el código de acceso (`?t=…`), llaves de dispositivo, claves de API ni la IP del servidor** en
   código, documentos, commits ni mensajes.
5. **Un commit por mejora**, en español, descriptivo (mira `git log`). Terminan con una línea `Co-Authored-By:` del
   modelo que lo hizo.
6. **Añade los archivos uno a uno por ruta.** Nunca `git add -A`, `git add .` ni `git add src`: varias sesiones editan
   el mismo repo a la vez. Antes de commitear: `git status` y deja sin tocar lo modificado que no es tuyo.
7. **Sube enseguida** (`git push origin HEAD:master`): el Mac mini se actualiza desde GitHub y lo no subido no le
   llega. Antes, `git fetch origin master` y rebase/merge (no hay force push: está denegado).
8. **Antes de subir**: `npm run typecheck` sin errores y `npx vitest run` en verde. Hoy fallan **2 pruebas conocidas**
   de `src/main/serverFiles.test.ts` (zip) **solo en Linux** (el `tar` de Linux); en Windows/Mac pasan. Ninguna otra.
   Si tocas `android/`, también `./gradlew :app:testDebugUnitTest`.
9. **Todo texto nuevo que ve el usuario** pasa por `t('…')` (interfaz, `@/lib/i18n`) o `tr('…')` (motor,
   `@shared/i18n`) con su traducción en `src/shared/i18n-en.ts`, `i18n-pt.ts`, `i18n-fr.ts` e `i18n-zh.ts`
   (`src/renderer/src/lib/i18n.test.ts` falla si falta una). En Órbita, `t("…")` con `I18nEn/Pt/Fr/Zh.kt` (`I18nTest`).
   La clave es la frase en español; el español no necesita archivo.
10. **Documenta cada función** en `docs/MANUAL.md` (y una línea en CONTEXTO si añades un módulo). El README solo
    cambia con titulares nuevos y está en 5 idiomas (README.md inglés + README.es/pt/fr/zh.md).
11. **Lo que Hermes (el coordinador) deba saber** va en `src/main/coordinatorGuide.ts` (+ su test), no solo en docs.
12. **Si cambias la API móvil**: actualiza `docs/mobile-api/openapi.json` (lo valida `mobileApi.test.ts`) y la
    capacidad en `capabilities` (`src/main/mobileBackend.ts` / `src/shared/mobile.ts`).
13. **Los CLIs se lanzan por consola** (`src/main/agents/spawn.ts`, `quoteArg`): un argumento solo puede llevar letras,
    cifras, espacios y `_.:-/=,@`. JSON, comillas o el texto del encargo en la línea de órdenes **rompen todas las
    tareas** («terminó con un error (código ?)»; pasó el 13 oct). Configuración compleja → archivo; encargo → stdin
    o archivo. **Prueba con el CLI real** cualquier cambio en cómo se lanza un agente.
14. **La calidad prima sobre la velocidad** (decisión del dueño). Verificación por otro agente, una ronda de corrección,
    respuesta final del coordinador: es el comportamiento por defecto, no un interruptor. No lo quites para ir más
    rápido.
15. **No te hagas pasar por Claude Code** ni por otro producto ante sus servidores (riesgo de suspensión de la
    cuenta). Cada agente usa su CLI oficial con la sesión del dueño.

---

## 1. Qué es kywai

App de escritorio **Electron + React + Three.js** (y app Android **Órbita**, Kotlin/Compose) que junta los CLIs de IA
que el dueño ya paga (Claude Code, Codex, Gemini CLI, Muse, Qwen, LM Studio/Ollama local, Hermes Agent…) en **un equipo
de agentes**. El usuario escribe en el chat → el **coordinador** (Hermes por defecto) propone un plan → (visto bueno
opcional) → cada agente trabaja en la carpeta del proyecto con su CLI → otro agente verifica → el coordinador redacta
la respuesta. Un espacio 3D enseña a los robots trabajando.

Objetivo del dueño: «la aplicación definitiva de agentes de IA»: **dejar una tarea y volver a un resultado, nunca a
errores sin resultado**.

**Marca**: «kywai» en minúsculas, se pronuncia «ki-wai». Dominio **kywai.app** (Hostinger, GitHub Pages). Donaciones:
ko-fi.com (página de kywai) (Ko-fi renombrado a kywai). Logo: SVG en `/mnt/project-files/logo-nuevo/` (proyecto) y en la web.

**Lo interno sigue llamándose «AI Cowork» A PROPÓSITO. No lo renombres:**
- carpeta de datos fijada en «AI Cowork» por `src/main/dataDir.ts` (importado el primero en `index.ts`; sin él
  Electron usaría una carpeta «kywai» vacía y el dueño perdería todo);
- `appId` `com.aicowork.app` (Windows: misma clave de registro → sin instalación duplicada);
- paquete Android `com.aicowork.remote`;
- el certificado propio del Mac «AI Cowork (este Mac)» (macOS conserva los permisos);
- el texto firmado de las actualizaciones del cliente «AI Cowork cliente» (`publicar-cliente.mjs` y `releaseMessage`
  deben coincidir);
- `package.json` `name: ai-cowork` (pero `productName: kywai`).

---

## 2. Las piezas y dónde corren

| Pieza | Dónde | Notas |
|---|---|---|
| **Servidor** | Mac mini del dueño, 24/7, por Tailscale. Repo en `/Users/<usuario>/AI-Cowork` (clon de kywai-original, rama `master`) | Motor + web + API móvil. Las sesiones de Remote Control / control del ordenador de este proyecto corren AQUÍ, no en Windows. |
| **Escritorio de desarrollo** | PC Windows, `E:\AI Cowork`, Git Bash, CRLF, **sin Python** | Allí está la clave buena de firma de Órbita (`~/.gradle/gradle.properties` → `aicoworkSigning`). |
| **Cliente** | Otro Windows/Mac | Se conecta al servidor. Modo guardado en `client.json` en `%APPDATA%\AI Cowork`. Botón «Usar este equipo como servidor» lo devuelve a servidor. |
| **Navegador** | Cualquiera por Tailscale | La misma interfaz servida por el servidor (`?t=<código>`). |
| **Órbita** | Android (móvil y tableta) | Habla con la API móvil v1. APK en cada Release como `kywai-orbita.apk` y en kywai.app. |
| **Web pública** | kywai.app | Carpeta `web/` del repo **público**; `node web/build.mjs`; textos en `web/textos.mjs` (5 idiomas, el build falla si falta uno). Se publica sola con cada push a master del público. |

### 2.1 Diferencias entre los dos repos (comprobado con `diff -rq` el 7 nov)
- Solo en el público: `web/`, `.github/workflows/publicar-web.yml`, `docs/video/`, `docs/img/video-presentacion.gif`.
- Solo en el original: la **verificación con evidencia propia de pruebas** (`src/main/projectChecks.ts`,
  `src/shared/testEvidence.ts` + test, y sus cambios en `orchestrator.ts`, `types.ts`, `agentQuality.ts`,
  `QualityDialog.tsx`, `coordinatorGuide.ts`, diccionarios i18n y pruebas). **Pendiente de portar al público.**
- Algunas pruebas y documentos difieren solo por quitar datos personales en el público.
- `android/release/orbita.json`: el original va por la **1.27x** y el público por la **1.16x** (cada uno cuenta sus
  commits). Android no instala una versión menor encima: una APK del público no se instala sobre una del original. El
  servidor (Mac mini) sirve la del original; las Releases y kywai.app, la del público.
- Para comprobarlo tras un cambio: `diff -rq --exclude=.git --exclude=node_modules --exclude=web kywai kywai-original`;
  no deben aparecer diferencias nuevas aparte de estas.

### Trampas del Mac mini
- **El actualizador de la app resetea el repo local a `origin/master`** y aparta los commits sin subir en una rama
  `apartado/<fecha>`. Si trabajas allí, sube enseguida lo commiteado.
- **OmniRoute** (proveedor «omniroute» de Hermes) arranca con un LaunchAgent (`~/Library/LaunchAgents/com.omniroute.server.plist`,
  logs en `~/Library/Logs/omniroute.log`, usa node@22 de Homebrew; el node por defecto es la v26). **Solo Hermes usa
  OmniRoute**; Claude Code va directo a la cuenta del dueño (no vuelvas a poner `ANTHROPIC_BASE_URL` en
  `~/.claude/settings.json`). Si OmniRoute está apagado, Hermes da un error engañoso: «ImportError: The 'anthropic'
  package is required…».
- Gemini CLI no informa de cuota: se estima con un presupuesto.
- La `android/signing/release.jks` del Mac **NO** es la clave buena: nunca publiques Órbita con ella.

---

## 3. Mapa del código (lo esencial; el detalle en CONTEXTO §3)

```
src/shared/    contrato motor ↔ interfaz: types.ts (AppConfig, AgentConfig, Task, CoworkApi…), defaults.ts,
               i18n-*.ts, extensions.ts, routines.ts, mobile.ts, agentCatalog*.ts, setupTool.ts …
src/main/      el motor (proceso principal de Electron)
  index.ts            arranque + registro de TODOS los métodos (ver §4)
  orchestrator.ts     planifica, reparte, ejecuta, verifica, corrige, relevos, respuesta final
  agents/             un adaptador por CLI (claude, codex, gemini, hermes, muse, qwen, lmstudio, ollama, generic)
                      y spawn.ts (lanzamiento por consola, quoteArg, aviso a los 3 min de silencio)
  coordinatorGuide.ts lo que sabe Hermes
  extensions.ts / catalog.ts / plugins.ts / mods.ts / skills.ts   Extensiones (§6)
  routines.ts, templates.ts, inbox.ts, checkpoints.ts, usageLog.ts, quota*.ts
  webServer.ts / mobileApi.ts / mobileBackend.ts / mobileWebSocket.ts   web y API móvil v1
  devices.ts, client*.ts, sync*.ts, serverFiles.ts   emparejado, modo cliente, sincronización
  setup.ts            asistente: instala CLIs y herramientas (node, python/pipx, uv…) con su instalador oficial
  updater.ts, selfUpdate.ts, orbitaRelease.ts       actualizaciones
  secrets.ts, keys.ts claves cifradas con el llavero del sistema
  dataDir.ts          fija la carpeta de datos en «AI Cowork» (NO TOCAR)
src/preload/   index.ts (escritorio) y client.ts (cliente instalado): window.cowork
src/renderer/  React: ui/ (left/ chat, settings/ pestañas de Ajustes, sidebar…), scene/ (3D), store/, lib/
android/       Órbita: app/src/main/kotlin/com/aicowork/remote/… (ui/orbita/*.kt, data/, i18n/)
web/           landing kywai.app (solo en el repo público)
docs/          MANUAL.md, CONTEXTO-DEL-PROYECTO.md, RELEVO.md (este), mobile-api/openapi.json, mods/ (ejemplo)
scripts/       instalar/actualizar en Mac y Linux, firmar-mac.sh, publicar-cliente.mjs, accesos de Windows
.github/workflows/  publicar-escritorio.yml, publicar-orbita.yml (y publicar-web.yml en el público)
```

---

## 4. Cómo se conecta la interfaz con el motor (no lo rompas)

- `handle('nombre', fn)` en `src/main/index.ts` registra **a la vez** el IPC del escritorio (`cowork:nombre`) y el
  método web (`/api/call/nombre`, usado por la web y los clientes). `ipcMain.handle` a secas es **solo escritorio**
  (p. ej. `setupInstall`).
- Para añadir un método: tipo en `CoworkApi` (`src/shared/types.ts`) → `handle(...)` en `index.ts` → línea en
  `src/preload/index.ts` (`ipcRenderer.invoke('cowork:x', …)`) → si el cliente lo necesita, también
  `src/preload/client.ts` → si se usa desde Órbita, endpoint en la API móvil + openapi + capacidad.
- **Red**: el servidor escucha en **8787** (HTTP) y **8788** (HTTPS con certificado propio, el puerto siguiente;
  opcional Tailscale Serve para el micrófono), **solo en `127.0.0.1` y en la IP de Tailscale**, nunca en la red local.
  `npm run web` usa 5199 y es solo demo, sin motor.
- Cómo viaja una petición: `orchestrator.sendMessage` (expande `/rutina`, plantillas, órdenes de mods, `@Agente`) →
  el coordinador planifica (JSON) → visto bueno opcional → tareas (en paralelo si no dependen) → cada una lanza el
  CLI oficial con el encargo por stdin/archivo → `TraceUpdate` → `taskTrace` → `workSteps` lo resume en el chat →
  `verifyTask` (otra familia) → `finalAnswer`.
- Eventos al vivo: `events.ts` (`config.updated`, `templates.updated`, `inbox.updated`…) llegan por IPC y por WebSocket.
- **API móvil v1** (`/api/mobile/v1/...`): contrato en `docs/mobile-api/openapi.json`. Órbita mira `capabilities` para
  enseñar o esconder funciones (p. ej. `modPanels`, `usageCost`, `theme`, `templates`): un servidor
  viejo sin la capacidad no rompe el móvil nuevo. Al añadir una, nunca quites otra.

---

## 5. Configuración: cada parámetro

### 5.1 `workspace/config.json` (`AppConfig`, `src/shared/types.ts`; valores por defecto en `src/shared/defaults.ts`)

| Campo | Qué hace | Por defecto |
|---|---|---|
| `configVersion` | Versión del formato; `config.ts` migra las antiguas. Súbela solo con migración. | `CONFIG_VERSION` |
| `workspaceRoot` | Carpeta de datos de trabajo (proyectos, trazas, mcp por tarea…). | `''` → se calcula |
| `agents[]` | Los agentes (`AgentConfig`, ver 5.2). | `DEFAULT_AGENTS` |
| `stations[]` | Puestos del espacio 3D (`id`, `label`, `position`, `forSubagents`). | `DEFAULT_STATIONS` |
| `quotaGroups[]` | Grupos de cuota: `anthropic` (Claude), `openai` (GPT), `google` (Gemini), `meta` (Muse, presupuesto 20 solicitudes/5 h), `local` (ilimitado). | ver defaults |
| `thresholds` | Avisos de cuota: `warn` 20 %, `alert` 10 %. | `{warn:20, alert:10}` |
| `plannerOrder` | Quién coordina, en orden; si el primero no está, el siguiente. | `['hermes','claude','gemini','codex']` |
| `maxParallel` | Tareas a la vez. | `3` |
| `agentAccess` | Permisos de los agentes en la carpeta (`full`…). | `'full'` |
| `removedAgents` | Agentes de fábrica que el usuario quitó (no vuelven al actualizar). | — |
| `planApproval` | Enseñar el plan y esperar visto bueno. Las **rutinas no esperan** (cada una tiene su `askApproval`). | `true` |
| `setupDone` | Asistente completado en este equipo. | `false` |
| `language` | Idioma del motor y de las respuestas (`es`, `en`, `pt`, `fr`, `zh`). | español |
| `uiTheme` | Tema compartido por escritorio, web y Órbita (id de `lib/theme.ts`). Cada dispositivo puede usar uno propio (`aicowork.themeOwn` en localStorage; en Órbita prefs `ownTheme`/`localTheme`). | clásico |
| `serverName` | Nombre del ordenador que se ve abajo en la barra lateral. | nombre de red |
| `webAccess` | `{enabled, port (8787; HTTPS propio en port+1), restrictClients, token}`. `token` es el código de acceso: **no lo imprimas ni lo escribas**. | `{enabled:false, port:8787, token:''}` |
| `costs` | Uso y coste: `currency`, `usdToEur`, `plans` (por grupo o agente: `subscription`/`api`/`free`/`local`, `monthly`), `prices` (USD por millón de tokens), `monthlyBudget`, `budgetCurrency`, `budgetAlerted`. | — |

Se guarda con `saveConfig` y emite `config.updated`. Un fallo arreglado el 7 nov: el tema y `serverName` se perdían
al reiniciar; si tocas `config.ts`, comprueba que los campos opcionales sobreviven a la carga/migración.

### 5.2 `AgentConfig` (un agente)
`id`, `name`, `provider` (claude, codex, gemini, hermes, muse, qwen, lmstudio, ollama, generic…), `model`/`modelLabel`,
`lightModel`, `strongModel` (relevos de tareas difíciles van a un agente **fuerte**, nunca a un modelo local pequeño),
`color`, `avatar`, `stationId`, `role`, `strengths[]`, `avoid[]`, `enabled`, `quotaGroupId`, `plannerOnly`,
`modelProvider` (Hermes: p. ej. `omniroute`), `cli` (agentes del catálogo: cómo se lanzan), `thinking` (LM Studio:
«Razonamiento», apagado por defecto), `isSubagent`/`parentId`.

### 5.3 Otros archivos de datos
- `workspace/`: `projects/<id>/` (project.json, conversaciones, adjuntos, artefactos), `inbox.json` («Te necesita»),
  `habilidades/` (skills compartidas), `usage-runs.json`, `traces/` (30 días), `agent-sessions/`, `mcp/` (config MCP
  por tarea), `templates.json`, rutinas.
- **userData** (`AI Cowork`): `mcp-servers.json` (servidores MCP del usuario; claves cifradas), `agent-keys.json`
  (claves de API, cifrado con el llavero; **nunca** van por web, API móvil ni config.json), `devices.json`,
  `mobile-key`, `access-log.jsonl` (registro de accesos), `plugins.json` + `plugins/`, `mods/` + permisos de hooks,
  `templates.json`, `sync.json` + `sync-state/` (sincronización del cliente), `client-release/`, `source-dir.txt`
  (carpeta del código para «Buscar actualizaciones»), certificado web propio (`workspace/web-cert/`).
- **`client.json`** (userData): el **modo de esta instalación**:
  `{ mode: 'server' | 'client', server?: { origin, name, deviceId, token, encrypted }, lastOrigin? }`. Sin archivo, una
  instalación nueva pregunta; si ya hay `workspace/config.json`, es servidor. **El instalador no lo borra** (por eso un
  PC que fue cliente seguía de cliente). Si el servidor rechaza la llave, se olvida la llave y se guarda solo
  `lastOrigin`. El botón «Usar este equipo como servidor» (pantalla de conectar, sin conexión, Ajustes → Conexión, menú
  del Mac) lo vuelve servidor. El `token` va cifrado con el llavero si se puede: no lo imprimas.
- En desarrollo `workspace/` está en la raíz del repo y **no va a git**.

---

## 6. Extensiones (Ajustes → Extensiones) — lo último que hizo Claude

- **Habilidades** (`skills.ts`, carpeta `habilidades`): se listan a **todos** los agentes en el encargo (máx. 150).
  Catálogo: destacados, buscador de skills.sh, instalar desde enlace de GitHub (`catalog.ts`).
- **Servidores MCP** (`src/main/extensions.ts`): por agente, con chips. Al encender uno **se prueba de verdad**
  (initialize + tools/list); si falla queda apagado con el motivo. Cómo llega a cada CLI:
  - Claude: `--mcp-config <archivo>` + `--strict-mcp-config` (junto al MCP propio `coworkMcp.ts`).
  - Codex: `-c mcp_servers.<x>.command=<lanzador .sh/.cmd>` (el lanzador lleva el comando y las claves; nada de JSON
    en la línea).
  - Gemini: extensión `~/.gemini/extensions/kywai` (los «system settings» de Gemini solo valen si son de root).
  - **Hermes**: por tarea, `workspaceRoot/mcp/hermes-<tag>/config.yaml` (JSON, que es YAML válido) y
    `HERMES_MANAGED_DIR` apuntando ahí; Hermes lo mezcla encima de su `~/.hermes/config.yaml`. Los nombres se añaden a
    `-t` (solo en modo trabajo). **No se hace si existe `/etc/hermes` o ya hay `HERMES_MANAGED_DIR`** (no pisar una
    config gestionada). Requiere `hermes-agent[mcp]`. Probado con Hermes 0.19.
  - Qwen y Gemini se lanzan con `--allowed-mcp-server-names` limitado; los demás agentes salen en gris.
  - **Nuevo (7 nov)**: si la prueba falla porque falta `uvx` o `npx`, el resultado lleva `runtime: 'uv' | 'node'`
    (`mcpRuntimeFor` en `src/shared/extensions.ts`) y la tarjeta muestra «Instalar uv» / «Instalar Node.js».
    `installMcpRuntime(id)` usa `installTool` de `setup.ts` (uv con su instalador oficial en `~/.local/bin`, sin
    administrador) en el **equipo de los agentes** y vuelve a probar.
- **Plugins** (`plugins.ts`): formato de Claude Code (marketplaces `.claude-plugin/marketplace.json`; de serie
  `anthropics/claude-plugins-official` y `anthropics/knowledge-work-plugins`). Se bajan como `.tar.gz` de
  codeload.github.com. Skills/órdenes/subagentes → habilidades; `.mcp.json` → servidores **apagados** con campo
  `plugin`. Sin hooks, LSP, OAuth ni SSE.
- **Mods** (`mods.ts`, carpeta con `kywai-mod.json` en `userData/mods/<nombre>`; ejemplo `docs/mods/notas-rapidas`):
  - órdenes `/…` del chat (las de kywai ganan si coinciden);
  - hooks (request/task started/finished/failed) con permiso por hash y tiempo límite;
  - paneles: escritorio `cowork://mod/<mod>/<panel>`, web `/api/mod-panel/...`, ambos con **CSP propia + `sandbox
    allow-scripts allow-forms`** y `form-action 'none'; base-uri 'none'` (cierra la fuga por formulario POST que
    encontró Codex). No vuelvas a `srcdoc`: hereda la CSP de la app y los scripts no corren.
  - Órbita: ☰ → Más → Mods (`ui/orbita/PanelsMods.kt`, `GET /mods/panels` y `/mods/panel?mod=&id=`), WebView con
    `loadDataWithBaseURL("about:blank", …)`, puente `KywaiBridge` (`context()`, `send(text)` con confirmación). Si la
    página navega a otra URL, `onPageStarted` corta y quita el puente. **No relajes estas defensas.**
- Hermes sabe qué tiene cada agente (coordinatorGuide) y reparte o releva a quien tenga la herramienta.
- `mcp.config.json` de la raíz del repo es la config del PC Windows de desarrollo, **no** de la app.

---

## 7. Comportamiento del motor que no debes cambiar sin pedirlo

- **Verificación estricta** (tabla del dueño, 4 nov): solo un veredicto «CUMPLE» aprueba; sin veredicto se pide otra vez
  y si no, «sin verificar»; **hasta 2 correcciones por tarea** (el relevo no reinicia la cuenta), un relevo y luego
  «requiere intervención» en «Te necesita». En el simulador de pruebas del motor el verificador se reconoce por el texto
  literal del veredicto: **no pongas ese texto literal en `coordinatorGuide.ts`**.
- Verificación con evidencia propia de pruebas (de momento solo en el repo original, §2.1); se salta la revisión si la tarea no cambió archivos.
- kywai espera a Hermes hasta **6 min** y le pide planes escuetos (2 a 6 frases por tarea).
- **LM Studio** se enciende solo (`lms server start`) al arrancar, con ⟳/cuota/«Reiniciar» y antes de una tarea local;
  espera sin dar falsos «apagado».
- **«@Agente …» o «/directo Agente …»** manda el texto tal cual a ese agente, sin Hermes.
- **Rutinas** (PR #18 **FUSIONADO** en los dos repos el 7 nov): hora, cada N h, **una sola vez** (trigger `once`
  {date, time}: «mañana a las 7», «el viernes», «el 15/11», «dentro de 2 horas»; se desactiva sola al lanzarse),
  webhook (`/hooks/…` con secreto; GitHub firmado), carpeta; nunca dos a la vez; una sola recuperación de las horas
  perdidas con aviso.
  - `/rutina …` lo resuelve el **servidor** en `orchestrator.sendMessage`, antes que las plantillas y sin Hermes (por
    eso vale desde Órbita).
  - Visto bueno: `needsApproval(run)` = `askPlan` de la plantilla, `askApproval` de la rutina o `config.planApproval`
    en un chat normal. **Por defecto las rutinas no esperan visto bueno.**
  - Hermes puede devolver `"routine"` en su JSON → `ChatMessage.routineProposal` → tarjeta Crear rutina / Cambiar /
    Descartar (`decideRoutineProposal`). **Nunca la crea solo.**
  - API móvil: `GET /routines`, `POST /routines`, `/routines/{id}`, `/routines/{id}/delete`, `/routines/{id}/run`,
    `/messages/{id}/routine-proposal/(create|dismiss)`; capacidades `routines`, `routinesEdit`, `routineProposals`.
    **Nunca devuelve el secreto del webhook.** Órbita: `ui/orbita/PanelsRoutines.kt`, sección Rutinas en «Más»
    (sus traducciones van en una `partN` propia de cada `I18n*.kt`).
- **Plantillas de tareas** (`templates.ts`, `templates.json`): huecos `{pr}`, `{carpeta}`…, `/orden`, agente directo,
  visto bueno por plantilla, «Convertir en rutina».
- **Cambios por tarea** con diff y «Deshacer» (`checkpoints.ts`, repo git en la sombra); copias aparte si dos tareas
  tocan lo mismo.
- **Aviso de permisos de macOS** (`macPermissions.ts`) a «Te necesita»; aviso a los 3 min de silencio de un agente.
- **Uso y coste**: ⚙ → «Uso y coste…»; dinero por agente, «¿compensa la suscripción?», presupuesto de API con aviso.
  Hermes no informa tokens (va por OmniRoute): se estima.
- Música: YouTube con el reproductor oficial youtube-nocookie (con anuncios: es lo que lo hace legal), pestañas Audius
  y Radios (SomaFM). **openspot y Suno descartados** (ilegal / sin API y sus condiciones lo prohíben). No los añadas.
  SomaFM da 403 si la página viene de localhost (desde file:// suena).
- **Temas**: id en `lib/theme.ts`; grupos Mapas (`mundo-*`, `scene/worlds/`), Ciudad digital (Índigo, Frost Glass
  = id `orbita`, Perla, Ónix, Esmeralda, Neón, Ultravioleta: **los ids no cambian**) y Decorados. Se sincroniza por el
  servidor (`config.uiTheme`, `setUiTheme`, `POST /settings/theme`). Órbita solo toma los colores de los mapas (no sus
  escenarios). En la escena 3D **no uses `state.clock.elapsedTime`** (R3F lo pone a 0 al cambiar de frameloop): usa
  `registry.time` de `SceneClock` en `scene/World.tsx`.
- **Barra lateral y conversaciones** (`conversations.ts`, `ui/sidebar/`): varias conversaciones por proyecto (la
  abierta en `project.json`, las demás en `conversaciones/<id>.json` con sus sesiones de CLI); no se cambia de
  conversación mientras el equipo trabaja; bifurcar y mover no copian sesiones de CLI. Buscar (Ctrl+K) e Historial
  (`searchHistory`, `allConversations`, `GET /search`, `GET /chats/all`). Rueda ⚙ = menú corto + ventana de Ajustes
  (Ctrl+,) con pestañas.
- **Órbita**: cola **sin conexión** (mensajes y fotos guardados en `noBackupFilesDir`, salen en orden con WorkManager
  `OutboxWorker`; el servidor ignora repetidos por `clientMessageId`; aprobar plan, detener y los botones de «Te
  necesita» **siguen necesitando conexión, a propósito**). **Dictado**: un toque = reconocimiento del móvil en directo
  (`LiveDictation.kt`), mantener pulsado = nota de voz que el servidor pasa por Whisper. Botón de cámara con «Hacer una
  foto» / «Elegir de la galería» (el dueño **no** quiere «Desde archivos»: eso ya es el clip). Menú al mantener pulsado en
  proyectos y chats (`SidebarRows.kt`). Avisos de «Te necesita» solo con la app abierta o hasta 10 min en segundo plano.
- **Agentes gratis**: Kilo CLI está en el catálogo (modelo `kilo/kilo-auto/free`; sin ese modelo falla) con etiqueta
  «Gratis» y botón «Solo gratis». Gemini CLI ya no es gratis con cuenta de Google (desde jun 2026): solo con clave de
  AI Studio.

---

## 8. Publicación (lo hace GitHub Actions; no hace falta tocarlo)

- **Escritorio** (`publicar-escritorio.yml`, solo hace algo en el repo **público**): en cada push a master compila
  .exe, .dmg/.zip (arm64+x64, firma ad hoc), AppImage (x64+arm64) y crea la Release `v0.1.<nº de commits>` con
  `kywai-orbita.apk` adjunta. `updater.ts`: las apps de Releases buscan la última al abrir y cada 6 h; Windows y
  AppImage se instalan solas; Mac solo avisa (sin firma de Apple). El Mac mini compila la suya en local y se
  actualiza con «Buscar actualizaciones…» desde el repo original.
- **Órbita** (`publicar-orbita.yml`): pruebas, firma con los secretos `ORBITA_KEYSTORE_BASE64`, `ORBITA_KEYSTORE_PASSWORD`,
  `ORBITA_KEY_ALIAS`, `ORBITA_KEY_PASSWORD` (ya guardados en ambos repos), **compara el certificado con la APK anterior**
  y commitea `android/release/orbita.apk` + `orbita.json`. `versionCode = max(nº commits, publicado + 1)`;
  `versionName "1.N"`. Una APK con otra clave no se instala encima: nunca firmes con otra. Nunca publiques con
  `-PorbitaVersionCode` (solo para emulador). Se dispara con cambios en `android/**` (menos `android/release/**`).
  **Después de subir algo de Android, haz `git pull` antes del siguiente push**: el bot añade a master el commit
  «Órbita 1.N publicada automáticamente…». Un clon superficial cuenta mal los commits: `git fetch --unshallow`.
- El flujo del escritorio ignora `android/**`, `docs/**` y `*.md`: cambiar solo documentación no crea Release.
- **Web** (público): `publicar-web.yml` construye `web/` y publica en Pages con dominio kywai.app. `build.mjs` añade
  `?v=<hash>` a los recursos (sin caché vieja).
- **Cliente Windows instalado**: su parte nativa se publica con `npm run publicar-cliente` desde el PC (firma con
  `~/.ai-cowork/firma-cliente.pem` del PC).

---

## 9. Cómo trabajar (órdenes)

```bash
npm install
npm run dev            # escritorio en desarrollo
npm run web            # solo interfaz en el navegador (localhost:5199), modo Demo
npm run typecheck
npx vitest run         # ~690 pruebas; 2 de serverFiles fallan solo en Linux
npm run dist:win | dist:mac | dist:linux
cd android && ./gradlew :app:testDebugUnitTest   # Órbita (~10 min, ~190 pruebas, Robolectric)
```

- **Windows (PC del dueño)**: Git Bash; heredocs con barras invertidas salen mal (escribe un `.cjs` y ejecútalo con
  node); casi todo es CRLF; `tar` de Git no lee zip (usa `C:\Windows\System32\tar.exe`); no hay Python.
- **Android en un contenedor en la nube**: SDK en `/root/android-sdk` (`sdkmanager "platforms;android-35"
  "build-tools;35.0.0" "platform-tools"`, `sdk.dir` en `android/local.properties`, que está en .gitignore); Maven
  Central da 429 → init script en `~/.gradle/init.d/` que cambia repo.maven.apache.org por
  `https://maven-central.storage-download.googleapis.com/maven2/` (el proyecto usa FAIL_ON_PROJECT_REPOS: no añadas
  repos con allprojects); Robolectric necesita a mano `android-all-instrumented` 14-robolectric-10818077-i7 y
  15-robolectric-12650502-i7 en `~/.m2`. `captureToImage` no sirve en Órbita (el 3D nunca está quieto). Un
  `AlertDialog` con qualifiers de móvil (`w411dp`) se cuelga en Robolectric (`AppNotIdleException`): prueba los
  diálogos con `w1280dp-h800dp`.
- **Si fusionas master y chocan**: los `i18n-*.ts` suelen chocar porque todos añaden al final: quédate con las dos
  partes. `openapi.json`: toma la de master y vuelve a añadir tus rutas. `capabilities`: une las dos listas. **La
  unión automática vale solo para los diccionarios**: en código (p. ej. `App.tsx`) duplicó un import; revisa a mano.
- **Cliente desactualizado**: si alguien ve la interfaz vieja, casi siempre es el cliente instalado, no el servidor.
  Los textos de `src/main/client.ts` solo le llegan al republicar el cliente.
- **Codex**: `codex exec resume` se implementó por documentación, sin probar con el CLI real.

---

## 10. Pendiente (lo que queda abierto)

**Por probar en equipos reales (el código está en master):**
- Extensiones en el Mac mini: MCP de Hermes (instalar `hermes-agent[mcp]` si falta), paneles de mods en el móvil,
  botón «Instalar uv / Node.js» (Fetch MCP en el Mac decía «No se encontró uvx»: con el botón o con
  `curl -LsSf https://astral.sh/uv/install.sh | sh` y ⟳).
- Fluidez del 3D y temas nuevos; barra lateral plegada; chat con prioridad en ventana pequeña; uso y coste; rutinas;
  plantillas; Órbita sin conexión, cámara/galería, menú al mantener pulsado (falta probar en el móvil real).
- Linux en escritorio real y ARM; actualización entre dos versiones descargadas de Releases (Windows/Mac/AppImage).

- Órbita en el móvil real: rediseño (color del 3D por tema), plantillas, uso y coste, historial, paneles de mods y el
  panel de rutinas. **El dictado sí lo probó el dueño y funciona.**
- Con agentes reales: verificación con evidencia de pruebas, retomar sesiones de Codex, «a dos manos», avances con
  imágenes, rutinas propuestas por Hermes y rutinas de una sola vez.
- Descarga real de plugins (codeload) y actualización desde una versión anterior al renombrado (0.1.126).

**PR abiertos:** ninguno. Los #18 de rutinas están **fusionados** en los dos repos (7 nov).

**Ideas aprobadas o propuestas sin hacer:**
- Mejoras inspiradas en GG Framework (GG pasó a AGPL-3.0 el 4 nov: **reimplementa ideas, no copies código**):
  revisión automática de planes, avisar al agente de que nadie mira, informe de cierre, presupuesto por petición,
  banco de pruebas nocturno con agentes reales, detección de modelos locales. Hecho: verificación con evidencia propia.
- Portar al repo público la verificación con evidencia de pruebas (§2.1).
- Dar el servidor MCP propio de kywai (`coworkMcp.ts`) también a Codex (hoy Codex recibe los MCP del usuario, no el de kywai).
- Avisos de Órbita con la app cerrada (plan propuesto: servicio en primer plano por Tailscale, canales por tipo,
  Aprobar/Descartar en la notificación, título «Terminado» sin `tr()` en `runInbox`): esperando visto bueno.
- Lista completa de conversaciones en Órbita.
- Revisar precios no oficiales de Uso y coste (Gemini 3.8-flash, 3.5-flash-lite, gpt-6-sol).
- Copias de seguridad (zip con manifest, sin secretos, rotación 7 diarias + 4 semanales): plan propuesto, sin visto
  bueno.
- Hermes sin aprobaciones en el Mac (`approvals: mode: off` en su config, lo hace el dueño a mano).
- Enlaces tocables en el chat de Órbita; 👍/👎 desde Órbita; sincronización (exclusiones, paralelo); actualización
  por servidor del cliente Mac; capturas de Órbita por idioma para README/web (las saca el dueño).
- Avisos (notificaciones) de rutinas.

**Cosas que el dueño tiene que hacer (no tú):** `claude auth login` en el Mac mini; `git remote set-url origin
https://github.com/Yiku21/kywai-original.git` en el PC y el Mac; poner https://kywai.app en «Website» del About de
GitHub; dar «Acceso total al disco» a kywai en el Mac tras la versión con firma estable.

**Descartado (no lo propongas otra vez):** Telegram/WhatsApp, Suno, openspot, Jev (optimiza velocidad/coste),
DeepSeek-TUI (DeepSeek va por Aider), música local, suplantar a Claude Code.

---

## 11. Cómo hablar con el dueño

- Español, frases completas y sencillas; empieza por el resultado o por lo que necesitas de él.
- Pide permiso antes de lo que no se puede deshacer (producción, borrados, mensajes fuera del proyecto) y antes de
  cambiar configuración de sus equipos; pero en limpiezas obvias no le hagas elegir ítem por ítem.
- Cuando des una opción, recomienda una. Si algo no lo probaste en un equipo real, dilo.

## 12. Para empezar (pégalo en el primer mensaje del otro agente)

> Trabajas en kywai (Electron + React + Three.js, con la app Android Órbita). Antes de nada lee `docs/RELEVO.md`,
> `docs/CONTEXTO-DEL-PROYECTO.md` y la sección del `docs/MANUAL.md` que toque. Respeta las 15 reglas de RELEVO §0
> (dos repos, archivos uno a uno, un commit por mejora en español, typecheck y vitest antes de subir, i18n en 5
> idiomas, nada de secretos ni la IP). Hoy quiero: <qué>.
