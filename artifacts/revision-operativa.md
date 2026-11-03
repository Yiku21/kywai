# Revisión operativa de AI Cowork

Fecha: 10 de octubre de 2026. Entorno: Windows, Node.js **24.18.0**, npm **11.17.0**. Carpeta: `E:\AI Cowork`. Base de Git al comenzar: `a4382aa`.

## Alcance y conservación del trabajo

Se recuperaron los diagnósticos completos de las tres tareas anteriores desde los mensajes del proyecto, porque los resúmenes iniciales estaban truncados. `git status --porcelain=v1` no mostraba cambios al comenzar. Antes de editar se guardaron el estado de Git y los hashes SHA-256 de los archivos versionados en `.ai-cowork/entregables/revision-operativa/`.

No se hizo commit, reset, limpieza de Git ni borrado de trabajo ajeno. No se modificaron los adjuntos del usuario ni sus proyectos. Las pruebas crearon proyectos y datos de Electron aislados dentro de `.ai-cowork/entregables/revision-operativa/`. Los archivos de escena señalados por t1 y t3 no necesitaron cambios.

Durante esta revisión aparecieron cambios concurrentes para un asistente de configuración en main, preload, tipos compartidos, `App.tsx`, `HeaderMenu.tsx`, `store/cowork.ts` y `ui/setup/`. Se conservaron. La única adaptación propia relacionada con ese trabajo fue añadir `case 'setup.log'` en el reductor, tras reproducir un fallo de tipos y de estado; el resto de las modificaciones de esos archivos pertenece al trabajo concurrente. Se volvió a verificar el conjunto al incorporarse la interfaz del asistente. Esta revisión no certifica la instalación ni autenticación de herramientas mediante él.

## Cambios realizados por esta revisión

| Archivo | Cambio y motivo |
| --- | --- |
| `src/renderer/src/ui/Header.tsx` | Las cuotas se agrupan en el control compacto hasta 1399,98 px. Antes, el volumen y el menú quedaban fuera de la ventana mínima. Se reutilizó el componente existente. |
| `src/renderer/src/ui/space/BottomBar.tsx` | Escape sale de la vista ampliada. Los paneles y menús conservan prioridad mediante `defaultPrevented`; el listener se retira al cerrar la vista o desmontar la barra. |
| `src/renderer/src/ui/space/BottomBar.test.tsx` | Tres regresiones: salir con Escape, cerrar primero una capa ya abierta e ignorar otras teclas/retirar el listener. |
| `src/renderer/src/store/cowork.ts` | Añadido `case 'setup.log'` a los eventos que conservan los datos del proyecto. Sin él, el evento devolvía `undefined` y TypeScript señalaba TS2366. |
| `src/renderer/src/store/cowork.test.ts` | Dos regresiones para preservar el estado ante `setup.log`, en datos reales y demo. Reproducidas fallando antes de la corrección. |
| `README.md` | Precisado el requisito de Node a partir del `jsdom` instalado: `^22.22.2 || ^24.15.0 || >=26.0.0`. |
| `artifacts/integraciones-tecnicas.md` | Sustituido el diagnóstico antiguo «BLOQUEADA» por resultados actuales; aclarado que updater y MCP aún no están operativos. |
| `artifacts/revision-operativa.md` | Este informe y los pasos de arranque. |

Los scripts, capturas, datos temporales y registros auxiliares de esta tarea están en `.ai-cowork/entregables/revision-operativa/`, ignorada por Git. No se cambiaron dependencias ni el lockfile.

## Comandos y resultados reales

Se ejecutaron desde la raíz del proyecto. La ronda final de pruebas y tipos se inició a las 21:37, hora local del equipo, tras incorporarse la interfaz del asistente concurrente.

| Comando | Código | Resultado |
| --- | ---: | --- |
| `node --version` | 0 | `v24.18.0`. |
| `npm --version` | 0 | `11.17.0`. |
| `npm ls --depth=0` | 0 | Dependencias directas resueltas, incluidos updater, Howler, Vitest y jsdom. |
| `npm run test` | 0 | **3 archivos, 6 pruebas aprobadas**, duración final 2,38 s. |
| `npm run typecheck` | 0 | Ambos proyectos TypeScript aprobados. |
| `npm run build` | 0 | Main 188,20 kB; preload 3,86 kB; renderer JS 4060,73 kB y CSS 102,81 kB. Sin errores de compilación. |
| Comprobación `parsers` | 0 | 25 comprobaciones aprobadas. |
| Comprobación `orchestrator` | 0 | 11 comprobaciones aprobadas. |
| Comprobación `localtools` | 0 | 7 comprobaciones aprobadas. |
| Comprobación `workdir` | 0 | 8 comprobaciones aprobadas. |
| Electron con `smoke.cjs` | 0 | Arranque funcional, `setup.log`, controles, archivos, demo completa, visor y cierre. |
| Electron con `smoke.cjs --quick` | 0 | Repetición sobre la última compilación conjunta: omitir asistente inicial, cabecera, Escape, audio, archivos, WebGL, inicio/pausa de demo y cierre. |
| `git diff --check` | 0 | Sin errores de espacios; ninguna instancia de humo quedó ejecutándose. |

Evidencias: `test-final.log`, `typecheck-final.log`, `build-final.log` y los cuatro registros de `checks/`. Los mensajes de rechazo de modelos del orquestador son escenarios simulados esperados. Las 51 comprobaciones del motor se ejecutaron por separado: no forman parte del patrón de descubrimiento de `npm run test`.

La auditoría t1 ya había ejecutado `npm ci` en una copia limpia: código 0, 330 paquetes instalados y 0 vulnerabilidades informadas en aquella ejecución. Aquí se conservó `node_modules` y se verificó con `npm ls`; **no se repitió la instalación limpia ni una auditoría de vulnerabilidades**.

Para reproducir las comprobaciones del motor en PowerShell:

```powershell
Set-Location 'E:\AI Cowork'
$checks = Join-Path (Get-Location) '.ai-cowork/entregables/revision-operativa/checks'
New-Item -ItemType Directory -Path $checks -Force | Out-Null
foreach ($name in @('parsers', 'orchestrator', 'localtools', 'workdir')) {
  $output = Join-Path $checks "$name.cjs"
  npx --no-install esbuild "src/main/__checks__/$name.check.ts" --bundle --platform=node --format=cjs --tsconfig=tsconfig.node.json --alias:electron=./src/main/__checks__/electron-stub.ts "--outfile=$output"
  if ($LASTEXITCODE -ne 0) { throw "No se compiló $name" }
  node $output
  if ($LASTEXITCODE -ne 0) { throw "Falló $name" }
}
```

En la ejecución de esta revisión también se asignaron `TEMP` y `TMP` al directorio `checks` dentro del proceso de pruebas para mantener allí los temporales.

## Prueba de arranque funcional

Se ejecutó el Electron instalado con el `out/` compilado, mediante un pequeño lanzador que asigna una carpeta de aplicación y `userData` independientes. Se usaron la API de Electron, eventos de teclado y controles DOM; se cambió el tamaño real de la ventana, no solo una emulación de viewport. La instancia del usuario permaneció abierta.

```powershell
Set-Location 'E:\AI Cowork'
$env:ELECTRON_RUN_AS_NODE = $null
& .\node_modules\electron\dist\electron.exe .ai-cowork/entregables/revision-operativa/smoke.cjs
```

El script guarda `resultado.json`, `980px.png`, `1600px.png` y, en modo completo, `resultado-demo.png` en una carpeta `despues-*`; cierra su propia ventana al terminar. La prueba anterior a las correcciones está en `antes-dnqI1x` y registra `escape: false` y el desbordamiento original. La ejecución completa con `setup.log`, **`despues-lM2vXK`**, terminó con **código 0**, sin errores JavaScript (`smoke-final.log`). Tras compilar la nueva interfaz de configuración se repitió el humo con `--quick`: **`despues-X6r1Gu`**, código 0 y sin errores JavaScript (`smoke-integracion-final.log`). No repite los 65 segundos de demo; comprueba inicio, pausa y regreso a datos reales.

| Función | Verificación |
| --- | --- |
| Arranque y puente preload | Ventana AI Cowork, proyecto inicial y `window.cowork` disponibles. |
| Nuevo evento de configuración | Enviado `setup.log` por el canal IPC real; la interfaz sigue operativa. |
| Asistente inicial concurrente | Se muestra al primer arranque y se puede omitir sin instalar programas ni iniciar sesiones. |
| Cabecera adaptable | Anchos externos 1600, 1400, 1300, 1200, 1100 y 980 px. A 980 px: interior 966 px, cabecera 966 px, menú termina en x=946 y slider en x≈855; ambos utilizables. Antes: cabecera 1185 px y menú en x≈1165. También comprobado en demo. |
| Menú y cuotas | «Más opciones» abre y cierra; el control compacto muestra los cuatro grupos de cuotas. |
| Navegación | Chat, Archivos, Tareas y Resultados seleccionan su panel y muestran sus estados vacíos. |
| Escape | Sale de la vista ampliada; con un panel o menú abierto, el primer Escape lo cierra y el siguiente sale de la vista. |
| Audio | Silenciar persiste `aicowork.muted=true`; reactivar responde; Inicio en el slider lleva el volumen a 0 y reactivar restaura 80 %. Se validaron controles y preferencias; no se midió la salida acústica. |
| Proyectos y archivos reales de prueba | Crear, renombrar y cargar por IPC; lectura de Markdown; imagen PNG de 64 px y HTML cargados mediante `cowork://file` con el sandbox del visor. |
| Escena | Cinco robots; contexto WebGL2 válido y no perdido. Acercar, Alejar y Vista general responden. Capturas revisadas visualmente. |
| Demo completa | Guion de 65 segundos sin acelerar temporizadores; cuatro resultados; apertura y cierre del visor. Al volver a datos reales los resultados demo no aparecen en el proyecto real. |
| Consola | Sin errores JavaScript en la ejecución completa; avisos de `THREE.Clock` obsoleto y precisión X4122 de shaders. |
| Cierre | La ventana de prueba se cierra y Electron termina con código 0. |

Las pruebas no enviaron peticiones de trabajo a proveedores reales. La detección normal de disponibilidad y lectura de cuotas sí se produjo al arrancar.

### Incidencias durante la verificación

- El nuevo evento `setup.log`, añadido concurrentemente, produjo TS2366 y dos fallos de regresión; se corrigió el reductor. Evidencia del fallo: `regresion-setup-antes.log`.
- Una lectura de `src/main/index.ts` coincidió con su escritura por otro trabajo y produjo TS1003/TS1109/TS1005 transitorios; desaparecieron sin que esta revisión editara ese archivo.
- El lanzador de humo se ajustó tras dos expectativas incorrectas del propio script: esperaba `'1'` para mute, que la app guarda como `'true'`, e intentaba leer `cowork:` con `fetch` desde el renderer. La aplicación lee texto por IPC y muestra imágenes/HTML mediante sus elementos correspondientes; se probaron esas rutas reales. No se cambió CSP ni el protocolo para adaptar la app al script.
- En la primera repetición con el asistente, el renderer no había aplicado los tamaños solicitados y el control compacto no existía aún. El lanzador ahora muestra/restaura su propia ventana y espera la sincronización del viewport antes de medir. La repetición final sí recorrió los seis tamaños reales y pasó.

## Pendientes y límites

- No se verificó un encargo real con Claude, Codex, Gemini, Hermes, Ollama o LM Studio. La presencia del ejecutable no certifica sesión, cuota ni modelo disponible. La configuración aislada mostró Qwen local como no disponible por falta del modelo predeterminado; esto no bloqueó la interfaz ni la demo.
- MCP sigue sin activación desde el orquestador; el JSON conserva rutas específicas de esta máquina. Updater sigue condicionado a empaquetado y proveedor de publicación. No se añadió distribución ni se cambiaron permisos de agentes.
- Los diagnósticos de solapamiento entre fichas y robots, legibilidad de algunas etiquetas y el posible problema de audio de Firefox quedan pendientes. No impiden el uso verificado en Electron; Firefox no se ejecutó.
- El renderer ronda los 4 MB; no se realizó una optimización ajena a los bloqueos. Persisten los avisos gráficos indicados.
- La revisión valida el estado compilado y los comandos registrados. El trabajo concurrente del asistente de configuración debe repetir sus propias comprobaciones al terminar, especialmente sus flujos de instalación/autenticación.

## Pasos exactos para iniciar la aplicación

1. Usar Node.js 24.18.0 (versión comprobada) o una versión que cumpla `^22.22.2 || ^24.15.0 || >=26.0.0`.
2. Abrir PowerShell y ejecutar:

   ```powershell
   Set-Location 'E:\AI Cowork'
   npm ci
   npm run build
   npm start
   ```

   `npm ci` solo hace falta para una instalación limpia o cuando se hayan cambiado dependencias; en este equipo ya están instaladas. Si una política de npm omite la descarga de Electron y falta `node_modules/electron/dist/electron.exe`, ejecutar `node node_modules/electron/install.js` y volver a iniciar.

3. Para cargar la nueva compilación, cerrar antes cualquier instancia anterior de AI Cowork. La aplicación usa una sola instancia: ejecutar `npm start` con la anterior abierta la enfoca, pero no reemplaza el código ya cargado. Se conserva `workspace/`.
4. En una instalación nueva puede aparecer **Configura AI Cowork**. Para la comprobación local usar **Omitir por ahora** y activar **Demo** en «Espacio digital». El guion genera cuatro resultados simulados.
5. Para trabajo real, desactivar Demo, seleccionar el proyecto y dar acceso a su carpeta desde el selector. Utilizar agentes con su CLI instalado y sesión iniciada. El agente local se configura en **Local → Agente local**, con un modelo disponible en LM Studio u Ollama. Después escribir la tarea en Chat.

Alternativas: `npm run dev` para desarrollar; `npm run web` para la interfaz demo en `http://localhost:5199` (sin motor de escritorio). En terminal interactiva, `npm run test -- --run` fuerza una ejecución única de Vitest.
