# AI Cowork Remote (Android)

App Android nativa (Kotlin + Jetpack Compose, sin WebView) para usar AI Cowork desde el móvil a través de Tailscale.
Habla con la capa móvil `/api/mobile/v1` del servidor de AI Cowork, que sigue siendo la fuente de verdad.

## Módulos

| Módulo | Qué es |
| --- | --- |
| `app` | La app. `data/` (modelos del contrato, cliente OkHttp HTTP/WebSocket, TLS con huella, almacenamiento, repositorio) y `ui/` (Compose). |
| `mockserver` | Servidor simulado que cumple el contrato (OkHttp MockWebServer). Lo usan exclusivamente las pruebas; se puede arrancar aparte en el ordenador. La APK normal, incluida debug, no lo empaqueta. |

## Requisitos y comandos

JDK 17 o superior (probado con 21) y Android SDK 35 (`local.properties` → `sdk.dir`).

```bash
./gradlew test            # pruebas unitarias, de integración contra el simulado y de Compose (Robolectric)
./gradlew lint            # 0 errores
./gradlew assembleDebug   # app/build/outputs/apk/debug/app-debug.apk
./gradlew :app:publishOrbita   # versión firmada → release/orbita.apk y orbita.json (para que el móvil se actualice)
```

## Publicar una versión para el móvil

Al subir a `master` un cambio en `android/`, GitHub Actions («Publicar Órbita») la publica sola con la clave guardada
como secreto del repositorio (ver docs/MANUAL.md). A mano: `./gradlew :app:publishOrbita` y sube `android/release/` con el resto del código. La
compila firmada con la clave estable (`aicoworkSigning` en `~/.gradle/gradle.properties`, fuera del repositorio) y
deja `orbita.apk` y `orbita.json` (número de versión, huella SHA-256 y fecha). El número de versión son los commits
del repositorio y nunca baja de la versión ya publicada + 1 (así el repositorio público, con menos historial, tampoco
publica una menor), de modo que cada versión es mayor que la anterior sin tocar nada (`-PorbitaVersionCode=N` lo fija para
pruebas; no lo publiques así). El ordenador la recibe al actualizarse y Órbita la instala desde Ajustes → Órbita →
«Buscar actualizaciones» (`AppUpdater`: comprueba la huella y la instala con `PackageInstaller`). Con la misma firma y
`UPDATE_PACKAGES_WITHOUT_USER_ACTION`, Android 12+ la instala sin preguntar (probado en el emulador, también cuando la
versión anterior se instaló a mano); la primera vez solo pide «Permitir de esta fuente». La versión de desarrollo (`.debug`) es otro paquete y no se actualiza así.

## Servidor simulado

- **En el ordenador:** `./gradlew :mockserver:run --args="--port 8790 --tls --san 100.x.y.z"`. Imprime la URL, el código
  (por defecto `246810`) y la huella SHA-256. Desde el emulador, el ordenador es `10.0.2.2` (también se permite
  `http://10.0.2.2:8790` sin `--tls`).

## Experiencia móvil (no es un calco del escritorio)

- **Teléfono** (< 600 dp): barra inferior Inicio · Chat · Tareas · Equipo · Más (Memoria, Consumo, Ajustes) y vistas de detalle.
- **Tablet** (≥ 600 dp): riel lateral con todas las secciones y listas en dos paneles (tareas y equipo).
  Con ≥ 840 dp, el inicio muestra el chat al lado.
- Inicio de un vistazo: peticiones en marcha con «Detener», equipo con su estado, contadores de tareas, cuota más ajustada,
  actividad reciente y un campo para pedir algo sin cambiar de pantalla.
- Tareas agrupadas por petición, filtros rápidos, detalle con paso a paso y «Detener petición» / «Reanudar».
- Sin conexión: se muestra la última copia guardada, un aviso con cuenta atrás y «Reintentar»; los mensajes escritos
  quedan en cola y se envían al reconectar (idempotentes gracias a `clientMessageId`).
- Tiempo real solo con la app a la vista; reconexión con espera exponencial (1 s → 30 s) y al recuperar la red.
- Accesibilidad: descripciones para lectores de pantalla, estados con texto e icono (no solo color), encabezados,
  avisos de conexión anunciados, objetivos táctiles de 48 dp. Tema claro, oscuro o del sistema (y Material You opcional).

## Espacio digital 3D

Se abre desde Inicio («Ver en 3D»), Equipo o Más; en tablet tiene su propia entrada en el riel.
Usa OpenGL ES 2.0 nativo, con las estaciones, núcleo, zonas, ciudad, robots por proveedor y estados de la escena de escritorio.
Los agentes, tareas, memoria y nombre del proyecto proceden de la instantánea y los eventos del servidor.
Sin conexión conserva la última escena con un aviso; si OpenGL no está disponible muestra una alternativa accesible.

- Un dedo gira; dos dedos desplazan y pellizcar acerca o aleja. Los botones +/− también cambian el zoom.
- Tocar un robot o su ficha lo selecciona y acerca la cámara; su tarjeta permite abrir el agente o su tarea.
- Un doble toque o «Vista general» vuelve al encuadre completo. Atrás cierra la selección o regresa a la navegación nativa.
- Las zonas abren sus tarjetas. Archivos resume tareas y resultados porque el contrato móvil aún no transporta adjuntos.

`SpaceSceneBuilderTest`, `OrbitCameraTest` y `SpaceScreenTest` verifican estado, cámara y alternativa sin OpenGL.
`SpaceDeviceTest` y `SpaceParityDeviceTest` comprueban renderizado y gestos en el emulador. El harness de integración
descrito abajo ejecuta también `RealServerDeviceTest` con credenciales temporales para verificar TLS, chat y Keystore.
La referencia visual está en [android-space-parity.png](../artifacts/android-space-parity.png).

## Seguridad

- Token cifrado con AES-256-GCM y clave en **Android Keystore**; sin copias de seguridad (`allowBackup=false`).
- **No se desactiva la validación TLS.** `PinningTrustManager` valida primero con los certificados del sistema; solo si
  fallan acepta *exactamente* el certificado cuya huella SHA-256 confirmó el usuario para ese servidor. La pantalla de
  confirmación muestra la huella en bloques y exige marcar «He comprobado que la huella coincide».
- `network_security_config.xml`: solo HTTPS; HTTP únicamente hacia `localhost`, `127.0.0.1` y `10.0.2.2` (desarrollo).

## Contrato: lo que la app espera (y tolera)

Rutas y cuerpos exactamente como el contrato común. Además, la app es tolerante (ignora campos desconocidos, acepta fechas
en milisegundos o ISO‑8601) y aprovecha estos campos **opcionales** si el servidor los envía:

- `snapshot.sequence`: última secuencia incluida; los eventos con número menor o igual se descartan.
- `conversation`: `id`, `title`, `messages[]`, `activeRequestIds[]` (o `activeRunIds`).
- Mensajes: `id`, `author {type: user|agent|system, agentId?, name?}`, `text`, `createdAt`, `streaming`, `tone`,
  `requestId` (o `runId`), `taskIds[]`, `clientMessageId` (para confirmar los mensajes enviados desde el móvil).
- Tareas: los campos de `Task` de AI Cowork con `requestId` (o `runId`) y `trace[]` opcional.
- `usage`: `{totals {input, output, cached?}, quotas [QuotaInfo], byAgent [{agentId, input, output}]}`.
- `capabilities`: `stopRequests`, `resumeRequests`, `newConversation`, `taskTrace`, `attachments`.
- `POST /chat/messages` → `{message?, requestId?}`; `POST /conversations` → `{conversation}`.

Eventos (`type`): `hello`, `snapshot`, `message.upsert`, `message.delta {messageId, text}`, `agent.runtime {runtime}`,
`agent.upsert|agent.spawned {agent}`, `agent.removed {agentId}`, `task.upsert {task}`, `task.trace {taskId, entry}`,
`memory.updated {memory}`, `usage.updated {usage}`, `quota.update {quotas}`, `request.started|run.started`,
`request.finished|run.finished {requestId|runId}`, `conversation.created|chat.cleared {conversation}`.
Los tipos desconocidos se ignoran; un hueco en `sequence` o una referencia desconocida provoca una nueva instantánea.

## Integración con el servidor real

El harness arranca `webServer`, `MobileBackend`, el almacén de proyectos y el orquestador reales con datos temporales.
Solo se sustituyen Electron (rutas temporales), la consulta de cuotas y la ejecución del proveedor IA (respuesta determinista, sin pagos).
No usa `android/mockserver`. `AI_COWORK_TAILSCALE_HOST` permite elegir la IP Tailscale activa; sin ella prueba HTTPS local.

Desde la raíz del proyecto:

```bash
AI_COWORK_ANDROID_INTEGRATION=1 AI_COWORK_TAILSCALE_HOST=100.64.0.1 npm run test -- --run src/main/mobileApi.test.ts -t 'cliente Android'
```

Con un emulador o dispositivo de pruebas conectado, añadir `AI_COWORK_ANDROID_DEVICE=1` ejecuta también el flujo Compose
sobre la APK instalada y verifica el cifrado/lectura con Android Keystore. El dispositivo debe estar sin emparejar y alcanzar
la dirección configurada. No se debe usar una sesión personal para esta prueba. El test instrumental recibe dirección,
código y huella del harness; sin estos argumentos no se puede ejecutar por separado.

El test externo del cliente JVM se omite intencionadamente en `./gradlew test` sin el harness; la prueba local del límite
de que un móvil emparejado no caduca y todas las pruebas contractuales/UI se ejecutan normalmente.

La aplicación de escritorio instalada previamente puede seguir sirviendo únicamente la API web antigua. La app Android
la detecta y pide actualizar AI Cowork: un 401 con `{"error":...}` no es la API móvil. Ejecuta el código actualizado
(`npm run dev` o `npm run build` seguido de `npm start`) y activa su acceso remoto; si mantienes la instancia antigua
abierta, configura otro puerto libre (el HTTPS usa el puerto HTTP + 1). No copies el código del servidor de pruebas:
usa el que muestra tu instancia actualizada.
