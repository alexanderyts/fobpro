// Shared filter fragments. Everything downstream of `toSdr` assumes BT.709 SDR.

const MATRIX_MAP = {
  bt709: 'bt709',
  bt470bg: 'bt601',
  smpte170m: 'smpte170m',
  bt2020nc: 'bt2020',
  bt2020c: 'bt2020',
  smpte240m: 'smpte240m',
  fcc: 'fcc',
};

/** Tone-map HLG / PQ footage (iPhone HDR, some drones) down to BT.709 SDR. */
export function toSdr(meta) {
  if (!meta.hdr) return null;
  return [
    'zscale=t=linear:npl=100',
    'format=gbrpf32le',
    'zscale=p=bt709',
    'tonemap=tonemap=hable:desat=0',
    'zscale=t=bt709:m=bt709:r=tv',
    'format=yuv420p',
  ].join(',');
}

/** The YUV matrix a decoded frame is in (after optional tone-mapping). */
export function sourceMatrix(meta) {
  if (meta.hdr) return 'bt709';
  if (meta.colorSpace && MATRIX_MAP[meta.colorSpace]) return MATRIX_MAP[meta.colorSpace];
  return meta.height >= 720 || meta.width >= 1280 ? 'bt709' : 'bt601';
}

/** Explicit YUV→RGB conversion so untagged footage isn't decoded with the BT.601 default. */
export function toRgb(meta, { w = -1, h = -1, pixFmt = 'gbrp' } = {}) {
  const size = w === -1 && h === -1 ? '' : `${w}:${h}:`;
  return `scale=${size}flags=bicubic:in_color_matrix=${sourceMatrix(meta)},format=${pixFmt}`;
}

/** Chain of filters that normalises any clip to SDR, joined with commas. */
export function chain(...parts) {
  return parts.filter(Boolean).join(',');
}
