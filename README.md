# QueueTube 🎥

> **QueueTube** transforms YouTube into a **single-player experience**.

Instead of allowing dozens of YouTube tabs to accumulate across your browser, QueueTube maintains **one persistent YouTube player tab** while every newly opened video becomes an item in an extension-managed queue.

---

## ✨ Features

- 🎯 **One Master Player**: Maintain exactly one active YouTube watch tab. Zero tab clutter!
- ⚡ **Auto-Gathering**: Intercept newly opened YouTube links & automatically route them into your queue.
- 📦 **Tab Consolidation**: Click **Gather Tabs** (`Ctrl+Shift+Q`) to collect all open YouTube tabs across windows into a single organized queue.
- 🎨 **Native-Feeling UI**: Sleek, dark-mode React sidebar mounted directly in YouTube using Shadow DOM so it never breaks YouTube or leaks styles.
- 🖐️ **Drag & Drop Reordering**: Reorder queued videos on the fly with live thumbnail and duration previews.
- 🔁 **Auto Playback**: Plays the next video in your queue automatically when the current video ends.
- 💾 **Persistent Queue**: Powered by `browser.storage.local` to restore your queue across browser restarts.
- ⌨️ **Keyboard Shortcuts**:
  - `Ctrl+Shift+Q`: Gather Tabs
  - `Ctrl+Shift+N`: Play Next Video
  - `Ctrl+Shift+P`: Play Previous Video
  - `Ctrl+Shift+L`: Toggle Queue Sidebar

---

## 🛠️ Architecture

```text
Firefox / Zen / Chromium Browser
│
├── Background Service Worker (src/background/index.ts)
│   ├── Tracks Master Player Tab ID
│   ├── Intercepts new YouTube watch tabs & appends to queue
│   ├── Handles "Gather Tabs" & keyboard shortcuts
│   └── Manages storage state
│
├── Content Script (src/content/index.ts)
│   ├── Mounts React QueueSidebar into Shadow DOM
│   └── Listens to HTML5 <video> ended events & YouTube SPA navigation
│
├── Extension Popup (src/popup/Popup.tsx)
│   └── Quick controls, player status, gather button
│
└── Options / Settings (src/options/Options.tsx)
    └── Customize auto-gather, duplicate prevention, and layout
```

---

## 🚀 Building & Installation

### 1. Prerequisites
- [Node.js](https://nodejs.org/) v18+
- npm or pnpm

### 2. Build Extension
```bash
# Install dependencies
npm install

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
