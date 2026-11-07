# Forbidden files

First check for **forbidden files** yourself: list the changed paths with
`git -C "<dir>" status --porcelain -uall`. Forbidden:
- secrets or credentials, `.env*` (except `.env.example`);
- build output: any path segment `bin/`, `obj/`, `dist/`, `build/`, `target/`, `node_modules/`,
  `__pycache__/`;
- files under `factory/`;
- files over 1 MB that no task lists in `files (owned)`.

A pattern that `## Commit rules` in `config.md` explicitly allows (e.g. "commit `dist/`") is not
forbidden. Any forbidden file → `needs-human` with the list of paths; do not spawn the committer.

## Secrets scan

If no path check failed, scan the changed files with a dedicated scanner. The path checks above
always stay: `.env` is blocked even when it holds no recognised pattern. Run:

`bash "<base dir of this skill>/scripts/secrets-scan.sh" '<secrets_scan>' "<dir>"`

`secrets_scan` is the key in `config.md` (`auto | gitleaks | trufflehog | off`); a missing key is
`auto`. Act on the exit code:
- `0` (stdout `clean <tool>`) → append the line `secrets scan: clean <tool>` to `gate-r<round>.md`,
  then spawn the committer.
- `1` (stdout `findings <tool>`, then one `<file>:<line> <rule>` per finding) → write
  `<feature dir>/secrets-r<round>.md` with: the tool, the report lines (never the secret value),
  how to remove the secret (and rotate it if it is real), how to allow a false positive (gitleaks:
  a `gitleaks:allow` comment on the line, or `<file>:<rule>:<line>` in `.gitleaksignore`;
  trufflehog: a `trufflehog:ignore` comment on the line), and to set the state back to `build` and
  run `/devflow:factory` again so the gate and the scan restart. Then `needs-human` with that path;
  do not spawn the committer.
- `2` (reason on stderr) → `needs-human` with the stderr; do not spawn the committer.
- `3` with `skipped none` → log on the board `secrets scan: no gitleaks or trufflehog in PATH,
  model check only`, then spawn the committer. `3` with `skipped off` → spawn the committer, no log.
