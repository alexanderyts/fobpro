# Kingsgrove Sports: crime-thriller title sequence

**Watch:** [`kingsgrove-noir.mp4`](kingsgrove-noir.mp4) (1920×1080 with 2.39:1 letterbox, 24 fps, stereo AAC, 36 s)

A somber opening-credits sequence in the style of a prestige TV crime drama. Macro CG photography, slow moves, a teal-and-amber grade that leaves only the red of the ball saturated, film grain, and credits that treat the materials of cricket as the cast. It tells a small case: a wicket broken in the rain at night, and nobody saw the delivery.

## Sequence

| Time | Shot | Credit |
|---|---|---|
| 0.0–6.4 | Fade up on an extreme macro of a cricket ball. Stitch rows ride the raised seam, and the gold foil **KINGSGROVE SPORTS** stamp catches a raking amber light. | KINGSGROVE SPORTS PRESENTS |
| 6.0–11.6 | An English-willow bat leans against a concrete wall. Venetian-blind light slides across the grain as a car passes outside, and the camera rises to the shoulders and grip. | ENGLISH WILLOW |
| 11.0–17.4 | Stumps on a wet pitch under a single sodium streetlight in the rain. Something nobody sees hits the wicket, and the bails fly off in slow motion. | RED LEATHER |
| 16.8–22.8 | Evidence markers on wet asphalt: **1** by the ball, **2** by a bail, and **3** by a chalk outline of a bat. A torch beam searches the ground, red and blue lights flicker from a car we never see, and police tape reads **BOUNDARY — DO NOT CROSS**. | CORK AND TWINE |
| 22.2–27.8 | A scorebook under a desk lamp reads *T. Moss, bowled, ???, 0*. A red pen circles the duck. Margin notes: *no one saw the delivery* and *bails found 6 m behind the stumps*. | *and* NACK |
| 27.2–31.8 | An empty ground at night. The floodlight towers clunk on one by one in the fog. | FIFTY YEARS ON THE CASE |
| 31.2–36.0 | The ball turns slowly in darkness, then the title card: **KINGSGROVE / SPORTS**. *Every innings leaves evidence.* Then kingsgrovesports.com.au. | |

**Sound (all synthesised):**
- A low D-minor drone, a sparse reverb-soaked piano motif and a heartbeat pulse.
- Rain on the pitch, then a slowed-down wooden crack and a sub drop when the wicket goes, followed by near-silence.
- A far-off siren under the evidence, pen scratch on the scorebook, and heavy relay clunks with mains hum as each floodlight comes on.
- A deep "braam" and a low piano chord under the title.

## Before it goes out

- **The logo is a placeholder.** The title card, the ball's gold stamp and the bat sticker set KINGSGROVE in type; none of it is the official Kingsgrove Sports logo. Swap the real artwork in if you have it.
- **"Fifty years on the case"** leans on the "more than 50 years" claim on the Kingsgrove Sports website. Confirm it before running the ad.
- **Everything else is fictional.** The scorebook names are invented.

## How it's made

- `src/shots.js` builds the six three.js shots and the title plate. Every model and texture is procedural: the ball, stitches, gold stamp, willow grain, grip, stumps and bails, pitch and creases, wet asphalt, evidence markers, tape, chalk outline and scorebook are all drawn in code (`src/tex.js`).
- `src/main.js` is the film pipeline. It renders each shot into an HDR target, applies depth of field (a scatter-as-gather bokeh with raycast autofocus), dissolves between shots, adds bloom, then grades: filmic tone map, desaturated except for true reds, cool shadows, warm highlights, vignette, grain and gate weave.
- `index.html` holds the credits (DOM text over the canvas) and the letterbox.
- `render.cjs` drives headless Chromium (WebGL via SwiftShader) frame by frame and pipes the frames to ffmpeg. `score.py` synthesises the music from the cue times in `events.json`.

## Rebuilding

Requires Node, Playwright (Chromium), Python 3 with numpy and scipy, and an ffmpeg with libx264 (for example `pip install imageio-ffmpeg`).

```bash
cd kingsgrove-noir
npm install && npm run build            # bundles src/ into dist/noir.js
export FFMPEG=ffmpeg                    # or the imageio-ffmpeg binary
node render.cjs --stills 3,15.4,25.8    # quick checks in stills/
node render.cjs                         # full render -> video-only.mp4 + events.json (slow on CPU: ~4 s/frame)
python3 score.py                        # -> score.wav
$FFMPEG -i video-only.mp4 -i score.wav -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart kingsgrove-noir.mp4
```

To split the render across processes, use `node render.cjs --range 0,18 --out parts/a.mp4` and `--range 18,36 --out parts/b.mp4`, then join the parts with ffmpeg's concat demuxer.
