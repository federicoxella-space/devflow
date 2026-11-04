# Spec check

Spawn `devflow:spec-checker` (foreground) with feature dir, config path, project
playbook path, output path `<feature dir>/spec-check.md`, `workdir: <dir>` if `<dir>` exists and
≠ `<session>`, and in the spawn `model: opus`, `effort: low` (the spawn parameter is what
guarantees the model; `review-code` stays `model: opus` with no fixed effort).
Read only the frontmatter `verdict`:
- `PASS` → validate `pr_title` (below), then go on.
- `GAPS` → resume the spec-writer (SendMessage, or a fresh spawn) with the path of `spec-check.md`,
  then check again. At most 2 corrections per spec-writer run.
- Still `GAPS` after the second correction → append each remaining gap to the spec's
  `## Open questions` as `- T<n> — <gap> (spec check)`; `spec-review` asks them to the user.

## pr_title validation
Right after every `PASS` (in a change, before the comparison with the snapshots) check the spec
frontmatter. Skip the checks only for a spec that already existed without `pr_title` before this
run (a feature resumed in build/approve, or a change whose `spec-c<n>.md` has none and whose
spec-writer run did not touch the field). A spec the spec-writer wrote or rewrote in this run
without `pr_title` fails check 1.
1. `pr_title` is present and matches
   `^(feat|fix|docs|chore|refactor|test|ci|perf|build|style|revert)(\([^()]+\))?!?: [^ ].*$`;
2. at most 72 characters and no `'`;
3. type consistent with `kind`: `hotfix` → `fix`; `feature` → one of `feat`, `refactor`, `docs`,
   `ci`, `perf`, `build`, `test`, `chore`;
4. `!` present if and only if `breaking` is set.

If a check fails, resume the spec-writer with `pr_title invalid: <failed checks>`; it fixes only
`pr_title`/`breaking` and replies with one line. After that fix repeat only this validation, not the
spec checker. Each fix counts in the limit of 2 corrections per spec-writer run, together with the
`GAPS` ones; past the limit append `- pr_title — <failed checks> (spec check)` to `## Open
questions`, asked in spec-review.
