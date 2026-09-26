#!/usr/bin/env python3
"""Score for the Kingsgrove crime-thriller title sequence (36 s). Fully synthesised: no samples.

Cue times come from events.json (exported by render.cjs from the animation), so hits land on picture.

    python3 score.py   -> score.wav (48 kHz, 16-bit stereo)
"""
import json
import os

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48000
DUR = 36.0
N = int(SR * DUR)
HERE = os.path.dirname(os.path.abspath(__file__))
rng = np.random.default_rng(3)


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
        if i < 0:
            sig, i = sig[-i:], 0
        n = min(len(sig), N - i)
        a = (pan + 1) * np.pi / 4
        self.l[i:i + n] += sig[:n] * gain * np.cos(a) * np.sqrt(2)
        self.r[i:i + n] += sig[:n] * gain * np.sin(a) * np.sqrt(2)


dry, hall = Bus(), Bus()


def both(sig, t, g_dry, g_wet, pan=0.0):
    dry.add(sig, t, g_dry, pan)
    hall.add(sig, t, g_wet, pan)


# ------------------------------------------------------------------ instruments
def piano(m, d=6.0, vel=0.7):
    f = hz(m)
    t = tt(d)
    s = np.zeros_like(t)
    B = 0.00035
    for n in range(1, 14):
        fn = f * n * np.sqrt(1 + B * n * n)
        if fn > 16000:
            break
        amp = (1 / n ** 1.25) * (vel ** (0.5 + n * 0.12))
        k_fast, k_slow = 2.2 + n * 0.9, 0.35 + n * 0.12
        env = 0.55 * np.exp(-t * k_fast) + 0.45 * np.exp(-t * k_slow)
        for det in (-0.00045, 0.00045):
            s += amp * env * np.sin(2 * np.pi * fn * (1 + det) * t + rng.uniform(0, 6.28)) * 0.5
    hammer = filt(noise(0.02), 'bp', [800, 5000]) * np.exp(-tt(0.02) * 300) * 0.25 * vel
    s[:len(hammer)] += hammer
    return s * (1 - np.exp(-t * 3000))


def bowed(m, d, att=1.5, rel=2.0, bright=900):
    t = tt(d)
    f = hz(m) * (1 + 0.0028 * np.sin(2 * np.pi * 4.8 * t + rng.uniform(0, 6)) * np.minimum(1, t / 1.5))
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = sum(np.sin(ph * n) / n for n in range(1, 18))
    s += filt(noise(d), 'bp', [hz(m) * 2, hz(m) * 8]) * 0.05
    env = np.clip(np.minimum(t / att, (d - t) / rel), 0, 1) ** 1.5
    return filt(s, 'lp', bright) * env


def braam(t0, d=4.5):
    t = tt(d)
    s = np.zeros_like(t)
    for m, g in ((26, 1.0), (33, 0.8), (38, 0.7), (41, 0.45), (45, 0.3)):
        for det in (-0.004, 0, 0.004):
            f = hz(m) * (1 + det)
            s += g * sum(np.sin(2 * np.pi * f * n * t + rng.uniform(0, 6)) / n for n in range(1, 30) if f * n < 12000)
    s = np.tanh(s * 0.35)
    # opening filter, done in blocks so the cutoff can move
    out = np.zeros_like(s)
    blk = 2400
    zi = None
    for i in range(0, len(s), blk):
        tc = i / SR
        fc = 180 + 2200 * np.exp(-tc * 1.6) * min(1, tc / 0.18)
        sos = butter(2, fc, 'lp', fs=SR, output='sos')
        from scipy.signal import sosfilt_zi
        if zi is None:
            zi = sosfilt_zi(sos) * 0
        out[i:i + blk], zi = sosfilt(sos, s[i:i + blk], zi=zi)
    env = np.minimum(1, t / 0.04) * np.exp(-t * 0.55)
    both(out * env, t0, 0.5, 0.35)
    sub = np.sin(2 * np.pi * np.cumsum(55 * np.exp(-t * 0.9) + 28) / SR) * np.exp(-t * 0.8)
    dry.add(sub, t0, 0.55)


def thump(f0=90, f1=38, d=0.5, k=9):
    t = tt(d)
    return np.sin(2 * np.pi * np.cumsum(f1 + (f0 - f1) * np.exp(-t * 22)) / SR) * np.exp(-t * k)


def swell(d=1.2):
    t = tt(d)
    x = filt(noise(d), 'hp', 1200)
    return x * (t / d) ** 3


# ------------------------------------------------------------------ cues
def build(ev):
    shots = sorted(e['t'] for e in ev if e['type'] == 'shot')
    wicket = next(e['t'] for e in ev if e['type'] == 'wicket')
    floods = sorted(e['t'] for e in ev if e['type'] == 'flood')
    title = next(e['t'] for e in ev if e['type'] == 'title')

    # drone bed: D, with a darker Bb/A movement in the second half; drops out after the wicket
    both(bowed(26, 15.0, att=3.0, rel=0.3, bright=500), 0.0, 0.11, 0.06)
    both(bowed(38, 15.0, att=4.0, rel=0.3, bright=650), 0.4, 0.05, 0.06, pan=-0.3)
    both(bowed(26, 15.8, att=2.5, rel=3.0, bright=550), 17.4, 0.12, 0.08)
    both(bowed(34, 6.0, att=2.0, rel=2.0, bright=650), 22.0, 0.06, 0.07, pan=0.3)   # Bb
    both(bowed(33, 6.0, att=2.0, rel=2.5, bright=650), 27.2, 0.06, 0.08, pan=-0.3)  # A

    # piano motif, sparse and reverberant (D minor: D F A / E / C#)
    motif = [(1.2, 74), (3.0, 69), (4.6, 65), (6.6, 64), (8.4, 74), (9.8, 72), (11.4, 69), (13.2, 64),
             (17.6, 62), (19.2, 65), (20.6, 69), (22.6, 70), (24.2, 69), (26.0, 61), (27.6, 62)]
    for t0, m in motif:
        v = 0.55 + 0.1 * rng.random()
        s = piano(m, 6.0, v)
        both(s, t0, 0.2, 0.34, pan=rng.uniform(-0.25, 0.25))
        if m >= 69:
            both(piano(m - 12, 5.0, 0.4), t0 + 0.01, 0.08, 0.16)

    # heartbeat pulse builds from the stumps shot, stops dead at the wicket, returns under the evidence
    beat = 60 / 66
    t0 = 11.2
    k = 0
    while t0 < 31.0:
        if not (wicket - 0.05 < t0 < 17.6):
            g = 0.22 + 0.25 * min(1, (t0 - 11) / 18)
            dry.add(thump(), t0, g)
            dry.add(thump(80, 36, 0.4, 11), t0 + 0.24, g * 0.55)
        t0 += beat
        k += 1

    # shot transitions: soft reversed swells into each cut
    for s in shots[1:]:
        both(swell(1.1), s - 1.05, 0.05, 0.05)

    # rain on the stumps
    rt = tt(6.8)
    rain = filt(noise(6.8), 'bp', [900, 9000]) * 0.5 + filt(noise(6.8), 'lp', 400) * 0.6
    renv = np.clip(np.minimum(rt / 0.8, (6.8 - rt) / 0.8), 0, 1)
    dry.add(rain * renv * 0.06, 10.8, 1.0, -0.2)
    dry.add(filt(noise(6.8), 'bp', [900, 9000]) * renv * 0.03, 10.8, 1.0, 0.3)
    for _ in range(40):
        at = 11 + rng.random() * 6.2
        d = tt(0.05)
        dry.add(np.sin(2 * np.pi * rng.uniform(1800, 3200) * d) * np.exp(-d * 90), at, 0.012, rng.uniform(-.7, .7))

    # the wicket: a slowed wooden crack, a sub drop, then silence but for the rain
    d = tt(2.4)
    crack = (np.sin(2 * np.pi * 420 * d) * 0.8 + np.sin(2 * np.pi * 870 * d) * 0.5 + np.sin(2 * np.pi * 1450 * d) * 0.25) * np.exp(-d * 6)
    crack += filt(noise(2.4), 'bp', [300, 2500]) * np.exp(-d * 30) * 0.8
    both(crack, wicket, 0.35, 0.4)
    both(thump(70, 24, 2.5, 1.2), wicket, 0.6, 0.2)
    for i in range(2):
        tb = wicket + 1.1 + i * 0.35
        clk = np.sin(2 * np.pi * (1300 + 300 * i) * tt(0.2)) * np.exp(-tt(0.2) * 40)
        both(clk, tb, 0.05, 0.08, pan=(-.4 if i == 0 else .4))

    # evidence: a far-off two-tone siren, low and filtered
    st = tt(5.8)
    fs = 620 + 110 * np.sign(np.sin(2 * np.pi * 0.55 * st))
    siren = np.sin(2 * np.pi * np.cumsum(fs) / SR)
    siren = filt(siren, 'lp', 900) * np.clip(np.minimum(st / 1.5, (5.8 - st) / 1.5), 0, 1)
    both(siren, 16.9, 0.012, 0.03, pan=-0.6)

    # scorebook: the red pen circling the duck
    pt = tt(1.4)
    scratch = filt(noise(1.4), 'bp', [2500, 7000]) * (0.4 + 0.6 * np.abs(np.sin(2 * np.pi * 3.2 * pt))) * np.clip(np.minimum(pt / 0.1, (1.4 - pt) / 0.2), 0, 1)
    dry.add(scratch, 22.2 + 2.2, 0.05, 0.2)

    # floodlights: relay clunk, metal ring, then mains hum rising
    for i, ft in enumerate(floods):
        dry.add(thump(110, 40, 0.6, 7), ft, 0.55)
        rt = tt(1.6)
        ring = sum(a * np.sin(2 * np.pi * f * rt) * np.exp(-rt * k) for f, a, k in ((318, 1, 3), (791, .5, 4), (1187, .3, 6), (2210, .15, 9)))
        both(ring, ft, 0.05, 0.1, pan=(-0.5 + i * 0.33))
        ht = tt(title + 0.4 - ft)
        hum = sum(np.sin(2 * np.pi * 50 * n * ht) / n for n in (1, 2, 3, 5)) * np.minimum(1, ht / 0.4)
        dry.add(filt(hum, 'lp', 600), ft, 0.012)

    # title: the braam, a low D minor chord on piano, and the tail
    braam(title - 0.05)
    for m in (38, 50, 53, 57):
        both(piano(m, 6.0, 0.8), title, 0.16, 0.3)


def reverb(bus, seconds=4.5):
    t = tt(seconds)
    out = []
    for seed in (1, 2):
        r = np.random.default_rng(seed)
        ir = r.standard_normal(len(t)) * np.exp(-t * 1.5)
        ir = filt(ir, 'lp', 4200)
        ir[:int(0.02 * SR)] *= np.linspace(0, 1, int(0.02 * SR))
        out.append(ir / np.sqrt(np.sum(ir ** 2)))
    return fftconvolve(bus.l, out[0])[:N], fftconvolve(bus.r, out[1])[:N]


def main():
    with open(os.path.join(HERE, 'events.json')) as f:
        ev = json.load(f)
    build(ev)
    rl, rr = reverb(hall)
    mix = np.stack([dry.l + rl * 1.1, dry.r + rr * 1.1])
    mix = filt(mix, 'hp', 22)
    t = np.arange(N) / SR
    mix *= np.clip(t / 0.3, 0, 1) * np.clip((DUR - t) / 0.6, 0, 1)
    peak = np.max(np.abs(mix))
    mix = np.tanh(mix / peak * 1.4) / np.tanh(1.4) * 0.93
    wavfile.write(os.path.join(HERE, 'score.wav'), SR, (mix.T * 32767).astype(np.int16))
    print(f'wrote score.wav, pre-limit peak {peak:.2f}')


if __name__ == '__main__':
    main()
