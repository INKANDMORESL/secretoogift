<?php
// Envío de correos de Secretoogift.
// Si existe data/correo.json (se crea desde correo.php), se envía por SMTP con el buzón de IONOS: llega mucho mejor.
// Si no, se usa mail() de PHP (en IONOS a menudo no llega).

function config_correo() {
  $f = __DIR__ . '/data/correo.json';
  return is_file($f) ? (json_decode(file_get_contents($f), true) ?: null) : null;
}

function smtp_leer($s) {
  $r = '';
  while (($l = fgets($s, 600)) !== false) { $r .= $l; if (strlen($l) < 4 || $l[3] === ' ') break; }
  return $r;
}
function smtp_orden($s, $orden, $esperado) {
  if ($orden !== null) fwrite($s, $orden . "\r\n");
  $r = smtp_leer($s);
  if (strpos($r, (string)$esperado) !== 0) throw new Exception(trim($r) ?: 'sin respuesta');
  return $r;
}

// Conecta y entra con el buzón. Devuelve el socket abierto (o lanza error con el motivo).
function smtp_conectar($c) {
  $s = @stream_socket_client('tcp://' . $c['host'] . ':' . (int)$c['port'], $en, $es, 15);
  if (!$s) throw new Exception("No se puede conectar con {$c['host']}: $es");
  stream_set_timeout($s, 20);
  smtp_orden($s, null, 220);
  $dom = substr(strrchr($c['user'], '@'), 1) ?: 'localhost';
  smtp_orden($s, "EHLO $dom", 250);
  smtp_orden($s, 'STARTTLS', 220);
  if (!stream_socket_enable_crypto($s, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT))
    throw new Exception('No se pudo cifrar la conexión');
  smtp_orden($s, "EHLO $dom", 250);
  smtp_orden($s, 'AUTH LOGIN', 334);
  smtp_orden($s, base64_encode($c['user']), 334);
  smtp_orden($s, base64_encode($c['pass']), 235);
  return $s;
}

function smtp_enviar($c, $to, $asunto, $texto) {
  $s = smtp_conectar($c);
  try {
    smtp_orden($s, "MAIL FROM:<{$c['user']}>", 250);
    smtp_orden($s, "RCPT TO:<$to>", 250);
    smtp_orden($s, 'DATA', 354);
    $dom = substr(strrchr($c['user'], '@'), 1);
    $cab = 'From: =?UTF-8?B?' . base64_encode(FROM_NAME) . "?= <{$c['user']}>\r\n"
         . "To: <$to>\r\n"
         . 'Subject: =?UTF-8?B?' . base64_encode($asunto) . "?=\r\n"
         . 'Date: ' . date('r') . "\r\n"
         . 'Message-ID: <' . bin2hex(random_bytes(12)) . "@$dom>\r\n"
         . "MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n";
    $cuerpo = chunk_split(base64_encode(str_replace("\n", "\r\n", str_replace("\r\n", "\n", $texto))));
    smtp_orden($s, $cab . "\r\n" . $cuerpo . "\r\n.", 250);
    @fwrite($s, "QUIT\r\n");
  } finally { @fclose($s); }
  return true;
}

function enviar_correo($to, $asunto, $texto) {
  $c = config_correo();
  if ($c) {
    try { return smtp_enviar($c, $to, $asunto, $texto); }
    catch (Exception $e) { @file_put_contents(__DIR__ . '/data/correo-errores.log', date('c') . ' ' . $e->getMessage() . "\n", FILE_APPEND); return false; }
  }
  $cab = "From: =?UTF-8?B?" . base64_encode(FROM_NAME) . "?= <" . FROM_EMAIL . ">\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n";
  return @mail($to, '=?UTF-8?B?' . base64_encode($asunto) . '?=', $texto, $cab, '-f' . FROM_EMAIL);
}
