# Status

`/devflow:factory status` only reads. Use Read on `<main>/factory/board.md` and, only for the count
line of point 2, on `<main>/factory/archive.md` if it exists; nothing else: no git, no forge, no
`board.sh`, no board or archive write.

If the board does not exist or has no rows, say "No features on the board." and stop.

1. **Table** of the non-terminal rows (every state except `merged` and `closed`), in board order:
   id, title, state, round, PR (the cell as it is; empty → `-`). No non-terminal rows → "No open
   features." instead of the table.
2. **Count line** `N merged, M closed`, over the rows of the board and of the archive table; an id
   in both counts once, with the state of the board. Only if at least one of the two is > 0.
3. **Next actions**, in this order, omitting empty groups:
   - `needs-human`: for each row, id, title and reason = the text after `→ needs-human` in the
     last log line of that id with that transition (none → "reason not in the log"). Action: fix
     the problem, set the state cell by hand to the phase to resume and run `/devflow:factory
     <id>`, or `/devflow:factory <id> abandon`.
   - Active (`interview`, `spec`, `spec-review`, `build`, `review`, `approve`):
     `/devflow:factory <id>` to resume each.
   - `pr-open`: the PR link from the PR cell; empty or `-` → the branch cell (status does not
     read the forge), waiting for review or merge.
   - Next in the queue: the first `queued` row in board order; action `/devflow:factory` if there
     are no active rows, otherwise `/devflow:factory` "when no feature is active".

Answer in the user's language. Then stop.
