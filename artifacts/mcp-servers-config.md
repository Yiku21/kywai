# Configuración de servidores MCP para AI Cowork

Fecha de revisión: 10 de octubre de 2026. Proyecto: `E:\AI Cowork`.

Se preparó [mcp.config.json](../mcp.config.json) para Claude Code en Windows. Contiene cuatro servidores mediante stdio, sin claves ni marcadores pendientes. Solo se generaron archivos: no se instalaron paquetes, no se iniciaron servidores y no se modificó el lanzador de agentes. La conexión real queda pendiente de activación.

## Recomendaciones revisadas

Se leyó [skills-y-plugins.md](skills-y-plugins.md), además de `package.json`, `README.md` y el lanzador de Claude. La recomendación **Production-Ready MCP Servers** enlaza a un [catálogo](https://github.com/KostZen/Production-Ready-MCP-Servers-for-Claude-Code), que incluye Filesystem, Fetch, Memory y Playwright. El catálogo no es un paquete instalable ni una certificación de producción.

Filesystem, Fetch y Memory son implementaciones de referencia; el [repositorio MCP](https://github.com/modelcontextprotocol/servers#model-context-protocol-servers) advierte expresamente que requieren evaluación y controles adicionales para producción. Playwright MCP es mantenido por Microsoft. Esta entrega proporciona una configuración utilizable con versiones directas fijas; no acredita un despliegue de producción.

## Servidores incluidos

| Entrada | Qué hace | Utilidad para AI Cowork | Requisito de activación |
| --- | --- | --- | --- |
| `filesystem` | Lee, busca, crea y edita archivos en directorios permitidos. | Trabajar con componentes React, escenas Three.js, código Electron y artefactos. | Node.js y `npx`; comprobar los directorios permitidos dentro de Claude. |
| `fetch` | Recupera una URL y convierte su contenido a texto/Markdown. | Consultar documentación de Electron, React, Three.js y Claude. | `uvx` y Python compatible; acceso a las páginas solicitadas. |
| `memory` | Guarda entidades, observaciones y relaciones en un grafo local persistente. | Conservar decisiones técnicas y contexto entre tareas Claude. | Directorio `workspace` escribible; un único proceso escritor por archivo. |
| `browser` | Automatiza páginas mediante Playwright MCP. | Inspeccionar la interfaz web, probar flujos y capturar la escena 3D. | Microsoft Edge instalado y la interfaz disponible en el puerto 5199. |

Versiones fijadas, consultadas en los registros de publicación:

- Filesystem: [`@modelcontextprotocol/server-filesystem@2026.8.31`](https://www.npmjs.com/package/%40modelcontextprotocol/server-filesystem?activeTab=versions).
- Fetch: [`mcp-server-fetch==2026.8.18`](https://pypi.org/project/mcp-server-fetch/2026.8.18/).
- Memory: [`@modelcontextprotocol/server-memory@2026.8.31`](https://www.npmjs.com/package/%40modelcontextprotocol/server-memory?activeTab=versions).
- Browser: [`@playwright/mcp@0.0.83`](https://www.npmjs.com/package/%40playwright/mcp).

## Configuración completa

Este bloque reproduce exactamente el archivo raíz. Se utiliza `cmd /d /c` para ejecutar los shims de `npx` en Windows; `/d` evita comandos AutoRun de cmd. Las rutas usan barras `/`, admitidas en Windows, para evitar errores de escape JSON.

```json
{
  "mcpServers": {
    "filesystem": {
      "type": "stdio",
      "command": "cmd",
      "args": [
        "/d",
        "/c",
        "npx",
        "-y",
        "@modelcontextprotocol/server-filesystem@2026.8.31",
        "E:/AI Cowork/src",
        "E:/AI Cowork/scripts",
        "E:/AI Cowork/artifacts"
      ]
    },
    "fetch": {
      "type": "stdio",
      "command": "uvx",
      "args": [
        "--from",
        "mcp-server-fetch==2026.8.18",
        "mcp-server-fetch"
      ],
      "env": {
        "PYTHONIOENCODING": "utf-8"
      }
    },
    "memory": {
      "type": "stdio",
      "command": "cmd",
      "args": [
        "/d",
        "/c",
        "npx",
        "-y",
        "@modelcontextprotocol/server-memory@2026.8.31"
      ],
      "env": {
        "MEMORY_FILE_PATH": "E:/AI Cowork/workspace/mcp-memory-claude.jsonl"
      }
    },
    "browser": {
      "type": "stdio",
      "command": "cmd",
      "args": [
        "/d",
        "/c",
        "npx",
        "-y",
        "@playwright/mcp@0.0.83",
        "--browser",
        "msedge",
        "--headless",
        "--isolated",
        "--allowed-origins",
        "http://localhost:5199;http://127.0.0.1:5199",
        "--output-dir",
        "E:/AI Cowork/artifacts/mcp-browser"
      ]
    }
  }
}
```

### filesystem: código y artefactos

Se permiten únicamente `src`, `scripts` y `artifacts`, directorios ya existentes. Esto cubre el código de la aplicación y sus resultados sin incluir `.ai-cowork/adjuntos/`. Los archivos de la raíz, como `package.json`, se pueden consultar con las herramientas nativas de Claude.

Al activarlo, ejecutar `list_allowed_directories` y comprobar las tres rutas. El cliente puede enviar MCP Roots que sustituyan la lista de argumentos: conservar esas mismas rutas o una selección más estrecha. La restricción de este servidor no limita las herramientas nativas de Claude. [Control de directorios y herramientas](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem).

### fetch: documentación web

Usa el paquete Python estándar; no se inventa un paquete npm `server-fetch`. `PYTHONIOENCODING=utf-8` evita problemas de codificación en Windows. Requiere Python 3.10 o superior y `uvx`. Para comprobarlo, pedir una lectura de `https://code.claude.com/docs/en/mcp` mediante `fetch`.

Este servidor permite acceder a direcciones internas y no implementa una lista de dominios autorizados en esta configuración. Para agentes con navegación sin supervisión, aplicar restricciones de salida mediante aislamiento o un proxy que las haga cumplir. No hereda las restricciones de las herramientas web propias de AI Cowork. [Servidor Fetch](https://github.com/modelcontextprotocol/servers/tree/main/src/fetch).

### memory: continuidad entre tareas

`MEMORY_FILE_PATH` apunta a `workspace/mcp-memory-claude.jsonl`. Su directorio existe y `workspace/` ya está excluido por `.gitignore`. El servidor crea el archivo al guardar datos. La persistencia de este grafo es independiente de `--no-session-persistence` de Claude. Para verificar la conexión sin escribir, pedir `read_graph` o `search_nodes`. [Configuración de Memory](https://github.com/modelcontextprotocol/servers/tree/main/src/memory).

Para este orquestador, asignar un único escritor a ese archivo. Si se lanzan varios procesos Claude simultáneamente, usar una copia de la configuración por agente con un `MEMORY_FILE_PATH` distinto, o serializar sus tareas. No asumir coordinación entre procesos: el [código del servidor](https://github.com/modelcontextprotocol/servers/blob/main/src/memory/index.ts) guarda el grafo en un archivo local. La memoria compartida entre proveedores exigiría integración adicional; este JSON no conecta Codex, Gemini ni los modelos locales.

### browser: interfaz React y escena Three.js

Usa Microsoft Edge mediante `--browser msedge`, sin solicitar la instalación de un navegador. Edge debe estar instalado previamente. `--headless` oculta la ventana y `--isolated` separa las sesiones. Se permiten solicitudes a los orígenes locales de la interfaz web; las salidas con nombre automático van a `artifacts/mcp-browser/`. La lista de orígenes es un filtro funcional, no una barrera de seguridad frente a redirecciones. [Opciones de Playwright MCP](https://github.com/microsoft/playwright-mcp#configuration).

Para probarlo, iniciar `npm run web` en otra terminal y solicitar la navegación a `http://localhost:5199`. El README indica que esta interfaz funciona en modo Demo: sirve para revisar UI, pero no valida el IPC de Electron ni ejecuciones reales de agentes. La escena WebGL necesita capturas para verificar su aspecto. Las pruebas de Electron completo requieren un flujo adicional.

## Cómo activarlo en Claude Code

`mcp.config.json` no se carga automáticamente por su nombre. Claude Code permite cargarlo explícitamente con `--mcp-config`; `--strict-mcp-config` selecciona solamente los servidores del archivo. [Referencia del CLI](https://code.claude.com/docs/en/cli-reference).

Comprobaciones previas en `cmd.exe`, sin instalar paquetes:

```bat
cd /d "E:\AI Cowork"
node --version
where npx uvx claude
uvx --version
```

Durante la preparación se comprobó que Node.js 24.18.0, `npx`, `uvx` y `claude` están accesibles. No se comprobó la disponibilidad de Python, Edge ni de los paquetes MCP en caché.

Cuando se quiera activar la configuración:

```bat
claude --strict-mcp-config --mcp-config "E:/AI Cowork/mcp.config.json"
```

Los cuatro servidores se cargan con ese comando. Abrir `/mcp` dentro de la sesión y comprobar cada conexión; después realizar las verificaciones descritas en cada servidor. Mantener los permisos normales del cliente y conceder solo las herramientas necesarias para la tarea.

Al activar, `npx -y` puede descargar paquetes y dependencias a su caché, y `uvx` puede preparar un entorno Python en caché. Esas acciones no se ejecutaron en esta entrega. Para una activación sin descargas, los paquetes y dependencias deben estar previamente disponibles; `-y` confirma la obtención de paquetes, no concede permisos de herramientas. [Entornos de uvx](https://docs.astral.sh/uv/concepts/tools/).

Como alternativa futura, Claude Code reconoce `.mcp.json` en la raíz del proyecto. Si se elige ese método, copiar o fusionar las entradas sin sobrescribir una configuración existente. En modo estricto sigue siendo necesario pasar `--mcp-config`. [Alcance de proyecto](https://code.claude.com/docs/en/mcp#mcp-installation-scopes). No se creó `.mcp.json` en esta tarea.

## Activación futura desde el orquestador

En [src/main/agents/claude.ts](../src/main/agents/claude.ts), `claudeArgs` añade `--strict-mcp-config` y no añade `--mcp-config`. Por tanto, guardar este JSON por sí solo no activa MCP en los agentes lanzados por la aplicación.

Para una integración posterior, el lanzador debe resolver la configuración del proyecto de la tarea y añadir, para este proyecto, estos argumentos:

```ts
args.push('--mcp-config', 'E:/AI Cowork/mcp.config.json')
```

Conservar el modo estricto. Esta ruta fija y los permisos del JSON corresponden solo a `E:\AI Cowork`; no reutilizarlos para tareas con otra carpeta de trabajo. El proyecto ya dispone de un mecanismo para entrecomillar argumentos con espacios en `src/main/agents/spawn.ts`.

Las llamadas en modo `-p` también necesitan permisos explícitos para herramientas MCP que el cliente no autorice automáticamente. Como ejemplo de una ejecución de consulta, una vez preparados los paquetes:

```bat
claude -p --strict-mcp-config --mcp-config "E:/AI Cowork/mcp.config.json" --allowedTools mcp__filesystem__read_text_file mcp__fetch__fetch mcp__memory__search_nodes -- "Lee artifacts/skills-y-plugins.md y consulta la documentación MCP de Claude; no modifiques archivos."
```

Las escrituras y acciones de navegador se habilitan por herramienta según la tarea. La integración futura debe respetar las reglas del proyecto, especialmente la protección de `.ai-cowork/adjuntos/`, y comprobar fallos de conexión antes de asignar trabajo que dependa de MCP. No se modificaron permisos ni argumentos del lanzador en esta entrega.

## Claude Code Docs MCP y otras recomendaciones

El enlace recomendado como **Claude Code Docs MCP** apunta al manual del cliente MCP, que no especifica en esa recomendación un paquete o endpoint de búsqueda documental. Se proporciona acceso a esas páginas mediante `fetch`; no equivale a un índice de búsqueda de texto completo ni configura un servidor documental independiente.

Howler.js, electron-updater y Vitest son dependencias de la aplicación, fuera del alcance de esta configuración MCP. Tampoco se añadieron servidores Git, GitHub o Gemini, que necesitan decisiones de integración adicionales.

## Validación y límites

Se validó el JSON mediante lectura y parseo, la estructura de las cuatro entradas, las rutas locales y la igualdad entre el JSON raíz y el bloque de esta guía. Se verificó que esta tarea no cambió el lanzador ni los manifiestos de dependencias.

No se ejecutaron pruebas de conexión ni pruebas funcionales MCP, para cumplir la petición de no instalar nada. Las versiones directas están fijas; sus dependencias transitivas no tienen un lockfile en esta entrega. Antes de un despliegue de producción, resolver esa reproducibilidad y los límites de acceso, red y concurrencia descritos arriba.
