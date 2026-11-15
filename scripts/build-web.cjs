const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.resolve(root, 'web-dist');
if (path.dirname(output) !== root || path.basename(output) !== 'web-dist') {
  throw new Error('Unexpected web output path.');
}

const assets = [
  ['mission.html', 'index.html'],
  ['mission.html', 'mission.html'],
  ['index.html', 'map.html'],
  ['mission.js', 'mission.js'],
  ['missions.js', 'missions.js'],
  ['coords.js', 'coords.js'],
  ['route.js', 'route.js'],
  ['water.js', 'water.js'],
  ['desktop/offline-status.js', 'desktop/offline-status.js'],
  ['data/curiosity.js', 'data/curiosity.js'],
  ['data/perseverance.js', 'data/perseverance.js'],
  ['data/scenarios.js', 'data/scenarios.js'],
  ['data/jezero-geology.geojson', 'data/jezero-geology.geojson'],
  ['node_modules/leaflet/dist/leaflet.css', 'vendor/leaflet/leaflet.css'],
  ['node_modules/leaflet/dist/leaflet.js', 'vendor/leaflet/leaflet.js'],
];

for (const [source] of assets) {
  if (!fs.statSync(path.join(root, source), { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Required web asset missing: ${source}`);
  }
}

fs.rmSync(output, { recursive: true, force: true });
for (const [source, destination] of assets) {
  const target = path.join(output, destination);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, source), target);
}

const images = path.join(root, 'node_modules', 'leaflet', 'dist', 'images');
if (!fs.statSync(images, { throwIfNoEntry: false })?.isDirectory()) {
  throw new Error('Required Leaflet images are missing.');
}
fs.cpSync(images, path.join(output, 'vendor', 'leaflet', 'images'), { recursive: true });
console.log('Built allowlisted static site in web-dist.');
