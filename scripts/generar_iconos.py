"""Genera los íconos PNG de la app sin dependencias externas (solo zlib/struct).

Uso:  python scripts/generar_iconos.py

Dibujo: fondo verde con degradé y dos monedas superpuestas (la de atrás translúcida),
con un anillo interior en la de adelante. iOS redondea las esquinas solo, así que el fondo es cuadrado.
"""

import math
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "icons"

TOP = (24, 140, 98)
BOTTOM = (6, 78, 54)
WHITE = (255, 255, 255)


def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def over(dst, src, alpha):
    return tuple(dst[i] * (1 - alpha) + src[i] * alpha for i in range(3))


def coverage(signed_dist_px):
    """Antialiasing analítico: cobertura de un píxel según su distancia al borde."""
    return max(0.0, min(1.0, 0.5 - signed_dist_px))


def render(size):
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            u = (x + 0.5) / size
            v = (y + 0.5) / size
            bg = lerp(TOP, BOTTOM, min(1.0, max(0.0, 0.15 * u + 0.85 * v)))
            col = bg

            # Moneda de atrás
            d_back = math.hypot(u - 0.40, v - 0.39) - 0.215
            col = over(col, WHITE, 0.38 * coverage(d_back * size))

            # Sombra suave de la moneda de adelante
            d_shadow = math.hypot(u - 0.585, v - 0.605) - 0.245
            col = over(col, (0, 0, 0), 0.18 * max(0.0, min(1.0, 0.5 - d_shadow * size / 6)))

            # Moneda de adelante
            d_front = math.hypot(u - 0.58, v - 0.59) - 0.235
            col = over(col, WHITE, coverage(d_front * size))

            # Anillo interior (color del fondo)
            r = math.hypot(u - 0.58, v - 0.59)
            d_ring = abs(r - 0.165) - 0.016
            col = over(col, bg, coverage(d_ring * size))

            row.extend(int(round(c)) for c in col)
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    raw = b"".join(b"\x00" + r for r in rows)

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)


def main():
    OUT.mkdir(exist_ok=True)
    for name, size in [("apple-touch-icon.png", 180), ("icon-192.png", 192), ("icon-512.png", 512)]:
        write_png(OUT / name, size, render(size))
        print(f"OK {name} ({size}x{size})")


if __name__ == "__main__":
    main()
