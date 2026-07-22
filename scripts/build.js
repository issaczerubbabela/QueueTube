import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

const rootDir = process.cwd();
const distDir = resolve(rootDir, 'dist');
const browserBuildDefine = {
  'process.env.NODE_ENV': JSON.stringify('production')
};

async function runBuild() {
  console.log('🚀 Starting QueueTube Extension Build...');

  // 0. Build Content Script CSS via Tailwind CLI
  console.log('🎨 Building Content Script CSS...');
  const contentCssOut = resolve(distDir, 'content/style.css');
  if (!fs.existsSync(resolve(distDir, 'content'))) {
    fs.mkdirSync(resolve(distDir, 'content'), { recursive: true });
  }
  execSync(`npx tailwindcss -i src/content/style.css -o ${contentCssOut} --minify`, { stdio: 'inherit' });

  // 1. Build Background Service Worker (Single IIFE bundle)
  console.log('📦 Building Background Script (IIFE)...');
  await build({
    configFile: false,
    plugins: [react()],
    resolve: {
      alias: { '@': resolve(rootDir, 'src') }
    },
    define: browserBuildDefine,
    build: {
      outDir: resolve(distDir, 'background'),
      emptyOutDir: true,
      lib: {
        entry: resolve(rootDir, 'src/background/index.ts'),
        name: 'QueueTubeBackground',
        formats: ['iife'],
        fileName: () => 'index.js'
      }
    }
  });

  // 2. Build Content Script (Single IIFE bundle - NO MODULE IMPORTS)
  console.log('🎨 Building Content Script (IIFE)...');
  await build({
    configFile: false,
    plugins: [react()],
    resolve: {
      alias: { '@': resolve(rootDir, 'src') }
    },
    define: browserBuildDefine,
    build: {
      outDir: resolve(distDir, 'content'),
      emptyOutDir: false,
      lib: {
        entry: resolve(rootDir, 'src/content/index.ts'),
        name: 'QueueTubeContent',
        formats: ['iife'],
        fileName: () => 'index.js'
      }
    }
  });

  // 3. Build HTML UIs (Popup & Options)
  console.log('🖼️ Building Extension Popup & Options UIs...');
  await build({
    configFile: false,
    plugins: [react()],
    resolve: {
      alias: { '@': resolve(rootDir, 'src') }
    },
    define: browserBuildDefine,
    build: {
      outDir: distDir,
      emptyOutDir: false,
      rollupOptions: {
        input: {
          popup: resolve(rootDir, 'src/popup/index.html'),
          options: resolve(rootDir, 'src/options/index.html')
        },
        output: {
          entryFileNames: 'src/[name]/index.js',
          assetFileNames: 'assets/[name]-[hash][extname]'
        }
      }
    }
  });

  // 4. Copy manifest.json and icons to dist/
  console.log('📋 Copying manifest.json and icons...');
  fs.copyFileSync(resolve(rootDir, 'src/manifest.json'), resolve(distDir, 'manifest.json'));
  
  const iconsDist = resolve(distDir, 'icons');
  if (!fs.existsSync(iconsDist)) {
    fs.mkdirSync(iconsDist, { recursive: true });
  }
  const iconsPublic = resolve(rootDir, 'public/icons');
  if (fs.existsSync(iconsPublic)) {
    fs.readdirSync(iconsPublic).forEach((file) => {
      fs.copyFileSync(resolve(iconsPublic, file), resolve(iconsDist, file));
    });
  }

  console.log('✅ Extension build complete! Output directory: dist/');
}

runBuild().catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
