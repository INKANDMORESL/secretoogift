// Construye la página del sorteo a partir de sorteo/ y pone los datos del proyecto.
//   node herramientas/construir.mjs web <carpeta>  → copia web/ + sorteo/index.html + sorteo/api.php listos para IONOS
//   node herramientas/construir.mjs app            → movil/src/web.ts (la misma página, dentro de la app)
// Datos (variables de GitHub; si faltan, se usan estos valores por defecto):
//   DOMINIO (secretoogift.com), EMAIL_SOPORTE (info@DOMINIO), EMAIL_REMITENTE (no-reply@DOMINIO), APPSTORE_ID (vacío)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = (k) => (process.env[k] || '').trim();
const DOMINIO = env('DOMINIO').replace(/^https?:\/\//, '').replace(/\/+$/, '') || 'secretoogift.com';
const DATOS = {
  __DOMINIO__: DOMINIO,
  __EMAIL_SOPORTE__: env('EMAIL_SOPORTE') || `info@${DOMINIO}`,
  __EMAIL_REMITENTE__: env('EMAIL_REMITENTE') || `no-reply@${DOMINIO}`,
  __APPSTORE_ID__: env('APPSTORE_ID').replace(/\D/g, ''),
};

function poner(texto) {
  // Sin ID de la App Store todavía: fuera el aviso de Safari para descargar la app
  if (!DATOS.__APPSTORE_ID__) texto = texto.replace(/<meta name="apple-itunes-app"[^>]*>\n?/g, '');
  for (const [k, v] of Object.entries(DATOS)) texto = texto.split(k).join(v);
  return texto;
}

const leer = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

function paginaSorteo(fuentes) {
  const script =
    `const LOGO="data:image/webp;base64,${leer('sorteo/logo.b64').trim()}";\n` +
    leer('sorteo/i18n.js') + '\n' + leer('sorteo/main.js');
  return poner(leer('sorteo/plantilla.html').replace('/*FUENTES*/', fuentes).replace('/*SCRIPT*/', () => script));
}

const FUENTES = [
  ['Inter', 'inter-400.woff', '400 500'],
  ['Inter', 'inter-600.woff', '600 700'],
  ['Bricolage Grotesque', 'interdisplay-800.woff', '500 800'],
];
const cssFuentes = (url) =>
  FUENTES.map(([fam, f, w]) => `@font-face{font-family:"${fam}";src:url(${url(f)}) format('woff');font-weight:${w};font-display:swap}`).join('\n') + '\n';

function copiar(origen, destino) {
  fs.mkdirSync(destino, { recursive: true });
  for (const e of fs.readdirSync(origen, { withFileTypes: true })) {
    const o = path.join(origen, e.name), d = path.join(destino, e.name);
    if (e.isDirectory()) copiar(o, d);
    else if (/\.(html|php|js|css|txt|json)$/.test(e.name)) fs.writeFileSync(d, poner(fs.readFileSync(o, 'utf8')));
    else fs.copyFileSync(o, d);
  }
}

const modo = process.argv[2];
if (modo === 'web') {
  const salida = path.resolve(process.argv[3] || 'publicar');
  fs.rmSync(salida, { recursive: true, force: true });
  copiar(path.join(RAIZ, 'web'), salida);
  fs.mkdirSync(path.join(salida, 'sorteo'), { recursive: true });
  fs.writeFileSync(path.join(salida, 'sorteo/index.html'), paginaSorteo(cssFuentes((f) => `../fonts/${f}`)));
  fs.writeFileSync(path.join(salida, 'sorteo/api.php'), poner(leer('servidor/api.php')));
  console.log(`Web lista en ${salida} (dominio ${DOMINIO})`);
} else if (modo === 'app') {
  const b64 = (f) => `data:font/woff;base64,${fs.readFileSync(path.join(RAIZ, 'web/fonts', f)).toString('base64')}`;
  const html = paginaSorteo(cssFuentes(b64));
  const ts = `// Archivo generado por herramientas/construir.mjs: no editar a mano.\nexport const DOMINIO = ${JSON.stringify(DOMINIO)};\nconst HTML: string = ${JSON.stringify(html)};\nexport default HTML;\n`;
  fs.mkdirSync(path.join(RAIZ, 'movil/src'), { recursive: true });
  fs.writeFileSync(path.join(RAIZ, 'movil/src/web.ts'), ts);
  console.log(`movil/src/web.ts listo (${Math.round(html.length / 1024)} KB, dominio ${DOMINIO})`);
} else {
  console.error('Uso: node herramientas/construir.mjs web <carpeta> | app');
  process.exit(1);
}
