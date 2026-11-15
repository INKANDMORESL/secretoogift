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

// Correo con el diseño de Secretoogift. $h: textos ya traducidos que manda la app.
function correo_html($h) {
  $e = fn($x) => htmlspecialchars(mb_substr((string)$x, 0, 400), ENT_QUOTES, 'UTF-8');
  $dominio = '__DOMINIO__';
  $link = (string)($h['link'] ?? '');
  // Solo enlaces a nuestra propia web (nunca se usa para mandar a otras páginas)
  if (!preg_match('#^https://(www\.)?' . preg_quote($dominio, '#') . '/#', $link)) return null;
  $datos = '';
  foreach ((array)($h['datos'] ?? []) as $d) $datos .= '<div style="font-size:15px;color:#5f6b85;margin-top:2px">' . $e($d) . '</div>';
  $lang = preg_replace('/[^a-z]/', '', (string)($h['lang'] ?? 'es'));
  return '<!DOCTYPE html><html lang="' . $lang . '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
  . '<body style="margin:0;padding:0;background:#f5f8ff;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#14213d">'
  . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f8ff;padding:28px 12px"><tr><td align="center">'
  . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:22px;overflow:hidden;border:1px solid #e2e8f4">'
  . '<tr><td align="center" style="background:#0b3a7a;padding:28px 20px 22px">'
  . '<img src="https://' . $dominio . '/img/logo.png" width="84" height="84" alt="" style="display:block;border-radius:50%;border:0">'
  . '<div style="font-size:24px;font-weight:800;color:#ffffff;margin-top:10px;letter-spacing:-.3px">Secretoogift</div></td></tr>'
  . '<tr><td style="padding:28px 28px 8px">'
  . '<div style="font-size:24px;font-weight:800;color:#0b3a7a">' . $e($h['hola'] ?? '') . '</div>'
  . '<p style="font-size:16px;line-height:1.55;margin:10px 0 14px">' . $e($h['intro'] ?? '') . '</p>'
  . $datos
  . (($h['org'] ?? '') !== '' ? '<div style="font-size:15px;color:#5f6b85;margin-top:2px">' . $e($h['org']) . '</div>' : '')
  . '</td></tr>'
  . '<tr><td align="center" style="padding:22px 28px 6px">'
  . '<a href="' . $e($link) . '" style="display:inline-block;background:#ffc20e;color:#14213d;text-decoration:none;font-weight:700;font-size:17px;padding:16px 28px;border-radius:14px">🎁 ' . $e($h['boton'] ?? '') . '</a>'
  . '</td></tr>'
  . (($h['nota'] ?? '') !== '' ? '<tr><td align="center" style="padding:10px 28px 0;font-size:14px;color:#5f6b85">' . $e($h['nota']) . '</td></tr>' : '')
  . '<tr><td align="center" style="padding:14px 28px 26px;font-size:14px;color:#5f6b85">' . $e($h['secreto'] ?? '') . '</td></tr>'
  . '</table>'
  . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px"><tr><td align="center" style="padding:16px 20px;font-size:12px;line-height:1.5;color:#8a94a8">'
  . $e($h['pie'] ?? '') . '<br><a href="https://' . $dominio . '/" style="color:#8a94a8">' . $dominio . '</a> · INKANDMORE SL</td></tr></table>'
  . '</td></tr></table></body></html>';
}

// Cuerpo MIME: solo texto, o texto + HTML (multipart/alternative)
function cuerpo_mime($texto, $html) {
  $t = str_replace("\n", "\r\n", str_replace("\r\n", "\n", $texto));
  if (!$html) return ["Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n", chunk_split(base64_encode($t))];
  $b = 'sg' . bin2hex(random_bytes(8));
  $cuerpo = "--$b\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($t))
          . "--$b\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($html))
          . "--$b--\r\n";
  return ["Content-Type: multipart/alternative; boundary=\"$b\"\r\n", $cuerpo];
}

function smtp_enviar($c, $to, $asunto, $texto, $html = null) {
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
         . "MIME-Version: 1.0\r\n";
    [$tipo, $cuerpo] = cuerpo_mime($texto, $html);
    smtp_orden($s, $cab . $tipo . "\r\n" . $cuerpo . "\r\n.", 250);
    @fwrite($s, "QUIT\r\n");
  } finally { @fclose($s); }
  return true;
}

function enviar_correo($to, $asunto, $texto, $html = null) {
  $c = config_correo();
  if ($c) {
    try { return smtp_enviar($c, $to, $asunto, $texto, $html); }
    catch (Exception $e) { @file_put_contents(__DIR__ . '/data/correo-errores.log', date('c') . ' ' . $e->getMessage() . "\n", FILE_APPEND); return false; }
  }
  [$tipo, $cuerpo] = cuerpo_mime($texto, $html);
  $cab = "From: =?UTF-8?B?" . base64_encode(FROM_NAME) . "?= <" . FROM_EMAIL . ">\r\nMIME-Version: 1.0\r\n" . $tipo;
  return @mail($to, '=?UTF-8?B?' . base64_encode($asunto) . '?=', $cuerpo, $cab, '-f' . FROM_EMAIL);
}
