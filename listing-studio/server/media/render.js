// Turns an edit plan into a finished, delivery-ready MP4.
//
// Stage 1 (conform): each segment is trimmed, retimed, stabilised (optional),
//   graded, reframed to the deliverable's aspect and encoded as a high-quality
//   intermediate. Intermediates are content-addressed, so the branded film and
//   the MLS cut share work.
// Stage 2 (assemble): dissolves/cuts, title overlays, the music bed (with
//   loudness normalisation) and fades, encoded once for delivery.

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { runFFmpeg, escapeFilterValue, num } from './ffmpeg.js';
import { toSdr, toRgb, chain } from './filters.js';
import { computeGrade } from './grade.js';
import { renderIntroCard, renderOutroCard } from './titles.js';

const preset = () => process.env.RENDER_PRESET || 'medium';
const INTERMEDIATE = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12', '-pix_fmt', 'yuv420p'];
const BT709 = ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv'];

const exists = (p) => fs.access(p).then(() => true, () => false);

function fillFilter(meta, W, H) {
  const srcPortrait = meta.height > meta.width;
  const dstLandscape = W > H;
  const toYuv = `out_color_matrix=bt709:out_range=tv`;
  if (srcPortrait && dstLandscape) {
    // Phone held vertically for a landscape film: blurred fill behind the frame.
    return (
      `split[a][b];` +
      `[a]scale=${W}:${H}:force_original_aspect_ratio=increase:flags=bicubic:${toYuv},crop=${W}:${H},gblur=sigma=${Math.round(W / 60)},eq=brightness=-0.06:saturation=0.9[bg];` +
      `[b]scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos:${toYuv}[fg];` +
      `[bg][fg]overlay=x=(W-w)/2:y=(H-h)/2`
    );
  }
  return `scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos:${toYuv},crop=${W}:${H}`;
}

async function conformSegment({ seg, clip, plan, settings, cacheDir, signal, onProgress }) {
  const { width: W, height: H } = plan.format;
  const grade = computeGrade(clip.analysis.color, {
    look: settings.look || plan.style.look,
    strength: clip.gradeStrength ?? settings.gradeStrength ?? 0.8,
  });
  const stabilize = Boolean(clip.stabilize ?? settings.stabilize);
  const key = crypto
    .createHash('sha1')
    .update(JSON.stringify([clip.file, clip.meta.sizeBytes, seg.srcIn, seg.srcDur, seg.speed, seg.frames, W, H, plan.fps, grade.filters, stabilize, 3]))
    .digest('hex')
    .slice(0, 20);
  const out = path.join(cacheDir, `${key}.mp4`);
  if (await exists(out)) {
    onProgress?.(1);
    return out;
  }

  let stab = null;
  if (stabilize) {
    const trf = path.join(cacheDir, `${key}.trf`);
    await runFFmpeg(
      ['-ss', String(seg.srcIn), '-t', String(seg.srcDur), '-i', clip.file,
        '-vf', `vidstabdetect=shakiness=5:accuracy=15:result='${escapeFilterValue(trf)}'`, '-f', 'null', '-'],
      { expectedDuration: seg.srcDur, onProgress: (p) => onProgress?.(p * 0.4), signal },
    );
    stab = `vidstabtransform=input='${escapeFilterValue(trf)}':smoothing=18:optzoom=1:zoomspeed=0.25:interpol=bicubic`;
  }

  const pixFmt = clip.meta.bitDepth > 8 ? 'gbrp16le' : 'gbrp';
  const sdr = toSdr(clip.meta);
  const pre = chain(
    sdr,
    stab,
    toRgb(sdr ? { ...clip.meta, hdr: 'tonemapped' } : clip.meta, { pixFmt }),
    ...grade.filters,
    seg.speed !== 1 ? `setpts=PTS/${num(seg.speed, 5)}` : null,
    `fps=${plan.fps}`,
  );
  const post = chain('unsharp=5:5:0.3:5:5:0', 'format=yuv420p', 'setsar=1', 'tpad=stop_mode=clone:stop_duration=2');
  const graph = `[0:v]${pre},${fillFilter(clip.meta, W, H)}[f];[f]${post}[v]`;

  const tmp = `${out}.part.mp4`;
  await runFFmpeg(
    ['-ss', String(seg.srcIn), '-t', String(seg.srcDur + 0.1), '-i', clip.file,
      '-filter_complex', graph, '-map', '[v]', '-an',
      '-frames:v', String(seg.frames), '-r', String(plan.fps), ...INTERMEDIATE, ...BT709, tmp],
    {
      expectedDuration: seg.duration,
      onProgress: (p) => onProgress?.(stabilize ? 0.4 + p * 0.6 : p),
      signal,
    },
  );
  await fs.rename(tmp, out);
  return out;
}

async function buildOutroSegment({ lastFile, lastFrames, plan, project, brand, workDir, signal }) {
  const { width: W, height: H } = plan.format;
  const bg = path.join(workDir, 'outro-bg.png');
  await runFFmpeg(
    ['-i', lastFile, '-vf', `select='eq(n\\,${Math.max(0, lastFrames - 1)})',gblur=sigma=${Math.round(W / 48)},eq=saturation=0.85`,
      '-frames:v', '1', '-update', '1', bg],
    { signal },
  );
  const card = await renderOutroCard({
    dir: path.join(workDir, 'outro'), width: W, height: H, project, brand, serif: plan.style.titleFont === 'serif',
  });
  const D = plan.outro.duration;
  const out = path.join(workDir, 'outro.mp4');
  await runFFmpeg(
    ['-loop', '1', '-framerate', String(plan.fps), '-t', String(D + 0.5), '-i', bg,
      '-loop', '1', '-framerate', String(plan.fps), '-t', String(D + 0.5), '-i', card,
      '-filter_complex',
      // Very slow push on the background so the card doesn't feel like a freeze-frame.
      `[0:v]scale=${Math.round(W * 1.06)}:-2,crop=${W}:${H}:'(iw-ow)/2':'(ih-oh)/2+${Math.round(H * 0.01)}*t/${D}',format=yuv420p[bg];` +
        `[1:v]format=rgba,fade=t=in:st=${num(plan.outro.transitionIn.duration * 0.6)}:d=0.7:alpha=1[c];` +
        `[bg][c]overlay=format=auto,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setsar=1[v]`,
      '-map', '[v]', '-frames:v', String(plan.outro.frames), '-r', String(plan.fps), ...INTERMEDIATE, ...BT709, out],
    { signal },
  );
  return out;
}

const XFADE = { dissolve: 'fade', dip: 'fadeblack' };

/**
 * @returns {Promise<{file, poster, duration}>}
 */
export async function renderDeliverable({ plan, project, brand, clipsById, settings, workDir, cacheDir, outFile, onProgress, signal }) {
  await fs.mkdir(workDir, { recursive: true });
  await fs.mkdir(cacheDir, { recursive: true });
  const { width: W, height: H } = plan.format;
  const fps = plan.fps;

  // Progress budget: conform 65%, titles/outro 5%, assemble 30%.
  const totalSeg = plan.segments.reduce((a, s) => a + s.duration, 0) || 1;
  let doneSeg = 0;
  const report = (v) => onProgress?.(Math.max(0, Math.min(1, v)));

  const inputs = [];
  for (const seg of plan.segments) {
    const clip = clipsById[seg.clipId];
    const file = await conformSegment({
      seg, clip, plan, settings, cacheDir, signal,
      onProgress: (p) => report(((doneSeg + p * seg.duration) / totalSeg) * 0.65),
    });
    doneSeg += seg.duration;
    inputs.push({ file, ...seg });
  }

  if (plan.outro) {
    const last = inputs[inputs.length - 1];
    const file = await buildOutroSegment({ lastFile: last.file, lastFrames: last.frames, plan, project, brand, workDir, signal });
    inputs.push({ file, start: plan.outro.start, duration: plan.outro.duration, frames: plan.outro.frames, transitionIn: plan.outro.transitionIn });
  }

  const intro = await renderIntroCard({
    dir: path.join(workDir, 'intro'), width: W, height: H, project, brand, serif: plan.style.titleFont === 'serif',
  });
  report(0.7);

  // ---- Assemble ----
  const args = [];
  inputs.forEach((inp) => args.push('-i', inp.file));
  const introIdx = inputs.length;
  const introEnd = plan.intro.end;
  args.push('-loop', '1', '-framerate', String(fps), '-t', String(introEnd + 0.2), '-i', intro);
  const musicIdx = introIdx + 1;
  const T = plan.total;
  if (plan.music && project.music?.file) {
    const needLoop = (project.music.analysis?.duration || 0) - plan.music.start < T + 0.5;
    if (needLoop) args.push('-stream_loop', '-1');
    args.push('-ss', String(plan.music.start), '-i', project.music.file);
  } else {
    args.push('-f', 'lavfi', '-t', String(T), '-i', 'anullsrc=r=48000:cl=stereo');
  }

  const parts = [];
  inputs.forEach((_, i) => parts.push(`[${i}:v]settb=AVTB,setpts=PTS-STARTPTS,fps=${fps},format=yuv420p[s${i}]`));
  let last = 's0';
  const allCuts = inputs.slice(1).every((inp) => !inp.transitionIn?.duration);
  if (inputs.length === 1) {
    last = 's0';
  } else if (allCuts) {
    parts.push(`${inputs.map((_, i) => `[s${i}]`).join('')}concat=n=${inputs.length}:v=1:a=0[cat]`);
    last = 'cat';
  } else {
    for (let i = 1; i < inputs.length; i++) {
      const tr = inputs[i].transitionIn || { type: 'cut', duration: 0 };
      const d = tr.duration > 0 ? tr.duration : 1 / fps;
      const type = XFADE[tr.type] || 'fade';
      const offset = Math.max(0, inputs[i].start);
      parts.push(`[${last}][s${i}]xfade=transition=${type}:duration=${num(d)}:offset=${num(offset)}[x${i}]`);
      last = `x${i}`;
    }
  }
  // Intro title: fade + a short eased rise.
  const inAt = plan.intro.start;
  const outAt = Math.max(inAt + 1.5, introEnd - 0.7);
  parts.push(
    `[${introIdx}:v]format=rgba,fade=t=in:st=${num(inAt)}:d=0.8:alpha=1,fade=t=out:st=${num(outAt)}:d=0.7:alpha=1[ti]`,
    `[${last}][ti]overlay=x=0:y='if(lt(t\\,${num(inAt)})\\,${Math.round(18 * H / 1080)}\\,${Math.round(18 * H / 1080)}*pow(max(0\\,1-(t-${num(inAt)})/1.0)\\,3))':eval=frame:eof_action=pass:format=auto[vt]`,
    `[vt]scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,trim=duration=${num(T)},fade=t=in:st=0:d=0.5,fade=t=out:st=${num(Math.max(0, T - 0.9))}:d=0.9,setsar=1[vout]`,
  );
  if (plan.music && project.music?.file) {
    parts.push(
      `[${musicIdx}:a]atrim=duration=${num(T)},asetpts=N/SR/TB,afade=t=in:d=0.3,afade=t=out:st=${num(Math.max(0, T - 3))}:d=3,` +
        `loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,aformat=channel_layouts=stereo[aout]`,
    );
  } else {
    parts.push(`[${musicIdx}:a]atrim=duration=${num(T)}[aout]`);
  }

  const level = H >= 2160 || W >= 2160 ? '5.1' : '4.2';
  const tmp = `${outFile}.part.mp4`;
  await runFFmpeg(
    [...args,
      '-filter_complex', parts.join(';'),
      '-map', '[vout]', '-map', '[aout]',
      '-c:v', 'libx264', '-preset', preset(), '-crf', '18', '-profile:v', 'high', '-level:v', level,
      '-pix_fmt', 'yuv420p', '-r', String(fps), '-g', String(fps * 2), ...BT709,
      '-c:a', 'aac', '-b:a', '256k', '-ar', '48000',
      '-movflags', '+faststart', '-t', num(T), tmp],
    { expectedDuration: T, onProgress: (p) => report(0.7 + p * 0.29), signal },
  );
  await fs.rename(tmp, outFile);

  const poster = outFile.replace(/\.mp4$/, '.jpg');
  const posterAt = plan.segments[Math.min(1, plan.segments.length - 1)]?.start + 1 || 1;
  await runFFmpeg(['-ss', num(Math.min(posterAt, T - 0.5)), '-i', outFile, '-frames:v', '1', '-q:v', '3', '-vf', `scale=${W > H ? 960 : 540}:-2`, poster], { signal });
  report(1);
  return { file: outFile, poster, duration: T };
}
