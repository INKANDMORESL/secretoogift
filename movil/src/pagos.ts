// Pago del sorteo premium (0,99 €) con RevenueCat: producto de compra única «consumible», uno por sorteo.
// Claves públicas: variables de GitHub REVENUECAT_IOS_KEY / REVENUECAT_ANDROID_KEY.
// ID del producto en App Store Connect y Google Play: secretoogift_sorteo_premium
import { Platform } from 'react-native';
import Purchases, { PRODUCT_CATEGORY } from 'react-native-purchases';

export const PRODUCTO = 'secretoogift_sorteo_premium';

const CLAVE =
  Platform.OS === 'ios' ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

let listo = false;

export function prepararPagos() {
  if (!CLAVE) return;
  try {
    Purchases.configure({ apiKey: CLAVE });
    listo = true;
  } catch {
    listo = false;
  }
}

export type ResultadoPago = 'ok' | 'cancelado' | 'sin_pagos' | 'error';

export async function comprarPremium(): Promise<ResultadoPago> {
  if (!listo) return 'sin_pagos';
  try {
    const productos = await Purchases.getProducts([PRODUCTO], PRODUCT_CATEGORY.NON_SUBSCRIPTION);
    if (!productos.length) return 'sin_pagos';
    await Purchases.purchaseStoreProduct(productos[0]);
    return 'ok';
  } catch (e) {
    if ((e as { userCancelled?: boolean })?.userCancelled) return 'cancelado';
    return 'error';
  }
}
