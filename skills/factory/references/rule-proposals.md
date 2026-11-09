# Rule proposals

`rule-proposals.md` collects, in order, the `## Rule proposals` of spec-writer, implementers and
reviewers, one line each with author and round:

```markdown
- [ ] Patterns: New REST endpoint follows `src/api/orders/OrdersController.cs` — three endpoints (`src/api/orders/`, `src/api/users/`, `src/api/items/`) share its routing and error shape, and the new one diverged, so clients broke — review-code r1
```

Prepare the open `- [ ]` lines:
1. Drop duplicates and rules the project playbook or a file in `<dir>/factory/rules/` already has
   (mark them `- [dup]`); they stay out of the list.
2. Find **conflicts** (two proposals that exclude each other) and **dependents** (a proposal that
   only makes sense if another open proposal is approved). A rule whose base is already in the
   playbook is not a dependent.

**Conflicts, before the list.** For each pair ask with AskUserQuestion: rule A / rule B / None. The
chosen rule is approved (`[x]`), the other one (both with None) is discarded (`[-]`).

**List.** Show the remaining non-dependent proposals in a single text message, numbered from 1. Each
entry: number, playbook section, rule text, why, author and round. Skip the step if the list is
empty. Under the list explain how to answer, once:
- numbers separated by commas (`1,3,5`) approve those rules; the ones not listed are `[-]`;
- `all` / `none` (or the equivalent in the user's language, e.g. "tutte" / "nessuna");
- `<n>: <new text>` approves `n` with the rewritten text. The text runs to the end of the line, so
  several rewrites go on separate lines (e.g. `1,3, 5: <new text>`).

If the answer is not valid (number outside the list, same number repeated with different texts,
format not understood), explain the error and ask again; mark no line until the answer is valid.

**Dependents, after the list.** Base approved → ask AskUserQuestion **Approve / Edit / Discard**,
one at a time, a base before its dependents. Base discarded → `[-]` without asking.

Mark each line
`[x]` approved (with the final text if rewritten) or `[-]` discarded. Append the approved rules to
their section of `<dir>/factory/rules/<id>.md` (created if missing; a change reuses the same file).
Format: first line `# Rules <id>`, then only the sections that have rules (`## Conventions`,
`## Patterns`, `## Reusable code`, `## Don'ts`, `## Definition of Done`) in the playbook's order, one
rule per line as in the playbook (Definition of Done items as `- [<owner>] <item>`). If
`<dir>/.gitignore` has no line `!factory/rules/`, add it. Only if at least one rule was approved,
commit on the feature branch, in `<dir>`: `git -C "<dir>" add 'factory/rules/<id>.md' .gitignore &&
git -C "<dir>" commit -m "docs(factory): add feature rules"` with the footer `Factory: <id>` (a `'`
in the id is written `'\''`). Never edit `factory/playbook.md`, in `<dir>` or in `<main>`: the
script `rules.sh` merges the rules into it after the PR merges (Entry point, step 2b), and until
then every agent reads the rules files too. If a commit hook rejects it, `needs-human` with the
output. The rules reach the base branch with the PR. If the feature goes to `needs-human`, the file
stays and its open lines are shown when the feature is back in `approve`.
