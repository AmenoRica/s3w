// Draw the selected build locally so PNG export also works on static hosting.
export function selectionTotals(slots, gear, subPoints = 3) {
  const points = new Map();
  slots.forEach(row => row.forEach((key, column) => {
    if (key !== 'None' && key !== 'Unknown') points.set(key, (points.get(key) ?? 0) + (column === 0 ? 10 : subPoints));
  }));
  const keys = Object.keys(gear), order = ['Head', 'Clothes', 'Shoes', 'None'];
  return [...points].sort(([a, ap], [b, bp]) =>
    order.indexOf(gear[a].slot) - order.indexOf(gear[b].slot) || bp - ap || keys.indexOf(a) - keys.indexOf(b));
}

export async function selectionImage(state, data, subPoints = 3) {
  const totals = selectionTotals(state.slots, data.gear, subPoints);
  const weapon = state.weapon, slots = state.slots.map(row => row.map(key => key === 'None' ? 'Unknown' : key));
  const paths = new Set([`../assets/Path_Wst_${weapon}.png`, ...slots.flat().map(key => `./icons/${key}.png`)]);
  const images = new Map(await Promise.all([...paths].map(async path => {
    const image = new Image();
    image.src = new URL(path, import.meta.url).href;
    await image.decode();
    return [path, image];
  })));
  const canvas = document.createElement('canvas');
  canvas.width = 1200; canvas.height = 750;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f5f3ed'; ctx.fillRect(0, 0, 1200, 750);
  ctx.fillStyle = '#e4e0d6'; ctx.beginPath(); ctx.roundRect(40, 40, 450, 550, 28); ctx.fill();
  const draw = (image, x, y, size) => {
    const scale = size / Math.max(image.naturalWidth, image.naturalHeight);
    const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
    ctx.drawImage(image, x + (size-width)/2, y + (size-height)/2, width, height);
  };
  draw(images.get(`../assets/Path_Wst_${weapon}.png`), 65, 115, 400);
  ctx.strokeStyle = '#d6d2c8'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(540, 80); ctx.lineTo(540, 550); ctx.stroke();
  slots.forEach((row, r) => row.forEach((key, c) => {
    const x = [645, 800, 925, 1050][c], y = 164+r*151, radius = c === 0 ? 62 : 46;
    ctx.fillStyle = '#292a2c'; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI*2); ctx.fill();
    draw(images.get(`./icons/${key}.png`), x-radius+10, y-radius+10, radius*2-20);
  }));
  ctx.strokeStyle = '#d6d2c8';
  ctx.beginPath(); ctx.moveTo(40, 620); ctx.lineTo(1160, 620); ctx.stroke();
  const cellWidth = Math.min(112, 1120 / Math.max(1, totals.length));
  const left = (1200 - cellWidth * totals.length) / 2;
  ctx.font = '600 26px system-ui, sans-serif'; ctx.textBaseline = 'middle';
  totals.forEach(([key, points], index) => {
    if (data.gear[key].slot !== 'None') {
      const center = left + (index + 0.5) * cellWidth;
      ctx.fillStyle = '#292a2c'; ctx.beginPath(); ctx.arc(center, 682, 31, 0, Math.PI * 2); ctx.fill();
      draw(images.get(`./icons/${key}.png`), center - 25, 657, 50);
      return;
    }
    const x = left + index * cellWidth + (cellWidth - 84) / 2;
    ctx.fillStyle = '#292a2c'; ctx.beginPath(); ctx.arc(x + 22, 682, 25, 0, Math.PI * 2); ctx.fill();
    draw(images.get(`./icons/${key}.png`), x + 2, 662, 40);
    ctx.fillText((points / 10).toFixed(1), x + 52, 683);
  });
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG export failed')), 'image/png'));
}
