# Integraciones técnicas

Estado a 10 de octubre de 2026: **dependencias instaladas; pruebas, tipos y compilación validados** con Node.js 24.18.0 y npm 11.17.0. El anterior estado «BLOQUEADA» describía un intento antiguo y ya no corresponde al proyecto.

## Integraciones presentes

- `electron-updater@6.8.9`, `howler@2.2.4`, `vitest@5.0.3`, `@vitest/ui@5.0.3` y `jsdom@30.1.2` están en los manifiestos y en la instalación local; `npm ls --depth=0` termina con código 0.
- `src/main/updater.ts` está conectado al arranque, pero omite la actualización cuando la aplicación no está empaquetada o falta `app-update.yml`. No hay configuración de empaquetado ni proveedor de publicación: **las actualizaciones automáticas no están operativas**. No se necesitan para iniciar la versión local.
- `src/renderer/src/lib/audio.ts` ofrece `createAudioClip` y `releaseAudioClip` mediante Howler, con volumen y silencio compartidos. La música y los efectos sintetizados utilizan Web Audio.
- Vitest utiliza jsdom y los alias `@` / `@shared`. Incluye la prueba existente de audio, tres pruebas de salida con Escape y prioridad de paneles, y dos pruebas que evitan que `setup.log` reemplace el estado del proyecto por `undefined`.
- `mcp.config.json` es una plantilla específica de este equipo con rutas absolutas. Los procesos Claude del orquestador no la cargan: pasan `--strict-mcp-config` sin `--mcp-config`. La activación futura está descrita en `mcp-servers-config.md`; no se ha activado durante esta revisión.

## Comprobaciones repetidas sobre el proyecto

| Comando | Código | Resultado |
| --- | ---: | --- |
| `npm ls --depth=0` | 0 | Dependencias directas resueltas. |
| `npm run test` | 0 | 3 archivos, 6 pruebas aprobadas. |
| `npm run typecheck` | 0 | Proyectos Node y renderer sin errores. |
| `npm run build` | 0 | Main, preload y renderer compilados en `out/`. |

Las cuatro comprobaciones independientes de `src/main/__checks__` también pasan: parsers 25, orquestador 11, herramientas locales 7 y carpeta de trabajo 8. No se incluyen automáticamente en `npm run test`; sus comandos y las evidencias del arranque están en [revision-operativa.md](revision-operativa.md).

## Instalación y arranque

Usar una versión de Node compatible con el `jsdom` bloqueado: `^22.22.2 || ^24.15.0 || >=26.0.0`. Desde `E:\AI Cowork`, ejecutar `npm ci` cuando falten dependencias; después `npm run build` y `npm start`. Para desarrollo, `npm run dev`.

No hace falta repetir instalaciones individuales de Howler, updater o Vitest. La auditoría previa verificó una instalación limpia con `npm ci`; esta revisión conservó la instalación actual y no modificó `package.json` ni `package-lock.json`.
