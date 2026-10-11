// Procedural anime-style placeholder portraits, drawn on a 256x256 canvas until production art exists.
// spec: { id, skin, hair, hairStyle, eyes, suit, accent, bg, mask?, helmet?, scar?, headset?, blush? }
// hairStyle: short | spiky | bob | long | ponytail.  mood: neutral | happy | angry | hurt | shout.

const canvasCache = new Map();
const urlCache = new Map();

export function portraitCanvas(spec, mood = 'neutral', size = 256) {
  const key = `${spec.id}|${mood}|${size}`;
  let c = canvasCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.scale(size / 256, size / 256);
    drawPortrait(g, spec, mood);
    canvasCache.set(key, c);
  }
  return c;
}

export function portraitUrl(spec, mood = 'neutral') {
  const key = `${spec.id}|${mood}`;
  if (!urlCache.has(key)) urlCache.set(key, portraitCanvas(spec, mood, 256).toDataURL());
  return urlCache.get(key);
}

export function drawPortrait(g, p, mood) {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  background(g, p);
  if (p.hairStyle === 'long' || p.hairStyle === 'ponytail') hairBack(g, p);
  body(g, p);
  if (p.helmet) {
    helmet(g, p);
  } else {
    face(g, p);
    if (p.mask === 'visor') visor(g, p);
    else eyes(g, p, mood);
    brows(g, p, mood);
    nose(g, p);
    mouth(g, mood);
    if (p.blush) blush(g);
    if (p.scar) scar(g);
    hairFront(g, p);
    if (p.headset) headset(g, p);
  }
  if (mood === 'hurt') sweat(g);
  vignette(g);
}

// ---- Parts ----

function background(g, p) {
  const grd = g.createRadialGradient(128, 110, 10, 128, 128, 190);
  grd.addColorStop(0, p.bg);
  grd.addColorStop(1, '#05070d');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  // Radial speed lines.
  g.save();
  g.globalAlpha = 0.16;
  g.strokeStyle = p.accent;
  g.lineWidth = 3;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.2;
    g.beginPath();
    g.moveTo(128 + Math.cos(a) * 96, 128 + Math.sin(a) * 96);
    g.lineTo(128 + Math.cos(a) * 200, 128 + Math.sin(a) * 200);
    g.stroke();
  }
  g.restore();
}

function hairBack(g, p) {
  g.fillStyle = shade(p.hair, -0.28);
  g.beginPath();
  if (p.hairStyle === 'long') {
    g.moveTo(62, 100);
    g.bezierCurveTo(38, 170, 44, 236, 64, 256);
    g.lineTo(192, 256);
    g.bezierCurveTo(212, 236, 218, 170, 194, 100);
    g.closePath();
  } else {
    g.ellipse(200, 150, 24, 72, -0.35, 0, Math.PI * 2);
  }
  g.fill();
}

function body(g, p) {
  // Helmeted pilots have no visible skin, so no neck.
  if (p.skin) {
    g.fillStyle = shade(p.skin, -0.2);
    g.fillRect(112, 166, 32, 44);
  }
  g.fillStyle = p.suit;
  g.beginPath();
  g.moveTo(22, 256);
  g.bezierCurveTo(28, 214, 80, 198, 128, 200);
  g.bezierCurveTo(176, 198, 228, 214, 234, 256);
  g.closePath();
  g.fill();
  g.fillStyle = shade(p.suit, 0.18);
  for (const x of [54, 202]) {
    g.beginPath();
    g.ellipse(x, 238, 30, 17, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = p.accent;
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(96, 204);
  g.lineTo(128, 232);
  g.lineTo(160, 204);
  g.stroke();
}

function face(g, p) {
  g.fillStyle = p.skin;
  for (const x of [80, 176]) {
    g.beginPath();
    g.ellipse(x, 130, 7, 12, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.beginPath();
  g.moveTo(80, 100);
  g.bezierCurveTo(78, 142, 94, 168, 128, 190);
  g.bezierCurveTo(162, 168, 178, 142, 176, 100);
  g.bezierCurveTo(176, 58, 80, 58, 80, 100);
  g.closePath();
  g.fill();
  g.strokeStyle = shade(p.skin, -0.45);
  g.lineWidth = 2;
  g.stroke();
}

function eyes(g, p, mood) {
  for (const [cx, dir] of [
    [106, -1],
    [150, 1],
  ]) {
    if (mood === 'happy') {
      g.strokeStyle = '#1a1020';
      g.lineWidth = 4.5;
      g.beginPath();
      g.arc(cx, 138, 11, Math.PI * 1.15, Math.PI * 1.85);
      g.stroke();
      continue;
    }
    const squint = mood === 'hurt' && dir === 1 ? 0.4 : mood === 'angry' || mood === 'shout' ? 0.75 : 1;
    const cy = 132;
    const rx = 13;
    const ry = 15 * squint;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
    g.save();
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    g.clip();
    const ig = g.createLinearGradient(cx, cy - 13, cx, cy + 15);
    ig.addColorStop(0, shade(p.eyes, -0.55));
    ig.addColorStop(1, shade(p.eyes, 0.35));
    g.fillStyle = ig;
    g.beginPath();
    g.ellipse(cx + dir, cy + 2, 9, 13, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#0b0710';
    g.beginPath();
    g.ellipse(cx + dir, cy + 3, 4, 7, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    circle(g, cx - 4, cy - 5, 3.5);
    circle(g, cx + 4, cy + 6, 1.8);
    g.restore();
    g.strokeStyle = '#1a1020';
    g.lineWidth = 4.5;
    g.beginPath();
    g.ellipse(cx, cy, rx + 1, ry + 1, 0, Math.PI * 1.05, Math.PI * 1.95);
    g.stroke();
    const ox = cx + dir * (rx + 1);
    g.beginPath();
    g.moveTo(ox, cy - ry * 0.35);
    g.lineTo(ox + dir * 6, cy - ry * 0.65 - 2);
    g.stroke();
  }
}

function visor(g, p) {
  g.fillStyle = '#12060a';
  roundRect(g, 72, 114, 112, 36, 12);
  g.fill();
  g.save();
  g.shadowColor = p.accent;
  g.shadowBlur = 16;
  g.fillStyle = p.accent;
  roundRect(g, 84, 128, 88, 8, 4);
  g.fill();
  g.restore();
}

function helmet(g, p) {
  g.fillStyle = shade(p.suit, 0.12);
  g.beginPath();
  g.ellipse(128, 118, 66, 76, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = shade(p.suit, 0.4);
  g.lineWidth = 3;
  g.stroke();
  g.beginPath();
  g.moveTo(128, 44);
  g.lineTo(128, 100);
  g.stroke();
  g.fillStyle = '#0a0306';
  roundRect(g, 74, 108, 108, 42, 16);
  g.fill();
  g.save();
  g.shadowColor = p.accent;
  g.shadowBlur = 18;
  g.fillStyle = p.accent;
  for (const x of [104, 152]) circle(g, x, 129, 7);
  g.restore();
}

function brows(g, p, mood) {
  const tilt = mood === 'angry' || mood === 'shout' ? 6 : mood === 'hurt' ? -5 : 0;
  g.strokeStyle = shade(p.hair, -0.4);
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(93, 108);
  g.lineTo(118, 108 + tilt);
  g.moveTo(138, 108 + tilt);
  g.lineTo(163, 108);
  g.stroke();
}

function nose(g, p) {
  g.strokeStyle = shade(p.skin, -0.35);
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(128, 148);
  g.lineTo(125, 156);
  g.lineTo(129, 157);
  g.stroke();
}

function mouth(g, mood) {
  g.strokeStyle = '#5a1e2a';
  g.fillStyle = '#7a2434';
  g.lineWidth = 2.5;
  g.beginPath();
  switch (mood) {
    case 'happy':
      g.moveTo(115, 165);
      g.quadraticCurveTo(128, 184, 141, 165);
      g.closePath();
      g.fill();
      g.fillStyle = '#ffffff';
      g.fillRect(119, 165, 18, 3);
      return;
    case 'shout':
      g.ellipse(128, 171, 7, 10, 0, 0, Math.PI * 2);
      g.fill();
      return;
    case 'angry':
      g.moveTo(119, 171);
      g.quadraticCurveTo(128, 165, 137, 171);
      break;
    case 'hurt':
      g.moveTo(118, 170);
      g.quadraticCurveTo(123, 165, 128, 170);
      g.quadraticCurveTo(133, 175, 138, 170);
      break;
    default:
      g.moveTo(121, 168);
      g.quadraticCurveTo(128, 172, 135, 168);
  }
  g.stroke();
}

function blush(g) {
  g.save();
  g.globalAlpha = 0.35;
  g.fillStyle = '#ff7a9a';
  for (const x of [100, 156]) {
    g.beginPath();
    g.ellipse(x, 154, 10, 4, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

function scar(g) {
  g.strokeStyle = '#b4545a';
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(150, 142);
  g.lineTo(166, 164);
  g.moveTo(153, 152);
  g.lineTo(160, 148);
  g.moveTo(158, 159);
  g.lineTo(165, 155);
  g.stroke();
}

const BANGS = {
  default: [[178, 108], [166, 90], [156, 104], [146, 86], [136, 102], [124, 84], [114, 102], [102, 88], [92, 106], [82, 94], [76, 118]],
  short: [[180, 100], [168, 88], [156, 98], [144, 86], [132, 96], [120, 84], [108, 96], [96, 86], [84, 100], [76, 112]],
};

function hairFront(g, p) {
  const style = p.hairStyle;
  g.fillStyle = p.hair;
  g.strokeStyle = shade(p.hair, -0.35);
  g.lineWidth = 2;
  if (style === 'bob' || style === 'long' || style === 'ponytail') {
    const bottom = style === 'bob' ? 180 : style === 'long' ? 216 : 162;
    lock(g, 78, bottom, -1);
    lock(g, 178, bottom, 1);
  }
  if (style === 'spiky') {
    g.beginPath();
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI + (i / 12) * Math.PI;
      const r = i % 2 ? 50 : 82;
      g.lineTo(128 + Math.cos(a) * r * 1.15, 92 + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    g.stroke();
  }
  g.beginPath();
  g.moveTo(72, 124);
  g.bezierCurveTo(60, 50, 100, 26, 128, 26);
  g.bezierCurveTo(156, 26, 196, 50, 184, 124);
  for (const [x, y] of style === 'short' ? BANGS.short : BANGS.default) g.lineTo(x, y);
  g.closePath();
  g.fill();
  g.stroke();
  g.save();
  g.globalAlpha = 0.7;
  g.strokeStyle = shade(p.hair, 0.5);
  g.lineWidth = 5;
  g.beginPath();
  g.arc(128, 82, 40, Math.PI * 1.15, Math.PI * 1.6);
  g.stroke();
  g.restore();
}

function lock(g, x, bottom, dir) {
  g.beginPath();
  g.moveTo(x - 12, 98);
  g.quadraticCurveTo(x - 15, (98 + bottom) / 2, x + dir * 4, bottom);
  g.quadraticCurveTo(x + 15, (98 + bottom) / 2, x + 12, 98);
  g.closePath();
  g.fill();
  g.stroke();
}

function headset(g, p) {
  g.strokeStyle = '#2a3340';
  g.lineWidth = 7;
  g.beginPath();
  g.arc(128, 104, 62, Math.PI * 1.08, Math.PI * 1.92);
  g.stroke();
  g.fillStyle = '#2a3340';
  roundRect(g, 62, 112, 18, 34, 6);
  g.fill();
  g.fillStyle = p.accent;
  g.fillRect(66, 122, 10, 4);
  g.strokeStyle = '#2a3340';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(72, 142);
  g.quadraticCurveTo(80, 178, 110, 176);
  g.stroke();
  g.fillStyle = p.accent;
  circle(g, 112, 176, 3.5);
}

function sweat(g) {
  g.fillStyle = '#9fdcff';
  g.beginPath();
  g.moveTo(182, 92);
  g.quadraticCurveTo(190, 106, 182, 110);
  g.quadraticCurveTo(174, 106, 182, 92);
  g.fill();
}

function vignette(g) {
  const v = g.createRadialGradient(128, 128, 90, 128, 128, 182);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = v;
  g.fillRect(0, 0, 256, 256);
}

// ---- Helpers ----

function circle(g, x, y, r) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// Mixes a #rrggbb color toward white (amount > 0) or black (amount < 0).
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  const r = mix((n >> 16) & 255);
  const gr = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `rgb(${r},${gr},${b})`;
}
