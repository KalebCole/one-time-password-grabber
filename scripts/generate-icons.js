const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const sizes = [16, 48, 128];
const iconsDir = path.join(__dirname, '..', 'icons');

// Ensure icons directory exists
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background - rounded rectangle with gradient
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#4f46e5'); // Indigo
  gradient.addColorStop(1, '#7c3aed'); // Purple

  // Draw rounded background
  const radius = size * 0.2;
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(size - radius, 0);
  ctx.quadraticCurveTo(size, 0, size, radius);
  ctx.lineTo(size, size - radius);
  ctx.quadraticCurveTo(size, size, size - radius, size);
  ctx.lineTo(radius, size);
  ctx.quadraticCurveTo(0, size, 0, size - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Draw "V" for verification
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${size * 0.55}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('V', size / 2, size / 2 + size * 0.02);

  // Add a small checkmark accent
  ctx.strokeStyle = '#4ade80'; // Green
  ctx.lineWidth = size * 0.08;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Checkmark position (bottom right)
  const checkSize = size * 0.25;
  const checkX = size * 0.72;
  const checkY = size * 0.72;

  ctx.beginPath();
  ctx.moveTo(checkX - checkSize * 0.4, checkY);
  ctx.lineTo(checkX - checkSize * 0.1, checkY + checkSize * 0.3);
  ctx.lineTo(checkX + checkSize * 0.4, checkY - checkSize * 0.3);
  ctx.stroke();

  return canvas;
}

// Generate icons for each size
sizes.forEach((size) => {
  const canvas = generateIcon(size);
  const buffer = canvas.toBuffer('image/png');
  const filePath = path.join(iconsDir, `icon${size}.png`);

  fs.writeFileSync(filePath, buffer);
  console.log(`Generated: icon${size}.png`);
});

console.log('\nIcons generated successfully in the icons/ folder!');
