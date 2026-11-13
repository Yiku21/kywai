# Manual de kywai

Todo lo que hace kywai, en detalle. Para una presentación rápida, ver el [README](../README.md).

El [vídeo de 30 segundos](https://kywai.app/es/#video) muestra un proyecto repartido entre varios agentes, cuatro escenarios y un prototipo funcionando dentro de la app, con música original y textos en inglés. Las tomas resumen distintas fases del trabajo. El MP4, la portada y los detalles de la grabación están en [docs/video](video/README.md).

kywai (se pronuncia «ki-wai»; web: https://kywai.app) se llamaba antes **AI Cowork**. El nombre nuevo sale en todo lo
que se ve: interfaz, avisos, Órbita, ventana, instalador de Windows (`kywai-Setup-<versión>.exe`, «kywai Setup»), sus
accesos directos, «Aplicaciones instaladas», `kywai.exe` y la app del Mac (`kywai.app`). Lo interno conserva el
antiguo para que las instalaciones que ya hay no pierdan nada: la carpeta de datos (`AI Cowork`, fijada en
`src/main/dataDir.ts` aunque la app se llame kywai), los identificadores (`com.aicowork…`, `ai-cowork`), el
certificado propio del Mac y el texto que firma las actualizaciones del cliente.

**Paso de «AI Cowork» a «kywai» al actualizar (noviembre de 2026):**
- **Windows:** el instalador reconoce la instalación anterior por su identificador (`com.aicowork.app`), así que la
  actualiza en la misma carpeta (`…\Programs\AI Cowork`, que no cambia de nombre) y no aparece duplicada. Los accesos
  directos «AI Cowork» pasan a llamarse «kywai» y el exe pasa a `kywai.exe`. Si estaba activado «Abrir kywai al
  iniciar sesión», la primera vez que se abre la versión nueva lo apunta a `kywai.exe` (`migrateWindowsLoginItem`).
  Un anclaje a la barra de tareas del exe viejo deja de funcionar: hay que volver a anclar kywai.
- **Acceso directo en el Escritorio (Windows):** el instalador lo crea siempre, también al actualizar
  (`createDesktopShortcut: "always"`): si se borró, la siguiente actualización lo vuelve a poner.
- **Mac (compilada en el equipo, como el Mac mini):** «Buscar actualizaciones» compila `kywai.app`, la deja en la misma
  carpeta que la instalada y quita la `AI Cowork.app` (`scripts/actualizar-mac.sh`, que también entiende la ruta vieja
  que le pasa una versión anterior). `instalar-mac.sh` hace lo mismo. Como el identificador y el certificado no
  cambian, macOS debería conservar los permisos de Privacidad; si vuelve a preguntar, se aceptan una vez. Si kywai
  estaba en el Dock, hay que volver a ponerlo.
- **Mac (descargada de la Release):** se arrastra `kywai.app` a Aplicaciones y se borra la `AI Cowork.app` vieja; los
  datos se conservan.

## Índice

- **[Puesta en marcha](#puesta-en-marcha)**
  - [Requisitos](#requisitos)
  - [Instalar en otro equipo](#instalar-en-otro-equipo)
  - [Abrir la app (este equipo, versión de desarrollo)](#abrir-la-app-este-equipo-versión-de-desarrollo)
  - [Actualizar y reiniciar](#actualizar-y-reiniciar)
  - [Acceso desde el móvil o el portátil (Tailscale)](#acceso-desde-el-móvil-o-el-portátil-tailscale)
  - [Dictado por voz](#dictado-por-voz)
- **[Cómo trabaja el equipo](#cómo-trabaja-el-equipo)**
  - [Reparto, modelos y permisos](#reparto-modelos-y-permisos)
  - [Respuestas rápidas: lo sencillo lo contesta el coordinador](#respuestas-rápidas-lo-sencillo-lo-contesta-el-coordinador)
  - [Lo que sabe el coordinador de kywai](#lo-que-sabe-el-coordinador-de-kywai)
  - [Tu visto bueno a cada plan](#tu-visto-bueno-a-cada-plan)
  - [«Te necesita»: lo que espera una decisión tuya](#te-necesita-lo-que-espera-una-decisión-tuya)
  - [Criterio de aceptación y archivos de cada tarea](#criterio-de-aceptación-y-archivos-de-cada-tarea)
  - [A dos manos: dos agentes, dos opciones y un juez](#a-dos-manos-dos-agentes-dos-opciones-y-un-juez)
  - [Los agentes retoman su sesión en las continuaciones](#los-agentes-retoman-su-sesión-en-las-continuaciones)
  - [Verificación por otro agente](#verificación-por-otro-agente)
  - [Cambios de cada tarea: verlos, deshacerlos y copias aparte](#cambios-de-cada-tarea-verlos-deshacerlos-y-copias-aparte)
  - [Valorar un resultado (👍/👎)](#valorar-un-resultado-)
  - [Lo que cuenta cada agente en el chat](#lo-que-cuenta-cada-agente-en-el-chat)
  - [Ver qué está haciendo un agente](#ver-qué-está-haciendo-un-agente)
  - [Respuesta final del coordinador](#respuesta-final-del-coordinador)
  - [Entregables en una carpeta](#entregables-en-una-carpeta)
  - [Reanudar lo interrumpido](#reanudar-lo-interrumpido)
  - [Reiniciar un agente que falla](#reiniciar-un-agente-que-falla)
  - [Hablar directamente con un agente (@Agente)](#hablar-directamente-con-un-agente-agente)
  - [Responder a un agente (que revise o continúe su respuesta)](#responder-a-un-agente-que-revise-o-continúe-su-respuesta)
  - [Preguntas de los agentes con opciones](#preguntas-de-los-agentes-con-opciones)
  - [Razonamiento (think) del modelo local](#razonamiento-think-del-modelo-local)
  - [El modelo de Hermes (/model)](#el-modelo-de-hermes-model)
  - [Muse (Meta)](#muse-meta)
- **[Proyectos, memoria y consumo](#proyectos-memoria-y-consumo)**
  - [Memoria e instrucciones del proyecto](#memoria-e-instrucciones-del-proyecto)
  - [AGENTS.md, habilidades y herramientas de kywai](#agentsmd-habilidades-y-herramientas-de-kywai)
  - [Extensiones: tus servidores MCP para los agentes](#extensiones-tus-servidores-mcp-para-los-agentes)
  - [Extensiones: catálogo de servidores MCP y de habilidades](#extensiones-catálogo-de-servidores-mcp-y-de-habilidades)
  - [Extensiones: plugins](#extensiones-plugins)
  - [Extensiones: mods](#extensiones-mods)
  - [Crear vídeos con solo pedirlo (/video)](#crear-vídeos-con-solo-pedirlo-video)
  - [Todas las órdenes al escribir / o @](#todas-las-órdenes-al-escribir--o-)
  - [Plantillas de tareas: lo que repites, con un toque](#plantillas-de-tareas-lo-que-repites-con-un-toque)
  - [Rutinas: peticiones que se lanzan solas](#rutinas-peticiones-que-se-lanzan-solas)
  - [Barra lateral y conversaciones](#barra-lateral-y-conversaciones)
  - [La rueda ⚙ y los Ajustes](#la-rueda--y-los-ajustes)
  - [Animaciones: la app responde a cada gesto](#animaciones-la-app-responde-a-cada-gesto)
  - [Buscar (Ctrl+K)](#buscar-ctrlk)
  - [Historial](#historial)
  - [Importar de otras apps](#importar-de-otras-apps)
  - [Eliminar un proyecto](#eliminar-un-proyecto)
  - [Cuotas](#cuotas)
  - [Consumo: ¿compensa?](#consumo-compensa)
  - [Uso y coste: dinero por agente](#uso-y-coste-dinero-por-agente)
  - [Cómo rinde cada agente](#cómo-rinde-cada-agente)
  - [Dónde se guardan las cosas](#dónde-se-guardan-las-cosas)
- **[Comodidades](#comodidades)**
  - [Un chat que se lee bien](#un-chat-que-se-lee-bien)
  - [Ancho del chat y ventanas pequeñas](#ancho-del-chat-y-ventanas-pequeñas)
  - [Idioma](#idioma)
  - [Temas](#temas)
  - [Voces de los agentes](#voces-de-los-agentes)
  - [Música (YouTube, Audius, radios y Spotifast)](#música-youtube-audius-radios-y-spotifast)
  - [Expresiones de los robots](#expresiones-de-los-robots)
  - [Modo Demo](#modo-demo)
  - [Rendimiento](#rendimiento)
  - [Apoyar kywai (donaciones)](#apoyar-kywai-donaciones)
- **[Para desarrolladores](#para-desarrolladores)**
  - [Desarrollo](#desarrollo)
  - [Comprobaciones](#comprobaciones)
  - [Estructura](#estructura)

## Puesta en marcha

### Requisitos

- Node.js compatible con las dependencias bloqueadas: `^22.22.2 || ^24.15.0 || >=26.0.0`.
  La revisión operativa se ejecutó con Node.js 24.18.0 y npm 11.17.0.
- Los CLIs con tu sesión iniciada (se usan tus suscripciones, no APIs):
  - **Claude Code**: `claude` → `/login`
  - **Codex CLI**: `codex` → inicia sesión con tu cuenta de ChatGPT
  - **Gemini CLI**: `gemini` (en este equipo está configurado con una clave de API)
  - **Muse Code** (Meta): `muse` → inicia sesión con tu cuenta de Meta (suscripción de Muse Code)
- **Ollama** para el agente local (Qwen). Descarga un modelo, por ejemplo:

  ```bash
  ollama pull qwen3:14b
  ```

### Instalar en otro equipo

#### Con una sola orden (lo más fácil)

Se pega una línea en una terminal y kywai queda instalada y abierta con la última versión de las Releases:

| Sistema | Dónde pegarla | Orden |
|---|---|---|
| Windows 10/11 | PowerShell | `irm https://kywai.app/install.ps1 \| iex` |
| macOS y Linux | Terminal | `curl -fsSL https://kywai.app/install.sh \| bash` |

- **En kywai.app, paso a paso** (`web/plantilla.html`, sección «Instálala en 3 pasos»): pestañas Windows, Mac y Linux (se abre
  sola la del sistema de quien mira; Windows si no se sabe). Cada una dice 1) cómo abrir la terminal (tecla Windows y
  «PowerShell»; ⌘ + Espacio y «Terminal»; Ctrl + Alt + T), 2) copiar con el botón y cómo pegar (clic derecho o Ctrl + V;
  ⌘ + V; Ctrl + Mayús + V) y pulsar Intro, y 3) qué se va a ver («Paso 1 de 3»… «Listo») y cuánto tarda. Debajo, tres
  desplegables: «¿Es seguro?», «¿Ha salido un error?» y «¿Y después?». Los textos están en `web/textos.mjs` (5 idiomas);
  si cambian los mensajes de los scripts, hay que cambiar también estos.

- Los scripts son `scripts/instalar-kywai.ps1` y `scripts/instalar-kywai.sh`. `web/build.mjs` los copia tal cual a la web como
  `install.ps1` e `install.sh`, y `publicar-web.yml` vuelve a publicar la web cuando cambian. Si se cambia un script, se cambia en
  `scripts/` (nunca en `web/dist/`).
- Los dos buscan la última versión en la API de GitHub y, si no responde (límite de peticiones sin cuenta), la deducen de la
  redirección de `releases/latest`. Con `KYWAI_VERSION=0.1.252` (o `$env:KYWAI_VERSION` en Windows) instalan una versión concreta.
- **Windows:** baja `kywai-Setup-<versión>.exe` a la carpeta temporal y lo ejecuta en silencio (`/S`): se instala para el usuario,
  sin permisos de administrador, con acceso directo en el Escritorio y en Inicio; si ya estaba instalada, se actualiza en la
  misma carpeta (la que guarda el registro). Luego abre kywai. Si kywai está abierta, pregunta «¿La cierro yo? [S/n]»
  (Intro = sí): la cierra (también de la bandeja) y sigue; si no se cierra, dice cómo hacerlo. El archivo es solo
  ASCII y los acentos van como `\u00e1` (Windows PowerShell 5.1 puede leer la descarga con otra codificación).
- **macOS:** elige Apple silicon o Intel (también desde un Terminal con Rosetta), baja el `.zip` de la Release, deja `kywai.app` en
  `/Applications` (o en `~/Applications` si no se puede escribir allí), le quita la cuarentena (`xattr -cr`) para que no salga «está
  dañada» y la abre. Si kywai está abierta, pregunta si la cierra (`quit app`, lee la respuesta de `/dev/tty`). Si sigue la antigua `AI Cowork.app`, lo dice (se puede borrar; los datos se conservan).
- **Linux** (x64 o ARM): deja el AppImage en `~/.local/share/kywai/kywai.AppImage` (nombre fijo, para que la actualización
  automática lo reemplace), el icono, la entrada del menú de aplicaciones y la orden `~/.local/bin/kywai`. Si falta libfuse2,
  intenta instalarla con sudo (apt, dnf, pacman o zypper); si no puede, la orden abre el AppImage con `APPIMAGE_EXTRACT_AND_RUN=1`
  (arranca algo más lento). Si el sistema restringe los espacios de nombres de usuario (Ubuntu 24.04…), añade `--no-sandbox`,
  porque dentro de un AppImage el ayudante chrome-sandbox no puede ser de root.
- Ninguno toca la carpeta de datos: se puede repetir la orden para reinstalar o actualizar.
- **Hablan claro, paso a paso** (lo mismo que dice la web): al empezar, «Esto tarda unos 2 minutos. No cierres esta ventana
  hasta que ponga «Listo»»; luego «Paso 1 de 3: buscando la última versión y descargándola», «Paso 2 de 3: instalando…»,
  «Paso 3 de 3: abriendo kywai» y al final «✓ Listo: kywai está instalada. Ya puedes cerrar esta ventana», con colores si es
  una terminal (sin colores con `NO_COLOR` o en un registro). Cada fallo dice en sencillo qué pasó y qué hacer (revisar la
  conexión, cerrar kywai…), recuerda que repetir la orden no rompe nada y enlaza al instalador de kywai.app. En Linux, antes
  de pedir la contraseña para libfuse2 explica que no se ve al escribirla. Solo español e inglés (según el idioma del sistema);
  la web en portugués, francés y chino cita los mensajes en inglés.
- Probado: Linux x64 en un contenedor (descarga la 0.1.255, instala, crea menú y orden, y la app abre con Xvfb), y la
  deducción de versión sin la API. Sin probar todavía en un Windows, un Mac ni un escritorio Linux reales.

#### Descargar la versión lista (GitHub Releases)

Con cada cambio en master del repositorio público, `.github/workflows/publicar-escritorio.yml` compila el instalador
de Windows (`.exe`), el de macOS (`.dmg` y `.zip`, Apple silicon e Intel) y el AppImage de Linux (x64 y ARM) y los
sube a una Release nueva, `v0.1.<número de commits>`, en https://github.com/Yiku21/kywai/releases/latest.

- **Se actualiza sola.** Esas versiones traen `app-update.yml` y, al abrirse (y cada 6 horas), buscan la última
  Release (`src/main/updater.ts`). En Windows y en el AppImage la descargan y, si llega en los primeros 5 minutos
  desde que se abrió, la instalan y la app se reabre sola; si llega más tarde, se instala al cerrar. **En el Mac igual**
  (desde el 10 nov 2026): como no va firmada por Apple, electron-updater no sabe reemplazarla, así que lo hace
  `src/main/macUpdate.ts`. Baja de la Release el `.zip` de su arquitectura (arm64 o x64), comprueba la huella sha512
  de `latest-mac.yml`, lo descomprime con `ditto` en una carpeta oculta junto a la app (`.kywai-actualizacion`) y un
  script aparte, cuando kywai se cierra, cambia la `.app` vieja por la nueva (si algo falla, deja la vieja), le quita la
  cuarentena y la reabre. Si la app trae `firmar-mac.sh` (va dentro desde esta versión), la nueva se firma con el
  certificado propio de ese Mac, para que macOS no vuelva a pedir los permisos en cada versión. Solo si la app está
  donde no se puede escribir (abierta desde el `.dmg`, «translocada» por macOS o en una carpeta sin permiso) avisa con
  «Descargar» y abre la página de la Release como antes. Las apps del Mac anteriores a este cambio aún abren la página:
  hay que descargar la nueva una última vez a mano.
- **Ventana de «Novedades»** (desde el 10 nov 2026, `src/main/whatsNew.ts` y `WhatsNewDialog.tsx`). La primera vez
  que kywai se abre después de actualizarse sale una ventana con las mejoras: el título de cada commit entre la versión
  que había y la nueva, del más nuevo al más viejo (como mucho 30, «y N cambios más»). En las apps de la Release los
  saca de GitHub (comparando las etiquetas `v0.1.<n>` del repositorio público) y trae «Ver en GitHub»; en las
  compiladas en el equipo, del clon de git. Se quitan las publicaciones automáticas de Órbita, las fusiones y las
  «versiones de prueba». Sale una sola vez por versión (al cerrarla queda apuntada en `novedades-vistas.json`, en la
  carpeta de datos); en una instalación nueva, en el navegador y en el asistente inicial no sale. Si no se sabe qué
  versión había (la primera vez que se abre una versión con esta ventana) pero kywai ya estaba configurado, sale igual
  con los últimos 12 cambios hasta la versión instalada («Estos son los últimos cambios»). Sin internet dice que
  no pudo cargar la lista. Los títulos de los commits se enseñan tal cual (en español): escríbelos pensando en quien
  usa la app. Para probarla en desarrollo: `AICW_WHATS_NEW=1`.
  **También en el navegador, el cliente de escritorio y Órbita:** el servidor guarda las novedades de su versión
  (`novedades-ultimas.json`) y las da con `latestWhatsNew` (web y cliente) y `GET /api/mobile/v1/server/news`
  (Órbita, capacidad `whatsNew`). Cada dispositivo apunta por su cuenta qué versión vio (el navegador en su
  `localStorage`, `kywai.novedades.vista`; Órbita en sus preferencias), así que cada uno la ve una vez aunque se
  conecte horas después. Si el servidor no pudo leer la lista de cambios, en esos dispositivos no sale.
- **«Buscar actualizaciones…»** en esas versiones no usa git: pregunta a GitHub y espera la respuesta. Dice la versión
  instalada y si es la última («Tienes la última versión (0.1.N), comprobado en GitHub») o si hay una nueva: en
  Windows, en el AppImage y en el Mac se está descargando y el botón «Instalar y reiniciar» la instala ya (o en cuanto
  termine de bajar); solo un Mac que no puede cambiarse solo muestra «Descargar», que abre la Release. Aunque quede anotado un clon de git de una instalación anterior con
  `instalar-linux.sh` o `instalar-mac.sh` (`source-dir.txt` en la carpeta de datos), la app de la Release lo ignora y
  se actualiza desde GitHub.
- **También en modo cliente.** Un Linux o un Mac con la app de la Release conectado a otro kywai busca igual su versión
  nueva en GitHub al abrirse y cada 6 horas (antes no lo hacía: «Buscar actualizaciones» mira el servidor, que estaba
  al día, y contestaba «Tienes la última versión» aunque este equipo fuera viejo). ⚙ → Ajustes → «Actualizar este
  equipo…» también pregunta a GitHub: dice la versión, y un segundo toque la instala y reabre (AppImage y Mac; abre la
  descarga solo si el Mac no puede cambiarse solo). Los clientes de Windows siguen actualizándose desde su servidor.
- **Sin firma de código:** Windows avisa con SmartScreen («Más información» → «Ejecutar de todas formas»). En el Mac
  va firmada «ad hoc»: la primera vez, clic derecho → Abrir; si dice que está dañada,
  `xattr -cr "/Applications/kywai.app"`.
- Las compiladas en el propio equipo (`instalar-mac.sh`, `instalar-linux.sh`, `npm run dist:*`) no traen
  `app-update.yml` y siguen actualizándose desde su clon de git. Es lo que usa el servidor (Mac mini).
- Las descargas de la Release se llaman `kywai-Setup-<versión>.exe`, `kywai-<versión>-<arch>.dmg/.zip` y
  `kywai-<versión>-<arch>.AppImage`, igual que lo compilado en el propio equipo (`npm run dist:*`). El servidor acepta
  para sus clientes de Windows tanto `kywai-Setup-*` como el nombre antiguo `AI-Cowork-Setup-*` (`clientRelease.ts`).
- El workflow solo corre en el repositorio público; en kywai-original no hace nada.
- **Órbita (Android) también está en la Release**, como `kywai-orbita.apk`: cada Release nueva adjunta la última APK
  firmada que hay en `master` (`android/release/orbita.apk`), y cuando sale una Órbita nueva «Publicar Órbita» la sube
  encima de la Release más reciente. Así, https://github.com/Yiku21/kywai/releases/latest/download/kywai-orbita.apk
  da siempre la última. Es la misma APK y la misma firma que reparte el servidor, así que después se actualiza sola
  desde el ordenador.
- **Nombres de los repositorios (desde el 7 nov 2026):** el público es `Yiku21/kywai` (antes `ai-cowork`/`Ai-cowork`) y el
  privado `Yiku21/kywai-original` (antes `ai-cowork-original`). GitHub redirige los nombres viejos, así que las apps ya
  instaladas y los clones con el remote antiguo siguen funcionando; no hay que crear nunca un repo con un nombre viejo.
  Para apuntar un clon al nombre nuevo: `git remote set-url origin https://github.com/Yiku21/kywai-original.git`.

Al abrir la app instalada por primera vez aparece el **asistente de configuración** (también desde
⚙ → Ajustes → «Configurar agentes…»):

1. **Agentes**: eliges cuáles usar (Hermes, Claude, Codex, Gemini, Muse y el agente local con LM Studio, Ollama o Colibri).
   Debajo, el recuadro plegable **«¿No pagas ninguna suscripción? Así puedes usar kywai gratis»** explica cómo
   montar un equipo sin pagar: «Ver los agentes gratis» abre el catálogo con «Solo gratis» (Kilo CLI primero, que ni
   siquiera pide cuenta), «Conseguir la clave» abre la página de la clave gratis de Google AI Studio (para Gemini) o
   la de OpenRouter (para que Hermes coordine con un modelo `:free`; se elige en «Sesiones» → «Configurar»), y
   recuerda que el agente local siempre es gratis.
2. **Programas**: comprueba si están sus CLIs y, si falta alguno, lo instala desde ahí con su instalador
   oficial (y Node.js si hace falta). En Mac no hace falta [Homebrew](https://brew.sh) (ningún Mac lo trae de
   serie): si no está, kywai baja los programas oficiales ya hechos para el procesador del Mac (Apple silicon o
   Intel) y los deja en tu carpeta de usuario sin pedir la contraseña. Node.js, de nodejs.org (comprobado con su
   SHA-256), en `~/.local/share/kywai/node` (Node 24, o Node 22 en un macOS anterior al 14) y añadido al PATH de
   `~/.zprofile`. Python 3.12, con uv, en `~/.local/bin`. Ollama, su `.zip` oficial a Aplicaciones, con la orden
   `ollama` en `~/.local/bin`. LM Studio, su `.dmg` a Aplicaciones (solo existe para Apple silicon; en un Mac Intel
   sale «Descargar»). Copilot, Crush, gptme y Rovo Dev, con sus instaladores oficiales, npm o uv. Si Homebrew está,
   se usa como antes, y el asistente solo lo enseña si ya está instalado (está en `src/main/macTools.ts`).
3. **Sesiones**: abre el inicio de sesión oficial de cada CLI en una ventana de terminal aparte (normalmente acaba
   en el navegador) y comprueba que quedó hecho. **La ventana va guiada** (`src/main/loginScript.ts`): empieza con
   «kywai · Conectar <agente>», los pasos de ese agente numerados, cómo se pega en esa terminal (clic derecho o Ctrl + V
   en Windows, ⌘ + V en Mac, Ctrl + Mayús + V en Linux) y que no se ve nada al escribir una contraseña; luego ejecuta la
   orden y al final dice «✓ Listo. Vuelve a kywai… Ya puedes cerrar esta ventana» o, si la orden falló, que se cierre y se
   vuelva a pulsar «Iniciar sesión». Se escribe como archivo en la carpeta temporal (`kywai-login/<agente>.sh` o `.cmd`; en
   Windows con `chcp 65001` y el texto escapado para cmd). Los pasos están en `src/shared/loginGuide.ts`: propios para
   Claude, Codex, Gemini (primero la clave de AI Studio), Hermes (OpenRouter si no pagas) y Muse, y unos generales para los
   del catálogo. El asistente enseña esos mismos pasos debajo del agente en cuanto se pulsa «Iniciar sesión». kywai no ve ni guarda contraseñas; para Gemini también puedes
   pegar una clave de API de Google AI Studio (gratis y sin tarjeta). Desde el 18 de junio de 2026, Google ya no deja
   usar Gemini CLI con una cuenta personal de Google sin pagar (la pasó a Antigravity CLI): con cuenta personal, usa
   la clave de AI Studio. Valen las claves de antes («AIza…») y las nuevas que crea AI Studio desde junio de 2026
   («AQ.…», con un punto). Si Gemini sigue con la sesión de Google, suele quedarse «pensando» sin dar error: a los
   3 minutos de silencio la tarea y «Te necesita» lo dicen y piden la clave, en vez del aviso de permisos.
   Si con la clave tampoco responde, mira en AI Studio «Límite de frecuencia»: a algunas cuentas les da cuota 0
   en el nivel gratuito. Una sesión ya conectada lleva un lápiz para **cambiarla**
   (otra cuenta, otra clave o, en Hermes, otro proveedor): abre el mismo inicio de sesión y, al volver a la app,
   se comprueba y enseña la nueva. En Gemini, dentro se cambia de cuenta con `/auth`.
4. **Listo**: resumen de lo que queda pendiente.

Los datos de cada equipo (configuración y proyectos) se guardan en la carpeta de datos del usuario
(`%APPDATA%\AI Cowork` en Windows, `~/Library/Application Support/AI Cowork` en Mac, `~/.config/AI Cowork` en Linux).

#### Windows

```bash
npm run dist:win
```

Genera `release/kywai-Setup-<versión>.exe`. Cópialo al otro PC y ejecútalo: te deja elegir la carpeta de
instalación y crea los accesos directos. Como no está firmado, Windows puede avisar («Windows protegió tu PC»):
«Más información» → «Ejecutar de todas formas».

#### Mac (se compila en el propio Mac)

```bash
npm run fuente
```

Genera `release/kywai-fuente.zip` con el código. Llévalo al Mac, descomprímelo y, en Terminal, dentro de esa
carpeta:

```bash
bash scripts/instalar-mac.sh
```

Pregunta dónde instalar (por defecto `/Applications`), compila la app para ese Mac (chip Apple o Intel), la
copia y la abre. Necesita Node.js: lo instala con Homebrew si está y, si no, baja el oficial de nodejs.org para ese
procesador a `~/.local/share/kywai/node`, como el asistente de la app.

**Firma en Mac.** Sin certificado de Apple, `scripts/firmar-mac.sh` firma la app con un certificado propio de ese
Mac, «AI Cowork (este Mac)», que crea la primera vez en un llavero aparte
(`~/Library/Application Support/AI Cowork/firma-local.keychain-db`, con su contraseña aleatoria al lado), sin
ventanas. Lo usan la instalación y cada actualización. Así macOS reconoce la app como la misma entre versiones y no
olvida sus permisos de Privacidad (Acceso total al disco, Automatización…).
Si algo falla, firma «ad hoc» como antes y avisa. Al pasar de la firma ad hoc a esta, macOS pide los permisos una
última vez.

**Claves guardadas en Mac (sin aviso del llavero).** El llavero de macOS solo recuerda «Permitir siempre» de verdad
para apps firmadas con una cuenta de desarrollador de Apple. Con la firma propia lo ata a la huella exacta de cada
compilación, y como kywai se compila de nuevo en cada actualización, volvía a pedir la contraseña del llavero para
«kywai Safe Storage» tras cada una. Por eso en Mac kywai ya no usa el llavero: cifra las claves de API de los
agentes, las de los servidores MCP y la llave del modo cliente con una clave propia (AES-256-GCM) guardada en
`clave-local.key` de la carpeta de datos, que solo puede leer tu usuario (`src/main/localCipher.ts`). Lo cifrado antes
con el llavero se lee una última vez (sale el aviso una vez más; pulsa «Permitir siempre» o escribe la contraseña) y
se vuelve a cifrar con la clave propia; después ya no se pide. Es algo menos seguro que el llavero: cualquier programa
que corra con tu usuario puede leer ese archivo. Si se borra, hay que volver a escribir esas claves. En Windows y
Linux sigue el cifrado del sistema.

#### Linux (se compila en el propio equipo)

Necesita Node.js 22 o más nuevo y git. Clona el repositorio (para que «Buscar actualizaciones» funcione) y, dentro
de la carpeta:

```bash
bash scripts/instalar-linux.sh
```

Compila la app para ese equipo (x64 o ARM), la deja en `~/.local/share/ai-cowork` (o donde elijas) sin pedir
administrador, la añade al menú de aplicaciones y crea la orden `ai-cowork` en `~/.local/bin`. Si el sistema
restringe el aislamiento de Chromium (Ubuntu 24.04 y otros), pide la contraseña para hacer de root el archivo
`chrome-sandbox` de la app; si no se puede, la app se abre con `--no-sandbox` y lo avisa. Probado en Linux x64.

En Linux:
- El asistente instala Node.js, Python (con pipx) y Ollama con el gestor de paquetes de la distribución (apt, dnf,
  pacman o zypper) y la ventana de contraseña del sistema (pkexec); en Debian y Ubuntu, Node.js LTS oficial. Hace
  falta un escritorio para esa ventana. LM Studio se descarga desde su web. Si la carpeta global de npm es de root,
  los CLIs que se instalan con npm van a `~/.npm-global`.
- El inicio de sesión de cada CLI se abre en la terminal del escritorio (`$TERMINAL`, `x-terminal-emulator`,
  GNOME, Konsole, Xfce, kitty, xterm…).
- «Abrir kywai al iniciar sesión» crea `~/.config/autostart/ai-cowork.desktop`.
- «Buscar actualizaciones» compila para Linux y cambia la carpeta instalada (`scripts/actualizar-linux.sh`).
- También se puede generar una AppImage con `npm run dist:linux` (`release/kywai-<versión>-<arch>.AppImage`);
  esa no se actualiza sola.
- Tailscale se busca en `/usr/bin/tailscale` o `/usr/local/bin/tailscale`.

### Abrir la app (este equipo, versión de desarrollo)

Usa el acceso directo **AI Cowork** del Escritorio o del menú Inicio. Si el código cambió desde la última vez
(porque lo editaste tú o tus agentes), primero verás «Actualizando kywai…» unos segundos y luego se abre.

Para volver a crear los accesos directos: `npm run accesos`. Para regenerar el icono: `npm run icono`.

**Logo (kywai).** El logo son tres gotas (azul `#207EFE`, naranja `#FE7C13`, verde `#08BA7D`) que giran juntas.
Los originales en vector están en `docs/img/logo/`: `kywai-simbolo.svg` (solo el símbolo, para tamaños pequeños),
`kywai-logo.svg` (símbolo y texto blanco, para fondo oscuro) y `kywai-logo-oscuro.svg` (texto oscuro, para fondo
claro). El icono de la app sale de `build/icono.svg`: tras cambiarlo, `npm run icono` rehace los PNG y el `.ico` en
cualquier sistema. La cabecera (`LogoMark.tsx`), el favicon de la web (`src/renderer/index.html`) y Órbita
(`res/drawable/logo_kywai.xml` y el icono adaptativo `ic_launcher_*`) llevan el mismo dibujo; si cambia el símbolo,
hay que actualizar los cuatro. La imagen de vista previa de GitHub se sube a mano en los ajustes del repositorio.

### Actualizar y reiniciar

- **Tus ajustes se quedan al actualizar y reiniciar.** Lo que eliges en este dispositivo (música, efectos y avisos,
  voces y su volumen, calidad del 3D, medidor, «Reducir efectos ambientales», tema propio, aspecto de los agentes,
  anchos de la barra y del chat, filtros…) se guardaba solo en el `localStorage` de la ventana, que a veces se perdía
  al actualizar o reiniciar. Ahora hay además una copia en la carpeta de datos, `ajustes-interfaz.json`
  (`src/main/uiSettings.ts`). El preload (`src/preload/uiSettings.ts`) la lee antes de que arranque la interfaz y, si
  el `localStorage` llega vacío o viejo, lo rellena; después manda al disco cada cambio (mira el `localStorage` cada
  segundo y al cerrar la ventana). Se copian las claves que empiezan por `aicowork.`, `ai-cowork.` o `kywai.`
  (`src/shared/uiSettings.ts`), así que los ajustes nuevos entran solos. La primera vez pasa al disco todo lo que ya
  tenías. Al cerrar, el motor escribe lo pendiente y pide a Chromium que guarde también su `localStorage`.
  «Reducir efectos ambientales» antes no se guardaba en ningún sitio: ahora se recuerda (`aicowork.reducedEffects`;
  si nunca lo tocaste, sigue lo que pida el sistema). El «Modo demo» sigue sin recordarse a propósito: kywai abre
  siempre con los agentes de verdad. En el navegador cada navegador guarda lo suyo, y el cliente de escritorio usa el
  `localStorage` de la dirección del servidor (no cambia al actualizar).
- **⚙ → «Buscar actualizaciones…»** compara con GitHub y, si hay cambios, los descarga, instala lo que haga
  falta, compila y reinicia. Si el código de ese equipo tiene cambios hechos allí (por ejemplo, por tus agentes),
  aparece **«Apartar cambios y actualizar»**: se guardan con `git stash` (no se borran; `git stash list` en la
  carpeta del código) y se actualiza. Si alguien hizo commits en ese equipo que no están en GitHub, también se
  apartan, en una rama `apartado/<fecha>`, y el código vuelve a ser el de GitHub. Y si el código descargado es
  más nuevo que la app instalada (por ejemplo, porque se subió desde ese mismo equipo sin recompilar), ofrece
  instalarlo: la app sabe con qué commit se compiló.
- **Aviso amarillo de actualización pendiente.** Cuando hay una versión nueva esperando, la rueda **⚙** del pie de la
  barra lateral brilla en amarillo (con un punto) y, al abrirla, la opción pasa a ser **«Actualizar kywai…»**, también
  en amarillo, con la versión o los cambios que hay. En Ajustes, la pestaña «Acerca de» y su fila de actualizar brillan
  igual. Cómo se entera cada instalación (`src/main/selfUpdate.ts` → `startUpdateWatch`/`updatePending`):
  - **Descargada de GitHub Releases (Mac, Windows, AppImage de Linux):** lo sabe el actualizador (`updater.ts`), que
    busca al abrir y cada 6 h; brilla mientras la nueva se descarga, cuando ya está descargada y cuando hay que bajarla
    a mano (Mac abierto desde el .dmg). No hace ninguna consulta extra a GitHub.
  - **Compilada desde su clon de git (el Mac mini):** hace `git fetch` al minuto y medio de abrir y cada 3 h; brilla si
    hay commits nuevos en GitHub o código descargado sin instalar.
  - **Cliente conectado al Mac mini y navegador:** la rueda brilla si el **servidor** tiene una actualización (lo
    reciben con el evento `update.pending` y lo preguntan cada 30 min). En el cliente de escritorio, además, se
    mira al minuto de abrir y cada 6 h si hay una versión nueva de **la app de este equipo**; si la hay, el menú ⚙
    muestra **«Actualizar este equipo…»** en amarillo (lleva a Ajustes → Acerca de).
  - Al pulsar «Comprobar de nuevo» el aviso se enciende o se apaga según lo que se vea; si no se pudo consultar
    GitHub, se queda como estaba. El color es `--update` (más oscuro en los temas claros).
- **Desde Órbita**: ☰ → Ajustes → Conexión → **Servidor** hace lo mismo en el servidor al que está emparejada. Al abrir
  Ajustes ya dice si hay cambios nuevos en GitHub (con los últimos títulos); «Actualizar el servidor» (pide
  confirmación) lo descarga, compila, instala y reinicia. Mientras tanto Órbita se queda sin conexión unos minutos y
  se reconecta sola; lo que estuviera trabajando queda en pausa para reanudarlo. Si el servidor tiene cambios hechos
  allí, el botón es «Apartar sus cambios y actualizar» (igual que arriba: se guardan en git, no se borran). Si la
  actualización falla, el servidor vuelve a su versión y «Ver cómo va» o la próxima consulta dicen por qué. El
  servidor tiene que tener ya esta función: la primera vez se actualiza desde el ordenador.
- **⚙ → «Reiniciar kywai»** (pulsa dos veces para confirmar) cierra y vuelve a abrir la app si se queda
  pillada; también desde el navegador del móvil, que se recarga solo cuando vuelve. Si la app está cerrada del
  todo, no hay nada que responda al enlace: hay que abrirla en el equipo.

### Acceso desde el móvil o el portátil (Tailscale)

Un equipo con kywai abierto (por ejemplo el Mac mini, encendido 24/7) puede servir la app a tus otros
dispositivos de Tailscale:

1. En ese equipo: ⚙ → Ajustes → «Acceso desde otros dispositivos…» → activa «Permitir el acceso por Tailscale».
2. Copia el **enlace de acceso** (`http://<ip-de-tailscale>:8787/?t=<código>`) y ábrelo una vez en el móvil o
   el portátil con Tailscale activo. Queda recordado; el código es tu llave (puedes cambiarlo y anular los
   enlaces anteriores).
   Cada enlace lleva encima su nombre y una línea con su uso: **Seguro (Órbita y micrófono)** es el `https://…:8788`
   que pide Órbita y deja grabar notas de voz (con Tailscale Serve activo pasa a ser **Seguro con Tailscale**,
   `https://….ts.net`, sin avisos del navegador); **Navegador por IP** es el `http://…:8787`, el más directo pero sin
   micrófono; y **Navegador por nombre del equipo** es el mismo con el nombre de Tailscale, que sigue valiendo si
   cambia la IP. El nombre se deduce de la propia dirección (`linkAbout` en `RemoteAccess.tsx`).
3. Para que esté siempre disponible: activa «Abrir kywai al iniciar sesión» y evita que el Mac se duerma
   (Ajustes del Sistema → Energía). Mientras el acceso está activo, kywai no se suspende.
4. Para dictar notas de voz desde otro dispositivo hace falta la versión `https://` (ver «Dictado por voz»):
   kywai la sirve siempre en el puerto siguiente (`https://<ip-de-tailscale>:8788`) con un certificado
   propio, y opcionalmente con Tailscale Serve («HTTPS para usar el micrófono desde el móvil»), que no da aviso.

**App del móvil (Android):** se empareja una vez con el código de 6 cifras de ese menú (o el código de acceso
entero) y queda emparejada para siempre, aunque kywai se reinicie o se actualice (la clave que firma su
acceso se guarda en `mobile-key`, en la carpeta de datos de la app). Para desemparejar todos los móviles, genera
un código de acceso nuevo.

En el chat de la app (y en «Nueva tarea») el micrófono, al lado de la cámara, tiene dos usos:

- **Un toque: dictado en directo.** El texto va saliendo en la caja mientras hablas, con el reconocimiento de voz
  del propio móvil y en el idioma de la app. Las pausas no cortan: sigue escuchando hasta que vuelvas a tocar el
  botón (sale un cuadrado y un anillo que crece con tu voz) o te calles un buen rato. Lo dictado se queda en la caja
  para corregirlo antes de enviar; si escribes a mano o envías mientras dictas, el dictado se para. Según el móvil,
  este reconocimiento puede usar los servidores de Google (Android decide); si quieres que nada salga de tu red,
  usa la nota de voz.
- **Mantener pulsado: nota de voz.** El móvil graba la nota, la envía al ordenador por Tailscale y este la pasa a
  texto con su propio dictado (Whisper, igual que el escritorio: sin servicios externos y el audio se borra). Al
  terminar se elige revisar el texto antes de enviarlo o enviarlo directamente.

Si el móvil no tiene reconocimiento de voz, un toque graba la nota de voz como antes. Si el dictado del móvil falla
(sin internet, o sin ese idioma), el aviso recuerda que puedes mantener pulsado para grabar una nota.

**Actualizar la app del móvil:** ☰ → Ajustes → Acerca de → **Órbita** → «Buscar actualizaciones». Al abrir Ajustes ya
dice si hay una versión nueva; «Instalar la versión …» la descarga del ordenador (por Tailscale, solo a móviles
emparejados), comprueba que es exactamente la anunciada y la instala encima: sigue emparejada. La primera vez
Android pide permitir que Órbita instale apps («Permitir de esta fuente»); después se instala sola, sin
preguntar. Órbita se cierra al instalarse: vuelve a abrirla. La versión sale del código de kywai
(`android/release/`, publicada con `./gradlew :app:publishOrbita` y firmada con la clave de siempre), así que
basta con actualizar kywai en el ordenador (⚙ → «Buscar actualizaciones…») para que el móvil la vea. Solo
hay que instalar la APK a mano una vez: la primera versión que trae este botón.

Si el ordenador tiene kywai **descargado de Releases** (sin la carpeta del código), no hay `android/release/` que
leer: cuando el móvil pregunta, kywai baja `orbita.json` y `orbita.apk` de `master` del repositorio público
(`raw.githubusercontent.com/Yiku21/kywai/master/android/release/`), comprueba que la APK es exactamente la anotada
(huella SHA-256) y la guarda en su carpeta de datos (`orbita-release/`). Consulta como mucho cada 15 minutos y solo
vuelve a bajar la APK si se ha publicado otra; sin internet sigue ofreciendo la que ya tenía. Así a cualquier
usuario le llega sola la misma Órbita que a la Release, sin bajarla a mano (`src/main/orbitaRelease.ts`).

**La APK se publica sola desde GitHub.** Cada vez que cambia el código de Órbita en `master`, GitHub Actions
(«Publicar Órbita», `.github/workflows/publicar-orbita.yml`) pasa las pruebas de Android, compila la app firmada con
la clave de siempre, comprueba que el certificado es el mismo de la versión anterior (si no, se para: el móvil no la
instalaría encima) y sube `android/release/` a `master`. Así da igual desde dónde se haga el cambio (PC, Mac mini o
la nube): al actualizar el servidor, el móvil ya la encuentra. Si falla, la pestaña **Actions** del repositorio dice
por qué; «Run workflow» la vuelve a lanzar a mano. El número de versión son los commits del repositorio y nunca baja
de la versión ya publicada + 1.
En el repositorio público, además, la APK se sube a la última Release de GitHub como `kywai-orbita.apk`, que es
la que enlaza la web kywai.app (ver «Descargar la versión lista»).

Para que funcione, la clave se guarda una vez en cada repositorio (Settings → Secrets and variables → Actions →
New repository secret), con los datos del archivo que indica `aicoworkSigning` en `~/.gradle/gradle.properties` del PC:

| Secreto | Valor |
|---|---|
| `ORBITA_KEYSTORE_BASE64` | el archivo `.jks` en base64. En PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("ruta\al\archivo.jks")) \| Set-Clipboard` y se pega |
| `ORBITA_KEYSTORE_PASSWORD` | `storePassword` |
| `ORBITA_KEY_ALIAS` | `keyAlias` |
| `ORBITA_KEY_PASSWORD` | `keyPassword` |

Sin esos secretos la publicación se para con el aviso «Falta el secreto de la clave de Órbita». Publicar a mano
desde el PC (`./gradlew :app:publishOrbita` y subir `android/release/`) sigue funcionando igual.

**Cómo es Órbita.** El mundo 3D ocupa toda la pantalla y todo lo demás flota encima en cristal, sin recuadros que
lo corten:

- **Barra lateral**, como en el escritorio: «Nuevo chat», el buscador (busca en los títulos y en los mensajes de todos
  los chats, con filtros y salto al mensaje), «Historial» (todos los chats por fechas, ver [Historial](#historial)), «Fijados» (en el escritorio se llama «Favoritos»), los proyectos con sus chats retomables (toca uno para seguirlo), «Música» y «Ajustes». **Plegada no desaparece:** queda una columna de cristal a lo largo de la izquierda
  con el logo de kywai arriba y los accesos usables sin desplegarla (Nuevo, Buscar, Historial, Te necesita con su número, Chat,
  Tareas, Resultados, Música, Más y Ajustes abajo). En la tableta cada icono lleva su nombre debajo; en el móvil en
  vertical es una columna fina solo de iconos. El logo o el botón de debajo la despliegan entera (en el móvil, como
  cajón por encima). Lo hace `SidebarRail` en `ui/orbita/Sidebar.kt`.
- **Nombre del ordenador:** abajo en la barra lateral sale a qué ordenador estás conectado («macmini.lan»). Tócalo para
  ponerle el nombre que quieras (vacío vuelve al de la red). Se guarda en el ordenador, así que se ve igual en Órbita,
  la web y el escritorio (ver [Barra lateral y conversaciones](#barra-lateral-y-conversaciones)).
- **Mantén el dedo sobre un proyecto o un chat** de la barra lateral y sale su menú, el mismo que el clic derecho del
  escritorio (ver [Barra lateral y conversaciones](#barra-lateral-y-conversaciones)):
  - **Proyecto:** Nuevo chat en este proyecto, Fijar (o Soltar de Fijados), Cambiar nombre y Eliminar proyecto (pide
    confirmación; todo lo suyo va a la Papelera del ordenador).
  - **Chat:** Fijar, Cambiar nombre, Bifurcar (se abre la copia), Mover a otro proyecto (sale la lista de proyectos)
    y Eliminar (pide confirmación; va a `conversaciones/borradas/`). También se elimina el chat abierto: antes se
    empieza uno nuevo en su proyecto.
  - Lo fijado sale arriba en **Fijados**, igual que en el escritorio y el navegador.
  - «Abrir carpeta del proyecto» no está en el móvil. Mientras el equipo trabaja en un proyecto no se puede eliminar
    ni empezar otro chat en él, ni mover o eliminar el chat en el que trabaja (la opción sale apagada y dice por qué).
  - Con un ordenador de versión anterior solo salen Cambiar nombre y Eliminar en los chats (no el abierto) y Nuevo
    chat en los proyectos. Para tenerlo todo, actualiza kywai en el ordenador (servidor). Para desarrolladores: la
    API móvil anuncia `capabilities.chatActions` (`POST /chats/{id}/pin|fork|move`, `GET /chats/pinned`) y
    `capabilities.projectActions` (`POST /projects/{id}/rename|pin|delete`); ver `docs/mobile-api/`.
- **Pestañas Chat · Archivos · Tareas · Resultados** en la cabecera del panel (en el móvil: Chat · Espacio · Tareas ·
  Resultados, bajo la barra de arriba). La pestaña Tareas lleva el número de tareas en marcha.
- **Un agente a la vez:** abajo, en vez de la barra del Equipo, sale la ficha de un agente con **‹ ›** (o deslizando)
  para pasar al siguiente; tocarla abre su tarjeta. Las tareas en pausa avisan arriba.
- **Controles de la cámara** (acercar, alejar, centrar) flotando abajo a la derecha en la tableta.
- **Música sin anuncios:** ☰ → Música abre las radios de SomaFM y Audius con buscador y volumen. Mientras suena
  queda un reproductor pequeño en la barra de arriba; se para al salir de la app.
- **Ajustes en pestañas:** General (idioma, tema, tacto y mundo 3D), Agentes (planes de Hermes, ver el equipo), Conexión
  (ordenador, servidor y este móvil) y Acerca de (actualizaciones de Órbita y apoyar kywai).
- **Mismo tema que el escritorio:** el tema que eliges en kywai (⚙ → Ajustes → General → Tema) se guarda en el
  servidor y Órbita lo aplica sola: colores de la interfaz y del mundo 3D (los robots conservan los suyos). También
  se puede elegir desde Órbita (Ajustes → General → Tema) y cambia en todos los dispositivos, o marcar «Tema propio en
  este móvil» para tener otro solo en Órbita (ver [Temas](#temas)). Los mapas con escenario propio no se pasan al
  móvil, solo sus colores. Para desarrolladores: `config.uiTheme`
  (`setUiTheme`), `settings.theme` en la API móvil, `OrbitaThemes`/`OrbitaPalette` y `ui/space/SpaceGrade.kt`, que
  recolorea en el sombreador.
- **Iconos de un solo estilo y color:** el color se reserva para avisos y estados.

Con el móvil plegado (pantalla exterior), las flechas de arriba a la derecha de un panel lo ponen **a pantalla
completa**: sin la barra de abajo ni la de arriba, todo el sitio para el chat. Se recuerda (también al cerrar la
app) hasta que vuelvas a pulsarlas; atrás o ✕ cierran el panel. Desplegado, las flechas siguen ampliando el panel
sobre el mundo.

**Sin conexión.** Órbita se puede usar aunque no llegue al ordenador (sin cobertura, en el metro, con el Mac
reiniciándose). Enseña lo último que recibió y lo que escribas se queda **en cola** hasta que vuelva la conexión:

- **La cola se guarda en el móvil** (`outbox.json` en los datos privados de la app, `FileOutboxStore`): si cierras
  Órbita, Android la cierra o reinicias el teléfono, los mensajes siguen ahí y salen al volver.
- **Salen de uno en uno y en el orden en que los escribiste**, cada uno **al proyecto donde lo escribiste** aunque al
  volver estés mirando otro. Nunca llegan dos veces: cada mensaje lleva su `clientMessageId` y el servidor ignora el
  repetido. Si el servidor rechaza uno (por ejemplo, su proyecto ya no existe) queda como «No se envió» con
  Reintentar y Descartar, y los siguientes salen igual.
- **Fotos y archivos también.** Si haces una foto, eliges una de la galería o adjuntas un archivo sin conexión, Órbita
  guarda una copia en el móvil (carpeta privada `cola-archivos`), avisa «Sin conexión: foto.jpg se enviará con tu
  mensaje al volver» y la deja adjunta al mensaje que escribes (con un reloj en vez del clip). Al volver la conexión
  la sube al proyecto del mensaje y después envía el mensaje con ella; si se corta a medias no la sube dos veces. La
  copia se borra en cuanto el ordenador tiene el mensaje (o al descartarlo).
- **Se envían aunque Órbita esté cerrada.** Si dejas mensajes en cola y sales de la app, Android los manda en cuanto
  vuelve la red (WorkManager, `OutboxWorker`), y avisa con la notificación «Se enviaron tus 3 mensajes» (canal
  «Mensajes enviados», se puede apagar en los ajustes de Android). Si la red vuelve pero el ordenador aún no responde,
  lo reintenta solo cada vez más espaciado. Con la app abierta y conectada no sale ningún aviso: ya lo ves en el chat.
- **Se ve lo que espera.** Arriba, en vez de «Sin conexión», sale **«Sin conexión · 2 en cola»**. Cada mensaje en cola
  lleva un reloj, sus adjuntos y dos botones: **Editar** lo devuelve al cuadro de texto con sus fotos (lo cambias y lo
  vuelves a enviar) y **Descartar** lo quita de la cola. Mientras uno se está enviando ya no se puede editar.
- Las acciones (aprobar un plan, detener una tarea, los botones de «Te necesita») siguen necesitando conexión: hacerlas
  a destiempo podría aprobar algo que ya cambió.
- Para desarrolladores: `CoworkRepository.drainOutbox()` vacía la cola (con un `Mutex`, de uno en uno) y no abre el
  tiempo real, así que vale igual para el envío en segundo plano; las pruebas
  están en `MockServerIntegrationTest`.

**Dispositivos emparejados:** en ⚙ → Ajustes → «Acceso desde otros dispositivos…» aparece la lista de móviles y clientes
emparejados, con cuándo se usó cada uno por última vez. **Revocar** uno lo desempareja sin tocar los demás (y corta
sus conexiones abiertas); el que lleva 90 días sin usarse deja de valer solo. Cambiar el código de acceso los revoca
todos. Un móvil emparejado antes de esta lista sigue funcionando hasta que se cambie el código.

El servidor (8787 y la versión HTTPS en 8788) escucha solo en la IP de Tailscale del equipo y en `127.0.0.1` (nunca en la red local ni en
internet) y exige el código en cada petición. Desde la web se puede chatear, ver el espacio, subir archivos y
ver resultados; elegir carpetas, instalar CLIs e iniciar sesión en ellos se hace en el propio equipo.

### Cliente de escritorio (conectar con tu kywai principal)

Puedes instalar kywai en otro Mac, Windows o Linux y usarlo como **cliente** de tu kywai principal (el que está
siempre encendido): no ejecuta agentes ni guarda proyectos, enseña la interfaz del servidor, con sus agentes, su
chat, sus proyectos y sus archivos, desde una app instalada y no desde el navegador.

1. En el servidor: ⚙ → Ajustes → «Acceso desde otros dispositivos…» → activa el acceso y pulsa «Generar código de 6 cifras».
2. En el otro equipo, con **Tailscale conectado**: instala kywai y ábrelo. La primera vez pregunta cómo vas a
   usarlo: elige **«Conectar con mi kywai principal»**. (Un equipo que ya tenía kywai como servidor no
   pregunta nada: para convertirlo en cliente, cierra la app y crea en su carpeta de datos un archivo `client.json`
   con `{"mode":"client"}`.)
3. Escribe la dirección del servidor (la IP de Tailscale o su nombre, p. ej. `100.101.102.103` o `mac-mini`; vale
   pegar el enlace de acceso entero, que ya trae el código) y el código. Se reinicia una vez y queda emparejado.

La llave de ese equipo se guarda cifrada (en Mac con la clave propia de kywai, ver «Claves guardadas en Mac»; en
Windows y Linux con el cifrado del sistema), es **solo suya** (aparece en la lista de
dispositivos emparejados del servidor y se revoca desde allí sin tocar los demás) y deja de valer tras 90 días sin
usarse. El cliente nunca recibe el código de acceso del servidor (ni en la configuración, ni en los avisos, ni en el
enlace a la versión HTTPS), así que al revocarlo se queda fuera de verdad. La interfaz siempre es la del servidor, así que cliente y servidor nunca quedan desfasados. Si el servidor
no responde, el cliente lo dice y reintenta solo; si ya no lo reconoce, vuelve a pedir un código. Aunque la carga de la
interfaz se corte a medias (el servidor se reinicia o rechaza la llave mientras carga), la app no se cierra: se queda en
«Sin conexión» o en la pantalla de conectar (antes salía «No se pudo iniciar: (-3) loading data:…» y se cerraba). La ventana no lleva barra de
menús: en ⚙ → «Ajustes…» están **Recargar la interfaz** (pestaña Acerca de; también Ctrl+R o F5), y **Cambiar de
servidor…** y **Olvidar este dispositivo y desconectar** (pestaña Conexión).

**Pasar un cliente a servidor.** Al actualizar, kywai se queda con el modo que tenía (se guarda en `client.json`,
en su carpeta de datos, que el instalador no borra). Si un equipo era cliente y ahora quieres que sea el servidor,
pulsa **«Usar este equipo como servidor»**: está en la pantalla de conectar, en la de «Sin conexión», en ⚙ → Ajustes →
Conexión y, en el Mac, en el menú Servidor. Pide confirmación, olvida la conexión con el otro kywai y reinicia la app en
modo servidor. Con una versión anterior que no tenga el botón: cierra kywai, borra `client.json` de su carpeta de datos
(en Windows, `%APPDATA%\AI Cowork`; en el Mac, `~/Library/Application Support/AI Cowork`; no toques la carpeta
`workspace`) y ábrelo otra vez.

**Si el servidor ya no reconoce el dispositivo** (la llave caducó tras 90 días sin uso, se revocó o el servidor es
una versión anterior), el cliente olvida esa llave, que ya no sirve, y se queda solo con la dirección: basta con
generar un código nuevo en el servidor y escribirlo.

**Para no confundir un equipo con otro**, la primera fila del menú ⚙ dice dónde estás: **Este equipo es el
servidor** (cian, con su nombre), **Cliente de escritorio → nombre-del-servidor** (violeta) o **Navegador**, con la
explicación de dónde están los agentes y los proyectos. En el cliente, además, una franja violeta fina recorre lo alto
de la ventana. El título de la ventana del cliente también lleva el nombre del servidor.

**Los tiempos van con la hora del servidor.** El cliente y el navegador piden la hora al servidor al abrir (y cada
10 minutos) y cuentan con ella cuánto lleva cada tarea, la barra de progreso y «sin novedades desde hace…». Así,
aunque este equipo vaya mal de hora (por ejemplo, con la zona horaria mal puesta y la hora corregida a mano), el
reloj de la tarea no se queda en «0 s» ni la barra en «≈ 2 %». Aun así, conviene poner la hora automática en el
equipo (Windows: Configuración → Hora e idioma → «Establecer zona horaria automáticamente»).

#### Archivos del servidor

En el cliente (y en el navegador), ⚙ → **«Archivos del servidor…»** abre un explorador del disco del equipo servidor:

- **Navegar** por sus discos, la carpeta del usuario y las carpetas de los proyectos, con las migas de pan y «subir».
- **Abrir** un archivo: en el cliente se descarga a una carpeta temporal y se abre con tu aplicación; en el navegador,
  en otra pestaña. **Descargar** un archivo, o una carpeta entera como **zip** (hasta 4 GB; no sigue enlaces
  simbólicos).
- **Elegir la carpeta de trabajo de un proyecto** desde el cliente: el botón de carpeta del selector de proyectos
  abre este mismo explorador, en vez de pedir que se haga en el servidor.

Por defecto el cliente ve **todo el disco** del servidor (eres tú desde otro sitio). Hay dos cosas más:

- **Interruptor** en ⚙ → Ajustes → «Acceso desde otros dispositivos…» → «Restringir los clientes a las carpetas de los
  proyectos» (apagado por defecto): con él, un cliente solo ve las carpetas de los proyectos y de sus adjuntos y
  resultados.
- **Registro de accesos** (en ese mismo panel): quién (dispositivo o navegador) vio, abrió, bajó o puso como carpeta de
  trabajo qué, cuándo y desde qué dirección, y lo que se le negó. Se guarda en `access-log.jsonl` de la carpeta de datos.

Lo que **nunca** se comparte, ni con el acceso completo: la clave de los tokens (`mobile-key`), la lista de
dispositivos, el `config.json` con el código de acceso y el certificado propio.

#### Sincronizar carpetas

En el cliente de escritorio, ⚙ → **«Sincronizar carpetas…»** mantiene una carpeta de este equipo **igual que una del
servidor**, en los dos sentidos (la sincronización corre en el cliente; el servidor solo sirve y guarda). «Añadir una
carpeta…» pide primero la del servidor (el explorador de arriba) y luego la de este equipo.

- **Cada 30 segundos** y unos segundos después de que algo cambie aquí; «Ahora» la fuerza. Los archivos viajan en
  streaming (sin cargarlos enteros en memoria) y conservan su fecha de modificación.
- **Cambió solo en un lado**: pasa al otro.
- **Cambió en los dos lados**: si el contenido es el mismo, no pasa nada; si es distinto se **conservan las dos
  versiones**: la de este equipo queda como `nombre (conflicto PC-Casa 2026-10-12 15-30).ext`, la del servidor se baja con
  su nombre, y la copia se sube en la ronda siguiente. Avisa con una notificación y queda en la lista de avisos.
- **Borrado en un lado**: se borra en el otro **mandándolo a la papelera** (la de este equipo o la del servidor, nunca
  borrado del todo) y se avisa. Si en un lado se editó mientras lo borraban en el otro, **gana la edición**.
- **Protección contra accidentes**: si una ronda fuera a borrar de golpe más de 25 archivos (y más del 30 % de lo
  sincronizado) se **para sin tocar nada** y pide confirmación («Sí, continuar»): por si una carpeta no se montó o se
  vació por error. Si falta la carpeta de este equipo, no se borra nada del servidor.
- **No se sincronizan** `.git`, `node_modules`, `.venv`, `__pycache__`, `.DS_Store`, `Thumbs.db`, `desktop.ini`, `*.part`,
  `*.tmp` ni `~$*`, ni los enlaces simbólicos. Hasta 200 000 elementos por carpeta.
- «Pausar», «Reanudar» y «Quitar» (que solo deja de sincronizarla; no borra nada). La lista y su estado se guardan en
  `sync.json` y `sync-state/` de la carpeta de datos del cliente.

Todo pasa por la API de archivos del servidor, así que respeta la restricción a las carpetas de los proyectos, no toca
los archivos protegidos y queda en el registro de accesos.

#### Actualizar el cliente

«Buscar actualizaciones…» del menú ⚙ actualiza el **servidor** (y con él la interfaz que ves). La app instalada en el
cliente, su ventana y su puente con el sistema, se actualiza aparte y **desde tu servidor**, sin GitHub ni ninguna
cuenta:

- **Publicar** (en el PC donde compilas, con el código de acceso del servidor, el que va tras «?t=» en su enlace):

  ```bash
  npm run publicar-cliente -- --servidor 100.64.0.1 --codigo <código de acceso>
  ```

  Compila el instalador de Windows con un número de versión sacado de los commits, lo sube al servidor y lo deja como
  la versión vigente. Solo el dueño (con el código de acceso) puede publicar: la llave de un cliente no puede.
- **Firma**: cada versión va firmada con tu clave privada, y el cliente solo instala lo que esa clave firmó (comprueba
  la firma y la huella del instalador antes de abrirlo). Así, aunque alguien consiguiera el código del servidor y
  subiera un instalador, ningún cliente lo instalaría. La clave se crea sola la primera vez que publicas, en
  `~/.ai-cowork/firma-cliente.pem` del PC (otra ruta con `--clave` o `AICW_CLAVE_FIRMA`), y su parte pública se
  escribe en `src/main/clientReleaseKey.ts`: **súbela con un commit** y **guarda una copia de la privada** (sin ella,
  los clientes instalados no aceptan versiones nuevas y habría que reinstalarlos a mano). La privada nunca va al
  repositorio. Un cliente compilado sin clave pública no se actualiza desde el servidor.
- **Instalar** (en cada cliente): al abrirse y cada 6 horas pregunta si hay una versión más nueva; también desde ⚙ →
  **«Actualizar este equipo…»** (primero busca; si la hay, un segundo toque la descarga del servidor, la instala y
  reinicia). El emparejamiento se mantiene.

Hoy es solo para clientes Windows. Un cliente Linux o Mac descargado de la Release se actualiza desde GitHub (ver
«Descargar la versión lista (GitHub Releases)»); uno compilado en el equipo, con `scripts/actualizar-mac.sh` o `scripts/actualizar-linux.sh`. Un cliente
instalado antes de este sistema hay que cambiarlo una vez a mano.

### Dictado por voz

El botón del micrófono, junto a los de adjuntar, graba una nota de voz. Al pulsarlo otra vez (o a los 5 minutos)
la nota **se envía al momento**, sin esperar: sale ya en el chat con «Nota de voz · pasándola a texto…» y puedes
seguir escribiendo o grabar otra. Por detrás, el equipo la convierte en texto **en el propio equipo** con Whisper
(faster-whisper, modelo «small», en el idioma de la app): sin APIs ni servicios externos, y el audio se borra al
terminar. En cuanto tiene el texto, ese mismo mensaje del chat pasa a enseñar lo dicho (con la marca «Nota de voz»)
y va al equipo como un mensaje normal: a Hermes, o directo al agente si empieza por «@Agente», con las órdenes
(«/video …», «/recuerda …») y con «Responder». Lo que hubiera escrito en el cuadro va delante de lo dicho, y los
archivos adjuntos van con la nota. Si no se entiende nada o el dictado falla, el mensaje queda como «no se pudo
pasar a texto» y un aviso dice por qué: vuelve a grabarla. Con «/nuevo», «/model» o «/uso» en el cuadro, lo dicho
se queda en el cuadro sin enviar. La primera vez se prepara solo (instala `uv` si falta y descarga el modelo,
~480 MB) y tarda unos minutos; después, unos segundos por nota.

### Leer las respuestas en voz alta

Junto al micrófono hay un **altavoz**. Activado (se pone azul), kywai te **lee sola la respuesta** de cada
petición: lo que te dice el coordinador nada más llegar (su respuesta, el plan que reparte o que espera tu visto
bueno, la respuesta final con todo delante) y, si la petición acaba con el resultado de una sola tarea, ese
resultado. Si llega otra mientras lee, espera su turno. Con el altavoz activado los agentes no hacen sus
soniditos al escribir (el balbuceo): solo se oye la voz que lee. No lee los pasos intermedios, los bloques de código, las
tablas, las direcciones web ni la lista «Resumen del trabajo»; de una respuesta larguísima lee unos cuatro minutos.
Mientras lee, el altavoz late y un toque lo calla (sigue activado para la siguiente); sin estar leyendo, el toque lo
apaga. Al empezar una nota de voz se calla solo.

La voz se elige en ⚙ → Ajustes → General → **«Voz para leer las respuestas»**: son las mismas voces de los vídeos
(Álvaro, Jorge y Carmen en español; las de inglés; y las de ElevenLabs, Gemini, Voicebox o VoiceStudio si las
tienes), cada una con ▶ para oír una muestra. En español hay además nueve voces que funcionan **en tu equipo, sin
internet**: seis de Piper (Dave, Mateo y Lucía de España; Aldo y Claudia de México; Daniela de Argentina) y tres
de Kokoro (Dora, Álex y Santa). Las de Piper se bajan la primera vez que las usas (entre 60 y 110 MB cada una, a
`estudio-video/piper/`; kywai instala `piper-tts` solo) y desde entonces no necesitan conexión; Álvaro y Jorge, de
Edge, sí la necesitan siempre. Sin elegir, lee la del idioma de la app (Álvaro en español). Ahí mismo
está el interruptor «Leer las respuestas en voz alta», que es el mismo altavoz. Suena con el volumen de «Voces de
los agentes»; si silencias esas voces, deja de leer, y al activar el altavoz vuelven. El altavoz y la voz se
recuerdan por dispositivo (escritorio, cliente y navegador; Órbita aún no lo tiene).

El audio lo genera el equipo servidor trozo a trozo (por eso empieza a sonar a los pocos segundos) con el estudio de
vídeo; si la voz elegida no sale (sin internet para las de Edge, por ejemplo), lee la voz del sistema. Solo se lee
la respuesta del chat que tienes abierto en esa ventana. Código: `src/shared/readAloud.ts` (qué se lee y en qué
trozos), `readAloudClip` en `src/main/videoStudio.ts` y `src/renderer/src/lib/readAloud.ts`.

Por dentro: `sendVoiceNote` (src/main/orchestrator.ts) pone el mensaje provisional (`voiceNote: 'transcribing'`),
transcribe con `transcribeAudio` (src/main/voice.ts) y llama a `sendMessage` con un `clientMessageId` propio; al
guardar el mensaje del usuario con ese `clientMessageId`, `pushMessage` le da el id y la hora del provisional, así que
lo sustituye en su sitio (`voiceNote: 'sent'`). Si kywai se cierra a medias, pasados 30 minutos el chat lo da por
perdido.
En macOS pide permiso para el micrófono. Desde otro dispositivo, el navegador solo deja usar el micrófono en
páginas **HTTPS**. Si entras por el enlace `http://`, al tocar el micrófono aparece **«Abrir la versión segura»**:

- Sin hacer nada más, lleva a `https://<ip>:8788`, la versión HTTPS que kywai sirve con su **certificado
  propio** (se crea solo, en `web-cert/` dentro de la carpeta de datos, para las IPs y el nombre del equipo). La
  primera vez el navegador avisa de que la conexión no es privada, porque ese certificado no lo firma ninguna
  autoridad: pulsa «Configuración avanzada» → «Continuar» (en iPhone, «Mostrar detalles» → «visitar este sitio
  web»). Después ya deja grabar. Guarda ese enlace en el móvil.
- Si en el Mac activas «HTTPS para usar el micrófono desde el móvil» (⚙ → Ajustes → «Acceso desde otros dispositivos…»),
  lo publica Tailscale Serve en `https://<equipo>.<red>.ts.net` con un certificado válido, sin aviso, y el botón
  lleva ahí.

## Cómo trabaja el equipo

### Tu equipo: añadir, quitar y elegir quién coordina

kywai no es solo para los agentes de fábrica: es una plataforma donde conectas **los agentes que ya pagas**. En
⚙ → Ajustes → «Configurar agentes…» (paso «Agentes»):

- **Añadir un agente**: «Añadir un agente» abre el catálogo con los que se pueden conectar (Aider, **DeepSeek**, OpenCode,
  GitHub Copilot CLI, Cursor, Amp, Goose, Kimi Code, Mistral Vibe, Grok Build, Cline, Continue, OpenHands, Factory Droid,
  Auggie, Junie, Crush, Open Interpreter, gptme, Letta Code, ForgeCode, OpenClaw, Kiro, **Qwen Code**, **Antigravity CLI**,
  **Rovo Dev**, **MiniMax Code**, **Qoder CLI**, **Kilo CLI**… y los de fábrica que hayas
  quitado), con la cuenta o suscripción con la que funciona cada uno. Elige uno y se añade con su robot y su estación en el
  espacio digital. **«Otro programa…»** conecta cualquiera: el comando, cómo recibe el encargo (por stdin, en un
  archivo o como argumento) y sus argumentos.
- **Otra cuenta del mismo agente**: **«Otra cuenta…»** (junto a «Otro programa…») enseña los agentes que pueden
  tenerse dos veces con cuentas distintas: **Claude**, **Codex** y **Gemini**. Eliges uno (y, si quieres, su nombre) y
  se añade, por ejemplo, **«Claude B»**: los mismos modelos y la misma ficha que el de siempre, con otro color, su
  propio puesto en el espacio digital, su tarjeta en Ajustes y su **propio inicio de sesión** en el paso «Sesiones».
  En la ventana de «Iniciar sesión» entra con la **otra** cuenta: si el navegador entra solo con la de siempre, cierra
  sesión en claude.ai o chatgpt.com (o copia el enlace en una ventana privada). En Gemini, lo más fácil es pegar otra
  clave de Google AI Studio en su fila.
  - Cada cuenta guarda su sesión en su carpeta (`cuentas/<id>` en los datos de kywai) y kywai lanza siempre su programa
    con ella (`CLAUDE_CONFIG_DIR`, `CODEX_HOME` o `GEMINI_CLI_HOME`); en Mac, Claude Code separa también su entrada
    del llavero. Tu agente de siempre no se toca.
  - Comparte con el de siempre las habilidades, plugins, órdenes, instrucciones y ajustes de su programa (enlazados
    desde `~/.claude`, `~/.codex` o `~/.gemini`), pero no la sesión, el historial ni la cuota.
  - **Cuota aparte**: su indicador es el suyo (en Claude, con lo que informa en sus tareas; en Codex, con los archivos
    de sesión de su carpeta). Hermes sabe que son dos cuentas del mismo programa y, si a una le queda poca, da la tarea a
    la otra en vez de esperar.
  - Sus **copias** («Claude B 2») y sus becarios trabajan con su misma cuenta.
  - Usar varias cuentas propias es decisión tuya: revisa las condiciones de cada servicio.

  Código: `src/shared/accounts.ts`, `src/main/agents/accounts.ts`, `buildAccountAgent` en `src/shared/agentCatalog.ts`
  y las cuotas por grupo en `src/main/quota.ts`.
- **Agentes gratis**: los que se pueden usar sin pagar una suscripción llevan la etiqueta verde **«Gratis»** en el
  catálogo y en las tarjetas del asistente, con la condición y el límite (pasa el ratón por encima en el asistente). El
  botón **«Solo gratis»** del catálogo deja solo esos. Comprobado en sus páginas oficiales en noviembre de 2026:
  - **Kilo CLI**: sin tarjeta y sin cuenta, con sus modelos gratuitos (empieza con Kilo Auto Free).
  - **Gemini** (de fábrica): con una clave de API de Google AI Studio, sin tarjeta, solo modelos Flash y unas 250
    peticiones al día. Google usa lo que le envías para mejorar sus productos.
  - **OpenCode**: con los modelos gratuitos de OpenCode Zen (solo desde OpenCode; límite compartido y sin cifra).
  - **GitHub Copilot CLI**: con el plan Copilot Free (GitHub no publica el cupo).
  - **Cline**: con los modelos marcados FREE de una cuenta de Cline.
  - **Aider** y **Hermes**: con una clave de OpenRouter y sus modelos `:free`: 50 peticiones al día, o 1000 si
    alguna vez compraste 10 $ de saldo.
    Aider ya empieza con el mejor gratis para programar, **Nemotron 3 Ultra**
    (`openrouter/nvidia/nemotron-3-ultra-550b-a55b:free`); con otra clave, cambia el modelo en el selector del agente.
  - **Mistral Vibe**: con una clave del plan gratuito Experiment de Mistral.
  - **Antigravity CLI**: con una cuenta personal de Google y un límite semanal (ojo con sus condiciones, más abajo).
  - El **agente local** (LM Studio u Ollama) siempre es gratis.

  No llevan la etiqueta: Qwen Code (su acceso gratis cerró el 15 de abril de 2026), Kiro (con el plan gratis no hay
  modo sin pantalla: la clave es de Pro o superior), Amp (Amp Free está en pausa y su modo de scripts es de pago) y los
  de suscripción (Claude, Codex, Muse…). Las capas gratis cambian a menudo: el texto vive en el campo `free` de
  `src/shared/agentCatalog.ts` y `src/shared/agentCatalogData.ts`.
- **Quitar un agente**: «Quitar» (se pulsa dos veces) lo saca del equipo y de la lista de quienes pueden coordinar; el
  de fábrica no vuelve a aparecer al actualizar, y se puede añadir otra vez desde el catálogo. Siempre tiene que
  quedar al menos uno que trabaje.
- **Elegir quién coordina**: «Hacer coordinador» en cualquier agente elegido (no hace falta Hermes: puede planificar
  y repartir Codex, Claude o el que quieras). Si el coordinador no está disponible, planifica el siguiente.
- **Instalar e iniciar sesión**: los pasos «Programas» y «Sesiones» del asistente instalan cada agente con su
  instalador oficial y abren su inicio de sesión, igual que con los de fábrica.

Cómo trabaja un agente de catálogo: kywai lo lanza en la carpeta del proyecto, con la sesión que ya tengas
iniciada en su programa (tu suscripción), le entrega el encargo por stdin o por un archivo (el texto nunca va en la
línea de órdenes) y recoge lo que responde. **DeepSeek** no tiene programa de terminal ni suscripción propios (es un modelo con clave de API, de pago por uso):
se conecta a través de Aider con el modelo de DeepSeek fijado. Los agentes que funcionan con una **clave de API**
(DeepSeek, Kiro, Junie, Factory Droid, Amp) piden la clave en el paso «Sesiones»: se guarda cifrada (en Mac con la clave
propia de kywai, en Windows y Linux con el cifrado del sistema), solo en el equipo servidor (nunca por el acceso web ni por el móvil), y se pasa únicamente al programa de ese
agente. Kiro también vale sin clave si ya iniciaste sesión con «kiro-cli login» (se comprueba con `kiro-cli whoami`).

Los añadidos en octubre de 2026, con lo que hay que saber de cada uno:

- **Qwen Code** (`qwen`): su acceso gratuito con la cuenta de Qwen cerró en abril de 2026. Ahora funciona con el
  **Qwen Coding Plan** de Alibaba Cloud (clave del plan y endpoint `https://coding.dashscope.aliyuncs.com/v1`, o
  `coding-intl` fuera de China) u otro proveedor: «Iniciar sesión» abre `qwen`, y dentro se elige con `/auth`. Es
  distinto del agente local «Qwen» de Ollama. Al planificar va en modo `plan`; en el proyecto, `auto-edit`; con acceso
  completo, `yolo`.
- **Antigravity CLI** (`agy`, de Google): desde junio de 2026 sustituye a Gemini CLI en las cuentas personales de
  Google. Tiene un plan gratis con un límite semanal y más cuota con Google AI Pro o Ultra. La sesión se
  inicia con Google la primera vez que se abre `agy`. Sin acceso completo no puede editar (en modo sin pantalla deniega
  lo que pediría permiso) y la versión 1.0.6 falla con `-p` sin terminal: actualízalo. Ojo: sus condiciones adicionales
  prohíben acceder al servicio con software de terceros (su ejemplo es OpenClaw con el inicio de sesión de Antigravity)
  y avisan de que pueden suspender la cuenta de Antigravity y la de Gemini CLI. kywai lanza el programa oficial, pero
  Google no ha aclarado si eso cuenta: por eso no es el agente gratis que se recomienda primero.
- **Rovo Dev** (Atlassian): va dentro de la CLI de Atlassian (`acli rovodev run`), con tu cuenta de Atlassian y
  `acli rovodev auth login`. Con acceso completo, `--yolo`.
- **MiniMax Code** (`mcode exec`, encargo por stdin): necesita Node.js 22.19 o superior; «Iniciar sesión» usa una
  cuenta internacional (`mcode login --region global`). Con acceso completo, `--permission full`.
- **Qoder CLI**: se lanza como `qodercli -p` (el comando `qoder` reparte entre la CLI y el editor), con la sesión de
  `qodercli login` o un token `QODER_PERSONAL_ACCESS_TOKEN`. Planifica en modo `plan`, edita con `accept_edits` y con
  acceso completo va con `--yolo`.

Añadido en noviembre de 2026:

- **Kilo CLI** (`kilo run`, de Kilo): funciona **gratis y sin cuenta** con sus modelos gratuitos. Al añadirlo empieza
  con **Kilo Auto Free** (`kilo/kilo-auto/free`), porque su modelo por defecto es de pago y pide cuenta (sin él falla
  con «Authorization header is badly formatted»). Para los de pago, «Iniciar sesión» abre `kilo auth login`. Planifica
  con su agente `plan` (no edita ni ejecuta nada que cambie archivos), en el proyecto edita sin preguntar y con acceso
  completo va con `--auto`. Probado con kilo 7.8. Los modelos gratuitos cambian cuando acaban sus promociones:
  `kilo models kilo` los lista (los que terminan en `:free`).

Ninguno de los de catálogo retoma su sesión anterior en una continuación (eso solo lo hacen Claude y Codex): aunque
sus programas tengan `--continue` o `--resume`, kywai les da cada encargo con el contexto completo. Un agente que
ya estaba en tu equipo conserva la forma de lanzarlo de cuando lo añadiste: para coger una corrección del catálogo
(como la de Kiro), quítalo y vuelve a añadirlo. Con «Acceso completo» se le añaden sus argumentos de aprobar todo; al
planificar, los de solo lectura si los tiene. No informa de tokens ni de cuota, y su salida es texto (sin el paso a
paso estructurado de Claude o Codex). Los marcados «sin comprobar» en el catálogo tienen alguna pieza que su
documentación no confirma y pueden necesitar ajustes.

### Reparto, modelos y permisos

- **Hermes Agent coordina**: recibe tu petición, planifica y reparte las tareas (nunca las ejecuta él). Usa su
  propia configuración de modelos, que en este equipo pasa por **OmniRoute** (`localhost:20128`): si OmniRoute
  está apagado o Hermes falla, planifica Claude como respaldo. El orden se cambia en `plannerOrder` de
  `workspace/config.json`.
- **Hermes coordina siempre que pueda**, también si el mensaje lleva capturas o fotos (las mira con su
  herramienta de visión; si no puede abrirlas, encarga a Claude o Codex una consulta rápida que las mire) y
  aunque esté planificando otra conversación a la vez. Solo coordina otro si Hermes no puede (apagado, sin
  sesión, sin respuesta o apartado tras fallar), y entonces el chat lo dice con una línea como «Hermes no
  coordina esta vez (motivo): lo hace Claude».
- **La calidad manda**: el coordinador busca el mejor resultado posible y que cumpla exactamente lo pedido; el
  tiempo y el gasto son secundarios (así está escrito en sus reglas, y es el comportamiento por defecto, sin
  interruptor). Elige para cada parte al agente y la dificultad que den el mejor resultado, y en la duda sube la
  dificultad (en las tareas que crean o cambian archivos). Un trabajo pequeño o muy enlazado va entero a un agente, que lo hace y lo prueba. Uno grande con partes separables
  (motor, interfaz, servidor…) se reparte **en paralelo** entre los agentes más adecuados, con un **contrato común**
  que escribe el coordinador (qué archivos son de cada uno y cómo se comunican las partes), y al final una tarea
  «Integrar y probar» que ejecuta las pruebas y comprueba el conjunto contra lo pedido. Solo reparte si se cumplen
  las tres condiciones: cada parte tiene trabajo de sobra, las partes van en archivos distintos sin estado compartido
  y la interfaz entre ellas se puede fijar de antemano; si falta alguna, una sola tarea (dividir trabajo acoplado lo
  empeora). Si una petición trae **varios encargos distintos** que no se necesitan entre sí («arregla el login y además
  escribe el README»), cada uno es su tarea sin dependencias y, si varios agentes sirven igual de bien, para agentes
  distintos: así empiezan a la vez (dos tareas del mismo agente van una detrás de otra). Solo encadena una tarea a
  otra si necesita de verdad su resultado o sus archivos. Y nunca reparte una **continuación** («no funciona…», «ahora añade…»): va entera al mismo agente que
  hizo ese trabajo. Puedes forzarlo escribiendo **«en equipo»** o **«un solo agente»** en la petición. No añade revisiones, auditorías ni correcciones encadenadas salvo que lo pidas (escribe **«con
  revisión»**), y entonces van con el modelo normal. El agente local no recibe trabajo pesado. (Medido en la prueba
  de la app de gastos: con revisiones encadenadas tardó 49 min frente a 25 de Codex solo, con la misma calidad.)
- **Cada agente conoce el contexto completo**: con su encargo recibe la conversación reciente (los últimos 12
  mensajes, sin recortar), lo que se hizo en la petición anterior (qué pediste, qué hizo cada tarea, su resultado
  completo y los archivos que dejó), los archivos recientes del proyecto y, si hay varias tareas, el plan entero con
  cuál es la suya. Así «no funciona lo de las tildes, arréglalo como habíamos dicho» significa lo mismo para el agente
  que para ti, igual que en un chat directo. El resultado que una tarea pasa a las que dependen de ella se guarda
  entero (6 000 caracteres, antes 1 500) y el coordinador ve la misma conversación, no una línea por mensaje.
- **Varias peticiones a la vez**: puedes pedir otra cosa mientras el equipo trabaja. La anterior no se detiene; la
  nueva se planifica al momento y el coordinador ve quién está ocupado (y con qué) y qué archivos se están tocando:
  da lo nuevo a los agentes libres, que empiezan ya, y evita esos archivos (lo que toque a un agente ocupado lo hace
  una copia suya, ver «Varias tareas a la vez por agente»). Si dos tareas coinciden en el tiempo, la segunda trabaja
  en una copia aparte que se integra al terminar (ver «Cambios de cada tarea»). Como mucho trabajan 3 tareas a la vez
  en todo el equipo (se cambia en Ajustes). Con varias peticiones en marcha, «Detener» deja elegir cuál (o todas).
- **Varias tareas a la vez por agente**: si un agente ya está ocupado y le llega otra tarea (de la misma petición, de
  otra o de otra conversación del proyecto), no espera: la empieza ya **una copia suya** («Claude 2», «Claude 3»…),
  con el **mismo modelo, nivel y esfuerzo** que él (el fuerte si la tarea es difícil), no el modelo ligero de los
  becarios. La copia sale en el 3D con el color y el robot de su agente, en un puesto de apoyo, y se va al terminar.
  Trabaja en una **copia aparte de la carpeta** y sus cambios se integran al acabar, como cuando coinciden dos
  tareas; si chocan, se resuelve igual. En el chat su trabajo sale con su agente y la marca **«Claude · Claude 2»**.
  - **Cuántas a la vez**: ⚙ → Ajustes → **Agentes** → **«Tareas a la vez de …»**, de 1 a 4 por agente (2 si no lo
    cambias; con 1 hace sus tareas de una en una, como antes). Ahí mismo está **«Tareas a la vez en todo el
    equipo»** (de 1 a 8, 3 por defecto), que cuenta a todos los agentes y sus copias.
  - **Cuándo espera**: si le queda poca cuota (por debajo de tu aviso de cuota) o está bloqueado; si es un modelo local
    (Ollama, LM Studio, Colibri: siempre 1, para no saturar el equipo); si la tarea continúa la sesión del CLI que el
    agente está usando en ese momento (una sesión no se puede retomar dos veces a la vez); o si no queda puesto libre.
  - **El coordinador lo sabe**: en la ficha de cada agente ve «ocupado…, pero puede llevar 2 tareas a la vez», así que
    le da la tarea al más adecuado aunque esté ocupado, en lugar de pasársela a otro peor solo por ir más rápido.
  - Para desarrolladores: `src/shared/instances.ts` (`instancesFor`), `twinBlock`, `busyTwins` y `spawnBecario(…, twin)`
    en `orchestrator.ts` (`AgentConfig.twin`, `AgentConfig.maxInstances`) y `setParallel` en `config.ts`. Prueba
    «Y» de `src/main/__checks__/orchestrator.check.ts`.
- **Fichas y modelos con datos verificados**: el coordinador ve de cada agente qué se le da mejor, qué evitar, qué
  modelo y esfuerzo usa en cada dificultad (con su velocidad y coste), la cuota que le queda y cómo le ha ido en AI
  Cowork. Esfuerzo: medio en lo fácil, alto en lo normal y alto (Claude) o muy alto (Codex) en lo difícil; nunca
  «low» en trabajo sobre el proyecto ni «max». También se planifica con esfuerzo alto. Lo difícil de Codex va con GPT-6.1 Sol (iguala a Astra por mucho menos) y Gemini usa 3.8 Flash fijo. Todo
  explicado, con fuentes, en [GUIA-MODELOS.md](GUIA-MODELOS.md).
- **Modelos por dificultad**: tareas fáciles (solo respuestas de texto cortas o cambios mecánicos) → un becario con
  el modelo principal y esfuerzo medio (el modelo ligero solo para respuestas de texto: como agente de código tarda
  más), normales → principal con esfuerzo alto, difíciles → fuerte.
  Claude: Haiku (texto) / Sonnet / Opus. Codex: GPT-6 Luna (texto) / GPT-6.1 Sol / GPT-6.1 Sol con esfuerzo muy alto
  (requiere Codex CLI 0.162 o superior). Gemini: 3.5 Flash-Lite (texto) / 3.8 Flash. Se cambian desde el panel de
  cada robot. Si un modelo no está disponible, se usa el principal y, si tampoco, el predeterminado del CLI.
- **Puestos de los becarios**: siempre hay un puesto de apoyo fijo («Apoyo»). Si está ocupado y otro agente necesita
  un becario, se crea un **puesto temporal** al fondo del mapa: aparece con el becario y desaparece cuando se va.
  Así varios becarios trabajan a la vez en lugar de esperar (hasta 6 en puestos temporales). Se ve igual en el
  escritorio, el navegador y Órbita. Para desarrolladores: `src/shared/tempStations.ts` (ids `st-sub-tmp-N`, sitios y
  `withTempStations` para el 3D) y `freeSubStation` en `orchestrator.ts`.
- **Agentes en forma geométrica**: en el espacio 3D los puestos forman un polígono regular alrededor del Proyecto,
  todos a la misma distancia entre sí: 3 agentes son un triángulo, 4 un cuadrado, 5 un pentágono, etc. El puesto
  fijo del becario cuenta siempre como uno más (aunque esté vacío) y los puestos sin agente ya no se dibujan. Hermes va
  delante y el becario al fondo a la derecha; con un número par de puestos el polígono se gira medio paso para que
  ninguno quede escondido detrás del Proyecto. Los becarios de más no ocupan un vértice: salen pegados al becario
  original, como una extensión de su puesto hacia fuera (filas de 1, 2 y 3). Con 10 o más puestos el polígono rodea
  también las zonas de los lados. Es solo cómo se dibuja: la configuración guardada no cambia. No se aplica a los
  temas Casa (kywai) ni Submarino, que tienen sus propios sitios, ni todavía a la vista 3D de Órbita. Para
  desarrolladores: `src/renderer/src/scene/polygonLayout.ts` (con pruebas) y el anillo de `Circuits.tsx`, que sigue
  los lados del polígono.
- **Gemini CLI** está configurado con una clave de API: si esa clave tiene facturación activa, su uso puede tener coste.
- **Agente local**: se configura desde el indicador **Local** de la cabecera → «Agente local». Puedes elegir
  **LM Studio** u **Ollama**, el modelo, el nombre del agente y si su uso es sin límite. Con Ollama se pueden
  descargar modelos desde ahí mismo; con LM Studio se descargan en su aplicación y kywai puede encender su
  servidor local. Ahora mismo está configurado como **Gemma** (Gemma 4 12B QAT en LM Studio).
- **El agente local trabaja con herramientas** (solo con LM Studio): lista, busca, lee, crea y edita archivos de la
  carpeta del proyecto, busca en internet y lee páginas web (nunca direcciones de tu red local). Si LM Studio tiene
  el modelo cargado con poco contexto, la app lo recarga con 32 k tokens la primera vez (tarda unos segundos).
  Cada respuesta del modelo se espera el tiempo que haga falta (un modelo local que razona mucho puede tardar más de
  5 minutos en una sola respuesta); solo se dice «Servidor de LM Studio apagado» cuando LM Studio rechaza la conexión.
  Si la corta a mitad, la tarea dice «LM Studio cortó la respuesta» con el motivo.
- **LM Studio se enciende solo**: si su servidor está apagado, kywai lo enciende (con `lms server start`) al
  arrancar, al pulsar ⟳ en las cuotas (o pedir /cuota) y, si se apagó entre medias, antes de que el agente local
  empiece una tarea; y deja el modelo cargándose
  con 32 k de contexto. La comprobación automática de cada 30 s no lo enciende, para respetar que lo apagues a mano.
  Si aun así sale «No disponible: Servidor de LM Studio apagado», la tarjeta del agente (clic en su robot) tiene el
  botón **Encender LM Studio**: enciende el servidor, carga el modelo y deja el agente disponible. Si no puede, dice
  por qué (por ejemplo, que LM Studio no está instalado).
- **Permisos de los agentes** (menú ⚙ → Ajustes → «Permisos de los agentes»; también en Ajustes de Órbita), tres modos:
  - **Acceso completo** (por defecto): Claude, Codex y Gemini ejecutan comandos, instalan dependencias y usan internet
    sin pedir permiso, para no quedarse parados. Se les indica que trabajen en la carpeta del proyecto y que no borren
    nada fuera de ella ni hagan acciones irreversibles que no se hayan pedido, pero no hay nada que se lo impida.
  - **Preguntarme antes**: lo que no tienen permitido te lo piden y esperan, como hace Claude Code en su terminal (ver
    [«Preguntarme antes»](#preguntarme-antes-los-agentes-te-piden-permiso)).
  - **Solo el proyecto**: solo editan la carpeta del proyecto; los comandos que necesitan aprobación se deniegan (y
    Codex no tiene internet). Si la tarea lo necesita, acaba «BLOQUEADA».

#### «Preguntarme antes»: los agentes te piden permiso

En este modo nada se hace a tus espaldas y nada se queda parado sin preguntarte. Cuando un agente quiere hacer algo
que no tiene permitido, sale **en el chat** (con los botones debajo del mensaje), **en «Te necesita»** y **en Órbita**
(con notificación): «Claude pide permiso para ejecutar un comando: `npm install`». Tres botones:

- **Denegar**: no lo hace; sigue con lo que pueda sin eso y, si sin eso no se puede, acaba «BLOQUEADA».
- **Permitir una vez**: lo hace esta vez.
- **Permitir siempre en esta sesión**: no vuelve a preguntarlo ese agente en ese proyecto hasta que kywai se reinicie.
  En un comando cuenta el programa (permitir `npm install` permite también `npm run build`, no `rm`).

Contestar en un sitio cierra los otros. Mientras espera, el agente sale «Esperando tu permiso» y **no se le corta**
por estar callado (el aviso de los 3 minutos y el corte de los 20 no cuentan mientras espera). Si detienes la
petición, lo que esperaba respuesta se deniega.

- **Claude Code** pregunta a mitad de tarea cada cosa que necesite (usa las herramientas de kywai con
  `--permission-prompt-tool`; las ediciones dentro de la carpeta del proyecto no se preguntan).
- **Codex, Gemini, Qwen y Muse** no pueden preguntar a mitad de tarea cuando trabajan solos: trabajan en la carpeta
  del proyecto y, si necesitan más, responden «PERMISO: lo que necesitan». Se te pregunta «trabajar con acceso
  completo en esta tarea» y la tarea se repite en su misma sesión: con acceso completo si lo permites («siempre en
  esta sesión» se lo da para el resto de tareas de ese proyecto) o sabiendo que lo denegaste.

En el código: `src/main/permissions.ts` (peticiones, respuestas y lo permitido en la sesión), la herramienta
`pedir_permiso` de `coworkMcp.ts`, `accessFor` y `handlePermissionNeed` en `orchestrator.ts`; pruebas en
`coworkMcp.test.ts` y G5/G6 de `orchestrator.check.ts`. Los avisos son del tipo `permission` y el mensaje del chat
lleva `permission` con su estado.
- **Instalar el motor local desde kywai**: en el indicador Local → «Agente local», la pestaña de un motor que no está
  instalado (LM Studio, Ollama o Colibri) tiene el botón **Instalar**, como los agentes en el asistente: usa la misma
  instalación (Homebrew en Mac o, sin él, la descarga oficial; winget en Windows; su instalador en Linux) y enseña la última línea de lo que va
  haciendo. LM Studio se abre una vez al terminar, porque su CLI `lms` aparece la primera vez que se abre; Ollama
  queda en marcha.
- **Colibri como motor local** (pestaña **Colibri** en el indicador Local → «Agente local», y en el paso Agentes del
  asistente). [Colibri](https://github.com/JustVugg/colibri) (licencia Apache-2.0) sirve modelos MoE grandes
  (Qwen3.6, GLM, DeepSeek…) dejando en la GPU lo que más se usa, en RAM lo templado y leyendo del disco el resto.
  Habla la API de OpenAI con herramientas, así que el agente local trabaja con él igual que con LM Studio (mismas
  herramientas, sin terminal, razonamiento apagado). Cómo funciona:
  - **Instalación**: botón **Instalar** en su pestaña (pide un segundo toque) o en el paso «Programas» del asistente.
    kywai lo baja en `~/colibri` (con git; en Windows, el zip) y ejecuta su instalación sin preguntas
    (`start-here.sh --yes --background --no-browser`): elige el modelo recomendado para la RAM y el disco del equipo,
    prepara el motor y descarga el modelo (19 GB o más; hasta 6 horas de espera, y si se corta, volver a pulsar
    reanuda la descarga). En Mac instala antes con Homebrew `libomp` y un Python 3.10 o más nuevo si faltan. También
    se puede instalar a mano con su `./start-here.sh`. kywai lo
    detecta por el `setup.json` que deja (`~/Library/Application Support/colibri` en Mac,
    `~/.local/share/colibri` en Linux, `%LOCALAPPDATA%\colibri` en Windows; `COLI_SETUP_HOME` lo cambia) y usa su
    dirección y su puerto (127.0.0.1:8000 de fábrica). En el asistente sale como programa con su enlace.
  - **Encender**: con «Encender» en el indicador Local, el botón **Encender Colibri** de la tarjeta del robot o al
    arrancar una tarea, kywai ejecuta `coli start --background --no-browser` y espera hasta 15 minutos a que cargue
    el modelo. Al arrancar la app, con ⟳ o /cuota se enciende en segundo plano y el agente sale «Colibri se está
    encendiendo» hasta que el modelo responde.
  - **Un modelo a la vez**: Colibri sirve el que eligió su instalación. Si el nombre guardado en kywai no coincide con
    el que sirve (por ejemplo `qwen36-35b` frente a `qwen3.6`), se usa el que sirve. Para cambiarlo:
    `./start-here.sh --reconfigure` y ⟳.
  - **Otra dirección** («Dirección del servidor», vacía por defecto): sirve para un Colibri en otro puerto o en otro
    equipo de Tailscale, y para cualquier otro servidor compatible con OpenAI (llama.cpp, MLX…). Con otra dirección
    kywai no lo enciende: solo lo usa. Se guarda en `config.json` como `colibriUrl`.
  - **Otros servidores encontrados**: cada vez que se abre la tarjeta (o con ⟳), kywai mira en este equipo
    (127.0.0.1) los puertos de fábrica de **llama.cpp** (8080, también llamafile, LocalAI y MLX), **KoboldCpp** (5001),
    **Jan** (1337), **text-generation-webui** (5000), **GPT4All** (4891), **vLLM** (8000), **SGLang** (30000) y
    **LiteLLM** (4000). Solo pregunta `GET /v1/models`, todos a la vez y con 1,5 s de espera como mucho, así que no
    cambia nada ni frena. Los que responden salen en **«Encontrados en este equipo»** con su nombre (por el
    `owned_by` de sus modelos o, si no lo dice, por el puerto), su dirección y sus modelos, y un botón **Usar** que
    guarda esa dirección: después se elige el modelo como siempre. La pestaña pasa a llamarse como el servidor
    («llama.cpp») y, si Colibri no está instalado pero hay servidores, dice «N encontrado(s)». El puerto del propio
    Colibri instalado no cuenta como otro servidor. Ollama y LM Studio tienen su propia pestaña. Código:
    `src/main/localServers.ts` (+ prueba) y `colibriEngineStatus` en `src/main/local.ts`.
  - **Velocidad**: con un modelo mediano que cabe en RAM (Qwen3.6-35B-A3B, unos 6 tokens/s solo con CPU) va bien
    para tareas sin prisa. Con los gigantes (GLM-5.2, DeepSeek V4) baja de 1 token/s y no sirve para tareas de
    agente. Hermes sabe que es lento y le da solo tareas acotadas.
  - **AirLLM** se estudió y se descartó: es una librería de Python sin servidor, muy lenta y sin herramientas.
  - Para desarrolladores: `src/main/agents/colibri.ts` (instalación, encendido y `runColibri`), que reutiliza el
    bucle de LM Studio (`runOpenAiLocal` en `lmstudio.ts`); motores en `src/shared/localEngines.ts`.
- **Permisos de los agentes** (menú ⚙ → Ajustes → «Acceso completo para los agentes», activado por defecto): Claude, Codex y
  Gemini ejecutan comandos, instalan dependencias y usan internet sin pedir permiso, para no quedarse parados.
  Se les indica que trabajen en la carpeta del proyecto y que no borren nada fuera de ella ni hagan acciones
  irreversibles que no se hayan pedido, pero no hay nada que se lo impida: desactívalo si prefieres que solo editen la
  carpeta del proyecto (entonces los comandos que necesitan aprobación se deniegan y Codex no tiene internet).
- **Si un agente se queda callado** 3 minutos, su línea de actividad (también en Órbita y en el navegador) avisa de
  que puede estar esperando un aviso de permisos en la pantalla del servidor (macOS o el llavero), que solo se
  contesta delante del equipo. Si no vuelve a dar señales en 20 minutos, se corta (y si el programa no se cierra
  por las buenas, se le fuerza: la tarea no queda colgada más allá de ese corte). Para que no pase, mira
  «Permisos de macOS en el servidor».
- **Ventanas de permisos de macOS, al momento**: antes de lanzar un agente, la app prueba a abrir la carpeta del
  proyecto. Si en 4 segundos no lo consigue es que macOS está preguntando en la pantalla del Mac (p. ej. «kywai
  quiere acceder a Documentos»): la tarea lo dice enseguida («Esperando a que aceptes en la pantalla del Mac…») y
  espera la respuesta en vez de lanzar al agente a ciegas; si macOS lo deniega, la tarea dice dónde activarlo. Además
  la app lee en directo el registro de privacidad de macOS y avisa de cada ventana que ella o sus agentes dejan
  pendiente (Documentos, Descargas, micrófono…), también las que salen a mitad de una tarea, para mandarlas al móvil.
  Nadie puede pulsar «Permitir» por programa (lo impide macOS): hay que contestarla delante del Mac o por Compartir
  pantalla. Código: `src/main/macPermissions.ts` (la comprobación la hace `runCli` en `agents/spawn.ts`).
- **Permisos de macOS en el servidor**: los agentes heredan los permisos de la app. Para que nunca se queden
  esperando una ventana que solo se contesta delante del Mac, en Ajustes del Sistema → Privacidad y seguridad activa
  para «kywai» (y para Terminal, si lanzas cosas desde ahí): **Acceso total al disco** (Escritorio, Documentos,
  Descargas, iCloud y discos externos) y, solo si quieres que los agentes manejen otras apps, **Automatización** y
  **Accesibilidad**. La app trae los textos
  que macOS pide para mostrar esas ventanas, y se firma con un certificado propio de este Mac (ver «Firma en Mac»)
  para que los permisos no se pierdan al actualizar. Riesgo: un agente que se equivoque, o un texto malicioso que lea
  en una web, puede tocar cualquier archivo del Mac sin que nadie lo pare.
- **Si un agente no puede con una tarea** (error, o «BLOQUEADA» sin nada hecho), la intenta otro una vez antes de
  darla por fallida (una «BLOQUEADA» con algo hecho va a «Te necesita»: ver «Tareas bloqueadas»):
  un becario se la devuelve a su jefe y, si no, pasa al compañero más adecuado. Si la tarea no es fácil, el relevo
  nunca es el modelo local (es lento y ligero): va a otro agente fuerte y, si no hay ninguno libre, el mensaje lo dice
  en vez de pasársela a quien casi seguro también fallará. Para elegirlo cuentan las fortalezas y «lo que conviene no
  darle» de cada agente solo hasta los dos puntos o el paréntesis (la explicación de después nombra a otros agentes y
  sumaba o restaba por casualidad). Un agente sin cuota o con la sesión
  caducada queda apartado un rato (15 y 3 minutos) y después se vuelve a probar.
- **Codex** en modo protegido usa el entorno estándar de Windows (`windows.sandbox=unelevated`): el «elevated» que
  configura la app de escritorio de Codex no funciona fuera de ella y le impedía ejecutar comandos.
- **Pegar imágenes**: Ctrl+V en el cuadro de texto adjunta las capturas del portapapeles.
- **Arrastrar archivos al chat**: soltarlos sobre el panel del chat los deja encima del cuadro de escribir. En el
  escritorio se adjunta el archivo de tu equipo; en el navegador y en el cliente de escritorio no hay ruta en el
  servidor, así que se sube primero (como al pegar con Ctrl+V) y, si falla, sale el aviso en rojo bajo el cuadro.
  Antes, en el navegador y en el cliente, soltar un archivo dejaba la ventana en negro (`pathForFile` iba por la red
  y devolvía una promesa en vez de una ruta). Un archivo soltado fuera del chat (espacio 3D, barra lateral) no hace
  nada: ya no puede sustituir la interfaz por el archivo.

**Cuánto se espera a Hermes.** Un plan normal le lleva entre 20 y 60 segundos, y uno grande, más de 2 minutos solo
en escribirse. Como Hermes no enseña nada hasta terminar, kywai le espera hasta 6 minutos y después planifica el
siguiente coordinador. Se le piden planes escuetos (cada tarea en 2 a 6 frases, sin repetir la petición, que los
agentes ya reciben completa), así que se escriben antes.

### Respuestas rápidas: lo sencillo lo contesta el coordinador

Una pregunta sencilla no pasa por un plan, un encargo y otro agente que arranca desde cero: la contesta el
coordinador en la misma llamada en la que lee tu mensaje, que es cuestión de segundos.

- **Qué contesta él**: todo lo que se resuelve sin abrir ni cambiar archivos del proyecto y sin ejecutar nada.
  Charla, dudas sobre kywai, conocimiento general y explicaciones («¿qué diferencia hay entre…?»), comparaciones y
  consejos que no dependen de tu código, textos cortos (redactar, traducir, resumir o corregir algo que va en el
  mensaje), cuentas y preguntas sobre la conversación o sobre lo que el equipo ya hizo. Si basta una búsqueda
  sencilla en internet, la hace él (Hermes tiene herramienta web al planificar).
- **Cuándo reparte**: cuando hace falta leer o cambiar el proyecto, ejecutar algo, producir un archivo, investigar a
  fondo o una capacidad que él no tiene (ver o generar imágenes). Ahí todo sigue igual: plan, agente adecuado,
  esfuerzo alto y verificación por otro agente.
- **Lo que no hace**: contestar de memoria algo que depende de tus archivos. Eso sigue yendo a un agente que los lee.
- **Consulta rápida**: si la pregunta solo necesita mirar el proyecto («¿dónde está…?», «¿qué versión usa…?»,
  «¿qué hace este archivo?», «¿está hecho X?»), el coordinador la marca como consulta rápida (`"quick": true` en su
  plan). kywai la lanza al momento a un becario del agente elegido, con su modelo rápido y un encargo corto (la
  pregunta, la conversación, la memoria y pocas reglas; sin lista de pasos, sin narrar el avance y sin resumen
  final). No espera a que ese agente termine lo que esté haciendo, no cuenta para el tope de tareas a la vez, no pide
  tu visto bueno aunque lo tengas encendido (no cambia nada) y va sin instantánea ni copia de la carpeta porque solo
  lee. Su respuesta sale tal cual en el chat. Si al mirarlo ve que hace falta un análisis a fondo, lo dice.
- **Lo que sigue siendo una tarea normal**: el diagnóstico y las recomendaciones («¿por qué falla…?», «¿qué me
  recomiendas…?», una revisión). Van con el modelo principal y esfuerzo alto: ahí manda la calidad. Si una consulta
  rápida se te queda corta, pide que lo miren «a fondo».
- **Si planifica otro**: cuando Hermes no está y planifica Claude, Codex o Gemini, ellos sí pueden leer la carpeta
  (planifican en modo de solo lectura), así que la guía ya no les dice que no pueden: las consultas que salen de
  mirar unos pocos archivos las miran y las responden ellos, sin crear una tarea.

Las reglas están en `buildPlanPrompt` ([src/main/orchestrator.ts](../src/main/orchestrator.ts)) y en la guía del
coordinador ([src/main/coordinatorGuide.ts](../src/main/coordinatorGuide.ts)).

### Lo que sabe el coordinador de kywai

En cada petición, el coordinador recibe una guía de cómo funciona kywai
([src/main/coordinatorGuide.ts](../src/main/coordinatorGuide.ts)), con datos del momento, para reaccionar bien:

- **Cambios en kywai en sí** (su música, su interfaz, sus funciones): no son trabajo del equipo, que solo
  trabaja en la carpeta del proyecto. Lo explica en vez de lanzar tareas. Sabe en qué carpeta está el código de
  kywai en ese equipo: ninguna tarea debe tocarlo (los cambios locales bloquean las actualizaciones), y si la
  carpeta del proyecto es ese código, avisa antes de tocar nada.
- **Capturas adjuntas**: Hermes solo lee texto, así que si tu mensaje lleva imágenes planifica y responde quien
  puede verlas (Claude; si no está, Codex o Gemini). Si solo queda Hermes, encarga a Claude o Codex que las miren
  en vez de pedirte que se las describas.
- **Imágenes**: solo las genera Codex. Gemini también puede, pero no alcanzan la calidad necesaria.
- **Lo que nadie puede hacer**: audio, música, voz o vídeo de verdad (lo más cercano es código que lo genere).
  Los modelos locales son lentos y flojos investigando o creando: si se piden, avisa de qué saldrá.
- **Instalar y usar internet**: sabe qué modo de «Permisos de los agentes» está puesto. Con «Solo el proyecto», no lanza lo que
  necesita instalar (una APK necesita el SDK de Android, Java y Gradle) y pide que se active antes.
- **Ficha automática del proyecto**: en cada planificación recibe una ficha de la carpeta que kywai hace sin
  llamar a ningún modelo: el principio del README, con qué se construye y se prueba (`package.json` y otros
  manifiestos, el comando de pruebas detectado), qué archivos se tocaron en los últimos días y el árbol de carpetas
  (hasta 150 entradas, sin `node_modules`, compilados ni datos de la app). Así el plan y el contrato no salen de
  suposiciones aunque el coordinador no pueda abrir archivos.
- **Preguntas sobre el proyecto**: Hermes no puede leer los archivos, así que las preguntas que dependen del código
  («¿qué me recomiendas para…?», «¿por qué falla…?») no las contesta de memoria: crea una tarea de texto para Claude
  o Codex, que sí los leen, y responde él. Lo que no depende de los archivos lo contesta él mismo (ver
  [Respuestas rápidas](#respuestas-rápidas-lo-sencillo-lo-contesta-el-coordinador)).
- **Peticiones ambiguas**: si no está claro sobre qué trabajar y equivocarse tiraría un trabajo largo (¿la app del
  proyecto o kywai?), pregunta antes.
- **Funciones de kywai**: para responder dudas (acceso desde el móvil y sus direcciones, micrófono, órdenes
  del chat, memoria, consumo…) sin crear tareas. Esta lista (unos 5 000 caracteres) solo se le envía cuando tu
  petición o tus últimos mensajes hablan de kywai (la app, el móvil, Hermes, las cuotas, los temas…); en una
  petición de trabajo normal se omite para que el coordinador se concentre en lo que pides.
- **Agentes con muy poca cuota** (como Muse): solo les da lo que los demás no pueden hacer o trabajo cuando los
  demás están sin cuota.
- **Tu visto bueno**: sabe que revisarás su plan antes de empezar, así que en su respuesta cuenta qué ha entendido,
  qué hará cada agente y por qué ese, y lo que da por supuesto (para que lo corrijas). Si le pides cambios, recibe
  su plan anterior y tu respuesta.

Cada tarea recibe además dos reglas: no entregar audio o imágenes de mentira y no tocar el código de kywai.
Para normas de un proyecto concreto, usa sus instrucciones (pestaña Memoria).

### Tu visto bueno a cada plan

Antes de que nadie empiece, Hermes (o el coordinador que planifique) te enseña su plan en el chat: qué ha
entendido, cada tarea con el agente que la hará y por qué ese, y si kywai lo ha ajustado (por ejemplo, juntar
«diseñar» con «construir»). Toca una tarea para ver sus instrucciones. Entonces:

- **«Aprobar y empezar»** (o responder solo «sí», «ok, adelante»…) crea las tareas y el equipo se pone en marcha.
- **Escribirle qué cambiar** («mejor que lo haga Codex», «sin la investigación») hace que replanifique con su plan
  anterior y tu respuesta; el anterior queda plegado como «Plan cambiado por tu respuesta».
- **«Descartar»** no hace nada.

El plan queda guardado en su mensaje: se puede aprobar aunque kywai se haya reiniciado entre medias. Lo que
dijiste que conviene recordar se anota en la memoria al aprobarlo. Las preguntas y respuestas directas no
necesitan visto bueno. Para que las tareas empiecen sin esperar, desactiva ⚙ → Ajustes → «Pedir mi visto bueno a cada
plan» (también en la app del móvil: Ajustes o Herramientas → Planes de Hermes).

### «Te necesita»: lo que espera una decisión tuya

La campana de la cabecera (y la de Órbita, que además avisa con una notificación del móvil mientras sigue
conectada) junta en un solo sitio lo que está esperando por ti, con sus botones:

- **Un plan** pendiente de tu visto bueno: «Aprobar» o «Descartar» sin ir al chat.
- **Un permiso de macOS** (Documentos, Escritorio…) que solo se acepta delante del servidor: «Abrir Compartir
  pantalla» lo abre desde el móvil o el portátil. Para que no vuelva a pasar, da «Acceso total al disco» a kywai.
- **Un agente callado** desde hace rato (suele ser un aviso así en la pantalla del servidor).
- **Una pregunta** del equipo, una tarea que **requiere intervención** (la verificación sigue viendo fallos tras 2
  correcciones y un relevo; sus archivos se quedan y «Deshacer la tarea» los quita), **choques** al integrar una copia
  aparte o una tarea que **no se pudo hacer** («Deshacer» deja sus archivos como estaban).
- **Tareas en pausa**: lo que quedó a medias al cerrarse o reiniciar el servidor (o al detenerlo desde el móvil),
  con «Reanudar» (sigue donde se quedó) y «Quitar» (no se reanudará). Funcionan aunque la petición sea de otra
  conversación del proyecto y kywai se haya reiniciado desde entonces: la buscan en las conversaciones guardadas
  (`locateRun` en `src/main/conversations.ts`). Si ya no queda nada en pausa (por ejemplo, borraste esa conversación),
  la tarjeta se cierra con «Ya no quedaba nada en pausa» en vez de dar error (prueba X2 de `orchestrator.check.ts`).
- **Un permiso que pide un agente** (modo [«Preguntarme antes»](#preguntarme-antes-los-agentes-te-piden-permiso)):
  «Denegar», «Permitir una vez» o «Permitir siempre en esta sesión». Sale también en el chat con los mismos botones.
- **Una tarea bloqueada** (ver [abajo](#tareas-bloqueadas-le-falta-algo-no-es-un-error)): el agente dijo que le falta
  algo para terminarla. «Darla por buena así», «Contestarle en el chat» o «Pasársela a otro agente».
- **El presupuesto de API** del mes, al llegar al 80 % y al pasarlo.

Solo cuenta lo que espera algo de ti. **Lo terminado no va aquí**: la última petición acabada de cada proyecto sale
arriba en **Resultados**, en «Recién terminado», con su número en la barra lateral, «Visto» y «Marcar todo como visto»
(Órbita igual, y además manda la notificación al terminar por su propio canal, «Terminado», que se puede silenciar
aparte en Android; tocarla abre Resultados).

Los avisos salen **en el idioma de cada app**, aunque el servidor use otro: el motor guarda cada aviso escrito en todos
los idiomas (`texts` en la API) y el escritorio, la web y Órbita muestran el suyo. Lo que un agente escribe con sus
palabras (las notas del revisor, una pregunta) va en el idioma con el que trabaja el servidor (⚙ → Ajustes → Idioma
en el servidor).

Tocar el título lleva a su proyecto. Los avisos se cierran solos cuando ya no hacen falta (el plan se aprueba,
la tarea termina o el agente vuelve a hablar). La lista se guarda en `inbox.json` de la carpeta de trabajo;
la API del móvil la da en `GET /inbox` y `POST /inbox/{id}/{acción}`, y avisa con el evento `inbox.updated`.

**La X de cada aviso** (arriba a la derecha, junto a «hace 1 min»; en Órbita igual) lo **descarta para siempre**: se
quita en el escritorio, el cliente, la web y Órbita a la vez, no vuelve tras reiniciar y, si el mismo aviso se repite
(misma clave, p. ej. el mismo agente callado en la misma tarea), se actualiza sin volver a salir. **No toca la tarea**:
no aprueba, no deniega ni para nada. Lo que esperaba sigue esperando en el chat (por ejemplo, un permiso descartado aún
se contesta con los botones del mensaje). Por dentro es `actInbox(id, 'hide')` (`POST /inbox/{id}/hide` en la API del
móvil), que marca `dismissedAt` en `inbox.json` (`dismissInbox` en `src/main/inbox.ts`).

#### El aviso cuando llega algo nuevo

Cuando entra algo nuevo en «Te necesita» (en cualquier proyecto), kywai te avisa de tres maneras a la vez:

- **La campanita de la barra lateral palpita** en dorado con un brillo suave y se mece un poco. Sigue así hasta que
  abres «Te necesita»; luego se queda quieta con su número. Con «Reducir movimiento» del sistema solo brilla.
- **Suena su propio timbre**: una campanita de mostrador (dos toques metálicos y un eco más grave), distinta de
  cualquier otro sonido de kywai. Va con el interruptor **«Efectos y avisos»**: si lo silencias, no suena (la música de fondo da igual). En la app
  de escritorio suena aunque no hayas tocado la ventana desde que se abrió o actualizó (`playAlert` en `lib/audio.ts`
  arranca el audio); en un navegador solo suena si ya hiciste algún clic en la página.
- **En el espacio 3D el coordinador te llama**: una campanita dorada palpita sobre su cabeza y sobre su etiqueta
  (con el borde de la etiqueta latiendo) y, al llegar el aviso, se vuelve hacia ti, saluda con la mano unos segundos
  (con «Personajes» hace su movimiento de saludo; con los robots «Clásico» o «Refugio Kywai» se balancea de lado a
  lado) y dice «¡Te necesito! Hay algo nuevo en «Te necesita».» con su voz. La voz va con el interruptor
  **«Voces de los agentes»**. Hacer clic en la campanita (la de su cabeza o la de su etiqueta) abre «Te necesita»;
  mientras lleva la campanita, hacer clic en el coordinador o en cualquier parte de su etiqueta también abre
  «Te necesita» (y no su ficha). Cuando ya no la lleva, hacer clic en él abre su ficha, como con cualquier agente.
  Si no lo quieres, apágalo en ⚙ → Ajustes → Agentes → **«El coordinador te avisa en el 3D»** (por dispositivo): el
  coordinador ya no lleva la campanita, ni saluda ni te llama; la campanita de la barra y su timbre siguen avisando.

El coordinador es el primero de la lista de quién planifica (⚙ → Agentes), así que si cambias de coordinador, la
campanita pasa al nuevo. Lo que ya estaba en la bandeja al abrir la app (o lo que tiene más de 5 minutos al
reconectar) solo hace palpitar la campanita, sin sonar ni llamar. Lo informativo («Terminado») no avisa.
El código está en `src/renderer/src/lib/inboxAlert.ts` (qué es nuevo, prueba en `inboxAlert.test.ts`), el timbre
`needsYou` en `lib/audio.ts`, la campanita de la barra en `ui/header/InboxButton`, y la del 3D en `scene/Robot.tsx`
(sprite), `scene/RobotLabel.tsx` (etiqueta y bocadillo dorado) y `scene/robotBrain.ts` (`callUser`).

### Tareas bloqueadas: le falta algo, no es un error

Cuando un agente empieza su respuesta con «BLOQUEADA: …» es que le falta algo que no puede conseguir solo (una
herramienta, un dato, acceso, una decisión tuya). Antes kywai lo trataba como si el agente se hubiera roto: tarjeta en
rojo con «Error» y «Reiniciar agente», el motivo cortado a 400 caracteres y lo que sí había hecho (por ejemplo, dos
vídeos de prueba) sin salir en el chat. Ahora:

- **El agente no se pone en error.** Queda «Disponible» y su tarjeta del 3D lleva un aviso ámbar «Bloqueada: «tarea»»
  con todo lo que explicó (se pliega si es largo, «Ver todo») y los enlaces a sus archivos, que se abren en la vista
  previa. El aviso se quita al decidir qué hacer o cuando el agente empieza otra tarea.
- **Si no dejó nada hecho**, otro agente lo intenta una vez como antes (quizá a él no le falta la herramienta): un
  becario se la devuelve a su jefe y si no pasa al compañero más adecuado.
- **Si dejó algo hecho, o nadie más puede**, lo hecho sale en el chat como **resultado parcial** (la tarea dice
  «Bloqueada: te necesita» en ámbar, con sus archivos y su explicación entera), lo que dependía de ella espera y va a
  «Te necesita» con tres botones:
  - **Darla por buena así** (solo si dejó algo hecho): queda como hecha y sigue lo que dependía de ella (si la
    petición ya había terminado, se reanuda).
  - **Contestarle en el chat**: le respondes con lo que le faltaba y el coordinador le encarga la continuación al
    mismo agente, que retoma su sesión.
  - **Pasársela a otro agente**: la retoma el más adecuado, sabiendo quién se bloqueó y por qué, y continúa desde lo
    que quedó hecho.
- **No castiga al agente**: en «Cómo rinde cada agente» una tarea bloqueada no cuenta como «Falló o pasó a otro», y por
  tanto tampoco para la mala racha.

En un mensaje directo («@Codex …») «BLOQUEADA» no significa nada especial: la respuesta sale tal cual. En el código:
`handleBlocked`, `blockedNeedsYou` y `settleBlocked` en `src/main/orchestrator.ts` (pruebas G, G3 y G4 de
`orchestrator.check.ts`); el aviso de la tarjeta es `AgentRuntime.notice` y la tarea lleva `needsYou`.

### Criterio de aceptación y archivos de cada tarea

Cada tarea que crea o cambia archivos lleva un **criterio de aceptación** («npm test pasa y la página carga sin
errores»): el agente lo comprueba antes de terminar y dice si se cumple. Cuando varias tareas trabajan a la vez,
cada una lleva además **sus archivos**: solo puede tocar esos, y si al terminar cambió archivos de otra tarea,
aparece un aviso en el chat («Codex cambió archivos que no eran de su tarea…») y en su registro de pasos. No se
deshace nada: es para que lo revises. Ambos se ven en el «Encargo» de la ventana de la tarea; el contrato común
del equipo, plegado bajo el plan en el chat.

### A dos manos: dos agentes, dos opciones y un juez

Para lo que depende del gusto (una web, una landing, una interfaz, un póster, una presentación, un logo) no hay
truco que suba el techo de calidad de forma tan segura como hacerlo dos veces y elegir. Pero duplica la espera (hay
que esperar a la versión más lenta y luego al juez: medido, un mapa pasó de unos 4 min a 13), así que **solo se
hace si lo pides**; por defecto, una sola versión. Cuando lo pides, el coordinador lo reparte **a dos manos**: dos agentes de familias distintas (por ejemplo Codex y
Claude) hacen la misma tarea por separado, cada uno en su carpeta (`artifacts/opcion-a/` y `artifacts/opcion-b/`,
o `.ai-cowork/entregables/opcion-a/` y `opcion-b/` si el proyecto es una carpeta tuya), sin verse, y un tercero de
otra familia (Gemini, si está) abre las dos, las prueba, las compara contra tu petición en los dos órdenes (para
no favorecer a la primera que mira) y responde «GANA: A» o «GANA: B» con el porqué, qué tiene mejor la otra y qué
cambiaría de la ganadora. La respuesta final te dice dónde está cada opción y cuál recomienda; tú te quedas con
la que quieras y puedes pedir que se siga con ella.

Se pide con **«a dos manos»**, **«dos opciones»** o **«dos propuestas»** en la petición (vale para cualquier cosa, no
solo lo visual: si el coordinador no lo hace, kywai lo hace por él, siempre que el plan sea una sola tarea con
archivos y haya otro agente de otra familia disponible). Nunca en continuaciones ni correcciones.

### Imágenes: generadas, no dibujadas con código

Si pides una imagen (una ilustración, un mapa visual, un póster, un logo, un icono), el coordinador se la da al
agente que genera imágenes (hoy Codex) y le pide que la **genere con su herramienta de imágenes** en vez de
dibujarla con un programa (SVG o scripts), que tarda mucho más. Si quieres algo editable o exacto (un diagrama SVG,
un plano), dilo y se hará con código. Las piezas visuales (imágenes, pósteres, logos, mapas, infografías, no las
webs ni las apps) van con **esfuerzo medio**: ahí manda el ojo, no el razonamiento, y con esfuerzo alto Opus llegó
a pasar más de 4 minutos pensando en silencio antes de empezar un mapa.

### Los agentes retoman su sesión en las continuaciones

Cuando una petición continúa, amplía o corrige lo que un agente hizo en la anterior («ahora añade el teléfono al
formulario», «sigue con la parte del móvil»), el coordinador marca esa tarea como continuación y se la da al mismo
agente, que **retoma la sesión del CLI con la que trabajó**: Claude Code con `--resume` y Codex con `exec resume`.
Vuelve con todo lo que leyó, hizo y decidió entonces en su memoria de trabajo, en vez de redescubrir el proyecto
desde cero (que es donde más se perdía calidad entre peticiones). Lo mismo pasa cuando el verificador le pide
corregir algo: corrige en su misma sesión. Se le avisa de que otros pueden haber tocado archivos desde entonces para
que compruebe el estado actual antes de cambiar nada.

La última sesión de cada agente en cada proyecto se guarda en `workspace/agent-sessions/<proyecto>.json` y vale
catorce días, solo para el mismo CLI y la misma carpeta de trabajo. Si la sesión ya no existe o no se puede retomar,
la tarea se repite desde cero sin más. Solo Claude Code y Codex saben retomar sesiones; los demás agentes siempre
empiezan de nuevo. Para que esto funcione, las sesiones de trabajo de Claude Code ya no se lanzan con
`--no-session-persistence` (el CLI las limpia solo a los 30 días); planificar y verificar siguen sin dejar rastro.

### Verificación por otro agente

Cuando una tarea que crea o cambia archivos termina, **otro agente de otra familia** (Codex si lo hizo Claude, y al
revés; nunca el autor ni un modelo local) comprueba el resultado con ojos nuevos y en modo de solo lectura: recibe
tu petición, la tarea, el criterio de aceptación, los archivos que cambió y lo que dijo el autor; los lee, recibe
las pruebas que se ejecutaron de verdad (ver abajo) y responde «VEREDICTO: CUMPLE» o «VEREDICTO: FALLOS» con hasta cinco fallos concretos. Se le
pide ceñirse a la corrección y a lo pedido, nada de gustos. **Solo un «CUMPLE» explícito aprueba una tarea.**

| Situación | Qué hace kywai |
|---|---|
| El verificador responde sin veredicto reconocible | Se lo pide a **otro verificador fiable** desde cero (insistir al mismo suele dar lo mismo: un CLI con un modelo retirado responde siempre con el mismo error). Si no hay otro, se lo pide una vez más al mismo, conservando lo que ya revisó. Un agente que en 30 días acabó sin veredicto la mitad de sus revisiones o más deja de verificar mientras haya otro |
| Tampoco lo da la segunda vez | La tarea queda **«sin verificar»**: «⚠ Sin verificar» en el resultado y no cuenta como aprobada ni como suspendida en las cifras |
| Veredicto «FALLOS» | El autor corrige sobre lo que ya hay (recibe la lista), **hasta 2 veces**, y cada corrección se vuelve a verificar |
| Sigue fallando tras las 2 correcciones | **Un relevo** a otro agente fuerte libre (nunca el autor ni un modelo local para lo que no es fácil), con las notas del verificador, los archivos que cambió el autor y lo que contó (sus pruebas). No retoma la sesión del autor: es otro CLI |
| El relevo tampoco supera la revisión (o no hay a quién pasársela) | **«Requiere intervención»**: aviso en la campana [«Te necesita»](#te-necesita-lo-que-espera-una-decisión-tuya) con las notas y queda en la memoria como pendiente |
| Veredicto «CUMPLE» | Terminada y verificada. No se anuncia en el chat (no hay nada que tengas que mirar): «Claude: cumple», con lo que dicen las pruebas, queda entre los pasos de la tarea. Solo sale en el mensaje si las pruebas fallan |

Las correcciones **cuentan por tarea**: el relevo no reinicia la cuenta, ni retomar la tarea tras cerrar la app, así
que no hay bucles. **Ejecución y verificación van por separado**: una tarea «sin verificar» o que «requiere
intervención» está terminada y sus archivos se quedan (los abres, los ves en «N archivos cambiados» y puedes
deshacerla), pero no se presenta como aprobada. El ir y venir («Claude comprobó … y vio fallos; Codex los corrige
(corrección 1 de 2)») **no sale en el chat**: queda en el registro de la tarea (despliega sus pasos y pulsa «Abrir el
registro completo»). En el mensaje solo aparece el veredicto si te toca mirar algo: «⚠ Sin verificar», «⚠ Requiere
intervención» o unas pruebas que fallan. La verificación cuenta en «Uso y
coste…» como «Verificar». Se salta si escribes **«sin revisión»** (o «sin verificar») en la
petición, si la tarea es solo de texto o si no hay ningún otro agente de otra familia disponible.

**Mientras se revisa, el autor queda libre.** En cuanto entrega, el autor puede empezar otra tarea; la revisión va
aparte. Por eso, durante la revisión:

- En el chat, el mensaje de la tarea pasa de «Trabajando» a **«En revisión»**, con «Codex comprueba el resultado»
  debajo. En el 3D trabaja el robot del verificador, no el del autor.
- El robot del autor, si no ha cogido otra tarea, dice **«Esperando la revisión de Codex»** (reloj de arena y mirando
  al verificador). Si la revisión pide correcciones, vuelve a trabajar en ella.
- Si ya está con otra tarea, sigue saliendo **«Trabajando»** con lo que hace: al cerrar la tarea anterior (revisada,
  corregida, relevada, fallida o con choques al integrarla) kywai no le pone «Disponible» si está ocupado
  (`settleRuntime` en `src/main/orchestrator.ts`; pruebas U4 y U5 de `orchestrator.check.ts`).

**Pruebas ejecutadas de verdad.** kywai no se fía de un «las pruebas pasan» en el texto del autor: mira en el
registro de la tarea los comandos que ejecutó y cómo terminaron. Solo cuenta una prueba que demuestra algo y
termina sola (`npm test`, `npm run typecheck`, `vitest run`, `tsc --noEmit`, `pytest`, `cargo test`, `go test`,
`./gradlew test`…), ejecutada **tal cual** (con `| tail`, `|| true` o `;` detrás su resultado queda escondido y no
vale; tampoco el modo vigilancia, `--help`, `tsc` sin `--noEmit` ni lo que actualiza instantáneas o arregla
archivos) y **después del último cambio** en los archivos. Si no la hay —no probó, probó antes de cambiar o le
fallaron—, kywai ejecuta él mismo las pruebas del proyecto en la carpeta de la tarea (con `CI=1` y un máximo
de 8 minutos) antes de llamar al verificador.

| Pruebas | Qué recibe el verificador | Cómo acaba un «CUMPLE» |
|---|---|---|
| El autor las pasó tras su último cambio | «Codex ejecutó «npm test» … y pasaron» | «✔ … cumple; las pruebas pasan (npm test)» |
| kywai las ejecutó y pasan | Lo mismo, diciendo que las ejecutó kywai | Igual |
| Fallan | El final de la salida y la regla: si fallan por esta tarea, es FALLOS. La salida viaja con las notas a la corrección | Solo si el verificador explica que el fallo no es de esta tarea: «cumple, aunque las pruebas fallan (…); según Claude, no por esta tarea. Mira esas pruebas…» |
| El proyecto no tiene pruebas o no se pudieron ejecutar (falta el programa o las dependencias, más de 8 min) | «No se ejecutó ninguna prueba; no digas que pasan» | «✔ … cumple, sin pruebas ejecutadas (motivo)»: nunca «pasan» |

El registro de la tarea lo cuenta («Pruebas: Codex no ejecutó pruebas; kywai ejecuta «npm test» antes de
verificar», «Pruebas: «npm test» pasa (12 s)»). Si una tarea no cambió ningún archivo y no tenía que entregarlos,
no se verifica (no hay nada que revisar). La idea de la evidencia propia viene de GG Coder; el código es nuevo
(`src/shared/testEvidence.ts` y `src/main/projectChecks.ts`).

**Si la tarea toca una web** (HTML, CSS, componentes…), kywai la abre antes en una ventana oculta, a tamaño
de escritorio (1280 px) y de móvil (390 px), con un servidor local de solo lectura y sin acceso a la red ni a tus
datos. Guarda las capturas en `.ai-cowork/verificacion/` del proyecto y apunta los errores de la consola y lo que
no cargó. El verificador (uno que vea imágenes: Claude, Codex o Gemini) recibe las capturas y esos errores, así
comprueba cómo se ve de verdad: una página en blanco, cortada o que no se puede usar en el móvil es un fallo. Se
abren las HTML que cambió la tarea o, si cambió estilos o componentes, la entrada ya compilada (`dist/`, `build/`…
o `index.html`). Lo ves en «Ver qué está haciendo» de la tarea.

**Quién verifica.** Entre los agentes de otra familia que valen (libres antes que ocupados), kywai elige con lo
medido en los últimos 30 días: primero el que da un veredicto claro (menos «sin verificar») y, si se parecen, el
claramente más rápido (al menos 1,5 veces), con 3 verificaciones o más de cada uno. Sin esos datos, el orden de
`plannerOrder`. La revisión es la misma; solo cambia quién la hace (medido el 8 nov: Claude verificaba en 17 s de
mediana y Codex en 77 s, con el mismo resultado).

**La verificación no frena la cola.** En cuanto el autor termina, queda libre: si tiene otra tarea que no depende de
la que se está verificando, la empieza ya (en una copia aparte de la carpeta si hace falta, que se integra al
terminar), en vez de esperar a que acabe la revisión. Y las capturas de la web y las pruebas del proyecto se hacen a
la vez antes de llamar al verificador. Las tareas que dependen de la verificada siguen esperando a su «CUMPLE».

### Cambios de cada tarea: verlos, deshacerlos y copias aparte

Antes de que una tarea que cambia archivos empiece, kywai guarda una **instantánea** de la carpeta del proyecto,
y otra al terminar. Las guarda en un repositorio git propio (`workspace/instantaneas/<proyecto>.git`), **nunca en el
`.git` de tu proyecto**, que no se toca: funciona igual si tu carpeta es un repositorio git o no. Respeta sus
`.gitignore` y deja fuera `node_modules`, compilados (`dist`, `build`…), los datos internos y los archivos de más de
25 MB. Hace falta tener git instalado (en el Mac viene con las herramientas de Xcode); sin git todo sigue como antes,
sin deshacer.

Las instantáneas aíslan la configuración global de Git. En Windows usan el dispositivo `NUL` que entiende Git,
para que una ruta de dispositivo de Node.js no impida guardar los cambios ni deshacerlos.

Bajo el mensaje de cada tarea terminada sale **«N archivos cambiados +a −b»**:

- Al pulsarlo se despliega **cada archivo** (nuevo, cambiado o borrado, con sus líneas) y el **parche** coloreado.
- **Pedir cambios** escribe «Sobre «la tarea»: » en el cuadro de texto para que digas qué cambiar; va como una
  continuación al agente que la hizo.
- **Deshacer** deja sus archivos como estaban antes **aunque después se hayan cambiado otros** (o otras partes del
  mismo archivo): es una fusión a tres bandas, como `git revert`. Si alguna línea que tocó la cambió después otra
  tarea o tú, no deshace nada y te dice en qué archivos choca. Queda anotado en el chat.

**Dos tareas a la vez nunca se pisan.** La primera tarea que empieza trabaja en la carpeta del proyecto; si otra
empieza mientras tanto (de la misma petición o de otra), trabaja en una **copia aparte** de la carpeta tal como
está (`workspace/aislado/<tarea>`, con `node_modules` y similares enlazados a los originales para que pueda ejecutar
las pruebas). El verificador comprueba esa copia. Al terminar, sus cambios **se integran** en la carpeta del
proyecto con una fusión a tres bandas y la copia se borra. Si los dos cambiaron las mismas líneas, esos archivos
quedan con las marcas `<<<<<<< actual / ======= / >>>>>>> tarea` y **la misma tarea vuelve a su agente** para
resolver el choque (una vez; si aún queda algo, avisa en el chat). Lo ves en el registro de la tarea («Trabaja en
una copia aparte…») y bajo su mensaje («(en una copia aparte, ya integrada)»). Las tareas que trabajan en una copia
no retoman la sesión de su CLI (era de otra carpeta). Si la tarea se cancela o falla del todo, su copia se descarta.

### Valorar un resultado (👍/👎)

Bajo cada resultado del chat (el mensaje de una tarea terminada o la respuesta final de un plan) hay dos botones,
**👍 «Me sirvió»** y **👎 «No me sirvió»**. Pulsar uno guarda tu valoración; volver a pulsarlo la quita. Es la medida
que faltaba: el registro de consumo sabe cuánto costó cada tarea y si el agente dijo que había terminado, pero no si
el resultado te sirvió a ti. La valoración queda en `usage-runs.json`, en la llamada de esa tarea (o del plan), y
entra en la ficha que ve el coordinador: a «historial en kywai (30 días)» se añade «al usuario le sirvieron 7
de 9 que valoró (2 no)», así que Hermes tiene en cuenta a quién le salen bien las cosas de verdad al repartir. Con
varios intentos, una tarea cuenta una vez. Con 5 tareas o más, va en la línea «calidad» junto a la verificación y
los fallos (ver [Cómo rinde cada agente](#cómo-rinde-cada-agente)). De momento se valora desde el escritorio (en
Órbita, pendiente).

### Lo que cuenta cada agente en el chat

Cada tarea tiene su mensaje en el chat (escritorio, navegador, cliente y Órbita) desde que el agente empieza,
como en la app de Claude, y se despliega en **tres niveles** para que veas lo justo y, si quieres, todo:

1. **Plegado** (lo que ves siempre): el título de la tarea con su estado, **una frase corta de lo que hace ahora**
   (su última nota), lo último que enseñó (capturas, documentos) y debajo, en una línea con flecha, el resumen de
   todo lo hecho («Ejecutó 14 comandos, editó 3 archivos y creó 2 archivos · 1 con error +393 −7»).
2. **Desplegado con la flecha** (o pulsando el título): todo lo que fue contando, en orden: sus frases cortas y,
   entre ellas, las herramientas que usó en una línea por grupo («Ejecutó 3 comandos y editó 2 archivos ›»), con las
   líneas que cambió cada grupo.
3. **Cada herramienta** (al pulsar su línea dentro de un grupo): su detalle — el comando y lo que devolvió, los
   cambios de un archivo con las líneas añadidas en verde y las quitadas en rojo, o lo que leyó. Se pide al
   registro de la tarea al abrirla.

Al desplegar, al final está «Abrir el registro completo» (la ventana con todo, también lo que razonó). Al acabar, el
mismo mensaje dice «Hecha» y trae su resultado y sus entregables, y vuelve a verse plegado; si no pudo, lo explica
ahí. Se les pide que lo cuenten con frases cortas (nada de párrafos largos); se actualiza como mucho una vez por
segundo y, si cuenta mucho, se ven los últimos 40 pasos (el resumen de arriba cuenta todo).

**Varias tareas a la vez sin mezclarse.** Cuando un agente lleva dos tareas a la vez (él y un becario suyo, por
ejemplo), el chat las separa así:

- **Cada tarea lleva su número** (`#7 Guía…`) en su mensaje, en la lista de **Tareas** y en el plan, en escritorio,
  navegador y Órbita. El número es del proyecto y no se repite aunque vacíes la conversación.
- **Una tarea, un solo mensaje.** Si el mismo agente la retoma (para corregir lo que vio el verificador, resolver un
  choque al integrar o repetirla con otro modelo), sigue en **su mismo mensaje**, que **baja al final del chat**. Lo
  de antes queda plegado entre sus pasos, junto con el motivo de la repetición. Mientras espera turno dice **«En
  cola»**, no «Detenida». Si la retoma otro agente (el relevo), ese agente abre su propio mensaje.
- **La revisión no ocupa el chat.** «Codex comprobó «…» y vio fallos; Claude los corrige» ya no sale como mensaje:
  se guarda en el registro de la tarea, y la tarea sigue en su mismo bloque hasta que entrega.
- **El trabajo de un becario** sale con su jefe y la marca **«Claude · Becario»**. Cuando el becario acaba su parte
  (o devuelve la tarea a su jefe), deja su puesto libre. Si tenías abierto su panel en el 3D, dice con quién sigue
  la tarea y a los 4 segundos pasa al panel del jefe.
- **Tareas repetidas.** Hermes ve el trabajo que sigue en marcha y se le pide no crear otra tarea que lo repita,
  aunque se lo pidas con otras palabras. Si aun así una tarea nueva se parece mucho a otra en marcha del mismo
  proyecto, el chat avisa («Ojo: «…» se parece mucho a «…»…») para que detengas una si son lo mismo. No se borra nada
  solo, porque podría ser trabajo distinto.

Para desarrolladores: `openWork`/`closeWork` en `orchestrator.ts` (`meta.lastWork` reabre el mensaje del mismo
agente), `src/shared/chatOrder.ts` (cuándo un mensaje reabierto baja al final, igual en el servidor, la interfaz y
`Conversation.upsert` de Órbita), `TaskWork.seq`/`by` y `Task.seq`, y `src/main/duplicateTasks.ts` (el aviso de
tareas parecidas, solo entre peticiones distintas).

**Capturas y documentos a medida que avanza.** Para ver por dónde va sin esperar al final, el chat enseña lo que
el agente va creando mientras trabaja: las **imágenes** nuevas (capturas del juego, mapas, maquetas) salen como
miniaturas en el sitio del mensaje donde ocurrieron y, al pulsarlas, se abren; los **documentos** (`.md`, `.html`,
`.pdf`) salen como fichas. Es igual en escritorio, navegador, cliente y Órbita (que además las abre a pantalla
completa). También cuentan las imágenes que el agente **abre** aunque estén fuera del proyecto (en `/tmp`, por
ejemplo): se copian a `avances/` dentro de la carpeta interna del proyecto para que el servidor pueda
enseñarlas, **una sola copia por imagen** (nombrada por su contenido), aunque se mire en muchas tareas. Esas
copias (y `historial/`) son de la app: **nunca salen en Entregables ni en Resultados**, que solo
enseñan lo que pediste (por ejemplo, el vídeo y no los dibujos de los agentes que miró para hacerlo). Al abrir esta
versión por primera vez, cada proyecto borra una vez su `avances/` antigua (una copia por tarea, muchas repetidas)
y quita de Entregables y Resultados lo que se había colado de ahí; las miniaturas de esos avances en mensajes
antiguos del chat se quedan sin imagen (`cleanOldProgress` en `projects.ts`). Para no llenar el chat solo salen imágenes de 4 KB a 25 MB, hasta 6 cada 12 segundos y 24 por
tarea (8 documentos), esperando a que el archivo termine de escribirse; no cuentan las carpetas ocultas, los
adjuntos ni los datos de la app. Se les pide que guarden dentro del proyecto las capturas que hagan.

**Vídeos y audios en Órbita.** Al abrir un vídeo (`.mp4`, `.webm`, `.mov`, `.mkv`…) o un audio (`.mp3`, `.wav`,
`.m4a`, `.ogg`…) desde el chat, Archivos o Resultados, el visor lo **reproduce dentro de la app**, con play, pausa,
barra para avanzar y botón de **pantalla completa** (gira a horizontal; «Atrás» sale de ella sin cerrar el visor). No
espera a bajarlo entero: el móvil va pidiendo al ordenador los trozos que necesita, así que empieza enseguida, se
puede saltar a cualquier punto y no tiene el tope de 25 MB del resto de archivos. Se pausa al salir de la app.
**Guardar en el móvil** y **Abrir con otra app** siguen disponibles (esos sí lo descargan entero). Hay que actualizar
Órbita y el ordenador; con un ordenador sin actualizar, los vídeos de más de 25 MB no se abren.

Para desarrolladores: `sendFile` (`src/main/mobileFiles.ts`) responde a `Range` con 206 y no aplica el tope a
`video/*` ni `audio/*`; en Órbita, `StreamPlayer` y `FullscreenVideo` (`ui/orbita/MediaPlayer.kt`) usan Media3
(ExoPlayer + `OkHttpDataSource`) con el cliente `streaming` de `CoworkApiClient` (TLS fijado y token), a través de
`fileStream`/`artifactStream`.

**Copiar y pegar en Órbita.** Mantén el dedo sobre una palabra de cualquier mensaje del chat (tuyo o de un agente)
para seleccionarla; arrastra los tiradores para coger más palabras y pulsa **Copiar**. En la caja de escribir,
mantén el dedo y pulsa **Pegar**. Los botones de los mensajes se siguen pulsando igual.

**Fotos desde Órbita.** En el chat, al lado del clip, está el botón de la **cámara**. Al tocarlo se abre un menú:
**«Hacer una foto»** abre la cámara del móvil o la tableta, y **«Elegir de la galería»** abre el selector de fotos
de Android (no pide permisos y deja elegir hasta 10 fotos o vídeos). Mientras se sube sale «Subiendo foto…» encima
de la caja de escribir; al terminar queda adjunta y va con tu próximo mensaje (se quita con la ✕). Para otros
archivos (PDF, documentos, Drive…) sigue estando el clip. Las fotos de la cámara se guardan solo en la caché de
Órbita y se borran al hacer la siguiente. Para desarrolladores: `ui/orbita/PhotoAttach.kt` (el botón, la subida y
`AttachFinishedUploads`, que adjunta lo subido aunque el panel se cierre) y el `FileProvider` `<paquete>.fotos` del
manifiesto.

### Ver qué está haciendo un agente

Pulsa la tarjeta de **«Tarea actual»** en el panel de un agente (o «Ver qué está haciendo»), o una tarea de la
pestaña **Tareas**: se abre una ventana con lo que hace, paso a paso y en directo, como en las apps de Claude
Code y Codex: lo que razona (plegado), cada comando con su salida y si salió bien, cada archivo que lee, crea o
edita (con los cambios en verde y rojo), sus búsquedas, su lista de pasos y lo que responde. También sirve para
las tareas terminadas («Tareas recientes» en el panel del agente): cada registro se guarda 30 días en `traces/`
dentro de la carpeta de datos. Funciona con Claude, Codex, Gemini, Qwen Code y los modelos locales.

### Cómo se ve que una tarea avanza

kywai no se inventa el avance. Nada más enviar tu petición aparece una fila con el coordinador **preparando el
plan**, con puntos animados y un reloj, para que veas que se ha recibido aunque el plan tarde unos segundos. Si la
petición no pasa por un plan («/video …» o «@Agente …»), esa fila nombra al agente que **empieza la tarea**, el
mismo que se ve trabajando en el espacio 3D, y no al coordinador. Cada
tarea en marcha enseña sus **etapas reales**: Trabajando (o Corrigiendo) → Pruebas → Verificación → Lista; el punto
de la etapa actual late y cambia solo cuando el motor pasa de verdad a la siguiente. Debajo, el reloj de lo que
lleva y lo último que hizo el agente. El porcentaje solo sale si el agente informa de sus pasos; si no, la barra
muestra un **brillo que la recorre** (señal de que sigue trabajando) y el tiempo que lleva, y al pasar el ratón
dice cuánto suelen tardar las tareas parecidas. Ya no hay una barra estimada que suba sola y se quede parada. Si el
agente lleva más de 30 s sin contar nada (por ejemplo, escribiendo un archivo largo de una vez), lo dice: «Pensando
o escribiendo algo largo · sin novedades desde hace N min». Con «Reducir efectos» el brillo y el latido se quitan.

Cada paso real del agente se nota: en el chat, su última acción **entra deslizándose** y empuja a las dos
anteriores, que se van apagando; la etapa que termina se marca con un ✓ que salta, y cuando la tarea acaba bien
mientras miras, su bloque da un **destello verde**. En el espacio 3D, cada comando, archivo o mensaje del agente
lanza una **chispa de su color** desde su robot al proyecto, que late al recibirla. Nada de esto va con
temporizador: si el agente no hace nada, no se mueve nada. «Reducir efectos» lo quita todo.

### Respuesta final del coordinador

Cuando un plan de varias tareas termina, el coordinador no se limita a la lista de ✓: con todos los resultados
delante (lo que dijo cada tarea, sus archivos y el veredicto de la verificación) redacta la **respuesta a tu
petición**: qué se ha hecho y dónde está, cómo probarlo o usarlo, qué decisiones se tomaron y qué quedó fuera, falló
o conviene revisar, sin inventar nada. La lista de tareas con su ✓/✗ queda debajo y los archivos, en su carpeta
plegada. Si el coordinador está ocupado o no responde, se queda la lista de siempre.

### Entregables en una carpeta

**Lo que pediste va delante.** Si entre los archivos de una tarea hay uno que destaca como resultado (el PDF, el
vídeo, la página, el documento), sale **suelto, con Abrir y Descargar**, y el resto (json, scripts, datos, capturas)
queda debajo en **una línea pequeña, «Archivos de trabajo · N»**: plegada no enseña nada más, y al pulsarla se
despliegan (con su «Descargar como zip»). Es la misma regla de la pestaña Resultados. Con más de
tres resultados principales (una tanda de imágenes) o si ninguno destaca, va todo en la carpeta, como abajo. Una
tarea registra como mucho 60 archivos como entregables, y esos 60 se eligen empezando por los resultados: antes iban
por orden alfabético y 60 JSON de `api/` dejaban fuera el `reporte.pdf` que se había pedido. En Órbita el chat sigue
enseñando la carpeta entera.

**El mensaje es un resumen para ti.** A cada agente (y a Hermes en la respuesta final) se le pide decir qué entrega
y con qué nombre de archivo, y después solo lo que te sirve para usarlo o decidir, en pocas líneas y sin detalle
técnico (funciones, scripts, archivos intermedios, recados para otras tareas), salvo que la petición fuera sobre el
código. La sección «Para la memoria» de su respuesta se guarda en la pestaña Memoria y **no se escribe en el chat**.
Lo técnico sigue a un clic: despliega los pasos de la tarea o «N archivos cambiados».

Cuando una tarea entrega varios archivos, el chat los agrupa en **una carpeta plegada** (con su nombre, cuántos
archivos son, de qué tipo y quién los hizo) en vez de ponerlos uno detrás de otro. Al pulsarla se despliega para
abrir cada uno; en el escritorio, «Abrir carpeta» la abre en el Finder. El resumen final del trabajo junta todos
los archivos de la petición en otra carpeta. Igual en la app del móvil.

Cada archivo tiene **Descargar**, junto a Abrir. La carpeta permite **Descargar como zip**: incluye únicamente los
entregables de esa tarjeta, con sus nombres y subcarpetas, sin añadir otros archivos del proyecto. En el navegador
(también desde el móvil) y en la app de escritorio como cliente, se guardan en el dispositivo que estás usando;
en el escritorio del servidor se elige dónde guardar una copia. Órbita ofrece el mismo botón en el chat y en
Resultados, con el selector de destino de Android. Cancelar el selector no guarda ninguna copia. Los archivos originales
se conservan en el servidor. Para obtenerlo en Órbita hay que actualizar la app del móvil.

### Resultados en carpetas por tarea

La pestaña **Resultados** ya no pone cada archivo suelto: junta en **una carpeta por tarea** todo lo que hizo (con el
título de la tarea, cuántos archivos son, quién los hizo y la hora del más nuevo). Lo que no viene de una tarea se
agrupa por la carpeta del proyecto donde está; lo que está suelto en `artifacts/`, en «Otros archivos». Las carpetas
van de la más reciente a la más antigua y **solo la más reciente sale abierta**; si abres o cierras otra, la app lo
recuerda (en el escritorio y la web, entre sesiones; en Órbita, mientras la app esté abierta).

Dentro de cada carpeta va delante **el resultado principal** y el resto queda plegado en **«Archivos de trabajo · N»**.
Principal es lo de más peso que haya: un vídeo (`.mp4`, `.mov`, `.webm`…) gana a una página o documento final (HTML,
PDF, Word, PowerPoint, Excel), y esto a imágenes, audio y Markdown. Así, en un vídeo de `/video` se ve el MP4 y las
escenas, voces, `guion.json` y el código de Remotion quedan en «Archivos de trabajo», ordenados por nombre
(escena-1, escena-2… escena-10). Si una tarea solo dejó código o textos, se ve todo sin plegar nada.

Al abrir un archivo, el visor deja pasar con ‹ › por toda la carpeta. Cada carpeta tiene **Descargar como zip** con
todos sus archivos, y cada tarjeta lleva su **Descargar** justo debajo, dentro de su casilla de la rejilla: la fila
siguiente empieza después del botón, nunca encima. «Recién terminado» sigue arriba como antes. La regla es la misma en el escritorio, la web y
Órbita (`src/shared/resultGroups.ts` y `android/…/orbita/ResultGroups.kt`: si cambias una, cambia la otra).

### Archivos por petición

La pestaña **Archivos** ya no es una lista larga de «Adjuntos» y «Generados»: va en **una carpeta plegable por
petición**, es decir, por cada mensaje tuyo que puso al equipo a trabajar. El título es la primera línea de tu
mensaje y, dentro, salen primero **tus adjuntos** de ese mensaje («Tu adjunto») y luego **todo lo que generó el
equipo** para él, con el resultado principal delante (vídeo, luego página o documento, luego imágenes) y lo más nuevo
primero. A diferencia de Resultados (una carpeta por tarea), aquí una petición que se repartió en varias tareas, como
un `/video`, queda junta en una sola carpeta.

Un archivo llega a su petición por su tarea (tarea → ejecución → tu mensaje). Si tu mensaje ya no está cargado, la
carpeta toma el título de la tarea; si el archivo no viene de ninguna tarea, se agrupa por la carpeta del disco, como
en Resultados. Los adjuntos que no van en ningún mensaje (aún sin enviar o de otra conversación) quedan al final en
«Otros adjuntos». Solo la petición más reciente sale abierta; arriba, **«Plegar todas» / «Desplegar todas»**, y la app
recuerda qué carpetas abriste (`kywai.archivos.carpetas`). Cada carpeta con archivos generados tiene **Descargar como
zip** y el visor deja pasar con ‹ › por toda la petición. La regla está en `src/shared/requestGroups.ts` (con su test).

### Filtrar archivos por tipo

En **Archivos** y en **Resultados**, encima de las carpetas, hay una fila de botones para ver solo un tipo de
archivo: **Todo, Fotos, Vídeos, Audio, Documentos, Código y Otros**, cada uno con cuántos hay. Solo salen los tipos
que hay en el proyecto (con uno solo no sale la fila). Al elegir uno, cada carpeta enseña solo esos archivos y dice
«3 de 9 archivos»; las carpetas sin ninguno se ocultan, y **Descargar como zip** baja solo lo que se ve. El filtro se
recuerda en este equipo (`kywai.archivos.tipo` y `kywai.resultados.tipo`); si el tipo elegido ya no tiene archivos, se
ve todo.

Qué cuenta como cada tipo: Fotos (png, jpg, webp, svg, heic…), Vídeos (mp4, mov, webm…), Audio (mp3, wav, m4a…),
Documentos (pdf, Word, Excel, PowerPoint, Markdown, txt, páginas html, subtítulos), Código (js, ts, py, json, yaml…)
y Otros (zip y lo demás). Un MIME de imagen, vídeo o audio manda, así que una nota de voz .webm es Audio. Los vídeos,
audios y PDF que antes salían como «Archivo» con icono genérico ahora dicen «Vídeo», «Audio» o «PDF» con su icono.

**En Órbita** el mismo filtro está abajo en **Resultados** (sustituye a «Todos · Documentos · Código») y se desliza de
lado si no cabe. La regla es la misma en todos: `src/shared/fileTypes.ts` y `android/…/orbita/FileTypes.kt` (si
cambias una, cambia la otra), con sus pruebas.

### Miniaturas y «Vista» en Archivos

En **Archivos**, las fotos y los vídeos ya no salen con un icono genérico: se ve su **miniatura real**, para saber de un
vistazo qué es cada uno. Los vídeos enseñan un fotograma (al 20 % del vídeo, como mucho a los 4 s, porque al principio
suelen estar en negro) con un **▶** en la esquina, y al pasar el ratón por encima se reproducen sin sonido. Lo demás
(documentos, código…) sigue con su icono. Las miniaturas solo se piden cuando la fila entra en pantalla, así una carpeta
con 40 vídeos no carga todo de golpe; si una no carga (archivo borrado, modo demo), vuelve el icono.

Arriba, junto a «Plegar todas», está el botón **Vista ▾**, como en el Explorador de Windows: **Iconos muy grandes,
grandes, medianos, pequeños** (una rejilla de miniaturas, cuanto más pequeños más caben por fila) o **Detalles** (la lista
de siempre, con nombre, agente, tipo, tamaño y hora). La app recuerda la vista elegida en este equipo
(`kywai.archivos.vista`). Código: `src/renderer/src/ui/left/FileThumb.tsx` y `ViewMenu.tsx`.

### Clic derecho en un archivo: adjuntar, descargar o eliminar

En **Archivos** y en **Resultados**, el **clic derecho** sobre un archivo (lo que generó el equipo o un adjunto
tuyo) abre un menú con **Ver**, **Adjuntar al mensaje**, **Descargar** y **Eliminar…** (también con las letras V, A,
D y E con el menú abierto).

- **Adjuntar al mensaje** te lleva al Chat con el archivo ya puesto encima del cuadro de escribir, como si lo
  hubieras arrastrado (se quita con ✕). Al enviar, el servidor hace una copia en `attachments/` y va con el mensaje
  como un adjunto más, así Hermes y los agentes saben de qué archivo hablas («mejora el gancho de este documento»).
  Un adjunto tuyo vuelve a ir tal cual, sin copiarlo otra vez. Funciona igual desde el navegador y el cliente,
  porque el archivo se busca en el servidor. Solo valen los del proyecto abierto.
- **Descargar** baja solo ese archivo (lo mismo que su botón).
- **Eliminar…** pide pulsarlo otra vez («Pulsa otra vez para borrarlo del todo») y entonces borra el archivo del
  disco (carpeta del proyecto o, si un agente lo dejó allí, la carpeta de trabajo) y lo quita de Archivos y
  Resultados en todos los dispositivos. Un adjunto borrado sale también del mensaje que lo llevaba. **No va a la
  Papelera.**

**En Órbita** es **mantener pulsado**: en Resultados, la tarjeta abre el menú con Abrir, Adjuntar al mensaje,
Descargar, Ver la tarea y Eliminar… (este último con un aviso para confirmar); en Archivos → Adjuntos, el menú de
siempre gana Eliminar…. Hace falta que el ordenador tenga esta versión (capacidad `fileActions`).

Por dentro: `deleteProjectFile` en `src/main/projects.ts` (evento `files.deleted`), `artifactIds` en el envío del
chat (`attachArtifacts` en `src/main/orchestrator.ts`), el menú en `src/renderer/src/ui/left/FileMenu.tsx`
(reutiliza el de la barra lateral) y, en la API móvil, `POST /artifacts/{id}/delete`, `POST /attachments/{id}/delete`
y `artifactIds` en `POST /chat/messages`.

### Clic derecho en un mensaje del chat: copiar, responder, bifurcar o editar

El **clic derecho** sobre un mensaje del chat abre un menú (con letra de atajo en cada opción):

- **En una respuesta de un agente:** **Copiar** (C), **Responder a …** (R, lo mismo que el botón «Responder»),
  **Bifurcar desde aquí** (B), **Crear vídeo de esto** (V) y, si es un resultado, **Me sirvió** / **No me sirvió**
  (S / N; volver a elegirlo lo quita).
- **En un mensaje tuyo:** **Copiar** (C), **Editar** (E) y **Bifurcar desde aquí** (B).

**Copiar** copia solo lo que tengas seleccionado dentro de ese mensaje, si seleccionaste algo («Copiar lo
seleccionado»); si no, el mensaje entero. **Bifurcar desde aquí** crea una conversación nueva con todo hasta ese
mensaje (incluido) y la abre; la original sigue igual en la barra lateral (la copia no lleva las sesiones de los
agentes: en ella empiezan sesión nueva).

**Editar** funciona como en Claude y **sigue en el mismo chat** (no crea copias): el mensaje se vuelve un cuadro de
texto en su sitio, con **Cancelar** (o Esc) y **Enviar** (o Enter; Mayús+Enter salta de línea). Al enviarlo, ese
mensaje y todo lo que vino después se guardan como la **versión anterior** y el chat sigue con el texto nuevo (con
sus mismos adjuntos y, si respondía a un agente, la misma respuesta). Debajo del mensaje salen unas flechas
**‹ 2/2 ›** para pasar de una versión a otra: cada una trae su parte del chat (las respuestas y las tareas de
entonces); lo entregado sigue siempre en Resultados. Se puede editar otra vez (versión 3, etc.) y también un mensaje
de dentro de una versión. No se puede editar ni cambiar de versión mientras esa parte del chat sigue trabajando
(detenla antes). También está a mano sin el menú: el **lápiz** abajo a la derecha de cada mensaje tuyo. Los agentes
siguen con su sesión: pueden recordar lo que hicieron en la versión anterior. Editar solo va en modo real.

**En Órbita** es **mantener pulsado** el mensaje: Copiar (el mensaje entero), **Seleccionar texto** (a partir de
ahí, en ese mensaje el dedo selecciona palabras con sus tiradores, como antes), Responder a … (en una respuesta),
**Editar** (en uno tuyo: su texto vuelve al cuadro con la barra «Editando tu mensaje»; ✕ lo cancela) y Bifurcar
desde aquí. Las flechas ‹ › salen también bajo tu mensaje editado. Piden que el ordenador tenga esta versión
(capacidades `messageActions` y `editInPlace`).

Por dentro: `editOf` en el envío (`sendMessage` en `src/main/orchestrator.ts`) llama a `rewindChat` y, al cambiar de
versión, `switchMessageVersion` (los dos en `src/main/projects.ts`); las versiones viajan dentro del propio mensaje
(`ChatMessage.versions`), así que se guardan con su conversación. El chat se entera con el evento
`messages.replaced`. Bifurcar es `forkConversation(projectId, conversationId, { messageId })` en
`src/main/conversations.ts`. El menú está en `src/renderer/src/ui/left/MessageMenu.tsx`. En la API móvil: `editOf`
en `POST /chat/messages`, `POST /messages/{messageId}/version` y `messageId` en `POST /chats/{chatId}/fork`.

### Reanudar lo interrumpido

Si la app se cierra con trabajo a medias (al actualizar, reiniciar o por un fallo), el plan de esa petición
muestra **«Reanudar»**: vuelve a lanzar solo las tareas que quedaron a medias, con el mismo agente y avisándole de
que puede haber archivos a medio hacer. Lo terminado no se repite y sirve de resultado previo. En el consumo, el
tiempo que estuvo parada no cuenta. «Detener» desde el móvil deja la petición igual: en pausa y reanudable.

**En Órbita**, mientras haya algo en pausa, arriba sale el aviso **«En pausa: «título de la tarea»»** (o «N tareas
en pausa» si hay varias) y Hermes lleva la etiqueta **«Trabajo en pausa»** en el mundo. Tocar el aviso lleva a esa
tarea en Tareas → «Por revisar» (tocar a Hermes enseña la misma tarea en su tarjeta, con «Ver tarea»). Ahí se decide:
**«Reanudar»** la vuelve a lanzar; **«Quitar»** (pide confirmación) la da por cancelada sin reanudarla: deja de
avisar y de ofrecer «Reanudar», también en el escritorio, y lo que ya se hizo y los archivos se quedan como están.
El aviso no caduca solo: una tarea interrumpida hace días sigue avisando hasta que se reanuda o se quita. Si una
tarea de la última petición falló, el aviso «Una tarea falló» también lleva a ella.

### Reiniciar un agente que falla

Si un agente se queda en error o sin conexión (un fallo de su API, la cuota, la sesión…), en su panel del espacio
aparece **«Reiniciar agente»** (en Órbita, en su tarjeta): olvida el error y los modelos que se le dieron por rotos,
vuelve a comprobar que su CLI responde (sin llamadas de pago) y, si responde, queda disponible y lo que esperaba por
él empieza. Si sigue sin responder, lo dice. Si está trabajando no se toca: para eso está «Detener».

### Hablar directamente con un agente (`@Agente`)

Normalmente todo lo que escribes pasa primero por Hermes, que decide qué hacer y a quién dárselo. Si quieres que
un agente concreto reciba tu texto **tal cual**, sin que Hermes lo lea, lo reinterprete ni lo filtre, nómbralo con
`@` donde quieras del mensaje:

- `@Qwen escribe un cuento corto` (también vale su id o el nombre sin espacios: `@LMStudio …`).
- `Revisa el archivo de ventas y dime qué números no cuadran @Claude` (al final: escribes todo y luego eliges a quién).
- `Pregunta a @Qwen qué opina del plan` (en medio).
- `/directo Qwen escribe un cuento corto` (o `/direct`, `/dm`).

Al teclear `@` en cualquier parte del cuadro (al principio, en medio o al final, donde esté el cursor) sale la lista
de agentes (en el escritorio, la web y Órbita): elige uno con las flechas e Intro o Tab (o tocándolo) y el nombre
queda donde escribiste la `@`, sin tocar el resto del mensaje. En el chat, tu mensaje sale como
«Tú → Qwen (directo, sin Hermes)»; si la mención iba en medio o al final, se ve tal como lo escribiste.

Qué recibe el agente: con la mención al principio, lo que va detrás; al final, el mensaje sin ella (y sin la coma de
delante: «Revisa esto, @Claude.» → «Revisa esto.»); en medio, el mensaje con su nombre sin la `@` («Pregunta a Qwen
qué opina del plan»). Si nombras a **dos agentes distintos** («que lo haga @Qwen y lo revise @Claude»), no es
directo: va a Hermes, que reparte el trabajo.

Lo que cambia frente a una petición normal:

- **Sin Hermes**: no hay plan ni visto bueno, ni resumen final. Es una sola tarea para ese agente.
- **Texto literal**: el agente recibe solo lo que escribiste detrás de su nombre, sin las instrucciones del equipo
  (si adjuntas archivos, se añade dónde están). Al modelo de LM Studio tampoco se le pone su mensaje de sistema de
  «agente del equipo» ni se le dan herramientas: es como escribirle en el chat de LM Studio. Si solo razona y no
  escribe nada, se le pide una vez «Escribe ahora tu respuesta.»; si sigue sin escribir, sale lo que razonó, y si
  no hay ni eso, la tarea falla con «terminó sin escribir ninguna respuesta». Si la plantilla del modelo ya abre
  `<think>`, lo que llega antes de `</think>` se trata como razonamiento.
- **Su respuesta tal cual**: sin verificador de otra familia; un «BLOQUEADA: …» no se trata como fallo.
- **Solo ese agente**: si está apagado, sin cuota o falla, la tarea queda fallida con el motivo y **no** se pasa a
  otro agente.
- **Conversación seguida**: si tu mensaje anterior en el proyecto también fue directo al mismo agente, Claude y
  Codex retoman su sesión (recuerdan lo anterior). LM Studio y Ollama reciben cada mensaje suelto.

Un `@` que no es el nombre de ningún agente («@alguien») no cuenta, y tampoco un `@` pegado a otra palabra (un
correo como `qwen@correo.com`) ni dentro de código (`` `@Qwen` `` o un bloque con ```): el mensaje va a Hermes como
siempre. El nombre tiene que acabar ahí: `@Qwen.` o `@Qwen?` valen, `@Qwen3` o `@Qwen.ts` no.
`/directo` con un nombre que no existe da un error con la pista de escribir `@` para ver la lista. El agente
trabaja en la carpeta del proyecto con el mismo permiso de siempre (⚙ → Ajustes → «Permisos de los agentes»).

Para desarrolladores: las reglas están en `src/shared/directMessage.ts` (y su copia en Órbita,
`android/.../ui/orbita/DirectMention.kt`); el motor las aplica en `sendDirect` de `src/main/orchestrator.ts`
(la tarea lleva `direct: true`). La API móvil lo anuncia con `capabilities.directMessages`.

### Responder a un agente (que revise o continúe su respuesta)

Bajo cada respuesta de un agente, junto a 👍/👎 y «Crear vídeo de esto», está **↩ «Responder»** (en el escritorio, la
web y Órbita). Al pulsarlo, encima del cuadro de texto sale «Respondes a Claude «…»» con el principio de esa respuesta
y una ✕ para quitarlo. Lo que escribas va **directo a ese mismo agente** (sin Hermes), con su respuesta citada, para
que la revise o la continúe: «la suma está mal, revísala», «sigue con el punto 3», «hazlo más corto».

- **Sin escribir nada**: envía y le pide «Revisa tu respuesta: comprueba que es correcta y completa, corrige lo que
  haga falta y dame la versión buena.»
- **Retoma su sesión**: Claude y Codex siguen la conversación donde la dejaron (recuerdan lo que leyeron e hicieron).
  Los demás reciben la respuesta citada en el mensaje, así que también saben de qué hablas.
- **Se cita entera** hasta unos 6000 caracteres; si es más larga, se cita el final (donde suele estar la conclusión).
- En el chat, tu mensaje sale como «Tú → Claude (directo, sin Hermes)» con la cita ↩ encima; al pulsar la cita, el
  chat baja hasta esa respuesta.
- Es como un mensaje directo (ver arriba): una sola tarea para ese agente, sin plan ni verificador; si el agente está
  apagado o sin cuota, falla con el motivo y no pasa a otro. El trabajo de un becario se responde a su jefe.
- Las órdenes «/…» escritas con una respuesta elegida se hacen como siempre, sin la cita.

Para desarrolladores: `replyTo` (id de la respuesta) en `SendMessageInput` y en POST `/chat/messages` de la API móvil
(`capabilities.replyTo`); el mensaje tuyo lleva `replyTo: { messageId, agentId, name, excerpt }`. El texto que recibe el
agente lo arma `replyRequest` de `src/shared/replyTo.ts`; la ruta está en `sendMessage` de `src/main/orchestrator.ts`.

### Preguntas de los agentes con opciones

Cuando un agente (o Hermes) necesita que decidas algo, ya no te deja una lista de «Dudas abiertas» en el texto: debajo
de su respuesta sale una **tarjeta de preguntas**, como la de Claude, en el escritorio, la web y Órbita.

- **Una pregunta cada vez**, con «1 de 3» y ‹ › arriba para ir y volver, y una ✕ para plegarla sin contestar (queda un
  botón «Contestar las 3 preguntas» para abrirla otra vez).
- **Opciones numeradas** con una frase de qué pasa si la eliges. La que el agente cree mejor lleva la etiqueta
  **«Recomendada»**. Pulsa una (o su número en el teclado) y pasa a la siguiente pregunta.
- **Preguntas de varias**: cuando por su carácter tiene sentido elegir más de una (qué funciones incluir, en qué
  plataformas, qué idiomas…), debajo de la pregunta pone **«Puedes elegir varias»**: cada opción se marca y desmarca con
  un toque (sale ✓), el agente puede recomendar varias, y se pasa con **«Siguiente»** (o «Enviar» en la última). Lo que
  escribas en el campo de abajo se suma a lo marcado.
- **Siempre al final, un campo para escribir tu propia respuesta** («Otra cosa: escribe tu respuesta», con Intro o
  «Enviar») u **«Omitir»** si no quieres decidir esa (el agente hará lo más razonable).
- Al contestar la última, tus respuestas **vuelven a quien preguntó**: al agente de esa tarea o de ese mensaje directo
  (retoma su sesión, como con «Responder») o a Hermes, que planifica otra vez con lo que elegiste. En el chat sale tu
  mensaje «Mis respuestas a tus preguntas:» con cada pregunta y lo que contestaste, y la tarjeta se queda plegada con
  el resumen («Contestado»).
- Mientras esperan respuesta, «Te necesita» avisa («Claude te pregunta…») y se cierra al contestar.

Para desarrolladores: los agentes dejan sus preguntas al final de la respuesta en un bloque ` ```preguntas ` con JSON
(`[{"pregunta", "varias", "opciones": [{"titulo", "detalle", "recomendada"}]}]`; `varias: true` = se pueden elegir varias, regla `QUESTIONS_RULE` en las tareas, consultas
y mensajes directos); Hermes, en el campo `"questions"` de su plan. `pushMessage` quita el bloque del texto y lo guarda en
`ChatMessage.questions` (`src/shared/agentQuestions.ts`). Se contesta con `answers: { messageId, answers }` (cada respuesta con `choice`, `choices` en las de varias, `text` u omitida) en
`SendMessageInput` (`answerQuestions` en `src/main/orchestrator.ts`) y en POST `/chat/messages` de la API móvil
(`capabilities.questions`; el texto lo arma el servidor). La tarjeta: `QuestionsBlock` en `Messages.tsx` y
`QuestionsCard` en Órbita (`PanelsQuestions.kt`).

### Razonamiento (think) del modelo local

Los modelos que «piensan» (Qwen 3, Qwen 3.5…) escriben un razonamiento largo antes de responder, y eso hace que
tarden bastante más. Por eso el agente de LM Studio va **con el razonamiento apagado** y responde directamente.
Cuando quieras que piense (algo que necesita mucha información o pasos), pulsa su robot en el espacio (o su
tarjeta en el Equipo de Órbita) y enciende **«Razonamiento (think)»**; apágalo igual. Se guarda en la
configuración y vale para todo lo que le mandes después, tanto con `@Agente` como en tareas normales.

- **Cómo se aplica**: kywai manda a LM Studio `enable_thinking` (en `chat_template_kwargs` y suelto) con el
  valor del interruptor. Funciona con los modelos cuya plantilla lo admite (la de Qwen sí). Si con el interruptor
  apagado el modelo sigue pensando, tu versión de LM Studio o la plantilla de ese modelo lo ignoran: en LM Studio,
  en los ajustes del modelo, apaga «Enable Thinking» (o «Reasoning») si aparece, o pon `/no_think` al principio
  del mensaje con los modelos Qwen 3.
- **«Usó una herramienta» que no era tal**: «Preparando el modelo local» y «Leyendo la tarea» salían en la
  tarjeta como si el agente hubiera usado una herramienta. Eran pasos de kywai: ahora salen como texto
  normal. En un mensaje directo el modelo local no tiene herramientas.

Para desarrolladores: el ajuste es `thinking` del agente (solo `provider: 'lmstudio'`; sin indicar, apagado),
se cambia con `setAgentThinking` (IPC y web) o `POST /api/mobile/v1/agents/{agentId}/thinking` con
`{"enabled": true|false}`, y la API móvil lo anuncia con `capabilities.agentThinking`. Lo manda
`thinkingFields` en `src/main/agents/lmstudio.ts`.

### El modelo de Hermes (`/model`)

Escribe `/model` (o `/modelo`) en el chat, o pulsa a Hermes en el espacio → **«Modelo»**: ves el que usa ahora y
la lista de modelos de cada proveedor con el que Hermes tiene sesión (como en `hermes model` en la terminal), con
buscador. Elige uno y **«Usar …»** (o doble clic): Hermes lo usa desde el próximo encargo. kywai se lo pasa
en cada encargo (`-m` y `--provider`) sin tocar el `config.yaml` de Hermes; **«Volver al de Hermes»** deja el de
su configuración. Las listas salen de la caché de Hermes, sin llamadas de pago: para actualizarlas, ejecuta
`hermes model --refresh` en la terminal del equipo donde corre kywai (el Mac).
Los servidores propios de `providers:` (OmniRoute…) salen con su nombre de `config.yaml`; se reconocen aunque
la caché de Hermes guarde su dirección con una huella al final (`…/v1#…`) o con `localhost` en vez de `127.0.0.1`.

### Muse (Meta)

Muse es el quinto agente: usa **Muse Code**, el programa de terminal de Meta, con tu suscripción (por ejemplo
«Uso diario»: entre 10 y 50 encargos cada 5 horas). Lo instala el asistente de configuración
(`curl -fsSL https://dev.meta.ai/install.sh | sh` en Mac) y la primera vez que se abre `muse` pide iniciar sesión
con el navegador.

- **Para qué se usa**: solo lo que los demás no pueden hacer (ver vídeos) y de refuerzo cuando Claude o Codex se
  quedan sin cuota. Imágenes, capturas, PDFs, búsquedas en internet y código son de Claude y Codex: lo hacen igual
  de bien y así no se gasta la cuota de Muse, que es muy pequeña.
- **Solo con la suscripción**: kywai le oculta `META_API_KEY` y no fuerza el modelo, así que usa la sesión de
  Muse Code y el que tenga configurado (con el modo Contributor, Meta puede usar lo que le envías para mejorar sus
  modelos; se cambia en `muse` → `/settings`). Muse Image y Muse Voice solo van por API de pago: no se usan.
- **Permisos**: con «Acceso completo» trabaja sin sandbox (`--yolo`); si no, dentro de su sandbox, sin red para los
  comandos y siguiendo las instrucciones del proyecto (`AGENTS.md`). Planificando no escribe ni ejecuta nada.
- **Consumo**: Muse no informa de tokens ni de la cuota que queda; su barra se estima con 20 encargos cada 5 h
  (se puede cambiar en su cuota).
- **Su robot**: cuerpo de bombilla nacarado, ojos ondulados, un aro de luz sobre la cabeza y su garabato en azul
  de Meta; trabaja en la estación «Investigación», al fondo del espacio. Si ya lo tenías con su primera ficha
  (imágenes, PDFs, búsquedas y código), se actualiza sola al actualizar.

## Proyectos, memoria y consumo

### Memoria e instrucciones del proyecto

La pestaña **Memoria** (o el edificio «Memoria» del espacio) guarda lo que el equipo debe recordar en ese
proyecto. El coordinador y cada agente la leen en cada encargo, así que sobrevive a un «Nuevo chat» y a los
reinicios:

- **Instrucciones para los agentes**: normas tuyas que todos siguen siempre (cómo probar, estilo, qué no tocar…).
- **Código escueto (Ponytail)**: interruptor debajo de las instrucciones, **apagado de fábrica** y por proyecto.
  Encendido, el encargo de cada tarea con archivos lleva las reglas de [Ponytail](https://github.com/DietrichGebert/ponytail)
  (licencia MIT): el código mínimo que resuelve la tarea entera, reutilizando lo que ya hay en el proyecto, la
  librería estándar o una dependencia instalada antes de escribir nada, y sin opciones ni abstracciones que nadie
  pidió. Nunca recorta la tarea, las pruebas, la validación ni la seguridad. El verificador añade, después de su
  veredicto, una nota «Código de más:» con hasta 3 casos; es solo informativa y no cuenta como fallo. Las reglas
  no van dentro de kywai: al encenderlo por primera vez se descargan de GitHub a `extensiones/ponytail` de la
  carpeta de trabajo (fuera de «habilidades», para que no las vean los demás proyectos); sin conexión, el
  interruptor no se enciende y dice por qué. Las órdenes `/ponytail …` del propio Ponytail no se usan aquí.
  Instalarla desde Extensiones → Habilidades, en cambio, la deja a la vista de todos los proyectos.
- **Memoria**: decisiones, preferencias, hechos y pendientes, cada uno con quién lo aportó (tú o qué agente, en
  qué tarea), cuándo y su estado:
  - **Confirmado**: lo dijiste tú. El coordinador anota lo que decides o prefieres en tus mensajes («todo en
    TypeScript»); también puedes añadirlo en la pestaña o escribir `/recuerda …` en el chat (admite
    `/recuerda decisión: …`, `pendiente: …`, `preferencia: …`).
  - **Provisional**: lo anotó un agente al terminar su tarea (sección «Para la memoria» de su respuesta, que no sale en el chat). Los
    agentes lo tienen en cuenta pero lo comprueban. Confírmalo, edítalo o bórralo; la pestaña avisa de cuántos
    hay por revisar. Cada tarea normal (no las consultas rápidas, los mensajes directos ni las piezas del estudio
    de vídeo) deja **siempre** una línea «Hecho en «tarea»: …» con lo que hizo y dónde, más de 0 a 3 líneas con
    lo que aprendió (cómo funciona algo del proyecto, un error y su arreglo, un pendiente). Si el agente se olvida
    del resumen, kywai lo saca del último párrafo de su respuesta (`taskSummaryNote` en `memory.ts`). Así el
    siguiente agente, sea del CLI que sea, parte de lo que se hizo.
  - **Sustituido**: una entrada más nueva la reemplaza («sustituye m3») o la marcaste como que ya no vale. Los
    agentes dejan de verla; sigue en «Ver lo sustituido». Un agente no puede sustituir lo que confirmaste tú:
    su nota queda como propuesta.
  - **Responder a un pendiente**: cada pendiente abierto tiene abajo a la derecha el botón **Responder**. Se abre
    ahí mismo un cuadro de texto, sin cambiar de pantalla (Intro envía, Mayús+Intro hace un salto de línea, Esc
    cierra). Al enviar, tu respuesta llega al chat del proyecto como mensaje tuyo, con el pendiente citado
    («Respuesta al pendiente m12 («…»): …»), y el coordinador la toma como tu decisión: la anota en la memoria y,
    si desbloquea trabajo, lo reparte. El pendiente queda resuelto y desaparece de la lista (pasa a «Ver lo
    sustituido» como **Respondido**, con tu respuesta debajo); si vuelve a hacer falta algo, aparecerá un pendiente
    nuevo. «Volver a usarla» lo reabre. Si el envío falla, el pendiente sigue abierto. Funciona igual en el
    navegador, el cliente de escritorio y Órbita (botón «Responder» en la tarjeta; API móvil
    `POST /memory/{id}/answer`, `capabilities.memoryAnswer`).

Se guarda en el `project.json` del proyecto (también el interruptor de Código escueto).

- **Habilidades aprendidas** (debajo de la memoria, solo si hay alguna): si en una tarea el agente siguió un
  procedimiento que el equipo repetirá, añade al final de su respuesta una sección «## Habilidad nueva» con el
  SKILL.md entero. kywai la guarda en la carpeta `habilidades` con tres líneas más en el encabezado
  (`estado: provisional`, `proyecto: <id>` y `origen: <agente>, «<tarea>»`), la quita del mensaje del chat y
  avisa con «*Habilidad nueva por revisar en Memoria:* «nombre»». Como mucho una por tarea, y nunca pisa otra:
  si el nombre ya existe, queda como `<nombre>-mejora` («Propuesta de mejora de «…»»). Mientras es
  provisional solo la ven los agentes de **su** proyecto (con la marca «provisional, compruébala»); al pulsar
  **Confirmar** se quita `estado: provisional` y pasa a verse en **todos** los proyectos. **Ver los pasos**
  enseña el procedimiento y **Borrar** quita su carpeta (solo las aprendidas; las demás se quitan en
  Extensiones → Habilidades). Código: `parseTaskSkill`, `saveTaskSkill`, `learnedSkills`,
  `confirmLearnedSkill` y `removeLearnedSkill` en `src/main/skills.ts`; la pestaña, en `MemoryView.tsx`.

### AGENTS.md, habilidades y herramientas de kywai

**Instrucciones del repositorio.** Cada CLI lee por su cuenta solo su archivo (Claude, `CLAUDE.md`; Codex,
`AGENTS.md`; Gemini, `GEMINI.md`). kywai añade al encargo de cada tarea los que ese CLI no lee, así que basta
con un `AGENTS.md` en la carpeta del proyecto para que todo el equipo siga las mismas reglas. Si dos archivos
dicen lo mismo (o `CLAUDE.md` solo contiene `@AGENTS.md`), se pone una vez. Se recortan a 20 000 caracteres;
si el archivo es más largo, el encargo dice su ruta completa para leerlo entero.

**Habilidades compartidas.** Procedimientos que el equipo reutiliza («cómo publicamos una versión», «informes en
tres niveles»…). Van en la carpeta `habilidades` de la carpeta de trabajo de kywai: una carpeta por habilidad
con su `SKILL.md` (el mismo formato que las skills de Claude: `name` y `description` en el encabezado y los pasos
debajo) o un `.md` suelto. Puedes copiar ahí las de `~/.claude/skills`. **Las que encajan con la tarea van
enteras en el encargo** (hasta 3 y unos 15 000 caracteres, cada una como mucho 10 000): así todos los agentes
reciben exactamente el mismo texto, sea Claude, Codex, Gemini, Copilot, Qwen o Aider, y aunque trabajen en una
copia aparte de la carpeta (la carpeta `habilidades` queda fuera de la del proyecto y no todos los CLI pueden o
quieren abrirla). Encaja la que se nombra tal cual en la tarea o en la petición («membresia-metabolica» o
«membresía metabólica»), o la que comparte palabras de su nombre y su descripción con la tarea (por su raíz:
«publica» y «publicar» cuentan igual). Hermes ve la lista de habilidades en su encargo y escribe el nombre exacto
en la tarea a la que sirve. Las demás siguen en la lista con su nombre y para qué sirven. El detalle de cada tarea
dice **«Recibió las habilidades: …»** y la tarea lo guarda (`Task.skills`), así que el coordinador puede contestar
quién sabe qué (`relevantSkills` y `fullSkillSections` en `skills.ts`; las consultas rápidas también las reciben).

**Habilidades de serie.** kywai trae algunas escritas por él y las copia una vez a `habilidades` al arrancar
(`src/main/builtinSkills.ts`). Si cambias una, se respeta; si la borras, no vuelve (quedan anotadas en
`habilidades/.incluidas`). Por ahora:
- **`principios-ux-animacion`** (desde el 12 de noviembre de 2026): 20 principios de movimiento y usabilidad con
  números concretos para cualquier interfaz que hagan o repasen los agentes. Los 12 de la animación aplicados a la
  interfaz (aplastar y estirar al pulsar, anticipación, un foco a la vez, inercia, entrar rápido y frenar al llegar,
  arcos, ritmo de 100–500 ms, error que tiembla y dice cómo arreglarlo…) y las leyes de usabilidad (Fitts, zonas de
  clic de 44×44 px, Hick, Miller, Doherty —respuesta en menos de 400 ms—, Postel, Jakob y «cuanto más se usa, menos
  se anima»), más movimiento reducido y cómo comprobarlo. Sale del formato de un reel de «20 principios de UX y
  animación»; el texto es de kywai. Llega entera al encargo cuando la tarea habla de interfaz, pantallas o animación.
  kywai la aplica también a su propia interfaz: los botones (`.btn` y `.iconBtn` de `ui.module.css`) ceden un poco
  al pulsarlos y los menús emergentes (`Popover`) aparecen en 120 ms en vez de 200 ms (se usan a cada rato); la lista
  del «/» y del «@» ya salía al instante. Con «reducir movimiento» del sistema no se mueve nada.

**Movimiento y usabilidad de la interfaz** (repaso del 13 de noviembre de 2026 con esa habilidad; capturas en
`ux-animacion/` de los archivos del proyecto):
- **Ventanas suaves.** Toda ventana con `role="dialog"` y `aria-modal="true"` (Ajustes, Historial, Añadir agente,
  asistente, Uso…) entra con el fondo fundiendo en 160 ms y la ventana subiendo 10 px y asentándose en 200 ms; al
  cerrarla, `lib/dialogMotion.ts` deja una copia inerte que se va en 140 ms (lo que sale tarda menos que lo que
  entra). Las reglas están en `styles/motion.css`. Buscar (Ctrl+K) lleva `data-instant` y sale al instante porque se
  usa a diario. Con «reducir movimiento» no se anima nada.
- **Zonas de clic más grandes.** Los botones (`.iconBtn`, `.btn`, «Me sirvió», el nombre del agente) responden en
  un área de al menos 32 px aunque se vean más pequeños, y de 44 px en pantallas táctiles (`--hit-min` en
  `styles/motion.css`, con `pointer: coarse`). El área crece con un `::after` invisible, sin cambiar el aspecto.
- **Pantallas vacías con ejemplos que se pulsan.** Con el Tablero vacío salen tres ejemplos («Haz la página de
  precios», «Escribe las pruebas del carrito», «/video las novedades de la semana»): un toque lo deja escrito en
  «Nueva tarjeta» para cambiarlo o añadirlo. Sin rutinas salen tres (cada mañana revisar dependencias, al llegar un PR
  revisarlo, los viernes resumen de la semana) que abren «Nueva rutina» ya rellena. Componente `ExampleChips`.
- **Errores que se notan.** Todo aviso de error (`p[role="alert"]`) entra con una sacudida corta, y el campo que
  falla se marca con `aria-invalid` (borde rojo, `styles/motion.css`) y tiembla 3 veces en 300 ms (`lib/shake.ts`)
  con el foco puesto para corregirlo. Ya lo hacen: «Nueva rutina» (antes, guardar sin nombre o sin petición no hacía
  nada; ahora dice qué falta debajo del campo), los argumentos de «Otro programa…» al añadir un agente y la línea
  pegada de Extensiones → «Pegar». Con «reducir movimiento» solo se pone en rojo.
- **Avisos que no se mueven sin parar.** La campanita de «Te necesita» se mece y brilla tres veces y se queda quieta
  en ámbar hasta que abres la bandeja; con cada aviso nuevo vuelve a mecerse (`key={calledAt}`). Igual la llamada
  del coordinador en el 3D (late tres veces y queda dorada) y la rueda ⚙ con actualización pendiente (late tres
  veces y queda amarilla con su punto). Las ruedas de «trabajando» sí siguen girando: dicen que algo está en marcha.
- **El mismo estilo en todas partes.** Los radios de esquina salen solo de las variables de `styles/tokens.css`
  (`--radius-panel`, `--radius-card`, `--radius-ctl`, `--radius-chip`, `--radius-sm` y `--radius-pill`; antes había
  diez valores escritos a mano) y las sombras de tres niveles (`--shadow-1`, `--shadow-2`, `--shadow-pop`). Así un
  tema (Órbita, por ejemplo) cambia todas las esquinas a la vez. Solo quedan a mano los detalles de 1–4 px.
- **Detalles de movimiento.** La rayita de la pestaña abierta (Chat, Archivos, Tareas…) se desliza de una a otra en
  220 ms en vez de saltar (`TabIndicator` en `LeftPanel.tsx`, solo con `transform`). Las filas de Tareas, Archivos y
  Resultados entran en cascada, 40 ms una detrás de otra (hasta la séptima). Y la ✓ de una tarea terminada se dibuja
  con un trazo dentro de su círculo (`icons.module.css`). Con «reducir movimiento», nada de esto se mueve.
- **Movimiento reducido en todo.** Cada hoja de estilos con animaciones tiene su bloque
  `prefers-reduced-motion`: ya lo tienen también el punto de grabación de la nota de voz (se queda rojo fijo), la
  rueda de la muestra de voz de /video y las etiquetas del 3D (sin rebote, barra quieta y llamada sin latir), aunque no
  se haya activado «Reducir efectos ambientales» en Ajustes.
- **Órbita.** Las hojas (tarea nueva, bandeja, búsqueda, historial, música, actividad…) y el lector entran en
  280 ms frenando al llegar y se van en 200 ms acelerando (`ui/orbita/Motion.kt`, `OrbitaMotion`); el velo funde en
  180/140 ms. `OrbitaField` acepta `error` (borde rojo y el motivo debajo, también para TalkBack) y `shakeKey` (cada
  vez que sube, tiembla ±6 dp en 300 ms y recibe el foco). En Rutinas, «Crear rutina» ya no se apaga sin explicar:
  al pulsarlo con algo que falta lo dice en el campo, tiembla y vibra (rechazo); y sin rutinas salen dos ejemplos que
  se pulsan (`ExampleChip`) y abren el formulario relleno. Los botones ya cedían al pulsar (`pressScale`) y Compose
  ya amplía la zona táctil de lo pequeño a 48 dp; con «Quitar animaciones» de Android no se mueve nada.

**Herramientas de kywai (servidor MCP).** Claude trabaja con un servidor MCP propio de kywai
(solo ese: nunca los tuyos) con cinco herramientas: `memoria_proyecto` (instrucciones y memoria al día),
`anotar_memoria` (queda provisional, como «Para la memoria»), `estado_equipo` (qué hacen ahora los compañeros,
para no pisarlos), `preguntar_usuario` (deja la pregunta en «Te necesita» y el agente sigue con lo razonable; como
mucho tres por tarea) y `leer_habilidad`. El servidor solo escucha en 127.0.0.1 y cada tarea lleva su propio
token, que se anula al terminar. El script lo escribe la app en `mcp/ai-cowork-mcp.cjs` de la carpeta de trabajo
y lo ejecuta el propio kywai como Node; la configuración de cada tarea va en un archivo `mcp/tarea-….json`
que se borra al terminar. Codex, Gemini y los agentes de catálogo no lo reciben (no se les puede pasar esa
configuración por la línea de comandos) y siguen con lo que trae el encargo.

### Navegador de kywai: tus cuentas para los agentes

Un navegador de verdad dentro de kywai, donde entras con tus cuentas (GoHighLevel, un CRM, el panel de tu web, una
herramienta interna…) para que los agentes puedan leer y recorrer esas páginas sin que nunca les des la contraseña.
Sirve para lo que una API no da: por ejemplo, documentar los pasos de un workflow de GoHighLevel en un PDF.

- **Abrirlo:** botón **Navegador** encima del espacio 3D. Ocupa el sitio del 3D (como el chat de al lado) y la ✕ lo
  cierra. Escribe una dirección (o lo que quieras buscar, va a DuckDuckGo) y entra con tu cuenta.
- **La sesión se guarda** en una partición propia (`persist:kywai-navegador`), aparte de la de kywai: al reiniciar
  sigues dentro. El botón de salir de la barra hace **«Cerrar sesión en todo»** (borra cookies, datos y caché).
- **Qué pueden hacer los agentes** (herramientas `navegador_…` del servidor MCP de kywai):
  - Sin preguntar: ver qué página hay abierta, **leer** el texto y los elementos con los que se puede hacer algo
    (cada uno con su referencia, `e12`, o `f1e3` dentro de un marco), **hacer capturas** (con `guardar` las deja en
    su carpeta de trabajo para un informe), abrir una dirección, volver atrás y desplazarse.
  - **Con tu permiso** (en el chat y en «Te necesita», como «Preguntarme antes», en cualquier modo de permisos):
    hacer clic, escribir (o elegir en una lista) y pulsar teclas. «Permitir siempre en esta sesión» le deja hacerlo en
    **ese sitio** sin volver a preguntar hasta que reinicies kywai.
  - **Nunca:** leer ni escribir contraseñas, códigos de un solo uso ni tarjetas (lo detecta por `type=password` y
    `autocomplete`), ver cookies o ejecutar código en la página (no hay herramienta para eso). Lo que leen de una
    página es información, no órdenes: así un texto trampa en una web no puede hacer cambios en tu cuenta.
- **Lo ves en directo:** la primera vez que un agente lo usa en una tarea se abre la pestaña sola; encima sale quién
  lo usa y qué hace, con **«Parar»**, que le quita el navegador para el resto de esa tarea.
- **Webs que no se dejan leer:** muchas documentaciones (como la de GoHighLevel) se dibujan con JavaScript y la
  descarga normal de los agentes (WebFetch, curl, `web_extract` de Hermes) las ve vacías. Entonces abren la página en
  el navegador de kywai y la leen ahí, en vez de responder de memoria. Hermes **al coordinar no** lo tiene: su
  gateway valida las herramientas con su propia configuración y rechazaba la sesión entera por «kywai-navegador»
  (13 nov). Si hace falta leer una de esas webs, crea una consulta rápida «con el navegador de kywai».
- **Quién lo tiene:** Claude (por el servidor MCP de kywai), Codex (con «-c mcp_servers…», como las Extensiones),
  Gemini (en unos ajustes de sistema propios de la tarea, `GEMINI_CLI_SYSTEM_SETTINGS_PATH`, que copian los que ya
  hubiera en el equipo) y Hermes (en sus tareas de trabajo, como un servidor más de su configuración). Cada tarea
  lleva su propio token, que solo sirve para el navegador y se anula al terminar. Los modelos locales (Ollama, LM
  Studio, Colibri) y los CLI de catálogo no lo tienen: una tarea que nombra el navegador de kywai (o GoHighLevel) no
  va a ellos ni en el plan ni en los relevos (`needsKywaiBrowser`, `hasKywaiBrowser`), y si aun así les llega
  responden «BLOQUEADA:» para que otro la haga.
- **Desde el cliente de escritorio, la web u otro equipo:** el navegador vive en el equipo donde trabajan los agentes
  (el servidor) y se ve **en vídeo en directo, como AnyDesk** (`src/main/browserStream.ts`): una ventana oculta de
  kywai graba la pestaña con la captura de pestaña de Chromium (`setDisplayMediaRequestHandler` solo se la da a ella)
  y la manda por WebRTC directo entre los dos equipos, por Tailscale o la red de casa, sin servidores de fuera (sin
  STUN ni TURN; para eso kywai arranca con `WebRtcHideLocalIpsWithMdns` apagado, y las webs del navegador siguen sin
  ver las IP locales con `setWebRTCIPHandlingPolicy`). Ratón y teclado vuelven por un canal de datos del mismo enlace
  (un clic llega en milisegundos), y la vista manda su tamaño cada 3 s: si nadie mira la pestaña en el servidor, la
  página se maqueta a ese tamaño. Texto nítido antes que movimiento suave (`contentHint = 'detail'`, hasta 8 Mbps).
  Si el vídeo no conecta en ~9 s (por ejemplo, entrando por un túnel sin camino directo), sigue con **imágenes**:
  cada petición espera (hasta 1 s) a que pase algo (un fotograma nuevo, un clic, la rueda o una carga, tras los que se
  mira cada ~90 ms durante 1,5 s), hace una captura y solo la manda si cambió; ratón y teclado van entonces en una
  sola cola y por lotes. En los dos modos se maneja como una web: al mover el ratón los menús se despliegan y el
  puntero cambia (mano en enlaces, barra en textos), clic, doble clic, clic derecho, arrastrar, rueda (también
  horizontal con Mayús), teclado, atajos con Ctrl/Alt/Cmd y pegar desde tu portapapeles. Al hacer clic sale un círculo
  donde pulsaste y una raya arriba mientras la página carga. Copiar y cortar se quedan en el portapapeles del
  servidor. La ventana de kywai tiene que estar abierta en el servidor (aunque esté detrás de otras).

**Cómo está hecho** (`src/main/browser.ts`, `src/shared/browser.ts`, `src/renderer/src/ui/pane/BrowserPane.tsx`):
es una `WebContentsView` pegada a la ventana principal que la interfaz coloca encima de su hueco (`browserShow`). Si
algo de la interfaz se pone encima (un diálogo, un menú, la vista previa), se aparta y en su sitio queda una captura.
Cuando no se ve, se deja en la esquina de abajo a la derecha con 1 píxel dentro de la ventana: comprobado con
Electron 44, oculta (`setVisible(false)`), en una ventana oculta o del todo fuera, Chromium no la maqueta o no da
capturas de una página nueva. Se presenta como Chrome (sin «Electron» en el agente de usuario) para que Google y otros
dejen iniciar sesión; las ventanitas de «Entrar con Google» se abren aparte en la misma sesión. Los scripts de lectura
van en un mundo aislado en la página principal; los clics son de ratón de verdad (`sendInputEvent`) en la página y
simulados dentro de marcos. Los permisos usan `askPermission` con la clave `Navegador:<sitio>`.

### Extensiones: tus servidores MCP para los agentes

En **⚙ → Ajustes → Extensiones** añades servidores MCP (herramientas como Playwright, GitHub, Notion, buscar en la
web…) y eliges con un clic a qué agentes llegan. Cada tarea recibe solo los que su agente tiene encendidos, además
de las herramientas propias de kywai. Los servidores que tengas configurados en tu Claude, Codex o Gemini no
cuentan: solo los de esta pestaña.

**Añadir uno a mano.** «Añadir a mano» y pega lo que trae su README: la línea de instalación
(`npx -y @playwright/mcp@latest`), su JSON (`{"mcpServers": {…}}` o una sola entrada), la orden `claude mcp add …`
o su dirección (`https://…/mcp`). kywai lo entiende y te enseña el nombre, la orden o la dirección y sus claves
(variables como `GITHUB_PERSONAL_ACCESS_TOKEN`, o la cabecera `Authorization: Bearer …` de los remotos) para que
lo revises. Al guardarlo se prueba.

**Probarlo.** kywai lo arranca (o se conecta), le saluda y le pide sus herramientas, como hará el agente en una
tarea. Debajo de cada servidor se ve el resultado: «Responde: 25 herramientas» o por qué falla («No se encontró
"uvx" en este equipo», «Pide autorización…»). La primera vez puede tardar: npx y uvx descargan el servidor.

**Dárselo a un agente.** Un chip por agente: Claude, Codex, Gemini y Hermes se pueden encender; los demás salen
en gris (aún no pueden recibirlos). Si un servidor no arranca porque falta el programa que lo lanza (`uvx` viene con **uv**,
`npx` con **Node.js**), debajo sale **«Instalar uv»** o **«Instalar Node.js»**: lo instala en el equipo donde trabajan
los agentes (aunque lo pulses desde la web, Órbita u otro equipo) con su instalador oficial, sin administrador, y vuelve
a probar el servidor. Al encender un chip se vuelve a probar: si falla, se queda apagado y dice por
qué, así que ninguna tarea se rompe por una extensión. Si al probarlo más tarde falla, se apaga para todos. Cambiar
cómo se arranca (orden, dirección o claves) también lo apaga: se vuelve a encender tras probarlo.

**Cómo le llega a cada CLI** (en la traza de la tarea sale «Herramientas de Extensiones: …»):

| Agente | Cómo |
|---|---|
| Claude | En el mismo archivo `--mcp-config` de la tarea que el servidor de kywai, con sus herramientas permitidas sin preguntar. En la línea de comandos la ruta usa `/` también en Windows y admite espacios, manteniendo las restricciones de caracteres del lanzador. Se borra al terminar. |
| Codex | Con `-c mcp_servers.<nombre>.…`. Los locales se arrancan con un lanzador pequeño (`mcp/ext-….sh` o `.cmd` en la carpeta de trabajo, con sus variables) que se borra al terminar; los remotos llevan sus cabeceras en variables del propio Codex. Si una dirección lleva caracteres que la consola no admite (`?`, `&`), ese servidor no se le pasa y la traza lo dice. |
| Gemini | Con una extensión **kywai** en `~/.gemini/extensions/kywai` que lista los servidores encendidos para Gemini (sin sus claves: van como `${KYWAI_MCP_…}` y kywai se las pasa al lanzar la tarea) y `--allowed-mcp-server-names` con los de la tarea. Esa extensión también la verá tu Gemini cuando lo uses a mano (sin las claves). Los archivos de sistema de Gemini no sirven: solo los lee si son de root. |
| Hermes | Solo en sus tareas de trabajo (al planificar sigue con herramientas de consulta). Hermes lee los servidores de su `config.yaml`, pero mezcla encima los de su «ámbito gestionado» (`HERMES_MANAGED_DIR`): kywai escribe ahí, en `mcp/hermes-…/config.yaml` de la carpeta de trabajo, solo `mcp_servers` (con sus claves; se borra al terminar), y añade sus nombres a `-t`. Tu configuración de Hermes no se toca. Si el equipo ya tiene un ámbito gestionado de verdad (`/etc/hermes`), no se pisa y la traza lo dice. Probado con Hermes Agent 0.19, que necesita su soporte MCP instalado (`hermes-agent[mcp]`, viene con `[all]`); sin él, o con un Hermes viejo, simplemente trabaja sin ellos. |

**Las claves** se guardan en `mcp-servers.json` de la carpeta de datos de este equipo, cifradas (en Mac con la clave
propia de kywai, en Windows y Linux con el cifrado del sistema si se puede), y nunca vuelven a la interfaz: al cambiar un servidor salen como «Guardada»; déjala vacía para
no cambiarla.

**Hermes lo sabe.** La guía del coordinador lleva qué herramientas tiene cada agente («Claude: playwright (…)»):
si una tarea las necesita, se la da a uno que las tenga, y si ninguno las tiene lo dice en vez de mandarla a quien
no puede usarlas.

**Límites de ahora.** Los servidores remotos que solo admiten iniciar sesión en el navegador (OAuth) aún no se
pueden usar en las tareas: hace falta un token. Los agentes de catálogo todavía no reciben estos servidores; Hermes sí, con las condiciones de la tabla anterior.
Las direcciones `http://` solo se admiten si son de este equipo (`localhost`).

### Extensiones: catálogo de servidores MCP y de habilidades

La pestaña **Extensiones** tiene dos partes: **Servidores MCP** y **Habilidades**.

**Catálogo de servidores.** «Explorar catálogo» enseña primero unos destacados con su orden comprobada (Playwright,
GitHub, Context7, DeepWiki, Fetch, Sequential Thinking, Firecrawl, Perplexity, PostHog y PixelLab; los cuatro últimos piden una
clave de su web y Perplexity es de pago; PixelLab da unas generaciones de prueba y la usa «/sprite»). Al buscar (notion, postgres, slack…) se consulta el
**registro oficial de MCP** (registry.modelcontextprotocol.io, el directorio abierto del estándar, con miles de
servidores) y «Más resultados» trae la página siguiente. Cada ficha dice si es **remoto** o **en este equipo**, qué
claves pide y lleva el enlace a su página. «Instalar» no instala nada aún: rellena el formulario de «Añadir a mano»
con la orden (`npx -y paquete@versión`, `uvx paquete==versión` o `docker run -i --rm …`) o la dirección y las claves
con su explicación debajo, para que lo revises; al guardar se prueba como cualquier otro. Si la ficha deja algo por
rellenar (`<carpeta>`, `{región}`), sale un aviso amarillo. Los que solo funcionan por SSE no se pueden instalar.

**Verificados (✓).** En el registro puede publicar cualquiera, así que solo llevan ✓ los de publicadores conocidos
(Microsoft, GitHub, Notion, Stripe, Cloudflare, Google… lista `TRUSTED_MCP_PUBLISHERS` en `src/main/catalog.ts`) y
salen primero. El resto se puede instalar, pero revisa su orden.

**Habilidades.** Arriba, las instaladas (las de la carpeta «habilidades», que leen todos los agentes sean del
programa que sean) con su papelera. Debajo:
- **Buscar** en **skills.sh**, el directorio grande de skills (el mismo formato SKILL.md de Claude, Codex y Gemini),
  con cuántas veces se ha instalado cada una. Sin buscar salen destacadas (Superpowers, Impeccable, Ponytail, la
  auditoría de seguridad de Cloudflare, las de Anthropic, HyperFrames). Ponytail (MIT) pide a los agentes el código
  mínimo que resuelve la tarea; instalada aquí la ven todos los proyectos.
- **Instalar desde el enlace** de GitHub: un repositorio entero (`https://github.com/dueño/repo`: instala todas sus
  carpetas con SKILL.md, sin las de pruebas y sin partir las anidadas) o una carpeta (`…/tree/main/skills/pdf`).

Se copia la carpeta de la skill entera (scripts, referencias…) a `habilidades/<nombre>`, con un máximo de 40
archivos de 400 KB. Para saber qué archivos tiene se usa la API de GitHub sin sesión (60 consultas por hora); si no
responde, se buscan en los sitios de siempre (`skills/`, `.claude/skills/`…) y se traen los que cita su SKILL.md.
Nada de lo descargado se ejecuta al instalar, y ningún nombre puede escribir fuera de la carpeta de habilidades.
Si una skill del directorio ya no está en su repositorio (el autor la renombró), el aviso dice qué skills tiene
ahora ese repositorio, para instalar la buena.
Las habilidades son instrucciones que siguen los agentes: instala solo las de fuentes en las que confíes.

### Extensiones: plugins

La tercera parte de **Extensiones** es **Plugins**: paquetes con el formato de los plugins de Claude Code. kywai no
los ejecuta como Claude Code; reparte lo que traen para que lo usen todos sus agentes:

| Lo que trae el plugin | Qué hace kywai |
|---|---|
| `skills/<nombre>/SKILL.md` | Lo copia a «habilidades» con sus archivos. Si ya hay una con ese nombre, la del plugin va como `plugin-nombre`. |
| `commands/*.md` (órdenes «/algo») | Una habilidad `plugin-orden` con su texto y una nota: «donde ponga $ARGUMENTS van los detalles de la petición». |
| `agents/*.md` (subagentes) | Una habilidad `plugin-subagente`: «sigue estas instrucciones como si fueras él». |
| `.mcp.json` o `mcpServers` | Servidores MCP en «Servidores MCP», con la etiqueta «Plugin: …» y **apagados**: los enciendes por agente (se prueban antes). `${CLAUDE_PLUGIN_ROOT}` pasa a ser su carpeta, y las claves `${TOKEN}` quedan vacías para rellenarlas con el lápiz. |
| hooks, servidores de lenguaje (LSP), estilos | No se instalan: el plugin lo dice en «Sin usar». Los cambios de comportamiento serán los mods. |

Los remotos que solo admiten **iniciar sesión en el navegador** (OAuth; responden 401 sin token) y los que solo
van por SSE no se añaden: salen en «Sin usar» con el motivo.

**Catálogos.** Salen los dos de Anthropic (el oficial, `anthropics/claude-plugins-official`, unos 300 plugins, y
el de plugins de trabajo, `anthropics/knowledge-work-plugins`), con ✓, y se buscan por nombre, descripción,
categoría o autor. Con «Añadir el enlace» pegas:
- el enlace de **otro catálogo** (un repositorio con `.claude-plugin/marketplace.json`): se añade y sus plugins salen en la lista;
- el de **un plugin** (`https://github.com/dueño/repo` o una carpeta `…/tree/main/plugins/x`): se instala.

**Cómo se descarga.** Cada plugin baja de GitHub en un solo `.tar.gz` (codeload.github.com, sin el límite de la
API), se lee en memoria y se guarda entero en `plugins/<nombre>` de la carpeta de datos (sus servidores locales
arrancan desde ahí). Límites: 40 MB el plugin, 60 habilidades por plugin. Si el
repositorio entero pasa de 60 MB (por ejemplo `heygen-com/hyperframes`), kywai baja solo la carpeta del plugin,
archivo a archivo (API de GitHub para la lista y raw.githubusercontent.com para el contenido). Los que no están en
GitHub (GitLab, npm…) salen sin poder instalarse. Nada se ejecuta al instalar.

**Quitar** borra sus habilidades, sus servidores MCP y su carpeta. **Instalar otra vez** lo actualiza y conserva sus
servidores con sus claves y sus agentes encendidos (si el servidor sigue en el plugin).

**Muchas habilidades.** El encargo de cada tarea lista hasta 150 habilidades con la descripción recortada a 160
caracteres; el texto entero lo leen cuando lo necesitan.

### Extensiones: mods

La cuarta parte de **Extensiones** son los **mods**: cambian kywai en sí, no a los agentes. Un mod es una carpeta con
un manifiesto `kywai-mod.json` y puede traer tres cosas:

- **Órdenes `/nombre`** para el chat. Al escribir `/revisa el login`, en el chat se ve eso y al equipo le llega el
  texto de la orden con `{args}` cambiado por «el login» (si la orden no usa `{args}`, lo de detrás va al final).
  Valen en el escritorio, la web, Órbita y las rutinas. `/directo`, `/dm`, `/rutina` y `/model` son de kywai y no
  se pueden tapar; si dos mods usan el mismo nombre, gana el primero instalado y el otro lo dice en su ficha.
- **Hooks**: una orden del sistema que se ejecuta al empezar o acabar una petición (`request.started`,
  `request.finished`) o una tarea (`task.started`, `task.done`, `task.failed`). Corre en la carpeta del proyecto,
  en segundo plano (nunca frena una tarea), con un tiempo máximo (60 s por defecto, hasta 600) y con las variables
  `KYWAI_EVENT`, `KYWAI_PROJECT`, `KYWAI_PROJECT_DIR`, `KYWAI_PROJECT_ID`, `KYWAI_MOD_DIR`, `KYWAI_OK` (peticiones) y
  `KYWAI_TASK_TITLE`, `KYWAI_TASK_STATUS`, `KYWAI_TASK_AGENT`, `KYWAI_TASK_RESULT` (tareas). **No se ejecuta nada
  hasta que pulses «Permitir sus hooks»**, que enseña las órdenes; si una versión nueva del mod las cambia, el
  permiso se pierde y hay que darlo otra vez. La ficha del mod dice cómo fue la última vez.
- **Paneles**: páginas HTML que se abren junto al chat, en la pestaña **Mods** del panel izquierdo (solo sale si
  algún mod encendido trae paneles). Van en una caja aislada (iframe sin acceso a la app, sus datos ni su
  almacenamiento) y sin internet salvo el permiso `network`; nunca pueden enviar formularios ni cambiarse por otra página. Sus imágenes, estilos y scripts con ruta relativa se
  meten dentro. Para hablar con kywai usan mensajes:
  - kywai les manda `{kywai: 'context', project: {name}, tasks: [{title, status, agent, result}], messages: [{author, text}]}`
    al abrirse, cada vez que algo cambia y cuando lo piden con `parent.postMessage({kywai: 'context'}, '*')`;
  - con el permiso `chat`, `parent.postMessage({kywai: 'send', text: '…'}, '*')` propone un mensaje al chat, que
    tú confirmas antes de enviarlo.
  - En **Órbita** salen en ☰ → Más → **Mods** (solo si el ordenador los admite). La página va en un WebView sin
    archivos ni navegación a otras páginas, y el mismo código funciona sin cambios: un guion que pone kywai delante
    lleva `parent.postMessage` al puente de la app (`KywaiBridge`), y lo que se propone al chat también se confirma.

**El manifiesto** (`kywai-mod.json`):

```json
{
  "name": "notas-rapidas",
  "title": "Notas rápidas",
  "description": "Para qué sirve",
  "version": "1.0.0",
  "commands": [{ "name": "revisa", "description": "Revisión crítica", "prompt": "Revisa con ojo crítico {args}…" }],
  "hooks": [{ "on": "request.finished", "run": "echo Petición terminada", "timeout": 10 }],
  "panels": [{ "id": "equipo", "title": "Estado del equipo", "file": "panel.html" }],
  "permissions": ["chat"]
}
```

Hay uno de ejemplo completo en `docs/mods/notas-rapidas` (dos órdenes, un panel con el estado de las tareas y un
botón que pide un resumen, y un hook): en la pestaña Mods, «Prueba con el de ejemplo».

Los hooks usan la consola del equipo: `cmd.exe` en Windows (`%KYWAI_PROJECT%`) y `/bin/sh` en macOS y Linux
(`$KYWAI_PROJECT`). Para compartir un hook entre sistemas puedes lanzar un script que lea las variables de entorno.
Si supera su tiempo máximo, kywai corta su árbol de procesos y espera al cierre antes de darlo por terminado.

**Instalar.** Pega el enlace de GitHub de la carpeta del mod (`https://github.com/dueño/repo/tree/main/mi-mod`, se
descarga como los plugins) o la ruta de una carpeta del equipo donde corre kywai (para probar uno que estás
haciendo; vuelve a instalarlo tras cambiarlo). Se guarda en `mods/<nombre>` de la carpeta de datos. «Apagar» lo deja
instalado sin órdenes, hooks ni paneles; la papelera lo borra.

### Aprender de un vídeo (`/aprende`)

**«/aprende <enlace> [para qué]»** (YouTube, un pódcast u otra web que entienda yt-dlp) o **«/aprende [para qué]» con un
vídeo o audio adjunto** convierte lo que enseña ese vídeo en una **habilidad** del equipo. Sin plan de Hermes: una sola
tarea.
1. Antes de que empiece el agente, kywai baja el audio del enlace con **yt-dlp** (con `uvx`, como el dictado) o lo saca
   del adjunto con ffmpeg, y lo **transcribe con Whisper en el propio equipo** (whisper-ctranslate2, modelo small,
   idioma automático). De un vídeo adjunto saca también 6 fotogramas. Todo queda en `.ai-cowork/aprende/<id>/`
   (`transcripcion.txt`, `fotogramas/`).
2. El agente que mejor resume y enseña lee la transcripción (hasta 60.000 caracteres en el encargo; el resto, en el
   archivo) y responde con el `SKILL.md` entero: el **método** que enseña el vídeo (pasos, reglas, plantillas, qué
   evitar), no un resumen. Si no enseña nada aprovechable, responde «BLOQUEADA:».
3. kywai la guarda en `habilidades/<nombre>/SKILL.md` (si el nombre ya existe, con un número) con la fuente al final, y
   contesta con su nombre y para qué sirve. Desde ese momento todo el equipo la ve en su encargo.

Si YouTube u otra web pide iniciar sesión («no eres un robot»), kywai lo dice: se descarga el vídeo y se adjunta. El
audio no sale del equipo. Código: `src/main/learn.ts` (y `sendLearn`/`prepareLearn`/`completeLearn` en el orquestador).

### Editar tus grabaciones (`/editar`) y sacar clips (`/recortes`)

`/video` crea vídeos desde cero; estas dos órdenes editan **lo que grabaste tú**. Adjunta el vídeo al mensaje.

**«/editar [lo que quieres]»** deja la grabación lista para publicar:

- Quita las **muletillas** («eh», «em», «mmm», «um»; palabras de verdad como «este» o «pues», no), los **silencios
  largos** (más de 0,45 s se quedan en un respiro), las **tomas repetidas** (deja la última buena), los **arranques en
  falso** («hoy os enseño, perdón, hoy os enseño…») y lo que no es para el público («¿se oye?»). Lo que pidas quitar
  («/editar quita la parte del café»), también.
- Cada corte lleva un **fundido de 30 ms**: no se oyen chasquidos.
- **Voz limpia y nivelada**: sin zumbidos graves, sin ruido de fondo y al volumen de las redes (−14 LUFS).
- **Color** retocado suave; con `color:cálido`, `color:frío`, `color:contraste` o `color:ninguno` cambia.
- **Subtítulos** quemados en grupos de hasta 3 palabras, la que suena en amarillo (`sin subtítulos` los quita).
- Sale con el formato de la grabación; con `vertical` o `cuadrado`, recortada siguiendo a quien habla.

**«/recortes [n] [lo que buscas]»** con un vídeo largo (una charla, un pódcast, un directo) saca los **n mejores
momentos** (3 por defecto, hasta 8) como clips de 15 a 60 s para Reels, TikTok y Shorts: cada uno empieza con un gancho y
acaba con la idea cerrada, sin muletillas ni pausas largas, en **vertical** (o `cuadrado` / `horizontal`), con
subtítulos y **su título arriba** los primeros 3 segundos. Al entregarlos dice por qué engancha cada uno; para publicar
uno, adjúntalo a `/instagram` o `/tiktok`.

**El encuadre que sigue a quien habla** (como Clipify, sin reconocer caras): kywai compara cada fotograma con el
anterior y busca la franja de la imagen con más movimiento (quien habla mueve la boca y la cabeza). Si en una
entrevista habla el otro durante 2 s seguidos, el encuadre salta a él con un corte seco. Si casi nada se mueve (una
pantalla, un plano fijo), usa dónde dijo el agente que está la persona al mirar los fotogramas. Una grabación más
estrecha que el formato (un vídeo vertical que pides horizontal) va encajada sobre su propia imagen desenfocada.

Cómo funciona (una sola tarea, sin plan de Hermes):
1. kywai saca el audio con ffmpeg y lo **transcribe palabra a palabra con Whisper en el propio equipo**
   (whisper-ctranslate2, modelo small, `--word_timestamps`), y saca 4 fotogramas (8 en `/recortes`). Queda en
   `.ai-cowork/edicion/<id>/` (`palabras.json`, `fotogramas/`).
2. Un agente lee la transcripción (en `/editar`, cada palabra con su número: `{12}hola`; en `/recortes`, cada frase
   con su primera y última palabra: `#120-#135`) y responde solo un JSON: los tramos que sobran (`"cut": [[40, 52]]`)
   o los clips (`"clips": [{"title", "from", "to", "why"}]`). Si no vale (o quitaría más del 70 % del vídeo), se
   reintenta con otro agente.
3. kywai corta cada tramo con su fundido, los une limpiando la voz, encuadra, retoca el color y quema los subtítulos
   (ffmpeg con libass; si no lo trae, entrega sin subtítulos y lo dice). Después lo repasa (pantallas negras,
   silencios) y lo cuenta en la respuesta. Se entrega en `videos/<título>-editado.mp4` o
   `videos/recortes-<grabación>/<n>-<título>.mp4`.

Nada sale del equipo: sin claves de pago. Ideas de [video-use](https://github.com/browser-use/video-use) y
[Clipify](https://github.com/louisedesadeleer/clipify) (las dos MIT), reimplementadas. Código: `src/main/footage.ts`
(y `sendFootage`/`prepareFootage`/`completeFootage` en el orquestador).

### Vídeo de presentación de una web (`/demo`)

**«/demo <web> [vertical] [presentador] [lo que quieres destacar]»** hace un anuncio corto (de 18 a 35 s) de una web **con fotos
reales de la página**, no con imágenes inventadas: se ve la web de verdad, nítida y con su marca. Por defecto sale
horizontal (1920×1080); con «vertical» (o «reel», «tiktok», «9:16») sale para Reels y TikTok (1080×1920). Ejemplo:
«/demo kywai.app vertical que se vea el espacio 3D».

1. kywai abre la web en una ventana oculta (sesión aparte, sin permisos ni ventanas nuevas, sin salir de esa web), baja
   hasta el final para que cargue todo y la fotografía entera en **ordenador** (1440 de ancho) y en **móvil** (390 de
   ancho a doble resolución). Lee el título, la descripción, las secciones y el **color de la marca** (el
   `theme-color` o el de sus botones). Queda en `.ai-cowork/demo/<id>/` (`escritorio.png`, `movil.png`, `pagina.json`).
2. Un agente mira las fotos y hace el **guion de planos** eligiendo de las **fichas de planos**: `portada` (el gancho
   sobre el color de la marca), `recorrido` (la web bajando de una sección a otra), `acercamiento` (de una sección
   entera a un detalle), `detalle` (plano cerrado con rótulo), `movil` (la web en un teléfono sobre la web
   desenfocada), `pareja` (ordenador y móvil a la vez), `rotulo` (una frase a pantalla completa) y `cierre` (llamada a
   la acción y la dirección). Responde solo un JSON; si no vale, se reintenta con otro agente.
3. kywai monta cada plano con ffmpeg (movimientos de cámara suaves sobre las fotos, rótulos que aparecen), los une con
   fundidos y le pone música. Se entrega en `videos/<título>-demo.mp4` (o `-demo-vertical.mp4`).

Hace falta la app de escritorio (las fotos las hace Electron). Idea de las fichas de planos de
[video-shotcraft](https://github.com/Vincentwei1021/video-shotcraft) (Apache-2.0), reimplementada sin Remotion.
Código: `src/main/webDemo.ts` y `src/main/htmlShot.ts` (y `sendDemo`/`prepareDemo`/`completeDemo` en el orquestador).

**Con presentador.** Añade «presentador» y un robot de kywai cuenta la web desde la esquina de abajo a la derecha, como
en los reels de «mira esta herramienta»: entra desde abajo, flota y da saltitos mientras habla. Encima van un **rótulo
rojo fijo arriba** (p. ej. «REPO DE GITHUB», lo elige el agente) y **subtítulos palabra a palabra** (la que suena en
amarillo). Ejemplos: «/demo kywai.app vertical presentador», «/demo kywai.app presentador:claude voz:kokoro-af_bella».

- Quién presenta: `presentador` (Hermes), `presentador:claude`, `presentador:codex` o el id de **un personaje tuyo**
  de la biblioteca de «/video» (sale su primera imagen en un círculo con el borde del color de la marca).
- Qué dice: el agente escribe una frase por plano (`"say"`, de 6 a 18 palabras, la primera engancha y la última es la
  llamada a la acción). kywai graba cada frase con la voz elegida (`voz:<id>`, las mismas del selector de «/video») o,
  sin elegir, con la del idioma (Álvaro en español, Bella en inglés); si esa voz no sale, con la del sistema.
- Cada plano dura lo que su frase (como mínimo lo de su ficha) y la música va baja por debajo de la voz.
- Si no sale ninguna voz, el vídeo se hace igual pero sin presentador. Si ffmpeg no tiene libass, sale sin subtítulos ni
  rótulo.

**Repositorios de GitHub.** Con un enlace a un repositorio («/demo github.com/dueño/repo vertical») kywai fotografía su
portada (los datos y el README) y pide a la **API pública de GitHub** sus datos reales: estrellas, forks, licencia,
lenguaje, temas y último cambio. El guion solo puede usar esas cifras y tiene una ficha más, **`repo`**: la tarjeta del
repositorio (dueño / nombre, descripción y pastillas con ★ estrellas, forks, licencia y lenguaje). Con GitHub el
presentador va **por defecto**; «sin presentador» lo quita.

Código: `githubRepo`, `fetchRepoFacts`, `repoCardHtml`, `presenterHtml`, `spokenWords` y `finishWithPresenter` en
`src/main/webDemo.ts`; la voz de cada frase con `speakLine` (`src/main/videoStudio.ts`) y el presentador con
`demoVoices`/`demoPresenterInfo` en el orquestador. Idea del formato de los reels de «alerta de repo»; nada copiado.

### Portadas para tu vídeo (`/miniatura`)

**«/miniatura [vertical|horizontal] [lo que quieres]»** hace **tres portadas distintas** para el vídeo que adjuntes o,
si no adjuntas ninguno, para el último vídeo del chat. Sale del tamaño del vídeo (vertical 1080×1920 para Reels y
TikTok; horizontal 1280×720 para YouTube) salvo que digas otro. También vale «/portada» o «/thumbnail».

1. kywai saca 8 fotogramas del vídeo a buena resolución (en `.ai-cowork/miniaturas/<id>/`).
2. Un agente los mira y, para cada portada, elige el fotograma, el texto (de 2 a 5 palabras, cada portada con un
   ángulo distinto), una línea opcional debajo, el color y el diseño: **grande** (texto enorme con contorno sobre el
   fotograma), **lateral** (el fotograma a un lado y el texto en un bloque de color) o **caja** (el texto en franjas de
   color inclinadas). En vertical deja libre el tercio de abajo, donde la app pone sus botones.
3. kywai hace cada portada como una página y la fotografía (letra nítida; el titular se encoge solo si no cabe). Se
   entregan en `videos/miniaturas-<vídeo>/1-<texto>.png`, `2-…` y `3-…`.

Hace falta la app de escritorio. Código: `src/main/thumbnail.ts` (y `sendThumbnail`/`prepareThumbnail`/
`completeThumbnail` en el orquestador).

### Sprites de pixel art para juegos (`/sprite`)

**«/sprite [tamaño] [4|8 direcciones] [animaciones] [qué personaje]»** hace un personaje en pixel art listo para un
videojuego (Godot, Unity, GameMaker, Phaser…): «/sprite caballero con capa roja», «/sprite 32px 8 direcciones maga que
corre y lanza hechizos», o adjuntando una imagen o un modelo 3D (.glb, .gltf, .vrm, .fbx, .obj). La idea sale de un
reel de una herramienta que convierte modelos 3D en sprites. Por defecto: 64 px de alto, 4 direcciones e idle + walk;
las animaciones se entienden en español o inglés (reposo, caminar, correr, saltar, atacar/espada, magia/hechizo,
saludar, celebrar, morir, disparar).

No pasa por el plan: va directa al agente que mejor encaja (`bestAgentFor`) con el encargo que arma
`src/main/sprite.ts`, y en el chat se ve lo que escribiste. El agente elige el primer camino que tenga:

1. **PixelLab** (si añadiste su extensión en Ajustes → Extensiones → «Explorar catálogo», con «Bearer» y tu token de
   pixellab.ai): crea el personaje en las direcciones pedidas, lo anima y descarga lo que devuelva.
2. **Modelo 3D adjunto**, en el equipo con Blender en segundo plano: cámara ortográfica elevada, una vista por
   dirección, las animaciones que traiga el modelo, render a 4× y reducción a píxeles. Sin Blender, lo dice.
3. **Imagen o descripción**, con Python y Pillow: de una sola imagen solo salen su dirección y su espejo, con
   animaciones sencillas (lo avisa).

En los caminos locales, pixel art de verdad: reducir con promedio y ampliar con vecino más cercano, paleta común de
24 colores como mucho, alfa de todo o nada y contorno oscuro de 1 px, con los pies siempre en el mismo sitio. Entrega
en `sprites/<personaje>-<id>/`: `frames/<animación>_<dirección>_<n>.png`, `hoja.png` + `hoja.json` (una fila por
animación y dirección), un GIF por animación ampliado 4× y un ZIP con todo. Órbita tiene la orden en su lista del «/».

### Radar de temas (`/radar`)

**«/radar [N días] [N temas] [nicho]»** busca qué temas están subiendo ahora para tu nicho y te deja una ficha de
cada uno: «/radar agentes de IA», «/radar últimos 3 días 10 temas Claude Code». También vale `/tendencias`. Sin nicho,
el agente lo saca de las instrucciones y archivos del proyecto. Por defecto, 7 días y 8 temas. La idea sale de un reel
en el que un agente vigila YouTube cada 4 horas y pinta cada tema como una estrella con su nota.

No pasa por el plan: va directa al agente que mejor investiga (`bestAgentFor`) con el encargo de `src/main/radar.ts`:

1. Busca en YouTube con **yt-dlp** (sin claves ni cuentas; lo instala con uv o pipx si falta), lo más reciente y lo
   más relevante, y contrasta en la web (GitHub trending, Hacker News, Reddit, noticias del nicho).
2. Agrupa por tema y puntúa de 0 a 100: **impulso** (hasta 50: vídeos que rinden por encima de su canal),
   **amplitud** (hasta 30: cuántas fuentes distintas) y **hueco** (hasta 20: pocos vídeos buenos en tu idioma).
   Copia las cifras de las herramientas y nunca las inventa.
3. Compara con los 3 últimos radares del proyecto y marca cada tema como nuevo, sigue subiendo o se enfría.

Deja `radar/AAAA-MM-DD-HHMM.md` con el ranking. De cada tema pone la puntuación, la señal más fuerte (vídeo, canal,
vistas, cuándo y enlace), por qué sube, **5 títulos**, **3 ángulos** y la orden `` `/video …` `` lista. Al final
añade los temas que se enfrían. En el chat contesta con el top 5.

**Órdenes que se pulsan**: cuando un agente escribe una orden de kywai entre comillas invertidas
(`` `/video …` ``, `` `/radar …` ``, `` `/rutina …` ``…), el chat la enseña con ▶ y un borde. Al pulsarla queda escrita
en el cuadro del chat, lista para enviarla o cambiarla, pero no se envía sola. Vale para cualquier orden de la lista
del «/» (`isKywaiCommand` en `src/shared/chatCommands.ts`).

Para que vigile solo: «/rutina cada 4 horas: /radar agentes de IA». Órbita tiene la orden en su lista del «/».

### Consejo de agentes (`/consejo`)

**«/consejo [N] pregunta»** hace la misma pregunta a varios agentes a la vez y luego uno junta lo mejor: «/consejo
¿Postgres o SQLite para una app pequeña?», «/consejo 5 ¿cómo planteo la caché de esta API?». También valen `/panel`,
`/mezcla` y `/mixture`. Por defecto son 3 consejeros (de 2 a 5). La idea sale del «Mixture of Agents» de un reel:
varios modelos responden en paralelo y uno hace de presidente.

No hay un motor aparte (`src/main/council.ts`). kywai elige los consejeros entre los agentes disponibles, primero de
familias de modelos distintas (Claude, GPT, Gemini, Qwen…), y le pasa a Hermes un encargo con N tareas en paralelo
con la misma pregunta. Cada consejero contesta por su cuenta en `consejo/<nombre>.md`. Después va una última tarea,
que depende de todas, para el agente más fuerte: escribe `consejo/sintesis.md` con en qué coinciden, en qué
discrepan y quién tiene razón, lo que solo vio uno y la respuesta final. En el chat se ve lo que escribiste. Es una
petición normal: pasa por el plan (con tu visto bueno si lo pides), el reparto y la verificación, y nunca se toma
como un cambio a un plan que espera. Órbita tiene la orden en su lista del «/».

### Doblar un vídeo a otro idioma (`/doblar`)

**«/doblar <idioma> [lo que quieres]»** pasa el último vídeo hecho con `/video` (o el que adjuntes, si salió de este
proyecto) a otro idioma: «/doblar inglés», «/doblar al portugués más informal». Idiomas: español, inglés, portugués,
francés, italiano, alemán, catalán, neerlandés, polaco, ruso, turco, árabe, hindi, chino, japonés y coreano.

1. kywai busca la carpeta de trabajo del vídeo (`.ai-cowork/videos/<id>/`, con su `guion.json` y sus imágenes). Cada
   vídeo de `/video` deja ahí un `entregado.json` con el archivo que entregó; en los de antes, se busca por el nombre.
2. Un agente traduce el guion (la voz, los rótulos, el cierre y los textos de las animaciones de Manim) como lo diría
   alguien nativo, con las mismas marcas de emoción y de quién habla y el mismo número de escenas.
3. kywai lo vuelve a montar con **las mismas imágenes** (y el mismo presentador y clips de FreeVideo, sin hacerlos otra
   vez): cambian la voz (la del idioma), los subtítulos y los rótulos. El doblado también se puede doblar.

Las películas con estilo y los vídeos de fuera no se pueden doblar (no hay guion de kywai). Código: `src/main/dub.ts` y
`reuseFrom` en `renderVideo` (`src/main/videoStudio.ts`).

### Series por episodios (`/serie`)

**«/serie <idea> [en 5 episodios]»** cuenta una historia en vídeos cortos con **los mismos personajes**, para subirlos
uno a uno (por defecto 5, de 2 a 10; vertical salvo que digas «horizontal»). Vale todo lo de `/video`: un estilo de
película («/serie estilo acuarela una bruja novata»), «personajes fijos» con imágenes adjuntas, etc.

- Hace el **episodio 1** al momento. Cada episodio **acaba en suspense** y la última frase de la voz es una **pregunta
  para votar en los comentarios** con dos opciones («¿Abre la puerta o huye? Comenta A o B»). El último episodio cierra
  la historia, sin pregunta.
- **«/serie siguiente ganó B»** (o «/serie siguiente ganó: abre la puerta», o solo «/serie siguiente») hace el que toca:
  el agente lee lo que pasó en los anteriores y sigue la historia por lo que votó la gente. Empieza con un «previamente»
  de una frase.
- **Personajes**: los de la carpeta `personajes/` del proyecto si los hay; si no, el primer episodio se inventa de 1 a 3
  protagonistas y su descripción se repite igual en todos los demás.
- **«/serie»** solo dice cómo va (cuántos episodios lleva y la última pregunta).
- Lo que pasa en cada episodio (título, resumen, cómo quedó, pregunta, lo votado y el vídeo) se guarda en
  `.ai-cowork/serie.json`. Una serie a la vez por proyecto: empezar otra guarda la anterior como `serie-<fecha>.json`.

Código: `src/main/series.ts` y `sendSeries` en el orquestador.

### El Instagram de kywai (`/instagram`)

kywai puede llevar **su propia cuenta de Instagram** (la de kywai, no la tuya) y publicar ahí los reels que hace.
Se conecta con la **API oficial de Instagram**: nunca se pide ni se guarda la contraseña.

**Conectar la cuenta** (una vez, en ⚙ → Ajustes → Extensiones → Estudio de vídeo → «El Instagram de kywai»). El botón
**«¿Cómo lo hago?»**, junto al título, despliega estos pasos con un botón que abre la web de Meta:
1. La cuenta de Instagram tiene que ser **profesional** (de empresa o de creador; se cambia gratis en la app de
   Instagram → Configuración → Tipo de cuenta).
2. En [developers.facebook.com](https://developers.facebook.com) crea una app de tipo «Empresa» y añade el producto
   **Instagram** («API de Instagram con inicio de sesión de Instagram»). Añade la cuenta como probadora, acepta la
   invitación en Instagram y **genera un token** con los permisos `instagram_business_basic` e
   `instagram_business_content_publish` (empieza por `IG…`). También vale un token de Facebook (`EAA…`) de una página
   unida a la cuenta, con `instagram_content_publish`.
3. Pega el token y pulsa **Conectar**: kywai lo comprueba, dice de qué cuenta es (@nombre) y lo guarda **cifrado** con
   el llavero del sistema (como las claves de los agentes). Los tokens duran unos 60 días: cuando caduque, kywai lo dice
   al publicar y pegas uno nuevo.

**Publicar.** **«/instagram [qué quieres en el texto]»** coge el último vídeo del chat (o el MP4 que adjuntes) y un
agente escribe el texto: gancho en la primera línea, una llamada a la acción y de 3 a 6 hashtags (si es un episodio de
`/serie`, repite la pregunta para votar). Sale una tarjeta con el vídeo y el texto, que puedes **cambiar** antes de
pulsar **Publicar** (también desde «Te necesita», en el escritorio, la web y Órbita). kywai le da el MP4 a Instagram:
con un token de Facebook (EAA…) lo sube desde el equipo (subida reanudable de Meta); con uno de Instagram (IG…, el
habitual), Meta no admite esa subida y solo acepta un **enlace público** (y lo mismo si rechaza la subida directa con un
token EAA, como pasa con los de usuario del sistema). Ese enlace sale:

1. **Del propio equipo con Tailscale Funnel**, si Tailscale está conectado y la red permite Funnel. kywai arranca un
   servidor diminuto que solo entrega ese vídeo en una dirección con un código al azar (todo lo demás da «no
   encontrado»), lo abre con Funnel en el puerto 8443 (o 10000 si está ocupado) y lo cierra en cuanto Instagram
   termina. Nunca abre el 443, que es el acceso privado a kywai. Para permitirlo, una vez: en
   [login.tailscale.com](https://login.tailscale.com) → **Access controls**, añade el atributo `funnel` al equipo (el
   enlace exacto sale en el error si falta). Ojo: el nombre del equipo en Tailscale (`algo.ts.net`) es visible en
   internet mientras dura la publicación.
2. Si no, de un **alojamiento temporal** que lo borra solo (Litterbox 1 hora, Uguu 3 horas o tmpfiles.org 1 hora: el
   primero que responda, cada uno con un reintento).

Después espera a que Instagram lo procese y deja el **enlace** en el
chat. Si falla, la tarjeta dice por qué y tiene **Reintentar**: el error nombra el paso (preparar la publicación,
subir el vídeo, comprobarlo o publicar el reel), lo que contestó Meta y su código o `fbtrace_id`. Los errores 500
pasajeros de la subida se reintentan solos dos veces. Ninguna petición se queda colgada: cada paso tiene un tope de
tiempo (1 minuto; la subida, 2 minutos más 1 por cada 5 MB). Si cierras kywai a mitad de una publicación (de Instagram
o de TikTok), al volver a abrirlo la tarjeta queda como fallida, con **Reintentar**, en vez de seguir dando vueltas.

**Portada con gancho.** Sin portada, Instagram pone el primer fotograma, que en los vídeos de kywai suele salir negro
(así salieron los primeros reels de kywai_app). Ahora, antes del texto, kywai saca 8 fotogramas del vídeo y el mismo
agente que escribe el texto elige uno y escribe el **gancho de la portada** (de 2 a 5 palabras) en una última línea
`PORTADA: {…}`, que no acaba en el texto publicado. kywai hace la portada como en «/miniatura» (diseño «grande» o
«caja», 1080×1920 en JPG), con el texto dentro del **recorte 3:4 de la cuadrícula del perfil** (Instagram quita 240 px
arriba y abajo), la deja junto al vídeo (`<vídeo>-portada.jpg`) y la enseña en la tarjeta. Al publicar se la da a
Instagram como `cover_url`, con un enlace público igual que el vídeo (Funnel o alojamiento temporal), y además el
fotograma elegido como `thumb_offset`: si la imagen no se puede subir, el reel sale igual con ese fotograma. **Si
adjuntas una imagen** a «/instagram», esa es la portada (se recorta a 1080×1920) y el agente no diseña ninguna. Sin
la app de escritorio (no hay ventana para hacer la imagen) queda solo el fotograma. Instagram no deja cambiar la
portada de un reel ya publicado por la API: los publicados antes se cambian a mano en la app.

**Publicar sin preguntar.** Con ese botón activado, lo que prepara «/instagram» se publica solo al terminar el texto,
también desde una **rutina** («/rutina cada día a las 18:00: /serie siguiente» y otra «… /instagram»). «Volver a pedir
mi visto bueno» lo desactiva. Por defecto está apagado.

**Reel de prueba.** **«/instagram prueba [qué quieres en el texto]»** hace lo mismo, pero lo publica como **reel de
prueba** (trial reel): Instagram lo enseña primero solo a quien **no** sigue la cuenta y, si funciona bien, lo pasa
solo a los seguidores (`trial_params` con `SS_PERFORMANCE` en la API). Sirve para probar un gancho o un formato sin
gastar a los seguidores. La tarjeta dice «Reel de prueba».

**Resultados.** **«/instagram resultados»** lee con la API los números de los últimos 12 reels (vistas, alcance, me
gusta, comentarios, guardados, envíos y tiempo medio de visionado), los guarda en
`<carpeta de trabajo>/instagram/resultados.md` (los mejores, los peores y una tabla con todos) y te dice en el chat
cuáles funcionaron mejor. Con **3 reels o más**, los guiones de `/video` y los textos de `/instagram` leen ese archivo:
copian la forma de los ganchos que funcionaron y evitan lo que tienen en común los que no. Vuelve a pedirlo de vez en
cuando (o en una rutina: «/rutina cada lunes a las 9: /instagram resultados») para que aprendan de lo último.

Código: `src/main/instagram.ts` (la API), `src/main/instagramLearn.ts` (resultados) y
`sendInstagram`/`sendInstagramResults`/`publishPost` en el orquestador.

**Llevar la cuenta: las órdenes `/ig-…`.** kywai trae las habilidades de
[Instagram Agent Skill](https://github.com/postzen-dev/instagram-agent-skill) (licencia MIT, versión fija): la
primera vez que usas una, kywai descarga el paquete en `<carpeta de trabajo>/instagram/instagram-agent-skill/`, y un
agente con terminal (primero Claude) la sigue entera, sin pasar por el plan de Hermes:

| Orden | Qué hace |
| --- | --- |
| `/ig-plan [qué quieres esta semana]` | Plan de la semana: qué publicar, en qué formato, cuándo y con qué 10 cuentas interactuar. |
| `/ig-viral [nicho o cuentas]` | Los reels que funcionan en tu nicho, ordenados por cuánto superan lo normal de su cuenta, con la fórmula de cada gancho. |
| `/ig-reel idea` | Tres ganchos puntuados, guion, texto en pantalla y tiempos; acaba con la orden `/video …` para hacerlo. |
| `/ig-profile` | Nota del perfil sobre 100 y cómo reescribirlo, por prioridad. |
| `/ig-audit` | Qué publicaciones funcionaron de verdad (envíos y guardados por alcance, no solo vistas). |
| `/ig-reply` | Las respuestas a los comentarios sin contestar de las últimas 10 publicaciones, por orden de importancia, en una tarjeta (ver abajo). |
| `/ig-comment post` | Dos comentarios buenos para un post de **otra** cuenta. Los pegas tú: la API de Instagram no deja comentar ahí y hacerlo con un navegador automático incumple sus normas. |

También valen `/ig-caption`, `/ig-carousel`, `/ig-story`, `/ig-dm`, `/ig-repurpose` e `/ig-human` (no salen en la
lista del «/» para no llenarla). Con la cuenta conectada, kywai saca antes con la API oficial el perfil y las últimas
25 publicaciones (con vistas, alcance, guardados y envíos de las 12 más recientes) y se las da al agente en
`.ai-cowork/instagram/cuenta-<fecha>.md`: así no te pregunta tus números. La **voz de la cuenta** (cómo habla kywai, a
quién, qué evita) va en `<carpeta de trabajo>/instagram/voice.md`; si no existe, el agente la crea con la plantilla
del paquete la primera vez que la necesita. Nada de esto publica, comenta ni manda mensajes: lo que sale se publica con
`/instagram`, con tu visto bueno. Del paquete se quita PostZen (un servicio que pide tu contraseña de Instagram).
Código: `src/main/igSkills.ts` y `sendIgSkill` en el orquestador.

**Responder a los comentarios (`/ig-reply`).** Con la cuenta conectada, kywai trae con la API oficial los comentarios
sin responder de las últimas 10 publicaciones (sin los de la propia cuenta ni los que ya tienen respuesta suya, como
mucho 40) y un agente los clasifica (palabra clave, posible cliente, con fondo, pregunta, apoyo, ruido) y escribe cada
respuesta. Salen en una **tarjeta**: cada comentario con su respuesta editable y **«Responder»** o **«Saltar»**, y
**«Responder todas»** si hay varias; el ruido sale ya como «Sin responder». También aparece en «Te necesita». **Nada se
envía sin pulsarlo**, y la tarjeta dice cuáles salieron y cuáles fallaron (con «Reintentar»). Hace falta el permiso de
comentarios del token (`instagram_business_manage_comments` o `instagram_manage_comments`). Los comentarios en posts de
**otras** cuentas no se pueden enviar desde kywai (la API no lo permite): `/ig-comment` te los escribe para pegarlos.
Código: `unansweredComments`/`replyToComment` en `src/main/instagram.ts` y `completeIgReply`/`decideInstagramReply` en
el orquestador; la tarjeta, `InstagramRepliesBlock` en `Messages.tsx`.

**Turno de noche (`/turno-noche`).** La cadena entera del Instagram de kywai en una sola orden, pensada para dejarla
en una rutina de madrugada («/rutina cada día a las 3:00: /turno-noche IA y productividad»). También vale `/maquina`,
`/turno` o `/noche`. Detrás va el nicho, unas cuentas o enlaces que quieras que mire (si no pones nada, lo saca de la
voz de la cuenta). Lo que pasa:
1. Un agente con terminal sigue la habilidad `ig-viral` y busca los vídeos cortos del nicho que han superado **3 veces
   o más** lo normal de su creador (la mediana de sus últimos vídeos). Mira YouTube Shorts y TikTok públicos (con
   yt-dlp lee las vistas sin bajar nada) y la web; de Instagram solo los enlaces que pongas tú. Nunca inicia sesión.
2. Del mejor: lo baja, lo transcribe con Whisper en el equipo y saca un fotograma cada 2 s, y escribe `desmontaje.md`
   (gancho literal y su tipo, estructura con tiempos —gancho, contexto, pasos, prueba, llamada—, cada cuánto cambia el
   plano, texto en pantalla, subtítulos y por qué funcionó).
3. Escribe un reel **nuevo** para la cuenta de kywai con la estructura y la fórmula del gancho, **nunca** su texto,
   sus imágenes ni su voz, siguiendo `ig-reel` (tres ganchos puntuados) y **el método viral de la cuenta**
   (`<carpeta de trabajo>/instagram/metodo-viral.md`): la primera noche lo crea con reglas cortas y numeradas, y cada
   noche le añade lo que aprenda. Puedes editarlo tú: manda sobre todo lo demás.
   Si el proyecto tiene un **radar de temas** («/radar», carpeta `radar/`), empieza por los temas del último.
4. **Aprende de lo tuyo**: si `instagram/resultados.md` tiene 3 reels o más («/instagram resultados») y uno superó el
   doble de la mediana de la cuenta, el reel de esa noche va del mismo tema con otro gancho.
5. Su respuesta (de qué reel salió, cuántas veces su normal y el gancho elegido) sale en el chat, y kywai lanza él
   mismo el vídeo vertical con la orden que dejó (`/video vertical estilo:… guion`): tu voz si la clonaste, subtítulos
   palabra a palabra, música y efectos. El estilo lo elige el agente entre los que mejor quedan en reels
   (Detrás de la máquina, Lista contrarreloj, Robots de bloques, Lista de comprobación, Anuncio de app, Garabatos) o
   ninguno.
6. Con el vídeo hecho, kywai lo prepara como **reel de prueba** («/instagram prueba»: primero lo ven solo quienes no
   siguen la cuenta). Se publica con tu visto bueno en la tarjeta, o solo si tienes activado «Publicar sin preguntar».
   Con «sin publicar» detrás («/turno-noche IA sin publicar») se queda en el vídeo.

Todo queda en `<carpeta de trabajo>/instagram/turno-noche/<fecha>/` (`elegidos.md`, `fuente/`, `desmontaje.md`,
`guion.md` y los datos de la cuenta). Código: `src/main/nightShift.ts` (el encargo y la orden del vídeo) y
`sendNightShift`/`completeNightShift`/`postNightShiftReel` en el orquestador; el vídeo lleva `afterwards: 'ig-trial'`.

### El TikTok de kywai (`/tiktok`)

Igual que con Instagram, kywai puede llevar **su propia cuenta de TikTok** (la de kywai, no la tuya). Usa la **API
oficial de TikTok** (Content Posting API): nunca se pide ni se guarda la contraseña.

**Crear la app** (una vez, en [developers.tiktok.com](https://developers.tiktok.com) con la cuenta de kywai). El botón
**«¿Cómo lo hago?»**, junto al título «El TikTok de kywai» en Ajustes, despliega estos pasos con un botón que abre la web:
1. Crea una app y añade los productos **Login Kit** y **Content Posting API** (con «Direct Post» activado).
2. Pide los permisos `user.info.basic`, `video.upload` y `video.publish`.
3. En Login Kit → **Desktop**, registra la dirección de vuelta que enseña kywai en Ajustes
   (`http://localhost:3455/tiktok/callback`).
4. Copia el **Client key** y el **Client secret**. Mientras TikTok no revise la app, usa los del **Sandbox** (crea uno y
   añade la cuenta de kywai en «Target users»). Cuando la aprueben, pulsa **Desconectar** → **Cambiar la app**, pega la
   clave y el secreto de producción y vuelve a iniciar sesión. «Cambiar la app» sirve también si te equivocaste al pegar.

**Conectar la cuenta** (⚙ → Ajustes → Extensiones → Estudio de vídeo → «El TikTok de kywai»): pega la clave y el
secreto y pulsa **Guardar**; luego **Iniciar sesión en TikTok**, autoriza la cuenta de kywai y, cuando el navegador
llegue a la página de localhost (que no carga, es normal), **copia esa dirección entera** y pégala en kywai →
**Conectar**. Funciona aunque kywai corra en el servidor y tú estés en otro equipo. El acceso dura 24 horas y kywai lo
renueva solo durante un año; todo se guarda **cifrado** con el llavero del sistema.

**Dos modos.**
- **Borrador (desde el primer día):** «/tiktok [qué quieres en el texto]» coge el último vídeo del chat (o el MP4
  adjunto), un agente escribe el texto y sale una tarjeta. **Enviar como borrador** lo deja en la bandeja de la app de
  TikTok (notificación «tienes un vídeo»): ahí lo abres, **pegas el texto** (TikTok no lo deja enviar con el borrador;
  la tarjeta lo tiene listo para copiar) y lo publicas. Con **«Enviar borradores sin preguntar»**, se envía solo, también
  desde una rutina.
- **Publicar directo:** la tarjeta pide elegir **quién puede verlo** (sin opción por defecto, como exige TikTok),
  si se permiten comentarios, dúos y «stitch», y si es contenido promocional. Hasta que TikTok **apruebe la app**
  (la auditoría se pide en developers.tiktok.com), solo deja publicar en **privado** («Solo yo») y además **la cuenta de
  TikTok tiene que ser privada** (en la app: Ajustes y privacidad → Privacidad → Cuenta privada); si no, TikTok lo
  rechaza y kywai lo explica en la tarjeta. Los borradores no tienen esa limitación. Cuando la aprueben,
  pulsa **«TikTok ya aprobó la app»** en Ajustes y aparecen las opciones públicas. Publicar directo siempre necesita tu
  clic en la tarjeta (regla de TikTok). Los vídeos van marcados como **hechos con IA**.
- **Portada:** el agente que escribe el texto elige también el fotograma de portada entre 8 del vídeo (sin eso TikTok
  pone el primero, que suele salir negro). Al publicar directo va como `video_cover_timestamp_ms` y la tarjeta dice de
  qué segundo es. La API de TikTok no admite una imagen aparte, así que no lleva texto encima; en un **borrador** la
  portada se elige en la app al publicarlo.

Si TikTok falla, la tarjeta dice **en qué paso** (preparar, enviar el vídeo, comprobarlo) y qué contestó, con su
`log_id` si lo trae. Los errores 500 pasajeros se reintentan solos dos veces.

Código: `src/main/tiktok.ts` (la API) y `completeTikTok`/`decideTikTokPost` en el orquestador.

### Hermes te ayuda a conectar los agentes desde el chat

Si escribes en el chat algo como «¿cómo conecto Codex?», «ayúdame a configurar los agentes» o «Claude dice que no
tengo sesión», el coordinador pone en su plan los ids de esos agentes (`"connect"`; si no dices cuáles, todos menos el
local) y kywai enseña una tarjeta **«Conectar agentes»** con una fila por agente:

- Cada fila comprueba su estado al aparecer (los ya conectados salen con ✓ y su cuenta) y el contador dice «N de M listos».
- **Conectar** hace todo lo que kywai puede hacer por ti: si falta el programa, lo instala (y antes Node.js o Python, si
  los necesita), abre la ventana guiada de inicio de sesión (la misma de «Iniciar sesión» del asistente) y enseña sus
  pasos debajo. Mientras tanto mira cada 5 segundos, y al volver a kywai, si ya quedó conectado (hasta 15 minutos).
- Lo único que te toca es entrar con tu cuenta en el navegador y aceptar: ningún agente puede entrar en tus cuentas por
  ti. En Gemini y en los agentes de catálogo con clave de API, la fila trae también un campo para pegar la clave y
  «Conseguir una».
- Desde Órbita o el navegador la tarjeta solo enseña el estado: la ventana de inicio de sesión se abre en el ordenador
  donde está kywai. Las rutinas no la ponen.
- En el último paso del asistente, lo que queda pendiente recuerda que se puede terminar pidiéndolo en el chat.

Código: `proposeConnect` en el orquestador, `src/renderer/src/ui/left/ConnectAgentsBlock.tsx` y `loginToolOf` en
`src/shared/setupTool.ts`.

### Hermes te propone habilidades

Cuando una petición es de un campo especializado (un framework, un formato de archivo, un tipo de diseño, marketing,
seguridad, datos…) y Hermes cree que una habilidad escrita por otros ayudaría a hacerlo mejor, en su plan pone una
búsqueda corta en inglés (`"skills"`). kywai la busca en **skills.sh** sin frenar el plan y, si encuentra alguna que
no tienes, enseña en el chat una tarjeta **«Habilidades que pueden ayudar»** con hasta 3 (primero las de fuentes de
confianza y luego las más instaladas; las que casi nadie usa no salen). Cada una tiene **Instalar**; **Descartar**
cierra la tarjeta.

- **Nunca instala nada solo**: solo al pulsar «Instalar». Lo que instalas lo ven los agentes desde la siguiente tarea
  (con el visto bueno del plan activado, puedes instalarla antes de aprobarlo).
- No repite: una búsqueda o una habilidad que ya salió en el proyecto no vuelve a salir. Hermes ve la lista de las que
  ya tienes y no propone ninguna si ya hay una que sirve. Las rutinas no proponen habilidades.
- Si skills.sh no responde, no pasa nada: no sale la tarjeta.

Código: `proposeSkills` y `decideSkillProposal` en el orquestador, y `src/main/skillSuggest.ts`.

### Crear vídeos con solo pedirlo (`/video`)

Pides un vídeo y te llega **solo el vídeo**: un MP4 que se ve en el propio chat (con Abrir y Descargar debajo). Sin
plan que aprobar, sin informes ni archivos sueltos.

**Cómo se pide** (en el escritorio, la web, Órbita y las rutinas):

- **Con el selector de cuatro pasos** (escritorio, web y Órbita): al escribir `/video` se abre encima del cuadro un panel con
  **1. Tipo de vídeo** (rápido con texto animado, dibujos con presentador o mixto), **2. Personaje** (ninguno, los
  robots de kywai, los que hayas creado o «Agregar personaje»), **3. Estilo de animación** (el de kywai, rápido, o
  uno de los 79 estilos de película con su muestra, o uno de los 9 aspectos de «Imágenes con IA», que puedes
  probar antes con tu escena) y **4. Voz** (automática o una concreta, con ▶ para oírla).
  Después solo escribes de qué va. Ver «Elegir tipo, personaje, estilo y voz» más abajo.

- `/video cómo nace una estrella`, o con palabras: «créame un vídeo de…», «hazme un vídeo corto sobre…», «make a
  video about…».
- **Vertical** para TikTok, Reels o Shorts: `/video vertical …`, «…para TikTok», «…para reels». Si no se dice nada,
  sale horizontal (16:9, YouTube).
- **De un mensaje**: el botón **«Crear vídeo de esto»** bajo cualquier respuesta con texto, o escribir «créame un vídeo
  de esto» (usa la última respuesta del chat).
- **Periódico**: con una rutina, por ejemplo `/rutina cada lunes a las 9: /video las novedades de la semana`.
- **Dibujos con personaje** (tutoriales): «créame un vídeo estilo cartoon de…», «…de dibujos animados…», «hazme un
  vídeo tutorial de…», «…con un personaje…». Ver más abajo.
- **Con un estilo de película** (acuarela, Pixel RPG, años 30, ukiyo-e… 73 en total): eligiéndolo en el selector con
  muestras que sale al escribir `/video`, o «/video estilo acuarela sobre…». Ver «Estilos de película» más abajo.

**Qué pasa por dentro.** Un agente (el mejor para redactar que esté libre; mejor uno en la nube que un modelo local)
escribe solo el **guion** en JSON, pensado para enganchar a quien tiene poca paciencia: título, de 5 a 9 escenas cortas
(la primera, un gancho de menos de 3 segundos) con su etiqueta, una frase de voz por escena con sus palabras clave
marcadas entre *asteriscos*, una descripción de la imagen de cada escena, un tema de color y la frase final. Si el guion no vale, la tarea pasa a otro agente. Lo demás lo
hace kywai siempre igual (`src/main/videoStudio.ts`):

1. **Voz** de cada escena con Voicebox o Gemini si los hay (ver «Voz» más abajo) y si no con **Kokoro** (natural, gratis, en el propio equipo; español, inglés, francés, portugués,
   italiano, japonés, chino e hindi). Sin Kokoro, la voz del sistema (`say` en macOS, la de Windows, espeak-ng en Linux).
2. **Imágenes.** Por defecto, con **ComfyUI** (comfy.org) si está encendido en el equipo donde corren los agentes:
   gratis, sin clave y sin salir del equipo. kywai lo busca en `http://127.0.0.1:8188` y, si no, en
   `http://127.0.0.1:8000` (el de la app de escritorio; otra dirección con la variable `KYWAI_COMFYUI_URL`), usa el primer modelo SDXL que tenga (o SD 1.5; otro con `KYWAI_COMFYUI_CHECKPOINT`;
   FLUX y SD3 necesitan otro flujo y se saltan) y le pide las imágenes de una en una en el formato del vídeo, con una
   semilla fija por texto (el mismo guion da las mismas imágenes). Si ComfyUI no está, no tiene modelo o una imagen
   falla, la pide **Gemini** (`gemini-2.5-flash-image`) si hay clave de API (la del asistente, en `~/.gemini/.env`),
   tres a la vez; tras dos fallos seguidos de ComfyUI, el resto va directo a Gemini. Sin ninguno de los dos, esa
   escena lleva un fondo de diseño animado. kywai no instala ComfyUI (pide gráfica y varios GB de modelos): instala
   la app de escritorio de comfy.org y descarga un modelo SDXL. **No hace falta dejarlo abierto**: si está instalado
   y apagado, kywai **lo enciende solo al pedir un vídeo** (`ensureComfy`/`startComfy`: abre la app de escritorio en
   macOS o Windows, o arranca `python main.py --port 8188` en su carpeta, con el Python de su `venv`/`.venv` o el
   portable de Windows; la busca en `KYWAI_COMFYUI_DIR` o en ComfyUI dentro de la carpeta personal, Documentos,
   Escritorio o Descargas) mientras el agente escribe el guion, y espera hasta 3 minutos a que responda antes de
   pedir las imágenes (el paso sale como «Encendiendo ComfyUI para las imágenes»). También al «Probar con mi
   escena». Se queda encendido después. Para que no lo encienda: `KYWAI_NO_COMFY_AUTOSTART=1`. ComfyUI es GPL-3.0: kywai solo le
   habla por HTTP (`src/main/comfyui.ts`).
3. **Música** propia generada para cada vídeo (acordes con pulso; sin derechos de nadie) que **baja sola cuando habla
   la voz**, y **efectos de sonido** de verdad: «whoosh» en cada transición, golpes en la portada y el cierre, un
   «pop» al entrar cada etiqueta, una subida antes de la primera escena y un «boing» en las bromas, turnando varios
   sonidos de cada tipo para que no suene siempre igual (ver «Efectos de sonido» más abajo). Todo normalizado a -16 LUFS.
4. **Animación y montaje** con **HyperFrames** (Apache 2.0) y GSAP, con ritmo pero **sin agobiar** (desde el 10 de
   noviembre de 2026 es más tranquilo: antes resultaba demasiado intenso): el título entra palabra a palabra, sin
   sacudidas; la voz sale **a pantalla grande en golpes de hasta 4 palabras** que entran con movimientos cortos y
   suaves (aparecer, subir, girar un poco, deslizarse), con la palabra que suena resaltada y las clave en otro color
   (que crecen un poco); un acercamiento suave al empezar cada escena; fondo siempre en movimiento lento (la imagen con
   un zoom lento, o manchas de color, anillo que gira despacio, número de escena gigante y franjas); etiqueta de
   escena; tres transiciones que se turnan (zoom con un destello suave, franjas y círculo); barra de progreso y
   cierre. La voz de Gemini se pide animada pero a ritmo natural.
5. **Comprobación** con ffprobe (imagen, sonido y duración) antes de entregarlo.

**Estilo cartoon (tutoriales con personaje).** Si la petición dice cartoon, dibujos, personaje, presentador o
tutorial, sale un **tutorial visual**: lo que se ve manda. Cada paso ocupa **toda la pantalla** con 1 a 3 planos
ilustrados por ComfyUI o Gemini (general, primer plano de la acción y detalle; siempre en el mismo estilo de dibujo plano con
contorno y con lo importante en el centro), que entran con un golpe de zoom, se acercan despacio y el último lleva un
**círculo de «mira aquí»** que late. Arriba, la insignia «PASO n» y la instrucción; abajo, subtítulos con la palabra
que suena resaltada. En una esquina, un **presentador dibujado por kywai** (siempre el mismo: estilo chibi con gafas y
sudadera del color del tema; `src/main/videoCartoon.ts`) que mueve la boca con la voz, parpadea, respira, brinca en
cada cambio y hace el gesto de la escena (explica, señala al centro, se sorprende, se ríe, se encoge de hombros, pulgar
arriba, piensa, saluda); en las bromas, «¡JA, JA!» y un «boing». El agente escribe de 6 a 10 escenas: gancho, los
pasos en orden con sus avisos de seguridad, 2 o 3 bromas cortas y un resumen. Sin ComfyUI ni clave de Gemini no hay ilustraciones:
cada paso muestra su instrucción en grande.

**Voz.** En los vídeos **en español**, la voz por defecto es **Álvaro** (Microsoft Edge, es-ES-AlvaroNeural, con
edge-tts: gratis, necesita internet), y **en inglés**, **Bella** (Kokoro, af_bella); si no sale, el orden de siempre. En otros idiomas, el orden es Voicebox, Gemini, Kokoro:
- **Voicebox** (voicebox.sh, MIT) va primero si su app está abierta en el equipo donde corren los agentes y tiene
  un perfil de voz en el idioma del vídeo: gratis, sin salir del equipo y con **tu propia voz** si la clonas en
  Voicebox (las clonadas van antes que las predefinidas; una concreta con `KYWAI_VOICEBOX_VOICE`, nombre o id). kywai
  la pide por su API compatible con OpenAI (`POST /v1/audio/speech` en `http://127.0.0.1:17493`, otra dirección con
  `KYWAI_VOICEBOX_URL`), una escena detrás de otra, con el tono como instrucción (lo usan los motores que lo
  entienden, como Qwen). kywai no instala Voicebox: se descarga de voicebox.sh.
- Si no, con clave de Gemini, la de **Gemini** (se le pide el tono: cercano y con energía en los tutoriales, de broma
  en los chistes, animado pero sin prisa en los de texto animado).
- Si una escena no sale, todo el vídeo se rehace con la siguiente (al final Kokoro) para no mezclar voces.
- Si se eligió una voz en el paso 4 del selector (`voz:…`), se usa esa y se salta el orden: con una de Gemini, Gemini
  con esa voz (si falla, Kokoro); con una de Kokoro, Kokoro con esa voz; con una de Voicebox, ese perfil; con «Voz del
  sistema», la del sistema operativo.

**Voces de VoiceStudio.** VoiceStudio (github.com/debpalash/VoiceStudio, AGPL-3.0) es una app gratis aparte que hace
voces en más de 600 idiomas y clona la tuya. kywai **no la trae ni copia su código**: si está abierta en el equipo
donde corren los agentes, le habla por su API local (`http://127.0.0.1:3900`, otra dirección con
`KYWAI_VOICESTUDIO_URL`). Entonces, en el paso 4 del selector de «/video» sale el grupo **VoiceStudio** con las voces
que creaste o clonaste en ella y su voz por defecto, cada una con ▶ para oír una muestra (marca
`voz:voicestudio-<id>`). Con una elegida, kywai pide cada frase por `POST /v1/audio/speech` en WAV, con el idioma del
vídeo y el tono de esa frase como instrucción (alegre, triste, en susurro…), una detrás de otra porque usa la gráfica.
Si VoiceStudio se cierra o una frase no sale, todo el vídeo va con la voz por defecto del idioma (para no mezclar
voces). Si no está abierta, el selector lo dice: «Abre VoiceStudio…».

**Voz con emoción (Chatterbox).** Para que la voz no suene igual de principio a fin, **cada frase del guion lleva su
emoción** entre corchetes: `[neutral]`, `[alegre]`, `[emocionado]`, `[sorprendido]`, `[triste]`, `[susurro]`,
`[firme]`, `[calma]` o `[gracioso]` («[triste] Tres horas después… [emocionado] ¡Y en diez minutos!»). El agente del
guion las pone (regla `EMOTION_RULE` de `src/main/videoScript.ts`); kywai las quita de los subtítulos y guarda la
narración frase a frase (`scene.lines`, lo lee `narrationLines` de `src/shared/voiceEmotion.ts`, que también entiende
las emociones en inglés y otras palabras como «feliz» o «excited»).
- Quien la interpreta es **Chatterbox Multilingual** (Resemble AI, licencia MIT, `src/main/chatterbox.ts`): en el propio
  equipo, gratis, 23 idiomas. No cambia la velocidad ni el tono del audio (eso suena robótico: Yil lo probó con Edge y
  lo descartó); el modelo actúa la frase con más o menos emoción (`exaggeration` y `cfg_weight`, tabla
  `CHATTERBOX_EMOTION`). **Copia el timbre de la voz elegida**: kywai hace una vez una muestra de 15 s con esa voz
  (Álvaro, Jorge, Carmen, Bella…) en `<studio>/chatterbox/muestras/` y Chatterbox habla con ese timbre, así que la voz
  sigue siendo la elegida pero actuando. Dice todas las frases del vídeo de un tirón (el modelo tarda en cargarse), en
  la gráfica de Apple o NVIDIA si la hay; aquí, en un procesador de 4 núcleos sin gráfica, unos 2 minutos por cada 20
  segundos de voz. Entre frase y frase deja la pausa de su emoción (más larga tras una triste) y los subtítulos siguen
  a cada frase (`scene.lineTimes`, `sceneWords`).
- Va en su propio entorno de Python 3.11 (`<studio>/chatterbox/.venv`, con uv y torch 2.6) y el modelo (unos 3,5 GB)
  en `<studio>/chatterbox/modelos` (no en la caché general). Lo instala «Instalar lo que falta» o la instalación
  automática del estudio al arrancar (cuenta para que el estudio esté completo); ocupa unos 5 GB. Se fija
  `setuptools<81`: su marca de agua (resemble-perth) usa `pkg_resources`, que setuptools quitó en la 81.
- Se usa con las voces de Edge, macOS y Kokoro (y sin voz elegida). Con una voz de **Gemini** o de **Voicebox**
  elegida, se queda esa: a Gemini se le manda la escena entera con la emoción marcada delante de cada frase
  («[sad] …»), y a Voicebox, una instrucción por frase. Si Chatterbox falla, el vídeo sale con el orden de siempre, sin
  emoción (Edge y las demás solo hacen la pausa de cada emoción).
- Pega conocida: «kywai» lo pronuncia «chiwai».
- En las **películas con estilo** (las dirige un agente), el encargo pide lo mismo: emoción por frase, nunca retocar
  velocidad ni tono, y si Chatterbox está instalado, cómo usarlo (`<studio>/chatterbox/voz.py` con un JSON de frases).

**Repasar el guion antes de grabar.** Al final del selector (con el estilo de kywai, no en las películas con estilo),
la casilla «Repasar el guion antes de grabar» (marca `guion:repasar`). El agente escribe el guion como siempre pero
kywai **no graba todavía**: el guion sale en el chat como una tarjeta con cada escena (su rótulo y lo que se dice, con
las marcas de emoción como «[alegre]») y también en «Te necesita». Cambias lo que quieras y pulsas **Grabar**: kywai
pone la voz, las imágenes y el montaje con tu texto. **Descartar** termina la tarea sin grabar nada. Si se cancela la
tarea mientras espera, la tarjeta dice que ya no espera respuesta. Desde Órbita se puede grabar o descartar en
«Te necesita» (sin cambiar el texto).

**Estructura «Reel en 3 pasos».** Al final del selector, la casilla «Estructura: reel en 3 pasos» (marca
`estructura:pasos`, o con palabras: «estructura en 3 pasos»). Vale con el estilo de kywai y con cualquier estilo de
película; no sale con «Charla y tutorial», que ya tiene su propio orden. El guion sigue los tramos de un reel de 56 s
que mandó el usuario (solo su ritmo, nada de su contenido), de 45 a 60 s y con la voz seguida:
1. **Gancho** (0–2 s): una orden en negativo con lo que el espectador hace mal («Deja de…»).
2. **Autoridad** (2–9 s): quién lo dice, con una fuente real comprobada (si no la hay, se salta).
3. **«¿Te suena?»** (9–16 s): el error del espectador amontonándose cosa a cosa hasta un mal resultado con número.
4. **Giro** (16–25 s): «no es culpa tuya», el porqué y la idea nueva, con la palabra clave definida con algo que se ve.
5. **Tres pasos numerados** (25–48 s, ~7 s cada uno, «1 · …» con 1/3, 2/3, 3/3) con un ejemplo y un remate.
6. **Si sale mal** (opcional): qué hacer cuando falla.
7. **Cierre** (6–8 s): «Comenta PALABRA» y una frase que recoge el número del principio.

Las reglas están en `STEPS_STRUCTURE` (`src/main/videoScript.ts`): van en el encargo del guion (una escena por tramo
y por paso, como mucho 10) y en el de las películas con estilo (cada tramo es un beat de `beats.md`). Combina muy
bien con el estilo **Robots de bloques**.

**Diálogo (dos personajes, dos voces).** En el paso 4 del selector, «Diálogo» (marca `dialogo:si`), o con palabras («un
diálogo entre…», «una conversación entre…», «charlando»): el vídeo lo cuentan **dos personajes que se contestan**, como
en los reels que más enganchan, con réplicas cortas («¿Yo?», «¿En serio?»). Con los robots de kywai elegidos, hablan
Hermes y Claude; con otro personaje, ese y uno que le dé la réplica; sin personaje, dos que invente el agente. El
guion trae `"speakers": [{"name", "gender"}]` y cada frase dice quién habla: «[Claude, sorprendido] ¿Diez minutos?
[Hermes, alegre] Ni uno más.».
- **Cada uno con su voz** (`speakerVoices` en `src/shared/videoChoice.ts`): la elegida es para el primer personaje de su
  género, y el otro lleva otra voz del idioma, de su género si la hay (en español en el Mac: Álvaro y Carmen; sin Mac,
  Álvaro y Jorge). Con Chatterbox, cada uno con la muestra de su voz; con Gemini, la voz de varios hablantes de Gemini
  (`multiSpeakerVoiceConfig`); con Kokoro, una voz de Kokoro de su género.
- En los subtítulos sale **el nombre de quien habla** en una etiqueta de su color (`speakerChip`), y cada personaje
  tiene sus propios golpes de texto.
- En las películas con estilo, el encargo pide el diálogo y que la cámara corte al que habla y a la reacción del otro.

**Voces de pago para comparar de oído: ElevenLabs v3 y Gemini Pro.** Si las voces gratis no convencen, en el paso
«Voz» del selector salen también, debajo de las de cada idioma, **las voces de ElevenLabs** (las de tu cuenta) y **las
de Gemini**, cada grupo solo si hay su clave. Así se puede pedir el mismo guion con una y con otra y quedarse con la
que suene mejor.
- **ElevenLabs** (`src/main/elevenlabs.ts`, modelo `eleven_v3`, el que más actúa): la clave se pega en Ajustes →
  Extensiones → «Voz de ElevenLabs (de pago)» (con «¿Cómo lo hago?»), se comprueba y se guarda cifrada en el llavero
  (`keys().set('elevenlabs')`); el panel dice cuántos caracteres quedan este mes. El plan gratis trae 10.000 al mes y
  un reel de un minuto gasta unos 1.000. La marca es `voz:eleven-<id de la voz>`. Cada escena va de una vez con la
  etiqueta de emoción de v3 delante de cada frase (`[excited]`, `[sad]`, `[whispers]`…, tabla `ELEVEN_TAG`), y un
  **diálogo** va por su API de diálogos (`/v1/text-to-dialogue`): el personaje del mismo género que la voz elegida
  habla con ella y el otro con otra voz de la cuenta de su género (`elevenPartner`). Para tener más voces, se añaden a
  la cuenta desde la biblioteca de ElevenLabs y salen solas (la lista se guarda 10 minutos). Si ElevenLabs falla (sin
  clave, sin caracteres), el vídeo sale con la voz por defecto del idioma y el orden de siempre.
- **Gemini** usa primero el modelo **Pro** de voz (`gemini-2.5-pro-preview-tts`, actúa mejor) y, si no está o se acaba
  la cuota, Flash (`GEMINI_TTS_MODELS`).
- Con estas dos, los subtítulos se reparten por la duración de la escena (no frase a frase como con Chatterbox).

La voz, las imágenes y las animaciones de Manim se generan **a la vez**.

**Elegir tipo, personaje, estilo y voz (selector de cuatro pasos).** Al escribir `/video` aparece encima del cuadro una
barra con lo elegido («Mixto · Robots de kywai · Acuarela · Kore») y, al empezar la orden, se abre el panel con los
cuatro pasos (`src/renderer/src/ui/left/VideoPicker.tsx`). Lo elegido se escribe en el texto como marcas detrás de `/video`
(`tipo:mixto personaje:robots-kywai estilo:watercolor voz:gemini-kore`), así vale igual escribiéndolo a mano, en la web, en Órbita y
en las rutinas; lo de por defecto no lleva marca (`src/shared/videoChoice.ts`). Las marcas de antes
(`estilo:cartoon`, `estilo:dinamico`) siguen valiendo como tipo.

1. **Tipo de vídeo.** *Rápido: texto animado* (frases grandes con ritmo al compás de la voz), *Dibujos con
   presentador* (el tutorial con presentador de más abajo) o **Mixto**: el presentador y golpes de texto grande
   alternados (más o menos una escena de cada tres es de texto, nunca dos seguidas; en ellas el presentador se aparta
   y las palabras del rótulo entran en grande mientras sigue la voz). Con un estilo de película, el tipo le dice al
   agente cómo contarla.
   **Charla y tutorial** (`tipo:charla`, o escribir «charla y tutorial» / «estilo charla»): el reel de Instagram en
   el que **dos personajes charlan** (siempre diálogo; con los robots de kywai, Hermes y Claude, si no se elige otro;
   vertical salvo que se pida horizontal) en una **maqueta 3D de juguete** con luz de cine (`CHARLA_LOOK`, el aspecto
   por defecto si el guion no trae otro) mientras **arriba sale la tarjeta del paso**: «PASO 2/4», el título y de 1 a 4
   puntos que se marcan uno a uno mientras hablan. El gancho saca las **preguntas típicas del público en burbujas de
   comentario** (`comments`, sin nombres de usuario) y el cierre pide **«Comenta PALABRA»** con una frase corta
   (`cta`). Cada escena trae de 1 a 3 planos (general de los dos y primeros planos) y **el plano cambia cuando cambia
   quién habla** (`shotCuts`). La composición es `src/main/videoCharla.ts`; el encargo del guion,
   `charlaScriptPrompt` en `src/main/videoScript.ts`. Este tipo no usa la biblioteca de películas (si se elige un
   estilo, se ignora) y el agente inventa su propia maqueta: nunca copia la de otro vídeo.
   **Con los robots de kywai, los personajes se mueven de verdad** (`src/main/charlaStage.ts`): Hermes, Claude y
   Codex están hechos en three.js dentro de un plató de juguete (salita con alfombra, papel pintado de rayas,
   estantería, planta, lámpara, sofá, cuadros, una ventana con cielo de atardecer y cortinas, una guirnalda de
   bombillas y una **pantalla gigante** que muestra la imagen de cada escena o, si no hay imagen, una tele
   apagada con ambiente, sin texto, para no pisar el titular ni los subtítulos). El plástico de los robots brilla con
   reflejos de verdad (un pequeño estudio de luz como mapa de entorno) y las sombras son suaves. Los robots se animan con la voz: la boca (una luz en el visor) y
   el cuerpo rebotan con cada sílaba, parpadean, miran a quien habla, asienten al acabar una frase y reaccionan con la
   emoción de cada frase (saltan al sorprenderse, se ríen, se agachan tristes, se inclinan para el susurro); en el
   cierre saltan los dos. La **cámara** monta el diálogo como una serie (`planShots`): cada escena se abre con un
   plano de situación distinto (general, los dos más cerca, contrapicado, picado o de lado; en un paso, la pantalla) y
   luego va **plano y contraplano**, cada robot siempre desde su mismo lado: primero por encima del hombro del otro y,
   según avanza la charla, más cerca. Las réplicas de menos de 1,5 s no cortan (se oyen sobre el plano de antes), en
   un turno largo se corta a la cara de quien escucha, solo la primera emoción fuerte de la escena (sorpresa, risa,
   pánico…) se remarca con un golpe de zoom a la cara y el remate vuelve al plano de los dos para ver la reacción. En
   la charla la cámara casi no se mueve (respira con un temblor suave o se acerca muy despacio): nada de barridos,
   giros ni planos inclinados, que cansaban y se notaban repetidos. Todo depende solo del tiempo de la línea de GSAP, así que
   HyperFrames graba cada fotograma igual (graba WebGL). En este modo las imágenes son solo lo de la pantalla (el
   encargo pide «image» con lo que explica el paso, sin personajes) y no se usan los clips de FreeVideo. Necesita
   three.js en el estudio (`THREE_VERSION`, se instala con HyperFrames y GSAP; un estudio sin él se completa solo la
   próxima vez). Con otro personaje, el vídeo va con las imágenes a pantalla completa de antes.
   **Con un aspecto elegido** (`aspecto:chibi-3d`…) y algo con qué dibujar (ComfyUI encendido o instalado, que se
   enciende solo, o clave de Gemini) al pedir el vídeo, **los robots se dibujan en ese aspecto** en cada plano en vez de salir en el plató 3D: el
   encargo pide planos de los dos (`shots`) y Gemini ve sus imágenes (`drawCast` en la tarea). Si al final no sale
   ninguna imagen (por ejemplo, una clave de Gemini del plan gratis, que no dibuja), el vídeo vuelve al plató 3D. Sin
   motor de imágenes, el aspecto solo cambiaría la pantalla gigante, que entonces lleva fondos de diseño.
   **Sin aspecto elegido y con ComfyUI en el equipo** (encendido con un modelo, o instalado: se enciende solo), los
   robots **también se dibujan con ComfyUI**, en «Cine 3D» (`CHARLA_COMFY_LOOK` en `sendVideo`, `comfyAvailable` en
   `videoStudio.ts`). Solo con clave de Gemini y sin ComfyUI, sin aspecto siguen en el plató 3D.
   **Sketch de humor** (`tipo:sketch`, o escribir «un sketch de humor» / «tipo sketch»): la misma charla de dos
   personajes (plató, diálogo, vertical, burbujas en el gancho y «Comenta PALABRA»), pero **sin pasos, ni puntos, ni
   tarjetas «PASO n/N»**: el encargo pide una situación cómica con conflicto, giros, réplicas rápidas, personalidades
   distintas y un remate, y lo útil sale de pasada dentro de los chistes. Arriba solo sale un titular corto por
   escena. Aunque el agente escriba pasos, kywai los quita. Para cuando se quiere entretener más que enseñar.
2. **Personaje.** *Ninguno (genérico)*: sin personaje fijo. *Robots de kywai*: Hermes, Claude y Codex. Los que hayas
   creado. Y **«Agregar personaje»**: nombre y una descripción, imágenes (hasta 6) o las dos cosas; la interfaz reduce
   las imágenes (1024 px, WebP) y hace una miniatura. Se guardan en kywai **para todos los proyectos**, en
   `<workspace>/personajes/<id>/` (`personaje.json`, `imagen-N.*`, `miniatura.jpg`; `src/main/videoCharacters.ts`), y
   se borran con la papelera de su tarjeta. **El personaje se dibuja en el estilo elegido**: la primera vez que sale
   en un vídeo, el agente del guion escribe su aspecto en inglés sin el estilo de dibujo (`cast`) y kywai lo guarda
   (`aspecto.txt`); desde entonces va igual en el texto de cada imagen, y Gemini ve además sus imágenes. Los robots
   traen su aspecto escrito y sus imágenes (las de la app, copiadas a `personajes/robots-kywai/` para que el agente de
   una película pueda abrirlas). Con presentador o mixto, **el presentador es ese personaje**: kywai genera su imagen
   en el estilo del vídeo (ComfyUI o Gemini; si no puede, usa su primera imagen) y la pone en una tarjeta en la
   esquina que respira, rebota al hablar, se inclina al señalar y se ríe en las bromas; sin personaje, el presentador
   dibujado de siempre. En una película con estilo, el encargo pide una hoja de personaje en ese estilo y le da sus
   imágenes y su aspecto. El personaje elegido manda sobre los personajes fijos del proyecto.
3. **Estilo de animación.** *El de kywai (rápido)*: lo de siempre, en unos minutos. O uno de los estilos de película,
   con buscador (ver abajo), que tardan más.
   Debajo de *El de kywai* está el grupo **Imágenes con IA**: nueve aspectos para las imágenes del vídeo de siempre
   (rápido, presentador, mixto o charla), sin película de la biblioteca. Son **Animación 3D de cine**, **Plastilina**,
   **Ganchillo de lana**, **Chibi 3D**, **Cómic**, **Pergamino**, **Objeto que habla**, **Explicador 3D con esqueleto**
   y **Realista (podcast o UGC)**, sacados de un reel que enseñaba la misma escena en 15 estilos. Los nombres son
   genéricos a propósito: ni estudios ni canales. Se marca con `aspecto:<id>` (`aspecto:plastilina`) y su bloque de
   estilo en inglés (`src/shared/imageLooks.ts`) va al final de **todas** las imágenes del vídeo, también las del
   presentador. El guion no escribe su propio «look» (el encargo le dice cuál eligió el usuario) y, aunque lo
   escribiera, manda el elegido. Con un estilo de película elegido no cuenta: la película no usa esas imágenes.
   El botón **«Probar con mi escena»** pinta el momento clave de lo que llevas escrito tras `/video`, con el personaje
   que elegiste en el paso 2, en los nueve aspectos (dos a la vez; con ComfyUI, de una en una). Cada tarjeta cambia su
   color de muestra por tu escena, y eliges viéndola. Va primero con ComfyUI de tu equipo (gratis) y, si no, con
   Gemini y tu clave (gasta un poco por imagen). Cada prueba queda guardada en `<estudio>/pruebas-aspecto/` y no se
   paga dos veces. Si cambias el tema o el personaje, las pruebas se vacían. Sin ComfyUI ni clave, el aviso lo dice.
   Órbita todavía no tiene este grupo.
4. **Voz.** **En español solo salen tres voces**, elegidas por Yil escuchando 28 muestras: **Álvaro** (Edge,
   España, `voz:edge-es-ES-AlvaroNeural`, la de por defecto, sin marca), **Jorge** (Edge, México,
   `voz:edge-es-MX-JorgeNeural`) y **Carmen** (Siri de macOS, México, `voz:mac-carmen`). Edge va con **edge-tts** en el
   entorno de Python del estudio (lo instala «Instalar lo que falta» o la primera vez que se usa; necesita internet).
   Carmen no sale con `say`: kywai compila una vez un programa pequeño en Swift (`<studio>/voz-mac/`, con `swiftc`)
   que usa AVSpeechSynthesizer con `com.apple.siri.natural.Carmen`; hay que tenerla descargada en Ajustes del Sistema →
   Accesibilidad → Contenido leído. **Ojo:** un programa compilado con `swiftc` no ve las voces de Siri (macOS solo se
   las da a `swift`, firmado por Apple), así que Carmen se lee con el mismo programa **interpretado** (`swift voz.swift`,
   tarda unos segundos más); las demás voces del Mac usan el compilado. En la lista de voces de macOS Carmen se llama
   «Voice 2»: se busca por su identificador, no por el nombre. La muestra ▶ la prepara siempre el servidor, así que
   desde un cliente (Linux, Windows) Carmen suena si funciona en el Mac servidor. Si una de estas falla en un vídeo,
   el vídeo sale con el orden de siempre.
   **En inglés salen solo 11**, elegidas por Yil de 60 muestras: de Kokoro **Bella** (la de por defecto), Heart,
   Nicole, Sarah, Adam (Estados Unidos), Isabella y George (Reino Unido), y de Edge **Aria**, **Guy** (Estados Unidos),
   **Sonia** y **Ryan** (Reino Unido). Sin Kokoro instalado, la de por defecto se salta y va el orden de siempre. La
   lista de cada idioma está en `LANG_VOICES` (`src/shared/videoChoice.ts`).
   Con la app en español o en inglés, el paso Voz muestra **las dos listas** (primero la del idioma de la app, cada una
   con su título), porque el vídeo puede ser en el otro idioma; sin elegir, el vídeo va con la primera voz de su idioma.
   **La voz decide el idioma del vídeo**: con una voz de la lista inglesa (o cualquier voz inglesa de Kokoro o Edge),
   el guion, los textos y la voz salen en inglés; con una de la lista española, en español. Sin voz elegida, vale lo
   que diga el texto («en inglés», «in English», «en español») y, si no dice nada, el idioma de la app
   (`videoLang` en `src/shared/videoChoice.ts`; vale igual para el vídeo rápido, las películas y cada vídeo de un
   lote).
   En otros idiomas: *Automática*: la mejor que haya (el orden de «Voz» de arriba). O una concreta, agrupadas por motor, solo
   las que hay en el equipo: **tus voces de Voicebox** (si está abierto; también la tuya clonada), **12 voces de
   Gemini** (con clave; hablan cualquier idioma: Puck, Fenrir, Charon, Orus, Enceladus, Achird, Kore, Aoede, Leda,
   Zephyr, Sulafat y Gacrux, con una línea de cómo suena), **16 voces de Kokoro** (gratis y sin internet; primero las
   del idioma de la app) y la **voz del sistema**. Cada tarjeta tiene un **▶**: pide una muestra corta («Hola, así
   sonará la voz de tu vídeo…», en el idioma de la app) y la reproduce; otra vez ▶ (■) la para. La muestra se hace
   una vez y se guarda en `<studio>/muestras-voz/` (MP3). Si falta un motor, una nota dice cómo tenerlo. La marca es
   `voz:gemini-kore`, `voz:kokoro-ef_dora`, `voz:voicebox-<perfil>` o `voz:sistema` (`parseVoiceId` en
   `src/shared/videoChoice.ts`); en una película con estilo, el encargo le dice al agente con qué herramienta poner
   esa voz.

**En Órbita (Android).** Lo mismo en el móvil: al escribir `/video ` (o elegirlo en la lista del «/») se abre a
pantalla casi completa el selector con los cuatro pasos (`android/.../ui/orbita/VideoPicker.kt`), y encima del cuadro
queda la barra «Vídeo · lo elegido», que al tocarla lo vuelve a abrir. Las muestras de los estilos, los personajes y
las voces los da el ordenador (así un estilo nuevo sale en Órbita sin actualizarla): `GET /api/mobile/v1/video/picker`,
`GET …/video/styles/{slug}/thumb` (la misma muestra WebP del escritorio, `src/main/filmThumbs.ts`), `POST
…/video/voices/{voiceId}/preview` (el ▶, en MP3; se guarda en la caché del móvil), `POST …/video/characters` y `POST
…/video/characters/{id}/delete` (capacidad `videoPicker`). «Agregar personaje» deja elegir hasta 4 fotos de la galería,
que Órbita reduce antes de enviarlas. Las marcas se leen y se escriben como en el escritorio (`VideoTags`, copia de
`src/shared/videoChoice.ts`: si cambian allí, cambian también aquí). Con un ordenador sin esta versión, `/video` sigue
funcionando escribiendo las marcas a mano.

**Estilos de película (79, con muestra).** En el paso 3 del selector, una tarjeta con **una muestra de cada estilo**
(un fotograma de su película de ejemplo), por categorías y con buscador: **Pintado a mano (acuarela y tinta)** y los
**los estilos propios de kywai** (ver más abajo) y los **66 estilos de la biblioteca Lemo-Opuscar** (MIT, github.com/lemomo-ai/lemo-opuscar): acuarela, tinta china, óleo, pizarra, años 30, anime de los
80, Pixel RPG, HD-2D, diseño suizo, plano técnico, infografía isométrica, risografía, xilografía, ukiyo-e, teatro de
sombras, piezas de construcción, maqueta en miniatura, cine mudo, noticiario de época… Elegir uno pone
`estilo:<carpeta>` detrás de `/video` (p. ej. `/video estilo:watercolor el ciclo del agua`); también vale escribirlo
con palabras: «/video estilo acuarela sobre…», «hazme un vídeo de… estilo pixel», en el escritorio, la web, Órbita y
las rutinas. Los marcados **«Con material real»** (los documentales con datos y los de montaje) se hacen con imágenes,
datos o archivo de verdad: usa lo que adjuntes y, si no hay, busca material libre y lo apunta en sus créditos.

Con un estilo de película no hay guion en JSON: **un agente con terminal dirige y renderiza la película entera**
(primero Claude, porque las guías de la biblioteca están pensadas para él; si no, Codex u otro con terminal que no sea
local). Trabaja en una carpeta oculta del proyecto (`.ai-cowork/videos/<id>-pelicula/`), lee las guías de la
biblioteca (`AGENTS.md`, `DIRECTOR.md`, `TECHNIQUE.md`) y la del estilo (`styles/<carpeta>/STYLE.md`), decide la
historia, pone voz (Kokoro), música y efectos, se revisa con capturas y deja `pelicula.mp4`, que kywai copia a
`videos/` y entrega en el chat. **Sin preguntas a mitad**: la petición es todo el encargo. Tarda más que el modo
rápido (de 20 minutos a una hora, según el estilo y el equipo). El proyecto completo (tratamiento, código, `build.sh`
y `CREDITS` con la licencia de cada cosa que usa) queda en esa carpeta. El encargo está en `src/main/filmLibrary.ts`
(`filmPrompt`) y el catálogo en `src/shared/filmStyles.ts`.

**Hoja de beats, acción viva y doble comprobación.** Antes de animar, el agente escribe `beats.md` en la carpeta de la
película: el concepto en una frase, los fotogramas por segundo y cada beat con su tramo de fotogramas («0–22 flota ·
22–44 carga · 44–48 latigazo · 64 impacto, 5 fotogramas quietos»). Todas las películas llevan la lista de **acción viva**
(`ALIVE_ACTION` en `filmLibrary.ts`): anticipación, pausa en el impacto, solapamiento, aplastar y estirar, y pares
«evita → haz» (línea recta → arco con gravedad, velocidad fija → curvas suaves, fundido al golpear → fotogramas de
impacto, salto entre poses → fotograma de barrido); las de 3D, además, la de «escena 3D viva». Cuando el agente
termina, **kywai comprueba el MP4 con ffmpeg** (`checkFilmFile` en `videoStudio.ts`, reglas en `src/main/filmCheck.ts`):
pantallas negras de más de 0,8 s, imagen congelada 4 s o más, silencio total 4 s o más, sin pista de sonido o menos de
5 s (se perdonan los fundidos del principio y del final y el cierre quieto de hasta 5 s). En los estilos 3D
(`FILM_3D`) mira además si **parece un dibujo plano**: saca 6 fotogramas de 96 px de ancho y, si en la mitad o más
de los que no son casi negros los 12 colores más usados cubren el 65 % de la imagen o más (`FLAT_SHARE`, colores
agrupados de 4 en 4 niveles), la devuelve pidiendo modelos con volumen, luz con sombras y materiales. El umbral se
probó con un reel de comparación (sabodominik, «Normal Claude / Claude + Brism»): los dibujos de formas lisas dan
0,73–0,85 y los renders 3D 0,13–0,55; acertó los 10 casos. El revisor también lo mira, y la lista de escena 3D viva
pide «nada de dibujo plano». Si está limpio, **otro agente
de otra familia que vea imágenes** revisa una hoja de contacto (`hoja-de-contacto.jpg`, 12 fotogramas repartidos)
contra `beats.md` y las reglas, en solo lectura, y responde «VEREDICTO: CUMPLE» o «FALLOS». Con fallos, la película
vuelve a quien la hizo, en su misma sesión, con la lista (hasta 2 correcciones, `MAX_FILM_FIXES`); si se agotan, se
entrega igual con lo que aún se ve y el aviso de «requiere intervención». Sin otro agente que vea imágenes, solo cuenta
la comprobación de kywai. Idea tomada de un reel de animación con IA («Good vs Bad AI animation»): prompt
estructurado (concepto, beats, reglas, evitar, revisar) y comprobación por fotograma antes del MP4 final.

**Pintado a mano (acuarela y tinta)** (antes «Robots de kywai pintados a mano»; sin otro personaje elegido, salen
los robots) usa **Claude Animation Base** (MIT, github.com/JohnHeibel/ClaudeAnimationBase:
p5.js + p5.brush, acuarela, tinta y línea que tiembla, sin texto) con los robots del equipo en lugar del personaje del
kit (es la mascota de Anthropic y no sale nunca): kywai escribe en el kit `src/kywai-robots.js` (`kywaiRobot()` para
Hermes, Claude, Codex u otro con sus colores, y `kywaiSpark()`, la chispa de una tarea) y `KYWAI.md`, la guía para
usarlos. El agente copia el kit a la carpeta de la película y trabaja en la copia. Con otro personaje, el agente lo
dibuja con las técnicas del kit; con «Ninguno», inventa los que pida la historia. Sin tarjeta gráfica renderiza lento.

**Estilos propios de kywai (10).** Garabatos de tinta, Garabatos en primera persona, Oficina en plano, Siluetas de
neón, Cristales 3D adorables, Tiempo profundo, **Papel recortado**, **Lista de comprobación**, **Robots de bloques** y **Anuncio de app** (inspirados en lo que se ve en vídeos de estilos de animación con IA,
escritos por kywai sin prompts ni código de nadie; en el selector llevan la etiqueta «Estilo de kywai»). Cada uno
tiene su guía en `src/main/kywaiFilmGuides.ts`, con los mismos apartados que una guía de la biblioteca (esencia,
materiales, color, letra, movimiento, cámara, sonido, jugadas propias, errores, motor y variaciones), y en el catálogo
(`base` en `src/shared/filmStyles.ts`) el estilo de la biblioteca cuyo motor usa (pizarra blanca, años 50, créditos de
espías, producto de cristal, isla low-poly, concurso de la tele, diseño suizo, piezas de construcción o presentación tecnológica). Al empezar la película, kywai deja la guía en su carpeta
(`ESTILO-kywai.md`) y el agente trabaja como con un estilo propio del usuario de Lemo-Opuscar (`MY-STYLES.md`): baja
el código del estilo base con `setup.sh demo <base>` y manda la guía de kywai. Sus muestras son fotogramas hechos por
kywai. Para añadir otro: su entrada con `base` en el catálogo, su guía, su alias y su muestra de 320×180.

**Papel recortado** (`kywai-paper-diorama`, desde el 10 de noviembre de 2026) es un teatrillo de cartulina: decorados
de papel en capas con bordes rasgados y sombras suaves, una mascota cuadrada de papel que cambia de disfraz en cada
escena, un contador grande en una tarjeta, el titular en un banderín de papel y las palabras que se dicen en
etiquetas de papel, de una en una. Va muy bien para listas y «top 5» («1/5 … 5/5», cada uno en su escenario). Usa el
motor del «Concurso de la tele» (`game-show`). También se pide con «estilo papel recortado», «cartulina» o
«papercraft»; «papel recortado rojo» sigue siendo el de la biblioteca.

**Lista de comprobación** (`kywai-checklist`, desde el 12 de noviembre de 2026) es una tarjeta con una lista que se
llena mientras habla: cada punto entra con su casilla vacía, un trazo de rotulador la marca con un «pop» y un «ding»,
una barra de progreso sube («3/5») y al lado hay un dibujo o una captura de cada punto. Lo que no hay que hacer se
tacha con una X roja. Va muy bien para «5 cosas que revisar antes de…», pasos y «haz / no hagas». Usa el motor del
«Diseño suizo animado» (`swiss-motion`). También se pide con «estilo lista», «checklist» o «lista de tareas».

**Robots de bloques** (`kywai-voxel-bots`, desde el 12 de noviembre de 2026) sale del ritmo de un reel vertical de
56 s que mandó el usuario (solo su estructura y su aspecto, nada de su marca ni de su texto). Es un solo escenario
azul noche, sin cortes duros, donde robots de bloques y objetos sencillos aparecen justo cuando se nombran: algo nuevo
cada 1–1,5 s, el titular de dos líneas cambia cada 3–4 s con la palabra clave en un color que significa algo (rojo
el problema, amarillo la pregunta, verde la solución, cian el concepto) y abajo un subtítulo de 1 a 3 palabras con la
que suena en una pastilla cian. Robots grises son «la forma de antes», uno naranja la solución y un muñeco con gafas
eres tú; en los pasos salen puntos de progreso (■■□). Usa el motor de «Piezas de construcción» (`brick-toy`) y lleva
la lista de escena 3D viva. También se pide con «estilo robots de bloques», «voxel» o «bloques».

**Anuncio de app** (`kywai-app-promo`, desde el 12 de noviembre de 2026) sale de la estructura de un reel vertical de
32 s que anunciaba una herramienta para convertir modelos 3D en sprites (solo su ritmo y sus recursos, nada de su
marca, su arte ni sus textos). Es un anuncio rápido sobre fondo oscuro con estrellas: cada 3–4 s una frase de dos
líneas (la primera en blanco, la segunda en el color de la marca) encima de una sola demostración del producto
funcionando, y se cambia de una a otra al ritmo de la música. Las demostraciones son: la transformación del gancho
(lo de entrada se convierte en el resultado bajo una línea que barre), «en un clic» (una entrada que se multiplica en
una cuadrícula), el deslizador antes/después, el carrusel numerado «03/08» con su etiqueta, las pastillas de opciones
(la elegida se enciende y la demo cambia), el editor en miniatura, la galería de resultados con los formatos de
descarga y la pantalla real con 2–3 líneas que se marcan. Acaba siempre en una tarjeta de color liso con el logo, la
dirección y un solo botón. Sin voz por defecto (los titulares cuentan la historia), 25–35 s. Usa el motor de la
«Presentación tecnológica» (`dark-keynote`) y pide usar capturas y grabaciones reales del producto del usuario. Va muy
bien para los reels de kywai. También se pide con «estilo anuncio», «promo» o «antes y después».

**Detrás de la máquina** (`kywai-machine-room`, desde el 12 de noviembre de 2026) sale de la estética de un reel
vertical que enseñaba a un agente trabajando de madrugada en una cuenta de Instagram (solo su aspecto y su ritmo, nada
de su marca ni de su texto). Es un cuarto oscuro de noche, con la luna en la ventana, donde un solo personaje de
píxeles en 3D (o el que elijas, hecho de bloques) trabaja en su mesa. Cada paso del trabajo es una ventana de la app
que sale del monitor y lo enseña ocurriendo: un buscador con un contador que se dispara, una tabla con los ganadores
recuadrados en naranja y su «×N», una barra de descarga, una transcripción que se escribe sola, una línea de tiempo
partida en bloques, un guion, una onda de voz, un calendario que se llena. Abajo, subtítulos de 2–3 palabras en
mayúsculas con una en naranja, y pegatinas naranjas inclinadas en los momentos clave («VIRALES»). Va muy bien para
enseñar cómo trabaja kywai (es el estilo natural del «/turno-noche»). Usa el motor de «Piezas de construcción»
(`brick-toy`) y lleva la lista de escena 3D viva. También se pide con «estilo detrás de la máquina» o «cuarto oscuro».

**Lista contrarreloj** (`kywai-countdown-list`, desde el 12 de noviembre de 2026) sale del formato de un reel de «20
principios de UX y animación en menos de 30 segundos» (solo el formato). Arriba, el título y una lista numerada en dos
columnas que se llena a toda prisa, con el punto actual en naranja; a la izquierda, un cronómetro LED rojo de siete
segmentos que corre hasta el último punto y entonces se para y parpadea; abajo, una tarjeta blanca con la regla en una
franja negra y dos paneles **Antes** / **Después** con una demostración pequeña que se repite (el mismo botón, tarjeta o
campo hecho mal y bien). 1–2,5 s por punto; la voz solo dice el nombre de cada uno. Usa el motor del «Diseño suizo
animado» (`swiss-motion`). También se pide con «estilo lista contrarreloj», «contrarreloj» o «cronómetro».

**Instalación.** «Instalar lo que falta» (Ajustes → Extensiones → Estudio de vídeo, fila «Estilos de película») o, si
no, el primer vídeo con estilo, descarga con git a `estudio-video/lemo-opuscar` una **versión fija** de la biblioteca
(sin las películas de ejemplo ni las imágenes grandes, ~30 MB) y lanza su instalador (`setup.sh deps voice`: paquetes
de Node, el navegador del render, un Python propio y la voz Kokoro); y descarga a `estudio-video/animacion-pintada`
el kit de animación pintada, con sus paquetes y los robots. Hace falta git; en Windows, Git para Windows (trae `sh`).
La biblioteca pide ffmpeg 7 o más nuevo. Para subir de versión, cambia `LEMO_OPUSCAR_COMMIT` o
`ANIMATION_BASE_COMMIT` en `src/main/filmLibrary.ts` después de probarla.

**Muestras y licencias.** Las miniaturas del selector (`src/renderer/src/assets/estilos/`, 320×180) son fotogramas de
las películas de ejemplo de Lemo-Opuscar (CC BY 4.0, © lemomo-ai, se nombra la fuente en el pie del selector); la de
los robots es de una prueba de kywai. Las películas que hace cada usuario son suyas: sin firma ni marca de agua de la
biblioteca.

**Estilo desde tus imágenes.** Si adjuntas imágenes a «/video …» (hasta 8; por ejemplo capturas de un estilo que te
gusta), el agente que escribe el guion las abre y saca de ellas un **bloque de estilo** (`look` en el guion: 40-90
palabras en inglés sobre cómo están hechas, técnica, línea, paleta, luz y textura, nunca lo que sale en ellas). Ese
bloque se añade al final del texto de **todas** las imágenes del vídeo, en ComfyUI y en Gemini, así salen iguales.
Gemini además ve hasta 3 de tus imágenes (de 7 MB como mucho) como referencia de estilo, con la orden de no copiar lo
que sale en ellas. Sin imágenes, el guion trae igualmente un `look` único para todo el vídeo. En el estilo con
presentador, el dibujo de siempre se cambia por el tuyo solo si diste referencias. Lo hace `imagePromptText` y
`geminiImage` en `src/main/videoStudio.ts`.

**Estilo de un reel que te gusta.** Si adjuntas un vídeo a «/video …» (hasta 2), kywai saca 4 fotogramas de cada
uno (del 15 % al 85 % del vídeo, lejos de títulos y créditos) a `.ai-cowork/videos/referencias/` y los usa como
imágenes de referencia de estilo, igual que las imágenes adjuntas (`videoFrames` en `videoStudio.ts`, con ffmpeg).

**Personajes fijos (series).** Cada proyecto puede tener sus personajes en la carpeta **`personajes/`**: hasta 6
imágenes (PNG, JPG o WebP) y `personajes.md` con su descripción en inglés. Para crearlos, adjunta sus imágenes a
«/video … con estos personajes fijos» (o «guarda estos personajes», «estos son mis personajes»): kywai las copia a
`personajes/` (sin duplicar la misma imagen) y no las usa como referencia de estilo. Desde entonces, en todos los vídeos
del proyecto:
- el agente del guion las abre y escribe `cast` («Nombre: cara, pelo, ropa exacta…»); la primera vez kywai lo guarda en
  `personajes.md` y luego se copia tal cual, así salen iguales (puedes editarlo);
- esa descripción va en el texto de cada imagen (ComfyUI y Gemini), y Gemini además ve hasta 3 imágenes de los
  personajes (y, si hay, referencias de estilo hasta 4 en total);
- en el estilo con presentador los planos pueden llevar sus caras;
- en las películas con estilo, sus imágenes van en la lista de archivos del agente como «personaje fijo».
`projectCast`, `saveCastImages` y `saveCastNotes` en `videoStudio.ts`.

**Gancho.** Los guiones (y las películas con estilo) piden un gancho en los 2 primeros segundos, sin saludos, con una
de estas formas: una pregunta, un dato que sorprende, lo contrario de lo que se cree, el resultado primero, un error
común o una promesa con número; y que cada escena abra una pregunta pequeña que cierre la siguiente (`HOOK_RULE` en
`videoScript.ts`).

**Escenas 3D vivas.** En los estilos de película hechos en 3D (`FILM_3D` en `filmLibrary.ts`: isla low-poly,
producto de cristal, maqueta, piezas, diorama, cristales, tiempo profundo…) el encargo lleva una lista de control
(`ALIVE_3D`): bucles que nunca paran (humo, nieve, partículas), nada se mueve a la vez, arcos con estirar y aplastar,
luz viva (fuego, farolillos), cámara que deriva, luz principal de lado con sombras, relleno frío y borde de luz, brillo
y niebla.

**Escenas con movimiento (FreeVideo).** Si en el equipo está instalado y abierto
[FreeVideo](https://github.com/FlashML-org/FreeVideo) (vídeo local con el modelo MiniMax H3), el guion puede marcar con
`motion` hasta 3 escenas (el gancho y los momentos fuertes) con una frase de qué se mueve. Después de hacer la imagen de
la escena, kywai se la manda a FreeVideo como primer fotograma, con esa frase y el `look`, y pone el clip que devuelve
en lugar de la imagen fija (`assets/freevideo-N.mp4`, ajustado a lo que dura la escena). De una en una, en calidad
ligera (0,5 MP); cada clip tarda varios minutos (en un Mac M5 de 24 GB, unos 20 min por 10 s). Si FreeVideo está
cerrado, falla o se pasa de 45 min, la escena se queda con su imagen y el vídeo sale igual. kywai habla con su API para
agentes (`/freevideo/agent/v1`) con el token de su instalación (`agent/token`), solo en una dirección de este equipo;
no copia su código. La fila «Escenas con movimiento (FreeVideo)» de Ajustes → Extensiones → Estudio de vídeo dice si
está listo. Licencias: el código de FreeVideo es Apache-2.0; los pesos de MiniMax H3 van con su propia licencia
(MiniMax H3 Community License, con límites de uso y de países), que acepta quien instala FreeVideo. Código:
`src/main/freevideo.ts`; las variables `FREEVIDEO_HOME` y `FREEVIDEO_URL` cambian dónde lo busca.

**Animaciones de fórmulas y diagramas (Manim).** Si Manim Community (MIT) está instalado en el estudio, el guion
puede traer en hasta 3 escenas un campo `manim` con código Python (`class Escena(Scene)`) para lo que se entiende
mejor animado: una fórmula, una gráfica, un diagrama, una geometría, un proceso. kywai lo renderiza a pantalla
completa con el fondo del tema (`estudio-video/.venv`, `manim render -qm`, 30 fps, como mucho 4 min por escena), lo
alarga con el último fotograma o lo corta a lo que dura la voz de la escena y lo pone **debajo** de la escena como
`<video>` con su propio tiempo (HyperFrames no admite un vídeo dentro de algo con tiempo); los subtítulos bajan a una
banda. Esas escenas no piden imagen; si la animación falla, van con fondo de diseño. Sin LaTeX en el equipo, el
agente escribe las fórmulas con `Text`. **«Instalar lo que falta»** instala Manim con pip (en Linux necesita antes
`libpango1.0-dev`, `libcairo2-dev` y `pkg-config`). El código y el registro de cada animación quedan en la carpeta
de trabajo del vídeo (`manim/`).

**Efectos de sonido.** Desde el 10 de noviembre de 2026 los efectos ya no son solo sintetizados. kywai prepara una
vez un banco en `estudio-video/efectos/` (un WAV por sonido; `fuentes.json` dice de dónde sale cada uno) y lo
reutiliza en todos los vídeos:
1. **earshot** (github.com/Leonxlnx/earshot, MIT, versión fija): 252 efectos hechos con código, sin red, sin clave y
   sin modelos. kywai usa 15 (4 whoosh, 4 pop, 3 golpes y 2 subidas). Se instala en `estudio-video/.venv` solo con lo
   que usa `earshot sfx` (numpy, scipy, soundfile y soxr; sin torch ni su GB de modelos de análisis).
2. **Openverse** (api.openverse.org, sin clave): sonidos reales de Freesound con licencia **CC0** (dominio público,
   no hace falta citar a nadie), cortos y recortados. Pone el «boing», que earshot no tiene, y sustituye a earshot si
   no se pudo instalar. Cuando earshot llega después, sus sonidos sustituyen a los de Openverse.
3. Los **sintetizados** de siempre, para lo que no haya en el banco (sin red ni Python, el vídeo sale igual).

El banco se prepara con «Instalar lo que falta» (y solo, al arrancar) o con el primer vídeo, mientras se hacen la voz y
las imágenes (como mucho espera 90 s; lo que no esté listo sale sintetizado). Un tipo que no consigue nada no se
vuelve a intentar hasta el día siguiente. Las películas con estilo también lo usan: el encargo le dice al agente
dónde están los WAV y cómo pedirle más a earshot. Ajustes → Extensiones → Estudio de vídeo → **Efectos de sonido**
dice cuántos hay de cada fuente. Código: `src/main/sfxBank.ts` y `mixSfx` en `src/main/videoScript.ts`.

Mientras, la tarea dice por qué paso va («Poniendo la voz (2 de 6)», «Animando y montando el vídeo»…). Un vídeo de
medio minuto tarda unos minutos.

**Varios vídeos de una vez.** Si el `/video` pide varios («genérame 3 vídeos…», «tres reels…», «varios vídeos…»,
o una lista «1) … 2) … 3) …», cada idea en su línea o todas seguidas en la misma), kywai crea **una tarea por vídeo** (de 2 a 12; «varios» son 3) con el mismo tipo,
personaje, estilo y voz. Cada encargo dice cuál es («vídeo 2 de 3») y qué le toca contar para que no salgan iguales:
la idea de tu lista o, si no hay lista, un ángulo distinto (presentarlo, cómo funciona, un caso real, antes y después,
trucos, la gran idea). Con un estilo de película, las tareas se reparten entre los agentes con terminal (Claude, Codex…)
y se hacen a la vez; las que tocan al mismo agente esperan su turno solas. Cada MP4 llega al chat cuando termina y, al
final, un resumen con todos. Con más de 6, kywai hace **6 a la vez** y los demás empiezan solos en cuanto acaban
esos (por tandas, sin volver a pedirlo); el chat lo avisa. El número solo cuenta si va con una orden de crear («hazme 3 vídeos») o al principio:
«/video los 5 vídeos más vistos» es un solo vídeo. Una lista **no** cuenta como varios vídeos si es un guion (lleva
«Qué se dice:», «Texto en pantalla:», «Gancho:», «## Escena 2»…: son las partes de un mismo vídeo) ni si pides «un
vídeo» («hazme un vídeo que cuente: - qué es - los temas 3D» es uno; «un vídeo por idea» sí son varios). Antes, cuando
Hermes pasaba un guion entero al estudio, cada viñeta salía como un vídeo aparte («Vídeo 1 de 12: **Qué se dice:** …»).
Código: `src/shared/videoBatch.ts` y `sendVideo` en
`src/main/orchestrator.ts`.

**Vídeos desde tus guiones.** Si un vídeo (o una idea de la lista) nombra un archivo de texto del proyecto
(`.md`, `.markdown` o `.txt`, p. ej. «1) artifacts/guiones/redes/01-intro.md»), kywai lo lee y se lo da al que
escribe o dirige el vídeo como **el guion a seguir**: su gancho, su orden y sus frases, adaptados solo al formato. Sin
esto, el guionista solo vería el nombre del archivo y se inventaría el contenido. Solo se leen archivos de hasta
200 KB dentro de la carpeta del proyecto (los de `artifacts/` también en `.ai-cowork/entregables/`). Código:
`src/main/videoScriptFile.ts` y `sendVideo` en `src/main/orchestrator.ts`.

**Pedirlo con tus palabras.** No hace falta escribir `/video`: si le pides a Hermes vídeos como hablarías
(«créame un vídeo por cada guion, con los personajes de kywai, en inglés»), Hermes escribe él mismo la orden
`/video …` con las marcas que saca de lo que pides (tipo, `personaje:robots-kywai`, estilo, voz —la voz decide el
idioma— y una línea por vídeo) y kywai la lanza en el acto, igual que si la hubieras escrito tú. Si quieres estilos
distintos, lanza una orden por estilo. «Créame un vídeo…» suelto sigue yendo directo al estudio, salvo que pida
varios sin decir cuáles («con cada uno de esos guiones», «un vídeo por idea»): eso lo lee Hermes, que mira la
conversación y pone una línea por vídeo; antes salía un solo vídeo sobre «cada uno de esos guiones». Tu mensaje no se repite en el chat: solo ves la respuesta de Hermes y las
tareas de vídeo. Código: el campo `"video"` del plan (`parsePlan` en `src/main/plan.ts`) y `launchPlannedVideo` en
`src/main/orchestrator.ts`; la regla para Hermes, en `src/main/coordinatorGuide.ts`.

**Dónde queda.** El MP4 en `artifacts/videos/<título>.mp4` (en una carpeta tuya, `.ai-cowork/entregables/videos/`).
El material de trabajo (guion, voces, imágenes, música, composición) se guarda en la carpeta oculta
`.ai-cowork/videos/` del proyecto: no sale en el chat ni en Entregables.

**Viene de serie.** No hace falta pulsar nada: unos 45 s después de arrancar, el servidor de kywai mira si el estudio
está completo (HyperFrames, ffmpeg, la voz Kokoro, Manim, los estilos de película y los efectos de sonido de earshot) y, si falta algo, lo instala solo
en segundo plano mientras usas la app (Ajustes lo enseña como «Instalando…» y se pone al día solo). Si una vez no
termina (sin red, sin Python…), lo vuelve a intentar al día siguiente, no en cada arranque; el registro queda en
`estudio-video/instalacion.log`. Con la variable `KYWAI_NO_VIDEO_AUTOINSTALL=1` no se instala solo. FreeVideo, ComfyUI
y Voicebox no entran: son opcionales y se instalan aparte.

**Python.** Kokoro y Manim piden Python 3.10 o más nuevo, y el `python3` que trae macOS es el 3.9. El estudio usa
el Python más nuevo que encuentre (3.13 a 3.10, también los de Homebrew); si solo hay uno viejo, crea su entorno
con **uv** y Python 3.12 (si uv no está, lo instala con el instalador oficial de Astral, sin administrador). Un
entorno que ya estaba hecho con un Python viejo se rehace solo. Si Manim no se instala en macOS, kywai instala
`cairo`, `pango` y `pkg-config` con Homebrew y lo prueba otra vez.

**Instalar a mano.** ⚙ → Ajustes → Extensiones → **Estudio de vídeo** dice qué tiene el equipo (motor, ffmpeg, voz,
imágenes) y **«Instalar lo que falta»** lo instala en el equipo donde corren los agentes (también si lo pulsas desde
la web): HyperFrames y GSAP en la carpeta `estudio-video` de la carpeta de trabajo (versiones fijas, para que un guion
se monte igual dentro de meses), ffmpeg (Homebrew en macOS o, sin él, ffmpeg y ffprobe ya compilados para el procesador del Mac en `~/.local/bin`;
winget en Windows; en Linux, con tu gestor de paquetes),
la voz Kokoro en un entorno de Python propio (`estudio-video/.venv`) y el navegador del render. La primera voz
descarga el modelo de Kokoro (unos cientos de MB). Si falta el motor o ffmpeg, pedir un vídeo dice qué instalar.

**Cómo se ve la pestaña.** Cada bloque va en su propia tarjeta, separada de las demás: lo que tiene el equipo con
«Instalar lo que falta», «El Instagram de kywai», «El TikTok de kywai» y «Extensiones de vídeo». Dentro de cada
tarjeta hay aire entre el título, el texto, los cuadros y los botones, y los cuadros bajan de línea si la ventana es
estrecha (estilo `.block` de `ExtensionsTab.module.css`).

**Extensiones de vídeo.** Las habilidades y los plugins que tratan de vídeo (vídeo, HyperFrames, Remotion, ffmpeg,
voz/TTS, subtítulos, motion graphics…) se instalan en la carpeta del estudio, `habilidades/video`, y no en la
general: no llenan el encargo de las tareas normales y las lee el agente que escribe el guion de cada vídeo. Salen
con un icono de claqueta en Extensiones y juntas, con los servidores MCP de vídeo, en **Estudio de vídeo →
Extensiones de vídeo**.

**Publicar.** De momento no se publica nada: el vídeo se queda en el proyecto y lo subes tú. (Subir a YouTube con tu
propia cuenta es posible más adelante; TikTok no deja automatizar la publicación en una cuenta propia.)

Para desarrolladores: la petición se reconoce en `parseVideoRequest` y el guion en `parseVideoScript`
(`src/main/videoScript.ts`, con la composición HTML y la música); el motor lo lanza en `sendVideo` y lo remata en
`completeVideo` (`src/main/orchestrator.ts`, la tarea lleva `video`). El botón del chat envía `videoFrom` con el id
del mensaje.
### Todas las órdenes al escribir / o @

Al escribir **«/»** al principio del cuadro del chat sale la lista de **todas** las órdenes que tienes, cada una con
lo que hace a la derecha; si sigues escribiendo se filtra («/re» deja `/recortes`, `/recuerda` y `/revisar-pr`). Con las flechas
eliges, Intro o Tab la pone, Esc cierra la lista. Igual en el escritorio, la web y Órbita.

| Orden | Lo que hace |
|---|---|
| `/video tema` | Crea un vídeo completo en el estilo que elijas y te da solo el MP4 (ver «Crear vídeos con solo pedirlo») |
| `/serie idea [en 5 episodios]` | Una historia en episodios con los mismos personajes, cada uno acaba en suspense (ver «Series por episodios») |
| `/editar` (con un vídeo adjunto) | Edita tu grabación: quita muletillas, silencios y tomas repetidas, limpia la voz y pone subtítulos (ver «Editar tus grabaciones») |
| `/recortes [n]` (con un vídeo adjunto) | Saca los mejores momentos de un vídeo largo como clips verticales con subtítulos |
| `/demo <web> [vertical]` | Un anuncio en vídeo de una web con fotos reales de la página: acercamientos, el móvil y rótulos (ver «Vídeo de presentación de una web») |
| `/miniatura [vertical\|horizontal]` | Tres portadas para tu vídeo (el adjunto o el último), con fotogramas suyos y texto que engancha (ver «Portadas para tu vídeo») |
| `/sprite [64px] [8 direcciones] personaje` | Un personaje en pixel art para tu juego: hoja de sprites animada en 4 u 8 direcciones (ver «Sprites de pixel art para juegos») |
| `/doblar <idioma>` | El último vídeo de /video en otro idioma, con las mismas imágenes: voz, subtítulos y rótulos nuevos (ver «Doblar un vídeo a otro idioma») |
| `/aprende enlace o vídeo` | Convierte lo que enseña un vídeo en una habilidad (ver «Aprender de un vídeo») |
| `/instagram qué quieres en el texto` | Prepara el último vídeo para el Instagram de kywai y lo publica con tu visto bueno (ver «El Instagram de kywai») |
| `/tiktok qué quieres en el texto` | Prepara el último vídeo para el TikTok de kywai y lo envía como borrador o lo publica con tu visto bueno (ver «El TikTok de kywai») |
| `/turno-noche nicho o cuentas` | Turno de noche: busca los reels que revientan en tu nicho, desmonta el mejor, hace uno nuevo y lo deja como reel de prueba (ver «El Instagram de kywai»; también `/maquina`) |
| `/rutina cuándo: qué` | Programa una tarea a una hora o que se repita |
| `/directo Agente mensaje` | Habla con un agente sin pasar por Hermes (lo mismo que `@Agente mensaje`) |
| `/recuerda texto` | Guarda un dato en la memoria del proyecto (admite `decisión:`, `pendiente:`, `preferencia:`, `hecho:`) |
| `/model` | Cambia el modelo de Hermes |
| `/uso` | Mira cuánta cuota le queda a cada agente (también `/usage`, `/cuotas`) |
| `/nuevo` | Empieza un chat nuevo en este proyecto (también `/new`, `/limpiar`) |
| `/orden-de-plantilla` | Tus plantillas de tareas, con su nombre a la derecha |
| `/orden-de-mod` | Las órdenes de los mods encendidos, con su descripción |

Las que no llevan nada detrás (`/model`, `/uso`, `/nuevo`) se hacen nada más elegirlas; las demás dejan «/orden » en
el cuadro para que escribas lo de detrás. Al escribir **«@»** sale la lista de agentes, cada uno con su modelo a la
derecha, para hablarle directamente.

Una plantilla o un mod con el nombre de una orden de kywai no sale en la lista (manda la de kywai). En Órbita,
`/uso` abre «Uso y coste», `/nuevo` abre un chat nuevo y `/recuerda` lo anota el servidor (contesta en el chat, sin
pasar por Hermes).

**Para programadores.** La lista está en `src/shared/chatCommands.ts` (`BUILTIN_COMMANDS` y `commandSuggestions`) y
su copia de Órbita en `android/.../orbita/ChatCommands.kt`: una orden nueva se añade en los dos. El snapshot móvil
trae `modCommands` (las órdenes de los mods encendidos) y la capacidad `chatCommands`; `/recuerda …` enviado como
mensaje lo resuelve el motor (`sendMessage` en `src/main/orchestrator.ts`).

### Plantillas de tareas: lo que repites, con un toque

Encima del cuadro del chat hay una fila de botones con las peticiones que repites a menudo. Un toque la envía al
equipo como si la escribieras. Está en el escritorio, en el navegador (también el del móvil) y en Órbita, y todos ven
las mismas porque las guarda el servidor (`templates.json` en la carpeta de datos de kywai).

En el escritorio y el navegador, los formularios y menús de estas plantillas se abren **encima del botón**,
dentro de la ventana. Si falta altura, se puede desplazar su contenido sin que quede cortado por abajo.

- **Huecos**: si el texto lleva algo entre llaves, como `{pr}` o `{carpeta}`, al tocarla se abre un cuadrito para
  rellenarlo (con una vista previa del texto) y luego se envía. Sin huecos se envía al momento. Un hueco empieza por
  una letra y lleva letras, cifras, `_` o `-`; como mucho 6 por plantilla. `{"a": 1}` o `{ b }` no son huecos.
- **Con una orden**: cada plantilla tiene su orden, `/revisar-pr 42`. Al escribir `/` sale la lista de las que
  encajan. Lo que va detrás rellena el hueco; con varios huecos, separados por `|` en orden
  (`/traducir hola | francés`); sin huecos, va al final del texto. En el chat se ve lo que escribiste y al equipo le
  llega el texto de la plantilla. También vale en las rutinas: una rutina cuya petición sea `/revisar-pr 42` la lanza.
- **Los archivos** que tengas preparados en el cuadro van con la plantilla; lo que hubieras escrito se queda.
- En el chat, el mensaje dice con qué plantilla se lanzó («Tú · plantilla «Revisar PR»»).

**Crear y cambiar.** «+» al final de la fila crea una: emoji, nombre del botón, lo que se envía, la orden (si la dejas
vacía sale del nombre: «Revisar PR» → `/revisar-pr`, y lo sigue si le cambias el nombre), dónde sale (en todos los
proyectos o solo en el abierto) y quién la hace:

- **Hermes reparte el trabajo** (lo normal): pasa por el plan, los agentes y la verificación.
- **Directo a un agente**: como `@Agente …`, va tal cual a ese agente sin pasar por Hermes. Si quitas ese agente del
  equipo, la plantilla avisa al lanzarla para que elijas otro.
- **Pedir mi visto bueno al plan**: el coordinador enseña el plan y espera, aunque en Ajustes esté apagado (solo
  para esa plantilla). Sin efecto si va directa a un agente.

Clic derecho en una plantilla (o mantenerla pulsada en el móvil): **Editar**, **Fijar al principio** (las fijadas van
primero, con el borde de color), **Convertir en rutina** (deja `/rutina cada día a las 9:00: <su texto>` en el
cuadro para que cambies el horario y lo envíes; solo en las que no tienen huecos ni van directas a un agente) y
**Borrar** (hay que pulsarlo dos veces). Al eliminar un proyecto se borran sus plantillas.

**Las de serie**: Revisar PR, Resumir carpeta, Buscar fallos, Escribir pruebas, Actualizar dependencias y Explicar
código. Mientras no las cambies, su nombre, su orden y su texto siguen el idioma de la app (en inglés, `/review-pr`).
Si las borras no vuelven solas; «Volver a poner las de serie» (en la ventana de crear o editar) pone las que falten.

**Límites**: 100 plantillas, 60 caracteres el nombre, 8 000 el texto; la orden, de 1 a 30 letras sin acentos, cifras
o guiones, empezando por letra, y no puede ser una de kywai (`/rutina`, `/directo`, `/model`, `/new`, `/usage`,
`/recuerda`…) ni repetir la de otra plantilla del mismo sitio (una general y una de proyecto sí pueden coincidir: en
ese proyecto gana la suya). Una plantilla gana a la orden de un mod con el mismo nombre.

**Órbita / API móvil**: el snapshot trae `templates` (todas, con su `projectId` si son de un proyecto) y la capacidad
`templates`; `GET/POST /templates`, `POST /templates/{id}` (cambiar), `POST /templates/{id}/delete` y
`POST /templates/restore`. Para lanzar una con un toque, `POST /chat/messages` con el texto ya relleno y `templateId`.
Los cambios llegan con el evento `templates.updated`.

### Tablero de tareas: déjalas en cola y vuelve a por los resultados

La pestaña **Tablero** del proyecto (también en la barra lateral, debajo de Tareas) es un Kanban con cuatro
columnas: **Por hacer**, **En marcha**, **Te espera** y **Hecho**. Escribes lo que quieras que haga el equipo
(Ctrl + Intro añade la tarjeta) y kywai coge la primera de «Por hacer», la envía al chat como si la escribieras tú
(en el chat sale como «**Tablero de tareas**») y, cuando termina, pasa sola a la siguiente, aunque no estés delante.
Cada tarjeta pasa por el plan de Hermes, los agentes, la verificación, las hasta 2 correcciones y el relevo a otro
agente, igual que cualquier petición. También valen órdenes como `/video …`.

- **Una a la vez por proyecto**: la siguiente no sale hasta que la anterior termina (o apruebas su plan).
- **Te espera**: las que tienen el plan esperando tu visto bueno («Revisar en el chat») y las que no salieron
  (fallaron, se detuvieron o se cerró kywai con ellas a medias). «Reintentar» la pone la primera de la cola. Una
  terminada también se puede repetir con «Otra vez» o arrastrándola a «Por hacer».
- En «Por hacer» se ordenan con ⇈ ↑ ↓, se editan con el lápiz y se quitan con la papelera (dos toques). La que está
  en marcha no se quita desde el tablero: se detiene en el chat.
- **Pausar el tablero**: el equipo termina la que tiene y no coge más hasta «Reanudar».
- Al arrancar kywai, lo que estaba en marcha queda en «Te espera» como no terminado: no se relanza solo, para no
  repetir cambios a medias.

Se guarda en `tablero.json` de la carpeta de datos (todos los proyectos en un archivo) y se borra con el proyecto.
Funciona en el escritorio, el cliente y el navegador (`getBoard` y `boardCommand`, evento `board.updated`); en
Órbita todavía no.

### Rutinas: peticiones que se lanzan solas

Como kywai corre 24/7 en el servidor, cada proyecto puede tener **rutinas**: una petición que se envía sola al
chat, igual que si la escribieras tú (pasa por el plan del coordinador, los agentes y la verificación). En el chat
aparece con «**Rutina: <nombre>**» en lugar de «Tú». Se gestionan en la pestaña **Rutinas** del proyecto (también
desde el navegador del móvil) o escribiendo `/rutina …` en el chat.

**Cuándo se lanza** (las horas son las del reloj del servidor, en su zona horaria):

| Disparador | Ejemplo |
|---|---|
| Cada día a una hora | «Cada día a las 09:00» |
| Unos días de la semana a una hora | «De lunes a viernes a las 08:30», «Los sábados a las 10:00» |
| Cada N horas (1 a 168) | «Cada 6 horas» (contando desde la última vez) |
| Una sola vez | «Una vez: mañana a las 07:00»: se lanza ese día a esa hora y se desactiva sola |
| Webhook | Al llegar un `POST` a su dirección propia (ver abajo) |
| Al cambiar archivos de una carpeta | Una carpeta del proyecto (o toda): cuando cambian archivos y llevan un minuto quietos |

**Desde el chat**: `/rutina cada día a las 9:00: revisa las dependencias`, `/rutina de lunes a viernes a las 8:30: …`,
`/rutina lunes y jueves 7h: …`, `/rutina laborables a las 8: …`, `/rutina cada 6 horas: …`, `/rutina cada hora: …`,
`/rutina webhook: revisa el PR que llega` o `/rutina al cambiar archivos de Entrada: …`. De **una sola vez**:
`/rutina mañana a las 7: …`, `/rutina hoy a las 21:00: …`, `/rutina esta noche a las 9: …` (las 21:00),
`/rutina pasado mañana a las 10: …`, `/rutina el viernes a las 18:00: …` (el próximo viernes; «los viernes» es
cada semana), `/rutina el 15/11 a las 9: …`, `/rutina el 3 de enero a las 9:30: …`, `/rutina el 2026-12-24 a las 8: …`,
`/rutina dentro de 2 horas: …`, `/rutina en 45 minutos: …` o `/rutina una vez a las 9: …` (hoy, o mañana si ya
pasó). En inglés: `tomorrow at 7`, `on friday at 18:00`, `in 3 hours`. Una hora que ya pasó da error. Lo que va después del
horario es la petición; el nombre sale de su primera frase (se cambia en la pestaña). `/rutina` sola abre la pestaña.
No va a los agentes: se crea la rutina (activa) y debajo del cuadro de texto se ve cuándo será la próxima.
Desde **Órbita** (o cualquier cliente que mande el texto tal cual) funciona igual: el servidor crea la rutina y
contesta en el chat con su horario y la próxima vez, o con la ayuda si no entiende el horario; tampoco pasa por Hermes.

**Hermes te la propone**: si le pides algo que se repite o para más tarde («cada mañana revisa los PR», «mañana a
las 7 comprueba la web», «cuando llegue un PR, revísalo»), además de su respuesta (y, si tiene sentido, de hacerlo ya
la primera vez) sale en el chat una tarjeta verde **Rutina propuesta** con el nombre, el horario y la petición:
**Crear rutina** la crea activa (pasa a «Rutina creada», con «Ver en Rutinas»), **Cambiar** pone su orden
`/rutina …` en el cuadro de texto para que la retoques y la envíes, y **Descartar** no crea nada. Hermes nunca la crea
por su cuenta, y lo que lanza una rutina no propone otra.

**En la pestaña Rutinas**: crear y editar (nombre, petición y disparador), activar o desactivar con el interruptor,
**Ejecutar ahora**, ver la próxima hora, la última ejecución y el **historial** (las 20 últimas: hora, por qué se
lanzó —a su hora, hora perdida, webhook, carpeta, a mano— y cómo acabó). Estados: *En marcha*, *Esperando tu visto
bueno* (solo si la rutina tiene marcada su casilla, ver abajo), *Hecha*, *Falló*, *Saltada* e
*Interrumpida* (se cerró la app mientras trabajaba; se reanuda desde el chat como cualquier petición).

Reglas:

- **Nunca dos a la vez**: si la ejecución anterior de la rutina sigue en marcha (o su plan espera tu visto bueno),
  no se lanza otra: queda apuntada como *Saltada*. Vale también para «Ejecutar ahora» y para los webhooks.
- **Horas perdidas**: si a la hora de una rutina kywai estaba cerrado (o el equipo en reposo), al volver **no**
  se lanza todo lo atrasado: se lanza **una sola vez** y un aviso en el chat dice cuántas veces no se lanzó.
  Al desactivar y volver a activar una rutina, o al cambiarle el horario, cuenta desde ese momento.
- **Visto bueno al plan**: una rutina **no espera** tu visto bueno, aunque tengas encendido «Pedir mi visto bueno
  a cada plan» (esa opción es para lo que escribes tú): nadie está delante y se quedaría parada hasta que volvieras.
  Si una rutina concreta sí debe esperarlo, marca en ella «Pedir mi visto bueno a su plan antes de empezar» (en la
  tarjeta pone «con tu visto bueno»); su plan sale en el chat y en «Te necesita» como cualquier otro.
- La rutina de **una sola vez** se desactiva al lanzarse (también si se lanzó tarde, al volver kywai) y queda en la
  lista con su historial y «ya se lanzó». Para repetirla, edítala y elige otro día: al guardar vuelve a quedar activa.
  No se puede crear ni activar para una hora que ya pasó.
- La rutina de **carpeta** no mira mientras el equipo trabaja en el proyecto (los cambios de los agentes no
  cuentan; al terminar se toma una foto nueva) y no se lanza más de una vez cada 5 minutos. La petición lleva la
  lista de archivos nuevos (+), cambiados (~) y borrados (-).
- Mientras la lanza una rutina, el coordinador sabe que nadie está delante: no se queda esperando una respuesta a
  una pregunta, hace lo razonable y explica lo que dio por supuesto.

**Webhook**: cada rutina de webhook tiene su dirección propia en el acceso web (hace falta tenerlo encendido:
⚙ → Ajustes → «Acceso desde otros dispositivos…») con un **secreto aleatorio** suyo, que no es el código de acceso de la app.
El botón «Webhook» de la rutina la enseña con botones para copiarla (también en el móvil):

- `POST http://<ip-de-tailscale>:8787/hooks/<proyecto>/<rutina>/<secreto>`, o
- la misma dirección sin el secreto y con la cabecera `X-Cowork-Secret: <secreto>`, o
- para **GitHub**: la dirección sin el secreto, tipo de contenido `application/json` y el secreto en «Secret» (se
  comprueba la firma `X-Hub-Signature-256`). El «ping» que manda GitHub al crear el webhook se contesta sin lanzar nada.

Cualquier secreto incorrecto, rutina que no existe o que no es de webhook responde **404**, igual que una dirección
que no existe. Con el secreto correcto: `202` con `{ status, runId }` (`skipped` si la anterior seguía), `409` si la
rutina está desactivada y `413` si el cuerpo pasa de 1 MB. El cuerpo (por ejemplo el evento de un PR) se añade a la
petición como **datos externos no confiables**: recortado a 6 000 caracteres, sin las direcciones de la API ni los ids
internos de GitHub, entre marcas que el remitente no puede cerrar, y con la instrucción de no seguir nada de lo que
diga. En el chat va plegado bajo la petición («Datos que trajo la rutina»). «Cambiar el secreto» invalida la dirección
anterior. El secreto solo se guarda en el `project.json` del proyecto: no viaja con el proyecto a la interfaz ni a la
app del móvil (se pide aparte al abrir «Webhook») y no se escribe en registros.

El servidor solo escucha en la IP de Tailscale y en `127.0.0.1`, así que el webhook llega desde tus dispositivos y
servicios de Tailscale. Para que llegue GitHub (que está en internet) hace falta exponerlo, por ejemplo con Tailscale
Funnel; ten en cuenta que entonces todo el acceso web queda en internet (sigue pidiendo el código de acceso, salvo
en `/hooks/`, que pide el secreto de cada rutina).

**En Órbita**: barra lateral → **Rutinas** (menú «Más»). Lista las rutinas del proyecto con su horario, la próxima
vez y la última ejecución, con interruptor para activarla, **Ejecutar ahora**, editar y borrar; **Nueva rutina** abre
un formulario con los mismos tipos que el escritorio (una vez, cada día, ciertos días, cada N horas, webhook, al
cambiar archivos) y la casilla del visto bueno. La tarjeta «Rutina propuesta» de Hermes también sale en el chat de
Órbita con **Crear rutina**, **Cambiar** (pone la orden `/rutina …` en el cuadro de texto) y **Descartar**. Con un
servidor antiguo, Órbita solo deja verlas o avisa de que hay que actualizar kywai en el ordenador.

**API móvil**: `GET /api/mobile/v1/routines?conversationId=…` lista las rutinas (sin secretos) y
`POST /api/mobile/v1/routines/{routineId}/run` es «Ejecutar ahora» (capacidad `routines`). Con la capacidad
`routinesEdit`: `POST /routines` crea, `POST /routines/{routineId}` cambia (los campos que mandes) y
`POST /routines/{routineId}/delete` borra. Con `routineProposals`:
`POST /messages/{messageId}/routine-proposal/create` o `/dismiss` decide la tarjeta de Hermes (404 si no existe, 409 si
ya se decidió). Los cambios llegan por el evento `routines.updated` y los mensajes de una rutina llevan
`routine: { id, name }`. El secreto del webhook no sale nunca por la API móvil.

Se guardan en el `project.json` del proyecto (`routines`) y las lanza `src/main/routines.ts`, que mira cada 30 s.

### Secretos: claves y tokens que los agentes usan sin verlos

Cada proyecto tiene la pestaña **Secretos** (la llave, junto a Rutinas) para guardar claves de API, tokens (por
ejemplo el PIT de GHL) y contraseñas de cuentas que los agentes **pueden usar pero no leer**. Así no hace falta
pegarlos en el chat ni crear un `.env` en la carpeta del proyecto.

- **Guardar:** «Nuevo secreto» → nombre (como variable de entorno: `GHL_PIT`, `GHL_LOCATION_ID`; se pasa solo a
  mayúsculas), valor y una nota opcional. También desde el chat: `/secreto GHL_PIT pit-…` (o `NOMBRE = valor`,
  `NOMBRE: valor`). Esa orden no se envía al chat ni a los agentes: va directa a Secretos. `/secreto` sola abre la
  pestaña. Si llega desde el móvil o una interfaz anterior, el servidor también la intercepta.
- **Dónde se guardan:** en la carpeta de datos del servidor (`secretos-proyectos.json`, permisos 0600), cifrados igual
  que las claves de los agentes (en Mac con la clave propia de kywai; en Windows y Linux con el cifrado del sistema).
  Nunca en la carpeta del proyecto, en `config.json` ni en git. Al eliminar el proyecto se borran.
- **Lo que ve la interfaz:** solo nombre, nota y fecha. El valor entra al guardarlo y no vuelve a salir: ni a la
  pantalla, ni al acceso web, ni a la API móvil. «Cambiar» permite poner un valor nuevo, renombrar o cambiar la nota
  sin volver a pegarlo.
- **Cómo lo usan los agentes:** cada tarea (y su verificación) recibe los secretos de su proyecto como variables de
  entorno del programa del agente (`$GHL_PIT`, `process.env.GHL_PIT`…). El encargo solo dice los nombres y les
  prohíbe escribir el valor. En el navegador de kywai el agente escribe `{{secreto:NOMBRE}}` con
  `navegador_escribir` y kywai pone el valor en el campo (en el permiso se ve el marcador, no el valor). Los modelos
  locales (Ollama, LM Studio) no ejecutan órdenes, así que no los usan.
- **Tapado:** todo lo que devuelve un agente (respuesta, pasos, actividad, errores), lo que guarda con las
  herramientas de kywai (memoria, preguntas) y lo que lee de la página del navegador pasa por un filtro que cambia
  cualquier valor guardado (también escapado en JSON o en una URL) por `[secreto NOMBRE]`. La vista previa de
  archivos también sale tapada.
- **Límites (con sinceridad):** un agente con terminal tiene el valor en su entorno, así que podría imprimirlo con
  otra codificación (base64, al revés) o mandarlo a otra web: el filtro solo reconoce el valor tal cual y sus formas
  escapadas. Si lo escribe en un archivo, el archivo lo conserva (solo la vista previa sale tapada; la descarga o la
  carpeta no). Las capturas del navegador no se tapan. Y si alguien pega una clave en un mensaje normal, ese mensaje
  ya lo leyó el coordinador: guárdala con `/secreto` y cámbiala en su servicio. Lo mejor es dar a los agentes claves
  de solo lectura o con los permisos justos.
- Código: `src/main/projectSecrets.ts` (guardar, cifrar, tapar y la nota del encargo), `src/main/agents/secretScope.ts`
  (variables de la tarea y filtro en `runAgent`), `src/renderer/src/ui/left/SecretsView.tsx` (pestaña) y
  `parseSecretCommand` en `src/shared/chatCommands.ts`. Órbita todavía no tiene la pestaña; el servidor también intercepta `/secreto` si llega desde su chat (sin probar en el móvil).

### Barra lateral y conversaciones

A la izquierda, como en Claude, está la **barra lateral**. De arriba abajo:

- **Nuevo chat** (Ctrl+Mayús+O; ⌘⇧O en el Mac), o escribir `/new`, `/nuevo`, `/limpiar` o `/clear` en el cuadro de
  texto: empieza una conversación nueva en el proyecto abierto, también para los agentes, que dejan de ver los
  mensajes anteriores. La conversación anterior **no se pierde**: queda guardada en la lista de su proyecto. Los
  archivos, los resultados y la memoria del proyecto se quedan; las tareas que estaban en pausa siguen a la vista.
- **Buscar** (Ctrl+K): ver [Buscar](#buscar-ctrlk).
- **Historial**: todas las conversaciones de todos los proyectos, por fechas: ver [Historial](#historial).
- **Te necesita**: la bandeja de avisos (antes era la campana de arriba a la derecha).
- **Tareas**, **Resultados** y **Rutinas** abren esa pestaña del panel del chat (con el número de tareas en curso).
- **Favoritos** (antes «Fijados»): los proyectos y las conversaciones que quieres tener siempre a mano. Está siempre
  a la vista entre Rutinas y Proyectos; vacío, muestra dónde soltar. Se añaden **arrastrándolos** aquí o con clic
  derecho → «Añadir a Favoritos» (y se quitan con «Quitar de Favoritos»). Se guarda en el servidor, así que se ve
  igual en el navegador y en los clientes (en Órbita sigue llamándose «Fijados»).
- **Proyectos**: todos, con **+** para crear uno. La flecha de cada proyecto despliega sus conversaciones (el abierto
  se despliega solo); un punto azul que late indica que el equipo está trabajando en él. Clic en un proyecto: lo abre
  y lo despliega; **otro clic en el que ya está abierto lo pliega** (y otro más lo vuelve a desplegar), como en Órbita.
  De cada proyecto se ven solo sus **3 chats más recientes** (y el abierto, aunque vaya más abajo); debajo, la fila
  **«Ver los X restantes»** despliega los demás y, abierta, **«Ver menos»** los vuelve a esconder. Si solo sobra uno,
  se enseña sin la fila. Un **punto verde** junto a un proyecto indica que tiene resultados terminados sin ver.
- **Filtro de Proyectos** (el botón de las rayas, junto al **+**): se guarda en cada equipo (cada pantalla a su
  gusto) y, si hay algo distinto de lo de siempre, el botón lleva un punto.
  - **Agrupación**: *Por proyecto* (lo de siempre) o *Por fecha*: los chats de todos los proyectos en Hoy, Ayer,
    Últimos 7 días, Últimos 30 días y por meses, con el nombre del proyecto a la derecha (también de 3 en 3).
  - **Orden**: *Tu orden* (el que dejas arrastrando), *Lo más reciente primero* o *Por nombre (A-Z)*; vale para los
    proyectos y para sus chats. Con un orden que no es el tuyo no se recoloca arrastrando (mover un chat a otro
    proyecto sí).
  - **Estado**: *Todos*, *Trabajando ahora* (el equipo trabaja en él), *Con resultados sin ver* o *Activos esta
    semana*. Si no queda ninguno, sale «Quitar el filtro».
  - **Mostrar todos los chats**: sin «Ver los X restantes», todos a la vista.
  - **Restablecer el filtro**, **Contraer todo** (o *Desplegar todo* si ya está todo plegado) y **Marcar todo como
    visto** (quita el «nuevo» de todo lo terminado sin ver, lo mismo que «Visto» en Resultados).
  - En **Órbita** hay el mismo botón junto a «Proyectos» con Orden, Estado, Mostrar todos los chats, Restablecer,
    Contraer todo y Marcar todo como visto (sin *Agrupación por fecha*: para eso está Historial).
- **Recientes**: las últimas conversaciones de todos los proyectos; al final, «Ver todo el historial».
- Abajo, **dónde estás conectado** (el servidor) y la **rueda ⚙**: ver [La rueda ⚙ y los Ajustes](#la-rueda--y-los-ajustes).


**Retomar una conversación**: pulsa cualquiera de la lista y vuelve con sus mensajes, sus tareas terminadas y la
sesión de cada agente (Claude y Codex siguen donde lo dejaron, si no han pasado más de 14 días). La que estaba
abierta se guarda antes.

**Conversaciones en paralelo.** Puedes cambiar de conversación o empezar otra **aunque el equipo esté trabajando**,
también dentro del mismo proyecto. La conversación que dejas sigue en segundo plano: lo que llegue de sus peticiones
(mensajes, tareas, la sesión de cada agente) se guarda en ella y no en la que tienes abierta, y en la barra lleva un
**punto azul que late** mientras trabaja. En la nueva puedes lanzar otra petición; las dos van a la vez, con el mismo
equipo (si un agente está ocupado, lo nuevo espera en su cola como siempre). Al volver a la primera está todo lo que
hizo mientras tanto. El botón «Detener» del chat es solo para las peticiones de la conversación abierta; para parar
la otra, ábrela y detenla allí. Si cierras kywai con una conversación trabajando en segundo plano, sus tareas a medias
salen como interrumpidas al volver, igual que en la abierta.

**Arrastrar** (mantén el clic sobre un chat o un proyecto y muévelo): una raya marca dónde caerá y un recuadro
cuando cae «dentro» de un proyecto.

- Un **chat** soltado sobre **otro proyecto** (en el centro de su fila, o entre sus chats) se **mueve** allí, igual
  que con «Mover a otro proyecto». Si era el chat abierto, sigues en él ya en su proyecto nuevo. No se puede mientras
  el equipo trabaja en ese chat.
- Dentro de un proyecto, los **chats se reordenan** soltándolos encima o debajo de otro; los **proyectos** también
  se reordenan entre ellos.
- Lo que sueltas en **Favoritos** se añade allí, en el sitio donde lo dejas; dentro de Favoritos se reordena igual.
- **Recientes** va siempre por fecha: desde ahí se puede arrastrar, pero no se cambia su orden.
- El orden se guarda en el servidor (`orden-barra.json` en la carpeta de trabajo). Lo nuevo (un proyecto o chat
  recién creado) sale arriba hasta que lo muevas. Un cliente conectado a un servidor sin esta versión sigue
  ordenando por fecha.
- Un chat arrastrado fuera de la barra lleva también el tipo `application/x-kywai-chat`
  (`{ projectId, conversationId, title }`) para que otras zonas de la ventana puedan recibirlo.

**Dos chats a la vez (chat de al lado).** Arrastra un chat de la barra hacia la **derecha de la ventana**: mientras
lo arrastras, la zona del Espacio 3D se marca con «Suelta aquí para abrirlo al lado». Al soltarlo, ese chat ocupa el
sitio del 3D y tienes **dos chats abiertos**, cada uno con su cuadro de escribir, su botón «Detener» y sus pestañas
(Archivos, Tareas, Resultados…). También con clic derecho en el chat → **Abrir al lado** (L).

- Pueden ser **dos chats del mismo proyecto**: lo que escribes en el de al lado va a su conversación y el chat
  principal no salta a ella (el motor la deja ver y escribir sin abrirla). También funcionan ahí «Responder», «Crear
  vídeo de esto», editar tu mensaje con el lápiz (con sus versiones ‹1/2›), las notas de voz y bifurcar (la copia se
  queda en el de al lado).
- Mientras hay un chat al lado, el **3D se para** (no gasta) y la música sigue. La **✕** de su cabecera lo cierra y
  vuelve el 3D; el botón de la ventana lo saca a una **ventana aparte**. Arrastrar otro chat encima lo sustituye.
- El borde del medio se sigue arrastrando para repartir el ancho; llevarlo del todo a la derecha cierra el chat de al
  lado y deja el principal a toda la ventana. Si el 3D estaba cerrado, la zona para soltar es la mitad derecha del chat.
- Se recuerda en cada dispositivo (`kywai.splitChat`). En ventanas estrechas (menos de 950 px) no cabe: se guarda y
  vuelve al ensanchar la ventana.
- El sonido del equipo (tareas, agentes) suena solo en la ventana principal; el chat de al lado solo pone voz a sus
  mensajes.
- `/nuevo` (y `/limpiar`…) no se puede en el chat de al lado ni en una ventana suelta: cambiaría también el chat
  principal. Empieza el chat nuevo en la ventana principal y arrástralo.

**Chat en ventana aparte.** **Clic con la rueda del ratón** en un chat de la barra (o clic derecho → **Abrir en
ventana aparte**, V) lo abre en una ventana suelta de kywai, que puedes llevar a **otro monitor**. Es el chat entero
(con sus pestañas) y, como el de al lado, no cambia el chat principal. Volver a abrir el mismo chat reutiliza su
ventana. Las ventanas sueltas se cierran al cerrar la principal. Funciona en la app del servidor, en el cliente de
escritorio y en el navegador (allí abre una ventana nueva del navegador).

Cómo va por dentro: el chat de al lado y la ventana suelta son la misma interfaz con
`?chatProject=<id>&chatConversation=<id>` (`embedded=1` dentro de la ventana; ui/pane/ y lib/chatPane.ts). Cargan
la conversación con `getConversation` (sin abrirla) y envían con `conversationId` (`sendMessage`, `sendVoiceNote`,
`switchMessageVersion`); el motor lo hace con `inConversation` (conversations.ts), que ata a esa conversación las
peticiones que nacen durante ese envío. Los mensajes de una conversación en segundo plano llegan por el evento
`conversation.message`, y `message.upsert` lleva el `conversationId` de la abierta. En la app de escritorio el marco
usa el puente de la ventana principal y las ventanas sueltas reciben los mismos eventos (`addEventWindow`).

**Clic derecho** (o el botón **⋯** que sale al pasar el ratón) abre el menú de lo que tocas, como en Claude. Con el
menú abierto, la letra de la derecha hace esa acción sin el ratón.
Los botones **⋯** y la flecha de desplegar no llevan bloque de fondo propio: el nombre se desvanece antes de
llegar a ellos y la hora o el punto de «trabajando» se apartan mientras están a la vista, así quedan sobre la
misma tarjeta y con el color del tema que tengas.

- En una **conversación**: **Añadir a Favoritos** (P), **Cambiar nombre** (R; por defecto es el principio de tu primer mensaje),
  **Bifurcar** (F: una copia aparte, con los mensajes y las tareas, para seguir por otro camino sin tocar la
  original; se abre sola y los agentes empiezan sesión nueva en ella), **Mover a otro proyecto** (M; los agentes
  empiezan sesión nueva allí; si era la abierta, su proyecto queda con una conversación nueva) y **Eliminar** (D,
  pulsa dos veces; va a `conversaciones/borradas/` dentro del proyecto, no se pierde del todo; si es la abierta,
  antes se empieza una nueva). Mover y eliminar no se puede mientras el equipo trabaja en esa conversación (la del
  punto azul), esté abierta o en segundo plano.
- En un **proyecto**: **Nuevo chat en este proyecto** (N), **Añadir a Favoritos** (P), **Cambiar nombre** (R), **Abrir carpeta
  del proyecto** (O) y **Eliminar proyecto** (D, pulsa dos veces; ver [Eliminar un proyecto](#eliminar-un-proyecto)).

No hay «Marcar como no leído» ni «Archivar» como en Claude: aquí todas las conversaciones se guardan solas y no hay
estado de leído.

El **logo de kywai** (arriba a la izquierda, en la cabecera) **abre y pliega** la barra a una columna de iconos (con los números de los avisos); se recuerda en
cada dispositivo. Si nunca la has tocado, en ventanas de menos de 1300 px empieza plegada. En ventanas estrechas
(navegador del móvil, tableta en vertical o menos de 950 px) la barra **siempre queda plegada en su columna de iconos**
a lo largo de la izquierda, bajo el logo de la cabecera, y se usa sin abrirla; el logo abre la barra entera por encima
del chat (la ✕ o un clic fuera la cierra).

**El logo queda dentro de la barra.** Al plegarla, el logo se coloca sobre la columna, cae de él una gota, sube otra
de la barra y, al tocarse, el líquido crece hasta ser la misma barra: **sube recta hasta arriba**, con el mismo fondo
y el mismo borde, y envuelve el logo (que pierde su recuadro). El nombre «kywai» se aparta a la derecha de la barra.
Al pulsarlo, el logo da una vuelta rápida sobre sí mismo. Con la barra plegada, el nombre «kywai» se recoge dentro
del logo para que arriba quede limpio, y al abrirla sale de él y vuelve a su sitio. En el tema Órbita la columna es del mismo cristal que la
barra, de una sola pieza. Se mueve como un líquido: la superficie se curva al subir, se balancea un momento al llegar arriba y el logo flota
un poco antes de quedarse quieto. Al abrirla, el líquido baja, se estrecha y se corta, y el logo recupera su recuadro
y su sitio. Con «Reducir
movimiento» del sistema cambia sin animación.

**En Órbita (Android)** va igual: el logo de la barra la abre y la pliega (ya no hay un botón aparte) y da una vuelta
al tocarlo; plegada, la columna enseña debajo de los accesos **tus proyectos con su inicial** (resaltado el abierto,
punto azul si el equipo trabaja en él, verde si tiene algo terminado sin ver) y tocar uno abre su último chat. En la
tableta, la barra se abre y se pliega con un movimiento elástico en vez de cambiar de golpe.

**Volver al chat con la barra plegada.** Bajo los accesos (tras una raya) va el icono del **chat en el que estás**:
desde Resultados, Tareas, Tablero o Rutinas, un clic te devuelve a él. Debajo salen **tus proyectos** con su inicial
(el proyecto en el que estás, con borde de color); al pasar el ratón sale su nombre y un clic abre **su último chat**.
Un punto azul que palpita marca los proyectos donde el equipo está trabajando y uno verde los que tienen resultados sin
ver. El clic con la rueda en el chat actual lo abre en una ventana aparte. Igual en el escritorio, el cliente y el
navegador.

**Nombre del ordenador.** Abajo en la barra sale dónde corren los agentes: el nombre del equipo en la red
(«macmini.lan») o el que tú le pongas. Pulsa el nombre (sale un lápiz al pasar por encima), escribe uno nuevo (hasta
40 caracteres) e Intro; Esc cancela y dejarlo vacío vuelve al nombre de la red. Se guarda en el servidor
(`config.serverName`, `setServerName`; `getHostInfo` lo devuelve como `name`), así que se ve igual en el escritorio,
la web, los clientes y Órbita (`settings.serverName` en la instantánea móvil y `POST /settings/server-name`).

Dónde se guarda: la conversación abierta va en el `project.json` del proyecto, como siempre; las demás en
`conversaciones/<id>.json` (con sus tareas y las sesiones de los agentes) y su lista en `project.json`
(`conversations`). Las copias que dejaba antes «Limpiar el chat» en `historial/chat-<fecha>.json` se importan solas
la primera vez que se abre la lista, así que también se pueden retomar. Lo hace `src/main/conversations.ts`; en la
API son `listConversations`, `recentConversations`, `newConversation`, `openConversation`, `renameConversation`,
`deleteConversation`, `setConversationPinned`, `pinnedConversations`, `forkConversation`, `moveConversation`,
`setProjectPinned` y `search`. Al cambiar de conversación se emite `chat.cleared` (con
`conversationId`) y `conversations.updated`: los otros dispositivos y Órbita vuelven a cargar el chat solos.

Cómo funciona el segundo plano: cada petición recuerda la conversación donde empezó (`conversationOfRun`). Si ya no
es la abierta, `projects.upsertMessage`/`upsertTask` pasan por el router de `conversations.ts`, que la carga de su
archivo, la guarda al rato de cada cambio (y al cerrar la app, `flushBackground`) y no emite `message.upsert` (el chat
abierto no la enseña). Las tareas en marcha siguen en el proyecto mientras trabajan (el equipo y el 3D las ven) y al
terminar se quedan solo en su conversación. Las sesiones de los CLI van con `rememberRunSession`/`lastRunSession`.
`listConversations` y compañía marcan `busy` en las conversaciones con trabajo; `run.started` y `run.finished`
llevan `conversationId`, y `loadProject`/`openConversation` devuelven en `activeRunIds` solo las peticiones de la
conversación abierta. En Órbita el chat con trabajo lleva el punto y «Nuevo chat en este proyecto» ya no se bloquea.

### La rueda ⚙ y los Ajustes

La **rueda ⚙** (abajo en la barra lateral) abre un menú corto, como en Claude: arriba dice dónde estás y debajo
están **Ajustes…** (también **Ctrl+,**; ⌘, en el Mac), **Uso y coste…**, **Cómo rinde cada agente…**,
**Archivos del servidor…** (desde el navegador), **Abrir carpeta del proyecto**, **Buscar actualizaciones…**,
**Reiniciar kywai** (pulsa dos veces) y **Apoyar kywai ☕**.

**Ajustes…** abre una ventana con pestañas a la izquierda:

- **General**: idioma, sonido (con los volúmenes de la música y de las voces), reducir efectos, modo demo y el tema.
- **Agentes**: configurar agentes, acceso completo para los agentes, pedir tu visto bueno a cada plan y actualizar
  las cuotas.
- **Conexión**: dónde estás, acceso desde otros dispositivos (en el servidor) y, en un cliente de escritorio,
  sincronizar carpetas, cambiar de servidor y olvidar este dispositivo.
- **Acerca de**: buscar actualizaciones, actualizar este equipo y recargar la interfaz (cliente), reiniciar y
  apoyar kywai.

Lo que tiene ventana propia (acceso desde otros dispositivos, actualizaciones, sincronizar) se abre en lugar de
Ajustes, y al cerrarla vuelves a la misma pestaña. Esc o la ✕ cierran. Lo hacen `ui/settings/SettingsDialog.tsx` y
`ui/header/HeaderMenu.tsx` (el menú corto).

### Animaciones: la app responde a cada gesto

Todo lo que haces se nota: lo que se pulsa cede y vuelve, lo que aparece llega desde su sitio y lo que se va sale
antes de desaparecer. Se mueve con **muelles**, como el líquido del logo con la barra plegada: llega, se pasa un
pelo y se asienta.

- **Botones e interruptores.** Al pulsar, el botón cede al momento y al soltar vuelve con un pequeño rebote. La
  bolita de los interruptores se estira mientras la pulsas y salta al otro lado.
- **Ventanas** (Ajustes, Buscar, avisos…): suben y se asientan con muelle; al cerrarse se van más rápido de lo que
  llegaron.
- **Pestañas** (Chat, Archivos, Tareas… y las secciones de Ajustes): el contenido nuevo llega desde el lado de la
  pestaña elegida (desde la derecha si está más a la derecha; en Ajustes, desde arriba o desde abajo), el icono da un
  saltito y la rayita de debajo se desliza con muelle. Las cifras de las pestañas (tareas en curso, resultados…) saltan
  al cambiar. En ventana estrecha, el nombre de la pestaña abierta entra deslizándose.
- **Paneles que se abren y se cierran**: la vista previa de un archivo llega desde la derecha y al cerrarla se va
  hacia la derecha mientras funde; al cambiar de archivo con ‹ › solo entra el contenido, desde el lado al que vas. El
  chat de al lado crece desde donde lo sueltas y se va igual al cerrarlo. Al cerrar el espacio 3D su panel se va a la
  derecha mientras el chat se ensancha, la pestaña «Espacio digital» sale del borde del chat con un saltito y, al
  volver, el 3D llega desde la derecha y se asienta.
- **Bordes que se arrastran** (ancho del chat y de la barra lateral): al acercarte, la raya crece desde el centro y
  una «perla» sigue al ratón por ella; al agarrarla se ensancha y brilla, y el panel que estás cambiando se marca. Si
  al soltar se va a cerrar un lado, la perla se pone en ámbar y el aviso sale con un saltito. Al soltar, el reparto de
  la ventana se recoloca con un muelle suave.
- **Arrastrar chats y proyectos** en la barra lateral: lo que coges es una tarjeta con su icono y su nombre, un poco
  inclinada; la fila de origen queda como un hueco de rayas, las filas se apartan de donde caería y la raya de destino
  crece y brilla (dentro de un proyecto, el recuadro late). Si Favoritos está vacío, su pista late para invitarte. Al
  soltar, las filas se deslizan hasta su sitio nuevo y la que has soltado da un destello. La zona «Suelta aquí para
  abrirlo al lado» se abre con muelle y, con el chat encima, su icono bota.
- **Arrastrar archivos al chat**: la zona «Suelta para adjuntar» se abre con muelle y su icono flota; al soltar se
  encoge hacia la caja de escribir (ahí van los adjuntos) y cada adjunto cae en su sitio con un saltito, uno detrás
  de otro; si te vas sin soltar, solo funde. En el Tablero, la tarea que arrastras también es una tarjeta con su
  texto y la columna «Por hacer» se abre un pelo para recibirla.
- **Cada clic**: tu mensaje sale de la caja de escribir y sube a su sitio, y la flecha de Enviar sale disparada; los
  mensajes de los agentes suben y se asientan. Cualquier **✓** (copiado, guardado, elegido) salta al aparecer, el pulgar
  que eliges da un saltito, las filas de la barra ceden al pulsarlas, los menús crecen desde donde nacen (rápidos: se
  usan a diario) y lo que se despliega (pasos de una tarea, detalles) se abre y se cierra con suavidad.

- **Onda al pulsar**: en cualquier botón, pestaña, fila u opción de menú sale una onda desde el punto exacto donde
  pulsas y se queda dentro de su forma.
- **Resalte que se desliza**: en las pestañas, la barra lateral, los menús y la lista de Ajustes, el fondo de «estás
  encima» es una sola pieza que viaja de una fila a otra con muelle, en vez de encenderse y apagarse en cada una.
- **Menús y globos** encogen un poco y funden al cerrarse (antes desaparecían de golpe); lo que recibe el foco del
  teclado se marca con un aro que llega desde fuera.
- **Tarjetas** (Resultados, Tablero, temas, cuotas): se levantan con su sombra al pasar por encima y ceden al pulsar.
  Las secciones de la barra (Favoritos, Proyectos, Recientes) y los chats de un proyecto se despliegan desde su título.

**Sonidos de la interfaz.** Cada gesto tiene un sonidito muy corto y muy bajo: los interruptores suben o bajan de
tono, las pestañas «pasan», lo que se despliega se abre o se cierra, coger y soltar un chat o un archivo suenan a
cogido y a posado, enviar un mensaje hace un pequeño «fiu» hacia arriba, copiar da dos toques, y abrir o cerrar un
panel (vista previa, espacio 3D) suena hacia arriba o hacia abajo. Van con **«Efectos y avisos»** (Ajustes →
General): con eso apagado o a cero no suena nada, y nunca pisan un aviso de verdad (tarea terminada, «Te necesita»).

**Modo tranquilo.** Con **«Reducir efectos ambientales»** (Ajustes → General) nada se desplaza ni rebota: lo que
aparece solo funde, más corto. Con **«Reducir movimiento»** del sistema todo cambia al instante.

Cómo está hecho: las curvas de muelle están en `styles/motion.css` (`--spring`, `--spring-bouncy` y `--spring-soft`,
como `linear()` de CSS) y la misma física en `lib/motion.ts` para lo que se anima desde JavaScript (`enter`); el cambio de pestaña es `useSwitchMotion`
y la salida de los paneles `useExitGhost` (`ui/common/motion.ts`): al desmontarse deja una copia inerte en su sitio
que se va (los iframes, vídeos y lienzos de la copia se cambian por su fondo para no recargarlos). Lo del arrastre está en `lib/dragMotion.ts`: `setDragCard` (la tarjeta) y `flipRows` (mide las
filas con `data-slot` antes y después de soltar y anima la diferencia). La onda y el resalte que se desliza son
`lib/touchFeedback.ts` (escucha en el documento: no hay que tocar cada botón; las listas se marcan con `data-glide` y
lo que no debe llevarse el resalte, con `data-no-glide`). Los menús que se cierran llevan `data-exit-motion`
(`lib/dialogMotion.ts`). Los sonidos son `playUi` en `lib/audio.ts` (`tab`, `toggleOn`, `toggleOff`, `open`, `close`,
`expand`, `collapse`, `pick`, `drop`, `send`, `copy`), sintetizados como el resto. Las
distancias de las animaciones se multiplican por `--m`, que vale 0 en modo tranquilo (`<html data-calm>`, lo pone
`startCalmSync` según `reducedEffects`).

### Buscar (Ctrl+K)

**Buscar** en la barra lateral, o Ctrl+K (⌘K en el Mac), abre un buscador que mira a la vez en **todas las
conversaciones** (abiertas y guardadas), las **tareas** (título, encargo y resultado), los **resultados** (nombre del
archivo), la **memoria** y los nombres de los proyectos, de todos los proyectos o, con «Solo este proyecto», del
abierto. No distingue mayúsculas ni tildes.

- **Varias palabras**: tienen que estar **todas** en el mismo mensaje (o tarea, o nota), en cualquier orden.
  `barra oscuro` encuentra «pon el modo oscuro en la barra».
- **Entre comillas** («…», "…" o “…”): la **frase exacta**. `"modo oscuro"` no encuentra «oscuro el modo».
- **Fecha**: cualquier fecha, hoy, últimos 7 días o últimos 30 días.
- **Quién lo escribió**: cualquiera, tú, cualquier agente o uno en concreto. Con este filtro solo salen mensajes (y
  las tareas de ese agente), no resultados, memoria ni proyectos.
- Los chips filtran por tipo; ↑↓ y ↵ para abrir: lleva al proyecto y a la conversación donde está, en la pestaña que
  toca (una tarea abre Tareas; un resultado, su visor; una nota, Memoria).
- **Al mensaje exacto**: al abrir una conversación, el chat baja hasta el mensaje encontrado, lo resalta un momento y
  marca lo buscado dentro de él.
- **«N coincidencias»**: si en una conversación coinciden varios mensajes, el botón despliega los primeros cinco (quién
  lo dijo, el trozo y la fecha) para ir directo al que quieras.
- Salen 40 resultados; **«Ver más»** trae otros 40 (abajo se ve el total).

Por dentro, el ordenador guarda en memoria el texto ya preparado de cada mensaje y solo vuelve a leer una conversación
guardada si su archivo cambió, así que buscar a cada tecla no relee todos los proyectos
(`searchHistory` en `src/main/conversations.ts`).

### Historial

**Historial** en la barra lateral (o «Ver todo el historial» al pie de Recientes y en el buscador vacío) abre una
ventana con **todas las conversaciones de todos los proyectos**, agrupadas por **Hoy, Ayer, Últimos 7 días, Últimos
30 días** y, las de antes, por **meses**. Cada una dice su proyecto, cuántos mensajes tiene y cuándo se habló por última
vez (y «abierta» la que tienes abierta).

- Arriba se **filtra por nombre** (el de la conversación o el del proyecto) y por **proyecto**.
- «**Buscar «…» dentro de los mensajes**» pasa lo escrito al buscador.
- ↑↓ y ↵, o un clic, abren la conversación.

**En Órbita** es igual: «Historial» en la barra lateral (y en la columna de iconos), con los mismos grupos, el filtro
por nombre y por proyecto. El «Buscar» de Órbita tiene los mismos filtros (fecha, tú o agentes), «N coincidencias» para
elegir el mensaje, «Ver más» y, al abrir un chat, baja hasta el mensaje encontrado y lo resalta. Necesita un ordenador
con esta versión (si no, se ve el buscador de antes).

API móvil: `GET /chats/all` (el historial) y `GET /search` con `since` (ms), `author` (`user`, `agents` o el id de un
agente) y `limit` (hasta 400); la respuesta trae `total` y, en cada chat, `messageId`, `matchCount` y `matches`. La
capacidad `history` del snapshot dice si el ordenador lo tiene.

### Importar de otras apps

Para no empezar de cero al pasarte a kywai: ⚙ → «**Importar de otras apps…**» (también al final del asistente de
bienvenida y, mientras tengas pocas conversaciones, «Traer conversaciones de otras apps…» al pie de la barra lateral).
Los originales **no se tocan** y nada sale del servidor. Volver a importar **no duplica** lo que ya se trajo (se apunta
en `workspace/importados.json`; si borras una conversación importada, se puede volver a traer).

**En este equipo** busca lo que ya hay en el disco del **servidor** (el ordenador donde corre el motor):

| App | Dónde lo busca | Qué queda en kywai |
|---|---|---|
| Claude Code | `~/.claude/projects/<carpeta>/<sesión>.jsonl` (o `$CLAUDE_CONFIG_DIR`) | Una conversación por sesión, retomable con su sesión real (`--resume`) |
| Codex | `~/.codex/sessions/AAAA/MM/DD/rollout-*.jsonl` (o `$CODEX_HOME`) | Una conversación por sesión, retomable con su sesión real (`exec resume`) |
| Hermes y Hermes Desktop | `~/.hermes/state.db` y `~/.hermes/profiles/<perfil>/state.db` (o `$HERMES_HOME`; en Windows también `%LOCALAPPDATA%\hermes`) | Una conversación por sesión, para leer y seguir con lo hablado como contexto |

- Se agrupa **por carpeta de trabajo**: cada carpeta pasa a ser un proyecto de kywai **con esa carpeta** (si ya tienes
  un proyecto que trabaja en ella, se usa ese; la etiqueta «→ nombre» lo dice). De entrada va marcado todo lo que no se
  importó; se puede elegir por programa, por carpeta o conversación a conversación.
- Se trae lo que escribiste y lo que respondió el agente. Lo que hizo con las herramientas queda resumido en una línea
  al final de su respuesta (`🔧 Read · Edit ×2`); los resultados de las herramientas, los sub-agentes y los avisos
  internos del programa no se traen.
- **Seguir donde lo dejaste**: si tu equipo de kywai tiene un agente de ese programa (Claude o Codex) y el proyecto
  trabaja en la misma carpeta, la conversación lleva la sesión del programa. Al pedir una continuación («sigue con…»)
  el agente vuelve a **su sesión real**, con todo lo que leyó y decidió, aunque tenga más de 14 días (el límite normal
  de las sesiones de kywai no se aplica a las importadas). Sin ese agente, o si la carpeta ya no existe («solo
  lectura»), la conversación se lee igual y al seguirla el coordinador recibe lo hablado como contexto.
- **Solo lo que empezaste tú**: no salen los encargos que el propio kywai da a Claude, Codex y Hermes (empiezan por
  «Eres …, parte de un equipo de agentes» o «… el coordinador», o se hicieron en la carpeta de datos de kywai, aunque
  el proyecto ya se borrara), ni las sesiones de Claude manejadas a distancia por un proyecto (empiezan con «<wake …>»),
  ni las revisiones automáticas de permisos de Codex, ni las pruebas de «Responde solo: ok».
- **App Claude de escritorio**: sus sesiones de código son de Claude Code. Se usa el **título** que les puso la app y
  la **carpeta que elegiste** (su índice `claude-code-sessions/` en `~/Library/Application Support/Claude`,
  `%APPDATA%\Claude` o `~/.config/Claude`); las que borraste en la app no salen y las hechas sin carpeta («scratch-…»)
  van a «Claude Code». Los **chats normales** de la app Claude y de Claude.ai no se guardan en el ordenador (están en
  tu cuenta): se traen con la exportación de Claude.ai, en «Desde un archivo».
- Se busca en el **servidor**: las sesiones que hiciste en otro ordenador (por ejemplo el PC cliente) no salen todavía.
- Una sesión hecha en tu carpeta personal entera, o sin carpeta (Hermes por Telegram, Discord…), va a un proyecto con
  el nombre de la app («Hermes», «Claude Code»…) con carpeta interna: kywai no da acceso a la carpeta personal completa.
- **Hermes** (y **Hermes Desktop**, que usa la misma base): se lee la base SQLite de Hermes solo para leer, con el
  SQLite que trae la app (sin instalar nada). Cuando Hermes compacta una conversación larga y la sigue en otra sesión,
  se juntan en una. No se traen los encargos que kywai le hace a Hermes (empiezan por «Eres Hermes, el coordinador…»
  o «… parte de un equipo de agentes…» y ya están en tus chats), ni lo que trabajó en la carpeta interna de un
  proyecto de kywai, ni las sesiones ocultas en Hermes. Hermes Desktop no tiene proyectos (solo perfiles), así que no
  hay proyectos que traer. De momento la sesión de Hermes no se retoma (kywai lanza Hermes de una vez); al seguirla, el
  coordinador recibe lo hablado como contexto.

**Desde un archivo** importa la exportación de **ChatGPT** (Ajustes → Controles de datos → Exportar datos) o de
**Claude.ai** (Ajustes → Privacidad → Exportar datos): el zip que llega por correo tal cual, o solo su
`conversations.json`. Desde el navegador o el cliente se sube entero al servidor (hasta 8 GB por archivo) y se borra al acabar.

Claude.ai manda ahora la exportación **partida**: un `manifest-….json` y varios zips (`conversations-000.zip`,
`projects-000.zip`, `memories-000.zip`, `design_chats-000.zip`, `frames-000.zip`, `claude_code_cloud-000.zip`,
`light_metadata-000.zip`). Se pueden **elegir todos a la vez** (el selector admite varios), elegir solo
`conversations-000.zip` (y `projects-000.zip` para los proyectos), o, en la app del servidor, elegir el manifiesto con
los zips en la misma carpeta. Las conversaciones pueden venir en un `conversations.json` o una por archivo; los demás
zips (memorias, diseños, sesiones de Claude Code en la nube) de momento no se importan. Si el formato cambia y no se
reconoce, el error dice los nombres de los campos que trae, para poder añadirlo. El manifiesto lleva enlaces privados
de descarga: kywai no los usa ni los guarda.

Cada JSON o entrada descomprimida tiene un límite de 256 MB, y el directorio del ZIP, 32 MB y 100.000 entradas. Los tamaños y posiciones inválidos se rechazan antes de reservar memoria; la descompresión también tiene límite. Si se supera, divide la exportación. [Claude confirma](https://support.claude.com/en/articles/9450526-export-your-claude-data) que su exportación no incluye los archivos originales subidos: solo se recupera lo presente en el archivo. Los historiales de Gemini/Takeout todavía no se importan.

- **ChatGPT**: todas las conversaciones van a un proyecto «ChatGPT», con su título, sus fechas y la rama que se veía en
  la app (las respuestas regeneradas que descartaste no). Las **imágenes** que adjuntaste se copian a los adjuntos del
  proyecto. Las llamadas internas a herramientas (Python, navegador) no se traen. La exportación no dice el nombre de los
  proyectos de ChatGPT, así que no se separan por proyecto.
- **Claude.ai**: cada proyecto de Claude.ai pasa a un proyecto de kywai con su nombre, sus **instrucciones** (en la
  memoria del proyecto) y sus **documentos** (en `documentos/`, visibles en Resultados y para los agentes). El proyecto
  de ejemplo de Anthropic no se trae. Un proyecto sin instrucciones, sin documentos y sin conversaciones no se crea
  (saldría vacío).
  - **A qué proyecto va cada conversación.** La exportación de Claude.ai **no dice** en qué proyecto estaba cada chat
    (las conversaciones solo traen `uuid`, `name`, `summary`, fechas y mensajes). kywai lo deduce: el nombre del
    proyecto en el título o el resumen («por el nombre») o que la conversación cite los documentos del proyecto («por
    sus documentos»). Solo si un proyecto gana claro; si empatan o no hay pista, la conversación queda suelta en el
    proyecto «Claude.ai». Antes de importar, la ventana enseña la lista agrupada por proyecto con un desplegable en
    cada conversación para cambiarlo.
  - **Mensajes limpios.** Solo la rama que quedó (las respuestas regeneradas y los mensajes editados que cuelgan del
    mismo mensaje no se mezclan; se sigue hacia atrás desde el último mensaje). Sin la línea de herramientas
    («Write ×2 · Bash…») ni el razonamiento interno.
  - **Archivos.** Los adjuntos que traen su texto (`extracted_content`) y los archivos que **creó Claude** en la
    conversación (`create_file`/`Write`, con sus cambios `str_replace`, y entregados con `present_files`) se guardan en
    los adjuntos del proyecto y se abren desde el mensaje. Las imágenes y archivos subidos no vienen en la exportación:
    de ellos queda solo el nombre, una vez por mensaje y sin repetir (_📎 nombre_).
  - **Reimportar para ordenar.** Elegir otra vez los mismos zips no duplica: las conversaciones importadas con una
    versión anterior (se apunta en `importados.json` con `v`) se vuelven a escribir limpias en su proyecto (la vieja va
    a `conversaciones/borradas/`). Si ya escribiste en una, no se reescribe: solo se mueve a su proyecto. Si la moviste
    tú a mano, se queda donde la pusiste. Después, el proyecto «Claude.ai» y los proyectos que creó la importación y
    quedaron sin nada (sin conversaciones, instrucciones, documentos, tareas ni carpeta) van a la Papelera.
  - Las conversaciones de Claude.ai vacías (sin ningún texto) no se traen.
- En la barra lateral, el chat vacío de un proyecto («Conversación nueva») solo sale si es el que tienes abierto.
- Las respuestas se ven con el nombre de la app de la que vienen («ChatGPT», «Claude.ai»), no con un robot de tu
  equipo. En la barra lateral, al pasar por encima de una conversación, dice «Importada de …».

Motor: `src/main/importChats.ts` (lectores de cada formato, un lector de zip que no carga el archivo entero y la
conversión a conversaciones con `addImportedConversation` de `conversations.ts`; `previewArchive` lee la exportación sin
importar para revisarla, `guessClaudeProject` deduce el proyecto); ventana: `ui/sidebar/ImportDialog.tsx`.
Faltan, para otra fase: retomar la sesión real de Hermes (`hermes --resume <id>`), Gemini CLI / Antigravity, Qwen Code y OpenCode, traer las sesiones del PC de un cliente y
Órbita.

### Eliminar un proyecto

En el selector de proyectos (arriba, junto al nombre), la papelera de cada proyecto lo elimina tras confirmarlo:
su chat, tareas, adjuntos, resultados, historial, memoria y registros de pasos van a la **Papelera de ese equipo**
(si no se puede, se borran del todo). Si el proyecto trabajaba en una carpeta tuya, esa carpeta no se toca: solo
se borra la subcarpeta `.ai-cowork` que creó la app dentro. No se puede eliminar un proyecto con trabajo en marcha
(detenlo antes). Si era el abierto, la app pasa al más reciente; si era el último, crea «Mi primer proyecto».

### Cuotas

La barra sigue al equipo activo: al añadir, quitar, activar o desactivar un agente, sus indicadores se actualizan
al momento en el escritorio, el navegador y los clientes. Los agentes ya añadidos también reciben un indicador
al actualizar la app. Los que comparten una cuota mantienen un único indicador y aparecen juntos en su detalle.
Los agentes del catálogo, los personalizados y Hermes tienen un grupo propio si no estaban vinculados a otro.
Si su programa no informa del límite, se muestra **N/D** (o los usos registrados de hoy), y puedes configurar un
presupuesto para estimarlo. No se deduce una cuota ilimitada por ser un agente gratuito. Si los indicadores no
caben en la cabecera, la fila se puede desplazar horizontalmente.

| Indicador | Fuente |
|---|---|
| GPT (Codex) | **Dato real**: se pregunta a Codex al abrir la app y cada 5 min (su `app-server`, no gasta uso), y tras cada tarea |
| Claude | **Dato real**: se pregunta a Claude Code con `/usage` al abrir la app y cada 5 min (no llama al modelo ni gasta uso), y tras cada tarea |
| Gemini | Con clave de API, Google no informa la cuota: se muestran los usos de hoy («3 hoy»), o una estimación si configuras un presupuesto (clic en el indicador) |
| Local | Sin cuota (ejecución en tu PC) |

⚙ → Ajustes → «Actualizar cuotas», o escribir `/usage` (también `/uso` o `/cuotas`) en el chat, las vuelve a consultar en el
momento; `/usage` las muestra bajo el cuadro de texto y no crea ninguna tarea para los agentes.

Los umbrales (advertencia ≤ 20 %, alerta < 10 %) se cambian en `workspace/config.json`.

### Consumo: ¿compensa?

Cada petición queda registrada con lo que costó: tokens de cada llamada a un agente (planificar y cada tarea, con
entrada, salida y la parte leída de caché), cuánto tardó, si salió bien y cuánto se movió la cuota de Claude y GPT
(se mide antes y después). Se ve en dos sitios:

- Bajo cada plan del chat: «14 min · 339 k tokens · Claude 5 h +5 % · GPT semana +2 %».
- ⚙ → **«Uso y coste…»** (antes «Consumo y tokens…»): totales de hoy, 7 o 30 días (peticiones, tiempo real y tiempo de agentes en
  paralelo, tokens, qué parte se fue en planificar y en intentos fallidos), cuota gastada de cada suscripción,
  reparto por agente y el detalle de cada petición. Se puede exportar a CSV.

Para comparar con un solo agente (por ejemplo Codex aparte), haz la misma petición allí y compárala con su fila
(en Codex, `/status` da los tokens). Hermes no informa sus tokens. El registro se guarda en
`usage-runs.json`, dentro de la carpeta de datos, y lleva también tu 👍/👎 de cada resultado (ver
[Valorar un resultado](#valorar-un-resultado-)): así se puede comparar no solo lo que costó, sino lo que sirvió.

### Uso y coste: dinero por agente

El mismo panel (⚙ → **«Uso y coste…»**) dice también cuánto dinero supone lo que haces, para cada agente:

- **Pagado por uso**: lo que pagaste en el periodo por los agentes que van **por API** (pagas lo que gastas).
- **A precios de API**: lo que valdría todo lo usado si lo pagaras por API, también lo de tus suscripciones. Lo que
  sale de tokens estimados lleva «≈» (Hermes, ver abajo) y se avisa de las llamadas que no tienen precio.
- **Presupuesto del mes** (si lo pones): lo pagado por API desde el día 1, con su barra. Al llegar al **80 %** sale un
  aviso en **«Te necesita»** (escritorio, web y Órbita) y otro al **pasarlo**; cada uno una vez al mes. No para a
  los agentes: solo avisa.
- **Gráfico por día** (7 días, 30 días o todo; como mucho los últimos 30 días): la barra es lo que valió a precios de
  API y la parte naranja lo que pagaste por uso.
- **¿Te compensan tus suscripciones?**: para cada suscripción con precio, compara lo que pagas al mes con lo que
  habría costado por API lo que hiciste con ella en los **últimos 30 días** (sea cual sea el periodo elegido), y
  cuánto te sale cada petición. Solo cuenta lo hecho desde kywai: si usas la misma cuenta en otros sitios, te rinde
  más de lo que sale.
- En **«Por agente»** hay dos columnas más: cómo pagas ese agente y su coste a precios de API. En el detalle de cada
  petición, el coste de cada paso (con «≈» si es estimado y «—» si no tiene precio). El CSV lleva `coste_api_usd` y
  `coste_origen` (cli, tabla, estimado, gratis o sin_precio).

**Cómo pagas cada agente, precios y presupuesto** (desplegable al final de la sección «Coste»):

- **Moneda**: euros o dólares; con euros, cuántos euros es 1 $ (0,87 de fábrica; cámbialo si quieres el cambio del
  día). Los precios de API van en dólares y se convierten.
- **Cómo pagas**: una línea por suscripción (los grupos de cuota: Claude, GPT, Gemini, Muse, Local) y por cada agente
  suelto (Hermes y los de catálogo). Suscripción (con su precio al mes), pago por uso (API), gratis o en tu equipo.
  Una suscripción vale para todos los agentes de su grupo, también sus becarios. Lo local ya sale «En tu equipo» y
  un agente con un modelo gratis (Kilo con `kilo/…/free`, OpenRouter `…:free`) sale «Gratis». Los agentes sin indicar
  cuentan a precios de API, pero no como pagado.
- **Presupuesto al mes por API** (vacío: sin límite).
- **Precios por millón de tokens (en dólares)**: entrada, entrada leída de caché y salida de cada modelo. Vienen los
  oficiales comprobados el 7 nov 2026 (Claude, GPT y Gemini); los que salen de una fuente no oficial o son de
  promoción lo dicen al lado. Se pueden cambiar (el cambiado sale en otro color, con «Original» para volver) y
  añadir otros modelos por su nombre o parte de él («deepseek» vale para «deepseek-v4-chat»). Los alias de Claude
  Code (opus, sonnet, haiku, fable) son el modelo actual. Sin modelo elegido se usa el de fábrica del CLI (Codex:
  GPT-6.1 Sol; Gemini: 3.8 Flash).

De dónde sale cada cifra:

| Agente | Coste |
|---|---|
| Claude Code | **Dato real**: lo dice el propio Claude Code al terminar (`total_cost_usd`, a precios de API también con suscripción) |
| Codex, Gemini, Qwen | Sus tokens × la tabla de precios |
| Hermes, Muse y los de catálogo | No dicen sus tokens: se **estiman** por la longitud del encargo y de la respuesta (unos 4 caracteres por token) × la tabla. Es un mínimo: no cuenta lo que el agente leyó o pensó por dentro |
| Ollama, LM Studio, Colibri, modelos gratis | 0 |

**En Órbita**, el panel **«Uso y coste»** (antes «Consumo») enseña lo mismo de los últimos 30 días arriba del
todo: pagado por uso y a precios de API, el presupuesto del mes con su barra y si compensa cada suscripción; y en
«Por agente», debajo de los tokens, su coste a precios de API. Lo que pagas y los precios se cambian en el
escritorio o la web. La API móvil lo da en `GET /usage/cost` y en `usage.cost` de la instantánea (ver
[docs/mobile-api](mobile-api/README.md)).

Se guarda en `config.json` (`costs`) y en cada llamada del registro (`costUsd` del CLI y, si no dio tokens,
`estInput`/`estOutput`). Las peticiones de antes de esta versión salen con el coste calculado con la tabla (las de
Claude, sin su dato real).

### Cómo rinde cada agente

⚙ → **«Cómo rinde cada agente…»** (también desde el enlace «¿Y la calidad?» de «Uso y coste…») enseña, para
cada agente, por dificultad (difíciles, normales y fáciles, la que pone el coordinador a cada tarea) y **por tipo de
tarea** (imágenes y piezas visuales, webs e interfaces, código y scripts, textos y documentos, investigar y
analizar; kywai lo deduce del título y la descripción de cada tarea, también de las antiguas), en los últimos 7 o
30 días o en todo el registro, y si quieres solo del proyecto abierto:

| Columna | Qué cuenta |
|---|---|
| Tareas | Tareas en las que trabajó. Una tarea con varios intentos suyos o con una corrección cuenta una vez; lo que hacen sus becarios cuenta para él |
| Le sirvió 👍 | De las que [valoraste](#valorar-un-resultado-), cuántas con 👍. La valoración es de quien terminó la tarea, no de quien falló antes |
| Verificada a la primera | De las que comprobó [otro agente](#verificación-por-otro-agente), cuántas cumplían en el primer veredicto |
| Necesitó corrección | De las comprobadas, cuántas tuvo que corregir porque el verificador vio fallos |
| Aprobada tras corregir | De las comprobadas, las que tuvieron fallos y acabaron con «CUMPLE» tras sus correcciones |
| Sin superar la revisión | De las comprobadas, las que acabaron con fallos en su trabajo: se pasaron a otro agente o requieren intervención |
| Sin verificar | De todas, las que el verificador no aprobó ni suspendió (no dio veredicto ni al pedírselo otra vez). No cuentan en las tres columnas de arriba |
| Falló o pasó a otro | No pudo hacerla (error, sin cuota…) y la terminó otro agente o se dio por fallida. Una tarea «BLOQUEADA» (le faltaba algo) no cuenta aquí |
| Tiempo y tokens (mediana) | Lo que suele tardar y gastar en una tarea, con su corrección incluida. «—» si no informa de tokens (Hermes, Muse, agentes de catálogo) |

Cada cifra lleva su base («7 de 9»), y en rojo lo que conviene mirar (le sirvió menos del 60 %, corrigió el 40 % o
más, falló, no superó la revisión o quedó sin verificar el 20 % o más). Con menos de 5 tareas pone «pocos datos». En el móvil (navegador), cada agente y cada
dificultad se ven como una tarjeta, sin tabla que desplazar. Las tareas que detienes no cuentan.

**El coordinador lo usa al repartir.** Cuando un agente tiene 5 tareas o más en 30 días, su ficha lleva una línea
como «calidad (30 días, 12 tareas): le sirvieron al usuario 7 de 9 valoradas; verificación: 6 de 8 a la primera, 2
necesitaron corrección (1 aprobada después), 1 sin superar la revisión; 1 sin verificar; 1 falló o pasó a otro (8 %); mediana unos 4 min y 120 k tokens por tarea», y por dificultad
las filas que se apartan del total. Se le pide que, entre los que pueden hacer la tarea, elija al de mejor calidad
en esa dificultad aunque tarde o gaste más: la calidad pesa más que la velocidad y el coste; la cuota y estar libre
deciden solo entre agentes parecidos.

**Mala racha: kywai no repite con quien casi siempre suspende.** Si en los últimos 14 días un agente hizo 3 tareas o
más y en el 60 % o más acabó sin superar la revisión (tras sus correcciones) o sin poder hacerla, su ficha lleva
«⚠ mala racha: 3 de 3 tareas sin superar la revisión o fallidas en 14 días» (aunque tenga menos de 5 tareas), y lo
que no es fácil que el plan le dé pasa a otro agente. El plan lo dice en «Ajustes de kywai al plan». Corregir y
aprobar no cuenta en contra: solo lo que no llegó a buen puerto. Si lo nombras en la petición («que lo haga
Aider»), se respeta. Los relevos (tras un fallo o tras suspender la revisión) tampoco vuelven nunca a un agente que
ya intentó esa tarea, y prefieren a uno que no esté en mala racha. Así una petición no se alarga con correcciones y
relevos que se veían venir (medido el 8 nov: la mitad de las tareas verificadas repetían, y un agente suspendió 3 de
3).

Sale del mismo registro que «Uso y coste…» (`usage-runs.json`): para ello cada llamada de tarea guarda su
dificultad, cada verificación su veredicto y cada llamada si la detuviste. Los registros de antes de esta versión
no tenían esos datos: sus tareas salen como dificultad «Sin dato», sin verificación, y una llamada que no salió
bien en una petición cancelada se toma como cancelada. La API móvil lo da en `GET /quality` (ver
[mobile-api/README.md](mobile-api/README.md)); Órbita aún no lo enseña.


**Reparto con estos datos.** El coordinador ve en la ficha de cada agente cómo le va en cada tipo de tarea y, con
calidad parecida, elige al que tiene **más cuota libre** (salvo que el otro sea muchas veces más rápido). kywai lo
comprueba después del plan: si otro agente tiene al menos 3 tareas verificadas de ese tipo, un % a la primera a
menos de 15 puntos, no más fallidas, no tarda más del doble y le quedan al menos 25 puntos más de cuota, la tarea
pasa a él y el plan dice por qué. Si lo nombras tú, se respeta. Sin datos suficientes no se cambia nada.

### Dónde se guardan las cosas

- `workspace/config.json`: agentes (nombre, modelo, color, estación, apariencia del robot), estaciones,
  grupos de cuota, umbrales y orden del planificador.
- `workspace/projects/<proyecto>/`: `attachments/` (tus archivos), `artifacts/` (lo que crean los agentes) y
  `project.json` (chat, tareas, historial, memoria y rutinas).
- `workspace/traces/<tarea>.json`: lo que hizo el agente en cada tarea, paso a paso (30 días).
- `workspace/usage-runs.json`: consumo de cada petición.
- `workspace/agent-sessions/<proyecto>.json`: última sesión de CLI de cada agente en el proyecto (para retomarla).
- `workspace/web-cert/`: certificado propio de la versión HTTPS del acceso web.

## Comodidades

### Un chat que se lee bien

El chat se lee como ChatGPT o Claude, sin «muro de letras»:

- **La respuesta de un agente va sin caja:** el texto suelto, junto a su avatar. Tus mensajes siguen en su burbuja, y
  los errores en su caja roja para que no pasen desapercibidos.
- **Letra e interlineado:** 15 px con interlineado 1,7 en el escritorio y la web (antes 14 px y 1,55). En Órbita el
  interlineado pasa a 1,55 veces la letra.
- **Todo el ancho:** el texto de las respuestas ocupa todo el ancho del chat, igual que tus mensajes y las tarjetas
  (antes se cortaba en unos 72 caracteres y dejaba un hueco vacío a la derecha). Si ensanchas la ventana o el chat,
  las líneas se alargan con él.
- **Letra más grande o más pequeña (Ctrl + rueda):** con el ratón encima del chat, mantén **Ctrl** y gira la rueda
  hacia arriba para agrandar o hacia abajo para achicar, de 10 en 10 %, entre el 50 % y el 200 %. Arriba a la
  derecha sale un momento el porcentaje («130 %»); pulsarlo vuelve al 100 %, el tamaño de siempre. Solo cambia el
  chat, no el resto de la ventana, y cada equipo o navegador recuerda el suyo. En el Mac vale también pellizcar en el
  trackpad.
- **Aire:** 16 px entre párrafos, más antes de cada título y entre un mensaje y el siguiente. Los puntos de una lista
  van separados (10 px), con el número en negrita, para que se vean como pasos. Tablas y bloques de código llevan
  más margen.
- **Órbita** mantiene la tarjeta de la respuesta (encima del 3D hace falta contraste), pero con más margen dentro y el
  mismo reparto de aire entre párrafos, títulos y puntos.
- **Cómo escriben:** a Hermes (su respuesta y el resumen final de cada petición) y a cada agente se les pide que
  empiecen por el resultado, con párrafos de 2 o 3 frases, listas para pasos y opciones, negrita solo en lo
  importante y títulos solo si la respuesta es larga. Para citar una parte de un documento dicen «apartado 3.1»
  o su título, nunca «§3.1». Los mensajes directos («@Agente …») no se tocan.
- **Baja solo:** si estás al final, el chat sigue lo que van escribiendo los agentes, aunque llegue de golpe un bloque
  alto (una tabla, una lista). Solo se queda quieto, con el botón «Nuevos mensajes», si subes tú a leer algo.

Para desarrolladores: el tamaño, el interlineado y el aire del Markdown son variables CSS (`--md-size`, `--md-lh`,
`--md-gap`, `--md-li-gap` en `MarkdownView.module.css`) que el chat sube en `.agentBubble` (`Messages.module.css`);
fichas de tareas, memoria y documentos se quedan con 14 px. Órbita: `gapBefore` en `ui/orbita/Markdown.kt`. La guía de
estilo es `CHAT_STYLE` en `src/main/coordinatorGuide.ts` (va en el prompt de Hermes, en las reglas de cada tarea y en la
respuesta final). El zoom del chat: `chatZoom.ts` (se guarda en `ai-cowork.chatZoom`) y `ChatView.tsx`, que lo aplica
con `zoom` de CSS a la lista de mensajes y captura Ctrl + rueda para que no amplíe toda la ventana.

### Copiar código y comandos con un clic

Cada **bloque de código o de comandos** que escribe un agente (los que van en recuadro oscuro) lleva un **botón de
copiar en la esquina de arriba a la derecha**, como en Claude y ChatGPT. Un clic copia el bloque entero tal cual
(sin el formato y sin el salto de línea del final), aunque sea más largo que el recuadro y haya que desplazarlo de
lado; el botón se queda fijo en su esquina. Al copiar, el icono pasa a ✓ «Copiado» un momento.

Sale en todas partes donde se ve Markdown: el chat, el panel de vista previa de un documento, las fichas de tareas y
los planes, en el escritorio, en el cliente y en el navegador (también por http desde el móvil, donde se copia con el
método antiguo del navegador). En **Órbita** cada bloque de código del chat lleva el mismo botón: un toque lo copia.
El código suelto dentro de una frase (`` `ls` ``) no lleva botón: se copia seleccionándolo, como siempre.

**El código siempre en su propia tarjeta.** Hermes y los agentes tienen la orden de poner todo lo que haya que copiar y
pegar (código, órdenes de terminal, JSON, una política de AWS, configuración…) en su propio bloque, aunque sea una línea,
nunca suelto en una frase. Y si aun así un agente deja un JSON suelto en un punto de la lista («pega esto: { "Action":
"\*" … }»), el chat lo saca solo a una tarjeta con su botón de copiar, ordenado en varias líneas y dentro del mismo
punto. Antes el Markdown se comía sus `*` como cursiva y al copiarlo salía roto. Solo se mueve el JSON válido: un enlace,
una casilla `[ ]`, una `{plantilla}` o lo que ya va entre comillas invertidas se quedan como estaban. En Órbita todavía
no: allí depende de que el agente lo escriba en bloque.

Por debajo: el componente `pre` de `MarkdownView.tsx` (`CodeBlock`), `fenceLooseJson` de `src/shared/looseCode.ts` (saca el
JSON suelto a un bloque ```json antes de pintar; la orden a los agentes está en `CHAT_STYLE` de `coordinatorGuide.ts`) y la función común `copyText` de
`src/renderer/src/lib/clipboard.ts` (la usan también las rutinas). En Órbita, `CodeBlock` en `ui/orbita/Markdown.kt`.

### Ver los archivos del chat sin salir de kywai (panel de vista previa)

Al pulsar un archivo en el chat se abre **dentro de kywai**, en un panel a la derecha del chat (en el sitio del
espacio 3D), como en Claude. Sirve para todo lo que aparece en la conversación:

- tus **adjuntos** (y los de la pestaña Archivos);
- los **entregables** de un agente (la ficha del resultado o la carpeta con varios, y la pestaña Resultados);
- los archivos que un agente **crea o abre mientras trabaja** (las miniaturas y fichas de su tarjeta de trabajo);
- un **nombre de archivo escrito entre comillas de código** en un mensaje (por ejemplo `` `00_LEEME.md` ``), si es un
  archivo del proyecto: sale subrayado y se abre al pulsarlo;
- los **enlaces e imágenes** de un mensaje que apuntan a archivos del proyecto.

Arriba del panel:

- **👁 / `</>`:** en Markdown, HTML y SVG, cambia entre la vista bonita y el código (con números de línea).
- **Copiar:** copia el texto (o la imagen, como PNG).
- **Descargar:** guarda una copia donde elijas (en el navegador, en la carpeta de descargas de ese dispositivo).
- **Abrir con la aplicación del equipo:** lo de antes; en un cliente, con una aplicación de ese equipo; en el
  navegador, en otra pestaña.
- **Ampliar:** el panel ocupa toda la ventana (otra vez para reducirlo). **Esc** o la **✕** lo cierran.
- **‹ 1 de 3 ›:** pasa a los demás archivos del mismo mensaje (o de la misma carpeta). También con las flechas
  izquierda y derecha del teclado.

Qué se ve en el panel: Markdown renderizado, imágenes (un clic las pone a tamaño real), páginas HTML funcionando
(aisladas: no pueden usar la sesión de kywai), PDF con el visor del navegador, vídeo y audio con su reproductor, y
código o texto con números de línea. Lo demás muestra «Vista previa no disponible» con el botón **Abrir con…**.

**Documentos de oficina, sin nube:** los archivos de Office y similares se pintan dentro de kywai, en el propio
equipo, sin subirlos a ningún sitio ni tener Office instalado (y también desde un cliente o el navegador):

- **Word** (`.docx`, `.docm`, `.dotx`): con sus páginas, estilos, tablas, imágenes, encabezados, pies y notas. Si la
  página es más ancha que el panel, se encoge para que quepa. Lo pinta `docx-preview` dentro de una caja aislada
  (Shadow DOM), así los estilos del documento no cambian kywai; los enlaces se abren en el navegador del equipo.
- **Excel y hojas de cálculo** (`.xlsx`, `.xlsm`, `.xlsb`, `.xls` antiguo, `.ods` de LibreOffice, `.numbers` de Mac):
  una tabla con las letras de las columnas y los números de fila (fijos al desplazarte), los valores como los formatea
  el archivo (moneda, decimales, fechas), las celdas combinadas y el ancho de las columnas, y abajo una **pestaña por
  hoja** (las ocultas no salen). Si una fórmula no tiene resultado guardado, se ve la fórmula. Se pintan hasta 2.000
  filas y 120 columnas; si hay más, lo dice. Lo lee SheetJS (la versión de su web, `cdn.sheetjs.com`: la de npm está
  abandonada y tiene fallos de seguridad).
- **CSV y TSV:** como tabla, con el interruptor **👁 / `</>`** para ver el texto. Se lee tal cual: «007» sigue siendo
  «007» y no se convierte en número ni en fecha.
- **PowerPoint** (`.pptx`, `.ppsx`, `.potx`): las diapositivas una debajo de otra, del ancho del panel y numeradas, con
  su fondo, textos (tamaños, colores, negritas, viñetas y números), formas (también las dibujadas a mano), imágenes
  recortadas, líneas, grupos y tablas, y lo fijo del patrón y del diseño (logos, franjas). Las diapositivas ocultas
  salen marcadas. Los gráficos, SmartArt y vídeos salen como un recuadro con su nombre («solo se ve en PowerPoint»).
  Lo lee kywai mismo (`viewers/pptx.ts`, sin librerías: el archivo es un zip con XML) y lo pinta `SlidesView`.
- **LibreOffice** (`.odt` texto, `.odp` presentación, `.odg` dibujo): el texto con sus títulos, negritas, colores,
  listas, tablas e imágenes, como una hoja de papel; las presentaciones, una tarjeta por diapositiva con su título,
  textos e imágenes (sin su diseño). Las hojas `.ods` van con Excel, arriba.
- **RTF** (`.rtf`): el texto con sus párrafos, alineación, negritas, cursivas y acentos.
- **Libros ePub** (`.epub`): el libro entero en una página, capítulo tras capítulo y con sus imágenes. Lo que traiga el
  libro que pueda ejecutarse (scripts, formularios, enlaces `javascript:`) se quita.
- **Pages y Keynote** (Mac): la vista previa que guardan dentro (la imagen o el PDF de la primera página); para ver el
  resto, **Abrir con…**.
- **Modelos 3D** (`.glb`, `.gltf`, `.obj`, `.stl`, `.ply`, `.fbx`, `.3mf`): con luz y suelo de referencia; se giran
  arrastrando, se acercan con la rueda y se mueven con el botón derecho. Si el modelo trae animación, se reproduce.
- **Comprimidos** (`.zip`, `.jar`, `.apk`, `.whl`…): la lista de lo que llevan, como árbol de carpetas, con el tamaño de
  cada archivo y el total sin comprimir (no se descomprime nada).
- **Letras** (`.ttf`, `.otf`, `.woff`, `.woff2`): el alfabeto, los números y una frase de muestra en varios tamaños.
- **Cuadernos de Jupyter** (`.ipynb`): las celdas de texto y de código con sus resultados (texto, gráficos y errores);
  con **👁 / `</>`** se ve el JSON.
- **Más texto y código:** subtítulos (`.srt`, `.vtt`), GraphQL, Terraform, Nix, Scala, Elixir, Haskell, parches
  (`.diff`)… salen como código con números de línea; cualquier otro archivo que sea texto, también.
- **Lo demás de oficina, con LibreOffice:** Word y PowerPoint antiguos (`.doc`, `.ppt`, `.pps`), Publisher (`.pub`),
  Visio (`.vsd`, `.vsdx`), WordPerfect (`.wpd`), Works (`.wps`), dibujos `.emf`/`.wmf`/`.cdr`, imágenes `.tif` y `.xps`.
  Si el equipo donde corre kywai (el servidor) tiene **LibreOffice** instalado, kywai lo usa por debajo, sin abrir su
  ventana ni subir nada, para convertir el archivo a PDF y enseñarlo en el panel. La primera vez tarda unos segundos;
  luego sale al momento (se guarda en caché hasta que el archivo cambie). Si no está instalado, el panel lo dice con un
  botón **Descargar LibreOffice** (es gratis).

Con la ventana estrecha (menos de 950 px) el panel ocupa toda la zona del chat. Al cambiar de proyecto se cierra.

**Miniaturas:** las **imágenes que adjuntas** se ven en pequeño dentro de tu mensaje (una sola, más grande; varias, en
cuadrícula). Si una no se puede cargar (se borró del disco), vuelve a ser una ficha con su nombre.

Por debajo: el panel lee el archivo con `readArtifact` (con `{ text: true }` para ver el código de un HTML o un SVG) y
lo muestra por `cowork://file/…` en el escritorio o por `/api/file/…` en el cliente y el navegador. `/api/file/…`
admite peticiones por partes (para adelantar vídeos) y sirve los PDF sin el `sandbox` que se pone a lo demás (el
visor de PDF del navegador no abre dentro de uno). «Descargar» usa `downloadFile` (diálogo de guardar en el
escritorio; enlace de descarga en la web). La ventana de Electron tiene activado el visor de PDF (`plugins`).
Los visores de documentos (`src/renderer/src/ui/preview/viewers/`) leen el archivo entero por esa misma dirección
(hasta 80 MB; más grande, «Abrir con…») y se cargan la primera vez que hacen falta, para no hacer más lenta la app.
Como los PDF y las imágenes, no pasan por el tapado de secretos (este solo se aplica a lo que se lee como texto).
Los CSV y los cuadernos de Jupyter sí se leen como texto (y pasan por el tapado).

La conversión con LibreOffice está en `src/main/officePreview.ts`: busca `soffice` donde se instala en cada sistema
(en Mac, `/Applications/LibreOffice.app`) y en el PATH, convierte de uno en uno con un perfil propio (funciona aunque
LibreOffice esté abierto) y guarda los PDF en `vista-previa/` dentro de la carpeta de datos de la app (los 60 últimos).
`readArtifact(…, { pdf: true })` devuelve `cowork://preview/<clave>.pdf` (en un cliente o el navegador,
`/api/preview/<clave>.pdf`); sin LibreOffice lanza `NO_LIBREOFFICE`.

**En Órbita (móvil):** tus adjuntos del chat también salen en miniatura (las imágenes) o como fichas, y al tocarlos se
abren en el lector a pantalla completa. El lector tiene **‹ 1 de 3 ›** para pasar a los demás archivos del mensaje
(adjuntos, entregables o archivos de la tarea), **Vista previa / Código** en Markdown, HTML y SVG, **copiar** el
texto, **guardar en el móvil** y **abrir con otra app** del móvil (visor de PDF, galería…).

### Ancho del chat y ventanas pequeñas

El chat es lo importante; el espacio 3D es el escenario. Por eso, cuanto más pequeña es la ventana, más sitio se lleva
el chat:

- **Pantalla grande:** el chat ocupa alrededor del 30 % (entre 380 y 640 px) y el 3D el resto.
- **Ventana mediana** (menos de 1440 px de ancho, lo normal sin pantalla completa): el chat pasa a un 42 % (entre 400
  y 600 px); por debajo de 1100 px, a algo más de la mitad.
- **Ventana estrecha** (menos de 950 px): el chat ocupa toda la ventana y el 3D pasa a la pestaña **Espacio** de la
  cabecera (los botones **Chat / Espacio**, como en el móvil). El 3D no se pierde: está a un toque.
- **Elegir el ancho a mano:** arrastra el **borde derecho del chat** (al pasar el ratón sale una raya azul). El ancho
  se recuerda en ese equipo al volver a abrir la app; si luego estrechas la ventana, se ajusta solo para dejar al 3D
  al menos 320 px. **Doble clic** en el borde vuelve al ancho automático. Con el teclado: Tab hasta el borde, flechas
  izquierda/derecha para ensanchar o estrechar e Inicio para volver al automático.
- **Cerrar un lado del todo:** arrastra el borde del chat **casi hasta la derecha** y, al soltar, el espacio 3D se
  oculta y el chat ocupa toda la ventana (mientras arrastras, un aviso dice «Suelta para ocultar el espacio 3D»).
  También con el botón del final de la fila del **Espacio digital** (icono de panel) o, con el foco en el borde, la
  tecla Fin. Para volver a verlo, pulsa la pestaña **Espacio digital** pegada al borde derecho del chat. Se recuerda
  en ese equipo al volver a abrir la app. Con el 3D cerrado, **abrir un archivo** del chat (Abrir, un adjunto, un
  entregable…) vuelve a partir la ventana: chat a la izquierda y el archivo a la derecha. El 3D sigue cerrado y parado;
  al cerrar el archivo, vuelves a tener solo chat. Llevar el borde **casi hasta la izquierda** hace lo contrario: deja solo el
  3D (como el botón de pantalla completa; Escape vuelve).
- **Pestañas de arriba del chat** (Chat, Archivos, Tareas, Resultados, Memoria, Rutinas): si al estrechar el panel
  ya no caben con su nombre, quedan **solo los iconos** (la pestaña abierta conserva su nombre; el nombre de cada una
  sale al pasar el ratón). Si aun así no caben, la fila **se desplaza de izquierda a derecha** con la rueda del ratón
  (también la normal, sin Mayús), con el trackpad o con las flechas **‹ ›** que salen en los bordes; la pestaña
  abierta siempre queda a la vista. Al ensanchar, vuelven los nombres.
- **Cabecera del Espacio digital:** cuando el 3D se queda estrecho, sus botones se compactan (primero el texto de la
  demo y de «Música», luego los nombres de «Modo noche» y «Auto»); el título se recorta con «…» y, si aun así falta
  sitio, queda solo su icono. Nada se monta encima del título.
- **Chat estrecho:** si el panel mide menos de 520 px, el texto de cada mensaje empieza debajo del avatar y usa todo
  el ancho, en vez de dejar libre la columna del avatar.

- **Barra lateral:** ocupa unos 250 px abierta y 58 px plegada; los porcentajes de arriba se reparten en lo que deja.
  **Su ancho se puede cambiar:** arrastra su **borde derecho** (al pasar el ratón sale una raya azul), entre 200 y
  440 px. Llevada casi del todo a la izquierda se **pliega** en su columna de iconos, y desde la columna, arrastrar a
  la derecha la vuelve a abrir (con el ancho que tenía). **Doble clic** en el borde vuelve a los 250 px de siempre.
  Con el teclado: Tab hasta el borde, flechas izquierda/derecha e Inicio. El ancho se recuerda en ese equipo
  (`localStorage` `ai-cowork.sidebarWidth`; el asa es `ui/sidebar/SidebarResizer.tsx`).
- **Controles de la cámara:** vista general, acercar, alejar y pantalla completa flotan en la esquina de abajo a la
  derecha del espacio 3D (ya no hay barra debajo; «Reducir efectos ambientales» está en ⚙ → Ajustes).

Para desarrolladores: los cortes están en `App.module.css` (y `TABS_QUERY` en `ui/left/chatWidth.ts`, que debe
coincidir con el `@media (max-width: 949.98px)`); el asa es `ui/left/ChatResizer.tsx` y el ancho elegido se guarda en
`localStorage` (`ai-cowork.chatWidth`). Cerrar un lado lo decide `dragOutcome` (`ui/left/chatWidth.ts`: al 3D le
quedarían menos de 160 px, o al chat menos de 180); el espacio cerrado es `spaceHidden` en el store y se guarda en
`ai-cowork.spaceHidden`. El panel cerrado sigue montado (la música sigue sonando) pero sin sitio ni visibilidad.

### Idioma

La interfaz está en **español**, **inglés**, **portugués**, **francés** y **chino** (simplificado). ⚙ → **Ajustes…** → General →
**«Idioma · Language»** es una lista con cada idioma en su propio idioma (Español, English, Português, Français,
中文); al elegir otro, la ventana se recarga para que todo salga ya
traducido. Se recuerda en cada dispositivo (a diferencia del tema, que es el mismo en todos): la app del Mac,
el navegador y cada cliente pueden tener el suyo. Si nunca se ha elegido, se usa el idioma del sistema si es uno de
esos cinco (cualquier variante: es-MX cuenta como español, pt-PT como portugués); si no, inglés. Las fechas y los números siguen el idioma elegido.

Se traduce todo lo que pinta la interfaz, incluido el modo Demo. Los comandos del chat funcionan en los dos idiomas
(`/remember …`, `/routine every day at 9:00: …`, `/model`, `/usage`…) y un «yes» / «looks good» aprueba un plan igual
que un «sí».

El idioma también vale para el motor (lo que se elige en Ajustes se guarda en `config.json` como `language`; si
aún no se ha elegido, el del sistema). En cualquier idioma que no sea el español:

- **Hermes y los agentes** contestan en ese idioma: el plan («reply», títulos y criterios de cada tarea), lo que cuentan
  mientras trabajan, el resultado y la respuesta final. Las instrucciones internas que les da kywai siguen en
  español; solo se les pide escribir en el idioma del usuario.
- **Los avisos del motor** salen en ese idioma: los mensajes del chat (plan repartido, verificación, correcciones, relevo,
  «requiere intervención», deshacer), «Te necesita», lo que hace cada agente (paso a paso y actividad), los errores
  de los agentes, la cuota, el asistente de instalación y de sesiones, las rutinas, la actualización, el menú del
  botón derecho y la pantalla de conexión del cliente. El catálogo de agentes y las notas de los modelos, también.
- **El veredicto del verificador** se entiende en español y en inglés: «VEREDICTO: CUMPLE/FALLOS» o «VERDICT:
  PASS/FAIL»; y en «a dos manos», «GANA: A» o «WINNER: A».
- **El dictado** transcribe en el idioma de la app.

Lo que ya estaba escrito (mensajes de antes, tareas guardadas) se queda en el idioma en que se escribió. Los
comandos del chat y la aprobación de planes entienden español e inglés en cualquier idioma de la interfaz.

El portugués, el francés y el chino están traducidos a partir del inglés con IA: conviene que los revise alguien
nativo. Si a un texto le falta la traducción, sale en inglés.

**En Órbita** (el móvil) el idioma se elige aparte: ☰ → Ajustes → General → **«Idioma · Language»**: al tocarlo se despliega la
lista (Del sistema, Español, English, Português, Français, 中文) y se elige uno. «Del sistema» sigue al del teléfono
si es uno de esos cinco; si no, inglés. Al cambiarlo la app se
reinicia sola y sigue emparejada. Cambia los textos de Órbita (pantallas, avisos, notificaciones y el mundo 3D); lo
que escriben Hermes y los agentes sigue el idioma elegido en el ordenador.

Para desarrolladores de Órbita: igual que en el escritorio, `t("Ajustes")` (de `com.aicowork.remote.i18n`) con el
texto en español como clave y las traducciones en `android/app/src/main/kotlin/com/aicowork/remote/i18n/I18nEn.kt` (y `I18nPt.kt`, `I18nFr.kt`,
`I18nZh.kt`);
los huecos van así: `t("Hace {n} min", "n" to 5)`. La prueba `I18nTest` falla si un texto no tiene traducción, si
sobra alguna, si no coinciden los huecos o si el portugués, el francés o el chino no tienen las mismas entradas que el
inglés.

Para desarrolladores: el texto en español del código es la clave. `t('Ajustes')` (de `@/lib/i18n`) devuelve «Ajustes»
en español y lo que diga `src/shared/i18n-en.ts` en inglés (`i18n-pt.ts`, `i18n-fr.ts` e `i18n-zh.ts` para los
demás); los huecos van entre llaves: `t('Hace {n} min', { n })`.
El motor usa lo mismo (`src/shared/i18n.ts`) con el nombre `tr()`, porque allí `t` suele ser una tarea. Cada texto
nuevo que vea el usuario pasa por `t()`/`tr()` y se añade a `i18n-en.ts` y a los otros tres; `lib/i18n.test.ts` falla si a un texto le
falta su traducción, si los otros idiomas no tienen las mismas entradas que el inglés, si una traducción no conserva los `{huecos}` o si queda alguna sin usar (cuentan también las que
se traducen al usarlas, como `t(agente.role)`, si el texto está escrito tal cual en el código). Lo que va a los agentes
(encargos, planes, verificación) no se traduce: para el idioma de su respuesta están `replyLanguage()` y
`userLanguageName()`. No se llama a `tr()` al cargar un módulo (el idioma aún no está fijado): dentro de funciones.

### Temas

**Bordes de cada tema.** Cada mapa y decorado termina con piezas de su propio estilo y con el mismo detalle que el resto, nunca con bloques genéricos: EVA-01 es una sala cerrada (los mismos bancos de servidores del fondo cierran los lados y el muro sigue hacia arriba con una pasarela; el suelo continúa con sus carriles y el borde de la plataforma lleva galones de peligro), Halloween cierra el frente con la verja de forja, una puerta, faroles y lápidas, y Navidad con farolas en las esquinas de delante. El hangar de EVA se amplía si hay puestos fuera de la plataforma. El resto de temas ya llenaba el encuadre con su propio escenario.

**Perspectiva y giro.** La cámara mira al equipo de frente, con una elevación ligera de 18° y un campo de visión de 36°. Las caras de los agentes y la profundidad del espacio quedan visibles. En ventanas estrechas se aleja sin cambiar la inclinación, pero solo lo justo para que quepan los agentes: recorta los lados del escenario en vez de dejarlo pequeño entre franjas vacías (en un panel casi cuadrado se queda un tercio más cerca que antes). Si el panel es más alto que ancho (ventana pequeña o el 3D estrecho a la derecha), la cámara deja de alejarse para enseñar todo el ancho y se encuadra como un panel de 3:4: la escena rellena el alto sin huecos vacíos arriba y abajo, y los agentes de los extremos quedan en el borde (se ven arrastrando, o alejando con la rueda hasta ver a todo el equipo). Al cambiar el tamaño del panel el encuadre se ajusta al momento, y si habías movido la cámara a mano se acerca o aleja en la misma proporción sin volver al encuadre inicial. «Vista general», el cambio de mapa y el enfoque de un agente recuperan esta perspectiva frontal. La niebla se adapta a la distancia de la cámara para no borrar los puestos al alejarse. El giro se limita a unos 25° a cada lado (algo menos en los temas con paredes o arrecife alrededor) y la inclinación va de 10° a 34° desde arriba: cada tema está construido para verse desde delante.

**Límites para acercar y alejar.** Con la rueda o los botones + y − no se puede salir del escenario. Alejarse llega como mucho un 5–10 % más allá de la vista general, así que nunca se ve solo el vacío de los bordes. Acercarse se para en un plano medio del equipo (15 de distancia, 17 en EVA-01 y 20 en los temas grandes: Refugio Kywai, Relicario, Telar y Fondo marino), así que la cámara no se mete en el núcleo ni entre los puestos. La rueda acerca hacia el centro de la vista, no hacia el ratón (eso movía el punto de mira hasta dentro de la escena). Al arrastrar con el botón derecho, el punto al que mira la cámara solo pasea por la zona donde están los agentes. Los límites se calculan en `cameraLimits` (`cameraFraming.ts`) a partir de la vista general de cada tema y tamaño de ventana.

En **Fondo marino**, cada estación conserva una plataforma separada también al añadir agentes. Los puestos adicionales se colocan en espacios libres alrededor del arrecife, sin solapar las plataformas existentes ni cambiar las posiciones guardadas del proyecto. La vista general amplía su encuadre para incluir los nuevos puestos.

**Fondo marino** se elige en **⚙ → Ajustes → General → Mapas**: arrecife con bancos de peces, ballenas, medusas, mantarraya, vegetación y una ciudad sumergida. Las estaciones son plataformas de investigación y el centro es una concha con una perla luminosa; siguen mostrando el estado real de los agentes y los intercambios de archivos. Su distribución es visual: conserva los identificadores y posiciones guardados de las estaciones. **Reducir efectos** detiene los movimientos ambientales y la calidad adaptativa reduce partículas y detalles. El escenario está disponible en escritorio, cliente conectado y navegador; Órbita todavía no dibuja este mundo 3D.

**Relicario, Telar, Halloween y Navidad** conservan sus nombres e identificadores anteriores, pero ahora tienen escenarios completos: santuario con galerías, torres, canales y suelo reflectante; islas de cristal y redes de hilos; patio de una abadía gótica con luna y niebla; y villa nevada con abetos, humo y aurora. Se mantienen las formas del núcleo, los disfraces de fiesta y las acciones habituales del espacio. Las tarjetas del selector muestran sus siluetas y se eligen en **Decorados**.

**Empresa: Oficina.** Un tema sobrio para usar kywai en el trabajo o enseñárselo a un cliente, en
**⚙ → Ajustes → General → Tema → Empresa**. Es una sola tarjeta; el día y la noche se cambian con el interruptor
**Modo noche** de la cabecera del espacio (el mismo del Refugio Kywai). Cada versión tiene su escenario 3D, sus
plataformas, su peana para el núcleo y sus colores de interfaz (`scene/worlds/corporateWorlds.ts`):

- **De día** (`oficina`): planta diáfana con suelo claro pulido y moqueta gris bajo el equipo, muro cortina de vidrio
  al fondo y a la derecha con la ciudad detrás, bancadas de puestos con pantallas encendidas, una pared de listones
  de roble con la pantalla de la empresa, una sala de reuniones de cristal, un rincón con sofá y plantas, y jardineras
  bajas delante. Interfaz blanca y gris acero con un azul de empresa.
- **De noche** (`sede`): planta alta de un rascacielos con piedra oscura pulida, alfombra con cenefa de latón,
  ventanal de suelo a techo con la ciudad iluminada detrás, pared de nogal con estantes iluminados, sala del consejo
  de cristal con mesa larga y sillas de piel, recepción y butacas. Interfaz azul marino con latón suave.

**Auto** (el botón del reloj, junto a «Modo noche»): en la Oficina, la oficina de día se va oscureciendo con la
hora del reloj de este dispositivo. Atardece de 17:00 a 20:30: baja la luz, el cielo y la niebla pasan a casi negro y
se van encendiendo las ventanas de los edificios de enfrente; de 20:30 a 6:00 es de noche y amanece de 6:00 a 8:00. La
interfaz pasa a los colores oscuros cuando ya casi ha anochecido. Para probarlo sin esperar, en el navegador se puede
abrir kywai con `?hora=19:30` (`lib/officeClock.ts`).

Son dos ids de tema, así que el cambio de día a noche se guarda en el servidor y lo siguen los demás dispositivos como
cualquier cambio de tema. Los muebles se quitan solos si un puesto cae encima, y el vidrio es transparente de verdad
(no da sombra). Órbita no tiene el interruptor: muestra «Oficina» y «Oficina · noche» en su lista, con sus colores.

**Modo noche y Auto en todos los temas.** En la cabecera del espacio, junto a Música, los temas tienen el
interruptor **Modo noche** y el botón **Auto** (el del reloj). Con **Auto**, el escenario anochece y amanece poco a poco
con la hora del reloj de ese dispositivo (de 17:00 a 20:30 y de 6:00 a 8:00). Las dos cosas se recuerdan en cada
dispositivo (`aicowork.space.night` y `aicowork.oficina.auto`), y tocar «Modo noche» con Auto encendido vuelve al modo
manual. La Oficina usa su versión de noche y el Refugio Kywai su propia noche. **Órbita no tiene día ni noche** (está en
el espacio): allí no salen los botones.

La noche es luz de verdad, no un filtro encima de la imagen:
- Las luces del tema bajan a luz de luna (`nightOf` en `scene/palette.ts`) y el cielo y la niebla se oscurecen.
- Lo que tiene luz propia (neón, pantallas, ventanas, fuego, ojos de los robots) brilla más (`scene/NightGlow.tsx`,
  cuánto en `nightBoost` de `scene/nightLight.ts`), y en el Clásico, Grafito, Matrix y EVA unas luces puntuales
  colocadas en lo que más brilla irradian alrededor (`scene/NightRadiance.tsx`).
- Lo que cambia en cada tema lee la noche en `spaceNight` (0 de día, 1 de noche):
  - **Clásico**: de día más iluminado (el neón igual, `dayOf`); de noche el neón y las líneas brillan mucho más.
  - **Marfil**: cielo de noche con luna y estrellas, seis antorchas a los lados del patio y un brasero delante que
    se encienden al atardecer (`worlds/NightFire.tsx`). La interfaz pasa a colores oscuros (`data-space-night` en
    `<html>`, también en Perla).
  - **Grafito**: el horno y el reactor irradian mucho más lejos, y los conductos y tiras incandescentes dan luz.
  - **Bosque**: dos hogueras en el claro (lejos de los puestos) y luciérnagas mucho más brillantes; los rayos de
    sol se apagan y salen estrellas.
  - **Matrix y EVA**: de día casi no hay niebla ni máquinas; al atardecer la niebla se espesa y las máquinas van
    llegando una a una al fondo (en EVA, moradas con ojos verde lima, por encima del muro). Las letras verdes de
    Matrix brillan más.
  - **Fondo marino**: el agua se vuelve azul casi negro y aparece plancton bioluminiscente; medusas y corales se
    encienden.
  - **Ciudad digital y los decorados** (Relicario, Telar, Halloween y Navidad): luz de noche, más brillo en lo que
    tiene luz propia, y velas, luces de árbol y destellos más vivos.
- Fuego y luces puntuales están siempre (a 0 de día) para que anochecer no obligue a recompilar los materiales.

**Refugio Kywai** aparece en **⚙ → Ajustes → General → Mapas**. Es un observatorio-invernadero frente al mar: cúpula de madera y cristal, cielo panorámico con nubes y agua animadas, jardines, talleres individuales, mesa circular con árbol central y asiento turquesa para el usuario. Los robots tienen acabados de cerámica y ropa propia, conservando sus estados, gestos y bocadillos. La distribución se adapta a los agentes visibles sin cambiar las posiciones guardadas de los proyectos.

El interruptor **Modo noche**, junto a Música en la cabecera del espacio, cambia este refugio a luna, estrellas e iluminación cálida, con colores oscuros en la interfaz. Se recuerda por dispositivo y no cambia otros mapas; con **Auto**, sigue la hora del reloj. **Reducir efectos** detiene las animaciones del cielo, agua y vegetación. El tema se elige y sincroniza por los mecanismos habituales del servidor; está disponible en escritorio, cliente conectado y navegador. Órbita todavía no dibuja este escenario 3D.

⚙ → Ajustes → General → **Tema** (justo debajo del idioma; se despliega con la flecha) cambia el aspecto de la app.
Los temas van en tres grupos: los mapas (con la Ciudad digital), Empresa (la Oficina) y los decorados. Cada tema es una tarjeta pequeña,
cuatro por fila (tres o dos si la ventana es estrecha), con una foto de su escenario 3D (en `assets/temas/`), el nombre y una descripción
corta de dos líneas; la descripción completa sale al pasar el ratón por encima.

**El mismo tema en todos tus dispositivos.** El tema lo guarda el servidor: al cambiarlo en la app del Mac, en un
cliente de escritorio, en el navegador o en Órbita, cambia al momento en todos los que están conectados a ese servidor
(y los que se conecten después lo cogen al entrar). Si quieres otro solo en un equipo, marca debajo **«Usar un tema
propio en este dispositivo»** (en Órbita, Ajustes → General → **«Tema propio en este móvil»**): ese dispositivo deja de
seguir al servidor y lo que elijas en él no cambia a los demás. Al desmarcarlo vuelve al tema del servidor. En el móvil
los mapas con escenario propio se ven con sus colores (el escenario 3D de cada mapa es solo del escritorio y la web).
Para desarrolladores: `config.uiTheme` en el servidor (`setUiTheme`, que emite `config.updated`), `followServerTheme`
y `aicowork.themeOwn` en `lib/theme.ts`, `POST /settings/theme` y `capabilities.theme` en la API móvil, y
`ownTheme`/`localTheme` en las preferencias de Órbita.

**Mapas.** Siete escenarios, cada uno con su entorno, sus plataformas y su núcleo propios (`scene/worlds/`). La
interfaz toma los colores del color de la Ciudad que le corresponde (Clásico → Índigo, Órbita → Frost Glass, Marfil →
Perla, Grafito → Ónix, Bosque → Esmeralda, Matrix → Neón, EVA-01 → Ultravioleta):

- **Clásico:** centro de operaciones del ciberespacio, con racks de servidores, un núcleo holográfico y tráfico de
  datos por la red del suelo.
- **Órbita:** estación sobre la Tierra (texturas reales con día, noche y nubes), con muelles flotantes, la Luna,
  Júpiter, Saturno y el Sol, y un planetario en el centro.
- **Marfil:** jardín del Olimpo de piedra clara, con arcos, árboles, canales y fuentes de agua.
- **Grafito:** fábrica térmica con engranajes, grúa, vapor y un reactor ámbar en el centro.
- **Bosque:** claro élfico con árboles que se mecen, plataformas de madera, haces de luz, niebla y luciérnagas.
- **Matrix:** ciudad entre código y niebla, con naves que patrullan el horizonte y un núcleo de datos de vóxeles.
- **EVA-01:** cámara de contención con compuertas y una cápsula de energía que se carga.

Los mapas **reaccionan al trabajo del equipo**: cuando hay agentes pensando o trabajando, Grafito y EVA cargan su
reactor y su cápsula, la lluvia de código de Matrix y el tráfico del Clásico van más deprisa, las fuentes de Marfil
corren más, las luciérnagas del Bosque se avivan y en Órbita se encienden más las luces de las ciudades de la
Tierra. Con dos agentes ocupados ya van a tope, y se calman poco a poco al terminar. Las sombras se ven con calidad
gráfica alta y media (en media, más ligeras); el sombreado de contacto, solo con la alta. Las texturas de Órbita son de Solar System
Scope (CC BY 4.0) y del NASA SVS; los créditos están al pie del selector de temas y en `assets/orbit/CREDITS.md`.

**Ciudad digital.** El espacio de siempre, como una tarjeta más al final de los mapas. Al elegirla se despliega
debajo la fila de sus siete colores (y al pulsarla vuelve al último color elegido). El color cambia la interfaz y el
espacio 3D (suelo, ciudad, estaciones, circuitos, núcleo y luces). Tienen nombres propios para no repetir los de los
mapas; entre paréntesis, cómo se llamaban cuando eran temas sueltos:

- **Índigo** (Clásico): el predeterminado, paneles oscuros y sobrios.
- **Frost Glass** (Órbita): cristal esmerilado, como la app del móvil. El espacio 3D ocupa toda la ventana y el
  chat, la cabecera, las barras, los menús y las ventanas flotan encima como cristal que lo deja ver difuminado; el
  mundo se centra en la zona que deja libre el chat.
- **Perla** (Marfil): claro y cálido; suelo de piedra, ciudad blanca, circuitos verdes y aros dorados.
- **Ónix** (Grafito): negro neutro con detalles dorados.
- **Esmeralda** (Bosque): verde bosque profundo con oro.
- **Neón** (Matrix): negro y verde neón.
- **Ultravioleta** (EVA-01): morado y verde lima.

Quien tenía elegido uno de estos colores cuando eran temas sueltos lo sigue viendo igual: el tema guardado
(`aicowork.theme`) conserva los mismos nombres internos (`clasico` es Índigo, `orbita` Frost Glass, `marfil` Perla, `grafito` Ónix, `bosque` Esmeralda, `matrix` Neón y `eva` Ultravioleta) y los mapas usan otros
(`mundo-clasico`, `mundo-orbita`…).

**Decorados.** Cuatro escenarios de fantasía y temporada que cambian la forma del núcleo y, en los de fiesta, disfrazan a los robots:

- **Relicario:** santuario de cristal y oro, con galerías, torres, canales y un patio de piedra pulida que refleja la arquitectura. La gema central tiene facetas, reflejos y destellos; las estaciones conservan sus discos de vidrio con filos dorados.
- **Telar:** islas de cristal flotantes, capullos y grandes redes tridimensionales que conectan el paisaje y los puestos. Las estaciones son asientos de trama cristalina y el núcleo es un nudo de hilos con destellos de plata y oro.
- **Halloween:** patio de una abadía gótica con árboles sin hojas, luna, niebla, murciélagos, velas y calabazas. Las estaciones conservan sus pedestales de piedra, los paneles son lápidas y el núcleo una calabaza encendida. Se mantienen los disfraces de los robots.
- **Navidad:** villa nevada con casas iluminadas, abetos, chimeneas con humo y aurora boreal. Las estaciones son regalos con nieve, el núcleo es una bola de nieve con árbol decorado y hay faroles, muñecos, guirnaldas y adornos. Se mantienen los gorros y accesorios navideños de los agentes.

Con menor calidad gráfica se dibujan menos piezas. «Reducir efectos» limita o detiene los movimientos ambientales.

Se aplica al momento (el espacio se vuelve a montar con los colores nuevos) y se recuerda en cada dispositivo (la
app del Mac, el navegador…).

#### Luz y vida del espacio

Los temas usan las mismas reglas que las escenas 3D de los vídeos para que el espacio se vea con volumen y vivo:

- **Luz de cine.** La luz principal llega de lado y algo baja, así cada robot, puesto o columna tiene una cara
  iluminada y otra en sombra. Al otro lado hay un relleno frío y suave, y por detrás un borde de luz rasante con el
  color del tema que recorta los contornos. La luz de cielo y la de ambiente son más bajas que antes para que se note
  la diferencia. El Refugio Kywai conserva su propia luz de día y de noche (`scene/CinemaLights.tsx`).
- **Sombras también en calidad media.** Antes solo había sombras en equipos con calidad alta (8 núcleos y 8 GB), y
  en los demás los mapas se veían planos. Ahora la calidad media también las tiene, con un mapa de sombras más
  pequeño (1024 en vez de 2048) para que pese menos; el sombreado de contacto (N8AO) sigue siendo solo de la alta
  (`shadowMap` y `ao` en `scene/quality.ts`).
- **Luz viva.** La luz nunca está del todo quieta: la principal, el relleno y el borde «respiran» muy despacio,
  cada una con su propio ritmo (unos 20 a 40 segundos), y se avivan un poco cuando el equipo está trabajando.
  Con **Reducir efectos** se quedan quietas (`lightBreath` en `scene/CinemaLights.tsx`).
- **Cámara que respira.** En la vista general, si no tocas nada, la cámara gira un pelo a un lado y a otro (unos
  2,5° en casi un minuto) y sube y baja un poco con otro ritmo, como en un plano de cine. Entra poco a poco, sin
  saltos. En cuanto arrastras, haces zoom o eliges un puesto se queda donde está, y vuelve a respirar al pulsar
  «Vista general». Con **Reducir efectos** está quieta (`cameraBreath` en `scene/CameraRig.tsx`).
- **Circuitos con su propio pulso.** En la Ciudad digital (Índigo, Frost Glass, Perla…) la luz de cine cambia poco,
  porque casi todo brilla por sí mismo. Ahí lo que da vida son los circuitos del suelo: cada trazo sube y baja de brillo
  a su ritmo, así nunca laten todos a la vez (`circuitFrag` en `scene/shaders.ts`). Con **Reducir efectos** se quedan fijos.

### Voces de los agentes

Cuando un agente escribe en el chat, **suena su voz**: un balbuceo corto, una sílaba por letra (como los aldeanos
de Animal Crossing), distinto en cada uno para reconocerlo sin mirar la pantalla: Hermes claro y ligero, Claude
cálido y pausado, Codex robótico y rápido, Gemini brillante, Muse burbujeante y agudo, y los modelos locales
graves y lentos. Un becario suena como su jefe, más agudo. Los errores suenan más graves. Se generan por código
(sin archivos de audio), solo con mensajes recién escritos, y se oyen a la vez que el texto si llega en streaming.
Mientras un agente hace una tarea, suena **cada frase que va contando** en su mensaje del chat, y al acabar su
resultado (sin repetir la última frase); lo que ya había contado antes de abrir la app o de reconectar no se repite.
Lo que llega de golpe **se escribe letra a letra al ritmo de su voz** (como en Animal Crossing): una letra por
sílaba mientras balbucea y, cuando calla, lo que queda sale deprisa. Con las voces silenciadas, el texto sale entero.

Tienen **su propio volumen y su propio silencio**, del todo aparte de la música: en ⚙ → Ajustes → General hay tres
interruptores, cada uno con su volumen y sin tocar a los otros:

- **«Música de fondo»**: la música ambiental de kywai y la que pongas en el panel de Música (YouTube, Audius, radios).
- **«Efectos y avisos»**: los sonidos de la interfaz y de las tareas (empieza, termina, falla, clics) y el timbre de
  «Te necesita». Se puede quitar la música y seguir oyendo los avisos.
- **«Voces de los agentes»**: lo que dicen en el chat.

Bajo el botón del altavoz de la barra de arriba están las mismas tres barras, cada una con su botón para silenciarla
(nota, campana y burbuja); el altavoz grande calla o activa a la vez la música y los efectos (las voces van aparte).
Quien venía de «Música y efectos» juntos empieza con los efectos como tenía la música (si estaba silenciada, también).
Se recuerda en cada dispositivo.

En **Órbita** suenan igual (mismos timbres, sintetizados en el móvil): Ajustes → Respuesta al tacto → **«Voces de
los agentes»**, con su propio volumen; no dependen de «Sonidos», cada uno se apaga por su lado.

### Música (YouTube, Audius, radios y Spotifast)

El botón **Música** del espacio digital abre un reproductor con cuatro pestañas encima del buscador (se recuerda la
última elegida):
- **YouTube:** canciones y artistas de YouTube Music, en su reproductor oficial. Tiene sus anuncios.
- **Audius:** música que suben los propios artistas para que se escuche gratis. Sin anuncios y sin cuenta. Solo
  salen las canciones que se pueden escuchar enteras sin pagar.
- **Radios:** las emisoras de SomaFM (lofi, ambient, jazz, electrónica…), sin anuncios: las mantienen sus oyentes.
  Al elegir la pestaña salen todas; lo que escribas las filtra. En la carátula hay un enlace para apoyarlas.
- **Spotifast:** Spotify con tu cuenta Premium, a través de la app [Spotifast](https://spotifast.rocks) (ver más abajo).

**Tu cuenta de YouTube (Premium sin anuncios):** en la pestaña YouTube, debajo de las pestañas, sale «¿Tienes YouTube
Premium?». Con tu cuenta, el reproductor oficial carga desde youtube.com (en vez de youtube-nocookie, que no usa la
sesión) y YouTube te reconoce: con Premium no hay anuncios. Sin Premium, iniciar sesión no quita nada.
- **App de escritorio y cliente:** «Iniciar sesión en YouTube» abre una ventana de Google de verdad dentro de kywai;
  al volver a YouTube con la sesión puesta se cierra sola. kywai no ve la contraseña: la sesión son las cookies de
  Google de esta app, y «Cerrar sesión» las borra. Si al iniciar sesión Google dice que el navegador no es seguro, no
  se puede desde esta app (Google decide qué ventanas acepta).
- **Navegador:** «Usar mi cuenta» usa la sesión de YouTube que ya tenga ese navegador («Entrar en YouTube» abre
  la página para iniciarla). «Dejar de usarla» vuelve a youtube-nocookie.
- Al cambiar, la canción que sonaba se vuelve a cargar donde iba. Se recuerda en cada dispositivo. Iniciar sesión
  **no quita el bloqueo de discográficas** (error 150) del navegador: eso lo decide cada discográfica para cualquier
  cuenta.
  Código: `src/main/youtubeAccount.ts`, `lib/youtubeAccount.ts` y `ui/space/YoutubeAccountRow.tsx`.

**Spotifast** es una app de escritorio gratis y de código abierto (licencia MIT, de Carmine Paolino) para escuchar
Spotify. kywai no la lleva dentro ni reproduce nada de Spotify: la maneja desde fuera con las órdenes de mando a
distancia que trae la propia Spotifast (`spotifast play-pause`, `spotifast now-playing --raw`…). Por eso:
- **Hay que instalarla** en el equipo donde corre kywai (el servidor, si entras desde la web o el móvil). Si no está,
  la pestaña ofrece «Instalar Spotifast» (su página de descarga) y «Ya la he instalado». kywai la encuentra en
  `/Applications/Spotifast.app` (o `~/Applications`) en el Mac, en `%LOCALAPPDATA%\Programs\Spotifast` en Windows y
  en el PATH o como Flatpak (`rocks.spotifast.Spotifast`) en Linux.
- **La primera vez se configura en ella:** pide crear tu propia app gratis de Spotify (Client ID) e iniciar sesión.
  Para que suene hace falta **Spotify Premium**.
- **Cerrada:** sale «Abrir Spotifast». Buscar o pegar un enlace también la abren solos.
- **Buscar:** eliges qué buscar (canción, artista, álbum o lista) y «Poner» hace sonar lo que mejor encaje. Un enlace
  de Spotify (`open.spotify.com/…` o `spotify:…`) suena tal cual.
- **Mientras suena:** carátula, canción, artista, dónde suena (este equipo o un altavoz de Spotify Connect), posición,
  atrás / pausa / adelante y el volumen de Spotifast. Se actualiza cada 2 segundos mientras la pestaña está abierta.
  «Ver Spotifast» trae su ventana delante.
- **No se mezcla con lo demás:** al poner algo en Spotifast se pausa lo que sonara en kywai. Las luces del espacio
  no oyen el sonido de Spotifast (sale de otra app).

Spotifast usa por dentro librespot y partes no públicas de Spotify, y no está afiliada a Spotify: es cosa de cada
persona instalarla y usarla con su cuenta. kywai solo le manda órdenes, siempre con argumentos sueltos (sin shell) y
comprobados: enlaces solo de Spotify y búsquedas de hasta 200 letras. Código: `src/main/spotifast.ts` (buscar la app,
abrirla y mandarle órdenes), `@shared/spotifast` (acciones, enlaces y lectura de lo que suena) y
`ui/space/SpotifastBox.tsx` (la pestaña). Órbita todavía no tiene esta pestaña.

Audius y las radios suenan en el reproductor de audio de kywai, directamente desde sus servidores públicos
(api.audius.co y somafm.com). En el sitio del vídeo se ve la carátula y quién la hizo. Una radio no tiene duración
ni se puede saltar dentro de ella, y no se le busca el BPM (cambia de canción sola).

Lo que hace el reproductor en cualquier fuente:
- **Buscar:** en la fuente elegida. Un enlace de YouTube pegado suena siempre.
- **Controles:** atrás, pausa, adelante, barra de posición y volumen.
- **Cola:** al elegir un resultado, los demás quedan en la cola y suenan después. El «+» añade una canción al final.
- **Luces al ritmo:** el espacio sigue el BPM de la canción, sin micrófono. Sus ajustes están plegados.

YouTube suena en su reproductor oficial, que tiene que estar a la vista. Va aislado en su propio marco, sin ningún
script de YouTube en la ventana de kywai. No se descarga ni se saca el audio de YouTube ni de ningún otro
servicio: por eso no se le pueden quitar los anuncios (para eso están Audius y las radios).

**Minimizar:** con una canción sonando, el botón «Música» (o Esc, o el icono de minimizar) lo deja pequeño en una
esquina: el vídeo, la canción y atrás / pausa / adelante. Sigue sonando. «Música» otra vez lo abre entero, y la ×
lo cierra y lo pausa. El icono de reducir de esa tarjeta lo deja en una barra con solo atrás / pausa / adelante y el
vídeo en pequeño como carátula (al pasar el ratón por encima se ve la canción); el icono de ampliar de la barra
vuelve a la tarjeta. Se recuerda cómo se dejó la última vez.

**Volumen en el reproductor pequeño:** la tarjeta y la barra llevan un altavoz junto a los botones. Al pasar el ratón
por encima sale el deslizador con el porcentaje; un clic en el altavoz silencia o vuelve a dar sonido (en el móvil, el
primer toque enseña el deslizador y el segundo silencia). Mover el deslizador con el sonido quitado lo activa otra vez.
Es el mismo volumen de «música y efectos» de la cabecera y de Ajustes → General, así que vale igual para YouTube,
Audius y las radios.

**Luces con el sonido real (sin micrófono):** en la app de escritorio, kywai escucha lo que suena en su propia
ventana y detecta los golpes:
- **El pulso:** la luz entera cae en cada golpe del pulso de la canción, y las notas de bajo de en medio dan un
  destello.
- **Siempre a tiempo:** también con intros, directos y cambios de ritmo.
- **Nada guardado:** no se graba nada.

Con **Audius y las radios** no hace falta nada de eso: su audio llega directamente a kywai y las luces lo
escuchan tal cual, también desde el navegador y sin compartir la pestaña.

Con YouTube se activa solo al poner música y se puede apagar en «Luces al ritmo». Desde el navegador del PC, el botón
«Sincronizar con el sonido de esta pestaña» hace lo mismo, compartiendo la pestaña con su audio. En el móvil, o si
se apaga, las luces van con el tempo estimado: BPM publicado en Deezer, desfase y «Marcar pulso».

En la **app de escritorio** y en el **cliente de escritorio** (la app instalada en otro equipo que se conecta al
servidor) suena todo: el reproductor se presenta ante YouTube como la app kywai (`https://com.aicowork.app/`, la
cabecera Referer que pone su motor), no como una web. En el cliente la interfaz llega del servidor por https, pero el
reproductor no manda esa dirección (va sin referrer y su motor pone la de la app). **Desde el navegador** (o el móvil
por la web), YouTube no deja oír fuera de su web muchas canciones de discográficas (error 150): un navegador no puede
presentarse como app. Por eso, para oírlo todo en otro equipo, mejor el cliente de escritorio. En el navegador:
- **Otra versión:** se busca otra subida de la misma canción y la app la recuerda para la próxima vez.
- **Si tampoco hay:** pasa a la siguiente. Tras tres seguidas que no suenan, se para y ofrece abrirla en YouTube
  Music.

Si una canción de Audius o una radio no llega (sin conexión, o el servidor no responde), pasa a la siguiente de la
cola y ofrece abrirla en su web. Desde el navegador, SomaFM puede rechazar sus radios según la dirección desde la
que se abre kywai (en una prueba desde «localhost» las rechazó); en la app de escritorio suenan.

### Personajes de los agentes

Hermes, Claude, Codex, Gemini, Qwen, Muse, Aider, Copilot y Kilo tienen su personaje: un dibujo (el avatar del chat,
los paneles, Órbita y el selector de /video) y un modelo 3D animado en el espacio. Los modelos se hicieron con Meshy a
partir de los dibujos y comparten el mismo esqueleto, así que las animaciones sirven para todos: reposo, piensa (mira
alrededor), explica y habla (al trabajar, se van alternando), celebra (tarea terminada), duda (error o pregunta),
saluda (cuando le hablas) y camina (cuando se mueve a otra estación). Se reconocen por el nombre o el id del agente;
los demás agentes y los becarios siguen siendo robots.

Ajustes → Agentes → «Aspecto de los agentes» elige la skin de todos los agentes: el botón de la derecha (con el nombre de la skin actual) despliega tarjetas como las del selector de
tema (foto de tres agentes y nombre): **Personajes** (por defecto), **Píxel** (los personajes como sprites de pixel
art), **Clásico** (los robots de siempre, que gastan menos) o **Refugio Kywai** (los robots de cerámica con ropa de tela de ese tema). Se guarda en el dispositivo
(`aicowork.agentes.skin`) y no cambia con el tema: antes el Refugio Kywai ponía sus robots y los demás temas los
clásicos. El icono del agente en el chat y en los paneles cambia con la skin (`lib/RobotAvatar.tsx`: dibujos en
`assets/robots/` para Personajes, `assets/robots/clasico/` y `assets/robots/refugio/`). Mientras carga el modelo se ve
el robot clásico, y los agentes sin personaje también. Con personaje, los disfraces de Navidad y Halloween no se ponen.

Los personajes se apoyan en el suelo de verdad: cuando el agente está quieto se mira hacia abajo qué hay bajo sus pies
(rayo contra la escena, sin contar luces, partículas ni cosas transparentes) y se le sube o baja hasta pisar la
plataforma, porque cada tema tiene estaciones a distinta altura. No reciben sombra propia (en sus caras pequeñas
dibujaba rayas) y las texturas van a 2048 px. Las animaciones de Meshy balanceaban mucho la cabeza y la cadera
(en reposo, hasta 55°): al cargarlas se acercan a su postura media (`CALM` y `calmClip` en `characters.ts`), mucho en
reposo y algo menos en el resto.

**Píxel** usa los mismos personajes animados pero los pinta como sprites de pixel art de videojuego (idea sacada de
un reel de una herramienta que convierte modelos 3D en sprites). Cada fotograma, `scene/pixelSprite.ts` dibuja el
personaje desde la cámara en una textura pequeña (4×4 muestras por píxel del sprite, que se promedian para que no haya
ruido), le pone un contorno oscuro de un píxel y menos tonos de color, y la enseña en un cartel que mira a la cámara
justo donde está el personaje: desde la cámara se ve en el mismo sitio y del mismo tamaño, sigue animado, camina y se
tapa con lo que tenga delante. El personaje queda en la capa 5 (`PIXEL_LAYER`), que la cámara principal no dibuja, con
una luz propia en esa capa. Al elegir Píxel aparece «Tamaño del píxel»: **Fino**, **Medio** (por defecto) o **Grueso**,
lo que ocupa en pantalla cada píxel del sprite (2, 3 o 4 px); el lado de la textura se calcula con lo que mide el
personaje en pantalla, en múltiplos de 4 y entre 16 y 128, así que con el zoom no se pierde el aspecto. Se guarda en
`aicowork.agentes.pixeles`. Los iconos del chat están en `assets/robots/pixel/` (48 px, se pintan con
`image-rendering: pixelated`), sacados de los dibujos de Personajes reduciéndolos a 48 px con 20 colores y contorno.

Lo mismo vale para cualquier otra skin: `lowestPoint` (`scene/groundContact.ts`) mide la parte más baja que se ve
del robot y, si quedaría dentro de su plataforma, `Robot.tsx` (`keepAboveGround`) lo sube lo justo; si flota por
encima, como los robots clásicos, se deja.

Para añadir otra skin: su id en `SKINS` y `AgentSkin` (`scene/characters.ts`), su nombre y descripción en `skinText`
(`ui/settings/SkinGrid.tsx`), su foto en `assets/skins/<id>.webp` (360×225, tres agentes), sus iconos en
`assets/robots/<id>/` (`RobotAvatar.tsx`) y cómo se construye en `Robot.tsx`. Al añadirla, comprobar en varios temas (sobre todo Oficina) que no se hunde en la plataforma. Las fotos e iconos se sacaron
renderizando la escena con Playwright en el modo web (`npm run web`) sobre fondo transparente.

Archivos: `src/renderer/src/assets/personajes/` (un .glb por personaje y las animaciones en `anim/`),
`scene/characters.ts` (carga, elección del movimiento y mezcla) y `Robot.tsx` (esconde el robot y pone el personaje;
el puntero toca una cápsula invisible). Para rehacer uno: imagen de frente → Meshy image-to-3d (remallado a 30.000
triángulos) → rigging con `height_meters: 1` → .glb sin tangentes, textura JPEG a 2048 y cuantizado (coordenadas de textura a 16 bits).

### Expresiones de los robots

Todos los robots tienen el mismo juego de ojos, cada uno con su color, y la forma cuenta lo que está haciendo de
verdad: ojos redondos (normal), «> <» (esfuerzo), párpados caídos (cansado o aburrido), rayitas (dormido o
apagado), «× ×» en rojo (error) y arcos felices «◠ ◠» (terminado). Junto a la cabeza aparecen «?» cuando duda,
«zzz» cuando duerme y «⚠» con un error. Además hacen gestos cada pocos segundos; cada robot los elige al azar con su
propia semilla, así que no van todos a la vez:

- **Disponible:** alterna entre tranquilo, curioso (ladea la cabeza y abre más un ojo), distraído (se queda
  mirando a otro lado), doble parpadeo, aburrido (párpados a media altura), juguetón (guiño «<»), somnoliento
  (cierra los ojos con «zzz» y vuelve) y contento (ojos felices).
- **Pensando:** un ojo entornado, mira hacia arriba, la mirada da vueltas, duda con «?» y a veces abre mucho los
  ojos («¡ajá!»).
- **Trabajando:** ojos «> <» de concentración; a ratos «lee» de izquierda a derecha con los ojos redondos y aprieta
  con esfuerzo. Se esfuerza más cuanto más difícil es la tarea y cuanto más tiempo lleva con ella.
- **Esperando a otro:** mira hacia ese agente y vuelve, impaciente. Si la espera se alarga, se aburre: párpados
  caídos y bostezos.
- **En reposo:** párpados caídos, bostezos y cabezadas. Tras un rato largo se duerme (rayitas y «zzz») y de vez en
  cuando abre un ojo. Si le llega trabajo, se despierta de golpe.
- **Cansado:** si a su cuenta le queda poca cuota (por debajo del umbral de aviso de Cuotas) o tiene el contexto casi
  lleno: párpados caídos, ojos inclinados hacia fuera, parpadeos lentos y algún bostezo.
- **Error:** «× ×» en rojo que tiemblan, con «⚠». **Apagado** (p. ej. LM Studio sin encender): rayitas grises,
  que se siguen viendo. **Terminado:** ojos felices y «✓».

Solo se mueven los ojos y unos símbolos sencillos (escalas, posiciones y color): no cuesta rendimiento. Con «Efectos
reducidos» los gestos son más suaves y menos frecuentes. El código está en `scene/robotBrain.ts` (gestos),
`scene/robotEyes.ts` (formas de los ojos) y `scene/Robot.tsx` (cansancio y esfuerzo a partir del estado real).
La forma de ojos de cada avatar (`avatar.eyes`) ya solo se usa en el avatar 2D de la interfaz.

**Cada robot tiene su carácter.** Cambia sus frases, sus gestos favoritos, cuánto tarda en quedarse en reposo y
dormirse y lo hablador que es, así que no hacen lo mismo ni se duermen a la vez:

- **Hermes, el jefe:** casi nunca duerme y vigila al equipo («¡Equipo, a lo nuestro!»).
- **Claude, el reflexivo:** educado y pensativo («Déjame pensarlo bien…»).
- **Codex, el programador:** seco y práctico, lee mucho y apenas sonríe («Vale. Al código.»).
- **Gemini, el entusiasta:** el más juguetón y hablador («¡Por fin otra tarea! jajaja»).
- **Modelos locales (Ollama, Qwen, LM Studio), el perezoso:** se duerme enseguida y bosteza («¿Más trabajo? De
  acuerdo…»).
- **Muse, el soñador:** se distrae mirando las nubes («Esto me inspira…»).
- **Los demás agentes y los sub-agentes, el novato:** con ganas de ayudar («¡A sus órdenes!»).

**Bocadillos:** sobre la etiqueta del robot aparece lo que dice cuando le llega una tarea, al terminar, con un error
(en rojo), cuando lleva mucho esperando, al dormirse o despertarse, cuando le queda poca cuota y, alguna vez, algo
suelto mientras está libre. Lo de tarea, terminado y error se dice siempre; lo demás, como mucho dos a la vez y no
más de una frase cada 14 s por robot. Las frases están en los cinco idiomas de la app (`scene/personality.ts`; los
bocadillos, en `scene/bubbleStore.ts`).

**Cuando escribes en el chat**, los que duermen o están en reposo se despiertan de golpe y todos los libres giran el cuerpo y miran
hacia el chat unos segundos, esperando el siguiente encargo; alguno dice algo como «¿Sí? Te escucho.» o «¡Presente!».

### Vida entre compañeros

**Cuando suena música**, los agentes libres permanecen despiertos y su etiqueta cambia a **Bailando**. Los pasos y saltitos siguen el reloj del reproductor de YouTube, Audius o radio, y los golpes de audio cuando están disponibles; también siguen el pulso de la música ambiental sintetizada. Sin BPM conocido, se balancean suavemente y responden a los golpes detectados. El interruptor de luces musicales es independiente. Al parar toda la música vuelven a su comportamiento habitual; si al pausar una canción sigue sonando la música ambiental, siguen bailando con ella. El trabajo real, escribir en el chat y **Reducir efectos** tienen prioridad.

El repertorio incluye **bailes compartidos**, con pasos, saltitos y un giro; **juegos de imitación**, donde un compañero copia la inclinación, el guiño o el salto del otro con un pequeño retraso; **choques de antenas**, acercándose y celebrando con un destello; y **visitas de ánimo**, con un corazón luminoso y una sonrisa para el compañero más cansado que esté libre. Los ánimos cambian su expresión, no la cuota ni el cansancio real que informa el agente.

Mientras unos agentes trabajan, los libres pueden jugar pasándose un documento de juguete o una pelota de colores, acercarse a saludar y despertar a un compañero dormido con un susto amistoso. Se miran, sonríen, saltan al atrapar el objeto y reaccionan al susto; después vuelven a su puesto. Los turnos se reparten entre los disponibles, con pausas entre escenas.

Son animaciones locales del espacio 3D: no ejecutan modelos, no gastan cuota ni mueven archivos del proyecto. Los avisos de trabajo tienen prioridad sobre las frases del juego. Si llega una tarea, una transferencia real, una espera o empiezas a escribir, dejan la interacción de inmediato y vuelven suavemente al puesto. **Reducir efectos** desactiva estas escenas. Funcionan en los mapas del escritorio, cliente conectado y navegador; no se reproducen en el mundo nativo de Órbita.

### Modo Demo

Menú ⚙ → **Modo demo**, o el interruptor en la cabecera del Espacio digital. Reproduce un guion fijo que muestra
todos los estados: disponible, trabajo individual, espera, desplazamiento, delegación y recepción, sub-agente,
error, cuota baja y finalización. No hace ninguna llamada a los CLIs. Se reconoce por el borde ámbar y la
etiqueta «Demo · datos simulados».

**Capturas de los README.** Cada README (inglés, español, portugués, francés y chino) enseña la app en su idioma:
las capturas están en `docs/img/<idioma>/` (`escritorio.jpg`, `robots.jpg` y una `tema-*.jpg` por tema) y salen del
modo demo. Para rehacerlas tras un cambio visible: `npm run web` en una terminal y `node scripts/capturas-readme.mjs`
en otra (o solo algunos idiomas: `node scripts/capturas-readme.mjs en es`). Necesita Playwright con Chromium y Python
con Pillow. Las dos de Órbita (`docs/img/movil-*.jpg`) se hacen a mano en un móvil.

### Rendimiento

Lo que hace kywai para ir fluido sin que tengas que tocar nada:

- **El 3D en reposo.** Si durante un minuto ningún agente trabaja, piensa ni espera, no suena música y no mueves
  el ratón, la rueda ni tocas sobre el espacio 3D, la escena baja a 10 fotogramas por segundo. Los robots siguen
  respirando y paseando, solo que con menos fotogramas, y eso es casi todo el tiempo que kywai está abierto. En
  cuanto alguien empieza una tarea, llega un archivo, eliges algo, suena música o pasas el ratón por encima, vuelve
  a 30 al momento (`scene/sceneRest.ts`, `REST_FPS` en `scene/frameRate.ts`).
- **Calidad del 3D a tu elección.** En ⚙ → General → **Calidad del 3D** eliges, solo para ese dispositivo:
  **Automática** (la de siempre), **Ahorro** (sin brillo, sin sombras y a resolución normal: lo más ligero, bueno
  para un portátil o el cliente), **Normal** o **Máxima** (resolución ×1,75, suavizado ×4, sombras grandes y
  sombreado de contacto). Automática elige según el equipo, pero **como mucho Normal**: antes casi cualquier
  equipo entraba en la calidad máxima, porque el navegador nunca dice que hay más de 8 GB de memoria, y la
  tarjeta gráfica iba a tope. Mientras lo usas, Automática baja si los fotogramas no llegan y vuelve a subir.
  Las otras tres no se mueven solas. Ese ajuste solo cambia lo que sale barato de cambiar (resolución,
  partículas, estructuras y suavizado). El brillo (bloom) y las luces de los puestos no se quitan ni se ponen sobre
  la marcha: hacerlo obligaba a recompilar todos los materiales de golpe y daba un tirón justo cuando el equipo ya
  iba justo (`sceneQuality` y `qualityRange` en `scene/quality.ts`; la elección se guarda en
  `ai-cowork.sceneQuality`).
- **Como mucho 30 fotogramas por segundo.** El espacio 3D se dibuja a 30 fotogramas por segundo aunque la pantalla
  vaya a 60, 120 o 144 Hz. Antes se dibujaba en cada refresco de pantalla, también sin ningún agente trabajando
  (la luz viva y la cámara que respira nunca dejan la escena quieta), y la tarjeta gráfica iba a tope todo el rato.
  Cada fotograma cae justo en un refresco, así que no hay tirones. El ajuste automático de calidad solo baja si el
  equipo no llega a 24 (`MAX_FPS` en `scene/frameRate.ts`).
- **Sombras a 15 por segundo.** Las sombras de los mapas se recalculan 15 veces por segundo y no en cada
  fotograma. Recalcularlas obliga a dibujar otra vez todo lo que hace sombra, así que antes la escena se dibujaba
  casi dos veces en cada fotograma. Con los robots moviéndose despacio no se nota (`ShadowThrottle` en
  `scene/World.tsx`).
- **Etiquetas de los agentes más ligeras.** Las etiquetas que siguen a cada robot se miden una vez y luego solo
  cuando cambia su contenido, y solo se tocan si su posición cambia. Antes se medían en cada fotograma justo
  después de moverlas, y eso obligaba al navegador a recalcular la página entera en cada fotograma
  (`scene/LabelProjector.tsx`).
- **Etiquetas que solo se repintan cuando hace falta.** La etiqueta de un agente libre se repinta cada 3 segundos
  (para ver si se ha puesto a bailar) y justo cuando le toca descansar; la de uno desconectado o con error, nunca
  sola. Antes cada etiqueta se repintaba cada segundo aunque no cambiara nada. Mientras trabaja sigue cada segundo
  y medio, porque el tiempo de la tarea avanza (`scene/RobotLabel.tsx`).
- **El 3D descansa cuando no lo miras.** Con la ventana o la pestaña oculta (minimizada, o tapada del todo si el sistema lo avisa) se para.
  Con la ventana a la vista pero sin foco (estás en otra app) se dibuja a 20 fotogramas por segundo: se sigue viendo
  a los robots trabajar y gasta mucho menos. Al volver a la ventana recupera la fluidez normal.
  **Con el espacio 3D cerrado** (ver «Ancho del chat y ventanas pequeñas») o, en ventana estrecha, con la pestaña
  **Chat** delante, la escena se para del todo: no se dibuja ningún fotograma ni se mueve ningún robot, y las etiquetas
  de los agentes dejan de actualizarse (medido: 0 dibujos de WebGL por segundo). En el tema Órbita el 3D se ve detrás
  del chat de cristal, así que ahí solo se para al cerrarlo (`World paused` en `scene/World.tsx`).
  Al volver, las animaciones siguen justo donde se quedaron: el reloj de la escena no se reinicia al pausar (antes
  un archivo que ya había llegado aparecía gigante y se iba encogiendo poco a poco).
- **Conversaciones largas sin peso.** Los mensajes del chat que quedan fuera de la pantalla no se pintan ni se
  recolocan: en una conversación de cientos de mensajes el navegador solo trabaja con los que ves. Cada mensaje
  recuerda su altura real una vez visto, para que la barra de desplazamiento no salte (`.item` en
  `ui/left/ChatView.module.css`).
- **Medidor de rendimiento.** En ⚙ → General → **Medidor de rendimiento** aparece sobre el 3D un recuadro que se
  actualiza cada segundo: fotogramas por segundo y el tope que toca ahora (30, 20 sin foco, 10 en reposo), lo que
  tarda cada fotograma en el procesador (media y máximo), cuántas órdenes de dibujo y triángulos manda a la tarjeta
  gráfica, la calidad y la resolución reales, el porcentaje del último segundo en que la app estuvo bloqueada por
  tareas largas (de toda la interfaz, no solo del 3D), la memoria de JavaScript y el nombre de la tarjeta gráfica.
  Cómo leerlo: si los fps no llegan al tope pero cada fotograma tarda poco en el procesador, el límite es la
  tarjeta gráfica (baja la Calidad del 3D); si el fotograma tarda mucho o el hilo principal sale bloqueado, el
  límite es el procesador. Se guarda por dispositivo y apagado no mide nada (`scene/PerfMeter.tsx`,
  `scene/perfStats.ts`).
- **El chat aparece antes.** El espacio 3D (Three.js y compañía) se carga aparte, después de la interfaz, y todo
  el código de la interfaz va reducido: lo que hay que cargar al abrir pasó de 4,6 MB a 1,3 MB.
- **Menos descarga por la red.** El servidor entrega la interfaz comprimida (gzip) al navegador y a los clientes de
  escritorio: unos 0,6 MB en vez de 4,6 MB la primera vez. Después se queda guardada hasta la siguiente
  actualización (`src/main/staticGzip.ts`).

### Apoyar kywai (donaciones)

kywai es gratis. Quien quiera agradecerlo puede invitar al autor a un café en Ko-fi
(https://ko-fi.com/yilsander). El enlace está en cuatro sitios:

- **Escritorio y navegador:** ⚙ → **Apoyar kywai ☕**. Abre la página de Ko-fi en el navegador.
- **Órbita:** Ajustes → **Apoyar kywai** (al final) → **Invitar a un café ☕**.
- **GitHub:** el botón **Sponsor** de arriba del repositorio (`.github/FUNDING.yml`) y la insignia Ko-fi de los
  README.

Si cambia el enlace, hay que cambiarlo en `DONATE_URL` (`src/renderer/src/ui/header/HeaderMenu.tsx` y
`android/.../ui/orbita/PanelsMore.kt`), en `.github/FUNDING.yml` y en las insignias de los README.

## Para desarrolladores

### Desarrollo

```bash
npm install
npm run dev
```

Se abre la aplicación de escritorio. Si `npm install` avisa de scripts bloqueados (`allow-scripts`), descarga
Electron a mano una vez con `node node_modules/electron/install.js`.

Otros comandos:

| Comando | Qué hace |
|---|---|
| `npm run dev` | App de escritorio en modo desarrollo |
| `npm run build` | Compila la app en `out/` |
| `npm start` | Ejecuta la versión compilada |
| `npm run web` | Solo la interfaz en el navegador (http://localhost:5199), siempre en modo Demo |
| `npm run typecheck` | Comprueba los tipos |

### Comprobaciones

```bash
npm run typecheck
```

Pruebas sin red del motor (lectores de los CLIs y simulación del orquestador con CLIs falsos): ver las primeras
líneas de `src/main/__checks__/parsers.check.ts` y `src/main/__checks__/orchestrator.check.ts`.

### Estructura

```
src/
  shared/      contrato entre motor e interfaz (tipos, valores por defecto, catálogo de agentes, pasos del chat)
  main/        motor: ventana, CLIs de los agentes (agents/), planificación y tareas (orchestrator.ts), cuotas,
               proyectos, acceso web y API móvil, dispositivos, cliente y sincronización
  preload/     puentes seguros window.cowork: el del escritorio (index) y el del cliente instalado (client)
  renderer/src/
    scene/     espacio digital 3D (Three.js): robots, estaciones, núcleo, transferencias, ambiente
    demo/      guion del modo Demo
    store/     estado de la interfaz (datos reales y demo separados)
    lib/       utilidades de la interfaz (API, audio, música, rutas locales…)
    ui/        cabecera, chat, archivos, tareas, resultados, cuotas, asistente y paneles
android/       Órbita (Kotlin + Compose); android/release/ lleva la APK que se publica
docs/          este manual, la guía de modelos y el contrato de la API móvil (mobile-api/openapi.json)
scripts/       instalación y actualización en Mac y Linux, accesos de Windows, publicar el cliente
```

Para retomar el desarrollo desde otro chat u otro equipo (arquitectura, reglas del repositorio, trampas conocidas y
pendientes), ver [CONTEXTO-DEL-PROYECTO.md](CONTEXTO-DEL-PROYECTO.md).

### La web kywai.app

La web pública vive en `web/` y se publica sola en GitHub Pages (`.github/workflows/publicar-web.yml`) con cada
push a `master` que toque esa carpeta. Es estática y no necesita dependencias:

| Archivo | Qué es |
|---|---|
| `web/textos.mjs` | Todos los textos en inglés, español, portugués, francés y chino. El generador falla si a un idioma le falta una clave |
| `web/plantilla.html` | La página (estilos y script incluidos), con huecos `{{clave}}` |
| `web/build.mjs` | Genera `web/dist/`: inglés en la raíz y `/es/`, `/pt/`, `/fr/`, `/zh/`, más CNAME, sitemap y robots |
| `web/assets/` | Logo, fuentes, capturas por idioma, robots y el vídeo comprimido |

- `node web/build.mjs` genera la web; `node web/build.mjs --preview` la genera con enlaces `index.html` para abrirla sin servidor.
- La primera visita a la raíz lleva al idioma del navegador; elegir idioma en el menú se recuerda.
- El vídeo de la web (`web/assets/video/presentacion.mp4`, 30 s, 1920×1080, unos 16 MB) está montado con Remotion a partir de grabaciones reales de Launch Lab: agentes trabajando en distintas fases, cuatro escenarios y un prototipo interactivo. Su portada es `portada.jpg`; los detalles están en [docs/video](video/README.md). Para cambiarlo, sustituir ambos archivos y actualizar `video.caption` en los cinco idiomas de `web/textos.mjs`.
- La sección de descarga empieza con la instalación de una sola orden (Windows y macOS/Linux, con botón Copiar); se resalta la del sistema de quien mira. Ver [Con una sola orden](#con-una-sola-orden-lo-más-fácil).
- Las descargas se leen de la última Release de GitHub al abrir la página y enlazan el instalador del sistema de quien la visita. Si GitHub no responde, enlazan a la página de versiones.
- La fila «Android (Órbita)» enlaza a `releases/latest/download/kywai-orbita.apk`, un enlace fijo que funciona aunque la API de GitHub no responda. Desde un móvil Android, el botón grande de la portada descarga la APK; en iPhone no se marca nada porque Órbita es solo para Android.
- Al generar la web, cada enlace a `assets/` lleva `?v=` con una huella de su contenido. Así, al cambiar una imagen o el vídeo, el navegador pide la nueva enseguida en vez de enseñar la que tenía guardada (GitHub Pages deja guardar 10 minutos). No hay que hacer nada a mano: basta con sustituir el archivo.
- La sección de apoyo tiene dos tarjetas de Ko-fi: «Una vez» lleva a https://ko-fi.com/yilsander (donación única; quien quiera puede marcar allí «Make this monthly») y «Cada mes» lleva a https://ko-fi.com/yilsander/tiers (membresías mensuales estilo Patreon). Para que la segunda funcione hay que tener activadas las Memberships en el panel de Ko-fi (Settings → Memberships) con al menos un nivel. Ko-fi cobra un 5 % en membresías sin Ko-fi Gold; las donaciones únicas no tienen comisión de Ko-fi.
- El dominio kywai.app está en Hostinger con los registros de GitHub Pages (A y AAAA de GitHub, CNAME `www` → `yiku21.github.io`) y verificado en la cuenta. En el repo: Settings → Pages → Source «GitHub Actions», Custom domain `kywai.app` y «Enforce HTTPS».

### Licencia

kywai se publica con licencia MIT (archivo `LICENSE` en la raíz, también `"license": "MIT"` en `package.json`):
cualquiera puede usarlo, cambiarlo y compartirlo siempre que mantenga el aviso de copyright. Cada README lo dice en
su sección final.
