# Imágenes para Google Play: icono 512, gráfico de funciones 1024x500 y capturas 1080x1920 (es/en).
# Usa las pantallas en bruto que hace capturas.py (/tmp/cap_{idioma}_{n}.png).
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
R = '/home/claude/secretoogift'
S = f'{R}/tienda/google-play'; os.makedirs(S, exist_ok=True)
FD = '/usr/share/fonts/opentype/inter/InterDisplay-ExtraBold.otf'
FR = '/usr/share/fonts/opentype/inter/Inter-SemiBold.otf'
# Mismos titulares que las capturas de la App Store
_c = open(f'{R}/tienda/capturas.py').read()
TIT = eval(_c[_c.index('TITULOS = {') + 10:_c.index("FD = ")].strip())
LEMAS = {'es': 'El amigo invisible, sin papelitos', 'en': 'Secret Santa, no paper slips', 'pt': 'Amigo secreto, sem papelinhos',
         'fr': 'Père Noël secret, sans papiers', 'it': 'Babbo Natale segreto, facile', 'de': 'Wichteln ohne Zettelchen'}

def fondo(W, H):
    im = Image.new('RGB', (W, H), '#0b3a7a'); g = Image.new('RGB', (W, H), '#1a56b8'); m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).ellipse((-W * .25, -H * .35, W * 1.35, H * .35), fill=255); im.paste(g, (0, 0), m.filter(ImageFilter.GaussianBlur(W // 6)))
    return im

def texto(d, W, y, txt, col, tam, fuente=FD):
    f = ImageFont.truetype(fuente, tam); w = d.textlength(txt, font=f)
    if w > W * .9: f = ImageFont.truetype(fuente, int(tam * W * .9 / w)); w = d.textlength(txt, font=f)
    d.text(((W - w) / 2, y), txt, font=f, fill=col)

def captura(png, t1, t2, dest, W=1080, H=1920):
    im = fondo(W, H); d = ImageDraw.Draw(im)
    texto(d, W, 90, t1, '#ffffff', 84); texto(d, W, 192, t2, '#ffc20e', 84)
    p = Image.open(png).convert('RGB'); ancho = 760; alto = int(p.height * ancho / p.width); p = p.resize((ancho, alto), Image.LANCZOS)
    x, y = (W - ancho) // 2, 360; b = 18
    d.rounded_rectangle((x - b, y - b, x + ancho + b, y + alto + b), 84, fill='#0a0f1e')
    m = Image.new('L', (ancho, alto), 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, ancho - 1, alto - 1), 68, fill=255)
    im.paste(p, (x, y), m); im.save(dest)

for l, ts in TIT.items():
    for i, (a, b) in enumerate(ts, 1):
        captura(f'/tmp/cap_{l}_{i}.png', a, b, f'{S}/{l}-{i}.png')

# Icono 512
Image.open(f'{R}/movil/assets/icon.png').resize((512, 512), Image.LANCZOS).save(f'{S}/icono-512.png')
# Gráfico de funciones 1024x500 (es y en)
logo = Image.open(f'{R}/movil/assets/splash.png').resize((300, 300), Image.LANCZOS)
for l, t2 in LEMAS.items():
    t1 = 'Secretoogift'
    im = fondo(1024, 500).convert('RGBA'); im.alpha_composite(logo, (70, 100)); d = ImageDraw.Draw(im)
    d.text((410, 150), t1, font=ImageFont.truetype(FD, 86), fill='#ffffff')
    f = ImageFont.truetype(FR, 38)
    if d.textlength(t2, font=f) > 580: f = ImageFont.truetype(FR, 32)
    d.text((414, 262), t2, font=f, fill='#ffc20e')
    im.convert('RGB').save(f'{S}/grafico-{l}.png')
print(sorted(os.listdir(S)))
