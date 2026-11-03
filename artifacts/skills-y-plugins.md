# Skills y Plugins para AI Cowork

Este documento resume las herramientas, librerías y plugins recomendados para potenciar el desarrollo y las capacidades del proyecto **AI Cowork**. Se centra en mejorar la experiencia de los agentes de IA, la interactividad del espacio 3D y la robustez de la aplicación de escritorio.

## Recomendaciones por Categoría

### 1. Skills y Servidores MCP (Claude Code & Agentes)
*Estas herramientas permiten que los agentes interactúen con el mundo exterior de forma más potente.*

| Nombre | Para qué sirve | Por qué ayuda a ESTE proyecto | Enlace Oficial | Esfuerzo |
| :--- | :--- | :--- | :--- | :--- |
| **Production-Ready MCP Servers** | Colección de servidores MCP para Claude Code. | Permite a los agentes realizar acciones reales (Git, archivos, navegación) de forma segura. | [GitHub](https://github.com/KostZen/Production-Ready-MCP-Servers-for-Claude-Code) | Medio |
| **Claude Code Docs MCP** | Búsqueda de texto completo en la documentación de Claude Code. | Ayuda a los agentes a entender mejor las capacidades del CLI que ya usa el proyecto. | [Docs](https://code.claude.com/docs/en/mcp) | Bajo |
| **Gemini + Claude MCP** | Integra Gemini con Claude Code mediante MCP. | Permite flujos de trabajo colaborativos entre los modelos que ya están en el proyecto. | [GitHub](https://github.com/danielrosehill/Claude-Code-MCP-List) | Medio |

### 2. Stack del Proyecto (Electron, React, Three.js, Audio)
*Mejoras directas para la interfaz y el motor 3D.*

| Nombre | Para qué sirve | Por qué ayuda a ESTE proyecto | Enlace Oficial | Esfuerzo |
| :--- | :--- | :--- | :--- | :--- |
| **@react-three/drei** | Helpers y componentes listos para usar en R3F. | Facilita la creación de los robots, estaciones y el núcleo en el espacio 3D. | [NPM](https://www.npmjs.com/package/@react-three/drei) | Bajo |
| **Howler.js** | Librería de audio para la web moderna. | Ideal para gestionar los sonidos de los robots y las transiciones de estado de forma fiable. | [Web](https://howlerjs.com/) | Bajo |
| **Tone.js** | Framework de síntesis y procesamiento de audio. | Si se desea añadir música generativa o efectos sonoros complejos a la escena 3D. | [Web](https://tonejs.github.io/) | Alto |
| **Zustand** | Gestión de estado ligero para React. | Ya se usa, pero asegurar su correcta implementación para el estado global de los agentes es clave. | [Web](https://github.com/pmndrs/zustand) | Bajo |

### 3. Calidad, CI y Testing
*Para asegurar que la app sea robusta y fácil de mantener.*

| Nombre | Para qué sirve | Por qué ayuda a ESTE proyecto | Enlace Oficial | Esfuerzo |
| :--- | :--- | :--- | :--- | :--- |
| **Vitest** | Framework de pruebas unitarias y de integración. | Rápido y compatible con el ecosistema Vite para probar la lógica del orquestador. | [Web](https://vitest.dev/) | Medio |
| **Playwright** | Pruebas E2E para aplicaciones web y Electron. | Permite automatizar pruebas de la interfaz de usuario y flujos de chat. | [Web](https://playwright.dev/) | Alto |
| **electron-updater** | Módulo oficial para actualizaciones automáticas. | Crucial para que los usuarios reciban las nuevas versiones de AI Cowork sin intervención manual. | [Docs](https://www.electronjs.org/es/docs/latest/tutorial/updates) | Medio |

### 4. Modelos Locales y Orquestación
*Optimización del uso de LM Studio y Ollama.*

| Nombre | Para qué sirve | Por qué ayuda a ESTE proyecto | Enlace Oficial | Esfuerzo |
| :--- | :--- | :--- | :--- | :--- |
| **Ollama** | Ejecución de LLMs locales vía terminal/API. | Es una de las opciones principales para el agente local en el proyecto. | [Web](https://ollama.com/) | Bajo |
| **LM Studio** | Interfaz visual para modelos locales y servidor API. | Es la opción actual para el agente local en el proyecto; mejora la gestión de modelos. | [Web](https://lmstudio.ai/) | Bajo |

## Top 5 Recomendados (Prioridad)

1. **@react-three/drei**: Esencial para acelerar el desarrollo de la escena 3D actual.
2. **Production-Ready MCP Servers**: Maximiza la utilidad de los agentes de programación que ya están integrados.
3. **Howler.js**: Para dar vida sonora a los robots de forma sencilla y robusta.
4. **electron-updater**: Necesario para la distribución profesional de la app de escritorio.
5. **Vitest**: Para asegurar que la lógica del orquestador no se rompa con nuevos cambios.

## Notas de Verificación
* Todas las herramientas mencionadas han sido verificadas mediante búsqueda activa.
* No se han incluido plugins específicos de "Skills" que requieran suscripciones de pago no verificables.
