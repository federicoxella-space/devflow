# Deferring logic

Only behaviour and requirements; project conventions go through rule proposals (6b).
1. Judge it against the request and the answers so far. Recommend **Integrate** when it is coherent
   with them (contradicts no decision) and does not substantially widen the feature (no new page,
   integration or data model). Recommend **Defer** otherwise, and always when the request fixes
   something that should already work.
2. Ask with AskUserQuestion: **Integrate / Defer**, recommended option first. Write the question and
   the answer in `## Interview` as the next `Q<n>`/`A<n>`.
3. Integrate → it is part of the feature from now on: keep asking about its gaps.
4. Defer → if **issues-enabled** is `true`, open one issue per logic with **create-issue**, in
   the language of `feature.md`: title = short title; body (in a temp file) = what the logic does,
   what was said about it, footer `Deferred from <id> — <feature title>`.
   Otherwise (`false`, CLI missing or not authenticated, create-issue failed) → queue it: next free
   NNN, write `features/<new id>/feature.md` with the logic and the same footer, add the row as
   `queued` with a log line, and append `- <new id> — <logic> — deferred from <id>` to
   `factory/backlog.md` (create it with the heading `# Factory backlog`). The board is gitignored,
   so the backlog is the committed record.
5. Right after, append the line to `## Deferred` in the feature playbook, so a resume does not open
   it twice. A deferred logic is out of scope for this feature.
