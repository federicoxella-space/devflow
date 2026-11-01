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
