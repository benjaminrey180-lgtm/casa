#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SUPERMERCADO BARRÓN · Utilidad: quitar el fondo del logo (ION GROUP)
====================================================================

Quita el fondo de color/degradado de la mascota SIN ALTERAR EL DIBUJO:
solo borra los píxeles del fondo que están conectados al borde de la imagen.
El personaje (contorno negro, rojo, blanco del gorro) queda intacto, pixel a pixel.

Cómo funciona
-------------
Relleno por difusión (flood fill) que avanza desde los bordes comparando cada
píxel con su vecino. Como el fondo es un DEGRADADO (los colores cambian de a
poquito), este método lo sigue hasta el contorno negro del personaje y se
detiene ahí. No usa "quitar este color" global, por lo que el rojo de la
mascota NO se borra aunque el fondo también sea rojo.

Salidas
-------
  assets/img/logo-barron.png                 PNG con fondo TRANSPARENTE (recortado)
  assets/img/logo-barron-fondo-blanco.png    PNG con fondo BLANCO (para imprimir,
                                             WhatsApp/og:image o cualquier uso)
  assets/img/favicon-64.png                  ícono 64x64 para la pestaña

Uso
---
  python3 herramientas/quitar-fondo-logo.py "ruta/al/archivo original.png"

Requiere: pillow y numpy  (pip install pillow numpy)
"""

import sys
import os
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

# --- Parámetros del algoritmo (ajustables si algún logo lo necesitara) -------
TOLERANCIA   = 10    # diferencia máxima por canal para seguir siendo "fondo"
RECORTAR     = True  # recortar los bordes transparentes sobrantes
MARGEN       = 8     # margen (px) alrededor del personaje al recortar
SUAVIZADO    = 0.7   # radio de suavizado del contorno (anti-serrilado)
ADELGAZAR    = 1     # erosiona el fondo 1 px para borrar el halo de color
ANCHO_FINAL  = 512   # ancho del PNG final (alto proporcional)


def detectar_fondo(arr: np.ndarray, tol: int) -> np.ndarray:
    """Devuelve una máscara booleana: True = píxel de fondo (conectado al borde)."""
    alto, ancho, _ = arr.shape
    fondo = np.zeros((alto, ancho), dtype=bool)
    cola = deque()

    # Semillas: todo el marco exterior de la imagen
    for x in range(ancho):
        for y in (0, alto - 1):
            if not fondo[y, x]:
                fondo[y, x] = True
                cola.append((y, x))
    for y in range(alto):
        for x in (0, ancho - 1):
            if not fondo[y, x]:
                fondo[y, x] = True
                cola.append((y, x))

    # Difusión comparando cada píxel con su vecino (sigue el degradado)
    while cola:
        y, x = cola.popleft()
        actual = arr[y, x]
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < alto and 0 <= nx < ancho and not fondo[ny, nx]:
                if int(np.abs(arr[ny, nx] - actual).max()) <= tol:
                    fondo[ny, nx] = True
                    cola.append((ny, nx))

    return fondo


def procesar(ruta_entrada: str):
    if not os.path.isfile(ruta_entrada):
        sys.exit(f'ERROR: no existe el archivo "{ruta_entrada}"')

    base = os.path.dirname(os.path.abspath(__file__))
    img_dir = os.path.normpath(os.path.join(base, "..", "assets", "img"))
    os.makedirs(img_dir, exist_ok=True)

    original = Image.open(ruta_entrada).convert("RGB")
    arr = np.asarray(original).astype(np.int16)
    alto, ancho, _ = arr.shape
    print(f"Entrada: {ruta_entrada}  ({ancho}x{alto})")

    # 1) Máscara del fondo
    fondo = detectar_fondo(arr, TOLERANCIA)
    pct = 100.0 * fondo.sum() / fondo.size
    print(f"Fondo detectado: {pct:.1f}% de los píxeles")

    # 2) Máscara de opacidad (255 = personaje)
    alfa = Image.fromarray(np.where(fondo, 0, 255).astype(np.uint8), mode="L")

    # 3) Quitar el halo de color del borde y suavizar el recorte
    if ADELGAZAR > 0:
        for _ in range(ADELGAZAR):
            alfa = alfa.filter(ImageFilter.MinFilter(3))   # come 1 px del borde
    if SUAVIZADO > 0:
        alfa = alfa.filter(ImageFilter.GaussianBlur(SUAVIZADO))

    # 4) Aplicar transparencia
    png = original.copy()
    png.putalpha(alfa)

    # 5) Recortar el aire sobrante
    if RECORTAR:
        caja = png.getbbox()
        if caja:
            x0, y0, x1, y1 = caja
            x0 = max(0, x0 - MARGEN); y0 = max(0, y0 - MARGEN)
            x1 = min(ancho, x1 + MARGEN); y1 = min(alto, y1 + MARGEN)
            png = png.crop((x0, y0, x1, y1))
            print(f"Recortado a {png.width}x{png.height}")

    # 6) Reescalar (alta calidad) al ancho final
    if png.width > ANCHO_FINAL:
        nuevo_alto = round(png.height * ANCHO_FINAL / png.width)
        png = png.resize((ANCHO_FINAL, nuevo_alto), Image.LANCZOS)

    # --- Salida 1: transparente (la que usa la página) ---
    ruta_transp = os.path.join(img_dir, "logo-barron.png")
    png.save(ruta_transp, optimize=True)
    print(f"OK  {ruta_transp}  ({png.width}x{png.height}, "
          f"{os.path.getsize(ruta_transp)/1024:.0f} KB, fondo transparente)")

    # --- Salida 2: fondo BLANCO (imprimir / compartir / og:image) ---
    blanco = Image.new("RGBA", png.size, (255, 255, 255, 255))
    blanco.alpha_composite(png)
    ruta_blanco = os.path.join(img_dir, "logo-barron-fondo-blanco.png")
    blanco.convert("RGB").save(ruta_blanco, optimize=True)
    print(f"OK  {ruta_blanco}  (fondo blanco)")

    # --- Salida 3: favicon 64x64 (mascota sobre blanco) ---
    fav = Image.new("RGBA", png.size, (255, 255, 255, 255))
    fav.alpha_composite(png)
    lado = max(fav.size)
    cuadro = Image.new("RGBA", (lado, lado), (255, 255, 255, 255))
    cuadro.paste(fav, ((lado - fav.width) // 2, (lado - fav.height) // 2))
    cuadro = cuadro.resize((64, 64), Image.LANCZOS)
    ruta_fav = os.path.join(img_dir, "favicon-64.png")
    cuadro.convert("RGB").save(ruta_fav, optimize=True)
    print(f"OK  {ruta_fav}  (64x64)")

    print("\nListo. La página toma el logo automáticamente de assets/img/logo-barron.png")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    procesar(sys.argv[1])
