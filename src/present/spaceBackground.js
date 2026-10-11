// Procedural space backdrop painted once on a canvas: nebula clouds, a dense starfield, a few
// glinting bright stars and a distant planet. Seeded so it looks the same every load.
import { createRng } from '../sim/rng.js';

const NEBULA_COLORS = ['rgba(90,40,160,', 'rgba(20,90,150,', 'rgba(160,30,90,', 'rgba(30,130,130,'];

export function paintSpaceBackground(size = 1024, seed = 4242) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const rng = createRng(seed);
  const r = (lo, hi) => lo + (hi - lo) * rng.next();

  const base = g.createLinearGradient(0, 0, size, size);
  base.addColorStop(0, '#04030c');
  base.addColorStop(0.5, '#070a18');
  base.addColorStop(1, '#02040a');
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);

  // Nebula: clusters of soft blobs along a few drifting bands.
  g.globalCompositeOperation = 'lighter';
  for (let band = 0; band < 4; band++) {
    const color = NEBULA_COLORS[band % NEBULA_COLORS.length];
    let x = r(0, size);
    let y = r(0, size);
    const angle = r(0, Math.PI * 2);
    for (let i = 0; i < 26; i++) {
      x += Math.cos(angle + r(-0.6, 0.6)) * size * 0.04;
      y += Math.sin(angle + r(-0.6, 0.6)) * size * 0.04;
      const radius = r(0.06, 0.2) * size;
      const blob = g.createRadialGradient(x, y, 0, x, y, radius);
      blob.addColorStop(0, `${color}${r(0.05, 0.11).toFixed(3)})`);
      blob.addColorStop(1, `${color}0)`);
      g.fillStyle = blob;
      g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  }

  // Starfield: many faint points, fewer bright ones.
  for (let i = 0; i < 2600; i++) {
    const a = Math.pow(rng.next(), 3) * 0.9 + 0.08;
    const tint = rng.next();
    g.fillStyle = tint < 0.15 ? `rgba(255,210,170,${a})` : tint < 0.35 ? `rgba(170,200,255,${a})` : `rgba(235,240,255,${a})`;
    const s = rng.next() < 0.03 ? 2 : 1;
    g.fillRect(r(0, size), r(0, size), s, s);
  }

  // Bright stars with a glow and cross glint.
  for (let i = 0; i < 18; i++) {
    const x = r(0, size);
    const y = r(0, size);
    const glow = g.createRadialGradient(x, y, 0, x, y, 10);
    glow.addColorStop(0, 'rgba(255,255,255,0.9)');
    glow.addColorStop(1, 'rgba(160,200,255,0)');
    g.fillStyle = glow;
    g.fillRect(x - 10, y - 10, 20, 20);
    g.strokeStyle = 'rgba(200,225,255,0.35)';
    g.lineWidth = 1;
    const len = r(8, 18);
    g.beginPath();
    g.moveTo(x - len, y);
    g.lineTo(x + len, y);
    g.moveTo(x, y - len);
    g.lineTo(x, y + len);
    g.stroke();
  }

  // Distant planet in the lower-left corner with an atmosphere rim.
  g.globalCompositeOperation = 'source-over';
  const px = size * 0.12;
  const py = size * 0.9;
  const pr = size * 0.3;
  const body = g.createRadialGradient(px + pr * 0.35, py - pr * 0.35, pr * 0.1, px, py, pr);
  body.addColorStop(0, '#2a3f66');
  body.addColorStop(0.7, '#0e1a33');
  body.addColorStop(1, '#060b18');
  g.fillStyle = body;
  g.beginPath();
  g.arc(px, py, pr, 0, Math.PI * 2);
  g.fill();
  g.globalCompositeOperation = 'lighter';
  const rim = g.createRadialGradient(px, py, pr * 0.92, px, py, pr * 1.08);
  rim.addColorStop(0, 'rgba(60,160,255,0)');
  rim.addColorStop(0.5, 'rgba(60,170,255,0.35)');
  rim.addColorStop(1, 'rgba(60,160,255,0)');
  g.fillStyle = rim;
  g.beginPath();
  g.arc(px, py, pr * 1.08, 0, Math.PI * 2);
  g.fill();
  g.globalCompositeOperation = 'source-over';
  return c;
}
