import { getQueueState, saveQueueState, addToQueue, saveQueueState as saveState } from '../storage';
import { extractVideoId, fetchVideoMetadata, buildWatchUrl, isMainYouTube } from '../utils/youtube';

const extApi = typeof browser !== 'undefined' ? browser : chrome;

// Cache active master tab ID
let currentMasterTabId: number | null = null;
const bypassedVideoTabs = new Set<string>();

async function getActiveYouTubeTabId(): Promise<number | null> {
  try {
    const tabs = await extApi.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs.find((tab: chrome.tabs.Tab) => tab.id && tab.url && isMainYouTube(tab.url));
    return activeTab?.id ?? null;
  } catch (e) {
    console.warn('[QueueTube Background] Could not query active YouTube tab:', e);
    return null;
  }
}

type ContentScriptStatus = 'ready' | 'injected' | 'failed';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function pingContentScript(tabId: number): Promise<boolean> {
  try {
    await extApi.tabs.sendMessage(tabId, { type: 'PING_QUEUE_TUBE' });
    return true;
  } catch (e) {
    return false;
  }
}

async function ensureContentScript(tabId: number): Promise<ContentScriptStatus> {
  if (await pingContentScript(tabId)) {
    return 'ready';
  }

  console.log('[QueueTube Background] Content script not responding; injecting into tab:', tabId);

  if (!extApi.scripting || !extApi.scripting.executeScript) {
    console.warn('[QueueTube Background] Scripting API unavailable; cannot inject content script.');
    return 'failed';
  }

  try {
    await extApi.scripting.executeScript({
      target: { tabId },
      files: ['content/index.js']
    });

    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (await pingContentScript(tabId)) return 'injected';
      await sleep(100);
    }

    console.warn('[QueueTube Background] Injected content script, but it did not respond to ping.');
    return 'injected';
  } catch (e) {
    console.error('[QueueTube Background] Failed to inject content script:', e);
    return 'failed';
  }
}

async function toggleSidebarOnYouTubeTab(forceOpen = false): Promise<boolean> {
  const activeYouTubeTabId = await getActiveYouTubeTabId();
  const targetTabId = activeYouTubeTabId ?? (await checkAndRestoreMasterTab());

  if (targetTabId === null) {
    console.warn('[QueueTube Background] No YouTube tab available for sidebar toggle.');
    return false;
  }

  const contentStatus = await ensureContentScript(targetTabId);
  if (contentStatus === 'failed') return false;

  try {
    await extApi.tabs.sendMessage(targetTabId, {
      type: forceOpen || contentStatus === 'injected' ? 'OPEN_SIDEBAR' : 'TOGGLE_SIDEBAR'
    });
    return true;
  } catch (e) {
    console.error('[QueueTube Background] Failed to message QueueTube content script:', e);
    return false;
  }
}

async function checkAndRestoreMasterTab(): Promise<number | null> {
  console.log('[QueueTube Background] Running checkAndRestoreMasterTab... currentMasterTabId =', currentMasterTabId);

  // 0. Try to restore from storage if local variable is null
  if (currentMasterTabId === null) {
    const state = await getQueueState();
    if (state.masterTabId !== null) {
      currentMasterTabId = state.masterTabId;
      console.log('[QueueTube Background] Restored masterTabId from storage:', currentMasterTabId);
    }
  }

  // 1. Verify if currentMasterTabId is valid
  if (currentMasterTabId !== null) {
    try {
      const masterTab = await extApi.tabs.get(currentMasterTabId);
      if (masterTab && masterTab.url && isMainYouTube(masterTab.url)) {
        console.log('[QueueTube Background] Existing master tab validated:', currentMasterTabId, masterTab.url);
        // Update local cache and state just to be sure
        await saveState({ masterTabId: currentMasterTabId });
        return currentMasterTabId;
      }
    } catch (e) {
      console.log('[QueueTube Background] Previous master tab no longer valid:', currentMasterTabId);
      currentMasterTabId = null;
    }
  }

  // 2. Query open YouTube tabs (any YouTube page: watch, home, channel, search)
  try {
    const tabs = await extApi.tabs.query({});
    console.log('[QueueTube Background] Total browser tabs queried:', tabs.length);

    const ytTabs = tabs.filter((t) => t.url && isMainYouTube(t.url));
    console.log(
      '[QueueTube Background] Filtered YouTube tabs count:',
      ytTabs.length,
      ytTabs.map((t) => ({ id: t.id, url: t.url, active: t.active }))
    );

    if (ytTabs.length > 0) {
      // Prefer currently active tab or first YouTube tab
      const activeTab = ytTabs.find((t) => t.active) || ytTabs[0];
      if (activeTab && activeTab.id) {
        currentMasterTabId = activeTab.id;
        const videoId = activeTab.url ? extractVideoId(activeTab.url) : null;
        console.log('[QueueTube Background] Selected tab as Master Player:', activeTab.id, activeTab.url);
        await saveState({ masterTabId: activeTab.id, currentVideoId: videoId });
        return activeTab.id;
      }
    }
  } catch (e) {
    console.error('[QueueTube Background] Failed to query tabs:', e);
  }

  // 3. No YouTube tab open
  console.log('[QueueTube Background] No active YouTube tabs detected.');
  currentMasterTabId = null;
  await saveState({ masterTabId: null });
  return null;
}

async function initBackground() {
  console.log('[QueueTube Background] Initializing background service worker...');
  await checkAndRestoreMasterTab();
}

// Intercept YouTube tabs
extApi.tabs.onUpdated.addListener(
  async (tabId: number, changeInfo: { status?: string; url?: string }, tab: chrome.tabs.Tab) => {
    // Capture URL changes or navigation events (both loading and complete can be relevant)
    if (!changeInfo.url && changeInfo.status !== 'loading' && changeInfo.status !== 'complete') return;
    if (!tab.url || !isMainYouTube(tab.url)) return;

    console.log('[QueueTube Background] tab.onUpdated triggered for YouTube tab:', tabId, tab.url, changeInfo);

    // Master tab validation is handled next
    const masterTabId = await checkAndRestoreMasterTab();

    // If no master exists, set this tab as Master
    if (currentMasterTabId === null) {
      currentMasterTabId = tabId;
      const videoId = extractVideoId(tab.url);
      console.log('[QueueTube Background] Promoted new tab to Master Player:', tabId, tab.url);
      await saveState({ masterTabId: tabId, currentVideoId: videoId });
      return;
    }

    // If this is the Master Tab, update current video ID
    if (currentMasterTabId === tabId) {
      const videoId = extractVideoId(tab.url);
      if (videoId) {
        console.log('[QueueTube Background] Master player navigated to video:', videoId);
        await saveState({ currentVideoId: videoId });
      }
      return;
    }

    // Secondary YouTube tab created/navigated! Check if it's a watch video link
    const state = await getQueueState();
    const videoId = extractVideoId(tab.url);
    
    if (videoId && tab.url.includes('queueTubeBypass=1')) {
      bypassedVideoTabs.add(`${tabId}:${videoId}`);
    }

    if (state.settings.autoGather && videoId && !bypassedVideoTabs.has(`${tabId}:${videoId}`) && !tab.url.includes('queueTubeBypass=1')) {
      console.log(`[QueueTube Background] Intercepting secondary watch tab ${tabId} for video ${videoId}`);

      const meta = await fetchVideoMetadata(tab.url);
      await addToQueue({
        videoId: videoId,
        title: meta.title || `Video (${videoId})`,
        channel: meta.channel || 'YouTube',
        duration: meta.duration || '--:--',
        thumbnail: meta.thumbnail || '',
        url: tab.url
      });

      // Remove secondary tab
      try {
        console.log('[QueueTube Background] Closing secondary tab:', tabId);
        await extApi.tabs.remove(tabId);
      } catch (e) {
        console.warn('[QueueTube Background] Could not close secondary tab:', e);
      }

      // Focus Master Tab
      if (state.settings.autoFocusPlayer && currentMasterTabId !== null) {
        try {
          await extApi.tabs.update(currentMasterTabId, { active: true });
        } catch (e) {}
      }
    }
  }
);

// Listen to tab activation changes to track master tab
extApi.tabs.onActivated.addListener(async (activeInfo) => {
  console.log('[QueueTube Background] tab.onActivated triggered for tab:', activeInfo.tabId);
  await checkAndRestoreMasterTab();
});

// Handle Tab Closure
extApi.tabs.onRemoved.addListener(async (tabId: number) => {
  // Clean up bypassedVideoTabs for this tab
  for (const key of bypassedVideoTabs) {
    if (key.startsWith(`${tabId}:`)) {
      bypassedVideoTabs.delete(key);
    }
  }

  if (tabId === currentMasterTabId) {
    console.log('[QueueTube Background] Master Player tab closed:', tabId);
    currentMasterTabId = null;
    const state = await getQueueState();

    if (state.queue.length > 0) {
      // Re-open first item in queue as new Master Player tab
      const nextItem = state.queue[0];
      const watchUrl = buildWatchUrl(nextItem.videoId);
      console.log('[QueueTube Background] Opening next queued item in new Master tab:', watchUrl);
      const newTab = await extApi.tabs.create({ url: watchUrl, active: true });

      currentMasterTabId = newTab.id || null;
      await saveState({
        masterTabId: currentMasterTabId,
        currentVideoId: nextItem.videoId
      });
    } else {
      await saveState({ masterTabId: null });
    }
  }
});

// Tab Gathering routine ("Gather Tabs")
async function gatherAllYouTubeTabs() {
  console.log('[QueueTube Background] Executing Gather Tabs...');
  const tabs = await extApi.tabs.query({});
  const watchTabs = tabs.filter((t: chrome.tabs.Tab) => t.url && extractVideoId(t.url));

  console.log('[QueueTube Background] Found watch tabs for gathering:', watchTabs.length);

  if (watchTabs.length === 0) return;

  const state = await getQueueState();
  let masterTab = watchTabs.find((t: chrome.tabs.Tab) => t.id === currentMasterTabId) || watchTabs[0];
  currentMasterTabId = masterTab.id || null;

  for (const t of watchTabs) {
    if (!t.url) continue;
    const videoId = extractVideoId(t.url);
    if (!videoId) continue;

    // Add every watch video to queue (except master's current video if already playing)
    if (t.id !== masterTab.id) {
      console.log('[QueueTube Background] Gathering tab video to queue:', videoId, t.url);
      const meta = await fetchVideoMetadata(t.url);
      await addToQueue({
        videoId,
        title: meta.title || `Video (${videoId})`,
        channel: meta.channel || 'YouTube',
        duration: meta.duration || '--:--',
        thumbnail: meta.thumbnail || '',
        url: t.url
      });

      // Close duplicate tab
      if (t.id) {
        try {
          await extApi.tabs.remove(t.id);
        } catch (e) {}
      }
    }
  }

  // Save updated master tab state
  if (masterTab.id && masterTab.url) {
    const masterVideoId = extractVideoId(masterTab.url);
    await saveState({
      masterTabId: masterTab.id,
      currentVideoId: masterVideoId || state.currentVideoId
    });
    await extApi.tabs.update(masterTab.id, { active: true });
  }
}

// Runtime Message Listener
extApi.runtime.onMessage.addListener(
  (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
    if (!message || !message.type) return false;

    console.log('[QueueTube Background] Received runtime message:', message.type, message);

    if (message.type === 'FORCE_INJECT_SIDEBAR') {
      const tabId = sender.tab?.id ?? currentMasterTabId;
      if (tabId === null || tabId === undefined) {
        sendResponse({ success: false, error: 'no_youtube_tab' });
        return true;
      }
      ensureContentScript(tabId).then((status) => sendResponse({ success: status !== 'failed', status }));
      return true;
    }

    if (message.type === 'GATHER_TABS') {
      gatherAllYouTubeTabs().then(() => sendResponse({ success: true }));
      return true;
    }

    if (message.type === 'CHECK_MASTER_TAB') {
      checkAndRestoreMasterTab().then((tabId) => {
        getQueueState().then((state) => {
          console.log('[QueueTube Background] Responding to CHECK_MASTER_TAB:', { masterTabId: tabId, state });
          sendResponse({ success: true, masterTabId: tabId, state });
        });
      });
      return true;
    }

    if (message.type === 'PLAY_VIDEO') {
      if (message.videoId && currentMasterTabId !== null) {
        const url = buildWatchUrl(message.videoId);
        console.log('[QueueTube Background] PLAY_VIDEO navigating Master tab:', currentMasterTabId, url);
        extApi.tabs.update(currentMasterTabId, { url, active: true }).catch(() => {});
      }
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'TOGGLE_SIDEBAR') {
      toggleSidebarOnYouTubeTab().then((success) => sendResponse({ success }));
      return true;
    }

    if (message.type === 'OPEN_OPTIONS_PAGE') {
      extApi.runtime.openOptionsPage();
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'OPEN_NEW_TAB') {
      if (message.url) {
        extApi.tabs.create({ url: message.url, active: true });
      }
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'IS_MASTER_TAB') {
      const tabId = sender.tab?.id;
      sendResponse({ isMaster: tabId === currentMasterTabId });
      return true;
    }

    if (message.type === 'CHECK_AUTOGATHER') {
      const tabId = sender.tab?.id;
      const url = message.url;
      if (tabId && url && tabId !== currentMasterTabId) {
        const videoId = extractVideoId(url);
        getQueueState().then(async (state) => {
          if (state.settings.autoGather && videoId && !bypassedVideoTabs.has(`${tabId}:${videoId}`) && !url.includes('queueTubeBypass=1')) {
            console.log(`[QueueTube Background] CHECK_AUTOGATHER intercepting secondary watch tab ${tabId} for video ${videoId}`);
            const meta = await fetchVideoMetadata(url);
            await addToQueue({
              videoId,
              title: meta.title || `Video (${videoId})`,
              channel: meta.channel || 'YouTube',
              duration: meta.duration || '--:--',
              thumbnail: meta.thumbnail || '',
              url
            });
            try {
              await extApi.tabs.remove(tabId);
            } catch (e) {}
            if (state.settings.autoFocusPlayer && currentMasterTabId !== null) {
              try {
                await extApi.tabs.update(currentMasterTabId, { active: true });
              } catch (e) {}
            }
          }
        });
      }
      sendResponse({ success: true });
      return true;
    }

    return false;
  }
);

// Keyboard Commands Listener
if (extApi.commands && extApi.commands.onCommand) {
  extApi.commands.onCommand.addListener(async (command: string) => {
    console.log('[QueueTube Background] Keyboard Command received:', command);
    const state = await getQueueState();

    if (command === 'gather-tabs') {
      await gatherAllYouTubeTabs();
    } else if (command === 'next-video') {
      // Play the next item after the current one
      const currentIndex = state.queue.findIndex((item) => item.videoId === state.currentVideoId);
      const nextIndex = currentIndex >= 0 && currentIndex < state.queue.length - 1 ? currentIndex + 1 : 0;
      const nextItem = state.queue[nextIndex];
      if (nextItem && currentMasterTabId !== null) {
        await extApi.tabs.update(currentMasterTabId, {
          url: buildWatchUrl(nextItem.videoId),
          active: true
        });
        await saveState({ currentVideoId: nextItem.videoId });
      }
    } else if (command === 'previous-video') {
      // Play previous from history
      if (state.history.length > 0) {
        const prevItem = state.history[0];
        if (currentMasterTabId !== null) {
          await extApi.tabs.update(currentMasterTabId, {
            url: buildWatchUrl(prevItem.videoId),
            active: true
          });
          await saveState({
            currentVideoId: prevItem.videoId,
            history: state.history.slice(1)
          });
        }
      }
    } else if (command === 'toggle-queue') {
      await toggleSidebarOnYouTubeTab();
    }
  });
}

initBackground();
