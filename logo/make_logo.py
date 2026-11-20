#!/usr/bin/env python3
"""Generate the Velocity logo assets.

Outputs live next to this script in `logo/`:
  logo.svg / logo.png                 wide logo, dark mark panel
  logo-transparent.svg / .png         wide logo, no background
  logo-mark.svg / logo-mark.png       compact mark, dark panel
  logo-mark-transparent.svg / .png    compact mark, no background
  favicon.png                         compact mark at 64px

The wordmark is converted from Monochrome Aviation into SVG outlines so the
SVG does not depend on the viewer having the font installed. The PNGs are
rendered with the same font through PIL.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont


OUT_DIR = Path(__file__).resolve().parent

FONT_DIR = Path.home() / ".local/share/fonts/monochrome-aviation"
FONT_MEDIUM = FONT_DIR / "monochrome-aviation-medium.ttf"
FONT_REGULAR = FONT_DIR / "monochrome-aviation.ttf"
FALLBACK_FONT = Path("/usr/share/fonts/TTF/JetBrainsMono-Bold.ttf")

BG = "#07080A"
PANEL = "#0B0E14"
PANEL_EDGE = "#1B2430"
FG = "#F0F4F8"
RED = "#FF2A3C"
CYAN = "#00F0FF"

MARK_BOX = 512
WIDE_W = 960
WIDE_H = 256
SCALE = 4


def font_path(preferred: Path) -> Path:
    return preferred if preferred.exists() else FALLBACK_FONT


def text_outlines(text: str, path: Path, size: float, tracking: float, color: str):
    """Return (svg_group, bbox_width, bbox_height) for outlined text."""
    font = TTFont(path)
    upem = font["head"].unitsPerEm
    glyph_set = font.getGlyphSet()
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]

    scale = size / upem
    tracking_units = tracking / scale
    x = 0.0
    pieces = []
    x_min = y_min = float("inf")
    x_max = y_max = float("-inf")

    for char in text:
        glyph_name = cmap.get(ord(char))
        if glyph_name is None:
            x += size * 0.5 + tracking_units
            continue

        glyph = glyph_set[glyph_name]
        pen = SVGPathPen(glyph_set)
        glyph.draw(pen)
        commands = pen.getCommands()
        if commands:
            pieces.append(
                f'<g transform="translate({x:.2f} 0) scale({scale:.6f} {-scale:.6f})">'
                f'<path d="{commands}" fill="{color}"/>'
                f'</g>'
            )
            bounds = BoundsPen(glyph_set)
            glyph.draw(bounds)
            if bounds.bounds:
                gx0, gy0, gx1, gy1 = bounds.bounds
                x_min = min(x_min, x + gx0)
                y_min = min(y_min, gy0)
                x_max = max(x_max, x + gx1)
                y_max = max(y_max, gy1)

        x += hmtx[glyph_name][0] + tracking_units

    if x_min == float("inf"):
        return "", 0.0, 0.0

    group = (
        f'<g transform="translate({-x_min * scale:.2f} {y_max * scale:.2f})">'
        f'{"".join(pieces)}</g>'
    )
    return group, (x_max - x_min) * scale, (y_max - y_min) * scale


def mark_svg(background: bool) -> str:
    """Arc + V only, in a 512x512 box. Optional dark chamfer panel."""
    panel = ""
    if background:
        panel = f'''
  <path d="M64 0H448L512 64V448L448 512H64L0 448V64Z"
        fill="{PANEL}" stroke="{PANEL_EDGE}" stroke-width="4"/>'''

    return f'''{panel}
  <path d="M107.5 198.0 A158 158 0 0 1 392.8 173.0"
        fill="none" stroke="{CYAN}" stroke-width="9" stroke-linecap="round"/>
  <path d="M140 148L249 356" stroke="{RED}" stroke-width="34"
        stroke-linecap="square" stroke-linejoin="miter"/>
  <path d="M249 356L372 130" stroke="{CYAN}" stroke-width="34"
        stroke-linecap="square" stroke-linejoin="miter"/>'''


def wide_svg(background: bool) -> str:
    word, _, _ = text_outlines("VELOCITY", font_path(FONT_MEDIUM), 78, 7, FG)
    tag, _, _ = text_outlines("MOVEMENT SANDBOX", font_path(FONT_REGULAR), 21, 5, CYAN)
    mark_scale = 0.40625
    mark_x = 8
    mark_y = 24
    card = f'<rect x="0" y="0" width="{WIDE_W}" height="{WIDE_H}" fill="{BG}"/>' if background else ""

    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDE_W} {WIDE_H}" width="{WIDE_W}" height="{WIDE_H}">
  <title>Velocity — Movement Sandbox</title>{card}
  <g transform="translate({mark_x} {mark_y}) scale({mark_scale})">{mark_svg(background)}</g>
  <path d="M218 65V174" stroke="{RED}" stroke-width="4" stroke-linecap="square"/>
  <g transform="translate(239 66)">{word}</g>
  <g transform="translate(241 158)">{tag}</g>
</svg>
'''


def mark_only_svg(background: bool) -> str:
    suffix = "" if background else " transparent"
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {MARK_BOX} {MARK_BOX}" width="{MARK_BOX}" height="{MARK_BOX}">
  <title>Velocity mark{suffix}</title>{mark_svg(background)}
</svg>
'''


def draw_mark(draw: ImageDraw.ImageDraw, x: float, y: float, size: float, background: bool) -> None:
    s = size / MARK_BOX

    def pt(px: float, py: float):
        return (x + px * s, y + py * s)

    if background:
        outline = [
            pt(64, 2), pt(448, 2), pt(510, 64), pt(510, 448),
            pt(448, 510), pt(64, 510), pt(2, 448), pt(2, 64),
        ]
        fill = [
            pt(64, 0), pt(448, 0), pt(512, 64), pt(512, 448),
            pt(448, 512), pt(64, 512), pt(0, 448), pt(0, 64),
        ]
        draw.polygon(fill, fill=PANEL)
        draw.line(outline + [outline[0]], fill=PANEL_EDGE,
                  width=max(1, int(4 * s)), joint="curve")

    draw.arc([pt(98, 94), pt(414, 410)], start=200, end=330,
             fill=CYAN, width=max(1, int(9 * s)))

    leg_width = max(1, int(34 * s))
    draw.line([pt(140, 148), pt(249, 356)], fill=RED, width=leg_width, joint="curve")
    draw.line([pt(249, 356), pt(372, 130)], fill=CYAN, width=leg_width, joint="curve")


def draw_tracked(
    draw: ImageDraw.ImageDraw,
    text: str,
    font: ImageFont.FreeTypeFont,
    x: float,
    y: float,
    tracking: float,
    fill: str,
) -> None:
    cursor = x
    for char in text:
        box = draw.textbbox((0, 0), char, font=font)
        draw.text((cursor - box[0], y - box[1]), char, font=font, fill=fill)
        cursor += draw.textlength(char, font=font) + tracking


def wide_png(background: bool) -> Image.Image:
    img = Image.new("RGBA", (WIDE_W * SCALE, WIDE_H * SCALE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    if background:
        draw.rectangle((0, 0, WIDE_W * SCALE, WIDE_H * SCALE), fill=BG)

    draw_mark(draw, 8 * SCALE, 24 * SCALE, 208 * SCALE, background)
    draw.line([(218 * SCALE, 65 * SCALE), (218 * SCALE, 174 * SCALE)],
              fill=RED, width=4 * SCALE)

    word_font = ImageFont.truetype(str(font_path(FONT_MEDIUM)), 78 * SCALE)
    tag_font = ImageFont.truetype(str(font_path(FONT_REGULAR)), 21 * SCALE)
    draw_tracked(draw, "VELOCITY", word_font, 239 * SCALE, 66 * SCALE, 7 * SCALE, FG)
    draw_tracked(draw, "MOVEMENT SANDBOX", tag_font, 241 * SCALE, 158 * SCALE, 5 * SCALE, CYAN)

    return img.resize((WIDE_W, WIDE_H), Image.Resampling.LANCZOS)


def mark_png(background: bool) -> Image.Image:
    img = Image.new("RGBA", (MARK_BOX * SCALE, MARK_BOX * SCALE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw_mark(draw, 0, 0, MARK_BOX * SCALE, background)
    return img.resize((MARK_BOX, MARK_BOX), Image.Resampling.LANCZOS)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    (OUT_DIR / "logo.svg").write_text(wide_svg(background=True), encoding="utf-8")
    (OUT_DIR / "logo-transparent.svg").write_text(wide_svg(background=False), encoding="utf-8")
    (OUT_DIR / "logo-mark.svg").write_text(mark_only_svg(background=True), encoding="utf-8")
    (OUT_DIR / "logo-mark-transparent.svg").write_text(mark_only_svg(background=False), encoding="utf-8")

    wide_png(background=True).save(OUT_DIR / "logo.png")
    wide_png(background=False).save(OUT_DIR / "logo-transparent.png")
    mark = mark_png(background=True)
    mark.save(OUT_DIR / "logo-mark.png")
    mark_png(background=False).save(OUT_DIR / "logo-mark-transparent.png")
    mark.resize((64, 64), Image.Resampling.LANCZOS).save(OUT_DIR / "favicon.png")

    print(f"Wrote logo assets to {OUT_DIR}")


if __name__ == "__main__":
    main()
