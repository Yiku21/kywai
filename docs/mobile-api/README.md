# API móvil de AI Cowork v1

La especificación verificable está en [openapi.json](./openapi.json). La API vive en el servidor web actual, bajo `/api/mobile/v1`, en los mismos puertos HTTP/HTTPS, direcciones Tailscale y certificado que la interfaz web. No hay otro servidor, almacén de proyectos ni motor de agentes.

## Conexión y autenticación

1. En AI Cowork, activa «Acceso desde otros dispositivos» y copia su dirección y código actual. `POST /pair` recibe `{"code":"…","deviceName":"Pixel"}` con `Content-Type: application/json`.
2. La respuesta es `{"accessToken":"…","expiresAt":"2026-11-10T10:00:00.000Z","serverName":"…"}`. Usa `Authorization: Bearer <accessToken>` en las demás rutas, incluido el handshake WebSocket. El código web, las cookies y los tokens en la URL no autentican la API móvil.
3. El token no caduca por fecha: `expiresAt` (100 años) se mantiene por compatibilidad y no se aplica. Sobrevive a reinicios y actualizaciones de AI Cowork (la clave de firma se guarda en `mobile-key`, en la carpeta de datos de la app). Cada emparejamiento queda anotado como un dispositivo (`deviceId` en la respuesta; `kind` `mobile` por defecto o `client` para un cliente de escritorio, y `platform` opcional): se revoca por separado (`POST /device/revoke` desde el propio dispositivo, o desde el equipo servidor en el panel de acceso) y deja de valer si pasan 90 días sin usarse (`401 DEVICE_REVOKED`). Regenerar el código de acceso revoca todos. Un `401` requiere volver a emparejar. Los emparejamientos anteriores a la lista de dispositivos (sin `deviceId`) siguen valiendo hasta que se genere un código nuevo. Diez códigos incorrectos por dirección en un minuto provocan `429` hasta que termina esa ventana.

Android conserva el token en Android Keystore. Las direcciones del servidor deben ser configurables: IP de Tailscale, MagicDNS o dirección de Tailscale Serve. Para HTTPS propio usa el puerto HTTP + 1; Tailscale Serve usa su dirección HTTPS existente.

El cliente debe validar TLS normalmente. Ante un certificado propio, debe mostrar su huella SHA-256 y exigir confirmación explícita antes de emparejar, fijando la confianza únicamente para ese servidor/certificado. La huella local se puede contrastar con `openssl x509 -in <workspaceRoot>/web-cert/cert.pem -noout -fingerprint -sha256`. Nunca desactives globalmente la validación TLS. HTTP solo se mantiene por compatibilidad con el servidor existente; usa HTTPS para enviar credenciales en conexiones remotas.

## Rutas y respuestas

Todas las peticiones POST llevan JSON (salvo la subida de archivos, `POST /files`); incluso las operaciones sin campos reciben `{}`. Se rechazan campos inesperados, valores de tipo incorrecto, JSON inválido y cuerpos mayores de 256 KiB. Las rutas GET rechazan parámetros de consulta desconocidos o repetidos (`400`). El texto de chat admite hasta 50.000 caracteres UTF-16 y no puede quedar vacío al quitar espacios. Los identificadores de cliente/petición admiten 1–128 caracteres ASCII alfanuméricos, guion o guion bajo, comenzando con un alfanumérico. Los identificadores de conversación son los identificadores de proyecto existentes.

| Método y ruta relativa | Respuesta correcta |
| --- | --- |
| `POST /pair` | `200`, token, caducidad, nombre de servidor y `deviceId` |
| `GET /device` | `200`, `{"device":{id,name,kind,platform?,createdAt,lastSeenAt}\|null}` (null con un emparejamiento anterior a la lista) |
| `POST /device/revoke` | `200`, `{"revoked":true}`; `409 LEGACY_DEVICE` con un emparejamiento anterior a la lista |
| `GET /snapshot` | `200`, `conversation`, `projects`, `agents`, `stations`, `tasks`, `memory`, `usage`, `settings`, `capabilities` y `sequence` |
| `POST /chat/messages` | `202`, `conversationId`, `requestId`, `clientMessageId` y `message` |
| `POST /conversations` | `201`, `{"conversation":{…}}` |
| `POST /requests/{requestId}/stop` | `200`, `requestId`, `conversationId`, `status:"stopped"` |
| `POST /requests/{requestId}/resume` | `200`, `requestId`, `conversationId`, `status:"running"` |
| `POST /plans/{messageId}/approve` | `200`, `conversationId`, `messageId`, `requestId`, `status:"approved"` |
| `POST /plans/{messageId}/reject` | `200`, `conversationId`, `messageId`, `requestId`, `status:"rejected"` |
| `GET /events` con Upgrade WebSocket | `101`, canal de eventos autenticado |
| `GET /projects` | `200`, `{"projects":[…]}` |
| `GET /tasks/{taskId}/trace` | `200`, `{"taskId":"…","entries":[…]}` |
| `POST /memory` | `201`, `{"entry":{…}}` |
| `POST /memory/{memoryId}` | `200`, `{"entry":{…}}` |
| `POST /memory/{memoryId}/delete` | `200`, `{"deleted":true}` |
| `POST /instructions` | `200`, `{"instructions":"…"}` |
| `GET /artifacts/{artifactId}/raw?conversationId=` | `200`, bytes del resultado |
| `GET /files?conversationId=&q=` | `200`, `{"attachments":[…],"folder":{…}\|null}` |
| `GET /files/raw?conversationId=&source=attachment\|folder\|project&path=` | `200`, bytes del archivo |
| `POST /files?conversationId=&name=` (cuerpo sin JSON) | `201`, `{"attachment":{…}}` |
| `POST /settings/agent-access` | `200`, `{"agentAccess":"full"\|"project"}` |
| `POST /settings/plan-approval` | `200`, `{"planApproval":true\|false}` |
| `POST /usage/refresh` | `200`, `{"quotas":[…]}` |
| `GET /quality?days=` | `200`, `{"days":30,"minTasks":5,"agents":[AgentQuality…]}` |
| `POST /agents/{agentId}/reset` | `200`, `{"agentId","activity","reason"}`; `404 AGENT_NOT_FOUND` |
| `GET /app/android` | `200`, `{"versionCode":…,"versionName":"…","size":…,"sha256":"…","builtAt":"…"\|null}`; `404 NO_ORBITA_RELEASE` si no hay |
| `GET /app/android/apk` | `200`, la APK (`application/vnd.android.package-archive`) |
| `GET /hermes/models` | `200`, `{"installed":…,"current":{"provider","model","fromApp"},"hermesDefault":…,"providers":[{"id","label","models":[…]}],"updatedAt":…}` |
| `POST /hermes/model` | `200`, lo mismo con el elegido; cuerpo `{"provider","model"}` o `{"reset":true}` |

Una conversación móvil corresponde a un proyecto existente. `GET /snapshot` selecciona el proyecto actualizado más recientemente; permite `?conversationId=<id>` para seleccionar uno explícitamente. `conversation.id` es ese identificador, `title` es su nombre y `activeRequestIds` son sus ejecuciones activas. No modifica ni vacía conversaciones al leer. Si no hay proyectos, devuelve una conversación vacía con `id:null`; el arranque normal ya crea el primer proyecto.

`POST /conversations` crea un proyecto/conversación mediante `createProject`; nunca limpia el chat del proyecto anterior. Acepta `{}` (se llama «Conversación móvil») o `{"name":"…"}`: texto no vacío de hasta 120 caracteres, sin los espacios de los extremos (el almacén une espacios y lo recorta a 80). `POST /chat/messages` recibe `{"conversationId":"id-o-null","text":"…","clientMessageId":"uuid-del-cliente"}` y, opcionalmente, `"attachmentIds":["…"]`. Con `conversationId:null`, selecciona el proyecto más reciente. Si no existe, devuelve `409 NO_CONVERSATION`.

`attachmentIds` (hasta 20, cada uno con el formato de identificador de cliente) son `id` de `conversation.attachments` de esa conversación, por ejemplo los subidos antes con `POST /files`. Van con el mensaje exactamente como los archivos que adjunta el escritorio: aparecen en `message.attachments` (los mismos objetos, sin copiar el archivo ni repetirlo en `conversation.attachments`), se preparan en la carpeta de trabajo (`.ai-cowork/adjuntos/`) si el proyecto tiene una y el coordinador y las tareas los reciben en su encargo. Los repetidos se ignoran. Un id que no es de esa conversación devuelve `400 INVALID_INPUT` y el mensaje lo nombra. Sin `attachmentIds`, el comportamiento es el de siempre. Un reintento con el mismo `clientMessageId` y texto devuelve el recibo original sin volver a mirar los adjuntos.

El cliente conserva el mismo `clientMessageId` al reintentar. Se guarda en el mensaje original del almacén y el motor comprueba duplicados antes de su primer `await`: reintentos simultáneos, reconexiones y reinicios no crean otra ejecución para el mismo mensaje en esa conversación. Un texto diferente con el mismo identificador provoca `409 CLIENT_MESSAGE_CONFLICT`. Si el identificador se envía con conversación nula, también se busca el mensaje existente en los demás proyectos antes de elegir uno. Los identificadores deben ser UUID únicos generados por el cliente. La deduplicación dura mientras se conserve el mensaje en su conversación; limpiar/archivar el chat con la interfaz existente elimina esa garantía para la conversación activa.

La pausa reutiliza `cancelRun(..., 'pause')`: aborta los procesos actuales y marca las tareas sin terminar como interrumpidas, para `resumeRun`. Conserva la petición, tareas terminadas, adjuntos y resultados. `stop` repetido sobre una petición cancelada y `resume` repetido sobre una activa son idempotentes. Solo las tareas interrumpidas son reanudables: una petición cancelada definitivamente desde escritorio, una petición finalizada o una detenida durante la planificación antes de producir tareas devuelve `409` al intentar reanudarla. El botón de cancelar de escritorio mantiene su comportamiento anterior.

`agents` combina la configuración completa (incluidos deshabilitados), subagentes vivos y sus campos de runtime (`activity`, `taskId`, `lastActivity`, etc.) directamente en cada objeto. `usage.runs` y `usage.quotas` son el registro/cuotas existentes; `totals` y `byAgent` se calculan de sus llamadas, sin guardar contadores adicionales. El consumo es global al servidor; tareas y memoria son del proyecto seleccionado. Las fechas del dominio siguen siendo milisegundos Unix; `expiresAt` es ISO-8601.

La instantánea también incluye:

- `projects`: `[{id, name, createdAt, updatedAt, running}]`, del actualizado más recientemente al más antiguo; `running` indica peticiones en marcha. Es lo mismo que devuelve `GET /projects`.
- `stations`: las estaciones del espacio digital (`{id, label, position:[x, z], forSubagents?}`), tal cual en la configuración.
- `settings`: `{"agentAccess":"full"|"project","planApproval":true|false}`.
- `conversation.attachments`: los adjuntos del proyecto (`{id, name, relPath, mime, size}`), y `conversation.folder`: `{name, path}` de su carpeta de trabajo (nombre y ruta completa) o `null` si no tiene. `POST /conversations` devuelve la conversación con estos dos campos.
- Recortes: cada tarea lleva en `trace` solo sus 40 últimas entradas y en `traceCount` el total (el registro completo está en `GET /tasks/{taskId}/trace`); `usage.runs` lleva las 100 ejecuciones más recientes en orden cronológico, aunque `totals` y `byAgent` se siguen calculando con todas.
- `capabilities`: `attachments:true` y `projects`, `memoryEdit`, `files`, `upload`, `artifacts`, `traceEndpoint`, `agentAccess` y `usageRefresh`, todos `true`; `planApproval` (planes con visto bueno) y `voice` (notas de voz), `true` si el equipo los tiene. `appUpdate`: Órbita puede actualizarse desde el ordenador (ver abajo). `hermesModel`: «/model» (ver y cambiar el modelo de Hermes). `agentReset`: «Reiniciar agente» (`POST /agents/{agentId}/reset` con `{}`: olvida su bloqueo, comprueba que responde y lo deja disponible).

## Planes con visto bueno

Con `settings.planApproval` (por defecto `true`), el coordinador no reparte el trabajo directamente: publica un mensaje con `proposal` y nada empieza hasta que el usuario responde. `proposal` es `{status, tasks, request, contract?, attachmentIds?, memory?, decidedAt?}`:

- `tasks`: `[{key, title, description, agentId, difficulty, dependsOn, deliverable, acceptance?, files?}]`; `dependsOn` son `key` de ese mismo plan. Las tareas todavía no existen.
- `status`: `pending` (espera respuesta), `approved` (el mensaje recibe `taskIds` con las tareas creadas), `revised` (el usuario pidió cambios y hay otro plan después) o `rejected`.
- `request`: la petición completa con los cambios pedidos al revisarlo; es la que reciben los agentes.

La petición que planificó termina con `run.finished` (`ok:true`) al proponer el plan; al aprobarlo vuelve a empezar con el mismo `requestId` (`run.started`, `message.upsert` del plan con `taskIds`, `task.upsert`…). Responder:

- `POST /plans/{messageId}/approve` `{"conversationId"}`: crea las tareas y empiezan. También funciona tras reiniciar el ordenador: el plan está guardado en su mensaje.
- `POST /plans/{messageId}/reject` `{"conversationId"}`: no se hace nada (`proposal.status:"rejected"`).
- Por el chat (`POST /chat/messages`): un mensaje que solo da el visto bueno («sí», «ok, adelante», «perfecto, empieza»…) lo aprueba sin volver a planificar y su recibo lleva el `requestId` del plan; cualquier otra cosa son cambios: el plan pasa a `revised` y el coordinador propone otro con su plan anterior y la respuesta.

`404 PLAN_NOT_FOUND` si el mensaje no tiene plan; `409 PLAN_NOT_PENDING` si ya se aprobó, descartó o cambió. `POST /settings/plan-approval` `{"enabled":true|false}` → `{"planApproval":…}` es el mismo ajuste que ⋮ → «Pedir mi visto bueno a cada plan» en el escritorio y emite `config.updated`.

Órbita se actualiza desde el ordenador, sin pasar la APK a mano: la versión firmada se publica en el código de AI Cowork (`android/release/orbita.apk` y `orbita.json`, con `./gradlew :app:publishOrbita`) y llega al ordenador con «Buscar actualizaciones». `GET /app/android` dice cuál es (`versionCode`: Órbita solo la ofrece si es mayor que la suya); `GET /app/android/apk` la entrega, y Órbita comprueba su `sha256` antes de instalarla. Si falta la APK o su huella no es la anotada, `404 NO_ORBITA_RELEASE`.

«/model» en el chat de Órbita abre la lista de modelos de Hermes: `GET /hermes/models` da el actual (`fromApp`: lo eligió el usuario en AI Cowork; si no, el de la configuración de Hermes) y los de cada proveedor con el que Hermes tiene sesión, de su caché (sin llamadas de pago). `POST /hermes/model` con `{"provider","model"}` lo cambia (Hermes lo usa desde el próximo encargo, con `-m` y `--provider`) y `{"reset":true}` vuelve al de su configuración; emite `config.updated`. Si «/model» llega como mensaje (`POST /chat/messages`), no se le pasa a Hermes: el ordenador contesta en el chat cómo abrir la lista.

Cada tarea tiene su mensaje en el chat (`work`): aparece cuando el agente empieza, va contando lo que hace y al acabar su `text` es el resultado (con sus `artifactIds`). `work` es `{taskId, title, status: running|done|failed|stopped, steps, hidden?}`; cada paso es una frase del agente `{"kind":"note","text"}` o varias herramientas seguidas en una línea `{"kind":"tools","summary","items":[…],"more"?,"failed"?}` («Ejecutó 3 comandos y editó 2 archivos»). Llega con `message.upsert` (el mismo id, como mucho una vez por segundo). `running` solo es «trabajando» si la tarea sigue en marcha; `hidden` son los pasos del principio que ya no caben (están en `GET /tasks/{taskId}/trace`).

Los mensajes con `artifactIds` (lo que entregó una tarea, o todos los archivos de la petición en el resumen final) se muestran en la app agrupados en una carpeta plegable cuando son varios.

## Proyectos, registro, memoria y ajustes

En todas estas rutas `conversationId` es obligatorio (no admite `null`) y un proyecto que no existe devuelve `404 CONVERSATION_NOT_FOUND`.

- `GET /projects` → `{"projects":[…]}` con el mismo formato que `snapshot.projects`.
- `GET /tasks/{taskId}/trace` → `{"taskId":"…","entries":[TraceEntry…]}` con el registro completo guardado. Busca la tarea en todos los proyectos; `404 TASK_NOT_FOUND` si no está en ninguno. Las entradas nuevas siguen llegando con `task.trace`.
- `POST /memory` `{"conversationId","kind","text"}` → `201 {"entry":{…}}`. `kind`: `decision`, `fact`, `preference` o `pending`; `text`: hasta 2000 caracteres y al menos 3 al unir espacios (el almacén lo guarda con los espacios unidos y recortado a 400). La entrada queda confirmada y con autor el usuario. `409 MEMORY_DUPLICATE` si ya hay una entrada vigente con el mismo texto.
- `POST /memory/{memoryId}` `{"conversationId", "text"?, "kind"?, "status"?}` (al menos uno; `status`: `confirmed`, `provisional` o `superseded`) → `{"entry":{…}}` ya cambiada. `404 MEMORY_NOT_FOUND` si no está en ese proyecto.
- `POST /memory/{memoryId}/delete` `{"conversationId"}` → `{"deleted":true}`; si ya no existe, `404 MEMORY_NOT_FOUND` (un reintento puede darla por borrada).
- `POST /instructions` `{"conversationId","text"}` → `{"instructions":"…"}`. Hasta 8000 caracteres; `""` las borra.
- `POST /settings/agent-access` `{"access":"full"|"project"}` → `{"agentAccess":"…"}`. Es el mismo ajuste del escritorio y emite `config.updated`.
- `POST /usage/refresh` `{}` → `{"quotas":[…]}` tras volver a consultar las cuotas como el botón del escritorio (puede tardar unos segundos). Emite `quota.update`.
- `GET /quality` (opcional `days`, de 1 a 999; por defecto 30) → lo mismo que ⋮ → «Cómo rinde cada agente…»: por agente (de más a menos tareas) y por dificultad (`byDifficulty`: `hard`, `medium`, `easy` y `unknown` para registros antiguos) `tasks`, `rated`/`liked`/`likedPct` (👍 sobre las valoradas), `verified`/`firstPass`/`firstPassPct` (verificación a la primera), `fixed`/`fixedPct` (necesitó corrección), `failed`/`failedPct` (falló o pasó a otro), `medianMs` y `medianTokens` (`null` si el agente no informa de tokens). Los porcentajes son `null` sin base. `capabilities.agentQuality` indica que el servidor lo tiene.

Los cambios de memoria e instrucciones emiten `memory.updated` (`projectId`, `memory` completa e `instructions`) a todos los clientes, también al escritorio.

## Archivos

Los archivos se sirven tal cual, con `Content-Type` según la extensión: `html`/`htm` → `text/html`, `md`/`markdown` → `text/markdown`, `txt`/`log` → `text/plain`, `csv` → `text/csv`, `json` → `application/json`, `js`/`mjs`/`cjs` → `text/javascript`, `css` → `text/css`, `xml` → `application/xml` (todos con `; charset=utf-8`); `png`, `jpg`/`jpeg`, `gif`, `webp`, `svg` (`image/svg+xml`), `bmp`, `ico`, `pdf`, `zip`, `mp3`, `wav`, `ogg` y `mp4` con su tipo; el resto del código o texto con extensión (`ts`, `py`, `kt`…) como `text/plain; charset=utf-8` y lo demás, incluido lo que no tiene extensión, como `application/octet-stream`. Cabeceras: `Content-Length`, `Content-Disposition: inline; filename*=UTF-8''<nombre codificado>`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store` y, como en `/api/file`, `Content-Security-Policy: sandbox allow-scripts`. Más de 25 MB → `413 FILE_TOO_LARGE`. Los errores son JSON como en el resto de la API.

- `GET /artifacts/{artifactId}/raw?conversationId=…`: `artifactId` es un `id` de `conversation.artifacts`. Su `relPath` se busca en la carpeta del proyecto y luego en la de trabajo, igual que `/api/file`, sin salir de ellas (tampoco a través de enlaces simbólicos). `404 ARTIFACT_NOT_FOUND` si no es de ese proyecto o el archivo ya no está.
- `GET /files?conversationId=…&q=…` → `{"attachments":[…],"folder":{"name","path","files":[{path,name,size,modifiedAt,kind}],"truncated"}|null}`. `folder` es `null` si el proyecto no tiene carpeta de trabajo. El recorrido omite carpetas ocultas (`.git`, `.venv`…), `node_modules`, `dist`, `build`, `out`, `release` y `__pycache__`, no sigue enlaces, llega hasta 8 niveles y se queda en 2000 archivos (o 20.000 entradas recorridas): entonces `truncated:true` y la lista está incompleta (primero lo menos profundo). `files` va del modificado más recientemente al más antiguo; `path` es relativa con `/` y `kind` es `html`, `markdown`, `code`, `image`, `text` u `other` como en los resultados. `q` (hasta 200 caracteres, sin distinguir mayúsculas) filtra `files` por `path` y `attachments` por `name`.
- `GET /files/raw?conversationId=…&source=attachment|folder|project&path=…`: con `project`, `path` es la ruta con la que un agente nombró un archivo del proyecto en el chat (por ejemplo la de una imagen `![mapa](/Users/…/artifacts/mapa.png)`): relativa al proyecto o absoluta del equipo servidor; se busca en su carpeta interna y en su carpeta de trabajo y `404` si cae fuera de ellas. Con `attachment`, `path` es el `relPath` del adjunto (debe empezar por `attachments/`); con `folder`, el `path` de `folder.files`. `path` debe ser relativa con `/`, sin segmentos vacíos, `.` ni `..`, sin `\` y no absoluta (`400` si no). `404 FILE_NOT_FOUND` si no existe, sale de la carpeta (también por enlaces) o no hay carpeta de trabajo.
- `POST /files?conversationId=…&name=…` con los bytes del archivo como cuerpo (cualquier `Content-Type`, sin `Content-Encoding`; hasta 25 MB, `413 PAYLOAD_TOO_LARGE` con `Content-Length` o al pasarse por trozos) → `201 {"attachment":{…}}`. Lo añade a los adjuntos del proyecto sin enviar ningún mensaje; para dárselo a los agentes, envía después un mensaje con su `id` en `attachmentIds`. `name` se sanea: solo el último tramo (tras `/` o `\`), sin caracteres de control, `<>:"|?*` → `_`, sin puntos ni espacios finales y recortado a 200 caracteres conservando la extensión; si queda vacío, `400 INVALID_INPUT`. `attachment.name` es ese nombre; `relPath` (`attachments/…`) usa una versión ASCII y única. Emite `attachments.updated`.

## WebSocket y sincronización

Abre `ws(s)://<servidor>/api/mobile/v1/events` con el mismo Bearer en las cabeceras del handshake. No se admiten comandos por el socket: se envían por HTTP. El servidor implementa ping/pong y cierra conexiones caducadas (comprobación cada 20 segundos), clientes que dejan de responder o consumidores cuyo búfer supera 1 MiB. El cierre `1013` requiere sincronizar de nuevo.

Cada mensaje de texto es un sobre `{"type":"message.upsert","sequence":1,"payload":{…}}`. La primera emisión es `hello`, con la secuencia actual y `payload:{"bootId":"…","snapshotRequired":true,"heartbeatMs":20000}`. Las secuencias siguientes aumentan una unidad por evento móvil, son comunes a HTTP/HTTPS y todos los sockets, y avanzan aunque no haya clientes. `hello` solo comunica el watermark y no incrementa el contador. `capabilities.bootId` identifica la instancia del acceso remoto; la secuencia se reinicia al cambiar esa instancia.

El canal transmite eventos de todos los proyectos. El cliente filtra los cambios de conversación por `payload.projectId` o el `projectId`/`conversationId` del mensaje/tarea interior; los cambios de agentes y cuotas son globales. Los tipos siguen `CoworkEvent`, con `kind` trasladado a `type` y el resto en `payload` (`id`, `ts` y los datos del evento). `message.upsert` añade `message.conversationId`. `usage.run` se proyecta como `usage.updated` con `payload.usage` completo, para actualizar totales móviles (con `runs` recortado a las 100 más recientes, como en la instantánea). `config.updated` elimina `webAccess.token`.

`attachments.updated` llega cuando cambian los adjuntos de un proyecto (subida con `POST /files` o mensaje con archivos desde el escritorio): `payload` es `{"id","ts","projectId","conversationId","attachments":[…]}`, con la lista completa. De momento solo lo recibe la API móvil: la interfaz de escritorio y la web no lo conocen todavía (se emite por un canal aparte, `emitMobileOnly`), así que ven los adjuntos nuevos al recargar el proyecto.

No hay replay ni garantía de entrega sin conexión. Abre el socket, conserva sus eventos mientras cargas `/snapshot` y aplica únicamente los de secuencia mayor que `snapshot.sequence` (también disponible en `capabilities.eventSequence`). En cada reconexión, cambio de `bootId` o hueco de secuencia, vuelve a obtener una instantánea. Un evento repetido o con secuencia menor/igual al watermark se ignora. `message.delta` concatena texto; un mensaje desconocido exige sincronizar de nuevo. Si llega `project.deleted` para la conversación abierta, Android pide otra instantánea para mostrar el proyecto que el servidor seleccione. La carga de snapshot usa las lecturas síncronas registradas del servidor existente para establecer su watermark.

## Errores y verificación

Los errores HTTP, incluidos los fallos de upgrade, usan siempre `{"code":"INVALID_INPUT","message":"…","retryable":false}`. Los estados principales son `400` entrada/JSON, `401` autenticación, `404` recurso, `405` método, `409` conflicto/estado, `413` tamaño, `415` tipo/codificación, `426` WebSocket, `429` intentos y `500`/`503` problema del servidor. Los errores internos no exponen excepciones, rutas ni secretos. `retryable:true` corresponde a límites temporales o fallos del servidor; un token caducado necesita emparejamiento.

Las pruebas se ejecutan sobre el listener real, proyectos/consumo reales en una carpeta temporal y el orquestador real con proveedores simulados, sin llamadas pagadas ni conexión a Tailscale. Incluyen credenciales, contratos HTTP, validación, reintentos concurrentes, pausa/reanudación, WebSocket, secuencias, revocación y TLS con certificado confiado explícitamente, y también proyectos, recortes de la instantánea, registro de tareas, memoria e instrucciones, resultados y archivos (tipos, cabeceras, recorte de la lista, salidas de la carpeta y enlaces), subida (límites, nombres, eventos) y adjuntos enviados con `attachmentIds`.

```sh
npm run test -- --run src/main/mobileAuth.test.ts src/main/mobileApi.test.ts
npm run test -- --run
npm run typecheck
```

`package.json` define `test` como `vitest`; `--run` termina la batería automáticamente. El servidor móvil no añade dependencias de producción. La integración con el cliente y el emulador está documentada en [android/README.md](../../android/README.md).
