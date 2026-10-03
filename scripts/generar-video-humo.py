"""Genera el vídeo de humo de fondo del visor cinematográfico con los colores de Global Traders FX.

Bocanadas de nube que suben, giran y se desvanecen sobre negro profundo, teñidas de verde neón, en bucle perfecto
(el final se funde con el principio). Salida: client/public/video/humo.mp4 (y humo.webm si ffmpeg trae VP9) y humo-poster.jpg.

Uso:  python scripts/generar-video-humo.py [--seg 8] [--fps 24] [--ancho 1280]
Requiere: Pillow, numpy y ffmpeg en el PATH (o en ~/tools/bin).
"""
import argparse
import os
import shutil
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'client', 'public', 'video')
BG = np.array([6, 10, 8], dtype=np.float32)          # #060a08
LIGHT = np.array([130, 255, 185], dtype=np.float32)  # menta neón (núcleo del humo)
DEEP = np.array([12, 120, 70], dtype=np.float32)     # verde profundo (bordes)


def find_ffmpeg():
    for cand in ('ffmpeg', os.path.expanduser('~/tools/bin/ffmpeg.exe'), os.path.expanduser('~/tools/bin/ffmpeg')):
        if shutil.which(cand) or os.path.exists(cand):
            return cand
    sys.exit('ffmpeg no encontrado')


def make_sprite(size, rng):
    """Sprite de nube: varias manchas gaussianas superpuestas, suavizadas."""
    arr = np.zeros((size, size), dtype=np.float32)
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    for _ in range(8):
        cx = size / 2 + (rng.random() - 0.5) * size * 0.5
        cy = size / 2 + (rng.random() - 0.5) * size * 0.5
        rad = size * (0.16 + rng.random() * 0.16)
        arr += np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * rad * rad)) * (0.6 + rng.random() * 0.6)
    arr /= arr.max()
    return Image.fromarray(arr, mode='F')


class Puff:
    def __init__(self, rng, w, h, sprites, initial):
        self.rng = rng
        self.w, self.h = w, h
        self.sprites = sprites
        self.spawn(initial)

    def spawn(self, initial):
        r = self.rng
        m = min(self.w, self.h)
        self.r = r.uniform(m * 0.14, m * 0.38)
        self.x = r.uniform(-self.r * 0.3, self.w + self.r * 0.3)
        self.y = r.uniform(-self.r, self.h + self.r) if initial else self.h + self.r * r.uniform(0.2, 0.9)
        self.vx = r.uniform(-14, 14)
        self.vy = r.uniform(-30, -11)
        self.rot = r.uniform(0, 360)
        self.vr = r.uniform(-6, 6)
        self.alpha = r.uniform(0.18, 0.42)
        self.max_life = r.uniform(12, 24)
        self.life = r.uniform(0, self.max_life) if initial else 0.0
        self.sprite = self.sprites[r.integers(len(self.sprites))]

    def step(self, dt):
        self.life += dt
        if self.life > self.max_life or self.y < -self.r * 1.2:
            self.spawn(False)
        self.x += self.vx * dt + np.sin(self.life * 0.6 + self.rot) * 6 * dt
        self.y += self.vy * dt
        self.rot += self.vr * dt

    def envelope(self):
        t = self.life / self.max_life
        return t / 0.2 if t < 0.2 else (1 - t) / 0.25 if t > 0.75 else 1.0


def render_frame(puffs, w, h):
    acc = np.zeros((h, w), dtype=np.float32)
    for p in puffs:
        d = int(p.r * 2)
        if d < 4:
            continue
        spr = p.sprite.rotate(p.rot, resample=Image.BILINEAR).resize((d, d), Image.BILINEAR)
        a = np.asarray(spr, dtype=np.float32) * (p.alpha * p.envelope())
        x0, y0 = int(p.x - p.r), int(p.y - p.r)
        xs, ys = max(0, x0), max(0, y0)
        xe, ye = min(w, x0 + d), min(h, y0 + d)
        if xe <= xs or ye <= ys:
            continue
        acc[ys:ye, xs:xe] += a[ys - y0:ye - y0, xs - x0:xe - x0]
    return acc


def colorize(acc):
    v = 1 - np.exp(-acc * 1.6)              # mezcla aditiva con saturación suave
    v = np.clip(v, 0, 1)[..., None]
    core = np.clip((v - 0.35) / 0.65, 0, 1)  # el centro de las nubes tira a menta; los bordes a verde profundo
    rgb = BG + v * (DEEP * (1 - core) + LIGHT * core) * 0.95
    return np.clip(rgb, 0, 255).astype(np.uint8)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--seg', type=float, default=8.0)
    ap.add_argument('--fps', type=int, default=24)
    ap.add_argument('--ancho', type=int, default=1280)
    ap.add_argument('--semilla', type=int, default=7)
    args = ap.parse_args()
    w = args.ancho
    h = int(w * 9 / 16)
    n = int(args.seg * args.fps)
    overlap = args.fps * 2  # dos segundos de fundido para el bucle
    rng = np.random.default_rng(args.semilla)
    sprites = [make_sprite(420, rng) for _ in range(4)]
    puffs = [Puff(rng, w, h, sprites, True) for _ in range(72)]
    dt = 1.0 / args.fps

    ffmpeg = find_ffmpeg()
    os.makedirs(OUT_DIR, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix='humo-')
    frames = []
    total = n + overlap
    for i in range(total):
        for p in puffs:
            p.step(dt)
        frames.append(render_frame(puffs, w, h))
        if i % 24 == 0:
            print(f'  fotograma {i}/{total}', flush=True)
    # Bucle: los primeros `overlap` fotogramas se funden con la cola (frames[n..n+overlap]).
    for i in range(n):
        if i < overlap:
            t = i / overlap
            acc = frames[i] * t + frames[n + i] * (1 - t)
        else:
            acc = frames[i]
        Image.fromarray(colorize(acc), 'RGB').save(os.path.join(tmp, f'f{i:04d}.png'))
    Image.fromarray(colorize(frames[overlap]), 'RGB').save(os.path.join(OUT_DIR, 'humo-poster.jpg'), quality=82)

    pattern = os.path.join(tmp, 'f%04d.png')
    subprocess.run([ffmpeg, '-y', '-loglevel', 'error', '-framerate', str(args.fps), '-i', pattern, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '27', '-preset', 'slow', '-profile:v', 'high', '-movflags', '+faststart', '-an', os.path.join(OUT_DIR, 'humo.mp4')], check=True)
    # WebM (VP9) solo si este ffmpeg lo trae; el MP4 (H.264) lo reproducen todos los navegadores.
    try:
        subprocess.run([ffmpeg, '-y', '-loglevel', 'error', '-framerate', str(args.fps), '-i', pattern, '-c:v', 'libvpx-vp9', '-crf', '36', '-b:v', '0', '-row-mt', '1', '-an', os.path.join(OUT_DIR, 'humo.webm')], check=True)
    except subprocess.CalledProcessError:
        print('  (sin libvpx-vp9: se omite humo.webm)')
    shutil.rmtree(tmp, ignore_errors=True)
    for name in ('humo.mp4', 'humo.webm', 'humo-poster.jpg'):
        if not os.path.exists(os.path.join(OUT_DIR, name)):
            continue
        print(name, round(os.path.getsize(os.path.join(OUT_DIR, name)) / 1024), 'KB')


if __name__ == '__main__':
    main()
