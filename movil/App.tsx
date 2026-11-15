// Secretoogift: la app es la página del sorteo (sorteo/ → src/web.ts) dentro de un WebView,
// con lo nativo que la web no puede hacer sola: anuncios (AdMob), pago del sorteo premium (RevenueCat),
// copiar, compartir, abrir WhatsApp/correo y abrir los enlaces de resultado (secretoogift://r#código).
import { useCallback, useEffect, useRef } from 'react';
import { BackHandler, Linking, Platform, Share, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import HTML, { DOMINIO } from './src/web';
import { mostrarAnuncio, prepararAnuncios } from './src/anuncios';
import { comprarPremium, prepararPagos } from './src/pagos';

SplashScreen.preventAutoHideAsync().catch(() => {});

const BASE = `https://${DOMINIO}/sorteo/`;

// Saca el código del resultado de un enlace: https://dominio/sorteo/#abc… o secretoogift://r#abc…
function codigoDe(url: string | null): string | null {
  if (!url) return null;
  const i = url.indexOf('#');
  if (i < 0) return null;
  const c = url.slice(i + 1);
  return /^[0-9a-f]{6,}$/i.test(c) ? c : null;
}

type Mensaje = { id?: number; tipo?: string; datos?: Record<string, unknown> };

export default function App() {
  const web = useRef<WebView>(null);
  const cargada = useRef(false);
  const pendiente = useRef<string | null>(null);

  const abrirCodigo = useCallback((codigo: string) => {
    if (cargada.current) web.current?.injectJavaScript(`location.hash=${JSON.stringify('#' + codigo)};true;`);
    else pendiente.current = codigo;
  }, []);

  useEffect(() => {
    prepararPagos();
    prepararAnuncios();
    Linking.getInitialURL().then((u) => {
      const c = codigoDe(u);
      if (c) abrirCodigo(c);
    });
    const sub = Linking.addEventListener('url', ({ url }) => {
      const c = codigoDe(url);
      if (c) abrirCodigo(c);
    });
    return () => sub.remove();
  }, [abrirCodigo]);

  // Botón «atrás» de Android: pulsa el «‹» de la pantalla; si no hay, sale de la app
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      web.current?.injectJavaScript(
        `(function(){var b=document.querySelector('.back');if(b)b.click();window.ReactNativeWebView.postMessage(JSON.stringify({tipo:'atras',datos:{hay:!!b}}))})();true;`,
      );
      return true;
    });
    return () => sub.remove();
  }, []);

  const responder = (id: number | undefined, ok: boolean, datos?: unknown) => {
    if (id == null) return;
    web.current?.injectJavaScript(`window.__nativo&&window.__nativo(${JSON.stringify({ id, ok, datos })});true;`);
  };

  const alMensaje = async (e: WebViewMessageEvent) => {
    let m: Mensaje;
    try {
      m = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    const { id, tipo, datos = {} } = m;
    try {
      switch (tipo) {
        case 'anuncio':
          await mostrarAnuncio();
          return responder(id, true);
        case 'comprar': {
          const r = await comprarPremium();
          return responder(id, r === 'ok', r);
        }
        case 'copiar':
          await Clipboard.setStringAsync(String(datos.texto ?? ''));
          return responder(id, true);
        case 'compartir':
          await Share.share({ message: String(datos.texto ?? '') });
          return responder(id, true);
        case 'abrir':
          await Linking.openURL(String(datos.url ?? ''));
          return responder(id, true);
        case 'atras':
          if (!datos.hay) BackHandler.exitApp();
          return;
        default:
          return responder(id, false);
      }
    } catch (err) {
      responder(id, false, String(err));
    }
  };

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: '#F5F8FF' }}>
        <StatusBar style="dark" />
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <WebView
            ref={web}
            source={{ html: HTML, baseUrl: BASE }}
            originWhitelist={['*']}
            injectedJavaScriptBeforeContentLoaded="window.IS_NATIVE_APP=true;true;"
            onMessage={alMensaje}
            onLoadEnd={() => {
              cargada.current = true;
              SplashScreen.hideAsync().catch(() => {});
              if (pendiente.current) {
                const c = pendiente.current;
                pendiente.current = null;
                abrirCodigo(c);
              }
            }}
            onShouldStartLoadWithRequest={(r) => {
              const url = r.url || '';
              if (url === BASE || url.startsWith(BASE + '#') || url.startsWith('about:') || url.startsWith('data:')) return true;
              Linking.openURL(url).catch(() => {});
              return false;
            }}
            setSupportMultipleWindows={false}
            bounces={false}
            overScrollMode="never"
            allowsBackForwardNavigationGestures={false}
            keyboardDisplayRequiresUserAction={false}
            textZoom={100}
            style={{ backgroundColor: '#F5F8FF' }}
          />
        </SafeAreaView>
      </View>
    </SafeAreaProvider>
  );
}
