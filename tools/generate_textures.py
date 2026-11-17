"""Generate the cyberpunk asset-viewer textures with Pillow.

Run from the project root:

    python3 tools/generate_textures.py

The PNGs are written to public/textures/ and are loaded by the in-world asset
viewer. Keeping the generator here means every texture can be tweaked and
regenerated instead of being hand-edited binary files.
"""

from pathlib import Path
import math
import random

from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / "public" / "textures"
OUT.mkdir(parents=True, exist_ok=True)

SIZE = 512
CYAN = (72, 240, 255)
MAGENTA = (255, 72, 200)
YELLOW = (255, 200, 64)
INK = (10, 14, 26)


def new(color=INK):
    return Image.new("RGB", (SIZE, SIZE), color)


def save(img, name):
    img.save(OUT / name, "PNG")
    print(name)


def grain(img, amount=8, seed=1):
    rnd = random.Random(seed)
    px = img.load()
    for y in range(SIZE):
        for x in range(SIZE):
            r, g, b = px[x, y]
            n = rnd.randint(-amount, amount)
            px[x, y] = (
                max(0, min(255, r + n)),
                max(0, min(255, g + n)),
                max(0, min(255, b + n)),
            )
    return img


# --- Floor: dark tiles with a glowing cyan grid and junction nodes ---------
img = new((13, 20, 34))
d = ImageDraw.Draw(img)
step = 64
for i in range(0, SIZE + step, step):
    d.line([(i, 0), (i, SIZE)], fill=(24, 60, 82), width=3)
    d.line([(0, i), (SIZE, i)], fill=(24, 60, 82), width=3)
    d.line([(i + 2, 0), (i + 2, SIZE)], fill=(38, 120, 150), width=1)
    d.line([(0, i + 2), (SIZE, i + 2)], fill=(38, 120, 150), width=1)
for x in range(0, SIZE, step):
    for y in range(0, SIZE, step):
        if (x // step + y // step) % 3 == 0:
            d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=CYAN)
grain(img, 6, 11)
save(img, "floor_grid.png")

# --- Wall: panelled tech wall with neon seams and vent slots ---------------
img = new((22, 24, 42))
d = ImageDraw.Draw(img)
for row in range(4):
    for col in range(4):
        x0, y0 = col * 128, row * 128
        d.rectangle([x0 + 4, y0 + 4, x0 + 124, y0 + 124], outline=(46, 58, 88), width=3)
        d.line([(x0 + 8, y0 + 8), (x0 + 120, y0 + 8)], fill=CYAN if (row + col) % 2 else MAGENTA, width=2)
        for v in range(4):
            y = y0 + 42 + v * 14
            d.line([(x0 + 18, y), (x0 + 110, y)], fill=(12, 16, 28), width=6)
            d.line([(x0 + 18, y), (x0 + 110, y)], fill=(70, 84, 116), width=2)
        d.rectangle([x0 + 18, y0 + 104, x0 + 52, y0 + 114], outline=CYAN, width=2)
grain(img, 5, 19)
save(img, "panel_wall.png")

# --- Hazard stripes for walls that must not be walked on ------------------
img = new(YELLOW)
d = ImageDraw.Draw(img)
for i in range(-SIZE, SIZE * 2, 48):
    d.polygon([(i, 0), (i + 24, 0), (i + 24 + SIZE, SIZE), (i + SIZE, SIZE)], fill=(18, 18, 24))
d.rectangle([0, 0, SIZE - 1, SIZE - 1], outline=(8, 10, 16), width=10)
grain(img, 10, 27)
save(img, "hazard_stripes.png")

# --- Climb wall: chevrons telling the player this surface is parkour -------
img = new((16, 22, 36))
d = ImageDraw.Draw(img)
for row in range(5):
    y = 48 + row * 92
    for col in range(3):
        x = 60 + col * 160
        d.line([(x - 44, y + 34), (x, y - 22), (x + 44, y + 34)], fill=CYAN, width=12)
        d.line([(x - 44, y + 46), (x, y - 10), (x + 44, y + 46)], fill=(120, 60, 180), width=5)
d.rectangle([0, 0, SIZE - 1, SIZE - 1], outline=MAGENTA, width=8)
grain(img, 6, 33)
save(img, "climb_chevrons.png")

# --- Raised floor: metallic deck plates with rivets ------------------------
img = new((30, 36, 52))
d = ImageDraw.Draw(img)
for y in range(0, SIZE, 128):
    for x in range(0, SIZE, 128):
        d.rectangle([x + 6, y + 6, x + 122, y + 122], outline=(58, 72, 100), width=4)
        for rx in (x + 18, x + 110):
            for ry in (y + 18, y + 110):
                d.ellipse([rx - 4, ry - 4, rx + 4, ry + 4], fill=(110, 130, 160))
        d.line([(x + 24, y + 64), (x + 104, y + 64)], fill=(86, 104, 138), width=3)
grain(img, 7, 41)
save(img, "floor_tiles.png")

# --- Brushed metal for railings and zipline poles --------------------------
img = new((54, 64, 82))
d = ImageDraw.Draw(img)
rnd = random.Random(57)
for y in range(SIZE):
    shade = rnd.randint(-12, 12)
    d.line([(0, y), (SIZE, y)], fill=(54 + shade, 64 + shade, 82 + shade), width=1)
for x in range(0, SIZE, 64):
    d.line([(x, 0), (x, SIZE)], fill=(28, 36, 52), width=2)
save(img, "rail_metal.png")

# --- Neon strip: emissive-looking horizontal light bar ---------------------
img = new((8, 10, 20))
d = ImageDraw.Draw(img)
for y in range(180, 332):
    t = abs(y - 256) / 76
    color = (
        int(CYAN[0] * (1 - t) + 20 * t),
        int(CYAN[1] * (1 - t) + 24 * t),
        int(CYAN[2] * (1 - t) + 40 * t),
    )
    d.line([(0, y), (SIZE, y)], fill=color, width=1)
d.rectangle([0, 168, SIZE - 1, 176], fill=(200, 250, 255))
d.rectangle([0, 336, SIZE - 1, 344], fill=(200, 250, 255))
save(img, "neon_strip.png")

print("done")
