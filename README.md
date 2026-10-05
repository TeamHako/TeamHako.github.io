# TeamHako.github.io
## Photos to swap in

Placeholders show a dashed box with a label until the file exists. Drop in:

| File | What |
|---|---|
| `assets/images/hako-device.jpg` | Hero: the finished box (photo or render) |
| `assets/images/founder/engraving.jpg` | Close-up of the burned-in founder mark and number |
| `assets/images/process/joinery.jpg` | The joinery being cut or fitted |
| `assets/images/process/assembly-02.jpg` | Electronics inside (replace the old one) |

## Launch settings (top of `index.html`)

- `PREORDER_URL`: the Stripe Payment Link. Empty = "Pre-orders open spring 2027".
- `FOUNDER_SOLD`: units sold so far (drives "N of 25 left").
- `LINKS.discord`, `LINKS.twitter`: links are hidden while empty.
- Before going live: fill in the seller's legal name in `terms.html`.

## Panel images and translations

- `assets/demo/` (live demo frames) and `assets/images/panel/<lang>/` (still panel
  images in the cards and setup steps) are rendered from the device's own code. In the
  hako-device repo: `python3 deploy/build-web-demo.py <site>/assets/demo` and
  `python3 deploy/build-web-images.py <site>/assets/images/panel`.
- `ja/` and `de/` are generated: edit `index.html` and `tools/i18n.json`; a GitHub
  Action rebuilds them (or run `python3 tools/build-i18n.py`).
