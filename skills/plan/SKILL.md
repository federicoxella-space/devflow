---
name: plan
description: Plan a big goal as a roadmap of milestones split into features, queue each feature on the devflow factory board in order, and save the roadmap in factory/roadmap.md.
argument-hint: "[<goal>]"
disable-model-invocation: true
---

# Factory plan

You turn a goal into a roadmap: milestones, each split into features that `/devflow:factory` runs
one at a time, in order. You write `factory/roadmap.md`, queue the features on the board and make
one commit; you never push and you never start a feature.

Talk to the user in their language; the roadmap and the `feature.md` files are written in it too.
Ask **one question at a time** and wait for the answer: the answer shapes the next question. Use
AskUserQuestion when the question has natural options, otherwise ask in plain text. Before every
choice, give a short context in two or three lines: what is being decided, why it comes up now, and
what each option implies. The user must be able to choose without opening any file.

## 1. Entry point

`git rev-parse --show-toplevel` must succeed; compute `<session>` and `<main>` as in **Main
checkout** of `../factory/SKILL.md` (relative to this skill's base directory). Every file of
`factory/` is read and written in `<main>/factory/`. If `<main>/factory/config.md`,
`<main>/factory/playbook.md` or `<main>/factory/board.md` is missing, tell the user to run
`/devflow:init` and stop.

## 2. Read

Read `<main>/factory/config.md`, `playbook.md`, `<main>/factory/rules/*.md` (approved rules not yet
merged into the playbook; they apply like it), `board.md`, `archive.md` (if present),
`<main>/factory/roadmap.md` (if present) and the code that matters for the goal. Never read the
issues of the forge.

## 3. Existing roadmap

If `roadmap.md` exists, show it with the state of every feature. For each id, the state is the one
of its row in the board; otherwise of its row in the archive; otherwise `unknown`. Shown states:
`queued`, `in progress` (`interview`, `spec`, `spec-review`, `build`, `review`, `approve`,
`needs-human`), `pr-open`, `merged`, `closed`. A milestone is **completed** when at least one of its
features is `merged` and all the others are `merged` or `closed` (an abandoned feature does not
block it). Then ask what the user wants to change, starting from step 4.

## 4. Interview

The goal is the argument, or ask for it if missing (or, with a roadmap, what to change). Ask until
milestones and features are clear: users and flows, what comes first and why, what "done" means for
each milestone. Size each feature for **one factory run**: one spec, one pull request. Split what
does not fit.

With an existing roadmap the user can:
- add milestones and features;
- remove or move (also to another milestone) features that are `queued`;
- reorder milestones whose features are all `queued`.

Everything else stays as it is: say so if the user asks to change a started or finished feature.

## 5. Approval

Show the whole roadmap: for each milestone number, title, goal and done-when criterion; for each
feature title, description and, if it already exists, its state. Ask with AskUserQuestion:
**Approve / Request changes / Reject**.
- Request changes → change the roadmap, show it again and ask again.
- Reject → write nothing and stop.
- Approve → step 6. Until then nothing is written.

## 6. Apply

Every board write goes through `bash "<base dir of ../factory>/scripts/board.sh" "<main>" ...`
(**Shared board** in `../factory/SKILL.md`), never Edit or Write. Arguments taken from the user's
text go in single quotes, a `'` inside written `'\''`. Re-read `board.md` before each write.

- **New feature.** Title without `|` or line breaks (`|` → `/`, line break → space). Slug: kebab-case
  ASCII lowercase made from the title, at most 40 characters, matching
  `^[a-z0-9]+(-[a-z0-9]+)*$`. Run `new '<slug>' queued '<title>' 'from roadmap'`; it prints the id.
  Then write `<main>/factory/features/<id>/feature.md` with the description and a line
  `Roadmap: <Mn> <milestone title> — <milestone goal>`.
- **Removed feature.** Only if its row is still `queued` (otherwise leave it and tell the user):
  `set '<id>' state=closed note='removed from roadmap'`, then `archive '<id>'`. The feature
  disappears from the roadmap.
- **Order.** Walk the `queued` features of the roadmap in order (milestone, then feature). If one is
  before its predecessor in the board, run `move '<id>' after '<predecessor>'`. `queued` rows that
  are not in the roadmap are not moved.
- If `board.sh` exits non-zero: show its stderr, make no other board write, write the roadmap with
  only the features that have an id, and tell the user to run `/devflow:plan` again.

## 7. Roadmap file

Write `<main>/factory/roadmap.md`. Milestones are numbered `M1`, `M2`, ... in order of creation; a
number never changes; a milestone left without features is removed. No state is saved: the board
and the archive hold it.

```markdown
# Roadmap

<overall goal, one paragraph>

## M1 — <title>
Goal: <goal>
Done when: <completion criterion>

- 029-login — <title>: <one-line description>
```

## 8. Commit

Commit only if all hold: `git -C "<main>" branch --show-current` is `base_branch`;
`git -C "<main>" diff --cached --quiet` succeeds (empty stage); `factory/roadmap.md` appears in
`git -C "<main>" status --porcelain`. If `.gitignore` has no `!factory/roadmap.md`, add it, but only
if `git -C "<main>" diff --quiet -- .gitignore` succeeds (no other change there). Then:

```
git -C "<main>" add factory/roadmap.md .gitignore
git -C "<main>" commit -m 'docs(plan): create roadmap'
```

`.gitignore` is added only if you changed it now. Use `'docs(plan): update roadmap'` when the
roadmap already existed. The message is fixed: never put user text in it. Never push. If a
condition fails, do not commit: say which one, and which files to commit by hand.

## 9. Summary

Tell the user, briefly: ids created, removed and moved, the outcome of the commit, and
"run `/devflow:factory`" to execute the features in order.
