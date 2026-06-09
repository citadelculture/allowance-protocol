# X Post State

X post state reconciles validated post-publication evidence with `launch/x_posts.json`.

Use it to keep public distribution honest: a launch post should not be marked `posted` unless there is matching X post execution evidence.

## Command

```bash
npm run x-post-state -- ops/x_post_execution_records.json
```

The default records file starts empty because no X post has been made from this workspace.

## What It Checks

- every evidence record passes `npm run x-post-execution-evidence`
- every executed post id exists in `launch/x_posts.json`
- duplicate `evidenceId` values are rejected
- duplicate execution evidence for the same post id is rejected
- approved packet text still matches the launch post text
- any `posted` launch post status has matching valid execution evidence

## Boundary

This report does not post to X, approve external actions, alter launch metrics, send outreach, sign wallet payloads, start pilot traffic, move funds, store secrets, or unlock token work.

Verified post execution still does not prove adoption, merchant usage, pilot completion, or token readiness. Those claims require their own evidence gates.
