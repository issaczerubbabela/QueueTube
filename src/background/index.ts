import { getQueueState, saveQueueState, addToQueue, saveQueueState as saveState } from '../storage';
import { extractVideoId, fetchVideoMetadata, buildWatchUrl } from '../utils/youtube';

const extApi = typeof browser !== 'undefined' ? browser : chrome;

// Cache active master tab ID
let currentMasterTabId: number | null = null;

async function initBackground() {
  console.log('[QueueTube] Background service worker initialized.');
  const state = await getQueueState();
  currentMasterTabId = state.masterTabId;

  // Validate existing master tab ID
  if (currentMasterTabId !== null) {
    try {
      await extApi.tabs.get(currentMasterTabId);
    } catch (err) {
      // Master tab no longer exists
      currentMasterTabId = null;
      await saveState({ masterTabId: null });
    }
  }
}

// 1. Intercept newly opened YouTube Watch tabs
extApi.tabs.onUpdated.addListener(
  async (tabId: number, changeInfo: { status?: string; url?: string }, tab: chrome.tabs.Tab) => {
    if (changeInfo.status !== 'loading' || !tab.url) return;

    const videoId = extractVideoId(tab.url);
    if (!videoId) return;

    const state = await getQueueState();
    const autoGather = state.settings.autoGather;

    // Validate current master tab ID
    let masterValid = false;
    if (currentMasterTabId !== null) {
      try {
        const masterTab = await extApi.tabs.get(currentMasterTabId);
        if (masterTab && masterTab.url && extractVideoId(masterTab.url)) {
          masterValid = true;
        }
      } catch (e) {
        masterValid = false;
      }
    }

    if (!masterValid) {
      // No active master player tab exists. Promote this tab to Master Player!
      currentMasterTabId = tabId;
      await saveState({ masterTabId: tabId, currentVideoId: videoId });
      console.log(`[QueueTube] Tab ${tabId} promoted to Master Player.`);
      return;
    }

    // Master player already exists! If this is a different tab and autoGather is ON
    if (masterValid && tabId !== currentMasterTabId && autoGather) {
      console.log(`[QueueTube] Intercepting video ${videoId} from secondary tab ${tabId}`);

      // Fetch video metadata
      const meta = await fetchVideoMetadata(tab.url);
      await addToQueue({
        videoId: videoId,
        title: meta.title || `Video (${videoId})`,
        channel: meta.channel || 'YouTube',
        duration: meta.duration || '--:--',
        thumbnail: meta.thumbnail || '',
        url: tab.url
      });

      // Close the temporary intercepted tab
      try {
        await extApi.tabs.remove(tabId);
      } catch (e) {
        console.warn('[QueueTube] Could not remove tab:', e);
      }

      // Focus Master Tab if configured
      if (state.settings.autoFocusPlayer && currentMasterTabId !== null) {
        try {
          await extApi.tabs.update(currentMasterTabId, { active: true });
          const masterTabObj = await extApi.tabs.get(currentMasterTabId);
          if (masterTabObj && masterTabObj.windowId) {
            await extApi.windows.update(masterTabObj.windowId, { focused: true });
          }
        } catch (e) {
          console.warn('[QueueTube] Could not focus master tab:', e);
        }
      }
    }
  }
);

// 2. Handle Master Tab Closure
extApi.tabs.onRemoved.addListener(async (tabId: number) => {
  if (tabId === currentMasterTabId) {
    console.log('[QueueTube] Master Player tab closed.');
    currentMasterTabId = null;
    const state = await getQueueState();

    if (state.queue.length > 0) {
      // Re-open first item in queue as new Master Player tab
      const nextItem = state.queue[0];
      const watchUrl = buildWatchUrl(nextItem.videoId);
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

// 3. Tab Gathering routine ("Gather Tabs")
async function gatherAllYouTubeTabs() {
  console.log('[QueueTube] Executing Gather Tabs...');
  const tabs = await extApi.tabs.query({ url: '*://*.youtube.com/*' });
  const watchTabs = tabs.filter((t: chrome.tabs.Tab) => t.url && extractVideoId(t.url));

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

// 4. Runtime Message Listener
extApi.runtime.onMessage.addListener(
  (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
    if (!message || !message.type) return;

    switch (message.type) {
      case 'GATHER_TABS':
        gatherAllYouTubeTabs();
        sendResponse({ success: true });
        break;

      case 'PLAY_VIDEO':
        if (message.videoId && currentMasterTabId !== null) {
          const url = buildWatchUrl(message.videoId);
          extApi.tabs.update(currentMasterTabId, { url, active: true }).catch(() => {});
        }
        sendResponse({ success: true });
        break;

      case 'TOGGLE_SIDEBAR':
        if (currentMasterTabId !== null) {
          extApi.tabs.sendMessage(currentMasterTabId, { type: 'TOGGLE_SIDEBAR' }).catch(() => {});
        }
        sendResponse({ success: true });
        break;

      default:
        break;
    }
    return true;
  }
);

// 5. Keyboard Commands Listener
if (extApi.commands && extApi.commands.onCommand) {
  extApi.commands.onCommand.addListener(async (command: string) => {
    console.log('[QueueTube] Keyboard Command received:', command);
    const state = await getQueueState();

    if (command === 'gather-tabs') {
      await gatherAllYouTubeTabs();
    } else if (command === 'next-video') {
      if (state.queue.length > 0) {
        const nextItem = state.queue[0];
        if (currentMasterTabId !== null) {
          await extApi.tabs.update(currentMasterTabId, {
            url: buildWatchUrl(nextItem.videoId),
            active: true
          });
        }
      }
    } else if (command === 'toggle-queue') {
      if (currentMasterTabId !== null) {
        extApi.tabs.sendMessage(currentMasterTabId, { type: 'TOGGLE_SIDEBAR' }).catch(() => {});
      }
    }
  });
}

initBackground();
