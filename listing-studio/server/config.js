import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');

export const config = {
  port: Number(process.env.PORT || 4310),
  host: process.env.HOST || '127.0.0.1',
  dataDir: path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data')),
  ffmpeg: process.env.FFMPEG_PATH || 'ffmpeg',
  ffprobe: process.env.FFPROBE_PATH || 'ffprobe',
  // Number of clips analysed in parallel. Renders always run one at a time:
  // x264 already uses every core, so parallel renders only add contention.
  analysisConcurrency: Number(process.env.ANALYSIS_CONCURRENCY || 2),
  // Room labelling uses Claude vision when credentials are present; otherwise
  // the app falls back to metadata + capture-order heuristics.
  classifyModel: process.env.CLASSIFY_MODEL || 'claude-opus-5-5',
  classifyEnabled: process.env.CLASSIFY !== 'off',
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB || 8192) * 1024 * 1024,
};

export const FONTS = {
  sansRegular: path.join(ROOT, 'assets/fonts/PlexSans-400.ttf'),
  sansMedium: path.join(ROOT, 'assets/fonts/PlexSans-500.ttf'),
  sansSemibold: path.join(ROOT, 'assets/fonts/PlexSans-600.ttf'),
  serif: path.join(ROOT, 'assets/fonts/Cormorant-600.ttf'),
};
