// Anuncios de Google AdMob: un anuncio a pantalla completa antes de ver el resultado (solo sorteos gratis).
// IDs reales: variables de GitHub ADMOB_IOS_INTERSTITIAL / ADMOB_ANDROID_INTERSTITIAL. Sin ellas, anuncios de prueba de Google.
// Solo anuncios no personalizados: así no hace falta pedir permiso de rastreo (ATT) en iPhone.
// En Europa, Google exige el aviso de consentimiento (AdsConsent), que se enseña la primera vez si hace falta.
import { Platform } from 'react-native';
import mobileAds, { AdEventType, AdsConsent, InterstitialAd, TestIds } from 'react-native-google-mobile-ads';

const UNIDAD =
  (Platform.OS === 'ios'
    ? process.env.EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL
    : process.env.EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL) || TestIds.INTERSTITIAL;

let anuncio: InterstitialAd | null = null;
let cargado = false;
let iniciado = false;

function cargar() {
  try {
    const a = InterstitialAd.createForAdRequest(UNIDAD, { requestNonPersonalizedAdsOnly: true });
    cargado = false;
    a.addAdEventListener(AdEventType.LOADED, () => {
      cargado = true;
    });
    a.addAdEventListener(AdEventType.ERROR, () => {
      cargado = false;
    });
    a.load();
    anuncio = a;
  } catch {
    anuncio = null;
  }
}

export async function prepararAnuncios() {
  try {
    const info = await AdsConsent.requestInfoUpdate();
    if (info.isConsentFormAvailable) await AdsConsent.loadAndShowConsentFormIfRequired();
  } catch {
    // Sin aviso de consentimiento disponible: se sigue igual
  }
  try {
    await mobileAds().initialize();
    iniciado = true;
    cargar();
  } catch {
    iniciado = false;
  }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Enseña el anuncio y termina cuando se cierra. Si no hay anuncio en 5 s, sigue sin él (nunca bloquea el resultado).
export async function mostrarAnuncio(): Promise<void> {
  if (!iniciado) return;
  if (!anuncio) cargar();
  for (let i = 0; i < 25 && !cargado; i++) await esperar(200);
  const a = anuncio;
  if (!a || !cargado) return;
  await new Promise<void>((resolver) => {
    let hecho = false;
    const fin = () => {
      if (hecho) return;
      hecho = true;
      quitarCerrado();
      quitarError();
      resolver();
    };
    const quitarCerrado = a.addAdEventListener(AdEventType.CLOSED, fin);
    const quitarError = a.addAdEventListener(AdEventType.ERROR, fin);
    a.show().catch(fin);
  });
  cargar(); // el siguiente, preparado
}
