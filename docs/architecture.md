# QueueTube Architecture & Specification

## Core Architectural Principles

1. **YouTube as a Video Renderer**:
   QueueTube treats YouTube solely as an HTML5 video player element. All state (queue items, history, master tab ID, settings) lives inside `browser.storage.local`.

2. **Shadow DOM Encapsulation**:
   The QueueTube sidebar UI is injected into the YouTube watch page using a `ShadowRoot` (`#queuetube-host`). This ensures 100% CSS isolation between YouTube and QueueTube.

3. **Background Master Tab Router**:
   The Background Service Worker tracks `masterTabId`. When a YouTube watch URL opens in a new tab:
   - If no active Master player tab exists: promote the tab to Master.
   - If Master player tab exists: extract video ID, add to queue, close temporary tab, and focus Master tab.

4. **Event-Driven Storage Synchronization**:
   All UI layers (Popup, Options, Content Script Sidebar) communicate via `browser.storage.onChanged` and Zustand store subscriptions, ensuring instant reactivity across all contexts.
