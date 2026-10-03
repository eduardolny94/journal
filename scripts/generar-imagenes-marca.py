"""Genera los iconos PNG (192, 512, apple-touch) y la imagen Open Graph (1200x630) de Global Traders FX
a partir del escudo de la marca (misma geometría que BrandMark en client/src/components/BrandLogo.tsx).

Uso:  python scripts/generar-imagenes-marca.py            (escribe en client/public)
      python scripts/generar-imagenes-marca.py <carpeta>  (otra carpeta de salida)
Requiere Pillow: python -m pip install pillow
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'client', 'public')
BG = (6, 10, 8)
GREEN = (22, 245, 122)
GREEN_DARK = (15, 191, 94)
STEEL = (45, 52, 58)
STEEL_LIGHT = (91, 101, 112)


def shield(size, scale=4):
    """Escudo dibujado a 4x y reducido (bordes suaves)."""
    s = size * scale
    k = s / 64
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    outer = [(32, 3), (56, 11), (56, 31), (54, 40), (48, 50), (40, 57), (32, 61), (24, 57), (16, 50), (10, 40), (8, 31), (8, 11)]
    inner = [(32, 8), (51, 14.5), (51, 31), (49, 39), (44, 47), (38, 52), (32, 55), (26, 52), (20, 47), (15, 39), (13, 31), (13, 14.5)]

    def P(pts):
        return [(x * k, y * k) for x, y in pts]

    d.polygon(P(outer), fill=STEEL_LIGHT)
    d.polygon(P([(x + 1, y + 1) for x, y in outer]), fill=STEEL)
    d.line(P(outer + [outer[0]]), fill=GREEN, width=int(2 * k), joint='curve')
    d.polygon(P(inner), fill=(11, 16, 13, 160))
    w = int(3 * k)
    for x, y1, y2 in ((22, 24, 42), (31, 18, 40), (40, 26, 36)):
        d.line(P([(x, y1), (x, y2)]), fill=GREEN_DARK, width=w)
    for x, y, bw, bh in ((19, 29, 6, 9), (28, 23, 6, 11), (37, 29, 6, 5)):
        d.rounded_rectangle([x * k, y * k, (x + bw) * k, (y + bh) * k], radius=k, fill=GREEN)
    d.line(P([(17, 45), (27, 36), (34, 41), (46, 26)]), fill=GREEN, width=w, joint='curve')
    d.line(P([(40, 25), (47, 25), (47, 32)]), fill=GREEN, width=w, joint='curve')
    return img.resize((size, size), Image.LANCZOS)


def icon(size, pad, path):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.18), fill=BG)
    img.alpha_composite(shield(size - 2 * pad), (pad, pad))
    img.save(path, 'PNG', optimize=True)


def font(name, size):
    for cand in (name, 'segoeuib.ttf', 'arialbd.ttf', 'arial.ttf', 'DejaVuSans-Bold.ttf'):
        for base in (os.path.join(os.environ.get('WINDIR', 'C:/Windows'), 'Fonts'), '/usr/share/fonts/truetype/dejavu'):
            p = os.path.join(base, cand)
            if os.path.exists(p):
                return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def og(path):
    W, H = 1200, 630
    img = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(img)
    grid = (12, 24, 17)
    for x in range(0, W, 40):
        d.line([(x, 0), (x, H)], fill=grid)
    for y in range(0, H, 40):
        d.line([(0, y), (W, y)], fill=grid)
    glow = Image.new('RGB', (W, H), BG)
    ImageDraw.Draw(glow).ellipse([150, -150, 1050, 550], fill=(16, 70, 40))
    img = Image.blend(img, glow.filter(ImageFilter.GaussianBlur(140)), 0.55).convert('RGBA')
    sh = shield(220)
    halo = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    halo.alpha_composite(sh, (90, 150))
    img.alpha_composite(halo.filter(ImageFilter.GaussianBlur(28)))
    img.alpha_composite(sh, (90, 150))
    d = ImageDraw.Draw(img)
    f_big, f_big_i, f_fx = font('segoeuib.ttf', 68), font('segoeuiz.ttf', 68), font('segoeuiz.ttf', 78)
    f_mid, f_small, f_url = font('segoeui.ttf', 34), font('segoeui.ttf', 26), font('segoeuisb.ttf', 24)
    d.text((330, 150), 'GLOBAL', font=f_big, fill=(255, 255, 255))
    d.text((330, 225), 'TRADERS', font=f_big_i, fill=(255, 255, 255))
    d.text((345 + d.textlength('TRADERS', font=f_big_i), 215), 'FX', font=f_fx, fill=GREEN)
    d.text((330, 335), 'Journal para traders con guardián de riesgo', font=f_mid, fill=(255, 255, 255, 220))
    d.text((330, 390), 'Operaciones · Calendario de P&L · Finanzas reales · Radar de divisas', font=f_small, fill=(255, 255, 255, 140))
    d.rectangle([330, 450, 450, 454], fill=GREEN)
    d.text((330, 490), 'journal.cesarzorrilla.com', font=f_url, fill=(255, 255, 255, 130))
    img.convert('RGB').save(path, 'PNG', optimize=True)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    icon(192, 20, os.path.join(OUT, 'icon-192.png'))
    icon(512, 52, os.path.join(OUT, 'icon-512.png'))
    icon(180, 18, os.path.join(OUT, 'apple-touch-icon.png'))
    og(os.path.join(OUT, 'og.png'))
    for n in ('icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'og.png'):
        print(n, os.path.getsize(os.path.join(OUT, n)), 'bytes')
