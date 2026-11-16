# devflow

A small software factory for Claude Code, built from one orchestrator skill, nine subagents and
markdown files. You describe a feature; devflow interviews you, writes a spec, builds it (in
parallel when it can), runs build/lint/test, reviews it and opens a pull request. It never merges
to your base branch on its own.

```
interview → spec → parallel build → gate → parallel reviews → approve → PR
```

## Requirements

- Claude Code
- `git` and a remote `origin`
- The CLI of your forge, authenticated (`/devflow:init` detects the forge from the remote):
  - GitHub: `gh` (`gh auth status`)
  - GitLab, also self-managed: `glab` (`glab auth status --hostname <host>`)
  - Azure DevOps: `az` with the `azure-devops` extension (`az login`); Azure DevOps Server is
    prepared but not verified
  - any other platform: nothing, in **git only** mode the factory pushes the branch and you open
    the pull request by hand
- Node.js (`npx`), only for browser UI reviews (Playwright MCP `0.0.83`, pinned in `.mcp.json`)

## Install

```
/plugin marketplace add federicoxella-space/devflow
/plugin install devflow@devflow
```

## Usage

### 1. Set up a repo: `/devflow:init`

Run once in each repo you want to use the factory in.

- **Existing project**: detects the stack (Node and its frontends, Angular, .NET, Maven, Gradle,
  Python, Go, Rust, PHP, Ruby, Makefile/justfile; monorepos and several apps) and proposes the
  `build`, `lint` and `test` commands for you to confirm, preferring the project's own scripts.
  For Maven and Gradle it proposes the lint of the configured plugins (Checkstyle, Spotless, PMD,
  ktlint, detekt); for Python the type check (mypy, pyright) as build, and the `uv run` or
  `poetry run` runner taken from the lockfile.
  An existing project with an unknown stack is asked for its commands, never scaffolded.
- **Empty repo**: interviews you one question at a time (what you are building, constraints,
  preferences), recommends a stack for you to approve, and queues a feature that scaffolds the
  project.
- Detects the **forge** from the `origin` remote (GitHub, GitLab, Azure DevOps); for a company
  instance it asks the platform and its host. Any other platform works in **git only** mode.
- Asks where new features run (`workspace`: **Ask**, **Branch** or **Worktree**) and proposes
  `worktree_setup`, the command that prepares a new worktree (e.g. `npm ci`).
- Writes `secrets_scan: auto` and, if neither gitleaks nor trufflehog is installed, suggests
  installing one.
- Writes an empty `budget_tokens` (see **Token usage and budget** below).
- Optionally enables **automatic releases** (GitHub and GitLab, see below).
- Drafts the **project playbook**: conventions, patterns, reusable code and the Definition of
  Done. You review it before it is written.
- Run it again to redo any of **Config**, **Forge**, **Release**, **Playbook** (you pick which);
  it never touches the board. Projects set up before forges existed keep working as GitHub.

Init never commits. Then commit what it created:

```bash
git add factory/config.md factory/playbook.md .gitignore
git add .devflow .github/workflows/devflow-release.yml   # GitHub, with automatic releases
git add .devflow .gitlab-ci.yml                          # GitLab, with automatic releases
git commit -m "chore: set up devflow factory"
```

### 2. Build a feature: `/devflow:factory <feature description>`

1. **Interview**: first, if `workspace` is `ask`, whether the feature runs as a **branch** in your
   checkout or in a separate **git worktree**; then questions one at a time until nothing has to be guessed. New logic that comes up
   (here or at spec approval) is either integrated, if it fits the feature, or deferred: an issue on
   the forge (labels `devflow`, `deferred`, `enhancement`; tags on Azure DevOps) when the repo
   accepts issues, otherwise a queued feature on the board, recorded in `factory/backlog.md`.
2. **Spec**: before you see it, a spec check (opus) verifies that every task can be executed without
   open design decisions; gaps go back to the spec-writer (at most twice) and the remaining ones are
   asked to you as open questions. You first read the expected result (a usage scenario with a concrete example), then
   you approve the spec, the done checklist (acceptance criteria + Definition of Done)
   and whether it is a `feature/` or a `hotfix/` branch. You also approve the PR title and the
   version bump it produces (`PR title: feat(scope): ... → bump minor`); a breaking change has a
   `!` in the title and an explicit warning saying what breaks.
3. **Build**: independent tasks are implemented in parallel by one agent, the implementer, on
   sonnet (`implementer_model` in `config.md`, default `sonnet / medium`). If an implementer stops
   for a missing design decision, the spec-writer completes the spec and the work resumes. If it
   cannot get build, lint and tests green, if the gate fails twice in the same round, or if a
   reviewer flags the same blocking item again, the task goes to a new implementer on opus
   (`escalation_model`, default `opus / medium`) with a handover of the previous attempt; if that
   fails too, the factory stops and asks you. `complex` tasks (security-sensitive, concurrent,
   destructive migrations) start directly on opus. Then build, lint and tests must pass. The factory refuses to commit secrets,
   `.env` files, build output or large unowned binaries. Before each commit it scans the changed
   files with gitleaks (or trufflehog), as set by `secrets_scan` in `config.md` (`auto`, `gitleaks`,
   `trufflehog`, `off`). A finding stops the feature in `needs-human` with a report (file, line, rule,
   never the value) on how to remove the secret or allow a false positive; with no scanner installed
   the model's own check is used and the board log says so. The security reviewer runs the same
   scanner on the PR diff. The changes are committed as
   Conventional Commits, one commit per task.
4. **Reviews**: code (opus), security, UX and UI reviewers run in parallel; blocking findings go back to
   the implementers.
5. **Approval**: the approver checks evidence for every checklist item.
6. **Rule proposals**: conventions the agents discovered are shown in a single list, each with the
   reason it came up, and you approve them in one answer (`1,3`, `all`, `none`, or `2: new text` to
   rewrite one). Conflicting rules are asked before the list, rules that depend on another after
   it. Approved ones are saved in `factory/rules/<id>.md` and committed in the feature branch, so
   parallel features never conflict on the playbook; agents read them from the first moment. After
   the PR merges, the next factory run adds them to the end of the playbook sections, removes the
   file and publishes one commit on the base branch (if the push fails, it says so and retries at
   the next run).
7. **Pull request** on the configured forge (merge request on GitLab), titled in Conventional
   Commits format (`feat(scope): ...`), so a squash merge leaves a conventional commit on the base
   branch. The title is the one you approved in the spec. In git only mode the branch is pushed and the title and description
   are in `factory/features/<id>/pr.md` for you to open the PR by hand.

You review and merge the PR. On the next run the factory checks the open PRs: merged ones become
`merged`, their local branch is deleted and the base branch is updated; PRs closed without merge
become `closed` and keep their branch. In git only mode merges are detected from git (merge
commit, fast-forward, rebase, squash); a squash merge with resolved conflicts is not detected, so
you set that row to `merged` on the board by hand.

**Archive.** So that the board read on every run stays short, finished features leave it: every
`closed` feature, and every `merged` one once its local branch is gone, moves with all its log
lines to `factory/archive.md` (same format as the board, created on the first move); log lines of
features no longer on the board go there too. A `merged` feature whose branch or worktree could not
be removed stays on the board and is retried on the next run. The first run after an update moves
the features an existing board already has. To resume a closed feature, move its row and its log
lines from the archive back to the board by hand, set the state (e.g. `approve`) and reopen the PR.
An archived id passed to `/devflow:factory` is still recognised: merged and closed features get the
same answer as before, closed ones with how to resume them.

**Changing a feature with an open PR.** If something is missing after a feature is done, do not
open a new one: run `/devflow:factory <id> <change>` (for example `/devflow:factory 003 the link
must expire after 30 minutes`). The factory checks that the PR is still open, goes back to the
feature branch and syncs it with the remote (`git pull --ff-only`; the base branch is not merged
in), and asks only the questions the change needs. With just `<id>` it shows the PR state and link
and asks which change to make; an empty answer stops without changing anything. If the PR is
already merged or closed, it tells you the feature cannot be changed and suggests a new feature
with the same text.

The spec is updated only if the behaviour changes; in that case you approve it again (Approve,
Request changes or Reject). Rejecting restores the previous spec, the feature goes back to
`pr-open` and the PR is not touched. Then build, gate, review and approval run as usual, with
round numbers continuing after the ones already done and `max_rounds` counted again for each
change. The result goes to the same PR: new commits, updated title and description, and a comment
`Change <n>: <change>` that summarises the change. In git only mode the branch is pushed and you
update the PR by hand from `pr.md` and `change-<n>.md`.

**Token usage and budget.** For every devflow agent that finishes, the factory writes tokens, tool
uses and seconds to `factory/features/<id>/usage.md` (gitignored; the orchestrator session itself is
not counted). The PR body gets a line `Tokens: <run> (feature: <total>) · agent time: <duration>`
(the feature total only if it differs from the run). To cap a run, set `budget_tokens: 1000000` in
`factory/config.md` (empty, absent or `0` = no limit; a non-numeric value is ignored with a
warning). After each agent, or each parallel group, if the run is over the limit the feature goes
to `needs-human` with the note `budget exceeded: <total> / <limit> tokens · resume from <state>` and
a per-agent summary. A running agent is never interrupted. To continue, put the state back on the
board and re-run `/devflow:factory <id>`: you get another full budget starting from the tokens
already used. Each change starts a new run from zero; `usage.md` keeps the whole history.

**Worktrees and parallel sessions.** In worktree mode the spec approval creates
`../<repo>.worktrees/<id>` on the branch `<kind>/<id>`, runs `worktree_setup` there, and the build,
commits and reviews happen in it, so your checkout stays free. The worktree stays until the PR is
merged; the next run then removes it (never with `--force`: if it has local changes it is kept and
you are told). Each session runs its own feature against the shared board.

Every board write goes through `skills/factory/scripts/board.sh`, which takes a lock
(`factory/board.lock`), re-reads the board and writes it atomically, so two sessions never lose each
other's changes. New ids are reserved by creating the feature folder with `mkdir`, so two sessions
creating a feature at the same time get different numbers. If another session holds the board for
more than 10 seconds, the factory stops and names the lock file to check (delete it if no session is
writing); a lock left by an interrupted session for more than 30 seconds is removed automatically.
The script also moves finished features to the archive (`archive`), under the same lock. The
board format is unchanged and you can still edit the state cell by hand.

A session opened inside a git worktree of the repo (for example one created by Claude Desktop) uses
the board and the features of the main checkout, like every other session; a new feature gets an id
not used by the board, the branches or the existing worktrees. If that worktree already has its own
local `factory/` board with features the main board does not know, the factory lists them, explains
how to move them by hand and stops until you have. In branch mode the feature branch is created and
worked on in the folder of the session, recorded as `checkout: <folder>` under `## Workspace`, so a
resume from another session works in the right folder. After the merge, the cleanup removes that
worktree and its branch if it is clean and is neither the current session's folder nor the main
checkout; otherwise it keeps it and tells you in one line.

`/devflow:factory <id>` (or just `<NNN>`) resumes that feature. With no argument it resumes the
only active feature; with several it asks which one, or **New feature**; with none it starts the
first queued one in board order (`/devflow:plan` sets that order). Any other argument is a new
feature description. When something needs a human,
it stops and tells you which files to look at.

**Status and abandon.** `/devflow:factory status` reads only `factory/board.md`, and
`factory/archive.md` for the counts (no forge, git or board write), and shows the open features (id,
title, state, round, PR), a line `N merged, M closed` that includes the archived features, and the
next actions with the command to run: `needs-human` features with the reason from the log,
active ones to resume, open PRs, and the next queued feature (the first in board order).

`/devflow:factory <id> abandon [<reason>]` abandons a feature. The factory shows a plan (state, PR
to close, worktree and branch to remove or keep, and why) and asks for confirmation. Then it closes
the PR if it is open (the reason becomes a comment), sets the feature to `closed` with the note
`abandoned: <reason>`, and removes the worktree and the local branch only if nothing is lost: no
local changes and every commit on origin or on the base branch (never `--force`). The remote branch
stays, so the PR can be reopened. A `|` or line break in the reason becomes `/` or a space in the
board note (the PR comment keeps the original text), and the plan lists the git-ignored files that
removing the worktree will delete. After the cleanup the abandoned feature moves to the archive. A
`merged` feature is refused; on a `closed` one, archived or not, only the cleanup runs. With forge
`git` you close the PR by hand.

### 2b. Plan a big goal: `/devflow:plan [<goal>]`

For a goal too big for one feature (say "a notes app with login and sync"), `/devflow:plan` builds
a roadmap of milestones, each split into features that the factory runs one after the other. It
reads the project (config, playbook, rules, board, archive, code; never the forge issues), then
asks one question at a time until milestones and features are clear. It shows the whole roadmap
(for each milestone number, title, goal and done-when criterion; for each feature title and
description) and asks **Approve / Request changes / Reject**. Nothing is written before you approve.

After approval every new feature becomes a `queued` row on the board with its description in
`features/<id>/feature.md`, in the order of the roadmap, and `factory/roadmap.md` is saved. If the
main checkout is on the base branch with an empty stage, `plan` commits it
(`docs(plan): create roadmap` or `docs(plan): update roadmap`, only `factory/roadmap.md` and, if
needed, the `!factory/roadmap.md` line of `.gitignore`); it never pushes. Then run
`/devflow:factory` with no argument: it takes the first queued feature in board order.

Run `/devflow:plan` again to see the roadmap with the state of each feature (queued, in progress,
PR open, merged, closed) and of each milestone (done when it has a merged feature and the others
are merged or closed). You can add milestones and features, and remove or reorder those still
queued; started or finished features are never touched. The roadmap file holds no states: they come
from the board and the archive.

### 3. Follow the run: the flow pane

devflow ships a Claude Code mod (`hooks/`) that draws a side pane while the factory runs. It
observes the session and the files in `factory/`; it never writes the board. It also guards the
devflow agents (see **Guard** below). It is active in repos with a `factory/config.md`.

- **Phases**: a vertical line of the factory phases, each with its state and time.
- **Agents**: a live card for each devflow agent, coloured by model family, with its task,
  model · effort, the tool it is using and its elapsed time.
- **Reentry**: an arrow back to the build phase, with the reason: a failing gate (also in round 1,
  e.g. a red test or a commit hook) or a blocking review of the previous round. An escalated task
  shows on its implementer card as `implementer ← sonnet` (the model of the previous attempt).
- **Header**: current phase, active agents, round (of `max_rounds + 1`: the first round plus the rework rounds) and total time. In a change the
  round counts from the first round of the change; review and gate lines keep the file's round number.
  With a `usage.md` it adds a fifth metric, the tokens of the current run (`412k/1M` with a
  `budget_tokens` limit, `412k` without).
- **Tokens per phase**: a phase with no running agent shows the finished agents of the current run
  with their tokens (`spec-writer 38k · spec-checker 12k`) instead of its description.
- **Board summary**: when the session has no feature of its own (a new session that has not run
  `/devflow:factory` yet), or its feature is no longer in progress (pr-open, merged, needs-human,
  closed), the pane shows a summary of the board instead. Its last 3 merged features include the
  archived ones.
- **Reload and resume**: the pane survives `/reload-plugins` and `claude --resume`. The session's
  feature, phase times and running agents are rebuilt from the board, the feature files and the
  state the mod keeps for the session. After a resume, or when the factory stops (Esc, error, end
  of turn), the pane keeps showing the flow of the session's feature, with no running agents, while
  it is in progress (interview to approve). Agents that no longer run are shown as ended without
  success. Reloading sends no new toasts or notifications.
- **Guard**: while the factory runs, the mod refuses the calls of devflow agents that break their
  constraints, so they no longer rest on the prompts alone. A reviewer (`review-*`), the approver and
  the spec-checker write only their own result file (`reviews/r<N>-<x>.md`, `decision.md`,
  `spec-check.md`); the spec-writer only `spec.md` and `playbook.md` of its feature; the implementer
  nothing under `factory/`. No agent writes `factory/board.md`, `factory/archive.md` the project `factory/playbook.md` or
  `factory/rules/`, runs `git push`, `--force`, `--no-verify` or `git reset --hard`. The read-only agents cannot change
  git state (commit, add, checkout, stash...) or modify files from the shell (redirects, `rm`, `mv`,
  `sed -i`, PowerShell equivalents). Commands run inside another command (`bash -c`, `pwsh -Command`,
  `cmd /c`, `$(...)`) are checked too; quoted text, such as a commit message, is not:
  `git commit -m "docs: explain git push"` passes. A command longer than 64 KB, or nested too deeply
  to be checked to the end, is refused with a request to split or simplify it. A refused call is
  not run: the agent gets the reason in the pane language and can take another way, and its card shows `⊘ N blocked`. The guard covers the common
  mistakes, not every possible shell write. It fails open: the main loop, agents of other plugins,
  unknown agents and sessions without a factory are never touched, nor is any call if the guard
  itself fails.
- **Your turn**: a toast when the factory needs you (a system notification too, from the terminal only; the desktop app's own banners cover questions and turn ends while the app is in the background): each interview
  question (as a choice or in plain text), a spec to approve, rule proposals, needs-human, and when
  the PR is opened.

The pane opens by itself on the first `/devflow:factory` of a session; `/devflow-panel` opens and
closes it at any time. It follows only the current session, and in it only the feature that session runs
(from the `/devflow:factory` argument, or the first row the session changes), so parallel sessions
each show their own feature. The desktop app draws it as an animated
SVG image (animations stay in phase across the per-second redraws), the terminal gets a text version. Colours follow the light or dark theme.

The pane language is the plugin option `language`: `auto` (default, follows the Claude Code
`language` setting, then `LANG`; English otherwise), `it` or `en`.

## Files in your repo

```
factory/
├── config.md          commands, forge, release, workspace, ui_review... (committed)
├── playbook.md        project rules + Definition of Done                (committed)
├── backlog.md         deferred logic queued on the board                (committed)
├── rules/<id>.md      approved rules until their PR merges              (committed)
├── roadmap.md         milestones and features written by /devflow:plan  (committed)
├── board.md           one row per live feature + log                    (gitignored)
├── archive.md         merged and closed features moved out of the board (gitignored)
└── features/<id>/     playbook, spec, gate output, reviews, PR text     (gitignored)
.devflow/              release scripts, only with automatic releases      (committed)
```

## Automatic releases

On GitHub and GitLab, `/devflow:init` can install a CI job (step **Release**) that turns every pull
request merged into the base branch into a release: tag `vX.Y.Z` and an entry on the Releases page
with the PR title. The version comes from the title: `feat` → minor, `!` or `BREAKING CHANGE` →
major (minor while `0.x`), anything else → patch. The job only calls the API (no commits), so a
protected base branch is fine; on GitLab the job token is enough.

- GitHub: `.github/workflows/devflow-release.yml`, needs `contents: write` (granted in the file).
- GitLab: `.devflow/gitlab-release.yml`, included from `.gitlab-ci.yml`. MRs must be merged with a
  merge commit (title and number are read from it). If the runner cannot pull `alpine`, set the
  CI/CD variable `DEVFLOW_RELEASE_IMAGE` to an image with bash, git and curl. The job runs even
  when another job of the pipeline fails. After the first release job, run the
  `process_mode=oldest_first` command init shows you, so queued releases follow merge order.
- Two merges close together get two releases in commit order; re-running a job does nothing.
- After a plugin update, re-run `/devflow:init` → **Release** to refresh the files.

## Developing devflow

The mod types are committed in `.claude-plugin/types/`, so a clean clone passes the type check
(`npx -y -p typescript tsc -p .`) without an interactive session. `claude plugin validate .` and
`claude plugin test .` also work from a clean clone.

Regenerate the types after a Claude Code update: the first line of
`.claude-plugin/types/claude-code/index.d.ts` reports the version that wrote them. Run:

```bash
claude --plugin-dir <repo>
```

wait until the mod has loaded, then exit. Where you cannot pass the flag, set
`CLAUDE_CODE_PLUGIN_DIRS=<repo>` instead. `claude -p` and the plugin installed from a marketplace do
not write the types. Then commit the changed files; the folder has its own `.gitignore` (`*`) written
by Claude Code, so add any new file with `git add -f`. The CI installs the Claude Code version
written on that first line, so types and CLI always change together.

### Pull request checks

`.github/workflows/ci.yml` runs on every pull request into `main` or `develop`, and again when the
PR is edited:

- `checks` installs the Claude Code version written in the types, fails if `claude --version`
  differs, then runs the type check, `claude plugin validate .`, `claude plugin test .` and the
  `test-*.sh` scripts. Each runs in its own step, so one failure does not hide the others.
- `pr-title` (only for PRs into `main`) checks that the title is `type(scope)!: subject` with a
  standard type (`feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`, `perf`, `build`, `style`,
  `revert`), because the release version depends on it. Fix a wrong title by editing it on GitHub:
  the check runs again.

The checks use no secrets. They only report: to block the merge, make them required on `main`.
In GitHub go to Settings → Rules → Rulesets (or Branches → add a rule for `main`), enable "Require
status checks to pass" and add `checks` and `pr-title`.

### Skill evals

`evals/` holds seven cases for `claude plugin eval`. Each one builds a small example repo with its
`scaffold.sh`, opens a real Claude session on it with the plugin and checks the result:

- `init-vue-pnpm`: a Vue repo with pnpm gets the `pnpm` commands and no stack interview.
- `init-go`: a Go repo gets the `go build`, `go vet` and `go test` commands.
- `init-unknown-stack`: a Lua repo is named and init asks for the commands instead of guessing.
- `init-empty-repo`: an empty repo starts the stack interview and gets no commands.
- `factory-pr-open-merged`: a `pr-open` change already merged on the remote is cleaned up and set to
  `merged`.
- `factory-resume-interview`: a feature in `interview` asks one new question, not the answered ones.
- `spec-checker-known-gap`: a spec with a known gap gets the verdict `GAPS` on `T1`.

The evals use real sessions, so they cost tokens and need your Claude credentials: run them only
locally, never in CI, and run them before you change `init`, `factory` or `spec-checker`. On Linux,
macOS or WSL2 run all of them:

```bash
claude plugin eval . --scaffold --ablation none --no-publish --allow-tools Bash,Write,Edit
```

The cases tagged `shell` (all but the spec-checker one) need Bash. On native Windows Bash is
refused without a sandbox, so run only the `no-shell` case (`--allow-tools` takes a list, so put
`--tag` before it):

```bash
claude plugin eval . --scaffold --ablation none --no-publish --tag no-shell --allow-tools Write,Edit
```

Add `--runs 3` for a stricter check (each case runs once by default). Results go to
`evals/results/`, which git ignores. `--no-publish` keeps the HTML report local: without it the
report is published to claude.ai.

## devflow's own versions

Every pull request merged into this repo is released automatically: the version in
`.claude-plugin/plugin.json` is bumped from the PR title, an entry is added to
[`CHANGELOG.md`](CHANGELOG.md), and a tag and GitHub Release are created. PR titles must follow
Conventional Commits. `/plugin` updates the installed plugin when the version changes.

### Testing a change before it is released

Unreleased work is tested from the `develop` branch, which only receives merges of feature
branches: nothing is committed on it directly, and it is never merged into `main` (each feature
reaches `main` through its own pull request). On `develop` the marketplace is named `devflow-dev`,
so it can sit next to the released `devflow` marketplace.

Once, in the repo where you test, declare the marketplace and install the plugin in project
scope (the declaration goes to `.claude/settings.json`, which this repo ignores):

```bash
claude plugin marketplace add "federicoxella-space/devflow#develop" --scope project
claude plugin install devflow@devflow-dev --scope project
```

For every change you want to try:

1. Bump the version in `.claude-plugin/plugin.json` on the feature branch and commit it. Use the
   bump the PR title will ask for (`feat` → minor, anything else → patch); further changes to the
   same unreleased feature only bump the patch. Without a new version the update below finds
   nothing to do.
2. Merge the feature branch into `develop` and push the merge.
3. Refresh your local copy of the marketplace: `plugin update` compares against that copy, not
   against GitHub.

   ```bash
   claude plugin marketplace update devflow-dev
   ```

4. Update the plugin in the scope it is installed in, then restart the session:

   ```bash
   claude plugin update devflow@devflow-dev --scope project
   ```

`plugin update` never moves to a lower version: after lowering one, reinstall with
`claude plugin uninstall devflow@devflow-dev --scope project` and the install command above.

Before opening the pull request, set the version back to the released one (the last tag): the
test bumps never reach `main`, and the release workflow computes the new version from the PR title.

### Updating Playwright MCP

The Playwright MCP version is pinned in `.mcp.json` and does not follow `latest`, so a new upstream
release never changes the browser reviews by itself. To update it:

1. Change the exact version in `.mcp.json` (never `latest` or a range).
2. Check that every `browser_*` tool listed in `tools` of `agents/review-ui.md` and
   `agents/review-ux.md` still exists in the new version; update the agents if a name changed.
3. Update the version cited in the requirements at the top of this README.

## More

How the loop, the agents and their contracts work: [`vault/Software factory.md`](vault/Software%20factory.md).
