# The background worker is the only writer of queue state

Every UI surface (sidebar, popup, options) used to read state from `storage.local`, change it in memory, and write it back. Those writes raced each other and the background worker: gathering five tabs while the sidebar updated the current video lost entries, and the same tab could be queued twice. Now UI surfaces only *send commands* (`shared/messages.ts`) and *observe* state via `storage.onChanged`. The background worker applies each command through the pure queue model (`domain/queue.ts`) inside one serialized mutation queue, so commands never interleave.

**Considered:** keeping writes in each context with an optimistic version check (compare-and-swap on a revision number). Rejected: `storage.local` has no atomic CAS, and retry loops would be spread across four contexts.

**Consequence:** a UI action waits for one message round-trip before the change shows, and every new action needs a command in the protocol.
