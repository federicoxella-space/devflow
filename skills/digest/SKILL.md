---
name: digest
description: Review the rules of the project playbook against recent evidence and propose to change, merge, remove or promote them (CLAUDE.md, .claude/rules, automatic check); the user approves before anything is written.
disable-model-invocation: true
---

# Factory rules digest

You re-read the rules of `factory/playbook.md`, look for evidence that each one is respected or
violated, and propose how to simplify them or make them more effective. You write only after the
user answers, save a report in `factory/digest.md` and make one local commit; you never push and
you never start a feature.

Talk to the user in their language. Rule texts keep the language they already have.

## 1. Entry point

`git rev-parse --show-toplevel` must succeed; compute `<session>` and `<main>` as in **Main
checkout** of `../factory/SKILL.md` (relative to this skill's base directory). Every file of
`factory/` is read and written in `<main>/factory/`. If `<main>/factory/config.md`,
`<main>/factory/playbook.md` or `<main>/factory/board.md` is missing, tell the user to run
`/devflow:init` and stop.

## 2. Read

Read `<main>/factory/config.md`, `playbook.md`, `<main>/factory/rules/*.md`, `<main>/CLAUDE.md`,
`<main>/.claude/rules/*.md`, `<main>/factory/digest.md` (if present), `board.md` and `archive.md`
(if present). Nothing else.

Only `playbook.md` is analysed. The other files are read to find duplicates and are not modified,
except for the rules a promotion adds (step 7).

`<last>` is the date on the `Date:` line of `digest.md`; if the file is missing, there is no limit.

## 3. Analysed features

The ids that have a log line in the board or the archive dated after `<last>` and a folder
`<main>/factory/features/<id>/`. With no such folder, go on with the other sources and say so in
the report.

## 4. Evidence for each rule

A rule is every `- ` line of every section of the playbook, Definition of Done included. For each:
- **Feature files:** `reviews/*.md` that cite the rule (text or path), `gate-r*.md` that failed on
  what the rule covers, `[dup]` lines of `rule-proposals.md` that repeat it.
- **Cited paths:** for every path in backticks, check with Glob that it still exists in `<main>`.
- **Git history:** `git -C "<main>" log '<base_branch>' --since='<last>' --grep='^Factory: '
  --format='%H %s'` (without `--since` if `<last>` is missing); for the `fix` or rework commits
  that touch the rule's paths, `git -C "<main>" show --stat '<hash>'`.
- **Current code:** Grep limited to the paths and patterns the rule names. A rule with no path or
  verifiable pattern has no such source.

## 5. Outcomes

One outcome per rule:
- **keep**: evidence in favour, nothing to change.
- **no evidence**: no proof either way. No proposal, and never a removal.
- **modify**: rewritten text or other section (for example a renamed path).
- **merge**: duplicate or overlapping rule, also with a rule of `CLAUDE.md`, `.claude/rules/` or
  `factory/rules/`.
- **remove**: the cited paths are gone with no replacement, or another rule or check supersedes it.
- **promote to `CLAUDE.md`**: a rule about the project's code, not about the factory process, with
  evidence in the period.
- **promote to `.claude/rules/<file>.md`**: same condition, but only for some paths: the file has
  `paths:` in its frontmatter with the globs. `<file>` is kebab-case, `^[a-z0-9]+(-[a-z0-9]+)*$`.
- **promote to automatic check**: mechanically verifiable and violated at least 2 times in the
  period.

Definition of Done items are never promoted to `CLAUDE.md` or `.claude/rules/`. A destination the
playbook forbids (for example `.claude/` in its Don'ts) is never proposed. A rule whose check is
already queued (id in the previous `digest.md`, board row not `merged` or `closed`) has the outcome
"check pending `<id>`" and no proposal.

## 6. Approval

Show a numbered list of the proposals only: number, outcome, section, current text, proposed text
or destination, evidence in short. Then the count of "keep" and "no evidence" rules. Under the list
explain once how to answer, as in `../factory/references/rule-proposals.md`:
- numbers separated by commas (`1,3`) approve those proposals; the others are rejected;
- `all` / `none` (or the equivalent in the user's language, e.g. "tutte" / "nessuna");
- `<n>: <new text>` approves `n` with that text as the new rule text in its destination. On a
  "remove" it becomes "modify"; on an automatic check it becomes the description of the feature.
  The text runs to the end of the line.

If the answer is not valid (number outside the list, same number repeated with different texts,
format not understood), explain the error and ask again. With an empty list ask nothing. Until a
valid answer, write nothing.

## 7. Apply

Only after the answer. Before the first write, note which of the files to touch already have
changes: `git -C "<main>" diff --quiet -- '<file>'` (non-zero = changes already there).

- **modify, merge, remove:** edit `<main>/factory/playbook.md`.
- **promote:** remove the rule from the playbook and append it at the end of `<main>/CLAUDE.md`
  (created if missing) or of `<main>/.claude/rules/<file>.md` (created if missing, with
  `paths:` in the frontmatter).
- **automatic check:** the rule stays in the playbook. Title without `|` or line breaks. Slug:
  kebab-case ASCII lowercase, at most 40 characters, matching `^[a-z0-9]+(-[a-z0-9]+)*$`. Run
  `bash "<base dir of ../factory>/scripts/board.sh" "<main>" new '<slug>' queued '<title>' 'from digest'`;
  it prints the id. Arguments go in single quotes, a `'` inside written `'\''`. Then write
  `<main>/factory/features/<id>/feature.md` with the check to build and the text of the rule, and
  append `- <id> — <check> — from digest` to `<main>/factory/backlog.md` (created with the heading
  `# Factory backlog`). If `board.sh` exits non-zero, show its stderr to the user, make no other
  board write and go on with the rest.

## 8. Report

Write `<main>/factory/digest.md` at every run, also when nothing was approved (it is overwritten):

```markdown
# Rules digest

Date: YYYY-MM-DD HH:MM
Features: <id>, <id>

| # | section | rule | evidence | outcome |
|---|---------|------|----------|---------|
```

`Date:` is local time, in the format of the board log. With no feature folders, `Features:` is the
note "no local feature folders". The table lists all the analysed rules, rule text cut at about 80
characters, a `|` written `\|`. Outcome is one of: keep, no evidence, modified, merged, removed,
moved to `<file>`, check queued `<id>`, check pending `<id>`, rejected.

## 9. Commit

First the `.gitignore`: if it has no `!factory/digest.md`, add it, but only if
`git -C "<main>" diff --quiet -- .gitignore` succeeds. If it has other changes, do not touch it and
say that this is the reason there is no commit.

Commit only if all hold: `git -C "<main>" branch --show-current` is `base_branch`;
`git -C "<main>" diff --cached --quiet` succeeds (empty stage); none of the files touched had
changes before step 7. Add only the files touched among `factory/playbook.md`, `factory/digest.md`,
`CLAUDE.md`, `.claude/rules/<file>.md`, `factory/backlog.md`, `.gitignore`:

```
git -C "<main>" add <touched files>
git -C "<main>" commit -m 'docs(digest): apply rules digest'
```

The message is fixed: never put user text in it. Never push. If a condition fails, do not commit:
say which one, and which files to commit by hand.

## 10. Summary

Tell the user, briefly: outcomes applied, ids queued, the outcome of the commit, and "push before
the next `/devflow:factory`" (the script `rules.sh` updates the base branch with a fast-forward).
