# Threshold — listing video post-production

A web app for real estate photographers and videographers. Upload the raw clips from a property shoot and it produces finished, delivery-ready videos: sequenced, trimmed, colour-corrected, cut to music, titled and exported in every format the agent needs.

> "Threshold" is a working name — change it in `web/index.html` and the `<title>` strings in `web/app.js`.

## What it automates

| Step | What happens | How |
|---|---|---|
| Ingest | Reads any camera file: iPhone HEVC/HDR, mirrorless 10-bit, DJI drone, ProRes. Builds browser-playable proxies. | `ffprobe`, H.264 proxies |
| Tour order | Sorts clips the way listing tours are cut: aerial → exterior → entry → living → kitchen → … → outdoor → closing aerial. | Room labels (automatic with Claude vision, or from drone metadata / file names, or set by hand) |
| Trim | Removes the shaky start and stop of each gimbal shot; picks the steadiest stretch for the edit. | Camera-motion analysis (libvidstab), jerk detection |
| Colour | Neutral white balance (white ceilings/trim as reference), exposure lift for dark rooms, levels, soft highlight roll-off, vibrance. Before/after compare per clip. | Measured per clip, clamped, applied as FFmpeg filters |
| HDR | iPhone/drone HLG and PQ footage is tone-mapped to standard Rec.709 SDR. | `zscale` + `tonemap` |
| Slow motion | 50/60/120 fps clips play slowed at the delivery frame rate. | Retiming |
| Stabilise | Optional, per clip or project-wide. | Two-pass libvidstab |
| Pacing & music | Shot lengths fit a target runtime; cut points land on the music's beat; music is levelled to −16 LUFS with fades. | Beat tracking (spectral flux + autocorrelation), loudnorm |
| Titles | Opening address/price title and a closing agent card (name, brokerage, phone, logo). | Rendered with FFmpeg `drawtext` (IBM Plex / Cormorant fonts bundled) |
| Delivery | In one pass: branded 16:9 film, **MLS-unbranded** 16:9 tour, 9:16 reel, 1:1 and 4:5 feed posts. HD or 4K, 24/25/30 fps, H.264 High, faststart. | Shared, cached intermediates |

Three edit styles: **Walkthrough** (measured, dissolves), **Signature** (slower, serif titles, luxury) and **Social cut** (quick beat-matched cuts).

## Two editions

- **Browser edition** — `artifact/threshold.html`. A single page that runs entirely in the browser (Chrome, Edge or Safari): footage is decoded, graded and encoded on the user's own computer with WebCodecs and WebGL, via [Mediabunny](https://mediabunny.dev). Nothing is uploaded. Published as a Claude artifact, where it saves finished films through Claude's download prompt and can label rooms with Claude. Also accepts listing photos (slow push/pan). Exports H.264 MP4; audio is AAC where the browser can encode it (Chrome/Edge on Mac and Windows, Safari), otherwise Opus.
- **Studio server** — `server/` + `web/`. A Node app with FFmpeg for a studio machine or hosted service: adds stabilisation, HDR tone-mapping, true loudness normalisation, project history and a render queue.

## Run it

Requirements: Node.js 20+ and FFmpeg 5.1+ built with libvidstab, zimg and freetype (the Ubuntu/Debian `ffmpeg` package and Homebrew `ffmpeg` both qualify).

```bash
cd listing-studio
npm install
npm start            # http://127.0.0.1:4310
```

Or with Docker (FFmpeg included):

```bash
docker build -t threshold .
docker run -p 4310:4310 -v threshold-data:/data threshold
```

Automatic room labelling is optional. Set `ANTHROPIC_API_KEY` to turn it on; it also flags reshoot issues (operator visible in a mirror, toilet seat up, lights off). Without it, drones are detected from metadata, rooms are guessed from file names, and you choose the rest from a dropdown.

### Configuration

| Variable | Default | |
|---|---|---|
| `PORT` / `HOST` | `4310` / `127.0.0.1` | Set `HOST=0.0.0.0` to serve on your network. |
| `DATA_DIR` | `./data` | Uploads, analysis, renders and the database. |
| `FFMPEG_PATH`, `FFPROBE_PATH` | on `PATH` | |
| `ANALYSIS_CONCURRENCY` | `2` | Clips analysed in parallel. Renders run one at a time. |
| `RENDER_PRESET` | `medium` | x264 preset for final encodes (`fast` for quicker turnarounds). |
| `ANTHROPIC_API_KEY` | — | Enables automatic room labels. `CLASSIFY=off` disables it. |
| `MAX_UPLOAD_MB` | `8192` | Per-file upload limit. |

## Tested on real footage

Besides the synthetic tests, both editions were run on a real professionally shot house tour (16 clips) plus a 60 fps vertical drone clip and exterior photos from Pexels — see `test/REAL_MEDIA.md` and `node test/fetch-real-media.js`. Findings that changed the engine: walking-forward shots are now recognised as camera moves (not "locked off"), and white balance blends in a whole-frame reference so tungsten-lit rooms are neutralised instead of made more yellow.

## Tests

```bash
npm test
```

Generates synthetic footage with known problems (shaky starts, colour casts, under-exposure, 60 fps, a vertical phone clip, a drone clip, a 120 BPM track), then checks analysis results, tour order, beat-aligned cuts, grade maths and a full render. `npm run fixtures` writes the same sample footage to `data/fixtures` to try in the UI.

## Layout

```
server/
  index.js        HTTP API, uploads, live updates (SSE), static files
  jobs.js         analysis queue (parallel) and render queue (serial)
  store.js        JSON-file persistence
  classify.js     room labelling (Claude vision, optional) + offline heuristics
  media/
    probe.js      metadata (rotation, HDR, frame rate, drone detection)
    analyze.js    proxy, motion/shake, exposure & white-balance statistics
    grade.js      automatic colour correction
    beats.js      tempo and beat grid
    plan.js       edit decisions: order, shot lengths, beat snapping, formats
    titles.js     opening title and agent card
    render.js     conform → assemble → encode
web/              the interface (no build step)
test/             fixtures generator and tests
```

## Before going live for paying customers

This build is a complete single-studio tool. For a hosted, multi-customer service you'd add:

- **Accounts and auth** — the server trusts anyone who can reach it; keep it on `127.0.0.1` or behind a login proxy until then.
- **Database and object storage** — swap `store.js` for Postgres and put media in S3-compatible storage.
- **Render workers** — move `jobs.js` lanes onto a queue (e.g. BullMQ) so renders scale across machines.
- **Licensed music library** — users currently upload their own tracks; they must hold the rights to publish them.
- **Billing** and delivery links for agents.
