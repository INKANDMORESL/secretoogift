# Secretoogift: notas para Claude

- El dueño (Adrián, INKANDMORE SL) no programa. Explica en español, con pasos sencillos, y no le pidas usar la terminal.
- Nunca pidas contraseñas ni claves en el chat: van en los secretos/variables de GitHub.
- Qué es: app de amigo invisible (iPhone primero, luego Android). Gratis hasta 6 participantes con un anuncio antes de cada
  resultado; sorteo premium 0,99 € (consumible `secretoogift_sorteo_premium`, pago único por sorteo): exclusiones,
  ilimitados, sin anuncios, edición total, nombre del organizador destacado, ayuda personalizada. 6 idiomas (es, en, pt, fr, it, de).
  Colores azul marino #0b3a7a, azul #1a56b8, amarillo #ffc20e y blanco. Muy simple e intuitiva: nada de registro ni cuentas.

## Estructura
- `sorteo/`: LA app (una sola página HTML+JS). `plantilla.html` (estilos), `i18n.js` (todos los textos, 6 idiomas),
  `main.js` (lógica), `logo.b64`. `herramientas/construir.mjs` la monta:
  - `web` → `publicar/` = `web/` + `sorteo/index.html` + `sorteo/api.php` (para IONOS).
  - `app` → `movil/src/web.ts` (la misma página como texto, con las fuentes dentro). Se guarda en git (ver abajo).
  Datos que se ponen al construir (variables de GitHub): DOMINIO (por defecto secretoogift.com), EMAIL_SOPORTE,
  EMAIL_REMITENTE, APPSTORE_ID. En los archivos van como `__DOMINIO__`, `__EMAIL_SOPORTE__`…
- `movil/`: app Expo (SDK 58) = WebView con `src/web.ts` y `baseUrl` https://DOMINIO/sorteo/ (así `api.php` y los enlaces
  funcionan). Puente web ↔ móvil: la web llama `nativo(tipo, datos)` → `App.tsx` responde con `window.__nativo`.
  Tipos: `anuncio` (AdMob intersticial, `src/anuncios.ts`, solo no personalizados + aviso de consentimiento UE),
  `comprar` (RevenueCat, `src/pagos.ts`), `copiar`, `compartir`, `abrir` (enlaces de fuera), `atras` (Android).
  En la web, `IS_APP` = `window.IS_NATIVE_APP`. Enlaces de resultado: `secretoogift://r#código` o https://DOMINIO/sorteo/#código.
- Enlaces cortos: https://DOMINIO/#Ab3xK9 (la portada `web/index.html` lo pasa a /sorteo/#Ab3xK9; `api.php?a=get` da el código largo cifrado). Sin .htaccess: en IONOS la redirección /s/… no funcionaba.
  En el navegador solo se ven resultados de sorteos PREMIUM; los gratis piden descargar la app (y allí, anuncio). Sin enlace, /sorteo/ redirige a la portada: los sorteos solo se crean en la app.
- `servidor/api.php`: PHP sin base de datos (JSON en `sorteo/data/`, se borra a los 120 días). Acciones: register (devuelve `cortos`), get, open,
  status, mail (solo a emails guardados, límite por sorteo). Remitente FROM_EMAIL = EMAIL_REMITENTE.
- Panel `web/panel/index.php` (https://DOMINIO/panel/): contraseña propia (la crea el dueño la primera vez, `sorteo/data/panel.json`). Lee `servidor/estadisticas.php`: `est_AAAA-MM.json` (cuentas por día: sorteos, participantes, premium, abiertos, correos, ad, web, paywall; `_tam`, `_idioma`) y `pagos.jsonl` (aviso de RevenueCat → `api.php?a=revenuecat&clave=…`). Ingresos «te llega» = precio sin IVA (17,36 %) y sin el 15 % de Apple; anuncios = estimación con eCPM ajustable. La app manda `api.php?a=ev&e=ad|paywall` y la portada `e=web`. La limpieza de 120 días solo borra d_, s_ y rl_.
- `web/`: portada para descargar la app (6 idiomas, capturas en `web/img/{idioma}_{home,gift,group}.webp`) y `legal.html`.
- `tienda/`: capturas App Store 1320×2868 (`capturas.py`) y `textos-app-store.txt`.

## GitHub Actions
- `comprobar.yml` (cada push): construye web y app, `node --check`, `php -l`, `expo install --check` (si falla, `--fix` y
  guarda package.json solo) y TypeScript. En esta sesión no hay registro de npm: la comprobación real la hace GitHub.
- `movil/src/web.ts` SE GUARDA en git (generado): Expo compila con los archivos que ve git; si se ignora, falla «Bundle JavaScript». Los flujos lo regeneran antes de compilar.
- `ios.yml` «App iPhone» (a mano): igual que Yococino. Secrets EXPO_TOKEN, ASC_API_KEY_P8, ASC_KEY_ID, ASC_ISSUER_ID,
  APPLE_TEAM_ID; variables ASC_APP_ID (sin ella crea la app pero no la sube), REVENUECAT_IOS_KEY, ADMOB_IOS_APP_ID,
  ADMOB_IOS_INTERSTITIAL (sin AdMob: anuncios de prueba de Google). Bundle `app.secretoogift`.
- `android.yml` «App Android» (a mano): .aab en Expo. Variables REVENUECAT_ANDROID_KEY, ADMOB_ANDROID_APP_ID, ADMOB_ANDROID_INTERSTITIAL.
- `web.yml` «Web» (push en web/, sorteo/, servidor/): publica en IONOS por SFTP (secrets IONOS_HOST, IONOS_USUARIO,
  IONOS_CONTRASENA; variable IONOS_CARPETA). Nunca borra nada (ni `sorteo/data`). Sin acceso, deja un zip para FileZilla.
- `instalar-paquetes.yml`: `expo install` de paquetes nuevos.

## Pendiente
- Universal links (abrir la app directamente desde https://DOMINIO/sorteo/#…): necesita Associated Domains en Apple y
  `.well-known/apple-app-site-association`. De momento, la web ofrece «Ya tengo la app: abrir» (secretoogift://) y la App Store.
- Correo: `servidor/correo-smtp.php` envía por SMTP (smtp.ionos.es:587, STARTTLS) si existe `sorteo/data/correo.json`, que se crea desde la página privada `/sorteo/correo.php` (el dueño escribe ahí la contraseña del buzón). Si no, mail() (en IONOS dice «enviado» pero no llega). Errores en `sorteo/data/correo-errores.log`.
- `react-native-google-mobile-ads` está en "latest": fijar la versión cuando funcione la primera compilación.
