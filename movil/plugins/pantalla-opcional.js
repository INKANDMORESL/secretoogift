// Google Play: que la pantalla vertical sea opcional (si no, la app no se ofrece en tablets, Chromebooks ni Android XR)
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function pantallaOpcional(config) {
  return withAndroidManifest(config, (c) => {
    const m = c.modResults.manifest;
    m.$ = m.$ || {};
    m.$['xmlns:tools'] = m.$['xmlns:tools'] || 'http://schemas.android.com/tools';
    const lista = (m['uses-feature'] = m['uses-feature'] || []);
    for (const nombre of ['android.hardware.screen.portrait', 'android.hardware.screen.landscape']) {
      const ya = lista.find((f) => f.$ && f.$['android:name'] === nombre);
      if (ya) { ya.$['android:required'] = 'false'; ya.$['tools:replace'] = 'android:required'; }
      else lista.push({ $: { 'android:name': nombre, 'android:required': 'false', 'tools:replace': 'android:required' } });
    }
    return c;
  });
};
