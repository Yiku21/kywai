# Manual de kywai

Todo lo que hace kywai, en detalle. Para una presentación rápida, ver el [README](../README.md).

El [vídeo de 30 segundos](https://kywai.app/es/#video) muestra un proyecto repartido entre varios agentes, cuatro escenarios y un prototipo funcionando dentro de la app, con música original y textos en inglés. Las tomas resumen distintas fases del trabajo. El MP4, la portada y los detalles de la grabación están en [docs/video](video/README.md).

**NVIDIA Inception (desde el 16 nov 2026):** kywai es miembro del programa NVIDIA Inception. El distintivo oficial (portal de
Inception → Resources → Marketing with NVIDIA → Member Badge) está en `docs/img/readme/nvidia-inception.svg` y sale arriba de
los README, con la línea legal de NVIDIA al final. Normas de NVIDIA: no cambiar colores ni proporciones, nunca más grande que
el logo de kywai, escribir «NVIDIA Inception program» (nunca «Inception» a secas ni «Nvidia»).

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
  - [Desinstalar kywai](#desinstalar-kywai-22-nov-2026)
  - [Abrir la app (este equipo, versión de desarrollo)](#abrir-la-app-este-equipo-versión-de-desarrollo)
  - [Actualizar y reiniciar](#actualizar-y-reiniciar)
  - [Acceso desde el móvil o el portátil (Tailscale)](#acceso-desde-el-móvil-o-el-portátil-tailscale)
  - [Dictado por voz](#dictado-por-voz)
  - [Hablar con kywai (voz en directo)](#hablar-con-kywai-voz-en-directo)
- **[Cómo trabaja el equipo](#cómo-trabaja-el-equipo)**
  - [Reparto, modelos y permisos](#reparto-modelos-y-permisos)
  - [Respuestas rápidas: lo sencillo lo contesta el coordinador](#respuestas-rápidas-lo-sencillo-lo-contesta-el-coordinador)
  - [Lo que sabe el coordinador de kywai](#lo-que-sabe-el-coordinador-de-kywai)
  - [Tu visto bueno a cada plan](#tu-visto-bueno-a-cada-plan)
    - [Revisión del plan con ojos nuevos](#revisión-del-plan-con-ojos-nuevos)
  - [«Te necesita»: lo que espera una decisión tuya](#te-necesita-lo-que-espera-una-decisión-tuya)
  - [«Tu día»: lo que hay hoy al volver a kywai](#tu-día-lo-que-hay-hoy-al-volver-a-kywai-22-nov-2026)
  - [Criterio de aceptación y archivos de cada tarea](#criterio-de-aceptación-y-archivos-de-cada-tarea)
  - [A dos manos: dos agentes, dos opciones y un juez](#a-dos-manos-dos-agentes-dos-opciones-y-un-juez)
  - [Los agentes retoman su sesión en las continuaciones](#los-agentes-retoman-su-sesión-en-las-continuaciones)
  - [Comprobador de entregas: lo dicho contra lo que hay en el disco](#comprobador-de-entregas-lo-dicho-contra-lo-que-hay-en-el-disco)
  - [Estados honestos: «⏳ Aún en marcha» en vez de un «listo» adelantado](#estados-honestos--aún-en-marcha-en-vez-de-un-listo-adelantado)
  - [Vigilante de trabajos largos: nada se queda colgado sin avisar](#vigilante-de-trabajos-largos-nada-se-queda-colgado-sin-avisar)
  - [«¿Se puede aquí?»: la tabla que se mira antes de prometer](#se-puede-aquí-la-tabla-que-se-mira-antes-de-prometer)
  - [Registro de salud: ver los fallos antes que el usuario](#registro-de-salud-ver-los-fallos-antes-que-el-usuario)
  - [Verificación por otro agente](#verificación-por-otro-agente)
  - [Cambios de cada tarea: verlos, deshacerlos y copias aparte](#cambios-de-cada-tarea-verlos-deshacerlos-y-copias-aparte)
  - [Valorar un resultado (👍/👎)](#valorar-un-resultado-)
  - [Lo que cuenta cada agente en el chat](#lo-que-cuenta-cada-agente-en-el-chat)
  - [Tu cara en el chat](#tu-cara-en-el-chat)
  - [Ver qué está haciendo un agente](#ver-qué-está-haciendo-un-agente)
  - [Respuesta final del coordinador](#respuesta-final-del-coordinador)
  - [Errores pasajeros (503, «mucha demanda»)](#errores-pasajeros-503-mucha-demanda)
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
  - [Uso y coste: créditos kywai](#uso-y-coste-créditos-kywai)
  - [Uso y coste: dinero por agente](#uso-y-coste-dinero-por-agente)
  - [Cómo rinde cada agente](#cómo-rinde-cada-agente)
  - [Dónde se guardan las cosas](#dónde-se-guardan-las-cosas)
- **[Comodidades](#comodidades)**
  - [Un chat que se lee bien](#un-chat-que-se-lee-bien)
  - [Ancho del chat y ventanas pequeñas](#ancho-del-chat-y-ventanas-pequeñas)
  - [Idioma](#idioma)
  - [Temas](#temas)
  - [Voces de los agentes](#voces-de-los-agentes)
  - [Música (YouTube, radios y ytm-rs)](#música-youtube-radios-y-ytm-rs)
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

- Los scripts son `scripts/instalar-kywai.ps1` y `scripts/instalar-kywai.sh`. En el repositorio público, `web/build.mjs` los copia tal cual a la web como
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
  Release (`src/main/updater.ts`). En Windows y en el AppImage la descargan y se instala al cerrar kywai (sin volver a
  abrirla). Al terminar de bajarla sale, una vez por sesión, el aviso «La versión X de kywai está lista» con **Reiniciar
  y actualizar** (se instala ya y se vuelve a abrir sola) o **Al cerrar kywai**. Mientras se cierra para instalar, una
  ventanita dice «Actualizando kywai a la X… se vuelve a abrir sola en unos segundos». **Nunca se cierra sola al
  abrir** (desde la 1.30.17): antes, si la descarga llegaba en los 5 primeros minutos, se cerraba sin avisar para
  instalarla y, con versiones nuevas cada pocos minutos, parecía que kywai se cerraba al abrirla una y otra vez. **En el Mac igual**
  (desde el 10 nov 2026): como no va firmada por Apple, electron-updater no sabe reemplazarla, así que lo hace
  `src/main/macUpdate.ts`. Baja de la Release el `.zip` de su arquitectura (arm64 o x64), comprueba la huella sha512
  de `latest-mac.yml`, lo descomprime con `ditto` en una carpeta oculta junto a la app (`.kywai-actualizacion`) y un
  script aparte, cuando kywai se cierra, cambia la `.app` vieja por la nueva (si algo falla, deja la vieja), le quita la
  cuarentena y la reabre. Si la app trae `firmar-mac.sh` (va dentro desde esta versión), la nueva se firma con el
  certificado propio de ese Mac, para que macOS no vuelva a pedir los permisos en cada versión. Solo si la app está
  donde no se puede escribir (abierta desde el `.dmg`, «translocada» por macOS o en una carpeta sin permiso) avisa con
  «Descargar» y abre la página de la Release como antes. Las apps del Mac anteriores a este cambio aún abren la página:
  hay que descargar la nueva una última vez a mano.
- **Ventana de «Novedades»: notas de parche** (desde el 20 nov 2026, `src/shared/patchNotes.ts` y `src/shared/notasDeParche/`,
  `src/main/whatsNew.ts` y `WhatsNewDialog.tsx`). La primera vez que kywai se abre después de actualizarse sale una
  ventana como las notas de un parche: arriba y en grande lo **destacado**, cada cosa con su explicación corta y, si
  la tiene, un botón «Probarlo» que abre su sitio en Ajustes; al final, en pequeño, las **mejoras** y los **arreglos**
  en una línea cada uno. Todo sale en el idioma de la app (español si falta la traducción).
  Las notas van **dentro de la app** (`src/shared/notasDeParche/`), así que salen igual en el self host, en la app
  descargada, en **kywai cloud** y en la **web**, sin leer GitHub ni git (antes en la nube no salía nunca: el
  contenedor corre sin empaquetar y sin git). Cada nota tiene un id fijo; al cerrar la ventana se apuntan como vistas
  (`novedades-vistas.json` en la carpeta de datos) y no vuelven a salir. En una instalación nueva se dan todas por
  vistas; si kywai ya estaba configurado pero no se sabe qué vio (venía de la versión que enseñaba commits, o un
  navegador nuevo), salen las de la última semana. Las notas «solo nube» salen solo en kywai cloud y las «solo
  equipo» solo en la app instalada.
  **Navegador, cliente de escritorio (también el de kywai cloud) y Órbita** piden las notas al servidor
  (`latestWhatsNew` y `GET /api/mobile/v1/server/news`, capacidad `whatsNew`) y cada uno apunta qué vio (el navegador
  en `localStorage`, `kywai.novedades.notas`; Órbita en sus preferencias). Órbita enseña de momento los títulos en el
  idioma de la cuenta. En la nube las notas nuevas salen al desplegar la imagen nueva.
  **Cómo se añade una nota** (cada mejora, en su mismo commit; desde la 1.31.0): un archivo nuevo en
  `src/shared/notasDeParche/` llamado como su id, `AAAA-MM-DD-tema.ts` (una nota por archivo, así dos cambios a la vez
  no chocan al fusionar; `patchNotes.ts` las junta solas, de la más nueva a la más vieja, y detrás pone las de antes de
  la 1.31.0, que siguen en `patchNotesAnteriores.ts` y ya no se tocan), con `tipo` (`destacado`, `mejora` o `arreglo`), título en los 6 idiomas (es, en, pt, fr, zh, hi) y, en los destacados, una
  explicación de una o dos frases; `abrir` y `solo` son opcionales (el archivo explica cada campo). Lo interno
  (pruebas, documentos, despliegues) no lleva nota. `whatsNew.test.ts` falla si una nota está mal escrita. Para
  probar la ventana en desarrollo: `AICW_WHATS_NEW=1`.
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
- **Canal Estable o Beta** (⚙ → Ajustes → Acerca de → «Canal de actualizaciones»). **El reparto por canales todavía
  no está activado** (21 nov 2026): el selector ya está en la app, pero hasta que el comprobador de cada noche de kywai
  cloud esté en marcha los dos canales reciben las mismas versiones, y la fila lo dice («Muy pronto…», mientras
  `CHANNELS_LIVE` de `src/shared/updateChannels.ts` sea `false`). Cuando se active: las versiones de escritorio salen
  primero como **Beta**: cada mejora, en cuanto se fusiona. Una vez por semana, la que pasó las pruebas reales de la
  noche se marca como **Estable**. Si no tocas nada, tu equipo va en Estable y recibe solo esas; con Beta recibe
  todas. El canal es de cada equipo: se guarda en `update-channel.txt`, en la carpeta de datos de la app, y un cliente
  de escritorio tiene el suyo («Canal de actualizaciones de este equipo»), aparte del de su servidor. Al volver de
  Beta a Estable no se instala nada más viejo: la app sigue con su versión hasta que una Estable la alcanza («Tu
  versión va por delante de la última Estable»). La fila no sale donde no aplica: un kywai compilado desde su código
  (el Mac mini), un espacio de kywai cloud o un servidor anterior a esta versión. Por dentro (`updateChannel.ts`,
  `updater.ts`): en GitHub las Beta son «pre-release» y la Estable es la marcada como «latest»; en Beta la app acepta
  también las «pre-release». La web y los instaladores de una línea ofrecen siempre la última Estable.
- **Firma del instalador de Windows (Azure Artifact Signing, antes «Trusted Signing»):** el flujo del escaparate
  firma la app, el desinstalador y el instalador cuando el repositorio `Yiku21/kywai` tiene estos seis secretos
  (Settings → Secrets and variables → Actions): `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` (la
  aplicación de Entra con el rol «Artifact Signing Certificate Profile Signer»), `AZURE_FIRMA_ENDPOINT` (p. ej.
  `https://eus.codesigning.azure.net`, según la región de la cuenta), `AZURE_FIRMA_CUENTA` (nombre de la cuenta de
  firma) y `AZURE_FIRMA_PERFIL` (nombre del perfil de certificado «Public Trust»). Sin ellos el .exe sale sin
  firmar, como antes. Con ellos, el paso «Comprobar la firma de Windows» para la publicación si algún .exe no sale
  firmado, y las notas de la Release cambian el aviso. electron-builder firma antes de calcular `latest.yml`, así
  que las actualizaciones automáticas siguen igual; no se fija `publisherName`, de modo que la app instalada no
  exige firma a las versiones nuevas. Firmar no quita el aviso de SmartScreen al momento: Windows lo va quitando
  a medida que la gente descarga e instala versiones firmadas con la misma identidad (días o semanas). El secreto
  de la aplicación de Entra caduca (se elige al crearlo): renovarlo antes y cambiar `AZURE_CLIENT_SECRET`.
- **Mac sin firma de Apple:** Windows sin los secretos de arriba avisa con SmartScreen («Más información» →
  «Ejecutar de todas formas»). En el Mac va firmada «ad hoc»: la primera vez, clic derecho → Abrir; si dice que
  está dañada, `xattr -cr "/Applications/kywai.app"`.
- Las compiladas en el propio equipo (`instalar-mac.sh`, `instalar-linux.sh`, `npm run dist:*`) no traen
  `app-update.yml` y siguen actualizándose desde su clon de git. Es lo que usa el servidor (Mac mini).
  Si ese clon ya no está (no hay `source-dir.txt` o su carpeta no tiene `.git`) o apunta al antiguo repositorio
  público (`Yiku21/kywai` o `Yiku21/ai-cowork`, hoy el escaparate sin código), la app se actualiza desde las Releases
  del escaparate como una descargada (`isOrphanSourceBuild` en `src/main/updater.ts`, que le pone el destino con
  `setFeedURL`). Un clon de `Yiku21/kywai-original` sigue con su clon.
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

**Primera vez: «Tu primer agente»** (`src/renderer/src/ui/setup/FirstAgent.tsx`, 22 nov 2026). Una instalación
nueva de la app de escritorio empieza **sin agentes**, como kywai cloud: `loadConfig` llama a `mergeConfig(…,
{ emptyTeam: true })` cuando no hay `config.json` (o lo hay pero nunca se terminó el asistente y sigue con los
agentes de fábrica tal cual, sin cuentas ni agentes propios), la app está empaquetada y no es una self host sin
pantalla, y deja
los 6 de fábrica en `removedAgents` para que no vuelvan solos al abrirla otra vez (en desarrollo y en las pruebas
sigue el equipo de fábrica). En vez del asistente de cuatro pestañas sale un asistente de 5 pasos, de uno en uno y
con barra de progreso:

1. **Bienvenida e idioma**: el idioma ya viene elegido según el sistema (`src/main/systemLang.ts`: idiomas
   preferidos y, si el primero es inglés, el **formato regional**; un Windows en inglés con región España abre en
   español). Mientras no se termine el asistente, el motor lo vuelve a mirar en cada arranque y lo guarda en
   `config.language`; la ventana lo sigue (si en ese equipo se eligió otro a mano, manda ese). Si se
   cambia aquí, la ventana se recarga y vuelve al paso 2.
2. **¿Con qué agente empiezas?**: nada viene marcado ni sale como «Recomendado» (desde el 25 nov 2026 Hermes con
   OmniRoute es una opción más): Claude, Codex, Gemini y Hermes, y «Ver todos los agentes» abre el catálogo completo. «Siguiente» lo añade al equipo
   (`addAgent`). Si es el único, Hermes también trabaja (`plannerOnly: false`), como en kywai cloud.
3. **Instalamos lo que falta**: su programa (y Node.js o Python si hacen falta) con un clic, o «Descargar» y
   «Comprobar» si no se puede instalar desde la app. Con Hermes avisa de que OmniRoute se instala en el paso 4.
4. **Conéctalo y pruébalo**: la misma pantalla de «Configura {agente}» (`ConfigureAgent` con `firstRun`): cada agente
   abre en su primera forma de conectarse (Hermes, como los demás; OmniRoute sigue en «Clave de API» → OmniRoute con
   «Instalar y preparar OmniRoute»). «Siguiente»
   no se activa hasta que el agente responde de verdad.
5. **Listo**: enseña lo que contestó y «Ir a kywai» termina el asistente (`setupFinish`); después sale el recorrido
   de la interfaz.

«Ahora no» (o ✕) lo cierra sin añadir ningún agente y deja abajo el botón **«Conecta tu primer agente»** para
volver. Se sigue enseñando aunque el agente ya se haya añadido a mitad, hasta terminarlo. Quien ya usaba kywai no lo
ve.

Desde ⚙ → Ajustes → «Configurar agentes…» (y en una configuración vieja sin terminar) sale el **asistente de
configuración** de siempre:

1. **Agentes**: eliges cuáles usar (Hermes, Claude, Codex, Gemini, Muse y el agente local con LM Studio, Ollama o Colibri).
   Cada tarjeta lleva el **logo oficial** del agente (el mismo de «Añadir un agente» y kywai.app, de
   `src/renderer/src/assets/agentes`) sobre una placa blanca; también en «Iniciar sesión» y «Listo». Un agente a
   medida sin logo sigue con su personaje. Los personajes del 3D y de las fichas no cambian
   (`src/renderer/src/lib/AgentLogoFace.tsx`).
   Debajo, el recuadro plegable **«¿No pagas ninguna suscripción? Así puedes usar kywai gratis»** explica cómo
   montar un equipo sin pagar: «Ver los agentes gratis» abre el catálogo con «Solo gratis» (Kilo CLI primero, que ni
   siquiera pide cuenta), «Conseguir la clave» abre la página de la clave gratis de Google AI Studio (para Gemini) o
   la de OpenRouter (para que Hermes coordine con un modelo `:free`; se elige en «Sesiones» → «Configurar»), y
   recuerda que el agente local siempre es gratis. La última línea es **FreeLLMAPI** (MIT,
   github.com/tashfeenahmed/freellmapi): junta los planes gratis de decenas de proveedores tras una sola dirección
   (`http://127.0.0.1:3001`, otra con `FREELLMAPI_URL`) y salta solo al siguiente modelo cuando uno llega a su límite.
   Se instala aparte (su app o Docker) y se le ponen las claves gratis; si está abierto, se pega su clave única y
   «Conectar a Hermes» lanza `npx freellmapi@0.8.2 setup-hermes --profile kywai`, que añade el proveedor
   `freellmapi-kywai` a `~/.hermes/config.yaml` (con copia) y la clave a su `.env`, **sin cambiar el modelo por
   defecto**; luego se elige con `/model`. kywai no guarda la clave. Solo Hermes: con los demás agentes que admite su
   herramienta (OpenCode, Kilo, Aider, Goose, Qwen Code, Crush) cambiaría su modelo por defecto o necesitarían una
   variable que kywai no les pasa. Código: `src/main/freeLlmApi.ts`. Solo en self host.
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

**Introducción guiada** (desde el 20 nov 2026, rehecha el 22 nov 2026, `src/renderer/src/ui/tour/`). Al terminar
«Tu primer agente» o el asistente (en el navegador y en kywai Cloud, la primera vez que se abre en ese dispositivo)
kywai oscurece la ventana e ilumina, uno a uno, los sitios de la app con una explicación corta. Va en dos partes:
- **Lo esencial** (sale sola, 11 pasos, un minuto): quién coordina («kywai / Hermes», con la cotorra de kywai), el
  cuadro de escribir (lo sencillo se contesta al instante, lo grande se convierte en plan y quien coordina lanza él las
  herramientas de kywai; «@» y «/»), adjuntar y dictar, enviar, estado del equipo, cuota (en Hermes, el % real de
  OmniRoute o su uso de hoy), «Te necesita», Resultados (las imágenes salen ya en el propio chat), el espacio (cada
  agente con su forma y la cotorra de quien coordina) y la rueda ⚙ (tema, también Vidrio líquido). El último paso,
  en el cuadro de escribir, lleva **«Enseñarme todo»**.
- **Todo lo demás** (con «Enseñarme todo»): proyecto, barra lateral (Nuevo chat, Buscar, Historial, Amigos, Tareas,
  Tablero, Rutinas, Proyectos e importar chats), las secciones del proyecto, esfuerzo, hablar con kywai, 3D o 2D,
  «⋯» del espacio (Modo noche y Navegador), Música, ocultar el espacio y cada pestaña de Ajustes (la abre y la cierra sola). En «Conectar un agente»
  explica los pasos, los agentes gratis y que en kywai cloud Hermes entra con tu ChatGPT o Claude desde Mi cuenta →
  Mis agentes y trabaja 24/7, con OmniRoute y OpenRouter como otras opciones (ya no hay ninguno «recomendado»).
- **Se puede omitir siempre**: botón «Omitir», la ✕ o Esc. Terminada u omitida, se apunta en el dispositivo
  (`kywai.introduccion.vista` en su almacenamiento) y no vuelve a salir sola; se repite con **⚙ → «Ver la introducción»**.
- Sale después de cualquier ventana abierta (asistente, «Novedades»…) y nunca en la demo sin motor ni cuando la
  página la maneja un programa (capturas de los README y pruebas).
- Los sitios que no se ven en ese momento (ventana estrecha, espacio oculto, Amigos fuera de kywai Cloud, pestañas de
  Ajustes que no hay sin motor) se saltan solos.
- Usa [driver.js](https://github.com/nilbuild/driver.js) 1.14.0 (MIT, sin dependencias), con la versión fijada. Cada
  sitio lleva `data-tour="<id>"` en la interfaz; los pasos y sus textos (en los cinco idiomas) están en
  `introTourPasos.ts` (`essentialSteps` y `restSteps`). Para añadir un paso: marca el elemento con `data-tour`, añade el
  paso en la parte que toque (lo esencial debe seguir siendo corto: la prueba pide 12 pasos como mucho) y sus traducciones.
- **Mi cuenta** (kywai Cloud) tiene su propio recorrido de 16 pasos por cada sección del panel, también con «Omitir»;
  se repite con «Ver el recorrido» en el Resumen o en Ayuda y cuenta (está en el repositorio kywai-cloud). Desde el
  22 nov 2026 cuenta también que Hermes trabaja 24/7 con tu suscripción de ChatGPT o Claude (con la reserva gratis de
  OpenRouter) y que los créditos pagan las imágenes hechas con la GPU de kywai.

Los datos de cada equipo (configuración y proyectos) se guardan en la carpeta de datos del usuario
(`%APPDATA%\AI Cowork` en Windows, `~/Library/Application Support/AI Cowork` en Mac, `~/.config/AI Cowork` en Linux).

#### Windows

```bash
npm run dist:win
```

Genera `release/kywai-Setup-<versión>.exe`. Cópialo al otro PC y ejecútalo: te deja elegir la carpeta de
instalación y crea los accesos directos. Compilado en el propio equipo no va firmado (solo se firman los de la
Release), así que Windows puede avisar («Windows protegió tu PC»):
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

### Desinstalar kywai (22 nov 2026)

**Ajustes › Avanzado › Desinstalar kywai** quita la app de este equipo (servidor o cliente) y deja elegir:

- **Solo el programa**: los chats, proyectos, agentes, ajustes y claves se quedan. Si se vuelve a instalar, todo
  sigue ahí.
- **El programa y todos mis datos**: como una instalación nueva. Ofrece guardar antes una copia de seguridad y pide
  marcar «Entiendo…». En modo cliente borra la conexión de este equipo (en kywai Cloud, además, lo quita del espacio);
  lo del servidor o la nube no se toca.

Nunca se tocan las carpetas de proyectos elegidas fuera de kywai ni los programas de los agentes (Claude, Codex,
Gemini, Hermes, LM Studio…). «Abrir kywai al iniciar sesión» se apaga antes de cerrar.

Cómo lo hace (`src/main/uninstall.ts`):

- **Windows**: lanza `Uninstall kywai.exe /currentuser /S` (o el antiguo `Uninstall AI Cowork.exe`) y se cierra; con
  «borrar todo» añade `--borrar-datos`. El desinstalador (`build/installer.nsh`, macro `customUnInstall`) borra
  `%APPDATA%\AI Cowork`, `%APPDATA%\kywai`, `%LOCALAPPDATA%\kywai-updater` y `ai-cowork-updater`,
  `%LOCALAPPDATA%\Programs\kywai-wordcraft` y `~\.kywai-mudanza`, y quita la entrada de «Run». Si se desinstala desde
  **Aplicaciones** de Windows, pregunta con una ventana si borrar también los datos (de serie, «No»). Al actualizar
  (`--updated`) no hace nada de esto.
- **macOS**: la `.app` y, con «borrar todo», la carpeta de datos, las cachés del actualizador, los registros y
  `~/.kywai-mudanza` van a la **Papelera** (se pueden recuperar).
- **Linux**: igual con la AppImage. Si kywai vino de un paquete `.deb`/`.rpm`, la ventana explica que se quite con el
  gestor del sistema.
- En la versión de desarrollo (sin empaquetar) no se ofrece: se quita borrando su carpeta.

Para dejar un PC Windows como el de un usuario nuevo sin perder nada (pruebas de instalación limpia), hay un script
que primero solo mira y con `-Mover` lo aparta todo a una carpeta `kywai-copia-<fecha>`:
`/mnt/project-files/pc-windows-instalacion-limpia/limpiar-kywai.ps1` (en la carpeta del proyecto).

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
  segundo y al cerrar la ventana). **Lo que cambies justo antes de salir también se guarda:** al cerrar la ventana,
  salir de kywai o recargar, el preload manda lo último y espera a que el motor lo deje escrito
  (`cowork:uiSettings:saveNow`). Antes ese último aviso llegaba cuando el motor ya había guardado y estaba cerrando,
  así que un ajuste cambiado en el último segundo se perdía y, como al abrir manda la copia del disco, volvía el valor
  de antes (elegías el 2D o cambiabas de escena, salías al momento y al abrir seguía lo anterior). Se copian las claves que empiezan por `aicowork.`, `ai-cowork.` o `kywai.`
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
- **Actualizaciones grandes (cientos de cambios).** `sh()` (`src/main/setup.ts`) guarda solo los últimos 20.000
  caracteres de la salida de cada orden. Por eso el actualizador ya no lee listas largas enteras: pregunta a git si
  cambiaron las dependencias con `git diff --quiet <base> HEAD -- package.json package-lock.json`
  (`depsChangedSince`) y, si es así, ejecuta `npm install` antes de compilar. Antes buscaba `package.json` en la
  lista completa de archivos cambiados; con 763 archivos la lista llegaba cortada, se saltaba `npm install`, la
  compilación fallaba a los pocos segundos por falta de dependencias y la app volvía sola a la versión anterior (desde
  el cliente parecía que «Actualizar y reiniciar» cargaba y no hacía nada). Los cambios nuevos se listan como mucho
  100 (los más recientes) y el total sale de `git rev-list --count` (`commitCount` en `UpdateStatus`): antes el
  diálogo decía «199 cambios» cuando eran 398. Un servidor que tenga una versión anterior a este arreglo se
  desbloquea una vez a mano en la carpeta del código: `git pull --ff-only`, `npm install`, compilar y reabrir.
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
  **Con kywai Cloud (1.30.40)** no hay git: el apartado dice si el servidor tiene una versión nueva esperando a tu
  espacio y «Actualizar el servidor» hace lo mismo que «Actualizar ahora» en la web (el espacio se cambia en un par de
  minutos y Órbita se reconecta sola). Con el espacio al día, Acerca de → Órbita encuentra también la APK nueva.
- **⚙ → «Reiniciar kywai»** (pulsa dos veces para confirmar) cierra y vuelve a abrir la app si se queda
  pillada; también desde el navegador del móvil, que se recarga solo cuando vuelve. Si la app está cerrada del
  todo, no hay nada que responda al enlace: hay que abrirla en el equipo.

### Hablar con kywai por Telegram (20 nov 2026)

Idea de OpenClaw, Hermes y Manus, que se usan desde la mensajería: le escribes a kywai desde Telegram como en el chat.

1. En Telegram, abre **@BotFather**, escribe `/newbot` y copia el token que te da (se parece a `123456789:ABC…`).
2. En kywai: ⚙ → Ajustes → **Conexión → Telegram**, pega el token y pulsa **Conectar** (se comprueba con Telegram).
3. Ajustes enseña un código de 6 cifras: envíalo a tu bot (o `/start <código>`). Solo ese chat queda enlazado; a
   cualquier otro el bot le responde que es privado, así nadie que encuentre el bot puede mandar trabajo a tus agentes.
4. Lo que escribas al bot entra en el proyecto elegido (desplegable en Ajustes, o `/proyectos` y `/proyecto N` en
   Telegram) como un mensaje tuyo y pasa por el coordinador como siempre. La respuesta del equipo a esa petición, y
   hasta 3 archivos entregados (de menos de 45 MB), vuelven al chat de Telegram. El trabajo a medias no se manda.

kywai pregunta a Telegram por los mensajes nuevos con espera larga (`getUpdates`), así que no hace falta abrir puertos
ni tener dirección pública: vale en el Mac mini, en el PC y en kywai Cloud. El token se guarda cifrado con las claves
de los agentes (`telegram-bot`); el chat enlazado y el proyecto, en `telegram.json` de la carpeta de datos.
«Desenlazar» pide un código nuevo; «Quitar el bot» borra el token. Por ahora solo entiende texto (las notas de voz
vendrán después). Código: `src/main/telegram.ts`, pruebas en `telegram.test.ts`.

**Sin respuestas perdidas (24 nov 2026, v1.21.4; idea de AnyModelBot).** Todo lo que kywai manda a Telegram (textos y
archivos) pasa por una cola guardada en `telegram-outbox.json` de la carpeta de datos. Si Telegram no contesta, la red
falla o pide esperar (429 con `retry_after`), se reintenta en orden con esperas de 5 s, 10 s, 20 s… hasta 10 minutos,
también tras reiniciar kywai. Las peticiones hechas desde Telegram (`runs`, las 100 últimas) y lo ya enviado (`sent`)
se guardan en `telegram.json`, así la respuesta a algo que pediste antes de cerrar kywai llega igual y nada sale dos
veces. Lo que Telegram rechaza para siempre (400, 403 bot bloqueado, 404) o lleva más de un día esperando se descarta.
Mientras haya algo en la cola, Ajustes → Conexión → Telegram dice cuántas respuestas esperan.

### Hablar con kywai por WhatsApp (20 nov 2026)

Como en OpenClaw: kywai se vincula a tu WhatsApp como un dispositivo más (igual que WhatsApp Web) y le escribes en tu
**chat contigo mismo** («Tú» / «Mensaje a ti mismo»).

1. En kywai: ⚙ → Ajustes → **Conexión → WhatsApp → Vincular**. Sale un QR (se renueva solo cada ~20 s).
2. En el móvil: WhatsApp → Ajustes → **Dispositivos vinculados → Vincular un dispositivo**, y escanea el QR.
3. Escribe en tu chat contigo mismo. Lo que escribas entra en el proyecto elegido (desplegable en Ajustes, o
   `/proyectos` y `/proyecto N`) como un mensaje tuyo. La respuesta del equipo y hasta 3 archivos entregados (de
   menos de 90 MB) vuelven a ese chat, marcados con 🤖 para distinguirlos de lo tuyo.

kywai **solo lee y escribe tu chat contigo mismo**: nunca los chats con otras personas ni los grupos, y nunca escribe
a nadie más. Se conecta hacia fuera (Baileys, el protocolo de WhatsApp Web), así que no hace falta abrir puertos: vale
en el Mac mini, en el PC y en kywai Cloud. No es la API oficial para empresas (esa pide cuenta de Meta Business, otro
número y una dirección pública; Yil eligió el QR el 20 nov): WhatsApp podría bloquear un número que se use como bot,
y por eso kywai no escribe a nadie más que a ti. La sesión se guarda en `whatsapp-sesion/` de la carpeta de datos
(vale como tu WhatsApp Web: no la compartas) y el proyecto en `whatsapp.json`. Al abrir kywai se vuelve a conectar
sola. **Desvincular** cierra la sesión y la borra; si quitas kywai de Dispositivos vinculados en el móvil, Ajustes lo
dice y hay que volver a escanear. Por ahora solo entiende texto. Código: `src/main/whatsapp.ts` (lógica, con pruebas
en `whatsapp.test.ts`) y `src/main/whatsappBaileys.ts` (la conexión).

### Hablar con kywai desde Slack (22 nov 2026)

Idea de OpenComputer (diggerhq/opencomputer, Apache 2.0), que lanza agentes al mencionarlo en Slack. kywai se usa
desde Slack como desde Telegram, y en un canal lo puede usar todo el equipo.

1. En kywai: ⚙ → Ajustes → **Conexión → Slack → Crear la app**. Se abre Slack con la app ya rellenada (un manifiesto
   con Socket Mode y solo los permisos que hacen falta: leer menciones y mensajes directos, escribir y subir
   archivos). Elige el espacio y pulsa **Create**.
2. **Install to Workspace** y copia el **Bot User OAuth Token** (`xoxb-…`).
3. En **Basic Information → App-Level Tokens**, crea uno con el permiso `connections:write` (`xapp-…`).
4. Pega los dos en Ajustes y pulsa **Conectar**. kywai los comprueba con Slack y los guarda cifrados.
5. Enlaza UNA conversación: manda el código de 6 cifras que enseña Ajustes por mensaje directo al bot, o en un canal
   («/invite @kywai» y luego «@kywai 123456»). Las demás conversaciones reciben que el bot es privado.

En un mensaje directo vale cualquier mensaje; en un canal, solo los que mencionan a @kywai. Al recibirlo pone 👀 y la
respuesta del equipo (no las tareas a medias) llega **en el hilo de ese mensaje**, con hasta 3 archivos entregados.
Por defecto solo quien enlazó puede pedir trabajo; **Todo el canal puede pedir trabajo** lo abre a sus compañeros
(lanzan tareas con tus agentes, tus créditos y tus permisos). «proyectos» y «proyecto N» cambian de proyecto, igual
que el desplegable de Ajustes. Socket Mode es una conexión que abre kywai hacia Slack: no hace falta abrir puertos
ni tener dirección pública, así que vale en el Mac mini, en el PC y en kywai Cloud. Código: `src/main/slack.ts`
(pruebas en `slack.test.ts`); datos en `slack.json` de la carpeta de datos.

### Hablar con kywai desde Microsoft Teams (22 nov 2026)

Un bot de Teams de verdad necesita una dirección pública y Azure Bot Service, y kywai corre sin puertos abiertos. Por
eso kywai entra en Teams **con tu cuenta**, por Microsoft Graph, y mira un chat que eliges (como WhatsApp con tu chat
contigo mismo):

1. ⚙ → Ajustes → **Conexión → Microsoft Teams → Entrar**. Sale un código: escríbelo en microsoft.com/devicelogin,
   entra con tu cuenta de **trabajo o de centro educativo** y acepta los permisos (Chat.ReadWrite para tus chats,
   Files.ReadWrite para subir lo entregado a tu OneDrive y User.Read; ninguno pide permiso del administrador). Graph
   no da los chats de las cuentas personales de Teams.
2. Elige el chat: **Tú (chat contigo mismo)** sale primero; también vale un chat de grupo con tu equipo.
3. Lo que escribas en ese chat llega al proyecto elegido (o «proyectos» y «proyecto N»). kywai lo mira cada 5 s. La
   respuesta vuelve al chat marcada con 🤖, con hasta 3 archivos, que se suben a la carpeta **kywai** de tu OneDrive y
   van adjuntos.

Por defecto solo cuenta lo que escribes tú; **Todos los del chat pueden pedir trabajo** lo abre a los demás del chat.
**Salir** borra la sesión (cifrada con las claves de los agentes). Hace falta una app de Microsoft Entra (cliente
público, sin secreto): la de kywai va en `TEAMS_CLIENT_ID` de `src/main/index.ts` (o la variable
`KYWAI_TEAMS_CLIENT_ID`); mientras esté vacía, Ajustes pide el id de una app propia (portal.azure.com → App
registrations → New registration, «Allow public client flows» y los tres permisos delegados). Código:
`src/main/teams.ts` (pruebas en `teams.test.ts`); datos en `teams.json`.

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

**Con kywai Cloud (1.30.36):** el espacio de la nube no lleva la APK dentro, así que baja la última Órbita
publicada del repositorio público (la misma de la última Release), comprueba su huella y se la ofrece al móvil
emparejado igual que un ordenador. No hace falta ningún ordenador: Ajustes → Acerca de → **Órbita** dice si hay una
versión nueva y «Instalar la versión …» la instala encima.

Si el ordenador tiene kywai **descargado de Releases** (sin la carpeta del código), no hay `android/release/` que
leer: cuando el móvil pregunta, kywai baja `orbita.json` y `orbita.apk` de `master` del repositorio público
(`raw.githubusercontent.com/Yiku21/kywai/master/android/release/`), comprueba que la APK es exactamente la anotada
(huella SHA-256) y la guarda en su carpeta de datos (`orbita-release/`). Consulta como mucho cada 15 minutos y solo
vuelve a bajar la APK si se ha publicado otra; sin internet sigue ofreciendo la que ya tenía. Así a cualquier
usuario le llega sola la misma Órbita que a la Release, sin bajarla a mano (`src/main/orbitaRelease.ts`).

**La APK se publica sola desde GitHub.** Cada vez que cambia el código de Órbita en `master`, GitHub Actions
(«Publicar Órbita», `.github/workflows/publicar-orbita.yml`, que corre en la máquina de pruebas del Mac mini) pasa las pruebas de Android, compila la app firmada con
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

**Solo el chat, sin 3D (1.30.39).** Órbita es para usar kywai a distancia y rápido: abre directa en el chat, a toda
la pantalla, sin el mundo 3D detrás (carga antes y gasta menos batería). Las pestañas son Chat, Archivos, Tareas y
Resultados; cerrar otro panel vuelve al chat. Quien quiera ver a los agentes en su mundo lo enciende en Ajustes →
General → **«Ver el espacio 3D»**: entonces Órbita es como se describe abajo. En el escritorio el 3D sigue igual.
Lo decide `Preferences.space3d` (`chatOnly` en `OrbitaModel`).

**Cómo es Órbita con el espacio 3D.** El mundo 3D ocupa toda la pantalla y todo lo demás flota encima en cristal, sin
recuadros que lo corten:

- **Barra lateral**, como en el escritorio: «Nuevo chat», el buscador (busca en los títulos y en los mensajes de todos
  los chats, con filtros y salto al mensaje), «Historial» (todos los chats por fechas, ver [Historial](#historial)), «Fijados» (en el escritorio se llama «Favoritos»), los proyectos con sus chats retomables (toca uno para seguirlo), «Música» y «Ajustes». **Plegada no desaparece:** queda una columna de cristal a lo largo de la izquierda
  con el logo de kywai arriba y los accesos usables sin desplegarla (Nuevo, Buscar, Historial, Más, tus proyectos y
  Ajustes abajo). **Menos cosas en pantalla, como el escritorio (1.30.36):** Chat, Tareas y Resultados ya no se repiten
  en la barra (están en las pestañas de arriba), «Te necesita» solo sale cuando hay algo pendiente (si no, está en
  «Más») y la Música también va en «Más». En la tableta cada icono lleva su nombre debajo; en el móvil en
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
- **Hablar con kywai siempre a mano (1.30.36):** junto a esa ficha hay un botón redondo con la onda. Tócalo desde
  cualquier pestaña (también el Espacio) y se abre el chat con la voz en directo ya empezada; lo que se dice queda
  escrito. Sale si el ordenador o kywai Cloud tienen la voz en directo y no hay ya una llamada (`LiveTalkButton` en
  `ui/orbita/LiveVoiceUi.kt`). El botón de la onda del cuadro de escribir sigue igual.
- **Peluches, como el escritorio (1.30.36):** los agentes de Órbita son los mismos peluches que en kywai
  (los dibujos de `src/renderer/src/assets/peluche`, copiados en `android/app/src/main/assets/peluche`), con sus ojos
  pintados encima: parpadean, se concentran al trabajar y entornan los ojos al pensar. Salen en el chat, las fichas,
  las listas y la ficha de abajo (`ui/plush/PlushAvatar.kt`) y en el Espacio 3D, de pie en cada puesto y siempre de
  cara (`drawPlush` en `ui/space/gl/SpaceRenderer.kt`). Quién lleva qué peluche se decide igual que en el escritorio
  (`ui/plush/Plush.kt`, copia de `lib/plush.ts`). En el 3D, un agente parado solo lleva una píldora con su nombre; la
  tarjeta con el modelo y el estado sale cuando trabaja, piensa, espera, falla, te necesita o lo tocas.
- **Letras legibles con todos los temas (1.30.36):** las ventanas (Novedades, cambiar nombre, plantillas…), los bloques
  de código y los botones rojos usan los colores del tema; antes tenían un azul oscuro fijo y con un tema claro las
  letras oscuras no se leían.
- **Controles de la cámara** (acercar, alejar, centrar) flotando abajo a la derecha en la tableta.
- **Música sin anuncios:** ☰ → Música abre las radios de SomaFM con buscador y volumen. Mientras suena
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

### Conectar otras apps con AG-UI

(17 nov 2026, protocolo [AG-UI](https://github.com/ag-ui-protocol/ag-ui), MIT; escrito desde cero, sin su SDK.) Una
app que habla AG-UI (CopilotKit, un panel propio, un bot) puede usar kywai como su agente: manda el `RunAgentInput`
de AG-UI a `POST /api/mobile/v1/agui` con el token de un dispositivo emparejado (`Authorization: Bearer`, el mismo
emparejamiento que Órbita) y recibe la respuesta del equipo por SSE como eventos AG-UI:
`RUN_STARTED`, el texto de Hermes y de los agentes (`TEXT_MESSAGE_START/CONTENT/END`, solo lo nuevo cada vez), cada
tarea como un paso (`STEP_STARTED/FINISHED`) y `RUN_FINISHED` o `RUN_ERROR`. Se manda el último mensaje con
`role: "user"` (el historial ya lo tiene kywai); `runId` evita repetir la petición si la app reintenta. Si kywai
espera algo de ti, llega `CUSTOM` `kywai.plan` (un plan que aprobar) o `kywai.questions` (preguntas con opciones) y
la ejecución termina: la siguiente petición con tu respuesta sigue en la misma conversación. `threadId` es una
conversación de kywai o cualquier otro id (entonces se crea una conversación «AG-UI» y se recuerda hasta reiniciar);
la cabecera `X-Kywai-Conversation` dice cuál es. Las herramientas del lado de la app (`tools` de AG-UI) aún no se
usan. Código: `src/main/agui.ts` y `mobileApi.ts`. En kywai cloud vale igual con la dirección de tu espacio.

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

**Cambiar de modo cuando quieras.** En ⚙ → Ajustes → Conexión → Este equipo está **«Cómo se usa este equipo»** con el botón
**Cambiar…**, tanto en el servidor como en el cliente (también en kywai Cloud). Pide confirmación, reinicia kywai y
vuelve a enseñar la primera pantalla: servidor, cliente de otro kywai o kywai Cloud. Los proyectos de este equipo no se
borran; si era cliente, olvida la conexión (en kywai Cloud, además, el equipo se quita de Mi cuenta → Seguridad). Solo
sale en la app de escritorio, nunca en el navegador, para que nadie lo cambie desde fuera. Código: `chooseModeAgain()`
en `src/main/client.ts`: borra `client.json` y deja la marca `elegir-modo` en la carpeta de datos de la app; mientras
exista, el arranque pregunta aunque el equipo tenga datos de servidor (`startMode()` en `src/main/clientConfig.ts`), y
se quita al elegir. Sin la marca, un servidor volvía a arrancar como servidor sin preguntar (arreglado el 23 nov 2026). En Órbita no hay modo servidor: **Desvincular este móvil** (Ajustes → Conexión) vuelve a la
bienvenida, donde se elige otra vez «Conectar con mi ordenador» o «Entrar con kywai cloud» (desde la pantalla de la
dirección, la flecha atrás también lleva allí).

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
  versiones**: la de este equipo queda como `nombre (conflicto PC-Yil 2026-10-12 15-30).ext`, la del servidor se baja con
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
  reinicia). El emparejamiento se mantiene. Tras pulsar **«Instalar»** la fila dice qué pasa en el idioma de la
  interfaz («Descargando la versión…: 45 %», «Instalando…») y, si la descarga falla, el motivo; nunca se queda callada.
  Un cliente Windows conectado a kywai Cloud se actualiza desde GitHub (el espacio no publica el cliente). En el Mac la
  descarga se corta si pasa 90 s sin recibir nada (una conexión lenta pero viva sigue) y, si la versión preparada
  desapareció, se vuelve a bajar al pulsar otra vez. Mientras espera, la interfaz vuelve a pedir la instalación cada
  ~30 s (así se instala aunque la descarga termine tarde) y, si a los 4 min el porcentaje lleva un rato sin moverse, dice
  que se cierre kywai del todo y se abra de nuevo (la versión nueva se instala al cerrar).

Hoy es solo para clientes Windows. Un cliente Linux o Mac descargado de la Release se actualiza desde GitHub (ver
«Descargar la versión lista (GitHub Releases)»); uno compilado en el equipo, con `scripts/actualizar-mac.sh` o `scripts/actualizar-linux.sh`. Un cliente
instalado antes de este sistema hay que cambiarlo una vez a mano.


#### Usar kywai cloud (cliente de tu espacio en la nube)

La primera pantalla tiene una tercera opción, **«Usar kywai cloud»** (también en la pantalla de conectar). Sirve para
usar tu espacio de kywai Cloud desde la app instalada, sin IP, sin Tailscale y sin código de 6 cifras:

1. Al pulsarla, la app pide un código a Mi cuenta (`cuenta.kywai.app`) y abre tu navegador en
   `cuenta.kywai.app/conectar?c=XXXX-XXXX`. La app enseña el mismo código para que compruebes que coinciden.
2. Inicias sesión en Mi cuenta (la contraseña nunca se escribe en la app) y pulsas «Conectar este equipo».
3. La app recibe un pase de un solo uso para tu espacio, lo cambia por su propia llave de dispositivo y abre kywai.

La llave se guarda cifrada como la de cualquier cliente, aparece en Mi cuenta → Seguridad («Equipos y móviles
conectados») y se desconecta desde allí. Como en la nube Caddy no deja pasar cookies, la app manda la llave en la
cabecera `Authorization` solo a la dirección de su espacio (`<id>.nube.kywai.app`; cualquier otra dirección que diera
el portal se rechaza). «Olvidar este dispositivo» también lo quita del espacio. Si el espacio ya no reconoce el
equipo, la app vuelve a la pantalla de kywai Cloud. En modo nube el cliente se actualiza desde GitHub Releases, también
en Windows (el espacio no publica instaladores). Código: `startCloud()` y `finishCloud()` en `src/main/client.ts`,
`cloudSpaceOrigin()` en `src/main/clientConfig.ts`; la parte del portal y del espacio está en el repositorio de kywai
Cloud.

**En Órbita** la bienvenida tiene el botón **«Entrar con kywai cloud»** y funciona igual: abre el navegador en Mi cuenta,
enseña el código para compararlo y, cuando lo confirmas, empareja el móvil con su propia llave (la misma pantalla de
Seguridad lo lista y lo quita). La dirección que dé el portal solo se acepta si es `https://<id>.nube.kywai.app`. Código:
`data/net/CloudLogin.kt` y `startCloud()` en `ui/onboarding/OnboardingViewModel.kt`.

**Certificados en Órbita (kywai 1.29.9, 24 nov 2026).** Órbita comprueba el certificado de tu espacio (o de tu

**Órbita y kywai Cloud usan el TLS normal de Android (kywai 1.30.13, 24 nov 2026).** Con la 1.29.9 Yil seguía viendo «No se pudo llegar a tu espacio de kywai Cloud». Ahora los espacios de la nube (`*.nube.kywai.app`, sin huella fijada) se conectan con la comprobación de certificados de Android tal cual, igual que Mi cuenta (`CloudLogin`), que sí funcionaba. La validación propia con huella (`PinningTrustManager`) queda solo para el ordenador de casa. Si aun así falla, debajo del aviso sale entre paréntesis el motivo técnico (por ejemplo `SSLHandshakeException: …`, `UnknownHostException` o `SocketTimeoutException`), sin direcciones ni datos de la cuenta, para saber al momento si es el certificado, el nombre o el tiempo. Con un espacio de la nube, «Sin conexión» ya no habla de Tailscale ni de abrir kywai en el ordenador: pide comprobar internet y añade el motivo (o el código HTTP si el servidor contestó al abrir la conexión en vivo). En la nube, la conexión en vivo (`/api/mobile/v1/events`, WebSocket) daba 400 en la comprobación del portal; se arregló en Kywai-Cloud#146.
ordenador) con `PinningTrustManager` (`data/net/Tls.kt`): primero los certificados del sistema y, si no los reconoce,
solo el certificado cuya huella confirmaste. Hasta la 1.29.9 le preguntaba al sistema sin decirle de qué servidor era,
y como la app tiene reglas de red por dominio (`res/xml/network_security_config.xml`, las de `localhost`), Android
rechazaba la pregunta («Domain specific configurations require that hostname aware checkServerTrusted…»). Así,
«Entrar con kywai cloud» fallaba justo tras confirmar en Mi cuenta con «No se pudo llegar a tu espacio de kywai Cloud»,
sin que la petición llegara al servidor. Ahora es un `X509ExtendedTrustManager` que le pasa al sistema la conexión (y
con ella el nombre). Además, el emparejamiento con kywai Cloud (`pairWithPass`) espera hasta 45 s, porque el servidor
reintenta hasta 20 s si el portal tarda. Prueba: `PinningTrustManagerTest`.

**Mientras el espacio se actualiza** (despliegue de una versión nueva), el servidor responde 502, 503 o 504 durante
unos segundos. La app ya no enseña «Error 502»: lo que solo lee (estados y listas, p. ej. Ajustes → Multimedia) espera
y lo intenta otra vez solo (a los 3, 6 y 10 s), y si sigue sin responder dice «El servidor se está actualizando a una
versión nueva. Espera un minuto y vuelve a intentarlo». Lo demás no se repite (para no hacer dos veces una acción) y
da ese mismo aviso. Pedido por Yil el 23 nov 2026. Código: `call()` en `src/renderer/src/lib/api.ts`.

**Una actualización de la nube no corta a quien está trabajando** (1.30.8, pedido por Yil el 24 nov 2026). Cada espacio
escribe cada 20 s en su carpeta de datos `ocupado.json`: cuántas peticiones del chat o del equipo siguen en marcha
(incluye /video y las respuestas de Hermes), cuántos programas de fondo hay (ffmpeg, renders, instalaciones), si la voz
en directo está abierta, cuándo se tocó la interfaz por última vez (la web lo avisa como mucho una vez por minuto con
`cloudActivity`) y la zona horaria de quien la usa. Solo números y horas: nada de lo que se escribe. El despliegue de
kywai Cloud lo lee desde el servidor y no cambia un espacio ocupado (o usado en los últimos 5 min) hasta que queda
libre. Código: `src/main/cloudBusy.ts` (lo arranca `index.ts` solo en la nube) y `src/renderer/src/lib/cloudActivity.ts`.

Cuando el servidor deja a un espacio con la versión nueva esperando (porque estaba ocupado), deja también
`actualizacion-pendiente.json` en su carpeta de datos. Con él (1.30.10) se enciende el aviso amarillo de ⚙ y sale abajo a
la derecha la franja **«Hay una versión nueva de kywai» con «Actualizar ahora» y «Luego»**. Desde el 24 nov 2026
(Yil) el espacio **no se actualiza hasta que su dueño lo pide** (ver el despliegue en kywai-cloud: solo se cambian solos
los espacios apagados y los que llevan 24 h sin nadie conectado ni nada en marcha). «Luego» calla el aviso un día en
ese navegador. «Actualizar ahora» lo
apunta en `ocupado.json` y el servidor lo cambia en un par de minutos aunque haya trabajo en marcha; lo que estaba a
medias sigue solo al volver y la página se recarga sola. Lo mismo está en ⚙ → Buscar actualizaciones. Código:
`src/renderer/src/ui/quota/CloudUpdateToast.tsx`.

**Sin versión nueva esperando** (1.30.64, Yil 25 nov: «¿por qué dice que los updates los genera la nube?»), ⚙ → Buscar
actualizaciones en la nube dice «Tu espacio tiene la última versión disponible. Cuando haya una nueva, aparecerá aquí el
botón «Actualizar ahora»» en vez de «kywai Cloud gestiona las actualizaciones», que parecía decir que no se podía hacer
nada. Pulsar sin versión esperando devuelve «Tu espacio ya tiene la última versión.».

**Barra de «Actualizar ahora»** (1.30.30, Yil 24 nov 2026: «dame una barra de update»). Tras pulsar el botón, el aviso
y ⚙ → Buscar actualizaciones enseñan una barra con tres pasos (**Pedido enviado**, **Guardando tus datos**,
**Reiniciando**) y el tiempo que suele faltar. Los pasos son los reales: el servidor los apunta en
`actualizacion-pendiente.json` (`paso`: `copiando` o `reiniciando`, `pasoDesde` en segundos) y la app lo mira cada 3 s
durante 15 min tras pulsar (`requestUpdateNow`, `readPending` añade también `pedido`, la hora del clic). Dentro de cada
paso la barra avanza según lo que suele tardar y frena al final, sin pasarse. Durante el reinicio, la página «Estamos
actualizando tu espacio» de Caddy sigue con la barra en el último paso. Desde la 1.30.29 el servidor atiende el botón
en cada vuelta (2 min) aunque haya fusiones esperando. Código: `src/renderer/src/lib/cloudUpdateProgress.ts` y
`src/renderer/src/ui/quota/CloudUpdateProgress.tsx`. Desde la 1.30.48 la barra sale nada más pulsar (con la hora del
clic, `withAskedAt`, si el proceso de la app aún no ha contestado) y la propia barra pregunta `updatePending()` cada 3 s,
sin depender de que llegue el evento `update.pending`. Un espacio con una versión anterior a la 1.30.30 aún no tiene la
barra en el aviso: la verá a partir de esa actualización (la página de reinicio de Caddy sí la enseña siempre).
Desde la 1.38.1 la barra (y las de descarga de modelos locales, en `LocalConfig` y `LocalSetupToast`) lleva los colores de
la marca kywai —azul, verde y naranja, los de las tres gotas del logo— en vez del morado de Qwen: los tokens `--k-blue`,
`--k-green`, `--k-orange` y `--k-marca` (degradado) están en `src/renderer/src/styles/tokens.css`, y las barras de
`common/ui.module.css` los usan con `.trackMarca` + `.fillMarca`. El degradado mide como toda la barra y se descubre
al avanzar.

Al volver tras un reinicio (también tras actualizar el espacio), la web se recarga sola; desde la 1.30.11 **guarda antes
el texto que estabas escribiendo sin enviar** y lo devuelve al cuadro al abrir (solo en esa pestaña, `sessionStorage`).
Las peticiones que estaban a medias siguen solas como siempre (`resumeAfterRestart`). Código: `keepUnsent` y
`takeUnsent` en `src/renderer/src/ui/left/composerStore.ts`, y el evento `cowork:before-reload` de `lib/api.ts`.

### kywai sin pantalla (servidor sin monitor o en la nube)

kywai puede arrancar **sin abrir ninguna ventana**, solo como servidor: para un equipo sin monitor o para un
contenedor en la nube. Todo se usa desde fuera (navegador, cliente de escritorio u Órbita) por el acceso web de siempre.

- **Cómo se activa:** con la variable `KYWAI_HEADLESS=1` o el argumento `--headless`. En Linux Electron sigue
  necesitando una pantalla, aunque sea virtual: `xvfb-run -a electron --no-sandbox .` (o el ejecutable instalado).
- **Qué cambia:** no se crea la ventana ni se pregunta «servidor o cliente» (siempre es servidor); el **acceso web se
  enciende solo** en cada arranque, porque es la única forma de entrar; cerrar las ventanas ocultas de paso (capturas)
  no apaga la app; un fallo al arrancar va al registro y el proceso termina con error, sin aviso que nadie podría
  cerrar; no se buscan actualizaciones desde dentro (llegan con una imagen nueva); y la carpeta de trabajo va con los
  datos (`<carpeta de datos>/workspace`), no junto al código.
- **El código de acceso** no se escribe nunca en el registro: queda en `acceso-servidor.txt`, en la carpeta de datos
  (`~/.config/AI Cowork/` en Linux), que solo puede leer el usuario del proceso y que el servidor no comparte con los
  clientes. Si se genera un código nuevo desde Ajustes, el archivo se actualiza.
- **Dónde escucha:** como siempre, en el propio equipo y en la IP de Tailscale. Con `KYWAI_BIND` se añade otra
  dirección IPv4; `KYWAI_BIND=0.0.0.0` escucha en todas, que es lo que hace falta dentro de un contenedor para que
  llegue el proxy de fuera. Sigue pidiendo el código de acceso o la llave de un dispositivo emparejado en todas.
  No uses `0.0.0.0` en un equipo conectado directamente a internet sin un proxy con HTTPS delante.

Código: `src/main/headless.ts` (se prueba solo, sin Electron), `startHeadless()` en `src/main/index.ts` y
`setExtraBind()` en `src/main/webServer.ts`.

**En kywai Cloud (`KYWAI_CLOUD=1`), conectar equipos con la cuenta kywai.** La app de escritorio y Órbita se conectan
con «Usar kywai cloud»: inician sesión en Mi cuenta (cuenta.kywai.app) y el portal pide a este servidor un **pase de
emparejamiento** de 60 segundos y un solo uso (`cloudPairingPass`). La app lo cambia por su llave de dispositivo de
siempre en `/api/mobile/v1/pair` (campo `pass` en vez de `code`), que queda en el registro de dispositivos. En este
modo **no se empareja con el código de acceso ni con el de 6 cifras** (responde `CLOUD_ACCOUNT_REQUIRED`), para que
nadie pueda probar códigos desde internet, y los intentos fallidos se cuentan por la dirección real que manda Caddy
(último valor de `X-Forwarded-For`), no por la del proxy. Mi cuenta → Seguridad enseña los equipos conectados
(`cloudListDevices`) y los desconecta (`cloudRevokeDevice`). Estos tres métodos solo los puede usar el dueño desde
el propio servidor (el portal), nunca a través del proxy.

**En kywai Cloud, conectar agentes con la cuenta propia.** Desde Mi cuenta → Mis agentes, «Iniciar sesión con…»
instala el programa del agente en el espacio (si falta) y lanza su inicio de sesión oficial en una terminal falsa; al
portal solo le llegan el enlace de la web del proveedor, el código y el estado (`cloudAccountLogin.ts`). Además de
Claude, Gemini, Amp, Qoder, Cline, OpenCode y Copilot, entran así **Kimi Code, OpenHands, MiniMax y Muse** (código de
dispositivo), **ForgeCode, Open Interpreter y OpenClaw** con la suscripción de ChatGPT, y **Auggie**, cuya web da un
texto en JSON que se pega de vuelta. **Rovo Dev** no tiene inicio de sesión en el navegador: se conecta con el correo
de Atlassian y un token de API, que `acli` lee por su entrada estándar. Las recetas de estos (enlace, código y teclas
que se pulsan solas) y cómo se instalan en `~/.local/bin` cuando la orden del catálogo no sirve en el espacio están en
`src/main/cloudMoreAccounts.ts`, con sus pruebas. **Antigravity** sigue sin conectarse en la nube: las condiciones de
Google prohíben usar su cuenta desde programas de terceros.

**Copilot en la nube:** el espacio no tiene llavero del sistema, así que, después de autorizar el código en GitHub,
`copilot login` pregunta si guarda el permiso en su archivo de configuración (`~/.copilot`). La receta contesta «sí»
sola (`answers` en `AccountLoginSpec`); antes nadie contestaba, el inicio de sesión se quedaba esperando y el portal
acababa diciendo que no se había conectado aunque la persona sí lo hubiera autorizado.

**OpenHands (1.4.2):** se lanza con `openhands --headless --json -f <encargo>`: el encargo entra entero por archivo y su
salida es un evento JSON por línea. La respuesta es el mensaje de su herramienta `finish` o su último mensaje
(`openHandsReply` en `src/main/agents/generic.ts`, activado con `output: 'openhands'` en su ficha del catálogo). Antes
se lanzaba con `-t` sin `--json` y la respuesta solo salía dentro del recuadro de su resumen («│ KYWAI_… │» o
«finish: {…}»), así que la prueba nunca la encontraba y decía «Entraste, pero no respondió a la prueba» aunque hubiera
contestado. `openhands login` baja de la cuenta de OpenHands Cloud el modelo y la clave de su servicio de modelos (sus
créditos); si ya había una configuración de un intento anterior, la receta contesta «y» a «overwrite your existing
configuration?». OpenHands no deja elegir el modelo al lanzarlo: la ficha «Configura» dice que usa el de tu cuenta en
vez de pedir uno. Si su modelo devuelve un error (`ConversationErrorEvent`), se distingue: sin saldo o cupo
(«Budget has been exceeded») sale el motivo `quota` y sin modelo configurado (`rejected` de `probeFailure`) el motivo `auth` del inicio de sesión, con su propio aviso en la
app y en Mi cuenta, en vez del genérico de la prueba.

**Revisión de los inicios de sesión y de la prueba (1.9.2):** probado con los programas reales de 21 agentes en un
HOME vacío, y OpenHands de punta a punta (entrar, probar y volver a entrar) contra una nube falsa con las mismas rutas
que la suya. Lo que se arregló:

- **Volver a darle a «Iniciar sesión» cuando ya se había entrado.** Muchos programas, con la sesión ya guardada en el
  espacio, terminan bien sin enseñar ningún enlace (OpenHands dice «You are already logged in»; Qoder, Crush y Auggie,
  parecido). Antes eso acababa en «No se pudo iniciar sesión». Ahora (`createAccountLogin` en
  `src/main/cloudAccountLogin.ts`), si el programa sale con 0 sin enlace, se prueba el agente con la sesión que ya
  tiene: si responde, queda conectado; si no, sale el aviso de siempre (no «Entraste…», porque no llegó a entrar aquí).
  Los que en vez de salir abren su pantalla (Letta, Droid, Qwen Code, Antigravity) se prueban también mientras no
  enseñan el enlace, y el minuto de espera del enlace no corta una prueba que esté en marcha.
- **OpenHands 1.14.** Su instalador oficial (`install.openhands.dev`, el que usa el espacio) instala la 1.14, que con
  `--json` da cada evento en varias líneas con sangría tras «--JSON Event--» (la 1.16 da uno por línea). `jsonObjects`
  en `generic.ts` lee las dos formas. Sin esto la prueba seguía diciendo que no respondía.
- **Amp** cambió su código a tres grupos («VC8-33X-DZS») y nunca se llegaba a enseñar el enlace. Además, si el código
  de un proveedor no coincide con su patrón, vale el que va dentro de su propio enlace (`linkCode`).
- **Menús en espacios lentos.** Las teclas que eligen «entrar con tu cuenta» (Letta, Kilo, Cline, Droid, Crush, Qwen
  Code, Antigravity, Forge, OpenCode) esperan además a que su pantalla salga (`keys` con un patrón); si no sale en 20 s,
  se pulsan igual. Antes, con el espacio cargado, la tecla se perdía y no aparecía el enlace.
- **Crush y Cline no recibían el encargo.** Leen stdin solo si es un archivo o una tubería de verdad; la de Node es un
  socket, y decían «No prompt provided» o «interactive mode requires a TTY». Ahora (`stdinFile` en `spawn.ts`) el
  encargo entra desde un archivo temporal (solo legible por el usuario y borrado al arrancar el programa).
- **Auggie 1.x** ya no tiene `--quiet`: con él salía «Unknown option» y nunca respondía. Se lanza con `--print`.
- **«Sin entrar» bien explicado.** Cursor («Authentication required»), Grok («Not signed in»), Qwen Code («No auth type
  is selected»), Kimi («No model configured… /login») y Copilot salían como fallo genérico de la prueba; ahora dicen que
  falta iniciar sesión (`NOT_SIGNED_IN_RE`).

Sin poder comprobar aquí: Copilot y Crush con GitHub (el entorno de pruebas bloquea su web de códigos), Muse, Hermes y
Open Interpreter. Amp, sin haber entrado, se queda callado en vez de decir que falta entrar.

### Dictado por voz

El botón del micrófono, junto a los de adjuntar, graba una nota de voz. Al pulsarlo otra vez (o a los 5 minutos)
la nota **se envía al momento**, sin esperar: sale ya en el chat con «Nota de voz · pasándola a texto…» y puedes
seguir escribiendo o grabar otra. Por detrás, el equipo la convierte en texto **en el propio equipo** con Whisper
(faster-whisper, modelo «large-v3-turbo» en equipos con 12 GB de memoria o más y «small» en los demás —contando el límite del contenedor, así que en kywai cloud es «small»—, en el idioma de la app; `KYWAI_WHISPER=small` fuerza el rápido): sin APIs ni servicios externos, y el audio se borra al
terminar. En cuanto tiene el texto, ese mismo mensaje del chat pasa a enseñar lo dicho (con la marca «Nota de voz»)
y va al equipo como un mensaje normal: a Hermes, o directo al agente si empieza por «@Agente», con las órdenes
(«/video …», «/recuerda …») y con «Responder». Lo que hubiera escrito en el cuadro va delante de lo dicho, y los
archivos adjuntos van con la nota. Si no se entiende nada o el dictado falla, el mensaje queda como «no se pudo
pasar a texto» y un aviso dice por qué: vuelve a grabarla. Con «/nuevo», «/model» o «/uso» en el cuadro, lo dicho
se queda en el cuadro sin enviar. La primera vez se prepara solo (instala `uv` si falta y descarga el modelo,
~480 MB) y tarda unos minutos; después, unos segundos por nota.

**Sin frases inventadas.** Con silencio, un zumbido o un audio de medio segundo, Whisper no devuelve nada sino los
créditos de subtítulos con los que se entrenó («Subtítulos por la comunidad de Amara.org», «Gracias por ver el
vídeo»), y el agente contestaba a esa frase. Ahora hay tres frenos:

- **Antes de enviar** (escritorio y web): si la nota dura menos de medio segundo o no se oye nada (micrófono en
  silencio, sin permiso o el que no es), no se envía y el cuadro dice qué revisar. Si la voz llega muy floja, se sube
  el volumen (hasta ×20) antes de pasarla a texto.
- **Al pasarla a texto**: Whisper usa su filtro de voz (`--vad_filter True`), que solo le da los trozos con habla, y
  no arrastra el texto anterior (`--condition_on_previous_text False`).
- **Después**: las frases fantasma conocidas se quitan (src/shared/whisperPhantoms.ts). Si no queda nada, la nota sale
  como «No se entendió nada en la nota de voz». Vale también para las notas de Órbita.

### Dictar en cualquier aplicación (atajo global)

Con la app de kywai abierta en el equipo (no en kywai Cloud ni en el servidor sin pantalla), **Ctrl+Alt+Espacio**
(en el Mac, Control+Opción+Espacio) empieza a grabar **aunque estés en otra aplicación**: un aviso dice «Dictando…».
Al pulsarlo otra vez, Whisper lo pasa a texto en el propio equipo (el mismo dictado de arriba, en el idioma de la
app) y kywai **lo pega donde estaba el cursor**: el correo, el editor, el navegador… El portapapeles vuelve a lo que
tenía al segundo y medio. Idea de Handy (cjpais/Handy, MIT), hecha de cero (`src/main/dictation.ts` y
`src/renderer/src/lib/dictation.ts`).

- **Pegar solo** pulsa ⌘V/Ctrl+V en la aplicación de delante: en el Mac con `osascript` (la primera vez pide permiso
  de **Accesibilidad** para kywai en Ajustes del Sistema → Privacidad y seguridad), en Windows con PowerShell y en
  Linux con `xdotool` (X11) o `wtype` (Wayland). Si no puede, deja el texto copiado y un aviso dice que lo pegues tú.
- **Otro atajo:** `KYWAI_DICTADO_ATAJO` con el formato de Electron (p. ej. `CommandOrControl+Shift+D`);
  `KYWAI_DICTADO_ATAJO=off` lo apaga. Si otra aplicación ya usa el atajo, kywai no lo coge (lo dice en el registro).
- Si no se oye nada, la nota es muy corta o falta el permiso del micrófono, un aviso lo explica y no se pega nada.

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
tienes), cada una con ▶ para oír una muestra. La lista va **agrupada por motor**, con un título en cada grupo
(«Español · KittenTTS», «Español · Piper», «Español · Kokoro», «Español · Edge», «Español · macOS»…): primero las
que funcionan en tu equipo sin internet y, delante de todas, el motor de la voz que lee por defecto en ese idioma
(KittenTTS en español, Kokoro en inglés); detrás, Edge y las del Mac, y al final las de Gemini, ElevenLabs o
VoiceStudio. No hay un selector de motor aparte: al elegir una voz eliges también su motor. En español hay además trece voces que funcionan **en tu equipo, sin
internet**: cuatro **ligeras de KittenTTS** (Lucía, Carmen, Javier y Diego), seis de Piper (Dave,
Mateo y Lucía de España; Aldo y Claudia de México; Daniela de Argentina) y tres de Kokoro (Dora, Álex y Santa). Las
de KittenTTS usan un solo modelo pequeño (KittenTTS 2 mini, de KittenML, licencia Apache 2.0) de unos 90 MB para las
cuatro: se baja la primera vez que eliges una (a `estudio-video/kitten/`; kywai instala `kittenml` solo, sin torch ni
gráfica) y habla unas tres veces más rápido que el habla con el procesador, gastando unos 400 MB de memoria. Por eso
también funcionan en **kywai cloud**, donde la imagen ya las trae instaladas. Las de Piper se bajan la primera vez que
las usas (entre 60 y 110 MB cada una, a `estudio-video/piper/`; kywai instala `piper-tts` solo) y desde entonces no
necesitan conexión; Álvaro y Jorge, de Edge, sí la necesitan siempre. Cuando la muestra ▶ suena, debajo de la voz pone con qué motor y voz ha sonado de verdad (por ejemplo,
«Sonó con Piper · Claudia»); si no ves ese aviso, esa app aún no tiene esta versión. Si una voz no se puede preparar en ese equipo, la muestra ▶ lo
dice (por ejemplo, «No se pudo instalar Piper») en vez de sonar con otra; al leer las respuestas, kywai lee con la voz
de reserva para no quedarse callado y lo avisa al pasar el ratón por el altavoz. En kywai cloud la imagen trae Piper y
sus seis voces ya bajadas. Sin elegir, en español lee **Lucía de KittenTTS** (desde la 1.30.0: en la comparación
del 24 nov sonó mejor que Kokoro y no necesita internet; si no se puede preparar, lee la de reserva y lo avisa); en
inglés, la primera de los vídeos (Bella, de Kokoro).

**KittenTTS en inglés (solo en la app de escritorio).** En inglés hay seis voces más de KittenTTS: Grace, Serena y
Martha, Danny, Max y Otis. Usan el mismo modelo mini, pero para pronunciar el inglés necesitan un añadido de entre 1 y
1,5 GB (misaki, spaCy con su modelo pequeño de inglés y torch solo para el procesador), que kywai instala la primera vez
que eliges una, en un Python 3.12 aparte (`estudio-video/kitten/en-venv`, con uv) para no tocar el del estudio; el
diccionario y el modelo de palabras raras (`g2p/`, ~6 MB) se bajan junto al modelo. En **kywai cloud** no salen: el
añadido no cabe en cada espacio. El altavoz se
enciende y se apaga solo desde el chat (en Ajustes ya no hay un interruptor repetido). Suena con el volumen de «Voces de
los agentes»; si silencias esas voces, deja de leer, y al activar el altavoz vuelven. El altavoz y la voz se
recuerdan por dispositivo (escritorio, cliente y navegador; Órbita aún no lo tiene).

**Escuchar un solo mensaje.** Debajo de cada mensaje de un agente, junto a «Responder» y «Crear vídeo de esto», está
**«Escuchar»** (un altavoz): lee en voz alta solo ese mensaje, con la misma voz que elegiste para leer las
respuestas, aunque el altavoz de junto al micrófono esté apagado o las voces silenciadas (lo has pedido tú). Mientras
suena, el botón cambia a **«Parar»** y otro toque lo calla. Si estaba leyendo otra cosa, la corta y empieza con este.
Igual que la lectura automática, se salta el código, las tablas y las direcciones. No sale en los mensajes de error
ni mientras el agente aún escribe. En **Órbita** está en el mismo sitio, junto a «Responder»: el ordenador prepara el
audio con la voz que elegiste allí para leer las respuestas (Órbita no tiene selector de voz) y el móvil lo
reproduce trozo a trozo (`POST /voice/read`, `src/main/mobileBackend.ts` y `ListenAloud.kt`).

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

### Hablar con kywai (voz en directo)

A la derecha de la caja del chat, junto a enviar, hay un botón con el **logo de kywai en pequeño** (a la izquierda
quedan el micrófono de las notas de voz y el altavoz de leer el chat). Un toque abre una **conversación por voz en
directo**: le hablas y te contesta al momento, sin pulsar nada entre frase y frase. Sabe cuándo has terminado de
hablar y, si hablas mientras ella habla, **se calla y te escucha**. La llamada sale **en el lado que no usas** (encima
del espacio 3D, del otro chat o del navegador), para no tapar el chat; si no hay sitio al lado (chat a lo ancho,
pantalla estrecha), sale encima de la caja del chat. El logo gira con un
latido de fondo mientras conecta, sigue girando en su sitio cuando ya está, se encoge un poco mientras te escucha y,
cuando habla, crece y mengua como si fuera su voz. Debajo, «Silenciar micro» y «Colgar» (o el mismo botón del logo, que gira mientras dura la llamada).

- **Siempre sabes en qué está**, con un color, un texto y un sonido suave al cambiar:
  - **Lista** (aro azul que respira, «Lista: habla cuando quieras», dos notas que suben): puedes hablar.
  - **Te escucho** (aro verde que crece con tu voz, un toque corto): te está oyendo.
  - **Pensando** (el logo gira deprisa con tres gotas alrededor y un aro ámbar, dos notas que bajan): has terminado
    de hablar y prepara la respuesta. Si no llega a entender nada y en 12 segundos no dice nada, vuelve a «Lista».
  - **Hablando** (el logo crece y mengua como su voz): le puedes interrumpir.
  En el escritorio y la web, los sonidos se apagan con «Efectos y avisos» en Ajustes. En Órbita se ve y suena igual.
- **No caduca a mitad**: Gemini corta cada conexión a los ~10 minutos y kywai la retoma sola. Si Gemini ya había
  olvidado la conversación («session not found or expired»), kywai abre otra sin que lo notes, con lo último del chat
  como contexto. Los fallos que no tienen arreglo salen en tu idioma y dicen qué hacer.
- **Es igual de capaz que escribir en el chat**: lo que pedirías escribiendo, se lo puedes pedir hablando. La charla
  y las dudas generales las contesta ella; lo demás lo hace con sus herramientas o se lo pasa al equipo. **Nunca
  promete sin hacerlo**: si dice «te lo leo» o «lo hago», usa la herramienta en ese momento, y si no tiene cómo, lo
  dice y te ofrece pasárselo al equipo.
- **Te lee de verdad lo que hay en el chat**: «léeme el borrador de Claude», «¿qué dice el informe?», «dame más
  detalle de lo que hizo Codex»… Abre entero el mensaje o el archivo entregado (Markdown, texto, código, web, Word,
  PowerPoint; herramienta `leer_del_chat`, hasta unas 12.000 letras) y te cuenta lo que dice de verdad, con el
  detalle que pidas, punto por punto. Elige lo que encaja con tus palabras (o lo último si no dices nada). Si es un
  PDF o algo que no puede abrir, o es demasiado largo, te lo dice y te ofrece pasárselo al equipo. En el chat queda
  la línea «📄 lo que abrió».
- **El trabajo se lo pasa al equipo**: si pides algo de verdad («hazme un vídeo de…», «revisa la web», «escribe el
  informe…»), te dice que se lo pasa y el encargo aparece en el chat como un mensaje tuyo. El coordinador lo planifica y lo reparte como siempre.
- **Maneja todo kywai hablando (1.17.5)**: conoce todas las órdenes «/» del chat (sale de la misma lista que el «/»
  del cuadro de texto, `commandLines` en `src/shared/liveVoice.ts`) y las usa al encargar: «crea una imagen de un
  perro», «/video…», «/sonido…», «/instagram», «/uso», «/nuevo»… Nunca dice que no puede hacer una imagen o un vídeo:
  lo pasa al equipo. Una orden nueva del «/» llega sola a la voz.
- **Entiende tu idioma**: se le dice a Google el idioma de kywai (`speechConfig.languageCode`, por ejemplo `es-ES`) y
  en las instrucciones que, si algo suena a portugués o italiano, lo entienda en tu idioma. Si el modelo no admite
  fijar el idioma, la llamada se vuelve a abrir sola sin él (`isLanguageError`).
- **En kywai Cloud igual que con tu clave (1.17.5)**: el permiso de un solo uso que pide «Mi cuenta» (`gemini_token`
  en `portal/voz.py` de kywai-cloud) ya no lleva `bidiGenerateContentSetup`. Con él, Google bloqueaba la configuración
  y tiraba la de la app (instrucciones, herramientas, voz elegida), y la voz contestaba «no puedo generar imágenes».
- **Te cuenta las novedades**: lo que los agentes escriben en el chat mientras hablas (respuestas, el plan que
  espera tu visto bueno, preguntas, el resultado final) te lo resume en una o dos frases. Si el equipo pregunta algo,
  contéstale a ella («dile que sí, la opción dos») y lo manda al chat.
- **Hace de verdad lo que le pides con lo que espera tu visto bueno**: «aprueba el plan», «descártalo», «dale
  permiso a Claude», «deniégaselo»… Mira lo que hay en «Te necesita» (herramienta `ver_pendientes`) y lo resuelve
  con `resolver_pendiente`, que es lo mismo que pulsar el botón. Solo dice «hecho» cuando kywai contesta que se
  hizo; si no se puede (ya no está pendiente, no admite eso), te dice por qué. Al empezar la llamada ya sabe qué
  espera tu visto bueno.
- **No da por hecho lo que sigue en marcha**: al encargar algo, solo dice que se lo pasa al equipo; el resultado lo
  cuenta cuando llega el aviso del equipo. Si aun así dice «ya está» / «ya terminó» con encargos sin acabar, en la
  llamada sale «⏳ Aún en marcha: el equipo no ha terminado» (`claimsDone` en `src/shared/liveVoice.ts`).
- **Cuelga de verdad cuando se lo pides**: «cuelga», «adiós», «ya está, gracias»… La voz usa la herramienta
  `colgar_llamada`, se despide en una frase y la llamada se cierra sola al terminar de hablar (a los 15 s como mucho),
  igual que con el botón rojo: lo hablado queda guardado en el chat.
- **Lo que se dice se ve en la llamada y se guarda en el chat al colgar**: debajo del logo va un chat flotante con
  tus frases a la derecha y las de kywai a la izquierda; según crece, la llamada sube. Al colgar, todo se guarda en
  el chat como una tarjeta «Conversación por voz»
  (con la hora; si es larga, «Ver toda la conversación»). Si la voz manda un encargo, la tarjeta se cierra y sigue
  otra debajo del encargo, así el chat queda en orden. Si cambias de chat a mitad, se guarda en el chat
  donde empezó. El texto también va dentro del mensaje («Tú: … / kywai: …») para buscarlo y para que el equipo lo
  tenga en cuenta.
- **Mientras el equipo trabaja, la llamada se pone en pausa**: cuando le encargas algo, kywai lo confirma en una frase
  y la llamada se recoge en una pastilla con el logo («kywai trabaja», «Hablar» y colgar). El micro deja de mandar
  audio (no oye nada) y, con Gemini, la conexión se cierra guardando por dónde iba, así ese rato no cuenta como
  minutos. Cuando llega el resultado, la llamada se abre sola, te lo lee y vuelve a escucharte. Con varios encargos
  se recoge otra vez tras cada resultado hasta que acaba el último. «Hablar» la vuelve a abrir cuando quieras.
- Mientras hablas con ella, el altavoz no lee las respuestas (lo hace la voz a su manera).

**Micrófono abierto o pulsar para hablar (1.32.0).** En ⚙ → Ajustes → General → «Hablar con kywai», **«Cómo te
escucha»** tiene dos opciones; se recuerda en cada dispositivo:

- **Micrófono abierto** (como siempre): hablas cuando quieras, sabe sola cuándo has terminado y, si hablas mientras
  contesta, se calla.
- **Pulsar para hablar**: solo te oye mientras mantienes la **tecla para hablar** (F8 de serie). Al soltarla, contesta.
  Sin la tecla no le llega nada de audio, así que el ruido de fondo, la tele u otra persona ni la interrumpen ni la
  hacen contestar. Si pulsas mientras habla, se calla y te escucha. «Cambiar…» espera a que pulses la tecla o la
  combinación que quieras (Esc lo deja): vale una tecla de función sola (F1–F24, Inicio, Fin…) o cualquier tecla con
  Ctrl, Alt, Mayús o ⌘; una letra sola no, porque escribiría en el chat, y tampoco Ctrl+Alt+Espacio, que es la del
  dictado. En la llamada también está el botón **«Mantén para hablar»** (ratón o dedo) y el estado dice «Lista: mantén
  F8 para hablar», «Te escucho… suelta para enviar» o «Hablando… pulsa F8 para interrumpirla».
- **No gasta minutos esperando**: con pulsar para hablar, si en 15 segundos nadie habla ni pulsa y la voz no tiene nada
  que contar, la conexión con Gemini se pone en pausa guardando por dónde iba (como mientras el equipo trabaja) y el
  estado dice «En pausa: mantén F8 para hablar (no gasta minutos)». Ese rato no cuenta en los minutos de kywai Cloud.
  Al pulsar la tecla vuelve sola en un momento con la misma conversación; lo que dices mientras se abre se guarda
  (hasta unos 6 segundos) y le llega igual. Si llega un aviso del equipo, también vuelve para contártelo.
- **Con kywai en segundo plano** (solo la app de escritorio, también en modo cliente y con kywai Cloud): con
  «También con kywai en segundo plano» encendido, la tecla funciona aunque estés en otra aplicación, solo mientras dura
  la llamada. Para ver cuándo sueltas la tecla fuera de kywai se usa **uiohook-napi** (MIT); el motor solo avisa de esa
  tecla y de ninguna otra, y la pieza se para al colgar. En el Mac pide el permiso de **Accesibilidad** (el mismo que el
  dictado para pegar; macOS lo pregunta la primera vez). Si no puede (sin ese permiso, Linux con Wayland o la pieza no
  carga), fuera de kywai la tecla hace de **interruptor**: una pulsación abre el micro y la siguiente envía, y Ajustes
  lo dice durante la llamada. Con kywai delante, siempre se mantiene. Si otra aplicación ya tiene la tecla, Ajustes
  pide elegir otra. En el navegador (web y kywai Cloud desde el navegador) la tecla solo vale con la pestaña delante: el
  navegador no da las teclas de otras aplicaciones.
- **En Órbita**, debajo del estado de la llamada, «Pulsar para hablar» / «Micrófono abierto» cambia el modo (se recuerda
  en el móvil) y, con pulsar para hablar, el botón «Mantén para hablar» hace lo mismo que la tecla, también la pausa
  que no gasta minutos.

Por dentro: con pulsar para hablar el setup lleva `realtimeInputConfig.automaticActivityDetection.disabled` y, al pulsar
y soltar, se mandan `activityStart` y `activityEnd` (`liveSetup` con `pushToTalk` en `src/shared/liveVoice.ts`; la
tecla, en `src/shared/pushToTalk.ts`; la llamada, `pressTalk`/`releaseTalk`/`sleepIfIdle` en
`src/renderer/src/lib/liveVoice.ts`; Ajustes, `ListenSettings` en `SettingsDialog.tsx`). La tecla fuera de kywai:
`src/main/pushToTalk.ts` (IPC `ptt:watch` y evento `ptt:key`, en `src/preload/index.ts` y `src/preload/client.ts`). En
Órbita: `press`/`release`/`changePushToTalk` en `LiveVoice.kt`, `LiveListenRow` en `LiveVoiceUi.kt` y la preferencia
`livePushToTalk`. Los proveedores que vengan después (OpenAI Realtime, Groq) usarán el mismo ajuste.

**Con qué funciona.** Usa **Gemini Live** de Google (modelo `gemini-3.8-live`). Hace falta una clave de Gemini:

1. Sácala gratis en [Google AI Studio](https://aistudio.google.com/apikey) (sin tarjeta). Con la clave gratis hay un
   límite de uso diario y Google puede usar las conversaciones para mejorar sus productos; con la facturación
   activada en la clave, no, y se paga por minuto (céntimos).
2. Pégala en ⚙ → Ajustes → General → **«Hablar con kywai»** y pulsa «Conectar». kywai la comprueba con Google y la
   guarda **cifrada** en el equipo que hace de motor, como las demás claves. Si Gemini CLI ya tiene una clave en
   ese equipo (`GEMINI_API_KEY` o `~/.gemini/.env`), se usa esa sin pegar nada.
3. Ahí mismo se elige la **voz de la conversación** (Kore, Aoede, Leda, Zephyr, Puck, Charon, Fenrir u Orus); se
   recuerda en cada dispositivo. Con **▶** al lado (y al cambiar de voz) suena una frase corta con esa voz en tu
   idioma, para elegirla de oído. La primera vez se pide a Gemini TTS con la clave (o, en kywai Cloud sin clave, al
   portal con la de kywai) y se guarda: luego suena al momento y sin gasto.

**Si aún no está configurada**, al tocar el logo no sale un error: sale un **aviso con los pasos** que tocan
(sacar la clave gratis en Google AI Studio, pulsar «Create API key» y pegarla), un botón que abre la página de la
clave, el campo para pegarla ahí mismo («Conectar» y la llamada empieza sola) y «Más opciones en Ajustes», que abre
Ajustes justo en «Hablar con kywai». Si se acabaron los minutos del mes de kywai Cloud, ofrece comprar un paquete o seguir con la
clave propia. En kywai Cloud, si la voz incluida aún no está activada en el portal, también sale este aviso.

**La clave no sale del equipo.** Para cada conversación el motor pide a Google un **permiso de un solo uso** que
caduca a los 2 minutos si no se usa, y la interfaz (escritorio, cliente o navegador) se conecta con él directamente a
Google: el audio no pasa por el servidor de kywai y la clave nunca llega al navegador ni al móvil. Cada conexión de
Gemini Live dura unos 10 minutos; antes de que se corte, kywai abre otra y sigue la conversación donde iba.

**En kywai Cloud**, si el usuario no ha puesto su clave, la voz viene **incluida en el plan** con minutos al mes:
**30 con kywai Cloud, 120 con kywai Pro y 300 con kywai Pro Max**. El permiso lo da el portal «Mi cuenta» con la clave
de kywai y en Ajustes se ve «{usados} de {límite} minutos este mes». Gastados los del mes, sigue con los **minutos de
paquete** (se compran con créditos en Mi cuenta → Créditos kywai: 60 por 300 créditos, 200 por 900 y 500 por 2.000; no
caducan) y después con créditos sueltos, a 5 por minuto. Sin minutos, sin paquete y sin créditos, kywai lo avisa y
ofrece comprar un paquete o seguir gratis con tu propia clave de Gemini. Con su propia clave, nada de esto cuenta.

**Solo Gemini Live, de dos formas (desde el 21 nov 2026).** Con **tu propia clave de Gemini** (gratis en Google AI
Studio; no gasta nada de kywai) o, en kywai Cloud, con **el Gemini de kywai** (minutos del plan, paquetes y créditos
kywai, como se explica arriba). En Ajustes ya no hay «Dónde se habla»: si pegas tu clave se usa la tuya; si la quitas,
vuelve el Gemini de kywai.
Se quitaron, por lentos y porque fallaban: «Modelo de tu equipo» (Whisper + Ollama/LM Studio/Colibri, en la self host
y desde la app de escritorio con kywai Cloud), **Groq** y el **gratis de kywai Cloud por turnos** (Cloudflare Workers
AI: Whisper, Llama 3.1 8B y MeloTTS). Quien tenía uno elegido pasa solo a Gemini: un motor que ya no existe en
`voz-en-vivo.json` se lee como Gemini, y la marca `kywai.vozEnTuEquipo` del navegador ya no cuenta. La clave de Groq
guardada (`groq-voz`) se queda sin usar. Las rutas `/api/voz/gratis/*` del portal siguen ahí pero la app ya no las
llama.

**En Órbita** está el mismo botón de la onda junto al micrófono del chat (si el ordenador tiene una versión con
voz en directo). La primera vez pide el permiso del micrófono. Encima del cuadro de texto sale el mismo logo
animado, con «Silenciar micro» y «Colgar» al lado. Usa la conexión del ordenador: el ordenador da el permiso de un solo uso y el primer mensaje ya preparado, y Órbita
habla directamente con Gemini (la clave no llega al móvil) por la API móvil (`/voice/live`, `/voice/live/ticket` y
`/voice/live/usage`). También escribe en el chat lo que se habla (`/voice/live/transcript`), resuelve lo que espera tu
visto bueno con los mismos botones de «Te necesita» y, si falta configurar la voz, enseña los pasos con un botón a
la página de la clave (la clave se pega en kywai del ordenador o la web). `/voice/live/sample` da la muestra de una
voz. Mientras dura la llamada, las voces de los agentes no leen el chat: lo cuenta la voz. El código está
en `android/…/ui/orbita/LiveVoice.kt` (la llamada, el micrófono con cancelación de eco y el altavoz) y
`LiveVoiceUi.kt` (el botón y la tarjeta).

Desde otro dispositivo, como el dictado, el navegador solo deja usar el micrófono en páginas **HTTPS** (ver
«Dictado por voz»). El eco lo quita el propio navegador; con altavoces muy altos, mejor auriculares.

Por dentro: `src/shared/liveVoice.ts` (modelo, voces, las herramientas `encargar_al_equipo`, `responder_pregunta`,
`ver_pendientes` y `resolver_pendiente` con `pickPending`, `leer_del_chat` con `pickReadable`; el archivo se abre en
`src/main/liveRead.ts`, también `/voice/live/read` para Órbita, qué falta configurar con `liveSetupNeed`, las frases de
muestra,
instrucciones de la voz y paso del audio a PCM de 16 bits), `src/main/liveVoice.ts` (clave cifrada como
`gemini-live`, `liveVoiceTicket` crea el token efímero con `POST /v1alpha/auth_tokens`; en la nube lo pide al portal
con `KYWAI_VOZ_URL` y `KYWAI_VOZ_SECRETO`), `src/renderer/src/lib/liveVoice.ts` (la llamada: micrófono a 16 kHz por
WebSocket a `BidiGenerateContentConstrained`, voz a 24 kHz que se corta al llegar `interrupted`, reconexión con
`sessionResumption`, avisos del chat como `clientContent`) y `src/renderer/src/ui/left/LiveVoice.tsx`.
Lo que se habla en el chat: `saveLiveTranscript` en `src/main/orchestrator.ts` (mensaje del sistema con
`liveTranscript`, mismo id en cada actualización) y `src/renderer/src/ui/left/LiveTranscript.tsx`. Las muestras de
voz: `LiveVoice.sample` en `src/main/liveVoice.ts` (caché en `voz-muestras/` de los datos de la app; portal
`/api/voz/muestra`). El aviso de configuración: `LiveSetupPanel` en `LiveVoice.tsx`.

## Cómo trabaja el equipo

### Tu equipo: añadir, quitar y elegir quién coordina

kywai no es solo para los agentes de fábrica: es una plataforma donde conectas **los agentes que ya pagas**. En
⚙ → Ajustes → «Configurar agentes…» (paso «Agentes»):

- **Añadir un agente**: «Añadir un agente» abre el catálogo con los que se pueden conectar (Aider, **DeepSeek**, **Claude Code + DeepSeek, Kimi o GLM**, **NVIDIA**, OpenCode,
  GitHub Copilot CLI, Cursor, Amp, Goose, Kimi Code, Mistral Vibe, Grok Build, Cline, Continue, OpenHands, Factory Droid,
  Auggie, Junie, Crush, Open Interpreter, gptme, Letta Code, ForgeCode, OpenClaw, Kiro, **Qwen Code**, **Antigravity CLI**,
  **Rovo Dev**, **MiniMax Code**, **Qoder CLI**, **Kilo CLI**, **Codewhale**… y los de fábrica que hayas
  quitado), con la cuenta o suscripción con la que funciona cada uno. Elige uno y se añade con su robot y su estación en el
  espacio digital. **«Otro programa…»** conecta cualquiera: el comando, cómo recibe el encargo (por stdin, en un
  archivo o como argumento) y sus argumentos.
  El catálogo se ve en **tarjetas como «Mis agentes» de kywai cloud y kywai.app**: cada agente con su **icono oficial**
  (los de `web/assets/agentes`, copiados en `src/renderer/src/assets/agentes` para verse sin internet) y sus **formas de
  conectarlo**: primero **«Tu cuenta de …» · Recomendado** (la suscripción que ya pagas, como en su terminal) y, si la
  acepta, **«Clave de API de …» · Alternativa** (se cobra cada uso aparte; al pasar el ratón lo dice). Kilo sale «Sin
  cuenta». Las formas están en `src/shared/agentWays.ts` (una prueba exige que todo el catálogo tenga forma e icono).
  «Otra cuenta…» también enseña los iconos.
  **Codewhale** (22 nov 2026, codewhale-hq/Codewhale, MIT): agente en Rust para más de 40 proveedores, por defecto
  DeepSeek V4.1 Flash (pide la clave de DeepSeek; también vale `codewhale auth chatgpt`). kywai lo lanza con
  `codewhale exec` y el encargo por la entrada estándar: `--permission-mode plan` para planificar y
  `--auto --sandbox workspace-write` para trabajar (con «Acceso completo», solo `--auto`), y le apaga el aviso de uso
  y la comprobación de versión (`DO_NOT_TRACK`, `CODEWHALE_TELEMETRY=false`, `CODEWHALE_NO_UPDATE_CHECK`). Probado con
  la versión 0.10.3.
- **«Mis agentes» en Mi cuenta (kywai cloud, 22 nov 2026)**: cada tarjeta enseña «Pruébame» y «Hacer principal»; Desactivar,
  Cambiar cuenta o clave, Quitar cuenta o clave y Quitar del equipo van en el menú **«⋯»** (se cierra al pulsar fuera o
  con Escape). Si al agente le falta la clave, «Poner la clave» sigue a la vista. Plantilla `portal/templates/account.html`.
- **Configurar y probar al añadir** (`ConfigureAgent.tsx`): al pulsar «Añadir» la ventana no se cierra, pasa a
  **«Configura {agente}»** con tres pasos: **1 · Conéctalo** (pestañas «Tu cuenta de …», «Clave de API» o «Sin cuenta»,
  la recomendada primero), **2 · Modelo** (lista si su programa tiene varios; si es de terminal, se escribe) y
  **3 · Pruébalo** (botón «Probar»: le manda un mensaje corto y enseña lo que contesta o el motivo del fallo).
  - **Cambiar o quitar la cuenta o la clave**: en la tarjeta de cada agente de «Agentes» (salvo los locales), el botón
    **«Cuenta y clave»** abre la misma ventana como «Configurar agente»: se cambia la cuenta o la clave, el modelo, o se
    vuelve a probar. Con cuenta o clave guardada sale **«Quitar cuenta o clave»** (pide confirmación): en la nube
    `cloudAgentForget` borra la clave `cloud:`, la sesión guardada (Gemini/Codex) y cancela inicios a medias, y si hay
    otros agentes que funcionan lo deja desactivado (si era el principal, pasa a serlo otro); en self host borra la
    clave (`setAgentKey(id, '')`). El agente sigue en el equipo. La cuenta en la web del proveedor no se toca.
  - **Hermes: elegir proveedor** (desde el 21 nov 2026, `src/main/hermesEndpoint.ts`). En **1 · Conéctalo**, la
    pestaña «Clave de API» de Hermes tiene tres opciones: **OpenRouter** (su clave; modelo `openrouter/free`),
    **OmniRoute** ([OmniRoute](https://github.com/diegosouzapw/OmniRoute), MIT: una pasarela que corre en tu equipo y
    junta muchos proveedores en `http://127.0.0.1:20128/v1`; su clave se crea en su panel → Endpoints) y **Otra
    dirección** compatible con la API de OpenAI (LiteLLM, vLLM, un servidor propio…; la clave es opcional). kywai pide
    `GET <dirección>/models` para comprobar dirección y clave (avisa si no responde, si no acepta la clave o si no
    parece compatible), escribe en `config.yaml` de Hermes el proveedor `omniroute` o `kywai-propio` con
    `api_key: ${KYWAI_HERMES_KEY}` (la clave no se escribe en el archivo: va cifrada en kywai y se le pasa al lanzarlo,
    `hermesSecrets` en `agents/index.ts`), elige el mejor modelo que tengas para cada dificultad (`pickHermesTiers`: Normal el mejor «del día» como Sonnet, GPT-5 o Gemini Pro; Difícil el más potente como Opus; Fácil uno rápido como Haiku o Flash, mirando la familia y la versión; si no reconoce ninguno, el automático `auto/smart`) y lo prueba. Si conectas más proveedores en OmniRoute, «Comprobar ahora» vuelve a elegir. El paso
    **2 · Modelo** enseña los modelos que dio la dirección. Los proveedores que ya tuvieras en `config.yaml` (p. ej. un
    `omnirouter` propio) no se tocan. En el equipo servidor solo se cambia desde su app de escritorio; en kywai cloud,
    desde la app conectada al espacio. Pasar suscripciones de Claude Code o Copilot por OmniRoute puede ir contra las
    condiciones de esos servicios: kywai no lo sugiere.
  - **OmniRoute con un clic** (`src/main/omniroute.ts`). En la pestaña OmniRoute, **«Instalar y preparar OmniRoute»**
    comprueba Node.js (OmniRoute pide 22.22 o 24), instala `omniroute@3.8.54` con npm, le pone al panel una contraseña
    aleatoria (`omniroute setup --non-interactive` con `INITIAL_PASSWORD`, nunca la de fábrica `CHANGEME`; si ya tenía
    una tuya, no se toca) que se guarda cifrada en kywai y lo enciende sin ventana (`omniroute serve --no-open
    --no-tray`, lo que dice va a `omniroute.log` en la carpeta de datos). Luego dos pasos: **Abrir el panel** (se abre en tu
    navegador en http://127.0.0.1:20128: los enlaces http solo se abren hacia este mismo equipo, `src/main/externalUrl.ts`;
    la contraseña se ve escrita, con un botón para copiarla) y conectar un proveedor (suscripción o clave: eso no tiene orden ni API), y
    **volver a kywai**, que lo comprueba solo al recuperar la ventana y deja Hermes con los mejores modelos para cada dificultad. Si aún
    no hay proveedor, lo dice; si OmniRoute pide una clave y no pegaste ninguna, dice que la crees en su panel
    («Endpoints» o «API Keys») y la pegues abajo. **Se enciende solo**: al abrir kywai, si un Hermes encendido trabaja con el OmniRoute de
    este equipo (127.0.0.1:20128) y no contesta, kywai lo enciende en segundo plano; si no puede, avisa en «Te
    necesita». Antes de cada encargo de Hermes con OmniRoute se mira otra vez y se enciende si hace falta. **Al cerrar
    kywai se apaga, solo si lo encendió kywai** (el que abriste tú sigue funcionando).
  - **OmniRoute de tu equipo en kywai cloud** (fase 2, `src/main/omnirouteRelay.ts`). La app de escritorio conectada a
    kywai cloud lo prepara con el mismo botón (pregunta antes) y lo presta por el puente, como Ollama o LM Studio
    (`BRIDGE_ROUTES.omniroute`: solo `GET /v1/models` y `POST /v1/chat/completions`, ni el panel ni sus claves).
    Dentro del espacio, un relevo escucha en `127.0.0.1:20128` (la misma dirección que en tu equipo) y pasa cada
    petición de Hermes a tu equipo, con la respuesta a trozos. Tus suscripciones y claves no salen de tu equipo. Si tu
    equipo no está conectado, Hermes avisa de que no llega y qué encender («Prestar los modelos de este equipo»).
    También se puede poner a mano una dirección pública de OmniRoute (protegida con contraseña).
    **En la bienvenida de Mi cuenta** («Elige y prueba tu primer agente» con Hermes), OmniRoute sale entre las «Otras
    opciones» (desde el 25 nov 2026 ya no es lo recomendado: primero va tu Claude o tu ChatGPT directo). El portal pregunta al espacio `cloudOmniRouteStatus` (qué equipo conectado presta OmniRoute y si
    está encendido). Si lo presta, «Probar Hermes con OmniRoute» llama a `cloudTestAgent('hermes', '', null,
    {provider: 'omniroute'})`: el espacio lista los modelos por el relevo, escribe el proveedor `omniroute` en
    `config.yaml`, elige los modelos por dificultad (`pickHermesTiers`), borra una clave de OpenRouter guardada antes y
    lo prueba con un mensaje real. Si no lo presta, enseña los tres pasos (instalar kywai con Hermes + OmniRoute,
    «Usar kywai cloud», encender «Prestar los modelos de este equipo») y «Comprobar de nuevo». Debajo sigue «O con
    OpenRouter (clave gratis)».
  - **Reserva de OpenRouter** (`runHermes` en `agents/hermes.ts`, `hermesReserveKeyId` en `hermesEndpoint.ts`). Cuando
    conectas Hermes con OpenRouter, su clave se guarda también como «de reserva» (`openrouter-reserva:<agente>`, con
    `cloud:` en la nube), y se conserva al pasar a OmniRoute. Si OmniRoute no está, no deja entrar o se queda sin cupo
    (fallos `offline`, `auth`, `quota`), Hermes repite el encargo con `openrouter/free` y esa clave, y lo dice en la
    actividad («OmniRoute no responde: Hermes sigue con los modelos gratis de OpenRouter»). «Quitar cuenta o clave» y
    quitar el agente la borran. Sin reserva, avisa del motivo como antes.
  - **OmniRoute en tu espacio** (`omniRouteSpace.ts`, `omniroute.ts`). La imagen del espacio trae OmniRoute instalado
    y cada espacio enciende el suyo en 127.0.0.1:20128 (`ensureOmniRouteForHermes`), sin panel
    (`OMNIROUTE_HEADLESS=1`), solo dentro del contenedor (`OMNIROUTE_SERVER_HOST=127.0.0.1`) y con 512 MB de memoria
    como tope (`--max-old-space-size=512`). **Si el Hermes del espacio lo usa, se queda encendido siempre** (Yil, 25 nov
    2026): se enciende al arrancar el espacio (`keepSpaceOmniRouteOn`), cada minuto se mira y, si no contesta, se
    vuelve a encender (`spaceOmniRouteStep`; tras un arranque fallido espera 5 min, `OMNIROUTE_RETRY_MS`), y el gateway
    de Hermes se toca cada 5 min aunque no haya ninguna pantalla abierta (`keepHermesGatewayAwake`). Si Hermes no lo
    usa (por ejemplo, solo se encendió para conectar una suscripción), se apaga tras 20 minutos sin uso, como antes. Así Hermes usa
    tus suscripciones 24/7 aunque tu ordenador esté apagado. La imagen lo trae instalado (`omniroute@3.8.54` en el
    Dockerfile de kywai-cloud) y sus datos viven en `~/.omniroute`, dentro del volumen del espacio. Las suscripciones
    se conectan desde la bienvenida de Mi cuenta o desde la ficha de Hermes en Mis agentes: «Conectar mi Claude» o
    «Conectar mi ChatGPT» (ids `omniroute-claude` y `omniroute-codex`, con la misma página y los mismos
    `cloudAccountLogin*` que los demás inicios de sesión; `createSpaceLogin`) piden a OmniRoute el enlace para iniciar sesión
    (`/api/oauth/<claude|codex>/authorize`), pegas el código que enseña Claude (o la dirección a la que vuelve ChatGPT,
    aunque no cargue) y kywai lo canjea (`/exchange`). kywai maneja su API con la llave de la terminal de OmniRoute
    (`x-omniroute-cli-token`, HMAC del id de la máquina con un secreto propio de cada espacio, `OMNIROUTE_CLI_SALT`) y
    le pide una clave de API para Hermes (`/api/keys`, guardada como `cloud:omniroute-espacio`). El OmniRoute de tu
    ordenador sigue llegando por el puente, ahora al relevo 127.0.0.1:20129; un Hermes que lo usaba con la dirección
    de antes pasa solo al relevo al arrancar (`moveBridgedHermesToRelay`). Si el OmniRoute del espacio falla o se
    queda sin cupo, Hermes sigue con la reserva de OpenRouter. En un espacio nuevo o formateado, el config.yaml de Hermes
    no tiene sección `model:` y sin ella Hermes se cree sin configurar: al escribir el proveedor, kywai la añade con ese
    proveedor y su modelo (`upsertHermesProvider`).
  - **Hermes con tu suscripción de ChatGPT o Claude en la nube, con su propio inicio de sesión** (`hermes-codex` y
    `hermes-claude` en `cloudAccountSpecs`). Desde el 25 nov 2026 es **lo que sale primero** en la bienvenida y en la
    ficha de Hermes de Mis agentes («Usar mi Claude», «Usar mi ChatGPT»); el OmniRoute del espacio y la clave de
    OpenRouter quedan plegados en «Otras opciones» (del 22 al 25 nov iba al revés). Para que Hermes funcione 24/7 sin depender de tu ordenador, Mi cuenta lanza el inicio de
    sesión oficial de Hermes: `hermes auth add openai-codex --type oauth --no-browser` (código de dispositivo en
    auth.openai.com/codex/device; Hermes guarda su propia sesión y no toca la de Codex) o `hermes auth add anthropic
    --type oauth --no-browser` (enlace de claude.ai y pegar el código que da la web). Al terminar,
    `finishHermesSubscription` prueba los modelos de tu plan en orden (`HERMES_SUBSCRIPTION_MODELS`) y Hermes se queda
    con el primero que responda; la bienvenida vuelve a comprobarlo con `cloudHermesSubscription`. Si la suscripción
    se queda sin cupo o no deja entrar, se usa lo que Hermes trae de fábrica: varias cuentas del mismo proveedor
    rotan solas (credential pools: cada inicio de sesión se añade a la lista) y kywai escribe en config.yaml la
    cadena `fallback_providers` (`writeHermesFallbacks`): tu otra suscripción, si también la conectaste, y luego
    `openrouter/free` con la clave de reserva (que se le pasa como OPENROUTER_API_KEY). Así cambia a mitad de la tarea
    sin perder la conversación. Si aun así falla todo el intento, kywai lo repite con la reserva (`HERMES_SUBSCRIPTIONS`
    en `agents/hermes.ts`). Quitar a Hermes cierra también estas sesiones (`hermes auth logout openai-codex|anthropic`).
    **Modelos según la dificultad con tu suscripción**: tras entrar, kywai pregunta a Hermes qué modelos deja tu cuenta,
    igual que su `hermes model` (`hermesAccountModels` llama a `provider_model_ids` con el Python de Hermes: con Claude
    lee la lista de Anthropic con tu sesión, sin los Claude 2 y 3 retirados; con ChatGPT, la de tu cuenta de Codex). La
    lista se guarda en `kywai-modelos.json`, en la carpeta de Hermes (`setHermesModelsFile`), para que no se pierda al
    reiniciar kywai ni al desplegar la nube (antes vivía solo en memoria y, tras reiniciar, Fácil y Difícil solo
    ofrecían el modelo actual). Si Hermes no contesta, la ficha usa el catálogo de respaldo `HERMES_ACCOUNT_CATALOG`
    (Haiku, Sonnet y Opus 5.5, Fable 5.2…; GPT-6 Luna/Sol, GPT-5.6…) con nombre corto y nota (`hermesModelOption` en
    `models.ts`). Si se conectó con una versión anterior, al abrir la ficha se le pregunta una vez en segundo plano.
    Si el espacio no tiene apuntado el proveedor (solo el modelo), se deduce del modelo: `claude-…` es la cuenta de
    Claude y `gpt-…` la de ChatGPT (`hermesSubscriptionProvider`).
  - **Hermes con tu cuenta de Nous Portal en la nube**: pestaña «Tu cuenta de Nous Portal». El espacio lanza
    `hermes auth add nous --type oauth --no-browser` y enseña su enlace (`portal.nousresearch.com/…?user_code=…`) y su
    código; al aprobarlo, kywai pregunta a Hermes qué modelos deja tu plan (el gratis solo los gratuitos, como en
    `hermes model`) y se queda con el primero que responda (Claude Sonnet, GPT-5.5, Gemini Flash…). «Quitar cuenta o
    clave» cierra también la sesión de Nous (`hermes auth logout nous`). En el equipo servidor, «Tu cuenta de Nous
    Portal» abre `hermes setup` como siempre.
  - **Más agentes entran con tu cuenta en la nube** (revisión de la 1.0, `cloudMoreAccounts.ts`): Cursor
    (`agent login`), Grok (`grok login --device-auth`, SuperGrok o X Premium Plus), Factory Droid, Crush (con GitHub
    Copilot), gptme (con ChatGPT Plus/Pro), Letta, Kiro (AWS Builder ID), Qwen Code (plan Plus/Pro de chat.qwen.ai),
    Antigravity (cuenta de Google, se pega el código que da la web) y Kilo (sus modelos de pago). Cada receta salió de
    lanzar el inicio de sesión real del programa en un Linux sin navegador. Los que tras entrar siguen abiertos en su
    pantalla (Droid, Letta, Qwen Code, Antigravity) se dan por conectados cuando una consulta de prueba responde
    (`done: { probe: true }`, cada 20 s). gptme espera la vuelta del navegador en `localhost:1455` del espacio: la web
    acaba en una página que no carga; se copia su dirección entera, se pega en «Enviar la dirección» y kywai la abre
    dentro del espacio (`pasteUrl`: solo `localhost`/`127.0.0.1` y ese puerto, también en Mi cuenta). Qwen Code con
    cuenta se lanza con `--auth-type qwen-subscription`, que se le quita si luego usa una clave. Siguen solo con clave
    en la nube porque su programa no tiene inicio de sesión sin navegador: Mistral Vibe, Continue y Goose.
  - **Clave de API también en la app de Mac y PC** (`shared/agentKeys.ts`, la misma tabla que usa la nube): Cursor,
    Copilot (token de GitHub), OpenCode, Cline, Crush, Goose, gptme, Letta, Qwen Code, Continue, Mistral Vibe, Qoder y
    Aider ya ofrecen «Clave de API» en «Configura» aunque su ficha del catálogo no traiga una. Al guardarla
    (`saveAgentKey`) el agente recibe su variable, el entorno que lo apunta al proveedor (Goose: `GOOSE_PROVIDER`;
    Qwen Code: `OPENAI_BASE_URL` de OpenRouter) y el modelo gratis si no tenía otro; Cline además la deja en su
    configuración (`cline auth`). «Quitar cuenta o clave» lo deshace. **Claude Code y Codex** aceptan también una clave
    (de Anthropic o de OpenAI) en la app, guardada cifrada en el equipo y pasada solo a su programa
    (`ANTHROPIC_API_KEY`; Codex `CODEX_API_KEY`, probado con `codex exec`); sin clave siguen con la cuenta. En la nube
    Codex también acepta su clave de OpenAI.
  - **«Otra dirección» para Aider, Qwen Code, Goose y gptme** (`shared/agentEndpoint.ts`, `main/agentEndpoint.ts`):
    como Hermes, se conectan a cualquier servicio compatible con OpenAI: OpenRouter, OmniRoute
    (`http://127.0.0.1:20128/v1`), el Ollama del equipo (solo en la app; LM Studio cambiando el puerto a 1234) o una
    dirección propia. «Buscar modelos» hace `GET /models` (`agentEndpointModels`) y «Guardar y probar»
    (`setAgentEndpoint`) pone a cada programa las variables que lee: Qwen Code `OPENAI_BASE_URL` y `OPENAI_MODEL`;
    Aider `OPENAI_API_BASE` y el modelo `openai/<modelo>`; gptme `OPENAI_BASE_URL` y `local/<modelo>`; Goose
    `GOOSE_PROVIDER=openai`, `OPENAI_HOST` y `OPENAI_BASE_PATH`. La clave va cifrada (en la nube como `cloud:<id>`) y
    llega como `OPENAI_API_KEY`; sin clave se le pone una de relleno para que el programa arranque. Probado con los
    cuatro programas reales contra un servidor compatible. Guardar otra clave, entrar con la cuenta o «Quitar cuenta o
    clave» lo devuelve a su forma normal (`withoutEndpoint`). En la nube solo OpenRouter u otra dirección
    pública (127.0.0.1 sería el propio espacio); la clave guardada solo se reenvía a su misma dirección.
  - **Gemini con clave en la nube**: si `~/.gemini/settings.json` quedó en «oauth-personal» (un inicio de sesión con
    Google empezado y no terminado), Gemini CLI ignoraba la clave de AI Studio y salía «Con fallos». Ahora, en la nube,
    cada ejecución con `GEMINI_API_KEY` deja los ajustes en «gemini-api-key» (`useGeminiKeyAuth`). Si Google rechaza la
    clave (no válida o caducada) se dice así y dónde poner otra; en la nube ya no manda a ⚙ → Ajustes.
  - **Gemini en la nube va solo con su clave** de Google AI Studio (gratis). Su inicio de sesión con Google se quitó de la
    app y de Mi cuenta: Google ya no deja usar Gemini CLI con cuentas personales, y ese inicio de sesión borraba la clave
    y dejaba Gemini «Con fallos». Sin clave propia, Gemini usa la de Gemini Live (`gemini-live`, la misma de AI Studio),
    y cada ejecución con clave deja sus ajustes en «gemini-api-key».
  - **Gemini con clave no usa «Auto» (1.30.65, 25 nov 2026).** Con «Auto», Gemini CLI elige Gemini 3.1 Pro, y la clave
    gratis de Google AI Studio no tiene **ninguna** cuota para Pro (Google responde «limit: 0»). Ahora, si Gemini entra
    con clave (`GEMINI_API_KEY` o ajustes en «gemini-api-key») y el agente no tiene modelo fijado, va con 3.8 Flash
    (`geminiRunModel`, `GEMINI_KEY_MODEL` en `agents/gemini.ts`). Con la sesión de una cuenta de empresa, «Auto» sigue igual.
    Si Google dice «limit: 0» para el modelo elegido, el fallo cuenta como **modelo no disponible** (no como cuota
    agotada) y la tarea se repite con el modelo predeterminado (Flash) en vez de pasar a otro agente. La cuota diaria
    agotada («exhausted your daily quota») sigue siendo «Gemini alcanzó su límite de uso».
  - **Google AI Pro no sirve en Gemini CLI.** Desde junio de 2026 Google no deja entrar en Gemini CLI con cuentas
    personales, ni con Google AI Pro o Ultra («tu cuenta no es de pago»); esas suscripciones se usan con el agente
    **Antigravity CLI**. «Configura Gemini» lo avisa arriba, y el fallo de inicio de sesión lo explica igual. La etiqueta
    «PRO» de AI Studio tampoco sube la cuota de la clave: eso depende de la facturación del proyecto de la clave.
  - **«Guardar y probar» dice por qué no va una clave** (`main/keyProbe.ts`, 1.4.1): la prueba de la clave en la nube
    (`cloudTestAgent`) ya no se queda en «No respondió». Cuenta si el proveedor no acepta la clave (`rejected`), si no
    tiene saldo o su nivel gratuito no incluye el modelo (`quota`), si el modelo no existe para esa clave (`model`) o si
    no contestó a tiempo, con lo que dijo el programa debajo (`CloudAgentJob.detail`). Con **Gemini**, si el modelo
    elegido falla por modelo o por cuota, prueba los de reserva (3.8 Flash, 3.5 Flash-Lite, 3.1 Flash-Lite, 2.5 Flash)
    y se queda con el primero que responda, avisando del cambio. Su prueba espera hasta 90 s (Gemini CLI tarda en
    arrancar en el espacio) y acepta la palabra de la prueba aunque venga en negrita o dentro de una frase corta.
    **También vale para todos los agentes con clave** que se conectan en la nube con su programa (`cloudAnswers`:
    NVIDIA, Mistral Vibe, Continue…): la ventana dice el motivo real y lo que contestó el programa. **NVIDIA**
    sigue en Nemotron 3 Ultra (`nvidia/nvidia/nemotron-3-ultra-550b-a55b`: en OpenCode el proveedor «nvidia/» va
    delante del id de NVIDIA, que ya empieza por «nvidia/», así que el doble prefijo es correcto); si no responde a
    tiempo, por cuota o por modelo, prueba Nemotron 3.5 Lightning (`nvidia/nvidia/nemotron-3.5-lightning-30b-a3b`) y se
    queda con él. Ids comprobados en `integrate.api.nvidia.com/v1/models` y OpenCode real (23 nov 2026).
    **Gemini con clave se prueba primero con Google** (`checkGeminiKey`, 1.8.3): antes de lanzar Gemini CLI, kywai
    pregunta a la API de Google (`generateContent`, 20 s por modelo) con la clave, modelo a modelo. Así dice al momento
    si la clave no vale, si no hay cuota, si el modelo no existe para esa clave, si Google está saturado (503) o si el
    espacio no llega a Google, y se queda con el primer modelo que responda. Motivo: Gemini CLI, cuando Google contesta
    «saturado» o «espera» (503, 429 por minuto) o la red falla, reintenta en silencio hasta 10 veces con esperas de 5
    a 30 s, y la prueba acababa en «No respondió a tiempo» (reproducido con un servidor falso que devuelve 503: 95 s
    sin respuesta). Si Google ya respondió y solo el programa se pasa de tiempo, la clave se guarda igual.
    **Lo mismo para los demás agentes con clave** (`checkProviderKey`): antes de lanzar su programa se lee la API del
    proveedor con la clave (Anthropic `/v1/models`, OpenRouter `/api/v1/key`, xAI y Mistral `/v1/models`, DeepSeek
    `/user/balance`, OpenAI `/v1/models` para Codex). Si la rechaza (401/403, o 400 «Incorrect API key» de xAI) o dice
    que no hay saldo (402, DeepSeek `is_available: false`), se sabe en segundos con su mensaje; ante red caída, 429 o 5xx
    no se decide nada y sigue la prueba con el programa. **Si un programa se pasa de tiempo**, la ventana dice por qué
    con lo último que escribió (`RunAgentResult.stderrTail` → `timeoutHint`): proveedor saturado (`busy`), pide esperar
    (`quota`) o el espacio no llega a su red (`network`). Comprobado con las APIs reales (claves falsas) y con Gemini CLI
    real contra un Google simulado que da 503 en 3.8 Flash: se queda con 3.5 Flash-Lite y responde en 2 s.
  - **«Probar» dice la verdad con todos los agentes del catálogo** (1.9.3, 23 nov 2026). Se probaron uno a uno los
    agentes de «Configura kywai» con su programa real (sin cuenta, con clave buena, con clave rechazada y sin saldo,
    contra un proveedor simulado), en la app y en la nube. Lo que fallaba y cómo quedó:
    - **Esperas de inicio de sesión** (`LOGIN_WAIT_RE` en `agents/generic.ts`): Aider (OAuth de OpenRouter) y Amp
      (código de dispositivo) se quedaban esperando al navegador hasta agotar el tiempo. Ahora, si el programa escribe
      que espera un inicio de sesión, se corta al momento y dice «falta iniciar sesión o poner su clave».
    - **Falsos «Activado»** (`exitZeroFailure`): Aider y Junie terminan con código 0 aunque la clave no valga
      (`litellm.AuthenticationError`, «Please authenticate…») o no haya saldo (`RateLimitError`, «Insufficient
      Balance»); se miran las últimas líneas y ya no se toman como respuesta. Goose «add more credits» = sin saldo.
    - **Motivo correcto** (`NOT_CONNECTED_RE`, `NO_BALANCE_RE`): frases de no conectado de Goose, Grok, Cursor, Kimi,
      Qwen, Kilo, Qoder, Crush y dsh (HTTP 401) cuentan como «falta conectar» aunque el agente tenga su propio
      `authPattern`; 402, «Insufficient credits», «payment required» y «credit balance is too low» cuentan como «sin
      saldo» (antes salía la traza de Python con «api_key» y se confundía con clave rechazada). Aider sin saldo reintentaba
      sin fin (`RETRYING_NO_BALANCE_RE`): se corta en segundos.
    - **Programas que cambiaron**: Crush y Cline ya no leen la orden por la entrada (Crush decía «No prompt provided»,
      Cline 3 pide una terminal): va como argumento. Auggie usa `--print --no-session` y en modo plan solo herramientas
      de lectura. Mistral Vibe 3 quitó el agente «plan»: se usa `--agent ask`. Cursor se lanza como `cursor-agent` (el
      instalador de Grok crea `~/.local/bin/agent` y pisaba el de Cursor; las fichas guardadas se corrigen solas al abrir).
      Forge y OpenClaw se instalan con npm (`forgecode`, `openclaw`): su instalador web ya no existe.
    - **Claves que se perdían al reiniciar** (`freshCliSpec` en `config.ts`): al abrir la app o reiniciar el espacio, la
      ficha de un agente del catálogo se rehacía y borraba las variables de su clave (Goose `GOOSE_PROVIDER`, Qwen Code
      `OPENAI_BASE_URL`/`OPENAI_MODEL`…) y las de «Otra dirección». Ahora se conservan las de su tabla de claves
      (`AGENT_KEYS.extra`) y las de la dirección elegida (`ENDPOINT_ENV`).
    - **Claude y Claude con DeepSeek/Kimi/GLM** (`agents/claude.ts`): con la clave rechazada Claude Code reintentaba 10
      veces (minutos). Tras 3 reintentos seguidos con 401 se para y dice «falta conectar»; las pasarelas usan
      `CLAUDE_CODE_MAX_RETRIES=4`. Sin saldo ya no sale el aviso «doesn't recognize the model» en vez del motivo real.
    - **Inicio de sesión de Amp en la nube** (`index.ts`, `cloudAccountLogin.ts`): su código pasó a tener tres partes
      («6QH-JCS-JS7») y kywai no lo encontraba. Además, si un programa da el enlace pero no un código reconocible, a los
      4 s se muestra el enlace solo en vez de esperar sin fin.
    No se pudieron probar aquí con cuenta real: Copilot (el proxy de pruebas bloquea github.com), Open Interpreter (su
    instalador da 403) y los que solo van con la cuenta de su empresa (Cursor, Amp, Junie, Kiro, Qoder, Droid, Kimi,
    Antigravity, Letta, MiniMax, Auggie, Rovo Dev, Muse): con ellos se comprobó hasta el enlace de inicio de sesión y el
    motivo sin cuenta. Pruebas: `generic.test.ts`, `claudeRetry.test.ts`, `config.test.ts`, `cloudAccountLogin.test.ts`,
    `agentCatalogData.test.ts`, con las salidas reales de cada programa.
  - **«Pruébame» enseña solo la respuesta final** (`probeReply.ts`): sin la cabecera del programa (Aider: versión,
    modelo, «Repo-map», separadores) ni el razonamiento («► **THINKING**», `<think>`). Si dijo la frase pedida, sale solo
    «Estoy activo y funcionando.».
  - **Mismo equipo en la app y en Mi cuenta**: un agente que se añade o se quita en Mi cuenta sale ya en la app. Al darlo
    de alta (aún desactivado, mientras se instala y se prueba) se avisa con `config.updated`, y la app por web vuelve a
    pedir la configuración (`resyncConfig` en `api.ts`) al reconectar sus eventos y al volver a la ventana, por si se
    perdió un aviso con la red cortada o el equipo dormido.
  - **kywai cloud**: todo lo hace el espacio, sin ir a Mi cuenta. La clave se guarda, se instala lo que falte y se prueba
    de fondo (`cloudAgentKey` / `cloudAgentState`); con la cuenta sale el enlace de su web y su código, o una casilla
    para pegar el código (`cloudAgentLogin`, el mismo inicio de sesión oficial que usa Mi cuenta). `cloudAgentSetup` dice
    qué formas tiene cada agente. Estas llamadas (y `checkAgent`) sí se aceptan desde la app conectada; lo demás de Mi
    cuenta sigue siendo solo del portal (`webServer.ts`). Si el programa se estaba instalando al añadirlo, se espera.
  - **App del equipo servidor (self host)**: «Iniciar sesión» instala su programa si falta y abre la ventana guiada; la
    clave se guarda cifrada en el equipo (Gemini y los de catálogo con clave). Desde otro dispositivo de una self host
    las claves no viajan por la red: se avisa de conectarlo en el servidor y se puede elegir modelo y probar.
  - «Probar» es `checkAgent` en todos los modos (antes solo existía para Mi cuenta, `cloudCheckAgent`).
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
- **Sello «Verificado» (se gana cada noche)**: cada noche kywai cloud pide una consulta real a los agentes de sus
  cuentas de prueba y publica cuáles contestaron (`https://cuenta.kywai.app/pruebas.json`: solo si salió bien, cuándo,
  con qué versión y qué agentes; ni cuentas ni textos). En «Añadir un agente», los que contestaron anoche llevan
  **«Verificado»**; el resto dice **«Beta»** (pasa el ratón por encima: o no completó la prueba de anoche, o todavía
  no entra en ella, y puede funcionar igual de bien). El sello caduca a los dos días: si no hay una prueba reciente
  (o el equipo no tiene red) el catálogo no enseña ninguna de las dos etiquetas. No tiene que ver con «sin
  comprobar», que avisa de que la forma de lanzar ese programa no se ha revisado con su documentación. Código:
  `src/main/verifiedSeal.ts` (`getVerifiedAgents`, pregunta cada 6 horas) y `scripts/comprobar-nube.py` en kywai-cloud.
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
línea de órdenes) y recoge lo que responde. **DeepSeek** se puede conectar de dos formas, las dos con su clave de API (pago por uso; no tiene suscripción).
En el catálogo sale **una sola tarjeta «DeepSeek»** con un selector «Programa» dentro: **Claude Code** (el recomendado,
sale elegido), **Aider** o **DeepSeek Harness**. Son los mismos modelos de DeepSeek con distinto programa; quien ya tenga
alguno añadido no nota nada (cada uno sigue siendo su propio agente), y si ya tienes uno, la tarjeta solo ofrece los otros.
«DeepSeek» (Aider) va a través de Aider con el modelo de DeepSeek fijado, y **«DeepSeek Harness»** es el agente propio de DeepSeek
(orden `dsh`, se instala con `npm install -g @deepseek-ai/dsh@latest`: solo publica versiones de prueba, y sin «@latest» npm no encuentra ninguna y necesita Node.js 22.19 o más nuevo). kywai lo lanza con
`dsh --profile headless --approval-policy never -` y le pasa el encargo por la entrada estándar; al planificar añade
`--permission-mode read-only` y, con acceso total, `--permission-mode danger-full-access`. Está en versión de prueba. Los agentes que funcionan con una **clave de API**
(DeepSeek, NVIDIA, Kiro, Junie, Factory Droid, Amp) piden la clave en el paso «Sesiones»: se guarda cifrada (en Mac con la clave
propia de kywai, en Windows y Linux con el cifrado del sistema), solo en el equipo servidor (nunca por el acceso web ni por el móvil), y se pasa únicamente al programa de ese
agente. Kiro también vale sin clave si ya iniciaste sesión con «kiro-cli login» (se comprueba con `kiro-cli whoami`).

**OpenClaw** (el que antes se llamó Clawdbot y Moltbot; MIT, `npm install -g openclaw`, unos 520 MB) se lanza con
`openclaw agent exec --message-file - --timeout 7200` y el encargo por la entrada estándar. Su tope propio es de 10
minutos por encargo; con `--timeout 7200` manda el de kywai (lo para si pasa 20 minutos sin escribir nada). El esfuerzo
que elige kywai le llega como `--thinking` (`effortArgs` en la ficha del catálogo: medio en lo fácil, alto en lo demás y
al planificar), igual que a Claude. No tiene modo de solo lectura: al coordinar o planificar solo se le pide que no toque
nada, y así lo sabe el coordinador. Puede ser coordinador con «Hacer coordinador» como cualquier otro. Sus avisos
internos van por la salida de errores, así que la respuesta llega limpia. Medido en Linux: unos 500 MB de memoria por
encargo, cabe en un espacio de kywai cloud.

**OpenClaw es un agente del equipo; Hermes sigue de coordinador** (21 nov 2026, decidido por Yil). Hermes le pasa lo de
asistente personal: recados y recordatorios, leer, resumir u ordenar correo y agenda, y automatizar tareas repetitivas
(`OPENCLAW_STRENGTHS` en `src/shared/agentCatalogData.ts`, lo que usa el reparto de `bestAgentFor`). El código sigue
yendo a Claude o Codex, y lo que necesita el navegador de kywai no le llega (no lo tiene). Quien ya lo había añadido con
las fortalezas de antes recibe las nuevas al cargar (`freshStrengths` en `src/main/config.ts`); si las cambió a mano, se
quedan las suyas. Si el usuario pregunta si OpenClaw coordina mejor que Hermes, el coordinador lo explica así.

**Los agentes de catálogo se ponen al día solos.** Cada agente añadido guarda cómo se lanza el día que se añadió; al
cargar la configuración, esa copia toma lo del catálogo actual (argumentos, esfuerzo, inicio de sesión e instalación,
`freshCliSpec` en `src/main/config.ts`). Así un arreglo del catálogo llega también a quien ya tenía el agente. Los
hechos a mano con «Otro programa…» se quedan como están.

**Cuando un agente falla por su cuenta, su clave o su programa, el aviso trae cómo arreglarlo.** El mensaje de error
lo dice en palabras sencillas («todavía no está conectado a tu cuenta: falta iniciar sesión o poner su clave») y lleva
debajo la tarjeta «Arreglar <agente>». En la app: «Conectar» instala lo que falte y abre su inicio de sesión, o pegas
su clave ahí mismo. En kywai cloud: tres pasos y el botón «Arreglarlo en Mi cuenta», que abre «Mis agentes» justo en la
ficha de ese agente (`/cuenta/agentes#agente-<id>`), donde «Poner la clave» ya está abierto. Vale para todos los agentes
y también para un mensaje directo a un agente que no está disponible. Código: `fixGuideFor` en `src/main/orchestrator.ts`
y `ConnectAgentsBlock.tsx`.

**En kywai cloud, el programa se instala y se desinstala solo.** Al añadir un agente de catálogo a tu espacio (desde la
app o desde «Mi cuenta»), su programa se instala de fondo en tu carpeta, sin asistente; mientras tanto el chat dice «se
está instalando su programa» en vez de «no se encontró». Al quitarlo, su programa se desinstala para liberar espacio
(`npm uninstall`, `pipx uninstall` o `uv tool uninstall`, o se borra lo que dejó su instalador en tu carpeta), salvo
que otro agente de tu equipo use el mismo. Los programas que trae el espacio (Claude, Codex, Gemini, Hermes) no se tocan.
DeepSeek Harness también se conecta en «Mi cuenta» con la clave de DeepSeek, y si ya conectaste DeepSeek por Aider usa
esa misma clave. Código: `cloudEnsureProgram` y `cloudForgetProgram` en `src/main/index.ts` y `src/main/cloudUninstall.ts`.

**Claude Code con DeepSeek, Kimi o GLM.** Tres agentes del catálogo usan el programa `claude` de siempre pero con el
modelo de otra empresa por detrás, a través de su API compatible con la de Anthropic: **Claude Code + DeepSeek**
(DeepSeek-V4.1-Flash, `https://api.deepseek.com/anthropic`), **Claude Code + Kimi** (Kimi K3,
`https://api.moonshot.ai/anthropic`) y **Claude Code + GLM** (GLM-5.3, `https://api.z.ai/api/anthropic`; vale la clave
del GLM Coding Plan). Tienen las herramientas de Claude Code (subagentes, búsquedas, pruebas) pagando a esa empresa, sin
tocar tu suscripción de Claude ni tu Claude normal: kywai solo cambia la dirección y la clave **para ese agente**
(`ANTHROPIC_BASE_URL` y `ANTHROPIC_AUTH_TOKEN`, con `ANTHROPIC_API_KEY` vacía) y lo lanza con
`--setting-sources project,local` para que un desvío de tus ajustes (OmniRoute…) no lo mande a otro sitio. Es la idea de
Free Claude Code sin su proxy (AGPL). Comprobado en nov. de 2026 que el programa llega a las tres APIs (con una clave
falsa responden «Authentication error»); falta probarlo con una clave de verdad. Datos en `agentCatalogData.ts`.

**NVIDIA: el plan B cuando se acaba la cuota.** (Desde la 1.30.16 el nombre de un agente no lleva «(gratis)» ni «(de pago)»
en el chat, el 3D, el 2D ni las fichas: la etiqueta de gratis o de pago sale aparte en el catálogo «Añadir agente». Al abrir
la app, los nombres ya guardados con ese añadido se limpian solos.) Los modelos gratis de NVIDIA (Nemotron 3 Ultra por defecto;
también GLM, DeepSeek, MiniMax… según lo que NVIDIA tenga gratis ese mes) como agente de código, a través de OpenCode
(se instala con él). Solo pide una **clave gratis de build.nvidia.com** (sin tarjeta), que se guarda como las demás en
«Sesiones». Con él en el equipo, cuando Codex o Claude se quedan sin cuota la tarea pasa a otro agente disponible en vez
de pararse, y este no depende de ninguna suscripción. No es ilimitado (límite de peticiones por minuto, pensado para
probar), lo que envías pasa por NVIDIA y sus modelos rinden menos que GPT o Claude en diseño y textos. Codex no puede
usarlos directamente: desde 2026 solo habla la API Responses y NVIDIA solo ofrece la de chat (probado con Codex 0.169:
`/v1/responses` da 404), por eso va por OpenCode. La lista de modelos sale con `opencode models nvidia`; se cambia en el
selector de modelo del agente.

**NVIDIA y OpenCode no se cortan mientras trabajan callados (1.30.65, 25 nov 2026).** kywai corta un programa que pasa
20 min sin escribir nada (y avisa a los 3 min de que «no da señales»). OpenCode, cuando lanza sus subagentes («explore»),
puede pasar todo ese rato sin sacar una línea aunque esté trabajando: el 25 nov una tarea de NVIDIA hizo ~70 pasos en 20
min y se cortó como «El CLI dejó de responder». Ahora, con OpenCode (y NVIDIA, que es OpenCode), antes de avisar o cortar
kywai mira si el registro de **esa** ejecución (el archivo que OpenCode abre en `~/.local/share/opencode/log` al arrancar;
no el de otro OpenCode que trabaje a la vez) se tocó desde la última señal (`cliActivityPaths` en `agents/generic.ts`,
`activityPaths` + `touchedSince` en `agents/spawn.ts`, respeta `XDG_DATA_HOME`). Si se tocó, sigue vivo; el corte llega
tras 20 min sin pantalla y sin rastro. Si arrancan dos a la vez y no se sabe cuál es el suyo, mira la carpeta entera, y en
cualquier caso el trabajo callado tiene un tope de 60 min sin escribir nada (`QUIET_WORK_MAX_MS`).

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
  en todo el equipo (se cambia en Ajustes). Con varias peticiones en marcha, «Detener» deja elegir cuál (o todas); ese menú se abre hacia arriba (por encima del cuadro de escribir) y nunca queda
  cortado por el borde de la ventana: todos los menús flotantes (`ui/common/Popover.tsx`, `placeVertical`) se abren por el
  lado donde caben y, si ninguno basta, hacen scroll por dentro.
  Si el chat está estrecho, «Detener», la voz en directo y enviar bajan a una fila debajo del texto, dentro del mismo
  cuadro, para que lo que escribes no se quede en una columna de una palabra por línea.
- **Varias tareas a la vez por agente**: si un agente ya está ocupado y le llega otra tarea (de la misma petición, de
  otra o de otra conversación del proyecto), no espera: la empieza ya **una copia suya** («Claude 2», «Claude 3»…),
  con el **mismo modelo, nivel y esfuerzo** que él (el fuerte si la tarea es difícil), no el modelo ligero de los
  becarios. La copia sale en el 3D con el color y el robot de su agente, en un puesto de apoyo, y se va al terminar.
  Trabaja en una **copia aparte de la carpeta** y sus cambios se integran al acabar, como cuando coinciden dos
  tareas; si chocan, se resuelve igual. En el chat su trabajo sale con su agente y la marca **«Claude · Claude 2»**.
  - **Cuántas a la vez**: ⚙ → Ajustes → **Avanzado** → **Tareas a la vez** → **«Tareas a la vez de …»**, de 1 a 4 por agente (2 si no lo
    cambias; con 1 hace sus tareas de una en una, como antes). Ahí mismo está **«Tareas a la vez en todo el
    equipo»** (de 1 a 10, 3 por defecto), que cuenta a todos los agentes y sus copias. En **kywai Cloud** el plan pone
    el tope: **Cloud 3, Pro 6 y Pro Max 10** agentes a la vez. El espacio lo pregunta al portal (`GET /api/plan`) al
    arrancar y cada 10 minutos, así que al subir de plan los huecos nuevos llegan sin reiniciar (`src/main/cloudPlan.ts`).
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
  fijo del becario cuenta siempre como uno más (aunque esté vacío) y los puestos sin agente ya no se dibujan. El
  **orquestador** (el primero del orden de coordinadores, sea Hermes o cualquier otro agente) va siempre delante, en el
  puesto que mira a la cámara, también al cambiar de orquestador; con solo dos puestos, justo delante del Proyecto. El
  becario va al fondo a la derecha; con un número par de puestos el polígono se gira medio paso para que
  ninguno quede escondido detrás del Proyecto. Los becarios de más no ocupan un vértice: salen pegados al becario
  original, como una extensión de su puesto hacia fuera (filas de 1, 2 y 3). Con 10 o más puestos el polígono rodea
  también las zonas de los lados. Es solo cómo se dibuja: la configuración guardada no cambia. Los temas Casa (kywai)
  y Submarino tienen sus propios sitios, pero el orquestador también manda: en la Casa ocupa el sitio central (el de
  Hermes; el mueble va con el sitio, no con el nombre) y en el Submarino una plataforma delante, en el centro. Las
  etiquetas de los demás agentes nunca tapan al orquestador: si chocan con él, suben por encima. Aún no se aplica a la
  vista 3D de Órbita. Para desarrolladores: `src/renderer/src/scene/polygonLayout.ts` (`leadId`, con pruebas),
  `worlds/homeLayout.ts`, `underseaLayout` en `worlds/UnderseaWorld.tsx`, `LabelProjector.tsx` y el anillo de
  `Circuits.tsx`, que sigue los lados del polígono.
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
- **Aviso de atasco** (23 nov 2026; idea de LocalCode, Apache 2.0, reimplementada). Con LM Studio, Colibri, Gall u otro
  servidor local, si el modelo repite 3 veces la misma llamada a una herramienta (mismos argumentos) o choca 3 veces
  seguidas con el mismo error, kywai le pide que cambie de enfoque («Atascado: probando otro enfoque» en la tarea). Si
  vuelve a atascarse, le quita las herramientas y le pide que cuente lo que hizo, lo que falta y dónde se atascó, en
  vez de gastar los 24 pasos y acabar sin nada. Está en `src/main/agents/stuckWatch.ts`.
- **Turbo local** (21 nov 2026, decodificación especulativa; idea de HyperQwen y DFlash). Con LM Studio, si tienes
  descargado un modelo **pequeño de la misma familia** que el del agente (por ejemplo `qwen3-0.6b` para un Qwen3 de
  14B, `llama-3.2-1b-instruct` para un Llama 3.1 de 8B o `gemma-3-1b-it` para un Gemma 3 de 12B), kywai lo manda en
  cada petición como **modelo borrador** (`draft_model`): el pequeño adivina los siguientes tokens y el grande solo los
  confirma. La respuesta es **la misma** que sin turbo, pero sale más rápida, sobre todo al escribir código (de 1,5 a
  3 veces en un equipo normal; el 9x del vídeo era con vLLM en una tarjeta de 24 GB). Solo se usa si el modelo del
  agente tiene 7B o más, y el borrador como mucho 4B y la cuarta parte del grande (de los que valen, el más cercano a
  1B). En la tarea sale «Turbo local con …». Si LM Studio rechaza el borrador, esa misma petición sigue sin él y no se
  vuelve a intentar con ese modelo hasta reiniciar. Para activarlo basta con **descargar el modelo pequeño en LM
  Studio**; se apaga en ⚙ → Ajustes → Agentes → «Turbo local» (solo sale si hay un agente con LM Studio). Ollama aún
  no lo admite. Para ir más allá: en un Mac con chip de Apple, `dflash-mlx` (Apache-2.0); con una NVIDIA de 24 GB,
  HyperQwen (vLLM con parches, Apache-2.0) sirve Qwen 27B a más de 100 tokens/s y se conecta a kywai como «Otra
  dirección» compatible con OpenAI. Código: `src/shared/speculative.ts` (`pickDraftModel`, con su test) y
  `src/main/agents/lmstudio.ts` (`lmsDraftFor`, prueba en `agents/turbo.test.ts`); ajuste `localTurbo`.
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
- **Elegir el programa del agente «Modelo local»** (1.3.0, pedido por Yil el 23 nov 2026). Antes, al añadir «Modelo
  local» sin ningún modelo en el equipo, kywai instalaba Ollama sin preguntar. Ahora, en «Configura Modelo local»
  (paso 1, «Conéctalo») y en el aviso de la esquina de kywai cloud, salen cuatro tarjetas: **Ollama**, **LM Studio**,
  **Colibri** y **AirLLM**, con lo que es cada uno, si está listo, instalado o no instalado, y un botón:
  «Instalar en un clic», «Encender y usar» o «Usar este». Uno lleva **Recomendado** con el motivo
  (`recommendLocalEngine` en `src/shared/localEngines.ts`): el que ya funciona con modelos; si no, el que ya está
  instalado; si no hay ninguno, Ollama, porque es el único en el que kywai también baja el modelo que cabe en el
  equipo. Colibri y AirLLM piden un segundo toque antes de instalar (descargas muy grandes). El botón llama a
  `prepareLocalEngine` (`src/renderer/src/lib/localAutoSetup.ts`): instala (en kywai cloud en el PC que presta sus
  modelos, con la pregunta nativa de la app `client:installEngine`; en la app de escritorio con `setupInstall`),
  enciende el servidor y deja elegir el modelo de ese programa con el sugerido marcado. LM Studio sin modelos dice qué
  tamaño buscar en su catálogo. Nada se quitó: el indicador Local y «Prepararlo todo» siguen igual. Componente:
  `src/renderer/src/ui/quota/LocalEnginePicker.tsx`.
  Arreglo 1.5.2: el agente añadido guarda como proveedor su motor (`ollama`, `lmstudio`…), no `qwen`, así que
  «Configura» lo reconoce también por `isLocalEngine(agent.provider)`; antes salía «Usa la sesión de su programa» sin
  selector. Si el equipo ya tiene modelos, el aviso de la esquina ofrece además «Usar otro programa…» (paso `engine`).
  Arreglo 1.6.2: en kywai cloud, tras «Añadir», la ventana «Configura» se quedaba en «Preparando el agente…» si el
  aviso `config.updated` llegaba tarde (por ejemplo mientras la nube se actualiza). Ahora `AddAgent` mete la
  configuración devuelta al momento (`applyConfig` en `store/cowork.ts`) y `ConfigureAgent` vuelve a pedirla cada 3 s
  mientras no ve el agente. La espera a que la nube vea el equipo pasa de 30 s a 60 s (`DEVICE_TRIES`) y el aviso de
  error tiene «Volver a probar».
  Arreglo 1.6.2: pulsar «Usar este» en otro programa ya listo (por ejemplo Colibri con LM Studio en uso) solo abría
  la lista de modelos y el agente seguía en el programa de antes. Ahora `prepareLocalEngine` pasa el agente al
  programa elegido al momento (modelo sugerido o el primero, con `applyLocal`) y deja la lista abierta para cambiar de
  modelo. La tarjeta del programa que usa el agente sale con «En uso».
  - **AirLLM** ([github.com/lyogavin/airllm](https://github.com/lyogavin/airllm), Apache-2.0) vuelve (se había
    descartado el 9 nov por lento y sin servidor; Yil lo pidió de nuevo). Es una librería de Python: kywai la instala
    en `~/airllm/.venv` (con `mlx` en Mac) y le pone un servidor pequeño compatible con OpenAI en
    `127.0.0.1:8011`, solo para este equipo (`src/main/airllm.ts`). El agente local lo usa como «otro servidor» por
    la dirección de Colibri (`colibriUrl`), así que en el indicador Local sale en la pestaña de Colibri con el nombre
    «AirLLM». El modelo de fábrica es `Qwen/Qwen2.5-7B-Instruct` (se cambia en `~/airllm/model.txt`) y se descarga la
    primera vez que se le pide algo. Es muy lento, no usa herramientas y necesita NVIDIA o un Mac con chip Apple.
    Volver a pulsar AirLLM lo actualiza y lo enciende si está apagado.
  - **SuperQwen 3.8 27B** (`hf.co/Jiunsong/SuperQwen3.8-27b-abliterated-GGUF:Q4_K_M`, 16,6 GB, Apache-2.0) es un
    modelo, no un programa: sale como opción para descargar con Ollama («sin filtros») cuando cabe en el equipo, y en
    «Ver los demás tamaños». Es un Qwen 3.8 27B sin la negativa de seguridad, así que kywai **nunca** lo recomienda ni
    lo sugiere solo (`optIn` y `UNFILTERED_RE` en `src/shared/modelAdvisor.ts`): solo se usa si la persona lo elige.
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
    **LiteLLM** (4000) y **Gall** (9940). Solo pregunta `GET /v1/models`, todos a la vez y con 1,5 s de espera como mucho, así que no
    cambia nada ni frena. Los que responden salen en **«Encontrados en este equipo»** con su nombre (por el
    `owned_by` de sus modelos o, si no lo dice, por el puerto), su dirección y sus modelos, y un botón **Usar** que
    guarda esa dirección: después se elige el modelo como siempre. La pestaña pasa a llamarse como el servidor
    («llama.cpp») y, si Colibri no está instalado pero hay servidores, dice «N encontrado(s)». El puerto del propio
    Colibri instalado no cuenta como otro servidor. Ollama y LM Studio tienen su propia pestaña. Código:
    `src/main/localServers.ts` (+ prueba) y `colibriEngineStatus` en `src/main/local.ts`.
  - **Strata** (github.com/Niko1221/Strata, MIT): motor que corre modelos MoE grandes (Qwen3.8-Flash-Next,
    Qwen3.6-35B-A3B) repartiendo el trabajo entre la GPU, la RAM y el SSD, con API compatible con OpenAI y Anthropic en
    127.0.0.1:8080. Si está encendido (`strata launch`, o `strata launch --no-tui` en segundo plano) sale en
    «Encontrados en este equipo» como **Strata** y se usa con **Usar**, como los demás. Pide mucho equipo: unos 48–64 GB
    de RAM (más algo de VRAM, que acelera), 66–76 GB de descarga por modelo y un SSD; funciona en Windows y Linux con
    GPU NVIDIA o AMD y en Mac con Apple Silicon y macOS 15 o más nuevo. kywai no lo instala ni lo enciende. Con
    tarjetas de 12 GB y 64 GB de RAM, sus autores hablan de 50–90 tokens/s con Qwen3.8 (no lo hemos medido).
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
- **Relevo en cadena si el problema es la cuenta**: cuando el agente ni puede empezar (sin cuota, sin sesión, sin
  programa o apagado), la tarea pasa al siguiente que aún no la intentó, y si ese también está sin cuota, al otro, hasta
  3 relevos seguidos (`MAX_ACCOUNT_RELAYS`), como los enrutadores que saltan de un modelo gratis a otro cuando se acaba
  el cupo. Los fallos de la propia tarea siguen teniendo un solo relevo.
- **Codex** en modo protegido usa el entorno estándar de Windows (`windows.sandbox=unelevated`): el «elevated» que
  configura la app de escritorio de Codex no funciona fuera de ella y le impedía ejecutar comandos.
- **Pegar imágenes**: Ctrl+V en el cuadro de texto adjunta las capturas del portapapeles.
- **La burbuja de adjuntar**: el clip (📎) abre encima del chat una burbuja grande con «Arrastra y suelta aquí» y,
  debajo, una flecha hacia **o súbelo desde tu equipo**, que abre el selector de archivos de siempre. Al acercar un
  archivo, la burbuja se hincha y brilla; al soltarlo, cae dentro como gota y la burbuja se recoge sola hacia la caja
  de escribir, donde quedan los adjuntos. Se cierra con Esc, con un clic fuera o con el clip. El botón de imágenes
  sigue abriendo el selector directamente.
- **Los adjuntos como gotas**: delante de los archivos que van con el próximo mensaje sale una burbuja de cristal y
  cada archivo cae dentro como una gota de los colores de kywai. El área de cada gota es proporcional a lo que pesa y
  las gotas se funden como líquido, así que se ve lo cargado que va el mensaje sin leer números (al pasar el ratón,
  «3 archivos · 85 MB»). Por encima de unos 70 MB el borde se pone **ámbar** (tardará en enviarse) y si algún archivo
  pasa de 500 MB, **rojo**, porque el motor no lo envía. Al enviar, las gotas suben y la burbuja se vacía. En Órbita
  es igual, junto a los adjuntos del chat. Con «menos movimiento» no se anima. En el código:
  `ui/left/AttachDrops.tsx` y `attachDrops.ts` (colocación de las gotas), el método `fileSizes` del motor y
  `ui/orbita/AttachDrops.kt`.
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

### Los agentes hacen lo que pides: kywai y tu ordenador

Si pides **hacer** algo, un agente lo hace; nunca te contesta «hazlo tú». Antes, «quita el nvidia que dio error» iba
como consulta rápida (que solo lee) y el agente te mandaba a «Mis agentes». Ahora:

- El coordinador no manda por la vía rápida lo que hay que hacer: crea una tarea normal para Claude, Codex o Gemini.
- Si una consulta rápida resulta pedir una acción, el agente responde «ACTUAR: …» y kywai la pasa al momento a una
  tarea con herramientas y permiso para actuar (sale en la tarea: «Hay que hacerlo, no solo mirarlo»).

**Manejar kywai** (`src/main/kywaiControl.ts`, en el servidor MCP de kywai):

- `kywai_agentes`: lista Mis agentes con id, modelo, si está encendido, quién coordina y su último error.
- `kywai_agente`: quitar, encender, apagar o poner a coordinar un agente. **Quitar siempre lo confirmas tú.**
- `kywai_ajustes`: lee o cambia idioma, tema, agentes a la vez, permisos de los agentes y visto bueno a los planes.
  Los dos últimos (de seguridad) **siempre los confirmas tú**.

**Usar tu ordenador** (`src/main/computerControl.ts` y `src/main/cuaDriver.ts`, desde la 1.21.0):

- Con acceso completo, los agentes pueden trabajar fuera de la carpeta del proyecto cuando se lo pides (tus
  Descargas, el Escritorio, programas, ajustes del sistema). Sin pedirlo, fuera de ella solo lo imprescindible.
- **Motor: Cua Driver** (trycua/cua, `libs/cua-driver`, licencia MIT; la idea viene de AnyModelBot, MIT). Es un
  programa nativo que lee los botones, campos y menús de cada ventana por su nombre (el árbol de accesibilidad del
  sistema) y pulsa el elemento exacto; en Mac lo hace en segundo plano, sin mover tu ratón ni quitarte el foco. kywai
  baja la versión fija `CUA_VERSION` (0.37.0) de las Releases oficiales al minuto de arrancar, comprueba su huella
  SHA256 y la guarda en la carpeta de datos (`cua-driver/<versión>/<sistema>-<arquitectura>`). Pesa entre 35 y 85 MB y
  se baja una sola vez. Nunca se baja cua-perception ni OmniParser (AGPL) ni Cua Spaces.
- kywai lo arranca él mismo (`cua-driver mcp`; en Mac con `--direct`, así los permisos son los de kywai), sin
  telemetría, sin comprobar actualizaciones, sin `run_script` ni portapapeles y sin pasarle las claves del entorno.
  Va en modo «unrestricted» porque quien aprueba es kywai: cada llamada pasa antes por sus permisos.
- Los agentes tienen tres herramientas: `ordenador_usar` (una acción: `list_apps`, `list_windows`,
  `get_window_state`, `get_desktop_state`, `zoom`, `verify_state`, `launch_app`, `bring_to_front`, `click`,
  `type_text`, `press_key`, `hotkey`, `scroll`, `drag`, `set_value`, `invoke_menu`, `set_window_frame`,
  `run_steps`…), `ordenador_ayuda` (la explicación completa de una acción en este sistema, para no cargar 90 KB de
  instrucciones en cada tarea) y `ordenador_abrir` (un archivo, carpeta o web). `run_steps` solo admite acciones de la
  lista.
- **Modo sencillo** (si el driver no se puede preparar: sin conexión, sistema sin paquete oficial): las herramientas de
  antes, `ordenador_captura`, `ordenador_clic`, `ordenador_escribir`, `ordenador_tecla` y `ordenador_abrir` (Mac con
  Quartz y System Events, Windows con PowerShell, Linux con xdotool). Si el driver falla a mitad de una tarea, las
  acciones básicas siguen por este modo.
- **Mac, la primera vez** (1.21.1): si a kywai le falta **Accesibilidad** (ratón y teclado) o **Grabación de
  pantalla** (ver), el Mac lo pide y sale un aviso en «Te necesita» con **Abrir Ajustes** (abre esa página de
  Privacidad y seguridad) y, para la Grabación, **Reabrir kywai** (el Mac solo la aplica al reabrir). La tarea espera
  hasta 3 minutos y sigue sola en cuanto lo actives; si no, el agente te lo explica y sigue con lo que pueda.
- **Permitir siempre** (1.21.1): en «Preguntarme antes», los permisos de ver la pantalla y de usar el ratón y el
  teclado tienen un cuarto botón, «Permitir siempre», que se recuerda también tras reiniciar (`computerAlways` en la
  configuración). Se olvida al cambiar los permisos de los agentes o con **Olvidar** en Ajustes → Agentes. Borrar,
  pagar, comprar, publicar o enviar nunca lo ofrecen: se confirman cada vez.
- **En vivo y «Parar»** (1.21.2, `src/main/computerOverlay.ts`): mientras un agente usa tu ordenador sale arriba a la
  derecha una ventanita siempre encima con quién es, el paso que da y una miniatura de lo último que vio. No coge el
  foco y no sale en las capturas del agente. **Parar** (o Ctrl+Alt+Esc; ⌃⌥⎋ en Mac, aunque kywai no esté delante)
  pausa las ejecuciones que usan el ordenador (se pueden reanudar) y rechaza lo que aún llegue de ellas durante 5
  minutos. Se cierra sola tras 45 s sin acciones o al terminar la tarea.
- **Desde kywai cloud** (1.21.3, web o móvil): con la app de escritorio conectada en ⚙ → Ajustes → **Este PC** y
  **«Ratón y teclado»** encendido (lo enciende el interruptor general «Conectar kywai cloud con este PC»; también se
  puede apagar solo eso en «Elegir qué hace»), los agentes de la nube tienen las mismas herramientas. Los permisos se
  piden en la nube; cada acción viaja por el puente (`deviceBridge.computer` → `bridgeClient.handleComputer` →
  `runComputer` con `remote`) y se hace en el PC con su motor. En el PC se ve en la ventanita («… usa este PC desde
  kywai cloud») y **Parar** también corta la tarea de la nube. Si el Mac aún no tiene los permisos, se abre solo el
  ajuste de Privacidad y seguridad. Va con «Conectar kywai cloud con este PC» (también en los equipos que ya estaban
  conectados); se apaga por separado en «Elegir qué hace».
- **Con varios equipos** (1.30.1): cada mensaje que envías desde la app de escritorio lleva su equipo (lo pone el
  servidor por la llave de ese equipo, `withOrigin` en `webServer.ts`; la página no puede cambiarlo) y «Tu ordenador»
  actúa **en el equipo desde el que escribes**. Si nombras otro («en mi Windows haz…», «en el Mac mini»), el agente lo
  pasa en `equipo` y se hace allí (`matchComputer`: por nombre o por sistema). Desde el navegador o el móvil, en el
  equipo que usaste hace menos. Si escribes desde un equipo con «Ratón y teclado» apagado, kywai te lo dice en vez de
  usar otro. Hermes ve la lista de tus equipos en «¿Se puede aquí?» y el permiso dice en qué equipo se hará.
- **Windows**: las ventanas de un programa abierto como administrador no se pueden manejar salvo que kywai también
  se abra como administrador. **Linux**: con Wayland solo se maneja la ventana de delante; leer las ventanas necesita
  AT-SPI (activado en GNOME y KDE).
- **Sin mover tu ratón en Windows y Linux** (1.30.52, `src/main/agentDesktop.ts` + `src/main/computerElements.ts`; idea
  del vídeo de gitrepo.es): un segundo motor, **agent-desktop** (vercel-labs/agent-desktop, licencia Apache-2.0), da a
  los agentes la herramienta `ordenador_elementos`. Lee cada ventana como una lista de botones y campos con su ref
  («@s…:eN», del árbol de accesibilidad: UI Automation en Windows, AT-SPI en Linux) y pulsa o escribe en ellos con la
  propia accesibilidad del sistema, **sin mover el puntero ni quitarte la ventana**: puedes seguir trabajando mientras
  tanto. Los agentes la usan antes que `ordenador_usar`, que queda para arrastrar, coordenadas y capturas; en Mac sigue
  Cua, que ya trabaja en segundo plano. Se descarga sola (unos 16 MB, la primera vez o al minuto de abrir kywai) del
  paquete oficial de npm en una **versión fija** (`AD_VERSION`), comprobando su huella sha512 y la sha256 del programa;
  no se ejecuta su instalador. Solo pasan las acciones de `AD_ACTIONS` (sin portapapeles, ratón físico, cajas de
  arena ni sesiones), cada una con los permisos de siempre, y su estado vive en la carpeta de datos de kywai
  (`agent-desktop/estado`), sin las variables con claves. Lo que se escribe en un campo de contraseña o código sale
  como «••••••» en el permiso y en la ventanita en vivo. Desde kywai cloud funciona igual en un PC con «Ratón y
  teclado» encendido (con kywai 1.30.52 o más en ese PC).
- **Si la pantalla cambia, reintenta solo cuando es seguro** (1.30.53, `retryStale` en `computerElements.ts`): si
  al pulsar o escribir la ref ya no vale (`STALE_REF`, `ELEMENT_NOT_FOUND`, `WINDOW_NOT_FOUND`: la ventana se redibujó o
  se volvió a abrir) y el motor dice que **no llegó a hacerse** (`retry: safe`, `not_delivered`), kywai vuelve a leer
  la ventana igual que antes, busca el **mismo** botón o campo (mismo papel y nombre; si hay varios, el del mismo
  camino) y lo intenta **una vez** con la ref nueva, avisando al agente. Si pudo llegar a hacerse, si el botón sale
  repetido o ya no está, no repite: explica el error en español con qué hacer (con varias ventanas iguales,
  `AMBIGUOUS_TARGET`, le da la lista para que elija una con `window_id`).
- **Apps grandes gastando menos tokens** (1.30.54, `renderSnapshot` y `actionText` en `computerElements.ts`): la
  ventana le llega al agente como **líneas cortas** (`[@s…:e3] button «OK»`, con su valor y solo los estados que
  importan; los grupos vacíos no ocupan línea) en vez del JSON del motor, que en un diálogo sencillo es casi tres
  veces más largo (836 frente a 301 caracteres, medido en Linux). Si la ventana pasa de `BIG_LINES` (150) líneas, como
  Slack, Excel o un navegador, kywai le da primero el **mapa de sus zonas** (`skeleton`, con «+N dentro») y el agente
  pide solo la que necesita con `root`. Pulsar o escribir contesta en una línea («Hecho y comprobado. Ahora vale…»).
  Este motor no manda capturas de pantalla.
- **Tus avisos del sistema** (1.30.55, `src/main/computerNotifications.ts`, herramienta `ordenador_avisos`, también
  en **Mac**): «lee mis notificaciones», «descarta el aviso del calendario», «pulsa Abrir en el aviso del correo». Lee
  el Centro de notificaciones (Mac), el Centro de actividades (Windows) o los avisos de GNOME (Linux) con el mismo
  motor agent-desktop, en líneas cortas (número, app, título, texto y botones). Para descartar o pulsar un botón el
  agente tiene que decir **qué aviso era** (`expected_app` y/o `expected_title`): si en ese número ya hay otro, no se
  toca. Donde el sistema no deja abrir el panel por dentro (`POLICY_DENIED`: Windows con el Centro de actividades
  cerrado, Linux) se repite como lo haría una persona (`--headed`, un momento en primer plano). Permisos de siempre:
  mirar es «ver tu pantalla»; descartar o pulsar pide permiso con «Preguntarme antes», y «Enviar» o «Borrar» se
  confirman siempre. En Mac usa el permiso de **Accesibilidad** de kywai. Probado en Linux sin GNOME (avisa de que no
  hay servicio de avisos); en Mac y Windows falta probarlo con avisos de verdad.

Permisos, iguales para todo: con **acceso completo** actúan solos; con **«Preguntarme antes»** (o «Solo la carpeta del
proyecto») cada acción te pide permiso. **Borrar, pagar, comprar, publicar o enviar lo confirmas siempre tú**, aunque
tengan acceso completo. Cada acción queda escrita en la tarea, y «Detener» la corta.

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

### Tres vías: al momento, un agente o el equipo completo

Antes de escribir un plan, kywai decide por qué vía va cada mensaje (el **triaje**). Así lo sencillo no espera a todo el
equipo, y lo importante sigue con plan y revisión.

- ⚡ **Al momento**: el coordinador lo contesta él mismo, en segundos. Charla, conocimiento general, explicaciones,
  consejos, cuentas, dudas de cómo usar kywai (lleva los extractos del manual que vienen al caso) y todo lo que
  preguntas sobre la conversación o sobre lo que el equipo ya hizo (lleva la memoria y las instrucciones del proyecto).
- 👤 **Un agente**: para responder hay que mirar algo (un archivo del proyecto, una captura, una web, un dato de hoy),
  sin cambiar nada. Lo mira un solo agente (Claude si está, luego Codex o Gemini) con un encargo corto y su modelo
  rápido, **sin plan y sin revisor**, y su respuesta sale tal cual. Una captura con una pregunta va directa por aquí,
  sin pasar antes por el coordinador.
- 🧠 **Equipo completo**: plan, agentes y revisión, como siempre y en modo calidad. Es la vía de todo lo que pide
  hacer, crear, cambiar, instalar, publicar o enviar algo, de un informe o un análisis, de ver o recibir un archivo,
  de «ya», «hazlo» o «sigue» (retoman un trabajo), de los comandos («/…», «@…»), de un archivo adjunto que no es
  imagen y de los mensajes de más de 600 caracteres.

Cómo se decide: si el mensaje pide claramente hacer algo, va directo al equipo completo, sin gastar la llamada del
triaje. Si no, el coordinador recibe un encargo corto (sin fichas del equipo ni reglas del plan, con su modelo ligero y
poco esfuerzo) y contesta, o dice «MIRAR» (y qué mirar) o «PLAN». Ante la duda elige la vía más completa. Si tarda más
de 25 s, falla o está ocupado, la petición se planifica como siempre. Las rutinas, las recetas y los cambios a un plan
propuesto nunca usan el triaje.

**Lo trivial, al instante y sin modelo.** Un saludo («hola», «buenas»), «¿cómo estás?», «¿estás?» (también «estas», «sigues ahí»,
«hay alguien») o «gracias», con o sin tildes ni signos, lo contesta la propia app en el acto, sin llamar a nadie
(`instantReply` en src/main/plan.ts). Si hay trabajo en marcha en el proyecto no: entonces «¿estás?» suele preguntar
por él y lo contesta el coordinador, que sabe cómo va.

**Mientras te contesta**, la fila del chat dice «kywai / Hermes te está contestando» y no «prepara el plan»: el plan
solo se anuncia cuando de verdad lo prepara (hay que hacer algo). Lo marca `replying` en el estado del agente.

**Mensajes muy cortos de charla** (hasta 5 palabras y 40 caracteres, sin preguntar qué se puede hacer: `isTinyMessage`):
su triaje no lleva memoria, extractos del manual ni la tabla de lo que puede hacer el equipo, y no espera a comprobarla
(va con lo último que se supo; antes esperaba hasta 2,5 s). Lo que pregunta «¿puedes hacer vídeos?» sigue con todo.

**Sin razonar.** En el triaje, Hermes va con `--reasoning none` y una sola herramienta (`-t todo`): su configuración
suele traer el razonamiento en «medium», y con eso hasta Claude Haiku tardaba 7 s en contestar «estas» (22 nov, PC
Windows: 366 tokens pensando). Un Hermes antiguo que no conozca `--reasoning` se repite sin él. Claude, Codex y Gemini
ya iban con poco esfuerzo. El encargo también le pide leer los mensajes cortos sin tildes o con erratas por lo más
probable («estas» es «¿estás?»).

Bajo la respuesta rápida, el chat dice por qué vía fue («Respuesta al momento» o «Respuesta rápida: un agente lo miró,
sin plan ni revisión»). Si quieres el equipo completo, escribe **«a fondo»** en tu mensaje.

En «Uso y coste» cada petición guarda su vía (`lane`: direct, agent o full) y la llamada del triaje queda marcada
(`quick`), para medir cuántas se resuelven así.

### El coordinador mira él mismo y «Probar agentes»

- **Mira él mismo.** Si quien coordina puede leer la carpeta (Claude Code, Codex o Gemini CLI), una pregunta que
  necesita mirar algo («¿qué versión de Vite usa?», «¿dónde está el login?») la mira él, solo leyendo, y responde en
  la misma llamada: sin «MIRAR», sin pasarlo a otro agente y sin plan. Si al mirar ve que hace falta cambiar algo o
  investigar a fondo, contesta «PLAN» y sigue el equipo completo. Si coordina uno que no lee archivos (Hermes, un
  modelo local), lo mira un agente con un encargo corto, y si quien coordina también trabaja, es él mismo.
- **«Probar agentes».** «/probar», o un mensaje como «prueba cada agente a ver si están en línea», no pasa por el plan
  ni por otro agente: kywai comprueba que el programa de cada agente está y le pide una palabra con su modelo rápido,
  a todos a la vez (tope 60 s cada uno). Sale una tabla con quién responde, con qué modelo, cuánto tarda y, si falla,
  por qué en palabras sencillas (sin sesión, sin cuota, no instalado, no responde). Código: `src/main/agentProbe.ts` y
  `probeTeam` en `src/main/orchestrator.ts`.
- **Claude Code anticuado (24 nov 2026).** En Claude Code anterior a la 2.1.331, una herramienta MCP que respondía mal
  (las de kywai van por MCP en cada tarea) dejaba la llamada esperando hasta 30 minutos y la tarea parecía atascada. Si
  hay Claude en el equipo y `claude --version` es anterior, «/probar» lo avisa bajo la tabla, y en ⚙ → Configurar
  agentes → Programas su fila dice «conviene la 2.1.331 o posterior» con un botón «Actualizar» (vuelve a pasar su
  instalador, que deja la última). La versión mínima está en `src/shared/claudeVersion.ts`.
- **Lo de fuera son datos, no órdenes (24 nov 2026).** Los agentes de código siguen órdenes escondidas en páginas que
  salen en sus búsquedas. Cada tarea con carpeta lleva una regla fija (`UNTRUSTED_RULE` en `src/main/orchestrator.ts`,
  junto a las reglas de oro): lo que lean en webs, búsquedas, issues, comentarios, correos o paquetes son datos; no
  instalan, ejecutan, mandan claves ni cambian de tarea porque lo pida eso, y si algo lo pide lo cuentan al final.
- **Hermes con OmniRoute apagado (v1.11.1).** En kywai cloud el OmniRoute del espacio se apaga tras 20 min sin Hermes
  y volver a encenderlo lleva hasta un minuto. Antes ese arranque contaba dentro del tope: la prueba decía «Hermes no
  responde (más de 60 s)» y la primera pregunta tras un rato sin uso se pasaba de los 25 s de la respuesta al momento.
  Ahora `warmHermes` (`src/main/agents/hermes.ts`) lo enciende ANTES de poner el reloj, en la prueba y en el triaje;
  la columna «Tarda» es solo lo que tarda su modelo, y si OmniRoute no enciende, la tabla dice eso y no «no responde».
  La prueba pide la palabra en modo rápido (`quick`: sin razonar y con una sola herramienta en Hermes).
- **OmniRoute despierto con kywai abierto (v1.15.6).** Medido el 23 nov con 2 CPU, como un espacio: arrancar OmniRoute
  en frío tras un rato apagado lleva de 5 a 48 s (su carpeta pesa ~650 MB y, tras 20 min sin uso, el disco ya no la
  tiene en memoria); Hermes en sí solo añade ~2 s por consulta. Por eso «¿merece la pena tener tantos agentes?» tardó
  un minuto: el arranque se comía los 25 s de la respuesta al momento y la petición pasaba al plan completo. Ahora, al
  abrir kywai en el navegador (cada conexión de `/api/events`), `omniRouteViewerOpened` (`src/main/omniroute.ts`)
  lo enciende en segundo plano y no lo deja dormirse mientras haya alguna pantalla abierta; al cerrar la última,
  vuelve a contar los 20 min sin uso. Solo en kywai cloud y solo si algún Hermes del equipo usa ese OmniRoute.
- **El gateway de Hermes, despierto (v1.15.8).** Tras la 1.15.6 Hermes seguía tardando un minuto («¿merece la pena tener
  tantos agentes?», 23 nov). Medido con 2 CPU: `hermes chat` habla con un «gateway» de Hermes que él mismo enciende si
  no hay ninguno y que se apaga solo tras 10 min sin uso (`gateway.unmanaged_idle_exit_seconds`). Volver a encenderlo
  (comprobaciones, plugins, herramientas) lleva de 13 a 35 s; con él encendido, Hermes tarda ~3 s en llegar al modelo.
  Ese arranque se comía los 25 s de la respuesta al momento y el mensaje pasaba al plan completo. Ahora `warmHermes`
  (`src/main/agents/hermes.ts`) despierta el gateway con `hermes gateway attach --recover` a la vez que OmniRoute y
  ANTES de poner el tope, solo si Hermes lleva 5 min sin usarse (`src/main/agents/hermesGateway.ts`). En kywai cloud,
  `hermesViewerOpened` (llamado en `/api/events`) lo enciende al abrir kywai y lo toca cada 5 min mientras haya una
  pantalla abierta; al cerrar, Hermes lo apaga él solo a los 10 min (y no si tiene rutinas o tareas suyas).
- **Un enlace lo abre un agente (v1.15.8).** «este https://orkas.ai/…» iba a la respuesta al momento, que no tiene
  herramientas, y Hermes contestó «no tengo acceso a URLs». Ahora un mensaje con un enlace va por la vía «lo mira un
  agente» (`routeMessage` → `look`, en `src/main/plan.ts`): lo abre quien coordina si puede leer la web, o Claude,
  Codex o Gemini; si no hay ninguno, el plan completo. Y si la respuesta al momento dice que no puede entrar en la web
  (`claimsNoWeb`), lo mira un agente en vez de enviar eso.
- **Tiempos por paso.** Bajo cada respuesta, la línea de consumo dice cuánto duró cada paso cuando hubo más de uno
  («2 min (coordinar 8 s, trabajar 1 min, revisar 40 s)») y qué parte de los tokens se leyó de caché, que cuesta mucho
  menos («185 k tokens (92 % de caché)»).

### Encargo por capas e identidad fija del coordinador

- **Solo lo que toca.** El encargo del coordinador ya no lleva siempre el catálogo entero de órdenes y reglas. Cada
  regla larga (rutinas, vídeo, imágenes, «a dos manos», conexiones, añadir a una tarea en marcha) solo entra cuando la
  petición, los últimos mensajes o los adjuntos hablan de eso; si no, queda una línea corta que dice que existe. La guía
  pasa de unos 34 000 caracteres a unos 15 000 en una petición normal: menos tokens y respuestas antes. Código:
  `topical` en `src/main/coordinatorGuide.ts` y `buildPlanPrompt` en `src/main/orchestrator.ts`.
- **Quién eres.** Coordine quien coordine (Claude, Codex, Gemini, Hermes, un modelo local), el triaje y el plan empiezan
  con la misma identidad corta: el asistente principal del usuario, una navaja suiza que resuelve él lo que puede, no
  gasta pasos que no aportan, habla al grano y busca una habilidad cuando le falta. `coordinatorIdentity` en
  `src/main/coordinatorSoul.ts`.

### El coordinador busca otro camino, aprende tu estilo e instala habilidades

- **Otro camino.** Si una petición termina con alguna tarea fallida (y ya falló también el relevo a otro agente), el
  coordinador replanifica **una sola vez** con lo que se intentó y por qué falló, para probar otro agente u otro
  enfoque; lo que salió bien se queda. No lo hace si el fallo es de sesión o cuota, si una tarea espera tu decisión, si
  no queda ningún otro agente libre, con esfuerzo «Rápido», en rutinas ni en órdenes como /video. En el chat sale «Algo
  falló: … busca otro camino (una sola vez)».
- **Aprende de ti.** Cada pocas peticiones (o en cuanto dices cómo lo quieres: «más corto», «prefiero listas», «al
  grano») el coordinador repasa en segundo plano, con su modelo rápido, una ficha corta de cómo eres: si prefieres
  respuestas cortas o detalladas, cómo pides las cosas, qué te gusta y qué no (también tus 👍/👎) y qué agentes te han
  funcionado. Se guarda en `coordinador-alma.md` en la carpeta de trabajo, la puedes leer y corregir a mano, y va en
  cada triaje, plan y respuesta final. Sin datos sensibles. Se apaga con `learnStyle: false` en la configuración.
- **Habilidades solas.** Cuando el plan pide una habilidad y la mejor del catálogo es de una fuente de confianza o la
  usan más de 1 000 personas, kywai la instala sin preguntar y lo dice en el chat; si no, sale la tarjeta de siempre
  para que elijas. Se apaga con `autoSkills: false`.

### El coordinador se adelanta a lo que necesitas (20 nov 2026)

No hace falta conocer las habilidades, los especialistas ni las órdenes de kywai. El coordinador lee la conversación
entera (lo que pediste antes, tus archivos, tu negocio o tu proyecto), entiende qué quieres conseguir y elige él los
agentes, los especialistas, las habilidades y las órdenes («/video», «/radar»…) que hagan falta. Si para que el
resultado te sirva falta un paso que no dijiste (los textos además de la foto del producto, comprobar lo programado, la
versión vertical de un vídeo), lo añade al plan y te lo cuenta en una frase.

- **Sin visto bueno** (ni «Pedir mi visto bueno a cada plan» ni «Preguntarme antes»): lo hace solo. Lo que añade va en
  el plan y, si es algo que se repite (el informe de cada lunes), te deja la tarjeta «Crear rutina» sin preguntar.
- **Con visto bueno**: lo que añade sale en el plan para que lo quites si no lo quieres, y lo que vendría después
  (repetirlo cada semana, publicarlo, otra versión) te lo ofrece en una sola pregunta al final o como rutina.
- **Rutinas**: no pregunta nada, porque no estás delante; hace lo que pediste y deja anotado lo que convendría después.
- **Nunca por su cuenta** lo que no tiene vuelta atrás o sale fuera: publicar, enviar mensajes o correos, pagar,
  cambiar precios o pedidos de la tienda o borrar. Eso lo deja listo el agente y lo confirmas tú.

Está en la sección «Adelántate» de `src/main/coordinatorGuide.ts` y vale con cualquier coordinador.

### Lo siguiente que pedirías (sugerencia en gris)

Al acabar bien una respuesta, el coordinador adivina por el hilo de la conversación cuál será tu próxima petición
(probar lo hecho, el siguiente paso, un cambio que se ve venir) y sale **en gris dentro del cuadro de escribir**, como
las predicciones del cuadro de Codex. **Tab** (o →) la pone como borrador para editarla o enviarla; no se envía sola.
Si escribes otra cosa, desaparece, y **Esc** la quita. Se calcula en segundo plano con el modelo rápido de quien
coordina (una llamada corta, con los últimos mensajes y lo que sabe de tu estilo), así que no retrasa la respuesta; si
llega cuando ya escribiste, no se pone. No sale con una tarea en marcha, con un plan esperando tu visto bueno ni en
rutinas. Se apaga con `suggestNext: false`. Código: `src/main/nextRequest.ts`, `maybeSuggestNext` en
`src/main/orchestrator.ts` y el cuadro en `src/renderer/src/ui/left/Composer.tsx`.

La sugerencia se pinta en una capa encima del cuadro vacío (`.ghost`), con la etiqueta **⇥ Tab** como una pastilla que
no se parte. El cuadro mide su altura con esa capa y vuelve a medirla cuando cambia de ancho (ventana, barra lateral o
paneles), así que una sugerencia larga lo hace crecer y nunca se monta encima del clip, la imagen o el micrófono.

### Añadir a una tarea en marcha sin esperar

Si mientras un agente trabaja escribes algo que completa ese mismo encargo («ah, y que el título sea azul», «no uses
fotos de stock», «añade también la versión en inglés»), no hace falta decir a qué tarea va ni pedir nada especial: el
coordinador (el agente que tengas en ese papel, sea cual sea) lo entiende por la conversación y lo pone en `addTo` con
el número de la tarea. Entonces:

- **Si la tarea aún no ha empezado**, lo nuevo se añade a su encargo.
- **Si está trabajando con Claude Code o Codex**, kywai la corta en ese momento y el mismo agente **sigue en su misma
  sesión** con lo nuevo («El usuario añadió algo mientras trabajabas»): recuerda lo que leyó e hizo, no empieza de cero
  ni se tiran los tokens de antes.
- **Con otros agentes** (que no retoman sesiones), termina lo que estaba haciendo y, antes de la revisión, sigue con lo
  nuevo sobre lo que ya hizo.

En los tres casos no se crea otra tarea y la revisión se hace **una sola vez, al final**, con todo. Si la tarea ya
terminó, lo nuevo va como continuación del mismo agente. El registro de la tarea apunta cada cosa añadida. Lo que es
otro encargo distinto sigue siendo una tarea nueva, como siempre.

Desde el 20 nov 2026 (idea del modo Multiagent de Perplexity, donde el líder avisa solo a los agentes afectados) lo
añadido también queda en la **pizarra del equipo** como «El usuario («tarea»): Añadió o cambió en esta tarea: …».
Solo se corta la tarea afectada; los compañeros que trabajan a la vez lo leen en la pizarra sin interrumpirse, y las
tareas que empiezan después lo reciben en su encargo.

### Lo que envías sale al momento en el chat (1.17.10)

Al pulsar Intro el cuadro de escribir se vacía ya (`clearForSend` en `Composer.tsx`), sin esperar a que el motor
conteste; si el envío falla, el texto y los adjuntos vuelven al cuadro (salvo que ya hayas escrito otra cosa). A los 2 s
se mira que tu mensaje esté en el chat (`showWhenSent`, por su `runId`); si no ha llegado, se vuelve a pedir la
conversación al motor (`resyncChat` del almacén `store/cowork.ts`: la abierta en el motor para el chat principal, la suya
para el chat de al lado o una ventana suelta).

Por qué: el 23 nov 2026 Yil escribía «todo bien ?» en la app de escritorio con kywai cloud y no pasaba nada; al cerrar y
abrir la app estaba enviado y Hermes había contestado (dos veces, porque lo reenvió). La conexión de eventos de la
versión web (`EventSource` de `/api/events`) se puede quedar abierta pero muda (proxy, red, despliegues que recargan
Caddy) y entonces no llega ni tu mensaje ni la respuesta. Arreglo en tres partes:

- El servidor late cada 20 s (`event: ping` en `openEvents` de `webServer.ts`), así los proxies no cortan una conexión
  callada.
- La página (`createWebApi` en `lib/api.ts`) vigila el latido: si lleva 50 s sin oír nada, abre otra conexión. Al
  reconectar con la misma app, además de la configuración, avisa `cowork:resync` y el chat abierto se pone al día con lo
  que se perdió. Con un servidor sin latido (versión anterior) el vigilante no hace nada.
- La comprobación de los 2 s tras enviar, que también cubre la app de escritorio sin nube.

Pruebas: `store/resyncChat.test.ts`.

### Selector de esfuerzo en el chat

Junto a adjuntar y dictar, el botón del velocímetro elige cuánto esfuerzo pone el equipo en tus mensajes. Se recuerda en
cada equipo y va con cada mensaje (también con las notas de voz):

- **Automático** (por defecto): kywai decide por la petición con el triaje de arriba. Lo sencillo, al momento; lo que
  hay que mirar, un agente; lo importante, el equipo completo con revisión.
- **Rápido** ⚡: el coordinador planifica con el esfuerzo más bajo, todas las tareas van como fáciles (modelo ligero
  y becario en las respuestas de texto) y **nada se revisa**. Gasta menos tokens.
- **Máximo** 🚀: sin triaje ni consultas rápidas; todas las tareas con el modelo más potente de cada agente y
  **todo se revisa**, también las respuestas de texto. Para trabajos muy importantes o complicados: tarda y gasta más.
- **Equipo a fondo** 👥 (20 nov 2026, idea del modo Multiagent de Perplexity, que allí es solo web y del plan de
  167 $/mes): todo lo de Máximo y, además, el coordinador reparte el trabajo en 2 a 6 partes que se hacen a la vez y
  las da a agentes de **programas distintos** (Claude, Codex, Gemini…; el encargo le dice cuáles hay libres de cada
  uno). Cada agente recibe la regla de apuntar sus hallazgos en la pizarra en cuanto los tiene, usar los de los
  demás y **objetar** lo que no cuadre (`pizarra_objetar`); cada tarea la revisa un agente de otro programa, y quien
  coordina resuelve las objeciones en la respuesta final. Es lo más fiable y lo que más tarda y gasta: no se activa
  solo. Va en la petición como `effort: 'team'`; en «Uso y coste» queda como `high`. Órbita aún no tiene el selector.

Si no es el automático, el icono se marca en color. En «Uso y coste» cada petición guarda el esfuerzo elegido
(`effort`). Escribir «a fondo» en un mensaje sigue pidiendo el equipo completo aunque estés en Automático.

### Investigación amplia: un agente por elemento (20 nov 2026)

Idea de Wide Research de Manus. Cuando pides lo mismo para **muchos elementos independientes** («investiga estas 20
empresas», «revisa cada una de estas webs», o pegas una lista de 7 o más líneas con viñetas, números o enlaces), un
solo agente con todos se queda corto y mezcla datos. kywai lo reconoce (`wantsWide` en `plan.ts`: «investigación
amplia», «uno por agente», «N empresas/webs/productos…» con N ≥ 7, o la lista pegada) y le pide al coordinador **una
tarea de texto por elemento** (o por grupos de 2 o 3 si son más de 24), todas con la misma forma de respuesta (los
mismos apartados, con fuentes) y repartidas entre agentes distintos, más una última **«Juntar los resultados»** que
depende de todas y entrega la tabla o el informe, marcando lo no confirmado. En ese caso el plan puede tener **hasta 25
tareas** en lugar de 6, pero solo si tiene esa forma (muchas sin dependencias y como mucho una que las junta:
`isWidePlan`); si no, se queda en 6 como siempre. Se lanzan a la vez las que caben en «Tareas a la vez en todo el
equipo» y el resto en cuanto se libran.

**Encargos en lote (22 nov 2026, idea de Kimi Work).** Lo mismo vale para hacer algo con cada fila de una lista:
«escribe un correo a cada uno de estos 30 negocios», «una tarea por fila», «en lote». Si la lista aún no existe, la
primera tarea la prepara en `lote/lista.csv` y las de cada elemento dependen solo de ella; cada una trabaja en su
carpeta `lote/<número>-<nombre-corto>/` para que no se pisen, y la última, «Juntar los resultados», escribe
`lote/resultados.csv` (una fila por elemento, con su estado y el enlace a lo que entregó). `isWidePlan` acepta también
esa forma: una sola tarea raíz, al menos 7 que dependen solo de ella y como mucho una que las junta.

### El plan se ve mientras se escribe

Mientras el coordinador prepara el plan, la fila «prepara el plan» del chat ya no enseña solo un texto fijo: va
mostrando **lo que lleva escrito para ti** (su mensaje y, debajo, los títulos de las tareas según las va poniendo).
Nunca se ve el formato interno. Al terminar, el plan sale como siempre y ese borrador desaparece. También se ve así la
respuesta al momento. Funciona con los agentes cuyo programa da el texto a trozos (Claude Code y Gemini).

Con los que no lo dan (Codex), y también antes de que cualquiera empiece a escribir, la fila enseña **en qué está
pensando** («Pensando: …», su último razonamiento en una línea). En cuanto hay algo escrito para ti, eso pasa a verse
y un pensamiento posterior ya no lo tapa. Si el programa tampoco cuenta lo que piensa, la fila sigue con el texto fijo
hasta que llega el plan.

### Tras un reinicio, el trabajo sigue solo

Si kywai se cierra, se actualiza o se cae con trabajo a medias, al volver a arrancar **lo retoma solo**, sin esperar a
que pulses «Reanudar»: las tareas siguen donde quedaron (lo terminado no se repite) y el chat lo dice («kywai se
reinició con este trabajo a medias. Sigo donde lo dejé»). Si se cortó mientras el coordinador preparaba el plan, la
petición se vuelve a planificar con tu mismo mensaje, en lugar de perderse.

Para que no gaste sin que lo sepas, tiene límites:

- Solo una vez por petición. Si se corta otra vez después de retomarse sola, espera en «Te necesita» con «Reanudar» y
  «Quitar», como siempre.
- Lo que detuviste o cancelaste tú no vuelve solo.
- Lo que quedó a medias hace más de 12 horas tampoco: espera tu decisión.
- Una petición cortada mientras se planificaba solo se replanifica si era un mensaje normal del chat (no una rutina,
  una plantilla ni los cambios a un plan propuesto).

kywai sabe qué estaba en marcha por un registro pequeño en la carpeta de datos (`workspace/active-runs.json`): cada
petición se apunta al empezar y se borra al terminar. El trabajo en sí sigue guardado en el proyecto.

### Si el plan no llega bien, lo arregla el mismo coordinador

El coordinador tiene que devolver su plan en un formato que kywai pueda repartir. A veces lo escribe en texto corrido
(«Tarea 1: que Codex haga…»). Antes, kywai le pasaba la petición entera a otro agente, que volvía a leerlo todo desde
cero. Ahora le pide **al mismo coordinador**, una sola vez, que pase lo que ya escribió al formato: es una llamada
corta, con el esfuerzo más bajo y su modelo ligero si tiene uno, que no lleva nada del proyecto y tarda segundos (tope:
90 s). Mientras tanto su estado dice «Ordenando el plan». Si tampoco así lo da, sigue como siempre: planifica el
siguiente de la lista y el chat lo dice.

Cada llamada de planificar apunta en el registro de consumo si el plan llegó en el formato (`planValid`) y si era una
reparación (`repair`). Con eso se mide al coordinador: cuánto tarda en dar un plan que se puede repartir, cuántas veces
no responde y cuántas hubo que pasárselo a otro (`scripts/medir-coordinador.mjs` de kywai Cloud).

### Tu visto bueno a cada plan

Antes de que nadie empiece, el coordinador (Hermes por defecto, u otro agente) te enseña su plan en el chat: qué ha
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

#### Revisión del plan con ojos nuevos

Es la idea de «elefante y pez dorado» de Google (`google/elephant-goldfish-model`, Apache-2.0), hecha en kywai con
sus propios agentes. El coordinador es el elefante: conoce toda la conversación y escribe el plan. Si el plan tiene
**dos tareas de trabajo o más, o una difícil**, antes de enseñártelo lo leen **uno o dos agentes de otra familia**
(los peces dorados: por ejemplo Gemini y Codex si planificó Hermes o Claude), **sin la conversación**: solo tu
petición, el plan y el proyecto, en modo solo lectura. Como no saben lo que se habló, ven lo que el plan da por
supuesto. Cada uno mira con una lente:

- **Huecos y supuestos**: datos o decisiones que no están escritos, tareas que faltan para llegar a lo pedido
  (probar, integrar, entregar), criterios de «hecho» vagos, cosas pedidas sin cubrir.
- **Encaje con el proyecto y orden**: archivos que no existen o no encajan con el código, dependencias mal puestas,
  dos tareas en los mismos archivos a la vez, tareas demasiado grandes, riesgos sin tratar.

Lo que encuentran sale **debajo del plan** («Revisado con ojos nuevos…»), lo importante primero, como mucho 8
puntos y sin repetir; si no ven nada, lo dice en una línea. Tú decides: lo apruebas así o pides cambios, y el
coordinador los replanifica viendo también esos hallazgos. Si un revisor tarda más de 3 minutos o no contesta, el plan
sale sin su parte. Cuenta en «Uso y coste» como una comprobación.

**No se repite en aclaraciones ni correcciones.** Si contestas a un plan que ya viste («el servidor está en AWS, en
DigitalOcean solo tenemos el DNS») o todas las tareas siguen lo que el mismo agente ya estaba haciendo, el plan nuevo
sale **sin otra ronda de ojos nuevos**: ya se revisó una vez y volver a hacerlo solo te hace esperar. Con el selector
de esfuerzo en **Rápido** nunca se revisa; en **Máximo** se revisa todo plan con trabajo, también las correcciones. Se apaga en ⚙ → Ajustes → Agentes → «Revisar el
plan con ojos nuevos» (solo sale con «Pedir mi visto bueno a cada plan» encendido). Código: `src/main/planReview.ts`
(las peticiones a los revisores y cómo se leen) y `reviewPlanFresh` en `src/main/orchestrator.ts`; pruebas en
`planReview.test.ts` y la Q de `orchestrator.check.ts`.

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
- **El presupuesto de API** del mes, al llegar al 80 % y al pasarlo, y la petición que se pausó al llegar a su
  **tope por petición** (con «Darle 1 $ más», «Seguir sin tope» o «Quitar»).

**Solo lo importante (v1.30.38).** Una **pregunta** sale aquí solo cuando el agente te deja una **tarjeta de preguntas**
sin contestar (una decisión sin la que no puede seguir) o la hace con su herramienta `preguntar_usuario`. Una pregunta
suelta al final de su texto **no cuenta**: un saludo («¿En qué te ayudo?»), una cortesía («¿Algo más?») o un
ofrecimiento («¿Quieres que te deje preparado un mensaje…?») ya están en el chat y la petición ha terminado, así que va
a Resultados como cualquier otra. Antes cualquier respuesta acabada en «?» saltaba como pregunta; al arrancar, kywai
cierra esos avisos viejos (`dropTextQuestions` en `src/main/orchestrator.ts`). El texto que deja un botón al pulsarlo
(«Contéstale en el chat del proyecto…») se va solo a los 6 segundos o al cerrar la bandeja: no es otra tarjeta.

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

**Tarjetas viejas.** Si una app se pierde el cambio que cerró un aviso (estaba sin conexión, el portátil dormía…), la
tarjeta puede seguir saliendo. Al pulsar cualquiera de sus botones ya no se queda igual: un **plan** que sigue
pendiente en el chat se aprueba o descarta de verdad (los botones miran el plan, no la tarjeta), y si ya no queda
nada que hacer sale «Ese aviso ya estaba resuelto» y la tarjeta se quita. En los dos casos el servidor manda la lista
al día a todas las apps (evento `inbox.updated`), así que también desaparece en las demás y en Órbita.

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

**Silencio de noche y avisos agrupados (24 nov 2026, v1.21.6; idea de AnyModelBot).** En ⚙ → Ajustes → Agentes,
debajo de «El coordinador te avisa en el 3D», **«Silencio de noche»** viene encendido de 22:00 a 08:00 (se cambian las
dos horas; cruza la medianoche). A esas horas lo nuevo de «Te necesita» no suena ni hace que el coordinador te llame
en el 3D: la campanita de la barra sí se queda brillando. Al acabar el silencio, si sigue habiendo algo pendiente,
suena una sola vez por todo lo que llegó. Si has usado kywai (tecla o clic) en los últimos 10 minutos, estás
despierto y suena igual (`AWAKE_MS`). Además, a cualquier hora, varios avisos seguidos suenan como uno: tras un
timbre no vuelve a sonar en 90 s (`GROUP_MS`), y lo que llegó entretanto suena una vez después si sigue pendiente.
Es por dispositivo (`aicowork.avisos.silencio`). Las notificaciones del móvil (Órbita) siguen el «No molestar» del
propio teléfono. Código: `isQuietTime` y `startInboxAlert` en `lib/inboxAlert.ts`; el ajuste, `QuietRow` en
`ui/settings/SettingsDialog.tsx`.
El código está en `src/renderer/src/lib/inboxAlert.ts` (qué es nuevo, prueba en `inboxAlert.test.ts`), el timbre
`needsYou` en `lib/audio.ts`, la campanita de la barra en `ui/header/InboxButton`, y la del 3D en `scene/Robot.tsx`
(sprite), `scene/RobotLabel.tsx` (etiqueta y bocadillo dorado) y `scene/robotBrain.ts` (`callUser`).

### Reglas de oro en cada encargo (v1.29.11 y v1.29.12)

Las cuatro reglas de Andrej Karpathy (el CLAUDE.md de `forrestchang/andrej-karpathy-skills`, que vimos en un reel de
pablotapias.ia el 24 nov 2026) salen de una queja: la IA da cosas por supuestas y lo complica todo. kywai ya tenía dos:
la meta comprobable («acceptance», que revisa un agente de otra familia) y las dudas con botones (`QUESTIONS_RULE`).
Ahora el encargo de toda tarea que trabaja con archivos lleva además tres líneas (`GOLDEN_RULES` en
`src/main/orchestrator.ts`):

- **Lo más sencillo** que cumpla la tarea, sin funciones, opciones ni capas que nadie pidió.
- **Cambios quirúrgicos**: solo lo que pide la tarea; nada de reformatear, renombrar o «mejorar» lo de al lado ni
  borrar lo que no es suyo. Lo que convendría cambiar fuera de la tarea lo dice al final en una frase.
- **Nada supuesto en silencio**: si la tarea admite varias lecturas, elige la más probable y lo dice.

**«Supuse: …» en el chat (v1.29.12).** La tercera regla pide al agente terminar con una línea «Supuse: …» (literal,
aunque responda en otro idioma) con lo que dio por hecho. Al terminar la tarea, el chat la quita del resultado y la
enseña aparte, en ámbar, con el botón **«No era eso»**: prepara una respuesta a ese mismo agente (como «Responder»)
con «No era eso: » ya escrito, para corregirle sin leer todo el resultado. Si no supuso nada, no sale. En el código:
`assumptionOf` y `withoutAssumption` en `src/shared/assumption.ts` (con su prueba) y `AssumedNote` en
`src/renderer/src/ui/left/Messages.tsx`.

Las consultas rápidas (solo leen) y las respuestas solo de texto no las llevan. La habilidad entera
(`karpathy-guidelines`) va además en el paquete de serie como «Reglas de Karpathy».

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
- **El aviso solo dice qué te falta**: el texto rojo de la tarea (Tareas → Por revisar, en escritorio, web y Órbita),
  el de la tarjeta del 3D, «Te necesita» y el mensaje del chat dejan fuera las secciones que el agente escribe para
  el equipo («Para la memoria», «Habilidad nueva»), y el aviso rojo va en texto llano: sin `**`, comillas de código ni
  `##`. Las tareas que ya estaban bloqueadas se limpian al arrancar. En el código: `src/shared/blockedNotice.ts`
  (`withoutTeamNotes`, `plainNotice`, `cleanBlockedError`), usado por `blockedReason`/`blockedText` y por
  `sanitizeState` en `src/main/projects.ts`.

En un mensaje directo («@Codex …») «BLOQUEADA» no significa nada especial: la respuesta sale tal cual. En el código:
`handleBlocked`, `blockedNeedsYou` y `settleBlocked` en `src/main/orchestrator.ts` (pruebas G, G3 y G4 de
`orchestrator.check.ts`); el aviso de la tarjeta es `AgentRuntime.notice` y la tarea lleva `needsYou`.

### «Tu día»: lo que hay hoy al volver a kywai (22 nov 2026)

Idea de Herald OS. Cuando vuelves a abrir kywai **otro día o tras 3 horas sin mirarlo**, encima del chat sale una
tarjeta con un saludo y la fecha, y solo las filas que tienen algo:

- **Te necesita**: cuántas cosas esperan tu sí, con la primera y un botón «Ver» que abre «Te necesita».
- **Rutinas de hoy**: las rutinas activas de todos tus proyectos que se lanzan de aquí al final del día, con su hora.
- **Mientras no estabas**: las tareas que terminaron (o fallaron) desde la última vez que tuviste kywai abierto, con
  su proyecto; al pulsar una se abre ese proyecto.
- **Seguir donde lo dejaste**: el último proyecto en el que trabajaste y su chat, si no es el que ya tienes abierto.

La primera vez que abres kywai no sale (ya está la bienvenida), y si no hay nada que contar tampoco. Se cierra con la
X hasta la próxima vez que vuelvas. La última visita se apunta solo en este dispositivo (cada minuto, al ocultar la
ventana y al cerrarla). Por dentro: `dayBrief.ts` junta los proyectos (como mucho 8, y solo abre los que cambiaron
desde tu visita o tienen rutinas) y `getDayBrief(since)` lo da a la tarjeta (`DayBrief.tsx`).

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

### Elegir con qué se generan las imágenes y los vídeos

**Ajustes → Multimedia → Imágenes y vídeos** (pedido por Yil el 22 nov 2026). Cada usuario elige con qué se hacen sus
imágenes y sus vídeos; cada opción dice si es gratis o cuántos créditos cuesta. Se guarda en el motor
(`generar-con.json` en la carpeta de datos; en kywai cloud, en el espacio), así vale igual en la app, el navegador y
Órbita.

- **Generar imágenes con…**
  - **Automático** (de fábrica): lo gratis primero. Tus modelos locales (Draw Things o ComfyUI) → **tu ChatGPT** →
    tu clave de Gemini → en kywai cloud, la GPU de kywai **solo si apagas «preguntarme antes de gastar créditos»**
    (viene encendido) → el motor gratis de internet (borrador). Si se saltó la GPU para no gastar, el chat lo dice y
    ofrece «Rehacer con…».
  - **Mis modelos locales**: Draw Things o ComfyUI en tu equipo, gratis. En la nube, los del equipo conectado con
    «Prestar los modelos de este equipo»: **Windows, Linux o Mac**. Por el puente (`deviceBridge.ts`) la nube solo
    manda el texto y el formato (`POST /kywai/imagen`, motor `comfyui`); el equipo dibuja con su propio flujo y el
    modelo elegido allí (`comfyLend` en `client.ts`) y devuelve la imagen. Nunca viaja un flujo de ComfyUI desde la
    nube (ComfyUI ejecuta lo que le manden). Draw Things sigue igual (Mac).
  - **Mi ChatGPT**: Codex con tu suscripción de ChatGPT Plus o Pro y su herramienta de imágenes (gpt-image-2), **sin
    clave de API y sin créditos**; gasta tu cuota de Codex (de 3 a 5 veces lo que un mensaje). Hace falta haber
    iniciado sesión con ChatGPT en Codex (`~/.codex/auth.json` con tokens de ChatGPT; con solo una clave de API no
    cuenta). Codex deja la imagen en la carpeta de trabajo o en `~/.codex/generated_images` y kywai la copia
    (`src/main/codexImage.ts`).
  - **Mi clave de Gemini**: la cobra Google, no kywai.
  - **GPU de kywai** (solo kywai cloud): 2 créditos, 5 en HD.
  - Las suscripciones de **Gemini y Claude no generan imágenes fuera de su app** (comprobado en su documentación el
    22 nov 2026) y OmniRoute solo genera imágenes con claves de pago: por eso no salen.
- **Generar vídeos con…**: **Automático**; **Estudio de contenido** (plantillas, rótulos y voz, sin clips de IA ni
  créditos: se saltan los clips de Wan); **Mis modelos locales** (en la nube, el vídeo lo monta tu equipo conectado
  sin pulsar «Hacerlo en {equipo}», si puede con él). «GPU de kywai» para vídeo sale como **Próximamente**. Ninguna
  suscripción genera vídeo fuera de su app.
- **Primero pregunta** (23 nov 2026, Yil: «ni me preguntó con cuál»): mientras el usuario no haya elegido nada
  (`chosen` en `generar-con.json`), la primera imagen no se dibuja: sale «¿Con qué hago esta imagen?» con botones de lo
  que tiene a mano (su ChatGPT, sus modelos locales, su clave de Gemini, la GPU de kywai con su precio y «Lo gratis que
  haya (borrador)»). Lo que pulse se manda como «Hazme esta imagen con … (motor: …)», se dibuja y queda guardado.
  Elegir en Ajustes también cuenta. Las rutinas no preguntan. Si solo hay una opción, no pregunta.
- **Con un motor concreto, solo ese**: si no sale, el chat dice por qué y ofrece los demás. Lo que pidas en el
  mensaje manda sobre el ajuste: «rehazla con mi ChatGPT», «hazla con créditos», «con mi equipo»
  (`engineAskedIn` en `src/shared/mediaEngines.ts`).
- **Bajo cada imagen**: «Hecha con tu ChatGPT · 0 créditos» (o lo que costó) y **«Rehacer con…»**, que manda en el
  chat «Rehaz esta imagen con …» con la marca `(motor: …)` para que valga en cualquier idioma. Si no salió, «Probar
  con…» (campo `madeWith` del mensaje).
- **Modelos locales para este equipo** (solo en la app instalada): kywai mira la RAM, la gráfica y el disco y marca
  el **«Recomendado para tu equipo»** (`adviseLocalModels`): **Qwen-Image** (NVIDIA de 24 GB), **FLUX.2 klein 4B**
  (NVIDIA de 8 GB y 16 GB de RAM, o Mac de 24 GB), **DreamShaper 8** (equipos modestos) y **Wan 2.2 5B** para vídeo
  (NVIDIA de 8 GB y 32 GB de RAM). Los que no caben no tienen botón. **«Instalar y dejar listo»** (un clic): instala
  ComfyUI si falta, baja las piezas de Comfy-Org (sigue donde se quedó si se corta), lo enciende, **hace una imagen de
  prueba** y deja ese modelo elegido. Desde ahí basta con pedírselo a kywai. Z-Image Turbo y LTX-2 aún no: ComfyUI
  los usaría con otros flujos que kywai no tiene probados.
- Código: `src/shared/mediaEngines.ts` (preferencias, orden y modelos), `src/main/mediaPrefs.ts`,
  `src/main/mediaEngines.ts`, `src/main/codexImage.ts`, `installLocalModel` en `src/main/videoStudio.ts`,
  `src/renderer/src/ui/settings/MediaEnginesSection.tsx` y `MadeWithBar` en `Messages.tsx`.

### Imágenes con Draw Things (gratis, en tu Mac)

Si tienes **Draw Things** (drawthings.ai) abierto en tu Mac con su servidor encendido (**Draw Things → Ajustes →
API Server**, HTTP, puerto 7860), kywai dibuja con él **todas** las imágenes nuevas: gratis, sin clave y con el modelo,
los pasos y el sampler que tengas puestos en la app (por ejemplo Z Image Turbo 8-bit, 8 pasos: ~40 s por imagen en un
Mac mini). kywai solo le manda el texto y, si hace falta, el tamaño (vertical 768×1344, horizontal 1344×768; la
cuadrada sale al tamaño que tengas puesto).

- **En el chat**: «hazme una imagen de un gato astronauta en acuarela», «dibújame…», «genera un póster de…». El
  coordinador pone la imagen en el campo `"image"` de su plan (el texto en inglés y el formato) y kywai la dibuja en el
  acto, sin tareas; **la imagen se ve en el propio chat** como miniatura (ver «Miniaturas de imágenes, vídeos y PDF en el chat») y queda en `artifacts/imagenes/` (o
  `.ai-cowork/entregables/imagenes/` en una carpeta tuya). Hasta 4 por mensaje.
- **Los agentes** la dibujan con la herramienta **`generar_imagen`** del servidor de kywai (Claude, Codex, Gemini,
  Hermes en sus tareas) o **`generate_image`** (Gemma y los demás modelos de LM Studio dentro de kywai): para una web,
  una presentación o lo que necesite imágenes nuevas. Para editar una imagen que ya existe siguen con Pillow o
  ImageMagick.
- **El estudio de vídeo** (/video) también lo usa primero para las ilustraciones, el presentador y «Probar con mi
  escena».
  Desde la 1.13.2 lo vuelve a mirar antes de cada imagen (cada 30 s como mucho): si lo abres a mitad del vídeo, las
  imágenes que faltan salen con él.
- **kywai cloud**: con «Prestar los modelos de este equipo» encendido en la app de tu Mac, la nube pide las imágenes
  a tu Draw Things por el mismo puente que LM Studio y Ollama. Por el puente solo pasan `GET /` (sus ajustes) y
  `POST /sdapi/v1/txt2img` con texto, tamaño (256–2048) y una imagen; nunca otro modelo ni img2img.
- **Orden de motores** (`src/main/imageMaker.ts`): lo elige el usuario (ver «Elegir con qué se generan las imágenes y
  los vídeos»). En «Automático»: Draw Things → ComfyUI (si ya está encendido) → tu ChatGPT → Gemini con tu clave
  → **en kywai cloud, las imágenes de kywai** (si no hay que preguntar antes de gastar) → el motor gratis de internet
  (una cada 45 s). Si Draw Things está cerrado, se pasa al siguiente sin fallar.
- **Imágenes de kywai (solo kywai cloud, `src/main/kywaiImages.ts`)**: el portal Mi cuenta las dibuja con la **GPU de
  kywai** (desde el 21 nov 2026; `portal/gpu.py` en kywai-cloud): modelos abiertos que permiten uso comercial en una GPU
  alquilada por segundos en RunPod Serverless con ComfyUI. **Rápida** (Z-Image Turbo, ~1 MP) **2 créditos**; **HD**
  (Qwen-Image 2512, ~1,7 MP, mejor con letras dentro) **5 créditos**. La app pide «hd» sola cuando el texto habla de
  póster, cartel, portada, logo, «que diga…», 4K o alta resolución (`kywaiQualityOf`). Si la GPU falla, la dibuja
  Gemini (Nano Banana) con la clave de kywai al mismo precio; si la nube aún no tiene GPU, Gemini a **8 créditos**. Las
  claves nunca llegan a tu espacio. Si no sale no se cobra; sin créditos se sigue con el motor gratis. El portal no
  genera desnudos ni contenido sexual (lo rechaza antes de cobrar). Cómo se pone la GPU: `portal/DEPLOY.md`, «GPU de
  kywai».
- **El motor gratis es un borrador**: su plan gratis (Pollinations) ya solo da un modelo pequeño (Sana, ~0,6 MP) con
  marca de agua, y salen fallos como patas de más. Cuando una imagen sale de ahí, el chat lo dice («Es un borrador…»)
  y explica cómo tener calidad: en la nube, créditos kywai; en tu equipo, Draw Things o tu clave de Gemini. Los agentes
  reciben el mismo aviso en `generar_imagen` para no decir que es buena. Una imagen «cuadrada» ya sale cuadrada.
- **Rehacer una imagen**: «otra versión», «está mal», «no tiene calidad», «otra vez» o «repítela» van siempre al
  equipo (`REDO_WORDS` en `src/main/plan.ts`), que la vuelve a dibujar de verdad. Antes caían en la respuesta al
  momento, que solo escribe texto, y el coordinador decía «aquí tienes otra versión» sin adjuntar nada. Por si acaso,
  una respuesta al momento que dice entregar algo («aquí tienes la imagen», «te dejo el archivo») se descarta y pasa
  al plan (`claimsDelivery`).
- **Ajustes → Multimedia → Estudio de vídeo** dice si está conectado y con qué modelo («Imágenes en tu Mac (Draw
  Things)»). `KYWAI_DRAWTHINGS_URL` cambia la dirección; `KYWAI_NO_DRAWTHINGS=1` lo apaga.

Código: `src/main/drawThings.ts` (motor y puente), `src/main/imageMaker.ts` (orden de motores), `generar_imagen` en
`src/main/coworkMcp.ts`, `generate_image` en `src/main/agents/localTools.ts` y `drawPlannedImages` en
`src/main/orchestrator.ts`. No hace falta el puente MCP de LM Studio para Draw Things: kywai habla con él directamente.

### Cuánto tardan las imágenes de un vídeo (1.13.2)

Un vídeo con presentador y **diálogo** pide hasta 3 planos por escena (uno por cada vez que cambia quién habla): con
7 partes, hasta 21 imágenes y el presentador. Con un motor que dibuja de una en una (Draw Things, ComfyUI o el motor
gratis, que espera 46 s entre imágenes) eso pasaba de 20 minutos, y la barra seguía en «Poniendo la voz (7 de 7)»
porque solo la movía la voz. Desde la 1.13.2 (`src/main/imagePlan.ts`, usado en `renderVideo`):

- **Primero la imagen principal de cada escena**, después los planos de más.
- **Los planos de más solo empiezan si hay tiempo**: 3 min desde que empiezan las imágenes con un motor de una en una,
  6 min con Gemini (tres a la vez). A los 9 min no empieza ninguna imagen más.
- **El plano que no se dibujó reencuadra la imagen principal** de su escena: la misma imagen, más cerca y hacia otra
  zona (`reframeOrigin`), en vez de quedarse sin plano.
- **La barra dice la verdad**: al acabar la voz pasa a «Haciendo las imágenes (n de N)». Con el motor gratis añade
  qué encender: en un Mac, Draw Things con su API Server; en kywai cloud, «Prestar los modelos de este equipo» en la
  app de escritorio (la nube no ve el Draw Things ni el ComfyUI de tu Mac sin él: su 127.0.0.1 es el servidor).

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

### Comprobador de entregas: lo dicho contra lo que hay en el disco

Cuando un agente termina, **kywai mira el disco antes de dar nada por hecho**, sin usar ningún modelo (no gasta
cuota ni tarda): compara lo que la respuesta dice haber entregado con lo que hay de verdad.

| Qué dice el agente | Qué comprueba kywai |
| --- | --- |
| Nombra un archivo («he guardado el informe en `artifacts/informe.pdf`») | Que exista (por su ruta, entre lo que cambió la tarea o en el proyecto), que no esté vacío y que sea lo que dice ser |
| «Aquí tienes la imagen / el vídeo / el audio / el PDF», sin nombre | Que la tarea haya dejado al menos uno de ese tipo que se abra |
| No promete nada, pero deja un vídeo, imagen, audio o documento roto entre los entregables (`artifacts/`, adjuntos) | Se avisa igual |

«Que sea lo que dice ser» se mira por dentro: una imagen con cabecera de imagen, un MP4/MOV **entero** (con su
índice «moov»: un render que se cortó a medias no lo tiene), un WAV que no sea todo silencio, un PDF que empieza y
acaba como PDF y un .docx/.xlsx/.pptx/.zip completo. No cuentan como promesa lo que niega («no pude generar la
imagen»), propone («si quieres te dejo…»), pregunta, las imágenes por enlace o SVG escritas en la propia respuesta,
ni un informe escrito en el chat.

Qué pasa si falta algo:

1. **Se le devuelve una vez** al mismo agente, en su misma sesión y con su modelo principal, con la lista de lo que
   no está y la salida sincera: «hazlo de verdad o di claro que no pudiste y por qué».
2. Si en esa segunda respuesta lo entrega, o dice con claridad que no pudo, **vale** (una respuesta sincera no es un
   fallo).
3. Si sigue diciendo que está y no está, el resultado sale con **«⚠ kywai comprobó la entrega de … y hay algo que no
   está: …. No lo des por hecho.»**, el resumen del equipo lo marca con «⚠ … falta lo que dijo entregar» y el
   coordinador recibe la orden de no darlo por entregado en su respuesta final.

Vale para **todo**: los mensajes directos a un agente, las tareas con esfuerzo bajo, los agentes de solo texto y las
tareas que no cambiaron ningún archivo, que son justo las que la verificación por otro agente no revisa. Va antes
de esa verificación (no se gasta un verificador en algo que no existe). No tiene interruptor: no cuesta nada.
Código: `src/main/deliveryCheck.ts` (qué se promete y si el archivo es válido) y `deliveryGate` en
`src/main/orchestrator.ts`.

Una imagen vale si **es una imagen de verdad**, aunque no sea del formato de su extensión: los motores dan a veces un
JPEG que se guarda como `.png`, y abre igual en el chat y en cualquier visor. Lo que no vale es una página de error o
un vídeo con nombre de imagen.

#### El estudio pasa las mismas comprobaciones

Lo que entrega el estudio de contenido no lo hace un agente sino kywai (monta el vídeo, corta la grabación, hace las
portadas), así que no pasaba por el comprobador: al acabar decía «Aquí tienes» sin mirar el archivo. Ahora **cada
trabajo del estudio se comprueba en el disco antes de darlo por hecho**:

| Qué | Qué se comprueba antes de decir «Aquí tienes» | Si no vale |
| --- | --- | --- |
| `/video`, `/serie`, `/doblar` (en tu equipo, en la nube o en el equipo conectado) | Que el MP4 esté entero | La tarea falla: «No se pudo montar el vídeo: kywai comprobó el resultado antes de entregarlo y no vale: «…» está dañado o a medias…» |
| `/editar` y `/recortes` | El vídeo editado y cada clip | Igual |
| `/demo` | El MP4 de la demo | Igual |
| `/miniatura` | Cada portada (que exista, no esté vacía y abra) | «No se pudieron hacer las portadas: …» |
| Portadas de un reel (`/instagram`, `/tiktok`) | La imagen de cada portada | Esa portada no se propone: queda el fotograma del vídeo |
| Películas con estilo | Que el MP4 del agente esté entero, antes de revisarlo | Vuelve al agente como cualquier otro fallo de la película («el render se cortó: vuelve a renderizarla») |
| Imágenes («hazme una imagen») | Que lo que dejó el motor abra como imagen | Se prueba con el **siguiente motor**; si ninguno deja una imagen, se dice por qué |
| Publicar en Instagram y subir a TikTok | Que el vídeo siga en el proyecto y se pueda reproducir, **antes de subir nada** | No se sube: «kywai comprobó el vídeo antes de subirlo y no vale: …» |

No hay segunda oportunidad con un agente porque aquí no hay agente que se haya equivocado: el fallo es del montaje y
se dice tal cual, con su motivo. Cómo salió cada trabajo queda en el [registro de salud](#registro-de-salud-ver-los-fallos-antes-que-el-usuario).
Código: `src/main/studioCheck.ts` (`studioJob`, `proveStudioFiles`).

#### Probar el estudio: lo hace de verdad, sin agentes

Comprobar el archivo al entregar dice si **ese** trabajo salió. Faltaba saber si el estudio funciona en un equipo
**antes** de que alguien lo necesite: un ffmpeg que falta o que no puede quemar subtítulos, o una ventana que no deja
hacer la foto de una web, solo se veían al usarlo. Para eso está la **autoprueba del estudio**: kywai hace de verdad,
en el equipo donde corre, con entradas fijas y **sin ningún agente**:

| Pieza | Qué hace | Qué se mira |
| --- | --- | --- |
| Grabar un vídeo de muestra | 6 segundos de imagen de prueba con un tono, con el ffmpeg del equipo | Que salga, con sonido |
| Editarlo (`/editar`) | Corta una muletilla y una pausa larga, limpia la voz, lo pone en vertical, le da color y le quema subtítulos | Que mida 1080×1920, dure lo que suman los tramos y **lleve los subtítulos** |
| Sacar un recorte (`/recortes`) | Un trozo en cuadrado con su título arriba | Que mida 1080×1080 y dure lo que debe |
| Hacer las portadas (`/miniatura`) | Tres fotogramas de la grabación y una portada de cada composición (grande, lateral, caja) | Que salgan las tres, de 1280×720 |
| Montar la demo de una web (`/demo`) | Fotografía una web de muestra servida desde el propio equipo y monta portada, recorrido y cierre con música | Que la foto traiga sus secciones y el vídeo mida 1920×1080 y dure lo que dice el plan |

No pide nada a ningún agente, no gasta nada, no sale a internet y no deja archivos (trabaja en una carpeta temporal que
borra al acabar). Tarda alrededor de un minuto. Una pieza que falla no para las demás (salvo las que necesitan la
grabación de muestra, si esa no salió), cada una tiene un tope de 4 minutos y el motivo de un fallo sale en una línea,
sin rutas del equipo. Cada pieza pasa por la misma comprobación de entrega que un trabajo de verdad y queda en el
[registro de salud](#registro-de-salud-ver-los-fallos-antes-que-el-usuario) con su función (edición, portadas, demos)
y la marca «autoprueba». Va de una en una: con otro trabajo del estudio en marcha no empieza y lo dice, y en kywai
cloud guarda el turno de los vídeos mientras dura. El `/video` completo (HyperFrames, voces, imágenes) queda fuera:
es pesado, puede instalar programas y depende de servicios de fuera.

**Lo que encontró la primera vez (21 nov 2026, en el Mac mini):** en una pantalla de alta densidad (un Mac Retina,
Windows con la pantalla al 150 %) la foto de una ventana oculta salía con más píxeles de los pedidos, así que las
portadas de `/miniatura` medían el doble (2560×1440) y, en `/demo`, los planos se recortaban de otra parte de la web.
Ahora la foto se reduce siempre a las medidas pedidas (`shoot` y `captureTarget` en `src/main/htmlShot.ts`) y la
autoprueba mira también las medidas de la foto de la web.

La edición sin subtítulos fue el segundo hallazgo: el ffmpeg del Mac mini era el de Homebrew, que **dejó de traer
libass** y ya no puede quemar subtítulos ni rótulos, y kywai entregaba el vídeo sin ellos. Ahora, en un Mac, kywai
pone el suyo (ver «Subtítulos en un Mac con el ffmpeg de Homebrew», más abajo). La autoprueba no instala nada: si el
ffmpeg no puede, lo dice con el motivo que dio ffmpeg entre paréntesis y, en un Mac, con cómo se arregla.

Quién la lanza:

- **Tú**, en ⚙ → Ajustes → **Avanzado → Pruebas → «Probar el estudio»**: «Probar ahora» y, al acabar, cómo salió cada
  pieza con lo que tardó (y el motivo de la que falle). Se prueba el equipo donde corre kywai: desde el móvil o el
  cliente, el servidor o tu espacio de la nube. Al volver a abrir Ajustes sigue ahí la última prueba.
- **Cada PR y cada noche**, la prueba de pantalla `scripts/e2e/estudio.e2e.mjs` en el Mac mini (ver «Pruebas
  automáticas»).
- **Cada noche en kywai cloud**, el comprobador (`scripts/comprobar-nube.py` de kywai-cloud) se la pide al espacio de
  la cuenta robot, junto al chat, el archivo, la imagen y la voz.

Código: `src/main/studioSelfTest.ts` (`studioSelfTest`, `runStudioSelfTest`), la API `studioSelfTest` /
`lastStudioSelfTest` y `src/renderer/src/ui/settings/StudioCheck.tsx`.

#### Las vistas del equipo pasan las mismas comprobaciones

El espacio en 3D y en 2D, los personajes y la cotorra no entregan archivos, pero también pueden fallar, y un fallo suyo
era el peor de todos: **con el 3D elegido en un equipo que no puede abrirlo** (sin tarjeta gráfica disponible, por
escritorio remoto, o porque el sistema la desactivó tras un fallo) **la ventana entera se quedaba en blanco**, sin chat
y sin forma de volver, cada vez que se abría la app. Ahora las vistas tienen su red de seguridad:

| Qué pasa | Qué hace kywai |
| --- | --- |
| El 3D está elegido pero al abrir el equipo no puede con él | Abre el **2D** y lo dice: «Este equipo no puede abrir el espacio 3D ahora mismo, así que lo ves en 2D» |
| El 3D falla en marcha, o la tarjeta gráfica pierde el lienzo 3 veces en 2 minutos | Pasa al **2D** y lo dice: «El espacio 3D ha fallado y lo ves en 2D. Tu equipo y tus tareas siguen igual» |
| El 2D falla al dibujar | En su sitio sale «El espacio 2D no se pudo dibujar» con **Reintentar**; el chat sigue funcionando |
| Una imagen del 2D no carga | No queda un icono roto en el escenario: se esconde |
| Algo falla al dibujar fuera de las vistas | En vez de la ventana en blanco sale un aviso con **Volver a abrir** |

El aviso del 2D trae dos botones: **Probar el 3D otra vez** (lo intenta al momento) y **Quedarme en 2D** (deja elegido
el 2D y no vuelve a avisar). Si no tocas nada, lo elegido no cambia: la próxima vez que abras kywai se vuelve a
intentar el 3D, porque el fallo puede ser pasajero. Nada de esto para a los agentes: las tareas en marcha siguen.

Cómo abrió cada vista queda en el [registro de salud](#registro-de-salud-ver-los-fallos-antes-que-el-usuario)
(«Vistas del equipo»), y cada PR y cada noche una prueba de pantalla las abre una a una (ver «Pruebas automáticas»).
Código: `src/renderer/src/lib/viewHealth.ts`, `src/renderer/src/ui/space/ViewGuard.tsx` (`ViewGuard`, `ViewNotice`,
`AppGuard`), `startSpaceMode` en `src/renderer/src/lib/spaceMode.ts` y `src/main/viewHealth.ts` (`recordView`).

### Estados honestos: «⏳ Aún en marcha» en vez de un «listo» adelantado

El mensaje de quien coordina sale **antes** de que el equipo trabaje. Si lo escribe como si ya estuviera hecho
(«¡Listo! Aquí tienes el vídeo») cuando la tarea acaba de empezar, kywai lo corrige a la vista, sin llamar a ningún
modelo:

| Qué pasa de verdad | Qué ves debajo de su mensaje |
| --- | --- |
| Acaba de repartir tareas | «⏳ Aún en marcha: el equipo acaba de empezar (N tareas). El resultado sale aquí cuando esté.» |
| kywai está dibujando una imagen o montando un vídeo | «⏳ Aún en marcha: la imagen se está dibujando…» / «…el vídeo se está haciendo…» |
| El plan espera tu visto bueno | «⏳ Aún sin empezar: el equipo espera tu visto bueno al plan.» |
| Otro encargo del proyecto sigue trabajando y te dice que ya está | «⏳ Aún en marcha: «tarea» (agente). Te aviso aquí cuando termine.» |

La marca **solo sale si da algo por terminado o entregado** y hay algo en marcha, así que siempre es verdad; si dice
«Codex lo prepara y te aviso», su mensaje sale tal cual.

Si dice **entregar un archivo** («aquí tienes otra versión de la imagen», «el informe está en `informe.pdf`») y su
respuesta no adjunta ni encarga nada, y ese archivo no existe en el proyecto:

1. **Se le devuelve una vez** antes de enseñártela, con tres salidas: adjuntar el archivo si ya existe, encargarlo de
   verdad (imagen, vídeo o tarea) o decir claro que no se puede. La respuesta al momento (⚡), que solo es texto, pasa
   por eso mismo al plan.
2. Si insiste, su mensaje sale con **«⚠ En esta respuesta no hay nada adjunto ni ningún trabajo en marcha (kywai lo
   comprobó). Si esperabas …, pídelo otra vez y el equipo lo hace.»**

Al acabar un plan de varias tareas, el **resumen del trabajo** dice arriba cuántas no salieron bien del todo (fallaron,
se cancelaron, quedaron sin verificar o sin lo que dijeron entregar): «⚠ 1 de 3 tareas no salió bien del todo: mírala
antes de darlo por hecho.» En «Hablar con kywai» la voz lleva la misma marca si dice que un encargo terminó y el
equipo aún no ha mandado el resultado. Código: `src/main/honestReply.ts` y `unbackedReply` en
`src/main/orchestrator.ts`.

### Acciones comprobadas: lo que quien coordina pide, se mira antes de contestarte

Quien coordina no solo escribe un mensaje: en la misma respuesta pide **acciones** a kywai. Las tareas ya se
validaban («Ajustes de kywai al plan»). Las demás se comprueban también, sin llamar a ningún modelo, con lo que la app
sabe de verdad:

| Acción | Qué se comprueba |
| --- | --- |
| Lanzar un vídeo | Que la orden se entiende y dice de qué trata |
| Proponer una rutina | Que dice cuándo y qué hacer |
| Ayudarte a conectar un agente | Que ese agente está en tu equipo y se conecta con una cuenta |
| Añadir algo a una tarea | Que dice a qué tarea y qué añadir, que esa tarea existe en el proyecto y, si ya terminó, que su agente está disponible |
| Adjuntar un archivo | Que el archivo existe en el proyecto |
| Lanzar una orden de kywai | Que la orden existe, que es de las que puede lanzar él y que está completa |
| Hacerte una pregunta con opciones | Que lleva al menos dos opciones entre las que elegir |
| Dibujar imágenes | Que no pide más de las 4 que salen por respuesta |

Dos casos se quitan sin aviso, porque no pierdes nada: un archivo que aún no existe cuando la misma respuesta encarga
la tarea que lo hace (llega con su entrega) y un agente local metido entre otros que sí se conectan con una cuenta
(sale la tarjeta de los demás).

Las tres últimas filas de la tabla son cosas que antes se caían al limpiar su respuesta sin que nadie se enterase: una
pregunta sin opciones no sacaba su tarjeta (y el mensaje decía «elige abajo»), de seis imágenes pedidas salían cuatro
(y el mensaje decía «te hago las seis») y algo que añadir a una tarea sin decir qué no llegaba a nadie. Los huecos
vacíos de plantilla no cuentan, y en una rutina, donde no hay nadie delante para contestar, las preguntas no se miran.

Antes, una acción que no valía **se perdía en silencio** y el mensaje seguía diciendo «ya está en marcha el vídeo» o
«se lo paso a quien lleva la tarea». Ahora:

1. **Se le devuelve una vez** antes de enseñarte nada, con el motivo de cada una y tres salidas: escribirla bien,
   pedir lo mismo con otra acción que sí valga, o quitarla y decirte claro qué no se puede hacer.
2. Si insiste, esa acción **no se hace ni cuenta como «en marcha»**, y su mensaje sale con el aviso:
   **«⚠ Esto de mi respuesta no se ha hecho (kywai lo comprobó):»** y una línea por cada cosa («El vídeo: no decía de
   qué tenía que tratar», «Añadirlo a la tarea #7: esa tarea no existe en este proyecto»…). Las acciones que sí
   valían se hacen igual.

Si ves ese aviso, pide otra vez solo lo que falta, con el dato que echaba de menos. En el panel «Salud» de kywai cloud
sale como **Acciones del coordinador**: cuántas respuestas llevaban todas sus acciones bien y qué clase de fallo
tuvieron las demás (solo la clase: «vídeo sin tema», «tarea que no existe»; nunca lo que escribió nadie).

Código: `src/main/planActions.ts` (qué se comprueba, el texto para quien coordina y el aviso), `planActionChecks` en
`src/main/orchestrator.ts` (lo que la app sabe de cada acción) y `planLosses` en `src/main/plan.ts` (lo que se cae al
limpiar su respuesta). Es la primera parte del paso del coordinador de
«un texto de reglas» a «acciones que la app comprueba».

### Órdenes que lanza quien coordina: lo pides con tus palabras y sale

Hay cosas que kywai ya sabe hacer con una orden fija. Antes, si las pedías con tus palabras, quien coordina te
contestaba «escribe `/miniatura`» y te tocaba lanzarla a ti. Ahora la pone en su respuesta como una acción más y
**kywai la lanza sola**, justo después de su mensaje:

| Si pides… | Lanza |
| --- | --- |
| Una portada para tu último vídeo | `/miniatura` |
| Una demo o un anuncio de una web | `/demo <dirección>` |
| Una presentación o unas diapositivas | `/presentacion <tema>` |
| De qué hacer el próximo vídeo, qué temas suben | `/radar <tema>` |
| Tu último vídeo de `/video` en otro idioma | `/doblar <idioma>` |
| Editar la grabación que adjuntas (muletillas, silencios, subtítulos) | `/editar` |
| Los mejores momentos de un vídeo largo que adjuntas o enlazas | `/recortes [n] [enlace]` |
| El diseño de una web, una landing o una pantalla para verlo | `/diseno <qué>` |
| Un personaje en pixel art para tu juego | `/sprite <personaje>` |
| La mascota animada de tu marca | `/mascota <cómo es>` |
| Una pieza para la impresora 3D | `/imprimir3d <pieza>` |
| La ficha de tu cliente ideal, a quién le vendes | `/cliente-ideal` |
| Revisar la seguridad de tu proyecto | `/seguridad [qué mirar]` |

En el chat la orden sale como un mensaje más, con la etiqueta **«Orden lanzada por Hermes»** (o el nombre de quien
coordine) en vez de «Tú», y no se puede editar: así ves siempre qué se lanzó y quién lo decidió. El resultado llega
debajo, igual que si la hubieras escrito tú, y el mensaje de quien coordina lleva la marca «⏳ Aún en marcha: acabo de
lanzarlo y el resultado sale aquí cuando esté».

Antes de lanzar nada, kywai comprueba la orden con las mismas reglas del apartado anterior:

- **Que existe.** Una orden inventada no se lanza.
- **Que es de las de la tabla.** Son las que solo crean contenido dentro de tu proyecto. Publicar en Instagram
  o TikTok, proponer rutinas, guardar claves, cambiar ajustes, arreglar código (`/arreglar`), las extensiones, los
  efectos de sonido (`/sonido`, que gasta tu clave de ElevenLabs), aprender de un vídeo (`/aprende`, que cambia las
  habilidades del equipo) y todo lo que pide tu visto bueno **sigue siendo cosa tuya**: quien coordina te dice qué
  orden usar y la lanzas tú con un clic.
- **Que está completa**, con las mismas reglas con las que luego se lanza: `/demo` sin dirección, `/presentacion` sin
  tema ni archivo, `/miniatura` sin ningún vídeo en el proyecto, `/editar` sin el vídeo adjunto a tu mensaje, `/recortes` sin
  vídeo adjunto ni enlace, `/doblar` sin idioma, sin un vídeo hecho con `/video` o con uno que ya está en ese idioma, y `/diseno`,
  `/sprite`, `/mascota` o `/imprimir3d` sin decir qué ni adjuntar nada no se lanzan. Si le falta algo que solo sabes
  tú (el vídeo, el idioma), te lo pide en su mensaje.

Si la orden no pasa, se le devuelve una vez y, si insiste, no se lanza y su mensaje lleva el aviso de siempre
(«La orden «/demo mi tienda»: le faltaba algo para poder lanzarla»). Como mucho lanza tres órdenes por respuesta. En
una rutina funciona igual. En Órbita la orden lanzada se ve como un mensaje tuyo normal, sin la etiqueta.

Para que el encargo de quien coordina no crezca con cada orden, solo le explica enteras las que vienen a cuento por
lo que hablas (o por lo que adjuntas: con un vídeo adjunto, `/editar` y `/recortes`); las demás las nombra en una
línea.

Código: cada orden tiene su ficha en `src/main/plannedCommands.ts` (cuándo viene a cuento, cómo se escribe y qué le
falta si llega incompleta) y `commandRule` escribe con ellas la regla del encargo; `launchPlannedCommand` y
`plannedCommandReady` en `src/main/orchestrator.ts` la comprueban y la lanzan por el mismo camino que si la escribes
tú. Para añadir otra orden: tiene que crear solo contenido en el proyecto, tener su ficha, su comprobación de «está
completa» y su prueba en `planActionsFlow.test.ts`.

### Vigilante de trabajos largos: nada se queda colgado sin avisar

Todo programa de fondo que lanza kywai (el montaje de un vídeo, ffmpeg en los recortes, las demos de webs y las
portadas, las voces del sistema, las descargas y transcripciones de «/aprender», las instalaciones de herramientas)
pasa por una sola pieza, con las mismas reglas para todos:

| Regla | Qué significa |
| --- | --- |
| Tiempo máximo siempre | Cada programa tiene su tope (10 minutos si no se dice otro; el montaje de un vídeo, 40). Al pasarlo, se para |
| Se para con todo lo que abrió | Se corta el programa **y sus hijos** (antes solo el principal: una instalación o un navegador oculto seguían solos por detrás y kywai esperaba para siempre) |
| Nunca se espera para siempre | Si tras cortarlo algo se resiste a cerrarse, a los 15 segundos se da por terminado igualmente |
| El fallo trae su motivo | «…tardaba demasiado (más de 20 min) y lo he parado» o «…se quedó trabado (10 min sin avanzar) y lo he parado», en vez de la última línea de un programa |
| Aviso a los 10 minutos callado | Si un programa lleva **10 minutos sin dar señales**, sale en «Te necesita»: «Un trabajo de fondo lleva 10 min sin dar señales: …», con cuánto falta para que kywai lo pare. No hay que hacer nada; el aviso se retira solo cuando el programa acaba o se corta |

Quien coordina ve los programas de fondo que llevan más de un minuto en marcha (cuánto llevan, su última señal y
cuándo se cortarían), así que si le preguntas «¿cómo va el vídeo?» responde con eso y no con un «ya está». «Detener»
corta también todo lo que la tarea tenga lanzado. Los agentes tienen su propio aviso (3 minutos sin dar señales) y su
corte, que no cambian. Código: `src/main/longJob.ts` (`runJob`, `liveJobs`, `watchJobs`) y `watchLongJobs` en
`src/main/inbox.ts`.

### «¿Se puede aquí?»: la tabla que se mira antes de prometer

Antes, lo que kywai podía hacer en cada equipo vivía en reglas sueltas de la guía de quien coordina, escritas a mano y
sin mirar el equipo: aceptaba un vídeo con estilo de película en kywai cloud (que allí no puede montarse) o prometía
una imagen «de calidad» cuando solo estaba el motor gratis. Ahora hay **una sola tabla**, hecha con lo que kywai
comprueba en ese momento, y la leen igual quien coordina y tú.

**Escribe `/puedo`** (o «¿qué se puede hacer aquí?») y sale al momento, sin gastar ningún modelo:

| Fila | Qué comprueba |
| --- | --- |
| Dibujar imágenes nuevas | Qué motor responde ahora: Draw Things, ComfyUI, Gemini, el del Mac que presta sus modelos, las imágenes de kywai (2 a 8 créditos por imagen, en kywai cloud) o solo el gratis de internet |
| Vídeos con «/video» | Si el estudio de vídeo está listo (con voz), instalándose o por instalar |
| Vídeo Pro (estilos de película, plató 3D) | En kywai cloud no; sí en el equipo conectado, si lo hay |
| Voz y narración | Qué voz hay: Voicebox, Gemini, Kokoro o la del sistema |
| Manejar las apps y la pantalla | Solo en un equipo con escritorio; en kywai cloud no |
| Instalar herramientas y usar internet | Los permisos que tienen los agentes ahora |
| Modelos locales | Si Ollama o LM Studio responden (solo sale si tienes alguno, y solo cuando ya se ha comprobado) |

Cada fila lleva uno de estos estados, y cuando no es un «sí» dice qué hacer:

| Marca | Estado | Qué hace quien coordina |
| --- | --- | --- |
| ✅ | Sí | Lo acepta sin más |
| 🟡 | Solo borrador | Lo hace y avisa de que es un borrador, con cómo tener calidad |
| 🟡 | Sí, preguntándote antes | Te avisa de que el trabajo esperará tu respuesta |
| ⬇️ | Falta instalar o encender algo | Dice qué falta y lo ofrece (o avisa de que se instala solo) |
| 💻 | Aquí no; sí en tu equipo | Ofrece hacerlo en el equipo conectado |
| ⛔ | Aquí no | Lo dice claro y ofrece lo más cercano que sí se puede |

Quien coordina recibe la misma tabla en cada encargo (en la respuesta al momento y en el plan), con la regla de no
aceptar ni prometer lo que la tabla niega, ni negar lo que afirma; manda sobre cualquier regla general de su guía.
La comprobación se guarda un minuto y nunca frena un encargo: si tarda más de 2,5 segundos va lo último que se supo, y
si aún no se sabe nada **la tabla no se enseña** (mejor callar que inventar). Con `/puedo` se espera hasta 15 segundos.
La tabla no incluye el navegador ni las apps conectadas: eso se sigue viendo en Ajustes → Extensiones.

Código: `src/shared/capabilities.ts` (`capabilityTable`, `capabilityPrompt`, `capabilityMarkdown`),
`src/main/capabilityFacts.ts` (`gatherCapFacts`) y `capabilityRows` en `src/main/orchestrator.ts`.

### Registro de salud: ver los fallos antes que el usuario

Las cuatro redes de arriba evitan que un fallo llegue callado al chat, pero hacía falta saber **cuánto** falla cada cosa
sin esperar a que alguien se queje. kywai lleva ahora un registro de salud: cada vez que termina algo, apunta si salió
o no, cuánto tardó y el motivo que dio el programa.

| Función | Qué se apunta |
| --- | --- |
| Tareas de los agentes | Cada intento que acaba: hecho o fallido, con qué agente y el motivo del fallo |
| Imágenes | Cada imagen pedida: con qué motor salió (se ve si casi todo acaba en el borrador gratis) o por qué ninguno la dio |
| Vídeos | Cada montaje de `/video`, `/serie` y `/doblar` (en el equipo o en la nube) y cada película con estilo: hecho o fallido, cuánto tardó y el motivo |
| Voz | Cada frase: la voz elegida que falla cuenta aunque la de reserva lo salve |
| Edición de vídeo | Cada vídeo de `/editar` y cada clip de `/recortes` |
| Demos de webs | Cada vídeo de `/demo` (de una web, de un repositorio o con presentador) |
| Portadas | Cada tanda de `/miniatura` y cada portada de un reel |
| Publicar en redes | Cada publicación en Instagram (también las respuestas a comentarios) y cada subida a TikTok. Una cuenta sin conectar no cuenta como fallo |
| Vistas del equipo | Cada vez que se abre el espacio en 3D o en 2D: si abrió o la clase de fallo (no pudo crear el lienzo 3D, falló al dibujar, una imagen no cargó). También un fallo al dibujar la ventana. Lo cuenta la interfaz, una vez por sesión |
| Entregas | Lo que el comprobador de entregas encontró (o no) de lo prometido, tras pedirlo otra vez |
| Programas de fondo | Los que el vigilante tuvo que parar por tiempo o por no dar señales |

Con eso hay un **parte de salud** (`getHealth`): cuántos aciertos y fallos lleva cada función en los últimos 7 días y
en las últimas 24 horas, las 10 últimas causas y lo que está en marcha ahora (agentes trabajando y programas de fondo) con cuánto lleva sin dar
señales; más de 30 minutos cuenta como colgado.

- **Solo datos, nunca lo que escribiste.** Va la función, sí o no, la duración, con qué se hizo y el motivo del
  programa en una línea. De una entrega que falta va la clase («imagen: no existe»), no el nombre del archivo; de una
  tarea fallida va el motivo sin su título; de una publicación, nunca el texto del reel. Las rutas de archivo y las
  direcciones se quitan de cualquier motivo antes de guardarlo (queda la extensión: «….mp4»), porque el nombre de un
  archivo suele salir del título que escribiste. También las de carpetas con espacios («Mi novela secreta») y las que
  van entre comillas. De un fallo de las vistas va el tipo de error sin lo que cite entre comillas.
- Lo que detienes tú no es ni acierto ni fallo: no se apunta.
- Se guarda en `health-log.json` de la carpeta de datos (30 días, 3.000 apuntes como mucho) y nunca puede estropear lo
  que mide: si el registro falla, el trabajo sigue.
- En **kywai cloud** lo lee la página «Salud» de Administrar cuentas, que junta el parte de todas las cuentas y avisa
  si algo pasa del umbral (lo ve solo el administrador). En tu equipo no cambia nada de lo que ves.

- La [autoprueba del estudio](#probar-el-estudio-lo-hace-de-verdad-sin-agentes) apunta sus piezas aquí como edición,
  portadas y demos, con la marca «autoprueba»: así el parte tiene datos del estudio cada noche aunque nadie lo use.

Código: `src/main/healthLog.ts` (`recordHealth`, `withHealth`, `healthReport`), `src/main/studioCheck.ts` (los
trabajos del estudio) y `teamHealth` en `src/main/orchestrator.ts`.

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

**Además de mirarla, la mide** (`src/main/uiAudit.ts`; idea de Rune, de Anomaly, MIT, reimplementada). En cada
tamaño busca fallos que se pueden medir, no gustos: página en blanco, más ancha que la pantalla (y qué se sale),
imágenes que no cargan, botones o campos sin nombre (sin texto, `aria-label` ni etiqueta), texto cortado o encima
de otro texto y, en el móvil, botones de menos de 24 px. Si un fallo sale en los dos tamaños se cuenta una vez
(«[escritorio y móvil] …»). También saca un **esquema** de la página como un árbol de accesibilidad corto
(cabecera, navegación, encabezados, botones, campos con lo escrito, enlaces, imágenes, avisos). Los fallos medidos
y el esquema le llegan al verificador aunque no vea imágenes (Hermes o Qwen, por ejemplo); las capturas, solo al que
las ve. Si un fallo viene de lo que hizo la tarea o impide usar lo pedido, el veredicto es FALLOS. El registro lo
cuenta («… · 3 fallos medidos en la página»).

**Guion.** Antes de medir, kywai puede seguir unos pasos: pulsar un botón, escribir en un campo, una tecla o
esperar (como mucho 15). Los elementos se buscan por lo que pone (texto, etiqueta, placeholder, `aria-label`) o por
un selector CSS. El agente lo deja en `.ai-cowork/guion-pantalla.json`, por ejemplo
`[{"escribir": "yo@ejemplo.com", "en": "Correo"}, {"clic": "Enviar"}]`, y el verificador ve la página después del
guion (el formulario enviado, el menú abierto). Un paso que no encuentra su elemento sale como fallo («Guion: paso
2: no hay nada que pulsar con «Comprar»»); un archivo roto, también.

**Los agentes revisan su propia pantalla antes de entregar** con la herramienta `revisar_pantalla` (Claude la
lleva en el servidor MCP de kywai; Codex y Gemini, junto al navegador). Abre un HTML de su carpeta o la dirección de
su servidor de desarrollo (solo `localhost` o `127.0.0.1`, nunca una web de fuera), sigue el guion si se lo dan y les
devuelve los fallos medidos, los errores de la consola, el esquema y la captura de escritorio. El encargo de cada
tarea les pide usarla cuando cambian una web o una interfaz y arreglar lo que salga por su cambio.

**Rehacer una web y medir cuánto se parece (22 nov 2026, idea de Craft Anything).** Cuando pides copiar, rehacer o
igualar una web o un diseño, el agente usa `comparar_con_original` (mismo servidor MCP): saca la foto de su página y la
del original (una web pública o una imagen de su carpeta; nunca `localhost` ni la red de casa) en escritorio y en
móvil, y devuelve un **parecido de 0 a 100** (SSIM por bloques en pequeño: mide disposición, tamaños y contrastes) con
la imagen de las dos lado a lado, guardada en `.ai-cowork/verificacion/<tag>-parecido-<escritorio|movil>.png`. La
habilidad `web-rehacer-con-parecido` le dice cómo trabajar: estudiar el original en `estudio.md`, construir, comparar
y corregir hasta 85 o más, y copiar solo la forma (nada de logos, textos ni fotos con derechos de otros).

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
- **Comentar una línea** (20 nov 2026, como en GitHub, Conductor u Orca): en el parche desplegado pulsas una línea,
  escribes qué cambiar (Intro guarda) y sale debajo con 💬. Con uno o más, **«Enviar N comentarios al equipo»** los
  deja en el cuadro de texto como «Sobre «la tarea», cambia esto:» y una línea por comentario con `archivo:línea`, el
  código y tu nota, para que lo revises y lo mandes. Se quitan dejando el texto vacío o con «Descartar». El parche se
  parte por archivo y número de línea en `src/renderer/src/lib/diffLines.ts`.
- **Crear PR** (20 nov 2026, como Conductor, Codex app y Orca): si la carpeta del proyecto es un repositorio git con
  remoto `origin`, sube **solo los archivos de esa tarea**, tal como están ahora, a una rama nueva
  `kywai/<título>-xxxxx` y abre GitHub con el PR ya titulado y descrito (agente, descripción, resultado y archivos)
  contra tu rama actual. No cambia de rama, ni toca tus archivos, tu índice o lo que tengas a medias: arma el commit
  aparte con un índice temporal (`GIT_INDEX_FILE`) y `git commit-tree`, y lo empuja con `git push origin
  <commit>:refs/heads/<rama>`. Usa el acceso que ya tiene tu git (no hace falta `gh` ni ninguna clave). Si el remoto
  no es de GitHub, deja la rama subida y te dice que crees el PR en su web. Código: `src/main/gitPr.ts`
  (`taskPullRequest` en el orquestador), pruebas con un repositorio de verdad en `gitPr.test.ts`.

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

### Errores pasajeros (503, «mucha demanda»)

Si un agente falla por algo que se arregla solo esperando (su servicio responde 503, 529 o «This model is currently
experiencing high demand… try again later», o se corta la red), la tarea **no se da por fallida**: el mismo agente la
repite a los 30 s y, si vuelve a pasar, a los 90 s. El chat lo dice («Gemini está saturado ahora mismo (es pasajero):
lo vuelvo a intentar en 30 s»). Si tras esos dos reintentos sigue igual, pasa a otro agente **aunque la tarea ya
viniera de un relevo** (antes, Gemini daba un 503 después del relevo de Codex a Aider y la tarea moría ahí). Un mensaje
directo solo se reintenta con su agente. En el código: `isTransientError` y el principio de `handleFailure`
(orchestrator.ts); la tarea espera en `schedule` hasta `retryAt`.

### Entregables en una carpeta

**Lo que pediste va delante.** Si entre los archivos de una tarea hay uno que destaca como resultado (el PDF, el
vídeo, la página, el documento), sale **suelto, con Abrir y Descargar**, y el resto (json, scripts, datos, capturas)
queda debajo en **una línea pequeña, «Archivos de trabajo · N»**: plegada no enseña nada más, y al pulsarla se
despliegan (con su «Descargar como zip»). Es la misma regla de la pestaña Resultados. Con más de
tres resultados principales (una tanda de imágenes) o si ninguno destaca, va todo en la carpeta, como abajo. Una
tarea registra como mucho 60 archivos como entregables, y esos 60 se eligen empezando por los resultados: antes iban
por orden alfabético y 60 JSON de `api/` dejaban fuera el `reporte.pdf` que se había pedido. Órbita hace lo
mismo en su chat (hay que actualizar la app del móvil).

**El mensaje es un resumen para ti.** A cada agente (y a Hermes en la respuesta final) se le pide decir qué entrega
y con qué nombre de archivo, y después solo lo que te sirve para usarlo o decidir, en pocas líneas y sin detalle
técnico (funciones, scripts, archivos intermedios, recados para otras tareas), salvo que la petición fuera sobre el
código. La sección «Para la memoria» de su respuesta se guarda en la pestaña Memoria y **no se escribe en el chat**.
Lo técnico sigue a un clic: despliega los pasos de la tarea o «N archivos cambiados».

**También en un mensaje directo.** Si le pides algo a un agente con «@Codex quita el logo de esta imagen», se le dice
que guarde lo que crea o edita en `artifacts/` (o en `.ai-cowork/entregables/` si el proyecto tiene carpeta de
trabajo) sin tocar tus adjuntos, y sale en el chat con Abrir y Descargar. Si aun así lo deja junto al original, en
`attachments/` (o `.ai-cowork/adjuntos/`), kywai también lo enseña: cuenta como suyo todo archivo nuevo de esa carpeta
desde que empezó la tarea que no sea uno de tus adjuntos. Antes esa carpeta no se miraba y la imagen editada no salía.
En el código: `directPrompt` (orchestrator.ts) y `strayAttachmentFiles` (projects.ts), que usa `collectArtifacts`.

**Hermes también te da el archivo.** Si le pides un archivo que ya existe («dame el archivo en el chat», «no me
pasaste la imagen», «pásame el informe»), lo pone en el campo `"files"` de su plan con su ruta y sale con su respuesta
como tarjeta con Abrir y Descargar. Lo busca entre los entregables por ruta o por nombre y, si no estaba registrado
pero existe dentro del proyecto, lo registra (nada fuera del proyecto). Antes no tenía cómo y contestaba «no puedo
adjuntar archivos desde este chat»; su guía ahora se lo prohíbe. En el código: `planFiles` (orchestrator.ts).

**Editar una imagen no necesita IA.** Quitar o poner un logo, superponer, recortar o cambiar el tamaño se hace en el
equipo con Python y Pillow o con ImageMagick: lo dice el encargo de cada tarea y el de los mensajes directos
(`IMAGE_EDIT_RULE` en coordinatorGuide.ts), porque Codex buscaba su herramienta de generar imágenes y una
OPENAI_API_KEY y acababa bloqueado. Hermes se lo encarga a un agente con terminal (Claude o Codex) y, si hay relevo,
una tarea sobre una imagen no va a Aider ni a los CLI que dicen evitar las imágenes salvo que no quede nadie más
(`IMAGE_TASK` en `relayAgent`).

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

### Tu cara en el chat

Tus mensajes llevan **tu cara**: un personaje con forma de gota que sale de un texto con
[blobatar](https://github.com/Alain00/blobatar) (MIT, copiado tal cual en `src/renderer/src/lib/blobatar/`, sin
dependencias ni API). El mismo texto da siempre la misma cara, así que es la misma en el escritorio, la web y los
clientes. **Un clic en tu cara** la cambia por otra al azar («Otra cara»). Los mensajes de rutinas y del Tablero
siguen con su icono, y los agentes con sus robots.

De qué sale: la cara que elegiste (`config.face`, `setFace`); si no hay, el nombre del ordenador; y si tampoco, una
común. En kywai cloud empieza siendo tu correo (variable `KYWAI_CARA` del espacio), la misma cara que ves en Mi
cuenta. Lo hace `src/renderer/src/lib/myFace.ts`. Órbita todavía muestra el icono de siempre.

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
directo: va al coordinador, que reparte el trabajo.

Lo que cambia frente a una petición normal:

- **Sin coordinador**: no hay plan ni visto bueno, ni resumen final. Es una sola tarea para ese agente.
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

Capturas en `/mnt/project-files/preguntas-con-opciones/`.

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

### Conversaciones largas: lo de antes, resumido

El coordinador y cada agente leen enteros los **últimos 12 mensajes** de la conversación. En una conversación larga,
lo de antes ya no se pierde: va delante, **comprimido**, en un presupuesto fijo (unos 3.500 caracteres): lo que tú
pediste casi entero (ahí están las decisiones, «nada de morado», «el logo a la izquierda») y de cada respuesta solo su
primera frase, quedándose con lo más reciente si no cabe todo (y diciendo cuántos mensajes antiguos no caben). Los
bloques de código se cambian por «[código]» y los avisos del sistema no entran. Es un resumen por extracción, sin
llamar a ningún modelo: no gasta cuota ni tiempo. Idea de billion-context (comprimir el contexto en sesiones muy
largas); no hay código suyo. El código está en `src/main/conversationDigest.ts`. Lo que tiene que recordarse siempre,
aunque cambies de conversación, sigue yendo en la **Memoria** del proyecto (abajo).

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


**Lo que la memoria no guarda (24 nov 2026, v1.21.5; idea de AnyModelBot).** La memoria la leen todos los agentes y
modelos en cada encargo, así que antes de guardar una entrada pasa por `src/main/memoryGuard.ts`:
- Claves de API, tokens, contraseñas («contraseña: …», «password = …»), claves privadas, tarjetas (con comprobación
  de Luhn) e IBAN se tapan siempre («[clave oculta]», «[tarjeta oculta]», «[cuenta oculta]»), lo escriba quien lo
  escriba. Si la nota solo era la clave, no se guarda. Las claves van en los secretos del proyecto, cifrados.
- Teléfonos, direcciones y correos solo entran si los escribe el usuario. Si un agente los quiere anotar, no se guarda
  y la herramienta `anotar_memoria` le contesta que pregunte antes al usuario.
- Cada entrada tiene, junto a la papelera, **No volver a recordarlo** (ojo tachado, pide un segundo clic): la borra y
  guarda su texto normalizado en `memoryForgotten` del proyecto (200 como mucho); desde entonces ningún agente puede
  volver a anotarla, ni una variante casi igual. Si la escribes tú a mano, vuelve a valer y sale de esa lista.
### Habilidades de kywai por MCP y órdenes de habilidades frenadas (1.30.64)

(`src/main/mcpSkills.ts`, `src/main/coworkMcp.ts`, `src/main/outputSqueeze.ts`; vigía 25 nov 2026.)

- **Habilidades por MCP.** El servidor MCP de kywai (`ai-cowork`) anuncia la extensión `io.modelcontextprotocol/skills`
  y responde `skills/list`, `skills/get` y `resources/read` (direcciones `skill://nombre/archivo`, con la huella
  sha256 de cada archivo). También contesta `server/discover`, el saludo del protocolo nuevo (2026-07-28) con el que
  arranca Claude Code 2.1.332; sin él, Claude volvía al saludo antiguo. Se sirven las habilidades del proyecto y las
  del paquete (sin las de vídeo); los nombres raros no se sirven; hasta 32 archivos de apoyo de 1 MB (4 MB en total).
- **Límite sincero:** Claude Code solo pide las habilidades por MCP cuando Anthropic enciende su beta en la cuenta
  (hoy apagada y siempre apagada en sesiones remotas). Mientras tanto las habilidades siguen llegando por el encargo,
  igual que antes; cuando la enciendan aparecerán como `ai-cowork:nombre` en el menú «/».
- **Órdenes al cargar una habilidad.** Una habilidad puede llevar líneas `` !`orden` `` que Claude ejecuta al cargarla.
  Con Claude Code 2.1.332 o más nuevo, kywai añade el gancho `PreSkillShellCommand`
  (`claude-ajustes-habilidades.json`): si la habilidad viene de un servidor MCP o de la carpeta del proyecto (las que
  pueden haberse instalado solas), la orden no se lanza y Claude recibe el motivo. Las habilidades del usuario y de
  plugins siguen igual. Con versiones anteriores no se pone (abrían un aviso por el gancho desconocido).

### Aviso cuando dos agentes cambian el mismo archivo (1.30.64)

(`src/main/editClash.ts`, `watchProgress` en `src/main/orchestrator.ts`.) En cuanto una tarea edita un archivo que
otra tarea en marcha del mismo proyecto ya ha cambiado, sale en el chat «Aviso: A y B están cambiando `archivo` a la
vez…» y se deja una nota en la pizarra del equipo para que el segundo agente toque solo su parte. Se avisa una vez por
pareja y archivo; al terminar o pararse una tarea sus archivos dejan de contar. Lee las ediciones de Claude, Gemini y
las líneas «cambiado:/nuevo:» de Codex. Juntar los cambios sigue igual que antes (al terminar; si chocan, la tarea
vuelve a su agente).

**Codex: herramientas que arrancan solo cuando hacen falta.** Revisado el 25 nov: Codex ya trae
`features.mcp_lazy_stdio_startup` encendido por defecto, pero solo arranca tarde un servidor cuya lista de
herramientas tiene guardada. kywai lanza cada tarea con su propio lanzador (con sus secretos en el entorno), así que
Codex no lo reconoce entre tareas. Dejarlo fijo obligaría a guardar los secretos en disco, así que no se cambia.

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
- **`apis-y-servicios-gratis`** (desde el 18 de noviembre de 2026): cuando hace falta una API, unos datos o un
  servicio (alojamiento, base de datos, correo, autenticación…) sin pagar, el agente busca en dos listas abiertas que
  lee en su sitio cada vez: **Public APIs** (public-apis/public-apis, MIT, más de 1.400 APIs gratis por categoría,
  con si piden clave, HTTPS y CORS) y **free-for-dev** (ripienaar/free-for-dev, servicios con plan gratis
  permanente; sin licencia clara, así que solo se lee y se enlaza, nunca se copia). Se queda con 3 candidatas como
  mucho, **comprueba cada una** (su documentación, el límite gratis de hoy, sus condiciones y una llamada de prueba)
  y entrega una tabla corta con la recomendada. Las claves, en los Secretos del proyecto (`/secreto NOMBRE valor`),
  nunca en el código. Sale de dos reels de «repos de GitHub que sustituyen herramientas de pago»; el texto es de kywai.

- **Especialistas de tienda, negocio, vídeo, bolsa y SEO** (desde el 20 de noviembre de 2026, `src/main/specialistSkills.ts`):
  nueve habilidades con el método de un oficio, para que Hermes pueda encargar trabajo de negocio a cualquier agente
  sin que el usuario monte nada. La idea sale de los 16 agentes incorporados de **Orkas** (Orkas-AI/Orkas, MIT), que
  traen cada uno su flujo, sus normas de calidad y lo que no les toca; el texto es de kywai, en español y resumido.
  - `tienda-elegir-producto`: qué producto vender o probar (demanda, competencia, margen de contribución por unidad,
    proveedor, riesgo) y una prueba pequeña y reversible; sin tope de dinero no propone cantidades.
  - `tienda-textos-de-producto`: título, ventajas con su prueba, descripción, preguntas, textos de las fotos y el
    guion plano a plano de un anuncio del producto (que luego hace «/video»); lee `cliente-ideal.md` si existe.
  - `tienda-resenas-clientes`: por qué compran, qué gusta y qué duele, con porcentajes sobre reseñas únicas, citas
    reales sin datos personales y qué arreglar primero.
  - `tienda-analizar-ventas`: ventas, margen, devoluciones, anuncios y stock de las exportaciones, con definiciones
    fijas, un script guardado para repetirlo y el «puente» de qué movió el margen.
  - `tienda-operar`: precios, promociones, stock, fichas y pedidos. Enseña antes la vista previa campo a campo; solo
    aplica por una app conectada que de verdad lo permita (Composio o un MCP de la tienda), nunca simula un cambio,
    no repite a ciegas un reembolso y marca cada cosa como preparada, aplicada, comprobada, fallida o desconocida.
  - `negocio-informe-semanal`: una página con las cifras de la semana, qué cambió, lo que dicen los clientes, alertas
    y las 3 cosas que hacer; propone una rutina si se quiere cada semana.
  - `video-recrear-referencia`: con un vídeo de referencia, primero el desglose plano a plano (gancho, orden, ritmo,
    textos, estilo) y el plan con el contenido del usuario; después lo produce «/video». Copia la forma, no el
    contenido (ni textos, ni logos, ni caras, ni música con derechos).
  - `bolsa-analizar-valor`: una acción, un fondo o una cartera con datos fechados y su fuente (SEC/EDGAR, informes
    de la empresa), valoración en tres escenarios, riesgos y lo que cambiaría la tesis; nunca dice qué comprar ni
    inventa cifras, y un backtest va con costes y sin mirar el futuro.
  - `web-auditoria-seo-geo`: por qué una web no sale en Google ni la citan ChatGPT, Perplexity o Gemini (rastreo,
    robots.txt, datos estructurados, rapidez, respuestas citables, autoría) y la lista de arreglos por impacto.
  - `anuncios-campana` (21 nov 2026, idea del «meta-agent-pipeline» de Social Agents, escrita desde cero): una
    campaña de pago en Meta/Instagram, Google, TikTok o LinkedIn Ads, paso a paso: objetivo con su número de éxito
    (CPA o ROAS), presupuesto diario y total con tope (nunca lo sube), audiencia (con aviso de las categorías
    especiales: vivienda, empleo, crédito, política), 2 o 3 creatividades que cambian una sola cosa (textos con
    `tienda-textos-de-producto`, vídeo con «/video vertical»), la regla de la prueba y la medición (píxel, API de
    conversiones o UTM). La crea **en pausa o en borrador** por la app conectada (Composio o un MCP de la red de
    anuncios) o deja el archivo de importación si no hay conexión; nunca simula. **Activarla y gastar** solo con el
    sí del usuario con la cifra delante: un sí a preparar no es un sí a gastar.
  El usuario no tiene que nombrarlos ni conocerlos: Hermes elige el que encaja por lo que pide y por la conversación
  (tienda, ventas, producto, reseñas, negocio, vídeo de referencia, bolsa, cartera, SEO, visibilidad en Google o en
  las IA, anuncios y campañas; `coordinatorGuide.ts`) y escribe el nombre en la tarea; además, cada agente recibe sola la habilidad que
  encaja con su tarea. Un encargo grande se reparte en una tarea por especialista.

**Paquete «kywai default skills»** (desde el 20 de noviembre de 2026, `src/main/skillPack.ts`). Todas las habilidades
que hemos ido eligiendo para kywai vienen puestas: nadie tiene que buscarlas, descargarlas ni instalarlas. La primera
vez que arranca kywai (a los 30 s, en segundo plano, una fuente detrás de otra) descarga cada fuente como un `.tar.gz`
de codeload.github.com (sin el límite de consultas de la API de GitHub, que en kywai cloud comparten todas las cuentas)
y la deja en `habilidades/kywai-default-skills/<fuente>/<habilidad>/SKILL.md`. Si SkillSpector está en el equipo, la
que no recomienda no se queda. Si una fuente falla (sin red), se reintenta al día siguiente; las fuentes nuevas que se
añadan a `PACK_SOURCES` llegan solas al arrancar. El estado va en `habilidades/.kywai-default-skills.json`.

Trae 41 fuentes: Superpowers, Anthropic Skills, Knowledge Work (Anthropic), Agent Skills de Addy Osmani, Vercel Agent
Skills, Impeccable, Hallmark, Modern Web Guidance, Liquid Glass, Diagram Design, Stitch Skills, Page Mascot, Auditoría
de seguridad (Cloudflare), Open Code Review, Graphify, REA, Reverse API Engineer, agent-browser, Scrapling,
/last30days, Humanizer, Marketing Skills, OpenSEO, Text to CAD, Gamedev Skills, HyperFrames y Bang Motion (estas dos,
al guion de los vídeos). El 20 nov 2026 se sumaron 10 de las más usadas en los rankings de skills: Matt Pocock
Skills, Planning with Files, UI UX Pro Max, Taste Skill, Emil Kowalski Skills, Archify, Frontend Slides, PM Skills,
Scientific Skills y Stop Slop. El 22 nov 2026 llegaron Make Interfaces Feel Better (detalles finos de interfaz:
animaciones, alineación óptica, radios concéntricos, sombras, zonas de clic) y Loopy (bucles de hacer, comprobar y
corregir con un final claro; solo publica un bucle en Loop Library si el usuario lo pide), y después Claude SEO (auditoría SEO a fondo, 29
habilidades) y Social Media Skills (estrategia, calendario y textos para redes). El 24 nov 2026 (v1.27.3) se sumaron I Have ADHD (respuestas con el siguiente paso primero y pasos numerados; se activa con /i-have-adhd y se apaga con «stop adhd mode») y Career Ops (buscar trabajo: evaluar ofertas, CV, cartas, entrevistas; para sus modos necesita el programa career-ops y lo pregunta antes de instalarlo). El mismo día (v1.29.11) llegaron las Reglas de Karpathy (no suponer, lo más sencillo, cambios quirúrgicos y una meta comprobable). El 25 nov 2026 (v1.34.0) llegó vgpu (`vercel-labs/vgpu`, MIT), la librería WebGPU de Vercel pensada para agentes: efectos 3D, luz y shaders (lava, cristal, partículas) en webs que se compilan con npm, con su galería y sus órdenes `npx vgpu docs`, `examples` y `check`. Get Shit Done se quedó fuera: no trae SKILL.md, su instalador genera las habilidades con hooks propios y se solapa con Superpowers y Planning with Files. De estas solo se copian los SKILL.md y sus archivos: los hooks y los instaladores que
traen algunas (Planning with Files, Taste Skill) no se ejecutan. Una habilidad en la raíz de su repositorio lleva sus
carpetas (como `references/`), menos las de pruebas y las ocultas; con `only`, si la misma sale copiada en varias
carpetas, vale la primera. Fuera a propósito: ECC y gstack (marcos con hooks que se solapan con Superpowers), Caveman
(cambia el estilo de todas las respuestas y su programa manda estadísticas), Ponytail (va con su interruptor por proyecto, apagado porque la calidad va
primero), Remotion Skills y remocn (Remotion pide licencia a las empresas) y lo que kywai ya instala solo cuando hace
falta (estudio de vídeo, PPT Master, Instagram). claude-mem y billion-context no son habilidades sino programas (y
billion-context pide citarlo en todo producto que lo use), así que no van.

**Para que no gaste de más**, el paquete no se lista habilidad por habilidad en cada encargo (serían cientos de
líneas). El agente ve una línea por tema («- Superpowers (14): planificar, TDD, depurar…»), y kywai le pega enteras,
como mucho tres, solo las que encajan con su tarea: las del paquete cuando su nombre encaja con el texto de la tarea
(no por palabras sueltas de la descripción). El coordinador ve los mismos temas y puede escribir el nombre exacto de
una en la tarea. Si al agente le falta una, la busca con `leer_habilidad` y `{"buscar": "palabras"}` (`searchSkills`)
y la lee por su nombre; sin las herramientas de kywai, se le da la carpeta para buscarla con grep. Las habilidades
tuyas con el mismo nombre ganan a las del paquete. Código: `packSkills`, `packPromptLines`, `searchSkills` en
`skills.ts`.

**Quitarlas.** En Ajustes → Extensiones → Habilidades, la tarjeta «kywai default skills» enseña cuántas hay, los temas
(«Ver N» abre las de cada uno, con su papelera) y dos botones: «Poner al día» (vuelve a descargar todo, sin las que
quitaste) y «Quitar el paquete». Lo que quitas no vuelve: una habilidad queda anotada como quitada y el paquete entero,
apagado, hasta que pulses «Volver a ponerlo».

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

**Pizarra del equipo (siempre encendida, en todos los chats).** Cuando varias tareas trabajan a la vez en un
proyecto (las de una petición y las de otros chats del mismo proyecto), se dejan avisos cortos en vez de ir a ciegas
hasta el final: `pizarra_escribir` apunta una frase («cambio `src/api.ts`», «la ruta es `/v2/pagos`») y el agente
sigue trabajando, y `pizarra_leer` le da lo nuevo de los compañeros desde su última lectura. Al terminar una tarea,
kywai apunta solo «Terminó «…»; archivos: …», y cada tarea que empieza recibe lo apuntado hasta entonces en su
encargo (sección «Pizarra del equipo»), así que también la aprovechan los agentes sin herramientas. En el chat se ve
dentro de cada tarea como «En la pizarra del equipo: …». No es una charla entre agentes (cada mensaje sería otra
llamada entera a un CLI): nadie contesta en ella. Límites: 400 caracteres por nota, 8 notas por tarea (sin contar
la de «Terminó»), 40 por proyecto; vive en memoria y las notas de una petición se borran al terminar
(`src/main/teamBoard.ts`). La llevan Claude en su servidor de kywai y Codex, Gemini y Hermes en el del navegador.

**Objetar en la pizarra (20 nov 2026, idea del modo Multiagent de Perplexity).** Si un agente ve algo de un
compañero que no cuadra (un dato, un supuesto, una decisión que rompe lo suyo), lo marca con `pizarra_objetar`
(«el informe anual dice 14 %, no 40 %», opcionalmente con el número de la nota a la que objeta). El compañero lo lee
en la pizarra como «… OBJETA a la nota N: …» y corrige o contesta con `pizarra_escribir` por qué lo mantiene. Al
terminar, quien coordina recibe las objeciones de la petición en el encargo de la respuesta final, decide quién
tiene razón con todos los resultados delante y dice en una línea dónde discreparon y qué decidió. En el chat se ve
dentro de la tarea como «Objeción en la pizarra del equipo: …». Cuenta para el mismo límite de 8 notas por tarea.

**Consultar a otro agente (17 nov 2026, idea del plugin Advisor de Cursor, escrita desde cero).** El agente que hace
una tarea puede pedir consejo con `consultar_agente` antes de una decisión difícil de deshacer (arquitectura, borrar o
migrar datos, cambiar una API), cuando lleva dos intentos sin arreglar algo o antes de dar por hecha una tarea
difícil. Contesta un agente de **otra familia** (el mismo que elegiría para comprobar, `pickVerifier`), en modo plan:
solo lee el proyecto, no cambia nada, contesta en unos minutos (corta a los 6) y el que consulta decide. Gasta cuota
del consejero: como mucho 2 consultas por tarea, cuenta en «Uso y coste» como una comprobación y en la tarea se ve
«Consulta a … antes de seguir». Para que la espera no corte la herramienta, kywai sube el tiempo de espera de las
herramientas MCP a 10 minutos (Claude con `MCP_TOOL_TIMEOUT`, Codex con `tool_timeout_sec`, Hermes con `timeout`).
Código: `src/main/advisor.ts`, `coworkMcp.ts` (la herramienta) y `orchestrator.ts` (`adviseTask`).

**Consejo antes de las tareas difíciles (21 nov 2026, idea del `/advisor` de Claude Code).** Que el agente decida
cuándo consultar tiene una pega: casi nunca lo hace (en la prueba de Anthropic, Sonnet preguntó cero de veinte
veces). Por eso, en cada tarea **difícil** kywai pide él mismo el consejo **antes de lanzar al agente**: un agente de
otra familia lee la tarea y el proyecto en modo plan y contesta en pocas líneas cómo la enfocaría, qué riesgos ve y
cómo comprobar que ha quedado bien. Ese consejo va al final del encargo («decides tú»). Si tarda más de 3 minutos o
falla, la tarea empieza sin él. No se pide en correcciones, relevos, sesiones retomadas, consultas rápidas, mensajes
directos ni en los flujos propios (vídeo, Instagram, miniatura…). El «antes de terminar» ya lo cubre la verificación
de la tarea. En la tarea se ve «Consulta a … antes de empezar» y «Consejo de … recibido»; cuenta en «Uso y coste»
como una comprobación. Se apaga en ⚙ → Ajustes → Agentes → «Consejo antes de las tareas difíciles».

**Modo ahorro** (mismo sitio, apagado de serie): las tareas difíciles las hace el **modelo habitual** del agente
(por ejemplo Sonnet) y su **modelo potente** (Fable u Opus) solo da el consejo de antes de empezar. Es lo de
«Sonnet trabaja y Fable aconseja», que en la prueba de Anthropic sacó el 92 % de la nota de Fable por el 63 % del
precio. Solo se aplica si el agente tiene modelo potente. Código: `advisor.ts` (`wantsStartAdvice`,
`startAdvicePrompt`, `saverApplies`, con `advisor.test.ts`) y `orchestrator.ts` (`adviseStart`); ajustes
`adviceAtStart` y `adviceSaver` (`setTaskAdvice`).

**Modo contexto** (21 nov 2026, idea de **Context Mode**, MIT, un plugin para Google Antigravity que dice ahorrar más
del 90 % de los tokens en registros reales; mismo sitio, **encendido de serie**). Cuando unas pruebas, una compilación,
una instalación o un archivo sueltan miles de líneas, el agente ya no se las traga enteras: guarda la salida en un
archivo (`mkdir -p .ai-cowork/salidas && npm test > .ai-cowork/salidas/pruebas.log 2>&1`) y la lee con la herramienta
de kywai **`leer_grande`**. Hasta 8 KB le da el archivo entero; por encima, el principio, el final, las líneas con
errores o avisos y los trozos que mejor encajan con lo que busca (`buscar`), o unas líneas concretas (`desde`/`hasta`,
200 como mucho). Puede repetir la búsqueda con otras palabras sin volver a leer el archivo. Solo lee archivos de la
carpeta de la tarea (ni enlaces que salgan de ella), tapa los secretos del proyecto y no ejecuta nada: los comandos
los sigue lanzando el agente con su propia terminal y sus permisos. En la tarea se ve «Modo contexto: … leído por
partes». En Antigravity lo hace un gancho que intercepta cada volcado; aquí los agentes son CLIs con su terminal, así
que va como herramienta y como regla en el encargo. El índice es BM25 sobre palabras y trozos de tres letras, en
memoria (como el FTS5 con trigramas del original, sin base de datos), y guarda los 12 últimos archivos. Lo tienen
Claude, Codex, Gemini y Hermes en las tareas (no el coordinador). Se apaga en ⚙ → Ajustes → Agentes → «Modo
contexto». Código: `src/main/contextMode.ts` (+ test), `coworkMcp.ts` (`CONTEXT_TOOL`, `readBigTool`) y la regla del
encargo en `orchestrator.ts`; ajuste `contextMode` (`setTaskAdvice({ context })`).

**Salidas recortadas** (1.30.42, 24 nov 2026; idea de **Squeez**, Apache 2.0, y de **Token Optimizer**; nada de su
código copiado; **siempre encendido**). Lo complementa: el Modo contexto depende de que el agente se acuerde de usar
`leer_grande`; esto va solo. Cuando **Claude Code** o **Hermes** ejecutan algo ruidoso (instalar paquetes, compilar,
pasar pruebas, `git log`/`clone`/`pull`…), kywai recorta la salida **antes** de que la lean: quita barras de progreso,
líneas repetidas («(×N)»), pruebas que pasan («✓ … N líneas correctas») y líneas parecidas seguidas, y si aún es
larga deja el principio, el final y las líneas con errores o avisos (con dos de contexto). Los **errores, avisos y
resúmenes** («Tests 600 passed») se quedan siempre. Al final añade una nota: «salida recortada de X a Y caracteres… si
te falta algo, repite filtrando o añade `# kywai-entero`». No toca lo que el agente necesita tal cual (`cat`, `grep`,
`git diff`/`show`, `npm view`, `docker ps`, `kubectl get`, nada con `| tail`…), ni salidas de menos de 3 000
caracteres, ni recortes que ahorren menos del 20 %. En una prueba real con Claude Code 2.1.331, un `npm test` de
24 555 caracteres llegó al agente en 415.
- **Claude Code**: dos ganchos en `ahorro/claude-ajustes.json` (carpeta de datos) que se pasan con `--settings` solo al
  trabajar (se suman a los del usuario). `PostToolUse` cambia la salida con `updatedToolOutput` (Claude Code ≥ 2.1.119;
  en versiones anteriores no hace nada). Los comandos que **fallan** llegan por `PostToolUseFailure`, que no deja
  cambiarlos: esos pasan enteros. Se probó también reescribir el comando antes (`PreToolUse` + `updatedInput`), pero
  el filtro de seguridad de Claude Code lo bloquea («expansion obfuscation»): descartado.
- **Hermes**: un plugin `kywai-ahorro` en `~/.hermes/plugins` (`transform_terminal_output`), activado una vez con
  `hermes plugins enable kywai-ahorro` (entra al volver a encenderse su gateway). Se quita con
  `hermes plugins disable kywai-ahorro`.
- El programa es `ahorro/kywai-ahorro.cjs` (lo reescribe la app al arrancar); se ejecuta con Node si está instalado
  (arranca en decenas de milisegundos) o con kywai en modo Node. Si algo falla, la salida pasa tal cual.

**Aviso de bucle** (1.30.43, 24 nov 2026; idea de Token Optimizer; antes solo lo tenía el agente local,
`stuckWatch.ts`). Si **Claude Code** o **Hermes** hacen la **misma llamada** (herramienta y argumentos) 3 veces entre
las 6 últimas, o chocan 3 veces seguidas con el mismo error (Claude Code), kywai pega a ese resultado «llevas 3 veces
la misma llamada sin avanzar: prueba otro enfoque». Si se vuelve a atascar, le pide que pare y cuente lo que tiene, y
**bloquea** esa llamada repetida (en Claude Code con `PreToolUse` → `deny`, que solo niega y nunca aprueba nada; en
Hermes con `pre_tool_call` → `block`). Lo demás pasa siempre. En Codex y Gemini todavía no: no dejan que kywai les
hable a mitad de tarea. Código: el mismo programa (`loopGuard`) y `_transform_tool_result` del plugin de Hermes.

Lo que ahorra cada llamada se apunta en `ahorro/llamadas/<id>.jsonl` (`KYWAI_LLAMADA` en el entorno de Claude Code;
Hermes, en `hermes.jsonl`) y pasa a `UsageCall.trimmedTokens` y `loops` al terminar (ver «¿Dónde se van mis tokens?»
en [Consumo: ¿compensa?](#consumo-compensa)). Código: `src/main/outputSqueeze.ts` (+ test), `hermesAhorro.ts`
(+ test), `agents/claude.ts` (`--settings`), `agents/hermes.ts` y `index.ts` (`installSqueeze`).

**Mapa del proyecto** (1.29.0–1.29.2, 24 nov 2026; idea de un reel de nacho.mirandap que «indexa el proyecto como un
grafo» y dice ahorrar un 70 % de tokens; mismo sitio, **encendido de serie**). En una carpeta con **200 archivos de
código o más** (sin `node_modules`, compilados ni carpetas ocultas), kywai crea solo un mapa del código con
**Graphify** (Apache-2.0) al empezar el primer encargo, y lo pone al día al terminar cada uno (`graphify update`, solo
lo que cambió, unos segundos; como mucho una vez por minuto). La primera vez hace `graphify extract . --code-only` y
`graphify cluster-only . --no-label`: el código se lee con tree-sitter en el propio equipo, **sin modelo, sin claves y
sin que salga nada** (unos 30 s para 1.200 archivos). El programa se instala solo con uv (`uv tool install
"graphifyy[mcp]"`: el extra trae `anyio`, que pide `graphify query`); sin uv no se instala nada y la pestaña lo dice.
El mapa queda en `<carpeta>/graphify-out/` (`graph.json` para consultar, `graph.html` para verlo, `GRAPH_REPORT.md`
con el resumen) y se aparta de git en `.git/info/exclude` (solo en ese equipo: el `.gitignore` no se toca).
- **Los agentes** lo consultan con la herramienta de kywai **`consultar_mapa`** antes de abrir archivos: `pregunta`
  (en palabras: qué funciones y archivos tocan algo, con archivo y línea), `explicar` (qué usa y quién usa una pieza) o
  `desde` + `hasta` (el camino entre dos piezas). Luego abren solo los archivos que les nombra. Los agentes sin las
  herramientas de kywai reciben en el encargo los comandos `graphify query/explain/path`. En la tarea se ve «Mapa del
  proyecto: …». La regla del encargo solo sale si el mapa existe.
- **Verlo** (1.29.1): pestaña **Memoria → «Mapa del proyecto»** dice cuántas piezas, conexiones y grupos tiene y
  cuándo se puso al día; **«Ver el mapa»** abre el grafo (`graph.html`) en el panel de vista previa (se mueve y se
  busca, como la vista de grafo de Obsidian; con más de 5.000 piezas enseña los grupos). **«Poner al día»** o, en un
  proyecto más pequeño, **«Crear el mapa»** lo hace al momento.
- **Ahorro** (1.29.2): cada consulta apunta lo que habría costado abrir los archivos que nombra la respuesta (los 6
  primeros, hasta 24 KB de cada uno) menos lo que ocupa la respuesta (4 caracteres ≈ 1 token), en
  `<workspace>/mapa-ahorro.json`. **⚙ → «Uso y coste»** enseña «Ahorrado con el mapa del proyecto» del periodo (y del
  proyecto si marcas «Solo …»), dicho como estimación. El 70 % del reel no lo hemos medido: en carpetas pequeñas
  apenas ahorra, por eso no se crea solo por debajo de 200 archivos.
Se apaga en ⚙ → Ajustes → Agentes → «Mapa del proyecto» (ajuste `projectMap`, `setTaskAdvice({ map })`). La habilidad
Graphify del paquete de serie sigue ahí para mapas con documentos o PDF (esos sí usan el modelo del agente).
Código: `src/main/projectMap.ts` (+ test), `coworkMcp.ts` (`MAP_TOOL`), `orchestrator.ts` (`autoMap` al empezar y al
terminar, `mapPromptLines`), `index.ts` (`projectMapStatus`, `buildProjectMap`, `projectMapSavings`),
`ui/left/ProjectMapSection.tsx` y `ui/usage/UsageDialog.tsx` (`MapSavings`).

**Leer página limpia** (22 nov 2026, con **Defuddle**, kepano/defuddle, MIT, el motor de Obsidian Web Clipper). La
herramienta de kywai **`leer_pagina`** (`{"url": "https://…"}`) baja una web pública y devuelve solo su contenido (el
artículo, la documentación, la ficha) en Markdown, con título, autor, web y fecha, sin menús, cabeceras, pies,
anuncios ni comentarios. Gasta muchos menos tokens que el HTML o el texto entero, así que el encargo y la guía del
coordinador piden usarla antes que WebFetch, curl o web_extract. La llevan las tareas de Claude, Codex y Gemini (con el
servidor de kywai o el del navegador) y el modo de solo lectura del coordinador, porque no cambia nada. Hermes no: su
gateway solo admite los servidores de `~/.hermes` (por eso tampoco lleva el navegador) y sigue con su `web_extract`. No lee direcciones locales
ni privadas (la red de casa o de la empresa), ni páginas con sesión iniciada (para eso está el navegador de kywai);
corta a 60 000 caracteres y, si la página se dibuja con JavaScript y sale vacía, dice que se abra con `navegador_ir`.
Funciona sin navegador (DOM de linkedom), igual en el escritorio y en kywai cloud. Los modelos locales (LM Studio)
también la usan por dentro en su `fetch_url`. Código: `src/main/cleanPage.ts` (+ test), `coworkMcp.ts` (`PAGE_TOOL`)
y `agents/localTools.ts` (`fetchUrl`).

Ojo al empaquetar: `defuddle` va en devDependencies y electron-vite lo mete dentro de `out/main`, pero turndown (que
usa por dentro) hace `require("@mixmark-io/domino")` en tiempo de ejecución. Por eso `@mixmark-io/domino` está en
`dependencies`: la app instalada y la imagen de la nube (`npm ci --omit=dev`) solo llevan esas, y sin él la app se cae
al arrancar (22 nov: seis despliegues de la nube se pararon solos por esto). Cualquier dependencia nueva del proceso
principal que no se meta entera en el paquete tiene que ir en `dependencies`.

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
- **Su punto y «Tomar el control»** (21 nov 2026, idea de **Alan's Way**, un escritorio para Hermes Agent: «cuando
  hago clic es un marcador de color, no tu ratón; agarra el ratón y paro»). Cada vez que un agente hace clic o escribe
  sale en la página un **punto de su color con su nombre** («Claude · hace clic») que se apaga solo; la barra de
  arriba lleva el mismo color. Va dentro de la página, así que se ve igual en el equipo y desde otro dispositivo, y
  nunca mueve tu ratón. Con **«Tomar el control»** el agente se pausa: no hace clic, no escribe ni navega hasta que
  pulses **«Devolver el control»** (leer y hacer capturas sí puede). Pasa también **solo**: si haces clic, ruedas o
  escribes en la página mientras un agente la usa, el control es tuyo y sale la barra ámbar «Tienes el control». Si no
  lo devuelves en 10 minutos, el agente deja el navegador en esa tarea y lo explica en su respuesta. «Parar» sigue
  igual. Código: `holdBrowser`, `waitForControl`, `AGENT_DOT_SCRIPT` en `src/main/browser.ts` (con
  `browserHold.test.ts`), la espera en `browserTool` de `coworkMcp.ts`, `agentHue` en `src/shared/browser.ts` y la
  barra en `ui/pane/BrowserPane.tsx`.
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
- **Desde el cliente de escritorio, la web, Órbita u otro equipo:** el navegador vive en el equipo donde trabajan los
  agentes (el servidor) y se ve **en vídeo en directo, como AnyDesk**. Una ventana oculta de kywai graba la pestaña
  con la captura de pestaña de Chromium (`setDisplayMediaRequestHandler` solo se la da a ella) y la vista prueba a la
  vez dos caminos; se queda con el mejor que conecte:
  1. **Vídeo directo (WebRTC)** (`src/main/browserStream.ts`): de equipo a equipo por Tailscale o la red de casa, o
     por el **servidor de paso de Cloudflare** (TURN, `src/main/browserTurn.ts`) cuando no hay camino directo, como
     en kywai Cloud. Ratón y teclado vuelven por un canal de datos del mismo enlace. Las direcciones se reúnen como
     mucho 1,5 s por lado, se prefiere H.264 (el chip de vídeo del Mac lo codifica casi gratis), hasta 30 fps y
     8 Mbps, con poca red baja un poco la nitidez antes que ir a saltos (`balanced`) y la vista no guarda colchón de
     reproducción (`jitterBufferTarget = 0`). Sin servidor de paso, WebRTC no usa servidores de fuera (sin STUN ni
     TURN; para eso kywai arranca con `WebRtcHideLocalIpsWithMdns` apagado, y las webs del navegador siguen sin ver
     las IP locales con `setWebRTCIPHandlingPolicy`).
  2. **Vídeo por WebSocket** (`/api/browser-video`, `src/main/browserSocket.ts`; vista en
     `src/renderer/src/lib/browserVideo.ts`): la misma captura se codifica con WebCodecs en H.264 (o VP8 si no hay)
     y va por el mismo HTTPS que la interfaz, así que llega a todas partes (Caddy en la nube, túneles, Órbita). Solo
     se manda lo que cambia: una página quieta no gasta nada. Un fotograma de una página con texto pesa unos 5 KB,
     frente a unos 250 KB de una imagen JPEG. A una vista lenta (más de 768 KB por salir) se le saltan fotogramas
     hasta que se vacía y entonces recibe uno completo; ratón, teclado, tamaño de la vista y el «ping» del medidor
     van por el mismo socket. Necesita el mismo acceso que `/api/call` (código de acceso o cliente emparejado).
  3. **Imágenes** (reserva, si la vista no sabe decodificar vídeo o el servidor no sabe codificarlo): cada petición
     espera (hasta 1 s) a que pase algo (un fotograma nuevo, un clic, la rueda o una carga, tras los que se mira cada
     ~90 ms durante 1,5 s), hace una captura y solo la manda si cambió; ratón y teclado van entonces en una sola cola
     y por lotes.

  La vista manda su tamaño cada 3 s: si nadie mira la pestaña en el servidor, la página se maqueta a ese tamaño. Al
  girar la rueda, la imagen se mueve ya en tu pantalla (hasta 160 px) y vuelve a su sitio cuando llega la página
  desplazada de verdad. Abajo a la derecha, un **medidor** dice el camino («Vídeo directo», «Vídeo» o «Imágenes»,
  este en ámbar), los fotogramas por segundo y la ida y vuelta en ms. En todos los modos se maneja como una web: al
  mover el ratón los menús se despliegan y el puntero cambia (mano en enlaces, barra en textos), clic, doble clic,
  clic derecho, arrastrar, rueda (también horizontal con Mayús), teclado, atajos con Ctrl/Alt/Cmd y pegar desde tu
  portapapeles. Al hacer clic sale un círculo donde pulsaste y una raya arriba mientras la página carga. Copiar y
  cortar se quedan en el portapapeles del servidor. La ventana de kywai tiene que estar abierta en el servidor
  (aunque esté detrás de otras).
- **Servidor de paso (TURN de Cloudflare):** en kywai Cloud el espacio pide las direcciones al portal
  (`GET /api/turn`, con el mismo secreto que la voz incluida); la clave de Cloudflare (`KYWAI_CF_TURN_ID` y
  `KYWAI_CF_TURN_TOKEN`) solo está en el portal. En la self host es opcional: con `KYWAI_TURN_KEY_ID` y
  `KYWAI_TURN_TOKEN` en el entorno, kywai las pide a Cloudflare. Las credenciales duran 4 horas y se renuevan 10
  minutos antes; las del puerto 53 se descartan. Sin nada de eso, WebRTC solo conecta con camino directo y en la
  nube manda el vídeo por WebSocket.

**Cómo está hecho** (`src/main/browser.ts`, `src/shared/browser.ts`, `src/renderer/src/ui/pane/BrowserPane.tsx`):
es una `WebContentsView` pegada a la ventana principal que la interfaz coloca encima de su hueco (`browserShow`). Si
algo de la interfaz se pone encima (un diálogo, un menú, la vista previa), se aparta y en su sitio queda una captura.
Cuando no se ve, se deja en la esquina de abajo a la derecha con 1 píxel dentro de la ventana: comprobado con
Electron 44, oculta (`setVisible(false)`), en una ventana oculta o del todo fuera, Chromium no la maqueta o no da
capturas de una página nueva. Se presenta como Chrome (sin «Electron» en el agente de usuario) para que Google y otros
dejen iniciar sesión; las ventanitas de «Entrar con Google» se abren aparte en la misma sesión. Los scripts de lectura
van en un mundo aislado en la página principal; los clics son de ratón de verdad (`sendInputEvent`) en la página y
simulados dentro de marcos. Los permisos usan `askPermission` con la clave `Navegador:<sitio>`.

### Chats web: los chats gratis dentro del Navegador de kywai (solo kywai Cloud, 1.37.0)

(`src/shared/chatsWeb.ts`, `src/main/browser.ts`, `src/renderer/src/ui/pane/BrowserPane.tsx`; propuesta aprobada por el
dueño el 26 nov 2026: «que la persona tenga el chat web dentro de kywai, con su propia sesión, sin ir y volver del
navegador; no vendemos ni ponemos bot».)

En kywai Cloud, la pestaña **Navegador** lleva encima una barra **«Chats web»** con accesos a DeepSeek, Qwen, Kimi,
Z.ai (GLM), Mistral, Gemini, ChatGPT y Claude. Pulsas uno, entras con tu cuenta y escribes tú, como en una pestaña de
tu navegador. Es la web oficial, tal cual: kywai no cambia la página ni guarda tu contraseña. La sesión se queda guardada
en el Navegador de tu espacio (la misma partición que el resto de webs).

- **Los agentes no pueden usar estos chats** (tampoco Hermes). Es un bloqueo técnico, no una promesa: mientras la
  pestaña está en uno de estos chats, todas las herramientas `navegador_…` (leer, capturar, hacer clic, escribir,
  teclas, desplazarse, volver) se niegan con una explicación, `navegador_estado` no enseña la página y `navegador_ir`
  no abre direcciones de esos chats (`noChatWeb()` y `CHAT_WEB_AGENT_BLOCK` en `browser.ts`). Escribir a mano en un chat
  web es uso normal; que un agente lo haga por debajo es acceso automatizado, y las condiciones de DeepSeek, OpenAI,
  Anthropic y Z.ai (las que se leyeron) lo prohíben. El bloqueo vale en cualquier instalación, aunque la barra solo
  salga en la nube: si alguien escribe a mano la dirección de un chat en el Navegador, los agentes tampoco entran. La
  documentación y las webs de API de esas empresas (`platform.deepseek.com`, `www.kimi.com/code/…`) sí se pueden leer.
- **«Cerrar sesión de este chat»** borra las cookies y los datos de ese chat y lo vuelve a abrir (`browserClearChat`);
  las demás webs siguen con su sesión. En Gemini cierra también la sesión de Google de este navegador.
- **«Hablarle desde el chat de kywai»**: abre el catálogo de agentes con la búsqueda puesta (DeepSeek, Kimi, GLM,
  Qwen, Mistral…). Es la vía oficial: con su clave de API hablas con ese modelo desde el chat de kywai, sin segunda
  ventana. No usa el cupo gratis del chat web: la API es una cuenta aparte con saldo propio (DeepSeek: unos 0,75 $ por
  un millón de tokens de entrada más otro de salida).
- **Límites sinceros:** algunos chats detectan navegadores incrustados o piden verificación. Desde la nube el navegador
  sale con la IP del servidor, así que pueden pedir más verificaciones. Cada chat se prueba dentro del Navegador antes
  de dejarlo en la lista. No es asesoría legal.
- **Solo kywai Cloud:** la barra sale si el servidor tiene `KYWAI_CLOUD=1` (`BrowserState.chats`); la orden de cerrar
  sesión de un chat se niega en la self host.
- **Hermes lo sabe:** `coordinatorGuide.ts` (apartado del navegador) dice qué son, que no puede usarlos y que su vía es la
  API oficial.

### Webs como API: leer webs sin API con API Anything (solo kywai Cloud, 1.38.0)

(`src/shared/webApi.ts`, `src/main/webApi.ts`, herramientas en `src/main/coworkMcp.ts`, panel
`src/renderer/src/ui/settings/WebApiPart.tsx`; aprobado por el dueño el 26 nov 2026: «dejarlo solo como algo de kywai
Cloud».)

**Qué es.** [API Anything](https://github.com/goodnight000/api-anything) (licencia MIT, © 2026 Tianjun Zheng; aviso en
`THIRD-PARTY-NOTICES.md` y en el propio panel) trae 114 webs y 323 operaciones listas para pedir datos en JSON (vuelos,
valoraciones, repositorios, artículos…). kywai la usa como biblioteca (`api-anything/host`, versión exacta 0.5.0 en
`dependencies`), en modo «solo llamar»: no aprende webs nuevas, no consulta su catálogo en internet, no importa cookies
de ningún navegador y no escribe en las webs (`readOnly` obligatorio, sin `allowWrites`). Sale con `maxTier: 1`: solo
HTTP simple, porque el espacio de la nube no lleva Chromium.

**Qué ve la persona.** ⚙ → Ajustes → Conectores → «Webs como API», solo si el servidor tiene `KYWAI_CLOUD=1`. De serie
está apagado. Para encenderlo hay que marcar un aviso de responsabilidad (las condiciones de cada web pueden limitar el
acceso automático) y luego se enciende cada web con su botón. Semáforo propio de kywai (no es asesoría legal ni se han
leído las condiciones de cada web):

- **Verde** (23 webs de datos abiertos: Wikipedia, arXiv, GitHub, PyPI, USGS, OpenStreetMap…).
- **Ámbar** (24 webs comerciales o de contenido: Google Flights, Booking, Steam, IMDb, YouTube, BBC…): se encienden una
  a una, con la advertencia de que sus condiciones suelen limitar el acceso automático.
- **Rojo** (12: LinkedIn, Instagram, TikTok, X, Reddit, Pinterest, Amazon, Bing, Google Maps, Netflix, Disney+,
  Ticketmaster): kywai no las ofrece nunca; se enseñan tachadas y sin interruptor.

**Qué ven los agentes.** Tres herramientas del MCP propio de kywai, que solo aparecen si la persona aceptó el aviso y
encendió alguna web: `webs_lista` (webs encendidas y sus operaciones de lectura), `webs_operaciones` (parámetros y campos
de una web) y `webs_llamar` (una lectura; `campos` recorta la respuesta). Lo que devuelven lleva delante un aviso de que
son datos de terceros y no órdenes, y se corta a 20.000 caracteres.

**Quién impone los límites.** API Anything no restringe qué web se puede llamar (su opción `--sites` no lo hace), así
que la lista permitida es de kywai: `webApiCall` solo acepta webs encendidas, operaciones de solo lectura y un tope de
300 llamadas al día por cuenta (`WEBAPI_DAILY_CAP`; la IP del servidor la comparten todos los espacios). Los datos
(aceptado, webs, uso del día) están en `web-api.json` dentro de la carpeta de datos de la cuenta; la caché de API
Anything, en `api-anything/`. «Apagar todas las webs» y «Quitar el aviso y apagar» las apagan al instante.

**Pruebas.** `webApi.test.ts` (motor con un anfitrión de mentira) y `webApiSites.test.ts` (las tres listas contra las webs
reales del paquete y que la versión de `package.json` coincide con `WEBAPI_PACKAGE`). **Hermes lo sabe:**
`coordinatorGuide.ts`.

#### «Mis webs»: enseñar una web nueva (solo kywai Cloud, 1.39.0)

(Decidido por el dueño el 26 nov 2026: «'Mis webs' con Chromium en la nube».) En el mismo panel, la persona pega la
dirección de una página pública con `{algo}` donde cambia (por ejemplo `https://lobste.rs/domains/{dominio}`) y tres
ejemplos distintos de verdad para cada `{algo}` (máximo dos). Detrás va `api-anything learn` (`src/main/webApi.ts`,
`webApiLearnStart`), en un proceso aparte: el propio kywai hace de Node (`ELECTRON_RUN_AS_NODE`) y API Anything abre el
Chromium del espacio (`KYWAI_CHROMIUM`, que pone la imagen de kywai-cloud) con `--no-sandbox`, carga la página con los
ejemplos, ve qué petición trae los datos y guarda la lectura en `api-anything/sites/mia-<servidor>.json`. Tarda unos
segundos (hasta 2 minutos como mucho) y va en segundo plano: la interfaz pregunta cada 2 s (`webApiStatus().aprendiendo`
y `.ultimo`). Cuesta al día un máximo de 8 webs nuevas y se guardan como mucho 20 (`WEBAPI_LEARN_DAILY_CAP`,
`WEBAPI_OWN_MAX`).

Lo que kywai impone antes y después de aprender (porque API Anything no lo impone):

- **Antes:** https, sin usuario ni puerto, lo que cambia solo en la ruta o el `?`, el nombre de servidor tiene que ser
  público (nada de IP, `.local`, `.internal`…) y no puede ser de una red social, un buscador, Google, la familia Meta,
  Amazon, un chat web ni de kywai (`webApiHostOk`, `BLOCKED_HOSTS` en `src/shared/webApi.ts`); y todas las IP a las que
  apunta tienen que ser públicas (`isPublicIp`, comprobado con `dns.lookup`).
- **Después (`checkLearned`):** se lee lo aprendido y, si algún servidor al que habla (base, petición, página) no pasa la
  misma comprobación, o no es https, o la operación escribe, o necesita un navegador (`minTier` mayor que 1), se borra la
  web entera y se cuenta qué pasó. La lectura de comprobación (tercer ejemplo) tiene que haber ido bien.
- **Siempre:** las llamadas de los agentes a cualquier web de este panel se niegan si el plan dice que usaría una sesión
  iniciada (`plan.signedIn`). Una web enseñada nace encendida (la persona acaba de pedirla) y se puede apagar o quitar
  con su ×, que borra todo lo aprendido de ella (`webApiForget`).
- **Límites sinceros:** una web puede cambiar y dejar de contestar (API Anything intenta repararla sola al llamarla; si
  no puede, la lectura falla con una razón). Los redireccionamientos y el DNS que cambia a mitad no se pueden cerrar del
  todo desde aquí; el contenedor no tiene red hacia dentro, pero conviene que el espacio no vea servicios privados del
  servidor. No es asesoría legal: las condiciones de cada web siguen siendo cosa de quien la enseña.

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

### Conectores: tus apps con su estado y conectar o desconectar con un clic (v1.18.0)

Desde el 23 de noviembre de 2026 (v1.18.0) las apps conectadas tienen su propia pestaña, **⚙ → Ajustes →
Conectores** (entre Agentes y Extensiones). Antes estaban en Extensiones → Apps conectadas, que ahora solo lleva aquí.

- **Arriba**, si este equipo está enlazado con tu cuenta kywai (en kywai Cloud ya lo está) y cuántas acciones con
  apps llevas hoy, con **Comprobar** (vuelve a preguntar a cada app cómo está) y **Desenlazar** (solo en la
  instalación propia).
- **Conectadas**: cada app con su logo y su estado: **Conectada** (verde), **Hay que volver a conectarla** (amarillo,
  con su botón) o **A medias**. El interruptor **Puede actuar** deja que los agentes también creen y envíen (borrar
  sigue bloqueado) y **Desconectar** la quita (pide confirmación).
- **Conecta una app**: las más usadas y un buscador entre las más de 1.700 apps de Composio. **Conectar** abre la
  página segura del servicio en el navegador; al autorizar, la tarjeta se pone en verde sola en unos segundos (la
  pestaña mira cada 4 segundos, hasta 5 minutos).
- **Integraciones propias de kywai**: Instagram y TikTok (Zernio), Slack, Microsoft Teams, Telegram, WhatsApp y Mi
  YouTube, cada una con su estado. **Abrir** lleva a donde se configuran (Multimedia o Conexión), que no cambia.

**Cómo funciona por dentro.** La app habla con el portal de Mi cuenta (`src/main/connectors.ts`):
`GET /api/apps/conectores?q=&comprobar=1`, `POST /api/apps/conectar` (devuelve el enlace de Composio; solo se abren
enlaces `https://…composio.dev`), `POST /api/apps/desconectar` y `POST /api/apps/permiso`. En la instalación propia
va con el token del equipo enlazado (`kyl_…`); en kywai Cloud, con el secreto del espacio (`KYWAI_VOZ_SECRETO`), así
funciona aunque aún no haya ninguna app. Composio devuelve a la persona a `/api/apps/vuelta`, una página que solo dice
«vuelve a kywai»: la app comprueba ella misma con su token. Tras cada cambio, en la instalación propia se pone al día la
extensión `composio`; en la nube la avisa el portal. Los logos son solo los de `kywai.app/assets/composio/` (sin logo,
la inicial). La interfaz está en `src/renderer/src/ui/settings/ConnectorsTab.tsx`.

### Apps conectadas: Gmail, Drive, YouTube y más de mil apps con tu cuenta kywai

En **⚙ → Ajustes → Conectores** (antes Extensiones → Apps conectadas) tus agentes pueden trabajar con tus propias cuentas (Gmail, Google
Drive, YouTube, Instagram, TikTok, Google Calendar, Notion, GitHub y más de mil apps). No hace falta ninguna clave:
se hace a través de tu cuenta kywai (cuenta.kywai.app), que es gratis.

1. Pulsa **Enlazar con mi cuenta kywai**. Se abre Mi cuenta en el navegador con un código: comprueba que es el mismo
   que sale en kywai y pulsa **Enlazar este equipo**.
2. Pulsa **Conectar** en la app que quieras (o búscala), y autoriza tu cuenta en su página segura. kywai nunca ve tu
   contraseña. También se puede hacer en Mi cuenta → Apps conectadas.
3. La tarjeta se pone en verde sola (o pulsa **Comprobar**; también se comprueba cada 15 minutos). Tus apps
   llegan a Claude, Codex, Gemini y Hermes como la extensión **Apps conectadas** de «Servidores MCP». Hermes sabe qué
   apps tienes y, si pides algo de una que no está, te dice que la conectes.

- Por defecto los agentes **solo leen**. El interruptor **Puede actuar** (o **Permitir que actúe** en Mi cuenta) deja
  también crear y enviar (mandar un correo, publicar, subir un archivo). **Borrar está siempre bloqueado.**
- **50 acciones gratis al día** con kywai instalado en tu equipo, para probarlo y usarlo de vez en cuando. Vuelven a cero
  a las 00:00 UTC. Si se acaban, tus agentes te lo dicen. Para usarlo a diario: kywai Cloud (300 al día; Pro 1.000 y Max
  3.000) o créditos kywai: pasado el límite del día, cada crédito compra 3 acciones más, solo.
- **Desenlazar este equipo** lo quita aquí y en tu cuenta. También puedes desenlazar cualquier equipo en Mi cuenta →
  Apps conectadas → «kywai en tus equipos».

**Cómo funciona por dentro.** La clave de Composio (el servicio que conecta las apps) es de kywai y vive solo en el
portal de Mi cuenta: nunca llega a tu equipo. El enlace usa el mismo sistema de código corto que «Usar kywai cloud»
(`/api/conectar`, tipo `apps`) y deja en este equipo un token propio, cifrado con las claves de los agentes, que solo
vale para el intermediario `https://cuenta.kywai.app/mcp/apps` y para leer tu lista de apps (`/api/apps`). Con él se
registra la extensión MCP `composio` (la misma que usa kywai Cloud). El código está en `src/main/kywaiApps.ts`. En
kywai Cloud (`KYWAI_CLOUD=1`) no hace falta enlazar: la pestaña Conectores usa el secreto del espacio.

### Apps conectadas en kywai Cloud (Composio)

En kywai Cloud conectas tus propias cuentas (Gmail, Google Drive, YouTube, Instagram, TikTok, Google Calendar,
Notion, GitHub y más de mil apps) en **⚙ → Ajustes → Conectores** o en **Mi cuenta → Apps conectadas** (cuenta.kywai.app). Pulsas **Conectar**, se
abre la página segura del servicio, autorizas tu cuenta y vuelves a Mi cuenta. kywai nunca ve tu contraseña.

- Las apps llegan a tus agentes como la extensión **Apps conectadas** de ⚙ → Ajustes → Extensiones, encendida para
  Claude, Codex, Gemini y Hermes. Su nombre dice qué apps tienes, y el coordinador lo usa para repartir las tareas.
  Si pides algo de una app que no tienes, te dirá que la conectes.
- Por defecto los agentes **solo leen** (buscar correos, ver archivos, consultar el calendario). **Permitir que
  actúe** deja también crear y enviar (mandar un correo, publicar, subir un archivo). **Borrar está siempre
  bloqueado.** **Volver a solo leer** lo deshace.
- **Desconectar** quita la cuenta en Composio y tus agentes dejan de poder usarla. **Comprobar conexiones** vuelve a
  leer el estado si una cuenta caducó; entonces sale «Hay que volver a conectarla».
- Hay un límite diario de acciones con apps por cuenta (se ve en la misma página y vuelve a cero a las 00:00 UTC).

**Cómo funciona por dentro.** La clave de Composio de kywai vive solo en el portal de Mi cuenta. Tu espacio nunca la
recibe: habla con el intermediario `https://cuenta.kywai.app/mcp/apps` con un token propio de tu espacio, y el portal
reenvía cada llamada a tu sesión de Composio (con tu id de cuenta, nunca tu correo). Así los agentes de una persona no
pueden llegar a las cuentas de otra. El portal se lo comunica al espacio con `cloudSetConnectedApps`, que solo acepta
llamadas directas del portal. En la instalación propia (self host) esta sección no existe todavía.

### Amigos en kywai Cloud

En kywai Cloud cada cuenta tiene un **ID de kywai** de 8 caracteres (por ejemplo `7KQ4-M2XP`). Con él otras personas
te añaden de amigo, tú aceptas o rechazas, y luego os escribís. Está en la barra lateral, botón **Amigos** (con un
número cuando hay solicitudes o mensajes sin leer), y también en **Mi cuenta → Amigos** (cuenta.kywai.app). Los dos
sitios ven lo mismo.

- **Tu ID de kywai**: púlsalo para copiarlo y pásaselo a quien quieras tener de amigo.
- **Añadir**: escribe el ID de tu amigo (da igual con guion o en minúsculas). Le llega la solicitud y, si lo tiene
  activado, un correo con el botón «Ver la solicitud».
- **Te quieren añadir**: Aceptar o Rechazar. Si rechazas, la otra persona no lo sabe y no puede volver a pedirlo en 30
  días.
- **Tus amigos**: pulsa uno para abrir la conversación. Enter envía y Mayús+Enter salta de línea. Los mensajes nuevos
  llegan solos (se miran cada 4 segundos con el panel abierto).
- **Archivos**: el clip junto al mensaje adjunta un archivo de hasta 100 MB (también se puede pegar). Puedes escribir un
  texto con él o mandarlo solo, y verás el porcentaje mientras sube. Las imágenes se ven en la conversación y todo se
  descarga con un clic. Se guardan 30 días; después el mensaje dice «Ya no está». Cada cuenta puede tener 500 MB de
  archivos enviados a la vez y mandar 50 al día.
- **Quitar** deja de ser amigos y borra la conversación para los dos. No se le avisa. También borra los archivos.
- **Avisarme por correo de las solicitudes nuevas** se puede apagar.
- **Aviso de mensajes nuevos** (desde la 1.35.0): cuando un amigo te escribe o te manda una solicitud, el número rojo
  del botón **Amigos** sube y late un momento, y suena la **marimba de amigos** (tres golpes de madera que suben,
  distinta de la campanita de «Te necesita»). Se mira cada 10 segundos, y cada 30 con kywai minimizado o en otra
  pestaña. Va por el canal de **efectos**: si los silencias o bajas su volumen, también calla o baja; y respeta el
  «Silencio de noche» de los avisos. No suena por lo que ya esperaba al abrir kywai, ni por la conversación que tienes
  abierta delante, y varios mensajes seguidos suenan una vez. Con kywai en segundo plano, la app de escritorio enseña
  además un aviso de Windows o del Mac con el nombre del amigo (nunca el texto); al pulsarlo se abre su conversación.
  En el navegador, la pestaña lleva delante el número («(2) kywai») y el sonido solo puede sonar después de un primer
  clic en la página.
- Límites: 300 amigos, 30 solicitudes sin responder, 20 solicitudes al día, mensajes de hasta 2.000 caracteres y 30
  mensajes por minuto.

En la instalación propia (self host) no hay cuentas, así que el botón no sale.

**Cómo funciona por dentro.** Los amigos y los mensajes viven en el portal de Mi cuenta (`portal/amigos.py` de
kywai-cloud). La app los pide desde el servidor de tu espacio (`src/main/friends.ts`) a
`https://cuenta.kywai.app/api/amigos`, con el mismo secreto de espacio que usa la voz incluida (`KYWAI_VOZ_URL` y
`KYWAI_VOZ_SECRETO`). Si no están, `friendsState` responde `available: false` y el botón no aparece. El panel es
`src/renderer/src/ui/sidebar/FriendsDialog.tsx`; el número del botón, la marimba y el aviso del sistema los lleva
`src/renderer/src/lib/friendsAlert.ts` (compara los `sin_leer` de cada amigo y las solicitudes entre una mirada y la
siguiente; el sonido es `friendMessage` en `lib/audio.ts`). Los archivos pasan por el servidor del espacio sin guardarse en él:
`POST /api/amigos-archivo/<ID>?nombre=…` reenvía el cuerpo al portal y `GET /api/amigos-archivo/<ID>/<n>` reenvía la
descarga (`webServer.ts`). El portal los guarda en `amigos-archivos/` y los sirve siempre con CSP `sandbox` y `nosniff`.

### Proyectos compartidos con amigos (kywai Cloud)

Un proyecto se puede compartir con amigos de tu lista. **Cada uno tiene su propia copia** en su espacio y se
sincronizan solas cada pocos segundos, así que cada uno puede trabajar aunque el otro no esté: lo que haces mientras tu
amigo está apagado le llega cuando vuelve.

- **Compartir**: clic derecho (o ⋯) en el proyecto → **Compartir con un amigo…**. Marca a quién, elige el permiso
  (**Colaborar** o **Solo ver**) y **quién lanza tareas**:
  - **Con mi aprobación** (viene así): lo que escribe un amigo llega a tu chat con su nombre y su cara, sin lanzar nada.
    Debajo salen **Lanzar** y **No lanzar**, y también te sale en la campana «Te necesita» (y en Órbita). Si la lanzas,
    corre en tu espacio, con tus agentes y tus créditos, y Hermes sabe que la pidió tu amigo. Tu amigo ve bajo su
    mensaje si sigue esperando, si la lanzaste o si no. Solo el dueño puede decidir: Mi cuenta lo comprueba.
  - **Cualquier colaborador**: cada colaborador lanza tareas en su propia copia.
- **Invitación**: al amigo le sale en **Amigos → Te invitan a un proyecto** (el botón Amigos suma las invitaciones).
  Al aceptar se crea su copia y se abre; los mensajes y archivos van llegando en unos segundos.
- **Qué viaja**: los mensajes terminados del chat (los tuyos y las respuestas de los agentes) y los archivos del
  proyecto (entregables y adjuntos, hasta 100 MB cada uno). En la barra lateral el proyecto lleva un icono de personas.
- **Cada tarea corre en el espacio de quien la lanza**, con sus agentes, sus cuentas y sus créditos. Nadie gasta la
  suscripción del otro.
- **Si los dos cambian el mismo archivo a la vez** no se pisa nada: cada uno conserva el suyo y recibe el del otro al
  lado, como `diseño (copia de Marta).png`. Si solo lo cambió uno, se sustituye sin copias.
- **Gestionar**: en el mismo menú, **Compartido: ver quién está…** enseña quién está dentro o invitado, deja cambiar su
  permiso, quitarle o **Dejar de compartir**. Un invitado ve quién lo compartió y puede **Salir del proyecto**. En
  todos los casos cada uno conserva su copia, que deja de sincronizarse.
- **Quitar a un amigo** de Amigos también le saca de los proyectos que le compartías.
- **Topes por plan**: kywai Cloud 1 proyecto compartido con 2 amigos; Pro 5 con 5; Pro Max 20 con 15.

**Cómo funciona por dentro.** El portal de Mi cuenta (`portal/compartidos.py` de kywai-cloud) guarda quién está en cada
proyecto y hace de buzón: una lista ordenada de cambios (`mensaje`, `archivo`, `proyecto`) y los archivos por su huella
SHA-256 (`compartidos-archivos/`, como mucho 2 GB por proyecto). La app (`src/main/sharedProjects.ts`) cada 10 s manda
lo nuevo de su copia y recoge lo de los demás desde el último número que vio (`shared.seq` en `project.json`); lo ya
mandado se apunta en `compartido.json` dentro de la carpeta del proyecto. Lo que llega lleva `sharedFrom` y nunca se
vuelve a mandar. Un archivo nuevo lleva la huella de la versión de la que partió (`base`): si coincide con la de aquí
se sustituye y si no, se guarda como copia. En «Con mi aprobación», `sendMessage` de un invitado se queda en
`holdForApproval` (mensaje sin petición). Usa el mismo secreto de espacio que Amigos. La ventana es
`src/renderer/src/ui/sidebar/ShareProjectDialog.tsx`.

### Pasar de tu self host a kywai Cloud sin perder nada

Si usas kywai en tu propio equipo y te pasas a kywai Cloud, **⚙ → Ajustes → General → Tus datos → Pasar a kywai cloud → Empezar…**
lo lleva todo a tu espacio de la nube. Esta instalación no se toca: si algo falla, sigue como estaba.

1. La ventana dice cuánto ocupa y deja quitar las **carpetas de trabajo** de tus proyectos que pesen mucho (un repo, una
   carpeta del disco). Las que no se pueden llevar (tu carpeta de usuario entera, la raíz del disco) salen marcadas.
2. Pulsas **Pasar a kywai cloud**: se abre Mi cuenta en el navegador con un código; inicias sesión y confirmas. Es el
   mismo enlace que «Usar kywai cloud» (sin IP ni código de acceso).
3. Si no cabe en tu espacio, te lo dice antes de subir nada (amplíalo en Mi cuenta o quita alguna carpeta).
4. Se sube cifrado, a trozos; si se corta la red, repite ese trozo.
   Si tu espacio se reinicia a mitad de la subida (antes salía «Este paso ya no está abierto: vuelve a empezar»), la
   ventana espera a que vuelva y empieza la subida otra vez ella sola, hasta 2 veces (1.30.35).
   Desde la 1.30.56 la subida es **reanudable**: si se corta la red o el espacio se reinicia, la ventana dice «Esperando a
   que vuelva…» y sigue desde el último trozo que llegó, sin volver a subir lo demás. Mientras sube, el equipo no se
   duerme (la pantalla sí puede apagarse).
5. Tu espacio comprueba cada archivo, guarda una copia de lo que ya tenía en las rutas que se pisan, se reinicia y lo
   coloca todo. Al final ves la tabla **«En tu self host / En kywai cloud»**: proyectos, chats, mensajes, adjuntos, notas
   de memoria, rutinas, habilidades, agentes, claves y archivos, con un ✓ en cada fila.

**Qué pasa y qué no.**

| Cómo | Qué |
| --- | --- |
| Tal cual | Proyectos, chats, adjuntos, entregables, memoria, habilidades, rutinas, agentes, ajustes, tablero, plantillas, mods, plugins, y de Hermes su memoria, SOUL.md y skills |
| Si quieres | Las carpetas de trabajo de los proyectos (van a `~/proyectos/<nombre>` del espacio y el proyecto se apunta ahí) |
| Se vuelven a cifrar | Claves de API, secretos de proyectos, extensiones (MCP) y tokens de Instagram y TikTok |
| Vuelves a entrar | Claude, Codex y Gemini (Mis agentes): copiar su sesión haría que dos equipos se pisaran al renovarla |
| Nada que hacer | Apps conectadas: ya están en tu cuenta kywai |
| No se llevan | El código de acceso, los equipos emparejados, la llave del móvil, el registro de accesos y las cachés |

**Claves de API en la nube (25 nov 2026).** En tu equipo, la clave de un agente se guarda con su id (`deepseek`); en la
nube, como `cloud:<id>`. Antes llegaban con el nombre de tu equipo y la nube no las veía, así que cada agente volvía a
pedir su clave. Ahora, al arrancar el espacio, `adoptMovedKeys` (`src/main/clavesMudadas.ts`) pasa cada una (y la de
reserva de OpenRouter de Hermes) a su nombre de la nube, salvo que la nube ya tenga una suya. Claude, Codex y Gemini con
tu cuenta siguen pidiendo volver a entrar (tabla de arriba).

**Hermes con el OmniRoute de tu equipo, desde la nube.** En «Configura Hermes» → OmniRoute, la ventana enseña el panel
y la contraseña del OmniRoute de tu ordenador, pero dentro del espacio `localhost:20128` es el OmniRoute del propio
espacio, que no conoce la clave de tu ordenador («No aceptó esa clave»). Ahora, sin dirección o con `localhost:20128`,
«Comprobar ahora» y «Guardar y probar» van por el relevo (`127.0.0.1:20129`, `cloudHermesOmniRoute` en
`src/main/omniroute.ts`) sin clave; si tu ordenador no presta su OmniRoute, la ventana pide encender «Conectar kywai
cloud con este PC». Una dirección pública se usa tal cual.

**Cómo funciona por dentro.** `src/main/mudanza.ts` (sin Electron, lo usan los dos lados): junta lo que se lleva, lo
escribe como un paquete de registros `[cabecera][bytes][SHA-256]` y lo parte en trozos de 16 MB cifrados con
AES-256-GCM. La clave es de un solo uso: la da el espacio al empezar y solo vive en su memoria. Las claves de este equipo
se descifran solo en memoria y viajan dentro del paquete cifrado; el espacio las vuelve a cifrar con su llave antes de
tocar el disco, y nunca salen en registros. La self host (`src/main/mudanzaEnvio.ts`) se enlaza con el tipo `mudanza` de
`/api/conectar` (el portal le dice además cuánto ocupa ya el espacio) y sube a `/api/mudanza/…` del espacio
(`src/main/mudanzaNube.ts`, solo con `KYWAI_CLOUD=1`). Lo recibido espera en `~/.kywai-mudanza/<id>/`; kywai sale con el
código 75, `entrada.sh` lo vuelve a abrir en el mismo contenedor y, antes de cargar ajustes y proyectos, se coloca todo,
se reescriben las rutas (también las de Windows) y se cuenta lo que llegó. La copia de lo que el espacio tenía queda en
`~/.kywai-mudanza/<id>/copia-previa/`.

**Que una actualización no corte la subida (1.30.35).** La clave del paso solo vive en la memoria del espacio, así que un
reinicio a mitad lo pierde. Por eso, mientras un paso recibe trozos (o se está comprobando), `MoveReceiver.active()` lo
cuenta y `ocupado.json` (`cloudBusy.ts`) lleva el motivo `mudanza`: el despliegue (`desplegar-cuenta.py`) lo trata como
ocupado. Además, un espacio cuya web nadie ha abierto nunca (`ultimoUso` vacío, lo normal en quien sube desde su
escritorio) ya no cuenta como «24 h sin uso» hasta que la versión lleve 24 h esperando. Si aun así se pierde el paso,
`part`/`terminar` contestan **410** y la self host espera a que el espacio vuelva y empieza de nuevo (hasta 2 veces).

**Subida reanudable (1.30.56).** Al empezar, el espacio guarda la clave del paso en `~/.kywai-mudanza/<id>/clave.json`,
cifrada con su llave, así que un reinicio ya no pierde el paso. `GET /api/mudanza/<id>/partes` dice qué trozos tiene; la
self host vuelve a generar el paquete, comprueba que cada trozo es igual que el que mandó (huella SHA-256 antes de
cifrar; si algo cambió en el equipo, empieza de nuevo) y solo sube los que faltan. Tras un corte espera hasta 15 minutos
a que el espacio conteste y lo intenta hasta 30 veces. `powerSaveBlocker` (`prevent-app-suspension`) evita que el equipo
se duerma mientras dura. Al «terminar», el espacio guarda `terminar.json` (manifiesto y recuentos) y, si hay sitio, deja
los trozos hasta el final de la comprobación: si se reinicia mientras comprueba, `resumeChecks()` vuelve a comprobar al
arrancar; si ya no puede (faltan trozos), el paso queda en error con «Tu espacio se reinició mientras comprobaba lo
subido» en vez de esperar callado. La self host espera 15 minutos más uno por GB a que termine.


**Sin actualizar a mano (1.30.57, retirado en la 1.30.63).** Ya no se hace: el espacio solo se reinicia si su dueño
pulsa «Actualizar ahora» (ver «Nada reinicia el espacio sin el botón»). Lo de antes, por si se ve en un espacio viejo: si el servidor dejó una versión nueva esperando para el espacio (`actualizacion-pendiente.json`)
y no hay ningún paso abierto, `POST /api/mudanza/empezar` pide «Actualizar ahora» y contesta 503 con `updating: "<versión>"`.
La app del equipo dice «Tu espacio se está poniendo al día…», espera (cada ~20 s, hasta 60 veces) y vuelve a empezar sola. Si
la versión no llega en 20 minutos, el paso se abre igual con la de ahora. La ventana «Pasar a kywai cloud» también avisa si
la propia app tiene una versión nueva y la pone con un botón, y la ventana Actualizaciones de un espacio en la nube explica
que la app del ordenador se actualiza aparte (cliente: Ajustes → Acerca de → «Actualizar este equipo»).
### Modelo recomendado según tu equipo (agente local)

**Archivos que cambian mientras sube (25 nov).** La self host sigue viva durante horas de subida: un archivo puede borrarse,
encogerse o no dejarse leer (macOS sin permiso, iCloud sin descargar) entre que se miró y que le toca. Antes eso paraba la
subida entera con un error (`ENOENT…` o «Un archivo cambió mientras se copiaba»), que es lo que dejó a una usuaria con 6 GB
de 15,6 subidos. Ahora `packRecords` abre cada archivo y toma su tamaño en ese momento; lo que no se puede abrir se salta,
lo que encoge mientras se lee se completa con ceros, y la ventana dice cuántos archivos fueron. Además, la lista de lo que
se lleva ya no usa `push(...lista)`, que reventaba la pila con más de ~120.000 archivos. Probado de punta a punta con 16 GB
y 200.000 archivos, y con archivos borrados a mitad (el código anterior se paraba en seco con `ENOENT`). El portal ya no
para la mudanza por la cuota «usada» (incluye trozos de un intento anterior): solo si no cabría ni con el espacio vacío.

**Nada reinicia el espacio sin el botón y la subida sigue donde iba (1.30.63).** El 25 nov el reintento de una usuaria
reinició su espacio (06:49Z, apuntado como «boton» en el servidor) porque `empezar` pedía «Actualizar ahora» por su cuenta
(1.30.57). Regla de Yil: **el espacio de la nube solo se reinicia si su dueño pulsa «Actualizar ahora»**. Por eso:
- `empezar` ya no pone al día el espacio: abre el paso con la versión que tenga.
- El despliegue de la nube ya no cambia solo los espacios «24 h sin uso» ni los de la app antigua «libres»; esperan al
  botón (Kywai-Cloud, `update_decision` / `decide_target`). Solo se cambian ya los apagados y los del botón.
- La subida va en trozos que, pasada la mitad de su tamaño, se cortan justo antes del archivo siguiente (`markedParts`): casi
  todos empiezan con un archivo entero. Tras un corte se sigue desde el último de esos que no pasa del primero que falta
  (`resumePoint`), comprobando con una huella que la lista de archivos de antes es la misma. Antes, si cualquier archivo ya
  mandado había cambiado en el equipo (kywai abierto escribe sin parar), el paso se tiraba y se volvían a subir todos los GB.
- El paso abierto se guarda en memoria aunque la subida se pare con un error: «Volver a intentarlo» sigue con él (si no
  cambió lo elegido). Si se cierra la app, se empieza otro.
Probado de punta a punta con el espacio reiniciándose a mitad y chats ya mandados cambiados: termina sin volver a empezar.

**Esperar a que el espacio compruebe sin tope fijo (1.31.1).** 25 nov, Elizabeth con la 1.31.0: la subida y «terminar» fueron bien, pero tras ~47 min de «Tu espacio comprueba cada archivo…» el Mac dijo «Tu espacio tarda demasiado en terminar» mientras el espacio seguía desempaquetando (16 GB y ~1 millón de archivos tardan más). Y «Volver a intentarlo» abría otro paso, lo que borraba lo que el espacio estaba comprobando. Ahora:
- El Mac espera mientras el espacio conteste («comprobando», «colocando»), sin tope. Solo se rinde si el espacio no contesta nada en 30 min.
- «Volver a intentarlo» después de subir entero sigue esperando el mismo paso (`finishing` en mudanzaEnvio.ts), no vuelve a subir.
- El espacio no abre otro paso (409, «aún está terminando la mudanza anterior») mientras uno se comprueba o espera a colocarse (`inProgress()` en mudanzaNube.ts).

**«Terminar» con muchísimos archivos y la causa real de un corte (1.31.0).** 25 nov: la mudanza de Elizabeth subía los 1898 trozos enteros y aun así salía «Tu espacio se reinició a mitad de la subida». El espacio no se había reiniciado: lo que fallaba era la última petición, «terminar», que llevaba dentro la lista de TODOS los archivos de una vez; con muchísimos archivos esa petición no entraba (el espacio corta las de más de 256 MB; reproducido con 1 millón de archivos: «terminar» de 315 MB, 31 intentos y «se reinició») y la app la repetía 30 veces en ~8 minutos y lo explicaba como un reinicio. Ahora:
- La lista de archivos va a trozos de ~8 MB (`PUT /api/mudanza/<id>/lista/<n>`) y «terminar» solo dice cuántos (`listParts`). Un espacio de antes contesta 404 a esa ruta y la lista va entera, como antes.
- «terminar» tiene 10 minutos para contestar (antes 60 s).
- Los cortes se cuentan solo si van seguidos sin avanzar: si llega algún trozo entre uno y otro, la cuenta vuelve a cero. Entre intento e intento se espera más cada vez (5 s, 10 s… hasta 2 min).
- Un 401/403 al preguntar por los trozos (equipo quitado de la cuenta) se dice tal cual en vez de esperar.
- Al pararse, el aviso dice la causa real («La subida se paró: <causa>. Pulsa «Volver a intentarlo»…»). «Se reinició» solo sale si el espacio de verdad perdió el paso (410).
- Registro en el equipo: `mudanza-envio.log` en la carpeta de datos de kywai (en Mac, `~/Library/Application Support/<carpeta de kywai>/`). Apunta cada corte con su causa y fase, el inicio y la respuesta a «terminar». Solo datos técnicos, sin nombres de archivos; no pasa de ~1 MB (guarda uno anterior `.1`).

**Fusionar o reemplazar (1.30.64).** Yil, 25 nov: al pasar de self host a la nube la ventana pregunta qué hacer con lo
que ya hay en el espacio.
- **Fusionar** (la de siempre, marcada por defecto): llega todo y se queda lo de la nube. Si un archivo está en los dos
  sitios, gana el que llega y el de la nube va a la copia previa; ajustes y claves se juntan.
- **Reemplazar**: pide marcar «Entiendo que lo de la nube se sustituye por lo de aquí». El modo viaja en `empezar`
  (`mode`), se guarda en `plan.json` y se aplica al colocar, cuando la subida ya llegó entera y se comprobó: antes de
  `placeMove`, `clearForReplace` aparta a `copia-previa` (mismas raíces del paquete: `datos/`, `secretos/`, `workspace/`,
  `hermes/`, más `proyectos/` para las carpetas de `~/proyectos` y una copia de `ajustes/config.json`) todo lo que una
  mudanza llevaría. Se queda lo que es del propio espacio: el acceso web, la cara y la carpeta de proyectos de los ajustes,
  `mobile-key`, `web-cert`, las instalaciones del estudio de vídeo y los archivos de datos que no viajan. Deja
  `reemplazo.json` en la copia previa para no repetirse si kywai se reinicia colocando. Las claves que llegan no se juntan
  con las de la nube (las de la nube quedan en la copia previa). Cuenta, créditos y plan no se tocan (viven en Mi cuenta).
- Sin `mode` (una self host anterior) es fusionar. Cambiar de modo abre otro paso (es parte del plan de la subida).

Antes de elegir modelo, la configuración del agente local (su indicador de cuota) mira **el equipo donde va a correr**:
este mismo o, en kywai Cloud, el PC que presta sus modelos. Enseña en una línea la RAM, la tarjeta gráfica (NVIDIA con su
memoria, o el chip de Apple con memoria unificada) y el disco libre, y recomienda el **modelo de Ollama más capaz que va
con soltura** (familia Qwen3, de 1,7B a 32B):

- **NVIDIA de 5 GB o más**: cuenta la memoria de la tarjeta (8 GB → `qwen3:8b`, 12 GB → `qwen3:14b`, 24 GB → `qwen3:32b`).
- **Mac con Apple Silicon**: unos 2/3 de la memoria unificada (16 GB → `qwen3:8b`, 24 GB → `qwen3:14b`, 32 GB o más → `inkling-2-mini`).
- **Inkling 2 Mini** (Thinking Machines, Apache 2.0, 20 nov 2026): 26B con 3,4B activos, 1M de contexto y el mejor en
  código de los modelos abiertos de menos de 100B. Ollama lo sirve con MLX, así que kywai solo lo ofrece en un Mac con
  32 GB o más (unos 20 GB de descarga); en Windows, Linux o NVIDIA no sale en la lista.
- **Gall en un Mac de 24 a 31 GB** (23 nov 2026): ahí Inkling 2 Mini no cabe con Ollama, pero sí con la app gratuita
  [Gall](https://github.com/ltrgoddard/gall) (MIT), que lo sirve comprimido (unos 13 GB) y suelta la memoria un segundo
  después de cada respuesta. La recomendación lo dice con un enlace; al abrir Gall, kywai la encuentra sola en la
  tarjeta de Colibri («Encontrados en este equipo», puerto 9940) y con «Usar» el agente local trabaja con ella.
- **Sin tarjeta compatible** (o AMD/Intel): corre en el procesador; evita los modelos densos grandes, que irían lentos,
  y con mucha RAM prefiere `qwen3:30b` (mezcla de expertos, rápido sin tarjeta).
- Si el disco no tiene sitio para la descarga, ese tamaño sale «Sin espacio». Con menos de ~5 GB útiles avisa de que
  para tareas grandes es mejor un agente en la nube.

«Ver los demás tamaños» lista todos con «Recomendado», «Cabe», «Lento aquí», «No cabe» o «Sin espacio»; pulsar uno
lo deja listo para descargar. El cálculo está en `src/shared/modelAdvisor.ts` y la detección en `src/main/hardware.ts`
(`nvidia-smi`, el chip del Mac y el disco de la carpeta personal; se mira como mucho cada 10 minutos).

### Conectar kywai cloud con este PC (1.17)

Un solo interruptor en la **app de escritorio**: **⚙ → Ajustes → Este PC → «Conectar kywai cloud con este PC»**. Con él
encendido, lo pesado que pidas en la web o en el móvil lo hace tu equipo, gratis y con su potencia: los **modelos de IA**
(Ollama, LM Studio, Colibri), las **imágenes** (Draw Things, ComfyUI), los **vídeos** (el estudio de vídeo del equipo) y
la **instalación de programas**. Junta los dos ajustes de antes («Prestar los modelos de este equipo» y «Hacer aquí los
vídeos de kywai cloud»); con **«Elegir qué hace»** puedes dejar solo una de las dos partes. Debajo sale **«Tu PC: …»** con
lo que tiene (procesador, memoria y tarjeta gráfica) y una frase de lo que da de sí. **No hay reglas de «este equipo no
sirve»**: cualquier equipo con la app puede ayudar; lo que cambia es cuánto tarda, y la nube queda siempre de respaldo.

- **Si el equipo se apaga a mitad** o falla un vídeo, kywai lo sigue en la nube («Tu equipo no pudo terminarlo (…): lo
  sigo en la nube»). Los vídeos se mandan solos al equipo conectado salvo que en Multimedia elijas «Estudio» de la nube.
- **Varios equipos a la vez** (1.17.2): con el Mac mini, el MacBook y el PC conectados, cada parte del pedido (cada
  imagen, cada vídeo) va al que **antes la terminaría**: lo que se espera que tarde por su potencia (al principio por la
  tarjeta gráfica, la memoria y los núcleos; después, lo que tardó de verdad en sus últimos trabajos) multiplicado por lo
  que ya tiene en cola, y un poco más si la persona lo está usando (`src/shared/pcPower.ts`, `deviceBridge.best`). Las
  imágenes de un vídeo se reparten entre todos los equipos que pueden dibujar. Escribe **`/equipos`** para ver cuáles hay,
  qué hace cada uno, sus programas y lo que tarda de verdad.
- **Instalar programas** (1.17.1): si una tarea sale mejor con un programa, Hermes te pregunta con botones y, si dices que
  sí, lo instala en el equipo con **`/instalar <programa> [en <equipo>]`** (también lo puedes escribir tú). Hay un
  catálogo de más de 50 programas (Blender, Krita, GIMP, Inkscape, ComfyUI, Audacity, OBS, FFmpeg, Ollama, LM Studio…,
  `src/shared/programCatalog.ts`) y, fuera de él, paquetes de los gestores oficiales: `winget:Id` (Windows),
  `cask:nombre` / `brew:nombre` (Mac; sin Homebrew, kywai se pone uno propio en `~/.kywai/homebrew` sin contraseña para
  las aplicaciones), `flatpak:id` (Linux, `--user`). Lo de fuera del catálogo se comprueba en su gestor antes de
  instalar; nunca se ejecuta un enlace ni una orden que venga de la nube. Una instalación a la vez por equipo.
- **kywai se adelanta** (1.17.3): tras una imagen o un vídeo, si había una forma mejor (encender el interruptor, usar «Mis
  modelos locales» en vez de créditos, o instalar ComfyUI en un equipo con tarjeta gráfica fuerte), lo propone una vez,
  con la orden lista (`src/shared/workflowTips.ts`; la misma propuesta no vuelve en 3 días por proyecto).
- Por dentro: la app manda en cada consulta del puente sus programas (`programs`) y los segundos sin uso (`idleSec`); una
  app antigua que recibe un 400 repite sin esos campos. El trabajo nuevo `install` del puente solo acepta un id del
  catálogo o un paquete con formato válido, y la app lo vuelve a comprobar (`validProgramRef`).

### Modelos de tu equipo en kywai Cloud (agente local)

kywai Cloud no tiene tarjeta gráfica ni disco para modelos, pero tu PC sí. Desde la **app de escritorio** conectada con
«Usar kywai cloud», tu equipo puede **prestar a tu espacio sus modelos locales** (Ollama, LM Studio o Colibri, y
cualquier servidor compatible con OpenAI que Colibri use por su dirección: llama.cpp, MLX, llama-modchip…). El agente
local trabaja en el mismo equipo que Claude, Codex o Hermes, pero el modelo corre en tu máquina.

**Lo más fácil (automático):** en la app de escritorio, **Añadir un agente → «Modelo local»** (tarjeta «En tu equipo ·
Gratis») y ya está. kywai enciende el préstamo y mira el hardware de tu PC. **Si ya tienes modelos** (en Ollama, LM
Studio o Colibri), no elige por ti: el aviso de abajo a la derecha los lista todos, de cualquier programa, con
**«Sugerido»** en el que mejor le va a tu equipo (y «No cabe» o «Lento aquí» en los que no), y tú eliges cuál usa el
agente; con Ollama encendido, el modelo recomendado sin descargar sale como una opción más («Descargar y usar»). Si LM
Studio está instalado pero con su servidor apagado, la app lo **enciende sola** (`lms server start`). Solo si no hay
ningún programa de modelos **instala Ollama** (la app pregunta una sola vez, con su ventana propia) y **descarga el
modelo que le va bien**. El aviso dice por dónde va (con el % de la descarga) y, si el espacio no ve tu PC, el motivo
que da la app. Si algo falla, el botón
**«Prepararlo todo»** de la configuración del agente local lo vuelve a intentar desde donde se quedó.

Paso a paso (si prefieres hacerlo tú):

1. En la app de escritorio, **⚙ → Ajustes → Este PC → «Conectar kywai cloud con este PC»** (apagado de serie; ver la sección
   siguiente). Los chips de debajo dicen qué motores están abiertos.
2. **Añadir un agente → «Modelo local»** (tarjeta «En tu equipo · Gratis»).
3. En su indicador de cuota (agente local), el motor dice **«corre en tu equipo «<nombre>»»**. Debajo, la tarjeta
   **«Lo que le va a «<nombre>»»** enseña la memoria, la tarjeta gráfica y el disco libre de tu PC y **recomienda el
   modelo que le va bien** (ver «Modelo recomendado según tu equipo»). Con Ollama, **Descargar** lo baja en tu PC desde
   la nube (solo los modelos recomendados; otros, con `ollama pull …` allí); con LM Studio o Colibri, búscalo de tamaño
   parecido en su app. Elige el modelo y «Usar este modelo».
4. Si apagas el PC o cierras la app, el agente sale como **«Tu equipo no está conectado…»** y Hermes reparte su trabajo
   a los demás. Al volver, se pone disponible solo en unos segundos.

**Varios equipos con la misma cuenta (PC y MacBook)** (1.9.1): si prestas tus modelos desde más de un equipo, la nube
usa **el que tienes delante**: cada app dice cuántos segundos lleva el equipo sin tocar teclado ni ratón (`idleSec` en la
consulta del puente) y gana el que se usó hace menos; con apps antiguas, el último que se conectó. Cada agente local
**guarda su programa y su modelo por equipo** (`onDevices` en su configuración, `src/main/localByDevice.ts`): al pasar
al MacBook usa lo que elegiste allí; si no elegiste nada, lo que ya usaba si también está, y si no, lo mejor que haya
encendido en ese equipo (el modelo que le cabe). Lo del PC queda guardado y **vuelve solo al volver al PC**. Al cambiar
sale el aviso **«Ahora usas <equipo>»** con lo que usa cada agente local y «Elegir otro modelo» (o «Prepararlo en este
equipo» si allí no hay nada encendido). Las imágenes con «Mis modelos locales», los vídeos hechos en tu equipo y el
`/demo` también van al equipo que tienes delante. Si abres la app en un equipo que aún no presta sus modelos mientras el
agente local usa los de otro, **la primera vez se configura solo** (`adoptThisDevice`): enciende el préstamo en ese
equipo y la nube pasa el agente a lo mejor que tenga para su hardware; si allí no hay ningún programa de modelos
encendido, enciende LM Studio si está o propone el programa que mejor encaja (instalarlo pide permiso una vez). Si
después apagas el préstamo en ese equipo, ya no se enciende solo: sale **«Estás en <equipo>»** con «Usar los de este
equipo» (la «X» no lo vuelve a ofrecer allí).

Seguridad y privacidad:

- **No se abre ningún puerto en tu casa**: la conexión sale de tu PC hacia tu espacio, como una web normal, con la
  llave de dispositivo de la app (se quita en Mi cuenta → Seguridad o con «Olvidar este dispositivo»).
- **Tu PC solo hace peticiones al modelo**: una lista cerrada (Ollama: leer modelos, `/api/chat` y `/api/pull` solo
  para los modelos recomendados; LM Studio y Colibri: `/v1/models` y `/v1/chat/completions`), siempre a `127.0.0.1`.
  Nada de archivos, órdenes ni otros equipos de tu red. La nube comprueba lo mismo por su lado. Para recomendar un
  modelo, el PC manda además su RAM, su tarjeta gráfica, su procesador y el disco libre (solo cifras y nombres de chip).
  Las descargas no hacen esperar a las tareas.
- Los **archivos del proyecto se quedan en la nube**: leer, buscar y escribir los hace el espacio, como con un motor
  local normal. A tu PC solo viaja el texto de la petición al modelo, cifrado, sin pasar por ninguna empresa de IA.
- Una petición a la vez (un equipo normal no da para más), hasta 4 MB por petición; Colibri puede tardar hasta 15 min
  en cargar un modelo grande y el puente espera.
- LM Studio carga los modelos con poco contexto de fábrica y desde la nube no se puede recargar: súbelo en LM Studio
  (Contexto 32 768) si el modelo se queja del contexto.

Para desarrolladores: el espacio guarda el equipo y sus motores en `DeviceBridge` (`src/main/deviceBridge.ts`); la app
consulta `POST /api/mobile/v1/bridge/poll` (espera hasta 25 s, solo dispositivos de tipo `client`) y devuelve cada
respuesta a trozos con `POST /api/mobile/v1/bridge/reply/<id>` (`status`, `chunk`, `done`, `error`, `alive` cada 20 s).
Sin noticias en 45 s el equipo se da por desconectado; una petición sin trozos en 60 s, por perdida. En la nube
(`KYWAI_CLOUD=1`) `runAgentRaw` y `checkAgentPresence` mandan los agentes locales a `src/main/agents/bridged.ts`
(Ollama con `runOllama(opts, fetch del puente)`; LM Studio y Colibri con `runOpenAiLocal` y `backend.post`), y
`listLocalEngines` devuelve lo que dice el equipo (`bridge: true`, `device`). La app: `src/main/bridgeClient.ts`
(rutas en `BRIDGE_ROUTES`, `loopbackUrl` lleva cualquier dirección a 127.0.0.1), interruptor guardado en
`prestar-modelos.json` de la carpeta de la app (`client:lendState`, `client:setLending`). Caddy no cambia: el camino
`@device` ya deja pasar la llave de dispositivo.

### Copia de seguridad: guardarla y volver a cargarla

En **Ajustes → General → Tus datos → Copia de seguridad** hay dos botones:

- **Guardar copia…** escribe un archivo `.kywai` donde elijas (por defecto en Documentos, `kywai-copia-<fecha>.kywai`).
  Lleva lo mismo que «Pasar a kywai cloud»: proyectos, chats, adjuntos, memoria, habilidades, rutinas, agentes,
  ajustes de la interfaz, plugins, mods y lo tuyo de Hermes (memoria, SOUL.md y skills). Las carpetas de trabajo de
  los proyectos ya están en tu disco, así que por defecto no van; se pueden marcar una a una.
  - **Con contraseña** (8 caracteres o más) la copia va cifrada (AES-256-GCM, clave sacada de la contraseña con
    scrypt) y lleva también tus claves de API y secretos. Si se olvida la contraseña no hay forma de abrirla.
  - **Sin contraseña** las claves y secretos no van; la copia lleva su propia clave solo para comprobar que nada se
    ha estropeado.
  - Se escribe primero a un `.tmp` y se renombra al final: una copia cortada nunca pisa a otra buena.
- **Mientras se guarda** (desde la 1.30.31): primero «Preparando: N archivos mirados (tamaño)…» con una barra que va y viene,
  luego «Guardando: X de Y · N % · quedan unos M min» con la barra llenándose. Las carpetas de trabajo que no se
  marcaron ya no se recorren al guardar (`collectMove(src, { skipWork, onFile })`): antes se miraban todas, que pueden
  ser muchos GB, y la ventana se quedaba en «1 KB de 1 KB» sin moverse. Encima de la lista de carpetas hay
  **Seleccionar todo** (con su tamaño total).
- **Cargar copia…** elige un `.kywai`, enseña de cuándo y de qué equipo es, y pide la contraseña si la tiene.
  Antes de tocar nada la comprueba entera (cada trozo y la huella SHA-256 de cada archivo). Si todo cuadra, kywai se
  reinicia y la coloca al arrancar, antes de cargar ajustes y proyectos:
  - lo que haya ahora en las mismas rutas se guarda antes en `<carpeta de datos>/copias-cargadas/<id>/copia-previa/`;
  - lo que no esté en la copia se queda como está (se junta, no se borra nada);
  - el código de acceso, la carpeta de proyectos y la cara de este equipo se quedan;
  - las claves se vuelven a cifrar con la llave de este equipo.
  Al volver a abrir «Cargar copia…» sale el informe «En la copia / Ahora en kywai» de proyectos, chats, mensajes,
  adjuntos, memoria, rutinas, habilidades, agentes, claves y archivos.
- En la ventana «Pasar a kywai cloud» hay un botón **Guardar copia…** para hacer una antes de pasarte.

Nunca van en la copia: el código de acceso, los equipos emparejados, la llave del móvil, el registro de accesos ni
las cachés.

**Está en todas**: la app de escritorio del servidor, el cliente de escritorio, el navegador y kywai Cloud. En la app
del servidor se eligen archivo y carpeta con las ventanas del sistema. Desde cualquier otro dispositivo:

- **Guardar copia…** la hace el servidor en `<carpeta de datos>/copias-para-descargar/` (solo la última) y se descarga
  sola en el dispositivo donde estás (`GET /api/backup-download`; botón «Descargar la copia» por si no).
- **Cargar copia…** sube el `.kywai` elegido al servidor (`POST /api/backup-upload`, a
  `<carpeta de datos>/copias-subidas/`, solo la última) y desde ahí se comprueba y se carga igual. El servidor solo
  carga copias de esa carpeta, nunca una ruta cualquiera que llegue de fuera.
- En kywai Cloud, al cargar, kywai se vuelve a abrir en el mismo contenedor (código 75) y la copia se coloca al
  arrancar; las carpetas de trabajo nuevas van a `~/proyectos`.
Código: `src/main/copiaLocal.ts` (formato, sin Electron, con pruebas), `src/main/copiaLocalApp.ts` (ventanas de
guardar/abrir y reinicio) y `src/renderer/src/ui/settings/BackupDialog.tsx`. La colocación reutiliza la del paso a la
nube (`MoveReceiver.begin/ready/placePending` en `mudanzaNube.ts`).

### Extensiones: catálogo de servidores MCP y de habilidades

La pestaña **Extensiones** tiene dos partes: **Servidores MCP** y **Habilidades**.

**Catálogo de servidores.** «Explorar catálogo» enseña primero unos destacados con su orden comprobada (Playwright,
Chrome DevTools, GitHub, Context7, DeepWiki, Fetch, Sequential Thinking, Obscura, browse, Firecrawl, Perplexity, PostHog, PixelLab,
Scrapling, OpenSEO, changedetection.io, PaddleOCR, remocn, Postiz y Stitch; Firecrawl, Perplexity, PostHog, PixelLab, OpenSEO, Postiz y Stitch piden
una clave de su web y Perplexity es de pago; PixelLab da unas generaciones de prueba y la usa «/sprite»).
Cuatro salieron de revisar repositorios de moda en reels (18 nov 2026):
- **Scrapling** (BSD-3, `uvx --from scrapling[ai] scrapling mcp`): lee y rastrea webs difíciles gratis y en el propio equipo,
  sin clave (la alternativa a Firecrawl). Para las herramientas con navegador hay que ejecutar una vez `scrapling install`.
  Tiene también su habilidad en Habilidades. Respetar las condiciones de cada web.
- **OpenSEO** (MIT, remoto en `https://app.openseo.so/mcp`): SEO tipo Semrush o Ahrefs (palabras clave, posiciones,
  competencia, enlaces, auditoría, visibilidad en las IA). Pide `Bearer` y la clave de OpenSEO; los datos los paga el usuario
  por uso en DataForSEO. Si lo tiene en su servidor, se cambia la dirección por la suya terminada en `/mcp`. Va con las
  doce habilidades «OpenSEO» (solo las de `plugins/openseo/skills`, no las internas del repositorio).
- **changedetection.io** (Apache-2.0): para quien ya lo usa para vigilar webs; la dirección viene como
  `http://localhost:5000/mcp/v1` y pide el token de MCP de sus Ajustes (cabecera `x-api-key`). Sin él, `/vigilar` hace lo
  mismo con los agentes de kywai. Su nombre y su logo no se usan como marca.
- **PaddleOCR** (Apache-2.0, opcional): saca el texto de fotos, capturas y PDF escaneados sin internet ni tokens del agente
  (`uvx --from paddleocr-mcp[local-cpu] paddleocr_mcp`, modelo PP-OCRv5 en local). La primera vez descarga cerca de 1 GB.
Dos más salieron de los reels del 19 nov 2026:
- **remocn** (MIT, remoto en `https://remocn.dev/mcp`, sin clave): busca entre unas 800 piezas de vídeo para Remotion,
  enseña cómo se usa cada una y convierte una idea en un guion plano a plano (`plan_video`). Va con la habilidad «remocn».
- **Postiz** (remoto en `https://mcp.postiz.com/mcp`): programar y publicar en más de 30 redes desde el agente. Pide
  `Bearer` y la clave de Postiz (Ajustes → Developers → Public API). Postiz es AGPL: kywai solo se conecta a su servicio,
  no copia su código. `/instagram` sigue publicando con Apps conectadas; Postiz es para quien ya lo usa o quiere su calendario.
**Chrome DevTools** (oficial de Chrome, Apache-2.0) da al agente la consola, las peticiones de red, las trazas de rendimiento
y capturas de una web: sirve para saber por qué una página falla o va lenta (Playwright y Obscura navegan; este depura).
**Stitch** es el servidor de Google Stitch (diseño de pantallas con IA): pide la clave de Stitch y va con las habilidades
«Stitch Skills». Al buscar (notion, postgres, slack…) se consulta el
**registro oficial de MCP** (registry.modelcontextprotocol.io, el directorio abierto del estándar, con miles de
servidores) y «Más resultados» trae la página siguiente. Cada ficha dice si es **remoto** o **en este equipo**, qué
claves pide y lleva el enlace a su página. «Instalar» no instala nada aún: rellena el formulario de «Añadir a mano»
con la orden (`npx -y paquete@versión`, `uvx paquete==versión` o `docker run -i --rm …`) o la dirección y las claves
con su explicación debajo, para que lo revises; al guardar se prueba como cualquier otro. Si la ficha deja algo por
rellenar (`<carpeta>`, `{región}`), sale un aviso amarillo. Los que solo funcionan por SSE no se pueden instalar.
Desde el 18 de noviembre de 2026 la búsqueda mira también la lista **Awesome MCP Servers**
(github.com/punkpeye/awesome-mcp-servers, MIT, la más grande de la comunidad). Sus resultados salen **detrás** de los del
registro, sin repetir los que el registro ya trae (se comparan por el repositorio), con las oficiales primero. La lista
no dice cómo se arranca cada servidor, así que esas fichas no tienen «Instalar»: dicen «De la lista Awesome MCP Servers,
sin verificar», llevan el enlace a su página y se añaden con «Añadir a mano». La lista (más de 1 MB) se descarga al
buscar y se guarda 6 horas en memoria; «Más resultados» solo pide más al registro. Si el registro no responde pero la
lista sí, salen los de la lista (`parseAwesomeMcp`, `matchAwesome` y `searchMcpCatalog` en `catalog.ts`).

**browse (tu Chrome de verdad, desde el 20 de noviembre de 2026).** Servidor MCP de OpenCode (anomalyco/browse, MIT)
que deja a los agentes usar **tu** navegador (Chrome, Edge, Brave, Arc, Vivaldi, Opera…) con tus pestañas, extensiones
y sesiones abiertas: abren pestañas aparte (agrupadas para no molestarte), leen, pulsan, escriben, hacen capturas y
graban la red; cuando hace falta algo tuyo (entrar, un código de verificación, un pago) te devuelven la pestaña y
siguen al pulsar **Continue**. Es la diferencia con el navegador de kywai (una pestaña propia dentro de la app) y con
Obscura (sin ventana y sin tus sesiones). Se añade desde el catálogo (orden `npx -y @opencode/browse@0.1.5 mcp`; hace
falta Node.js 22, que kywai instala si falta). **La primera vez**: añade la extensión «browse» desde la Chrome Web Store
y en una terminal ejecuta `npx -y @opencode/browse pair`, que da un código de 10 minutos para las Opciones de la
extensión. Si el agente lo usa sin emparejar, su herramienta `status` le dice el paso que falta y te lo pasa.
**Navegador en otro equipo** (kywai en el Mac mini y tu Chrome en el PC): en el Mac mini, `npx -y @opencode/browse set
hostname 0.0.0.0`; en la extensión del PC, «Connect an agent on another computer» con la dirección de Tailscale del Mac
mini y el código de `browse pair`. Solo por Tailscale: la conexión no va cifrada por browse. Al encenderlo para
**Hermes**, kywai lo apunta también en `~/.hermes/config.yaml` (bloque `# kywai:browse`, como Obscura), así que Hermes
lo puede usar **también al coordinar** (`HERMES_HOME_PACKAGES` en `src/main/hermesHomeMcp.ts`; solo ese paquete de npx,
no cualquiera). Probado el 20 nov 2026: el servidor arranca y lista sus herramientas (`execute`, `tabs`, `status`…).

**Obscura (navegador sin ventana para agentes).** Es un navegador hecho en Rust para IA (github.com/h4ckf0r0day/obscura,
Apache-2.0). Ejecuta el JavaScript de verdad (V8), lee las webs en Markdown, saca enlaces y datos, rellena formularios y
hace capturas y PDF. Gasta unos 35 MB de memoria frente a los más de 200 de Chrome (medido el 20 nov 2026: 35 MB y
0,35 s para abrir una página). Sustituye a Lightpanda desde el 20 de noviembre de 2026: es más ligero y también funciona
en Windows. Se añade desde el catálogo (orden `obscura mcp`, **sin** modo sigilo: úsalo en webs que lo permitan). Si el
programa falta, la prueba sale en rojo con el botón **«Instalar Obscura»**: baja su versión fija (`OBSCURA_VERSION`) sin
contraseña, a `~/.local/bin` en Mac y Linux (con su ayudante `obscura-worker`) y a `%LOCALAPPDATA%\Programs\obscura` en
Windows x64, que se añade al PATH del usuario.
**Quien tenía Lightpanda** pasa solo a Obscura al abrir kywai (`replaceLightpanda` en `src/main/extensions.ts`): se cambia
el servidor, se instala Obscura si falta y se vuelve a encender para los mismos agentes tras probarlo.
Al encenderlo para **Hermes**, kywai lo apunta también en la configuración propia de Hermes (`~/.hermes/config.yaml`, en un
bloque marcado `# kywai:obscura` que pone y quita él solo; el resto del archivo no se toca, y si ya tienes un servidor
«obscura» propio, se respeta; el bloque viejo de Lightpanda se borra solo). Así Hermes lo puede usar **también al
coordinar**: un enlace con JavaScript que su descarga normal (`web_extract`) no lee, lo abre con `browser_navigate` y lo lee
con `browser_markdown` en segundos, sin crear una tarea para otro agente. Hace falta porque el gateway de Hermes solo
acepta herramientas que estén en su configuración (por eso Hermes no puede tener el navegador de kywai). Al apagarlo
para Hermes o quitarlo, el bloque se borra. Código: `src/main/hermesHomeMcp.ts`; la instalación,
`obscuraInstallCommand` en `src/main/setup.ts`.

**WordCraft de serie (Word y PDF de verdad).** Desde el 20 de noviembre de 2026 cada tarea lleva, sin instalar nada,
el servidor **WordCraft** (github.com/storytold/wordcraft, MIT o Apache-2.0): un procesador de textos libre hecho en Rust
que lee y escribe .docx (también .doc, .odt, .rtf, .md y .tex) y guarda en PDF. Con él el agente hace documentos con
estilos, tablas, índice, notas al pie, citas (APA, MLA, Chicago, IEEE), comentarios y control de cambios (firmados como
«kywai»), y con `render_page` mira cómo queda cada página. Va limitado a la carpeta de la tarea: no puede leer ni escribir
fuera (`--automation-read-root` y `--automation-write-root`). Llega a Claude, Codex, Gemini y Hermes (no a las consultas
rápidas). El programa se baja solo un minuto después de abrir kywai, en segundo plano y una vez (si falla, lo reintenta
al día siguiente; se apaga con `KYWAI_NO_WORDCRAFT=1`), a `~/.local/share/kywai/wordcraft/<versión>` en Mac y Linux y a
`%LOCALAPPDATA%\Programs\kywai-wordcraft\<versión>` en Windows; en kywai cloud ya viene dentro de la imagen
(`/usr/local/bin/wordcraft-cli`). El nombre «wordcraft» queda reservado en Extensiones. El coordinador lo sabe y, si
pides un Word, un informe o un trabajo con formato, lo pide en la tarea. Código: `src/main/wordcraft.ts` y la tarea en
`src/main/orchestrator.ts`.

**Verificados (✓).** En el registro puede publicar cualquiera, así que solo llevan ✓ los de publicadores conocidos
(Microsoft, GitHub, Notion, Stripe, Cloudflare, Google… lista `TRUSTED_MCP_PUBLISHERS` en `src/main/catalog.ts`) y
salen primero. El resto se puede instalar, pero revisa su orden.

**Habilidades.** Arriba, las instaladas (las de la carpeta «habilidades», que leen todos los agentes sean del
programa que sean) con su papelera. Debajo:
- **Buscar** en **skills.sh**, el directorio grande de skills (el mismo formato SKILL.md de Claude, Codex y Gemini),
  con cuántas veces se ha instalado cada una. Sin buscar salen destacadas (Superpowers, Impeccable, Ponytail, la
  auditoría de seguridad de Cloudflare, las de Anthropic, HyperFrames, Modern Web Guidance, Agent Skills de Addy Osmani,
  Open Code Review, agent-browser, Stitch Skills, Hallmark, Humanizer, /last30days, Graphify, Diagram Design, REA,
  Bang Motion, Scrapling, OpenSEO, Marketing Skills, Skill Creator, Remotion Skills y remocn). Una destacada puede limitarse a una carpeta del repositorio (`folder` en
  `FEATURED_SKILLS`): así OpenSEO trae solo sus doce recetas de SEO. Las cinco de Google, Addy Osmani, Alibaba y Vercel (17 nov 2026; licencias Apache-2.0 y MIT):
  - **Modern Web Guidance** (Chrome, Edge, Firefox y MDN): antes de tocar HTML, CSS o JS el agente busca la forma actual
    de hacerlo (`npx modern-web-guidance search …`), en vez de lo que aprendió hace años.
  - **Agent Skills** (Addy Osmani): 25 habilidades de ingeniería para producción (planificar, ir por partes, probar,
    revisar, rendimiento, lanzar). Se pisan un poco con Superpowers; se pueden borrar las que sobren.
  - **Open Code Review** (Alibaba): se instala solo su modo «delegación», que usa la cuenta del propio agente (sin clave
    aparte). El programa `ocr` elige qué archivos revisar y con qué reglas, para que no se salte ninguno y señale la línea
    exacta; el agente hace la revisión. Pide el programa (`npm i -g @alibaba-group/open-code-review`; la habilidad lo instala si falta).
  - **agent-browser** (Vercel): un Chrome que el agente maneja desde la terminal con instantáneas cortas (gasta pocos
    tokens). Como es un programa y no un MCP, también lo puede usar Hermes. Pide `npm i -g agent-browser && agent-browser install`.
    Para webs con tu sesión sigue siendo mejor el navegador de kywai.
  - **Stitch Skills** (Google): diseñar pantallas en Stitch y pasarlas a React, shadcn o Remotion; necesitan el servidor Stitch.
  **Codex Security** (OpenAI, Apache-2.0) no es una habilidad suelta sino un plugin de Codex: si lo instalas en el equipo
  (`npm i -g @openai/codex-security` y `codex-security login` con tu cuenta de ChatGPT), Hermes manda las revisiones de
  seguridad a Codex y este lo usa (`codex-security scan . --auth chatgpt`), sin API aparte. Ponytail (MIT) pide a los agentes el código
  mínimo que resuelve la tarea; instalada aquí la ven todos los proyectos.
  Las siete últimas salieron de revisar herramientas de moda en reels:
  - **Hallmark** (MIT): webs y páginas nuevas que no parecen hechas por IA (complementa a Impeccable).
  - **Humanizer** (MIT): quita las señales de texto escrito por IA; útil para `/instagram`, `/tiktok` y correos.
  - **/last30days** (MIT): qué se ha dicho de un tema en 30 días en Reddit, X, YouTube, TikTok y Hacker News, con
    fuentes. Trae su motor en Python (pide Python 3.12 en el equipo); encaja con `/radar`.
  - **Graphify** (Apache-2.0): convierte el proyecto en un mapa consultable (`graphify-out/`) para gastar menos
    tokens en repositorios grandes. Su SKILL.md se llama `graphify/skill.md` en el repositorio: kywai lo copia como
    SKILL.md con sus `references/`, y la propia habilidad instala el programa `graphify` con uv la primera vez.
  - **Diagram Design** (MIT): 45 tipos de diagrama con los colores de la marca.
  - **REA** (MIT): averigua cómo está hecha una función de una app (solo la habilidad `reverse-engineer-anything`;
    su servidor MCP y sus motores se instalan aparte, como explica la propia habilidad).
  - **Bang Motion** (MIT): motion graphics en un solo HTML (aperturas, promos, tipografía animada). Es «de vídeo»,
    así que va a `habilidades/video` y la lee el agente del guion de `/video`, no el resto de tareas.
  Cuatro más de los reels del 19 nov 2026:
  - **Marketing Skills** (MIT, solo la carpeta `skills`): más de 40 de marketing (textos, SEO y SEO para IAs, conversión,
    correos, anuncios, precios, lanzamientos). Útiles para `/instagram`, `/tiktok` y kywai.app.
  - **Skill Creator** (Anthropic, Apache-2.0): crear y mejorar habilidades con pruebas. Sus pautas también están ya
    dentro de `/aprende` (descripción que dice cuándo usarla, el porqué de cada regla, «Cómo comprobarlo»).
  - **Remotion Skills** (oficiales de Remotion) y **remocn** (MIT, solo su habilidad principal): son «de vídeo», van a
    `habilidades/video`. Remotion es gratis para personas y empresas pequeñas; las de más de 3 personas pagan licencia.
  Una más del 20 nov 2026:
  - **Reverse API Engineer** (MIT, `kalil0321/reverse-api-engineer`): convierte una web en una API. Graba lo que la web
    pide por detrás mientras se usa y escribe un programa que lo repite sin navegador (la propia habilidad instala el
    programa `reverse-api-engineer` con uv). Útil para rutinas con tus propias herramientas (por ejemplo, GoHighLevel).
    Solo con webs que lo permitan: en LinkedIn, Instagram o Reddit va contra sus normas y pueden cerrar la cuenta. Es de
    fuente de confianza, así que se instala sola cuando un plan la pide; el resto del tiempo no está en las sesiones.
- **Instalar desde el enlace** de GitHub: un repositorio entero (`https://github.com/dueño/repo`: instala todas sus
  carpetas con SKILL.md, sin las de pruebas y sin partir las anidadas) o una carpeta (`…/tree/main/skills/pdf`).

Se copia la carpeta de la skill entera (scripts, referencias…) a `habilidades/<nombre>`, con un máximo de 40
archivos de 400 KB. Las de fuentes conocidas (`TRUSTED_SKILL_SOURCES`) pueden llevar un motor, plantillas o
imágenes: se copian hasta 400 archivos de 3 MB (40 MB en total), también los binarios. Para saber qué archivos tiene se usa la API de GitHub sin sesión (60 consultas por hora); si no
responde, se buscan en los sitios de siempre (`skills/`, `.claude/skills/`…) y se traen los que cita su SKILL.md.
Nada de lo descargado se ejecuta al instalar, y ningún nombre puede escribir fuera de la carpeta de habilidades.
Si una skill del directorio ya no está en su repositorio (el autor la renombró), el aviso dice qué skills tiene
ahora ese repositorio, para instalar la buena.
Las habilidades son instrucciones que siguen los agentes: instala solo las de fuentes en las que confíes.

**Revisión de seguridad (SkillSpector).** Si en el equipo donde trabajan los agentes está
[SkillSpector](https://github.com/NVIDIA/SkillSpector) (de NVIDIA, Apache-2.0), cada habilidad y cada plugin pasa
por su análisis antes de llegar a los agentes: 71 patrones de riesgo (instrucciones que intentan saltarse las
reglas, robo de claves o archivos, código peligroso, dependencias con fallos conocidos, servidores MCP con más
permisos de los que necesitan…), sin IA ni claves (`skillspector scan <carpeta> --no-llm`). Lo que dice:
- **No instalar**: no se instala (la habilidad se borra al momento; el plugin ni se llega a guardar) y el aviso
  dice el riesgo de 0 a 100 y las tres razones más graves con su archivo y línea.
- **Con cuidado**: se instala y el aviso sale debajo («▲ SkillSpector pide revisar…»; en los plugins se queda en su
  ficha).
- **Segura**: se instala sin más.

Sin SkillSpector todo funciona como antes. En Habilidades sale si la revisión está activa y, si no, el botón
**Instalar SkillSpector**: lo instala con uv (`uv tool install`, Python 3.13 en su propio entorno, versión fija
2.12.0); si falta uv, el aviso pide instalarlo primero. También revisa lo que instala Hermes desde sus propuestas
de habilidades. Es un análisis estático: ayuda mucho, pero no sustituye a mirar de dónde viene lo que instalas.

**Lo que se instala solo es más estricto (20 nov 2026).** Cuando el coordinador propone habilidades y la mejor
tiene 1.000 instalaciones o más, kywai la instalaba sola. Ahora solo se queda si SkillSpector la revisó y la da por
**segura**; si sale «con cuidado» o no se pudo revisar (no está SkillSpector), se borra y queda en la tarjeta para que
decidas tú. Las de fuentes de confianza siguen igual. Es la lección de OpenClaw, a cuya tienda de skills le colaron
341 maliciosas en 2026.

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
el de plugins de trabajo, `anthropics/knowledge-work-plugins`), con ✓, y el de **videojuegos**
(`gamedev-skills/awesome-gamedev-agent-skills`, Apache-2.0, sin ✓ porque no lo revisa Anthropic): un enrutador
(«router») y 79 habilidades para Godot, Unity, Unreal, Roblox, three.js, Phaser, Bevy, pygame, LÖVE y Defold, con
movimiento, niveles, enemigos, sonido, menús, dirección de arte y publicar en Steam o itch.io. Lo mejor es instalar
**router** y el paquete de tu motor (por ejemplo **godot**): el enrutador mira qué motor usa el proyecto y carga solo
las 2 o 3 habilidades que hacen falta. El paquete «gamedev» con todo pasa del límite de 60 y se queda a medias.
También sale el de **Google «elefante y pez dorado»** (`google/elephant-goldfish-model`, Apache-2.0, sin ✓): el plugin
**egm** para Claude y Codex. Un agente con todo el contexto escribe el diseño y otros que no han visto la conversación
lo revisan contra el código (`/egm:egm-review docs/diseño.md`); `/egm:egm-drift-report docs/` dice qué documentos ya no
coinciden con el código. Kywai hace algo parecido con sus propios planes: ver «Revisión del plan con ojos nuevos». Se
buscan por nombre, descripción, categoría o autor. Con «Añadir el enlace» pegas:
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
  - no tienen `localStorage` (la caja no tiene origen propio), así que lo que quieran guardar se lo guarda kywai, por
    mod, en `mods-data/<nombre>.json` de la carpeta de datos (hasta 2 MB): `parent.postMessage({kywai: 'load'}, '*')`
    contesta con `{kywai: 'data', data}` (lo último guardado, o `null`) y `parent.postMessage({kywai: 'save', data}, '*')`
    guarda cualquier valor JSON. Al quitar el mod se borra. En Órbita esto aún no está: allí el panel no guarda.
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
vídeo o audio adjunto** convierte lo que enseña ese vídeo en una **habilidad** del equipo. Sin plan del coordinador: una sola
tarea.
1. Antes de que empiece el agente, kywai baja el audio del enlace con **yt-dlp** (con `uvx`, como el dictado) o lo saca
   del adjunto con ffmpeg, y lo **transcribe con Whisper en el propio equipo** (whisper-ctranslate2, el mismo modelo que el dictado,
   idioma automático). De un vídeo adjunto saca también 6 fotogramas. Todo queda en `.ai-cowork/aprende/<id>/`
   (`transcripcion.txt`, `fotogramas/`).
2. El agente que mejor resume y enseña lee la transcripción (hasta 60.000 caracteres en el encargo; el resto, en el
   archivo) y responde con el `SKILL.md` entero: el **método** que enseña el vídeo (pasos, reglas, plantillas, qué
   evitar), no un resumen. Si no enseña nada aprovechable, responde «BLOQUEADA:».
3. kywai la guarda en `habilidades/<nombre>/SKILL.md` (si el nombre ya existe, con un número) con la fuente al final, y
   contesta con su nombre y para qué sirve. Desde ese momento todo el equipo la ve en su encargo.

Si YouTube u otra web pide iniciar sesión («no eres un robot»), kywai lo dice: se descarga el vídeo y se adjunta. El
audio no sale del equipo. Código: `src/main/learn.ts` (y `sendLearn`/`prepareLearn`/`completeLearn` en el orquestador).

### Mejorar las habilidades cada semana (`/repasar-habilidades`)

Idea de las habilidades que «se mejoran solas» de los rivales (20 nov 2026). **«/repasar-habilidades [nota]»** (también
`/mejorar-habilidades` o `/pulir-habilidades`) hace un repaso de las habilidades del equipo:
1. kywai mira las tareas de los **últimos 7 días de todos los proyectos** y, de cada habilidad que una tarea recibió
   entera, apunta lo que salió mal: la tarea **falló**, **se bloqueó**, el **verificador pidió corregirla** o le
   pusiste **👎** al resultado.
2. Si ninguna dio problemas, contesta sin despertar a ningún agente (**no gasta nada**).
3. Si alguna sí, el agente que mejor redacta recibe las peores (hasta 3) con su texto y sus problemas. Decide si el fallo
   vino de la habilidad (si vino de la red o de una cuenta, no la toca) y deja cada versión mejorada en
   `.ai-cowork/repaso-habilidades/<fecha>/<nombre>.md`.
4. Al terminar, kywai las guarda como **«<nombre>-mejora», provisionales**, en Memoria → Habilidades. Nunca pisa nada
   sola. **Al confirmar una propuesta de mejora, sustituye a la habilidad que mejora** y la anterior queda en
   `SKILL.anterior.md` en su carpeta. Esto vale también para las «-mejora» que proponen los agentes al acabar una tarea.

La primera vez que la escribes deja la rutina **«Repaso de habilidades»**, los **domingos a las 03:30**. Código:
`src/main/skillTuneUp.ts` (`sendSkillTuneUp`/`tuneUpFinished` en el orquestador, `confirmLearnedSkill` en `skills.ts`).

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

**Desde un enlace** (22 nov 2026, idea de neonclipping): en vez de adjuntar el vídeo, pega su enlace de YouTube u
otra web que entienda yt-dlp: «/recortes 5 https://youtu.be/… los consejos más útiles». kywai lo baja (hasta 1080p,
con `uvx yt-dlp`, sin shell) a la carpeta de trabajo de la tarea, usa su título como nombre y sigue igual que con un
adjunto. Si la web pide iniciar sesión, lo dice y hay que adjuntarlo. Código: `downloadVideo` en `src/main/learn.ts`.

**El encuadre que sigue a quien habla** (como Clipify, sin reconocer caras): kywai compara cada fotograma con el
anterior y busca la franja de la imagen con más movimiento (quien habla mueve la boca y la cabeza). Si en una
entrevista habla el otro durante 2 s seguidos, el encuadre salta a él con un corte seco. Si casi nada se mueve (una
pantalla, un plano fijo), usa dónde dijo el agente que está la persona al mirar los fotogramas. Una grabación más
estrecha que el formato (un vídeo vertical que pides horizontal) va encajada sobre su propia imagen desenfocada.

Cómo funciona (una sola tarea, sin plan del coordinador):
1. kywai saca el audio con ffmpeg y lo **transcribe palabra a palabra con Whisper en el propio equipo**
   (whisper-ctranslate2, el mismo modelo que el dictado, `--word_timestamps`), y saca 4 fotogramas (8 en `/recortes`). Queda en
   `.ai-cowork/edicion/<id>/` (`palabras.json`, `fotogramas/`).
2. Un agente lee la transcripción (en `/editar`, cada palabra con su número: `{12}hola`; en `/recortes`, cada frase
   con su primera y última palabra: `#120-#135`) y responde solo un JSON: los tramos que sobran (`"cut": [[40, 52]]`)
   o los clips (`"clips": [{"title", "from", "to", "why"}]`). Si no vale (o quitaría más del 70 % del vídeo), se
   reintenta con otro agente.
3. kywai corta cada tramo con su fundido, los une limpiando la voz, encuadra, retoca el color y quema los subtítulos
   (ffmpeg con libass; si el del equipo no lo trae, en un Mac kywai instala antes el suyo, y donde no puede entrega
   sin subtítulos y lo dice). Después lo repasa (pantallas negras,
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

**Con poca memoria (1.5.5).** Cada plano se monta con ffmpeg con los hilos contados (`X264_LEAN`: x264 con 2 hilos y
10 fotogramas de antelación; `FILTER_LEAN` y `LOOP`: filtros y fotos repetidas con 2 hilos). Sin tope, x264 y el
descodificador de PNG abrían un hilo por núcleo de la máquina (no del contenedor) y un plano vertical llegaba a 1 GB;
en kywai Cloud (2 GB por cuenta) el sistema cerraba ffmpeg sin decir nada y salía «No se pudo montar el plano 3». Ahora
el peor plano gasta unos 550 MB y el resto unos 300 MB, con el mismo tiempo. Si aun así el sistema lo cierra sin motivo,
el plano se repite una vez y, si vuelve a pasar, el fallo dice qué hacer (`ffmpegFailure`): cerrar lo que no se use y
lanzar la misma orden, probar sin presentador o en horizontal, o hacerlo desde la app de escritorio.

**En tu equipo desde kywai cloud (1.5.6).** Con la app de escritorio conectada y «Hacer aquí los vídeos de kywai
cloud» encendido (Ajustes → Multimedia → Estudio de vídeo), el «/demo» pedido en la nube se monta en tu equipo, como
los vídeos de `/video`: la nube hace las fotos de la web, el guion de planos y la voz del presentador, y manda el
encargo por el mismo puente (`deviceBridge.video`, JSON con las fotos y las voces, como mucho 16 MB). El equipo lo
monta con su ffmpeg (`runDemoJob` en `demoOnDevice.ts`, llamado desde `runVideoJob` en `videoWorker.ts`) y sube el MP4.
Si el equipo no está, falla o su app es de antes, se monta en la nube como siempre y el registro de la tarea lo dice.

**El guion se ve como progreso (1.8.4).** Mientras el agente escribe el guion de planos en JSON, el chat no enseña ese código: una sola línea dice «Escribiendo el guion de planos: plano 3 · «texto del plano»» y se actualiza sola. Igual con /video y las portadas («Escribiendo el guion»). Lo hace src/main/planStream.ts.

1. kywai abre la web en una ventana oculta (sesión aparte, sin permisos ni ventanas nuevas, sin salir de esa web), baja
   hasta el final para que cargue todo y la fotografía entera en **ordenador** (1440 de ancho) y en **móvil** (390 de
   ancho a doble resolución). Lee el título, la descripción, las secciones y el **color de la marca** (el
   `theme-color` o el de sus botones). Queda en `.ai-cowork/demo/<id>/` (`escritorio.png`, `movil.png`, `pagina.json`).
2. Un agente mira las fotos y hace el **guion de planos** eligiendo de las **fichas de planos**: `portada` (el gancho
   sobre el color de la marca), `recorrido` (la web bajando de una sección a otra), `acercamiento` (de una sección
   entera a un detalle), `detalle` (plano cerrado con rótulo), `foco` (la sección entera y, a los 0,35 s, todo se
   oscurece menos un recuadro sobre lo importante, con un borde del color de la marca), `inclinado` (la sección como
   un cartel inclinado en 3D que se endereza despacio sobre el color de la marca; una vez como mucho), `movil` (la web
   en un teléfono sobre la web desenfocada), `pareja` (ordenador y móvil a la vez), `rotulo` (una frase a pantalla completa) y `cierre` (llamada a
   la acción y la dirección). Responde solo un JSON; si no vale, se reintenta con otro agente.
3. kywai monta cada plano con ffmpeg (movimientos de cámara suaves sobre las fotos, rótulos que suben 26 px mientras
   aparecen), los une con fundidos, les pone un **grano de película** muy suave (`GRAIN`, `noise=alls=3`: más fuerte
   multiplica el peso del vídeo por diez) y música. Se entrega en `videos/<título>-demo.mp4` (o `-demo-vertical.mp4`).

Hace falta la app de escritorio (las fotos las hace Electron). Idea de las fichas de planos de
[video-shotcraft](https://github.com/Vincentwei1021/video-shotcraft) (Apache-2.0) y del acabado de
[claude-remotion-skill](https://github.com/haidrrrry/claude-remotion-skill) (MIT: grano, rótulos con movimiento),
reimplementadas sin Remotion (su licencia obliga a pagar a las empresas de más de 3 personas). El foco es un PNG
transparente con un hueco (`spotlightHtml`, `spotBox`) sobre un empuje lento que deja el detalle quieto en pantalla;
el inclinado es el filtro `perspective` de ffmpeg con las esquinas en función del fotograma (`tiltCorners`).
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
- Si no sale ninguna voz, el vídeo se hace igual pero sin presentador. Si ffmpeg no tiene libass, en un Mac kywai
  instala antes el suyo; donde no puede, sale sin subtítulos ni rótulo.

**Repositorios de GitHub.** Con un enlace a un repositorio («/demo github.com/dueño/repo vertical») kywai fotografía su
portada (los datos y el README) y pide a la **API pública de GitHub** sus datos reales: estrellas, forks, licencia,
lenguaje, temas y último cambio. El guion solo puede usar esas cifras y tiene una ficha más, **`repo`**: la tarjeta del
repositorio (dueño / nombre, descripción y pastillas con ★ estrellas, forks, licencia y lenguaje). Con GitHub el
presentador va **por defecto**; «sin presentador» lo quita.

Código: `githubRepo`, `fetchRepoFacts`, `repoCardHtml`, `presenterHtml`, `spokenWords` y `finishWithPresenter` en
`src/main/webDemo.ts`; la voz de cada frase con `speakLine` (`src/main/videoStudio.ts`) y el presentador con
`demoVoices`/`demoPresenterInfo` en el orquestador. Idea del formato de los reels de «alerta de repo»; nada copiado.

**Enlace para compartir** (desde el 18 de noviembre de 2026, idea de Cap, github.com/CapSoftware/Cap, AGPL-3.0,
reimplementada sin su código). Cada vídeo de «/demo» sale con un enlace `/v/<código>` en el mensaje: abre una página
sencilla con el vídeo (se puede adelantar), su título, hasta cuándo vale y **Descargar**, en claro u oscuro según el
dispositivo. Así se pasa el vídeo sin mandar el archivo.
- **Quién lo abre.** En **kywai Cloud**, cualquiera que tenga el enlace (es la dirección pública del espacio,
  `https://<id>.nube.kywai.app/v/…`; Caddy deja pasar `/v/*` sin la sesión de Mi cuenta). **En casa**, los
  dispositivos de tu Tailscale (`http://<equipo>:<puerto>/v/…`). Si el acceso desde otros dispositivos está apagado,
  el mensaje dice cómo encenderlo.
- **Qué da y qué no.** El código es al azar (144 bits), solo sirve para ese archivo (nunca para la app, la API ni otras
  carpetas), caduca a los **30 días** y no hace falta el código de acceso de kywai. La página no carga nada de fuera
  (CSP `default-src 'none'`) y pide no salir en buscadores. Los enlaces se guardan en `compartidos.json` del espacio de
  trabajo (`src/main/shareLinks.ts`; la ruta, en `serveShare` de `webServer.ts`, antes de la comprobación de acceso).
- **Compartir cualquier resultado** (20 nov 2026, idea de Manus). Clic derecho en una respuesta de un agente →
  **«Compartir con un enlace»** (atajo `l`): crea un enlace `/v/<código>` igual de seguro con una página de solo
  lectura que tiene el título (la petición), la **respuesta** (títulos, listas y negritas; todo escapado), los
  **entregables** de esa petición (hasta 10: imágenes, vídeos y audios se ven ahí, todos con **Descargar**) y **cómo se
  hizo** (cada tarea con el agente que la hizo). El enlace se copia solo y dura 30 días. Solo da esos archivos
  (`/v/<código>/f/<n>`), nunca otros del proyecto ni la app. Código: `createResultShare` y `resultPage` en
  `shareLinks.ts`, `shareMessage` en `index.ts`.

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

### Piezas para imprimir en 3D (`/imprimir3d`)

**«/imprimir3d [medida] [material] qué pieza»** diseña una pieza lista para el laminador (Cura, PrusaSlicer, Bambu
Studio, Orca) de una foto, un boceto o una descripción: «/imprimir3d soporte para el móvil 80 mm», «/imprimir3d tapa
para este bote en PETG» con la foto adjunta. También valen `/pieza3d`, `/print3d` y `/stl`. La medida (mm o cm) es la
más larga de la pieza; el material, PLA (por defecto), PETG, ABS, TPU, ASA o resina. La idea sale de un reel que
convertía fotos en piezas imprimibles; kywai la hace con CAD de verdad, como text-to-cad: un sólido paramétrico con
build123d o CadQuery (si no, OpenSCAD), no una malla adivinada, así que las medidas son exactas y se pueden cambiar.

No pasa por el plan: va directa al agente que mejor modela (`bestAgentFor`) con el encargo de `src/main/print3d.ts`.
El agente mira las fotos (usa lo que haya de referencia para las medidas y dice cuánto se fía), modela con las medidas
como parámetros, aplica las reglas de impresión (paredes, voladizos de 45°, holguras de 0,2–0,3 mm, cara plana
abajo), comprueba que la pieza es un sólido cerrado con sus medidas reales y mira una vista previa de 4 ángulos antes
de entregar. Entrega en `piezas3d/<pieza>-<id>/`: `pieza.step`, `pieza.stl`, `pieza.3mf`, `modelo.py`, `vistas.png` y
`LEEME.md` con medidas, supuestos y cómo imprimirla. No hace armas ni piezas de armas. Órbita tiene la orden en su
lista del «/».

### Efectos de sonido (`/sonido`)

**«/sonido [segundos] [bucle] qué suena»** hace un efecto de sonido de una frase con ElevenLabs: «/sonido puerta vieja
que cruje», «/sonido moneda de videojuego», «/sonido 10 s bucle lluvia en la ventana». También valen `/efecto`, `/sfx`
y `/sound`. La duración va de 0,5 a 30 s (sin ella la elige ElevenLabs); con «bucle» (o «loop») el sonido se puede
repetir sin que se note el corte, para ambientes, motores o música de fondo de un juego. La idea sale de un reel que
añadía efectos de sonido a una app con una frase.

Lo hace kywai directamente, sin gastar ningún agente ni pasar por el plan (`sendSound` en el orquestador y
`elevenSound` en `src/main/elevenlabs.ts`): guarda el MP3 en `sonidos/<primeras-palabras>.mp3` del proyecto y quien
coordina lo deja en el chat para escucharlo. Usa la misma clave de ElevenLabs que las voces del vídeo (Ajustes →
Multimedia → Estudio de vídeo); sin ella, la orden lo dice. La clave nunca va a ningún agente. Gasta créditos de tu
cuenta de ElevenLabs. Código del análisis de la orden: `src/main/soundEffects.ts`.

### Mascota animada (`/mascota`)

**«/mascota [qué es] [bucles]»** crea la mascota de tu marca o de tu app, que sale siempre igual y se mueve en bucle:
«/mascota zorro azul con gafas que saluda y piensa», o adjuntando tu logo o un boceto. También vale `/mascot`. Los
bucles se entienden en español o inglés (reposo, saludo, salto, celebra, piensa, habla, cargando, triste, duerme); por
defecto, reposo y saludo. La idea sale de un reel que hacía una mascota animada con IA para una app; para un personaje
de pixel art de videojuego está «/sprite».

No pasa por el plan: va directa al agente que mejor dibuja y anima (`bestAgentFor`) con el encargo de
`src/main/mascot.ts`. Si hay ComfyUI en el equipo, kywai lo enciende ya y le da su dirección al agente. El agente, por
pasos y mirando cada resultado:

1. **Ficha** (`ficha.md`): formas, proporciones, 3–5 colores en hex y qué la hace reconocible a 64 px.
2. **Referencia** de frente (`referencia.png` y sin fondo `referencia-transparente.png`), con lo primero que tenga: su
   propia generación de imágenes, ComfyUI, el motor gratis de internet (Pollinations) o dibujada con código en SVG.
3. **Hoja de poses** (`poses.png`): la misma mascota en 6 poses, comparadas entre sí para que no cambie.
4. **Bucles** de 2–4 s que empiezan y acaban igual: con Wan 2.2 en ComfyUI si lo tiene, si no por piezas a 24 fps
   (botar, anticipación, parpadeo). Cada bucle en GIF y WebM con fondo transparente y MP4 con el color de la marca.
5. **La mascota que mira**: dos hojas de 3×3 (`mira-direcciones.png`, nueve giros de la cabeza, y `mira-caras.png`,
   nueve caras) y `mascota-que-mira.html`, una página de prueba donde la mascota sigue el ratón y pone caras al
   tocarla, como la cotorra del chat vacío (ver «La cotorra que te mira»). Las hojas tienen el formato de page-mascot
   (MIT), así que en una web con React valen con `npm i page-mascot`.

Todo queda en `mascota/<nombre>-<id>/` con un ZIP. Si el proyecto tiene `cliente-ideal.md`, la mascota se piensa para
esa persona. Nada de copiar mascotas ni logos de otras marcas. Órbita tiene la orden en su lista del «/».

### Presentaciones de PowerPoint (`/presentacion`)

**«/presentacion [rápida] [N diapositivas] [vertical] tema»** hace una presentación de PowerPoint de verdad: un `.pptx`
nativo y editable, con patrones, formas, gráficos y tablas con datos y notas del orador (no imágenes pegadas).
«/presentacion plan de ventas 2027 en 10 diapositivas», o adjuntando un PDF, un Word, un Excel o un Markdown como
contenido; si adjuntas un `.pptx` o `.potx`, se usa como tu plantilla de marca, y si pides mejorar uno, lo rehace
(Beautify). También vale `/ppt`, `/diapositivas` o `/slides`. Sale de un reel con **PPT Master**
(github.com/hugohe3/ppt-master, MIT).

No pasa por el plan: va directa al agente que mejor escribe y diseña (`bestAgentFor`) con el encargo de
`src/main/presentation.ts`. PPT Master pesa unos 80 MB con sus plantillas, así que no va al catálogo: la primera vez el
agente lo descarga con `git clone --depth 1` a `extensiones/ppt-master` del espacio de trabajo y le crea su propio
entorno de Python (`.venv`); las siguientes lo pone al día con `git pull`. Por defecto sigue su ruta completa, con plan
de diseño (aquí manda la calidad); «rápida» usa su modo Quick. Las paradas de la habilidad que esperan a una persona
las decide el agente y las apunta en `NOTAS.md`. Las cifras salen de lo adjunto o de fuentes citadas en las notas.

Todo queda en `presentaciones/<tema>-<id>/`: el `.pptx`, `NOTAS.md` y `portada.png`. El `.pptx` se abre en la vista
previa del chat. Si el proyecto tiene `cliente-ideal.md`, se escribe para esa persona. Órbita tiene la orden en su
lista del «/».

### Diseños de webs, pantallas y paneles (`/diseno`)

**«/diseno [móvil] qué quieres»** hace un diseño de verdad, listo para enseñar: una página HTML que se ve como el
producto terminado (una web, una landing, una pantalla de app, un panel de datos). «/diseno landing de mi cafetería con
carta y reservas», «/diseno móvil app de recetas, pantalla de inicio», o adjuntando un boceto, una captura o un texto.
También vale `/diseño`, `/design`, `/prototipo`, `/maqueta` o `/landing`. Con «móvil» se piensa primero para el
teléfono (390 px). Para diapositivas es `/presentacion`; para vídeo, `/video`.

Sale de un reel con **Open Design** (github.com/nexu-io/open-design, Apache-2.0), un estudio de diseño local con
sistemas de diseño y plugins que usa los mismos agentes que kywai y les da un servidor MCP. kywai no lo instala (es una
app de escritorio para Mac y Windows, o un Docker con su servidor en `127.0.0.1:7456`) ni copia su código. No pasa por el
plan: va directa al agente que mejor diseña (`bestAgentFor`) con el encargo de `src/main/design.ts`:
1. Si Open Design responde en el equipo, el agente se conecta una vez con `od mcp install <su programa>` (claude, codex,
   opencode, hermes…), elige su sistema de diseño o plugin (`od skills list`, `od plugin list`) y copia el resultado.
2. Si no está, lo hace él con las mismas reglas y al final menciona en una línea que con Open Design (open-design.ai)
   salen diseños con sistemas de diseño completos.

Reglas del diseño: un solo `index.html` que se abre sin servidor (fuera solo fuentes de Google Fonts), contenido real
(nunca «lorem ipsum»; lo de ejemplo se marca), una dirección visual propia del tema, claro y oscuro, adaptable al ancho,
foco visible, contraste legible y «reducir movimiento»; si el agente tiene «principios-ux-animacion» o «Impeccable», las
sigue. Sin «cara de IA» (1.34.0, sale de un reel con una lista de 18 puntos): fuera degradados morados, brillos
radiales, texto con degradado, insignias de adorno, emojis como iconos y más de 2 botones de acción; dentro letra
legible, beneficios primero, textos concretos, un solo acento, espaciado de 4 en 4 px, jerarquía clara, una cosa
principal por pantalla, esquinas iguales, cristal solo donde ayuda, tarjetas que se leen de un vistazo, señales de lo
que se puede pulsar e imágenes de calidad. Antes de entregar hace una captura (1440×900, o 390×844 en móvil), repasa
esas dos listas y arregla lo que se corte, se salga o no las cumpla.

Todo queda en `diseno/<nombre>-<id>/`: `index.html`, `NOTAS.md` (decisiones y qué es de ejemplo) y `portada.png`. Se
abre en la vista previa del chat. Si el proyecto tiene `cliente-ideal.md`, se diseña para esa persona. Órbita tiene la
orden en su lista del «/».

### Juegos para el navegador (`/juego`)

**«/juego [móvil] de qué va»** hace un juego pequeño, original y jugable en el navegador: «/juego un zorro que salta entre
nubes recogiendo estrellas», «/juego móvil naves que esquivan rocas», o adjuntando un boceto. También vale `/game`,
`/videojuego` o `/minijuego`. Con «móvil» se piensa primero para el teléfono (vertical y táctil).

Sale de un reel de **OhMyGame** (github.com/WhiteTowerAI/ohmygame, Apache-2.0), un estudio para hacer juegos con IA
donde el agente juega lo que hizo para comprobar que funciona. kywai no lo instala ni copia su código: toma esa idea y la
hace con sus agentes. No pasa por el plan: va directa al agente que mejor programa juegos (`bestAgentFor`) con el
encargo de `src/main/game.ts`:
1. Escribe `DISENO.md` (la idea, los controles, cómo se gana y cómo se pierde).
2. Hace el juego en un solo `index.html` que se abre sin servidor (canvas 2D, o three.js por CDN si es 3D), con el arte
   hecho en código y sonidos con WebAudio: pantalla de inicio, partidas de 1 a 3 minutos, puntuación, pausa, fin y
   «jugar otra vez». Todo inventado: nada copiado de juegos que existen.
3. **Lo prueba jugando**: lo abre con un navegador sin ventana, juega unos 30 segundos con teclas o clics automáticos y
   comprueba que no hay errores, que la puntuación cambia, que se puede perder y que se puede volver a jugar. Arregla y
   repite hasta que va. Lo apunta en `PRUEBA.md`.
4. Guarda `portada.png`, una captura en plena partida (1280×720, o 390×844 en móvil).

Todo queda en `juego/<nombre>-<id>/` y el juego se abre en la vista previa del chat. Si el agente tiene la habilidad de
videojuegos del paquete de serie (o «vgpu» para efectos), la sigue. Quien coordina también la lanza cuando pides «hazme un
juego de…» con tus palabras. Órbita tiene la orden en su lista del «/».

### Crear una extensión con una frase (`/extension`)

**«/extension qué quieres»** (también `/extensión`, `/crea-extension`, `/crea-mod`) hace una extensión nueva de kywai
con una sola frase: «/extension un muro de notas de colores», «/extension un contador de horas por proyecto».
Un agente (el que mejor maqueta) hace el mod en `extensiones/<nombre>/` del proyecto: el manifiesto `kywai-mod.json`
con el nombre que le da kywai, un `panel.html` que funciona solo (sin internet ni archivos de fuera, claro y oscuro,
pensado para la columna del chat) y un `LEEME.md`. Al terminar la petición, kywai lo instala como cualquier mod
(desde esa carpeta) y abre su panel en la pestaña **Mods**; en el chat sale cómo quitarlo o apagarlo. El nombre
nunca pisa uno instalado (`muro-de-notas`, `muro-de-notas-2`…). Al agente no se le piden hooks ni red: si el panel
necesita guardar (las notas del muro), usa los mensajes `load`/`save` de los paneles. Sale de la idea de «Creator
Mode» de DeepSeek Harness (MIT); no hay código suyo. El código está en `src/main/modCreator.ts`.

### Arreglar un fallo hasta el pull request (`/arreglar`)

**«/arreglar <fallo o enlace>»** (también `/arregla`, `/fix`): pegas el enlace de una incidencia de GitHub o cuentas
el fallo («/arreglar al guardar sin título sale un error») y un agente, sin preguntarte en cada paso:
1. lee la incidencia con sus comentarios (`gh issue view`), trabaja en la carpeta del proyecto si es ese repositorio o lo
   clona en `arreglos/<dueño-repo>/`;
2. **lo reproduce** con una prueba automática que falla (si no lo consigue, para y explica qué falta);
3. lo arregla con el cambio más pequeño, pasa la prueba nueva y las de esa parte;
4. hace una rama `kywai/arreglo-<n>` y un commit (con «Fixes #n»), y abre un **pull request en borrador** con `gh pr create
   --draft` si hay sesión de `gh`. Si no la hay, deja la rama y un parche en `arreglos/` y dice cómo subirlo.
Nunca fusiona, nunca fuerza un push, nunca toca la rama principal ni desactiva pruebas.

**«/arreglar vigilar dueño/repo [cada N horas]»** (6 h por defecto) crea la rutina «Arreglar fallos de dueño/repo», que
lanza `/arreglar pendientes dueño/repo`: mira las incidencias abiertas con la etiqueta `bug` (o las que sean fallos),
se salta las asignadas, las que ya tienen PR y las apuntadas en `arreglos/<dueño-repo>/hechos.json`, y arregla la más
antigua, una por vez. Si no hay nada nuevo, contesta en una línea. Necesita el programa `gh` con sesión iniciada en el
equipo (`gh auth login`). Sale de la idea de los «disparadores» de DeepSeek Harness (MIT); no hay código suyo. El
código está en `src/main/bugFix.ts`.

### Auditoría de seguridad con revisión cruzada (`/seguridad`)

**«/seguridad [qué mirar]»** (también `/auditoria`, `/security`, `/audit`; 21 nov 2026, idea del vídeo sobre la
**Security Audit Skill** de Cloudflare) revisa la seguridad del proyecto en dos pasos seguidos, sin plan:
1. Un agente con terminal busca fallos siguiendo la habilidad `security-audit` de Cloudflare (viene en el paquete
   kywai default skills; si lo quitaste, el encargo lleva el método resumido): reconocimiento, zonas de riesgo y caza.
   Cada hallazgo, con gravedad, archivo:línea, camino de ataque y arreglo propuesto, va a
   `seguridad/hallazgos-<fecha>.md`.
2. Un agente de **otra familia** (Codex si buscó Claude, por ejemplo; lo elige como al verificador) intenta desmontar
   cada hallazgo leyendo el código y, si puede, probándolo en local. Escribe `seguridad/informe-<fecha>.md` con
   **Confirmados**, **Por validar** y **Descartados**, y en el chat contesta «Confirmados N · Por validar N ·
   Descartados N» con los confirmados de más a menos grave.
Nadie cambia el código. La habilidad de Cloudflare hace la segunda pasada con el mismo modelo; con dos familias, los
errores de una se cuelan menos. Si solo hay una familia disponible, el mismo agente repasa sus hallazgos y el chat lo
dice. Para arreglar un hallazgo confirmado, una tarea normal o `/arreglar`. Código: `src/main/securityAudit.ts` y
`sendSecurityAudit` en `orchestrator.ts`; está en la lista del «/» del escritorio, la web y Órbita.

**Dos pasadas, memoria y lista de ataques (1.26.0–1.26.2, 24 nov 2026).** Ideas de seis vídeos sobre la seguridad de
las apps hechas con IA (la habilidad de Cloudflare, «14 cosas que prueba un atacante», «10 formas de inflarte la
factura», el rol cambiado en el navegador, la lista de antes de publicar y el plan gratis de Cloudflare):
- **Dos pasadas** (1.26.0). El vídeo avisa de que una sola pasada encuentra más o menos la mitad de los fallos. Ahora
  el primer agente termina sus hallazgos con «## Zonas revisadas» y una **segunda pasada** (el mismo agente en una
  sesión nueva) caza solo donde la primera no llegó y añade «## Segunda pasada» al mismo archivo, siguiendo la
  numeración. Después, el agente de otra familia desmonta todos.
- **Memoria** (1.26.0). Si el proyecto ya tiene un `seguridad/informe-<fecha>.md`, la nueva auditoría parte del más
  reciente: vuelve a comprobar los confirmados y los «por validar», no repite los descartados salvo que su código
  cambiara y caza sobre todo en lo que cambió desde entonces. El chat lo dice al empezar.
- **Lista de ataques** (1.26.1). 33 comprobaciones concretas (`ATTACKS` en `securityAudit.ts`): 15 para colarse
  (rutas de admin, cambiar el ID en la dirección, claves en el navegador, precio, cantidades negativas, pago falso,
  cupones repetidos, admin al registrarse, rol en el navegador, adivinar códigos, inyección de instrucciones, XSS,
  subidas, `.env` en Git, inyección SQL), 10 para inflar la factura (IA en bucle, libros en el chat, pruebas gratis
  repetidas, cuentas falsas, archivos de 5 GB, 100 a la vez, invitaciones como spam, descargas masivas, el chat como IA
  gratis, códigos por correo o SMS) y 8 de antes de publicar (contraseñas y cookies, HTTPS y cabeceras, CSRF,
  enlaces que caducan, depuración, dependencias, archivos expuestos, registro de lo sospechoso). Cada una queda como
  **✓ protegido**, **✗ abierto** o **— no aplica**, con archivo:línea; las de factura abiertas, con lo que podrían
  costar al mes. El informe acaba con «## Lista de ataques» y el chat añade «Lista: N protegidos · N abiertos · N no
  aplican». **«/seguridad rápida [qué mirar]»** (o `rapida`, `quick`, `lista`) pasa solo la lista, en una pasada, y la
  revisión cruzada.
- **«Revisar seguridad» al terminar** (1.26.2). Cuando una petición termina bien y el código que escribió o cambió el
  equipo tiene inicio de sesión, pagos, subida de archivos, chat con IA o base de datos (`securitySurfaces`), el chat
  enseña un aviso con **«Revisar seguridad»** (lanza «/seguridad rápida») y **«Ahora no»** (deja de ofrecerlo en ese
  proyecto en este equipo). Nunca se lanza solo, sale como mucho una vez cada 6 horas por proyecto y no sale en las
  rutinas ni al terminar una propia auditoría.

**Prueba de kywai y kywai Cloud contra esa lista (1.26.3, 24 nov 2026).** Se revisó el código ataque por ataque. Lo que
estaba abierto y se cerró: en la nube, la charla de la voz gratis (`/api/voz/gratis/hablar`) no contaba el uso (ahora
400 llamadas al día y 24.000 letras por llamada), los tokens de «Hablar con kywai» no tenían tope (ahora no da más con
90 minutos de tokens sin cerrar, y como mucho 60 al día) y Mi cuenta manda `Strict-Transport-Security`; en la app, el
código de 6 cifras para emparejar se anula tras 10 fallos en total (además del tope de 10 por minuto y dirección,
`PAIRING_PIN_MAX_MISSES` en `mobileAuth.ts`) y se actualizó `fast-uri` (fallo moderado). Queda propuesto, sin hacer,
Turnstile de Cloudflare en el registro de kywai Cloud (hoy cada cuenta nueva la aprueba el administrador).

### SEO y marketing de una web o una app (`/seo`, `/marketing`)

**«/seo <web, repositorio o carpeta> [qué cuidar]»** (también `/posicionamiento`, `/posicionar`, `/geo`; 25 nov 2026,
pedido del dueño: «pones /seo y la web que quieras y te lo hace») y **«/marketing <web o app> [para quién]»** (también
`/promocionar`, `/difundir`, `/mkt`) juntan en una orden lo que kywai ya tenía suelto para el SEO y el marketing. Van
directos a un agente, sin plan, como `/cliente-ideal`. Sin nada detrás usan el proyecto abierto.

- **`/seo`**: un agente audita el SEO y el GEO (si ChatGPT, Gemini, Perplexity y las demás IA pueden citar la web y la
  citan) con la habilidad de serie `web-auditoria-seo-geo` (si la borraste, el encargo lleva su método) y, si están
  puestas, las guías Claude SEO, OpenSEO y Marketing Skills del paquete kywai default skills. Si el agente tiene el
  servidor OpenSEO o Search Console, los usa; si no, las cifras de tráfico salen «sin dato», nunca inventadas. Deja
  `seo/informe-<fecha>.md` con las dos notas (salud SEO y preparación GEO), los arreglos P0/P1/P2 y las preguntas con las
  que miró si le citan las IA. **Si la web es la carpeta del proyecto (o una carpeta tuya) y es un repositorio git**, hace
  los arreglos seguros en una rama nueva `seo-<fecha>`, un commit por arreglo, **sin subirla ni fusionar**; con una
  dirección de fuera no toca nada y deja cada cambio listo para copiar.
- **`/marketing`**: un agente lee la web o el proyecto, y escribe para tu cliente ideal (`cliente-ideal.md`; si no lo
  hay, lo deduce, lo marca «(supuesto)» y te recomienda `/cliente-ideal`). Deja en `marketing/<fecha>/`: `posts.md`
  (5 posts para Instagram y TikTok, cada uno con su gancho, texto, hashtags y la orden `/video …` lista), `blog.md` (un
  artículo de 800 a 1.200 palabras pensado para Google y para que lo citen las IA), `anuncio.md` (un anuncio con tope
  siguiendo la habilidad `anuncios-campana`, en estado «preparado») y `plan.md` (2 semanas de publicaciones). **Todo
  queda en borrador**: no publica, no envía nada y no crea campañas ni gasta. Para publicar, `/video` con el post y
  luego `/instagram` o `/tiktok` con tu visto bueno.

Para que lo haga solo cada día está el equipo listo «📈 Más clientes para mi negocio» (pestaña Rutinas → «Equipos
listos»). Código: `src/main/seoMarketing.ts` (`parseGrowthRequest`, `seoPrompt`, `marketingPrompt`) y el bloque de
`parseGrowthRequest` en `orchestrator.ts`; está en la lista del «/» del escritorio, la web y Órbita, y Hermes lo propone
si se lo piden con otras palabras (`coordinatorGuide.ts`).

### Vigilar una web (`/vigilar`)

**«/vigilar <web> [cada N horas] [condición]»** vigila una página y te avisa en **«Te necesita»** cuando cambia lo que te
importa: «/vigilar https://tienda.com/zapatillas cada 3 horas avísame si baja de 50 €», «/vigilar tienda.com/p/1
cuando vuelva a haber stock», «/vigilar github.com/dueño/repo/releases cada día si sale una versión nueva». Sin
condición, avisa cuando cambia lo importante de la página (no por menús, anuncios ni fechas). Por defecto, cada 6
horas («cada hora», «cada día», «cada 2 días» también valen; entre 1 hora y una semana). También vale `/vigila` y
`/watch`. La idea sale de **changedetection.io** (Apache-2.0), reimplementada con los agentes de kywai sin instalar
nada; quien ya use changedetection.io lo tiene además en el catálogo de servidores MCP.

Cómo va (`src/main/webWatch.ts`):
1. Al escribir la orden se crea la rutina **«Vigilar <web>»** cada N horas con la misma orden (una por web y
   condición: si ya existe, no se repite) y se mira ya una vez. En la pestaña Rutinas se pausa o se borra.
   **Vigía barato** (20 nov 2026, idea del «heartbeat» de OpenClaw): esa rutina lleva «Solo si cambia esta página».
   A su hora, kywai descarga la página él mismo, sin IA, y guarda la huella de su texto visible (sin scripts ni
   estilos, `src/main/cheapCheck.ts`). Si es la misma que la vez anterior, **no despierta a ningún agente** y no
   gasta nada (la tarjeta de la rutina dice «sin cambios al mirarla sin IA el …»); si cambió o no se pudo leer, se
   lanza como siempre y el agente decide si es lo que importa. Cualquier rutina diaria, semanal o cada N horas puede
   llevarlo: campo «Solo si cambia esta página (opcional)» al crearla o editarla (`onlyIfChanged`).
2. Cada vez, un agente (`bestAgentFor`) lee la página: con **Scrapling** si está en el equipo (`scrapling extract`),
   si no con un navegador que tenga o la descarga normal. No inicia sesión, no rellena formularios ni se salta
   captchas o muros de pago. Se queda solo con lo que importa y lo compara con la vez anterior.
3. En `vigilancias/<web>/` del proyecto deja `ultima.md` y `anterior.md` (lo que leyó), `historial.md` (una línea por
   vez) y `estado.json` (`aviso`, `resumen`, `valor`).
4. Al terminar, si `estado.json` dice `aviso`, sale un aviso **«Vigilancia»** en «Te necesita» (y en Órbita) con lo que
   cambió y el botón **«Abrir la página»**. El mismo cambio no avisa dos veces, aunque lo descartes con la X.

### Manuales paso a paso con capturas (`/manual`)

**«/manual <primer paso>»** graba un manual mientras le dices a kywai lo que hay que hacer, escrito o por voz
(«Hablar con kywai»). Por ejemplo: «/manual abre midominio.com», luego «entra en Ajustes», «pulsa Nuevo contacto»,
«escribe Ana en el nombre»… y al final **«/manual fin Cómo crear un contacto»**. También valen `/tutorial` y
`/paso-a-paso`. Por voz basta con decir «hazme un manual…»: la voz encarga «/manual …» y después pasa cada paso tal
cual; «ya está, genera el manual» lo termina. «/manual estado» dice cómo va y «/manual cancelar» lo deja sin documento.

Cómo va (`src/main/manual.ts`):
1. La grabación es de **ese chat**: mientras dura, cada mensaje que mandas en él es el paso siguiente (otras órdenes
   «/…» siguen funcionando y no cuentan como paso). Sigue aunque reinicies kywai (`manuales/.activos.json`); tras 6 h
   sin pasos se da por abandonada.
2. «Abre <dirección>» lo hace kywai al momento en su navegador (pestaña «Navegador», que se abre al lado del chat).
   Lo demás va directo, sin plan del coordinador, a un agente con el navegador de kywai (Claude, Codex o Gemini; siempre el
   mismo mientras se pueda, retomando su sesión). Lo hace con las herramientas `navegador_*` **sin pedirte permiso**
   (eres tú quien lo dicta; la tarea lleva `withBrowser`) y contesta con el texto del paso para el lector.
3. Las capturas las hace kywai solo: al abrir una página y **justo antes** de cada clic, de escribir o de pulsar una
   tecla (`markForAgent` en `browser.ts`), con el recuadro del elemento. En el chat sale cada captura ya marcada
   (recuadro naranja, número del paso y rótulo «Haz clic en «Guardar»»), en `manuales/<carpeta>/capturas/`. Las
   capturas sin marcar y el estado van en la carpeta oculta `.capturas/`.
4. «/manual fin [título]» añade la captura final («Así queda») y monta el documento en `manuales/<carpeta>/`: un
   **HTML con diseño** (portada, índice y una tarjeta por paso con lo que dijiste, la explicación y sus capturas; las
   imágenes van dentro, así que se comparte tal cual) y su **PDF** A4. Las marcas se dibujan encima con CSS, nítidas al
   ampliar. Sin título, sale de la primera página («Cómo usar <web>»). Llegan al chat como entregables.

Nunca se escriben contraseñas, códigos ni tarjetas: si un paso lo pide, el agente contesta «NO PUDE:» y te pide que lo
rellenes tú en la pestaña «Navegador». Lo que escribe con `{{secreto:NOMBRE}}` sale en el manual como ••••. Un paso que
no se pudo hacer y no tiene capturas no sale en el documento. Hace falta tener la ventana de kywai abierta en el equipo
de los agentes (aunque esté detrás de otras), como para todo el navegador de kywai.

### Radar de temas (`/radar`)

**«/radar [N días] [N temas] [nicho]»** busca qué temas están subiendo ahora para tu nicho y te deja una ficha de
cada uno: «/radar agentes de IA», «/radar últimos 3 días 10 temas Claude Code». También vale `/tendencias`. Sin nicho,
el agente lo saca de las instrucciones y archivos del proyecto. Por defecto, 7 días y 8 temas. La idea sale de un reel
en el que un agente vigila YouTube cada 4 horas y pinta cada tema como una estrella con su nota.

No pasa por el plan: va directa al agente que mejor investiga (`bestAgentFor`) con el encargo de `src/main/radar.ts`:

1. Busca en YouTube con **yt-dlp** (sin claves ni cuentas; lo instala con uv o pipx si falta), lo más reciente y lo
   más relevante, y contrasta en la web (GitHub trending, Hacker News, Reddit, noticias del nicho). Para contrastar
   usa **Agent-Reach** (MIT, github.com/Panniantong/Agent-Reach, versión fija `AGENT_REACH_COMMIT`; lo instala con uv
   desde GitHub si falta, nunca desde PyPI, donde hay otro paquete con ese nombre): `agent-reach github|web|youtube
   search …` devuelve JSON con título, enlace, fecha y cifras, sin claves. Solo sus canales sin sesión: el encargo le
   prohíbe `setup`, `login`, `add` y `configure`, así que nunca copia la sesión de tu navegador.
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

### Explorar: varios intentos y gana el que pasa las pruebas (`/explorar`, 23 nov 2026)

**«/explorar [2-3] encargo»** (también `/explora` y `/explore`) da el mismo encargo de código a 2 o 3 agentes de
programas distintos a la vez (Claude, Codex, Gemini…; por defecto 3). Cada uno trabaja en **su propia copia aislada**
de la carpeta, así que ni se pisan entre ellos ni tocan la carpeta del proyecto. Al terminar, cada intento pasa las
pruebas del proyecto en su copia y la verificación de siempre. kywai elige al **ganador**: pruebas en verde y «cumple»
por delante; a igualdad, el cambio más pequeño; un intento que no terminó o no cambió nada no gana. **Solo los cambios
del ganador pasan a la carpeta del proyecto** (se ven y se deshacen desde su tarea, como cualquier otra) y las demás
copias se borran. En el chat sale una línea por intento: «🏆 Claude: pruebas en verde, cumple, 12 líneas».

- Va sin plan del coordinador y cuesta 2-3 veces el trabajo: para arreglos difíciles o que ya fallaron una vez.
  Hermes no lo lanza solo (cambia código); como mucho te lo propone.
- Necesita git en el equipo (para las copias) y al menos 2 agentes con terminal disponibles.
- Idea de agent-mcts (natsu0529/agent-mcts, MIT), reimplementada con las copias aisladas y la verificación de kywai:
  `src/main/explore.ts` (orden, elección del ganador) y `sendExplore`/`settleExplore` en `src/main/orchestrator.ts`.

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

### Instagram y TikTok con un clic (Zernio)

La forma fácil de conectar las redes de kywai, en ⚙ → Ajustes → Multimedia → Estudio de vídeo → **«Redes de kywai:
Instagram y TikTok»**. kywai publica a través de **Zernio** ([zernio.com](https://zernio.com), antes Late), un servicio
de publicación con las apps oficiales de Meta y TikTok ya aprobadas. Así no hace falta token de Meta, ni app en
developers.tiktok.com, ni esperar la auditoría de TikTok, y nunca se pide la contraseña de ninguna red.

1. Crea una cuenta gratis en [zernio.com/signup](https://zernio.com/signup). No pide tarjeta: las **2 primeras cuentas
   conectadas son gratis** (después, entre 1 $ y 6 $ por cuenta y mes).
2. En el panel de Zernio, **API keys** → **Create API key**, y copia la clave **entera en ese momento** (empieza por
   `sk_` y tiene 67 caracteres; Zernio no la vuelve a enseñar y la lista solo muestra una vista previa, que no sirve).
   Pégala en kywai → **Guardar**. kywai quita solo los espacios, saltos de línea, comillas o «Bearer» que se cuelen al
   copiar, y si pegas la vista previa o algo que no es una clave te lo dice antes de probarla. La guarda cifrada en el
   llavero; nunca la enseña ni la manda a los agentes.
3. Pulsa **Conectar Instagram** y **Conectar TikTok**: se abre la página oficial de cada red, entras con tu cuenta y
   vuelves. kywai mira cada pocos segundos y lo detecta solo. Si ya conectaste las cuentas en el panel de Zernio, kywai
   las encuentra al guardar la clave (o con **Comprobar**).

Qué cambia al publicar:
- **Instagram (`/instagram`)**: el reel se sube a Zernio y se publica al momento, con la portada que prepara kywai. No
  hace falta enlace público ni Tailscale Funnel. La cuenta tiene que ser profesional (empresa o creador). Desde la
  1.15.4 el **reel de prueba** (`/instagram prueba`) también va por Zernio (`trialParams` con
  `graduationStrategy: SS_PERFORMANCE`, y sin salir en el muro); antes se publicaba como reel normal si no había token.
  «/instagram resultados» sigue necesitando el token de Meta de las opciones avanzadas.
- **TikTok (`/tiktok`)**: «Enviar como borrador» lo deja en la bandeja de la app de TikTok; «Publicar» lo publica
  **en público** desde el primer día (con la app de TikTok for Business de Zernio, el vídeo directo solo puede ser
  público: para otro público, envíalo como borrador y elígelo en la app). TikTok a veces tarda unos minutos en
  procesarlo; la tarjeta lo dice.
- «Publicar sin preguntar» (Instagram) y «Enviar borradores sin preguntar» (TikTok) están en la misma tarjeta.
- **Desconectar** quita la cuenta de Zernio; **Quitar la clave de Zernio** vuelve a lo de antes.

Si la clave está puesta y la red conectada, Zernio tiene preferencia. Lo de antes (token de Meta, Apps conectadas y la
app propia de TikTok) sigue en **«Opciones avanzadas»**, plegado debajo, y se abre solo si ya lo usabas.

Código: `src/main/zernio.ts` (cliente), la tarjeta `ZernioPanel` en `ExtensionsTab.tsx` y los backends de Instagram y
TikTok del orquestador (`zernio()`).

### El Instagram de kywai (`/instagram`)

kywai puede llevar **su propia cuenta de Instagram** (la de kywai, no la tuya) y publicar ahí los reels que hace.
Se conecta con la **API oficial de Instagram**: nunca se pide ni se guarda la contraseña.

**Conectar la cuenta** (una vez, en ⚙ → Ajustes → Multimedia → Estudio de vídeo → «El Instagram de kywai»). El botón
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

**Con tu cuenta (la forma fácil).** Conecta tu Instagram profesional en **Mi cuenta → Apps conectadas** y pulsa
**Permitir que actúe** en Instagram. No hace falta app de Meta ni token: kywai publica con las herramientas de Instagram
de Apps conectadas (Composio), en kywai Cloud y en un kywai de casa enlazado con tu cuenta kywai. Cada reel gasta 3
acciones de Apps conectadas (leer la cuenta, preparar el reel y publicarlo) y usa el mismo enlace público al vídeo que
se explica abajo. Si Instagram está en Apps conectadas, se usa esto antes que el token; si falta «Permitir que actúe»,
Ajustes y la tarjeta lo dicen. El token de abajo queda como opción avanzada (y lo siguen usando «/ig-reply» y
«/instagram resultados»).

**Publicar.** **«/instagram [qué quieres en el texto]»** coge el último vídeo del chat (o el MP4 que adjuntes) y un
agente escribe el texto: gancho en la primera línea, una llamada a la acción y de 3 a 6 hashtags (si es un episodio de
`/serie`, repite la pregunta para votar). Sale una tarjeta con el vídeo y el texto, que puedes **cambiar** antes de
pulsar **Publicar** (también desde «Te necesita», en el escritorio, la web y Órbita). kywai le da el MP4 a Instagram:
con un token de Facebook (EAA…) lo sube desde el equipo (subida reanudable de Meta); con uno de Instagram (IG…, el
habitual), Meta no admite esa subida y solo acepta un **enlace público** (y lo mismo si rechaza la subida directa con un
token EAA, como pasa con los de usuario del sistema). Ese enlace sale:

0. **Del propio kywai** (enlace `/v/…`, el mismo de «/demo»), si kywai tiene una dirección pública con https: en
   **kywai Cloud** siempre (`https://<espacio>.nube.kywai.app`) o en casa si pones `KYWAI_PUBLIC_URL`. Dura 1 hora y
   se quita en cuanto Instagram termina; el vídeo no pasa por nadie más. Es lo primero que se prueba.
1. **Del propio equipo con Tailscale Funnel**, si Tailscale está conectado y la red permite Funnel. kywai arranca un
   servidor diminuto que solo entrega ese vídeo en una dirección con un código al azar (todo lo demás da «no
   encontrado»), lo abre con Funnel en el puerto 8443 (o 10000 si está ocupado) y lo cierra en cuanto Instagram
   termina. Nunca abre el 443, que es el acceso privado a kywai. Para permitirlo, una vez: en
   [login.tailscale.com](https://login.tailscale.com) → **Access controls**, añade el atributo `funnel` al equipo (el
   enlace exacto sale en el error si falta). Ojo: el nombre del equipo en Tailscale (`algo.ts.net`) es visible en
   internet mientras dura la publicación. Si Funnel solo se abre «dentro de tu red» (`tailscale funnel status` dice
   «tailnet only»), Instagram no llegaría al vídeo: kywai lo cierra, lo dice y pasa al siguiente.
2. Si no, de un **alojamiento temporal** que lo borra solo (Litterbox 1 hora, Uguu 3 horas o tmpfiles.org 1 hora: el
   primero que responda, cada uno con un reintento). Los que el DNS del equipo bloquea se saltan.

Si no sale ningún enlace, el error lo dice en una frase con el arreglo (publicar desde kywai Cloud o permitir Funnel).
**Filtros de DNS:** antes de publicar, kywai mira si el DNS del equipo bloquea la API de Instagram (la manda a
`0.0.0.0` o a una dirección privada, como hacen NextDNS, el DNS de Tailscale con filtro, Pi-hole o un router). Si es
así, no intenta nada y te dice qué dirección permitir en ese filtro (`graph.instagram.com` con tokens IG…,
`graph.facebook.com` con tokens EAA…). La API es la versión v23.0 de Meta.

Después espera a que Instagram lo procese y deja el **enlace** en el
chat. Si falla, la tarjeta dice por qué y tiene **Reintentar**: el error nombra el paso (preparar la publicación,
subir el vídeo, comprobarlo o publicar el reel), lo que contestó Meta y su código o `fbtrace_id`. Los errores 500
pasajeros de la subida se reintentan solos dos veces. Ninguna petición se queda colgada: cada paso tiene un tope de
tiempo (1 minuto; la subida, 2 minutos más 1 por cada 5 MB). Si cierras kywai a mitad de una publicación (de Instagram
o de TikTok), al volver a abrirlo la tarjeta queda como fallida, con **Reintentar**, en vez de seguir dando vueltas.

**Portada con gancho.** Sin portada, Instagram pone el primer fotograma, que en los vídeos de kywai suele salir negro
(así salieron los primeros reels de kywai_app). Ahora, antes del texto, kywai saca **12 fotogramas** del vídeo y hace
con ellos una **hoja numerada** (`.ai-cowork/portadas/<tarea>/hoja-de-fotogramas.jpg`) que se le **adjunta al agente
como imagen**, igual que una foto tuya: así la ve de verdad (con solo las rutas en el texto, Codex elegía a ciegas y
salía un robot con un letrero en vez de la protagonista). El mismo agente que escribe el texto propone **3 portadas**
en una última línea `PORTADAS: […]` que no acaba en el texto: para cada una, el fotograma que mejor cuenta de qué va
el vídeo (la persona o el objeto del que habla, sin subtítulos ni letreros si se puede) y un **gancho** de 2 a 5
palabras con un ángulo distinto (un número o resultado, una pregunta, una sorpresa). Tiene prohibidas las etiquetas que
solo describen («DE TARJETA A CAMPAÑA»), el título y la primera línea del texto. kywai hace cada portada como en
«/miniatura» (diseño «grande» o «caja», 1080×1920 en JPG, `<vídeo>-portada-1.jpg`…), con el texto dentro del
**recorte 3:4 de la cuadrícula del perfil** (Instagram quita 240 px arriba y abajo), y la tarjeta las enseña para
**elegir una** (va marcada la primera; con «Publicar sin preguntar» va la primera). Al publicar, la elegida va a
Instagram como `cover_url`, con un enlace de un **alojamiento temporal** (Funnel solo si ninguno responde: Instagram
baja la portada en el mismo momento de crear la publicación y un Funnel recién abierto en otro puerto aún no contesta,
lo que daba «Media download has failed»), y su fotograma como `thumb_offset`. Si la imagen no se puede subir o
Instagram no consigue bajarla, kywai vuelve a crear la publicación sin ella y el reel sale igual con ese fotograma.
Los errores de Instagram nunca enseñan la dirección del equipo en Tailscale (se cambia por «enlace de este equipo»). **Si adjuntas una imagen**
a «/instagram», esa es la portada (se recorta a 1080×1920) y el agente no diseña ninguna. Sin la app de escritorio (no
hay ventana para hacer la imagen) queda solo el fotograma. Instagram no deja cambiar la portada de un reel ya publicado
por la API: los publicados antes se cambian a mano en la app.

**Idioma.** El texto, los hashtags y los ganchos de las portadas van en el **idioma del vídeo**, no en el de la app:
si el vídeo salió de «/video», kywai lo sabe por su guion (`lang`); si no, el agente lo saca de los subtítulos o de la
voz. Lo mismo en «/tiktok».

**Publicar sin preguntar.** Con ese botón activado, lo que prepara «/instagram» se publica solo al terminar el texto,
también desde una **rutina** («/rutina cada día a las 18:00: /serie siguiente» y otra «… /instagram»). «Volver a pedir
mi visto bueno» lo desactiva. Por defecto está apagado.

**Reel de prueba.** **«/instagram prueba [qué quieres en el texto]»** hace lo mismo, pero lo publica como **reel de
prueba** (trial reel): Instagram lo enseña primero solo a quien **no** sigue la cuenta y, si funciona bien, lo pasa
solo a los seguidores (`trial_params` con `SS_PERFORMANCE` en la API). Sirve para probar un gancho o un formato sin
gastar a los seguidores. La tarjeta dice «Reel de prueba».

**Resultados.** **«/instagram resultados»** lee los números de los últimos reels (con Instagram conectado con un clic,
las analíticas de Zernio; si no, la API con el token: los últimos 12) (vistas, alcance, me
gusta, comentarios, guardados, envíos y tiempo medio de visionado), los guarda en
`<carpeta de trabajo>/instagram/resultados.md` (los mejores, los peores y una tabla con todos) y te dice en el chat
cuáles funcionaron mejor. Con **3 reels o más**, los guiones de `/video` y los textos de `/instagram` leen ese archivo:
copian la forma de los ganchos que funcionaron y evitan lo que tienen en común los que no. Vuelve a pedirlo de vez en
cuando (o en una rutina: «/rutina cada lunes a las 9: /instagram resultados») para que aprendan de lo último.

**Avisos de los resultados** (`resultAlerts` en `src/main/instagramLearn.ts`). Encima de todo, el archivo y el chat
dicen dos cosas cuando las hay:
- 🚀 **Ya funciona**: un reel que pasa de **100.000 vistas** (`PROVEN_VIEWS`) ya demostró que gusta a gente que no te
  conoce. kywai sugiere promocionarlo desde Instagram (por ejemplo, unos 20 $ al día unos días). **Nunca pone dinero
  solo**: lo decides tú.
- ✂️ **Se van en el gancho**: con 100 vistas o más y menos de **3 s** de visionado medio (`HOOK_DROP_SECONDS`). Instagram
  no da el segundo exacto en que se va cada persona, así que se mira la media. Los guiones de `/video` y el turno de
  noche (`/crecer`) leen el aviso y cambian el tipo de gancho en el siguiente.

Código: `src/main/instagram.ts` (la API), `src/main/instagramLearn.ts` (resultados) y
`sendInstagram`/`sendInstagramResults`/`publishPost` en el orquestador.

**Llevar la cuenta: las órdenes `/ig-…`.** kywai trae las habilidades de
[Instagram Agent Skill](https://github.com/postzen-dev/instagram-agent-skill) (licencia MIT, versión fija): la
primera vez que usas una, kywai descarga el paquete en `<carpeta de trabajo>/instagram/instagram-agent-skill/`, y un
agente con terminal (primero Claude) la sigue entera, sin pasar por el plan del coordinador:

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

Cuatro órdenes más vienen de [Claude Content Skills](https://github.com/ootto-ai/claude-content-skills) (licencia
MIT, versión fija), que se descarga aparte en `<carpeta de trabajo>/instagram/claude-content-skills/`:

| Orden | Habilidad | Qué hace |
| --- | --- | --- |
| `/ig-hook [idea o reel]` | Virality | Ganchos y guion con lo que funcionó y lo que no en 262 publicaciones reales (3,5 millones de vistas): qué hacer en los 3 primeros segundos. |
| `/ig-analyze enlace o vídeo` | Reel Analyzer | Desmonta un reel viral fotograma a fotograma y con su transcripción: gancho, estructura, ritmo y lo que se ve. Mejor con un vídeo adjunto o un Short de YouTube: Instagram no deja bajar sin sesión. |
| `/ig-mine` + CSV adjunto | Hook Mining | De un CSV de ganchos que funcionaron (tus números o los de la competencia), variantes que conservan la estructura y cambian solo las palabras clave. |
| `/ig-factory [nicho o idea]` | Content Factory | Todo el proceso de un reel de una vez: formato probado, estudio, gancho, guion, montaje, texto y la respuesta a los comentarios. Acaba con la orden `/video …` y, si quieres repetirlo, propone la `/rutina`. |

Funcionan igual que las otras: no publican ni escriben a nadie, y se salta lo que el paquete dice de Ootto (su servicio
de pago) y de Obsidian (se usa la memoria del proyecto).

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
en una rutina de madrugada («/rutina cada día a las 3:00: /turno-noche IA y productividad»). También vale `/crecer`
(desde la 1.15.4), `/maquina`, `/turno` o `/noche`. Es el bucle para que gente nueva descubra tu app sin salir en cámara:
estudiar lo que funciona en tu nicho, rehacerlo con tu voz, probarlo con desconocidos (reel de prueba) y afinar con los
números. Detrás va el nicho, unas cuentas o enlaces que quieras que mire (si no pones nada, lo saca de la
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

**Varios reels de prueba de una vez.** Con un número («/crecer 20 reels IA», «/turno-noche IA x3», «tres al día» o
«veinte reels», **hasta 20**, `NIGHT_SHIFT_MAX`) el turno hace una **tanda**: cada reel sale de un vídeo fuente distinto
y prueba otro tipo de gancho (pregunta, cifra, contradicción, antes y después, error común), para saber antes qué
funciona. Deja `desmontaje-1.md`, `guion-1.md`, `desmontaje-2.md`… y una orden `/video` por reel.

**El selector de `/crecer` (1.36.0).** Al escribir «/crecer» (o `/turno-noche`, `/maquina`…) sale encima del cuadro un
selector **en acordeón**, como el de `/video`: al elegir en un paso, ese se pliega con lo elegido y se abre el siguiente (se
puede volver a abrir cualquiera). Los siete pasos y «Lanzar» (que envía la orden):
1. **Número de vídeos** (1 a 20, `CRECER_MAX`).
2. **Tipo de vídeo:** rápido, presentador, mixto, charla o sketch, y una tarjeta **«Todos»** que da un tipo distinto a cada
   vídeo de la tanda (sin «Sorpréndeme» ni «Escenario 3D», que deciden o tardan demasiado).
3. **Personaje:** ninguno, los robots de kywai o los tuyos (para crear uno nuevo, `/video`).
4. **Estilo de animación:** el catálogo de `/video` (películas, aspectos de imágenes con IA), «Lo elige el agente» (como
   antes: uno de los estilos de kywai para reels) y una tarjeta **«Aleatorio»**: cada vídeo toma un estilo distinto al azar
   entre todos los que hay (los de película, menos los que piden material real, más los aspectos de imágenes con IA y el
   estilo de kywai), sin repetir hasta que se acaban.
   **Varios estilos a mano:** con más de un vídeo, el paso deja **marcar varios estilos, hasta tantos como vídeos** (películas y
   aspectos; se pulsa «Listo»): la tanda reparte los vídeos solo entre los marcados, sin repetir hasta que se acaban (marca
   `estilos:watercolor+ink-wash+plastilina`). Con menos estilos que vídeos, se reparten entre ellos.
5. **Voces:** automática, **«Aleatoria»** (una distinta del idioma elegido en cada vídeo) o una concreta, con ▶ para oírla.
   Al elegir una voz con idioma, el paso 6 se pone en ese idioma.
6. **Idioma** de los vídeos y de todos sus textos (gancho, subtítulos, rótulos): los de la app y los de las voces que haya.
   Sin una voz que lo fije, la orden lleva «en francés» (`videoLang` lo entiende desde la 1.36.0).
7. **Dónde hacerlos:** en kywai cloud, «En la nube» o «En mi equipo» (el equipo conectado, `equipo:si`); en la app de
   escritorio, «En este ordenador». Si falta algo (el estudio de vídeo, el agente que dirige las películas…), lo dice y
   ofrece «Instalarlo solo» (misma comprobación que `/video`, `checkVideoChoice`).

Lo elegido va **en el texto como marcas** (`tipo:todos`, `personaje:…`, `estilo:aleatorio` o `estilo:<película>`,
`aspecto:…`, `voz:aleatoria` o `voz:<id>`, `idioma:fr`, `equipo:si`, más «5 reels»), así que también vale escribirlo a mano,
desde la web o en una rutina («/rutina cada día a las 3:00: /crecer tipo:todos estilo:aleatorio 5 reels IA»). Sin marcas todo
sigue como antes (el agente elige el estilo). Con marcas, el agente solo escribe el tema y el guion de cada reel; **kywai pone
en cada orden «/video …» el tipo, el personaje, el estilo y la voz** en lugar de lo que escribiera el agente
(`applyReelOverride`) y reparte lo aleatorio entre los vídeos con `planReels` (`src/shared/crecerChoice.ts`, con pruebas). El
reparto solo usa lo que este equipo puede hacer (`src/main/crecerPlan.ts`: misma comprobación que `/video` y, con
`equipo:si`, lo que sabe hacer el equipo conectado); lo que aun así no salga va en **versión ligera** y el chat lo dice. En el
chat sale el «Reparto de la tanda» (tipo, estilo y voz de cada vídeo). Los vídeos llegan a la **mesa de revisión** de siempre
(portada de cada reel, un «Ve» y a la tabla de publicación): no se publica nada sin tu visto bueno salvo con «Publicar sin
preguntar». Código: `CrecerPicker.tsx` (interfaz, enganchada en `Composer.tsx`), `crecerChoice.ts`, `crecerPlan.ts`,
`nightShift.ts` y `completeNightShift` en el orquestador. Órbita (Android) no tiene el selector: las marcas escritas a mano
valen igual.

**Aprende qué estilos y voces funcionan (1.36.0).** Cada reel que sale de «/crecer» apunta en el registro de la máquina
(`instagram/maquina.json`) con qué se hizo: tipo, estilo (la **familia**: la categoría de la película, el aspecto de
imágenes o «Estilo de kywai»), voz e idioma (`traits`, de `Task.video` por `postNightShiftReel` → `sendInstagram` →
`recordPublishedReel`; las segundas vidas no cuentan). Cuando llegan los números (`/instagram resultados` o el refresco
automático), `updateTastes` (`reelMachine.ts`, lo puro en `src/shared/reelTastes.ts`, con pruebas) compara la **mediana de
vistas de cada familia y de cada voz con la mediana de toda la cuenta** y lo guarda en `instagram/gustos.json`. Con menos de
3 reels con números un grupo sale como «pocos datos» y no cuenta; «los que mejor funcionan» son los que tienen datos y
superan la mediana (como mucho 3). Sale en la sección «Qué funciona» de `resultados.md` y en el mapa de reels de
`/instagram resultados`. En el selector, los pasos 4 (estilo) y 5 (voz) tienen una tarjeta **«Los que mejor funcionan»**
(solo si ya hay datos; marcas `estilo:populares` / `voz:populares`): `planReels` reparte 7 de cada 10 vídeos entre lo popular
(que el equipo pueda hacer) y 3 entre lo demás, para seguir probando cosas nuevas. Sin datos, «populares» se comporta como
«aleatorio» y el chat lo dice. Cuando el agente elige el estilo (sin marcas de estilo), el encargo lleva esa lista como regla
(`learned` en `nightShiftPrompt`). El selector la lee con `api.reelTastes()`.

**La máquina de reels (1.23.0–1.23.3).** Lo que enseñaba un vídeo de una «máquina de reels» hecha con Claude (50 reels,
un «Ve», 5 al día, los ganadores a todas las redes y cada tanda aprende de la anterior), hecho con kywai y solo para
Instagram y TikTok:

- **Mesa de revisión (1.23.0).** Una tanda que se publica abre en el chat una tarjeta con todos sus reels en una
  **rejilla** (portada, gancho y estado). Van llegando según se hace cada vídeo («Haciéndose…» mientras tanto). Cada
  reel sigue teniendo su tarjeta de Instagram más abajo para cambiar el texto o la portada; en la rejilla se **quita**
  con la ✕. Un solo **«Ve»** (también en «Te necesita») los manda todos; «Descartar la tanda» descarta los pendientes.
  Los reels de una tanda no llenan «Te necesita» uno a uno: hay un solo aviso por tanda. Con «Publicar sin preguntar»
  la tanda entra directamente en la tabla. Código: `addToReelBatch`/`decideReelBatch` en el orquestador,
  `ReelBatchBlock.tsx`, tipos `ReelBatch` y `InstagramPost.batch`.
- **Tabla de publicación (1.23.1).** Con «Ve», los reels se reparten **N al día** (5 por defecto, de 1 a 10 en la
  tarjeta) entre las **10:00 y las 21:00** hora del equipo, siguiendo después del último ya programado
  (`src/shared/reelBatch.ts`: `daySlots`, `reelSlots`). Se **programan en Zernio** (`scheduledFor` en
  `zernioPublish`) como reels de prueba: Zernio los publica solos a su hora aunque el equipo esté apagado. La tarjeta
  pasa a enseñar la tabla por días con la hora y el estado de cada uno. Sin Zernio no hay programador: salen ahora los
  de hoy y el resto espera en la mesa (lo dice el chat).
- **Ganadores a TikTok (1.23.2).** Un **ganador** es un reel que hace **3 veces o más** la mediana de vistas de la cuenta
  (con 4 reels con números como mínimo; `winners` en `src/main/reelMachine.ts`). «/instagram resultados» (y el inicio
  de cada `/crecer`) lee los números con **las analíticas de Zernio** (`zernioReelStats`; si la cuenta de Zernio no
  tiene analíticas, con el token si lo hay) y, si TikTok está conectado, prepara cada ganador hecho por kywai para
  **TikTok** con su tarjeta de siempre (texto adaptado, enviar como borrador o publicar). Cada ganador se prepara una
  sola vez. Para saber qué vídeo es cada reel, kywai apunta lo que publica o programa en
  `<carpeta de trabajo>/instagram/maquina.json` (vídeo, gancho, duración e ids de Zernio e Instagram; sin el texto
  entero). Solo Instagram y TikTok por ahora (Yil, 24 nov): YouTube, LinkedIn y X quedan para más adelante.
- **Mapa de reels (1.23.3).** «/instagram resultados» enseña en el chat un **gráfico**: cada reel es un punto (vistas
  hacia arriba, segundos de visionado medio hacia la derecha), los ganadores en dorado y la línea del triple de la
  media. Debajo, **qué funciona**: el tipo de gancho que más gana, si los ganadores retienen más, su duración y sus
  ganchos literales (`reelLessons`). Eso mismo se guarda como sección «Qué funciona» en `instagram/resultados.md`, y el
  encargo de `/crecer` lo trata como la regla número uno de la tanda siguiente (la mayoría de los reels siguen esa
  fórmula y uno o dos prueban algo distinto). Al empezar cada `/crecer`, kywai actualiza los números antes de escribir.
- **Segunda vida del ganador (1.26.5; idea de Clip Drop).** Un ganador publicado hace **7 días o más** vuelve a salir
  **una vez** en Instagram con **otro texto y otra portada**: «/instagram resultados» (y el inicio de cada `/crecer`)
  prepara su tarjeta de siempre con «Publicar» (hasta 2 a la vez, los de más vistas primero; `pendingSecondLives` en
  `src/main/reelMachine.ts`). El agente recibe el gancho de la primera vez para no repetirlo. En el registro la
  segunda vida es otra entrada (`secondLife`) y el ganador queda marcado (`second`) para no repetirla. Con Zernio, al
  pulsar «Publicar» se programa a la mejor hora de Instagram de la cuenta (si ya se sabe).
- **Cada red a su mejor hora (1.26.6).** Con los números de cada red (Zernio da la hora de publicación de cada reel),
  `bestHour` (`src/shared/reelBatch.ts`) busca la hora entre las 10:00 y las 21:00 con más vistas (mediana; hace falta
  un mínimo de 6 publicaciones y 2 en esa hora) y la guarda en `<carpeta de trabajo>/instagram/horas.json`. Instagram:
  la tabla de publicación de `/crecer` mueve su hueco más cercano a esa hora (con uno al día, va a ella). TikTok:
  «Publicar» directo (con un clic) se programa a la mejor hora de TikTok y **nunca a menos de 2 horas** de cuando ese
  mismo vídeo sale en Instagram (`nextHourSlot`); la tarjeta dice «Programado en TikTok para el …». Un borrador de
  TikTok no se puede programar y va al momento. «/instagram resultados» dice las horas que ya sabe. Solo Instagram y
  TikTok por ahora.

Todo queda en `<carpeta de trabajo>/instagram/turno-noche/<fecha>/` (`elegidos.md`, `fuente/`, `desmontaje.md`,
`guion.md` y los datos de la cuenta). Código: `src/main/nightShift.ts` (el encargo y la orden del vídeo) y
`sendNightShift`/`completeNightShift`/`postNightShiftReel` en el orquestador; el vídeo lleva `afterwards: 'ig-trial'`.

**Tu cliente ideal (`/cliente-ideal`).** «/cliente-ideal dueños de cafeterías que no tienen tiempo para redes» (también
`/cliente` o `/publico`) hace que un agente escriba la ficha de la persona para la que escribes en `cliente-ideal.md`,
en la carpeta del proyecto: quién es, qué le duele, qué quiere conseguir, cómo habla (palabras que usa y que nunca
usaría), qué ha probado, qué le frena, dónde está y cinco ganchos para él. Sin nada detrás, propone una a partir del
proyecto y marca con «(supuesto)» lo que se inventa. Si ya existe, la pone al día sin borrar lo que escribiste tú. Puedes
editar el archivo a mano. Desde que existe, la leen solos los guiones de `/video` (también los de estilo de película),
las órdenes `/ig-…`, el `/turno-noche` y el texto de `/instagram`: el gancho nombra un problema o un deseo suyo, con sus
palabras. Código: `src/main/idealCustomer.ts` (+ test).

**«Comenta PALABRA y te mando el enlace» (`/instagram palabra`, 1.34.0).** Muchos reels acaban con «comenta X y te
mando el enlace». «/instagram palabra KYWAI https://kywai.app» lo activa: cada 10 minutos, mientras kywai está abierto,
mira los comentarios de las 10 últimas publicaciones y a quien comente esa palabra (suelta, sin importar mayúsculas ni
tildes) le manda por privado «¡Gracias por comentar! Aquí tienes el enlace: …». Una vez por comentario, como mucho 20
por vuelta, nunca a la propia cuenta y solo a comentarios hechos después de activarlo (nadie que comentó hace meses
recibe nada). «/instagram palabra» dice la palabra, el enlace, cuántos lleva y el último fallo; «/instagram palabra
quitar» lo apaga. Usa la «respuesta privada» de la API de Instagram (una por comentario, en los 7 días siguientes), así
que hace falta la cuenta conectada con el **token de Meta** (opciones avanzadas) con el permiso de mensajes
(`instagram_business_manage_messages`, o `instagram_manage_messages` con un token de Facebook); con solo Zernio o Apps
conectadas no funciona y lo dice. Sale de los reels de Prism y vgpu que acaban así. Código: `keywordComments`,
`privateReply` y `parseKeywordRequest` en `src/main/instagram.ts` y `checkInstagramKeyword` en `orchestratorSocial.ts`.

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

**Conectar la cuenta** (⚙ → Ajustes → Multimedia → Estudio de vídeo → «El TikTok de kywai»): pega la clave y el
secreto y pulsa **Guardar**; luego **Iniciar sesión en TikTok**, autoriza la cuenta de kywai y, cuando el navegador
llegue a la página de localhost (que no carga, es normal), **copia esa dirección entera** y pégala en kywai →
**Conectar**. Funciona aunque kywai corra en el servidor y tú estés en otro equipo. El acceso dura 24 horas y kywai lo
renueva solo durante un año; todo se guarda **cifrado** con el llavero del sistema. Si dejas el inicio de sesión a
medias (cierras kywai antes de pegar la dirección), al volver a Ajustes sigue el cuadro para pegarla durante 30 minutos;
pasado ese tiempo un aviso te dice que lo repitas.

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
- **Portada:** el agente que escribe el texto elige también el fotograma de portada entre 12 del vídeo, que ve en la
  hoja numerada que se le adjunta (sin eso TikTok pone el primero, que suele salir negro). Al publicar directo va como `video_cover_timestamp_ms` y la tarjeta dice de
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

### El coordinador te propone habilidades

Cuando una petición es de un campo especializado (un framework, un formato de archivo, un tipo de diseño, marketing,
seguridad, datos…) y el coordinador cree que una habilidad escrita por otros ayudaría a hacerlo mejor, en su plan pone una
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

Pides un vídeo y te llega **solo el vídeo**: un MP4 que sale en el propio chat como miniatura con ▶ (clic para verlo en grande; flecha de descargar al pasar el ratón). Sin
plan que aprobar, sin informes ni archivos sueltos.

**Cómo se pide** (en el escritorio, la web, Órbita y las rutinas):

- **Con el selector de cuatro pasos** (escritorio, web y Órbita): al escribir `/video` se abre encima del cuadro un panel con
  **1. Tipo de vídeo** (rápido con texto animado, dibujos con presentador o mixto), **2. Personaje** (ninguno, los
  robots de kywai, los que hayas creado o «Agregar personaje»), **3. Estilo de animación** (el de kywai, rápido, o
  uno de los 80 estilos de película con su muestra, o uno de los 9 aspectos de «Imágenes con IA», que puedes
  probar antes con tu escena) y **4. Voz** (automática o una concreta, con ▶ para oírla).
  Después solo escribes de qué va. Ver «Elegir tipo, personaje, estilo y voz» más abajo.

- `/video cómo nace una estrella`, o con palabras: «créame un vídeo de…», «hazme un vídeo corto sobre…», «make a
  video about…».
- **Vertical** para TikTok, Reels o Shorts: `/video vertical …`, «…para TikTok», «…para reels». Si no se dice nada,
  sale horizontal (16:9, YouTube).
- **De un mensaje**: el botón **«Crear vídeo de esto»** bajo cualquier respuesta con texto, o escribir «créame un vídeo
  de esto» (usa la última respuesta del chat).
- **Periódico**: con una rutina, por ejemplo `/rutina cada lunes a las 9: /video las novedades de la semana`.

**Reels y vídeos siempre por el estudio, nunca como tarea a mano (1.5.4).** Un vídeo o un reel lo monta el Estudio de
vídeo en minutos. Si quien coordina lo encarga como una tarea normal («Producir vídeo de lanzamiento…»: un agente que
abre un navegador para grabar la app, instala programas y monta el vídeo de cero), kywai se lo devuelve una vez para
que use la orden del estudio: `/video vertical … usa el guion de <archivo>` para un tema, o
`/demo <web> vertical [presentador] [qué destacar]` para un reel de una app o una web con sus pantallas reales
(`kywai.app` para la propia kywai). Si aun así sale como tarea, lleva tiempo tasado: aviso en el chat a los 10 min sin
novedades y a los 15 min de trabajo, y a los 30 min kywai la corta con la orden rápida lista para pulsar; lo que llevaba
hecho se queda en la carpeta del proyecto. Escribir antes el guion en una tarea sí vale. Código:
`src/shared/videoByHand.ts` (qué tarea cuenta, el aviso a quien coordina y la orden rápida), `planRun` y
`videoByHandGuard`/`videoByHandCut` en `orchestrator.ts`. Origen: el 23 nov un reel de lanzamiento llevaba 43 minutos
así y sin vídeo.

**Vídeo explicativo con los personajes de kywai (1.14.0).** Con los robots de kywai como personaje, los tipos
«Dibujos con presentador» y «Mixto» ya no generan imágenes con IA: salen como un **vídeo de motion graphics**, el
estilo de los buenos reels de producto. Fondo oscuro con foco, anillos finos y puntitos; arriba la sección de la escena
(«01 — EL PROBLEMA»); un **titular grande que cambia con cada frase** y es exactamente lo que dice la voz, con la palabra
clave en el color de quien habla (verde la cotorra **kywai**, naranja la gota **Claude**, verde esmeralda el cubo
**Codex**); en el centro, los personajes con sus formas de la app, que **botan con cada palabra** y respiran cuando
callan; y una **pieza de interfaz animada** por escena que ilustra lo que se dice: el cuadro de petición que se escribe
solo (`prompt`), fichas que se amontonan (`chips`), tareas que se completan (`tasks`), una lista que se marca
(`checklist`) o se tacha (`strike`), una cifra que sube (`counter`), antes y después (`compare`), una ventana «LIVE» con
el equipo trabajando (`window`), el archivo terminado (`result`), el enlace final (`link`), el equipo junto (`team`) o
nada (`none`). La pieza la elige el agente que escribe el guion, frase a frase (`explainerScriptPrompt` en
`videoScript.ts`), y kywai la valida (`src/main/explainerProps.ts`). En pantalla nunca sale «Hermes»: la cotorra es
kywai. Va en vertical y en horizontal, con o sin «Diálogo» (kywai y Claude). Código: estilo `explicador`
(`VIDEO_STYLES`), `buildExplainerComposition` en `src/main/videoExplainer.ts`, `robotForms` en `videoCharacters.ts` y el
cambio de estilo en `sendVideo` (`orchestrator.ts`). Origen: el 23 nov un vídeo de presentador con los robots salió con
imágenes feas e inapropiadas que no casaban con lo que se decía, «HERMES» como nombre y la cotorra en una tarjeta que se
balanceaba sin parar; Yil pidió el estilo de un reel de referencia (la medusa).

**Siempre con peluches y atrezo (1.30.2).** El 24 nov un reel «What is kywai?» salió sin ningún personaje y sin ninguna
pieza animada: un titular arriba y la pantalla vacía 67 s. Dos causas: (1) las imágenes de los peluches las ponía en
marcha solo `index.ts`, y el **modo cliente** (el equipo que monta los vídeos de kywai cloud, `videoWorker.ts`) arranca
por `bootClient` y nunca llegaba ahí, así que `robotForms()` volvía vacío; ahora lo hace `src/main/videoAssets.ts`
(`initVideoAssets`, también el decorado del Escenario 3D) desde los dos caminos, y si aun así faltan, `renderVideo` para
con el motivo en vez de entregar un fondo vacío. (2) El guion llegó sin `prop`: ahora `completeVideo` devuelve una vez
al agente el guion explicativo con atrezo en menos de 3 de cada 4 escenas (`explainerPropsProblem`, «team» y «none» no
cuentan) y, si vuelve igual, rellena lo que falta (`fillExplainerProps`: la primera escena presenta al equipo y el resto
saca a los personajes en grande).

**Titular al centro (1.30.3).** El titular va arriba porque debajo están los personajes y el atrezo. Si en una escena no
hay ni lo uno ni lo otro, `buildExplainerComposition` lo baja al centro de la pantalla y lo hace un 45 % más grande, en
vez de dejar un fondo vacío.

**«Sorpréndeme» (1.15.0).** Un tipo más de vídeo en el selector de «/video» (marca `tipo:sorprendeme`, o escribirlo:
«/video sorpréndeme …», «/video surprise me …»): el usuario solo da el guion o el tema y **la IA decide cómo hacer el
vídeo**. La tarea tiene dos pasos con el mismo agente: primero lee el texto y elige (`surprisePrompt` en
`src/main/videoSurprise.ts`) el **tipo** —vídeo explicativo con los personajes de kywai, texto animado con imágenes,
charla y tutorial o sketch de humor; en kywai cloud no se ofrecen los dos últimos (plató 3D)—, el **formato** (si el
usuario no dijo vertical u horizontal), si va en **diálogo**, las **voces** (de las del idioma del vídeo), la
**música** (`calma`, `normal` o `energia`: cambia el tempo y el bombo de `synthMusic`) y el **ritmo** y el tono, con una
frase de por qué. kywai lo valida (`parseSurprisePlan`: lo que no vale queda por defecto, nunca falla), lo pasa por la
comprobación del equipo (`preflightVideo` en versión ligera), lo cuenta en el chat («Sorpréndeme: lo hago como…») y la
tarea vuelve a la cola para escribir el guion de ese tipo con la dirección elegida (`completeSurprise` en
`orchestrator.ts`). Lo que el usuario sí eligió (la voz, el formato) no se cambia. En el selector, con «Sorpréndeme» se
ocultan personaje, estilo y estructura; la voz se puede elegir igual. Órbita (Android) aún no lo tiene en su selector.
Origen: Yil, 23 nov: «una plantilla que se adapte al guion… solo le damos el guion y ya».

**«Escenario 3D» (1.18.1).** Otro tipo del selector de «/video» (marca `tipo:escenario`, o escribirlo: «/video
escenario …», «estilo escenario», «escenario 3D»). Es el vídeo explicativo de siempre (mismo guion, voz, titulares y
atrezo de interfaz), pero **dentro del monitor de un decorado 3D fijo y acogedor**: un escritorio de madera de noche,
ventana con la ciudad desenfocada, flexo cálido, libros con una planta y una taza, y **la cotorra de kywai sobre unos
libros, que abre el pico con la voz** (el volumen de cada voz, fotograma a fotograma: `mouthEnvelope` en
`src/main/escenarioPlan.ts`), respira, se balancea y parpadea. Fluye porque el decorado no cambia: solo **cortes secos
entre cuatro planos** (general, cerca, más cerca y final) al empezar cada escena y a mitad de las de más de 7 s, con un
leve empuje de cámara (`escenarioShots`). Va en vertical salvo que se pida horizontal (las cámaras cambian para cada
formato). Cómo se hace (`src/main/videoEscenario.ts`): el explicativo se monta en horizontal con HyperFrames, pasa a
24 fps y es la textura del monitor; **Blender** (gratis) pinta cada fotograma con EEVEE (`src/main/escenario/escenario.py`,
vale para Blender 4.2 y 5.x; modelos de Meshy reducidos: `cotorra.glb` y `atrezo.glb`, y `ciudad.png`) y ffmpeg lo junta
con el audio del explicativo. Tarda: unos 1,7 s por fotograma en un Mac M4 con Blender 5.3 (medido; un reel de 45 s, ~35 min). **Sin Blender**, en
el equipo kywai lo instala solo con el primer vídeo (`installProgram('blender')`, el paquete oficial por winget,
Homebrew o Flathub; el selector lo avisa) mientras se hacen la voz y las imágenes. **En kywai cloud** va al equipo
conectado con «Conectar kywai cloud con este PC» (`deviceBridge.video(…, 'blender')`: antes uno que ya tenga Blender);
sin equipo conectado sale el explicativo sencillo y el chat dice cómo tener el escenario. Si Blender falla a mitad, el
vídeo sale igual como explicativo en el formato pedido (`escenario: false` en el resultado y una nota en el chat).

*Arreglos de la 1.30.14.* En kywai cloud sin equipo conectado ya no se niega: el selector solo avisa (nota, no
bloqueo) y sale el explicativo con los personajes. Dentro del monitor ya no salen los personajes 2D (la cotorra 3D
está delante) y los titulares son un 40 % más grandes para que se lean en la pantalla pequeña (`screen: true` en
`buildExplainerComposition`). Si el equipo que lo montó tiene una kywai anterior a la 1.18.1 (no conoce el estilo y
devuelve el explicativo sin decir nada), el chat lo dice y pide actualizar ese equipo (⚙ → Ajustes → Acerca de).
Origen: Yil, 23 nov, con un reel de referencia: «se ve bonito, fluido, interesante… con volumen»; la muestra con Meshy y
Blender en su Mac mini le gustó («mucho mejor»).
- **Dibujos con personaje** (tutoriales): «créame un vídeo estilo cartoon de…», «…de dibujos animados…», «hazme un
  vídeo tutorial de…», «…con un personaje…». Ver más abajo.
- **Con un estilo de película** (acuarela, Pixel RPG, años 30, ukiyo-e… 73 en total): eligiéndolo en el selector con
  muestras que sale al escribir `/video`, o «/video estilo acuarela sobre…». Ver «Estilos de película» más abajo.

**En kywai cloud: el estudio ligero.** Desde el 19 de noviembre de 2026, cada cuenta de kywai cloud vive en un espacio
pequeño (2 CPU, 2 GB de memoria, sin gráfica). Ahí no cabe todo el estudio, así que la nube usa el **estudio ligero**:
HyperFrames con su navegador, la voz Kokoro, Edge y Gemini, Manim, la música y los efectos. Viene **ya instalado en la
imagen** y lo comparten todas las cuentas en solo lectura (`/opt/kywai-video`, variable `KYWAI_VIDEO_COMPARTIDO`), así
que una cuenta no descarga nada para hacer vídeos. Al arrancar, la app enlaza esos programas en la carpeta
`estudio-video` de la cuenta (`src/main/videoCloud.ts`). Si la cuenta ya tenía algo instalado, lo deja apartado con el
nombre `….antes-compartido` y no borra nada. En la nube **no se instalan ni se usan Chatterbox (la voz con emoción) ni los
estilos de película**: se cortaban por falta de memoria. Los **vídeos van de uno en uno** y el render usa el modo de
poca memoria (`PRODUCER_LOW_MEMORY_MODE`). Cada despliegue hace un **vídeo de prueba de 10 s** con el mismo límite que
una cuenta (`/opt/kywai-video/prueba-video.sh`) y no despliega si no sale. Lo pesado va en el **estudio Pro**, en la
app de escritorio del equipo de cada uno (abajo).

**El estudio Pro: kywai mira tu equipo y le instala lo que aguanta** (21 nov 2026, `src/shared/studioAdvisor.ts`).
⚙ → Ajustes → Multimedia → Estudio de vídeo tiene la tarjeta **«Tu equipo»**: la memoria, la tarjeta gráfica y el
disco libre del equipo (`hardware.ts`), el nivel que le toca (**ligero**, **completo** o **Pro**) y, pieza a pieza, si le
va bien o por qué no. El botón **«Instalar el estudio Pro (N GB)»** lo instala todo de un clic (`installVideoStudioPro`
en `videoStudio.ts`). Reglas de `adviseStudio`:

| Pieza | Le va bien con |
|---|---|
| Motor, voz Kokoro y efectos | 4 GB de RAM |
| Manim y estilos de película | 8 GB |
| Plató 3D con los robots | 8 GB y 4 núcleos (o una gráfica) |
| Voz con emoción (Chatterbox) | 16 GB (o 12 GB con una NVIDIA de 12 GB) |
| Imágenes con tu gráfica (ComfyUI) | NVIDIA de 6 GB, o Mac con chip de Apple y 16 GB |
| Clips con movimiento (Wan 2.2 TI2V 5B) | NVIDIA de 8 GB y 32 GB de RAM (en el Mac va demasiado lento) |

Todo junto debe caber en el disco con 10 GB de margen; si no, se deja fuera lo más pesado primero (Wan, ComfyUI,
Chatterbox…). Wan baja sus tres archivos oficiales de Comfy-Org (≈18 GB, Apache-2.0) a la carpeta de ComfyUI y sigue
donde se quedó si se corta. Lo que no le cabe al equipo **tampoco se instala solo** al arrancar ni con el primer vídeo
(antes, un portátil de 8 GB instalaba Chatterbox y se quedaba colgado), y no cuenta como «falta» para reintentarlo cada día.

**Al pedir un vídeo o una imagen, kywai ofrece el estudio** (`src/shared/studioOffer.ts`, `src/renderer/src/ui/left/StudioOffer.tsx`).
Cuando escribes `/video …` o una frase clara como «hazme un vídeo de…», «créame una imagen de…», «dibújame…» o «make an
image of…», encima del cuadro de escribir sale un aviso con lo que kywai ha visto del equipo (memoria, gráfica, disco),
el estudio que le va bien y lo que falta, con el botón **«Instalarlo solo»** (un clic; la app de escritorio con kywai
cloud pregunta antes). Para un vídeo cuenta todo lo que le cabe; para una imagen, solo dibujar con la gráfica (ComfyUI;
no sale si ya dibuja con ComfyUI o Draw Things, ni si el equipo no tiene gráfica que aguante). Solo sale si falta algo;
una vez que sale se queda aunque envíes el mensaje (para no cortar la instalación) hasta cerrarlo. **«Ahora no»** lo
esconde para ese tipo de petición (se guarda en el navegador o la app); la tarjeta entera sigue en Ajustes → Multimedia → Estudio de vídeo. En kywai cloud desde el navegador no sale: el navegador no puede mirar el equipo.
Mientras instala, el aviso y la tarjeta de Ajustes enseñan una **barra con el %** (`src/shared/studioProgress.ts`):
cada paso de la instalación tiene su peso (lo que suele tardar), los de piezas que no caben no cuentan, el «45%» de
una descarga mueve la barra dentro del paso, y debajo salen el paso en curso, cuánto lleva y la última línea, para ver
que no se ha quedado parado. Se pregunta cada segundo (`videoStudioInstallProgress`, o `client:videoStudioProgress`
en la app con kywai cloud). Nunca va hacia atrás y solo llega al 100 % al terminar.

**Vídeos de kywai cloud hechos en tu equipo** (`src/main/videoOnDevice.ts` en la nube, `src/main/videoWorker.ts` en
la app). Con kywai cloud, la misma tarjeta sale en la app de escritorio como **«El estudio Pro en este equipo»**: analiza
ESTE equipo, instala aquí su estudio (la app pregunta antes) y enciende **«Hacer aquí los vídeos de kywai cloud»**
(apagado de serie; se guarda en `videos-en-este-equipo.json` de la carpeta de la app). Así funciona:

1. En la nube, el agente escribe el guion como siempre.
2. Si el vídeo se pidió para hacerlo en tu equipo (botón **«Hacerlo en {equipo}»** del aviso del selector de `/video`
   cuando la nube no puede, o la marca `equipo:si`), el montaje no se hace en el espacio: el encargo (guion, formato,
   voz, aspecto y hasta 4 imágenes de referencia, 12 MB como mucho) viaja al equipo por el **mismo puente** que presta
   los modelos locales (`deviceBridge.ts`, la conexión sale siempre del equipo, no se abre ningún puerto).
3. El equipo lo monta con su estudio Pro y va contando el avance (sale en la tarjeta de la tarea como siempre). Usa la
   gráfica, así que espera su turno con las peticiones a los modelos.
4. Sube el MP4 en trozos de 8 MB (`POST /api/mobile/v1/bridge/file/<id>?offset=N`, solo con la llave de ese
   dispositivo; si un trozo falla, pregunta dónde se quedó y sigue) y la tarea entrega el vídeo con el nombre del título.

Si el equipo se apaga o se desconecta a mitad, la tarea falla diciendo qué pasó. Por el puente solo va el encargo y
vuelve el MP4: ni archivos del equipo ni órdenes. «Hacer los vídeos» funciona aunque «Prestar los modelos de este
equipo» esté apagado: entonces el equipo no contesta ninguna petición a sus motores.

**Estilos de película hechos en tu equipo** (1.30.63, 25 nov 2026, `src/main/filmOnDevice.ts`). En la nube los estilos
de película (blueprint, acuarela, urban sketch…) no caben: los dirige un agente con terminal que renderiza con la
biblioteca del estudio Pro. Hasta la 1.30.62 la nube quitaba el estilo y, con «equipo:si», el vídeo salía siempre igual
(Yil: «me da el mismo vídeo continuamente, no toma el estilo visual»). Ahora:
1. Con un estilo elegido y el equipo conectado con la biblioteca de películas instalada (`films` en lo que cuenta el
   equipo), el selector ofrece «Hacerlo en {equipo}» y, sin tocar nada, la orden se manda allí (como el plató 3D).
2. La tarea no lanza un agente en la nube: manda el encargo por el puente (`deviceBridge.video(…, 'films')`, antes un
   equipo con la biblioteca): estilo, tema, formato, idioma, tipo (charla, sketch…), voces, diálogo, estructura, el
   personaje (los robots los tiene el equipo; uno guardado viaja con hasta 4 imágenes), el episodio de la serie y hasta
   4 imágenes adjuntas.
3. En el equipo, su propio agente (el primer Claude encendido, si no Codex, si no otro con terminal que no sea un modelo
   local) la dirige con el mismo encargo que en el escritorio (`filmPrompt`) en `.ai-cowork/peliculas-nube/<carpeta>` de
   su carpeta de trabajo, y devuelve el MP4 y su respuesta («Título: …»). Necesita permiso para trabajar sin preguntar a
   cada paso: «Acceso completo» en Ajustes → Agentes o, con la app en modo nube, «Películas con estilo» en Este PC (ver
   abajo); si falta eso, la biblioteca o un agente, lo dice antes de empezar.
4. La nube deja el MP4 como `pelicula.mp4` en la carpeta de la película y sigue como siempre (`completeFilm`): kywai lo
   comprueba (negro, congelado, silencio), otro agente lo revisa y, si hay que corregir, la corrección vuelve al mismo
   equipo y a la misma carpeta (la ruta de la nube se cambia por la del equipo). Las carpetas de más de 3 días se borran
   al empezar otra.
Lo que gasta el agente del equipo va con la cuenta de ese agente en el equipo, no con los créditos de la nube.

**Con la app en modo kywai cloud** (1.31.0, 25 nov 2026, `src/main/videoWorker.ts`). En la 1.30.63 el equipo buscaba el
director solo entre los agentes de su configuración, y la app en modo nube (un MacBook conectado a kywai cloud) no tiene
agentes propios ni dónde añadirlos: la película fallaba siempre con «En este equipo no hay un agente con terminal», y la
nube se la pasaba a Codex, que iba al mismo equipo y fallaba igual (Yil, 25 nov). Ahora:
- **Quién dirige** (`deviceFilmDirector`): el agente de la configuración del equipo si lo tiene; si no, el **Claude
  Code, Codex o Gemini instalado** en él (en ese orden; antes de buscarlos lee el PATH de la terminal, que la app en
  modo nube no leía al arrancar).
- **El permiso** es el interruptor **«Películas con estilo»** de ⚙ → Ajustes → Este PC → «Elegir qué hace» (archivo
  `peliculas-desde-la-nube.json` de la carpeta de datos). Va dentro de «Vídeos» (las películas viajan por el mismo
  puente, que con «Vídeos» apagado no acepta ningún vídeo): sin elegirlo nunca va con él, y «Conectar kywai cloud con
  este PC» lo enciende y apaga con lo demás. Sustituye en modo nube al «Acceso completo», que allí no existe.
- **El equipo solo anuncia películas si puede de verdad** (`withFilmDirector`): biblioteca, permiso y director. Si no,
  manda `films: false` con el motivo (`filmsMissing`: `library`, `permit` o `agent`), la nube no se la manda y
  `/video` dice antes de empezar qué le falta a tu equipo (`FILM_MISSING_TEXT` en `src/shared/videoPreflight.ts`).
- **Sin relevo inútil**: si el equipo dice que no puede o no está conectado, la tarea falla una vez con el motivo
  (`noRelay` en el resultado); solo un corte a mitad del envío se vuelve a intentar con otro agente.
- **El aviso del selector dice la verdad** (`onDeviceNote` en `src/shared/videoPreflight.ts`, 25 nov 2026). Con «en tu
  equipo» elegido y el equipo conectado pero sin poder hacerlo, antes decía «Tu equipo no está conectado» (el selector
  solo recibía el nombre del equipo si podía hacerlo) y Yil buscó el fallo en la conexión. Ahora `checkVideoChoice`
  devuelve también `connected` (el equipo conectado aunque no pueda) y `filmsMissing`, y dice «MacBook-Pro está
  conectado, pero no puede hacer este vídeo tal cual:» con lo que le falta.
- **Instalar el director con un clic**: si lo que falta es el agente y el selector se ve en la app de escritorio de ESE
  equipo (`coworkClient.info().device` igual al equipo conectado), salen **«Instalar Claude Code»** e **«Instalar
  Codex»**. La app pregunta antes con una ventana nativa (Instalar o Cancelar; IPC `client:installFilmDirector` en
  `src/main/client.ts`), lo instala con el instalador oficial (`installTool`), abre la ventana para iniciar sesión
  (`openLogin`) y avisa a la nube (`forgetDeviceStudio` + `nudge`); el selector vuelve a mirar a los 4 s. En el
  navegador u otro equipo no hay botón: el aviso dice qué instalar.

**Antes de empezar: ¿se puede hacer aquí?** (21 nov 2026, `src/shared/videoPreflight.ts`). Un sketch con los robots se
quedó casi 4 horas «trabajando» en la nube: el estilo de película se quitaba sin avisar, los robots pasaban al plató 3D y
ese 3D, sin gráfica y con 2 GB, no terminaba nunca. Ahora el selector de `/video` mira lo elegido contra lo que tiene el
equipo y lo dice **antes de enviar**, debajo de la barra del vídeo:
- **No se puede aquí** (en la nube: los estilos de película, que llevan «Solo en tu equipo» en su tarjeta, y los robots
  de kywai en el plató 3D): explica qué y ofrece **«Hacerlo en versión ligera»**, que cambia solo eso por lo más
  parecido que sí sale (sin película: estilo de kywai; robots: dibujados en cada plano si hay con qué dibujar, o un vídeo
  rápido sin ellos). Elegirla añade la marca `ligero:si`.
- **Falta instalar algo** (el estudio de vídeo en el equipo): «Instalar ahora». Si no se pulsa, se instala solo con el
  primer vídeo, como siempre.
- Desde la 1.30.61 el estilo de película **sí se usa en charla y sketch** (antes se ignoraba y salía siempre el plató 3D;
  Yil: «cada vídeo tiene que salir con el estilo que el usuario seleccionó»): ya no hay nota de «no se usa».
El motor lo vuelve a mirar al recibir la orden (vale igual escrita a mano, desde la web, Órbita o una rutina): si algo
no se puede y no lleva `ligero:si`, **no empieza** y dice qué pasa y cómo seguir. En la nube el plató 3D no se usa nunca.
Los avisos ocupan su propio sitio entre la barra del vídeo y el cuadro de escribir, uno debajo de otro (1.13.1, 23 nov):
antes salían flotando encima del texto de la orden, de enviar y de «Hablar con kywai» porque su clase CSS se llamaba
igual que la marca redonda de las tarjetas (`.check`, posición absoluta). Ahora es `.preflight` en
`VideoPicker.module.css`; no reutilizar `.check` para otra cosa en ese archivo.

**Nunca colgado.** El render se para solo si pasa **10 minutos sin avanzar** o **40 minutos** en total, y entonces se
cierra **con todo lo que abrió** (el navegador oculto y ffmpeg, que antes se quedaban vivos y dejaban a kywai esperando
para siempre); «Detener» también lo cierra todo. Si lo que se trabó era el plató 3D, se intenta **una vez** sin plató
(«El plató 3D no salió: lo intento en versión ligera»); si tampoco sale, la tarea pasa a **Falló** con el motivo en
palabras normales. Mientras monta, la tarjeta enseña el porcentaje («Animando y montando el vídeo (45 %)»), y el guion
que escribe el agente sale como «Guion listo: título» en vez del JSON en bruto.

**Qué pasa por dentro.** Un agente (el mejor para redactar que esté libre; mejor uno en la nube que un modelo local)
escribe solo el **guion** en JSON, pensado para enganchar a quien tiene poca paciencia: título, de 5 a 9 escenas cortas
(la primera, un gancho de menos de 3 segundos) con su etiqueta, una frase de voz por escena con sus palabras clave
marcadas entre *asteriscos*, una descripción de la imagen de cada escena, un tema de color y la frase final. Si el guion no vale (por ejemplo, el agente lo
escribe como un guion de cine en vez de en JSON), primero el mismo agente lo repite una vez sabiendo qué falló; si vuelve a
fallar, pasa a otro agente, aunque la tarea ya viniera de un relevo. Para el relevo de un guion se prefieren los agentes
que no dicen evitar el vídeo: Aider y los demás agentes de código del catálogo solo si no queda nadie más. kywai encuentra
el JSON aunque venga con texto alrededor, entre varios bloques, dentro de una edición de Aider o con comas de más. El nombre de la
tarea (y de sus avisos) sale limpio aunque el tema venga en Markdown: «Vídeo: The Wrong Address», sin «#» ni «**». Lo demás lo
hace kywai siempre igual (`src/main/videoStudio.ts`):

1. **Voz** de cada escena con Voicebox o Gemini si los hay (ver «Voz» más abajo) y si no con **Kokoro** (natural, gratis, en el propio equipo; español, inglés, francés, portugués,
   italiano, japonés, chino e hindi). Sin Kokoro, la voz del sistema (`say` en macOS, la de Windows, espeak-ng en Linux).
2. **Imágenes.** Si **Draw Things** está abierto en el Mac con su API Server, va primero (ver «Imágenes con Draw
   Things»); tras dos fallos seguidos, sigue con lo de abajo. Si no, por defecto, con **ComfyUI** (comfy.org) si está encendido en el equipo donde corren los agentes:
   gratis, sin clave y sin salir del equipo. kywai lo busca en `http://127.0.0.1:8188` y, si no, en
   `http://127.0.0.1:8000` (el de la app de escritorio; otra dirección con la variable `KYWAI_COMFYUI_URL`), usa el primer modelo SDXL que tenga (o SD 1.5; otro con `KYWAI_COMFYUI_CHECKPOINT`;
   FLUX y SD3 necesitan otro flujo y se saltan; **Qwen-Image** (Apache-2.0) sí tiene el suyo: si ComfyUI tiene su modelo
   —safetensors o el GGUF oficial con el nodo ComfyUI-GGUF—, su codificador `qwen_2.5_vl_7b` y su VAE, dibuja con él
   cuando no hay checkpoint o con `KYWAI_COMFYUI_CHECKPOINT=qwen`, a 1664×928; es más lento y escribe mejor.
   **FLUX.2 [klein] 4B** (Apache-2.0, `pickFlux`/`fluxWorkflow`) también: si ComfyUI tiene el destilado
   (`flux-2-klein-4b.safetensors` o `flux-2-klein-4b-fp8.safetensors`, unos 4 GB, en `models/diffusion_models`), su
   codificador `qwen_3_4b.safetensors` (`models/text_encoders`) y `flux2-vae.safetensors` (`models/vae`), dibuja con él
   antes que con SDXL (salvo que `KYWAI_COMFYUI_CHECKPOINT` pida otro modelo): 4 pasos, cabe en ~13 GB de gráfica y
   da mejor calidad; a 1344×768. El «base» y el 9B no se usan (más lentos; el 9B es no comercial). kywai no lo
   descarga solo por su tamaño) y le pide las imágenes de una en una en el formato del vídeo, con una
   semilla fija por texto (el mismo guion da las mismas imágenes). Si ComfyUI no está, no tiene modelo o una imagen
   falla, la pide **Gemini** (`gemini-2.5-flash-image`) si hay clave de API (la del asistente, en `~/.gemini/.env`),
   tres a la vez; tras dos fallos seguidos de ComfyUI, el resto va directo a Gemini. Si la clave de Gemini no puede
   dibujar (plan gratis, clave mala o API apagada; `geminiImagesBlockedBy`), durante una hora no se le piden más
   imágenes. **Sin ComfyUI ni Gemini que dibuje, va el motor gratis de internet** (Pollinations,
   `src/main/freeImages.ts`): sin clave ni cuenta, pero **una imagen cada 45 s** (el límite del plan gratis por
   conexión; kywai las pide de una en una para toda la app y, si el servidor pide esperar, espera lo que dice) y
   lleva una marca pequeña en una esquina. Desde nov 2026 su plan gratis da un modelo pequeño (Sana, ~0,6 MP),
   así que es un borrador. El texto de la imagen sale del equipo. Para apagarlo:
   `KYWAI_NO_FREE_IMAGES=1` (entonces, sin ComfyUI ni Gemini, cada escena lleva un fondo de diseño animado). Los
   robots dibujados de «Charla y tutorial» no usan el motor gratis (no sabe mantenerlos iguales): sin ComfyUI ni
   Gemini siguen en el plató 3D.
   **Botón «Instalar ComfyUI»** (Ajustes → Multimedia → Estudio de vídeo, sale mientras las imágenes no van por
   ComfyUI; «Encender ComfyUI» si ya está instalado): `installComfyUI` en `videoStudio.ts` lo instala en
   `~/ComfyUI` (con git, o el `.tar.gz` de GitHub si no hay git), con su Python 3.12 aparte en `~/ComfyUI/venv`
   (uv), PyTorch (en Mac, con la gráfica de Apple; en Windows con NVIDIA, la versión CUDA; sin NVIDIA en Windows o
   Linux deja la marca `kywai-cpu` y ComfyUI arranca con `--cpu`, lento pero funciona) y el modelo **DreamShaper 8**
   (SD 1.5, 2 GB, CreativeML OpenRAIL-M; la descarga sigue donde se cortó si se pulsa otra vez), y lo enciende. Si ya
   hay un ComfyUI en carpeta, solo le pone el modelo si no tiene ninguno; la app de escritorio de ComfyUI no se toca.
   Son varios GB: tarda. Una sola instalación a la vez (`ensureComfyUI`), también desde la web o el cliente.
   **No hace falta dejarlo abierto**: si está instalado
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
que suena resaltada. En una esquina, **el peluche de kywai** (desde la 1.30.15, `plushHost`: el mismo peluche de la app,
de pie y sin tarjeta, que rebota con la voz, respira y saluda; antes era un chico chibi dibujado, que solo queda si
faltan las imágenes de los peluches; `src/main/videoCartoon.ts`) que mueve la boca con la voz, parpadea, respira, brinca en
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
- **Que no balbucee (1.30.1).** Con frases muy cortas («You get more work.») Chatterbox a veces no para y sigue
  varios segundos con sílabas sin sentido; como la escena dura lo que dura la voz, el titular se quedaba quieto 8 a 11 s
  (reel «What is kywai?» del 24 nov). Ahora kywai mide cada frase al salir (`chatterboxRunaway` en
  `src/main/chatterbox.ts`: más de 0,7 s por palabra + 1,6 s de margen, o 3,2 s como poco): las que se pasan se repiten
  una vez y, si vuelven a pasarse, el vídeo entero va con la voz normal (Kokoro, Edge…), sin mezclar dos voces.
- **El oído (1.30.4).** La duración no lo pilla todo: Chatterbox también repite palabras («We split the work. We split
  the work.») o se come el principio. Ahora Whisper (`faster-whisper`, modelo «base», en el procesador; se instala solo
  en el entorno de Chatterbox, `ensureChatterboxEar`) escucha cada frase en `voz.py` y la compara con el texto
  (palabras sin acentos, `difflib`): por debajo de 0,8 la dice otra vez, hasta 3 veces, y se queda con la que más se
  parece; si ni así llega a 0,6 avisa («dudosa») y kywai la trata como una frase que se alargó (se repite una vez y, si
  no, voz normal). Probado con el guion del reel malo: el balbuceo y las repeticiones desaparecen.
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

**Voz Ming, la otra voz que narra (1.30.51, solo en el equipo).** En Ajustes → Multimedia → Estudio de vídeo, «Voz que
narra» deja elegir entre **Chatterbox (con emoción)**, la de siempre, y **Ming (más natural)**: Ming-3.0-tts 0.5B de
inclusionAI (MIT, `src/main/mingVoice.ts`), que suena más natural y copia mejor el timbre de la voz elegida (las mismas
muestras que Chatterbox: Álvaro, Jorge, Carmen, Bella…), pero lee sin emociones. Habla español, inglés, chino, francés,
alemán, japonés y coreano. Al elegirla se instala sola (entorno de Python 3.11 con uv, su código fijado y el modelo, unos
3 GB) en `estudio-video/ming`, y prueba dónde funciona (gráfica NVIDIA, Apple o el procesador). La elección se guarda en
`estudio-video/narrador.json`. Medida el 24 nov en un procesador de 4 núcleos sin gráfica: 3,5 GB de memoria y unos 20 s
por frase. Pide la misma memoria que Chatterbox (16 GB) y no se instala en kywai Cloud. Si Ming no saca el vídeo entero,
va Chatterbox y luego el orden de siempre; las frases que se alargan sin parar se repiten una vez.

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

**Cinta «1/2» en los vídeos de lista (v1.29.13).** Cuando el vídeo es una lista («2 archivos que…», «3 errores
al…», los pasos de un tutorial), el guion trae `strip` (el titular corto de la lista) y cada escena de un punto su
`part` (1, 2…). Con el estilo de kywai (el dinámico), arriba sale fija una cinta de papel con ese titular y el punto
por el que va («/2» en el gancho, luego «1/2», «2/2»; el número entra con un salto y un «pop»), desde la primera
escena hasta el cierre. Sin `strip` o con un solo punto, no hay cinta. Sale de un reel de pablotapias.ia (24 nov
2026); la regla es `LIST_RULE`, y `listStrip`/`listParts` y el bloque `#strip` de `buildComposition` en
`src/main/videoScript.ts` (con su prueba). Los estilos con presentador, «Charla y tutorial» y el explicativo no la
llevan.

**Diálogo (dos personajes, dos voces).** En el paso 4 del selector, «Diálogo» (marca `dialogo:si`), o con palabras («un
diálogo entre…», «una conversación entre…», «charlando»): el vídeo lo cuentan **dos personajes que se contestan**, como
en los reels que más enganchan, con réplicas cortas («¿Yo?», «¿En serio?»). Con los robots de kywai elegidos, hablan
Hermes y Claude; con otro personaje, ese y uno que le dé la réplica; sin personaje, dos que invente el agente. El
guion trae `"speakers": [{"name", "gender"}]` y cada frase dice quién habla: «[Claude, sorprendido] ¿Diez minutos?
[Hermes, alegre] Ni uno más.».
- **Eliges las dos voces** (1.13.0): con «Diálogo» marcado salen dos pestañas, «Voz del personaje 1» y «Voz del
  personaje 2», con la voz que lleva cada uno. Al pulsar una voz va al personaje de la pestaña activa; tras elegir la del
  primero pasa sola a la del segundo, y en la lista la voz del otro personaje lleva su número. La del segundo va en la
  marca `voz2:<id>` (solo cuenta con `dialogo:si`); «Automática» en la segunda deja que kywai elija una que le pegue. En
  el vídeo de siempre, en Chatterbox, en ElevenLabs (si las dos son de ElevenLabs) y en las películas con estilo (el
  encargo lleva la regla de cada voz) cada personaje habla con la suya. Si las dos son de distinto género, cada una va
  al personaje de su género; si no, la 1 para el primero. Una de Mac fuera de un Mac no vale y se elige otra.
- **Cada uno con su voz** (`speakerVoices` en `src/shared/videoChoice.ts`): sin segunda voz elegida, la elegida es para
  el primer personaje de su género, y el otro lleva otra voz del idioma, de su género si la hay (en español en el Mac:
  Álvaro y Carmen; sin Mac, Álvaro y Jorge). Con Chatterbox, cada uno con la muestra de su voz; con Gemini, la voz de varios hablantes de Gemini
  (`multiSpeakerVoiceConfig`); con Kokoro, una voz de Kokoro de su género.
- En los subtítulos sale **el nombre de quien habla** en una etiqueta de su color (`speakerChip`), y cada personaje
  tiene sus propios golpes de texto.
- En las películas con estilo, el encargo pide el diálogo y que la cámara corte al que habla y a la reacción del otro.

**Voces de pago para comparar de oído: ElevenLabs v3 y Gemini Pro.** Si las voces gratis no convencen, en el paso
«Voz» del selector salen también, debajo de las de cada idioma, **las voces de ElevenLabs** (las de tu cuenta) y **las
de Gemini**, cada grupo solo si hay su clave. Así se puede pedir el mismo guion con una y con otra y quedarse con la
que suene mejor.
- **ElevenLabs** (`src/main/elevenlabs.ts`, modelo `eleven_v3`, el que más actúa): la clave se pega en Ajustes →
  Multimedia → Estudio de vídeo → «Voz de ElevenLabs (de pago)» (con «¿Cómo lo hago?»), se comprueba y se guarda cifrada en el llavero
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
   **Con los robots de kywai, los personajes se mueven de verdad** (`src/main/charlaStage.ts`; el personaje «kywai»
   lleva el robot de Hermes, que es su nombre de cara al usuario). **Desde la 1.30.15 son los peluches de la app**
   (`StageData.plush`, las imágenes assets/forma-*.png) **con volumen**: una cabeza de fieltro redondeada en three.js
   con el dibujo proyectado de frente (visor, ojos y mofletes), los lados y la espalda del color del fieltro, las orejas
   como almohadillas y el adorno de arriba recortado del dibujo. Giran de verdad para mirarse, proyectan sombra y hablan
   rebotando y estirándose con cada sílaba (no tienen boca ni manos). Primero fueron carteles planos y Yil dijo que se
   veían como una imagen 2D. **Desde la 1.30.33, si están, son sus modelos 3D de verdad**: kywai, Claude, Codex y
   Gemini hechos con Meshy (imagen a 3D) a partir de sus peluches, en `src/main/peluches3d/*.glb` (texturas webp de
   1024, sin compresión de malla). `robotModels3d()` (videoCharacters.ts) los encuentra, el estudio los copia como
   assets/peluche-<robot>.glb junto con el cargador de GLB de three.js (`copyGltfLoader`, que cambia `from 'three'`
   por el three.module.js de assets) y van en `StageData.models`. El plató los carga con
   `window.__hf.buildReady.peluches3d` (HyperFrames espera a que estén antes del primer fotograma), los pone del mismo
   alto que el peluche de caja (`MODEL_H`), de fieltro mate con un poco de luz propia, y hablan rebotando igual. Si
   falta el modelo de alguno, sale el peluche de caja. Gemini solo existe en 3D: sin su modelo sale el robot de Hermes.
   Los robots de antes (Hermes, Claude y
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
   **Sin aspecto elegido, siempre van en el plató 3D animado** con los peluches de Meshy, aunque haya ComfyUI en el
   equipo (ComfyUI dibuja entonces solo la pantalla de detrás). Hasta la 1.30.60 se dibujaban con ComfyUI en «Cine 3D»
   y el vídeo salía de imágenes quietas; Yil preguntó «¿dónde están los robotitos animados?».
   **Con un estilo de película elegido** (`estilo:urban-sketch`…), la charla o el sketch **se hacen en ese estilo**: van
   por el agente que dirige las películas (`filmPrompt`, con las reglas del tipo, el diálogo y los robots dibujados en el
   estilo), en vertical salvo que se pida horizontal. Hasta la 1.30.61 `parseVideoRequest` tiraba el estilo y todo
   salía en el plató 3D, eligieras el que eligieras. Sin estilo, el plató 3D de siempre.
   **Encuadre** (1.30.61): los planos se calculan con el tamaño real de los personajes (`CH`, `CW` en charlaStage.ts,
   medidos con su caja al cargar): cada plano mete de los pies a la cabeza (con sitio para los saltos) en su franja y a
   lo ancho (el plano de los dos cabe entero). En vertical, entre el 9 % y el 46 % de la pantalla desde abajo, por debajo
   del titular y los subtítulos; en horizontal, entre el 27 % y el 86 %, por encima de los subtítulos. El «muy de cerca»
   enseña la cabeza y el cuerpo enteros, más grandes. Antes los números eran fijos, pensados para los robots de antes
   (más altos): con los peluches 3D de Meshy el primer plano les cortaba media cabeza y en horizontal los subtítulos les
   tapaban la cara.
   **Sketch de humor** (`tipo:sketch`, o escribir «un sketch de humor» / «tipo sketch»): la misma charla de dos
   personajes (plató, diálogo, vertical, burbujas en el gancho y «Comenta PALABRA»), pero **sin pasos, ni puntos, ni
   tarjetas «PASO n/N»**: el encargo pide una situación cómica con conflicto, giros, réplicas rápidas, personalidades
   distintas y un remate, y lo útil sale de pasada dentro de los chistes. Arriba solo sale un titular corto por
   escena. Aunque el agente escriba pasos, kywai los quita. Para cuando se quiere entretener más que enseñar.
2. **Personaje.** *Ninguno (genérico)*: sin personaje fijo. *Robots de kywai*: Hermes, Claude y Codex con el aspecto de «Formas animadas» (desde la 1.8.4: la cotorra verde para Hermes, la gota naranja para Claude (la forma «Gota» se rehízo: cuerpo redondo con la punta ladeada, antes parecía una bala) y el cuadrado redondeado verde para Codex, los mismos que en la app, con el acabado inflado y brillante de las formas (relieve, brillo y ojos que sobresalen); referencias en assets/robots/forma-*.png y su descripción en ROBOTS_LOOK de src/main/videoCharacters.ts). El plató 3D de «Charla y tutorial» sigue con sus muñecos propios. Los que hayas
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
   Gemini y tu clave (gasta un poco por imagen) y, si tampoco, con el motor gratis de internet (una cada 45 s: los
   nueve tardan unos 7 minutos). Cada prueba queda guardada en `<estudio>/pruebas-aspecto/` y no se
   paga dos veces. Si cambias el tema o el personaje, las pruebas se vacían. Si no sale, el aviso dice el motivo de
   cada motor, también si ComfyUI no está instalado o no arrancó a tiempo.
   Órbita todavía no tiene este grupo.
   **Clips de archivo** (21 nov 2026, idea de MoneyPrinterTurbo, `aspecto:clips-archivo` o «estilo clips de
   archivo»): el último del grupo no pinta nada. En el vídeo **rápido**, kywai busca para cada escena un **clip de
   vídeo real** en el banco gratuito de **Pexels** con lo que describe la escena, lo baja (el más cercano a 1080, de la
   orientación del vídeo, que dure al menos lo que la escena y sin repetir clip) y lo recorta a lo que dura su voz y al
   encuadre (`src/main/stockClips.ts`, `fitStock` en `videoStudio.ts`). La búsqueda empieza mientras se graba la voz;
   las escenas que no encuentran clip llevan su imagen de siempre con un aspecto fotográfico, y con clips ComfyUI no se
   enciende solo. Para que encuentre buenos clips, el guion escribe cada `image` como algo que una cámara filmaría en la
   vida real, en inglés y corto («woman typing on laptop in cafe»). No necesita tarjeta gráfica ni gasta créditos de
   imágenes: va igual en la nube. Pide una **clave gratis de Pexels**: ⚙ → Ajustes → Multimedia → Estudio de vídeo →
   «Clips de archivo (Pexels, gratis)», con los pasos para sacarla (se guarda cifrada en el llavero; quien instala kywai
   en su servidor puede ponerla para todos en `KYWAI_PEXELS_KEY`). Sin clave, el vídeo sale igual con imágenes y la
   tarjeta lo dice. Al lado del MP4 queda `<título>-creditos.txt` con el autor y el enlace de cada clip (Pexels pide
   decir de dónde salen). En presentador, mixto y charla este aspecto solo da imágenes de aspecto fotográfico.
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

**Estilos de película (131, con muestra).** En el paso 3 del selector, una tarjeta con **una muestra de cada estilo**
(un fotograma de su película de ejemplo), por categorías y con buscador: **Pintado a mano (acuarela y tinta)** y los
**los estilos propios de kywai** (ver más abajo) y los **66 estilos de la biblioteca Lemo-Opuscar** (MIT, github.com/lemomo-ai/lemo-opuscar): acuarela, tinta china, óleo, pizarra, años 30, anime de los
80, Pixel RPG, HD-2D, diseño suizo, plano técnico, infografía isométrica, risografía, xilografía, ukiyo-e, teatro de
sombras, piezas de construcción, maqueta en miniatura, cine mudo, noticiario de época… Elegir uno pone
`estilo:<carpeta>` detrás de `/video` (p. ej. `/video estilo:watercolor el ciclo del agua`); también vale escribirlo
con palabras: «/video estilo acuarela sobre…», «hazme un vídeo de… estilo pixel», en el escritorio, la web, Órbita y
las rutinas. Los marcados **«Con material real»** (los documentales con datos y los de montaje) se hacen con imágenes,
datos o archivo de verdad: usa lo que adjuntes y, si no hay, busca material libre y lo apunta en sus créditos.

**Historia del arte (24) y Se pinta ante tus ojos (27).** Dos categorías más, de otras dos bibliotecas MIT:
- **Historia del arte** (huashu-art-motion, github.com/alchaincyf/huashu-art-motion): pintura rupestre, mural egipcio,
  vasija griega, mosaico romano, manuscrito iluminado, Renacimiento, impresionismo, remolinos de Van Gogh, art nouveau,
  cubismo, Bauhaus, pop art, Klimt, expresionismo, Dunhuang, constructivismo, surrealismo, Hopper, vaporwave, Monet,
  puntillismo, Matisse y el CGI de los 90, todos pintados y animados con código en el navegador; y **Viaje por la
  historia del arte**, en el que un personaje cruza de un mundo a otro y cambia de estilo con él. El agente lee la ficha
  del estilo (`references/风格配方/<id>.md`) y su escena de ejemplo, toma el pincel y la forma de animar, nunca su
  composición ni sus personajes, y pasa el `qa.py` y el `film_gate.py` de la biblioteca antes de entregar.
- **Se pinta ante tus ojos** (claude-drawing, github.com/cloveric/claude-drawing-skill): lápiz de grafito, lápices de
  colores, ceras pastel, gouache, cianotipia, cartel de imprenta, cómic clásico, grafiti de plantilla, collage de
  periódico, plastilina, punto de cruz, parches bordados, cuentas para planchar, cuaderno de Leonardo, azulejos de
  Delft, dibujo de 1 bit, cámara térmica, rayos X, vídeo casero VHS, cuento animado, corrección de examen… Cada escena
  se pinta en pantalla etapa a etapa (Python con numpy y Pillow, sin modelos de imagen) y, cuando está pintada, **la
  cámara recorre el cuadro** (alejarse, acercarse a un detalle, travelling o grúa) en vez de quedarse quieta.
Los dos usan además la voz y la música de Lemo-Opuscar. El encargo está en `artHead` y `drawingHead`
(`src/main/filmLibrary.ts`).

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

**Estilos propios de kywai.** Garabatos de tinta, Garabatos en primera persona, Oficina en plano, Siluetas de
neón, Cristales 3D adorables, Tiempo profundo, **Papel recortado**, **Lista de comprobación**, **Robots de bloques**, **Anuncio de app**, **Circuito de canicas** (canicas de cristal que ruedan por rampas y embudos de madera: cada paso de la idea es una pieza de la máquina) **Onda de audio** (espectrograma y forma de onda sacados del audio de verdad, con las palabras clave encendidas al ritmo de la voz; para pódcast, citas y música) y **Por dentro a cámara lenta** (una máquina por dentro: empieza a velocidad real, frena a 256 veces más lenta con un rótulo y un contador de vueltas, explica cada pieza en un paso numerado mientras la velocidad se dobla, y vuelve a la velocidad real en el mismo plano del principio para que el reel se repita en bucle; vale con «estilo cámara lenta» o «por dentro») (inspirados en lo que se ve en vídeos de estilos de animación con IA,
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

**Collage de revista** (`kywai-paper-collage`, desde el 16 de noviembre de 2026) sale de los explicadores en collage de
papel de canales editoriales (tipo Vox; solo la gramática visual, la guía la escribió kywai). Toda la película es un
tablero enorme de papel que la cámara recorre: recortes en trama de puntos con borde blanco y sombra, tiras de papel
rasgado con titulares en serif, trozos de periódico, notas adhesivas con cifras, y lo que la voz subraya se marca a
mano: subrayador amarillo, círculos y flechas de rotulador rojo, chinchetas con hilo rojo. Una tinta de acento para lo
que importa y el resto en negro. Para «por qué pasa X», noticias, economía e historia. Usa el motor del «Expediente de
trama» (`halftone-dossier`). También se pide con «estilo collage», «estilo tipo vox» o «collage de papel».

**Tu propio estilo en un minuto (`/estilo-propio`).** «/estilo-propio Neon Night» con un vídeo o unas imágenes que te
gusten adjuntos (o un enlace: «/estilo-propio Neon Night: https://… pero con verde»; también `/mi-estilo` o
`/crear-estilo`) hace que un agente mire el material (un fotograma por segundo) y saque con números la paleta en hex,
la letra y la fuente libre más parecida, la composición, el ritmo de los cortes, cómo entran y salen las cosas, la
textura y los subtítulos. Elige el motor de la biblioteca que más se parece (diseño suizo, presentación tecnológica,
pizarra, años 50, concurso, espías, producto de cristal, piezas de construcción, isla low-poly o gráficas) y escribe la
guía con los mismos apartados que los estilos de kywai, más una muestra. Todo queda en
`<carpeta de trabajo>/estilos/mio-<nombre>/` (`ESTILO.md`, `estilo.json` y `muestra.png`), compartido entre proyectos.
Desde entonces se pide como cualquier otro: «/video estilo neon night cómo ahorrar tiempo» o `estilo:mio-neon-night`;
kywai deja su guía en la carpeta de la película igual que con los de kywai. Se copia el aspecto, nunca los dibujos,
los personajes, las marcas ni la música de nadie. Puedes retocar `ESTILO.md` a mano. Aún no salen en el selector de
estilos ni en Órbita: se piden por su nombre. Código: `src/main/userStyles.ts` (+ test) y la lista de estilos del
usuario en `src/shared/filmStyles.ts` (`setUserFilmStyles`).

**Instalación.** «Instalar lo que falta» (Ajustes → Multimedia → Estudio de vídeo, fila «Estilos de película») o, si
no, el primer vídeo con estilo, descarga con git a `estudio-video/lemo-opuscar` una **versión fija** de la biblioteca
(sin las películas de ejemplo ni las imágenes grandes, ~30 MB) y lanza su instalador (`setup.sh deps voice`: paquetes
de Node, el navegador del render, un Python propio y la voz Kokoro); y descarga a `estudio-video/animacion-pintada`
el kit de animación pintada, con sus paquetes y los robots. Hace falta git; en Windows, Git para Windows (trae `sh`).
Descarga también, en versión fija, `estudio-video/arte-en-movimiento` (huashu-art-motion, ~20 MB, sin sus imágenes de
muestra ni el personaje del autor, que no son MIT; prepara el Chromium de Playwright con uv) y
`estudio-video/pintar-con-codigo` (claude-drawing, ~7 MB, sin los cuadros de ejemplo; instala numpy y Pillow en el
Python del estudio). Cada una deja `.kywai-ok` cuando está lista.
La biblioteca pide ffmpeg 7 o más nuevo. Para subir de versión, cambia `LEMO_OPUSCAR_COMMIT`, `ANIMATION_BASE_COMMIT`,
`ART_MOTION_COMMIT` o `DRAWING_COMMIT` en `src/main/filmLibrary.ts` después de probarla.

**Muestras y licencias.** Las miniaturas del selector (`src/renderer/src/assets/estilos/`, 320×180) son fotogramas de
las películas de ejemplo de Lemo-Opuscar (CC BY 4.0, © lemomo-ai, se nombra la fuente en el pie del selector); la de
los robots es de una prueba de kywai; la del collage de revista, un fotograma de muestra que dibujó kywai; las de la historia del arte, fotogramas que kywai renderizó con el código de
huashu-art-motion (MIT); las que se pintan ante tus ojos, los cuadros de ejemplo de claude-drawing (MIT). Las películas que hace cada usuario son suyas: sin firma ni marca de agua de la
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
no copia su código. La fila «Escenas con movimiento (FreeVideo o Wan)» de Ajustes → Multimedia → Estudio de vídeo dice si
está listo. Licencias: el código de FreeVideo es Apache-2.0; los pesos de MiniMax H3 van con su propia licencia
(MiniMax H3 Community License, con límites de uso y de países), que acepta quien instala FreeVideo. Código:
`src/main/freevideo.ts`; las variables `FREEVIDEO_HOME` y `FREEVIDEO_URL` cambian dónde lo busca.

**Movimiento con Wan 2.2 en ComfyUI.** Sin FreeVideo, las mismas escenas `motion` se animan con **Wan 2.2 TI2V 5B**
(Apache-2.0) si ComfyUI tiene sus tres archivos (`wan2.2_ti2v_5B_*.safetensors` en `diffusion_models`, `umt5_xxl_*` en
`text_encoders` y `wan2.2_vae` en `vae`; una gráfica con 8 GB o más): kywai sube la imagen, lanza la plantilla oficial
(1280×704 o 704×1280, 24 fps, hasta 121 fotogramas) y monta los fotogramas con ffmpeg (`assets/freevideo-N.mp4`). Si
además está el nodo **RIFE** (ComfyUI-Frame-Interpolation, MIT), Wan hace la mitad de los fotogramas y RIFE pone los
de en medio: tarda casi la mitad. Sin nada de esto, o si falla, la escena se queda con su imagen. Código: `wanWorkflow`
y `comfyAnimate` en `src/main/comfyui.ts`; `wanClip` en `src/main/videoStudio.ts`. Los flujos se comprobaron contra un
ComfyUI real (nov 2026); falta probarlos con los modelos en una gráfica.

**Animaciones de fórmulas y diagramas (Manim).** Si Manim Community (MIT) está instalado en el estudio, el guion
puede traer en hasta 3 escenas un campo `manim` con código Python (`class Escena(Scene)`) para lo que se entiende
mejor animado: una fórmula, una gráfica, un diagrama, una geometría, un proceso. kywai lo renderiza a pantalla
completa con el fondo del tema (`estudio-video/.venv`, `manim render -qm`, 30 fps, como mucho 4 min por escena), lo
alarga con el último fotograma o lo corta a lo que dura la voz de la escena y lo pone **debajo** de la escena como
`<video>` con su propio tiempo (HyperFrames no admite un vídeo dentro de algo con tiempo); los subtítulos bajan a una
banda. Esas escenas no piden imagen; si la animación falla, van con fondo de diseño. Sin LaTeX en el equipo, el
agente escribe las fórmulas con `Text`. **«Instalar lo que falta»** instala Manim con pip (en Linux necesita antes
`libpango1.0-dev`, `libcairo2-dev` y `pkg-config`). En **macOS** no se usa pip: pycairo no publica ruedas para Mac y
pip lo compila, lo que pide `pkg-config` y la librería cairo, que un Mac no trae. kywai baja **micromamba** (un solo
programa, comprobado con su SHA-256, en `~/.local/share/kywai/bin`) y con él el Manim **ya compilado de conda-forge**,
con su Python 3.12, cairo y pango, en su propio entorno `estudio-video/manim` (`macManimInstall` en
`src/main/macTools.ts`). Sin Homebrew, sin compilador y sin contraseña; si la descarga falla, se reintenta una vez y no
queda un entorno a medias. Las escenas se renderizan con ese Python (`manimPython` en `videoStudio.ts`). El código y el registro de cada animación quedan en la carpeta
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
dónde están los WAV y cómo pedirle más a earshot. Ajustes → Multimedia → Estudio de vídeo → **Efectos de sonido**
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
y Voicebox no entran: son opcionales y se instalan aparte (ComfyUI, con su propio botón «Instalar ComfyUI»).

**Python.** Kokoro y Manim piden Python 3.10 o más nuevo, y el `python3` que trae macOS es el 3.9. El estudio usa
el Python más nuevo que encuentre (3.13 a 3.10, también los de Homebrew); si solo hay uno viejo, crea su entorno
con **uv** y Python 3.12 (si uv no está, lo instala con el instalador oficial de Astral, sin administrador). Un
entorno que ya estaba hecho con un Python viejo se rehace solo. En macOS, Manim va aparte, ya compilado de
conda-forge (ver «Animaciones de fórmulas y diagramas»), sin pedir Homebrew.

**Node.js.** HyperFrames, los estilos de película (Lemo-Opuscar) y el kit de animación pintada se instalan con `npm`.
Si el equipo no tiene Node.js, el estudio lo instala antes que nada (`ensureNode` en `videoStudio.ts`): en macOS, el
oficial de nodejs.org en `~/.local/share/kywai/node` (comprobado con su SHA-256, sin Homebrew; el mismo que usa el
asistente de inicio) y lo pone delante en el PATH; en Windows, con winget. Si no se puede, lo dice una vez y salta lo
que lo necesita en lugar de fallar con «npm not found». `npm install`, el instalador de los estilos y Manim se
reintentan una vez si fallan (un corte de red). Al terminar, si algo quedó sin instalar, el registro acaba con
**«Falta por instalar: …»** y la lista; «Instalar lo que falta» vuelve a probar solo eso.

**Instalar a mano.** ⚙ → Ajustes → Multimedia → **Estudio de vídeo** dice qué tiene el equipo (motor, ffmpeg, voz,
imágenes) y **«Instalar lo que falta»** lo instala en el equipo donde corren los agentes (también si lo pulsas desde
la web): HyperFrames y GSAP en la carpeta `estudio-video` de la carpeta de trabajo (versiones fijas, para que un guion
se monte igual dentro de meses), ffmpeg (en macOS, ffmpeg y ffprobe ya compilados para el procesador del Mac en `~/.local/bin`;
winget en Windows; en Linux, con tu gestor de paquetes),
la voz Kokoro en un entorno de Python propio (`estudio-video/.venv`) y el navegador del render. La primera voz
descarga el modelo de Kokoro (unos cientos de MB). Si falta el motor o ffmpeg, pedir un vídeo dice qué instalar.

**Subtítulos en un Mac con el ffmpeg de Homebrew.** Los subtítulos de `/editar`, los títulos de `/recortes` y el
rótulo y los subtítulos del presentador de `/demo` se queman con el filtro `ass` de ffmpeg, que solo existe si ffmpeg
se compiló con libass. El `ffmpeg` de Homebrew dejó de traerlo, así que en esos Mac los vídeos salían sin texto. kywai
lo mira en la lista de filtros de ffmpeg (`burnsSubtitles` en `src/main/videoStudio.ts`) y, en macOS, deja el suyo
(el ya compilado, que sí trae libass) en `~/.local/bin`, que va delante en el PATH de kywai. **No toca el de
Homebrew.** Lo hace en tres sitios:

- **Al ir a montar** un vídeo que lleva subtítulos, título o rótulo (`ensureSubtitleFfmpeg`): la tarea dice
  «Instalando un ffmpeg que queme los subtítulos (solo esta vez)», tarda alrededor de un minuto y el vídeo sale ya con
  ellos. Si no hay red, sale sin subtítulos y lo dice, como antes.
- **Al arrancar el servidor**, con la instalación automática del estudio: un ffmpeg que no los quema cuenta como que
  falta algo.
- Con **«Instalar lo que falta»**. La fila «ffmpeg» de Ajustes → Multimedia → Estudio de vídeo dice «Instalado, pero
  no puede quemar subtítulos» mientras no se arregle.

En Windows (winget) y en Linux (el ffmpeg de la distribución) ffmpeg trae libass; si alguno no lo trajera, kywai no lo
cambia: la fila lo dice y el vídeo sale sin subtítulos, con el aviso.

**Cómo se ve la sección.** Cada bloque va en su propia tarjeta, separada de las demás: lo que tiene el equipo con
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
| `/recortes [n]` (con un vídeo adjunto o su enlace) | Saca los mejores momentos de un vídeo largo como clips verticales con subtítulos |
| `/demo <web> [vertical]` | Un anuncio en vídeo de una web con fotos reales de la página: acercamientos, el móvil y rótulos (ver «Vídeo de presentación de una web») |
| `/miniatura [vertical\|horizontal]` | Tres portadas para tu vídeo (el adjunto o el último), con fotogramas suyos y texto que engancha (ver «Portadas para tu vídeo») |
| `/mascota [qué es] [saluda, salta, piensa…]` | La mascota de tu marca o tu app, siempre igual y animada en bucle (ver «Mascota animada») |
| `/presentacion [rápida] [10 diapositivas] tema` | Una presentación de PowerPoint de verdad, editable, con gráficos y notas, de un tema, un documento o tu plantilla (ver «Presentaciones de PowerPoint») |
| `/manual primer paso · fin` | Graba un manual paso a paso: le dices qué hacer (escrito o por voz), kywai lo hace en su navegador, captura cada paso marcando dónde pulsar y al final te da el documento (ver «Manuales paso a paso con capturas») |
| `/vigilar web [cada 6 horas] avísame si…` | Vigila una página y te avisa en «Te necesita» cuando cambia lo que te importa: un precio, el stock, una versión nueva (ver «Vigilar una web») |
| `/sprite [64px] [8 direcciones] personaje` | Un personaje en pixel art para tu juego: hoja de sprites animada en 4 u 8 direcciones (ver «Sprites de pixel art para juegos») |
| `/imprimir3d [80 mm] [PETG] pieza` | Una pieza para imprimir en 3D de una foto, un boceto o una descripción, con CAD de medidas exactas, STL y 3MF (ver «Piezas para imprimir en 3D») |
| `/sonido [5 s] [bucle] qué suena` | Un efecto de sonido de una frase con ElevenLabs, listo para escuchar (ver «Efectos de sonido») |
| `/doblar <idioma>` | El último vídeo de /video en otro idioma, con las mismas imágenes: voz, subtítulos y rótulos nuevos (ver «Doblar un vídeo a otro idioma») |
| `/aprende enlace o vídeo` | Convierte lo que enseña un vídeo en una habilidad (ver «Aprender de un vídeo») |
| `/instagram qué quieres en el texto` | Prepara el último vídeo para el Instagram de kywai y lo publica con tu visto bueno (ver «El Instagram de kywai») |
| `/tiktok qué quieres en el texto` | Prepara el último vídeo para el TikTok de kywai y lo envía como borrador o lo publica con tu visto bueno (ver «El TikTok de kywai») |
| `/turno-noche nicho o cuentas` | Turno de noche: busca los reels que revientan en tu nicho, desmonta el mejor, hace uno nuevo y lo deja como reel de prueba (ver «El Instagram de kywai»; también `/crecer` y `/maquina`) |
| `/cliente-ideal quién te compra` | Escribe la ficha de tu cliente ideal (`cliente-ideal.md`): qué le duele, qué quiere y cómo habla; los guiones y los textos la usan solos (ver «El Instagram de kywai») |
| `/seo web, repositorio o carpeta` | Auditoría SEO y GEO de una web o una app, con lo que hay que arreglar; si es la carpeta del proyecto en git, lo arregla en una rama (ver «SEO y marketing de una web o una app») |
| `/marketing web o app [para quién]` | 5 posts para Instagram y TikTok, un artículo de blog, un anuncio con tope y un plan de 2 semanas para darla a conocer, todo en borrador (ver «SEO y marketing de una web o una app») |
| `/rutina cuándo: qué` | Programa una tarea a una hora o que se repita |
| `/directo Agente mensaje` | Habla con un agente sin pasar por Hermes (lo mismo que `@Agente mensaje`) |
| `/recuerda texto` | Guarda un dato en la memoria del proyecto (admite `decisión:`, `pendiente:`, `preferencia:`, `hecho:`) |
| `/model` | Cambia el modelo de Hermes |
| `/uso` | Mira cuánta cuota le queda a cada agente (también `/usage`, `/cuotas`) |
| `/puedo` | Te dice qué puede hacer kywai en este equipo ahora mismo: imágenes, vídeo, voz, manejar apps y lo que falta instalar (también `/puedes`, `/capacidades`; ver «¿Se puede aquí?») |
| `/nuevo` | Empieza un chat nuevo en este proyecto (también `/new`, `/limpiar`) |
| `/orden-de-plantilla` | Tus plantillas de tareas, con su nombre a la derecha |
| `/orden-de-mod` | Las órdenes de los mods encendidos, con su descripción |

Las que no llevan nada detrás (`/model`, `/uso`, `/puedo`, `/nuevo`) se hacen nada más elegirlas; las demás dejan «/orden » en
el cuadro para que escribas lo de detrás. Al escribir **«@»** sale la lista de agentes, cada uno con su modelo a la
derecha, para hablarle directamente.

**Quién firma el trabajo de una orden.** Cuando una orden de kywai (`/crecer`, `/video`, `/seo`, `/marketing`, `/instagram`…) hace trabajar a un agente, sus mensajes en el chat salen firmados **«kywai · con Claude»** (o el agente que sea) y con la cotorra de kywai, no solo «Claude»: la orden es de kywai y el agente es quien la hace en tu equipo. `/directo` y `@Agente` no cambian: ahí eliges tú al agente y sale con su nombre. Para programadores: el motor marca esos mensajes con `viaKywai` (`pushMessage` en `src/main/orchestrator.ts`, con `isKywaiOrder` de `src/shared/chatCommands.ts`) y `AgentMessage` (`Messages.tsx`) los dibuja con `AgentAvatar kywai`.

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

**Un agente fijo para lo que repites** (22 nov 2026). Cuando mandas por tercera vez casi el mismo encargo en 60 días
(«prepara el informe semanal de ventas…» con otras palabras cuenta igual), kywai, al acabar, enseña una tarjeta:
«Es la 3.ª vez que me pides esto. ¿Lo guardo como plantilla fija?». **Guardar como plantilla** la deja como botón 📌
encima del chat, solo en ese proyecto, con su orden («/prepara-el-informe…») y, si lo hizo un solo agente, **directa a
ese agente** (sin pasar por el coordinador). **Descartar** no vuelve a proponerlo para ese encargo. No sale si la
petición vino de una plantilla, de una orden «/…» o de una rutina, ni si ya tienes una plantilla parecida. La cuenta la
hace `src/shared/repeatRequests.ts` (palabras con peso en común, sin tildes ni palabras vacías).

**Hazlo con kywai** (20 nov 2026). El botón 🔨 **«Hazlo con kywai»**, en la misma fila, abre una galería con 156 apps
de pago que un equipo de agentes puede construirte para dejar de pagarlas (las de veredicto «sí» de
[Can I Vibecode It](https://canivibecodeit.com), licencia MIT): su precio al mes, cuánto se tarda (una sentada, un fin de
semana o varios días), qué hace la versión propia, qué necesita y qué pierdes frente a la de pago. Se busca por nombre o
por categoría (en español). **Construir** manda al chat del proyecto el encargo: «Hazme mi propia versión de X… en la
carpeta «x» de este proyecto», con el encargo completo de la fuente detrás (en inglés; el equipo te contesta en tu
idioma y al final explica cómo usarla y qué no hace). Los textos de cada app salen en inglés, como en la fuente. Los
datos van en `src/shared/hazloConKywai.json` (con el commit de la fuente) y se cargan al abrir la galería; para
ponerlos al día se vuelve a generar ese archivo. Código: `src/shared/hazloConKywai.ts` y
`src/renderer/src/ui/left/BuildGallery.tsx`. En Órbita aún no está.

**Crear y cambiar.** «+» al final de la fila crea una: emoji, nombre del botón, lo que se envía, la orden (si la dejas
vacía sale del nombre: «Revisar PR» → `/revisar-pr`, y lo sigue si le cambias el nombre), dónde sale (en todos los
proyectos o solo en el abierto) y quién la hace:

- **El coordinador reparte el trabajo** (lo normal): pasa por el plan, los agentes y la verificación.
- **Directo a un agente**: como `@Agente …`, va tal cual a ese agente sin pasar por el coordinador. Si quitas ese agente del
  equipo, la plantilla avisa al lanzarla para que elijas otro.
- **Pedir mi visto bueno al plan**: el coordinador enseña el plan y espera, aunque en Ajustes esté apagado (solo
  para esa plantilla). Sin efecto si va directa a un agente.

Clic derecho en una plantilla (o mantenerla pulsada en el móvil): **Editar**, **Fijar al principio** (las fijadas van
primero, con el borde de color), **Convertir en rutina** (deja `/rutina cada día a las 9:00: <su texto>` en el
cuadro para que cambies el horario y lo envíes; solo en las que no tienen huecos ni van directas a un agente) y
**Borrar** (hay que pulsarlo dos veces). Al eliminar un proyecto se borran sus plantillas.

**Recetas por pasos** (17 nov 2026, idea de [LoopForge](https://github.com/Tencent/LoopForge), de Tencent, MIT,
escrita desde cero): si el texto de una plantilla tiene líneas que solo llevan `---`, cada trozo es un **paso** (hasta
10). Al lanzarla, kywai manda solo el paso 1 (pasa por el coordinador, los agentes y la verificación como cualquier
petición; el encargo dice «Paso 1 de 3 de la receta… haz SOLO este paso»). Al acabar, sale una tarjeta con
**Seguir con el paso 2**, **Repetir el paso 1** (lo que escribas en el campo de abajo va como cambios) y **Parar aquí**;
también en «Te necesita», la web y Órbita, porque es una tarjeta de preguntas normal. Cada paso siguiente sale en el
chat como «Paso 2 de 3 de «Nombre»: …» y parte de lo que entregaron los anteriores. Con **«Seguir al paso siguiente sin
preguntarme»** va sola de un paso a otro, pero si uno falla, pregunta. Al acabar el último, el chat dice «Receta
terminada». Solo va por pasos si la reparte el coordinador: si la plantilla va directa a un agente, le llega el texto entero.
Ejemplo: `Haz un esquema del artículo sobre {tema}` / `---` / `Escríbelo entero` / `---` / `Revísalo y corrige el
tono`. Código: `src/main/recipes.ts` (textos y decisión), `templateSteps` en `src/shared/templates.ts`, y en
`src/main/orchestrator.ts` `recipeAfterStep` y `recipeAnswered`; prueba en `src/main/recipeFlow.test.ts`.

**Las de serie**: Revisar PR, Resumir carpeta, Buscar fallos, Escribir pruebas, Actualizar dependencias, Explicar
código y **Revisión de seguridad** (🛡️ `/revisar-seguridad {proyecto-o-carpeta}`: la lista de comprobación de antes de
publicar una app, de inicio de sesión y secretos a cabeceras, límites de peticiones y dependencias; arregla lo seguro,
prueba cada arreglo y entrega un informe de más a menos grave), más tres **equipos listos para usar** que reparten
la petición en papeles, cada uno con un agente distinto, y acaban en un informe con tabla (idea del repositorio
awesome-llm-apps, en palabras propias): **Equipo legal** (⚖️ `/equipo-legal {contrato-o-documento}`: investigador
legal, analista de contratos y estratega; tabla de riesgos por cláusula con su gravedad y qué proponer, y el aviso de
que no es asesoramiento profesional), **Equipo de mercado** (📊 `/equipo-mercado {producto-o-idea}`: mercado y
tendencias, 5 competidores, clientes; tabla comparativa, 3 oportunidades y riesgos, con la fuente de cada dato) y
**Equipo de producto** (🧭 `/equipo-producto {idea}`: jefe de producto, arquitecto, diseñador y revisor; plan por fases
y la primera tarea). Mientras no las cambies, su nombre, su orden y su
texto siguen el idioma de la app (en inglés, `/review-pr`). Si las borras no vuelven solas; «Volver a poner las de
serie» (en la ventana de crear o editar) pone las que falten. Una de serie nueva llega sola una vez a quien ya tenía
plantillas, al final de la fila (`templates.json` recuerda en `seen` cuáles ha ofrecido); si la borras, no vuelve.

**Límites**: 100 plantillas, 60 caracteres el nombre, 8 000 el texto; la orden, de 1 a 30 letras sin acentos, cifras
o guiones, empezando por letra, y no puede ser una de kywai (`/rutina`, `/directo`, `/model`, `/new`, `/usage`,
`/recuerda`…) ni repetir la de otra plantilla del mismo sitio (una general y una de proyecto sí pueden coincidir: en
ese proyecto gana la suya). Una plantilla gana a la orden de un mod con el mismo nombre.

**Órbita / API móvil**: el snapshot trae `templates` (todas, con su `projectId` si son de un proyecto) y la capacidad
`templates`; `GET/POST /templates`, `POST /templates/{id}` (cambiar), `POST /templates/{id}/delete` y
`POST /templates/restore`. Para lanzar una con un toque, `POST /chat/messages` con el texto ya relleno y `templateId`.
Los cambios llegan con el evento `templates.updated`.

### Tablero de tareas: déjalas en cola y vuelve a por los resultados

La pestaña **Tablero** del proyecto es un Kanban con cuatro
columnas: **Por hacer**, **En marcha**, **Te espera** y **Hecho**. Escribes lo que quieras que haga el equipo
(Ctrl + Intro añade la tarjeta) y kywai coge la primera de «Por hacer», la envía al chat como si la escribieras tú
(en el chat sale como «**Tablero de tareas**») y, cuando termina, pasa sola a la siguiente, aunque no estés delante.
Cada tarjeta pasa por el plan del coordinador, los agentes, la verificación, las hasta 2 correcciones y el relevo a otro
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

En tu equipo (self host) no hay más límite que 50 rutinas por proyecto. En **kywai Cloud** el plan pone el tope de
rutinas **activas** sumando todos los proyectos: **Cloud 5, Pro 25 y Pro Max 100** (las desactivadas no cuentan). Al
pasarlo, crear o activar otra dice cuántas permite tu plan; se desactiva una o se sube de plan en Mi cuenta. El
espacio lee el tope en `GET /api/plan` (`src/main/cloudPlan.ts`).

**Cuándo se lanza** (las horas son las del reloj del servidor, en su zona horaria):

| Disparador | Ejemplo |
|---|---|
| Cada día a una hora | «Cada día a las 09:00» |
| Unos días de la semana a una hora | «De lunes a viernes a las 08:30», «Los sábados a las 10:00» |
| Cada N horas (1 a 168) | «Cada 6 horas» (contando desde la última vez) |
| Una sola vez | «Una vez: mañana a las 07:00»: se lanza ese día a esa hora y se desactiva sola |
| Webhook | Al llegar un `POST` a su dirección propia (ver abajo) |
| Al cambiar archivos de una carpeta | Una carpeta del proyecto (o toda): cuando cambian archivos y llevan un minuto quietos |
| Cuando pase algo en una app conectada | «Cuando en gmail: Nuevo correo», un evento de Calendar, una issue de GitHub… (ver abajo) |

**Rutinas por aviso de una app (20 nov 2026, idea de Manus Automations y Zapier).** Con apps conectadas (Mi cuenta →
Apps conectadas, en kywai Cloud o en la instalación propia enlazada), el disparador «Cuando pase algo en una app
conectada» pide la **app** y **qué tiene que pasar** (los avisos que Composio ofrece para esa app sin campos que
rellenar). Al crear la rutina, kywai activa el disparador en el portal (`POST /api/apps/disparadores`, con el mismo
token de la extensión «Apps conectadas»). Composio vigila la app y avisa al portal por su webhook firmado
(`POST /composio/eventos`, HMAC-SHA256 con `COMPOSIO_WEBHOOK_SECRET`; ver DEPLOY.md de kywai-cloud); el portal lo
guarda para su dueño y kywai lo recoge cada minuto (`GET /api/apps/eventos`, se entrega una vez y se borra), así que
no hace falta abrir puertos. Los avisos que lleguen seguidos se juntan en una ejecución y van detrás de la petición
como **contenido externo no confiable** (igual que los webhooks). Borrar la rutina (o cambiarle el aviso) quita el
disparador del portal. Límites del portal: 20 disparadores por cuenta, 300 avisos al día y 200 pendientes; lo que no
se recoge en 7 días se borra. Código: `src/main/appTriggers.ts`, `checkAppEvents` en `routines.ts`, y en el portal
`composio_eventos.py`.

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


**Primero observa y pausa al fallar (24 nov 2026, v1.21.8; idea de AnyModelBot).** Al crear una rutina en la pestaña
Rutinas viene marcada **«Primero observa»**: su petición va con un aviso delante (`observeText`) para que el agente no
cambie ni envíe nada y cuente «Lo que haría:» (a quién, dónde y con qué resultado). Cada ejecución así queda marcada
(`observed`). Tras **3 pasadas buenas seguidas** observando, «Te necesita» propone **«Pasar a actuar»** o «Que siga
observando» (solo una vez; vuelve a proponerlo si la pones a observar otra vez). La lista dice «solo observa» mientras
dura. Las rutinas que ya existían, y las que crea el coordinador porque se lo pides, actúan desde el principio.
Además, cualquier rutina que **falla 3 veces seguidas** (fallo o interrumpida, sin contar las saltadas) se **pausa
sola**: queda desactivada, la lista dice «se pausó sola» y «Te necesita» lo avisa con «Reactivarla». Al reactivarla
los fallos cuentan de cero. Código: `afterRun`, `streak` y `stopObserving` en `src/main/routines.ts`; los avisos y sus
botones (`routine-act`, `routine-enable`) en `src/main/index.ts`.

**Objetivo del equipo (24 nov 2026, v1.27.0; idea de Paperclip).** En la pestaña Rutinas, junto a «Nueva rutina», el
botón **«Objetivo del equipo»** abre el formulario con un objetivo en vez de una petición («Lanzar mi tienda online y
conseguir las primeras 10 ventas»), cada **4 horas** y actuando (sin «Primero observa»). Es una rutina con `goal: true`:
corre en el servidor 24/7, así que el equipo sigue aunque el usuario no esté. En cada turno no se envía el objetivo tal
cual sino `goalText` (`src/shared/routines.ts`): el objetivo, la orden de dar el siguiente paso repartiéndolo entre los
agentes, **nada grande sin permiso** (gastar, publicar, enviar fuera de kywai, borrar o tocar cuentas: lo deja preparado
y pide el visto bueno), empezar la respuesta con **una línea que resuma el turno** y, si el objetivo ya está cumplido,
escribir `[OBJETIVO CUMPLIDO]`. Debajo van los resúmenes de los **5 últimos turnos**. Al terminar cada turno el motor
apunta en la ejecución su `summary` (primera línea de la última respuesta, `beatSummary`) y, si lleva la marca,
`goalDone`: la rutina **se para sola** (`goalDoneAt`) y «Te necesita» avisa «Objetivo cumplido» con «Reactivarlo». En la
tarjeta, «Última:» enseña el resumen y el historial pasa a llamarse **«Turnos»**, con el resumen de cada uno. Código:
`noteBeat` y `afterRun` en `src/main/routines.ts`, el aviso `goal-done` en `src/main/index.ts`, la interfaz en
`src/renderer/src/ui/left/RoutinesView.tsx`. Hermes lo explica si se lo piden en el chat (`coordinatorGuide.ts`).

**Equipos listos (24 nov 2026, v1.27.2; idea de las «Ready-Made Teams» de Paperclip y del reel «pre-sold»).** Junto a
«Objetivo del equipo», el botón **«Equipos listos»** enseña tres equipos ya pensados, cada uno con su icono, una línea de
para qué sirve y **«Usar este equipo»**, que abre el formulario del objetivo ya relleno (nombre, objetivo con el reparto
de papeles y cada cuánto):
- 🤝 **Prevender antes de construir** (cada 4 h): busca problemas por los que las empresas ya pagan, hace una demo
  pequeña, prepara la propuesta y los mensajes **en borrador** (los envía el usuario, nunca kywai) y monta una página de
  preventa con devolución si no se entrega; objetivo, 3 clientes que paguen antes de construir. Usa la habilidad de
  serie nueva **`prevender-antes-de-construir`** (`src/main/specialistSkills.ts`): problemas.md → demo/ → propuesta.md y
  mensajes.md → preventa/ → construir.md (solo lo que se compró). El cobro va solo por el enlace de pago del usuario y
  nunca se le piden claves.
- 🛍️ **Tienda online** (cada 4 h): las habilidades `tienda-*`; precio, stock y pedidos solo con su visto bueno.
- 📈 **Más clientes para mi negocio** (cada 24 h): `web-auditoria-seo-geo`, `anuncios-campana` (la campaña queda en
  borrador) y `negocio-informe-semanal`.

El objetivo trae el hueco **«[escríbelo aquí]»**: no deja guardar hasta cambiarlo por lo de cada uno («Cambia
«[escríbelo aquí]» por lo tuyo…»). Los equipos están en `src/shared/readyTeams.ts` (`readyTeams`, `fillHere`).

**Película de producto (24 nov 2026, v1.28.0; idea del reel de elasthic.motion: películas de producto en Blender en las
que «nada avanza sin tu sí»).** «/video película de producto de mi app de recetas» (o la marca `pelicula:producto`) con
las capturas adjuntas hace un **Escenario 3D** en el que el monitor del escritorio enseña **tus capturas**, una por
escena y con un acercamiento lento (`productSlides` en `src/main/escenarioPlan.ts`, `slideArgs` en
`src/main/videoEscenario.ts`), en vez del explicativo; la voz, la música y la cotorra son las de siempre. Va por pasos y
cada uno espera tu sí:
1. **Guion**: sale siempre para repasarlo, como con «guion:repasar» («Grabar» o «Descartar»).
2. **Fotograma de muestra**: Blender pinta un solo fotograma (la mitad del segundo plano, `productStillFrame`) y sale en
   el chat; en «Te necesita», **«Seguir»** o **«Parar»**.
3. **Prueba corta**: los primeros **4 s** con sonido (`productTrialFrames`, `pelicula-prueba.mp4`); otra vez «Seguir» o
   «Parar».
4. **Final**: Blender pinta solo lo que falta (`desde` en el plan de `escenario.py`; lo de la prueba se aprovecha).

«Parar» termina la tarea con «Paraste la película de producto…» y no se hace otro vídeo en su lugar (error
`ProductStopped`). Sin capturas adjuntas, el monitor enseña el explicativo. En kywai cloud la hace el equipo conectado
con tus capturas (viajan como `refs` con `product: true`), sin los pasos 2 y 3. Código: `approveFilmStep` y
`decideFilmStep` en `src/main/orchestrator.ts` (avisos `film-go` / `film-stop`), `PRODUCT_RE` en `src/main/videoScript.ts`.
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
- **Solo para esta web (1.30.64, idea de Foreman, vigía 25 nov 2026):** en el secreto se puede poner una web
  (`api.openai.com`; se limpia `https://` y la ruta). Ese secreto **no llega al agente**: no está en su entorno.
  Para usarlo, el agente llama a la herramienta `peticion_api` de kywai (`src/main/secretRequest.ts`) con
  `{{secreto:NOMBRE}}` en la dirección, una cabecera o el cuerpo; kywai pone el valor solo si la petición va por
  https a esa web (la web se mira con los marcadores aún sin poner), no sigue redirecciones y devuelve el estado y el
  cuerpo con los valores tapados. En el navegador de kywai, `navegador_escribir` solo lo escribe en páginas https de
  esa web. Así, aunque una página engañe al agente, no puede mandarlo a otro sitio. `peticion_api` también sirve con
  los secretos normales. La tarjeta muestra «Solo en web»; vaciar el campo lo quita.
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
  El chat nuevo recibe **solo un título** que dice de qué trata: ver [Título automático de los chats](#título-automático-de-los-chats).
- **Buscar** (Ctrl+K): ver [Buscar](#buscar-ctrlk).
- **Historial**: todas las conversaciones de todos los proyectos, por fechas: ver [Historial](#historial).
- **Te necesita**: la bandeja de avisos (antes era la campana de arriba a la derecha).
- **Tareas**, **Resultados** y **Rutinas** abren esa pestaña del panel del chat (con el número de tareas en curso).
- **Favoritos** (antes «Fijados»): los proyectos y las conversaciones que quieres tener siempre a mano. Está siempre
  a la vista entre Rutinas y Proyectos; vacío, muestra dónde soltar. Se añaden **arrastrándolos** aquí o con clic
  derecho → «Añadir a Favoritos» (y se quitan con «Quitar de Favoritos»). Se guarda en el servidor, así que se ve
  igual en el navegador y en los clientes (en Órbita sigue llamándose «Fijados»).
- **Proyectos**: todos, con **+** para crear uno. La flecha de cada proyecto despliega sus conversaciones (el abierto
  se despliega solo); una **espiral de puntos azul** indica que el equipo está trabajando en él. Clic en un proyecto: lo abre
  y lo despliega; **otro clic en el que ya está abierto lo pliega** (y otro más lo vuelve a desplegar), como en Órbita.
  De cada proyecto se ven solo sus **3 chats más recientes** (y el abierto, aunque vaya más abajo); debajo, la fila
  **«Ver los X restantes»** despliega los demás y, abierta, **«Ver menos»** los vuelve a esconder. Si solo sobra uno,
  se enseña sin la fila. Un **✓ verde de puntos** junto a un proyecto indica que tiene resultados terminados sin ver y
  unas **ondas ámbar** que espera tu decisión (lo de «Te necesita»). Ver «Cargas de puntos».
- **Borradores por chat** (1.30.63): lo que escribes en el cuadro sin enviar (el texto, los adjuntos pendientes y el
  «Responder a…») es **de ese chat**. Al cambiar de conversación no se lleva al nuevo: se guarda en el que dejas y al
  volver sigue ahí, también tras cerrar y abrir kywai (se guarda en el equipo o el navegador, clave
  `kywai.borradores` de `localStorage`, hasta 200 chats). Mientras tanto, la fila de ese chat en la barra lateral
  (en Proyectos, Favoritos y Recientes) enseña un **lápiz ámbar «Borrador»** en lugar de la fecha; al enviarlo o
  borrarlo, la marca se va. El chat de al lado y las ventanas sueltas comparten los borradores con la principal.
  Código: `src/renderer/src/ui/left/chatDrafts.ts` y `switchDraftChat` en `composerStore.ts`.
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
- **Los proyectos se quedan en su sitio** (desde la 1.32.1): con *Tu orden*, un proyecto solo cambia de puesto
  cuando tú lo arrastras. La primera vez que se abre la barra se guarda el orden que se ve en ese momento, y cada
  proyecto nuevo se fija arriba al aparecer (`completeOrder` en `sidebar/dragOrder.ts`). Antes, abrir un chat de otro
  proyecto (o que un agente trabajara en él) lo subía al primer puesto. Además, **abrir un chat ya no cuenta como
  actividad** del proyecto (`openConversation` guarda con `scheduleSave(id, false)`), así que tampoco lo mueve con
  *Lo más reciente primero* ni cambia el filtro *Esta semana*.
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
- El chat principal también tiene su **✕**, al final de su fila de pestañas: cierra el de la izquierda y el de al
  lado pasa a ser el **chat principal** (a la izquierda, con su proyecto) y vuelve el 3D. Así cierras cualquiera de
  los dos y sigues con el otro.
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

- En una **conversación**: **Añadir a Favoritos** (P), **Cambiar nombre** (R; por defecto es el [título que le pone la IA](#título-automático-de-los-chats); el tuyo manda siempre),
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

**Sin saltos al abrir y plegar** (23 nov 2026, v1.6.6, pedido por Yil: «se separa y luego en otro cuadro aparece
junto, no es fluido»). La barra, el logo y el líquido van ahora a la par en un solo movimiento:
- **Al plegar**, la gota empieza a caer mientras la barra se estrecha (antes esperaba y el logo se quedaba suelto
  encima), el recuadro del logo se desvanece justo cuando el líquido llega a él y la columna sube **suave**, sin
  saltar a la mitad en un solo cuadro (el muelle de antes se cambió por una subida que arranca suave y se pasa un poco).
- **Al abrir**, el líquido se recoge en la barra en un cuarto de segundo y **después** la barra se ensancha (espera
  200 ms); los nombres de los accesos aparecen con un fundido según se ensancha. Así ya no se ve un cuello del líquido
  pegado a una esquina de la barra ancha.
- Las esquinas de arriba de la barra solo se cuadran cuando la barra ya tiene el ancho de la plegada.
- Los **iconos no se mueven**: plegada, cada acceso mide lo mismo que la columna (44 px), así que mientras la barra
  cambia de ancho los iconos se quedan quietos en su sitio, y la rueda ⚙ de abajo va a la derecha y se desliza con el
  borde. Por dentro: `ui/sidebar/LogoBridge.tsx` (JOIN_MS 760, SPLIT_MS 240), `Sidebar.module.css` (.bar con
  retraso al abrir, `data-opening`) y `Header.module.css` (tiempos del logo y del nombre).

**En Órbita (Android)** va igual: el logo de la barra la abre y la pliega (ya no hay un botón aparte) y da una vuelta
al tocarlo; plegada, la columna enseña debajo de los accesos **tus proyectos con su inicial** (resaltado el abierto,
punto azul si el equipo trabaja en él, verde si tiene algo terminado sin ver) y tocar uno abre su último chat. En la
tableta, la barra se abre y se pliega con un movimiento elástico en vez de cambiar de golpe.

**Volver al chat con la barra plegada.** Bajo los accesos (tras una raya) va el icono del **chat en el que estás**:
desde Resultados, Tareas, Tablero o Rutinas, un clic te devuelve a él. Debajo salen **tus proyectos** con su inicial
(el proyecto en el que estás, con borde de color); al pasar el ratón sale su nombre y un clic abre **su último chat**.
En la esquina de cada icono, una carga de puntos dice cómo va: **espiral azul** mientras el equipo trabaja, **✓ verde**
cuando terminó algo que no has visto y **ondas ámbar** si te necesita. Así, con varios chats a la vez, ves de un vistazo
cuál trabaja, cuál acabó y cuál espera tu ayuda. El clic con la rueda en el chat actual lo abre en una ventana aparte. Igual en el escritorio, el cliente y el
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

La **rueda ⚙** (abajo en la barra lateral) abre un menú corto, como en Claude. Arriba dice dónde estás (en una
línea; la explicación sale al pasar el ratón). Debajo van los interruptores que más se tocan, para cambiarlos sin
abrir nada: **Sonido** (silencia o devuelve la música, los efectos y las voces a la vez), **Permisos** de los agentes y
**Visto bueno a cada plan**. **Tema**, **Interfaz** e **Idioma** ya no están en este menú (23 nov 2026, pedido por
Yil): se cambian solo en **Todos los ajustes…** → General → Apariencia. Después, **Uso y coste…**, la versión
nueva cuando la hay (**Actualizar kywai…** o **Actualizar este equipo…**, en amarillo), **Todos los ajustes…**
(también **Ctrl+,**; ⌘, en el Mac) y, al final, **Reportar un problema…** y **Apoyar kywai**.

**Reportar un problema** (también en Ajustes → Acerca de) abre un mensaje para contar qué falla. Llega al panel de
administración de kywai Cloud (Mi cuenta → Administración → **Problemas**), donde se marca Nuevo, Visto o Resuelto.
Si dejas marcada la casilla, va con los datos que ayudan a encontrar el fallo, que se ven antes de enviar: versión de
kywai, sistema (procesador y memoria), si es self host o kywai Cloud, idioma, el equipo desde el que escribes y los
agentes encendidos (nombre, programa y modelo). **Nunca** van claves, contraseñas ni el texto de los chats. Desde
kywai Cloud va con tu cuenta (para poder responderte); desde la self host va sin cuenta, con tu correo si lo dejas, y
el portal limita los envíos seguidos para evitar spam. Código: `src/main/problemReport.ts`,
`ui/settings/ProblemReportDialog.tsx` y, en kywai-cloud, `portal/problemas.py`.

**Diagnóstico paso a paso (24 nov 2026, v1.21.10; idea de AnyModelBot).** «Probar» de un agente (Añadir un agente,
Mis agentes de Mi cuenta) ya no dice solo «no responde»: enseña cuatro pasos, **Su programa** (está instalado),
**Conexión a internet** (no hace falta en Ollama, LM Studio y demás modelos locales), **Cuenta o clave** y
**Responde**, con ✓, ✗ o «sin probar». Se para en el primero que falla, dice «{agente} se atasca en: …» y qué hacer
(instalar o reconectar, revisar la red o la VPN, volver a entrar o pegar la clave, esperar o recargar saldo, otro
modelo). El tipo de fallo sale del propio agente (`errorKind`: missing, offline, auth, quota). En **Reportar un
problema** hay **Probar paso a paso**: prueba internet y todos los agentes encendidos (hasta 4 a la vez) y deja
**Copiar informe**; si la casilla de datos está marcada, el informe va también con el aviso. Informe y detalles pasan
por `maskSecrets` (memoryGuard.ts): nunca llevan claves, tokens ni contraseñas. Código: `src/main/diagnostics.ts`
(`diagnoseAgent`, `diagnoseAll`, `diagnosisReport`), `probeAgent`/`checkAgentNow` y `cowork:diagnose` en
`src/main/index.ts`, `ui/common/DiagSteps.tsx`.

Lo que antes también estaba en este menú sigue en su sitio de siempre: *Importar de otras apps* en Ajustes → General
→ Tus datos, *Cómo rinde cada agente* en Ajustes → Agentes, *Archivos del servidor* en Ajustes → Conexión, *Buscar
actualizaciones* y *Reiniciar kywai* en Ajustes → Acerca de, y *Abrir carpeta del proyecto* con clic derecho en el
proyecto de la barra lateral.

**Ajustes…** abre una ventana con pestañas a la izquierda. Para no abrumar a quien empieza, cada pestaña agrupa sus
opciones en **secciones plegables**: al entrar salen todas recogidas y abres la que necesites; solo una está abierta
a la vez (al abrir otra se recoge la anterior) y cada cabecera dice en pequeño cómo está ahora («Español · Órbita»,
«Preguntarme antes»…), sin tener que abrirla. Solo un aviso concreto (p. ej. el de «Hablar con kywai») entra con su
sección ya abierta.

- **General**: *Apariencia* (idioma, tema y tema propio en este dispositivo), *Sonido y voz* (una barra de volumen
  para la música, los efectos y las voces de los agentes, cada una con su botón de silenciar, y la voz para leer las
  respuestas), *Hablar con kywai* y *Tus datos* (copia de seguridad, importar de otras apps y pasar a kywai cloud).
- **Agentes**: *Tu equipo* (configurar agentes, cómo rinde cada agente, actualizar cuotas), *Permisos y planes*
  (permisos, visto bueno a cada plan, revisar con ojos nuevos) y *Aspecto en el 3D* (aspecto, tamaño del píxel y el
  coordinador que te avisa en el 3D).
- **Extensiones**: servidores MCP, apps conectadas, habilidades, plugins y mods.
- **Multimedia** (sección propia desde el 23 nov 2026, pedido por Yil): junta todo lo de imagen y vídeo. Arriba,
  *Imágenes y vídeos* (con qué se generan, antes en General; ver «Elegir con qué se generan las imágenes y los
  vídeos»). Debajo, el *Estudio de vídeo* (antes una pestaña de Extensiones): lo que tiene el equipo para montar
  vídeos con «Instalar lo que falta» e «Instalar ComfyUI», *Tu equipo* (estudio Pro), Pexels, la voz de ElevenLabs,
  **Redes de kywai** (Instagram y TikTok con Zernio, y las conexiones avanzadas) y las extensiones de vídeo. Lo pinta
  `MultimediaTab` de `ui/settings/ExtensionsTab.tsx`; el aviso «Instalar el estudio» del chat, las notas de parche
  y los mensajes que dicen «Ajustes → Multimedia → …» llevan aquí (`settingsTab: 'media'`).
- **Conexión**: *Este equipo* (dónde estás, cómo se usa este equipo, prestar los modelos), *Otros dispositivos*
  (acceso desde otros dispositivos, archivos del servidor, sincronizar carpetas) y, en un cliente de escritorio,
  *Cambiar de servidor* (cambiar, olvidar este dispositivo, usar este equipo como servidor).
- **Avanzado**: lo que casi nadie necesita tocar. *Rendimiento del 3D* (calidad, reducir efectos, medidor),
  *Tareas a la vez* (en todo el equipo y por agente) y *Pruebas* (modo demo, recargar la interfaz y
  [«Probar el estudio»](#probar-el-estudio-lo-hace-de-verdad-sin-agentes)).
- **Acerca de**: buscar actualizaciones, actualizar este equipo, reiniciar y apoyar kywai.

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
  encima» es una sola pieza que viaja de una fila a otra (130 ms, sin rebote), en vez de encenderse y apagarse en cada
  una. Si mueves el ratón deprisa (menos de 110 ms por fila) salta directo a la fila de debajo, para que nunca se quede
  detrás (antes, con un muelle de 340 ms, llegaba a ir una fila entera por detrás). Los botones se encienden en 70 ms al
  entrar el ratón y se apagan con calma al salir (`--dur-hover-in`).
- **Menús y globos** encogen un poco y funden al cerrarse (antes desaparecían de golpe); lo que recibe el foco del
  teclado se marca con un aro que llega desde fuera.
- **Tarjetas** (Resultados, Tablero, temas, cuotas): se levantan con su sombra al pasar por encima y ceden al pulsar.
  Las secciones de la barra (Favoritos, Proyectos, Recientes) y los chats de un proyecto se despliegan desde su título.

**Sonidos de la interfaz.** Cada gesto tiene un sonidito muy corto y muy bajo: los interruptores suben o bajan de
tono, las pestañas «pasan», lo que se despliega se abre o se cierra, coger y soltar un chat o un archivo suenan a
cogido y a posado, enviar un mensaje hace un pequeño «fiu» hacia arriba, copiar da dos toques, y abrir o cerrar un
panel (vista previa, espacio 3D) suena hacia arriba o hacia abajo. Van con **«Efectos y avisos»** (Ajustes →
General): con eso apagado o a cero no suena nada, y nunca pisan un aviso de verdad (tarea terminada, «Te necesita»).

**Modo tranquilo.** Con **«Reducir efectos ambientales»** (Ajustes → Avanzado → Rendimiento del 3D) nada se desplaza ni rebota: lo que
aparece solo funde, más corto. Con **«Reducir movimiento»** del sistema todo cambia al instante.

Cómo está hecho: las curvas de muelle están en `styles/motion.css` (`--spring`, `--spring-bouncy` y `--spring-soft`,
como `linear()` de CSS) y la misma física en `lib/motion.ts` para lo que se anima desde JavaScript (`enter`); el cambio de pestaña es `useSwitchMotion`
y la salida de los paneles `useExitGhost` (`ui/common/motion.ts`): al desmontarse deja una copia inerte en su sitio
que se va (los iframes, vídeos y lienzos de la copia se cambian por su fondo para no recargarlos). Lo del arrastre está en `lib/dragMotion.ts`: `setDragCard` (la tarjeta) y `flipRows` (mide las
filas con `data-slot` antes y después de soltar y anima la diferencia). La onda y el resalte que se desliza son
`lib/touchFeedback.ts` (escucha en el documento: no hay que tocar cada botón; las listas se marcan con `data-glide` y
lo que no debe llevarse el resalte, con `data-no-glide`; `glideTravels` decide si viaja o salta).

**Que el ratón no frene la interfaz (1.29.4).** Con Vidrio líquido la luz del cristal sigue al ratón, pero si el 3D
ya se está dibujando a su ritmo (`sceneDrawing` en `scene/perfStats.ts`) el movimiento solo apunta la luz y la recoge el
siguiente fotograma: antes cada movimiento pedía además un dibujo entero del 3D y la tarjeta gráfica trabajaba casi el
doble justo al mover el ratón. Los peluches que miran al ratón (`lib/PlushAvatar.tsx`) miden todos y después escriben,
y solo lo que cambia; la mascota que mira (`WatchingMascot`) se mide una vez por fotograma. Los menús que se cierran llevan `data-exit-motion`
(`lib/dialogMotion.ts`). Los sonidos son `playUi` en `lib/audio.ts` (`tab`, `toggleOn`, `toggleOff`, `open`, `close`,
`expand`, `collapse`, `pick`, `drop`, `send`, `copy`), sintetizados como el resto. Las
distancias de las animaciones se multiplican por `--m`, que vale 0 en modo tranquilo (`<html data-calm>`, lo pone
`startCalmSync` según `reducedEffects`).

**Que el 3D no frene la interfaz (1.30.26).** Yil, 24 nov 2026: «sigo sintiendo que consume mucho, me muevo medio lento
en los menús y el espacio 3D». La interfaz gasta poco procesador; lo que carga es la tarjeta gráfica (el 3D a 30 fps
con unas 35 pasadas de efectos). Ahora:
- **Menús y desplegables congelan el 3D** mientras están abiertos, como ya hacían las ventanas (`COVER_SELECTOR` en
  `scene/sceneCover.ts`: `aria-modal`, `data-popover` de `Popover`, `role="menu"` y `role="listbox"`). Llevan
  desenfoque y, con el 3D cambiando, la tarjeta lo recalculaba en cada fotograma.
- **20 fps con el ratón fuera del 3D** (chat, barra, menús) y 30 al pasar por él (`usePointerOver` en
  `scene/sceneRest.ts`, `sceneFps(focused, resting, engaged)`). El ajuste automático de calidad solo mide con el ratón
  sobre el 3D, para no bajarla por esos 20 fps.
- **Caras de los peluches** (`scene/plushCard.ts`): se repintan a 30 fps solo si botan, tiemblan o trabajan; respirando,
  pensando o dormitando, a 15.
- **Suelo bajo los agentes** (`scene/Robot.tsx`): andando, el rayo que busca el suelo se lanza como mucho cada
  `GROUND_EVERY_MS` (150 ms).

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

**Por significado.** Si las palabras tal cual encuentran menos de 5 cosas (y no es una frase entre comillas), el
buscador añade lo que **habla de lo mismo aunque no lleve esas palabras**, con la etiqueta «por significado»:
«error al iniciar sesión» encuentra «el login con Google falla en Safari». Funciona en el equipo que hace de motor
(también en kywai Cloud), sin enviar nada fuera, con **Qwen3-Embedding-0.6B** (Apache 2.0) en formato ONNX de 8 bits,
en un proceso de Python con `uv` que se queda cargado 10 minutos. La primera vez baja el modelo (~615 MB) y el buscador
dice «Preparando la búsqueda por significado…» y vuelve a buscar solo cada 6 s. Cada mensaje, tarea y nota se
convierte una sola vez en un vector de 256 bytes que se guarda en `<carpeta de trabajo>/indice-semantico/`; lo nuevo
se añade al buscar y lo que falta se prepara por detrás («buscado en N de M mensajes»). `KYWAI_SEMANTIC=0` lo apaga.
Con menos de 4 GB de memoria no se usa (los espacios de kywai cloud tienen 2 GB; kywai lee el límite del contenedor,
`src/main/usableMemory.ts`), salvo con `KYWAI_SEMANTIC=1`.
Código: `src/main/semanticSearch.ts`, `src/shared/semantic.ts` y `historyDocuments` en `conversations.ts`; la prueba
con el modelo de verdad: `KYWAI_TEST_SEMANTIC=1 npx vitest run src/main/semanticSearch.test.ts`.

### Título automático de los chats

Cada chat recibe un título corto que dice **de qué trata** («Arreglar la exportación en Safari», «Plan de redes para la
panadería»), en vez del principio de tu primer mensaje. Se ve igual en la barra lateral (también plegada), Recientes,
Favoritos, el Historial, el buscador, el chat de al lado, Órbita, el cliente y el navegador.

- **No cuesta nada más.** El título lo da el coordinador (Hermes) en la **misma respuesta** a tu primer mensaje, en tu
  idioma: no hay otra llamada a la IA. Mientras tanto, y en los chats que no pasan por el coordinador (`@agente` o un
  `/comando`), se ve el principio de tu mensaje hasta la siguiente respuesta del coordinador en ese chat.
- **Si empiezas con un saludo** («hola», «tengo una pregunta»), espera al siguiente mensaje para ponerlo.
- **Se pone una sola vez**: aunque la conversación cambie de tema, el título no se mueve solo.
- **Lo que pongas tú manda siempre.** Con clic derecho → «Cambiar nombre» el título es tuyo y la IA no lo vuelve a
  tocar. Un nombre que ya cambiaste antes de esta versión, o el que trae un chat importado de otra app, también se respeta.
- **Chats de antes**: si retomas uno que tiene como título el principio del primer mensaje, recibe título en la
  siguiente respuesta del coordinador. Para ponérselo a todos de una vez, en el **Historial** sale el botón
  **«Poner título con IA (N)»** (N = cuántos quedan). Lee el primer mensaje y el comienzo de la respuesta de cada uno,
  de 15 en 15 y hasta 150 por pulsación, con el **modelo más barato** que tengas: un agente con modelo ligero (Haiku,
  Flash-Lite…) y, si no hay, el coordinador. No es automático porque gastaría cuota con chats que quizá no vuelvas a
  abrir. Al acabar dice cuántos cambió y con qué agente.

Para quien programa: el coordinador devuelve `"chatTitle"` en su JSON solo cuando la conversación lo necesita
(`wantsAutoTitle` en `src/main/conversations.ts`); `titleBy` (`user` o `ai`) dice quién lo puso. Un título sin
`titleBy` que coincide con `titleFrom` (el principio del primer mensaje) se considera automático.

### Historial

**Historial** en la barra lateral (o «Ver todo el historial» al pie de Recientes y en el buscador vacío) abre una
ventana con **todas las conversaciones de todos los proyectos**, agrupadas por **Hoy, Ayer, Últimos 7 días, Últimos
30 días** y, las de antes, por **meses**. Cada una dice su proyecto, cuántos mensajes tiene y cuándo se habló por última
vez (y «abierta» la que tienes abierta).

- Arriba se **filtra por nombre** (el de la conversación o el del proyecto) y por **proyecto**.
- «**Buscar «…» dentro de los mensajes**» pasa lo escrito al buscador.
- ↑↓ y ↵, o un clic, abren la conversación.
- «**Poner título con IA (N)**» aparece si quedan chats de antes con el principio del primer mensaje como título: ver
  [Título automático de los chats](#título-automático-de-los-chats).

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

**En este equipo** busca lo que ya hay en el disco del ordenador desde el que importas: el **servidor** (donde corre
el motor) o, si abres la ventana desde un **PC cliente**, ese PC (y lo del servidor sale en la pestaña «En el servidor»):

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
  ni las revisiones automáticas de permisos de Codex, ni las pruebas de «Responde solo: ok» o «Responde SOLO con este
  JSON…», ni lo hecho en las carpetas temporales de kywai (`aicw`, `aicw-…`, `ai-cowork-hermes`).
- **App Claude de escritorio**: sus sesiones de código son de Claude Code. Se usa el **título** que les puso la app y
  la **carpeta que elegiste** (su índice `claude-code-sessions/` en `~/Library/Application Support/Claude`,
  `%APPDATA%\Claude` o `~/.config/Claude`); las que borraste en la app no salen y las hechas sin carpeta («scratch-…»)
  van a «Claude Code». Los **chats normales** de la app Claude y de Claude.ai no se guardan en el ordenador (están en
  tu cuenta): se traen con la exportación de Claude.ai, en «Desde un archivo».
- **Desde un PC cliente**: la app del PC lee sus propias sesiones (Claude Code, Codex, Hermes Desktop), las junta en un
  `kywai-chats.json` con las imágenes pegadas dentro (hasta 200 MB de imágenes por envío, 30 MB por imagen) y lo sube
  al servidor, que lo importa como una exportación y lo borra al acabar. La carpeta del PC no existe en el servidor:
  cada carpeta va a un proyecto con su nombre (o al que ya se llame así) y la conversación queda «Hermes · pc-…» para
  leer y seguir como contexto (la sesión real está en el PC, no se retoma). Lo ya importado sale marcado, también desde
  el PC, y no se duplica.
- La carpeta del sistema (`C:\Windows\System32`, donde empieza una terminal de administrador) o la raíz de un disco no
  son un proyecto: lo hablado ahí va al proyecto con el nombre de la app.
- Una sesión hecha en tu carpeta personal entera, o sin carpeta (Hermes por Telegram, Discord…), va a un proyecto con
  el nombre de la app («Hermes», «Claude Code»…) con carpeta interna: kywai no da acceso a la carpeta personal completa.
- **Hermes** (y **Hermes Desktop**, que usa la misma base): se lee la base SQLite de Hermes solo para leer, con el
  SQLite que trae la app (sin instalar nada). Cuando Hermes compacta una conversación larga y la sigue en otra sesión,
  se juntan en una. No se traen los encargos que kywai le hace a Hermes (empiezan por «Eres Hermes, el coordinador…»
  o «… parte de un equipo de agentes…» y ya están en tus chats), ni lo que trabajó en la carpeta interna de un
  proyecto de kywai, ni las sesiones ocultas en Hermes. Las **imágenes que pegaste** en Hermes Desktop (las guarda
  aparte, en `%APPDATA%\Hermes\composer-images`, y el mensaje solo dice `@image:<ruta>`) se copian a los adjuntos del
  proyecto y se ven en el chat; si ya no están en el disco, el mensaje se trae sin ellas. De momento la sesión de Hermes no se retoma (kywai lanza Hermes de una vez); al seguirla, el
  coordinador recibe lo hablado como contexto.

**Configuración de Hermes** (debajo de las conversaciones, en «En este equipo» y en «En el servidor»): trae lo que
configuraste en Hermes / Hermes Desktop para que lo usen **todos** los agentes de kywai, no solo Hermes:

- **Skills**: las de `~/.hermes/skills/<categoría>/<skill>/` (en Windows `%LOCALAPPDATA%\hermes\skills`) pasan a la
  carpeta «habilidades» de kywai con sus archivos de texto. De entrada van marcadas las **tuyas** (las que no trae
  Hermes de serie en `hermes-agent/skills`); «N en total» enseña también las de serie. Las archivadas (`.archive`) no
  salen. Una que ya existe en kywai con ese nombre no se pisa.
- **Lo que Hermes sabe de ti**: `memories/USER.md`, `memories/MEMORY.md` y `SOUL.md` quedan en la habilidad
  `lo-que-sabe-hermes` (un punto por recuerdo), que los agentes leen cuando importan tus gustos o tu contexto.
  Volver a traerla la reescribe con lo último. La memoria del proyecto y lo que digas mandan sobre ella.
- **Servidores MCP**: los de `mcp_servers:` de su `config.yaml` (salvo los `enabled: false`) pasan a Extensiones,
  **apagados**; las `${VAR}` se cambian por su valor de `~/.hermes/.env` y las claves se guardan cifradas, como las
  demás. Enciéndelos para los agentes que quieras (se prueban al encenderlos). Desde un PC cliente, un servidor que es
  un programa de ese PC (rutas de Windows, por ejemplo) no se trae a un servidor con otro sistema: no arrancaría.
- **No se copian** el modelo ni las claves de tus proveedores: el Hermes de kywai ya usa su propia configuración
  (y, desde ahora, también sus MCP y plugins al trabajar).

Desde un PC cliente, la app del PC lo lee y lo sube al servidor (`kywai-hermes.json`, se borra al acabar). El motor
está en `src/main/hermesSetup.ts`.

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
Si su programa no informa del límite, se muestran los usos registrados de hoy («Sin uso hoy», «3 usos hoy»; ya no sale
**N/D** ni el «?», desde la 1.5.0) y, al abrirlo, el porqué, también los de los últimos 7 días; puedes configurar un presupuesto para estimarlo. No se deduce una cuota ilimitada por ser un agente gratuito.

**Una sola ficha en la cabecera** (desde el 22 nov 2026; antes, una por suscripción): un anillo con el % que le queda
a la primera suscripción con dato («Cuota 62 %») y un **punto** ámbar o rojo si alguna se está acabando o se ha
acabado. Al pasar el ratón dice cómo va cada una; al pulsarla se abren todas las fichas, y cada una abre su detalle.

| Indicador | Fuente |
|---|---|
| GPT (Codex) | **Dato real**: se pregunta a Codex al abrir la app y cada 5 min (su `app-server`, no gasta uso), y tras cada tarea |
| Claude | **Dato real**: se pregunta a Claude Code con `/usage` al abrir la app y cada 5 min (no llama al modelo ni gasta uso), y tras cada tarea |
| Gemini | Con clave de API, Google no informa la cuota: se muestran los usos de hoy («3 hoy»), o una estimación si configuras un presupuesto (clic en el indicador) |
| Hermes | Con **OmniRoute en este equipo**: **dato real** de OmniRoute. kywai entra en su panel con la contraseña que le puso al prepararlo y lee `/api/usage/quota` y `/api/usage/provider-limits` al abrir la app y cada 5 min (no gasta uso). Si el modelo de Hermes es de un proveedor concreto (`cc/…` = Claude, `cx/…` = Codex…) enseña esa suscripción; si es un combo o «auto», la cuenta conectada con más margen. El % es el de su ventana más justa y el detalle lista todas. Si la contraseña no entra, no insiste en 30 min (su panel bloquea tras varios fallos). En **kywai cloud** (OmniRoute del espacio) entra con la llave de su API (`x-omniroute-cli-token`) en vez de la contraseña. OmniRoute solo pregunta la cuota a cada proveedor cada 70 min: si hay una conexión sin dato (recién conectada o recién encendido), kywai le pide actualizarla (`POST /api/usage/provider-limits`), como mucho una vez cada 10 min. Sin OmniRoute, o si está apagado o sin suscripciones, enseña los usos de hoy y de 7 días |
| Antigravity CLI | **Dato real** (desde la 1.5.0): se pregunta a `agy -p /usage --output-format json` al abrir la app y cada 5 min (se resuelve sin llamar al modelo; hace falta agy 1.3 o más nueva y la sesión de Google iniciada). Google da un límite de 5 h y otro semanal por grupo de modelos («Gemini» y «Claude y GPT»): el % es el más justo del grupo con el que trabaja el agente (Gemini salvo que le elijas Claude o GPT) y el detalle lista todos. Si agy no está, no tiene sesión o es una versión vieja, el detalle dice cuál de las tres pasa y enseña los usos de hoy |
| Codewhale | Paga **por uso**, no tiene %: con tu clave de DeepSeek (la que le pusiste al conectarlo, o `DEEPSEEK_API_KEY`) enseña el **saldo de tu cuenta de DeepSeek** («4,20 $», `GET api.deepseek.com/user/balance`, no gasta nada) al abrir la app y cada 5 min; en ámbar por debajo de 1 $ (7 ¥) y en rojo sin saldo. Con otro proveedor o sin clave en kywai, los usos de hoy y la explicación |
| Local | Sin cuota (ejecución en tu PC) |

⚙ → Ajustes → Agentes → Tu equipo → «Actualizar cuotas», o escribir `/usage` (también `/uso` o `/cuotas`) en el chat, las vuelve a consultar en el
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
- En ese panel, **«¿Dónde se van mis tokens?»** (1.30.44, 24 nov 2026; idea de Token Optimizer): una barra con el
  reparto del periodo entre **hacer las tareas**, **coordinar**, **comprobar** e **intentos fallidos**, y debajo lo
  **ahorrado** (tokens que los agentes no tuvieron que leer gracias a las [salidas recortadas](#proyectos-memoria-y-consumo),
  a unos 4 caracteres por token) y los **bucles** que kywai paró. Si más de una quinta parte se fue en intentos
  fallidos, lo dice y manda a «Por agente». Código: `WhereTokens` en `UsageDialog.tsx` y `summarize` en
  `usageStats.ts` (`workTokens`, `verifyTokens`, `trimmedTokens`, `trimmedCalls`, `loops`).

Para comparar con un solo agente (por ejemplo Codex aparte), haz la misma petición allí y compárala con su fila
(en Codex, `/status` da los tokens). Hermes no informa sus tokens. El registro se guarda en
`usage-runs.json`, dentro de la carpeta de datos, y lleva también tu 👍/👎 de cada resultado (ver
[Valorar un resultado](#valorar-un-resultado-)): así se puede comparar no solo lo que costó, sino lo que sirvió.

### Uso y coste: créditos kywai

Desde el 23 de noviembre de 2026 (v1.17.9), arriba del panel ⚙ → **«Uso y coste…»** sale **«Créditos kywai»** cuando
hay cuenta kywai: en **kywai Cloud** siempre, y en **tu equipo** si lo enlazaste con tu cuenta en Ajustes →
Extensiones → Apps conectadas. Sin cuenta kywai no sale nada.

- **Te quedan**: los créditos que quedan, con cuántos son del plan de este mes (no se acumulan) y cuántos comprados o
  de regalo (no caducan).
- **Gastados** y **Añadidos** en el periodo elegido (Hoy, 7 días, 30 días o Todo). 1 crédito = 0,01 $.
- **En qué se gastaron**: una barra por tipo (imágenes con la GPU de kywai, aspecto y modelos 3D de agentes, hablar con
  kywai, paquetes de minutos de voz, acciones extra de Apps conectadas…), con los créditos y las veces. Lo devuelto
  (una imagen que no salió) se resta de su tipo.
- **Recargar créditos** abre Mi cuenta → Créditos kywai.
- En la **cuenta de administración** (créditos sin límite desde la 1.14.2) sale **«Ilimitados»**, sin botón de recargar,
  y **Gastados** es lo que habría costado lo usado en el periodo (el portal lo apunta en la columna `valor`, porque a
  esa cuenta no se le descuenta nada).
- En una instalación propia sin enlazar, en vez del panel sale una línea con **«Enlazar mi cuenta kywai»** (abre
  Ajustes → Extensiones).
- Con la ventana abierta se pone al día cada minuto.

Cómo funciona: la app pregunta al portal `GET /api/creditos?desde=<segundos>` (kywai-cloud `portal/creditos.py`). En la
nube va con el secreto del espacio (el de la voz incluida, `KYWAI_VOZ_SECRETO`); en tu equipo, con el token `kyl_` de
Apps conectadas (`src/main/kywaiCredits.ts`). El portal solo da cantidades y tipos, **nunca el texto** de cada
movimiento (en las imágenes sería lo que escribiste). Si el portal aún no tiene la ruta, la app dice que llegará con la
próxima actualización de la nube.

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
- **Tope por petición** (desde el 20 de noviembre de 2026). Desde la 1.21.7 (24 nov, idea de AnyModelBot) viene
  puesto: **vacío es 1 $** (`DEFAULT_RUN_BUDGET_USD`) y con **0 no hay tope**. Si UNA petición gasta eso en agentes
  que pagas por uso (las suscripciones y los agentes sin «Cómo pagas» elegido no cuentan), kywai la **pone en pausa**
  en cuanto termina la llamada que lo pasa: sus tareas a medias quedan para reanudar donde estaban y «Te necesita»
  dice cuánto lleva, con **«Darle 1 $ más»** (o el tope que tengas: sube el tope de esa petición y la reanuda; si
  vuelve a llegar, vuelve a preguntar), «Seguir sin tope» (ya no se vuelve a parar por el tope) o «Quitar». Idea
  de las misiones con presupuesto de Replit (`checkRunBudget`, `runLimitUsd` y la acción `budget-more` en
  `orchestrator.ts`; `runApiSpendUsd` y `runBudgetUsd` en `src/shared/costs.ts`).
- **Tope al mes por agente** (24 nov 2026, v1.27.1; idea de Paperclip): una casilla por cada agente del equipo (sin
  becarios; lo que gastan los becarios cuenta para su agente). Vacío: sin tope. Solo cuenta lo que pagas por uso de
  ese agente desde el día 1. Al **80 %** «Te necesita» avisa una vez al mes; al **100 %** el agente **descansa hasta
  el día 1**: queda bloqueado como cuando se queda sin cuota (sus tareas pasan a otro agente libre) y el aviso trae
  **«Darle … más este mes»** (suma otro tanto a su tope solo este mes y vuelve a trabajar al momento). Si le subes o
  quitas el tope en esta pantalla, vuelve en cuanto se le pide algo. Código: `checkAgentBudget`, `restAgent`,
  `overAgentBudget` y la acción `agent-budget-more` en `orchestrator.ts`; `agentBudgetUsd`, `agentMonthApiSpendUsd` y
  `budgetAgentOf` en `src/shared/costs.ts`; se guarda en `costs.agentBudgets` (y `agentBudgetExtra`,
  `agentBudgetAlerted`, que se conservan al guardar desde la pantalla).
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
- **Tú a la derecha, los agentes a la izquierda** (21 nov 2026, pedido por Yil): tu foto, tu nombre y tu burbuja van a
  la derecha (con la muesca arriba a la derecha) y las respuestas de los agentes a la izquierda. Las dos burbujas
  empiezan y acaban en las mismas líneas: cada una deja libre la columna de la foto del otro lado. En el chat estrecho
  las dos usan todo el ancho. Lo que escribe un amigo en un proyecto compartido sigue a la izquierda.
- **Con cristal (Interfaz Vidrio líquido o Frost Glass)** la respuesta del agente sí lleva caja, y es la misma burbuja
  que la tuya: mismas esquinas redondeadas con la muesca, mismo margen interior y mismo brillo de borde; solo cambia
  el color (la tuya azul, la suya cristal claro). Antes salía un recuadro cuadrado con el texto pegado al borde.
  Por dentro: `ui/left/Messages.module.css` (`.msgRight` y las reglas `:root[data-glass]` de las burbujas).
- **La caja de escribir** (21 nov 2026, pedido por Yil): la sugerencia gris («… ⇥ Tab») se ve entera aunque ocupe
  dos líneas (la caja ajusta su alto también cuando cambia la sugerencia, no solo al escribir), y el botón de enviar
  (y «Detener») queda siempre centrado en vertical. Por dentro: `ui/left/Composer.tsx` y `Composer.module.css`.
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

### ZIP adjuntos: se abren solos y sin riesgos (24 nov 2026, v1.21.9)

Un **.zip** adjunto (arrastrado, pegado, subido desde Órbita o «Adjuntar al mensaje») se abre aparte en la carpeta
`attachments/<nombre>-zip/`, y Hermes y los agentes reciben esa carpeta en vez del .zip («ZIP ya abierto en … lee
esa carpeta»). Antes de sacar nada se lee el índice del ZIP y se rechaza **entero** si:

- trae **más de 2.000 archivos** o **más de 200 MB** descomprimidos (también si el .zip pesa más de 200 MB);
- alguna ruta se sale de la carpeta (`../`, `/…`, `C:\…`), tiene caracteres de control o nombres que Windows no
  deja, o dos archivos se llaman igual salvo mayúsculas;
- hay **enlaces simbólicos** o archivos **cifrados** (o un método de compresión que no sea guardar/deflate).

Al sacar se cuenta lo que de verdad sale (un ZIP puede mentir sobre su tamaño: se corta), nunca se escribe encima
de nada y hay un tope de **60 s**. Si algo falla, se borra todo lo extraído y el agente recibe «ZIP sin abrir por
seguridad (motivo); no lo descomprimas a mano», para decirte por qué. Borrar el adjunto borra también su carpeta.

Por dentro: `src/main/safeUnzip.ts` (`readZipIndex`, `safeUnzip`, `ZIP_LIMITS`), `openZipAttachment` y `zipsReady` en
`src/main/projects.ts` (el plan espera a que se abran), `Attachment.zip` en los tipos y `zipNote` en
`src/main/orchestrator.ts`. Idea sacada de AnyModelBot.

### Miniaturas de imágenes, vídeos y PDF en el chat

(24 nov 2026, v1.28.5; pedido por Yil: «como lo haces tú, Claude».) Lo que entrega un agente que sea **imagen, vídeo
o PDF** sale en el chat como una **miniatura compacta**, igual que al compartir un archivo en Claude: arriba a la
izquierda la etiqueta del tipo («PNG», «MP4», «PDF») y debajo el nombre del archivo. Ya no sale la imagen a todo lo
ancho ni la barra de «Descargar / Abrir» debajo.

- **Clic** en la miniatura: se abre en grande en el panel de vista previa (con ‹ › para pasar por todo el mensaje).
  Dónde (v1.28.6, pedido por Yil): en la columna del espacio 3D, a la derecha del chat; si esa columna la ocupa otro
  chat (el chat de al lado) o el navegador, en grande y delante de todo, como «Ampliar». Un archivo que se abre desde
  el propio chat de al lado también sale en grande delante, en la ventana principal (mensaje `preview` del marco).
  Código: `openPreview`/`openViewer` en `store/cowork.ts`, `ChatPaneApp.tsx` y `SplitChat.tsx`.
- **Ratón encima**: aparece la flecha de **descargar** arriba a la derecha. En móvil y tableta se ve siempre.
- **Abierto** en la vista previa, la cabecera lleva el botón **«Descargar»** con su flecha a la vista (en pantallas
  estrechas, solo la flecha).
- El vídeo enseña su primer fotograma con ▶; el PDF, su icono.
- Varias imágenes (hasta 4) salen en una fila de miniaturas. Si una no carga (archivo borrado), vuelve su fila de
  siempre para que no se pierda. Los demás archivos (páginas, documentos, código) siguen con su fila.
- Código: `MediaThumbs` / `MediaThumb` y `ArtifactCards` en `src/renderer/src/ui/left/Messages.tsx`.

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
- **Editar hojas de cálculo** (17 nov 2026): encima de la tabla, **«Editar»** abre el editor de
  [Univer](https://github.com/dream-num/univer) (Apache-2.0) en el mismo panel: escribir en las celdas, fórmulas que se
  recalculan, varias hojas, combinar, copiar y pegar como en Excel, en el idioma de kywai. **«Guardar copia»** guarda lo
  editado **junto al original** como `nombre (editado).xlsx` (o `-2`, `-3`…; un CSV se guarda como CSV, en UTF-8 con BOM
  para que Excel lea los acentos; `.ods` y `.xls` en su formato; Numbers y el resto como `.xlsx`) y la copia sale en
  Resultados. **El original nunca se toca**, porque se guardan valores, fórmulas, celdas combinadas y anchos de columna,
  pero no colores, bordes ni formatos de número (abrir y guardar Excel en Univer es de su parte de pago: la conversión la
  hace kywai con SheetJS). Hasta 5.000 filas y 200 columnas por hoja; si el libro es más grande, no deja editar para no
  perder nada. El editor pesa unos 12 MB y solo se descarga al pulsar «Editar»; desde la web, la copia guardada puede
  pesar hasta unos 3 MB. Código: `src/renderer/src/ui/preview/viewers/SheetEditor.tsx` y `sheetEdit.ts` (conversión),
  `saveSheetCopy` en `src/main/projects.ts`.
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

### Ventanas encima de otras ventanas (se adaptan a la ventana)

Las ventanas que se abren desde dentro de otra (la copia de seguridad, «Pasar a kywai cloud», «Desinstalar kywai» o
las actualizaciones desde **Ajustes**; añadir un agente desde el asistente; la galería y el editor de plantillas
desde el chat…) se pintan siempre directamente en `<body>` con `toBody()` (`src/renderer/src/ui/common/toBody.ts`).
Antes se pintaban dentro de la de fuera, y el desenfoque y el «vidrio» de Ajustes las encerraban en su caja: salían
cortadas por arriba y por abajo, no se podía bajar hasta sus botones y no se adaptaban a ventanas pequeñas ni al móvil
(arreglado en la 1.29.10). Ahora ocupan la ventana entera, su tarjeta mide como mucho el alto de la ventana y lo que
no cabe se desplaza dentro de ella.

**Regla para ventanas nuevas:** si la ventana tiene fondo oscuro a pantalla completa (`.backdrop` con `position:
fixed`), su `return` va con `toBody(...)`. Las pruebas que la monten buscan en `document.body`, no en el `div` donde
se monta.

### Ventanas que se agrandan (estirar, maximizar y recordar el tamaño)

Desde la 1.32.0 (25 nov 2026, pedido por Yil: «quiero ver más menú a la vez») **Ajustes** y las demás ventanas largas
se agrandan:

- **Estirar** desde cualquier borde o esquina: al acercar el ratón cambia el cursor, el borde se ilumina mientras
  arrastras y en la esquina sale el tamaño (por ejemplo «1240 × 860»). Las ventanas centradas crecen por los dos lados
  para que el borde siga al ratón; las que van arriba (Buscar, Historial, Amigos, Importar) crecen hacia abajo.
- **Maximizar** con el botón junto a la ✕ (o con doble clic en el título); el mismo botón (**Restaurar tamaño**) la
  devuelve al tamaño que tenía.
- **Recuerda el tamaño** de cada ventana en este dispositivo. Con **doble clic en una esquina** vuelve al tamaño de
  siempre.
- Nunca queda más pequeña que su tamaño de siempre ni se sale de la ventana de kywai. En pantallas de 700 px o menos
  (móvil) no hay asas ni botón: ahí las ventanas ya ocupan toda la pantalla.
- **El contenido se adapta.** En Ajustes, cuando la zona de la derecha pasa de 860 px de ancho, las tarjetas y las
  secciones plegables van en **dos columnas** (los títulos y textos sueltos siguen a lo ancho). En las demás ventanas
  las listas, tablas y cuadrículas simplemente ganan sitio.

Ventanas que lo tienen: Ajustes, Uso y coste, Cómo rinde cada agente, Novedades, Acceso desde otros dispositivos,
Archivos del servidor, Añadir un agente, Buscar (sin botón de maximizar, solo bordes), Historial, Amigos, Importar de
otras apps, la galería de apps y el editor de plantillas del chat, el modelo de Hermes y la traza de una tarea. Los
avisos cortos («¿Seguro?», desinstalar, copia de seguridad, reportar un problema) se quedan como estaban.

Código: `src/renderer/src/ui/common/ResizableWin.tsx` (`useResizableWin`, `MaxButton`, `titleDoubleClick`) y su CSS.
Las asas son una capa invisible del tamaño de la ventana dentro del fondo oscuro (no dentro de la ventana, que muchas
desplazan su contenido); se colocan con `offsetLeft/offsetTop` para no moverse con la animación de entrada. El tamaño
se guarda en `localStorage` como `kywai.ventana.<id>`. Las dos columnas de Ajustes son una consulta de contenedor
(`@container ajustes`) en `SettingsDialog.module.css` (`.panel`).

**Regla para ventanas nuevas largas:** `const rz = useResizableWin('<id>')` arriba del componente (antes de cualquier
`return null`), `ref={rz.ref}` y `style={rz.style}` en la tarjeta, `<MaxButton rz={rz} />` justo antes de la ✕,
`onDoubleClick={titleDoubleClick(rz)}` en la cabecera y `{rz.grips}` como último hijo del fondo oscuro.

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
- **Pestañas de arriba del chat** (desde el 22 nov 2026, más limpias): a la vista solo **Chat, Tareas, Tablero y
  Resultados** (`MAIN_TABS` en `ui/left/LeftPanel.tsx`); el resto (Archivos, Memoria, Rutinas, Secretos y Mods) va en
  **«⋯»**, a la derecha de la fila. Si abres una de «⋯», sale también como pestaña mientras la tienes abierta. Un punto
  en «⋯» avisa si alguna de dentro tiene algo (por ejemplo, notas de memoria por revisar). Si al estrechar el panel
  ya no caben con su nombre, quedan **solo los iconos** (la pestaña abierta conserva su nombre; el nombre de cada una
  sale al pasar el ratón). Si aun así no caben, la fila **se desplaza de izquierda a derecha** con la rueda del ratón
  (también la normal, sin Mayús), con el trackpad o con las flechas **‹ ›** que salen en los bordes; la pestaña
  abierta siempre queda a la vista. Al ensanchar, vuelven los nombres.
- **Cabecera del Espacio digital** (desde el 22 nov 2026, más limpia): a la vista solo el título con un punto de
  estado («En vivo»; en la demo no sale, porque ya lo dice el sello «Demo» de la cabecera), 3D / 2D, Música, **«⋯»** y
  ocultar el espacio. Dentro de «⋯» están Modo noche y Auto,
  el Navegador y, en la demo, su escena con pausar y reiniciar. Cuando el 3D se queda estrecho, primero se esconde el
  texto del estado; el título se recorta con «…» y, si aun así falta sitio, queda solo su icono.
- **Caja de escribir** (desde el 22 nov 2026): el texto ocupa todo el ancho y debajo van adjuntar, imagen, micro y
  esfuerzo a la izquierda y Enviar a la derecha, todo dentro de la misma caja.
- **Sin repeticiones en la barra lateral** (desde el 22 nov 2026): Tareas, Tablero, Resultados y Rutinas ya no salen
  en la barra lateral, porque son las mismas pestañas del chat (la introducción las señala ahí). La barra queda con
  Nuevo chat, Buscar, Historial, Amigos, «Te necesita» y tus proyectos. En Tareas, una tarea en curso con barra de
  progreso enseña el tiempo solo al final de la barra. El Tablero se explica en una línea con «ⓘ» (la explicación
  entera, al pasar el ratón). En la demo web, el pie de la barra dice «kywai · Demo» con el punto en gris.
  Para que la demo no se vea vacía, la barra lateral enseña **proyectos de ejemplo** («Lanzamiento app» con dos chats,
  «Web de la tienda», «Vídeo de presentación»; `DemoProjects` en `ui/sidebar/Sidebar.tsx`) y el Tablero un **tablero de
  ejemplo** con una tarjeta o dos en cada columna (`demoBoard` en `ui/left/BoardView.tsx`), solo para mirar.
- **Un solo aviso de demo** (desde el 22 nov 2026): en la demo solo lo dice el sello «Demo» de la cabecera; ya no se
  repite en el menú lateral, bajo el chat, junto al título del espacio ni en una etiqueta sobre el 3D.
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

La interfaz está en **español**, **inglés**, **portugués**, **francés**, **chino** (simplificado) e **hindi**. ⚙ → **Ajustes…** → General →
**«Idioma · Language»** es una lista con cada idioma en su propio idioma (Español, English, Português, Français,
中文, हिन्दी); al elegir otro, la ventana se recarga para que todo salga ya
traducido. Se recuerda en cada dispositivo (a diferencia del tema, que es el mismo en todos): la app del Mac,
el navegador y cada cliente pueden tener el suyo. Si nunca se ha elegido, se usa el idioma del sistema si es uno de
esos seis (cualquier variante: es-MX cuenta como español, pt-PT como portugués, hi-IN como hindi); si no, inglés. Las fechas y los números siguen el idioma elegido.

**Hindi y chino en todo kywai.** Además de la app, el hindi está en Órbita, Mi cuenta, kywai.app, los correos y el
instalador de una línea (que también habla chino). En hindi, las voces de vídeo de Kokoro son Alpha y Beta (mujer) y
Omega y Psi (hombre); la hoja de cálculo editable sale en inglés (Univer no trae hindi) y los costes en dólares. La
letra de todos los temas añade las del chino (PingFang, Microsoft YaHei, Noto Sans SC) y el devanagari (Kohinoor
Devanagari, Nirmala UI, Noto Sans Devanagari) de cada sistema. El asunto del correo de confirmación de registro llega
en inglés a quien usa hindi (el límite de 255 caracteres de Supabase no deja otro idioma más). Las traducciones al
hindi se hicieron a partir del inglés: conviene que las repase alguien nativo.

**El idioma sigue a la persona en todo kywai.** Quien empieza en un idioma en kywai.app sigue en él en Mi cuenta
(cuenta.kywai.app), en los correos de confirmación y de acceso, en los avisos que manda Mi cuenta y en su espacio de
kywai Cloud: Mi cuenta lo abre con `?lang=xx` y la interfaz lo guarda y se lo dice al motor. Un dispositivo que
nunca eligió idioma usa el del servidor (el de la cuenta) en lugar del del sistema, y lo sigue si cambia. Al pulsar
«Entrar con kywai cloud», la app de escritorio y Órbita abren Mi cuenta en su idioma, y ese pasa a ser el de la cuenta.

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
debajo la fila de sus ocho colores (y al pulsarla vuelve al último color elegido). El color cambia la interfaz y el
espacio 3D (suelo, ciudad, estaciones, circuitos, núcleo y luces). Tienen nombres propios para no repetir los de los
mapas; entre paréntesis, cómo se llamaban cuando eran temas sueltos:

- **Índigo** (Clásico): el predeterminado, paneles oscuros y sobrios.
- **Frost Glass** (Órbita): cristal esmerilado, como la app del móvil. El espacio 3D ocupa toda la ventana y el
  chat, la cabecera, las barras, los menús y las ventanas flotan encima como cristal que lo deja ver difuminado; el
  mundo se centra en la zona que deja libre el chat.
- **Amatista** (`liquido`; hasta el 20 nov 2026 se llamaba «Vidrio líquido»): la ciudad con colores de aurora
  (violeta, verde agua y rosa). Con la Interfaz en Normal, sus paneles son un esmerilado gris neutro.

**Interfaz: Normal o Vidrio líquido** (20 nov 2026, pedido por Yil: «que la interfaz vidrio líquido sea una opción en
sí misma»). En ⚙ → Ajustes → General → Apariencia, debajo de «Tema» (desde el 23 nov 2026 ya no está en el menú ⚙). El tema elige
el fondo del espacio y los colores; la Interfaz elige si el chat, los Ajustes, los paneles y la barra lateral son los
de siempre o cristal líquido, y se combina con cualquier tema (mapas, decorados, Oficina, Ciudad digital). Se guarda en
cada dispositivo (`aicowork.uiStyle`; no va al servidor porque Órbita no tiene el cristal 3D). Quien tenía el antiguo
tema «Vidrio líquido» pasa solo a Amatista + Interfaz Vidrio líquido y lo ve igual. Por dentro: `lib/theme.ts`
(`uiStyle`, `setUiStyle`, `glassOf(tema, interfaz)`) pone `data-glass="liquid"` en `<html>`; `theme-liquido.css` lleva
el vidrio en `:root:root[data-glass='liquid']`, teñido con el color flotante de cada tema (`--float-rgb`): oscuro en
los temas oscuros y claro en Perla, Refugio y la Oficina de día (borde de luz más fino y sin sombra en las letras).
`scene/World.tsx` monta el cristal de verdad con la Interfaz en Vidrio líquido, sea cual sea el tema.
Dónde va el 3D (a toda la ventana detrás del chat con cristal, o en su panel) lo decide `App.tsx` con `useGlass()`,
que sigue el tema y la Interfaz. Hasta el 22 nov 2026 solo seguía el tema: al elegir Vidrio líquido el 3D se quedaba en
su panel hasta tocar otra vez el ajuste, y al volver a Normal se quedaba tapado detrás (pedido por Yil: «tengo que
reajustarla para que aplique» y «el espacio 3D deja de verse»). La prueba está en `lib/theme.test.ts`.

**Ajustar el vidrio** (21 nov 2026, idea del vídeo «Agentic Liquid Glass»: «un desenfoque tiene un control; el vidrio de
verdad, treinta»). Con la Interfaz en Vidrio líquido sale debajo «Ajustar el vidrio»: cinco deslizadores (Refracción,
Arcoíris, Escarcha, Luz y Grosor, de 0 a 100) y «Restablecer». El cristal cambia en el acto mientras se mueven. Se guarda
en este dispositivo (`aicowork.glassLook`). Por dentro: `lib/glassLook.ts` guarda y corrige los valores (`GLASS_MAX`:
todos hasta 2 salvo la escarcha, hasta 1; el valor de fábrica es `DEFAULT_LOOK` de `lib/liquidShader.ts`) y
`scene/LiquidGlass.tsx` los pasa a los uniformes del sombreador (`uRefr`, `uDisp`, `uFrost`, `uLight`, `uThick`).
Solo cambia el cristal de verdad (con el 3D visible y calidad media o alta); el esmerilado de reserva no cambia.

*En tiempo real* (23 nov 2026, kywai 1.15.5; pedido por Yil: «cuando esté moviendo los sliders necesito ver en tiempo
real cómo cambia el cristal líquido»). Hasta entonces no se veía: con los Ajustes abiertos el 3D se queda quieto
(`scene/sceneCover.ts`, para evitar parpadeos) y el cristal lo pinta el 3D, así que el cambio no se dibujaba hasta
cerrarlos; además el velo oscuro de la ventana tapaba la app. Ahora, al pulsar un deslizador (o moverlo con las
flechas), los Ajustes se apartan: el velo y la ventana desaparecen y solo queda flotando el bloque de los
deslizadores, con la app detrás y su cristal cambiando mientras arrastras. Al soltar, todo vuelve tras 0,7 s. Por
dentro: `lib/glassPeek.ts` pone `data-glass-peek` en `:root`; mientras está, `sceneCovered()` no cuenta la ventana como
tapa (el 3D vuelve a dibujarse) y `SettingsDialog.module.css` oculta el velo y la ventana salvo `.glassTuner` (el marco
sale con sombras para que el deslizador no se mueva bajo el dedo). Si el cristal de verdad no está encendido (3D cerrado
o calidad Baja; `useLiquidGlassOn()` mira `data-lg`), no se apartan y la pista lo explica. Pruebas en
`lib/glassPeek.test.ts` y `scene/sceneCover.test.ts`.

*Letras legibles con cualquier ajuste* (23 nov 2026, kywai 1.15.5; Yil: «las letras no se ven bien por el contraste»,
en la ficha de Hermes con Refracción 0, Arcoíris 100, Escarcha 1, Luz 100 y Grosor 100 sobre la Oficina). Con la escarcha
casi a 0 el cristal apenas oscurecía y, sobre un fondo claro, las pistas grises quedaban sobre un gris claro. Ahora el
sombreador (`lib/liquidShader.ts`) pone un tope: con letras claras, lo que se ve dentro del cristal no pasa de
`INK_DARK_MAX` (0,26 de luminancia; el gris de las pistas queda por encima de 4,5:1) y con letras oscuras (Perla,
Refugio, Oficina de día) no baja de `INK_LIGHT_MIN` (0,72). Solo oscurece o aclara lo justo, así que sobre fondos ya
oscuros el cristal se ve igual que antes. `scene/LiquidGlass.tsx` mira cada 30 fotogramas si `--text-1` del tema es
claro (`isLightColor`) y lo pasa como `uInk`. Pruebas en `lib/liquidShader.test.ts` (con los cinco deslizadores en sus
extremos).
La ficha del agente en el espacio (`ui/space/SelectionPanel.module.css`) llevaba un tinte gris oscuro fijo a medias:
en los temas claros salían letras oscuras sobre oscuro. Ahora se tiñe con el color flotante del tema (`--float-rgb`,
claro en los claros y oscuro en los oscuros) al 82-90 %. Capturas en `/mnt/project-files/vidrio-tiempo-real/`.

- **Vidrio líquido** (la Interfaz): el cristal de Apple en el Mac (Liquid Glass), sobre el mismo espacio a
  pantalla completa que Frost Glass. El vidrio es gris neutro y casi opaco
  (el texto se lee sobre cualquier cosa), toma el color de lo que tiene detrás y lleva un borde de luz desigual, más
  brillante arriba a la izquierda. En el escritorio y en Chrome, cerca del borde del chat, la barra lateral, la barra
  del espacio y los menús, lo de detrás se dobla y se estira como en el canto de una lente (`lib/liquidGlass.ts`: un
  mapa de desplazamiento SVG por panel, dibujado a la mitad de tamaño y rehecho al cambiar de tamaño). En Safari y
  Firefox queda el vidrio sin doblar. Con «Reducir transparencia» del sistema el vidrio pasa a casi opaco y sin
  refracción. Tus mensajes van en el único azul de la interfaz. Basado en la skill MIT «liquid-glass-skill».
  - **Cristal de verdad** (20 nov 2026, pedido por Yil: «no un frost, sino uno que mueva la luz y distorsione el
    fondo y se vea 3D»). Con el espacio 3D visible y la calidad gráfica media o alta, el vidrio ya no es un
    esmerilado: lo dibuja la tarjeta gráfica encima de la imagen del espacio, en el mismo fotograma
    (`scene/LiquidGlass.tsx` con el sombreador de `lib/liquidShader.ts`). Imita lo que Apple cuenta de su Liquid Glass
    (WWDC25 «Meet Liquid Glass») con las medidas de kube.io: cada panel es una lente con el canto en forma de
    «squircle convexo» y vidrio de índice 1,5 (ley de Snell); el centro se ve plano y nítido y en el canto lo de
    detrás se dobla de verdad, con un poco de arcoíris porque cada color se dobla distinto. La luz de borde viene de
    arriba a la izquierda y gira un poco con el ratón; el canto opuesto refleja menos. Lo «líquido»
    (`lib/liquidDrops.ts`): los botones de la barra del espacio son gotas de cristal que se funden entre sí cuando
    están cerca, se aplastan y rebotan al pulsarlos, la luz nace bajo el dedo, y la pestaña elegida del chat y el
    3D/2D llevan una gota que se desliza con un muelle y se estira al moverse. Valores fijados por Yil en la maqueta
    (https://claude.ai/artifact/K3c1E7HaMVs6Em7P6BzgKj): refracción, grosor, arcoíris y luz al máximo y esmerilado 15.
    Mientras está encendido, `:root` lleva `data-lg` y los paneles con `data-refract="before"` quitan su esmerilado
    (`theme-liquido.css`). **Modo ligero**: si eliges la calidad «Baja» a mano, el espacio se cierra o pasa a 2D, la
    ventana se oculta o el sistema pide «Reducir transparencia», se desmonta y vuelve solo el esmerilado de arriba.
    Desde el 21 nov 2026 (aviso de Yil: «de repente se pone frost y el fondo se queda en negro») el ajuste automático
    ya no lo quita: si el equipo no llega a 24 fps baja la resolución y las partículas, pero el cristal se queda. Los menús emergentes siguen esmerilados (cristal sobre cristal no
    se leería).
    **Barra plegada unida al logo** (20 nov 2026, arreglado por aviso de Yil): el sombreador toma el radio mayor de
    las esquinas de cada panel (al unirse al logo, la barra cuadra solo las de arriba; antes salía cuadrada también
    abajo) y, con la barra unida del todo (`data-fused` + `:root[data-logo-fused]`), sube su rectángulo `--bar-reach`
    píxeles para envolver el logo: barra y logo son una sola pieza de cristal, sin el canto brillante que dejaba una
    raya bajo el logo. El líquido de `LogoBridge` solo se ve mientras se une.
    **Más ligero** (24 nov 2026, Yil: «me gusta como se ve pero pone la interfaz lenta»): con Vidrio líquido el 3D
    ocupa toda la ventana, y el cristal se calculaba en cada punto de la ventana repasando todas las piezas (hasta 40).
    Ahora se dibuja por trozos (`glassDraws` en `lib/liquidShader.ts`): un trozo por pieza, recortado a su caja más
    `GLASS_EDGE` px, y en cada trozo solo cuentan las piezas a menos de `GLASS_REACH` px (lo que alcanza la unión
    suave de las gotas). Se ve igual, punto por punto; en el navegador de pruebas la pasada del cristal pasó de unos
    680 ms a unos 180 ms por fotograma. Además las piezas solo se vuelven a medir mientras algo puede moverlas (la
    ventana cambia, una transición o animación de CSS, desplazar, pulsar o arrastrar, escribir, una gota que se
    desliza; `HOT_MS`) y, por si acaso, uno de cada diez fotogramas (`remeasure`); antes se medían en todos.
    **Sin parpadeos con una ventana encima** (21 nov 2026, aviso de Yil: «cuando una ventana o chat está por encima
    y subes o bajas una lista da flashazos y microcortes donde el modelo 3D se pone en primer plano»). Tres causas:
    (1) el evento de desplazar (`scroll`) no trae ratón y la luz del cristal recibía `NaN`, así que el canto del
    cristal salía negro o blanco un fotograma (ahora `lightDirection` ignora posiciones que no son números y solo
    los eventos de ratón mueven la luz); (2) cada evento de la rueda y cada cambio del chat (las gotas) pedía un
    fotograma entero del 3D saltándose el tope de 30 por segundo (ahora van por `ask`, como mucho a `MAX_FPS`, con
    un último dibujo al final); (3) con una ventana modal abierta (`[aria-modal="true"]`, `scene/sceneCover.ts`) el
    3D seguía dibujándose detrás y el desenfoque de la ventana (`backdrop-filter`) se recalculaba en cada fotograma:
    ahora el lienzo se queda en su último fotograma (`frameloop` «never») y no se mide el rendimiento mientras está
    tapado; al cerrar la ventana vuelve solo. Además, si la tarjeta gráfica pierde el lienzo (`webglcontextlost`),
    se vuelve a crear en vez de quedarse en negro.
    **Brillo al pasar el ratón en las pestañas** (20 nov 2026, arreglado por aviso de Yil): en los grupos con gota
    (`data-gotas`), los hijos se ponen `position: relative` para quedar sobre la gota; la pieza del brillo que se
    desliza (`data-glide-pill`, `lib/touchFeedback.ts`) queda excluida, porque si deja de ser `absolute` se coloca
    tras la última pestaña y el brillo sale a la derecha, vacío.
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

### Color de acento (rueda de color)

Ajustes → General → Apariencia → **Color de acento**: arrastras el punto por la rueda y el color de los botones,
enlaces, selecciones y bordes activos de toda kywai cambia al momento, con cualquier tema (también con el Vidrio
líquido). Al soltar se guarda en ese dispositivo. Debajo: **Luz** (más claro u oscuro), 8 colores rápidos y **El del
tema**, que lo quita y deja el color propio del tema. Con el teclado, las flechas giran la rueda de 10 en 10 grados.

Cómo está hecho: los temas ponen su acento en la variable `--cyan` de `:root` (`styles/tokens.css` y
`styles/themes.css`); `lib/accent.ts` la pone en el estilo de `<html>`, que gana a la del tema, y la guarda en
`aicowork.acento`. Se aplica antes de pintar (`main.tsx`). La rueda es `ui/settings/AccentWheel.tsx`. Idea de un
complemento de Hermes Desktop (Accent Picker) visto en un vídeo; hecho desde cero.

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

- **«Música de fondo»**: la música ambiental de kywai y la que pongas en el panel de Música (YouTube, radios).
- **«Efectos y avisos»**: los sonidos de la interfaz y de las tareas (empieza, termina, falla, clics) y el timbre de
  «Te necesita». Se puede quitar la música y seguir oyendo los avisos.
- **«Voces de los agentes»**: lo que dicen en el chat.

Bajo el botón del altavoz de la barra de arriba están las mismas tres barras, cada una con su botón para silenciarla
(nota, campana y burbuja); el altavoz grande calla o activa a la vez la música y los efectos (las voces van aparte).
Quien venía de «Música y efectos» juntos empieza con los efectos como tenía la música (si estaba silenciada, también).
Se recuerda en cada dispositivo.

En **Órbita** suenan igual (mismos timbres, sintetizados en el móvil): Ajustes → Respuesta al tacto → **«Voces de
los agentes»**, con su propio volumen; no dependen de «Sonidos», cada uno se apaga por su lado.

### Música (YouTube, radios y ytm-rs)

El botón **Música** del espacio digital abre un reproductor con tres pestañas encima del buscador (se recuerda la
última elegida):
- **YouTube:** canciones y artistas de YouTube Music, en su reproductor oficial. Tiene sus anuncios.
- **Radios:** las emisoras de SomaFM (lofi, ambient, jazz, electrónica…), sin anuncios: las mantienen sus oyentes.
  Al elegir la pestaña salen todas; lo que escribas las filtra. En la carátula hay un enlace para apoyarlas.
- **ytm-rs:** YouTube Music sin anuncios y con letras, con la app [ytm-rs](https://github.com/grapedjuice/ytm-rs) que
  kywai lleva por dentro desde la 1.36.0 (ver más abajo). Sustituye desde la 1.33.0 a la pestaña Spotifast (Spotify).

La pestaña **Audius** se quitó en la 1.33.0 (lo pidió Yil). Las canciones de Audius que quedaran en la cola salen
de ella al abrir kywai, y quien la tuviera elegida vuelve a la pestaña YouTube. Órbita deja de enseñarla; un Órbita
antiguo que aún la pida recibe la lista vacía.

**Vídeo flotante:** con un vídeo de YouTube sonando, el botón de imagen en imagen de la cabecera del panel lo saca a
una ventanita propia para verlo mientras trabajas en otra cosa. Sigue en el segundo en que iba y con el reproductor
oficial de YouTube (no se descarga nada).
- **App de escritorio y cliente** (también conectado a kywai cloud): ventana sin marco, **siempre encima** de las demás
  apps (también a pantalla completa) y en todos los escritorios. Se mueve arrastrando su barra de arriba y cambia de
  tamaño por los bordes, siempre en 16:9. El vídeo llega directo de YouTube a tu equipo, sin pasar por el servidor.
- **Web en Chrome o Edge:** usa la «imagen en imagen» del navegador, que también queda siempre encima.
- **Web en Safari o Firefox:** no tienen esa ventana; se abre una ventana emergente pequeña normal (hay que permitir
  las ventanas emergentes de la página).
- Su barra tiene pausa, siguiente y «Volver a kywai». Cerrarla (o pulsar Esc en ella) devuelve el vídeo al panel,
  donde mientras tanto sale «Traer aquí». La barra, el minirreproductor y la cola siguen mandando como siempre.
- Solo flotan los vídeos de YouTube: al pasar a una radio, o al cerrar la música, vuelve al panel.
- Recuerda su sitio y tamaño en cada equipo.
  Código: `src/renderer/src/lib/floatingVideo.ts` (la ventana), `src/main/floatingVideo.ts` (su forma en la app) y
  `src/shared/floatingVideo.ts`.

**Mi YouTube (tus suscripciones, listas y «Me gusta»):** en la pestaña YouTube, «Conectar mi cuenta» te da un
código. Abres google.com/device **en cualquier navegador** (el del ordenador o el móvil), inicias sesión allí con tu
cuenta, escribes el código y das permiso de solo lectura. kywai se conecta solo en unos segundos. Dentro de la app no
se puede iniciar sesión en Google: Google bloquea las ventanas metidas en apps («This browser or app may not be
secure») y saltarse ese bloqueo va contra sus normas, por eso se hace así.
- Luego salen tres pestañas: **Suscripciones** (lo último de tus canales, lo más nuevo primero), **Me gusta** y **Mis
  listas** (al abrir una, sus vídeos). Un clic lo pone en el reproductor del panel con el resto en la cola, «+» lo
  añade a la cola y «Poner todo» lo pone entero. Se puede sacar a la ventana flotante como cualquier vídeo.
- **Lo que no puede salir:** la página de Inicio con recomendaciones, «Ver más tarde» y el historial. Google no se
  los da a ninguna app. Conectar así **no quita anuncios**: eso solo lo hace la sesión de YouTube Premium en un
  navegador.
- Funciona igual en la app, el cliente, la web y **kywai cloud**: la conexión vive donde corre kywai (en la nube, en
  tu espacio). Solo se guarda la llave de renovación, cifrada como las claves de los agentes, en `mi-youtube.json`
  de la carpeta de datos. «Desconectar» la revoca en Google y la borra. También puedes quitarle el permiso desde
  myaccount.google.com → Seguridad → Apps de terceros.
- Suscripciones mira tus 30 canales más relevantes (4 vídeos de cada uno) y se guarda 20 minutos. Las consultas
  gastan el cupo diario de la app de kywai en Google; si se acaba, lo dice y se puede probar al día siguiente.
- **Para el mantenimiento:** hace falta la app de kywai en Google Cloud, con la API de datos de YouTube activada y un
  cliente OAuth de tipo «TV y dispositivos de entrada limitada». Su id y su secreto van en `BUILT_IN` de
  `src/main/myYoutube.ts` (en apps instaladas Google no los considera secretos) o en las variables
  `KYWAI_YOUTUBE_CLIENT_ID` y `KYWAI_YOUTUBE_CLIENT_SECRET`. Sin ellos la pestaña dice que aún no está lista.
  Mientras Google no revise la app (el permiso youtube.readonly es «sensible»), solo pueden entrar las cuentas
  añadidas como usuarios de prueba (hasta 100).
  Código: `src/main/myYoutube.ts`, `src/shared/myYoutube.ts` y `ui/space/MyYoutubeBox.tsx`.

**YouTube Premium sin anuncios en el navegador:** en la web, «Usar mi cuenta» hace que el reproductor cargue desde
youtube.com (en vez de youtube-nocookie) con la sesión de YouTube que ya tenga ese navegador («Entrar en YouTube» abre
la página para iniciarla); con Premium no hay anuncios. «Dejar de usarla» vuelve a youtube-nocookie. Iniciar sesión
**no quita el bloqueo de discográficas** (error 150). En la app de escritorio y el cliente ya no hay botón para iniciar
sesión en Google; si quedó una sesión de antes, sale «Cerrar sesión» para borrarla.
  Código: `src/main/youtubeAccount.ts`, `lib/youtubeAccount.ts` y `ui/space/YoutubeAccountRow.tsx`.

**ytm-rs** es una app de escritorio gratis y de código abierto (licencia GPL-3.0, de grapedjuice) para escuchar
YouTube Music en Windows, Mac y Linux. **Desde la 1.36.0 kywai la lleva por dentro**: nadie tiene que instalarla ni
abrir su ventana (lo pidió Yil: «qué sentido tiene si tengo que instalar y abrir su app»).
- **Su copia:** kywai usa una versión fija (`YTMRS_TAG`, hoy `v0.4.0-kywai.1`) compilada en el fork público
  [Yiku21/ytm-rs](https://github.com/Yiku21/ytm-rs). El fork añade a su mando las órdenes que necesita kywai (poner una
  canción, la cola, la posición, la letra, abrir su ventana y cerrarse) y un modo «por dentro» (`YTM_EMBEDDED`: arranca
  sin ventana, la × la esconde y no se actualiza sola). Su código está en esa etiqueta del fork, como pide la GPL, y la
  pestaña enlaza a él.
- **Primera vez:** la pestaña explica qué es y ofrece **«Activar ytm-rs»**: kywai descarga el paquete portable de su
  sistema de la Release del fork (unos 20 MB), comprueba su huella SHA256 (`YTMRS_ASSETS`; si no coincide no se usa) y
  lo deja en la carpeta de datos de kywai (`ytm-rs/<versión>/`). Mientras, dice cuánto lleva. Sus datos (sesión,
  biblioteca, ajustes) van aparte, en `ytm-rs/datos`, y se conservan al cambiar de versión.
- **Encendida:** kywai la abre escondida con su mando en `127.0.0.1:26541` (no el 26540 de ytm-rs, para no chocar con
  un ytm-rs que la persona tenga por su cuenta) y sin las claves del entorno de kywai. Al volver a abrir la pestaña se
  enciende sola. Al cerrar kywai le pide que se cierre (guarda lo que sonaba).
- **La pestaña es el reproductor:** buscador de YouTube Music («Poner» y «+» a la cola), carátula, canción, artista,
  álbum, posición (se puede mover), aleatorio, atrás / pausa / adelante, repetir (lista o canción), me gusta, volumen y
  la letra. Se lee cada segundo mientras la pestaña está abierta y la posición avanza sola entre lectura y lectura.
- **«Abrir su ventana»** enseña la ventana de ytm-rs: para entrar con tu cuenta de YouTube, ver tu biblioteca o sus
  ajustes. Cerrarla la vuelve a esconder; la música sigue.
- **Letra (karaoke, desde la 1.35.0):** debajo sale la letra como en la app de ytm-rs: grande, con la línea que suena
  en el centro y cada palabra iluminándose al cantarla; las demás, atenuadas y fundidas arriba y abajo. Si la fuente da
  el tiempo de cada palabra se usa ese; si solo da el de cada línea (lo normal en LRCLib), kywai reparte la línea a lo
  largo de su tiempo según lo larga que es cada palabra. Sin versión con tiempos, sale tal cual.
  - **De dónde sale:** si el mando de ytm-rs sabe la orden `lyrics`, la misma letra que enseña ytm-rs (palabra a palabra
    cuando la tiene, con su traducción). Si no, de [LRCLib](https://lrclib.net), una base de letras abierta y gratis: solo
    se le manda el título, el artista, el álbum y la duración. Al pie dice de dónde viene.
  - **Traducción:** debajo de cada línea, al idioma de kywai. Se pide primero al traductor de Unison (betterlyrics.org) y,
    si no contesta, al traductor público de Google, los mismos que usa ytm-rs; solo se manda el texto de la letra, y los
    estribillos una vez. En la app de escritorio y en el cliente se pide desde tu ordenador (`client:lyrics`), porque
    Google frena a los servidores; en kywai cloud desde el navegador puede no salir. Si ya está en tu idioma no se
    traduce. «Sin traducción» la quita y «Traducir» la vuelve a poner (se recuerda en ese equipo).
  - **Saltar:** tocar una línea salta a ese momento.
  - «Ocultar» la pliega. La letra y su traducción se guardan en memoria un rato.
  - Código: `ui/space/KaraokeLyrics.tsx` (la vista), `@shared/lyrics` (`timedWords`, `wordProgress`,
    `fromYtmrsLyrics`), `src/main/lyrics.ts` y `src/main/lyricsTranslate.ts`.
- **Dónde suena:** en la app de escritorio, en ese ordenador. En el **cliente** de escritorio (conectado a tu servidor o
  a **kywai cloud**), en el ordenador donde estás (`client:ytmrs`), no en el servidor. En el servidor de kywai cloud no
  hay copia (`KYWAI_CLOUD`) y la pestaña dice que se abra desde la app de escritorio. Sistemas con versión: Windows (x64
  y ARM), Mac (Apple y Intel) y Linux x64. Si el cliente de escritorio es anterior a la 1.36.0 (su estado no trae
  `supported`), la pestaña pide actualizarlo en vez de enseñar un «Activar ytm-rs» que no haría nada (desde la 1.38.1).
- **No se mezcla con lo demás:** al poner algo en ytm-rs se pausa lo que sonara en kywai. Las luces del espacio no oyen
  el sonido de ytm-rs (sale de otro programa).
- **Nueva versión de ytm-rs:** en el fork, rama de kywai, Actions › Release › «Run workflow» con `kywai_tag`
  (`v<versión>-kywai.<n>`): compila y publica los portables como prerelease con esa etiqueta. Luego se cambian
  `YTMRS_TAG` y las huellas de `YTMRS_ASSETS` en kywai.

ytm-rs es un cliente no oficial de YouTube Music: usa la API interna de su web y suena sin anuncios aunque no haya
Premium, cosas que las condiciones de YouTube no permiten. Llevarla dentro fue decisión de Yil, avisado de ello. kywai
solo le manda órdenes fijas (sin texto del usuario). Si YouTube cambia algo, ytm-rs puede dejar de sonar hasta que se
publique una versión nueva. Código: `src/main/ytmrs.ts` (descargar, abrir y hablar con su mando), `@shared/ytmrs`
(acciones, órdenes y lectura de lo que suena), `src/main/lyrics.ts` y `@shared/lyrics` (letras), y
`ui/space/YtmrsBox.tsx` (la pestaña). Órbita todavía no tiene esta pestaña.

Las radios suenan en el reproductor de audio de kywai, directamente desde los servidores públicos de SomaFM
(somafm.com). En el sitio del vídeo se ve el logo de la radio. Una radio no tiene duración
ni se puede saltar dentro de ella, y no se le busca el BPM (cambia de canción sola).

Lo que hace el reproductor en cualquier fuente:
- **Buscar:** en la fuente elegida. Un enlace de YouTube pegado suena siempre.
- **Controles:** atrás, pausa, adelante, barra de posición y volumen.
- **Cola:** al elegir un resultado, los demás quedan en la cola y suenan después. El «+» añade una canción al final.
- **Luces al ritmo:** el espacio sigue el BPM de la canción, sin micrófono. Sus ajustes están plegados.

YouTube suena en su reproductor oficial, que tiene que estar a la vista. Va aislado en su propio marco, sin ningún
script de YouTube en la ventana de kywai. No se descarga ni se saca el audio de YouTube ni de ningún otro
servicio: por eso no se le pueden quitar los anuncios (para eso están las radios y ytm-rs).

**Minimizar:** con una canción sonando, el botón «Música» (o Esc, o el icono de minimizar) lo deja pequeño en una
esquina: el vídeo, la canción y atrás / pausa / adelante. Sigue sonando. «Música» otra vez lo abre entero, y la ×
lo cierra y lo pausa. El icono de reducir de esa tarjeta lo deja en una barra con solo atrás / pausa / adelante y el
vídeo en pequeño como carátula (al pasar el ratón por encima se ve la canción); el icono de ampliar de la barra
vuelve a la tarjeta. Se recuerda cómo se dejó la última vez.

**Minimizar ytm-rs (desde la 1.40.0):** en la pestaña ytm-rs, el icono de minimizar (junto a la ×, o Esc) deja la
música en una barra abajo a la izquierda del espacio con la carátula (la canción al pasar el ratón), atrás / pausa /
adelante, me gusta (el corazón se rellena; otro clic lo quita) y el volumen de ytm-rs (altavoz con su deslizador, que
se manda al soltar; un clic en el altavoz lo silencia y lo devuelve a como estaba). Ampliar vuelve a la pestaña y la ×
cierra y pausa ytm-rs. Al minimizar se pausa lo que sonara en el reproductor de kywai, para no oír dos cosas. Código:
`YtmrsBar` y `PopVolume` en `ui/space/MusicPanel.tsx`.

**Volumen en el reproductor pequeño:** la tarjeta y la barra llevan un altavoz junto a los botones. Al pasar el ratón
por encima sale el deslizador con el porcentaje; un clic en el altavoz silencia o vuelve a dar sonido (en el móvil, el
primer toque enseña el deslizador y el segundo silencia). Mover el deslizador con el sonido quitado lo activa otra vez.
Es el mismo volumen de «música y efectos» de la cabecera y de Ajustes → General, así que vale igual para YouTube
y las radios.

**Luces con el sonido real (sin micrófono):** en la app de escritorio, kywai escucha lo que suena en su propia
ventana y detecta los golpes:
- **El pulso:** la luz entera cae en cada golpe del pulso de la canción, y las notas de bajo de en medio dan un
  destello.
- **Siempre a tiempo:** también con intros, directos y cambios de ritmo.
- **Nada guardado:** no se graba nada.

Con **las radios** no hace falta nada de eso: su audio llega directamente a kywai y las luces lo
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

Si una radio no llega (sin conexión, o el servidor no responde), pasa a la siguiente de la
cola y ofrece abrirla en su web. Desde el navegador, SomaFM puede rechazar sus radios según la dirección desde la
que se abre kywai (en una prueba desde «localhost» las rechazó); en la app de escritorio suenan.

### Personajes de los agentes

Hermes, Claude, Codex, Gemini, Qwen, Muse, Aider, Copilot y Kilo tienen su personaje: un dibujo (el avatar del chat,
los paneles, Órbita y el selector de /video) y un modelo 3D animado en el espacio. Los modelos se hicieron con Meshy a
partir de los dibujos y comparten el mismo esqueleto, así que las animaciones sirven para todos: reposo, piensa (mira
alrededor), explica y habla (al trabajar, se van alternando), celebra (tarea terminada), duda (error o pregunta),
saluda (cuando le hablas) y camina (cuando se mueve a otra estación). Se reconocen por el nombre o el id del agente;
los demás agentes y los becarios siguen siendo robots.

**Todos los peluches miden lo mismo en el 3D (24 nov 2026, v1.28.1; Yil: «¿por qué hay agentes más pequeños que otros?»).** El peluche de cada agente va de pie sobre el robot de siempre, que sigue escondido debajo para los indicadores y el nombre. Antes el peluche se escalaba con la altura de ese robot, que cambia según su cuerpo y su adorno (antena, orejas, pelo…), y unos salían hasta un 40 % más pequeños que otros. Ahora todos usan la misma altura de referencia (`PLUSH_SPAN` en `src/renderer/src/scene/Robot.tsx`); los de más atrás solo se ven algo menores por la perspectiva.

**El peluche, único aspecto de kywai (24 nov 2026, v1.26.4; pedido por Yil: «que sea el nuevo estilo de kywai, todo
usará esos agentes, quita los otros y elimina la opción de personalizar»).** Desde esta versión todos los agentes son
su peluche en todas partes (chat, fichas, listas, espacio 2D, espacio 3D y vídeos) y lo que se cuenta abajo sobre
elegir aspecto queda como historia:

- **Ya no hay selector de aspecto.** Ajustes → Agentes ya no tiene «Aspecto de los agentes» ni «Tamaño del píxel»; la
  sección se llama **Avisos en el 3D** (el coordinador te avisa en el 3D y el silencio de noche). `SKINS` es solo
  `['peluche']` y lo guardado antes en `aicowork.agentes.skin` (formas, clásico, píxel, refugio, personajes) se lee como
  peluche (`parseSkin`).
- **Ya no se personaliza.** La ficha del agente ya no tiene «Crea tu agente» ni «Forma animada»
  (`AgentLookDialog` y `AgentFigureDialog` quitados). Los aspectos hechos antes con «Crea tu agente» se quedan guardados
  pero no se enseñan (`LOOKS_SHOWN = false` en `lib/agentLook.ts`).
- **Lo único que se elige es el acabado.** En su ficha, **«Acabado de su peluche»** abre `PlushFinishDialog`: los 19
  acabados de siempre (liso, gominola, lunares, rayas, corazones, burbujas, purpurina, estrellitas, confeti, espiral,
  desenfoque, degradado, holográfico, perla, galaxia, neón, metalizado, cristal, terciopelo) con vista previa y
  «Sorpréndeme». Se guarda en `AgentFigure.texture` como antes. El acabado va en el pelo del peluche y el visor queda
  limpio encima, para que la cara se vea: en `PlushAvatar` con `figureTextureBoxFilter` (el filtro SVG de los acabados a
  la escala de la caja) y en el 3D (`scene/plushCard.ts`) pintado una vez en el lienzo. La cotorra coordinadora va
  siempre sin acabado.
- **Vídeos.** Los «robots de kywai» de `/video` y `/demo` son sus peluches: `assets/robots/forma-*.png` (mismo nombre
  de siempre) son ahora Hermes, Claude y Codex de peluche con los ojos encendidos, y `ROBOTS_LOOK` los describe así
  para las imágenes con IA. La carpeta de personajes del usuario se actualiza sola (se vuelve a copiar si la imagen
  cambia).

Ajustes → Agentes → «Aspecto de los agentes» elige la skin de todos los agentes: el botón de la derecha (con el nombre de la skin actual) despliega tarjetas como las del selector de
tema (foto de tres agentes y nombre): **Formas animadas** (por defecto desde el 23 nov 2026; cada agente con su forma y su
color, ver «Formas animadas»), **Peluche** (desde la 1.19.0, un robot de fieltro distinto para cada agente, ver «Aspecto «Peluche»»), **Clásico** (los robots de siempre, que gastan menos), **Píxel** (los personajes como sprites de pixel art), **Refugio Kywai** (los robots de cerámica con ropa de tela de ese tema) o, la última, **Personajes** (los personajes 3D de Meshy). Se guarda en el dispositivo
(`aicowork.agentes.skin`) y no cambia con el tema: antes el Refugio Kywai ponía sus robots y los demás temas los
clásicos. El icono del agente en el chat y en los paneles cambia con la skin (`lib/RobotAvatar.tsx`: dibujos en
`assets/robots/` para Personajes, `assets/robots/clasico/` y `assets/robots/refugio/`). Mientras carga el modelo se ve
el robot clásico, y los agentes sin personaje también. Con personaje, los disfraces de Navidad y Halloween no se ponen.

**Aspecto «Peluche» (24 nov 2026, v1.19.0).** Robots de fieltro, uno distinto para cada agente, va el segundo del
selector (`'peluche'` en `SKINS`, `usesPlush` en `scene/characters.ts`). Hay 22 dibujos propios (Claude, Codex, Gemini,
Hermes/cotorra, Qwen, Muse, becario, modelo local, DeepSeek, Kimi, Grok, Copilot, Cursor, OpenHands, Antigravity, Aider,
Kilo, Goose, Amp, Mistral, OpenClaw, NVIDIA) y cuatro peluches blancos de base que, para cualquier otro agente, se tiñen con su
color (elegido por su nombre, siempre el mismo). Los dibujos se generaron con Meshy (texto a imagen) y se recortaron;
están en `assets/peluche/` en 384 px y @128, sin ojos: el visor negro queda vacío. Su geometría (dónde está el visor y
dónde empieza el adorno de arriba) va en `PLUSH` de `lib/plush.ts`, y `plushFor(agente)` elige el peluche: primero el
proveedor concreto por el nombre (así «Claude Code + DeepSeek» es DeepSeek), luego el logo o el proveedor, y si no, una
base teñida; los becarios llevan el del becario.
En el chat, las fichas, las listas y el 2D lo pinta `lib/PlushAvatar.tsx`: dos capas del mismo dibujo (el adorno de
arriba se balancea aparte) y los ojos en SVG con brillo encima, dentro del visor. Un único escuchador del puntero para
toda la ventana pone `--plush-lx/--plush-ly` en las caras cercanas, así que miran al ratón cuando está cerca; parpadean y
cambian de cara con lo que hace el agente (`plushMood`: trabaja, piensa con «…», te necesita con «!», celebra con
chispas, error, cansado y duerme con «zzz»). En fichas y 2D se pueden tocar: un toque lo alegra y tres seguidos sacan
corazones. En listas largas va quieto (`calm`) y con «Reducir movimiento» no se anima. En el 3D, `scene/plushCard.ts`
dibuja el mismo peluche en un lienzo de 256 px sobre un cartel que mira a la cámara (como las Formas): respira, salta al
celebrar, tiembla con un error, cabecea dormido, mira a su alrededor y parpadea; se redibuja a 30 fotogramas por segundo
(15 con «Reducir movimiento»). La cotorra coordinadora es el peluche de Hermes en todas partes. Los agentes con su propio
modelo 3D o aspecto lo conservan.
La técnica (dibujo pintado en capas, ojos SVG que siguen al ratón y reacciones al tocar) se inspira en AnyModelBot
(licencia MIT); los dibujos son nuestros, no los suyos.

**«Personajes» solo en Ajustes (Yil, 23 nov 2026, v1.6.7).** kywai ya no usa el estilo «Personajes» para enseñarse: se
puede seguir eligiendo (va el último del selector, `SKINS` en `scene/characters.ts`) y quien ya lo tenía lo conserva,
pero no sale en ningún otro sitio. Lo que se ve por defecto es «Formas animadas» o, donde hace falta un dibujo
fijo, los robots «Clásico». La copia de las imágenes de los «Robots de kywai» de «/video» en
`<workspace>/personajes/robots-kywai/` se rehace sola si la imagen de la app cambió (por tamaño). Las capturas de la
web (kywai.app) y del README del escaparate ya usan Formas animadas o Clásico. Para nuevas capturas, vídeos o guías,
no elijas «Personajes».
Con «Formas animadas», la cara del coordinador en la ficha, el chat y las listas (`CoordinatorBird` en
`ui/common/AgentBits.tsx`) es la cotorra forma de `cotorraCharacter()`, la misma del 3D; con los demás aspectos sigue
la pegatina de la cotorra con el estilo de mascota elegido. Desde la 1.15.9 también la pegatina de los mensajes del
coordinador (`MascotSticker`, que usan el chat, «kywai prepara el plan», el chat vacío y el resumen del día) es esa
cotorra forma con «Formas animadas»: cada emoción pasa a un estado del motor (piensa → pensando, coordina y revisa →
working, pulgar → humming, te-necesita → notifying, celebra y entrega → celebrate, duerme → sleeping, lo-siento →
drowsy, el resto → idle) y se queda quieta a los 8 s de cada cambio para no gastar con muchos mensajes. Antes el chat
seguía con la cotorra dibujada aunque el 3D, el 2D y la ficha ya enseñaran la forma.
Desde la 1.17.7 las tres (`CoordinatorBird`, `MascotSticker` y la cotorra del espacio 2D en `space2d/Space2D.tsx`)
llevan el mismo volumen que el 3D: la clase `FIGURE_CLASS` (ojos) y el filtro `figureVolumeFilter(size)` de
`lib/figureVolume.ts`, como `AgentFigure`. Sin él, la cotorra del chat era la forma de colores planos y a Yil le
parecía fea. (Se probó también poner en el 3D la cotorra con volumen de Meshy del estilo «Escenario», pero Yil prefirió
la forma: «el otro parece un globo, es una pelota». El trabajo está guardado en la carpeta del proyecto,
`parches/cotorra-3d/cotorra-3d-volumen-completo.patch`, por si sirve para /video.)

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

### Cargas de puntos

Lo que está en marcha se dibuja con una rejilla pequeña de puntos que se encienden en orden (idea tomada de las «dot
matrix loaders»; el código es propio, `ui/common/DotMatrix.tsx` y `lib/dotMatrix.ts`). Toman el color del tema y del
agente, y con «Reducir efectos» o «reducir movimiento» del sistema se quedan quietas.

- **Chat**: mientras un agente escribe o trabaja, en lugar de los tres puntitos sale **su propio dibujo** (Hermes y quien
  coordina, en espiral; los demás, barrido, lluvia, serpiente u ondas, siempre el mismo para cada agente) con su color.
  También en «<coordinador> prepara el plan».
- **Barra lateral**: espiral azul = trabajando, ✓ verde = terminado sin ver, ondas ámbar = te necesita (en la barra
  plegada, en la esquina del icono de cada proyecto y del chat actual).
- **Hablar con kywai**: junto al estado escrito, respira cuando está lista, hace de ecualizador mientras te oye, gira en
  espiral al pensar y lanza ondas al hablar.
- **Espacio 3D**: mientras carga, la palabra **kywai** en puntos con un brillo que la recorre.
- **Vista previa**: «Preparando la vista previa…» con un barrido de puntos.

### La cotorra de kywai en el chat

La mascota de kywai es una cotorra verde (cara crema, pico salmón y puntas de las alas en azul kywai). En el chat es la
cara del coordinador: sus mensajes, y cualquier mensaje con un plan, llevan una pegatina de la cotorra (56 px) en vez del
robot, y la pegatina cambia según en qué va el trabajo (`mascotMoodFor` en `lib/mascot.ts`):

**Nombre y cara del coordinador en todas partes (22 nov).** El agente que coordina (el primero de `plannerOrder`) se
llama «kywai / <agente>» (p. ej. «kywai / Hermes») y lleva la cotorra de kywai, no su avatar, en el chat, su ficha del
espacio, las píldoras de las listas (tareas, resultados, archivos, cuotas), la etiqueta del 3D y la percha del 2D. Si otro
agente pasa a coordinar con «Hacer coordinador», el cambio es inmediato con su nombre. Se hace en un solo sitio:
`lookupAgent` (`ui/common/agents.ts`) marca `coordinator` y pone `coordinatorName()`; `AgentAvatar` y `AgentPill`
(`AgentBits.tsx`) pintan entonces `CoordinatorBird` (la cotorra en reposo con el estilo elegido). El nombre guardado del
agente no cambia (sigue siendo «Hermes» en Ajustes y en las menciones), y los becarios nunca llevan la cotorra.
Siempre hay coordinador: si `plannerOrder` llega vacío (los agentes dados de alta desde el catálogo de la nube no
entraban en la lista), `mergeConfig` lo rellena con los agentes del equipo en su orden, y el alta del catálogo ya lo
añade a la lista.

| Pegatina | Cuándo sale |
|---|---|
| Saluda | Primera respuesta de la conversación |
| Piensa | Está preparando el plan (también en la fila «prepara el plan») |
| Pulgar | El plan propuesto espera tu visto bueno |
| Coordina | Las tareas del plan están en marcha (picotea su mijo) |
| Revisa | Todas las tareas en marcha están en revisión o pruebas |
| Duerme | Las tareas siguen en cola o detenidas, ninguna trabaja |
| Entrega | El plan terminó con todas sus tareas hechas |
| Celebra | El resumen final, la última respuesta del coordinador tras un plan terminado |
| Te necesita | Pregunta o permiso sin contestar, una tarea que te necesita, un error o tareas fallidas |
| Lo siento | La respuesta es una mala noticia o una disculpa («No, todavía no…», «no pude», «falló», «lo siento») y tocaba saluda, reposo, entrega o celebra: suspira en vez de celebrar |
| Reposo | Las demás respuestas |
| Asoma | El chat vacío: la cotorra asoma por detrás del logo de kywai (también para Órbita) |

**La cara va con lo que dice.** Antes de elegir la pegatina se mira el tono del texto (`replyTone` en
`lib/replyTone.ts`, sin modelo ni red): busca al principio de la respuesta (500 caracteres) frases de mala noticia o
disculpa y de buena noticia en español, inglés, portugués, francés, hindi y chino. Un «No, …» al empezar pesa doble y lo
negado («no terminé») no cuenta como bueno. Si pesan más las malas, la respuesta es negativa y la cotorra pone «Lo
siento» en vez de una cara alegre; lo que pide algo («Te necesita») o sigue trabajando no cambia. La cara «Lo siento» es
el suspiro de las láminas de estilos (en la Pegatina, el de Facetas).

Al cambiar de pegatina da un saltito (sin él con efectos reducidos o «reducir movimiento»). La pegatina de los
auriculares («Escucha») está en `assets/mascota/` para la voz y Órbita, aún sin usar. Las imágenes son las pegatinas que
generó Codex a partir de las fotos de una cotorra real (WebP de 320 px en `assets/mascota/`); el modelo 3D de Meshy y el
paquete de marca están en la carpeta del proyecto «mascota-kywai».

**Estilo de la cotorra.** En ⚙ → Ajustes → General → Apariencia → «Estilo de la cotorra» cada persona elige cómo se ve la
cotorra en el chat y en el espacio 2D (se recuerda en ese dispositivo). Hay 14: Pegatina (la de siempre, predeterminada),
Facetas, Juguete, 3D suave, Plastilina, Fieltro, Papel, Acuarela, Anime, Cómic, Píxel, Vidriera, Grabado y Gominola. Cada
estilo trae las 13 emociones en `assets/mascota/estilos/<estilo>/<emoción>.webp` (288 px, fondo transparente, pies abajo).
Salen de las láminas que pasó Yil el 20 nov, recortadas y sin fondo; como las láminas no traen «revisa», «entrega» ni
«asoma», revisa usa la del portátil, entrega la del guiño (en Facetas, la de contento) y asoma la del saludo. Para añadir
un estilo: su carpeta con las 13 emociones y su id y nombre en `lib/mascotStyle.ts` (la prueba comprueba que no falte
ninguna). Si a un estilo le falta una emoción, sale la de la pegatina.

### La cotorra que te mira

Ahora no sale en el chat vacío: Yil prefirió la pegatina «Asoma» (la cotorra detrás del logo de kywai), que volvió ahí
el 18 nov. El componente sigue en la app por si se usa en otro sitio. Cuando se usa, la cotorra **gira la cabeza hacia donde está el ratón** (nueve direcciones; cerca de ella mira al
frente) y **reacciona si la tocas**: parpadea y pone una cara (corazón, chispas o contenta, por turnos); si la tocas
cuatro veces seguidas, se marea. Es un botón (`ui/common/WatchingMascot.tsx`, lógica en `lib/watchMascot.ts`), así que
también se toca con el teclado. Sin ratón (pantallas táctiles) se queda mirando al frente, y con «Efectos reducidos» o
«reducir movimiento» no hace el bote.

Cada personaje son dos hojas de 3×3 (`assets/mascota/mira/direcciones.webp` y `reacciones.webp`, 1152 px): nueve
direcciones de la cabeza y nueve caras (parpadeo, corazón, chispas, sorpresa, guiño, vergüenza, sueño, mareo y
contenta). Las de la cotorra se renderizaron desde su modelo 3D con Blender (el giro es el hueso de la cabeza y las caras
son los párpados, más corazones, chispas y espirales dibujados encima), así que es idéntica a la del espacio 3D. La
idea y el formato vienen de page-mascot (github.com/nilbuild/page-mascot, licencia MIT de Kamran Ahmed; el aviso de
licencia va en la cabecera del componente).

### Crea tu agente: su propio aspecto

Cualquier agente, también los que no tienen personaje y los que se añadan más adelante, puede tener su propio aspecto
en el estilo «líquido» de kywai: gominola translúcida con brillo por dentro, borde irisado y ojos grandes. Se abre
pulsando el agente en el espacio → **Crea tu agente: dale su propio aspecto** (o **Cambiar su aspecto** si ya tiene).

- Eliges las piezas de la plantilla: **forma** (20), **color** (24), **ojos** (8), **boca** (7), **dibujo** (8) y
  **complemento** (16), y si quieres «Algo más» con tus palabras. Más de 3 millones de combinaciones. Cada agente
  empieza con una combinación sacada de su nombre; **Sorpréndeme** da una al azar y **Plantilla** vuelve a la suya.
- **Crear con Meshy**: Meshy (de pago) lo dibuja con la imagen de estilo de kywai de referencia y después hace sus
  8 expresiones a partir de ese mismo dibujo, para que sea siempre el mismo personaje: reposo, trabaja, piensa, te
  necesita, celebra, error, cansado y duerme. Tarda alrededor de un minuto.
- Sale en el chat, los paneles y el espacio 2D (con la expresión de lo que está haciendo) por delante de cualquier
  skin. **Pasar a 3D** hace también su modelo 3D (unos minutos) y sustituye al robot en el espacio 3D; respira,
  bota al trabajar, se ladea al pensar y se hunde al dormir. **Volver al de siempre** quita el diseño, pero no lo pierde: debajo de la imagen salen **Tus diseños anteriores** (los 8 últimos) y pulsando uno vuelves a él sin gastar nada.

  **De la comunidad** (solo kywai Cloud): debajo salen los diseños que ha compartido la gente. Pulsas uno y tu agente
  lo usa al momento, con sus 8 expresiones, sin gastar Meshy. En la self host esa sección solo dice que la galería es de
  kywai Cloud, con un enlace: allí cada uno crea los suyos con su clave de Meshy (decisión de Yil, 19 nov 2026). El
  portal lo hace cumplir: la lista (`GET /api/aspecto/comunidad`) pide el secreto del espacio y cada imagen una firma
  `?f=` que da la lista y caduca a las 24 h (`portal/comunidad.py`; en la app `communityLooks` y `communityImage`).
  **Compartir con la comunidad** manda tu diseño a revisión:
  solo sale en la galería cuando la administración lo aprueba (Mi cuenta → Administrar cuentas → Diseños de la
  comunidad). Las expresiones no se eligen: el agente cambia solo según lo que hace, y el editor las va pasando para
  que veas cómo queda.
- Quién paga Meshy: en **kywai Cloud** lo paga kywai, por el portal de Mi cuenta. Van incluidos **1 agente con
  kywai Cloud, 5 con Pro y 10 con Pro Max**: de cada uno, su aspecto, **1 reintento** y **1 modelo 3D**; las 8
  expresiones van incluidas. Pasado lo gratis se
  paga con **créditos kywai**: **150 por aspecto** y **100 por modelo 3D** (si Meshy falla, se devuelven). El editor
  dice lo que queda gratis, el precio y los créditos que te quedan. Sin créditos suficientes se puede recargar en Mi
  cuenta → Créditos kywai o pegar una **clave propia de Meshy** (meshy.ai/settings/api), que no tiene límite y no pasa por kywai. En
  la instalación propia (self host) no hay nada incluido ni gratis: hace falta esa clave propia. Se guarda cifrada como las de los agentes.
- Coste de Meshy: 6 créditos por imagen (48 por aspecto) y unos 30 por modelo 3D.
- Tamaño de lo que se manda (arreglado el 20 nov 2026): el portal de Mi cuenta acepta como mucho 256 KB por petición,
  salvo en «Crea tu agente», donde **Pasar a 3D** manda la imagen de reposo (unos 6 MB como mucho) y **Compartir con la
  comunidad** manda las 8 caras (`request.max_content_length` en `portal/aspecto.py` y `portal/comunidad.py`). Si aun
  así algo es demasiado grande, el portal corta la petición **antes de gastar** el cupo o los créditos, y la app dice
  «La imagen es demasiado grande para enviarla. No se ha gastado nada.». Una página de error (HTML) del portal o de
  Meshy nunca se enseña tal cual: sale un mensaje claro en el idioma de la app.

### Formas animadas

Otra forma de dar aspecto a cualquier agente, gratis y al instante: una **forma** (gota, bola, cápsula, cubo, osito,
flecha, nube, gato, conejo, flor, diamante o antena) con su **color**. Las caras y los movimientos están hechos una sola
vez y son los mismos para todos: parpadea y mira en reposo, se pone a trabajar, piensa (se vuelve tres puntitos que
giran), espera, te llama cuando te necesita, celebra al terminar, se marea con un error y se duerme. Como no hay que
dibujar nada por agente, vale para los que se añadan en el futuro.

- **Activarlo**: es el aspecto por defecto (`DEFAULT_SKIN` en `scene/characters.ts`): lo tiene todo el que no haya elegido
  otro a mano, en el escritorio y en la nube; quien ya eligió otro lo conserva. Para volver a él: Ajustes → Agentes →
  «Aspecto de los agentes» → **Formas animadas**. Se ven igual en el chat, las
  fichas, las listas, el espacio 2D y el **espacio 3D**: en el 3D cada agente es su forma, de pie en su puesto y mirando
  siempre a la cámara, con las mismas caras y movimientos que en su ficha (también los becarios). La **cotorra
  coordinadora** (kywai / Hermes) también es una forma en el 3D (desde el 23 nov 2026, v1.5.3): bola verde
  con cresta de tres plumas, pico naranja y dos alas verde claro, tan sencilla como las demás formas y con los mismos
  movimientos que el resto; sus colores son siempre los de la cotorra. Con los demás aspectos la cotorra sigue siendo su personaje 3D de
  siempre. Solo los agentes con modelo 3D propio de «Crea tu agente» siguen siendo personajes 3D. Órbita sigue con sus
  dibujos. La cotorra de formas está en `cotorraCharacter()` de `src/renderer/src/lib/figures.ts`. En el **espacio 2D**
  la cotorra también es esa forma (desde el 23 nov 2026, v1.6.3), en todas las escenas (Flujo, Mesa, Aldea, Tren y Tema).
- **Elegir la de cada agente**: pulsa el agente en el espacio → **Forma animada: elige su forma y su color**. Vista
  previa con las poses (pasan solas hasta que tocas una), **39 formas en 4 grupos** (desde el 23 nov 2026, v1.9.0; antes 12):
  **Geométricas** (gota, bola, cápsula, cubo, diamante, flecha, huevo, cilindro, trapecio, pirámide, estrella, corazón,
  cristal, engranaje, burbujas), **Animales** (osito, gato, conejo, rana, búho, pulpo, medusa, cangrejo, ballena,
  murciélago, bicho, araña, erizo), **Criaturas** (fantasma, alien, monstruo) y **Objetos** (nube, flor, antena, sol, tele,
  cascos, satélite, dron). En el selector van todas seguidas en ese orden, sin títulos de grupo, para no dejar huecos
  (Yil, 23 nov). Todas son propias de kywai (no copian personajes de nadie), siluetas sencillas de un solo
  color (como mucho, piezas finas un poco más oscuras) y con los mismos movimientos en 3D y 2D. Yil eligió el estilo
  sobre una primera lámina: fuera hocicos y mejillas claras, sombreros y piezas de otros colores. **Con volumen**: el
  motor pinta colores planos, así que `src/renderer/src/lib/figureVolume.ts` les pone un filtro SVG de luz (relieve
  desde la silueta, luz arriba a la izquierda y brillo, aspecto «inflado y brillante» elegido por Yil; uno por tamaño porque trabaja en píxeles) y otro a los ojos
  para que sobresalgan (sombra debajo, abombados y con brillo). Lo usan `AgentFigure` (clase `kywai-forma`) y el lienzo
  del 3D (`figureCard.ts` pinta plano en un lienzo aparte y lo pasa con el filtro). 12 colores rápidos y «Otro color», **Sorpréndeme**
  y **Volver a la de su nombre**. Sin elegir, cada agente recibe una sacada de su nombre (siempre la misma) con el
  color del agente, siempre entre las 12 de siempre (las 12 primeras de `FIGURE_SHAPES`), para que las formas nuevas no
  le cambien el aspecto a nadie. Los grupos del selector están en `FIGURE_GROUPS`. Al guardar, si el aspecto era otro, pasa a «Formas animadas» en ese dispositivo.
- **Textura** (desde el 23 nov 2026): además del color, el cuerpo de cada forma puede llevar un acabado en el estilo
  de «Crea tu agente» (gominola y caramelo, con color, brillo y cosas dentro), casi todos con movimiento: gominola (la
  luz de dentro respira), lunares, rayas, corazones, burbujas, purpurina, estrellitas, confeti, espiral (de piruleta,
  gira), desenfoque (manchas de tonos vecinos muy difuminadas que se mueven), degradado, holográfico, perla, galaxia,
  neón, metalizado, cristal y terciopelo (18, más «Liso»). Antes no gustaron ni los dibujos planos («son solo líneas») ni
  los materiales realistas en gris («están feas»). Cada acabado mezcla el color del agente con tonos vecinos (girando el
  tono), lo aclara u oscurece por zonas y, en algunos, mete dibujos dentro que se curvan con el cuerpo (`wrap()`, un
  desplazamiento sacado de la silueta). El movimiento es SMIL dentro del filtro y se apaga con «reducir movimiento».
  Se guarda en `AgentConfig.figure.texture` (`FIGURE_TEXTURES`); la receta está en `src/renderer/src/lib/figureTexture.ts`:
  un filtro SVG por acabado, tinta y tamaño (en las fichas pequeñas el grano se agranda) que se pone en las piezas del
  cuerpo (`[data-part="head"]`, `back-N`, `front-N`) con una clase en el <svg>, y en el 3D `figureCard.ts` usa el mismo
  filtro pasado a los píxeles de su lienzo. «Sorpréndeme» elige textura la mitad de las veces.
- **Ojos que se ven con cualquier acabado** (desde el 23 nov 2026, v1.15.7, Yil: «en modo galaxia los ojos no se ven»):
  el color de los ojos (blancos u oscuros) se elegía con el color del agente, no con el cuerpo que se ve con el acabado.
  Galaxia pinta siempre un cielo de noche, así que con un color claro salían ojos negros sobre negro (igual con Neón);
  y Perla y Holográfico, que aclaran el cuerpo, dejaban ojos blancos sobre claro con un color oscuro. Ahora
  `figureEyeColor(color, acabado)` en `src/renderer/src/lib/figures.ts` mira el color que de verdad queda con cada
  acabado (`TEXTURE_BODY`, copia la base de cada receta de `figureTexture.ts`: si cambias la base de un acabado,
  cámbiala también ahí). Vale para la ficha, el espacio 2D y el 3D, que sacan el personaje de `figureCharacter`.
- **Tu propio personaje**: diséñalo en Avatar Lab (avatars.bible-strong.app, gratis, en el navegador), descárgalo en
  «Export» (`<nombre>.avatar.json`) y tráelo con **Traer .avatar.json**: hace los mismos movimientos. Se guarda en la
  ficha del agente (como mucho 24 KB). El formato antiguo (versión 0) no se admite: hay que exportarlo de nuevo.
- Un aspecto propio de «Crea tu agente» (Meshy) va por delante de la forma.
- **Trabajar y pensar concentrado** (desde el 23 nov 2026, v1.11.2, pedido de Yil: «parece drogado»): los movimientos de
  trabajar del motor cambiaban de cara cada 1–2 s (sorpresa, cara rara, un ojo entornado) y cada cambio pasaba por los
  ojos cerrados; además daban volteretas enteras y encogían el cuerpo. Ahora son propios de kywai
  (`src/renderer/src/lib/figureLibrary.ts`): **trabaja** con la cabeza algo agachada y va alternando *lee* (barre la
  vista línea a línea), *teclea* (asiente corto y seguido y levanta la vista para comprobar) y *repasa* (se inclina,
  mira de cerca y asiente); **piensa** mira arriba a un lado, se queda quieto y luego al otro lado. Ojos abiertos y
  quietos (cara `neutral`; los ojos entornados parecían de sueño), un parpadeo normal cada pocos segundos, sin
  volteretas ni cambios de tamaño. Se pasan como biblioteca al motor en el 3D (`figureCard.ts`, estados `working` y
  `pensando`) y a `<Avatar library>` en la ficha, el chat (`AgentFigure.tsx`) y el 2D (`Space2D.tsx`, «piensa» →
  `pensando`). En la ficha y el chat «piensa» sigue siendo los tres puntitos. Vídeo antes/después en
  /mnt/project-files/animacion-pensar-trabajar/.

Cómo está hecho: el motor es `@bible-strong/avatar-react` / `avatar-core` (licencia MIT; el estudio Avatar Lab es AGPL
y no se usa su código ni sus personajes de ejemplo). Las formas están en `src/renderer/src/lib/figures.ts` (cuerpo y
piezas en unidades del motor), lo que se guarda en `AgentConfig.figure` (`src/shared/agentFigure.ts`, IPC y web
`setAgentFigure`) y el dibujo en `lib/AgentFigure.tsx` (en listas se queda quieto a los 1,5 s para no gastar). Las poses
del espacio 2D pasan a estados del motor con `figureState` (reposo → idle, trabaja → working, piensa → thinking,
espera → waiting, te necesita → alerting, celebra → celebrate, error → failed, duerme → sleeping). En el 3D, `scene/figureCard.ts` pinta cada fotograma del
motor en un lienzo de 256 px (30 por segundo, 15 con efectos reducidos) que va en un cartel que mira a la cámara;
`Robot.tsx` lo trata como un personaje más (lo apoya en su plataforma con los pies que mide `figureExtent` y esconde el
robot de debajo), y `figureStateFor` pasa el estado del robot al del motor (piensa, trabaja, espera, error → failed,
sin conexión o dormido → sleeping, te llama → alerting, acaba → celebrate, cansado → drowsy). El validador del
motor compila su esquema con `new Function`, que la política de seguridad de la ventana no deja: por eso los
personajes propios pasan por `sanitizeCharacter`, que los rehace solo con los campos del formato y sus límites (las
pruebas comprueban con el validador oficial que lo que sale es válido).

### Créditos kywai y planes de kywai Cloud

Los **créditos kywai** pagan los servicios de IA que kywai ofrece con sus propias cuentas, sin que tengas claves ni te
registres en cada servicio. **1 crédito = 1 centavo** (100 créditos = 1 $). Lo que haces con tus propias claves o
suscripciones no gasta créditos. Se ven y se recargan en Mi cuenta → **Créditos kywai** (saldo, precios y movimientos).

- **Dos bolsas:** los créditos del plan se dan el día 1 de cada mes y **no se acumulan**; los comprados y los **100 de
  bienvenida** **no caducan nunca**. Se gastan primero los del mes.
- **Recargas** (pago único con Stripe, nunca automáticas): 5 $ = 500, 10 $ = 1.000, 25 $ = 2.600 (+4 %), 50 $ = 5.500
  (+10 %).
- **Precios:** aspecto de un agente 150, modelo 3D 100, «Hablar con kywai» con Gemini 5 por minuto pasados los minutos del
  plan y los de paquete (el primer minuto se cobra al empezar y el resto al colgar), 3 acciones de Apps conectadas pasadas las del día 1. La voz gratis
  (Cloudflare) sigue gratis con su límite diario. Regla de precios: lo multimedia al doble de lo que le cuesta a kywai,
  el texto con un 30 % encima.
- **Planes** (Mi cuenta → Plan y pagos, o al pagar por primera vez):

  | Plan | Precio al mes | Espacio | Créditos al mes | Acciones de apps al día | RAM · procesadores | Agentes a la vez | Tareas programadas | Voz en vivo al mes |
  |---|---|---|---|---|---|---|---|---|
  | kywai Cloud | 10 $ | 30 GB | 200 | 300 | 2 GB · 2 vCPU | 3 | 5 | 30 min |
  | kywai Pro | 25 $ | 80 GB | 1.000 | 1.000 | 4 GB · 3 vCPU | 6 | 25 | 120 min |
  | kywai Pro Max | 50 $ | 130 GB | 2.500 | 3.000 | 6 GB · 4 vCPU | 10 | 100 | 300 min |

  Subir de plan cobra ya la parte del mes que queda y da al momento el espacio y la diferencia de créditos del mes.
  **Mejorar en 2 clics:** la tarjeta de la suscripción (arriba en Plan y pagos) enseña el plan siguiente con lo que se
  gana (espacio, créditos, agentes a la vez, voz) y el botón «Mejorar a …». El primer clic abre una ventanita con lo que
  se paga hoy (aproximado, la parte del mes que queda) y el precio desde la renovación; el segundo, «Confirmar la
  mejora», hace el cambio. «Cambiar de plan» va justo debajo, antes de las facturas, y marca el siguiente plan como
  «Recomendado para ti». Con Pro Max la tarjeta dice que ya tienes el plan más completo. Bajar sigue a un clic (no cobra).
  «Tarjeta y facturas en Stripe ↗» (arriba a la derecha de la tarjeta) abre el portal de Stripe.
  La RAM y los procesadores del nuevo plan llegan al espacio en un minuto como mucho, sin reiniciarlo.
  Con **Pro Max**, «Escribir a soporte» (Mi cuenta → Ayuda y cuenta) manda el correo marcado como prioritario.
  Bajar cambia el precio desde la próxima renovación y solo se puede si los archivos caben. Las ampliaciones de espacio
  cuestan solo la diferencia sobre lo que trae el plan (con Pro, 100 GB +3 $ y 130 GB +8 $).
- **Pagos reales (25 nov 2026):** Mi cuenta cobra de verdad cuando el servidor tiene la clave real de Stripe
  (`sk_live_…`); con una de prueba todo sigue siendo de prueba. El modo sale de la clave y nunca se mezclan. El paso se
  hace una vez en el servidor con `python3 /opt/kywai/portal/stripe_modo_real.py` (pide la clave sin mostrarla, crea el
  precio, el webhook y el portal de facturación reales, guarda copia y reinicia Mi cuenta; `--comprobar` solo mira,
  `--admin correo` hace administradora a una cuenta y `--volver` regresa a prueba). Quien tenía un plan de prueba
  conserva su espacio y sus archivos y elige su plan real en Plan y pagos («Elegir mi plan»); pasado el plazo
  (`--dias`, 7 por defecto) el espacio se pausa sin borrar nada y vuelve al pagar. No pagan las cuentas de
  administración. Detalle en `portal/DEPLOY.md` de Kywai-Cloud («Pasar a pagos reales»).
- **«$ gastado» en el panel de cuentas (25 nov 2026, solo administración):** Mi cuenta → Administrar cuentas tiene una
  columna con lo que ha pagado cada cuenta en Stripe: cada mes de suscripción (también subidas de plan y GB extra) y
  cada recarga de créditos, **menos lo devuelto**. Debajo sale el desglose («20 $ de plan · 25 $ de créditos» o «15 $
  pagados · 15 $ devueltos»); las cuentas de administración salen «0 $ · No paga». También va en «Descargar
  estadísticas (CSV)». Los pagos se apuntan al llegar cada aviso de Stripe y lo cobrado antes se recupera una vez, así
  que el panel no espera a Stripe al abrirse (`portal/pagos.py`).
- **Cambiar el plan de una cuenta desde el panel (25 nov 2026, solo administración):** en Mi cuenta → Administrar
  cuentas, la columna «Suscripción» dice el plan de cada cuenta y tiene dos selectores y «Cambiar»: el plan (Cloud, Pro
  o Pro Max) y el cobro. El primer clic enseña qué pasará y el segundo, «Confirmar el cambio», lo hace.
  - **«Cambiar también el cobro»:** el plan nuevo vale al momento y Stripe cobra el precio nuevo **desde la próxima
    renovación**, subiendo o bajando. Nunca se carga nada al momento, porque no lo ha pedido la persona.
  - **«Regalo, sin tocar el cobro»:** kywai da el plan y Stripe sigue cobrando lo mismo. La fila lo marca «Regalo» y
    dice lo que paga («Paga kywai Cloud»). El regalo se acaba si la persona cambia de plan en Plan y pagos (sube o baja
    respecto a lo que paga de verdad), si se elige el mismo plan con «Cambiar también el cobro» o al volver al plan pagado.
  - En los dos casos los créditos del mes se ajustan (subir da la diferencia, bajar no quita lo dado), la RAM y los
    procesadores cambian en un minuto sin reiniciar el espacio, queda en «Últimas acciones de administración» y la
    persona recibe un correo. No se puede bajar a un plan en el que no caben sus archivos, ni cambiar una cuenta sin
    plan activo. Las cuentas de administración siguen en Pro Max sin mensualidad, sin selector. La capacidad del panel
    ya enseña la real (nunca menos de lo que trae el plan). Código: `portal/admin.py` (`/cuenta/admin/<cuenta>/plan`) y
    `portal/creditos.py` (`stripe_set_plan`, `gift_plan`, tabla `plan_regalo`).
- El código vive en el portal de kywai Cloud (repo Kywai-Cloud, `portal/creditos.py`). La app solo lee del portal el
  saldo y los precios para enseñarlos en «Crea tu agente».
- Las imágenes se guardan en la carpeta de datos, en `aspecto-agentes/<agente>/` (`<expresión>.png` de 512 px y
  `modelo.glb`), y se sirven por `cowork://look/…` en la app y `/api/agent-look/…` en la web. El código está en
  `src/shared/agentLook.ts` (piezas y encargos), `src/main/agentLook.ts` (Meshy) y
  `src/renderer/src/ui/space/AgentLookDialog.tsx` (el editor). Órbita todavía enseña el robot de siempre.

### La cotorra en el espacio 3D

En el espacio 3D el coordinador (el primero en planificar) es siempre la cotorra, sea cual sea su CLI y con cualquier
aspecto de Ajustes → Agentes (en «Píxel» sale como sprite). El modelo es el de Meshy con un esqueleto de pájaro propio
(cuerpo, cabeza, cresta, alas con punta, cola y patas) y nueve movimientos. Las alas son piezas aparte (se recortaron del
modelo por su color y debajo queda piel lisa del color del cuerpo), con grosor propio y un pelo separadas, así que suben y se apartan del cuerpo sin deformarlo. Los movimientos van dentro del mismo archivo
(`assets/personajes/cotorra.glb`): reposo, saluda, piensa, coordina, celebra, te necesita, camina, vuela y duerme.
`mascotClip` (en `scene/characters.ts`) traduce el movimiento que toca a los personajes a los suyos: explicar o hablar
es «coordina», dudar o un error es «te necesita», y en reposo con el coordinador descansando o sin conexión se duerme.
Tiene párpados de arriba y de abajo (discos redondos que copian la forma de la cara, con material propio y una raya
de pestañas en el de arriba que al cerrar queda como «◡»): parpadea cada 2,5 a 6
segundos, a veces dos veces seguidas (`blinkAmount` y `nextBlinkGap`), y cada movimiento lleva su expresión: ojos
sonrientes al saludar y celebrar (sube el párpado de abajo), un ojo medio cerrado al pensar, mirada concentrada al
coordinar, cara de preocupación en «te necesita» y ojos cerrados al dormir. Los movimientos llevan anticipación y rebote (se agacha antes de saltar y se aplasta al caer),
respiración en reposo, miradas a los lados y la cresta y la cola que siguen el movimiento. «Vuela» está listo pero aún no se usa. El esqueleto y los movimientos se hicieron con Blender (script en la carpeta
del proyecto «mascota-kywai/modelo-3d»).

### Ver a los agentes trabajar en el espacio 3D

El espacio 3D sirve para ver trabajar al equipo, así que cada agente ocupado se nota a simple vista, con cualquier
aspecto (Formas animadas, Personajes, Píxel, Clásico, Refugio) y en cualquier tema (también en «kywai», donde la
plataforma no tiene consola ni pantallas):

- **Pantalla holográfica a su lado** con lo que hace: código que corre mientras trabaja y barras mientras piensa. Mira a
  la cámara y se pone a un lado para no taparle la cara.
- **Aro de luz que gira a sus pies**, de su color (más rápido al trabajar que al pensar).
- **Hilo de luz hasta el núcleo del Proyecto** con chispas que suben: se ve en qué está metido cada uno. El coordinador
  no lo lleva (integra en el propio núcleo).
- **Su etiqueta** dice lo último que hace («Leyendo el proyecto», «Montando los planos»…), con el tiempo y la barra de
  progreso, y al recibir la tarea suelta su bocadillo.
- Al terminar, todo se apaga en un segundo y vuelve a estar libre en su plataforma.

Detalles que antes fallaban (23 nov 2026):

- **Con «Formas animadas» la forma ya no desaparece**: al pensar, esperar o llamarte, el motor de las formas convierte
  el cuerpo en un indicador de carga (puntos, órbita, «!»), que en la ficha y el chat se lee bien pero en el 3D dejaba
  al agente reducido a unos puntitos. En el 3D el cuerpo se queda siempre (`figureStateFor` en `scene/figureCard.ts`:
  piensa examinando, espera tarareando y te llama sorprendido).
- **Tarea en marcha = se le ve trabajando**: en algunos tramos el servidor deja al agente «libre» aunque su tarea siga
  (kywai monta el vídeo, graba las voces, espera a que repases el guion, reintenta tras un error pasajero). El chat la
  enseñaba «Trabajando» y el 3D/2D en reposo. Ahora, si el agente figura libre y tiene una tarea en marcha, se le ve
  trabajando en ella con lo último que hace (`lib/agentBusy.ts`, en el 3D, su etiqueta y el 2D). Vale igual para las
  tareas que reparte Hermes y para los mensajes directos sin coordinador.
- **Ninguna etiqueta tapa a otro agente**: el cuerpo de cada agente cuenta como ocupado y las etiquetas se apartan un
  poco a un lado o suben (`freeSpot` en `scene/LabelProjector.tsx`). Si una etiqueta queda lejos de su agente, un hilo
  fino la une con su cabeza. Las etiquetas van ahora más pegadas a la cabeza.

Código: `scene/WorkFx.tsx` (pantalla, aro, hilo y chispas, dentro del grupo del robot: si se mueve, va con él).

### Espacio 2D

En la cabecera del espacio hay un interruptor **3D / 2D**. En 2D el tema que tengas puesto se ve dibujado, como un
escenario: el mismo tema, los mismos agentes y la cotorra coordinadora en su percha arriba, con líneas de puntos hasta
los agentes que trabajan para ella (naranjas si alguno te necesita). No usa 3D (ni Three.js ni WebGL): son imágenes y
animaciones de CSS, así que gasta mucho menos y ni siquiera se carga el código del 3D. Se recuerda en cada dispositivo
(`aicowork.espacio.modo`); si nunca se eligió, empieza siempre en 3D: el 2D es una opción para quien la quiera (solo arranca en 2D si el equipo no puede abrir WebGL, porque ahí el 3D no se vería). Si el 3D está elegido y falla o el equipo deja de poder abrirlo, kywai enseña el 2D con un aviso (ver «Las vistas del equipo pasan las mismas comprobaciones»). En 2D los botones de cámara se quitan (queda pantalla completa).

Cada agente enseña su pose (`space2d/pose.ts`): **trabajando** (bota y se le enciende la pantalla), **pensando**
(bocadillo con puntos), **esperando** a otro (reloj de arena; la etiqueta dice a quién), **te necesita** o **un
problema** (círculo naranja con «!» y se agita), **¡terminado!** (salta con confeti unos segundos) y **durmiendo**
(sin conexión o tras 10 minutos sin hacer nada, con «Zz»). La cotorra pone la pegatina que toca: coordina mientras el
equipo trabaja, te necesita si alguien te espera, celebra al terminar y duerme si todos duermen. Al pulsar un agente o
la cotorra se abre su ficha, como en el 3D. Los agentes se reparten en filas debajo del coordinador según cuántos
son y el tamaño del panel: se elige el número de filas que los deja más grandes sin que se pisen entre ellos ni con el
coordinador. Cada fila de detrás es un poco más pequeña y todos llevan su nombre y estado visibles, con una letra que
no baja de un tamaño que se lee. El «!» naranja (sobre un agente o sobre la cotorra) se puede pulsar: abre «Te necesita» si hay algo
que decidir, o la ficha del agente con el motivo del aviso. La cotorra coordinadora no lleva borde blanco de pegatina, ni aquí ni en el chat, para que encaje
con los agentes; solo el saludo del chat nuevo se queda como pegatina. «Reducir efectos» y ocultar el espacio lo dejan quieto.

**Escenas: Flujo y Tema.** Arriba a la izquierda del espacio 2D se elige la escena (se recuerda en cada dispositivo,
`aicowork.espacio2d.escena`; por defecto **Flujo**): Flujo, Mesa, Aldea, Tren o Tema.

- **Flujo** (`space2d/flow.ts`): cada agente en su puesto, sobre una plataforma que brilla mientras trabaja. El
  coordinador va a la izquierda, las **Entregas** a la derecha y en medio los agentes en columnas según la cadena de
  esperas (quien espera a otro va una columna detrás de él, hasta tres). Las líneas que los unen se encienden cuando
  hay trabajo o un envío de camino; en naranja si alguien te necesita. Cada envío real entre agentes (las
  transferencias del equipo) viaja como un sobre por su línea durante unos segundos, y al terminar una tarea el agente
  manda su sobre a la caja de Entregas, que cuenta las tareas terminadas en la última media hora. Con muchos agentes
  una columna se parte en dos y todo se hace un poco más pequeño hasta que cabe.
- **Mesa**, **Aldea** y **Tren** (`space2d/SceneDecor.tsx`): los mismos puestos, líneas, sobres y Entregas que Flujo,
  con otro decorado dibujado con código (sin imágenes). En la **Mesa de ideas** el proyecto es un tablero de papel sobre
  una mesa de madera: cada agente trabaja sobre su hoja, los une un hilo rojo y lo entregado son sobres lacrados. En la
  **Aldea** cada agente tiene su casita-taller con el tejado de su color (la puerta se enciende mientras trabaja), las
  casas se unen por caminos de piedra y las Entregas son el puesto del mercado. En el **Tren nocturno** cada agente va
  en su compartimento, con el paisaje del atardecer pasando por la ventana, y los envíos viajan por los rieles de latón.
- **Tema**: el tema puesto dibujado como escenario, como se explica arriba.

En todas las escenas los personajes (aspecto «Personajes») se mueven de verdad y con aspecto de dibujo 2D: cada uno
tiene una hoja de animación sacada de su modelo 3D con colores planos y contorno de tinta, en
`assets/espacio2d/hojas/<personaje>.webp` (12 cuadros de 192 px por fila, 8 filas: reposo, trabaja con el portátil,
piensa, duda, celebra, saluda, camina de lado y explica; `space2d/sprites.ts`).

**Cada agente se queda en su puesto** (v1.30.38, pedido por Yil el 24 nov 2026: «se puede mover en su sitio pero que no
salga de su puesto»). Se mueve y se anima en su plataforma, pero ya no se levanta a visitar a otros: antes se iba
andando y su puesto se quedaba vacío. Lo que se pasan entre ellos viaja solo como un sobre por la línea que los une. Con
«Reducir efectos» o el espacio en pausa no se mueve nadie. Trabajando teclea en el
portátil, pensando se lleva la mano a la barbilla, esperando o con un error duda, al terminar celebra, si te necesita
saluda y al pasar el ratón por encima te saluda. Los agentes con aspecto propio de «Crea tu agente» siguen con su
dibujo y su expresión para cada estado, animados con CSS. La cotorra usa el estilo elegido en Ajustes.

**Nada se sale del marco** (v1.30.38). En Flujo (`flow.ts`), la caja de «Entregas» y la plataforma de la cotorra
quedan enteras dentro del panel: en paneles de menos de 640 px de ancho, «Entregas» baja debajo del coordinador en vez
de cortarse por la derecha. El reparto busca la mayor escala a la que todos caben sin pisarse y, si las columnas de
«espera a…» no caben a lo ancho (o dejan a los agentes diminutos), los pone a todos en una columna partida a lo alto;
las líneas siguen uniendo a quien espera con quien le pasa el trabajo.

**Con «Formas animadas» en el 2D** (arreglado el 23 nov 2026, v1.6.3):

- La **cotorra** es la misma forma que en el 3D (bola verde con cresta, pico y alas; `cotorraCharacter()`), no el
  dibujo detallado, y se mueve con su ánimo (coordina, te necesita, celebra, duerme).
- **Más pequeñas y con aire**: una forma llena todo su cuadro (los dibujos traen margen), así que se dibuja al 64 % del
  alto de un dibujo (`FIGURE_K` en `Space2D.tsx` y `--s2-fig` en el CSS) y la cotorra al 80 % del suyo. El reparto
  (`flow.ts` y `ring.ts` para la Mesa) cuenta con ese tamaño real y con el ancho de la cotorra: la primera columna
  empieza bien separada de la cotorra (al menos 64 px o el 7 % del ancho del panel, y en la Mesa el 5 %), cada columna deja hueco a los lados y en la misma columna nadie se pisa.
- Pensando, esperando o llamándote, la forma ya no se vuelve una ruedecita de puntos (no se sabía quién era): usa los
  movimientos «curioso», «tararea» y «avisa», como en el 3D (`FIGURE_STATE_2D` en `Space2D.tsx`).

**Cambiar los dibujos (sin modelos 3D).** Cada tema busca su ilustración en `assets/espacio2d/<tema>/` (`<tema>` es el
id: `mundo-bosque`, `halloween`, `kywai`, `oficina`, `sede`…; la Ciudad digital usa `ciudad-<color>`):

| Archivo | Tamaño | Qué es |
|---|---|---|
| `fondo.webp` | 2400×1360, opaco | El escenario (horizonte hacia el 55 %, la mitad de abajo libre para los agentes). |
| `fondo-noche.webp` | 2400×1360, opaco | El mismo de noche, para el Modo noche. |
| `delante.webp` | 2400×1360, transparente | Plantas u objetos de los bordes que tapan un poco a los agentes. |
| `plataforma.webp` | 512×160, transparente | Donde se pone cada agente. |
| `percha.webp` | 512×200, transparente | Donde se pone la cotorra. |

Las poses de un agente van en `assets/espacio2d/agentes/<agente>/<pose>.webp` (512×512, transparente; poses `reposo`,
`trabaja`, `piensa`, `espera`, `te-necesita`, `error`, `celebra`, `duerme`). Lo que falte se suple: sin ilustración, el
tema se dibuja con código (`space2d/Backdrop2D.tsx`, un decorado por familia: bosque, Halloween, órbita, Navidad, fondo
marino, Olimpo, fábrica, ciudad, refugio y oficina, con los colores de `space2d/scenes.ts`); sin pose, se anima el
dibujo del agente con su aspecto de Ajustes → Agentes. Basta con soltar las imágenes en esas carpetas y compilar.

### Expresiones de los robots

**Fichas sobre los robots** (desde el 22 nov 2026): quien trabaja, piensa, espera o tiene un problema lleva su
ficha entera (nombre, modelo, estado y progreso). Quien está libre, en reposo, bailando o apagado se queda solo con
el punto y el nombre, en una píldora pequeña: así se ve de un vistazo quién está haciendo algo. Al pasar el ratón por
encima, o al elegirlo, vuelve la ficha entera. Lo hace `quiet` en `scene/RobotLabel.tsx`.
Los **bocadillos** (lo que dice cada robot) cuentan como parte de su ficha al repartir las etiquetas
(`scene/LabelProjector.tsx`): si un bocadillo iba a tapar la ficha de otro robot, la etiqueta más lejana sube lo justo.

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

**Cuando suena música**, los agentes libres permanecen despiertos y su etiqueta cambia a **Bailando**. Los pasos y saltitos siguen el reloj del reproductor de YouTube o de la radio, y los golpes de audio cuando están disponibles; también siguen el pulso de la música ambiental sintetizada. Sin BPM conocido, se balancean suavemente y responden a los golpes detectados. El interruptor de luces musicales es independiente. Al parar toda la música vuelven a su comportamiento habitual; si al pausar una canción sigue sonando la música ambiental, siguen bailando con ella. El trabajo real, escribir en el chat y **Reducir efectos** tienen prioridad.

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

- **Quieto mientras no lo miras.** Con kywai detrás de otra ventana o minimizado, los peluches, el espacio 2D, los
  puntos que laten y las ruedas de carga se quedan quietos; al volver siguen donde estaban. Antes seguían animándose
  sin que nadie los viera: medido el 25 nov, la tarjeta gráfica pasaba de ~23 % a 0 % y la ventana de ~11 % a ~1 %
  (`lib/awayPause.ts` pone `data-away` en `<html>`; las reglas de pausa están en `PlushAvatar.module.css`,
  `Space2D.module.css` y `ui/common/ui.module.css`). El 3D ya se paraba solo con la ventana oculta.
- **Solo tu idioma al abrir.** La app carga al arrancar solo el diccionario del idioma que usas (y el inglés de
  respaldo); en español no carga ninguno. Antes cargaba los cinco (unos 3,6 MB de textos) en cada arranque. El
  archivo de entrada pasó de 6,9 MB a 4 KB (`renderer/src/main.tsx` espera a `loadLangPacks` de `lib/langPack.ts`
  y luego importa `start.tsx`; el proceso principal y las pruebas registran todos con `shared/i18nAll.ts`).
  Si añades un idioma, ponlo en `LOADERS` de `langPack.ts` en `i18nAll.ts` (pruebas) y en `src/main/i18nMain.ts` + `electron.vite.config.ts` (motor).
- **El motor también lee solo tu idioma (1.31.0).** El proceso principal ya no carga los cinco diccionarios al
  arrancar: `src/main/i18nMain.ts` registra un cargador por idioma (`registerDictLoader` de `shared/i18n.ts`) y cada
  uno es un archivo aparte (`out/main/i18n-xx.js`) que se lee la primera vez que se pide ese idioma (los avisos de
  «Te necesita» se guardan en todos los idiomas, así que el primero de la sesión los lee todos: es lo esperado). Con
  el lector de páginas limpias (`cleanPage.ts`: defuddle y linkedom, que se cargan la primera vez que se usa), el
  motor (`out/main/index.js`) pasó de 10,7 MB a 4,35 MB y arranca en la mitad de tiempo.
- **La ventana abre sin el motor 3D (1.31.0).** Lo que se dibuja al arrancar (`start.tsx` → tema, colores, aspecto de
  los agentes) ya no importa Three.js: los colores del tema están en `scene/palette.ts` y las piezas que necesitan
  Three en `scene/paletteGl.ts`; el aspecto de los agentes (`scene/agentSkin.ts`) no carga modelos. Ajustes se
  carga al abrirlo (o solo, 4 s después de abrir la app); si su archivo no llega, se cierra sin dejar la ventana en
  blanco y se reintenta al volver a abrirlo (`ui/common/ChunkGuard.tsx`). El arranque de la ventana pasó de 3,25 MB a 2,1 MB. Regla:
  nada de `lib/`, `store/` ni `ui/` que se cargue al abrir puede importar `three` ni `scene/*` con Three.
- **Texturas en WebP (1.31.0).** Las siete imágenes grandes del Fondo marino y del Refugio Kywai son WebP (calidad
  90): 3,4 MB en vez de 23 MB, sin diferencia visible.
- **El 3D no recompila a mitad de uso (1.34.1).** Cuando el último material que usa un sombreador se suelta, three
  borra su programa de la tarjeta gráfica, y el siguiente material igual tiene que compilarlo otra vez: un parón de
  toda la ventana (más largo en Windows). Pasaba con cada archivo que viajaba entre agentes, al entrar o salir un
  becario (cambian los puestos y se rehacían las pistas del suelo) y cuando la calidad automática cambiaba el
  suavizado (se rehacían los efectos). Ahora los materiales de los archivos que viajan se reutilizan
  (`takePacketMats`/`givePacketMats` en `scene/Transfers.tsx`), las pistas sueltan sus materiales viejos cuando los
  nuevos ya se dibujan (`scene/disposeSoon.ts`), `scene/Circuits.tsx` solo rehace la forma de las pistas y el
  suavizado ya no lo cambia el ajuste automático (`sceneQuality`). Medido en modo demo: de 14 compilaciones en 36 s a
  2 (las de un becario que aparece por primera vez).
- **Efectos más ligeros en Normal (1.34.1).** En Normal (y en Automática, que llega como mucho a Normal) el suavizado
  de bordes va a ×2 y el brillo (bloom) se calcula a media resolución (`msaa` y `bloomScale` en `scene/quality.ts`).
  Medido: los efectos eran más de la mitad del trabajo de la tarjeta gráfica en cada fotograma y el suavizado ×4,
  algo más de un tercio; a la vista casi no hay diferencia. «Máxima» sigue con ×4 y el brillo a resolución entera.
- **Los vídeos y las imágenes no frenan la interfaz (1.39.2).** Los programas pesados que kywai lanza de fondo (ComfyUI
  y, en el estudio de vídeo, ffmpeg, las voces y los renders: todo lo que pasa por `runJob` de `longJob.ts`) arrancan con
  prioridad por debajo de la normal (`lowPriority.ts`; el programa hijo hereda la prioridad de su padre). Medido el
  26 nov en un PC Windows de 24 hilos con una tanda de vídeos: ComfyUI en modo CPU (~13 hilos) y el script del estudio
  (~4 hilos) llevaban la CPU al 91-97 % con prioridad normal, la misma que la ventana de kywai, y el chat daba saltos con
  la tarjeta gráfica al 0 %. Con prioridad baja el sistema atiende primero a la interfaz; los vídeos tardan casi lo
  mismo si el equipo está libre. `runJob` acepta `priority: 'normal'` para algo que de verdad tenga prisa, y
  `KYWAI_JOBS_NORMAL_PRIORITY=1` lo apaga todo. Los agentes (Claude Code, Codex…) no se tocan: casi no usan CPU.
- **Los ojos de los peluches ya no frenan la interfaz con un monitor rápido (1.39.3).** El seguimiento del puntero de
  `PlushAvatar.tsx` leía la posición de todos los peluches (`getBoundingClientRect`, ~130 en la pantalla de Yil) en
  cada movimiento del ratón. Como el resto de la interfaz ensucia el layout a cada fotograma, cada lectura obligaba a
  recalcular el layout de ~11.000 nodos: medido el 26 nov en un PC Windows con un monitor de 240 Hz, el 89 % del
  tiempo del hilo de la interfaz estaba en esa llamada (renderizador al 100 % de un núcleo con el PC libre) y el chat
  iba a tirones. Ahora las posiciones se guardan (`lib/plushLook.ts`) y solo se releen cada 400 ms, o cada 100 ms
  tras un scroll o un cambio de tamaño: como mucho unos cuatro recálculos por segundo en vez de uno por fotograma.
- **Música sin comprobaciones de más.** Mientras el audio está en pausa (sin música sonando), el programador de la
  música mira una vez por segundo en vez de 20 (`schedule` en `lib/audio.ts`).
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
  partículas y estructuras). El brillo (bloom), su suavizado y las luces de los puestos no se quitan ni se ponen sobre
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

- **Escritorio y navegador:** ⚙ → **Apoyar kywai**. Abre la página de Ko-fi en el navegador.
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
npx vitest run
```

**Pruebas automáticas en GitHub («Probar»).** Cada PR pasa solo, con GitHub Actions
(`.github/workflows/probar.yml`), los tipos, todas las pruebas de vitest y la compilación de la app; si cambia
`android/`, también las pruebas de Órbita. El resultado sale en el propio PR: con una ✗ roja no se fusiona hasta
arreglarlo (en «Details» se ve qué prueba falló). Corre en el **Mac mini** (la «máquina de pruebas», ver abajo), que no
gasta minutos de GitHub: los 2.000 minutos gratis al mes de los repos privados se acabaron el 20 de noviembre a mitad
de mes. Por lo mismo ya no se repite al fusionar en `master`; a mano, Actions → Probar → «Run workflow». Si el Mac mini
está apagado, la prueba espera en cola hasta que vuelva (un PR con la prueba «en espera» no se fusiona sin pasarla
antes en local).
Tras compilar, las **pruebas de pantalla** (`scripts/e2e/app.e2e.mjs`, Playwright) abren la app como una persona la
primera vez, en una carpeta de datos vacía y sin agentes reales: comprueban que arranca sin errores en la consola, que
sale el asistente con los agentes, que «Omitir por ahora» deja la caja del chat lista y que al volver a abrirla no lo
repite. Después, las **pruebas de pantalla de las vistas** (`scripts/e2e/vistas.e2e.mjs`) abren las vistas del equipo
una a una: que el 3D dibuja una escena de verdad (se cuentan los colores del lienzo: uno liso es un 3D en negro), que
las cinco escenas del 2D cargan todas sus imágenes, que cada agente tiene su personaje animado y la cotorra su cara,
que con el equipo trabajando (modo demo) cada personaje hace lo que dice su estado, alguien se levanta a llevar un
encargo y la cotorra deja el reposo, que se puede volver al 3D, que la vista y la escena elegidas se recuerdan aunque
se salga de kywai justo después de elegirlas (la prueba sale como una persona, con `salir()`, no cortando el proceso)
y que en un equipo que no puede abrir el 3D sale el 2D con su aviso en vez de la ventana en blanco. Y la **prueba de
pantalla del estudio** (`scripts/e2e/estudio.e2e.mjs`) abre la app y le pide la
[autoprueba del estudio](#probar-el-estudio-lo-hace-de-verdad-sin-agentes): una grabación de muestra, su edición con
subtítulos, un recorte, tres portadas y la demo de una web, hechos de verdad con el ffmpeg de la máquina (se le
enlazan solo `ffmpeg` y `ffprobe`, buscados como los busca la app: primero `~/.local/bin`; el registro dice cuál es y
si quema subtítulos). Si la máquina no tiene ffmpeg la prueba se salta, y si su ffmpeg no quema subtítulos no se le
exige esa pieza; con `KYWAI_EXIGIR_ESTUDIO=1` (como cada noche) no se perdona nada. Para probar una pantalla de alta
densidad en cualquier máquina: `KYWAI_E2E_ESCALA=2`.
Si fallan, las capturas quedan en los artefactos del flujo. En local:
`npx electron-vite build && npm i --no-save playwright@1.63.0 && node --test scripts/e2e/app.e2e.mjs` (y lo mismo con
`scripts/e2e/vistas.e2e.mjs` y `scripts/e2e/estudio.e2e.mjs`; en Linux sin pantalla, con `xvfb-run -a` delante). Lo
común de las tres está en `scripts/e2e/comun.mjs`.
Las pruebas **no dejan ventanas abiertas**: `comun.mjs` cierra siempre la app (y la corta si en 20 s no se cierra),
también si falla al arrancar, y al salir la prueba por lo que sea (acaba, falla, GitHub la cancela o se pasa de tiempo)
corta las que queden. Además la app de la prueba recibe `KYWAI_PRUEBA_PADRE` (el proceso de la prueba) y, si ese
proceso muere sin cerrarla, se cierra sola en unos segundos (`src/main/modoPrueba.ts`). Su ventana se llama
**«kywai (prueba automática)»**: si en el Mac mini ves una ventana con ese nombre, es de una prueba y no tu kywai
instalado (ese busca sus actualizaciones en la carpeta que guarda `source-dir.txt`, en el Mac mini `~/ai-cowork-original`).
Los avisos de macOS «runsvc.sh puede ejecutarse en segundo plano» son los ejecutores de pruebas: son normales.

**Prueba de cada noche en el Mac mini («Noche en el Mac mini»).** Cada noche (9:30 UTC) el Mac mini compila master,
abre la app con las mismas pruebas de pantalla (también las de las vistas del equipo y la del estudio, que aquí es
obligatoria: sin ffmpeg falla), ahora en macOS de verdad y con su tarjeta gráfica, y comprueba el **agente local**: que LM
Studio (puerto 1234) y Ollama (11434) responden, tienen un modelo y contestan a un mensaje corto
(`scripts/e2e/local.e2e.mjs`). Si uno no está abierto, su prueba se salta; para exigirlo, en GitHub → Settings →
Secrets and variables → Actions → Variables, `KYWAI_EXIGIR_LOCAL=lmstudio,ollama`. Si algo falla, GitHub manda un
correo y el detalle queda en Actions. Corre en la «máquina de pruebas» del Mac mini y solo en kywai-original.

**La máquina de pruebas del Mac mini.** Es el programa oficial de GitHub (un «self-hosted runner») instalado en el Mac
mini: GitHub solo avisa y el Mac hace el trabajo, así que no gasta minutos. En ella corren «Probar», «Publicar Órbita»,
«Noche en el Mac mini» y, en kywai-cloud, «Comprobar portal». Instalación, una vez por repositorio, en el Mac mini: en
GitHub, el repositorio → Settings → Actions → Runners → New self-hosted runner → macOS, copiar el token (caduca en una
hora) y ejecutar `bash scripts/instalar-pruebas-mac.sh <token>` (kywai-original) o
`bash scripts/instalar-pruebas-mac.sh <token> kywai-cloud`. Quedan como servicios en `~/kywai-pruebas` y
`~/kywai-pruebas-cloud` y arrancan solos al iniciar sesión.
**Varias a la vez, sin cola (23 nov 2026).** Las pruebas de un PR tardan unos 3 minutos, pero con una sola máquina se
hacían de una en una y, con varios hilos fusionando, cada PR esperaba 15 o 25 minutos en cola. Por eso: el Mac mini
tiene **3 máquinas de pruebas** de kywai-original (`bash scripts/instalar-pruebas-mac.sh <token> kywai-original 3`;
un token vale para las tres y las ya instaladas se dejan como están; quedan en `~/kywai-pruebas`, `~/kywai-pruebas-2` y
`~/kywai-pruebas-3`); cada PR ocupa **un solo turno** (las pruebas de Órbita van dentro del mismo trabajo y se saltan en
un segundo si no cambia `android/`); cada rama tiene **una sola prueba viva** (la nueva cancela la vieja, también la
lanzada a mano: grupo `probar-<rama>`), y sin la caché de npm de GitHub, que en el Mac no servía (ahorra ~30 s). Como
pueden correr varias pruebas a la vez, ninguna prueba debe escuchar en un puerto fijo: usar el puerto 0 o uno al azar
(como `lmstudioDirect.test.ts`). Java, Node y el SDK de Android los bajan los flujos la
primera vez; el portal usa el `python3.12` de Homebrew. Nunca se usa en el repositorio público. La web, los
instaladores y las Releases siguen en el escaparate público, donde los minutos son gratis.
Su flujo «Publicar escritorio» saca **una versión al día** (desde la 1.31.0, a las 9:00 UTC) con todo lo fusionado en
kywai-original desde la anterior; para publicar antes se lanza a mano («Run workflow»). Antes miraba cada 10 minutos.

**Espejo de kywai-codigo** (desde la 1.31.0, `.github/workflows/espejo-codigo.yml`): cada push a master de
kywai-original se copia solo en master de `Yiku21/kywai-codigo`, en el Mac mini, así los dos repositorios privados
están siempre a la misma versión sin portar cada mejora a mano. Está **apagado** hasta que exista el secreto. Para
encenderlo (una vez): en el Mac mini, `ssh-keygen -t ed25519 -N "" -C espejo-codigo -f ~/espejo-codigo`; en
kywai-codigo → Settings → Deploy keys → Add deploy key, pegar `~/espejo-codigo.pub` y marcar **Allow write access**;
en kywai-original → Settings → Secrets and variables → Actions → New repository secret `KYWAI_ESPEJO_LLAVE` con el
contenido de `~/espejo-codigo`; después borrar los dos archivos del Mac y lanzar el flujo a mano una vez. La primera
vez guarda el master antiguo de kywai-codigo en la rama `respaldo/antes-del-espejo` (las dos historias son distintas)
y lo sustituye por el de kywai-original; si master de kywai-codigo tiene protección contra force-push, hay que
quitarla. Desde entonces los PR van solo a kywai-original.
Las pruebas abren la app con su propia carpeta de datos (`KYWAI_APPDATA_PRUEBAS`), sin tocar la del kywai instalado.
Las pruebas del zip de «Archivos del servidor» descomprimen con `bsdtar` (en Linux, paquete `libarchive-tools`);
sin él comprueban el zip sin descomprimirlo.

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

### Licencia

Desde el 20 nov 2026 kywai **no es de código abierto**: el código vive en repositorios privados y lo público es solo el
escaparate `Yiku21/kywai` (web y Releases). Se publica con una **licencia de uso propia** (archivo `LICENSE` en la raíz
y `"license": "SEE LICENSE IN LICENSE"` en `package.json`): cualquiera puede usar kywai gratis, en tantos equipos como
quiera, pero no copiarlo, repartirlo, modificarlo, descompilarlo ni revenderlo. Las versiones del 19 y 20 nov 2026
salieron con la FSL-1.1-ALv2 y las anteriores con MIT; quien ya las tenga conserva esos derechos. La licencia no da
derecho a usar la marca kywai. Cada README lo dice en su sección final, y la web en el pie y en los términos.
