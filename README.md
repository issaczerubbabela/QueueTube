# QueueTube 🎥

> **QueueTube** transforms YouTube into a **single-player experience**.

Instead of allowing dozens of YouTube tabs to accumulate across your browser, QueueTube maintains **one persistent YouTube player tab** while every newly opened video becomes an item in an extension-managed queue.

---

## ✨ Features

- 🎯 **One player tab**: QueueTube plays everything in a single YouTube tab.
- ⚡ **Auto-queue**: a YouTube video you open in a *new* tab joins the queue and the tab closes. Tabs you're already browsing in, YouTube Music, and YouTube Studio are never touched.
- 📦 **Gather tabs**: sweep every open YouTube video tab into the queue at once.
- 🧊 **Liquid-glass queue panel** inside YouTube's sidebar, following YouTube's light/dark theme, with now-playing artwork, durations, and time remaining.
- 🖐️ **Reorder** by drag and drop, by keyboard (Alt+↑/↓), or with *Play next* / *Move to top*.
- ↩️ **Undo** for removing a video or clearing the queue.
- 🔁 **Auto-advance** to the next video when one ends (ads are ignored).
- 🕘 **History** of what you moved past, with one-click replay.
- 💾 **Import/export** the queue as a text file of links.
- ⌨️ **Keyboard shortcuts** (change them in your browser's extension shortcut settings):
  - `Alt+Shift+Q`: Gather tabs
  - `Alt+Shift+.`: Play next
  - `Alt+Shift+,`: Play previous
  - `Alt+Shift+L`: Collapse or expand the panel

---

## 🛠️ Architecture

See [`docs/architecture.md`](docs/architecture.md), the domain glossary in [`CONTEXT.md`](CONTEXT.md), and the decision records in [`docs/adr/`](docs/adr/).

---

## 🚀 Building & Installation

### 1. Prerequisites
- [Node.js](https://nodejs.org/) v18+
- npm or pnpm

### 2. Build Extension
```bash
# Install dependencies
npm install

# Run the unit tests
npm test

# Build extension for Firefox / Chromium
npm run build
```

The compiled extension will be output to `dist/`.

### 3. Load Extension in Browser

#### Firefox / Zen Browser
1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on...**
3. Select `dist/manifest.json`

#### Chrome / Edge / Brave
1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the `dist` folder.

---

## 📄 License
MIT © QueueTube Team
