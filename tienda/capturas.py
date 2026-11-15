# Capturas para la App Store (iPhone 6,9": 1320 x 2868) en español e inglés.
# Uso: sirve la web construida en http://127.0.0.1:8200 (php -S) y ejecuta este archivo.
import json, urllib.request
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont, ImageFilter

U = 'http://127.0.0.1:8200/sorteo/'
SALIDA = '/home/claude/secretoogift/tienda/app-store'
NOMBRES = {'es': ['Ana', 'Luis', 'Marta', 'Pablo', 'Lucía', 'Carlos'], 'en': ['Emma', 'Jack', 'Olivia', 'Harry', 'Sophie', 'Leo'],
           'pt': ['Inês', 'João', 'Maria', 'Tiago', 'Beatriz', 'Rui'], 'fr': ['Léa', 'Hugo', 'Chloé', 'Louis', 'Manon', 'Jules'],
           'it': ['Giulia', 'Marco', 'Sofia', 'Luca', 'Chiara', 'Matteo'], 'de': ['Lena', 'Jonas', 'Mia', 'Paul', 'Emma', 'Ben']}
GRUPO = {'es': 'Navidad en familia', 'en': 'Family Christmas', 'pt': 'Natal em família', 'fr': 'Noël en famille',
         'it': 'Natale in famiglia', 'de': 'Weihnachten Familie'}
TITULOS = {
 'es': [('El amigo invisible,', 'sin papelitos'), ('Apunta a todos', 'en un momento'), ('Envía los enlaces', 'y mira quién lo ha visto'),
        ('Cada uno descubre', 'su amigo invisible'), ('Hazlo premium', 'sin anuncios')],
 'en': [('Secret Santa,', 'no paper slips'), ('Add everyone', 'in a moment'), ('Send the links', 'and see who has looked'),
        ('Everyone finds out', 'who they’re buying for'), ('Go premium', 'with no ads')],
 'pt': [('Amigo secreto,', 'sem papelinhos'), ('Adiciona todos', 'num instante'), ('Envia os links', 'e vê quem já viu'),
        ('Cada um descobre', 'o seu amigo secreto'), ('Premium', 'sem anúncios')],
 'fr': [('Le Père Noël secret,', 'sans petits papiers'), ('Ajoutez tout le monde', 'en un instant'), ('Envoyez les liens', 'et voyez qui a regardé'),
        ('Chacun découvre', 'son Père Noël secret'), ('Passez en premium', 'sans publicité')],
 'it': [('Babbo Natale segreto,', 'senza bigliettini'), ('Aggiungi tutti', 'in un attimo'), ('Invia i link', 'e guarda chi li ha visti'),
        ('Ognuno scopre', 'a chi fare il regalo'), ('Passa a premium', 'senza pubblicità')],
 'de': [('Wichteln', 'ohne Zettelchen'), ('Alle eintragen', 'im Handumdrehen'), ('Links verschicken', 'und sehen, wer geschaut hat'),
        ('Jeder erfährt,', 'wen er beschenkt'), ('Premium', 'ohne Werbung')]}
FD = '/usr/share/fonts/opentype/inter/InterDisplay-ExtraBold.otf'
CSS = ".gift{animation:none!important} .toast{display:none!important}"

def marco(png, t1, t2, destino):
    W, H = 1320, 2868
    lienzo = Image.new('RGB', (W, H), '#0b3a7a')
    g = Image.new('RGB', (W, H), '#1a56b8'); m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).ellipse((-300, -900, W + 500, 900), fill=255); m = m.filter(ImageFilter.GaussianBlur(220))
    lienzo.paste(g, (0, 0), m)
    d = ImageDraw.Draw(lienzo)
    f1 = ImageFont.truetype(FD, 104); f2 = ImageFont.truetype(FD, 104)
    for i, (txt, col, f) in enumerate([(t1, '#ffffff', f1), (t2, '#ffc20e', f2)]):
        w = d.textlength(txt, font=f)
        if w > W - 120:
            f = ImageFont.truetype(FD, int(104 * (W - 120) / w)); w = d.textlength(txt, font=f)
        d.text(((W - w) / 2, 150 + i * 128), txt, font=f, fill=col)
    pantalla = Image.open(png).convert('RGB')
    ancho = 1060; alto = int(pantalla.height * ancho / pantalla.width)
    pantalla = pantalla.resize((ancho, alto), Image.LANCZOS)
    x, y = (W - ancho) // 2, 520
    borde = 26
    sombra = Image.new('L', (W, H), 0)
    ImageDraw.Draw(sombra).rounded_rectangle((x - borde, y - borde + 30, x + ancho + borde, y + alto + borde + 30), 120, fill=140)
    sombra = sombra.filter(ImageFilter.GaussianBlur(40))
    lienzo.paste(Image.new('RGB', (W, H), '#041a3d'), (0, 0), sombra)
    d = ImageDraw.Draw(lienzo)
    d.rounded_rectangle((x - borde, y - borde, x + ancho + borde, y + alto + borde), 120, fill='#0a0f1e')
    mask = Image.new('L', (ancho, alto), 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, ancho - 1, alto - 1), 96, fill=255)
    lienzo.paste(pantalla, (x, y), mask)
    lienzo.save(destino)

def api(a, params='', body=None):
    req = urllib.request.Request(U + 'api.php?a=' + a + params, data=json.dumps(body).encode() if body else None,
                                 headers={'Content-Type': 'application/json'})
    return json.loads(urllib.request.urlopen(req).read())

import os
os.makedirs(SALIDA, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    for l, ns in NOMBRES.items():
        ppl = [{'id': f'p{i}', 'name': n, 'tok': f'tok{l}{i}abcdefgh', 'email': (n.lower() + '@mail.com') if i < 4 else ''} for i, n in enumerate(ns)]
        g = {'id': f'demo{l}0000000000', 'key': 'k' * 32, 'name': GRUPO[l], 'budget': ('$20' if l == 'en' else '20 €'), 'date': '2026-12-24', 'people': ppl,
             'exclusions': [], 'assignments': {f'p{i}': f'p{(i + 1) % len(ns)}' for i in range(len(ns))}, 'seen': {}, 'premium': True,
             'organizer': ns[0], 'synced': True, 'opened': {}}
        api('register', '', {'d': g['id'], 'k': g['key'], 'people': [{'t': x['tok'], 'n': x['name'], 'e': x['email']} for x in ppl]})
        for i in (1, 2, 4):
            api('open', f'&d={g["id"]}&t={ppl[i]["tok"]}')
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=3, locale=l)
        ctx.add_init_script(f"localStorage.setItem('amigo-invisible-v1',{json.dumps(json.dumps({'groups': [g]}))});localStorage.setItem('ai-lang','{l}');")
        pg = ctx.new_page()
        def shot(n):
            pg.add_style_tag(content=CSS); pg.wait_for_timeout(700); pg.screenshot(path=f'/tmp/cap_{l}_{n}.png')
        pg.goto(U); pg.wait_for_timeout(600); shot(1)
        # 2: nuevo sorteo paso a paso (último paso: participantes)
        pg.click('[data-act=new]'); pg.fill('#wz-name', GRUPO[l]); pg.click('#wz-next')
        pg.click('[data-k=conPres]'); pg.click('[data-k=conFecha]'); pg.click('#wz-next')
        pg.fill('#wz-org', ns[0]); pg.click('#wz-next')
        for n in ns[1:5]:
            pg.fill('#pname', n); pg.fill('#pemail', n.lower() + '@mail.com'); pg.press('#pemail', 'Enter')
        pg.evaluate('window.scrollTo(0,0)'); shot(2)
        # 3: enviar por correo, con quién lo ha abierto
        pg.click('[data-act=home]'); pg.click('[data-open]'); pg.wait_for_timeout(600)
        pg.click('[data-act=enviar]'); pg.click('[data-m=mail]'); pg.wait_for_timeout(300); shot(3)
        # 4: pasar el móvil → el regalo
        pg.click('[data-act=sendmenu]'); pg.click('[data-m=pass]'); pg.click('[data-pass] >> nth=0'); shot(4)
        # 5: oferta premium
        pg.goto(U); pg.wait_for_timeout(400); pg.click('[data-act=new]'); pg.fill('#wz-name', GRUPO[l]); pg.click('#wz-next'); pg.click('#wz-next')
        pg.fill('#wz-org', ns[0]); pg.click('#wz-next'); pg.click('[data-act=unlock]'); shot(5)
        ctx.close()
        for i, (t1, t2) in enumerate(TITULOS[l], 1):
            marco(f'/tmp/cap_{l}_{i}.png', t1, t2, f'{SALIDA}/{l}-{i}.png')
    b.close()
print('ok')
