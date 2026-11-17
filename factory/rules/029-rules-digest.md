# Rules 029-rules-digest

## Conventions
- The README lists the eval cases without a count — `README.md` `### Skill evals` says "seven cases" while `evals/` holds ten, and the count goes stale at every new case.
- A skill that commits files it may have created checks untracked files too (`git ls-files --others`), not only `git diff --quiet` — `skills/digest/SKILL.md` step 7 uses `diff --quiet`, which ignores an uncommitted `CLAUDE.md`, so a direct commit on the base branch could take in user content.
- A date or other value a skill reads from a committed factory file before using it in a shell command is checked against a strict regex, and an invalid value is treated as missing — `skills/digest/SKILL.md:47` puts the `Date:` from `factory/digest.md` into `--since='<last>'`, and a committed file is text controlled by other contributors that can break out of the quotes.
