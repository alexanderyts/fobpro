#!/usr/bin/env python3
"""Synthesises the 25 s soundtrack for the "Thanks, Nack" ad. Everything is generated here; no samples are used.

Sound effects follow the cue timeline exported from ad.html (events.json, written by render.cjs),
so the pops, key clicks and chimes land on the exact frames they belong to. The music cues use
the same scene timings, which are listed as constants below.

    python3 soundtrack.py            -> soundtrack.wav (48 kHz, 16-bit stereo)

Needs numpy and scipy.
"""
import json
import os

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48000
DUR = 25.0
N = int(SR * DUR)
HERE = os.path.dirname(os.path.abspath(__file__))
rng = np.random.default_rng(7)

# Scene timings (seconds), matching ad.html
FLOOD_START = 9.6       # questions start pouring in, music speeds up
CRASH = 14.85           # Nack face-plants, music tape-stops
SWELL = 17.95           # Nack smiles, the room fills with light
END_CARD = 21.12        # the ball is hit into the end card
FADE_OUT = 24.35


# ---------------------------------------------------------------- building blocks
def tt(d):
    return np.arange(int(d * SR)) / SR


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def filt(x, kind, fc, order=2):
    return sosfilt(butter(order, fc, kind, fs=SR, output='sos'), x)


def noise(d):
    return rng.standard_normal(int(d * SR))


def sweep_phase(f):
    return 2 * np.pi * np.cumsum(f) / SR


class Bus:
    def __init__(self):
        self.l = np.zeros(N)
        self.r = np.zeros(N)

    def add(self, sig, t, gain=1.0, pan=0.0):
        i = int(round(t * SR))
        if i >= N or len(sig) == 0:
            return
        if i < 0:
            sig, i = sig[-i:], 0
        n = min(len(sig), N - i)
        a = (pan + 1) * np.pi / 4
        self.l[i:i + n] += sig[:n] * gain * np.cos(a) * np.sqrt(2)
        self.r[i:i + n] += sig[:n] * gain * np.sin(a) * np.sqrt(2)


music_a = Bus()   # the busy daytime groove, tape-stopped at the crash
dry = Bus()       # everything else
wet = Bus()       # sent to the reverb


# ---------------------------------------------------------------- instruments
def pluck(f, d=0.4, bright=1.0):
    t = tt(d)
    s = np.sin(2 * np.pi * f * t) + 0.15 * np.sin(2 * np.pi * 2 * f * t)
    s += 0.35 * bright * np.sin(2 * np.pi * 4 * f * t) * np.exp(-t * 40)
    return s * np.exp(-t * 9) * (1 - np.exp(-t * 900))


def bass(f, d=0.32):
    t = tt(d)
    s = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t) + 0.12 * np.sin(2 * np.pi * 3 * f * t)
    return s * np.exp(-t * 6) * (1 - np.exp(-t * 500))


def kick(d=0.28, top=140, low=48):
    t = tt(d)
    return np.sin(sweep_phase(low + (top - low) * np.exp(-t * 30))) * np.exp(-t * 13)


def hat(d=0.05):
    t = tt(d)
    return filt(noise(d), 'hp', 7000) * np.exp(-t * 95)


def snare(d=0.2):
    t = tt(d)
    return filt(noise(d), 'bp', [1200, 5000]) * np.exp(-t * 26) * 0.8 + np.sin(2 * np.pi * 190 * t) * np.exp(-t * 32) * 0.5


def bell(f, d=1.6, decay=3.0):
    t = tt(d)
    parts = [(1, 1, 1), (2.0, .5, 1.6), (2.76, .32, 2.2), (5.4, .16, 3.5), (8.93, .06, 5)]
    s = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t * decay * k) for r, a, k in parts)
    return s * (1 - np.exp(-t * 2500))


def pad(notes, d, att=0.35, rel=0.7):
    t = tt(d)
    s = np.zeros_like(t)
    for m in notes:
        f = midi(m)
        for det in (-0.0045, 0, 0.0045):
            for h, a in ((1, 1), (2, .3), (3, .12), (4, .05)):
                s += a * np.sin(2 * np.pi * f * (1 + det) * h * t + rng.uniform(0, 2 * np.pi))
    env = np.clip(np.minimum(t / att, (d - t) / rel), 0, 1)
    return filt(s, 'lp', 2200) * env / (3 * len(notes))


def swept_noise(d, f0, f1, q=2.5):
    """Noise through a band-pass whose centre glides from f0 to f1 (state-variable filter)."""
    x = noise(d)
    n = len(x)
    fc = f0 * (f1 / f0) ** (np.arange(n) / n)
    g = 2 * np.sin(np.pi * fc / SR)
    lo = bp = 0.0
    out = np.empty(n)
    damp = 1 / q
    for i in range(n):
        hi = x[i] - lo - damp * bp
        bp += g[i] * hi
        lo += g[i] * bp
        out[i] = bp
    return out


# ---------------------------------------------------------------- sound effects
def sfx_pop(pitch=1.0):
    t = tt(0.13)
    f = (800 + 450 * np.exp(-t * 50)) * pitch
    return np.sin(sweep_phase(f)) * np.exp(-t * 34) * (1 - np.exp(-t * 3000))


def sfx_send():
    d = 0.18
    t = tt(d)
    s = np.sin(sweep_phase(650 + 1000 * t / d)) * np.exp(-t * 18) * 0.55
    return s + filt(noise(d), 'bp', [2000, 7000]) * np.sin(np.pi * t / d) * 0.25


def sfx_key(strength=1.0):
    d = 0.05
    t = tt(d)
    click = filt(noise(d), 'hp', 2500) * np.exp(-t * 420)
    thock = np.sin(2 * np.pi * rng.uniform(210, 290) * t) * np.exp(-t * 90) * 0.45
    return (click + thock) * strength


def sfx_clink():
    t = tt(0.5)
    s = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t * k)
            for f, a, k in ((2150, 1, 9), (3230, .6, 12), (4870, .35, 16), (6100, .2, 22)))
    return s * (1 - np.exp(-t * 4000))


def sfx_thunk():
    s = kick(0.4, top=120, low=45) * 1.2
    for _ in range(22):
        k = sfx_key(rng.uniform(.5, 1.2))
        o = int(rng.uniform(0, 0.07) * SR)
        s[o:o + len(k)] += k[:len(s) - o] * 0.6
    return s


def sfx_soft_swoosh():
    d = 0.4
    t = tt(d)
    return filt(noise(d), 'bp', [300, 1600]) * np.sin(np.pi * t / d) ** 2


def sfx_cricket_chirp():
    d = 0.2
    t = tt(d)
    carrier = np.sin(2 * np.pi * 4400 * t)
    am = np.clip(np.sin(2 * np.pi * 28 * t), 0, 1) ** 2
    return carrier * am * np.exp(-t * 4)


def sfx_crack():
    d = 0.3
    t = tt(d)
    click = filt(noise(d), 'hp', 3000) * np.exp(-t * 380)
    tock = (np.sin(2 * np.pi * 1150 * t) * .8 + np.sin(2 * np.pi * 2350 * t) * .5 + np.sin(2 * np.pi * 3900 * t) * .25) * np.exp(-t * 42)
    thump = np.sin(2 * np.pi * 140 * t) * np.exp(-t * 24)
    return click * .9 + tock + thump * .6


def applause(t0, d=2.6, claps=380):
    """Many tiny hand-claps with a quick swell and slow decay, plus a soft crowd bed."""
    for _ in range(claps):
        # clap times biased towards the start, like a crowd reacting
        u = rng.beta(1.4, 3.2)
        at = t0 + 0.05 + u * d
        env = min(1, (at - t0) / 0.25) * np.exp(-(at - t0) / 1.3)
        cd = 0.03
        ct = tt(cd)
        lo_f = rng.uniform(700, 1500)
        c = filt(noise(cd), 'bp', [lo_f, lo_f * 2.2]) * np.exp(-ct * rng.uniform(140, 220))
        dry.add(c, at, gain=0.11 * env * rng.uniform(.5, 1), pan=rng.uniform(-.85, .85))
    bed_t = tt(d + 0.6)
    bed = filt(noise(d + 0.6), 'lp', 1100) * np.minimum(1, bed_t / 0.3) * np.exp(-bed_t / 1.1)
    dry.add(bed, t0, gain=0.035)
    wet.add(bed, t0, gain=0.02)


# ---------------------------------------------------------------- music A: upbeat, speeds up in the flood
def build_music_a():
    grid = np.arange(0, CRASH + 1, 0.001)
    bpm = np.where(grid < FLOOD_START, 124, 124 + 46 * np.clip((grid - FLOOD_START) / (CRASH - FLOOD_START), 0, 1) ** 1.3)
    beats = np.cumsum(bpm / 60 * 0.001)
    start = 0.05

    def at(b):
        return start + float(np.interp(b, beats, grid))

    flood_beat = float(np.interp(FLOOD_START - start, grid, beats))
    chords = [(48, [72, 76, 79, 84]), (45, [69, 72, 76, 81]), (41, [65, 69, 72, 77]), (43, [67, 71, 74, 79])]
    arp = [0, 1, 2, 3, 2, 1, 2, 3]
    b = 0.0
    while at(b) < CRASH + 0.6:
        bar, beat = int(b // 4), b % 4
        root, tones = chords[bar % 4]
        flood = b >= flood_beat
        tr = int((b - flood_beat) // 4) + 1 if flood else 0     # creep up a semitone per bar under stress
        t = at(b)
        # drums
        if beat in (0, 2) or (flood and beat in (1, 3)):
            music_a.add(kick(), t, 0.42)
        if beat in (1, 3):
            music_a.add(snare(), t, 0.16)
        music_a.add(hat(), at(b + 0.5), 0.09, pan=0.3)
        if flood:
            music_a.add(hat(), at(b + 0.25), 0.05, pan=-0.3)
            music_a.add(hat(), at(b + 0.75), 0.05, pan=-0.3)
        # bass: root on 1, root on 2&, fifth on 3, root on 4&
        for off, iv in ((0, 0), (1.5, 0), (2, 7), (3.5, 0)):
            if beat == 0:
                music_a.add(bass(midi(root + iv + tr)), at(b + off), 0.34)
        # marimba arpeggio in eighths
        for k in range(2):
            idx = arp[int(beat * 2 + k) % 8]
            music_a.add(pluck(midi(tones[idx] + tr)), at(b + k * 0.5), 0.17, pan=(-.25 if k else .25))
        b += 1

    # tape-stop at the crash: the groove winds down like a dying cassette, then silence
    d = 0.55
    i0, nd = int(CRASH * SR), int(d * SR)
    u = np.arange(nd) / nd
    pos = i0 + np.cumsum((1 - u) ** 2)
    for ch in (music_a.l, music_a.r):
        src = ch.copy()
        ch[i0:i0 + nd] = np.interp(pos, np.arange(N), src) * (1 - u) ** 0.6
        ch[i0 + nd:] = 0


# ---------------------------------------------------------------- music B: warm swell to the end card
def build_music_b():
    # harp glissando as Nack lights up
    scale = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84]
    for i, m in enumerate(scale):
        at = SWELL + i * 0.032
        s = pluck(midi(m), 0.9, bright=0.4)
        dry.add(s, at, 0.07, pan=-.4 + .8 * i / len(scale))
        wet.add(s, at, 0.07)

    progression = [
        (SWELL, 19.3, [53, 57, 60, 64, 67], 41),      # Fmaj9
        (19.3, 20.0, [52, 55, 59, 62, 64], 40),       # Em7
        (20.0, END_CARD, [50, 57, 60, 62, 65], 43),   # Dm7 over G
        (END_CARD, DUR, [55, 60, 64, 67, 71, 74], 36),  # Cmaj9
    ]
    for a, b, notes, low in progression:
        p = pad(notes, (b - a) + 0.7, att=0.3 if a == SWELL else 0.2)
        dry.add(p, a, 0.55)
        wet.add(p, a, 0.35)
        dry.add(bass(midi(low), min(1.4, b - a + 0.3)), a, 0.35)

    # gentle eighth-note arpeggio at 100 bpm
    step = 0.3
    t = SWELL + 0.3
    k = 0
    while t < FADE_OUT:
        for a, b, notes, _ in progression:
            if a <= t < b:
                tones = [n + 12 for n in notes[1:]]
                break
        m = tones[[0, 2, 1, 3, 2, 1][k % 6] % len(tones)]
        s = pluck(midi(m), 0.6, bright=0.5)
        dry.add(s, t, 0.08, pan=.3 if k % 2 else -.3)
        wet.add(s, t, 0.06)
        t += step
        k += 1

    # end card: soft heartbeat kick under the logo
    t = END_CARD
    while t < FADE_OUT:
        dry.add(kick(0.3, top=110, low=45), t, 0.32)
        t += 0.6

    # jingle on the ball landing, and notes on each tagline
    for i, m in enumerate([72, 76, 79, 84]):
        s = bell(midi(m), 1.8, 2.2)
        dry.add(s, 21.62 + i * 0.09, 0.13)
        wet.add(s, 21.62 + i * 0.09, 0.1)


# ---------------------------------------------------------------- cues from the animation
def place_events(events):
    flood_n = 0
    for e in events:
        t, kind = e['t'], e['type']
        if kind == 'pop':
            if e.get('flood'):
                flood_n += 1
                pitch = 2 ** (rng.integers(-3, 6) / 12) * (1 + flood_n * 0.004)
                dry.add(sfx_pop(pitch), t, 0.16 + min(0.06, flood_n * 0.002), pan=rng.uniform(-.5, .5))
            else:
                dry.add(sfx_pop(), t, 0.26, pan=.35)
        elif kind == 'send':
            dry.add(sfx_send(), t, 0.22, pan=.35)
        elif kind == 'key':
            dry.add(sfx_key(rng.uniform(.6, 1.2) * (1.3 if e.get('faceroll') else 1)), t, 0.2, pan=-.1)
        elif kind == 'clink':
            s = sfx_clink()
            dry.add(s, t, 0.1, pan=-.4)
            wet.add(s, t, 0.05)
        elif kind == 'thunk':
            dry.add(sfx_thunk(), t, 0.55)
        elif kind == 'soft':
            dry.add(sfx_soft_swoosh(), t, 0.07, pan=.3)
        elif kind == 'ding':
            for i, m in enumerate([81, 88]):
                s = bell(midi(m), 1.4, 3.2)
                dry.add(s, t + i * 0.13, 0.12, pan=.3)
                wet.add(s, t + i * 0.13, 0.08)
        elif kind == 'special':
            for m, g in ((84, .12), (91, .07), (88, .05)):
                s = bell(midi(m), 2.4, 1.6)
                dry.add(s, t, g, pan=.3)
                wet.add(s, t, g)
        elif kind == 'surprise':
            d = 0.35
            st = tt(d)
            s = np.sin(sweep_phase(520 + 820 * np.minimum(1, st / 0.16) + 12 * np.sin(2 * np.pi * 9 * st))) * np.exp(-st * 7)
            dry.add(s, t, 0.1)
        elif kind == 'hearts':
            for i, m in enumerate(rng.permutation([84, 86, 88, 91, 93, 96])):
                s = bell(midi(m), 1.4, 3.0)
                dry.add(s, t + i * 0.085, 0.06, pan=rng.uniform(-.6, .6))
                wet.add(s, t + i * 0.085, 0.06)
        elif kind == 'whoosh':
            d = 0.7
            s = swept_noise(d, 250, 4000) * np.sin(np.pi * tt(d) / d) ** 1.5
            dry.add(s, t - 0.05, 0.45)
            wet.add(s, t - 0.05, 0.2)
        elif kind == 'crack':
            dry.add(sfx_crack(), t, 0.5)
            wet.add(sfx_crack(), t, 0.15)
        elif kind == 'land':
            dry.add(kick(0.25, top=160, low=70), t, 0.25)
        elif kind == 'cheer':
            applause(t)
        elif kind == 'tick':
            m = {22.35: 76, 22.95: 79}.get(round(t, 2), 84)
            s = bell(midi(m), 1.8, 2.4)
            dry.add(s, t, 0.1)
            wet.add(s, t, 0.08)

    # crickets chirping in the awkward silence after the crash
    for at in (15.30, 15.95, 16.95):
        for k in range(3):
            dry.add(sfx_cricket_chirp(), at + k * 0.2, 0.03, pan=-.6)


def reverb(bus, seconds=1.6):
    t = tt(seconds)
    ir_l = rng.standard_normal(len(t)) * np.exp(-t * 4.2)
    ir_r = rng.standard_normal(len(t)) * np.exp(-t * 4.2)
    ir_l, ir_r = filt(ir_l, 'lp', 5000), filt(ir_r, 'lp', 5000)
    scale = 1 / np.sqrt(np.sum(ir_l ** 2))
    return fftconvolve(bus.l, ir_l)[:N] * scale, fftconvolve(bus.r, ir_r)[:N] * scale


def main():
    with open(os.path.join(HERE, 'events.json')) as f:
        events = json.load(f)
    build_music_a()
    build_music_b()
    place_events(events)

    rl, rr = reverb(wet)
    left = music_a.l + dry.l + rl * 0.9
    right = music_a.r + dry.r + rr * 0.9

    t = np.arange(N) / SR
    fade = np.clip((DUR - 0.05 - t) / (DUR - 0.05 - FADE_OUT), 0, 1) ** 1.5
    fade *= np.clip(t / 0.02, 0, 1)
    mix = np.stack([left, right]) * fade
    mix = filt(mix, 'hp', 28)
    peak = np.max(np.abs(mix))
    mix = np.tanh(mix / peak * 1.6) / np.tanh(1.6) * 0.93   # gentle saturation, -0.6 dBFS peak
    wavfile.write(os.path.join(HERE, 'soundtrack.wav'), SR, (mix.T * 32767).astype(np.int16))
    print(f'wrote soundtrack.wav ({DUR:.1f} s, pre-limit peak {peak:.2f})')


if __name__ == '__main__':
    main()
