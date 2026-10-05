#!/usr/bin/env python3
"""
make-og-image.py — the preview image shown when hakoshop.com is shared
(Twitter/X, Discord, iMessage, YouTube descriptions...).

Draws a real panel frame from assets/demo/ (rendered by the device's code) as
LEDs in a wooden box, next to the headline. Needs Pillow and the site's fonts
(Shippori Mincho, IBM Plex Sans; both SIL OFL, from github.com/google/fonts).

    python3 tools/make-og-image.py --fonts /path/to/fonts [--lang en|ja|de]

Writes assets/images/og[-lang].png (1200x630).
"""
import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

SITE = Path(__file__).resolve().parent.parent
W, H = 1200, 630
BG = (247, 244, 237)
INK = (28, 24, 20)
MUTED = (132, 124, 110)
ACCENT = (188, 0, 45)

TEXT = {
    "en": {"eyebrow": "AN AMBIENT ANKI COMPANION",
           "title": ["A small wooden box", "that knows how your", "studies are going."],
           "foot": "Founder Edition · 25 numbered units · spring 2027"},
    "ja": {"eyebrow": "ANKIのための、静かな相棒",
           "title": ["勉強の様子を", "そっと見守る", "小さな木の箱。"],
           "foot": "創業者エディション・限定25台・2027年春"},
    "de": {"eyebrow": "EIN STILLER BEGLEITER FÜR ANKI",
           "title": ["Eine kleine Holzbox,", "die weiß, wie es", "mit dem Lernen läuft."],
           "foot": "Founder Edition · 25 nummerierte Stück · Frühjahr 2027"},
}


def panel_frame(lang: str, remaining: int = 0) -> Image.Image:
    data = json.loads((SITE / "assets/demo/demo.json").read_text(encoding="utf-8"))
    m = data["panels"][lang]
    sheet = Image.open(SITE / "assets/demo" / m["sheet"]).convert("RGB")
    cols = m["cols"]

    def crop(i, y0=0, y1=64):
        x, y = (i % cols) * 64, (i // cols) * 64
        return sheet.crop((x, y + y0, x + 64, y + y1))

    pet = m["pet"]
    frame = crop(pet["anim"][pet["mood"][remaining]][0])
    y0, y1 = m["countRows"]
    frame.paste(crop(pet["count"][remaining], y0, y1), (0, y0))
    return frame


def led_panel(frame: Image.Image, size: int) -> Image.Image:
    pitch = size / 64
    r = pitch * 0.4
    dots = Image.new("RGB", (size, size), (10, 9, 8))
    d = ImageDraw.Draw(dots)
    px = frame.load()
    for y in range(64):
        for x in range(64):
            cx, cy = (x + 0.5) * pitch, (y + 0.5) * pitch
            c = px[x, y]
            if sum(c) < 24:
                d.ellipse((cx - pitch * 0.34, cy - pitch * 0.34, cx + pitch * 0.34, cy + pitch * 0.34),
                          fill=(27, 25, 21))
            else:
                d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=c)
    glow = frame.resize((size, size), Image.BILINEAR).filter(ImageFilter.GaussianBlur(pitch * 2.2))
    return _screen(dots, glow, 0.55)


def _screen(base: Image.Image, top: Image.Image, amount: float) -> Image.Image:
    # "screen" blend: 1 - (1-a)(1-b), applied at `amount` strength
    a = base.load()
    b = top.load()
    out = base.copy()
    o = out.load()
    for y in range(base.height):
        for x in range(base.width):
            pa, pb = a[x, y], b[x, y]
            o[x, y] = tuple(int(ca + (255 - (255 - ca) * (255 - cb) / 255 - ca) * amount)
                            for ca, cb in zip(pa, pb))
    return out


def wooden_box(panel: Image.Image) -> Image.Image:
    pad = int(panel.width * 0.1)
    size = panel.width + 2 * pad
    box = Image.new("RGBA", (size + 80, size + 80), (0, 0, 0, 0))
    # soft shadow
    shadow = Image.new("RGBA", box.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((40, 58, 40 + size, 58 + size), 22, fill=(28, 24, 20, 90))
    box.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(22)))
    # wood: vertical gradient plus fine grain lines
    wood = Image.new("RGB", (size, size))
    wd = ImageDraw.Draw(wood)
    for y in range(size):
        t = y / size
        c = tuple(int(a + (b - a) * t) for a, b in zip((138, 90, 54), (90, 55, 31)))
        wd.line((0, y, size, y), fill=c)
    grain = Image.new("L", (size, size), 0)
    gd = ImageDraw.Draw(grain)
    for x in range(-size, size, 9):
        gd.line((x, 0, x + size // 10, size), fill=255, width=1)
    darker = Image.eval(wood, lambda v: int(v * 0.86))
    wood = Image.composite(darker, wood, grain.filter(ImageFilter.GaussianBlur(0.8)))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), 20, fill=255)
    box.paste(wood, (40, 40), mask)
    box.paste(panel, (40 + pad, 40 + pad))
    # knob
    kd = ImageDraw.Draw(box)
    kx, ky, kr = 40 + size, 40 + size // 2, 26
    kd.ellipse((kx - kr, ky - kr, kx + kr, ky + kr), fill=(52, 50, 46))
    kd.ellipse((kx - kr + 5, ky - kr + 4, kx + 6, ky + 2), fill=(78, 75, 70))
    kd.rounded_rectangle((kx - 2, ky - kr + 6, kx + 2, ky - kr + 18), 2, fill=(233, 227, 214))
    return box


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fonts", required=True, type=Path)
    ap.add_argument("--lang", default="en", choices=sorted(TEXT))
    args = ap.parse_args()
    t = TEXT[args.lang]
    serif = ImageFont.truetype(str(args.fonts / "ShipporiMincho-Bold.ttf"), 58)
    mark = ImageFont.truetype(str(args.fonts / "ShipporiMincho-Bold.ttf"), 44)
    watermark = ImageFont.truetype(str(args.fonts / "ShipporiMincho-Regular.ttf"), 620)
    # IBM Plex Sans has no Japanese; use the Mincho for small Japanese text
    small = "ShipporiMincho-Regular.ttf" if args.lang == "ja" else "IBMPlexSans.ttf"
    sans = ImageFont.truetype(str(args.fonts / small), 20)
    try:
        sans.set_variation_by_axes([100, 500])  # IBM Plex Sans: width 100, weight 500
    except (OSError, AttributeError):
        pass
    word = ImageFont.truetype(str(args.fonts / "ShipporiMincho-Bold.ttf"), 34)

    img = Image.new("RGBA", (W, H), BG + (255,))
    d = ImageDraw.Draw(img)
    d.text((W - 40, H // 2 + 20), "箱", font=watermark, fill=(239, 234, 224), anchor="rm")

    x = 72
    d.text((x, 92), t["eyebrow"], font=sans, fill=ACCENT, spacing=4)
    y = 140
    for line in t["title"]:
        d.text((x, y), line, font=serif, fill=INK)
        y += 74
    d.text((x, 470), "箱", font=mark, fill=ACCENT)
    d.text((x + 58, 478), "hako", font=word, fill=INK)
    d.text((x, 540), t["foot"], font=sans, fill=MUTED)
    url_font = ImageFont.truetype(str(args.fonts / "IBMPlexSans.ttf"), 20)
    d.text((x, 570), "hakoshop.com", font=url_font, fill=INK)

    box = wooden_box(led_panel(panel_frame(args.lang), 320))
    img.alpha_composite(box, (W - box.width - 46, (H - box.height) // 2 + 8))

    out = SITE / "assets/images" / ("og.png" if args.lang == "en" else f"og-{args.lang}.png")
    img.convert("RGB").save(out, optimize=True)
    print(f"wrote {out.relative_to(SITE)}")


if __name__ == "__main__":
    main()
