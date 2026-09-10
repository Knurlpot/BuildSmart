// Emits geometry and reveal order from the existing sign-up assets; no files overwritten.
// Usage: node scripts/generate-logo-bricks.mjs [--svg]
import fs from 'node:fs';
const frames = Array.from({ length: 14 }, (_, index) => {
  const svg = fs.readFileSync(new URL(`../components/logo-frames/Field ${index}.svg`, import.meta.url), 'utf8');
  return [...svg.matchAll(/<path\b([^>]*)\/>/g)].map(([, attributes]) => ({
    d: attributes.match(/\bd="([^"]+)"/)[1],
    fill: attributes.match(/\bfill="([^"]+)"/)[1],
    opacity: Number(attributes.match(/\bopacity="([^"]+)"/)?.[1] ?? 1),
  }));
});
if (frames.some(frame => frame.length !== 72)) throw new Error('Unexpected sign-up logo structure');
const bricks = frames[13].map((path, sourceIndex) => {
  if (frames.some(frame => frame[sourceIndex].d !== path.d || frame[sourceIndex].fill !== path.fill)) throw new Error(`Geometry changed in frame at brick ${sourceIndex}`);
  return { d: path.d, fill: path.fill, sourceIndex, stage: frames.findIndex(frame => frame[sourceIndex].opacity === 1) };
});
const order = [...bricks].sort((a, b) => a.stage - b.stage || a.sourceIndex - b.sourceIndex);
const mapped = bricks.map(brick => ({ ...brick, order: order.indexOf(brick) }));
if (process.argv.includes('--svg')) {
  const rules = mapped.map(brick => {
    const start = 4 + brick.order * 0.43;
    return `@keyframes brick${brick.sourceIndex}{0%,${start.toFixed(2)}%{opacity:0;transform:translateY(-12px)}${(start + 4.5).toFixed(2)}%,74%{opacity:1;transform:translateY(0)}86%,100%{opacity:0;transform:translateY(0)}}`;
  }).join('\n');
  const paths = mapped.map(brick => `<path d="${brick.d}" fill="${brick.fill}" style="animation:brick${brick.sourceIndex} 12s cubic-bezier(.22,.61,.36,1) infinite"/>`).join('\n');
  process.stdout.write(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 459 490" role="img" aria-label="BuildSmart brick-by-brick logo"><style>\n${rules}\n@media(prefers-reduced-motion:reduce){path{animation:none!important;opacity:1;transform:none}}\n</style>\n${paths}\n</svg>\n`);
} else process.stdout.write(JSON.stringify(mapped, null, 2) + '\n');
