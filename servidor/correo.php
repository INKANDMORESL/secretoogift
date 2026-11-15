<?php
// Página privada para configurar el envío de correos (se usa una vez).
// La contraseña se guarda en data/correo.json, que no se puede abrir desde fuera.
const FROM_NAME = 'Secretoogift';
require_once __DIR__ . '/correo-smtp.php';
header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex');
$DIR = __DIR__ . '/data';
if (!is_dir($DIR)) @mkdir($DIR, 0755, true);
if (!file_exists("$DIR/.htaccess")) @file_put_contents("$DIR/.htaccess", "Require all denied\nDeny from all\n");

$actual = config_correo();
$msg = ''; $ok = false;
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
  $user = trim($_POST['user'] ?? '');
  $pass = (string)($_POST['pass'] ?? '');
  $antes = (string)($_POST['antes'] ?? '');
  $prueba = trim($_POST['prueba'] ?? '');
  if ($actual && !hash_equals($actual['pass'], $antes)) {
    $msg = 'La contraseña actual no es correcta.';
  } elseif (!filter_var($user, FILTER_VALIDATE_EMAIL) || $pass === '') {
    $msg = 'Escribe el correo y su contraseña.';
  } else {
    $c = ['host' => 'smtp.ionos.es', 'port' => 587, 'user' => $user, 'pass' => $pass];
    try {
      $s = smtp_conectar($c); @fwrite($s, "QUIT\r\n"); @fclose($s);
      file_put_contents("$DIR/correo.json", json_encode($c), LOCK_EX);
      $actual = $c; $ok = true;
      $msg = '✅ Listo: el correo funciona y queda guardado.';
      if ($prueba && filter_var($prueba, FILTER_VALIDATE_EMAIL)) {
        smtp_enviar($c, $prueba, 'Prueba de Secretoogift', "¡Funciona! Los enlaces de los sorteos saldrán desde $user.");
        $msg .= " Te he enviado un correo de prueba a $prueba.";
      }
    } catch (Exception $e) {
      $m = $e->getMessage();
      $msg = strpos($m, 'No se puede conectar') === 0
        ? '❌ El servidor no puede conectar con el correo de IONOS. (' . htmlspecialchars($m) . ')'
        : '❌ No se ha podido entrar con ese correo y contraseña. Revisa la contraseña. (' . htmlspecialchars($m) . ')';
    }
  }
}
$e = fn($t) => htmlspecialchars((string)$t, ENT_QUOTES);
?><!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Correo de Secretoogift</title>
<style>body{font-family:system-ui,sans-serif;background:#f5f8ff;color:#14213d;margin:0;padding:24px}
.c{max-width:440px;margin:0 auto;background:#fff;border:1px solid #e2e8f4;border-radius:18px;padding:22px}
h1{font-size:22px;margin:0 0 6px;color:#0b3a7a}p{color:#5f6b85;line-height:1.5}label{display:block;font-weight:600;font-size:14px;margin:14px 0 6px}
input{width:100%;box-sizing:border-box;font-size:16px;padding:12px;border:1.5px solid #e2e8f4;border-radius:12px}
button{width:100%;margin-top:18px;padding:14px;border:0;border-radius:12px;background:#ffc20e;color:#14213d;font-weight:700;font-size:16px}
.m{padding:12px;border-radius:12px;background:<?= $ok ? '#dcf5e5' : '#fdecea' ?>;margin:12px 0}</style></head><body><div class="c">
<h1>Correo de Secretoogift</h1>
<p>Escribe la contraseña del buzón desde el que se envían los enlaces. Se guarda solo en tu servidor.</p>
<?php if ($actual && !$ok): ?><p>Ya está configurado con <b><?= $e($actual['user']) ?></b>. Para cambiarlo, escribe también la contraseña actual.</p><?php endif; ?>
<?php if ($msg): ?><div class="m"><?= $msg ?></div><?php endif; ?>
<form method="post" autocomplete="off">
<label>Correo que envía</label><input name="user" type="email" value="<?= $e($_POST['user'] ?? ($actual['user'] ?? 'no-reply@' . preg_replace('/^www\./', '', $_SERVER['HTTP_HOST'] ?? ''))) ?>">
<label>Contraseña de ese correo</label><input name="pass" type="password">
<?php if ($actual): ?><label>Contraseña actual</label><input name="antes" type="password"><?php endif; ?>
<label>Envíame una prueba a (opcional)</label><input name="prueba" type="email" placeholder="tu correo">
<button type="submit">Guardar y probar</button></form></div></body></html>
