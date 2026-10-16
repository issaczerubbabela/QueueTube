# Cue for YouTube

A browser extension (formerly **QueueTube**) that plays YouTube in one Player tab and puts every other video you open into a Queue. The repo, the gecko add-on id `queuetube@issac.com` and the panel's element id `queuetube-host` keep the old name on purpose. The add-on id keeps existing Firefox installs updating. The element id is how a newly updated content script finds and removes the previous version's leftover panel. Use "Cue" in anything a user sees.

## Working on tickets

The roadmap (1.2 → 1.5) is spec **#1** on GitHub, split into tickets **#2–#20**. Each ticket says its release and branch.

1. **Read first:** the ticket and its parent spec #1 (`gh issue view <n> --comments`), [`CONTEXT.md`](CONTEXT.md) (glossary: use its terms in code, UI and tests), [`docs/adr/`](docs/adr/), [`docs/roadmap.md`](docs/roadmap.md) (the decisions log) and [`docs/architecture.md`](docs/architecture.md).
2. **Check blockers:** don't start a ticket while any issue it is blocked by is still open (`gh api repos/issaczerubbabela/QueueTube/issues/<n> --jq .issue_dependencies_summary`).
3. **Branch:** work on the release branch the ticket names. If it doesn't exist yet, create it from the previous release branch, or from `main` if that release has already been merged.
4. **"Check first" steps:** some tickets start by checking whether an approach works. Post the findings as a comment on the ticket before building. If the approach doesn't work, stop and ask the owner. Don't quietly change the design.
5. **Build it test-first where there is logic.** New rules go into the pure domain modules (Queue in → new Queue plus the video to play, with an injectable Clock), tested with Vitest like the existing domain tests. Browser-facing behaviour is checked end-to-end instead. No mocked browser layer (decided in spec #1).
6. **Done means:** acceptance criteria met; `npm test` and `npm run build` pass; an entry in the Guide (settings page) and a line under the release's heading in `CHANGELOG.md`; verified end-to-end per [`docs/e2e.md`](docs/e2e.md).
7. **Finish:** one commit per ticket on the release branch (`feat: <ticket title> (#<n>)`), push the branch, comment on the ticket with what was done and the commit, then close it. Tickets on unmerged branches don't close themselves.
8. **Ship tickets** (#8, #12, #17, #20) are `ready-for-human`. An agent may do the verification and the version bump, but only the owner merges a release branch into `main`.
9. **Architecture rules that still apply:** the background script is the only writer of state; UI and content scripts send Commands (ADR 0001). Only fresh tabs are Auto-queued (ADR 0002).

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues on issaczerubbabela/QueueTube (via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: the glossary is `CONTEXT.md` at the repo root, decisions are in `docs/adr/`. See `docs/agents/domain.md`.
