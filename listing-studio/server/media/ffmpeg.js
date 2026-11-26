import { spawn } from 'node:child_process';
import { config } from '../config.js';

export class FFmpegError extends Error {
  constructor(message, { args, stderr, code } = {}) {
    super(message);
    this.name = 'FFmpegError';
    this.args = args;
    this.stderr = stderr;
    this.code = code;
  }
}

/**
 * Run ffmpeg. Progress is read from `-progress pipe:1`; `expectedDuration`
 * (seconds of output) turns it into a 0..1 fraction for `onProgress`.
 */
export function runFFmpeg(args, { expectedDuration, onProgress, signal, stdout } = {}) {
  const full = ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error'];
  if (onProgress && !stdout) full.push('-progress', 'pipe:1', '-nostats');
  full.push(...args);

  return new Promise((resolve, reject) => {
    const child = spawn(config.ffmpeg, full, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let buf = '';
    const chunks = [];

    const abort = () => child.kill('SIGKILL');
    signal?.addEventListener('abort', abort, { once: true });

    child.stdout.on('data', (d) => {
      if (stdout) {
        chunks.push(d);
        return;
      }
      if (!onProgress) return;
      buf += d.toString();
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (line.startsWith('out_time_us=') || line.startsWith('out_time_ms=')) {
          const us = Number(line.split('=')[1]);
          if (Number.isFinite(us) && expectedDuration > 0) {
            onProgress(Math.max(0, Math.min(1, us / 1e6 / expectedDuration)));
          }
        } else if (line === 'progress=end') {
          onProgress(1);
        }
      }
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > 16000) stderr = stderr.slice(-16000);
    });
    child.on('error', (err) => {
      signal?.removeEventListener('abort', abort);
      reject(new FFmpegError(`Could not start ffmpeg: ${err.message}`, { args: full }));
    });
    child.on('close', (code) => {
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) return reject(new FFmpegError('Cancelled', { args: full, code }));
      if (code !== 0) {
        const last = stderr.trim().split('\n').slice(-6).join('\n');
        return reject(new FFmpegError(`ffmpeg exited with code ${code}: ${last}`, { args: full, stderr, code }));
      }
      resolve(stdout ? Buffer.concat(chunks) : undefined);
    });
  });
}

export function runFFprobe(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(config.ffprobe, ['-v', 'error', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    let err = '';
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => (err += d.toString()));
    child.on('error', (e) => reject(new FFmpegError(`Could not start ffprobe: ${e.message}`)));
    child.on('close', (code) => {
      if (code !== 0) return reject(new FFmpegError(`ffprobe failed: ${err.trim()}`));
      resolve(Buffer.concat(out).toString());
    });
  });
}

/** Escape a value for use inside an ffmpeg filtergraph option (e.g. a file path). */
export function escapeFilterValue(v) {
  return String(v).replace(/\\/g, '/').replace(/'/g, "\\'").replace(/:/g, '\\:').replace(/,/g, '\\,');
}

export function num(v, digits = 4) {
  return Number(v.toFixed(digits)).toString();
}

const REQUIRED_FILTERS = ['vidstabdetect', 'vidstabtransform', 'zscale', 'xfade', 'loudnorm', 'drawtext', 'curves', 'vibrance', 'colorchannelmixer', 'gblur'];

/** Check the installed ffmpeg has every filter the pipeline uses. */
export async function checkFFmpeg() {
  const run = (args) =>
    new Promise((resolve) => {
      const child = spawn(config.ffmpeg, ['-hide_banner', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (out += d));
      child.on('error', () => resolve(null));
      child.on('close', () => resolve(out));
    });
  const version = await run(['-version']);
  if (version === null) return { ok: false, version: null, missing: ['ffmpeg'], pchip: false };
  const filters = (await run(['-filters'])) || '';
  const have = new Set([...filters.matchAll(/^\s*[.A-Z|]{2,3}\s+(\w+)\s/gm)].map((m) => m[1]));
  const missing = REQUIRED_FILTERS.filter((f) => !have.has(f));
  const curvesHelp = (await run(['-h', 'filter=curves'])) || '';
  return {
    ok: missing.length === 0,
    version: (version.match(/ffmpeg version (\S+)/) || [])[1] || 'unknown',
    missing,
    pchip: /\binterp\b/.test(curvesHelp),
  };
}
