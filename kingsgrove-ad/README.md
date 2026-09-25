# Kingsgrove Sports: "Thanks, Nack" (25 s ad)

**Watch:** [`kingsgrove-sports-ad.mp4`](kingsgrove-sports-ad.mp4) (1920×1080, 30 fps, stereo AAC, 25.0 s)

**Logline:** Nack works the Kingsgrove Sports live chat all night, answering questions like "do your cricket bats come with the cricket?". When the chat finally buries Nack, one customer writes in just to say thanks for all the hard work, and the sun comes up.

## Script / storyboard

| Time | Picture | Sound |
|---|---|---|
| 0.0–3.0 | Fade up on a night-time office. The wall clock reads 9:02 PM. Nack, in a green Kingsgrove polo and headset, sits smiling at a laptop. A lower third reads **NACK · Customer Support · Kingsgrove Sports**. | An upbeat marimba groove kicks in. |
| 0.8–9.4 | Four chats, answered cheerfully and then less cheerfully:<br>**Dave:** "do ur cricket bats come with the cricket?" → *"Just the bat, mate. No bugs."*<br>**Shaz:** "which end of the bat do i hold" → *"The end with the handle."*<br>**Liam:** "can i return a ball i hit for six? its in my neighbours pool" → *"That's between you and your neighbour."*<br>**Kev:** "my bat keeps getting me out. is it faulty??" → *"It's… probably not the bat."*<br>Nack's smile fades, eye bags appear and coffee mugs start piling up. | A pop for each message, key clicks while Nack types, a whoosh on each send, and a clink for every new mug. |
| 9.6–14.8 | **The flood.** The questions pour in faster and faster: "does a duck mean i get a free duck", "is a googly a type of shoe?", "whats the wifi password for the stumps", "is LBW a size", "can i return the pool", "can i speak to cricket's manager"… The counter climbs to **99+ waiting**. The clock races to 4 AM. Nack starts typing "Look, a duck is when" and deletes it. Sweat, an eye twitch, messy hair, a tower of mugs, the screen shakes and turns red at the edges. | The groove speeds up and creeps up a semitone every bar, with hats doubled and pops piling on top of each other. |
| 14.85 | Nack face-plants onto the keyboard, and the chat box fills with "hjkkkkkkkkkk…". The status changes to **Nack is away**. | *Thunk.* The music tape-stops and dies. |
| 15.0–16.4 | Silence. The room is dim and the chat clears to **NEW CHAT · PRIYA**. A notification makes one of Nack's eyes open. Priya is typing… | Crickets chirp. A soft two-note ding. |
| 16.4–17.9 | **Priya:** "Hey Nack. No question today. Just wanted to say thanks for all your hard work. You're a legend." Nack lifts their head, reads it and does a double take. | A warm chime. |
| 17.9–20.4 | Nack breaks into a huge grin, blushes and sparkles. The sun rises in the window and the room turns gold. Nack replies: *"You just made my night. Thank you! ♥"* Hearts float up and Nack does a happy wiggle. | A harp glissando into warm pads and a gentle arpeggio, with bell sparkles on the hearts. |
| 20.45–21.1 | An iris wipe opens out from Nack's face into the end card. | Whoosh. |
| 21.1–25.0 | **End card:** a cricket ball is hit in and lands above the wordmark **KINGSGROVE SPORTS**.<br>**The gear's great.**<br>**The people are even better.**<br>*Every question answered. Yes, even that one.*<br>Handwritten in the corner: *thanks for your hard work, Nack ♥* | The crack of bat on ball, applause, a four-note jingle and warm pads to finish. |

## Before it goes out

- **The logo is a placeholder.** The end card uses a typeset wordmark and a generic cricket ball. Swap in the real Kingsgrove Sports logo and brand colours (the colours are CSS variables at the top of `ad.html`).
- **There's no call to action yet**, because I didn't want to guess a web address, phone number or store location. Add one under the tagline if you want it (`#endSub` in `ad.html`).
- **Nack's look** (skin, hair) is set by the `--skin`, `--skin-shade` and `--hair` variables if you want the cartoon to look more like the real Nack.
- Every chat line lives in the `CHAT` and `FLOOD` arrays in `ad.html`, so changing a joke is a one-line edit followed by a re-render.

## Files

| File | What it is |
|---|---|
| `kingsgrove-sports-ad.mp4` | The finished ad. |
| `poster.jpg` | A thumbnail frame (19.9 s). |
| `ad.html` | The animation. Each frame is drawn by `AD.renderAt(t)`. Open it in a browser to preview it with play/scrub controls; it plays `soundtrack.m4a` if that file sits next to it. |
| `render.cjs` | Renders `ad.html` frame by frame with Playwright/Chromium and pipes the frames to ffmpeg. Also writes `events.json`. |
| `events.json` | The sound-cue timeline (message pops, key clicks, chimes) exported from the animation. |
| `soundtrack.py` | Synthesises all the music and sound effects from scratch with numpy and scipy, using `events.json` so every sound lands on its frame. |
| `soundtrack.m4a` | The rendered soundtrack, used by the HTML preview. |
| `fonts/` | Nunito, Bebas Neue and Caveat (SIL Open Font License, with the licences included). |

## Rebuilding

Requires Node with Playwright (Chromium), Python 3 with `numpy` and `scipy`, and an ffmpeg build that has libx264 (for example `pip install imageio-ffmpeg`).

```bash
cd kingsgrove-ad
export FFMPEG=ffmpeg          # or: $(python3 -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())")
node render.cjs               # -> video-only.mp4 + events.json   (~3 min)
python3 soundtrack.py         # -> soundtrack.wav
$FFMPEG -y -i video-only.mp4 -i soundtrack.wav -c:v copy -c:a aac -b:a 192k -movflags +faststart -shortest kingsgrove-sports-ad.mp4
$FFMPEG -y -i soundtrack.wav -c:a aac -b:a 160k soundtrack.m4a

node render.cjs --stills 2.5,12.5,19.9   # quick PNG checks in stills/
```
