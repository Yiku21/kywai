# Instrucciones para agentes que trabajan en este repositorio

Antes de cambiar nada, lee [docs/RELEVO.md](docs/RELEVO.md) (reglas, configuración y qué no tocar) y
[docs/CONTEXTO-DEL-PROYECTO.md](docs/CONTEXTO-DEL-PROYECTO.md) (mapa del código). Lo más importante:

- Todo en español. Los cambios van a `master` de los dos repositorios (kywai-original y kywai).
- Añade los archivos uno a uno (nunca `git add -A`): hay otras sesiones editando a la vez.
- Un commit por mejora. `npm run typecheck` y `npx vitest run` antes de subir.
- Todo texto visible lleva traducción en `src/shared/i18n-{en,pt,fr,zh}.ts`.
- Nunca escribas el código de acceso, claves, llaves de dispositivo ni la IP del servidor.
- En el repositorio público, usa atribuciones genéricas y omite nombres personales, enlaces o identificadores de chats y campos como `Claude-Session` en código, commits y descripciones de PR. Conserva los créditos de autoría sin enlaces a conversaciones.
- No renombres lo interno «AI Cowork» (carpeta de datos, appId, paquete Android): ver RELEVO §1.
- Nada de JSON ni comillas en los argumentos de los CLIs de los agentes (`src/main/agents/spawn.ts`).
