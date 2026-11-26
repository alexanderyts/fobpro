// Edit decision list: which part of which clip plays when, for one deliverable.

export const STYLES = {
  walkthrough: {
    label: 'Walkthrough',
    description: 'Measured pace, cross-dissolves, cuts on the beat.',
    ideal: 4.2, min: 2.6, max: 6.5,
    transition: 'dissolve', transitionDuration: 0.6,
    intro: 4.8, outro: 4.5, look: 'bright', titleFont: 'sans',
  },
  signature: {
    label: 'Signature',
    description: 'Slower, longer dissolves and serif titles for luxury listings.',
    ideal: 5.4, min: 3.4, max: 8,
    transition: 'dissolve', transitionDuration: 1.0,
    intro: 5.6, outro: 5, look: 'warm', titleFont: 'serif',
  },
  social: {
    label: 'Social cut',
    description: 'Quick, beat-matched hard cuts for Reels, TikTok and Shorts.',
    ideal: 1.7, min: 0.9, max: 3.2,
    transition: 'cut', transitionDuration: 0,
    intro: 3.2, outro: 3, look: 'crisp', titleFont: 'sans',
  },
};

export const FORMATS = {
  'film-branded': {
    label: 'Listing film', sub: '16:9 · branded', aspect: '16:9', branded: true,
  },
  'film-mls': {
    label: 'MLS tour', sub: '16:9 · unbranded', aspect: '16:9', branded: false,
    note: 'No agent name, logo, phone or brokerage — for MLS virtual-tour fields.',
  },
  'reel': {
    label: 'Social reel', sub: '9:16 · 30 s', aspect: '9:16', branded: true,
    style: 'social', maxDuration: 30,
  },
  'square': {
    label: 'Feed post', sub: '1:1 · 30 s', aspect: '1:1', branded: true,
    style: 'social', maxDuration: 30,
  },
  'portrait-feed': {
    label: 'Feed post', sub: '4:5 · 30 s', aspect: '4:5', branded: true,
    style: 'social', maxDuration: 30,
  },
};

export function frameSize(aspect, resolution = 1080) {
  const k = resolution >= 2160 ? 2 : 1;
  switch (aspect) {
    case '9:16': return { width: 1080 * k, height: 1920 * k };
    case '1:1': return { width: 1080 * k, height: 1080 * k };
    case '4:5': return { width: 1080 * k, height: 1350 * k };
    default: return { width: 1920 * k, height: 1080 * k };
  }
}

// How long each kind of shot deserves relative to the style's ideal length.
const ROOM_WEIGHT = {
  aerial: 1.25, exterior: 1.15, outdoor: 1.1, living: 1.05, kitchen: 1.1,
  detail: 0.7, laundry: 0.75, garage: 0.8,
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * @param clips    ordered clips (project order), each { id, meta, analysis, include, trimIn, trimOut, room }
 * @param music    { analysis: { beats, downbeats } } or null
 * @param settings project settings { style, targetDuration, fps, slowmo, resolution }
 * @param formatId key of FORMATS
 */
export function buildPlan({ clips, music, settings, formatId }) {
  const format = FORMATS[formatId];
  if (!format) throw new Error(`Unknown format ${formatId}`);
  const style = STYLES[format.style || settings.style] || STYLES.walkthrough;
  const fps = settings.fps || 30;
  const frame = 1 / fps;
  const toFrames = (t) => Math.round(t * fps) / fps;
  const d = style.transition === 'cut' ? 0 : toFrames(style.transitionDuration);
  const outroLen = format.branded ? style.outro : 0;

  let usable = clips
    .filter((c) => c.include !== false && c.status === 'ready' && c.analysis)
    .map((c) => {
      const srcIn = clamp(c.trimIn ?? c.analysis.trimIn, 0, c.meta.duration);
      const srcOut = clamp(c.trimOut ?? c.analysis.trimOut, srcIn + frame, c.meta.duration);
      const slow = settings.slowmo !== false && c.meta.fps >= 47 && fps <= 30;
      const speed = slow ? clamp(fps / c.meta.fps, 0.25, 1) : 1;
      const cap = (srcOut - srcIn) / speed;
      const weight = ROOM_WEIGHT[c.room] || 1;
      return { clip: c, srcIn, srcOut, speed, cap, weight };
    })
    .filter((u) => u.cap >= Math.max(0.5, style.min * 0.5));

  if (!usable.length) return { error: 'No usable clips yet — upload footage and wait for analysis to finish.' };

  const requested = Number(settings.targetDuration) || 0;
  let target = requested > 0 ? requested : Infinity;
  if (format.maxDuration) target = Math.min(target, format.maxDuration);
  const footageBudget = target - outroLen + (outroLen ? d : 0);

  // Too many clips for the runtime? Drop the weakest takes of over-represented rooms.
  const minSpan = (list) => list.reduce((a, u) => a + Math.min(style.min, u.cap), 0) - (list.length - 1) * d;
  const dropped = [];
  while (usable.length > 1 && Number.isFinite(footageBudget) && minSpan(usable) > footageBudget) {
    const counts = {};
    for (const u of usable) counts[u.clip.room || 'other'] = (counts[u.clip.room || 'other'] || 0) + 1;
    let worst = -1, worstScore = -Infinity;
    usable.forEach((u, i) => {
      const dup = counts[u.clip.room || 'other'];
      const score = dup * 10 + (u.clip.analysis.shake || 0) * 1000 - u.weight;
      if (score > worstScore) { worstScore = score; worst = i; }
    });
    dropped.push(usable[worst].clip.id);
    usable.splice(worst, 1);
  }

  // Water-fill shot lengths toward the budget: L_i = clamp(λ·ideal·w_i, min_i, cap_i).
  const lo = usable.map((u) => Math.min(style.min, u.cap));
  const hi = usable.map((u) => Math.min(style.max, u.cap));
  const lengthsFor = (lambda) => usable.map((u, i) => clamp(lambda * style.ideal * u.weight, lo[i], hi[i]));
  const span = (L) => L.reduce((a, v) => a + v, 0) - (L.length - 1) * d;
  let L;
  if (!Number.isFinite(footageBudget)) {
    L = lengthsFor(1);
  } else {
    let a = 0, b = 20;
    for (let k = 0; k < 40; k++) {
      const m = (a + b) / 2;
      if (span(lengthsFor(m)) > footageBudget) b = m; else a = m;
    }
    L = lengthsFor(a);
  }
  L = L.map(toFrames);

  // Beat-snap the cut points (centre of each transition).
  let musicStart = 0;
  let beatSynced = false;
  const beatsRaw = music?.analysis?.beats || [];
  if (beatsRaw.length > 8) {
    const db = music.analysis.downbeats || [];
    musicStart = db.length && db[0] < 3 ? db[0] : 0;
    const beats = beatsRaw.map((b) => b - musicStart).filter((b) => b > 0.3);
    let start = 0;
    for (let i = 0; i < L.length - 1; i++) {
      const naturalCut = start + L[i] - d / 2;
      let best = null;
      for (const bt of beats) {
        if (Math.abs(bt - naturalCut) > 1.6) continue;
        const len = toFrames(bt + d / 2 - start);
        if (len < lo[i] - 0.15 || len > hi[i] + 0.05) continue;
        if (!best || Math.abs(bt - naturalCut) < Math.abs(best - naturalCut)) best = bt;
      }
      if (best !== null) {
        L[i] = Math.min(toFrames(best + d / 2 - start), toFrames(usable[i].cap));
        beatSynced = true;
      }
      start += L[i] - d;
    }
  }

  // Lay out the timeline and choose the steadiest source window inside each trim.
  const segments = [];
  let t = 0;
  usable.forEach((u, i) => {
    const duration = L[i];
    const srcDur = Math.min(duration * u.speed, u.srcOut - u.srcIn);
    const srcIn = bestWindow(u.clip.analysis, u.srcIn, u.srcOut, srcDur);
    segments.push({
      clipId: u.clip.id,
      room: u.clip.room || null,
      srcIn: Number(srcIn.toFixed(3)),
      srcDur: Number(srcDur.toFixed(3)),
      speed: Number(u.speed.toFixed(4)),
      start: Number(t.toFixed(3)),
      duration,
      frames: Math.round(duration * fps),
      transitionIn: i === 0 ? null : { type: style.transition, duration: d },
    });
    t += duration - (i < usable.length - 1 ? d : 0);
  });

  let total = t;
  let outro = null;
  if (outroLen) {
    const start = toFrames(total - d);
    outro = {
      start,
      duration: toFrames(outroLen),
      frames: Math.round(outroLen * fps),
      transitionIn: { type: d ? 'dissolve' : 'cut', duration: d },
    };
    total = start + outro.duration;
  }
  total = toFrames(total);

  return {
    formatId,
    format: { ...format, ...frameSize(format.aspect, settings.resolution) },
    style: { id: format.style || settings.style || 'walkthrough', ...style },
    fps,
    segments,
    outro,
    intro: { start: 0.6, end: Math.min(style.intro, segments[0].duration + 1.5) },
    total: Number(total.toFixed(3)),
    music: music?.file ? { start: Number(musicStart.toFixed(3)), beatSynced, bpm: music.analysis?.bpm || null } : null,
    dropped,
  };
}

/** Steadiest window of `len` seconds inside [a, b], with a mild preference for the middle. */
function bestWindow(analysis, a, b, len) {
  const env = analysis?.motion?.envelope;
  const rate = analysis?.motion?.envelopeRate || 10;
  const slack = b - a - len;
  if (slack <= 0.05 || !env?.length) return a + Math.max(0, slack) / 2;
  let best = a + slack / 2, bestScore = Infinity;
  const steps = Math.min(40, Math.ceil(slack * rate));
  for (let k = 0; k <= steps; k++) {
    const s = a + (slack * k) / steps;
    const i0 = Math.floor(s * rate), i1 = Math.ceil((s + len) * rate);
    let sum = 0, n = 0, peak = 0;
    for (let i = i0; i < Math.min(env.length, i1); i++) { sum += env[i]; n++; peak = Math.max(peak, env[i]); }
    const centre = Math.abs(s + len / 2 - (a + b) / 2) / Math.max(0.1, b - a);
    const score = (n ? sum / n : 0) + peak * 0.3 + centre * 0.002;
    if (score < bestScore) { bestScore = score; best = s; }
  }
  return best;
}

/** Order clips the way a listing tour is usually cut: arrive, walk through, step outside, leave. */
export const ROOM_ORDER = [
  'aerial', 'exterior', 'entry', 'living', 'kitchen', 'dining', 'office', 'primary_bedroom',
  'primary_bath', 'bedroom', 'bathroom', 'laundry', 'garage', 'outdoor', 'amenity', 'detail', 'other',
];

export const ROOM_LABELS = {
  aerial: 'Aerial', exterior: 'Exterior', entry: 'Entry', living: 'Living', kitchen: 'Kitchen',
  dining: 'Dining', office: 'Office', primary_bedroom: 'Primary bedroom', primary_bath: 'Primary bath',
  bedroom: 'Bedroom', bathroom: 'Bathroom', laundry: 'Laundry', garage: 'Garage', outdoor: 'Outdoor',
  amenity: 'Amenity', detail: 'Detail', other: 'Other',
};

export function autoOrder(clips) {
  const byCapture = (a, b) =>
    String(a.meta?.creationTime || a.originalName).localeCompare(String(b.meta?.creationTime || b.originalName));
  const rank = (c) => {
    const i = ROOM_ORDER.indexOf(c.room || 'other');
    return i < 0 ? ROOM_ORDER.length : i;
  };
  const sorted = [...clips].sort((a, b) => rank(a) - rank(b) || byCapture(a, b));
  // With two or more aerials, close on one (the last captured) — the classic pull-away.
  const aerials = sorted.filter((c) => c.room === 'aerial');
  if (aerials.length >= 2) {
    const closer = aerials[aerials.length - 1];
    sorted.splice(sorted.indexOf(closer), 1);
    sorted.push(closer);
  }
  return sorted.map((c) => c.id);
}
