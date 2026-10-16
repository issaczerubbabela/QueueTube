# Only fresh tabs are auto-queued

Auto-queue used to close *any* non-player tab the moment it showed a watch page. That included a second YouTube tab the user was browsing on purpose, YouTube Music tabs (`music.youtube.com` matched `includes('youtube.com')`), and the tab YouTube redirects to after "Save as playlist". Now only a **fresh tab** is auto-queued: one opened while QueueTube was running whose first real page is a www.youtube.com watch page. Once a tab has shown any other page it is settled and left alone. The manual **Gather** action still sweeps all watch tabs.

**Considered:** auto-queue every watch navigation outside the player tab, with a per-tab bypass flag. Rejected: the bypass leaked into URLs (`queueTubeBypass=1`), lived in service-worker memory that MV3 discards, and still closed tabs the user was actively using.

**Consequence:** tabs created in the first seconds after browser start-up are treated as session restore, not fresh, so launching the browser never closes tabs. Clicking a video inside an already-open second YouTube tab plays it there rather than queueing it.

In the same spirit, closing the player tab no longer opens a new tab for the next queued video (1.0 did this, including when the whole window was closing). The queue simply waits until a YouTube tab exists again.
