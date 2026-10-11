// Procedural placeholder unit badges (GDD 36: full-color unit icon badges), drawn from the unit's
// geometric shape on a 256x256 canvas until production art exists.

const cache = new Map();

export function unitIconCanvas(defId, visual, side) {
  const key = `${defId}|${side}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const color = `#${visual.color.toString(16).padStart(6, '0')}`;

  const bg = g.createRadialGradient(128, 128, 10, 128, 128, 190);
  bg.addColorStop(0, mix(color, 0.35));
  bg.addColorStop(1, '#03050c');
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 256);

  // Blueprint grid.
  g.strokeStyle = color;
  g.globalAlpha = 0.12;
  g.lineWidth = 1;
  for (let i = 16; i < 256; i += 24) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 256);
    g.moveTo(0, i);
    g.lineTo(256, i);
    g.stroke();
  }
  g.globalAlpha = 1;

  const facing = side === 'player' ? -Math.PI / 2 : Math.PI / 2;
  const outer = polygon(visual.shape, 92, facing);
  const inner = polygon(visual.shape, 52, facing);

  g.save();
  g.shadowColor = color;
  g.shadowBlur = 28;
  path(g, outer);
  g.fillStyle = mix(color, 0.25);
  g.fill();
  g.lineWidth = 10;
  g.strokeStyle = color;
  g.stroke();
  g.restore();

  // Panel lines from the corners to the core.
  g.strokeStyle = color;
  g.globalAlpha = 0.5;
  g.lineWidth = 3;
  for (let i = 0; i < outer.length; i++) {
    g.beginPath();
    g.moveTo(outer[i][0], outer[i][1]);
    g.lineTo(inner[i][0], inner[i][1]);
    g.stroke();
  }
  g.globalAlpha = 1;
  path(g, inner);
  g.lineWidth = 4;
  g.stroke();

  g.save();
  g.shadowColor = '#ffffff';
  g.shadowBlur = 20;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(128, 128, 12, 0, Math.PI * 2);
  g.fill();
  g.restore();

  cache.set(key, c);
  return c;
}

function polygon(shape, r, facing) {
  const regular = (n, rot, scaleX = 1) =>
    Array.from({ length: n }, (_, i) => {
      const a = rot + (i / n) * Math.PI * 2;
      return [128 + Math.cos(a) * r * scaleX, 128 + Math.sin(a) * r];
    });
  switch (shape) {
    case 'hexagon':
      return regular(6, 0);
    case 'triangle':
      return regular(3, facing);
    case 'diamond':
      return regular(4, Math.PI / 2, 0.7);
    case 'square':
      return regular(4, Math.PI / 4);
    case 'pentagon':
      return regular(5, facing);
    case 'star':
      return regular(10, facing).map(([x, y], i) => (i % 2 ? [128 + (x - 128) * 0.45, 128 + (y - 128) * 0.45] : [x, y]));
    default:
      return regular(24, 0);
  }
}

function path(g, pts) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
}

// Darkens a #rrggbb color toward black by amount (0..1 keeps that fraction of the color).
function mix(hex, keep) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s) => Math.round(((n >> s) & 255) * keep);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
