import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueueSidebar } from '../sidebar/QueueSidebar';
import { useQueueStore } from '../shared/store';
import { extractVideoId } from '../utils/youtube';
import styleText from './style.css?inline';

const extApi = typeof browser !== 'undefined' ? browser : chrome;

let shadowContainer: HTMLDivElement | null = null;
let shadowRootRef: ShadowRoot | null = null;

function injectQueueTubeSidebar() {
  if (document.getElementById('queuetube-host')) {
    return;
  }

  // Create Host Container
  const host = document.createElement('div');
  host.id = 'queuetube-host';
  host.style.position = 'fixed';
  host.style.top = '56px';
  host.style.right = '0';
  host.style.bottom = '0';
  host.style.zIndex = '9999';
  host.style.pointerEvents = 'auto';

  // Attach Shadow DOM
  const shadow = host.attachShadow({ mode: 'open' });
  shadowRootRef = shadow;

  // Inject Styles into Shadow Root
  const styleEl = document.createElement('style');
  styleEl.textContent = styleText;
  shadow.appendChild(styleEl);

  // Mount Point
  const mountPoint = document.createElement('div');
  mountPoint.id = 'queuetube-mount';
  mountPoint.className = 'h-full flex items-stretch font-sans antialiased';
  shadow.appendChild(mountPoint);

  document.body.appendChild(host);

  // Render React Sidebar Component
  const root = createRoot(mountPoint);
  root.render(React.createElement(QueueSidebar));

  console.log('[QueueTube] Shadow DOM Sidebar injected successfully.');
}

// Observe HTML5 Video Player Events
function setupVideoPlayerObserver() {
  const attachVideoListeners = () => {
    const videoEl = document.querySelector('video.html5-main-video') as HTMLVideoElement;
    if (!videoEl) return;

    if (videoEl.dataset.queuetubeAttached) return;
    videoEl.dataset.queuetubeAttached = 'true';

    console.log('[QueueTube] Attached HTML5 Video Player event listener.');

    videoEl.addEventListener('ended', async () => {
      console.log('[QueueTube] Video ended. Checking queue auto-play...');
      const store = useQueueStore.getState();
      if (store.queue.length > 0) {
        await store.playNext();
      }
    });
  };

  attachVideoListeners();

  // Retry observer if player renders dynamically
  const observer = new MutationObserver(() => {
    attachVideoListeners();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// Observe YouTube Navigation (yt-navigate-finish / URL changes)
function setupNavigationObserver() {
  const updateCurrentVideo = () => {
    const videoId = extractVideoId(window.location.href);
    if (videoId) {
      useQueueStore.getState().setCurrentVideoId(videoId);
    }
  };

  window.addEventListener('yt-navigate-finish', updateCurrentVideo);
  window.addEventListener('popstate', updateCurrentVideo);

  // Initial check
  updateCurrentVideo();
}

// Message listener for runtime commands (e.g. TOGGLE_SIDEBAR)
extApi.runtime.onMessage.addListener((message: any) => {
  if (message && message.type === 'TOGGLE_SIDEBAR') {
    const store = useQueueStore.getState();
    store.setSettings({ sidebarCollapsed: !store.settings.sidebarCollapsed });
  }
});

function initContentScript() {
  // Only run on YouTube watch pages or general YouTube pages
  if (window.location.hostname.includes('youtube.com')) {
    injectQueueTubeSidebar();
    setupVideoPlayerObserver();
    setupNavigationObserver();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initContentScript);
} else {
  initContentScript();
}
