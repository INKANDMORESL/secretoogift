<?php
// Estadísticas de Secretoogift para el panel. Solo cuentas por día (nada de nombres ni emails).
//   data/est_AAAA-MM.json  → { "AAAA-MM-DD": {sorteos, participantes, premium, abiertos, correos, ad, web, paywall}, "_tam": {...}, "_idioma": {...} }
//   data/pagos.jsonl       → un pago o reembolso por línea (avisos de RevenueCat)
//   data/panel.json        → contraseña del panel (cifrada), secreto del aviso de RevenueCat y ajustes
date_default_timezone_set('Europe/Madrid');

function est_dir() { return __DIR__ . '/data'; }

// Suma contadores al día de hoy (o al de $ts). Las claves con array van al mes (p. ej. 'idioma' => ['es' => 1]).
function est_sumar($campos, $ts = null) {
  $ts = $ts ?: time();
  $f = est_dir() . '/est_' . date('Y-m', $ts) . '.json';
  $dia = date('Y-m-d', $ts);
  $fp = @fopen($f, 'c+'); if (!$fp) return;
  flock($fp, LOCK_EX);
  $d = json_decode(stream_get_contents($fp) ?: '{}', true) ?: [];
  foreach ($campos as $k => $v) {
    if (is_array($v)) { foreach ($v as $kk => $vv) $d['_' . $k][$kk] = ($d['_' . $k][$kk] ?? 0) + $vv; }
    elseif ($v) $d[$dia][$k] = ($d[$dia][$k] ?? 0) + $v;
  }
  ftruncate($fp, 0); rewind($fp); fwrite($fp, json_encode($d)); fflush($fp);
  flock($fp, LOCK_UN); fclose($fp);
}

function est_tam($n) { return $n <= 4 ? '3-4' : ($n <= 6 ? '5-6' : ($n <= 10 ? '7-10' : ($n <= 20 ? '11-20' : '21+'))); }

// ¿Es premium? Lo dice el código cifrado del resultado (campo p), por si la app no lo manda aparte.
function est_premium_de_codigo($hex) {
  $hex = preg_replace('/[^0-9a-f]/i', '', (string)$hex);
  if (strlen($hex) < 6 || strlen($hex) % 2) return null;
  $b = array_map('hexdec', str_split($hex, 2)); $suma = array_pop($b);
  $clave = 'vibra-santa-2026'; $t = ''; $s = 0;
  foreach ($b as $i => $x) { $c = $x ^ ord($clave[$i % strlen($clave)]); $t .= chr($c); $s = ($s + $c) % 256; }
  if ($s !== $suma) return null;
  $j = json_decode($t, true);
  return is_array($j) ? !empty($j['p']) : null;
}

function panel_config() {
  $f = est_dir() . '/panel.json';
  return is_file($f) ? (json_decode(file_get_contents($f), true) ?: []) : [];
}
function panel_guardar($c) { file_put_contents(est_dir() . '/panel.json', json_encode($c), LOCK_EX); }

// Aviso de RevenueCat (compra o reembolso). Devuelve true si se ha guardado.
function est_pago_revenuecat($cuerpo) {
  $e = $cuerpo['event'] ?? null; if (!is_array($e)) return false;
  $c = panel_config(); $c['webhook_at'] = time(); $c['webhook_tipo'] = (string)($e['type'] ?? ''); panel_guardar($c);
  $tipo = (string)($e['type'] ?? '');
  if (!in_array($tipo, ['NON_RENEWING_PURCHASE', 'INITIAL_PURCHASE', 'CANCELLATION', 'REFUND'], true)) return false;
  $id = (string)($e['transaction_id'] ?? $e['id'] ?? '');
  $f = est_dir() . '/pagos.jsonl';
  if ($id && is_file($f) && strpos(file_get_contents($f), '"id":' . json_encode($id) . ',"tipo":' . json_encode($tipo)) !== false) return false;
  $p = [
    'id' => $id, 'tipo' => $tipo,
    'ts' => (int)(($e['purchased_at_ms'] ?? $e['event_timestamp_ms'] ?? time() * 1000) / 1000),
    'producto' => (string)($e['product_id'] ?? ''),
    'pais' => strtoupper(substr((string)($e['country_code'] ?? ''), 0, 2)),
    'tienda' => (string)($e['store'] ?? ''),
    'prueba' => strtoupper((string)($e['environment'] ?? '')) === 'SANDBOX',
    'usd' => (float)($e['price'] ?? 0),
    'importe' => (float)($e['price_in_purchased_currency'] ?? 0),
    'moneda' => strtoupper((string)($e['currency'] ?? '')),
    'impuestos' => isset($e['tax_percentage']) ? (float)$e['tax_percentage'] : null,
    'comision' => isset($e['commission_percentage']) ? (float)$e['commission_percentage'] : null,
  ];
  file_put_contents($f, json_encode($p) . "\n", FILE_APPEND | LOCK_EX);
  return true;
}
