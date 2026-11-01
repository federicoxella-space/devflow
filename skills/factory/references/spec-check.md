# Spec check

Spawn `devflow:spec-checker` (foreground) with feature dir, config path, project
playbook path, output path `<feature dir>/spec-check.md`, `workdir: <dir>` if `<dir>` exists and
≠ `<session>`, and in the spawn `model: opus`, `effort: low` (the spawn parameter is what
guarantees the model; `review-code` stays `model: opus` with no fixed effort).
Read only the frontmatter `verdict`:
- `PASS` → go on.
- `GAPS` → resume the spec-writer (SendMessage, or a fresh spawn) with the path of `spec-check.md`,
  then check again. At most 2 corrections per spec-writer run.
- Still `GAPS` after the second correction → append each remaining gap to the spec's
  `## Open questions` as `- T<n> — <gap> (spec check)`; `spec-review` asks them to the user.
