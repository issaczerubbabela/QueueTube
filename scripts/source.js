import fs from 'fs';
import path from 'path';
import { ZipArchive } from 'archiver';

const rootDir = process.cwd();
const buildsDir = path.resolve(rootDir, 'builds');
const outPath = path.resolve(buildsDir, 'queuetube-source.zip');

if (!fs.existsSync(buildsDir)){
    fs.mkdirSync(buildsDir);
}

console.log('📦 Packaging source code into queuetube-source.zip...');

const output = fs.createWriteStream(outPath);
const archive = new ZipArchive({ zlib: { level: 9 } });

output.on('close', () => {
  console.log(`✅ Successfully created source code archive (${(archive.pointer() / 1024 / 1024).toFixed(2)} MB)`);
  console.log('You can upload this file to Mozilla as your source code submission.');
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

// Glob pattern to include everything EXCEPT node_modules, dist, builds, and git folders
archive.glob('**/*', {
  cwd: rootDir,
  ignore: [
    'node_modules/**',
    'dist/**',
    'builds/**',
    '.git/**',
    '.vscode/**',
    '*.zip'
  ]
});

archive.finalize();
