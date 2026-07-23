const fs = require('fs');
const path = require('path');
const archiver = require('archiver').default || require('archiver');

const rootDir = process.cwd();
const distDir = path.resolve(rootDir, 'dist');
const outPath = path.resolve(rootDir, 'QueueTube.zip');

console.log('📦 Packaging extension into QueueTube.zip...');

const output = fs.createWriteStream(outPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(`✅ Successfully created QueueTube.zip (${(archive.pointer() / 1024).toFixed(2)} KB)`);
  console.log('You can now upload this file to the Chrome Web Store or Firefox Add-ons Hub!');
});

archive.on('warning', (err) => {
  if (err.code === 'ENOENT') {
    console.warn('Warning:', err);
  } else {
    throw err;
  }
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);

// Append files from dist directory, putting them at the root of the archive
archive.directory(distDir, false);

archive.finalize();
