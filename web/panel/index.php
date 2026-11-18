<?php
// ============================================================
//  Secretoogift · panel de gestión (https://DOMINIO/panel/)
//  Lee las cuentas que guarda el servidor del sorteo (../sorteo/data). Sin nombres ni emails.
// ============================================================
require_once __DIR__ . '/../sorteo/estadisticas.php';
header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex, nofollow');
header('X-Frame-Options: DENY');
header("Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'unsafe-inline'");

$DIR = est_dir();
if (!is_dir($DIR)) @mkdir($DIR, 0755, true);
if (!file_exists("$DIR/.htaccess")) @file_put_contents("$DIR/.htaccess", "Require all denied\nDeny from all\n");

session_set_cookie_params(['lifetime' => 0, 'path' => '/panel/', 'secure' => true, 'httponly' => true, 'samesite' => 'Strict']);
session_name('sgpanel');
session_start();

$cfg = panel_config();
$e = fn($t) => htmlspecialchars((string)$t, ENT_QUOTES, 'UTF-8');
$msg = '';
$csrf = $_SESSION['csrf'] ?? ($_SESSION['csrf'] = bin2hex(random_bytes(16)));
$post = ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST';
if ($post && !hash_equals($csrf, (string)($_POST['csrf'] ?? ''))) { http_response_code(400); exit('Solicitud no válida. Vuelve a cargar la página.'); }

// Intentos fallidos: como mucho 6 cada 15 minutos por conexión
function intentos($sumar = false) {
  $f = est_dir() . '/rl_panel_' . md5($_SERVER['REMOTE_ADDR'] ?? '') . '.json';
  $l = is_file($f) ? (json_decode(file_get_contents($f), true) ?: []) : [];
  $l = array_values(array_filter($l, fn($t) => $t > time() - 900));
  if ($sumar) { $l[] = time(); file_put_contents($f, json_encode($l), LOCK_EX); }
  return count($l);
}

// ---------- Primera vez: crear la contraseña ----------
if (empty($cfg['hash'])) {
  if ($post && ($_POST['acc'] ?? '') === 'crear') {
    $p1 = (string)($_POST['p1'] ?? ''); $p2 = (string)($_POST['p2'] ?? '');
    if (strlen($p1) < 10) $msg = 'La contraseña tiene que tener al menos 10 caracteres.';
    elseif ($p1 !== $p2) $msg = 'Las dos contraseñas no coinciden.';
    else {
      $cfg['hash'] = password_hash($p1, PASSWORD_DEFAULT);
      $cfg['webhook'] = $cfg['webhook'] ?? bin2hex(random_bytes(20));
      $cfg['creado'] = time();
      panel_guardar($cfg);
      session_regenerate_id(true); $_SESSION['ok'] = 1;
      header('Location: ./'); exit;
    }
  }
  pantalla_acceso('Crea la contraseña del panel', 'Es la primera vez que entras. Elige una contraseña de al menos 10 caracteres: la pedirá cada vez que entres.', true, $msg, $csrf);
  exit;
}

// ---------- Entrar / salir ----------
if (($_GET['salir'] ?? '') === '1') { $_SESSION = []; session_destroy(); header('Location: ./'); exit; }
if (empty($_SESSION['ok'])) {
  if ($post && ($_POST['acc'] ?? '') === 'entrar') {
    if (intentos() >= 6) $msg = 'Demasiados intentos. Espera 15 minutos.';
    elseif (password_verify((string)($_POST['p1'] ?? ''), $cfg['hash'])) { session_regenerate_id(true); $_SESSION['ok'] = 1; header('Location: ./'); exit; }
    else { intentos(true); $msg = 'Contraseña incorrecta.'; }
  }
  pantalla_acceso('Panel de Secretoogift', 'Escribe la contraseña del panel.', false, $msg, $csrf);
  exit;
}

// ---------- Ajustes ----------
if ($post) {
  $acc = $_POST['acc'] ?? '';
  if ($acc === 'ajustes') {
    $cfg['ecpm'] = max(0, min(100, (float)str_replace(',', '.', $_POST['ecpm'] ?? 4)));
    $cfg['eur_usd'] = max(0.5, min(1.5, (float)str_replace(',', '.', $_POST['eur_usd'] ?? 0.86)));
    panel_guardar($cfg); $msg = 'Ajustes guardados.';
  } elseif ($acc === 'clave') {
    if (!password_verify((string)($_POST['actual'] ?? ''), $cfg['hash'])) $msg = 'La contraseña actual no es correcta.';
    elseif (strlen((string)($_POST['p1'] ?? '')) < 10) $msg = 'La nueva tiene que tener al menos 10 caracteres.';
    else { $cfg['hash'] = password_hash((string)$_POST['p1'], PASSWORD_DEFAULT); panel_guardar($cfg); $msg = 'Contraseña cambiada.'; }
  }
}
$ECPM = (float)($cfg['ecpm'] ?? 4);      // € por cada 1.000 anuncios (estimación hasta tener el dato de AdMob)
$EURUSD = (float)($cfg['eur_usd'] ?? 0.86);

// ---------- Primera vez con datos: contar los sorteos que ya había ----------
if (empty($cfg['importado'])) {
  foreach (glob("$DIR/d_*.json") as $f) {
    $d = json_decode(file_get_contents($f), true); if (!$d || !empty($d['est'])) continue;  // los ya contados, no
    $n = count($d['people'] ?? []); $ts = (int)($d['created'] ?? filemtime($f));
    $prem = $d['p'] ?? (est_premium_de_codigo(reset($d['people'])['c'] ?? '') ?? false);
    est_sumar(['sorteos' => 1, 'participantes' => $n, 'premium' => $prem ? 1 : 0, 'abiertos' => count($d['opened'] ?? []),
               'correos' => (int)($d['mails'] ?? 0), 'tam' => [est_tam($n) => 1], 'idioma' => [($d['l'] ?? '') ?: '?' => 1]], $ts);
  }
  $cfg['importado'] = time(); panel_guardar($cfg);
}

// ---------- Leer datos ----------
$dias = []; $tam = []; $idioma = [];
foreach (glob("$DIR/est_*.json") as $f) {
  $m = json_decode(file_get_contents($f), true) ?: [];
  foreach ($m as $k => $v) {
    if ($k === '_tam') { foreach ($v as $a => $b) $tam[$a] = ($tam[$a] ?? 0) + $b; }
    elseif ($k === '_idioma') { foreach ($v as $a => $b) $idioma[$a] = ($idioma[$a] ?? 0) + $b; }
    elseif ($k[0] !== '_') $dias[$k] = $v;
  }
}
ksort($dias);
$pagos = []; $pf = "$DIR/pagos.jsonl";
if (is_file($pf)) foreach (file($pf, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $l) { $p = json_decode($l, true); if ($p) $pagos[] = $p; }

// Importe en euros y lo que llega (sin IVA y sin la comisión de Apple)
function eur($p, $tasa) { return $p['moneda'] === 'EUR' && $p['importe'] > 0 ? $p['importe'] : $p['usd'] * $tasa; }
function neto($p, $tasa) {
  $imp = $p['impuestos'] ?? 0.1736;  // IVA 21 % incluido en el precio
  $com = $p['comision'] ?? 0.15;     // Apple, programa de pequeñas empresas
  return eur($p, $tasa) * (1 - $imp) * (1 - $com);
}
$hoy = date('Y-m-d');
function suma($dias, $campo, $desde = null) { $t = 0; foreach ($dias as $d => $v) if (!$desde || $d >= $desde) $t += $v[$campo] ?? 0; return $t; }
function pagos_desde($pagos, $desde, $tasa, $real = true) {
  $r = ['n' => 0, 'eur' => 0, 'neto' => 0, 'reemb' => 0];
  foreach ($pagos as $p) {
    if ($p['prueba'] === $real || date('Y-m-d', $p['ts']) < $desde) continue;
    if (in_array($p['tipo'], ['CANCELLATION', 'REFUND'])) { $r['reemb']++; $r['eur'] -= eur($p, $tasa); $r['neto'] -= neto($p, $tasa); }
    else { $r['n']++; $r['eur'] += eur($p, $tasa); $r['neto'] += neto($p, $tasa); }
  }
  return $r;
}
$periodos = ['Hoy' => $hoy, '7 días' => date('Y-m-d', strtotime('-6 days')), '30 días' => date('Y-m-d', strtotime('-29 days')), 'Total' => '0000-00-00'];
$din = fn($v) => number_format($v, 2, ',', '.') . ' €';
$num = fn($v) => number_format($v, 0, ',', '.');
$pct = fn($a, $b) => $b ? round($a * 100 / $b) . ' %' : '—';

// Meses (últimos 12)
$meses = [];
for ($i = 11; $i >= 0; $i--) { $m = date('Y-m', strtotime("first day of -$i month")); $meses[$m] = ['sorteos' => 0, 'premium' => 0, 'ad' => 0, 'neto' => 0, 'n' => 0]; }
foreach ($dias as $d => $v) { $m = substr($d, 0, 7); if (isset($meses[$m])) foreach (['sorteos', 'premium', 'ad'] as $c) $meses[$m][$c] += $v[$c] ?? 0; }
foreach ($pagos as $p) { if ($p['prueba']) continue; $m = date('Y-m', $p['ts']); if (!isset($meses[$m])) continue;
  $s = in_array($p['tipo'], ['CANCELLATION', 'REFUND']) ? -1 : 1; $meses[$m]['neto'] += $s * neto($p, $EURUSD); $meses[$m]['n'] += $s; }

// Últimos 30 días para la gráfica
$serie = []; $max = 1;
for ($i = 29; $i >= 0; $i--) { $d = date('Y-m-d', strtotime("-$i days")); $v = $dias[$d] ?? [];
  $serie[$d] = [(int)($v['sorteos'] ?? 0), (int)($v['premium'] ?? 0)]; $max = max($max, $serie[$d][0]); }

// Estado
$nActivos = count(glob("$DIR/d_*.json"));
$bytes = 0; foreach (glob("$DIR/*") as $f) $bytes += filesize($f);
$correoOk = is_file("$DIR/correo.json");
$errCorreo = is_file("$DIR/correo-errores.log") ? array_slice(file("$DIR/correo-errores.log", FILE_IGNORE_NEW_LINES), -5) : [];
$host = preg_replace('/[^a-z0-9.\-]/i', '', $_SERVER['HTTP_HOST'] ?? '__DOMINIO__');
$urlAviso = "https://$host/sorteo/api.php?a=revenuecat&clave=" . ($cfg['webhook'] ?? '');
$nombreIdioma = ['es' => 'Español', 'en' => 'Inglés', 'pt' => 'Portugués', 'fr' => 'Francés', 'it' => 'Italiano', 'de' => 'Alemán', '?' => 'Sin dato'];
$nombreMes = fn($m) => ['01'=>'ene','02'=>'feb','03'=>'mar','04'=>'abr','05'=>'may','06'=>'jun','07'=>'jul','08'=>'ago','09'=>'sep','10'=>'oct','11'=>'nov','12'=>'dic'][substr($m, 5)] . ' ' . substr($m, 2, 2);
?><!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Panel · Secretoogift</title><link rel="icon" href="../img/favicon.png">
<?php estilos(); ?></head><body>
<header><img src="../img/logo.png" alt=""><b>Secretoogift</b><span class="muted">Panel</span><span style="flex:1"></span><a href="?salir=1">Salir</a></header>
<main>
<?php if ($msg): ?><div class="aviso"><?= $e($msg) ?></div><?php endif; ?>

<nav><a href="#resumen">Resumen</a><a href="#ingresos">Ingresos</a><a href="#sorteos">Sorteos</a><a href="#pagos">Pagos</a><a href="#estado">Estado</a><a href="#ajustes">Ajustes</a></nav>

<section id="resumen"><h2>Resumen</h2>
<div class="tabla"><table><tr><th></th><?php foreach ($periodos as $n => $d) echo "<th>$n</th>"; ?></tr>
<?php
$filas = [
  ['Sorteos', fn($d) => $num(suma($dias, 'sorteos', $d))],
  ['Premium', fn($d) => $num(suma($dias, 'premium', $d)) . ' <small>' . $pct(suma($dias, 'premium', $d), suma($dias, 'sorteos', $d)) . '</small>'],
  ['Participantes', fn($d) => $num(suma($dias, 'participantes', $d))],
  ['Enlaces abiertos', fn($d) => $num(suma($dias, 'abiertos', $d))],
  ['Correos enviados', fn($d) => $num(suma($dias, 'correos', $d))],
  ['Anuncios vistos', fn($d) => $num(suma($dias, 'ad', $d))],
  ['Visitas a la web', fn($d) => $num(suma($dias, 'web', $d))],
  ['Te llega por premium', fn($d) => $din(pagos_desde($pagos, $d, $EURUSD)['neto'])],
  ['Anuncios (estimado)', fn($d) => $din(suma($dias, 'ad', $d) * $ECPM / 1000)],
];
foreach ($filas as [$t, $f]) { echo "<tr><td>$t</td>"; foreach ($periodos as $d) echo '<td>' . $f($d) . '</td>'; echo '</tr>'; }
$tot = pagos_desde($pagos, '0000-00-00', $EURUSD)['neto'] + suma($dias, 'ad') * $ECPM / 1000;
?></table></div>
<div class="kpis">
  <div class="kpi"><span>Total ganado (aprox.)</span><b><?= $din($tot) ?></b></div>
  <div class="kpi"><span>Sorteos activos</span><b><?= $num($nActivos) ?></b></div>
  <div class="kpi"><span>Media de participantes</span><b><?= suma($dias, 'sorteos') ? number_format(suma($dias, 'participantes') / suma($dias, 'sorteos'), 1, ',', '.') : '—' ?></b></div>
  <div class="kpi"><span>Ven la oferta y pagan</span><b><?= $pct(suma($dias, 'premium'), suma($dias, 'paywall')) ?></b></div>
</div></section>

<section id="ingresos"><h2>Ingresos por mes</h2>
<p class="muted">«Te llega» = precio sin IVA y sin la comisión de Apple (15 %). Los anuncios son una estimación con <?= $din($ECPM) ?> por cada 1.000; el dato exacto está en AdMob → Informes.</p>
<div class="tabla"><table><tr><th>Mes</th><th>Sorteos</th><th>Premium</th><th>Ventas</th><th>Te llega (premium)</th><th>Anuncios</th><th>Anuncios (est.)</th><th>Total</th></tr>
<?php foreach (array_reverse($meses, true) as $m => $v): $ad = $v['ad'] * $ECPM / 1000; ?>
<tr><td><?= $nombreMes($m) ?></td><td><?= $num($v['sorteos']) ?></td><td><?= $num($v['premium']) ?></td><td><?= $num($v['n']) ?></td>
<td><?= $din($v['neto']) ?></td><td><?= $num($v['ad']) ?></td><td><?= $din($ad) ?></td><td><b><?= $din($v['neto'] + $ad) ?></b></td></tr>
<?php endforeach; ?></table></div></section>

<section id="sorteos"><h2>Sorteos de los últimos 30 días</h2>
<div class="graf"><?php foreach ($serie as $d => [$n, $p]): $h = round($n / $max * 100); $hp = $n ? round($p / $n * $h) : 0; ?>
<div class="col" title="<?= $e(date('d/m', strtotime($d)) . ": $n sorteos, $p premium") ?>"><div class="bar" style="height:<?= $h ?>%"><i style="height:<?= $h ? round($hp / $h * 100) : 0 ?>%"></i></div><small><?= (int)substr($d, 8) ?></small></div>
<?php endforeach; ?></div>
<p class="leyenda"><span class="c1"></span> Sorteos <span class="c2"></span> Premium</p>
<div class="dos">
<div><h3>Tamaño de los grupos</h3><?php $t = array_sum($tam) ?: 1; foreach (['3-4', '5-6', '7-10', '11-20', '21+'] as $k): $v = $tam[$k] ?? 0; ?>
<div class="barra"><span><?= $k ?> personas</span><div><i style="width:<?= round($v * 100 / $t) ?>%"></i></div><b><?= $num($v) ?></b></div><?php endforeach; ?>
<p class="muted small">De 7 en adelante solo se puede con premium.</p></div>
<div><h3>Idioma de la app</h3><?php $t = array_sum($idioma) ?: 1; arsort($idioma); foreach ($idioma as $k => $v): ?>
<div class="barra"><span><?= $e($nombreIdioma[$k] ?? $k) ?></span><div><i style="width:<?= round($v * 100 / $t) ?>%"></i></div><b><?= $num($v) ?></b></div><?php endforeach; ?>
<?php if (!$idioma): ?><p class="muted">Aún no hay datos.</p><?php endif; ?></div>
</div></section>

<section id="pagos"><h2>Últimos pagos</h2>
<?php $ult = array_reverse(array_slice($pagos, -25)); if (!$ult): ?><p class="muted">Todavía no hay pagos. Aparecerán en cuanto RevenueCat avise (mira «Estado»).</p><?php else: ?>
<div class="tabla"><table><tr><th>Fecha</th><th>Tipo</th><th>País</th><th>Pagado</th><th>Te llega</th><th></th></tr>
<?php foreach ($ult as $p): $re = in_array($p['tipo'], ['CANCELLATION', 'REFUND']); ?>
<tr><td><?= date('d/m/Y H:i', $p['ts']) ?></td><td><?= $re ? '↩️ Reembolso' : '👑 Premium' ?></td><td><?= $e($p['pais'] ?: '—') ?></td>
<td><?= $e(number_format($p['importe'], 2, ',', '.') . ' ' . $p['moneda']) ?></td><td><?= ($re ? '−' : '') . $din(neto($p, $EURUSD)) ?></td><td><?= $p['prueba'] ? '<span class="tag">prueba</span>' : '' ?></td></tr>
<?php endforeach; ?></table></div><?php endif; ?></section>

<section id="estado"><h2>Estado</h2>
<div class="estado">
<div><?= $correoOk ? '✅' : '⚠️' ?> <b>Correo</b>: <?= $correoOk ? 'enviando con el buzón de IONOS.' : 'sin configurar: abre <a href="../sorteo/correo.php">correo.php</a> y pon la contraseña del buzón.' ?></div>
<?php if ($errCorreo): ?><div>⚠️ <b>Últimos errores de correo</b>:<pre><?= $e(implode("\n", $errCorreo)) ?></pre></div><?php endif; ?>
<div><?= !empty($cfg['webhook_at']) ? '✅' : '⚠️' ?> <b>Avisos de pago (RevenueCat)</b>: <?= !empty($cfg['webhook_at']) ? 'último aviso el ' . date('d/m/Y H:i', $cfg['webhook_at']) . ' (' . $e($cfg['webhook_tipo'] ?? '') . ').' : 'aún no ha llegado ninguno. Configúralo con la dirección de abajo.' ?></div>
<div>ℹ️ <b>Pagos de prueba</b> (TestFlight): <?= $num(count(array_filter($pagos, fn($p) => $p['prueba']))) ?> · no cuentan en los ingresos.</div>
<div>ℹ️ <b>Datos guardados</b>: <?= number_format($bytes / 1048576, 2, ',', '.') ?> MB · los sorteos se borran solos a los 120 días; estas cuentas se quedan.</div>
</div>
<h3>Aviso de pagos de RevenueCat</h3>
<p class="muted">En RevenueCat → proyecto Secretoogift → <b>Integrations</b> → <b>Webhooks</b> → <b>+ Add</b>, pega esta dirección en «Webhook URL» y guarda. Es privada: no la compartas.</p>
<div class="copiar"><input readonly value="<?= $e($urlAviso) ?>" id="aviso"><button onclick="navigator.clipboard.writeText(document.getElementById('aviso').value);this.textContent='Copiada'">Copiar</button></div>
</section>

<section id="ajustes"><h2>Ajustes</h2>
<form method="post" class="form"><input type="hidden" name="csrf" value="<?= $csrf ?>"><input type="hidden" name="acc" value="ajustes">
<label>€ por cada 1.000 anuncios (para la estimación)<input name="ecpm" value="<?= $e($ECPM) ?>" inputmode="decimal"></label>
<label>€ por cada dólar (pagos en otras monedas)<input name="eur_usd" value="<?= $e($EURUSD) ?>" inputmode="decimal"></label>
<button>Guardar</button></form>
<form method="post" class="form"><input type="hidden" name="csrf" value="<?= $csrf ?>"><input type="hidden" name="acc" value="clave">
<label>Contraseña actual<input type="password" name="actual" autocomplete="current-password"></label>
<label>Contraseña nueva<input type="password" name="p1" autocomplete="new-password"></label>
<button>Cambiar contraseña</button></form>
</section>
<p class="muted small" style="text-align:center">Actualizado <?= date('d/m/Y H:i') ?> · <a href="./">Recargar</a></p>
</main></body></html>
<?php
function estilos() { ?>
<style>
:root{--navy:#0b3a7a;--blue:#1a56b8;--gold:#ffc20e;--ink:#14213d;--muted:#5f6b85;--line:#e2e8f4;--bg:#f5f8ff}
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--ink);font-size:15px}
header{display:flex;align-items:center;gap:10px;background:var(--navy);color:#fff;padding:12px 18px;position:sticky;top:0;z-index:5}
header img{width:34px;height:34px;border-radius:50%}header b{font-size:18px}header .muted{color:#b9c9ee}header a{color:#fff}
main{max-width:1000px;margin:0 auto;padding:16px}
nav{display:flex;gap:6px;overflow-x:auto;margin-bottom:6px}nav a{background:#fff;border:1px solid var(--line);border-radius:99px;padding:7px 13px;text-decoration:none;color:var(--ink);white-space:nowrap;font-weight:600;font-size:14px}
section{background:#fff;border:1px solid var(--line);border-radius:18px;padding:18px;margin:14px 0;scroll-margin-top:70px}
h2{margin:0 0 12px;color:var(--navy);font-size:20px}h3{font-size:16px;margin:16px 0 8px}
.muted{color:var(--muted)}.small,small{font-size:12.5px;color:var(--muted)}
.tabla{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}
th:first-child,td:first-child{text-align:left}th{color:var(--muted);font-weight:600;font-size:13px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-top:14px}
.kpi{background:var(--bg);border-radius:14px;padding:12px 14px}.kpi span{display:block;color:var(--muted);font-size:13px}.kpi b{font-size:22px;color:var(--navy)}
.graf{display:flex;align-items:flex-end;gap:3px;height:170px;padding-top:6px}
.col{flex:1;display:flex;flex-direction:column;align-items:center;height:100%;justify-content:flex-end}
.bar{width:100%;background:var(--blue);border-radius:4px 4px 0 0;min-height:2px;display:flex;align-items:flex-end;overflow:hidden}
.bar i{display:block;width:100%;background:var(--gold)}.col small{font-size:10px;margin-top:3px}
.leyenda span{display:inline-block;width:11px;height:11px;border-radius:3px;margin:0 4px 0 12px;vertical-align:-1px}.c1{background:var(--blue)}.c2{background:var(--gold)}
.dos{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}
.barra{display:grid;grid-template-columns:110px 1fr 48px;align-items:center;gap:8px;margin:6px 0}.barra div{background:var(--bg);border-radius:99px;height:12px;overflow:hidden}
.barra i{display:block;height:100%;background:var(--blue);border-radius:99px}.barra b{text-align:right}
.estado>div{padding:9px 0;border-bottom:1px solid var(--line);line-height:1.5}pre{white-space:pre-wrap;font-size:12px;background:var(--bg);padding:8px;border-radius:8px}
.copiar{display:flex;gap:8px}.copiar input{flex:1;min-width:0;font-size:13px}
input{font-size:15px;padding:10px;border:1.5px solid var(--line);border-radius:10px;width:100%}
button{background:var(--gold);border:0;border-radius:10px;padding:10px 16px;font-weight:700;font-size:15px;cursor:pointer;color:var(--ink)}
.form{display:grid;gap:10px;max-width:420px;margin-bottom:18px}.form label{display:grid;gap:5px;font-weight:600;font-size:14px}
.aviso{background:#fff8e1;border:1px solid #ffe08a;border-radius:12px;padding:10px 14px}
.tag{background:#e6eeff;color:var(--blue);border-radius:99px;padding:2px 8px;font-size:12px}
.acceso{max-width:380px;margin:12vh auto;background:#fff;border:1px solid var(--line);border-radius:20px;padding:26px;text-align:center}
.acceso img{width:80px;height:80px;border-radius:50%}.acceso form{display:grid;gap:10px;text-align:left;margin-top:14px}
</style>
<?php }
function pantalla_acceso($titulo, $texto, $crear, $msg, $csrf) {
  $e = fn($t) => htmlspecialchars((string)$t, ENT_QUOTES, 'UTF-8'); ?>
<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>Panel · Secretoogift</title><link rel="icon" href="../img/favicon.png"><?php estilos(); ?></head><body>
<div class="acceso"><img src="../img/logo.png" alt=""><h2 style="margin-top:10px"><?= $e($titulo) ?></h2><p class="muted"><?= $e($texto) ?></p>
<?php if ($msg): ?><div class="aviso"><?= $e($msg) ?></div><?php endif; ?>
<form method="post"><input type="hidden" name="csrf" value="<?= $csrf ?>"><input type="hidden" name="acc" value="<?= $crear ? 'crear' : 'entrar' ?>">
<input type="password" name="p1" placeholder="Contraseña" autocomplete="<?= $crear ? 'new-password' : 'current-password' ?>" autofocus>
<?php if ($crear): ?><input type="password" name="p2" placeholder="Repite la contraseña" autocomplete="new-password"><?php endif; ?>
<button><?= $crear ? 'Crear y entrar' : 'Entrar' ?></button></form></div></body></html>
<?php }
