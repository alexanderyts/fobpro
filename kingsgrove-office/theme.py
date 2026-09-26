#!/usr/bin/env python3
"""Original bouncy piano theme for the Kingsgrove mockumentary opening (28 s, 120 bpm, F major).

Written for this piece; it is not the theme of any existing show. Everything is synthesised.
Sound effects follow events.json (written by render.cjs from the animation).

    python3 theme.py   -> theme.wav (48 kHz, 16-bit stereo)
"""
import json
import os

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48000
DUR = 28.0
N = int(SR * DUR)
BEAT = 0.5                 # 120 bpm
BAR = 4 * BEAT
HERE = os.path.dirname(os.path.abspath(__file__))
rng = np.random.default_rng(11)


def tt(d):
    return np.arange(int(d * SR)) / SR


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def filt(x, kind, fc, order=2):
    return sosfilt(butter(order, fc, kind, fs=SR, output='sos'), x)


def noise(d):
    return rng.standard_normal(int(d * SR))


class Bus:
    def __init__(self):
        self.l, self.r = np.zeros(N), np.zeros(N)

    def add(self, sig, t, gain=1.0, pan=0.0):
        i = int(round(t * SR))
        if i >= N:
            return
        n = min(len(sig), N - i)
        a = (pan + 1) * np.pi / 4
        self.l[i:i + n] += sig[:n] * gain * np.cos(a) * np.sqrt(2)
        self.r[i:i + n] += sig[:n] * gain * np.sin(a) * np.sqrt(2)


dry, room = Bus(), Bus()


# ------------------------------------------------------------------ instruments
_piano_cache = {}


def piano(m, d=1.6, vel=0.7, sus=1.0):
    key = (m, round(d, 2), round(vel, 2), sus)
    if key in _piano_cache:
        return _piano_cache[key]
    f = hz(m)
    t = tt(d)
    s = np.zeros_like(t)
    for n in range(1, 12):
        fn = f * n * np.sqrt(1 + 0.0004 * n * n)
        if fn > 15000:
            break
        amp = (1 / n ** 1.15) * vel ** (0.4 + 0.1 * n)
        env = 0.6 * np.exp(-t * (3.5 + n * 1.2) * sus) + 0.4 * np.exp(-t * (0.9 + n * 0.25) * sus)
        s += amp * env * (np.sin(2 * np.pi * fn * 0.9996 * t) + np.sin(2 * np.pi * fn * 1.0004 * t)) * 0.5
    ham = filt(noise(0.015), 'bp', [1000, 6000]) * np.exp(-tt(0.015) * 350) * 0.2 * vel
    s[:len(ham)] += ham
    rel = np.clip((d - t) / 0.08, 0, 1)
    out = s * (1 - np.exp(-t * 3000)) * rel
    _piano_cache[key] = out
    return out


def bass(m, d=0.45):
    t = tt(d)
    f = hz(m)
    s = np.sin(2 * np.pi * f * t) + 0.45 * np.sin(2 * np.pi * 2 * f * t) + 0.18 * np.sin(2 * np.pi * 3 * f * t)
    s += 0.25 * filt(np.sign(np.sin(2 * np.pi * f * t)), 'lp', 900)
    return s * np.exp(-t * 3.2) * (1 - np.exp(-t * 600)) * np.clip((d - t) / 0.03, 0, 1)


def kick():
    t = tt(0.3)
    return np.sin(2 * np.pi * np.cumsum(50 + 110 * np.exp(-t * 32)) / SR) * np.exp(-t * 13)


def snare():
    t = tt(0.22)
    return filt(noise(0.22), 'bp', [1500, 7000]) * np.exp(-t * 20) * 0.7 + np.sin(2 * np.pi * 200 * t) * np.exp(-t * 28) * 0.4


def hat(d=0.05):
    t = tt(d)
    return filt(noise(d), 'hp', 7500) * np.exp(-t * 80)


def shaker():
    t = tt(0.08)
    return filt(noise(0.08), 'bp', [5000, 11000]) * np.sin(np.pi * t / 0.08) ** 2


# ------------------------------------------------------------------ the tune
F, G, A, Bb, C, D, E = 65, 67, 69, 70, 72, 74, 76
CHORDS = [  # (bass root, right-hand voicing) per bar
    (41, [F, A, C]),            # 0 F      (intro)
    (41, [F, A, C]),            # 1 F
    (40, [G, C, E]),            # 2 C/E
    (38, [F, A, C + 0, D]),     # 3 Dm7
    (46 - 12, [F, Bb, D]),      # 4 Bb
    (45 - 12, [F, A, C]),       # 5 F/A
    (43 - 12, [F, Bb, D]),      # 6 Gm7
    (36, [E, G, Bb]),           # 7 C7
    (41, [F, A, C]),            # 8 F
    (40, [G, C, E]),            # 9 C/E
    (38, [F, A, D]),            # 10 Dm7
    (34, [F, Bb, D]),           # 11 Bb (C7 on beat 3)
]
MEL = {  # bar -> [(beat, midi, beats)]
    1: [(0, 72, .5), (.5, 69, .5), (1, 72, .5), (1.5, 77, 1), (2.5, 76, .5), (3, 74, .5), (3.5, 72, .5)],
    2: [(0, 74, 1), (1, 72, .5), (1.5, 67, 1.5)],
    3: [(0, 65, .5), (.5, 69, .5), (1, 72, .5), (1.5, 74, 1), (2.5, 72, .5), (3, 69, 1)],
    4: [(0, 70, .5), (.5, 74, .5), (1, 77, 1), (2, 76, .5), (2.5, 74, .5), (3, 72, 1)],
    5: [(0, 69, .5), (.5, 72, .5), (1, 77, .5), (1.5, 81, 1), (2.5, 79, .5), (3, 77, 1)],
    6: [(0, 79, .5), (.5, 77, .5), (1, 74, 1), (2, 70, 1), (3, 74, 1)],
    7: [(0, 72, 1.5), (1.5, 76, .5), (2, 79, 1), (3, 82, 1)],
    8: [(0, 81, 1), (1, 77, .5), (1.5, 72, 1), (2.5, 77, .5), (3, 76, .5), (3.5, 77, .5)],
    9: [(0, 79, 1.5), (1.5, 76, .5), (2, 72, 2)],
    10: [(0, 74, .5), (.5, 77, .5), (1, 81, 1), (2, 79, .5), (2.5, 77, .5), (3, 74, 1)],
    11: [(0, 70, .5), (.5, 74, .5), (1, 77, 1), (2, 79, 1), (3, 76, 1)],
}
STABS = [0, 1.5, 2, 3.5]          # syncopated right-hand chords (beats)


def compose():
    for b, (root, voicing) in enumerate(CHORDS):
        t0 = b * BAR
        # left hand / bass: root on 1, root on the & of 2, fifth on 3, octave on 4
        for beat, iv in ((0, 0), (1.5, 0), (2, 7), (3, 12)):
            r = root if not (b == 11 and beat >= 2) else 36
            if b == 0:
                both_piano(r + 12 + iv, t0 + beat * BEAT, 0.5, 0.55, pan=-0.3)
            else:
                dry.add(bass(r + iv), t0 + beat * BEAT, 0.34)
        # right-hand stabs
        for beat in STABS:
            v = voicing if not (b == 11 and beat >= 2) else [E, G, Bb, C]
            for m in v:
                both_piano(m, t0 + beat * BEAT, 0.34, 0.36 if beat else 0.42, pan=0.15)
        # drums from bar 1
        if b >= 1:
            for beat in (0, 2, 2.5 if b % 2 else None):
                if beat is not None:
                    dry.add(kick(), t0 + beat * BEAT, 0.5)
            for beat in (1, 3):
                dry.add(snare(), t0 + beat * BEAT, 0.2, pan=0.05)
                room.add(snare(), t0 + beat * BEAT, 0.12)
            for k in range(8):
                dry.add(hat(), t0 + k * BEAT / 2, 0.08 if k % 2 else 0.05, pan=0.35)
            for k in range(16):
                dry.add(shaker(), t0 + k * BEAT / 4, 0.03 + 0.02 * (k % 4 == 2), pan=-0.4)
        for beat, m, d in MEL.get(b, []):
            both_piano(m + 12 * 0, t0 + beat * BEAT, d * BEAT + 0.25, 0.62, pan=0.1, g=0.33)

    # title: the final F chord, a little tag, and the ring-out
    t_end = 12 * BAR
    for m in (29, 41, 53, 65, 69, 72, 77, 81):
        both_piano(m, t_end, 3.95, 0.8, g=0.26, sus=0.3)
    dry.add(kick(), t_end, 0.55)
    room.add(snare(), t_end, 0.18)
    both_piano(89, t_end + 1.5, 2.45, 0.5, g=0.2, pan=0.3, sus=0.5)
    both_piano(84, t_end + 1.75, 2.2, 0.45, g=0.16, pan=0.3, sus=0.5)


def both_piano(m, t, d, vel, pan=0.0, g=0.3, sus=1.0):
    s = piano(m, d, vel, sus)
    dry.add(s, t, g, pan)
    room.add(s, t, g * 0.35, pan)


# ------------------------------------------------------------------ sound effects from the picture
def sfx(ev):
    for e in ev:
        t, k = e['t'], e['type']
        if k == 'mallet':
            d = tt(0.25)
            tok = (np.sin(2 * np.pi * 520 * d) + 0.6 * np.sin(2 * np.pi * 1230 * d)) * np.exp(-d * 30)
            dry.add(tok + filt(noise(0.25), 'bp', [800, 3000]) * np.exp(-d * 90) * 0.5, t, 0.16, pan=-0.2)
        elif k == 'balls':
            for i in range(26):
                at = t + 0.02 + rng.random() ** 1.6 * 0.9
                d = tt(0.08)
                clk = np.sin(2 * np.pi * rng.uniform(1500, 2600) * d) * np.exp(-d * 70) + filt(noise(0.08), 'hp', 3000) * np.exp(-d * 200) * 0.4
                dry.add(clk, at, 0.07 * (1 - (at - t) * 0.6), pan=rng.uniform(-0.6, 0.6))
            d = tt(1.2)
            dry.add(filt(noise(1.2), 'lp', 500) * np.exp(-d * 2.5), t + 0.15, 0.05)
        elif k == 'beep':
            d = tt(0.22)
            dry.add(np.sin(2 * np.pi * 2093 * d) * np.clip((0.22 - d) / 0.02, 0, 1), t, 0.07)
        elif k == 'printer':
            d = tt(e.get('dur', 1.0))
            buzz = filt(np.sign(np.sin(2 * np.pi * 110 * d)) + 0.3 * noise(e.get('dur', 1.0)), 'bp', [300, 2500])
            dry.add(buzz * (0.6 + 0.4 * np.sin(2 * np.pi * 14 * d)) * np.clip((e.get('dur', 1.0) - d) / 0.05, 0, 1), t, 0.035, pan=0.3)
        elif k == 'clink':
            d = tt(0.5)
            s = sum(a * np.sin(2 * np.pi * f * d) * np.exp(-d * kk) for f, a, kk in ((2150, 1, 9), (3230, .6, 12), (4870, .35, 16)))
            dry.add(s, t, 0.06, pan=0.4)
        elif k == 'buzz':
            d = tt(0.45)
            hum = filt(np.sign(np.sin(2 * np.pi * 100 * d)), 'bp', [200, 1800]) * (np.sin(2 * np.pi * 18 * d) > 0)
            dry.add(hum, t, 0.03)
        elif k == 'carpass':
            d = tt(1.0)
            dry.add(filt(noise(1.0), 'bp', [200, 1500]) * np.sin(np.pi * d) ** 3, t, 0.12, pan=0.0)


def main():
    with open(os.path.join(HERE, 'events.json')) as f:
        ev = json.load(f)
    compose()
    sfx(ev)
    t = tt(1.2)
    irs = []
    for seed in (5, 6):
        r = np.random.default_rng(seed)
        ir = filt(r.standard_normal(len(t)) * np.exp(-t * 5), 'lp', 5000)
        irs.append(ir / np.sqrt(np.sum(ir ** 2)))
    rl, rr = fftconvolve(room.l, irs[0])[:N], fftconvolve(room.r, irs[1])[:N]
    mix = np.stack([dry.l + rl, dry.r + rr])
    mix = filt(mix, 'hp', 30)
    tt_ = np.arange(N) / SR
    mix *= np.clip((DUR - tt_) / 0.8, 0, 1)
    peak = np.max(np.abs(mix))
    mix = np.tanh(mix / peak * 1.5) / np.tanh(1.5) * 0.93
    wavfile.write(os.path.join(HERE, 'theme.wav'), SR, (mix.T * 32767).astype(np.int16))
    print(f'wrote theme.wav, pre-limit peak {peak:.2f}')


if __name__ == '__main__':
    main()
