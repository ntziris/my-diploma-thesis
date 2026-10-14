export interface SniffResult {
  kind: 'pdf' | 'image' | 'other';
  mime: string;
  ext: string;
}

export function sniff(bytes: Uint8Array): SniffResult {
  const head = Array.from(bytes.slice(0, 4));
  if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46)
    return { kind: 'pdf', mime: 'application/pdf', ext: 'pdf' }; // %PDF
  if (head[0] === 0xff && head[1] === 0xd8)
    return { kind: 'image', mime: 'image/jpeg', ext: 'jpg' };
  if (head[0] === 0x89 && head[1] === 0x50) return { kind: 'image', mime: 'image/png', ext: 'png' };
  if (head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46)
    return { kind: 'image', mime: 'image/webp', ext: 'webp' }; // RIFF
  return { kind: 'other', mime: 'application/octet-stream', ext: 'bin' };
}
