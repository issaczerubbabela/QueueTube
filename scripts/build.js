// Builds the extension into dist/: two classic (IIFE) scripts for the background worker and the
// content script, plus the popup and options pages.
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import fs from 'fs';

const root = process.cwd();
const dist = resolve(root, 'dist');
const shared = {
  configFile: false,
  logLevel: 'warn',
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
};

async function script(name, entry) {
  await build({
    ...shared,
    build: {
      outDir: resolve(dist, name),
      emptyOutDir: false,
      lib: { entry: resolve(root, entry), name: `Cue_${name}`, formats: ['iife'], fileName: () => 'index.js' },
    },
  });
}

fs.rmSync(dist, { recursive: true, force: true });

await script('background', 'src/background/index.ts');
await script('content', 'src/content/index.ts');
await build({
  ...shared,
  build: {
    outDir: dist,
    emptyOutDir: false,
    rollupOptions: {
      input: {
        popup: resolve(root, 'src/popup/index.html'),
        options: resolve(root, 'src/options/index.html'),
      },
      output: { entryFileNames: 'src/[name]/index.js', assetFileNames: 'assets/[name]-[hash][extname]' },
    },
  },
});

fs.copyFileSync(resolve(root, 'src/manifest.json'), resolve(dist, 'manifest.json'));
fs.cpSync(resolve(root, 'public/icons'), resolve(dist, 'icons'), { recursive: true });
console.log('Built Cue into dist/');
