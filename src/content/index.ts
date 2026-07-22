import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueueSidebar } from '../sidebar/QueueSidebar';
import { useQueueStore } from '../shared/store';
import { extractVideoId } from '../utils/youtube';

const extApi = typeof browser !== 'undefined' ? browser : chrome;

let shadowContainer: HTMLDivElement | null = null;
let shadowRootRef: ShadowRoot | null = null;
let messageListenerAttached = false;
let navigationObserverAttached = false;

function getYouTubeQueueParent(): HTMLElement | null {
  return (
    document.querySelector('#secondary-inner') ||
    document.querySelector('#secondary') ||
    document.querySelector('#columns')
  ) as HTMLElement | null;
}

function styleHost(host: HTMLDivElement, isIntegrated: boolean) {
  host.style.zIndex = isIntegrated ? '1' : '9999';
  host.style.pointerEvents = 'auto';

  if (isIntegrated) {
    host.style.position = 'relative';
    host.style.top = '';
    host.style.right = '';
    host.style.bottom = '';
    host.style.width = '100%';
    host.style.marginBottom = '16px';
  } else {
    host.style.position = 'fixed';
    host.style.top = '56px';
    host.style.right = '0';
    host.style.bottom = '0';
    host.style.width = '';
    host.style.marginBottom = '';
  }
}

function ensureHostPlacement() {
  if (!shadowContainer || !document.body.contains(shadowContainer)) return;
  const queueParent = getYouTubeQueueParent();
  if (!queueParent || shadowContainer.parentElement === queueParent) return;

  styleHost(shadowContainer, true);
  shadowContainer.style.visibility = 'visible';
  queueParent.prepend(shadowContainer);
  console.log('[QueueTube Content] Moved QueueTube host into YouTube secondary column.');
}

async function checkAndInject() {
  try {
    const res = await extApi.runtime.sendMessage({ type: 'IS_MASTER_TAB' });
    if (res && res.isMaster) {
      injectQueueTubeSidebar();
    } else {
      const staleHost = document.getElementById('queuetube-host');
      if (staleHost) {
        staleHost.remove();
        shadowContainer = null;
      }
    }
  } catch (e) {}
}

function injectQueueTubeSidebar() {
  if (shadowContainer && document.body.contains(shadowContainer)) {
    console.log('[QueueTube Content] Host element already injected.');
    return;
  }

  const staleHost = document.getElementById('queuetube-host');
  if (staleHost) {
    console.log('[QueueTube Content] Removing stale QueueTube host before reinjection.');
    staleHost.remove();
  }

  console.log('[QueueTube Content] Injecting QueueTube Host & Shadow DOM into YouTube...');

  // Create Host Container
  const host = document.createElement('div');
  host.id = 'queuetube-host';
  const queueParent = getYouTubeQueueParent();
  styleHost(host, Boolean(queueParent));

  // Attach Shadow DOM
  const shadow = host.attachShadow({ mode: 'open' });
  shadowRootRef = shadow;

  // Inject Styles into Shadow Root via <link>
  const linkEl = document.createElement('link');
  linkEl.rel = 'stylesheet';
  linkEl.href = extApi.runtime.getURL('content/style.css');
  shadow.appendChild(linkEl);

  // Mount Point
  const mountPoint = document.createElement('div');
  mountPoint.id = 'queuetube-mount';
  mountPoint.className = 'h-full flex items-stretch font-sans antialiased';
  shadow.appendChild(mountPoint);

  if (queueParent) {
    // Secondary column already exists — place immediately and show
    host.style.visibility = 'visible';
    queueParent.prepend(host);
  } else {
    // Secondary column not ready yet — hide until ensureHostPlacement() moves it
    host.style.visibility = 'hidden';
    document.body.appendChild(host);
  }
  shadowContainer = host;

  // Render React Sidebar Component
  const root = createRoot(mountPoint);
  root.render(React.createElement(QueueSidebar));

  console.log('[QueueTube Content] Shadow DOM Sidebar injected & rendered successfully.');
}

// Observe HTML5 Video Player Events
function setupVideoPlayerObserver() {
  const attachVideoListeners = () => {
    const videoEl = document.querySelector('video.html5-main-video') as HTMLVideoElement;
    if (!videoEl) return;

    if (videoEl.dataset.queuetubeAttached) return;
    videoEl.dataset.queuetubeAttached = 'true';

    console.log('[QueueTube Content] Attached HTML5 Video Player event listener to:', videoEl);

    videoEl.addEventListener('ended', async () => {
      console.log('[QueueTube Content] Video ended event fired. Checking auto-play...');
      try {
        const res = await extApi.runtime.sendMessage({ type: 'IS_MASTER_TAB' });
        if (res && res.isMaster) {
          const store = useQueueStore.getState();
          if (store.queue.length > 0) {
            console.log('[QueueTube Content] Advancing to next video in queue...');
            await store.playNext();
          }
        }
      } catch (e) {}
    });
  };

  attachVideoListeners();

  // Retry observer if player renders dynamically
  const observer = new MutationObserver(() => {
    attachVideoListeners();
    ensureHostPlacement();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// Observe YouTube Navigation (yt-navigate-finish / URL changes)
function setupNavigationObserver() {
  if (navigationObserverAttached) return;
  navigationObserverAttached = true;
  const handleNav = async () => {
    const videoId = extractVideoId(window.location.href);
    const res = await extApi.runtime.sendMessage({ type: 'IS_MASTER_TAB' });
    if (res && res.isMaster) {
      if (videoId) {
        useQueueStore.getState().setCurrentVideoId(videoId);
      }
      await checkAndInject();
    } else {
      extApi.runtime.sendMessage({ type: 'CHECK_AUTOGATHER', url: window.location.href });
    }
  };
  window.addEventListener('yt-navigate-finish', handleNav);
  window.addEventListener('popstate', handleNav);
  handleNav();
}

function initContentScript() {
  // Idempotent message listener
  if (!messageListenerAttached) {
    messageListenerAttached = true;
    extApi.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: (response?: any) => void) => {
      console.log('[QueueTube Content] Received message:', message);
      if (message && message.type === 'PING_QUEUE_TUBE') {
        sendResponse({ success: true });
        return true;
      }
      if (message && message.type === 'OPEN_SIDEBAR') {
        const store = useQueueStore.getState();
        store.setSettings({ sidebarCollapsed: false });
        sendResponse({ success: true });
        return true;
      }
      if (message && message.type === 'TOGGLE_SIDEBAR') {
        const store = useQueueStore.getState();
        store.setSettings({ sidebarCollapsed: !store.settings.sidebarCollapsed });
        sendResponse({ success: true });
        return true;
      }
      return false;
    });
  }

  console.log('[QueueTube Content] Initializing content script on:', window.location.href);
  if (window.location.hostname.includes('youtube.com')) {
    checkAndInject();
    setupVideoPlayerObserver();
    setupNavigationObserver();
  }
}

// Aggressive initialization to handle YouTube's SPA and early injection
function tryInit() {
  if (document.body) {
    initContentScript();
  } else {
    setTimeout(tryInit, 50);
  }
}
tryInit();
