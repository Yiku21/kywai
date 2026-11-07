# Manual de AI Cowork

Todo lo que hace AI Cowork, en detalle. Para una presentación rápida, ver el [README](../README.md).

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
  - [Lo que sabe el coordinador de AI Cowork](#lo-que-sabe-el-coordinador-de-ai-cowork)
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
  - [El modelo de Hermes (/model)](#el-modelo-de-hermes-model)
  - [Muse (Meta)](#muse-meta)
- **[Proyectos, memoria y consumo](#proyectos-memoria-y-consumo)**
  - [Memoria e instrucciones del proyecto](#memoria-e-instrucciones-del-proyecto)
  - [AGENTS.md, habilidades y herramientas de AI Cowork](#agentsmd-habilidades-y-herramientas-de-ai-cowork)
  - [Rutinas: peticiones que se lanzan solas](#rutinas-peticiones-que-se-lanzan-solas)
  - [Limpiar el chat](#limpiar-el-chat)
  - [Eliminar un proyecto](#eliminar-un-proyecto)
  - [Cuotas](#cuotas)
  - [Consumo: ¿compensa?](#consumo-compensa)
  - [Cómo rinde cada agente](#cómo-rinde-cada-agente)
  - [Dónde se guardan las cosas](#dónde-se-guardan-las-cosas)
- **[Comodidades](#comodidades)**
  - [Idioma](#idioma)
  - [Temas](#temas)
  - [Voces de los agentes](#voces-de-los-agentes)
  - [Música (como YouTube Music)](#música-como-youtube-music)
  - [Modo Demo](#modo-demo)
  - [Rendimiento](#rendimiento)
  - [Apoyar AI Cowork (donaciones)](#apoyar-ai-cowork-donaciones)
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

#### Descargar la versión lista (GitHub Releases)

Con cada cambio en master del repositorio público, `.github/workflows/publicar-escritorio.yml` compila el instalador
de Windows (`.exe`), el de macOS (`.dmg` y `.zip`, Apple silicon e Intel) y el AppImage de Linux (x64 y ARM) y los
sube a una Release nueva, `v0.1.<número de commits>`, en https://github.com/Yiku21/Ai-cowork/releases/latest.

- **Se actualiza sola.** Esas versiones traen `app-update.yml` y, al abrirse (y cada 6 horas), buscan la última
  Release (`src/main/updater.ts`). En Windows y en el AppImage la descargan y, si llega en los primeros 5 minutos
  desde que se abrió, la instalan y la app se reabre sola; si llega más tarde, se instala al cerrar. En el Mac, como
  no va firmada por Apple, no puede reemplazarse sola: avisa con «Descargar» y abre la página de la Release.
- **«Buscar actualizaciones…»** en esas versiones no usa git: dice que se actualiza sola y lanza la comprobación.
- **Sin firma de código:** Windows avisa con SmartScreen («Más información» → «Ejecutar de todas formas»). En el Mac
  va firmada «ad hoc»: la primera vez, clic derecho → Abrir; si dice que está dañada,
  `xattr -cr "/Applications/AI Cowork.app"`.
- Las compiladas en el propio equipo (`instalar-mac.sh`, `instalar-linux.sh`, `npm run dist:*`) no traen
  `app-update.yml` y siguen actualizándose desde su clon de git. Es lo que usa el servidor (Mac mini).
- El workflow solo corre en el repositorio público; en ai-cowork-original no hace nada.

Al abrir la app instalada por primera vez aparece el **asistente de configuración** (también desde
⋮ → «Configurar agentes…»):

1. **Agentes**: eliges cuáles usar (Hermes, Claude, Codex, Gemini, Muse y el agente local con LM Studio u Ollama).
2. **Programas**: comprueba si están sus CLIs y, si falta alguno, lo instala desde ahí con su instalador
   oficial (y Node.js si hace falta). En Mac conviene tener [Homebrew](https://brew.sh).
3. **Sesiones**: abre el inicio de sesión oficial de cada CLI en una ventana aparte (normalmente en el
   navegador) y comprueba que quedó hecho. AI Cowork no ve ni guarda contraseñas; para Gemini también puedes
   pegar una clave de API de Google AI Studio. Una sesión ya conectada lleva un lápiz para **cambiarla**
   (otra cuenta, otra clave o, en Hermes, otro proveedor): abre el mismo inicio de sesión y, al volver a la app,
   se comprueba y enseña la nueva. En Gemini, dentro se cambia de cuenta con `/auth`.
4. **Listo**: resumen de lo que queda pendiente.

Los datos de cada equipo (configuración y proyectos) se guardan en la carpeta de datos del usuario
(`%APPDATA%\AI Cowork` en Windows, `~/Library/Application Support/AI Cowork` en Mac, `~/.config/AI Cowork` en Linux).

#### Windows

```bash
npm run dist:win
```

Genera `release/AI-Cowork-Setup-<versión>.exe`. Cópialo al otro PC y ejecútalo: te deja elegir la carpeta de
instalación y crea los accesos directos. Como no está firmado, Windows puede avisar («Windows protegió tu PC»):
«Más información» → «Ejecutar de todas formas».

#### Mac (se compila en el propio Mac)

```bash
npm run fuente
```

Genera `release/AI-Cowork-fuente.zip` con el código. Llévalo al Mac, descomprímelo y, en Terminal, dentro de esa
carpeta:

```bash
bash scripts/instalar-mac.sh
```

Pregunta dónde instalar (por defecto `/Applications`), compila la app para ese Mac (chip Apple o Intel), la
copia y la abre. Necesita Node.js (lo instala con Homebrew si está).

**Firma en Mac.** Sin certificado de Apple, `scripts/firmar-mac.sh` firma la app con un certificado propio de ese
Mac, «AI Cowork (este Mac)», que crea la primera vez en un llavero aparte
(`~/Library/Application Support/AI Cowork/firma-local.keychain-db`, con su contraseña aleatoria al lado), sin
ventanas. Lo usan la instalación y cada actualización. Así macOS reconoce la app como la misma entre versiones y no
olvida sus permisos de Privacidad (Acceso total al disco, Automatización…) ni vuelve a preguntar por el llavero.
Si algo falla, firma «ad hoc» como antes y avisa. Al pasar de la firma ad hoc a esta, macOS pide los permisos una
última vez.

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
- «Abrir AI Cowork al iniciar sesión» crea `~/.config/autostart/ai-cowork.desktop`.
- «Buscar actualizaciones» compila para Linux y cambia la carpeta instalada (`scripts/actualizar-linux.sh`).
- También se puede generar una AppImage con `npm run dist:linux` (`release/AI-Cowork-<versión>-<arch>.AppImage`);
  esa no se actualiza sola.
- Tailscale se busca en `/usr/bin/tailscale` o `/usr/local/bin/tailscale`.

### Abrir la app (este equipo, versión de desarrollo)

Usa el acceso directo **AI Cowork** del Escritorio o del menú Inicio. Si el código cambió desde la última vez
(porque lo editaste tú o tus agentes), primero verás «Actualizando AI Cowork…» unos segundos y luego se abre.

Para volver a crear los accesos directos: `npm run accesos`. Para regenerar el icono: `npm run icono`.

### Actualizar y reiniciar

- **⋮ → «Buscar actualizaciones…»** compara con GitHub y, si hay cambios, los descarga, instala lo que haga
  falta, compila y reinicia. Si el código de ese equipo tiene cambios hechos allí (por ejemplo, por tus agentes),
  aparece **«Apartar cambios y actualizar»**: se guardan con `git stash` (no se borran; `git stash list` en la
  carpeta del código) y se actualiza. Si alguien hizo commits en ese equipo que no están en GitHub, también se
  apartan, en una rama `apartado/<fecha>`, y el código vuelve a ser el de GitHub. Y si el código descargado es
  más nuevo que la app instalada (por ejemplo, porque se subió desde ese mismo equipo sin recompilar), ofrece
  instalarlo: la app sabe con qué commit se compiló.
- **Desde Órbita**: Más → Ajustes → **Servidor** hace lo mismo en el servidor al que está emparejada. Al abrir
  Ajustes ya dice si hay cambios nuevos en GitHub (con los últimos títulos); «Actualizar el servidor» (pide
  confirmación) lo descarga, compila, instala y reinicia. Mientras tanto Órbita se queda sin conexión unos minutos y
  se reconecta sola; lo que estuviera trabajando queda en pausa para reanudarlo. Si el servidor tiene cambios hechos
  allí, el botón es «Apartar sus cambios y actualizar» (igual que arriba: se guardan en git, no se borran). Si la
  actualización falla, el servidor vuelve a su versión y «Ver cómo va» o la próxima consulta dicen por qué. El
  servidor tiene que tener ya esta función: la primera vez se actualiza desde el ordenador.
- **⋮ → «Reiniciar AI Cowork»** (pulsa dos veces para confirmar) cierra y vuelve a abrir la app si se queda
  pillada; también desde el navegador del móvil, que se recarga solo cuando vuelve. Si la app está cerrada del
  todo, no hay nada que responda al enlace: hay que abrirla en el equipo.

### Acceso desde el móvil o el portátil (Tailscale)

Un equipo con AI Cowork abierto (por ejemplo el Mac mini, encendido 24/7) puede servir la app a tus otros
dispositivos de Tailscale:

1. En ese equipo: ⋮ → «Acceso desde otros dispositivos…» → activa «Permitir el acceso por Tailscale».
2. Copia el **enlace de acceso** (`http://<ip-de-tailscale>:8787/?t=<código>`) y ábrelo una vez en el móvil o
   el portátil con Tailscale activo. Queda recordado; el código es tu llave (puedes cambiarlo y anular los
   enlaces anteriores).
3. Para que esté siempre disponible: activa «Abrir AI Cowork al iniciar sesión» y evita que el Mac se duerma
   (Ajustes del Sistema → Energía). Mientras el acceso está activo, AI Cowork no se suspende.
4. Para dictar notas de voz desde otro dispositivo hace falta la versión `https://` (ver «Dictado por voz»):
   AI Cowork la sirve siempre en el puerto siguiente (`https://<ip-de-tailscale>:8788`) con un certificado
   propio, y opcionalmente con Tailscale Serve («HTTPS para usar el micrófono desde el móvil»), que no da aviso.

**App del móvil (Android):** se empareja una vez con el código de 6 cifras de ese menú (o el código de acceso
entero) y queda emparejada para siempre, aunque AI Cowork se reinicie o se actualice (la clave que firma su
acceso se guarda en `mobile-key`, en la carpeta de datos de la app). Para desemparejar todos los móviles, genera
un código de acceso nuevo.

En el chat de la app (y en «Nueva tarea») el micrófono graba **notas de voz**: el móvil las envía al ordenador
por Tailscale y este las pasa a texto con su propio dictado (Whisper, igual que el escritorio: sin servicios
externos y el audio se borra). Al terminar se elige revisar el texto antes de enviarlo o enviarlo directamente.

**Actualizar la app del móvil:** Más → Ajustes → **Órbita** → «Buscar actualizaciones». Al abrir Ajustes ya
dice si hay una versión nueva; «Instalar la versión …» la descarga del ordenador (por Tailscale, solo a móviles
emparejados), comprueba que es exactamente la anunciada y la instala encima: sigue emparejada. La primera vez
Android pide permitir que Órbita instale apps («Permitir de esta fuente»); después se instala sola, sin
preguntar. Órbita se cierra al instalarse: vuelve a abrirla. La versión sale del código de AI Cowork
(`android/release/`, publicada con `./gradlew :app:publishOrbita` y firmada con la clave de siempre), así que
basta con actualizar AI Cowork en el ordenador (⋮ → «Buscar actualizaciones…») para que el móvil la vea. Solo
hay que instalar la APK a mano una vez: la primera versión que trae este botón.

**La APK se publica sola desde GitHub.** Cada vez que cambia el código de Órbita en `master`, GitHub Actions
(«Publicar Órbita», `.github/workflows/publicar-orbita.yml`) pasa las pruebas de Android, compila la app firmada con
la clave de siempre, comprueba que el certificado es el mismo de la versión anterior (si no, se para: el móvil no la
instalaría encima) y sube `android/release/` a `master`. Así da igual desde dónde se haga el cambio (PC, Mac mini o
la nube): al actualizar el servidor, el móvil ya la encuentra. Si falla, la pestaña **Actions** del repositorio dice
por qué; «Run workflow» la vuelve a lanzar a mano. El número de versión son los commits del repositorio y nunca baja
de la versión ya publicada + 1.

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

Con el móvil plegado (pantalla exterior), las flechas de arriba a la derecha de un panel lo ponen **a pantalla
completa**: sin la barra de abajo ni la de arriba, todo el sitio para el chat. Se recuerda (también al cerrar la
app) hasta que vuelvas a pulsarlas; atrás o ✕ cierran el panel. Desplegado, las flechas siguen ampliando el panel
sobre el mundo.

**Dispositivos emparejados:** en ⋮ → «Acceso desde otros dispositivos…» aparece la lista de móviles y clientes
emparejados, con cuándo se usó cada uno por última vez. **Revocar** uno lo desempareja sin tocar los demás (y corta
sus conexiones abiertas); el que lleva 90 días sin usarse deja de valer solo. Cambiar el código de acceso los revoca
todos. Un móvil emparejado antes de esta lista sigue funcionando hasta que se cambie el código.

El servidor (8787 y la versión HTTPS en 8788) escucha solo en la IP de Tailscale del equipo y en `127.0.0.1` (nunca en la red local ni en
internet) y exige el código en cada petición. Desde la web se puede chatear, ver el espacio, subir archivos y
ver resultados; elegir carpetas, instalar CLIs e iniciar sesión en ellos se hace en el propio equipo.

### Cliente de escritorio (conectar con tu AI Cowork principal)

Puedes instalar AI Cowork en otro Mac, Windows o Linux y usarlo como **cliente** de tu AI Cowork principal (el que está
siempre encendido): no ejecuta agentes ni guarda proyectos, enseña la interfaz del servidor, con sus agentes, su
chat, sus proyectos y sus archivos, desde una app instalada y no desde el navegador.

1. En el servidor: ⋮ → «Acceso desde otros dispositivos…» → activa el acceso y pulsa «Generar código de 6 cifras».
2. En el otro equipo, con **Tailscale conectado**: instala AI Cowork y ábrelo. La primera vez pregunta cómo vas a
   usarlo: elige **«Conectar con mi AI Cowork principal»**. (Un equipo que ya tenía AI Cowork como servidor no
   pregunta nada: para convertirlo en cliente, cierra la app y crea en su carpeta de datos un archivo `client.json`
   con `{"mode":"client"}`.)
3. Escribe la dirección del servidor (la IP de Tailscale o su nombre, p. ej. `100.101.102.103` o `mac-mini`; vale
   pegar el enlace de acceso entero, que ya trae el código) y el código. Se reinicia una vez y queda emparejado.

La llave de ese equipo se guarda cifrada con el llavero del sistema, es **solo suya** (aparece en la lista de
dispositivos emparejados del servidor y se revoca desde allí sin tocar los demás) y deja de valer tras 90 días sin
usarse. El cliente nunca recibe el código de acceso del servidor (ni en la configuración, ni en los avisos, ni en el
enlace a la versión HTTPS), así que al revocarlo se queda fuera de verdad. La interfaz siempre es la del servidor, así que cliente y servidor nunca quedan desfasados. Si el servidor
no responde, el cliente lo dice y reintenta solo; si ya no lo reconoce, vuelve a pedir un código. La ventana no lleva barra de
menús: en el menú ⋮, al final, están **Recargar la interfaz** (también Ctrl+R o F5), **Cambiar de servidor…** y
**Olvidar este dispositivo y desconectar**.

**Para no confundir un equipo con otro**, la primera fila del menú ⋮ dice dónde estás: **Este equipo es el
servidor** (cian, con su nombre), **Cliente de escritorio → nombre-del-servidor** (violeta) o **Navegador**, con la
explicación de dónde están los agentes y los proyectos. En el cliente, además, una franja violeta fina recorre lo alto
de la ventana. El título de la ventana del cliente también lleva el nombre del servidor.

#### Archivos del servidor

En el cliente (y en el navegador), ⋮ → **«Archivos del servidor…»** abre un explorador del disco del equipo servidor:

- **Navegar** por sus discos, la carpeta del usuario y las carpetas de los proyectos, con las migas de pan y «subir».
- **Abrir** un archivo: en el cliente se descarga a una carpeta temporal y se abre con tu aplicación; en el navegador,
  en otra pestaña. **Descargar** un archivo, o una carpeta entera como **zip** (hasta 4 GB; no sigue enlaces
  simbólicos).
- **Elegir la carpeta de trabajo de un proyecto** desde el cliente: el botón de carpeta del selector de proyectos
  abre este mismo explorador, en vez de pedir que se haga en el servidor.

Por defecto el cliente ve **todo el disco** del servidor (eres tú desde otro sitio). Hay dos cosas más:

- **Interruptor** en ⋮ → «Acceso desde otros dispositivos…» → «Restringir los clientes a las carpetas de los
  proyectos» (apagado por defecto): con él, un cliente solo ve las carpetas de los proyectos y de sus adjuntos y
  resultados.
- **Registro de accesos** (en ese mismo panel): quién (dispositivo o navegador) vio, abrió, bajó o puso como carpeta de
  trabajo qué, cuándo y desde qué dirección, y lo que se le negó. Se guarda en `access-log.jsonl` de la carpeta de datos.

Lo que **nunca** se comparte, ni con el acceso completo: la clave de los tokens (`mobile-key`), la lista de
dispositivos, el `config.json` con el código de acceso y el certificado propio.

#### Sincronizar carpetas

En el cliente de escritorio, ⋮ → **«Sincronizar carpetas…»** mantiene una carpeta de este equipo **igual que una del
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

«Buscar actualizaciones…» del menú ⋮ actualiza el **servidor** (y con él la interfaz que ves). La app instalada en el
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
- **Instalar** (en cada cliente): al abrirse y cada 6 horas pregunta si hay una versión más nueva; también desde ⋮ →
  **«Actualizar este equipo…»** (primero busca; si la hay, un segundo toque la descarga del servidor, la instala y
  reinicia). El emparejamiento se mantiene.

Hoy es solo para clientes Windows; en el Mac el cliente se actualiza con `scripts/actualizar-mac.sh` y en Linux con
`scripts/actualizar-linux.sh`. Un cliente
instalado antes de este sistema hay que cambiarlo una vez a mano.

### Dictado por voz

El botón del micrófono, junto a los de adjuntar, graba una nota de voz y la convierte en texto **en el propio
equipo** con Whisper (faster-whisper, modelo «small», en español): sin APIs ni servicios externos, y el audio se
borra al terminar. El texto se añade al cuadro para revisarlo antes de enviarlo. La primera vez se prepara solo
(instala `uv` si falta y descarga el modelo, ~480 MB) y tarda unos minutos; después, unos segundos por nota.
En macOS pide permiso para el micrófono. Desde otro dispositivo, el navegador solo deja usar el micrófono en
páginas **HTTPS**. Si entras por el enlace `http://`, al tocar el micrófono aparece **«Abrir la versión segura»**:

- Sin hacer nada más, lleva a `https://<ip>:8788`, la versión HTTPS que AI Cowork sirve con su **certificado
  propio** (se crea solo, en `web-cert/` dentro de la carpeta de datos, para las IPs y el nombre del equipo). La
  primera vez el navegador avisa de que la conexión no es privada, porque ese certificado no lo firma ninguna
  autoridad: pulsa «Configuración avanzada» → «Continuar» (en iPhone, «Mostrar detalles» → «visitar este sitio
  web»). Después ya deja grabar. Guarda ese enlace en el móvil.
- Si en el Mac activas «HTTPS para usar el micrófono desde el móvil» (⋮ → «Acceso desde otros dispositivos…»),
  lo publica Tailscale Serve en `https://<equipo>.<red>.ts.net` con un certificado válido, sin aviso, y el botón
  lleva ahí.

## Cómo trabaja el equipo

### Tu equipo: añadir, quitar y elegir quién coordina

AI Cowork no es solo para los agentes de fábrica: es una plataforma donde conectas **los agentes que ya pagas**. En
⋮ → «Configurar agentes…» (paso «Agentes»):

- **Añadir un agente**: «Añadir un agente» abre el catálogo con los que se pueden conectar (Aider, **DeepSeek**, OpenCode,
  GitHub Copilot CLI, Cursor, Amp, Goose, Kimi Code, Mistral Vibe, Grok Build, Cline, Continue, OpenHands, Factory Droid,
  Auggie, Junie, Crush, Open Interpreter, gptme, Letta Code, ForgeCode, OpenClaw, Kiro, **Qwen Code**, **Antigravity CLI**,
  **Rovo Dev**, **MiniMax Code**, **Qoder CLI**… y los de fábrica que hayas
  quitado), con la cuenta o suscripción con la que funciona cada uno. Elige uno y se añade con su robot y su estación en el
  espacio digital. **«Otro programa…»** conecta cualquiera: el comando, cómo recibe el encargo (por stdin, en un
  archivo o como argumento) y sus argumentos.
- **Quitar un agente**: «Quitar» (se pulsa dos veces) lo saca del equipo y de la lista de quienes pueden coordinar; el
  de fábrica no vuelve a aparecer al actualizar, y se puede añadir otra vez desde el catálogo. Siempre tiene que
  quedar al menos uno que trabaje.
- **Elegir quién coordina**: «Hacer coordinador» en cualquier agente elegido (no hace falta Hermes: puede planificar
  y repartir Codex, Claude o el que quieras). Si el coordinador no está disponible, planifica el siguiente.
- **Instalar e iniciar sesión**: los pasos «Programas» y «Sesiones» del asistente instalan cada agente con su
  instalador oficial y abren su inicio de sesión, igual que con los de fábrica.

Cómo trabaja un agente de catálogo: AI Cowork lo lanza en la carpeta del proyecto, con la sesión que ya tengas
iniciada en su programa (tu suscripción), le entrega el encargo por stdin o por un archivo (el texto nunca va en la
línea de órdenes) y recoge lo que responde. **DeepSeek** no tiene programa de terminal ni suscripción propios (es un modelo con clave de API, de pago por uso):
se conecta a través de Aider con el modelo de DeepSeek fijado. Los agentes que funcionan con una **clave de API**
(DeepSeek, Kiro, Junie, Factory Droid, Amp) piden la clave en el paso «Sesiones»: se guarda cifrada con el llavero del
sistema, solo en el equipo servidor (nunca por el acceso web ni por el móvil), y se pasa únicamente al programa de ese
agente. Kiro también vale sin clave si ya iniciaste sesión con «kiro-cli login» (se comprueba con `kiro-cli whoami`).

Los añadidos en octubre de 2026, con lo que hay que saber de cada uno:

- **Qwen Code** (`qwen`): su acceso gratuito con la cuenta de Qwen cerró en abril de 2026. Ahora funciona con el
  **Qwen Coding Plan** de Alibaba Cloud (clave del plan y endpoint `https://coding.dashscope.aliyuncs.com/v1`, o
  `coding-intl` fuera de China) u otro proveedor: «Iniciar sesión» abre `qwen`, y dentro se elige con `/auth`. Es
  distinto del agente local «Qwen» de Ollama. Al planificar va en modo `plan`; en el proyecto, `auto-edit`; con acceso
  completo, `yolo`.
- **Antigravity CLI** (`agy`, de Google): sustituye a Gemini CLI en las cuentas de Google AI Pro y Ultra. La sesión se
  inicia con Google la primera vez que se abre `agy`. Sin acceso completo no puede editar (en modo sin pantalla deniega
  lo que pediría permiso) y la versión 1.0.6 falla con `-p` sin terminal: actualízalo. Ojo: sus condiciones adicionales
  prohíben acceder al servicio con software de terceros y Google no ha aclarado si eso incluye lanzarlo así.
- **Rovo Dev** (Atlassian): va dentro de la CLI de Atlassian (`acli rovodev run`), con tu cuenta de Atlassian y
  `acli rovodev auth login`. Con acceso completo, `--yolo`.
- **MiniMax Code** (`mcode exec`, encargo por stdin): necesita Node.js 22.19 o superior; «Iniciar sesión» usa una
  cuenta internacional (`mcode login --region global`). Con acceso completo, `--permission full`.
- **Qoder CLI**: se lanza como `qodercli -p` (el comando `qoder` reparte entre la CLI y el editor), con la sesión de
  `qodercli login` o un token `QODER_PERSONAL_ACCESS_TOKEN`. Planifica en modo `plan`, edita con `accept_edits` y con
  acceso completo va con `--yolo`.

Ninguno de los de catálogo retoma su sesión anterior en una continuación (eso solo lo hacen Claude y Codex): aunque
sus programas tengan `--continue` o `--resume`, AI Cowork les da cada encargo con el contexto completo. Un agente que
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
- **La calidad manda**: el coordinador busca el mejor resultado posible y que cumpla exactamente lo pedido; el
  tiempo y el gasto son secundarios (así está escrito en sus reglas, y es el comportamiento por defecto, sin
  interruptor). Elige para cada parte al agente y la dificultad que den el mejor resultado, y en la duda sube la
  dificultad. Un trabajo pequeño o muy enlazado va entero a un agente, que lo hace y lo prueba. Uno grande con partes separables
  (motor, interfaz, servidor…) se reparte **en paralelo** entre los agentes más adecuados, con un **contrato común**
  que escribe el coordinador (qué archivos son de cada uno y cómo se comunican las partes), y al final una tarea
  «Integrar y probar» que ejecuta las pruebas y comprueba el conjunto contra lo pedido. Solo reparte si se cumplen
  las tres condiciones: cada parte tiene trabajo de sobra, las partes van en archivos distintos sin estado compartido
  y la interfaz entre ellas se puede fijar de antemano; si falta alguna, una sola tarea (dividir trabajo acoplado lo
  empeora). Y nunca reparte una **continuación** («no funciona…», «ahora añade…»): va entera al mismo agente que
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
  da lo nuevo a los agentes libres, que empiezan ya, y evita esos archivos (lo que toque a un agente ocupado espera a
  que termine). Aun así, si dos tareas coinciden en el tiempo, la segunda trabaja en una copia aparte que se integra al
  terminar (ver «Cambios de cada tarea»). Como mucho trabajan 3 tareas a la vez. Con varias peticiones en marcha, «Detener» deja elegir cuál
  (o todas).
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
- **Gemini CLI** está configurado con una clave de API: si esa clave tiene facturación activa, su uso puede tener coste.
- **Agente local**: se configura desde el indicador **Local** de la cabecera → «Agente local». Puedes elegir
  **LM Studio** u **Ollama**, el modelo, el nombre del agente y si su uso es sin límite. Con Ollama se pueden
  descargar modelos desde ahí mismo; con LM Studio se descargan en su aplicación y AI Cowork puede encender su
  servidor local. Ahora mismo está configurado como **Gemma** (Gemma 4 12B QAT en LM Studio).
- **El agente local trabaja con herramientas** (solo con LM Studio): lista, busca, lee, crea y edita archivos de la
  carpeta del proyecto, busca en internet y lee páginas web (nunca direcciones de tu red local). Si LM Studio tiene
  el modelo cargado con poco contexto, la app lo recarga con 32 k tokens la primera vez (tarda unos segundos).
  Cada respuesta del modelo se espera el tiempo que haga falta (un modelo local que razona mucho puede tardar más de
  5 minutos en una sola respuesta); solo se dice «Servidor de LM Studio apagado» cuando LM Studio rechaza la conexión.
  Si la corta a mitad, la tarea dice «LM Studio cortó la respuesta» con el motivo.
- **LM Studio se enciende solo**: si su servidor está apagado, AI Cowork lo enciende (con `lms server start`) al
  arrancar, al pulsar ⟳ en las cuotas (o pedir /cuota) y, si se apagó entre medias, antes de que el agente local
  empiece una tarea; y deja el modelo cargándose
  con 32 k de contexto. La comprobación automática de cada 30 s no lo enciende, para respetar que lo apagues a mano.
  Si aun así sale «No disponible: Servidor de LM Studio apagado», la tarjeta del agente (clic en su robot) tiene el
  botón **Encender LM Studio**: enciende el servidor, carga el modelo y deja el agente disponible. Si no puede, dice
  por qué (por ejemplo, que LM Studio no está instalado).
- **Permisos de los agentes** (menú ⋮ → «Acceso completo para los agentes», activado por defecto): Claude, Codex y
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
  proyecto. Si en 4 segundos no lo consigue es que macOS está preguntando en la pantalla del Mac (p. ej. «AI Cowork
  quiere acceder a Documentos»): la tarea lo dice enseguida («Esperando a que aceptes en la pantalla del Mac…») y
  espera la respuesta en vez de lanzar al agente a ciegas; si macOS lo deniega, la tarea dice dónde activarlo. Además
  la app lee en directo el registro de privacidad de macOS y avisa de cada ventana que ella o sus agentes dejan
  pendiente (Documentos, Descargas, micrófono…), también las que salen a mitad de una tarea, para mandarlas al móvil.
  Nadie puede pulsar «Permitir» por programa (lo impide macOS): hay que contestarla delante del Mac o por Compartir
  pantalla. Código: `src/main/macPermissions.ts` (la comprobación la hace `runCli` en `agents/spawn.ts`).
- **Permisos de macOS en el servidor**: los agentes heredan los permisos de la app. Para que nunca se queden
  esperando una ventana que solo se contesta delante del Mac, en Ajustes del Sistema → Privacidad y seguridad activa
  para «AI Cowork» (y para Terminal, si lanzas cosas desde ahí): **Acceso total al disco** (Escritorio, Documentos,
  Descargas, iCloud y discos externos) y, solo si quieres que los agentes manejen otras apps, **Automatización** y
  **Accesibilidad**. La primera vez que salga el aviso del llavero, pulsa «Permitir siempre». La app trae los textos
  que macOS pide para mostrar esas ventanas, y se firma con un certificado propio de este Mac (ver «Firma en Mac»)
  para que los permisos no se pierdan al actualizar. Riesgo: un agente que se equivoque, o un texto malicioso que lea
  en una web, puede tocar cualquier archivo del Mac sin que nadie lo pare.
- **Si un agente no puede con una tarea** (error o «BLOQUEADA»), la intenta otro una vez antes de darla por fallida:
  un becario se la devuelve a su jefe y, si no, pasa al compañero más adecuado. Si la tarea no es fácil, el relevo
  nunca es el modelo local (es lento y ligero): va a otro agente fuerte y, si no hay ninguno libre, el mensaje lo dice
  en vez de pasársela a quien casi seguro también fallará. Para elegirlo cuentan las fortalezas y «lo que conviene no
  darle» de cada agente solo hasta los dos puntos o el paréntesis (la explicación de después nombra a otros agentes y
  sumaba o restaba por casualidad). Un agente sin cuota o con la sesión
  caducada queda apartado un rato (15 y 3 minutos) y después se vuelve a probar.
- **Codex** en modo protegido usa el entorno estándar de Windows (`windows.sandbox=unelevated`): el «elevated» que
  configura la app de escritorio de Codex no funciona fuera de ella y le impedía ejecutar comandos.
- **Pegar imágenes**: Ctrl+V en el cuadro de texto adjunta las capturas del portapapeles.

**Cuánto se espera a Hermes.** Un plan normal le lleva entre 20 y 60 segundos, y uno grande, más de 2 minutos solo
en escribirse. Como Hermes no enseña nada hasta terminar, AI Cowork le espera hasta 6 minutos y después planifica el
siguiente coordinador. Se le piden planes escuetos (cada tarea en 2 a 6 frases, sin repetir la petición, que los
agentes ya reciben completa), así que se escriben antes.

### Lo que sabe el coordinador de AI Cowork

En cada petición, el coordinador recibe una guía de cómo funciona AI Cowork
([src/main/coordinatorGuide.ts](../src/main/coordinatorGuide.ts)), con datos del momento, para reaccionar bien:

- **Cambios en AI Cowork en sí** (su música, su interfaz, sus funciones): no son trabajo del equipo, que solo
  trabaja en la carpeta del proyecto. Lo explica en vez de lanzar tareas. Sabe en qué carpeta está el código de
  AI Cowork en ese equipo: ninguna tarea debe tocarlo (los cambios locales bloquean las actualizaciones), y si la
  carpeta del proyecto es ese código, avisa antes de tocar nada.
- **Capturas adjuntas**: Hermes solo lee texto, así que si tu mensaje lleva imágenes planifica y responde quien
  puede verlas (Claude; si no está, Codex o Gemini). Si solo queda Hermes, encarga a Claude o Codex que las miren
  en vez de pedirte que se las describas.
- **Imágenes**: solo las genera Codex. Gemini también puede, pero no alcanzan la calidad necesaria.
- **Lo que nadie puede hacer**: audio, música, voz o vídeo de verdad (lo más cercano es código que lo genere).
  Los modelos locales son lentos y flojos investigando o creando: si se piden, avisa de qué saldrá.
- **Instalar y usar internet**: sabe si está activado «Acceso completo para los agentes». Sin él, no lanza lo que
  necesita instalar (una APK necesita el SDK de Android, Java y Gradle) y pide que se active antes.
- **Ficha automática del proyecto**: en cada planificación recibe una ficha de la carpeta que AI Cowork hace sin
  llamar a ningún modelo: el principio del README, con qué se construye y se prueba (`package.json` y otros
  manifiestos, el comando de pruebas detectado), qué archivos se tocaron en los últimos días y el árbol de carpetas
  (hasta 150 entradas, sin `node_modules`, compilados ni datos de la app). Así el plan y el contrato no salen de
  suposiciones aunque el coordinador no pueda abrir archivos.
- **Preguntas sobre el proyecto**: Hermes no puede leer los archivos, así que las preguntas que dependen del código
  («¿qué me recomiendas para…?», «¿por qué falla…?») no las contesta de memoria: crea una tarea de texto para Claude
  o Codex, que sí los leen, y responde él. Hermes contesta directamente solo la charla y las dudas sobre AI Cowork.
- **Peticiones ambiguas**: si no está claro sobre qué trabajar y equivocarse tiraría un trabajo largo (¿la app del
  proyecto o AI Cowork?), pregunta antes.
- **Funciones de AI Cowork**: para responder dudas (acceso desde el móvil y sus direcciones, micrófono, órdenes
  del chat, memoria, consumo…) sin crear tareas. Esta lista (unos 5 000 caracteres) solo se le envía cuando tu
  petición o tus últimos mensajes hablan de AI Cowork (la app, el móvil, Hermes, las cuotas, los temas…); en una
  petición de trabajo normal se omite para que el coordinador se concentre en lo que pides.
- **Agentes con muy poca cuota** (como Muse): solo les da lo que los demás no pueden hacer o trabajo cuando los
  demás están sin cuota.
- **Tu visto bueno**: sabe que revisarás su plan antes de empezar, así que en su respuesta cuenta qué ha entendido,
  qué hará cada agente y por qué ese, y lo que da por supuesto (para que lo corrijas). Si le pides cambios, recibe
  su plan anterior y tu respuesta.

Cada tarea recibe además dos reglas: no entregar audio o imágenes de mentira y no tocar el código de AI Cowork.
Para normas de un proyecto concreto, usa sus instrucciones (pestaña Memoria).

### Tu visto bueno a cada plan

Antes de que nadie empiece, Hermes (o el coordinador que planifique) te enseña su plan en el chat: qué ha
entendido, cada tarea con el agente que la hará y por qué ese, y si AI Cowork lo ha ajustado (por ejemplo, juntar
«diseñar» con «construir»). Toca una tarea para ver sus instrucciones. Entonces:

- **«Aprobar y empezar»** (o responder solo «sí», «ok, adelante»…) crea las tareas y el equipo se pone en marcha.
- **Escribirle qué cambiar** («mejor que lo haga Codex», «sin la investigación») hace que replanifique con su plan
  anterior y tu respuesta; el anterior queda plegado como «Plan cambiado por tu respuesta».
- **«Descartar»** no hace nada.

El plan queda guardado en su mensaje: se puede aprobar aunque AI Cowork se haya reiniciado entre medias. Lo que
dijiste que conviene recordar se anota en la memoria al aprobarlo. Las preguntas y respuestas directas no
necesitan visto bueno. Para que las tareas empiecen sin esperar, desactiva ⋮ → «Pedir mi visto bueno a cada
plan» (también en la app del móvil: Ajustes o Herramientas → Planes de Hermes).

### «Te necesita»: lo que espera una decisión tuya

La campana de la cabecera (y la de Órbita, que además avisa con una notificación del móvil mientras sigue
conectada) junta en un solo sitio lo que está esperando por ti, con sus botones:

- **Un plan** pendiente de tu visto bueno: «Aprobar» o «Descartar» sin ir al chat.
- **Un permiso de macOS** (Documentos, Escritorio…) que solo se acepta delante del servidor: «Abrir Compartir
  pantalla» lo abre desde el móvil o el portátil. Para que no vuelva a pasar, da «Acceso total al disco» a AI Cowork.
- **Un agente callado** desde hace rato (suele ser un aviso así en la pantalla del servidor).
- **Una pregunta** del equipo, una **verificación** que sigue viendo fallos, **choques** al integrar una copia
  aparte o una tarea que **no se pudo hacer** («Deshacer» deja sus archivos como estaban).
- **Lo terminado**: la última petición acabada de cada proyecto, para enterarte desde el móvil.

Tocar el título lleva a su proyecto. Los avisos se cierran solos cuando ya no hacen falta (el plan se aprueba,
la tarea termina o el agente vuelve a hablar). La lista se guarda en `inbox.json` de la carpeta de trabajo;
la API del móvil la da en `GET /inbox` y `POST /inbox/{id}/{acción}`, y avisa con el evento `inbox.updated`.

### Criterio de aceptación y archivos de cada tarea

Cada tarea que crea o cambia archivos lleva un **criterio de aceptación** («npm test pasa y la página carga sin
errores»): el agente lo comprueba antes de terminar y dice si se cumple. Cuando varias tareas trabajan a la vez,
cada una lleva además **sus archivos**: solo puede tocar esos, y si al terminar cambió archivos de otra tarea,
aparece un aviso en el chat («Codex cambió archivos que no eran de su tarea…») y en su registro de pasos. No se
deshace nada: es para que lo revises. Ambos se ven en el «Encargo» de la ventana de la tarea; el contrato común
del equipo, plegado bajo el plan en el chat.

### A dos manos: dos agentes, dos opciones y un juez

Para lo que depende del gusto (una web, una landing, una interfaz, un póster, una presentación, un logo) no hay
truco que suba el techo de calidad de forma tan segura como hacerlo dos veces y elegir. Por eso, en trabajo nuevo
de ese tipo, el coordinador lo reparte **a dos manos**: dos agentes de familias distintas (por ejemplo Codex y
Claude) hacen la misma tarea por separado, cada uno en su carpeta (`artifacts/opcion-a/` y `artifacts/opcion-b/`,
o `.ai-cowork/entregables/opcion-a/` y `opcion-b/` si el proyecto es una carpeta tuya), sin verse, y un tercero de
otra familia (Gemini, si está) abre las dos, las prueba, las compara contra tu petición en los dos órdenes (para
no favorecer a la primera que mira) y responde «GANA: A» o «GANA: B» con el porqué, qué tiene mejor la otra y qué
cambiaría de la ganadora. La respuesta final te dice dónde está cada opción y cuál recomienda; tú te quedas con
la que quieras y puedes pedir que se siga con ella.

Lo pides tú mismo con **«a dos manos»** o **«dos opciones»** en la petición (vale para cualquier cosa, no solo lo
visual: si el coordinador no lo hace, AI Cowork lo hace por él, siempre que el plan sea una sola tarea con archivos
y haya otro agente de otra familia disponible). Con **«a una mano»** o **«una sola versión»** no se hace nunca.
Tampoco en continuaciones ni correcciones. Gasta el doble, pero es lo que pediste: calidad antes que coste.

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
tu petición, la tarea, el criterio de aceptación, los archivos que cambió y lo que dijo el autor; los lee, ejecuta
las pruebas si puede y responde «VEREDICTO: CUMPLE» o «VEREDICTO: FALLOS» con hasta cinco fallos concretos. Se le
pide ceñirse a la corrección y a lo pedido, nada de gustos. Si ve fallos, **el autor corrige una vez** sobre lo que
ya hay (recibe la lista) y se vuelve a verificar; después se da por buena con el veredicto que tenga. En el chat lo
ves en el mensaje de la tarea («Claude comprobó … y vio fallos; Codex los corrige», y al final «✔ Claude comprobó el
resultado: cumple» o «⚠ … sigue viendo fallos», que además queda en la memoria como pendiente). La verificación
cuenta en «Consumo y tokens…» como «Verificar». Se salta si escribes **«sin revisión»** (o «sin verificar») en la
petición, si la tarea es solo de texto o si no hay ningún otro agente de otra familia disponible.

**Si la tarea toca una web** (HTML, CSS, componentes…), AI Cowork la abre antes en una ventana oculta, a tamaño
de escritorio (1280 px) y de móvil (390 px), con un servidor local de solo lectura y sin acceso a la red ni a tus
datos. Guarda las capturas en `.ai-cowork/verificacion/` del proyecto y apunta los errores de la consola y lo que
no cargó. El verificador (uno que vea imágenes: Claude, Codex o Gemini) recibe las capturas y esos errores, así
comprueba cómo se ve de verdad: una página en blanco, cortada o que no se puede usar en el móvil es un fallo. Se
abren las HTML que cambió la tarea o, si cambió estilos o componentes, la entrada ya compilada (`dist/`, `build/`…
o `index.html`). Lo ves en «Ver qué está haciendo» de la tarea.

### Cambios de cada tarea: verlos, deshacerlos y copias aparte

Antes de que una tarea que cambia archivos empiece, AI Cowork guarda una **instantánea** de la carpeta del proyecto,
y otra al terminar. Las guarda en un repositorio git propio (`workspace/instantaneas/<proyecto>.git`), **nunca en el
`.git` de tu proyecto**, que no se toca: funciona igual si tu carpeta es un repositorio git o no. Respeta sus
`.gitignore` y deja fuera `node_modules`, compilados (`dist`, `build`…), los datos internos y los archivos de más de
25 MB. Hace falta tener git instalado (en el Mac viene con las herramientas de Xcode); sin git todo sigue como antes,
sin deshacer.

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
entra en la ficha que ve el coordinador: a «historial en AI Cowork (30 días)» se añade «al usuario le sirvieron 7
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

**Capturas y documentos a medida que avanza.** Para ver por dónde va sin esperar al final, el chat enseña lo que
el agente va creando mientras trabaja: las **imágenes** nuevas (capturas del juego, mapas, maquetas) salen como
miniaturas en el sitio del mensaje donde ocurrieron y, al pulsarlas, se abren; los **documentos** (`.md`, `.html`,
`.pdf`) salen como fichas. Es igual en escritorio, navegador, cliente y Órbita (que además las abre a pantalla
completa). También cuentan las imágenes que el agente **abre** aunque estén fuera del proyecto (en `/tmp`, por
ejemplo): se copian a `avances/<tarea>/` dentro de la carpeta del proyecto para que el servidor pueda
enseñarlas. Para no llenar el chat solo salen imágenes de 4 KB a 25 MB, hasta 6 cada 12 segundos y 24 por
tarea (8 documentos), esperando a que el archivo termine de escribirse; no cuentan las carpetas ocultas, los
adjuntos ni los datos de la app. Se les pide que guarden dentro del proyecto las capturas que hagan.

**Copiar y pegar en Órbita.** Mantén el dedo sobre una palabra de cualquier mensaje del chat (tuyo o de un agente)
para seleccionarla; arrastra los tiradores para coger más palabras y pulsa **Copiar**. En la caja de escribir,
mantén el dedo y pulsa **Pegar**. Los botones de los mensajes se siguen pulsando igual.

### Ver qué está haciendo un agente

Pulsa la tarjeta de **«Tarea actual»** en el panel de un agente (o «Ver qué está haciendo»), o una tarea de la
pestaña **Tareas**: se abre una ventana con lo que hace, paso a paso y en directo, como en las apps de Claude
Code y Codex: lo que razona (plegado), cada comando con su salida y si salió bien, cada archivo que lee, crea o
edita (con los cambios en verde y rojo), sus búsquedas, su lista de pasos y lo que responde. También sirve para
las tareas terminadas («Tareas recientes» en el panel del agente): cada registro se guarda 30 días en `traces/`
dentro de la carpeta de datos. Funciona con Claude, Codex, Gemini, Qwen Code y los modelos locales.

### Respuesta final del coordinador

Cuando un plan de varias tareas termina, el coordinador no se limita a la lista de ✓: con todos los resultados
delante (lo que dijo cada tarea, sus archivos y el veredicto de la verificación) redacta la **respuesta a tu
petición**: qué se ha hecho y dónde está, cómo probarlo o usarlo, qué decisiones se tomaron y qué quedó fuera, falló
o conviene revisar, sin inventar nada. La lista de tareas con su ✓/✗ queda debajo y los archivos, en su carpeta
plegada. Si el coordinador está ocupado o no responde, se queda la lista de siempre.

### Entregables en una carpeta

Cuando una tarea entrega varios archivos, el chat los agrupa en **una carpeta plegada** (con su nombre, cuántos
archivos son, de qué tipo y quién los hizo) en vez de ponerlos uno detrás de otro. Al pulsarla se despliega para
abrir cada uno; en el escritorio, «Abrir carpeta» la abre en el Finder. El resumen final del trabajo junta todos
los archivos de la petición en otra carpeta. Igual en la app del móvil.

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
un agente concreto reciba tu texto **tal cual**, sin que Hermes lo lea, lo reinterprete ni lo filtre, empieza el
mensaje con su nombre:

- `@Qwen escribe un cuento corto` (también vale su id o el nombre sin espacios: `@LMStudio …`).
- `/directo Qwen escribe un cuento corto` (o `/direct`, `/dm`).

Al teclear `@` al principio del cuadro sale la lista de agentes (en el escritorio, la web y Órbita): elige uno con
las flechas e Intro o Tab (o tocándolo) y escribe el mensaje detrás. En el chat, tu mensaje sale como
«Tú → Qwen (directo, sin Hermes)».

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

Un `@` que no es el nombre de ningún agente (un correo, «@alguien») no cuenta: el mensaje va a Hermes como siempre.
`/directo` con un nombre que no existe da un error con la pista de escribir `@` para ver la lista. El agente
trabaja en la carpeta del proyecto con el mismo permiso de siempre (⋮ → «Acceso completo para los agentes»).

Para desarrolladores: las reglas están en `src/shared/directMessage.ts` (y su copia en Órbita,
`android/.../ui/orbita/DirectMention.kt`); el motor las aplica en `sendDirect` de `src/main/orchestrator.ts`
(la tarea lleva `direct: true`). La API móvil lo anuncia con `capabilities.directMessages`.

### El modelo de Hermes (`/model`)

Escribe `/model` (o `/modelo`) en el chat, o pulsa a Hermes en el espacio → **«Modelo»**: ves el que usa ahora y
la lista de modelos de cada proveedor con el que Hermes tiene sesión (como en `hermes model` en la terminal), con
buscador. Elige uno y **«Usar …»** (o doble clic): Hermes lo usa desde el próximo encargo. AI Cowork se lo pasa
en cada encargo (`-m` y `--provider`) sin tocar el `config.yaml` de Hermes; **«Volver al de Hermes»** deja el de
su configuración. Las listas salen de la caché de Hermes, sin llamadas de pago: para actualizarlas, ejecuta
`hermes model --refresh` en la terminal del equipo donde corre AI Cowork (el Mac).
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
- **Solo con la suscripción**: AI Cowork le oculta `META_API_KEY` y no fuerza el modelo, así que usa la sesión de
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
proyecto. El coordinador y cada agente la leen en cada encargo, así que sobrevive a «Limpiar el chat» y a los
reinicios:

- **Instrucciones para los agentes**: normas tuyas que todos siguen siempre (cómo probar, estilo, qué no tocar…).
- **Memoria**: decisiones, preferencias, hechos y pendientes, cada uno con quién lo aportó (tú o qué agente, en
  qué tarea), cuándo y su estado:
  - **Confirmado**: lo dijiste tú. El coordinador anota lo que decides o prefieres en tus mensajes («todo en
    TypeScript»); también puedes añadirlo en la pestaña o escribir `/recuerda …` en el chat (admite
    `/recuerda decisión: …`, `pendiente: …`, `preferencia: …`).
  - **Provisional**: lo anotó un agente al terminar su tarea (sección «Para la memoria» de su respuesta). Los
    agentes lo tienen en cuenta pero lo comprueban. Confírmalo, edítalo o bórralo; la pestaña avisa de cuántos
    hay por revisar.
  - **Sustituido**: una entrada más nueva la reemplaza («sustituye m3») o la marcaste como que ya no vale. Los
    agentes dejan de verla; sigue en «Ver lo sustituido». Un agente no puede sustituir lo que confirmaste tú:
    su nota queda como propuesta.

Se guarda en el `project.json` del proyecto.

### AGENTS.md, habilidades y herramientas de AI Cowork

**Instrucciones del repositorio.** Cada CLI lee por su cuenta solo su archivo (Claude, `CLAUDE.md`; Codex,
`AGENTS.md`; Gemini, `GEMINI.md`). AI Cowork añade al encargo de cada tarea los que ese CLI no lee, así que basta
con un `AGENTS.md` en la carpeta del proyecto para que todo el equipo siga las mismas reglas. Si dos archivos
dicen lo mismo (o `CLAUDE.md` solo contiene `@AGENTS.md`), se pone una vez. Se recortan a 6 000 caracteres.

**Habilidades compartidas.** Procedimientos que el equipo reutiliza («cómo publicamos una versión», «informes en
tres niveles»…). Van en la carpeta `habilidades` de la carpeta de trabajo de AI Cowork: una carpeta por habilidad
con su `SKILL.md` (el mismo formato que las skills de Claude: `name` y `description` en el encabezado y los pasos
debajo) o un `.md` suelto. Puedes copiar ahí las de `~/.claude/skills`. El encargo de cada tarea lista su nombre y
para qué sirven, y el agente lee la que encaje.

**Herramientas de AI Cowork (servidor MCP).** Claude trabaja con un servidor MCP propio de AI Cowork
(solo ese: nunca los tuyos) con cinco herramientas: `memoria_proyecto` (instrucciones y memoria al día),
`anotar_memoria` (queda provisional, como «Para la memoria»), `estado_equipo` (qué hacen ahora los compañeros,
para no pisarlos), `preguntar_usuario` (deja la pregunta en «Te necesita» y el agente sigue con lo razonable; como
mucho tres por tarea) y `leer_habilidad`. El servidor solo escucha en 127.0.0.1 y cada tarea lleva su propio
token, que se anula al terminar. El script lo escribe la app en `mcp/ai-cowork-mcp.cjs` de la carpeta de trabajo
y lo ejecuta el propio AI Cowork como Node; la configuración de cada tarea va en un archivo `mcp/tarea-….json`
que se borra al terminar. Codex, Gemini y los agentes de catálogo no lo reciben (no se les puede pasar esa
configuración por la línea de comandos) y siguen con lo que trae el encargo.

### Rutinas: peticiones que se lanzan solas

Como AI Cowork corre 24/7 en el servidor, cada proyecto puede tener **rutinas**: una petición que se envía sola al
chat, igual que si la escribieras tú (pasa por el plan del coordinador, los agentes y la verificación). En el chat
aparece con «**Rutina: <nombre>**» en lugar de «Tú». Se gestionan en la pestaña **Rutinas** del proyecto (también
desde el navegador del móvil) o escribiendo `/rutina …` en el chat.

**Cuándo se lanza** (las horas son las del reloj del servidor, en su zona horaria):

| Disparador | Ejemplo |
|---|---|
| Cada día a una hora | «Cada día a las 09:00» |
| Unos días de la semana a una hora | «De lunes a viernes a las 08:30», «Los sábados a las 10:00» |
| Cada N horas (1 a 168) | «Cada 6 horas» (contando desde la última vez) |
| Webhook | Al llegar un `POST` a su dirección propia (ver abajo) |
| Al cambiar archivos de una carpeta | Una carpeta del proyecto (o toda): cuando cambian archivos y llevan un minuto quietos |

**Desde el chat**: `/rutina cada día a las 9:00: revisa las dependencias`, `/rutina de lunes a viernes a las 8:30: …`,
`/rutina lunes y jueves 7h: …`, `/rutina laborables a las 8: …`, `/rutina cada 6 horas: …`, `/rutina cada hora: …`,
`/rutina webhook: revisa el PR que llega` o `/rutina al cambiar archivos de Entrada: …`. Lo que va después del
horario es la petición; el nombre sale de su primera frase (se cambia en la pestaña). `/rutina` sola abre la pestaña.
No va a los agentes: se crea la rutina (activa) y debajo del cuadro de texto se ve cuándo será la próxima.

**En la pestaña Rutinas**: crear y editar (nombre, petición y disparador), activar o desactivar con el interruptor,
**Ejecutar ahora**, ver la próxima hora, la última ejecución y el **historial** (las 20 últimas: hora, por qué se
lanzó —a su hora, hora perdida, webhook, carpeta, a mano— y cómo acabó). Estados: *En marcha*, *Esperando tu visto
bueno* (con «Pedir mi visto bueno a cada plan», su plan también espera), *Hecha*, *Falló*, *Saltada* e
*Interrumpida* (se cerró la app mientras trabajaba; se reanuda desde el chat como cualquier petición).

Reglas:

- **Nunca dos a la vez**: si la ejecución anterior de la rutina sigue en marcha (o su plan espera tu visto bueno),
  no se lanza otra: queda apuntada como *Saltada*. Vale también para «Ejecutar ahora» y para los webhooks.
- **Horas perdidas**: si a la hora de una rutina AI Cowork estaba cerrado (o el equipo en reposo), al volver **no**
  se lanza todo lo atrasado: se lanza **una sola vez** y un aviso en el chat dice cuántas veces no se lanzó.
  Al desactivar y volver a activar una rutina, o al cambiarle el horario, cuenta desde ese momento.
- La rutina de **carpeta** no mira mientras el equipo trabaja en el proyecto (los cambios de los agentes no
  cuentan; al terminar se toma una foto nueva) y no se lanza más de una vez cada 5 minutos. La petición lleva la
  lista de archivos nuevos (+), cambiados (~) y borrados (-).
- Mientras la lanza una rutina, el coordinador sabe que nadie está delante: no se queda esperando una respuesta a
  una pregunta, hace lo razonable y explica lo que dio por supuesto.

**Webhook**: cada rutina de webhook tiene su dirección propia en el acceso web (hace falta tenerlo encendido:
⋮ → «Acceso desde otros dispositivos…») con un **secreto aleatorio** suyo, que no es el código de acceso de la app.
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

**Órbita / API móvil**: `GET /api/mobile/v1/routines?conversationId=…` lista las rutinas (sin secretos) y
`POST /api/mobile/v1/routines/{routineId}/run` es «Ejecutar ahora» (capacidad `routines`); los cambios llegan por el
evento `routines.updated` y los mensajes de una rutina llevan `routine: { id, name }`. Crear y editar se hace desde
el escritorio o el navegador.

Se guardan en el `project.json` del proyecto (`routines`) y las lanza `src/main/routines.ts`, que mira cada 30 s.

### Limpiar el chat

⋮ → **«Limpiar el chat»** (pulsa dos veces), o escribe `/new`, `/nuevo`, `/limpiar` o `/clear` en el cuadro de
texto: empieza una conversación nueva en el proyecto, también para los agentes, que dejan de ver los mensajes
anteriores. Se vacían el chat y las tareas terminadas; los archivos y resultados se quedan. Antes se guarda una
copia en `historial/chat-<fecha>.json` dentro de la carpeta del proyecto. No se puede mientras el equipo está
trabajando en ese proyecto.

### Eliminar un proyecto

En el selector de proyectos (arriba, junto al nombre), la papelera de cada proyecto lo elimina tras confirmarlo:
su chat, tareas, adjuntos, resultados, historial, memoria y registros de pasos van a la **Papelera de ese equipo**
(si no se puede, se borran del todo). Si el proyecto trabajaba en una carpeta tuya, esa carpeta no se toca: solo
se borra la subcarpeta `.ai-cowork` que creó la app dentro. No se puede eliminar un proyecto con trabajo en marcha
(detenlo antes). Si era el abierto, la app pasa al más reciente; si era el último, crea «Mi primer proyecto».

### Cuotas

| Indicador | Fuente |
|---|---|
| GPT (Codex) | **Dato real**: se pregunta a Codex al abrir la app y cada 5 min (su `app-server`, no gasta uso), y tras cada tarea |
| Claude | **Dato real**: se pregunta a Claude Code con `/usage` al abrir la app y cada 5 min (no llama al modelo ni gasta uso), y tras cada tarea |
| Gemini | Con clave de API, Google no informa la cuota: se muestran los usos de hoy («3 hoy»), o una estimación si configuras un presupuesto (clic en el indicador) |
| Local | Sin cuota (ejecución en tu PC) |

⋮ → «Actualizar cuotas», o escribir `/usage` (también `/uso` o `/cuotas`) en el chat, las vuelve a consultar en el
momento; `/usage` las muestra bajo el cuadro de texto y no crea ninguna tarea para los agentes.

Los umbrales (advertencia ≤ 20 %, alerta < 10 %) se cambian en `workspace/config.json`.

### Consumo: ¿compensa?

Cada petición queda registrada con lo que costó: tokens de cada llamada a un agente (planificar y cada tarea, con
entrada, salida y la parte leída de caché), cuánto tardó, si salió bien y cuánto se movió la cuota de Claude y GPT
(se mide antes y después). Se ve en dos sitios:

- Bajo cada plan del chat: «14 min · 339 k tokens · Claude 5 h +5 % · GPT semana +2 %».
- ⋮ → **«Consumo y tokens…»**: totales de hoy, 7 o 30 días (peticiones, tiempo real y tiempo de agentes en
  paralelo, tokens, qué parte se fue en planificar y en intentos fallidos), cuota gastada de cada suscripción,
  reparto por agente y el detalle de cada petición. Se puede exportar a CSV.

Para comparar con un solo agente (por ejemplo Codex aparte), haz la misma petición allí y compárala con su fila
(en Codex, `/status` da los tokens). Hermes no informa sus tokens. El registro se guarda en
`usage-runs.json`, dentro de la carpeta de datos, y lleva también tu 👍/👎 de cada resultado (ver
[Valorar un resultado](#valorar-un-resultado-)): así se puede comparar no solo lo que costó, sino lo que sirvió.

### Cómo rinde cada agente

⋮ → **«Cómo rinde cada agente…»** (también desde el enlace «¿Y la calidad?» de «Consumo y tokens…») enseña, para
cada agente y por dificultad (difíciles, normales y fáciles, la que pone el coordinador a cada tarea; AI Cowork no
clasifica las tareas por tipo), en los últimos 7 o 30 días o en todo el registro, y si quieres solo del proyecto
abierto:

| Columna | Qué cuenta |
|---|---|
| Tareas | Tareas en las que trabajó. Una tarea con varios intentos suyos o con una corrección cuenta una vez; lo que hacen sus becarios cuenta para él |
| Le sirvió 👍 | De las que [valoraste](#valorar-un-resultado-), cuántas con 👍. La valoración es de quien terminó la tarea, no de quien falló antes |
| Verificada a la primera | De las que comprobó [otro agente](#verificación-por-otro-agente), cuántas cumplían en el primer veredicto |
| Necesitó corrección | De las comprobadas, cuántas tuvo que corregir porque el verificador vio fallos |
| Falló o pasó a otro | No pudo hacerla (error, «BLOQUEADA», sin cuota…) y la terminó otro agente o se dio por fallida |
| Tiempo y tokens (mediana) | Lo que suele tardar y gastar en una tarea, con su corrección incluida. «—» si no informa de tokens (Hermes, Muse, agentes de catálogo) |

Cada cifra lleva su base («7 de 9»), y en rojo lo que conviene mirar (le sirvió menos del 60 %, corrigió el 40 % o
más, falló el 20 % o más). Con menos de 5 tareas pone «pocos datos». En el móvil (navegador), cada agente y cada
dificultad se ven como una tarjeta, sin tabla que desplazar. Las tareas que detienes no cuentan.

**El coordinador lo usa al repartir.** Cuando un agente tiene 5 tareas o más en 30 días, su ficha lleva una línea
como «calidad (30 días, 12 tareas): le sirvieron al usuario 7 de 9 valoradas; verificación: 6 de 8 a la primera, 2
necesitaron corrección; 1 falló o pasó a otro (8 %); mediana unos 4 min y 120 k tokens por tarea», y por dificultad
las filas que se apartan del total. Se le pide que, entre los que pueden hacer la tarea, elija al de mejor calidad
en esa dificultad aunque tarde o gaste más: la calidad pesa más que la velocidad y el coste; la cuota y estar libre
deciden solo entre agentes parecidos.

Sale del mismo registro que «Consumo y tokens…» (`usage-runs.json`): para ello cada llamada de tarea guarda su
dificultad, cada verificación su veredicto y cada llamada si la detuviste. Los registros de antes de esta versión
no tenían esos datos: sus tareas salen como dificultad «Sin dato», sin verificación, y una llamada que no salió
bien en una petición cancelada se toma como cancelada. La API móvil lo da en `GET /quality` (ver
[mobile-api/README.md](mobile-api/README.md)); Órbita aún no lo enseña.

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

### Idioma

La interfaz está en **español**, **inglés**, **portugués**, **francés** y **chino** (simplificado). ⋮ → **Ajustes** →
**«Idioma · Language»** despliega la lista de idiomas, cada uno con su nombre en su propio idioma (Español, English,
Português, Français, 中文), y el elegido lleva una marca; al tocar otro, la ventana se recarga para que todo salga ya
traducido. Se recuerda en cada dispositivo, como el tema: la app del Mac,
el navegador y cada cliente pueden tener el suyo. Si nunca se ha elegido, se usa el idioma del sistema si es uno de
esos cinco (cualquier variante: es-MX cuenta como español, pt-PT como portugués); si no, inglés. Las fechas y los números siguen el idioma elegido.

Se traduce todo lo que pinta la interfaz, incluido el modo Demo. Los comandos del chat funcionan en los dos idiomas
(`/remember …`, `/routine every day at 9:00: …`, `/model`, `/usage`…) y un «yes» / «looks good» aprueba un plan igual
que un «sí».

El idioma también vale para el motor (lo que se elige en Ajustes se guarda en `config.json` como `language`; si
aún no se ha elegido, el del sistema). En cualquier idioma que no sea el español:

- **Hermes y los agentes** contestan en ese idioma: el plan («reply», títulos y criterios de cada tarea), lo que cuentan
  mientras trabajan, el resultado y la respuesta final. Las instrucciones internas que les da AI Cowork siguen en
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

**En Órbita** (el móvil) el idioma se elige aparte: Más → Ajustes → **«Idioma · Language»**: al tocarlo se despliega la
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

⋮ → **«Temas…»** cambia el aspecto de la app: **Clásico** (el predeterminado, paneles oscuros y sobrios) u
**Órbita** (cristal esmerilado, como la app del móvil: el espacio 3D ocupa toda la ventana y el chat, la cabecera,
las barras, los menús y las ventanas flotan encima como cristal que lo deja ver difuminado; el mundo se centra en la
zona que deja libre el chat). Y cinco más con la distribución del clásico y sus propios colores, en la interfaz
y en el espacio 3D (suelo, ciudad, estaciones, circuitos, núcleo y luces):

- **Marfil:** claro y cálido; suelo de piedra, ciudad blanca, circuitos verdes y aros dorados.
- **Grafito:** negro neutro con detalles dorados.
- **Bosque:** verde bosque profundo con oro.
- **Matrix:** negro y verde neón.
- **EVA-01:** morado y verde lima.

Y cuatro que además decoran el espacio, cambian la forma del núcleo y, en los de fiesta, disfrazan a los robots:

- **Relicario:** cristal y oro sobre piedra negra pulida. El núcleo es una gema tallada con otra más pequeña que
  brilla dentro, dos anillos de oro a su alrededor y un haz de luz que sube. Las estaciones se apoyan en tres discos
  de vidrio escalonados con filos de oro y luz debajo. Por el suelo hay láminas de cristal enmarcadas en oro y
  obeliscos de cristal con la punta encendida; flota polvo de oro y los edificios tienen las aristas iluminadas.
- **Telar:** tela tejida de plata y oro. Membranas con trama, hilos y orillos con cuentas doradas por todo el
  espacio; cada estación es una silla de tela tejida, el núcleo son tres cintas tejidas con cuentas. El suelo lleva
  una trama de hilos, cuelgan hilos sueltos con gotas de rocío, hay carretes de hilo por el suelo y destellos que
  parpadean.
- **Halloween:** noche morada sobre adoquines con hojas secas y niebla. Las estaciones y el núcleo son pedestales de
  piedra tallada con el filo encendido, velas y telarañas; los paneles son lápidas (con un cuervo en una). El núcleo
  es una calabaza con la cara encendida. Hay calabazas, calaveras, fantasmas que flotan, fuegos fatuos que suben, la
  luna tras una ciudad gótica de ventanas en arco con agujas y estandartes, y murciélagos. El agente local lleva
  sombrero de bruja y Codex, capa de vampiro.
- **Navidad:** suelo de hielo oscuro con bombillas por todos los caminos. Las estaciones son regalos (cintas rojas,
  filos dorados, guirnalda con bolas y luces, nieve con chorretones y un lazo); los paneles, losas de cristal con
  nieve y un lazo. El núcleo es una bola de nieve de cristal con un árbol decorado, copos y nieve que cae. Hay árboles
  nevados con bolas, luces y estrella, regalos, faroles, bastones de caramelo, muñecos de nieve, montones de nieve y
  la ciudad con guirnaldas de luces y coronas. Gemini y el agente local llevan gorro de Papá Noel, Claude bufanda y
  Hermes una ramita de acebo; la interfaz lleva nieve en el borde de los paneles.

Con menos calidad gráfica (o «Reducir efectos ambientales») hay menos piezas y se mueven más despacio.

Se aplica al momento (el espacio se vuelve a montar con los colores nuevos) y se recuerda en cada dispositivo (la
app del Mac, el navegador…).

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

Tienen **su propio volumen y su propio silencio**: pasa el ratón por el botón de sonido (o púlsalo) y bajo el
volumen de la música y los efectos aparece el de las voces, con el botón de la burbuja para silenciarlas sin
tocar la música. El botón del altavoz silencia todo, voces incluidas. Se recuerda en cada dispositivo.

En **Órbita** suenan igual (mismos timbres, sintetizados en el móvil): Ajustes → Respuesta al tacto → **«Voces de
los agentes»**, con su propio volumen; «Sonidos» apagado las silencia también.

### Música (como YouTube Music)

El botón **Música** del espacio digital abre un reproductor:
- **Buscar:** canciones y artistas en YouTube Music. También puedes pegar un enlace de YouTube.
- **Controles:** atrás, pausa, adelante, barra de posición y volumen.
- **Cola:** al elegir un resultado, los demás quedan en la cola y suenan después. El «+» añade una canción al final.
- **Luces al ritmo:** el espacio sigue el BPM de la canción, sin micrófono. Sus ajustes están plegados.

Suena en el reproductor oficial de YouTube, que tiene que estar a la vista. Va aislado en su propio marco, sin
ningún script de YouTube en la ventana de AI Cowork.

**Minimizar:** con una canción sonando, el botón «Música» (o Esc, o el icono de minimizar) lo deja pequeño en una
esquina: el vídeo, la canción y atrás / pausa / adelante. Sigue sonando. «Música» otra vez lo abre entero, y la ×
lo cierra y lo pausa. El icono de reducir de esa tarjeta lo deja en una barra con solo atrás / pausa / adelante y el
vídeo en pequeño como carátula (al pasar el ratón por encima se ve la canción); el icono de ampliar de la barra
vuelve a la tarjeta. Se recuerda cómo se dejó la última vez.

**Luces con el sonido real (sin micrófono):** en la app de escritorio, AI Cowork escucha lo que suena en su propia
ventana y detecta los golpes:
- **El pulso:** la luz entera cae en cada golpe del pulso de la canción, y las notas de bajo de en medio dan un
  destello.
- **Siempre a tiempo:** también con intros, directos y cambios de ritmo.
- **Nada guardado:** no se graba nada.

Se activa solo al poner música y se puede apagar en «Luces al ritmo». Desde el navegador del PC, el botón
«Sincronizar con el sonido de esta pestaña» hace lo mismo, compartiendo la pestaña con su audio. En el móvil, o si
se apaga, las luces van con el tempo estimado: BPM publicado en Deezer, desfase y «Marcar pulso».

En la **app de escritorio** suena todo. **Desde el navegador** (o el móvil por la web), YouTube no deja oír fuera
de su web muchas canciones de discográficas (error 150). Entonces:
- **Otra versión:** se busca otra subida de la misma canción y la app la recuerda para la próxima vez.
- **Si tampoco hay:** pasa a la siguiente. Tras tres seguidas que no suenan, se para y ofrece abrirla en YouTube
  Music.

### Modo Demo

Menú ⋮ → **Modo demo**, o el interruptor en la cabecera del Espacio digital. Reproduce un guion fijo que muestra
todos los estados: disponible, trabajo individual, espera, desplazamiento, delegación y recepción, sub-agente,
error, cuota baja y finalización. No hace ninguna llamada a los CLIs. Se reconoce por el borde ámbar y la
etiqueta «Demo · datos simulados».

### Rendimiento

Lo que hace AI Cowork para ir fluido sin que tengas que tocar nada:

- **Calidad del 3D automática, sin tirones.** Al abrir elige alta, media o baja según el equipo, y mientras lo usas
  la ajusta si los fotogramas no llegan. Ese ajuste solo cambia lo que sale barato de cambiar (resolución,
  partículas, estructuras y suavizado). El brillo (bloom) y las luces de los puestos dependen del equipo y no se
  quitan ni se ponen sobre la marcha: hacerlo obligaba a recompilar todos los materiales de golpe y daba un tirón
  justo cuando el equipo ya iba justo (`sceneQuality` en `scene/quality.ts`).
- **El 3D descansa cuando no lo miras.** Con la ventana o la pestaña oculta (minimizada, o tapada del todo si el sistema lo avisa) se para.
  Con la ventana a la vista pero sin foco (estás en otra app) se dibuja a 20 fotogramas por segundo: se sigue viendo
  a los robots trabajar y gasta mucho menos. Al volver a la ventana recupera la fluidez normal.
  Al volver, las animaciones siguen justo donde se quedaron: el reloj de la escena no se reinicia al pausar (antes
  un archivo que ya había llegado aparecía gigante y se iba encogiendo poco a poco).
- **El chat aparece antes.** El espacio 3D (Three.js y compañía) se carga aparte, después de la interfaz, y todo
  el código de la interfaz va reducido: lo que hay que cargar al abrir pasó de 4,6 MB a 1,3 MB.
- **Menos descarga por la red.** El servidor entrega la interfaz comprimida (gzip) al navegador y a los clientes de
  escritorio: unos 0,6 MB en vez de 4,6 MB la primera vez. Después se queda guardada hasta la siguiente
  actualización (`src/main/staticGzip.ts`).

### Apoyar AI Cowork (donaciones)

AI Cowork es gratis. Quien quiera agradecerlo puede invitar al autor a un café en Ko-fi
(https://ko-fi.com/yilsander). El enlace está en cuatro sitios:

- **Escritorio y navegador:** ⋮ → **Apoyar AI Cowork ☕**. Abre la página de Ko-fi en el navegador.
- **Órbita:** Ajustes → **Apoyar AI Cowork** (al final) → **Invitar a un café ☕**.
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
