/**
 * Convert the supplied Illustrator EPS's native solid vector paths to SVG.
 * The artwork is preserved as paths; raster reflection effects and title text
 * are outside the cropped skyline viewBox. This is not an EPS interpreter.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const input = path.join(root, 'exports/welcome-reference/manila_color.eps');
const output = path.join(root, 'public/welcome/manila-skyline.svg');
const eps = await fs.readFile(input, 'latin1');
const lines = eps.split('%%EndPageSetup')[1].split('%%PageTrailer')[0].split(/\r\n|\r|\n/);
const paths = [];
let commands = [];
let fill = '#000000';
let coordinates = [];
let firstRaster = false;

for (const raw of lines) {
  const line = raw.trim();
  if (line === 'img') { firstRaster = true; break; }
  const match = line.match(/^([\d.\s-]+)\s+(mo|li|cv|cmyk)$/);
  if (match) {
    const numbers = match[1].trim().split(/\s+/).map(Number);
    const op = match[2];
    if (op === 'cmyk') {
      const [c,m,y,k] = numbers;
      fill = '#' + [c,m,y].map(v => Math.round(255 * (1-v) * (1-k)).toString(16).padStart(2,'0')).join('');
    } else {
      commands.push(`${{mo:'M',li:'L',cv:'C'}[op]}${numbers.join(' ')}`);
      coordinates.push(...numbers);
    }
  } else if (line === 'cp') {
    commands.push('Z');
  } else if (line === 'f') {
    if (commands.length) {
      const ys = coordinates.filter((_,i) => i % 2 === 1);
      paths.push({ d: commands.join(''), fill, minY: Math.min(...ys), maxY: Math.max(...ys) });
    }
    commands = [];
    coordinates = [];
  } else if (line === 'np' || line === 'clp' || line === 'eclp') {
    commands = [];
    coordinates = [];
  }
}

if (!firstRaster || paths.length < 100) throw new Error('Unexpected EPS shape; inspect source before converting.');
const skyline = paths.filter(p => p.minY >= 223.5);
const height = 165.531;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 10 558.023 ${height - 10}" role="img" aria-labelledby="skyline-title"><title id="skyline-title">Manila skyline from the supplied original illustration</title><g transform="translate(0 389.031) scale(1 -1)">${skyline.map(p => `<path fill="${p.fill}" d="${p.d}"/>`).join('')}</g></svg>\n`;
await fs.writeFile(output, svg);
await sharp(Buffer.from(svg)).resize({width:1800}).png().toFile(path.join(root,'exports/welcome-reference/skyline-vector-preview.png'));
console.log(JSON.stringify({output,allSolidPaths:paths.length,skylinePaths:skyline.length,viewBox:[0,10,558.023,height-10]},null,2));
