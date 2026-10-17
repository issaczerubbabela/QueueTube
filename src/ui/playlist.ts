// Queueing a whole playlist from a page (the panel, or a /playlist page): asks first when it is
// long, then says what happened.
import { PlaylistReply, send } from '../shared/messages';
import { pluralVideos } from './transfer';

function describe(reply: PlaylistReply): string {
  if (reply.status === 'failed') return "Couldn't read that playlist";
  if (reply.status === 'confirm') return 'Not queued';
  const partial = reply.complete ? '' : ` (YouTube sent only ${pluralVideos(reply.total)})`;
  if (reply.added === 0) return `${reply.total === 1 ? 'That video is' : 'Those videos are'} already queued${partial}`;
  return `Queued ${pluralVideos(reply.added)} from the playlist${partial}`;
}

/** Resolves to a short message to show. `ask` defaults to the page's confirm dialog. */
export async function queuePlaylist(listId: string, ask: (question: string) => boolean = (q) => window.confirm(q)): Promise<string> {
  let reply = await send({ type: 'playlist/queue', listId });
  if (reply.status === 'confirm') {
    if (!ask(`Queue all ${reply.total} videos?`)) return 'Not queued';
    reply = await send({ type: 'playlist/queue', listId, confirmed: true });
  }
  return describe(reply);
}
