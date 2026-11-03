# Android: instalación e integración verificada

Verificación final del 11 de octubre de 2026, después de integrar API móvil, Android, paridad 3D y música.

## Resultado

- Node: 124 pruebas correctas; la prueba externa se ejecuta por separado con el harness.
- Typecheck, compilación Electron y compilación web: correctos.
- Android: 69 pruebas de app correctas y 1 externa omitida en la batería normal; 3 pruebas de mockserver correctas. Lint sin errores; `assembleDebug` y `assembleRelease` correctos.
- Harness HTTPS/Tailscale contra API, almacén y orquestador reales: integración JVM y 4 pruebas del emulador correctas, incluidas TLS, emparejamiento, chat, Android Keystore, escena 3D y gestos.
- Los proveedores IA se sustituyen por respuestas deterministas en el harness; no hace consultas de pago. No se ha probado un móvil físico.
- La APK, cachés, informes de pruebas, `local.properties`, archivos de entorno y certificados locales quedan fuera del commit. Las capturas de referencia se conservan como documentación.

## Compilar e instalar

Requisitos y controles del espacio 3D: [android/README.md](../android/README.md).

```sh
cd android
./gradlew test lint assembleDebug assembleRelease
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

La APK debug usa `com.aicowork.remote.debug` y requiere Android 8.0/API 26 o superior. La APK release se genera sin firma de publicación configurada; no se distribuye aquí como entrega firmada. El simulador es exclusivo de pruebas y no está incluido en las APK normales.

## Conectar al ordenador

1. Ejecuta la versión actualizada de AI Cowork: `npm run build` y `npm start` desde la raíz. Activa «Acceso desde otros dispositivos». Si la instancia anterior sigue abierta, elige un puerto HTTP libre; HTTPS usa el puerto siguiente.
2. Mantén Tailscale activo en ambos equipos. En Android escribe `https://<IP-Tailscale>:<puerto-HTTPS>` de esa instancia.
3. Compara la huella completa con `openssl x509 -in <workspaceRoot>/web-cert/cert.pem -noout -fingerprint -sha256`. Confirma el certificado e introduce el código que muestra esa instancia, respetando mayúsculas.

Una versión antigua del escritorio puede carecer de `/api/mobile/v1`; Android lo detecta y solicita actualizarla.

## Repetir la integración real

Con un emulador/dispositivo de pruebas conectado y sin una sesión personal:

```sh
AI_COWORK_ANDROID_INTEGRATION=1 AI_COWORK_ANDROID_DEVICE=1 AI_COWORK_TAILSCALE_HOST=<IP-Tailscale-del-ordenador> npm run test -- --run src/main/mobileApi.test.ts -t 'cliente Android'
```

El harness genera credenciales temporales y se las pasa a las pruebas instrumentales. No ejecutes `RealServerDeviceTest` sin esos argumentos. Capturas: [espacio 3D](android-space-parity.png) e [inicio de Android](android-device.png).
