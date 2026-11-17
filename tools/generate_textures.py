"""Generate high-fidelity cyberpunk asset-viewer textures with Pillow.

Run from the project root:

    python3 tools/generate_textures.py

The PNGs are written to public/textures/ and are loaded by the in-world asset
viewer.
"""

from pathlib import Path
import math
import random
from PIL import Image, ImageDraw, ImageFilter, ImageChops, ImageEnhance

OUT = Path(__file__).resolve().parent.parent / "public" / "textures"
OUT.mkdir(parents=True, exist_ok=True)

SIZE = 1024

# Cyberpunk Palette
CYAN = (0, 240, 255)
CYAN_DARK = (0, 100, 160)
MAGENTA = (255, 32, 160)
MAGENTA_DARK = (140, 0, 80)
YELLOW = (255, 185, 0)
WHITE = (245, 250, 255)
DARK_BG = (10, 14, 23)
METAL_DARK = (18, 22, 32)
METAL_MID = (42, 52, 72)
METAL_LIGHT = (90, 110, 140)


def new_rgba(color=(0, 0, 0, 0)):
    return Image.new("RGBA", (SIZE, SIZE), color)


def save(img, name):
    rgb_img = img.convert("RGB")
    rgb_img.save(OUT / name, "PNG", quality=100)
    print(f"Generated: {name}")


# --- Procedural Helpers -----------------------------------------------------

def add_noise(img, amount=6, seed=42):
    """Adds subtle filmic noise to smooth out gradient banding."""
    rnd = random.Random(seed)
    noise = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    px = noise.load()
    for y in range(0, SIZE, 2):
        for x in range(0, SIZE, 2):
            val = rnd.randint(-amount, amount)
            a = max(0, min(255, abs(val) * 3))
            c = 255 if val > 0 else 0
            color = (c, c, c, a)
            px[x, y] = color
            if x + 1 < SIZE: px[x + 1, y] = color
            if y + 1 < SIZE: px[x, y + 1] = color
            if x + 1 < SIZE and y + 1 < SIZE: px[x + 1, y + 1] = color
    return Image.alpha_composite(img, noise)


def draw_glow_layer(base, draw_fn, color, radius=16, intensity=1.8):
    """Multi-pass volumetric atmospheric bloom for glowing neon elements."""
    # Outer ambient bloom
    glow_soft = new_rgba()
    d_soft = ImageDraw.Draw(glow_soft)
    draw_fn(d_soft, color + (100,))
    glow_soft = glow_soft.filter(ImageFilter.GaussianBlur(radius * 2))

    # Sharp inner halo
    glow_sharp = new_rgba()
    d_sharp = ImageDraw.Draw(glow_sharp)
    draw_fn(d_sharp, color + (200,))
    glow_sharp = glow_sharp.filter(ImageFilter.GaussianBlur(max(2, radius // 3)))

    # Intense white hot core
    core = new_rgba()
    d_core = ImageDraw.Draw(core)
    draw_fn(d_core, WHITE + (240,))
    core = core.filter(ImageFilter.GaussianBlur(1))

    # Composite layers
    base = Image.alpha_composite(base, glow_soft)
    base = Image.alpha_composite(base, glow_sharp)
    base = Image.alpha_composite(base, core)
    return base


def create_carbon_texture():
    """Generates a micro carbon-fiber weave pattern."""
    img = new_rgba((0, 0, 0, 255))
    d = ImageDraw.Draw(img)
    step = 16
    for y in range(0, SIZE, step):
        for x in range(0, SIZE, step):
            if ((x // step) + (y // step)) % 2 == 0:
                d.rectangle([x, y, x + step, y + step], fill=(24, 30, 42, 255))
                d.line([(x, y), (x + step, y + step)], fill=(36, 46, 62, 255), width=2)
            else:
                d.rectangle([x, y, x + step, y + step], fill=(14, 18, 26, 255))
                d.line([(x + step, y), (x, y + step)], fill=(28, 36, 50, 255), width=2)
    return img


def draw_bevel_box(draw, box, light_col, dark_col, width=3):
    """Draws 3D chamfered edge highlights and shadows."""
    x0, y0, x1, y1 = box
    for i in range(width):
        draw.line([(x0 + i, y0 + i), (x1 - i, y0 + i)], fill=light_col)
        draw.line([(x0 + i, y0 + i), (x0 + i, y1 - i)], fill=light_col)
        draw.line([(x0 + i, y1 - i), (x1 - i, y1 - i)], fill=dark_col)
        draw.line([(x1 - i, y0 + i), (x1 - i, y1 - i)], fill=dark_col)


def draw_rivet(draw, x, y, radius=7):
    """Draws a detailed 3D metallic rivet with specular highlights."""
    draw.ellipse([x - radius - 1, y - radius - 1, x + radius + 1, y + radius + 1], fill=(10, 12, 18, 220))
    draw.ellipse([x - radius, y - radius, x + radius, y + radius], fill=(55, 68, 92, 255))
    draw.arc([x - radius, y - radius, x + radius, y + radius], 180, 270, fill=(180, 210, 240, 255), width=2)
    draw.arc([x - radius, y - radius, x + radius, y + radius], 0, 90, fill=(20, 25, 36, 255), width=2)
    draw.ellipse([x - 2, y - 3, x + 1, y - 1], fill=(230, 245, 255, 255))


# --- 1. Floor Grid: Tech tiles with emissive circuits and junctions --------
def generate_floor_grid():
    base = create_carbon_texture()
    overlay = new_rgba()
    d = ImageDraw.Draw(overlay)

    step = 128
    # Panel Borders & Inset Bevels
    for x in range(0, SIZE, step):
        for y in range(0, SIZE, step):
            d.rectangle([x + 4, y + 4, x + step - 4, y + step - 4], outline=(32, 42, 60, 255), width=2)
            draw_bevel_box(d, [x + 8, y + 8, x + step - 8, y + step - 8], (60, 78, 105, 180), (12, 16, 24, 220), width=2)

            # Corner accents on panels
            c = 16
            d.line([(x + 8, y + 8 + c), (x + 8 + c, y + 8)], fill=(80, 110, 150, 200), width=2)
            d.line([(x + step - 8 - c, y + 8), (x + step - 8, y + 8 + c)], fill=(80, 110, 150, 200), width=2)

    base = Image.alpha_composite(base, overlay)

    # Neon Grid & Circuit Nodes Layer
    def draw_grid_lines(draw_obj, color):
        for i in range(0, SIZE + step, step):
            draw_obj.line([(i, 0), (i, SIZE)], fill=color, width=3)
            draw_obj.line([(0, i), (SIZE, i)], fill=color, width=3)

        # Junction Node Details
        for x in range(0, SIZE + step, step):
            for y in range(0, SIZE + step, step):
                if (x // step + y // step) % 2 == 0:
                    draw_obj.ellipse([x - 12, y - 12, x + 12, y + 12], outline=color, width=3)
                    draw_obj.ellipse([x - 5, y - 5, x + 5, y + 5], fill=color)

    base = draw_glow_layer(base, draw_grid_lines, CYAN, radius=14)
    base = add_noise(base, 5, 11)
    save(base, "floor_grid.png")


# --- 2. Wall: Sci-fi panelled wall with louvers and warning decals -------
def generate_panel_wall():
    base = new_rgba(DARK_BG + (255,))
    d_base = ImageDraw.Draw(base)

    panel_size = 256
    for row in range(4):
        for col in range(4):
            x0, y0 = col * panel_size, row * panel_size
            x1, y1 = x0 + panel_size, y0 + panel_size

            # Heavy Outer Frame
            d_base.rectangle([x0 + 4, y0 + 4, x1 - 4, y1 - 4], fill=(22, 28, 42, 255), outline=(45, 58, 82, 255), width=3)
            draw_bevel_box(d_base, [x0 + 8, y0 + 8, x1 - 8, y1 - 8], (70, 90, 125, 255), (10, 14, 20, 255), width=3)

            # Recessed Louvers (Vents)
            for v in range(5):
                vy = y0 + 64 + v * 22
                d_base.rectangle([x0 + 24, vy, x1 - 24, vy + 12], fill=(10, 12, 18, 255))
                d_base.rectangle([x0 + 26, vy + 2, x1 - 26, vy + 7], fill=(40, 52, 72, 255))
                d_base.line([(x0 + 26, vy + 2), (x1 - 26, vy + 2)], fill=(90, 115, 150, 255), width=1)

            # Panel Corner Rivets
            for rx in (x0 + 20, x1 - 20):
                for ry in (y0 + 20, y1 - 20):
                    draw_rivet(d_base, rx, ry, radius=5)

            # Sci-fi Tech Markings / Stencils
            d_base.rectangle([x0 + 24, y0 + 190, x0 + 80, y0 + 200], fill=(12, 16, 24, 255), outline=(50, 65, 90, 255))
            d_base.rectangle([x0 + 28, y0 + 193, x0 + 45, y0 + 197], fill=CYAN_DARK + (255,))
            d_base.rectangle([x0 + 50, y0 + 193, x0 + 58, y0 + 197], fill=YELLOW + (255,))

    # Alternating Glowing Seams
    def draw_seams(draw_obj, color):
        for row in range(4):
            for col in range(4):
                x0, y0 = col * panel_size, row * panel_size
                use_cyan = (row + col) % 2 == 0
                c = CYAN if use_cyan else MAGENTA
                if c == color:
                    draw_obj.line([(x0 + 16, y0 + 16), (x0 + 240, y0 + 16)], fill=color, width=4)
                    draw_obj.rectangle([x0 + 190, y0 + 190, x0 + 235, y0 + 205], outline=color, width=2)

    base = draw_glow_layer(base, draw_seams, CYAN, radius=10)
    base = draw_glow_layer(base, draw_seams, MAGENTA, radius=10)
    base = add_noise(base, 4, 19)
    save(base, "panel_wall.png")


# --- 3. Hazard Stripes: High-contrast yellow & charcoal diagonal bands ---
def generate_hazard_stripes():
    base = new_rgba(DARK_BG + (255,))
    d = ImageDraw.Draw(base)

    # Base diagonal stripes
    stripe_w = 64
    for i in range(-SIZE * 2, SIZE * 2, stripe_w * 2):
        poly = [
            (i, 0),
            (i + stripe_w, 0),
            (i + stripe_w + SIZE, SIZE),
            (i + SIZE, SIZE),
        ]
        d.polygon(poly, fill=YELLOW + (255,))

        dark_poly = [
            (i + stripe_w, 0),
            (i + stripe_w * 2, 0),
            (i + stripe_w * 2 + SIZE, SIZE),
            (i + stripe_w + SIZE, SIZE),
        ]
        d.polygon(dark_poly, fill=(18, 20, 28, 255))

    # Carbon fiber texture overlay onto dark stripes
    carbon = create_carbon_texture()
    base = Image.composite(carbon, base, carbon)

    # Surface Sheen Gradient & Scratches
    sheen = new_rgba()
    d_sheen = ImageDraw.Draw(sheen)
    for y in range(SIZE):
        alpha = int(30 * math.sin(y / SIZE * math.pi))
        d_sheen.line([(0, y), (SIZE, y)], fill=(255, 255, 255, alpha))

    # Industrial Frame Border
    d_sheen.rectangle([0, 0, SIZE - 1, SIZE - 1], outline=(12, 15, 22, 255), width=24)
    draw_bevel_box(d_sheen, [20, 20, SIZE - 20, SIZE - 20], (100, 120, 150, 220), (5, 8, 12, 255), width=6)

    # Corner Mounting Bolts
    for cx in (45, SIZE - 45):
        for cy in (45, SIZE - 45):
            draw_rivet(d_sheen, cx, cy, radius=12)

    base = Image.alpha_composite(base, sheen)
    base = add_noise(base, 8, 27)
    save(base, "hazard_stripes.png")


# --- 4. Climb Chevrons: High-visibility parkour directional markers ------
def generate_climb_chevrons():
    base = create_carbon_texture()
    d_base = ImageDraw.Draw(base)

    # Vertical Guide Tracks
    for x in (120, SIZE - 120):
        d_base.line([(x, 0), (x, SIZE)], fill=(30, 40, 58, 255), width=12)
        d_base.line([(x - 2, 0), (x - 2, SIZE)], fill=(70, 90, 120, 255), width=2)

    # Chevrons Drawing Function
    def draw_chevrons(draw_obj, color):
        for row in range(4):
            cy = 160 + row * 220
            cx = SIZE // 2

            # Double Arrowhead Geometry
            for offset in (0, 40):
                y = cy + offset
                points = [
                    (cx - 260, y + 100),
                    (cx, y - 80),
                    (cx + 260, y + 100),
                    (cx + 260, y + 140),
                    (cx, y - 40),
                    (cx - 260, y + 140),
                ]
                draw_obj.polygon(points, fill=color)

    # Multi-layered Glowing Chevrons
    base = draw_glow_layer(base, draw_chevrons, CYAN, radius=20, intensity=2.0)

    # Side Border Frame
    d_frame = ImageDraw.Draw(base)
    d_frame.rectangle([0, 0, SIZE - 1, SIZE - 1], outline=MAGENTA_DARK + (255,), width=16)

    def draw_frame_glow(draw_obj, color):
        draw_obj.rectangle([6, 6, SIZE - 7, SIZE - 7], outline=color, width=4)

    base = draw_glow_layer(base, draw_frame_glow, MAGENTA, radius=8)
    base = add_noise(base, 5, 33)
    save(base, "climb_chevrons.png")

    # Wall-run forward variant (90 degrees CCW rotation)
    forward = base.rotate(90)
    save(forward, "climb_chevrons_forward.png")


# --- 5. Floor Tiles: Heavy industrial tread plate deck --------------------
def generate_floor_tiles():
    base = new_rgba(DARK_BG + (255,))
    d = ImageDraw.Draw(base)

    tile_size = 256
    for y in range(0, SIZE, tile_size):
        for x in range(0, SIZE, tile_size):
            # Plate outline & bevel
            d.rectangle([x + 6, y + 6, x + tile_size - 6, y + tile_size - 6], fill=(26, 34, 48, 255), outline=(12, 16, 24, 255), width=3)
            draw_bevel_box(d, [x + 10, y + 10, x + tile_size - 10, y + tile_size - 10], (70, 90, 125, 255), (8, 12, 18, 255), width=3)

            # Diamond Tread Plate Pattern
            tread_step = 32
            for tx in range(x + 24, x + tile_size - 24, tread_step):
                for ty in range(y + 24, y + tile_size - 24, tread_step):
                    if ((tx // tread_step) + (ty // tread_step)) % 2 == 0:
                        d.line([(tx - 6, ty - 3), (tx + 6, ty + 3)], fill=(90, 112, 145, 255), width=3)
                        d.line([(tx - 6, ty - 4), (tx + 6, ty - 2)], fill=(150, 180, 220, 255), width=1)
                    else:
                        d.line([(tx - 3, ty + 6), (tx + 3, ty - 6)], fill=(90, 112, 145, 255), width=3)
                        d.line([(tx - 4, ty + 6), (tx - 2, ty - 6)], fill=(150, 180, 220, 255), width=1)

            # Corner Rivets
            for rx in (x + 22, x + tile_size - 22):
                for ry in (y + 22, y + tile_size - 22):
                    draw_rivet(d, rx, ry, radius=6)

            # Central recessed seam channel
            d.rectangle([x + 30, y + tile_size // 2 - 4, x + tile_size - 30, y + tile_size // 2 + 4], fill=(10, 14, 20, 255))
            d.line([(x + 30, y + tile_size // 2), (x + tile_size - 30, y + tile_size // 2)], fill=(45, 58, 80, 255), width=2)

    base = add_noise(base, 6, 41)
    save(base, "floor_tiles.png")


# --- 6. Rail Metal: Brushed steel with specular highlight and joints -----
def generate_rail_metal():
    base = new_rgba((35, 45, 62, 255))
    d = ImageDraw.Draw(base)

    # Anisotropic Brushed Metal Texture
    rnd = random.Random(57)
    for y in range(SIZE):
        shade = rnd.randint(-22, 22)
        c = max(0, min(255, 45 + shade))
        d.line([(0, y), (SIZE, y)], fill=(c, c + 10, c + 25, 255), width=1)

    # Cylindrical Curved Specular Highlight (Simulates 3D pipe curvature)
    highlight = new_rgba()
    d_hl = ImageDraw.Draw(highlight)
    for y in range(SIZE):
        # Sine curve lighting gradient across vertical axis
        intensity = int(70 * math.pow(math.sin(y / SIZE * math.pi), 2))
        d_hl.line([(0, y), (SIZE, y)], fill=(200, 230, 255, intensity))

    base = Image.alpha_composite(base, highlight)

    # Structural Joint Clamps spaced horizontally
    joint_step = 256
    for x in range(0, SIZE, joint_step):
        d.rectangle([x, 0, x + 24, SIZE], fill=(20, 26, 38, 255))
        draw_bevel_box(d, [x, 0, x + 24, SIZE], (90, 110, 145, 255), (10, 12, 18, 255), width=2)
        for ry in range(32, SIZE, 128):
            draw_rivet(d, x + 12, ry, radius=4)

    # Emissive Status Indicator Rings on Joints
    def draw_rings(draw_obj, color):
        for x in range(0, SIZE, joint_step):
            draw_obj.line([(x + 12, 0), (x + 12, SIZE)], fill=color, width=3)

    base = draw_glow_layer(base, draw_rings, CYAN, radius=8)
    save(base, "rail_metal.png")


# --- 7. Neon Strip: Vibrant volumetric light fixture ----------------------
def generate_neon_strip():
    base = new_rgba(DARK_BG + (255,))
    d = ImageDraw.Draw(base)

    # Outer Metallic Fixture Casing
    d.rectangle([0, 280, SIZE, 744], fill=(14, 18, 26, 255))
    draw_bevel_box(d, [0, 280, SIZE, 744], (80, 100, 135, 255), (5, 8, 12, 255), width=6)

    # Mounting brackets along fixture
    for x in range(64, SIZE, 256):
        d.rectangle([x, 260, x + 48, 764], fill=(30, 38, 52, 255))
        draw_bevel_box(d, [x, 260, x + 48, 764], (110, 135, 170, 255), (10, 14, 20, 255), width=3)
        draw_rivet(d, x + 24, 272, radius=5)
        draw_rivet(d, x + 24, 752, radius=5)

    # Inner Glass Diffuser Channel
    d.rectangle([0, 360, SIZE, 664], fill=(5, 8, 15, 255))

    # Intense Cyan Light Core Function
    def draw_light_bar(draw_obj, color):
        draw_obj.rectangle([0, 420, SIZE, 604], fill=color)

    base = draw_glow_layer(base, draw_light_bar, CYAN, radius=40, intensity=2.2)

    # Top/Bottom Fixture Glass Reflection Highlights
    d_ref = ImageDraw.Draw(base)
    d_ref.line([(0, 362), (SIZE, 362)], fill=(200, 245, 255, 220), width=2)
    d_ref.line([(0, 662), (SIZE, 662)], fill=(200, 245, 255, 120), width=2)

    save(base, "neon_strip.png")


# --- Execution -------------------------------------------------------------
if __name__ == "__main__":
    generate_floor_grid()
    generate_panel_wall()
    generate_hazard_stripes()
    generate_climb_chevrons()
    generate_floor_tiles()
    generate_rail_metal()
    generate_neon_strip()
    print("All textures successfully updated!")
