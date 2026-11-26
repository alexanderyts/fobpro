import path from 'node:path';
import { runFFprobe } from './ffmpeg.js';

function parseRate(r) {
  if (!r || r === '0/0') return 0;
  const [a, b] = r.split('/').map(Number);
  return b ? a / b : a;
}

function rotationOf(stream) {
  const sd = (stream.side_data_list || []).find((s) => s.rotation !== undefined);
  if (sd) return ((Math.round(Number(sd.rotation)) % 360) + 360) % 360;
  if (stream.tags?.rotate) return ((Number(stream.tags.rotate) % 360) + 360) % 360;
  return 0;
}

function bitDepthOf(stream) {
  if (stream.bits_per_raw_sample) return Number(stream.bits_per_raw_sample);
  const pf = stream.pix_fmt || '';
  if (/p10|p12|10le|12le/.test(pf)) return 10;
  return 8;
}

/**
 * Normalised clip metadata. Width/height are display dimensions (rotation applied),
 * because ffmpeg auto-rotates on decode.
 */
export async function probe(file, originalName = path.basename(file)) {
  const raw = JSON.parse(
    await runFFprobe(['-print_format', 'json', '-show_format', '-show_streams', file]),
  );
  const video = raw.streams.find((s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);
  if (!video) throw new Error('No video stream found in this file.');
  const audio = raw.streams.find((s) => s.codec_type === 'audio');

  const rotation = rotationOf(video);
  const swap = rotation === 90 || rotation === 270;
  const width = swap ? video.height : video.width;
  const height = swap ? video.width : video.height;

  const tags = { ...(raw.format.tags || {}), ...(video.tags || {}) };
  const tagStr = JSON.stringify(tags).toLowerCase();
  const make =
    tags['com.apple.quicktime.make'] || tags.make || tags.Make ||
    (tagStr.includes('dji') ? 'DJI' : undefined);
  const model = tags['com.apple.quicktime.model'] || tags.model || tags.Model;
  const isDrone =
    /dji|skydio|autel|parrot/i.test(`${make || ''} ${model || ''}`) ||
    /^dji_/i.test(originalName) ||
    tagStr.includes('dji');

  const transfer = video.color_transfer || '';
  const hdr = transfer === 'arib-std-b67' ? 'hlg' : transfer === 'smpte2084' ? 'pq' : null;

  const duration = Number(video.duration || raw.format.duration || 0);
  const creation = tags['com.apple.quicktime.creationdate'] || tags.creation_time || null;

  return {
    duration,
    width,
    height,
    codedWidth: video.width,
    codedHeight: video.height,
    rotation,
    fps: parseRate(video.avg_frame_rate) || parseRate(video.r_frame_rate),
    codec: video.codec_name,
    pixFmt: video.pix_fmt,
    bitDepth: bitDepthOf(video),
    colorSpace: video.color_space || null,
    colorTransfer: transfer || null,
    colorPrimaries: video.color_primaries || null,
    hdr,
    hasAudio: Boolean(audio),
    sizeBytes: Number(raw.format.size || 0),
    bitrate: Number(raw.format.bit_rate || 0),
    creationTime: creation,
    make: make || null,
    model: model || null,
    isDrone,
    orientation: width >= height ? 'landscape' : 'portrait',
  };
}

export async function probeAudio(file) {
  const raw = JSON.parse(
    await runFFprobe(['-print_format', 'json', '-show_format', '-show_streams', file]),
  );
  const audio = raw.streams.find((s) => s.codec_type === 'audio');
  if (!audio) throw new Error('No audio stream found in this file.');
  return {
    duration: Number(audio.duration || raw.format.duration || 0),
    codec: audio.codec_name,
    sampleRate: Number(audio.sample_rate),
    channels: audio.channels,
    title: raw.format.tags?.title || null,
    artist: raw.format.tags?.artist || null,
  };
}
