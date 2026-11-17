"""Generate prop and surface textures for the Velocity level editor.

Run from the project root:

    python3 tools/generate_prop_textures.py

Writes 36 PNGs into public/textures/. Reuses helpers from tools/generate_textures.py.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from generate_textures import (  # noqa: E402
    new_rgba,
    save,
    add_noise,
    draw_glow_layer,
    draw_bevel_box,
    draw_rivet,
    CYAN,
    CYAN_DARK,
    MAGENTA,
    MAGENTA_DARK,
    YELLOW,
    WHITE,
    DARK_BG,
    METAL_DARK,
    METAL_MID,
    METAL_LIGHT,
)

from PIL import Image, ImageDraw, ImageFilter
import math
import random

SIZE = 1024


# ---------------------------------------------------------------- helpers ----

def draw_chevrons(draw, color, every=96, width=10):
    """Draw a row of horizontal > chevrons pointing +X."""
    for y in range(0, SIZE, every):
        points = [(0, y), (width, y - width // 2), (width * 2, y),
                  (width, y + width // 2), (0, y)]
        draw.polygon(points, fill=color)


def horizontal_shades(draw, base_color, spread=26, seed=1, step=2):
    """Fill each horizontal line with a slightly jittered shade."""
    rnd = random.Random(seed)
    for y in range(SIZE):
        shade = rnd.randint(-spread, spread)
        c = tuple(max(0, min(255, base_color[i] + shade)) for i in range(3))
        draw.line([(0, y), (SIZE, y)], fill=c + (255,))


# ------------------------------------------------------------- surfaces ------

def generate_concrete_wall():
    base = new_rgba((62, 66, 74, 255))
    d = ImageDraw.Draw(base)
    horizontal_shades(d, (62, 66, 74), spread=14, seed=11)
    # Form-work seams running vertically.
    for x in range(0, SIZE, 256):
        d.rectangle([x, 0, x + 3, SIZE], fill=(38, 41, 47, 255))
        draw_bevel_box(d, [x - 1, 0, x + 4, SIZE], (90, 95, 105, 255),
                       (24, 26, 30, 255), width=2)
    add_noise(base, amount=9, seed=22)
    save(base, "concrete_wall.png")


def generate_concrete_floor():
    base = new_rgba((82, 88, 98, 255))
    d = ImageDraw.Draw(base)
    horizontal_shades(d, (82, 88, 98), spread=12, seed=33)
    # Expansion joints every 256 px.
    for x in range(0, SIZE, 256):
        d.rectangle([x, 0, x + 4, SIZE], fill=(45, 49, 56, 255))
        draw_bevel_box(d, [x - 1, 0, x + 5, SIZE], (120, 128, 140, 255),
                       (30, 33, 38, 255), width=2)
    add_noise(base, amount=7, seed=44)
    save(base, "concrete_floor.png")


def generate_cracked_concrete():
    base = new_rgba((70, 74, 82, 255))
    d = ImageDraw.Draw(base)
    horizontal_shades(d, (70, 74, 82), spread=14, seed=55)
    # Network of dark cracks.
    rnd = random.Random(66)
    for _ in range(24):
        x0, y0 = rnd.randint(0, SIZE), rnd.randint(0, SIZE)
        x1, y1 = x0 + rnd.randint(-260, 260), y0 + rnd.randint(-260, 260)
        d.line([(x0, y0), (x1, y1)], fill=(15, 18, 22, 255), width=4)
        # Jagged secondary cracks.
        cx, cy = x0, y0
        for _ in range(5):
            cx += rnd.randint(-40, 40)
            cy += rnd.randint(-40, 40)
            d.line([(cx, cy), (max(0, min(SIZE - 1, cx + 60)),
                        max(0, min(SIZE - 1, cy + 60)))], fill=(20, 24, 28, 255),
                   width=2)
    add_noise(base, amount=10, seed=77)
    save(base, "cracked_concrete.png")


def generate_brick_wall():
    base = new_rgba((42, 32, 30, 255))
    d = ImageDraw.Draw(base)
    brick_h = 52
    for row in range(0, SIZE, brick_h):
        offset = (SIZE // 2) if (row // brick_h) % 2 == 0 else 0
        for x in range(-offset, SIZE, 104):
            draw_bevel_box(d, [x + offset, row, x + 96 + offset, row + brick_h - 4],
                           (70, 55, 52, 255), (16, 10, 9, 255), width=3)
    # Mortar lines.
    for row in range(0, SIZE, brick_h):
        d.rectangle([0, row, SIZE, row + 3], fill=(18, 14, 13, 255))
    add_noise(base, amount=10, seed=88)
    save(base, "brick_wall.png")


def generate_corrugated_metal():
    base = new_rgba((38, 46, 58, 255))
    d = ImageDraw.Draw(base)
    horizontal_shades(d, (38, 46, 58), spread=16, seed=99)
    rib = 40
    for y in range(0, SIZE, rib):
        d.rectangle([0, y, SIZE, y + rib // 2], fill=(58, 68, 80, 255))
        draw_bevel_box(d, [0, y, SIZE, y + rib // 2], (110, 128, 145, 255),
                       (16, 20, 26, 255), width=2)
        d.rectangle([0, y + rib // 2, SIZE, y + rib], fill=(20, 26, 34, 255))
    add_noise(base, amount=10, seed=101)
    save(base, "corrugated_metal.png")


def generate_rusted_metal():
    base = new_rgba((42, 28, 18, 255))
    d = ImageDraw.Draw(base)
    horizontal_shades(d, (42, 28, 18), spread=22, seed=112)
    rnd = random.Random(123)
    for _ in range(40):
        cx, cy = rnd.randint(0, SIZE), rnd.randint(0, SIZE)
        rad = rnd.randint(30, 110)
        glow = new_rgba()
        dg = ImageDraw.Draw(glow)
        dg.ellipse([cx - rad, cy - rad, cx + rad, cy + rad],
                   fill=(110, 55, 25, 120))
        glow = glow.filter(ImageFilter.GaussianBlur(rad / 3))
        base = Image.alpha_composite(base, glow)
    add_noise(base, amount=14, seed=134)
    save(base, "rusted_metal.png")


def generate_scratched_metal():
    base = new_rgba((48, 58, 72, 255))
    d = ImageDraw.Draw(base)
    horizontal_shades(d, (48, 58, 72), spread=14, seed=145)
    rnd = random.Random(156)
    for _ in range(300):
        x0, y0 = rnd.randint(0, SIZE), rnd.randint(0, SIZE)
        x1, y1 = x0 + rnd.randint(-400, 400), y0 + rnd.randint(-60, 60)
        d.line([(x0, y0), (x1, y1)], fill=(20, 28, 38, 255), width=2)
    add_noise(base, amount=10, seed=167)
    save(base, "scratched_metal.png")


# ---------------------------------------------------------------- props ------

def generate_plastic_crate():
    base = new_rgba((26, 42, 66, 255))
    d = ImageDraw.Draw(base)
    horizontal_shades(d, (26, 42, 66), spread=14, seed=178)
    # Corner ribs and vent slots.
    for x in (40, SIZE - 44):
        draw_bevel_box(d, [x, 120, x + 14, SIZE - 120], (42, 64, 96, 255),
                       (8, 16, 28, 255), width=4)
    for y in range(180, SIZE - 180, 110):
        d.rectangle([90, y, SIZE - 90, y + 10], fill=(14, 24, 40, 255))
        draw_bevel_box(d, [90, y, SIZE - 90, y + 10], (50, 72, 108, 255),
                       (6, 12, 22, 255), width=2)
    add_noise(base, amount=10, seed=189)
    save(base, "plastic_crate.png")


def generate_cardboard_box():
    base = new_rgba((150, 112, 70, 255))
    d = ImageDraw.Draw(base)
    horizontal_shades(d, (150, 112, 70), spread=18, seed=200)
    # Tape seam down the middle.
    d.rectangle([SIZE // 2 - 24, 0, SIZE // 2 + 24, SIZE], fill=(200, 170, 100, 255))
    draw_bevel_box(d, [SIZE // 2 - 26, 0, SIZE // 2 + 26, SIZE], (220, 190, 120, 255),
                   (120, 90, 60, 255), width=4)
    # Printed label area.
    d.rectangle([SIZE // 4, SIZE // 4, SIZE * 3 // 4, SIZE * 3 // 4],
                fill=(170, 130, 88, 255))
    draw_bevel_box(d, [SIZE // 4, SIZE // 4, SIZE * 3 // 4, SIZE * 3 // 4],
                   (190, 150, 108, 255), (110, 80, 48, 255), width=3)
    add_noise(base, amount=14, seed=211)
    save(base, "cardboard_box.png")


def generate_wooden_crate():
    base = new_rgba((80, 50, 30, 255))
    d = ImageDraw.Draw(base)
    plank = 130
    for y in range(0, SIZE, plank):
        draw_bevel_box(d, [0, y, SIZE, y + plank - 6], (110, 70, 46, 255),
                       (30, 14, 8, 255), width=4)
    # Metal corner brackets.
    for cx in (120, SIZE - 120):
        for cy in (120, SIZE - 120):
            d.rectangle([cx - 40, cy - 40, cx + 40, cy + 40], fill=(70, 55, 35, 255))
            draw_bevel_box(d, [cx - 40, cy - 40, cx + 40, cy + 40],
                           (130, 110, 80, 255), (40, 30, 20, 255), width=4)
    add_noise(base, amount=14, seed=222)
    save(base, "wooden_crate.png")


def generate_trash_bag():
    base = new_rgba((16, 16, 20, 255))
    d = ImageDraw.Draw(base)
    rnd = random.Random(233)
    for _ in range(60):
        cx, cy = rnd.randint(0, SIZE), rnd.randint(0, SIZE)
        rad = rnd.randint(20, 70)
        d.ellipse([cx - rad, cy - rad, cx + rad, cy + rad],
                  fill=(26, 26, 34, 140))
    # Highlight wrinkles.
    for y in range(0, SIZE, 120):
        d.line([(0, y), (SIZE, y + 40)], fill=(40, 40, 48, 100), width=3)
    add_noise(base, amount=8, seed=244)
    save(base, "trash_bag.png")


def generate_dumpster():
    base = new_rgba((28, 60, 58, 255))
    d = ImageDraw.Draw(base)
    horizontal_shades(d, (28, 60, 58), spread=16, seed=255)
    rib = 70
    for y in range(0, SIZE, rib):
        d.rectangle([0, y, SIZE, y + rib // 2], fill=(42, 80, 76, 255))
        draw_bevel_box(d, [0, y, SIZE, y + rib // 2], (90, 130, 124, 255),
                       (8, 24, 22, 255), width=3)
    # Rust streaks.
    rnd = random.Random(266)
    for _ in range(8):
        x = rnd.randint(0, SIZE)
        for y in range(0, SIZE, 40):
            d.line([x, y, x + 30, y + 40], fill=(110, 50, 20, 130), width=4)
    add_noise(base, amount=12, seed=277)
    save(base, "dumpster.png")


def generate_sign_blank():
    base = new_rgba((150, 158, 168, 255))
    d = ImageDraw.Draw(base)
    d.rectangle([16, 16, SIZE - 16, SIZE - 16], fill=(190, 198, 208, 255))
    draw_bevel_box(d, [16, 16, SIZE - 16, SIZE - 16], (210, 218, 228, 255),
                   (80, 88, 98, 255), width=4)
    d.rectangle([32, 32, SIZE - 32, SIZE - 32], fill=(160, 168, 178, 255))
    add_noise(base, amount=6, seed=288)
    save(base, "sign_blank.png")


def generate_sign_neon():
    base = new_rgba((10, 14, 20, 255))
    d = ImageDraw.Draw(base)
    # Dark sign plate.
    d.rectangle([20, 20, SIZE - 20, SIZE - 20], fill=(24, 32, 42, 255))
    draw_bevel_box(d, [20, 20, SIZE - 20, SIZE - 20], (60, 72, 84, 255),
                   (2, 4, 6, 255), width=4)
    # Glowing cyan neon border + arrow pointing right.
    def neon_draw(draw, color):
        draw.rectangle([20, 20, SIZE - 20, SIZE - 20], outline=color, width=14)
        pts = [(SIZE * 0.3, SIZE * 0.35), (SIZE * 0.6, SIZE * 0.35),
               (SIZE * 0.6, SIZE * 0.65), (SIZE * 0.75, SIZE * 0.5),
               (SIZE * 0.6, SIZE * 0.35)]
        draw.polygon(pts, fill=color)

    base = draw_glow_layer(base, neon_draw, CYAN, radius=28, intensity=2.0)
    add_noise(base, amount=6, seed=299)
    save(base, "sign_neon.png")


def generate_graffiti():
    base = new_rgba((62, 66, 74, 255))
    d = ImageDraw.Draw(base)
    horizontal_shades(d, (62, 66, 74), spread=12, seed=310)
    rnd = random.Random(321)
    for color, count in ((CYAN, 12), (MAGENTA, 10), (YELLOW, 8)):
        for _ in range(count):
            cx, cy = rnd.randint(0, SIZE), rnd.randint(0, SIZE)
            for _ in range(rnd.randint(2, 5)):
                cx += rnd.randint(-120, 120)
                cy += rnd.randint(-120, 120)
                d.ellipse([cx - 40, cy - 40, cx + 40, cy + 40],
                          fill=color + (150,))
    add_noise(base, amount=10, seed=332)
    save(base, "graffiti.png")


def generate_white_tiles():
    base = new_rgba((235, 240, 245, 255))
    d = ImageDraw.Draw(base)
    tile = 128
    for y in range(0, SIZE, tile):
        d.rectangle([0, y, SIZE, y + 5], fill=(170, 180, 190, 255))
        for x in range(0, SIZE, tile):
            draw_bevel_box(d, [x, y + 5, x + tile - 5, y + tile - 5],
                           (245, 250, 255, 255), (190, 200, 210, 255), width=2)
    add_noise(base, amount=4, seed=343)
    save(base, "white_tiles.png")


def generate_dirty_tiles():
    base = new_rgba((200, 200, 200, 255))
    d = ImageDraw.Draw(base)
    tile = 128
    for y in range(0, SIZE, tile):
        d.rectangle([0, y, SIZE, y + 6], fill=(80, 80, 80, 255))
        for x in range(0, SIZE, tile):
            d.rectangle([x, y + 6, x + tile - 6, y + tile - 6],
                        fill=(160, 155, 145, 255))
            draw_bevel_box(d, [x, y + 6, x + tile - 6, y + tile - 6],
                           (180, 175, 165, 255), (110, 105, 95, 255), width=2)
    rnd = random.Random(354)
    for _ in range(25):
        cx, cy = rnd.randint(0, SIZE), rnd.randint(0, SIZE)
        d.ellipse([cx - 20, cy - 20, cx + 20, cy + 20], fill=(100, 90, 70, 140))
    add_noise(base, amount=10, seed=365)
    save(base, "dirty_tiles.png")


def generate_grate_floor():
    base = new_rgba((30, 36, 44, 255))
    d = ImageDraw.Draw(base)
    step = 40
    for y in range(0, SIZE, step):
        d.line([(0, y), (SIZE, y)], fill=(12, 14, 18, 255), width=3)
    for x in range(0, SIZE, step):
        d.line([(x, 0), (x, SIZE)], fill=(12, 14, 18, 255), width=3)
    # Bevel the crossing bars slightly.
    for y in range(0, SIZE, step):
        draw_bevel_box(d, [0, y - 2, SIZE, y + 2], (90, 104, 120, 255),
                       (6, 8, 10, 255), width=2)
    for x in range(0, SIZE, step):
        draw_bevel_box(d, [x - 2, 0, x + 2, SIZE], (90, 104, 120, 255),
                       (6, 8, 10, 255), width=2)
    add_noise(base, amount=8, seed=376)
    save(base, "grate_floor.png")


def generate_chainlink():
    base = new_rgba((8, 10, 14, 255))
    d = ImageDraw.Draw(base)
    rnd = random.Random(387)
    step = 36
    for y in range(-step // 2, SIZE, step):
        offset = step // 2 if (y // step) % 2 == 0 else 0
        for x in range(-step, SIZE, step):
            cx = x + offset
            d.ellipse([cx - 14, y - 14, cx + 14, y + 14], outline=(60, 72, 84, 180),
                      width=2)
    add_noise(base, amount=6, seed=398)
    save(base, "chainlink.png")


def generate_mesh_fence():
    base = new_rgba((12, 14, 18, 255))
    d = ImageDraw.Draw(base)
    step = 48
    for y in range(0, SIZE, step):
        d.line([(0, y), (SIZE, y)], fill=(40, 50, 60, 255), width=2)
    for x in range(0, SIZE, step):
        d.line([(x, 0), (x, SIZE)], fill=(40, 50, 60, 255), width=2)
    # Frame border.
    draw_bevel_box(d, [0, 0, SIZE, SIZE], (90, 104, 120, 255), (6, 8, 10, 255),
                   width=5)
    add_noise(base, amount=8, seed=409)
    save(base, "mesh_fence.png")


def generate_pipe_metal():
    base = new_rgba((38, 46, 58, 255))
    d = ImageDraw.Draw(base)
    # Flange bands around the pipe.
    for y in range(0, SIZE, 140):
        d.rectangle([0, y, SIZE, y + 26], fill=(52, 62, 74, 255))
        draw_bevel_box(d, [0, y, SIZE, y + 26], (110, 128, 144, 255),
                       (16, 20, 26, 255), width=3)
    # Cylindrical specular highlight.
    highlight = new_rgba()
    dh = ImageDraw.Draw(highlight)
    for y in range(SIZE):
        intensity = int(60 * math.pow(math.sin(y / SIZE * math.pi), 2))
        dh.line([(0, y), (SIZE, y)], fill=(200, 230, 255, intensity), width=1)
    base = Image.alpha_composite(base, highlight)
    add_noise(base, amount=10, seed=420)
    save(base, "pipe_metal.png")


def generate_barrel():
    base = new_rgba((210, 150, 30, 255))
    d = ImageDraw.Draw(base)
    horizontal_shades(d, (210, 150, 30), spread=18, seed=431)
    # Blue hazard band.
    d.rectangle([0, SIZE * 3 // 8, SIZE, SIZE * 5 // 8], fill=(20, 60, 110, 255))
    draw_bevel_box(d, [0, SIZE * 3 // 8, SIZE, SIZE * 5 // 8],
                   (60, 110, 160, 255), (6, 20, 40, 255), width=4)
    add_noise(base, amount=12, seed=442)
    save(base, "barrel.png")


def generate_caution_stripe():
    base = new_rgba((0, 0, 0, 255))
    d = ImageDraw.Draw(base)
    stripe = 60
    for y in range(0, SIZE, stripe * 2):
        d.polygon([(0, y), (stripe, y + stripe), (0, y + stripe * 2)],
                  fill=YELLOW)
        d.polygon([(stripe, y), (SIZE, y + stripe), (stripe, y + stripe * 2)],
                  fill=(255, 255, 255))
    add_noise(base, amount=8, seed=453)
    save(base, "caution_stripe.png")


def generate_circuit_board():
    base = new_rgba((20, 50, 40, 255))
    d = ImageDraw.Draw(base)
    rnd = random.Random(464)
    for _ in range(200):
        x0, y0 = rnd.randint(0, SIZE), rnd.randint(0, SIZE)
        x1, y1 = x0 + rnd.randint(-120, 120), y0 + rnd.randint(-120, 120)
        d.line([(x0, y0), (x1, y1)], fill=(40, 90, 70, 255), width=3)
        if rnd.random() < 0.4:
            d.ellipse([x0 - 6, y0 - 6, x0 + 6, y0 + 6], fill=(255, 220, 120, 255))
    # Glowing traces.
    def glow_draw(draw, color):
        for _ in range(40):
            x0, y0 = rnd.randint(0, SIZE), rnd.randint(0, SIZE)
            draw.line([(x0, y0), (x0 + 60, y0 + 60)], fill=color, width=2)

    base = draw_glow_layer(base, glow_draw, CYAN, radius=10, intensity=1.6)
    add_noise(base, amount=8, seed=475)
    save(base, "circuit_board.png")


def generate_server_rack():
    base = new_rgba((16, 18, 24, 255))
    d = ImageDraw.Draw(base)
    horizontal_shades(d, (16, 18, 24), spread=14, seed=486)
    # Vent slots.
    for y in range(60, SIZE - 60, 60):
        d.rectangle([60, y, SIZE - 60, y + 8], fill=(8, 10, 14, 255))
        draw_bevel_box(d, [60, y, SIZE - 60, y + 8], (40, 48, 58, 255),
                       (2, 2, 4, 255), width=2)
    # Blinking LED rows.
    rnd = random.Random(497)
    for row in range(4, SIZE - 4, 34):
        for x in range(20, SIZE - 20, 28):
            if rnd.random() < 0.35:
                d.rectangle([x, row, x + 10, row + 10], fill=(0, 240, 255, 255))
    add_noise(base, amount=8, seed=508)
    save(base, "server_rack.png")


def generate_window_lit():
    base = new_rgba((20, 16, 12, 255))
    d = ImageDraw.Draw(base)
    # Mullions.
    d.rectangle([SIZE // 2 - 6, 0, SIZE // 2 + 6, SIZE], fill=(60, 50, 40, 255))
    d.rectangle([0, SIZE // 2 - 6, SIZE, SIZE // 2 + 6], fill=(60, 50, 40, 255))
    # Warm interior glow.
    def glow_draw(draw, color):
        draw.rectangle([30, 30, SIZE - 30, SIZE - 30], fill=color)

    base = draw_glow_layer(base, glow_draw, (255, 170, 80), radius=40, intensity=2.0)
    add_noise(base, amount=6, seed=519)
    save(base, "window_lit.png")


def generate_window_dark():
    base = new_rgba((8, 10, 14, 255))
    d = ImageDraw.Draw(base)
    d.rectangle([SIZE // 2 - 6, 0, SIZE // 2 + 6, SIZE], fill=(30, 34, 40, 255))
    d.rectangle([0, SIZE // 2 - 6, SIZE, SIZE // 2 + 6], fill=(30, 34, 40, 255))
    # Faint reflections.
    d.line([(0, 120), (SIZE, 140)], fill=(60, 70, 80, 90), width=2)
    d.line([(SIZE, 880), (0, 900)], fill=(60, 70, 80, 60), width=2)
    add_noise(base, amount=6, seed=530)
    save(base, "window_dark.png")


def generate_billboard_ads():
    base = new_rgba((12, 14, 20, 255))
    d = ImageDraw.Draw(base)
    rnd = random.Random(541)
    for _ in range(14):
        x0, y0 = rnd.randint(0, SIZE), rnd.randint(0, SIZE)
        w, h = rnd.randint(100, 300), rnd.randint(80, 200)
        color = rnd.choice([CYAN, MAGENTA, YELLOW, WHITE])
        d.rectangle([x0, y0, min(SIZE, x0 + w), min(SIZE, y0 + h)],
                    fill=color + (110,))
    # Glowing ad blocks.
    def glow_draw(draw, color):
        for _ in range(6):
            x0, y0 = rnd.randint(0, SIZE), rnd.randint(0, SIZE)
            draw.rectangle([x0, y0, x0 + 150, y0 + 100], fill=color)

    base = draw_glow_layer(base, glow_draw, CYAN, radius=22, intensity=1.8)
    add_noise(base, amount=8, seed=552)
    save(base, "billboard_ads.png")


def generate_air_vent():
    base = new_rgba((26, 32, 40, 255))
    d = ImageDraw.Draw(base)
    d.rectangle([40, 40, SIZE - 40, SIZE - 40], fill=(42, 52, 64, 255))
    draw_bevel_box(d, [40, 40, SIZE - 40, SIZE - 40], (90, 104, 120, 255),
                   (8, 12, 16, 255), width=4)
    # Angled louvre slats.
    for y in range(100, SIZE - 100, 40):
        d.line([(60, y), (SIZE - 60, y - 20)], fill=(14, 18, 24, 255), width=26)
        d.line([(60, y), (SIZE - 60, y - 20)], fill=(80, 96, 112, 255), width=3)
    add_noise(base, amount=8, seed=563)
    save(base, "air_vent.png")


def generate_duct_metal():
    base = new_rgba((38, 46, 58, 255))
    d = ImageDraw.Draw(base)
    horizontal_shades(d, (38, 46, 58), spread=14, seed=574)
    # Riveted seams.
    for y in range(0, SIZE, 120):
        d.rectangle([0, y, SIZE, y + 18], fill=(52, 62, 74, 255))
        draw_bevel_box(d, [0, y, SIZE, y + 18], (110, 128, 144, 255),
                       (16, 20, 26, 255), width=3)
        for x in range(60, SIZE, 150):
            draw_rivet(d, x, y + 9, radius=7)
    add_noise(base, amount=10, seed=585)
    save(base, "duct_metal.png")


def generate_puddle():
    base = new_rgba((16, 20, 28, 255))
    d = ImageDraw.Draw(base)
    # Dark asphalt.
    horizontal_shades(d, (16, 20, 28), spread=10, seed=596)
    # Reflective puddle with ripples.
    for y in range(SIZE // 3, SIZE * 2 // 3, 18):
        d.ellipse([SIZE * 0.25, y, SIZE * 0.75, y + 14],
                  fill=(30, 40, 56, 160))
        d.arc([SIZE * 0.3, y - 8, SIZE * 0.7, y + 22], 0, 180,
              fill=(80, 110, 140, 100), width=3)
    add_noise(base, amount=10, seed=607)
    save(base, "puddle.png")


def generate_asphalt():
    base = new_rgba((26, 28, 34, 255))
    d = ImageDraw.Draw(base)
    rnd = random.Random(618)
    for _ in range(900):
        x, y = rnd.randint(0, SIZE - 1), rnd.randint(0, SIZE - 1)
        c = rnd.randint(20, 40)
        d.point((x, y), fill=(c, c + 2, c + 6, 255))
    add_noise(base, amount=8, seed=629)
    save(base, "asphalt.png")


def generate_rooftop_gravel():
    base = new_rgba((70, 74, 80, 255))
    d = ImageDraw.Draw(base)
    rnd = random.Random(640)
    for _ in range(1500):
        x, y = rnd.randint(0, SIZE - 1), rnd.randint(0, SIZE - 1)
        c = rnd.randint(40, 100)
        d.point((x, y), fill=(c, c + 4, c + 10, 255))
    # Tar patches.
    for _ in range(8):
        cx, cy = rnd.randint(0, SIZE), rnd.randint(0, SIZE)
        rad = rnd.randint(60, 140)
        d.ellipse([cx - rad, cy - rad, cx + rad, cy + rad],
                  fill=(30, 34, 40, 130))
    add_noise(base, amount=10, seed=651)
    save(base, "rooftop_gravel.png")


def generate_scaffolding():
    base = new_rgba((140, 120, 70, 255))
    d = ImageDraw.Draw(base)
    horizontal_shades(d, (140, 120, 70), spread=16, seed=662)
    step = 96
    for y in range(0, SIZE, step):
        d.line([(0, y), (SIZE, y)], fill=(90, 70, 30, 255), width=5)
    for x in range(0, SIZE, step):
        d.line([(x, 0), (x, SIZE)], fill=(90, 70, 30, 255), width=5)
    # Diagonal braces.
    for y in range(0, SIZE, step * 2):
        d.line([(0, y), (step * 2, y + step * 2)], fill=(110, 90, 40, 255),
               width=4)
    add_noise(base, amount=12, seed=673)
    save(base, "scaffolding.png")


def generate_cable_bundle():
    base = new_rgba((14, 16, 20, 255))
    d = ImageDraw.Draw(base)
    rnd = random.Random(684)
    for _ in range(40):
        x0, y0 = rnd.randint(0, SIZE), rnd.randint(0, SIZE)
        x1, y1 = x0 + rnd.randint(-300, 300), y0 + rnd.randint(-200, 200)
        d.line([(x0, y0), (x1, y1)], fill=(30, 34, 40, 255), width=20)
    # Binding straps.
    for y in range(80, SIZE - 80, 110):
        d.rectangle([SIZE // 2 - 24, y, SIZE // 2 + 24, y + 20],
                    fill=(40, 46, 54, 255))
        draw_bevel_box(d, [SIZE // 2 - 26, y, SIZE // 2 + 26, y + 20],
                       (80, 92, 104, 255), (12, 14, 18, 255), width=3)
    add_noise(base, amount=8, seed=695)
    save(base, "cable_bundle.png")


def generate_poster():
    base = new_rgba((62, 66, 74, 255))
    d = ImageDraw.Draw(base)
    rnd = random.Random(706)
    # Torn layered posters.
    for i in range(6):
        x0 = i * 160
        y0 = rnd.randint(100, SIZE - 300)
        w, h = rnd.randint(120, 220), rnd.randint(180, 300)
        color = rnd.choice([CYAN, MAGENTA, YELLOW, (120, 140, 160)])
        d.rectangle([x0, y0, x0 + w, y0 + h], fill=color + (140,))
        # Torn edges.
        for _ in range(8):
            tx = x0 + rnd.randint(0, w)
            d.line([(tx, y0), (tx + rnd.randint(-30, 30), y0 + h)],
                   fill=(20, 24, 30, 255), width=4)
    add_noise(base, amount=10, seed=717)
    save(base, "poster.png")


# ------------------------------------------------------------------ run ------

ALL = [
    generate_concrete_wall,
    generate_concrete_floor,
    generate_cracked_concrete,
    generate_brick_wall,
    generate_corrugated_metal,
    generate_rusted_metal,
    generate_scratched_metal,
    generate_plastic_crate,
    generate_cardboard_box,
    generate_wooden_crate,
    generate_trash_bag,
    generate_dumpster,
    generate_sign_blank,
    generate_sign_neon,
    generate_graffiti,
    generate_white_tiles,
    generate_dirty_tiles,
    generate_grate_floor,
    generate_chainlink,
    generate_mesh_fence,
    generate_pipe_metal,
    generate_barrel,
    generate_caution_stripe,
    generate_circuit_board,
    generate_server_rack,
    generate_window_lit,
    generate_window_dark,
    generate_billboard_ads,
    generate_air_vent,
    generate_duct_metal,
    generate_puddle,
    generate_asphalt,
    generate_rooftop_gravel,
    generate_scaffolding,
    generate_cable_bundle,
    generate_poster,
]

if __name__ == "__main__":
    generated = []
    for fn in ALL:
        fn()
        generated.append(fn.__name__)
    print(f"\nGenerated {len(generated)} textures:")
    for name in generated:
        print("  ", name)
