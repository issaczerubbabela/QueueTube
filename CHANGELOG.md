# Changelog

What changed in each version of Cue, newest first. This file is shown in Cue's settings under **What's new**.

## 1.4.0

- **Stop after this**: choose it in a video's ⋮ menu and playback pauses when that video ends, instead of moving on. The row says "Stops after this". It clears itself once it has stopped playback, and there's only ever one.
- The panel header shows when the queue will finish: "1 h 12 min left · ends 10:42 PM".
- **Rearrange what's next** from the panel's ⋮ menu: **Shortest first**, **Longest first**, **By channel** or **Shuffle**. Only the videos after the one playing move, and Undo puts your own order back.
- A **filter** box above the queue finds videos by title or channel. Press Esc to clear it. Dragging to reorder is off while it's in use.

## 1.3.0

- **Pick up where you left off.** Cue remembers how far you got into each video and resumes from there whenever it plays it again, even after a browser restart. A link with a time in it (`t=1m30s`) starts at that time instead. Videos you've barely started, or have finished, start from the beginning.
- A red bar under each thumbnail in the queue and in History shows how much of the video you've watched, as on YouTube. It fills up as you watch, and is full once you've watched the video.
- A video counts as **watched** once it has ended or you've seen 90% of it. Turn on **Skip watched videos** in settings and the queue passes over watched videos when it moves on, leaving them in the queue. **Clear watched** in the panel's ⋮ menu removes them, and can be undone.

## 1.2.0

**QueueTube is now Cue** ("Cue for YouTube"). It's the same extension with a new name: your queue, History and settings are all still here, and there's nothing you need to do.

- A **Guide** at the top of settings shows everything Cue can do and how, grouped by task, with your current keyboard shortcuts and links to the matching settings. It opens when you first install Cue, and the panel's ⋮ menu and the popup link to it.
- **What's new** in settings lists the changes in each version. After an update, the popup and the panel's ⋮ menu say so until you've had a look.
- **Alt+click** a video anywhere on YouTube to add it to the queue without opening it, or **Alt+Shift+click** to play it next. That includes the suggestions next to the video you're watching. A "Queued" label confirms it.
- **Drag** a video from the YouTube page onto the queue panel to add it exactly where you drop it.
- An empty queue now tells you how to fill it: *Middle-click or Alt+click any video to queue it.*
- **Right-click** a YouTube video link on any site to **Add to queue** or **Play next**. Right-click a page or a selection and choose **Queue all YouTube links here** to queue every video it links to or mentions.

## 1.1.1

- The queue panel, popup and settings page now look like part of YouTube: the panel matches YouTube's playlist panel, the popup its menus and settings its settings pages, in both light and dark theme.
- The playing video's row is tinted from its thumbnail, as in YouTube's own playlists.
- Settings and the popup use YouTube's font on every system, including Firefox on Windows.
- Fixed: a second queue panel could appear after the extension updated.

## 1.1.0

- Only videos opened in a **new** tab are queued. Tabs you're already browsing in, YouTube Music and YouTube Studio are left alone.
- Closing the player tab no longer opens a new one. The queue waits until you open YouTube again.
- Reorder from the keyboard with `Alt+↑` / `Alt+↓`, or use **Play next**, **Move to top** and **Move to bottom** in a video's ⋮ menu.
- **Undo** after removing a video or clearing the queue.
- A **History** tab lists the videos you've moved past. Click one to watch it again.
- Import and export the queue as a text file of links.
- Video lengths, and the time left in the queue.
- Playing the next video automatically can be turned off, and ads no longer count as a video ending.
- New keyboard shortcuts:
  - `Alt+Shift+Q`: Gather open tabs
  - `Alt+Shift+.`: Play next
  - `Alt+Shift+,`: Play previous
  - `Alt+Shift+L`: Collapse or expand the panel
- Fixed: gathering several tabs at once could lose videos or queue the same tab twice.

## 1.0

- One player tab: every YouTube video plays in the same tab.
- Videos you open in other tabs are added to the queue, and the extra tab closes.
- **Gather tabs** sweeps every open YouTube video tab into the queue.
- A queue panel inside YouTube, with drag-and-drop reordering.
- The next video plays automatically when one ends.
- The queue is kept when you close the browser.
