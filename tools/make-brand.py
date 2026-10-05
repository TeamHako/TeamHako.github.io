#!/usr/bin/env python3
"""
make-brand.py — hako logo images (Discord server icon, banner, invite
background, and anything else that needs the mark).

    python3 tools/make-brand.py --fonts /path/to/fonts

Needs Pillow and the site fonts (Shippori Mincho, IBM Plex Sans; SIL OFL).
Writes assets/brand/*.png.
"""
import argparse
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

SITE = Path(__file__).resolve().parent.parent
OUT = SITE / "assets/brand"
WASHI = (247, 244, 237)
WATERMARK = (239, 234, 224)
INK = (28, 24, 20)
MUTED = (132, 124, 110)
ACCENT = (188, 0, 45)
LED_ON = (255, 72, 92)
LED_OFF = (30, 27, 23)
SCREEN = (10, 9, 8)


# 箱 drawn by hand for the LED grid (bamboo radical, 木, 目): cleaner than
# rasterising a brush font at this size.
GLYPH = """
....#..........#.......
...#..........#........
..#########..########..
.#....#.....#.....#....
#......#...#.......#...
.......................
....#..................
....#.....###########..
#########.#.........#..
....#.....#.........#..
...###....#.........#..
..#.#.#...###########..
..#.#.#...#.........#..
.#..#..#..#.........#..
#...#...#.#.........#..
....#.....###########..
....#.....#.........#..
....#.....#.........#..
....#.....#.........#..
....#.....###########..
....#..................
.......................
.......................
"""


def glyph_grid(n: int = 25) -> list[list[bool]]:
    """GLYPH centred on an n×n grid."""
    rows = [r for r in GLYPH.strip("\n").split("\n")]
    cells = [(x, y) for y, r in enumerate(rows) for x, c in enumerate(r) if c == "#"]
    x0, x1 = min(x for x, _ in cells), max(x for x, _ in cells)
    y0, y1 = min(y for _, y in cells), max(y for _, y in cells)
    ox = (n - (x1 - x0 + 1)) // 2 - x0
    oy = (n - (y1 - y0 + 1)) // 2 - y0
    grid = [[False] * n for _ in range(n)]
    for x, y in cells:
        grid[y + oy][x + ox] = True
    return grid


def wood(size: tuple[int, int], radius: int) -> Image.Image:
    w, h = size
    img = Image.new("RGB", size)
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / h
        d.line((0, y, w, y), fill=tuple(int(a + (b - a) * t) for a, b in zip((138, 90, 54), (90, 55, 31))))
    grain = Image.new("L", size, 0)
    g = ImageDraw.Draw(grain)
    for x in range(-h, w, max(6, w // 60)):
        g.line((x, 0, x + h // 10, h), fill=255, width=1)
    img = Image.composite(Image.eval(img, lambda v: int(v * 0.87)), img, grain.filter(ImageFilter.GaussianBlur(0.8)))
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), radius, fill=255)
    out = Image.new("RGBA", size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def led_screen(grid: list[list[bool]], size: int, color=LED_ON) -> Image.Image:
    n = len(grid)
    pad = size * 0.08
    pitch = (size - 2 * pad) / n
    img = Image.new("RGB", (size, size), SCREEN)
    lit = Image.new("RGB", (size, size), (0, 0, 0))
    d, dl = ImageDraw.Draw(img), ImageDraw.Draw(lit)
    for y in range(n):
        for x in range(n):
            cx, cy = pad + (x + 0.5) * pitch, pad + (y + 0.5) * pitch
            if grid[y][x]:
                r = pitch * 0.42
                d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color)
                dl.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color)
            else:
                r = pitch * 0.34
                d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=LED_OFF)
    glow = Image.eval(lit.filter(ImageFilter.GaussianBlur(pitch * 0.9)), lambda v: int(v * 0.7))
    return ImageChops.screen(img, glow)


def led_box(grid, size: int) -> Image.Image:
    """The LED 箱 in a wooden frame, like the device."""
    box = wood((size, size), int(size * 0.12))
    inner = int(size * 0.76)
    screen = led_screen(grid, inner)
    mask = Image.new("L", (inner, inner), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, inner - 1, inner - 1), int(size * 0.03), fill=255)
    off = (size - inner) // 2
    box.paste(screen, (off, off), mask)
    return box


def icon_led(grid) -> Image.Image:
    # Discord crops icons to a circle: wood fills the square, the screen sits inside the circle
    img = wood((512, 512), 0).convert("RGB")
    inner = 330
    screen = led_screen(grid, inner)
    mask = Image.new("L", (inner, inner), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, inner - 1, inner - 1), 18, fill=255)
    img.paste(screen, ((512 - inner) // 2, (512 - inner) // 2), mask)
    return img


def icon_mincho(fonts: Path) -> Image.Image:
    img = Image.new("RGB", (512, 512), WASHI)
    f = ImageFont.truetype(str(fonts / "ShipporiMincho-Bold.ttf"), 300)
    ImageDraw.Draw(img).text((256, 262), "箱", font=f, fill=ACCENT, anchor="mm")
    return img


def banner(grid, fonts: Path, w: int, h: int) -> Image.Image:
    img = Image.new("RGBA", (w, h), WASHI + (255,))
    d = ImageDraw.Draw(img)
    wm = ImageFont.truetype(str(fonts / "ShipporiMincho-Regular.ttf"), int(h * 1.15))
    d.text((w * 0.86, h * 0.52), "箱", font=wm, fill=WATERMARK, anchor="mm")
    s = int(h * 0.56)
    box = led_box(grid, s)
    shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    bx, by = int(w * 0.5 - s * 1.05), (h - s) // 2
    ImageDraw.Draw(shadow).rounded_rectangle((bx, by + s * 0.05, bx + s, by + s * 1.05), int(s * 0.12),
                                             fill=(28, 24, 20, 70))
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(s * 0.06)))
    img.alpha_composite(box, (bx, by))
    tx = int(w * 0.5 + s * 0.05)
    word = ImageFont.truetype(str(fonts / "ShipporiMincho-Bold.ttf"), int(h * 0.19))
    tag = ImageFont.truetype(str(fonts / "IBMPlexSans.ttf"), int(h * 0.05))
    try:
        tag.set_variation_by_axes([100, 500])
    except (OSError, AttributeError):
        pass
    d.text((tx, h * 0.5), "hako", font=word, fill=INK, anchor="ls")
    d.text((tx + 4, h * 0.5 + h * 0.09), "an ambient Anki companion", font=tag, fill=ACCENT, anchor="ls")
    d.text((tx + 4, h * 0.5 + h * 0.17), "hakoshop.com", font=tag, fill=MUTED, anchor="ls")
    return img.convert("RGB")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fonts", required=True, type=Path)
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    grid = glyph_grid()
    outputs = {
        "icon-led.png": icon_led(grid),
        "icon-mincho.png": icon_mincho(args.fonts),
        "banner-960x540.png": banner(grid, args.fonts, 960, 540),
        "invite-1920x1080.png": banner(grid, args.fonts, 1920, 1080),
        "led-box-1024.png": led_box(grid, 1024),
    }
    for name, img in outputs.items():
        img.save(OUT / name, optimize=True)
        print(f"wrote assets/brand/{name}")


if __name__ == "__main__":
    main()
