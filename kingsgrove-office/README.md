# Kingsgrove Sports: mockumentary sitcom opening

**Watch:** [`kingsgrove-office.mp4`](kingsgrove-office.mp4) (1920×1080, 30 fps, stereo AAC, 28 s)

An opening-credits sequence in the style of a workplace mockumentary sitcom, set in the illustrated Kingsgrove Sports world from the first ad. It uses handheld documentary camerawork, snap zooms, autofocus hunting, a flat fluorescent grade, deadpan looks to camera and plain white name credits. It ends on a typewriter title card.

The music is an original bouncy piano theme written for this piece, not any show's actual theme. No show logos or footage are used.

## Sequence

| Time | Shot | Credit |
|---|---|---|
| 0.0–3.0 | From a car window: past a café and a newsagency, a **Welcome to KINGSGROVE** sign, a chemist and a bakery, then the Kingsgrove Sports storefront. | |
| 3.0–5.0 | Nack types at the desk, glances up at the camera, and the camera snap-zooms in. | Nack |
| 5.0–6.5 | A mallet knocks in a new bat: tok, tok, tok, tok. | The Knocking-In Mallet |
| 6.5–8.0 | A hand takes one ball from the bottom of the "NEW BALLS PLEASE" pyramid. It collapses. | |
| 8.0–10.5 | Dave, grinning under his mustache, holds a bat upside down at the counter. Nack slowly turns to the camera. Snap zoom. | Dave |
| 10.5–12.0 | EFTPOS: APPROVED. The receipt keeps printing and the camera has to tilt up to follow it. | |
| 12.0–14.0 | A pan across the bat wall, where one bat is still gently spinning on its hook. | The Bat Wall |
| 14.0–15.5 | A mannequin head in a cricket helmet. Deadpan snap zoom. | Helmet Guy |
| 15.5–17.0 | The chat window reads "99+ waiting" while one more mug goes onto the tower, which wobbles. | |
| 17.0–19.0 | A walking stack of boxes (PADS, GLOVES, BALLS ×48, HELMETS, THIGH GUARDS) crosses the aisle on a pair of legs. | Someone from the Stockroom |
| 19.0–21.5 | Priya's message: "Just wanted to say thanks for all your hard work. You're a legend." Cut to Nack beaming at the camera. | Priya |
| 21.5–24.0 | The store at dusk. The sign flickers on and a car passes. | |
| 24.0–28.0 | Title card: **kingsgrove sports**, then kingsgrovesports.com.au. | |

## Before it goes out

- **The storefront, sign and characters are illustrations**, not the real store or staff.
- **The logo is a placeholder.** The name is set in type, not the official Kingsgrove Sports logo.
- **Swap in the real crew:** credit names live in the `credit:` entries in `index.html`, so replacing them with real staff is a one-line change per shot.

## Files and rebuilding

- `index.html` is the whole animation. `OFFICE.renderAt(t)` draws the frame at time t, and the character rig (`person()` and `pose()`) is shared by Nack and Dave.
- `render.cjs` captures frames with Playwright and encodes them with ffmpeg. It also writes `events.json`, the sound-effect cues.
- `theme.py` synthesises the theme, plus the mallet, ball clatter, EFTPOS beep, printer, clink, sign buzz and car pass.

```bash
cd kingsgrove-office
export FFMPEG=ffmpeg                  # needs libx264
node render.cjs                       # -> video-only.mp4 + events.json
python3 theme.py                      # -> theme.wav
$FFMPEG -i video-only.mp4 -i theme.wav -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart kingsgrove-office.mp4
node render.cjs --stills 4,9.6,16.3   # quick checks in stills/
```
