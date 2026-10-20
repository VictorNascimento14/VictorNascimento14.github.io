"""Prepara as imagens do site a partir de assets/img/originais/ (ver docs/imagens.md).

    python3 tools/imagens.py              confere os originais e grava os WebP em assets/img/
    python3 tools/imagens.py provisorias  cria originais provisórios para desenvolver sem as imagens de verdade

Precisa só do Pillow. Sem bloco.png, o bloco bruto é gerado a partir da silhueta do busto.
"""
import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

RAIZ = Path(__file__).resolve().parent.parent
ORIGINAIS = RAIZ / 'assets' / 'img' / 'originais'
SAIDA = RAIZ / 'assets' / 'img'
TAMANHOS = {'busto': (1024, 1536), 'bloco': (1024, 1536), 'estatua-linkedin': (640, 670), 'estatua-github': (640, 670)}
LUZ = (-0.55, -0.65, 0.52)  # de cima, à esquerda, um pouco de frente


def relevo(mascara, raio, cor, ruido=10, semente=1, alfa=None):
    """Pinta uma silhueta como pedra: a máscara borrada vira altura, a altura vira sombra."""
    w, h = mascara.size
    # altura em cúpula: a média de borrões em várias escalas sobe devagar da borda para o centro
    escalas = [mascara.filter(ImageFilter.GaussianBlur(r)) for r in (raio / 3, raio, raio * 3, raio * 6)]
    altura = escalas[0]
    for i, e in enumerate(escalas[1:], 2):
        altura = Image.blend(altura, e, 1 / i)
    alt = altura.load()
    rnd = random.Random(semente)
    lx, ly, lz = LUZ
    norma = math.sqrt(lx * lx + ly * ly + lz * lz)
    lx, ly, lz = lx / norma, ly / norma, lz / norma
    pedra = Image.new('RGB', (w, h))
    px = pedra.load()
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            dx = (alt[x + 1, y] - alt[x - 1, y]) / 255 * 9
            dy = (alt[x, y + 1] - alt[x, y - 1]) / 255 * 9
            nz = 0.5
            n = math.sqrt(dx * dx + dy * dy + nz * nz)
            luz = max(0.0, (-dx * lx - dy * ly + nz * lz) / n)
            k = 0.70 + 0.38 * luz + rnd.uniform(-ruido, ruido) / 255
            px[x, y] = tuple(max(0, min(255, round(c * k))) for c in cor)
    # a altura pode ter degraus (relevo), mas a pedra é opaca onde existe
    pedra.putalpha(alfa if alfa is not None else mascara)
    return pedra


def facetas(mascara, cor, semente=7, quantas=95):
    """Bloco bruto: facetas de cinzel (Voronoi), cada uma inclinada para um lado, mais furos de ponteiro."""
    w, h = mascara.size
    rnd = random.Random(semente)
    caixa = mascara.getbbox()
    sementes = [(rnd.uniform(caixa[0], caixa[2]), rnd.uniform(caixa[1], caixa[3]),
                 rnd.uniform(-0.9, 0.9), rnd.uniform(-0.9, 0.9)) for _ in range(quantas)]
    passo = 4  # resolve o Voronoi numa grade grossa e amplia: rápido o bastante sem numpy
    gw, gh = w // passo + 1, h // passo + 1
    lx, ly, lz = LUZ
    norma = math.sqrt(lx * lx + ly * ly + lz * lz)
    lx, ly, lz = lx / norma, ly / norma, lz / norma
    pequena = Image.new('RGB', (gw, gh))
    pp = pequena.load()
    for gy in range(gh):
        for gx in range(gw):
            x, y = gx * passo, gy * passo
            melhor, segundo, sx = 1e18, 1e18, None
            for s in sementes:
                d = (s[0] - x) ** 2 + (s[1] - y) ** 2
                if d < melhor:
                    segundo, melhor, sx = melhor, d, s
                elif d < segundo:
                    segundo = d
            nx, ny = sx[2], sx[3]
            # a faceta é uma concha: mais funda no centro, inclinada pela normal sorteada
            r = math.sqrt(melhor) / 60
            nx += (x - sx[0]) / 260
            ny += (y - sx[1]) / 260
            n = math.sqrt(nx * nx + ny * ny + 1)
            luz = max(0.0, (-nx * lx - ny * ly + lz) / n)
            aresta = 0.95 if math.sqrt(segundo) - math.sqrt(melhor) < 3 else 1.0
            k = (0.80 + 0.24 * luz - 0.05 * min(r, 1)) * aresta
            pp[gx, gy] = tuple(max(0, min(255, round(c * k))) for c in cor)
    pedra = pequena.resize((w, h), Image.BILINEAR).filter(ImageFilter.GaussianBlur(2.2))
    d = ImageDraw.Draw(pedra)
    for _ in range(260):  # marcas de ponteiro
        x, y = rnd.uniform(caixa[0], caixa[2]), rnd.uniform(caixa[1], caixa[3])
        rr = rnd.uniform(1.5, 3.2)
        d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=tuple(round(c * 0.62) for c in cor))
    sombra = mascara.filter(ImageFilter.GaussianBlur(14))
    pedra = ImageChops.multiply(pedra, Image.merge('RGB', [sombra.point(lambda v: 150 + v * 105 // 255)] * 3))
    pedra.putalpha(mascara)
    return pedra


def contorno_do_bloco(busto):
    """A silhueta do busto, engordada e envolvida por um contorno convexo de bordas tortas."""
    alfa = busto.getchannel('A').point(lambda v: 255 if v > 40 else 0)
    gorda = alfa.filter(ImageFilter.MaxFilter(41))
    pts = []
    larg, alt = gorda.size
    dados = gorda.load()
    for y in range(0, alt, 6):
        xs = [x for x in range(0, larg, 3) if dados[x, y]]
        if xs:
            pts += [(xs[0], y), (xs[-1], y)]
    pts = sorted(set(pts))

    def giro(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    baixo, cima = [], []
    for p in pts:
        while len(baixo) >= 2 and giro(baixo[-2], baixo[-1], p) <= 0:
            baixo.pop()
        baixo.append(p)
    for p in reversed(pts):
        while len(cima) >= 2 and giro(cima[-2], cima[-1], p) <= 0:
            cima.pop()
        cima.append(p)
    casco = baixo[:-1] + cima[:-1]
    rnd = random.Random(3)
    torto = []
    for (x0, y0), (x1, y1) in zip(casco, casco[1:] + casco[:1]):
        for t in (0, 0.33, 0.66):
            torto.append((x0 + (x1 - x0) * t + rnd.uniform(-9, 9), y0 + (y1 - y0) * t + rnd.uniform(-9, 9)))
    mascara = Image.new('L', gorda.size, 0)
    ImageDraw.Draw(mascara).polygon(torto, fill=255)
    return ImageChops.lighter(mascara, gorda).filter(ImageFilter.GaussianBlur(1.5))


def provisorias():
    """Originais provisórios, sem rosto: servem para desenvolver até chegarem as imagens de verdade."""
    ORIGINAIS.mkdir(parents=True, exist_ok=True)
    w, h = TAMANHOS['busto']
    m = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(m)
    d.polygon([(190, 1536), (170, 1380), (205, 1290), (150, 1180), (120, 990), (190, 905), (330, 860), (430, 830),
               (594, 830), (694, 860), (834, 905), (904, 990), (874, 1180), (819, 1290), (854, 1380), (834, 1536)], fill=255)
    d.rectangle([428, 640, 596, 900], fill=255)  # pescoço
    d.ellipse([322, 215, 702, 735], fill=255)  # cabeça
    rnd = random.Random(5)
    for a in range(0, 360, 14):  # cabelo em cachos
        if 200 < a < 340:
            continue
        r = math.radians(a)
        cx, cy = 512 + math.cos(r) * 205, 455 - abs(math.sin(r)) * 40 + math.sin(r) * 225
        rr = rnd.uniform(52, 74)
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=255)
    relevo(m, 34, (232, 226, 214), semente=2).save(ORIGINAIS / 'busto.png')
    for nome, marca in (('estatua-linkedin', 'in'), ('estatua-github', 'gh')):
        w, h = TAMANHOS[nome]
        laje = Image.new('L', (w, h), 0)
        ImageDraw.Draw(laje).rounded_rectangle([40, 50, w - 40, h - 40], radius=110, fill=200)
        dl = ImageDraw.Draw(laje)
        dl.rounded_rectangle([120, 130, w - 120, h - 120], radius=70, fill=150)
        if marca == 'in':
            dl.rectangle([190, 300, 250, 520], fill=255)
            dl.ellipse([185, 205, 255, 275], fill=255)
            dl.rectangle([300, 300, 360, 520], fill=255)
            dl.pieslice([300, 290, 460, 450], 180, 360, fill=255)
            dl.rectangle([400, 370, 460, 520], fill=255)
        else:
            dl.ellipse([200, 215, 440, 455], fill=255)
            dl.ellipse([240, 255, 400, 415], fill=150)
            dl.polygon([(320, 455), (290, 545), (350, 545)], fill=255)
        opaca = laje.point(lambda v: 255 if v else 0)
        relevo(laje, 6, (226, 205, 172), ruido=16, semente=4, alfa=opaca).save(ORIGINAIS / f'{nome}.png')
    print('originais provisórios criados em', ORIGINAIS)


def preparar():
    faltando = [n for n in ('busto', 'estatua-linkedin', 'estatua-github') if not (ORIGINAIS / f'{n}.png').exists()]
    if faltando:
        sys.exit(f'faltam em {ORIGINAIS}: {", ".join(faltando)} (ou rode: python3 tools/imagens.py provisorias)')
    imagens = {}
    for nome in TAMANHOS:
        caminho = ORIGINAIS / f'{nome}.png'
        if not caminho.exists():
            continue
        im = Image.open(caminho).convert('RGBA')
        if im.size != TAMANHOS[nome]:
            print(f'aviso: {nome}.png tem {im.size}, esperado {TAMANHOS[nome]}; redimensionando')
            im = im.resize(TAMANHOS[nome], Image.LANCZOS)
        cantos = [im.getpixel(p)[3] for p in ((0, 0), (im.width - 1, 0), (0, im.height - 1), (im.width - 1, im.height - 1))]
        if max(cantos) > 10:
            print(f'aviso: {nome}.png não parece ter fundo transparente nos cantos')
        imagens[nome] = im
    busto = imagens['busto']
    if 'bloco' not in imagens:
        print('sem bloco.png: gerando o bloco a partir da silhueta do busto')
        imagens['bloco'] = facetas(contorno_do_bloco(busto), (226, 219, 205))
    alfa_busto = busto.getchannel('A').point(lambda v: 255 if v > 40 else 0)
    alfa_bloco = imagens['bloco'].getchannel('A').point(lambda v: 255 if v > 40 else 0)
    fora = ImageChops.subtract(alfa_busto, alfa_bloco).getbbox()
    if fora:
        print(f'aviso: o bloco não cobre o busto em {fora}; completando o bloco com a silhueta do busto engordada')
        remendo = facetas(alfa_busto.filter(ImageFilter.MaxFilter(25)), (226, 219, 205), semente=11)
        imagens['bloco'] = Image.alpha_composite(remendo, imagens['bloco'])
    for nome, im in imagens.items():
        destino = SAIDA / f'{nome}.webp'
        im.save(destino, 'WEBP', quality=84, method=6)
        print(f'{destino.relative_to(RAIZ)}  {im.size[0]}×{im.size[1]}  {destino.stat().st_size // 1024} KB')


if __name__ == '__main__':
    provisorias() if sys.argv[1:] == ['provisorias'] else preparar()
