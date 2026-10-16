# QueueTube

QueueTube turns YouTube into a single-player experience: one browser tab plays videos, and every other video the user opens becomes an entry in a queue.

## Language

**Player tab**:
The one browser tab on www.youtube.com that QueueTube plays videos in. There is at most one.
_Avoid_: master tab, master player

**Queue**:
The ordered list of **Entries** the user intends to watch. It may contain the entry currently playing.
_Avoid_: global queue, playlist

**Entry**:
One occurrence of a video in the **Queue**. The same video may appear as several entries when duplicates are allowed, so an entry is identified by its own id, not the video id.
_Avoid_: item, queue item

**Current entry**:
The **Entry** the **Queue** is positioned at. It stays put when the **Player tab** wanders off to a video that is not in the queue, so "next" still means the entry after it.
_Avoid_: current video

**Now playing**:
Whatever video the **Player tab** is showing right now. It is the **Current entry** only when that entry's video is on screen.

**History**:
Videos that were advanced past, most recent first, capped in length.

**Advance**:
Moving the **Current entry** forward, either because the playing video ended (when **Auto-advance** is on) or because the user skipped. With **Remove after playing** on, the entry left behind leaves the **Queue**.

**Fresh tab**:
A tab the user opened while QueueTube was running that has not yet shown any page other than a new-tab page. Only a fresh tab landing on a watch page is **Auto-queued**.

**Auto-queue**:
Taking a **Fresh tab** that opened a YouTube video (www.youtube.com, m.youtube.com or a youtu.be link), adding the video to the **Queue** as an **Entry**, and closing the tab.
_Avoid_: auto-gather, intercept

**Gather**:
A one-off user action that sweeps every open www.youtube.com watch tab (other than the **Player tab**) into the **Queue** and closes those tabs.
_Avoid_: consolidate

**Free tab**:
A YouTube tab the user explicitly opened outside QueueTube (e.g. "Open in new tab"). It is never **Auto-queued** or **Gathered**.

## Relationships

- There is at most one **Player tab**; the **Queue** exists whether or not there is one.
- A **Queue** has zero or one **Current entry**.
- **Auto-queue** applies only to **Fresh tabs**; **Gather** applies to any non-**Free**, non-**Player** watch tab.
- YouTube Music, YouTube Studio and other youtube.com subdomains are outside QueueTube's world: never a **Player tab**, never **Auto-queued**, never **Gathered**.

## Example dialogue

> **Dev:** "The user clicked a recommendation in the **Player tab**. Is that video the **Current entry** now?"
> **Domain expert:** "No. **Now playing** changes, but the **Current entry** stays where it was, so pressing next plays the entry after it."

## Flagged ambiguities

- "master" was used for the **Player tab**. Resolved: say **Player tab**.
- "auto-gather" meant both closing *new* tabs and sweeping *all* tabs. Resolved: **Auto-queue** is the automatic, fresh-tab-only behaviour; **Gather** is the manual sweep.
- "currentVideoId" could not tell two **Entries** for the same video apart. Resolved: the queue tracks the **Current entry** by entry id.
