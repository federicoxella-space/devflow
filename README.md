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
  An existing project with an unknown stack is asked for its commands, never scaffolded.
- **Empty repo**: interviews you one question at a time (what you are building, constraints,
  preferences), recommends a stack for you to approve, and queues a feature that scaffolds the
  project.
- Detects the **forge** from the `origin` remote (GitHub, GitLab, Azure DevOps); for a company
  instance it asks the platform and its host. Any other platform works in **git only** mode.
- Asks where new features run (`workspace`: **Ask**, **Branch** or **Worktree**) and proposes
  `worktree_setup`, the command that prepares a new worktree (e.g. `npm ci`).
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
   and whether it is a `feature/` or a `hotfix/` branch.
3. **Build**: independent tasks are implemented in parallel by one agent, the implementer, on
   sonnet (`implementer_model` in `config.md`, default `sonnet / medium`). If an implementer stops
   for a missing design decision, the spec-writer completes the spec and the work resumes. If it
   cannot get build, lint and tests green, if the gate fails twice in the same round, or if a
   reviewer flags the same blocking item again, the task goes to a new implementer on opus
   (`escalation_model`, default `opus / medium`) with a handover of the previous attempt; if that
   fails too, the factory stops and asks you. `complex` tasks (security-sensitive, concurrent,
   destructive migrations) start directly on opus. Then build, lint and tests must pass. The factory refuses to commit secrets,
   `.env` files, build output or large unowned binaries; the changes are committed as
   Conventional Commits, one commit per task.
4. **Reviews**: code (opus), security, UX and UI reviewers run in parallel; blocking findings go back to
   the implementers.
5. **Approval**: the approver checks evidence for every checklist item.
6. **Rule proposals**: conventions the agents discovered are shown in a single list, each with the
   reason it came up, and you approve them in one answer (`1,3`, `all`, `none`, or `2: new text` to
   rewrite one). Conflicting rules are asked before the list, rules that depend on another after
   it. Approved ones are added to the project playbook.
7. **Pull request** on the configured forge (merge request on GitLab), titled in Conventional
   Commits format (`feat(scope): ...`), so a squash merge leaves a conventional commit on the base
   branch. In git only mode the branch is pushed and the title and description are in
   `factory/features/<id>/pr.md` for you to open the PR by hand.

You review and merge the PR. On the next run the factory checks the open PRs: merged ones become
`merged`, their local branch is deleted and the base branch is updated; PRs closed without merge
become `closed` and keep their branch. In git only mode merges are detected from git (merge
commit, fast-forward, rebase, squash); a squash merge with resolved conflicts is not detected, so
you set that row to `merged` on the board by hand.

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

**Worktrees and parallel sessions.** In worktree mode the spec approval creates
`../<repo>.worktrees/<id>` on the branch `<kind>/<id>`, runs `worktree_setup` there, and the build,
commits and reviews happen in it, so your checkout stays free. The worktree stays until the PR is
merged; the next run then removes it (never with `--force`: if it has local changes it is kept and
you are told). Each session runs its own feature against the shared board.

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
oldest queued one. Any other argument is a new feature description. When something needs a human,
it stops and tells you which files to look at.

### 3. Follow the run: the flow pane

devflow ships a Claude Code mod (`hooks/`) that draws a side pane while the factory runs. It only
observes the session and the files in `factory/`; it never writes the board. It is active in repos
with a `factory/config.md`.

- **Phases**: a vertical line of the factory phases, each with its state and time.
- **Agents**: a live card for each devflow agent, coloured by model family, with its task,
  model · effort, the tool it is using and its elapsed time.
- **Reentry**: an arrow back to the build phase, with the reason: a failing gate (also in round 1,
  e.g. a red test or a commit hook) or a blocking review of the previous round. An escalated task
  shows on its implementer card as `implementer ← sonnet` (the model of the previous attempt).
- **Header**: current phase, active agents, round (of `max_rounds + 1`: the first round plus the rework rounds) and total time. In a change the
  round counts from the first round of the change; review and gate lines keep the file's round number.
- **Board summary**: when the session has no feature of its own (a new session that has not run
  `/devflow:factory` yet), or its feature is no longer in progress (pr-open, merged, needs-human,
  closed), the pane shows a summary of the board instead.
- **Reload and resume**: the pane survives `/reload-plugins` and `claude --resume`. The session's
  feature, phase times and running agents are rebuilt from the board, the feature files and the
  state the mod keeps for the session. After a resume, or when the factory stops (Esc, error, end
  of turn), the pane keeps showing the flow of the session's feature, with no running agents, while
  it is in progress (interview to approve). Agents that no longer run are shown as ended without
  success. Reloading sends no new toasts or notifications.
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
├── board.md           one row per feature + log                         (gitignored)
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
