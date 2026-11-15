<?php
// ============================================================
//  Secretoogift · servidor
//  Se publica en /sorteo/ junto a index.html. Crea sola la carpeta "data".
// ============================================================

// ---- CONFIGURA ESTO ----
const FROM_EMAIL = '__EMAIL_REMITENTE__';   // se pone al publicar (variable EMAIL_REMITENTE de GitHub)
const FROM_NAME  = 'Secretoogift';
// ------------------------

const MAX_PEOPLE        = 60;   // participantes máximos por sorteo
const MAX_REGISTER_HOUR = 30;   // sorteos que puede crear una misma conexión por hora
const MAX_MAILS_FACTOR  = 3;    // correos máximos por sorteo = participantes × 3
const KEEP_DAYS         = 120;  // los sorteos se borran a los 120 días

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') exit;

$DIR = __DIR__ . '/data';
if (!is_dir($DIR)) { @mkdir($DIR, 0755, true); }
if (!file_exists("$DIR/.htaccess")) { @file_put_contents("$DIR/.htaccess", "Require all denied\nDeny from all\n"); }
if (!file_exists("$DIR/index.html")) { @file_put_contents("$DIR/index.html", ''); }

function out($a, $code = 200) { http_response_code($code); echo json_encode($a, JSON_UNESCAPED_UNICODE); exit; }
function fail($msg, $code = 400) { out(['error' => $msg], $code); }
function cid($s) { return preg_replace('/[^a-z0-9]/i', '', substr((string)$s, 0, 40)); }
function path($d) { global $DIR; return "$DIR/d_" . $d . '.json'; }
function load($d) { $f = path($d); if (!$d || !is_file($f)) return null; return json_decode(file_get_contents($f), true); }
function store($d, $data) { file_put_contents(path($d), json_encode($data, JSON_UNESCAPED_UNICODE), LOCK_EX); }
function check_key($draw, $k) { return $draw && hash_equals($draw['k'], hash('sha256', (string)$k)); }
// Enlaces cortos: s_<código>.json apunta a un sorteo y a una persona
function corto_nuevo() {
  global $DIR; $abc = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  do { $c = ''; for ($i = 0; $i < 7; $i++) $c .= $abc[random_int(0, strlen($abc) - 1)]; } while (is_file("$DIR/s_$c.json"));
  return $c;
}

function rate_limit($what, $max) {
  global $DIR;
  $f = "$DIR/rl_" . md5(($_SERVER['REMOTE_ADDR'] ?? '') . $what) . '.json';
  $now = time(); $list = is_file($f) ? (json_decode(file_get_contents($f), true) ?: []) : [];
  $list = array_values(array_filter($list, fn($t) => $t > $now - 3600));
  if (count($list) >= $max) fail('rate', 429);
  $list[] = $now; file_put_contents($f, json_encode($list), LOCK_EX);
}

// ---- Envío de correo: SMTP de IONOS (si está configurado en correo.php) o, si no, mail() ----
require_once __DIR__ . '/correo-smtp.php';

// Limpieza ocasional de sorteos antiguos
if (mt_rand(1, 50) === 1) {
  foreach (glob("$DIR/*.json") as $f) { if (filemtime($f) < time() - KEEP_DAYS * 86400) @unlink($f); }
}

$a  = $_GET['a'] ?? '';
$in = json_decode(file_get_contents('php://input'), true) ?: [];

switch ($a) {

  case 'ping':
    out(['ok' => 1]);

  // Guarda (o actualiza tras repetir el sorteo) los participantes
  case 'register': {
    $d = cid($in['d'] ?? ''); $k = (string)($in['k'] ?? '');
    if (strlen($d) < 10 || !preg_match('/^[a-z0-9]{16,64}$/i', $k)) fail('bad');
    $people = $in['people'] ?? [];
    if (!is_array($people) || count($people) < 3 || count($people) > MAX_PEOPLE) fail('bad');
    $old = load($d);
    if ($old && !check_key($old, $k)) fail('forbidden', 403);
    if (!$old) rate_limit('register', MAX_REGISTER_HOUR);
    $list = []; $cortos = [];
    foreach ($people as $p) {
      $t = cid($p['t'] ?? ''); if (strlen($t) < 8) fail('bad');
      $e = trim((string)($p['e'] ?? ''));
      if ($e !== '' && !filter_var($e, FILTER_VALIDATE_EMAIL)) $e = '';
      $c = preg_replace('/[^0-9a-f]/i', '', substr((string)($p['c'] ?? ''), 0, 4000));
      // El mismo código corto de siempre para cada persona (si se repite el sorteo, el enlace sigue siendo el mismo)
      $s = $old['people'][$t]['s'] ?? '';
      if ($c !== '' && $s === '') $s = corto_nuevo();
      if ($s !== '') { file_put_contents("$DIR/s_$s.json", json_encode(['d' => $d, 't' => $t]), LOCK_EX); $cortos[$t] = $s; }
      $list[$t] = ['n' => mb_substr((string)($p['n'] ?? ''), 0, 40), 'e' => $e, 'c' => $c, 's' => $s];
    }
    store($d, [
      'k' => hash('sha256', $k),
      'people' => $list,
      'opened' => [],
      'mails' => $old['mails'] ?? 0,
      'created' => $old['created'] ?? time(),
    ]);
    out(['ok' => 1, 'cortos' => (object)$cortos]);
  }

  // Enlace corto → el resultado (cifrado) de esa persona
  case 'get': {
    $s = preg_replace('/[^A-Za-z0-9]/', '', substr((string)($_GET['s'] ?? ''), 0, 16));
    $f = "$DIR/s_$s.json";
    if (!$s || !is_file($f)) fail('notfound', 404);
    $r = json_decode(file_get_contents($f), true);
    $draw = load(cid($r['d'] ?? ''));
    $c = $draw['people'][$r['t'] ?? '']['c'] ?? '';
    if (!$c) fail('notfound', 404);
    out(['c' => $c]);
  }

  // Lo llama el enlace de cada participante al ver su resultado
  case 'open': {
    $d = cid($_GET['d'] ?? ''); $t = cid($_GET['t'] ?? '');
    $draw = load($d);
    if (!$draw || !isset($draw['people'][$t])) out(['ok' => 0]);
    if (empty($draw['opened'][$t])) { $draw['opened'][$t] = time(); store($d, $draw); }
    out(['ok' => 1]);
  }

  // El organizador consulta quién ha abierto su enlace
  case 'status': {
    $draw = load(cid($_GET['d'] ?? ''));
    if (!check_key($draw, $_GET['k'] ?? '')) fail('forbidden', 403);
    out(['opened' => (object)$draw['opened']]);
  }

  // Envía los correos (solo a los emails guardados en el sorteo)
  case 'mail': {
    $d = cid($in['d'] ?? ''); $draw = load($d);
    if (!check_key($draw, $in['k'] ?? '')) fail('forbidden', 403);
    $items = $in['items'] ?? [];
    if (!is_array($items)) fail('bad');
    $limit = count($draw['people']) * MAX_MAILS_FACTOR;
    $sent = 0;
    foreach ($items as $it) {
      if ($draw['mails'] >= $limit) break;
      $t = cid($it['t'] ?? '');
      $to = $draw['people'][$t]['e'] ?? '';
      if (!$to) continue;
      $subject = mb_substr(str_replace(["\r", "\n"], ' ', (string)($it['s'] ?? '')), 0, 150);
      $body = mb_substr((string)($it['b'] ?? ''), 0, 3000);
      $html = is_array($it['h'] ?? null) ? correo_html($it['h']) : null;
      if (enviar_correo($to, $subject, $body, $html)) { $sent++; $draw['mails']++; }
    }
    store($d, $draw);
    out(['sent' => $sent]);
  }

  default:
    fail('unknown', 404);
}
