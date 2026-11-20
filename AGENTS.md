# Escaparate público de kywai: reglas para agentes

Este repositorio es PÚBLICO. Aquí solo van la web (web/), los instaladores de una línea, el README y los flujos de publicación.

- NUNCA subas aquí código de la app (src/, android/app, package.json…). El código vive en Yiku21/kywai-original, privado. La web lo comprueba y se para si lo encuentra.
- android/release, docs/MANUAL.md, docs/mods, LICENSE y scripts/instalar-kywai.* los copia solo el flujo «Publicar escritorio» desde el código cada 10 minutos: cámbialos en kywai-original, no aquí.
- Las versiones de escritorio (Releases) también las crea ese flujo. No publiques Releases a mano.
- Los cambios de la web se hacen aquí, en web/. `node web/build.mjs` la genera en web/dist. Para `node web/comprobar.mjs` pon en KYWAI_CODIGO la carpeta de un clon de kywai-original (compara la web con el catálogo de la app).
- Textos en español, commits en español pensando en quien usa la app. Nunca escribir el código de acceso ni la IP del servidor.
