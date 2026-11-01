# Rule proposals

`rule-proposals.md` collects, in order, the `## Rule proposals` of spec-writer, implementers and
reviewers, one line each with author and round:

```markdown
- [ ] Patterns: New REST endpoint follows `src/api/orders/OrdersController.cs` — three endpoints (`src/api/orders/`, `src/api/users/`, `src/api/items/`) share its routing and error shape, and the new one diverged, so clients broke — review-code r1
```

Prepare the open `- [ ]` lines:
1. Drop duplicates and rules the project playbook already has (mark them `- [dup]`); they stay out
   of the list.
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
`[x]` approved (with the final text if rewritten) or `[-]` discarded. Add the approved rules to their
section of `factory/playbook.md` (Definition of Done items as `- [<owner>] <item>`, appended at the
end so existing `DoD-<n>` ids do not move). Only if at least one rule was approved, commit it on the
feature branch, in `<dir>`: `git -C "<dir>" add factory/playbook.md && git -C "<dir>" commit -m
"docs(factory): update playbook"` with the footer `Factory: <id>`. When `<dir>` is not `<main>`
(`worktree` mode or `checkout:`) add the rules to `<dir>/factory/playbook.md`; never edit `factory/playbook.md` in
`<main>`, which other sessions share. If a commit hook rejects it, `needs-human` with the output. The rules
reach the base branch with the PR. If the feature goes to `needs-human`, the file stays and its open lines are
shown when the feature is back in `approve`.
