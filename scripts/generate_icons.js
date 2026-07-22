import fs from 'fs';
import path from 'path';

const dir = path.join(process.cwd(), 'public', 'icons');
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

// Minimal valid transparent/red square PNG generator
function createRedSquarePNG(size) {
  // SVG string for icon
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
    <rect width="128" height="128" rx="28" fill="#0F0F0F"/>
    <rect x="8" y="8" width="112" height="112" rx="20" fill="#1F1F1F" stroke="#383838" stroke-width="4"/>
    <circle cx="64" cy="64" r="36" fill="#FF0000"/>
    <polygon points="56,48 80,64 56,80" fill="#FFFFFF"/>
    <rect x="24" y="104" width="80" height="6" rx="3" fill="#FF0000"/>
  </svg>`;
  return svg;
}

// Create SVG icons and PNG placeholders
[16, 48, 128].forEach((size) => {
  const svgContent = createRedSquarePNG(size);
  fs.writeFileSync(path.join(dir, `icon${size}.svg`), svgContent);
  
  // Base64 encoded minimal valid red PNG for browser compatibility
  const minimalRedPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  fs.writeFileSync(path.join(dir, `icon${size}.png`), Buffer.from(minimalRedPngBase64, 'base64'));
});

console.log('Icons generated successfully in public/icons/');
