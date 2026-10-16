// The Guide at the top of the settings page: every feature, grouped by what the user is trying
// to do, in one line each. To document a new feature, add an entry to the right group.
import type { Settings } from '../domain/queue';

export type BooleanSetting = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

/** A row on the settings page an entry can link to: a setting, or one of the "Your queue" actions. */
export type SettingAnchor = Exclude<BooleanSetting, 'sidebarCollapsed'> | 'export' | 'import' | 'history';

export interface GuideEntry {
  title: string;
  /** What it does and how to use it, in one line. */
  text: string;
  /** A command from the manifest; its current shortcut is shown next to the text. */
  shortcut?: string;
  setting?: SettingAnchor;
}

export interface GuideGroup {
  title: string;
  entries: GuideEntry[];
}

export const GUIDE: GuideGroup[] = [
  {
    title: 'Adding videos',
    entries: [
      {
        title: 'Auto-queue',
        text: "Open a YouTube video in a new tab and it's added to the end of the queue, then the tab closes. Tabs you're already browsing in are left alone.",
        setting: 'autoQueue',
      },
      {
        title: 'Middle-click',
        text: 'Middle-click a YouTube video link, on YouTube or any other site, to queue it without leaving what you are watching.',
      },
      {
        title: 'Gather open tabs',
        text: "Sweep every open YouTube video tab into the queue and close them: choose Gather open tabs in the panel's ⋮ menu or in the popup.",
        shortcut: 'gather-tabs',
      },
      {
        title: 'Return to the player',
        text: 'After you queue a video you opened in the foreground, Cue switches you back to the player tab.',
        setting: 'focusPlayerAfterQueueing',
      },
      {
        title: 'Duplicates',
        text: "A video that's already in the queue isn't added again, unless you allow duplicates.",
        setting: 'allowDuplicates',
      },
    ],
  },
  {
    title: 'Playing',
    entries: [
      {
        title: 'One player tab',
        text: 'Cue plays everything in one YouTube tab, with the queue panel next to the video. To move it, open the popup in another YouTube tab and choose Play queue in this tab.',
      },
      {
        title: 'Play a video',
        text: 'Click a video in the panel, or one under Up next in the popup, to play it now.',
      },
      {
        title: 'Play next',
        text: 'Skip to the next video in the queue with the Play next button in the panel or the popup.',
        shortcut: 'next-video',
      },
      {
        title: 'Play previous',
        text: 'Go back to the video before with the Play previous button in the panel or the popup.',
        shortcut: 'previous-video',
      },
      {
        title: 'Auto-advance',
        text: "When a video ends, the next one in the queue starts by itself. Ads don't count as the video ending.",
        setting: 'autoAdvance',
      },
      {
        title: 'Collapse the panel',
        text: "Fold the panel down to one line with the arrow in its header. It still shows what's next.",
        shortcut: 'toggle-queue',
      },
      {
        title: 'Watch outside the queue',
        text: "Choose Open in new tab in a video's ⋮ menu to watch it in a tab Cue leaves alone, or Open as YouTube playlist in the panel's ⋮ menu to play the whole queue as a YouTube playlist.",
      },
    ],
  },
  {
    title: 'Organizing',
    entries: [
      {
        title: 'Reorder',
        text: 'Drag a video up or down the panel, or select it and press Alt+↑ or Alt+↓.',
      },
      {
        title: 'Play next, top or bottom',
        text: "Choose Play next, Move to top or Move to bottom in a video's ⋮ menu.",
      },
      {
        title: 'Remove',
        text: "Choose Remove from queue in a video's ⋮ menu, or select it and press Delete. Clear queue in the panel's ⋮ menu removes everything.",
      },
      {
        title: 'Undo',
        text: 'Removed a video or cleared the queue by mistake? Choose Undo in the message that appears at the bottom of the panel.',
      },
      {
        title: 'Remove after playing',
        text: 'Keep the queue short: videos leave it once you move past them, and stay in History.',
        setting: 'removeAfterPlaying',
      },
    ],
  },
  {
    title: 'Picking up where you left off',
    entries: [
      {
        title: 'Your queue is kept',
        text: 'The queue and your place in it are kept when you close the browser. Open YouTube again and carry on.',
      },
      {
        title: 'History',
        text: "The History tab in the panel lists the videos you've moved past. Click one to watch it again.",
        setting: 'history',
      },
    ],
  },
  {
    title: 'Your data',
    entries: [
      {
        title: 'Stays in this browser',
        text: "Your queue, History and settings are stored in this browser only. There's no account, and nothing is synced.",
      },
      {
        title: 'Video lengths',
        text: "To show how long each video is, Cue reads part of its YouTube page, without your cookies. You can turn this off.",
        setting: 'lookUpDurations',
      },
      {
        title: 'Export',
        text: "Save the queue as a text file of links, here or with Export to file in the panel's ⋮ menu.",
        setting: 'export',
      },
      {
        title: 'Import',
        text: "Add every YouTube link in a text file to the queue, here or with Import from file in the panel's ⋮ menu.",
        setting: 'import',
      },
    ],
  },
];
